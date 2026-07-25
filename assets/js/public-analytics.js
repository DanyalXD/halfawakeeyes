import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { doc, getFirestore, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { createSiteAnalytics, firebaseConfig, getTrackingParams, normalizeText } from "./public-site-utils.js";

const local = ["", "localhost", "127.0.0.1"].includes(location.hostname) || location.protocol === "file:";
const pagePath = location.pathname || "/";
const pageName = pagePath.split("/").filter(Boolean).pop() || "home";
const tracking = getTrackingParams();
const { logEvent, logPageViewOnce } = createSiteAnalytics({
  db: getFirestore(initializeApp(firebaseConfig)),
  doc,
  setDoc,
  pagePath,
  pageName,
  isDisabled: local,
  getContext: () => tracking
});

logPageViewOnce({ label: document.title, target: pageName });

document.addEventListener("click", event => {
  const element = event.target.closest("a, button");
  if (!element) return;

  const label = normalizeText(element.innerText || element.getAttribute("aria-label") || "");
  const href = element.tagName === "A" ? element.href : "";
  logEvent("click", {
    label,
    target: label || href || "button",
    href,
    elementType: element.tagName.toLowerCase(),
    actionSubtype: element.tagName === "A" ? "link" : "button",
    section: element.closest("section")?.id || (element.closest("header") ? "header" : element.closest("footer") ? "footer" : ""),
    outbound: Boolean(href && new URL(href, location.href).origin !== location.origin)
  });
});
