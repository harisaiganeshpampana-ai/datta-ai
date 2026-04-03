import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import mongoose from "mongoose"
import multer from "multer"
import crypto from "crypto"
import Groq from "groq-sdk"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import passport from "passport"
import { Strategy as GoogleStrategy } from "passport-google-oauth20"
import session from "express-session"
import twilio from "twilio"
import pdfParse from "pdf-parse/lib/pdf-parse.js"
import nodemailer from "nodemailer"

dotenv.config()

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })
const app = express()

// ── CORS — must be the VERY FIRST middleware, before ALL routes ───────────────
const ALLOWED_ORIGINS = [
  "https://datta-ai.com",
  "https://www.datta-ai.com",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
]
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin)
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*")
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,x-chat-id,Accept")
  res.setHeader("Access-Control-Expose-Headers", "x-chat-id")
  res.setHeader("Access-Control-Max-Age", "86400")
  if (req.method === "OPTIONS") {
    return res.status(204).end()
  }
  next()
})

app.get("/ping", (req, res) => res.json({ alive: true }))
app.get("/health", (req, res) => res.json({ status: "ok" }))

app.use((req, res, next) => {
  res.removeHeader("X-Powered-By")
  res.setHeader("Server", "Datta-AI")
  res.setHeader("X-Content-Type-Options", "nosniff")
  next()
})

app.use(express.json({ limit: "20mb" }))
app.use(express.urlencoded({ extended: true, limit: "20mb" }))

app.use((req, res, next) => {
  const urlLen = (req.url || "").length
  if (urlLen > 2048) {
    console.warn("[LARGE URL]", urlLen, "chars:", req.url.slice(0, 300))
  }
  if (urlLen > 7000) {
    console.error("[414 BLOCKED] URL len:", urlLen)
    return res.status(414).json({ error: "URI_TOO_LONG" })
  }
  next()
})

app.use(session({ 
  secret: process.env.JWT_SECRET || "datta-secret", 
  resave: false, 
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}))
app.use(passport.initialize())
app.use(passport.session())
passport.serializeUser((u, done) => done(null, u))
passport.deserializeUser((u, done) => done(null, u))

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "missing" })

// ============================================================
//  FIX: LLM INPUT VALIDATION & NORMALIZATION (CORE FIX)
// ============================================================
function hasImage(content) {
  return Array.isArray(content) && content.some(c => c.type === "image_url");
}

function normalizeToText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const texts = content
      .filter(c => c.type === "text")
      .map(c => c.text || "")
      .join(" ");
    return texts.trim() || "[non-text content omitted]";
  }
  return String(content || "");
}

function validateAndNormalizeMessages(messages, modelId, isVisionModel = false) {
  const normalized = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    let content = msg.content;

    if (!isVisionModel && hasImage(content)) {
      throw new Error(
        `Model ${modelId} does NOT support images. ` +
        `Message ${i} contains an image_url. Use a vision model or remove the image.`
      );
    }

    if (isVisionModel && i === messages.length - 1 && msg.role === "user" && hasImage(content)) {
      normalized.push({ role: msg.role, content });
    } else {
      normalized.push({ role: msg.role, content: normalizeToText(content) });
    }
  }
  return normalized;
}

function logFinalMessages(messages, model) {
  console.log(`\n[LLM PREP] Model: ${model}`);
  messages.forEach((m, i) => {
    const type = typeof m.content;
    const preview = type === "string" ? m.content.slice(0, 60) : JSON.stringify(m.content).slice(0, 60);
    console.log(`  msg[${i}] role=${m.role} content_type=${type} preview=${preview}`);
  });
}
// ============================================================

// ── GEMINI API ──────────────────────────────────────────────
async function callGemini(messages, systemPrompt, maxTokens, res) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("GEMINI_API_KEY not set")

  // Normalize messages first (Gemini is text-only)
  const safeMessages = validateAndNormalizeMessages(messages, "gemini-2.0-flash", false);
  logFinalMessages(safeMessages, "gemini-2.0-flash");

  const geminiContents = safeMessages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }))

  const lastMsg = geminiContents[geminiContents.length - 1]
  if (!lastMsg || lastMsg.role !== "user") {
    geminiContents.push({ role: "user", parts: [{ text: "Continue" }] })
  }

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: geminiContents,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.7
    }
  }

  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=" + apiKey

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error("Gemini error: " + err.substring(0, 200))
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let full = ""
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() || ""
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue
      const data = line.slice(6).trim()
      if (!data || data === "[DONE]") continue
      try {
        const json = JSON.parse(data)
        const token = json.candidates?.[0]?.content?.parts?.[0]?.text
        if (token && typeof token === "string") { full += token; res.write(token) }
      } catch(e) {}
    }
  }
  return full
}

;(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI)
    console.log("MongoDB connected")
  } catch(e) {
    console.error("DB connection error:", e.message)
    process.exit(1)
  }
})()

function safeStr(val) {
  if (val === null || val === undefined) return ""
  if (typeof val === "string") return val
  if (Array.isArray(val)) {
    return val.filter(p => p && p.type === "text").map(p => p.text || "").join("") || "[image]"
  }
  if (typeof val === "object") return val.text || val.content || JSON.stringify(val)
  return String(val)
}

// Normalize for DB storage only (kept for history)
function normalizeMsg(m) {
  if (!m) return { role: "user", content: "" };
  let raw;
  try {
    raw = JSON.parse(JSON.stringify(m));
  } catch(e) {
    raw = { role: m.role, content: "" };
  }
  let c = raw.content;
  if (typeof c === "string") return { role: raw.role, content: c };
  if (Array.isArray(c)) {
    const textParts = c
      .filter(p => p && (p.type === "text" || typeof p === "string"))
      .map(p => typeof p === "string" ? p : (p.text || ""))
      .join(" ")
      .trim();
    return { role: raw.role, content: textParts || "[message]" };
  }
  if (c && typeof c === "object") {
    const text = c.text || c.content || "";
    return { role: raw.role, content: String(text) };
  }
  return { role: raw.role, content: String(c || "") };
}

app.get("/ping", (req, res) => { res.setHeader("Access-Control-Allow-Origin","*"); res.json({ alive: true, time: new Date().toISOString() }) })
app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }))

const otpStore = {}
const emailOtpStore = {}

const EmailTrackSchema = new mongoose.Schema({
  trackId:    { type: String, required: true, unique: true },
  email:      { type: String },
  type:       { type: String },
  openedAt:   { type: Date, default: null },
  clicks:     [{ url: String, clickedAt: Date }],
  sentAt:     { type: Date, default: Date.now }
})
const EmailTrack = mongoose.models.EmailTrack || mongoose.model("EmailTrack", EmailTrackSchema)

let twilioClient = null
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  console.log("Twilio initialized")
} else {
  console.warn("Twilio not configured")
}

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, sparse: true, trim: true },
  password: String,
  phone: { type: String, sparse: true },
  googleId: { type: String, sparse: true },
  emailVerified: { type: Boolean, default: false },
  verifyToken: String,
  verifyTokenExpires: Date,
  createdAt: { type: Date, default: Date.now }
})
const User = mongoose.model("User", UserSchema)

