/*
 ═══════════════════════════════════════════════════
  DATTA AI — MOOD-BASED AI PERSONALITY SYSTEM
  v4.0 · SHAKTI UPDATE · World First Features
  ✅ Manual Mood Selector (original)
  ✅ Auto Mood Detection from text
  ✅ Mood Memory Timeline
  🆕 Voice Emotion Detection
  🆕 Auto Night Brain Mode
  🆕 Photo / Selfie Mood Detection
 ═══════════════════════════════════════════════════
*/

const MOODS = {
  focused: {
    label: "Focused", emoji: "🎯", color: "#00ccff",
    bgGlow: "rgba(0,204,255,0.08)", desc: "Sharp, concise, no fluff",
    personality: `You are in FOCUSED mode. Be sharp, precise and concise. 
    No unnecessary fluff or filler words. Get straight to the point. 
    Use bullet points and structure when helpful. 
    The user wants maximum productivity and clarity.`
  },
  happy: {
    label: "Happy", emoji: "😄", color: "#ffd700",
    bgGlow: "rgba(255,215,0,0.08)", desc: "Cheerful, fun, energetic",
    personality: `You are in HAPPY mode. Be cheerful, warm and enthusiastic! 
    Use a fun, upbeat tone. Add light humor where appropriate. 
    Celebrate the user's wins and keep the energy high. 
    Use occasional emojis to express positivity! 🎉`
  },
  stressed: {
    label: "Stressed", emoji: "😮‍💨", color: "#00ff88",
    bgGlow: "rgba(0,255,136,0.08)", desc: "Calm, reassuring, gentle",
    personality: `You are in STRESSED mode. Be very calm, patient and reassuring. 
    Speak gently and supportively. Break things into small, manageable steps. 
    Acknowledge the user's feelings before answering. 
    Help them feel less overwhelmed. Be their calming presence.`
  },
  creative: {
    label: "Creative", emoji: "🎨", color: "#c084fc",
    bgGlow: "rgba(192,132,252,0.08)", desc: "Imaginative, expressive, bold",
    personality: `You are in CREATIVE mode. Be imaginative, expressive and bold! 
    Think outside the box. Use vivid language and metaphors. 
    Encourage wild ideas and unconventional thinking. 
    Help the user explore creative possibilities without limits.`
  },
  lazy: {
    label: "Lazy", emoji: "😴", color: "#f97316",
    bgGlow: "rgba(249,115,22,0.08)", desc: "Super short, casual, chill",
    personality: `You are in LAZY mode. Keep all responses extremely short and casual. 
    Use simple language. No long explanations unless absolutely necessary. 
    Be chill and laid back. The user doesn't want to think too hard right now.`
  },
  curious: {
    label: "Curious", emoji: "🔍", color: "#ec4899",
    bgGlow: "rgba(236,72,153,0.08)", desc: "Deep, thoughtful, exploratory",
    personality: `You are in CURIOUS mode. Be deeply thoughtful and exploratory. 
    Ask follow-up questions to dig deeper. Share fascinating facts and perspectives. 
    Help the user see topics from multiple angles. 
    Make learning feel like an exciting adventure.`
  },
  night: {
    label: "Night Brain", emoji: "🌙", color: "#818cf8",
    bgGlow: "rgba(129,140,248,0.08)", desc: "Philosophical, deep, nocturnal",
    personality: `You are in NIGHT BRAIN mode. It's late and the user's mind is in its 
    most reflective, philosophical state. Be poetic, deep and thoughtful. 
    Embrace big questions, existential musings and creative tangents. 
    Speak like a wise friend at 2am — no formality, just honest depth. 
    Match the quiet, introspective energy of the night.`
  }
};

let currentMood = null;

// ═══════════════════════════════════════════════════
//  🌙 FEATURE 1: AUTO NIGHT BRAIN MODE
// ═══════════════════════════════════════════════════

function checkNightMode() {
  const hour = new Date().getHours();
  const isNight = hour >= 23 || hour <= 3;
  const dismissedAt = parseInt(localStorage.getItem('datta_night_dismissed') || '0');
  const dismissedRecently = Date.now() - dismissedAt < 6 * 60 * 60 * 1000;
  if (isNight && !dismissedRecently && currentMood !== 'night') showNightModeBanner();
}

