const metrics = { views: 'Page views', clicks: 'Link clicks', tickets: 'Ticket clicks', signups: 'Signup actions' };
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function analyticsDate(value) {
  if (value == null || value === '') return null;
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(typeof value === 'object' && !(value instanceof Date) ? (value.seconds ?? value._seconds) * 1000 : value);
  return Number.isFinite(date.getTime()) ? date : null;
}
const dayNumber = date => Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
const dayLabel = day => new Date(day * 86400000).toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric', timeZone:'UTC'});
export function eventMetrics(entry) {
  const manualRedirect = entry.action === 'ticket_redirect_continue' && entry.actionSubtype !== 'auto';
  return {
    views: entry.action === 'page_view',
    clicks: entry.action === 'click' || manualRedirect,
    tickets: manualRedirect || (entry.action === 'click' && (/ticket/i.test(`${entry.section || ''} ${entry.label || ''}`) || entry.section === 'Shows')),
    signups: entry.action === 'email_signup'
  };
}
export function sourceName(entry) {
  if (entry.source) return String(entry.source);
  if (entry.referrer) { try { return new URL(entry.referrer).hostname; } catch { return 'Unknown referrer'; } }
  return 'Direct / unrecorded';
}
export function matchesAnalyticsSource(entry, source) {
  return !source || sourceName(entry).toLowerCase() === source.toLowerCase();
}
export function normalizePromotionMarkers(markers) {
  if (!Array.isArray(markers)) return [];
  return markers.filter(item=>item && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && typeof item.label==='string' && item.label.trim() && analyticsDate(item.date)?.toISOString().slice(0,10) === item.date)
    .slice(0,100).map(item=>({date:item.date,label:item.label.trim().slice(0,100)})).sort((a,b)=>a.date.localeCompare(b.date));
}
export function buildAnalytics(entries, {from = '', to = ''} = {}) {
  const totals = {views:0, clicks:0, tickets:0, signups:0};
  const clickSessions = new Set();
  let untrackedClicks = 0;
  const sessions = new Set(), ranked = {pages:new Map(), links:new Map(), sources:new Map(), campaigns:new Map()};
  const dated = [];
  const add = (map, label) => map.set(String(label), (map.get(String(label)) || 0) + 1);
  for (const entry of entries) {
    const flags = eventMetrics(entry);
    for (const key of Object.keys(totals)) totals[key] += Number(flags[key]);
    if (entry.sessionId && entry.sessionId !== 'unknown') sessions.add(entry.sessionId);
    if (flags.views) { add(ranked.pages, entry.pageName || entry.page || 'Unrecorded page'); add(ranked.sources, sourceName(entry)); }
    if (flags.clicks) { if (entry.sessionId && entry.sessionId !== 'unknown') clickSessions.add(entry.sessionId); else untrackedClicks++; add(ranked.links, entry.label || entry.href || entry.target || 'Unlabelled link'); if (entry.campaignSlug || entry.campaign) add(ranked.campaigns, entry.campaignSlug || entry.campaign); }
    const date = analyticsDate(entry.timestamp);
    if (date) dated.push({day:dayNumber(date), flags});
  }
  const days = dated.map(item => item.day);
  const start = from ? dayNumber(new Date(`${from}T00:00:00`)) : days.length ? days.reduce((a,b)=>Math.min(a,b)) : null;
  const end = to ? dayNumber(new Date(`${to}T00:00:00`)) : days.length ? days.reduce((a,b)=>Math.max(a,b)) : start;
  const validRange = Number.isFinite(start) && Number.isFinite(end) && end >= start;
  const step = validRange ? Math.max(1, Math.ceil((end-start+1)/60)) : 1;
  const bins = validRange ? Array.from({length:Math.ceil((end-start+1)/step)}, (_,index) => {
    const day = start+index*step, last = Math.min(end, day+step-1);
    return {label: dayLabel(day)+(last>day ? ` – ${dayLabel(last)}` : ''), views:0, clicks:0, tickets:0, signups:0};
  }) : [];
  for (const {day,flags} of dated) { const bin = bins[Math.floor((day-start)/step)]; if (day >= start && day <= end && bin) for (const key of Object.keys(totals)) bin[key] += Number(flags[key]); }
  return {start,end,totals, uniqueClicks:clickSessions.size, untrackedClicks, sessions:sessions.size, bins, step, undated:entries.length-dated.length,
    ranked:Object.fromEntries(Object.entries(ranked).map(([key,map])=>[key,[...map].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0]))])),
    invalidRange:Boolean(from && to && from > to)};
}
export function analyticsReports(entries) {
  const reports = new Map();
  for (const entry of entries) {
    if (entry.campaignSlug || entry.campaign) {
      const kind = entry.campaignSlug ? 'release' : 'campaign';
      const value = String(entry.campaignSlug || entry.campaign);
      reports.set(JSON.stringify([kind,value]), `${kind === 'release' ? 'Release' : 'Campaign'}: ${value}`);
    }
    if (eventMetrics(entry).tickets && entry.label) reports.set(JSON.stringify(['gig',String(entry.label)]), `Gig: ${entry.label}`);
  }
  return [...reports].sort((a,b)=>a[1].localeCompare(b[1]));
}
export function matchesAnalyticsReport(entry, report) {
  if (!report) return true;
  try {
    const [kind,value] = JSON.parse(report);
    if (kind === 'release') return String(entry.campaignSlug || '') === value;
    if (kind === 'campaign') return String(entry.campaign || '') === value;
    if (kind === 'gig') return String(entry.label || '') === value && (entry.section === 'tickets' || entry.section === 'Shows');
  } catch { /* Stale or malformed selections do not broaden a report. */ }
  return false;
}
export function compareAnalytics(entries, from, to) {
  if (!from || !to || from > to) return null;
  const first = dayNumber(new Date(`${from}T00:00:00`)), last = dayNumber(new Date(`${to}T00:00:00`));
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
  const length = last-first+1, previousStart = first-length;
  const previous = entries.filter(entry => { const date=analyticsDate(entry.timestamp); return date && dayNumber(date)>=previousStart && dayNumber(date)<first; });
  return {totals:buildAnalytics(previous).totals, count:previous.length, label:`${dayLabel(previousStart)} – ${dayLabel(first-1)}`};
}
export function buildCampaignLink(destination, source, medium, campaign) {
  const url = new URL(destination);
  if (!['https:','http:'].includes(url.protocol) || url.username || url.password) throw new Error('Enter a full http or https destination URL.');
  if (![source,medium,campaign].every(value=>String(value).trim())) throw new Error('Enter a source, medium and campaign name.');
  for (const key of ['source','medium','campaign']) url.searchParams.delete(key);
  for (const [key,value] of Object.entries({utm_source:source,utm_medium:medium,utm_campaign:campaign})) url.searchParams.set(key,String(value).trim());
  return url.toString();
}
const linkDraft = {destination:'https://halfawakeeyes.co.uk/links',source:'instagram',medium:'social',campaign:''};
let selectedMetric = 'views';
let analyticsSubview = 'overview';
export function renderAnalyticsInsights(entries, options = {}) {
  const grid = document.getElementById('stats-grid');
  if (!grid) return;
  let root = document.getElementById('analytics-insights');
  if (!root) {
    root = document.createElement('section'); root.id = 'analytics-insights'; root.setAttribute('aria-label','Analytics overview'); grid.after(root);
    const page = document.getElementById('analytics-page');
    const subnav = document.createElement('nav'); subnav.className='analytics-subnav'; subnav.setAttribute('aria-label','Analytics pages');
    subnav.innerHTML='<button type="button" data-analytics-view="overview">Overview</button><button type="button" data-analytics-view="actions">Actions</button>';
    page.prepend(subnav);
    const parent = document.querySelector('.nav-link[data-page="analytics"]');
    if (parent) {
      const sidebar = subnav.cloneNode(true); sidebar.className='analytics-sidebar-subnav'; parent.after(sidebar);
    }
    document.querySelectorAll('button[data-analytics-view]').forEach(button=>button.addEventListener('click',()=>{
      analyticsSubview=button.dataset.analyticsView;
      options.onNavigate?.();
      syncAnalyticsSubview();
    }));
    const controls = document.querySelector('#analytics-page .control-stack');
    if (controls) {
      const filters = document.createElement('section'); filters.className='insight-disclosure insight-filters';
      const summary = document.createElement('h3'); summary.textContent='Filters';
      filters.append(summary,controls); grid.before(filters);
    }
    const workspace = document.querySelector('#analytics-page .admin-data-workspace');
    if (workspace) {
      const logs = document.createElement('section'); logs.className='insight-disclosure insight-logs';
      const summary = document.createElement('h3'); summary.textContent='Activity log';
      workspace.before(logs); logs.append(summary,workspace);
      const view = document.querySelector('#analytics-page .view-toggle');
      const size = document.getElementById('page-size');
      const exportButton = document.getElementById('export-csv');
      const tools = document.createElement('div'); tools.className='insight-log-tools';
      if(view) tools.append(view); if(size) tools.append(size); if(exportButton) tools.append(exportButton);
      workspace.prepend(tools);
    }
  }
  syncAnalyticsSubview();
  const filterSummary = document.querySelector('.insight-filters > h3');
  if (filterSummary) filterSummary.textContent = `Filters${options.from || options.to ? ` · ${options.from || 'Any date'} to ${options.to || 'today'}` : ''}${document.getElementById('search-input')?.value ? ' · search active' : ''}`;

  const model = buildAnalytics(entries, options);
  let markers=[]; let ownExcluded=false;
  try {markers=normalizePromotionMarkers(JSON.parse(localStorage.getItem('hae-promotion-markers') || '[]'));ownExcluded=localStorage.getItem('hae-exclude-own-analytics')==='1';} catch {}
  const sources = [...new Set((options.allEntries || entries).map(entry=>sourceName(entry).toLowerCase()))].sort();
  if(options.source && !sources.includes(options.source)) sources.push(options.source);

  const reports = analyticsReports(options.allEntries || entries);
  if (options.report && !reports.some(([value])=>value===options.report)) reports.unshift([options.report,'Selected report (no loaded activity)']);
  const comparison = compareAnalytics(options.comparisonEntries || [], options.from, options.to);
  const change = key => {
    if (!comparison) return '';
    if (!comparison.count) return '';
    const previous = comparison.totals[key], current = model.totals[key];
    if (!previous) return current ? `${current} vs 0 previously` : 'No activity in either period';
    const percent = Math.round((current-previous)/previous*100);
    return `${percent>0?'+':''}${percent}% vs previous ${previous.toLocaleString()}`;
  };
  grid.innerHTML = Object.entries(metrics).map(([key,label])=>`<article class="stat-card"><div class="label">${label}</div><div class="value">${model.totals[key].toLocaleString()}</div><div class="detail insight-definition">${key==='tickets'?'Recorded actions, not ticket sales':key==='signups'?'Successful forms, may include repeat signups':key==='views'?'Recorded page loads':'Includes manual ticket redirects'}</div>${change(key)?`<div class="insight-change">${change(key)}</div>`:''}</article>`).join('');
  const ranks = (key,title,description) => {
    const rows = model.ranked[key], max = rows[0]?.[1] || 1;
    return `<article class="insight-panel"><h3>${title}</h3><p class="helper-copy">${description}</p>${rows.length ? `<ol class="insight-ranking">${rows.slice(0,6).map(([label,count])=>`<li><div><span title="${escape(label)}">${escape(label)}</span><strong>${count.toLocaleString()}</strong></div><div class="insight-track"><span style="width:${count/max*100}%"></span></div></li>`).join('')}</ol>${rows.length>6?`<p class="helper-copy">Top 6 of ${rows.length}</p>`:''}` : '<p class="insight-empty">No matching activity recorded.</p>'}</article>`;
  };
  const observations = [];
  const source = model.ranked.sources[0], link = model.ranked.links[0];
  if (source) observations.push(`${source[0]} recorded ${source[1]} of ${model.totals.views} page views in this report.`);
  if (link) observations.push(`${link[0]} was among the top links with ${link[1]} recorded clicks.`);
  if (model.totals.clicks) observations.push(`${model.uniqueClicks} tracked sessions clicked; ${model.untrackedClicks} clicks had no usable session ID.`);
  if (!observations.length) observations.push('No page views or clicks match this report yet. Try a wider date range.');
  root.innerHTML = `<div class="insight-toolbar"><div><strong>Activity overview</strong><p class="helper-copy">${entries.length.toLocaleString()} events · ${model.sessions.toLocaleString()} sessions</p></div><div class="insight-presets" aria-label="Quick date range">${[[7,'7 days'],[28,'28 days'],[90,'90 days'],[0,'All time']].map(([days,label])=>`<button type="button" class="btn ghost-button" data-days="${days}">${label}</button>`).join('')}</div></div>
    <details class="insight-disclosure" data-disclosure="reports" ${options.report?'open':''}><summary>${options.report?escape(reports.find(([value])=>value===options.report)?.[1] || 'Selected report'):'Report'}</summary><div class="insight-disclosure-body"><label for="insight-report">Choose a report</label><select id="insight-report" class="form-select"><option value="">All activity</option>${reports.map(([value,label])=>`<option value="${escape(value)}" ${options.report===value?'selected':''}>${escape(label)}</option>`).join('')}</select><label for="insight-source">Source</label><select id="insight-source" class="form-select"><option value="">All sources</option>${sources.map(source=>`<option value="${escape(source)}" ${options.source===source?'selected':''}>${escape(source)}</option>`).join('')}</select><p class="helper-copy">Matches recorded campaign IDs or gig labels. Gigs with the same label are grouped together.</p></div></details>
    <article class="insight-panel insight-trend"><div class="insight-toolbar"><div><h3>Activity over time</h3><p class="helper-copy">${model.step===1?'Daily totals':`${model.step}-day totals`} · dates with no recorded activity show zero.</p></div><label>Show <select id="insight-metric" class="form-select">${Object.entries(metrics).map(([key,label])=>`<option value="${key}" ${selectedMetric===key?'selected':''}>${label}</option>`).join('')}</select></label></div><div id="insight-chart"></div>${model.undated?`<p class="helper-copy">${model.undated} events without a usable timestamp are excluded from the chart.</p>`:''}</article>
    <section class="insight-panel insight-promotions"><h3>Promotion markers</h3><form id="insight-marker-form" class="insight-marker-form"><label>Date<input type="date" name="date" class="form-control" required></label><label>Promotion<input name="label" class="form-control" placeholder="Instagram post, email or ad launch" maxlength="100" required></label><button type="submit" class="btn ghost-button">Add marker</button></form><p class="helper-copy">Saved in this browser. Markers annotate dates, without claiming the promotion caused a change.</p><div id="insight-marker-list"></div><p id="insight-marker-status" role="status"></p></section>
    <div class="insight-rankings">${ranks('links','Most clicked links','Recorded link clicks, including repeat clicks.')}${ranks('sources','Traffic sources','Source or referring domain on page-view events.')}</div>
    <details class="insight-disclosure" data-disclosure="breakdown"><summary>Audience & campaigns</summary><div class="insight-disclosure-body"><ul class="insight-observations">${observations.map(text=>`<li>${escape(text)}</li>`).join('')}</ul><p class="helper-copy">${model.uniqueClicks.toLocaleString()} unique clicking sessions · ${model.totals.clicks.toLocaleString()} total clicks. Sessions are not individual people.</p><div class="insight-rankings">${ranks('pages','Popular pages','Recorded page views.')}${ranks('campaigns','Campaign engagement','Recorded campaign clicks.')}</div></div></details>
    <details class="insight-disclosure" data-disclosure="definitions"><summary>Counting notes${comparison?` · compared with ${comparison.label}`:''}</summary><div class="insight-disclosure-body helper-copy">${comparison && !comparison.count?'No events were recorded in the previous period. ':''}${comparison?'Comparisons use loaded events with the same filters. Missing records can affect the result.':'Choose a date range to compare with the preceding period.'} Page views count recorded page loads; link clicks include manual ticket redirects. Ticket clicks are not sales. Signup actions may include repeat signups. Dates without recorded activity show zero. Unique clicks count each tracked session once; clicks without session IDs are excluded from unique counts.</div></details>
    <details class="insight-panel insight-builder" data-disclosure="builder"><summary>Campaign link builder</summary><p class="helper-copy">Create a tagged link for a social post, email or QR code. Existing destination parameters are preserved; source, medium and campaign tags are replaced. External destinations need their own analytics.</p><form id="insight-link-form"><div class="insight-builder-fields">${[['destination','Destination URL','url'],['source','Source (e.g. instagram)','text'],['medium','Medium (e.g. social, email, qr)','text'],['campaign','Campaign name','text']].map(([key,label,type])=>`<label>${label}<input class="form-control" name="${key}" type="${type}" required value="${escape(linkDraft[key])}"></label>`).join('')}</div><button class="btn ghost-button" type="submit">Generate link</button></form><label for="insight-link-output">Tagged link</label><textarea id="insight-link-output" class="form-control" readonly rows="3"></textarea><button class="btn ghost-button" type="button" id="insight-copy-link" disabled>Copy link</button><p id="insight-link-status" role="status" class="helper-copy"></p></details>`;
  function chart() {
    const holder = root.querySelector('#insight-chart');
    if (model.invalidRange || !model.bins.length) { holder.innerHTML = `<p class="insight-empty">${model.invalidRange?'Choose an end date on or after the start date.':'No dated activity matches these filters.'}</p>`; return; }
    const max = Math.max(1,...model.bins.map(bin=>bin[selectedMetric]));
    const width = 900, height = 180, barWidth = width/model.bins.length;
    const markerLines=markers.filter(marker=>{const day=dayNumber(new Date(marker.date+'T00:00:00'));return day>=model.start&&day<=model.end;}).map(marker=>{
      const day=dayNumber(new Date(marker.date+'T00:00:00')),x=(day-model.start+.5)/(model.end-model.start+1)*width;
      return `<line x1="${x}" x2="${x}" y1="0" y2="180" stroke="#aaa" stroke-dasharray="4 4"><title>${escape(marker.date)}: ${escape(marker.label)}</title></line>`;
    }).join('');
    holder.innerHTML = `<p class="helper-copy">${metrics[selectedMetric]} · scale 0–${max.toLocaleString()}</p><svg class="insight-chart" viewBox="0 0 900 190" role="img" aria-label="${metrics[selectedMetric]} over time. Exact values in the chart data below."><line x1="0" y1="180" x2="900" y2="180" stroke="#555"/>${model.bins.map((bin,index)=>`<rect x="${index*barWidth+barWidth*.12}" y="${height-bin[selectedMetric]/max*height}" width="${barWidth*.76}" height="${bin[selectedMetric]/max*height}" rx="2"><title>${escape(bin.label)}: ${bin[selectedMetric]} ${metrics[selectedMetric].toLowerCase()}</title></rect>`).join('')}${markerLines}</svg><div class="insight-axis"><span>${escape(model.bins[0].label)}</span><span>${escape(model.bins.at(-1).label)}</span></div><details class="insight-data"><summary>View chart data</summary><div class="table-responsive"><table><thead><tr><th scope="col">Date</th><th scope="col">${metrics[selectedMetric]}</th></tr></thead><tbody>${model.bins.map(bin=>`<tr><th scope="row">${escape(bin.label)}</th><td>${bin[selectedMetric]}</td></tr>`).join('')}</tbody></table></div></details>`;
  }
  chart();
  const markerList=root.querySelector('#insight-marker-list'), markerStatus=root.querySelector('#insight-marker-status');
  function showMarkers(){
    markerList.innerHTML=markers.length?markers.map((marker,index)=>`<div class="insight-marker-row"><span>${escape(marker.date)} · ${escape(marker.label)}</span><button type="button" class="btn ghost-button" data-remove-marker="${index}" aria-label="Remove ${escape(marker.label)}">Remove</button></div>`).join(''):'<p class="helper-copy">No promotion markers yet.</p>';
    markerList.querySelectorAll('[data-remove-marker]').forEach(button=>button.addEventListener('click',()=>saveMarkers(markers.filter((_,index)=>index!==Number(button.dataset.removeMarker)))));
  }
  function saveMarkers(next){try {localStorage.setItem('hae-promotion-markers',JSON.stringify(next));markers=next;showMarkers();chart();markerStatus.textContent='Markers saved in this browser.';return true;}catch {markerStatus.textContent='Could not save markers. Browser storage is unavailable.';return false;}}
  showMarkers();
  root.querySelector('#insight-marker-form').addEventListener('submit',event=>{
    event.preventDefault();const form=event.currentTarget;
    if(markers.length>=100){markerStatus.textContent='Remove an old marker before adding another (100 maximum).';return;}
    const next=normalizePromotionMarkers([...markers,{date:form.elements.date.value,label:form.elements.label.value}]);
    if(next.length!==markers.length+1){markerStatus.textContent='Enter a valid date and promotion name.';return;}
    if(saveMarkers(next)) form.reset();
  });
  root.querySelector('#insight-source').addEventListener('change',event=>options.onSource?.(event.target.value));
  root.querySelectorAll('details[data-disclosure]').forEach(disclosure=>{
    const section = document.createElement('section'); section.className = disclosure.className;
    section.dataset.insightSection = disclosure.dataset.disclosure;
    const title = document.createElement('h3'); title.textContent = disclosure.querySelector('summary').textContent;
    disclosure.querySelector('summary').remove(); section.append(title,...disclosure.childNodes); disclosure.replaceWith(section);
  });
  const supporting = document.createElement('div'); supporting.className='insight-supporting';
  const breakdown = root.querySelector('[data-insight-section="breakdown"]');
  const builder = root.querySelector('[data-insight-section="builder"]');
  breakdown.before(supporting); supporting.append(breakdown,builder);

  root.querySelector('#insight-report').addEventListener('change', event=>options.onReport?.(event.target.value));
  const filters = document.querySelector('.insight-filters');
  if(filters) { filters.querySelector('[data-insight-section="reports"]')?.remove(); filters.append(root.querySelector('[data-insight-section="reports"]')); }

  let ownControl=document.getElementById('insight-own-visits');
  if(!ownControl && filters){
    ownControl=document.createElement('div');ownControl.id='insight-own-visits';ownControl.className='insight-own-visits';
    ownControl.innerHTML='<label><input type="checkbox" id="insight-exclude-own"> Exclude my future visits from site analytics</label><p class="helper-copy">This browser and site address only. Previous events and advertising pixels are unchanged. Enable separately on the live admin site and each browser you use.</p><p role="status" id="insight-own-status"></p>';
    filters.append(ownControl);
    ownControl.querySelector('input').checked=ownExcluded;
    ownControl.querySelector('input').addEventListener('change',event=>{try {localStorage.setItem('hae-exclude-own-analytics',event.target.checked?'1':'0');document.getElementById('insight-own-status').textContent=event.target.checked?'Future site-analytics events from this browser are excluded.':'Site analytics are enabled for this browser.';}catch {event.target.checked=!event.target.checked;document.getElementById('insight-own-status').textContent='Could not change this setting: browser storage is unavailable.';}});
  }
  if(ownControl && filters) filters.append(ownControl);
  const form = root.querySelector('#insight-link-form'), output = root.querySelector('#insight-link-output'), status = root.querySelector('#insight-link-status'), copy = root.querySelector('#insight-copy-link');
  form.addEventListener('input',()=>{ for (const key of Object.keys(linkDraft)) linkDraft[key]=form.elements.namedItem(key).value; output.value=''; copy.disabled=true; status.textContent=''; });
  form.addEventListener('submit',event=>{
    event.preventDefault();
    for (const key of Object.keys(linkDraft)) linkDraft[key]=form.elements.namedItem(key).value;
    try { output.value=buildCampaignLink(linkDraft.destination,linkDraft.source,linkDraft.medium,linkDraft.campaign); copy.disabled=false; status.textContent='Ready to copy. For a release page, its release name remains the recorded campaign; source and medium identify the promotion.'; }
    catch (error) { output.value=''; copy.disabled=true; status.textContent=error.message || 'Check the destination URL.'; }
  });
  copy.addEventListener('click',async()=>{try {await navigator.clipboard.writeText(output.value);status.textContent='Link copied.';}catch {output.focus();output.select();status.textContent='Select and copy the link above.';}});
  root.querySelector('#insight-metric').addEventListener('change',event=>{selectedMetric=event.target.value;chart();});
  root.querySelectorAll('[data-days]').forEach(button=>button.addEventListener('click',()=>{
    const count = Number(button.dataset.days), end = new Date(), start = new Date(); start.setDate(start.getDate()-count+1);
    const key = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    options.onRange?.(count?key(start):'',count?key(end):'');
  }));
}

function syncAnalyticsSubview() {
  const page = document.getElementById('analytics-page');
  if (!page) return;
  page.dataset.analyticsView = analyticsSubview;
  document.querySelectorAll('button[data-analytics-view]').forEach(button=>{
    if (button === page) return;
    const active=button.dataset.analyticsView===analyticsSubview;
    button.classList.toggle('active',active); button.setAttribute('aria-current',active?'page':'false');
  });
}

export function setAnalyticsSubview(view) {
  analyticsSubview = view === 'actions' ? 'actions' : 'overview';
  syncAnalyticsSubview();
}