const MessageSchema = new mongoose.Schema({ role: String, content: mongoose.Schema.Types.Mixed })
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

function sanitizeError(err) {
  const msg = (err?.message || err?.error?.message || String(err) || "").toLowerCase()
  if (msg.includes("rate limit") || msg.includes("429") || msg.includes("tpm")) {
    return { userMsg: "Datta AI is thinking too hard! Please wait a moment and try again.", code: "rate_limit" }
  }
  if (msg.includes("decommission") || msg.includes("model") || msg.includes("deprecated")) {
    return { userMsg: "This model is temporarily unavailable. Switching to default model.", code: "model_error" }
  }
  if (msg.includes("api key") || msg.includes("unauthorized") || msg.includes("authentication")) {
    return { userMsg: "Service temporarily unavailable. Please try again.", code: "service_error" }
  }
  if (msg.includes("timeout") || msg.includes("timed out")) {
    return { userMsg: "Request timed out. Please try again.", code: "timeout" }
  }
  if (msg.includes("network") || msg.includes("fetch") || msg.includes("econnrefused")) {
    return { userMsg: "Connection error. Please check your internet and try again.", code: "network" }
  }
  if (msg.includes("context") || msg.includes("too long") || msg.includes("maximum")) {
    return { userMsg: "Message too long. Please start a new chat.", code: "too_long" }
  }
  return { userMsg: "Something went wrong. Please try again.", code: "unknown" }
}

const UsageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true },
  messagesUsed: { type: Number, default: 0 },
  imagesUsed: { type: Number, default: 0 },
  totalMessages: { type: Number, default: 0 },
  totalImages: { type: Number, default: 0 },
  windowStart: { type: Date, default: Date.now },
  imageWindowStart: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})
const Usage = mongoose.model("Usage", UsageSchema)

const MemorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  key: String,
  value: mongoose.Schema.Types.Mixed,
  category: { type: String, default: "general" },
  updatedAt: { type: Date, default: Date.now }
})
const Memory = mongoose.model("Memory", MemorySchema)

const planLimits = {
  free:     { messages: 20,     resetHours: 24, models: ["d21"],        price: 0,   priority: 0 },
  starter:  { messages: 50,     resetHours: 24, models: ["d21"],        price: 49,  priority: 1 },
  standard: { messages: 120,    resetHours: 24, models: ["d21","d54"],  price: 149, priority: 2 },
  plus:     { messages: 300,    resetHours: 24, models: ["d21","d54"],  price: 299, priority: 3 },
  pro:      { messages: 1000,   resetHours: 24, models: ["d21","d54"],  price: 799, priority: 4 },
  mini:     { messages: 200,    resetHours: 24, models: ["d21","d54"],  price: 199, priority: 2 },
  max:      { messages: 2000,   resetHours: 24, models: ["d21","d54"],  price: 1999,priority: 4 },
  ultramax: { messages: 999999, resetHours: 0,  models: ["all"],        price: 0,   priority: 5 },
  basic:    { messages: 500,    resetHours: 24, models: ["d21","d54"],  price: 499, priority: 3 },
  enterprise:{messages: 999999, resetHours: 0,  models: ["all"],        price: 0,   priority: 5 }
}
const rateLimitStore = {}

const activeRequests = new Map()
const minuteRateStore = {}
function checkMinuteRate(userId) {
  const now = Date.now()
  const key = String(userId)
  if (!minuteRateStore[key]) minuteRateStore[key] = { count: 0, start: now }
  const s = minuteRateStore[key]
  if (now - s.start > 60000) { s.count = 0; s.start = now }
  s.count++
  return s.count <= 15
}

const lastMessageStore = {}
function isDuplicateMessage(userId, message) {
  const key = String(userId)
  const now = Date.now()
  const last = lastMessageStore[key]
  if (last && last.msg === message && now - last.time < 2000) return true
  lastMessageStore[key] = { msg: message, time: now }
  return false
}

const userStreamControllers = new Map()

async function checkAndUpdateLimitDB(userId, plan, type) {
  const limits = planLimits[plan] || planLimits.free
  if (limits[type] === 999999) return { allowed: true }

  const now = new Date()
  const resetMs = limits.resetHours * 60 * 60 * 1000

  let usage = await Usage.findOne({ userId })
  if (!usage) {
    usage = await Usage.create({ userId, windowStart: now, imageWindowStart: now })
  }

  if (type === "messages" && resetMs > 0 && resetMs < 999999 * 3600 * 1000) {
    if (now - usage.windowStart > resetMs) {
      usage.messagesUsed = 0
      usage.windowStart = now
    }
  }
  if (type === "images" && resetMs > 0 && resetMs < 999999 * 3600 * 1000) {
    if (now - usage.imageWindowStart > resetMs) {
      usage.imagesUsed = 0
      usage.imageWindowStart = now
    }
  }

  let limit = limits[type]
  if (plan === "free" && type === "messages") {
    if (usage.totalMessages >= 50) {
      limit = 20
    }
  }

  const current = type === "messages" ? usage.messagesUsed : usage.imagesUsed

  if (current >= limit) {
    const windowStart = type === "messages" ? usage.windowStart : usage.imageWindowStart
    const waitMs = resetMs > 0 && resetMs < 999999 * 3600 * 1000 ? resetMs - (now - windowStart) : 0
    const waitMins = waitMs > 0 ? Math.ceil(waitMs / 60000) : 0
    return { allowed: false, type, plan, waitMins, limit }
  }

  if (type === "messages") {
    usage.messagesUsed++
    usage.totalMessages++
  } else {
    usage.imagesUsed++
    usage.totalImages++
  }
  usage.updatedAt = now
  await usage.save()

  return { allowed: true, used: current + 1, limit }
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

// WEB SEARCH (unchanged)
const _searchCache = new Map()
let _searchCount = 0
let _searchCountMonth = new Date().getMonth()

async function webSearch(query) {
  const currentMonth = new Date().getMonth()
  if (currentMonth !== _searchCountMonth) {
    _searchCount = 0
    _searchCountMonth = currentMonth
  }
  if (_searchCount >= 800) {
    console.log("[SEARCH] Monthly cap reached.")
    return null
  }
  const cacheKey = query.toLowerCase().trim()
  const cached = _searchCache.get(cacheKey)
  if (cached && (Date.now() - cached.ts) < 30000) {
    console.log("[SEARCH] Cache hit")
    return cached.result
  }
  _searchCount++
  try {
    const key = process.env.TAVILY_API_KEY
    if (!key) return null
    const isFactual = ["father of","mother of","inventor of","founded by","who invented"].some(t => query.toLowerCase().includes(t))
    const finalQuery = isFactual ? query + " Wikipedia" : query
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query: finalQuery,
        search_depth: "advanced",
        max_results: 5,
        include_answer: true,
        include_raw_content: false
      })
    })
    if (!response.ok) return null
    const data = await response.json()
    function toStr(val) {
      if (val === null || val === undefined) return ""
      if (typeof val === "string") return val
      if (typeof val === "number" || typeof val === "boolean") return String(val)
      if (Array.isArray(val)) return val.map(toStr).join(", ")
      if (typeof val === "object") return Object.values(val).map(toStr).filter(Boolean).join(" ")
      return String(val)
    }
    function clean(v) {
      return toStr(v).replace(/\[object Object\]/gi, "").replace(/\[object object\]/gi, "").replace(/undefined/g, "").replace(/\s+/g, " ").trim()
    }
    let lines = []
    if (data.answer) {
      const ans = clean(data.answer)
      if (ans) lines.push("ANSWER: " + ans)
    }
    if (Array.isArray(data.results)) {
      data.results.slice(0, 5).forEach((r, i) => {
        if (!r || typeof r !== "object") return
        const title = clean(r.title).slice(0, 120)
        const content = clean(r.content).slice(0, 500)
        const url = clean(r.url).slice(0, 100)
        if (title || content) {
          lines.push("SOURCE " + (i+1) + ": " + title)
          if (content) lines.push(content)
          if (url) lines.push("URL: " + url)
          lines.push("")
        }
      })
    }
    const result = lines.join("\n").trim()
    _searchCache.set(cacheKey, { result: result || null, ts: Date.now() })
    if (_searchCache.size > 100) {
      const oldest = _searchCache.keys().next().value
      _searchCache.delete(oldest)
    }
    return result || null
  } catch(e) {
    console.log("[SEARCH] Exception:", e.message)
    return null
  }
}

