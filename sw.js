// Auto-update: change version number when you update files
const CACHE = "datta-ai-v" + Date.now()
const STATIC = "datta-ai-static"

const ASSETS = [
  "/datta-ai/index.html",
  "/datta-ai/login.html",
  "/datta-ai/chat.js",
  "/datta-ai/style.css",
  "/datta-ai/logo.png"
]

// INSTALL - cache assets
self.addEventListener("install", e => {
  console.log("SW installing...")
  self.skipWaiting() // Activate immediately, don't wait
  e.waitUntil(
    caches.open(STATIC).then(c => c.addAll(ASSETS)).catch(err => console.log("Cache error:", err))
  )
})

// ACTIVATE - delete old caches immediately
self.addEventListener("activate", e => {
  console.log("SW activating...")
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== STATIC).map(k => {
        console.log("Deleting old cache:", k)
        return caches.delete(k)
      }))
    ).then(() => self.clients.claim()) // Take control of all pages immediately
  )
})

// FETCH - network first, cache fallback
self.addEventListener("fetch", e => {
  // Skip API calls - always go to network
  if (e.request.url.includes("onrender.com") ||
      e.request.url.includes("api.") ||
      e.request.method !== "GET") {
    return
  }

  e.respondWith(
    fetch(e.request)
      .then(response => {
        // Update cache with fresh response
        if (response && response.status === 200) {
          const clone = response.clone()
          caches.open(STATIC).then(c => c.put(e.request, clone))
        }
        return response
      })
      .catch(() => caches.match(e.request)) // Offline fallback
  )
})

// PUSH NOTIFICATIONS
self.addEventListener("push", e => {
  const data = e.data?.json() || { title: "Datta AI", body: "You have a new message!" }
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

// BACKGROUND SYNC - when back online
self.addEventListener("message", e => {
  if (e.data === "skipWaiting") self.skipWaiting()
})
