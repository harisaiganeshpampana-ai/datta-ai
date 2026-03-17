if (!localStorage.getItem("sessionId")) {
  localStorage.setItem("sessionId", Date.now().toString())
}

const sessionId = localStorage.getItem("sessionId")
const chatBox = document.getElementById("chat")
const sendBtn = document.querySelector(".send")
const scrollBtn = document.getElementById("scrollDownBtn")

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
  const imageInput = document.getElementById("imageInput")
  const filePreview = document.getElementById("filePreview")
  const clearFileBtn = document.getElementById("clearFile")
  const file = imageInput.files[0]
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
  imageInput.value = ""
  if (filePreview) filePreview.textContent = ""
  if (clearFileBtn) clearFileBtn.style.display = "none"

  // Show typing indicator
  let aiDiv = document.createElement("div")
  aiDiv.className = "messageRow"
  aiDiv.innerHTML = `
    <div class="avatar">🤖</div>
    <div class="aiBubble typing">
      <span></span><span></span><span></span>
    </div>
  `
  chatBox.appendChild(aiDiv)
  chatBox.scrollTop = chatBox.scrollHeight

  // Build FormData
  controller = new AbortController()
  const formData = new FormData()
  formData.append("message", text)
  formData.append("sessionId", sessionId)
  formData.append("chatId", currentChatId || "")

  if (file) {
    formData.append("image", file)  // server receives file here
  }

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
          <button onclick="copyText(this)"><i data-lucide="copy"></i></button>
          <button onclick="speakText(this)"><i data-lucide="volume-2"></i></button>
          <button onclick="stopVoice()"><i data-lucide="square"></i></button>
          <button onclick="regenerateFrom(this)"><i data-lucide="refresh-ccw"></i></button>
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

      span.innerHTML = marked.parse(streamText) + '<span class="cursor">▌</span>'
      scrollBottom()
      lucide.createIcons()
    }

    span.innerHTML = marked.parse(streamText)
    lucide.createIcons()
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
  const res = await fetch("https://datta-ai-server.onrender.com/chats/" + sessionId)
  const chats = await res.json()
  const history = document.getElementById("history")
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
}


// ─── OPEN CHAT ────────────────────────────────────────────────────────────────
async function openChat(chatId) {
  currentChatId = chatId
  chatBox.innerHTML = ""
  hideWelcome()

  const res = await fetch("https://datta-ai-server.onrender.com/chat/" + chatId)
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
              <button class="actionBtn" onclick="copyText(this)"><i data-lucide="copy"></i></button>
              <button class="actionBtn" onclick="speakText(this)"><i data-lucide="volume-2"></i></button>
              <button class="actionBtn" onclick="stopVoice()"><i data-lucide="square"></i></button>
              <button class="actionBtn" onclick="regenerateFrom(this)"><i data-lucide="refresh-cw"></i></button>
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
  await fetch("https://datta-ai-server.onrender.com/chat/" + id, { method: "DELETE" })
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
      sessionId: sessionId,
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
