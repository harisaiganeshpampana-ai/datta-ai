// ╔══════════════════════════════════════════════════════╗
// ║        DATTA AI — chat.js  v14                      ║
// ║  Fixed: badges, chips, newChat, recents, username   ║
// ╚══════════════════════════════════════════════════════╝

// ── SELF-CONTAINED PLAN CHECKER ───────────────────────
// Works independently — no need to wait for plan-limits.js
var DATTA_PLAN_FEATURES = {
  arambh: { aiChat:true, webSearch:true, liveFeed:true, voiceAssistant:true,
            moodAI:false, imageGen:false, fileUpload:false, smartMemory:false,
            analytics:false, dailyBriefing:false, translator:false,
            emotionalSupport:false, xpGamification:false, selfieMood:false },
  shakti: { aiChat:true, webSearch:true, liveFeed:true, voiceAssistant:true,
            moodAI:true, imageGen:true, fileUpload:false, smartMemory:true,
            analytics:true, dailyBriefing:true, translator:true,
            emotionalSupport:true, xpGamification:true, selfieMood:false },
  agni:   { aiChat:true, webSearch:true, liveFeed:true, voiceAssistant:true,
            moodAI:true, imageGen:true, fileUpload:true, smartMemory:true,
            analytics:true, dailyBriefing:true, translator:true,
            emotionalSupport:true, xpGamification:true, selfieMood:true },
  brahma: { aiChat:true, webSearch:true, liveFeed:true, voiceAssistant:true,
            moodAI:true, imageGen:true, fileUpload:true, smartMemory:true,
            analytics:true, dailyBriefing:true, translator:true,
            emotionalSupport:true, xpGamification:true, selfieMood:true }
};
var DATTA_PLAN_LIMITS = {
  arambh: { msgsPerHr:50,  cooldownMin:60, imagesPerDay:3   },
  shakti: { msgsPerHr:150, cooldownMin:45, imagesPerDay:10  },
  agni:   { msgsPerHr:500, cooldownMin:30, imagesPerDay:20  },
  brahma: { msgsPerHr:1000,cooldownMin:15, imagesPerDay:100 }
};
function _isCreator() {
  try {
    var u = (JSON.parse(localStorage.getItem('datta_user')||'{}').username||'').toLowerCase();
    return ['pampana_hari_sai_ganesh','harisaiganesh','ganesh','admin','creator','dattaai'].some(function(c){return u.indexOf(c)!==-1});
  } catch(e){return false;}
}
function _getPlan() {
  var k = localStorage.getItem('datta_plan')||'arambh';
  return DATTA_PLAN_FEATURES[k] ? k : 'arambh';
}
function _canUse(feature) {
  if (_isCreator()) return true;
  var plan = _getPlan();
  return DATTA_PLAN_FEATURES[plan] && DATTA_PLAN_FEATURES[plan][feature] === true;
}
function _canSendMsg() {
  if (_isCreator()) return {ok:true};
  var plan = _getPlan();
  var limits = DATTA_PLAN_LIMITS[plan];
  var today = new Date().toDateString();
  var usage = {};
  try { usage = JSON.parse(localStorage.getItem('datta_usage')||'{}'); } catch(e){}
  if (usage.date !== today) {
    usage = {date:today, msgs:0, images:0, msgsThisHour:0, hourStart:Date.now()};
    localStorage.setItem('datta_usage', JSON.stringify(usage));
  }
  if (Date.now() - (usage.hourStart||0) > 3600000) {
    usage.msgsThisHour = 0; usage.hourStart = Date.now();
    localStorage.setItem('datta_usage', JSON.stringify(usage));
  }
  if ((usage.msgsThisHour||0) >= limits.msgsPerHr) {
    var resetIn = Math.ceil((usage.hourStart + 3600000 - Date.now()) / 60000);
    return {ok:false, reason:'msg_limit', resetIn:resetIn, limit:limits.msgsPerHr};
  }
  return {ok:true};
}
function _canGenImg() {
  if (_isCreator()) return {ok:true};
  if (!_canUse('imageGen')) return {ok:false, reason:'not_in_plan', feature:'imageGen'};
  var plan = _getPlan();
  var today = new Date().toDateString();
  var usage = {};
  try { usage = JSON.parse(localStorage.getItem('datta_usage')||'{}'); } catch(e){}
  if (usage.date !== today) usage = {date:today, imgs:0};
  if ((usage.images||0) >= DATTA_PLAN_LIMITS[plan].imagesPerDay) {
    return {ok:false, reason:'img_limit', limit:DATTA_PLAN_LIMITS[plan].imagesPerDay};
  }
  return {ok:true};
}
function _recordMsg() {
  if (_isCreator()) return;
  var usage = {};
  try { usage = JSON.parse(localStorage.getItem('datta_usage')||'{}'); } catch(e){}
  if (usage.date !== new Date().toDateString()) usage = {date:new Date().toDateString(), msgs:0, images:0, msgsThisHour:0, hourStart:Date.now()};
  usage.msgsThisHour = (usage.msgsThisHour||0)+1;
  usage.msgs = (usage.msgs||0)+1;
  localStorage.setItem('datta_usage', JSON.stringify(usage));
}
function _recordImg() {
  if (_isCreator()) return;
  var usage = {};
  try { usage = JSON.parse(localStorage.getItem('datta_usage')||'{}'); } catch(e){}
  if (usage.date !== new Date().toDateString()) usage = {date:new Date().toDateString(), msgs:0, images:0, msgsThisHour:0, hourStart:Date.now()};
  usage.images = (usage.images||0)+1;
  localStorage.setItem('datta_usage', JSON.stringify(usage));
}
function _showUpgrade(reason, feature) {
  var FEATURE_NAMES = {
    moodAI:'😊 Mood-based AI', imageGen:'🎨 Image Generation',
    fileUpload:'📎 File Upload', smartMemory:'🧾 Smart Memory',
    analytics:'📊 Analytics', translator:'🌍 Translator',
    xpGamification:'🎮 XP Gamification', selfieMood:'📸 Selfie Mood',
    dailyBriefing:'📅 Daily Briefing'
  };
  var UNLOCK = {moodAI:'Shakti',imageGen:'Shakti',fileUpload:'Agni',
    smartMemory:'Shakti',analytics:'Shakti',translator:'Shakti',
    xpGamification:'Shakti',selfieMood:'Agni',dailyBriefing:'Shakti'};
  var plan = _getPlan();
  var PNAMES = {arambh:'🌱 Arambh',shakti:'⚡ Shakti',agni:'🔥 Agni',brahma:'👑 Brahma'};
  var PLIMITS = {arambh:{msgsPerHr:50,imagesPerDay:3},shakti:{msgsPerHr:150,imagesPerDay:10},agni:{msgsPerHr:500,imagesPerDay:20},brahma:{msgsPerHr:1000,imagesPerDay:100}};
  var icon='🔒', title='LOCKED', desc='', sub='';
  if (reason==='msg_limit') {
    var check = _canSendMsg();
    icon='💬'; title='MESSAGE LIMIT REACHED';
    desc='Used all '+PLIMITS[plan].msgsPerHr+' messages/hr on '+PNAMES[plan]+' plan.';
    sub='Resets in ~'+(check.resetIn||60)+' min. Upgrade for more!';
  } else if (reason==='img_limit') {
    icon='🎨'; title='IMAGE LIMIT REACHED';
    desc='Used all '+PLIMITS[plan].imagesPerDay+' images/day on '+PNAMES[plan]+'.';
    sub='Upgrade for more daily images!';
  } else {
    var fname = FEATURE_NAMES[feature]||feature;
    var uplan = UNLOCK[feature]||'Shakti';
    icon='🔒'; title=fname+' LOCKED';
    desc='Requires '+uplan+' plan or higher.';
    sub='You are on '+PNAMES[plan]+'. Upgrade to unlock!';
  }
  document.getElementById('_upgradeModal')&&document.getElementById('_upgradeModal').remove();
  var m = document.createElement('div');
  m.id='_upgradeModal';
  m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(10px);';
  m.innerHTML='<div style="background:#0f0e00;border:1px solid rgba(255,215,0,0.25);border-radius:24px;padding:28px 24px;width:90%;max-width:320px;text-align:center;">'
    +'<div style="font-size:48px;margin-bottom:10px">'+icon+'</div>'
    +'<div style="font-family:sans-serif;font-size:15px;font-weight:700;color:#ffd700;margin-bottom:8px;letter-spacing:1px">'+title+'</div>'
    +'<div style="font-size:13px;color:#665500;margin-bottom:4px">'+desc+'</div>'
    +'<div style="font-size:12px;color:#443300;margin-bottom:20px">'+sub+'</div>'
    +'<button onclick="window.location.href='pricing.html'" style="width:100%;padding:13px;background:linear-gradient(135deg,#ffd700,#ff8c00);border:none;border-radius:50px;color:#000;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:8px;">👑 UPGRADE NOW</button>'
    +'<button onclick="document.getElementById('_upgradeModal').remove()" style="width:100%;padding:10px;background:none;border:1px solid rgba(255,215,0,0.15);border-radius:50px;color:#665500;font-size:12px;cursor:pointer;">Maybe later</button>'
    +'</div>';
  document.body.appendChild(m);
  m.addEventListener('click',function(e){if(e.target===m)m.remove();});
}


