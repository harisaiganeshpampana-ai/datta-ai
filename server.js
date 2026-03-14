const express = require("express")
const cors = require("cors")

const app = express()

app.use(cors())
app.use(express.json())

/* SERVER STATUS */

app.get("/", (req,res)=>{
res.send("Datta AI server running")
})

/* CHAT API */

app.post("/chat", async (req,res)=>{

try{

const userMessage = req.body.message

if(!userMessage){
return res.json({reply:"Message missing"})
}

const response = await fetch("https://openrouter.ai/api/v1/chat/completions",{
method:"POST",
headers:{
"Authorization":`Bearer ${process.env.OPENROUTER_API_KEY}`,
"Content-Type":"application/json"
},
body:JSON.stringify({
model:"deepseek/deepseek-chat",

/* LIMIT RESPONSE SIZE */

max_tokens:120,

messages:[
{
role:"system",
content:"You are Datta AI, a helpful assistant. Always answer in 2 or 3 short sentences. Keep responses simple and concise."
},
{
role:"user",
content:userMessage
}
]

})
})

const data = await response.json()

const reply = data.choices[0].message.content

res.json({reply})

}catch(error){

console.log(error)

res.json({
reply:"AI server error"
})

}

})

/* START SERVER */

const PORT = process.env.PORT || 3000

app.listen(PORT,()=>{
console.log("Datta AI server running on port "+PORT)
})
