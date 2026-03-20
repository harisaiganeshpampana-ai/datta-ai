// ============================================
// AUTHENTICATION HELPERS - UPDATED
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

// Store globally
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
    if (nameEl) nameEl.textContent = user.username || user.email || "User"
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
// IMPROVED IMAGE GENERATION
// ============================================

async function generateImage(prompt, aiDiv) {
  // Clean the prompt
  let cleanPrompt = prompt
    .replace(/generate image of|create image of|make image of|generate photo of|create photo of|make photo of|generate picture of|create picture of|picture of|photo of|image of|draw me a|draw me|draw a|draw|illustrate a|illustrate|sketch a|sketch|paint a|paint|generate art of|create art of|make art of/gi, "")
    .trim()
  
  if (!cleanPrompt) cleanPrompt = prompt
  
  // Encode for URL
  const encodedPrompt = encodeURIComponent(cleanPrompt)
  const timestamp = Date.now()
  const seed = Math.floor(Math.random() * 999999)
  
  // Multiple fallback URLs
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
    console.log("Server image failed, trying direct:", e.message)
  }
  
  // Try direct Pollinations with multiple attempts
  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i]
    const success = await testImageUrl(url, cleanPrompt, aiDiv, i + 1, imageUrls.length)
    if (success) return
  }
  
  // If all fail, show error
  if (aiDiv) {
    aiDiv.innerHTML = `
      <div class="avatar">🎨</div>
      <div class="aiContent">
        <div class="aiBubble" style="color:#ff8888; background:#2a0a0a;">
          ⚠️ Image generation failed. Please try again with a different prompt.<br>
          <small>Prompt: "${cleanPrompt.substring(0, 50)}..."</small>
        </div>
      </div>
    `
    const chat = document.getElementById("chat")
    if (chat) chat.scrollTop = chat.scrollHeight
  }
  hideStopBtn()
  loadSidebar()
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
      if (aiDiv && attempt < total) {
        const bubble = aiDiv.querySelector(".aiBubble")
        if (bubble) {
          bubble.innerHTML = `<span style="color:#cc88ff;">🎨 Attempt ${attempt + 1}/${total}... Trying again</span>`
        }
      }
      resolve(false)
    }
    
    img.src = url + "&test=" + Date.now()
  })
}

function displayImageInChat(prompt, imageUrl, aiDiv) {
  const uid = "img_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6)
  
  if (aiDiv) {
    aiDiv.innerHTML = `
      <div class="avatar">🎨</div>
      <div class="aiContent">
        <div class="dattaImgWrap" id="${uid}" style="max-width:400px;">
          <div style="font-family:Rajdhani,sans-serif;font-size:11px;letter-spacing:1px;color:#cc88ff;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
            <span>🎨</span>
            <span>${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}</span>
          </div>
          <div style="position:relative;border-radius:12px;overflow:hidden;background:#1a0a2a;">
            <img src="${imageUrl}" alt="${prompt}"
              style="width:100%;border-radius:12px;display:block;cursor:pointer;"
              onclick="window.open('${imageUrl}', '_blank')"
              onerror="this.onerror=null; this.src='https://placehold.co/400x400/1a0a2a/cc88ff?text=Failed+to+load+image'; this.alt='Failed to load';"
            >
          </div>
          <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
            <button onclick="regenerateImage('${prompt.replace(/'/g, "\\'")}', this)" 
              style="padding:6px 14px;background:rgba(255,215,0,0.08);border:1px solid rgba(255,215,0,0.2);border-radius:20px;color:#cc9900;font-family:Rajdhani,sans-serif;font-size:12px;letter-spacing:1px;cursor:pointer;">
              🔄 Regenerate
            </button>
            <button onclick="downloadImage('${imageUrl}','${prompt.replace(/'/g, "\\'")}')" 
              style="padding:6px 14px;background:rgba(255,215,0,0.08);border:1px solid rgba(255,215,0,0.2);border-radius:20px;color:#cc9900;font-family:Rajdhani,sans-serif;font-size:12px;letter-spacing:1px;cursor:pointer;">
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
  loadSidebar()
}

// RENDER IMAGE RESPONSE - IMPROVED
function renderImageResponse(text) {
  let cleanText = text
  if (text.includes("DATTA_IMAGE_START")) {
    cleanText = text.replace("DATTA_IMAGE_START\n", "").replace("\nDATTA_IMAGE_END", "")
  }
  
  const imgMatch = cleanText.match(/!\[([^\]]*)\]\(([^)]+)\)/)
  const promptMatch = cleanText.match(/PROMPT:(.+)/) || cleanText.match(/\*Prompt: ([^*]+)\*/)
  
  if (!imgMatch) {
    return marked.parse(text)
  }

  const altText = imgMatch[1] || "Generated Image"
  let imgUrl = imgMatch[2]
  const prompt = (promptMatch ? promptMatch[1].trim() : altText).substring(0, 100)
  const uid = "ig" + Date.now()
  const safePrompt = prompt.replace(/'/g, "").replace(/"/g, "")

  // Add cache busting to URL
  if (!imgUrl.includes('timestamp=') && !imgUrl.includes('t=')) {
    imgUrl += (imgUrl.includes('?') ? '&' : '?') + 't=' + Date.now()
  }

  return `<div class="dattaImgWrap" id="${uid}" style="max-width:400px;">
  <div style="font-family:Rajdhani,sans-serif;font-size:11px;letter-spacing:1px;color:#cc88ff;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
    <span>🎨</span><span id="${uid}lbl">${safePrompt}</span>
  </div>
  <div style="position:relative;border-radius:12px;overflow:hidden;background:#1a0a2a;min-height:200px;">
    <img id="${uid}img" src="${imgUrl}" alt="${altText}"
      style="width:100%;border-radius:12px;display:block;cursor:pointer;"
      onclick="window.open('${imgUrl}', '_blank')"
      onerror="
        var img=this;
        var retries=parseInt(this.dataset.retries||0);
        if(retries<3){
          this.dataset.retries=retries+1;
          setTimeout(()=>{
            img.src='${imgUrl}&retry='+retries;
          },1000);
        } else {
          this.src='https://placehold.co/400x400/1a0a2a/cc88ff?text=Failed+to+load+image';
          this.alt='Failed to load image';
        }
      "
    >
  </div>
  <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
    <button onclick="regenerateImage('${safePrompt}',this)" 
      style="padding:6px 14px;background:rgba(255,215,0,0.08);border:1px solid rgba(255,215,0,0.2);border-radius:20px;color:#cc9900;font-family:Rajdhani,sans-serif;font-size:12px;letter-spacing:1px;cursor:pointer;">
      🔄 Regenerate
    </button>
    <button onclick="downloadImage('${imgUrl}','${safePrompt}')" 
      style="padding:6px 14px;background:rgba(255,215,0,0.08);border:1px solid rgba(255,215,0,0.2);border-radius:20px;color:#cc9900;font-family:Rajdhani,sans-serif;font-size:12px;letter-spacing:1px;cursor:pointer;">
      ⬇️ Download
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
  const wrap = btn.closest(".dattaImgWrap")
  if (!wrap) return
  
  btn.disabled = true
  btn.innerHTML = '<span style="animation:spin 0.6s linear infinite;">⏳</span> Generating...'
  
  const encodedPrompt = encodeURIComponent(prompt)
  const seed = Math.floor(Math.random() * 999999)
  const timestamp = Date.now()
  
  const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&seed=${seed}&timestamp=${timestamp}`
  
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
      img.src = `https://placehold.co/400x400/1a0a2a/cc88ff?text=Failed+to+load`
    }
    img.src = imageUrl
  }
  
  const downloadBtn = wrap.querySelector("button[onclick*='downloadImage']")
  if (downloadBtn) {
    downloadBtn.setAttribute("onclick", `downloadImage('${imageUrl}','${prompt.replace(/'/g, "\\'")}')`)
  }
}

