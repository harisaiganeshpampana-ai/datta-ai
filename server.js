const express = require("express")
const cors = require("cors")

const app = express()

app.use(cors())
app.use(express.json())

app.get("/", (req,res)=>{
res.send("Datta AI server running")
})

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
messages:[
{role:"system",content:"You are Datta AI, a helpful assistant."},
{role:"user",content:userMessage}
]
})
})

const data = await response.json()

const reply = data.choices[0].message.content

res.json({reply})

}catch(err){

console.log(err)

res.json({reply:"AI server error"})

}

})

const PORT = process.env.PORT || 3000

app.listen(PORT,()=>{
console.log("Datta AI server running on port "+PORT)
})
