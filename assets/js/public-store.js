import { firebaseConfig } from './public-site-utils.js';
import { renderStore, storeFromHomepage } from './store-content.js?v=20261005-store-page';

const status = document.getElementById('store-load-status');
async function loadStore() {
  try {
    const [{ initializeApp }, { getFirestore, getDoc, doc }] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js')
    ]);
    const db = getFirestore(initializeApp(firebaseConfig));
    const store = await getDoc(doc(db, 'site-content', 'store'));
    const content = store.exists() ? store.data() : storeFromHomepage((await getDoc(doc(db, 'site-content', 'homepage'))).data());
    renderStore(content, document.getElementById('store-catalog'), { standalone: true });
    status.textContent = '';
    status.hidden = true;
  } catch {
    status.textContent = 'Product listings could not load. You can still browse and buy using the SumUp store link above.';
  }
}
void loadStore();
