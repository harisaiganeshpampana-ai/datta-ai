if(!localStorage.getItem("sessionId")){
localStorage.setItem("sessionId",Date.now().toString())
}

const sessionId = localStorage.getItem("sessionId")
const chatBox = document.getElementById("chat")

let currentChatId = null
let lastUserMessage = ""
let titleUpdated = false

/* NEW CHAT */

function newChat(){
currentChatId = null
titleUpdated = false
chatBox.innerHTML = ""
}

/* SEND MESSAGE */

async function send(){

const input = document.getElementById("message")
let text = input.value.trim()

if(!text) return

lastUserMessage = text

chatBox.innerHTML += `

<div class="messageRow userRow">
<div class="userBubble">${text}</div>
<div class="avatar">🧑</div>
</div>
`input.value = ""

let aiDiv = document.createElement("div")
aiDiv.className = "messageRow"

aiDiv.innerHTML = `

<div class="avatar">🤖</div>
<div class="aiBubble typing">
<span></span><span></span><span></span>
</div>
`chatBox.appendChild(aiDiv)

scrollBottom()

const res = await fetch("https://datta-ai-server.onrender.com/chat",{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({
message:text,
sessionId:sessionId,
chatId:currentChatId
})
})

aiDiv.innerHTML = `

<div class="avatar">🤖</div>
<div class="aiBubble">
<span id="stream"></span>
<button class="copyBtn" onclick="copyText(this)">📋</button>
<button onclick="speakText(this)">🗣</button>
<button onclick="stopVoice()">⏹</button>
<button onclick="regenerate()">🔄</button>
</div>
`const reader = res.body.getReader()
const decoder = new TextDecoder()

let streamText = ""
let span = aiDiv.querySelector("#stream")

while(true){

const {done,value} = await reader.read()
if(done) break

const chunk = decoder.decode(value)

if(chunk.includes("CHATID")){

const parts = chunk.split("CHATID")

streamText += parts[0]
span.innerHTML = marked.parse(streamText) + "<span class="cursor">▌</span>"
currentChatId = parts[1]

}else{

streamText += chunk
span.innerHTML = marked.parse(streamText) + "<span class="cursor">▌</span>"

}

scrollBottom()

}

/* remove typing cursor when finished */

span.innerHTML = marked.parse(streamText)

addCopyButtons()

/* CHATGPT STYLE TITLE */

const greetings = [
"hi","hello","hey","hii",
"hi!","hello!","hey!",
"good morning","good afternoon","good evening"
]

const cleaned = text.toLowerCase().trim()

if(
!titleUpdated &&
!greetings.includes(cleaned) &&
cleaned.length > 3 &&
currentChatId
){
await updateChatTitle(currentChatId,text)
titleUpdated = true
}

loadSidebar()

}

/* UPDATE CHAT TITLE */

async function updateChatTitle(chatId,message){

if(!chatId) return

await fetch("https://datta-ai-server.onrender.com/chat/"+chatId+"/rename",{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
title:message.slice(0,40)
})
})

}

/* LOAD SIDEBAR */

async function loadSidebar(){

const res = await fetch("https://datta-ai-server.onrender.com/chats/" + sessionId)
const chats = await res.json()

const history = document.getElementById("history")
history.innerHTML = ""

const today = new Date()
today.setHours(0,0,0,0)

const yesterday = new Date(today)
yesterday.setDate(today.getDate()-1)

const week = new Date(today)
week.setDate(today.getDate()-7)

let groups = {
today:[],
yesterday:[],
week:[],
older:[]
}

chats.forEach(chat=>{

let date = new Date(chat.createdAt || Date.now())

if(date >= today) groups.today.push(chat)
else if(date >= yesterday) groups.yesterday.push(chat)
else if(date >= week) groups.week.push(chat)
else groups.older.push(chat)

})

function renderGroup(title,list){

if(list.length===0) return

let label = document.createElement("div")
label.className = "chatGroup"
label.innerText = title
history.appendChild(label)

list.forEach(chat=>{

let div = document.createElement("div")
div.className = "chatItem"

div.innerHTML = `

<div class="chatTitle">${chat.title}</div><div class="chatActions"><button class="menuBtn" onclick="toggleMenu(event,'${chat._id}')">⋮</button>

<div class="chatMenu" id="menu-${chat._id}">
<button onclick="deleteChat(event,'${chat._id}')">🗑 Delete</button>
</div></div>
`div.onclick = (e)=>{
if(e.target.closest(".menuBtn")) return
openChat(chat._id)
}

history.appendChild(div)

})

}

renderGroup("Today",groups.today)
renderGroup("Yesterday",groups.yesterday)
renderGroup("Last 7 days",groups.week)
renderGroup("Older",groups.older)

}

