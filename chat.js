// ╔══════════════════════════════════════════════════════╗
// ║           DATTA AI — chat.js  v12 (FIXED)           ║
// ║  Connects to your Render backend (datta-ai-server)  ║
// ╚══════════════════════════════════════════════════════╝

// ── CONFIG ─────────────────────────────────────────────
// Change this to your Render backend URL
// ⚠️ Replace this with your EXACT Render backend URL
// From your screenshot, the service is: datta-ai-server
// Find your full URL at: dashboard.render.com → datta-ai-server → top of page
const SERVER = "https://datta-ai-server.onrender.com";

// ── STATE ──────────────────────────────────────────────
let messages = [];
let isGenerating = false;
let controller = null;
let currentChatId = null;
let webSearchEnabled = false;
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

// ── HIDE WELCOME SCREEN ────────────────────────────────
function hideWelcome() {
  const ws = document.getElementById("welcomeScreen");
  if (ws) ws.style.display = "none";
}

// ── SHOW WELCOME SCREEN ────────────────────────────────
function showWelcome() {
  const ws = document.getElementById("welcomeScreen");
  if (ws) ws.style.display = "flex";
  const chat = document.getElementById("chat");
  if (chat) chat.innerHTML = "";
  messages = [];
}

// ── NEW CHAT ───────────────────────────────────────────
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

  // Detect intent
  const lower = text.toLowerCase();
  const isImageRequest = /\b(generate|create|draw|make|paint|design)\b.*\bimage\b|\bimage of\b/i.test(text);
  const isSearchRequest = webSearchEnabled || /\b(search|latest|news|today|current|who is|what is happening|2025|2026)\b/i.test(text);

  try {
    controller = new AbortController();

    if (isImageRequest) {
      // ── IMAGE GENERATION ──────────────────────────────
      removeTyping(typingId);
      const loadId = addTypingWithText("🎨 Generating image...");
      const imgPrompt = text.replace(/generate|create|draw|make|paint|design|image of|an image|a picture/gi, "").trim() || text;

      const res = await fetch(`${SERVER}/api/image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: imgPrompt }),
        signal: controller.signal
      });

      removeTyping(loadId);

      if (res.ok) {
        const data = await res.json();
        const url = data.url || data.image || data.imageUrl;
        if (url) {
          addImageMessage(url, imgPrompt);
        } else {
          addMessage("ai", "⚠️ Image generated but URL missing. Try again!");
        }
      } else {
        // Fallback: use Pollinations (free, no key needed)
        const fallbackUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imgPrompt)}?width=512&height=512&nologo=true`;
        addImageMessage(fallbackUrl, imgPrompt);
      }

    } else if (isSearchRequest) {
      // ── WEB SEARCH ────────────────────────────────────
      removeTyping(typingId);
      const searchId = addTypingWithText("🌐 Searching the web...");

      const res = await fetch(`${SERVER}/api/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text }),
        signal: controller.signal
      });

      removeTyping(searchId);

      if (res.ok) {
        const data = await res.json();
        const reply = data.answer || data.result || data.response || JSON.stringify(data);
        addMessage("ai", reply);
        messages.push({ role: "assistant", content: reply });
      } else {
        // Fallback to normal AI chat if search fails
        await doAIChat(text, typingId);
      }

    } else {
      // ── AI CHAT (Groq) ────────────────────────────────
      removeTyping(typingId);
      await doAIChat(text, null);
    }

  } catch (err) {
    removeTyping(typingId);
    if (err.name !== "AbortError") {
      addMessage("ai", "⚠️ Could not reach the server. Check your internet or try again.");
      console.error("Datta AI error:", err);
    }
  }

  isGenerating = false;
  controller = null;
  hideStop();
}
window.send = send;

// ── CORE AI CHAT via Render/Groq ───────────────────────
async function doAIChat(userText, existingTypingId) {
  const typingId = existingTypingId || addTyping();

  // Get mood system prompt
  const moodPrompt = getMoodSystemPrompt();

  const payload = {
    messages: messages,
    system: moodPrompt || "You are Datta AI, a helpful, smart and friendly assistant. Be concise and clear."
  };

  try {
    const res = await fetch(`${SERVER}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined
    });

    removeTyping(typingId);

    if (res.ok) {
      const data = await res.json();
      const reply = data.reply || data.message || data.content || data.text || "I'm here! How can I help?";
      addMessage("ai", reply);
      messages.push({ role: "assistant", content: reply });
    } else {
      // Fallback: direct Groq API (if backend fails)
      await doDirectGroqChat(typingId);
    }
  } catch (e) {
    removeTyping(typingId);
    throw e;
  }
}