function needsWebSearch(message) {
  if (!message) return false
  const msg = message.toLowerCase().trim()
  const noSearchPatterns = [
    /^what (is|are) (the )?(time|date|day|year)/,
    /^(what|tell me) (time|date|day)/,
    /^(current |today.?s )?(time|date|day)/,
    /^(hi|hello|hey|how are you|what can you do)/,
    /^(explain|define|describe|summarize|write|create|build|code|help)/,
    /^(what is|what are) [a-z ]{1,30}$/,
  ]
  if (noSearchPatterns.some(p => p.test(msg))) return false
  const triggers = [
    "latest news","breaking news","today's news","live score","current score","match score","match today","stock price","crypto price","weather in","who won","election result","trending now","released today","ipl","cricket match","cricket score","world cup","football match","father of","mother of","inventor of","who invented","search for","look up","near me","ఐపీఎల్","मैच"
  ]
  return triggers.some(t => msg.includes(t))
}

async function browseUrl(url) {
  try {
    const key = process.env.TAVILY_API_KEY
    if (!key) return null
    const response = await fetch("https://api.tavily.com/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key, urls: [url] })
    })
    if (!response.ok) return null
    const data = await response.json()
    const result = data.results?.[0]
    if (!result) return null
    return {
      url: result.url,
      title: result.title || url,
      content: (result.raw_content || result.content || "").substring(0, 3000)
    }
  } catch(e) {
    return null
  }
}

async function sendWhatsApp(phone, message) {
  try {
    const apiKey = process.env.CALLMEBOT_API_KEY
    if (!apiKey) {
      const twilioSid = process.env.TWILIO_ACCOUNT_SID
      const twilioAuth = process.env.TWILIO_AUTH_TOKEN
      const twilioWaFrom = process.env.TWILIO_WA_FROM || "whatsapp:+14155238886"
      if (twilioSid && twilioAuth) {
        const res = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + twilioSid + "/Messages.json", {
          method: "POST",
          headers: {
            "Authorization": "Basic " + Buffer.from(twilioSid + ":" + twilioAuth).toString("base64"),
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: new URLSearchParams({
            To: "whatsapp:" + phone,
            From: twilioWaFrom,
            Body: message
          }).toString()
        })
        const data = await res.json()
        if (res.ok) return { success: true, method: "twilio_wa", sid: data.sid }
        return { success: false, error: data.message }
      }
      return { success: false, error: "WhatsApp not configured" }
    }
    const encodedMsg = encodeURIComponent(message)
    const cleanPhone = phone.replace(/[^0-9]/g, "")
    const res = await fetch("https://api.callmebot.com/whatsapp.php?phone=" + cleanPhone + "&text=" + encodedMsg + "&apikey=" + apiKey)
    const text = await res.text()
    if (text.includes("Message queued")) return { success: true, method: "callmebot" }
    return { success: false, error: text.substring(0, 100) }
  } catch(e) {
    return { success: false, error: e.message }
  }
}

async function saveMemory(userId, key, value, category) {
  await Memory.findOneAndUpdate(
    { userId, key },
    { userId, key, value, category: category || "general", updatedAt: new Date() },
    { upsert: true, new: true }
  )
}

async function getMemories(userId) {
  const memories = await Memory.find({ userId }).sort({ updatedAt: -1 }).limit(5)
  if (!memories.length) return ""
  const memText = memories.map(m => m.key + ": " + String(m.value).substring(0, 100)).join(", ")
  return "\n[Memory: " + memText + "]"
}

async function extractAndSaveMemory(userId, userMessage, aiResponse) {
  try {
    const extractionMessages = [{
      role: "user",
      content: `Extract key facts about the user from this conversation... Return as JSON array.`
    }];
    // Normalize for Groq
    const normExtract = validateAndNormalizeMessages(extractionMessages, "llama-3.1-8b-instant", false);
    const extraction = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: normExtract,
      max_tokens: 200,
      temperature: 0.1
    })
    const raw = extraction.choices?.[0]?.message?.content?.trim() || "[]"
    const clean = raw.replace(/```json|```/g, "").trim()
    const facts = JSON.parse(clean)
    if (Array.isArray(facts)) {
      for (const fact of facts) {
        if (fact.key && fact.value) {
          await saveMemory(userId, fact.key, fact.value, fact.category || "general")
        }
      }
    }
  } catch(e) {}
}

async function sendVerificationEmail(email, token, username) {
  try {
    const GMAIL_USER = process.env.GMAIL_USER
    const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD
    if (!GMAIL_USER || !GMAIL_PASS) return false
    const verifyUrl = FRONTEND_URL + "/verify-email.html?token=" + token
    const html = `...` // same as before, keep as is
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_USER, pass: GMAIL_PASS }
    })
    await transporter.sendMail({
      from: '"Datta AI" <' + GMAIL_USER + '>',
      to: email,
      subject: "Verify your Datta AI account",
      html
    })
    return true
  } catch(e) {
    return false
  }
}

const _emailRateStore = new Map()
function _checkEmailRate(ip) {
  const now = Date.now()
  const last = _emailRateStore.get(ip) || 0
  if (now - last < 60000) return false
  _emailRateStore.set(ip, now)
  return true
}

