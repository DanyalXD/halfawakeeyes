import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
    import { doc, getDoc, getFirestore, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

    const firebaseConfig = {
      apiKey: "AIzaSyAv7G28uXxlQNG_HMLbBkuz4xseXzOzm4Y",
      authDomain: "half-awake-eyes.firebaseapp.com",
      projectId: "half-awake-eyes"
    };

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    const isLocal =
      window.location.protocol === "file:" ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "";

    const params = new URLSearchParams(window.location.search);
    const userId = params.get("id") || "unknown";
    const source = params.get("source") || params.get("utm_source") || "";
    const medium = params.get("utm_medium") || "";
    const queryCampaign = params.get("campaign") || params.get("utm_campaign") || "";
    const pagePath = window.location.pathname || "/smartlink.html";
    const pageName = pagePath.split("/").pop() || "smartlink";
    const pageSessionKey = `hae-page-view:${pagePath}`;

    const elements = {
      campaignLayout: document.getElementById("campaign-layout"),
      campaignBadge: document.getElementById("campaign-badge"),
      campaignState: document.getElementById("campaign-state"),
      campaignTitle: document.getElementById("campaign-title"),
      campaignSubtitle: document.getElementById("campaign-subtitle"),
      campaignDescription: document.getElementById("campaign-description"),
      campaignDate: document.getElementById("campaign-date"),
      campaignDestinationCount: document.getElementById("campaign-destination-count"),
      primaryCta: document.getElementById("primary-cta"),
      secondaryCta: document.getElementById("secondary-cta"),
      platformPanel: document.getElementById("platform-panel"),
      platformGrid: document.getElementById("platform-grid"),
      campaignArtwork: document.getElementById("campaign-artwork"),
      artworkFallback: document.getElementById("artwork-fallback"),
      artCaptionTitle: document.getElementById("art-caption-title"),
      artCaptionNote: document.getElementById("art-caption-note"),
      emptyWrap: document.getElementById("empty-wrap"),
      emptyTitle: document.getElementById("empty-title"),
      emptyCopy: document.getElementById("empty-copy")
    };

    let activeCampaign = null;
    let activeMetaPixelId = "";
    let metaPageViewTracked = false;

    function getSessionId() {
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
    }

    const sessionId = getSessionId();

    function normalizeCampaignEntry(campaign = {}) {
      const normalizedMetaPixelId = String(campaign?.metaPixelId || "").replace(/\s+/g, "").trim();
      return {
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
        live: campaign?.live === true || String(campaign?.live || "").toLowerCase() === "true"
      };
    }

    function formatReleaseDate(value) {
      if (!value) {
        return "";
      }

      const parsed = new Date(`${value}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) {
        return value;
      }

      return parsed.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric"
      });
    }

    function getDestinations(campaign) {
      return [
        { label: campaign.primaryLabel || "Listen now", url: campaign.primaryUrl, kind: "cta" },
        { label: campaign.secondaryLabel || "Learn more", url: campaign.secondaryUrl, kind: "cta" },
        { label: "Spotify", url: campaign.spotifyUrl, kind: "platform" },
        { label: "Apple Music", url: campaign.appleMusicUrl, kind: "platform" },
        { label: "YouTube", url: campaign.youtubeUrl, kind: "platform" },
        { label: "Bandcamp", url: campaign.bandcampUrl, kind: "platform" }
      ].filter((entry) => entry.url);
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

    function trackMetaClick(eventName, details = {}) {
      if (!activeMetaPixelId || typeof window.fbq !== "function") {
        return;
      }

      window.fbq("trackCustom", eventName, {
        campaign_name: activeCampaign?.title || "",
        destination_label: details.label || "",
        destination_url: details.url || "",
        destination_type: details.type || "",
        page_name: pageName
      });
    }

    function buildEventPayload(action, details = {}) {
      return {
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
        section: "smartlink",
        outbound: details.outbound ?? false,
        campaign: queryCampaign || activeCampaign?.title || "",
        source,
        medium,
        referrer: document.referrer || "",
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        timestamp: new Date()
      };
    }

    async function logEvent(action, details = {}) {
      if (isLocal) {
        return;
      }

      try {
        const docId = `${userId}-${sessionId}-${Date.now()}-${action}`;
        await setDoc(doc(db, "site-actions", docId), buildEventPayload(action, details));
      } catch (error) {
        console.error("Logging error:", error);
      }
    }

    function setTrackedLink(element, label, url, variant = "link") {
      if (!url) {
        element.hidden = true;
        element.removeAttribute("href");
        element.removeAttribute("target");
        element.removeAttribute("rel");
        element.textContent = "";
        element.onclick = null;
        return;
      }

      element.hidden = false;
      element.href = url;
      element.target = "_blank";
      element.rel = "noopener noreferrer";
      element.textContent = label;
      element.onclick = () => {
        logEvent("click", {
          label,
          target: label,
          href: url,
          elementType: "link",
          actionSubtype: variant,
          section: "smartlink",
          outbound: true
        });
        trackMetaClick(variant === "primary_cta" ? "CampaignPrimaryClick" : "CampaignSecondaryClick", {
          label,
          url,
          type: variant
        });
      };
    }

    function applyArtwork(url) {
      if (!url) {
        elements.campaignArtwork.hidden = true;
        elements.campaignArtwork.removeAttribute("src");
        elements.artworkFallback.hidden = false;
        return;
      }

      elements.campaignArtwork.hidden = false;
      elements.campaignArtwork.src = url;
      elements.artworkFallback.hidden = true;
    }

    function showFallback(title, copy) {
      document.title = "Half Awake Eyes | Smart Link";
      elements.campaignLayout.hidden = true;
      elements.emptyWrap.classList.add("show");
      elements.emptyTitle.textContent = title;
      elements.emptyCopy.textContent = copy;
    }

    function renderCampaign(campaign) {
      activeCampaign = campaign;
      if (campaign.metaPixelId) {
        initializeMetaPixel(campaign.metaPixelId);
        trackMetaPageView();
      }

      const destinations = getDestinations(campaign);
      const platformLinks = destinations.filter((entry) => entry.kind === "platform");
      const releaseDate = formatReleaseDate(campaign.releaseDate);

      document.title = `${campaign.title} | Half Awake Eyes`;
      elements.campaignLayout.hidden = false;
      elements.emptyWrap.classList.remove("show");
      elements.campaignBadge.textContent = campaign.badge || "Smart Link";
      elements.campaignState.textContent = campaign.live ? "Live now" : "Draft";
      elements.campaignTitle.textContent = campaign.title;
      elements.campaignSubtitle.textContent = campaign.subtitle || "Official release page";
      elements.campaignDescription.textContent = campaign.description || "Choose a destination below to hear the latest Half Awake Eyes release.";
      elements.campaignDestinationCount.textContent = `${destinations.length} destination${destinations.length === 1 ? "" : "s"} available`;

      if (releaseDate) {
        elements.campaignDate.hidden = false;
        elements.campaignDate.textContent = `Release date: ${releaseDate}`;
      } else {
        elements.campaignDate.hidden = true;
        elements.campaignDate.textContent = "";
      }

      setTrackedLink(elements.primaryCta, campaign.primaryLabel || "Listen now", campaign.primaryUrl, "primary_cta");
      setTrackedLink(elements.secondaryCta, campaign.secondaryLabel || "Learn more", campaign.secondaryUrl, "secondary_cta");

      elements.platformGrid.innerHTML = "";
      if (platformLinks.length) {
        platformLinks.forEach((entry) => {
          const link = document.createElement("a");
          link.className = "platform-link";
          link.href = entry.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = entry.label;
          link.addEventListener("click", () => {
            logEvent("click", {
              label: entry.label,
              target: entry.label,
              href: entry.url,
              elementType: "link",
              actionSubtype: "platform_link",
              section: "smartlink",
              outbound: true
            });
            trackMetaClick("CampaignPlatformClick", {
              label: entry.label,
              url: entry.url,
              type: "platform_link"
            });
          });
          elements.platformGrid.appendChild(link);
        });
        elements.platformPanel.hidden = false;
      } else {
        elements.platformPanel.hidden = true;
      }

      applyArtwork(campaign.artworkUrl);
      elements.campaignArtwork.alt = campaign.title;
      elements.artCaptionTitle.textContent = campaign.title;
      elements.artCaptionNote.textContent = campaign.subtitle || "Official Half Awake Eyes release page";
    }

    async function logPageViewOnce() {
      try {
        if (!sessionStorage.getItem(pageSessionKey)) {
          sessionStorage.setItem(pageSessionKey, "1");
          await logEvent("page_view", {
            label: document.title,
            target: activeCampaign?.title || pageName,
            elementType: "page",
            actionSubtype: "campaign_page"
          });
        }
      } catch (error) {
        await logEvent("page_view", {
          label: document.title,
          target: activeCampaign?.title || pageName,
          elementType: "page",
          actionSubtype: "campaign_page"
        });
      }
    }

    elements.campaignArtwork.addEventListener("error", () => {
      elements.campaignArtwork.hidden = true;
      elements.artworkFallback.hidden = false;
    });

    try {
      const campaignSnapshot = await getDoc(doc(db, "campaigns", "active"));
      if (!campaignSnapshot.exists()) {
        showFallback("No live campaign yet", "This release page is not live right now. Check back soon, or use the main site links below.");
      } else {
        const campaign = normalizeCampaignEntry(campaignSnapshot.data());
        if (!campaign.title) {
          showFallback("Campaign incomplete", "A campaign exists, but it still needs a title before the page can go live.");
        } else if (!campaign.live) {
          showFallback("Campaign currently in draft", "The smart-link page has been configured in the admin panel, but it is not marked live yet.");
        } else {
          renderCampaign(campaign);
          await logPageViewOnce();
        }
      }
    } catch (error) {
      console.error("Error loading campaign:", error);
      showFallback("Campaign unavailable", "The release page could not load from Firestore right now. Please try again shortly.");
    }
