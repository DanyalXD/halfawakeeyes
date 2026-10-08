export const firebaseConfig = {
  apiKey: "AIzaSyAv7G28uXxlQNG_HMLbBkuz4xseXzOzm4Y",
  authDomain: "half-awake-eyes.firebaseapp.com",
  projectId: "half-awake-eyes"
};

export const PUBLIC_MIRROR_DOC_ID = "public-index";

export const CONSENT_VERSION = '2026-10-07';
const CONSENT_KEY = 'hae-privacy-choice';
const SESSION_KEY = 'hae-analytics-session-v3';
let memoryChoice;
let metaPixelConfigured = false;
let privacyPositionObserver;
const IDLE_MS = 30 * 60 * 1000;
let memorySession;
let sessionExpiryTimer;
function clearAnalyticsSession() {
  memorySession=undefined; globalThis.window?.clearTimeout?.(sessionExpiryTimer);
  try {
    for (const key of Object.keys(sessionStorage)) if (/^hae-(session-id|analytics-|page-view:|gig-view:)/.test(key)) sessionStorage.removeItem(key);
    sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem('hae-analytics-session-v2');
  } catch { /* Browser storage may be unavailable. */ }
}
const documentPageViews = new Set();

// Kept as a compatibility name for existing callers; analytics is an objection check.
export function hasTrackingConsent(purpose = 'analytics') {
  if (globalThis.navigator?.globalPrivacyControl || globalThis.navigator?.doNotTrack === '1') return false;
  let choice = memoryChoice;
  try { choice = memoryChoice || JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null'); }
  catch { if (!choice) return false; } // Inaccessible/malformed preferences must not override an objection.
  if (purpose === 'analytics') return choice?.analytics !== false;
  const marketingSavedAt=choice?.marketingSavedAt ?? choice?.savedAt;
  return purpose === 'marketing' && choice?.version === CONSENT_VERSION && choice.marketing === true &&
    Date.now() >= marketingSavedAt && Date.now() - marketingSavedAt < 180 * 86400000;
}

export function saveTrackingConsent(choice = {}) {
  const analytics = choice.analytics === undefined ? hasTrackingConsent() : choice.analytics === true;
  const marketing = choice.marketing === undefined ? hasTrackingConsent('marketing') : choice.marketing === true;
  const revokeMarketing = hasTrackingConsent('marketing') && !marketing;
  let previous=memoryChoice; try {previous ||= JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null');} catch {}
  const marketingSavedAt=choice.marketing === undefined ? previous?.marketingSavedAt ?? previous?.savedAt ?? 0 : Date.now();
  memoryChoice = {version: CONSENT_VERSION, savedAt: Date.now(), analytics, marketing, marketingSavedAt};
  let storageFailed = false;
  try { localStorage.setItem(CONSENT_KEY, JSON.stringify(memoryChoice)); memoryChoice = undefined; } catch { storageFailed = true; }
  if (!analytics) clearAnalyticsSession();
  if (revokeMarketing) {
    window.fbq?.('consent', 'revoke');
    for (const name of ['_fbp', '_fbc']) {
      for (const domain of ['', '; domain=' + location.hostname, '; domain=.halfawakeeyes.co.uk']) {
        document.cookie = name + '=; Max-Age=0; path=/' + domain + '; SameSite=Lax; Secure';
      }
    }
  }
  window.dispatchEvent?.(new CustomEvent('hae-consent-change'));
  if (revokeMarketing) location.reload();
  return !storageFailed;
}

// Page controllers register a configured pixel before checking advertising consent.
// This only exposes the appropriate preference; it never grants permission or loads Meta.
export function enableMetaPrivacy(pixelId) {
  if (!/^\d+$/.test(String(pixelId || '').trim())) return false;
  if (metaPixelConfigured) return true;
  metaPixelConfigured = true;
  if (typeof document !== 'undefined') {
    document.getElementById?.('hae-privacy-controls')?.dispatchEvent(new CustomEvent('hae-meta-available'));
  }
  return true;
}

function hasCurrentMarketingChoice() {
  let choice = memoryChoice;
  try {choice ||= JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null');} catch {return false;}
  const savedAt = choice?.marketingSavedAt ?? choice?.savedAt;
  return choice?.version === CONSENT_VERSION && typeof choice.marketing === 'boolean' &&
    Number.isFinite(savedAt) && Date.now() >= savedAt && Date.now() - savedAt < 180 * 86400000;
}

function positionPrivacyControls() {
  const panel = document.getElementById('hae-privacy-controls');
  const button = document.getElementById('hae-privacy-settings');
  if (!panel || panel.hidden || !button) return;
  const viewport = window.visualViewport;
  const viewportLeft = viewport?.offsetLeft || 0;
  const viewportTop = viewport?.offsetTop || 0;
  const viewportRight = viewportLeft + (viewport?.width || window.innerWidth);
  const viewportBottom = viewportTop + (viewport?.height || window.innerHeight);
  const bounds = button.getBoundingClientRect();
  if (bounds.bottom <= viewportTop || bounds.top >= viewportBottom || bounds.right <= viewportLeft || bounds.left >= viewportRight) {
    // Initial notices stay on screen while the footer is below the fold.
    for (const property of ['left', 'right', 'top', 'bottom', 'max-height', 'max-width']) panel.style.removeProperty(property);
    return;
  }
  const margin = window.innerWidth <= 480 ? 12 : 24;
  const gap = 8;
  const above = Math.max(0, bounds.top - viewportTop - margin - gap);
  const below = Math.max(0, viewportBottom - bounds.bottom - margin - gap);
  const placeAbove = above >= below;
  panel.style.maxHeight = (placeAbove ? above : below) + 'px';
  panel.style.maxWidth = Math.max(0, viewportRight - viewportLeft - margin * 2) + 'px';
  const popup = panel.getBoundingClientRect();
  panel.style.left = Math.max(viewportLeft + margin, Math.min(bounds.right - popup.width, viewportRight - margin - popup.width)) + 'px';
  panel.style.right = 'auto';
  panel.style.top = (placeAbove ? bounds.top - gap - popup.height : bounds.bottom + gap) + 'px';
  panel.style.bottom = 'auto';
}

export function installPrivacyControls() {
  if (!document.body || document.getElementById('hae-privacy-controls')) return;
  if (!document.querySelector('[data-hae-privacy-styles]')) {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = new URL('../css/privacy-controls.css?v=20261008-privacy-anchor', import.meta.url).href;
    stylesheet.dataset.haePrivacyStyles = '';
    document.head.append(stylesheet);
  }
  const panel = document.createElement('section');
  panel.id = 'hae-privacy-controls';
  panel.setAttribute('aria-labelledby', 'hae-privacy-heading');
  panel.innerHTML = `<form>
    <div class="hae-privacy-header">
      <h2 id="hae-privacy-heading">Privacy preferences</h2>
      <button class="hae-privacy-close" type="button" data-close aria-label="Close privacy preferences"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </div>
    <p class="hae-privacy-intro">Choose what you share. You can change these settings anytime.</p>
    <label class="hae-privacy-option">
      <span class="hae-privacy-copy"><span class="hae-privacy-name" id="hae-analytics-label">Statistical analytics</span><span class="hae-privacy-description" id="hae-analytics-description">On by default. Temporary sessions help us improve this website.</span></span>
      <span class="hae-privacy-switch"><input type="checkbox" role="switch" name="analytics" aria-labelledby="hae-analytics-label" aria-describedby="hae-analytics-description"><span class="hae-privacy-state" data-state="analytics" aria-hidden="true"></span></span>
    </label>
    <label class="hae-privacy-option" data-meta-option hidden>
      <span class="hae-privacy-copy"><span class="hae-privacy-name" id="hae-marketing-label">Marketing / Meta</span><span class="hae-privacy-description" id="hae-marketing-description">Shares activity with Meta for ads on configured pages only. Off unless you save it on.</span></span>
      <span class="hae-privacy-switch"><input type="checkbox" role="switch" name="marketing" aria-labelledby="hae-marketing-label" aria-describedby="hae-marketing-description"><span class="hae-privacy-state" data-state="marketing" aria-hidden="true"></span></span>
    </label>
    <div class="hae-privacy-actions"><button class="hae-privacy-save" type="submit">Save choices</button><button type="button" data-reject aria-label="Turn both off (analytics and marketing)">Turn both off</button></div>
    <a class="hae-privacy-policy">Privacy policy</a>
    <p role="status"></p>
  </form>`;
  panel.querySelector('.hae-privacy-policy').href = new URL('../../privacy.html', import.meta.url).href;
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = 'Privacy settings'; button.id = 'hae-privacy-settings';
  button.setAttribute('aria-controls', panel.id);
  button.dataset.analyticsIgnore = 'true'; panel.dataset.analyticsIgnore = 'true';
  const form = panel.querySelector('form');
  const status = panel.querySelector('[role="status"]');
  const reject = panel.querySelector('[data-reject]');
  const updateMetaScope = () => {
    const available = metaPixelConfigured || document.body.hasAttribute('data-privacy-page');
    panel.querySelector('[data-meta-option]').hidden = !available;
    form.elements.marketing.disabled = !available;
    reject.textContent = available ? 'Turn both off' : 'Turn analytics off';
    reject.setAttribute('aria-label', available ? 'Turn both off (analytics and marketing)' : 'Turn analytics off');
  };
  const updateStates = () => {
    for (const purpose of ['analytics', 'marketing']) {
      panel.querySelector('[data-state="' + purpose + '"]').textContent = form.elements[purpose].checked ? 'On' : 'Off';
    }
  };
  const syncChoices = () => {
    form.elements.analytics.checked = hasTrackingConsent();
    form.elements.marketing.checked = hasTrackingConsent('marketing');
    updateStates();
  };
  const hide = () => {
    panel.hidden = true; button.setAttribute('aria-expanded', 'false');
    // A mobile footer control must not scroll visitors away from their current content.
    const bounds = button.getBoundingClientRect();
    if (bounds.top >= 0 && bounds.bottom <= window.innerHeight) button.focus({preventScroll: true});
  };
  const open = () => {
    syncChoices(); status.textContent = '';
    panel.hidden = false; button.setAttribute('aria-expanded', 'true');
    positionPrivacyControls();
    form.elements.analytics.focus({preventScroll: true});
  };
  button.addEventListener('click', () => panel.hidden ? open() : hide());
  document.querySelectorAll('[data-open-privacy-settings]').forEach(control => control.addEventListener('click', open));
  panel.addEventListener('hae-meta-available', () => {
    updateMetaScope();
    if (!hasCurrentMarketingChoice()) {
      panel.hidden = false; button.setAttribute('aria-expanded', 'true');
      positionPrivacyControls();
    }
  });
  // Closing discards a staged marketing choice; only Save can grant permission.
  panel.querySelector('[data-close]').addEventListener('click', hide);
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') {event.preventDefault(); hide();}
  });
  const save = choice => {
    try {
      const saved = saveTrackingConsent(choice);
      if (!saved) {status.textContent = 'Choice applied for this page. Your browser could not save it for future visits.'; return;}
      hide();
    } catch {status.textContent = 'Your browser could not save the choice. Please try again.';}
  };
  form.elements.analytics.addEventListener('change', () => {
    const saved = saveTrackingConsent({analytics: form.elements.analytics.checked});
    updateStates();
    status.textContent = saved ? '' : 'Choice applied for this page. Your browser could not save it for future visits.';
  });
  form.elements.marketing.addEventListener('change', updateStates);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const choice = {analytics: form.elements.analytics.checked};
    if (!form.elements.marketing.disabled) choice.marketing = form.elements.marketing.checked;
    save(choice);
  });
  reject.addEventListener('click', () => save(form.elements.marketing.disabled ? {analytics: false} : {analytics: false, marketing: false}));
  document.body.append(panel);
  const footer = document.querySelector('[data-public-footer-links]') || document.querySelector('body > footer > div') || document.querySelector('body > footer, .footer');
  (footer || document.body).append(button);
  try {
    const choice = JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null');
    panel.hidden = choice?.analytics === false || choice?.version === CONSENT_VERSION && Date.now() >= choice.savedAt && Date.now() - choice.savedAt < 180 * 86400000;
  } catch {}
  updateMetaScope();
  if (metaPixelConfigured && !hasCurrentMarketingChoice()) panel.hidden = false;
  syncChoices(); button.setAttribute('aria-expanded', String(!panel.hidden));
  privacyPositionObserver?.disconnect();
  if ('ResizeObserver' in window) {
    privacyPositionObserver = new ResizeObserver(positionPrivacyControls);
    privacyPositionObserver.observe(panel);
    privacyPositionObserver.observe(button);
  }
  window.requestAnimationFrame(positionPrivacyControls);
}

