const express = require("express")
const cors = require("cors")
const bodyParser = require("body-parser")

const app = express()

app.use(cors())                // allow requests from your website
app.use(bodyParser.json())     // read JSON from frontend

app.get("/", (req,res)=>{
res.send("Datta AI server running")
})

app.post("/chat", async (req,res)=>{

try{

const userMessage = req.body.message

if(!userMessage){
return res.json({reply:"No message received"})
}

/* simple AI response (replace later with OpenAI if needed) */

let reply = ""

if(userMessage.toLowerCase().includes("hello")){
reply="Hello! How can I assist you today?"
}
else if(userMessage.toLowerCase().includes("who are you")){
reply="I am Datta AI, your assistant."
}
else{
reply="You said: " + userMessage
}

res.json({reply})

}
catch(err){

console.error(err)
res.status(500).json({reply:"Server error"})

}

})

const PORT = process.env.PORT || 3000

app.listen(PORT, ()=>{
console.log("Server running on port " + PORT)
})
