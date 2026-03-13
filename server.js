const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req,res)=>{
res.send("Datta AI server running");
});

app.post("/chat",(req,res)=>{

let message = req.body.message.toLowerCase();
let reply = "I don't understand yet. Ask something else.";

/* greetings */

if(message.includes("hi") || message.includes("hello")){
reply = "Hello! How can I help you?";
}

/* identity */

else if(message.includes("who are you")){
reply = "I am Datta AI, your assistant.";
}

/* activity */

else if(message.includes("what are you doing")){
reply = "I am talking with you right now.";
}

/* help */

else if(message.includes("help")){
reply = "You can ask me about technology, coding, or general questions.";
}

/* thanks */

else if(message.includes("thank")){
reply = "You're welcome!";
}

/* yes */

else if(message.includes("yes")){
reply = "Okay. What would you like to ask next?";
}

/* bye */

else if(message.includes("bye")){
reply = "Goodbye! See you later.";
}

/* fallback */

else{
reply = "You said: " + message;
}

res.json({reply:reply});

});

const PORT = process.env.PORT || 3000;

app.listen(PORT,()=>{
console.log("Server running on port " + PORT);
});
