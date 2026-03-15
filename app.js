const chatBox = document.getElementById("chatBox");
const input = document.getElementById("input");
const historyBox = document.getElementById("history");

let chats = JSON.parse(localStorage.getItem("dattaChats")) || [];
let currentChat = [];

/* ============================= */
/* SEND MESSAGE */
/* ============================= */

async function sendMessage() {

const text = input.value.trim();
if(!text) return;

addUserMessage(text);
input.value = "";

showTyping();

const res = await fetch("https://datta-ai-server.onrender.com/chat",{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({message:text})
});

const data = await res.json();

removeTyping();

addAIMessage(data.reply);

currentChat.push({
question:text,
answer:data.reply
});

saveChat(text);

}

/* ============================= */
/* USER MESSAGE */
/* ============================= */

function addUserMessage(text){

const div = document.createElement("div");
div.className = "userMessage";
div.innerText = text;

chatBox.appendChild(div);
scrollBottom();

}

/* ============================= */
/* AI MESSAGE */
/* ============================= */

function addAIMessage(text){

const div = document.createElement("div");
div.className = "aiMessage";
div.innerText = text;

chatBox.appendChild(div);
scrollBottom();

}

/* ============================= */
/* AI TYPING ANIMATION */
/* ============================= */

function showTyping(){

const div = document.createElement("div");
div.id = "typing";
div.className = "aiMessage";
div.innerHTML = "AI typing<span class='dots'>...</span>";

chatBox.appendChild(div);
scrollBottom();

}

function removeTyping(){

const typing = document.getElementById("typing");
if(typing) typing.remove();

}

/* ============================= */
/* SAVE CHAT */
/* ============================= */

function saveChat(title){

if(currentChat.length === 1){

chats.unshift({
title:title,
messages:currentChat
});

localStorage.setItem("dattaChats",JSON.stringify(chats));

renderHistory();

}

}

/* ============================= */
/* SIDEBAR HISTORY */
/* ============================= */

function renderHistory(){

historyBox.innerHTML = "";

chats.forEach((chat,i)=>{

const div = document.createElement("div");

div.className = "historyItem";
div.innerText = chat.title;

div.onclick = ()=>loadChat(i);

historyBox.appendChild(div);

});

}

/* ============================= */
/* LOAD OLD CHAT */
/* ============================= */

function loadChat(index){

chatBox.innerHTML = "";

const chat = chats[index];

chat.messages.forEach(m=>{

addUserMessage(m.question);
addAIMessage(m.answer);

});

}

/* ============================= */
/* ENTER KEY SUPPORT */
/* ============================= */

input.addEventListener("keydown",function(e){

if(e.key === "Enter"){
sendMessage();
}

});

/* ============================= */
/* SCROLL */
/* ============================= */

function scrollBottom(){
chatBox.scrollTop = chatBox.scrollHeight;
}

/* ============================= */
/* LOAD HISTORY ON START */
/* ============================= */

renderHistory();
