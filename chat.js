// 1. Session Setup
if (!localStorage.getItem("sessionId")) {
    localStorage.setItem("sessionId", Date.now().toString());
}
const sessionId = localStorage.getItem("sessionId");
const chatBox = document.getElementById("chat");
const sendBtn = document.querySelector(".send");
const scrollBtn = document.getElementById("scrollDownBtn");
const messageInput = document.getElementById("message");

let currentChatId = null;
let controller = null;
let userScrolledUp = false;

// 2. TOGGLE SIDEBAR (The Three Dots/Menu Feature)
function toggleSidebar() {
    document.getElementById("sidebar").classList.toggle("active");
}

// 3. FIXED SCROLL DETECTION
chatBox.addEventListener("scroll", () => {
    const isAtBottom = chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight < 100;
    userScrolledUp = !isAtBottom;
    scrollBtn.style.display = userScrolledUp ? "flex" : "none";
});

scrollBtn.addEventListener("click", () => {
    userScrolledUp = false;
    chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: "smooth" });
});

// 4. SEND MESSAGE
async function send() {
    const text = messageInput.value.trim();
    if (!text) return;

    messageInput.value = "";
    document.getElementById("welcomeScreen").style.display = "none";

    chatBox.innerHTML += `
        <div class="messageRow userRow">
            <div class="userBubble">${text}</div>
            <div class="avatar">🧑</div>
        </div>`;

    let aiDiv = document.createElement("div");
    aiDiv.className = "messageRow";
    aiDiv.innerHTML = `<div class="avatar">🤖</div><div class="aiBubble">Typing...</div>`;
    chatBox.appendChild(aiDiv);
    
    chatBox.scrollTop = chatBox.scrollHeight;

    sendBtn.innerHTML = "STOP"; // STOP button
    sendBtn.onclick = stopGeneration;

    controller = new AbortController();

    try {
        const res = await fetch("https://datta-ai-server.onrender.com/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({ message: text, sessionId: sessionId, chatId: currentChatId })
        });

        aiDiv.innerHTML = `
            <div class="avatar">🤖</div>
            <div class="aiContent">
                <div class="aiBubble"><span class="stream"></span></div>
                <div class="aiActions">
                    <button class="actionBtn" onclick="copyText(this)">📋 Copy</button>
                    <button class="actionBtn" onclick="speakText(this)">🔊 Listen</button>
                    <button class="actionBtn" onclick="stopVoice()">■ Stop</button>
                </div>
            </div>`;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let streamText = "";
        let span = aiDiv.querySelector(".stream");

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            
            if (chunk.includes("__CHATID__")) {
                const parts = chunk.split("__CHATID__");
                streamText += parts[0];
                currentChatId = parts[1];
            } else {
                streamText += chunk;
            }
            span.innerHTML = marked.parse(streamText);
            if (!userScrolledUp) chatBox.scrollTop = chatBox.scrollHeight;
        }
        loadSidebar();
    } catch (err) { console.log("Stopped"); }
    finally { resetSendButton(); }
}

function resetSendButton() {
    sendBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" stroke="white" fill="none" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
    sendBtn.onclick = send;
}

// 5. VOICE (SPEAKER) FIX
function speakText(btn) {
    window.speechSynthesis.cancel();
    const text = btn.closest(".aiContent").querySelector(".aiBubble").innerText;
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = 'en-US';
    window.speechSynthesis.speak(speech);
}

function stopVoice() { window.speechSynthesis.cancel(); }

function copyText(btn) {
    const text = btn.closest(".aiContent").querySelector(".aiBubble").innerText;
    navigator.clipboard.writeText(text);
}

// 6. SIDEBAR STORAGE
async function loadSidebar() {
    const history = document.getElementById("history");
    const res = await fetch("https://datta-ai-server.onrender.com/chats/" + sessionId);
    const chats = await res.json();
    history.innerHTML = "";
    chats.reverse().forEach(chat => {
        let div = document.createElement("div");
        div.className = "chatItem";
        div.innerHTML = `<span>${chat.title || "New Chat"}</span><button class="menuBtn" onclick="deleteChat(event,'${chat._id}')">🗑️</button>`;
        div.onclick = () => {
            openChat(chat._id);
            if(window.innerWidth < 768) toggleSidebar(); // Auto-close sidebar on mobile
        };
        history.appendChild(div);
    });
}

async function openChat(chatId) {
    currentChatId = chatId;
    chatBox.innerHTML = "";
    document.getElementById("welcomeScreen").style.display = "none";
    const res = await fetch("https://datta-ai-server.onrender.com/chat/" + chatId);
    const messages = await res.json();
    messages.forEach(m => {
        const isUser = m.role === "user";
        chatBox.innerHTML += `<div class="messageRow ${isUser ? 'userRow' : ''}"><div class="avatar">${isUser?'🧑':'🤖'}</div><div class="${isUser?'userBubble':'aiBubble'}">${marked.parse(m.content)}</div></div>`;
    });
    chatBox.scrollTop = chatBox.scrollHeight;
}

async function deleteChat(e, id) {
    e.stopPropagation();
    await fetch("https://datta-ai-server.onrender.com/chat/" + id, { method: "DELETE" });
    loadSidebar();
}

// 7. UTILS
messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
    }
});

function newChat() {
    currentChatId = null;
    chatBox.innerHTML = "";
    document.getElementById("welcomeScreen").style.display = "block";
    if(window.innerWidth < 768) toggleSidebar();
}

function stopGeneration() { if (controller) controller.abort(); }
function fillPrompt(t) { messageInput.value = t; messageInput.focus(); }

loadSidebar();
