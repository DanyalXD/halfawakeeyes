import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync('assets/js/newsletter-templates.js', 'utf8');
const { filterMailingContacts, readSavedTemplates, emailTemplates } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const contacts = [{id:'1',email:'alex@example.com',source:'Instagram'}, {id:'2',email:'sam@example.com',campaignSlug:'new-release'}, {id:'3',email:'casey@example.com',unsubscribed:true}];
test('contact search handles email, source and campaign without case sensitivity', () => {
  assert.deepEqual(filterMailingContacts(contacts, '  INSTAGRAM ').map(c=>c.id), ['1']);
  assert.deepEqual(filterMailingContacts(contacts, 'new-release').map(c=>c.id), ['2']);
  assert.equal(filterMailingContacts(contacts, 'missing').length, 0);
});
test('subscription filters exclude unsubscribed contacts from active results', () => {
  assert.deepEqual(filterMailingContacts(contacts, '', 'active').map(c=>c.id), ['1','2']);
  assert.deepEqual(filterMailingContacts(contacts, '', 'unsubscribed').map(c=>c.id), ['3']);
  assert.equal(filterMailingContacts(contacts, 'casey', 'active').length, 0);
});
test('templates have unique IDs, subjects and reusable text', () => {
  assert.equal(new Set(emailTemplates.map(t=>t.id)).size, emailTemplates.length);
  for (const entry of emailTemplates) {
    assert.ok(entry.subject && entry.body && entry.name);
    assert.ok(!('to' in entry) && !('bcc' in entry) && !('attachments' in entry));
  }
});
test('saved templates are isolated by account key', () => {
  const entry = {id:'custom-1',name:'Mine',subject:'Subject',body:'Message'};
  const storage = {getItem:key=>key==='account-a'?JSON.stringify([entry]):null};
  assert.deepEqual(readSavedTemplates(storage,'account-a'),[entry]);
  assert.deepEqual(readSavedTemplates(storage,'account-b'),[]);
});
test('invalid or unavailable stored templates cannot break the composer', () => {
  assert.deepEqual(readSavedTemplates({getItem:()=>'{broken'}, 'a'), []);
  assert.deepEqual(readSavedTemplates({getItem:()=>{throw Error('Blocked');}}, 'a'), []);
  assert.deepEqual(readSavedTemplates({getItem:()=>JSON.stringify([null,{id:'release',name:'override'}, {id:'custom-bad',name:'bad',subject:42}])}, 'a'), []);
});
