const SERVER = "https://datta-ai-server.onrender.com"

// Global state — var so they're hoisted and available from HTML onclick
var _ddOpen = false
var _ddClickTime = 0
var notesOpen = false


// '''''''''''''''''''''''''''''''''''''''''''
// SINGLE INIT - runs everything on load
// '''''''''''''''''''''''''''''''''''''''''''
window.addEventListener("DOMContentLoaded", function() {
  // Apply saved theme immediately
  const savedTheme = localStorage.getItem("datta_theme") || "dark"
  setTheme(savedTheme, true)

  // Apply saved accent color
  const savedAccent = localStorage.getItem("datta_accent")
  if (savedAccent) {
    document.documentElement.style.setProperty("--accent", savedAccent)
  }

  // Apply saved font size — check all possible storage keys
  const savedFontPx = localStorage.getItem("datta_font_size")
  const savedFontLabel = localStorage.getItem("datta_font_size_label") || localStorage.getItem("datta_fontsize")
  const fontSizes = { small: "13px", medium: "15px", large: "17px" }
  const applyFontPx = savedFontPx || fontSizes[savedFontLabel] || null
  if (applyFontPx) {
    document.documentElement.style.setProperty("--chat-font-size", applyFontPx)
    // Apply to all existing bubbles
    document.querySelectorAll(".ai-bubble,.aiBubble,.user-bubble,.userBubble").forEach(
      el => el.style.fontSize = applyFontPx
    )
  }

  // Hide welcome if returning from settings
  const lastChat = localStorage.getItem("datta_last_chat")
  if (lastChat) {
    const welcome = document.getElementById("welcomeScreen")
    if (welcome) welcome.style.display = "none"
  }
})


// SAFE CONTENT — prevents [object Object] anywhere in UI
function safeContent(c) {
  if (c === null || c === undefined) return ""
  if (typeof c === "string") {
    return c.split("[object Object]").join("").split("[object object]").join("").split("[Object Object]").join("").trim()
  }
  if (typeof c === "number" || typeof c === "boolean") return String(c)
  if (Array.isArray(c)) {
    const textParts = c.filter(p => p && p.type === "text").map(p => safeContent(p.text))
    if (textParts.length) return textParts.join("")
    return c.map(item => safeContent(item)).filter(Boolean).join("\n")
  }
  if (typeof c === "object") {
    const val = c.text || c.content || c.message || c.name || c.title || c.value
    if (val) return safeContent(val)
    try { return JSON.stringify(c, null, 2) } catch(e) { return "" }
  }
  return String(c)
}


// ── DOM HELPERS — work with both old and new class names ──────────────────────
function getAiBubble(el) {
  return el.closest(".aiContent")?.querySelector(".ai-bubble, .aiBubble")
    || el.closest(".msg-row, .messageRow")?.querySelector(".ai-bubble, .aiBubble")
}
function getUserBubble(el) {
  return el.closest(".msg-row, .messageRow")?.querySelector(".user-bubble, .userBubble")
}
function getMsgRow(el) {
  return el.closest(".msg-row, .messageRow")
}
function getAiContent(el) {
  return el.closest(".aiContent") || el.closest(".msg-row, .messageRow")
}

function formatResponse(r) { return safeContent(r) }
function retryLastMsg() { var i=document.getElementById("message"); if(i&&window.lastUserMsg){i.value=window.lastUserMsg;} send() }

// SHARE CHAT
async function shareChatLink() {
  if (!currentChatId) { showToast("Start a chat first!"); return }
  try {
    showToast("Creating share link...")
    const res = await fetch(SERVER + "/chat/" + currentChatId + "/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: getToken() })
    })
    const data = await res.json()
    if (data.url) {
      await navigator.clipboard.writeText(data.url)
      showToast("Share link copied! '")
    }
  } catch(e) { showToast("Failed to create share link") }
}

// CODE EXECUTION in chat
async function executeCode(btn) {
  const pre = btn.closest(".codeBlockWrap").querySelector("pre")
  const code = pre.querySelector("code")?.innerText || pre.innerText
  const lang = pre.querySelector("code")?.className?.replace("language-", "") || "javascript"

  btn.textContent = "Running..."
  btn.disabled = true

  try {
    const res = await fetch(SERVER + "/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, language: lang, token: getToken() })
    })
    const result = await res.json()

    // Show output below code block
    const wrap = btn.closest(".codeBlockWrap")
    let outputDiv = wrap.querySelector(".codeOutput")
    if (!outputDiv) {
      outputDiv = document.createElement("div")
      outputDiv.className = "codeOutput"
      wrap.appendChild(outputDiv)
    }

    if (result.errors) {
      outputDiv.innerHTML = '<div class="codeOutputErr">' + result.errors + '</div>'
    } else if (result.output) {
      outputDiv.innerHTML = '<div class="codeOutputOk">Output:<br><pre>' + result.output + '</pre></div>'
    } else {
      outputDiv.innerHTML = '<div class="codeOutputOk">✓ Ran successfully (no output)</div>'
    }
  } catch(e) {
    showToast("Execution failed")
  }
  btn.textContent = "Run"
  btn.disabled = false
}

window.shareChatLink = shareChatLink
window.executeCode = executeCode

// ADD COPY BUTTONS TO CODE BLOCKS
function addCodeCopyButtons(container) {
  if (!container) return
  const codeBlocks = container.querySelectorAll("pre")
  codeBlocks.forEach(pre => {
    if (pre.querySelector(".codeCopyBtn")) return // already has button

    const lang = pre.querySelector("code")?.className?.replace("language-", "") || ""

    const wrapper = document.createElement("div")
    wrapper.className = "codeBlockWrap"

    const isRunnable = ["javascript","js","python","py"].includes((lang||"").toLowerCase())
    const header = document.createElement("div")
    header.className = "codeBlockHeader"
    header.innerHTML = `
      <span class="codeLang">${lang || "code"}</span>
      <div style="display:flex;gap:6px;">
        ${isRunnable ? `<button class="codeRunBtn" onclick="executeCode(this)">▶ Run</button>` : ""}
        <button class="codeCopyBtn" onclick="copyCode(this)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy
        </button>
      </div>
    `

    pre.parentNode.insertBefore(wrapper, pre)
    wrapper.appendChild(header)
    wrapper.appendChild(pre)
  })
}

function copyCode(btn) {
  const pre = btn.closest(".codeBlockWrap").querySelector("pre")
  const code = pre.querySelector("code")?.innerText || pre.innerText
  navigator.clipboard.writeText(code).then(() => {
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied!`
    btn.style.color = "#00ff88"
    setTimeout(() => {
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy`
      btn.style.color = ""
    }, 2000)
  })
}

window.copyCode = copyCode
window.addCodeCopyButtons = addCodeCopyButtons

// ── DYNAMIC SEND/STOP BUTTON SYSTEM ──
let isGenerating = false

function setGenerating(val) {
  isGenerating = val
  const btn   = document.getElementById("actionMainBtn")
  const inner = document.getElementById("actionMainBtnInner")

  // Toggle body class — used by CSS for TV/no-hover states
  if (val) {
    document.body.classList.add("is-generating")
  } else {
    document.body.classList.remove("is-generating")
  }

  if (!btn || !inner) return

  if (val) {
    btn.classList.remove("send-state")
    btn.classList.add("stop-state")
    // Ensure always visible regardless of focus/hover
    btn.style.opacity = "1"
    btn.style.visibility = "visible"
    btn.style.pointerEvents = "all"
    inner.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="rgba(255,100,100,0.95)">
      <rect x="3" y="3" width="18" height="18" rx="3"/>
    </svg>`
  } else {
    btn.classList.remove("stop-state")
    btn.classList.add("send-state")
    btn.style.opacity = ""
    btn.style.visibility = ""
    btn.style.pointerEvents = ""
    inner.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
      <line x1="12" y1="19" x2="12" y2="5"/>
      <polyline points="5 12 12 5 19 12"/>
    </svg>`
  }
}

function handleMainBtn() {
  if (isGenerating) {
    stopGeneration()
  } else {
    send()
  }
}

function showStopBtn() { setGenerating(true) }
function hideStopBtn() {
  setGenerating(false)
  document.body.classList.remove("is-generating")
}

function stopGeneration() {
  // Guard: if already stopped, do nothing
  if (!isGenerating && !controller) return

  // Abort the fetch locally
  if (controller) {
    controller.abort()
    controller = null
  }

  // Tell server to release the active request lock
  const token = getToken()
  if (token) {
    fetch(SERVER + "/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token })
    }).catch(() => {})  // fire-and-forget, don't block UI
  }

  // Set global stop flag — runTyping() checks this
  window._stopTyping = true

  setGenerating(false)

  // Re-enable input immediately
  const msgInput = document.getElementById("message")
  if (msgInput) {
    msgInput.disabled = false
    msgInput.value = window.lastUserMsg || msgInput.value
    msgInput.focus()
  }

  // The typing loop handles the "stopped" message via typingActive = false
  // For streams that already finished network but are still typing,
  // find last .typingCursor and mark as stopped
  const cursors = document.querySelectorAll(".typingCursor")
  cursors.forEach(cur => {
    const user = JSON.parse(localStorage.getItem("datta_user") || "{}")
    const name = user.username || "you"
    const msg = document.createElement("div")
    msg.className = "stoppedMsg"
    msg.textContent = "Response stopped by " + name
    cur.replaceWith(msg)
  })
}

window.handleMainBtn = handleMainBtn
window.stopGeneration = stopGeneration

// Edit user message and resend
function editMessage(btn) {
  const row = getMsgRow(btn)
  const bubble = row?.querySelector(".user-bubble, .userBubble")
  const originalText = bubble.textContent.trim()
  
  // Put text back in input
  const input = document.getElementById("message")
  if (input) {
    input.value = originalText
    input.focus()
    // Move cursor to end
    input.setSelectionRange(input.value.length, input.value.length)
  }
  showToast("Edit your message and send")
}

// Retry last user message
function retryMessage(btn) {
  const row = getMsgRow(btn)
  const bubble = row?.querySelector(".user-bubble, .userBubble")
  const text = bubble.textContent.trim()
  if (!text) return
  
  // Remove all messages from this point onwards
  const allRows = Array.from(document.querySelectorAll(".msg-row, .messageRow"))
  const idx = allRows.indexOf(row)
  for (let i = idx; i < allRows.length; i++) {
    allRows[i].remove()
  }
  
  // Resend
  const input = document.getElementById("message")
  if (input) input.value = text
  send()
}