const SERVER = "https://datta-ai-server.onrender.com";

let messages = [];
let isGenerating = false;
let controller = null;
let currentChatId = null;
window.webSearchEnabled = false;

// ── FILL PROMPT ────────────────────────────────────────
function fillPrompt(text) {
  const input = document.getElementById("message");
  if (!input) return;
  input.value = text;
  input.focus();
  hideWelcome();
  // Auto send if it's a complete prompt (not a prefix)
  if (!text.endsWith(" ")) setTimeout(() => send(), 100);
}
window.fillPrompt = fillPrompt;

function hideWelcome() {
  const ws = document.getElementById("welcomeScreen");
  if (ws) { ws.style.display = "none"; ws.style.opacity = "0"; }
}

function showWelcome() {
  const ws = document.getElementById("welcomeScreen");
  if (ws) { ws.style.display = "flex"; ws.style.opacity = "1"; }
  const chat = document.getElementById("chat");
  if (chat) chat.innerHTML = "";
  messages = [];
  currentChatId = null;
}

// ── NEW CHAT ───────────────────────────────────────────
function newChat() {
  if (isGenerating && controller) controller.abort();
  isGenerating = false;
  hideStop();
  showWelcome();
  const input = document.getElementById("message");
  if (input) { input.value = ""; input.focus(); }
}
window.newChat = newChat;

