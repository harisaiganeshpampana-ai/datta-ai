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

mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("MongoDB connected"))
.catch(err=>console.log(err));

const ChatSchema = new mongoose.Schema({
sessionId:String,
messages:Array
});

const Chat = mongoose.model("Chat",ChatSchema);

app.post("/chat", async (req,res)=>{

try{

const {message,sessionId}=req.body;

let chat=await Chat.findOne({sessionId});

if(!chat){
chat=new Chat({
sessionId:sessionId,
messages:[]
});
}

chat.messages.push({
role:"user",
content:message
});

const response=await fetch(
"https://openrouter.ai/api/v1/chat/completions",
{
method:"POST",
headers:{
"Authorization":`Bearer ${process.env.OPENROUTER_API_KEY}`,
"Content-Type":"application/json"
},
body:JSON.stringify({
model:"deepseek/deepseek-chat",
messages:chat.messages
})
}
);

const data=await response.json();

const reply=data?.choices?.[0]?.message?.content || "AI error";

chat.messages.push({
role:"assistant",
content:reply
});

await chat.save();

res.json({reply});

}catch(err){

console.log(err);

res.json({
reply:"Server error. Try again."
});

}

});

app.listen(PORT,()=>{
console.log("Server running on port "+PORT);
});