// Send lens result to chat
function lensSendToChat() {
  const result = lensLastResult
  if (!result) { showToast("Capture an image first"); return }
  closeLens()
  // Add to chat as AI response
  const chatBox = document.getElementById("chat")
  if (!chatBox) return
  hideWelcome()
  const aiDiv = document.createElement("div")
  aiDiv.className = "msg-row"
  const cleanResult = (result || "").replace(/\n/g, "<br>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
  aiDiv.innerHTML = `
    <div class="aiContent">
      <div class="ai-bubble">${cleanResult}</div>
      <div class="aiActions">
        <button class="actionBtn" title="Copy" onclick="navigator.clipboard.writeText(this.closest('.msg-row').querySelector('.ai-bubble').innerText);showToast('Copied!')">
          <i data-lucide="copy"></i>
        </button>
      </div>
    </div>`
  chatBox.appendChild(aiDiv)
  chatBox.scrollTop = chatBox.scrollHeight
  lucide.createIcons()
  showToast("Result added to chat!")
}
window.lensSendToChat = lensSendToChat

window.editMessage = editMessage
window.retryMessage = retryMessage

// RENDER IMAGE RESPONSE - Datta AI unique style

function downloadImage(url, prompt) {
  const a = document.createElement("a")
  a.href = url
  a.download = prompt.substring(0, 30).replace(/[^a-z0-9]/gi, "_") + ".jpg"
  a.target = "_blank"
  a.click()
}

async function regenerateImage(prompt, btn) {
  btn.disabled = true
  btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 0.6s linear infinite"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Generating...'

  const container = btn.closest(".imageGenContainer")
  const img = container.querySelector(".generatedImg")
  const loader = container.querySelector(".imageGenLoader")
  const result = container.querySelector(".imageGenResult")

  // Show loader
  result.style.display = "none"
  loader.style.display = "flex"
  loader.innerHTML = '<div class="imageGenSpinner"></div><div class="imageGenLoadText">Regenerating...</div>'

  // Generate new image with different seed
  const seed = Math.floor(Math.random() * 99999)
  const newUrl = "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt) + "?width=1024&height=1024&nologo=true&enhance=true&seed=" + seed

  img.onload = () => {
    result.style.display = "block"
    loader.style.display = "none"
    btn.disabled = false
    btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Regenerate'
  }
  img.onerror = () => {
    loader.innerHTML = '<div style="color:#f88">Failed. Try again.</div>'
    btn.disabled = false
  }
  img.src = newUrl
}

function likeImage(btn) {
  const isActive = btn.classList.toggle("active")
  btn.style.color = isActive ? "#00ff88" : ""
  const dislike = btn.closest(".imageGenBtns").querySelector(".dislikeImgBtn")
  if (dislike) { dislike.classList.remove("active"); dislike.style.color = "" }
}

function dislikeImage(btn) {
  const isActive = btn.classList.toggle("active")
  btn.style.color = isActive ? "#ff4444" : ""
  const like = btn.closest(".imageGenBtns").querySelector(".likeImgBtn")
  if (like) { like.classList.remove("active"); like.style.color = "" }
}

window.downloadImage = downloadImage
window.regenerateImage = regenerateImage
window.likeImage = likeImage
window.dislikeImage = dislikeImage
// Cycle loading text for image generation
function startImgLoadingText(uid) {
  const texts = [
    "Generating with AI...",
    "Painting pixels...",
    "Adding details...",
    "Almost ready...",
    "Final touches..."
  ]
  let i = 0
  const el = document.getElementById(uid + "txt")
  if (!el) return
  const interval = setInterval(() => {
    i = (i + 1) % texts.length
    if (el) el.textContent = texts[i]
    else clearInterval(interval)
  }, 1200)
  // Store interval to clear later
  window["imgInterval_" + uid] = interval
}
window.startImgLoadingText = startImgLoadingText
// AUTH CHECK - redirect to login if not logged in
// Configure marked with enhanced rendering - emojis, icons, beautiful output
if (typeof marked !== 'undefined') {
  const renderer = new marked.Renderer()

  // Helper: extract rendered HTML from marked token (handles v4 string and v5 object/array)
  function ms(v) {
    if (v === null || v === undefined) return ""
    if (typeof v === "string") return v
    if (Array.isArray(v)) {
      // v5 passes tokens array for inline content — render each token recursively
      return v.map(t => {
        if (!t) return ""
        if (typeof t === "string") return t
        if (t.type === "text") return t.text || t.raw || ""
        if (t.type === "strong") return "<strong style='color:var(--text,#fff);font-weight:700;'>" + ms(t.tokens || t.text) + "</strong>"
        if (t.type === "em") return "<em style='color:var(--text2,#aaa);'>" + ms(t.tokens || t.text) + "</em>"
        if (t.type === "codespan") return "<code style='background:#1a1a1a;border:1px solid #2a2a2a;border-radius:5px;padding:2px 7px;font-size:13px;color:#00ff88;font-family:Courier New,monospace;'>" + (t.text || "") + "</code>"
        if (t.type === "link") return "<a href='" + (t.href||"") + "' target='_blank' style='color:#00ccff;text-decoration:none;'>" + ms(t.tokens || t.text) + "</a>"
        if (t.type === "space") return " "
        // fallback: use text or raw
        return t.text || t.raw || ""
      }).join("")
    }
    if (typeof v === "object") {
      // v5 object token — try tokens array first, then text, then raw
      if (v.tokens && Array.isArray(v.tokens)) return ms(v.tokens)
      return v.text || v.raw || v.value || ""
    }
    return String(v)
  }

  renderer.heading = function(token, level) {
    const text = ms(token)
    const lvl  = (token && token.depth) || level || 1
    const icons = { 1:"✨", 2:"📌", 3:"▶️" }
    const sizes = { 1:"22px", 2:"18px", 3:"16px" }
    return `<div style="display:flex;align-items:center;gap:8px;margin:16px 0 8px;font-weight:700;font-size:${sizes[lvl]||"15px"};color:var(--text,#fff);">
      <span>${icons[lvl]||"•"}</span><span>${text}</span>
    </div>`
  }

  renderer.listitem = function(token) {
    const text = ms(token)
    return `<li style="display:flex;gap:8px;align-items:flex-start;margin:6px 0;line-height:1.7;">
      <span style="color:#00ff88;flex-shrink:0;margin-top:2px;">›</span>
      <span>${text}</span>
    </li>`
  }

  renderer.list = function(token, ordered) {
    // v5: token is object {body, ordered}; v4: token is string body
    const body = (token && typeof token === "object") ? (token.body || "") : ms(token)
    const isOrdered = (token && typeof token === "object") ? token.ordered : ordered
    const tag = isOrdered ? "ol" : "ul"
    return `<${tag} style="padding:0;margin:10px 0;list-style:none;">${body}</${tag}>`
  }

  renderer.blockquote = function(token) {
    const text = ms(token)
    return `<blockquote style="border-left:3px solid #00ff88;padding:10px 16px;margin:12px 0;background:rgba(0,255,136,0.05);border-radius:0 8px 8px 0;color:#aaa;font-style:italic;">${text}</blockquote>`
  }

  renderer.code = function(token, lang) {
    const codeStr = (token && typeof token === "object") ? (token.text || token.raw || "") : String(token || "")
    const langStr = ((token && typeof token === "object") ? (token.lang || "") : (lang || "")).toLowerCase()
    const escaped = codeStr.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    const isPreviewable = ["html","css","javascript","js"].includes(langStr) || codeStr.trim().startsWith("<!DOCTYPE") || codeStr.trim().startsWith("<html")
    const uid = "code_" + Math.random().toString(36).slice(2,8)
    const langLabel = langStr ? `<span style="font-size:11px;color:#555;letter-spacing:1.5px;text-transform:uppercase;font-family:'Courier New',monospace;">${langStr}</span>` : ""
    const encoded = encodeURIComponent(codeStr)

    const previewBtn = isPreviewable ? `
      <button onclick="toggleSplitPreview('${uid}')" 
        style="display:flex;align-items:center;gap:5px;padding:3px 10px;background:rgba(0,201,167,0.12);border:1px solid rgba(0,201,167,0.3);border-radius:6px;color:#00c9a7;font-size:11px;cursor:pointer;font-family:inherit;">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Preview
      </button>` : ""

    return `<div class="code-block-wrap" id="${uid}_wrap" data-code="${encoded}" data-lang="${langStr}" style="margin:12px 0;border-radius:12px;overflow:hidden;border:1px solid #1e1e2e;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 14px;background:#0a0a0f;border-bottom:1px solid #1a1a2a;">
        <div style="display:flex;align-items:center;gap:8px;">
          ${langLabel}
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          ${previewBtn}
          <button onclick="copyBlockCode(this)" data-code="${encoded}"
            style="display:flex;align-items:center;gap:5px;padding:3px 10px;background:none;border:1px solid #2a2a3a;border-radius:6px;color:#555;font-size:11px;cursor:pointer;font-family:inherit;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy
          </button>
        </div>
      </div>
      <div id="${uid}_split" style="display:flex;overflow:hidden;">
        <pre id="${uid}_pre" style="flex:1;min-width:0;margin:0;padding:16px;background:#0d0d12;overflow-x:auto;transition:flex 0.3s ease;"><code style="font-family:'Courier New',monospace;font-size:13px;color:#e0e0e0;line-height:1.65;">${escaped}</code></pre>
      </div>
    </div>`
  }

  renderer.codespan = function(token) {
    const text = ms(token)
    return `<code style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:5px;padding:2px 7px;font-size:13px;color:#00ff88;font-family:'Courier New',monospace;">${text}</code>`
  }

  renderer.strong = function(token) {
    const text = ms(token)
    return `<strong style="color:var(--text,#fff);font-weight:700;">${text}</strong>`
  }

  renderer.em = function(token) {
    const text = ms(token)
    return `<em style="color:var(--text2,#aaa);">${text}</em>`
  }

  renderer.hr = function() {
    return `<hr style="border:none;border-top:1px solid #1e1e1e;margin:16px 0;">`
  }

  renderer.link = function(token, title, text) {
    // v5: token = {href, title, text}  v4: token = href string
    const href = (token && typeof token === "object") ? (token.href || "") : (token || "")
    const label = (token && typeof token === "object") ? ms(token.text || token.tokens) : (text || href)
    return `<a href="${href}" target="_blank" rel="noopener" style="color:#00ccff;text-decoration:none;border-bottom:1px solid #00ccff44;">${label} ↗</a>`
  }

  renderer.paragraph = function(token) {
    const text = ms(token)
    return `<p style="margin:0 0 10px;line-height:1.75;">${text}</p>`
  }

  // v5 uses walkTokens for nested tokens - ensure text tokens render correctly
  marked.use({
    renderer,
    breaks: true,
    gfm: true
  })
}

// Always read token fresh
function getToken() {
  return localStorage.getItem("datta_token") || ""
}

// Save current chat when leaving page
window.addEventListener("beforeunload", function() {
  if (currentChatId) {
    localStorage.setItem("datta_last_chat", currentChatId)
    localStorage.setItem("datta_came_from_settings", "0")
  }
})

// Also save when navigating within the app
function navigateTo(url) {
  if (currentChatId) localStorage.setItem("datta_last_chat", currentChatId)
  window.location.href = url
}
window.navigateTo = navigateTo

// Restore last chat - called AFTER sidebar loads

function getUser() {
  try {
    const raw = localStorage.getItem("datta_user")
    if (raw && raw !== "null" && raw !== "undefined") return JSON.parse(raw)
  } catch(e) {}
  return null
}

// AUTH CHECK — only redirect if no token at all
// If token exists but user object missing, stay on page (user data loads async)
if (!getToken()) {
  window.location.href = "login.html"
}

const datta_token = getToken()
const datta_user = getUser()

// Update sidebar profile with real user info
window.addEventListener("DOMContentLoaded", function() {
  if (datta_user) {
    const nameEl = document.getElementById("profileName") || document.querySelector(".sb-profile-name")
    const avatarEl = document.getElementById("profileAvatar") || document.querySelector(".sb-avatar")
    const subEl = document.getElementById("profileSub") || document.querySelector(".sb-profile-sub")
    if (nameEl) nameEl.textContent = datta_user.username || "User"
    if (avatarEl) avatarEl.textContent = (datta_user.username || "U")[0].toUpperCase()
    if (subEl) subEl.textContent = datta_user.isGuest ? "Guest" : (datta_user.email || "Free Plan")
  }
})

const chatBox = document.getElementById("chat")
const sendBtn = document.querySelector(".send")
const scrollBtn = document.getElementById("scrollDownBtn")

function getAuthHeaders() {
  return { "Authorization": "Bearer " + getToken() }
}

let currentChatId = null
let controller = null
let userScrolledUp = false


// ─── NEW CHAT ────────────────────────────────────────────────────────────────
function newChat() {
  currentChatId = null
  chatBox.innerHTML = ""
  chatBox.scrollTop = 0
  localStorage.removeItem("datta_last_chat")
  // Close sidebar on mobile
  const sidebar = document.getElementById("sidebar")
  if (sidebar && window.innerWidth < 768) {
    sidebar.classList.remove("open")
    const overlay = document.getElementById("sidebarOverlay")
    if (overlay) overlay.style.display = "none"
  }
  showWelcome()
  // Reload smart suggestions
  loadSmartSuggestions()
  // Focus input
  const msg = document.getElementById("message")
  if (msg) setTimeout(() => msg.focus(), 100)
}


// ─── SEND MESSAGE ─────────────────────────────────────────────────────────────
async function send() {
  // Prevent double-send while AI is generating
  if (isGenerating) return
  // Reset stop flag and retry counter for fresh request
  window._stopTyping = false
  window._retryCount = 0

  const input = document.getElementById("message")
  const filePreview = document.getElementById("filePreview")

  // Get file from any input source
  let file = null
  const fileInputIds = ["cameraInput", "photoInput", "imageInput"]
  for (const id of fileInputIds) {
    const el = document.getElementById(id)
    if (el && el.files && el.files[0]) { file = el.files[0]; break }
  }
  const text = input.value.trim()

  // Block send if nothing to send
  if (!text && !file) return

  // Save chat title - always use the typed message as title
  if (!currentChatId) {
    let title = text ? text.substring(0, 40) : "New Chat"
    if (text && text.length > 40) title += "..."
    saveChatTitle(title)
  }

  hideWelcome()
  document.body.classList.add("chat-started")

  // Show user bubble with image preview if attached
  let fileBubble = ""
  if (file) {
    if (file.type.startsWith("image/")) {
      const imgUrl = URL.createObjectURL(file)
      fileBubble = `<div style="margin-bottom:8px;"><img src="${imgUrl}" style="max-width:220px;max-height:200px;border-radius:10px;display:block;" alt="attached image"></div>`
    } else {
      fileBubble = `<div style="font-size:12px;color:#aaa;margin-bottom:6px;background:#1a1a1a;padding:6px 10px;border-radius:8px;display:inline-flex;align-items:center;gap:6px;"><span>📄</span><span>${file.name}</span></div>`
    }
  }

  chatBox.innerHTML += `
    <div class="msg-row user-row">
      <div class="user-bubble">
        ${fileBubble}
        ${text ? `<div>${text}</div>` : ""}
      </div>
    </div>
  `

  chatBox.scrollTop = chatBox.scrollHeight

  // Clear input + reset textarea height
  input.value = ""
  if (window.taAutoResize) window.taAutoResize()
  ;["cameraInput","photoInput","imageInput"].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.value = ""
  })
  if (typeof clearFileSelection === "function") clearFileSelection()

  // Detect request type for smart thinking steps
  const msgLow = text.toLowerCase()
  const willSearch = ["latest news","breaking news","live score","stock price","crypto price","bitcoin price","gold price","petrol price","weather in","weather today","who won","election result","trending now","ipl 2025","ipl 2026","world cup","search for","look up","news about","just happened","announced today"].some(t => msgLow.includes(t))
  const willCode = ["build","create a website","write code","make an app","html","python","javascript","css","react","debug","fix this code","script"].some(t => msgLow.includes(t))
  const willBuildLarge = ["food delivery","delivery app","ecommerce","e-commerce","shopping app","social media","chat app","booking app","full website","complete app","full app","full stack","fullstack","saas","startup","business app","ride sharing","uber","zomato","amazon","clone"].some(t => msgLow.includes(t))
  const willAnalyze = ["analyze","analyse","explain","summarize","what is","who is","how does","why does","pdf","document","file"].some(t => msgLow.includes(t))
  const willPlan = ["business plan","fitness plan","study plan","workout plan","meal plan","project plan","roadmap","strategy"].some(t => msgLow.includes(t))

  // Build smart thinking steps
  function getThinkingSteps() {
    if (willSearch) return [
      { icon:"🔍", text:"Reading your question..." },
      { icon:"🌐", text:"Searching the web..." },
      { icon:"📊", text:"Analyzing results..." },
      { icon:"✍️", text:"Writing answer..." }
    ]
    if (willBuildLarge) return [
      { icon:"🧠", text:"Understanding your app idea..." },
      { icon:"📐", text:"Planning architecture..." },
      { icon:"📁", text:"Designing file structure..." },
      { icon:"💻", text:"Writing code..." },
      { icon:"🔍", text:"Reviewing & completing..." }
    ]
    if (willCode) return [
      { icon:"🧠", text:"Understanding requirements..." },
      { icon:"🏗️", text:"Planning structure..." },
      { icon:"💻", text:"Writing code..." },
      { icon:"✅", text:"Reviewing output..." }
    ]
    if (willPlan) return [
      { icon:"📋", text:"Understanding your goal..." },
      { icon:"🔎", text:"Researching best practices..." },
      { icon:"🏗️", text:"Building your plan..." },
      { icon:"✍️", text:"Writing full document..." }
    ]
    if (willAnalyze) return [
      { icon:"📖", text:"Reading content..." },
      { icon:"🧠", text:"Processing information..." },
      { icon:"💡", text:"Forming insights..." },
      { icon:"✍️", text:"Writing response..." }
    ]
    return [
      { icon:"🧠", text:"Thinking..." },
      { icon:"💡", text:"Forming answer..." }
    ]
  }

  const steps = getThinkingSteps()

  let aiDiv = document.createElement("div")
  aiDiv.className = "msg-row"
  aiDiv.innerHTML = `
    <div class="thinkingBlock" id="thinkingBlock">
      <div class="thinkingHeader">
        <div class="thinkingOrb"></div>
        <span class="thinkingTitle">Thinking</span>
        <span class="thinkingDots"><span>.</span><span>.</span><span>.</span></span>
      </div>
      <div class="thinkingSteps" id="thinkingSteps">
        ${steps.map((s,i) => `
          <div class="thinkStep" id="thinkStep${i}" style="opacity:0;transform:translateY(6px);transition:all 0.3s ease ${i*0.4}s;">
            <span class="thinkStepIcon">${s.icon}</span>
            <span class="thinkStepText">${s.text}</span>
            <span class="thinkStepLoader" id="stepLoader${i}"></span>
          </div>`).join("")}
      </div>
    </div>
  `
  chatBox.appendChild(aiDiv)
  chatBox.scrollTop = chatBox.scrollHeight

  // Animate steps in sequence
  steps.forEach((s, i) => {
    setTimeout(() => {
      const el = document.getElementById("thinkStep" + i)
      if (el) { el.style.opacity = "1"; el.style.transform = "translateY(0)" }
      // Mark previous step done
      if (i > 0) {
        const prev = document.getElementById("stepLoader" + (i-1))
        const prevEl = document.getElementById("thinkStep" + (i-1))
        if (prev) prev.innerHTML = '<span style="color:#00ff88;">✓</span>'
        if (prevEl) prevEl.style.opacity = "0.5"
      }
    }, i * 400)
  })

  // Build FormData
  controller = new AbortController()
  const formData = new FormData()
  // If image with no text, add helpful default prompt
  const finalText = (!text && file && file.type.startsWith("image/"))
    ? "Please analyze and describe this image in detail."
    : text
  // Save for retry
  window.lastUserMsg = finalText
  formData.append("message", finalText)
  formData.append("chatId", currentChatId || "")
  formData.append("token", getToken())
  formData.append("language", localStorage.getItem("datta_language") || "English")
  formData.append("model", getPersonaModel())
  formData.append("modelKey", localStorage.getItem("datta_model_key") || "d21")
  formData.append("style", localStorage.getItem("datta_ai_style") || "Balanced")
  formData.append("ainame", localStorage.getItem("datta_ai_name") || "Datta AI")
  // Send user's actual local time from browser
  const _now = new Date()
  formData.append("userTime", _now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }))
  formData.append("userDate", _now.toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" }))
  
  // If user asks "near me" - try to get location
  // Auto-save to daily memory
  if (finalText) autoDetectAndSaveMemory(finalText)
  const _msgLower = (finalText || "").toLowerCase()
  const _needsLocation = ["near me", "nearby", "nearest", "around me", "close to me", "in my area"].some(t => _msgLower.includes(t))
  const _savedLocation = localStorage.getItem("datta_user_city")
  if (_needsLocation && _savedLocation) {
    formData.append("userLocation", _savedLocation)
  } else if (_needsLocation && navigator.geolocation) {
    // Try to get city from browser
    try {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000 }))
      const lat = pos.coords.latitude.toFixed(4)
      const lng = pos.coords.longitude.toFixed(4)
      formData.append("userLocation", "coordinates: " + lat + "," + lng)
    } catch(e) {
      // Location denied - AI will ask
    }
  }

  if (file) {
    formData.append("image", file)
    // If image attached, use vision model automatically
    if (file.type.startsWith("image/")) {
      formData.set("model", "meta-llama/llama-4-scout-17b-16e-instruct")
      console.log("Image attached - using vision model")
    }
  }

  showStopBtn()

  // Auto-retry fetch - uses GLOBAL controller so Stop button works
  async function fetchWithRetry(url, options, maxTries = 4) {
    for (let i = 0; i < maxTries; i++) {
      try {
        // If user already stopped before request starts — bail immediately
        if (!controller || controller.signal.aborted) throw new DOMException("Aborted", "AbortError")

        // Timeout: abort the GLOBAL controller after 120s
        // This means Stop button AND timeout both cancel the same signal
        const timeoutId = setTimeout(() => {
          if (controller && !controller.signal.aborted) controller.abort()
        }, 120000)

        const r = await fetch(url, { ...options, signal: controller.signal })
        clearTimeout(timeoutId)
        return r
      } catch(e) {
        // If user hit Stop — propagate immediately, no retry
        if (e.name === "AbortError") throw e
        if (i === maxTries - 1) throw e
        // Network error — retry with fresh controller
        const title = document.querySelector(".thinkingTitle")
        if (title) title.textContent = "Connecting... (" + (i+2) + "/" + maxTries + ")"
        await new Promise(r => setTimeout(r, 5000))
        controller = new AbortController()
      }
    }
  }

  try {
    const res = await fetchWithRetry(SERVER + "/chat", {
      method: "POST",
      body: formData
    })

    // Check for errors FIRST before streaming
    if (!res.ok) {
      let errData = {}
      try { errData = await res.json() } catch(e) {}
      
      hideStopBtn()

      if (errData.error === "REQUEST_IN_PROGRESS") {
        hideStopBtn()
        showToast("⏳ Please wait for current response to finish")
        aiDiv.remove()
        const input = document.getElementById("message")
        if (input) { input.disabled = false; input.focus() }
        return
      }

      if (errData.error === "RATE_LIMIT") {
        hideStopBtn()
        aiDiv.innerHTML = `<div class="aiContent"><div class="ai-bubble" style="background:#1a1200;border:1px solid #ffaa0033;border-radius:16px;padding:16px;max-width:300px;">
          <div style="font-size:22px;margin-bottom:6px;">🐢</div>
          <div style="font-weight:700;color:var(--text);margin-bottom:4px;">Slow down a bit</div>
          <div style="font-size:13px;color:var(--text3);">Too many requests. Wait a moment and try again.</div>
        </div></div>`
        return
      }

      if (errData.error === "DUPLICATE_REQUEST") {
        aiDiv.remove()
        return  // silently ignore duplicates
      }

      if (errData.error === "INPUT_TOO_LONG") {
        hideStopBtn()
        showToast("⚠️ Message too long. Max 4000 characters.")
        aiDiv.remove()
        const input = document.getElementById("message")
        if (input) input.disabled = false
        return
      }

      if (errData.error === "MODEL_LOCKED") {
        hideStopBtn()
        aiDiv.innerHTML = `
          <div class="aiContent">
            <div class="ai-bubble" style="background:#1a0a00;border:1px solid #ff880033;border-radius:16px;padding:20px;text-align:center;max-width:300px;">
              <div style="font-size:28px;margin-bottom:8px;">🔒</div>
              <div style="font-weight:700;color:var(--text);margin-bottom:6px;">Model not available on your plan</div>
              <div style="font-size:13px;color:var(--text3);margin-bottom:16px;">${errData.message || "Upgrade to access this model."}</div>
              <a href="pricing.html" style="display:inline-block;padding:10px 20px;background:linear-gradient(135deg,#ff8800,#ffaa00);border-radius:10px;color:#000;font-weight:700;text-decoration:none;font-size:13px;">Upgrade Plan</a>
            </div>
          </div>`
        return
      }

      if (errData.error === "MESSAGE_LIMIT") {
        const waitMins = errData.waitMins || 0
        const plan = errData.plan || "free"
        const isForever = waitMins > 10000
        const waitText = isForever
          ? "Upgrade your plan to continue chatting."
          : waitMins > 0
          ? `Resets in ${Math.ceil(waitMins)} minutes.`
          : "Upgrade your plan."

        aiDiv.innerHTML = `
          <div class="aiContent">
            <div style="background:#1a0800;border:1px solid #ff440033;border-radius:16px;padding:20px;text-align:center;max-width:300px;">
              <div style="font-size:32px;margin-bottom:10px;">⏳</div>
              <div style="font-weight:700;color:white;margin-bottom:6px;font-size:16px;">Message limit reached</div>
              <div style="font-size:13px;color:#888;margin-bottom:4px;">${waitText}</div>
              <div style="font-size:12px;color:#555;margin-bottom:16px;">Free plan: 25 msgs total, then 8/session</div>
              <a href="pricing.html" style="display:inline-block;padding:10px 24px;background:linear-gradient(135deg,#00cc6a,#00aaff);border-radius:20px;color:white;font-size:14px;font-weight:700;text-decoration:none;">⚡ Upgrade Now</a>
            </div>
          </div>
        `
        // Re-enable send button so user can try upgrading
        const sendBtn = document.getElementById("sendBtn")
        const msgInput = document.getElementById("message")
        if (sendBtn) { sendBtn.disabled = false; sendBtn.style.opacity = "1" }
        if (msgInput) { msgInput.disabled = false; msgInput.placeholder = "Upgrade to continue..." }
        hideStopBtn()
        return
      }

      // Other errors - re-enable input
      const sendBtn2 = document.getElementById("sendBtn")
      const msgInput2 = document.getElementById("message")
      if (sendBtn2) { sendBtn2.disabled = false; sendBtn2.style.opacity = "1" }
      if (msgInput2) { msgInput2.disabled = false }
      const msg = errData.message || errData.error || "Something went wrong"
      aiDiv.innerHTML = `
        <div class="ai-bubble" style="color:#ff8844;">⚠️ ${msg}. Please try again.</div>
      `
      hideStopBtn()
      return
    }

    const chatIdFromHeader = res.headers.get("x-chat-id")
    if (!currentChatId && chatIdFromHeader) {
      currentChatId = chatIdFromHeader
      localStorage.setItem("datta_last_chat", currentChatId)
    }

    // Handle non-OK status BEFORE rendering any bubble — prevents conflict
    if (!res.ok) {
      let errBody = {}
      try { errBody = await res.json() } catch(e) {}
      if (res.status === 504) {
        aiDiv.innerHTML = `<div class="aiContent"><div class="ai-bubble" style="background:#110a0a;border:1px solid #ff444422;"><div style="color:#ff8888;font-weight:600;margin-bottom:8px;">⏱️ Server timeout</div><div style="color:#888;font-size:13px;margin-bottom:12px;">This task was too large. Try breaking it into smaller parts.</div></div></div>`
      } else {
        const errMsg = errBody.message || errBody.error || "Request failed (" + res.status + ")"
        aiDiv.innerHTML = `<div class="aiContent"><div class="ai-bubble" style="color:#ff8844;">⚠️ ${errMsg}. Please try again.</div></div>`
      }
      hideStopBtn()
      return
    }

    // Mark all thinking steps as done before replacing
    const thinkBlock = document.getElementById("thinkingBlock")
    if (thinkBlock) {
      const allSteps = thinkBlock.querySelectorAll(".thinkStep")
      allSteps.forEach(s => {
        s.style.opacity = "0.4"
        const loader = s.querySelector(".thinkStepLoader")
        if (loader) loader.innerHTML = '<span style="color:#00ff88;font-size:11px;">✓</span>'
      })
      const orb = thinkBlock.querySelector(".thinkingOrb")
      if (orb) { orb.style.background = "#00ff88"; orb.style.animation = "none" }
      // Brief pause then swap
      await new Promise(r => setTimeout(r, 300))
    }

    // Generate unique messageId for this response
    const msgId = "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2,7)
    const _selModel = localStorage.getItem("datta_model_key") || "d21"

    // Replace typing indicator with response bubble
    aiDiv.innerHTML = `
      <div class="aiContent">
        <div class="ai-bubble">
          <span class="stream"></span>
        </div>
        <div class="aiActions" data-msg-id="${msgId}" data-model="${_selModel}">
          <button class="actionBtn" title="Copy" onclick="copyText(this)"><i data-lucide="copy"></i></button>
          <button class="actionBtn" title="Speak" onclick="speakText(this)"><i data-lucide="volume-2"></i></button>
          <button class="actionBtn" title="Regenerate" onclick="regenerateFrom(this)"><i data-lucide="refresh-ccw"></i></button>
          <button class="actionBtn" title="Download" onclick="downloadAsPDF(this)"><i data-lucide="file-down"></i></button>
          <div class="actionDivider"></div>
          <button class="actionBtn likeBtn" title="Good response" onclick="likeMsg(this)"><i data-lucide="thumbs-up"></i></button>
          <button class="actionBtn dislikeBtn" title="Bad response — give feedback" onclick="dislikeMsg(this)"><i data-lucide="thumbs-down"></i></button>
        </div>
        <div class="ai-disclaimer">Datta AI can make mistakes. Please verify important information.</div>
      </div>
    `

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let streamText = ""
    let span = aiDiv.querySelector(".stream")

    // Show "still working" indicator for large tasks after 8 seconds
    var stillWorkingTimer = null
    if (willBuildLarge || willCode) {
      stillWorkingTimer = setTimeout(() => {
        if (!isGenerating) return
        const bubble = aiDiv.querySelector(".ai-bubble")
        if (bubble && bubble.textContent.length < 100) {
          const workingEl = document.createElement("div")
          workingEl.id = "stillWorkingMsg"
          workingEl.style.cssText = "color:var(--text3);font-size:13px;padding:6px 0;display:flex;align-items:center;gap:8px;"
          workingEl.innerHTML = "<span style='width:7px;height:7px;border-radius:50%;background:var(--accent);display:inline-block;animation:orbPulse 1s infinite;'></span> Still working on it — building your complete app..."
          bubble.parentNode.insertBefore(workingEl, bubble)
        }
      }, 8000)
    }

    // ── TYPING STATE ──────────────────────────────────
    let typingActive = true      // false = user stopped typing animation
    let typingDone = false       // true = all chunks received from server
    let fullText = ""            // complete text from server
    let displayedLen = 0         // how many chars typed so far
    const CHAR_DELAY = 18        // ms per character (natural speed)

    // ── TYPING ANIMATION ─────────────────────────────
    async function runTyping() {
      // Reset global stop flag at start of each new response
      window._stopTyping = false

      while (typingActive) {
        // Check global stop flag — set by stopGeneration()
        if (window._stopTyping) {
          typingActive = false
          break
        }
        if (displayedLen < fullText.length) {
          // Type next chunk — grab multiple chars if behind
          const lag = fullText.length - displayedLen
          const step = lag > 80 ? 6 : lag > 30 ? 3 : 1
          displayedLen = Math.min(displayedLen + step, fullText.length)

          const visible = safeContent(fullText.slice(0, displayedLen))
          span.innerHTML = marked.parse(visible) + '<span class="typingCursor">|</span>'
          scrollBottom()

          // Detect auto-switch model pill
          if (visible.includes("Switching to **Datta 5.4**") || visible.includes("switching you to Datta 5.4")) {
            const pill = document.getElementById("activeModelName")
            if (pill && pill.textContent !== "Datta 5.4") {
              pill.textContent = "Datta 5.4"
              pill.style.color = "#ff6644"
              setTimeout(() => { pill.style.color = "" }, 3000)
            }
          }

          await new Promise(r => setTimeout(r, CHAR_DELAY))
        } else if (typingDone) {
          // All chars typed and all chunks received — done
          break
        } else {
          // Waiting for more chunks from server
          await new Promise(r => setTimeout(r, 30))
        }
      }

      // Final clean render — remove cursor
      if (typingActive) {
        span.innerHTML = marked.parse(safeContent(fullText.slice(0, displayedLen)))
      } else {
        // Stopped by user — show what was typed so far
        const user = JSON.parse(localStorage.getItem("datta_user") || "{}")
        const name = user.username || "you"
        span.innerHTML = marked.parse(safeContent(fullText.slice(0, displayedLen))) +
          '<div class="stoppedMsg">Response stopped by ' + name + '</div>'
      }
      lucide.createIcons()
    }

    // Start typing animation immediately
    runTyping()

    // ── READ SERVER CHUNKS ────────────────────────────
    while (true) {
      if (!controller) {
        // User aborted — stop typing
        typingActive = false
        typingDone = true
        break
      }

      // Check abort BEFORE reading next chunk — instant stop
      if (window._stopTyping || !controller || controller.signal.aborted) {
        typingActive = false
        break
      }

      const { done, value } = await reader.read()
      if (done) break

      // Check abort again AFTER read returns (read can block)
      if (window._stopTyping || !controller || controller.signal.aborted) {
        typingActive = false
        break
      }

      const chunk = decoder.decode(value)
      if (chunk === "") continue

      if (chunk.includes("[object Object]") || chunk.includes("[object object]")) {
        console.warn("[CHUNK DEBUG] [object Object] in chunk")
      }

      if (chunk.includes("CHATID")) {
        const parts = chunk.split("CHATID")
        if (parts[0]) fullText += safeContent(parts[0])
        currentChatId = (parts[1] || "").trim()
        // Stream is complete — signal typing loop
        typingDone = true
      } else {
        const cleanChunk = safeContent(chunk)
        if (cleanChunk.trim()) fullText += cleanChunk
      }
    }

    // Signal typing loop that server is done
    // Note: typingDone=false here is normal — stream ends when CHATID chunk arrives
    // which sets typingDone implicitly via the break below
    typingDone = true

    // Wait for typing to finish (or be stopped)
    while (typingActive && displayedLen < fullText.length) {
      await new Promise(r => setTimeout(r, 50))
    }

    // Use fullText for saving (not displayed text)
    streamText = fullText

    // Inject Run App button AFTER DOM is fully rendered
    setTimeout(() => injectRunAppButton(aiDiv, fullText), 100)

    // Add action buttons to user messages after generation
    chatBox.querySelectorAll(".user-bubble, .userBubble").forEach(bubble => {
      if (!bubble.closest(".msg-row, .messageRow")?.querySelector(".userActions, .user-actions")) {
        const row = bubble.closest(".msg-row, .messageRow")
        const txt = bubble.textContent.trim()
        const actions = document.createElement("div")
        actions.className = "userActions"
        actions.innerHTML = `
          <button class="uaBtn" title="Copy" onclick="navigator.clipboard.writeText('${txt.replace(/'/g,"\'")}');showToast('Copied!')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <button class="uaBtn" title="Edit & resend" onclick="editMessage(this)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="uaBtn" title="Retry" onclick="retryMessage(this)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>
          </button>
        `
        row.appendChild(actions)
      }
    })

    lucide.createIcons()

    // Trim DOM — prevent memory leak on very long conversations
    const _allRows = chatBox ? chatBox.querySelectorAll(".msg-row") : []
    if (_allRows.length > 60) {
      for (let _i = 0; _i < _allRows.length - 60; _i++) _allRows[_i].remove()
    }

    hideStopBtn()
    loadSidebar()

    // Clear still working indicator when done
    if (typeof stillWorkingTimer !== "undefined" && stillWorkingTimer) clearTimeout(stillWorkingTimer)
    const _swMsg = document.getElementById("stillWorkingMsg")
    if (_swMsg) _swMsg.remove()

    // ── ARTIFACT DETECTION ── Auto-open artifact panel for large code blocks
    if (typeof detectAndOpenArtifact === "function" && streamText && streamText.length > 300) {
      const hasLargeCode = (streamText.match(/```[\s\S]*?```/g) || []).some(b => b.length > 400)
      if (hasLargeCode) {
        setTimeout(() => detectAndOpenArtifact(streamText), 400)
      }
    }

    refreshUsageCounter()  // update X/20 counter after each successful response

  } catch (err) {
    if (err.name === "AbortError") {
      hideStopBtn()
      const sendBtn = document.getElementById("sendBtn")
      const msgInput = document.getElementById("message")
      if (sendBtn) { sendBtn.disabled = false; sendBtn.style.opacity = "1" }
      if (msgInput) { msgInput.disabled = false }
      return
    }

    // Auto retry up to 3 times silently
    console.error("Chat error:", err.message)
    const retryCount = (window._retryCount || 0) + 1
    window._retryCount = retryCount

    if (retryCount <= 3) {
      // Update thinking block to show retrying
      const tb = aiDiv.querySelector(".thinkingBlock")
      if (tb) {
        const title = tb.querySelector(".thinkingTitle")
        if (title) title.textContent = "Retrying " + retryCount + "/3"
      }
      // Wait then retry automatically
      await new Promise(r => setTimeout(r, 5000))
      // Ping server to wake it
      fetch(SERVER + "/ping").catch(() => {})
      await new Promise(r => setTimeout(r, 2000))
      // Retry
      hideStopBtn()
      const sendBtn = document.getElementById("sendBtn")
      const msgInput = document.getElementById("message")
      if (sendBtn) { sendBtn.disabled = false; sendBtn.style.opacity = "1" }
      if (msgInput) { msgInput.disabled = false }
      // Remove the thinking div and resend
      aiDiv.remove()
      const inp = document.getElementById("message")
      if (inp && window.lastUserMsg) {
        inp.value = window.lastUserMsg
        send()
      }
    } else {
      window._retryCount = 0
      hideStopBtn()
      const sendBtn = document.getElementById("sendBtn")
      const msgInput = document.getElementById("message")
      if (sendBtn) { sendBtn.disabled = false; sendBtn.style.opacity = "1" }
      if (msgInput) { msgInput.disabled = false }

      // If partial text was received, show it instead of error
      const streamSpan = aiDiv?.querySelector(".stream")
      const partialText = streamSpan?.textContent?.trim() || ""
      if (partialText.length > 80) {
        // We have partial content — keep it, just add a retry note
        const noteEl = document.createElement("div")
        noteEl.className = "stoppedMsg"
        noteEl.innerHTML = `⚠️ Response cut short. <button onclick="retryLastMsg()" style="background:none;border:none;color:var(--accent);cursor:pointer;text-decoration:underline;font-size:12px;">Retry for more</button>`
        const aiBubble = aiDiv.querySelector(".ai-bubble, .aiContent")
        if (aiBubble) aiBubble.appendChild(noteEl)
      } else {
        aiDiv.innerHTML = `
          <div class="aiContent">
            <div class="ai-bubble" style="background:#110a0a;border:1px solid #ff444422;">
              <div style="color:#ff8888;font-size:15px;font-weight:600;margin-bottom:8px;">⚠️ Response failed</div>
              <div style="color:#888;font-size:13px;margin-bottom:14px;">Server may be busy. Please try again.</div>
              <button onclick="this.closest('.msg-row, .messageRow')?.remove();document.getElementById('message').value=window.lastUserMsg||'';send()"
                style="padding:8px 18px;background:#00ff8822;border:1px solid #00ff8844;border-radius:10px;color:#00ff88;font-size:13px;cursor:pointer;font-family:inherit;">
                🔄 Retry
              </button>
            </div>
          </div>
        `
      }
    }
  }
}