// ── SEND ───────────────────────────────────────────────
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

  // ── PLAN LIMIT CHECKS ──────────────────────────────
  if (typeof canSendMessage === "function") {
    const msgCheck = _canSendMsg();
    if (!msgCheck.ok) {
      isGenerating = false;
      hideStop();
      if (typeof showUpgradeModal === "function") _showUpgrade("msg_limit");
      return;
    }
  }

  const isImageReq = /\b(generate|create|draw|make|paint|design)\b.*\bimage\b|\bimage of\b/i.test(text);
  const webSearchOn = window.webSearchEnabled || localStorage.getItem("datta_websearch_enabled") !== "false";
  const isSearchReq = webSearchOn && /\b(search|latest|news|today|current|who is|what is happening|weather|price|stock)\b/i.test(text);

  try {
    controller = new AbortController();

    if (isImageReq) {
      removeTyping(typingId);
      const loadId = addTypingWithText("🎨 Generating image...");
      // Check image generation permission
      if (true) {
        const imgCheck = _canGenImg();
        if (!imgCheck.ok) {
          removeTyping(typingId);
          isGenerating = false; hideStop();
          if (typeof showUpgradeModal === "function") _showUpgrade(imgCheck.reason, "imageGen");
          return;
        }
      }
      const imgPrompt = text.replace(/generate|create|draw|make|paint|design|image of|an image|a picture/gi,"").trim() || text;
      const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imgPrompt)}?width=512&height=512&nologo=true&seed=${Date.now()}`;
      removeTyping(loadId);
      addImageMessage(imageUrl, imgPrompt);
      messages.push({ role: "assistant", content: `[Generated image: ${imgPrompt}]` });

    } else if (isSearchReq) {
      removeTyping(typingId);
      const searchId = addTypingWithText("🌐 Searching the web...");
      const reply = await callChatAPI("Search the web and answer with current information: " + text);
      removeTyping(searchId);
      addMessage("ai", reply);
      messages.push({ role: "assistant", content: reply });

    } else {
      removeTyping(typingId);
      const reply = await callChatAPI(text);
      addMessage("ai", reply);
      messages.push({ role: "assistant", content: reply });
    }

    _recordMsg();
    if (isImageReq) _recordImg();
    if (typeof addXP === "function") addXP(5, "Message sent");
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

// ── CALL /chat API ─────────────────────────────────────
async function callChatAPI(userMessage) {
  const token = localStorage.getItem("datta_token") || "";
  const moodPrompt = getMoodSystemPrompt();
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

  if (!res.ok) throw new Error(`Server ${res.status}`);

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let reply = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    reply += dec.decode(value);
  }
  return reply.split("CHATID")[0].trim() || "I'm here to help!";
}

// ── MOOD PROMPT ────────────────────────────────────────
function getMoodSystemPrompt() {
  if (localStorage.getItem("datta_mood_enabled") === "false") return "";
  // Mood AI only for Shakti and above
  if (!_canUse("moodAI")) return "";
  const mood = localStorage.getItem("datta_mood") || "";
  const lang = localStorage.getItem("datta_language") || "English";
  const langNote = lang !== "English" ? ` Always respond in ${lang}.` : "";
  const moods = {
    focused:"Be sharp, concise and direct. No fluff.",
    happy:"Be fun, energetic and enthusiastic! Use emojis.",
    stressed:"Be calm, reassuring and gentle. Step by step.",
    creative:"Be bold, imaginative and think outside the box!",
    lazy:"Keep it super short and chill. Minimal words.",
    curious:"Go deep! Explore ideas thoroughly with examples.",
    night:"Be philosophical and thoughtful. Deep thinking mode."
  };
  const base = "You are Datta AI, a smart helpful assistant created by Ganesh (Pampana Hari Sai Ganesh).";
  return `${base} ${moods[mood]||""}${langNote}`.trim();
}

// ── STOP ───────────────────────────────────────────────
function stopGeneration() {
  if (controller) controller.abort();
  isGenerating = false;
  hideStop();
}
window.stopGeneration = stopGeneration;

function showStop() {
  const s = document.getElementById("stopBtn");
  const b = document.getElementById("sendBtn");
  if (s) s.style.display = "flex";
  if (b) b.style.display = "none";
}
function hideStop() {
  const s = document.getElementById("stopBtn");
  const b = document.getElementById("sendBtn");
  if (s) s.style.display = "none";
  if (b) b.style.display = "flex";
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
    bubble.innerHTML = typeof marked !== "undefined"
      ? marked.parse(text)
      : text.replace(/\n/g,"<br>");

    if (localStorage.getItem("datta_voice_read") === "true") {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = getLangCode();
      window.speechSynthesis.speak(u);
    }

    const actions = document.createElement("div");
    actions.className = "aiActions";
    const copyBtn = document.createElement("button");
    copyBtn.className = "actionBtn";
    copyBtn.title = "Copy";
    copyBtn.textContent = "📋";
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.textContent = "✅";
        setTimeout(() => copyBtn.textContent = "📋", 1500);
      });
    };
    const speakBtn = document.createElement("button");
    speakBtn.className = "actionBtn";
    speakBtn.title = "Read aloud";
    speakBtn.textContent = "🔊";
    speakBtn.onclick = () => speakText(speakBtn, text);
    actions.appendChild(copyBtn);
    actions.appendChild(speakBtn);

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

// ── ADD IMAGE ──────────────────────────────────────────
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
        <img src="${url}" alt="${prompt}" style="max-width:300px;width:100%;border-radius:12px;display:block;border:1px solid rgba(255,215,0,0.15);"
          onerror="this.parentElement.innerHTML='⚠️ Image failed. Try a different prompt.'" />
        <div style="font-size:11px;color:#443300;margin-top:6px;">${prompt}</div>
        <a href="${url}" download="datta-ai.jpg" target="_blank"
          style="display:inline-block;margin-top:8px;font-size:11px;color:#ffd700;font-family:'Rajdhani',sans-serif;text-decoration:none;border:1px solid rgba(255,215,0,0.2);padding:4px 10px;border-radius:8px;">
          ⬇️ Download
        </a>
      </div>
    </div>`;
  chat.appendChild(row);
  scrollToBottom();
}

