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
messages:Array
});

const Chat = mongoose.model("Chat",ChatSchema);

/* CHAT ROUTE */

app.post("/chat", async (req,res)=>{

try{

const {message,sessionId} = req.body;

/* FIND OR CREATE CHAT */

let chat = await Chat.findOne({sessionId});

if(!chat){

chat = new Chat({
sessionId,
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

/* CLEAN RESPONSE */

reply = reply.trim();

/* SAVE AI MESSAGE */

chat.messages.push({
role:"assistant",
content:reply
});

await chat.save();

/* RETURN ANSWER */

res.json({reply});

}catch(err){

console.log(err);

res.json({reply:"Server error"});

}

});

/* START SERVER */

app.listen(PORT,()=>{
console.log("Server running on port "+PORT);
});
