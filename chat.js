// ╔══════════════════════════════════════════════════════╗
// ║        DATTA AI — chat.js  v13 (FIXED ROUTES)       ║
// ║  Uses correct /chat endpoint with FormData + token  ║
// ╚══════════════════════════════════════════════════════╝

const SERVER = "https://datta-ai-server.onrender.com";

// ── STATE ──────────────────────────────────────────────
let messages = [];
let isGenerating = false;
let controller = null;
let currentChatId = null;
window.webSearchEnabled = false;

// ── FILL PROMPT (welcome badges & chips) ───────────────
function fillPrompt(text) {
  const input = document.getElementById("message");
  if (!input) return;
  input.value = text;
  input.focus();
  hideWelcome();
}
window.fillPrompt = fillPrompt;

function hideWelcome() {
  const ws = document.getElementById("welcomeScreen");
  if (ws) ws.style.display = "none";
}

function showWelcome() {
  const ws = document.getElementById("welcomeScreen");
  if (ws) ws.style.display = "flex";
  const chat = document.getElementById("chat");
  if (chat) chat.innerHTML = "";
  messages = [];
}

function newChat() {
  currentChatId = null;
  messages = [];
  showWelcome();
}
window.newChat = newChat;

// ── SEND MESSAGE ───────────────────────────────────────
async function send() {
  const input = document.getElementById("message");
  const text = (input?.value || "").trim();
  if (!text || isGenerating) return;

  input.value = "";
  hideWelcome();
  isGenerating = true;

  addMessage("user", text);
  messages.push({ role: "user", content: text });

  const typingId = addTyping();
  showStop();

  const lower = text.toLowerCase();
  const isImageRequest = /\b(generate|create|draw|make|paint|design)\b.*\bimage\b|\bimage of\b/i.test(text);
  const isSearchRequest = window.webSearchEnabled ||
    localStorage.getItem('datta_websearch_enabled') !== 'false' &&
    /\b(search|latest|news|today|current|who is|what is happening|2025|2026)\b/i.test(text);

  try {
    controller = new AbortController();

    if (isImageRequest) {
      // ── IMAGE GENERATION ──────────────────────────────
      removeTyping(typingId);
      const loadId = addTypingWithText("🎨 Generating image...");
      const imgPrompt = text.replace(/generate|create|draw|make|paint|design|image of|an image|a picture/gi,"").trim() || text;

      // Use Pollinations free API (no key needed)
      const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imgPrompt)}?width=512&height=512&nologo=true&seed=${Date.now()}`;
      removeTyping(loadId);
      addImageMessage(imageUrl, imgPrompt);
      messages.push({ role: "assistant", content: `[Generated image: ${imgPrompt}]` });

    } else if (isSearchRequest) {
      // ── WEB SEARCH via /chat with search instruction ──
      removeTyping(typingId);
      const searchId = addTypingWithText("🌐 Searching the web...");
      const searchPrompt = `Search the web and answer this question with current information: ${text}`;
      const reply = await callChatAPI(searchPrompt);
      removeTyping(searchId);
      addMessage("ai", reply);
      messages.push({ role: "assistant", content: reply });

    } else {
      // ── NORMAL AI CHAT ────────────────────────────────
      removeTyping(typingId);
      const reply = await callChatAPI(text);
      addMessage("ai", reply);
      messages.push({ role: "assistant", content: reply });
    }

    // Award XP
    if (typeof addXP === "function") addXP(5, "Message sent");
    // Auto-save chat
    saveChat();

  } catch (err) {
    removeTyping(typingId);
    if (err.name !== "AbortError") {
      addMessage("ai", "⚠️ Could not reach the server. Please try again.");
      console.error("Datta AI error:", err);
    }
  }

  isGenerating = false;
  controller = null;
  hideStop();
}
window.send = send;

// ── CORE API CALL — uses /chat with FormData + token ───
async function callChatAPI(userMessage) {
  const token = localStorage.getItem("datta_token") || "";
  const moodPrompt = getMoodSystemPrompt();

  // Build the full message with mood context
  const fullMessage = moodPrompt
    ? `[System: ${moodPrompt}]\n\nUser: ${userMessage}`
    : userMessage;

  const fd = new FormData();
  fd.append("message", fullMessage);
  fd.append("token", token);

  const res = await fetch(`${SERVER}/chat`, {
    method: "POST",
    body: fd,
    signal: controller ? controller.signal : undefined
  });

  if (!res.ok) {
    throw new Error(`Server error: ${res.status}`);
  }

  // Handle streaming response (same as support.html and translator.html)
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let reply = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    reply += dec.decode(value);
  }

  // Strip the CHATID suffix your backend appends
  reply = reply.split("CHATID")[0].trim();

  return reply || "I'm here to help!";
}

// ── MOOD SYSTEM PROMPT ─────────────────────────────────
function getMoodSystemPrompt() {
  const moodEnabled = localStorage.getItem("datta_mood_enabled") !== "false";
  if (!moodEnabled) return "";

  const mood = localStorage.getItem("datta_mood") || "";
  const lang = localStorage.getItem("datta_language") || "English";
  const langNote = lang !== "English" ? ` Always respond in ${lang}.` : "";

  const moods = {
    focused:  "Be sharp, concise and direct. No fluff.",
    happy:    "Be fun, energetic and enthusiastic! Use emojis.",
    stressed: "Be calm, reassuring and gentle. Step by step.",
    creative: "Be bold, imaginative and think outside the box!",
    lazy:     "Keep it super short and chill. Minimal words.",
    curious:  "Go deep! Explore ideas thoroughly with examples.",
    night:    "Be philosophical and thoughtful. Deep thinking mode."
  };

  const base = "You are Datta AI, a smart helpful assistant created by Ganesh (Pampana Hari Sai Ganesh).";
  const moodInstr = moods[mood] || "";
  return `${base} ${moodInstr}${langNote}`.trim();
}

// ── STOP GENERATION ────────────────────────────────────
function stopGeneration() {
  if (controller) controller.abort();
  isGenerating = false;
  hideStop();
}
window.stopGeneration = stopGeneration;

function showStop() {
  const stop = document.getElementById("stopBtn");
  const send = document.getElementById("sendBtn");
  if (stop) stop.style.display = "flex";
  if (send) send.style.display = "none";
}
function hideStop() {
  const stop = document.getElementById("stopBtn");
  const send = document.getElementById("sendBtn");
  if (stop) stop.style.display = "none";
  if (send) send.style.display = "flex";
}

// ── ADD MESSAGES ───────────────────────────────────────
function addMessage(role, text) {
  const chat = document.getElementById("chat");
  if (!chat) return;

  const row = document.createElement("div");
  row.className = "messageRow" + (role === "user" ? " userRow" : "");

  if (role === "user") {
    const bubble = document.createElement("div");
    bubble.className = "userBubble";
    bubble.textContent = text;
    row.appendChild(bubble);
  } else {
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = "✦";

    const bubble = document.createElement("div");
    bubble.className = "aiBubble stream";
    if (typeof marked !== "undefined") {
      bubble.innerHTML = marked.parse(text);
    } else {
      bubble.innerHTML = text.replace(/\n/g, "<br>");
    }

    // Read aloud if enabled
    if (localStorage.getItem("datta_voice_read") === "true") {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "en-US";
      window.speechSynthesis.speak(utter);
    }

    const actions = document.createElement("div");
    actions.className = "aiActions";
    actions.innerHTML = `
      <button class="actionBtn" title="Copy" onclick="navigator.clipboard.writeText(this.closest('.aiContent').querySelector('.aiBubble').textContent).then(()=>{this.textContent='✅';setTimeout(()=>this.textContent='📋',1500)})">📋</button>
      <button class="actionBtn" title="Read aloud" onclick="speakText(this)">🔊</button>
    `;
    actions.querySelector('[title="Read aloud"]')._text = text;

    const content = document.createElement("div");
    content.className = "aiContent";
    content.appendChild(bubble);
    content.appendChild(actions);

    row.appendChild(avatar);
    row.appendChild(content);
  }

  chat.appendChild(row);
  scrollToBottom();
  return row;
}
window.addMessage = addMessage;

// ── ADD IMAGE MESSAGE ──────────────────────────────────
function addImageMessage(url, prompt) {
  const chat = document.getElementById("chat");
  if (!chat) return;
  const row = document.createElement("div");
  row.className = "messageRow";
  row.innerHTML = `
    <div class="avatar">✦</div>
    <div class="aiContent">
      <div class="aiBubble" style="padding:10px;">
        <div style="font-size:12px;color:#665500;margin-bottom:8px;font-family:'Rajdhani',sans-serif;letter-spacing:1px;">🎨 Generated Image</div>
        <img src="${url}" alt="${prompt}"
          style="max-width:300px;width:100%;border-radius:12px;display:block;border:1px solid rgba(255,215,0,0.15);"
          onerror="this.parentElement.innerHTML='⚠️ Image failed to load. Try a different prompt.'"
        />
        <div style="font-size:11px;color:#443300;margin-top:6px;">${prompt}</div>
        <a href="${url}" download="datta-ai-image.jpg" target="_blank"
          style="display:inline-block;margin-top:8px;font-size:11px;color:#ffd700;font-family:'Rajdhani',sans-serif;letter-spacing:1px;text-decoration:none;border:1px solid rgba(255,215,0,0.2);padding:4px 10px;border-radius:8px;">
          ⬇️ Download
        </a>
      </div>
    </div>`;
  chat.appendChild(row);
  scrollToBottom();
}

// ── TYPING INDICATORS ──────────────────────────────────
function addTyping() {
  const id = "typing_" + Date.now();
  const chat = document.getElementById("chat");
  if (!chat) return id;
  const row = document.createElement("div");
  row.className = "messageRow";
  row.id = id;
  row.innerHTML = `<div class="avatar">✦</div><div class="aiContent"><div class="aiBubble typing"><span></span><span></span><span></span></div></div>`;
  chat.appendChild(row);
  scrollToBottom();
  return id;
}

function addTypingWithText(label) {
  const id = "typing_" + Date.now();
  const chat = document.getElementById("chat");
  if (!chat) return id;
  const row = document.createElement("div");
  row.className = "messageRow";
  row.id = id;
  row.innerHTML = `
    <div class="avatar">✦</div>
    <div class="aiContent">
      <div class="aiBubble">
        <div class="searchingIndicator">
          <span class="searchIcon">${label.split(" ")[0]}</span>
          <span class="searchText">${label.split(" ").slice(1).join(" ")}</span>
          <span style="display:inline-flex;gap:3px;margin-left:4px;">
            <span style="width:5px;height:5px;background:#ffd700;border-radius:50%;animation:dot 1.2s infinite;"></span>
            <span style="width:5px;height:5px;background:#ffd700;border-radius:50%;animation:dot 1.2s 0.2s infinite;"></span>
            <span style="width:5px;height:5px;background:#ffd700;border-radius:50%;animation:dot 1.2s 0.4s infinite;"></span>
          </span>
        </div>
      </div>
    </div>`;
  chat.appendChild(row);
  scrollToBottom();
  return id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ── SCROLL ─────────────────────────────────────────────
function scrollToBottom() {
  const chat = document.getElementById("chat");
  if (chat) chat.scrollTo({ top: chat.scrollHeight, behavior: "smooth" });
  const btn = document.getElementById("scrollDownBtn");
  if (btn) btn.style.display = "none";
}

window.addEventListener("load", function() {
  const chat = document.getElementById("chat");
  const btn = document.getElementById("scrollDownBtn");
  if (!chat || !btn) return;
  chat.addEventListener("scroll", function() {
    const dist = chat.scrollHeight - chat.scrollTop - chat.clientHeight;
    btn.style.display = dist > 100 ? "flex" : "none";
  });
  btn.addEventListener("click", function() {
    chat.scrollTo({ top: chat.scrollHeight, behavior: "smooth" });
  });
});

// ── SPEAK TEXT ─────────────────────────────────────────
function speakText(btn) {
  const text = btn._text || "";
  if (!text) return;
  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    btn.textContent = "🔊";
    return;
  }
  const utter = new SpeechSynthesisUtterance(text);
  const lang = localStorage.getItem("datta_language") || "English";
  const langMap = {Hindi:"hi-IN",Telugu:"te-IN",Tamil:"ta-IN",Spanish:"es-ES",French:"fr-FR",Arabic:"ar-SA",Chinese:"zh-CN",Japanese:"ja-JP",German:"de-DE"};
  utter.lang = langMap[lang] || "en-US";
  utter.onend = () => btn.textContent = "🔊";
  btn.textContent = "⏹️";
  window.speechSynthesis.speak(utter);
}
window.speakText = speakText;

// ── VOICE INPUT ────────────────────────────────────────
function startAssistant() {
  if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
    alert("Voice not supported. Please use Chrome!");
    return;
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const r = new SR();
  const lang = localStorage.getItem("datta_language") || "English";
  const langMap = {Hindi:"hi-IN",Telugu:"te-IN",Tamil:"ta-IN",Spanish:"es-ES",French:"fr-FR",Arabic:"ar-SA",Chinese:"zh-CN",Japanese:"ja-JP",German:"de-DE"};
  r.lang = langMap[lang] || "en-US";
  const micBtn = document.getElementById("micBtn");
  if (micBtn) { micBtn.style.color = "#ffd700"; }
  r.onresult = (e) => {
    if (micBtn) micBtn.style.color = "";
    const transcript = e.results[0][0].transcript;
    const input = document.getElementById("message");
    if (input) input.value = transcript;
    send();
  };
  r.onerror = () => { if (micBtn) micBtn.style.color = ""; };
  r.onend = () => { if (micBtn) micBtn.style.color = ""; };
  r.start();
}
window.startAssistant = startAssistant;

// ── ENTER KEY ──────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function() {
  const input = document.getElementById("message");
  if (input) {
    input.addEventListener("keydown", function(e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    });
  }

  // Make welcome badges clickable
  const badgeActions = {
    "AI Chat": () => { document.getElementById("message")?.focus(); },
    "Image Generation": () => fillPrompt("Generate image of "),
    "Web Search": () => fillPrompt("Search the web for "),
    "Voice Assistant": () => startAssistant()
  };
  document.querySelectorAll(".welcomeBadge").forEach(badge => {
    const label = badge.textContent.trim();
    const action = Object.keys(badgeActions).find(k => label.includes(k));
    if (action) {
      badge.style.cursor = "pointer";
      badge.addEventListener("click", badgeActions[action]);
    }
  });
});

// ── CHAT HISTORY ───────────────────────────────────────
function saveChat() {
  if (!messages.length) return;
  const id = currentChatId || ("chat_" + Date.now());
  currentChatId = id;
  const title = messages[0]?.content?.slice(0, 40) || "New Chat";
  const chats = JSON.parse(localStorage.getItem("datta_chats") || "{}");
  chats[id] = { id, title, messages, ts: Date.now() };
  localStorage.setItem("datta_chats", JSON.stringify(chats));
  if (typeof renderHistory === "function") renderHistory();
}
window.saveChat = saveChat;

function renderHistory() {
  const container = document.getElementById("history");
  if (!container) return;
  const chats = JSON.parse(localStorage.getItem("datta_chats") || "{}");
  const sorted = Object.values(chats).sort((a, b) => b.ts - a.ts);
  if (!sorted.length) {
    container.innerHTML = `<div class="emptySection" style="font-size:12px;padding:20px;text-align:center;color:#332200;">No chats yet</div>`;
    return;
  }
  container.innerHTML = sorted.map(c => `
    <div class="chatItem" onclick="openChat('${c.id}')">
      <span class="chatTitle">${c.title}</span>
      <button class="deleteBtn" onclick="deleteChat('${c.id}',event)">✕</button>
    </div>`).join("");
}
window.renderHistory = renderHistory;

function openChat(id) {
  const chats = JSON.parse(localStorage.getItem("datta_chats") || "{}");
  const chat = chats[id];
  if (!chat) return;
  currentChatId = id;
  messages = chat.messages || [];
  hideWelcome();
  const chatEl = document.getElementById("chat");
  if (chatEl) chatEl.innerHTML = "";
  messages.forEach(m => {
    if (m.role === "user") addMessage("user", m.content);
    else if (m.role === "assistant") addMessage("ai", m.content);
  });
  if (window.innerWidth < 900 && typeof closeSidebar === "function") closeSidebar();
}
window.openChat = openChat;

function deleteChat(id, e) {
  e.stopPropagation();
  const chats = JSON.parse(localStorage.getItem("datta_chats") || "{}");
  delete chats[id];
  localStorage.setItem("datta_chats", JSON.stringify(chats));
  if (currentChatId === id) newChat();
  renderHistory();
}
window.deleteChat = deleteChat;

function logout() {
  localStorage.removeItem("datta_token");
  localStorage.removeItem("datta_user");
  window.location.href = "login.html";
}
window.logout = logout;

window.addEventListener("load", function() {
  renderHistory();
});
