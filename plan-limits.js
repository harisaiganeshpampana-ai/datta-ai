// ── DATTA AI PLAN ENFORCEMENT ────────────────────────────────────────────────

// ── CREATOR BYPASS ───────────────────────────────
const CREATOR_ACCOUNTS = ['pampana_hari_sai_ganesh','harisaiganesh','ganesh','admin','creator','dattaai']

function isCreator() {
  try {
    const user = JSON.parse(localStorage.getItem('datta_user') || '{}')
    const username = (user.username || '').toLowerCase().trim()
    return CREATOR_ACCOUNTS.some(c => username.includes(c.toLowerCase())) ||
           localStorage.getItem('datta_is_creator') === 'true'
  } catch { return false }
}

// ── PLAN DEFINITIONS ─────────────────────────────
const PLANS = {
  free:    { msgs:50, cooldown:60, imgs:3,   mood:false, voice:false, memory:false, upload:false, translate:false, analytics:false, briefing:false, xp:false },
  arambh:  { msgs:50, cooldown:60, imgs:3,   mood:false, voice:false, memory:false, upload:false, translate:false, analytics:false, briefing:false, xp:false },
  shakti:  { msgs:150,cooldown:45, imgs:10,  mood:true,  voice:true,  memory:true,  upload:false, translate:true,  analytics:true,  briefing:true,  xp:true  },
  agni:    { msgs:500,cooldown:30, imgs:20,  mood:true,  voice:true,  memory:true,  upload:true,  translate:true,  analytics:true,  briefing:true,  xp:true  },
  brahma:  { msgs:1000,cooldown:15,imgs:100, mood:true,  voice:true,  memory:true,  upload:true,  translate:true,  analytics:true,  briefing:true,  xp:true  },
}

function getPlan() {
  if (isCreator()) return PLANS.brahma
  const p = localStorage.getItem('datta_plan') || 'free'
  return PLANS[p] || PLANS.free
}

function getPlanName() {
  if (isCreator()) return 'brahma'
  return localStorage.getItem('datta_plan') || 'free'
}

// ── MESSAGE LIMIT ─────────────────────────────────
function canSendMessage() {
  if (isCreator()) return { allowed:true, remaining:9999 }
  const plan = getPlan()
  try {
    let usage = JSON.parse(localStorage.getItem('datta_msg_usage') || '{"count":0,"start":0}')
    const now = Date.now()
    const windowMs = plan.cooldown * 60 * 1000
    if (now - usage.start > windowMs) {
      usage = { count:0, start:now }
      localStorage.setItem('datta_msg_usage', JSON.stringify(usage))
    }
    if (usage.count >= plan.msgs) {
      return { allowed:false, remaining:0, resetInMins: Math.ceil((usage.start + windowMs - now)/60000) }
    }
    return { allowed:true, remaining: plan.msgs - usage.count }
  } catch { return { allowed:true, remaining:50 } }
}

function recordMessage() {
  if (isCreator()) return
  try {
    const plan = getPlan()
    let usage = JSON.parse(localStorage.getItem('datta_msg_usage') || '{"count":0,"start":0}')
    const now = Date.now()
    if (now - usage.start > plan.cooldown * 60 * 1000) usage = { count:1, start:now }
    else usage.count++
    localStorage.setItem('datta_msg_usage', JSON.stringify(usage))
  } catch {}
}

// ── IMAGE LIMIT ───────────────────────────────────
function canGenerateImage() {
  if (isCreator()) return { allowed:true, remaining:9999 }
  const plan = getPlan()
  try {
    let usage = JSON.parse(localStorage.getItem('datta_img_usage') || '{"count":0,"date":""}')
    const today = new Date().toDateString()
    if (usage.date !== today) usage = { count:0, date:today }
    if (usage.count >= plan.imgs) return { allowed:false, remaining:0, limit:plan.imgs }
    return { allowed:true, remaining: plan.imgs - usage.count }
  } catch { return { allowed:true, remaining:3 } }
}

