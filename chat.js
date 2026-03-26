// SHARE CHAT
async function shareChatLink() {
  if (!currentChatId) { showToast("Start a chat first!"); return }
  try {
    showToast("Creating share link...")
    const res = await fetch("https://datta-ai-server.onrender.com/chat/" + currentChatId + "/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: getToken() })
    })
    const data = await res.json()
    if (data.url) {
      await navigator.clipboard.writeText(data.url)
      showToast("Share link copied! 🔗")
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
    const res = await fetch("https://datta-ai-server.onrender.com/execute", {
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
      outputDiv.innerHTML = '<div class="codeOutputErr">❌ ' + result.errors + '</div>'
    } else if (result.output) {
      outputDiv.innerHTML = '<div class="codeOutputOk">▶ Output:<br><pre>' + result.output + '</pre></div>'
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

// STOP GENERATION
function showStopBtn() {
  const stop = document.getElementById("stopBtn")
  const send = document.getElementById("sendBtn")
  const mic = document.getElementById("micBtn")
  if (stop) stop.style.display = "flex"
  if (send) send.style.display = "none"
  if (mic) mic.style.display = "none"
}

function hideStopBtn() {
  const stop = document.getElementById("stopBtn")
  const send = document.getElementById("sendBtn")
  const mic = document.getElementById("micBtn")
  if (stop) stop.style.display = "none"
  if (send) send.style.display = "flex"
  if (mic) mic.style.display = "flex"
}

function stopGeneration() {
  if (controller) {
    controller.abort()
    controller = null
  }
  hideStopBtn()
}

window.stopGeneration = stopGeneration

// RENDER IMAGE RESPONSE - Datta AI unique style
function renderImageResponse(text) {
  let imgUrl = null
  let prompt = "Generated Image"

  if (text.includes("DATTA_IMAGE_START")) {
    const promptMatch = text.match(/PROMPT:([^\n]+)/)
    if (promptMatch) prompt = promptMatch[1].trim()
    const base64Match = text.match(/!\[[^\]]*\]\((data:image[^)]{0,10000000})\)/)
    const urlMatch = text.match(/!\[[^\]]*\]\((https:[^)]+)\)/)
    if (base64Match) imgUrl = base64Match[1]
    else if (urlMatch) imgUrl = urlMatch[1]
  } else {
    const imgMatch = text.match(/!\[([^\]]*)\]\(([^)]+)\)/)
    const promptMatch = text.match(/PROMPT:(.+)/) || text.match(/\*Prompt: ([^*]+)\*/)
    if (!imgMatch) return marked.parse(text)
    imgUrl = imgMatch[2]
    if (promptMatch) prompt = promptMatch[1].trim()
  }

  if (!imgUrl) return marked.parse(text)
  const altText = prompt
  const uid = "ig" + Date.now()

  return `<div class="dattaImgWrap" id="${uid}">
  <div class="dattaImgLabel" id="${uid}lbl">
    <span class="dattaImgIcon">🎨</span>
    <span>Creating your image...</span>
  </div>
  <div class="dattaImgBox">
    <div class="dattaShimmer" id="${uid}shimmer">
      <div class="imgGenCanvas">
        <div class="imgGenParticle" style="--d:0s;--x:20%;--y:30%"></div>
        <div class="imgGenParticle" style="--d:0.3s;--x:70%;--y:20%"></div>
        <div class="imgGenParticle" style="--d:0.6s;--x:50%;--y:60%"></div>
        <div class="imgGenParticle" style="--d:0.9s;--x:80%;--y:70%"></div>
        <div class="imgGenParticle" style="--d:1.2s;--x:30%;--y:80%"></div>
        <div class="imgGenParticle" style="--d:1.5s;--x:60%;--y:40%"></div>
        <div class="imgGenBrush"></div>
        <div class="imgGenCenter">
          <div class="imgGenRing r1"></div>
          <div class="imgGenRing r2"></div>
          <div class="imgGenRing r3"></div>
          <div class="imgGenIcon">🎨</div>
        </div>
      </div>
      <div class="shimmerText" id="${uid}txt">Generating with AI...</div>
    </div>
    <img src="${imgUrl}" alt="${altText}" class="dattaImg" style="display:none;opacity:0;"
      onload="
        var w=document.getElementById('${uid}');
        var s=document.getElementById('${uid}shimmer');
        var l=document.getElementById('${uid}lbl');
        var a=document.getElementById('${uid}actions');
        if(s)s.style.display='none';
        if(l)l.innerHTML='<span class=dattaImgIcon>✨</span><span>${prompt}</span>';
        if(a)a.style.display='flex';
        this.style.display='block';
        setTimeout(function(){var img=document.querySelector('#${uid} .dattaImg');if(img)img.style.opacity='1';},10);
      "
      onerror="
        var img=this;
        var s=document.getElementById('${uid}shimmer');
        var retries=parseInt(img.dataset.retries||0);
        // Only retry for URL images (not base64)
        if(!img.src.startsWith('data:') && retries < 3){
          img.dataset.retries=retries+1;
          if(s && s.querySelector) s.querySelector && (s.querySelector('.shimmerText').textContent='Retrying... ('+(retries+1)+'/3)');
          setTimeout(function(){
            var seed=Math.floor(Math.random()*999999);
            var newSrc=img.src.replace(/seed=\d+/,'seed='+seed);
            if(newSrc===img.src) newSrc=img.src+'&r='+seed;
            img.src=newSrc;
          }, 3000);
        } else {
          if(s)s.innerHTML='<div style=\'padding:32px;color:#888;text-align:center;font-size:13px\'>❌ Image service busy. Try again in a moment.</div>';
        }
      "
    >
  </div>
  <div class="dattaImgActions" id="${uid}actions" style="display:none;">
    <button class="dattaImgBtn" onclick="downloadImage('${imgUrl}','${prompt}')">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Download
    </button>
    <button class="dattaImgBtn" onclick="regenerateImage('${prompt}',this)">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
      Regenerate
    </button>
    <button class="dattaImgBtn likeImgBtn" onclick="likeImage(this)" title="Like">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
    </button>
    <button class="dattaImgBtn dislikeImgBtn" onclick="dislikeImage(this)" title="Dislike">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>
    </button>
  </div>
</div>`
}

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
window.renderImageResponse = renderImageResponse
// AUTH CHECK - redirect to login if not logged in
// Configure marked for clean rendering
if (typeof marked !== 'undefined') {
  marked.setOptions({
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
  showWelcome()
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

  // Show user bubble with file info if attached
  chatBox.innerHTML += `
    <div class="messageRow userRow">
      <div class="userBubble">
        ${file ? `<div style="font-size:12px;opacity:0.75;margin-bottom:4px;">📄 ${file.name}</div>` : ""}
        ${text ? `<div>${text}</div>` : ""}
      </div>
      <div class="avatar">🧑</div>
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

  // Detect request type for indicator
  const searchTriggers = ["latest","recent","today","yesterday","this week","current","now","live","breaking","news","who is","what is the","price of","weather","score","2025","2026","happened","update","trending","stock","crypto","bitcoin","search for","find","look up","ipl","cricket","match","movie","released","launched","election","gold","petrol"]
  const imageTriggers = ["generate image","create image","make image","draw","generate photo","create photo","make photo","generate picture","create picture","image of","picture of","photo of","draw me","paint","illustrate","sketch","generate art","create art"]

  const willSearch = searchTriggers.some(t => text.toLowerCase().includes(t))
  const willGenImage = imageTriggers.some(t => text.toLowerCase().includes(t))

  // Show appropriate indicator
  let aiDiv = document.createElement("div")
  aiDiv.className = "messageRow"

  if (willGenImage) {
    aiDiv.innerHTML = `
      <div class="avatar">🤖</div>
      <div class="aiBubble searchingIndicator" style="background:#1a0a2a!important;border-color:#4a1a6a!important;">
        <span class="searchIcon">🎨</span>
        <span class="searchText" style="color:#cc88ff;">Generating image...</span>
      </div>
    `
  } else if (willSearch) {
    aiDiv.innerHTML = `
      <div class="avatar">🤖</div>
      <div class="aiBubble searchingIndicator">
        <span class="searchIcon">🌐</span>
        <span class="searchText">Searching the web...</span>
      </div>
    `
  } else {
    aiDiv.innerHTML = `
      <div class="avatar">🤖</div>
      <div class="aiBubble typing">
        <span></span><span></span><span></span>
      </div>
    `
  }
  chatBox.appendChild(aiDiv)
  chatBox.scrollTop = chatBox.scrollHeight

  // Build FormData
  controller = new AbortController()
  const formData = new FormData()
  formData.append("message", text)
  formData.append("chatId", currentChatId || "")
  formData.append("token", getToken())
  formData.append("language", localStorage.getItem("datta_language") || "English")

  if (file) {
    formData.append("image", file)
  }

  showStopBtn()

  try {
    const res = await fetch("https://datta-ai-server.onrender.com/chat", {
      method: "POST",
      signal: controller.signal,
      body: formData
    })

    const chatIdFromHeader = res.headers.get("x-chat-id")
    if (!currentChatId && chatIdFromHeader) {
      currentChatId = chatIdFromHeader
    }

    // Replace typing indicator with response bubble
    aiDiv.innerHTML = `
      <div class="avatar">🤖</div>
      <div class="aiContent">
        <div class="aiBubble">
          <span class="stream"></span>
        </div>
        <div class="aiActions">
          <button class="actionBtn" title="Copy" onclick="copyText(this)"><i data-lucide="copy"></i></button>
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

      // Check if image response
      const isImgResponse = streamText.includes("pollinations.ai") || streamText.includes("DATTA_IMAGE")
      if (isImgResponse) {
        const container = aiDiv.querySelector(".aiContent") || aiDiv
        if (streamText.includes("DATTA_IMAGE_END") || streamText.includes("pollinations.ai")) {
          container.innerHTML = renderImageResponse(streamText)
        } else {
          span.innerHTML = '<span style="color:#888;font-size:13px;">🎨 Generating image...</span>'
        }
      } else {
        span.innerHTML = marked.parse(streamText) + '<span class="cursor">▌</span>'
      }
      scrollBottom()
      lucide.createIcons()
    }

    // Final render
    const isImgResponse = streamText.includes("pollinations.ai") || streamText.includes("DATTA_IMAGE")
    if (isImgResponse) {
      const container = aiDiv.querySelector(".aiContent") || aiDiv
      container.innerHTML = renderImageResponse(streamText)
    } else {
      span.innerHTML = marked.parse(streamText)
    }
    lucide.createIcons()
    hideStopBtn()
    loadSidebar()

  } catch (err) {
    if (err.name === "AbortError") {
      console.log("Request cancelled")
    } else {
      aiDiv.innerHTML = `
        <div class="avatar">🤖</div>
        <div class="aiBubble" style="color:#f88;">⚠️ Something went wrong. Please try again.</div>
      `
      console.error("Send error:", err)
    }
  }
}


