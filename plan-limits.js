// ── DATTA AI PLAN LIMITS ENFORCEMENT ─────────────────────────────────────────

const PLAN_LIMITS = {
  arambh: {
    msgsPerHour: 50,
    cooldownMins: 60,
    imagesPerDay: 3,
    moodSystem: false,
    fileUpload: false,
    smartMemory: false,
  },
  shakti: {
    msgsPerHour: 150,
    cooldownMins: 45,
    imagesPerDay: 10,
    moodSystem: true,
    fileUpload: false,
    smartMemory: true,
  },
  agni: {
    msgsPerHour: 500,
    cooldownMins: 30,
    imagesPerDay: 20,
    moodSystem: true,
    fileUpload: true,
    smartMemory: true,
  },
  brahma: {
    msgsPerHour: 1000,
    cooldownMins: 15,
    imagesPerDay: 100,
    moodSystem: true,
    fileUpload: true,
    smartMemory: true,
  },
  free: {
    msgsPerHour: 50,
    cooldownMins: 60,
    imagesPerDay: 3,
    moodSystem: false,
    fileUpload: false,
    smartMemory: false,
  }
}

function getUserPlan() {
  return localStorage.getItem('datta_plan') || 'free'
}

function getPlanLimits() {
  const plan = getUserPlan()
  return PLAN_LIMITS[plan] || PLAN_LIMITS['free']
}

// ── MESSAGE LIMIT ─────────────────────────────────
function getMessageUsage() {
  try {
    return JSON.parse(localStorage.getItem('datta_msg_usage') || '{"count":0,"windowStart":0}')
  } catch { return { count: 0, windowStart: 0 } }
}

function canSendMessage() {
  const limits = getPlanLimits()
  const usage = getMessageUsage()
  const now = Date.now()
  const windowMs = limits.cooldownMins * 60 * 1000

  // Reset window if cooldown passed
  if (now - usage.windowStart > windowMs) {
    localStorage.setItem('datta_msg_usage', JSON.stringify({ count: 0, windowStart: now }))
    return { allowed: true, remaining: limits.msgsPerHour }
  }

  if (usage.count >= limits.msgsPerHour) {
    const resetIn = Math.ceil((usage.windowStart + windowMs - now) / 60000)
    return {
      allowed: false,
      remaining: 0,
      resetInMins: resetIn,
      limit: limits.msgsPerHour,
      cooldown: limits.cooldownMins
    }
  }

  return { allowed: true, remaining: limits.msgsPerHour - usage.count }
}

function recordMessage() {
  const usage = getMessageUsage()
  const now = Date.now()
  const limits = getPlanLimits()
  const windowMs = limits.cooldownMins * 60 * 1000

  if (now - usage.windowStart > windowMs) {
    localStorage.setItem('datta_msg_usage', JSON.stringify({ count: 1, windowStart: now }))
  } else {
    localStorage.setItem('datta_msg_usage', JSON.stringify({
      count: usage.count + 1,
      windowStart: usage.windowStart
    }))
  }
}

// ── IMAGE LIMIT ───────────────────────────────────
function getImageUsage() {
  try {
    return JSON.parse(localStorage.getItem('datta_img_usage') || '{"count":0,"date":""}')
  } catch { return { count: 0, date: '' } }
}

function canGenerateImage() {
  const limits = getPlanLimits()
  const usage = getImageUsage()
  const today = new Date().toDateString()

  if (usage.date !== today) {
    localStorage.setItem('datta_img_usage', JSON.stringify({ count: 0, date: today }))
    return { allowed: true, remaining: limits.imagesPerDay }
  }

  if (usage.count >= limits.imagesPerDay) {
    return { allowed: false, remaining: 0, limit: limits.imagesPerDay }
  }

  return { allowed: true, remaining: limits.imagesPerDay - usage.count }
}

function recordImage() {
  const usage = getImageUsage()
  const today = new Date().toDateString()
  const count = usage.date === today ? usage.count + 1 : 1
  localStorage.setItem('datta_img_usage', JSON.stringify({ count, date: today }))
}

// ── MOOD SYSTEM CHECK ─────────────────────────────
function canUseMood() {
  return getPlanLimits().moodSystem
}

function canUploadFile() {
  return getPlanLimits().fileUpload
}

function canUseMemory() {
  return getPlanLimits().smartMemory
}