// ─── LOAD SIDEBAR ─────────────────────────────────────────────────────────────
let sidebarFixDone = false

async function loadSidebar() {
  try {
    const res = await fetch(SERVER + "/chats", { headers: { "Authorization": "Bearer " + getToken() } })

    // If 401 redirect to login
    if (res.status === 401) {
      localStorage.removeItem("datta_token")
      localStorage.removeItem("datta_user")
      window.location.href = "login.html"
      return
    }

    const data = await res.json()
    const chats = Array.isArray(data) ? data : []
    const history = document.getElementById("history")
    if (!history) return
    history.innerHTML = ""

    // Auto-fix bad titles once per session
    if (!sidebarFixDone && chats.length > 0) {
      sidebarFixDone = true
      const badTitles = ["hi","hii","hiii","hello","hey","helo","hai","new conversation","new chat"]
      const hasBad = chats.some(c => badTitles.includes(c.title.toLowerCase().trim()))
      if (hasBad) {
        fetch(SERVER + "/chats/fix-titles", { headers: { "Authorization": "Bearer " + getToken() },
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: getToken() })
        }).then(r => r.json()).then(d => {
          if (d.fixed > 0) {
            console.log("Fixed", d.fixed, "chat titles")
            loadSidebar() // Reload with fixed titles
          }
        }).catch(() => {})
      }
    }

    chats.forEach(chat => {
      let div = document.createElement("div")
      div.className = "chat-item"
      div.setAttribute("data-chat-id", chat._id)
      div.innerHTML = `
        <svg class="chat-item-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.4;flex-shrink:0;">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <div class="chat-item-title" title="${chat.title}">${chat.title}</div>
        <button class="chat-item-menu" data-id="${chat._id}" data-title="${chat.title.replace(/"/g,'&quot;')}" onclick="openChatMenu(event,this)" title="More options">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="5" r="1" fill="currentColor"/>
            <circle cx="12" cy="12" r="1" fill="currentColor"/>
            <circle cx="12" cy="19" r="1" fill="currentColor"/>
          </svg>
        </button>
      `
      div.onclick = (e) => {
        if (e.target.closest(".chat-item-menu")) return
        openChat(chat._id)
      }
      history.appendChild(div)
    })

    // Restore last chat every time
    const lastChatId = localStorage.getItem("datta_last_chat")
    if (lastChatId && chats.length > 0 && !currentChatId) {
      const exists = chats.some(c => c._id === lastChatId)
      if (exists) {
        openChat(lastChatId)
        setTimeout(() => {
          document.querySelectorAll(".chat-item").forEach(d => d.classList.remove("active"))
          const activeDiv = history.querySelector("[data-chat-id='" + lastChatId + "']")
          if (activeDiv) activeDiv.classList.add("active")
        }, 200)
      } else {
        localStorage.removeItem("datta_last_chat")
        showWelcome()
      }
    } else if (!lastChatId && !currentChatId) {
      showWelcome()
    }
  } catch(e) {
    console.error("Sidebar error:", e.message)
  }
}


// ─── OPEN CHAT ────────────────────────────────────────────────────────────────
async function openChat(chatId) {
  currentChatId = chatId
  chatBox.innerHTML = ""
  hideWelcome()

  const res = await fetch(SERVER + "/chat/" + chatId, { headers: { "Authorization": "Bearer " + getToken() } })
  const messages = await res.json()

  messages.forEach(m => {
    if (m.role === "user") {
      var msgContent = safeContent(m.content)
      // Show image icon if message was an image upload
      var isImageMsg = msgContent.startsWith("📷") || msgContent.includes("(📷") || msgContent.startsWith("[Image:")
      var displayContent = msgContent.replace(/\[Image: (.+?)\]/g, "📷 $1")
      chatBox.innerHTML += `
        <div class="msg-row user-row">
          <div class="user-bubble" style="${isImageMsg ? "opacity:0.85;" : ""}">${displayContent}</div>
        </div>
      `
    } else {
      var aiContent = m.content || ""
      // Skip empty messages
      if (!aiContent.trim()) return
      chatBox.innerHTML += `
        <div class="msg-row">
          <div class="aiContent">
            <div class="ai-bubble">${marked.parse(safeContent(aiContent))}</div>
            <div class="aiActions">
              <button class="actionBtn" title="Copy" onclick="copyText(this)"><i data-lucide="copy"></i></button>
              <button class="actionBtn" title="Speak" onclick="speakText(this)"><i data-lucide="volume-2"></i></button>
              <button class="actionBtn" title="Regenerate" onclick="regenerateFrom(this)"><i data-lucide="refresh-cw"></i></button>
              <div class="actionDivider"></div>
              <button class="actionBtn likeBtn" title="Good response" onclick="likeMsg(this)"><i data-lucide="thumbs-up"></i></button>
              <button class="actionBtn dislikeBtn" title="Bad response" onclick="dislikeMsg(this)"><i data-lucide="thumbs-down"></i></button>
            </div>
            <div class="ai-disclaimer">Datta AI can make mistakes. Verify important info.</div>
          </div>
        </div>
      `
    }
  })

  scrollBottom()
  lucide.createIcons()
}


// ─── DELETE CHAT ──────────────────────────────────────────────────────────────
// ── CHAT ITEM CONTEXT MENU ────────────────────────────────────────────────────
function openChatMenu(e, btn) {
  e.stopPropagation()
  // Remove any existing menu
  const existing = document.getElementById("chatContextMenu")
  if (existing) existing.remove()

  const chatId    = btn.getAttribute("data-id")
  const chatTitle = btn.getAttribute("data-title")

  const menu = document.createElement("div")
  menu.id = "chatContextMenu"
  menu.style.cssText = `
    position:fixed;
    background:var(--bg2);
    border:1px solid var(--border);
    border-radius:10px;
    padding:4px;
    z-index:9999;
    min-width:160px;
    box-shadow:0 8px 24px rgba(0,0,0,0.4);
    font-size:13px;
  `

  menu.innerHTML = `
    <div class="ctx-item" onclick="startRename('${chatId}','${chatTitle.replace(/'/g,"\'")}');document.getElementById('chatContextMenu').remove()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      Rename
    </div>
    <div class="ctx-item ctx-delete" onclick="confirmDelete(null,'${chatId}');document.getElementById('chatContextMenu').remove()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
      Delete
    </div>
  `

  // Position near button
  const rect = btn.getBoundingClientRect()
  menu.style.top  = (rect.bottom + 4) + "px"
  menu.style.left = Math.min(rect.left, window.innerWidth - 180) + "px"

  document.body.appendChild(menu)

  // Close on outside click
  setTimeout(() => {
    document.addEventListener("click", function closeMenu() {
      const m = document.getElementById("chatContextMenu")
      if (m) m.remove()
      document.removeEventListener("click", closeMenu)
    })
  }, 10)
}

async function startRename(chatId, currentTitle) {
  const newTitle = prompt("Rename chat:", currentTitle)
  if (!newTitle || newTitle.trim() === currentTitle) return
  try {
    await fetch(SERVER + "/chat/" + chatId + "/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim(), token: getToken() })
    })
    loadSidebar()
  } catch(e) {
    showToast("Rename failed")
  }
}

function confirmDelete(e, id) {
  if (e && e.stopPropagation) e.stopPropagation()
  if (e && e.preventDefault) e.preventDefault()
  // Find chat item - works from event target or from context menu (null event)
  const chatItem = (e && e.target)
    ? e.target.closest(".chat-item, .chatItem")
    : document.querySelector(".chat-item[data-chat-id='" + id + "'], .chatItem[data-chat-id='" + id + "']")
  if (!chatItem) {
    // Called from context menu - delete directly
    deleteChat(id, null)
    return
  }

  // Already confirming
  if (chatItem.querySelector(".deleteConfirm")) {
    deleteChat(id, chatItem)
    return
  }

  const confirm = document.createElement("div")
  confirm.className = "deleteConfirm"
  confirm.innerHTML = `
    <span style="font-size:12px;color:#ff6666;">Delete?</span>
    <button onclick="deleteChat('${id}', this.closest('.chatItem'))" style="padding:2px 8px;background:#ff4444;border:none;border-radius:6px;color:white;font-size:11px;cursor:pointer;font-weight:700;">Yes</button>
    <button onclick="this.parentElement.remove()" style="padding:2px 8px;background:#222;border:none;border-radius:6px;color:#aaa;font-size:11px;cursor:pointer;">No</button>
  `
  confirm.style.cssText = "display:flex;align-items:center;gap:6px;padding:4px 0;"
  chatItem.appendChild(confirm)

  // Auto remove after 3 seconds
  setTimeout(() => confirm.remove(), 3000)
}

async function deleteChat(id, chatItem) {
  try {
    if (chatItem) chatItem.style.opacity = "0.4"
    await fetch(SERVER + "/chat/" + id, { headers: { "Authorization": "Bearer " + getToken() },
      method: "DELETE"
    })
    if (chatItem) chatItem.remove()
    if (currentChatId === id) {
      currentChatId = null
      document.getElementById("chat").innerHTML = ""
      showWelcome()
    }
    loadSidebar()
  } catch(e) {
    if (chatItem) chatItem.style.opacity = "1"
  }
}


// ─── COPY TEXT ────────────────────────────────────────────────────────────────
function copyText(btn) {
  const bubble = getAiBubble(btn)
  if (!bubble) return
  const text = bubble.innerText || bubble.textContent
  navigator.clipboard.writeText(text).then(() => showToast("Copied!"))
}


// ─── SPEAK TEXT ───────────────────────────────────────────────────────────────
function speakText(btn) {
  const bubble = getAiBubble(btn)
  if (!bubble) return
  const text = bubble.innerText || bubble.textContent
  const speech = new SpeechSynthesisUtterance(text)
  speech.lang = "en-US"
  speechSynthesis.speak(speech)
}


// ─── STOP VOICE ───────────────────────────────────────────────────────────────
function stopVoice() {
  // Stop TTS speaking immediately
  if (window.speechSynthesis) window.speechSynthesis.cancel()
  // Stop the AI stream fetch
  stopGeneration()
  // Stop karaoke timer
  if (window._karaokeInterval) {
    clearInterval(window._karaokeInterval)
    window._karaokeInterval = null
  }
  // Reset voice UI state
  isSpeaking = false
  if (voiceActive) setVA("idle")
  const chip = document.getElementById("vaEmotionChip")
  if (chip) chip.style.display = "none"
  const kEl = document.getElementById("vaKaraoke")
  if (kEl) kEl.innerHTML = ""
}


// ─── REGENERATE ───────────────────────────────────────────────────────────────
async function regenerateFrom(btn) {
  // Guard: no double regenerate
  if (isGenerating) return

  const row = getMsgRow(btn)
  if (!row) return

  // Find the user message — walk backwards from this AI row
  const allRows = Array.from(document.querySelectorAll(".msg-row, .messageRow"))
  const rowIdx  = allRows.indexOf(row)
  let userRow = null
  for (let i = rowIdx - 1; i >= 0; i--) {
    if (allRows[i].querySelector(".user-bubble, .userBubble")) { userRow = allRows[i]; break }
  }
  if (!userRow) return

  const text = (userRow.querySelector(".user-bubble, .userBubble") || {}).innerText?.trim() || ""
  if (!text) return

  // Remove ONLY this AI row — keep user message
  row.remove()

  // Put text in input and send — reuses the full send() pipeline
  // This gives typing animation, stop button, error handling, FormData — everything
  window.lastUserMsg = text
  const input = document.getElementById("message")
  if (input) input.value = text
  send()
}
window.regenerateFrom = regenerateFrom


// ─── VOICE INPUT ──────────────────────────────────────────────────────────────
// MIC BUTTON - inline listener like Google (just types in input, does NOT open overlay)
let _micRecognition = null
let _micActive = false

function startVoiceListener() {
  if (_micActive) {
    stopVoiceListener()
    return
  }

  if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
    showToast("Voice not supported in this browser")
    return
  }

  const input = document.getElementById("message")
  const micBtn = document.getElementById("micBtn")
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  _micRecognition = new SR()
  _micRecognition.lang = localStorage.getItem("datta_voice_lang") || "en-IN"
  _micRecognition.continuous = false
  _micRecognition.interimResults = true

  _micActive = true

  // Show listening state on mic button
  if (micBtn) {
    micBtn.style.color = "#ff4444"
    micBtn.style.transform = "scale(1.2)"
  }
  if (input) {
    input.placeholder = "🎤 Listening..."
    input.style.color = "#00ff88"
  }

  _micRecognition.onresult = (e) => {
    let interim = ""
    let final = ""
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript
      else interim += e.results[i][0].transcript
    }
    if (input) input.value = final || interim
    if (final) {
      stopVoiceListener()
      setTimeout(() => send(), 300)
    }
  }

  _micRecognition.onerror = (e) => {
    stopVoiceListener()
    showToast("Voice error: " + e.error)
  }

  _micRecognition.onend = () => {
    stopVoiceListener()
  }

  _micRecognition.start()
}

function stopVoiceListener() {
  _micActive = false
  const input = document.getElementById("message")
  const micBtn = document.getElementById("micBtn")
  if (micBtn) {
    micBtn.style.color = ""
    micBtn.style.transform = ""
  }
  if (input) {
    input.placeholder = "Ask Datta AI anything..."
    input.style.color = ""
  }
  if (_micRecognition) {
    try { _micRecognition.stop() } catch(e) {}
    _micRecognition = null
  }
}


// ─── TOGGLE MENU ─────────────────────────────────────────────────────────────
function toggleMenu(e, id) {
  e.stopPropagation()
  document.querySelectorAll(".chatMenu").forEach(m => m.style.display = "none")
  const menu = document.getElementById("menu-" + id)
  if (menu) menu.style.display = "block"
}

window.onclick = () => {
  document.querySelectorAll(".chatMenu").forEach(m => m.style.display = "none")
}


// ─── SCROLL ───────────────────────────────────────────────────────────────────
function scrollBottom() {
  if (userScrolledUp) return
  chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: "smooth" })
}

chatBox.addEventListener("scroll", () => {
  const distFromBottom = chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight
  userScrolledUp = distFromBottom > 150
  if (scrollBtn) {
    if (userScrolledUp) scrollBtn.classList.add("show")
    else scrollBtn.classList.remove("show")
  }
})

if (scrollBtn) {
  scrollBtn.addEventListener("click", () => {
    userScrolledUp = false
    scrollBottom()
  })
}


// ─── WELCOME HELPERS ──────────────────────────────────────────────────────────
function hideWelcome() {
  document.body.classList.add("chat-started")
  const w = document.getElementById("welcomeScreen")
  if (w) w.style.display = "none"
}

function showWelcome() {
  if (currentChatId) return
  document.body.classList.remove("chat-started")
  const w = document.getElementById("welcomeScreen")
  if (w) w.style.display = "flex"
  loadSmartSuggestions()
}


// ─── FILL PROMPT ──────────────────────────────────────────────────────────────
function fillPrompt(text) {
  document.getElementById("message").value = text
  hideWelcome()
  send()
}

window.fillPrompt = fillPrompt


// ─── SUGGEST BUTTONS ──────────────────────────────────────────────────────────
document.querySelectorAll(".suggestBtn").forEach(btn => {
  btn.addEventListener("click", () => {
    const text = btn.getAttribute("data-text")
    document.getElementById("message").value = text
    hideWelcome()
    send()
  })
})


// ─── ENTER KEY + AUTO-RESIZE ─────────────────────────────────────────────────
;(function() {
  var ta = document.getElementById("message")
  if (!ta) return

  function autoResize() {
    ta.style.height = "auto"           // collapse first so scrollHeight is accurate
    var sh = ta.scrollHeight
    var maxH = 200
    if (sh <= maxH) {
      ta.style.height    = sh + "px"
      ta.style.overflowY = "hidden"
    } else {
      ta.style.height    = maxH + "px"
      ta.style.overflowY = "auto"
    }
  }

  // Expose so send() can reset height after clearing input
  window.taAutoResize = autoResize

  // Fire on every keystroke, paste, cut
  ta.addEventListener("input",   autoResize)
  ta.addEventListener("paste",   function() { setTimeout(autoResize, 0) })
  ta.addEventListener("cut",     function() { setTimeout(autoResize, 0) })

  // Enter = send | Shift+Enter = newline
  ta.addEventListener("keydown", function(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (!isGenerating) send()
    }
  })

  // Set correct initial height on load
  autoResize()
})()


// ─── SIDEBAR TOGGLE ───────────────────────────────────────────────────────────

// ─── SAVE CHAT TITLE (local fallback) ────────────────────────────────────────
function saveChatTitle(title) {
  const history = document.getElementById("history")
  if (!history) return
  const div = document.createElement("div")
  div.className = "chat-item"
  div.innerHTML = `<span class="chatTitle">${title}</span>`
  history.prepend(div)
}


// ─── SEARCH CHATS ────────────────────────────────────────────────────────────
// ─── INIT ─────────────────────────────────────────────────────────────────────
window.send = send
loadSidebar()

window.addEventListener("DOMContentLoaded", function() {
  // Init send/stop button
  setGenerating(false)
  // Init theme buttons to reflect current theme
  const t = localStorage.getItem("datta_theme") || "dark"
  setTheme(t, true)
})

// Load smart suggestions for welcome screen
async function loadSmartSuggestions() {
  const chips = document.getElementById("suggestionChips")
  if (!chips) return
  // Just use static chips - no API call needed
  // Dynamic chips from server were causing [object Object] error
  chips.innerHTML = `
    <button class="sugg-card" onclick="useChip(this)"><span class="sugg-icon">🌐</span><span class="sugg-text">Build me a portfolio website</span></button>
    <button class="sugg-card" onclick="useChip(this)"><span class="sugg-icon">🐍</span><span class="sugg-text">Write a Python web scraper</span></button>
    <button class="sugg-card" onclick="useChip(this)"><span class="sugg-icon">🧠</span><span class="sugg-text">Explain machine learning</span></button>
    <button class="sugg-card" onclick="useChip(this)"><span class="sugg-icon">💼</span><span class="sugg-text">Create a business plan</span></button>
  `
}
window.loadSmartSuggestions = loadSmartSuggestions

// SHOW SIDEBAR SECTION
function showSection(name) {
  // Hide all sections
  document.querySelectorAll(".sidebarSection").forEach(s => s.style.display = "none")
  // Show selected
  const el = document.getElementById("section-" + name)
  if (el) el.style.display = "flex"

  // Update active nav
  document.querySelectorAll(".navItem").forEach(b => b.classList.remove("active"))
  const btns = document.querySelectorAll(".navItem")
  const idx = ["chats","projects","artifacts"].indexOf(name)
  if (btns[idx]) btns[idx].classList.add("active")

  // Show/hide recents label and search
  const showRecents = name === "chats"
  const recentsLabel = document.getElementById("recentsLabel")
  const search = document.getElementById("search")
  if (recentsLabel) recentsLabel.style.display = showRecents ? "block" : "none"
  if (search) search.style.display = showRecents ? "block" : "none"
}

window.showSection = showSection

// LOGOUT
function logout() {
  localStorage.removeItem("datta_token")
  localStorage.removeItem("datta_user")
  window.location.href = "login.html"
}

window.logout = logout

// ── SETTINGS ─────────────────────────────────────────────────────────────────

function openSettings() {
  if (typeof event !== "undefined" && event && event.stopPropagation) event.stopPropagation()
  // Go to the new settings page
  window.location.href = "settings.html"
}

function closeSettings() {
  const modal = document.getElementById("settingsModal")
  if (modal) modal.classList.remove("show")
  clearSettingsMsg()
}

function switchSettingsTab(tab) {
  // Support both old (.sTab/.sTabContent) and new (.s-tab/.s-tab-pane) class names
  document.querySelectorAll(".sTab, .s-tab").forEach(t => t.classList.remove("active"))
  document.querySelectorAll(".sTabContent, .s-tab-pane").forEach(c => c.classList.remove("active"))

  // Activate the clicked tab button
  const tabBtn = document.getElementById("stab-" + tab)
  if (tabBtn) tabBtn.classList.add("active")

  // Activate the tab content pane
  const pane = document.getElementById("tab-" + tab)
  if (pane) pane.classList.add("active")

  clearSettingsMsg()
}

function showSettingsMsg(text, type) {
  const el = document.getElementById("settingsMsg")
  if (!el) return
  el.textContent = text
  el.className = "s-msg " + (type === "success" ? "success" : "error")
  setTimeout(() => { el.className = "s-msg"; el.textContent = "" }, 3000)
}

function clearSettingsMsg() {
  const el = document.getElementById("settingsMsg")
  if (el) { el.className = "s-msg"; el.textContent = "" }
}

function loadSettingsUI() {
  let user = {}
  try {
    const raw = localStorage.getItem("datta_user")
    if (raw && raw !== "null") user = JSON.parse(raw)
  } catch(e) {}
  const usernameInput = document.getElementById("newUsername")
  if (usernameInput) usernameInput.placeholder = user.username || "Enter new username"

  // Load theme — apply and highlight active button
  const theme = localStorage.getItem("datta_theme") || "dark"
  setTheme(theme, true)

  // Load language
  const lang = localStorage.getItem("datta_language") || "English"
  const langSelect = document.getElementById("aiLanguage")
  if (langSelect) langSelect.value = lang

  // Load notification settings
  const notifSettings = JSON.parse(localStorage.getItem("datta_notif") || "{}")
  const soundToggle = document.getElementById("soundToggle")
  const notifToggle = document.getElementById("notifToggle")
  const streamToggle = document.getElementById("streamToggle")
  if (soundToggle) soundToggle.checked = notifSettings.sound || false
  if (notifToggle) notifToggle.checked = notifSettings.notif || false
  if (streamToggle) streamToggle.checked = notifSettings.stream !== false
}

// CHANGE USERNAME
async function changeUsername() {
  const newUsername = document.getElementById("newUsername").value.trim()
  if (!newUsername) return showSettingsMsg("Please enter a username", "error")
  if (newUsername.length < 3) return showSettingsMsg("Username must be at least 3 characters", "error")

  try {
    const res = await fetch(SERVER + "/auth/update-username", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: newUsername, token: datta_token })
    })
    const data = await res.json()
    if (!res.ok) return showSettingsMsg(data.error || "Failed to update", "error")

    // Update local storage
    const user = JSON.parse(localStorage.getItem("datta_user") || "{}")
    user.username = newUsername
    localStorage.setItem("datta_user", JSON.stringify(user))

    // Update sidebar
    const nameEl = document.getElementById("profileName") || document.querySelector(".sb-profile-name")
    const avatarEl = document.getElementById("profileAvatar") || document.querySelector(".sb-avatar")
    if (nameEl) nameEl.textContent = newUsername
    if (avatarEl) avatarEl.textContent = newUsername[0].toUpperCase()

    showSettingsMsg("Username updated successfully!", "success")
  } catch (e) {
    showSettingsMsg("Server error. Try again.", "error")
  }
}

