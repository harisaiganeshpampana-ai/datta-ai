const VERSION = "datta-ai-v25"
const CACHE = VERSION

self.addEventListener("install", e => {
  console.log("SW v25 installing")
  self.skipWaiting()
  e.waitUntil(
    caches.open(CACHE).then(c =>
      c.addAll([
        "/datta-ai/index.html",
        "/datta-ai/chat.js",
        "/datta-ai/style.css",
        "/datta-ai/logo.png"
      ]).catch(() => {})
    )
  )
})

self.addEventListener("activate", e => {
  console.log("SW v25 activating - clearing old caches")
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE).map(k => {
          console.log("Deleting:", k)
          return caches.delete(k)
        })
      )
    ).then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return
  if (e.request.url.includes("onrender.com")) return
  if (e.request.url.includes("googleapis")) return

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && res.status === 200) {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
        }
        return res
      })
      .catch(() => caches.match(e.request))
  )
})

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
