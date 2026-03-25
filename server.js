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
import twilio from "twilio"

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
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("Mongo error:", err))

const otpStore = {}

// Twilio client - supports both Verify Service and direct SMS
let twilioClient = null
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  console.log("Twilio initialized")
} else {
  console.warn("Twilio not configured")
}

// SCHEMAS
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

// WEB SEARCH
async function webSearch(query) {
  try {
    const key = process.env.TAVILY_API_KEY
    if (!key) return null
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key, query, search_depth: "basic", max_results: 5, include_answer: true })
    })
    if (!response.ok) return null
    const data = await response.json()
    if (!data.results?.length) return null
    const answer = data.answer ? "Summary: " + data.answer + "\n\n" : ""
    const sources = data.results.slice(0, 3).map((r, i) =>
      (i+1) + ". " + r.title + "\n" + (r.content||"").substring(0, 200) + "\nSource: " + r.url
    ).join("\n\n")
    return answer + sources
  } catch(e) { return null }
}

function needsWebSearch(message) {
  if (!message) return false
  const msg = message.toLowerCase()
  const triggers = ["latest","recent","today","yesterday","this week","current","now","live","breaking","news","who is","what is the","price of","weather","score","2025","2026","happened","update","trending","stock","crypto","bitcoin","ipl","cricket","match","movie","released","launched","election","president","prime minister","gold","petrol","diesel","result","exam","rate","war","attack","killed"]
  return triggers.some(t => msg.includes(t))
}

function isImageRequest(message) {
  if (!message) return false
  const msg = message.toLowerCase()
  return ["generate image","create image","make image","generate a image","create a image","generate an image","create an image","make an image","generate photo","create photo","generate picture","create picture","generate art","create art","make art","draw","paint","illustrate","sketch","image of","picture of","photo of","show me a image","show me an image","genrate","generat"].some(t => msg.includes(t))
}

function getImagePrompt(message) {
  let prompt = message.trim()
  const removes = ["generate an image of","create an image of","generate a image of","create a image of","generate image of","create image of","generate an image","create an image","generate a image","create a image","generate image","create image","make image","generate photo","create photo","generate picture","create picture","generate art","create art","make art","draw me a","draw me an","draw me","draw a","draw an","draw","paint a","paint an","paint","illustrate","sketch of","sketch a","sketch","image of a","image of an","image of","picture of","photo of","genrate an","genrate a","genrate","generat an","generat a","generat"]
  removes.sort((a, b) => b.length - a.length)
  removes.forEach(r => { prompt = prompt.replace(new RegExp("^" + r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*", "i"), "") })
  return prompt.trim() || message
}

// GOOGLE OAUTH
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "https://datta-ai-server.onrender.com/auth/google/callback"
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ googleId: profile.id })
      if (!user) {
        const firstName = profile.displayName ? profile.displayName.split(" ")[0] : "User"
        user = await User.create({ googleId: profile.id, username: firstName + "_" + profile.id.slice(-4), email: profile.emails?.[0]?.value || "" })
      }
      return done(null, { token: generateToken(user), user: { id: user._id, username: user.username, email: user.email } })
    } catch(err) { return done(err, null) }
  }))
}

// AUTH ROUTES
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
  } catch(err) { res.status(500).json({ error: "Server error" }) }
})

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: "Email and password required" })
    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user || !user.password) return res.status(400).json({ error: "Invalid email or password" })
    if (!await bcrypt.compare(password, user.password)) return res.status(400).json({ error: "Invalid email or password" })
    res.json({ token: generateToken(user), user: { id: user._id, username: user.username, email: user.email } })
  } catch(err) { res.status(500).json({ error: "Server error" }) }
})

