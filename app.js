let chats = JSON.parse(localStorage.getItem("dattaChats")) || []
let currentChat = null
let speaking = false

function cleanText(text){
return text
.replace(/[#*`]/g,"")
.replace(/[\u{1F600}-\u{1F64F}]/gu,"")
.replace(/[\u{1F300}-\u{1F5FF}]/gu,"")
.replace(/[\u{1F680}-\u{1F6FF}]/gu,"")
.replace(/[\u{2600}-\u{26FF}]/gu,"")
.replace(/[\u{2700}-\u{27BF}]/gu,"")
}

function loadSidebar(){

const history=document.getElementById("history")
history.innerHTML=""

chats.forEach((chat,index)=>{

let div=document.createElement("div")

div.innerText=chat.title

div.onclick=()=>openChat(index)

history.appendChild(div)

})

}

function newChat(){

if(currentChat && currentChat.messages.length>0){

chats.unshift(currentChat)

localStorage.setItem("dattaChats",JSON.stringify(chats))

}

currentChat=null

document.getElementById("chat").innerHTML=""

loadSidebar()

}

function openChat(index){

currentChat=chats[index]

const chat=document.getElementById("chat")
chat.innerHTML=""

currentChat.messages.forEach(m=>{

if(m.role==="user"){
chat.innerHTML+=`<div class="user">${m.text}</div>`
}else{
chat.innerHTML+=`<div class="ai">
${m.text}
<button class="speakBtn" onclick="speak(this)">🔊</button>
</div>`
}

})

}

async function send(){

let input=document.getElementById("message")

let msg=input.value.trim()

if(!msg)return

const chat=document.getElementById("chat")

chat.innerHTML+=`<div class="user">${msg}</div>`

input.value=""

const res=await fetch("https://datta-ai-server.onrender.com/chat",{

method:"POST",

headers:{"Content-Type":"application/json"},

body:JSON.stringify({message:msg})

})

const data=await res.json()

const clean=cleanText(data.reply)

chat.innerHTML+=`

<div class="ai">
${clean}
<button class="speakBtn" onclick="speak(this)">🔊</button>
</div>

`

chat.scrollTop=chat.scrollHeight

if(!currentChat){

currentChat={
title:msg.substring(0,40),
messages:[]
}

}

currentChat.messages.push({role:"user",text:msg})
currentChat.messages.push({role:"ai",text:clean})

}

function speak(btn){

const text=btn.parentElement.innerText.replace("🔊","")

if(speaking){

speechSynthesis.cancel()

speaking=false

btn.innerText="🔊"

return

}

let speech=new SpeechSynthesisUtterance(text)

speech.onend=function(){

speaking=false
btn.innerText="🔊"

}

speechSynthesis.speak(speech)

speaking=true

btn.innerText="⏹"

}

function voice(){

const rec=new(window.SpeechRecognition||window.webkitSpeechRecognition)()

rec.lang="en-US"

rec.start()

rec.onresult=e=>{

document.getElementById("message").value=e.results[0][0].transcript

send()

}

}

function upload(){

document.getElementById("fileInput").click()

}

document.getElementById("fileInput").addEventListener("change",async function(){

let file=this.files[0]

let form=new FormData()

form.append("file",file)

const res=await fetch("https://datta-ai-server.onrender.com/upload",{

method:"POST",

body:form

})

const data=await res.json()

const chat=document.getElementById("chat")

chat.innerHTML+=`<div class="ai">${cleanText(data.reply)}</div>`

})

document.getElementById("message").addEventListener("keypress",function(e){

if(e.key==="Enter"){
send()
}

})

loadSidebar()
