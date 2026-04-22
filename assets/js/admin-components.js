(() => {
  const COMPONENT_ATTRIBUTE = "data-admin-component";
  const COMPONENTS = [
    { name: "hero", path: "assets/components/admin/hero.html" },
    { name: "auth", path: "assets/components/admin/auth.html" },
    { name: "dashboard-navigation", path: "assets/components/admin/dashboard-navigation.html" },
    { name: "dashboard-topbar", path: "assets/components/admin/dashboard-topbar.html" },
    { name: "analytics-page", path: "assets/components/admin/pages/analytics.html" },
    { name: "gigs-page", path: "assets/components/admin/pages/gigs.html" },
    { name: "links-page", path: "assets/components/admin/pages/links.html" },
    { name: "mailing-list-page", path: "assets/components/admin/pages/mailing-list.html" },
    { name: "campaigns-page", path: "assets/components/admin/pages/campaigns.html" },
    { name: "delete-dialog", path: "assets/components/admin/dialogs/delete.html" },
    { name: "cache-reset-dialog", path: "assets/components/admin/dialogs/cache-reset.html" },
    { name: "campaign-analytics-dialog", path: "assets/components/admin/dialogs/campaign-analytics.html" },
    { name: "campaign-qr-dialog", path: "assets/components/admin/dialogs/campaign-qr.html" },
    { name: "details-dialog", path: "assets/components/admin/dialogs/details.html" },
    { name: "gig-edit-dialog", path: "assets/components/admin/dialogs/gig-edit.html" },
    { name: "link-edit-dialog", path: "assets/components/admin/dialogs/link-edit.html" }
  ];

  let loadPromise = null;

  function isLocalDev() {
    return (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === ""
    );
  }

  function withVersion(path, version) {
    if (!version) {
      return path;
    }

    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}v=${encodeURIComponent(version)}`;
  }

  async function fetchComponent(component, version) {
    const response = await fetch(withVersion(component.path, version), {
      cache: isLocalDev() ? "no-store" : "default"
    });

    if (!response.ok) {
      throw new Error(`Could not load ${component.path} (${response.status})`);
    }

    return {
      name: component.name,
      html: await response.text()
    };
  }

  async function loadAdminComponents(options = {}) {
    if (loadPromise) {
      return loadPromise;
    }

    const version = options.version || "";

    loadPromise = Promise.all(COMPONENTS.map((component) => fetchComponent(component, version)))
      .then((loadedComponents) => {
        loadedComponents.forEach(({ name, html }) => {
          const target = document.querySelector(`[${COMPONENT_ATTRIBUTE}="${name}"]`);

          if (!target) {
            throw new Error(`Missing admin component target: ${name}`);
          }

          target.outerHTML = html.trim();
        });
      })
      .catch((error) => {
        loadPromise = null;
        throw error;
      });

    return loadPromise;
  }

  function renderFileModeFallback() {
    const shell = document.querySelector(".shell");

    if (!shell) {
      return;
    }

    shell.innerHTML = `
      <header class="hero">
        <div>
          <span class="eyebrow">Private Dashboard</span>
          <h1>Admin</h1>
          <p>Track site activity and manage the public gigs and links pages from one place.</p>
        </div>
        <div class="hero-meta">
          <div id="auth-status">Signed out.</div>
          <div id="hero-collection">Collection: site-actions</div>
          <div id="hero-updated">Waiting for login</div>
        </div>
      </header>

      <section id="auth-boot" class="surface login-card auth-boot-card">
        <h2>Loading Admin</h2>
        <p>Checking your sign-in session...</p>
      </section>
    `;
  }

  window.HAEAdminComponents = {
    load: loadAdminComponents,
    renderFileModeFallback
  };
})();
