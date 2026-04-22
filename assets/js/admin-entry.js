function isLocalAdminHost() {
  return (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === ""
  );
}

function renderAdminBootFallback() {
  if (window.HAEAdminComponents?.renderFileModeFallback) {
    window.HAEAdminComponents.renderFileModeFallback();
    return;
  }

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

function setHeroBootMeta(authStatusText, updatedText) {
  const authStatus = document.getElementById("auth-status");
  const heroUpdated = document.getElementById("hero-updated");

  if (authStatus) {
    authStatus.textContent = authStatusText;
  }

  if (heroUpdated) {
    heroUpdated.textContent = updatedText;
  }
}

function setBootCardMessage(title, paragraphs, detailText = "") {
  const bootCard = document.getElementById("auth-boot");

  if (!bootCard) {
    return;
  }

  bootCard.innerHTML = "";

  const heading = document.createElement("h2");
  heading.textContent = title;
  bootCard.appendChild(heading);

  paragraphs.forEach((paragraph) => {
    const element = document.createElement("p");
    element.innerHTML = paragraph;
    bootCard.appendChild(element);
  });

  if (detailText) {
    const detail = document.createElement("p");
    detail.textContent = detailText;
    bootCard.appendChild(detail);
  }
}

function showLocalFileModeMessage() {
  document.body.classList.add("auth-loading");
  renderAdminBootFallback();
  setHeroBootMeta("Local file mode", "Open through localhost");
  setBootCardMessage("Open Admin Through A Local Server", [
    "This admin now uses ES modules, Firebase imports, and HTML components, so it cannot run from <code>file://</code>.",
    "Open it with a local server instead, for example <code>python -m http.server 8080</code>, then visit <code>http://localhost:8080/admin.html</code>."
  ]);
}

function showComponentLoadError(error) {
  console.error("Could not load admin components:", error);
  document.body.classList.add("auth-loading");
  renderAdminBootFallback();
  setHeroBootMeta("Component load failed", "Check component files");
  setBootCardMessage("Could Not Load Admin", [
    "The admin component files could not be loaded.",
    "Check that the site is being served from the project root and that the files in <code>assets/components/admin/</code> are available."
  ], error?.message || "");
}

function loadAdminScript(version) {
  const script = document.createElement("script");
  script.type = "module";
  script.src = `assets/js/admin.js?v=${encodeURIComponent(version)}`;
  document.body.appendChild(script);
}

async function bootAdmin() {
  if (window.location.protocol === "file:") {
    showLocalFileModeMessage();
    return;
  }

  const assetVersion = isLocalAdminHost() ? String(Date.now()) : "20260422-components";

  if (!window.HAEAdminComponents?.load) {
    showComponentLoadError(new Error("Admin component loader is unavailable."));
    return;
  }

  try {
    await window.HAEAdminComponents.load({ version: assetVersion });
    loadAdminScript(assetVersion);
  } catch (error) {
    showComponentLoadError(error);
  }
}

bootAdmin();