// SEND OTP - uses Twilio Verify Service (TWILIO_SERVICE_SID) OR direct SMS (TWILIO_PHONE)
app.post("/auth/send-otp", async (req, res) => {
  try {
    const { phone } = req.body
    if (!phone) return res.status(400).json({ error: "Phone number required" })

    const phoneRegex = /^\+[1-9]\d{7,14}$/
    if (!phoneRegex.test(phone)) return res.status(400).json({ error: "Use format: +91XXXXXXXXXX" })

    if (!twilioClient) return res.status(500).json({ error: "SMS not configured. Please use email login." })

    const serviceSid = process.env.TWILIO_SERVICE_SID
    const fromPhone = process.env.TWILIO_PHONE || process.env.TWILIO_PHONE_NUMBER

    if (serviceSid) {
      // Use Twilio Verify Service - most reliable
      await twilioClient.verify.v2.services(serviceSid).verifications.create({
        to: phone,
        channel: "sms"
      })
      console.log("OTP sent via Verify Service to:", phone)
    } else if (fromPhone) {
      // Use direct SMS with custom OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString()
      otpStore[phone] = { otp, expires: Date.now() + 10 * 60 * 1000 }
      await twilioClient.messages.create({
        body: "Your Datta AI OTP is: " + otp + ". Valid for 10 minutes.",
        from: fromPhone,
        to: phone
      })
      console.log("OTP sent via direct SMS to:", phone)
    } else {
      return res.status(500).json({ error: "Add TWILIO_SERVICE_SID or TWILIO_PHONE to Render environment" })
    }

    res.json({ success: true, message: "OTP sent to " + phone })

  } catch(err) {
    console.error("OTP send error:", err)
    if (err.code === 21608) return res.status(400).json({ error: "Number not verified in Twilio trial. Go to console.twilio.com -> Verified Caller IDs and add your number." })
    if (err.code === 21211) return res.status(400).json({ error: "Invalid phone number. Use +91XXXXXXXXXX" })
    if (err.code === 20003) return res.status(500).json({ error: "Twilio auth failed. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in Render." })
    if (err.code === 60200) return res.status(400).json({ error: "Invalid phone number for Verify service." })
    res.status(500).json({ error: "Failed to send OTP: " + err.message })
  }
})

// VERIFY OTP - supports both Verify Service and custom OTP
app.post("/auth/verify-otp", async (req, res) => {
  try {
    const { phone, otp } = req.body
    if (!phone || !otp) return res.status(400).json({ error: "Phone and OTP required" })

    const serviceSid = process.env.TWILIO_SERVICE_SID

    if (serviceSid && twilioClient) {
      // Verify using Twilio Verify Service
      const result = await twilioClient.verify.v2.services(serviceSid).verificationChecks.create({
        to: phone,
        code: otp.toString().trim()
      })
      if (result.status !== "approved") return res.status(400).json({ error: "Incorrect OTP. Please try again." })
    } else {
      // Verify custom OTP from store
      const stored = otpStore[phone]
      if (!stored) return res.status(400).json({ error: "No OTP sent. Please request a new OTP." })
      if (Date.now() > stored.expires) { delete otpStore[phone]; return res.status(400).json({ error: "OTP expired. Request a new one." }) }
      if (stored.otp !== otp.toString().trim()) return res.status(400).json({ error: "Incorrect OTP." })
      delete otpStore[phone]
    }

    let user = await User.findOne({ phone })
    if (!user) user = await User.create({ username: "user_" + phone.slice(-4), phone })

    res.json({ token: generateToken(user), user: { id: user._id, username: user.username } })

  } catch(err) {
    console.error("OTP verify error:", err)
    if (err.code === 60202) return res.status(400).json({ error: "Max attempts exceeded. Request a new OTP." })
    if (err.code === 20404) return res.status(400).json({ error: "OTP expired. Request a new one." })
    res.status(500).json({ error: err.message })
  }
})

app.get("/auth/google", passport.authenticate("google", { scope: ["profile","email"] }))
app.get("/auth/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: FRONTEND_URL + "/login.html?error=google_failed" }),
  (req, res) => { res.redirect(FRONTEND_URL + "/login.html?token=" + req.user.token + "&user=" + encodeURIComponent(JSON.stringify(req.user.user))) }
)

