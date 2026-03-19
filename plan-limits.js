A// ╔══════════════════════════════════════════════════════════╗
// ║         DATTA AI — plan-limits.js  v2 (COMPLETE)        ║
// ║  Exact rules from pricing.html — enforced everywhere    ║
// ╚══════════════════════════════════════════════════════════╝

// ── EXACT PLAN FEATURES (copied from pricing.html) ────────
const PLAN_FEATURES = {
  arambh: {
    aiChat:              true,   // basic
    webSearch:           true,
    liveFeed:            true,
    voiceAssistant:      true,   // confirmed by owner
    moodAI:              false,
    imageGen:            false,
    fileUpload:          false,
    smartMemory:         false,
    analytics:           false,
    dailyBriefing:       false,
    translator:          false,
    emotionalSupport:    false,
    xpGamification:      false,
    selfieMood:          false,
    personalityEvolution:false,
    prioritySupport:     false,
    earlyAccess:         false,
    vipSupport:          false,
    customPersonality:   false,
    whiteLabel:          false,
    apiAccess:           false,
  },
  shakti: {
    aiChat:              true,
    webSearch:           true,
    liveFeed:            true,
    voiceAssistant:      true,
    moodAI:              true,
    imageGen:            true,
    fileUpload:          false,
    smartMemory:         true,
    analytics:           true,
    dailyBriefing:       true,
    translator:          true,
    emotionalSupport:    true,
    xpGamification:      true,
    selfieMood:          false,
    personalityEvolution:false,
    prioritySupport:     false,
    earlyAccess:         false,
    vipSupport:          false,
    customPersonality:   false,
    whiteLabel:          false,
    apiAccess:           false,
  },
  agni: {
    aiChat:              true,
    webSearch:           true,
    liveFeed:            true,
    voiceAssistant:      true,
    moodAI:              true,
    imageGen:            true,
    fileUpload:          true,
    smartMemory:         true,
    analytics:           true,
    dailyBriefing:       true,
    translator:          true,
    emotionalSupport:    true,
    xpGamification:      true,
    selfieMood:          true,
    personalityEvolution:true,
    prioritySupport:     true,
    earlyAccess:         true,
    vipSupport:          false,
    customPersonality:   false,
    whiteLabel:          false,
    apiAccess:           false,
  },
  brahma: {
    aiChat:              true,
    webSearch:           true,
    liveFeed:            true,
    voiceAssistant:      true,
    moodAI:              true,
    imageGen:            true,
    fileUpload:          true,
    smartMemory:         true,
    analytics:           true,
    dailyBriefing:       true,
    translator:          true,
    emotionalSupport:    true,
    xpGamification:      true,
    selfieMood:          true,
    personalityEvolution:true,
    prioritySupport:     true,
    earlyAccess:         true,
    vipSupport:          true,
    customPersonality:   true,
    whiteLabel:          true,
    apiAccess:           true,
  }
};

// Plan limits
const PLAN_LIMITS = {
  arambh: { msgsPerHr: 50,   cooldownMin: 60, imagesPerDay: 3   },
  shakti: { msgsPerHr: 150,  cooldownMin: 45, imagesPerDay: 10  },
  agni:   { msgsPerHr: 500,  cooldownMin: 30, imagesPerDay: 20  },
  brahma: { msgsPerHr: 1000, cooldownMin: 15, imagesPerDay: 100 },
};

// Feature display names for upgrade modal
const FEATURE_NAMES = {
  moodAI:              '😊 Mood-based AI',
  imageGen:            '🎨 Image Generation',
  fileUpload:          '📎 File Upload',
  smartMemory:         '🧾 Smart Memory',
  analytics:           '📊 Analytics',
  dailyBriefing:       '📅 Daily Briefing',
  translator:          '🌍 Translator',
  emotionalSupport:    '🫂 Emotional Support',
  xpGamification:      '🎮 XP Gamification',
  selfieMood:          '📸 Selfie Mood Detection',
  personalityEvolution:'🧬 AI Personality Evolution',
  vipSupport:          '👑 VIP Support 24/7',
  customPersonality:   '🤖 Custom AI Personality',
  whiteLabel:          '🏷️ White-label Option',
  apiAccess:           '🔌 API Access',
};

