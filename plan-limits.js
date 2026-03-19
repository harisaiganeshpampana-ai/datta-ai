// ╔══════════════════════════════════════════════════════════╗
// ║         DATTA AI — plan-limits.js                       ║
// ║  Enforces exact plan rules from pricing.html            ║
// ╚══════════════════════════════════════════════════════════╝

const PLAN_RULES = {
  arambh: {
    name: 'Arambh', emoji: '🌱', label: 'FREE',
    msgsPerHr: 50, cooldownMin: 60,
    imagesPerDay: 3,
    features: {
      aiChat: true,
      webSearch: true,
      liveFeed: true,
      moodAI: false,
      imageGen: false,
      voiceAssistant: false,
      fileUpload: false,
      smartMemory: false,
      analytics: false,
      dailyBriefing: false,
      translator: false,
      emotionalSupport: false,
      xpGamification: false,
      selfieMood: false,
      personalityEvolution: false,
      prioritySupport: false,
      earlyAccess: false,
      vipSupport: false,
      customPersonality: false,
      whiteLabel: false,
      apiAccess: false,
    }
  },
  free: null, // alias → arambh

  shakti: {
    name: 'Shakti', emoji: '⚡', label: '₹249/mo',
    msgsPerHr: 150, cooldownMin: 45,
    imagesPerDay: 10,
    features: {
      aiChat: true,
      webSearch: true,
      liveFeed: true,
      moodAI: true,
      imageGen: true,
      voiceAssistant: true,
      fileUpload: false,
      smartMemory: true,
      analytics: true,
      dailyBriefing: true,
      translator: true,
      emotionalSupport: true,
      xpGamification: true,
      selfieMood: false,
      personalityEvolution: false,
      prioritySupport: false,
      earlyAccess: false,
      vipSupport: false,
      customPersonality: false,
      whiteLabel: false,
      apiAccess: false,
    }
  },

  agni: {
    name: 'Agni', emoji: '🔥', label: '₹599/mo',
    msgsPerHr: 500, cooldownMin: 30,
    imagesPerDay: 20,
    features: {
      aiChat: true,
      webSearch: true,
      liveFeed: true,
      moodAI: true,
      imageGen: true,
      voiceAssistant: true,
      fileUpload: true,
      smartMemory: true,
      analytics: true,
      dailyBriefing: true,
      translator: true,
      emotionalSupport: true,
      xpGamification: true,
      selfieMood: true,
      personalityEvolution: true,
      prioritySupport: true,
      earlyAccess: true,
      vipSupport: false,
      customPersonality: false,
      whiteLabel: false,
      apiAccess: false,
    }
  },

  brahma: {
    name: 'Brahma', emoji: '👑', label: '₹1199/mo',
    msgsPerHr: 1000, cooldownMin: 15,
    imagesPerDay: 100,
    features: {
      aiChat: true,
      webSearch: true,
      liveFeed: true,
      moodAI: true,
      imageGen: true,
      voiceAssistant: true,
      fileUpload: true,
      smartMemory: true,
      analytics: true,
      dailyBriefing: true,
      translator: true,
      emotionalSupport: true,
      xpGamification: true,
      selfieMood: true,
      personalityEvolution: true,
      prioritySupport: true,
      earlyAccess: true,
      vipSupport: true,
      customPersonality: true,
      whiteLabel: true,
      apiAccess: true,
    }
  }
};

// ── HELPERS ────────────────────────────────────────────
function getCurrentPlan() {
  const key = localStorage.getItem('datta_plan') || 'arambh';
  return PLAN_RULES[key] || PLAN_RULES['arambh'];
}

function isCreator() {
  try {
    const user = JSON.parse(localStorage.getItem('datta_user') || '{}');
    const u = (user.username || '').toLowerCase();
    return ['pampana_hari_sai_ganesh','harisaiganesh','ganesh','admin','creator','dattaai'].some(c => u.includes(c));
  } catch(e) { return false; }
}

