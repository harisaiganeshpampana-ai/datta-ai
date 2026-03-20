// ============================================
// FORCE SEND FUNCTION TO BE GLOBAL
// ============================================
console.log("Chat.js loading...");

// Helper for HTML escaping
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Fallback send function
window.forceSend = function() {
  console.log("Force send called");
  const input = document.getElementById('message');
  const message = input ? input.value.trim() : '';
  
  if (!message) return;
  
  const chatBox = document.getElementById('chat');
  if (!chatBox) return;
  
  // Add user message
  chatBox.innerHTML += `
    <div class="messageRow userRow">
      <div class="userBubble">${escapeHtml(message)}</div>
      <div class="avatar">🧑</div>
    </div>
  `;
  
  input.value = '';
  chatBox.scrollTop = chatBox.scrollHeight;
  
  // Add AI typing indicator
  chatBox.innerHTML += `
    <div class="messageRow">
      <div class="avatar">🤖</div>
      <div class="aiBubble typing">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  chatBox.scrollTop = chatBox.scrollHeight;
  
  // Call the real send if it exists
  if (typeof window.realSend === 'function') {
    window.realSend(message);
  } else {
    // Fallback response
    setTimeout(() => {
      const typingMsg = chatBox.querySelector('.typing');
      if (typingMsg && typingMsg.closest('.messageRow')) {
        const row = typingMsg.closest('.messageRow');
        row.innerHTML = `
          <div class="avatar">🤖</div>
          <div class="aiBubble">Hello! I'm Datta AI. Your message was: "${escapeHtml(message.substring(0, 100))}"\n\nI'm ready to help! What would you like to do?</div>
        `;
      }
    }, 1000);
  }
};

// ============================================
// AUTHENTICATION HELPERS
// ============================================
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

// Auth check - redirect if not logged in
if (!getToken()) {
  window.location.href = "login.html"
}

window.dattaToken = getToken()
window.dattaUser = getUser()

// Enhanced fetch wrapper with auth headers
const originalFetch = window.fetch;
window.fetch = function(url, options = {}) {
  const token = getToken();
  if (token && (url.includes('datta-ai-server') || url.includes('render.com'))) {
    options.headers = options.headers || {};
    options.headers['Authorization'] = `Bearer ${token}`;
  }
  return originalFetch(url, options);
};

// Update profile on load
window.addEventListener("DOMContentLoaded", function() {
  const user = getUser();
  if (user) {
    const nameEl = document.querySelector(".profileName")
    const avatarEl = document.querySelector(".profileAvatar")
    const subEl = document.querySelector(".profileSub")
    if (nameEl) {
      nameEl.textContent = user.username || user.email || "User"
      nameEl.style.wordBreak = 'break-all';
      nameEl.style.whiteSpace = 'normal';
    }
    if (avatarEl) avatarEl.textContent = (user.username || "U")[0].toUpperCase()
    
    const plan = localStorage.getItem("datta_plan") || "free"
    const planNames = { shakti: '⚡ Shakti', agni: '🔥 Agni', brahma: '👑 Brahma', free: 'Free', arambh: 'Free' }
    if (subEl && !user.isCreator) subEl.textContent = planNames[plan] || 'Free Plan'
    if (subEl && user.isCreator) subEl.textContent = '👑 Creator'
  }
})

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

// ============================================
// IMAGE GENERATION FUNCTIONS
// ============================================

async function generateImage(prompt, aiDiv) {
  let cleanPrompt = prompt
    .replace(/generate image of|create image of|make image of|generate photo of|create photo of|make photo of|generate picture of|create picture of|picture of|photo of|image of|draw me a|draw me|draw a|draw|illustrate a|illustrate|sketch a|sketch|paint a|paint|generate art of|create art of|make art of/gi, "")
    .trim()
  
  if (!cleanPrompt) cleanPrompt = prompt
  
  const encodedPrompt = encodeURIComponent(cleanPrompt)
  const timestamp = Date.now()
  const seed = Math.floor(Math.random() * 999999)
  
  const imageUrls = [
    `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&seed=${seed}&timestamp=${timestamp}`,
    `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&model=flux&seed=${seed}`,
    `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&model=turbo&seed=${seed}`,
    `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&seed=${seed}`
  ]
  
  // Try server-side generation first
  try {
    const formData = new FormData()
    formData.append("prompt", cleanPrompt)
    formData.append("token", getToken())
    
    const res = await fetch("https://datta-ai-server.onrender.com/generate-image", {
      method: "POST",
      body: formData
    })
    
    if (res.ok) {
      const data = await res.json()
      if (data.imageUrl) {
        displayImageInChat(cleanPrompt, data.imageUrl, aiDiv)
        return
      }
    }
  } catch(e) {
    console.log("Server image failed:", e.message)
  }
  
  // Try direct Pollinations
  for (let i = 0; i < imageUrls.length; i++) {
    const success = await testImageUrl(imageUrls[i], cleanPrompt, aiDiv, i + 1, imageUrls.length)
    if (success) return
  }
  
  if (aiDiv) {
    aiDiv.innerHTML = `
      <div class="avatar">🎨</div>
      <div class="aiContent">
        <div class="aiBubble" style="color:#ff8888; background:#2a0a0a;">
          ⚠️ Image generation failed. Please try again.<br>
          <small>Prompt: "${cleanPrompt.substring(0, 50)}..."</small>
        </div>
      </div>
    `
  }
  hideStopBtn()
  if (typeof loadSidebar === 'function') loadSidebar()
}

function testImageUrl(url, prompt, aiDiv, attempt, total) {
  return new Promise((resolve) => {
    const img = new Image()
    const timeout = setTimeout(() => {
      img.onload = null
      img.onerror = null
      resolve(false)
    }, 8000)
    
    img.onload = () => {
      clearTimeout(timeout)
      displayImageInChat(prompt, url, aiDiv)
      resolve(true)
    }
    
    img.onerror = () => {
      clearTimeout(timeout)
      if (aiDiv && attempt < total && aiDiv.querySelector(".aiBubble")) {
        aiDiv.querySelector(".aiBubble").innerHTML = `<span style="color:#cc88ff;">🎨 Attempt ${attempt + 1}/${total}... Trying again</span>`
      }
      resolve(false)
    }
    
    img.src = url + "&test=" + Date.now()
  })
}

function displayImageInChat(prompt, imageUrl, aiDiv) {
  if (aiDiv) {
    aiDiv.innerHTML = `
      <div class="avatar">🎨</div>
      <div class="aiContent">
        <div class="dattaImgWrap" style="max-width:400px;">
          <div style="font-family:Rajdhani,sans-serif;font-size:11px;letter-spacing:1px;color:#cc88ff;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
            <span>🎨</span>
            <span>${escapeHtml(prompt.substring(0, 50))}${prompt.length > 50 ? '...' : ''}</span>
          </div>
          <div style="position:relative;border-radius:12px;overflow:hidden;background:#1a0a2a;">
            <img src="${imageUrl}" alt="${escapeHtml(prompt)}"
              style="width:100%;border-radius:12px;display:block;cursor:pointer;"
              onclick="window.open('${imageUrl}', '_blank')"
              onerror="this.onerror=null; this.src='https://placehold.co/400x400/1a0a2a/cc88ff?text=Failed+to+load';"
            >
          </div>
          <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
            <button onclick="regenerateImage('${prompt.replace(/'/g, "\\'")}', this)" 
              style="padding:6px 14px;background:rgba(255,215,0,0.08);border:1px solid rgba(255,215,0,0.2);border-radius:20px;color:#cc9900;font-family:Rajdhani,sans-serif;font-size:12px;cursor:pointer;">
              🔄 Regenerate
            </button>
            <button onclick="downloadImage('${imageUrl}','${prompt.replace(/'/g, "\\'")}')" 
              style="padding:6px 14px;background:rgba(255,215,0,0.08);border:1px solid rgba(255,215,0,0.2);border-radius:20px;color:#cc9900;font-family:Rajdhani,sans-serif;font-size:12px;cursor:pointer;">
              ⬇️ Download
            </button>
          </div>
        </div>
      </div>
    `
    const chat = document.getElementById("chat")
    if (chat) chat.scrollTop = chat.scrollHeight
  }
  hideStopBtn()
  if (typeof loadSidebar === 'function') loadSidebar()
}

function renderImageResponse(text) {
  const imgMatch = text.match(/!\[([^\]]*)\]\(([^)]+)\)/)
  const promptMatch = text.match(/PROMPT:(.+)/) || text.match(/\*Prompt: ([^*]+)\*/)
  
  if (!imgMatch) return marked.parse(text)

  const altText = imgMatch[1] || "Generated Image"
  let imgUrl = imgMatch[2]
  const prompt = (promptMatch ? promptMatch[1].trim() : altText).substring(0, 100)
  const safePrompt = prompt.replace(/'/g, "").replace(/"/g, "")

  if (!imgUrl.includes('timestamp=') && !imgUrl.includes('t=')) {
    imgUrl += (imgUrl.includes('?') ? '&' : '?') + 't=' + Date.now()
  }

  return `<div class="dattaImgWrap" style="max-width:400px;">
  <div style="font-family:Rajdhani,sans-serif;font-size:11px;letter-spacing:1px;color:#cc88ff;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
    <span>🎨</span><span>${escapeHtml(safePrompt)}</span>
  </div>
  <div style="border-radius:12px;overflow:hidden;background:#1a0a2a;">
    <img src="${imgUrl}" alt="${escapeHtml(altText)}"
      style="width:100%;border-radius:12px;display:block;cursor:pointer;"
      onclick="window.open('${imgUrl}', '_blank')"
      onerror="this.src='https://placehold.co/400x400/1a0a2a/cc88ff?text=Failed+to+load';"
    >
  </div>
  <div style="display:flex;gap:8px;margin-top:10px;">
    <button onclick="regenerateImage('${safePrompt}',this)" style="padding:6px 14px;background:rgba(255,215,0,0.08);border:1px solid rgba(255,215,0,0.2);border-radius:20px;color:#cc9900;font-family:Rajdhani,sans-serif;font-size:12px;cursor:pointer;">🔄 Regenerate</button>
    <button onclick="downloadImage('${imgUrl}','${safePrompt}')" style="padding:6px 14px;background:rgba(255,215,0,0.08);border:1px solid rgba(255,215,0,0.2);border-radius:20px;color:#cc9900;font-family:Rajdhani,sans-serif;font-size:12px;cursor:pointer;">⬇️ Download</button>
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
  const wrap = btn.closest(".dattaImgWrap")
  if (!wrap) return
  
  btn.disabled = true
  btn.innerHTML = '⏳ Generating...'
  
  const encodedPrompt = encodeURIComponent(prompt)
  const seed = Math.floor(Math.random() * 999999)
  const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&seed=${seed}&t=${Date.now()}`
  
  const img = wrap.querySelector("img")
  const label = wrap.querySelector("div:first-child span:last-child")
  
  if (label) label.textContent = prompt.substring(0, 50) + (prompt.length > 50 ? '...' : '')
  
  if (img) {
    img.onload = () => {
      btn.disabled = false
      btn.innerHTML = '🔄 Regenerate'
    }
    img.onerror = () => {
      btn.disabled = false
      btn.innerHTML = '🔄 Retry'
      img.src = `https://placehold.co/400x400/1a0a2a/cc88ff?text=Failed`
    }
    img.src = imageUrl
  }
}

