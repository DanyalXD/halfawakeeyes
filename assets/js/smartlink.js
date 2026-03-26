    import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
    import { doc, getDoc, getFirestore, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
    import {
      createEmailSignupService,
      createSiteAnalytics,
      firebaseConfig,
      getTrackingParams,
      isValidEmailAddress,
      normalizeTrackingValue
    } from "./public-site-utils.js";

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    const isFileMode =
      window.location.protocol === "file:" ||
      window.location.hostname === "";

    const params = new URLSearchParams(window.location.search);
    const { userId, source, medium, campaign: queryCampaign } = getTrackingParams(params);
    const pagePath = window.location.pathname || "/smartlink.html";
    const pageName = pagePath.split("/").pop() || "smartlink";
    const metaDescription = document.querySelector('meta[name="description"]');

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
      emailSignupForm: document.getElementById("email-signup-form"),
      emailSignupInput: document.getElementById("email-signup-input"),
      emailSignupSubmit: document.getElementById("email-signup-submit"),
      emailSignupStatus: document.getElementById("email-signup-status"),
      emptyWrap: document.getElementById("empty-wrap"),
      emptyTitle: document.getElementById("empty-title"),
      emptyCopy: document.getElementById("empty-copy"),
      retryCampaignLoad: document.getElementById("retry-campaign-load")
    };

    let activeCampaign = null;
    let activeMetaPixelId = "";
    let metaPageViewTracked = false;

    function getRequestedCampaignSlug() {
      if (queryCampaign) {
        return queryCampaign.trim();
      }

      const match = window.location.pathname.match(/\/smartlink\/([^/?#]+)\/?$/i);
      return match ? decodeURIComponent(match[1]).trim() : "";
    }

    const requestedCampaignSlug = getRequestedCampaignSlug();

    function normalizeCampaignDestinationUrl(value) {
      const normalizedValue = String(value || "").trim();
      if (!normalizedValue || /^(javascript|data):/i.test(normalizedValue)) {
        return "";
      }

      try {
        const parsed = new URL(normalizedValue, window.location.href);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          return parsed.href;
        }
      } catch (error) {
        return "";
      }

      return "";
    }

    function updatePageMetadata(title, description) {
      document.title = title;
      if (metaDescription) {
        metaDescription.setAttribute("content", description);
      }
    }

    const { logEvent, logPageViewOnce: logTrackedPageViewOnce } = createSiteAnalytics({
      db,
      doc,
      setDoc,
      pagePath,
      pageName,
      isDisabled: isFileMode,
      getContext: () => ({
        userId,
        campaign: activeCampaign?.title || queryCampaign,
        campaignSlug: activeCampaign?.slug || requestedCampaignSlug,
        source,
        medium,
        section: "smartlink"
      })
    });
    const { submitEmailSignup } = createEmailSignupService({
      db,
      doc,
      setDoc,
      getContext: () => ({
        pageName,
        pagePath,
        campaign: activeCampaign?.title || queryCampaign,
        campaignSlug: activeCampaign?.slug || requestedCampaignSlug,
        source,
        medium
      })
    });

    function setEmailSignupStatus(message, tone = "") {
      if (!elements.emailSignupStatus) {
        return;
      }

      elements.emailSignupStatus.textContent = message;
      elements.emailSignupStatus.classList.remove("is-error", "is-success");
      if (tone) {
        elements.emailSignupStatus.classList.add(tone);
      }
    }

    function normalizeCampaignEntry(campaign = {}) {
      const normalizedMetaPixelId = String(campaign?.metaPixelId || "").replace(/\s+/g, "").trim();
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
        primaryUrl: normalizeCampaignDestinationUrl(campaign?.primaryUrl),
        secondaryLabel: String(campaign?.secondaryLabel || "").trim(),
        secondaryUrl: normalizeCampaignDestinationUrl(campaign?.secondaryUrl),
        spotifyUrl: normalizeCampaignDestinationUrl(campaign?.spotifyUrl),
        appleMusicUrl: normalizeCampaignDestinationUrl(campaign?.appleMusicUrl),
        youtubeUrl: normalizeCampaignDestinationUrl(campaign?.youtubeUrl),
        bandcampUrl: normalizeCampaignDestinationUrl(campaign?.bandcampUrl),
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

    function getPlatformKey(label = "") {
      return String(label || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    }

    function getPlatformActionLabel(label = "") {
      const normalized = getPlatformKey(label);
      if (normalized === "youtube") {
        return "Watch";
      }

      if (normalized === "bandcamp") {
        return "Open";
      }

      return "Play";
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

    function setRetryVisibility(isVisible) {
      if (!elements.retryCampaignLoad) {
        return;
      }

      elements.retryCampaignLoad.hidden = !isVisible;
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

    function showFallback(title, copy, { allowRetry = false } = {}) {
      activeCampaign = null;
      updatePageMetadata("Half Awake Eyes | Smart Link", copy);
      elements.campaignLayout.hidden = true;
      elements.emptyWrap.classList.add("show");
      elements.emptyTitle.textContent = title;
      elements.emptyCopy.textContent = copy;
      elements.platformGrid.innerHTML = "";
      elements.platformPanel.hidden = true;
      setTrackedLink(elements.primaryCta, "", "", "primary_cta");
      setTrackedLink(elements.secondaryCta, "", "", "secondary_cta");
      setRetryVisibility(allowRetry);
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

      updatePageMetadata(
        `${campaign.title} | Half Awake Eyes`,
        campaign.description || `Listen to ${campaign.title} by Half Awake Eyes across all available platforms.`
      );
      elements.campaignLayout.hidden = false;
      elements.emptyWrap.classList.remove("show");
      setRetryVisibility(false);
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
          link.dataset.platform = getPlatformKey(entry.label);
          link.href = entry.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          const platformCopy = document.createElement("span");
          platformCopy.className = "platform-copy";

          const platformEyebrow = document.createElement("span");
          platformEyebrow.className = "platform-eyebrow";
          platformEyebrow.textContent = "Listen on";

          const platformLabel = document.createElement("span");
          platformLabel.className = "platform-label";
          platformLabel.textContent = entry.label;

          platformCopy.append(platformEyebrow, platformLabel);

          const actionChip = document.createElement("span");
          actionChip.className = "platform-action";
          actionChip.textContent = getPlatformActionLabel(entry.label);

          link.append(platformCopy, actionChip);
          link.addEventListener("click", () => {
            logEvent("click", {
              label: entry.label,
              target: entry.label,
              href: entry.url,
              elementType: "link",
              actionSubtype: "platform_link",
              platform: getPlatformKey(entry.label),
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

    function getCampaignPageViewKey() {
      const campaignId = [activeCampaign?.slug || requestedCampaignSlug || queryCampaign || "default", activeCampaign?.releaseDate || ""]
        .filter(Boolean)
        .join(":");
      return `${pagePath}:campaign:${campaignId || "default"}`;
    }

    async function logPageViewOnce() {
      const storageKey = getCampaignPageViewKey();
      await logPageViewOnceFromAnalytics(storageKey);
    }

    async function logPageViewOnceFromAnalytics(storageKey) {
      await logTrackedPageViewOnce({
        label: document.title,
        target: activeCampaign?.title || pageName,
        elementType: "page",
        actionSubtype: "campaign_page"
      }, storageKey);
    }

    function attachEmailSignup() {
      if (!elements.emailSignupForm || !elements.emailSignupInput || !elements.emailSignupSubmit) {
        return;
      }

      elements.emailSignupForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const email = elements.emailSignupInput.value.trim();

        if (!isValidEmailAddress(email)) {
          setEmailSignupStatus("Enter a valid email address.", "is-error");
          return;
        }

        elements.emailSignupSubmit.disabled = true;
        setEmailSignupStatus("Joining mailing list...");

        try {
          await submitEmailSignup(email, {
            label: activeCampaign?.title ? `${activeCampaign.title} signup` : "Smart link signup"
          });
          await logEvent("email_signup", {
            target: "mailing-list",
            label: activeCampaign?.title || "Smart link signup",
            elementType: "form",
            actionSubtype: "email_signup",
            section: "smartlink"
          });
          setEmailSignupStatus("Thanks, you’re on the list.", "is-success");
          elements.emailSignupForm.reset();
        } catch (error) {
          console.error("Email signup failed:", error);
          setEmailSignupStatus(error?.message || "Could not save your signup right now.", "is-error");
        } finally {
          elements.emailSignupSubmit.disabled = false;
        }
      });
    }

    function getCampaignLoadFailureState(error) {
      if (isFileMode) {
        return {
          title: "Open Smart Link Through A Local Server",
          copy: "This page needs to be opened through localhost rather than file:// so it can reach Firebase and Firestore.",
          allowRetry: false
        };
      }

      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return {
          title: "You Appear To Be Offline",
          copy: "The smart-link page could not reach Firestore because this device is offline right now. Reconnect and try again.",
          allowRetry: true
        };
      }

      if (error?.code === "permission-denied") {
        return {
          title: "Campaign Access Blocked",
          copy: `The public smart-link page cannot read public-campaigns/${requestedCampaignSlug || "active"} from Firestore. If this page should be public, update your Firestore rules to allow read access for that document.`,
          allowRetry: false
        };
      }

      if (error?.code === "unavailable") {
        return {
          title: "Campaign Temporarily Unavailable",
          copy: "Firestore could not be reached right now. Try again in a moment.",
          allowRetry: true
        };
      }

      return {
        title: "Campaign Unavailable",
        copy: "The release page could not load from Firestore right now. Please try again shortly.",
        allowRetry: true
      };
    }

    elements.campaignArtwork.addEventListener("error", () => {
      elements.campaignArtwork.hidden = true;
      elements.artworkFallback.hidden = false;
    });

    async function loadActiveCampaign() {
      if (isFileMode) {
        showFallback("Open Smart Link Through A Local Server", "This page needs to be opened through localhost rather than file:// so it can reach Firebase and Firestore.");
        return;
      }

      try {
        const campaignId = requestedCampaignSlug;
        if (!campaignId) {
          showFallback("Campaign not specified", "Open a specific release slug such as /smartlink/your-release-name to view a live campaign.");
          return;
        }

        const campaignSnapshot = await getDoc(doc(db, "public-campaigns", campaignId));
        if (!campaignSnapshot.exists()) {
          showFallback(
            "Campaign not found",
            "That release page could not be found. Check the campaign URL or use the main site links below."
          );
        } else {
          const campaign = normalizeCampaignEntry({ ...campaignSnapshot.data(), slug: campaignId });
          const destinations = getDestinations(campaign);
          if (!campaign.title) {
            showFallback("Campaign incomplete", "A campaign exists, but it still needs a title before the page can go live.");
          } else if (!campaign.live) {
            showFallback("Campaign currently in draft", "The smart-link page has been configured in the admin panel, but it is not marked live yet.");
          } else if (!destinations.length) {
            showFallback("Campaign incomplete", "This smart-link campaign is live, but it does not have any valid destination URLs yet.");
          } else {
            renderCampaign(campaign);
            await logPageViewOnce();
          }
        }
      } catch (error) {
        console.error("Error loading campaign:", error);
        const failureState = getCampaignLoadFailureState(error);
        showFallback(failureState.title, failureState.copy, { allowRetry: failureState.allowRetry });
      }
    }

    if (elements.retryCampaignLoad) {
      elements.retryCampaignLoad.addEventListener("click", () => {
        loadActiveCampaign();
      });
    }

    attachEmailSignup();

    await loadActiveCampaign();