// ── USAGE TRACKING ─────────────────────────────────────
function getUsage() {
  const today = new Date().toDateString();
  try {
    const raw = localStorage.getItem('datta_usage');
    const stored = raw ? JSON.parse(raw) : {};
    if (stored.date !== today) {
      // Reset daily counts
      const fresh = { date: today, msgs: 0, images: 0, lastMsgTime: 0 };
      localStorage.setItem('datta_usage', JSON.stringify(fresh));
      return fresh;
    }
    return stored;
  } catch(e) {
    return { date: today, msgs: 0, images: 0, lastMsgTime: 0 };
  }
}

function saveUsage(usage) {
  localStorage.setItem('datta_usage', JSON.stringify(usage));
}

// ── CAN USE FEATURE? ───────────────────────────────────
function canUseFeature(feature) {
  if (isCreator()) return true;
  const plan = getCurrentPlan();
  return plan.features[feature] === true;
}
window.canUseFeature = canUseFeature;

// ── CAN SEND MESSAGE? (rate limit check) ──────────────
function canSendMessage() {
  if (isCreator()) return { ok: true };
  const plan = getCurrentPlan();
  const usage = getUsage();
  const now = Date.now();

  // Check cooldown
  const cooldownMs = plan.cooldownMin * 60 * 1000;
  // Track hourly messages
  const hourAgo = now - 3600000;
  const hourlyMsgs = usage.msgs || 0;

  // Simple: track msgs this hour
  if (!usage.hourStart || (now - usage.hourStart) > 3600000) {
    usage.hourStart = now;
    usage.msgsThisHour = 0;
    saveUsage(usage);
  }

  if ((usage.msgsThisHour || 0) >= plan.msgsPerHr) {
    const resetIn = Math.ceil((usage.hourStart + 3600000 - now) / 60000);
    return { ok: false, reason: `msg_limit`, resetIn, plan: plan.name, limit: plan.msgsPerHr };
  }

  return { ok: true };
}
window.canSendMessage = canSendMessage;

function recordMessageSent() {
  if (isCreator()) return;
  const usage = getUsage();
  usage.msgsThisHour = (usage.msgsThisHour || 0) + 1;
  usage.msgs = (usage.msgs || 0) + 1;
  usage.lastMsgTime = Date.now();
  saveUsage(usage);
}
window.recordMessageSent = recordMessageSent;

// ── CAN GENERATE IMAGE? ────────────────────────────────
function canGenerateImage() {
  if (isCreator()) return { ok: true };
  if (!canUseFeature('imageGen')) return { ok: false, reason: 'not_in_plan' };
  const plan = getCurrentPlan();
  const usage = getUsage();
  if ((usage.images || 0) >= plan.imagesPerDay) {
    return { ok: false, reason: 'img_limit', limit: plan.imagesPerDay };
  }
  return { ok: true };
}
window.canGenerateImage = canGenerateImage;

function recordImageGenerated() {
  if (isCreator()) return;
  const usage = getUsage();
  usage.images = (usage.images || 0) + 1;
  saveUsage(usage);
}
window.recordImageGenerated = recordImageGenerated;