if (globalThis.window?.addEventListener) {
  window.addEventListener('scroll', positionPrivacyControls, {capture: true, passive: true});
  window.addEventListener('resize', positionPrivacyControls);
  window.visualViewport?.addEventListener('resize', positionPrivacyControls);
  window.visualViewport?.addEventListener('scroll', positionPrivacyControls);
  window.addEventListener('storage', event => {
    if (event.key !== CONSENT_KEY) return;
    if (!hasTrackingConsent()) clearAnalyticsSession();
    window.dispatchEvent(new CustomEvent('hae-consent-change'));
    if (window.fbq && !hasTrackingConsent('marketing')) {window.fbq('consent','revoke'); location.reload();}
  });
}

if (typeof document !== 'undefined' && document.addEventListener) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installPrivacyControls, {once: true});
  else installPrivacyControls();
}

export function isOwnVisitExcluded() {
  try { return localStorage.getItem('hae-exclude-own-analytics') === '1'; }
  catch { return false; }
}

export function normalizeText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

export function normalizeTrackingValue(value, fallback = "", maxLength = 160) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
  return normalized || fallback;
}

export function normalizePublicUrl(value = "", { allowMailto = false } = {}) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue || /^(javascript|data):/i.test(normalizedValue)) {
    return "";
  }

  try {
    const parsed = new URL(normalizedValue, window.location.href);
    const allowedProtocols = allowMailto ? ["http:", "https:", "mailto:"] : ["http:", "https:"];
    if (allowedProtocols.includes(parsed.protocol)) {
      return parsed.href;
    }
  } catch (error) {
    return "";
  }

  return "";
}

