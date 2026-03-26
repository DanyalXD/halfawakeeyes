export const firebaseConfig = {
  apiKey: "AIzaSyAv7G28uXxlQNG_HMLbBkuz4xseXzOzm4Y",
  authDomain: "half-awake-eyes.firebaseapp.com",
  projectId: "half-awake-eyes"
};

export const PUBLIC_MIRROR_DOC_ID = "public-index";

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

export function getSessionId(storageKey = "hae-session-id") {
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) {
      return existing;
    }
    const created = `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(storageKey, created);
    return created;
  } catch (error) {
    return `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function getTrackingParams(params = new URLSearchParams(window.location.search)) {
  return {
    userId: normalizeTrackingValue(params.get("id"), "unknown", 80),
    campaign: normalizeTrackingValue(params.get("campaign") || params.get("utm_campaign"), "", 120),
    source: normalizeTrackingValue(params.get("source") || params.get("utm_source"), "", 80),
    medium: normalizeTrackingValue(params.get("utm_medium"), "", 80)
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
  pagePath,
  pageName,
  isDisabled = false,
  getContext = () => ({}),
  maxEventsPerSession = 40,
  minEventIntervalMs = 600
}) {
  const sessionId = getSessionId();
  const pageSessionKey = `hae-page-view:${pagePath}`;
  const analyticsThrottleKey = `hae-analytics-count:${pagePath}`;
  let lastAnalyticsEventKey = "";
  let lastAnalyticsEventAt = 0;

  function buildEventPayload(action, details = {}) {
    const context = getContext() || {};

    return {
      userId: normalizeTrackingValue(context.userId, "unknown", 80),
      sessionId,
      action,
      page: pagePath,
      pageName,
      target: normalizeTrackingValue(details.target, "", 160),
      label: normalizeTrackingValue(details.label, "", 160),
      href: normalizeTrackingValue(details.href, "", 600),
      elementType: normalizeTrackingValue(details.elementType, "", 40),
      actionSubtype: normalizeTrackingValue(details.actionSubtype, "", 60),
      platform: normalizeTrackingValue(details.platform, "", 60),
      section: normalizeTrackingValue(details.section, normalizeTrackingValue(context.section, "", 80), 80),
      outbound: details.outbound ?? false,
      campaign: normalizeTrackingValue(context.campaign, "", 160),
      campaignSlug: normalizeTrackingValue(context.campaignSlug, "", 160),
      source: normalizeTrackingValue(context.source, "", 80),
      medium: normalizeTrackingValue(context.medium, "", 80),
      referrer: normalizeTrackingValue(context.referrer ?? document.referrer, "", 600),
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      timestamp: new Date()
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

    try {
      const currentCount = Number.parseInt(sessionStorage.getItem(analyticsThrottleKey) || "0", 10);
      if (currentCount >= maxEventsPerSession) {
        return false;
      }
      sessionStorage.setItem(analyticsThrottleKey, String(currentCount + 1));
    } catch (error) {
      // Ignore storage failures and fall back to in-memory throttling only.
    }

    return true;
  }

  async function logEvent(action, details = {}) {
    if (isDisabled || !shouldLogEvent(action, details)) {
      return;
    }

    try {
      const { userId } = getContext() || {};
      const docId = `${normalizeTrackingValue(userId, "unknown", 80)}-${sessionId}-${Date.now()}-${action}`;
      await setDoc(doc(db, "site-actions", docId), buildEventPayload(action, details));
    } catch (error) {
      console.error("Logging error:", error);
    }
  }

  async function logPageViewOnce(details = {}, storageKey = pageSessionKey) {
    try {
      if (!sessionStorage.getItem(storageKey)) {
        sessionStorage.setItem(storageKey, "1");
        await logEvent("page_view", details);
      }
    } catch (error) {
      await logEvent("page_view", details);
    }
  }

  return {
    sessionId,
    pageSessionKey,
    logEvent,
    logPageViewOnce,
    buildEventPayload
  };
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
      referrer: normalizeTrackingValue(context.referrer ?? document.referrer, "", 600),
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
