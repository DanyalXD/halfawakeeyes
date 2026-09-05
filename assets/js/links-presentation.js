export function destinationKey(value) {
  try {
    const url = new URL(value);
    url.hostname = url.hostname.replace(/^www\./, '');
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|fbclid|igsh|si|mibextid|_r|_t|s|t)$/.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.href;
  } catch { return String(value || '').trim(); }
}
export function isSocialProfile(value) {
  try {
    const url = new URL(value), host = url.hostname.replace(/^www\./, '');
    if (['instagram.com','x.com','twitter.com','tiktok.com','facebook.com'].includes(host)) {
      return !/\/(p|reel|reels|status|video|videos|watch|posts)\b/.test(url.pathname);
    }
    if (host === 'open.spotify.com') return url.pathname.startsWith('/artist/');
    if (host === 'youtube.com') return /^\/(?:@|channel\/|c\/|user\/)/.test(url.pathname);
    return false;
  } catch { return false; }
}
export const sectionPriority = name => ({Shows:0,Releases:1,Store:2,Links:3,Contact:4}[name] ?? 5);
export const sectionLabel = name => ({Shows:'Live dates',Releases:'Listen',Store:'Merch',Links:'More'}[name] || name);
export function linkCopy(link) {
  const title = ({'Official Website':'Main website','Half Awake Eyes Store':'Shop merch','Half Awake Eyes EP':'Listen to the EP'})[link.title] || link.title;
  const normalize = text => String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const kicker = normalize(link.kicker) === normalize(title) || normalize(link.kicker) === normalize(link.title) ? '' : link.kicker;
  const description = [title,link.title,kicker].some(text => normalize(text) && normalize(text) === normalize(link.description)) ? '' : link.description;
  return {title,kicker,description};
}
