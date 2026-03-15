import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import fetch from "node-fetch";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

/* ========================= */
/* MONGODB CONNECTION */
/* ========================= */

mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("MongoDB connected"))
.catch(err=>console.log(err));

/* ========================= */
/* CHAT SCHEMA */
/* ========================= */

const ChatSchema = new mongoose.Schema({

sessionId:String,

title:{
type:String,
default:"New Chat"
},

messages:[
{
id:String,
role:String,
content:String
}
],

createdAt:{
type:Date,
default:Date.now
},

updatedAt:{
type:Date,
default:Date.now
}

});

const Chat = mongoose.model("Chat",ChatSchema);

/* ========================= */
/* CHAT ROUTE */
/* ========================= */

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

title:"New Chat",

messages:[
{
id:crypto.randomUUID(),
role:"system",
content:"You are Datta AI, a helpful AI assistant. Answer clearly, professionally, and concisely. Avoid jokes, emojis, or unnecessary commentary. Provide clean and understandable answers."
}
]

});

}

/* LIMIT MESSAGE HISTORY */

if(chat.messages.length > 40){
chat.messages = chat.messages.slice(-40);
}

/* ADD USER MESSAGE */

const userMessage = {
id:crypto.randomUUID(),
role:"user",
content:message
};

chat.messages.push(userMessage);

/* ========================= */
/* CALL AI WITH STREAM */
/* ========================= */

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
messages: chat.messages.map(m=>({
role:m.role,
content:m.content
})),
temperature:0.5,
stream:true
})
}
);

if(!response.ok){
throw new Error("OpenRouter API error");
}

/* STREAM HEADERS */

res.setHeader("Content-Type","text/event-stream");
res.setHeader("Cache-Control","no-cache");
res.setHeader("Connection","keep-alive");

let reply="";

for await (const chunk of response.body){

const text = chunk.toString();
const lines = text.split("\n");

for(const line of lines){

if(line.startsWith("data: ")){

const json=line.replace("data: ","").trim();

if(json==="[DONE]") continue;

try{

const parsed=JSON.parse(json);
const token=parsed?.choices?.[0]?.delta?.content;

if(token){

reply+=token;
res.write(token);

}

}catch{}

}

}

}

/* SAVE AI MESSAGE */

const aiMessage = {
id:crypto.randomUUID(),
role:"assistant",
content:reply
};

chat.messages.push(aiMessage);

/* UPDATE CHAT TIME */

chat.updatedAt = new Date();

await chat.save();

/* SEND CHAT ID */

res.write(`__CHATID__${chat._id}`);
res.end();

}catch(err){

console.log(err);
res.end("Server error");

}

});

/* ========================= */
/* REGENERATE RESPONSE */
/* ========================= */

app.post("/chat/:chatId/regenerate", async (req,res)=>{

try{

const {chatId} = req.params;

const chat = await Chat.findById(chatId);

if(!chat){
return res.json({error:"Chat not found"});
}

/* REMOVE LAST AI MESSAGE */

if(chat.messages.length > 0){
chat.messages.pop();
}

/* LAST USER MESSAGE */

const lastUser = [...chat.messages].reverse().find(m=>m.role==="user");

if(!lastUser){
return res.json({error:"No user message"});
}

/* CALL AI AGAIN */

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
messages: chat.messages.map(m=>({
role:m.role,
content:m.content
})),
temperature:0.5
})
}
);

const data = await response.json();

const reply = data.choices?.[0]?.message?.content || "";

/* SAVE NEW MESSAGE */

chat.messages.push({
id:crypto.randomUUID(),
role:"assistant",
content:reply
});

chat.updatedAt = new Date();

await chat.save();

res.json({reply});

}catch(err){

console.log(err);
res.json({error:"Regenerate failed"});

}

});

/* ========================= */
/* SIDEBAR CHATS */
/* ========================= */

app.get("/chats/:sessionId", async (req,res)=>{

try{

const {sessionId} = req.params;

const chats = await Chat.find({sessionId})
.sort({updatedAt:-1})
.select("_id title createdAt updatedAt");

res.json(chats);

}catch(err){

console.log(err);
res.json([]);

}

});

/* ========================= */
/* LOAD FULL CHAT */
/* ========================= */

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

/* ========================= */
/* RENAME CHAT TITLE */
/* ========================= */

app.post("/chat/:chatId/rename", async (req,res)=>{

try{

const {chatId} = req.params;
const {title} = req.body;

await Chat.findByIdAndUpdate(chatId,{title});

res.json({success:true});

}catch(err){

console.log(err);
res.json({success:false});

}

});

/* ========================= */
/* DELETE CHAT */
/* ========================= */

app.delete("/chat/:chatId", async (req,res)=>{

try{

const {chatId} = req.params;

await Chat.findByIdAndDelete(chatId);

res.json({success:true});

}catch(err){

console.log(err);
res.json({success:false});

}

});

/* ========================= */
/* START SERVER */
/* ========================= */

app.listen(PORT,()=>{
console.log("Server running on port "+PORT);
});
