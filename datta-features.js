/*
 ═══════════════════════════════════════════════════════════════
  DATTA AI — MEGA FEATURES UPDATE v5.0
  🧬 AI Personality Evolution
  📅 Smart Daily Briefing
  🎮 Gamified Chat XP System
  🫂 Emotional Support Mode
 ═══════════════════════════════════════════════════════════════
*/

// ═══════════════════════════════════════════════════════════════
//  🎮 FEATURE 1: GAMIFIED CHAT XP SYSTEM
// ═══════════════════════════════════════════════════════════════

const XP_LEVELS = [
  { level: 1, name: "Beginner",    emoji: "🌱", xpNeeded: 0    },
  { level: 2, name: "Explorer",    emoji: "🔭", xpNeeded: 100  },
  { level: 3, name: "Thinker",     emoji: "💭", xpNeeded: 300  },
  { level: 4, name: "Creator",     emoji: "⚡", xpNeeded: 600  },
  { level: 5, name: "Mastermind",  emoji: "🧠", xpNeeded: 1000 },
  { level: 6, name: "Legend",      emoji: "👑", xpNeeded: 2000 },
  { level: 7, name: "Brahma",      emoji: "🔥", xpNeeded: 5000 },
]

const XP_REWARDS = {
  message:    { xp: 10, label: "+10 XP · Message sent" },
  mood:       { xp: 15, label: "+15 XP · Mood set" },
  streak:     { xp: 50, label: "+50 XP · Daily streak!" },
  image:      { xp: 20, label: "+20 XP · Image generated" },
  voice:      { xp: 25, label: "+25 XP · Voice used" },
  search:     { xp: 15, label: "+15 XP · Web searched" },
  elaborate:  { xp: 5,  label: "+5 XP · Deep question" },
}

function getXPData() {
  try { return JSON.parse(localStorage.getItem("datta_xp") || "{}") }
  catch { return {} }
}

function saveXPData(data) {
  localStorage.setItem("datta_xp", JSON.stringify(data))
}

function getCurrentLevel(totalXP) {
  let current = XP_LEVELS[0]
  for (const lvl of XP_LEVELS) {
    if (totalXP >= lvl.xpNeeded) current = lvl
    else break
  }
  return current
}

function getNextLevel(totalXP) {
  for (let i = 0; i < XP_LEVELS.length - 1; i++) {
    if (totalXP < XP_LEVELS[i+1].xpNeeded) return XP_LEVELS[i+1]
  }
  return null
}

function awardXP(type) {
  const reward = XP_REWARDS[type]
  if (!reward) return

  const data = getXPData()
  const prevXP = data.totalXP || 0
  const prevLevel = getCurrentLevel(prevXP)

  data.totalXP = prevXP + reward.xp
  data.history = data.history || []
  data.history.push({ type, xp: reward.xp, time: Date.now() })
  if (data.history.length > 100) data.history.splice(0, data.history.length - 100)
  saveXPData(data)

  const newLevel = getCurrentLevel(data.totalXP)

  // Level up!
  if (newLevel.level > prevLevel.level) {
    showLevelUpBanner(newLevel)
  } else {
    showXPToast(reward.label, reward.xp)
  }

  updateXPBar()
  checkStreak()
}

