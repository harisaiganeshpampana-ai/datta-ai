const express = require("express")
const cors = require("cors")
const mongoose = require("mongoose")

const app = express()

app.use(cors())
app.use(express.json())

/* ---------------- DATABASE ---------------- */

mongoose.connect(process.env.MONGODB_URI)
.then(()=>console.log("MongoDB connected"))
.catch(err=>console.log(err))

const chatSchema = new mongoose.Schema({
  role:String,
  content:String,
  createdAt:{ type:Date, default:Date.now }
})

const Chat = mongoose.model("Chat", chatSchema)

/* ---------------- ROUTES ---------------- */

app.get("/", (req,res)=>{
  res.send("Datta AI server running")
})

app.post("/chat", async (req,res)=>{

  try{

    const userMessage = req.body.message

    /* save user message */
    await Chat.create({
      role:"user",
      content:userMessage
    })

    /* get last 10 messages */
    const history = await Chat
      .find()
      .sort({createdAt:-1})
      .limit(10)

    const messages = history.reverse().map(m=>({
      role:m.role,
      content:m.content
    }))

    const today = new Date().toDateString()

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "Authorization":"Bearer "+process.env.OPENROUTER_API_KEY
        },
        body:JSON.stringify({
          model:"deepseek/deepseek-chat",
          max_tokens:300,
          messages:[
            {
              role:"system",
              content:
              "You are Datta AI. Give clear simple answers. Do not use markdown symbols like ** or ###. Today's date is "+today
            },
            ...messages
          ]
        })
      }
    )

    const data = await response.json()

    const reply =
      data?.choices?.[0]?.message?.content ||
      "AI did not return a response"

    /* save AI reply */
    await Chat.create({
      role:"assistant",
      content:reply
    })

    res.json({reply})

  }
  catch(error){

    console.log(error)

    res.json({
      reply:"Server error"
    })

  }

})

/* ---------------- SERVER ---------------- */

const PORT = process.env.PORT || 10000

app.listen(PORT,()=>{
  console.log("Datta AI server running")
})
