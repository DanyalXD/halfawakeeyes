import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync('assets/js/email-site-content.js','utf8');
const {emailSiteSources,populateEmailTemplate}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('show fields populate subject and body without inventing missing details',()=>{
  const [show]=emailSiteSources({gigs:[{id:'show',event:'Live',venue:'Slay',city:'Glasgow',date:'2026-09-23',ticketUrl:'https://example.com/tickets',doorsTime:'19:00'}]});
  const result=populateEmailTemplate('Live at [venue]','[venue, city] on [date]\nDoors: [time]\nTickets: [ticket link]\n[lineup]',show);
  assert.equal(result.subject,'Live at Slay'); assert.match(result.body,/Glasgow on 23 September 2026/);assert.match(result.body,/https:\/\/example.com\/tickets/);assert.match(result.body,/\[lineup\]/);assert.equal(result.count,5);
});
test('draft campaigns and unsafe or hidden links are not offered',()=>{
  const sources=emailSiteSources({campaigns:[{id:'draft',live:false},{id:'live',title:'Release',live:true}],links:[{id:'bad',url:'javascript:alert(1)'},{id:'hidden',hidden:true,url:'https://example.com'}]});
  assert.equal(sources.length,1);assert.equal(sources[0].values['release link'],'https://halfawakeeyes.co.uk/smartlink/live');
});
test('merch uses the saved price, availability and shop link',()=>{
  const [merch]=emailSiteSources({homepage:{merchTitle:'Band shirt',merchPrice:'20 GBP',merchAvailability:'Sizes S to L',merchUrl:'https://example.com/shop'}});
  const result=populateEmailTemplate('[item]','[Describe the item, sizes and price.]\n[shop link]',merch);
  assert.equal(result.subject,'Band shirt');assert.match(result.body,/20 GBP\nSizes S to L/);assert.equal(result.count,3);
});
test('existing edited text stays intact and replacement values remain literal',()=>{
  const result=populateEmailTemplate('My edited subject','[release title] - my own words',{values:{'release title':'A $& song'}});
  assert.equal(result.subject,'My edited subject');assert.equal(result.body,'A $& song - my own words');
});
