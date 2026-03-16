// 1. Initialization
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

// 2. FIXED SCROLL DOWN ARROW
// This detects when you scroll away from the bottom
chatBox.addEventListener("scroll", () => {
    const threshold = 100;
    const isAtBottom = chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight < threshold;
    
    userScrolledUp = !isAtBottom;

    if (scrollBtn) {
        if (userScrolledUp) {
            scrollBtn.style.display = "flex";
            scrollBtn.style.opacity = "1"; 
            scrollBtn.style.visibility = "visible";
            scrollBtn.style.bottom = "20px"; // Adjust position so it's visible
        } else {
            scrollBtn.style.display = "none";
            scrollBtn.style.opacity = "0";
        }
    }
});

scrollBtn.addEventListener("click", () => {
    userScrolledUp = false;
    chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: "smooth" });
});

// 3. VOICE / SPEAKER FUNCTION
function speakText(btn) {
    // Stop any existing speech
    window.speechSynthesis.cancel();

    // Get the text from the bubble next to this button
    const aiContent = btn.closest(".aiContent");
    const text = aiContent.querySelector(".aiBubble").innerText;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    
    // Optional: Add an 'onstart' effect to show it's working
    utterance.onstart = () => { btn.style.transform = "scale(1.2)"; };
    utterance.onend = () => { btn.style.transform = "scale(1)"; };

    window.speechSynthesis.speak(utterance);
}

function stopVoice() {
    window.speechSynthesis.cancel();
}

// 4. SEND MESSAGE LOGIC
async function send() {
    const text = messageInput.value.trim();
    if (!text) return;

    messageInput.value = "";
    hideWelcome();

    // User Message
    chatBox.innerHTML += `
        <div class="messageRow userRow">
            <div class="userBubble">${text}</div>
            <div class="avatar">🧑</div>
        </div>`;

    // AI Placeholder
    let aiDiv = document.createElement("div");
    aiDiv.className = "messageRow";
    aiDiv.innerHTML = `
        <div class="avatar">🤖</div>
        <div class="aiBubble typing"><span></span><span></span><span></span></div>`;
    chatBox.appendChild(aiDiv);
    
    scrollBottom(true);

    // Toggle button to Stop mode
    sendBtn.innerHTML = `<span style="font-size:12px;">Stop</span>`;
    sendBtn.onclick = stopGeneration;

    controller = new AbortController();

    try {
        const res = await fetch("https://datta-ai-server.onrender.com/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({ message: text, sessionId: sessionId, chatId: currentChatId })
        });

        // Response Layout
        aiDiv.innerHTML = `
            <div class="avatar">🤖</div>
            <div class="aiContent">
                <div class="aiBubble"><span class="stream"></span></div>
                <div class="aiActions" style="opacity:1; visibility:visible;">
                    <button class="actionBtn" onclick="copyText(this)">📋</button>
                    <button class="actionBtn" onclick="speakText(this)">🔊</button>
                    <button class="actionBtn" onclick="stopVoice()">■</button>
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
            span.innerHTML = marked.parse(streamText) + '<span class="cursor">▌</span>';
            scrollBottom();
        }
        span.innerHTML = marked.parse(streamText);
        loadSidebar();

    } catch (err) {
        console.log("Request Aborted");
    } finally {
        resetSendButton();
    }
}

function resetSendButton() {
    sendBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" stroke="white" fill="none" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>`;
    sendBtn.onclick = send;
}

function stopGeneration() {
    if (controller) controller.abort();
    resetSendButton();
}

// 5. SIDEBAR & SEARCH
async function loadSidebar() {
    try {
        const res = await fetch("https://datta-ai-server.onrender.com/chats/" + sessionId);
        const chats = await res.json();
        const history = document.getElementById("history");
        history.innerHTML = "";
        
        chats.reverse().forEach(chat => {
            let div = document.createElement("div");
            div.className = "chatItem";
            div.innerHTML = `
                <div class="chatTitle">${chat.title || "New Chat"}</div>
                <button class="menuBtn" onclick="deleteChat(event,'${chat._id}')">🗑️</button>
            `;
            div.onclick = () => openChat(chat._id);
            history.appendChild(div);
        });
    } catch (e) { console.error("History fail"); }
}

function searchChats() {
    const term = document.getElementById("search").value.toLowerCase();
    document.querySelectorAll(".chatItem").forEach(item => {
        item.style.display = item.innerText.toLowerCase().includes(term) ? "flex" : "none";
    });
}

// 6. UTILS
function scrollBottom(force = false) {
    if (userScrolledUp && !force) return;
    chatBox.scrollTop = chatBox.scrollHeight;
}

messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
    }
});

function hideWelcome() {
    const ws = document.getElementById("welcomeScreen");
    if (ws) ws.style.display = "none";
}

function fillPrompt(text) {
    messageInput.value = text;
    messageInput.focus();
}

function copyText(btn) {
    const text = btn.closest(".aiContent").querySelector(".aiBubble").innerText;
    navigator.clipboard.writeText(text);
}

// Load initial history
loadSidebar();
