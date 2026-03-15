const chat = document.getElementById("chat");
const input = document.getElementById("messageInput");

const sessionId = localStorage.getItem("datta_session") || Date.now().toString();
localStorage.setItem("datta_session", sessionId);

function addMessage(sender,text){

const div = document.createElement("div");
div.className="message";

div.innerHTML="<b>"+sender+":</b> "+text;

chat.appendChild(div);

return div;

}

function speak(text){

const speech = new SpeechSynthesisUtterance(text);

speech.lang="en-US";

speechSynthesis.speak(speech);

}

async function sendMessage(){

const message=input.value.trim();

if(!message) return;

addMessage("You",message);

input.value="";

const typingDiv=addMessage("Datta AI","Thinking...");

const response = await fetch(
"https://datta-ai-server.onrender.com/chat",
{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
message:message,
sessionId:sessionId
})
}
);

const data = await response.json();

typingDiv.innerHTML="<b>Datta AI:</b> "+data.reply;

speak(data.reply);

}

function startVoice(){

const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();

recognition.lang="en-US";

recognition.start();

recognition.onresult = function(event){

const speech = event.results[0][0].transcript;

input.value=speech;

sendMessage();

};

}
