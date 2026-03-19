// datta-features2.js — Datta AI Extended Features v2

// ── FILE / IMAGE READING for AI ───────────────────────
window.selectedFileData = null;

function readFileForAI(file) {
  return new Promise((resolve) => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => resolve({ type: 'image', data: e.target.result, name: file.name });
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = e => resolve({ type: 'text', data: e.target.result, name: file.name });
      reader.readAsText(file);
    }
  });
}

window.addEventListener('load', function() {
  ['imageInput','cameraInput','photoInput'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', async function() {
      if (!this.files[0]) return;
      const fileData = await readFileForAI(this.files[0]);
      window.selectedFileData = fileData;
      const preview = document.getElementById('filePreview');
      const wrap = document.getElementById('filePreviewWrap');
      if (preview) preview.textContent = (fileData.type === 'image' ? 'Image: ' : 'File: ') + fileData.name;
      if (wrap) wrap.style.display = 'block';
    });
  });

  // Init web search toggle button
  setTimeout(function() {
    const inputRightBtns = document.querySelector('.inputRightBtns');
    if (!inputRightBtns || document.getElementById('webSearchToggleBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'webSearchToggleBtn';
    btn.title = 'Toggle Web Search';
    btn.style.cssText = 'background:none;border:none;cursor:pointer;padding:6px;border-radius:8px;font-size:16px;opacity:0.4;transition:all 0.2s;';
    btn.textContent = '🌐';
    btn.onclick = function() {
      window.webSearchEnabled = !window.webSearchEnabled;
      btn.style.opacity = window.webSearchEnabled ? '1' : '0.4';
      btn.style.background = window.webSearchEnabled ? 'rgba(255,215,0,0.1)' : 'none';
    };
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) inputRightBtns.insertBefore(btn, sendBtn);
  }, 600);

  // Live feed prompt restore
  const feedPrompt = localStorage.getItem('datta_feed_prompt');
  if (feedPrompt) {
    localStorage.removeItem('datta_feed_prompt');
    setTimeout(function() {
      const input = document.getElementById('message');
      if (input && typeof send === 'function') { input.value = feedPrompt; send(); }
    }, 1800);
  }
});

// ── KEYBOARD SHORTCUTS ────────────────────────────────
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    document.getElementById('message')?.focus();
  }
  if (e.key === 'Escape') {
    if (typeof closeMoodPanel === 'function') closeMoodPanel();
    const colorPanel = document.getElementById('colorPanel');
    if (colorPanel) colorPanel.style.display = 'none';
    const profileMenu = document.getElementById('profileMenu');
    if (profileMenu) profileMenu.style.display = 'none';
    document.getElementById('moodTimelineModal')?.remove();
    document.getElementById('limitModal')?.remove();
  }
});

// ── SMART MOOD DETECTION while typing ────────────────
document.addEventListener('DOMContentLoaded', function() {
  const input = document.getElementById('message');
  if (!input) return;
  let moodTimeout;
  input.addEventListener('input', function() {
    clearTimeout(moodTimeout);
    moodTimeout = setTimeout(function() {
      if (typeof detectMoodFromText === 'function' && input.value.length > 10) {
        const detected = detectMoodFromText(input.value);
        if (detected && !localStorage.getItem('datta_mood')) {
          if (typeof showAutoMoodPill === 'function') showAutoMoodPill(detected);
          window._tempMood = detected;
        }
      }
    }, 800);
  });
});

// ── TOAST NOTIFICATION HELPER ─────────────────────────
function showToast(message, color) {
  let toast = document.getElementById('globalToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'globalToast';
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#0f0e00;border:1px solid rgba(255,215,0,0.2);border-radius:50px;padding:10px 20px;font-family:Rajdhani,sans-serif;font-size:12px;letter-spacing:1px;color:#ffd700;z-index:9999;display:none;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,0.5);transition:opacity 0.3s;';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  if (color) toast.style.color = color;
  toast.style.display = 'block';
  toast.style.opacity = '1';
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => { toast.style.display = 'none'; }, 300);
  }, 2500);
}
window.showToast = showToast;

// ── XP SYSTEM (no send wrapping — just call addXP directly) ──
function addXP(amount, reason) {
  const xp = parseInt(localStorage.getItem('datta_xp') || '0') + amount;
  localStorage.setItem('datta_xp', xp);
  if (Math.random() < 0.3) showToast('+' + amount + ' XP — ' + reason, '#ffd700');
}
window.addXP = addXP;