window.generateImage = generateImage
window.regenerateImage = regenerateImage
window.downloadImage = downloadImage
window.renderImageResponse = renderImageResponse

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

// ─── NEW CHAT ─────────────────────────────────────────────────────────────────
function newChat() {
  currentChatId = null
  chatBox.innerHTML = ""
  chatBox.scrollTop = 0
  showWelcome()
}

// ─── MOOD SYSTEM ──────────────────────────────────────────────────────────────
function getMoodContext() {
  return window.dattaMoodPersonality || null
}

// ── AUTO MOOD DETECT INDICATOR ────────────────────────────────────────────────
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
  pill.innerHTML = `<span style="font-size:9px;letter-spacing:1px;opacity:0.6;margin-right:3px;font-family:'Rajdhani',sans-serif;">AUTO</span>${mood.emoji}`
  pill.style.display = "flex"
  pill.style.alignItems = "center"
  pill.title = `Auto-detected: ${mood.label}`

  localStorage.setItem("datta_last_auto_mood", moodKey)

  clearTimeout(pill._hideTimer)
  pill._hideTimer = setTimeout(() => {
    pill.style.transition = "opacity 0.4s"
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
  pill.innerHTML = `<span style="font-size:9px;letter-spacing:1px;opacity:0.6;margin-right:3px;font-family:'Rajdhani',sans-serif;">AUTO</span>${mood.emoji}`
  pill.style.display = "flex"
  pill.style.alignItems = "center"
  pill.title = `Auto-detected: ${mood.label}`
}

window.addEventListener("DOMContentLoaded", function() {
  setTimeout(restoreAutoMoodPill, 1500)
})

window.addEventListener("load", function() {
  setTimeout(restoreAutoMoodPill, 500)
})

// ── buildMoodPrefix ──────────────────────────────────────────────────────────
function buildMoodPrefix() {
  const mood = getMoodContext()

  const lengthRule = `[RESPONSE LENGTH RULE — ALWAYS FOLLOW THIS]:
- Keep answers SHORT and CONCISE by default.
- If the user asks a simple or casual question, reply in 1 to 3 sentences only.
- Only give a long, detailed answer if the user explicitly says: "explain", "elaborate", "in detail", "tell me more", "say more", "describe", or asks something clearly complex.
- Use a maximum of 2 emojis per response. Do NOT spam emojis.
- Never pad answers with filler phrases or unnecessary enthusiasm.
- Match your response length strictly to what was asked.\n\n`

  if (!mood) return "[STRICT INSTRUCTION]: " + lengthRule
  return "[STRICT INSTRUCTION]: " + lengthRule + "[MOOD INSTRUCTION - FOLLOW THIS STRICTLY]: " + mood + "\n\n"
}

// ─── SEND MESSAGE ─────────────────────────────────────────────────────────────
async function send() {
  const input = document.getElementById("message")

  let file = null
  const fileInputIds = ["cameraInput", "photoInput", "imageInput"]
  for (const id of fileInputIds) {
    const el = document.getElementById(id)
    if (el && el.files && el.files[0]) { file = el.files[0]; break }
  }
  const text = input.value.trim()
  if (!text && !file) return

  if (window.dattaAutoDetectMood && text) {
    const detected = window.dattaAutoDetectMood(text)
    if (detected) showAutoMoodPill(detected)
  }

  if (!currentChatId) {
    let title = text ? text.substring(0, 40) : "New Chat"
    if (text && text.length > 40) title += "..."
    saveChatTitle(title)
  }

  hideWelcome()
  document.body.classList.add("chat-started")

  const moodEmoji = window.dattaMoodEmoji ? window.dattaMoodEmoji + " " : ""

  chatBox.innerHTML += `
    <div class="messageRow userRow">
      <div class="userBubble">
        ${file ? `<div style="font-size:12px;opacity:0.75;margin-bottom:4px;">📄 ${file.name}</div>` : ""}
        ${text ? `<div>${text}</div>` : ""}
      </div>
      <div class="avatar">${moodEmoji || "🧑"}</div>
    </div>
  `

  chatBox.scrollTop = chatBox.scrollHeight
  input.value = ""
  ;["cameraInput","photoInput","imageInput"].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.value = ""
  })
  if (typeof clearFileSelection === "function") clearFileSelection()

  const searchTriggers = ["latest","recent","today","yesterday","this week","current","now","live","breaking","news","who is","what is the","price of","weather","score","2025","2026","happened","update","trending","stock","crypto","bitcoin","search for","find","look up","ipl","cricket","match","movie","released","launched","election","gold","petrol"]
  const willSearch = searchTriggers.some(t => text.toLowerCase().includes(t))
  const willGenImage = imageTriggers.some(t => text.toLowerCase().includes(t))
  const aiAvatarEmoji = window.dattaMoodEmoji || "🤖"

  let aiDiv = document.createElement("div")
  aiDiv.className = "messageRow"

  if (willGenImage) {
    aiDiv.innerHTML = `
      <div class="avatar">🎨</div>
      <div class="aiBubble" style="background:#1a0a2a; color:#cc88ff; text-align:center;">
        <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
          <div style="width:40px;height:40px;border:3px solid rgba(200,100,255,0.2);border-top-color:#cc88ff;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
          <span>🎨 Generating "${text.substring(0, 50)}..."</span>
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
  chatBox.appendChild(aiDiv)
  chatBox.scrollTop = chatBox.scrollHeight
  showStopBtn()

  // CLIENT-SIDE IMAGE GENERATION - IMPROVED
  if (willGenImage) {
    let prompt = text
      .replace(/generate image of|create image of|make image of|generate photo of|create photo of|make photo of|generate picture of|create picture of|picture of|photo of|image of|draw me a|draw me|draw a|draw|illustrate a|illustrate|sketch a|sketch|paint a|paint|generate art of|create art of|make art of/gi, "")
      .trim()
    if (!prompt) prompt = text
    
    await generateImage(prompt, aiDiv)
    return
  }

  // SERVER CALL
  controller = new AbortController()
  const formData = new FormData()
  const moodPrefix = buildMoodPrefix()
  const messageWithMood = moodPrefix ? moodPrefix + text : text
  formData.append("message", messageWithMood)
  formData.append("chatId", currentChatId || "")
  formData.append("token", getToken())
  formData.append("language", localStorage.getItem("datta_language") || "English")
  if (window.dattaMoodLabel) formData.append("mood", window.dattaMoodLabel)
  if (file) formData.append("image", file)

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
      if (typeof lucide !== 'undefined') lucide.createIcons()
    }

    const isImgResponse = streamText.includes("pollinations.ai") || streamText.includes("DATTA_IMAGE")
    if (isImgResponse) {
      const container = aiDiv.querySelector(".aiContent") || aiDiv
      container.innerHTML = renderImageResponse(streamText)
    } else {
      span.innerHTML = marked.parse(streamText)
    }
    if (typeof lucide !== 'undefined') lucide.createIcons()
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
    hideStopBtn()
  }
}

// ─── LANGUAGE HELPERS ────────────────────────────────────────────────────────
function getLangCode(langName) {
  const map = {
    "English": "en-IN",
    "Hindi": "hi-IN",
    "Telugu": "te-IN",
    "Tamil": "ta-IN",
    "Kannada": "kn-IN",
    "Malayalam": "ml-IN",
    "Bengali": "bn-IN",
    "Marathi": "mr-IN",
    "Gujarati": "gu-IN",
    "Punjabi": "pa-IN",
    "Urdu": "ur-PK",
    "Spanish": "es-ES",
    "French": "fr-FR",
    "German": "de-DE",
    "Arabic": "ar-SA",
    "Chinese": "zh-CN",
    "Japanese": "ja-JP",
    "Korean": "ko-KR",
    "Portuguese": "pt-BR",
    "Russian": "ru-RU",
    "Italian": "it-IT",
    "Dutch": "nl-NL",
    "Turkish": "tr-TR",
    "Vietnamese": "vi-VN",
    "Thai": "th-TH",
    "Indonesian": "id-ID",
    "Malay": "ms-MY",
  }
  return map[langName] || "en-IN"
}

function detectTextLanguage(text) {
  if (!text) return getLangCode(localStorage.getItem("datta_language") || "English")
  if (/[ऀ-ॿ]/.test(text)) return "hi-IN"
  if (/[ఀ-౿]/.test(text)) return "te-IN"
  if (/[஀-௿]/.test(text)) return "ta-IN"
  if (/[ಀ-೿]/.test(text)) return "kn-IN"
  if (/[ഀ-ൿ]/.test(text)) return "ml-IN"
  if (/[ঀ-৿]/.test(text)) return "bn-IN"
  if (/[؀-ۿ]/.test(text)) return "ar-SA"
  if (/[一-鿿]/.test(text)) return "zh-CN"
  if (/[぀-ヿ]/.test(text)) return "ja-JP"
  if (/[가-힯]/.test(text)) return "ko-KR"
  if (/[Ѐ-ӿ]/.test(text)) return "ru-RU"
  return getLangCode(localStorage.getItem("datta_language") || "English")
}

// ─── LOAD SIDEBAR ─────────────────────────────────────────────────────────────
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

    document.addEventListener("click", () => {
      document.querySelectorAll(".chatContextMenu").forEach(m => m.remove())
    }, { once: false })

    chats.forEach(chat => {
      let div = document.createElement("div")
      div.className = "chatItem"
      div.style.cssText = "display:flex;align-items:center;padding:8px 10px;border-radius:10px;cursor:pointer;transition:background 0.15s;position:relative;"
      let cleanTitle = chat.title || "New Chat"
      if (cleanTitle.startsWith("[STRICT") || cleanTitle.startsWith("[MOOD") || cleanTitle.startsWith("[RESPONSE")) {
        cleanTitle = "Chat " + new Date().toLocaleDateString()
      }
      cleanTitle = cleanTitle.replace(/^\[.*?\]:\s*/g, "").trim() || "New Chat"

      div.innerHTML = `
        <div class="chatTitle" style="flex:1;font-size:13px;color:#665500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${cleanTitle}">${cleanTitle}</div>
        <button class="chatMenuBtn" data-id="${chat._id}" data-title="${cleanTitle.substring(0,50)}" onclick="showChatMenu(event,this.dataset.id,this.dataset.title)" 
          style="background:none;border:none;color:#665500;cursor:pointer;padding:4px 6px;font-size:16px;opacity:0;transition:opacity 0.2s;flex-shrink:0;border-radius:6px;">⋯</button>
      `
      div.onmouseenter = () => div.querySelector(".chatMenuBtn").style.opacity = "1"
      div.onmouseleave = () => div.querySelector(".chatMenuBtn").style.opacity = "0"
      div.onclick = (e) => {
        if (e.target.closest(".chatMenuBtn")) return
        openChat(chat._id)
        if (window.innerWidth < 900 && typeof closeSidebar === 'function') closeSidebar()
      }
      history.appendChild(div)
    })
  } catch(e) {
    console.error("Sidebar error:", e.message)
  }
}

function showChatMenu(e, chatId, chatTitle) {
  e.stopPropagation()
  document.querySelectorAll(".chatContextMenu").forEach(m => m.remove())

  const menu = document.createElement("div")
  menu.className = "chatContextMenu"
  menu.style.cssText = `
    position:fixed;background:#0f0e00;border:1px solid rgba(255,215,0,0.15);
    border-radius:14px;padding:6px;z-index:9999;min-width:180px;
    box-shadow:0 8px 30px rgba(0,0,0,0.6);animation:menuIn 0.15s ease;
  `

  const menuItems = [
    { icon:"✏️", label:"Rename", action: () => renameChat(chatId, chatTitle) },
    { icon:"📌", label:"Pin chat", action: () => pinChat(chatId) },
    { icon:"📦", label:"Archive", action: () => archiveChat(chatId) },
    { icon:"🗑️", label:"Delete", action: () => confirmDeleteChat(chatId), danger: true },
  ]

  menuItems.forEach(item => {
    const btn = document.createElement("button")
    btn.style.cssText = `
      width:100%;display:flex;align-items:center;gap:10px;
      padding:10px 12px;border-radius:10px;border:none;background:none;
      color:${item.danger ? "#ff4444" : "#665500"};cursor:pointer;
      font-family:'DM Sans',sans-serif;font-size:13px;text-align:left;
      transition:background 0.15s;
    `
    btn.innerHTML = `<span>${item.icon}</span>${item.label}`
    btn.onmouseover = () => btn.style.background = item.danger ? "rgba(255,60,60,0.08)" : "rgba(255,215,0,0.06)"
    btn.onmouseout = () => btn.style.background = "none"
    btn.onclick = (ev) => { ev.stopPropagation(); menu.remove(); item.action() }
    menu.appendChild(btn)
  })

  const rect = e.target.getBoundingClientRect()
  menu.style.left = Math.min(rect.left, window.innerWidth - 200) + "px"
  menu.style.top = rect.bottom + 4 + "px"

  document.body.appendChild(menu)
  setTimeout(() => document.addEventListener("click", () => menu.remove(), { once: true }), 50)
}

async function renameChat(chatId, currentTitle) {
  const newTitle = prompt("Rename chat:", currentTitle)
  if (!newTitle || newTitle === currentTitle) return
  try {
    await fetch("https://datta-ai-server.onrender.com/chat/" + chatId + "/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: getToken(), title: newTitle })
    })
    loadSidebar()
  } catch(e) {
    loadSidebar()
  }
}

function pinChat(chatId) {
  const pins = JSON.parse(localStorage.getItem("datta_pinned") || "[]")
  if (!pins.includes(chatId)) pins.unshift(chatId)
  localStorage.setItem("datta_pinned", JSON.stringify(pins))
  showToastMsg("📌 Chat pinned!")
  loadSidebar()
}

function archiveChat(chatId) {
  const archived = JSON.parse(localStorage.getItem("datta_archived") || "[]")
  if (!archived.includes(chatId)) archived.push(chatId)
  localStorage.setItem("datta_archived", JSON.stringify(archived))
  showToastMsg("📦 Chat archived!")
  loadSidebar()
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

// ─── OPEN CHAT ────────────────────────────────────────────────────────────────
async function openChat(chatId) {
  currentChatId = chatId
  chatBox.innerHTML = ""
  hideWelcome()
  const res = await fetch("https://datta-ai-server.onrender.com/chat/" + chatId + "?token=" + getToken())
  const messages = await res.json()
  messages.forEach(m => {
    if (m.role === "user") {
      let displayMsg = m.content || ""
      if (displayMsg.includes("[STRICT INSTRUCTION]") || displayMsg.includes("[MOOD INSTRUCTION") || displayMsg.includes("[RESPONSE LENGTH")) {
        const lines = displayMsg.split("\n")
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim()
          if (line && !line.startsWith("[STRICT") && !line.startsWith("[MOOD") && !line.startsWith("[RESPONSE") && !line.startsWith("[EVOLVED") && !line.startsWith("[SMART")) {
            displayMsg = line
            break
          }
        }
        if (displayMsg.includes("[STRICT") || displayMsg.includes("[MOOD")) {
          const parts = m.content.split("\n\n")
          const lastPart = parts[parts.length - 1].trim()
          if (lastPart && !lastPart.startsWith("[")) {
            displayMsg = lastPart
          }
        }
      }
      chatBox.innerHTML += `
        <div class="messageRow userRow">
          <div class="userBubble" style="font-family:'Cormorant Garamond',serif;font-size:15px;font-weight:500;letter-spacing:0.3px;">${displayMsg}</div>
          <div class="avatar">🧑</div>
        </div>
      `
    } else {
      chatBox.innerHTML += `
        <div class="messageRow">
          <div class="avatar">🤖</div>
          <div class="aiContent">
            <div class="aiBubble" style="font-family:'Nunito',sans-serif;font-size:14px;letter-spacing:0.2px;">${marked.parse(m.content)}</div>
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
  if (typeof lucide !== 'undefined') lucide.createIcons()
}