window.generateImage = generateImage
window.regenerateImage = regenerateImage
window.downloadImage = downloadImage
window.renderImageResponse = renderImageResponse

// ============================================
// MAIN CHAT VARIABLES
// ============================================
const chatBox = document.getElementById("chat")
const scrollBtn = document.getElementById("scrollDownBtn")

let currentChatId = null
let controller = null
let userScrolledUp = false

const imageTriggers = [
  "generate image", "create image", "make image", "draw", "generate photo",
  "create photo", "make photo", "generate picture", "create picture",
  "image of", "picture of", "photo of", "draw me", "paint", "illustrate",
  "sketch", "generate art", "create art", "make art"
]

// ============================================
// NEW CHAT FUNCTION
// ============================================
function newChat() {
  currentChatId = null
  if (chatBox) chatBox.innerHTML = ""
  if (chatBox) chatBox.scrollTop = 0
  showWelcome()
}
window.newChat = newChat

// ============================================
// MOOD FUNCTIONS
// ============================================
function getMoodContext() {
  return window.dattaMoodPersonality || null
}

function showAutoMoodPill(moodKey) {
  const MOODS = window.MOODS || {}
  const mood = MOODS[moodKey]
  if (!mood) return

  const pill = document.getElementById("autoMoodPill")
  if (!pill) return

  pill.style.border = `1px solid ${mood.color}44`
  pill.style.background = "transparent"
  pill.style.color = mood.color
  pill.style.fontSize = "11px"
  pill.style.padding = "2px 8px"
  pill.style.opacity = "0.85"
  pill.innerHTML = `<span style="font-size:9px;letter-spacing:1px;opacity:0.6;margin-right:3px;">AUTO</span>${mood.emoji}`
  pill.style.display = "flex"
  pill.title = `Auto-detected: ${mood.label}`

  localStorage.setItem("datta_last_auto_mood", moodKey)

  clearTimeout(pill._hideTimer)
  pill._hideTimer = setTimeout(() => {
    pill.style.opacity = "0"
    setTimeout(() => {
      pill.style.display = "none"
      pill.style.opacity = "0.85"
      localStorage.removeItem("datta_last_auto_mood")
    }, 400)
  }, 8000)
}