// CHANGE PASSWORD
async function changePassword() {
  const current = document.getElementById("currentPassword").value
  const newPass = document.getElementById("newPassword").value
  const confirm = document.getElementById("confirmPassword").value

  if (!current || !newPass || !confirm) return showSettingsMsg("Please fill all fields", "error")
  if (newPass.length < 6) return showSettingsMsg("New password must be at least 6 characters", "error")
  if (newPass !== confirm) return showSettingsMsg("Passwords do not match", "error")

  try {
    const res = await fetch(SERVER + "/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: newPass, token: datta_token })
    })
    const data = await res.json()
    if (!res.ok) return showSettingsMsg(data.error || "Failed to change password", "error")

    document.getElementById("currentPassword").value = ""
    document.getElementById("newPassword").value = ""
    document.getElementById("confirmPassword").value = ""
    showSettingsMsg("Password changed successfully!", "success")
  } catch (e) {
    showSettingsMsg("Server error. Try again.", "error")
  }
}

// SET THEME
function setTheme(theme, silent) {
  if (!["dark","light","eye"].includes(theme)) theme = "dark"
  localStorage.setItem("datta_theme", theme)

  // Apply to root — this triggers all CSS variables
  document.documentElement.setAttribute("data-theme", theme)
  document.body.setAttribute("data-theme", theme)

  // Topbar buttons: topThemeDark, topThemeLight, topThemeEye
  ;["Dark","Light","Eye"].forEach(t => {
    const btn = document.getElementById("topTheme" + t)
    if (btn) btn.classList.toggle("active", t.toLowerCase() === theme)
  })
  // Settings modal buttons: themeDark, themeLight, themeEye
  ;["Dark","Light","Eye"].forEach(t => {
    const btn = document.getElementById("theme" + t)
    if (btn) btn.classList.toggle("active", t.toLowerCase() === theme)
  })

  if (!silent && typeof showSettingsMsg === "function") showSettingsMsg("Theme applied!", "success")
}

// SET FONT SIZE
function setFontSize(size) {
  document.querySelectorAll(".fontBtn").forEach(b => b.classList.remove("active"))
  if (event && event.target) event.target.classList.add("active")
  const sizes = { small: "13px", medium: "15px", large: "17px" }
  const px = sizes[size] || "15px"
  // Set CSS variable — this affects all bubbles using var(--chat-font-size)
  document.documentElement.style.setProperty("--chat-font-size", px)
  // Also set directly on existing bubbles (already rendered)
  document.querySelectorAll(".ai-bubble, .aiBubble, .user-bubble, .userBubble").forEach(el => el.style.fontSize = px)
  // Save with BOTH keys so any reader finds it
  localStorage.setItem("datta_fontsize", size)
  localStorage.setItem("datta_font_size", px)
  localStorage.setItem("datta_font_size_label", size)
  showSettingsMsg("Font size: " + size, "success")
}

// SAVE LANGUAGE
function saveLanguage() {
  const lang = document.getElementById("aiLanguage").value
  localStorage.setItem("datta_language", lang)
  showSettingsMsg("AI will now respond in " + lang + "!", "success")
}

// SAVE NOTIFICATION SETTINGS
function saveNotifSettings() {
  const settings = {
    sound: document.getElementById("soundToggle").checked,
    notif: document.getElementById("notifToggle").checked,
    stream: document.getElementById("streamToggle").checked
  }
  localStorage.setItem("datta_notif", JSON.stringify(settings))
}

// DELETE ALL CHATS
async function deleteAllChats() {
  if (!confirm("Are you sure? This will delete ALL your chats permanently!")) return

  try {
    const res = await fetch(SERVER + "/chats/all", { headers: { "Authorization": "Bearer " + getToken() },
      method: "DELETE"
    })
    if (!res.ok) return showSettingsMsg("Failed to delete chats", "error")

    chatBox.innerHTML = ""
    currentChatId = null
    showWelcome()
    loadSidebar()
    showSettingsMsg("All chats deleted!", "success")
  } catch (e) {
    showSettingsMsg("Server error. Try again.", "error")
  }
}

// DELETE ACCOUNT
async function deleteAccount() {
  const password = document.getElementById("deleteAccountPassword").value
  if (!password) return showSettingsMsg("Enter your password to confirm", "error")

  if (!confirm("This will PERMANENTLY delete your account. Are you absolutely sure?")) return

  try {
    const res = await fetch(SERVER + "/auth/delete-account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, token: datta_token })
    })
    const data = await res.json()
    if (!res.ok) return showSettingsMsg(data.error || "Failed to delete account", "error")

    localStorage.clear()
    window.location.href = "login.html"
  } catch (e) {
    showSettingsMsg("Server error. Try again.", "error")
  }
}

// Apply saved theme on load
;(function() {
  // Apply theme instantly before page renders (no flash)
  const theme = localStorage.getItem("datta_theme") || "dark"
  document.body.setAttribute("data-theme", ["dark","light","eye"].includes(theme) ? theme : "dark")

  // Apply saved language
  const lang = localStorage.getItem("datta_language")
  if (lang) window.dattaLanguage = lang
})()

window.openSettings = openSettings
window.closeSettings = closeSettings
window.switchSettingsTab = switchSettingsTab
window.changeUsername = changeUsername
window.changePassword = changePassword
window.setTheme = setTheme
window.setFontSize = setFontSize
window.saveLanguage = saveLanguage
window.saveNotifSettings = saveNotifSettings
window.deleteAllChats = deleteAllChats
window.deleteAccount = deleteAccount

// LIKE / DISLIKE
function _sendFeedback(btn, type) {
  const actions  = btn.closest(".aiActions, .ai-actions")
  const msgId    = actions?.getAttribute("data-msg-id") || ""
  const model    = actions?.getAttribute("data-model") || ""
  const chatId   = currentChatId || ""
  const wasActive = btn.classList.contains("active")

  // Toggle all buttons off first
  actions?.querySelectorAll(".likeBtn, .dislikeBtn").forEach(b => {
    b.classList.remove("active")
    b.style.color = ""
    b.style.transform = ""
  })

  if (wasActive) return  // toggled off — no backend call needed

  // Highlight chosen button
  btn.classList.add("active")
  btn.style.color = type === "like" ? "#00ff88" : "#ff4444"
  btn.style.transform = "scale(1.2)"
  setTimeout(() => { btn.style.transform = "" }, 200)

  // Send to backend — fire and forget
  if (msgId) {
    fetch(SERVER + "/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: msgId, feedback: type, chatId, model, token: getToken() })
    })
    .then(r => r.json())
    .then(d => { if (d.success) console.log("[FEEDBACK]", type, msgId) })
    .catch(() => {})  // silent fail — feedback is non-critical
  }

  // Show dislike popup
  if (type === "dislike") {
    _showDislikePopup(btn, msgId, model, chatId)
  }
}

function _showDislikePopup(btn, msgId, model, chatId) {
  // Remove existing popup
  document.querySelectorAll(".dislike-popup").forEach(p => p.remove())

  const popup = document.createElement("div")
  popup.className = "dislike-popup"
  popup.style.cssText = "position:absolute;bottom:calc(100% + 8px);right:0;background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:12px 14px;min-width:220px;z-index:999;box-shadow:0 8px 24px rgba(0,0,0,0.4);"
  popup.innerHTML = `
    <div style="font-size:12px;font-weight:600;color:var(--text2);margin-bottom:8px;">What went wrong?</div>
    ${["Wrong answer","Too short","Too long","Off topic","Other"].map(reason =>
      `<button onclick="_sendDislikeReason(this,'${reason}','${msgId}','${model}')"
        style="display:block;width:100%;text-align:left;padding:6px 10px;margin:2px 0;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text2);font-size:12px;cursor:pointer;font-family:inherit;">
        ${reason}
      </button>`
    ).join("")}
    <button onclick="this.closest('.dislike-popup').remove()" style="display:block;width:100%;text-align:center;margin-top:8px;background:none;border:none;color:var(--text3);font-size:11px;cursor:pointer;font-family:inherit;">Skip</button>
  `
  // Position relative to button
  const actionsEl = btn.closest(".aiActions, .ai-actions")
  if (actionsEl) {
    actionsEl.style.position = "relative"
    actionsEl.appendChild(popup)
    // Auto-close after 6s
    setTimeout(() => popup.remove(), 6000)
  }

  // Close on outside click
  setTimeout(() => {
    document.addEventListener("click", function handler(e) {
      if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener("click", handler) }
    })
  }, 100)
}

function _sendDislikeReason(btn, reason, msgId, model) {
  btn.style.background = "rgba(255,68,68,0.15)"
  btn.style.borderColor = "rgba(255,68,68,0.4)"
  btn.style.color = "#ff4444"
  setTimeout(() => btn.closest(".dislike-popup").remove(), 800)

  // Send reason as additional feedback
  fetch(SERVER + "/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messageId: msgId + "_reason", feedback: "dislike", chatId: "", model, reason, token: getToken() })
  }).catch(() => {})
}

function likeMsg(btn)    { _sendFeedback(btn, "like") }
function dislikeMsg(btn) { _sendFeedback(btn, "dislike") }

window.likeMsg = likeMsg
window.dislikeMsg = dislikeMsg
window._sendDislikeReason = _sendDislikeReason

// Enhanced like with visual feedback
const _origLike = likeMsg
window.likeMsg = function(btn) {
  _origLike(btn)
  btn.classList.toggle("active")
  // Remove dislike active if present
  const row = btn.closest(".aiActions")
  if (row) {
    const dislikeBtn = row.querySelector(".dislikeBtn")
    if (dislikeBtn) dislikeBtn.classList.remove("active")
  }
  if (btn.classList.contains("active")) showToast("👍 Thanks for the feedback!")
}

// ── VOICE ASSISTANT (SIRI-LIKE) ──────────────────────────────────────────────

let voiceRecognition = null
let voiceSynth = window.speechSynthesis
let isListening  = false
let isSpeaking   = false
let voiceActive  = false
let voiceMuted   = false

// ── STATE MACHINE ─────────────────────────────────────────────────────────────
function setVA(state) {
  // state: idle | listening | thinking | speaking
  const overlay  = document.getElementById("voiceOverlay")
  const statusEl = document.getElementById("voiceStatus")
  const badgeEl  = document.getElementById("vaLangBadge")

  if (!overlay) return

  // Remove all state classes — CSS handles orb color + animations
  overlay.classList.remove("va-listening", "va-speaking", "va-thinking")

  const labels = { idle:"Tap to speak", listening:"Listening...", thinking:"Thinking...", speaking:"Speaking..." }
  if (statusEl) statusEl.textContent = labels[state] || ""

  if (state === "listening") {
    overlay.classList.add("va-listening")
  } else if (state === "speaking") {
    overlay.classList.add("va-speaking")
  } else if (state === "thinking") {
    overlay.classList.add("va-thinking")
  }

  // Show detected language in badge
  if (badgeEl) {
    const langMap = {
      "te-IN":"తెలుగు", "hi-IN":"हिंदी",
      "ta-IN":"தமிழ்", "kn-IN":"ಕನ್ನಡ",
      "ml-IN":"മലയാളം", "bn-IN":"বাংলা",
      "pa-IN":"ਪੰਜਾਬੀ", "gu-IN":"ગુજરાતી",
      "or-IN":"ଓଡିଆ", "ur-PK":"اردو",
      "zh-CN":"中文", "ja-JP":"日本語", "ko-KR":"한국어",
      "ru-RU":"Русский", "es-ES":"Español",
      "fr-FR":"Français", "de-DE":"Deutsch",
      "en-IN":"English", "en-US":"English"
    }
    const activeLang = window._voiceLang
    badgeEl.textContent = activeLang && activeLang !== "en-IN" ? (langMap[activeLang] || activeLang) : ""
  }
}

function setVoiceText(text) {
  const el = document.getElementById("voiceText")
  if (el) el.textContent = text
}
function setVoiceAIText(text) {
  const el = document.getElementById("voiceAIText")
  if (el) el.textContent = text
  // Clear karaoke when setting status text
  const kEl = document.getElementById("vaKaraoke")
  if (kEl && !isSpeaking) kEl.innerHTML = ""
}

// ── OPEN / CLOSE ──────────────────────────────────────────────────────────────
function openVoiceAssistant() {
  voiceActive = true
  const overlay = document.getElementById("voiceOverlay")
  if (overlay) overlay.style.display = "flex"
  setVA("idle")
  setVoiceText("")
  setVoiceAIText("")
  // Greet in user language
  setTimeout(() => {
    if (!voiceActive) return
    const savedLang = window._voiceLang || "en-IN"
    const greetings = {
      "te-IN": "నమస్కారం! నేను దత్త ఏఆఇ. మీకు ఎలా సహాయం చేయాలి?",
      "hi-IN": "नमस्ते! मैं दत्त एआई हूं। मैं आपकी कैसे मदद कर सकता हूं?",
      "ta-IN": "வணக்கம்! நான் தத்தா ஏஐ. உங்களுக்கு எப்படி உதவலாம்?",
      "kn-IN": "ನಮಸ್ಕಾರ! ನಾನು ದತ್ತ ಎಐ. ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?",
      "ml-IN": "നമസ്കാരം! ഞാൻ ദത്ത AI ആണ്‍. എങ്ങനെ സഹായിക്കട്ടെ?",
      "bn-IN": "নমস্কার! আমি দত্ত AI. আপনাকে কীভাবে সাহায্য করতে পারি?",
    }
    const greeting = greetings[savedLang] || "Hello! I am Datta AI. How can I help you?"
    speakText2(greeting)
  }, 400)
}

function closeVoiceAssistant() {
  voiceActive = false
  stopListening()
  stopSpeaking()
  const overlay = document.getElementById("voiceOverlay")
  if (overlay) overlay.style.display = "none"
}

// ── MUTE ──────────────────────────────────────────────────────────────────────
function toggleVoiceMute() {
  voiceMuted = !voiceMuted
  const btn = document.getElementById("vaMuteBtn")
  if (btn) {
    btn.style.background  = voiceMuted ? "rgba(239,68,68,0.15)" : "var(--bg2)"
    btn.style.borderColor = voiceMuted ? "rgba(239,68,68,0.4)"  : "var(--border)"
    btn.style.color       = voiceMuted ? "#ef4444" : "var(--text2)"
    btn.title = voiceMuted ? "Unmute" : "Mute"
  }
  if (voiceMuted && isSpeaking) stopSpeaking()
}

// ── LANGUAGE ──────────────────────────────────────────────────────────────────
function setVoiceLang(lang) {
  window._voiceLang = lang === "auto" ? null : lang
}

function detectLangFromText(text) {
  if (!text) return { tts: "en-IN", api: "English" }
  if (/[ఀ-౿]/.test(text)) return { tts: "te-IN", api: "Telugu" }
  if (/[ऀ-ॿ]/.test(text)) return { tts: "hi-IN", api: "Hindi" }
  if (/[஀-௿]/.test(text)) return { tts: "ta-IN", api: "Tamil" }
  if (/[ಀ-೿]/.test(text)) return { tts: "kn-IN", api: "Kannada" }
  if (/[਀-੿]/.test(text)) return { tts: "pa-IN", api: "Punjabi" }
  if (/[ঀ-৿]/.test(text)) return { tts: "bn-IN", api: "Bengali" }
  if (/[ഀ-ൿ]/.test(text)) return { tts: "ml-IN", api: "Malayalam" }
  if (/[઀-૿]/.test(text)) return { tts: "gu-IN", api: "Gujarati" }
  if (/[଀-୿]/.test(text)) return { tts: "or-IN", api: "Odia" }
  if (/[؀-ۿ]/.test(text)) return { tts: "ur-PK", api: "Urdu" }
  if (/[一-鿿]/.test(text)) return { tts: "zh-CN", api: "Chinese" }
  if (/[぀-ヿ]/.test(text)) return { tts: "ja-JP", api: "Japanese" }
  if (/[가-힯]/.test(text)) return { tts: "ko-KR", api: "Korean" }
  if (/[Ѐ-ӿ]/.test(text)) return { tts: "ru-RU", api: "Russian" }
  if (/\b(hola|gracias|c.mo|est.s)\b/i.test(text)) return { tts: "es-ES", api: "Spanish" }
  if (/\b(bonjour|merci|comment)\b/i.test(text)) return { tts: "fr-FR", api: "French" }
  if (/\b(guten|danke|bitte)\b/i.test(text)) return { tts: "de-DE", api: "German" }
  return { tts: "en-IN", api: "English" }
}

// ── LISTEN ────────────────────────────────────────────────────────────────────
function toggleVoiceListening() {
  if (isListening) stopListening()
  else             startListening()
}

function startListening() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) {
    setVoiceAIText("Voice not supported in this browser. Please use Chrome.")
    return
  }

  stopSpeaking()
  setVoiceText("")
  setVoiceAIText("")

  const langSel = document.getElementById("voiceLangSelect")
  const chosenLang = (langSel && langSel.value !== "auto") ? langSel.value : "en-IN"

  voiceRecognition = new SR()
  voiceRecognition.lang            = window._voiceLang || chosenLang
  voiceRecognition.continuous      = false
  voiceRecognition.interimResults  = true
  voiceRecognition.maxAlternatives = 1

  voiceRecognition.onstart = () => {
    isListening = true
    setVA("listening")
  }

  voiceRecognition.onresult = (e) => {
    let interim = "", final = ""
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript
      else interim += e.results[i][0].transcript
    }
    setVoiceText(final || interim)
    if (final.trim()) {
      stopListening()
      processVoiceQuery(final.trim())
    }
  }

  voiceRecognition.onerror = (e) => {
    isListening = false
    const msgs = {
      "not-allowed":  "Microphone permission denied",
      "no-speech":    "No speech detected. Tap to try again.",
      "network":      "Network error. Check connection.",
      "aborted":      ""
    }
    const msg = msgs[e.error] || ("Error: " + e.error)
    if (msg) setVoiceAIText(msg)
    setVA("idle")
  }

  voiceRecognition.onend = () => {
    isListening = false
    if (voiceActive && !isSpeaking) setVA("idle")
  }

  try { voiceRecognition.start() } catch(e) {}
}

function stopListening() {
  isListening = false
  if (voiceRecognition) {
    try { voiceRecognition.stop() } catch(e) {}
    voiceRecognition = null
  }
  if (voiceActive && !isSpeaking) setVA("idle")
}