// ─── DELETE CHAT ──────────────────────────────────────────────────────────────
async function deleteChat(e, id) {
  if (e) e.stopPropagation()
  await fetch("https://datta-ai-server.onrender.com/chat/" + id + "?token=" + getToken(), { method: "DELETE" })
  loadSidebar()
}

function confirmDeleteChat(id) {
  const existing = document.getElementById("deleteConfirmPopup")
  if (existing) existing.remove()

  const popup = document.createElement("div")
  popup.id = "deleteConfirmPopup"
  popup.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);"
  popup.innerHTML = `
    <div style="background:#0f0e00;border:1px solid rgba(255,60,60,0.2);border-radius:18px;padding:24px;max-width:300px;width:90%;text-align:center;">
      <div style="font-size:32px;margin-bottom:10px">🗑️</div>
      <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:2px;color:#fff8e7;margin-bottom:8px">Delete Chat?</div>
      <div style="font-size:13px;color:#665500;margin-bottom:20px;">This chat will be permanently deleted.</div>
      <div style="display:flex;gap:8px;">
        <button onclick="document.getElementById('deleteConfirmPopup').remove()" 
          style="flex:1;padding:11px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,215,0,0.1);border-radius:50px;color:#665500;font-family:'Rajdhani',sans-serif;font-size:13px;letter-spacing:1px;cursor:pointer;">
          Cancel
        </button>
        <button onclick="deleteChat(null,'${id}');document.getElementById('deleteConfirmPopup').remove()" 
          style="flex:1;padding:11px;background:rgba(255,60,60,0.1);border:1px solid rgba(255,60,60,0.3);border-radius:50px;color:#ff4444;font-family:'Rajdhani',sans-serif;font-size:13px;letter-spacing:1px;cursor:pointer;">
          Delete
        </button>
      </div>
    </div>
  `
  document.body.appendChild(popup)
  popup.onclick = (e) => { if (e.target === popup) popup.remove() }
}
window.confirmDeleteChat = confirmDeleteChat

