// Datta AI Service Worker v4
const CACHE = 'datta-ai-v4'

self.addEventListener('install', e => {
  // Skip waiting — activate immediately
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  // Clean old caches
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  // Only handle GET requests
  if (e.request.method !== 'GET') return
  
  const url = new URL(e.request.url)
  
  // Never cache API calls or external services
  if (url.hostname !== location.hostname) return
  if (url.pathname.startsWith('/chat')) return
  if (url.pathname.startsWith('/payment')) return
  if (url.pathname.startsWith('/auth')) return
  if (url.pathname.startsWith('/api')) return

  // Network first for HTML pages
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/index.html'))
    )
    return
  }

  // Cache first for static assets (js, css, images)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached
      return fetch(e.request).then(res => {
        if (res && res.ok) {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
        }
        return res
      })
    })
  )
})
