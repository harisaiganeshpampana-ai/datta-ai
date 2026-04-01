const SERVER = "https://datta-ai-server.onrender.com"


// '''''''''''''''''''''''''''''''''''''''''''
// SINGLE INIT - runs everything on load
// '''''''''''''''''''''''''''''''''''''''''''
window.addEventListener("DOMContentLoaded", function() {
  var s = document.getElementById("addToChatSheet")
  var o = document.getElementById("addToChatOverlay")
  if (s) {
    s.style.setProperty("transform","translateY(120%)","important")
    s.style.setProperty("bottom","0","important")
  }
  if (o) o.style.setProperty("display","none","important")

  // If returning from settings with a last chat - hide welcome immediately
  const lastChat = localStorage.getItem("datta_last_chat")
  if (lastChat) {
    const welcome = document.getElementById("welcomeScreen")
    if (welcome) welcome.style.display = "none"
  }
})


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
  const btn = document.getElementById("actionMainBtn")
  const inner = document.getElementById("actionMainBtnInner")
  if (!btn || !inner) return

  if (val) {
    // Switch to STOP state
    btn.classList.remove("send-state")
    btn.classList.add("stop-state")
    inner.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="rgba(255,100,100,0.9)">
      <rect x="3" y="3" width="18" height="18" rx="3"/>
    </svg>`
  } else {
    // Switch to SEND state
    btn.classList.remove("stop-state")
    btn.classList.add("send-state")
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
function hideStopBtn() { setGenerating(false) }

function stopGeneration() {
  if (controller) {
    controller.abort()
    controller = null
  }
  setGenerating(false)

  // Freeze partial response + show stopped message
  const streams = document.querySelectorAll(".stream")
  if (streams.length > 0) {
    const last = streams[streams.length - 1]
    if (last.textContent.trim()) {
      last.innerHTML = marked.parse(last.textContent)
    }
    // Show "stopped by user" message
    const user = JSON.parse(localStorage.getItem("datta_user") || "{}") 
    const name = user.username || "you"
    const stopMsg = document.createElement("div")
    stopMsg.className = "stoppedMsg"
    stopMsg.textContent = "Response stopped by " + name
    last.parentElement.appendChild(stopMsg)
  }

  // Re-enable input
  const msgInput = document.getElementById("message")
  if (msgInput) { msgInput.disabled = false; msgInput.focus() }
}

window.handleMainBtn = handleMainBtn
window.stopGeneration = stopGeneration

window.stopGeneration = stopGeneration

// Edit user message and resend
function editMessage(btn) {
  const row = btn.closest(".messageRow")
  const bubble = row.querySelector(".userBubble")
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
  const row = btn.closest(".messageRow")
  const bubble = row.querySelector(".userBubble")
  const text = bubble.textContent.trim()
  if (!text) return
  
  // Remove all messages from this point onwards
  const allRows = Array.from(document.querySelectorAll(".messageRow"))
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
  const chatBox = document.getElementById("chatBox")
  if (!chatBox) return
  hideWelcome()
  const aiDiv = document.createElement("div")
  aiDiv.className = "messageRow"
  aiDiv.innerHTML = `
    <div class="aiContent">
      <div class="aiBubble" id="lensResultBubble"></div>
/g, "<br>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</div>
      <div class="aiActions">
        <button class="actionBtn" title="Copy" onclick="navigator.clipboard.writeText(this.closest('.messageRow').querySelector('.aiBubble').innerText);showToast('Copied!')">
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

  // Beautiful headings with emoji icons
  renderer.heading = function(text, level) {
    const icons = { 1:"✨", 2:"📌", 3:"▶️" }
    const sizes = { 1:"22px", 2:"18px", 3:"16px" }
    const icon = icons[level] || "•"
    return `<div style="display:flex;align-items:center;gap:8px;margin:16px 0 8px;font-weight:700;font-size:${sizes[level]};color:#fff;font-family:'Josefin Sans',sans-serif;letter-spacing:0.5px;">
      <span>${icon}</span><span>${text}</span>
    </div>`
  }

  // Beautiful list items with checkmark style
  renderer.listitem = function(text) {
    return `<li style="display:flex;gap:8px;align-items:flex-start;margin:6px 0;line-height:1.7;">
      <span style="color:#00ff88;flex-shrink:0;margin-top:2px;">›</span>
      <span>${text}</span>
    </li>`
  }

  // Beautiful unordered list
  renderer.list = function(body, ordered) {
    const tag = ordered ? "ol" : "ul"
    return `<${tag} style="padding:0;margin:10px 0;list-style:none;">${body}</${tag}>`
  }

  // Beautiful blockquote
  renderer.blockquote = function(quote) {
    return `<blockquote style="border-left:3px solid #00ff88;padding:10px 16px;margin:12px 0;background:#0a1a0a;border-radius:0 8px 8px 0;color:#aaa;font-style:italic;">${quote}</blockquote>`
  }

  // Code with syntax highlight style
  renderer.code = function(code, lang) {
    const langLabel = lang ? `<span style="font-size:11px;color:#555;letter-spacing:1px;text-transform:uppercase;">${lang}</span>` : ""
    return `<div style="margin:12px 0;border-radius:10px;overflow:hidden;border:1px solid #1e1e1e;">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 14px;background:#0a0a0a;border-bottom:1px solid #1a1a1a;">
        ${langLabel}
        <button onclick="navigator.clipboard.writeText(this.closest('div').nextElementSibling.innerText);this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)"
          style="font-size:11px;color:#555;background:none;border:none;cursor:pointer;font-family:'Josefin Sans',sans-serif;letter-spacing:1px;">Copy</button>
      </div>
      <pre style="margin:0;padding:14px;background:#0d0d0d;overflow-x:auto;"><code style="font-family:'Courier New',monospace;font-size:13px;color:#e0e0e0;line-height:1.6;">${code.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</code></pre>
    </div>`
  }

  // Inline code
  renderer.codespan = function(code) {
    return `<code style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:5px;padding:2px 7px;font-size:13px;color:#00ff88;font-family:'Courier New',monospace;">${code}</code>`
  }

  // Strong/bold
  renderer.strong = function(text) {
    return `<strong style="color:#fff;font-weight:700;">${text}</strong>`
  }

  // Horizontal rule as divider
  renderer.hr = function() {
    return `<hr style="border:none;border-top:1px solid #1e1e1e;margin:16px 0;">`
  }

  // Links
  renderer.link = function(href, title, text) {
    return `<a href="${href}" target="_blank" style="color:#00ccff;text-decoration:none;border-bottom:1px solid #00ccff44;">${text} ↗</a>`
  }

  marked.setOptions({
    renderer,
    breaks: true,
    gfm: true,
    headerIds: false,
    mangle: false
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

// AUTH CHECK
if (!getToken()) {
  window.location.href = "login.html"
}

const datta_token = getToken()
const datta_user = getUser()

// Update sidebar profile with real user info
window.addEventListener("DOMContentLoaded", function() {
  if (datta_user) {
    const nameEl = document.querySelector(".profileName")
    const avatarEl = document.querySelector(".profileAvatar")
    const subEl = document.querySelector(".profileSub")
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
    <div class="messageRow userRow">
      <div class="userBubble">
        ${fileBubble}
        ${text ? `<div>${text}</div>` : ""}
      </div>
    </div>
  `

  chatBox.scrollTop = chatBox.scrollHeight

  // Clear input + file
  input.value = ""
  ;["cameraInput","photoInput","imageInput"].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.value = ""
  })
  if (typeof clearFileSelection === "function") clearFileSelection()

  // Detect request type for smart thinking steps
  const msgLow = text.toLowerCase()
  const willSearch = ["latest news","breaking news","live score","stock price","crypto price","bitcoin price","gold price","petrol price","weather in","weather today","who won","election result","trending now","ipl 2025","ipl 2026","world cup","search for","look up","news about","just happened","announced today"].some(t => msgLow.includes(t))
  const willCode = ["build","create a website","write code","make an app","html","python","javascript","css","react","debug","fix this code","script"].some(t => msgLow.includes(t))
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
  aiDiv.className = "messageRow"
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

  // Auto-retry fetch - silently retry up to 4 times
  async function fetchWithRetry(url, options, maxTries = 4) {
    for (let i = 0; i < maxTries; i++) {
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 50000)
        const r = await fetch(url, { ...options, signal: ctrl.signal })
        clearTimeout(timer)
        return r
      } catch(e) {
        if (i === maxTries - 1) throw e
        // Update thinking message
        const title = document.querySelector(".thinkingTitle")
        if (title) title.textContent = "Connecting... (" + (i+2) + "/" + maxTries + ")"
        await new Promise(r => setTimeout(r, 5000)) // wait 5 sec
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
        <div class="aiBubble" style="color:#ff8844;">⚠️ ${msg}. Please try again.</div>
      `
      hideStopBtn()
      return
    }

    const chatIdFromHeader = res.headers.get("x-chat-id")
    if (!currentChatId && chatIdFromHeader) {
      currentChatId = chatIdFromHeader
      localStorage.setItem("datta_last_chat", currentChatId)
    }

    // Upgrade Render message for long tasks
    if (!res.ok && res.status === 504) {
      aiDiv.innerHTML = `<div class="aiContent"><div class="aiBubble" style="background:#110a0a;border:1px solid #ff444422;"><div style="color:#ff8888;font-weight:600;margin-bottom:8px;">⏱️ Server timeout</div><div style="color:#888;font-size:13px;margin-bottom:12px;">This task was too large for the free server. Try breaking it into smaller parts, or upgrade Render to paid plan.</div></div></div>`
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

    // Replace typing indicator with response bubble
    aiDiv.innerHTML = `
      <div class="aiContent">
        <div class="aiBubble">
          <span class="stream"></span>
        </div>
        <div class="aiActions">
          <button class="actionBtn" title="Copy" onclick="copyText(this)"><i data-lucide="copy"></i></button>
          <button class="actionBtn" title="Download as PDF" onclick="downloadAsPDF(this)"><i data-lucide="file-down"></i></button>
          <button class="actionBtn" title="Save to File Manager" onclick="saveToFileManager(this)"><i data-lucide="bookmark"></i></button>
          <button class="actionBtn" title="Speak" onclick="speakText(this)"><i data-lucide="volume-2"></i></button>
          <button class="actionBtn" title="Stop" onclick="stopVoice()"><i data-lucide="square"></i></button>
          <button class="actionBtn" title="Regenerate" onclick="regenerateFrom(this)"><i data-lucide="refresh-ccw"></i></button>
          <div class="actionDivider"></div>
          <button class="actionBtn likeBtn" title="Good response" onclick="likeMsg(this)"><i data-lucide="thumbs-up"></i></button>
          <button class="actionBtn dislikeBtn" title="Bad response" onclick="dislikeMsg(this)"><i data-lucide="thumbs-down"></i></button>
        </div>
      </div>
    `

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let streamText = ""
    let span = aiDiv.querySelector(".stream")

    while (true) {
      // Check if user stopped generation
      if (!controller) break

      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)

      if (chunk.includes("CHATID")) {
        const parts = chunk.split("CHATID")
        streamText += parts[0]
        currentChatId = parts[1].trim()
      } else {
        streamText += chunk
      }


      // Detect auto-switch to Datta 5.4
      if (streamText.includes("Switching to **Datta 5.4**") || streamText.includes("switching you to Datta 5.4")) {
        const pill = document.getElementById("activeModelName")
        if (pill && pill.textContent !== "Datta 5.4") {
          pill.textContent = "Datta 5.4"
          pill.style.color = "#ff6644"
          setTimeout(() => { pill.style.color = "" }, 3000)
        }
      }

      // Normal text rendering
      if (streamText.trim()) {
        span.innerHTML = marked.parse(streamText) + '<span class="cursor">▌</span>'
      }
      scrollBottom()
      lucide.createIcons()
    }

    // Final render - remove cursor
    span.innerHTML = marked.parse(streamText)

    // Add action buttons to user messages after generation
    chatBox.querySelectorAll(".userBubble").forEach(bubble => {
      if (!bubble.closest(".messageRow").querySelector(".userActions")) {
        const row = bubble.closest(".messageRow")
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
    hideStopBtn()
    loadSidebar()

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
      aiDiv.innerHTML = `
        <div class="aiContent">
          <div class="aiBubble" style="background:#110a0a;border:1px solid #ff444422;">
            <div style="color:#ff8888;font-size:15px;font-weight:600;margin-bottom:8px;">Connection failed after 3 retries</div>
            <div style="color:#888;font-size:13px;margin-bottom:14px;">Please check your internet and try again.</div>
            <button onclick="this.closest('.messageRow').remove();document.getElementById('message').value=window.lastUserMsg||'';document.getElementById('message').focus()"
              style="padding:8px 18px;background:#00ff8822;border:1px solid #00ff8844;border-radius:10px;color:#00ff88;font-size:13px;cursor:pointer;">
              Try Again
            </button>
          </div>
        </div>
      `
    }
  }
}


// ─── LOAD SIDEBAR ─────────────────────────────────────────────────────────────
let sidebarFixDone = false

async function loadSidebar() {
  try {
    const res = await fetch(SERVER + "/chats?token=" + getToken())

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
        fetch(SERVER + "/chats/fix-titles?token=" + getToken(), {
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
      div.className = "chatItem"
      div.setAttribute("data-chat-id", chat._id)
      div.innerHTML = `
        <svg class="chatIcon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" opacity="0.4">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <div class="chatTitle" title="${chat.title}">${chat.title}</div>
        <button class="deleteBtn" onclick="confirmDelete(event,'${chat._id}')" title="Delete">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
          </svg>
        </button>
      `
      div.onclick = (e) => {
        if (e.target.closest(".deleteBtn")) return
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
          document.querySelectorAll(".chatItem").forEach(d => d.classList.remove("active"))
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

  const res = await fetch(SERVER + "/chat/" + chatId + "?token=" + getToken())
  const messages = await res.json()

  messages.forEach(m => {
    if (m.role === "user") {
      chatBox.innerHTML += `
        <div class="messageRow userRow">
          <div class="userBubble">${m.content}</div>
        </div>
      `
    } else {
      chatBox.innerHTML += `
        <div class="messageRow">
          <div class="aiContent">
            <div class="aiBubble">${marked.parse(m.content)}</div>
            <div class="aiActions">
              <button class="actionBtn" title="Copy" onclick="copyText(this)"><i data-lucide="copy"></i></button>
              <button class="actionBtn" title="Download as PDF" onclick="downloadAsPDF(this)"><i data-lucide="file-down"></i></button>
              <button class="actionBtn" title="Speak" onclick="speakText(this)"><i data-lucide="volume-2"></i></button>
              <button class="actionBtn" title="Stop" onclick="stopVoice()"><i data-lucide="square"></i></button>
              <button class="actionBtn" title="Regenerate" onclick="regenerateFrom(this)"><i data-lucide="refresh-cw"></i></button>
              <div class="actionDivider"></div>
              <button class="actionBtn likeBtn" title="Good response" onclick="likeMsg(this)"><i data-lucide="thumbs-up"></i></button>
              <button class="actionBtn dislikeBtn" title="Bad response" onclick="dislikeMsg(this)"><i data-lucide="thumbs-down"></i></button>
            </div>
          </div>
        </div>
      `
    }
  })

  scrollBottom()
  lucide.createIcons()
}


// ─── DELETE CHAT ──────────────────────────────────────────────────────────────
function confirmDelete(e, id) {
  e.stopPropagation()
  e.preventDefault()
  // Find the chat item and show inline confirm
  const chatItem = e.target.closest(".chatItem")
  if (!chatItem) return

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
    await fetch(SERVER + "/chat/" + id + "?token=" + getToken(), {
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
  const text = btn.closest(".aiContent").querySelector(".aiBubble").innerText
  navigator.clipboard.writeText(text)
}


// ─── SPEAK TEXT ───────────────────────────────────────────────────────────────
function speakText(btn) {
  const text = btn.closest(".aiContent").querySelector(".aiBubble").innerText
  const speech = new SpeechSynthesisUtterance(text)
  speech.lang = "en-US"
  speechSynthesis.speak(speech)
}


// ─── STOP VOICE ───────────────────────────────────────────────────────────────
function stopVoice() {
  speechSynthesis.cancel()
}


// ─── REGENERATE ───────────────────────────────────────────────────────────────
async function regenerateFrom(btn) {
  const row = btn.closest(".messageRow")
  const prev = row.previousElementSibling
  if (!prev) return

  const text = prev.querySelector(".userBubble").innerText
  const aiBubble = row.querySelector(".aiBubble")
  aiBubble.innerHTML = `<span class="stream"></span>`
  const span = aiBubble.querySelector(".stream")

  controller = new AbortController()

  const res = await fetch(SERVER + "/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: controller.signal,
    body: JSON.stringify({
      message: text,
      title: text.substring(0, 40),
      chatId: currentChatId
    })
  })

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let streamText = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value)

    if (chunk.includes("CHATID")) {
      const parts = chunk.split("CHATID")
      streamText += parts[0]
      currentChatId = parts[1]
    } else {
      streamText += chunk
    }

    span.innerHTML = marked.parse(streamText) + '<span class="cursor">▌</span>'
    scrollBottom()
  }

  span.innerHTML = marked.parse(streamText)
  lucide.createIcons()
}


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
  const w = document.getElementById("welcomeScreen")
  if (w) {
    w.style.setProperty("display", "none", "important")
    w.style.visibility = "hidden"
    w.style.pointerEvents = "none"
    w.style.position = "absolute"
    w.style.opacity = "0"
  }
  document.body.classList.add("chat-started")
}

function showWelcome() {
  // Only show if no active chat
  if (currentChatId) return
  const w = document.getElementById("welcomeScreen")
  if (w) {
    w.style.setProperty("display", "flex", "important")
    w.style.visibility = "visible"
    w.style.pointerEvents = "all"
    w.style.position = "relative"
    w.style.opacity = "1"
    w.style.flexDirection = "column"
    w.style.alignItems = "center"
    w.style.justifyContent = "center"
  }
  document.body.classList.remove("chat-started")
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


// ─── ENTER KEY ────────────────────────────────────────────────────────────────
document.getElementById("message").addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    e.preventDefault()
    send()
  }
})


// ─── SIDEBAR TOGGLE ───────────────────────────────────────────────────────────

// ─── SAVE CHAT TITLE (local fallback) ────────────────────────────────────────
function saveChatTitle(title) {
  const history = document.getElementById("history")
  if (!history) return
  const div = document.createElement("div")
  div.className = "chatItem"
  div.innerHTML = `<span class="chatTitle">${title}</span>`
  history.prepend(div)
}


// ─── SEARCH CHATS ────────────────────────────────────────────────────────────
// ─── INIT ─────────────────────────────────────────────────────────────────────
window.send = send
loadSidebar()

// Init dynamic button to send state
window.addEventListener("DOMContentLoaded", function() {
  setGenerating(false)
})

// Load smart suggestions for welcome screen
async function loadSmartSuggestions() {
  const chips = document.getElementById("suggestionChips")
  if (!chips) return
  // Just use static chips - no API call needed
  // Dynamic chips from server were causing [object Object] error
  chips.innerHTML = `
    <button class="chip" onclick="useChip(this)">🌐 Build me a portfolio website</button>
    <button class="chip" onclick="useChip(this)">🐍 Write a Python web scraper</button>
    <button class="chip" onclick="useChip(this)">📰 Latest tech news today</button>
    <button class="chip" onclick="useChip(this)">🧠 Explain machine learning</button>
    <button class="chip" onclick="useChip(this)">✍️ Write a poem about nature</button>
    <button class="chip" onclick="useChip(this)">💼 Create a business plan</button>
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
  event.stopPropagation()
  const modal = document.getElementById("settingsModal")
  if (!modal) return

  modal.classList.add("show")

  // Reset to profile tab and scroll top
  setTimeout(function() {
    switchSettingsTab("profile")
    const box = modal.querySelector(".modalBox")
    if (box) box.scrollTop = 0
    loadSettingsUI()
  }, 10)
}

function closeSettings() {
  const modal = document.getElementById("settingsModal")
  if (modal) modal.classList.remove("show")
  clearSettingsMsg()
}

function switchSettingsTab(tab) {
  document.querySelectorAll(".sTab").forEach(t => t.classList.remove("active"))
  document.querySelectorAll(".sTabContent").forEach(c => c.classList.remove("active"))
  document.querySelector(".sTab[onclick=\"switchSettingsTab('" + tab + "')\"]").classList.add("active")
  document.getElementById("tab-" + tab).classList.add("active")
  clearSettingsMsg()
}

function showSettingsMsg(text, type) {
  const el = document.getElementById("settingsMsg")
  el.textContent = text
  el.className = "settingsMsg " + type
  setTimeout(() => { el.className = "settingsMsg"; el.textContent = "" }, 3000)
}

function clearSettingsMsg() {
  const el = document.getElementById("settingsMsg")
  if (el) { el.className = "settingsMsg"; el.textContent = "" }
}

function loadSettingsUI() {
  let user = {}
  try {
    const raw = localStorage.getItem("datta_user")
    if (raw && raw !== "null") user = JSON.parse(raw)
  } catch(e) {}
  const usernameInput = document.getElementById("newUsername")
  if (usernameInput) usernameInput.placeholder = user.username || "Enter new username"

  // Load theme
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
    const nameEl = document.querySelector(".profileName")
    const avatarEl = document.querySelector(".profileAvatar")
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
  localStorage.setItem("datta_theme", theme)
  if (theme === "light") {
    document.body.classList.add("light")
    document.getElementById("themeDark")?.classList.remove("active")
    document.getElementById("themeLight")?.classList.add("active")
  } else {
    document.body.classList.remove("light")
    document.getElementById("themeDark")?.classList.add("active")
    document.getElementById("themeLight")?.classList.remove("active")
  }
  if (!silent) showSettingsMsg("Theme changed to " + theme + " mode!", "success")
}

// SET FONT SIZE
function setFontSize(size) {
  document.querySelectorAll(".fontBtn").forEach(b => b.classList.remove("active"))
  event.target.classList.add("active")
  const sizes = { small: "13px", medium: "15px", large: "17px" }
  document.documentElement.style.setProperty("--chat-font-size", sizes[size])
  document.querySelectorAll(".aiBubble, .userBubble").forEach(el => el.style.fontSize = sizes[size])
  localStorage.setItem("datta_fontsize", size)
  showSettingsMsg("Font size set to " + size, "success")
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
    const res = await fetch(SERVER + "/chats/all?token=" + getToken(), {
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
  const theme = localStorage.getItem("datta_theme") || "dark"
  if (theme === "light") document.body.classList.add("light")

  // Apply saved language to system prompt
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
function likeMsg(btn) {
  const wasActive = btn.classList.contains("active")
  const row = btn.closest(".aiActions")
  row.querySelectorAll(".likeBtn, .dislikeBtn").forEach(b => {
    b.classList.remove("active")
    b.style.color = ""
  })
  if (!wasActive) {
    btn.classList.add("active")
    btn.style.color = "#00ff88"
  }
}

function dislikeMsg(btn) {
  const wasActive = btn.classList.contains("active")
  const row = btn.closest(".aiActions")
  row.querySelectorAll(".likeBtn, .dislikeBtn").forEach(b => {
    b.classList.remove("active")
    b.style.color = ""
  })
  if (!wasActive) {
    btn.classList.add("active")
    btn.style.color = "#ff4444"
  }
}

window.likeMsg = likeMsg
window.dislikeMsg = dislikeMsg

// ── VOICE ASSISTANT (SIRI-LIKE) ──────────────────────────────────────────────

let voiceRecognition = null
let voiceSynth = window.speechSynthesis
let isListening = false
let isSpeaking = false
let voiceActive = false

function openVoiceAssistant() {
  voiceActive = true
  const overlay = document.getElementById("voiceOverlay")
  if (overlay) overlay.classList.add("show")
  setVoiceStatus("Tap the mic to speak", "idle")

  // Greet user
  setTimeout(() => {
    speakText2("Hello! I am Datta AI. How can I help you today?")
  }, 500)
}

function closeVoiceAssistant() {
  voiceActive = false
  stopListening()
  stopSpeaking()
  const overlay = document.getElementById("voiceOverlay")
  if (overlay) overlay.classList.remove("show")
}

function setVoiceStatus(text, mode) {
  const status = document.getElementById("voiceStatus")
  const orb = document.getElementById("voiceOrb")
  const micBtn = document.getElementById("voiceMicBtn")

  if (status) status.textContent = text
  if (orb) {
    orb.classList.remove("listening", "speaking")
    if (mode === "listening") orb.classList.add("listening")
    if (mode === "speaking") orb.classList.add("speaking")
  }
  if (micBtn) {
    if (mode === "listening") {
      micBtn.textContent = "🔴 Listening... (tap to stop)"
      micBtn.style.background = "linear-gradient(135deg,#ff4444,#ff8844)"
    } else if (mode === "speaking") {
      micBtn.textContent = "🔊 Speaking..."
      micBtn.style.background = "linear-gradient(135deg,#aa44ff,#00ccff)"
    } else {
      micBtn.innerHTML = "🎤 Tap to Speak"
      micBtn.style.background = "linear-gradient(135deg,#00cc6a,#00aaff)"
    }
  }
}

function setVoiceLang(lang) {
  window._voiceLang = lang
}

function setVoiceText(text) {
  const el = document.getElementById("voiceText")
  if (el) el.textContent = text
}

function toggleVoiceListening() {
  if (isListening) {
    stopListening()
  } else {
    startListening()
  }
}

function startListening() {
  if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
    setVoiceText("Speech recognition not supported in this browser.")
    return
  }

  stopSpeaking()

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  voiceRecognition = new SpeechRecognition()
  voiceRecognition.lang = window._voiceLang || "en-IN"
  voiceRecognition.continuous = false
  voiceRecognition.interimResults = true

  voiceRecognition.onstart = () => {
    isListening = true
    setVoiceStatus("Listening...", "listening")
    setVoiceText("")
  }

  voiceRecognition.onresult = (e) => {
    let interim = ""
    let final = ""
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) {
        final += e.results[i][0].transcript
      } else {
        interim += e.results[i][0].transcript
      }
    }
    setVoiceText(final || interim)

    if (final) {
      stopListening()
      processVoiceQuery(final)
    }
  }

  voiceRecognition.onerror = (e) => {
    console.error("Voice error:", e.error)
    isListening = false
    setVoiceStatus("Error: " + e.error + ". Try again.", "idle")
  }

  voiceRecognition.onend = () => {
    isListening = false
    if (voiceActive) setVoiceStatus("Tap to speak", "idle")
  }

  voiceRecognition.start()
}

function stopListening() {
  isListening = false
  if (voiceRecognition) {
    try { voiceRecognition.stop() } catch(e) {}
    voiceRecognition = null
  }
  setVoiceStatus("Tap to speak", "idle")
}

async function processVoiceQuery(query) {
  if (!query.trim()) return

  setVoiceStatus("Thinking...", "speaking")
  setVoiceText(query)
  // Clear previous AI response
  const aiTextEl = document.getElementById("voiceAIText")
  if (aiTextEl) aiTextEl.textContent = ""

  // Check for close commands
  const closeCmds = ["close", "stop", "exit", "bye", "goodbye", "dismiss"]
  if (closeCmds.some(c => query.toLowerCase().includes(c))) {
    speakText2("Goodbye! Have a great day!")
    setTimeout(closeVoiceAssistant, 2000)
    return
  }

  try {
    const formData = new FormData()
    formData.append("message", query)
    formData.append("chatId", currentChatId || "")
    formData.append("token", getToken())
    formData.append("language", localStorage.getItem("datta_language") || "English")
    formData.append("model", localStorage.getItem("datta_model") || "llama-3.3-70b-versatile")
    formData.append("style", localStorage.getItem("datta_ai_style") || "Balanced")
    formData.append("ainame", localStorage.getItem("datta_ai_name") || "Datta AI")
    formData.append("voice", "true")

    const res = await fetch(SERVER + "/chat", {
      method: "POST",
      body: formData
    })

    if (!res.ok) {
      speakText2("Sorry, I encountered an error. Please try again.")
      setVoiceStatus("Error. Tap to try again.", "idle")
      return
    }

    const chatIdFromHeader = res.headers.get("x-chat-id")
    if (!currentChatId && chatIdFromHeader) currentChatId = chatIdFromHeader

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let fullText = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value)
      if (chunk.includes("CHATID")) {
        const parts = chunk.split("CHATID")
        fullText += parts[0]
        currentChatId = parts[1]
      } else {
        fullText += chunk
      }
    }

    // Clean text for speaking (remove markdown)
    const cleanText = fullText
      .replace(/!\[.*?\]\(.*?\)/g, "I generated an image for you.")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/#{1,6}\s/g, "")
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/`/g, "")
      .trim()

    setVoiceText(cleanText.substring(0, 100) + (cleanText.length > 100 ? "..." : ""))

    // Add to chat UI
    chatBox.innerHTML += `
      <div class="messageRow userRow">
        <div class="userBubble">🎤 ${query}</div>
      </div>
    `
    chatBox.innerHTML += `
      <div class="messageRow">
        <div class="aiContent">
          <div class="aiBubble">${marked.parse(fullText.split("CHATID")[0])}</div>
        </div>
      </div>
    `
    chatBox.scrollTop = chatBox.scrollHeight
    loadSidebar()

    // Speak the response
    speakText2(cleanText)

  } catch (err) {
    console.error("Voice query error:", err)
    speakText2("Sorry, something went wrong.")
    setVoiceStatus("Error. Tap to try again.", "idle")
  }
}

// VOICE PROFILES
const voiceProfiles = {
  "aria":    { name: "Aria",    lang: "en-US", rate: 0.95, pitch: 1.1, keywords: ["Google US English","Samantha","Aria","Zira"] },
  "james":   { name: "James",   lang: "en-US", rate: 0.9,  pitch: 0.85, keywords: ["Google UK English Male","Daniel","James","David"] },
  "sofia":   { name: "Sofia",   lang: "en-US", rate: 1.0,  pitch: 1.2, keywords: ["Google UK English Female","Karen","Moira","Sofia"] },
  "neural":  { name: "Neural",  lang: "en-US", rate: 0.95, pitch: 1.0, keywords: ["Neural","Natural","Enhanced","Premium"] },
  "indian":  { name: "Riya",   lang: "en-IN", rate: 0.9,  pitch: 1.05, gender: "female", keywords: ["Lekha","Veena","Google हिन्दी","en-IN"] },
  "british": { name: "Oliver", lang: "en-GB", rate: 0.88, pitch: 0.8,  gender: "male",   keywords: ["Google UK English Male","Daniel","George","Arthur","en-GB"] }
}

function getSelectedVoiceProfile() {
  return localStorage.getItem("datta_voice") || "aria"
}

function pickVoice(profile) {
  const voices = voiceSynth.getVoices()
  if (!voices.length) return null

  // Debug - log all available voices once
  if (!window._voicesLogged) {
    window._voicesLogged = true
    console.log("Available voices:", voices.map(v => v.name + " (" + v.lang + ")").join(", "))
  }

  // Try exact keyword match
  for (const kw of profile.keywords) {
    const found = voices.find(v => v.name.toLowerCase().includes(kw.toLowerCase()))
    if (found) { console.log("Voice matched by keyword:", found.name); return found }
  }

  // Language match
  const langVoices = voices.filter(v => v.lang.startsWith(profile.lang.split("-")[0]))

  if (langVoices.length) {
    // Gender match by name
    const maleWords = ["male","man","david","james","daniel","george","oliver","alex","ryan","tom","richard","peter","john","mark"]
    const femaleWords = ["female","woman","girl","samantha","zira","karen","sofia","aria","victoria","lisa","susan","alice","emma","kate"]
    const gWords = profile.gender === "male" ? maleWords : femaleWords

    const gendered = langVoices.find(v => gWords.some(g => v.name.toLowerCase().includes(g)))
    if (gendered) { console.log("Voice matched by gender+lang:", gendered.name); return gendered }

    // No gender match - for male pick last, for female pick first
    if (profile.gender === "male") return langVoices[langVoices.length - 1]
    return langVoices[0]
  }

  // English fallback
  const engVoices = voices.filter(v => v.lang.startsWith("en"))
  if (engVoices.length > 0) {
    const maleWords = ["male","man","david","james","daniel","george","oliver"]
    const femaleWords = ["female","woman","samantha","zira","karen","aria"]
    const gWords = profile.gender === "male" ? maleWords : femaleWords
    const gendered = engVoices.find(v => gWords.some(g => v.name.toLowerCase().includes(g)))
    if (gendered) return gendered
    if (profile.gender === "male" && engVoices.length > 1) return engVoices[engVoices.length - 1]
    return engVoices[0]
  }

  return voices[0]
}

function speakText2(text) {
  if (!voiceSynth) return
  stopSpeaking()

  isSpeaking = true
  setVoiceStatus("Speaking...", "speaking")

  const utterance = new SpeechSynthesisUtterance(text)
  const profileKey = getSelectedVoiceProfile()
  const profile = voiceProfiles[profileKey] || voiceProfiles.aria

  utterance.lang = profile.lang
  utterance.rate = profile.rate
  utterance.pitch = profile.pitch
  utterance.volume = 1.0

  // Wait for voices to load then pick
  const setVoiceAndSpeak = () => {
    const voice = pickVoice(profile)
    if (voice) {
      utterance.voice = voice
      console.log("Speaking with voice:", voice.name)
    }
    utterance.onend = () => {
      isSpeaking = false
      if (voiceActive) {
        setVoiceStatus("Tap to speak", "idle")
        setTimeout(() => { if (voiceActive) startListening() }, 800)
      }
    }
    utterance.onerror = (e) => {
      console.log("Speech error:", e)
      isSpeaking = false
      setVoiceStatus("Tap to speak", "idle")
    }
    voiceSynth.speak(utterance)
  }

  // Always wait a moment to ensure voices are loaded
  const availVoices = voiceSynth.getVoices()
  if (availVoices.length > 0) {
    setVoiceAndSpeak()
  } else {
    voiceSynth.onvoiceschanged = () => {
      voiceSynth.onvoiceschanged = null
      setVoiceAndSpeak()
    }
    // Fallback if onvoiceschanged never fires
    setTimeout(() => {
      if (isSpeaking === false) setVoiceAndSpeak()
    }, 1000)
  }
}

function stopSpeaking() {
  if (voiceSynth) voiceSynth.cancel()
  isSpeaking = false
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
  free:      { name: "Free",      version: "Datta 2.1", emoji: "🌱" },
  pro:       { name: "Pro",       version: "Datta 4.2", emoji: "⚡" },
  max:       { name: "Max",       version: "Datta 4.8", emoji: "🚀" },
  ultramax:  { name: "Ultra Max", version: "Datta 5.4", emoji: "👑" },
  basic:     { name: "Pro",       version: "Datta 4.2", emoji: "⚡" },
  enterprise:{ name: "Ultra Max", version: "Datta 5.4", emoji: "👑" }
}

async function loadUserVersion() {
  try {
    const res = await fetch(SERVER + "/payment/subscription?token=" + getToken())
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
    const sub = document.querySelector(".profileSub")
    if (sub) sub.textContent = v.emoji + " " + v.name + " Plan"

    // Update plan button in sidebar
    const emoji = document.getElementById("planBtnEmoji")
    const title = document.getElementById("planBtnTitle")
    const subtitle = document.getElementById("planBtnSub")

    const planInfo = {
      free:     { emoji:"🌱", title:"Free Plan",      sub:"Upgrade for more power →" },
      pro:      { emoji:"⚡", title:"Pro Plan",       sub:"100 msgs per 4hrs · Active" },
      max:      { emoji:"🚀", title:"Max Plan",       sub:"200 msgs per 3hrs · Active" },
      ultramax: { emoji:"👑", title:"Ultra Max Plan", sub:"Unlimited messages · Active" },
      basic:    { emoji:"⚡", title:"Pro Plan",       sub:"Active subscription" },
      enterprise:{ emoji:"👑", title:"Ultra Max Plan", sub:"Active subscription" }
    }

    const info = planInfo[plan] || planInfo.free
    if (emoji) emoji.textContent = info.emoji
    if (title) title.textContent = info.title
    if (subtitle) subtitle.textContent = info.sub

    // Change button color for paid plans
    const btn = document.getElementById("planBtn")
    if (btn) {
      if (plan === "free") {
        btn.style.background = "linear-gradient(135deg, #0a2a1a, #0a1a2a)"
        btn.style.borderColor = "#00ff8833"
      } else if (plan === "pro") {
        btn.style.background = "linear-gradient(135deg, #1a1a0a, #2a1a00)"
        btn.style.borderColor = "#ffaa0033"
      } else if (plan === "max") {
        btn.style.background = "linear-gradient(135deg, #0a0a2a, #1a0a2a)"
        btn.style.borderColor = "#8844ff33"
      } else if (plan === "ultramax") {
        btn.style.background = "linear-gradient(135deg, #2a0a1a, #1a0a2a)"
        btn.style.borderColor = "#ff44aa33"
      }
    }

  } catch(e) {
    console.log("Version load error:", e.message)
    // Show from localStorage as fallback
    const plan = localStorage.getItem("datta_plan") || "free"
    const info = {
      free:     { emoji:"🌱", title:"Free Plan",      sub:"Upgrade for more power →" },
      pro:      { emoji:"⚡", title:"Pro Plan",       sub:"Active" },
      max:      { emoji:"🚀", title:"Max Plan",       sub:"Active" },
      ultramax: { emoji:"👑", title:"Ultra Max Plan", sub:"Active" }
    }[plan] || { emoji:"🌱", title:"Free Plan", sub:"Upgrade for more power →" }
    const emoji = document.getElementById("planBtnEmoji")
    const title = document.getElementById("planBtnTitle")
    const sub = document.getElementById("planBtnSub")
    if (emoji) emoji.textContent = info.emoji
    if (title) title.textContent = info.title
    if (sub) sub.textContent = info.sub
  }
}

// Load version on startup
window.addEventListener("DOMContentLoaded", function() {
  setTimeout(loadUserVersion, 1000)
})

// SUGGESTION CHIPS
function useChip(btn) {
  const input = document.getElementById("message")
  if (input) {
    input.value = btn.textContent.replace(/^[^\s]+\s/, "")
    input.focus()
    // Auto send
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

  // Load saved theme
  const savedTheme = localStorage.getItem("datta_theme")
  if (savedTheme === "light") applyLightTheme()
  else applyDarkTheme()

  // Load saved model
  const savedModel = localStorage.getItem("datta_model")
  if (savedModel) {
    const sel = document.getElementById("modelSelect")
    if (sel) sel.value = savedModel
  }
})

// ── FEATURE 2: DARK/LIGHT THEME ─────────────────────────────────────────────
function toggleTheme() {
  const isLight = document.body.classList.contains("light-theme")
  if (isLight) {
    applyDarkTheme()
    localStorage.setItem("datta_theme", "dark")
  } else {
    applyLightTheme()
    localStorage.setItem("datta_theme", "light")
  }
}

function applyLightTheme() {
  document.body.classList.add("light-theme")
  const btn = document.getElementById("themeToggleBtn")
  if (btn) btn.textContent = "☀️"
}

function applyDarkTheme() {
  document.body.classList.remove("light-theme")
  const btn = document.getElementById("themeToggleBtn")
  if (btn) btn.textContent = "🌙"
}

window.toggleTheme = toggleTheme

// ── FEATURE 3: MOBILE UI - Auto collapse sidebar on mobile ──────────────────
function toggleSidebar() {
  const sidebar = document.querySelector(".sidebar")
  if (!sidebar) return
  sidebar.classList.toggle("show")

  // Add overlay for mobile
  let overlay = document.getElementById("sidebarOverlay")
  if (!overlay) {
    overlay = document.createElement("div")
    overlay.id = "sidebarOverlay"
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99;display:none;"
    overlay.onclick = () => { sidebar.classList.remove("show"); overlay.style.display = "none" }
    document.body.appendChild(overlay)
  }
  overlay.style.display = sidebar.classList.contains("show") ? "block" : "none"
}

window.toggleSidebar = toggleSidebar


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
    toast.style.cssText = `
      position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%);
      background: #1a1a1a; border: 1px solid #333; color: white;
      padding: 10px 20px; border-radius: 20px; font-size: 13px;
      z-index: 9999; opacity: 0; transition: opacity 0.3s;
      pointer-events: none; white-space: nowrap;
    `
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
  d21:    { model: "llama-3.1-8b-instant",                        icon: "", name: "Datta 2.1" },
  d42:    { model: "llama-3.3-70b-versatile",                     icon: "", name: "Datta 4.2" },
  d48:    { model: "llama-3.3-70b-versatile",               icon: "", name: "Datta 4.8" },
  d54:    { model: "llama-3.3-70b-versatile",                          icon: "", name: "Datta 5.4" },
  chitra: { model: "meta-llama/llama-4-scout-17b-16e-instruct",   icon: "", name: "Datta Vision" },
  // Legacy support
  veda:   { model: "llama-3.3-70b-versatile",  icon: "", name: "Datta 4.2" },
  surya:  { model: "llama-3.1-8b-instant",     icon: "", name: "Datta 2.1" },
  agni:   { model: "llama-3.3-70b-versatile", icon: "", name: "Datta 4.8" },
  brahma: { model: "llama-3.3-70b-versatile",       icon: "", name: "Datta 5.4" }
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
  const bubble = btn.closest(".aiContent").querySelector(".aiBubble")
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
  // Find all code blocks with html/css/js
  container.querySelectorAll("pre code").forEach(block => {
    const lang = block.className.replace("language-", "").toLowerCase()
    if (!["html","css","javascript","js"].includes(lang)) return
    if (block.closest(".codePreviewWrap")) return

    const wrap = document.createElement("div")
    wrap.className = "codePreviewWrap"
    block.parentNode.parentNode.insertBefore(wrap, block.parentNode)
    wrap.appendChild(block.parentNode)

    const code = block.innerText
    const previewBtn = document.createElement("div")
    previewBtn.style.cssText = "display:flex;gap:8px;margin-top:6px;"
    previewBtn.innerHTML = `
      <button onclick="runCodePreview(this)" data-code="${encodeURIComponent(code)}" data-lang="${lang}"
        style="padding:6px 14px;background:#00ff8822;border:1px solid #00ff8844;border-radius:8px;color:#00ff88;font-size:12px;cursor:pointer;font-family:'Josefin Sans',sans-serif;">
        ▶ Run Preview
      </button>
      <button onclick="copyCodeBlock(this)" data-code="${encodeURIComponent(code)}"
        style="padding:6px 14px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#aaa;font-size:12px;cursor:pointer;font-family:'Josefin Sans',sans-serif;">
        Copy Code
      </button>`
    wrap.appendChild(previewBtn)
  })
}

function runCodePreview(btn) {
  const code = decodeURIComponent(btn.dataset.code)
  const lang = btn.dataset.lang
  
  // Remove existing preview
  const existing = btn.closest(".codePreviewWrap").querySelector(".livePreview")
  if (existing) { existing.remove(); btn.textContent = "▶ Run Preview"; return }

  const iframe = document.createElement("iframe")
  iframe.className = "livePreview"
  iframe.style.cssText = "width:100%;height:400px;border:1px solid #2a2a2a;border-radius:10px;margin-top:8px;background:white;"
  iframe.sandbox = "allow-scripts"
  btn.closest(".codePreviewWrap").appendChild(iframe)

  const doc = iframe.contentDocument || iframe.contentWindow.document
  doc.open()
  if (lang === "html") {
    doc.write(code)
  } else if (lang === "css") {
    doc.write(`<html><head><style>${code}</style></head><body><p>CSS Preview</p></body></html>`)
  } else {
    doc.write(`<html><body><script>try{${code}}catch(e){document.body.innerHTML='<pre style=color:red>'+e+'</pre>'}<\/script></body></html>`)
  }
  doc.close()
  btn.textContent = "✕ Close Preview"
  showToast("Preview loaded!")
}

function copyCodeBlock(btn) {
  const code = decodeURIComponent(btn.dataset.code)
  navigator.clipboard.writeText(code).then(() => showToast("Code copied!"))
}

window.runCodePreview = runCodePreview
window.copyCodeBlock = copyCodeBlock

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
  const bubble = btn.closest(".aiContent").querySelector(".aiBubble")
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
  const bubble = aiDiv.querySelector(".aiBubble")
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
  const code = btn.dataset.code || btn.closest(".aiBubble").querySelector("pre code")?.innerText || ""
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
  const code = btn.dataset.code || btn.closest(".aiBubble").querySelector("pre code")?.innerText || ""
  navigator.clipboard.writeText(code).then(() => { showToast("Code copied!"); btn.textContent = "✓ Copied!" })
}

function downloadDocument(btn) {
  const bubble = btn.closest(".aiBubble")
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
    navigator.serviceWorker.register("/datta-ai/sw.js")
      .then(() => console.log("SW registered"))
      .catch(e => console.log("SW error:", e))
  })
}

