const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const fetch = require("node-fetch");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

/* MONGODB CONNECTION */

mongoose.connect(process.env.MONGO_URL)
.then(()=>{
    console.log("MongoDB connected");
})
.catch(err=>{
    console.log("MongoDB error:",err);
});

/* CHAT SCHEMA */

const chatSchema = new mongoose.Schema({
  question:String,
  answer:String,
  time:Date
});

const Chat = mongoose.model("Chat",chatSchema);

/* SERVER STATUS */

app.get("/",(req,res)=>{
  res.send("Datta AI server running");
});

/* CHAT API */

app.post("/chat", async (req,res)=>{

  try{

    const userMessage = req.body.message;

    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions",{
      method:"POST",
      headers:{
        "Authorization":`Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        model:"deepseek/deepseek-chat",
        messages:[
          {role:"user",content:userMessage}
        ]
      })
    });

    const data = await aiResponse.json();

    const answer = data.choices[0].message.content;

    /* SAVE TO DATABASE */

    await Chat.create({
      question:userMessage,
      answer:answer,
      time:new Date()
    });

    res.json({reply:answer});

  }catch(error){

    console.log(error);

    res.json({
      reply:"Error contacting AI"
    });

  }

});

/* GET CHAT HISTORY */

app.get("/history", async (req,res)=>{

  const chats = await Chat.find().sort({time:-1}).limit(20);

  res.json(chats);

});

/* START SERVER */

app.listen(PORT,()=>{
  console.log("Datta AI server running on port",PORT);
});