function recordImage() {
  if (isCreator()) return
  try {
    let usage = JSON.parse(localStorage.getItem('datta_img_usage') || '{"count":0,"date":""}')
    const today = new Date().toDateString()
    if (usage.date !== today) usage = { count:1, date:today }
    else usage.count++
    localStorage.setItem('datta_img_usage', JSON.stringify(usage))
  } catch {}
}

// ── FEATURE CHECKS ────────────────────────────────
function canUseMood()      { return isCreator() || getPlan().mood }
function canUseVoice()     { return isCreator() || getPlan().voice }
function canUseMemory()    { return isCreator() || getPlan().memory }
function canUploadFile()   { return isCreator() || getPlan().upload }
function canUseTranslate() { return isCreator() || getPlan().translate }
function canUseAnalytics() { return isCreator() || getPlan().analytics }

// ── UPGRADE POPUP ─────────────────────────────────
function showUpgradePopup(reason, details) {
  document.getElementById('upgradePopup')?.remove()
  const plan = getPlanName()
  const msgs = {
    msgLimit: `You have used all messages for this hour.<br>Wait <b>${details?.resetInMins || 60} minutes</b> or upgrade!`,
    imgLimit: `You have used all <b>${getPlan().imgs} images</b> for today.<br>Upgrade for more!`,
    mood:     `Mood-based AI unlocks from <b>Shakti plan</b>.<br>Upgrade to unlock!`,
    voice:    `Voice assistant unlocks from <b>Shakti plan</b>.<br>Upgrade to unlock!`,
    memory:   `Smart Memory unlocks from <b>Shakti plan</b>.<br>Upgrade to unlock!`,
    upload:   `File upload unlocks from <b>Agni plan</b>.<br>Upgrade to unlock!`,
    translate:`Translator unlocks from <b>Shakti plan</b>.<br>Upgrade to unlock!`,
  }
  const popup = document.createElement('div')
  popup.id = 'upgradePopup'
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);'
  popup.innerHTML = `
    <div style="background:#0d0c00;border:1px solid rgba(255,215,0,0.2);border-radius:20px;padding:28px 24px;max-width:320px;width:90%;text-align:center;">
      <div style="font-size:44px;margin-bottom:10px">${reason==='msgLimit'?'⏱️':reason==='imgLimit'?'🎨':'👑'}</div>
      <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:2px;color:#ffd700;margin-bottom:10px">
        ${reason==='msgLimit'?'LIMIT REACHED':reason==='imgLimit'?'IMAGE LIMIT':'UPGRADE REQUIRED'}
      </div>
      <div style="font-size:13px;color:#665500;line-height:1.7;margin-bottom:20px">${msgs[reason]||'Upgrade to access this feature.'}</div>
      <div style="background:rgba(255,215,0,0.05);border:1px solid rgba(255,215,0,0.1);border-radius:10px;padding:10px;margin-bottom:16px;font-size:12px;color:#554400;">
        Current plan: <b style="color:var(--accent)">${plan.toUpperCase()}</b>
      </div>
      <button onclick="window.location.href='pricing.html'" style="width:100%;padding:13px;background:linear-gradient(135deg,#ffd700,#ff8c00);border:none;border-radius:50px;color:#000;font-family:'Rajdhani',sans-serif;font-size:14px;font-weight:700;letter-spacing:2px;cursor:pointer;margin-bottom:10px;">👑 UPGRADE NOW</button>
      <button onclick="document.getElementById('upgradePopup').remove()" style="width:100%;padding:10px;background:none;border:1px solid rgba(255,215,0,0.1);border-radius:50px;color:#554400;font-family:'Rajdhani',sans-serif;font-size:13px;cursor:pointer;">${reason==='msgLimit'?'Wait ' + (details?.resetInMins||60) + ' mins':'Maybe later'}</button>
    </div>`
  document.body.appendChild(popup)
  popup.onclick = e => { if(e.target===popup) popup.remove() }
}

