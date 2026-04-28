import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
    import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
    import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, getFirestore, orderBy, query, setDoc, updateDoc, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
    import QRCode from "https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm";

    const firebaseConfig = {
      apiKey: "AIzaSyAv7G28uXxlQNG_HMLbBkuz4xseXzOzm4Y",
      authDomain: "half-awake-eyes.firebaseapp.com",
      projectId: "half-awake-eyes"
    };

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    const state = {
      allLogs: [],
      filteredLogs: [],
      sessionGroups: [],
      gigs: [],
      links: [],
      mailingListSignups: [],
      campaign: null,
      campaigns: [],
      activeCampaignId: "",
      activeCampaignAnalyticsId: "",
      activeCampaignQrId: "",
      campaignAnalyticsLogs: [],
      isLoadingCampaignAnalytics: false,
      isGeneratingCampaignQr: false,
      activePage: "analytics",
      currentCollection: "site-actions",
      dynamicFields: [],
      page: 1,
      pageSize: 25,
      viewMode: "events",
      searchTerm: "",
      dateFrom: "",
      dateTo: "",
      isRefreshing: false,
      isLoadingGigs: false,
      isLoadingLinks: false,
      isLoadingMailingList: false,
      isLoadingCampaign: false,
      gigSortMode: "upcoming-first",
      isSavingGig: false,
      isSavingLink: false,
      isSavingCampaign: false,
      isSeedingLinks: false,
      isUpdatingGig: false,
      isUpdatingLink: false,
      isReorderingLinks: false,
      isDraggingLinks: false,
      isMobileNavOpen: false,
      activeDetailsId: null,
      activeGigId: null,
      activeLinkId: null,
      draggingLinkId: null,
      draggingLinkGroup: "",
      authUser: null,
      expandedSessions: new Set(),
      deletingIds: new Set(),
      deletingGigIds: new Set(),
      deletingLinkIds: new Set(),
      isDeletingCampaign: false,
      deletingSessions: new Set(),
      pendingDeleteTarget: null,
      refreshAfterDeleteClose: false
    };

    const ADMIN_ACTIVE_PAGE_STORAGE_KEY = "hae-admin-active-page";
    const VALID_ADMIN_PAGES = new Set(["analytics", "gigs", "links", "mailing-list", "campaigns"]);
    const ADMIN_EMAIL_ALLOWLIST = new Set([
      "danyal1995@hotmail.co.uk",
      "danyalc95@gmail.com"
    ]);
    const ADMIN_LOG_CACHE_DB_NAME = "hae-admin-cache";
    const ADMIN_LOG_CACHE_DB_VERSION = 1;
    const ADMIN_LOG_CACHE_ENTRIES_STORE = "analyticsEntries";
    const ADMIN_LOG_CACHE_META_STORE = "analyticsMeta";
    const PUBLIC_MIRROR_DOC_ID = "public-index";
    const PUBLIC_MIRROR_KIND = "public-mirror";
    let adminLogCachePromise = null;

    const elements = {
      dashboard: document.getElementById("dashboard"),
      dashboardRail: document.getElementById("dashboard-rail"),
      login: document.getElementById("login"),
      loginForm: document.getElementById("login-form"),
      emailInput: document.getElementById("email"),
      passwordInput: document.getElementById("password"),
      loginSubmit: document.getElementById("login-submit"),
      loginError: document.getElementById("login-error"),
      analyticsPage: document.getElementById("analytics-page"),
      gigsPage: document.getElementById("gigs-page"),
      linksPage: document.getElementById("links-page"),
      mailingListPage: document.getElementById("mailing-list-page"),
      campaignsPage: document.getElementById("campaigns-page"),
      pageTabs: Array.from(document.querySelectorAll("[data-page]")),
      summary: document.getElementById("summary"),
      summaryCaption: document.getElementById("summary-caption"),
      statsGrid: document.getElementById("stats-grid"),
      tableHead: document.getElementById("log-head"),
      tableBody: document.getElementById("log-rows"),
      mobileCards: document.getElementById("mobile-log-cards"),
      pagination: document.getElementById("pagination"),
      paginationMeta: document.getElementById("pagination-meta"),
      searchInput: document.getElementById("search-input"),
      dateFrom: document.getElementById("date-from"),
      dateTo: document.getElementById("date-to"),
      refreshButton: document.getElementById("refresh-data"),
      viewModeButtons: Array.from(document.querySelectorAll("[data-view-mode]")),
      exportCsv: document.getElementById("export-csv"),
      pageSize: document.getElementById("page-size"),
      fieldCount: document.getElementById("field-count"),
      resetAnalyticsCacheButton: document.getElementById("reset-analytics-cache"),
      gigForm: document.getElementById("gig-form"),
      gigDate: document.getElementById("gig-date"),
      gigEvent: document.getElementById("gig-event"),
      gigVenue: document.getElementById("gig-venue"),
      gigCity: document.getElementById("gig-city"),
      gigTicketUrl: document.getElementById("gig-ticket-url"),
      gigTicketPrice: document.getElementById("gig-ticket-price"),
      gigDoorPrice: document.getElementById("gig-door-price"),
      gigTicketPriceIncludesFee: document.getElementById("gig-ticket-price-includes-fee"),
      gigAutoRedirect: document.getElementById("gig-auto-redirect"),
      gigImageUrl: document.getElementById("gig-image-url"),
      gigMetaPixelId: document.getElementById("gig-meta-pixel-id"),
      saveGig: document.getElementById("save-gig"),
      gigStatus: document.getElementById("gig-status"),
      gigList: document.getElementById("gig-list"),
      gigCount: document.getElementById("gig-count"),
      gigSortMode: document.getElementById("gig-sort-mode"),
      gigSettingsCard: document.getElementById("gig-settings-card"),
      gigSettingsScrim: document.getElementById("gig-settings-scrim"),
      openGigSettings: document.getElementById("open-gig-settings"),
      closeGigSettings: document.getElementById("close-gig-settings"),
      linkForm: document.getElementById("link-form"),
      linkGroup: document.getElementById("link-group"),
      linkSortOrder: document.getElementById("link-sort-order"),
      linkTitle: document.getElementById("link-title"),
      linkUrl: document.getElementById("link-url"),
      linkImageUrl: document.getElementById("link-image-url"),
      linkSection: document.getElementById("link-section"),
      linkKicker: document.getElementById("link-kicker"),
      linkDescription: document.getElementById("link-description"),
      linkFeatured: document.getElementById("link-featured"),
      saveLink: document.getElementById("save-link"),
      seedLinks: document.getElementById("seed-links"),
      linkStatus: document.getElementById("link-status"),
      linkCount: document.getElementById("link-count"),
      socialLinkList: document.getElementById("social-link-list"),
      mainLinkList: document.getElementById("main-link-list"),
      socialLinkCount: document.getElementById("social-link-count"),
      mainLinkCount: document.getElementById("main-link-count"),
      mailingListCount: document.getElementById("mailing-list-count"),
      mailingListSummary: document.getElementById("mailing-list-summary"),
      mailingListList: document.getElementById("mailing-list-list"),
      mailingListStatus: document.getElementById("mailing-list-status"),
      copyMailingListEmails: document.getElementById("copy-mailing-list-emails"),
      exportMailingListCsv: document.getElementById("export-mailing-list-csv"),
      campaignForm: document.getElementById("campaign-form"),
      campaignSlug: document.getElementById("campaign-slug"),
      campaignBadge: document.getElementById("campaign-badge"),
      campaignTitle: document.getElementById("campaign-title"),
      campaignSubtitle: document.getElementById("campaign-subtitle"),
      campaignDescription: document.getElementById("campaign-description"),
      campaignReleaseDate: document.getElementById("campaign-release-date"),
      campaignArtworkUrl: document.getElementById("campaign-artwork-url"),
      campaignMetaPixelId: document.getElementById("campaign-meta-pixel-id"),
      campaignPrimaryLabel: document.getElementById("campaign-primary-label"),
      campaignPrimaryUrl: document.getElementById("campaign-primary-url"),
      campaignSecondaryLabel: document.getElementById("campaign-secondary-label"),
      campaignSecondaryUrl: document.getElementById("campaign-secondary-url"),
      campaignSpotifyUrl: document.getElementById("campaign-spotify-url"),
      campaignAppleUrl: document.getElementById("campaign-apple-url"),
      campaignYoutubeUrl: document.getElementById("campaign-youtube-url"),
      campaignBandcampUrl: document.getElementById("campaign-bandcamp-url"),
      campaignLive: document.getElementById("campaign-live"),
      campaignDelete: document.getElementById("campaign-delete"),
      saveCampaign: document.getElementById("save-campaign"),
      campaignStatus: document.getElementById("campaign-status"),
      campaignCount: document.getElementById("campaign-count"),
      campaignAnalyticsDialog: document.getElementById("campaign-analytics-dialog"),
      campaignAnalyticsTitle: document.getElementById("campaign-analytics-title"),
      campaignAnalyticsSubtitle: document.getElementById("campaign-analytics-subtitle"),
      campaignAnalyticsStatus: document.getElementById("campaign-analytics-status"),
      campaignAnalyticsGrid: document.getElementById("campaign-analytics-grid"),
      campaignAnalyticsPlatforms: document.getElementById("campaign-analytics-platforms"),
      campaignAnalyticsReferrers: document.getElementById("campaign-analytics-referrers"),
      campaignAnalyticsDestinations: document.getElementById("campaign-analytics-destinations"),
      refreshCampaignAnalytics: document.getElementById("refresh-campaign-analytics"),
      closeCampaignAnalytics: document.getElementById("close-campaign-analytics"),
      campaignQrDialog: document.getElementById("campaign-qr-dialog"),
      campaignQrTitle: document.getElementById("campaign-qr-title"),
      campaignQrSubtitle: document.getElementById("campaign-qr-subtitle"),
      campaignQrImage: document.getElementById("campaign-qr-image"),
      campaignQrPlaceholder: document.getElementById("campaign-qr-placeholder"),
      campaignQrUrl: document.getElementById("campaign-qr-url"),
      campaignQrStatus: document.getElementById("campaign-qr-status"),
      downloadCampaignQr: document.getElementById("download-campaign-qr"),
      copyCampaignQrUrl: document.getElementById("copy-campaign-qr-url"),
      closeCampaignQr: document.getElementById("close-campaign-qr"),
      campaignListCount: document.getElementById("campaign-list-count"),
      campaignList: document.getElementById("campaign-list"),
      campaignPreview: document.getElementById("campaign-preview"),
      campaignOpenLink: document.getElementById("campaign-open-link"),
      openCampaignQr: document.getElementById("open-campaign-qr"),
      campaignSettingsCard: document.getElementById("campaign-settings-card"),
      campaignSettingsScrim: document.getElementById("campaign-settings-scrim"),
      openCampaignSettings: document.getElementById("open-campaign-settings"),
      closeCampaignSettings: document.getElementById("close-campaign-settings"),
      newCampaign: document.getElementById("new-campaign"),
      gigEditDialog: document.getElementById("gig-edit-dialog"),
      gigEditTitle: document.getElementById("gig-edit-title"),
      gigEditForm: document.getElementById("gig-edit-form"),
      gigEditDate: document.getElementById("gig-edit-date"),
      gigEditEvent: document.getElementById("gig-edit-event"),
      gigEditVenue: document.getElementById("gig-edit-venue"),
      gigEditCity: document.getElementById("gig-edit-city"),
      gigEditTicketUrl: document.getElementById("gig-edit-ticket-url"),
      gigEditTicketPrice: document.getElementById("gig-edit-ticket-price"),
      gigEditDoorPrice: document.getElementById("gig-edit-door-price"),
      gigEditTicketPriceIncludesFee: document.getElementById("gig-edit-ticket-price-includes-fee"),
      gigEditAutoRedirect: document.getElementById("gig-edit-auto-redirect"),
      gigEditImageUrl: document.getElementById("gig-edit-image-url"),
      gigEditMetaPixelId: document.getElementById("gig-edit-meta-pixel-id"),
      gigEditHidden: document.getElementById("gig-edit-hidden"),
      gigEditHideFromLinks: document.getElementById("gig-edit-hide-from-links"),
      gigEditError: document.getElementById("gig-edit-error"),
      gigDelete: document.getElementById("gig-delete"),
      closeGigEdit: document.getElementById("close-gig-edit"),
      saveGigEdit: document.getElementById("save-gig-edit"),
      linkEditDialog: document.getElementById("link-edit-dialog"),
      linkEditTitle: document.getElementById("link-edit-title"),
      linkEditForm: document.getElementById("link-edit-form"),
      linkEditGroup: document.getElementById("link-edit-group"),
      linkEditSortOrder: document.getElementById("link-edit-sort-order"),
      linkEditTitleInput: document.getElementById("link-edit-title-input"),
      linkEditUrl: document.getElementById("link-edit-url"),
      linkEditImageUrl: document.getElementById("link-edit-image-url"),
      linkEditSection: document.getElementById("link-edit-section"),
      linkEditKicker: document.getElementById("link-edit-kicker"),
      linkEditDescription: document.getElementById("link-edit-description"),
      linkEditFeatured: document.getElementById("link-edit-featured"),
      linkEditHidden: document.getElementById("link-edit-hidden"),
      linkEditError: document.getElementById("link-edit-error"),
      linkDelete: document.getElementById("link-delete"),
      closeLinkEdit: document.getElementById("close-link-edit"),
      saveLinkEdit: document.getElementById("save-link-edit"),
      collectionNote: document.getElementById("collection-note"),
      cacheStatus: document.getElementById("cache-status"),
      authStatus: document.getElementById("auth-status"),
      signOutButton: document.getElementById("sign-out"),
      mobileNavToggle: document.getElementById("mobile-nav-toggle"),
      mobileNavScrim: document.getElementById("mobile-nav-scrim"),
      heroCollection: document.getElementById("hero-collection"),
      heroUpdated: document.getElementById("hero-updated"),
      filterCaption: document.getElementById("filter-caption"),
      detailsDialog: document.getElementById("details-dialog"),
      detailsDialogTitle: document.getElementById("details-dialog-title"),
      detailsDialogSubtitle: document.getElementById("details-dialog-subtitle"),
      detailsDialogGrid: document.getElementById("details-dialog-grid"),
      detailsDelete: document.getElementById("details-delete"),
      closeDetails: document.getElementById("close-details"),
      deleteDialog: document.getElementById("delete-dialog"),
      deleteDialogTitle: document.getElementById("delete-dialog-title"),
      deleteDialogDescription: document.getElementById("delete-dialog-description"),
      deleteDialogEvent: document.getElementById("delete-dialog-event"),
      deleteDialogTimestamp: document.getElementById("delete-dialog-timestamp"),
      deleteDialogError: document.getElementById("delete-dialog-error"),
      cancelDelete: document.getElementById("cancel-delete"),
      confirmDelete: document.getElementById("confirm-delete"),
      cacheResetDialog: document.getElementById("cache-reset-dialog"),
      cancelCacheReset: document.getElementById("cancel-cache-reset"),
      confirmCacheReset: document.getElementById("confirm-cache-reset")
    };

    function getStoredActivePage() {
      try {
        const storedValue = window.localStorage.getItem(ADMIN_ACTIVE_PAGE_STORAGE_KEY);
        return VALID_ADMIN_PAGES.has(storedValue) ? storedValue : "analytics";
      } catch (error) {
        return "analytics";
      }
    }

    function persistActivePage(page) {
      if (!VALID_ADMIN_PAGES.has(page)) {
        return;
      }

      try {
        window.localStorage.setItem(ADMIN_ACTIVE_PAGE_STORAGE_KEY, page);
      } catch (error) {
        // Ignore storage failures and keep the admin usable.
      }
    }

    function openAdminLogCache() {
      if (!("indexedDB" in window)) {
        setAnalyticsCacheStatus("Analytics cache: not supported in this browser.");
        return Promise.resolve(null);
      }

      if (!adminLogCachePromise) {
        adminLogCachePromise = new Promise((resolve) => {
          const request = window.indexedDB.open(ADMIN_LOG_CACHE_DB_NAME, ADMIN_LOG_CACHE_DB_VERSION);

          request.onupgradeneeded = () => {
            const dbInstance = request.result;

            if (!dbInstance.objectStoreNames.contains(ADMIN_LOG_CACHE_ENTRIES_STORE)) {
              const entryStore = dbInstance.createObjectStore(ADMIN_LOG_CACHE_ENTRIES_STORE, { keyPath: "cacheId" });
              entryStore.createIndex("byCollection", "collectionName", { unique: false });
            }

            if (!dbInstance.objectStoreNames.contains(ADMIN_LOG_CACHE_META_STORE)) {
              dbInstance.createObjectStore(ADMIN_LOG_CACHE_META_STORE, { keyPath: "collectionName" });
            }
          };

          request.onsuccess = () => {
            resolve(request.result);
          };

          request.onerror = () => {
            console.warn("IndexedDB cache is unavailable for admin analytics.", request.error);
            setAnalyticsCacheStatus("Analytics cache: browser storage unavailable.");
            adminLogCachePromise = Promise.resolve(null);
            resolve(null);
          };
        });
      }

      return adminLogCachePromise;
    }

    function formatTimestamp(value) {
      if (!value) {
        return null;
      }

      if (value instanceof Date) {
        return value.toLocaleString();
      }

      if (typeof value === "object" && typeof value.seconds === "number") {
        return new Date(value.seconds * 1000).toLocaleString();
      }

      if (typeof value === "string" || typeof value === "number") {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) {
          return date.toLocaleString();
        }
      }

      return null;
    }

    function formatValue(value, field) {
      if (value === null || value === undefined || value === "") {
        return { text: "-", isCode: false };
      }

      if (field === "timestamp") {
        return { text: formatTimestamp(value) ?? String(value), isCode: false };
      }

      if (typeof value === "boolean") {
        return { text: value ? "True" : "False", isCode: false };
      }

      if (Array.isArray(value) || typeof value === "object") {
        return { text: JSON.stringify(value, null, 2), isCode: true };
      }

      return { text: String(value), isCode: String(value).length > 60 };
    }

    function formatFieldLabel(field) {
      return field
        .replace(/_/g, " ")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/\b\w/g, (char) => char.toUpperCase());
    }

    function formatGigDate(value) {
      if (!value) {
        return "No date";
      }

      const date = new Date(`${value}T00:00:00`);
      if (Number.isNaN(date.getTime())) {
        return value;
      }

      return date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric"
      });
    }

    function getGigDateValue(gig) {
      const rawValue = String(gig?.date || "").trim();
      if (!rawValue) {
        return null;
      }

      const parsed = new Date(`${rawValue}T00:00:00`);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function getSortedGigsForAdmin(gigs = state.gigs) {
      const sorted = [...gigs].sort((a, b) => {
        const timeA = getGigDateValue(a)?.getTime() || 0;
        const timeB = getGigDateValue(b)?.getTime() || 0;

        if (state.gigSortMode === "oldest-first") {
          return timeA - timeB || String(a?.event || "").localeCompare(String(b?.event || ""));
        }

        return timeB - timeA || String(a?.event || "").localeCompare(String(b?.event || ""));
      });

      if (state.gigSortMode !== "upcoming-first") {
        return sorted;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const upcoming = [];
      const past = [];
      const hidden = [];

      gigs.forEach((gig) => {
        if (isGigHidden(gig)) {
          hidden.push(gig);
          return;
        }

        const gigDate = getGigDateValue(gig);
        if (gigDate && gigDate >= today) {
          upcoming.push(gig);
          return;
        }

        past.push(gig);
      });

      upcoming.sort((a, b) => (getGigDateValue(a)?.getTime() || 0) - (getGigDateValue(b)?.getTime() || 0));
      past.sort((a, b) => (getGigDateValue(b)?.getTime() || 0) - (getGigDateValue(a)?.getTime() || 0));
      hidden.sort((a, b) => (getGigDateValue(b)?.getTime() || 0) - (getGigDateValue(a)?.getTime() || 0));

      return [
        ...upcoming,
        ...past,
        ...hidden
      ];
    }

    function normalizeBooleanFlag(value) {
      return value === true || String(value || "").toLowerCase() === "true";
    }

    function normalizeGigEntry(gig = {}, id = "") {
      const legacyHidden = normalizeBooleanFlag(gig?.hidden);
      const hideFromEpk = Object.prototype.hasOwnProperty.call(gig, "hideFromEpk")
        ? normalizeBooleanFlag(gig?.hideFromEpk)
        : legacyHidden;
      const hideFromLinks = Object.prototype.hasOwnProperty.call(gig, "hideFromLinks")
        ? normalizeBooleanFlag(gig?.hideFromLinks)
        : legacyHidden;

      return {
        id,
        date: String(gig?.date || "").trim(),
        event: String(gig?.event || "").trim(),
        venue: String(gig?.venue || "").trim(),
        city: String(gig?.city || "").trim(),
        ticketUrl: String(gig?.ticketUrl || "").trim(),
        ticketPrice: normalizeTicketPrice(gig?.ticketPrice),
        doorPrice: normalizeTicketPrice(gig?.doorPrice),
        ticketPriceIncludesFee: normalizeTicketPriceIncludesFee(gig?.ticketPriceIncludesFee),
        autoRedirect: gig?.autoRedirect === true || String(gig?.autoRedirect || "").toLowerCase() === "true",
        imageUrl: String(gig?.imageUrl || "").trim(),
        metaPixelId: normalizeMetaPixelId(gig?.metaPixelId),
        hidden: hideFromEpk,
        hideFromEpk,
        hideFromLinks
      };
    }

    function getDefaultLinks() {
      return [
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
      ];
    }

    function normalizeLinkEntry(link, id, fallbackSortOrder = 0) {
      const numericSortOrder = Number.parseInt(link?.sortOrder, 10);
      return {
        id,
        title: String(link?.title || "").trim(),
        url: String(link?.url || "").trim(),
        imageUrl: String(link?.imageUrl || "").trim(),
        section: String(link?.section || "").trim(),
        kicker: String(link?.kicker || "").trim(),
        description: String(link?.description || "").trim(),
        group: String(link?.group || "").trim().toLowerCase() === "social" ? "social" : "main",
        featured: link?.featured === true,
        hidden: link?.hidden === true || String(link?.hidden || "").toLowerCase() === "true",
        sortOrder: Number.isFinite(numericSortOrder) ? numericSortOrder : fallbackSortOrder
      };
    }

    function getLinkSection(link) {
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

      return "";
    }

    function normalizeMetaPixelId(value = "") {
      return String(value || "").replace(/\s+/g, "").trim();
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

    function normalizeCampaignEntry(campaign = {}) {
      const normalizedMetaPixelId = normalizeMetaPixelId(campaign?.metaPixelId);
      return {
        slug: String(campaign?.slug || "").trim(),
        badge: String(campaign?.badge || "").trim(),
        title: String(campaign?.title || "").trim(),
        subtitle: String(campaign?.subtitle || "").trim(),
        description: String(campaign?.description || "").trim(),
        releaseDate: String(campaign?.releaseDate || "").trim(),
        artworkUrl: String(campaign?.artworkUrl || "").trim(),
        metaPixelId: normalizedMetaPixelId,
        primaryLabel: String(campaign?.primaryLabel || "").trim(),
        primaryUrl: String(campaign?.primaryUrl || "").trim(),
        secondaryLabel: String(campaign?.secondaryLabel || "").trim(),
        secondaryUrl: String(campaign?.secondaryUrl || "").trim(),
        spotifyUrl: String(campaign?.spotifyUrl || "").trim(),
        appleMusicUrl: String(campaign?.appleMusicUrl || "").trim(),
        youtubeUrl: String(campaign?.youtubeUrl || "").trim(),
        bandcampUrl: String(campaign?.bandcampUrl || "").trim(),
        live: campaign?.live === true || String(campaign?.live || "").toLowerCase() === "true",
        updatedAt: campaign?.updatedAt || null
      };
    }

    function slugifyCampaign(value = "") {
      return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^\x00-\x7F]/g, "")
        .replace(/'+/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    }

    function normalizeCampaignSlug(value = "", fallbackTitle = "") {
      return slugifyCampaign(value) || slugifyCampaign(fallbackTitle);
    }

    function getCampaignById(id = "") {
      return state.campaigns.find((campaign) => campaign.slug === id) || null;
    }

    function getSortedCampaigns(campaigns = state.campaigns) {
      return [...campaigns].sort((a, b) => {
        const dateA = getDateForFilter(a?.updatedAt)?.getTime() || 0;
        const dateB = getDateForFilter(b?.updatedAt)?.getTime() || 0;
        if (dateA !== dateB) {
          return dateB - dateA;
        }
        return String(a?.title || "").localeCompare(String(b?.title || ""));
      });
    }

    function getCampaignForAnalytics() {
      return getCampaignById(state.activeCampaignAnalyticsId) || state.campaign || null;
    }

    function getReferrerLabel(value = "") {
      const referrer = String(value || "").trim();
      if (!referrer) {
        return "Direct / unknown";
      }

      try {
        const parsed = new URL(referrer);
        return parsed.hostname.replace(/^www\./i, "") || referrer;
      } catch (error) {
        return referrer;
      }
    }

    function getMailingListSummary(signups = state.mailingListSignups) {
      const ordered = [...signups].sort((a, b) => {
        const timeA = getDateForFilter(a?.updatedAt)?.getTime() || 0;
        const timeB = getDateForFilter(b?.updatedAt)?.getTime() || 0;
        return timeB - timeA;
      });

      const latestSignup = ordered[0] || null;
      const sourceCounts = new Map();
      const pageCounts = new Map();
      const campaignCounts = new Map();

      ordered.forEach((signup) => {
        const sourceLabel = String(signup?.source || "").trim() || "Direct";
        const pageLabel = String(signup?.sourcePage || "").trim() || "Unknown page";
        const campaignLabel = String(signup?.campaignSlug || "").trim();

        sourceCounts.set(sourceLabel, (sourceCounts.get(sourceLabel) || 0) + 1);
        pageCounts.set(pageLabel, (pageCounts.get(pageLabel) || 0) + 1);

        if (campaignLabel) {
          campaignCounts.set(campaignLabel, (campaignCounts.get(campaignLabel) || 0) + 1);
        }
      });

      const getTopEntry = (counts) => {
        const [label = "", count = 0] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || [];
        return { label, count };
      };

      return {
        total: ordered.length,
        latestSignup,
        topSource: getTopEntry(sourceCounts),
        topPage: getTopEntry(pageCounts),
        topCampaign: getTopEntry(campaignCounts)
      };
    }

    function isAllowedAdminUser(user) {
      const email = String(user?.email || "").trim().toLowerCase();
      return Boolean(email) && ADMIN_EMAIL_ALLOWLIST.has(email);
    }

    function getCampaignAnalyticsSummary(entries = [], campaign = getCampaignForAnalytics()) {
      if (!campaign?.title) {
        return {
          visits: 0,
          uniqueVisitors: 0,
          clicks: 0,
          platformClicks: 0,
          primaryClicks: 0,
          secondaryClicks: 0,
          ctr: "0%",
          latestActivity: "No activity",
          platforms: [],
          referrers: [],
          destinations: []
        };
      }

      const slug = normalizeCampaignSlug(campaign.slug, campaign.title);
      const filteredEntries = entries.filter((entry) => {
        if (String(entry?.section || "").trim() !== "smartlink") {
          return false;
        }

        const entrySlug = normalizeCampaignSlug(entry?.campaignSlug || "", "");
        if (entrySlug && slug) {
          return entrySlug === slug;
        }

        return String(entry?.campaign || "").trim() === campaign.title;
      });

      const visits = filteredEntries.filter((entry) => entry?.action === "page_view" || entry?.actionSubtype === "campaign_page");
      const clicks = filteredEntries.filter((entry) => entry?.action === "click");
      const platformClicks = clicks.filter((entry) => entry?.actionSubtype === "platform_link");
      const primaryClicks = clicks.filter((entry) => entry?.actionSubtype === "primary_cta");
      const secondaryClicks = clicks.filter((entry) => entry?.actionSubtype === "secondary_cta");
      const uniqueVisitors = new Set(filteredEntries.map((entry) => String(entry?.sessionId || "").trim()).filter(Boolean)).size;
      const platformCounts = new Map();
      const referrerCounts = new Map();
      const destinationCounts = new Map();

      clicks.forEach((entry) => {
        const label = String(entry?.label || entry?.target || "Unknown destination").trim() || "Unknown destination";
        destinationCounts.set(label, (destinationCounts.get(label) || 0) + 1);
      });

      platformClicks.forEach((entry) => {
        const platformLabel = String(entry?.platform || entry?.label || entry?.target || "Unknown platform").trim() || "Unknown platform";
        platformCounts.set(platformLabel, (platformCounts.get(platformLabel) || 0) + 1);
      });

      visits.forEach((entry) => {
        const referrerLabel = getReferrerLabel(entry?.referrer);
        referrerCounts.set(referrerLabel, (referrerCounts.get(referrerLabel) || 0) + 1);
      });

      const platforms = [...platformCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([label, count]) => ({ label, count }));

      const referrers = [...referrerCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([label, count]) => ({ label, count }));

      const destinations = [...destinationCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([label, count]) => ({ label, count }));

      const latestEntry = filteredEntries[0] || null;
      const ctr = visits.length ? `${Math.round((clicks.length / visits.length) * 100)}%` : "0%";

      return {
        visits: visits.length,
        uniqueVisitors,
        clicks: clicks.length,
        platformClicks: platformClicks.length,
        primaryClicks: primaryClicks.length,
        secondaryClicks: secondaryClicks.length,
        ctr,
        latestActivity: latestEntry ? (formatTimestamp(latestEntry.timestamp) || "Recent") : "No activity",
        platforms,
        referrers,
        destinations
      };
    }

    function renderCampaignAnalytics() {
      if (!elements.campaignAnalyticsGrid || !elements.campaignAnalyticsPlatforms || !elements.campaignAnalyticsReferrers || !elements.campaignAnalyticsDestinations || !elements.campaignAnalyticsStatus) {
        return;
      }

      const analyticsCampaign = getCampaignForAnalytics();
      if (elements.campaignAnalyticsTitle) {
        elements.campaignAnalyticsTitle.textContent = analyticsCampaign?.title || "Smart-link analytics";
      }
      if (elements.campaignAnalyticsSubtitle) {
        elements.campaignAnalyticsSubtitle.textContent = analyticsCampaign?.slug
          ? `/smartlink/${analyticsCampaign.slug}`
          : "Visits, click-throughs, and top destinations for this campaign.";
      }

      if (!analyticsCampaign?.title) {
        elements.campaignAnalyticsStatus.textContent = "No campaign selected";
        elements.campaignAnalyticsGrid.innerHTML = `
          <article class="campaign-analytics-card">
            <div class="label">Visits</div>
            <div class="value">0</div>
            <div class="detail">Select a campaign to view its smart-link analytics.</div>
          </article>
        `;
        elements.campaignAnalyticsPlatforms.innerHTML = `<div class="gig-admin-empty">No platform click-through data yet.</div>`;
        elements.campaignAnalyticsReferrers.innerHTML = `<div class="gig-admin-empty">No referrer data yet.</div>`;
        elements.campaignAnalyticsDestinations.innerHTML = `<div class="gig-admin-empty">No click-through data yet.</div>`;
        return;
      }

      if (state.isLoadingCampaignAnalytics && !state.campaignAnalyticsLogs.length) {
        elements.campaignAnalyticsStatus.textContent = "Loading analytics...";
        elements.campaignAnalyticsGrid.innerHTML = `
          <article class="campaign-analytics-card">
            <div class="label">Loading</div>
            <div class="value">...</div>
            <div class="detail">Checking smart-link activity for this campaign.</div>
          </article>
        `;
        elements.campaignAnalyticsPlatforms.innerHTML = `<div class="gig-admin-empty">Loading platform click-through data...</div>`;
        elements.campaignAnalyticsReferrers.innerHTML = `<div class="gig-admin-empty">Loading referrer data...</div>`;
        elements.campaignAnalyticsDestinations.innerHTML = `<div class="gig-admin-empty">Loading click-through data...</div>`;
        return;
      }

      const summary = getCampaignAnalyticsSummary(state.campaignAnalyticsLogs, analyticsCampaign);
      elements.campaignAnalyticsStatus.textContent = state.isLoadingCampaignAnalytics
        ? "Syncing latest analytics..."
        : `${summary.visits} visit${summary.visits === 1 ? "" : "s"} - ${summary.clicks} click${summary.clicks === 1 ? "" : "s"}`;
      elements.campaignAnalyticsGrid.innerHTML = `
        <article class="campaign-analytics-card">
          <div class="label">Visits</div>
          <div class="value">${summary.visits}</div>
          <div class="detail">${summary.uniqueVisitors} unique session${summary.uniqueVisitors === 1 ? "" : "s"}</div>
        </article>
        <article class="campaign-analytics-card">
          <div class="label">Clicks</div>
          <div class="value">${summary.clicks}</div>
          <div class="detail">${summary.platformClicks} platform, ${summary.primaryClicks + summary.secondaryClicks} CTA</div>
        </article>
        <article class="campaign-analytics-card">
          <div class="label">Click Rate</div>
          <div class="value">${summary.ctr}</div>
          <div class="detail">Clicks divided by visits</div>
        </article>
        <article class="campaign-analytics-card">
          <div class="label">Latest Activity</div>
          <div class="value">${summary.latestActivity === "No activity" ? "None" : "Recent"}</div>
          <div class="detail">${summary.latestActivity}</div>
        </article>
      `;

      if (!summary.platforms.length) {
        elements.campaignAnalyticsPlatforms.innerHTML = `<div class="gig-admin-empty">No platform click-through data yet for this campaign.</div>`;
      } else {
        elements.campaignAnalyticsPlatforms.innerHTML = "";
        summary.platforms.forEach((platform) => {
          const item = document.createElement("div");
          item.className = "campaign-analytics-destination";

          const label = document.createElement("div");
          label.className = "campaign-analytics-destination-label";
          label.textContent = platform.label;

          const meta = document.createElement("div");
          meta.className = "campaign-analytics-destination-meta is-strong";
          meta.textContent = `${platform.count} click${platform.count === 1 ? "" : "s"}`;

          item.append(label, meta);
          elements.campaignAnalyticsPlatforms.appendChild(item);
        });
      }

      if (!summary.referrers.length) {
        elements.campaignAnalyticsReferrers.innerHTML = `<div class="gig-admin-empty">No referrer data yet for this campaign.</div>`;
      } else {
        elements.campaignAnalyticsReferrers.innerHTML = "";
        summary.referrers.slice(0, 8).forEach((referrer) => {
          const item = document.createElement("div");
          item.className = "campaign-analytics-destination";

          const label = document.createElement("div");
          label.className = "campaign-analytics-destination-label";
          label.textContent = referrer.label;

          const meta = document.createElement("div");
          meta.className = "campaign-analytics-destination-meta";
          meta.textContent = `${referrer.count} visit${referrer.count === 1 ? "" : "s"}`;

          item.append(label, meta);
          elements.campaignAnalyticsReferrers.appendChild(item);
        });
      }

      if (!summary.destinations.length) {
        elements.campaignAnalyticsDestinations.innerHTML = `<div class="gig-admin-empty">No click-through data yet for this campaign.</div>`;
        return;
      }

      elements.campaignAnalyticsDestinations.innerHTML = "";
      summary.destinations.slice(0, 5).forEach((destination) => {
        const item = document.createElement("div");
        item.className = "campaign-analytics-destination";

        const label = document.createElement("div");
        label.className = "campaign-analytics-destination-label";
        label.textContent = destination.label;

        const meta = document.createElement("div");
        meta.className = "campaign-analytics-destination-meta";
        meta.textContent = `${destination.count} click${destination.count === 1 ? "" : "s"}`;

        item.append(label, meta);
        elements.campaignAnalyticsDestinations.appendChild(item);
      });
    }

    function openCampaignAnalyticsDialog(campaignId = "", { forceSync = false, syncAfterCache = true } = {}) {
      const analyticsCampaign = getCampaignById(campaignId) || state.campaign;
      if (!analyticsCampaign || !elements.campaignAnalyticsDialog) {
        return;
      }

      state.activeCampaignAnalyticsId = analyticsCampaign.slug;
      renderCampaignAnalytics();

      if (!elements.campaignAnalyticsDialog.open) {
        elements.campaignAnalyticsDialog.showModal();
      }

      loadCampaignAnalytics({ forceSync, syncAfterCache });
    }

    function closeCampaignAnalyticsDialog() {
      if (elements.campaignAnalyticsDialog?.open) {
        elements.campaignAnalyticsDialog.close();
      }
    }

    function setCampaignQrStatus(message = "", tone = "") {
      if (!elements.campaignQrStatus) {
        return;
      }

      elements.campaignQrStatus.textContent = message;
      elements.campaignQrStatus.classList.remove("is-error", "is-success");
      if (tone) {
        elements.campaignQrStatus.classList.add(tone);
      }
    }

    async function openCampaignQrDialog(campaignId = "") {
      const qrCampaign = getCampaignById(campaignId) || state.campaign;
      if (!qrCampaign || !elements.campaignQrDialog) {
        return;
      }

      state.activeCampaignQrId = qrCampaign.slug;
      state.isGeneratingCampaignQr = true;
      const publicUrl = getCampaignPublicUrl(qrCampaign);

      if (elements.campaignQrTitle) {
        elements.campaignQrTitle.textContent = qrCampaign.title || "Smart-link QR code";
      }
      if (elements.campaignQrSubtitle) {
        elements.campaignQrSubtitle.textContent = qrCampaign.slug
          ? `QR code for /smartlink/${qrCampaign.slug}`
          : "QR code for this smart-link campaign.";
      }
      if (elements.campaignQrUrl) {
        elements.campaignQrUrl.textContent = publicUrl;
      }
      if (elements.campaignQrPlaceholder) {
        elements.campaignQrPlaceholder.hidden = false;
        elements.campaignQrPlaceholder.textContent = "Generating QR code...";
      }
      if (elements.campaignQrImage) {
        elements.campaignQrImage.hidden = true;
        elements.campaignQrImage.removeAttribute("src");
      }
      if (elements.downloadCampaignQr) {
        elements.downloadCampaignQr.removeAttribute("href");
        elements.downloadCampaignQr.setAttribute("aria-disabled", "true");
      }
      setCampaignQrStatus("Generating QR code...");

      if (!elements.campaignQrDialog.open) {
        elements.campaignQrDialog.showModal();
      }

      try {
        const qrDataUrl = await QRCode.toDataURL(publicUrl, {
          width: 720,
          margin: 1,
          color: {
            dark: "#111111",
            light: "#ffffff"
          }
        });

        if (elements.campaignQrImage) {
          elements.campaignQrImage.src = qrDataUrl;
          elements.campaignQrImage.hidden = false;
        }
        if (elements.campaignQrPlaceholder) {
          elements.campaignQrPlaceholder.hidden = true;
        }
        if (elements.downloadCampaignQr) {
          elements.downloadCampaignQr.href = qrDataUrl;
          elements.downloadCampaignQr.download = `${normalizeCampaignSlug(qrCampaign.slug, qrCampaign.title) || "campaign"}-qr.png`;
          elements.downloadCampaignQr.removeAttribute("aria-disabled");
        }
        setCampaignQrStatus("QR code ready to download.", "is-success");
      } catch (error) {
        console.error("Could not generate campaign QR code:", error);
        if (elements.campaignQrPlaceholder) {
          elements.campaignQrPlaceholder.hidden = false;
          elements.campaignQrPlaceholder.textContent = "Could not generate QR code right now.";
        }
        setCampaignQrStatus("Could not generate QR code right now.", "is-error");
      } finally {
        state.isGeneratingCampaignQr = false;
      }
    }

    function closeCampaignQrDialog() {
      if (elements.campaignQrDialog?.open) {
        elements.campaignQrDialog.close();
      }
    }

    async function loadCampaignAnalytics({ forceSync = false, syncAfterCache = false } = {}) {
      if (state.isLoadingCampaignAnalytics) {
        return;
      }

      state.isLoadingCampaignAnalytics = true;
      renderCampaignAnalytics();

      let cachedEntries = [];
      try {
        const cachedBundle = await readCachedLogs("site-actions");
        cachedEntries = Array.isArray(cachedBundle.entries) ? cachedBundle.entries : [];

        const cachedSmartlinkEntries = cachedEntries.filter((entry) => String(entry?.section || "").trim() === "smartlink");
        if (cachedSmartlinkEntries.length) {
          state.campaignAnalyticsLogs = cachedSmartlinkEntries;
          renderCampaignAnalytics();

          if (!forceSync && !syncAfterCache) {
            return;
          }
        }

        const snapshot = await getDocs(query(collection(db, "site-actions"), where("section", "==", "smartlink")));
        state.campaignAnalyticsLogs = sortLogs(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error("Error loading campaign analytics:", error);
        state.campaignAnalyticsLogs = cachedEntries.filter((entry) => String(entry?.section || "").trim() === "smartlink");
      } finally {
        state.isLoadingCampaignAnalytics = false;
        renderCampaignAnalytics();
      }
    }

    function getDateForFilter(value) {
      if (!value) {
        return null;
      }

      if (value instanceof Date) {
        return value;
      }

      if (typeof value === "object" && typeof value.seconds === "number") {
        return new Date(value.seconds * 1000);
      }

      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function serializeCachedValue(value) {
      if (value instanceof Date) {
        return {
          __haeType: "date",
          value: value.toISOString()
        };
      }

      if (Array.isArray(value)) {
        return value.map((item) => serializeCachedValue(item));
      }

      if (value && typeof value === "object") {
        if (typeof value.seconds === "number") {
          return {
            __haeType: "timestamp",
            seconds: value.seconds,
            nanoseconds: typeof value.nanoseconds === "number" ? value.nanoseconds : 0
          };
        }

        return Object.fromEntries(
          Object.entries(value).map(([key, entryValue]) => [key, serializeCachedValue(entryValue)])
        );
      }

      return value;
    }

    function deserializeCachedValue(value) {
      if (Array.isArray(value)) {
        return value.map((item) => deserializeCachedValue(item));
      }

      if (!value || typeof value !== "object") {
        return value;
      }

      if (value.__haeType === "date") {
        const parsed = new Date(value.value);
        return Number.isNaN(parsed.getTime()) ? value.value : parsed;
      }

      if (value.__haeType === "timestamp" && typeof value.seconds === "number") {
        return {
          seconds: value.seconds,
          nanoseconds: typeof value.nanoseconds === "number" ? value.nanoseconds : 0
        };
      }

      return Object.fromEntries(
        Object.entries(value).map(([key, entryValue]) => [key, deserializeCachedValue(entryValue)])
      );
    }

    function getLogTimestampMs(entry) {
      const eventDate = getDateForFilter(entry?.timestamp);
      return eventDate ? eventDate.getTime() : 0;
    }

    function compareLogEntries(a, b) {
      const timeDelta = getLogTimestampMs(b) - getLogTimestampMs(a);
      if (timeDelta !== 0) {
        return timeDelta;
      }

      return String(b?.id || "").localeCompare(String(a?.id || ""));
    }

    function sortLogs(entries = []) {
      return [...entries].sort(compareLogEntries);
    }

    function mergeLogs(existingEntries = [], incomingEntries = []) {
      const merged = new Map();

      existingEntries.forEach((entry) => {
        if (entry?.id) {
          merged.set(entry.id, entry);
        }
      });

      incomingEntries.forEach((entry) => {
        if (entry?.id) {
          merged.set(entry.id, entry);
        }
      });

      return sortLogs([...merged.values()]);
    }

    function getLatestLogTimestamp(entries = []) {
      const latestTimestampMs = entries.reduce((latest, entry) => {
        const timestampMs = getLogTimestampMs(entry);
        return timestampMs > latest ? timestampMs : latest;
      }, 0);

      return latestTimestampMs ? new Date(latestTimestampMs) : null;
    }

    function createCachedLogRecord(collectionName, entry) {
      return {
        cacheId: `${collectionName}:${entry.id}`,
        collectionName,
        id: entry.id,
        entry: serializeCachedValue(entry),
        timestampMs: getLogTimestampMs(entry)
      };
    }

    async function readCachedLogs(collectionName) {
      const cacheDb = await openAdminLogCache();
      if (!cacheDb) {
        return { entries: [], latestTimestamp: null, syncedAt: null };
      }

      return new Promise((resolve) => {
        const transaction = cacheDb.transaction([ADMIN_LOG_CACHE_ENTRIES_STORE, ADMIN_LOG_CACHE_META_STORE], "readonly");
        const entryStore = transaction.objectStore(ADMIN_LOG_CACHE_ENTRIES_STORE);
        const metaStore = transaction.objectStore(ADMIN_LOG_CACHE_META_STORE);
        const cachedEntries = [];
        let cachedMeta = null;

        const metaRequest = metaStore.get(collectionName);
        metaRequest.onsuccess = () => {
          cachedMeta = metaRequest.result || null;
        };

        const index = entryStore.index("byCollection");
        const keyRange = window.IDBKeyRange.only(collectionName);
        const cursorRequest = index.openCursor(keyRange);

        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) {
            return;
          }

          cachedEntries.push(deserializeCachedValue(cursor.value.entry));
          cursor.continue();
        };

        transaction.oncomplete = () => {
          const sortedEntries = sortLogs(cachedEntries);
          const latestTimestamp = typeof cachedMeta?.latestTimestampMs === "number" && cachedMeta.latestTimestampMs > 0
            ? new Date(cachedMeta.latestTimestampMs)
            : getLatestLogTimestamp(sortedEntries);

          resolve({
            entries: sortedEntries,
            latestTimestamp,
            syncedAt: cachedMeta?.syncedAt || null
          });
        };

        transaction.onerror = () => {
          console.warn("Could not read the cached admin analytics log.", transaction.error);
          resolve({ entries: [], latestTimestamp: null, syncedAt: null });
        };
      });
    }

    async function upsertCachedLogs(collectionName, entries, syncedAt = new Date(), latestTimestamp = null) {
      const cacheDb = await openAdminLogCache();
      if (!cacheDb) {
        return;
      }

      const latestTimestampMs = latestTimestamp ? latestTimestamp.getTime() : 0;

      await new Promise((resolve, reject) => {
        const transaction = cacheDb.transaction([ADMIN_LOG_CACHE_ENTRIES_STORE, ADMIN_LOG_CACHE_META_STORE], "readwrite");
        const entryStore = transaction.objectStore(ADMIN_LOG_CACHE_ENTRIES_STORE);
        const metaStore = transaction.objectStore(ADMIN_LOG_CACHE_META_STORE);

        entries.forEach((entry) => {
          if (entry?.id) {
            entryStore.put(createCachedLogRecord(collectionName, entry));
          }
        });

        metaStore.put({
          collectionName,
          syncedAt: syncedAt.toISOString(),
          latestTimestampMs
        });

        transaction.oncomplete = () => {
          resolve();
        };

        transaction.onerror = () => {
          reject(transaction.error || new Error("Could not update the cached admin analytics log."));
        };
      });
    }

    async function replaceCachedLogs(collectionName, entries, syncedAt = new Date()) {
      const cacheDb = await openAdminLogCache();
      if (!cacheDb) {
        return;
      }

      const sortedEntries = sortLogs(entries);
      const latestTimestamp = getLatestLogTimestamp(sortedEntries);
      const latestTimestampMs = latestTimestamp ? latestTimestamp.getTime() : 0;

      await new Promise((resolve, reject) => {
        const transaction = cacheDb.transaction([ADMIN_LOG_CACHE_ENTRIES_STORE, ADMIN_LOG_CACHE_META_STORE], "readwrite");
        const entryStore = transaction.objectStore(ADMIN_LOG_CACHE_ENTRIES_STORE);
        const metaStore = transaction.objectStore(ADMIN_LOG_CACHE_META_STORE);
        const index = entryStore.index("byCollection");
        const keyRange = window.IDBKeyRange.only(collectionName);
        const cursorRequest = index.openCursor(keyRange);

        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
            return;
          }

          sortedEntries.forEach((entry) => {
            if (entry?.id) {
              entryStore.put(createCachedLogRecord(collectionName, entry));
            }
          });

          metaStore.put({
            collectionName,
            syncedAt: syncedAt.toISOString(),
            latestTimestampMs
          });
        };

        cursorRequest.onerror = () => {
          reject(cursorRequest.error || new Error("Could not refresh the cached admin analytics log."));
        };

        transaction.oncomplete = () => {
          resolve();
        };

        transaction.onerror = () => {
          reject(transaction.error || new Error("Could not refresh the cached admin analytics log."));
        };
      });
    }

    async function clearCachedLogs(collectionName) {
      const cacheDb = await openAdminLogCache();
      if (!cacheDb) {
        return;
      }

      await new Promise((resolve, reject) => {
        const transaction = cacheDb.transaction([ADMIN_LOG_CACHE_ENTRIES_STORE, ADMIN_LOG_CACHE_META_STORE], "readwrite");
        const entryStore = transaction.objectStore(ADMIN_LOG_CACHE_ENTRIES_STORE);
        const metaStore = transaction.objectStore(ADMIN_LOG_CACHE_META_STORE);
        const index = entryStore.index("byCollection");
        const keyRange = window.IDBKeyRange.only(collectionName);
        const cursorRequest = index.openCursor(keyRange);

        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) {
            metaStore.delete(collectionName);
            return;
          }

          cursor.delete();
          cursor.continue();
        };

        cursorRequest.onerror = () => {
          reject(cursorRequest.error || new Error("Could not clear the cached admin analytics log."));
        };

        transaction.oncomplete = () => {
          resolve();
        };

        transaction.onerror = () => {
          reject(transaction.error || new Error("Could not clear the cached admin analytics log."));
        };
      });
    }

    async function deleteCachedLogEntries(collectionName, ids = []) {
      const cacheDb = await openAdminLogCache();
      if (!cacheDb) {
        return;
      }

      const idsToDelete = new Set(
        ids
          .map((id) => String(id || "").trim())
          .filter(Boolean)
      );

      if (!idsToDelete.size) {
        return;
      }

      await new Promise((resolve, reject) => {
        const transaction = cacheDb.transaction([ADMIN_LOG_CACHE_ENTRIES_STORE, ADMIN_LOG_CACHE_META_STORE], "readwrite");
        const entryStore = transaction.objectStore(ADMIN_LOG_CACHE_ENTRIES_STORE);
        const metaStore = transaction.objectStore(ADMIN_LOG_CACHE_META_STORE);
        const index = entryStore.index("byCollection");
        const keyRange = window.IDBKeyRange.only(collectionName);
        const cursorRequest = index.openCursor(keyRange);
        let remainingLatestTimestampMs = 0;
        let remainingEntryCount = 0;

        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) {
            if (remainingEntryCount > 0) {
              metaStore.put({
                collectionName,
                syncedAt: new Date().toISOString(),
                latestTimestampMs: remainingLatestTimestampMs
              });
            } else {
              metaStore.delete(collectionName);
            }
            return;
          }

          if (idsToDelete.has(String(cursor.value.id || ""))) {
            cursor.delete();
            cursor.continue();
            return;
          }

          remainingEntryCount += 1;
          const timestampMs = Number(cursor.value.timestampMs) || 0;
          if (timestampMs > remainingLatestTimestampMs) {
            remainingLatestTimestampMs = timestampMs;
          }
          cursor.continue();
        };

        cursorRequest.onerror = () => {
          reject(cursorRequest.error || new Error("Could not update the cached admin analytics log."));
        };

        transaction.oncomplete = () => {
          resolve();
        };

        transaction.onerror = () => {
          reject(transaction.error || new Error("Could not update the cached admin analytics log."));
        };
      });
    }

    function serializeLog(log) {
      return state.dynamicFields
        .map((field) => {
          if (field === "timestamp") {
            return formatTimestamp(log[field]) ?? "";
          }

          const value = log[field];
          if (value === null || value === undefined) {
            return "";
          }

          if (typeof value === "object") {
            return JSON.stringify(value);
          }

          return String(value);
        })
        .join(" ")
        .toLowerCase();
    }

    function getOrderedFields(logs) {
      const fields = new Set();
      logs.forEach((entry) => Object.keys(entry).forEach((key) => fields.add(key)));

      const preferredOrder = [
        "timestamp",
        "action",
        "actionSubtype",
        "label",
        "target",
        "page",
        "pageName",
        "section",
        "elementType",
        "outbound",
        "href",
        "userId",
        "sessionId",
        "source",
        "medium",
        "campaign",
        "referrer",
        "viewport",
        "full_url",
        "id"
      ];
      const uniqueFields = [...fields];

      return uniqueFields.sort((a, b) => {
        const indexA = preferredOrder.indexOf(a);
        const indexB = preferredOrder.indexOf(b);

        if (indexA !== -1 || indexB !== -1) {
          return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
        }

        return a.localeCompare(b);
      });
    }

    function getVisibleTableFields() {
      const presets = {
        "site-actions": ["timestamp", "action", "page", "target"]
      };

      const fallbackPriority = [
        "actionSubtype",
        "section",
        "pageName",
        "outbound",
        "medium",
        "referrer"
      ];

      const preferred = (presets[state.currentCollection] || ["timestamp", "action", "label", "target", "page"])
        .filter((field) => state.dynamicFields.includes(field));

      const filler = fallbackPriority
        .filter((field) => state.dynamicFields.includes(field) && !preferred.includes(field))
        .slice(0, Math.max(0, 5 - preferred.length));

      const tableFields = [...preferred, ...filler];
      return tableFields.length ? tableFields : state.dynamicFields.slice(0, 5);
    }

    function getSessionGroupKey(entry, index) {
      const rawSession = entry?.sessionId ? String(entry.sessionId).trim() : "";
      return rawSession || `no-session-${entry?.id || index}`;
    }

    function getSessionGroupLabel(entry, index) {
      const rawSession = entry?.sessionId ? String(entry.sessionId).trim() : "";
      return rawSession || `No session (${String(entry?.id || index).slice(0, 6)})`;
    }

    function getSessionGroups(entries) {
      const groups = new Map();

      entries.forEach((entry, index) => {
        const rawSession = entry?.sessionId ? String(entry.sessionId).trim() : "";
        if (!rawSession) {
          return;
        }

        const key = getSessionGroupKey(entry, index);
        if (!groups.has(key)) {
          groups.set(key, {
            key,
            label: getSessionGroupLabel(entry, index),
            entries: [],
            latestAt: null,
            startedAt: null
          });
        }

        const group = groups.get(key);
        group.entries.push(entry);

        const eventDate = getDateForFilter(entry.timestamp);
        if (eventDate && (!group.latestAt || eventDate > group.latestAt)) {
          group.latestAt = eventDate;
        }
        if (eventDate && (!group.startedAt || eventDate < group.startedAt)) {
          group.startedAt = eventDate;
        }
      });

      return [...groups.values()].sort((a, b) => {
        const timeA = a.latestAt ? a.latestAt.getTime() : 0;
        const timeB = b.latestAt ? b.latestAt.getTime() : 0;
        return timeB - timeA;
      });
    }

    function getActiveEntries() {
      if (state.viewMode === "sessions") {
        return state.sessionGroups.flatMap((group) => group.entries);
      }

      return state.filteredLogs;
    }

    function getSessionGroupByKey(sessionKey) {
      return state.sessionGroups.find((group) => group.key === sessionKey) || null;
    }

    function getBestGroupingField() {
      const candidates = [
        "action",
        "actionSubtype",
        "section",
        "pageName",
        "page",
        "source",
        "campaign"
      ];

      return candidates.find((field) => state.dynamicFields.includes(field))
        || state.dynamicFields.find((field) => field !== "timestamp");
    }

    function getActiveCollectionLabel() {
      if (state.activePage === "gigs") {
        return "gigs";
      }
      if (state.activePage === "links") {
        return "links";
      }
      if (state.activePage === "mailing-list") {
        return "mailing-list-signups";
      }
      if (state.activePage === "campaigns") {
        return "campaigns";
      }
      return state.currentCollection;
    }

    function updateHeroMeta(updatedAt = "Not loaded") {
      elements.heroCollection.textContent = `Collection: ${getActiveCollectionLabel()}`;
      elements.heroUpdated.textContent = `Updated: ${updatedAt}`;
    }

    function setAnalyticsCacheStatus(message = "") {
      if (!elements.cacheStatus) {
        return;
      }

      const isAnalyticsPage = state.activePage === "analytics";
      elements.cacheStatus.hidden = !isAnalyticsPage;
      if (elements.resetAnalyticsCacheButton) {
        elements.resetAnalyticsCacheButton.hidden = !isAnalyticsPage;
      }

      if (!isAnalyticsPage) {
        return;
      }

      elements.cacheStatus.textContent = message || "Analytics cache: not loaded yet.";
    }

    function syncResetAnalyticsCacheButton(isBusy = false) {
      if (!elements.resetAnalyticsCacheButton) {
        return;
      }

      const isAnalyticsPage = state.activePage === "analytics";
      elements.resetAnalyticsCacheButton.hidden = !isAnalyticsPage;
      elements.resetAnalyticsCacheButton.disabled = !isAnalyticsPage || isBusy || state.isRefreshing;
      elements.resetAnalyticsCacheButton.textContent = isBusy ? "Resetting cache..." : "Reset cache";
    }

    function getLoginErrorMessage(error) {
      switch (error?.code) {
        case "auth/invalid-email":
          return "Enter a valid email address.";
        case "auth/invalid-credential":
        case "auth/user-not-found":
        case "auth/wrong-password":
          return "Incorrect email or password.";
        case "auth/too-many-requests":
          return "Too many attempts. Wait a moment and try again.";
        case "auth/network-request-failed":
          return "Sign-in failed because the network request could not complete.";
        default:
          return "Could not sign in. Check the browser console for details.";
      }
    }

    function syncLoginButton(isBusy = false) {
      elements.loginSubmit.disabled = isBusy;
      elements.loginSubmit.textContent = isBusy ? "Signing In..." : "Sign In";
    }

    function syncSignOutButton(isBusy = false) {
      elements.signOutButton.disabled = isBusy || !state.authUser;
      elements.signOutButton.textContent = isBusy ? "Signing Out..." : "Sign Out";
    }

    function setAuthStatus(user = null) {
      elements.authStatus.textContent = user?.email
        ? `Signed in: ${user.email}`
        : "Signed out.";
    }

    function setGigStatus(message = "", type = "") {
      elements.gigStatus.textContent = message;
      elements.gigStatus.classList.remove("is-success", "is-error");
      if (type) {
        elements.gigStatus.classList.add(type);
      }
    }

    function getGigById(id) {
      return state.gigs.find((gig) => gig.id === id) || null;
    }

    function isGigHidden(gig) {
      return gig?.hideFromEpk === true || gig?.hidden === true || String(gig?.hidden || "").toLowerCase() === "true";
    }

    function isGigHiddenFromLinks(gig) {
      return gig?.hideFromLinks === true || String(gig?.hideFromLinks || "").toLowerCase() === "true";
    }

    function hasGigTicketLink(gig) {
      return Boolean(String(gig?.ticketUrl || "").trim());
    }

    function setLinkStatus(message = "", type = "") {
      elements.linkStatus.textContent = message;
      elements.linkStatus.classList.remove("is-success", "is-error");
      if (type) {
        elements.linkStatus.classList.add(type);
      }
    }

    function setMailingListStatus(message = "", type = "") {
      if (!elements.mailingListStatus) {
        return;
      }

      elements.mailingListStatus.textContent = message;
      elements.mailingListStatus.classList.remove("is-success", "is-error");
      if (type) {
        elements.mailingListStatus.classList.add(type);
      }
    }

    function getLinkById(id) {
      return state.links.find((link) => link.id === id) || null;
    }

    function isLinkHidden(link) {
      return link?.hidden === true;
    }

    function sortLinksByOrder(links = []) {
      return [...links].sort((a, b) => {
        const sortA = Number.isFinite(Number.parseInt(a?.sortOrder, 10)) ? Number.parseInt(a.sortOrder, 10) : 0;
        const sortB = Number.isFinite(Number.parseInt(b?.sortOrder, 10)) ? Number.parseInt(b.sortOrder, 10) : 0;

        if (sortA !== sortB) {
          return sortA - sortB;
        }

        return String(a?.title || "").localeCompare(String(b?.title || ""));
      });
    }

    function buildPublicGigsMirrorPayload(gigs = state.gigs) {
      const items = [...gigs]
        .map((gig) => normalizeGigEntry(gig, gig?.id || ""))
        .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));

      return {
        kind: PUBLIC_MIRROR_KIND,
        items,
        updatedAt: new Date()
      };
    }

    function buildPublicLinksMirrorPayload(links = state.links) {
      const items = sortLinksByOrder(links).map((link, index) =>
        normalizeLinkEntry(link, link?.id || "", (index + 1) * 10)
      );

      return {
        kind: PUBLIC_MIRROR_KIND,
        items,
        updatedAt: new Date()
      };
    }

    async function syncPublicGigsMirror(gigs = state.gigs) {
      await setDoc(doc(db, "gigs", PUBLIC_MIRROR_DOC_ID), buildPublicGigsMirrorPayload(gigs));
    }

    async function syncPublicLinksMirror(links = state.links) {
      await setDoc(doc(db, "links", PUBLIC_MIRROR_DOC_ID), buildPublicLinksMirrorPayload(links));
    }

    function getLinksByGroup(group) {
      const normalizedGroup = group === "social" ? "social" : "main";
      return sortLinksByOrder(
        state.links.filter((link) => (link.group === "social" ? "social" : "main") === normalizedGroup)
      );
    }

    function getLinkGroupLabel(group) {
      return group === "social" ? "Social Row" : "Main Links";
    }

    function clearLinkDragHints() {
      document.querySelectorAll(".link-admin-item.drop-before, .link-admin-item.drop-after").forEach((item) => {
        item.classList.remove("drop-before", "drop-after");
      });
      document.querySelectorAll(".link-admin-list.is-drop-target").forEach((list) => {
        list.classList.remove("is-drop-target");
      });
    }

    function clearLinkDragState() {
      document.querySelectorAll(".link-admin-item.is-dragging").forEach((item) => {
        item.classList.remove("is-dragging");
      });
      clearLinkDragHints();
      state.draggingLinkId = null;
      state.draggingLinkGroup = "";
      state.isDraggingLinks = false;
      document.body.classList.remove("link-drag-active");
    }

    function getLinkDropAfterElement(listElement, clientY) {
      const items = [...listElement.querySelectorAll(".link-admin-item:not(.is-dragging)")];
      let closest = { offset: Number.NEGATIVE_INFINITY, element: null };

      items.forEach((item) => {
        const rect = item.getBoundingClientRect();
        const offset = clientY - rect.top - (rect.height / 2);
        if (offset < 0 && offset > closest.offset) {
          closest = { offset, element: item };
        }
      });

      return closest.element;
    }

    function getLinkDropTargetFromPoint(clientX, clientY) {
      const hit = document.elementFromPoint(clientX, clientY);
      const listElement = hit?.closest(".link-admin-list[data-link-group]");

      clearLinkDragHints();

      if (!listElement) {
        return null;
      }

      listElement.classList.add("is-drop-target");
      const afterElement = getLinkDropAfterElement(listElement, clientY);

      if (afterElement) {
        afterElement.classList.add("drop-before");
      } else {
        const items = [...listElement.querySelectorAll(".link-admin-item:not(.is-dragging)")];
        const lastItem = items.at(-1);
        if (lastItem) {
          lastItem.classList.add("drop-after");
        }
      }

      return {
        targetGroup: listElement.dataset.linkGroup === "social" ? "social" : "main",
        targetId: afterElement?.dataset.linkId || "",
        placeAfter: false
      };
    }

    function startLinkPointerDrag(event, linkId, sourceGroup, item) {
      if (state.isLoadingLinks || state.isReorderingLinks || state.isSavingLink || state.isUpdatingLink) {
        return;
      }

      event.preventDefault();
      const draggedLinkId = linkId;
      const draggedSourceGroup = sourceGroup === "social" ? "social" : "main";
      clearLinkDragState();
      state.draggingLinkId = draggedLinkId;
      state.draggingLinkGroup = draggedSourceGroup;
      state.isDraggingLinks = true;
      item.classList.add("is-dragging");
      document.body.classList.add("link-drag-active");

      const handlePointerMove = (moveEvent) => {
        if (!state.isDraggingLinks) {
          return;
        }

        getLinkDropTargetFromPoint(moveEvent.clientX, moveEvent.clientY);
      };

      const finishPointerDrag = (endEvent) => {
        if (!state.isDraggingLinks) {
          clearLinkDragState();
          return;
        }

        const dropTarget = getLinkDropTargetFromPoint(endEvent.clientX, endEvent.clientY);
        clearLinkDragState();

        if (!dropTarget) {
          return;
        }

        const droppingOnSelf = dropTarget.targetGroup === draggedSourceGroup
          && dropTarget.targetId === draggedLinkId;

        if (droppingOnSelf) {
          return;
        }

        reorderLinks(draggedLinkId, dropTarget);
      };

      const cleanupPointerDrag = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", finishPointerDrag);
        window.removeEventListener("pointercancel", clearLinkDragState);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", (endEvent) => {
        cleanupPointerDrag();
        finishPointerDrag(endEvent);
      }, { once: true });
      window.addEventListener("pointercancel", () => {
        cleanupPointerDrag();
        clearLinkDragState();
      }, { once: true });
    }

    function getLinkGroupSortOrder(group, index) {
      return group === "social"
        ? (index + 1) * 10
        : 1000 + ((index + 1) * 10);
    }

    function buildReorderedLinks(dragId, targetGroup, targetId = "", placeAfter = false) {
      const groupedLinks = {
        social: getLinksByGroup("social").filter((link) => link.id !== dragId),
        main: getLinksByGroup("main").filter((link) => link.id !== dragId)
      };

      const draggedLink = getLinkById(dragId);
      if (!draggedLink) {
        return null;
      }

      const normalizedTargetGroup = targetGroup === "social" ? "social" : "main";
      const destinationList = groupedLinks[normalizedTargetGroup];
      const reorderedLink = { ...draggedLink, group: normalizedTargetGroup };

      if (targetId) {
        const targetIndex = destinationList.findIndex((link) => link.id === targetId);
        if (targetIndex === -1) {
          destinationList.push(reorderedLink);
        } else {
          destinationList.splice(targetIndex + (placeAfter ? 1 : 0), 0, reorderedLink);
        }
      } else {
        destinationList.push(reorderedLink);
      }

      const normalizedLinks = [
        ...groupedLinks.social.map((link, index) => ({
          ...link,
          group: "social",
          sortOrder: getLinkGroupSortOrder("social", index)
        })),
        ...groupedLinks.main.map((link, index) => ({
          ...link,
          group: "main",
          sortOrder: getLinkGroupSortOrder("main", index)
        }))
      ];

      const changed = normalizedLinks.filter((link) => {
        const existing = getLinkById(link.id);
        return !existing
          || existing.group !== link.group
          || Number.parseInt(existing.sortOrder, 10) !== link.sortOrder;
      });

      return {
        ordered: sortLinksByOrder(normalizedLinks),
        changed
      };
    }

    async function reorderLinks(dragId, { targetGroup, targetId = "", placeAfter = false } = {}) {
      if (!dragId || state.isReorderingLinks || state.isLoadingLinks || state.isSavingLink || state.isUpdatingLink) {
        clearLinkDragState();
        return;
      }

      const nextState = buildReorderedLinks(dragId, targetGroup, targetId, placeAfter);
      if (!nextState || !nextState.changed.length) {
        clearLinkDragState();
        return;
      }

      state.isReorderingLinks = true;
      state.links = nextState.ordered;
      setLinkStatus(`Saving ${getLinkGroupLabel(targetGroup)} order...`);
      renderLinks();
      syncLinkFormState();
      syncLinkEditState();

      try {
        await Promise.all(
          nextState.changed.map((link) => updateDoc(doc(db, "links", link.id), {
            group: link.group,
            sortOrder: link.sortOrder
          }))
        );
        await syncPublicLinksMirror(state.links);

        setLinkStatus("Link order updated.", "is-success");
      } catch (error) {
        console.error("Error reordering links:", error);
        setLinkStatus("Could not update link order. Check the browser console for details.", "is-error");
        await loadLinks();
      } finally {
        state.isReorderingLinks = false;
        clearLinkDragState();
        syncLinkFormState();
        syncLinkEditState();
      }
    }

    function moveLinkToGroup(id, targetGroup) {
      const link = getLinkById(id);
      if (!link) {
        return;
      }

      const normalizedTargetGroup = targetGroup === "social" ? "social" : "main";
      const currentGroup = link.group === "social" ? "social" : "main";

      if (normalizedTargetGroup === currentGroup) {
        return;
      }

      reorderLinks(id, {
        targetGroup: normalizedTargetGroup,
        targetId: "",
        placeAfter: true
      });
    }

    function getNextLinkSortOrder() {
      const highestSortOrder = state.links.reduce((maxSortOrder, link) => {
        const numericSortOrder = Number.parseInt(link.sortOrder, 10);
        return Number.isFinite(numericSortOrder) ? Math.max(maxSortOrder, numericSortOrder) : maxSortOrder;
      }, 0);
      return highestSortOrder + 10 || 10;
    }

    function normalizeCampaignDestinationUrl(value) {
      const normalizedValue = String(value || "").trim();
      if (!normalizedValue || /^(javascript|data):/i.test(normalizedValue)) {
        return "";
      }

      try {
        const parsed = new URL(normalizedValue, window.location.href);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          return /^[a-z][a-z0-9+.-]*:/i.test(normalizedValue) ? parsed.href : normalizedValue;
        }
      } catch (error) {
        return "";
      }

      return "";
    }

    function getCampaignPublicUrl(campaign = state.campaign) {
      const slug = normalizeCampaignSlug(campaign?.slug, campaign?.title);
      const path = slug ? `smartlink/${encodeURIComponent(slug)}` : "smartlink.html";

      try {
        return new URL(path, window.location.href).href;
      } catch (error) {
        return slug ? `${path}` : "smartlink.html";
      }
    }

    function getCampaignDestinations(campaign = state.campaign) {
      if (!campaign) {
        return [];
      }

      return [
        { label: campaign.primaryLabel || "Primary CTA", url: normalizeCampaignDestinationUrl(campaign.primaryUrl), type: "primary" },
        { label: campaign.secondaryLabel || "Secondary CTA", url: normalizeCampaignDestinationUrl(campaign.secondaryUrl), type: "secondary" },
        { label: "Spotify", url: normalizeCampaignDestinationUrl(campaign.spotifyUrl), type: "platform" },
        { label: "Apple Music", url: normalizeCampaignDestinationUrl(campaign.appleMusicUrl), type: "platform" },
        { label: "YouTube", url: normalizeCampaignDestinationUrl(campaign.youtubeUrl), type: "platform" },
        { label: "Bandcamp", url: normalizeCampaignDestinationUrl(campaign.bandcampUrl), type: "platform" }
      ].filter((entry) => entry.url);
    }

    function resetLinkFormDefaults({ resetValues = false } = {}) {
      if (resetValues) {
        elements.linkForm.reset();
      }
      if (!elements.linkSortOrder.value) {
        elements.linkSortOrder.value = String(getNextLinkSortOrder());
      }
      if (!elements.linkGroup.value) {
        elements.linkGroup.value = "main";
      }
    }

    function populateCampaignForm(campaign = null) {
      const activeCampaign = campaign || normalizeCampaignEntry();
      state.activeCampaignId = normalizeCampaignSlug(activeCampaign.slug, activeCampaign.title);
      elements.campaignSlug.value = activeCampaign.slug || "";
      elements.campaignBadge.value = activeCampaign.badge || "";
      elements.campaignTitle.value = activeCampaign.title || "";
      elements.campaignSubtitle.value = activeCampaign.subtitle || "";
      elements.campaignDescription.value = activeCampaign.description || "";
      elements.campaignReleaseDate.value = activeCampaign.releaseDate || "";
      elements.campaignArtworkUrl.value = activeCampaign.artworkUrl || "";
      elements.campaignMetaPixelId.value = activeCampaign.metaPixelId || "";
      elements.campaignPrimaryLabel.value = activeCampaign.primaryLabel || "";
      elements.campaignPrimaryUrl.value = activeCampaign.primaryUrl || "";
      elements.campaignSecondaryLabel.value = activeCampaign.secondaryLabel || "";
      elements.campaignSecondaryUrl.value = activeCampaign.secondaryUrl || "";
      elements.campaignSpotifyUrl.value = activeCampaign.spotifyUrl || "";
      elements.campaignAppleUrl.value = activeCampaign.appleMusicUrl || "";
      elements.campaignYoutubeUrl.value = activeCampaign.youtubeUrl || "";
      elements.campaignBandcampUrl.value = activeCampaign.bandcampUrl || "";
      elements.campaignLive.checked = activeCampaign.live === true;
    }

    function resetCampaignForm() {
      state.activeCampaignId = "";
      state.campaign = null;
      populateCampaignForm(null);
      renderCampaign();
      renderCampaignLibrary();
      renderCampaignAnalytics();
      setCampaignStatus("");
    }

    function syncGigFormState() {
      elements.saveGig.disabled = state.isSavingGig;
      elements.saveGig.textContent = state.isSavingGig ? "Saving..." : "Save Gig";
    }

    function syncGigEditState() {
      const hasActiveGig = Boolean(state.activeGigId);
      elements.saveGigEdit.disabled = state.isUpdatingGig || !hasActiveGig;
      elements.saveGigEdit.textContent = state.isUpdatingGig ? "Saving..." : "Save Changes";
      elements.gigDelete.disabled = state.isUpdatingGig || !hasActiveGig || state.deletingGigIds.has(state.activeGigId);
      elements.gigDelete.textContent = state.deletingGigIds.has(state.activeGigId) ? "Deleting..." : "Delete Gig";
      elements.closeGigEdit.disabled = state.isUpdatingGig;
    }

    function syncLinkFormState() {
      elements.saveLink.disabled = state.isSavingLink || state.isSeedingLinks || state.isReorderingLinks;
      elements.saveLink.textContent = state.isSavingLink ? "Saving..." : "Save Link";
      elements.seedLinks.disabled = state.isLoadingLinks || state.isSavingLink || state.isSeedingLinks || state.isReorderingLinks || state.links.length > 0;
      elements.seedLinks.textContent = state.isSeedingLinks
        ? "Importing..."
        : state.links.length > 0
          ? "Defaults Imported"
          : "Import Current Defaults";
    }

    function syncLinkEditState() {
      const hasActiveLink = Boolean(state.activeLinkId);
      elements.saveLinkEdit.disabled = state.isUpdatingLink || state.isReorderingLinks || !hasActiveLink;
      elements.saveLinkEdit.textContent = state.isUpdatingLink ? "Saving..." : "Save Changes";
      elements.linkDelete.disabled = state.isUpdatingLink || state.isReorderingLinks || !hasActiveLink || state.deletingLinkIds.has(state.activeLinkId);
      elements.linkDelete.textContent = state.deletingLinkIds.has(state.activeLinkId) ? "Deleting..." : "Delete Link";
      elements.closeLinkEdit.disabled = state.isUpdatingLink;
    }

    function syncCampaignFormState() {
      elements.saveCampaign.disabled = state.isSavingCampaign || state.isLoadingCampaign || state.isDeletingCampaign;
      elements.saveCampaign.textContent = state.isSavingCampaign
        ? "Saving..."
        : state.isLoadingCampaign
          ? "Loading..."
          : "Save Campaign";
      elements.campaignDelete.disabled = state.isSavingCampaign || state.isLoadingCampaign || state.isDeletingCampaign || !state.campaign?.title;
      elements.campaignDelete.textContent = state.isDeletingCampaign ? "Deleting..." : "Delete Campaign";
    }

    function isMobileGigSettingsViewport() {
      return window.innerWidth <= 900;
    }

    function openGigSettingsPanel() {
      if (!elements.gigSettingsCard || !isMobileGigSettingsViewport()) {
        return;
      }

      elements.gigSettingsCard.classList.add("is-mobile-open");
      if (elements.gigSettingsScrim) {
        elements.gigSettingsScrim.hidden = false;
      }
      document.body.classList.add("campaign-settings-mobile-open");
    }

    function closeGigSettingsPanel() {
      if (!elements.gigSettingsCard) {
        return;
      }

      elements.gigSettingsCard.classList.remove("is-mobile-open");
      if (elements.gigSettingsScrim) {
        elements.gigSettingsScrim.hidden = true;
      }
      document.body.classList.remove("campaign-settings-mobile-open");
    }

    function syncGigSettingsPanel() {
      if (!elements.gigSettingsCard || !elements.openGigSettings) {
        return;
      }

      const isGigsPage = state.activePage === "gigs";
      const isMobile = isMobileGigSettingsViewport();
      const shouldUsePopup = isGigsPage && isMobile;

      elements.gigSettingsCard.classList.toggle("is-mobile-popup", shouldUsePopup);
      elements.openGigSettings.hidden = !shouldUsePopup;

      if (!shouldUsePopup) {
        closeGigSettingsPanel();
      }
    }

    function isMobileCampaignSettingsViewport() {
      return window.innerWidth <= 900;
    }

    function openCampaignSettingsPanel() {
      if (!elements.campaignSettingsCard || !isMobileCampaignSettingsViewport()) {
        return;
      }

      elements.campaignSettingsCard.classList.add("is-mobile-open");
      if (elements.campaignSettingsScrim) {
        elements.campaignSettingsScrim.hidden = false;
      }
      document.body.classList.add("campaign-settings-mobile-open");
    }

    function closeCampaignSettingsPanel() {
      if (!elements.campaignSettingsCard) {
        return;
      }

      elements.campaignSettingsCard.classList.remove("is-mobile-open");
      if (elements.campaignSettingsScrim) {
        elements.campaignSettingsScrim.hidden = true;
      }
      document.body.classList.remove("campaign-settings-mobile-open");
    }

    function syncCampaignSettingsPanel() {
      if (!elements.campaignSettingsCard || !elements.openCampaignSettings) {
        return;
      }

      const isCampaignsPage = state.activePage === "campaigns";
      const isMobile = isMobileCampaignSettingsViewport();
      const shouldUsePopup = isCampaignsPage && isMobile;

      elements.campaignSettingsCard.classList.toggle("is-mobile-popup", shouldUsePopup);
      elements.openCampaignSettings.hidden = !shouldUsePopup;

      if (!shouldUsePopup) {
        closeCampaignSettingsPanel();
      }
    }

    function resetGigEditDialog() {
      state.activeGigId = null;
      state.isUpdatingGig = false;
      elements.gigEditTitle.textContent = "Update gig entry";
      elements.gigEditForm.reset();
      elements.gigEditTicketPriceIncludesFee.checked = false;
      elements.gigEditAutoRedirect.checked = false;
      elements.gigEditHidden.checked = false;
      elements.gigEditHideFromLinks.checked = false;
      elements.gigEditError.textContent = "";
      syncGigEditState();
    }

    function resetLinkEditDialog() {
      state.activeLinkId = null;
      state.isUpdatingLink = false;
      elements.linkEditTitle.textContent = "Update link entry";
      elements.linkEditForm.reset();
      elements.linkEditGroup.value = "main";
      elements.linkEditHidden.checked = false;
      elements.linkEditFeatured.checked = false;
      elements.linkEditError.textContent = "";
      syncLinkEditState();
    }

    function setCampaignStatus(message = "", type = "") {
      elements.campaignStatus.textContent = message;
      elements.campaignStatus.classList.remove("is-success", "is-error");
      if (type) {
        elements.campaignStatus.classList.add(type);
      }
    }

    function closeGigEditDialog() {
      if (elements.gigEditDialog.open) {
        elements.gigEditDialog.close();
      }
    }

    function closeLinkEditDialog() {
      if (elements.linkEditDialog.open) {
        elements.linkEditDialog.close();
      }
    }

    function openGigEditDialog(id) {
      const gig = getGigById(id);
      if (!gig) {
        return;
      }

      state.activeGigId = id;
      state.isUpdatingGig = false;
      elements.gigEditTitle.textContent = gig.event || "Live show";
      elements.gigEditDate.value = gig.date || "";
      elements.gigEditEvent.value = gig.event || "";
      elements.gigEditVenue.value = gig.venue || "";
      elements.gigEditCity.value = gig.city || "";
      elements.gigEditTicketUrl.value = gig.ticketUrl || "";
      elements.gigEditTicketPrice.value = gig.ticketPrice || "";
      elements.gigEditDoorPrice.value = gig.doorPrice || "";
      elements.gigEditTicketPriceIncludesFee.checked = gig.ticketPriceIncludesFee === true;
      elements.gigEditAutoRedirect.checked = gig.autoRedirect === true;
      elements.gigEditImageUrl.value = gig.imageUrl || "";
      elements.gigEditMetaPixelId.value = normalizeMetaPixelId(gig.metaPixelId);
      elements.gigEditHidden.checked = isGigHidden(gig);
      elements.gigEditHideFromLinks.checked = isGigHiddenFromLinks(gig);
      elements.gigEditError.textContent = "";
      syncGigEditState();

      if (!elements.gigEditDialog.open) {
        elements.gigEditDialog.showModal();
      }
    }

    function openLinkEditDialog(id) {
      const link = getLinkById(id);
      if (!link) {
        return;
      }

      state.activeLinkId = id;
      state.isUpdatingLink = false;
      elements.linkEditTitle.textContent = link.title || "Link";
      elements.linkEditGroup.value = link.group || "main";
      elements.linkEditSortOrder.value = Number.isFinite(Number.parseInt(link.sortOrder, 10)) ? String(link.sortOrder) : "";
      elements.linkEditTitleInput.value = link.title || "";
      elements.linkEditUrl.value = link.url || "";
      elements.linkEditImageUrl.value = link.imageUrl || "";
      elements.linkEditSection.value = link.section || "";
      elements.linkEditKicker.value = link.kicker || "";
      elements.linkEditDescription.value = link.description || "";
      elements.linkEditFeatured.checked = link.featured === true;
      elements.linkEditHidden.checked = isLinkHidden(link);
      elements.linkEditError.textContent = "";
      syncLinkEditState();

      if (!elements.linkEditDialog.open) {
        elements.linkEditDialog.showModal();
      }
    }

    function renderGigs() {
      const sortedGigs = getSortedGigsForAdmin();
      const hiddenCount = state.gigs.filter((gig) => isGigHidden(gig)).length;
      const linkHiddenCount = state.gigs.filter((gig) => isGigHiddenFromLinks(gig)).length;
      elements.gigCount.textContent = state.gigs.length
        ? `${state.gigs.length} gig${state.gigs.length === 1 ? "" : "s"} loaded${hiddenCount ? ` - ${hiddenCount} EPK hidden` : ""}${linkHiddenCount ? ` - ${linkHiddenCount} links hidden` : ""}`
        : "No gigs loaded";

      if (state.gigs.length) {
        elements.gigCount.textContent = `${state.gigs.length} gig${state.gigs.length === 1 ? "" : "s"} loaded${hiddenCount ? ` | ${hiddenCount} EPK hidden` : ""}${linkHiddenCount ? ` | ${linkHiddenCount} links hidden` : ""}`;
      }

      if (!state.gigs.length) {
        elements.gigList.innerHTML = `<div class="gig-admin-empty">No gigs loaded yet.</div>`;
        if (state.activePage === "gigs") {
          syncActivePageUI();
        }
        return;
      }

      elements.gigList.innerHTML = "";
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const groupedGigs = state.gigSortMode === "upcoming-first"
        ? [
          {
            label: "Upcoming",
            items: sortedGigs.filter((gig) => !isGigHidden(gig) && (getGigDateValue(gig)?.getTime() || 0) >= today.getTime())
          },
          {
            label: "Past",
            items: sortedGigs.filter((gig) => !isGigHidden(gig) && ((getGigDateValue(gig)?.getTime() || 0) < today.getTime()))
          },
          {
            label: "Hidden",
            items: sortedGigs.filter((gig) => isGigHidden(gig))
          }
        ]
        : [
          {
            label: state.gigSortMode === "oldest-first" ? "Oldest to newest" : "Newest to oldest",
            items: sortedGigs
          }
        ];

      const createGigItem = (gig) => {
        const item = document.createElement("div");
        item.className = `gig-admin-item${isGigHidden(gig) ? " is-hidden" : ""}`;

        const top = document.createElement("div");
        top.className = "gig-admin-top";

        const badges = document.createElement("div");
        badges.className = "gig-admin-badges";

        const date = document.createElement("div");
        date.className = "gig-admin-date";
        date.textContent = formatGigDate(gig.date);

        top.appendChild(date);

        if (isGigHidden(gig)) {
          const badge = document.createElement("span");
          badge.className = "gig-admin-badge hidden";
          badge.textContent = "EPK hidden";
          badges.appendChild(badge);
        }

        if (isGigHiddenFromLinks(gig)) {
          const badge = document.createElement("span");
          badge.className = "gig-admin-badge hidden";
          badge.textContent = "Links hidden";
          badges.appendChild(badge);
        }

        if (hasGigTicketLink(gig)) {
          const badge = document.createElement("span");
          badge.className = "gig-admin-badge";
          badge.textContent = "Tickets";
          badges.appendChild(badge);
        }

        if (hasGigTicketLink(gig) && gig.autoRedirect === true) {
          const badge = document.createElement("span");
          badge.className = "gig-admin-badge";
          badge.textContent = "Auto";
          badges.appendChild(badge);
        }

        if (gig.imageUrl) {
          const badge = document.createElement("span");
          badge.className = "gig-admin-badge";
          badge.textContent = "Image";
          badges.appendChild(badge);
        }

        if (normalizeMetaPixelId(gig.metaPixelId)) {
          const badge = document.createElement("span");
          badge.className = "gig-admin-badge";
          badge.textContent = "Pixel";
          badges.appendChild(badge);
        }

        if (badges.childElementCount) {
          top.appendChild(badges);
        }

        const main = document.createElement("div");
        main.className = "gig-admin-main";
        main.textContent = gig.event || "Live show";

        const meta = document.createElement("div");
        meta.className = "gig-admin-meta";
        meta.textContent = `${gig.venue || "Venue"}${gig.city ? `, ${gig.city}` : ""}`;

        const actions = document.createElement("div");
        actions.className = "gig-admin-actions";

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "row-action";
        editButton.textContent = "Edit";
        editButton.addEventListener("click", () => {
          openGigEditDialog(gig.id);
        });

        actions.appendChild(editButton);

        item.appendChild(top);
        item.appendChild(main);
        item.appendChild(meta);
        item.appendChild(actions);
        return item;
      };

      groupedGigs.forEach((group) => {
        if (!group.items.length) {
          return;
        }

        const section = document.createElement("section");
        section.className = "gig-admin-group";

        const header = document.createElement("div");
        header.className = "gig-admin-group-header";

        const title = document.createElement("h4");
        title.className = "gig-admin-group-title";
        title.textContent = group.label;

        const meta = document.createElement("span");
        meta.className = "gig-admin-group-meta";
        meta.textContent = `${group.items.length} gig${group.items.length === 1 ? "" : "s"}`;

        header.append(title, meta);
        section.appendChild(header);

        const list = document.createElement("div");
        list.className = "gig-admin-group-list";
        group.items.forEach((gig) => {
          list.appendChild(createGigItem(gig));
        });

        section.appendChild(list);
        elements.gigList.appendChild(section);
      });

      if (state.activePage === "gigs") {
        syncActivePageUI();
      }
    }

    function renderLinks() {
      clearLinkDragHints();

      const orderedLinks = sortLinksByOrder(state.links);
      const socialLinks = orderedLinks.filter((link) => link.group === "social");
      const mainLinks = orderedLinks.filter((link) => link.group !== "social");
      const hiddenCount = state.links.filter((link) => isLinkHidden(link)).length;
      elements.linkCount.textContent = state.links.length
        ? `${state.links.length} link${state.links.length === 1 ? "" : "s"} loaded${hiddenCount ? ` | ${hiddenCount} hidden` : ""}`
        : "No links loaded";
      elements.socialLinkCount.textContent = socialLinks.length
        ? `${socialLinks.length} item${socialLinks.length === 1 ? "" : "s"}`
        : "No social links";
      elements.mainLinkCount.textContent = mainLinks.length
        ? `${mainLinks.length} item${mainLinks.length === 1 ? "" : "s"}`
        : "No main links";

      if (!state.links.length) {
        elements.socialLinkList.innerHTML = `<div class="gig-admin-empty">No social links loaded yet.</div>`;
        elements.mainLinkList.innerHTML = `<div class="gig-admin-empty">No main links loaded yet. Use Add Link or import the current defaults.</div>`;
        syncLinkFormState();
        if (state.activePage === "links") {
          syncActivePageUI();
        }
        return;
      }

      const buildLinkItem = (link) => {
        const item = document.createElement("div");
        item.className = `link-admin-item${isLinkHidden(link) ? " is-hidden" : ""}`;
        item.dataset.linkId = link.id;
        item.dataset.linkGroup = link.group === "social" ? "social" : "main";

        const handle = document.createElement("div");
        handle.className = "link-admin-handle";
        handle.title = "Drag to reorder";
        handle.setAttribute("aria-label", "Drag to reorder");
        handle.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6.5A1.5 1.5 0 1 1 7.5 5 1.5 1.5 0 0 1 9 6.5Zm0 5.5A1.5 1.5 0 1 1 7.5 10.5 1.5 1.5 0 0 1 9 12Zm0 5.5A1.5 1.5 0 1 1 7.5 16 1.5 1.5 0 0 1 9 17.5Zm8-11A1.5 1.5 0 1 1 15.5 5 1.5 1.5 0 0 1 17 6.5Zm0 5.5a1.5 1.5 0 1 1-1.5-1.5A1.5 1.5 0 0 1 17 12Zm0 5.5a1.5 1.5 0 1 1-1.5-1.5A1.5 1.5 0 0 1 17 17.5Z"/></svg>`;
        handle.addEventListener("pointerdown", (event) => {
          startLinkPointerDrag(event, link.id, item.dataset.linkGroup, item);
        });

        const body = document.createElement("div");
        body.className = "link-admin-body";

        const top = document.createElement("div");
        top.className = "link-admin-top";

        const title = document.createElement("div");
        title.className = "link-admin-title";
        title.textContent = link.title || "Untitled link";

        const badges = document.createElement("div");
        badges.className = "link-admin-meta";

        const groupBadge = document.createElement("span");
        groupBadge.className = "gig-admin-badge";
        groupBadge.textContent = link.group === "social" ? "Social" : "Main";
        badges.appendChild(groupBadge);

        const sectionName = getLinkSection(link);
        if (sectionName && link.group !== "social") {
          const sectionBadge = document.createElement("span");
          sectionBadge.className = "gig-admin-badge";
          sectionBadge.textContent = sectionName;
          badges.appendChild(sectionBadge);
        }

        if (link.featured) {
          const featuredBadge = document.createElement("span");
          featuredBadge.className = "gig-admin-badge";
          featuredBadge.textContent = "Featured";
          badges.appendChild(featuredBadge);
        }

        if (isLinkHidden(link)) {
          const hiddenBadge = document.createElement("span");
          hiddenBadge.className = "gig-admin-badge hidden";
          hiddenBadge.textContent = "Hidden";
          badges.appendChild(hiddenBadge);
        }

        top.appendChild(title);
        top.appendChild(badges);

        const url = document.createElement("div");
        url.className = "link-admin-url";
        url.textContent = link.url || "-";

        const description = document.createElement("div");
        description.className = "link-admin-description";
        description.textContent = [
          getLinkSection(link) || "",
          link.imageUrl ? "Custom image" : "",
          link.kicker || "",
          link.description || "",
          `Order ${link.sortOrder}`
        ].filter(Boolean).join(" | ");

        const actions = document.createElement("div");
        actions.className = "link-admin-actions";

        const moveGroupButton = document.createElement("button");
        moveGroupButton.type = "button";
        moveGroupButton.className = "row-action";
        moveGroupButton.textContent = link.group === "social" ? "To Main" : "To Social";
        moveGroupButton.disabled = state.isReorderingLinks;
        moveGroupButton.addEventListener("click", () => {
          moveLinkToGroup(link.id, link.group === "social" ? "main" : "social");
        });

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "row-action";
        editButton.textContent = "Edit";
        editButton.addEventListener("click", () => {
          openLinkEditDialog(link.id);
        });

        actions.appendChild(moveGroupButton);
        actions.appendChild(editButton);

        body.appendChild(top);
        body.appendChild(url);
        body.appendChild(description);
        body.appendChild(actions);

        item.appendChild(handle);
        item.appendChild(body);
        return item;
      };

      const attachListDropTarget = (listElement, group, emptyMessage) => {
        listElement.innerHTML = "";

        const linksForGroup = group === "social" ? socialLinks : mainLinks;
        if (!linksForGroup.length) {
          listElement.innerHTML = `<div class="gig-admin-empty">${emptyMessage}</div>`;
          return;
        }

        linksForGroup.forEach((link) => {
          listElement.appendChild(buildLinkItem(link));
        });
      };

      attachListDropTarget(elements.socialLinkList, "social", "No social links loaded yet.");
      attachListDropTarget(elements.mainLinkList, "main", "No main links loaded yet.");

      syncLinkFormState();
      if (state.activePage === "links") {
        syncActivePageUI();
      }
    }

    function renderMailingListSignups() {
      if (!elements.mailingListList || !elements.mailingListCount || !elements.mailingListSummary) {
        return;
      }

      const signups = [...state.mailingListSignups].sort((a, b) => {
        const timeA = getDateForFilter(a?.updatedAt)?.getTime() || 0;
        const timeB = getDateForFilter(b?.updatedAt)?.getTime() || 0;
        return timeB - timeA || String(a?.email || "").localeCompare(String(b?.email || ""));
      });

      elements.mailingListCount.textContent = signups.length
        ? `${signups.length} signup${signups.length === 1 ? "" : "s"}`
        : "No signups yet";
      elements.mailingListList.innerHTML = "";
      const summary = getMailingListSummary(signups);
      const latestSignupLabel = summary.latestSignup?.updatedAt
        ? (formatTimestamp(summary.latestSignup.updatedAt) || "Recently")
        : "No recent signup";

      elements.mailingListSummary.innerHTML = `
        <article class="campaign-analytics-card">
          <div class="label">Signups</div>
          <div class="value">${summary.total}</div>
          <div class="detail">Collected across links and smart-link pages</div>
        </article>
        <article class="campaign-analytics-card">
          <div class="label">Latest Signup</div>
          <div class="value">${summary.latestSignup ? "Recent" : "None"}</div>
          <div class="detail">${latestSignupLabel}</div>
        </article>
        <article class="campaign-analytics-card">
          <div class="label">Top Source</div>
          <div class="value">${summary.topSource.count || 0}</div>
          <div class="detail">${summary.topSource.label || "No source data yet"}</div>
        </article>
        <article class="campaign-analytics-card">
          <div class="label">Top Campaign</div>
          <div class="value">${summary.topCampaign.count || 0}</div>
          <div class="detail">${summary.topCampaign.label || "No campaign signups yet"}</div>
        </article>
      `;

      if (!signups.length) {
        elements.mailingListList.innerHTML = `
          <tr>
            <td colspan="6">
              <div class="gig-admin-empty">No mailing list signups yet.</div>
            </td>
          </tr>
        `;
        return;
      }

      signups.forEach((signup) => {
        const row = document.createElement("tr");

        const emailCell = document.createElement("td");
        emailCell.dataset.label = "Email";
        const emailValue = document.createElement("div");
        emailValue.className = "mailing-list-email";
        emailValue.textContent = signup.email || "Unknown email";
        emailCell.appendChild(emailValue);

        const sourceCell = document.createElement("td");
        sourceCell.className = "mailing-list-cell";
        sourceCell.dataset.label = "Source";
        sourceCell.textContent = [
          signup.sourcePage ? `Page: ${signup.sourcePage}` : "",
          signup.source ? `Source: ${signup.source}` : "",
          signup.medium ? `Medium: ${signup.medium}` : ""
        ].filter(Boolean).join(" | ") || "No source details";

        const campaignCell = document.createElement("td");
        campaignCell.className = "mailing-list-cell";
        campaignCell.dataset.label = "Campaign";
        campaignCell.textContent = signup.campaignSlug || "-";

        const referrerCell = document.createElement("td");
        referrerCell.className = "mailing-list-cell";
        referrerCell.dataset.label = "Referrer";
        referrerCell.textContent = signup.referrer ? getReferrerLabel(signup.referrer) : "Direct / unknown";

        const updatedCell = document.createElement("td");
        updatedCell.className = "mailing-list-cell";
        updatedCell.dataset.label = "Updated";
        updatedCell.textContent = signup.updatedAt ? (formatTimestamp(signup.updatedAt) || "-") : "-";

        const entriesCell = document.createElement("td");
        entriesCell.className = "mailing-list-cell mailing-list-count-cell";
        entriesCell.dataset.label = "Entries";
        entriesCell.textContent = Number.isFinite(Number(signup.signupCount)) ? String(signup.signupCount) : "1";

        row.append(emailCell, sourceCell, campaignCell, referrerCell, updatedCell, entriesCell);
        elements.mailingListList.appendChild(row);
      });

      if (state.activePage === "mailing-list") {
        syncActivePageUI();
      }
    }

    function getMailingListEmails() {
      return [...new Set(
        state.mailingListSignups
          .map((signup) => String(signup?.email || "").trim())
          .filter(Boolean)
      )].sort((a, b) => a.localeCompare(b));
    }

    async function copyMailingListEmails() {
      const emails = getMailingListEmails();
      if (!emails.length) {
        setMailingListStatus("No signup emails available to copy.", "is-error");
        return;
      }

      try {
        await navigator.clipboard.writeText(emails.join(", "));
        setMailingListStatus(`Copied ${emails.length} email${emails.length === 1 ? "" : "s"} to the clipboard.`, "is-success");
      } catch (error) {
        console.error("Could not copy mailing list emails:", error);
        setMailingListStatus("Could not copy the email list. Check clipboard permissions.", "is-error");
      }
    }

    function exportMailingListCsv() {
      if (!state.mailingListSignups.length) {
        setMailingListStatus("No signup data available to export.", "is-error");
        return;
      }

      const headers = ["email", "sourcePage", "campaignSlug", "source", "medium", "referrer", "signupCount", "updatedAt"];
      const rows = [...state.mailingListSignups]
        .sort((a, b) => {
          const timeA = getDateForFilter(a?.updatedAt)?.getTime() || 0;
          const timeB = getDateForFilter(b?.updatedAt)?.getTime() || 0;
          return timeB - timeA;
        })
        .map((signup) => headers.map((field) => {
          const rawValue = field === "updatedAt"
            ? (formatTimestamp(signup?.updatedAt) || "")
            : String(signup?.[field] ?? "");
          return `"${rawValue.replace(/"/g, "\"\"")}"`;
        }).join(","));

      const csv = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `mailing-list-signups-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setMailingListStatus(`Exported ${state.mailingListSignups.length} signup${state.mailingListSignups.length === 1 ? "" : "s"} to CSV.`, "is-success");
    }

    async function loadMailingListSignups() {
      if (!elements.mailingListList || !elements.mailingListCount || !elements.mailingListSummary) {
        return;
      }

      state.isLoadingMailingList = true;
      syncRefreshButton();
      setMailingListStatus("");
      elements.mailingListCount.textContent = "Loading signups...";
      elements.mailingListSummary.innerHTML = `
        <article class="campaign-analytics-card">
          <div class="label">Loading</div>
          <div class="value">...</div>
          <div class="detail">Fetching mailing list signups from Firestore.</div>
        </article>
      `;
      elements.mailingListList.innerHTML = `
        <tr>
          <td colspan="6">
            <div class="gig-admin-empty">Loading mailing list signups...</div>
          </td>
        </tr>
      `;
      if (state.activePage === "mailing-list") {
        elements.collectionNote.textContent = "Loading mailing list signups from Firestore...";
        updateHeroMeta("Loading...");
      }

      try {
        const snapshot = await getDocs(collection(db, "mailing-list-signups"));
        state.mailingListSignups = snapshot.docs.map((signupDoc) => ({ id: signupDoc.id, ...signupDoc.data() }));
        renderMailingListSignups();
        if (state.activePage === "mailing-list") {
          updateHeroMeta(new Date().toLocaleString());
        }
      } catch (error) {
        console.error("Error loading mailing list signups:", error);
        state.mailingListSignups = [];
        elements.mailingListCount.textContent = "Load failed";
        elements.mailingListSummary.innerHTML = `
          <article class="campaign-analytics-card">
            <div class="label">Load Failed</div>
            <div class="value">0</div>
            <div class="detail">Could not load mailing list signups.</div>
          </article>
        `;
        elements.mailingListList.innerHTML = `
          <tr>
            <td colspan="6">
              <div class="gig-admin-empty">Could not load mailing list signups.</div>
            </td>
          </tr>
        `;
        setMailingListStatus("Could not load mailing list signups.", "is-error");
        if (state.activePage === "mailing-list") {
          updateHeroMeta("Load failed");
        }
      } finally {
        state.isLoadingMailingList = false;
        syncRefreshButton();
        if (state.activePage === "mailing-list") {
          syncActivePageUI();
        }
      }
    }

    async function loadGigs() {
      state.isLoadingGigs = true;
      syncRefreshButton();
      elements.gigCount.textContent = "Loading gigs...";
      elements.gigList.innerHTML = `<div class="gig-admin-empty">Loading gigs...</div>`;
      if (state.activePage === "gigs") {
        elements.collectionNote.textContent = "Loading gigs from Firestore...";
        updateHeroMeta("Loading...");
      }

      try {
        let snapshot;
        try {
          snapshot = await getDocs(query(collection(db, "gigs"), orderBy("date", "asc")));
        } catch (error) {
          console.warn("Falling back to unordered gig load.", error);
          snapshot = await getDocs(collection(db, "gigs"));
        }

        state.gigs = snapshot.docs
          .filter((gigDoc) => gigDoc.id !== PUBLIC_MIRROR_DOC_ID)
          .map((gigDoc) => normalizeGigEntry(gigDoc.data(), gigDoc.id))
          .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
        renderGigs();
        try {
          await syncPublicGigsMirror(state.gigs);
        } catch (mirrorError) {
          console.warn("Could not sync public gigs mirror.", mirrorError);
        }
        if (state.activePage === "gigs") {
          updateHeroMeta(new Date().toLocaleString());
        }
      } catch (error) {
        console.error("Error loading gigs:", error);
        state.gigs = [];
        elements.gigCount.textContent = "Load failed";
        elements.gigList.innerHTML = `<div class="gig-admin-empty">Could not load gigs. Check the browser console for details.</div>`;
        if (state.activePage === "gigs") {
          updateHeroMeta("Load failed");
          syncActivePageUI();
        }
      } finally {
        state.isLoadingGigs = false;
        syncRefreshButton();
        if (state.activePage === "gigs") {
          syncActivePageUI();
        }
      }
    }

    async function loadLinks() {
      state.isLoadingLinks = true;
      syncRefreshButton();
      syncLinkFormState();
      elements.linkCount.textContent = "Loading links...";
      elements.socialLinkCount.textContent = "Loading...";
      elements.mainLinkCount.textContent = "Loading...";
      elements.socialLinkList.innerHTML = `<div class="gig-admin-empty">Loading links...</div>`;
      elements.mainLinkList.innerHTML = `<div class="gig-admin-empty">Loading links...</div>`;
      if (state.activePage === "links") {
        elements.collectionNote.textContent = "Loading links from Firestore...";
        updateHeroMeta("Loading...");
      }

      try {
        let snapshot;
        try {
          snapshot = await getDocs(query(collection(db, "links"), orderBy("sortOrder", "asc")));
        } catch (error) {
          console.warn("Falling back to unordered link load.", error);
          snapshot = await getDocs(collection(db, "links"));
        }

        state.links = snapshot.docs
          .filter((linkDoc) => linkDoc.id !== PUBLIC_MIRROR_DOC_ID)
          .map((linkDoc, index) => normalizeLinkEntry(linkDoc.data(), linkDoc.id, (index + 1) * 10))
          .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
        renderLinks();
        resetLinkFormDefaults();
        try {
          await syncPublicLinksMirror(state.links);
        } catch (mirrorError) {
          console.warn("Could not sync public links mirror.", mirrorError);
        }
        if (state.activePage === "links") {
          updateHeroMeta(new Date().toLocaleString());
        }
      } catch (error) {
        console.error("Error loading links:", error);
        state.links = [];
        elements.linkCount.textContent = "Load failed";
        elements.socialLinkCount.textContent = "Load failed";
        elements.mainLinkCount.textContent = "Load failed";
        elements.socialLinkList.innerHTML = `<div class="gig-admin-empty">Could not load social links.</div>`;
        elements.mainLinkList.innerHTML = `<div class="gig-admin-empty">Could not load links. Check the browser console for details.</div>`;
        if (state.activePage === "links") {
          updateHeroMeta("Load failed");
          syncActivePageUI();
        }
      } finally {
        state.isLoadingLinks = false;
        syncRefreshButton();
        syncLinkFormState();
        if (state.activePage === "links") {
          syncActivePageUI();
        }
      }
    }

    async function saveGig(event) {
      event.preventDefault();
      if (state.isSavingGig) {
        return;
      }

      const payload = {
        date: elements.gigDate.value,
        event: elements.gigEvent.value.trim(),
        venue: elements.gigVenue.value.trim(),
        city: elements.gigCity.value.trim(),
        ticketUrl: elements.gigTicketUrl.value.trim(),
        ticketPrice: normalizeTicketPrice(elements.gigTicketPrice.value),
        doorPrice: normalizeTicketPrice(elements.gigDoorPrice.value),
        ticketPriceIncludesFee: elements.gigTicketPriceIncludesFee.checked,
        autoRedirect: elements.gigAutoRedirect.checked,
        imageUrl: elements.gigImageUrl.value.trim(),
        metaPixelId: normalizeMetaPixelId(elements.gigMetaPixelId.value),
        hidden: false,
        hideFromEpk: false,
        hideFromLinks: false
      };

      if (!payload.ticketPrice) {
        payload.ticketPriceIncludesFee = false;
      }

      if (!payload.date || !payload.event || !payload.venue) {
        setGigStatus("Date, event, and venue are required.", "is-error");
        return;
      }

      if (payload.metaPixelId && !/^\d+$/.test(payload.metaPixelId)) {
        setGigStatus("Meta Pixel ID must contain digits only.", "is-error");
        return;
      }

      state.isSavingGig = true;
      syncGigFormState();
      setGigStatus("");

      try {
        await addDoc(collection(db, "gigs"), payload);
        elements.gigForm.reset();
        setGigStatus("Gig saved to Firestore.", "is-success");
        await loadGigs();
        closeGigSettingsPanel();
      } catch (error) {
        console.error("Error saving gig:", error);
        setGigStatus("Could not save gig. Check the browser console for details.", "is-error");
      } finally {
        state.isSavingGig = false;
        syncGigFormState();
      }
    }

    async function saveLink(event) {
      event.preventDefault();
      if (state.isSavingLink || state.isSeedingLinks) {
        return;
      }

      const rawSortOrder = elements.linkSortOrder.value.trim();
      const parsedSortOrder = Number.parseInt(rawSortOrder, 10);
      const payload = {
        group: elements.linkGroup.value === "social" ? "social" : "main",
        sortOrder: Number.isFinite(parsedSortOrder) ? parsedSortOrder : getNextLinkSortOrder(),
        title: elements.linkTitle.value.trim(),
        url: elements.linkUrl.value.trim(),
        imageUrl: elements.linkImageUrl.value.trim(),
        section: elements.linkSection.value.trim(),
        kicker: elements.linkKicker.value.trim(),
        description: elements.linkDescription.value.trim(),
        featured: elements.linkFeatured.checked,
        hidden: false
      };

      if (!payload.title || !payload.url) {
        setLinkStatus("Title and URL are required.", "is-error");
        return;
      }

      state.isSavingLink = true;
      syncLinkFormState();
      setLinkStatus("");

      try {
        await addDoc(collection(db, "links"), payload);
        setLinkStatus("Link saved to Firestore.", "is-success");
        resetLinkFormDefaults({ resetValues: true });
        await loadLinks();
      } catch (error) {
        console.error("Error saving link:", error);
        setLinkStatus("Could not save link. Check the browser console for details.", "is-error");
      } finally {
        state.isSavingLink = false;
        syncLinkFormState();
      }
    }

    async function seedDefaultLinks() {
      if (state.isSeedingLinks || state.isSavingLink || state.links.length) {
        return;
      }

      state.isSeedingLinks = true;
      syncLinkFormState();
      setLinkStatus("");

      try {
        await Promise.all(getDefaultLinks().map((entry) => addDoc(collection(db, "links"), entry)));
        setLinkStatus("Imported the current default links into Firestore.", "is-success");
        await loadLinks();
      } catch (error) {
        console.error("Error seeding links:", error);
        setLinkStatus("Could not import default links. Check the browser console for details.", "is-error");
      } finally {
        state.isSeedingLinks = false;
        syncLinkFormState();
      }
    }

    async function saveGigEdit(event) {
      event.preventDefault();
      if (state.isUpdatingGig || !state.activeGigId) {
        return;
      }

      const hideFromEpk = elements.gigEditHidden.checked;
      const hideFromLinks = elements.gigEditHideFromLinks.checked;
      const payload = {
        date: elements.gigEditDate.value,
        event: elements.gigEditEvent.value.trim(),
        venue: elements.gigEditVenue.value.trim(),
        city: elements.gigEditCity.value.trim(),
        ticketUrl: elements.gigEditTicketUrl.value.trim(),
        ticketPrice: normalizeTicketPrice(elements.gigEditTicketPrice.value),
        doorPrice: normalizeTicketPrice(elements.gigEditDoorPrice.value),
        ticketPriceIncludesFee: elements.gigEditTicketPriceIncludesFee.checked,
        autoRedirect: elements.gigEditAutoRedirect.checked,
        imageUrl: elements.gigEditImageUrl.value.trim(),
        metaPixelId: normalizeMetaPixelId(elements.gigEditMetaPixelId.value),
        hidden: hideFromEpk,
        hideFromEpk,
        hideFromLinks
      };

      if (!payload.ticketPrice) {
        payload.ticketPriceIncludesFee = false;
      }

      if (!payload.date || !payload.event || !payload.venue) {
        elements.gigEditError.textContent = "Date, event, and venue are required.";
        return;
      }

      if (payload.metaPixelId && !/^\d+$/.test(payload.metaPixelId)) {
        elements.gigEditError.textContent = "Meta Pixel ID must contain digits only.";
        return;
      }

      state.isUpdatingGig = true;
      elements.gigEditError.textContent = "";
      syncGigEditState();

      try {
        await updateDoc(doc(db, "gigs", state.activeGigId), payload);
        await loadGigs();
        closeGigEditDialog();
      } catch (error) {
        console.error("Error updating gig:", error);
        elements.gigEditError.textContent = "Could not update gig. Check the browser console for details.";
      } finally {
        state.isUpdatingGig = false;
        syncGigEditState();
      }
    }

    async function saveLinkEdit(event) {
      event.preventDefault();
      if (state.isUpdatingLink || !state.activeLinkId) {
        return;
      }

      const rawSortOrder = elements.linkEditSortOrder.value.trim();
      const parsedSortOrder = Number.parseInt(rawSortOrder, 10);
      const payload = {
        group: elements.linkEditGroup.value === "social" ? "social" : "main",
        sortOrder: Number.isFinite(parsedSortOrder) ? parsedSortOrder : getNextLinkSortOrder(),
        title: elements.linkEditTitleInput.value.trim(),
        url: elements.linkEditUrl.value.trim(),
        imageUrl: elements.linkEditImageUrl.value.trim(),
        section: elements.linkEditSection.value.trim(),
        kicker: elements.linkEditKicker.value.trim(),
        description: elements.linkEditDescription.value.trim(),
        featured: elements.linkEditFeatured.checked,
        hidden: elements.linkEditHidden.checked
      };

      if (!payload.title || !payload.url) {
        elements.linkEditError.textContent = "Title and URL are required.";
        return;
      }

      state.isUpdatingLink = true;
      elements.linkEditError.textContent = "";
      syncLinkEditState();

      try {
        await updateDoc(doc(db, "links", state.activeLinkId), payload);
        await loadLinks();
        closeLinkEditDialog();
      } catch (error) {
        console.error("Error updating link:", error);
        elements.linkEditError.textContent = "Could not update link. Check the browser console for details.";
      } finally {
        state.isUpdatingLink = false;
        syncLinkEditState();
      }
    }

    function renderCampaign() {
      if (!state.campaign || !state.campaign.title) {
        elements.campaignOpenLink.href = getCampaignPublicUrl();
        if (elements.openCampaignQr) {
          elements.openCampaignQr.disabled = true;
        }
        elements.campaignCount.textContent = "No campaign selected";
        elements.campaignPreview.innerHTML = `<div class="campaign-preview-empty">No campaign loaded yet. Save a title and at least one destination URL to publish a first release page.</div>`;
        renderCampaignAnalytics();
        if (state.activePage === "campaigns") {
          syncActivePageUI();
        }
        return;
      }

      const campaign = state.campaign;
      const destinations = getCampaignDestinations(campaign);
      const releaseDate = campaign.releaseDate ? formatGigDate(campaign.releaseDate) : "";
      elements.campaignOpenLink.href = getCampaignPublicUrl();
      if (elements.openCampaignQr) {
        elements.openCampaignQr.disabled = false;
      }

      elements.campaignCount.textContent = `${campaign.live ? "Live" : "Draft"} | /smartlink/${campaign.slug || "campaign"} | ${destinations.length} destination${destinations.length === 1 ? "" : "s"}`;
      elements.campaignPreview.innerHTML = "";

      const card = document.createElement("article");
      card.className = "campaign-preview-card";

      const top = document.createElement("div");
      top.className = "campaign-preview-top";

      const topCopy = document.createElement("div");

      const kicker = document.createElement("div");
      kicker.className = "campaign-preview-kicker";
      kicker.textContent = campaign.badge || "Smart Link";
      topCopy.appendChild(kicker);

      const status = document.createElement("span");
      status.className = `campaign-preview-status ${campaign.live ? "is-live" : "is-draft"}`;
      status.textContent = campaign.live ? "Live" : "Draft";

      top.appendChild(topCopy);
      top.appendChild(status);
      card.appendChild(top);

      const title = document.createElement("h3");
      title.className = "campaign-preview-title";
      title.textContent = campaign.title;
      card.appendChild(title);

      if (campaign.subtitle) {
        const subtitle = document.createElement("div");
        subtitle.className = "campaign-preview-subtitle";
        subtitle.textContent = campaign.subtitle;
        card.appendChild(subtitle);
      }

      if (campaign.description) {
        const description = document.createElement("div");
        description.className = "campaign-preview-description";
        description.textContent = campaign.description;
        card.appendChild(description);
      }

      const meta = document.createElement("div");
      meta.className = "campaign-preview-meta";

      if (releaseDate) {
        const releaseChip = document.createElement("span");
        releaseChip.className = "campaign-preview-chip";
        releaseChip.textContent = `Release: ${releaseDate}`;
        meta.appendChild(releaseChip);
      }

      if (campaign.artworkUrl) {
        const artworkChip = document.createElement("span");
        artworkChip.className = "campaign-preview-chip";
        artworkChip.textContent = "Artwork ready";
        meta.appendChild(artworkChip);
      }

      if (campaign.metaPixelId) {
        const pixelChip = document.createElement("span");
        pixelChip.className = "campaign-preview-chip";
        pixelChip.textContent = "Meta Pixel ready";
        meta.appendChild(pixelChip);
      }

      const destinationChip = document.createElement("span");
      destinationChip.className = "campaign-preview-chip";
      destinationChip.textContent = `${destinations.length} destination${destinations.length === 1 ? "" : "s"}`;
      meta.appendChild(destinationChip);

      card.appendChild(meta);

      if (destinations.length) {
        const links = document.createElement("div");
        links.className = "campaign-preview-links";

        destinations.forEach((entry) => {
          const link = document.createElement("a");
          link.className = "campaign-preview-link";
          link.href = entry.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = entry.label;
          links.appendChild(link);
        });

        card.appendChild(links);
      } else {
        const empty = document.createElement("div");
        empty.className = "campaign-preview-empty";
        empty.textContent = "No destination URLs set yet. Add at least one button or platform link before making this page live.";
        card.appendChild(empty);
      }

      elements.campaignPreview.appendChild(card);
      renderCampaignAnalytics();

      if (state.activePage === "campaigns") {
        syncActivePageUI();
      }
    }

    function renderCampaignLibrary() {
      if (!elements.campaignList || !elements.campaignListCount) {
        return;
      }

      const campaigns = getSortedCampaigns();
      elements.campaignListCount.textContent = `${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"}`;
      elements.campaignList.innerHTML = "";

      if (!campaigns.length) {
        elements.campaignList.innerHTML = `<div class="gig-admin-empty">No campaigns saved yet.</div>`;
        return;
      }

      campaigns.forEach((campaign) => {
        const item = document.createElement("article");
        item.className = `campaign-library-item${campaign.slug === state.activeCampaignId ? " is-active" : ""}`;
        item.dataset.campaignId = campaign.slug;

        const top = document.createElement("div");
        top.className = "campaign-library-top";

        const title = document.createElement("div");
        title.className = "campaign-library-title";
        title.textContent = campaign.title || campaign.slug;

        const status = document.createElement("span");
        status.className = `campaign-library-status${campaign.live ? " is-live" : ""}`;
        status.textContent = campaign.live ? "Live" : "Saved";

        top.append(title, status);

        const meta = document.createElement("div");
        meta.className = "campaign-library-meta";
        meta.textContent = `/${campaign.slug}${campaign.releaseDate ? ` - ${formatGigDate(campaign.releaseDate)}` : ""}`;
        const actions = document.createElement("div");
        actions.className = "campaign-library-actions";

        const selectButton = document.createElement("button");
        selectButton.type = "button";
        selectButton.className = "campaign-library-open";
        selectButton.textContent = "Edit Campaign";
        selectButton.addEventListener("click", () => {
          state.activeCampaignId = campaign.slug;
          state.campaign = getCampaignById(campaign.slug);
          populateCampaignForm(state.campaign);
          renderCampaign();
          renderCampaignLibrary();
          setCampaignStatus("");
          openCampaignSettingsPanel();
        });

        const publicLink = document.createElement("a");
        publicLink.className = "campaign-library-open";
        publicLink.href = getCampaignPublicUrl(campaign);
        publicLink.target = "_blank";
        publicLink.rel = "noopener noreferrer";
        publicLink.textContent = "Open Campaign";

        const analyticsButton = document.createElement("button");
        analyticsButton.type = "button";
        analyticsButton.className = "campaign-library-open";
        analyticsButton.textContent = "Analytics";
        analyticsButton.addEventListener("click", () => {
          openCampaignAnalyticsDialog(campaign.slug);
        });

        const qrButton = document.createElement("button");
        qrButton.type = "button";
        qrButton.className = "campaign-library-open";
        qrButton.textContent = "QR Code";
        qrButton.addEventListener("click", () => {
          openCampaignQrDialog(campaign.slug);
        });

        actions.append(selectButton, publicLink, analyticsButton, qrButton);
        item.append(top, meta, actions);

        elements.campaignList.appendChild(item);
      });
    }

    async function loadCampaign() {
      state.isLoadingCampaign = true;
      syncRefreshButton();
      syncCampaignFormState();
      elements.campaignCount.textContent = "Loading campaigns...";
      elements.campaignPreview.innerHTML = `<div class="campaign-preview-empty">Loading campaign settings...</div>`;
      if (elements.campaignList) {
        elements.campaignList.innerHTML = `<div class="gig-admin-empty">Loading campaigns...</div>`;
      }
      if (state.activePage === "campaigns") {
        elements.collectionNote.textContent = "Loading campaign settings from Firestore...";
        updateHeroMeta("Loading...");
      }

      try {
        let campaignSnapshot;
        try {
          campaignSnapshot = await getDocs(collection(db, "campaigns"));
        } catch (error) {
          campaignSnapshot = { docs: [] };
        }

        state.campaigns = campaignSnapshot.docs
          .filter((entry) => entry.id !== "active")
          .map((entry) => normalizeCampaignEntry({ ...entry.data(), slug: entry.id }));

        const nextActiveId = getCampaignById(state.activeCampaignId)
          ? state.activeCampaignId
          : getSortedCampaigns(state.campaigns)[0]?.slug || "";

        state.activeCampaignId = nextActiveId;
        state.campaign = nextActiveId ? getCampaignById(nextActiveId) : null;
        populateCampaignForm(state.campaign);
        renderCampaign();
        renderCampaignLibrary();

        if (state.activePage === "campaigns") {
          const updatedLabel = state.campaign?.updatedAt
            ? (formatTimestamp(state.campaign.updatedAt) || new Date().toLocaleString())
            : state.campaign
              ? "Saved"
              : `${state.campaigns.length} campaign${state.campaigns.length === 1 ? "" : "s"}`;
          updateHeroMeta(updatedLabel);
        }
      } catch (error) {
        console.error("Error loading campaign:", error);
        state.campaign = null;
        state.campaigns = [];
        state.activeCampaignId = "";
        populateCampaignForm(null);
        elements.campaignCount.textContent = "Load failed";
        elements.campaignPreview.innerHTML = `<div class="campaign-preview-empty">Could not load campaign settings. Check the browser console for details.</div>`;
        if (elements.campaignList) {
          elements.campaignList.innerHTML = `<div class="gig-admin-empty">Could not load campaigns.</div>`;
        }
        if (state.activePage === "campaigns") {
          updateHeroMeta("Load failed");
          syncActivePageUI();
        }
      } finally {
        state.isLoadingCampaign = false;
        syncRefreshButton();
        syncCampaignFormState();
        if (state.activePage === "campaigns") {
          syncActivePageUI();
        }
      }
    }

    async function saveCampaign(event) {
      event.preventDefault();
      if (state.isSavingCampaign || state.isLoadingCampaign) {
        return;
      }

      const payload = normalizeCampaignEntry({
        badge: elements.campaignBadge.value,
        title: elements.campaignTitle.value,
        subtitle: elements.campaignSubtitle.value,
        description: elements.campaignDescription.value,
        releaseDate: elements.campaignReleaseDate.value,
        artworkUrl: elements.campaignArtworkUrl.value,
        metaPixelId: elements.campaignMetaPixelId.value,
        primaryLabel: elements.campaignPrimaryLabel.value,
        primaryUrl: elements.campaignPrimaryUrl.value,
        secondaryLabel: elements.campaignSecondaryLabel.value,
        secondaryUrl: elements.campaignSecondaryUrl.value,
        spotifyUrl: elements.campaignSpotifyUrl.value,
        appleMusicUrl: elements.campaignAppleUrl.value,
        youtubeUrl: elements.campaignYoutubeUrl.value,
        bandcampUrl: elements.campaignBandcampUrl.value,
        live: elements.campaignLive.checked,
        updatedAt: new Date()
      });

      const invalidCampaignUrls = [];
      const validateCampaignUrl = (key, label) => {
        const rawValue = String(payload[key] || "").trim();
        if (!rawValue) {
          payload[key] = "";
          return;
        }

        const normalizedValue = normalizeCampaignDestinationUrl(rawValue);
        if (!normalizedValue) {
          invalidCampaignUrls.push(label);
          return;
        }

        payload[key] = normalizedValue;
      };

      validateCampaignUrl("primaryUrl", "Primary button URL");
      validateCampaignUrl("secondaryUrl", "Secondary button URL");
      validateCampaignUrl("spotifyUrl", "Spotify URL");
      validateCampaignUrl("appleMusicUrl", "Apple Music URL");
      validateCampaignUrl("youtubeUrl", "YouTube URL");
      validateCampaignUrl("bandcampUrl", "Bandcamp URL");

      if (!payload.title) {
        setCampaignStatus("A campaign title is required.", "is-error");
        return;
      }

      const previousCampaignId = state.activeCampaignId || "";
      const slug = normalizeCampaignSlug(elements.campaignSlug.value, payload.title);
      if (!slug) {
        setCampaignStatus("Add a title or slug before saving this campaign.", "is-error");
        return;
      }
      payload.slug = slug;

      if (invalidCampaignUrls.length) {
        setCampaignStatus(`Fix the invalid campaign URL${invalidCampaignUrls.length === 1 ? "" : "s"}: ${invalidCampaignUrls.join(", ")}.`, "is-error");
        return;
      }

      if (payload.metaPixelId && !/^\d+$/.test(payload.metaPixelId)) {
        setCampaignStatus("Meta Pixel ID should contain numbers only.", "is-error");
        return;
      }

      if (payload.primaryUrl && !payload.primaryLabel) {
        payload.primaryLabel = "Listen now";
      }

      if (payload.secondaryUrl && !payload.secondaryLabel) {
        payload.secondaryLabel = "Learn more";
      }

      if (payload.primaryLabel && !payload.primaryUrl) {
        setCampaignStatus("Add a URL for the primary button, or clear its label.", "is-error");
        return;
      }

      if (payload.secondaryLabel && !payload.secondaryUrl) {
        setCampaignStatus("Add a URL for the secondary button, or clear its label.", "is-error");
        return;
      }

      if (payload.live && !getCampaignDestinations(payload).length) {
        setCampaignStatus("Add at least one destination URL before making the page live.", "is-error");
        return;
      }

      state.isSavingCampaign = true;
      syncCampaignFormState();
      setCampaignStatus("");

      try {
        await Promise.all([
          setDoc(doc(db, "campaigns", slug), payload),
          setDoc(doc(db, "public-campaigns", slug), payload)
        ]);

        if (previousCampaignId && previousCampaignId !== slug) {
          await Promise.all([
            deleteDoc(doc(db, "campaigns", previousCampaignId)),
            deleteDoc(doc(db, "public-campaigns", previousCampaignId))
          ]);
        }

        await Promise.allSettled([
          deleteDoc(doc(db, "campaigns", "active")),
          deleteDoc(doc(db, "public-campaigns", "active"))
        ]);

        state.activeCampaignId = slug;
        setCampaignStatus(`Campaign saved to /smartlink/${slug}.`, "is-success");
        await loadCampaign();
        closeCampaignSettingsPanel();
      } catch (error) {
        console.error("Error saving campaign:", error);
        setCampaignStatus("Could not save campaign. Check the browser console for details.", "is-error");
      } finally {
        state.isSavingCampaign = false;
        syncCampaignFormState();
      }
    }

    function syncViewModeButtons() {
      elements.viewModeButtons.forEach((button) => {
        const isActive = button.dataset.viewMode === state.viewMode;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    }

    function renderStats() {
      const latestWithTimestamp = state.allLogs.find((entry) => formatTimestamp(entry.timestamp));
      const latestTimestamp = latestWithTimestamp ? formatTimestamp(latestWithTimestamp.timestamp) : "No timestamp";
      const activeEntries = getActiveEntries();
      const visibleCount = activeEntries.length;
      const sessionCount = state.sessionGroups.length;
      const groupingField = getBestGroupingField();
      const tableFields = getVisibleTableFields();
      const uniqueActions = groupingField
        ? new Set(activeEntries.map((entry) => entry[groupingField]).filter(Boolean)).size
        : 0;

      elements.statsGrid.innerHTML = `
        <article class="stat-card">
          <div class="label">Total Events</div>
          <div class="value">${state.allLogs.length}</div>
          <div class="detail">Loaded from ${state.currentCollection}</div>
        </article>
        <article class="stat-card">
          <div class="label">Visible Results</div>
          <div class="value">${visibleCount}</div>
          <div class="detail">${state.searchTerm ? "Filtered by search query" : "Showing all available rows"}</div>
        </article>
        <article class="stat-card">
          <div class="label">Unique ${groupingField || "Fields"}</div>
          <div class="value">${uniqueActions}</div>
          <div class="detail">${groupingField ? `Based on ${groupingField}` : "No grouping field available"}</div>
        </article>
        <article class="stat-card">
          <div class="label">Latest Event</div>
          <div class="value">${latestTimestamp === "No timestamp" ? "N/A" : "Recent"}</div>
          <div class="detail">${latestTimestamp}</div>
        </article>
      `;

      elements.fieldCount.textContent = `${state.dynamicFields.length} fields detected`;
      if (state.activePage === "analytics") {
        elements.collectionNote.textContent = state.viewMode === "sessions"
          ? `Viewing ${visibleCount} event${visibleCount === 1 ? "" : "s"} across ${sessionCount} session${sessionCount === 1 ? "" : "s"} from ${state.currentCollection}.`
          : `Viewing ${visibleCount} result${visibleCount === 1 ? "" : "s"} from ${state.currentCollection}.`;
      }
      const baseCaption = state.dateFrom || state.dateTo
        ? `Filters applied: ${state.dateFrom || "any date"} to ${state.dateTo || "any date"}${state.searchTerm ? `, plus "${state.searchTerm}"` : ""}.`
        : `Search, date range, and collection filters apply to the table and export${state.searchTerm ? `, including "${state.searchTerm}".` : "."}`;
      const visibilityNote = state.dynamicFields.length > tableFields.length
        ? ` Table shows ${tableFields.length} key columns; open Details for the full event or export CSV for every field.`
        : "";
      const sessionNote = state.viewMode === "sessions"
        ? " Session view groups filtered events by sessionId, hides events without a sessionId, and paginates by session."
        : "";
      elements.filterCaption.textContent = `${baseCaption}${visibilityNote}${sessionNote}`;
    }

    function renderSummary() {
      const activeEntries = getActiveEntries();

      if (!state.allLogs.length) {
        elements.summary.innerHTML = `<span class="chip">No data available</span>`;
        elements.summaryCaption.textContent = "No event data loaded";
        return;
      }

      if (!activeEntries.length) {
        elements.summary.innerHTML = `<span class="chip">${state.viewMode === "sessions" ? "No matching sessions" : "No matching events"}</span>`;
        elements.summaryCaption.textContent = state.viewMode === "sessions"
          ? "Current filters returned no session-based rows"
          : "Current filters returned no rows";
        return;
      }

      const summaryField = getBestGroupingField();

      if (!summaryField) {
        elements.summary.innerHTML = `<span class="chip">No summary field available</span>`;
        elements.summaryCaption.textContent = "Could not determine a summary dimension";
        return;
      }

      const counts = {};
      activeEntries.forEach((entry) => {
        const key = entry[summaryField] ?? "Unknown";
        counts[key] = (counts[key] || 0) + 1;
      });

      const chips = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([label, count]) => `<span class="chip"><strong>${count}</strong> ${label}</span>`)
        .join("");

      elements.summary.innerHTML = chips || `<span class="chip">No summary data</span>`;
      elements.summaryCaption.textContent = `Grouped by ${summaryField}`;
    }

    function createEventRow(entry, tableFields) {
      const row = document.createElement("tr");

      tableFields.forEach((field) => {
        const cell = document.createElement("td");
        const span = document.createElement("span");
        const { text, isCode } = formatValue(entry[field], field);
        span.className = `cell-value${isCode ? " code" : ""}`;
        span.dataset.field = field;
        span.textContent = text;
        if (text && text !== "-") {
          span.title = text;
        }
        cell.appendChild(span);
        row.appendChild(cell);
      });

      const actionCell = document.createElement("td");
      actionCell.className = "action-cell";
      const actionsWrap = document.createElement("div");
      actionsWrap.className = "row-actions";
      actionsWrap.appendChild(createDetailsButton(entry.id));
      actionCell.appendChild(actionsWrap);
      row.appendChild(actionCell);

      return row;
    }

    function createSessionHeaderRow(group, colSpan) {
      const row = document.createElement("tr");
      row.className = "session-row";

      const cell = document.createElement("td");
      cell.className = "session-row-cell";
      cell.colSpan = colSpan;

      const latestText = group.latestAt ? formatTimestamp(group.latestAt) : "No timestamp";
      const wrap = document.createElement("div");
      wrap.className = "session-row-content";

      const main = document.createElement("div");
      main.className = "session-row-main";

      const title = document.createElement("span");
      title.className = "session-row-title";
      title.textContent = group.label;

      const count = document.createElement("span");
      count.className = "session-row-count";
      count.textContent = `${group.entries.length} event${group.entries.length === 1 ? "" : "s"}`;

      const meta = document.createElement("div");
      meta.className = "session-row-meta";
      meta.textContent = `Latest ${latestText}`;

      const actions = document.createElement("div");
      actions.className = "session-row-actions";

      const toggleButton = document.createElement("button");
      toggleButton.type = "button";
      toggleButton.className = "row-action";
      toggleButton.textContent = state.expandedSessions.has(group.key) ? "Collapse" : "Expand";
      toggleButton.disabled = state.deletingSessions.has(group.key);
      toggleButton.addEventListener("click", () => {
        toggleSessionExpanded(group.key);
      });

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "row-action delete-action";
      deleteButton.textContent = state.deletingSessions.has(group.key) ? "Deleting..." : "Delete Session";
      deleteButton.disabled = state.deletingSessions.has(group.key);
      deleteButton.addEventListener("click", () => {
        openDeleteSessionDialog(group.key);
      });

      actions.appendChild(toggleButton);
      actions.appendChild(deleteButton);
      main.appendChild(title);
      main.appendChild(count);
      wrap.appendChild(main);
      wrap.appendChild(meta);
      wrap.appendChild(actions);

      cell.appendChild(wrap);
      row.appendChild(cell);
      return row;
    }

    function createMobileEventCard(entry, titleText, indexText, tableFields) {
      const card = document.createElement("article");
      card.className = "mobile-card";

      const cardHeader = document.createElement("div");
      cardHeader.className = "mobile-card-header";

      const title = document.createElement("div");
      title.className = "mobile-card-title";
      title.textContent = titleText;

      const itemIndex = document.createElement("div");
      itemIndex.className = "mobile-card-index";
      itemIndex.textContent = indexText;

      cardHeader.appendChild(title);
      cardHeader.appendChild(itemIndex);
      card.appendChild(cardHeader);

      const grid = document.createElement("div");
      grid.className = "mobile-card-grid";

      tableFields.forEach((field) => {
        const fieldWrap = document.createElement("div");
        fieldWrap.className = "mobile-field";
        fieldWrap.dataset.field = field;

        const label = document.createElement("div");
        label.className = "mobile-field-label";
        label.textContent = formatFieldLabel(field);

        const value = document.createElement("div");
        const formatted = formatValue(entry[field], field);
        value.className = `mobile-field-value${formatted.isCode ? " code" : ""}`;
        value.textContent = formatted.text;

        fieldWrap.appendChild(label);
        fieldWrap.appendChild(value);
        grid.appendChild(fieldWrap);
      });

      card.appendChild(grid);

      const actions = document.createElement("div");
      actions.className = "mobile-card-actions";
      actions.appendChild(createDetailsButton(entry.id));
      card.appendChild(actions);

      return card;
    }

    function createMobileSessionHeader(group) {
      const header = document.createElement("div");
      header.className = "mobile-session-header";

      const title = document.createElement("div");
      title.className = "mobile-session-title";
      title.textContent = group.label;

      const meta = document.createElement("div");
      meta.className = "mobile-session-meta";
      const latestText = group.latestAt ? formatTimestamp(group.latestAt) : "No timestamp";
      meta.textContent = `${group.entries.length} event${group.entries.length === 1 ? "" : "s"} - Latest ${latestText}`;

      const actions = document.createElement("div");
      actions.className = "mobile-session-actions";

      const toggleButton = document.createElement("button");
      toggleButton.type = "button";
      toggleButton.className = "row-action";
      toggleButton.textContent = state.expandedSessions.has(group.key) ? "Collapse" : "Expand";
      toggleButton.disabled = state.deletingSessions.has(group.key);
      toggleButton.addEventListener("click", () => {
        toggleSessionExpanded(group.key);
      });

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "row-action delete-action";
      deleteButton.textContent = state.deletingSessions.has(group.key) ? "Deleting..." : "Delete Session";
      deleteButton.disabled = state.deletingSessions.has(group.key);
      deleteButton.addEventListener("click", () => {
        openDeleteSessionDialog(group.key);
      });

      actions.appendChild(toggleButton);
      actions.appendChild(deleteButton);

      header.appendChild(title);
      header.appendChild(meta);
      header.appendChild(actions);
      return header;
    }

    function renderTable() {
      elements.tableHead.innerHTML = "";
      elements.tableBody.innerHTML = "";
      elements.mobileCards.innerHTML = "";

      if (!state.dynamicFields.length) {
        elements.tableBody.innerHTML = `<tr><td><div class="empty-state">No fields available for this collection.</div></td></tr>`;
        elements.mobileCards.innerHTML = `<div class="empty-state">No fields available for this collection.</div>`;
        return;
      }

      const tableFields = getVisibleTableFields();
      const headerRow = document.createElement("tr");
      tableFields.forEach((field) => {
        const th = document.createElement("th");
        th.textContent = formatFieldLabel(field);
        headerRow.appendChild(th);
      });
      const actionHead = document.createElement("th");
      actionHead.className = "action-head";
      actionHead.textContent = "Actions";
      headerRow.appendChild(actionHead);
      elements.tableHead.appendChild(headerRow);

      if (!getActiveEntries().length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = tableFields.length + 1;
        cell.innerHTML = `<div class="empty-state">${state.viewMode === "sessions" ? "No matching sessions. Try a broader search or switch back to Events." : "No matching events. Try a broader search."}</div>`;
        row.appendChild(cell);
        elements.tableBody.appendChild(row);
        elements.mobileCards.innerHTML = `<div class="empty-state">${state.viewMode === "sessions" ? "No matching sessions. Try a broader search or switch back to Events." : "No matching events. Try a broader search."}</div>`;
        return;
      }

      const start = (state.page - 1) * state.pageSize;

      if (state.viewMode === "sessions") {
        const pageGroups = state.sessionGroups.slice(start, start + state.pageSize);
        pageGroups.forEach((group) => {
          elements.tableBody.appendChild(createSessionHeaderRow(group, tableFields.length + 1));
          if (state.expandedSessions.has(group.key)) {
            group.entries.forEach((entry) => {
              elements.tableBody.appendChild(createEventRow(entry, tableFields));
            });
          }

          elements.mobileCards.appendChild(createMobileSessionHeader(group));
          if (state.expandedSessions.has(group.key)) {
            group.entries.forEach((entry, index) => {
              const titleText = entry.label || entry.action || entry.target || entry.page || state.currentCollection;
              const indexText = formatTimestamp(entry.timestamp) || `Event ${index + 1}`;
              elements.mobileCards.appendChild(createMobileEventCard(entry, titleText, indexText, tableFields));
            });
          }
        });

        return;
      }

      const pageItems = state.filteredLogs.slice(start, start + state.pageSize);

      pageItems.forEach((entry) => {
        elements.tableBody.appendChild(createEventRow(entry, tableFields));
      });

      pageItems.forEach((entry, index) => {
        const titleText = entry.label || entry.action || entry.target || entry.page || state.currentCollection;
        const indexText = `#${start + index + 1}`;
        elements.mobileCards.appendChild(createMobileEventCard(entry, titleText, indexText, tableFields));
      });
    }

    function createDetailsButton(id) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "row-action";
      button.textContent = "View";
      button.addEventListener("click", () => {
        openDetailsDialog(id);
      });
      return button;
    }

    function getEntryById(id) {
      return state.allLogs.find((item) => item.id === id);
    }

    function closeDetailsDialog() {
      if (elements.detailsDialog.open) {
        elements.detailsDialog.close();
      }
    }

    function openDetailsDialog(id) {
      const entry = getEntryById(id);
      if (!entry) {
        return;
      }

      state.activeDetailsId = id;
      const entryTitle = entry.label || entry.action || entry.target || entry.page || "Analytics Entry";
      const timestamp = formatTimestamp(entry.timestamp);
      const visibleFields = state.dynamicFields.filter((field) => {
        const value = entry[field];
        return value !== null && value !== undefined && value !== "";
      });

      elements.detailsDialogTitle.textContent = entryTitle;
      elements.detailsDialogSubtitle.textContent = timestamp
        ? `${state.currentCollection} - ${timestamp}`
        : `Full ${state.currentCollection} event details`;
      elements.detailsDelete.disabled = state.deletingIds.has(id);
      elements.detailsDelete.textContent = state.deletingIds.has(id) ? "Deleting..." : "Delete Entry";
      elements.detailsDialogGrid.innerHTML = "";

      visibleFields.forEach((field) => {
        const fieldCard = document.createElement("div");
        fieldCard.className = "details-field";

        const label = document.createElement("div");
        label.className = "details-field-label";
        label.textContent = formatFieldLabel(field);

        const value = document.createElement("div");
        const formatted = formatValue(entry[field], field);
        value.className = `details-field-value${formatted.isCode ? " code" : ""}`;
        value.textContent = formatted.text;

        fieldCard.appendChild(label);
        fieldCard.appendChild(value);
        elements.detailsDialogGrid.appendChild(fieldCard);
      });

      if (!visibleFields.length) {
        elements.detailsDialogGrid.innerHTML = `<div class="empty-state">No additional fields available for this entry.</div>`;
      }

      if (!elements.detailsDialog.open) {
        elements.detailsDialog.showModal();
      }
    }

    function openDeleteFromDetails() {
      const id = state.activeDetailsId;
      if (!id) {
        return;
      }

      closeDetailsDialog();
      openDeleteDialog(id);
    }

    function toggleSessionExpanded(sessionKey) {
      if (!sessionKey) {
        return;
      }

      if (state.expandedSessions.has(sessionKey)) {
        state.expandedSessions.delete(sessionKey);
      } else {
        state.expandedSessions.add(sessionKey);
      }

      renderTable();
    }

    function isDeleteTargetInProgress(target) {
      if (!target) {
        return false;
      }

      if (target.type === "gig") {
        return state.deletingGigIds.has(target.id);
      }

      if (target.type === "link") {
        return state.deletingLinkIds.has(target.id);
      }

      if (target.type === "campaign") {
        return state.isDeletingCampaign;
      }

      if (target.type === "session") {
        return state.deletingSessions.has(target.sessionKey);
      }

      return state.deletingIds.has(target.id);
    }

    function openDeleteSessionDialog(sessionKey) {
      const group = getSessionGroupByKey(sessionKey);
      if (!group || state.deletingSessions.has(sessionKey)) {
        return;
      }

      state.pendingDeleteTarget = {
        type: "session",
        sessionKey,
        ids: group.entries.map((entry) => entry.id),
        label: group.label,
        count: group.entries.length,
        latestAt: group.latestAt ? formatTimestamp(group.latestAt) : "No timestamp available"
      };
      state.refreshAfterDeleteClose = false;
      elements.deleteDialogError.textContent = "";
      const { eventLabel, timestamp } = getDeleteDialogCopy(state.pendingDeleteTarget);
      elements.deleteDialogEvent.textContent = eventLabel;
      elements.deleteDialogTimestamp.textContent = timestamp;
      syncDeleteDialogCopy();
      syncDeleteDialogState();

      if (!elements.deleteDialog.open) {
        elements.deleteDialog.showModal();
      }
    }

    function getDeleteDialogCopyLegacy(target) {
      if (!target) {
        return { eventLabel: "-", timestamp: "-" };
      }

      if (target.type === "gig") {
        const gig = getGigById(target.id);
        return {
          eventLabel: gig?.event || "Live show",
          timestamp: gig ? `${formatGigDate(gig.date)} - ${gig.venue || "Venue"}${gig.city ? `, ${gig.city}` : ""}` : "No gig details available"
        };
      }

      if (target.type === "session") {
        return {
          eventLabel: target.label,
          timestamp: `${target.count} event${target.count === 1 ? "" : "s"} in this session`
        };
      }

      const entry = getEntryById(target.id);
      const eventLabel = entry?.label || entry?.target || entry?.action || entry?.page || target.id;
      const timestamp = entry ? (formatTimestamp(entry.timestamp) || "No timestamp available") : "No timestamp available";
      return { eventLabel, timestamp };
    }

    function syncDeleteDialogState() {
      const isDeleting = isDeleteTargetInProgress(state.pendingDeleteTarget);
      const isSessionDelete = state.pendingDeleteTarget?.type === "session";
      const isGigDelete = state.pendingDeleteTarget?.type === "gig";
      const isLinkDelete = state.pendingDeleteTarget?.type === "link";
      const isCampaignDelete = state.pendingDeleteTarget?.type === "campaign";
      elements.confirmDelete.disabled = !state.pendingDeleteTarget || isDeleting;
      elements.cancelDelete.disabled = isDeleting;
      elements.confirmDelete.textContent = isDeleting
        ? "Deleting..."
        : isGigDelete
          ? "Delete Gig"
        : isLinkDelete
          ? "Delete Link"
        : isCampaignDelete
          ? "Delete Campaign"
        : isSessionDelete
          ? "Delete Session"
          : "Delete Entry";
    }

    function getDeleteDialogCopy(target) {
      if (!target) {
        return { eventLabel: "-", timestamp: "-" };
      }

      if (target.type === "gig") {
        const gig = getGigById(target.id);
        return {
          eventLabel: gig?.event || "Live show",
          timestamp: gig ? `${formatGigDate(gig.date)} | ${gig.venue || "Venue"}${gig.city ? `, ${gig.city}` : ""}` : "No gig details available"
        };
      }

      if (target.type === "link") {
        const link = getLinkById(target.id);
        return {
          eventLabel: link?.title || "Link",
          timestamp: link ? `${link.group === "social" ? "Social" : "Main"} | ${link.url || "No URL"}` : "No link details available"
        };
      }

      if (target.type === "campaign") {
        const campaign = state.campaign;
        return {
          eventLabel: campaign?.title || "Campaign",
          timestamp: campaign ? `${campaign.live ? "Live" : "Draft"} | ${campaign.releaseDate ? formatGigDate(campaign.releaseDate) : "No release date"}` : "No campaign details available"
        };
      }

      if (target.type === "session") {
        return {
          eventLabel: target.label,
          timestamp: `${target.count} event${target.count === 1 ? "" : "s"} in this session`
        };
      }

      const entry = getEntryById(target.id);
      const eventLabel = entry?.label || entry?.target || entry?.action || entry?.page || target.id;
      const timestamp = entry ? (formatTimestamp(entry.timestamp) || "No timestamp available") : "No timestamp available";
      return { eventLabel, timestamp };
    }

    function syncDeleteDialogCopy() {
      if (!state.pendingDeleteTarget) {
        elements.deleteDialogTitle.textContent = "Remove this analytics entry?";
        elements.deleteDialogDescription.textContent = "This action will permanently delete the selected record from the current collection.";
        return;
      }

      if (state.pendingDeleteTarget.type === "gig") {
        elements.deleteDialogTitle.textContent = "Remove this gig?";
        elements.deleteDialogDescription.textContent = "This action will permanently delete the selected gig from the gigs collection.";
        return;
      }

      if (state.pendingDeleteTarget.type === "link") {
        elements.deleteDialogTitle.textContent = "Remove this link?";
        elements.deleteDialogDescription.textContent = "This action will permanently delete the selected link from the links collection.";
        return;
      }

      if (state.pendingDeleteTarget.type === "campaign") {
        elements.deleteDialogTitle.textContent = "Remove this campaign?";
        elements.deleteDialogDescription.textContent = "This action will permanently delete the selected campaign and its public smart-link page.";
        return;
      }

      if (state.pendingDeleteTarget.type === "session") {
        elements.deleteDialogTitle.textContent = "Remove this session?";
        elements.deleteDialogDescription.textContent = "This action will permanently delete every event in the selected session from the current collection.";
        return;
      }

      elements.deleteDialogTitle.textContent = "Remove this analytics entry?";
      elements.deleteDialogDescription.textContent = "This action will permanently delete the selected record from the current collection.";
    }

    function syncActivePageUI() {
      const isAnalyticsPage = state.activePage === "analytics";
      const isGigsPage = state.activePage === "gigs";
      const isLinksPage = state.activePage === "links";
      const isMailingListPage = state.activePage === "mailing-list";
      const isCampaignsPage = state.activePage === "campaigns";
      elements.analyticsPage.classList.toggle("active", isAnalyticsPage);
      elements.gigsPage.classList.toggle("active", isGigsPage);
      elements.linksPage.classList.toggle("active", isLinksPage);
      elements.mailingListPage.classList.toggle("active", isMailingListPage);
      elements.campaignsPage.classList.toggle("active", isCampaignsPage);

      elements.pageTabs.forEach((link) => {
        const isAnalyticsTab = link.dataset.page === "analytics";
        const isActive = isAnalyticsTab
          ? isAnalyticsPage && link.dataset.collection === state.currentCollection
          : link.dataset.page === state.activePage;
        link.classList.toggle("active", isActive);
      });

      if (isAnalyticsPage) {
        const visibleCount = state.viewMode === "sessions" ? state.sessionGroups.length : state.filteredLogs.length;
        elements.collectionNote.textContent = state.viewMode === "sessions"
          ? `Viewing ${getActiveEntries().length} event${getActiveEntries().length === 1 ? "" : "s"} across ${visibleCount} session${visibleCount === 1 ? "" : "s"} from ${state.currentCollection}.`
          : `Viewing ${visibleCount} result${visibleCount === 1 ? "" : "s"} from ${state.currentCollection}.`;
      } else if (isGigsPage) {
        elements.collectionNote.textContent = state.isLoadingGigs
          ? "Loading gigs from Firestore..."
          : `Managing ${state.gigs.length} gig${state.gigs.length === 1 ? "" : "s"} in the gigs collection.`;
      } else if (isLinksPage) {
        elements.collectionNote.textContent = state.isLoadingLinks
          ? "Loading links from Firestore..."
          : `Managing ${state.links.length} link${state.links.length === 1 ? "" : "s"} in the links collection.`;
      } else if (isMailingListPage) {
        elements.collectionNote.textContent = state.isLoadingMailingList
          ? "Loading mailing list signups from Firestore..."
          : `Managing ${state.mailingListSignups.length} signup${state.mailingListSignups.length === 1 ? "" : "s"} in the mailing-list-signups collection.`;
      } else {
        const destinationCount = getCampaignDestinations().length;
        elements.collectionNote.textContent = state.isLoadingCampaign
          ? "Loading campaign settings from Firestore..."
          : state.campaign?.title
            ? `Managing /smartlink/${state.campaign.slug || "campaign"} with ${destinationCount} destination${destinationCount === 1 ? "" : "s"}.`
            : `No campaign selected. ${state.campaigns.length} saved campaign${state.campaigns.length === 1 ? "" : "s"} available.`;
      }

      elements.heroCollection.textContent = `Collection: ${getActiveCollectionLabel()}`;
      if (isAnalyticsPage && !elements.cacheStatus.textContent.trim()) {
        setAnalyticsCacheStatus();
      } else {
        setAnalyticsCacheStatus(elements.cacheStatus.textContent);
      }
      syncRefreshButton();
      syncGigSettingsPanel();
      syncCampaignSettingsPanel();
    }

    function isMobileNavViewport() {
      return window.innerWidth <= 768;
    }

    function syncMobileNav() {
      if (!elements.dashboard || !elements.mobileNavToggle) {
        return;
      }

      const shouldShowOpenState = state.isMobileNavOpen
        && isMobileNavViewport()
        && elements.dashboard.style.display === "grid";

      elements.dashboard.classList.toggle("is-mobile-nav-open", shouldShowOpenState);
      elements.mobileNavToggle.setAttribute("aria-expanded", shouldShowOpenState ? "true" : "false");
      elements.mobileNavToggle.setAttribute("aria-label", shouldShowOpenState ? "Close dashboard menu" : "Open dashboard menu");

      if (elements.dashboardRail) {
        const shouldHideRail = isMobileNavViewport() && !shouldShowOpenState;
        elements.dashboardRail.setAttribute("aria-hidden", shouldHideRail ? "true" : "false");
      }
    }

    function closeMobileNav() {
      if (!state.isMobileNavOpen) {
        syncMobileNav();
        return;
      }

      state.isMobileNavOpen = false;
      syncMobileNav();
    }

    function toggleMobileNav() {
      if (!isMobileNavViewport() || elements.dashboard.style.display !== "grid") {
        return;
      }

      state.isMobileNavOpen = !state.isMobileNavOpen;
      syncMobileNav();
    }

    function syncRefreshButton() {
      if (!elements.refreshButton) {
        return;
      }

      syncResetAnalyticsCacheButton();

      if (state.activePage === "gigs") {
        elements.refreshButton.disabled = state.isLoadingGigs;
        elements.refreshButton.textContent = state.isLoadingGigs ? "Refreshing..." : "Refresh";
        return;
      }

      if (state.activePage === "links") {
        elements.refreshButton.disabled = state.isLoadingLinks;
        elements.refreshButton.textContent =  state.isLoadingLinks ? "Refreshing..." : "Refresh";
        return;
      }

      if (state.activePage === "campaigns") {
        elements.refreshButton.disabled = state.isLoadingCampaign;
        elements.refreshButton.textContent = state.isLoadingCampaign ? "Refreshing..." : "Refresh";
        return;
      }

      if (state.activePage === "mailing-list") {
        elements.refreshButton.disabled = state.isLoadingMailingList;
        elements.refreshButton.textContent = state.isLoadingMailingList ? "Refreshing..." : "Refresh";
        return;
      }

      elements.refreshButton.disabled = state.isRefreshing;
      elements.refreshButton.textContent = state.isRefreshing ? "Refreshing..." : "Refresh";
    }

    function closeDeleteDialog() {
      if (elements.deleteDialog.open) {
        elements.deleteDialog.close();
      }
    }

    function openCacheResetDialog() {
      if (state.activePage !== "analytics" || state.isRefreshing || !elements.cacheResetDialog) {
        return;
      }

      if (!elements.cacheResetDialog.open) {
        elements.cacheResetDialog.showModal();
      }
    }

    function closeCacheResetDialog() {
      if (elements.cacheResetDialog?.open) {
        elements.cacheResetDialog.close();
      }
    }

    async function confirmCacheReset() {
      if (state.activePage !== "analytics" || state.isRefreshing) {
        closeCacheResetDialog();
        return;
      }

      syncResetAnalyticsCacheButton(true);
      closeCacheResetDialog();
      setAnalyticsCacheStatus("Analytics cache: clearing local copy...");

      try {
        await clearCachedLogs(state.currentCollection);
        state.allLogs = [];
        state.filteredLogs = [];
        state.sessionGroups = [];
        state.dynamicFields = [];
        state.page = 1;
        updateHeroMeta("Refreshing...");
        await loadActivePageData({ forceSync: true });
      } catch (error) {
        console.error("Failed to clear cached analytics log:", error);
        setAnalyticsCacheStatus("Analytics cache: could not be cleared.");
        syncResetAnalyticsCacheButton(false);
      }
    }

    function openDeleteDialog(id) {
      if (!id || state.deletingIds.has(id)) {
        return;
      }

      state.pendingDeleteTarget = { type: "entry", id };
      state.refreshAfterDeleteClose = false;
      elements.deleteDialogError.textContent = "";

      const { eventLabel, timestamp } = getDeleteDialogCopy(state.pendingDeleteTarget);
      elements.deleteDialogEvent.textContent = eventLabel;
      elements.deleteDialogTimestamp.textContent = timestamp;
      syncDeleteDialogCopy();
      syncDeleteDialogState();

      if (!elements.deleteDialog.open) {
        elements.deleteDialog.showModal();
      }
    }

    function openDeleteGigDialog(id) {
      if (!id || state.deletingGigIds.has(id)) {
        return;
      }

      state.pendingDeleteTarget = { type: "gig", id };
      state.refreshAfterDeleteClose = false;
      elements.deleteDialogError.textContent = "";

      const { eventLabel, timestamp } = getDeleteDialogCopy(state.pendingDeleteTarget);
      elements.deleteDialogEvent.textContent = eventLabel;
      elements.deleteDialogTimestamp.textContent = timestamp;
      syncDeleteDialogCopy();
      syncDeleteDialogState();

      if (!elements.deleteDialog.open) {
        elements.deleteDialog.showModal();
      }
    }

    function openDeleteLinkDialog(id) {
      if (!id || state.deletingLinkIds.has(id)) {
        return;
      }

      state.pendingDeleteTarget = { type: "link", id };
      state.refreshAfterDeleteClose = false;
      elements.deleteDialogError.textContent = "";

      const { eventLabel, timestamp } = getDeleteDialogCopy(state.pendingDeleteTarget);
      elements.deleteDialogEvent.textContent = eventLabel;
      elements.deleteDialogTimestamp.textContent = timestamp;
      syncDeleteDialogCopy();
      syncDeleteDialogState();

      if (!elements.deleteDialog.open) {
        elements.deleteDialog.showModal();
      }
    }

    function openDeleteCampaignDialog() {
      if (!state.campaign?.title || state.isDeletingCampaign) {
        return;
      }

      state.pendingDeleteTarget = { type: "campaign", id: state.activeCampaignId || state.campaign.slug };
      state.refreshAfterDeleteClose = false;
      elements.deleteDialogError.textContent = "";

      const { eventLabel, timestamp } = getDeleteDialogCopy(state.pendingDeleteTarget);
      elements.deleteDialogEvent.textContent = eventLabel;
      elements.deleteDialogTimestamp.textContent = timestamp;
      syncDeleteDialogCopy();
      syncDeleteDialogState();

      if (!elements.deleteDialog.open) {
        elements.deleteDialog.showModal();
      }
    }

    async function confirmDeleteEntry() {
      const target = state.pendingDeleteTarget;
      if (!target || isDeleteTargetInProgress(target)) {
        return;
      }

      if (target.type === "gig") {
        state.deletingGigIds.add(target.id);
      } else if (target.type === "link") {
        state.deletingLinkIds.add(target.id);
      } else if (target.type === "campaign") {
        state.isDeletingCampaign = true;
      } else if (target.type === "session") {
        state.deletingSessions.add(target.sessionKey);
      } else {
        state.deletingIds.add(target.id);
      }
      elements.deleteDialogError.textContent = "";
      if (state.activePage === "gigs") {
        renderGigs();
      } else if (state.activePage === "links") {
        renderLinks();
      } else if (state.activePage === "campaigns") {
        syncCampaignFormState();
        renderCampaign();
      } else {
        renderTable();
      }
      syncDeleteDialogState();

      try {
        if (target.type === "gig") {
          await deleteDoc(doc(db, "gigs", target.id));
        } else if (target.type === "link") {
          await deleteDoc(doc(db, "links", target.id));
        } else if (target.type === "campaign") {
          await Promise.all([
            deleteDoc(doc(db, "campaigns", target.id)),
            deleteDoc(doc(db, "public-campaigns", target.id))
          ]);
        } else if (target.type === "session") {
          await Promise.all(target.ids.map((id) => deleteDoc(doc(db, state.currentCollection, id))));
          await deleteCachedLogEntries(state.currentCollection, target.ids);
        } else {
          await deleteDoc(doc(db, state.currentCollection, target.id));
          await deleteCachedLogEntries(state.currentCollection, [target.id]);
        }
        state.refreshAfterDeleteClose = true;
        closeDeleteDialog();
      } catch (error) {
        console.error("Failed to delete entry:", error);
        if (target.type === "gig") {
          state.deletingGigIds.delete(target.id);
        } else if (target.type === "link") {
          state.deletingLinkIds.delete(target.id);
        } else if (target.type === "campaign") {
          state.isDeletingCampaign = false;
        } else if (target.type === "session") {
          state.deletingSessions.delete(target.sessionKey);
        } else {
          state.deletingIds.delete(target.id);
        }
        if (state.activePage === "gigs") {
          renderGigs();
        } else if (state.activePage === "links") {
          renderLinks();
        } else if (state.activePage === "campaigns") {
          syncCampaignFormState();
          renderCampaign();
        } else {
          renderTable();
        }
        syncDeleteDialogState();
        elements.deleteDialogError.textContent = target.type === "gig"
          ? "Could not delete this gig. Check the console for details."
        : target.type === "link"
          ? "Could not delete this link. Check the console for details."
        : target.type === "campaign"
          ? "Could not delete this campaign. Check the console for details."
          : target.type === "session"
          ? "Could not delete this session. Check the console for details."
          : "Could not delete this entry. Check the console for details.";
      }
    }

    function getPaginationRange(totalPages) {
      if (totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, index) => index + 1);
      }

      const pages = new Set([1, totalPages, state.page - 1, state.page, state.page + 1]);
      return [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
    }

    function createPageItem(label, page, { active = false, disabled = false } = {}) {
      const item = document.createElement("li");
      item.className = `page-item${active ? " active" : ""}${disabled ? " disabled" : ""}`;

      const link = document.createElement("a");
      link.className = "page-link";
      link.href = "#";
      link.textContent = label;
      link.addEventListener("click", (event) => {
        event.preventDefault();
        if (disabled || active) {
          return;
        }
        state.page = page;
        renderTable();
        renderPagination();
      });

      item.appendChild(link);
      return item;
    }

    function renderPagination() {
      const totalResults = state.viewMode === "sessions" ? state.sessionGroups.length : state.filteredLogs.length;
      const totalPages = Math.max(1, Math.ceil(totalResults / state.pageSize));
      state.page = Math.min(state.page, totalPages);

      const start = totalResults === 0 ? 0 : (state.page - 1) * state.pageSize + 1;
      const end = Math.min(state.page * state.pageSize, totalResults);
      const itemLabel = state.viewMode === "sessions" ? "session" : "result";
      elements.paginationMeta.textContent = `Showing ${start}-${end} of ${totalResults} ${itemLabel}${totalResults === 1 ? "" : "s"}`;
      elements.pagination.innerHTML = "";

      elements.pagination.appendChild(createPageItem("Prev", state.page - 1, { disabled: state.page === 1 }));

      const range = getPaginationRange(totalPages);
      let previousPage = 0;
      range.forEach((page) => {
        if (previousPage && page - previousPage > 1) {
          const ellipsis = document.createElement("li");
          ellipsis.className = "page-item disabled";
          ellipsis.innerHTML = `<span class="page-link">...</span>`;
          elements.pagination.appendChild(ellipsis);
        }

        elements.pagination.appendChild(createPageItem(String(page), page, { active: page === state.page }));
        previousPage = page;
      });

      elements.pagination.appendChild(createPageItem("Next", state.page + 1, { disabled: state.page === totalPages || totalResults === 0 }));
    }

    function downloadCsv() {
      if (!state.filteredLogs.length || !state.dynamicFields.length) {
        return;
      }

      const headers = state.dynamicFields;
      const rows = state.filteredLogs.map((entry) =>
        headers.map((field) => {
          const { text } = formatValue(entry[field], field);
          return `"${String(text).replace(/"/g, "\"\"")}"`;
        }).join(",")
      );

      const csv = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const timestamp = new Date().toISOString().slice(0, 10);
      anchor.href = url;
      anchor.download = `${state.currentCollection}-${timestamp}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    }

    function applyFilters() {
      const needle = state.searchTerm.trim().toLowerCase();
      const fromDate = state.dateFrom ? new Date(`${state.dateFrom}T00:00:00`) : null;
      const toDate = state.dateTo ? new Date(`${state.dateTo}T23:59:59.999`) : null;

      state.filteredLogs = state.allLogs.filter((entry) => {
        const matchesSearch = needle ? serializeLog(entry).includes(needle) : true;
        const eventDate = getDateForFilter(entry.timestamp);
        const matchesFrom = fromDate ? (eventDate ? eventDate >= fromDate : false) : true;
        const matchesTo = toDate ? (eventDate ? eventDate <= toDate : false) : true;

        return matchesSearch && matchesFrom && matchesTo;
      });

      state.sessionGroups = getSessionGroups(state.filteredLogs);
      state.expandedSessions = new Set();
      state.page = 1;
      syncViewModeButtons();
      renderStats();
      renderSummary();
      renderTable();
      renderPagination();
    }

    async function loadLogs(collectionName, { forceSync = false } = {}) {
      state.isRefreshing = true;
      syncRefreshButton();
      elements.tableHead.innerHTML = "";
      elements.tableBody.innerHTML = `<tr><td><div class="empty-state">Loading ${collectionName}...</div></td></tr>`;
      updateHeroMeta("Loading...");
      setAnalyticsCacheStatus("Analytics cache: checking browser storage...");

      try {
        const cachedBundle = await readCachedLogs(collectionName);
        const cachedEntries = Array.isArray(cachedBundle.entries) ? cachedBundle.entries : [];
        const cachedLatestTimestamp = cachedBundle.latestTimestamp || getLatestLogTimestamp(cachedEntries);

        if (cachedEntries.length) {
          state.allLogs = sortLogs(cachedEntries);
          state.dynamicFields = getOrderedFields(state.allLogs);
          updateHeroMeta(cachedBundle.syncedAt ? `Cached - ${formatTimestamp(cachedBundle.syncedAt) || "recently"}` : "Cached");
          applyFilters();
          setAnalyticsCacheStatus(`Analytics cache: ${state.allLogs.length} event${state.allLogs.length === 1 ? "" : "s"} loaded from IndexedDB.`);

          if (!forceSync) {
            return;
          }

          setAnalyticsCacheStatus(`Analytics cache: ${state.allLogs.length} cached event${state.allLogs.length === 1 ? "" : "s"} found. Checking Firestore for newer events...`);
        }

        if (cachedLatestTimestamp) {
          const snapshot = await getDocs(
            query(
              collection(db, collectionName),
              where("timestamp", ">=", cachedLatestTimestamp),
              orderBy("timestamp", "asc")
            )
          );

          const freshEntries = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          state.allLogs = mergeLogs(cachedEntries, freshEntries);
          await upsertCachedLogs(collectionName, freshEntries, new Date(), getLatestLogTimestamp(state.allLogs));
        } else {
          let snapshot;
          try {
            snapshot = await getDocs(query(collection(db, collectionName), orderBy("timestamp", "desc")));
          } catch (error) {
            console.warn(`Falling back to unordered load for ${collectionName}.`, error);
            snapshot = await getDocs(collection(db, collectionName));
          }

          state.allLogs = sortLogs(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
          await replaceCachedLogs(collectionName, state.allLogs, new Date());
        }

        state.dynamicFields = getOrderedFields(state.allLogs);
        updateHeroMeta(`Synced - ${new Date().toLocaleString()}`);
        applyFilters();
        setAnalyticsCacheStatus(`Analytics cache: ${state.allLogs.length} event${state.allLogs.length === 1 ? "" : "s"} stored locally.`);
      } catch (error) {
        console.error("Error loading logs:", error);
        if (state.allLogs.length) {
          updateHeroMeta("Showing cached data");
          setAnalyticsCacheStatus(`Analytics cache: showing ${state.allLogs.length} cached event${state.allLogs.length === 1 ? "" : "s"}.`);
        } else {
          state.allLogs = [];
          state.filteredLogs = [];
          state.sessionGroups = [];
          state.dynamicFields = [];
          updateHeroMeta("Load failed");
          setAnalyticsCacheStatus("Analytics cache: unavailable.");
          renderStats();
          renderSummary();
          renderTable();
          renderPagination();
          elements.tableBody.innerHTML = `
            <tr>
              <td>
                <div class="empty-state">Failed to load Firestore data. Check the browser console for details.</div>
              </td>
            </tr>
          `;
        }
      } finally {
        state.isRefreshing = false;
        syncRefreshButton();
      }
    }

    function showDashboard(user) {
      const shouldLoadData = elements.dashboard.style.display !== "grid" || state.authUser?.uid !== user.uid;
      state.authUser = user;
      state.isMobileNavOpen = false;
      closeGigSettingsPanel();
      closeCampaignSettingsPanel();
      document.body.classList.remove("auth-loading");
      elements.login.style.display = "none";
      elements.dashboard.style.display = "grid";
      elements.loginError.textContent = "";
      setAuthStatus(user);
      syncSignOutButton();
      syncGigFormState();
      syncLinkFormState();
      resetLinkFormDefaults();
      syncActivePageUI();
      syncMobileNav();

      if (shouldLoadData) {
        loadActivePageData({ forceSync: state.activePage === "analytics" });
      }
    }

    function hideDashboard(message = "") {
      state.authUser = null;
      state.isMobileNavOpen = false;
      closeGigSettingsPanel();
      closeCampaignSettingsPanel();
      document.body.classList.remove("auth-loading");
      elements.login.style.display = "block";
      elements.dashboard.style.display = "none";
      elements.loginError.textContent = message;
      elements.loginForm.reset();
      setAuthStatus(null);
      elements.heroCollection.textContent = "Collection: site-actions";
      elements.heroUpdated.textContent = "Waiting for sign-in";
      setAnalyticsCacheStatus("Analytics cache: not loaded yet.");
      syncSignOutButton();
      syncMobileNav();
    }

    function setActivePage(page) {
      closeMobileNav();

      if (page === "gigs") {
        state.activePage = "gigs";
        persistActivePage(state.activePage);
        syncActivePageUI();
        loadActivePageData();
        return;
      }

      if (page === "links") {
        state.activePage = "links";
        persistActivePage(state.activePage);
        syncActivePageUI();
        loadActivePageData();
        return;
      }

      if (page === "mailing-list") {
        state.activePage = "mailing-list";
        persistActivePage(state.activePage);
        syncActivePageUI();
        loadActivePageData();
        return;
      }

      if (page === "campaigns") {
        state.activePage = "campaigns";
        persistActivePage(state.activePage);
        syncActivePageUI();
        loadActivePageData();
        return;
      }

      state.activePage = "analytics";
      state.currentCollection = "site-actions";
      persistActivePage(state.activePage);
      closeGigSettingsPanel();
      syncActivePageUI();
      loadActivePageData({ forceSync: true });
    }

    function loadActivePageData(options = {}) {
      if (state.activePage === "gigs") {
        return loadGigs();
      }

      if (state.activePage === "links") {
        return loadLinks();
      }

      if (state.activePage === "mailing-list") {
        return loadMailingListSignups();
      }

      if (state.activePage === "campaigns") {
        return loadCampaign();
      }

      return loadLogs(state.currentCollection, options);
    }

    function setViewMode(mode) {
      if (!mode || mode === state.viewMode) {
        return;
      }

      state.viewMode = mode;
      if (mode === "sessions") {
        state.expandedSessions = new Set();
      }
      state.page = 1;
      syncViewModeButtons();
      renderStats();
      renderTable();
      renderPagination();
    }

    let hasInitializedAdmin = false;

    function initAdmin() {
      if (hasInitializedAdmin) {
        return;
      }

      hasInitializedAdmin = true;
      openAdminLogCache();
      state.activePage = getStoredActivePage();
      syncDeleteDialogState();
      syncDeleteDialogCopy();
      syncActivePageUI();
      syncMobileNav();
      syncRefreshButton();
      syncResetAnalyticsCacheButton();
      syncLoginButton();
      syncSignOutButton();
      syncViewModeButtons();
      syncGigFormState();
      syncGigEditState();
      syncLinkFormState();
      syncLinkEditState();
      syncCampaignFormState();
      syncCampaignSettingsPanel();
      resetLinkFormDefaults();
      setAuthStatus(null);
      elements.heroUpdated.textContent = "Checking authentication...";
      elements.campaignOpenLink.href = getCampaignPublicUrl();

      onAuthStateChanged(auth, (user) => {
        syncLoginButton(false);
        if (user) {
          if (!isAllowedAdminUser(user)) {
            signOut(auth).catch((error) => {
              console.error("Could not sign out unauthorized user:", error);
            });
            hideDashboard("This account is not authorised for the admin dashboard.");
            return;
          }
          showDashboard(user);
          return;
        }

        hideDashboard();
      });

      elements.detailsDialog.addEventListener("close", () => {
        state.activeDetailsId = null;
        elements.detailsDialogTitle.textContent = "Analytics Entry";
        elements.detailsDialogSubtitle.textContent = "Full event details";
        elements.detailsDialogGrid.innerHTML = "";
        elements.detailsDelete.disabled = false;
        elements.detailsDelete.textContent = "Delete Entry";
      });

      elements.gigEditDialog.addEventListener("close", () => {
        resetGigEditDialog();
      });

      elements.linkEditDialog.addEventListener("close", () => {
        resetLinkEditDialog();
      });

      elements.campaignAnalyticsDialog?.addEventListener("close", () => {
        state.activeCampaignAnalyticsId = "";
      });

      elements.campaignQrDialog?.addEventListener("close", () => {
        state.activeCampaignQrId = "";
        state.isGeneratingCampaignQr = false;
        setCampaignQrStatus("");
      });

      elements.detailsDelete.addEventListener("click", () => {
        openDeleteFromDetails();
      });

      elements.closeDetails.addEventListener("click", () => {
        closeDetailsDialog();
      });

      elements.closeCampaignAnalytics?.addEventListener("click", () => {
        closeCampaignAnalyticsDialog();
      });

      elements.closeCampaignQr?.addEventListener("click", () => {
        closeCampaignQrDialog();
      });

      elements.openCampaignQr?.addEventListener("click", () => {
        openCampaignQrDialog(state.activeCampaignId);
      });

      elements.openCampaignSettings?.addEventListener("click", () => {
        openCampaignSettingsPanel();
      });

      elements.openGigSettings?.addEventListener("click", () => {
        openGigSettingsPanel();
      });

      elements.closeCampaignSettings?.addEventListener("click", () => {
        closeCampaignSettingsPanel();
      });

      elements.closeGigSettings?.addEventListener("click", () => {
        closeGigSettingsPanel();
      });

      elements.campaignSettingsScrim?.addEventListener("click", () => {
        closeCampaignSettingsPanel();
      });

      elements.gigSettingsScrim?.addEventListener("click", () => {
        closeGigSettingsPanel();
      });

      elements.refreshCampaignAnalytics?.addEventListener("click", () => {
        loadCampaignAnalytics({ forceSync: true });
      });

      elements.copyCampaignQrUrl?.addEventListener("click", async () => {
        const qrCampaign = getCampaignById(state.activeCampaignQrId) || state.campaign;
        if (!qrCampaign) {
          return;
        }

        const publicUrl = getCampaignPublicUrl(qrCampaign);

        try {
          await navigator.clipboard.writeText(publicUrl);
          setCampaignQrStatus("Campaign URL copied.", "is-success");
        } catch (error) {
          console.error("Could not copy campaign URL:", error);
          setCampaignQrStatus("Could not copy URL. You can still copy it manually below.", "is-error");
        }
      });

      elements.closeGigEdit.addEventListener("click", () => {
        closeGigEditDialog();
      });

      elements.closeLinkEdit.addEventListener("click", () => {
        closeLinkEditDialog();
      });

      elements.gigDelete.addEventListener("click", () => {
        const gigId = state.activeGigId;
        if (!gigId) {
          return;
        }

        closeGigEditDialog();
        openDeleteGigDialog(gigId);
      });

      elements.linkDelete.addEventListener("click", () => {
        const linkId = state.activeLinkId;
        if (!linkId) {
          return;
        }

        closeLinkEditDialog();
        openDeleteLinkDialog(linkId);
      });

      elements.campaignDelete.addEventListener("click", () => {
        openDeleteCampaignDialog();
      });

      elements.deleteDialog.addEventListener("cancel", (event) => {
        if (isDeleteTargetInProgress(state.pendingDeleteTarget)) {
          event.preventDefault();
        }
      });

      elements.deleteDialog.addEventListener("close", () => {
        const shouldReload = state.refreshAfterDeleteClose;
        const pendingTarget = state.pendingDeleteTarget;

        if (pendingTarget?.type === "gig") {
          state.deletingGigIds.delete(pendingTarget.id);
        } else if (pendingTarget?.type === "link") {
          state.deletingLinkIds.delete(pendingTarget.id);
        } else if (pendingTarget?.type === "campaign") {
          state.isDeletingCampaign = false;
        } else if (pendingTarget?.type === "session") {
          state.deletingSessions.delete(pendingTarget.sessionKey);
        } else if (pendingTarget?.type === "entry") {
          state.deletingIds.delete(pendingTarget.id);
        }

        state.pendingDeleteTarget = null;
        state.refreshAfterDeleteClose = false;
        elements.deleteDialogError.textContent = "";
        syncDeleteDialogCopy();
        elements.deleteDialogEvent.textContent = "-";
        elements.deleteDialogTimestamp.textContent = "-";
        syncDeleteDialogState();

        if (shouldReload) {
          if (state.activePage === "gigs") {
            loadGigs();
          } else if (state.activePage === "links") {
            loadLinks();
          } else if (state.activePage === "mailing-list") {
            loadMailingListSignups();
          } else if (state.activePage === "campaigns") {
            loadCampaign();
          } else {
            loadLogs(state.currentCollection);
          }
        } else {
          if (state.activePage === "gigs") {
            renderGigs();
          } else if (state.activePage === "links") {
            renderLinks();
          } else if (state.activePage === "mailing-list") {
            renderMailingListSignups();
          } else if (state.activePage === "campaigns") {
            syncCampaignFormState();
            renderCampaign();
          } else {
            renderTable();
          }
        }
      });

      elements.cancelDelete.addEventListener("click", () => {
        closeDeleteDialog();
      });

      elements.confirmDelete.addEventListener("click", () => {
        confirmDeleteEntry();
      });

      elements.loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        elements.loginError.textContent = "";
        syncLoginButton(true);

        const email = elements.emailInput.value.trim();
        const password = elements.passwordInput.value;

        try {
          await signInWithEmailAndPassword(auth, email, password);
          elements.loginForm.reset();
        } catch (error) {
          console.error("Login failed:", error);
          elements.loginError.textContent = getLoginErrorMessage(error);
        } finally {
          syncLoginButton(false);
        }
      });

      elements.signOutButton.addEventListener("click", async () => {
        if (!state.authUser) {
          return;
        }

        syncSignOutButton(true);

        try {
          await signOut(auth);
        } catch (error) {
          console.error("Sign-out failed:", error);
          syncSignOutButton(false);
          setAuthStatus(state.authUser);
        }
      });

      elements.mobileNavToggle.addEventListener("click", () => {
        toggleMobileNav();
      });

      elements.mobileNavScrim.addEventListener("click", () => {
        closeMobileNav();
      });

      elements.gigForm.addEventListener("submit", saveGig);
      elements.linkForm.addEventListener("submit", saveLink);
      elements.campaignForm.addEventListener("submit", saveCampaign);
      elements.gigEditForm.addEventListener("submit", saveGigEdit);
      elements.linkEditForm.addEventListener("submit", saveLinkEdit);
      elements.seedLinks.addEventListener("click", () => {
        seedDefaultLinks();
      });
      elements.newCampaign?.addEventListener("click", () => {
        resetCampaignForm();
        openCampaignSettingsPanel();
      });

      elements.pageTabs.forEach((link) => {
        link.addEventListener("click", (event) => {
          event.preventDefault();
          const target = event.currentTarget;
          setActivePage(target.dataset.page);
        });
      });

      elements.viewModeButtons.forEach((button) => {
        button.addEventListener("click", () => {
          setViewMode(button.dataset.viewMode);
        });
      });

      elements.searchInput.addEventListener("input", (event) => {
        state.searchTerm = event.target.value;
        applyFilters();
      });

      elements.dateFrom.addEventListener("change", (event) => {
        state.dateFrom = event.target.value;
        applyFilters();
      });

      elements.dateTo.addEventListener("change", (event) => {
        state.dateTo = event.target.value;
        applyFilters();
      });

      elements.gigSortMode?.addEventListener("change", (event) => {
        state.gigSortMode = event.target.value || "upcoming-first";
        renderGigs();
      });

      elements.campaignTitle?.addEventListener("blur", () => {
        if (!elements.campaignSlug.value.trim()) {
          elements.campaignSlug.value = normalizeCampaignSlug("", elements.campaignTitle.value);
        }
      });

      elements.exportCsv.addEventListener("click", () => {
        downloadCsv();
      });

      elements.copyMailingListEmails?.addEventListener("click", () => {
        copyMailingListEmails();
      });

      elements.exportMailingListCsv?.addEventListener("click", () => {
        exportMailingListCsv();
      });

      elements.refreshButton.addEventListener("click", () => {
        if (state.activePage === "gigs") {
          loadGigs();
          return;
        }

        if (state.activePage === "links") {
          loadLinks();
          return;
        }

        if (state.activePage === "mailing-list") {
          loadMailingListSignups();
          return;
        }

        if (state.activePage === "campaigns") {
          loadCampaign();
          return;
        }

        loadActivePageData({ forceSync: true });
      });

      elements.resetAnalyticsCacheButton?.addEventListener("click", () => {
        openCacheResetDialog();
      });

      elements.cancelCacheReset?.addEventListener("click", () => {
        closeCacheResetDialog();
      });

      elements.confirmCacheReset?.addEventListener("click", () => {
        confirmCacheReset();
      });

      elements.pageSize.addEventListener("change", (event) => {
        state.pageSize = Number.parseInt(event.target.value, 10);
        state.page = 1;
        renderTable();
        renderPagination();
      });

      window.addEventListener("resize", () => {
        if (!isMobileNavViewport()) {
          state.isMobileNavOpen = false;
        }

        syncMobileNav();
        syncGigSettingsPanel();
        syncCampaignSettingsPanel();
      });

      window.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closeMobileNav();
          closeGigSettingsPanel();
          closeCampaignSettingsPanel();
        }
      });
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initAdmin, { once: true });
    } else {
      initAdmin();
    }

