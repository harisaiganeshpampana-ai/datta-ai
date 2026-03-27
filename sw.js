// Simple service worker - no caching, no redirects
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
    .then(() => self.clients.claim())
  )
})
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return
  if (e.request.url.includes("onrender.com")) return
  // Always fetch fresh - no caching
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)))
})
self.addEventListener("push", e => {
  const d = e.data?.json() || {title:"Datta AI",body:"New message!"}
  e.waitUntil(self.registration.showNotification(d.title,{body:d.body,icon:"/datta-ai/logo.png"}))
})
