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

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })
const app = express()

app.use(cors({ origin: "*", methods: ["GET","POST","PUT","DELETE","OPTIONS"], allowedHeaders: ["Content-Type","Authorization","x-chat-id"] }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(session({ secret: process.env.JWT_SECRET || "datta-secret", resave: false, saveUninitialized: false }))
app.use(passport.initialize())
app.use(passport.session())
passport.serializeUser((u, done) => done(null, u))
passport.deserializeUser((u, done) => done(null, u))

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("Mongo error:", err))

// ── SCHEMAS ──────────────────────────────────────────────────────────────────
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, sparse: true, trim: true },
  password: String,
  phone: { type: String, sparse: true },
  googleId: { type: String, sparse: true },
  createdAt: { type: Date, default: Date.now }
})
const User = mongoose.model("User", UserSchema)

const MessageSchema = new mongoose.Schema({ role: String, content: String })
const ChatSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  title: { type: String, default: "New chat" },
  messages: [MessageSchema],
  createdAt: { type: Date, default: Date.now }
})
const Chat = mongoose.model("Chat", ChatSchema)

const SubscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  plan: { type: String, default: "free" },
  period: { type: String, default: "monthly" },
  paymentId: String,
  method: String,
  startDate: { type: Date, default: Date.now },
  endDate: Date,
  active: { type: Boolean, default: true }
})
const Subscription = mongoose.model("Subscription", SubscriptionSchema)

// ── PLAN LIMITS ───────────────────────────────────────────────────────────────
const planLimits = {
  free:       { messages: 50,     images: 5,      resetHours: 1 },
  basic:      { messages: 500,    images: 20,     resetHours: 24 },
  pro:        { messages: 999999, images: 999999, resetHours: 0 },
  enterprise: { messages: 999999, images: 999999, resetHours: 0 }
}

const rateLimitStore = {}

function checkAndUpdateLimit(userId, plan, type) {
  const limits = planLimits[plan] || planLimits.free
  if (limits[type] === 999999) return { allowed: true }
  const key = userId.toString() + "_" + type
  const now = Date.now()
  const resetMs = limits.resetHours * 60 * 60 * 1000
  if (!rateLimitStore[key]) rateLimitStore[key] = { count: 0, windowStart: now }
  const store = rateLimitStore[key]
  if (resetMs > 0 && now - store.windowStart > resetMs) { store.count = 0; store.windowStart = now }
  const limit = limits[type]
  if (store.count >= limit) {
    const waitMs = resetMs - (now - store.windowStart)
    return { allowed: false, type, plan, waitMins: Math.ceil(waitMs / 60000), limit }
  }
  store.count++
  return { allowed: true, used: store.count, limit }
}

// ── JWT ───────────────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || "datta-ai-secret-2024"
const FRONTEND_URL = process.env.FRONTEND_URL || "https://harisaiganeshpampana-ai.github.io/datta-ai"

function generateToken(user) {
  return jwt.sign({ id: user._id, username: user.username, email: user.email }, JWT_SECRET, { expiresIn: "30d" })
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
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" })
  }
}

// ── WEB SEARCH ────────────────────────────────────────────────────────────────
async function webSearch(query) {
  try {
    const key = process.env.TAVILY_API_KEY
    if (!key) return null
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({ query, search_depth: "basic", max_results: 5, include_answer: true })
    })
    if (!response.ok) return null
    const data = await response.json()
    if (!data.results || data.results.length === 0) return null
    const answer = data.answer ? "Summary: " + data.answer + "\n\n" : ""
    const sources = data.results.slice(0, 3).map((r, i) =>
      (i + 1) + ". " + r.title + "\n" + r.content.substring(0, 300) + "\nSource: " + r.url
    ).join("\n\n")
    return answer + sources
  } catch (e) {
    console.error("Web search error:", e.message)
    return null
  }
}