export function normalizeImageUrl(value = "") {
  const normalizedValue = normalizePublicUrl(value);
  return normalizedValue.startsWith("mailto:") ? "" : normalizedValue;
}

export function getSessionId() {
  if (!hasTrackingConsent()) return '';
  const now = Date.now();
  try {
    memorySession = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null') || memorySession;
  } catch { /* Keep a page-memory session if storage is blocked. */ }
  if (!memorySession || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(memorySession.id) || !Number.isFinite(memorySession.startedAt) || !Number.isFinite(memorySession.lastAt) || now < memorySession.startedAt || now < memorySession.lastAt || now - memorySession.lastAt >= IDLE_MS || now - memorySession.startedAt >= 60 * 60000) {
    if (!globalThis.crypto?.randomUUID) return '';
    memorySession = {id: crypto.randomUUID(), startedAt: now, lastAt: now, count: 0};
  }
  memorySession.lastAt = now;
  try {sessionStorage.removeItem('hae-analytics-session-v2'); sessionStorage.setItem(SESSION_KEY, JSON.stringify(memorySession));} catch {}
  if (globalThis.window?.setTimeout) {
    window.clearTimeout(sessionExpiryTimer);
    const expiry=Math.min(memorySession.lastAt + IDLE_MS, memorySession.startedAt + 60 * 60000);
    sessionExpiryTimer=window.setTimeout(clearAnalyticsSession, Math.max(0,expiry-now));
  }
  return memorySession.id;
}

