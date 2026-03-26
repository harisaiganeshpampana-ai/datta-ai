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

// SEND OTP - Fast2SMS (free, all Indian numbers) with Twilio fallback
app.post("/auth/send-otp", async (req, res) => {
  try {
    const { phone } = req.body
    if (!phone) return res.status(400).json({ error: "Phone number required" })

    // Accept both +91XXXXXXXXXX and 10-digit formats
    let cleanPhone = phone.replace(/\s+/g, "").trim()
    let phoneFor2SMS = cleanPhone.replace("+91", "").replace(/^\+/, "")
    if (phoneFor2SMS.length < 10) return res.status(400).json({ error: "Enter valid 10-digit mobile number" })
    phoneFor2SMS = phoneFor2SMS.slice(-10) // take last 10 digits

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    const normalizedPhone = "+91" + phoneFor2SMS
    otpStore[normalizedPhone] = { otp, expires: Date.now() + 10 * 60 * 1000 }
    console.log("OTP for", normalizedPhone, ":", otp)

    const fast2smsKey = process.env.FAST2SMS_API_KEY

    // Try Fast2SMS first
    if (fast2smsKey) {
      try {
        const response = await fetch("https://www.fast2sms.com/dev/bulkV2", {
          method: "POST",
          headers: { "authorization": fast2smsKey, "Content-Type": "application/json" },
          body: JSON.stringify({ route: "q", message: "Your Datta AI OTP is " + otp + ". Valid 10 minutes.", language: "english", flash: 0, numbers: phoneFor2SMS })
        })
        const data = await response.json()
        console.log("Fast2SMS:", JSON.stringify(data))
        if (data.return === true) return res.json({ success: true, message: "OTP sent successfully" })
        console.error("Fast2SMS failed:", data.message)
      } catch(e) { console.error("Fast2SMS error:", e.message) }
    }

    // Try 2Factor.in - force SMS only
    const twoFactorKey = process.env.TWOFACTOR_API_KEY
    if (twoFactorKey) {
      try {
        // Force SMS channel explicitly
        const url = "https://2factor.in/API/V1/" + twoFactorKey + "/SMS/+91" + phoneFor2SMS + "/" + otp
        console.log("2Factor URL:", url)
        const response = await fetch(url)
        const data = await response.json()
        console.log("2Factor response:", JSON.stringify(data))
        if (data.Status === "Success") return res.json({ success: true, message: "OTP sent via SMS" })
        console.error("2Factor failed:", data.Details)
      } catch(e) { console.error("2Factor error:", e.message) }
    }

    // Try MSG91
    const msg91Key = process.env.MSG91_API_KEY
    const msg91Template = process.env.MSG91_TEMPLATE_ID
    if (msg91Key && msg91Template) {
      try {
        const response = await fetch("https://control.msg91.com/api/v5/otp", {
          method: "POST",
          headers: { "Content-Type": "application/json", "authkey": msg91Key },
          body: JSON.stringify({ template_id: msg91Template, mobile: "91" + phoneFor2SMS, otp: otp })
        })
        const data = await response.json()
        console.log("MSG91:", JSON.stringify(data))
        if (data.type === "success") return res.json({ success: true, message: "OTP sent successfully" })
        console.error("MSG91 failed:", data.message)
      } catch(e) { console.error("MSG91 error:", e.message) }
    }

    // All SMS services failed
    console.log("=== ALL SMS FAILED - OTP for", normalizedPhone, ":", otp, "===")
    res.status(500).json({ error: "Could not send OTP. Please use Email or Google login." })

  } catch(err) {
    console.error("OTP send error:", err.message)
    res.status(500).json({ error: "Could not send OTP. Please use Email or Google login." })
  }
})

