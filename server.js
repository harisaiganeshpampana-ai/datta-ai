const express = require("express")
const cors = require("cors")
const mongoose = require("mongoose")

const app = express()

app.use(cors())
app.use(express.json())

// ---------------------
// MongoDB connection
// ---------------------

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB connected"))
.catch(err => console.error("MongoDB error:", err))

// ---------------------
// Chat Schema
// ---------------------

const ChatSchema = new mongoose.Schema({
  message: String,
  reply: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
})

const Chat = mongoose.model("Chat", ChatSchema)

// ---------------------
// Test route
// ---------------------

app.get("/", (req,res)=>{
  res.send("Datta AI server running")
})

// ---------------------
// Chat route
// ---------------------

app.post("/chat", async (req,res)=>{

  try {

    const userMessage = req.body.message

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method:"POST",
        headers:{
          "Authorization":`Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          model:"deepseek/deepseek-chat",
          messages:[
            { role:"user", content:userMessage }
          ]
        })
      }
    )

    const data = await response.json()

    const reply = data.choices[0].message.content

    // save chat
    await Chat.create({
      message:userMessage,
      reply:reply
    })

    res.json({ reply })

  }
  catch(error){
    console.error(error)
    res.status(500).json({error:"Server error"})
  }

})

// ---------------------

const PORT = process.env.PORT || 10000

app.listen(PORT, ()=>{
  console.log("Datta AI server running")
})