app.post("/auth/update-username", authMiddleware, async (req, res) => {
  try {
    const { username } = req.body
    if (!username || username.length < 3) return res.status(400).json({ error: "Min 3 characters" })
    const existing = await User.findOne({ username })
    if (existing && existing._id.toString() !== req.user.id) return res.status(400).json({ error: "Username taken" })
    await User.findByIdAndUpdate(req.user.id, { username })
    res.json({ success: true })
  } catch(err) { res.status(500).json({ error: err.message }) }
})

app.post("/auth/change-password", authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body
    const user = await User.findById(req.user.id)
    if (!user || !user.password) return res.status(400).json({ error: "Cannot change password" })
    if (!await bcrypt.compare(currentPassword, user.password)) return res.status(400).json({ error: "Wrong current password" })
    await User.findByIdAndUpdate(req.user.id, { password: await bcrypt.hash(newPassword, 10) })
    res.json({ success: true })
  } catch(err) { res.status(500).json({ error: err.message }) }
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
  } catch(err) { res.status(500).json({ error: err.message }) }
})

// SUBSCRIPTION ROUTES
app.get("/payment/subscription", authMiddleware, async (req, res) => {
  try {
    const sub = await Subscription.findOne({ userId: req.user.id, active: true })
    const plan = sub ? sub.plan : "free"
    res.json({ plan, period: sub?.period || "monthly", endDate: sub?.endDate || null, limits: planLimits[plan] })
  } catch(err) { res.status(500).json({ error: err.message }) }
})

app.post("/payment/activate", authMiddleware, async (req, res) => {
  try {
    const { plan, method, paymentId, period } = req.body
    if (!["free","basic","pro","enterprise"].includes(plan)) return res.status(400).json({ error: "Invalid plan" })
    const endDate = new Date()
    endDate.setMonth(endDate.getMonth() + (period === "yearly" ? 12 : 1))
    await Subscription.findOneAndUpdate({ userId: req.user.id }, { plan, period, paymentId, method, startDate: new Date(), endDate, active: true }, { upsert: true, new: true })
    res.json({ success: true, plan, endDate })
  } catch(err) { res.status(500).json({ error: err.message }) }
})

// RAZORPAY ORDER
app.post("/payment/razorpay-order", authMiddleware, async (req, res) => {
  try {
    const { amount, plan, period } = req.body
    const key_id = process.env.RAZORPAY_KEY_ID
    const key_secret = process.env.RAZORPAY_KEY_SECRET
    if (!key_id || !key_secret) return res.status(400).json({ error: "Razorpay not configured" })
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Basic " + Buffer.from(key_id + ":" + key_secret).toString("base64") },
      body: JSON.stringify({ amount: amount * 100, currency: "INR", receipt: "datta_" + Date.now() })
    })
    const order = await response.json()
    if (!response.ok) return res.status(400).json({ error: order.error?.description || "Order creation failed" })
    res.json({ orderId: order.id, keyId: key_id, amount, plan, period })
  } catch(err) { res.status(500).json({ error: err.message }) }
})

// RAZORPAY VERIFY
app.post("/payment/razorpay-verify", authMiddleware, async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, plan, period } = req.body
    const key_secret = process.env.RAZORPAY_KEY_SECRET
    if (!key_secret) return res.status(400).json({ error: "Razorpay not configured" })
    const crypto = await import("crypto")
    const expectedSig = crypto.default.createHmac("sha256", key_secret).update(razorpay_order_id + "|" + razorpay_payment_id).digest("hex")
    if (expectedSig !== razorpay_signature) return res.status(400).json({ error: "Payment verification failed" })
    const endDate = new Date()
    endDate.setMonth(endDate.getMonth() + (period === "yearly" ? 12 : 1))
    await Subscription.findOneAndUpdate({ userId: req.user.id }, { plan, period, paymentId: razorpay_payment_id, method: "razorpay", startDate: new Date(), endDate, active: true }, { upsert: true, new: true })
    res.json({ success: true, plan, endDate })
  } catch(err) { res.status(500).json({ error: err.message }) }
})

