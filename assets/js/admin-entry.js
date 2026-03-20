if (window.location.protocol === "file:") {
  const bootCard = document.getElementById("auth-boot");
  const authStatus = document.getElementById("auth-status");
  const heroUpdated = document.getElementById("hero-updated");

  document.body.classList.add("auth-loading");

  if (authStatus) {
    authStatus.textContent = "Local file mode";
  }

  if (heroUpdated) {
    heroUpdated.textContent = "Open through localhost";
  }

  if (bootCard) {
    bootCard.innerHTML = `
      <h2>Open Admin Through A Local Server</h2>
      <p>This admin now uses ES modules and Firebase imports, so it cannot run from <code>file://</code>.</p>
      <p>Open it with a local server instead, for example <code>python -m http.server 8080</code>, then visit <code>http://localhost:8080/admin.html</code>.</p>
    `;
  }
} else {
  const script = document.createElement("script");
  script.type = "module";
  script.src = "assets/js/admin.js";
  document.body.appendChild(script);
}
