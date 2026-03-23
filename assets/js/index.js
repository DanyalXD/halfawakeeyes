import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
        import { getFirestore, doc, getDoc, setDoc, getDocs, collection, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

        const isLocal =
            window.location.protocol === "file:" ||
            window.location.hostname === "localhost" ||
            window.location.hostname === "127.0.0.1" ||
            window.location.hostname === "";

        const firebaseConfig = {
            apiKey: "AIzaSyAv7G28uXxlQNG_HMLbBkuz4xseXzOzm4Y",
            authDomain: "half-awake-eyes.firebaseapp.com",
            projectId: "half-awake-eyes"
        };

        const PUBLIC_MIRROR_DOC_ID = "public-index";

        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        const params = new URLSearchParams(window.location.search);
        const userId = params.get("id") || "unknown";
        const campaign = params.get("campaign") || params.get("utm_campaign") || "";
        const source = params.get("source") || params.get("utm_source") || "";
        const medium = params.get("utm_medium") || "";
        const pagePath = window.location.pathname || "/";
        const pageName = pagePath.split("/").pop() || "home";
        const pageSessionKey = `hae-page-view:${pagePath}`;

        const getSessionId = () => {
            try {
                const existing = sessionStorage.getItem("hae-session-id");
                if (existing) {
                    return existing;
                }
                const created = `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                sessionStorage.setItem("hae-session-id", created);
                return created;
            } catch (error) {
                return `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            }
        };

        const sessionId = getSessionId();

        const normalizeText = (value = "") => value.replace(/\s+/g, " ").trim();

        const buildEventPayload = (action, details = {}) => ({
            userId,
            sessionId,
            action,
            page: pagePath,
            pageName,
            target: details.target || "",
            label: details.label || "",
            href: details.href || "",
            elementType: details.elementType || "",
            actionSubtype: details.actionSubtype || "",
            section: details.section || "",
            outbound: details.outbound ?? false,
            campaign,
            source,
            medium,
            referrer: document.referrer || "",
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            timestamp: new Date()
        });

        const logEvent = async (action, details = {}) => {
            if (isLocal) {
                return;
            }

            try {
                const docId = `${userId}-${sessionId}-${Date.now()}-${action}`;
                await setDoc(doc(db, "site-actions", docId), buildEventPayload(action, details));
            } catch (e) {
                console.error("Logging error:", e);
            }
        };

        if (!window.location.pathname.includes("analytics.html")) {
            try {
                if (!sessionStorage.getItem(pageSessionKey)) {
                    sessionStorage.setItem(pageSessionKey, "1");
                    logEvent("page_view", {
                        label: document.title,
                        target: pageName
                    });
                }
            } catch (error) {
                logEvent("page_view", {
                    label: document.title,
                    target: pageName
                });
            }

            document.addEventListener("click", (e) => {
                const el = e.target.closest("a, button");
                if (el) {
                    const text = normalizeText(el.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || "");
                    const section = el.closest("section")?.id || (el.closest("header") ? "hero" : "");
                    let details = {
                        label: text,
                        elementType: el.tagName.toLowerCase(),
                        section
                    };

                    if (el.tagName === "A") {
                        const href = el.href || "#";
                        const hrefUrl = href.startsWith("http") ? new URL(href) : null;
                        details = {
                            ...details,
                            actionSubtype: "link",
                            target: text || href,
                            href,
                            outbound: hrefUrl ? hrefUrl.origin !== window.location.origin : false
                        };
                    } else if (el.tagName === "BUTTON") {
                        details = {
                            ...details,
                            actionSubtype: "button",
                            target: text || "button"
                        };
                    }
                    logEvent("click", details);
                }
            });

            document.querySelectorAll("video").forEach(video => {
                let hasLoggedPlay = false;

                video.addEventListener("play", () => {
                    if (hasLoggedPlay) {
                        return;
                    }
                    hasLoggedPlay = true;
                    const title = video.getAttribute("data-title") || video.querySelector("source")?.src?.split("/").pop() || "Unnamed video";
                    const section = video.closest("section")?.id || "";
                    logEvent("video_play", {
                        target: title,
                        label: title,
                        elementType: "video",
                        section
                    });
                });
            });
        }

        const normalizeGigEntry = (gig = {}, id = "") => ({
            id,
            date: String(gig?.date || "").trim(),
            event: String(gig?.event || "").trim(),
            venue: String(gig?.venue || "").trim(),
            city: String(gig?.city || "").trim(),
            ticketUrl: String(gig?.ticketUrl || "").trim(),
            imageUrl: String(gig?.imageUrl || "").trim(),
            hidden: gig?.hidden === true || String(gig?.hidden || "").toLowerCase() === "true"
        });

        const isGigHidden = (gig) => gig?.hidden === true;
        const parseGigDate = (value) => {
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
        };

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const gigsRef = collection(db, "gigs");

        const loadPublicGigMirror = async () => {
            try {
                const mirrorSnapshot = await getDoc(doc(db, "gigs", PUBLIC_MIRROR_DOC_ID));
                if (!mirrorSnapshot.exists()) {
                    return { found: false, items: [] };
                }

                const items = mirrorSnapshot.data()?.items;
                if (!Array.isArray(items)) {
                    return { found: false, items: [] };
                }

                return {
                    found: true,
                    items: items
                        .map((gig, index) => normalizeGigEntry(gig, String(gig?.id || `gig-${index + 1}`)))
                        .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
                };
            } catch (error) {
                console.warn("Could not load public gigs mirror.", error);
                return { found: false, items: [] };
            }
        };

        const renderGigItem = (gig, formattedDate) => {
            const li = document.createElement("li");
            li.className = "gig-item";

            const date = document.createElement("div");
            date.className = "gig-date";
            date.textContent = formattedDate;

            const content = document.createElement("div");
            content.className = "gig-content";

            const main = document.createElement("div");
            main.className = "gig-main";

            const strong = document.createElement("strong");
            strong.textContent = gig.event || "Live show";
            main.appendChild(strong);

            const venueLine = document.createElement("div");
            venueLine.className = "gig-venue";
            venueLine.textContent = `${gig.venue}${gig.city ? `, ${gig.city}` : ""}`;

            li.appendChild(date);
            content.appendChild(main);
            content.appendChild(venueLine);
            li.appendChild(content);

            return li;
        };

        try {
            const mirroredGigs = await loadPublicGigMirror();
            let gigEntries = mirroredGigs.items;

            if (!mirroredGigs.found) {
                let snapshot;
                try {
                    snapshot = await getDocs(query(gigsRef, orderBy("date", "asc")));
                } catch (error) {
                    console.warn("Falling back to unordered gig load.", error);
                    snapshot = await getDocs(gigsRef);
                }

                gigEntries = snapshot.docs
                    .filter((gigDoc) => gigDoc.id !== PUBLIC_MIRROR_DOC_ID)
                    .map((gigDoc) => normalizeGigEntry(gigDoc.data(), gigDoc.id))
                    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
            }

            const pastEl = document.getElementById("past-gigs");
            const upcomingEl = document.getElementById("upcoming-gigs");
            const visibleGigs = gigEntries
                .filter(gig => !isGigHidden(gig))
                .sort((a, b) => {
                    const dateA = parseGigDate(a.date);
                    const dateB = parseGigDate(b.date);
                    const timeA = dateA ? dateA.getTime() : Number.MAX_SAFE_INTEGER;
                    const timeB = dateB ? dateB.getTime() : Number.MAX_SAFE_INTEGER;
                    return timeA - timeB;
                });

            if (!visibleGigs.length) {
                pastEl.innerHTML = `<li class="gig-empty">No past gigs.</li>`;
                upcomingEl.innerHTML = `<li class="gig-empty">No upcoming gigs.</li>`;
            } else {
                visibleGigs.forEach(gig => {
                    const gigDate = parseGigDate(gig.date);
                    const gigDateOnly = gigDate ? new Date(gigDate) : null;
                    if (gigDateOnly) {
                        gigDateOnly.setHours(0, 0, 0, 0);
                    }

                    const formattedDate = gigDateOnly
                        ? gigDateOnly.toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "long",
                            day: "numeric"
                        })
                        : (gig.date || "Date TBC");
                    const li = renderGigItem(gig, formattedDate);

                    if (gigDateOnly && gigDateOnly < today) {
                        pastEl.appendChild(li);
                    } else {
                        upcomingEl.appendChild(li);
                    }
                });

                if (!pastEl.children.length) {
                    pastEl.innerHTML = `<li class="gig-empty">No past gigs.</li>`;
                }

                if (!upcomingEl.children.length) {
                    upcomingEl.innerHTML = `<li class="gig-empty">No upcoming gigs.</li>`;
                }
            }
        } catch (e) {
            console.error("Error fetching gig history:", e);
            const pastEl = document.getElementById("past-gigs");
            const upcomingEl = document.getElementById("upcoming-gigs");
            if (pastEl && upcomingEl) {
                const message = isLocal
                    ? "Local mode: could not load gig history from Firebase."
                    : "Could not load gig history.";
                pastEl.innerHTML = `<li class="gig-empty">${message}</li>`;
                upcomingEl.innerHTML = `<li class="gig-empty">${message}</li>`;
            }
        }

