import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { doc, getDoc, getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { firebaseConfig, normalizePublicUrl, PUBLIC_MIRROR_DOC_ID } from "./public-site-utils.js";

const list = document.getElementById("public-show-list");
const db = getFirestore(initializeApp(firebaseConfig));
const today = new Date();
today.setHours(0, 0, 0, 0);

const parseDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? new Date(`${value}T00:00:00`) : new Date(value);

try {
  const snapshot = await getDoc(doc(db, "gigs", PUBLIC_MIRROR_DOC_ID));
  const shows = (snapshot.data()?.items || [])
    .filter(show => {
      const date = parseDate(show.date);
      const hidden = show.hideFromLinks === true || String(show.hideFromLinks).toLowerCase() === "true";
      return !hidden && !Number.isNaN(date.getTime()) && date >= today;
    })
    .sort((a, b) => parseDate(a.date) - parseDate(b.date));

  list.replaceChildren();
  if (!shows.length) {
    list.innerHTML = '<p class="show-state">No upcoming dates announced. Check back soon.</p>';
  }

  shows.forEach(show => {
    const row = document.createElement("article");
    row.className = "show-row";
    const date = parseDate(show.date);
    const day = date.toLocaleDateString("en-GB", { day: "2-digit" });
    const month = date.toLocaleDateString("en-GB", { month: "short" });
    const year = date.toLocaleDateString("en-GB", { year: "numeric" });
    const ticketUrl = normalizePublicUrl(show.ticketUrl);
    row.innerHTML = `<time class="show-date" datetime="${show.date}"><span>${day}</span><small>${month} ${year}</small></time><div class="show-info"><h3></h3><p></p></div>`;
    row.querySelector("h3").textContent = show.event || "Half Awake Eyes live";
    row.querySelector("p").textContent = [show.venue, show.city].filter(Boolean).join(" - ");
    if (ticketUrl) {
      const link = document.createElement("a");
      link.className = "button";
      link.href = ticketUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Tickets";
      row.appendChild(link);
    }
    list.appendChild(row);
  });
} catch (error) {
  console.error("Could not load upcoming shows.", error);
  list.innerHTML = '<p class="show-state">Upcoming dates are unavailable right now. Please check again soon.</p>';
}