// ── SHOW UPGRADE MODAL ─────────────────────────────────
function showUpgradeModal(reason, feature) {
  document.getElementById('limitModal')?.remove();

  const plan = getCurrentPlan();
  let title = '⚡ LIMIT REACHED';
  let desc = '';
  let sub = '';

  if (reason === 'msg_limit') {
    title = '💬 MESSAGE LIMIT REACHED';
    desc = `You've used all ${plan.msgsPerHr} messages/hr on the ${plan.name} plan.`;
    sub = 'Upgrade for more messages and shorter cooldown!';
  } else if (reason === 'img_limit') {
    title = '🎨 IMAGE LIMIT REACHED';
    desc = `You've used all ${plan.imagesPerDay} images/day on the ${plan.name} plan.`;
    sub = 'Upgrade for more daily images!';
  } else if (reason === 'not_in_plan') {
    const featureNames = {
      imageGen: '🎨 Image Generation',
      voiceAssistant: '🎙️ Voice Assistant',
      moodAI: '😊 Mood-based AI',
      fileUpload: '📎 File Upload',
      smartMemory: '🧾 Smart Memory',
      analytics: '📊 Analytics',
      dailyBriefing: '📅 Daily Briefing',
      translator: '🌍 Translator',
      selfieMood: '📸 Selfie Mood Detection',
      personalityEvolution: '🧬 AI Personality Evolution',
      prioritySupport: '⚡ Priority Support',
      vipSupport: '👑 VIP Support',
      customPersonality: '🤖 Custom AI Personality',
      apiAccess: '🔌 API Access',
    };
    title = `${featureNames[feature] || feature} LOCKED`;
    desc = `This feature is not available on your current ${plan.name} plan.`;
    sub = 'Upgrade your plan to unlock it!';
  }

  const modal = document.createElement('div');
  modal.id = 'limitModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(10px);';
  modal.innerHTML = `
    <div style="background:#0f0e00;border:1px solid rgba(255,215,0,0.2);border-radius:24px;padding:28px 24px;width:90%;max-width:340px;text-align:center;animation:modalIn 0.3s ease;">
      <div style="font-size:44px;margin-bottom:10px;">🔒</div>
      <div style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:3px;color:#ffd700;margin-bottom:8px;">${title}</div>
      <div style="font-family:'Rajdhani',sans-serif;font-size:13px;color:#665500;margin-bottom:4px;letter-spacing:0.5px;">${desc}</div>
      <div style="font-family:'Rajdhani',sans-serif;font-size:12px;color:#443300;margin-bottom:20px;">${sub}</div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
        <div style="background:rgba(255,215,0,0.05);border:1px solid rgba(255,215,0,0.1);border-radius:12px;padding:10px;">
          <div style="font-family:'Bebas Neue',sans-serif;font-size:16px;color:#ffd700;letter-spacing:2px;">SHAKTI</div>
          <div style="font-size:11px;color:#443300;">₹249/mo</div>
        </div>
        <div style="background:rgba(255,140,0,0.05);border:1px solid rgba(255,140,0,0.15);border-radius:12px;padding:10px;">
          <div style="font-family:'Bebas Neue',sans-serif;font-size:16px;color:#ff8c00;letter-spacing:2px;">AGNI</div>
          <div style="font-size:11px;color:#443300;">₹599/mo</div>
        </div>
      </div>

      <button onclick="window.location.href='pricing.html'" style="width:100%;padding:13px;background:linear-gradient(135deg,#ffd700,#ff8c00);border:none;border-radius:50px;color:#000;font-family:'Rajdhani',sans-serif;font-size:14px;font-weight:700;letter-spacing:2px;cursor:pointer;margin-bottom:8px;">
        🔥 VIEW ALL PLANS
      </button>
      <button onclick="document.getElementById('limitModal').remove()" style="width:100%;padding:10px;background:none;border:1px solid rgba(255,215,0,0.1);border-radius:50px;color:#443300;font-family:'Rajdhani',sans-serif;font-size:12px;letter-spacing:1px;cursor:pointer;">
        Maybe later
      </button>
    </div>
    <style>@keyframes modalIn{from{opacity:0;transform:scale(0.92)}to{opacity:1;transform:scale(1)}}</style>`;

  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if(e.target===modal) modal.remove(); });
}
window.showUpgradeModal = showUpgradeModal;

// ── INIT — show plan info on page load ─────────────────
window.addEventListener('DOMContentLoaded', function() {
  const planKey = localStorage.getItem('datta_plan') || 'arambh';
  if (!localStorage.getItem('datta_plan')) {
    localStorage.setItem('datta_plan', 'arambh');
  }

  if (isCreator()) {
    console.log('👑 Creator mode active - unlimited access');
    return;
  }

  const plan = getCurrentPlan();
  const usage = getUsage();
  console.log(`📋 Plan: ${plan.name} | Msgs used today: ${usage.msgs||0} | Images: ${usage.images||0}/${plan.imagesPerDay}`);
});