// ── TYPING ─────────────────────────────────────────────
function addTyping() {
  const id = "t_" + Date.now();
  const chat = document.getElementById("chat");
  if (!chat) return id;
  const row = document.createElement("div");
  row.className = "messageRow"; row.id = id;
  row.innerHTML = `<div class="avatar">✦</div><div class="aiContent"><div class="aiBubble typing"><span></span><span></span><span></span></div></div>`;
  chat.appendChild(row);
  scrollToBottom();
  return id;
}
function addTypingWithText(label) {
  const id = "t_" + Date.now();
  const chat = document.getElementById("chat");
  if (!chat) return id;
  const row = document.createElement("div");
  row.className = "messageRow"; row.id = id;
  row.innerHTML = `<div class="avatar">✦</div><div class="aiContent"><div class="aiBubble"><span style="font-size:14px;">${label}</span><span style="display:inline-flex;gap:3px;margin-left:6px;"><span style="width:4px;height:4px;background:#ffd700;border-radius:50%;animation:dot 1.2s infinite;"></span><span style="width:4px;height:4px;background:#ffd700;border-radius:50%;animation:dot 1.2s 0.2s infinite;"></span><span style="width:4px;height:4px;background:#ffd700;border-radius:50%;animation:dot 1.2s 0.4s infinite;"></span></span></div></div>`;
  chat.appendChild(row);
  scrollToBottom();
  return id;
}
function removeTyping(id) { document.getElementById(id)?.remove(); }