// ── APPLY ALL RESTRICTIONS ────────────────────────
function applyPlanRestrictions() {
  if (isCreator()) {
    localStorage.setItem('datta_plan','brahma')
    localStorage.setItem('datta_is_creator','true')
    console.log('👑 Creator mode active - unlimited access')
    return
  }

  const plan = getPlan()
  const planName = getPlanName()

  // 1. Mood button
  const moodBtn = document.getElementById('moodToggleBtn')
  if (moodBtn && !plan.mood) {
    moodBtn.style.opacity = '0.4'
    moodBtn.style.cursor = 'not-allowed'
    moodBtn.title = 'Upgrade to Shakti to unlock mood'
    moodBtn.onclick = e => { e.preventDefault(); e.stopPropagation(); showUpgradePopup('mood') }
  }

  // 2. Mood indicator - hide for free
  if (!plan.mood) {
    const mi = document.getElementById('moodIndicator')
    const ap = document.getElementById('autoMoodPill')
    if (mi) mi.style.display = 'none'
    if (ap) ap.style.display = 'none'
  }

  // 3. Voice button
  const micBtn = document.getElementById('micBtn')
  if (micBtn && !plan.voice) {
    micBtn.style.opacity = '0.4'
    micBtn.onclick = e => { e.preventDefault(); showUpgradePopup('voice') }
  }

  // 4. File upload buttons
  if (!plan.upload) {
    document.querySelectorAll('[onclick*="triggerFile"],[onclick*="triggerCamera"],[onclick*="triggerPhotos"]').forEach(el => {
      el.style.opacity = '0.4'
      el.onclick = e => { e.preventDefault(); showUpgradePopup('upload') }
    })
  }

  // 5. Show lock on sidebar links for locked features
  const locks = {
    'memory.html': plan.memory,
    'translator.html': plan.translate,
    'analytics.html': plan.analytics,
  }
  document.querySelectorAll('[onclick*="window.location.href"]').forEach(el => {
    const href = el.getAttribute('onclick') || ''
    for (const [page, allowed] of Object.entries(locks)) {
      if (href.includes(page) && !allowed) {
        el.style.opacity = '0.5'
        el.innerHTML = el.innerHTML + ' 🔒'
        el.onclick = e => { e.preventDefault(); showUpgradePopup('translate') }
      }
    }
  })

  // 6. Update limit counter
  updateLimitDisplay()
}

// ── LIMIT COUNTER IN TOPBAR ───────────────────────
function updateLimitDisplay() {
  if (isCreator()) return
  const check = canSendMessage()
  const plan = getPlan()
  let pill = document.getElementById('msgLimitPill')
  if (!pill) {
    pill = document.createElement('div')
    pill.id = 'msgLimitPill'
    pill.style.cssText = 'font-family:Rajdhani,sans-serif;font-size:10px;letter-spacing:1px;padding:3px 8px;border-radius:20px;cursor:default;flex-shrink:0;'
    const topbar = document.querySelector('.topbar')
    if (topbar) topbar.insertBefore(pill, topbar.children[2])
  }
  if (!check.allowed) {
    pill.textContent = '⏱️ ' + check.resetInMins + 'm'
    pill.style.cssText += 'background:rgba(255,60,60,0.12);border:1px solid rgba(255,60,60,0.2);color:#ff4444;display:block;'
  } else if (check.remaining <= 10) {
    pill.textContent = '💬 ' + check.remaining + ' left'
    pill.style.cssText += 'background:rgba(255,140,0,0.1);border:1px solid rgba(255,140,0,0.2);color:#ff8c00;display:block;'
  } else {
    pill.style.display = 'none'
  }
}

// ── EXPORTS ───────────────────────────────────────
window.isCreator = isCreator
window.getPlan = getPlan
window.getPlanName = getPlanName
window.canSendMessage = canSendMessage
window.recordMessage = recordMessage
window.canGenerateImage = canGenerateImage
window.recordImage = recordImage
window.canUseMood = canUseMood
window.canUseVoice = canUseVoice
window.canUseMemory = canUseMemory
window.canUploadFile = canUploadFile
window.canUseTranslate = canUseTranslate
window.canUseAnalytics = canUseAnalytics
window.showUpgradePopup = showUpgradePopup
window.applyPlanRestrictions = applyPlanRestrictions
window.updateLimitDisplay = updateLimitDisplay

// ── AUTO APPLY ON LOAD ────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(applyPlanRestrictions, 800)
  setInterval(updateLimitDisplay, 30000)
})