// ── FALLBACK: Direct AI (no backend needed) ────────────
async function doDirectGroqChat() {
  // Uses a free public proxy approach
  const moodPrompt = getMoodSystemPrompt();
  const systemMsg = moodPrompt || "You are Datta AI, a helpful smart assistant created by Ganesh. Be concise, friendly and helpful.";

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Note: In production, this should go through your backend!
      // This is only a fallback.
    },
    body: JSON.stringify({
      model: "llama3-8b-8192",
      messages: [
        { role: "system", content: systemMsg },
        ...messages
      ],
      max_tokens: 1024,
      temperature: 0.7
    }),
    signal: controller ? controller.signal : undefined
  });

  if (res.ok) {
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || "I'm here to help!";
    addMessage("ai", reply);
    messages.push({ role: "assistant", content: reply });
  } else {
    addMessage("ai", "⚠️ AI is temporarily unavailable. Please try again in a moment.");
  }
}

// ── GET MOOD SYSTEM PROMPT ─────────────────────────────
function getMoodSystemPrompt() {
  const mood = localStorage.getItem("datta_mood") || "";
  const lang = localStorage.getItem("datta_language") || "English";
  const langNote = lang !== "English" ? ` Always respond in ${lang}.` : "";
  const moods = {
    focused:  "Be sharp, concise and direct. No fluff. Get to the point immediately.",
    happy:    "Be fun, energetic and enthusiastic! Use emojis and keep it upbeat! 🎉",
    stressed: "Be calm, reassuring and gentle. Use soothing language. Take it step by step.",
    creative: "Be bold, imaginative and think outside the box! Use vivid language.",
    lazy:     "Keep responses super short and chill. Minimal words, max value. 😎",
    curious:  "Go deep! Explore ideas thoroughly with examples and interesting tangents.",
    night:    "Be philosophical, thoughtful and deep. Perfect for late-night pondering. 🌙"
  };
  const moodInstr = moods[mood] || "";
  return `You are Datta AI, a smart helpful assistant created by Ganesh (Pampana Hari Sai Ganesh). ${moodInstr}${langNote}`;
}

// ── STOP GENERATION ────────────────────────────────────
function stopGeneration() {
  if (controller) controller.abort();
  isGenerating = false;
  hideStop();
}
window.stopGeneration = stopGeneration;

// ── UI HELPERS ─────────────────────────────────────────
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

