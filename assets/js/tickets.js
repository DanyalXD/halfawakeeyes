import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { doc, getDoc, getFirestore, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  createSiteAnalytics,
  firebaseConfig,
  getTrackingParams,
  normalizeImageUrl,
  normalizePublicUrl
} from "./public-site-utils.js";

const params = new URLSearchParams(window.location.search);
const gigId = params.get("gig") || "";
const isLocalPreview =
  window.location.protocol === "file:" ||
  window.location.hostname === "" ||
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1" ||
  window.location.hostname === "::1";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const { userId, campaign, source, medium } = getTrackingParams(params);
const pagePath = window.location.pathname || "/tickets.html";
const pageName = pagePath.split("/").pop() || "tickets";
const REDIRECT_DELAY_MS = 1600;
const GBP_SYMBOL = String.fromCharCode(163);
const DOOR_PRICE_MIN_SAVING_TO_SHOW_GBP = 2;
const DEFAULT_TICKET_ARTWORK = normalizeImageUrl("assets/images/HalfAwakeEyes-annicmrn-07798.jpg");
const LOAD_ERROR_FALLBACK_TICKET_URL = normalizePublicUrl("https://www.skiddle.com/e/42284196");
// Localhost/file preview should still read gigs from Firestore; this only disables analytics writes.
const disableFirestoreAnalytics = isLocalPreview;

const { logEvent } = createSiteAnalytics({
  db,
  doc,
  setDoc,
  pagePath,
  pageName,
  isDisabled: disableFirestoreAnalytics,
  getContext: () => ({
    userId,
    campaign,
    source,
    medium,
    section: "tickets"
  })
});

const elements = {
  ticketBadge: document.getElementById("ticket-badge"),
  ticketState: document.getElementById("ticket-state"),
  ticketTitle: document.getElementById("ticket-title"),
  ticketSubtitle: document.getElementById("ticket-subtitle"),
  ticketDescription: document.getElementById("ticket-description"),
  ticketDate: document.getElementById("ticket-date"),
  ticketVenue: document.getElementById("ticket-venue"),
  ticketDateDetail: document.getElementById("ticket-date-detail"),
  ticketVenueDetail: document.getElementById("ticket-venue-detail"),
  ticketPriceRail: document.getElementById("ticket-price-rail"),
  ticketPriceChip: document.getElementById("ticket-price-chip"),
  ticketDoorPriceChip: document.getElementById("ticket-door-price-chip"),
  ticketRedirectStatus: document.getElementById("ticket-redirect-status"),
  ticketContinue: document.getElementById("ticket-continue"),
  ticketContinueSticky: document.getElementById("ticket-continue-sticky"),
  stickyCtaShell: document.getElementById("sticky-cta-shell"),
  ticketTrustCopy: document.getElementById("ticket-trust-copy"),
  ticketNote: document.getElementById("ticket-note"),
  ticketProgressFill: document.getElementById("ticket-progress-fill"),
  ticketArtwork: document.getElementById("ticket-artwork"),
  ticketArtworkFallback: document.getElementById("ticket-artwork-fallback"),
  artOverlayChip: document.getElementById("art-overlay-chip"),
  artCaptionTitle: document.getElementById("art-caption-title"),
  artCaptionNote: document.getElementById("art-caption-note")
};

let activeGig = null;
let activeMetaPixelId = "";
let metaPageViewTracked = false;
let redirectTimer = 0;
let redirectStarted = false;
let activeTicketProvider = "";

if (elements.ticketBadge) {
  disableBadgeLink();
}

if (elements.ticketArtwork) {
  elements.ticketArtwork.addEventListener("error", () => {
    const currentSrc = elements.ticketArtwork.getAttribute("src") || "";
    if (currentSrc.includes("HalfAwakeEyes-annicmrn-07798.jpg")) {
      elements.ticketArtwork.hidden = true;
      elements.ticketArtwork.removeAttribute("src");
      elements.ticketArtwork.alt = "";
      if (elements.ticketArtworkFallback) {
        elements.ticketArtworkFallback.hidden = false;
      }
      return;
    }

    applyArtwork(DEFAULT_TICKET_ARTWORK, activeGig?.event || "Live show");
  });
}

function setText(element, value = "") {
  if (!element) {
    return;
  }
  element.textContent = value;
}

