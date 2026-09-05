export function requestedCampaignSlug(pathname, search) {
  const match = pathname.match(/\/smartlink\/([^/?#]+)\/?$/i);
  if (match) {
    try { return decodeURIComponent(match[1]).trim(); } catch { return ''; }
  }
  const params = new URLSearchParams(search);
  // Keep older query links working; marketing tags must never override a page address.
  return (params.get('campaign') || params.get('utm_campaign') || '').trim();
}
