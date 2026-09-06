const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function timestamp(value) {
  const date = value?.toDate ? value.toDate() : new Date(value?.seconds != null ? value.seconds*1000 : value || '');
  return Number.isFinite(date.getTime()) ? date.getTime() : 0;
}
export function buildBellNotifications({actions=[],signups=[],messages=[]}={}) {
  const items=[];
  for(const entry of actions.filter(entry=>entry && entry.id != null)) {
    const ticket=entry.action==='ticket_redirect_continue' && entry.actionSubtype!=='auto' || entry.action==='click' && (/ticket/i.test(`${entry.section || ''} ${entry.label || ''}`) || entry.section==='Shows');
    if(ticket) items.push({id:`action:${entry.id}`,recordId:String(entry.id),title:'Ticket link clicked',body:String(entry.label || 'A visitor opened a ticket link.').slice(0,240),time:timestamp(entry.timestamp),page:'analytics'});
  }
  for(const entry of signups.filter(entry=>entry && entry.id != null)) if(!entry.unsubscribed) items.push({id:`signup:${entry.id}`,recordId:String(entry.id),title:'Mailing-list signup',body:String(entry.email || 'A new subscriber joined.'),time:timestamp(entry.createdAt || entry.updatedAt),page:'subscribers'});
  for(const entry of messages.filter(entry=>entry && entry.id != null)) items.push({id:`email:${entry.id}`,recordId:String(entry.id),title:'Incoming email',body:String(entry.subject || '(No subject)').slice(0,240),time:timestamp(entry.date),page:'email'});
  return [...new Map(items.filter(item=>item.time && !item.id.endsWith(':undefined')).map(item=>[item.id,item])).values()].sort((a,b)=>b.time-a.time || a.id.localeCompare(b.id)).slice(0,50);
}

export function setupNotificationBell({db,collection,doc,query,orderBy,limit,onSnapshot,onOpen}) {
  const host=document.createElement('div');host.className='admin-notifications';
  host.innerHTML=`<button type="button" id="notification-bell" class="btn ghost-button" aria-label="Notifications" aria-expanded="false" aria-controls="notification-panel"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span id="notification-badge" hidden></span></button><section id="notification-panel" aria-labelledby="notification-heading" hidden><div class="notification-header"><h2 id="notification-heading">Notifications</h2><button type="button" id="notification-close" aria-label="Close notifications">×</button></div><div class="notification-actions"><span>Recent activity</span><button type="button" id="notification-read-all">Mark all read</button></div><p id="notification-status" role="status"></p><div id="notification-list"></div><p class="notification-footnote">Latest 50 items from recent site activity and the synced inbox. Read status stays in this browser.</p></section>`;
  document.getElementById('refresh-data').after(host);
  const bell=host.querySelector('#notification-bell'),panel=host.querySelector('#notification-panel'),badge=host.querySelector('#notification-badge'),list=host.querySelector('#notification-list'),status=host.querySelector('#notification-status'),readAll=host.querySelector('#notification-read-all');
  let userId='',generation=0,stops=[],read=new Set(),data={},items=[],failures=new Set(),pending=new Set();
  const storageKey=()=>`hae-notification-read:${userId}`;
  function close(focus=false){panel.hidden=true;bell.setAttribute('aria-expanded','false');if(focus)bell.focus();}
  function saveRead(){try{localStorage.setItem(storageKey(),JSON.stringify([...read].slice(-500)));return true;}catch{status.textContent='Read status could not be saved in this browser.';return false;}}
  function render(){
    items=buildBellNotifications(data);const unread=items.filter(item=>!read.has(item.id)).length;
    badge.hidden=!unread;badge.textContent=unread>99?'99+':String(unread);bell.setAttribute('aria-label',unread?`Notifications, ${unread} unread`:'Notifications, no unread items');
    readAll.disabled=!unread;
    status.textContent=failures.size?`Some activity could not load (${[...failures].join(', ')}). Reopen notifications to retry.`:pending.size?'Loading recent activity…':'';
    list.innerHTML=items.length?items.map(item=>`<button type="button" class="notification-item ${read.has(item.id)?'':'is-unread'}" data-notification-id="${escape(item.id)}"><span class="notification-item-title">${escape(item.title)}${read.has(item.id)?'':'<span class="notification-unread-dot" aria-label="Unread"></span>'}</span><span class="notification-item-body">${escape(item.body)}</span><time datetime="${new Date(item.time).toISOString()}">${escape(new Date(item.time).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))}</time></button>`).join(''):!pending.size?'<p class="notification-empty">No recent notifications.</p>':'';
    list.querySelectorAll('[data-notification-id]').forEach(button=>button.addEventListener('click',()=>{
      const item=items.find(item=>item.id===button.dataset.notificationId);if(!item)return;
      read.add(item.id);render();saveRead();close();onOpen(item);
    }));
  }
  function stop(){generation++;stops.forEach(stop=>stop());stops=[];userId='';data={};items=[];read=new Set();failures.clear();pending.clear();close();render();bell.disabled=true;}
  function start(uid){
    if(uid===userId && stops.length)return;
    stop();if(!uid)return;userId=uid;bell.disabled=false;
    try{const saved=JSON.parse(localStorage.getItem(storageKey()) || '[]');if(Array.isArray(saved))read=new Set(saved.filter(id=>typeof id==='string').slice(-500));}catch{}
    const current=generation;
    const feeds=[
      ['actions',query(collection(db,'site-actions'),orderBy('timestamp','desc'),limit(100))],
      ['signups',query(collection(db,'mailing-list-signups'),orderBy('createdAt','desc'),limit(25))],
      ['messages',doc(db,'admin-email-cache','inbox')]
    ];
    pending=new Set(feeds.map(([name])=>name));render();
    for(const [name,ref] of feeds) {
      const fail=()=>{if(current!==generation)return;pending.delete(name);failures.add(name);render();};
      try {stops.push(onSnapshot(ref,snapshot=>{
        if(current!==generation)return;
        data[name]=name==='messages'?(snapshot.data()?.messages || []):snapshot.docs.map(item=>({...item.data(),id:item.id}));
        if(!Array.isArray(data[name]))data[name]=[];
        pending.delete(name);failures.delete(name);render();
      },fail));}catch{fail();}
    }
  }
  bell.addEventListener('click',()=>{const opening=panel.hidden;if(opening&&failures.size){const uid=userId;stop();start(uid);}panel.hidden=!opening;bell.setAttribute('aria-expanded',String(opening));if(opening){const account=document.querySelector('.admin-account');if(account)account.open=false;host.querySelector('#notification-close').focus();}});
  host.querySelector('#notification-close').addEventListener('click',()=>close(true));
  readAll.addEventListener('click',()=>{items.forEach(item=>read.add(item.id));render();saveRead();});
  document.addEventListener('click',event=>{if(!host.contains(event.target))close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){event.preventDefault();close(true);}});
  document.addEventListener('hae-admin-account-changing',stop);
  stop();return {start,stop,showError(message){panel.hidden=false;bell.setAttribute('aria-expanded','true');status.textContent=message;host.querySelector('#notification-close').focus();}};
}

// Let the destination finish loading and paint before opening a modal over it.
export async function waitForNotificationPage(load, isCurrent, paint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))) {
  await load;
  if (!isCurrent()) return false;
  await paint();
  return isCurrent();
}