// ── PROCESS QUERY ─────────────────────────────────────────────────────────────
async function processVoiceQuery(query) {
  if (!query.trim()) return

  // Stop/close commands
  const qLow = query.toLowerCase().trim()
  const stopCmds = ["stop", "stop it", "stop speaking", "rukk", "ruko", "band karo", "chup", "quiet"]
  const closeCmds = ["close", "exit", "bye", "goodbye", "dismiss", "close datta"]
  if (stopCmds.some(c => qLow === c || qLow.startsWith(c))) {
    stopSpeaking()
    stopKaraoke()
    setVoiceAIText("Stopped.")
    setVA("idle")
    return
  }
  if (closeCmds.some(c => qLow.includes(c))) {
    speakText2("Goodbye! Have a great day!")
    setTimeout(closeVoiceAssistant, 1800)
    return
  }

  setVA("thinking")
  setVoiceAIText("...")

  // Auto-detect language from the spoken text
  const langSel = document.getElementById("voiceLangSelect")
  const _manualLang = langSel && langSel.value !== "auto" ? langSel.value : null
  const _detected = detectLangFromText(query)
  // If manual lang selected, use it for TTS; otherwise use detected
  const _ttsLang = _manualLang || _detected.tts
  const _apiLang = _detected.api  // always auto-detect for API (server also detects Unicode)
  window._voiceLang = _ttsLang   // update TTS language

  try {
    const token = getToken()
    if (!token) {
      setVoiceAIText("Please log in first to use voice.")
      setVA("idle")
      return
    }

    const buildVoiceForm = () => {
      const formData = new FormData()
      formData.append("message", query)
      formData.append("chatId",   currentChatId || "")
      formData.append("token",    token)
      formData.append("language", _apiLang)   // pass detected language to server
      formData.append("model",    localStorage.getItem("datta_model") || "llama-3.3-70b-versatile")
      formData.append("modelKey", localStorage.getItem("datta_model_key") || "d42")
      formData.append("style",    localStorage.getItem("datta_ai_style") || "Balanced")  // user-chosen style
      formData.append("ainame",   "Datta AI")
      formData.append("voice",    "true")
      return formData
    }

    // Retry up to 3 times on server errors
    let res = null
    for (let _attempt = 1; _attempt <= 3; _attempt++) {
      try {
        if (_attempt > 1) {
          setVoiceAIText("Retrying... (attempt " + _attempt + "/3)")
          await new Promise(r => setTimeout(r, 1200 * _attempt))
        }
        res = await fetch(SERVER + "/chat", { method: "POST", body: buildVoiceForm() })
        if (res.ok) break
        if (res.status === 401 || res.status === 403) break  // auth errors — no retry
        if (_attempt === 3) {
          let errBody = ""
          try { errBody = await res.text() } catch(e) {}
          throw new Error("Server error " + res.status + ": " + errBody.slice(0, 80))
        }
      } catch(fetchErr) {
        if (_attempt === 3) throw fetchErr
        console.warn("[Voice] attempt", _attempt, "failed:", fetchErr.message)
      }
    }
    if (!res || !res.ok) {
      let errBody = ""
      try { errBody = await res.text() } catch(e) {}
      console.error("Voice fetch error:", res?.status, errBody.slice(0, 200))
      throw new Error("Server error " + (res?.status || "unknown") + ": " + errBody.slice(0, 80))
    }

    const chatIdHeader = res.headers.get("x-chat-id")
    if (!currentChatId && chatIdHeader) {
      currentChatId = chatIdHeader
      localStorage.setItem("datta_last_chat", currentChatId)
    }

    const reader  = res.body.getReader()
    const decoder = new TextDecoder()
    let fullText  = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value)
      if (chunk.includes("CHATID")) {
        const parts = chunk.split("CHATID")
        if (parts[0]) fullText += safeContent(parts[0])
        currentChatId = (parts[1] || "").trim()
        // Stream is complete — signal typing loop
        typingDone = true
        localStorage.setItem("datta_last_chat", currentChatId)
      } else {
        fullText += chunk
      }
    }

    // Deep clean for speech — strip all markdown and symbols
    const cleanText = fullText
      .replace(/CHATID[\s\S]*/g, "")
      .replace(/```[\s\S]*?```/g, "Code example. ")
      .replace(/`[^`]+`/g, "")
      .replace(/#{1,6}\s+/g, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/_([^_]+)_/g, "$1")
      .replace(/!\[.*?\]\(.*?\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/^[\s]*[-•▪▸→*]\s+/gm, ". ")
      .replace(/^[\s]*\d+\.\s+/gm, ". ")
      .replace(/\|/g, ". ")
      .replace(/\n{2,}/g, ". ")
      .replace(/\n/g, ". ")
      .replace(/\.{2,}/g, ".")
      .replace(/\s{2,}/g, " ")
      .trim()

    // Limit to 4 sentences for speaking — nobody wants a 2-minute voice response
    const _sentences = cleanText.replace(/([.!?])\s+/g, "$1|").split("|")
    const speakText = _sentences.slice(0, 4).join(" ").trim()
    const preview = cleanText.substring(0, 160) + (cleanText.length > 160 ? "…" : "")
    setVoiceAIText(preview)

    // Add to chat UI
    if (chatBox) {
      hideWelcome()
      chatBox.innerHTML += `
        <div class="msg-row user-row">
          <div class="user-bubble">🎤 ${query}</div>
        </div>
      `
      chatBox.innerHTML += `
        <div class="msg-row">
          <div class="aiContent">
            <div class="ai-bubble">${marked.parse(safeContent(fullText.split("CHATID")[0]))}</div>
          </div>
        </div>
      ` 
      chatBox.scrollTop = chatBox.scrollHeight
      lucide.createIcons()
    }

    loadSidebar()

    // Speak clean limited text
    if (!voiceMuted) {
      setVA("speaking")
      speakText2(speakText || cleanText)
    } else {
      setVA("idle")
    }

  } catch(err) {
    console.error("Voice query error:", err.message || err)
    const errMsg = err.message || "Unknown error"
    if (errMsg.includes("401") || errMsg.includes("token")) {
      setVoiceAIText("Please log in to use voice assistant.")
    } else if (errMsg.includes("429")) {
      setVoiceAIText("Too many requests. Please wait a moment and try again.")
      if (!voiceMuted) speakText2("Please wait a moment and try again.")
    } else if (errMsg.includes("500") || errMsg.includes("Server")) {
      setVoiceAIText("Could not get a response. Please try again.")
      if (!voiceMuted) speakText2("Please try again.")
    } else if (errMsg.includes("network") || errMsg.includes("fetch") || errMsg.includes("Failed to fetch")) {
      setVoiceAIText("No internet connection. Check your network.")
    } else {
      setVoiceAIText("Something went wrong. Please tap to try again.")
    }
    setVA("idle")
  }
}


// VOICE PROFILES
const voiceProfiles = {
  "aria":    { name: "Aria",    lang: "en-US", rate: 0.85, pitch: 1.05, keywords: ["Google US English","Samantha","Aria","Zira"] },
  "james":   { name: "James",   lang: "en-US", rate: 0.82, pitch: 0.9,  keywords: ["Google UK English Male","Daniel","James","David"] },
  "sofia":   { name: "Sofia",   lang: "en-US", rate: 0.88, pitch: 1.1,  keywords: ["Google UK English Female","Karen","Moira","Sofia"] },
  "neural":  { name: "Neural",  lang: "en-US", rate: 0.85, pitch: 1.0,  keywords: ["Neural","Natural","Enhanced","Premium"] },
  "indian":  { name: "Riya",   lang: "en-IN", rate: 0.85, pitch: 1.0,  gender: "female", keywords: ["Lekha","Veena","Google Hindi","en-IN"] },
  "british": { name: "Oliver", lang: "en-GB", rate: 0.82, pitch: 0.85, gender: "male",   keywords: ["Google UK English Male","Daniel","George","Arthur","en-GB"] }
}

function getSelectedVoiceProfile() {
  return localStorage.getItem("datta_voice") || "aria"
}

// Returns { voice, hasNative } — voice may be null if no match
function pickVoice(profile) {
  const voices = voiceSynth.getVoices()
  if (!voices.length) return { voice: null, hasNative: false }

  if (!window._voicesLogged) {
    window._voicesLogged = true
    console.log("[VA] Available voices:", voices.map(v => v.name + "(" + v.lang + ")").join(", "))
  }

  const activeLang = window._voiceLang
  const isNonEnglish = activeLang && activeLang !== "en-IN" && activeLang !== "en-US"

  if (isNonEnglish) {
    const langCode = activeLang.split("-")[0]
    // Exact match first
    const exact = voices.find(v => v.lang === activeLang)
    if (exact) { console.log("[VA] Native exact:", exact.name); return { voice: exact, hasNative: true } }
    // Prefix match (te-IN, te-XX etc)
    const prefix = voices.find(v => v.lang.startsWith(langCode))
    if (prefix) { console.log("[VA] Native prefix:", prefix.name); return { voice: prefix, hasNative: true } }
    // Google voices include language in name (e.g. "Google Telugu")
    const langNames = {
      "te": "telugu", "hi": "hindi", "ta": "tamil", "kn": "kannada",
      "ml": "malayalam", "bn": "bengali", "pa": "punjabi", "gu": "gujarati",
      "mr": "marathi", "ur": "urdu"
    }
    const langName = langNames[langCode]
    if (langName) {
      const byName = voices.find(v => v.name.toLowerCase().includes(langName))
      if (byName) { console.log("[VA] Native by name:", byName.name); return { voice: byName, hasNative: true } }
    }
    // No native voice found — return null voice, browser will use lang tag alone
    console.log("[VA] No native voice for", activeLang, "— browser will attempt with lang tag only")
    return { voice: null, hasNative: false }
  }

  // English path — pick best English voice
  const maleWords = ["male","man","david","james","daniel","george","oliver","alex"]
  const femaleWords = ["female","woman","samantha","zira","karen","sofia","aria","lisa"]
  const gWords = profile.gender === "male" ? maleWords : femaleWords

  // Try profile keywords first
  for (const kw of profile.keywords) {
    const found = voices.find(v => v.name.toLowerCase().includes(kw.toLowerCase()))
    if (found) { console.log("[VA] Profile keyword:", found.name); return { voice: found, hasNative: true } }
  }
  // Language match
  const langVoices = voices.filter(v => v.lang.startsWith(profile.lang.split("-")[0]))
  if (langVoices.length) {
    const gendered = langVoices.find(v => gWords.some(g => v.name.toLowerCase().includes(g)))
    if (gendered) return { voice: gendered, hasNative: true }
    return { voice: langVoices[0], hasNative: true }
  }
  // Any English
  const engVoices = voices.filter(v => v.lang.startsWith("en"))
  if (engVoices.length) return { voice: engVoices[0], hasNative: true }

  return { voice: voices[0], hasNative: true }
}

// ── EMOTION DETECTION from text ──────────────────────────────────────────────
function detectEmotion(text) {
  const t = text.toLowerCase()
  if (/won|great|amazing|excellent|congratul|fantastic|perfect|brilliant|best|success/.test(t)) return { label:"🎉 Excited", color:"#f59e0b", rate:0.95, pitch:1.15 }
  if (/sorry|unfortunate|sad|bad news|failed|problem|issue|error|wrong|difficult/.test(t)) return { label:"😔 Serious", color:"#6b7280", rate:0.78, pitch:0.88 }
  if (/careful|warning|important|attention|note|remember|make sure|danger|risk/.test(t)) return { label:"⚠️ Alert", color:"#ef4444", rate:0.80, pitch:0.95 }
  if (/simple|easy|just|quick|basic|simply|directly|step/.test(t)) return { label:"✅ Clear", color:"#10a37f", rate:0.85, pitch:1.0 }
  if (/hello|hi |namaste|vanakkam|how are you|good morning|good evening/.test(t)) return { label:"👋 Friendly", color:"#0077ff", rate:0.88, pitch:1.08 }
  return { label: null, color: null, rate: 0.85, pitch: 1.0 }
}

// ── KARAOKE word highlighter ──────────────────────────────────────────────────
function startKaraoke(text, totalDuration) {
  const el = document.getElementById("vaKaraoke")
  if (!el) return
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return

  // Build word spans
  el.innerHTML = words.map((w, i) =>
    '<span class="va-word" id="vaw-' + i + '">' + w + ' </span>'
  ).join("")

  // Estimate ms per word based on total speech duration
  const msPerWord = Math.max(180, (totalDuration * 1000) / words.length)
  let idx = 0
  window._karaokeInterval = setInterval(() => {
    if (idx > 0) {
      const prev = document.getElementById("vaw-" + (idx - 1))
      if (prev) prev.classList.remove("active"), prev.classList.add("done")
    }
    const cur = document.getElementById("vaw-" + idx)
    if (cur) {
      cur.classList.add("active")
      cur.scrollIntoView({ block:"nearest", behavior:"smooth" })
    }
    idx++
    if (idx >= words.length) clearInterval(window._karaokeInterval)
  }, msPerWord)
}

function stopKaraoke() {
  if (window._karaokeInterval) clearInterval(window._karaokeInterval)
  const el = document.getElementById("vaKaraoke")
  if (el) el.innerHTML = ""
}

// ── MAIN SPEAK FUNCTION with karaoke + emotion ────────────────────────────────
function speakText2(text) {
  if (!voiceSynth) return
  stopSpeaking()
  stopKaraoke()

  isSpeaking = true
  setVA("speaking")

  // Detect emotion and update chip
  const emotion = detectEmotion(text)
  const chip = document.getElementById("vaEmotionChip")
  if (chip) {
    if (emotion.label) {
      chip.textContent = emotion.label
      chip.style.display = "inline-block"
      chip.style.background = (emotion.color || "#10a37f") + "22"
      chip.style.color = emotion.color || "#10a37f"
      chip.style.border = "1px solid " + (emotion.color || "#10a37f") + "44"
    } else {
      chip.style.display = "none"
    }
  }

  const utterance = new SpeechSynthesisUtterance(text)
  const profileKey = getSelectedVoiceProfile()
  const profile = voiceProfiles[profileKey] || voiceProfiles.aria

  // Apply emotion-adjusted rate/pitch on top of profile
  utterance.lang   = window._voiceLang || profile.lang
  utterance.rate   = emotion.rate   || profile.rate
  utterance.pitch  = emotion.pitch  || profile.pitch
  utterance.volume = 1.0

  const doSpeak = () => {
    const { voice, hasNative } = pickVoice(profile)
    // Only assign voice if it actually speaks the target language
    // If no native voice found, leave utterance.voice unset — browser uses lang tag alone
    if (voice && hasNative) utterance.voice = voice
    else if (!hasNative) {
      // Force browser to attempt the language without a specific voice object
      // This works on Android Chrome which has system TTS for Indian languages
      console.log("[VA] No native voice — relying on lang tag:", utterance.lang)
    }

    // Estimate speech duration for karaoke timing
    const wordCount = text.trim().split(/\s+/).length
    const estSeconds = (wordCount / (utterance.rate * 2.8)) // ~2.8 words/sec at rate=1
    startKaraoke(text, estSeconds)

    utterance.onend = () => {
      isSpeaking = false
      stopKaraoke()
      if (chip) chip.style.display = "none"
      if (voiceActive) {
        setVA("idle")
        setTimeout(() => { if (voiceActive) startListening() }, 800)
      }
    }
    utterance.onerror = (e) => {
      isSpeaking = false
      stopKaraoke()
      if (chip) chip.style.display = "none"
      setVA("idle")
    }
    voiceSynth.speak(utterance)
  }

  const availVoices = voiceSynth.getVoices()
  if (availVoices.length > 0) {
    doSpeak()
  } else {
    voiceSynth.onvoiceschanged = () => { voiceSynth.onvoiceschanged = null; doSpeak() }
    setTimeout(() => { if (!isSpeaking) doSpeak() }, 1000)
  }
}

function stopSpeaking() {
  if (voiceSynth) voiceSynth.cancel()
  if (window.speechSynthesis) window.speechSynthesis.cancel()
  isSpeaking = false
  stopKaraoke()
  const chip = document.getElementById("vaEmotionChip")
  if (chip) chip.style.display = "none"
  if (voiceActive) setVA("idle")
}

// Update the assistant button to open voice overlay
window.startVoiceListener = startVoiceListener
window.stopVoiceListener = stopVoiceListener
window.startAssistant = openVoiceAssistant

// Send last voice text to chat
window.sendVoiceToChat = function() {
  const voiceText = document.getElementById("voiceText")
  const text = voiceText ? voiceText.textContent.trim() : ""
  if (!text) return
  closeVoiceAssistant()
  const input = document.getElementById("message")
  if (input) {
    input.value = text
    send()
  }
}

window.setVoiceLang = function(lang) {
  window._voiceLang = lang
}

window.openVoiceAssistant = openVoiceAssistant
window.closeVoiceAssistant = closeVoiceAssistant
window.toggleVoiceListening = toggleVoiceListening

// VERSION NAMES based on plan
const planVersions = {
  free:         { name: "Free",       version: "Datta 2.1", emoji: "🌱" },
  starter:      { name: "Starter",    version: "Datta 5.4", emoji: "🚀" },
  plus:         { name: "Plus",       version: "Datta 5.4", emoji: "⚡" },
  pro:          { name: "Pro",        version: "Datta 5.4", emoji: "🔥" },
  ultimate:     { name: "Ultimate",   version: "Datta 5.4", emoji: "🚀" },
  "ultra-mini": { name: "Ultra Mini", version: "Datta 2.1", emoji: "⚡" },
  standard:     { name: "Standard",   version: "Datta 5.4", emoji: "⭐" },
  mini:         { name: "Mini",       version: "Datta 4.2", emoji: "⚡" },
  max:          { name: "Max",        version: "Datta 5.4", emoji: "💎" },
  ultramax:     { name: "Ultra Max",  version: "Datta 5.4", emoji: "👑" },
  basic:        { name: "Basic",      version: "Datta 4.2", emoji: "⚡" },
  enterprise:   { name: "Enterprise", version: "Datta 5.4", emoji: "👑" }
}

async function loadUserVersion() {
  try {
    const res = await fetch(SERVER + "/payment/subscription", { headers: { "Authorization": "Bearer " + getToken() } })
    if (!res.ok) return
    const data = await res.json()
    const plan = data.plan || "free"
    const v = planVersions[plan] || planVersions.free

    // Save plan
    localStorage.setItem("datta_plan", plan)

    // Update version tag
    const tag = document.getElementById("versionTag")
    if (tag) tag.textContent = "DATTA AI " + v.version + " · " + v.name.toUpperCase()

    // Update profile subtitle
    const sub = document.getElementById("profileSub") || document.querySelector(".sb-profile-sub")
    if (sub) sub.textContent = v.emoji + " " + v.name + " Plan"

    // Update plan button in sidebar
    const emoji = document.getElementById("planBtnEmoji")
    const title = document.getElementById("planBtnTitle")
    const subtitle = document.getElementById("planBtnSub")

    // Build sub text dynamically using limit from server if available
    const limitNum = (data.limits && data.limits.messages) ? data.limits.messages : null
    const planInfo = {
      free:         { emoji:"🌱", title:"Free Plan",       sub: (limitNum||10)   + " msgs/day · Datta 2.1" },
      starter:      { emoji:"🚀", title:"Starter Plan",    sub: (limitNum||40)   + " msgs/day · Active" },
      plus:         { emoji:"⚡", title:"Plus Plan",       sub: (limitNum||300)  + " msgs/day · All models · Active" },
      pro:          { emoji:"🔥", title:"Pro Plan",        sub: (limitNum||700)  + " msgs/day · All models · Active" },
      ultimate:     { emoji:"🚀", title:"Ultimate Plan",   sub: (limitNum||1500) + " msgs/day · All models · Active" },
      "ultra-mini": { emoji:"⚡", title:"Ultra Mini",      sub:"+15 bonus msgs · 24h · Active" },
      standard:     { emoji:"⭐", title:"Standard Plan",   sub: (limitNum||120)  + " msgs/day · Active" },
      mini:         { emoji:"⚡", title:"Mini Plan",       sub: (limitNum||200)  + " msgs/day · Active" },
      max:          { emoji:"💎", title:"Max Plan",        sub: (limitNum||2000) + " msgs/day · Active" },
      ultramax:     { emoji:"👑", title:"Ultra Max",       sub:"Unlimited · Active" },
      basic:        { emoji:"🔥", title:"Basic Plan",      sub: (limitNum||500)  + " msgs/day · Active" },
      enterprise:   { emoji:"👑", title:"Enterprise",      sub:"Unlimited · Active" }
    }

    // Update usage display with correct limit for current plan
    const planLimit = (data.limits && data.limits.messages) ? data.limits.messages : 20
    fetch(SERVER + "/payment/usage", { headers: { "Authorization": "Bearer " + getToken() } })
      .then(r => r.ok ? r.json() : null)
      .then(u => {
        if (u && typeof u.used === "number") {
          // Use the limit from usage endpoint (most accurate) or fall back to plan limit
          updateUsageDisplay(u.used, u.limit || planLimit)
        } else {
          // At least update the bar max even if used count unavailable
          updateUsageDisplay(0, planLimit)
        }
      })
      .catch(() => {})

    // Show/hide Plus badge on Datta 5.4 based on plan
    const badge = document.getElementById("d54PlanBadge")
    if (badge) {
      if (plan === "plus" || plan === "pro" || plan === "max" || plan === "ultramax" || plan === "enterprise") {
        badge.style.display = "none"  // user has access, no need for badge
      } else {
        badge.style.display = ""
      }
    }

    const info = planInfo[plan] || planInfo.free
    if (emoji) emoji.textContent = info.emoji
    if (title) title.textContent = info.title
    if (subtitle) subtitle.textContent = info.sub

    // Change button color for all plans
    const btn = document.getElementById("planBtn")
    if (btn) {
      const btnStyles = {
        free:         { bg: "linear-gradient(135deg,#0a2a1a,#0a1a2a)", border: "#00ff8833" },
        starter:      { bg: "linear-gradient(135deg,#001a0a,#001a10)", border: "#00cc6a44" },
        plus:         { bg: "linear-gradient(135deg,#1a1000,#2a1800)", border: "#f59e0b44" },
        pro:          { bg: "linear-gradient(135deg,#1a0500,#200800)", border: "#ef444444" },
        ultimate:     { bg: "linear-gradient(135deg,#0a0a2a,#1a0a2a)", border: "#8844ff44" },
        "ultra-mini": { bg: "linear-gradient(135deg,#2a1a00,#1a1000)", border: "#f59e0b44" },
        standard:     { bg: "linear-gradient(135deg,#001020,#001830)", border: "#0099ff44" },
        mini:         { bg: "linear-gradient(135deg,#1a1a0a,#2a1a00)", border: "#ffaa0033" },
        max:          { bg: "linear-gradient(135deg,#0a0a2a,#1a0a2a)", border: "#8844ff33" },
        ultramax:     { bg: "linear-gradient(135deg,#2a0a1a,#1a0a2a)", border: "#ff44aa33" },
        basic:        { bg: "linear-gradient(135deg,#1a0a00,#200a00)", border: "#ff660033" },
        enterprise:   { bg: "linear-gradient(135deg,#2a0a1a,#1a0a2a)", border: "#ff44aa33" }
      }
      const s = btnStyles[plan] || btnStyles.free
      btn.style.background  = s.bg
      btn.style.borderColor = s.border
    }

  } catch(e) {
    console.log("Version load error:", e.message)
    // Show from localStorage as fallback
    const plan = localStorage.getItem("datta_plan") || "free"
    const info = {
      free:         { emoji:"🌱", title:"Free Plan",     sub:"10 msgs/day" },
      starter:      { emoji:"🚀", title:"Starter Plan",  sub:"40 msgs/day · Active" },
      plus:         { emoji:"⚡", title:"Plus Plan",     sub:"300 msgs/day · Active" },
      pro:          { emoji:"🔥", title:"Pro Plan",      sub:"700 msgs/day · Active" },
      ultimate:     { emoji:"🚀", title:"Ultimate Plan", sub:"1500 msgs/day · Active" },
      "ultra-mini": { emoji:"⚡", title:"Ultra Mini",    sub:"+15 bonus msgs · Active" },
      standard:     { emoji:"⭐", title:"Standard Plan", sub:"120 msgs/day · Active" },
      mini:         { emoji:"⚡", title:"Mini Plan",     sub:"200 msgs/day · Active" },
      max:          { emoji:"💎", title:"Max Plan",      sub:"2000 msgs/day · Active" },
      ultramax:     { emoji:"👑", title:"Ultra Max",     sub:"Unlimited · Active" },
      basic:        { emoji:"🔥", title:"Basic Plan",    sub:"500 msgs/day · Active" },
      enterprise:   { emoji:"👑", title:"Enterprise",   sub:"Unlimited · Active" }
    }[plan] || { emoji:"🌱", title:"Free Plan", sub:"10 msgs/day" }
    const emoji = document.getElementById("planBtnEmoji")
    const title = document.getElementById("planBtnTitle")
    const sub = document.getElementById("planBtnSub")
    if (emoji) emoji.textContent = info.emoji
    if (title) title.textContent = info.title
    if (sub) sub.textContent = info.sub
  }
}

// Load version + usage on startup
window.addEventListener("DOMContentLoaded", function() {
  // Check if plan was just updated (e.g. user came back from pricing page)
  // Load immediately + again after 1s to catch any race condition
  setTimeout(loadUserVersion, 300)   // fast first load
  setTimeout(loadUserVersion, 1500)  // confirm after server settles
  refreshUsageCounter()           // immediate
  setTimeout(refreshUsageCounter, 2500)  // confirm after server responds
})

// Also refresh when tab becomes visible again (user switches back from pricing page)
document.addEventListener("visibilitychange", function() {
  if (document.visibilityState === "visible") {
    setTimeout(loadUserVersion, 500)
    setTimeout(refreshUsageCounter, 800)
  }
})

// SUGGESTION CHIPS
function useChip(btn) {
  const input = document.getElementById("message")
  if (input) {
    const textEl = btn.querySelector(".sugg-text") || btn.querySelector(".suggText") || btn.querySelector(".chipText")
    input.value = textEl ? textEl.textContent.trim() : btn.textContent.replace(/^[^\s]+\s/, "").trim()
    input.focus()
    send()
  }
}
window.useChip = useChip

// ── FEATURE 1: BUG FIXES ─────────────────────────────────────────────────────
// Fix Enter key to send message
document.addEventListener("DOMContentLoaded", function() {
  const msgInput = document.getElementById("message")
  if (msgInput) {
    msgInput.addEventListener("keydown", function(e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        send()
      }
    })
  }

  // Theme loaded by setTheme() on startup

  // Load saved model
  const savedModel = localStorage.getItem("datta_model")
  if (savedModel) {
    const sel = document.getElementById("modelSelect")
    if (sel) sel.value = savedModel
  }
})

// Theme toggle (cycles dark → light → eye)
function toggleTheme() {
  const cur = document.body.getAttribute("data-theme") || "dark"
  setTheme(cur === "dark" ? "light" : cur === "light" ? "eye" : "dark")
}
window.toggleTheme = toggleTheme

// ── FEATURE 3: MOBILE UI - Auto collapse sidebar on mobile ──────────────────
function openSidebar() {
  const sidebar = document.querySelector(".sidebar")
  const backdrop = document.getElementById("sidebarBackdrop")
  if (!sidebar) return
  sidebar.classList.add("open", "show")
  if (backdrop) backdrop.style.display = "block"
  document.body.style.overflow = "hidden"
}

function closeSidebar() {
  const sidebar = document.querySelector(".sidebar")
  const backdrop = document.getElementById("sidebarBackdrop")
  if (!sidebar) return
  sidebar.classList.remove("open", "show")
  if (backdrop) backdrop.style.display = "none"
  document.body.style.overflow = ""
}

function toggleSidebar() {
  const sidebar = document.querySelector(".sidebar")
  if (!sidebar) return

  if (window.innerWidth < 768) {
    // MOBILE: slide in/out with backdrop
    const isOpen = sidebar.classList.contains("open")
    if (isOpen) { closeSidebar() } else { openSidebar() }
  } else {
    // DESKTOP: collapse sidebar width
    document.body.classList.toggle("sb-collapsed")
    const isCollapsed = document.body.classList.contains("sb-collapsed")
    const inputArea = document.getElementById("inputArea")
    if (inputArea) {
      inputArea.style.left = isCollapsed
        ? "50%"
        : "calc(260px + (100vw - 260px) / 2)"
    }
  }
}

window.toggleSidebar = toggleSidebar
window.openSidebar = openSidebar
window.closeSidebar = closeSidebar


// ── FEATURE 5: AI MODEL SELECTOR ────────────────────────────────────────────
function changeModel(model) {
  localStorage.setItem("datta_model", model)
  const modelNames = {
    "llama-3.3-70b-versatile": "Fast",
    "llama-3.1-8b-instant": "Instant",
    "llama-3.3-70b-versatile": "Reasoning",
    "llama-3.3-70b-versatile": "Mixtral"
  }
  showToast("Model: " + (modelNames[model] || model))
}

window.changeModel = changeModel

// ── FEATURE 4B: SHARE CHAT ──────────────────────────────────────────────────
function shareChat() {
  shareChatLink()
}

window.shareChat = shareChat

// ── TOAST NOTIFICATION ───────────────────────────────────────────────────────
function showToast(msg, duration = 2500) {
  let toast = document.getElementById("dattaToast")
  if (!toast) {
    toast = document.createElement("div")
    toast.id = "dattaToast"
    toast.className = "datta-toast"
    document.body.appendChild(toast)
  }
  toast.textContent = msg
  toast.style.opacity = "1"
  clearTimeout(toast._timer)
  toast._timer = setTimeout(() => { toast.style.opacity = "0" }, duration)
}

window.showToast = showToast

// ── MODEL PICKER ─────────────────────────────────────────────────────────────
const modelData = {
  d21:    { model: "llama-3.1-8b-instant",                          icon: "", name: "Datta 2.1" },
  d42:    { model: "llama-3.3-70b-versatile",                       icon: "", name: "Datta 4.2" },
  d48:    { model: "llama-3.3-70b-versatile",                       icon: "", name: "Datta 4.8" },
  d54:    { model: "llama-3.3-70b-versatile",                       icon: "", name: "Datta 5.4" },
  dcode:  { model: "qwen-2.5-coder-32b-instruct",                   icon: "💻", name: "Datta Code" },
  dthink: { model: "deepseek-r1-distill-llama-70b",                 icon: "🧠", name: "Datta Think" },
  chitra: { model: "meta-llama/llama-4-scout-17b-16e-instruct",     icon: "", name: "Datta Vision" },
  // Legacy support
  veda:   { model: "llama-3.3-70b-versatile",  icon: "", name: "Datta 4.2" },
  surya:  { model: "llama-3.1-8b-instant",     icon: "", name: "Datta 2.1" },
  agni:   { model: "llama-3.3-70b-versatile",  icon: "", name: "Datta 4.8" },
  brahma: { model: "llama-3.3-70b-versatile",  icon: "", name: "Datta 5.4" }
}

// Model picker removed - using modelDropdown only
function openModelPicker() { toggleModelDropdown() }
function closeModelPicker() { closeModelDropdown() }
function selectModel(modelId, key, icon, name) { selectInputModel(modelId, key, name) }
window.openModelPicker = openModelPicker
window.closeModelPicker = closeModelPicker
window.selectModel = selectModel


// ══════════════════════════════════════════════════════
// FEATURE 1: PDF EXPORT
// ══════════════════════════════════════════════════════
function downloadAsPDF(btn) {
  const bubble = getAiBubble(btn)
  if (!bubble) return showToast("Nothing to export")
  const html = bubble.innerHTML
  const text = bubble.innerText
  const title = text.substring(0,40).replace(/[^a-z0-9]/gi,"-").toLowerCase()
  const date = new Date().toLocaleString("en-IN")

  // Detect if it's code - offer HTML download directly
  const codeBlock = bubble.querySelector("pre code")
  if (codeBlock) {
    const lang = (codeBlock.className || "").replace("language-","").toLowerCase()
    const code = codeBlock.innerText
    const ext = {html:"html",css:"css",javascript:"js",js:"js",python:"py",java:"java"}[lang] || "txt"
    // Direct file download
    const blob = new Blob([code], {type:"text/plain"})
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "datta-ai-" + title + "." + ext
    a.click()
    URL.revokeObjectURL(url)
    showToast("Downloaded " + a.download + " !")
    return
  }

  // For text content - download as HTML file (opens perfectly everywhere)
  const fullHtml = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Datta AI Export</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:860px;margin:0 auto;padding:40px 24px;color:#111;line-height:1.8;background:#fff}
  .header{display:flex;align-items:center;gap:12px;padding-bottom:20px;border-bottom:2px solid #00cc66;margin-bottom:32px}
  .logo{width:36px;height:36px;background:#00cc66;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#000;font-weight:800;font-size:14px}
  h1,h2,h3{margin:20px 0 8px;color:#111}
  p{margin-bottom:12px}
  ul,ol{padding-left:20px;margin-bottom:12px}
  li{margin-bottom:6px}
  code{background:#f4f4f4;padding:2px 6px;border-radius:4px;font-family:monospace;font-size:13px;color:#d63384}
  pre{background:#1a1a1a;color:#e0e0e0;padding:20px;border-radius:10px;overflow-x:auto;margin:16px 0}
  pre code{background:none;color:#e0e0e0;padding:0}
  table{border-collapse:collapse;width:100%;margin:16px 0}
  th{background:#f4f4f4;font-weight:700;text-align:left}
  td,th{border:1px solid #ddd;padding:10px 14px}
  blockquote{border-left:3px solid #00cc66;padding:10px 16px;background:#f9f9f9;margin:16px 0;color:#555}
  strong{color:#000;font-weight:700}
  .footer{margin-top:48px;padding-top:20px;border-top:1px solid #eee;color:#999;font-size:12px;text-align:center}
  @media print{.footer{position:fixed;bottom:0;width:100%}}
</style>
</head><body>
<div class="header">
  <div class="logo">D</div>
  <div>
    <div style="font-weight:700;font-size:18px;color:#00cc66;">Datta AI</div>
    <div style="font-size:12px;color:#999;">Generated on ${date}</div>
  </div>
</div>
<div class="content">${html}</div>
<div class="footer">Generated by Datta AI &middot; datta-ai.com</div>
</body></html>`

  const blob = new Blob([fullHtml], {type:"text/html"})
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "datta-ai-" + title + ".html"
  a.click()
  URL.revokeObjectURL(url)
  showToast("Downloaded " + a.download + " !")
}
window.downloadAsPDF = downloadAsPDF