// ── UPGRADE POPUP ─────────────────────────────────
function showUpgradePopup(reason, details) {
  // Remove existing popup
  document.getElementById('upgradePopup')?.remove()

  const plan = getUserPlan()
  const limits = getPlanLimits()

  const popup = document.createElement('div')
  popup.id = 'upgradePopup'
  popup.style.cssText = `
    position:fixed;top:0;left:0;right:0;bottom:0;
    background:rgba(0,0,0,0.85);z-index:99999;
    display:flex;align-items:center;justify-content:center;
    backdrop-filter:blur(8px);animation:fadeIn 0.2s ease;
  `

  const messages = {
    msgLimit: `You've used all <b>${limits.msgsPerHour} messages</b> this hour.<br>Wait <b>${details?.resetInMins || limits.cooldownMins} minutes</b> or upgrade for more!`,
    imgLimit: `You've used all <b>${limits.imagesPerDay} images</b> today.<br>Resets at midnight or upgrade for more!`,
    mood: `Mood-based AI is a <b>Shakti</b> feature.<br>Upgrade to unlock mood system!`,
    fileUpload: `File upload is an <b>Agni</b> feature.<br>Upgrade to upload files!`,
    memory: `Smart Memory is a <b>Shakti</b> feature.<br>Upgrade to enable it!`,
  }

  popup.innerHTML = `
    <div style="background:#0d0c00;border:1px solid rgba(255,215,0,0.2);border-radius:24px;padding:28px 24px;max-width:340px;width:90%;text-align:center;">
      <div style="font-size:48px;margin-bottom:12px">${reason === 'msgLimit' ? '⏱️' : reason === 'imgLimit' ? '🎨' : '👑'}</div>
      <div style="font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:3px;color:#ffd700;margin-bottom:10px;">
        ${reason === 'msgLimit' ? 'MESSAGE LIMIT REACHED' : reason === 'imgLimit' ? 'IMAGE LIMIT REACHED' : 'UPGRADE REQUIRED'}
      </div>
      <div style="font-size:13px;color:#665500;line-height:1.7;margin-bottom:20px;">
        ${messages[reason] || 'Upgrade your plan to continue.'}
      </div>
      
      <!-- Current plan info -->
      <div style="background:rgba(255,215,0,0.05);border:1px solid rgba(255,215,0,0.1);border-radius:12px;padding:10px;margin-bottom:16px;">
        <div style="font-family:'Rajdhani',sans-serif;font-size:10px;letter-spacing:2px;color:#443300;margin-bottom:6px;">YOUR PLAN</div>
        <div style="font-size:13px;color:#665500;">${plan.toUpperCase()} · ${limits.msgsPerHour} msg/hr · ${limits.imagesPerDay} img/day</div>
      </div>

      <button onclick="window.location.href='pricing.html'" style="
        width:100%;padding:13px;
        background:linear-gradient(135deg,#ffd700,#ff8c00);
        border:none;border-radius:50px;color:#000;
        font-family:'Rajdhani',sans-serif;font-size:14px;
        font-weight:700;letter-spacing:2px;cursor:pointer;margin-bottom:10px;
      ">👑 UPGRADE PLAN</button>
      
      <button onclick="document.getElementById('upgradePopup').remove()" style="
        width:100%;padding:10px;background:none;
        border:1px solid rgba(255,215,0,0.1);border-radius:50px;
        color:#554400;font-family:'Rajdhani',sans-serif;
        font-size:13px;letter-spacing:1px;cursor:pointer;
      ">${reason === 'msgLimit' ? `Wait ${details?.resetInMins || limits.cooldownMins} mins` : 'Maybe later'}</button>
    </div>
  `

  document.body.appendChild(popup)
}

// ── APPLY MOOD RESTRICTIONS ───────────────────────
function applyPlanRestrictions() {
  const limits = getPlanLimits()

  // Hide mood button for Arambh
  const moodBtn = document.getElementById('moodToggleBtn')
  const moodIndicator = document.getElementById('moodIndicator')
  const autoMoodPill = document.getElementById('autoMoodPill')

  if (!limits.moodSystem) {
    if (moodBtn) {
      moodBtn.title = 'Upgrade to Shakti to unlock mood system'
      moodBtn.onclick = function(e) {
        e.preventDefault()
        e.stopPropagation()
        showUpgradePopup('mood')
      }
      moodBtn.style.opacity = '0.4'
    }
    if (moodIndicator) moodIndicator.style.display = 'none'
    if (autoMoodPill) autoMoodPill.style.display = 'none'
  }

  // Hide file upload for Arambh & Shakti
  if (!limits.fileUpload) {
    const fileItems = document.querySelectorAll('[onclick*="triggerFile"], [onclick*="triggerCamera"], [onclick*="triggerPhotos"]')
    fileItems.forEach(el => {
      el.style.opacity = '0.4'
      el.title = 'Upgrade to Agni to unlock file upload'
      el.onclick = function(e) {
        e.preventDefault()
        showUpgradePopup('fileUpload')
      }
    })
  }
}

// ── SHOW LIMIT COUNTER IN TOPBAR ──────────────────
function updateLimitDisplay() {
  const check = canSendMessage()
  const limits = getPlanLimits()

  // Add/update limit pill in topbar if near limit
  let pill = document.getElementById('msgLimitPill')
  if (!pill) {
    pill = document.createElement('div')
    pill.id = 'msgLimitPill'
    pill.style.cssText = 'font-family:Rajdhani,sans-serif;font-size:10px;letter-spacing:1px;padding:3px 8px;border-radius:20px;cursor:default;'
    const topbar = document.querySelector('.topbar')
    if (topbar) topbar.insertBefore(pill, topbar.firstChild.nextSibling)
  }

  if (!check.allowed) {
    pill.textContent = `⏱️ ${check.resetInMins}m`
    pill.style.background = 'rgba(255,60,60,0.12)'
    pill.style.border = '1px solid rgba(255,60,60,0.2)'
    pill.style.color = '#ff4444'
  } else if (check.remaining <= 10) {
    pill.textContent = `💬 ${check.remaining} left`
    pill.style.background = 'rgba(255,140,0,0.1)'
    pill.style.border = '1px solid rgba(255,140,0,0.2)'
    pill.style.color = '#ff8c00'
    pill.style.display = 'block'
  } else {
    pill.style.display = 'none'
  }
}

// ── EXPORTS ───────────────────────────────────────
window.canSendMessage = canSendMessage
window.recordMessage = recordMessage
window.canGenerateImage = canGenerateImage
window.recordImage = recordImage
window.canUseMood = canUseMood
window.canUploadFile = canUploadFile
window.canUseMemory = canUseMemory
window.showUpgradePopup = showUpgradePopup
window.getPlanLimits = getPlanLimits
window.getUserPlan = getUserPlan
window.applyPlanRestrictions = applyPlanRestrictions
window.updateLimitDisplay = updateLimitDisplay

// Auto-apply on load
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(() => {
    applyPlanRestrictions()
    updateLimitDisplay()
    setInterval(updateLimitDisplay, 30000) // update every 30s
  }, 1000)
})
