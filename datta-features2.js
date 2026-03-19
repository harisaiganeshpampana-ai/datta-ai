/*
 ═══════════════════════════════════════════════════════════════
  DATTA AI — MEGA FEATURES UPDATE v6.0
  🧾 Smart Memory — remembers facts across chats
  🌍 Real-Time Language Translator
  🎵 Music Mood Player
  📊 Personal Analytics Dashboard
 ═══════════════════════════════════════════════════════════════
*/

// ═══════════════════════════════════════════════════════════════
//  🧾 FEATURE 1: SMART MEMORY
// ═══════════════════════════════════════════════════════════════

const MEMORY_TRIGGERS = [
  { pattern: /my name is ([a-zA-Z]+)/i,        key: "name",       label: "Your name" },
  { pattern: /i('m| am) ([a-zA-Z ]+)/i,        key: "role",       label: "You are" },
  { pattern: /i work (at|for|in) ([^.!?]+)/i,  key: "work",       label: "Work" },
  { pattern: /i live in ([^.!?]+)/i,            key: "location",   label: "Location" },
  { pattern: /i('m| am) from ([^.!?]+)/i,       key: "from",       label: "From" },
  { pattern: /i like ([^.!?]+)/i,               key: "likes",      label: "Likes" },
  { pattern: /i love ([^.!?]+)/i,               key: "loves",      label: "Loves" },
  { pattern: /i hate ([^.!?]+)/i,               key: "hates",      label: "Dislikes" },
  { pattern: /my (goal|dream) is ([^.!?]+)/i,  key: "goal",       label: "Goal" },
  { pattern: /i('m| am) building ([^.!?]+)/i,  key: "building",   label: "Building" },
  { pattern: /my (age|birthday) is ([^.!?]+)/i,key: "age",        label: "Age/Birthday" },
  { pattern: /i study ([^.!?]+)/i,              key: "study",      label: "Studies" },
  { pattern: /call me ([a-zA-Z]+)/i,            key: "nickname",   label: "Nickname" },
]

function getMemory() {
  try { return JSON.parse(localStorage.getItem("datta_memory") || "{}") }
  catch { return {} }
}

function saveMemory(data) {
  localStorage.setItem("datta_memory", JSON.stringify(data))
}

function extractAndSaveMemory(text) {
  const memory = getMemory()
  const newFacts = []

  for (const trigger of MEMORY_TRIGGERS) {
    const match = text.match(trigger.pattern)
    if (match) {
      const value = (match[2] || match[1] || "").trim()
      if (value && value.length > 1 && value.length < 80) {
        if (memory[trigger.key] !== value) {
          memory[trigger.key] = value
          memory[trigger.key + "_time"] = Date.now()
          newFacts.push({ label: trigger.label, value })
        }
      }
    }
  }

  if (newFacts.length > 0) {
    saveMemory(memory)
    showMemorySavedToast(newFacts)
  }
}

function showMemorySavedToast(facts) {
  const t = document.createElement("div")
  t.style.cssText = `
    position:fixed;bottom:90px;left:16px;
    background:#0f0e00;border:1px solid rgba(0,255,136,0.3);
    border-radius:14px;padding:10px 14px;z-index:9999;
    font-family:'DM Sans',sans-serif;font-size:12px;
    color:#00ff88;box-shadow:0 4px 20px rgba(0,0,0,0.5);
    max-width:220px;animation:memIn 0.3s ease;
  `
  const style = document.createElement("style")
  style.textContent = `@keyframes memIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`
  document.head.appendChild(style)
  t.innerHTML = `
    <div style="font-family:'Rajdhani',sans-serif;font-size:11px;letter-spacing:1px;
      color:#00ff88;margin-bottom:6px;">🧾 MEMORY SAVED</div>
    ${facts.map(f => `<div style="color:#443300;font-size:11px;">
      <span style="color:#665500;">${f.label}:</span> ${f.value}</div>`).join("")}
  `
  document.body.appendChild(t)
  setTimeout(() => { t.style.opacity="0"; t.style.transition="opacity 0.4s"; setTimeout(()=>t.remove(),400) }, 3500)
}

function getMemoryContext() {
  const memory = getMemory()
  const keys = Object.keys(memory).filter(k => !k.endsWith("_time"))
  if (keys.length === 0) return ""

  let ctx = "\n\n[SMART MEMORY — facts you know about this user, use naturally in conversation]:\n"
  for (const key of keys) {
    ctx += `- ${key}: ${memory[key]}\n`
  }
  return ctx
}

function showMemoryPanel() {
  let panel = document.getElementById("memoryPanel")
  if (panel) { panel.remove(); return }

  const memory = getMemory()
  const keys = Object.keys(memory).filter(k => !k.endsWith("_time"))

  panel = document.createElement("div")
  panel.id = "memoryPanel"
  panel.style.cssText = `
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    background:#0a0900;border:1px solid rgba(0,255,136,0.2);
    border-radius:20px;padding:24px;z-index:10000;
    width:min(380px,92vw);max-height:80vh;overflow-y:auto;
    box-shadow:0 20px 60px rgba(0,0,0,0.8);font-family:'DM Sans',sans-serif;
  `
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:3px;
        background:linear-gradient(90deg,#00ff88,#00ccff);-webkit-background-clip:text;
        -webkit-text-fill-color:transparent;">🧾 SMART MEMORY</div>
      <button onclick="document.getElementById('memoryPanel').remove()"
        style="background:none;border:none;color:#554400;cursor:pointer;font-size:18px;">✕</button>
    </div>
    ${keys.length === 0 ? `
      <div style="text-align:center;padding:30px;color:#443300;">
        <div style="font-size:36px;margin-bottom:10px;">🌱</div>
        <div style="font-family:'Rajdhani',sans-serif;font-size:13px;letter-spacing:1px;">
          No memories yet. Tell me about yourself!</div>
        <div style="font-size:12px;color:#332200;margin-top:8px;">
          Try: "My name is..." or "I work at..." or "I love..."
        </div>
      </div>` :
      `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
        ${keys.map(key => `
          <div style="display:flex;align-items:center;gap:10px;
            background:#0f0e00;border:1px solid rgba(0,255,136,0.08);
            border-radius:10px;padding:10px 14px;">
            <div style="flex:1;">
              <div style="font-family:'Rajdhani',sans-serif;font-size:10px;
                letter-spacing:1px;color:#332200;margin-bottom:2px;">
                ${key.replace(/_/g," ").toUpperCase()}</div>
              <div style="font-size:13px;color:#fff8e7;">${memory[key]}</div>
            </div>
            <button onclick="deleteMemory('${key}')"
              style="background:none;border:none;color:#332200;cursor:pointer;
              font-size:14px;padding:4px;">🗑</button>
          </div>`).join("")}
      </div>`}
    <button onclick="if(confirm('Clear all memories?')){localStorage.removeItem('datta_memory');document.getElementById('memoryPanel').remove();}"
      style="width:100%;padding:10px;background:none;
      border:1px solid rgba(255,60,60,0.2);border-radius:50px;color:#ff4444;
      font-family:'Rajdhani',sans-serif;font-size:12px;letter-spacing:1px;cursor:pointer;">
      🗑️ Clear All Memories
    </button>
  `
  document.body.appendChild(panel)
}

function deleteMemory(key) {
  const memory = getMemory()
  delete memory[key]
  delete memory[key + "_time"]
  saveMemory(memory)
  showMemoryPanel()
  showMemoryPanel() // reopen refreshed
}

window.showMemoryPanel = showMemoryPanel
window.deleteMemory = deleteMemory
window.getMemoryContext = getMemoryContext
window.extractAndSaveMemory = extractAndSaveMemory

// ═══════════════════════════════════════════════════════════════
//  🌍 FEATURE 2: REAL-TIME LANGUAGE TRANSLATOR
// ═══════════════════════════════════════════════════════════════

const LANG_DETECT = {
  hindi:   /[\u0900-\u097F]/,
  telugu:  /[\u0C00-\u0C7F]/,
  tamil:   /[\u0B80-\u0BFF]/,
  arabic:  /[\u0600-\u06FF]/,
  chinese: /[\u4E00-\u9FFF]/,
  japanese:/[\u3040-\u30FF]/,
  korean:  /[\uAC00-\uD7AF]/,
}

function detectLanguage(text) {
  for (const [lang, pattern] of Object.entries(LANG_DETECT)) {
    if (pattern.test(text)) return lang
  }
  return "english"
}

function showTranslateButton(text, messageEl) {
  const lang = detectLanguage(text)
  if (lang === "english") return

  const btn = document.createElement("button")
  btn.style.cssText = `
    margin-top:6px;padding:4px 12px;background:rgba(0,204,255,0.08);
    border:1px solid rgba(0,204,255,0.2);border-radius:50px;
    color:#00ccff;font-family:'Rajdhani',sans-serif;font-size:11px;
    font-weight:700;letter-spacing:1px;cursor:pointer;display:block;
  `
  btn.textContent = `🌍 Translate from ${lang.charAt(0).toUpperCase()+lang.slice(1)}`
  btn.onclick = () => translateMessage(text, btn)
  messageEl.appendChild(btn)
}

async function translateMessage(text, btn) {
  btn.textContent = "🌍 Translating..."
  btn.disabled = true

  try {
    const formData = new FormData()
    formData.append("message", `Translate this to English and reply with ONLY the translation, nothing else: "${text}"`)
    formData.append("token", localStorage.getItem("datta_token") || "")

    const res = await fetch("https://datta-ai-server.onrender.com/chat", {
      method: "POST", body: formData
    })

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let result = ""
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      result += decoder.decode(value)
    }
    result = result.split("CHATID")[0].trim()

    const translationBox = document.createElement("div")
    translationBox.style.cssText = `
      margin-top:8px;padding:10px 14px;
      background:rgba(0,204,255,0.06);
      border:1px solid rgba(0,204,255,0.15);
      border-radius:10px;font-size:13px;color:#00ccff;
      font-family:'DM Sans',sans-serif;line-height:1.5;
    `
    translationBox.innerHTML = `<span style="font-family:'Rajdhani',sans-serif;font-size:10px;
      letter-spacing:1px;color:#332200;display:block;margin-bottom:4px;">🌍 TRANSLATION</span>${result}`
    btn.parentNode.insertBefore(translationBox, btn.nextSibling)
    btn.remove()
  } catch(e) {
    btn.textContent = "❌ Failed. Try again."
    btn.disabled = false
  }
}

// Auto-show translate button on AI responses
function checkAndAddTranslateBtn(bubbleEl) {
  const text = bubbleEl.innerText || bubbleEl.textContent
  if (text && text.length > 5) showTranslateButton(text, bubbleEl)
}

window.checkAndAddTranslateBtn = checkAndAddTranslateBtn

// Translate panel — full translator tool
function showTranslatorPanel() {
  let panel = document.getElementById("translatorPanel")
  if (panel) { panel.remove(); return }

  panel = document.createElement("div")
  panel.id = "translatorPanel"
  panel.style.cssText = `
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    background:#0a0900;border:1px solid rgba(0,204,255,0.2);
    border-radius:20px;padding:24px;z-index:10000;
    width:min(420px,92vw);box-shadow:0 20px 60px rgba(0,0,0,0.8);
    font-family:'DM Sans',sans-serif;
  `
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:3px;
        background:linear-gradient(90deg,#00ccff,#c084fc);-webkit-background-clip:text;
        -webkit-text-fill-color:transparent;">🌍 TRANSLATOR</div>
      <button onclick="document.getElementById('translatorPanel').remove()"
        style="background:none;border:none;color:#554400;cursor:pointer;font-size:18px;">✕</button>
    </div>
    <textarea id="transInput" placeholder="Type or paste text to translate..."
      style="width:100%;height:100px;background:#0f0e00;border:1px solid rgba(255,215,0,0.1);
      border-radius:12px;padding:12px;color:#fff8e7;font-size:13px;
      font-family:'DM Sans',sans-serif;resize:none;outline:none;margin-bottom:10px;"></textarea>
    <div style="display:flex;gap:8px;margin-bottom:12px;">
      <select id="transLang" style="flex:1;background:#0f0e00;border:1px solid rgba(255,215,0,0.1);
        border-radius:10px;padding:8px 12px;color:#fff8e7;font-family:'Rajdhani',sans-serif;
        font-size:13px;outline:none;">
        <option value="English">🇺🇸 English</option>
        <option value="Hindi">🇮🇳 Hindi</option>
        <option value="Telugu">🇮🇳 Telugu</option>
        <option value="Tamil">🇮🇳 Tamil</option>
        <option value="Spanish">🇪🇸 Spanish</option>
        <option value="French">🇫🇷 French</option>
        <option value="Arabic">🇸🇦 Arabic</option>
        <option value="Japanese">🇯🇵 Japanese</option>
        <option value="Chinese">🇨🇳 Chinese</option>
        <option value="German">🇩🇪 German</option>
        <option value="Korean">🇰🇷 Korean</option>
      </select>
      <button onclick="runTranslation()"
        style="padding:8px 20px;background:rgba(0,204,255,0.1);
        border:1px solid rgba(0,204,255,0.3);border-radius:10px;
        color:#00ccff;font-family:'Rajdhani',sans-serif;font-size:13px;
        font-weight:700;letter-spacing:1px;cursor:pointer;">
        Translate →
      </button>
    </div>
    <div id="transOutput" style="min-height:60px;background:#0f0e00;
      border:1px solid rgba(255,215,0,0.08);border-radius:12px;padding:12px;
      color:#665500;font-size:13px;font-family:'DM Sans',sans-serif;line-height:1.6;">
      Translation will appear here...
    </div>
    <button onclick="copyTranslation()"
      style="margin-top:10px;width:100%;padding:9px;background:none;
      border:1px solid rgba(255,215,0,0.12);border-radius:50px;
      color:#443300;font-family:'Rajdhani',sans-serif;font-size:12px;
      letter-spacing:1px;cursor:pointer;">
      📋 Copy Translation
    </button>
  `
  document.body.appendChild(panel)
}

async function runTranslation() {
  const input = document.getElementById("transInput")?.value.trim()
  const lang = document.getElementById("transLang")?.value
  const output = document.getElementById("transOutput")
  if (!input || !output) return

  output.style.color = "#443300"
  output.textContent = "Translating..."

  try {
    const formData = new FormData()
    formData.append("message", `Translate the following text to ${lang}. Reply with ONLY the translation, no explanation: "${input}"`)
    formData.append("token", localStorage.getItem("datta_token") || "")

    const res = await fetch("https://datta-ai-server.onrender.com/chat", { method:"POST", body:formData })
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let result = ""
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      result += decoder.decode(value)
    }
    result = result.split("CHATID")[0].trim()
    output.style.color = "#fff8e7"
    output.textContent = result
  } catch(e) {
    output.style.color = "#ff4444"
    output.textContent = "Translation failed. Try again."
  }
}

function copyTranslation() {
  const output = document.getElementById("transOutput")
  if (output) navigator.clipboard.writeText(output.textContent)
    .then(() => { output.style.color = "#00ff88"; setTimeout(()=>{output.style.color="#fff8e7"},1000) })
}

window.showTranslatorPanel = showTranslatorPanel
window.runTranslation = runTranslation
window.copyTranslation = copyTranslation

// ═══════════════════════════════════════════════════════════════
//  🎵 FEATURE 3: MUSIC MOOD PLAYER
// ═══════════════════════════════════════════════════════════════

const MOOD_PLAYLISTS = {
  focused:  { label:"Lo-Fi Focus",      color:"#00ccff", query:"lofi+hip+hop+study+beats",      emoji:"🎧" },
  happy:    { label:"Happy Vibes",       color:"#ffd700", query:"happy+upbeat+feel+good+music",  emoji:"😄" },
  stressed: { label:"Calm & Relax",      color:"#00ff88", query:"calm+relaxing+stress+relief",   emoji:"🌿" },
  creative: { label:"Creative Flow",     color:"#c084fc", query:"creative+flow+state+music",     emoji:"🎨" },
  lazy:     { label:"Chill Beats",       color:"#f97316", query:"chill+lazy+sunday+beats",       emoji:"😴" },
  curious:  { label:"Deep Focus",        color:"#ec4899", query:"deep+focus+concentration+music",emoji:"🔍" },
  night:    { label:"Late Night Vibes",  color:"#818cf8", query:"late+night+lofi+chill+music",   emoji:"🌙" },
  support:  { label:"Healing Music",     color:"#00ff88", query:"healing+meditation+calm+piano", emoji:"💙" },
}

let playerVisible = false

function  {
  let player = document.getElementById("moodMusicPlayer")
  if (player) {
    playerVisible = !playerVisible
    player.style.transform = playerVisible ? "translateY(0)" : "translateY(calc(100% - 44px))"
    return
  }

  const savedMood = localStorage.getItem("datta_mood") || "focused"
  const playlist = MOOD_PLAYLISTS[savedMood] || MOOD_PLAYLISTS.focused
  const videoId = getMoodVideoId(savedMood)

  player = document.createElement("div")
  player.id = "moodMusicPlayer"
  playerVisible = true
  player.style.cssText = `
    position:fixed;bottom:0;right:20px;
    width:300px;background:#0a0900;
    border:1px solid ${playlist.color}33;
    border-bottom:none;border-radius:16px 16px 0 0;
    z-index:9997;transition:transform 0.3s ease;
    box-shadow:0 -4px 30px rgba(0,0,0,0.6);
    font-family:'DM Sans',sans-serif;
    transform:translateY(0);
  `
  player.innerHTML = `
    <!-- HEADER (click to toggle) -->
    <div onclick="toggleMusicPlayer()" style="display:flex;align-items:center;gap:8px;
      padding:10px 14px;cursor:pointer;border-bottom:1px solid rgba(255,215,0,0.06);">
      <div style="width:8px;height:8px;border-radius:50%;background:${playlist.color};
        animation:musicPulse 1s infinite;"></div>
      <div style="font-family:'Rajdhani',sans-serif;font-size:12px;font-weight:700;
        letter-spacing:1px;color:${playlist.color};flex:1;">
        ${playlist.emoji} ${playlist.label}
      </div>
      <div id="musicChevron" style="color:#443300;font-size:12px;">▼</div>
    </div>
    <style>@keyframes musicPulse{0%,100%{opacity:1}50%{opacity:0.3}}</style>

    <!-- YOUTUBE EMBED -->
    <div style="padding:10px;">
      <iframe id="musicFrame"
        src="https://www.youtube.com/embed?listType=search&list=${playlist.query}&autoplay=1&mute=0&controls=1&modestbranding=1"
        style="width:100%;height:160px;border:none;border-radius:10px;
        background:#0f0e00;"
        allow="autoplay; encrypted-media" allowfullscreen>
      </iframe>
    </div>

    <!-- MOOD SWITCHER -->
    <div style="padding:0 10px 10px;">
      <div style="font-family:'Rajdhani',sans-serif;font-size:10px;letter-spacing:2px;
        color:#332200;margin-bottom:6px;">SWITCH VIBE</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;">
        ${Object.entries(MOOD_PLAYLISTS).map(([key, pl]) => `
          <button onclick="switchMusicMood('${key}')"
            style="padding:3px 8px;background:rgba(255,215,0,0.04);
            border:1px solid rgba(255,215,0,0.08);border-radius:20px;
            color:#443300;font-family:'Rajdhani',sans-serif;font-size:10px;
            cursor:pointer;transition:all 0.2s;"
            onmouseover="this.style.color='${pl.color}';this.style.borderColor='${pl.color}44'"
            onmouseout="this.style.color='#443300';this.style.borderColor='rgba(255,215,0,0.08)'">
            ${pl.emoji}
          </button>`).join("")}
      </div>
    </div>
  `
  document.body.appendChild(player)
}

function toggleMusicPlayer() {
  const player = document.getElementById("moodMusicPlayer")
  const chevron = document.getElementById("musicChevron")
  if (!player) return
  playerVisible = !playerVisible
  player.style.transform = playerVisible ? "translateY(0)" : "translateY(calc(100% - 44px))"
  if (chevron) chevron.textContent = playerVisible ? "▼" : "▲"
}

function switchMusicMood(moodKey) {
  const playlist = MOOD_PLAYLISTS[moodKey]
  if (!playlist) return
  const frame = document.getElementById("musicFrame")
  const player = document.getElementById("moodMusicPlayer")
  if (frame) {
    frame.src = `https://www.youtube.com/embed?listType=search&list=${playlist.query}&autoplay=1&controls=1&modestbranding=1`
  }
  if (player) {
    player.style.borderColor = playlist.color + "33"
    const dot = player.querySelector("div[style*='musicPulse']")
    const label = player.querySelector("div[style*='Rajdhani']")
    if (dot) dot.style.background = playlist.color
    if (label) { label.style.color = playlist.color; label.textContent = `${playlist.emoji} ${playlist.label}` }
  }
}

function getMoodVideoId(mood) {
  return null // uses search instead
}

window.showMusicPlayer = showMusicPlayer
window.toggleMusicPlayer = toggleMusicPlayer
window.switchMusicMood = switchMusicMood

// Auto-show music player when mood is applied
const _origApplyMood2 = window.applyMood
window.applyMood = function(moodKey, save, isAuto) {
  if (_origApplyMood2) _origApplyMood2.apply(this, arguments)
  // Update music player if open
  const player = document.getElementById("moodMusicPlayer")
  if (player) switchMusicMood(moodKey)
}

// ═══════════════════════════════════════════════════════════════
//  📊 FEATURE 4: PERSONAL ANALYTICS DASHBOARD
// ═══════════════════════════════════════════════════════════════

function showAnalyticsDashboard() {
  let dash = document.getElementById("analyticsDash")
  if (dash) { dash.remove(); return }

  const xpData = (() => { try { return JSON.parse(localStorage.getItem("datta_xp")||"{}") } catch{return{}} })()
  const moodTimeline = (() => { try { return JSON.parse(localStorage.getItem("datta_mood_timeline")||"[]") } catch{return[]} })()
  const personality = (() => { try { return JSON.parse(localStorage.getItem("datta_personality")||"{}") } catch{return{}} })()
  const memory = getMemory()

  const totalXP = xpData.totalXP || 0
  const streak = xpData.streak || 0
  const history = xpData.history || []
  const totalMsgs = history.filter(h=>h.type==="message").length
  const totalImgs = history.filter(h=>h.type==="image").length
  const totalVoice = history.filter(h=>h.type==="voice").length
  const totalSearch = history.filter(h=>h.type==="search").length
  const memCount = Object.keys(memory).filter(k=>!k.endsWith("_time")).length

  // Mood distribution
  const moodCounts = {}
  for (const e of moodTimeline) moodCounts[e.mood] = (moodCounts[e.mood]||0)+1
  const topMoods = Object.entries(moodCounts).sort((a,b)=>b[1]-a[1]).slice(0,4)

  // Hour activity (last 7 days)
  const weekAgo = Date.now() - 7*86400000
  const recentHistory = history.filter(h => h.time > weekAgo)
  const hourBuckets = Array(24).fill(0)
  for (const h of recentHistory) {
    const hour = new Date(h.time).getHours()
    hourBuckets[hour]++
  }
  const maxHour = Math.max(...hourBuckets, 1)
  const peakHour = hourBuckets.indexOf(Math.max(...hourBuckets))

  // Top topics
  const topics = personality.topics || {}
  const topTopics = Object.entries(topics).sort((a,b)=>b[1]-a[1]).slice(0,3)

  const MOODS = window.MOODS || {}

  dash = document.createElement("div")
  dash.id = "analyticsDash"
  dash.style.cssText = `
    position:fixed;top:0;left:0;right:0;bottom:0;
    background:rgba(0,0,0,0.92);z-index:10002;
    overflow-y:auto;font-family:'DM Sans',sans-serif;
    animation:dashIn 0.3s ease;
  `
  const style = document.createElement("style")
  style.textContent = `@keyframes dashIn{from{opacity:0}to{opacity:1}}`
  document.head.appendChild(style)

  dash.innerHTML = `
    <div style="max-width:720px;margin:0 auto;padding:24px 16px 60px;">

      <!-- HEADER -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
        <div>
          <div style="font-family:'Rajdhani',sans-serif;font-size:11px;letter-spacing:3px;
            color:#443300;margin-bottom:4px;">YOUR DATTA AI</div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:4px;
            background:linear-gradient(90deg,#fff8e7,#ffd700,#ff8c00);
            -webkit-background-clip:text;-webkit-text-fill-color:transparent;">
            ANALYTICS DASHBOARD
          </div>
        </div>
        <button onclick="document.getElementById('analyticsDash').remove()"
          style="background:none;border:1px solid rgba(255,215,0,0.15);
          border-radius:50px;padding:8px 16px;color:#443300;cursor:pointer;
          font-family:'Rajdhani',sans-serif;font-size:12px;letter-spacing:1px;">
          ✕ Close
        </button>
      </div>

      <!-- TOP STATS -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">
        ${bigStat("💬", totalMsgs, "Messages", "#ffd700")}
        ${bigStat("⚡", totalXP, "Total XP", "#f97316")}
        ${bigStat("🔥", streak, "Day Streak", "#ef4444")}
        ${bigStat("🎨", totalImgs, "Images", "#c084fc")}
        ${bigStat("🎙️", totalVoice, "Voice", "#00ff88")}
        ${bigStat("🧾", memCount, "Memories", "#00ccff")}
      </div>

      <!-- ACTIVITY CHART (hourly) -->
      <div style="background:#0f0e00;border:1px solid rgba(255,215,0,0.08);
        border-radius:16px;padding:18px;margin-bottom:16px;">
        <div style="font-family:'Rajdhani',sans-serif;font-size:11px;letter-spacing:2px;
          color:#443300;margin-bottom:14px;">
          ⏰ ACTIVITY BY HOUR · Peak: ${peakHour}:00
        </div>
        <div style="display:flex;align-items:flex-end;gap:3px;height:60px;">
          ${hourBuckets.map((count, h) => `
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;">
              <div style="width:100%;border-radius:3px 3px 0 0;
                background:${h===peakHour?'var(--accent)':'rgba(255,215,0,0.2)'};
                height:${Math.max(3, Math.round((count/maxHour)*52))}px;
                transition:all 0.3s;"></div>
            </div>`).join("")}
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:4px;">
          <span style="font-family:'Rajdhani',sans-serif;font-size:9px;color:#332200;">12am</span>
          <span style="font-family:'Rajdhani',sans-serif;font-size:9px;color:#332200;">6am</span>
          <span style="font-family:'Rajdhani',sans-serif;font-size:9px;color:#332200;">12pm</span>
          <span style="font-family:'Rajdhani',sans-serif;font-size:9px;color:#332200;">6pm</span>
          <span style="font-family:'Rajdhani',sans-serif;font-size:9px;color:#332200;">11pm</span>
        </div>
      </div>

      <!-- MOOD + TOPICS ROW -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">

        <!-- MOOD DISTRIBUTION -->
        <div style="background:#0f0e00;border:1px solid rgba(255,215,0,0.08);
          border-radius:16px;padding:16px;">
          <div style="font-family:'Rajdhani',sans-serif;font-size:11px;letter-spacing:2px;
            color:#443300;margin-bottom:12px;">😊 MOOD MIX</div>
          ${topMoods.length === 0 ?
            `<div style="color:#332200;font-size:12px;text-align:center;padding:12px;">
              No mood data yet</div>` :
            topMoods.map(([mood, count]) => {
              const m = MOODS[mood] || { emoji:"❓", label: mood, color:"#ffd700" }
              const pct = Math.round((count / moodTimeline.length) * 100)
              return `
                <div style="margin-bottom:8px;">
                  <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
                    <span style="font-family:'Rajdhani',sans-serif;font-size:11px;
                      color:${m.color};">${m.emoji} ${m.label}</span>
                    <span style="font-family:'Rajdhani',sans-serif;font-size:11px;
                      color:#332200;">${pct}%</span>
                  </div>
                  <div style="background:rgba(255,255,255,0.04);border-radius:4px;height:5px;">
                    <div style="height:100%;width:${pct}%;background:${m.color};
                      border-radius:4px;transition:width 0.5s;"></div>
                  </div>
                </div>`
            }).join("")}
        </div>

        <!-- TOP TOPICS -->
        <div style="background:#0f0e00;border:1px solid rgba(255,215,0,0.08);
          border-radius:16px;padding:16px;">
          <div style="font-family:'Rajdhani',sans-serif;font-size:11px;letter-spacing:2px;
            color:#443300;margin-bottom:12px;">🎯 TOP TOPICS</div>
          ${topTopics.length === 0 ?
            `<div style="color:#332200;font-size:12px;text-align:center;padding:12px;">
              Chat more to see topics</div>` :
            topTopics.map(([topic, count], i) => {
              const colors = ["#ffd700","#c084fc","#00ccff"]
              const emojis = ["🥇","🥈","🥉"]
              return `
                <div style="display:flex;align-items:center;gap:8px;
                  padding:8px 10px;border-radius:10px;margin-bottom:6px;
                  background:rgba(255,255,255,0.02);">
                  <span style="font-size:14px;">${emojis[i]}</span>
                  <div style="flex:1;">
                    <div style="font-family:'Rajdhani',sans-serif;font-size:12px;
                      font-weight:700;color:${colors[i]};">
                      ${topic.charAt(0).toUpperCase()+topic.slice(1)}
                    </div>
                  </div>
                  <div style="font-family:'Rajdhani',sans-serif;font-size:11px;
                    color:#332200;">${count}x</div>
                </div>`
            }).join("")}
        </div>
      </div>

      <!-- MEMORY SNAPSHOT -->
      <div style="background:#0f0e00;border:1px solid rgba(0,255,136,0.1);
        border-radius:16px;padding:16px;margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div style="font-family:'Rajdhani',sans-serif;font-size:11px;letter-spacing:2px;color:#443300;">
            🧾 SMART MEMORY
          </div>
          <button onclick="showMemoryPanel()"
            style="background:none;border:1px solid rgba(0,255,136,0.2);border-radius:20px;
            padding:2px 10px;color:#00ff88;font-family:'Rajdhani',sans-serif;
            font-size:10px;letter-spacing:1px;cursor:pointer;">View All</button>
        </div>
        ${memCount === 0 ?
          `<div style="color:#332200;font-size:12px;">No memories saved yet. Tell me about yourself!</div>` :
          `<div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${Object.entries(memory).filter(([k])=>!k.endsWith("_time")).slice(0,6).map(([k,v])=>`
              <div style="padding:4px 10px;background:rgba(0,255,136,0.05);
                border:1px solid rgba(0,255,136,0.12);border-radius:20px;">
                <span style="font-family:'Rajdhani',sans-serif;font-size:10px;color:#443300;">
                  ${k}:</span>
                <span style="font-size:11px;color:#00ff88;margin-left:4px;">${v}</span>
              </div>`).join("")}
          </div>`}
      </div>

    </div>
  `
  document.body.appendChild(dash)
}

function bigStat(emoji, value, label, color) {
  return `
    <div style="background:#0f0e00;border:1px solid rgba(255,215,0,0.07);
      border-radius:14px;padding:16px;text-align:center;">
      <div style="font-size:22px;margin-bottom:4px;">${emoji}</div>
      <div style="font-family:'Rajdhani',sans-serif;font-size:20px;font-weight:700;
        color:${color};">${value}</div>
      <div style="font-family:'Rajdhani',sans-serif;font-size:10px;color:#332200;
        letter-spacing:1px;margin-top:2px;">${label}</div>
    </div>
  `
}

window.showAnalyticsDashboard = showAnalyticsDashboard

// ═══════════════════════════════════════════════════════════════
//  HOOK INTO SEND — memory extraction + translate button
// ═══════════════════════════════════════════════════════════════

const _origSend2 = window.send
window.send = async function() {
  const input = document.getElementById("message")
  const text = input ? input.value.trim() : ""
  if (text) extractAndSaveMemory(text)
  if (_origSend2) return _origSend2.apply(this, arguments)
}

// Patch buildMoodPrefix to include memory context
const _origBuildMoodPrefix2 = window.buildMoodPrefix
window.buildMoodPrefix = function() {
  const base = _origBuildMoodPrefix2 ? _origBuildMoodPrefix2() : ""
  const memCtx = getMemoryContext()
  return base + memCtx
}

// ═══════════════════════════════════════════════════════════════
//  ADD TOOLBAR BUTTONS TO SIDEBAR
// ═══════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", function() {
  setTimeout(() => {
    const sidebar = document.querySelector(".sidebar")
    const divider = sidebar?.querySelector(".sidebarDivider")
    if (!sidebar || !divider) return

    const toolBar = document.createElement("div")
    toolBar.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:5px 14px;border-bottom:1px solid rgba(255,215,0,0.06);"
    toolBar.innerHTML = `
      <span style="font-family:'Rajdhani',sans-serif;font-size:10px;letter-spacing:2px;color:#332200;">TOOLS</span>
      <div style="display:flex;gap:4px;">
        <button onclick="showMemoryPanel()" title="Memory" style="width:28px;height:28px;background:none;border:1px solid rgba(0,255,136,0.2);border-radius:7px;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;">🧾</button>
        <button onclick="showTranslatorPanel()" title="Translate" style="width:28px;height:28px;background:none;border:1px solid rgba(0,204,255,0.2);border-radius:7px;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;">🌍</button>
        <button onclick="showAnalyticsDashboard()" title="Stats" style="width:28px;height:28px;background:none;border:1px solid rgba(192,132,252,0.2);border-radius:7px;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;">📊</button>
        <button onclick="showXPPanel()" title="XP" style="width:28px;height:28px;background:none;border:1px solid rgba(255,215,0,0.2);border-radius:7px;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;">🎮</button>
      </div>
    `
    sidebar.insertBefore(toolBar, divider.nextSibling)
  }, 800)
})
