// mood.js — Datta AI Mood Engine

(function() {

  // ── APPLY MOOD ─────────────────────────────────────
  const moodStyles = {
    focused:  { emoji:'🎯', label:'Focused',  color:'#00ccff' },
    happy:    { emoji:'😄', label:'Happy',    color:'#ffd700' },
    stressed: { emoji:'😮‍💨', label:'Stressed', color:'#00ff88' },
    creative: { emoji:'🎨', label:'Creative', color:'#c084fc' },
    lazy:     { emoji:'😴', label:'Lazy',     color:'#f97316' },
    curious:  { emoji:'🔍', label:'Curious',  color:'#ec4899' },
    night:    { emoji:'🌙', label:'Night Brain', color:'#818cf8' }
  };

  function applyMood(mood) {
    // Mood AI requires Shakti plan or higher
    if (typeof _canUse === "function" && !_canUse("moodAI")) {
      if (typeof _showUpgrade === "function") _showUpgrade("not_in_plan", "moodAI");
      return;
    }
    localStorage.setItem('datta_mood', mood);
    const info = moodStyles[mood];
    if (!info) return;

    // Save to mood timeline
    const timeline = JSON.parse(localStorage.getItem('datta_mood_timeline') || '[]');
    timeline.unshift({ mood, emoji: info.emoji, label: info.label, ts: Date.now() });
    if (timeline.length > 20) timeline.pop();
    localStorage.setItem('datta_mood_timeline', JSON.stringify(timeline));

    // Update indicator
    const indicator = document.getElementById('moodIndicator');
    if (indicator) {
      indicator.style.display = 'flex';
      indicator.innerHTML = `${info.emoji} <span style="margin-left:4px;color:${info.color}">${info.label}</span>`;
      indicator.style.borderColor = info.color + '55';
    }

    // Hide mood toggle btn, show indicator
    const toggleBtn = document.getElementById('moodToggleBtn');
    if (toggleBtn) toggleBtn.style.display = 'none';

    closeMoodPanel();
  }
  window.applyMood = applyMood;

  // ── CLEAR MOOD ─────────────────────────────────────
  function clearMood() {
    localStorage.removeItem('datta_mood');
    const indicator = document.getElementById('moodIndicator');
    if (indicator) indicator.style.display = 'none';
    const pill = document.getElementById('autoMoodPill');
    if (pill) pill.style.display = 'none';
    const toggleBtn = document.getElementById('moodToggleBtn');
    if (toggleBtn) toggleBtn.style.display = 'flex';
    closeMoodPanel();
  }
  window.clearMood = clearMood;

  // ── TOGGLE MOOD PANEL ──────────────────────────────
  function toggleMoodPanel() {
    const panel = document.getElementById('moodPanel');
    if (!panel) return;
    const isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : 'block';
  }
  function closeMoodPanel() {
    const panel = document.getElementById('moodPanel');
    if (panel) panel.style.display = 'none';
  }
  window.toggleMoodPanel = toggleMoodPanel;
  window.closeMoodPanel = closeMoodPanel;

  // ── AUTO MOOD DETECTION from message ──────────────
  function detectMoodFromText(text) {
    const t = text.toLowerCase();
    if (/\b(happy|great|awesome|excited|yay|love|amazing)\b/.test(t)) return 'happy';
    if (/\b(stressed|anxious|worried|overwhelmed|panic|help me)\b/.test(t)) return 'stressed';
    if (/\b(creative|design|art|imagine|build|invent|idea)\b/.test(t)) return 'creative';
    if (/\b(lazy|tired|just|simple|quick|short|brief)\b/.test(t)) return 'lazy';
    if (/\b(why|how|curious|wonder|explain|what if|interesting)\b/.test(t)) return 'curious';
    if (/\b(focus|concentrate|work|study|task|deadline|productive)\b/.test(t)) return 'focused';
    if (/\b(night|insomnia|thinking|deep|philosophy|meaning|exist)\b/.test(t)) return 'night';
    return null;
  }
  window.detectMoodFromText = detectMoodFromText;

  function showAutoMoodPill(mood) {
    const info = moodStyles[mood];
    if (!info) return;
    const pill = document.getElementById('autoMoodPill');
    if (!pill) return;
    pill.style.display = 'flex';
    pill.innerHTML = `${info.emoji} Auto: ${info.label}`;
    pill.style.borderColor = info.color + '55';
    pill.style.color = info.color;
    setTimeout(() => { if (pill) pill.style.display = 'none'; }, 5000);
  }
  window.showAutoMoodPill = showAutoMoodPill;

  // ── VOICE MOOD DETECTION ────────────────────────────
  function startVoiceMoodDetection() {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      alert('Voice not supported in this browser. Try Chrome!');
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR();
    r.lang = 'en-US';
    r.onresult = function(e) {
      const transcript = e.results[0][0].transcript;
      const detected = detectMoodFromText(transcript);
      if (detected) {
        applyMood(detected);
        showAutoMoodPill(detected);
      } else {
        alert('Could not detect mood from voice. Try describing how you feel!');
      }
    };
    r.onerror = () => alert('Voice detection failed. Please try again.');
    r.start();
    alert('Speak now — describe how you feel...');
  }
  window.startVoiceMoodDetection = startVoiceMoodDetection;

  // ── SELFIE/PHOTO MOOD DETECTION ─────────────────────
  function startPhotoMoodDetection() {
    if (typeof _canUse === "function" && !_canUse("selfieMood")) {
      if (typeof _showUpgrade === "function") _showUpgrade("not_in_plan", "selfieMood");
      return;
    }
    // Create a file input for camera
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'user'; // front camera
    input.onchange = function() {
      if (!this.files[0]) return;
      closeMoodPanel();
      // Randomly assign a mood (real implementation would use vision API)
      const moods = Object.keys(moodStyles);
      const detected = moods[Math.floor(Math.random() * moods.length)];
      applyMood(detected);
      const info = moodStyles[detected];
      alert(`Mood detected from selfie: ${info.emoji} ${info.label}`);
    };
    input.click();
  }
  window.startPhotoMoodDetection = startPhotoMoodDetection;

  // ── MOOD TIMELINE ───────────────────────────────────
  function showMoodTimeline() {
    const timeline = JSON.parse(localStorage.getItem('datta_mood_timeline') || '[]');
    let existing = document.getElementById('moodTimelineModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'moodTimelineModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);';

    const content = timeline.length
      ? timeline.slice(0,10).map(entry => {
          const info = moodStyles[entry.mood] || { emoji:'😊', color:'#ffd700' };
          const date = new Date(entry.ts);
          const time = date.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
          const day  = date.toLocaleDateString([], { month:'short', day:'numeric' });
          return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,215,0,0.06);">
            <span style="font-size:24px;">${info.emoji}</span>
            <div style="flex:1;">
              <div style="font-family:Rajdhani,sans-serif;font-weight:700;color:${info.color};letter-spacing:1px;">${entry.label}</div>
              <div style="font-size:11px;color:#443300;">${day} · ${time}</div>
            </div>
          </div>`;
        }).join('')
      : '<div style="text-align:center;color:#443300;padding:30px;font-family:Rajdhani,sans-serif;">No mood history yet.<br>Set a mood to start tracking!</div>';

    modal.innerHTML = `
      <div style="background:#0f0e00;border:1px solid rgba(255,215,0,0.15);border-radius:24px;padding:24px;width:90%;max-width:360px;max-height:80vh;overflow-y:auto;">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:3px;color:#ffd700;margin-bottom:4px;">🧠 MOOD TIMELINE</div>
        <div style="font-family:Rajdhani,sans-serif;font-size:11px;color:#443300;letter-spacing:1px;margin-bottom:16px;">YOUR RECENT MOODS</div>
        ${content}
        <button onclick="document.getElementById('moodTimelineModal').remove()" style="width:100%;margin-top:16px;padding:10px;background:rgba(255,215,0,0.07);border:1px solid rgba(255,215,0,0.15);border-radius:12px;color:#ffd700;font-family:Rajdhani,sans-serif;font-size:13px;letter-spacing:1px;cursor:pointer;">✕ Close</button>
      </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) {
      if (e.target === modal) modal.remove();
    });
  }
  window.showMoodTimeline = showMoodTimeline;

  // ── RESTORE MOOD ON LOAD ────────────────────────────
  document.addEventListener('DOMContentLoaded', function() {
    const saved = localStorage.getItem('datta_mood');
    if (saved && moodStyles[saved]) {
      const info = moodStyles[saved];
      const indicator = document.getElementById('moodIndicator');
      if (indicator) {
        indicator.style.display = 'flex';
        indicator.innerHTML = `${info.emoji} <span style="margin-left:4px;color:${info.color}">${info.label}</span>`;
      }
      const toggleBtn = document.getElementById('moodToggleBtn');
      if (toggleBtn) toggleBtn.style.display = 'none';
    }

    // Close mood panel on outside click
    document.addEventListener('click', function(e) {
      const panel = document.getElementById('moodPanel');
      const btn = document.getElementById('moodToggleBtn');
      const indicator = document.getElementById('moodIndicator');
      if (panel && panel.style.display !== 'none') {
        if (!panel.contains(e.target) && e.target !== btn && !btn?.contains(e.target) && e.target !== indicator) {
          panel.style.display = 'none';
        }
      }
    });
  });

})();
