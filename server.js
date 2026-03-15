const express = require("express")
const mongoose = require("mongoose")
const cors = require("cors")
const axios = require("axios")
const Memory = require("./models/Memory")

const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.PORT || 3000


/* -------------------
MongoDB Connection
------------------- */

mongoose.connect(process.env.MONGO_URI)
.then(()=> console.log("MongoDB connected"))
.catch(err=> console.log(err))


/* -------------------
DeepSeek AI Function
------------------- */

async function askAI(message){

const response = await axios.post(
"https://api.deepseek.com/v1/chat/completions",
{
model: "deepseek-chat",
messages: [
{ role: "system", content: "You are Datta AI, a helpful AI assistant." },
{ role: "user", content: message }
]
},
{
headers: {
"Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
"Content-Type": "application/json"
}
}
)

return response.data.choices[0].message.content

}


/* -------------------
Chat API
------------------- */

app.post("/chat", async (req,res)=>{

try{

const userMessage = req.body.message

const aiReply = await askAI(userMessage)

const memory = new Memory({
userId: "user1",
message: userMessage,
response: aiReply
})

await memory.save()

res.json({
reply: aiReply
})

}catch(error){

console.log(error)

res.json({
reply:"AI error occurred"
})

}

})


/* -------------------
Memory Viewer
------------------- */

app.get("/memory", async (req,res)=>{

const history = await Memory.find().sort({timestamp:-1}).limit(20)

res.json(history)

})


/* -------------------
Test Route
------------------- */

app.get("/", (req,res)=>{
res.send("Datta AI server running")
})


app.listen(PORT, ()=>{
console.log("Datta AI server running")
})
