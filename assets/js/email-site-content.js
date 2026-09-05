const clean = value => String(value || '').trim();
const url = value => { try { const parsed = new URL(value); return ['https:','http:'].includes(parsed.protocol) ? parsed.href : ''; } catch { return ''; } };
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(`${value}T12:00:00`)) ? new Date(`${value}T12:00:00`).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}) : '';

export function emailSiteSources({gigs = [], links = [], campaigns = [], homepage = {}}) {
  const sources = [];
  for (const gig of gigs.filter(g => g.id !== 'public-index').sort((a,b)=>clean(a.date).localeCompare(clean(b.date)))) {
    const venue = clean(gig.venue), when = date(gig.date), ticket = url(gig.ticketUrl);
    const place = [venue,clean(gig.city)].filter(Boolean).join(', ');
    const details = [clean(gig.event), place, when, gig.doorsTime && `Doors: ${gig.doorsTime}`, gig.ageRestriction && `Age restrictions: ${gig.ageRestriction}`, ticket && `Tickets: ${ticket}`].filter(Boolean).join('\n');
    sources.push({id:`gig:${gig.id}`,label:`Show: ${clean(gig.event) || place} - ${when || 'Date not set'}`,details,values:{venue,'venue, city':place,date:when,day:when,time:clean(gig.doorsTime),details:clean(gig.ageRestriction),lineup:clean(gig.lineup), 'ticket link':ticket,'dates, venues and ticket links':details}});
  }
  for (const campaign of campaigns.filter(c => c.id !== 'active' && c.live === true)) {
    const title = clean(campaign.title), link = `https://halfawakeeyes.co.uk/smartlink/${encodeURIComponent(campaign.id)}`;
    sources.push({id:`campaign:${campaign.id}`,label:`Release: ${title}`,details:[title,clean(campaign.description),link].filter(Boolean).join('\n'),values:{'release title':title,'release link':link,'add a short note about the music.':clean(campaign.description),'release news and listening link':[title,link].join('\n')}});
  }
  for (const link of links.filter(l => l.id !== 'public-index' && !l.hidden && url(l.url))) {
    const title = clean(link.title || link.label), target = url(link.url);
    sources.push({id:`link:${link.id}`,label:`Link: ${title || target}`,details:[title,clean(link.description),target].filter(Boolean).join('\n'),values:{'ticket link':target,'release link':target,'shop link':target}});
  }
  const music = url(homepage.spotify) || url(homepage.bandcamp);
  if (homepage.releaseTitle) sources.push({id:'home:release',label:'Homepage: featured release',details:[homepage.releaseTitle,homepage.releaseDescription,music].filter(Boolean).join('\n'),values:{'release title':clean(homepage.releaseTitle),'release link':music,'add a short note about the music.':clean(homepage.releaseDescription),'release news and listening link':[homepage.releaseTitle,music].filter(Boolean).join('\n')}});
  if (homepage.merchTitle) sources.push({id:'home:merch',label:'Homepage: featured merchandise',details:[homepage.merchTitle,homepage.merchPrice,homepage.merchAvailability,url(homepage.merchUrl)].filter(Boolean).join('\n'),values:{item:clean(homepage.merchTitle),'describe the item, sizes and price.':[homepage.merchPrice,homepage.merchAvailability].filter(Boolean).join('\n'),'shop link':url(homepage.merchUrl)}});
  return sources;
}

export function populateEmailTemplate(subject, body, source) {
  let count = 0;
  const fill = text => String(text).replace(/\[([^\]\n]+)\]/g, (placeholder, name) => {
    const value = source.values[name.trim().toLowerCase()];
    if (!value) return placeholder;
    count++; return value;
  });
  const result = {subject:fill(subject),body:fill(body)};
  return {...result,count};
}