function updateXPBar() {
  const data = getXPData()
  const totalXP = data.totalXP || 0
  const level = getCurrentLevel(totalXP)
  const next = getNextLevel(totalXP)

  let bar = document.getElementById("xpBarWrap")
  if (!bar) {
    bar = document.createElement("div")
    bar.id = "xpBarWrap"
    bar.style.cssText = `
      padding: 8px 14px 4px;
      cursor: pointer;
    `
    bar.onclick = showXPPanel
    const sidebar = document.querySelector(".sidebar")
    const upgradeBtn = sidebar?.querySelector(".upgradeBtn")
    if (upgradeBtn) sidebar.insertBefore(bar, upgradeBtn)
  }

  const pct = next
    ? Math.floor(((totalXP - level.xpNeeded) / (next.xpNeeded - level.xpNeeded)) * 100)
    : 100

  bar.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">
      <div style="font-family:'Rajdhani',sans-serif;font-size:12px;font-weight:700;
        color:var(--accent);letter-spacing:1px;">
        ${level.emoji} ${level.name}
      </div>
      <div style="font-family:'Rajdhani',sans-serif;font-size:10px;color:#443300;letter-spacing:1px;">
        ${totalXP} XP
      </div>
    </div>
    <div style="background:rgba(255,215,0,0.08);border-radius:10px;height:5px;overflow:hidden;">
      <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--accent),#ff8c00);
        border-radius:10px;transition:width 0.5s ease;"></div>
    </div>
    ${next ? `<div style="font-family:'Rajdhani',sans-serif;font-size:9px;color:#332200;
      letter-spacing:1px;margin-top:3px;text-align:right;">
      ${next.xpNeeded - totalXP} XP to ${next.emoji} ${next.name}</div>` : 
      `<div style="font-family:'Rajdhani',sans-serif;font-size:9px;color:var(--accent);
      letter-spacing:1px;margin-top:3px;text-align:right;">MAX LEVEL 🔥</div>`}
  `
}

function showXPToast(label, xp) {
  const t = document.createElement("div")
  t.style.cssText = `
    position:fixed;bottom:90px;right:16px;
    background:#0f0e00;border:1px solid rgba(255,215,0,0.3);
    border-radius:50px;padding:7px 16px;z-index:9999;
    font-family:'Rajdhani',sans-serif;font-size:12px;
    font-weight:700;letter-spacing:1px;color:#ffd700;
    box-shadow:0 4px 20px rgba(0,0,0,0.5);
    animation:xpIn 0.3s ease;pointer-events:none;
    white-space:nowrap;
  `
  t.textContent = label
  const style = document.createElement("style")
  style.textContent = `@keyframes xpIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`
  document.head.appendChild(style)
  document.body.appendChild(t)
  setTimeout(() => { t.style.opacity="0"; t.style.transition="opacity 0.4s"; setTimeout(()=>t.remove(),400) }, 2500)
}

function showLevelUpBanner(level) {
  const banner = document.createElement("div")
  banner.style.cssText = `
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    background:#0a0900;border:2px solid var(--accent);
    border-radius:24px;padding:32px 40px;z-index:10001;
    text-align:center;box-shadow:0 0 60px rgba(255,215,0,0.3);
    font-family:'DM Sans',sans-serif;animation:lvlUp 0.5s ease;
  `
  banner.innerHTML = `
    <style>@keyframes lvlUp{from{opacity:0;transform:translate(-50%,-50%) scale(0.7)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}</style>
    <div style="font-size:56px;margin-bottom:8px;">${level.emoji}</div>
    <div style="font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:4px;
      background:linear-gradient(90deg,#ffd700,#ff8c00);-webkit-background-clip:text;
      -webkit-text-fill-color:transparent;">LEVEL UP!</div>
    <div style="font-family:'Rajdhani',sans-serif;font-size:18px;color:var(--accent);
      letter-spacing:2px;margin:6px 0 4px;">You are now a ${level.name}</div>
    <div style="font-size:12px;color:#443300;font-family:'Rajdhani',sans-serif;
      letter-spacing:1px;">Level ${level.level} · Keep going! 🚀</div>
    <button onclick="this.closest('div[style]').remove()" style="
      margin-top:20px;padding:10px 28px;
      background:linear-gradient(135deg,var(--accent),#ff8c00);
      border:none;border-radius:50px;color:#000;
      font-family:'Rajdhani',sans-serif;font-size:14px;
      font-weight:700;letter-spacing:2px;cursor:pointer;">
      AWESOME! 🎉
    </button>
  `
  document.body.appendChild(banner)
  setTimeout(() => { if (banner.parentNode) banner.remove() }, 6000)
}

function checkStreak() {
  const data = getXPData()
  const today = new Date().toDateString()
  const lastDay = data.lastStreakDay

  if (lastDay === today) return

  const yesterday = new Date(Date.now() - 86400000).toDateString()
  if (lastDay === yesterday) {
    data.streak = (data.streak || 0) + 1
  } else if (lastDay !== today) {
    data.streak = 1
  }

  data.lastStreakDay = today
  saveXPData(data)

  if (data.streak > 1) {
    awardXP("streak")
    showXPToast(`🔥 ${data.streak} day streak!`, 50)
  }
}

function showXPPanel() {
  let panel = document.getElementById("xpPanel")
  if (panel) { panel.remove(); return }

  const data = getXPData()
  const totalXP = data.totalXP || 0
  const level = getCurrentLevel(totalXP)
  const next = getNextLevel(totalXP)
  const streak = data.streak || 0

  panel = document.createElement("div")
  panel.id = "xpPanel"
  panel.style.cssText = `
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    background:#0a0900;border:1px solid rgba(255,215,0,0.2);
    border-radius:20px;padding:24px;z-index:10000;
    width:min(380px,92vw);max-height:80vh;overflow-y:auto;
    box-shadow:0 20px 60px rgba(0,0,0,0.8);
    font-family:'DM Sans',sans-serif;
  `
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:3px;
        background:linear-gradient(90deg,#ffd700,#ff8c00);-webkit-background-clip:text;
        -webkit-text-fill-color:transparent;">🎮 YOUR PROGRESS</div>
      <button onclick="document.getElementById('xpPanel').remove()"
        style="background:none;border:none;color:#554400;cursor:pointer;font-size:18px;">✕</button>
    </div>

    <div style="text-align:center;background:rgba(255,215,0,0.05);border:1px solid rgba(255,215,0,0.1);
      border-radius:16px;padding:20px;margin-bottom:16px;">
      <div style="font-size:48px;margin-bottom:6px;">${level.emoji}</div>
      <div style="font-family:'Rajdhani',sans-serif;font-size:22px;font-weight:700;
        color:var(--accent);letter-spacing:2px;">${level.name}</div>
      <div style="font-family:'Rajdhani',sans-serif;font-size:13px;color:#443300;margin-top:4px;">
        Level ${level.level} · ${totalXP} Total XP
      </div>
      ${next ? `
        <div style="margin-top:12px;background:rgba(255,215,0,0.08);border-radius:10px;height:8px;overflow:hidden;">
          <div style="height:100%;width:${Math.floor(((totalXP-level.xpNeeded)/(next.xpNeeded-level.xpNeeded))*100)}%;
            background:linear-gradient(90deg,var(--accent),#ff8c00);border-radius:10px;transition:width 0.5s;"></div>
        </div>
        <div style="font-size:11px;color:#332200;font-family:'Rajdhani',sans-serif;margin-top:5px;">
          ${next.xpNeeded - totalXP} XP until ${next.emoji} ${next.name}
        </div>` : `<div style="font-size:12px;color:var(--accent);margin-top:8px;font-family:'Rajdhani',sans-serif;">
          🔥 MAX LEVEL ACHIEVED</div>`}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
      ${statCard("🔥 Streak", streak + " days", "#f97316")}
      ${statCard("📊 Messages", (data.history||[]).filter(h=>h.type==="message").length, "#00ccff")}
      ${statCard("🎨 Images", (data.history||[]).filter(h=>h.type==="image").length, "#c084fc")}
      ${statCard("🎙️ Voice", (data.history||[]).filter(h=>h.type==="voice").length, "#00ff88")}
    </div>

    <div style="font-family:'Rajdhani',sans-serif;font-size:11px;letter-spacing:2px;
      color:#332200;margin-bottom:10px;">ALL LEVELS</div>
    <div style="display:flex;flex-direction:column;gap:6px;">
      ${XP_LEVELS.map(lvl => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;
          background:${totalXP>=lvl.xpNeeded?'rgba(255,215,0,0.06)':'rgba(0,0,0,0.2)'};
          border:1px solid ${totalXP>=lvl.xpNeeded?'rgba(255,215,0,0.15)':'rgba(255,255,255,0.03)'};
          border-radius:10px;">
          <span style="font-size:18px;">${lvl.emoji}</span>
          <div style="flex:1;">
            <div style="font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;
              color:${totalXP>=lvl.xpNeeded?'var(--accent)':'#332200'};">${lvl.name}</div>
          </div>
          <div style="font-family:'Rajdhani',sans-serif;font-size:10px;color:#332200;">
            ${lvl.xpNeeded} XP ${totalXP>=lvl.xpNeeded?'✓':''}
          </div>
        </div>
      `).join('')}
    </div>
  `
  document.body.appendChild(panel)
}

function statCard(label, value, color) {
  return `<div style="background:#0f0e00;border:1px solid rgba(255,215,0,0.07);
    border-radius:12px;padding:12px;text-align:center;">
    <div style="font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;
      color:${color};margin-bottom:2px;">${value}</div>
    <div style="font-family:'Rajdhani',sans-serif;font-size:10px;color:#332200;
      letter-spacing:1px;">${label}</div>
  </div>`
}

window.showXPPanel = showXPPanel
window.awardXP = awardXP

// ═══════════════════════════════════════════════════════════════
//  🧬 FEATURE 2: AI PERSONALITY EVOLUTION
// ═══════════════════════════════════════════════════════════════

function getPersonalityData() {
  try { return JSON.parse(localStorage.getItem("datta_personality") || "{}") }
  catch { return {} }
}

function savePersonalityData(data) {
  localStorage.setItem("datta_personality", JSON.stringify(data))
}

function trackMessage(text) {
  const data = getPersonalityData()
  data.totalMessages = (data.totalMessages || 0) + 1
  data.topics = data.topics || {}

  // Track topic interests
  const topicMap = {
    tech:     ["code","python","javascript","ai","machine","algorithm","bug","function","api","server"],
    creative: ["write","story","poem","art","design","create","imagine","generate","draw"],
    science:  ["science","physics","math","biology","space","quantum","theory","research"],
    business: ["business","startup","revenue","marketing","strategy","growth","product"],
    personal: ["help","feel","life","stress","happy","sad","love","friend","family","motivation"],
  }
  for (const [topic, keywords] of Object.entries(topicMap)) {
    if (keywords.some(k => text.toLowerCase().includes(k))) {
      data.topics[topic] = (data.topics[topic] || 0) + 1
    }
  }

  // Track preferred response style
  const isDetailedReq = /explain|elaborate|detail|tell me more|why|how does|what is/i.test(text)
  const isShortReq    = /tldr|quick|short|brief|just tell|summary/i.test(text)
  data.prefersDetail  = (data.prefersDetail || 0) + (isDetailedReq ? 1 : 0)
  data.prefersShort   = (data.prefersShort  || 0) + (isShortReq   ? 1 : 0)

  // Evolution milestones
  const msgs = data.totalMessages
  if      (msgs === 10)  showEvolutionBanner("Your AI is learning your style! 🌱", "#00ff88")
  else if (msgs === 50)  showEvolutionBanner("Datta AI has evolved — it knows you better now! ⚡", "#ffd700")
  else if (msgs === 100) showEvolutionBanner("100 messages! Datta AI is now personalised to you! 🧠", "#c084fc")
  else if (msgs === 500) showEvolutionBanner("500 messages! You have a truly evolved AI companion! 🔥", "#ff8c00")

  savePersonalityData(data)
}

// Returns evolved personality additions based on usage patterns
function getEvolvedPersonality() {
  const data = getPersonalityData()
  if (!data.totalMessages || data.totalMessages < 10) return ""

  const topics  = data.topics  || {}
  const topTopic = Object.entries(topics).sort((a,b)=>b[1]-a[1])[0]
  const prefDetail = (data.prefersDetail||0) > (data.prefersShort||0)

  let evolved = "\n[EVOLVED PERSONALITY - learned from user patterns]: "
  if (topTopic) evolved += `This user frequently discusses ${topTopic[0]} topics, so lean into that expertise. `
  if (prefDetail) evolved += "This user often wants detailed explanations. "
  else            evolved += "This user prefers concise answers. "
  if (data.totalMessages > 100) evolved += "You know this user well — be more personal and familiar in tone. "

  return evolved
}

function showEvolutionBanner(msg, color) {
  const b = document.createElement("div")
  b.style.cssText = `
    position:fixed;top:64px;left:50%;transform:translateX(-50%);
    background:#0f0e00;border:1px solid ${color}44;border-radius:50px;
    padding:10px 20px;z-index:9999;pointer-events:none;
    font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;
    letter-spacing:1px;color:${color};white-space:nowrap;
    box-shadow:0 4px 20px rgba(0,0,0,0.6);
    animation:evoIn 0.4s ease;
  `
  b.textContent = "🧬 " + msg
  const s = document.createElement("style")
  s.textContent = `@keyframes evoIn{from{opacity:0;top:74px}to{opacity:1;top:64px}}`
  document.head.appendChild(s)
  document.body.appendChild(b)
  setTimeout(() => { b.style.opacity="0"; b.style.transition="opacity 0.5s"; setTimeout(()=>b.remove(),500) }, 4000)
}

window.getEvolvedPersonality = getEvolvedPersonality
window.trackMessage = trackMessage

// ═══════════════════════════════════════════════════════════════
//  📅 FEATURE 3: SMART DAILY BRIEFING
// ═══════════════════════════════════════════════════════════════

async function showDailyBriefing() {
  // Skip briefing for new users with less than 5 messages
  const totalMsgs = (() => { 
    try { return JSON.parse(localStorage.getItem('datta_xp')||'{}').history?.length || 0 } 
    catch { return 0 } 
  })()
  if (totalMsgs < 5) return

  const today = new Date().toDateString()
  const lastShown = localStorage.getItem("datta_briefing_shown")
  if (lastShown === today) return // only once per day

  const hour = new Date().getHours()
  if (hour < 6 || hour > 22) return // don't show at night

  localStorage.setItem("datta_briefing_shown", today)

  const data = getXPData()
  const pData = getPersonalityData()
  const moodData = JSON.parse(localStorage.getItem("datta_mood_timeline") || "[]")

  // Predict today's mood
  const predicted = window.dattaPredictMood ? window.dattaPredictMood() : null
  const MOODS = window.MOODS || {}
  const predictedMood = predicted ? MOODS[predicted] : null

  // Top topic
  const topics = pData.topics || {}
  const topTopic = Object.entries(topics).sort((a,b)=>b[1]-a[1])[0]

  // Streak
  const streak = data.streak || 0
  const totalXP = data.totalXP || 0
  const level = getCurrentLevel(totalXP)

  // Time greeting
  const greetings = {
    morning:   "Good morning ☀️",
    afternoon: "Good afternoon 🌤️",
    evening:   "Good evening 🌙",
  }
  const timeKey = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"
  const greeting = greetings[timeKey]

  const overlay = document.createElement("div")
  overlay.id = "dailyBriefing"
  overlay.style.cssText = `
    position:fixed;top:0;left:0;right:0;bottom:0;
    background:rgba(0,0,0,0.8);z-index:10002;
    display:flex;align-items:center;justify-content:center;
    backdrop-filter:blur(8px);font-family:'DM Sans',sans-serif;
    animation:briefIn 0.4s ease;
  `

  overlay.innerHTML = `
    <style>@keyframes briefIn{from{opacity:0}to{opacity:1}}</style>
    <div style="background:#0a0900;border:1px solid rgba(255,215,0,0.2);
      border-radius:24px;padding:28px;width:min(400px,92vw);
      box-shadow:0 20px 60px rgba(0,0,0,0.9);position:relative;overflow:hidden;">

      <!-- BG GLOW -->
      <div style="position:absolute;top:-60px;right:-60px;width:200px;height:200px;
        background:radial-gradient(circle,rgba(255,215,0,0.06),transparent 70%);
        border-radius:50%;pointer-events:none;"></div>

      <!-- HEADER -->
      <div style="margin-bottom:20px;">
        <div style="font-family:'Rajdhani',sans-serif;font-size:11px;letter-spacing:3px;
          color:#443300;margin-bottom:4px;">
          ${new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"})}
        </div>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:26px;letter-spacing:3px;
          background:linear-gradient(90deg,#fff8e7,#ffd700);-webkit-background-clip:text;
          -webkit-text-fill-color:transparent;">${greeting}</div>
        <div style="font-size:13px;color:#665500;margin-top:4px;">Here's your daily briefing</div>
      </div>

      <!-- CARDS GRID -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">

        <!-- XP LEVEL -->
        <div style="background:rgba(255,215,0,0.05);border:1px solid rgba(255,215,0,0.12);
          border-radius:14px;padding:14px;">
          <div style="font-size:24px;margin-bottom:4px;">${level.emoji}</div>
          <div style="font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;
            color:var(--accent);">${level.name}</div>
          <div style="font-size:11px;color:#443300;font-family:'Rajdhani',sans-serif;">
            ${totalXP} XP total
          </div>
        </div>

        <!-- STREAK -->
        <div style="background:rgba(249,115,22,0.05);border:1px solid rgba(249,115,22,0.15);
          border-radius:14px;padding:14px;">
          <div style="font-size:24px;margin-bottom:4px;">🔥</div>
          <div style="font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;
            color:#f97316;">${streak} Day Streak</div>
          <div style="font-size:11px;color:#443300;font-family:'Rajdhani',sans-serif;">
            Keep it going!
          </div>
        </div>

        <!-- PREDICTED MOOD -->
        <div style="background:${predictedMood?predictedMood.bgGlow:'rgba(255,215,0,0.03)'};
          border:1px solid ${predictedMood?predictedMood.color+'33':'rgba(255,215,0,0.08)'};
          border-radius:14px;padding:14px;">
          <div style="font-size:24px;margin-bottom:4px;">${predictedMood?predictedMood.emoji:'🌟'}</div>
          <div style="font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;
            color:${predictedMood?predictedMood.color:'#ffd700'};">
            ${predictedMood?predictedMood.label+' day':'Open mind'}
          </div>
          <div style="font-size:11px;color:#443300;font-family:'Rajdhani',sans-serif;">
            Predicted mood
          </div>
        </div>

        <!-- TOP INTEREST -->
        <div style="background:rgba(192,132,252,0.05);border:1px solid rgba(192,132,252,0.15);
          border-radius:14px;padding:14px;">
          <div style="font-size:24px;margin-bottom:4px;">🎯</div>
          <div style="font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;
            color:#c084fc;">${topTopic ? topTopic[0].charAt(0).toUpperCase()+topTopic[0].slice(1) : "Explorer"}</div>
          <div style="font-size:11px;color:#443300;font-family:'Rajdhani',sans-serif;">
            Top interest
          </div>
        </div>
      </div>

      <!-- MOTIVATIONAL TIP -->
      <div style="background:rgba(255,215,0,0.04);border:1px solid rgba(255,215,0,0.1);
        border-radius:14px;padding:14px;margin-bottom:16px;">
        <div style="font-family:'Rajdhani',sans-serif;font-size:10px;letter-spacing:2px;
          color:#332200;margin-bottom:6px;">TODAY'S TIP</div>
        <div style="font-size:13px;color:#665500;line-height:1.6;">
          ${getDailyTip()}
        </div>
      </div>

      <!-- APPLY PREDICTED MOOD BUTTON -->
      ${predictedMood ? `
        <button onclick="applyMood('${predicted}');document.getElementById('dailyBriefing').remove();"
          style="width:100%;padding:12px;margin-bottom:10px;
          background:${predictedMood.bgGlow};border:1px solid ${predictedMood.color}44;
          border-radius:50px;color:${predictedMood.color};
          font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;
          letter-spacing:1px;cursor:pointer;">
          Apply ${predictedMood.emoji} ${predictedMood.label} Mode
        </button>` : ''}

      <button onclick="document.getElementById('dailyBriefing').remove()"
        style="width:100%;padding:11px;background:none;
        border:1px solid rgba(255,215,0,0.12);border-radius:50px;
        color:#443300;font-family:'Rajdhani',sans-serif;font-size:13px;
        letter-spacing:1px;cursor:pointer;">
        Let's go! 🚀
      </button>
    </div>
  `
  document.body.appendChild(overlay)
}

function getDailyTip() {
  const tips = [
    "Ask Datta AI to break down any big task into small steps — you'll feel less overwhelmed instantly.",
    "Try the Voice Assistant today — speaking your thoughts is often faster than typing.",
    "Use Creative mode when brainstorming — bold ideas come from bold prompts!",
    "Your mood affects your AI's tone. Set it before starting important conversations.",
    "The more you chat, the more Datta AI evolves and personalises to your style.",
    "Ask 'explain like I'm 5' for any complex topic — clarity is power.",
    "Use web search mode to get today's latest news, stock prices, or match scores.",
    "Generate images to visualise your ideas — a picture is worth a thousand prompts.",
    "Night Brain mode at 11 PM is perfect for deep thinking and creative writing.",
    "Your XP grows with every chat — check your level in the sidebar!",
  ]
  const idx = new Date().getDate() % tips.length
  return tips[idx]
}

window.showDailyBriefing = showDailyBriefing

// ═══════════════════════════════════════════════════════════════
//  🫂 FEATURE 4: EMOTIONAL SUPPORT MODE
// ═══════════════════════════════════════════════════════════════

const DISTRESS_KEYWORDS = [
  "i'm sad","i am sad","feeling down","depressed","anxious","can't sleep","cannot sleep",
  "stressed out","overwhelmed","crying","heartbreak","breakup","broke up","failed","failure",
  "i hate myself","hopeless","worthless","lonely","alone","nobody cares","give up","want to die",
  "end it","hurt myself","panic attack","scared","terrified","disaster","ruined","lost everything",
  "exam fail","job loss","fired","rejected","humiliated","embarrassed","ashamed"
]

const SUPPORT_RESPONSES = [
  "Hey, I noticed you might be going through something tough. I'm here for you. 💙",
  "That sounds really hard. Want to talk about it? I'm listening.",
  "You don't have to face this alone. I'm right here with you.",
]

function checkEmotionalDistress(text) {
  const lower = text.toLowerCase()
  const isDistressed = DISTRESS_KEYWORDS.some(kw => lower.includes(kw))
  if (!isDistressed) return false

  // Don't show if already in support mode
  if (window.dattaMoodPersonality && window.dattaMoodLabel === "Support") return false

  showEmotionalSupportPrompt()
  return true
}

function showEmotionalSupportPrompt() {
  const existing = document.getElementById("supportPrompt")
  if (existing) return

  const prompt = document.createElement("div")
  prompt.id = "supportPrompt"
  prompt.style.cssText = `
    position:fixed;bottom:90px;left:50%;transform:translateX(-50%);
    background:#0a0900;border:1px solid rgba(0,255,136,0.3);
    border-radius:18px;padding:16px 20px;z-index:9998;
    width:min(340px,90vw);box-shadow:0 12px 40px rgba(0,0,0,0.7);
    font-family:'DM Sans',sans-serif;animation:suppIn 0.4s ease;
  `
  prompt.innerHTML = `
    <style>@keyframes suppIn{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}</style>
    <div style="display:flex;align-items:flex-start;gap:12px;">
      <div style="font-size:26px;line-height:1;">🫂</div>
      <div style="flex:1;">
        <div style="font-family:'Rajdhani',sans-serif;font-size:14px;font-weight:700;
          letter-spacing:1px;color:#00ff88;margin-bottom:4px;">YOU SEEM STRESSED</div>
        <div style="font-size:12px;color:#443300;line-height:1.5;margin-bottom:10px;">
          Datta AI can switch to Emotional Support mode — calm, gentle, and focused on you.
        </div>
        <div style="display:flex;gap:8px;">
          <button onclick="activateSupportMode();document.getElementById('supportPrompt').remove();"
            style="flex:1;padding:8px;background:rgba(0,255,136,0.1);
            border:1px solid rgba(0,255,136,0.3);border-radius:50px;
            color:#00ff88;font-family:'Rajdhani',sans-serif;font-size:12px;
            font-weight:700;letter-spacing:1px;cursor:pointer;">
            🫂 Yes, support me
          </button>
          <button onclick="document.getElementById('supportPrompt').remove();"
            style="padding:8px 14px;background:none;
            border:1px solid rgba(255,215,0,0.1);border-radius:50px;
            color:#443300;font-family:'Rajdhani',sans-serif;font-size:12px;cursor:pointer;">
            I'm ok
          </button>
        </div>
      </div>
    </div>
  `
  document.body.appendChild(prompt)
  setTimeout(() => { if (prompt.parentNode) prompt.remove() }, 12000)
}

function activateSupportMode() {
  // Inject custom support personality
  window.dattaMoodPersonality = `You are in EMOTIONAL SUPPORT mode. The user is going through a tough time.
  Be extremely warm, gentle, and empathetic. Acknowledge their feelings before anything else.
  Never rush to solutions. Ask one caring question at a time.
  Use a soft, reassuring tone. Remind them they are not alone.
  If they seem in crisis, gently suggest speaking to a trusted person or counsellor.
  Keep responses short and heartfelt — no bullet points, no lists.`
  window.dattaMoodEmoji = "🫂"
  window.dattaMoodLabel = "Support"

  // Update topbar indicator
  const indicator = document.getElementById("moodIndicator")
  if (indicator) {
    indicator.textContent = "🫂 Support"
    indicator.style.color = "#00ff88"
    indicator.style.borderColor = "rgba(0,255,136,0.4)"
    indicator.style.background = "rgba(0,255,136,0.08)"
    indicator.style.display = "flex"
  }

  // Show breathing exercise card
  showBreathingExercise()
  awardXP("mood")
}

function showBreathingExercise() {
  const card = document.createElement("div")
  card.style.cssText = `
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    background:#0a0900;border:1px solid rgba(0,255,136,0.2);
    border-radius:20px;padding:28px;z-index:10000;
    width:min(320px,88vw);text-align:center;
    box-shadow:0 20px 60px rgba(0,0,0,0.8);
    font-family:'DM Sans',sans-serif;
  `

  let phase = 0
  const phases = [
    { text: "Breathe in...",  duration: 4000, color: "#00ff88" },
    { text: "Hold...",        duration: 4000, color: "#ffd700" },
    { text: "Breathe out...", duration: 4000, color: "#00ccff" },
  ]
  let interval = null

  card.innerHTML = `
    <div style="font-size:13px;font-family:'Rajdhani',sans-serif;letter-spacing:2px;
      color:#443300;margin-bottom:16px;">TAKE A BREATH</div>
    <div id="breathOrb" style="width:80px;height:80px;border-radius:50%;
      background:rgba(0,255,136,0.15);border:2px solid rgba(0,255,136,0.4);
      margin:0 auto 16px;display:flex;align-items:center;justify-content:center;
      font-size:32px;transition:all 1s ease;">🌿</div>
    <div id="breathText" style="font-family:'Rajdhani',sans-serif;font-size:18px;
      font-weight:700;letter-spacing:2px;color:#00ff88;margin-bottom:20px;">
      Breathe in...
    </div>
    <button onclick="clearInterval(arguments[0]||window._breathInterval);this.closest('div[style]').remove()"
      style="padding:10px 24px;background:none;border:1px solid rgba(0,255,136,0.2);
      border-radius:50px;color:#00ff88;font-family:'Rajdhani',sans-serif;
      font-size:12px;letter-spacing:1px;cursor:pointer;">
      I feel better ✓
    </button>
  `
  document.body.appendChild(card)

  function nextPhase() {
    const p = phases[phase % 3]
    const orb = card.querySelector("#breathOrb")
    const txt = card.querySelector("#breathText")
    if (!orb || !txt) { clearInterval(interval); return }
    txt.textContent = p.text
    txt.style.color = p.color
    orb.style.background = p.color + "22"
    orb.style.borderColor = p.color + "66"
    orb.style.transform = phase % 3 === 0 ? "scale(1.3)" : phase % 3 === 2 ? "scale(0.8)" : "scale(1.1)"
    phase++
  }

  nextPhase()
  interval = setInterval(nextPhase, 4000)
  window._breathInterval = interval
  setTimeout(() => { clearInterval(interval); if (card.parentNode) card.remove() }, 30000)
}

window.activateSupportMode = activateSupportMode
window.checkEmotionalDistress = checkEmotionalDistress
window.showBreathingExercise = showBreathingExercise

// ═══════════════════════════════════════════════════════════════
//  HOOK INTO EXISTING CHAT SEND
// ═══════════════════════════════════════════════════════════════

// Intercept send() to track XP, personality, distress
const _originalSend = window.send
window.send = async function() {
  const input = document.getElementById("message")
  const text = input ? input.value.trim() : ""

  if (text) {
    // Track for personality evolution
    trackMessage(text)

    // Check emotional distress
    checkEmotionalDistress(text)

    // Award XP
    const isImage  = ["generate image","create image","draw","generate photo","make image"].some(t => text.toLowerCase().includes(t))
    const isSearch = ["latest","today","search for","find","news","weather"].some(t => text.toLowerCase().includes(t))
    const isDetail = ["explain","elaborate","in detail","tell me more","say more"].some(t => text.toLowerCase().includes(t))

    if (isImage)       awardXP("image")
    else if (isSearch) awardXP("search")
    else if (isDetail) awardXP("elaborate")
    else               awardXP("message")
  }

  if (_originalSend) return _originalSend.apply(this, arguments)
}

// Hook into applyMood for XP
const _originalApplyMood = window.applyMood
window.applyMood = function(moodKey, save, isAuto) {
  if (!isAuto) awardXP("mood")
  if (_originalApplyMood) return _originalApplyMood.apply(this, arguments)
}

// Hook into voice for XP
const _originalOpenVoice = window.openVoiceAssistant
window.openVoiceAssistant = function() {
  awardXP("voice")
  if (_originalOpenVoice) return _originalOpenVoice.apply(this, arguments)
}

// Also patch buildMoodPrefix in chat.js to include evolved personality
const _originalBuildMoodPrefix = window.buildMoodPrefix
window.buildMoodPrefix = function() {
  const base = _originalBuildMoodPrefix ? _originalBuildMoodPrefix() : ""
  const evolved = getEvolvedPersonality()
  return base + evolved
}

// ═══════════════════════════════════════════════════════════════
//  INIT — Run everything on load
// ═══════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", function() {
  // XP bar in sidebar
  setTimeout(updateXPBar, 500)

  // Daily briefing (after 2s so page loads first)
  setTimeout(showDailyBriefing, 2000)

  // Streak check
  checkStreak()
})
