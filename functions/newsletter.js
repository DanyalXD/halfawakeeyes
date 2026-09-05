"use strict";
const crypto = require('crypto');
const emailKey = email => crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex');
const tokenKey = token => crypto.createHash('sha256').update(token).digest('hex');
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function withUnsubscribe(message, url) {
  const footer = `<div style="margin-top:32px;padding-top:20px;border-top:1px solid #dddddd;font-family:Arial,sans-serif;font-size:12px;color:#666666"><p>You received this email because you joined the Half Awake Eyes mailing list.</p><p><a href="${escape(url)}" style="display:inline-block;padding:10px 16px;border:1px solid #999999;border-radius:4px;color:#333333;text-decoration:underline">Unsubscribe from the mailing list</a></p></div>`;
  const html = message.html || `<div style="white-space:pre-wrap">${escape(message.text)}</div>`;
  return {...message, text:`${message.text}\n\n---\nUnsubscribe from the Half Awake Eyes mailing list:\n${url}`,
    html: /<\/body\s*>/i.test(html) ? html.replace(/<\/body\s*>/i, `${footer}</body>`) : html + footer,
    headers:{...message.headers, 'List-Unsubscribe':`<${url}>`}};
}

async function sendNewsletterBatch({db, recipients, message, send, origin}) {
  const emails = [...new Set(recipients.map(e => String(e).trim().toLowerCase()).filter(Boolean))];
  if (!emails.length || emails.length > 5) throw new Error('Send between one and five newsletter recipients per batch.');
  const snapshot = await db.collection('mailing-list-signups').get();
  const contacts = snapshot.docs.map(doc => ({...doc.data(),id:doc.id}));
  const result = {sent:[], failed:[], skipped:[]};
  for (const email of emails) {
    const matches = contacts.filter(c => String(c.email || '').trim().toLowerCase() === email);
    if (!matches.length || matches.some(c => c.unsubscribed)) { result.skipped.push(email); continue; }
    try {
      if ((await db.doc(`mailing-list-suppressions/${emailKey(email)}`).get()).exists) { result.skipped.push(email); continue; }
      const token = crypto.randomBytes(32).toString('hex');
      await db.doc(`mailing-list-unsubscribe-tokens/${tokenKey(token)}`).set({emailHash:emailKey(email), contactIds:matches.map(c=>c.id), createdAt:new Date()});
      const url = `${origin}/unsubscribe?token=${token}`;
      // Recheck just before delivery, in case someone opted out during this batch.
      if ((await db.doc(`mailing-list-suppressions/${emailKey(email)}`).get()).exists) { result.skipped.push(email); continue; }
      const current = await Promise.all(matches.map(contact => db.doc(`mailing-list-signups/${contact.id}`).get()));
      if (current.some(contact => !contact.exists || contact.data().unsubscribed || String(contact.data().email || '').trim().toLowerCase() !== email)) { result.skipped.push(email); continue; }
      await send(withUnsubscribe({...message,to:email,bcc:undefined}, url));
      result.sent.push(email);
    } catch { result.failed.push(email); }
  }
  return result;
}

function page(title, content) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escape(title)} | Half Awake Eyes</title><style>body{margin:0;background:#090909;color:#eee;font:16px/1.6 Arial,sans-serif;min-height:100svh;display:grid;place-items:center}main{max-width:440px;padding:32px}small{color:#999;letter-spacing:.12em}h1{font-size:28px;line-height:1.2}p{color:#bbb}button,a{display:inline-block;padding:12px 18px;border-radius:4px;font:inherit}button{background:#eee;color:#111;border:0;cursor:pointer}a{color:#ccc}button:focus-visible,a:focus-visible{outline:2px solid white;outline-offset:4px}</style></head><body><main><small>HALF AWAKE EYES</small><h1>${escape(title)}</h1>${content}</main></body></html>`;
}

function createUnsubscribeHandler(db) {
  return async (request, response) => {
    response.set('Cache-Control','no-store');
    response.set('Referrer-Policy','no-referrer');
    response.set('X-Content-Type-Options','nosniff');
    response.set('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    if (!['GET','POST'].includes(request.method)) { response.set('Allow','GET, POST'); response.status(405).send('Method not allowed.'); return; }
    if (request.method === 'GET' && request.query?.preview === '1') {
      response.status(200).send(page('Unsubscribe preview','<p>This is a test email. No subscription has been changed. A real newsletter gives each subscriber their own unsubscribe button.</p>'));
      return;
    }
    const token = typeof request.query?.token === 'string' ? request.query.token : '';
    if (!/^[a-f0-9]{64}$/.test(token)) { response.status(400).send(page('This link is not valid','<p>Please use the unsubscribe button in a recent email from us.</p>')); return; }
    try {
      const tokenRef = db.doc(`mailing-list-unsubscribe-tokens/${tokenKey(token)}`);
      const saved = await tokenRef.get();
      if (!saved.exists) { response.status(400).send(page('This link is not valid','<p>Please use the unsubscribe button in a recent email from us.</p>')); return; }
      const {emailHash,contactIds} = saved.data();
      if (request.method === 'GET') {
        response.status(200).send(page('Leave the mailing list?',`<p>You will stop receiving music, show and band updates from Half Awake Eyes.</p><form method="post" action="?token=${token}"><button type="submit">Unsubscribe</button></form>`));
        return;
      }
      await db.runTransaction(async transaction => {
        const refs = contactIds.map(id => db.doc(`mailing-list-signups/${id}`));
        const contacts = await Promise.all(refs.map(ref => transaction.get(ref)));
        transaction.set(db.doc(`mailing-list-suppressions/${emailHash}`),{unsubscribedAt:new Date()});
        contacts.forEach((contact,index) => { if (contact.exists) transaction.update(refs[index],{unsubscribed:true,unsubscribedAt:new Date()}); });
      });
      response.status(200).send(page('You are unsubscribed','<p>You will no longer receive mailing-list emails from Half Awake Eyes.</p><a href="https://halfawakeeyes.co.uk">Back to the website</a>'));
    } catch {
      response.status(503).send(page('Please try again','<p>We could not update your subscription just now. Please reopen the link and try again.</p>'));
    }
  };
}

module.exports = {emailKey,tokenKey,withUnsubscribe,sendNewsletterBatch,createUnsubscribeHandler};
