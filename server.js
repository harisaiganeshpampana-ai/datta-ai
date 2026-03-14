const express = require("express")
const cors = require("cors")
const bodyParser = require("body-parser")

const app = express()

app.use(cors())
app.use(bodyParser.json())

/* SERVER CHECK */

app.get("/", (req,res)=>{
res.send("Datta AI server running")
})

/* CHAT API */

app.post("/chat", async (req,res)=>{

try{

const userMessage = req.body?.message

/* CHECK MESSAGE */

if(!userMessage){
return res.json({reply:"Message missing"})
}

let reply=""

/* SIMPLE AI RULES */

if(userMessage.toLowerCase().includes("hello")){
reply="Hello! How can I assist you today?"
}

else if(userMessage.toLowerCase().includes("who are you")){
reply="I am Datta AI, your assistant."
}

else if(userMessage.toLowerCase().includes("your name")){
reply="My name is Datta AI."
}

else if(userMessage.toLowerCase().includes("how are you")){
reply="I am functioning perfectly. How can I help you?"
}

else{
reply="You said: " + userMessage
}

/* SEND RESPONSE */

res.json({reply})

}

catch(error){

console.log(error)

res.json({
reply:"AI server error"
})

}

})

/* START SERVER */

const PORT = process.env.PORT || 3000

app.listen(PORT, ()=>{
console.log("Datta AI server running on port " + PORT)
})
