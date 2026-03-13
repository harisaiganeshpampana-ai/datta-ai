app.post("/chat", (req,res)=>{
  const message = req.body.message;
  res.json({ reply: "You said: " + message });
});