function restoreAutoMoodPill() {
  const autoSaved = localStorage.getItem("datta_last_auto_mood")
  if (!autoSaved) return
  const MOODS = window.MOODS || {}
  const mood = MOODS[autoSaved]
  if (!mood) return
  const pill = document.getElementById("autoMoodPill")
  if (!pill) return
  pill.style.border = `1px solid ${mood.color}44`
  pill.style.background = "transparent"
  pill.style.color = mood.color
  pill.style.fontSize = "11px"
  pill.style.padding = "2px 8px"
  pill.style.opacity = "0.85"
  pill.innerHTML = `<span style="font-size:9px;letter-spacing:1px;opacity:0.6;margin-right:3px;">AUTO</span>${mood.emoji}`
  pill.style.display = "flex"
  pill.title = `Auto-detected: ${mood.label}`
}

window.addEventListener("DOMContentLoaded", function() {
  setTimeout(restoreAutoMoodPill, 1500)
})

function buildMoodPrefix() {
  const mood = getMoodContext()
  const lengthRule = `[RESPONSE LENGTH RULE]: Keep answers SHORT and CONCISE by default. Reply in 1-3 sentences unless user asks for details. Max 2 emojis.\n\n`
  if (!mood) return "[STRICT INSTRUCTION]: " + lengthRule
  return "[STRICT INSTRUCTION]: " + lengthRule + "[MOOD INSTRUCTION]: " + mood + "\n\n"
}

