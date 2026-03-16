// Initialization
if (!localStorage.getItem("sessionId")) {
    localStorage.setItem("sessionId", Date.now().toString());
}
const sessionId = localStorage.getItem("sessionId");
const chatBox = document.getElementById("chat");
const sendBtn = document.querySelector(".send");
const scrollBtn = document.getElementById("scrollDownBtn");
const messageInput = document.getElementById("message");
const sidebar = document.getElementById("sidebar");

let currentChatId = null;
let controller = null;
let userScrolledUp = false;

// Toggle Sidebar (Mobile Menu)
function toggleSidebar() {
    sidebar.classList.toggle("active");
}

// Scroll detection logic
chatBox.addEventListener("scroll", () => {
    const isAtBottom = chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight < 100;
    userScrolledUp = !isAtBottom;
    scrollBtn.style.display = userScrolledUp ? "flex" : "none";
});

scrollBtn.addEventListener("click", () => {
    userScrolledUp = false;
    chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: "smooth" });
});

// Voice / Speaker Function
function speakText(btn) {
    window.speechSynthesis.cancel();
    const aiBubble = btn.closest(".aiContent").querySelector(".aiBubble");
    const speech = new SpeechSynthesisUtterance(aiBubble.innerText);
    speech.lang = 'en-US';
    window.speechSynthesis.speak(speech);
}

function stopVoice() { window.speechSynthesis.cancel(); }

// API Messaging
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
    aiDiv.innerHTML = `<div class="avatar">🤖</div><div class="aiBubble">...</div>`;
    chatBox.appendChild(aiDiv);
    chatBox.scrollTop = chatBox.scrollHeight;

    sendBtn.innerHTML = "STOP";
    sendBtn.onclick = () => { if(controller) controller.abort(); };

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
            streamText += decoder.decode(value);
            span.innerHTML = marked.parse(streamText);
            if (!userScrolledUp) chatBox.scrollTop = chatBox.scrollHeight;
        }
        loadSidebar();
    } catch (err) { console.log("Stopped"); }
    finally { 
        sendBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" stroke="white" fill="none" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
        sendBtn.onclick = send;
    }
}

async function loadSidebar() {
    const history = document.getElementById("history");
    const res = await fetch("https://datta-ai-server.onrender.com/chats/" + sessionId);
    const chats = await res.json();
    history.innerHTML = "";
    chats.reverse().forEach(chat => {
        let div = document.createElement("div");
        div.className = "chatItem";
        div.innerHTML = `<span>${chat.title || "New Chat"}</span><button class="menuBtn" onclick="deleteChat(event,'${chat._id}')">🗑️</button>`;
        div.onclick = () => { openChat(chat._id); if(window.innerWidth < 768) toggleSidebar(); };
        history.appendChild(div);
    });
}

function openChat(chatId) {
    currentChatId = chatId;
    chatBox.innerHTML = "";
    document.getElementById("welcomeScreen").style.display = "none";
    fetch("https://datta-ai-server.net/chat/" + chatId).then(r => r.json()).then(messages => {
        messages.forEach(m => {
            const isUser = m.role === "user";
            chatBox.innerHTML += `<div class="messageRow ${isUser?'userRow':''}"><div class="avatar">${isUser?'🧑':'🤖'}</div><div class="${isUser?'userBubble':'aiBubble'}">${marked.parse(m.content)}</div></div>`;
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    });
}

messageInput.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }});
function newChat() { currentChatId = null; chatBox.innerHTML = ""; document.getElementById("welcomeScreen").style.display = "block"; if(window.innerWidth < 768) toggleSidebar(); }
function copyText(btn) { navigator.clipboard.writeText(btn.closest(".aiContent").querySelector(".aiBubble").innerText); }
function deleteChat(e, id) { e.stopPropagation(); fetch("https://datta-ai-server.onrender.com/chat/"+id, {method:"DELETE"}).then(() => loadSidebar()); }
loadSidebar();
