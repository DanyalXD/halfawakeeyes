"use strict";
const crypto = require('crypto');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { getStorage } = require('firebase-admin/storage');
const { Timestamp } = require('firebase-admin/firestore');
const options = {region:'us-central1', maxInstances:2, timeoutSeconds:60, memory:'256MiB'};
const collections = new Set(['gigs', 'links', 'site-content']);
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');

module.exports = function buildAdminTools(db, assertAdmin) {
  const exports = {};
  exports.getAdminTrafficComparison = onCall(options, async request => {
    assertAdmin(request);
    const now = Date.now(), since = Timestamp.fromMillis(now - 14 * 86400000);
    const [events, contacts] = await Promise.all([
      db.collection('site-actions').where('timestamp','>=',since).get(),
      db.collection('mailing-list-signups').where('updatedAt','>=',since).get()
    ]);
    return {now, events:events.docs.map(doc => { const e = doc.data(); return {action:e.action || '', actionSubtype:e.actionSubtype || '', section:e.section || '', label:e.label || '', source:e.source || '', referrer:e.referrer || '', timestamp:e.timestamp?.toDate?.().toISOString() || ''}; }),
      // Document creation time cannot be reset by a repeat public signup.
      signups:contacts.docs.map(doc => { const s = doc.data(); return {createdAt:doc.createTime.toDate().toISOString(), source:s.source || '', referrer:s.referrer || ''}; })};
  });
  const record = async event => {
    const path = event.data.after.ref.path;
    if (path.endsWith('/public-index') || (path.startsWith('site-content/') && path !== 'site-content/homepage')) return;
    const batch = db.batch();
    for (const [stage, snapshot] of [['Before change', event.data.before], ['Saved version', event.data.after]]) {
      if (!snapshot.exists) continue;
      const content = snapshot.data();
      const id = hash(`${event.id}:${stage}`);
      batch.set(db.doc(`content-history/${id}`), {path, collection:path.split('/')[0], content, stage,
        title: String(content.event || content.title || content.releaseTitle || path),
        savedAt: Timestamp.fromDate(new Date(event.time)), sourceUpdatedAt:snapshot.updateTime});
    }
    await batch.commit();
  };
  for (const [name, document] of [['Gigs','gigs/{id}'], ['Links','links/{id}'], ['Homepage','site-content/homepage']]) {
    exports[`record${name}History`] = onDocumentWritten({...options, document, retry:true}, record);
  }
  exports.listContentHistory = onCall(options, async request => {
    assertAdmin(request);
    const name = request.data?.collection;
    if (!collections.has(name)) throw new HttpsError('invalid-argument', 'Choose gigs, links or homepage history.');
    const snapshot = await db.collection('content-history').where('collection','==',name).orderBy('savedAt','desc').limit(40).get();
    return {versions:snapshot.docs.map(doc => { const v = doc.data(); return {id:doc.id, title:v.title, stage:v.stage, savedAt:v.savedAt.toDate().toISOString()}; })};
  });
  exports.restoreContentVersion = onCall(options, async request => {
    const admin = assertAdmin(request);
    const id = String(request.data?.versionId || '');
    if (!/^[a-f0-9]{64}$/.test(id)) throw new HttpsError('invalid-argument', 'Choose a valid version.');
    return db.runTransaction(async tx => {
      const version = (await tx.get(db.doc(`content-history/${id}`))).data();
      if (!version || !/^(gigs|links)\/[^/]+$|^site-content\/homepage$/.test(version.path) || version.path.endsWith('/public-index')) throw new HttpsError('not-found', 'Version unavailable.');
      const ref = db.doc(version.path);
      const current = await tx.get(ref);
      const expected = hash({content:current.data() || null, time:current.updateTime?.toMillis() || null});
      if (request.data.preview === true) return {expected, content:version.content};
      if (request.data.expected !== expected) throw new HttpsError('failed-precondition', 'Content changed since this preview. Review the version again before restoring.');
      const [name, docId] = version.path.split('/');
      const mirrorRef = name !== 'site-content' ? db.doc(`${name}/public-index`) : null;
      const mirror = mirrorRef ? await tx.get(mirrorRef) : null;
      const content = {...version.content, updatedAt:Timestamp.now()};
      // Preserve the outgoing state in the same transaction as the restore.
      if (current.exists) tx.set(db.collection('content-history').doc(hash(`${id}:${expected}`)), {
        path:version.path, collection:name, content:current.data(), stage:'Before restore',
        title:version.title, savedAt:Timestamp.now(), restoredBy:admin
      });
      tx.set(ref, content);
      if (mirrorRef) {
        const items = (mirror.data()?.items || []).filter(item => item.id !== docId);
        items.push({...content, id:docId});
        if (name === 'gigs') items.sort((a,b) => String(a.date || '').localeCompare(String(b.date || '')));
        else items.sort((a,b) => Number(a.sortOrder || 0)-Number(b.sortOrder || 0));
        tx.set(mirrorRef, {...(mirror.data() || {}), items, updatedAt:Timestamp.now()});
      }
      return {restored:true};
    });
  });
  exports.uploadAdminArtwork = onCall({...options, memory:'512MiB'}, async request => {
    const admin = assertAdmin(request);
    const data = String(request.data?.data || '');
    const type = String(request.data?.type || '');
    if (data.length > 1200000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new HttpsError('invalid-argument', 'Image is too large or invalid.');
    const bytes = Buffer.from(data, 'base64');
    const valid = type === 'image/webp' ? bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP' :
      type === 'image/png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) :
      type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!valid || bytes.length > 900000 || bytes.length < 12) throw new HttpsError('invalid-argument', 'Upload a JPEG, PNG or WebP image under 900 KB after resizing.');
    let config = {}; try { config = JSON.parse(process.env.FIREBASE_CONFIG || '{}'); } catch { /* SDK configuration is optional. */ }
    const project = config.projectId || process.env.GCLOUD_PROJECT;
    const names = [...new Set([config.storageBucket, `${project}.firebasestorage.app`, `${project}.appspot.com`].filter(Boolean))];
    let bucket;
    for (const name of names) {
      const candidate = getStorage().bucket(name);
      try { if ((await candidate.exists())[0]) { bucket = candidate; break; } } catch { /* Try the project's other default bucket name. */ }
    }
    if (!bucket) throw new HttpsError('failed-precondition', 'Media uploads are not available yet. Enable Firebase Storage for this project and grant the functions service account access to its bucket.');
    const id = crypto.randomUUID(); const token = crypto.randomUUID();
    const objectPath = `admin-artwork/${id}.${type.split('/')[1]}`;
    const file = bucket.file(objectPath);
    await file.save(bytes, {resumable:false, metadata:{contentType:type, cacheControl:'public,max-age=31536000,immutable', metadata:{firebaseStorageDownloadTokens:token}}});
    const item = {name:String(request.data?.name || 'Artwork').slice(0,160), url:`https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`,
      width:Number(request.data?.width) || 0, height:Number(request.data?.height) || 0, size:bytes.length, createdAt:Timestamp.now(), uploadedBy:admin};
    try { await db.doc(`admin-media/${id}`).set(item); }
    catch(error) { await file.delete().catch(() => {}); throw error; }
    return {...item, createdAt:item.createdAt.toDate().toISOString()};
  });
  return exports;
};