// ── ADD USER/AI MESSAGE ────────────────────────────────
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
    // Render markdown if available
    if (typeof marked !== "undefined") {
      bubble.innerHTML = marked.parse(text);
    } else {
      bubble.textContent = text;
    }

    // Action buttons
    const actions = document.createElement("div");
    actions.className = "aiActions";
    actions.innerHTML = `
      <button class="actionBtn" title="Copy" onclick="copyText(this)">📋</button>
      <button class="actionBtn" title="Read aloud" onclick="speakText(this)">🔊</button>
    `;
    actions.querySelector('[title="Copy"]')._text = text;
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
    </div>
  `;
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
  row.innerHTML = `
    <div class="avatar">✦</div>
    <div class="aiContent">
      <div class="aiBubble typing">
        <span></span><span></span><span></span>
      </div>
    </div>`;
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

// ── SCROLL TO BOTTOM (THE FIX!) ────────────────────────
function scrollToBottom() {
  // Scroll both the chat div and the welcomeScreen
  const chat = document.getElementById("chat");
  const ws = document.getElementById("welcomeScreen");
  const chatWrapper = document.querySelector(".chatWrapper");

  if (chat) {
    chat.scrollTop = chat.scrollHeight;
    // Smooth scroll
    chat.scrollTo({ top: chat.scrollHeight, behavior: "smooth" });
  }
  if (chatWrapper) {
    chatWrapper.scrollTop = chatWrapper.scrollHeight;
  }

  // Show/hide scroll down button
  const btn = document.getElementById("scrollDownBtn");
  if (btn) btn.style.display = "none";
}

// ── SCROLL DOWN BUTTON LOGIC ───────────────────────────
window.addEventListener("load", function () {
  const chat = document.getElementById("chat");
  const btn = document.getElementById("scrollDownBtn");
  if (!chat || !btn) return;

  chat.addEventListener("scroll", function () {
    const distFromBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight;
    btn.style.display = distFromBottom > 100 ? "flex" : "none";
  });

  btn.addEventListener("click", function () {
    chat.scrollTo({ top: chat.scrollHeight, behavior: "smooth" });
  });
});

// ── COPY TEXT ──────────────────────────────────────────
function copyText(btn) {
  const text = btn._text || btn.closest(".aiContent")?.querySelector(".aiBubble")?.textContent || "";
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = "✅";
    setTimeout(() => (btn.textContent = "📋"), 1500);
  });
}
window.copyText = copyText;

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
  utter.lang = "en-US";
  utter.onend = () => (btn.textContent = "🔊");
  btn.textContent = "⏹️";
  window.speechSynthesis.speak(utter);
}
window.speakText = speakText;

// ── VOICE INPUT ────────────────────────────────────────
function startAssistant() {
  if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
    alert("Voice not supported. Please use Chrome browser!");
    return;
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const r = new SR();
  const lang = localStorage.getItem("datta_language") || "English";
  const langMap = { Hindi: "hi-IN", Telugu: "te-IN", Tamil: "ta-IN", Spanish: "es-ES", French: "fr-FR", Arabic: "ar-SA", Chinese: "zh-CN", Japanese: "ja-JP", German: "de-DE" };
  r.lang = langMap[lang] || "en-US";
  r.interimResults = false;

  const micBtn = document.getElementById("micBtn");
  if (micBtn) micBtn.style.color = "#ffd700";

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
document.addEventListener("DOMContentLoaded", function () {
  const input = document.getElementById("message");
  if (input) {
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
  }

  // Fix welcome badges — make them clickable
  const badgeActions = {
    "AI Chat": () => { document.getElementById("message")?.focus(); hideWelcome(); },
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

// ── CHAT HISTORY (localStorage) ────────────────────────
function saveChat() {
  if (!messages.length) return;
  const id = currentChatId || ("chat_" + Date.now());
  currentChatId = id;
  const title = messages[0]?.content?.slice(0, 40) || "New Chat";
  const chats = JSON.parse(localStorage.getItem("datta_chats") || "{}");
  chats[id] = { id, title, messages, ts: Date.now() };
  localStorage.setItem("datta_chats", JSON.stringify(chats));
  renderHistory();
}
window.saveChat = saveChat;

function renderHistory() {
  const container = document.getElementById("chatHistory");
  if (!container) return;
  const chats = JSON.parse(localStorage.getItem("datta_chats") || "{}");
  const sorted = Object.values(chats).sort((a, b) => b.ts - a.ts);
  if (!sorted.length) {
    container.innerHTML = `<div class="emptySection">No chats yet</div>`;
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

// Auto-save after each AI reply
const _origAddMsg = addMessage;
window.addEventListener("load", function () {
  renderHistory();
});

// Save chat periodically when active
setInterval(() => { if (messages.length) saveChat(); }, 10000);

// ── LOGOUT ─────────────────────────────────────────────
function logout() {
  localStorage.removeItem("datta_user");
  localStorage.removeItem("datta_token");
  window.location.href = "login.html";
}
window.logout = logout;
