'use strict';

// Dry-run by default. Run only after reviewing ANALYTICS_PRIVACY.md.
const {sanitiseLegacyEvent, RETENTION_DAYS} = require('../analytics');

async function migrateAnalytics(db, {apply = false, now = Date.now()} = {}) {
  const {FieldPath} = require('firebase-admin/firestore');
  const {storeAndDelete}=require('../analytics');
  const totals={retained:0,removed:0,unchanged:0,applied:apply};
  const cutoff=now-RETENTION_DAYS*86400000;
  for(const name of ['site-actions','ad-tracking']) {
    let query=db.collection(name).orderBy(FieldPath.documentId()).limit(40);
    while(true) {
      const snapshot=await query.get(); if(snapshot.empty) break;
      const pending=[];
      for(const doc of snapshot.docs) {
        const raw=doc.data();
        if(name==='site-actions' && raw.statisticsVersion==='2026-10-07') {totals.unchanged++;continue;}
        const event=sanitiseLegacyEvent(raw);
        if(name==='site-actions' && event.action && event.timestamp && event.timestamp.getTime()>=cutoff && event.timestamp.getTime()<=now) totals.retained++;
        else totals.removed++;
        pending.push(doc);
      }
      if(apply && pending.length) {
        if(name==='site-actions') await storeAndDelete(db,pending,{now,historical:true});
        else {const batch=db.batch();pending.forEach(doc=>batch.delete(doc.ref));await batch.commit();}
      }
      if(snapshot.size<40) break;query=query.startAfter(snapshot.docs.at(-1));
    }
  }
  return totals;
}

if (require.main === module) {
  const args = new Set(process.argv.slice(2));
  if ([...args].some(arg => !['--apply','--dry-run'].includes(arg)) || args.has('--apply') && args.has('--dry-run')) {
    console.error('Use --dry-run (default) or --apply.'); process.exitCode = 1;
  } else {
    const {initializeApp} = require('firebase-admin/app');
    const {getFirestore} = require('firebase-admin/firestore');
    initializeApp({projectId:'half-awake-eyes'});
    migrateAnalytics(getFirestore(), {apply:args.has('--apply')})
      .then(result=>console.log(JSON.stringify(result)))
      .catch(()=>{console.error('Migration failed. Check application-default credentials and permissions; rerun to resume.'); process.exitCode=1;});
  }
}
module.exports = {migrateAnalytics};