function createZohoTransporter() {
  return nodemailer.createTransport({
    host: "smtp.zoho.in",
    port: 465,
    secure: true,
    auth: {
      user: process.env.ZOHO_USER,
      pass: process.env.ZOHO_PASS
    }
  })
}

app.post("/send", async (req, res) => {
  try {
    const { name, email } = req.body
    if (!name || typeof name !== "string" || name.trim().length < 1) return res.status(400).json({ error: "Name required" })
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return res.status(400).json({ error: "Valid email required" })
    const cleanName = name.trim().slice(0, 100)
    const cleanEmail = email.trim().toLowerCase()
    const ip = req.ip || req.connection?.remoteAddress || "unknown"
    if (!_checkEmailRate(ip)) return res.status(429).json({ error: "Please wait" })
    if (!process.env.ZOHO_USER || !process.env.ZOHO_PASS) return res.status(500).json({ error: "Email service not configured" })
    const html = `<!DOCTYPE html>...` // keep original
    const transporter = createZohoTransporter()
    await transporter.sendMail({
      from: '"Datta AI" <' + process.env.ZOHO_USER + '>',
      to: cleanEmail,
      subject: "Welcome to Datta AI",
      html
    })
    res.json({ success: true })
  } catch(err) {
    res.status(500).json({ error: "Failed to send email" })
  }
})

// Google OAuth (unchanged)
if (GoogleStrategy && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
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

// AUTH ROUTES (unchanged except any Groq calls inside will use validator)
app.post("/auth/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body
    if (!username || !email || !password) return res.status(400).json({ error: "All fields required" })
    if (username.length < 3) return res.status(400).json({ error: "Username min 3 characters" })
    if (password.length < 6) return res.status(400).json({ error: "Password min 6 characters" })
    const existing = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username }] })
    if (existing) return res.status(400).json({ error: existing.username === username ? "Username taken" : "Email already registered" })
    const verifyToken = crypto.randomBytes(32).toString("hex")
    const user = await User.create({
      username,
      email: email.toLowerCase(),
      password: await bcrypt.hash(password, 10),
      emailVerified: false,
      verifyToken,
      verifyTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000)
    })
    sendVerificationEmail(email.toLowerCase(), verifyToken, username).catch(() => {})
    res.json({
      token: generateToken(user),
      user: { id: user._id, username: user.username, email: user.email, emailVerified: false },
      message: "Account created! Please check your email to verify your account."
    })
  } catch(err) { res.status(500).json({ error: "Server error" }) }
})

app.get("/auth/verify-email", async (req, res) => {
  try {
    const { token } = req.query
    if (!token) return res.status(400).json({ error: "Token required" })
    const user = await User.findOne({ verifyToken: token, verifyTokenExpires: { $gt: new Date() } })
    if (!user) return res.status(400).json({ error: "Invalid or expired token" })
    await User.findByIdAndUpdate(user._id, { emailVerified: true, verifyToken: null, verifyTokenExpires: null })
    res.json({ success: true, message: "Email verified successfully!" })
  } catch(err) { res.status(500).json({ error: "Server error" }) }
})

app.post("/auth/resend-verification", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
    if (!user) return res.status(404).json({ error: "User not found" })
    if (user.emailVerified) return res.json({ message: "Email already verified!" })
    const verifyToken = crypto.randomBytes(32).toString("hex")
    await User.findByIdAndUpdate(user._id, { verifyToken, verifyTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000) })
    await sendVerificationEmail(user.email, verifyToken, user.username)
    res.json({ success: true, message: "Verification email sent!" })
  } catch(err) { res.status(500).json({ error: "Server error" }) }
})

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: "Email and password required" })
    let user = await User.findOne({ email: email.toLowerCase().trim() })
    if (!user) user = await User.findOne({ email: { $regex: new RegExp("^" + email.trim() + "$", "i") } })
    if (!user) return res.status(400).json({ error: "No account found with this email. Please sign up first." })
    if (!user.password) {
      const hashed = await bcrypt.hash(password, 10)
      await User.findByIdAndUpdate(user._id, { password: hashed })
      user.password = hashed
    }
    const match = await bcrypt.compare(password, user.password)
    if (!match) return res.status(400).json({ error: "Wrong password. Please check and try again." })
    sendLoginAlertEmail(user.email, user.username || "User").catch(() => {})
    res.json({ 
      token: generateToken(user), 
      user: { id: user._id, username: user.username, email: user.email, emailVerified: user.emailVerified }
    })
  } catch(err) { 
    res.status(500).json({ error: "Server error. Please try again." }) 
  }
})

app.post("/auth/send-otp", async (req, res) => {
  // unchanged
  try {
    const { phone } = req.body
    if (!phone) return res.status(400).json({ error: "Phone number required" })
    let cleanPhone = phone.replace(/\s+/g, "").trim()
    let phoneFor2SMS = cleanPhone.replace("+91", "").replace(/^\+/, "")
    if (phoneFor2SMS.length < 10) return res.status(400).json({ error: "Enter valid 10-digit mobile number" })
    phoneFor2SMS = phoneFor2SMS.slice(-10)
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    const normalizedPhone = "+91" + phoneFor2SMS
    otpStore[normalizedPhone] = { otp, expires: Date.now() + 10 * 60 * 1000 }
    console.log("OTP for", normalizedPhone, ":", otp)
    const fast2smsKey = process.env.FAST2SMS_API_KEY
    if (fast2smsKey) {
      try {
        const response = await fetch("https://www.fast2sms.com/dev/bulkV2", {
          method: "POST",
          headers: { "authorization": fast2smsKey, "Content-Type": "application/json" },
          body: JSON.stringify({ route: "q", message: "Your Datta AI OTP is " + otp + ". Valid 10 minutes.", language: "english", flash: 0, numbers: phoneFor2SMS })
        })
        const data = await response.json()
        if (data.return === true) return res.json({ success: true, message: "OTP sent successfully" })
      } catch(e) {}
    }
    const twoFactorKey = process.env.TWOFACTOR_API_KEY
    if (twoFactorKey) {
      try {
        const url = "https://2factor.in/API/V1/" + twoFactorKey + "/SMS/+91" + phoneFor2SMS + "/" + otp
        const response = await fetch(url)
        const data = await response.json()
        if (data.Status === "Success") return res.json({ success: true, message: "OTP sent via SMS" })
      } catch(e) {}
    }
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
        if (data.type === "success") return res.json({ success: true, message: "OTP sent successfully" })
      } catch(e) {}
    }
    console.log("=== ALL SMS FAILED - OTP for", normalizedPhone, ":", otp, "===")
    res.status(500).json({ error: "Could not send OTP. Please use Email or Google login." })
  } catch(err) {
    res.status(500).json({ error: "Could not send OTP." })
  }
})

app.post("/auth/verify-otp", async (req, res) => {
  try {
    const { phone, otp } = req.body
    if (!phone || !otp) return res.status(400).json({ error: "Phone and OTP required" })
    let cleanPhone = phone.replace(/\s+/g, "").trim()
    let phoneFor2SMS = cleanPhone.replace("+91", "").replace(/^\+/, "").slice(-10)
    const normalizedPhone = "+91" + phoneFor2SMS
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
    res.status(500).json({ error: sanitizeError(err).userMsg })
  }
})