// ── SCROLL ─────────────────────────────────────────────
function scrollToBottom() {
  const chat = document.getElementById("chat");
  if (chat) chat.scrollTo({ top: chat.scrollHeight, behavior: "smooth" });
}
window.addEventListener("load", function() {
  const chat = document.getElementById("chat");
  const btn = document.getElementById("scrollDownBtn");
  if (!chat || !btn) return;
  chat.addEventListener("scroll", () => {
    btn.style.display = (chat.scrollHeight - chat.scrollTop - chat.clientHeight) > 100 ? "flex" : "none";
  });
  btn.addEventListener("click", () => chat.scrollTo({ top: chat.scrollHeight, behavior: "smooth" }));
});

// ── VOICE ──────────────────────────────────────────────
function getLangCode() {
  const lang = localStorage.getItem("datta_language") || "English";
  const map = {Hindi:"hi-IN",Telugu:"te-IN",Tamil:"ta-IN",Spanish:"es-ES",French:"fr-FR",Arabic:"ar-SA",Chinese:"zh-CN",Japanese:"ja-JP",German:"de-DE",Kannada:"kn-IN",Malayalam:"ml-IN",Bengali:"bn-IN"};
  return map[lang] || "en-US";
}
function speakText(btn, text) {
  if (window.speechSynthesis.speaking) { window.speechSynthesis.cancel(); btn.textContent = "🔊"; return; }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = getLangCode();
  u.onend = () => btn.textContent = "🔊";
  btn.textContent = "⏹️";
  window.speechSynthesis.speak(u);
}
window.speakText = speakText;

function startAssistant() {
  if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
    alert("Voice not supported. Please use Chrome!"); return;
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const r = new SR();
  r.lang = getLangCode();
  const mic = document.getElementById("micBtn");
  if (mic) mic.style.color = "#ffd700";
  r.onresult = e => {
    if (mic) mic.style.color = "";
    const input = document.getElementById("message");
    if (input) input.value = e.results[0][0].transcript;
    send();
  };
  r.onerror = r.onend = () => { if (mic) mic.style.color = ""; };
  r.start();
}
window.startAssistant = startAssistant;

// ── CHAT HISTORY — saves with real topic title ─────────
function generateTitle(text) {
  // Use first user message, clean it up, max 45 chars
  const clean = text.replace(/[^\w\s,?!]/g,"").trim();
  return clean.length > 45 ? clean.slice(0, 42) + "..." : clean || "New Chat";
}

function saveChat() {
  if (!messages.length) return;
  const id = currentChatId || ("chat_" + Date.now());
  currentChatId = id;
  // Use the first user message as the title
  const firstUserMsg = messages.find(m => m.role === "user");
  const title = generateTitle(firstUserMsg?.content || "New Chat");
  const chats = JSON.parse(localStorage.getItem("datta_chats") || "{}");
  chats[id] = { id, title, messages, ts: Date.now() };
  localStorage.setItem("datta_chats", JSON.stringify(chats));
  renderHistory();
}
window.saveChat = saveChat;

