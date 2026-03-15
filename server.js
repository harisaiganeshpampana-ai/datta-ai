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

/* CHAT SCHEMA */

const ChatSchema = new mongoose.Schema({

sessionId:String,

title:{
type:String,
default:"New Chat"
},

messages:[
{
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

title:"New Chat",

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

/* CALL AI WITH STREAM */

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
temperature:0.5,
stream:true
})
}
);

if(!response.ok){
throw new Error("OpenRouter API error");
}

/* STREAM RESPONSE */

res.setHeader("Content-Type","text/event-stream");

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

chat.messages.push({
role:"assistant",
content:reply
});

/* UPDATE CHAT ACTIVITY TIME */

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


/* SIDEBAR CHATS */

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


/* RENAME CHAT TITLE */

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


/* DELETE CHAT */

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


/* START SERVER */

app.listen(PORT,()=>{
console.log("Server running on port "+PORT);
});
