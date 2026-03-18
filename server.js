import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import mongoose from "mongoose"
import multer from "multer"
import Groq from "groq-sdk"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import passport from "passport"
import { Strategy as GoogleStrategy } from "passport-google-oauth20"
import session from "express-session"

dotenv.config()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
})

const app = express()

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-chat-id"]
}))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use(session({
  secret: process.env.JWT_SECRET || "datta-session-secret",
  resave: false,
  saveUninitialized: false
}))

app.use(passport.initialize())
app.use(passport.session())

passport.serializeUser((user, done) => done(null, user))
passport.deserializeUser((user, done) => done(null, user))

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("Mongo error:", err))

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, sparse: true, trim: true },
  password: { type: String },
  phone: { type: String, sparse: true },
  isGuest: { type: Boolean, default: false },
  googleId: { type: String, sparse: true },
  createdAt: { type: Date, default: Date.now }
})

const User = mongoose.model("User", UserSchema)

const otpStore = {}

const MessageSchema = new mongoose.Schema({
  role: String,
  content: String
})

const ChatSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  sessionId: String,
  title: { type: String, default: "New chat" },
  messages: [MessageSchema],
  createdAt: { type: Date, default: Date.now }
})

const Chat = mongoose.model("Chat", ChatSchema)

const JWT_SECRET = process.env.JWT_SECRET || "datta-ai-secret-key-2024"
const FRONTEND_URL = process.env.FRONTEND_URL || "https://harisaiganeshpampana-ai.github.io/datta-ai"

function generateToken(user) {
  return jwt.sign(
    { id: user._id, username: user.username, email: user.email },
    JWT_SECRET,
    { expiresIn: "30d" }
  )
}

function authMiddleware(req, res, next) {
  let token = null

  const header = req.headers.authorization
  if (header) token = header.replace("Bearer ", "").trim()
  if (!token && req.body && req.body.token) token = req.body.token
  if (!token && req.query && req.query.token) token = req.query.token

  if (!token) return res.status(401).json({ error: "No token" })

  if (token.startsWith("guest_")) {
    req.user = { id: token, username: "Guest", isGuest: true }
    return next()
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" })
  }
}

async function webSearch(query) {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: query,
        search_depth: "basic",
        max_results: 5,
        include_answer: true
      })
    })
    const data = await res.json()
    if (!data.results) return null
    const summary = data.answer ? "Quick answer: " + data.answer + "\n\n" : ""
    const sources = data.results.map((r, i) =>
      (i + 1) + ". " + r.title + "\n" + r.content.substring(0, 300) + "...\nSource: " + r.url
    ).join("\n\n")
    return summary + "Search results:\n\n" + sources
  } catch (e) {
    console.error("Web search error:", e.message)
    return null
  }
}

function needsWebSearch(message) {
  if (!message) return false
  const msg = message.toLowerCase()
  const triggers = [
    "latest", "recent", "today", "yesterday", "this week", "this month",
    "current", "now", "right now", "live", "breaking", "news",
    "who is", "what is the", "price of", "weather", "score",
    "2024", "2025", "2026", "happened", "update", "trending",
    "stock", "crypto", "bitcoin", "search", "find", "look up",
    "what happened", "new release"
  ]
  return triggers.some(t => msg.includes(t))
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "https://datta-ai-server.onrender.com/auth/google/callback"
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ googleId: profile.id })
      if (!user) {
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : ""
        // Use first name only as username
        const firstName = profile.displayName ? profile.displayName.split(" ")[0] : "User"
        const username = firstName + "_" + profile.id.slice(-4)
        user = await User.create({ googleId: profile.id, username: username, email: email })
      }
      const token = generateToken(user)
      return done(null, { token, user: { id: user._id, username: user.username, email: user.email } })
    } catch (err) {
      return done(err, null)
    }
  }))
  console.log("Google OAuth enabled")
} else {
  console.log("Google OAuth disabled")
}

app.post("/auth/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body
    if (!username || !email || !password) return res.status(400).json({ error: "All fields required" })
    if (username.length < 3) return res.status(400).json({ error: "Username must be at least 3 characters" })
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" })
    const existing = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username }] })
    if (existing) {
      if (existing.username === username) return res.status(400).json({ error: "Username already taken" })
      return res.status(400).json({ error: "Email already registered" })
    }
    const hashedPassword = await bcrypt.hash(password, 10)
    const user = await User.create({ username, email: email.toLowerCase(), password: hashedPassword })
    const token = generateToken(user)
    res.json({ token, user: { id: user._id, username: user.username, email: user.email } })
  } catch (err) {
    console.error("Signup error:", err.message)
    res.status(500).json({ error: "Server error" })
  }
})

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: "Email and password required" })
    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user || !user.password) return res.status(400).json({ error: "Invalid email or password" })
    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) return res.status(400).json({ error: "Invalid email or password" })
    const token = generateToken(user)
    res.json({ token, user: { id: user._id, username: user.username, email: user.email } })
  } catch (err) {
    console.error("Login error:", err.message)
    res.status(500).json({ error: "Server error" })
  }
})