document.getElementById("footer-year").textContent = new Date().getFullYear();

        const siteNavWrap = document.getElementById("site-nav-wrap");
        const siteNavToggle = document.getElementById("site-nav-toggle");
        const siteNavLinks = document.getElementById("site-nav-links");
        const topHero = document.getElementById("top-hero");

        const closeMobileNav = () => {
            if (!siteNavWrap || !siteNavToggle) {
                return;
            }
            siteNavWrap.classList.remove("is-menu-open");
            siteNavToggle.setAttribute("aria-expanded", "false");
        };

        if (siteNavWrap && topHero) {
            const syncStickyNav = () => {
                const heroBottom = topHero.getBoundingClientRect().bottom;
                siteNavWrap.classList.toggle("is-sticky", heroBottom <= 96);
                if (window.innerWidth > 576) {
                    closeMobileNav();
                }
            };

            syncStickyNav();
            window.addEventListener("scroll", syncStickyNav, { passive: true });
            window.addEventListener("resize", syncStickyNav);
        }

        if (siteNavWrap && siteNavToggle && siteNavLinks) {
            siteNavToggle.addEventListener("click", () => {
                const isOpen = siteNavWrap.classList.toggle("is-menu-open");
                siteNavToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
            });

            siteNavLinks.querySelectorAll("a").forEach((link) => {
                link.addEventListener("click", () => {
                    closeMobileNav();
                });
            });
        }

        const videos = document.querySelectorAll('video');
        const carousel = document.getElementById('videoCarousel');
        const videoTitle = document.getElementById('video-title');
        const videoVenue = document.getElementById('video-venue');

        const updateVideoMeta = () => {
            const activeItem = carousel.querySelector('.carousel-item.active');
            if (!activeItem) {
                return;
            }

            videoTitle.textContent = activeItem.dataset.title || 'Live Video';
            videoVenue.textContent = activeItem.dataset.venue || 'Live performance';
        };

        carousel.addEventListener('slid.bs.carousel', () => {
            videos.forEach(video => {
                video.pause();
                video.currentTime = 0;
            });
            updateVideoMeta();
        });

        updateVideoMeta();