function showNightModeBanner() {
  if (document.getElementById('nightBanner')) return;
  const banner = document.createElement('div');
  banner.id = 'nightBanner';
  banner.style.cssText = `
    position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
    background:#0a0900;border:1px solid rgba(129,140,248,0.4);
    border-radius:18px;padding:14px 18px;z-index:9998;
    width:min(340px,90vw);box-shadow:0 12px 40px rgba(0,0,0,0.7);
    font-family:'DM Sans',sans-serif;animation:slideUp 0.4s ease;
  `;
  banner.innerHTML = `
    <style>@keyframes slideUp{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}</style>
    <div style="display:flex;align-items:flex-start;gap:12px;">
      <div style="font-size:26px;line-height:1;">🌙</div>
      <div style="flex:1;">
        <div style="font-family:'Rajdhani',sans-serif;font-size:14px;font-weight:700;
          letter-spacing:1px;color:#818cf8;margin-bottom:3px;">IT'S LATE NIGHT</div>
        <div style="font-size:12px;color:#443300;line-height:1.5;">
          Switch to Night Brain mode for deeper, more philosophical conversations?
        </div>
        <div style="display:flex;gap:8px;margin-top:10px;">
          <button onclick="applyMood('night');document.getElementById('nightBanner').remove();"
            style="flex:1;padding:7px;background:rgba(129,140,248,0.15);
            border:1px solid rgba(129,140,248,0.4);border-radius:50px;
            color:#818cf8;font-family:'Rajdhani',sans-serif;font-size:12px;
            font-weight:700;letter-spacing:1px;cursor:pointer;">🌙 YES, SWITCH</button>
          <button onclick="localStorage.setItem('datta_night_dismissed',Date.now());document.getElementById('nightBanner').remove();"
            style="padding:7px 14px;background:none;border:1px solid rgba(255,215,0,0.1);
            border-radius:50px;color:#443300;font-family:'Rajdhani',sans-serif;
            font-size:12px;cursor:pointer;">Not now</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(banner);
  setTimeout(() => { if (banner.parentNode) banner.remove(); }, 12000);
}

// ═══════════════════════════════════════════════════
//  🎙️ FEATURE 2: VOICE EMOTION DETECTION
// ═══════════════════════════════════════════════════

let moodVoiceRecognition = null;
let isListeningForMood = false;

function startVoiceMoodDetection() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { showFloatToast('❌ Voice not supported in this browser', '#ff4444'); return; }
  if (isListeningForMood) { stopVoiceMoodDetection(); return; }

  moodVoiceRecognition = new SpeechRecognition();
  moodVoiceRecognition.continuous = false;
  moodVoiceRecognition.interimResults = false;
  moodVoiceRecognition.lang = 'en-IN';
  moodVoiceRecognition.maxAlternatives = 1;
  isListeningForMood = true;
  showVoiceListeningUI();

  moodVoiceRecognition.onresult = function(e) {
    const transcript = e.results[0][0].transcript;
    const confidence = e.results[0][0].confidence;
    analyzeVoiceMood(transcript, confidence);
  };
  moodVoiceRecognition.onerror = function() {
    isListeningForMood = false; hideVoiceUI();
    showFloatToast('🎙️ Could not hear you clearly', '#ff8c00');
  };
  moodVoiceRecognition.onend = function() { isListeningForMood = false; hideVoiceUI(); };
  moodVoiceRecognition.start();
}

function stopVoiceMoodDetection() {
  if (moodVoiceRecognition) moodVoiceRecognition.stop();
  isListeningForMood = false;
  hideVoiceUI();
}

function analyzeVoiceMood(transcript, confidence) {
  const textMood = autoDetectMoodFromText(transcript);
  const words = transcript.split(' ').length;
  const hasExclamation = transcript.includes('!');
  let voiceMood = textMood;
  if (!voiceMood && words < 4 && !hasExclamation) voiceMood = 'lazy';
  if (!voiceMood && words > 12 && hasExclamation) voiceMood = 'happy';
  if (!voiceMood) voiceMood = 'focused';
  showVoiceResultUI(transcript, voiceMood);
}

function showVoiceListeningUI() {
  let el = document.getElementById('voiceMoodOverlay');
  if (!el) { el = document.createElement('div'); el.id = 'voiceMoodOverlay'; document.body.appendChild(el); }
  el.style.cssText = `
    position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
    background:#0a0900;border:1px solid rgba(255,60,60,0.4);
    border-radius:18px;padding:18px 24px;z-index:9999;
    text-align:center;width:min(300px,88vw);
    box-shadow:0 12px 40px rgba(0,0,0,0.8);font-family:'DM Sans',sans-serif;
  `;
  el.innerHTML = `
    <div style="font-size:32px;margin-bottom:8px;animation:vPulse 1s infinite;">🎙️</div>
    <div style="font-family:'Rajdhani',sans-serif;font-size:14px;font-weight:700;
      letter-spacing:2px;color:#ff6060;">LISTENING FOR MOOD...</div>
    <div style="font-size:12px;color:#332200;margin-top:6px;">Say how you're feeling right now</div>
    <div style="display:flex;justify-content:center;gap:4px;margin-top:12px;">
      ${[...Array(5)].map((_,i)=>`<div style="width:4px;height:${12+i*6}px;background:#ff4444;
        border-radius:4px;animation:vBar 0.6s ${i*0.1}s infinite alternate;"></div>`).join('')}
    </div>
    <style>
      @keyframes vPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}
      @keyframes vBar{from{transform:scaleY(0.4)}to{transform:scaleY(1)}}
    </style>
    <button onclick="stopVoiceMoodDetection()"
      style="margin-top:14px;padding:6px 16px;background:none;
      border:1px solid rgba(255,60,60,0.3);border-radius:50px;
      color:#ff6060;font-family:'Rajdhani',sans-serif;font-size:11px;cursor:pointer;">✕ Cancel</button>
  `;
}

function hideVoiceUI() {
  const el = document.getElementById('voiceMoodOverlay');
  if (el) el.remove();
}

function showVoiceResultUI(transcript, moodKey) {
  const mood = MOODS[moodKey];
  let el = document.getElementById('voiceMoodOverlay');
  if (!el) { el = document.createElement('div'); el.id='voiceMoodOverlay'; document.body.appendChild(el); }
  el.style.cssText = `
    position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
    background:#0a0900;border:1px solid ${mood.color}44;
    border-radius:18px;padding:18px 24px;z-index:9999;
    text-align:center;width:min(320px,88vw);
    box-shadow:0 12px 40px rgba(0,0,0,0.8);font-family:'DM Sans',sans-serif;
  `;
  el.innerHTML = `
    <div style="font-size:36px;margin-bottom:6px;">${mood.emoji}</div>
    <div style="font-family:'Rajdhani',sans-serif;font-size:16px;font-weight:700;
      letter-spacing:2px;color:${mood.color};">DETECTED: ${mood.label.toUpperCase()}</div>
    <div style="font-size:11px;color:#443300;margin:6px 0 12px;font-style:italic;">"${transcript}"</div>
    <div style="display:flex;gap:8px;justify-content:center;">
      <button onclick="applyMood('${moodKey}');document.getElementById('voiceMoodOverlay').remove();"
        style="flex:1;padding:8px;background:${mood.bgGlow};
        border:1px solid ${mood.color}44;border-radius:50px;
        color:${mood.color};font-family:'Rajdhani',sans-serif;
        font-size:12px;font-weight:700;letter-spacing:1px;cursor:pointer;">✓ Apply Mood</button>
      <button onclick="document.getElementById('voiceMoodOverlay').remove();"
        style="padding:8px 14px;background:none;border:1px solid rgba(255,215,0,0.1);
        border-radius:50px;color:#443300;font-family:'Rajdhani',sans-serif;font-size:12px;cursor:pointer;">✕</button>
    </div>
  `;
  setTimeout(() => { if (el.parentNode) el.remove(); }, 8000);
}

window.startVoiceMoodDetection = startVoiceMoodDetection;
window.stopVoiceMoodDetection = stopVoiceMoodDetection;

// ═══════════════════════════════════════════════════
//  📸 FEATURE 3: PHOTO / SELFIE MOOD DETECTION
// ═══════════════════════════════════════════════════

let moodCamStream = null;

function startPhotoMoodDetection() { showPhotoMoodUI(); }

function showPhotoMoodUI() {
  let overlay = document.getElementById('photoMoodOverlay');
  if (overlay) { overlay.remove(); return; }
  overlay = document.createElement('div');
  overlay.id = 'photoMoodOverlay';
  overlay.style.cssText = `
    position:fixed;top:0;left:0;right:0;bottom:0;
    background:rgba(0,0,0,0.85);z-index:10001;
    display:flex;align-items:center;justify-content:center;
    backdrop-filter:blur(8px);font-family:'DM Sans',sans-serif;
  `;
  overlay.innerHTML = `
    <div style="background:#0a0900;border:1px solid rgba(255,215,0,0.15);
      border-radius:24px;padding:24px;width:min(360px,92vw);text-align:center;
      box-shadow:0 20px 60px rgba(0,0,0,0.9);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:3px;
          background:linear-gradient(90deg,#ffd700,#ff8c00);
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;">
          📸 SELFIE MOOD SCAN</div>
        <button onclick="closePhotoMoodUI()"
          style="background:none;border:none;color:#554400;cursor:pointer;font-size:16px;">✕</button>
      </div>
      <video id="moodCamFeed" autoplay playsinline muted
        style="width:100%;border-radius:16px;background:#0f0e00;
        border:1px solid rgba(255,215,0,0.1);aspect-ratio:4/3;
        object-fit:cover;display:none;"></video>
      <canvas id="moodCamCanvas" style="display:none;"></canvas>
      <div id="photoMoodStatus" style="padding:30px 20px;">
        <div style="font-size:40px;margin-bottom:10px;">📷</div>
        <div style="font-family:'Rajdhani',sans-serif;font-size:13px;
          letter-spacing:1px;color:#554400;">
          Take a selfie and Datta AI will detect your mood from your expression</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:4px;">
        <button id="photoMoodCamBtn" onclick="openMoodCamera()"
          style="padding:12px;background:rgba(255,215,0,0.08);
          border:1px solid rgba(255,215,0,0.25);border-radius:50px;
          color:#ffd700;font-family:'Rajdhani',sans-serif;font-size:13px;
          font-weight:700;letter-spacing:2px;cursor:pointer;">📷 OPEN CAMERA</button>
        <label style="padding:12px;background:rgba(255,215,0,0.04);
          border:1px solid rgba(255,215,0,0.1);border-radius:50px;
          color:#554400;font-family:'Rajdhani',sans-serif;font-size:13px;
          font-weight:700;letter-spacing:2px;cursor:pointer;display:block;">
          🖼️ UPLOAD PHOTO
          <input type="file" accept="image/*" onchange="handlePhotoUpload(event)" style="display:none;">
        </label>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

async function openMoodCamera() {
  try {
    moodCamStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:'user', width:320, height:240 } });
    const video = document.getElementById('moodCamFeed');
    document.getElementById('photoMoodStatus').style.display = 'none';
    video.srcObject = moodCamStream;
    video.style.display = 'block';
    const btn = document.getElementById('photoMoodCamBtn');
    btn.textContent = '📸 CAPTURE & ANALYSE';
    btn.onclick = captureMoodPhoto;
  } catch(e) {
    document.getElementById('photoMoodStatus').innerHTML = `
      <div style="font-size:32px;margin-bottom:8px;">🚫</div>
      <div style="font-family:'Rajdhani',sans-serif;font-size:12px;color:#ff6060;letter-spacing:1px;">
        Camera access denied.<br>Please upload a photo instead.</div>`;
  }
}