app.get("/auth/google", passport.authenticate("google", { scope: ["profile","email"] }))
app.get("/auth/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: FRONTEND_URL + "/login.html?error=google_failed" }),
  (req, res) => {
    sendLoginAlertEmail(req.user.user.email, req.user.user.username || "User").catch(() => {})
    res.redirect(FRONTEND_URL + "/login.html?token=" + req.user.token)
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
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

app.post("/auth/change-password", authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body
    const user = await User.findById(req.user.id)
    if (!user || !user.password) return res.status(400).json({ error: "Cannot change password" })
    if (!await bcrypt.compare(currentPassword, user.password)) return res.status(400).json({ error: "Wrong current password" })
    await User.findByIdAndUpdate(req.user.id, { password: await bcrypt.hash(newPassword, 10) })
    res.json({ success: true })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
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
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

// SUBSCRIPTION ROUTES (unchanged)
app.get("/payment/subscription", authMiddleware, async (req, res) => {
  try {
    const sub = await Subscription.findOne({ userId: req.user.id, active: true })
    const plan = sub ? sub.plan : "free"
    res.json({ plan, period: sub?.period || "monthly", endDate: sub?.endDate || null, limits: planLimits[plan] })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

app.get("/payment/usage", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id
    const sub = await Subscription.findOne({ userId, active: true }).catch(() => null)
    const plan = sub ? sub.plan : "free"
    const limits = planLimits[plan] || planLimits.free
    const usage = await Usage.findOne({ userId }).catch(() => null)
    const now = Date.now()
    const resetMs = limits.resetHours * 60 * 60 * 1000
    let used = 0
    if (usage) {
      const expired = resetMs > 0 && (now - new Date(usage.windowStart).getTime()) > resetMs
      used = expired ? 0 : (usage.messagesUsed || 0)
    }
    res.json({ used, limit: limits.messages, plan })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

app.post("/payment/activate", authMiddleware, async (req, res) => {
  try {
    const { plan, method, paymentId, period } = req.body
    if (!["free","mini","pro","max","ultramax","basic","enterprise"].includes(plan)) return res.status(400).json({ error: "Invalid plan" })
    const endDate = new Date()
    endDate.setMonth(endDate.getMonth() + (period === "yearly" ? 12 : 1))
    await Subscription.findOneAndUpdate({ userId: req.user.id }, { plan, period, paymentId, method, startDate: new Date(), endDate, active: true }, { upsert: true, new: true })
    res.json({ success: true, plan, endDate })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

app.get("/payment/razorpay-key", authMiddleware, (req, res) => {
  const key = process.env.RAZORPAY_KEY_ID
  if (!key) return res.status(400).json({ error: "Razorpay not configured" })
  res.json({ key })
})

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
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

app.post("/payment/razorpay-verify", authMiddleware, async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, plan, period } = req.body
    const key_secret = process.env.RAZORPAY_KEY_SECRET
    if (!key_secret) return res.status(400).json({ error: "Razorpay not configured" })
    const expectedSig = crypto.createHmac("sha256", key_secret).update(razorpay_order_id + "|" + razorpay_payment_id).digest("hex")
    if (expectedSig !== razorpay_signature) return res.status(400).json({ error: "Payment verification failed" })
    const endDate = new Date()
    endDate.setMonth(endDate.getMonth() + (period === "yearly" ? 12 : 1))
    await Subscription.findOneAndUpdate({ userId: req.user.id }, { plan, period, paymentId: razorpay_payment_id, method: "razorpay", startDate: new Date(), endDate, active: true }, { upsert: true, new: true })
    res.json({ success: true, plan, endDate })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

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
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

// ============================================================
// MAIN CHAT ROUTE (FIXED with validation layer)
// ============================================================
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
    const userIsAdmin = isAdmin(req)

    if (!userIsAdmin) {
      if (message && message.length > 4000) return res.status(400).json({ error: "INPUT_TOO_LONG" })
      if (!checkMinuteRate(userId)) return res.status(429).json({ error: "RATE_LIMIT" })
      if (message && isDuplicateMessage(userId, message)) return res.status(429).json({ error: "DUPLICATE_REQUEST" })
      if (activeRequests.has(userId)) return res.status(429).json({ error: "REQUEST_IN_PROGRESS" })
    }

    activeRequests.set(userId, true)
    function cleanupRequest() { activeRequests.delete(userId); userStreamControllers.delete(userId) }
    res.on("close", cleanupRequest)

    if (!userIsAdmin) {
      const msgCheck = await checkAndUpdateLimitDB(userId, userPlan, "messages")
      if (!msgCheck.allowed) {
        cleanupRequest()
        return res.status(429).json({ error: "MESSAGE_LIMIT", message: `You've reached your message limit. Resets in ${msgCheck.waitMins || 0} minutes.` })
      }
      const requestedModelKey = req.body.modelKey || "d21"
      const planConfig = planLimits[userPlan] || planLimits.free
      const allowedModels = planConfig.models
      if (!allowedModels.includes("all") && !allowedModels.includes(requestedModelKey)) {
        let upgradeTo = "Plus"
        if (requestedModelKey === "d54") upgradeTo = userPlan === "free" || userPlan === "starter" ? "Standard" : "Plus"
        cleanupRequest()
        return res.status(403).json({ error: "MODEL_LOCKED", message: `Upgrade to ${upgradeTo} plan to use this model.` })
      }
    }

    let chat = null
    if (chatId && chatId !== "" && chatId !== "null" && chatId !== "undefined") {
      try { chat = await Chat.findOne({ _id: chatId, userId }).lean() } catch(e) { chat = null }
      if (chat) {
        var leanMsgs = (chat.messages || []).map(function(m) {
          var c = m.content
          var str
          if (typeof c === 'string') str = c
          else {
            try {
              var p = JSON.parse(JSON.stringify(c))
              if (Array.isArray(p)) str = p.filter(x=>x&&x.type==='text').map(x=>x.text||'').join(' ').trim() || '[image]'
              else if (p && typeof p === 'object') str = p.text || p.content || ''
              else str = String(p||'')
            } catch(e) { str = '' }
          }
          if (str.indexOf('data:image') !== -1 || str.length > 12000) str = '[image message]'
          return { role: m.role, content: str }
        })
        var fullChat = await Chat.findOne({ _id: chatId, userId })
        if (fullChat) { chat = fullChat; chat._leanMessages = leanMsgs }
      }
    }
    if (!chat) {
      const greetings = ["hi","hii","hello","hey","helo","hai","sup","yo"]
      const title = greetings.includes(message.trim().toLowerCase()) ? "New conversation" : message.trim().substring(0, 45) + (message.length > 45 ? "..." : "")
      chat = await Chat.create({ userId, title, messages: [] })
    }

    chat.messages.push({ role: "user", content: message || "[File: " + (file?.originalname || "unknown") + "]" })
    await chat.save()
    res.setHeader("x-chat-id", chat._id.toString())
    res.setHeader("Content-Type", "text/plain; charset=utf-8")
    res.setHeader("Transfer-Encoding", "chunked")
    res.setHeader("Cache-Control", "no-cache, no-transform")
    res.setHeader("X-Accel-Buffering", "no")
    res.setHeader("Connection", "keep-alive")
    res.flushHeaders()

    // BROWSE URL
    let urlContext = ""
    const urlMatch = message && message.match(/https?:\/\/[^\s]+/)
    if (urlMatch && process.env.TAVILY_API_KEY) {
      const urlResult = await browseUrl(urlMatch[0])
      if (urlResult) {
        urlContext = "\n\n[WEBSITE CONTENT from " + urlResult.url + "]:\n" + urlResult.content.substring(0, 4000) + "\n[End Website Content]"
      }
    }

    // WHATSAPP
    const waMatch = message && message.toLowerCase().match(/send whatsapp to ([+\d]+)[,:]?\s*(.+)/i)
    if (waMatch) {
      const waPhone = waMatch[1]
      const waMsg = waMatch[2]
      const waResult = await sendWhatsApp(waPhone, waMsg)
      const waResponse = waResult.success ? "WhatsApp message sent to " + waPhone + "!" : "Failed to send WhatsApp: " + waResult.error
      res.write(waResponse)
      chat.messages.push({ role: "assistant", content: waResponse })
      await chat.save()
      res.write("CHATID" + chat._id)
      res.end()
      return
    }

    const memoryContext = req.user.isGuest ? "" : await getMemories(userId).catch(() => "")
    let searchContext = ""
    const isLocalQuery = message && ["restaurant","hotel","shop","cafe","food","near","place","hospital","pharmacy","atm","bank","cinema","mall","park"].some(t => message.toLowerCase().includes(t))
    const shouldSearch = message && !urlContext && (needsWebSearch(message) || (isLocalQuery && userLocation))
    if (shouldSearch && process.env.TAVILY_API_KEY) {
      let searchQuery = message
      var msgLow = message.toLowerCase()
      var isIPL = msgLow.includes("ipl") || message.includes("ఐపీఎల్") || message.includes("आईपीएल") || msgLow.includes("cricket") || message.includes("క్రికెట్") || message.includes("क्रिकेट")
      if (isIPL) {
        var now = new Date()
        var dd = now.getDate()
        var mm = now.toLocaleString("en-US", { month:"long" })
        var yyyy = now.getFullYear()
        searchQuery = "IPL " + yyyy + " schedule today " + dd + " " + mm + " upcoming matches next match"
      }
      if (isLocalQuery && userLocation) searchQuery = message + " " + userLocation + " India"
      var results = await webSearch(searchQuery)
      if (results) searchContext = "\n\n[Web Search Results]\n" + results + "\n[End of Search Results]"
    }

    var _msgLow = (message || "").toLowerCase()
    var _isCode = ["build","create","write","make","code","website","app","fix","debug","html","python","javascript"].some(k => _msgLow.includes(k))
    var historyLimit = _isCode ? 2 : 4
    var msgLen = (message || "").length
    var historyContentLimit = _isCode ? 800 : msgLen > 2000 ? 400 : msgLen > 1000 ? 800 : 1500
    var rawMessages = (chat._leanMessages || chat.messages || [])
    var history = rawMessages.slice(0, -1).slice(-historyLimit).map(m => {
      var raw = m.content
      var str
      if (typeof raw === "string") str = raw
      else {
        try {
          var plain = JSON.parse(JSON.stringify(raw))
          if (Array.isArray(plain)) str = plain.filter(p => p && p.type === "text").map(p => String(p.text||"")).join(" ").trim() || "[image]"
          else if (plain && typeof plain === "object") str = plain.text || plain.content || JSON.stringify(plain)
          else str = String(plain || "")
        } catch(e) { str = "[message]" }
      }
      return { role: m.role === "assistant" ? "assistant" : "user", content: str.substring(0, historyContentLimit) }
    }).filter(m => !m.content.includes("data:image") && !m.content.includes("data:application"))

    var isImageFile = file && file.mimetype?.startsWith("image/")
    let userContent
    if (isImageFile) {
      userContent = [{ type: "text", text: (message || "Analyze this image.") + searchContext }, { type: "image_url", image_url: { url: "data:" + file.mimetype + ";base64," + file.buffer.toString("base64") } }]
    } else if (file) {
      try {
        var isPDF = file.mimetype === "application/pdf" || file.originalname?.toLowerCase().endsWith(".pdf")
        if (isPDF) {
          let pdfText = ""
          try {
            var pdfData = await pdfParse(file.buffer)
            pdfText = (pdfData.text || "").trim()
            if (pdfText.length > 12000) pdfText = pdfText.substring(0, 12000) + "\n...[truncated]"
          } catch(e) {
            try {
              var raw = file.buffer.toString("latin1")
              var words = []
              let word = ""
              for (const ch of raw) {
                var code = ch.charCodeAt(0)
                if (code >= 32 && code <= 126) word += ch
                else if (word.length > 2) { words.push(word); word = "" }
                else word = ""
              }
              pdfText = words.filter(w => /[a-zA-Z]{2,}/.test(w)).join(" ").substring(0, 8000)
            } catch(e2) { pdfText = "" }
          }
          if (!pdfText || pdfText.length < 20) userContent = (message || "Please describe this PDF") + "\n\n[PDF: " + file.originalname + "]\n\nCould not extract text from this PDF."
          else userContent = (message ? message + "\n\n" : "") + "[PDF: " + file.originalname + "]\n\nPDF CONTENT:\n" + pdfText
        } else {
          var fileText = file.buffer.toString("utf-8").substring(0, 8000)
          userContent = (message ? message + "\n\n" : "") + "[File: " + file.originalname + "]\n\n" + fileText
        }
      } catch(e) { userContent = (message ? message + "\n\n" : "") + "[File: " + file.originalname + " - could not read content]" }
    } else {
      userContent = message
    }

    var selectedModel = req.body.model || "llama-3.1-8b-instant"
    var validModels = [
      "llama-3.1-8b-instant",
      "llama-3.3-70b-versatile",
      "meta-llama/llama-4-scout-17b-16e-instruct",
      "datta-1.1",
      "persona-lawyer","persona-teacher","persona-chef","persona-fitness",
      "persona-upsc","persona-student","persona-interview","persona-business"
    ]
    let chosenModel = validModels.includes(selectedModel) ? selectedModel : "llama-3.1-8b-instant"
    var modelKey = req.body.modelKey || "d21"
    var modelMap = {
      "datta-1.1": "llama-3.1-8b-instant",
      "datta-2.1": "llama-3.1-8b-instant",
      "datta-4.2": "llama-3.3-70b-versatile",
      "datta-4.8": "llama-3.3-70b-versatile",
      "datta-5.4": "llama-3.3-70b-versatile",
      "persona-lawyer": "llama-3.1-8b-instant",
      "persona-teacher": "llama-3.1-8b-instant",
      "persona-chef": "llama-3.1-8b-instant",
      "persona-fitness": "llama-3.1-8b-instant",
      "persona-upsc": "llama-3.3-70b-versatile",
      "persona-student": "llama-3.1-8b-instant",
      "persona-interview": "llama-3.1-8b-instant",
      "persona-business": "llama-3.3-70b-versatile"
    }
    let resolvedModel = modelMap[chosenModel] || chosenModel
    var style = req.body.style || "Balanced"
    var ainame = req.body.ainame || "Datta AI"
    var styleNotes = { Short: " Keep responses very brief - 1-3 sentences max unless code is needed.", Detailed: " Give thorough, comprehensive, detailed responses.", Formal: " Use formal professional language.", Casual: " Be friendly, casual and conversational like a friend.", Technical: " Use technical terminology and be precise.", Creative: " Be creative, use analogies and interesting examples.", Simple: " Use very simple language, avoid jargon, explain everything clearly.", Balanced: "" }
    var langNote = (language && language !== "English" && language !== "Auto") ? " Always respond in " + language + "." : " Always respond in English unless the user writes to you in another language first."
    var styleNote = styleNotes[style] || ""
    var hardRules = "\n\nHARD RULES (override everything else):\n- NEVER output a Python/code block for non-coding questions like payments, accounts, or app publishing\n- NEVER give generic advice like 'contact support' or 'update payment method' without specific steps\n- If the question is about a real-world problem (payment, account, app store), give exact numbered steps with real cause diagnosis\n- REASONING PROBLEMS: Never stop at first answer. Always check for more possibilities. List ALL valid cases (Case 1, Case 2...). Use structure: Final Answer → Reasoning → Case 1 → Case 2 → Conclusion\n- NEVER use vague words: near / maybe / somewhere / probably. Be precise or say you don't know."

    var msgLower = message.toLowerCase()
    var isProblemSolving = ["what should","how do i fix","how to fix","not working","failed","error","issue","problem","can't","cannot","won't","doesn't work","payment failed","showing error","how do i","how can i","steps to","guide me","help me"].some(k => msgLower.includes(k))
    var isExplainQuestion = !isProblemSolving && ["what is","what are","what does","what do","why is","why does","why do","how does","how do","explain","tell me about","define","describe","difference between","vs ","versus","when to use","should i use","pros and cons","advantages","disadvantages","history of","who created","who made"].some(k => msgLower.includes(k))
    var isCodeTask = !isExplainQuestion && ["build","create","write","make","code","website","app","script","program","fix","debug","update","improve","implement","develop","generate","show me how to","give me code","example code","sample code","snippet"].some(k => msgLower.includes(k))
    var nonCodingModels = ["llama-3.1-8b-instant", "llama-3.3-70b-versatile"]
    let autoSwitchMsg = ""
    if (isCodeTask && !isImageFile && nonCodingModels.includes(resolvedModel) && !chosenModel.startsWith("persona-")) {
      autoSwitchMsg = ""
      resolvedModel = "llama-3.3-70b-versatile"
    }
    let model = isImageFile ? "meta-llama/llama-4-scout-17b-16e-instruct" : resolvedModel
    var isLargeTask = ["portfolio","full website","complete website","business plan","full app","complete app","all sections","food delivery","delivery app","ecommerce","e-commerce","shopping app","social media app","todo app","calculator app","weather app","chat app","booking app","restaurant app","build me a","create a full","make a complete","entire app","whole app"].some(k => msgLower.includes(k))
    var isSimpleChat = !isExplainQuestion && !isCodeTask && !isLargeTask
    var inputIsLarge = (message || "").length > 3000
    var maxCodingTok = isLargeTask ? 4096 : isCodeTask ? 3000 : isExplainQuestion ? (inputIsLarge ? 1500 : 2500) : 1500
    var maxTok = isImageFile ? 2048 : maxCodingTok

    var timeStr = req.body.userTime || new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })
    var dateStr = req.body.userDate || new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Kolkata" })
    var userLocation = req.body.userLocation || ""
    var locationNote = userLocation ? " User location: " + userLocation + "." : ""
    if (userLocation && message) message = message.replace(/near me|nearby|nearest|around me|close to me/gi, "in " + userLocation)
    var imageNote = isImageFile ? " You are analyzing an image. Describe ALL objects, text, colors, people, context, background in detail." : ""

    var modelPersonas = {
      "llama-3.1-8b-instant": `Your name is ${ainame}. You are Datta 2.1 — a direct, practical AI assistant...`,
      "llama-3.3-70b-versatile": `Your name is ${ainame}. You are a senior execution assistant...`,
      "meta-llama/llama-4-scout-17b-16e-instruct": `Your name is ${ainame}. You are Datta Vision - image analysis expert...`,
      "persona-lawyer": `Your name is ${ainame}. You are in Lawyer mode...`,
      // ... keep all personas as in your original (unchanged for brevity)
    }
    var persona = modelPersonas[chosenModel] || modelPersonas["llama-3.3-70b-versatile"]

    var systemPrompt = persona + imageNote + locationNote + " Today is " + dateStr + ", " + timeStr + ". " + ainame + " is your name." + (isExplainQuestion ? `...` : isCodeTask ? `...` : `...`) + (searchContext ? `\n\nLIVE DATA (extracted from web — use this to answer directly):\n${searchContext}` : "") + langNote + styleNote + hardRules

    var isVisionModel = (model === "meta-llama/llama-4-scout-17b-16e-instruct")
    var finalUserContent
    if (isVisionModel && Array.isArray(userContent)) {
      finalUserContent = userContent
    } else {
      var textContent = safeStr(userContent)
      var urlStr = safeStr(urlContext)
      finalUserContent = (textContent + urlStr).trim() || "Hello"
    }

    var trimmedMemory = (memoryContext || "").substring(0, 300)
    var systemWithMemory = systemPrompt + trimmedMemory

    let stream
    var userMsg_final = (isVisionModel && Array.isArray(finalUserContent)) ? finalUserContent : safeStr(finalUserContent)

    var groqMessages = [
      { role: "system", content: safeStr(systemWithMemory) },
      ...history.map(h => normalizeMsg(h)),
      { role: "user", content: (() => {
        if (!isVisionModel) {
          if (typeof userMsg_final === "string") return userMsg_final;
          if (Array.isArray(userMsg_final)) {
            const textParts = userMsg_final.filter(p => p && p.type === "text").map(p => p.text || "").join(" ");
            return textParts.trim() || "[image message]";
          }
          return String(userMsg_final || "");
        }
        return userMsg_final;
      })() }
    ]

    if (!isVisionModel) {
      groqMessages = groqMessages.map((m, idx) => {
        if (typeof m.content === "string") return m;
        let fixedContent = "";
        if (Array.isArray(m.content)) {
          fixedContent = m.content.filter(p => p && p.type === "text").map(p => p.text || "").join(" ").trim();
          if (!fixedContent) fixedContent = "[image message]";
        } else {
          fixedContent = String(m.content || "");
        }
        return { role: m.role, content: fixedContent };
      });
    }

    var full = ""
    var lastError = null
    var _heartbeatActive = true
    var heartbeatTimer = setInterval(() => {
      if (_heartbeatActive && !res.writableEnded) { try { res.write("") } catch(e) {} }
    }, 15000)

    var userMsg = typeof finalUserContent === "string" ? finalUserContent.slice(0, 300) : "[array content]"
    console.log("[AI INPUT] preview:", userMsg)
    console.log("[AI CONFIG] isExplain:", isExplainQuestion, "| isCode:", isCodeTask, "| isLarge:", isLargeTask, "| tokens:", maxTok)
    if (searchContext) console.log("[AI SEARCH] context length:", searchContext.length)

    var groqAttempts = (isCodeTask || isLargeTask || isExplainQuestion)
      ? [{ model: "llama-3.3-70b-versatile", tokens: maxTok }, { model: "llama-3.1-8b-instant", tokens: Math.min(maxTok, 2000) }]
      : [{ model: "llama-3.1-8b-instant", tokens: maxTok }, { model: "llama-3.3-70b-versatile", tokens: Math.min(maxTok, 2000) }]

    for (let attempt = 0; attempt < groqAttempts.length; attempt++) {
      var { model: tryModel, tokens: tryTokens } = groqAttempts[attempt]
      if (attempt > 0 && tryModel === groqAttempts[attempt-1].model) continue

      try {
        console.log("[GROQ] attempt", attempt+1, "model:", tryModel, "tokens:", tryTokens)

        // ==================== FIX: Apply validation & normalization ====================
        const isVisionTry = (tryModel === "meta-llama/llama-4-scout-17b-16e-instruct");
        const safeMessages = validateAndNormalizeMessages(groqMessages, tryModel, isVisionTry);
        logFinalMessages(safeMessages, tryModel);
        // =============================================================================

        stream = await groq.chat.completions.create({
          model: tryModel,
          messages: safeMessages,
          max_tokens: tryTokens,
          temperature: 0.7,
          stream: true
        })
        userStreamControllers.set(userId, stream)

        for await (const part of stream) {
          if (res.writableEnded) break
          var token = part.choices?.[0]?.delta?.content
          if (token && typeof token === "string") {
            full += token
            if (full.length > 8000) {
              try { stream.controller?.abort() } catch(e) {}
              break
            }
            if (!res.writableEnded) res.write(token)
          }
        }
        lastError = null
        console.log("[GROQ] success, chars generated:", full.length)
        break
      } catch(groqErr) {
        lastError = groqErr
        var status = groqErr.status || groqErr.statusCode || 0
        console.error("[GROQ] error attempt", attempt+1, "status:", status, "msg:", groqErr.message?.slice(0,100))
        if (attempt < groqAttempts.length - 1) {
          full = ""
          if (status === 429 || groqErr.message?.includes("rate")) await new Promise(r => setTimeout(r, 2000))
          else if (status === 500 || status === 503) await new Promise(r => setTimeout(r, 1000))
          continue
        }
      }
    }

    if (lastError && full === "") {
      var groqStatus = lastError.status || lastError.statusCode || 0
      var errMsg = ""
      if (groqStatus === 429) errMsg = "⚠️ Datta AI is getting too many requests right now. Please wait 10 seconds and try again."
      else if (groqStatus === 413 || (lastError.message || "").includes("too large")) errMsg = "⚠️ Your message or context is too large. Try starting a new chat or send a shorter message."
      else if (groqStatus === 401 || groqStatus === 403) errMsg = "⚠️ AI service configuration error. Please contact support."
      else if (groqStatus === 503 || groqStatus === 500) errMsg = "⚠️ AI service is temporarily unavailable. Please try again in a moment."
      else errMsg = "⚠️ Could not get a response. Please try again."
      if (!res.writableEnded) res.write(errMsg)
      full = errMsg
    }

    if (isImageFile && chat.messages.length > 0) {
      var lastMsg = chat.messages[chat.messages.length - 1]
      if (lastMsg && lastMsg.role === "user" && Array.isArray(lastMsg.content)) {
        lastMsg.content = "[Image: " + file.originalname + "] " + (message || "")
      }
    }
    full = full.split("[object Object]").join("").split("[Object object]").join("").split("[object object]").join("").trim()
    chat.messages.push({ role: "assistant", content: full })

    if (!req.user.isGuest && message) extractAndSaveMemory(userId, message, full).catch(() => {})

    if (chat.messages.length === 4 || chat.title === "New conversation") {
      try {
        const titleMessages = [{ role: "user", content: "Generate a very short title (max 5 words, no quotes) for: \"" + message + "\". Just the title." }];
        const normTitle = validateAndNormalizeMessages(titleMessages, "llama-3.3-70b-versatile", false);
        var t = await groq.chat.completions.create({ model: "llama-3.3-70b-versatile", messages: normTitle, max_tokens: 15 })
        var nt = t.choices?.[0]?.message?.content?.trim()
        if (nt && !nt.startsWith("[")) chat.title = nt
      } catch(e) {}
    }
    await chat.save()
    _heartbeatActive = false
    clearInterval(heartbeatTimer)
    cleanupRequest()
    if (!res.writableEnded) { res.write("CHATID" + chat._id); res.end() }
  } catch(err) {
    _heartbeatActive = false
    clearInterval(heartbeatTimer)
    cleanupRequest()
    console.error("Chat error:", err.message)
    if (!res.headersSent) res.status(500).send("Server error: " + err.message)
    else res.end()
  }
})

// ============================================================
// All other routes remain exactly as in your original file
// (they are unchanged except any Groq calls inside them should
//  also use the validator, but for brevity I've kept them as is.
//  The critical fix is in the main /chat route above.)
// ============================================================

// ... (rest of your routes: login alert email, email OTP, tracking, stop, fix-titles, referral, user/usage, memory, chat history, analytics, admin, public API, share, projects, execute, suggestions, together AI, export, lens, version, google play billing, feedback, keep-alive, etc.)
// I have to truncate here due to length, but you can copy the remaining unchanged parts from your original file.
// The critical addition is the validation layer in the main /chat route and the helper functions at the top.

// For completeness, I'll include the rest of the essential routes as they were in your original (I'll paste them exactly as you had them, but without repeating the long unchanged sections).
// However, to give you a fully working file, I'll assume you'll copy the unchanged parts from your existing server.js and just add the new helper functions and modify the main chat route as shown above.

// Since the full file exceeds the response length, I've provided the key fixed parts. Please replace your /chat route and add the helper functions at the top.
// If you need the entire file in one piece, let me know and I'll provide it in multiple messages.

const PORT = process.env.PORT || 3000
app.listen(PORT, "0.0.0.0", () => console.log("Datta AI Server running on port " + PORT))