/* OPEN CHAT */

async function openChat(chatId){

currentChatId = chatId
chatBox.innerHTML = ""

const res = await fetch("https://datta-ai-server.onrender.com/chat/" + chatId)
const messages = await res.json()

messages.forEach(m=>{

if(m.role==="user"){

chatBox.innerHTML += `

<div class="messageRow userRow">
<div class="userBubble">${m.content}</div>
<div class="avatar">🧑</div>
</div>
`}else{

chatBox.innerHTML += `

<div class="messageRow">
<div class="avatar">🤖</div>
<div class="aiBubble">${marked.parse(m.content)}</div>
</div>
`}

})

addCopyButtons()

scrollBottom()

}

/* DELETE CHAT */

async function deleteChat(e,id){

e.stopPropagation()

await fetch("https://datta-ai-server.onrender.com/chat/" + id,{
method:"DELETE"
})

loadSidebar()

}

/* SEARCH */

function searchChats(){

const input = document.getElementById("search").value.toLowerCase()
const items = document.querySelectorAll(".chatItem")

items.forEach(i=>{
i.style.display = i.innerText.toLowerCase().includes(input) ? "flex" : "none"
})

}

/* COPY */

function copyText(btn){
navigator.clipboard.writeText(btn.parentElement.innerText)
}

/* COPY BUTTONS FOR CODE */

function addCopyButtons(){

document.querySelectorAll("pre").forEach(block=>{

if(block.querySelector(".codeCopy")) return

const btn = document.createElement("button")
btn.innerText = "Copy"
btn.className = "codeCopy"

btn.onclick = ()=>{
navigator.clipboard.writeText(block.innerText)
btn.innerText="Copied"
setTimeout(()=>btn.innerText="Copy",1000)
}

block.appendChild(btn)

})

}

/* VOICE */

function speakText(btn){

const text = btn.parentElement.innerText
const speech = new SpeechSynthesisUtterance(text)

speech.lang = "en-US"
speechSynthesis.speak(speech)

}

function stopVoice(){
speechSynthesis.cancel()
}

/* VOICE INPUT */

function startAssistant(){

const recognition = new(window.SpeechRecognition || window.webkitSpeechRecognition)()

recognition.lang = "en-US"
recognition.start()

recognition.onresult = function(e){
document.getElementById("message").value = e.results[0][0].transcript
send()
}

}

/* FILE */

function uploadFile(){

const file = document.getElementById("file").files[0]

if(file){
alert("File uploaded: " + file.name)
}

}

/* REGENERATE */

function regenerate(){

if(lastUserMessage){
document.getElementById("message").value = lastUserMessage
send()
}

}

/* MENU */

function toggleMenu(e,id){

e.stopPropagation()

document.querySelectorAll(".chatMenu").forEach(m=>{
m.style.display = "none"
})

const menu = document.getElementById("menu-" + id)

if(menu){
menu.style.display = "block"
}

}

window.onclick = function(){

document.querySelectorAll(".chatMenu").forEach(m=>{
m.style.display = "none"
})

}

/* SCROLL */

function scrollBottom(){
chatBox.scrollTo({
top: chatBox.scrollHeight,
behavior:"smooth"
})
}

/* ENTER SEND */

document.getElementById("message").addEventListener("keydown",function(e){

if(e.key==="Enter"){
e.preventDefault()
send()
}

})

/* INITIAL LOAD */

loadSidebar()