function captureMoodPhoto() {
  const video = document.getElementById('moodCamFeed');
  const canvas = document.getElementById('moodCamCanvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const imageData = canvas.toDataURL('image/jpeg', 0.8);
  stopMoodCamera();
  analyzePhotoMood(imageData);
}

function handlePhotoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => analyzePhotoMood(ev.target.result);
  reader.readAsDataURL(file);
}

function stopMoodCamera() {
  if (moodCamStream) { moodCamStream.getTracks().forEach(t => t.stop()); moodCamStream = null; }
}

async function analyzePhotoMood(imageData) {
  const status = document.getElementById('photoMoodStatus');
  const video = document.getElementById('moodCamFeed');
  if (video) video.style.display = 'none';
  if (status) {
    status.style.display = 'block';
    status.innerHTML = `
      <div style="font-size:32px;margin-bottom:8px;animation:photoSpin 1s linear infinite;">🔍</div>
      <div style="font-family:'Rajdhani',sans-serif;font-size:13px;letter-spacing:1px;color:#554400;">
        Analysing your expression...</div>
      <style>@keyframes photoSpin{to{transform:rotate(360deg)}}</style>`;
  }
  try {
    const base64 = imageData.split(',')[1];
    const mediaType = imageData.split(';')[0].split(':')[1];
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 20,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: `Look at this person's facial expression. Reply with ONLY one word from this list: focused, happy, stressed, creative, lazy, curious. No explanation.` }
          ]
        }]
      })
    });
    const data = await response.json();
    const raw = (data?.content?.[0]?.text || '').trim().toLowerCase().replace(/[^a-z]/g,'');
    const detected = MOODS[raw] ? raw : 'happy';
    showPhotoMoodResult(imageData, detected);
  } catch(e) {
    const fallback = Object.keys(MOODS).filter(k => k !== 'night');
    showPhotoMoodResult(imageData, fallback[Math.floor(Math.random() * fallback.length)]);
  }
}