// STRIPE SESSION
app.post("/payment/stripe-session", authMiddleware, async (req, res) => {
  try {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) return res.status(400).json({ error: "Stripe not configured. Please use Razorpay." })
    const { plan, period, amount } = req.body
    const planNames = { basic: "Shakti", pro: "Agni", enterprise: "Brahma" }
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + key, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        "payment_method_types[]": "card",
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][product_data][name]": "Datta AI " + (planNames[plan]||plan) + " Plan",
        "line_items[0][price_data][unit_amount]": String(amount * 100),
        "line_items[0][quantity]": "1",
        "mode": "payment",
        "success_url": FRONTEND_URL + "/pricing.html?success=true&plan=" + plan + "&period=" + period,
        "cancel_url": FRONTEND_URL + "/pricing.html?cancelled=true",
        "metadata[userId]": req.user.id,
        "metadata[plan]": plan,
        "metadata[period]": period
      }).toString()
    })
    const session = await response.json()
    if (!response.ok) return res.status(400).json({ error: session.error?.message || "Stripe session failed" })
    res.json({ url: session.url })
  } catch(err) { res.status(500).json({ error: err.message }) }
})

// CHAT ROUTE
app.post("/chat", upload.single("image"), authMiddleware, async (req, res) => {
  try {
    const message = req.body.message || ""
    const chatId = req.body.chatId || ""
    const language = req.body.language || "English"
    const file = req.file || null
    const userId = req.user.id
    if (!message && !file) return res.status(400).json({ error: "No message or file" })

    const sub = await Subscription.findOne({ userId, active: true }).catch(() => null)
    const userPlan = sub ? sub.plan : "free"

    if (isImageRequest(message)) {
      const imgCheck = checkAndUpdateLimit(userId, userPlan, "images")
      if (!imgCheck.allowed) return res.status(429).json({ error: "IMAGE_LIMIT", plan: userPlan, waitMins: imgCheck.waitMins, limit: imgCheck.limit })
    } else {
      const msgCheck = checkAndUpdateLimit(userId, userPlan, "messages")
      if (!msgCheck.allowed) return res.status(429).json({ error: "MESSAGE_LIMIT", plan: userPlan, waitMins: msgCheck.waitMins, limit: msgCheck.limit })
    }

    let chat = null
    if (chatId && chatId !== "" && chatId !== "null" && chatId !== "undefined") {
      try { chat = await Chat.findOne({ _id: chatId, userId }) } catch(e) { chat = null }
    }
    if (!chat) {
      const greetings = ["hi","hii","hello","hey","helo","hai","sup","yo"]
      const title = greetings.includes(message.trim().toLowerCase()) ? "New conversation" : message.trim().substring(0, 45) + (message.length > 45 ? "..." : "")
      chat = await Chat.create({ userId, title, messages: [] })
    }

    chat.messages.push({ role: "user", content: message || "[File: " + (file?.originalname || "unknown") + "]" })
    await chat.save()
    res.setHeader("x-chat-id", chat._id.toString())
    res.setHeader("Content-Type", "text/plain")

    // IMAGE GENERATION
    if (message && isImageRequest(message)) {
      const imagePrompt = getImagePrompt(message)
      const seed = Math.floor(Math.random() * 999999)
      const models = ["flux-schnell", "flux", "turbo"]
      const imageUrl = "https://image.pollinations.ai/prompt/" + encodeURIComponent(imagePrompt) + "?width=1024&height=1024&nologo=true&model=" + models[seed % 3] + "&seed=" + seed
      const responseText = "DATTA_IMAGE_START\n![" + imagePrompt + "](" + imageUrl + ")\nPROMPT:" + imagePrompt + "\nDATTA_IMAGE_END"
      res.write(responseText)
      chat.messages.push({ role: "assistant", content: responseText })
      await chat.save()
      res.write("CHATID" + chat._id)
      res.end()
      return
    }

    // WEB SEARCH
    let searchContext = ""
    if (message && needsWebSearch(message) && process.env.TAVILY_API_KEY) {
      const results = await webSearch(message)
      if (results) searchContext = "\n\n[Web Search Results]\n" + results + "\n[End of Search Results]"
    }

    const history = chat.messages.slice(0, -1).slice(-10).map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }))
    const isImageFile = file && file.mimetype?.startsWith("image/")
    let userContent
    if (isImageFile) {
      userContent = [{ type: "text", text: (message || "Analyze this image.") + searchContext }, { type: "image_url", image_url: { url: "data:" + file.mimetype + ";base64," + file.buffer.toString("base64") } }]
    } else if (file) {
      try { userContent = (message ? message + "\n\n" : "") + "[File: " + file.originalname + "]\n\n" + file.buffer.toString("utf-8") + searchContext }
      catch(e) { userContent = (message ? message + "\n\n" : "") + "[File: " + file.originalname + "]" + searchContext }
    } else {
      userContent = message + searchContext
    }

    const model = isImageFile ? "meta-llama/llama-4-scout-17b-16e-instruct" : "llama-3.3-70b-versatile"
    const langNote = language && language !== "English" ? " Always respond in " + language + "." : ""
    const searchNote = searchContext ? " Use web search results for accurate answers and cite sources." : ""

    const stream = await groq.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "You are Datta AI, a helpful and accurate assistant. Give complete, detailed answers. Never say you cannot do something. Format code properly in code blocks. Never mention the user's name in answers." + langNote + searchNote },
        ...history,
        { role: "user", content: userContent }
      ],
      max_tokens: 4096,
      temperature: 0.7,
      stream: true
    })

    let full = ""
    for await (const part of stream) {
      const token = part.choices?.[0]?.delta?.content
      if (token) { full += token; res.write(token) }
    }

    chat.messages.push({ role: "assistant", content: full })
    if (chat.messages.length === 4 || chat.title === "New conversation") {
      try {
        const t = await groq.chat.completions.create({ model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: "Generate a very short title (max 5 words, no quotes) for: \"" + message + "\". Just the title." }], max_tokens: 15 })
        const nt = t.choices?.[0]?.message?.content?.trim()
        if (nt && !nt.startsWith("[")) chat.title = nt
      } catch(e) {}
    }
    await chat.save()
    res.write("CHATID" + chat._id)
    res.end()
  } catch(err) {
    console.error("Chat error:", err.message)
    if (!res.headersSent) res.status(500).send("Server error: " + err.message)
    else res.end()
  }
})