function renderHistory() {
  const container = document.getElementById("history");
  if (!container) return;
  const chats = JSON.parse(localStorage.getItem("datta_chats") || "{}");
  const sorted = Object.values(chats).sort((a, b) => b.ts - a.ts);
  if (!sorted.length) {
    container.innerHTML = `<div style="padding:20px 14px;font-family:'Rajdhani',sans-serif;font-size:11px;letter-spacing:1px;color:#332200;text-align:center;">No chats yet<br><span style="font-size:10px;opacity:0.6;">Start a conversation!</span></div>`;
    return;
  }
  container.innerHTML = sorted.map(c => `
    <div class="chatItem" onclick="openChat('${c.id}')" title="${c.title}">
      <span class="chatTitle" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.title}</span>
      <button class="deleteBtn" onclick="deleteChat('${c.id}',event)" style="flex-shrink:0;">✕</button>
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

// ── LOGOUT ─────────────────────────────────────────────
function logout() {
  localStorage.removeItem("datta_token");
  localStorage.removeItem("datta_user");
  window.location.href = "login.html";
}
window.logout = logout;

// ── DOM READY — wire up all buttons ───────────────────
document.addEventListener("DOMContentLoaded", function() {
  // Enter key
  const input = document.getElementById("message");
  if (input) {
    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    });
  }

  // Lock sidebar nav items based on plan
  const navLocks = {
    'memory.html':    'smartMemory',
    'analytics.html': 'analytics',
    'translator.html':'translator',
    'xp.html':        'xpGamification',
    'feed.html':      'liveFeed',
  };
  document.querySelectorAll('[onclick*=".html"]').forEach(el => {
    const match = el.getAttribute('onclick')?.match(/href='([^']+\.html)'/);
    const page = match ? match[1] : null;
    if (page && navLocks[page]) {
      const feature = navLocks[page];
      if (!_canUse(feature)) {
        el.style.opacity = "0.35";
        el.style.cursor = "not-allowed";
        el.addEventListener("click", function(e) {
          e.preventDefault(); e.stopPropagation();
          if (typeof showUpgradeModal === "function") _showUpgrade("not_in_plan", feature);
        }, true);
      }
    }
  });

  // Welcome BADGES — make clickable
  document.querySelectorAll(".welcomeBadge").forEach(badge => {
    const label = badge.textContent.trim();
    badge.style.cursor = "pointer";
    badge.style.transition = "all 0.2s";
    if (label.includes("AI Chat")) {
      badge.onclick = () => { hideWelcome(); input?.focus(); };
    } else if (label.includes("Image Generation")) {
      badge.onclick = () => {
        hideWelcome();
        if (input) { input.value = "Generate image of "; input.focus(); }
      };
    } else if (label.includes("Web Search")) {
      badge.onclick = () => {
        hideWelcome();
        if (input) { input.value = "Search the web for "; input.focus(); }
      };
    } else if (label.includes("Voice")) {
      badge.onclick = () => startAssistant();
    }
  });

  // Welcome CHIPS — already have onclick="fillPrompt(...)" in HTML
  // But ensure they also hide welcome
  document.querySelectorAll(".chip").forEach(chip => {
    const orig = chip.onclick;
    chip.addEventListener("click", () => { hideWelcome(); });
  });

  // Load history
  renderHistory();

  // Update profile username in sidebar — show full name
  setTimeout(() => {
    try {
      const user = JSON.parse(localStorage.getItem("datta_user") || "{}");
      const username = user.username || user.name || "User";
      const profileName = document.querySelector(".profileName");
      const profileAvatar = document.querySelector(".profileAvatar");
      const profileSub = document.querySelector(".profileSub");

      if (profileName) {
        // Show full username, allow wrapping
        profileName.textContent = username;
        profileName.style.whiteSpace = "normal";
        profileName.style.wordBreak = "break-word";
        profileName.style.maxWidth = "130px";
        profileName.style.lineHeight = "1.2";
        profileName.style.fontSize = username.length > 16 ? "11px" : "13px";
      }
      if (profileAvatar) profileAvatar.textContent = username.charAt(0).toUpperCase();

      const plan = localStorage.getItem("datta_plan") || "arambh";
      const planLabels = {arambh:"🌱 Free",shakti:"⚡ Shakti",agni:"🔥 Agni",brahma:"👑 Brahma",free:"🌱 Free"};
      const creators = ["pampana_hari_sai_ganesh","harisaiganesh","ganesh","admin","creator","dattaai"];
      const isCreator = creators.some(c => username.toLowerCase().includes(c));
      if (profileSub) profileSub.textContent = isCreator ? "👑 Creator" : (planLabels[plan] || "Free");
    } catch(e) {}
  }, 500);
});

window.addEventListener("load", renderHistory);
