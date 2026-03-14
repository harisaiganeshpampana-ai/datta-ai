const express = require("express")
const cors = require("cors")
const bodyParser = require("body-parser")

const app = express()

app.use(cors())
app.use(bodyParser.json())

/* SERVER STATUS CHECK */

app.get("/", (req,res)=>{
res.send("Datta AI server running")
})

/* CHAT ENDPOINT */

app.post("/chat",(req,res)=>{

try{

const userMessage = req.body?.message

if(!userMessage){
return res.json({reply:"Message missing"})
}

const msg = userMessage.toLowerCase()

let reply = ""

/* GREETING */

if(
msg.includes("hello") ||
msg.includes("hi") ||
msg.includes("hey")
){
reply = "Hello! How can I assist you today?"
}

/* IDENTITY */

else if(
msg.includes("who are you") ||
msg.includes("your name")
){
reply = "I am Datta AI, your assistant."
}

/* HOW ARE YOU */

else if(
msg.includes("how are you")
){
reply = "I am functioning perfectly. How can I help you?"
}

/* DEFAULT RESPONSE */

else{
reply = "You said: " + userMessage
}

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

app.listen(PORT,()=>{
console.log("Datta AI server running on port " + PORT)
})