// VERIFY OTP
app.post("/auth/verify-otp", async (req, res) => {
  try {
    const { phone, otp } = req.body
    if (!phone || !otp) return res.status(400).json({ error: "Phone and OTP required" })

    let cleanPhone = phone.replace(/\s+/g, "").trim()
    let phoneFor2SMS = cleanPhone.replace("+91", "").replace(/^\+/, "").slice(-10)
    const normalizedPhone = "+91" + phoneFor2SMS

    // Verify from our own OTP store
    const stored = otpStore[normalizedPhone]
    if (!stored) return res.status(400).json({ error: "No OTP sent. Please request a new OTP." })
    if (Date.now() > stored.expires) {
      delete otpStore[normalizedPhone]
      return res.status(400).json({ error: "OTP expired. Request a new one." })
    }
    if (stored.otp !== otp.toString().trim()) {
      return res.status(400).json({ error: "Incorrect OTP. Please try again." })
    }
    delete otpStore[normalizedPhone]

    let user = await User.findOne({ phone: normalizedPhone })
    if (!user) user = await User.create({ username: "user_" + phoneFor2SMS.slice(-4), phone: normalizedPhone })
    res.json({ token: generateToken(user), user: { id: user._id, username: user.username } })

  } catch(err) {
    console.error("OTP verify error:", err.message)
    if (err.code === 60202) return res.status(400).json({ error: "Too many attempts. Request a new OTP." })
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
      console.log("Generating image:", imagePrompt)
      let imageUrl = null

      // IMAGE GENERATION - Try multiple free services
      const seed = Math.floor(Math.random() * 999999)

      // 1. Try Stable Horde (100% free, no key needed)
      try {
        console.log("Trying Stable Horde...")
        const hordeRes = await fetch("https://stablehorde.net/api/v2/generate/async", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": process.env.STABLE_HORDE_KEY || "0000000000"
          },
          body: JSON.stringify({
            prompt: imagePrompt,
            params: { width: 512, height: 512, steps: 20, n: 1, sampler_name: "k_euler" },
            models: ["stable_diffusion"],
            r2: true
          })
        })
        if (hordeRes.ok) {
          const hordeData = await hordeRes.json()
          const jobId = hordeData.id
          console.log("Horde job ID:", jobId)

          // Poll for result (max 60 seconds)
          for (let i = 0; i < 12; i++) {
            await new Promise(r => setTimeout(r, 5000))
            const statusRes = await fetch("https://stablehorde.net/api/v2/generate/check/" + jobId)
            const statusData = await statusRes.json()
            if (statusData.done) {
              const resultRes = await fetch("https://stablehorde.net/api/v2/generate/status/" + jobId)
              const resultData = await resultRes.json()
              if (resultData.generations && resultData.generations[0]) {
                const imgData = resultData.generations[0]
                if (imgData.img && imgData.img.startsWith("http")) {
                  // Download and convert to base64
                  const imgRes = await fetch(imgData.img)
                  if (imgRes.ok) {
                    const buf = await imgRes.arrayBuffer()
                    imageUrl = "data:image/webp;base64," + Buffer.from(buf).toString("base64")
                    console.log("Stable Horde success!")
                  }
                } else if (imgData.img) {
                  imageUrl = "data:image/webp;base64," + imgData.img
                  console.log("Stable Horde base64 success!")
                }
                break
              }
            }
            console.log("Horde waiting... queue:", statusData.queue_position)
          }
        }
      } catch(e) {
        console.log("Stable Horde error:", e.message)
      }

      // 2. Try Dezgo (free tier)
      if (!imageUrl && process.env.DEZGO_API_KEY) {
        try {
          console.log("Trying Dezgo...")
          const dezgoRes = await fetch("https://api.dezgo.com/text2image", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Dezgo-Key": process.env.DEZGO_API_KEY },
            body: JSON.stringify({ prompt: imagePrompt, model: "dreamshaper_8", width: 512, height: 512, steps: 25 })
          })
          if (dezgoRes.ok) {
            const buf = await dezgoRes.arrayBuffer()
            imageUrl = "data:image/jpeg;base64," + Buffer.from(buf).toString("base64")
            console.log("Dezgo success!")
          }
        } catch(e) { console.log("Dezgo error:", e.message) }
      }

      // 3. Fetch Pollinations server-side as base64 (avoids CORS)
      if (!imageUrl) {
        try {
          console.log("Trying Pollinations server-side fetch...")
          const polUrl = "https://image.pollinations.ai/prompt/" + encodeURIComponent(imagePrompt) + "?width=1024&height=1024&nologo=true&model=flux&seed=" + seed
          const polRes = await fetch(polUrl, { headers: { "User-Agent": "DattaAI/1.0" } })
          if (polRes.ok) {
            const buf = await polRes.arrayBuffer()
            if (buf.byteLength > 10000) {
              imageUrl = "data:image/jpeg;base64," + Buffer.from(buf).toString("base64")
              console.log("Pollinations base64 success! Size:", buf.byteLength)
            } else {
              console.log("Pollinations returned too small:", buf.byteLength)
              imageUrl = polUrl
            }
          } else {
            imageUrl = "https://image.pollinations.ai/prompt/" + encodeURIComponent(imagePrompt) + "?width=1024&height=1024&nologo=true&model=turbo&seed=" + seed
          }
        } catch(e) {
          console.log("Pollinations error:", e.message)
          imageUrl = "https://image.pollinations.ai/prompt/" + encodeURIComponent(imagePrompt) + "?width=512&height=512&nologo=true&seed=" + seed
        }
      }

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

    // Detect if code/build task needs max tokens
    const msgLower = message.toLowerCase()
    const isCodeTask = ["build","create","write","make","code","website","app","script","program","html","python","javascript","fix","debug","error","update","improve","full","complete","function","class","api"].some(k => msgLower.includes(k))
    const maxTok = isImageFile ? 1024 : (isCodeTask ? 32768 : 8192)

    const systemPrompt = `You are Datta AI - a powerful AI Agent. Today is ${new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.

CRITICAL RULES - NEVER BREAK THESE:
1. ALWAYS give COMPLETE, FULL, 100% WORKING code - never say "rest of code here" or truncate
2. For websites/apps: give the ENTIRE code in one response, copy-paste ready
3. When fixing bugs: show the COMPLETE fixed file, not just the changed lines
4. When updating code: return the FULL updated code always
5. NEVER say "I cannot", "I am unable", "as an AI" - just solve it
6. NEVER give partial solutions - always complete
7. Always use proper markdown code blocks with language: \`\`\`html, \`\`\`python etc
8. For errors/bugs: explain what was wrong, then give the COMPLETE fixed code
9. Think step by step for complex problems
10. You are an expert in: HTML, CSS, JS, React, Python, Node.js, SQL, Java, C++, and ALL languages
11. For creative tasks: be original and impressive
12. If someone pastes code with a bug - fix ALL bugs and return complete working code
13. Your responses should be production-ready, professional quality${langNote}${searchNote}`

    const stream = await groq.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: userContent }
      ],
      max_tokens: maxTok,
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