function needsWebSearch(message) {
  if (!message) return false
  const msg = message.toLowerCase()
  const triggers = ["latest","recent","today","yesterday","this week","current","now","live","breaking","news","who is","what is the","price of","weather","score","2025","2026","happened","update","trending","stock","crypto","bitcoin","ipl","cricket","match","movie","released","launched","election","president","prime minister","gold","petrol","diesel","result","exam","rate"]
  return triggers.some(t => msg.includes(t))
}

// ── IMAGE DETECTION ───────────────────────────────────────────────────────────
function isImageRequest(message) {
  if (!message) return false
  const msg = message.toLowerCase()
  const triggers = [
    "generate image","create image","make image","generate a image","create a image",
    "generate an image","create an image","make an image","generate photo","create photo",
    "generate picture","create picture","generate art","create art","make art",
    "draw","paint","illustrate","sketch","image of","picture of","photo of",
    "show me a image","show me an image","genrate","generat","dall-e","stable diffusion"
  ]
  return triggers.some(t => msg.includes(t))
}

function getImagePrompt(message) {
  let prompt = message.trim()
  const removes = [
    "generate an image of","create an image of","make an image of",
    "generate a image of","create a image of","make a image of",
    "generate image of","create image of","make image of",
    "generate an image","create an image","make an image",
    "generate a image","create a image","make a image",
    "generate image","create image","make image",
    "generate a photo of","create a photo of","generate a photo","create a photo","generate photo",
    "generate a picture of","create a picture of","generate a picture","create a picture","generate picture",
    "generate art","create art","make art",
    "draw me a","draw me an","draw me","draw a","draw an","draw",
    "paint a","paint an","paint",
    "illustrate a","illustrate an","illustrate",
    "sketch of a","sketch of an","sketch of","sketch a","sketch an","sketch",
    "image of a","image of an","image of",
    "picture of a","picture of an","picture of",
    "photo of a","photo of an","photo of",
    "show me a image of","show me an image of","show me a image","show me an image",
    "genrate an","genrate a","genrate","generat an","generat a","generat"
  ]
  removes.sort((a, b) => b.length - a.length)
  removes.forEach(r => {
    prompt = prompt.replace(new RegExp("^" + r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "\\s*", "i"), "")
  })
  return prompt.trim() || message
}

// ── ALL-ROUNDER SYSTEM PROMPT ─────────────────────────────────────────────────
function getSystemPrompt(language, hasSearch) {
  const langNote = language && language !== "English" ? ` Always respond in ${language}.` : ""
  const searchNote = hasSearch ? " Use the web search results provided to give accurate, up-to-date answers. Always cite sources." : ""

  return `You are Datta AI — a powerful, all-rounder AI assistant like Claude or ChatGPT. You can do ANYTHING.

CORE RULES:
1. ALWAYS give COMPLETE answers — never say "here's a partial example" or cut off code
2. For coding requests: give FULL working code, every line, nothing missing
3. For website requests: give COMPLETE HTML + CSS + JS in one file, fully functional
4. For PDF/document requests: give complete content ready to copy
5. For explanations: be clear, detailed and use examples
6. For math/science: show full working steps
7. For creative writing: be vivid and complete
8. NEVER say "I can't do that" — always find a way to help
9. Format code in proper markdown code blocks with language specified
10. Be smart, helpful and thorough like a senior expert

WHAT YOU CAN DO:
- Build complete websites (HTML/CSS/JS) ✅
- Write full code in ANY language (Python, JS, Java, C++, etc.) ✅  
- Explain anything clearly ✅
- Answer any question on any topic ✅
- Help with math, science, history, geography ✅
- Write essays, stories, emails, reports ✅
- Analyze and debug code ✅
- Give step-by-step tutorials ✅
- Help with business, marketing, strategy ✅
- Medical/legal info (with disclaimer) ✅
- Web search results integration ✅
- Image analysis ✅

For PDF content requests, provide well-structured text content the user can save.
For code: ALWAYS provide 100% complete, working, copy-paste ready code.
For websites: ALWAYS provide complete single-file HTML with embedded CSS and JS.${langNote}${searchNote}`
}