app.post("/auth/send-otp", async (req, res) => {
  try {
    const { phone } = req.body
    if (!phone) return res.status(400).json({ error: "Phone number required" })
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    otpStore[phone] = { otp, expires: Date.now() + 5 * 60 * 1000 }
    console.log("OTP for " + phone + ": " + otp)
    res.json({ success: true, message: "OTP sent" })
  } catch (err) {
    res.status(500).json({ error: "Failed to send OTP" })
  }
})

app.post("/auth/verify-otp", async (req, res) => {
  try {
    const { phone, otp } = req.body
    const stored = otpStore[phone]
    if (!stored) return res.status(400).json({ error: "OTP expired or not sent" })
    if (Date.now() > stored.expires) {
      delete otpStore[phone]
      return res.status(400).json({ error: "OTP expired" })
    }
    if (stored.otp !== otp) return res.status(400).json({ error: "Invalid OTP" })
    delete otpStore[phone]
    let user = await User.findOne({ phone })
    if (!user) user = await User.create({ username: "user_" + phone.slice(-4), phone })
    const token = generateToken(user)
    res.json({ token, user: { id: user._id, username: user.username, phone: user.phone } })
  } catch (err) {
    res.status(500).json({ error: "Server error" })
  }
})

app.get("/auth/me", authMiddleware, async (req, res) => {
  res.json({ user: req.user })
})

app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }))

app.get("/auth/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: FRONTEND_URL + "/login.html?error=google_failed" }),
  (req, res) => {
    const { token, user } = req.user
    const userStr = encodeURIComponent(JSON.stringify(user))
    res.redirect(FRONTEND_URL + "/login.html?token=" + token + "&user=" + userStr)
  }
)

