// Load preferences independently of the optional Firebase SDK and page features.
import { installPrivacyControls } from './public-site-utils.js?v=20261008-privacy-anchor';
import { installPublicFooter } from './public-footer.js?v=20261008-privacy-anchor';
installPublicFooter();
installPrivacyControls();
