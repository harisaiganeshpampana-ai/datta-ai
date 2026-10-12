// Datta AI — account helper shared by every page.
// Keeps track of who is logged in and syncs chats, memory and settings with the server,
// so they show up on every device. Guests keep everything in this browser only.
(function () {
  const RENDER_URL = "https://datta-ai-server.onrender.com"
  const API_BASE = /onrender\.com$|localhost|127\.0\.0\.1/.test(location.hostname) ? "" : RENDER_URL

  const AUTH_KEY = "datta-auth-v1"
  const CHAT_KEY = "datta-chats-v2"
  const MEM_KEY = "datta-memory-v1"
  const SET_KEY = "datta-settings-v1"
  const SYNC_KEY = "datta-sync-v1" // what was last saved to the server: { chatId: signature }

  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback } }
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true } catch { return false } }

  const signature = (chat) => JSON.stringify(chat).length + ":" + (chat.messages?.length || 0) + ":" + (chat.title || "")

  let pushTimer = null
  let pushing = false

  const Account = {
    API_BASE,

    get user() { return read(AUTH_KEY, null)?.user || null },
    get token() { return read(AUTH_KEY, null)?.token || "" },
    isLoggedIn() { return Boolean(this.token) },

    // Call the server; adds the login token automatically
    async api(path, { method = "GET", body } = {}) {
      const headers = { "Content-Type": "application/json" }
      if (this.token) headers.Authorization = "Bearer " + this.token
      let res
      try {
        res = await fetch(API_BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
      } catch {
        throw new Error("Can't reach Datta's server. It may be waking up — try again in 30 seconds.")
      }
      const data = await res.json().catch(() => ({}))
      if (res.status === 401 && this.token) this.forget() // token expired
      if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.")
      return data
    },

    saveLogin(token, user) { write(AUTH_KEY, { token, user }) },

    // Log out on this device (also clears this browser's chats and memory for privacy)
    logout() {
      this.forget()
      for (const key of [CHAT_KEY, MEM_KEY, SYNC_KEY]) localStorage.removeItem(key)
    },
    forget() { localStorage.removeItem(AUTH_KEY); localStorage.removeItem(SYNC_KEY) },

    // Bring the account's saved data into this browser. Returns true if anything changed.
    async pull() {
      if (!this.isLoggedIn()) return false
      const data = await this.api("/api/data")
      const synced = read(SYNC_KEY, {})
      const local = read(CHAT_KEY, [])
      const serverChats = (data.chats || []).filter((c) => c && c.id)
      const serverIds = new Set(serverChats.map((c) => c.id))

      // Keep local chats the server doesn't have yet (new, not saved) — drop ones deleted on another device
      const localOnly = local.filter((c) => !serverIds.has(c.id) && !(c.id in synced))
      // If a chat changed here but wasn't saved yet, keep the local version
      const merged = serverChats.map((sc) => {
        const lc = local.find((c) => c.id === sc.id)
        return lc && synced[lc.id] && signature(lc) !== synced[lc.id] && (lc.updatedAt || 0) > (sc.updatedAt || 0) ? lc : sc
      })
      const chats = [...localOnly, ...merged].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))

      const memLocal = read(MEM_KEY, { on: true, items: [] })
      const items = [...new Set([...(data.memory || []), ...(memLocal.items || [])])].slice(-60)
      const memory = { ...memLocal, items }

      const settings = Object.keys(data.settings || {}).length ? { ...read(SET_KEY, {}), ...data.settings } : read(SET_KEY, {})

      const before = JSON.stringify([local, memLocal, read(SET_KEY, {})])
      write(CHAT_KEY, chats)
      write(MEM_KEY, memory)
      write(SET_KEY, settings)
      const sig = {}
      for (const c of serverChats) sig[c.id] = signature(c)
      write(SYNC_KEY, sig)

      if (localOnly.length || items.length !== (data.memory || []).length) this.schedulePush(100)
      return before !== JSON.stringify([chats, memory, settings])
    },

    // Save what changed in this browser to the account (waits a moment so typing doesn't spam the server)
    schedulePush(delay = 1500) {
      if (!this.isLoggedIn()) return
      clearTimeout(pushTimer)
      pushTimer = setTimeout(() => this.push(), delay)
    },

    async push() {
      if (!this.isLoggedIn()) return
      if (pushing) { this.schedulePush(800); return }
      pushing = true
      try {
        const synced = read(SYNC_KEY, {})
        const chats = read(CHAT_KEY, [])
        const changed = chats.filter((c) => synced[c.id] !== signature(c))
        const ids = new Set(chats.map((c) => c.id))
        const deleted = Object.keys(synced).filter((id) => !ids.has(id))
        const memory = read(MEM_KEY, { items: [] }).items || []
        await this.api("/api/data", { method: "PUT", body: { chats: changed, deleted, memory, settings: read(SET_KEY, {}) } })
        const next = {}
        for (const c of chats) next[c.id] = signature(c)
        write(SYNC_KEY, next)
      } catch (err) {
        console.warn("[sync]", err.message)
      } finally {
        pushing = false
      }
    },

    // Small round picture or first letter for the account button
    avatarHtml(user = this.user, size = 28) {
      const letter = ((user?.name || user?.email || "?").trim()[0] || "?").toUpperCase()
      const style = `width:${size}px;height:${size}px`
      return user?.picture
        ? `<img class="avatar" src="${user.picture.replace(/"/g, "")}" alt="" referrerpolicy="no-referrer" style="${style}">`
        : `<span class="avatar" style="${style}">${letter.replace(/[<>&"]/g, "")}</span>`
    },
  }

  window.Account = Account
})()