// ─── COPY TEXT ────────────────────────────────────────────────────────────────
function copyText(btn) {
  const text = btn.closest(".aiContent").querySelector(".aiBubble").innerText
  navigator.clipboard.writeText(text)
}

// ─── SPEAK TEXT ───────────────────────────────────────────────────────────────
function speakText(btn) {
  const text = btn.closest(".aiContent").querySelector(".aiBubble").innerText
  const speech = new SpeechSynthesisUtterance(text)
  const detectedLang = detectTextLanguage(text)
  speech.lang = detectedLang
  const voices = speechSynthesis.getVoices()
  const match = voices.find(v => v.lang.startsWith(detectedLang.split("-")[0]))
  if (match) speech.voice = match
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
  const formData = new FormData()
  const moodPrefix = buildMoodPrefix()
  formData.append("message", moodPrefix ? moodPrefix + text : text)
  formData.append("chatId", currentChatId || "")
  formData.append("token", getToken())
  formData.append("language", localStorage.getItem("datta_language") || "English")
  if (window.dattaMoodLabel) formData.append("mood", window.dattaMoodLabel)
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
    span.innerHTML = marked.parse(streamText) + '<span class="cursor">▌</span>'
    scrollBottom()
  }
  span.innerHTML = marked.parse(streamText)
  if (typeof lucide !== 'undefined') lucide.createIcons()
}

