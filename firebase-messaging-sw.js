/* global firebase */

let firebaseMessagingReady = false;
const APP_SHELL_CACHE = "hae-admin-shell-v1";
const APP_SHELL_ASSETS = [
  "admin.html",
  "manifest.webmanifest",
  "assets/images/logo.jpg",
  "assets/images/favicon.ico"
];

function showEmailNotification(payload = {}) {
  const title = payload.notification?.title || "New email";
  const options = {
    body: payload.notification?.body || payload.data?.preview || "A new mailbox message arrived.",
    icon: "assets/images/logo.jpg",
    tag: "hae-admin-email",
    renotify: true,
    data: {
      url: "admin.html",
      ...(payload.data || {})
    }
  };

  self.registration.showNotification(title, options);
}

try {
  importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

  firebase.initializeApp({
    apiKey: "AIzaSyAv7G28uXxlQNG_HMLbBkuz4xseXzOzm4Y",
    authDomain: "half-awake-eyes.firebaseapp.com",
    projectId: "half-awake-eyes",
    messagingSenderId: "1002821452473",
    appId: "1:1002821452473:web:afe7131dd9b1b7f5715168"
  });

  firebase.messaging().onBackgroundMessage(showEmailNotification);
  firebaseMessagingReady = true;
} catch (error) {
  console.warn("Firebase Messaging service worker setup failed.", error);
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_SHELL_CACHE);
    await cache.addAll(APP_SHELL_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((cacheName) => cacheName.startsWith("hae-admin-shell-") && cacheName !== APP_SHELL_CACHE)
        .map((cacheName) => caches.delete(cacheName))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") {
    return;
  }

  event.respondWith((async () => {
    try {
      return await fetch(event.request);
    } catch (error) {
      const cache = await caches.open(APP_SHELL_CACHE);
      return await cache.match("admin.html");
    }
  })());
});

self.addEventListener("push", (event) => {
  if (firebaseMessagingReady) {
    return;
  }

  if (!event.data) {
    return;
  }

  let payload = {};

  try {
    payload = event.data.json();
  } catch (error) {
    payload = {
      notification: {
        title: "New email",
        body: event.data.text()
      }
    };
  }

  event.waitUntil(showEmailNotification(payload));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(event.notification.data?.url || "admin.html", self.registration.scope).href;

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existingClient = clientList.find((client) => client.url.includes("/admin.html"));

    if (existingClient) {
      await existingClient.focus();
      return;
    }

    await self.clients.openWindow(targetUrl);
  })());
});
