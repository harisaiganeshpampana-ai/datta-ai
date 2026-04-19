// Datta AI Service Worker v7 — force fresh HTML, no update loops
const CACHE = 'datta-ai-v7'

self.addEventListener('install', e => {
  console.log('[SW] Installing v7')
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => {
        console.log('[SW] Deleting old cache:', k)
        return caches.delete(k)
      }))
    ).then(() => {
      console.log('[SW] Activated v7')
      return self.clients.claim()
    })
  )
})

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)

  if (url.hostname !== location.hostname) return
  if (url.pathname.startsWith('/chat')) return
  if (url.pathname.startsWith('/payment')) return
  if (url.pathname.startsWith('/auth')) return
  if (url.pathname.startsWith('/api')) return
  if (url.pathname.startsWith('/google')) return
  if (url.pathname.startsWith('/stop')) return
  if (url.pathname.startsWith('/family')) return

  // HTML files — ALWAYS fresh, never cache
  if (url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname === '') {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).catch(() => caches.match(e.request))
    )
    return
  }

  // Other assets — network first, cache fallback
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && res.ok && res.type === 'basic') {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
        }
        return res
      })
      .catch(() => caches.match(e.request))
  )
})