export function getTrackingParams(params = new URLSearchParams(window.location.search)) {
  return {
    campaign: analyticsText(params.get("campaign") || params.get("utm_campaign")),
    source: analyticsText(params.get("source") || params.get("utm_source")),
    medium: analyticsText(params.get("utm_medium"))
  };
}

export function normalizeEmailAddress(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function isValidEmailAddress(value = "") {
  const normalizedEmail = normalizeEmailAddress(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
}

export function createSiteAnalytics({
  db,
  doc,
  setDoc,
  serverTimestamp = () => new Date(),
  pagePath,
  pageName,
  isDisabled = false,
  getContext = () => ({}),
  maxEventsPerSession = 40,
  minEventIntervalMs = 600
}) {
  let sessionId = '';
  const pageSessionKey = `hae-page-view:${pagePath}`;
  const pageViews = new Set();
  let pendingPageView;
  let lastAnalyticsEventKey = "";
  let lastAnalyticsEventAt = 0;

  function buildEventPayload(action, details = {}) {
    const context = getContext() || {};

    return {
      sessionId,
      statisticsVersion: CONSENT_VERSION,
      action,
      page: analyticsPage(pagePath),
      pageName: analyticsText(pageName),
      target: analyticsText(details.target),
      label: analyticsText(details.label),
      href: analyticsOrigin(details.href),
      elementType: analyticsText(details.elementType),
      actionSubtype: analyticsText(details.actionSubtype),
      platform: analyticsText(details.platform),
      section: analyticsText(details.section || context.section),
      outbound: details.outbound ?? false,
      campaign: analyticsText(context.campaign),
      campaignSlug: analyticsText(context.campaignSlug),
      source: analyticsText(context.source),
      medium: analyticsText(context.medium),
      referrer: analyticsOrigin(context.referrer ?? document.referrer),
      browser: browserCategory(),
      os: osCategory(),
      device: /iPad|Tablet/i.test(globalThis.navigator?.userAgent || '') ? 'tablet' : /Mobile|Android|iPhone/i.test(globalThis.navigator?.userAgent || '') ? 'mobile' : 'desktop',
      durationSeconds: Math.min(1800, Math.max(0, Math.round(Number(details.durationSeconds) || 0))),
      timestamp: serverTimestamp(),
      expiresAt: new Date(Date.now() + 2 * 60 * 60000)
    };
  }

  function shouldLogEvent(action, details = {}) {
    const now = Date.now();
    const eventKey = [
      action,
      details.actionSubtype || "",
      details.target || "",
      details.href || ""
    ].join("|");

    if (eventKey === lastAnalyticsEventKey && now - lastAnalyticsEventAt < minEventIntervalMs) {
      return false;
    }

    lastAnalyticsEventKey = eventKey;
    lastAnalyticsEventAt = now;

    if (!memorySession || memorySession.count >= maxEventsPerSession) return false;
    memorySession.count++;
    try {sessionStorage.setItem(SESSION_KEY, JSON.stringify(memorySession));} catch {}
    return true;
  }

  async function logEvent(action, details = {}) {
    if (isDisabled || !hasTrackingConsent() || isOwnVisitExcluded()) {
      return;
    }
    sessionId = getSessionId();
    if (!sessionId || !shouldLogEvent(action, details)) return;

    try {
      const docId = crypto.randomUUID();
      await setDoc(doc(db, "site-actions", docId), buildEventPayload(action, details));
    } catch (error) {
      // Analytics failure must not expose payloads or interrupt navigation.
    }
  }

  async function logPageViewOnce(details = {}, storageKey = pageSessionKey) {
    const key = analyticsPage(pagePath);
    if (isDisabled || isOwnVisitExcluded() || documentPageViews.has(key)) return;
    if (!hasTrackingConsent()) {pendingPageView = {details, storageKey}; return;}
    pendingPageView = undefined;
    pageViews.add(key); documentPageViews.add(key);
    await logEvent("page_view", details);
  }

  if (typeof window !== 'undefined' && window.addEventListener) {
    let startedAt = Date.now();
    window.addEventListener('pagehide', () => {
      if (pageViews.size) void logEvent('page_exit', {durationSeconds: (Date.now() - startedAt) / 1000});
    });
    window.addEventListener('hae-consent-change', () => {
      if (!hasTrackingConsent()) {sessionId = ''; pageViews.clear(); documentPageViews.clear(); return;}
      startedAt = Date.now(); void logPageViewOnce(pendingPageView?.details, pendingPageView?.storageKey);
    });
  }

  return {
    get sessionId() { return sessionId; },
    pageSessionKey,
    logEvent,
    logPageViewOnce,
    buildEventPayload
  };
}

export function analyticsText(value = '') {
  const text = String(value || '').trim();
  if (/@|https?:|\d{7,}|[a-f0-9]{24,}|[a-z0-9_-]{40,}/i.test(text)) return '';
  return text.replace(/[^a-zA-Z0-9 _.,!()'&+-]/g, '').slice(0, 100);
}
export function analyticsOrigin(value = '') {
  try {const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && /^https?:\/\/[a-zA-Z][a-zA-Z0-9-]*(\.[a-zA-Z0-9-]+)+$/.test(url.origin) ? url.origin : '';} catch {return '';}
}
export function analyticsPage(value = '/') {
  const page = String(value).split(/[?#]/)[0];
  return !/\d{7,}|[a-f0-9]{24,}|[a-z0-9_-]{40,}/i.test(page) && /^\/(?:|(?:index|links|tickets|smartlink|privacy|epk)(?:\.html)?\/?|(?:join|join-us|store|shows|live-dates)\/?|(?:shows|smartlink)\/[a-zA-Z0-9_-]{1,60}\/?|404\.html)$/.test(page) ? page : '/other';
}
function browserCategory() {
  const ua = globalThis.navigator?.userAgent || '';
  return /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Other';
}
function osCategory() {
  const ua = globalThis.navigator?.userAgent || '';
  return /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Other';
}

export function createEmailSignupService({
  db,
  doc,
  setDoc,
  collectionName = "mailing-list-signups",
  getContext = () => ({})
}) {
  async function submitEmailSignup(email, details = {}) {
    const normalizedEmail = normalizeEmailAddress(email);
    if (!isValidEmailAddress(normalizedEmail)) {
      throw new Error("Please enter a valid email address.");
    }

    const signupDocRef = doc(db, collectionName, normalizedEmail);
    const context = getContext() || {};
    const now = new Date();

    const payload = {
      email: normalizedEmail,
      sourcePage: normalizeTrackingValue(context.pageName, "", 80),
      pagePath: normalizeTrackingValue(context.pagePath, "", 200),
      campaign: normalizeTrackingValue(context.campaign, "", 160),
      campaignSlug: normalizeTrackingValue(context.campaignSlug, "", 160),
      source: normalizeTrackingValue(context.source, "", 80),
      medium: normalizeTrackingValue(context.medium, "", 80),
      referrer: hasTrackingConsent() ? analyticsOrigin(context.referrer ?? document.referrer) : '',
      signupLabel: normalizeTrackingValue(details.label, "Mailing list", 80),
      signupCount: 1,
      createdAt: now,
      updatedAt: now
    };

    await setDoc(signupDocRef, payload, { merge: true });

    return {
      email: normalizedEmail
    };
  }

  return {
    submitEmailSignup
  };
}