// ─── MIC BUTTON ───────────────────────────────────────────────────────────────
let inlineListening = false
let inlineRecognition = null

function startAssistant() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SpeechRecognition) {
    openVoiceAssistant()
    return
  }

  if (inlineListening) {
    stopInlineListening()
    return
  }

  const input = document.getElementById("message")
  const micBtn = document.getElementById("micBtn")

  inlineListening = true

  if (micBtn) {
    micBtn.style.color = "#ff4444"
    micBtn.style.background = "rgba(255,60,60,0.1)"
    micBtn.style.borderColor = "rgba(255,60,60,0.3)"
    micBtn.title = "Listening... (click to stop)"
  }

  if (input) {
    input.placeholder = "🎤 Listening..."
    input.style.borderColor = "rgba(255,60,60,0.3)"
  }

  inlineRecognition = new SpeechRecognition()
  inlineRecognition.lang = getLangCode(localStorage.getItem("datta_language") || "English")
  inlineRecognition.continuous = false
  inlineRecognition.interimResults = true
  inlineRecognition.maxAlternatives = 1

  inlineRecognition.onresult = function(e) {
    let interim = ""
    let final = ""
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript
      else interim += e.results[i][0].transcript
    }
    if (input) input.value = final || interim
  }

  inlineRecognition.onend = function() {
    stopInlineListening()
    const text = document.getElementById("message")?.value.trim()
    if (text) {
      setTimeout(() => send(), 300)
    }
  }

  inlineRecognition.onerror = function(e) {
    stopInlineListening()
    if (input) input.placeholder = "Message Datta AI..."
  }

  inlineRecognition.start()
}