app.post("/auth/update-username", authMiddleware, async (req, res) => {
  try {
    const { username } = req.body
    if (!username || username.length < 3) return res.status(400).json({ error: "Username must be at least 3 characters" })
    const existing = await User.findOne({ username })
    if (existing && existing._id.toString() !== req.user.id) return res.status(400).json({ error: "Username already taken" })
    await User.findByIdAndUpdate(req.user.id, { username })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post("/auth/change-password", authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body
    const user = await User.findById(req.user.id)
    if (!user || !user.password) return res.status(400).json({ error: "Cannot change password for this account" })
    const isMatch = await bcrypt.compare(currentPassword, user.password)
    if (!isMatch) return res.status(400).json({ error: "Current password is incorrect" })
    const hashed = await bcrypt.hash(newPassword, 10)
    await User.findByIdAndUpdate(req.user.id, { password: hashed })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete("/auth/delete-account", authMiddleware, async (req, res) => {
  try {
    const { password } = req.body
    const user = await User.findById(req.user.id)
    if (!user) return res.status(404).json({ error: "User not found" })
    if (user.password) {
      const isMatch = await bcrypt.compare(password, user.password)
      if (!isMatch) return res.status(400).json({ error: "Incorrect password" })
    }
    await Chat.deleteMany({ userId: req.user.id })
    await User.findByIdAndDelete(req.user.id)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post("/chat", upload.single("image"), authMiddleware, async (req, res) => {
  try {
    const message = req.body.message || ""
    const chatId = req.body.chatId || ""
    const language = req.body.language || "English"
    const file = req.file || null
    const userId = req.user.id

    console.log("User:", req.user.username, "| Message:", message)

    if (!message && !file) return res.status(400).json({ error: "No message or file" })

    if (file && file.size > 5 * 1024 * 1024) return res.status(413).json({ error: "File too large. Max 5MB." })

    if (file) {
      const allowed = ["image/", "text/", "application/pdf", "application/json"]
      const isAllowed = allowed.some(t => file.mimetype.startsWith(t))
      if (!isAllowed) return res.status(400).json({ error: "File type not supported. Use images, PDFs, or text files." })
    }

    let chat = null
    if (chatId && chatId !== "" && chatId !== "null" && chatId !== "undefined") {
      try { chat = await Chat.findOne({ _id: chatId, userId: userId }) } catch (e) { chat = null }
    }

    if (!chat) {
      // Generate smart title from first message
      let title = "New chat"
      if (message && message.trim()) {
        // For short greetings, use generic title
        const greetings = ["hi", "hii", "hello", "hey", "helo", "hai", "sup", "yo"]
        const msgLower = message.trim().toLowerCase()
        if (greetings.includes(msgLower)) {
          title = "New conversation"
        } else {
          title = message.trim().substring(0, 45)
          if (message.trim().length > 45) title += "..."
        }
      }
      chat = await Chat.create({ userId: userId, title: title, messages: [] })
    }

    const savedContent = message || "[File: " + (file ? file.originalname : "unknown") + "]"
    chat.messages.push({ role: "user", content: savedContent })
    await chat.save()

    res.setHeader("x-chat-id", chat._id.toString())
    res.setHeader("Content-Type", "text/plain")

    let searchContext = ""
    if (message && needsWebSearch(message) && process.env.TAVILY_API_KEY) {
      console.log("Searching web for:", message)
      const results = await webSearch(message)
      if (results) {
        searchContext = "\n\n[Web Search Results]\n" + results + "\n[End of Search Results]\n"
        console.log("Web search done")
      }
    }

    const history = chat.messages.slice(0, -1).map(function(m) {
      return { role: m.role === "assistant" ? "assistant" : "user", content: m.content }
    })

    const isImage = file && file.mimetype && file.mimetype.startsWith("image/")
    let userContent

    if (isImage) {
      const base64 = file.buffer.toString("base64")
      const dataUrl = "data:" + file.mimetype + ";base64," + base64
      userContent = [
        { type: "text", text: (message || "Please analyze this image.") + searchContext },
        { type: "image_url", image_url: { url: dataUrl } }
      ]
    } else if (file) {
      try {
        const fileText = file.buffer.toString("utf-8")
        userContent = (message ? message + "\n\n" : "") + "[File: " + file.originalname + "]\n\n" + fileText + searchContext
      } catch (e) {
        userContent = (message ? message + "\n\n" : "") + "[File: " + file.originalname + "]" + searchContext
      }
    } else {
      userContent = message + searchContext
    }

    const model = isImage ? "meta-llama/llama-4-scout-17b-16e-instruct" : "llama-3.3-70b-versatile"
    const maxTokens = isImage ? 512 : 400

    const langNote = language && language !== "English" ? " Always respond in " + language + "." : ""
    const searchNote = searchContext ? " If web search results are provided, use them for accurate up-to-date answers and cite sources." : ""

    const aiMessages = [
      {
        role: "system",
        content: "You are Datta AI, a helpful and accurate assistant. Keep answers short and to the point. For simple questions give 1-3 sentences. For complex questions give clear structured answers. If an image or file is provided, analyze it carefully. Never mention the user's name in your answers." + langNote + searchNote
      },
      ...history,
      { role: "user", content: userContent }
    ]

    const stream = await groq.chat.completions.create({
      model: model,
      messages: aiMessages,
      max_tokens: maxTokens,
      stream: true
    })

    let full = ""
    for await (const part of stream) {
      const token = part.choices?.[0]?.delta?.content
      if (token) { full += token; res.write(token) }
    }

    chat.messages.push({ role: "assistant", content: full })

    // After 2nd exchange or if title is generic, generate a smart title
    if (chat.messages.length === 4 || chat.title === "New conversation" || chat.title === "New chat") {
      try {
        const titleRes = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "user",
              content: "Generate a very short title (max 5 words) for a chat that started with this message: " + message + ". Just give the title, nothing else, no quotes."
            }
          ],
          max_tokens: 20
        })
        const newTitle = titleRes.choices?.[0]?.message?.content?.trim()
        if (newTitle && newTitle.length > 0) {
          chat.title = newTitle
        }
      } catch(e) {
        console.log("Title generation failed:", e.message)
      }
    }

    await chat.save()
    res.write("CHATID" + chat._id)
    res.end()

  } catch (err) {
    console.error("Chat error:", err.message)
    if (!res.headersSent) res.status(500).send("Server error: " + err.message)
  }
})

app.get("/chats", authMiddleware, async (req, res) => {
  try {
    const chats = await Chat.find({ userId: req.user.id }).sort({ createdAt: -1 }).select("title createdAt")
    res.json(chats)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get("/chat/:id", authMiddleware, async (req, res) => {
  try {
    const chat = await Chat.findOne({ _id: req.params.id, userId: req.user.id })
    if (!chat) return res.json([])
    res.json(chat.messages)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete("/chat/:id", authMiddleware, async (req, res) => {
  try {
    await Chat.findOneAndDelete({ _id: req.params.id, userId: req.user.id })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete("/chats/all", authMiddleware, async (req, res) => {
  try {
    await Chat.deleteMany({ userId: req.user.id })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post("/chat/:id/rename", authMiddleware, async (req, res) => {
  try {
    await Chat.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, { title: req.body.title })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, function() {
  console.log("Server running on port " + PORT)
})
