const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req,res)=>{
res.send("Datta AI server running");
});

app.post("/chat", (req,res)=>{

const userMessage = req.body.message;

let reply = "";

if(userMessage.toLowerCase().includes("hello") || userMessage.toLowerCase().includes("hi")){
reply = "Hello! How can I help you?";
}
else if(userMessage.toLowerCase().includes("who are you")){
reply = "I am Datta AI, your assistant.";
}
else if(userMessage.toLowerCase().includes("what are you doing")){
reply = "I am talking with you right now.";
}
else{
reply = "You said: " + userMessage;
}

res.json({reply: reply});

});

const PORT = process.env.PORT || 3000;

app.listen(PORT,()=>{
console.log("Server running on port " + PORT);
});