function stopInlineListening() {
  inlineListening = false
  const micBtn = document.getElementById("micBtn")
  const input = document.getElementById("message")

  if (inlineRecognition) {
    try { inlineRecognition.stop() } catch(e) {}
    inlineRecognition = null
  }

  if (micBtn) {
    micBtn.style.color = ""
    micBtn.style.background = ""
    micBtn.style.borderColor = ""
    micBtn.title = "Voice"
  }

  if (input) {
    input.placeholder = "Message Datta AI..."
    input.style.borderColor = ""
  }
}

window.stopInlineListening = stopInlineListening

// ─── SCROLL ───────────────────────────────────────────────────────────────────
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

// ─── WELCOME HELPERS ──────────────────────────────────────────────────────────
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

// ─── FILL PROMPT ──────────────────────────────────────────────────────────────
function fillPrompt(text) {
  const input = document.getElementById("message")
  if (input) input.value = text
  hideWelcome()
  send()
}
window.fillPrompt = fillPrompt

// ─── SAVE CHAT TITLE ─────────────────────────────────────────────────────────
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
  const query = document.getElementById("search")?.value.toLowerCase()
  if (!query) return
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
  document.querySelectorAll(".sidebarSection").forEach(s => s.style.display = "none")
  const el = document.getElementById("section-" + name)
  if (el) el.style.display = "flex"
  document.querySelectorAll(".navItem").forEach(b => b.classList.remove("active"))
  const btns = document.querySelectorAll(".navItem")
  const idx = ["chats","projects","artifacts"].indexOf(name)
  if (btns[idx]) btns[idx].classList.add("active")
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
  localStorage.removeItem("datta_plan")
  window.location.href = "login.html"
}
window.logout = logout

// ── SETTINGS FUNCTIONS ───────────────────────────────────────────────────────
function openSettings() {
  if (event) event.stopPropagation()
  const modal = document.getElementById("settingsModal")
  if (!modal) return
  modal.classList.add("show")
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
  const activeTab = document.querySelector(`.sTab[onclick="switchSettingsTab('${tab}')"]`)
  if (activeTab) activeTab.classList.add("active")
  const content = document.getElementById("tab-" + tab)
  if (content) content.classList.add("active")
  clearSettingsMsg()
}

function showSettingsMsg(text, type) {
  const el = document.getElementById("settingsMsg")
  if (!el) return
  el.textContent = text
  el.className = "settingsMsg " + type
  setTimeout(() => { el.className = "settingsMsg"; el.textContent = "" }, 3000)
}

function clearSettingsMsg() {
  const el = document.getElementById("settingsMsg")
  if (el) { el.className = "settingsMsg"; el.textContent = "" }
}

function loadSettingsUI() {
  let user = getUser()
  const usernameInput = document.getElementById("newUsername")
  if (usernameInput) usernameInput.placeholder = user?.username || "Enter new username"
  const theme = localStorage.getItem("datta_theme") || "dark"
  setTheme(theme, true)
  const lang = localStorage.getItem("datta_language") || "English"
  const langSelect = document.getElementById("aiLanguage")
  if (langSelect) langSelect.value = lang
  const notifSettings = JSON.parse(localStorage.getItem("datta_notif") || "{}")
  const soundToggle = document.getElementById("soundToggle")
  const notifToggle = document.getElementById("notifToggle")
  const streamToggle = document.getElementById("streamToggle")
  if (soundToggle) soundToggle.checked = notifSettings.sound || false
  if (notifToggle) notifToggle.checked = notifSettings.notif || false
  if (streamToggle) streamToggle.checked = notifSettings.stream !== false
}