// ── GOOGLE OAUTH ──────────────────────────────────────────────────────────────
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "https://datta-ai-server.onrender.com/auth/google/callback"
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ googleId: profile.id })
      if (!user) {
        const email = profile.emails?.[0]?.value || ""
        const firstName = profile.displayName?.split(" ")[0] || "User"
        const username = firstName + "_" + profile.id.slice(-4)
        user = await User.create({ googleId: profile.id, username, email })
      }
      return done(null, { token: generateToken(user), user: { id: user._id, username: user.username, email: user.email } })
    } catch (err) { return done(err, null) }
  }))
}

const otpStore = {}

// ── AUTH ROUTES ───────────────────────────────────────────────────────────────
app.post("/auth/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body
    if (!username || !email || !password) return res.status(400).json({ error: "All fields required" })
    if (username.length < 3) return res.status(400).json({ error: "Username min 3 characters" })
    if (password.length < 6) return res.status(400).json({ error: "Password min 6 characters" })
    const existing = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username }] })
    if (existing) return res.status(400).json({ error: existing.username === username ? "Username taken" : "Email already registered" })
    const user = await User.create({ username, email: email.toLowerCase(), password: await bcrypt.hash(password, 10) })
    res.json({ token: generateToken(user), user: { id: user._id, username: user.username, email: user.email } })
  } catch (err) { res.status(500).json({ error: "Server error" }) }
})

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: "Email and password required" })
    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user || !user.password) return res.status(400).json({ error: "Invalid email or password" })
    if (!await bcrypt.compare(password, user.password)) return res.status(400).json({ error: "Invalid email or password" })
    res.json({ token: generateToken(user), user: { id: user._id, username: user.username, email: user.email } })
  } catch (err) { res.status(500).json({ error: "Server error" }) }
})

app.post("/auth/send-otp", async (req, res) => {
  try {
    const { phone } = req.body
    if (!phone) return res.status(400).json({ error: "Phone required" })
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    otpStore[phone] = { otp, expires: Date.now() + 5 * 60 * 1000 }
    console.log("OTP for " + phone + ": " + otp)
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: "Server error" }) }
})

app.post("/auth/verify-otp", async (req, res) => {
  try {
    const { phone, otp } = req.body
    const stored = otpStore[phone]
    if (!stored || Date.now() > stored.expires) return res.status(400).json({ error: "OTP expired" })
    if (stored.otp !== otp) return res.status(400).json({ error: "Invalid OTP" })
    delete otpStore[phone]
    let user = await User.findOne({ phone })
    if (!user) user = await User.create({ username: "user_" + phone.slice(-4), phone })
    res.json({ token: generateToken(user), user: { id: user._id, username: user.username } })
  } catch (err) { res.status(500).json({ error: "Server error" }) }
})

app.get("/auth/google", passport.authenticate("google", { scope: ["profile","email"] }))

app.get("/auth/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: FRONTEND_URL + "/login.html?error=google_failed" }),
  (req, res) => {
    const { token, user } = req.user
    res.redirect(FRONTEND_URL + "/login.html?token=" + token + "&user=" + encodeURIComponent(JSON.stringify(user)))
  }
)

