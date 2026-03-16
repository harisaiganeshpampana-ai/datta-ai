if(!localStorage.getItem("sessionId")){
    localStorage.setItem("sessionId",Date.now().toString())
}

const sessionId = localStorage.getItem("sessionId")
const chatBox = document.getElementById("chat")
const sendBtn = document.querySelector(".send")
const scrollBtn = document.getElementById("scrollDownBtn")

let currentChatId = null
let lastUserMessage = ""
let titleUpdated = false
let controller = null
let userScrolledUp = false

// --- FIXED SCROLL LOGIC ---
chatBox.addEventListener("scroll", () => {
    const threshold = 100 
    // Calculate if we are NOT at the bottom
    const isAtBottom = chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight < threshold
    
    userScrolledUp = !isAtBottom

    if(userScrolledUp){
        scrollBtn.style.display = "flex" // Make sure it shows up
        scrollBtn.style.opacity = "1"    // Ensure it's not transparent
    } else {
        scrollBtn.style.display = "none"
    }
})

function newChat(){
    currentChatId = null
    titleUpdated = false
    chatBox.innerHTML = ""
    showWelcome()
}

async function send(){
    const input = document.getElementById("message")
    let text = input.value.trim()

    if(!text) return

    lastUserMessage = text
    hideWelcome()

    chatBox.innerHTML += `
    <div class="messageRow userRow">
    <div class="userBubble">${text}</div>
    <div class="avatar">🧑</div>
    </div>
    `

    input.value = ""

    let aiDiv = document.createElement("div")
    aiDiv.className = "messageRow"
    aiDiv.innerHTML = `
    <div class="avatar">🤖</div>
    <div class="aiBubble typing">
    <span></span><span></span><span></span>
    </div>
    `
    chatBox.appendChild(aiDiv)
    scrollBottom()

    sendBtn.innerText = "⛔"
    sendBtn.onclick = stopGeneration

    controller = new AbortController()

    try {
        const res = await fetch("https://datta-ai-server.onrender.com/chat",{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            signal: controller.signal,
            body:JSON.stringify({
                message:text,
                sessionId:sessionId,
                chatId:currentChatId
            })
        })

        // --- FIXED ICON COLORS (Stroke="white") ---
        aiDiv.innerHTML = `
        <div class="avatar">🤖</div>
        <div class="aiContent">
            <div class="aiBubble">
                <span class="stream"></span>
            </div>
            <div class="aiActions">
                <button class="actionBtn" onclick="copyText(this)" title="Copy">
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="18" height="18">
                        <rect x="9" y="9" width="13" height="13" rx="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                </button>
                <button class="actionBtn" onclick="speakText(this)" title="Listen">
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="18" height="18">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19"></polygon>
                        <path d="M19 9a3 3 0 0 1 0 6"></path>
                        <path d="M22 7a6 6 0 0 1 0 10"></path>
                    </svg>
                </button>
                <button class="actionBtn" onclick="stopVoice()" title="Stop Voice">
                    <svg viewBox="0 0 24 24" fill="white" width="18" height="18">
                        <rect x="6" y="6" width="12" height="12"></rect>
                    </svg>
                </button>
                <button class="actionBtn" onclick="regenerateFrom(this)" title="Regenerate">
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="18" height="18">
                        <polyline points="23 4 23 10 17 10"></polyline>
                        <polyline points="1 20 1 14 7 14"></polyline>
                        <path d="M3.5 9a9 9 0 0 1 14-3L23 10"></path>
                        <path d="M20.5 15a9 9 0 0 1-14 3L1 14"></path>
                    </svg>
                </button>
            </div>
        </div>
        `

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let streamText = ""
        let span = aiDiv.querySelector(".stream")

        while(true){
            const {done,value} = await reader.read()
            if(done) break
            const chunk = decoder.decode(value)

            if(chunk.includes("__CHATID__")){
                const parts = chunk.split("__CHATID__")
                streamText += parts[0]
                span.innerHTML = marked.parse(streamText) + '<span class="cursor" style="color:white;">▌</span>'
                currentChatId = parts[1]
            }else{
                streamText += chunk
                span.innerHTML = marked.parse(streamText) + '<span class="cursor" style="color:white;">▌</span>'
            }
            scrollBottom()
        }

        span.innerHTML = marked.parse(streamText)
        addCopyButtons()

        const greetings = ["hi","hello","hey","hii"]
        if(!titleUpdated && !greetings.includes(text.toLowerCase()) && currentChatId){
            await updateChatTitle(currentChatId,text)
            titleUpdated = true
        }
        loadSidebar()
    } catch(err) {
        console.log("Stopped")
    } finally {
        sendBtn.innerText = "➤"
        sendBtn.onclick = send
    }
}