function setOptionalText(element, value = "") {
  if (!element) {
    return;
  }
  const normalized = String(value || "").trim();
  element.textContent = normalized;
  element.hidden = !normalized;
}

function setTicketNote(value = "") {
  setOptionalText(elements.ticketNote, value);
}

function setTrustCopy(providerLabel = "") {
  if (!elements.ticketTrustCopy) {
    return;
  }
  elements.ticketTrustCopy.textContent = "";
  elements.ticketTrustCopy.hidden = true;
}

function setPriceChip(element, value = "") {
  if (!element) {
    return;
  }
  const normalized = String(value || "").trim();
  element.textContent = normalized;
  element.hidden = !normalized;
}

function setPriceRail({ ticket = "", door = "" } = {}) {
  setPriceChip(elements.ticketPriceChip, "");
  setPriceChip(elements.ticketDoorPriceChip, "");

  if (!elements.ticketPriceRail) {
    return;
  }

  elements.ticketPriceRail.hidden = true;
}

function disableBadgeLink() {
  if (!elements.ticketBadge) {
    return;
  }

  elements.ticketBadge.removeAttribute("href");
  elements.ticketBadge.onclick = null;
  elements.ticketBadge.setAttribute("aria-disabled", "true");
  elements.ticketBadge.classList.add("is-disabled");
}

function enableBadgeLink(ticketUrl) {
  if (!elements.ticketBadge || !ticketUrl) {
    return;
  }

  elements.ticketBadge.href = ticketUrl;
  elements.ticketBadge.setAttribute("aria-disabled", "false");
  elements.ticketBadge.classList.remove("is-disabled");
  elements.ticketBadge.onclick = (event) => {
    event.preventDefault();
    redirectToTickets("manual");
  };
}
//Get Ticket
function getTicketButtons() {
  return [elements.ticketContinue, elements.ticketContinueSticky].filter(Boolean);
}

function hideTicketButtons() {
  if (elements.stickyCtaShell) {
    elements.stickyCtaShell.hidden = true;
  }
  getTicketButtons().forEach((button) => {
    button.hidden = true;
    button.onclick = null;
    button.removeAttribute("href");
  });
  setTrustCopy("");
}

function showTicketButtons(ticketUrl, buttonLabel = "Get Tickets") {
  if (elements.stickyCtaShell) {
    elements.stickyCtaShell.hidden = false;
  }
  getTicketButtons().forEach((button) => {
    button.hidden = false;
    button.href = ticketUrl;
    button.textContent = buttonLabel;
    button.onclick = (event) => {
      event.preventDefault();
      redirectToTickets("manual");
    };
  });
}

function normalizeMetaPixelId(value = "") {
  return String(value || "").replace(/\s+/g, "").trim();
}

function normalizeGigAutoRedirect(value) {
  return value === true || String(value || "").toLowerCase() === "true";
}

function normalizeTicketPrice(value = "") {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  const normalizedSeparators = raw.replace(/,/g, ".");
  const numericMatch = normalizedSeparators.match(/\d+(?:\.\d{1,2})?/);
  if (numericMatch) {
    return numericMatch[0];
  }

  return raw;
}

function normalizeTicketPriceIncludesFee(value) {
  return value === true || String(value || "").toLowerCase() === "true";
}

function normalizeGigEntry(gig = {}, id = "") {
  return {
    id,
    date: String(gig?.date || "").trim(),
    event: String(gig?.event || "").trim(),
    venue: String(gig?.venue || "").trim(),
    city: String(gig?.city || "").trim(),
    ticketUrl: normalizePublicUrl(gig?.ticketUrl),
    ticketPrice: normalizeTicketPrice(gig?.ticketPrice),
    doorPrice: normalizeTicketPrice(gig?.doorPrice),
    ticketPriceIncludesFee: normalizeTicketPriceIncludesFee(gig?.ticketPriceIncludesFee),
    autoRedirect: normalizeGigAutoRedirect(gig?.autoRedirect),
    imageUrl: normalizeImageUrl(gig?.imageUrl),
    metaPixelId: normalizeMetaPixelId(gig?.metaPixelId),
    hidden: gig?.hidden === true || String(gig?.hidden || "").toLowerCase() === "true"
  };
}

