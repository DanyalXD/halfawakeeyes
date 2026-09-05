// Keep the editable document and its public copy in one atomic commit.
export async function saveCampaignDocuments({ db, doc, runTransaction, payload, previousId = '' }) {
  return runTransaction(db, async transaction => {
    const editable = doc(db, 'campaigns', payload.slug);
    const published = doc(db, 'public-campaigns', payload.slug);
    if (payload.slug !== previousId) {
      const existing = await transaction.get(editable);
      const publicExisting = await transaction.get(published);
      if (existing.exists() || publicExisting.exists()) {
        throw new Error('That campaign address already exists. Choose a different address.');
      }
    }
    transaction.set(editable, payload);
    transaction.set(published, payload);
    if (previousId && previousId !== payload.slug) {
      transaction.delete(doc(db, 'campaigns', previousId));
      transaction.delete(doc(db, 'public-campaigns', previousId));
    }
  });
}
