        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
        import { collection, doc, getDoc, getDocs, getFirestore, limit, orderBy, query, setDoc, startAfter, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
        import {
            createEmailSignupService,
            createSiteAnalytics,
            firebaseConfig,
            getTrackingParams,
            isValidEmailAddress,
            normalizeImageUrl,
            normalizePublicUrl,
            PUBLIC_MIRROR_DOC_ID
        } from "./public-site-utils.js";

        const isLocal =
            window.location.protocol === "file:" ||
            window.location.hostname === "localhost" ||
            window.location.hostname === "127.0.0.1" ||
            window.location.hostname === "";

        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        const pageParams = new URLSearchParams(window.location.search);
        const { userId, campaign, source, medium } = getTrackingParams(pageParams);
        const pagePath = window.location.pathname || "/links.html";
        const pageName = pagePath.split("/").pop() || "links";
        const socialLinksRoot = document.getElementById("social-links");
        const mainLinksRoot = document.getElementById("main-links");
        const emailSignupForm = document.getElementById("email-signup-form");
        const emailSignupInput = document.getElementById("email-signup-input");
        const emailSignupSubmit = document.getElementById("email-signup-submit");
        const emailSignupStatus = document.getElementById("email-signup-status");

        const getDefaultLinks = () => ([
            {
                group: "social",
                title: "Spotify",
                url: "https://open.spotify.com/album/1McajSMOYTvWAYRFi19CG2?si=QpD9D5NfTAClj6vfGi3mow",
                kicker: "",
                description: "",
                featured: false,
                hidden: false,
                sortOrder: 10
            },
            {
                group: "social",
                title: "Instagram",
                url: "https://instagram.com/halfawakeeyes",
                kicker: "",
                description: "",
                featured: false,
                hidden: false,
                sortOrder: 20
            },
            {
                group: "social",
                title: "Facebook",
                url: "https://www.facebook.com/halfawakeeyes",
                kicker: "",
                description: "",
                featured: false,
                hidden: false,
                sortOrder: 30
            },
            {
                group: "social",
                title: "Email",
                url: "mailto:halfawakeeyes@gmail.com",
                kicker: "",
                description: "",
                featured: false,
                hidden: false,
                sortOrder: 40
            },
            {
                group: "main",
                title: "Stream the Debut EP",
                url: "https://open.spotify.com/album/1McajSMOYTvWAYRFi19CG2?si=QpD9D5NfTAClj6vfGi3mow",
                imageUrl: "assets/images/logo.jpg",
                section: "Releases",
                kicker: "Listen",
                description: "Open the current release on Spotify.",
                featured: true,
                hidden: false,
                sortOrder: 100
            },
            {
                group: "main",
                title: "Press Kit",
                url: "https://drive.google.com/drive/folders/1dFLq35JkF_NyhJypMFzKlsc7iXehKnWJ?usp=sharing",
                imageUrl: "assets/images/HalfAwakeEyes-annicmrn-07798.jpg",
                section: "Resources",
                kicker: "Press",
                description: "Promo photos for posters, listings, and announcements.",
                featured: false,
                hidden: false,
                sortOrder: 110
            },
            {
                group: "main",
                title: "Technical Requirements",
                url: "https://drive.google.com/file/d/17e3-Qarq7WukVpIeMCu_jQhFZtXjb_Uu/view?usp=drive_link",
                imageUrl: "assets/images/logo.jpg",
                section: "Resources",
                kicker: "Shows",
                description: "Stage plot and input list for promoters and venues.",
                featured: false,
                hidden: false,
                sortOrder: 120
            }
        ]);

        const AUTO_SHOW_SORT_BASE = 105;
        const PUBLIC_FIRESTORE_PAGE_SIZE = 40;
        const PUBLIC_LINKS_MAX_DOCS = 240;
        const PUBLIC_GIGS_MAX_DOCS = 160;
        const PUBLIC_GIG_TICKET_LINK_LIMIT = 24;

        const { logEvent, logPageViewOnce } = createSiteAnalytics({
            db,
            doc,
            setDoc,
            pagePath,
            pageName,
            isDisabled: isLocal,
            getContext: () => ({
                userId,
                campaign,
                source,
                medium,
                section: "links"
            })
        });
        const { submitEmailSignup } = createEmailSignupService({
            db,
            doc,
            setDoc,
            getContext: () => ({
                pageName,
                pagePath,
                campaign,
                source,
                medium
            })
        });

        const setEmailSignupStatus = (message, tone = "") => {
            if (!emailSignupStatus) {
                return;
            }
            emailSignupStatus.textContent = message;
            emailSignupStatus.classList.remove("is-error", "is-success");
            if (tone) {
                emailSignupStatus.classList.add(tone);
            }
        };

        const normalizeManagedLink = (link, fallbackSortOrder = 0) => {
            const numericSortOrder = Number.parseInt(link?.sortOrder, 10);
            return {
                title: String(link?.title || "").trim(),
                url: normalizePublicUrl(link?.url, { allowMailto: true }),
                sourceTicketUrl: normalizePublicUrl(link?.sourceTicketUrl),
                imageUrl: normalizeImageUrl(link?.imageUrl),
                section: String(link?.section || "").trim(),
                kicker: String(link?.kicker || "").trim(),
                description: String(link?.description || "").trim(),
                group: String(link?.group || "").trim().toLowerCase() === "social" ? "social" : "main",
                featured: link?.featured === true,
                hidden: link?.hidden === true || String(link?.hidden || "").toLowerCase() === "true",
                sortOrder: Number.isFinite(numericSortOrder) ? numericSortOrder : fallbackSortOrder
            };
        };

        const normalizeBooleanFlag = (value) =>
            value === true || String(value || "").toLowerCase() === "true";

        const isGigHiddenFromLinks = (gig) =>
            gig?.hideFromLinks === true || String(gig?.hideFromLinks || "").toLowerCase() === "true";

        const hasGigTicketLink = (gig) => Boolean(String(gig?.ticketUrl || "").trim());

        const normalizeGigEntry = (gig = {}, id = "") => {
            const legacyHidden = normalizeBooleanFlag(gig?.hidden);
            const hideFromLinks = Object.prototype.hasOwnProperty.call(gig, "hideFromLinks")
                ? normalizeBooleanFlag(gig?.hideFromLinks)
                : legacyHidden;

            return {
                id,
                date: String(gig?.date || "").trim(),
                event: String(gig?.event || "").trim(),
                venue: String(gig?.venue || "").trim(),
                city: String(gig?.city || "").trim(),
                ticketUrl: normalizePublicUrl(gig?.ticketUrl),
                imageUrl: normalizeImageUrl(gig?.imageUrl),
                hideFromLinks
            };
        };

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

        const getGigDateOnly = (value) => {
            const parsed = parseGigDate(value);
            if (!parsed) {
                return null;
            }

            const dateOnly = new Date(parsed);
            dateOnly.setHours(0, 0, 0, 0);
            return dateOnly;
        };

        const formatGigDateLabel = (value) => {
            const dateOnly = getGigDateOnly(value);
            if (!dateOnly) {
                return "";
            }

            return dateOnly.toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric"
            });
        };

        const getGigTicketDescription = (gig) => {
            const details = [];
            const formattedDate = formatGigDateLabel(gig?.date);
            const venueLine = [gig?.venue, gig?.city].filter(Boolean).join(", ");

            if (formattedDate) {
                details.push(formattedDate);
            }

            if (venueLine) {
                details.push(venueLine);
            }

            return details.join(" | ");
        };

        const getGigTicketUrl = (gig) => {
            const ticketUrl = normalizePublicUrl(gig?.ticketUrl);
            if (!ticketUrl) {
                return "";
            }
            return ticketUrl;
        };

        const buildGigTicketLink = (gig, fallbackSortOrder) => normalizeManagedLink({
            group: "main",
            title: String(gig?.event || "Live show").trim() || "Live show",
            url: getGigTicketUrl(gig),
            sourceTicketUrl: normalizePublicUrl(gig?.ticketUrl),
            imageUrl: normalizeImageUrl(gig?.imageUrl),
            section: "Shows",
            kicker: "Tickets",
            description: getGigTicketDescription(gig),
            featured: false,
            hidden: false,
            sortOrder: fallbackSortOrder
        }, fallbackSortOrder);

        const getLinkSection = (link) => {
            const explicitSection = String(link?.section || "").trim();
            if (explicitSection) {
                return explicitSection;
            }

            const source = `${link?.title || ""} ${link?.kicker || ""} ${link?.description || ""} ${link?.url || ""}`.toLowerCase();
            if (/release|ep|album|listen|spotify|apple|youtube|visuali[sz]er|single|track/.test(source)) {
                return "Releases";
            }
            if (/show|gig|ticket|tour|songkick|bandsintown/.test(source)) {
                return "Shows";
            }
            if (/store|shop|merch|bandcamp/.test(source)) {
                return "Store";
            }
            if (/press|photo|tech|requirement|stage plot|input list|resource/.test(source)) {
                return "Resources";
            }
            if (/email|book|contact/.test(source)) {
                return "Contact";
            }

            return "Links";
        };

        const sortManagedLinks = (links) => [...links].sort((a, b) => {
            if (a.sortOrder !== b.sortOrder) {
                return a.sortOrder - b.sortOrder;
            }
            return a.title.localeCompare(b.title);
        });

        const loadPublicMirrorItems = async (collectionName, itemNormalizer = (item) => item) => {
            try {
                const mirrorSnapshot = await getDoc(doc(db, collectionName, PUBLIC_MIRROR_DOC_ID));
                if (!mirrorSnapshot.exists()) {
                    return { found: false, items: [] };
                }

                const items = mirrorSnapshot.data()?.items;
                if (!Array.isArray(items)) {
                    return { found: false, items: [] };
                }

                return {
                    found: true,
                    items: items.map((item, index) => itemNormalizer(item, index))
                };
            } catch (error) {
                console.warn(`Could not load public ${collectionName} mirror.`, error);
                return { found: false, items: [] };
            }
        };

        const formatIsoDateOnly = (value = new Date()) => {
            const date = value instanceof Date ? new Date(value) : new Date(value);
            if (Number.isNaN(date.getTime())) {
                return "";
            }

            date.setHours(0, 0, 0, 0);
            const year = String(date.getFullYear());
            const month = String(date.getMonth() + 1).padStart(2, "0");
            const day = String(date.getDate()).padStart(2, "0");
            return `${year}-${month}-${day}`;
        };

        const fetchCollectionPages = async ({
            collectionName,
            maxDocs,
            buildQuery,
            buildFallbackQuery
        }) => {
            const loadedDocs = [];
            let lastDoc = null;
            let useFallback = false;

            while (loadedDocs.length < maxDocs) {
                const pageSize = Math.min(PUBLIC_FIRESTORE_PAGE_SIZE, maxDocs - loadedDocs.length);
                const queryBuilder = useFallback ? buildFallbackQuery : buildQuery;
                const activeQuery = queryBuilder({ lastDoc, pageSize });
                let snapshot;

                try {
                    snapshot = await getDocs(activeQuery);
                } catch (error) {
                    if (useFallback || typeof buildFallbackQuery !== "function") {
                        throw error;
                    }

                    useFallback = true;
                    console.warn(`Falling back to simpler ${collectionName} query for public page.`, error);
                    continue;
                }

                if (snapshot.empty) {
                    break;
                }

                const visibleDocs = snapshot.docs.filter((item) => item.id !== PUBLIC_MIRROR_DOC_ID);
                loadedDocs.push(...visibleDocs);

                if (snapshot.docs.length < pageSize) {
                    break;
                }

                lastDoc = snapshot.docs[snapshot.docs.length - 1];
            }

            return loadedDocs;
        };

        const loadUpcomingGigTicketLinks = async () => {
            try {
                const mirroredGigs = await loadPublicMirrorItems("gigs", (gig, index) =>
                    normalizeGigEntry(gig, String(gig?.id || `gig-${index + 1}`))
                );
                let gigEntries = mirroredGigs.items;

                if (!mirroredGigs.found) {
                    const todayIso = formatIsoDateOnly(new Date());
                    const collectionDocs = await fetchCollectionPages({
                        collectionName: "gigs",
                        maxDocs: PUBLIC_GIGS_MAX_DOCS,
                        buildQuery: ({ lastDoc, pageSize }) => query(
                            collection(db, "gigs"),
                            where("date", ">=", todayIso),
                            orderBy("date", "asc"),
                            ...(lastDoc ? [startAfter(lastDoc)] : []),
                            limit(pageSize)
                        ),
                        buildFallbackQuery: ({ lastDoc, pageSize }) => query(
                            collection(db, "gigs"),
                            orderBy("date", "asc"),
                            ...(lastDoc ? [startAfter(lastDoc)] : []),
                            limit(pageSize)
                        )
                    });

                    gigEntries = collectionDocs.map((gigDoc) => normalizeGigEntry(gigDoc.data(), gigDoc.id));
                }

                const today = new Date();
                today.setHours(0, 0, 0, 0);

                return gigEntries
                    .filter((gig) => !isGigHiddenFromLinks(gig) && hasGigTicketLink(gig))
                    .map((gig) => ({
                        gig,
                        dateOnly: getGigDateOnly(gig?.date)
                    }))
                    .filter(({ dateOnly }) => dateOnly && dateOnly >= today)
                    .sort((a, b) => a.dateOnly.getTime() - b.dateOnly.getTime())
                    .slice(0, PUBLIC_GIG_TICKET_LINK_LIMIT)
                    .map(({ gig }, index) => buildGigTicketLink(gig, AUTO_SHOW_SORT_BASE + index));
            } catch (error) {
                console.error("Could not load gig ticket links.", error);
                return [];
            }
        };

        const attachLinkTracking = (element, label, sectionName = "links") => {
            if (!element) {
                return;
            }
            element.addEventListener("click", () => {
                const href = element.getAttribute("href") || "";
                let isOutbound = href.startsWith("mailto:");
                if (!isOutbound && href) {
                    try {
                        const parsed = new URL(href, window.location.href);
                        isOutbound = parsed.origin !== window.location.origin;
                    } catch (error) {
                        isOutbound = false;
                    }
                }
                logEvent("click", {
                    label: label || href,
                    target: label || href,
                    href,
                    elementType: "link",
                    actionSubtype: "link",
                    section: sectionName,
                    outbound: isOutbound
                });
            });
        };

        const getSocialIconSvg = (link, { allowFallback = true } = {}) => {
            const source = `${link.title || ""} ${link.url || ""}`.toLowerCase();
            if (source.includes("spotify")) {
                return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.75a10.25 10.25 0 1 0 0 20.5 10.25 10.25 0 0 0 0-20.5Zm4.43 14.77a.9.9 0 0 1-1.24.3c-2.42-1.48-5.46-1.82-9.05-1.02a.9.9 0 1 1-.39-1.76c4.06-.9 7.57-.49 10.38 1.23a.9.9 0 0 1 .3 1.25Zm1.24-2.76a1.13 1.13 0 0 1-1.55.37c-2.78-1.71-7.01-2.2-10.3-1.18a1.13 1.13 0 0 1-.67-2.16c3.77-1.17 8.46-.61 12.15 1.66.53.33.7 1.02.37 1.56Zm.15-2.87C14.5 8.91 8.97 8.74 5.8 9.7a1.35 1.35 0 1 1-.77-2.59c3.64-1.08 9.69-.87 14.18 1.78a1.35 1.35 0 0 1-1.39 2.3Z"/></svg>`;
            }
            if (source.includes("instagram")) {
                return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.25 2h9.5A5.25 5.25 0 0 1 22 7.25v9.5A5.25 5.25 0 0 1 16.75 22h-9.5A5.25 5.25 0 0 1 2 16.75v-9.5A5.25 5.25 0 0 1 7.25 2Zm0 1.8A3.45 3.45 0 0 0 3.8 7.25v9.5a3.45 3.45 0 0 0 3.45 3.45h9.5a3.45 3.45 0 0 0 3.45-3.45v-9.5a3.45 3.45 0 0 0-3.45-3.45h-9.5Zm9.95 1.6a1.05 1.05 0 1 1 0 2.1 1.05 1.05 0 0 1 0-2.1ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 1.8A3.2 3.2 0 1 0 12 15.2 3.2 3.2 0 0 0 12 8.8Z"/></svg>`;
            }
            if (source.includes("tiktok")) {
                return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.85 3.5c.46 1.84 1.56 3.22 3.3 4.14 1.1.58 2.18.82 3.1.86v2.83a8.72 8.72 0 0 1-3.72-.9 7.69 7.69 0 0 1-1.9-1.25v6.26c0 1.46-.45 2.73-1.34 3.8a6.08 6.08 0 0 1-4.93 2.26 6.18 6.18 0 0 1-3.1-.82 5.95 5.95 0 0 1-2.23-2.2 6.06 6.06 0 0 1-.79-3.06c0-1.57.54-2.94 1.62-4.1A6.07 6.07 0 0 1 8.5 9.4c.52 0 1 .05 1.44.16v2.95a3.28 3.28 0 0 0-1.46-.35 3.2 3.2 0 0 0-2.35.97 3.2 3.2 0 0 0-.97 2.36c0 .96.33 1.76.97 2.39.65.64 1.46.95 2.45.95a3.1 3.1 0 0 0 2.2-.88c.69-.67 1.04-1.56 1.04-2.67V3.5h2.03Z"/></svg>`;
            }
            if (source.includes("facebook")) {
                return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.4 21v-7.95h2.67l.4-3.1H13.4V7.97c0-.9.25-1.5 1.54-1.5h1.65V3.7c-.29-.04-1.28-.12-2.44-.12-2.42 0-4.08 1.48-4.08 4.2v2.17H7.33v3.1h2.74V21h3.33Z"/></svg>`;
            }
            if (source.includes("x.com") || source.includes("twitter")) {
                return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.76 4h3.4l3.67 5.25L17.7 4H20l-6.08 6.94L20.4 20h-3.4l-3.9-5.58L8.23 20H6l6.23-7.1L5.76 4Zm2.15 1.62 9.2 12.76h1.37L9.28 5.62H7.91Z"/></svg>`;
            }
            if (source.includes("youtube")) {
                return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.58 7.19a2.98 2.98 0 0 0-2.1-2.11C17.62 4.5 12 4.5 12 4.5s-5.62 0-7.48.58a2.98 2.98 0 0 0-2.1 2.11A31.1 31.1 0 0 0 1.83 12c0 1.65.2 3.28.59 4.81a2.98 2.98 0 0 0 2.1 2.11c1.86.58 7.48.58 7.48.58s5.62 0 7.48-.58a2.98 2.98 0 0 0 2.1-2.11c.39-1.53.59-3.16.59-4.81 0-1.65-.2-3.28-.59-4.81ZM10.2 15.38V8.62L15.84 12 10.2 15.38Z"/></svg>`;
            }
            if (source.includes("bandcamp")) {
                return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17.5 9.84 6.5H20l-5.84 11H4Z"/></svg>`;
            }
            if (source.includes("soundcloud")) {
                return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.8 9.2a4.9 4.9 0 0 1 8.66 2.9 2.82 2.82 0 1 1 .64 5.56H6.7a1.7 1.7 0 0 1-.31-3.37 3.9 3.9 0 0 1 3.41-5.09Z"/></svg>`;
            }
            if (source.includes("mail") || source.startsWith("mailto:") || source.includes("email")) {
                return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.75 5.5h16.5a1.75 1.75 0 0 1 1.75 1.75v9.5A1.75 1.75 0 0 1 20.25 18.5H3.75A1.75 1.75 0 0 1 2 16.75v-9.5A1.75 1.75 0 0 1 3.75 5.5Zm0 1.8v.16L12 12.74l8.25-5.28V7.3H3.75Zm16.5 9.4v-7.1L12.48 14.6a.9.9 0 0 1-.96 0L3.8 9.6v7.1h16.45Z"/></svg>`;
            }
            return allowFallback
                ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19Zm.9 5.3v4.3h4.3v1.8h-4.3v4.3h-1.8v-4.3H6.8v-1.8h4.3V7.8h1.8Z"/></svg>`
                : "";
        };

        const getLinkThumbLabel = (link) => {
            const section = getLinkSection(link);
            if (section === "Releases") {
                return "EP";
            }
            if (section === "Shows") {
                return "LG";
            }
            if (section === "Store") {
                return "ST";
            }
            if (section === "Resources") {
                return "PK";
            }
            return (link.title || "L").trim().slice(0, 2).toUpperCase();
        };

        const createSocialLink = (link) => {
            const anchor = document.createElement("a");
            anchor.className = "social-link";
            anchor.href = link.url;
            anchor.innerHTML = getSocialIconSvg(link);
            anchor.setAttribute("aria-label", link.title || "Social link");
            anchor.title = link.title || "Social link";
            anchor.dataset.linkLabel = link.title || link.url || "Social link";
            if (link.url.startsWith("http")) {
                anchor.target = "_blank";
                anchor.rel = "noopener noreferrer";
            }
            attachLinkTracking(anchor, anchor.dataset.linkLabel, "socials");
            return anchor;
        };

        const createMainLink = (link, { compact = false, emphasize = false } = {}) => {
            const anchor = document.createElement("a");
            anchor.className = `link-card${link.featured || emphasize ? " primary" : ""}${compact ? " compact" : ""}`;
            anchor.href = link.url;
            anchor.dataset.linkLabel = link.title || link.url || "Main link";
            try {
                const parsed = new URL(link.url, window.location.href);
                if (parsed.origin !== window.location.origin) {
                    anchor.target = "_blank";
                    anchor.rel = "noopener noreferrer";
                }
            } catch (error) {
                if (link.url.startsWith("http")) {
                    anchor.target = "_blank";
                    anchor.rel = "noopener noreferrer";
                }
            }

            const thumb = document.createElement("div");
            thumb.className = "link-thumb";

            if (link.imageUrl) {
                const image = document.createElement("img");
                image.src = link.imageUrl;
                image.alt = link.title || "Link artwork";
                image.loading = "lazy";
                image.addEventListener("error", () => {
                    thumb.innerHTML = "";
                    const iconSvg = getSocialIconSvg(link, { allowFallback: false });
                    if (iconSvg) {
                        thumb.innerHTML = iconSvg;
                    } else {
                        thumb.textContent = getLinkThumbLabel(link);
                    }
                }, { once: true });
                thumb.appendChild(image);
            } else {
                const iconSvg = getSocialIconSvg(link, { allowFallback: false });
                if (iconSvg) {
                    thumb.innerHTML = iconSvg;
                } else {
                    thumb.textContent = getLinkThumbLabel(link);
                }
            }

            const copy = document.createElement("div");
            copy.className = "link-copy";

            if (link.kicker) {
                const kicker = document.createElement("span");
                kicker.className = "kicker";
                kicker.textContent = link.kicker;
                copy.appendChild(kicker);
            }

            const title = document.createElement("span");
            title.className = "link-title";
            title.textContent = link.title || "Link";
            copy.appendChild(title);

            if (link.description) {
                const meta = document.createElement("div");
                meta.className = "link-meta";
                meta.textContent = link.description;
                copy.appendChild(meta);
            }

            const arrow = document.createElement("span");
            arrow.className = "link-arrow";
            arrow.setAttribute("aria-hidden", "true");
            arrow.textContent = "+";

            anchor.appendChild(thumb);
            anchor.appendChild(copy);
            anchor.appendChild(arrow);
            attachLinkTracking(anchor, anchor.dataset.linkLabel, getLinkSection(link));
            return anchor;
        };

        const renderManagedLinks = (links, gigTicketLinks = []) => {
            const visibleLinks = sortManagedLinks(links.filter((link) => link.hidden !== true && link.url));
            const socialLinks = visibleLinks.filter((link) => link.group === "social");
            const socialUrls = new Set(socialLinks.map((link) => link.url));
            const mainLinks = visibleLinks.filter((link) => {
                if (link.group === "social") {
                    return false;
                }
                if (!link.section && socialUrls.has(link.url)) {
                    return false;
                }
                return true;
            });
            const existingMainUrls = new Set(
                mainLinks
                    .flatMap((link) => [String(link.url || "").trim().toLowerCase(), String(link.sourceTicketUrl || "").trim().toLowerCase()])
                    .filter(Boolean)
            );
            const autoShowLinks = gigTicketLinks.filter((link) => {
                const normalizedUrl = String(link?.url || "").trim().toLowerCase();
                const normalizedSourceUrl = String(link?.sourceTicketUrl || "").trim().toLowerCase();
                return normalizedUrl && !existingMainUrls.has(normalizedUrl) && (!normalizedSourceUrl || !existingMainUrls.has(normalizedSourceUrl));
            });
            const mergedMainLinks = sortManagedLinks([...mainLinks, ...autoShowLinks]);

            socialLinksRoot.innerHTML = "";
            mainLinksRoot.innerHTML = "";

            socialLinksRoot.hidden = socialLinks.length === 0;
            mainLinksRoot.hidden = false;

            socialLinks.forEach((link) => {
                socialLinksRoot.appendChild(createSocialLink(link));
            });

            if (!mergedMainLinks.length) {
                const empty = document.createElement("div");
                empty.className = "link-empty-note";
                empty.textContent = "Links updating soon.";
                mainLinksRoot.appendChild(empty);
                return;
            }

            const sections = new Map();

            mergedMainLinks.forEach((link) => {
                const sectionName = getLinkSection(link);
                if (!sections.has(sectionName)) {
                    sections.set(sectionName, []);
                }
                sections.get(sectionName).push(link);
            });

            [...sections.entries()].forEach(([sectionName, sectionLinks]) => {
                const section = document.createElement("section");
                section.className = "links-section";

                const heading = document.createElement("h2");
                heading.className = "section-heading";
                heading.textContent = sectionName;

                const list = document.createElement("div");
                const isShowsSection = sectionName === "Shows";
                list.className = `section-links${isShowsSection ? " shows-links" : ""}`;

                if (isShowsSection && sectionLinks.length) {
                    const [nextShow, ...otherShows] = sectionLinks;
                    list.appendChild(createMainLink(nextShow, { emphasize: true }));

                    otherShows.forEach((link) => {
                        list.appendChild(createMainLink(link, { compact: true }));
                    });
                } else {
                    sectionLinks.forEach((link) => {
                        list.appendChild(createMainLink(link));
                    });
                }

                section.appendChild(heading);
                section.appendChild(list);
                mainLinksRoot.appendChild(section);
            });
        };

        const loadManagedLinks = async () => {
            const gigTicketLinksPromise = loadUpcomingGigTicketLinks();

            try {
                const mirroredLinks = await loadPublicMirrorItems("links", (link, index) =>
                    normalizeManagedLink(link, (index + 1) * 10)
                );

                if (mirroredLinks.found) {
                    if (!mirroredLinks.items.length) {
                        renderManagedLinks(getDefaultLinks(), await gigTicketLinksPromise);
                        return;
                    }

                    renderManagedLinks(mirroredLinks.items, await gigTicketLinksPromise);
                    return;
                }

                const collectionDocs = await fetchCollectionPages({
                    collectionName: "links",
                    maxDocs: PUBLIC_LINKS_MAX_DOCS,
                    buildQuery: ({ lastDoc, pageSize }) => query(
                        collection(db, "links"),
                        orderBy("sortOrder", "asc"),
                        ...(lastDoc ? [startAfter(lastDoc)] : []),
                        limit(pageSize)
                    ),
                    buildFallbackQuery: ({ lastDoc, pageSize }) => query(
                        collection(db, "links"),
                        orderBy("__name__", "asc"),
                        ...(lastDoc ? [startAfter(lastDoc)] : []),
                        limit(pageSize)
                    )
                });

                if (!collectionDocs.length) {
                    renderManagedLinks(getDefaultLinks(), await gigTicketLinksPromise);
                    return;
                }

                const managedLinks = collectionDocs.map((linkDoc, index) => normalizeManagedLink(linkDoc.data(), (index + 1) * 10));
                renderManagedLinks(managedLinks, await gigTicketLinksPromise);
            } catch (error) {
                console.error("Could not load managed links, using defaults instead.", error);
                renderManagedLinks(getDefaultLinks(), await gigTicketLinksPromise);
            }
        };

        logPageViewOnce({
            label: document.title,
            target: pageName
        });

        if (emailSignupForm && emailSignupInput && emailSignupSubmit) {
            emailSignupForm.addEventListener("submit", async (event) => {
                event.preventDefault();
                const email = emailSignupInput.value.trim();

                if (!isValidEmailAddress(email)) {
                    setEmailSignupStatus("Enter a valid email address.", "is-error");
                    return;
                }

                emailSignupSubmit.disabled = true;
                setEmailSignupStatus("Joining mailing list...");

                try {
                    await submitEmailSignup(email, { label: "Links signup" });
                    await logEvent("email_signup", {
                        target: "mailing-list",
                        label: "Links signup",
                        elementType: "form",
                        actionSubtype: "email_signup",
                        section: "links"
                    });
                    setEmailSignupStatus("Thanks, you’re on the list.", "is-success");
                    emailSignupForm.reset();
                } catch (error) {
                    console.error("Email signup failed:", error);
                    setEmailSignupStatus(error?.message || "Could not save your signup right now.", "is-error");
                } finally {
                    emailSignupSubmit.disabled = false;
                }
            });
        }

        attachLinkTracking(document.querySelector('.footer a[data-link-label]'), "Privacy policy");
        loadManagedLinks();