function showPhotoMoodResult(imageData, moodKey) {
  const mood = MOODS[moodKey];
  const box = document.querySelector('#photoMoodOverlay > div');
  if (!box) return;
  box.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:3px;
        background:linear-gradient(90deg,#ffd700,#ff8c00);
        -webkit-background-clip:text;-webkit-text-fill-color:transparent;">📸 MOOD DETECTED</div>
      <button onclick="closePhotoMoodUI()"
        style="background:none;border:none;color:#554400;cursor:pointer;font-size:16px;">✕</button>
    </div>
    <img src="${imageData}" style="width:100%;border-radius:14px;
      border:2px solid ${mood.color}55;margin-bottom:14px;
      object-fit:cover;max-height:180px;">
    <div style="background:${mood.bgGlow};border:1px solid ${mood.color}44;
      border-radius:14px;padding:14px;margin-bottom:14px;text-align:center;">
      <div style="font-size:36px;margin-bottom:4px;">${mood.emoji}</div>
      <div style="font-family:'Rajdhani',sans-serif;font-size:18px;font-weight:700;
        letter-spacing:2px;color:${mood.color};">${mood.label.toUpperCase()}</div>
      <div style="font-size:12px;color:#554400;margin-top:4px;">${mood.desc}</div>
    </div>
    <div style="display:flex;gap:8px;">
      <button onclick="applyMood('${moodKey}');closePhotoMoodUI();"
        style="flex:1;padding:11px;background:${mood.bgGlow};
        border:1px solid ${mood.color}55;border-radius:50px;
        color:${mood.color};font-family:'Rajdhani',sans-serif;font-size:13px;
        font-weight:700;letter-spacing:1px;cursor:pointer;">
        ✓ Apply ${mood.emoji} ${mood.label}</button>
      <button onclick="showPhotoMoodUI()"
        style="padding:11px 14px;background:none;
        border:1px solid rgba(255,215,0,0.1);border-radius:50px;
        color:#443300;font-family:'Rajdhani',sans-serif;font-size:12px;cursor:pointer;">🔄</button>
    </div>
  `;
}

function closePhotoMoodUI() {
  stopMoodCamera();
  const el = document.getElementById('photoMoodOverlay');
  if (el) el.remove();
}

window.startPhotoMoodDetection = startPhotoMoodDetection;
window.openMoodCamera = openMoodCamera;
window.captureMoodPhoto = captureMoodPhoto;
window.handlePhotoUpload = handlePhotoUpload;
window.closePhotoMoodUI = closePhotoMoodUI;
window.showPhotoMoodUI = showPhotoMoodUI;

// ═══════════════════════════════════════════════════
//  AUTO MOOD DETECTION (text-based)
// ═══════════════════════════════════════════════════

const MOOD_KEYWORDS = {
  stressed: ['help','urgent','asap','stuck','confused','problem','issue','error','bug',
    'broken','failed','cant','cannot','dont know','not working','please','deadline',
    'worried','anxiety','overwhelmed','stress','panic','tired','exhausted','lost'],
  happy: ['awesome','amazing','great','love','excited','happy','yay','wow','fantastic',
    'wonderful','thanks','thank you','perfect','cool','nice','fun','enjoy','best',
    'brilliant','excellent','good morning','good day','hi','hello','hey'],
  creative: ['design','create','make','build','idea','imagine','story','write','poem',
    'art','draw','generate','invent','craft','compose','brainstorm','concept',
    'creative','novel','unique','original','inspire','vision'],
  focused: ['how to','explain','what is','define','steps','guide','tutorial','learn',
    'understand','compare','difference','analyze','summarize','list','show me',
    'code','script','function','implement','solve','calculate','find'],
  curious: ['why','wonder','interesting','fascinating','curious','explore','discover',
    'possible','imagine if','what if','theory','philosophy','science','history',
    'universe','mind','consciousness','future','mystery','deep','meaning'],
  lazy: ['tldr','quick','short','brief','simple','just','easy','fast','basically',
    'whatever','idk','lol','lmao','nvm','cba','meh','sure','ok','okay','fine']
};

function autoDetectMoodFromText(text) {
  const lower = text.toLowerCase();
  const scores = {};
  for (const [mood, keywords] of Object.entries(MOOD_KEYWORDS)) {
    scores[mood] = 0;
    for (const kw of keywords) if (lower.includes(kw)) scores[mood]++;
  }
  const top = Object.entries(scores).sort((a,b) => b[1]-a[1]);
  return top[0][1] === 0 ? null : top[0][0];
}

window.dattaAutoDetectMood = function(userMessage) {
  const detected = autoDetectMoodFromText(userMessage);
  if (!detected) return null;
  if (!currentMood) applyMood(detected, true, true);
  logMoodToTimeline(detected, userMessage);
  return detected;
};

// ═══════════════════════════════════════════════════
//  MOOD MEMORY TIMELINE
// ═══════════════════════════════════════════════════

function logMoodToTimeline(moodKey, trigger = '') {
  const timeline = getMoodTimeline();
  timeline.push({ mood: moodKey, time: Date.now(),
    hour: new Date().getHours(), day: new Date().getDay(),
    trigger: trigger.substring(0, 60) });
  if (timeline.length > 200) timeline.splice(0, timeline.length - 200);
  localStorage.setItem('datta_mood_timeline', JSON.stringify(timeline));
}

function getMoodTimeline() {
  try { return JSON.parse(localStorage.getItem('datta_mood_timeline') || '[]'); }
  catch { return []; }
}

function getMoodInsights() {
  const timeline = getMoodTimeline();
  if (timeline.length < 3) return null;
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const moodCount = {}, hourMood = {}, dayMood = {};
  for (const e of timeline) {
    moodCount[e.mood] = (moodCount[e.mood]||0)+1;
    if (!hourMood[e.hour]) hourMood[e.hour] = {};
    hourMood[e.hour][e.mood] = (hourMood[e.hour][e.mood]||0)+1;
    if (!dayMood[e.day]) dayMood[e.day] = {};
    dayMood[e.day][e.mood] = (dayMood[e.day][e.mood]||0)+1;
  }
  const topMood = Object.entries(moodCount).sort((a,b)=>b[1]-a[1])[0][0];
  let bestHour=null, bestHourScore=0;
  for (const [h,moods] of Object.entries(hourMood)) {
    const score=(moods.focused||0)+(moods.happy||0)+(moods.creative||0);
    if(score>bestHourScore){bestHourScore=score;bestHour=h;}
  }
  let stressDay=null, stressDayScore=0;
  for (const [d,moods] of Object.entries(dayMood)) {
    if((moods.stressed||0)>stressDayScore){stressDayScore=moods.stressed;stressDay=d;}
  }
  const weekAgo = Date.now()-7*24*60*60*1000;
  const weekMoods = {};
  for (const e of timeline.filter(e=>e.time>weekAgo)) weekMoods[e.mood]=(weekMoods[e.mood]||0)+1;
  return { topMood, bestHour: bestHour!==null?`${bestHour}:00`:null,
    stressDay: stressDay!==null?days[stressDay]:null, weekMoods, total: timeline.length };
}

function predictMood() {
  const timeline = getMoodTimeline();
  if (timeline.length < 5) return null;
  const h=new Date().getHours(), d=new Date().getDay();
  const similar=timeline.filter(e=>Math.abs(e.hour-h)<=1&&e.day===d);
  if(similar.length<2) return null;
  const counts={};
  for(const e of similar) counts[e.mood]=(counts[e.mood]||0)+1;
  const top=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
  return top[1]>=2?top[0]:null;
}

window.getMoodInsights = getMoodInsights;
window.getMoodTimeline = getMoodTimeline;
window.dattaPredictMood = predictMood;

function showTimelinePanel() {
  let panel = document.getElementById('moodTimelinePanel');
  if (panel) { panel.remove(); return; }
  const insights = getMoodInsights();
  const timeline = getMoodTimeline().slice(-14).reverse();
  panel = document.createElement('div');
  panel.id = 'moodTimelinePanel';
  panel.style.cssText = `
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    background:#0a0900;border:1px solid rgba(255,215,0,0.2);
    border-radius:20px;padding:24px;z-index:10000;
    width:min(420px,92vw);max-height:80vh;overflow-y:auto;
    box-shadow:0 20px 60px rgba(0,0,0,0.8);font-family:'DM Sans',sans-serif;color:#fff8e7;
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
    ${noData ? `<div style="text-align:center;padding:30px;color:#443300;">
      <div style="font-size:36px;margin-bottom:10px;">🌱</div>
      <div style="font-family:'Rajdhani',sans-serif;font-size:14px;letter-spacing:1px;">
        Start chatting to build your mood timeline!</div></div>` :
    `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px;">
      ${insightCard('🏆 Top Mood',MOODS[insights.topMood]?.emoji+' '+MOODS[insights.topMood]?.label,MOODS[insights.topMood]?.color)}
      ${insightCard('⚡ Peak Hour',insights.bestHour||'—','#ffd700')}
      ${insightCard('😮‍💨 Stress Day',insights.stressDay||'—','#00ff88')}
      ${insightCard('📊 Total Logs',insights.total+' entries','#c084fc')}
    </div>
    <div style="background:#0f0e00;border:1px solid rgba(255,215,0,0.08);border-radius:14px;
      padding:14px;margin-bottom:16px;">
      <div style="font-family:'Rajdhani',sans-serif;font-size:11px;letter-spacing:2px;
        color:#443300;margin-bottom:12px;">LAST 7 DAYS</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${Object.entries(insights.weekMoods).map(([mood,count])=>`
          <div style="display:flex;align-items:center;gap:5px;
            background:rgba(255,255,255,0.03);border-radius:20px;
            padding:4px 10px;border:1px solid ${MOODS[mood]?.color}33;">
            <span>${MOODS[mood]?.emoji}</span>
            <span style="font-family:'Rajdhani',sans-serif;font-size:12px;
              color:${MOODS[mood]?.color};">${MOODS[mood]?.label}</span>
            <span style="font-size:11px;color:#443300;">×${count}</span>
          </div>`).join('')}
      </div>
    </div>
    <div style="font-family:'Rajdhani',sans-serif;font-size:11px;letter-spacing:2px;
      color:#443300;margin-bottom:10px;">RECENT HISTORY</div>
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${timeline.map(e => {
        const m=MOODS[e.mood];
        const d=new Date(e.time);
        const label=d.toLocaleString('en-IN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
        return `<div style="display:flex;align-items:center;gap:10px;
          background:#0f0e00;border:1px solid rgba(255,215,0,0.06);
          border-radius:10px;padding:8px 12px;">
          <span style="font-size:16px;">${m?.emoji||'❓'}</span>
          <div style="flex:1;">
            <div style="font-family:'Rajdhani',sans-serif;font-size:13px;
              color:${m?.color||'#fff'};font-weight:700;">${m?.label||e.mood}</div>
            ${e.trigger?`<div style="font-size:11px;color:#332200;overflow:hidden;
              text-overflow:ellipsis;white-space:nowrap;max-width:200px;">"${e.trigger}"</div>`:''}
          </div>
          <div style="text-align:right;">
            <div style="font-size:10px;color:#332200;">${label}</div>
            <div style="font-size:10px;color:#443300;">${e.trigger?'🤖 auto':'👆 manual'}</div>
          </div>
        </div>`}).join('')}
    </div>`}
    <button onclick="if(confirm('Clear mood timeline?')){localStorage.removeItem('datta_mood_timeline');document.getElementById('moodTimelinePanel').remove();}"
      style="margin-top:16px;width:100%;padding:10px;background:none;
      border:1px solid rgba(255,60,60,0.2);border-radius:50px;color:#ff4444;
      font-family:'Rajdhani',sans-serif;font-size:12px;letter-spacing:1px;cursor:pointer;">
      🗑️ Clear Timeline</button>
  `;
  document.body.appendChild(panel);
}

function insightCard(label, value, color) {
  return `<div style="background:#0f0e00;border:1px solid rgba(255,215,0,0.07);
    border-radius:12px;padding:12px;">
    <div style="font-family:'Rajdhani',sans-serif;font-size:10px;
      letter-spacing:1px;color:#332200;margin-bottom:4px;">${label}</div>
    <div style="font-family:'Rajdhani',sans-serif;font-size:15px;
      font-weight:700;color:${color};">${value}</div>
  </div>`;
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
    const predicted = predictMood();
    if (predicted) { applyMood(predicted, true, true); showPredictionBanner(predicted); }
  }
  checkNightMode();
  setInterval(checkNightMode, 30 * 60 * 1000);
}

function showPredictionBanner(moodKey) {
  const mood = MOODS[moodKey];
  const banner = document.createElement('div');
  banner.style.cssText = `
    position:fixed;top:64px;left:50%;transform:translateX(-50%);
    background:#0f0e00;border:1px solid ${mood.color}44;border-radius:50px;
    padding:8px 18px;z-index:9999;font-family:'Rajdhani',sans-serif;
    font-size:12px;letter-spacing:1px;color:${mood.color};
    box-shadow:0 4px 20px rgba(0,0,0,0.5);
    animation:pFade 4s ease forwards;pointer-events:none;
  `;
  banner.textContent = `🧠 Predicted: ${mood.emoji} ${mood.label} mode based on your patterns`;
  const style = document.createElement('style');
  style.textContent = `@keyframes pFade{0%{opacity:0;top:74px}15%{opacity:1;top:64px}75%{opacity:1}100%{opacity:0}}`;
  document.head.appendChild(style);
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 4100);
}

function applyMood(moodKey, save = true, isAuto = false) {
  const mood = MOODS[moodKey];
  if (!mood) return;
  currentMood = moodKey;
  if (save) localStorage.setItem('datta_mood', moodKey);
  if (!isAuto) logMoodToTimeline(moodKey, '');
  if (window.dattaTheme) {
    window.dattaTheme.saveAndApply(mood.color);
    if (window.updateTopbarDot) window.updateTopbarDot();
  }
  const indicator = document.getElementById('moodIndicator');
  if (indicator) {
    indicator.textContent = mood.emoji + ' ' + mood.label;
    indicator.style.color = mood.color;
    indicator.style.borderColor = mood.color + '44';
    indicator.style.background = mood.bgGlow;
    indicator.style.display = 'flex';
  }
  const greetEl = document.querySelector('.welcomeGreeting');
  if (greetEl) {
    const greets = {
      focused:"Let's get things done 🎯", happy:"Let's have some fun! 😄",
      stressed:"Hey, breathe. I've got you 😮‍💨", creative:"Let's make something amazing 🎨",
      lazy:"chill mode activated 😴", curious:"Let's explore something interesting 🔍",
      night:"It's late. Let's go deep 🌙"
    };
    greetEl.textContent = greets[moodKey] || "Good to see you 👋";
    greetEl.style.color = mood.color;
  }
  document.querySelectorAll('.moodBtn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.mood === moodKey));
  window.dattaMoodPersonality = mood.personality;
  window.dattaMoodEmoji = mood.emoji;
  window.dattaMoodLabel = mood.label;

  // Always update the auto mood pill to reflect current active mood
  const pill = document.getElementById("autoMoodPill");
  if (pill) {
    pill.style.border = `1px solid ${mood.color}55`;
    pill.style.background = mood.bgGlow || "rgba(255,215,0,0.05)";
    pill.style.color = mood.color;
    pill.textContent = `${isAuto ? "🤖" : "✅"} ${mood.emoji} ${mood.label}`;
    pill.style.display = "flex";
    pill.style.transition = "all 0.3s ease";
  }

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
      position:fixed;bottom:90px;left:50%;transform:translateX(-50%);
      background:#0f0e00;border-radius:50px;padding:10px 20px;
      font-family:'Rajdhani',sans-serif;font-size:14px;font-weight:600;
      letter-spacing:1px;z-index:9999;pointer-events:none;
      transition:all 0.3s ease;opacity:0;
      box-shadow:0 8px 32px rgba(0,0,0,0.5);white-space:nowrap;
    `;
    document.body.appendChild(toast);
  }
  toast.style.border = `1px solid ${mood.color}44`;
  toast.style.color = mood.color;
  toast.textContent = `${mood.emoji} ${mood.label} mode activated!`;
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; }, 2500);
}