async function changeUsername() {
  const newUsername = document.getElementById("newUsername").value.trim()
  if (!newUsername) return showSettingsMsg("Please enter a username", "error")
  if (newUsername.length < 3) return showSettingsMsg("Username must be at least 3 characters", "error")
  try {
    const res = await fetch("https://datta-ai-server.onrender.com/auth/update-username", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: newUsername, token: getToken() })
    })
    const data = await res.json()
    if (!res.ok) return showSettingsMsg(data.error || "Failed to update", "error")
    const user = getUser()
    user.username = newUsername
    localStorage.setItem("datta_user", JSON.stringify(user))
    const nameEl = document.querySelector(".profileName")
    const avatarEl = document.querySelector(".profileAvatar")
    if (nameEl) nameEl.textContent = newUsername
    if (avatarEl) avatarEl.textContent = newUsername[0].toUpperCase()
    showSettingsMsg("Username updated successfully!", "success")
  } catch (e) {
    showSettingsMsg("Server error. Try again.", "error")
  }
}

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
      body: JSON.stringify({ currentPassword: current, newPassword: newPass, token: getToken() })
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

function setTheme(theme, silent) {
  localStorage.setItem("datta_theme", theme)
  if (theme === "light") {
    document.body.classList.add("light")
    const darkBtn = document.getElementById("themeDark")
    const lightBtn = document.getElementById("themeLight")
    if (darkBtn) darkBtn.classList.remove("active")
    if (lightBtn) lightBtn.classList.add("active")
  } else {
    document.body.classList.remove("light")
    const darkBtn = document.getElementById("themeDark")
    const lightBtn = document.getElementById("themeLight")
    if (darkBtn) darkBtn.classList.add("active")
    if (lightBtn) lightBtn.classList.remove("active")
  }
  if (!silent) showSettingsMsg("Theme changed to " + theme + " mode!", "success")
}

function setFontSize(size) {
  const btns = document.querySelectorAll(".fontBtn")
  btns.forEach(b => b.classList.remove("active"))
  if (event && event.target) event.target.classList.add("active")
  const sizes = { small: "13px", medium: "15px", large: "17px" }
  document.documentElement.style.setProperty("--chat-font-size", sizes[size])
  document.querySelectorAll(".aiBubble, .userBubble").forEach(el => el.style.fontSize = sizes[size])
  localStorage.setItem("datta_fontsize", size)
  showSettingsMsg("Font size set to " + size, "success")
}

function saveLanguage() {
  const lang = document.getElementById("aiLanguage").value
  localStorage.setItem("datta_language", lang)
  showSettingsMsg("AI will now respond in " + lang + "!", "success")
}

function saveNotifSettings() {
  const settings = {
    sound: document.getElementById("soundToggle")?.checked || false,
    notif: document.getElementById("notifToggle")?.checked || false,
    stream: document.getElementById("streamToggle")?.checked !== false
  }
  localStorage.setItem("datta_notif", JSON.stringify(settings))
}

async function deleteAllChats() {
  if (!confirm("Are you sure? This will delete ALL your chats permanently!")) return
  try {
    const res = await fetch("https://datta-ai-server.onrender.com/chats/all?token=" + getToken(), { method: "DELETE" })
    if (!res.ok) return showSettingsMsg("Failed to delete chats", "error")
    if (chatBox) chatBox.innerHTML = ""
    currentChatId = null
    showWelcome()
    loadSidebar()
    showSettingsMsg("All chats deleted!", "success")
  } catch (e) {
    showSettingsMsg("Server error. Try again.", "error")
  }
}

async function deleteAccount() {
  const password = document.getElementById("deleteAccountPassword").value
  if (!password) return showSettingsMsg("Enter your password to confirm", "error")
  if (!confirm("This will PERMANENTLY delete your account. Are you absolutely sure?")) return
  try {
    const res = await fetch("https://datta-ai-server.onrender.com/auth/delete-account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, token: getToken() })
    })
    const data = await res.json()
    if (!res.ok) return showSettingsMsg(data.error || "Failed to delete account", "error")
    localStorage.clear()
    window.location.href = "login.html"
  } catch (e) {
    showSettingsMsg("Server error. Try again.", "error")
  }
}

// LIKE / DISLIKE
function likeMsg(btn) {
  const wasActive = btn.classList.contains("active")
  const row = btn.closest(".aiActions")
  if (row) {
    row.querySelectorAll(".likeBtn, .dislikeBtn").forEach(b => {
      b.classList.remove("active")
      b.style.color = ""
    })
  }
  if (!wasActive) {
    btn.classList.add("active")
    btn.style.color = "var(--accent)"
  }
}

function dislikeMsg(btn) {
  const wasActive = btn.classList.contains("active")
  const row = btn.closest(".aiActions")
  if (row) {
    row.querySelectorAll(".likeBtn, .dislikeBtn").forEach(b => {
      b.classList.remove("active")
      b.style.color = ""
    })
  }
  if (!wasActive) {
    btn.classList.add("active")
    btn.style.color = "#ff4444"
  }
}

window.likeMsg = likeMsg
window.dislikeMsg = dislikeMsg
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