// Which plan unlocks each feature
const FEATURE_UNLOCK_PLAN = {
  moodAI:              'shakti',
  imageGen:            'shakti',
  voiceAssistant:      'arambh',
  fileUpload:          'agni',
  smartMemory:         'shakti',
  analytics:           'shakti',
  dailyBriefing:       'shakti',
  translator:          'shakti',
  emotionalSupport:    'shakti',
  xpGamification:      'shakti',
  selfieMood:          'agni',
  personalityEvolution:'agni',
  vipSupport:          'brahma',
  customPersonality:   'brahma',
  whiteLabel:          'brahma',
  apiAccess:           'brahma',
};

const PLAN_DISPLAY = {
  arambh: { name:'Arambh', emoji:'🌱', price:'FREE',     color:'#00ff88' },
  shakti: { name:'Shakti', emoji:'⚡', price:'₹249/mo',  color:'#ffd700' },
  agni:   { name:'Agni',   emoji:'🔥', price:'₹599/mo',  color:'#ff8c00' },
  brahma: { name:'Brahma', emoji:'👑', price:'₹1199/mo', color:'#c084fc' },
};

// ── CORE HELPERS ───────────────────────────────────────
function getPlanKey() {
  const k = localStorage.getItem('datta_plan') || 'arambh';
  return PLAN_FEATURES[k] ? k : 'arambh';
}

function isCreator() {
  try {
    const u = (JSON.parse(localStorage.getItem('datta_user')||'{}').username||'').toLowerCase();
    return ['pampana_hari_sai_ganesh','harisaiganesh','ganesh','admin','creator','dattaai'].some(c=>u.includes(c));
  } catch(e) { return false; }
}

function canUseFeature(feature) {
  if (isCreator()) return true;
  const plan = getPlanKey();
  return PLAN_FEATURES[plan]?.[feature] === true;
}
window.canUseFeature = canUseFeature;

// ── USAGE TRACKING ─────────────────────────────────────
function getUsage() {
  const today = new Date().toDateString();
  try {
    const s = JSON.parse(localStorage.getItem('datta_usage')||'{}');
    if (s.date !== today) {
      const fresh = { date:today, msgs:0, images:0, msgsThisHour:0, hourStart:Date.now() };
      localStorage.setItem('datta_usage', JSON.stringify(fresh));
      return fresh;
    }
    return s;
  } catch(e) {
    return { date:new Date().toDateString(), msgs:0, images:0, msgsThisHour:0, hourStart:Date.now() };
  }
}
function saveUsage(u) { localStorage.setItem('datta_usage', JSON.stringify(u)); }

function canSendMessage() {
  if (isCreator()) return { ok:true };
  const plan = getPlanKey();
  const limits = PLAN_LIMITS[plan];
  const usage = getUsage();
  const now = Date.now();
  // Reset hourly counter if hour passed
  if (!usage.hourStart || (now - usage.hourStart) > 3600000) {
    usage.hourStart = now;
    usage.msgsThisHour = 0;
    saveUsage(usage);
  }
  if ((usage.msgsThisHour||0) >= limits.msgsPerHr) {
    const resetIn = Math.ceil((usage.hourStart + 3600000 - now) / 60000);
    return { ok:false, reason:'msg_limit', resetIn, planName:PLAN_DISPLAY[plan].name, limit:limits.msgsPerHr };
  }
  return { ok:true };
}
window.canSendMessage = canSendMessage;

function recordMessageSent() {
  if (isCreator()) return;
  const u = getUsage();
  u.msgsThisHour = (u.msgsThisHour||0)+1;
  u.msgs = (u.msgs||0)+1;
  saveUsage(u);
}
window.recordMessageSent = recordMessageSent;