app.post("/auth/update-username", authMiddleware, async (req, res) => {
  try {
    const { username } = req.body
    if (!username || username.length < 3) return res.status(400).json({ error: "Min 3 characters" })
    const existing = await User.findOne({ username })
    if (existing && existing._id.toString() !== req.user.id) return res.status(400).json({ error: "Username taken" })
    await User.findByIdAndUpdate(req.user.id, { username })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post("/auth/change-password", authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body
    const user = await User.findById(req.user.id)
    if (!user || !user.password) return res.status(400).json({ error: "Cannot change password" })
    if (!await bcrypt.compare(currentPassword, user.password)) return res.status(400).json({ error: "Wrong current password" })
    await User.findByIdAndUpdate(req.user.id, { password: await bcrypt.hash(newPassword, 10) })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete("/auth/delete-account", authMiddleware, async (req, res) => {
  try {
    const { password } = req.body
    const user = await User.findById(req.user.id)
    if (!user) return res.status(404).json({ error: "User not found" })
    if (user.password && !await bcrypt.compare(password, user.password)) return res.status(400).json({ error: "Wrong password" })
    await Chat.deleteMany({ userId: req.user.id })
    await Subscription.deleteMany({ userId: req.user.id })
    await User.findByIdAndDelete(req.user.id)
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── SUBSCRIPTION ROUTES ───────────────────────────────────────────────────────
app.get("/payment/subscription", authMiddleware, async (req, res) => {
  try {
    const sub = await Subscription.findOne({ userId: req.user.id, active: true })
    const plan = sub ? sub.plan : "free"
    res.json({ plan, period: sub?.period || "monthly", endDate: sub?.endDate || null, limits: planLimits[plan] })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post("/payment/activate", authMiddleware, async (req, res) => {
  try {
    const { plan, method, paymentId, period } = req.body
    const validPlans = ["free","basic","pro","enterprise"]
    if (!validPlans.includes(plan)) return res.status(400).json({ error: "Invalid plan" })
    const months = period === "yearly" ? 12 : 1
    const endDate = new Date()
    endDate.setMonth(endDate.getMonth() + months)
    await Subscription.findOneAndUpdate(
      { userId: req.user.id },
      { plan, period, paymentId, method, startDate: new Date(), endDate, active: true },
      { upsert: true, new: true }
    )
    res.json({ success: true, plan, endDate })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── MAIN CHAT ROUTE ───────────────────────────────────────────────────────────
app.post("/chat", upload.single("image"), authMiddleware, async (req, res) => {
  try {
    const message = req.body.message || ""
    const chatId = req.body.chatId || ""
    const language = req.body.language || "English"
    const file = req.file || null
    const userId = req.user.id

    if (!message && !file) return res.status(400).json({ error: "No message or file" })

    // Get user plan
    const sub = await Subscription.findOne({ userId: userId, active: true }).catch(() => null)
    const userPlan = sub ? sub.plan : "free"

    // Rate limiting
    if (isImageRequest(message)) {
      const imgCheck = checkAndUpdateLimit(userId, userPlan, "images")
      if (!imgCheck.allowed) {
        return res.status(429).json({ error: "IMAGE_LIMIT", plan: userPlan, waitMins: imgCheck.waitMins, limit: imgCheck.limit })
      }
    } else {
      const msgCheck = checkAndUpdateLimit(userId, userPlan, "messages")
      if (!msgCheck.allowed) {
        return res.status(429).json({ error: "MESSAGE_LIMIT", plan: userPlan, waitMins: msgCheck.waitMins, limit: msgCheck.limit })
      }
    }

    // Find or create chat
    let chat = null
    if (chatId && chatId !== "" && chatId !== "null" && chatId !== "undefined") {
      try { chat = await Chat.findOne({ _id: chatId, userId: userId }) } catch (e) { chat = null }
    }
    if (!chat) {
      const greetings = ["hi","hii","hello","hey","helo","hai","sup","yo","hiya","howdy"]
      const msgLower = message.trim().toLowerCase()
      let title = greetings.includes(msgLower) ? "New conversation" : message.trim().substring(0, 45)
      if (message.trim().length > 45) title += "..."
      chat = await Chat.create({ userId, title, messages: [] })
    }

    chat.messages.push({ role: "user", content: message || "[File: " + (file?.originalname || "unknown") + "]" })
    await chat.save()

    res.setHeader("x-chat-id", chat._id.toString())
    res.setHeader("Content-Type", "text/plain; charset=utf-8")

    // ── IMAGE GENERATION (Client-side via Pollinations) ────────────────────
    if (message && isImageRequest(message)) {
      const imagePrompt = getImagePrompt(message)
      const seed = Math.floor(Math.random() * 999999)
      // Use multiple URL formats for reliability
      const encodedPrompt = encodeURIComponent(imagePrompt)
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&enhance=true&seed=${seed}&model=flux`

      const responseText = `DATTA_IMAGE_START\n![${imagePrompt}](${imageUrl})\nPROMPT:${imagePrompt}\nDATTA_IMAGE_END`

      res.write(responseText)
      chat.messages.push({ role: "assistant", content: responseText })
      await chat.save()
      res.write("CHATID" + chat._id)
      res.end()
      return
    }

    // ── WEB SEARCH ────────────────────────────────────────────────────────
    let searchContext = ""
    if (message && needsWebSearch(message) && process.env.TAVILY_API_KEY) {
      console.log("🔍 Searching web for:", message)
      const results = await webSearch(message)
      if (results) {
        searchContext = "\n\n[Web Search Results - Today's Data]\n" + results + "\n[End of Search Results]"
      }
    }

    // ── BUILD MESSAGE HISTORY ─────────────────────────────────────────────
    const history = chat.messages.slice(0, -1).slice(-10).map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content
    }))

    const isImageFile = file && file.mimetype?.startsWith("image/")
    let userContent

    if (isImageFile) {
      const base64 = file.buffer.toString("base64")
      userContent = [
        { type: "text", text: (message || "Analyze this image in detail.") + searchContext },
        { type: "image_url", image_url: { url: `data:${file.mimetype};base64,${base64}` } }
      ]
    } else if (file) {
      try {
        const fileContent = file.buffer.toString("utf-8")
        userContent = (message ? message + "\n\n" : "") + `[File: ${file.originalname}]\n\n${fileContent}` + searchContext
      } catch (e) {
        userContent = (message ? message + "\n\n" : "") + `[File: ${file.originalname}]` + searchContext
      }
    } else {
      userContent = message + searchContext
    }

    // ── CHOOSE MODEL ──────────────────────────────────────────────────────
    // Use vision model for images, best model for everything else
    const model = isImageFile
      ? "meta-llama/llama-4-scout-17b-16e-instruct"
      : "llama-3.3-70b-versatile"

    // ── DETERMINE MAX TOKENS ──────────────────────────────────────────────
    const msg = message.toLowerCase()
    const needsLongResponse =
      msg.includes("website") || msg.includes("code") || msg.includes("full") ||
      msg.includes("complete") || msg.includes("build") || msg.includes("create") ||
      msg.includes("write") || msg.includes("essay") || msg.includes("explain") ||
      msg.includes("html") || msg.includes("css") || msg.includes("javascript") ||
      msg.includes("python") || msg.includes("program") || msg.includes("script") ||
      msg.includes("pdf") || msg.includes("document") || msg.includes("report") ||
      msg.includes("story") || msg.includes("article") || msg.includes("tutorial")

    const maxTokens = isImageFile ? 1024 : (needsLongResponse ? 8000 : 1024)

    // ── STREAM RESPONSE ───────────────────────────────────────────────────
    const stream = await groq.chat.completions.create({
      model,
      messages: [
        { role: "system", content: getSystemPrompt(language, !!searchContext) },
        ...history,
        { role: "user", content: userContent }
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
      stream: true
    })

    let full = ""
    for await (const part of stream) {
      const token = part.choices?.[0]?.delta?.content
      if (token) { full += token; res.write(token) }
    }

    chat.messages.push({ role: "assistant", content: full })

    // ── AUTO TITLE GENERATION ─────────────────────────────────────────────
    if (chat.messages.length === 4 || chat.title === "New conversation") {
      try {
        const titleRes = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: `Generate a very short title (max 5 words, no quotes, no punctuation) for a conversation about: "${message}". Just the title.` }],
          max_tokens: 15,
          temperature: 0.5
        })
        const newTitle = titleRes.choices?.[0]?.message?.content?.trim()
        if (newTitle) chat.title = newTitle
      } catch(e) {}
    }

    await chat.save()
    res.write("CHATID" + chat._id)
    res.end()

  } catch (err) {
    console.error("❌ Chat error:", err.message)
    if (!res.headersSent) res.status(500).send("Server error: " + err.message)
    else res.end()
  }
})

// ── CHAT HISTORY ROUTES ───────────────────────────────────────────────────────
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

// ── HEALTH CHECK ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.json({ status: "✅ Datta AI Server Running", version: "3.0" }))
app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`🚀 Datta AI Server running on port ${PORT}`))