// PWA Install prompt
let deferredPrompt = null
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault()
  deferredPrompt = e
  showInstallBanner()
})

function showInstallBanner() {
  if (localStorage.getItem("pwa_dismissed")) return
  const banner = document.createElement("div")
  banner.className = "installBanner"
  banner.id = "installBanner"
  banner.innerHTML = `
    <img src="logo.png" alt="Datta AI">
    <div class="installBannerText">
      <div class="installBannerTitle">Install Datta AI</div>
      <div class="installBannerSub">Add to home screen for best experience</div>
    </div>
    <button class="installBannerBtn" onclick="installPWA()">Install</button>
    <button class="installBannerClose" onclick="dismissInstall()">✕</button>
  `
  document.body.appendChild(banner)
}

function installPWA() {
  if (deferredPrompt) {
    deferredPrompt.prompt()
    deferredPrompt.userChoice.then(r => {
      if (r.outcome === "accepted") showToast("Datta AI installed!")
      deferredPrompt = null
    })
  }
  dismissInstall()
}

function dismissInstall() {
  localStorage.setItem("pwa_dismissed", "1")
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

function searchChats(query) {
  const q = query.toLowerCase().trim()
  const items = document.querySelectorAll(".chatItem")
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

// ══════════════════════════════════════════════════════
// FULL THEME SYSTEM - applies to entire app
// ══════════════════════════════════════════════════════
const THEMES = {
  dark:     { bg:"#0a0a0a", bg2:"#111", bg3:"#1a1a1a", border:"#222", text:"#fff", text2:"#aaa", text3:"#666", accent:"#00ff88", accent2:"#00ccff" },
  light:    { bg:"#f5f5f5", bg2:"#fff", bg3:"#f0f0f0", border:"#ddd", text:"#111", text2:"#555", text3:"#999", accent:"#00aa55", accent2:"#0088cc" },
  midnight: { bg:"#000010", bg2:"#000820", bg3:"#001030", border:"#001166", text:"#e0e8ff", text2:"#8899cc", text3:"#445588", accent:"#4488ff", accent2:"#88aaff" },
  forest:   { bg:"#050f05", bg2:"#0a180a", bg3:"#0f2010", border:"#1a4a1a", text:"#e0ffe0", text2:"#88bb88", text3:"#4a7a4a", accent:"#44cc44", accent2:"#88ff88" },
  ocean:    { bg:"#000a18", bg2:"#001025", bg3:"#001835", border:"#003366", text:"#e0f0ff", text2:"#7799cc", text3:"#334466", accent:"#0088ff", accent2:"#00ccff" },
  sunset:   { bg:"#100500", bg2:"#1a0800", bg3:"#220a00", border:"#441500", text:"#fff0e0", text2:"#cc9966", text3:"#775533", accent:"#ff8800", accent2:"#ff4400" }
}

const WALLPAPERS = {
  none: "",
  dots: "radial-gradient(circle,#222 1px,transparent 1px) 0 0/20px 20px",
  grid: "linear-gradient(#1a1a1a 1px,transparent 1px) 0 0/20px 20px,linear-gradient(90deg,#1a1a1a 1px,transparent 1px) 0 0/20px 20px",
  waves: "linear-gradient(135deg,#001a2a,#002a3a,#001a2a)",
  gradient1: "linear-gradient(135deg,#0a0a2a,#1a0a2a,#0a1a2a)",
  gradient2: "linear-gradient(135deg,#0a1a0a,#1a2a0a,#0a1a1a)",
  stars: "radial-gradient(circle,#fff 1px,transparent 1px) 0 0/30px 30px",
  mesh: "linear-gradient(135deg,#00ff8811,#00ccff11,#aa44ff11)"
}

function applyFullTheme() {
  const themeName = localStorage.getItem("datta_theme") || "dark"
  const t = THEMES[themeName] || THEMES.dark
  const root = document.documentElement

  // Apply CSS variables
  Object.entries(t).forEach(([k, v]) => root.style.setProperty("--" + k, v))

  // Apply directly to key elements
  document.body.style.background = t.bg
  document.body.style.color = t.text

  const sidebar = document.querySelector(".sidebar")
  if (sidebar) { sidebar.style.background = t.bg2; sidebar.style.borderColor = t.border }

  const topBar = document.querySelector(".topBar, .topbar")
  if (topBar) { topBar.style.background = t.bg2; topBar.style.borderColor = t.border }

  const inputWrap = document.querySelector(".inputWrap")
  if (inputWrap) { inputWrap.style.background = t.bg2; inputWrap.style.borderColor = t.border }

  // Apply wallpaper to chat area
  const chatArea = document.querySelector(".chat, #chat")
  const wp = localStorage.getItem("datta_wallpaper") || "none"
  const wpCustom = localStorage.getItem("datta_wallpaper_custom")
  if (chatArea) {
    if (wp === "custom" && wpCustom) {
      chatArea.style.backgroundImage = "url(" + wpCustom + ")"
      chatArea.style.backgroundSize = "cover"
    } else if (WALLPAPERS[wp]) {
      chatArea.style.background = WALLPAPERS[wp]
    } else {
      chatArea.style.background = ""
    }
  }

  // Update theme toggle button
  const themeBtn = document.getElementById("themeToggleBtn")
  if (themeBtn) {
    const icons = { dark:"🌙", light:"☀️", midnight:"🌌", forest:"🌿", ocean:"🌊", sunset:"🌅" }
    themeBtn.textContent = icons[themeName] || "🌙"
  }

  // Apply custom AI name
  const aiName = localStorage.getItem("datta_ai_name") || "Datta AI"
  const titles = document.querySelectorAll(".topTitle, .sidebarBrand")
  titles.forEach(t => { if (!t.textContent.includes("AI") || t.textContent === "DATTA AI") t.textContent = aiName.toUpperCase() })
}

// Apply theme immediately on load
applyFullTheme()

// Also apply after DOM loads
window.addEventListener("DOMContentLoaded", applyFullTheme)

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
    const res = await fetch(SERVER + "/payment/subscription?token=" + getToken())
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
  navigator.serviceWorker.register("/datta-ai/sw.js").then(reg => {

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
  navigator.serviceWorker.register("/datta-ai/sw.js").then(reg => {
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
    const res = await fetch(SERVER + "/chat/" + currentChatId + "/export?token=" + getToken())
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
    const res = await fetch(SERVER + "/referral/code?token=" + getToken())
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
    const savedName = { d21:"Datta 2.1", d42:"Datta 4.2", d48:"Datta 4.8", d54:"Datta 5.4" }
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
      const names = { d21:"Datta 2.1", d42:"Datta 4.2", d48:"Datta 4.8", d54:"Datta 5.4" }
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
let _ddOpen = false
let _ddClickTime = 0

function toggleModelDropdown() {
  _ddClickTime = Date.now()
  _ddOpen = !_ddOpen
  const dd = document.getElementById("modelDropdown")
  if (!dd) return
  if (_ddOpen) {
    dd.style.display = "block"
    dd.style.position = "fixed"
    // Position above input bar
    const pill = document.getElementById("activeModelPill")
    if (pill) {
      const rect = pill.getBoundingClientRect()
      dd.style.bottom = (window.innerHeight - rect.top + 8) + "px"
      dd.style.left = "12px"
      dd.style.right = "12px"
      dd.style.zIndex = "99999"
    }
  } else {
    dd.style.display = "none"
  }
}

function closeModelDropdown() {
  _ddOpen = false
  const dd = document.getElementById("modelDropdown")
  if (dd) dd.style.display = "none"
}

// Close when clicking outside - with delay to prevent immediate close
document.addEventListener("click", function(e) {
  if (Date.now() - _ddClickTime < 300) return
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
  const freePlans = ["free"]
  const miniPlans = ["free", "mini"]
  
  if (key === "d54" && miniPlans.includes(plan)) {
    closeModelDropdown()
    // Show upgrade prompt
    const modal = document.createElement("div")
    modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;"
    modal.innerHTML = `
      <div style="background:#111;border:1px solid #aa66ff44;border-radius:20px;padding:28px;max-width:320px;text-align:center;">
        <div style="font-size:36px;margin-bottom:12px;">🔒</div>
        <div style="font-size:18px;font-weight:700;color:white;margin-bottom:8px;">Datta 5.4 is Pro+</div>
        <div style="font-size:13px;color:#888;margin-bottom:20px;">Datta 5.4 coding model requires Pro plan or above.</div>
        <a href="pricing.html" style="display:block;padding:12px;background:linear-gradient(135deg,#aa66ff,#00ccff);border-radius:12px;color:white;font-weight:700;text-decoration:none;margin-bottom:10px;">Upgrade to Pro — ₹999/mo</a>
        <button onclick="this.closest('div').parentElement.remove()" style="background:none;border:none;color:#555;cursor:pointer;font-size:13px;">Maybe later</button>
      </div>`
    modal.onclick = e => { if(e.target===modal) modal.remove() }
    document.body.appendChild(modal)
    return
  }
  
  if (key === "d48" && freePlans.includes(plan)) {
    closeModelDropdown()
    const modal = document.createElement("div")
    modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;"
    modal.innerHTML = `
      <div style="background:#111;border:1px solid #ff880044;border-radius:20px;padding:28px;max-width:320px;text-align:center;">
        <div style="font-size:36px;margin-bottom:12px;">🔒</div>
        <div style="font-size:18px;font-weight:700;color:white;margin-bottom:8px;">Datta 4.8 is Mini+</div>
        <div style="font-size:13px;color:#888;margin-bottom:20px;">Upgrade to Mini plan to unlock Datta 4.8.</div>
        <a href="pricing.html" style="display:block;padding:12px;background:linear-gradient(135deg,#ff8800,#ffaa00);border-radius:12px;color:#000;font-weight:700;text-decoration:none;margin-bottom:10px;">Upgrade to Mini — ₹199/mo</a>
        <button onclick="this.closest('div').parentElement.remove()" style="background:none;border:none;color:#555;cursor:pointer;font-size:13px;">Maybe later</button>
      </div>`
    modal.onclick = e => { if(e.target===modal) modal.remove() }
    document.body.appendChild(modal)
    return
  }
  
  // Has access - select the model
  const models = { d48: { id:"llama-3.3-70b-versatile", name:"Datta 4.8" }, d54: { id:"llama-3.3-70b-versatile", name:"Datta 5.4" } }
  const m = models[key]
  if (m) selectInputModel(m.id, key, m.name)
}
window.checkModelAccess = checkModelAccess

window.selectInputModel = selectInputModel

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