function isGigHidden(gig) {
  return gig?.hidden === true || String(gig?.hidden || "").toLowerCase() === "true";
}

function hasGigTicketLink(gig) {
  return Boolean(String(gig?.ticketUrl || "").trim());
}

function formatProviderName(value = "") {
  return String(value || "")
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getTicketProviderLabel(ticketUrl) {
  const normalizedUrl = normalizePublicUrl(ticketUrl);
  if (!normalizedUrl) {
    return "Official seller";
  }

  try {
    const hostname = new URL(normalizedUrl).hostname.replace(/^www\./i, "").toLowerCase();
    if (!hostname) {
      return "Official seller";
    }

    const knownProviders = [
      [/ticketmaster\./, "Ticketmaster"],
      [/eventbrite\./, "Eventbrite"],
      [/seetickets\./, "See Tickets"],
      [/songkick\./, "Songkick"],
      [/bandsintown\./, "Bandsintown"],
      [/ticketweb\./, "TicketWeb"],
      [/dice\./, "DICE"],
      [/universe\./, "Universe"],
      [/axs\./, "AXS"],
      [/skiddle\./, "Skiddle"]
    ];

    const knownMatch = knownProviders.find(([pattern]) => pattern.test(hostname));
    if (knownMatch) {
      return knownMatch[1];
    }

    const segments = hostname.split(".");
    const root = segments.length >= 2 ? segments[segments.length - 2] : segments[0];
    const normalizedRoot = formatProviderName(root);
    return normalizedRoot || "Official seller";
  } catch (error) {
    return "Official seller";
  }
}

function formatTicketPriceValue(value = "") {
  return formatDisplayPrice(value);
}

function getTicketPriceLine(gig = {}) {
  return getTicketPriceContextLine(gig);
}

function getPrimaryCtaLabel(providerLabel = "") {
  if (providerLabel && providerLabel !== "Official seller") {
    return `Get Tickets on ${providerLabel}`;
  }
  return "Get Tickets";
}

function formatDisplayPrice(value = "") {
  const normalized = normalizeTicketPrice(value);
  if (!normalized) {
    return "";
  }

  if (/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    const numericValue = Number.parseFloat(normalized);
    if (!Number.isFinite(numericValue)) {
      return "";
    }
    const decimalPlaces = normalized.includes(".") ? normalized.split(".")[1].length : 0;
    const fixed = decimalPlaces > 0 ? numericValue.toFixed(Math.min(decimalPlaces, 2)) : numericValue.toFixed(0);
    return `${GBP_SYMBOL}${fixed}`;
  }

  return normalized;
}

function getTicketPriceContextLine(gig = {}) {
  const advancePrice = formatDisplayPrice(gig?.ticketPrice);
  const doorPrice = formatDisplayPrice(gig?.doorPrice);
  if (!advancePrice && !doorPrice) {
    return "Official tickets";
  }

  const advanceNumeric = Number.parseFloat(normalizeTicketPrice(gig?.ticketPrice));
  const doorNumeric = Number.parseFloat(normalizeTicketPrice(gig?.doorPrice));
  const hasNumericPrices = Number.isFinite(advanceNumeric) && Number.isFinite(doorNumeric);
  const hasMeaningfulDoorGap = !hasNumericPrices || (doorNumeric - advanceNumeric) >= DOOR_PRICE_MIN_SAVING_TO_SHOW_GBP;

  const lineParts = [];
  if (advancePrice) {
    const bookingFeeLabel = gig?.ticketPriceIncludesFee === true ? "(BF included)" : "+ BF";
    lineParts.push(`Advance ${advancePrice} ${bookingFeeLabel}`);
  }
  if (doorPrice && (!advancePrice || hasMeaningfulDoorGap)) {
    lineParts.push(`Door ${doorPrice}`);
  }

  return lineParts.join(" | ");
}

function getTicketPriceChipLabels(gig = {}) {
  const advancePrice = formatDisplayPrice(gig?.ticketPrice);
  const doorPrice = formatDisplayPrice(gig?.doorPrice);

  return {
    ticket: advancePrice
      ? `Advance ${advancePrice}${gig?.ticketPriceIncludesFee === true ? " BF included" : " + BF"}`
      : "",
    door: doorPrice ? `Door ${doorPrice}` : ""
  };
}

function parseGigDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "object" && typeof value.seconds === "number") {
    const fromTimestamp = new Date(value.seconds * 1000);
    return Number.isNaN(fromTimestamp.getTime()) ? null : fromTimestamp;
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const fromDateInput = new Date(`${value.trim()}T00:00:00`);
    return Number.isNaN(fromDateInput.getTime()) ? null : fromDateInput;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getGigDateOnly(value) {
  const parsed = parseGigDate(value);
  if (!parsed) {
    return null;
  }

  const dateOnly = new Date(parsed);
  dateOnly.setHours(0, 0, 0, 0);
  return dateOnly;
}

function formatGigDate(value) {
  const parsed = getGigDateOnly(value);
  if (!parsed) {
    return "";
  }

  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function getVenueLine(gig) {
  return [gig?.venue, gig?.city].filter(Boolean).join(", ");
}

function isUpcomingGig(gig) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const gigDate = getGigDateOnly(gig?.date);
  return Boolean(gigDate && gigDate >= today);
}

function setStateChip(text, { warning = false } = {}) {
  if (!elements.ticketState) {
    return;
  }
  elements.ticketState.hidden = !text;
  elements.ticketState.textContent = text;
  elements.ticketState.classList.toggle("is-warning", warning);
}

function setMetaChip(element, value) {
  if (!element) {
    return;
  }

  if (!value) {
    element.hidden = true;
    element.textContent = "";
    return;
  }

  element.hidden = false;
  element.textContent = value;
}

function setSummaryValue(element, value, fallback = "TBC") {
  if (!element) {
    return;
  }
  element.textContent = value || fallback;
}

function setRedirectStatus(value = "") {
  if (!elements.ticketRedirectStatus) {
    return;
  }
  elements.ticketRedirectStatus.hidden = !value;
  elements.ticketRedirectStatus.textContent = value;
}

function resetRedirectProgress() {
  if (!elements.ticketProgressFill) {
    return;
  }
  elements.ticketProgressFill.classList.remove("is-running");
  elements.ticketProgressFill.style.animationDuration = "";
  elements.ticketProgressFill.style.transform = "scaleX(0)";
}

function startRedirectProgress() {
  if (!elements.ticketProgressFill) {
    return;
  }
  resetRedirectProgress();
  elements.ticketProgressFill.style.animationDuration = `${REDIRECT_DELAY_MS}ms`;
  void elements.ticketProgressFill.offsetWidth;
  elements.ticketProgressFill.classList.add("is-running");
}

function completeRedirectProgress() {
  if (!elements.ticketProgressFill) {
    return;
  }
  elements.ticketProgressFill.classList.remove("is-running");
  elements.ticketProgressFill.style.animationDuration = "";
  elements.ticketProgressFill.style.transform = "scaleX(1)";
}

function applyArtwork(url, title) {
  if (!elements.ticketArtwork || !elements.ticketArtworkFallback) {
    return;
  }

  const cleanUrl = normalizeImageUrl(url) || DEFAULT_TICKET_ARTWORK;
  if (!cleanUrl) {
    elements.ticketArtwork.hidden = true;
    elements.ticketArtwork.removeAttribute("src");
    elements.ticketArtwork.alt = "";
    elements.ticketArtworkFallback.hidden = false;
    return;
  }

  elements.ticketArtwork.hidden = false;
  elements.ticketArtwork.src = cleanUrl;
  elements.ticketArtwork.alt = title ? `${title} artwork` : "Gig artwork";
  elements.ticketArtworkFallback.hidden = true;
}

function initializeMetaPixel(pixelId) {
  if (!pixelId || activeMetaPixelId === pixelId) {
    return;
  }

  if (!window.fbq) {
    (function(f, b, e, v, n, t, s) {
      if (f.fbq) {
        return;
      }
      n = f.fbq = function() {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) {
        f._fbq = n;
      }
      n.push = n;
      n.loaded = true;
      n.version = "2.0";
      n.queue = [];
      t = b.createElement(e);
      t.async = true;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  }

  window.fbq("init", pixelId);
  activeMetaPixelId = pixelId;
  metaPageViewTracked = false;
}

function trackMetaPageView() {
  if (!activeMetaPixelId || metaPageViewTracked || typeof window.fbq !== "function") {
    return;
  }

  window.fbq("track", "PageView");
  metaPageViewTracked = true;
}

function trackMetaEvent(eventName, details = {}) {
  if (!activeMetaPixelId || typeof window.fbq !== "function") {
    return;
  }

  window.fbq("trackCustom", eventName, {
    gig_name: activeGig?.event || "",
    gig_date: formatGigDate(activeGig?.date),
    venue_name: activeGig?.venue || "",
    destination_label: details.label || "",
    destination_url: details.url || "",
    redirect_type: details.type || "",
    page_name: pageName
  });
}

function renderUnavailable(title, subtitle, description) {
  activeTicketProvider = "";
  document.title = "Half Awake Eyes | Tickets Unavailable";
  setText(elements.ticketBadge, "Official Tickets");
  disableBadgeLink();
  setStateChip("Not live", { warning: true });
  setRedirectStatus("");
  setText(elements.ticketTitle, title);
  setOptionalText(elements.ticketSubtitle, subtitle);
  setOptionalText(elements.ticketDescription, description);
  setMetaChip(elements.ticketDate, "");
  setMetaChip(elements.ticketVenue, "");
  setSummaryValue(elements.ticketDateDetail, "", "Unavailable");
  setSummaryValue(elements.ticketVenueDetail, "", "Unavailable");
  setPriceRail({});
  setRedirectStatus("Offline");
  hideTicketButtons();
  setTicketNote("This ticket page is only available for upcoming shows.");
  setTrustCopy("");
  setText(elements.artOverlayChip, "Unavailable");
  applyArtwork("", "");
  setText(elements.artCaptionTitle, "Half Awake Eyes");
  setText(elements.artCaptionNote, "Official tickets and live dates.");
  resetRedirectProgress();
}

async function redirectToTickets(type = "auto") {
  if (redirectStarted || !activeGig?.ticketUrl) {
    return;
  }

  redirectStarted = true;
  window.clearTimeout(redirectTimer);
  setStateChip("Opening Tickets");
  setRedirectStatus("");
  setTicketNote(activeTicketProvider ? `Opening tickets on ${activeTicketProvider}...` : "Opening tickets...");
  completeRedirectProgress();

  const ticketUrl = normalizePublicUrl(activeGig.ticketUrl);
  trackMetaEvent("GigTicketRedirect", {
    label: activeGig.event || "Live show",
    url: ticketUrl,
    type
  });

  await Promise.race([
    logEvent("ticket_redirect_continue", {
      label: activeGig.event || "Live show",
      target: activeGig.event || ticketUrl,
      href: ticketUrl,
      elementType: "link",
      actionSubtype: type,
      section: "tickets",
      outbound: true
    }),
    new Promise((resolve) => window.setTimeout(resolve, 220))
  ]);

  window.location.replace(ticketUrl);
}

async function redirectToLoadErrorFallback() {
  if (redirectStarted || !LOAD_ERROR_FALLBACK_TICKET_URL) {
    return false;
  }

  redirectStarted = true;
  window.clearTimeout(redirectTimer);
  setStateChip("Opening Tickets");
  setRedirectStatus("");
  setTicketNote("Opening tickets on Skiddle...");
  completeRedirectProgress();
  setPriceRail({});
  showTicketButtons(LOAD_ERROR_FALLBACK_TICKET_URL, "Get Tickets on Skiddle");
  setTrustCopy("Skiddle");
  getTicketButtons().forEach((button) => {
    button.onclick = null;
  });

  await Promise.race([
    logEvent("ticket_redirect_unavailable", {
      label: "Load failure",
      target: gigId,
      href: LOAD_ERROR_FALLBACK_TICKET_URL,
      elementType: "link",
      actionSubtype: "load_error",
      section: "tickets",
      outbound: true
    }),
    new Promise((resolve) => window.setTimeout(resolve, 220))
  ]);

  window.location.replace(LOAD_ERROR_FALLBACK_TICKET_URL);
  return true;
}

function renderGig(gig) {
  activeGig = gig;
  const ticketUrl = normalizePublicUrl(gig.ticketUrl);
  const formattedDate = formatGigDate(gig.date);
  const venueLine = getVenueLine(gig);
  const shouldAutoRedirect = gig.autoRedirect === true;
  const ticketProvider = getTicketProviderLabel(ticketUrl);
  const ticketPriceLine = getTicketPriceContextLine(gig);
  const priceChips = getTicketPriceChipLabels(gig);
  const ctaLabel = getPrimaryCtaLabel(ticketProvider);
  activeTicketProvider = ticketProvider;
  const providerBadgeLabel = ticketProvider && ticketProvider !== "Official seller"
    ? `Official Tickets - ${ticketProvider}`
    : "Official Tickets";

  document.title = `${gig.event || "Live show"} | Tickets`;
  setText(elements.ticketBadge, providerBadgeLabel);
  disableBadgeLink();
  setStateChip(shouldAutoRedirect ? "Redirecting" : "");
  setRedirectStatus("");
  setText(elements.ticketTitle, gig.event || "Live show");
  setPriceRail(priceChips);
  setOptionalText(elements.ticketSubtitle, ticketPriceLine);
  setOptionalText(elements.ticketDescription, "");
  setMetaChip(elements.ticketDate, formattedDate);
  setMetaChip(elements.ticketVenue, venueLine);
  setSummaryValue(elements.ticketDateDetail, formattedDate, "Date TBC");
  setSummaryValue(elements.ticketVenueDetail, venueLine, "Venue TBC");
  showTicketButtons(ticketUrl, ctaLabel);
  setTrustCopy("");
  setTicketNote(shouldAutoRedirect ? `Opening tickets on ${ticketProvider}...` : "");
  setText(elements.artOverlayChip, "Upcoming");
  applyArtwork(gig.imageUrl, gig.event || "Live show");
  setText(elements.artCaptionTitle, "Half Awake Eyes");
  setText(elements.artCaptionNote, "Official tickets and live dates.");
  if (shouldAutoRedirect) {
    startRedirectProgress();
  } else {
    resetRedirectProgress();
  }

}

async function loadGig() {
  if (!gigId) {
    renderUnavailable(
      "No show selected",
      "This ticket page needs a gig ID in the URL.",
      "Open a valid show link from the links page."
    );
    await logEvent("ticket_redirect_unavailable", {
      label: "No show selected",
      target: "missing_gig_id",
      actionSubtype: "missing_gig_id",
      section: "tickets"
    });
    return;
  }

  try {
    const snapshot = await getDoc(doc(db, "gigs", gigId));

    if (!snapshot.exists()) {
      renderUnavailable(
        "Show not found",
        "We could not find this gig in the current schedule.",
        "The link may be out of date."
      );
      await logEvent("ticket_redirect_unavailable", {
        label: "Show not found",
        target: gigId,
        actionSubtype: "missing_gig",
        section: "tickets"
      });
      return;
    }

    const gig = normalizeGigEntry(snapshot.data(), snapshot.id);

    if (isGigHidden(gig) || !hasGigTicketLink(gig) || !isUpcomingGig(gig)) {
      renderUnavailable(
        "Tickets not live right now",
        "This show is hidden, missing a ticket URL, or no longer upcoming.",
        "Only upcoming gigs with a ticket URL stay available on this page."
      );
      await logEvent("ticket_redirect_unavailable", {
        label: gig.event || "Live show",
        target: gig.id,
        actionSubtype: "gig_not_live",
        section: "tickets"
      });
      return;
    }

    activeGig = gig;

    if (gig.metaPixelId) {
      initializeMetaPixel(gig.metaPixelId);
      trackMetaPageView();
      trackMetaEvent("GigTicketView", {
        label: gig.event || "Live show",
        url: gig.ticketUrl,
        type: "view"
      });
    }

    renderGig(gig);

    await logEvent("page_view", {
      label: gig.event || "Live show",
      target: gig.event || gig.ticketUrl,
      href: gig.ticketUrl,
      elementType: "page",
      actionSubtype: "ticket_redirect",
      section: "tickets",
      outbound: true
    });

    if (gig.autoRedirect === true) {
      redirectTimer = window.setTimeout(() => {
        redirectToTickets("auto");
      }, REDIRECT_DELAY_MS);
    }
  } catch (error) {
    console.error("Error loading gig ticket page:", error);
    renderUnavailable(
      "Could not load this show",
      "There was a problem fetching the gig details just now.",
      "Please try again in a moment."
    );
    await redirectToLoadErrorFallback();
  }
}

loadGig();