function canGenerateImage() {
  if (isCreator()) return { ok:true };
  if (!canUseFeature('imageGen')) return { ok:false, reason:'not_in_plan', feature:'imageGen' };
  const plan = getPlanKey();
  const usage = getUsage();
  if ((usage.images||0) >= PLAN_LIMITS[plan].imagesPerDay) {
    return { ok:false, reason:'img_limit', limit:PLAN_LIMITS[plan].imagesPerDay };
  }
  return { ok:true };
}
window.canGenerateImage = canGenerateImage;

function recordImageGenerated() {
  if (isCreator()) return;
  const u = getUsage();
  u.images = (u.images||0)+1;
  saveUsage(u);
}
window.recordImageGenerated = recordImageGenerated;

// ── UPGRADE MODAL ──────────────────────────────────────
function showUpgradeModal(reason, feature) {
  document.getElementById('limitModal')?.remove();
  const planKey = getPlanKey();
  const curPlan = PLAN_DISPLAY[planKey];
  const unlockPlanKey = feature ? (FEATURE_UNLOCK_PLAN[feature] || 'shakti') : 'shakti';
  const unlockPlan = PLAN_DISPLAY[unlockPlanKey];
  const featureName = feature ? (FEATURE_NAMES[feature] || feature) : '';

  let icon='🔒', title='', desc='', sub='';
  if (reason==='msg_limit') {
    const check = canSendMessage();
    icon='💬';
    title='MESSAGE LIMIT REACHED';
    desc=`You've used all ${PLAN_LIMITS[planKey].msgsPerHr} messages/hr on ${curPlan.emoji} ${curPlan.name} plan.`;
    sub=`Resets in ~${check.resetIn||60} min. Upgrade for more messages!`;
  } else if (reason==='img_limit') {
    icon='🎨';
    title='IMAGE LIMIT REACHED';
    desc=`You've used all ${PLAN_LIMITS[planKey].imagesPerDay} images/day on ${curPlan.emoji} ${curPlan.name} plan.`;
    sub='Upgrade for more daily images!';
  } else if (reason==='not_in_plan') {
    icon='🔒';
    title=`${featureName} LOCKED`;
    desc=`This feature requires ${unlockPlan.emoji} ${unlockPlan.name} plan or higher.`;
    sub=`You are on ${curPlan.emoji} ${curPlan.name}. Upgrade to unlock!`;
  }

  const modal = document.createElement('div');
  modal.id='limitModal';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(10px);animation:fadeIn 0.2s ease;';
  modal.innerHTML=`
    <div style="background:#0f0e00;border:1px solid rgba(255,215,0,0.2);border-radius:24px;padding:28px 24px;width:90%;max-width:340px;text-align:center;animation:scaleIn 0.25s ease;">
      <div style="font-size:48px;margin-bottom:10px;">${icon}</div>
      <div style="font-family:'Bebas Neue',sans-serif;font-size:17px;letter-spacing:3px;color:#ffd700;margin-bottom:8px;">${title}</div>
      <div style="font-family:'Rajdhani',sans-serif;font-size:13px;color:#665500;margin-bottom:4px;">${desc}</div>
      <div style="font-family:'Rajdhani',sans-serif;font-size:12px;color:#443300;margin-bottom:20px;">${sub}</div>
      <div style="background:rgba(255,215,0,0.04);border:1px solid rgba(255,215,0,0.1);border-radius:12px;padding:10px 14px;margin-bottom:16px;text-align:left;">
        <div style="font-family:'Rajdhani',sans-serif;font-size:10px;color:#443300;letter-spacing:2px;margin-bottom:8px;">UNLOCK WITH</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${['shakti','agni','brahma'].filter(k=>{
            const planOrder=['arambh','shakti','agni','brahma'];
            return planOrder.indexOf(k) >= planOrder.indexOf(unlockPlanKey);
          }).map(k=>`
            <div style="flex:1;background:rgba(255,255,255,0.03);border:1px solid rgba(255,215,0,0.08);border-radius:10px;padding:8px;text-align:center;">
              <div style="font-size:18px;">${PLAN_DISPLAY[k].emoji}</div>
              <div style="font-family:'Bebas Neue',sans-serif;font-size:13px;letter-spacing:2px;color:${PLAN_DISPLAY[k].color};">${PLAN_DISPLAY[k].name}</div>
              <div style="font-size:10px;color:#443300;">${PLAN_DISPLAY[k].price}</div>
            </div>`).join('')}
        </div>
      </div>
      <button onclick="window.location.href='pricing.html'" style="width:100%;padding:13px;background:linear-gradient(135deg,#ffd700,#ff8c00);border:none;border-radius:50px;color:#000;font-family:'Rajdhani',sans-serif;font-size:14px;font-weight:700;letter-spacing:2px;cursor:pointer;margin-bottom:8px;">
        👑 UPGRADE NOW
      </button>
      <button onclick="document.getElementById('limitModal').remove()" style="width:100%;padding:10px;background:none;border:1px solid rgba(255,215,0,0.1);border-radius:50px;color:#443300;font-family:'Rajdhani',sans-serif;font-size:12px;letter-spacing:1px;cursor:pointer;">
        Maybe later
      </button>
    </div>
    <style>
      @keyframes fadeIn{from{opacity:0}to{opacity:1}}
      @keyframes scaleIn{from{transform:scale(0.9);opacity:0}to{transform:scale(1);opacity:1}}
    </style>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e=>{ if(e.target===modal) modal.remove(); });
}
window.showUpgradeModal = showUpgradeModal;

// ── PAGE GUARD — call this at top of any locked page ───
function requireFeature(feature) {
  if (isCreator()) return true;
  if (!canUseFeature(feature)) {
    // Replace page content with locked screen
    document.addEventListener('DOMContentLoaded', function() {
      const main = document.querySelector('.main') || document.body;
      const plan = getPlanKey();
      const cur = PLAN_DISPLAY[plan];
      const unlockKey = FEATURE_UNLOCK_PLAN[feature] || 'shakti';
      const unlock = PLAN_DISPLAY[unlockKey];
      const fname = FEATURE_NAMES[feature] || feature;
      main.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:70vh;text-align:center;padding:30px 20px;">
          <div style="font-size:60px;margin-bottom:16px;">🔒</div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:3px;color:#ffd700;margin-bottom:8px;">${fname}</div>
          <div style="font-family:'Rajdhani',sans-serif;font-size:13px;color:#665500;margin-bottom:4px;letter-spacing:1px;">
            This feature requires ${unlock.emoji} ${unlock.name} plan or higher.
          </div>
          <div style="font-family:'Rajdhani',sans-serif;font-size:12px;color:#443300;margin-bottom:24px;">
            You are on ${cur.emoji} ${cur.name}.
          </div>
          <button onclick="window.location.href='pricing.html'" style="padding:13px 32px;background:linear-gradient(135deg,#ffd700,#ff8c00);border:none;border-radius:50px;color:#000;font-family:'Rajdhani',sans-serif;font-size:14px;font-weight:700;letter-spacing:2px;cursor:pointer;margin-bottom:10px;">
            👑 UPGRADE NOW
          </button>
          <button onclick="window.location.href='index.html'" style="padding:10px 24px;background:none;border:1px solid rgba(255,215,0,0.15);border-radius:50px;color:#443300;font-family:'Rajdhani',sans-serif;font-size:12px;letter-spacing:1px;cursor:pointer;">
            ← Back to Chat
          </button>
        </div>`;
    });
    return false;
  }
  return true;
}
window.requireFeature = requireFeature;

// ── INIT ───────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', function() {
  if (!localStorage.getItem('datta_plan')) localStorage.setItem('datta_plan','arambh');
  if (isCreator()) console.log('👑 Creator — unlimited access');
  else {
    const p = getPlanKey();
    const u = getUsage();
    console.log(`📋 Plan: ${PLAN_DISPLAY[p].name} | Msgs/hr: ${u.msgsThisHour||0}/${PLAN_LIMITS[p].msgsPerHr} | Images: ${u.images||0}/${PLAN_LIMITS[p].imagesPerDay}`);
  }
});
