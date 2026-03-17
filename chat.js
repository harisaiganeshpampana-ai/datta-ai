if(!localStorage.getItem("sessionId")){
localStorage.setItem("sessionId",Date.now().toString())
}

const sessionId = localStorage.getItem("sessionId")
const chatBox = document.getElementById("chat")
const sendBtn = document.querySelector(".send")
const scrollBtn = document.getElementById("scrollDownBtn")

let currentChatId = null
let controller = null
let userScrolledUp = false


function newChat(){
currentChatId = null
chatBox.innerHTML = ""

// reset scroll properly (optional but safe)
chatBox.scrollTop = 0

showWelcome()
}


async function send(){

const input = document.getElementById("message")
let text = input.value.trim()
   
if (!currentChatId) {
    let title = text.substring(0, 30)

    if (title.length < text.length) {
        title += "..."
    }

    saveChatTitle(title)
}
if(!text) return

hideWelcome()
document.body.classList.add("chat-started")
   
chatBox.innerHTML += `
<div class="messageRow userRow">
<div class="userBubble">${text}</div>
<div class="avatar">🧑</div>
</div>
`

chatBox.scrollTop = chatBox.scrollHeight

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

chatBox.scrollTop = chatBox.scrollHeight

controller = new AbortController()

const res = await fetch("https://datta-ai-server.onrender.com/chat", {
   method: "POST",
   headers: {"Content-Type":"application/json"},
   signal: controller.signal,
   body: JSON.stringify({
      message: text,
      sessionId: sessionId,
      chatId: currentChatId
   })
})

const chatIdFromHeader = res.headers.get("x-chat-id")

if (!currentChatId && chatIdFromHeader) {
   currentChatId = chatIdFromHeader
}

aiDiv.innerHTML = `
<div class="avatar">🤖</div>
<div class="aiContent">
<div class="aiBubble">
<span class="stream"></span>
</div>

<div class="aiActions">
<button onclick="copyText(this)"><i data-lucide="copy"></i></button>
<button onclick="speakText(this)"><i data-lucide="volume-2"></i></button>
<button onclick="stopVoice()"><i data-lucide="square"></i></button>
<button onclick="regenerateFrom(this)"><i data-lucide="refresh-ccw"></i></button>
</div>

</div>
`

const reader = res.body.getReader()
const decoder = new TextDecoder()

let streamText=""
let span = aiDiv.querySelector(".stream")

while(true){

const {done,value} = await reader.read()
if(done) break

const chunk = decoder.decode(value)

if(chunk.includes("CHATID")){
const parts = chunk.split("CHATID")
streamText += parts[0]
currentChatId = parts[1]
}else{
streamText += chunk
}

span.innerHTML = marked.parse(streamText) + '<span class="cursor">▌</span>'
scrollBottom()
lucide.createIcons()

}

span.innerHTML = marked.parse(streamText)
lucide.createIcons()

loadSidebar()

}




