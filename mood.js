/*
 ═══════════════════════════════════════════════════
  DATTA AI — MOOD-BASED AI PERSONALITY SYSTEM
  v3.0 · SHAKTI UPDATE · World First Feature
  NEW: Auto Mood Detection + Mood Memory Timeline
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

// ═══════════════════════════════════════════════════
//  AUTO MOOD DETECTION — Sentiment Analysis Engine
// ═══════════════════════════════════════════════════

const MOOD_KEYWORDS = {
  stressed: [
    'help','urgent','asap','stuck','confused','problem','issue','error','bug',
    'broken','failed','cant','cannot','dont know','not working','please','deadline',
    'worried','anxiety','overwhelmed','stress','panic','tired','exhausted','lost'
  ],
  happy: [
    'awesome','amazing','great','love','excited','happy','yay','wow','fantastic',
    'wonderful','thanks','thank you','perfect','cool','nice','fun','enjoy','best',
    'brilliant','excellent','good morning','good day','hi','hello','hey'
  ],
  creative: [
    'design','create','make','build','idea','imagine','story','write','poem',
    'art','draw','generate','invent','craft','compose','brainstorm','concept',
    'creative','novel','unique','original','inspire','vision'
  ],
  focused: [
    'how to','explain','what is','define','steps','guide','tutorial','learn',
    'understand','compare','difference','analyze','summarize','list','show me',
    'code','script','function','implement','solve','calculate','find'
  ],
  curious: [
    'why','wonder','interesting','fascinating','curious','explore','discover',
    'possible','imagine if','what if','theory','philosophy','science','history',
    'universe','mind','consciousness','future','mystery','deep','meaning'
  ],
  lazy: [
    'tldr','quick','short','brief','simple','just','easy','fast','basically',
    'whatever','idk','lol','lmao','nvm','cba','meh','sure','ok','okay','fine'
  ]
};

function autoDetectMood(text) {
  const lower = text.toLowerCase();
  const scores = {};

  for (const [mood, keywords] of Object.entries(MOOD_KEYWORDS)) {
    scores[mood] = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) scores[mood]++;
    }
  }

  const top = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (top[0][1] === 0) return null; // no match
  return top[0][0];
}

// Call this from chat.js when user sends a message
// Returns detected mood key or null
window.dattaAutoDetectMood = function(userMessage) {
  const detected = autoDetectMood(userMessage);
  if (!detected) return null;

  // Only auto-apply if no mood is manually set
  if (!currentMood) {
    applyMood(detected, true, true); // last param = isAuto
  }

  // Always log to timeline regardless
  logMoodToTimeline(detected, userMessage);
  return detected;
};

// ═══════════════════════════════════════════════════
//  MOOD MEMORY TIMELINE
// ═══════════════════════════════════════════════════

function logMoodToTimeline(moodKey, trigger = '') {
  const timeline = getMoodTimeline();
  const entry = {
    mood: moodKey,
    time: Date.now(),
    hour: new Date().getHours(),
    day: new Date().getDay(), // 0=Sun ... 6=Sat
    trigger: trigger.substring(0, 60)
  };
  timeline.push(entry);
  // Keep last 200 entries
  if (timeline.length > 200) timeline.splice(0, timeline.length - 200);
  localStorage.setItem('datta_mood_timeline', JSON.stringify(timeline));
}

function getMoodTimeline() {
  try {
    return JSON.parse(localStorage.getItem('datta_mood_timeline') || '[]');
  } catch { return []; }
}

// Analyse timeline and return insights
function getMoodInsights() {
  const timeline = getMoodTimeline();
  if (timeline.length < 3) return null;

  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const moodCount = {};
  const hourMood = {};
  const dayMood = {};

  for (const e of timeline) {
    moodCount[e.mood] = (moodCount[e.mood] || 0) + 1;
    if (!hourMood[e.hour]) hourMood[e.hour] = {};
    hourMood[e.hour][e.mood] = (hourMood[e.hour][e.mood] || 0) + 1;
    if (!dayMood[e.day]) dayMood[e.day] = {};
    dayMood[e.day][e.mood] = (dayMood[e.day][e.mood] || 0) + 1;
  }

  // Top mood overall
  const topMood = Object.entries(moodCount).sort((a,b) => b[1]-a[1])[0][0];

  // Best hour (most focused/happy entries)
  let bestHour = null, bestHourScore = 0;
  for (const [h, moods] of Object.entries(hourMood)) {
    const score = (moods.focused||0) + (moods.happy||0) + (moods.creative||0);
    if (score > bestHourScore) { bestHourScore = score; bestHour = h; }
  }

  // Most stressed day
  let stressDay = null, stressDayScore = 0;
  for (const [d, moods] of Object.entries(dayMood)) {
    if ((moods.stressed||0) > stressDayScore) {
      stressDayScore = moods.stressed;
      stressDay = d;
    }
  }

  // Last 7 days for chart
  const weekAgo = Date.now() - 7*24*60*60*1000;
  const recent = timeline.filter(e => e.time > weekAgo);
  const weekMoods = {};
  for (const e of recent) {
    weekMoods[e.mood] = (weekMoods[e.mood] || 0) + 1;
  }

  return {
    topMood,
    bestHour: bestHour !== null ? `${bestHour}:00` : null,
    stressDay: stressDay !== null ? days[stressDay] : null,
    weekMoods,
    total: timeline.length,
    recentCount: recent.length
  };
}

// Predict mood based on current hour + day patterns
function predictMood() {
  const timeline = getMoodTimeline();
  if (timeline.length < 5) return null;

  const now = new Date();
  const h = now.getHours();
  const d = now.getDay();

  // Find entries from same hour ±1 and same day
  const similar = timeline.filter(e =>
    Math.abs(e.hour - h) <= 1 && e.day === d
  );

  if (similar.length < 2) return null;

  const counts = {};
  for (const e of similar) counts[e.mood] = (counts[e.mood]||0) + 1;
  const top = Object.entries(counts).sort((a,b) => b[1]-a[1])[0];
  return top[1] >= 2 ? top[0] : null;
}

// Expose for settings page
window.getMoodInsights = getMoodInsights;
window.getMoodTimeline = getMoodTimeline;
window.dattaPredictMood = predictMood;

// ═══════════════════════════════════════════════════
//  TIMELINE PANEL UI
// ═══════════════════════════════════════════════════

function showTimelinePanel() {
  let panel = document.getElementById('moodTimelinePanel');
  if (panel) { panel.remove(); return; }

  const insights = getMoodInsights();
  const timeline = getMoodTimeline().slice(-14).reverse(); // last 14 entries

  panel = document.createElement('div');
  panel.id = 'moodTimelinePanel';
  panel.style.cssText = `
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    background:#0a0900;border:1px solid rgba(255,215,0,0.2);
    border-radius:20px;padding:24px;z-index:10000;
    width:min(420px,92vw);max-height:80vh;overflow-y:auto;
    box-shadow:0 20px 60px rgba(0,0,0,0.8);
    font-family:'DM Sans',sans-serif;color:#fff8e7;
  `;

  const noData = !insights;

  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:3px;
        background:linear-gradient(90deg,#ffd700,#ff8c00);-webkit-background-clip:text;
        -webkit-text-fill-color:transparent;">🧠 MOOD TIMELINE</div>
      <button onclick="document.getElementById('moodTimelinePanel').remove()"
        style="background:none;border:none;color:#554400;cursor:pointer;font-size:18px;">✕</button>
    </div>

    ${noData ? `
      <div style="text-align:center;padding:30px;color:#443300;">
        <div style="font-size:36px;margin-bottom:10px;">🌱</div>
        <div style="font-family:'Rajdhani',sans-serif;font-size:14px;letter-spacing:1px;">
          Start chatting to build your mood timeline!
        </div>
      </div>
    ` : `
      <!-- INSIGHTS -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px;">
        ${insightCard('🏆 Top Mood', MOODS[insights.topMood]?.emoji + ' ' + MOODS[insights.topMood]?.label, MOODS[insights.topMood]?.color)}
        ${insightCard('⚡ Peak Hour', insights.bestHour || '—', '#ffd700')}
        ${insightCard('😮‍💨 Stress Day', insights.stressDay || '—', '#00ff88')}
        ${insightCard('📊 Total Logs', insights.total + ' entries', '#c084fc')}
      </div>

      <!-- WEEK CHART -->
      <div style="background:#0f0e00;border:1px solid rgba(255,215,0,0.08);border-radius:14px;
        padding:14px;margin-bottom:16px;">
        <div style="font-family:'Rajdhani',sans-serif;font-size:11px;letter-spacing:2px;
          color:#443300;margin-bottom:12px;">LAST 7 DAYS</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${Object.entries(insights.weekMoods).map(([mood, count]) => `
            <div style="display:flex;align-items:center;gap:5px;
              background:rgba(255,255,255,0.03);border-radius:20px;
              padding:4px 10px;border:1px solid ${MOODS[mood]?.color}33;">
              <span>${MOODS[mood]?.emoji}</span>
              <span style="font-family:'Rajdhani',sans-serif;font-size:12px;
                color:${MOODS[mood]?.color};">${MOODS[mood]?.label}</span>
              <span style="font-size:11px;color:#443300;">×${count}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- RECENT HISTORY -->
      <div style="font-family:'Rajdhani',sans-serif;font-size:11px;letter-spacing:2px;
        color:#443300;margin-bottom:10px;">RECENT HISTORY</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${timeline.map(e => {
          const m = MOODS[e.mood];
          const d = new Date(e.time);
          const label = d.toLocaleString('en-IN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
          const isAuto = e.trigger ? '🤖' : '👆';
          return `
            <div style="display:flex;align-items:center;gap:10px;
              background:#0f0e00;border:1px solid rgba(255,215,0,0.06);
              border-radius:10px;padding:8px 12px;">
              <span style="font-size:16px;">${m?.emoji||'❓'}</span>
              <div style="flex:1;">
                <div style="font-family:'Rajdhani',sans-serif;font-size:13px;
                  color:${m?.color||'#fff'};font-weight:700;">${m?.label||e.mood}</div>
                ${e.trigger ? `<div style="font-size:11px;color:#332200;margin-top:1px;
                  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;">
                  "${e.trigger}"</div>` : ''}
              </div>
              <div style="text-align:right;">
                <div style="font-size:10px;color:#332200;">${label}</div>
                <div style="font-size:10px;color:#443300;margin-top:2px;">${isAuto} ${e.trigger?'auto':'manual'}</div>
              </div>
            </div>
          `
        }).join('')}
      </div>
    `}

    <button onclick="if(confirm('Clear mood timeline?')){localStorage.removeItem('datta_mood_timeline');document.getElementById('moodTimelinePanel').remove();}"
      style="margin-top:16px;width:100%;padding:10px;background:none;
      border:1px solid rgba(255,60,60,0.2);border-radius:50px;color:#ff4444;
      font-family:'Rajdhani',sans-serif;font-size:12px;letter-spacing:1px;cursor:pointer;">
      🗑️ Clear Timeline
    </button>
  `;

  document.body.appendChild(panel);
}

function insightCard(label, value, color) {
  return `
    <div style="background:#0f0e00;border:1px solid rgba(255,215,0,0.07);
      border-radius:12px;padding:12px;">
      <div style="font-family:'Rajdhani',sans-serif;font-size:10px;
        letter-spacing:1px;color:#332200;margin-bottom:4px;">${label}</div>
      <div style="font-family:'Rajdhani',sans-serif;font-size:15px;
        font-weight:700;color:${color};">${value}</div>
    </div>
  `;
}

window.showMoodTimeline = showTimelinePanel;

// ═══════════════════════════════════════════════════
//  ORIGINAL MOOD SYSTEM (UNCHANGED)
// ═══════════════════════════════════════════════════

function loadMood() {
  const saved = localStorage.getItem('datta_mood');
  if (saved && MOODS[saved]) {
    applyMood(saved, false);
  } else {
    // Try predicting mood based on time patterns
    const predicted = predictMood();
    if (predicted) {
      applyMood(predicted, true, true);
      showPredictionBanner(predicted);
    }
  }
}

function showPredictionBanner(moodKey) {
  const mood = MOODS[moodKey];
  const banner = document.createElement('div');
  banner.style.cssText = `
    position:fixed;top:64px;left:50%;transform:translateX(-50%);
    background:#0f0e00;border:1px solid ${mood.color}44;
    border-radius:50px;padding:8px 18px;z-index:9999;
    font-family:'Rajdhani',sans-serif;font-size:12px;
    letter-spacing:1px;color:${mood.color};
    box-shadow:0 4px 20px rgba(0,0,0,0.5);
    animation: fadeInOut 4s ease forwards;
    pointer-events:none;
  `;
  banner.textContent = `🧠 Predicted: ${mood.emoji} ${mood.label} mode based on your patterns`;
  document.body.appendChild(banner);
  const style = document.createElement('style');
  style.textContent = `@keyframes fadeInOut{0%{opacity:0;top:74px}15%{opacity:1;top:64px}75%{opacity:1}100%{opacity:0}}`;
  document.head.appendChild(style);
  setTimeout(() => banner.remove(), 4100);
}

function applyMood(moodKey, save = true, isAuto = false) {
  const mood = MOODS[moodKey];
  if (!mood) return;

  currentMood = moodKey;
  if (save) localStorage.setItem('datta_mood', moodKey);

  // Log to timeline (manual select)
  if (!isAuto) logMoodToTimeline(moodKey, '');

  // Change accent color
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

  // Update mood buttons
  document.querySelectorAll('.moodBtn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mood === moodKey);
  });

  // Store personality for chat.js
  window.dattaMoodPersonality = mood.personality;
  window.dattaMoodEmoji = mood.emoji;
  window.dattaMoodLabel = mood.label;

  closeMoodPanel();
  showMoodToast(mood);
}

function clearMood() {
  currentMood = null;
  localStorage.removeItem('datta_mood');
  window.dattaMoodPersonality = null;

  const indicator = document.getElementById('moodIndicator');
  if (indicator) indicator.style.display = 'none';

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
  const colorPanel = document.getElementById('colorPanel');
  if (colorPanel) colorPanel.style.display = 'none';
}

function closeMoodPanel() {
  const panel = document.getElementById('moodPanel');
  if (panel) panel.style.display = 'none';
}

document.addEventListener('click', function(e) {
  const panel = document.getElementById('moodPanel');
  const btn = document.getElementById('moodBtn');
  const indicator = document.getElementById('moodIndicator');
  const timelinePanel = document.getElementById('moodTimelinePanel');
  if (panel && btn &&
      !panel.contains(e.target) &&
      !btn.contains(e.target) &&
      !indicator?.contains(e.target) &&
      !timelinePanel?.contains(e.target)) {
    closeMoodPanel();
  }
});

// Expose globally
window.MOODS = MOODS;
window.applyMood = applyMood;
window.clearMood = clearMood;
window.toggleMoodPanel = toggleMoodPanel;
window.closeMoodPanel = closeMoodPanel;

document.addEventListener('DOMContentLoaded', loadMood);
