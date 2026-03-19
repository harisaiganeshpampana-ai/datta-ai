// datta-features.js — Datta AI Extra Features

// ── VOICE OVERLAY ──────────────────────────────────────
function startAssistantOverlay() {
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    alert('Voice not supported. Please use Chrome!');
    return;
  }
  let overlay = document.getElementById('voiceOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'voiceOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;backdrop-filter:blur(20px);';
    overlay.innerHTML = `
      <div style="width:90px;height:90px;border-radius:50%;background:linear-gradient(135deg,var(--accent),#ff8c00);display:flex;align-items:center;justify-content:center;font-size:36px;box-shadow:0 0 60px rgba(255,215,0,0.4);animation:voicePulse 1.5s ease-in-out infinite;">
        🎙️
      </div>
      <div id="voiceStatus" style="margin-top:20px;font-family:'Rajdhani',sans-serif;font-size:14px;letter-spacing:2px;color:#ffd700;text-transform:uppercase;">Listening...</div>
      <div id="voiceTranscript" style="margin-top:10px;font-size:15px;color:#665500;max-width:300px;text-align:center;min-height:24px;"></div>
      <button onclick="document.getElementById('voiceOverlay').remove()" style="margin-top:30px;padding:10px 24px;background:none;border:1px solid rgba(255,215,0,0.2);border-radius:50px;color:#443300;font-family:'Rajdhani',sans-serif;font-size:13px;letter-spacing:1px;cursor:pointer;">Cancel</button>
      <style>@keyframes voicePulse{0%,100%{box-shadow:0 0 40px rgba(255,215,0,0.3);}50%{box-shadow:0 0 80px rgba(255,215,0,0.7);}}</style>
    `;
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const r = new SR();
  const lang = localStorage.getItem('datta_language') || 'English';
  const langMap = {Hindi:'hi-IN',Telugu:'te-IN',Tamil:'ta-IN',Spanish:'es-ES',French:'fr-FR',Arabic:'ar-SA',Chinese:'zh-CN',Japanese:'ja-JP',German:'de-DE'};
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
    const s = document.getElementById('voiceStatus');
    if (s) s.textContent = 'Error — try again';
    setTimeout(() => overlay.remove(), 1500);
  };
  r.onend = function() { setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 1000); };
  r.start();
}
window.startAssistantOverlay = startAssistantOverlay;

// ── SHOW SECTION (Chats / Projects / Artifacts tabs) ──
function showSection(name) {
  document.querySelectorAll('.navItem').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.navItem').forEach(btn => {
    if (btn.textContent.trim().toLowerCase().includes(name.toLowerCase())) btn.classList.add('active');
  });
  ['chats','projects','artifacts'].forEach(s => {
    const el = document.getElementById('section-' + s);
    if (el) el.style.display = (s === name) ? 'flex' : 'none';
  });
  const label = document.getElementById('recentsLabel');
  if (label) {
    const labels = {chats:'RECENTS', projects:'PROJECTS', artifacts:'ARTIFACTS'};
    label.textContent = labels[name] || 'RECENTS';
  }
}
window.showSection = showSection;

// ── SEARCH CHATS ───────────────────────────────────────
function searchChats() {
  const query = (document.getElementById('search')?.value || '').toLowerCase().trim();
  const chats = JSON.parse(localStorage.getItem('datta_chats') || '{}');
  const history = document.getElementById('history');
  if (!history) return;
  const all = Object.values(chats).sort((a,b) => b.ts - a.ts);
  const filtered = query ? all.filter(c => c.title.toLowerCase().includes(query)) : all;
  if (!filtered.length) {
    history.innerHTML = '<div class="emptySection" style="font-size:12px;color:#332200;padding:20px;text-align:center;">No chats found</div>';
    return;
  }
  history.innerHTML = filtered.map(c => `
    <div class="chatItem" onclick="openChat('${c.id}')">
      <span class="chatTitle">${c.title}</span>
      <button class="deleteBtn" onclick="deleteChat('${c.id}',event)">x</button>
    </div>`).join('');
}
window.searchChats = searchChats;

// ── DELETE ALL CHATS ───────────────────────────────────
function deleteAllChats() {
  if (!confirm('Delete all chat history? This cannot be undone.')) return;
  localStorage.removeItem('datta_chats');
  if (typeof newChat === 'function') newChat();
  if (typeof renderHistory === 'function') renderHistory();
}
window.deleteAllChats = deleteAllChats;

// ── CODE COPY BUTTONS ──────────────────────────────────
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('codeCopy')) {
    const pre = e.target.closest('pre');
    if (pre) {
      const code = pre.querySelector('code')?.textContent || pre.textContent;
      navigator.clipboard.writeText(code).then(() => {
        e.target.textContent = 'Copied!';
        setTimeout(() => e.target.textContent = 'Copy', 1500);
      });
    }
  }
});
function addCodeCopyButtons() {
  document.querySelectorAll('.aiBubble pre:not([data-copy-added])').forEach(pre => {
    pre.setAttribute('data-copy-added','1');
    const btn = document.createElement('button');
    btn.className = 'codeCopy';
    btn.textContent = 'Copy';
    pre.style.position = 'relative';
    pre.appendChild(btn);
  });
}
setInterval(addCodeCopyButtons, 1000);
window.addCodeCopyButtons = addCodeCopyButtons;

// ── INIT ON DOM READY ──────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  if (typeof renderHistory === 'function') renderHistory();

  // Auth guard
  const token = localStorage.getItem('datta_token');
  const userRaw = localStorage.getItem('datta_user');
  if (!token || !userRaw || userRaw === 'null') {
    if (window.location.pathname.includes('index.html') || window.location.pathname.endsWith('/')) {
      window.location.href = 'login.html';
    }
  }
});