// ─── LOAD SIDEBAR ─────────────────────────────────────────────────────────────
let sidebarFixDone = false

async function loadSidebar() {
  try {
    const res = await fetch("https://datta-ai-server.onrender.com/chats?token=" + getToken())

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
        fetch("https://datta-ai-server.onrender.com/chats/fix-titles?token=" + getToken(), {
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
        <div class="chatTitle" title="${chat.title}">${chat.title}</div>
        <button class="deleteBtn" onclick="confirmDelete(event,'${chat._id}')" title="Delete chat">🗑</button>
      `
      div.onclick = (e) => {
        if (e.target.closest(".deleteBtn")) return
        openChat(chat._id)
      }
      history.appendChild(div)
    })

    // Restore last chat - only on first load
    if (!window._chatRestored) {
      window._chatRestored = true
      const lastChatId = localStorage.getItem("datta_last_chat")
      if (lastChatId && chats.length > 0) {
        const exists = chats.some(c => c._id === lastChatId)
        if (exists) {
          openChat(lastChatId)
          setTimeout(() => {
            document.querySelectorAll(".chatItem").forEach(d => d.classList.remove("active"))
            const activeDiv = history.querySelector("[data-chat-id='" + lastChatId + "']")
            if (activeDiv) activeDiv.classList.add("active")
          }, 300)
        } else {
          localStorage.removeItem("datta_last_chat")
        }
      }
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

  const res = await fetch("https://datta-ai-server.onrender.com/chat/" + chatId + "?token=" + getToken())
  const messages = await res.json()

  messages.forEach(m => {
    if (m.role === "user") {
      chatBox.innerHTML += `
        <div class="messageRow userRow">
          <div class="userBubble">${m.content}</div>
          <div class="avatar">🧑</div>
        </div>
      `
    } else {
      chatBox.innerHTML += `
        <div class="messageRow">
          <div class="avatar">🤖</div>
          <div class="aiContent">
            <div class="aiBubble">${marked.parse(m.content)}</div>
            <div class="aiActions">
              <button class="actionBtn" title="Copy" onclick="copyText(this)"><i data-lucide="copy"></i></button>
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
async function deleteChat(e, id) {
  e.stopPropagation()
  await fetch("https://datta-ai-server.onrender.com/chat/" + id + "?token=" + getToken(), {
    method: "DELETE"
  })
  loadSidebar()
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

  const res = await fetch("https://datta-ai-server.onrender.com/chat", {
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
function startAssistant() {
  const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)()
  recognition.lang = "en-US"
  recognition.start()
  recognition.onresult = (e) => {
    document.getElementById("message").value = e.results[0][0].transcript
    send()
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
  if (w) w.style.display = "none"
}

function showWelcome() {
  const w = document.getElementById("welcomeScreen")
  if (w) w.style.display = "block"
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
    const res = await fetch("https://datta-ai-server.onrender.com/auth/update-username", {
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
    const res = await fetch("https://datta-ai-server.onrender.com/auth/change-password", {
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
    const res = await fetch("https://datta-ai-server.onrender.com/chats/all?token=" + getToken(), {
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
    const res = await fetch("https://datta-ai-server.onrender.com/auth/delete-account", {
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
    micBtn.classList.toggle("active", mode === "listening")
  }
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
  voiceRecognition.lang = "en-US"
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

    const res = await fetch("https://datta-ai-server.onrender.com/chat", {
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
        <div class="avatar">🧑</div>
      </div>
    `
    chatBox.innerHTML += `
      <div class="messageRow">
        <div class="avatar">🤖</div>
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
  "indian":  { name: "Riya",    lang: "en-IN", rate: 0.9,  pitch: 1.0, keywords: ["Google हिन्दी","Lekha","Veena","en-IN"] },
  "british": { name: "Oliver",  lang: "en-GB", rate: 0.9,  pitch: 0.9, keywords: ["Google UK English Male","Arthur","Oliver","en-GB"] }
}

function getSelectedVoiceProfile() {
  return localStorage.getItem("datta_voice") || "aria"
}

function pickVoice(profile) {
  const voices = voiceSynth.getVoices()
  if (!voices.length) return null

  // Try to find matching voice by keywords
  for (const keyword of profile.keywords) {
    const found = voices.find(v =>
      v.name.includes(keyword) ||
      v.lang.startsWith(profile.lang)
    )
    if (found) return found
  }

  // Fallback - find any voice with matching lang
  const langMatch = voices.find(v => v.lang.startsWith(profile.lang))
  if (langMatch) return langMatch

  // Last resort - first available
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
    if (voice) utterance.voice = voice

    utterance.onend = () => {
      isSpeaking = false
      if (voiceActive) {
        setVoiceStatus("Tap to speak", "idle")
        setTimeout(() => { if (voiceActive) startListening() }, 800)
      }
    }
    utterance.onerror = () => {
      isSpeaking = false
      setVoiceStatus("Tap to speak", "idle")
    }
    voiceSynth.speak(utterance)
  }

  if (voiceSynth.getVoices().length) {
    setVoiceAndSpeak()
  } else {
    voiceSynth.addEventListener("voiceschanged", setVoiceAndSpeak, { once: true })
  }
}

function stopSpeaking() {
  if (voiceSynth) voiceSynth.cancel()
  isSpeaking = false
}

// Update the assistant button to open voice overlay
window.startAssistant = function() {
  openVoiceAssistant()
}

window.openVoiceAssistant = openVoiceAssistant
window.closeVoiceAssistant = closeVoiceAssistant
window.toggleVoiceListening = toggleVoiceListening

// VERSION NAMES based on plan
const planVersions = {
  free:      { name: "Free",      version: "v1.0", emoji: "🌱" },
  pro:       { name: "Pro",       version: "v2.0", emoji: "⚡" },
  max:       { name: "Max",       version: "v3.0", emoji: "🚀" },
  ultramax:  { name: "Ultra Max", version: "v4.0", emoji: "👑" },
  basic:     { name: "Pro",       version: "v2.0", emoji: "⚡" },
  enterprise:{ name: "Ultra Max", version: "v4.0", emoji: "👑" }
}

async function loadUserVersion() {
  try {
    const res = await fetch("https://datta-ai-server.onrender.com/payment/subscription?token=" + getToken())
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

// ── FEATURE 4: CHAT EXPORT ──────────────────────────────────────────────────
function exportChat() {
  const chatBox = document.getElementById("chat")
  if (!chatBox || !chatBox.children.length) {
    alert("No chat to export!")
    return
  }

  // Get all messages
  const messages = []
  chatBox.querySelectorAll(".messageRow").forEach(row => {
    const userBubble = row.querySelector(".userBubble")
    const aiBubble = row.querySelector(".aiBubble, .stream")
    if (userBubble) messages.push("You: " + userBubble.innerText.trim())
    if (aiBubble) messages.push("Datta AI: " + aiBubble.innerText.trim())
  })

  if (!messages.length) return

  const content = "Datta AI Chat Export\n" + new Date().toLocaleString() + "\n" + "=".repeat(50) + "\n\n" + messages.join("\n\n")

  // Download as txt
  const blob = new Blob([content], { type: "text/plain" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = "datta-ai-chat-" + Date.now() + ".txt"
  a.click()
}

window.exportChat = exportChat

// ── FEATURE 5: AI MODEL SELECTOR ────────────────────────────────────────────
function changeModel(model) {
  localStorage.setItem("datta_model", model)
  const modelNames = {
    "llama-3.3-70b-versatile": "Fast",
    "llama-3.1-8b-instant": "Instant",
    "deepseek-r1-distill-llama-70b": "Reasoning",
    "mixtral-8x7b-32768": "Mixtral"
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
  veda:   { model: "llama-3.3-70b-versatile", icon: "⚡", name: "Veda" },
  surya:  { model: "llama-3.1-8b-instant", icon: "🚀", name: "Surya" },
  agni:   { model: "deepseek-r1-distill-llama-70b", icon: "🧠", name: "Agni" },
  brahma: { model: "mixtral-8x7b-32768", icon: "👑", name: "Brahma" },
  chitra: { model: "meta-llama/llama-4-scout-17b-16e-instruct", icon: "👁️", name: "Chitra" }
}

let currentModelKey = "veda"

function openModelPicker() {
  document.getElementById("modelPickerOverlay").classList.add("show")
  document.getElementById("modelPickerModal").classList.add("show")
}

function closeModelPicker() {
  document.getElementById("modelPickerOverlay").classList.remove("show")
  document.getElementById("modelPickerModal").classList.remove("show")
}

function selectModel(modelId, key, icon, name) {
  currentModelKey = key

  // Update all cards
  document.querySelectorAll(".modelCard").forEach(c => c.classList.remove("active"))
  document.querySelectorAll(".modelCardCheck").forEach(c => c.textContent = "")

  const card = document.getElementById("mcard-" + key)
  const check = document.getElementById("check-" + key)
  if (card) card.classList.add("active")
  if (check) check.textContent = "✓"

  // Update button
  document.getElementById("modelBtnIcon").textContent = icon
  document.getElementById("modelBtnName").textContent = name

  // Save
  localStorage.setItem("datta_model", modelId)
  localStorage.setItem("datta_model_key", key)

  showToast("Model: " + name)
  setTimeout(closeModelPicker, 400)
}

// Load saved model on startup
window.addEventListener("DOMContentLoaded", function() {
  const savedKey = localStorage.getItem("datta_model_key") || "veda"
  const saved = modelData[savedKey]
  if (saved) {
    selectModel(saved.model, savedKey, saved.icon, saved.name)
  }
})

window.openModelPicker = openModelPicker
window.closeModelPicker = closeModelPicker
window.selectModel = selectModel

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