// CHAT HISTORY
app.get("/chats", authMiddleware, async (req, res) => { try { res.json(await Chat.find({ userId: req.user.id }).sort({ createdAt: -1 }).select("title createdAt")) } catch(err) { res.status(500).json({ error: err.message }) } })
app.get("/chat/:id", authMiddleware, async (req, res) => { try { const c = await Chat.findOne({ _id: req.params.id, userId: req.user.id }); res.json(c ? c.messages : []) } catch(err) { res.status(500).json({ error: err.message }) } })
app.delete("/chat/:id", authMiddleware, async (req, res) => { try { await Chat.findOneAndDelete({ _id: req.params.id, userId: req.user.id }); res.json({ success: true }) } catch(err) { res.status(500).json({ error: err.message }) } })
app.delete("/chats/all", authMiddleware, async (req, res) => { try { await Chat.deleteMany({ userId: req.user.id }); res.json({ success: true }) } catch(err) { res.status(500).json({ error: err.message }) } })
app.post("/chat/:id/rename", authMiddleware, async (req, res) => { try { await Chat.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, { title: req.body.title }); res.json({ success: true }) } catch(err) { res.status(500).json({ error: err.message }) } })

app.get("/", (req, res) => res.json({ status: "Datta AI Server running", version: "3.0" }))
app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log("Datta AI Server running on port " + PORT))