// ══════════════════════════════════════════════════════
// FEATURE 2: CODE PREVIEW - Run HTML/CSS/JS in chat
// ══════════════════════════════════════════════════════
function addCodePreview(container) {
  // No-op: split preview now handled automatically by renderer.code
}

// ── RUN APP BUTTON ───────────────────────────────────────────────────────────
// After AI response, check if it has multiple code blocks and inject ONE run button
function injectRunAppButton(container, rawText) {
  if (!container) return

  // Collect all code blocks in this response
  const blocks = container.querySelectorAll(".code-block-wrap[data-code]")
  if (blocks.length < 1) return

  // Don't add if already has a run button
  if (container.querySelector(".run-app-btn")) return

  // Gather all code by language
  let html = "", css = "", js = ""
  blocks.forEach(block => {
    const lang = (block.getAttribute("data-lang") || "").toLowerCase()
    const code = decodeURIComponent(block.getAttribute("data-code") || "")
    if (lang === "html") html = code
    else if (lang === "css") css += "\n" + code
    else if (lang === "js" || lang === "javascript") js += "\n" + code
    // Single block with no lang but has HTML markers
    else if (!lang && (code.includes("<html") || code.includes("<!DOCTYPE") || code.includes("<body"))) {
      html = code
    }
  })

  // Detect if this is a Node.js/backend response — never run in browser
  const isBackendCode = js && (
    js.includes("require(") ||
    js.includes("process.env") ||
    js.includes("express()") ||
    js.includes("app.listen") ||
    js.includes("mongoose") ||
    js.includes("dotenv") ||
    js.includes("fs.") ||
    js.includes("path.") ||
    js.includes("http.createServer") ||
    js.includes("import express")
  )
  if (isBackendCode) return  // Node.js code cannot run in browser

  // Only show button if there's actual frontend runnable code
  if (!html.trim() && !js.trim()) return

  // For JS-only: must look like frontend code (uses DOM APIs)
  if (!html.trim() && js.trim()) {
    const isFrontendJS = js.includes("document.") ||
      js.includes("window.") ||
      js.includes("getElementById") ||
      js.includes("querySelector") ||
      js.includes("innerHTML") ||
      js.includes("addEventListener") ||
      js.includes("createElement")
    if (!isFrontendJS) return  // pure logic/backend JS — don't run in browser
  }

  // Build the combined app HTML
  const hasHTML = html.trim().length > 0
  function buildApp() {
    if (hasHTML) {
      let combined = html
      // Inject CSS before </head> or at top
      if (css.trim()) {
        const styleTag = "<style>" + css + "</style>"
        if (combined.includes("</head>")) {
          combined = combined.replace("</head>", styleTag + "</head>")
        } else {
          combined = styleTag + combined
        }
      }
      // Inject JS before </body> or at end
      if (js.trim()) {
        const scriptTag = "<script>" + js + "<\/script>"
        if (combined.includes("</body>")) {
          combined = combined.replace("</body>", scriptTag + "</body>")
        } else {
          combined = combined + scriptTag
        }
      }
      return combined
    } else {
      // Only JS — wrap in basic HTML
      return "<!DOCTYPE html><html><body style='margin:0;padding:16px;font-family:sans-serif;background:#fff'><div id='app'></div><script>" + js + "<\/script></body></html>"
    }
  }

  // Create the Run App button
  const btnWrap = document.createElement("div")
  btnWrap.className = "run-app-btn"
  btnWrap.style.cssText = "margin:12px 0 4px;"
  btnWrap.innerHTML = `
    <button onclick="launchApp(this)" 
      style="display:flex;align-items:center;gap:8px;padding:10px 20px;background:linear-gradient(135deg,#10a37f,#0077ff);border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;width:100%;justify-content:center;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      ▶ Run App — Test Your Website
    </button>
  `

  // Store the combined code on the button
  const appCode = buildApp()
  btnWrap.querySelector("button").setAttribute("data-app", encodeURIComponent(appCode))

  // Insert after last code block
  const lastBlock = blocks[blocks.length - 1]
  lastBlock.parentNode.insertBefore(btnWrap, lastBlock.nextSibling)
}

