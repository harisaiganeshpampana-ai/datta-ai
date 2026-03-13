async function send(){

let input=document.getElementById("userInput").value;
let messages=document.getElementById("messages");

messages.innerHTML += "<p><b>You:</b> "+input+"</p>";

let thinkingMsg=document.createElement("p");
thinkingMsg.innerHTML="<b>Datta AI:</b> Thinking...";
messages.appendChild(thinkingMsg);

const response = await fetch(
"https://datta-ai-server.onrender.com/chat",
{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({message:input})
});

const data = await response.json();

thinkingMsg.innerHTML="<b>Datta AI:</b> "+data.reply;

}
