const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.post("/chat", (req,res)=>{

const userMessage = req.body.message;

res.json({
reply: "Datta AI received: " + userMessage
});

});

app.listen(3000,()=>{
console.log("Datta AI server running");
});