// Launch the app in a full-screen overlay
function launchApp(btn) {
  const encoded = btn.getAttribute("data-app") || ""
  const code    = encoded ? decodeURIComponent(encoded) : ""
  if (!code.trim()) { showToast("No code to run"); return }

  // Create full-screen overlay
  const overlay = document.createElement("div")
  overlay.id = "appPreviewOverlay"
  overlay.style.cssText = "position:fixed;inset:0;z-index:99999;background:#000;display:flex;flex-direction:column;"

  overlay.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:#0a0a0f;border-bottom:1px solid #1a1a2a;flex-shrink:0;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="display:flex;gap:6px;">
          <div style="width:12px;height:12px;border-radius:50%;background:#ff5f57;"></div>
          <div style="width:12px;height:12px;border-radius:50%;background:#ffbd2e;"></div>
          <div style="width:12px;height:12px;border-radius:50%;background:#28ca42;"></div>
        </div>
        <span style="font-size:12px;color:#555;letter-spacing:1px;">APP PREVIEW</span>
      </div>
      <div style="display:flex;gap:8px;">
        <button id="appReloadBtn" style="padding:4px 12px;background:none;border:1px solid #2a2a3a;border-radius:6px;color:#666;font-size:12px;cursor:pointer;">↺ Reload</button>
        <button onclick="document.getElementById('appPreviewOverlay').remove()" style="padding:4px 12px;background:#1a0a0a;border:1px solid #3a1a1a;border-radius:6px;color:#e55;font-size:12px;cursor:pointer;">✕ Close</button>
      </div>
    </div>
    <iframe id="appPreviewFrame" sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups" style="flex:1;border:none;background:#fff;"></iframe>
  `

  document.body.appendChild(overlay)

  // Write code to iframe
  const iframe = document.getElementById("appPreviewFrame")
  writeToIframe(iframe, code)

  // Reload button
  document.getElementById("appReloadBtn").onclick = function() {
    writeToIframe(iframe, code)
    showToast("Reloaded!")
  }
}

window.injectRunAppButton = injectRunAppButton
window.launchApp = launchApp

// Toggle split view: code left, live preview right
function toggleSplitPreview(uid) {
  const splitDiv = document.getElementById(uid + "_split")
  const preEl    = document.getElementById(uid + "_pre")
  const wrap     = document.getElementById(uid + "_wrap")
  if (!splitDiv || !wrap) return

  const existing = document.getElementById(uid + "_iframe")
  if (existing) {
    // Close preview — back to full-width code
    const closeWrap = document.getElementById(uid + "_closebtn")
    if (closeWrap) closeWrap.remove()
    preEl.style.flex = "1"
    preEl.style.borderRight = "none"
    preEl.style.maxWidth = ""
    return
  }

  // Get code from data-code attribute (safe — not stripped by innerHTML)
  const encoded = wrap.getAttribute("data-code") || ""
  const code = encoded ? decodeURIComponent(encoded) : ""
  if (!code.trim()) { showToast("No code to preview"); return }

  // Shrink code panel to left half
  preEl.style.flex = "0 0 50%"
  preEl.style.borderRight = "1px solid #1a1a2a"
  preEl.style.maxWidth = "50%"

  // Create preview iframe on right
  const iframe = document.createElement("iframe")
  iframe.id = uid + "_iframe"
  iframe.style.cssText = "flex:1;border:none;background:#fff;min-height:350px;"
  iframe.sandbox = "allow-scripts allow-same-origin allow-forms"

  // Close button inside preview panel
  const closeWrap = document.createElement("div")
  closeWrap.id = uid + "_closebtn"
  closeWrap.style.cssText = "position:relative;display:flex;flex-direction:column;flex:1;min-width:0;"

  const toolbar = document.createElement("div")
  toolbar.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:6px 12px;background:#0a0a0f;border-bottom:1px solid #1a1a2a;flex-shrink:0;"
  toolbar.innerHTML = `
    <span style="font-size:11px;color:#555;letter-spacing:1px;">PREVIEW</span>
    <div style="display:flex;gap:6px;">
      <button onclick="reloadSplitPreview('${uid}')" style="padding:2px 8px;background:none;border:1px solid #2a2a3a;border-radius:5px;color:#555;font-size:11px;cursor:pointer;">↺ Reload</button>
      <button onclick="openFullPreview('${uid}')" style="padding:2px 8px;background:none;border:1px solid #2a2a3a;border-radius:5px;color:#555;font-size:11px;cursor:pointer;">⛶ Full</button>
      <button onclick="toggleSplitPreview('${uid}')" style="padding:2px 8px;background:none;border:1px solid #2a2a3a;border-radius:5px;color:#555;font-size:11px;cursor:pointer;">✕</button>
    </div>`

  closeWrap.appendChild(toolbar)
  closeWrap.appendChild(iframe)
  splitDiv.appendChild(closeWrap)

  // Write code to iframe
  writeToIframe(iframe, code)
  showToast("Preview ready!")
}

function writeToIframe(iframe, code) {
  const doc = iframe.contentDocument || iframe.contentWindow.document
  doc.open()
  const isHTML = code.trim().toLowerCase().startsWith("<!doctype") || code.trim().toLowerCase().startsWith("<html") || code.includes("<body") || code.includes("<div")
  if (isHTML) {
    doc.write(code)
  } else {
    doc.write(`<!DOCTYPE html><html><body style="margin:0;padding:16px;font-family:sans-serif;"><script>try{${code.replace(/<\/script>/g,"<\/script>")}}catch(e){document.body.innerHTML='<pre style="color:red;padding:12px">'+e.message+'</pre>'}<\/script></body></html>`)
  }
  doc.close()
}

function reloadSplitPreview(uid) {
  const iframe = document.getElementById(uid + "_iframe")
  const wrap   = document.getElementById(uid + "_wrap")
  if (!iframe || !wrap) return
  const code = decodeURIComponent(wrap.getAttribute("data-code") || "")
  writeToIframe(iframe, code)
  showToast("Reloaded!")
}

function openFullPreview(uid) {
  const wrap = document.getElementById(uid + "_wrap")
  const code = wrap ? decodeURIComponent(wrap.getAttribute("data-code") || "") : ""
  const win = window.open("", "_blank")
  win.document.write(code)
  win.document.close()
}

function copyBlockCode(btn) {
  const code = decodeURIComponent(btn.dataset.code)
  navigator.clipboard.writeText(code).then(() => {
    btn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Copied!`
    btn.style.color = "#00c9a7"
    btn.style.borderColor = "rgba(0,201,167,0.4)"
    setTimeout(() => {
      btn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy`
      btn.style.color = "#555"
      btn.style.borderColor = "#2a2a3a"
    }, 2000)
  })
}

window.toggleSplitPreview = toggleSplitPreview
window.reloadSplitPreview = reloadSplitPreview
window.openFullPreview    = openFullPreview
window.copyBlockCode      = copyBlockCode
window.addCodePreview     = addCodePreview
window.copyCodeBlock = copyBlockCode

// ══════════════════════════════════════════════════════
// FEATURE 3: DAILY MEMORY - Remember user across days
// ══════════════════════════════════════════════════════
async function saveDailyMemory(key, value) {
  try {
    await fetch(SERVER + "/memory/" + key, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value, token: getToken() })
    })
  } catch(e) {}
}

// Auto-save fitness/study goals from chat
function autoDetectAndSaveMemory(text) {
  const lower = text.toLowerCase()
  // Detect fitness goals
  if (/my (weight|goal|target|workout|diet|calories)/.test(lower)) {
    saveDailyMemory("fitness_context", text.substring(0, 200))
  }
  // Detect study topics  
  if (/(studying|preparing for|exam|syllabus|chapter|subject)/.test(lower)) {
    saveDailyMemory("study_context", text.substring(0, 200))
  }
  // Detect business context
  if (/(my business|my startup|my company|my app|my product)/.test(lower)) {
    saveDailyMemory("business_context", text.substring(0, 200))
  }
}

// ══════════════════════════════════════════════════════
// FEATURE 4: FILE MANAGER - Save AI outputs
// ══════════════════════════════════════════════════════
let savedFiles = JSON.parse(localStorage.getItem("datta_saved_files") || "[]")

function saveToFileManager(btn) {
  const bubble = getAiBubble(btn)
  if (!bubble) return
  
  const file = {
    id: Date.now(),
    title: bubble.innerText.substring(0, 50) + "...",
    content: bubble.innerHTML,
    text: bubble.innerText,
    date: new Date().toLocaleDateString("en-IN"),
    type: bubble.querySelector("pre") ? "code" : "text"
  }
  
  savedFiles.unshift(file)
  if (savedFiles.length > 50) savedFiles.pop() // max 50 files
  localStorage.setItem("datta_saved_files", JSON.stringify(savedFiles))
  showToast("Saved to File Manager!")
}

function openFileManager() {
  const saved = JSON.parse(localStorage.getItem("datta_saved_files") || "[]")
  
  // Remove existing
  document.getElementById("fileManagerModal")?.remove()

  const modal = document.createElement("div")
  modal.id = "fileManagerModal"
  modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:99999;display:flex;align-items:flex-end;"
  modal.innerHTML = `
    <div style="width:100%;max-width:600px;margin:0 auto;background:#111;border-radius:20px 20px 0 0;max-height:80vh;overflow-y:auto;padding:20px 0 40px;">
      <div style="width:40px;height:4px;background:#333;border-radius:2px;margin:0 auto 16px;"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0 20px 16px;">
        <div style="font-size:16px;font-weight:700;color:white;font-family:'Josefin Sans',sans-serif;letter-spacing:1px;">📁 File Manager</div>
        <button onclick="document.getElementById('fileManagerModal').remove()" style="background:none;border:none;color:#666;font-size:20px;cursor:pointer;">✕</button>
      </div>
      ${saved.length === 0 ? `<div style="text-align:center;color:#555;padding:40px;font-size:14px;">No saved files yet.<br>Click the save button on any AI response.</div>` :
        saved.map((f,i) => `
        <div style="padding:12px 20px;border-bottom:1px solid #1a1a1a;display:flex;align-items:center;gap:12px;">
          <div style="font-size:20px;">${f.type === "code" ? "💻" : "📄"}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;color:white;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${f.title}</div>
            <div style="font-size:11px;color:#555;margin-top:2px;">${f.date}</div>
          </div>
          <div style="display:flex;gap:6px;">
            <button onclick="downloadFile(${i})" style="padding:5px 10px;background:#1a2a1a;border:1px solid #00ff8833;border-radius:8px;color:#00ff88;font-size:11px;cursor:pointer;">PDF</button>
            <button onclick="deleteFile(${i})" style="padding:5px 10px;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#666;font-size:11px;cursor:pointer;">Del</button>
          </div>
        </div>`).join("")
      }
    </div>`
  modal.addEventListener("click", e => { if(e.target === modal) modal.remove() })
  document.body.appendChild(modal)
}

function downloadFile(idx) {
  const saved = JSON.parse(localStorage.getItem("datta_saved_files") || "[]")
  const f = saved[idx]
  if (!f) return
  const win = window.open("", "_blank")
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${f.title}</title>
  <style>body{font-family:system-ui;max-width:800px;margin:40px auto;padding:20px;line-height:1.8;}
  code{background:#f4f4f4;padding:2px 6px;border-radius:4px;}pre{background:#f4f4f4;padding:16px;border-radius:8px;overflow-x:auto;}
  .footer{color:#999;font-size:12px;border-top:1px solid #ddd;padding-top:12px;margin-top:24px;}</style>
  </head><body>
  <h2 style="color:#00cc66;">Datta AI — Saved File</h2>
  <div>${f.content}</div>
  <div class="footer">Saved on ${f.date} · Datta AI · datta-ai.com</div>
  </body></html>`)
  win.document.close()
  setTimeout(() => win.print(), 500)
}

function deleteFile(idx) {
  const saved = JSON.parse(localStorage.getItem("datta_saved_files") || "[]")
  saved.splice(idx, 1)
  localStorage.setItem("datta_saved_files", JSON.stringify(saved))
  openFileManager()
  showToast("File deleted")
}

window.saveToFileManager = saveToFileManager
window.openFileManager = openFileManager
window.downloadFile = downloadFile
window.deleteFile = deleteFile
window.autoDetectAndSaveMemory = autoDetectAndSaveMemory
// ══════════════════════════════════════════════════════
// AUTO-CHAIN EXECUTION ENGINE
// ══════════════════════════════════════════════════════
function autoChainExecution(aiDiv, response, userMsg) {
  const bubble = aiDiv.querySelector(".ai-bubble, .aiBubble")
  if (!bubble) return
  const msg = (userMsg || "").toLowerCase()
  const resp = (response || "").toLowerCase()

  // Detect code generation
  const hasCode = bubble.querySelector("pre code")
  const isWebsite = hasCode && (msg.includes("website") || msg.includes("html") || msg.includes("app") || msg.includes("calculator") || msg.includes("game"))
  const isPython = hasCode && (msg.includes("python") || msg.includes(".py"))

  // Detect document tasks
  const isBusinessPlan = msg.includes("business plan") || msg.includes("business proposal")
  const isFitnessPlan = msg.includes("fitness plan") || msg.includes("workout plan") || msg.includes("diet plan")
  const isResume = msg.includes("resume") || msg.includes("cv ")
  const isStudyPlan = msg.includes("study plan") || msg.includes("study schedule")

  // Build execution panel
  let actions = []

  if (isWebsite) {
    const code = bubble.querySelector("pre code")?.innerText || ""
    const blob = new Blob([code], {type:"text/html"})
    const url = URL.createObjectURL(blob)
    actions.push({ label:"▶ Preview Website", icon:"🌐", color:"#00ff88", action:`window.open("${url}","_blank")` })
    actions.push({ label:"⬇ Download HTML", icon:"💾", color:"#00ccff", action:`downloadCodeDirect(this)`, data:code, ext:"html" })
    actions.push({ label:"📋 Copy Code", icon:"📋", color:"#aa66ff", action:`copyAllCode(this)`, data:code })
  } else if (isPython) {
    const code = bubble.querySelector("pre code")?.innerText || ""
    actions.push({ label:"⬇ Download .py", icon:"🐍", color:"#ffcc00", action:`downloadCodeDirect(this)`, data:code, ext:"py" })
    actions.push({ label:"📋 Copy Code", icon:"📋", color:"#aa66ff", action:`copyAllCode(this)`, data:code })
  } else if (isBusinessPlan || isFitnessPlan || isResume || isStudyPlan) {
    const type = isBusinessPlan?"business-plan":isFitnessPlan?"fitness-plan":isResume?"resume":"study-plan"
    actions.push({ label:"⬇ Download Document", icon:"📄", color:"#00ff88", action:`downloadDocument(this)` })
    actions.push({ label:"📋 Copy All", icon:"📋", color:"#aa66ff", action:`copyAllCode(this)` })
  } else if (hasCode) {
    const code = bubble.querySelector("pre code")?.innerText || ""
    const lang = (bubble.querySelector("pre code")?.className||"").replace("language-","").toLowerCase()
    const ext = {javascript:"js",python:"py",html:"html",css:"css",java:"java",cpp:"cpp"}[lang]||"txt"
    actions.push({ label:"⬇ Download ." + ext, icon:"💾", color:"#00ccff", action:`downloadCodeDirect(this)`, data:code, ext })
    actions.push({ label:"📋 Copy Code", icon:"📋", color:"#aa66ff", action:`copyAllCode(this)`, data:code })
  }

  if (actions.length === 0) return

  // Render execution panel
  const panel = document.createElement("div")
  panel.style.cssText = "margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;"
  actions.forEach(act => {
    const btn = document.createElement("button")
    btn.style.cssText = `padding:8px 16px;border-radius:10px;border:1px solid ${act.color}33;background:${act.color}11;color:${act.color};font-size:12px;cursor:pointer;font-family:'Josefin Sans',sans-serif;letter-spacing:0.5px;transition:all 0.2s;`
    btn.textContent = act.label
    if (act.data) btn.dataset.code = act.data
    if (act.ext) btn.dataset.ext = act.ext
    btn.setAttribute("onclick", act.action)
    btn.onmouseover = () => btn.style.background = act.color + "22"
    btn.onmouseout = () => btn.style.background = act.color + "11"
    panel.appendChild(btn)
  })

  bubble.appendChild(panel)
}

function downloadCodeDirect(btn) {
  const code = btn.dataset.code || btn.closest(".ai-bubble, .aiBubble").querySelector("pre code")?.innerText || ""
  const ext = btn.dataset.ext || "txt"
  const blob = new Blob([code], {type:"text/plain"})
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "datta-ai-output." + ext
  a.click()
  URL.revokeObjectURL(url)
  showToast("Downloaded datta-ai-output." + ext)
}

function copyAllCode(btn) {
  const code = btn.dataset.code || btn.closest(".ai-bubble, .aiBubble").querySelector("pre code")?.innerText || ""
  navigator.clipboard.writeText(code).then(() => { showToast("Code copied!"); btn.textContent = "✓ Copied!" })
}

function downloadDocument(btn) {
  const bubble = btn.closest(".ai-bubble, .aiBubble")
  const html = bubble.innerHTML
  const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Datta AI Document</title>
<style>body{font-family:system-ui;max-width:860px;margin:40px auto;padding:24px;line-height:1.8;color:#111}
h1,h2,h3{color:#111;margin:20px 0 8px}p{margin-bottom:12px}ul,ol{padding-left:20px;margin:12px 0}
li{margin-bottom:6px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:10px}
.header{border-bottom:2px solid #00cc66;padding-bottom:16px;margin-bottom:32px}
.footer{margin-top:48px;color:#999;font-size:12px;text-align:center;border-top:1px solid #eee;padding-top:16px}</style>
</head><body>
<div class="header"><strong style="color:#00cc66;font-size:20px;">Datta AI</strong><br><span style="color:#999;font-size:12px;">Generated on ${new Date().toLocaleString("en-IN")}</span></div>
${html}
<div class="footer">Generated by Datta AI &middot; datta-ai.com</div>
</body></html>`
  const blob = new Blob([fullHtml], {type:"text/html"})
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "datta-ai-document.html"
  a.click()
  URL.revokeObjectURL(url)
  showToast("Document downloaded!")
}

window.autoChainExecution = autoChainExecution
window.downloadCodeDirect = downloadCodeDirect
window.copyAllCode = copyAllCode
window.downloadDocument = downloadDocument

// ══════════════════════════════════════════════════════
// PWA - Service Worker Registration
// ══════════════════════════════════════════════════════
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js")
      .then(() => console.log("SW registered"))
      .catch(e => console.log("SW error:", e))
  })
}

// PWA Install prompt — disabled
let deferredPrompt = null
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault()  // suppress browser install prompt
  deferredPrompt = null
})

function showInstallBanner() {}
function installPWA() {}
function dismissInstall() {
  const b = document.getElementById("installBanner")
  if (b) b.remove()
}

window.installPWA = installPWA
window.dismissInstall = dismissInstall

// ══════════════════════════════════════════════════════
// PUSH NOTIFICATIONS
// ══════════════════════════════════════════════════════
async function requestNotifications() {
  if (!("Notification" in window)) return
  if (Notification.permission === "granted") return
  if (localStorage.getItem("notif_asked")) return

  localStorage.setItem("notif_asked", "1")

  const toast = document.createElement("div")
  toast.className = "notifToast"
  toast.innerHTML = `
    <div class="notifToastTitle">🔔 Stay Updated</div>
    <div class="notifToastSub">Get notified when Datta AI responds</div>
    <div class="notifToastBtns">
      <button class="notifAllow" onclick="allowNotifs(this)">Allow</button>
      <button class="notifDeny" onclick="this.closest('.notifToast').remove()">No thanks</button>
    </div>
  `
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 8000)
}

async function allowNotifs(btn) {
  btn.closest(".notifToast").remove()
  const perm = await Notification.requestPermission()
  if (perm === "granted") showToast("Notifications enabled!")
}

window.allowNotifs = allowNotifs

// Ask after first chat
setTimeout(requestNotifications, 10000)

// ══════════════════════════════════════════════════════
// CHAT SEARCH
// ══════════════════════════════════════════════════════
let allChats = []

function searchChats(query = "") {
  const q = query.toLowerCase().trim()
  const items = document.querySelectorAll(".chat-item")
  items.forEach(item => {
    const title = item.querySelector(".chatTitle")?.textContent?.toLowerCase() || ""
    item.classList.toggle("hidden", q.length > 0 && !title.includes(q))
  })
}

window.searchChats = searchChats

// ══════════════════════════════════════════════════════
// MULTI-LANGUAGE UI
// ══════════════════════════════════════════════════════
const UI_STRINGS = {
  English: { placeholder: "Ask Datta AI anything...", newChat: "New chat", search: "Search chats...", welcome: "What can I build for you?" },
  Hindi: { placeholder: "Datta AI से पूछें...", newChat: "नई चैट", search: "चैट खोजें...", welcome: "मैं आपके लिए क्या बना सकता हूं?" },
  Telugu: { placeholder: "Datta AI ని అడగండి...", newChat: "కొత్త చాట్", search: "చాట్లు వెతకండి...", welcome: "నేను మీ కోసం ఏమి నిర్మించగలను?" },
  Tamil: { placeholder: "Datta AI கேளுங்கள்...", newChat: "புதிய அரட்டை", search: "தேடுங்கள்...", welcome: "நான் உங்களுக்கு என்ன உருவாக்கலாம்?" }
}

function applyUILanguage(lang) {
  const strings = UI_STRINGS[lang] || UI_STRINGS.English
  const msgInput = document.getElementById("message")
  const searchInput = document.getElementById("chatSearchInput")
  const welcomeTitle = document.querySelector(".welcomeTitle")
  if (msgInput) msgInput.placeholder = strings.placeholder
  if (searchInput) searchInput.placeholder = "🔍 " + strings.search
  if (welcomeTitle) welcomeTitle.textContent = strings.welcome
  localStorage.setItem("datta_ui_lang", lang)
}

// Apply saved UI language
window.addEventListener("DOMContentLoaded", () => {
  const saved = localStorage.getItem("datta_ui_lang") || "English"
  applyUILanguage(saved)
})

window.applyUILanguage = applyUILanguage

// ══════════════════════════════════════════════════════
// PROFILE PHOTO UPLOAD
// ══════════════════════════════════════════════════════
function uploadProfilePhoto() {
  const input = document.createElement("input")
  input.type = "file"
  input.accept = "image/*"
  input.onchange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target.result
      localStorage.setItem("datta_avatar", dataUrl)
      updateProfilePhoto(dataUrl)
      showToast("Profile photo updated!")
    }
    reader.readAsDataURL(file)
  }
  input.click()
}

function updateProfilePhoto(dataUrl) {
  const avatars = document.querySelectorAll(".profileAvatar, .userAvatarImg")
  avatars.forEach(a => { a.src = dataUrl; a.style.display = "block" })

  const textAvatars = document.querySelectorAll(".profileInitial, .profileLetter")
  textAvatars.forEach(a => { a.style.display = "none" })
}

// Load saved profile photo
window.addEventListener("DOMContentLoaded", () => {
  const saved = localStorage.getItem("datta_avatar")
  if (saved) updateProfilePhoto(saved)
})

window.uploadProfilePhoto = uploadProfilePhoto

// ══════════════════════════════════════════════════════
// ANALYTICS (stored locally + server)
// ══════════════════════════════════════════════════════
function trackEvent(event, data) {
  const analytics = JSON.parse(localStorage.getItem("datta_analytics") || "{}")
  if (!analytics[event]) analytics[event] = 0
  analytics[event]++
  analytics.lastSeen = new Date().toISOString()
  localStorage.setItem("datta_analytics", JSON.stringify(analytics))
}

// Track message sends
const origSend = window.send
window.send = function() {
  trackEvent("messages_sent")
  if (origSend) origSend.apply(this, arguments)
}

window.trackEvent = trackEvent

// applyFullTheme — kept as no-op alias for backward compat
function applyFullTheme() { setTheme(document.body.getAttribute("data-theme") || "dark", true) }
window.applyFullTheme = applyFullTheme

// SHOW ADMIN LINK if user is admin
window.addEventListener("DOMContentLoaded", function() {
  const user = JSON.parse(localStorage.getItem("datta_user") || "{}")
  const adminEmails = ["harisaiganeshpampana@gmail.com", "harisaiganesh@gmail.com"]
  const adminLink = document.getElementById("adminLink")
  if (adminLink && user.email && adminEmails.includes(user.email)) {
    adminLink.style.display = "block"
  }
})

// SET VOICE
function setVoice(key) {
  localStorage.setItem("datta_voice", key)

  // Update UI
  document.querySelectorAll(".voiceOption").forEach(b => b.classList.remove("active"))
  const btn = document.getElementById("vopt-" + key)
  if (btn) btn.classList.add("active")

  // Preview voice
  const profile = voiceProfiles[key]
  if (profile) speakText2("Hi! I am " + profile.name + ", your Datta AI voice.")
}

// Load saved voice on open
function loadSavedVoice() {
  const saved = localStorage.getItem("datta_voice") || "aria"
  document.querySelectorAll(".voiceOption").forEach(b => b.classList.remove("active"))
  const btn = document.getElementById("vopt-" + saved)
  if (btn) btn.classList.add("active")
}

const origOpenVoice = window.openVoiceAssistant
window.openVoiceAssistant = function() {
  if (origOpenVoice) origOpenVoice()
  setTimeout(loadSavedVoice, 100)
}

window.setVoice = setVoice

// MOBILE KEYBOARD FIX - simple version, no sheet interference
if (window.innerWidth <= 768) {
  const msgInput = document.getElementById("message")
  if (msgInput) {
    msgInput.addEventListener("focus", () => {
      setTimeout(() => {
        chatBox.scrollTop = chatBox.scrollHeight
      }, 400)
    })
  }
}

// EMAIL VERIFICATION BANNER
window.addEventListener("DOMContentLoaded", async function() {
  const user = JSON.parse(localStorage.getItem("datta_user") || "{}")
  if (!user.email || user.emailVerified) return

  // Check if already verified from server
  try {
    const res = await fetch(SERVER + "/payment/subscription", { headers: { "Authorization": "Bearer " + getToken() } })
    if (!res.ok) return
  } catch(e) { return }

  // Show banner if not verified
  const verified = localStorage.getItem("email_verified")
  if (verified) return

  const banner = document.createElement("div")
  banner.id = "verifyBanner"
  banner.style.cssText = `
    position:fixed; top:0; left:0; right:0; z-index:9999;
    background:linear-gradient(135deg,#1a1a00,#2a1a00);
    border-bottom:1px solid #ffaa0044;
    padding:10px 16px; display:flex; align-items:center;
    gap:10px; font-size:13px;
  `
  banner.innerHTML = `
    <span>📧</span>
    <span style="flex:1;color:#ffaa88;">Verify your email to unlock all features</span>
    <button onclick="resendVerification()" style="padding:5px 12px;background:#ffaa00;border:none;border-radius:8px;color:#000;font-size:12px;font-weight:700;cursor:pointer;">Resend</button>
    <button onclick="document.getElementById('verifyBanner').remove();localStorage.setItem('email_verified','dismissed')" style="background:none;border:none;color:#666;cursor:pointer;font-size:16px;">✕</button>
  `
  document.body.prepend(banner)
})

async function resendVerification() {
  try {
    const res = await fetch(SERVER + "/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: getToken() })
    })
    const data = await res.json()
    showToast(data.message || "Verification email sent!")
    document.getElementById("verifyBanner")?.remove()
    localStorage.setItem("email_verified", "sent")
  } catch(e) { showToast("Failed to send email") }
}

window.resendVerification = resendVerification

// AUTO UPDATE - detect new version and reload
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").then(reg => {

    // Check for updates every 30 seconds
    setInterval(() => reg.update(), 30000)

    // New version found - show update toast
    reg.addEventListener("updatefound", () => {
      const newWorker = reg.installing
      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          showUpdateToast()
        }
      })
    })
  })

  // When new SW takes control - reload page
  let refreshing = false
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!refreshing) {
      refreshing = true
      window.location.reload()
    }
  })
}

function showUpdateToast() {
  const toast = document.createElement("div")
  toast.style.cssText = `
    position:fixed; bottom:90px; left:50%; transform:translateX(-50%);
    background:#111; border:1px solid #00ff8844;
    border-radius:16px; padding:12px 20px;
    display:flex; align-items:center; gap:12px;
    z-index:9999; box-shadow:0 8px 24px rgba(0,0,0,0.5);
    animation:slideUp 0.3s ease; white-space:nowrap;
  `
  toast.innerHTML = `
    <span style="font-size:18px;">🚀</span>
    <span style="font-size:13px;color:#aaa;">New update available!</span>
    <button onclick="updateApp()" style="padding:6px 14px;background:linear-gradient(135deg,#00cc6a,#00aaff);border:none;border-radius:20px;color:white;font-size:12px;font-weight:700;cursor:pointer;">Update</button>
    <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#555;cursor:pointer;font-size:16px;">✕</button>
  `
  document.body.appendChild(toast)
}

function updateApp() {
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage("skipWaiting")
  }
  window.location.reload(true)
}

window.updateApp = updateApp

// FORCE UPDATE - clear all cache and reload
function forceUpdate() {
  showToast("Updating app...")
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(reg => reg.unregister())
    })
  }
  // Clear all caches
  if ("caches" in window) {
    caches.keys().then(keys => {
      keys.forEach(key => caches.delete(key))
    })
  }
  // Hard reload after 500ms
  setTimeout(() => window.location.reload(true), 500)
}

window.forceUpdate = forceUpdate

// Show update button after 5 seconds
setTimeout(() => {
  const btn = document.getElementById("updateBtn")
  if (btn) btn.style.display = "flex"
}, 5000)

// SW update detection
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").then(reg => {
    reg.addEventListener("updatefound", () => {
      const nw = reg.installing
      nw.addEventListener("statechange", () => {
        if (nw.state === "installed" && navigator.serviceWorker.controller) {
          const btn = document.getElementById("updateBtn")
          if (btn) {
            btn.style.display = "flex"
            btn.style.animation = "pulse 1s infinite"
            btn.title = "New update available! Tap to update"
          }
          showToast("🚀 Update available! Tap ↻ to refresh")
        }
      })
    })
  }).catch(e => console.log("SW:", e))

  let refreshing = false
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!refreshing) { refreshing = true; window.location.reload() }
  })
}

window.confirmDelete = confirmDelete
window.deleteChat = deleteChat

// EXPORT CHAT
async function exportChat() {
  if (!currentChatId) return showToast("No chat to export")
  try {
    const res = await fetch(SERVER + "/chat/" + currentChatId + "/export", { headers: { "Authorization": "Bearer " + getToken() } })
    if (!res.ok) return showToast("Export failed")
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "datta-ai-chat.txt"
    a.click()
    URL.revokeObjectURL(url)
    showToast("Chat exported!")
  } catch(e) { showToast("Export failed") }
}
window.exportChat = exportChat

// REFERRAL
async function showReferral() {
  try {
    const res = await fetch(SERVER + "/referral/code", { headers: { "Authorization": "Bearer " + getToken() } })
    const data = await res.json()
    const msg = `Your referral code: ${data.code}

Share this with friends!
You get +10 messages per referral.

You've referred: ${data.referredCount} people
Bonus messages earned: ${data.bonusMessages}`
    const shareText = `Try Datta AI - Free AI Assistant!
Use my code ${data.code} at signup for 5 bonus messages!
https://datta-ai.com`
    if (navigator.share) {
      navigator.share({ title: "Datta AI Referral", text: shareText })
    } else {
      navigator.clipboard.writeText(shareText)
      showToast("Referral link copied!")
      alert(msg)
    }
  } catch(e) { showToast("Could not load referral") }
}
window.showReferral = showReferral

// AI PERSONAS
function setPersona(key, label) {
  localStorage.setItem("datta_persona", key)
  localStorage.setItem("datta_persona_label", label)
  updateModeIndicator(key, label)
  showToast("Mode: " + label)
}

function updateModeIndicator(key, label) {
  const btn = document.getElementById("modeIndicator")
  const pill = document.getElementById("activeModelName")
  if (!btn) return
  if (!key || key === "none") {
    btn.style.display = "none"
    // Restore actual model name in pill
    const savedKey = localStorage.getItem("datta_model_key") || "d21"
    const savedName = { d21:"Datta 2.1", d42:"Datta 4.2", d48:"Datta 4.8", d54:"Datta 5.4", dcode:"Datta Code 💻", dthink:"Datta Think 🧠" }
    if (pill) pill.textContent = savedName[savedKey] || "Datta 2.1"
  } else {
    const icons = { lawyer:"⚖️", teacher:"📚", chef:"👨‍🍳", fitness:"💪", upsc:"🏛️", student:"📖", interview:"🎯", business:"💼" }
    btn.textContent = (icons[key] || "✨") + " " + label
    btn.style.display = "flex"
    // Show Datta 1.1 in model pill
    if (pill) pill.textContent = "Datta 1.1"
  }
}

// Reload mode indicator from localStorage every time page is visible
function initModeIndicator() {
  const savedKey = localStorage.getItem("datta_persona") || "none"
  const savedLabel = localStorage.getItem("datta_persona_label") || "Normal"
  updateModeIndicator(savedKey, savedLabel)
  // Also restore model pill
  const pill = document.getElementById("activeModelName")
  if (pill) {
    if (savedKey && savedKey !== "none") {
      pill.textContent = "Datta 1.1"
    } else {
      const modelKey = localStorage.getItem("datta_model_key") || "d21"
      const names = { d21:"Datta 2.1", d42:"Datta 4.2", d48:"Datta 4.8", d54:"Datta 5.4", dcode:"Datta Code 💻", dthink:"Datta Think 🧠" }
      pill.textContent = names[modelKey] || "Datta 2.1"
    }
  }
}

// Run on initial load
window.addEventListener("load", initModeIndicator)

// Run when user comes BACK from settings page (pageshow fires on back navigation)
window.addEventListener("pageshow", function(e) {
  initModeIndicator()
})

// Run when tab becomes visible again
document.addEventListener("visibilitychange", function() {
  if (!document.hidden) initModeIndicator()
})

// Run when window gets focus (user switches back)
window.addEventListener("focus", function() {
  initModeIndicator()
})

window.setPersona = setPersona
window.updateModeIndicator = updateModeIndicator

function getPersonaModel() {
  const persona = localStorage.getItem("datta_persona")
  if (persona && persona !== "none") {
    // Auto-switch to Datta 1.1 for persona modes
    return "persona-" + persona
  }
  return localStorage.getItem("datta_model") || "llama-3.1-8b-instant"
}

// ── MODEL DROPDOWN ──────────────────────────────────────────────────────────
function toggleModelDropdown() {
  const dd = document.getElementById("modelDropdown")
  if (!dd) return
  const isOpen = dd.style.display === "block"
  if (isOpen) {
    dd.style.display = "none"
    _ddOpen = false
  } else {
    // Position above input area
    const pill = document.getElementById("activeModelPill")
    if (pill) {
      const rect = pill.getBoundingClientRect()
      dd.style.bottom = (window.innerHeight - rect.top + 8) + "px"
    } else {
      dd.style.bottom = "100px"
    }
    dd.style.display = "block"
    dd.style.position = "fixed"
    dd.style.left = "12px"
    dd.style.right = "12px"
    dd.style.zIndex = "100000"
    _ddOpen = true
    _ddClickTime = Date.now()
  }
}

function closeModelDropdown() {
  _ddOpen = false
  const dd = document.getElementById("modelDropdown")
  if (dd) dd.style.display = "none"
}

// Close when clicking outside
document.addEventListener("click", function(e) {
  if (!_ddOpen) return
  if (Date.now() - _ddClickTime < 400) return  // debounce
  if (!e.target.closest("#activeModelPill") && !e.target.closest("#modelDropdown")) {
    closeModelDropdown()
  }
})

function selectInputModel(modelId, key, label) {
  // Update pill text
  const pill = document.getElementById("activeModelName")
  if (pill) pill.textContent = label

  // Update checkmarks
  document.querySelectorAll(".modelDropItem").forEach(d => d.classList.remove("active"))
  const allChecks = document.querySelectorAll("[id^='mdic-']")
  allChecks.forEach(c => c.textContent = "")
  const item = document.getElementById("mdi-" + key)
  const check = document.getElementById("mdic-" + key)
  if (item) item.classList.add("active")
  if (check) check.textContent = "✓"

  // Save
  localStorage.setItem("datta_model", modelId)
  localStorage.setItem("datta_model_key", key)

  // Sync topbar
  const btnName = document.getElementById("modelBtnName")
  if (btnName) btnName.textContent = label

  closeModelDropdown()
  showToast(label)
}

// Init on load
window.addEventListener("DOMContentLoaded", function() {
  const key = localStorage.getItem("datta_model_key") || "d21"
  const m = modelData[key]
  if (m) {
    const pill = document.getElementById("activeModelName")
    if (pill) pill.textContent = m.name
    const item = document.getElementById("mdi-" + key)
    const check = document.getElementById("mdic-" + key)
    if (item) item.classList.add("active")
    if (check) check.textContent = "✓"
  }
})

window.toggleModelDropdown = toggleModelDropdown
window.closeModelDropdown = closeModelDropdown
window.selectInputModel = selectInputModel

// Check if user can access premium models
function checkModelAccess(key) {
  const plan = localStorage.getItem("datta_plan") || "free"

  // Plans that cannot use Datta 5.4 at all
  const noD54Plans = ["free", "starter"]
  // Plans with limited Datta 5.4 (standard) — allowed but show note
  const limitedD54Plans = ["standard"]

  if (key === "d54" && noD54Plans.includes(plan)) {
    closeModelDropdown()
    const overlay = document.createElement("div")
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;"
    overlay.innerHTML = `
      <div style="background:var(--bg2);border:1px solid rgba(255,136,0,0.3);border-radius:20px;padding:28px 24px;max-width:340px;width:100%;text-align:center;">
        <div style="font-size:36px;margin-bottom:12px;">🔒</div>
        <div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:8px;">Datta 5.4 Locked</div>
        <div style="font-size:13px;color:var(--text3);margin-bottom:14px;">Your current plan doesn't include Datta 5.4.</div>
        <div style="background:var(--bg3);border-radius:12px;padding:14px;margin-bottom:16px;text-align:left;">
          <div style="font-size:12px;color:var(--text3);margin-bottom:8px;">UPGRADE OPTIONS</div>
          <div style="font-size:13px;color:var(--text2);margin-bottom:6px;">⭐ <strong>Standard ₹149/mo</strong> — Datta 5.4 limited</div>
          <div style="font-size:13px;color:var(--text2);">⚡ <strong>Plus ₹299/mo</strong> — Full Datta 5.4 + Priority</div>
        </div>
        <a href="pricing.html" style="display:block;padding:12px;background:linear-gradient(135deg,#ff8800,#ffaa00);border-radius:12px;color:#000;font-weight:700;text-decoration:none;margin-bottom:10px;font-size:14px;">View Plans →</a>
        <button onclick="this.closest('div').parentElement.remove()" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:13px;font-family:inherit;">Maybe later</button>
      </div>`
    overlay.onclick = e => { if (e.target === overlay) overlay.remove() }
    document.body.appendChild(overlay)
    return
  }

  if (key === "d54" && limitedD54Plans.includes(plan)) {
    // Standard plan — allow but show limited notice as toast
    showToast("Datta 5.4 (limited) — upgrade to Plus for full access")
  }

  // Has access — select the model
  const models = { d54: { id:"llama-3.3-70b-versatile", name:"Datta 5.4" } }
  const m = models[key]
  if (m) selectInputModel(m.id, key, m.name)
}
window.checkModelAccess = checkModelAccess

// Update usage display in model dropdown + anywhere else showing usage
function updateUsageDisplay(used, limit) {
  var lim = limit || 10
  var pct = Math.min(100, Math.round((used / lim) * 100))

  // Sidebar usage display
  const el = document.getElementById("usageDisplay")
  if (el) el.textContent = used + " / " + lim + " messages today"

  // Usage bar
  const bar = document.getElementById("usageBar")
  if (bar) {
    bar.style.width = pct + "%"
    bar.style.background = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f97316" : "var(--accent)"
  }

  // Mobile header usage badge (if exists)
  const mobileEl = document.getElementById("mobileUsageDisplay")
  if (mobileEl) mobileEl.textContent = used + "/" + lim

  // Any usage-count elements
  document.querySelectorAll(".usage-count").forEach(el => {
    el.textContent = used + " / " + lim
  })

  // Warning when nearly out
  if (pct >= 90 && used < lim) {
    const warn = document.getElementById("usageWarn")
    if (warn) { warn.textContent = "⚠️ " + (lim - used) + " messages left today"; warn.style.display = "block" }
  }
}
window.updateUsageDisplay = updateUsageDisplay

// Standalone fetch — call any time to refresh counter
function refreshUsageCounter() {
  const tok = typeof getToken === "function" ? getToken() : localStorage.getItem("datta_token")
  if (!tok) {
    // Token not ready yet — retry after 1 second
    setTimeout(refreshUsageCounter, 1000)
    return
  }
  fetch(SERVER + "/payment/usage", { headers: { "Authorization": "Bearer " + tok } })
    .then(r => r.ok ? r.json() : null)
    .then(u => {
      if (u && typeof u.used === "number") {
        updateUsageDisplay(u.used, u.limit || 10)
        // Also store in localStorage so sidebar can read it
        localStorage.setItem("datta_usage_used", u.used)
        localStorage.setItem("datta_usage_limit", u.limit || 10)
      }
    })
    .catch(() => {})
}
window.refreshUsageCounter = refreshUsageCounter

// ── CODE AGENT ─────────────────────────────────────────────────────────────────
function openCodeAgent() {
  // Close sidebar on mobile
  const sidebar = document.getElementById("sidebar")
  if (sidebar && window.innerWidth < 768) sidebar.classList.remove("open","show")

  // Start a new chat with Code Agent mode
  newChat()

  // Switch to Datta Code model
  selectInputModel("qwen-2.5-coder-32b-instruct", "dcode", "Datta Code 💻")

  // Set placeholder and show prompt
  const msgInput = document.getElementById("message")
  if (msgInput) {
    msgInput.placeholder = "Paste your code here and describe what you need..."
    msgInput.focus()
  }

  // Show welcome message in chat
  setTimeout(() => {
    const chatBox = document.getElementById("chatBox")
    if (!chatBox) return
    chatBox.innerHTML = `
      <div class="msg-row">
        <div class="aiContent">
          <div class="ai-bubble" style="padding:16px;background:var(--bg2);border:1px solid var(--border);border-radius:16px;">
            <div style="font-size:18px;margin-bottom:10px;">💻 Datta Code Agent</div>
            <p style="color:var(--text2);margin-bottom:12px;">I can help you with any coding task. Here's what I can do:</p>
            <div style="display:flex;flex-direction:column;gap:8px;">
              <div style="background:var(--bg3);border-radius:10px;padding:10px 14px;cursor:pointer;" onclick="setCodeAgentMode('fix')">
                🔧 <strong>Fix bugs</strong> — Paste your code + error message
              </div>
              <div style="background:var(--bg3);border-radius:10px;padding:10px 14px;cursor:pointer;" onclick="setCodeAgentMode('review')">
                🔍 <strong>Code review</strong> — Find security issues and improvements
              </div>
              <div style="background:var(--bg3);border-radius:10px;padding:10px 14px;cursor:pointer;" onclick="setCodeAgentMode('build')">
                🏗️ <strong>Build feature</strong> — Describe what you want to add
              </div>
              <div style="background:var(--bg3);border-radius:10px;padding:10px 14px;cursor:pointer;" onclick="setCodeAgentMode('explain')">
                📖 <strong>Explain code</strong> — Understand what code does
              </div>
              <div style="background:var(--bg3);border-radius:10px;padding:10px 14px;cursor:pointer;" onclick="setCodeAgentMode('optimize')">
                ⚡ <strong>Optimize</strong> — Make code faster and cleaner
              </div>
            </div>
            <p style="color:var(--text3);font-size:12px;margin-top:14px;">Or just paste your code and ask anything — I understand all languages.</p>
          </div>
        </div>
      </div>
    `
    lucide.createIcons()
  }, 100)
}

function setCodeAgentMode(mode) {
  const msgInput = document.getElementById("message")
  if (!msgInput) return
    const prompts = {
    fix: "Here is my code and the error I am getting:\n\n```\n[paste your code here]\n```\n\nError: [paste error message]\n\nPlease fix it and explain what was wrong.",
    review: "Please review this code for bugs, security issues, and improvements:\n\n```\n[paste your code here]\n```",
    build: "I have this existing code:\n\n```\n[paste your code here]\n```\n\nI want to add: [describe the feature]",
    explain: "Please explain what this code does, step by step:\n\n```\n[paste your code here]\n```",
    optimize: "Please optimize this code for better performance and readability:\n\n```\n[paste your code here]\n```"
  }
  msgInput.value = prompts[mode] || ""
  msgInput.focus()
  // Auto-resize textarea
  msgInput.style.height = "auto"
  msgInput.style.height = Math.min(msgInput.scrollHeight, 200) + "px"
}
window.setCodeAgentMode = setCodeAgentMode
window.openCodeAgent = openCodeAgent

// ── EXAM SOLVER SHORTCUT ───────────────────────────────────────────────────────
function openExamSolver() {
  // Close sidebar on mobile
  const sidebar = document.getElementById("sidebar")
  if (sidebar && window.innerWidth < 768) sidebar.classList.remove("open","show")

  newChat()

  setTimeout(() => {
    const chatBox = document.getElementById("chatBox")
    if (!chatBox) return
    chatBox.innerHTML = `
      <div class="msg-row">
        <div class="aiContent">
          <div class="ai-bubble" style="padding:16px;background:var(--bg2);border:1px solid var(--border);border-radius:16px;">
            <div style="font-size:18px;margin-bottom:10px;">📝 Exam Solver</div>
            <p style="color:var(--text2);margin-bottom:12px;">Upload your question paper image and I'll answer every question completely.</p>
            <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
              <div style="background:var(--bg3);border-radius:10px;padding:10px 14px;font-size:13px;">
                ✅ Works for any subject — Farm Management, Physics, Chemistry, History, Engineering
              </div>
              <div style="background:var(--bg3);border-radius:10px;padding:10px 14px;font-size:13px;">
                ✅ Answers based on marks — 1 mark, 2 marks, 4 marks
              </div>
              <div style="background:var(--bg3);border-radius:10px;padding:10px 14px;font-size:13px;">
                ✅ Complete answers — never leaves questions blank
              </div>
            </div>
            <p style="color:var(--text3);font-size:13px;">📎 Click the attachment icon below and upload your question paper image to start.</p>
          </div>
        </div>
      </div>
    `
    lucide.createIcons()
  }, 100)
}
window.openExamSolver = openExamSolver


// ══════════════════════════════════════════════════════
// AI LENS - Google Lens like feature
// ══════════════════════════════════════════════════════
let lensStream = null
let lensMode = "smart"
let lensLastImage = null
let lensLastResult = ""

const lensModePrompts = {
  smart: `You are an AI with Google Lens-level intelligence. Analyze this image and:
1. If it contains a QUESTION or PROBLEM (math, science, general knowledge, riddle) → SOLVE IT DIRECTLY with a clear answer
2. If it contains TEXT → Read and extract all text clearly  
3. If it shows an OBJECT, PRODUCT, PLANT, ANIMAL, PLACE → Identify it with key facts
4. If it shows CODE → Explain and debug it
5. If it shows a DOCUMENT or FORM → Extract the key information

Be like Google Lens: give a DIRECT, USEFUL answer immediately. No preamble. Start with the answer.`,
  identify: "Identify everything in this image. Objects, brands, places, people, animals, plants. Give name + key facts about the most prominent thing. Be specific and direct.",
  text: "Extract ALL text from this image exactly as written. Preserve formatting. Include numbers, signs, labels. If a question is found, also answer it.",
  solve: "This image likely contains a math problem, equation, or question. SOLVE IT completely. Show step-by-step working. Give the final answer clearly at the end.",
  translate: "Read all text in this image. Identify the language and translate to English. Also answer any questions found in the text."
}

async function openLens() {
  const overlay = document.getElementById("lensOverlay")
  if (!overlay) return
  overlay.style.display = "flex"
  document.getElementById("lensResult").style.display = "none"

  try {
    lensStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }
    })
    const video = document.getElementById("lensVideo")
    video.srcObject = lensStream
  } catch(e) {
    alert("Camera access denied. Please allow camera access.")
    closeLens()
  }
}

function closeLens() {
  const overlay = document.getElementById("lensOverlay")
  if (overlay) overlay.style.display = "none"
  if (lensStream) {
    lensStream.getTracks().forEach(t => t.stop())
    lensStream = null
  }
}

function setLensMode(mode) {
  lensMode = mode
  document.querySelectorAll(".lensModeBtn").forEach(b => {
    b.classList.remove("active")
    b.style.background = "rgba(255,255,255,0.05)"
    b.style.borderColor = "#333"
    b.style.color = "#aaa"
  })
  const btn = document.getElementById("lensMode-" + mode)
  if (btn) {
    btn.classList.add("active")
    btn.style.background = "rgba(0,255,136,0.2)"
    btn.style.borderColor = "#00ff88"
    btn.style.color = "#00ff88"
  }
}

async function captureAndAnalyze() {
  const video = document.getElementById("lensVideo")
  const canvas = document.getElementById("lensCanvas")
  const btn = document.getElementById("lensCaptureBtn")

  // Capture and COMPRESS frame - resize to max 800px
  const maxSize = 800
  let w = video.videoWidth
  let h = video.videoHeight
  if (w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize }
  if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize }

  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  ctx.drawImage(video, 0, 0, w, h)
  // Quality 0.7 = good quality but smaller size
  const imageData = canvas.toDataURL("image/jpeg", 0.7)
  lensLastImage = imageData

  // Show result panel with loading
  const resultDiv = document.getElementById("lensResult")
  const resultText = document.getElementById("lensResultText")
  resultDiv.style.display = "block"
  resultText.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;color:#555;font-size:13px;">
      <div class="thinkOrb" style="--orb-color:#00ff88;--orb-glow:rgba(0,255,136,0.3);width:20px;height:20px;flex-shrink:0;">
        <div class="thinkOrbCore" style="width:8px;height:8px;"></div>
      </div>
      <span>Analyzing image...</span>
    </div>`

  // Change capture btn to loading
  const capBtn = document.getElementById("lensCaptureBtn")
  if (capBtn) capBtn.style.opacity = "0.5"

  try {
    const base64 = imageData.split(",")[1]
    const prompt = lensModePrompts[lensMode]

    const res = await fetch(SERVER + "/lens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: base64, prompt, token: getToken() })
    })

    const data = await res.json()
    if (data.result) {
      lensLastResult = data.result
      // Render with markdown-like formatting
      const formatted = data.result
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.*?)\*/g, "<em>$1</em>")
        .replace(/^#{1,3} (.+)$/gm, "<div style='font-weight:700;color:white;margin:8px 0 4px;'>$1</div>")
        .replace(/\n\n/g, "<br><br>")
        .replace(/\n/g, "<br>")
      resultText.innerHTML = formatted
    } else {
      resultText.innerHTML = '<div style="color:#ff6666;">Could not analyze. Try again.</div>'
    }
  } catch(e) {
    resultText.innerHTML = '<div style="color:#ff6666;">Error: ' + e.message + '</div>'
  }

  if (capBtn) capBtn.style.opacity = "1"
}

function lensFromGallery(input) {
  const file = input.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = async (e) => {
    lensLastImage = e.target.result
    const btn = document.getElementById("lensCaptureBtn")
    const resultDiv = document.getElementById("lensResult")
    const resultText = document.getElementById("lensResultText")
    resultDiv.style.display = "block"
    resultText.innerHTML = '<div style="color:#555;font-size:13px;">🔍 Analyzing image...</div>'
    btn.textContent = "⏳"
    btn.disabled = true

    try {
      const base64 = e.target.result.split(",")[1]
      const prompt = lensModePrompts[lensMode]
      const res = await fetch(SERVER + "/lens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, prompt, token: getToken() })
      })
      const data = await res.json()
      if (data.result) {
        resultText.innerHTML = data.result.replace(/\n/g, "<br>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      }
    } catch(e) {
      resultText.innerHTML = '<div style="color:#ff6666;">Error: ' + e.message + '</div>'
    }
    btn.textContent = "📸"
    btn.disabled = false
  }
  reader.readAsDataURL(file)
}

function sendLensToChat() {
  closeLens()
  if (!lensLastImage) return
  // Convert base64 to blob and set as file input
  fetch(lensLastImage)
    .then(r => r.blob())
    .then(blob => {
      const file = new File([blob], "lens-capture.jpg", { type: "image/jpeg" })
      const dt = new DataTransfer()
      dt.items.add(file)
      const input = document.getElementById("imageInput")
      if (input) {
        input.files = dt.files
        showFilePreview(file)
      }
      // Focus message input
      const msg = document.getElementById("message")
      if (msg) { msg.focus(); msg.placeholder = "Ask about this image..." }
    })
}

function toggleLensFlash() {
  if (!lensStream) return
  const track = lensStream.getVideoTracks()[0]
  if (!track) return
  const btn = document.getElementById("flashBtn")
  try {
    const caps = track.getCapabilities()
    if (caps.torch) {
      const settings = track.getSettings()
      track.applyConstraints({ advanced: [{ torch: !settings.torch }] })
      btn.textContent = settings.torch ? "⚡" : "🔦"
    }
  } catch(e) {}
}

window.openLens = openLens
window.closeLens = closeLens
window.setLensMode = setLensMode
window.captureAndAnalyze = captureAndAnalyze
window.lensFromGallery = lensFromGallery
window.sendLensToChat = sendLensToChat
window.toggleLensFlash = toggleLensFlash
// ════════════════════════════════════════
// NOTES FEATURE — desktop/tablet only
// ════════════════════════════════════════
let notesSaveTimer = null

function toggleNotes() {
  if (window.innerWidth < 768) return
  notesOpen = !notesOpen
  const panel = document.getElementById("notesPanel")
  const btn = document.getElementById("notesToggleBtn")

  if (notesOpen) {
    panel.classList.add("open")
    btn.classList.add("active")
    document.body.classList.add("notes-open")
    // Load saved notes
    const saved = localStorage.getItem("datta_notes") || ""
    const textarea = document.getElementById("notesTextarea")
    if (textarea) {
      textarea.value = saved
      updateNotesCount()
      setTimeout(() => textarea.focus(), 350)
    }
  } else {
    panel.classList.remove("open")
    btn.classList.remove("active")
    document.body.classList.remove("notes-open")
  }
}

function updateNotesCount() {
  const textarea = document.getElementById("notesTextarea")
  const counter = document.getElementById("notesCharCount")
  if (!textarea || !counter) return
  const len = textarea.value.length
  counter.textContent = len + " character" + (len !== 1 ? "s" : "")
}

function autoSaveNotes() {
  const textarea = document.getElementById("notesTextarea")
  const status = document.getElementById("notesSavedStatus")
  if (!textarea) return

  localStorage.setItem("datta_notes", textarea.value)
  updateNotesCount()

  // Show saving... then Saved
  if (status) {
    status.textContent = "Saving..."
    status.style.color = "rgba(200,200,100,0.6)"
    clearTimeout(notesSaveTimer)
    notesSaveTimer = setTimeout(() => {
      status.textContent = "Saved"
      status.style.color = "rgba(0,201,167,0.6)"
    }, 600)
  }
}

function copyNotes() {
  const textarea = document.getElementById("notesTextarea")
  if (!textarea || !textarea.value.trim()) { showToast("Nothing to copy"); return }
  navigator.clipboard.writeText(textarea.value)
  showToast("Notes copied!")
}

function clearNotes() {
  const textarea = document.getElementById("notesTextarea")
  if (!textarea || !textarea.value.trim()) return
  if (!confirm("Clear all notes? This cannot be undone.")) return
  textarea.value = ""
  localStorage.removeItem("datta_notes")
  updateNotesCount()
  showToast("Notes cleared")
}

function downloadNotes() {
  const textarea = document.getElementById("notesTextarea")
  if (!textarea || !textarea.value.trim()) { showToast("Nothing to download"); return }
  const blob = new Blob([textarea.value], { type: "text/plain" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "datta-notes-" + new Date().toLocaleDateString("en-IN").replace(/\//g,"-") + ".txt"
  a.click()
  URL.revokeObjectURL(url)
  showToast("Notes downloaded!")
}

// Auto-save on typing
window.addEventListener("DOMContentLoaded", function() {
  const textarea = document.getElementById("notesTextarea")
  if (textarea) {
    textarea.addEventListener("input", autoSaveNotes)
  }
  // Close notes if window resizes to phone
  window.addEventListener("resize", function() {
    if (window.innerWidth < 768 && notesOpen) {
      notesOpen = false
      const panel = document.getElementById("notesPanel")
      const btn = document.getElementById("notesToggleBtn")
      if (panel) panel.classList.remove("open")
      if (btn) btn.classList.remove("active")
      document.body.classList.remove("notes-open")
    }
  })
})

window.toggleNotes = toggleNotes
window.copyNotes = copyNotes
window.clearNotes = clearNotes
window.downloadNotes = downloadNotes

// Inject context menu styles
;(function(){
  if (document.getElementById("ctxMenuStyle")) return
  const s = document.createElement("style")
  s.id = "ctxMenuStyle"
  s.textContent = `
    .ctx-item {
      display:flex; align-items:center; gap:8px;
      padding:8px 12px; border-radius:7px; cursor:pointer;
      color:var(--text2); transition:background 0.12s;
    }
    .ctx-item:hover { background:var(--bg3); color:var(--text); }
    .ctx-delete:hover { background:rgba(220,60,60,0.12); color:#e55; }
    .chat-item-menu {
      opacity:0; background:none; border:none;
      color:var(--text3); cursor:pointer; padding:2px 4px;
      border-radius:5px; display:flex; align-items:center;
      flex-shrink:0; transition:opacity 0.12s, background 0.12s;
    }
    .chat-item:hover .chat-item-menu { opacity:1; }
    .chat-item-menu:hover { background:var(--bg3); color:var(--text); }
  `
  document.head.appendChild(s)
})()

// ══════════════════════════════════════════════════════════════════
// ARTIFACTS — Claude-style live code preview panel
// ══════════════════════════════════════════════════════════════════

var _artifactCode = ""
var _artifactLang = ""
var _artifactFileName = ""

function openArtifact(code, lang, title) {
  _artifactCode = code
  _artifactLang = lang || "html"
  _artifactFileName = title || ("artifact." + (_artifactLang === "html" ? "html" : _artifactLang === "css" ? "css" : _artifactLang === "python" ? "py" : "js"))

  const panel = document.getElementById("artifactPanel")
  const titleEl = document.getElementById("artifactTitle")
  const langEl = document.getElementById("artifactLang")
  const codeView = document.getElementById("artifactCodeView")

  if (!panel) return

  // Set title and lang
  if (titleEl) titleEl.textContent = _artifactFileName
  if (langEl) langEl.textContent = _artifactLang.toUpperCase()

  // Show code
  if (codeView) codeView.textContent = code

  // Switch to code tab by default
  switchArtifactTab("code")

  // Open panel
  panel.classList.add("open")
  document.body.classList.add("artifact-open")

  // Auto-switch to preview for HTML
  if (_artifactLang === "html") {
    setTimeout(() => switchArtifactTab("preview"), 300)
  }
}

function closeArtifact() {
  const panel = document.getElementById("artifactPanel")
  if (panel) panel.classList.remove("open")
  document.body.classList.remove("artifact-open")
}

function switchArtifactTab(tab) {
  const codeView = document.getElementById("artifactCodeView")
  const preview = document.getElementById("artifactPreview")
  const tabCode = document.getElementById("tabCode")
  const tabPreview = document.getElementById("tabPreview")

  if (tab === "code") {
    if (codeView) codeView.classList.add("active")
    if (preview) preview.classList.remove("active")
    if (tabCode) tabCode.classList.add("active")
    if (tabPreview) tabPreview.classList.remove("active")
  } else {
    if (codeView) codeView.classList.remove("active")
    if (preview) preview.classList.add("active")
    if (tabCode) tabCode.classList.remove("active")
    if (tabPreview) tabPreview.classList.add("active")
    // Load preview
    if (preview && _artifactCode) {
      if (_artifactLang === "html") {
        preview.srcdoc = _artifactCode
      } else if (_artifactLang === "css") {
        preview.srcdoc = "<style>" + _artifactCode + "</style><div style='padding:20px;font-family:sans-serif;'>CSS Preview</div>"
      } else {
        preview.srcdoc = "<pre style='padding:20px;font-family:monospace;white-space:pre-wrap;'>" + _artifactCode + "</pre>"
      }
    }
  }
}

function copyArtifact() {
  if (_artifactCode) {
    navigator.clipboard.writeText(_artifactCode)
    showToast("✅ Code copied!")
  }
}

function downloadArtifact() {
  if (!_artifactCode) return
  const blob = new Blob([_artifactCode], { type: "text/plain" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = _artifactFileName
  a.click()
  URL.revokeObjectURL(a.href)
  showToast("📥 Downloaded!")
}

function openArtifactInNewTab() {
  if (!_artifactCode) return
  const blob = new Blob([_artifactCode], { type: "text/html" })
  const url = URL.createObjectURL(blob)
  window.open(url, "_blank")
}

// Detect code blocks in AI response and show in artifact panel
function detectAndOpenArtifact(responseText) {
  // Simple extraction - find largest code block
  const allBlocks = responseText.match(/```(\w+)?\n([\s\S]*?)```/g) || []
  if (allBlocks.length === 0) return false

  let largestBlock = allBlocks[0]
  for (const b of allBlocks) {
    if (b.length > largestBlock.length) largestBlock = b
  }

  const langMatch = largestBlock.match(/```(\w+)?/)
  const rawLang = (langMatch && langMatch[1]) ? langMatch[1].toLowerCase() : "html"
  const lang = rawLang === "javascript" ? "js" : rawLang === "python" ? "py" : rawLang === "jsx" ? "html" : rawLang === "typescript" ? "js" : rawLang
  const code = largestBlock.replace(/```\w*\n?/, "").replace(/```$/, "").trim()

  // Only open for substantial code (not tiny snippets)
  if (code.length < 200) return false

  // Generate smart title
  const ext = lang === "js" ? "js" : lang === "py" ? "py" : lang === "css" ? "css" : "html"
  const title = "artifact." + ext
  openArtifact(code, lang, title)
  return true
}

window.openArtifact = openArtifact
window.closeArtifact = closeArtifact
window.switchArtifactTab = switchArtifactTab
window.copyArtifact = copyArtifact
window.downloadArtifact = downloadArtifact
window.openArtifactInNewTab = openArtifactInNewTab
window.detectAndOpenArtifact = detectAndOpenArtifact
// ── QUICK TOOLS ────────────────────────────────────────────────────────────────
function useTool(tool) {
  const msgInput = document.getElementById("message")
  if (!msgInput) return

  const templates = {
    weather: "What is the weather in ",
    currency: "Convert 100 USD to INR",
    news: "What is the latest news about ",
    calculate: "Calculate: ",
    translate: "Translate to Hindi: "
  }

  const template = templates[tool] || ""
  msgInput.value = template
  msgInput.focus()

  // Place cursor at end
  msgInput.setSelectionRange(template.length, template.length)

  // Auto-resize
  msgInput.style.height = "auto"
  msgInput.style.height = Math.min(msgInput.scrollHeight, 200) + "px"
}
window.useTool = useTool

// ── ARTIFACTS PAGE — show all generated artifacts ──────────────────────────────
function openArtifactsPage() {
  const sidebar = document.getElementById("sidebar")
  if (sidebar && window.innerWidth < 768) sidebar.classList.remove("open","show")

  // Check if there is a current artifact open
  const panel = document.getElementById("artifactPanel")
  if (panel && panel.classList.contains("open")) {
    // Already open — just focus it
    return
  }

  // Show a message explaining artifacts
  const chatBox = document.getElementById("chatBox")
  if (!chatBox) return

  hideWelcome && hideWelcome()

  chatBox.innerHTML = `
    <div class="msg-row">
      <div class="aiContent">
        <div class="ai-bubble" style="padding:20px;background:var(--bg2);border:1px solid var(--border);border-radius:16px;max-width:520px;">
          <div style="font-size:20px;margin-bottom:12px;">🎨 Artifacts</div>
          <p style="color:var(--text2);margin-bottom:16px;line-height:1.7;">Artifacts are generated code, websites, and apps that appear in the preview panel. When Datta AI writes HTML, CSS, or JavaScript code, it automatically opens in the artifact panel so you can see it live.</p>
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
            <div style="background:var(--bg3);border-radius:10px;padding:10px 14px;font-size:13px;">
              <strong style="color:var(--text);">💻 Code preview</strong> — See your HTML/CSS running live as it generates
            </div>
            <div style="background:var(--bg3);border-radius:10px;padding:10px 14px;font-size:13px;">
              <strong style="color:var(--text);">📋 Copy & Download</strong> — One click to copy or save any generated file
            </div>
            <div style="background:var(--bg3);border-radius:10px;padding:10px 14px;font-size:13px;">
              <strong style="color:var(--text);">🌐 Open in new tab</strong> — Launch your generated website directly
            </div>
          </div>
          <p style="color:var(--text3);font-size:13px;">Try asking: <em>"Build me a landing page for my app"</em> or <em>"Create a calculator in HTML"</em></p>
          <div style="display:flex;gap:8px;margin-top:16px;">
            <button onclick="setCodeAgentMode && (document.getElementById('message').value='Build me a beautiful landing page for Datta AI in HTML with dark theme', document.getElementById('message').focus())" style="padding:8px 16px;border-radius:8px;border:1px solid var(--accent);background:rgba(16,163,127,0.1);color:var(--accent);font-size:13px;cursor:pointer;font-family:inherit;">Try it →</button>
          </div>
        </div>
      </div>
    </div>
  `
}
window.openArtifactsPage = openArtifactsPage
