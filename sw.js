// VERSION 26 - No caching, always fresh
const VERSION = "v26"

self.addEventListener("install", e => {
  console.log("SW", VERSION, "installed")
  self.skipWaiting()
})

self.addEventListener("activate", e => {
  console.log("SW", VERSION, "activated - clearing ALL caches")
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// NO CACHING - always go to network
self.addEventListener("fetch", e => {
  // Only handle GET requests
  if (e.request.method !== "GET") return
  // Skip API calls
  if (e.request.url.includes("onrender.com")) return
  // Always fetch fresh from network
  e.respondWith(fetch(e.request).catch(() => new Response("Offline")))
})

// Push notifications
self.addEventListener("push", e => {
  const data = e.data?.json() || { title: "Datta AI", body: "New message!" }
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/datta-ai/logo.png",
      badge: "/datta-ai/logo.png",
      vibrate: [200, 100, 200]
    })
  )
})

self.addEventListener("notificationclick", e => {
  e.notification.close()
  e.waitUntil(clients.openWindow("/datta-ai/index.html"))
})

self.addEventListener("message", e => {
  if (e.data === "skipWaiting") self.skipWaiting()
})
