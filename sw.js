// Datta AI Service Worker v8 — NO CACHE, pure passthrough
// Fixes 404 refresh loop from old bad cache

self.addEventListener('install', e => {
  console.log('[SW] v8 installing')
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // Wipe ALL caches
    const keys = await caches.keys()
    await Promise.all(keys.map(k => caches.delete(k)))
    console.log('[SW] v8 cleared all caches')
    await self.clients.claim()
  })())
})

// Pass everything to network - no caching
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  // Don't intercept - let browser handle natively
  return
})