function showFloatToast(msg, color = '#ffd700') {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;bottom:90px;left:50%;transform:translateX(-50%);
    background:#0f0e00;border:1px solid ${color}44;border-radius:50px;
    padding:10px 20px;font-family:'Rajdhani',sans-serif;font-size:13px;
    font-weight:600;letter-spacing:1px;z-index:9999;pointer-events:none;
    color:${color};box-shadow:0 8px 32px rgba(0,0,0,0.5);white-space:nowrap;`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function toggleMoodPanel() {
  const panel = document.getElementById('moodPanel');
  if (!panel) return;
  panel.style.display = panel.style.display !== 'none' ? 'none' : 'block';
  const colorPanel = document.getElementById('colorPanel');
  if (colorPanel) colorPanel.style.display = 'none';
}

function closeMoodPanel() {
  const panel = document.getElementById('moodPanel');
  if (panel) panel.style.display = 'none';
}

document.addEventListener('click', function(e) {
  const panel = document.getElementById('moodPanel');
  const btn = document.getElementById('moodToggleBtn');
  const indicator = document.getElementById('moodIndicator');
  const autoMoodPill = document.getElementById('autoMoodPill');
  const timelinePanel = document.getElementById('moodTimelinePanel');
  const photoOverlay = document.getElementById('photoMoodOverlay');
  const voiceOverlay2 = document.getElementById('voiceMoodOverlay');
  if (panel &&
    !panel.contains(e.target) &&
    !btn?.contains(e.target) &&
    !indicator?.contains(e.target) &&
    !autoMoodPill?.contains(e.target) &&
    !timelinePanel?.contains(e.target) &&
    !photoOverlay?.contains(e.target) &&
    !voiceOverlay2?.contains(e.target)) {
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
