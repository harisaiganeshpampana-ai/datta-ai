// datta-features.js — Datta AI Extra Features

// ── VOICE OVERLAY ──────────────────────────────────────
function startAssistantOverlay() {
  if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
    alert("Voice not supported. Please use Chrome!"); return;
  }
  let overlay = document.getElementById("voiceOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "voiceOverlay";
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;backdrop-filter:blur(20px);";
    overlay.innerHTML = `
      <div style="width:88px;height:88px;border-radius:50%;background:linear-gradient(135deg,var(--accent),#ff8c00);display:flex;align-items:center;justify-content:center;font-size:34px;box-shadow:0 0 60px rgba(255,215,0,0.4);animation:vPulse 1.5s ease-in-out infinite;">🎙️</div>
      <div id="voiceStatus" style="margin-top:18px;font-family:'Rajdhani',sans-serif;font-size:13px;letter-spacing:2px;color:#ffd700;text-transform:uppercase;">Listening...</div>
      <div id="voiceTranscript" style="margin-top:10px;font-size:14px;color:#665500;max-width:280px;text-align:center;min-height:22px;padding:0 20px;"></div>
      <button onclick="document.getElementById('voiceOverlay').remove()" style="margin-top:28px;padding:10px 24px;background:none;border:1px solid rgba(255,215,0,0.2);border-radius:50px;color:#443300;font-family:'Rajdhani',sans-serif;font-size:13px;letter-spacing:1px;cursor:pointer;">✕ Cancel</button>
      <style>@keyframes vPulse{0%,100%{box-shadow:0 0 40px rgba(255,215,0,0.3)}50%{box-shadow:0 0 80px rgba(255,215,0,0.7)}}</style>`;
    document.body.appendChild(overlay);
  }
  overlay.style.display = "flex";
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const r = new SR();
  const lang = localStorage.getItem("datta_language") || "English";
  const map = {Hindi:"hi-IN",Telugu:"te-IN",Tamil:"ta-IN",Spanish:"es-ES",French:"fr-FR",Arabic:"ar-SA",Chinese:"zh-CN",Japanese:"ja-JP",German:"de-DE",Kannada:"kn-IN",Malayalam:"ml-IN"};
  r.lang = map[lang] || "en-US";
  r.interimResults = true;
  r.onresult = e => {
    const t = Array.from(e.results).map(r=>r[0].transcript).join("");
    const el = document.getElementById("voiceTranscript");
    if (el) el.textContent = t;
    if (e.results[e.results.length-1].isFinal) {
      overlay.remove();
      const input = document.getElementById("message");
      if (input) input.value = t;
      if (typeof send === "function") send();
    }
  };
  r.onerror = () => { const s = document.getElementById("voiceStatus"); if(s) s.textContent="Error — try again"; setTimeout(()=>overlay.remove(),1500); };
  r.onend = () => setTimeout(() => { if(overlay.parentNode) overlay.remove(); }, 800);
  r.start();
}
window.startAssistantOverlay = startAssistantOverlay;

// ── SHOW SECTION ───────────────────────────────────────
function showSection(name) {
  document.querySelectorAll(".navItem").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".navItem").forEach(b => {
    if (b.textContent.trim().toLowerCase().includes(name.toLowerCase())) b.classList.add("active");
  });
  ["chats","projects","artifacts"].forEach(s => {
    const el = document.getElementById("section-"+s);
    if (el) el.style.display = s===name ? "flex" : "none";
  });
  const label = document.getElementById("recentsLabel");
  if (label) label.textContent = {chats:"RECENTS",projects:"PROJECTS",artifacts:"ARTIFACTS"}[name] || "RECENTS";
}
window.showSection = showSection;

// ── SEARCH CHATS ───────────────────────────────────────
function searchChats() {
  const q = (document.getElementById("search")?.value||"").toLowerCase().trim();
  const chats = JSON.parse(localStorage.getItem("datta_chats")||"{}");
  const history = document.getElementById("history");
  if (!history) return;
  const all = Object.values(chats).sort((a,b)=>b.ts-a.ts);
  const filtered = q ? all.filter(c=>c.title.toLowerCase().includes(q)) : all;
  if (!filtered.length) {
    history.innerHTML = `<div style="padding:20px;text-align:center;font-size:12px;color:#332200;">No chats found</div>`;
    return;
  }
  history.innerHTML = filtered.map(c=>`
    <div class="chatItem" onclick="openChat('${c.id}')" title="${c.title}">
      <span class="chatTitle">${c.title}</span>
      <button class="deleteBtn" onclick="deleteChat('${c.id}',event)">✕</button>
    </div>`).join("");
}
window.searchChats = searchChats;

// ── DELETE ALL CHATS ───────────────────────────────────
function deleteAllChats() {
  if (!confirm("Delete all chat history? This cannot be undone.")) return;
  localStorage.removeItem("datta_chats");
  if (typeof newChat==="function") newChat();
  if (typeof renderHistory==="function") renderHistory();
}
window.deleteAllChats = deleteAllChats;

// ── CODE COPY BUTTONS ──────────────────────────────────
document.addEventListener("click", function(e) {
  if (e.target.classList.contains("codeCopy")) {
    const pre = e.target.closest("pre");
    if (pre) {
      navigator.clipboard.writeText(pre.querySelector("code")?.textContent || pre.textContent).then(()=>{
        e.target.textContent="✅ Copied";
        setTimeout(()=>e.target.textContent="📋 Copy",1500);
      });
    }
  }
});
function addCodeCopyButtons() {
  document.querySelectorAll(".aiBubble pre:not([data-copy])").forEach(pre => {
    pre.setAttribute("data-copy","1");
    const btn = document.createElement("button");
    btn.className="codeCopy"; btn.textContent="📋 Copy";
    pre.style.position="relative"; pre.appendChild(btn);
  });
}
setInterval(addCodeCopyButtons, 1200);
window.addCodeCopyButtons = addCodeCopyButtons;

// ── AUTH GUARD ─────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function() {
  if (typeof renderHistory==="function") renderHistory();
  const token = localStorage.getItem("datta_token");
  const userRaw = localStorage.getItem("datta_user");
  if (!token || !userRaw || userRaw==="null") {
    const p = window.location.pathname;
    if (p.includes("index.html") || p.endsWith("/datta-ai/") || p.endsWith("/")) {
      window.location.href = "login.html";
    }
  }
});
