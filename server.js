const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const Memory = require("./models/Memory");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;


/* =========================
MongoDB Connection
========================= */

mongoose.connect(process.env.MONGO_URI)
.then(()=>{
console.log("MongoDB connected");
})
.catch(err=>{
console.log("MongoDB error:", err);
});


/* =========================
AI Brain
========================= */

function aiReply(message, lastMessage){

message = message.toLowerCase();

if(message.includes("hello") || message.includes("hi")){
return "Hello! I am Datta AI. How can I help you?";
}

if(message.includes("who is messi")){
return "Lionel Messi is an Argentine football player widely considered one of the greatest players in football history. He won the FIFA World Cup with Argentina in 2022 and has won multiple Ballon d'Or awards.";
}

if(message.includes("age") && lastMessage && lastMessage.includes("messi")){
return "Lionel Messi was born on June 24, 1987. He is currently 37 years old.";
}

if(message.includes("what is ai")){
return "Artificial Intelligence is technology that allows machines to learn, reason and solve problems similar to humans.";
}

return "I am still learning. Tell me more.";

}


/* =========================
Chat Route
========================= */

app.post("/chat", async (req,res)=>{

try{

const userMessage = req.body.message;

/* get last conversation */
const lastMemory = await Memory.findOne().sort({timestamp:-1});

let lastMessage = "";

if(lastMemory){
lastMessage = lastMemory.message.toLowerCase();
}

/* generate reply */
const reply = aiReply(userMessage, lastMessage);

/* store memory */
const memory = new Memory({
userId: "user1",
message: userMessage,
response: reply
});

await memory.save();

res.json({ reply });

}catch(err){

console.log(err);

res.status(500).json({
reply:"Server error"
});

}

});


/* =========================
Memory Viewer
========================= */

app.get("/memory", async (req,res)=>{

const history = await Memory.find().sort({timestamp:-1}).limit(20);

res.json(history);

});


/* =========================
Server Test
========================= */

app.get("/", (req,res)=>{
res.send("Datta AI server running");
});


app.listen(PORT, ()=>{
console.log("Datta AI server running");
});
