// datta-features.js — Datta AI Extra Features

// ── VOICE OVERLAY ──────────────────────────────────────
function startAssistantOverlay() {
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    alert('Voice not supported. Please use Chrome!');
    return;
  }

  // Create overlay
  let overlay = document.getElementById('voiceOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'voiceOverlay';
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.9);
      z-index:9999;display:flex;flex-direction:column;
      align-items:center;justify-content:center;
      backdrop-filter:blur(20px);
    `;
    overlay.innerHTML = `
      <div style="width:90px;height:90px;border-radius:50%;background:linear-gradient(135deg,var(--accent),#ff8c00);
        display:flex;align-items:center;justify-content:center;font-size:36px;
        box-shadow:0 0 60px rgba(255,215,0,0.4);animation:voicePulse 1.5s ease-in-out infinite;">
        🎙️
      </div>
      <div id="voiceStatus" style="margin-top:20px;font-family:'Rajdhani',sans-serif;font-size:14px;
        letter-spacing:2px;color:#ffd700;text-transform:uppercase;">Listening...</div>
      <div id="voiceTranscript" style="margin-top:10px;font-size:15px;color:#665500;
        max-width:300px;text-align:center;min-height:24px;"></div>
      <button onclick="document.getElementById('voiceOverlay').remove()" style="
        margin-top:30px;padding:10px 24px;background:none;
        border:1px solid rgba(255,215,0,0.2);border-radius:50px;
        color:#443300;font-family:'Rajdhani',sans-serif;font-size:13px;
        letter-spacing:1px;cursor:pointer;">✕ Cancel</button>
      <style>
        @keyframes voicePulse {
          0%,100%{box-shadow:0 0 40px rgba(255,215,0,0.3);}
          50%{box-shadow:0 0 80px rgba(255,215,0,0.7);}
        }
      </style>
    `;
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const r = new SR();
  const lang = localStorage.getItem('datta_language') || 'English';
  const langMap = { Hindi:'hi-IN', Telugu:'te-IN', Tamil:'ta-IN', Spanish:'es-ES', French:'fr-FR', Arabic:'ar-SA', Chinese:'zh-CN', Japanese:'ja-JP', German:'de-DE' };
  r.lang = langMap[lang] || 'en-US';
  r.interimResults = true;

  r.onresult = function(e) {
    const t = Array.from(e.results).map(r=>r[0].transcript).join('');
    const transcriptEl = document.getElementById('voiceTranscript');
    if (transcriptEl) transcriptEl.textContent = t;
    if (e.results[e.results.length-1].isFinal) {
      overlay.remove();
      const input = document.getElementById('message');
      if (input) input.value = t;
      if (typeof send === 'function') send();
    }
  };

  r.onerror = function() {
    const status = document.getElementById('voiceStatus');
    if (status) status.textContent = 'Error — try again';
    setTimeout(() => overlay.remove(), 1500);
  };

  r.onend = function() {
    setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 1000);
  };

  r.start();
}
window.startAssistantOverlay = startAssistantOverlay;

// ── SIDEBAR TABS (Chats / Projects / Artifacts) ────────
document.addEventListener('DOMContentLoaded', function() {
  // Render chat history
  if (typeof renderHistory === 'function') renderHistory();

  // Tab switching in sidebar
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', function() {
      const tab = this.dataset.tab;
      document.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      document.querySelectorAll('[data-tabcontent]').forEach(c => {
        c.style.display = c.dataset.tabcontent === tab ? 'block' : 'none';
      });
    });
  });

  // New Chat button
  document.querySelectorAll('[onclick*="newChat"], .newChatBtn').forEach(btn => {
    btn.addEventListener('click', function(e) {
      if (typeof newChat === 'function') newChat();
    });
  });

  // Auth guard — redirect to login if not authenticated
  const token = localStorage.getItem('datta_token');
  const userRaw = localStorage.getItem('datta_user');
  if (!token || !userRaw || userRaw === 'null') {
    // Only redirect on the main index page
    if (window.location.pathname.includes('index.html') || window.location.pathname.endsWith('/')) {
      window.location.href = 'login.html';
    }
  }
});

// ── DELETE ALL CHATS ───────────────────────────────────
function deleteAllChats() {
  if (!confirm('Delete all chat history? This cannot be undone.')) return;
  localStorage.removeItem('datta_chats');
  if (typeof newChat === 'function') newChat();
  if (typeof renderHistory === 'function') renderHistory();
}
window.deleteAllChats = deleteAllChats;

// ── COPY CODE BLOCKS ───────────────────────────────────
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('codeCopy')) {
    const pre = e.target.closest('pre');
    if (pre) {
      const code = pre.querySelector('code')?.textContent || pre.textContent;
      navigator.clipboard.writeText(code).then(() => {
        e.target.textContent = '✅ Copied';
        setTimeout(() => e.target.textContent = '📋 Copy', 1500);
      });
    }
  }
});

// Add copy button to code blocks after AI message renders
function addCodeCopyButtons() {
  document.querySelectorAll('.aiBubble pre:not([data-copy-added])').forEach(pre => {
    pre.setAttribute('data-copy-added','1');
    const btn = document.createElement('button');
    btn.className = 'codeCopy';
    btn.textContent = '📋 Copy';
    pre.style.position = 'relative';
    pre.appendChild(btn);
  });
}
// Run periodically to catch newly added messages
setInterval(addCodeCopyButtons, 1000);
window.addCodeCopyButtons = addCodeCopyButtons;
