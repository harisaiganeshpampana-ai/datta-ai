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
.catch((err)=>{
    console.log("MongoDB error:", err);
});


/* =========================
Basic AI Brain
========================= */

function aiReply(message){

message = message.toLowerCase();

if(message.includes("hello") || message.includes("hi")){
return "Hello! I am Datta AI. How can I help you?";
}

if(message.includes("who is messi")){
return "Lionel Messi is an Argentine football player widely considered one of the greatest players in football history. He won the FIFA World Cup with Argentina in 2022 and has won multiple Ballon d'Or awards.";
}

if(message.includes("what is ai")){
return "Artificial Intelligence is technology that allows machines to learn, reason and solve problems like humans.";
}

if(message.includes("who created you")){
return "I was created as part of the Datta AI project.";
}

if(message.includes("how are you")){
return "I'm doing great! Thanks for asking.";
}

return "I am still learning. Tell me more.";

}


/* =========================
Chat Route
========================= */

app.post("/chat", async (req,res)=>{

try{

const userMessage = req.body.message;

const reply = aiReply(userMessage);

const memory = new Memory({
userId: "user1",
message: userMessage,
response: reply
});

await memory.save();

res.json({
reply: reply
});

}catch(error){

console.log(error);

res.status(500).json({
reply: "Server error"
});

}

});


/* =========================
Get Memory
========================= */

app.get("/memory", async (req,res)=>{

const history = await Memory.find().sort({timestamp:-1}).limit(20);

res.json(history);

});


/* =========================
Test Route
========================= */

app.get("/", (req,res)=>{
res.send("Datta AI server running");
});


/* =========================
Start Server
========================= */

app.listen(PORT, ()=>{
console.log("Datta AI server running");
});