async function loadSidebar(){

const res = await fetch("https://datta-ai-server.onrender.com/chats/"+sessionId)
const chats = await res.json()

const history = document.getElementById("history")
history.innerHTML=""

chats.forEach(chat=>{

let div = document.createElement("div")
div.className="chatItem"

div.innerHTML = `
<div class="chatTitle">${chat.title}</div>

<div class="chatActions">
<button class="menuBtn" onclick="toggleMenu(event,'${chat._id}')">⋮</button>

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
chatBox.innerHTML=""

hideWelcome()

const res = await fetch("https://datta-ai-server.onrender.com/chat/"+chatId)
const messages = await res.json()

messages.forEach(m=>{

if(m.role==="user"){

chatBox.innerHTML += `
<div class="messageRow userRow">
<div class="userBubble">${m.content}</div>
<div class="avatar">🧑</div>
</div>
`

}else{

chatBox.innerHTML += `
<div class="messageRow">
<div class="avatar">🤖</div>

<div class="aiContent">
<div class="aiBubble">
${marked.parse(m.content)}
</div>

<div class="aiActions">
<button class="actionBtn" onclick="copyText(this)">
<i data-lucide="copy"></i>
</button>

<button class="actionBtn" onclick="speakText(this)">
<i data-lucide="volume-2"></i>
</button>

<button class="actionBtn" onclick="stopVoice()">
<i data-lucide="square"></i>
</button>

<button class="actionBtn" onclick="regenerateFrom(this)">
<i data-lucide="refresh-cw"></i>
</button>
</div>

</div>
</div>
`

}

})

scrollBottom()

}


async function deleteChat(e,id){

e.stopPropagation()

await fetch("https://datta-ai-server.onrender.com/chat/"+id,{
method:"DELETE"
})

loadSidebar()

}


function copyText(btn){

const text = btn.closest(".aiContent").querySelector(".aiBubble").innerText
navigator.clipboard.writeText(text)

}


function speakText(btn){

const text = btn.closest(".aiContent").innerText
const speech = new SpeechSynthesisUtterance(text)

speech.lang="en-US"

speechSynthesis.speak(speech)

}


function stopVoice(){
speechSynthesis.cancel()
}


async function regenerateFrom(btn){

const row = btn.closest(".messageRow")
const prev = row.previousElementSibling

if(!prev) return

const text = prev.querySelector(".userBubble").innerText

const aiBubble = row.querySelector(".aiBubble")

aiBubble.innerHTML = `<span class="stream"></span>`

const span = aiBubble.querySelector(".stream")

controller = new AbortController()

const res = await fetch("https://datta-ai-server.onrender.com/chat",{
method:"POST",
headers:{"Content-Type":"application/json"},
signal: controller.signal,
body:JSON.stringify({
message:text,
title:text.substring(0,40),
sessionId:sessionId,
chatId:currentChatId
})
})

const reader = res.body.getReader()
const decoder = new TextDecoder()

let streamText=""

while(true){

const {done,value} = await reader.read()
if(done) break

const chunk = decoder.decode(value)

if(chunk.includes("CHATID")){
const parts = chunk.split("CHATID")
streamText += parts[0]
currentChatId = parts[1]
}else{
streamText += chunk
}

span.innerHTML = marked.parse(streamText) + '<span class="cursor">▌</span>'

scrollBottom()

}

span.innerHTML = marked.parse(streamText)

addCopyButtons()

}


function startAssistant(){

const recognition = new(window.SpeechRecognition||window.webkitSpeechRecognition)()

recognition.lang="en-US"

recognition.start()

recognition.onresult=(e)=>{
document.getElementById("message").value=e.results[0][0].transcript
send()
}

}


function toggleMenu(e,id){

e.stopPropagation()

document.querySelectorAll(".chatMenu").forEach(m=>{
m.style.display="none"
})

const menu = document.getElementById("menu-"+id)

if(menu) menu.style.display="block"

}


window.onclick=()=>{
document.querySelectorAll(".chatMenu").forEach(m=>{
m.style.display="none"
})
}


function scrollBottom(){

if(userScrolledUp) return

chatBox.scrollTo({
top:chatBox.scrollHeight,
behavior:"smooth"
})

}


function fillPrompt(text){
document.getElementById("message").value = text
hideWelcome()
send()
}


function hideWelcome(){

const w = document.getElementById("welcomeScreen")

if(w) w.style.display="none"

}


function showWelcome(){

const w = document.getElementById("welcomeScreen")

if(w) w.style.display="block"

}


document.getElementById("message").addEventListener("keydown",function(e){

if(e.key==="Enter"){
e.preventDefault()
send()
}

})


loadSidebar()

window.fillPrompt = function(text){

const input = document.getElementById("message")

input.value = text

hideWelcome()

send()

}
document.querySelectorAll(".suggestBtn").forEach(btn=>{
btn.addEventListener("click",()=>{

const text = btn.getAttribute("data-text")

const input = document.getElementById("message")

input.value = text

hideWelcome()

send()

})
})

window.send = send
function toggleSidebar() {
    const sidebar = document.querySelector(".sidebar")
    sidebar.classList.toggle("show")
}

window.toggleSidebar = toggleSidebar
function toggleSidebar() {
    const sidebar = document.querySelector(".sidebar")
    sidebar.classList.toggle("show")
}

window.toggleSidebar = toggleSidebar

function saveChatTitle(title) {
    const history = document.getElementById("history")

    if (!history) return

    const div = document.createElement("div")
    div.className = "chatItem"

    div.innerHTML = `
        <span class="chatTitle">${title}</span>
    `

    history.prepend(div)
}
