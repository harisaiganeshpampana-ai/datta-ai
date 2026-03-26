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
  // Handle new format
  let cleanText = text
  if (text.includes("DATTA_IMAGE_START")) {
    cleanText = text.replace("DATTA_IMAGE_START\n", "").replace("\nDATTA_IMAGE_END", "")
  }
  const imgMatch = cleanText.match(/!\[([^\]]*)\]\(([^)]+)\)/)
  const promptMatch = cleanText.match(/PROMPT:(.+)/) || cleanText.match(/\*Prompt: ([^*]+)\*/)
  if (!imgMatch) return marked.parse(text)

  const altText = imgMatch[1] || "Generated Image"
  const imgUrl = imgMatch[2]
  const prompt = promptMatch ? promptMatch[1].trim() : altText
  const uid = "ig" + Date.now()

  return `<div class="dattaImgWrap" id="${uid}">
  <div class="dattaImgLabel" id="${uid}lbl">
    <span class="dattaImgIcon">🎨</span>
    <span>Creating your image...</span>
  </div>
  <div class="dattaImgBox">
    <div class="dattaShimmer" id="${uid}shimmer">
      <div class="shimmerOrb"></div>
      <div class="shimmerText">Generating with AI...</div>
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
        if(retries < 2){
          img.dataset.retries=retries+1;
          setTimeout(function(){
            var seed=Math.floor(Math.random()*999999);
            img.src=img.src.replace(/seed=\d+/,'seed='+seed);
          }, 2000);
          if(s)s.querySelector('.shimmerText').textContent='Retrying... ('+(retries+1)+'/2)';
        } else {
          if(s)s.innerHTML='<div style=padding:32px;color:#888;text-align:center;font-size:13px>❌ Failed to generate. Try again.</div>';
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
window.renderImageResponse = renderImageResponse
// AUTH CHECK - redirect to login if not logged in
// Always read token fresh
function getToken() {
  return localStorage.getItem("datta_token") || ""
}

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

    chats.forEach(chat => {
      let div = document.createElement("div")
      div.className = "chatItem"
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
  userScrolledUp = distFromBottom > 100
  if (scrollBtn) scrollBtn.style.display = userScrolledUp ? "block" : "none"
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
function toggleSidebar() {
  const sidebar = document.querySelector(".sidebar")
  sidebar.classList.toggle("show")
}

window.toggleSidebar = toggleSidebar


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
function searchChats() {
  const query = document.getElementById("search").value.toLowerCase()
  document.querySelectorAll(".chatItem").forEach(item => {
    const title = item.querySelector(".chatTitle")?.textContent.toLowerCase() || ""
    item.style.display = title.includes(query) ? "" : "none"
  })
}


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

function speakText2(text) {
  if (!voiceSynth) return
  stopSpeaking()

  isSpeaking = true
  setVoiceStatus("Speaking...", "speaking")

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = "en-US"
  utterance.rate = 0.95
  utterance.pitch = 1.0
  utterance.volume = 1.0

  // Try to get a good voice
  const voices = voiceSynth.getVoices()
  const preferred = voices.find(v =>
    v.name.includes("Google") ||
    v.name.includes("Samantha") ||
    v.name.includes("Karen") ||
    v.name.includes("Female") ||
    (v.lang === "en-US" && !v.name.includes("Male"))
  )
  if (preferred) utterance.voice = preferred

  utterance.onend = () => {
    isSpeaking = false
    if (voiceActive) {
      setVoiceStatus("Tap to speak", "idle")
      // Auto listen after speaking
      setTimeout(() => {
        if (voiceActive) startListening()
      }, 800)
    }
  }

  utterance.onerror = () => {
    isSpeaking = false
    setVoiceStatus("Tap to speak", "idle")
  }

  voiceSynth.speak(utterance)
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
  free:       { name: "Arambh", sanskrit: "आरंभ", version: "v1.0", emoji: "🌱" },
  starter:    { name: "Arambh", sanskrit: "आरंभ", version: "v1.0", emoji: "🌱" },
  basic:      { name: "Shakti", sanskrit: "शक्ति", version: "v2.0", emoji: "⚡" },
  growth:     { name: "Shakti", sanskrit: "शक्ति", version: "v2.0", emoji: "⚡" },
  pro:        { name: "Agni",   sanskrit: "अग्नि",  version: "v3.0", emoji: "🔥" },
  scale:      { name: "Agni",   sanskrit: "अग्नि",  version: "v3.0", emoji: "🔥" },
  enterprise: { name: "Brahma", sanskrit: "ब्रह्म", version: "v4.0", emoji: "👑" },
  empire:     { name: "Brahma", sanskrit: "ब्रह्म", version: "v4.0", emoji: "👑" }
}

async function loadUserVersion() {
  try {
    const res = await fetch("https://datta-ai-server.onrender.com/payment/subscription?token=" + getToken())
    if (!res.ok) return
    const data = await res.json()
    const plan = data.plan || "free"
    const v = planVersions[plan] || planVersions.free

    // Update version tag in sidebar
    const tag = document.getElementById("versionTag")
    if (tag) tag.textContent = "DATTA AI " + v.version + " · " + v.name.toUpperCase()

    // Update profile subtitle
    const sub = document.querySelector(".profileSub")
    if (sub) sub.textContent = v.emoji + " " + v.name + " " + v.sanskrit

    // Update upgrade button
    const upgradeBtn = document.querySelector(".upgradeBtn div div:first-child")
    if (upgradeBtn && plan === "free") {
      upgradeBtn.textContent = "Upgrade to Agni 🔥"
    } else if (upgradeBtn) {
      upgradeBtn.textContent = v.emoji + " " + v.name + " Plan"
    }

    // Store plan
    localStorage.setItem("datta_plan", plan)

  } catch(e) {
    console.log("Version load error:", e.message)
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
