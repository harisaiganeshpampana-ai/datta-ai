// Datta AI Service Worker v5 — stable, no reload loops
const CACHE = 'datta-ai-v5'

self.addEventListener('install', e => {
  // Do NOT skipWaiting — prevents controllerchange reload loop
  // Just install quietly
  console.log('[SW] Installing v5')
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => {
        console.log('[SW] Deleting old cache:', k)
        return caches.delete(k)
      }))
    ).then(() => {
      console.log('[SW] Activated v5')
      return self.clients.claim()
    })
  )
})

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return

  const url = new URL(e.request.url)

  // Never intercept API or external calls
  if (url.hostname !== location.hostname) return
  if (url.pathname.startsWith('/chat')) return
  if (url.pathname.startsWith('/payment')) return
  if (url.pathname.startsWith('/auth')) return
  if (url.pathname.startsWith('/api')) return
  if (url.pathname.startsWith('/google')) return
  if (url.pathname.startsWith('/stop')) return

  // Network first — always get fresh content
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Cache successful responses
        if (res && res.ok && res.type === 'basic') {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
        }
        return res
      })
      .catch(() => {
        // Offline fallback
        return caches.match(e.request).then(cached => {
          return cached || caches.match('/index.html')
        })
      })
  )
})