// ============================================
// SEND FUNCTION - MAIN
// ============================================
async function send() {
  console.log("send() called")
  
  const input = document.getElementById("message")
  if (!input) {
    console.error("Message input not found")
    return
  }
  
  const text = input.value.trim()
  if (!text) {
    console.log("No text to send")
    return
  }
  
  console.log("Sending:", text)
  
  input.value = ""
  
  if (window.dattaAutoDetectMood && text) {
    const detected = window.dattaAutoDetectMood(text)
    if (detected) showAutoMoodPill(detected)
  }
  
  if (!currentChatId) {
    let title = text.substring(0, 40)
    if (text.length > 40) title += "..."
    saveChatTitle(title)
  }
  
  hideWelcome()
  document.body.classList.add("chat-started")
  
  const moodEmoji = window.dattaMoodEmoji ? window.dattaMoodEmoji + " " : ""
  
  if (chatBox) {
    chatBox.innerHTML += `
      <div class="messageRow userRow">
        <div class="userBubble">${escapeHtml(text)}</div>
        <div class="avatar">${moodEmoji || "🧑"}</div>
      </div>
    `
    chatBox.scrollTop = chatBox.scrollHeight
  }
  
  const willGenImage = imageTriggers.some(t => text.toLowerCase().includes(t))
  const willSearch = ["latest","news","search","find","what is","who is","weather","today","update"].some(t => text.toLowerCase().includes(t))
  const aiAvatarEmoji = window.dattaMoodEmoji || "🤖"
  
  let aiDiv = document.createElement("div")
  aiDiv.className = "messageRow"
  
  if (willGenImage) {
    aiDiv.innerHTML = `
      <div class="avatar">🎨</div>
      <div class="aiBubble" style="background:#1a0a2a; color:#cc88ff; text-align:center;">
        <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
          <div style="width:40px;height:40px;border:3px solid rgba(200,100,255,0.2);border-top-color:#cc88ff;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
          <span>🎨 Generating image...</span>
        </div>
      </div>
    `
  } else if (willSearch) {
    aiDiv.innerHTML = `
      <div class="avatar">${aiAvatarEmoji}</div>
      <div class="aiBubble searchingIndicator">
        <span class="searchIcon">🌐</span>
        <span class="searchText">Searching the web...</span>
      </div>
    `
  } else {
    aiDiv.innerHTML = `
      <div class="avatar">${aiAvatarEmoji}</div>
      <div class="aiBubble typing">
        <span></span><span></span><span></span>
      </div>
    `
  }
  
  if (chatBox) {
    chatBox.appendChild(aiDiv)
    chatBox.scrollTop = chatBox.scrollHeight
  }
  showStopBtn()
  
  if (willGenImage) {
    let prompt = text
      .replace(/generate image of|create image of|make image of|draw|paint|illustrate|sketch/gi, "")
      .trim()
    if (!prompt) prompt = text
    await generateImage(prompt, aiDiv)
    return
  }
  
  controller = new AbortController()
  const formData = new FormData()
  const moodPrefix = buildMoodPrefix()
  const messageWithMood = moodPrefix ? moodPrefix + text : text
  formData.append("message", messageWithMood)
  formData.append("chatId", currentChatId || "")
  formData.append("token", getToken())
  formData.append("language", localStorage.getItem("datta_language") || "English")
  if (window.dattaMoodLabel) formData.append("mood", window.dattaMoodLabel)
  
  try {
    const res = await fetch("https://datta-ai-server.onrender.com/chat", {
      method: "POST",
      signal: controller.signal,
      body: formData
    })
    
    const chatIdFromHeader = res.headers.get("x-chat-id")
    if (!currentChatId && chatIdFromHeader) currentChatId = chatIdFromHeader
    
    aiDiv.innerHTML = `
      <div class="avatar">${aiAvatarEmoji}</div>
      <div class="aiContent">
        <div class="aiBubble">
          <span class="stream"></span>
        </div>
        <div class="aiActions">
          <button class="actionBtn" title="Copy" onclick="copyText(this)">📋</button>
          <button class="actionBtn" title="Speak" onclick="speakText(this)">🔊</button>
          <button class="actionBtn" title="Regenerate" onclick="regenerateFrom(this)">🔄</button>
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
      
      const isImgResponse = streamText.includes("pollinations.ai") || streamText.includes("DATTA_IMAGE")
      if (isImgResponse) {
        const container = aiDiv.querySelector(".aiContent") || aiDiv
        if (streamText.includes("DATTA_IMAGE_END") || streamText.includes("pollinations.ai")) {
          container.innerHTML = renderImageResponse(streamText)
        } else if (span) {
          span.innerHTML = '<span style="color:#888;">🎨 Generating image...</span>'
        }
      } else if (span) {
        span.innerHTML = marked.parse(streamText) + '<span class="cursor">▌</span>'
      }
      if (chatBox) chatBox.scrollTop = chatBox.scrollHeight
      if (typeof lucide !== 'undefined') lucide.createIcons()
    }
    
    const isImgResponse = streamText.includes("pollinations.ai") || streamText.includes("DATTA_IMAGE")
    if (isImgResponse) {
      const container = aiDiv.querySelector(".aiContent") || aiDiv
      container.innerHTML = renderImageResponse(streamText)
    } else if (span) {
      span.innerHTML = marked.parse(streamText)
    }
    
    hideStopBtn()
    if (typeof loadSidebar === 'function') loadSidebar()
    
  } catch (err) {
    console.error("Send error:", err)
    if (err.name === "AbortError") {
      console.log("Request cancelled")
    } else {
      aiDiv.innerHTML = `
        <div class="avatar">🤖</div>
        <div class="aiBubble" style="color:#f88;">⚠️ Something went wrong. Please try again.</div>
      `
    }
    hideStopBtn()
  }
}

window.send = send

// ============================================
// HELPER FUNCTIONS
// ============================================
function hideWelcome() {
  const cw = document.querySelector(".chatWrapper")
  if (cw) cw.style.pointerEvents = "auto"
  const w = document.getElementById("welcomeScreen")
  if (w) w.style.display = "none"
}

function showWelcome() {
  const cw = document.querySelector(".chatWrapper")
  if (cw) cw.style.pointerEvents = "none"
  const w = document.getElementById("welcomeScreen")
  if (w) w.style.display = "block"
}

function fillPrompt(text) {
  const input = document.getElementById("message")
  if (input) input.value = text
  hideWelcome()
  send()
}
window.fillPrompt = fillPrompt

function saveChatTitle(title) {
  const history = document.getElementById("history")
  if (!history) return
  const div = document.createElement("div")
  div.className = "chatItem"
  div.innerHTML = `<span class="chatTitle">${escapeHtml(title)}</span>`
  history.prepend(div)
}

function copyText(btn) {
  const text = btn.closest(".aiContent")?.querySelector(".aiBubble")?.innerText
  if (text) navigator.clipboard.writeText(text)
}

function speakText(btn) {
  const text = btn.closest(".aiContent")?.querySelector(".aiBubble")?.innerText
  if (text) {
    const speech = new SpeechSynthesisUtterance(text)
    speechSynthesis.speak(speech)
  }
}

function stopVoice() {
  speechSynthesis.cancel()
}

function scrollBottom() {
  if (userScrolledUp) return
  if (chatBox) chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: "smooth" })
}

if (chatBox) {
  chatBox.addEventListener("scroll", () => {
    const distFromBottom = chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight
    userScrolledUp = distFromBottom > 100
    if (scrollBtn) scrollBtn.style.display = userScrolledUp ? "block" : "none"
  })
}

if (scrollBtn) {
  scrollBtn.addEventListener("click", () => {
    userScrolledUp = false
    scrollBottom()
  })
}

// Enter key support
const messageInput = document.getElementById("message")
if (messageInput) {
  messageInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  })
}

// ============================================
// SIDEBAR FUNCTIONS
// ============================================
async function loadSidebar() {
  try {
    const res = await fetch("https://datta-ai-server.onrender.com/chats?token=" + getToken())
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
      div.style.cssText = "display:flex;align-items:center;padding:8px 10px;border-radius:10px;cursor:pointer;transition:background 0.15s;"
      let cleanTitle = chat.title || "New Chat"
      if (cleanTitle.startsWith("[STRICT") || cleanTitle.startsWith("[MOOD")) {
        cleanTitle = "Chat " + new Date().toLocaleDateString()
      }
      cleanTitle = cleanTitle.replace(/^\[.*?\]:\s*/g, "").trim() || "New Chat"
      
      div.innerHTML = `
        <div class="chatTitle" style="flex:1;font-size:13px;color:#665500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(cleanTitle)}</div>
        <button class="deleteBtn" onclick="event.stopPropagation();confirmDeleteChat('${chat._id}')" style="background:none;border:none;color:#443300;cursor:pointer;">🗑️</button>
      `
      div.onclick = () => {
        openChat(chat._id)
        if (window.innerWidth < 900 && typeof closeSidebar === 'function') closeSidebar()
      }
      history.appendChild(div)
    })
  } catch(e) {
    console.error("Sidebar error:", e.message)
  }
}

async function openChat(chatId) {
  currentChatId = chatId
  if (chatBox) chatBox.innerHTML = ""
  hideWelcome()
  const res = await fetch("https://datta-ai-server.onrender.com/chat/" + chatId + "?token=" + getToken())
  const messages = await res.json()
  messages.forEach(m => {
    if (m.role === "user") {
      let displayMsg = m.content || ""
      if (displayMsg.includes("[STRICT INSTRUCTION]") || displayMsg.includes("[MOOD INSTRUCTION")) {
        const parts = m.content.split("\n\n")
        const lastPart = parts[parts.length - 1].trim()
        if (lastPart && !lastPart.startsWith("[")) displayMsg = lastPart
      }
      if (chatBox) {
        chatBox.innerHTML += `
          <div class="messageRow userRow">
            <div class="userBubble">${escapeHtml(displayMsg)}</div>
            <div class="avatar">🧑</div>
          </div>
        `
      }
    } else {
      if (chatBox) {
        chatBox.innerHTML += `
          <div class="messageRow">
            <div class="avatar">🤖</div>
            <div class="aiContent">
              <div class="aiBubble">${marked.parse(m.content)}</div>
              <div class="aiActions">
                <button class="actionBtn" onclick="copyText(this)">📋</button>
                <button class="actionBtn" onclick="speakText(this)">🔊</button>
              </div>
            </div>
          </div>
        `
      }
    }
  })
  scrollBottom()
  if (typeof lucide !== 'undefined') lucide.createIcons()
}

async function deleteChat(e, id) {
  if (e) e.stopPropagation()
  await fetch("https://datta-ai-server.onrender.com/chat/" + id + "?token=" + getToken(), { method: "DELETE" })
  loadSidebar()
}

function confirmDeleteChat(id) {
  if (confirm("Delete this chat permanently?")) {
    deleteChat(null, id)
  }
}

async function regenerateFrom(btn) {
  const row = btn.closest(".messageRow")
  const prev = row?.previousElementSibling
  if (!prev) return
  const text = prev.querySelector(".userBubble")?.innerText
  if (!text) return
  
  const aiBubble = row.querySelector(".aiBubble")
  if (aiBubble) aiBubble.innerHTML = `<span class="stream"></span>`
  const span = aiBubble?.querySelector(".stream")
  
  controller = new AbortController()
  const formData = new FormData()
  const moodPrefix = buildMoodPrefix()
  formData.append("message", moodPrefix ? moodPrefix + text : text)
  formData.append("chatId", currentChatId || "")
  formData.append("token", getToken())
  formData.append("language", localStorage.getItem("datta_language") || "English")
  
  const res = await fetch("https://datta-ai-server.onrender.com/chat", {
    method: "POST",
    signal: controller.signal,
    body: formData
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
    if (span) span.innerHTML = marked.parse(streamText) + '<span class="cursor">▌</span>'
    scrollBottom()
  }
  if (span) span.innerHTML = marked.parse(streamText)
}

function searchChats() {
  const query = document.getElementById("search")?.value.toLowerCase()
  if (!query) return
  document.querySelectorAll(".chatItem").forEach(item => {
    const title = item.querySelector(".chatTitle")?.textContent.toLowerCase() || ""
    item.style.display = title.includes(query) ? "" : "none"
  })
}

// ============================================
// VOICE ASSISTANT
// ============================================
function startAssistant() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SpeechRecognition) {
    alert("Speech recognition not supported in this browser")
    return
  }
  
  const recognition = new SpeechRecognition()
  recognition.lang = "en-IN"
  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript
    const input = document.getElementById("message")
    if (input) input.value = text
    send()
  }
  recognition.start()
}
window.startAssistant = startAssistant

// ============================================
// PROJECTS & ARTIFACTS (from index.html)
// ============================================
function loadProjects() {
  let projects = JSON.parse(localStorage.getItem('datta_projects') || '[]');
  const projectsSection = document.getElementById('section-projects');
  if (!projectsSection) return;
  
  if (projects.length === 0) {
    projectsSection.innerHTML = `
      <div class="emptySection">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#443300" stroke-width="1.5">
          <rect x="2" y="7" width="20" height="14" rx="2"/>
          <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
        </svg>
        <p>No projects yet</p>
        <button onclick="createNewProject()" style="margin-top:12px;padding:8px 16px;background:rgba(255,215,0,0.1);border:1px solid rgba(255,215,0,0.2);border-radius:10px;color:var(--accent);cursor:pointer;">+ Create New Project</button>
      </div>
    `;
    return;
  }
  
  projectsSection.innerHTML = `
    <div style="padding:12px;">
      <button onclick="createNewProject()" style="width:100%;padding:10px;background:rgba(255,215,0,0.08);border:1px solid rgba(255,215,0,0.15);border-radius:10px;color:var(--accent);cursor:pointer;margin-bottom:12px;">+ New Project</button>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${projects.map(project => `
          <div style="padding:12px;background:rgba(255,215,0,0.03);border:1px solid rgba(255,215,0,0.08);border-radius:10px;display:flex;align-items:center;gap:10px;">
            <span>📁</span>
            <div style="flex:1;">
              <div style="font-size:13px;color:var(--accent);">${escapeHtml(project.name)}</div>
              <div style="font-size:10px;color:#665500;">${project.chats?.length || 0} chats</div>
            </div>
            <button onclick="event.stopPropagation();deleteProject('${project.id}')" style="background:none;border:none;color:#443300;cursor:pointer;">🗑️</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function createNewProject() {
  const projectName = prompt('Enter project name:', 'My Project');
  if (!projectName || !projectName.trim()) return;
  
  const projects = JSON.parse(localStorage.getItem('datta_projects') || '[]');
  projects.push({
    id: 'project_' + Date.now(),
    name: projectName.trim(),
    chats: [],
    created: Date.now(),
    updated: Date.now()
  });
  localStorage.setItem('datta_projects', JSON.stringify(projects));
  loadProjects();
  showToastMsg('📁 Project created: ' + projectName);
}

function deleteProject(projectId) {
  if (confirm('Delete this project permanently?')) {
    let projects = JSON.parse(localStorage.getItem('datta_projects') || '[]');
    projects = projects.filter(p => p.id !== projectId);
    localStorage.setItem('datta_projects', JSON.stringify(projects));
    loadProjects();
    showToastMsg('🗑️ Project deleted');
  }
}

function loadArtifacts() {
  let artifacts = JSON.parse(localStorage.getItem('datta_artifacts') || '[]');
  const artifactsSection = document.getElementById('section-artifacts');
  if (!artifactsSection) return;
  
  if (artifacts.length === 0) {
    artifactsSection.innerHTML = `
      <div class="emptySection">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#443300" stroke-width="1.5">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
        <p>No artifacts yet</p>
        <button onclick="createNewArtifact()" style="margin-top:12px;padding:8px 16px;background:rgba(255,215,0,0.1);border:1px solid rgba(255,215,0,0.2);border-radius:10px;color:var(--accent);cursor:pointer;">+ Create New Artifact</button>
      </div>
    `;
    return;
  }
  
  artifactsSection.innerHTML = `
    <div style="padding:12px;">
      <button onclick="createNewArtifact()" style="width:100%;padding:10px;background:rgba(255,215,0,0.08);border:1px solid rgba(255,215,0,0.15);border-radius:10px;color:var(--accent);cursor:pointer;margin-bottom:12px;">+ New Artifact</button>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${artifacts.map(artifact => `
          <div style="padding:12px;background:rgba(255,215,0,0.03);border:1px solid rgba(255,215,0,0.08);border-radius:10px;display:flex;align-items:center;gap:10px;">
            <span>${artifact.type === 'image' ? '🎨' : artifact.type === 'code' ? '💻' : '📄'}</span>
            <div style="flex:1;">
              <div style="font-size:13px;color:var(--accent);">${escapeHtml(artifact.name)}</div>
              <div style="font-size:10px;color:#665500;">${new Date(artifact.created).toLocaleDateString()}</div>
            </div>
            <button onclick="event.stopPropagation();deleteArtifact('${artifact.id}')" style="background:none;border:none;color:#443300;cursor:pointer;">🗑️</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function createNewArtifact() {
  const type = prompt('Select type (image/code/document):', 'image');
  if (!type) return;
  const name = prompt('Enter artifact name:', 'My Artifact');
  if (!name) return;
  
  const artifacts = JSON.parse(localStorage.getItem('datta_artifacts') || '[]');
  artifacts.push({
    id: 'artifact_' + Date.now(),
    name: name.trim(),
    type: type.toLowerCase(),
    content: '',
    created: Date.now()
  });
  localStorage.setItem('datta_artifacts', JSON.stringify(artifacts));
  loadArtifacts();
  showToastMsg('✨ Artifact created: ' + name);
}

function deleteArtifact(artifactId) {
  if (confirm('Delete this artifact permanently?')) {
    let artifacts = JSON.parse(localStorage.getItem('datta_artifacts') || '[]');
    artifacts = artifacts.filter(a => a.id !== artifactId);
    localStorage.setItem('datta_artifacts', JSON.stringify(artifacts));
    loadArtifacts();
    showToastMsg('🗑️ Artifact deleted');
  }
}

function showToastMsg(msg) {
  let t = document.getElementById("sidebarToast")
  if (!t) {
    t = document.createElement("div")
    t.id = "sidebarToast"
    t.style.cssText = "position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#0f0e00;border:1px solid rgba(0,255,136,0.3);border-radius:50px;padding:8px 18px;font-family:Rajdhani,sans-serif;font-size:12px;color:#00ff88;letter-spacing:1px;z-index:9999;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,0.5);"
    document.body.appendChild(t)
  }
  t.textContent = msg
  t.style.display = "block"
  setTimeout(() => t.style.display = "none", 2500)
}

// ============================================
// INITIALIZATION
// ============================================
window.loadSidebar = loadSidebar
window.loadProjects = loadProjects
window.loadArtifacts = loadArtifacts
window.createNewProject = createNewProject
window.createNewArtifact = createNewArtifact
window.deleteProject = deleteProject
window.deleteArtifact = deleteArtifact
window.confirmDeleteChat = confirmDeleteChat
window.regenerateFrom = regenerateFrom
window.searchChats = searchChats
window.openChat = openChat

// Load all data on page load
window.addEventListener('load', function() {
  console.log("Chat.js loaded - initializing")
  loadSidebar()
  loadProjects()
  loadArtifacts()
  
  const sendBtn = document.getElementById("sendBtn")
  if (sendBtn) {
    sendBtn.onclick = function(e) {
      e.preventDefault()
      send()
    }
  }
  
  console.log("Chat initialized - send button connected")
})

// Add CSS animation
const style = document.createElement('style')
style.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`
document.head.appendChild(style)

console.log("Chat.js loaded successfully")
