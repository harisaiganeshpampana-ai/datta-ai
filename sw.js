// VERSION 37 - Clear all old cache
const VERSION = "v37"

self.addEventListener("install", () => {
  console.log("SW", VERSION)
  self.skipWaiting()
})

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// Never cache - always fetch fresh
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return
  if (e.request.url.includes("onrender.com")) return
  e.respondWith(
    fetch(e.request + (e.request.url.includes("?") ? "&" : "?") + "_sw=" + VERSION)
      .catch(() => fetch(e.request))
  )
})

self.addEventListener("push", e => {
  const d = e.data?.json() || { title:"Datta AI", body:"New message!" }
  e.waitUntil(self.registration.showNotification(d.title, { body:d.body, icon:"/datta-ai/logo.png" }))
})

self.addEventListener("notificationclick", e => {
  e.notification.close()
  e.waitUntil(clients.openWindow("/datta-ai/index.html"))
})