async function loadSidebar(){
    try {
        const res = await fetch("https://datta-ai-server.onrender.com/chats/" + sessionId)
        const chats = await res.json()
        const history = document.getElementById("history")
        history.innerHTML = ""
        renderGroup("Recent Chats", chats)
    } catch(e) { console.error(e) }
}

function renderGroup(title,list){
    if(list.length===0) return
    const history = document.getElementById("history")
    let label = document.createElement("div")
    label.className = "chatGroup"
    label.innerText = title
    history.appendChild(label)

    list.forEach(chat=>{
        let div = document.createElement("div")
        div.className = "chatItem"
        div.innerHTML = `
        <div class="chatTitle">${chat.title}</div>
        <div class="chatActions">
            <button class="menuBtn" style="color:white;" onclick="toggleMenu(event,'${chat._id}')">⋮</button>
            <div class="chatMenu" id="menu-${chat._id}">
                <button onclick="deleteChat(event,'${chat._id}')">Delete</button>
            </div>
        </div>
        `
        div.onclick = (e)=>{
            if(e.target.closest(".menuBtn")) return
            openChat(chat._id)
        }
        history.appendChild(div)
    })
}

async function openChat(chatId){
    currentChatId = chatId
    chatBox.innerHTML = ""
    hideWelcome()
    const res = await fetch("https://datta-ai-server.onrender.com/chat/" + chatId)
    const messages = await res.json()

    messages.forEach(m=>{
        if(m.role==="user"){
            chatBox.innerHTML += `<div class="messageRow userRow"><div class="userBubble">${m.content}</div><div class="avatar">🧑</div></div>`
        }else{
            chatBox.innerHTML += `
            <div class="messageRow">
                <div class="avatar">🤖</div>
                <div class="aiContent">
                    <div class="aiBubble">${marked.parse(m.content)}</div>
                    <div class="aiActions">
                        <button class="actionBtn" onclick="copyText(this)" style="color:white;">📋</button>
                        <button class="actionBtn" onclick="speakText(this)" style="color:white;">🔊</button>
                        <button class="actionBtn" onclick="stopVoice()" style="color:white;">■</button>
                        <button class="actionBtn" onclick="regenerateFrom(this)" style="color:white;">↻</button>
                    </div>
                </div>
            </div>`
        }
    })
    addCopyButtons()
    scrollBottom()
}

// Helper functions (Scroll, Welcome, Stop)
function scrollBottom(){
    if(userScrolledUp) return
    chatBox.scrollTo({ top: chatBox.scrollHeight, behavior:"smooth" })
}

scrollBtn.addEventListener("click", () => {
    userScrolledUp = false
    chatBox.scrollTo({ top: chatBox.scrollHeight, behavior:"smooth" })
})

document.getElementById("message").addEventListener("keydown", (e) => {
    if(e.key === "Enter" && !e.shiftKey){
        e.preventDefault()
        send()
    }
})

function stopGeneration(){
    if(controller) controller.abort()
    sendBtn.innerText = "➤"
    sendBtn.onclick = send
}

function hideWelcome(){ document.getElementById("welcomeScreen").style.display="none" }
function showWelcome(){ document.getElementById("welcomeScreen").style.display="block" }

loadSidebar()
