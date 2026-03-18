/*
 ═══════════════════════════════════════════════════
  DATTA AI — MOOD-BASED AI PERSONALITY SYSTEM
  v2.1 · SHAKTI UPDATE · World First Feature
 ═══════════════════════════════════════════════════
*/

const MOODS = {
  focused: {
    label: "Focused",
    emoji: "🎯",
    color: "#00ccff",
    bgGlow: "rgba(0,204,255,0.08)",
    desc: "Sharp, concise, no fluff",
    personality: `You are in FOCUSED mode. Be sharp, precise and concise. 
    No unnecessary fluff or filler words. Get straight to the point. 
    Use bullet points and structure when helpful. 
    The user wants maximum productivity and clarity.`
  },
  happy: {
    label: "Happy",
    emoji: "😄",
    color: "#ffd700",
    bgGlow: "rgba(255,215,0,0.08)",
    desc: "Cheerful, fun, energetic",
    personality: `You are in HAPPY mode. Be cheerful, warm and enthusiastic! 
    Use a fun, upbeat tone. Add light humor where appropriate. 
    Celebrate the user's wins and keep the energy high. 
    Use occasional emojis to express positivity! 🎉`
  },
  stressed: {
    label: "Stressed",
    emoji: "😮‍💨",
    color: "#00ff88",
    bgGlow: "rgba(0,255,136,0.08)",
    desc: "Calm, reassuring, gentle",
    personality: `You are in STRESSED mode. Be very calm, patient and reassuring. 
    Speak gently and supportively. Break things into small, manageable steps. 
    Acknowledge the user's feelings before answering. 
    Help them feel less overwhelmed. Be their calming presence.`
  },
  creative: {
    label: "Creative",
    emoji: "🎨",
    color: "#c084fc",
    bgGlow: "rgba(192,132,252,0.08)",
    desc: "Imaginative, expressive, bold",
    personality: `You are in CREATIVE mode. Be imaginative, expressive and bold! 
    Think outside the box. Use vivid language and metaphors. 
    Encourage wild ideas and unconventional thinking. 
    Help the user explore creative possibilities without limits.`
  },
  lazy: {
    label: "Lazy",
    emoji: "😴",
    color: "#f97316",
    bgGlow: "rgba(249,115,22,0.08)",
    desc: "Super short, casual, chill",
    personality: `You are in LAZY mode. Keep all responses extremely short and casual. 
    Use simple language. No long explanations unless absolutely necessary. 
    Be chill and laid back. The user doesn't want to think too hard right now.`
  },
  curious: {
    label: "Curious",
    emoji: "🔍",
    color: "#ec4899",
    bgGlow: "rgba(236,72,153,0.08)",
    desc: "Deep, thoughtful, exploratory",
    personality: `You are in CURIOUS mode. Be deeply thoughtful and exploratory. 
    Ask follow-up questions to dig deeper. Share fascinating facts and perspectives. 
    Help the user see topics from multiple angles. 
    Make learning feel like an exciting adventure.`
  }
};

let currentMood = null;

function loadMood() {
  const saved = localStorage.getItem('datta_mood');
  if (saved && MOODS[saved]) {
    applyMood(saved, false);
  }
}

function applyMood(moodKey, save = true) {
  const mood = MOODS[moodKey];
  if (!mood) return;

  currentMood = moodKey;
  if (save) localStorage.setItem('datta_mood', moodKey);

  // Change accent color to match mood
  if (window.dattaTheme) {
    window.dattaTheme.saveAndApply(mood.color);
    if (window.updateTopbarDot) window.updateTopbarDot();
  }

  // Update topbar mood indicator
  const indicator = document.getElementById('moodIndicator');
  if (indicator) {
    indicator.textContent = mood.emoji + ' ' + mood.label;
    indicator.style.color = mood.color;
    indicator.style.borderColor = mood.color + '44';
    indicator.style.background = mood.bgGlow;
    indicator.style.display = 'flex';
  }

  // Update welcome greeting
  const greetEl = document.querySelector('.welcomeGreeting');
  if (greetEl) {
    const greets = {
      focused: "Let's get things done 🎯",
      happy: "Let's have some fun! 😄",
      stressed: "Hey, breathe. I've got you 😮‍💨",
      creative: "Let's make something amazing 🎨",
      lazy: "chill mode activated 😴",
      curious: "Let's explore something interesting 🔍"
    };
    greetEl.textContent = greets[moodKey] || "Good to see you 👋";
    greetEl.style.color = mood.color;
  }

  // Update all preset buttons active state
  document.querySelectorAll('.moodBtn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mood === moodKey);
  });

  // Store personality for chat.js to use
  window.dattaMoodPersonality = mood.personality;
  window.dattaMoodEmoji = mood.emoji;
  window.dattaMoodLabel = mood.label;

  // Close the mood panel
  closeMoodPanel();

  // Show toast
  showMoodToast(mood);
}

function clearMood() {
  currentMood = null;
  localStorage.removeItem('datta_mood');
  window.dattaMoodPersonality = null;

  const indicator = document.getElementById('moodIndicator');
  if (indicator) indicator.style.display = 'none';

  // Reset to gold
  if (window.dattaTheme) {
    window.dattaTheme.saveAndApply('#ffd700');
    if (window.updateTopbarDot) window.updateTopbarDot();
  }

  document.querySelectorAll('.moodBtn').forEach(btn => btn.classList.remove('active'));
  closeMoodPanel();
}

function showMoodToast(mood) {
  let toast = document.getElementById('moodToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'moodToast';
    toast.style.cssText = `
      position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%);
      background: #0f0e00; border-radius: 50px; padding: 10px 20px;
      font-family: 'Rajdhani', sans-serif; font-size: 14px; font-weight: 600;
      letter-spacing: 1px; z-index: 9999; pointer-events: none;
      transition: all 0.3s ease; opacity: 0;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      white-space: nowrap;
    `;
    document.body.appendChild(toast);
  }
  toast.style.border = `1px solid ${mood.color}44`;
  toast.style.color = mood.color;
  toast.textContent = `${mood.emoji} ${mood.label} mode activated!`;
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; }, 2500);
}

function toggleMoodPanel() {
  const panel = document.getElementById('moodPanel');
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';

  // Close color panel if open
  const colorPanel = document.getElementById('colorPanel');
  if (colorPanel) colorPanel.style.display = 'none';
}

function closeMoodPanel() {
  const panel = document.getElementById('moodPanel');
  if (panel) panel.style.display = 'none';
}

// Close on outside click
document.addEventListener('click', function(e) {
  const panel = document.getElementById('moodPanel');
  const btn = document.getElementById('moodBtn');
  const indicator = document.getElementById('moodIndicator');
  if (panel && btn && !panel.contains(e.target) && !btn.contains(e.target) && !indicator?.contains(e.target)) {
    closeMoodPanel();
  }
});

// Expose globally
window.MOODS = MOODS;
window.applyMood = applyMood;
window.clearMood = clearMood;
window.toggleMoodPanel = toggleMoodPanel;
window.closeMoodPanel = closeMoodPanel;

// Auto load saved mood
document.addEventListener('DOMContentLoaded', loadMood);
