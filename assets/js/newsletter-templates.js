export const emailTemplates = [
  { id:'release', name:'New release', description:'Share a new single, EP or album.', subject:'[Release title] is out now', body:'Our new [single / EP / album], [release title], is out now.\n\n[Add a short note about the music.]\n\nListen here: [release link]\n\nThanks for listening and supporting us.\nHalf Awake Eyes' },
  { id:'show', name:'Show announcement', description:'Share the date, venue and ticket link.', subject:'Half Awake Eyes live at [venue] - [date]', body:'We are playing [venue, city] on [date].\n\nJoining us: [lineup]\nDoors: [time]\nAge restrictions: [details]\nTickets: [ticket link]\n\nWe would love to see you there.\nHalf Awake Eyes' },
  { id:'reminder', name:'Show reminder', description:'A short reminder before a show.', subject:'See you at [venue] on [day]?', body:'A quick reminder: we are playing [venue, city] on [date].\n\nDoors open at [time].\nTickets and show details: [ticket link]\n\nSee you there,\nHalf Awake Eyes' },
  { id:'merch', name:'Merch update', description:'Introduce a new item in the shop.', subject:'New in the shop: [item]', body:'[Item] is now available in our shop.\n\n[Describe the item, sizes and price.]\n\nTake a look: [shop link]\n\nThanks for supporting the band.\nHalf Awake Eyes' },
  { id:'update', name:'Band update', description:'Music, shows and news in one email.', subject:'A quick update from Half Awake Eyes', body:'Here is what we have been up to.\n\nNEW MUSIC\n[Release news and listening link]\n\nUPCOMING SHOWS\n[Dates, venues and ticket links]\n\nFROM THE BAND\n[A personal note or behind-the-scenes update]\n\nThanks for being here,\nHalf Awake Eyes' },
  { id:'booking', name:'Booking enquiry', description:'Introduce the band to a venue.', subject:'Half Awake Eyes - booking enquiry', body:'Hi [name],\n\nWe are Half Awake Eyes, an alternative metal band from Glasgow. We would love to discuss playing [venue / event] on [date].\n\nOur music and press kit:\nhttps://halfawakeeyes.co.uk/epk.html\n\nLet us know if you have any suitable dates coming up.\n\nThanks,\nHalf Awake Eyes' }
];

export function filterMailingContacts(contacts, search = '', status = 'all') {
  const term = search.trim().toLowerCase();
  return contacts.filter(contact => (status === 'all' || (status === 'unsubscribed') === Boolean(contact.unsubscribed)) &&
    [contact.email, contact.name, contact.fullName, contact.displayName, contact.source, contact.sourcePage, contact.campaignSlug].some(value => String(value || '').toLowerCase().includes(term)));
}

export function readSavedTemplates(storage, key) {
  try {
    const value = JSON.parse(storage.getItem(key) || '[]');
    return Array.isArray(value) ? value.filter(t => t && typeof t.id === 'string' && t.id.startsWith('custom-') && typeof t.name === 'string' && typeof t.subject === 'string' && typeof t.body === 'string').slice(0, 30) : [];
  } catch { return []; }
}
