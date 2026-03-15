import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

/* MONGODB CONNECTION */

mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("MongoDB connected"))
.catch(err=>console.log(err));

/* CHAT SCHEMA (UPDATED) */

const ChatSchema = new mongoose.Schema({

sessionId:String,

title:String,

messages:[
{
role:String,
content:String
}
]

});

const Chat = mongoose.model("Chat",ChatSchema);

/* CHAT ROUTE */

app.post("/chat", async (req,res)=>{

try{

const {message,sessionId,chatId} = req.body;

let chat;

/* CONTINUE EXISTING CHAT */

if(chatId){

chat = await Chat.findById(chatId);

}

/* CREATE NEW CHAT */

if(!chat){

chat = new Chat({

sessionId,

title: message.slice(0,40),

messages:[
{
role:"system",
content:"You are Datta AI, a helpful AI assistant. Answer clearly, professionally, and concisely. Avoid jokes, emojis, or unnecessary commentary. Provide clean and understandable answers."
}
]

});

}

/* ADD USER MESSAGE */

chat.messages.push({
role:"user",
content:message
});

/* CALL AI */

const response = await fetch(
"https://openrouter.ai/api/v1/chat/completions",
{
method:"POST",
headers:{
"Authorization":`Bearer ${process.env.OPENROUTER_API_KEY}`,
"Content-Type":"application/json"
},
body: JSON.stringify({
model:"openai/gpt-4o-mini",
messages: chat.messages.slice(-10),
temperature:0.5
})
}
);

/* CHECK RESPONSE */

if(!response.ok){
throw new Error("OpenRouter API error");
}

/* GET AI RESPONSE */

const data = await response.json();

let reply = data?.choices?.[0]?.message?.content || "AI error";

reply = reply.trim();

/* SAVE AI MESSAGE */

chat.messages.push({
role:"assistant",
content:reply
});

await chat.save();

/* RETURN RESPONSE */

res.json({
reply:reply,
chatId:chat._id
});

}catch(err){

console.log(err);

res.json({reply:"Server error"});

}

});


/* SIDEBAR CHATS */

app.get("/chats/:sessionId", async (req,res)=>{

try{

const {sessionId} = req.params;

const chats = await Chat.find({sessionId})
.sort({_id:-1})
.select("_id title");

res.json(chats);

}catch(err){

console.log(err);
res.json([]);

}

});


/* LOAD FULL CHAT */

app.get("/chat/:chatId", async (req,res)=>{

try{

const {chatId} = req.params;

const chat = await Chat.findById(chatId);

if(!chat){
return res.json([]);
}

res.json(chat.messages);

}catch(err){

console.log(err);
res.json([]);

}

});


/* START SERVER */

app.listen(PORT,()=>{
console.log("Server running on port "+PORT);
});
