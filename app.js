// 單頁版前端邏輯（已移除 QR Code 功能）
const state = { config:null, events:[], attendance:[], trainings:[], experiences:[] };
function $(id){ return document.getElementById(id); }

async function loadConfig(){
  const ver = 'v=7'; // 每次出新版本就改這個數字
  const r1 = await fetch('config.json?' + ver).catch(()=>null);
  if(r1 && r1.ok) return r1.json();
  const r2 = await fetch('config.sample.json?' + ver);
  return r2.json();
}

/* 行事曆 */
function renderCalendar(){
  const div = $('calendar-embed');
  const cfg = state.config || {};
  if(cfg.calendarEmbed){
    div.innerHTML = `<iframe src="${cfg.calendarEmbed}" class="w-full h-full" frameborder="0"></iframe>`;
  }else{
    div.innerHTML = `<div class="w-full h-full flex items-center justify-center text-slate-500 text-sm">（可選）config.json 設定 calendarEmbed 可嵌入日曆</div>`;
  }
}

/* 時間處理：相容 iOS Safari */
function parseStart(s){
  if(!s) return null;
  let t = String(s).trim();

  // 統一格式
  if (t.includes('T')) t = t.replace('T',' ');
  t = t.replace(/\//g,'-');

  // yyyy-mm-dd hh:mm
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/.exec(t);
  if (!m) {
    const dIso = new Date(s); // 最後嘗試 ISO 格式
    return isNaN(dIso.getTime()) ? null : dIso;
  }
  const y = parseInt(m[1],10);
  const mo = Math.max(1, Math.min(12, parseInt(m[2],10))) - 1;
  const d = parseInt(m[3],10);
  const hh = m[4] ? parseInt(m[4],10) : 0;
  const mm = m[5] ? parseInt(m[5],10) : 0;

  // 以本地時間建立，避免被當成 UTC
  return new Date(y, mo, d, hh, mm, 0, 0);
}
function fmt(d){ const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}/${p(d.getMonth()+1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; }

/* 活動卡片（無 QR 按鈕） */
function renderEvents(){
  const list = $('event-list'); list.innerHTML='';
  if(!state.events.length){ $('no-events').classList.remove('hidden'); return; }
  $('no-events').classList.add('hidden');

  state.events.slice().sort((a,b)=> parseStart(a.start)-parseStart(b.start)).forEach(ev=>{
    const count = state.attendance.filter(x=>x.event_id===ev.id && (x.status||'').toLowerCase()!=='rejected').length;
    const card = document.createElement('div'); card.className='card';
    card.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-sm text-slate-500">${fmt(parseStart(ev.start))}</div>
          <h3 class="text-lg font-semibold">${ev.title}</h3>
          <p class="text-sm text-slate-600 mt-1">${ev.desc||''}</p>
          ${ev.location?`<div class="text-sm mt-1">📍 ${ev.location}</div>`:''}
          ${ev.album?`<a class="text-blue-600 text-sm hover:underline" href="${ev.album}" target="_blank" rel="noopener">📷 相簿</a>`:''}
        </div>
        <div class="text-right">
          <div class="chip">已登記：${count} 人</div>
          <div class="flex gap-2 justify-end mt-2">
            <button class="btn btn-primary" data-join="${ev.id}" data-title="${ev.title}">我要報名</button>
          </div>
        </div>
      </div>`;
    list.appendChild(card);
  });

  list.querySelectorAll('[data-join]').forEach(b=> b.addEventListener('click', ()=> openJoin(b.dataset.join, b.dataset.title)));
}

/* 統計 */
function renderStats(){
  const now=new Date(); const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const monthly = state.attendance.filter(a=> (a.timestamp||'').startsWith(ym) && (a.status||'')!=='rejected');
  const byName={}; monthly.forEach(a=>{ const key=`${a.name}（${a.division||'未填分隊'}）`; byName[key]=(byName[key]||0)+1; });
  const top = Object.entries(byName).sort((a,b)=> b[1]-a[1]).slice(0,10);
  $('top-attendees').innerHTML = top.map(([n,c])=> `<li>${n} – ${c} 次</li>`).join('') || '<li>本月尚無出勤資料</li>';

  const per={}; state.attendance.forEach(a=>{ if((a.status||'')==='rejected') return; per[a.event_id]=(per[a.event_id]||0)+1; });
  const rows = state.events.map(e=>({title:e.title, date:fmt(parseStart(e.start)), count:per[e.id]||0}));
  $('per-event-counts').innerHTML = rows.map(r=> `<li>${r.date}｜${r.title}：${r.count} 人</li>`).join('') || '<li>尚無資料</li>';
}

/* 相簿 */
function renderGallery(){
  const wrap=$('album-list'); wrap.innerHTML='';
  const albums=state.events.filter(e=> !!e.album);
  if(!albums.length){ wrap.innerHTML='<div class="text-sm text-slate-500">尚未設定相簿連結。</div>'; return; }
  albums.forEach(e=>{
    const a=document.createElement('a'); a.href=e.album; a.target='_blank'; a.rel='noopener';
    a.className='block rounded-xl overflow-hidden bg-white shadow hover:shadow-lg transition';
    a.innerHTML = `<div class="aspect-video bg-gray-100 flex items-center justify-center text-slate-400">相簿</div>
                   <div class="p-3 text-sm"><div class="font-medium">${e.title}</div>
                   <div class="text-slate-500">${parseStart(e.start).toLocaleDateString()}</div></div>`;
    wrap.appendChild(a);
  });
}

/* 報名 Modal */
function openJoin(id, title){
  $('join-event-title').textContent = title;
  $('jf-event-id').value = id;
  $('jf-name').value = '';
  const sel=$('jf-division'); sel.innerHTML='';
  (state.config.divisions||['未填']).forEach(d=>{ const opt=document.createElement('option'); opt.value=d; opt.textContent=d; sel.appendChild(opt); });
  $('jf-confirm').checked=false; $('jf-result').textContent='';
  $('join-modal').classList.remove('hidden'); $('join-modal').classList.add('flex');
}
function closeJoin(){ $('join-modal').classList.add('hidden'); $('join-modal').classList.remove('flex'); }
$('jf-cancel').addEventListener('click', closeJoin);

/* 送出報名（不帶 Content-Type，避免手機 CORS 預檢） */
$('join-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const eventId = $('jf-event-id').value;
  const name    = $('jf-name').value.trim();
  const division= $('jf-division').value;
  if(!name || !$('jf-confirm').checked) return;

  const payload = { action:'join', event_id:eventId, name, division };
  $('jf-result').textContent='送出中...';

  try{
    const res  = await fetch(state.config.apiBase, { method:'POST', body: JSON.stringify(payload) });
    const out  = await res.json();

    if(out.status==='ok'){
      // ① 先在前端「本地」把這筆加進去（立刻改變畫面）
      const now = new Date();
      const pad = n=>String(n).padStart(2,'0');
      const ts  = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      state.attendance.push({
        id: 'local-'+Math.random().toString(36).slice(2),   // 臨時 id
        timestamp: ts,
        name, division,
        event_id: eventId,
        status: 'pending'
      });

      // ② 重新渲染（不用等後端）
      renderEvents();
      renderStats();
      $('jf-result').textContent='登記成功！';
      closeJoin();

      // ③ 背景再跟後端同步一次（等表單寫入完成，保險）
      setTimeout(async ()=>{
        try{
          await bootstrap(); // 重新抓一次正式資料
        }catch(e){}
      }, 1200);
    }else{
      $('jf-result').textContent='失敗：'+(out.message||'請稍後再試');
    }
  }catch{
    $('jf-result').textContent='連線失敗';
  }
});

/* 文章：顯示與投稿（同樣移除 Content-Type） */
function renderPosts(){
  const tWrap=$('training-list'), eWrap=$('exp-list'); tWrap.innerHTML=''; eWrap.innerHTML='';
  const t=(state.trainings||[]).filter(p=> (p.status||'confirmed')==='confirmed');
  const e=(state.experiences||[]).filter(p=> (p.status||'confirmed')==='confirmed');
  if(t.length){ $('training-empty').classList.add('hidden'); t.slice().reverse().forEach(p=> tWrap.appendChild(postCard(p))); }
  else $('training-empty').classList.remove('hidden');
  if(e.length){ $('exp-empty').classList.add('hidden'); e.slice().reverse().forEach(p=> eWrap.appendChild(postCard(p))); }
  else $('exp-empty').classList.remove('hidden');
}
function postCard(p){
  const d=document.createElement('div'); d.className='card';
  d.innerHTML = `<div class="flex gap-3">
    ${p.image_url? `<img src="${p.image_url}" class="w-32 h-24 object-cover rounded-lg" loading="lazy">`:''}
    <div><div class="text-sm text-slate-500">${(p.created_at||'').replace('T',' ')}</div>
      <h3 class="font-semibold">${p.title}</h3>
      <p class="text-sm text-slate-700 whitespace-pre-wrap mt-1">${p.content||''}</p>
      ${p.author? `<div class="text-xs text-slate-500 mt-1">分享者：${p.author}</div>`:''}
    </div></div>`;
  return d;
}
let postKind='training';
document.getElementById('btn-add-training').addEventListener('click', ()=> openPost('training'));
document.getElementById('btn-add-exp').addEventListener('click', ()=> openPost('experience'));
function openPost(kind){
  postKind=kind; document.getElementById('post-title')?.remove();
  $('pf-title').value=''; $('pf-content').value=''; $('pf-image').value=''; $('pf-result').textContent='';
  document.getElementById('post-modal')?.classList.remove('hidden'); document.getElementById('post-modal')?.classList.add('flex');
}
document.getElementById('pf-cancel')?.addEventListener('click', ()=>{ document.getElementById('post-modal')?.classList.add('hidden'); document.getElementById('post-modal')?.classList.remove('flex'); });
document.getElementById('post-form')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const payload={ action: postKind==='training'?'post_training':'post_experience',
                  title:$('pf-title').value.trim(), content:$('pf-content').value.trim(), image_url:$('pf-image').value.trim() };
  if(!payload.title || !payload.content) return;
  $('pf-result').textContent='送出中...';
  try{
    const r=await fetch(state.config.apiBase,{method:'POST', body: JSON.stringify(payload)});
    const out=await r.json();
    if(out.status==='ok'){ $('pf-result').textContent='已送出（待審核）！'; await bootstrap(); document.getElementById('post-modal')?.classList.add('hidden'); document.getElementById('post-modal')?.classList.remove('flex'); }
    else $('pf-result').textContent='失敗：'+(out.message||'請稍後再試');
  }catch{ $('pf-result').textContent='連線失敗'; }
});

/* 管理（審核），同樣移除 Content-Type */
document.getElementById('btn-load-pending').addEventListener('click', async ()=>{
  const pin = $('admin-pin').value.trim() || state.config.adminPin || '';
  const res = await fetch(`${state.config.apiBase}?action=bootstrap`); const data = await res.json();

  const pendingAtt = (data.attendance||[]).filter(a=> (a.status||'pending')==='pending');
  const pendingPosts = [
    ...(data.trainings||[]).map(p=>({...p, _kind:'training'})),
    ...(data.experiences||[]).map(p=>({...p, _kind:'experience'}))
  ].filter(p=> (p.status||'pending')==='pending');

  const list=$('pending-list'); list.innerHTML='';
  if(!pendingAtt.length) list.innerHTML='<div class="text-sm text-slate-500">沒有出席待確認</div>';
  pendingAtt.forEach(a=>{
    const row=document.createElement('div'); row.className='card';
    row.innerHTML = `<div class="flex items-center justify-between">
      <div class="text-sm">${(a.timestamp||'').replace('T',' ')}｜${a.name}（${a.division||'未填'}）→ 活動：${a.event_id}</div>
      <div class="flex gap-2">
        <button class="btn" data-type="att" data-act="ok"  data-id="${a.id}" data-pin="${pin}">確認</button>
        <button class="btn" data-type="att" data-act="rej" data-id="${a.id}" data-pin="${pin}">退回</button>
      </div></div>`;
    list.appendChild(row);
  });

  const posts=$('pending-posts'); posts.innerHTML='';
  if(!pendingPosts.length) posts.innerHTML='<div class="text-sm text-slate-500">沒有文章待審核</div>';
  pendingPosts.forEach(p=>{
    const row=document.createElement('div'); row.className='card';
    row.innerHTML = `<div class="flex items-center justify-between gap-3">
      <div class="text-sm"><div>${p._kind==='training'?'[教育訓練]':'[協勤經歷]'} ${p.title}</div>
      <div class="text-slate-500 truncate">${p.content||''}</div></div>
      <div class="flex gap-2">
        <button class="btn" data-type="post" data-kind="${p._kind}" data-act="ok"  data-id="${p.id}" data-pin="${pin}">核准</button>
        <button class="btn" data-type="post" data-kind="${p._kind}" data-act="rej" data-id="${p.id}" data-pin="${pin}">退回</button>
      </div></div>`;
    posts.appendChild(row);
  });

  document.querySelectorAll('button[data-type="att"]').forEach(b=> b.addEventListener('click', async ()=>{
    const payload={ action:'confirm_attendance', id:b.dataset.id, status: b.dataset.act==='ok'?'confirmed':'rejected', token:b.dataset.pin };
    const r=await fetch(state.config.apiBase,{method:'POST', body: JSON.stringify(payload)});
    const out=await r.json(); if(out.status==='ok'){ await bootstrap(); b.closest('.card').remove(); } else alert(out.message||'操作失敗');
  }));
  document.querySelectorAll('button[data-type="post"]').forEach(b=> b.addEventListener('click', async ()=>{
    const payload={ action:'confirm_post', kind:b.dataset.kind, id:b.dataset.id, status: b.dataset.act==='ok'?'confirmed':'rejected', token:b.dataset.pin };
    const r=await fetch(state.config.apiBase,{method:'POST', body: JSON.stringify(payload)});
    const out=await r.json(); if(out.status==='ok'){ await bootstrap(); b.closest('.card').remove(); } else alert(out.message||'操作失敗');
  }));
});

/* 一次載入 */
async function bootstrap(){
  const res=await fetch(`${state.config.apiBase}?action=bootstrap`);
  const data=await res.json();
  state.events=data.events||[]; state.attendance=data.attendance||[];
  state.trainings=data.trainings||[]; state.experiences=data.experiences||[];
  renderCalendar(); renderEvents(); renderStats(); renderGallery(); renderPosts(); handleScanParam();
}

/* 若網址帶 ?event=ID，自動打開報名（仍保留，僅移除 QRCode 產生） */
function handleScanParam(){
  const p=new URLSearchParams(location.search); const eid=p.get('event');
  if(eid){ const ev=state.events.find(e=>e.id===eid); if(ev) openJoin(eid, ev.title); }
}

(async function(){
  $('year').textContent = new Date().getFullYear();
  state.config = await loadConfig();
  await bootstrap();
})();