// ── VOICE ASSISTANT ──────────────────────────────────────────────────────────
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
  const moodGreets = {
    focused: "Ready to help you get things done!",
    happy: "Hey! Happy to chat with you!",
    stressed: "Hey, take a deep breath. I am here for you.",
    creative: "Let us create something amazing together!",
    lazy: "sup. what do you need.",
    curious: "What shall we explore today?"
  }
  const savedMood = localStorage.getItem("datta_mood")
  const greeting = (savedMood && moodGreets[savedMood]) || "Hello! I am Datta AI. How can I help you today?"
  setTimeout(() => { speakText2(greeting) }, 500)
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
  if (micBtn) micBtn.classList.toggle("active", mode === "listening")
}

function setVoiceText(text) {
  const el = document.getElementById("voiceText")
  if (el) el.textContent = text
}

function toggleVoiceListening() {
  if (isListening) { stopListening() } else { startListening() }
}

function startListening() {
  if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
    setVoiceText("Speech recognition not supported in this browser.")
    return
  }
  stopSpeaking()
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  voiceRecognition = new SpeechRecognition()
  voiceRecognition.lang = getLangCode(localStorage.getItem("datta_language") || "English")
  voiceRecognition.continuous = false
  voiceRecognition.interimResults = true
  voiceRecognition.onstart = () => { isListening = true; setVoiceStatus("Listening...", "listening"); setVoiceText("") }
  voiceRecognition.onresult = (e) => {
    let interim = "", final = ""
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) { final += e.results[i][0].transcript }
      else { interim += e.results[i][0].transcript }
    }
    setVoiceText(final || interim)
    if (final) { stopListening(); processVoiceQuery(final) }
  }
  voiceRecognition.onerror = (e) => { isListening = false; setVoiceStatus("Error: " + e.error + ". Try again.", "idle") }
  voiceRecognition.onend = () => { isListening = false; if (voiceActive) setVoiceStatus("Tap to speak", "idle") }
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
  const closeCmds = ["close", "stop", "exit", "bye", "goodbye", "dismiss"]
  if (closeCmds.some(c => query.toLowerCase().includes(c))) {
    speakText2("Goodbye! Have a great day!")
    setTimeout(closeVoiceAssistant, 2000)
    return
  }
  try {
    const formData = new FormData()
    const moodPrefix = buildMoodPrefix()
    formData.append("message", moodPrefix ? moodPrefix + query : query)
    formData.append("chatId", currentChatId || "")
    formData.append("token", getToken())
    formData.append("language", localStorage.getItem("datta_language") || "English")
    formData.append("voice", "true")
    if (window.dattaMoodLabel) formData.append("mood", window.dattaMoodLabel)
    const res = await fetch("https://datta-ai-server.onrender.com/chat", { method: "POST", body: formData })
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
    const cleanText = fullText
      .replace(/!\[.*?\]\(.*?\)/g, "I generated an image for you.")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/#{1,6}\s/g, "")
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/`/g, "")
      .trim()
    setVoiceText(cleanText.substring(0, 100) + (cleanText.length > 100 ? "..." : ""))
    const aiEmoji = window.dattaMoodEmoji || "🤖"
    if (chatBox) {
      chatBox.innerHTML += `
        <div class="messageRow userRow">
          <div class="userBubble">🎤 ${query}</div>
          <div class="avatar">🧑</div>
        </div>
      `
      chatBox.innerHTML += `
        <div class="messageRow">
          <div class="avatar">${aiEmoji}</div>
          <div class="aiContent">
            <div class="aiBubble">${marked.parse(fullText.split("CHATID")[0])}</div>
          </div>
        </div>
      `
      chatBox.scrollTop = chatBox.scrollHeight
    }
    loadSidebar()
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
  const detectedLang2 = detectTextLanguage(text)
  utterance.lang = detectedLang2
  utterance.rate = 0.95
  utterance.pitch = 1.0
  utterance.volume = 1.0
  const voices = voiceSynth.getVoices()
  const langCode = detectedLang2.split("-")[0]
  const preferred = voices.find(v => v.lang === detectedLang2 && !v.name.includes("Male"))
    || voices.find(v => v.lang.startsWith(langCode) && !v.name.includes("Male"))
    || voices.find(v => v.lang.startsWith(langCode))
    || voices.find(v => v.name.includes("Google") || v.name.includes("Samantha"))
  if (preferred) utterance.voice = preferred
  utterance.onend = () => {
    isSpeaking = false
    if (voiceActive) {
      setVoiceStatus("Tap to speak", "idle")
      setTimeout(() => { if (voiceActive) startListening() }, 800)
    }
  }
  utterance.onerror = () => { isSpeaking = false; setVoiceStatus("Tap to speak", "idle") }
  voiceSynth.speak(utterance)
}

function stopSpeaking() {
  if (voiceSynth) voiceSynth.cancel()
  isSpeaking = false
}

window.startAssistant = startAssistant
window.openVoiceAssistant = openVoiceAssistant
window.closeVoiceAssistant = closeVoiceAssistant
window.toggleVoiceListening = toggleVoiceListening

// VERSION NAMES
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
    const tag = document.getElementById("versionTag")
    if (tag) tag.textContent = "DATTA AI " + v.version + " · " + v.name.toUpperCase()
    const sub = document.querySelector(".profileSub")
    const user = getUser()
    if (sub && !user?.isCreator) sub.textContent = v.emoji + " " + v.name + " " + v.sanskrit
    localStorage.setItem("datta_plan", plan)
  } catch(e) {
    console.log("Version load error:", e.message)
  }
}

window.addEventListener("DOMContentLoaded", function() {
  setTimeout(loadUserVersion, 1000)
})

// Add CSS animation for spin
const style = document.createElement('style')
style.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`
document.head.appendChild(style)
