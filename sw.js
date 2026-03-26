const CACHE = "datta-ai-v1"
const ASSETS = [
  "/datta-ai/index.html",
  "/datta-ai/login.html",
  "/datta-ai/chat.js",
  "/datta-ai/style.css",
  "/datta-ai/logo.png",
  "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Rajdhani:wght@600;700&display=swap"
]

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ))
  self.clients.claim()
})

self.addEventListener("fetch", e => {
  // Network first for API calls
  if (e.request.url.includes("onrender.com") || e.request.url.includes("api")) {
    return
  }
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  )
})

// Push notifications
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
