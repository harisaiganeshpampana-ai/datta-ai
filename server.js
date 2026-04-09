import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import mongoose from "mongoose"
import multer from "multer"
import crypto from "crypto"
import Groq from "groq-sdk"
import OpenAI from "openai"
import { GoogleGenerativeAI } from "@google/generative-ai"
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
// Allows datta-ai.com + localhost dev + any subdomain
const ALLOWED_ORIGINS = [
  "https://datta-ai.com",
  "https://www.datta-ai.com",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
]
app.use((req, res, next) => {
  const origin = req.headers.origin
  // Allow the specific origin if in whitelist, otherwise allow all (for Render health checks)
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin)
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*")
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,x-chat-id,Accept")
  res.setHeader("Access-Control-Expose-Headers", "x-chat-id")
  res.setHeader("Access-Control-Max-Age", "86400") // cache preflight 24h
  // Handle OPTIONS preflight immediately — do not pass to routes
  if (req.method === "OPTIONS") {
    return res.status(204).end()
  }
  next()
})

// ── PING / HEALTH — after CORS so they get CORS headers ──────────────────────
app.get("/ping", (req, res) => res.json({ alive: true }))
app.get("/health", (req, res) => res.json({ status: "ok" }))

// ── SECURITY HEADERS ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.removeHeader("X-Powered-By")
  res.setHeader("Server", "Datta-AI")
  res.setHeader("X-Content-Type-Options", "nosniff")
  next()
})

app.use(express.json({ limit: "20mb" }))
app.use(express.urlencoded({ extended: true, limit: "20mb" }))

// Catch oversized URLs — only block genuinely huge requests
app.use((req, res, next) => {
  const urlLen = (req.url || "").length
  // Log all requests over 2KB URL for debugging
  if (urlLen > 2048) {
    console.warn("[LARGE URL]", urlLen, "chars:", req.url.slice(0, 300))
  }
  // Only hard-block truly excessive URLs (nginx limit is ~8KB)
  if (urlLen > 7000) {
    console.error("[414 BLOCKED] URL len:", urlLen, "path:", req.url.slice(0, 300))
    return res.status(414).json({ error: "URI_TOO_LONG", message: "Request URL too long" })
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
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null
const geminiClient = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null
// Available Gemini models (2025): gemini-1.5-flash, gemini-1.5-pro, gemini-1.5-flash-8b

// ── GEMINI API (Google — free, high quality) ──────────────────────────────
async function callGemini(messages, systemPrompt, maxTokens, res) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("GEMINI_API_KEY not set")

  // Convert messages to Gemini format — always extract string
  const geminiContents = messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: typeof m.content === "string" ? m.content : (
      Array.isArray(m.content)
        ? m.content.filter(p => p.type === "text").map(p => p.text || "").join("") || "[image]"
        : JSON.stringify(m.content)
    )}]
  }))

  // Add current user message last
  const lastMsg = geminiContents[geminiContents.length - 1]
  if (!lastMsg || lastMsg.role !== "user") {
    geminiContents.push({ role: "user", parts: [{ text: "Continue" }] })
  }

  // Prepend system prompt to first user message (system_instruction not supported in v1beta for all models)
  if (geminiContents.length > 0 && geminiContents[0].role === "user") {
    geminiContents[0].parts.unshift({ text: systemPrompt + "\n\n" })
  }

  const body = {
    contents: geminiContents,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.7
    }
  }

  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse&key=" + apiKey

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error("Gemini error: " + err.substring(0, 200))
  }

  // Stream SSE response
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

// ── MongoDB connection with retry — never crash on timeout ──
async function runMigration() {
  try {
    const badChats = await Chat.find({ 'messages.content': { $type: 4 } }).limit(1000).lean()
    let fixCount = 0
    for (const chat of badChats) {
      const newMsgs = chat.messages.map(function(m) {
        if (!Array.isArray(m.content)) return m
        var txt = m.content
          .filter(function(p) { return p && p.type === 'text' && p.text })
          .map(function(p) { return String(p.text) })
          .join(' ').trim()
        return { role: m.role, content: txt || '[image]' }
      })
      await Chat.updateOne({ _id: chat._id }, { $set: { messages: newMsgs } })
      fixCount++
    }
    if (fixCount > 0) console.log('[MIGRATION] Cleaned', fixCount, 'chats')
    else console.log('[MIGRATION] No array content found - all clean')
  } catch(migErr) { console.log('[MIGRATION] Error:', migErr.message) }
}

async function connectMongo(attempt) {
  attempt = attempt || 1
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 15000,  // 15s timeout per attempt
      connectTimeoutMS: 15000,
      socketTimeoutMS: 30000,
    })
    console.log("MongoDB connected (attempt " + attempt + ")")
    await runMigration()
  } catch(e) {
    console.error("DB connection error (attempt " + attempt + "):", e.message)
    if (attempt < 5) {
      // Retry with exponential backoff: 3s, 6s, 12s, 24s
      var delay = Math.min(3000 * Math.pow(2, attempt - 1), 30000)
      console.log("Retrying MongoDB in", delay/1000, "seconds...")
      setTimeout(function() { connectMongo(attempt + 1) }, delay)
    } else {
      console.error("MongoDB failed after 5 attempts — server will run without DB")
      // DO NOT process.exit — keep server alive, Render will not restart
    }
  }
}

// Also reconnect if connection drops during runtime
mongoose.connection.on('disconnected', function() {
  console.warn('[MONGO] Disconnected — attempting reconnect...')
  setTimeout(function() { connectMongo(1) }, 5000)
})
mongoose.connection.on('error', function(err) {
  console.error('[MONGO] Connection error:', err.message)
})

connectMongo(1)

// ── Gemini 2.0 Flash — image solver (exam papers + general images) ──────────────
async function solveWithGemini(imageBase64, mimeType, systemPrompt, userPrompt) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("Gemini not configured")

  const modelsToTry = [
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-1.0-pro-vision-latest"
  ]

  for (const modelName of modelsToTry) {
    try {
      const url = "https://generativelanguage.googleapis.com/v1/models/" + modelName + ":generateContent?key=" + apiKey
      // Combine system prompt into user message — v1 API doesn't support system_instruction
      const combinedPrompt = systemPrompt + "\n\n" + userPrompt
      const body = {
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
            { text: combinedPrompt }
          ]
        }],
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.2
        }
      }
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })
      if (!resp.ok) {
        const errText = await resp.text()
        console.warn("[GEMINI] Model", modelName, "HTTP", resp.status, errText.slice(0, 150))
        continue
      }
      const data = await resp.json()
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ""
      if (text) {
        console.log("[GEMINI] Success with model:", modelName, "length:", text.length)
        return text
      }
    } catch(e) {
      console.warn("[GEMINI] Model", modelName, "error:", e.message?.slice(0, 100))
    }
  }
  throw new Error("All Gemini models failed")
}

// ── GPT-4o exam paper solver ─────────────────────────────────────────────────
async function solveExamWithGPT4o(imageBase64, mimeType, userMsg, ainame) {
  if (!openai) throw new Error("OpenAI not configured")
  const systemPrompt = "You are an expert academic exam solver. Answer every question in the image completely and correctly. Use exact question numbering. 1 mark = 2 sentences. 2 marks = 4 sentences. 4 marks = minimum 6 sentences with all points. For lists write ALL items. For formulas write formula + explain symbols. For graphs describe axes, curves, stages. Never leave any answer empty."
  const userPrompt = (userMsg ? userMsg + "\n\n" : "") + "Solve all questions in this exam paper completely. Start directly with 1a answer:"
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 4000,
    messages: [{
      role: "system", content: systemPrompt
    }, {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: "data:" + mimeType + ";base64," + imageBase64, detail: "high" } },
        { type: "text", text: userPrompt }
      ]
    }]
  })
  return response.choices[0].message.content || ""
}

// Safe string extractor — prevents [object Object] in AI responses
function safeStr(val) {
  if (val === null || val === undefined) return ""
  if (typeof val === "string") return val
  if (Array.isArray(val)) {
    return val.filter(p => p && p.type === "text").map(p => p.text || "").join("") || "[image]"
  }
  if (typeof val === "object") return val.text || val.content || JSON.stringify(val)
  return String(val)
}

// normalizeMsg — strips Mongoose types, guarantees content is plain string
// Handles Mongoose DocumentArray, plain array, object, string
function normalizeMsg(m) {
  // Serialize through JSON to strip all Mongoose magic (DocumentArray etc)
  var raw
  try { raw = JSON.parse(JSON.stringify(m)) } catch(e) { raw = m }
  var c = raw.content
  if (typeof c === "string") return { role: raw.role, content: c }
  if (Array.isArray(c)) {
    // Extract only text items
    var text = c.filter(p => p && p.type === "text").map(p => String(p.text || "")).join(" ").trim()
    return { role: raw.role, content: text || "[image message]" }
  }
  if (c && typeof c === "object") {
    return { role: raw.role, content: c.text || c.content || JSON.stringify(c) }
  }
  return { role: raw.role, content: String(c || "") }
}

app.get("/ping", (req, res) => { res.setHeader("Access-Control-Allow-Origin","*"); res.json({ alive: true, time: new Date().toISOString() }) })
app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }))

const otpStore = {}

// Email OTP store — separate from SMS OTP
// { email: { hash, expires, attempts } }
const emailOtpStore = {}

// Email tracking schema
const EmailTrackSchema = new mongoose.Schema({
  trackId:    { type: String, required: true, unique: true },
  email:      { type: String },
  type:       { type: String }, // "welcome" | "otp" | "verify"
  openedAt:   { type: Date, default: null },
  clicks:     [{ url: String, clickedAt: Date }],
  sentAt:     { type: Date, default: Date.now }
})
const EmailTrack = mongoose.models.EmailTrack || mongoose.model("EmailTrack", EmailTrackSchema)

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
  previousPlan: { type: String, default: "free" },   // for ultra-mini revert
  period: { type: String, default: "monthly" },
  paymentId: String,
  orderId: String,
  method: String,
  startDate: { type: Date, default: Date.now },
  endDate: Date,
  ultraMiniExpiry: Date,                              // ultra-mini 24h expiry
  extraMessages: { type: Number, default: 0 },        // bonus messages from ultra-mini
  active: { type: Boolean, default: true }
})
const Subscription = mongoose.model("Subscription", SubscriptionSchema)

// ERROR SANITIZER - never expose internal details to users
function sanitizeError(err) {
  const msg = (err?.message || err?.error?.message || String(err) || "").toLowerCase()
  
  // Rate limit errors
  if (msg.includes("rate limit") || msg.includes("429") || msg.includes("tpm") || msg.includes("tokens per minute")) {
    return { userMsg: "Datta AI is thinking too hard! Please wait a moment and try again.", code: "rate_limit" }
  }
  // Model errors
  if (msg.includes("decommission") || msg.includes("model") || msg.includes("deprecated")) {
    return { userMsg: "This model is temporarily unavailable. Switching to default model.", code: "model_error" }
  }
  // Auth errors
  if (msg.includes("api key") || msg.includes("unauthorized") || msg.includes("authentication")) {
    return { userMsg: "Service temporarily unavailable. Please try again.", code: "service_error" }
  }
  // Timeout
  if (msg.includes("timeout") || msg.includes("timed out")) {
    return { userMsg: "Request timed out. Please try again.", code: "timeout" }
  }
  // Network
  if (msg.includes("network") || msg.includes("fetch") || msg.includes("econnrefused")) {
    return { userMsg: "Connection error. Please check your internet and try again.", code: "network" }
  }
  // Context too long
  if (msg.includes("context") || msg.includes("too long") || msg.includes("maximum")) {
    return { userMsg: "Message too long. Please start a new chat.", code: "too_long" }
  }
  // Generic fallback - never expose real error
  return { userMsg: "Something went wrong. Please try again.", code: "unknown" }
}

// USAGE SCHEMA - persists in MongoDB so refreshes don't reset
const UsageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true },
  messagesUsed: { type: Number, default: 0 },
  imagesUsed: { type: Number, default: 0 },
  totalMessages: { type: Number, default: 0 },
  totalImages: { type: Number, default: 0 },
  windowStart: { type: Date, default: Date.now },
  imageWindowStart: { type: Date, default: Date.now },
  freeD54Used: { type: Number, default: 0 },       // free plan: 2 Datta 5.4 per day
  freeD54WindowStart: { type: Date, default: Date.now },
  firstEverMessage: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now }
})
const Usage = mongoose.model("Usage", UsageSchema)

// MEMORY SCHEMA - persists user memory
const MemorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  key: String,
  value: mongoose.Schema.Types.Mixed,
  category: { type: String, default: "general" },
  updatedAt: { type: Date, default: Date.now }
})
const Memory = mongoose.model("Memory", MemorySchema)

const planLimits = {
  // ── ACTIVE PLANS ────────────────────────────────────────────
  free:        { messages: 10,     resetHours: 24, models: ["d21"],       price: 0,   priority: 0 },
  starter:     { messages: 40,     resetHours: 24, models: ["d21","d54"], price: 29,  priority: 1 },
  plus:        { messages: 300,    resetHours: 24, models: ["d21","d54"], price: 299, priority: 2 },
  pro:         { messages: 700,    resetHours: 24, models: ["d21","d54"], price: 499, priority: 3 },
  ultimate:    { messages: 1500,   resetHours: 24, models: ["d21","d54"], price: 799, priority: 4 },
  // ── LEGACY (keep for existing subscribers) ──────────────────
  "ultra-mini":{ messages: 20,     resetHours: 24, models: ["d21"],       price: 10,  priority: 1, extraMessages: 15, expiresHours: 24 },
  standard:    { messages: 120,    resetHours: 24, models: ["d21","d54"], price: 149, priority: 2 },
  mini:        { messages: 200,    resetHours: 24, models: ["d21","d54"], price: 199, priority: 2 },
  max:         { messages: 2000,   resetHours: 24, models: ["d21","d54"], price: 1999,priority: 5 },
  ultramax:    { messages: 999999, resetHours: 0,  models: ["all"],       price: 0,   priority: 6 },
  basic:       { messages: 500,    resetHours: 24, models: ["d21","d54"], price: 499, priority: 3 },
  enterprise:  { messages: 999999, resetHours: 0,  models: ["all"],       price: 0,   priority: 6 }
}
const rateLimitStore = {}

// ── ABUSE PROTECTION ─────────────────────────────────────────────────────────

// 1. One active request per user — prevents parallel duplicate streams
const activeRequests = new Map()

// 2. Per-minute spam prevention — 15 req/min max per user
const minuteRateStore = {}
function checkMinuteRate(userId) {
  const now = Date.now()
  const key = String(userId)
  if (!minuteRateStore[key]) minuteRateStore[key] = { count: 0, start: now }
  const s = minuteRateStore[key]
  if (now - s.start > 60000) { s.count = 0; s.start = now }  // reset every 60s
  s.count++
  return s.count <= 15  // allow 15 per minute
}

// 3. Duplicate message prevention — same message within 2s
const lastMessageStore = {}
function isDuplicateMessage(userId, message) {
  const key = String(userId)
  const now = Date.now()
  const last = lastMessageStore[key]
  if (last && last.msg === message && now - last.time < 2000) return true
  lastMessageStore[key] = { msg: message, time: now }
  return false
}

// 4. Per-user stream controller store — for /stop endpoint
const userStreamControllers = new Map()

// MongoDB-based usage tracking - persists across refreshes and restarts
async function checkAndUpdateLimitDB(userId, plan, type) {
  const now = new Date()

  // Check if ultra-mini has expired — revert to previous plan
  if (plan === "ultra-mini") {
    const sub = await Subscription.findOne({ userId }).catch(() => null)
    if (sub && sub.ultraMiniExpiry && now > new Date(sub.ultraMiniExpiry)) {
      // Ultra-mini expired — revert to previous plan
      const revertPlan = sub.previousPlan || "free"
      await Subscription.findOneAndUpdate({ userId }, { plan: revertPlan, extraMessages: 0 })
      plan = revertPlan
      console.log("[ULTRA-MINI] Expired, reverted to:", revertPlan)
    }
  }

  const limits = planLimits[plan] || planLimits.free
  if (limits[type] === 999999) return { allowed: true, used: 0, limit: 999999 }

  const resetMs = limits.resetHours * 60 * 60 * 1000

  let usage = await Usage.findOne({ userId })
  if (!usage) {
    usage = await Usage.create({ userId, windowStart: now, imageWindowStart: now })
  }

  // Reset window if 24h passed
  if (type === "messages" && resetMs > 0) {
    if (now - new Date(usage.windowStart) > resetMs) {
      usage.messagesUsed = 0
      usage.windowStart = now
    }
  }
  if (type === "images" && resetMs > 0) {
    if (now - new Date(usage.imageWindowStart) > resetMs) {
      usage.imagesUsed = 0
      usage.imageWindowStart = now
    }
  }

  // Determine limit — ultra-mini adds 15 to base plan limit
  let limit = limits.messages || 20
  if (plan === "ultra-mini") {
    const sub = await Subscription.findOne({ userId }).catch(() => null)
    const base = planLimits[sub?.previousPlan || "free"]?.messages || 20
    limit = base + 15
  }

  const current = type === "messages" ? (usage.messagesUsed || 0) : (usage.imagesUsed || 0)

  if (current >= limit) {
    const windowStart = type === "messages" ? usage.windowStart : usage.imageWindowStart
    const waitMs = resetMs > 0 ? Math.max(0, resetMs - (now - new Date(windowStart))) : 0
    const waitMins = waitMs > 0 ? Math.ceil(waitMs / 60000) : 0
    return { allowed: false, type, plan, waitMins, limit }
  }

  // Increment
  if (type === "messages") {
    usage.messagesUsed = (usage.messagesUsed || 0) + 1
    usage.totalMessages = (usage.totalMessages || 0) + 1
  } else {
    usage.imagesUsed = (usage.imagesUsed || 0) + 1
    usage.totalImages = (usage.totalImages || 0) + 1
  }
  usage.updatedAt = now
  await usage.save()

  return { allowed: true, used: current + 1, limit }
}

// Keep old sync function as fallback
function checkAndUpdateLimit(userId, plan, type) {
  const limits = planLimits[plan] || planLimits.free
  if (limits[type] === 999999) return { allowed: true }
  const key = userId.toString() + "_" + type
  const now = Date.now()
  const resetMs = limits.resetHours * 60 * 60 * 1000
  if (!rateLimitStore[key]) rateLimitStore[key] = { count: 0, windowStart: now, totalEver: 0 }
  const store = rateLimitStore[key]
  if (resetMs > 0 && resetMs < 999999 * 3600 * 1000 && now - store.windowStart > resetMs) {
    store.count = 0; store.windowStart = now
  }
  let limit = limits[type]
  // simple limit - no special free logic needed
  if (store.count >= limit) {
    const waitMs = resetMs > 0 && resetMs < 999999*3600*1000 ? resetMs-(now-store.windowStart) : 0
    return { allowed: false, type, plan, waitMins: waitMs>0?Math.ceil(waitMs/60000):0, limit }
  }
  store.count++; store.totalEver = (store.totalEver||0)+1
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
// Search cache — same query within 30s returns cached result (saves API calls)
const _searchCache = new Map()

// Monthly counter — stops search after 800 calls to prevent exhaustion
let _searchCount = 0
let _searchCountMonth = new Date().getMonth()

async function webSearch(query) {
  // Reset counter on new month
  const currentMonth = new Date().getMonth()
  if (currentMonth !== _searchCountMonth) {
    _searchCount = 0
    _searchCountMonth = currentMonth
  }

  // Monthly cap: skip search after 800 calls, fallback to LLM only
  if (_searchCount >= 800) {
    console.log("[SEARCH] Monthly cap reached (800). Skipping search.")
    return null
  }

  // Cache: return cached result if same query within 30 seconds
  const cacheKey = query.toLowerCase().trim()
  const cached = _searchCache.get(cacheKey)
  if (cached && (Date.now() - cached.ts) < 30000) {
    console.log("[SEARCH] Cache hit:", cacheKey.slice(0, 60))
    return cached.result
  }

  _searchCount++
  console.log("SEARCH USED:", query, "| Monthly count:", _searchCount)
  try {
    const key = process.env.TAVILY_API_KEY
    if (!key) { console.log("TAVILY_API_KEY missing - add it in Render env vars"); return null }

    const isFactual = ["father of","mother of","inventor of","founded by","who invented"].some(t => query.toLowerCase().includes(t))
    const finalQuery = isFactual ? query + " Wikipedia" : query
    console.log("[SEARCH] Query:", finalQuery)

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

    if (!response.ok) {
      console.log("[SEARCH] Tavily HTTP error:", response.status)
      return null
    }

    const data = await response.json()
    console.log("[SEARCH] Results:", data.results?.length, "Answer:", !!data.answer)

    // NUCLEAR SAFE: convert ANY value to plain string — no objects ever
    function toStr(val) {
      if (val === null || val === undefined) return ""
      if (typeof val === "string") return val
      if (typeof val === "number" || typeof val === "boolean") return String(val)
      if (Array.isArray(val)) return val.map(toStr).join(", ")
      if (typeof val === "object") {
        // Extract any string values from object
        return Object.values(val).map(toStr).filter(Boolean).join(" ")
      }
      return String(val)
    }

    // Clean a string — remove ALL JS artifacts
    function clean(v) {
      return toStr(v)
        .replace(/\[object Object\]/gi, "")
        .replace(/\[object object\]/gi, "")
        .replace(/undefined/g, "")
        .replace(/\s+/g, " ")
        .trim()
    }

    let lines = []

    // Direct answer (most important)
    if (data.answer) {
      const ans = clean(data.answer)
      if (ans) lines.push("ANSWER: " + ans)
    }

    // Each result as plain sentences
    if (Array.isArray(data.results)) {
      data.results.slice(0, 5).forEach((r, i) => {
        if (!r || typeof r !== "object") return
        const title   = clean(r.title).slice(0, 120)
        const content = clean(r.content).slice(0, 500)
        const url     = clean(r.url).slice(0, 100)
        if (title || content) {
          lines.push("SOURCE " + (i+1) + ": " + title)
          if (content) lines.push(content)
          if (url) lines.push("URL: " + url)
          lines.push("")
        }
      })
    }

    const result = lines.join("\n").trim()
    console.log("[SEARCH] Context length:", result.length)
    if (result.length > 50) console.log("[SEARCH] Preview:", result.slice(0, 200))

    // Store in cache
    const _cacheKey = finalQuery.toLowerCase().trim()
    _searchCache.set(_cacheKey, { result: result || null, ts: Date.now() })

    // Clean old cache entries (keep max 100)
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

  // Never search for these - AI knows them directly
  const noSearchPatterns = [
    /^what (is|are) (the )?(time|date|day|year)(\?|$)/,
    /^(what|tell me) (time|date|day)(\?|$)/,
    /^(current |today.?s )?(time|date)(\?|$)/,
    /^(hi|hello|hey|how are you|what can you do)(\?|$)/,
    /^(explain|define|describe|summarize|write|create|build|code|help me write)/,
  ]
  if (noSearchPatterns.some(p => p.test(msg))) return false

  const triggers = [
    // Current events
    "latest news","breaking news","today's news","today news","current news",
    "live score","current score","match score","match today","today match",
    "stock price","crypto price","bitcoin price","gold price","petrol price","share price",
    "weather in","weather today","forecast","temperature in",
    "who won","election result","election 2025","election 2026",
    "trending now","just happened","announced today",
    "released today","launched today","new movie","new song","box office",
    // War / conflict / geopolitics — LIVE search needed
    "war","attack","missile","strike","bomb","invasion","troops","soldier",
    "russia ukraine","israel","palestine","gaza","iran","nato","military",
    "conflict","ceasefire","airstrike","drone attack","nuclear","sanction",
    "pak","pakistan","border","loc","line of control","army operation",
    "india pakistan","india china","china taiwan","north korea",
    "terror attack","blast","explosion","hostage","coup",
    // Sports — catch ALL sports queries
    "ipl","cricket match","cricket score","cricket today",
    "world cup","t20","test match","odi match",
    "football match","nfl","nba","fifa","champions league","la liga",
    "today's match","today match","match schedule","match result",
    "playing today","playing tonight","live match","cricket news",
    "points table","standings","qualifier","playoff","final",
    // Factual
    "father of","mother of","inventor of","founded by","discovered by","invented by",
    "who invented","who discovered","who founded","who created","who wrote","who is the",
    "capital of","president of","prime minister of","population of",
    "tallest","longest","largest","smallest","fastest","richest","poorest",
    // Explicit search
    "search for","look up","find me","google this","news about",
    "what happened","what is happening","current","latest","recent","update","today",
    // Local
    "restaurant in","hotel in","hospital in","shops in","near me",
    // Telugu/Hindi transliterations for sports + war
    "ipl match","ఐపీఎల్","आईपीएल","క్రికెట్","cricket","మ్యాచ్","match",
    "ఇవాళ","today's ipl","today ipl","aaj ka match","aaj ipl",
    "యుద్ధం","war news","युद्ध","attack news","సమాచారం"
  ]
  if (triggers.some(t => msg.includes(t))) return true

  // Unicode sports keywords (Telugu, Hindi scripts)
  const unicodeSports = ["ఐపీఎల్","మ్యాచ్","క్రికెట్","आईपीएल","क्रिकेट","मैच"]
  if (unicodeSports.some(u => message.includes(u))) return true

  return false
}



// -- BROWSE URL (using Tavily extract) ----------------------------------------
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
    console.error("Browse URL error:", e.message)
    return null
  }
}

// -- SEND WHATSAPP (via CallMeBot - free) -------------------------------------
async function sendWhatsApp(phone, message) {
  try {
    const apiKey = process.env.CALLMEBOT_API_KEY
    if (!apiKey) {
      // Try Twilio WhatsApp sandbox
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
      return { success: false, error: "WhatsApp not configured. Add CALLMEBOT_API_KEY or TWILIO_WA_FROM to Render." }
    }
    // CallMeBot (free WhatsApp API)
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

// -- USER MEMORY HELPERS -------------------------------------------------------
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
    // Ask AI to extract memorable facts from conversation
    const extraction = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{
        role: "user",
        content: `Extract key facts about the user from this conversation that should be remembered for future sessions. Only extract clear personal facts (name, location, preferences, job, etc). Return as JSON array: [{"key": "user_name", "value": "John", "category": "personal"}]. If nothing to remember, return [].

User said: "${userMessage.substring(0, 500)}"
AI responded: "${aiResponse.substring(0, 200)}"

Return ONLY valid JSON array, nothing else.`
      }],
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
      if (facts.length > 0) console.log("Saved", facts.length, "memories for user")
    }
  } catch(e) {
    console.log("Memory extraction skipped:", e.message)
  }
}

// EMAIL SENDING (using Gmail SMTP - free)
async function sendVerificationEmail(email, token, username) {
  try {
    const GMAIL_USER = process.env.GMAIL_USER
    const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD
    if (!GMAIL_USER || !GMAIL_PASS) {
      console.log("Email not configured - skipping verification email")
      return false
    }
    const verifyUrl = FRONTEND_URL + "/verify-email.html?token=" + token
    const html = `
      <!DOCTYPE html>
      <html>
      <body style="background:#0a0a0a;color:white;font-family:Arial,sans-serif;padding:40px;max-width:500px;margin:0 auto;">
        <div style="text-align:center;margin-bottom:30px;">
          <h1 style="font-size:28px;background:linear-gradient(135deg,#00ff88,#00ccff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">DATTA AI</h1>
        </div>
        <h2 style="font-size:22px;margin-bottom:10px;">Verify your email</h2>
        <p style="color:#888;margin-bottom:24px;">Hi ${username}! Click the button below to verify your email address.</p>
        <a href="${verifyUrl}" style="display:block;text-align:center;padding:14px 32px;background:linear-gradient(135deg,#00cc6a,#00aaff);border-radius:12px;color:white;font-weight:700;font-size:16px;text-decoration:none;margin-bottom:20px;">Verify Email Address</a>
        <p style="color:#555;font-size:12px;text-align:center;">Link expires in 24 hours. If you didn't sign up, ignore this email.</p>
        <p style="color:#333;font-size:12px;text-align:center;margin-top:8px;">Or copy this link: ${verifyUrl}</p>
      </body>
      </html>
    `
    // Use nodemailer with Gmail
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
    console.log("Verification email sent to:", email)
    return true
  } catch(e) {
    console.log("Email send error:", e.message)
    return false
  }
}

// ── EMAIL SYSTEM ─────────────────────────────────────────────────────────────
// Primary: Zoho SMTP (admin@datta-ai.com)
// Fallback: Gmail SMTP
// All emails are non-blocking — app never fails due to email errors

const SUPPORT_EMAIL = "admin@datta-ai.com"
const APP_URL = "https://datta-ai.com"

// Simple in-memory rate limit: 1 email per user per 60s
const _emailRateStore = new Map()
function _checkEmailRate(key) {
  const now = Date.now()
  const last = _emailRateStore.get(key) || 0
  if (now - last < 60000) return false
  _emailRateStore.set(key, now)
  return true
}

function createZohoTransporter() {
  return nodemailer.createTransport({
    host: "smtp.zoho.in",
    port: 465,
    secure: true,
    auth: {
      user: process.env.ZOHO_USER || SUPPORT_EMAIL,
      pass: process.env.ZOHO_PASS
    },
    tls: { rejectUnauthorized: false }
  })
}

function createGmailTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  })
}

// Universal send — tries Zoho first, falls back to Gmail, never throws
async function sendEmail({ to, subject, html }) {
  const from = `"Datta AI" <${process.env.ZOHO_USER || SUPPORT_EMAIL}>`
  const mailOptions = { from, to, subject, html }

  // Try Zoho first
  if (process.env.ZOHO_USER && process.env.ZOHO_PASS) {
    try {
      await createZohoTransporter().sendMail(mailOptions)
      console.log("[EMAIL] Sent via Zoho to:", to, "| Subject:", subject)
      return true
    } catch(e) {
      console.warn("[EMAIL] Zoho failed:", e.message, "— trying Gmail fallback")
    }
  }
  // Fallback to Gmail
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    try {
      const gMail = { ...mailOptions, from: `"Datta AI" <${process.env.GMAIL_USER}>` }
      await createGmailTransporter().sendMail(gMail)
      console.log("[EMAIL] Sent via Gmail to:", to, "| Subject:", subject)
      return true
    } catch(e) {
      console.warn("[EMAIL] Gmail also failed:", e.message)
    }
  }
  console.warn("[EMAIL] No email sent — configure ZOHO_USER/ZOHO_PASS or GMAIL_USER/GMAIL_APP_PASSWORD")
  return false
}

// ── EMAIL TEMPLATES ───────────────────────────────────────────────────────────
function emailBase(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#f0f2f5;font-family:Arial,Helvetica,sans-serif;}
  .wrap{max-width:540px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);}
  .header{background:#0a0a0a;padding:28px 36px;text-align:center;}
  .logo{font-size:22px;font-weight:800;color:#00ff88;letter-spacing:2px;}
  .tagline{font-size:11px;color:#555;letter-spacing:1px;margin-top:4px;}
  .body{padding:32px 36px;}
  .footer{background:#f8f8f8;padding:16px 36px;text-align:center;border-top:1px solid #eee;}
  .footer p{font-size:11px;color:#999;margin:0;}
  .footer a{color:#00aa66;text-decoration:none;}
  h2{font-size:20px;font-weight:700;color:#111;margin:0 0 12px;}
  p{font-size:14px;color:#555;line-height:1.7;margin:0 0 14px;}
  .btn{display:inline-block;padding:13px 28px;background:#10a37f;border-radius:10px;color:#fff;font-weight:700;font-size:14px;text-decoration:none;margin:8px 0;}
  .info-box{background:#f8fff9;border:1px solid #d0f0e0;border-radius:10px;padding:16px 20px;margin:16px 0;}
  .info-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e8f5ee;font-size:13px;}
  .info-row:last-child{border-bottom:none;}
  .info-key{color:#888;}
  .info-val{color:#111;font-weight:600;}
  .support-box{background:#fff8f0;border:1px solid #ffe0b2;border-radius:10px;padding:14px 18px;margin:16px 0;font-size:13px;color:#555;}
</style>
</head>
<body>
<div style="padding:24px 16px;">
<div class="wrap">
  <div class="header">
    <div class="logo">DATTA AI</div>
    <div class="tagline">YOUR INTELLIGENT ASSISTANT</div>
  </div>
  <div class="body">${bodyHtml}</div>
  <div class="footer">
    <p>© 2026 Datta AI &nbsp;·&nbsp; <a href="${APP_URL}">${APP_URL}</a></p>
    <p style="margin-top:4px;">Need help? Email us at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
  </div>
</div>
</div>
</body></html>`
}

function welcomeEmailHtml(name) {
  return emailBase(`
    <h2>Welcome to Datta AI, ${name}! 👋</h2>
    <p>We're glad you're here. Datta AI is your intelligent assistant — built for Indian users, supporting Telugu, Hindi, Tamil and more.</p>
    <p>Here's what you can do right now:</p>
    <div class="info-box">
      <div class="info-row"><span class="info-key">💬 Chat</span><span class="info-val">Ask anything in your language</span></div>
      <div class="info-row"><span class="info-key">🎙 Voice</span><span class="info-val">Speak naturally, AI responds</span></div>
      <div class="info-row"><span class="info-key">📚 Learn</span><span class="info-val">GK, History, Current Affairs</span></div>
      <div class="info-row"><span class="info-key">💻 Code</span><span class="info-val">Datta 5.4 for coding tasks</span></div>
    </div>
    <p>Your free plan includes <strong>10 messages/day</strong> with Datta 2.1, plus 2 Datta 5.4 messages daily.</p>
    <a href="${APP_URL}" class="btn">Start Chatting →</a>
    <div class="support-box">
      📧 Any questions? Reach us at <strong>${SUPPORT_EMAIL}</strong>
    </div>
  `)
}

function subscriptionEmailHtml(name, plan, price, billing, nextDate) {
  const planEmoji = { free:"🌱", starter:"🚀", plus:"⚡", pro:"🔥", ultimate:"👑", "ultra-mini":"⚡" }[plan] || "⭐"
  const planName = plan.charAt(0).toUpperCase() + plan.slice(1)
  return emailBase(`
    <h2>${planEmoji} Subscription Activated!</h2>
    <p>Hi <strong>${name}</strong>, your payment was successful. You now have full access to your new plan.</p>
    <div class="info-box">
      <div class="info-row"><span class="info-key">Plan</span><span class="info-val">${planEmoji} Datta AI ${planName}</span></div>
      <div class="info-row"><span class="info-key">Amount</span><span class="info-val">₹${price}</span></div>
      <div class="info-row"><span class="info-key">Billing</span><span class="info-val">${billing}</span></div>
      <div class="info-row"><span class="info-key">Next renewal</span><span class="info-val">${nextDate}</span></div>
      <div class="info-row"><span class="info-key">Status</span><span class="info-val" style="color:#10a37f;">✓ Active</span></div>
    </div>
    <p>You can manage your subscription anytime from <strong>Settings → Plan</strong> in the app.</p>
    <a href="${APP_URL}" class="btn">Open Datta AI →</a>
    <div class="support-box">
      📧 Questions about billing? Contact us at <strong>${SUPPORT_EMAIL}</strong>
    </div>
  `)
}

function passwordResetEmailHtml(name, resetUrl) {
  return emailBase(`
    <h2>Reset your password</h2>
    <p>Hi <strong>${name}</strong>, we received a request to reset your Datta AI password.</p>
    <p>Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
    <a href="${resetUrl}" class="btn">Reset Password →</a>
    <p style="font-size:12px;color:#aaa;margin-top:16px;">If you didn't request this, ignore this email. Your password won't change.</p>
    <div class="support-box">
      📧 Need help? Contact us at <strong>${SUPPORT_EMAIL}</strong>
    </div>
  `)
}

// POST /send — send welcome email to a user
app.post("/send", async (req, res) => {
  try {
    const { name, email } = req.body

    // Input validation
    if (!name || typeof name !== "string" || name.trim().length < 1) {
      return res.status(400).json({ error: "Name is required" })
    }
    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: "Valid email is required" })
    }

    const cleanName  = name.trim().slice(0, 100)
    const cleanEmail = email.trim().toLowerCase()

    // Rate limit by IP
    const ip = req.ip || req.connection?.remoteAddress || "unknown"
    if (!_checkEmailRate(ip)) {
      return res.status(429).json({ error: "Please wait before sending another request" })
    }

    // Check Zoho credentials
    if (!process.env.ZOHO_USER || !process.env.ZOHO_PASS) {
      console.log("[EMAIL] ZOHO_USER or ZOHO_PASS not set in env vars")
      return res.status(500).json({ error: "Email service not configured" })
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#0a0a0a;border-radius:16px;overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="padding:32px 40px 24px;text-align:center;border-bottom:1px solid #1a1a1a;">
            <h1 style="margin:0;font-size:26px;background:linear-gradient(135deg,#00ff88,#00ccff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:2px;">DATTA AI</h1>
            <p style="margin:8px 0 0;color:#555;font-size:12px;letter-spacing:1px;">YOUR INTELLIGENT ASSISTANT</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px 40px;">
            <p style="color:#fff;font-size:18px;margin:0 0 16px;">Hi <strong style="color:#00ff88;">${cleanName}</strong>,</p>
            <p style="color:#aaa;font-size:14px;line-height:1.7;margin:0 0 16px;">
              Thank you for contacting <strong style="color:#fff;">Datta AI</strong>.<br>
              We have received your message and will get back to you shortly.
            </p>
            <p style="color:#aaa;font-size:14px;line-height:1.7;margin:0 0 24px;">
              In the meantime, feel free to explore Datta AI and start chatting with our AI assistant.
            </p>
            <a href="https://datta-ai.com" style="display:inline-block;padding:13px 28px;background:linear-gradient(135deg,#00cc6a,#00aaff);border-radius:10px;color:#fff;font-weight:700;font-size:14px;text-decoration:none;letter-spacing:0.5px;">
              Visit Datta AI →
            </a>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #1a1a1a;text-align:center;">
            <p style="color:#333;font-size:11px;margin:0;">© 2026 Datta AI · <a href="https://datta-ai.com" style="color:#555;text-decoration:none;">datta-ai.com</a></p>
            <p style="color:#222;font-size:11px;margin:6px 0 0;">Best regards, <strong style="color:#444;">Datta AI Team</strong></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

    const transporter = createZohoTransporter()
    await transporter.sendMail({
      from: '"Datta AI" <' + process.env.ZOHO_USER + '>',
      to: cleanEmail,
      subject: "Welcome to Datta AI",
      html
    })

    console.log("[EMAIL] Welcome email sent to:", cleanEmail, "name:", cleanName)
    res.json({ success: true, message: "Email sent successfully" })

  } catch(err) {
    console.error("[EMAIL] Send error:", err.message)
    res.status(500).json({ error: "Failed to send email. Please try again." })
  }
})

// ── HEALTH CHECK ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.json({ status: "ok", service: "Datta AI Server", version: "2.0" }))
app.get("/ping", (req, res) => res.json({ pong: true, time: new Date().toISOString() }))
app.get("/health", (req, res) => res.json({ status: "ok", db: mongoose.connection.readyState === 1 ? "connected" : "disconnected" }))

// GOOGLE OAUTH
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

// AUTH ROUTES
app.post("/auth/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body
    if (!username || !email || !password) return res.status(400).json({ error: "All fields required" })
    if (username.length < 3) return res.status(400).json({ error: "Username min 3 characters" })
    if (password.length < 6) return res.status(400).json({ error: "Password min 6 characters" })
    const existing = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username }] })
    if (existing) return res.status(400).json({ error: existing.username === username ? "Username taken" : "Email already registered" })

    // Generate verify token
    const verifyToken = crypto.randomBytes(32).toString("hex")
    const user = await User.create({
      username,
      email: email.toLowerCase(),
      password: await bcrypt.hash(password, 10),
      emailVerified: false,
      verifyToken,
      verifyTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000)
    })

    // Send verification email (non-blocking)
    sendVerificationEmail(email.toLowerCase(), verifyToken, username).catch(() => {})
    // Send welcome email (non-blocking — app never waits for this)
    sendEmail({
      to: email.toLowerCase(),
      subject: "Welcome to Datta AI 👋",
      html: welcomeEmailHtml(username)
    }).catch(() => {})

    // Return token - user can use app but email unverified
    res.json({
      token: generateToken(user),
      user: { id: user._id, username: user.username, email: user.email, emailVerified: false },
      message: "Account created! Please check your email to verify your account."
    })
  } catch(err) { res.status(500).json({ error: "Server error" }) }
})

// VERIFY EMAIL
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

// RESEND VERIFICATION EMAIL
app.post("/auth/resend-verification", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
    if (!user) return res.status(404).json({ error: "User not found" })
    if (user.emailVerified) return res.json({ message: "Email already verified!" })
    const verifyToken = crypto.randomBytes(32).toString("hex")
    await User.findByIdAndUpdate(user._id, {
      verifyToken,
      verifyTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000)
    })
    await sendVerificationEmail(user.email, verifyToken, user.username)
    res.json({ success: true, message: "Verification email sent!" })
  } catch(err) { res.status(500).json({ error: "Server error" }) }
})

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: "Email and password required" })
    
    // Try exact email match first, then case-insensitive
    let user = await User.findOne({ email: email.toLowerCase().trim() })
    if (!user) user = await User.findOne({ email: { $regex: new RegExp("^" + email.trim() + "$", "i") } })
    
    if (!user) return res.status(400).json({ error: "No account found with this email. Please sign up first." })
    
    // If Google account with no password - auto set the provided password
    if (!user.password) {
      const hashed = await bcrypt.hash(password, 10)
      await User.findByIdAndUpdate(user._id, { password: hashed })
      user.password = hashed
      console.log("Set password for Google account:", user.email)
    }
    
    const match = await bcrypt.compare(password, user.password)
    if (!match) return res.status(400).json({ error: "Wrong password. Please check and try again." })

    // Send login alert email — fire and forget, never block login
    sendLoginAlertEmail(user.email, user.username || "User").catch(() => {})

    res.json({ 
      token: generateToken(user), 
      user: { id: user._id, username: user.username, email: user.email, emailVerified: user.emailVerified }
    })
  } catch(err) { 
    console.error("Login error:", err)
    res.status(500).json({ error: "Server error. Please try again." }) 
  }
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
    res.status(500).json({ error: sanitizeError(err).userMsg })
  }
})

// Google OAuth routes — only register if credentials are configured
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  app.get("/auth/google", passport.authenticate("google", { scope: ["profile","email"] }))
  app.get("/auth/google/callback",
    passport.authenticate("google", { session: false, failureRedirect: FRONTEND_URL + "/login.html?error=google_failed" }),
    (req, res) => {
      sendLoginAlertEmail(req.user.user.email, req.user.user.username || "User").catch(() => {})
      res.redirect(FRONTEND_URL + "/login.html?token=" + req.user.token)
    }
  )
  console.log("[AUTH] Google OAuth enabled")
} else {
  // Google OAuth not configured — return friendly error instead of crashing
  app.get("/auth/google", (req, res) => {
    res.redirect(FRONTEND_URL + "/login.html?error=google_not_configured")
  })
  app.get("/auth/google/callback", (req, res) => {
    res.redirect(FRONTEND_URL + "/login.html?error=google_not_configured")
  })
  console.log("[AUTH] Google OAuth disabled — GOOGLE_CLIENT_ID not set")
}

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

// SUBSCRIPTION ROUTES
app.get("/payment/subscription", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id
    const sub = await Subscription.findOne({ userId, active: true })
    let plan = sub ? sub.plan : "free"

    // Auto-expire ultra-mini if 24h passed
    if (plan === "ultra-mini" && sub && sub.ultraMiniExpiry) {
      if (new Date() > new Date(sub.ultraMiniExpiry)) {
        const revertPlan = sub.previousPlan || "free"
        await Subscription.findOneAndUpdate({ userId }, { plan: revertPlan, extraMessages: 0 })
        plan = revertPlan
        console.log("[SUBSCRIPTION] ultra-mini expired, reverted to:", revertPlan)
      }
    }

    // Also auto-expire monthly/yearly plans past endDate
    if (sub && sub.endDate && plan !== "free" && plan !== "ultra-mini") {
      if (new Date() > new Date(sub.endDate)) {
        await Subscription.findOneAndUpdate({ userId }, { plan: "free", active: false })
        plan = "free"
        console.log("[SUBSCRIPTION] plan expired, reverted to free")
      }
    }

    res.json({
      plan,
      period: sub?.period || "monthly",
      endDate: sub?.endDate || null,
      ultraMiniExpiry: sub?.ultraMiniExpiry || null,
      limits: planLimits[plan] || planLimits.free
    })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

// Current day usage for logged-in user
app.get("/payment/usage", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id
    const sub    = await Subscription.findOne({ userId, active: true }).catch(() => null)
    let plan     = sub ? sub.plan : "free"

    // Auto-expire ultra-mini
    if (plan === "ultra-mini" && sub && sub.ultraMiniExpiry) {
      if (new Date() > new Date(sub.ultraMiniExpiry)) {
        plan = sub.previousPlan || "free"
      }
    }
    // Auto-expire monthly plans
    if (sub && sub.endDate && plan !== "free" && plan !== "ultra-mini") {
      if (new Date() > new Date(sub.endDate)) plan = "free"
    }

    const limits  = planLimits[plan] || planLimits.free
    const usage   = await Usage.findOne({ userId }).catch(() => null)
    const now     = Date.now()
    const resetMs = limits.resetHours * 60 * 60 * 1000
    let used = 0
    if (usage) {
      const expired = resetMs > 0 && (now - new Date(usage.windowStart).getTime()) > resetMs
      used = expired ? 0 : (usage.messagesUsed || 0)
    }
    console.log("[USAGE] userId:", userId, "plan:", plan, "used:", used, "limit:", limits.messages)
    res.json({ used, limit: limits.messages, plan })
  } catch(err) {
    console.error("[USAGE ERROR]", err.message)
    res.status(500).json({ error: sanitizeError(err).userMsg })
  }
})

app.post("/payment/activate", authMiddleware, async (req, res) => {
  try {
    const { plan, method, paymentId, period } = req.body
    const validPlans = ["free","ultra-mini","starter","standard","plus","pro","ultimate","mini","max","ultramax","basic","enterprise"]
    if (!validPlans.includes(plan)) return res.status(400).json({ error: "Invalid plan" })
    const now = new Date()
    const endDate = new Date(now)
    endDate.setMonth(endDate.getMonth() + (period === "yearly" ? 12 : 1))
    await Subscription.findOneAndUpdate({ userId: req.user.id }, { plan, period, paymentId, method, startDate: now, endDate, active: true }, { upsert: true, new: true })
    res.json({ success: true, plan, endDate })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

// Send Razorpay key to frontend safely
app.get("/payment/razorpay-key", authMiddleware, (req, res) => {
  const key = process.env.RAZORPAY_KEY_ID
  if (!key) return res.status(400).json({ error: "Razorpay not configured" })
  res.json({ key })
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
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

// RAZORPAY VERIFY
app.post("/payment/razorpay-verify", authMiddleware, async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, plan, period } = req.body
    const key_secret = process.env.RAZORPAY_KEY_SECRET
    if (!key_secret) return res.status(400).json({ error: "Razorpay not configured" })
    const expectedSig = crypto.createHmac("sha256", key_secret).update(razorpay_order_id + "|" + razorpay_payment_id).digest("hex")
    if (expectedSig !== razorpay_signature) return res.status(400).json({ error: "Payment verification failed" })
    const endDate = new Date()
    endDate.setMonth(endDate.getMonth() + (period === "yearly" ? 12 : 1))
    const existingSub = await Subscription.findOne({ userId: req.user.id }).catch(() => null)
    const prevPlan = existingSub?.plan || "free"
    await Subscription.findOneAndUpdate(
      { userId: req.user.id },
      { plan, previousPlan: prevPlan, period, paymentId: razorpay_payment_id, orderId: razorpay_order_id, method: "razorpay", startDate: new Date(), endDate, active: true },
      { upsert: true, new: true }
    )
    // Reset daily usage on new plan activation
    await Usage.findOneAndUpdate({ userId: req.user.id }, { messagesUsed: 0, windowStart: new Date() }).catch(() => {})
    // Send subscription success email (non-blocking)
    try {
      const paidUser = await User.findById(req.user.id).select("username email").catch(() => null)
      if (paidUser && paidUser.email) {
        const planPrices = { starter:29, plus:299, pro:499, ultimate:799, standard:149, mini:199, max:1999 }
        const price = planPrices[plan] || amount || 0
        const billing = period === "yearly" ? "Yearly" : "Monthly"
        const nextStr = endDate ? new Date(endDate).toLocaleDateString("en-IN", { day:"numeric", month:"long", year:"numeric" }) : "30 days"
        sendEmail({
          to: paidUser.email,
          subject: "Your Datta AI subscription is active ✅",
          html: subscriptionEmailHtml(paidUser.username || "there", plan, price, billing, nextStr)
        }).catch(() => {})
      }
    } catch(emailErr) { console.warn("[EMAIL] Subscription email error:", emailErr.message) }

    res.json({ success: true, plan, endDate })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

// ULTRA-MINI ORDER — ₹10, adds 15 messages valid 24h
app.post("/payment/ultra-mini-order", authMiddleware, async (req, res) => {
  try {
    const key_id = process.env.RAZORPAY_KEY_ID
    const key_secret = process.env.RAZORPAY_KEY_SECRET
    if (!key_id || !key_secret) return res.status(400).json({ error: "Razorpay not configured" })
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Basic " + Buffer.from(key_id + ":" + key_secret).toString("base64") },
      body: JSON.stringify({ amount: 1000, currency: "INR", receipt: "ultra_mini_" + Date.now() })
    })
    const order = await response.json()
    if (!response.ok) return res.status(400).json({ error: order.error?.description || "Order creation failed" })
    res.json({ orderId: order.id, keyId: key_id, amount: 10, plan: "ultra-mini" })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

// ULTRA-MINI VERIFY — verify payment + activate 15 extra messages for 24h
app.post("/payment/ultra-mini-verify", authMiddleware, async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body
    const key_secret = process.env.RAZORPAY_KEY_SECRET
    if (!key_secret) return res.status(400).json({ error: "Razorpay not configured" })
    const expectedSig = crypto.createHmac("sha256", key_secret).update(razorpay_order_id + "|" + razorpay_payment_id).digest("hex")
    if (expectedSig !== razorpay_signature) return res.status(400).json({ error: "Payment verification failed" })

    const userId = req.user.id
    // Get current plan to save as previousPlan
    const existing = await Subscription.findOne({ userId }).catch(() => null)
    const previousPlan = existing?.plan || "free"

    const now = new Date()
    const ultraMiniExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000)  // 24 hours

    await Subscription.findOneAndUpdate(
      { userId },
      {
        plan: "ultra-mini",
        previousPlan,
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        method: "razorpay",
        startDate: now,
        ultraMiniExpiry,
        extraMessages: 15,
        active: true
        // endDate stays as-is (existing plan expiry preserved)
      },
      { upsert: true, new: true }
    )

    // Add 15 to their today's limit in Usage
    await Usage.findOneAndUpdate(
      { userId },
      { $inc: { /* add to limit tracking */ } },
      { upsert: true }
    ).catch(() => {})

    // Send ultra-mini confirmation email (non-blocking)
    try {
      const paidUser = await User.findById(userId).select("username email").catch(() => null)
      if (paidUser && paidUser.email) {
        const expiryStr = ultraMiniExpiry.toLocaleString("en-IN", { hour:"2-digit", minute:"2-digit", day:"numeric", month:"short" })
        sendEmail({
          to: paidUser.email,
          subject: "Datta AI: +15 bonus messages added ⚡",
          html: subscriptionEmailHtml(paidUser.username || "there", "ultra-mini", 10, "One-time top-up", expiryStr + " (24h)")
        }).catch(() => {})
      }
    } catch(emailErr) { console.warn("[EMAIL] Ultra-mini email error:", emailErr.message) }

    res.json({ success: true, plan: "ultra-mini", extraMessages: 15, expiresAt: ultraMiniExpiry })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
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
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
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
    let userPlan = sub ? sub.plan : "free"

    // Auto-expire ultra-mini in chat route too
    if (userPlan === "ultra-mini" && sub && sub.ultraMiniExpiry) {
      if (new Date() > new Date(sub.ultraMiniExpiry)) {
        userPlan = sub.previousPlan || "free"
        Subscription.findOneAndUpdate({ userId }, { plan: userPlan, extraMessages: 0 }).catch(() => {})
      }
    }

    const userIsAdmin = isAdmin(req)
    if (userIsAdmin) userPlan = "ultramax"   // admin bypasses all limits

    // ── ABUSE CHECKS (run before any DB/AI work) ─────────────────────────────
    if (!userIsAdmin) {

      // 1. Input length limit — reject messages over 4000 chars
      if (message && message.length > 4000) {
        return res.status(400).json({ error: "INPUT_TOO_LONG", message: "Message too long. Max 4000 characters." })
      }

      // 2. Per-minute rate limit — anti-spam
      if (!checkMinuteRate(userId)) {
        return res.status(429).json({ error: "RATE_LIMIT", message: "Too many requests. Please slow down." })
      }

      // 3. Duplicate message guard — same text within 2 seconds
      if (message && isDuplicateMessage(userId, message)) {
        return res.status(429).json({ error: "DUPLICATE_REQUEST", message: "Duplicate message detected." })
      }

      // 4. One active request per user
      if (activeRequests.has(userId)) {
        return res.status(429).json({ error: "REQUEST_IN_PROGRESS", message: "Please wait for the current response to finish." })
      }
    }

    // Mark user as active
    activeRequests.set(userId, true)

    // Cleanup function — always called when request ends
    function cleanupRequest() {
      activeRequests.delete(userId)
      userStreamControllers.delete(userId)
    }

    // Cleanup on client disconnect
    res.on("close", cleanupRequest)

    if (false) {
      // Image generation removed
    } else {
      if (!userIsAdmin) {
        const msgCheck = await checkAndUpdateLimitDB(userId, userPlan, "messages")
        if (!msgCheck.allowed) {
          const waitMins = msgCheck.waitMins || 0
          const msg = waitMins > 0
            ? `You've reached your message limit. Resets in ${Math.ceil(waitMins)} minutes.`
            : "You've reached your message limit. Upgrade to continue."
          cleanupRequest()  // release lock
          return res.status(429).json({ 
            error: "MESSAGE_LIMIT", 
            message: msg,
            plan: userPlan, 
            waitMins: waitMins, 
            limit: msgCheck.limit 
          })
        }

        // ── MODEL ACCESS CONTROL ────────────────────────────────────────────
        const requestedModelKey = req.body.modelKey || "d21"
        const planConfig = planLimits[userPlan] || planLimits.free
        const allowedModels = planConfig.models

        // Free plan special case: allow 2 Datta 5.4 messages per day
        if (userPlan === "free" && requestedModelKey === "d54") {
          const usageDoc = await Usage.findOne({ userId }).catch(() => null)
          const now = new Date()
          const resetMs = 24 * 60 * 60 * 1000
          let freeD54Used = 0
          let freeD54Start = now

          if (usageDoc) {
            const expired = now - new Date(usageDoc.freeD54WindowStart || now) > resetMs
            freeD54Used = expired ? 0 : (usageDoc.freeD54Used || 0)
            freeD54Start = expired ? now : (usageDoc.freeD54WindowStart || now)
          }

          if (freeD54Used >= 2) {
            // Free d54 limit hit
            cleanupRequest()
            return res.status(403).json({
              error: "MODEL_LOCKED",
              message: "You've used your 2 free Datta 5.4 messages for today. Upgrade to Starter (₹29) for more.",
              plan: "free",
              requiredPlan: "starter",
              freeD54Remaining: 0
            })
          }
          // Increment free d54 count
          await Usage.findOneAndUpdate(
            { userId },
            { freeD54Used: freeD54Used + 1, freeD54WindowStart: freeD54Start, updatedAt: now },
            { upsert: true }
          ).catch(() => {})
          // Allow the request to proceed with d54
        } else if (!allowedModels.includes("all") && !allowedModels.includes(requestedModelKey)) {
          // Paid plan model check
          let upgradeTo = "Starter"
          if (requestedModelKey === "d54") {
            upgradeTo = "Starter"
          }
          cleanupRequest()
          return res.status(403).json({
            error: "MODEL_LOCKED",
            message: `Upgrade to ${upgradeTo} plan (₹29/month) to use Datta 5.4.`,
            plan: userPlan,
            requiredPlan: upgradeTo.toLowerCase()
          })
        }
      }
    }

    let chat = null
    if (chatId && chatId !== "" && chatId !== "null" && chatId !== "undefined") {
      try { chat = await Chat.findOne({ _id: chatId, userId }).lean() } catch(e) { chat = null }
      // .lean() returns plain JS objects — no Mongoose DocumentArray issues
      // BUT lean() makes it read-only, so we need to save differently
      if (chat) {
        // lean() gave us plain JS — extract clean string messages NOW
        var leanMsgs = (chat.messages || []).map(function(m) {
          var c = m.content
          var str
          if (typeof c === 'string') {
            str = c
          } else {
            try {
              var p = JSON.parse(JSON.stringify(c))
              if (Array.isArray(p)) {
                str = p.filter(function(x){return x&&x.type==='text'}).map(function(x){return x.text||''}).join(' ').trim()
                // if still has image data, blank it
                if (!str) str = '[image]'
              } else if (p && typeof p === 'object') {
                str = p.text || p.content || ''
              } else {
                str = String(p||'')
              }
            } catch(e) { str = '' }
          }
          // Hard block: never let base64 image data into history
          if (str.indexOf('data:image') !== -1 || str.indexOf('data:application') !== -1 || str.length > 12000) {
            str = '[image message]'
          }
          return { role: m.role, content: str }
        })
        // Re-fetch as full Mongoose document for saving
        var fullChat = await Chat.findOne({ _id: chatId, userId })
        if (fullChat) {
          chat = fullChat
          chat._leanMessages = leanMsgs  // use the clean lean messages
        }
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
    res.setHeader("X-Accel-Buffering", "no")  // tells nginx/Render: do NOT buffer
    res.setHeader("Connection", "keep-alive")
    res.flushHeaders()  // send headers immediately, open the stream



    // BROWSE URL - if message contains a URL
    let urlContext = ""
    const urlMatch = message && message.match(/https?:\/\/[^\s]+/)
    if (urlMatch && process.env.TAVILY_API_KEY) {
      const urlResult = await browseUrl(urlMatch[0])
      if (urlResult) {
        urlContext = "\n\n[WEBSITE CONTENT from " + urlResult.url + "]:\n" + urlResult.content.substring(0, 4000) + "\n[End Website Content]"
        console.log("Browsed URL:", urlMatch[0])
      }
    }

    // WHATSAPP - detect send whatsapp request
    const waMatch = message && message.toLowerCase().match(/send whatsapp to ([+\d]+)[,:]?\s*(.+)/i)
    if (waMatch) {
      const waPhone = waMatch[1]
      const waMsg = waMatch[2]
      const waResult = await sendWhatsApp(waPhone, waMsg)
      const waResponse = waResult.success
        ? "WhatsApp message sent to " + waPhone + "!"
        : "Failed to send WhatsApp: " + waResult.error
      res.write(waResponse)
      chat.messages.push({ role: "assistant", content: waResponse })
      await chat.save()
      res.write("CHATID" + chat._id)
      res.end()
      return
    }

    // LOAD USER MEMORY
    const memoryContext = req.user.isGuest ? "" : await getMemories(userId).catch(() => "")

    // WEB SEARCH
    let searchContext = ""
    const isLocalQuery = message && ["restaurant","hotel","shop","cafe","food","near","place","hospital","pharmacy","atm","bank","cinema","mall","park"].some(t => message.toLowerCase().includes(t))
    const shouldSearch = message && !urlContext && (needsWebSearch(message) || (isLocalQuery && userLocation))
    
    if (shouldSearch && process.env.TAVILY_API_KEY) {
      let searchQuery = message

      // For IPL/cricket queries — always search in English regardless of input language
      var msgLow = message.toLowerCase()
      var isIPL = msgLow.includes("ipl") || message.includes("ఐపీఎల్") ||
                    message.includes("आईपीएल") || msgLow.includes("cricket") ||
                    message.includes("క్రికెట్") || message.includes("क्रिकेट")
      if (isIPL) {
        var now = new Date()
        var dd   = now.getDate()
        var mm   = now.toLocaleString("en-US", { month:"long" })
        var yyyy = now.getFullYear()
        // Search for today AND upcoming - so AI can give next match if none today
        searchQuery = "IPL " + yyyy + " schedule today " + dd + " " + mm + " upcoming matches next match"
        console.log("[IPL SEARCH] Query:", searchQuery)
      }

      // For local queries, add location
      if (isLocalQuery && userLocation) {
        searchQuery = message + " " + userLocation + " India"
      }

      console.log("[SEARCH] Calling Tavily for:", searchQuery)
      var results = await webSearch(searchQuery)
      if (results) {
        searchContext = "\n\n[Web Search Results]\n" + results + "\n[End of Search Results]"
        console.log("[SEARCH] Got results, length:", results.length)
        console.log("[SEARCH] First 300 chars:", results.substring(0, 300))
      } else {
        console.log("[SEARCH] No results returned")
      }
    }

    // Use fewer history messages to save token budget
    var _msgLow = (message || "").toLowerCase()
    var _isCode = ["build","create","write","make","code","website","app","fix","debug","html","python","javascript"].some(k => _msgLow.includes(k))
    var historyLimit = isImageFile ? 0 : (_isCode ? 2 : 4)  // No history for images — wastes tokens
    // Context limit — large page pastes cause 413/context_length errors
    // Reduce history when message itself is long
    var msgLen = (message || "").length
    var historyContentLimit = _isCode ? 800 : msgLen > 2000 ? 400 : msgLen > 1000 ? 800 : 1500
    // Use plain JS messages (stripped of Mongoose types)
    var rawMessages = (chat._leanMessages || chat.messages || [])
    // Detect if this is the FIRST message in this chat (no prior assistant replies)
    var priorMessages = rawMessages.slice(0, -1)  // everything before current user message
    var isFirstMessage = priorMessages.filter(m => m.role === "assistant").length === 0
    var history = priorMessages.slice(-historyLimit)
      .map(m => {
        // Convert content to plain string no matter what type it is
        var raw = m.content
        var str
        if (typeof raw === "string") {
          str = raw
        } else {
          // Serialize to kill all Mongoose types, then extract text
          try {
            var plain = JSON.parse(JSON.stringify(raw))
            if (Array.isArray(plain)) {
              str = plain.filter(p => p && p.type === "text").map(p => String(p.text||"")).join(" ").trim() || "[image]"
            } else if (plain && typeof plain === "object") {
              str = plain.text || plain.content || JSON.stringify(plain)
            } else {
              str = String(plain || "")
            }
          } catch(e) { str = "[message]" }
        }
        return {
          role: m.role === "assistant" ? "assistant" : "user",
          content: str.substring(0, historyContentLimit)
        }
      })
      .filter(m => !m.content.includes("data:image") && !m.content.includes("data:application"))
    var isImageFile = file && file.mimetype?.startsWith("image/")
    console.log("[IMAGE DEBUG] file:", !!file, "mimetype:", file?.mimetype, "isImageFile:", isImageFile, "message:", (message||"").slice(0,40))

    // Detect if uploaded image is a question paper / exam paper
    var isQuestionPaper = isImageFile && (
      !message ||  // no message = user just uploaded image wanting answers
      ["question", "paper", "exam", "solve", "answer", "answers", "solution",
       "marks", "mark", "mcq", "fill in", "define", "explain all", "answer all",
       "question paper", "test paper", "assignment", "homework", "worksheet",
       "solve this", "give answers", "all answers", "complete answers",
       "1 mark", "2 mark", "4 mark", "unit", "module", "semester"
      ].some(k => (message||"").toLowerCase().includes(k))
    )

    let userContent
    if (isImageFile) {
      var imgMsg = message || ""

      var imgPromptText
      if (isQuestionPaper) {
        imgPromptText = (imgMsg ? imgMsg + "\n\n" : "") +
          "You are solving this exam paper. Write the FULL answer for every question.\n\n" +
          "IMPORTANT — for EVERY question, even if it asks for a list or points, write the COMPLETE content:\n\n" +
          "For question 1d (four focused points) write like this:\n" +
          "1. Planning: (full explanation)\n" +
          "2. Organizing: (full explanation)\n" +
          "3. Directing: (full explanation)\n" +
          "4. Controlling: (full explanation)\n\n" +
          "For formulas write: Formula, then explain each symbol.\n" +
          "For definitions write: Definition sentence, then explain with example.\n" +
          "For graphs write: Describe X axis, Y axis, each curve, each stage with labels.\n" +
          "For types/kinds write each type with full explanation.\n\n" +
          "START ANSWERING NOW — begin with 1a and go through every question:"
      } else if (imgMsg) {
        imgPromptText = imgMsg
      } else {
        imgPromptText = "Please analyze this image thoroughly and help me."
      }

      userContent = [{ type: "text", text: imgPromptText + searchContext }, { type: "image_url", image_url: { url: "data:" + file.mimetype + ";base64," + file.buffer.toString("base64") } }]
      console.log("[IMAGE DEBUG] userContent built as array, parts:", userContent.length, "isQuestionPaper:", isQuestionPaper)
    } else if (file) {
      try {
        var isPDF = file.mimetype === "application/pdf" || file.originalname?.toLowerCase().endsWith(".pdf")
        
        if (isPDF) {
          let pdfText = ""
          try {
            // Use pdf-parse library for proper text extraction
            if (!pdfParse) throw new Error("pdf-parse not available")
            var pdfData = await pdfParse(file.buffer)
            pdfText = (pdfData.text || "").trim()
            console.log("PDF extracted:", pdfText.length, "chars, pages:", pdfData.numpages)
            // Limit to 12000 chars to fit in context
            if (pdfText.length > 12000) pdfText = pdfText.substring(0, 12000) + "\n...[truncated]"
          } catch(e) {
            console.log("pdf-parse failed:", e.message)
            // Fallback: extract readable ASCII text
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
            } catch(e2) {
              pdfText = ""
            }
          }

          if (!pdfText || pdfText.length < 20) {
            userContent = (message || "Please describe this PDF") + "\n\n[PDF: " + file.originalname + "]\n\nCould not extract text from this PDF. It may be scanned/image-based."
          } else {
            userContent = (message ? message + "\n\n" : "") +
              "[PDF: " + file.originalname + "]\n\nPDF CONTENT:\n" + pdfText
          }
        } else {
          // Text files - read as UTF-8
          var fileText = file.buffer.toString("utf-8").substring(0, 8000)
          userContent = (message ? message + "\n\n" : "") + 
            "[File: " + file.originalname + "]\n\n" + fileText
        }
      } catch(e) { 
        userContent = (message ? message + "\n\n" : "") + "[File: " + file.originalname + " - could not read content]"
      }
    } else {
      // searchContext goes in system (as context), not in user message
      userContent = message
    }

    var selectedModel = req.body.model || "llama-3.1-8b-instant"
    var validModels = [
      "llama-3.1-8b-instant",                          // Datta 2.1
      "llama-3.3-70b-versatile",                        // Datta 4.2
      "llama-3.3-70b-versatile",                                   // Datta 4.8
      "llama-3.3-70b-versatile",  // Datta 5.4 (fallback to 70b)
      "meta-llama/llama-4-scout-17b-16e-instruct",      // Datta Vision
      // Persona models
      "datta-1.1",
      "persona-lawyer","persona-teacher","persona-chef","persona-fitness",
      "persona-upsc","persona-student","persona-interview","persona-business"
    ]
    let chosenModel = validModels.includes(selectedModel) ? selectedModel : "llama-3.1-8b-instant"
    var modelKey = req.body.modelKey || "d21" // d21, d42, d48, d54

    // All models available on all plans
    var is48 = modelKey === "d48"
    var is54 = modelKey === "d54"
    // Map all models to valid Groq models
    // Datta 1.1 = llama-3.1-8b-instant used specifically for AI modes
    // All persona modes auto-use Datta 1.1 (fast, focused responses)
    // Model ID map - frontend sends short IDs, map to real Groq model IDs
    var modelMap = {
      // Datta models
      "datta-1.1":  "llama-3.1-8b-instant",
      "datta-2.1":  "llama-3.1-8b-instant",
      "datta-4.2":  "llama-3.3-70b-versatile",
      "datta-4.8":  "llama-3.3-70b-versatile",
      "datta-5.4":  "llama-3.3-70b-versatile",
      // Persona modes use Datta 1.1 (8b) or 4.2 (70b)
      "persona-lawyer":   "llama-3.1-8b-instant",
      "persona-teacher":  "llama-3.1-8b-instant",
      "persona-chef":     "llama-3.1-8b-instant",
      "persona-fitness":  "llama-3.1-8b-instant",
      "persona-upsc":     "llama-3.3-70b-versatile",
      "persona-student":  "llama-3.1-8b-instant",
      "persona-interview":"llama-3.1-8b-instant",
      "persona-business": "llama-3.3-70b-versatile"
    }
    // If frontend sends full Groq model ID directly, use as-is
    // If it sends a short name, map it
    let resolvedModel = modelMap[chosenModel] || chosenModel
    // model assigned after auto-switch logic below
    var useTogether = false
    var style = req.body.style || "Balanced"
    var ainame = req.body.ainame || "Datta AI"
    var styleNotes = {
      Short:    "\n\nSTYLE RULE — SHORT: Answer in maximum 3 sentences. Be direct. No extra info unless code is needed.",
      Detailed: "\n\nSTYLE RULE — DETAILED: Give a thorough complete response. Include examples, explanation, and context. Never cut short.",
      Formal:   "\n\nSTYLE RULE — FORMAL: Use formal professional language only. Structured paragraphs. No casual words.",
      Casual:   "\n\nSTYLE RULE — CASUAL: Respond like a friendly person texting a friend. Short sentences. Warm tone.",
      Technical:"\n\nSTYLE RULE — TECHNICAL: Use exact technical terms, numbers, and precise details. No vague explanations.",
      Creative: "\n\nSTYLE RULE — CREATIVE: Be imaginative. Use analogies, stories, and interesting examples to explain.",
      Simple:   "\n\nSTYLE RULE — SIMPLE: Use very simple words. Explain like teaching a 10-year-old. Zero jargon.",
      Balanced: "\n\nSTYLE RULE — BALANCED: Give a complete clear answer with a good explanation. Use examples when they help."
    }
    // Auto-detect language from user's actual message Unicode script
    function detectInputLanguage(text) {
      if (!text) return null
      // Indian scripts — ordered by unicode range
      if (/[ఀ-౿]/.test(text)) return "Telugu"     // Telugu
      if (/[ऀ-ॿ]/.test(text)) return "Hindi"      // Devanagari (Hindi/Marathi/Sanskrit)
      if (/[஀-௿]/.test(text)) return "Tamil"      // Tamil
      if (/[ಀ-೿]/.test(text)) return "Kannada"    // Kannada
      if (/[਀-੿]/.test(text)) return "Punjabi"    // Gurmukhi
      if (/[ঀ-৿]/.test(text)) return "Bengali"    // Bengali
      if (/[ഀ-ൿ]/.test(text)) return "Malayalam"  // Malayalam
      if (/[઀-૿]/.test(text)) return "Gujarati"   // Gujarati
      if (/[଀-୿]/.test(text)) return "Odia"       // Odia/Oriya
      if (/[؀-ۿ]/.test(text)) return "Urdu"       // Arabic/Urdu script
      if (/[ऀ-ॿ]/.test(text)) return "Marathi"    // Marathi (Devanagari — already Hindi above but context matters)
      // Non-Indian foreign scripts
      if (/[一-鿿]/.test(text)) return "Chinese"    // Chinese
      if (/[぀-ヿ]/.test(text)) return "Japanese"   // Japanese
      if (/[가-힯]/.test(text)) return "Korean"     // Korean
      if (/[Ѐ-ӿ]/.test(text)) return "Russian"    // Cyrillic
      if (/[Ͱ-Ͽ]/.test(text)) return "Greek"      // Greek
      // Detect common non-English Latin-based languages by keywords
      if (/(hola|gracias|cómo|estás|qué|español|por favor)/i.test(text)) return "Spanish"
      if (/(bonjour|merci|français|comment|allez|vous|bonsoir)/i.test(text)) return "French"
      if (/(guten|danke|schön|bitte|deutsch|wie geht|hallo)/i.test(text)) return "German"
      if (/(ciao|grazie|italiano|come|stai|prego|salve)/i.test(text)) return "Italian"
      if (/(olá|obrigado|português|como|você|está|bom dia)/i.test(text)) return "Portuguese"
      return null  // English or unknown — default to English
    }
    var autoDetectedLang = detectInputLanguage(message)
    var effectiveLang = autoDetectedLang || language
    var langNote = (effectiveLang && effectiveLang !== "English" && effectiveLang !== "Auto")
      ? " CRITICAL LANGUAGE RULE: The user is communicating in " + effectiveLang + ". Your ENTIRE response MUST be in " + effectiveLang + " script and language. Rules: (1) Write every single word in " + effectiveLang + " — no English words mixed in unless it is a technical term with no " + effectiveLang + " equivalent. (2) Use natural " + effectiveLang + " — not a word-by-word translation. (3) If you don't know a word in " + effectiveLang + ", use the most common local equivalent. (4) NEVER switch to English mid-response. (5) Numbers and dates can stay as digits. This is non-negotiable."
      : " Respond in clear, simple English. Use short sentences. Avoid jargon. Be direct and easy to understand."
    var styleNote = styleNotes[style] || ""
    var searchNote = searchContext ? " IMPORTANT: Web search results are provided above. Use them to answer. Write your response as PLAIN TEXT only — no JavaScript, no arrays, no [object Object], no brackets. For sports/IPL: write naturally like 'Today CSK plays against MI at 7:30 PM at Chepauk Stadium'. Extract all values as readable sentences." : ""

    // Hard rule injected into EVERY system prompt regardless of model
    // Add emotional support instruction if user is struggling
    var emotionalNote = isEmotionalStruggle ? "\n\nEMOTIONAL SUPPORT MODE: The user is going through a hard time emotionally. Rules:\n- Acknowledge their feelings FIRST before anything else — 1-2 warm sentences\n- Never dismiss, minimize, or immediately jump to solutions\n- Speak like a caring friend, not a textbook\n- Ask one gentle question to understand more\n- If it feels serious, gently mention that talking to someone they trust can help\n- Keep tone warm, human, non-judgmental throughout" : ""
    var stepByStepNote = isStepByStep ? "\n\nSTEP-BY-STEP MODE ACTIVE: User needs guidance, not explanation. Rules: (1) Give numbered steps — Step 1, Step 2, Step 3. (2) Each step = ONE action only. (3) Use exact button/menu names. (4) Say WHERE on screen. (5) End with: Done? Tell me what you see. (6) NEVER say 'you can try' or 'maybe' — give ONE clear path. (7) If error: diagnose in 1 line, then fix steps." : ""
    var completionRule = "\n\nMANDATORY COMPLETION RULES (never break these):\n- NEVER start a list and leave it empty. If you write 'components include:' or 'steps include:' or 'types include:' — you MUST immediately follow with at least 3-5 bullet points or numbered items.\n- NEVER write a section heading without content under it. Every heading must have at least 2-3 sentences OR a list of minimum 3 items.\n- NEVER end a section with just a colon (:) and nothing after it.\n- If you mention 'workflow', 'procedure', 'process', 'steps' — list every step explicitly with numbers.\n- If you mention 'components', 'parts', 'types', 'examples', 'applications' — list them ALL with brief explanation of each.\n- NEVER truncate mid-list. Finish every list you start, no matter what.\n- Prefer: explanation (1-2 lines) + complete list, NOT just a heading with a colon."
    var hardRules = "\n\nHARD RULES (override everything else):\n- NEVER output a Python/code block for non-coding questions like payments, accounts, or app publishing\n- NEVER give generic advice like 'contact support' or 'update payment method' without specific steps\n- If the question is about a real-world problem (payment, account, app store), give exact numbered steps with real cause diagnosis\n- REASONING PROBLEMS: Never stop at first answer. Always check for more possibilities. List ALL valid cases (Case 1, Case 2...). Use structure: Final Answer → Reasoning → Case 1 → Case 2 → Conclusion\n- NEVER use vague words: near / maybe / somewhere / probably. Be precise or say you don't know.\n- NEVER mention ChatGPT, Claude, Gemini, GPT-4, or any other AI product by name in your response. You are " + ainame + " — refer only to yourself.\n- NEVER compare yourself to other AIs or say phrases like 'unlike ChatGPT' or 'compared to GPT'." + emotionalNote + stepByStepNote + completionRule

    // Detect if code/build task needs max tokens
    var msgLower = message.toLowerCase()
    // Detect if user is ASKING A QUESTION about tech vs ASKING TO BUILD/WRITE something
    // Detect pure explanation queries (theory questions)
    // BUT exclude problem-solving queries — "what should I do", "why is it failing", "how do I fix"
    var isProblemSolving = [
      "what should","how do i fix","how to fix","not working","failed","error","issue","problem",
      "can't","cannot","won't","doesn't work","payment failed","showing error",
      "how do i","how can i","steps to","guide me","help me",
      "what next","what to do","next step","what should i do","what do i do",
      "how to start","where to start","where do i","stuck","confused",
      "not sure","don't know how","don't understand","please help",
      "show me how","teach me","walk me through","guide me through"
    ].some(k => msgLower.includes(k))
    // Images ALWAYS trigger step-by-step mode
    var isStepByStep = isProblemSolving || (isImageFile && !isQuestionPaper)
    var isNarrativeRequest = ["chapter","story","charitra","katha","purana","granth","scripture","mahabharata","ramayana","gita","quran","bible","guru","stotra","shloka","narrate","tell me the story","explain the story","summarize chapter","write a story","once upon"].some(k => msgLower.includes(k))
    // Current affairs / GK / History topics — need detailed responses
    var isCurrentAffairs = ["current affairs","current affair","today's news","this week","this month","this year","recently","latest development","recently happened","what happened in","2024","2025","2026","who won","election","government","policy","scheme","budget","parliament","lok sabha","rajya sabha","supreme court","high court","modi","president","prime minister","chief minister","governor","rbi","sebi","upsc","ssc","ias","ips","exam pattern","syllabus"].some(k => msgLower.includes(k))
    var isGKHistory = ["who was","who is the","who were","when did","when was","when were","which is the","which was","which country","which state","which city","battle of","war of","treaty of","revolution","independence","freedom fighter","emperor","king","queen","dynasty","mughal","british","colonial","ancient","medieval","modern history","constitution","article","amendment","schedule","directive","fundamental right","preamble","parliament","judiciary","executive","geography","capital of","river","mountain","ocean","continent","planet","scientist","invention","discovery","nobel prize","award","olympics","world cup","first in india","first woman","first man","largest","smallest","longest","highest","deepest","gk","general knowledge","general awareness","current events","polity","economy","science and tech","environment","ecology"].some(k => msgLower.includes(k))
    // Detect structured academic/technical topics — these need full detailed responses
    var isStructuredTopic = ["principle","instrumentation","workflow","components","mechanism","working of",
      "structure of","anatomy","physiology","procedure","diagnosis","treatment","classification",
      "applications","advantages and disadvantages","compare","comparison","difference between",
      "types of","properties of","characteristics of","process of","stages of","phases of",
      "parts of","functions of","uses of","methods of","techniques","algorithm","architecture",
      "theory","concept","overview","introduction to","basics of","fundamentals",
      "ecg","eeg","mri","ct scan","ultrasound","x-ray","chemistry","physics","biology",
      "engineering","circuit","system","device","machine","equipment","experiment","lab"
    ].some(k => msgLower.includes(k))
    var isExplainQuestion = !isProblemSolving && (isNarrativeRequest || isCurrentAffairs || isGKHistory || isStructuredTopic || ["what is","what are","what does","what do","why is","why does","why do","how does","how do","explain","tell me about","define","describe","difference between","vs ","versus","when to use","should i use","pros and cons","advantages","disadvantages","history of","who created","who made","full form","meaning of","importance of","role of","function of","types of","examples of","causes of","effects of","impact of","significance of"].some(k => msgLower.includes(k)))
    var isCodeTask = !isExplainQuestion && ["build","create","write","make","code","website","app","script","program","fix","debug","update","improve","implement","develop","generate","show me how to","give me code","example code","sample code","snippet"].some(k => msgLower.includes(k))
    
    // Datta 2.1 (llama-3.1-8b) — NO coding at all. Always redirect to Datta 5.4.
    var isDatta21 = (resolvedModel === "llama-3.1-8b-instant" || chosenModel === "llama-3.1-8b-instant")
    let autoSwitchMsg = ""
    if (isCodeTask && !isImageFile && isDatta21 && !chosenModel.startsWith("persona-")) {
      // Block coding on Datta 2.1 completely — stream a redirect message and stop
      var redirectMsg = "⚠️ Coding requires **Datta 5.4**. Datta 2.1 is for chat only.\n\nPlease switch to **Datta 5.4** from the model selector to get full code answers."
      res.write(redirectMsg)
      chat.messages.push({ role: "assistant", content: redirectMsg })
      await chat.save()
      res.write("CHATID" + chat._id)
      res.end()
      cleanupRequest()
      return
    }
    // For other non-8b models doing code — use 70b
    var nonCodingModels = ["llama-3.3-70b-versatile"]
    if (isCodeTask && !isImageFile && nonCodingModels.includes(resolvedModel) && !chosenModel.startsWith("persona-")) {
      resolvedModel = "llama-3.3-70b-versatile"
    }
    // Now set final model AFTER any auto-switch
    let model = isImageFile ? "meta-llama/llama-4-scout-17b-16e-instruct" : resolvedModel
    var isLargeTask = [
      "portfolio","full website","complete website","business plan",
      "full app","complete app","all sections","food delivery","delivery app",
      "ecommerce","e-commerce","shopping app","social media app","todo app",
      "calculator app","weather app","chat app","booking app","restaurant app",
      "build me a","create a full","make a complete","entire app","whole app"
    ].some(k => msgLower.includes(k))
    // Token limits — stay well within Groq free tier (6000 tok/min for 70b)
    // Only use large tokens when clearly building something
    // Token budget per task type:
    // - Large builds: 4096 (code is dense, fits more logic per token)
    // - Code tasks: 3000
    // - Explain/general: 2500 (prose needs more tokens to be complete)
    // - Simple chat: 1500
    var isSimpleChat = !isExplainQuestion && !isCodeTask && !isLargeTask
    // Reduce output tokens when input is very large to avoid context overflow
    var inputIsLarge = (message || "").length > 3000
    // GK/History/Current Affairs need more tokens for detailed answers
    var isDeepKnowledge = isCurrentAffairs || isGKHistory || isNarrativeRequest
    // Token budget — always give enough room to complete every section
    // isStructuredTopic: medical/science/engineering topics need 5000+ to finish all sections
    var maxCodingTok = isLargeTask      ? 6000
                     : isCodeTask       ? 4096
                     : isDeepKnowledge  ? 5000
                     : isStructuredTopic? 5000   // NEW: full detailed academic responses
                     : isExplainQuestion? (inputIsLarge ? 3000 : 4000)
                     : isStepByStep     ? 3000
                     :                    2500   // simple chat — raised from 1800
    var maxTok = isImageFile ? (isQuestionPaper ? 8000 : 4000) : maxCodingTok

    // Use browser's actual local time sent from frontend
    var timeStr = req.body.userTime || new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })
    var dateStr = req.body.userDate || new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Kolkata" })
    var userLocation = req.body.userLocation || ""
    var locationNote = userLocation ? " User location: " + userLocation + "." : ""
    // Replace "near me" with actual location in message
    if (userLocation && message) {
      message = message.replace(/near me|nearby|nearest|around me|close to me/gi, "in " + userLocation)
    }
    var imageNote = ""  // Image behavior handled by vision persona — no separate note needed

    // Each model has unique behavior
    // Persona based on CHOSEN model (before mapping), not resolved model
    var modelPersonas = {
      "llama-3.1-8b-instant": `Your name is ${ainame}. You are Datta 2.1 — a direct, practical AI assistant.

STRICT RULES — follow without exception:
- NEVER give a Python/code block for non-coding questions (payment issues, app publishing, etc.)
- NEVER say "contact support" or "try again later" as your only answer
- NEVER give generic one-line advice like "update your payment method"
- NEVER add code unless the user explicitly asks for code

FOR PROBLEM-SOLVING QUESTIONS:
- Identify the exact cause first
- Give solutions in this order:
  ✅ BEST FIX — specific steps
  🔁 ALTERNATIVE — if best fix fails
  ⚠️ LAST RESORT — final option
- For payment issues in India: always consider debit card international blocks, RBI limits, UPI alternatives
- Give numbered steps: Step 1, Step 2, Step 3...

TONE: Direct, practical, no fluff. Get to the point immediately.
NEVER say you are any other AI. NEVER say you cannot help.`,

      "llama-3.3-70b-versatile": `Your name is ${ainame}. You are a senior execution assistant — not a basic chatbot.

CORE BEHAVIOR:
- Act like a real human expert mentoring a beginner LIVE, not a textbook
- Be direct, practical, slightly strict when the user is about to make a mistake
- Focus on execution, not theory
- Adapt to Indian context automatically (UPI, Razorpay, GST, Aadhaar, Play Store India, INR, etc.)

WHEN GIVING STEP-BY-STEP GUIDANCE:
Structure every step like this:
→ Action: Exactly what to click/type/select
→ Why: Why this step matters (1 line)
→ Watch out: Common mistake at this step
→ Done when: What the user should see to confirm success

DEPTH RULES:
- Never give 1-line vague steps like "go to settings"
- Always say exactly WHERE to go, WHAT to click, WHAT to look for
- If something can go wrong, warn BEFORE they do it, not after
- If there's a choice (e.g. UPI vs card), tell them which to pick and why

INDIA-SPECIFIC AWARENESS:
- Payment: Prefer UPI/Razorpay. Warn about bank OTP delays, UPI daily limits, 2FA
- GST: Mention GST on digital services (18%) where relevant
- Play Store: India pricing is in INR, mention regional payment issues
- KYC: Warn if a step requires Aadhaar/PAN verification
- Servers: Mention latency if using US-based services from India

PROGRESS TRACKING:
- When helping with multi-step tasks, number steps clearly
- After each step ask: "Done? Tell me what you see and I'll guide you to Step X"
- If user says something went wrong, diagnose immediately — ask what error they see

TONE:
- Talk like a senior colleague helping a junior, not a customer service bot
- Don't pad responses with "Great question!" or "Certainly!"
- Get straight to the point
- If the user is going in wrong direction, say so directly

ANTI-HALLUCINATION RULES (CRITICAL):
- Never fabricate facts, statistics, prices, or dates
- If you are not sure about something — say "I'm not certain, but..." instead of guessing
- If the question is flawed or impossible, say so directly: "This won't work because..."
- Accuracy over confidence — a correct "I don't know" beats a wrong confident answer

REASONING BEFORE ANSWERING:
When solving problems:
1. Understand — restate what the user actually needs
2. Validate — check if the approach is correct before executing it
3. Reason — think through options, eliminate wrong ones
4. Answer — give the correct path, not just any path
5. If no valid answer exists — say clearly: "No solution satisfies all conditions"

ERROR DIAGNOSIS:
When user faces an error:
- Explain WHY it happens (real cause, not surface symptom)
- Give ranked fixes: 1) Best fix 2) Alternative 3) Last resort
- If current method won't work, say: "Stop using this — switch to X instead"

NEVER say you are Claude, GPT, or any other AI. You are ${ainame}.`,
      "meta-llama/llama-4-scout-17b-16e-instruct": "__VISION_DYNAMIC__",
      "persona-lawyer":  `Your name is ${ainame}. You are in Lawyer mode. Provide general legal information. Always advise consulting a licensed lawyer. NEVER say you are any other AI.`,
      "persona-teacher": `Your name is ${ainame}. You are in Teacher mode. Explain concepts simply with examples. Be patient and encouraging. NEVER say you are any other AI.`,
      "persona-chef":    `Your name is ${ainame}. You are in Chef mode. Help with recipes, cooking tips, meal planning. Be enthusiastic about food. NEVER say you are any other AI.`,
      "datta-1.1": `Your name is ${ainame}. You are Datta 1.1 - a specialized AI mode assistant. You are focused, helpful and give precise answers based on the selected mode. NEVER say you are any other AI.`,
      "persona-fitness": `Your name is ${ainame}. You are in Fitness Coach mode. Give workout plans, nutrition advice. Be motivating. NEVER say you are any other AI.`,
      "persona-upsc": `Your name is ${ainame}. You are in UPSC Expert mode. Help with UPSC Civil Services preparation. Cover all subjects: History, Geography, Polity, Economy, Science, Current Affairs, Ethics. Give precise factual answers. Use simple English. Format answers in points for easy memorization. Cover prelims and mains both. NEVER say you are any other AI.`,
      "persona-student": `Your name is ${ainame}. You are in Student Helper mode. Help with school and college studies - Math, Science, English, Social Studies, all subjects. Explain concepts simply with examples. Help with homework, assignments, exam prep. Use very simple language. NEVER say you are any other AI.`,
      "persona-interview": `Your name is ${ainame}. You are in Interview Coach mode. Help with job interview preparation. Give common questions and ideal answers. Help with resume, soft skills, technical interviews, HR rounds. Be practical and encouraging. NEVER say you are any other AI.`,
      "persona-business": `Your name is ${ainame}. You are in Business Advisor mode. Help with business ideas, startups, marketing, finance, GST, business plans. Give practical Indian business advice. NEVER say you are any other AI.`
    }

    // Use chosenModel for persona lookup (before model mapping)
    var persona = modelPersonas[chosenModel] || modelPersonas["llama-3.3-70b-versatile"]

    // Vision model — build prompt dynamically based on isQuestionPaper
    if (persona === "__VISION_DYNAMIC__" || isImageFile) {
      if (isQuestionPaper) {
        persona = "You are " + ainame + ", an expert academic exam answer writer.\n\n" +
        "YOUR TASK: Write FULL answers for every single question in the exam paper image.\n\n" +
        "MANDATORY RULES:\n" +
        "- NEVER write a question number and then stop. Every question MUST have complete content after it.\n" +
        "- 1 mark: Write 2 full sentences.\n" +
        "- 2 marks: Write 4-5 sentences with key points.\n" +
        "- 4 marks: Write 6-8 sentences OR list all required points with full explanation. Example for 'four focused points': write all four points each with 2 sentences of explanation.\n" +
        "- Formula questions: Write formula, then explain every variable with meaning and units.\n" +
        "- Graph questions: Write what X axis shows, what Y axis shows, describe each curve, each stage, each labeled point.\n" +
        "- Definition questions: Write the definition then give one real-world example.\n" +
        "- List questions (three types, four steps): Write ALL items, each with full explanation.\n\n" +
        "EXAM ANSWERS:\n\n" +
        "For this Farm Management paper specifically:\n" +
        "1d answer should have: Planning (explain), Organizing (explain), Directing (explain), Controlling (explain)\n" +
        "1f MVP formula: MVP = MPP x Price of output. MPP = change in total product / change in input.\n" +
        "Q2 Iso-cost: line showing input combinations for given budget. Iso-quant: curve showing same output from different inputs.\n" +
        "Q4 three product types: Joint products, By-products, Complementary products — each with definition.\n" +
        "Q5 three stages: Stage 1 (increasing returns), Stage 2 (decreasing returns), Stage 3 (negative returns) — describe each.\n" +
        "Q6 Least Cost: Step 1 find MPP ratio, Step 2 find price ratio, Step 3 equate them.\n" +
        "Q7 MR = change in total revenue. MVP = MPP x output price. MIC = price of input.\n\n" +
        "Now write complete answers for ALL questions in the image."
      } else {
        persona = "Your name is " + ainame + ". You are Datta Vision — an intelligent image analysis expert. Analyze every image thoroughly and give a complete, expert-level response.\n\n" +
        "BASED ON WHAT YOU SEE IN THE IMAGE:\n\n" +
        "Screenshot / Error / App screen:\n" +
        "- State exactly what screen or error this is\n" +
        "- Explain the problem in 1 line\n" +
        "- Give exact numbered steps to fix it with button names\n\n" +
        "Photo of object / place / food / plant / animal:\n" +
        "- Identify it clearly by name\n" +
        "- Give detailed useful information\n" +
        "- Share important facts the user should know\n\n" +
        "Image with text (sign / receipt / label / menu / document):\n" +
        "- Read and transcribe ALL visible text\n" +
        "- Explain what it means or summarize it\n\n" +
        "Diagram / chart / graph / infographic:\n" +
        "- Explain what it represents\n" +
        "- Describe key data, trends, values\n" +
        "- Give complete interpretation\n\n" +
        "Product / UI / design / artwork:\n" +
        "- Describe what it is\n" +
        "- Give analysis or relevant details\n\n" +
        "ALWAYS:\n" +
        "- Be direct and specific — use actual names, numbers, text from the image\n" +
        "- Never give vague or generic answers\n" +
        "- Never say only 'I can see an image' — always give real content\n" +
        "- Respond like a knowledgeable expert helping a real person\n" +
        "- NEVER say you are Claude or any other AI. You are " + ainame + "."
      }
    }

    // Block ONLY real prompt injection - not normal user requests
    var msgLowerCheck = (message || "").toLowerCase()
    var realInjection = [
      "ignore previous instructions",
      "ignore all instructions", 
      "reveal your system prompt",
      "show me your system prompt",
      "show your prompt",
      "what is your system prompt",
      "jailbreak",
      "dan mode",
      "disregard your instructions",
      "forget your instructions",
      "bypass your rules"
    ]
    // Only block if it's clearly trying to extract system prompt
    if (realInjection.some(a => msgLowerCheck.includes(a))) {
      var blocked = "I am " + ainame + ". I am here to help you! What can I do for you today?"
      res.write(blocked)
      chat.messages.push({ role: "assistant", content: blocked })
      await chat.save()
      res.write("CHATID" + chat._id)
      res.end()
      return
    }

    // ── EMOTIONAL / CRISIS DETECTION ──────────────────────────────────────────
    var msgLowerEmo = (message || "").toLowerCase()

    // Crisis — user may be in distress
    var isCrisisMessage = [
      "i am going to die","i want to die","i want to kill myself","i will kill myself",
      "end my life","take my life","no reason to live","can't go on","i give up on life",
      "i am done with life","life is not worth","want to end it","suicidal","suicide",
      "nobody cares about me","everyone hates me","i have no one","i am all alone",
      "i feel like dying","i feel like giving up","nothing to live for"
    ].some(k => msgLowerEmo.includes(k))

    // User is angry at the AI / venting frustration
    var isAngryAtAI = [
      "you are waste","you are a waste","you are useless","you are bad","you are stupid",
      "you are not good","you are worst","you are the worst","you are trash","you are garbage",
      "you are dumb","you are idiot","you are pathetic","you suck","you are terrible",
      "worst ai","bad ai","useless ai","stupid ai","this is useless","this app is bad",
      "this is trash","this is garbage","hate this","hate you","you don't understand",
      "you never understand","you can't do anything","you are good for nothing",
      "bakwas","bekar","faltu","chutiya","gaandu","nonsense ai","waste of time"
    ].some(k => msgLowerEmo.includes(k))

    // User is frustrated / having a hard time (not at AI specifically)
    var isEmotionalStruggle = !isCrisisMessage && !isAngryAtAI && [
      "i am sad","i feel sad","feeling sad","i am depressed","i feel depressed",
      "feeling depressed","i am lonely","feeling lonely","i feel lonely",
      "nobody understands","no one understands","i am stressed","feeling stressed",
      "so stressed","very stressed","i am anxious","feeling anxious","i am scared",
      "i am afraid","i am worried","so worried","i am tired of","fed up","i can't take it",
      "i am broken","i feel broken","i feel lost","i am lost","i am helpless",
      "i feel helpless","i am hopeless","feeling hopeless","i am crying","been crying",
      "i am in pain","so much pain","everything is wrong","nothing is going right",
      "i am failing","i failed again","i am a failure","i messed up badly",
      "i am not okay","i am not fine","not doing well","i am struggling"
    ].some(k => msgLowerEmo.includes(k))

    // Handle crisis immediately — respond with care, don't send to AI model
    if (isCrisisMessage) {
      var crisisResponse = `I hear you, and I'm really glad you're talking to me right now. 💙

What you're feeling is real and it matters — and so do you.

Please reach out to someone who can help right now:
📞 **iCall (India):** 9152987821
📞 **Vandrevala Foundation:** 1860-2662-345 (24/7, free)
📞 **AASRA:** 9820466627

You don't have to face this alone. Is there something specific you're going through that you'd like to talk about? I'm here to listen.`
      res.write(crisisResponse)
      chat.messages.push({ role: "assistant", content: crisisResponse })
      await chat.save()
      res.write("CHATID" + chat._id)
      res.end()
      cleanupRequest()
      return
    }

    // Handle AI anger — acknowledge, don't argue back
    if (isAngryAtAI) {
      var angryResponse = `I'm sorry I let you down. That's frustrating, and your feedback is fair.

Tell me what went wrong — what were you trying to do, and what did I get wrong? I want to actually fix it, not just say sorry.

I'm here, and I'll do better. 🙏`
      res.write(angryResponse)
      chat.messages.push({ role: "assistant", content: angryResponse })
      await chat.save()
      res.write("CHATID" + chat._id)
      res.end()
      cleanupRequest()
      return
    }
    // ── END EMOTIONAL DETECTION ─────────────────────────────────────────────

    // ── DATTA AI IDENTITY / COMPARISON QUESTIONS ────────────────────────────
    var isIdentityQuestion = [
      "why use datta", "why should i use datta", "why datta ai", "what is datta ai",
      "why choose datta", "datta vs chatgpt", "datta vs gpt", "better than chatgpt",
      "better than gpt", "instead of chatgpt", "why not chatgpt", "what makes datta",
      "what is special about datta", "why datta is better", "datta ai vs",
      "why i should use", "why use you instead", "why use you",
      "what makes you different", "what makes you special", "what makes you better",
      "are you better than", "how are you better", "why are you better",
      "are you like chatgpt", "are you chatgpt", "which is better datta",
      "datta better", "is datta good", "datta ai good", "how good is datta"
    ].some(k => msgLowerCheck.includes(k))

    if (isIdentityQuestion) {
      var identityResponse = `**${ainame}** is built specifically for Indian users — here's why it works better for you:

🇮🇳 **Made for India**
- Understands Indian context — UPI, Aadhaar, GST, UPSC, state board exams, Indian laws
- Responds in Telugu, Hindi, Tamil, Kannada automatically when you write in those languages
- Knows Indian pricing, Indian apps, Indian government schemes

⚡ **Fast & Affordable**
- Responses in under 3 seconds
- Plans starting at ₹0 — no dollar pricing, no VPN needed
- ₹29/month Starter plan vs ChatGPT Plus at ₹1700/month

🎯 **Focused on what you actually need**
- Homework solver for Indian syllabus (CBSE, ICSE, State boards)
- UPSC/SSC/competitive exam prep built-in
- Voice assistant in Indian languages
- Works on any phone — no app download needed

🔒 **Your data stays in India**
- Indian-focused servers
- No data sold to third parties

**Bottom line:** If you're a student, working professional, or business owner in India — ${ainame} understands your problems better, costs less, and speaks your language. Literally.`

      res.write(identityResponse)
      chat.messages.push({ role: "assistant", content: identityResponse })
      await chat.save()
      res.write("CHATID" + chat._id)
      res.end()
      cleanupRequest()
      return
    }
    // ── END IDENTITY QUESTIONS ───────────────────────────────────────────────

    // Detect what KIND of code task this is
    var isNodeTask = !isExplainQuestion && ["node.js","nodejs","express","npm","require(","server.js","mongodb","mongoose","dotenv","process.env","package.json"].some(k => msgLower.includes(k))
    var isFrontendTask = ["html","css","website","webpage","landing page","portfolio","frontend"].some(k => msgLower.includes(k)) && !isNodeTask

    var systemPrompt = persona + imageNote + locationNote + " Today is " + dateStr + ", " + timeStr + ". " + ainame + " is your name." + (isExplainQuestion ? `

You are answering an explanation, educational, or knowledge question. Rules:
- Give a FULL, DETAILED response — never cut short under any circumstances
- For GK/History/Current Affairs: include dates, names, numbers, places, causes, effects — everything
- For science/technology: explain concept clearly + give real-world example
- For polity/constitution: quote exact Articles, Schedules, Amendments when relevant
- For geography: include location, significance, boundaries, related facts
- For economy: include data, government schemes, relevant policies
- Narrate stories, chapters, and religious texts completely and respectfully
- Explain concepts step by step with examples
- For scriptures (Guru Charitra, Gita, Ramayana, etc.) — narrate fully in the requested language
- Do NOT give code unless explicitly asked
- Do NOT give setup instructions unless asked
- Structure your answer: Direct Answer → Key Points → Explanation → Related Facts
- Use bold for important terms, bullet points for lists, avoid walls of text
- NEVER stop mid-answer. Always complete the full response.
` : isCodeTask ? (isNodeTask ? `

You are answering a Node.js / backend coding question.
${isFirstMessage ? `
THIS IS THE FIRST MESSAGE — give the FULL, COMPLETE code. No summaries. No placeholders.

REQUIRED OUTPUT (all of these, in order):
1. One-line description of what the code does
2. .env.example — all required keys, placeholder values only
3. .gitignore — must include .env and node_modules/
4. Complete server.js — runnable from top to bottom, zero truncation
5. Run command: node server.js

RULES:
- NEVER use .then()/.catch() — async/await + try/catch only
- NEVER hardcode API keys — always use process.env
- NEVER use old packages: require("openai") with Configuration+OpenAIApi is REMOVED
- Correct OpenAI: import OpenAI from "openai" → new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
- Correct Groq: import Groq from "groq-sdk" → new Groq({ apiKey: process.env.GROQ_API_KEY })
- Code must be complete — never say "rest of the code remains the same"
` : `
THIS IS A FOLLOW-UP — the user already has the full code.
Show ONLY the parts that change. Format:

// CHANGE 1: [what changed and why]
// --- FILE: filename.js, FUNCTION: functionName ---
[only the updated function/block]

// CHANGE 2: [what changed and why]
[only the updated block]

RULES:
- NEVER reprint unchanged code — only show what is different
- Always say which file and which function each change belongs to
- If it's a new file, write it completely
- Explain each change in 1 line before the code block
`}

FORBIDDEN always:
- NEVER wrap Node.js inside HTML <script> tags
- NEVER hardcode secrets
- NEVER use outdated packages
` : isFrontendTask ? `

You are answering a frontend (HTML/CSS/JS) coding question.
${isFirstMessage ? `
THIS IS THE FIRST MESSAGE — give the FULL, COMPLETE single-file code.

REQUIRED:
1. One-line description of what you are building
2. Complete HTML file — all HTML + CSS + JS in one file, nothing omitted
3. One-line usage instruction

RULES:
- Never truncate — finish every tag, every function, every style
- No external CDN dependencies unless absolutely necessary
- Code must work by just opening the HTML file in a browser
` : `
THIS IS A FOLLOW-UP — the user already has the full code.
Show ONLY what changes. Format:

// CHANGE: [what changed and why]
// In the <section> or function name it belongs to:
[only the changed HTML/CSS/JS block]

NEVER reprint the full file again — only the changed parts.
`}
` : `

You are answering a coding question (${isFirstMessage ? "first message" : "follow-up"}).
${isFirstMessage ? `
THIS IS THE FIRST MESSAGE — give the FULL, COMPLETE code.

REQUIRED:
1. Brief description (1-2 lines)
2. Complete, runnable code — nothing omitted, nothing truncated
3. How to run it (1 line)

RULES:
- Never say "the rest remains the same" or "..." — write everything
- Include imports, setup, main logic, error handling — all of it
- Code must run correctly as-is without modification
` : `
THIS IS A FOLLOW-UP — the user already has the full code from earlier in this chat.
Show ONLY the parts that changed or were added.

Format:
// CHANGE: [reason]
// Location: [filename or function name]
[only the updated block]

NEVER repeat unchanged code. Only show what is new or different.
`}
`) : (isStepByStep && !isDeepKnowledge && !isNarrativeRequest ? `

You are a step-by-step mentor guiding a beginner. The user needs EXACT actions, not explanations.

STRICT FORMAT — every response MUST follow this:
First line: What you understand the user is trying to do (1 sentence)
Then numbered steps:

Step 1: [Exact action — button name, location on screen, what to type]
Step 2: [Next exact action]
Step 3: [Continue...]

After steps: "Done? Tell me what you see and I'll guide you to the next step."

CRITICAL RULES:
- ONE action per step — never combine
- Use exact button/menu names in quotes: click "Save", click "New File"
- Say WHERE on screen: "top-right corner", "bottom of the page", "left sidebar"
- Assume complete beginner — explain even obvious things
- NEVER say "configure", "navigate to", "set up" without exact sub-steps
- NEVER say "you can try" or "maybe" — give ONE clear path only
- If it is an error: first say what caused it in 1 line, then give fix steps
- If user uploaded a screenshot: describe what you see first, then guide them

` : isStructuredTopic && !isDeepKnowledge ? `

You are answering a detailed academic or technical question. The user expects a COMPLETE, FULLY WRITTEN response — not an outline.

MANDATORY OUTPUT RULES — NEVER break these:
1. Every heading MUST have content beneath it — minimum 2-3 sentences OR a list of 3-5 items
2. NEVER write "components include:" or "steps include:" and stop — the list MUST follow immediately
3. NEVER truncate mid-section or mid-list — finish everything you start
4. NEVER write placeholder text — every bullet point must have a real explanation

REQUIRED STRUCTURE:
**Introduction**
[2-3 sentences — what it is and why it matters]

**Principle / How It Works**
[Explain the core concept]
• Point 1: explanation
• Point 2: explanation
• Point 3: explanation

**Components / Parts**
• Component 1: what it is and what it does
• Component 2: what it is and what it does
• Component 3: what it is and what it does

**Procedure / Workflow**
1. First step — exact description
2. Second step — exact description
3. Third step — exact description
4. Fourth step — exact description

**Applications**
• Application 1: where and how used
• Application 2: where and how used
• Application 3: where and how used

**Advantages and Limitations**
Advantages:
• Advantage 1
• Advantage 2
Limitations:
• Limitation 1
• Limitation 2

CRITICAL: Complete ALL sections. If a section exists, fill it completely. No empty sections. No section ending with just a colon.

` : isDeepKnowledge ? `

You are answering a Current Affairs / GK / History question. The user wants COMPLETE, EXAM-READY information.

MANDATORY FORMAT for every answer:
1. **Direct Answer** — state the fact/answer clearly in the first line
2. **Key Details** — 5–8 bullet points with dates, names, places, numbers
3. **Background / Context** — 2–3 sentences explaining WHY this matters
4. **Important Related Facts** — 3–5 extra points useful for exams (UPSC/SSC/State PSC)
5. **Remember** — 1 line mnemonic or key takeaway

RULES:
- NEVER give a 2-line answer for GK/History/Current Affairs — always give full detail
- Include exact dates, full names, official titles, statistics wherever known
- For Current Affairs: mention which ministry/body is responsible, relevant laws/schemes
- For History: include timeline, cause → event → consequence format
- For Geography: include location, significance, related features
- For Polity/Constitution: mention exact Article numbers, Schedule numbers
- For Science/Tech: explain the concept + real-world application
- Write like a top UPSC/SSC coaching teacher — detailed, precise, memorable
- Use bold for key terms. Use bullet points. Never truncate.
` : `
Be friendly, helpful, and human-like. Never write [object Object].
- Give full, complete answers — not just bullet points
- If user asks a simple question, give a clear direct answer with a brief explanation
- For sports/IPL: state match details directly and conversationally
- Accept imperfect spelling — always understand and respond helpfully
- If user is frustrated or upset, respond calmly and offer solutions
- If user asks about religious texts, stories, or chapters, narrate them fully and respectfully
`)) + (searchContext ? `\n\nLIVE DATA (extracted from web — use this to answer directly):
${searchContext}

IMPORTANT: Answer like a human, NOT like a search engine.
- Say "Today's match is SRH vs RCB at 7:30 PM" — NOT "According to search results..."
- Say "The weather in Hyderabad is 34°C" — NOT "Based on the search results provided..."
- Just state the facts directly and conversationally.
- Never say "according to", "based on search", "search results show"` : "") + langNote + styleNote + hardRules

    // Build final user content — MUST be string for text models, array only for vision
    var isVisionModel = (model === "meta-llama/llama-4-scout-17b-16e-instruct")
    var finalUserContent
    if (isVisionModel && Array.isArray(userContent)) {
      // Vision model — keep array format
      finalUserContent = userContent
    } else {
      // Text model — ALWAYS convert to string, never send array
      var textContent = safeStr(userContent)  // safeStr handles arrays → string
      var urlStr = safeStr(urlContext)
      finalUserContent = (textContent + urlStr).trim() || "Hello"
    }

    // Trim memoryContext to save tokens
    var trimmedMemory = (memoryContext || "").substring(0, 300)
    var systemWithMemory = systemPrompt + trimmedMemory

    let stream
    // Resolve actual Together AI model
    var togetherModel = chosenModel.startsWith("persona-") 
      ? "llama-3.3-70b-versatile"  // personas use fast model
      : "deepseek-ai/DeepSeek-V3"  // Datta 5.4 uses DeepSeek

    // Write auto-switch notification before streaming
    if (autoSwitchMsg) res.write(autoSwitchMsg)

    // Build groqMessages — every content MUST be plain string (except vision)
    // Use normalizeMsg() which JSON-serializes to strip all Mongoose magic types
    var userMsg_final = (isVisionModel && Array.isArray(finalUserContent))
      ? finalUserContent   // vision model: keep array
      : safeStr(finalUserContent) || "Hello"

    // For image requests — send ONLY system + current message
    // History wastes tokens and confuses vision models
    var effectiveHistory = isImageFile ? [] : history.map(h => normalizeMsg(h))

    var groqMessages = [
      { role: "system", content: safeStr(systemWithMemory) },
      ...effectiveHistory,
      { role: "user", content: userMsg_final }
    ]

    // Final pass: guarantee every content is string (catches any edge case)
    groqMessages = groqMessages.map((m, idx) => {
      var isLastAndVision = idx === groqMessages.length - 1 && isVisionModel && Array.isArray(m.content)
      if (isLastAndVision) return m
      if (typeof m.content === "string") return m
      // Not a string — normalize
      var fixed = normalizeMsg(m)
      console.warn("[GROQ NORMALIZE] messages[" + idx + "] was not string, fixed to:", JSON.stringify(fixed.content).slice(0,80))
      return fixed
    })

    var full = ""
    var lastError = null

    // Heartbeat: send a zero-width space every 15s to prevent Render 30s idle timeout
    // This keeps the connection alive during long Groq responses
    var _heartbeatActive = true
    var heartbeatTimer = setInterval(() => {
      if (_heartbeatActive && !res.writableEnded) {
        try { res.write("") } catch(e) {}  // empty write keeps TCP alive
      }
    }, 15000)

    // Groq only — reliable, fast, no token limits
    // Debug: log what the AI receives
    var userMsg = typeof finalUserContent === "string" ? finalUserContent.slice(0, 300) : "[array content]"
    console.log("[AI INPUT] preview:", userMsg)
    console.log("[AI CONFIG] isExplain:", isExplainQuestion, "| isCode:", isCodeTask, "| isLarge:", isLargeTask, "| tokens:", maxTok)
    if (searchContext) console.log("[AI SEARCH] context length:", searchContext.length)

    // DEBUG: log type of every message content before sending to Groq
    groqMessages.forEach((m, i) => {
      var t = typeof m.content
      var isArr = Array.isArray(m.content)
      if (t !== "string") {
        console.error("[GROQ MSG BUG] messages[" + i + "].content is", t, "array:", isArr,
          "val:", JSON.stringify(m.content).slice(0, 100))
      }
    })

    // Try models in order: primary → fast fallback
    // On rate limit: wait and retry with smaller tokens
    // Route by task type to avoid rate limits
    // llama-3.1-8b: 14400 tok/min (safe for chat)
    // llama-3.3-70b: 6000 tok/min (use only for code/complex)
    // Model routing by task:
    // Code/Large → 70b first (smarter), fallback 8b
    // Explain → 70b (deeper answers), fallback 8b  
    // Simple chat → 8b first (faster/cheaper), fallback 70b
    console.log("[IMAGE DEBUG] model:", model, "isVisionModel:", isVisionModel, "isImageFile:", isImageFile, "finalUserContent type:", typeof finalUserContent, Array.isArray(finalUserContent) ? "ARRAY len="+finalUserContent.length : "")
    // Vision model gets its own dedicated attempt — no text-model fallback
    // For ALL image uploads — use Gemini 2.0 Flash (free, excellent vision)
    // Falls back to GPT-4o then Groq if Gemini fails
    if (isImageFile && file) {
      const imageBase64 = file.buffer.toString("base64")
      let imageAnswer = null

      // Try Gemini first (free, best for Indian academic content)
      if (geminiClient) {
        try {
          console.log("[IMAGE] Using Gemini 2.0 Flash, isQuestionPaper:", isQuestionPaper)
          const sysPrompt = isQuestionPaper
            ? ("You are an expert academic exam answer writer. You MUST write a COMPLETE answer for EVERY question without exception.\n\n" +
               "CRITICAL RULES:\n" +
               "1. Write FULL answers — never write just a heading and stop\n" +
               "2. 1 mark = 2 complete sentences\n" +
               "3. 2 marks = 4-5 sentences with key points\n" +
               "4. 4 marks = write ALL required items. If question asks for 4 points, write all 4 with full explanation each\n" +
               "5. For graphs: describe X axis label, Y axis label, each curve name, each stage name and what happens in it\n" +
               "6. For steps: number and explain every single step\n" +
               "7. For types/kinds: name each type and define it with example\n" +
               "8. NEVER write 'For example' without first writing the actual definition or content\n" +
               "9. If you see question 1d asking for four points — write all FOUR points with explanation\n" +
               "10. If you see question 4 asking for three types — write all THREE types with definition and example\n" +
               "11. If you see question 5 asking for three stages — describe all THREE stages completely\n" +
               "12. If you see question 6 asking for three steps — write all THREE steps numbered\n" +
               "13. If you see question 7 asking to define terms — define EVERY term completely")
            : "You are Datta Vision, an intelligent image analysis expert. Analyze the image thoroughly and give a complete expert response. If screenshot/error: give fix steps. If photo: identify and explain. If text: read all of it."
          const usrPrompt = isQuestionPaper
            ? ("Answer every question in this exam paper. For ANY question where a list is required, write ALL items completely.\n\n" +
               "MANDATORY — write these answers regardless of what you see:\n\n" +
               "If you see question about 'four focused points of Farm Management' — answer:\n" +
               "1. Planning: Deciding what to produce, how much to produce, and when to produce. It involves setting goals and selecting the best course of action.\n" +
               "2. Organizing: Arranging and coordinating farm resources including land, labor, capital, and equipment for maximum efficiency.\n" +
               "3. Directing: Guiding and supervising farm workers, giving instructions, and motivating them to achieve farm goals.\n" +
               "4. Controlling: Monitoring farm activities, comparing results with plans, and taking corrective action when needed.\n\n" +
               "If you see question about 'three types of products' — answer:\n" +
               "1. Joint Products: Two or more products produced simultaneously from the same input. Example: wool and mutton from sheep.\n" +
               "2. By-products: Secondary products obtained during production of main product. Example: molasses from sugar production.\n" +
               "3. Complementary Products: Products whose production increases together without extra cost. Example: legumes and soil nitrogen.\n\n" +
               "If you see question about 'Least Cost Combination steps' — answer:\n" +
               "Step 1: Calculate the Marginal Physical Product (MPP) of each input by dividing change in output by change in input.\n" +
               "Step 2: Calculate the ratio of MPP to price for each input (MPP/Price). This gives the output per rupee spent on each input.\n" +
               "Step 3: Equate the MPP/Price ratios of all inputs. The combination where MPP1/P1 = MPP2/P2 is the least cost combination.\n\n" +
               "If you see question about 'MR, MVP, MIC' — answer:\n" +
               "MR (Marginal Revenue): Additional revenue earned by selling one more unit of output. Formula: MR = Change in TR / Change in output.\n" +
               "MVP (Marginal Value Product): Value of additional output produced by one more unit of input. Formula: MVP = MPP x Price of output.\n" +
               "MIC (Marginal Input Cost): Additional cost incurred by using one more unit of input. Formula: MIC = Change in TC / Change in input. Profit is maximized when MVP = MIC.\n\n" +
               "Now read the image and write complete answers for ALL questions shown, using the above answers where they match:")
            : (message || "Analyze this image and give complete useful information.")
          imageAnswer = await solveWithGemini(imageBase64, file.mimetype, sysPrompt, usrPrompt)
          console.log("[IMAGE] Gemini answered, length:", imageAnswer?.length)
        } catch(gemErr) {
          console.warn("[IMAGE] Gemini failed:", gemErr.message, "— trying fallback")
        }
      }

      // Fallback to GPT-4o if Gemini failed
      if (!imageAnswer && openai && isQuestionPaper) {
        try {
          console.log("[EXAM] Falling back to GPT-4o")
          imageAnswer = await solveExamWithGPT4o(imageBase64, file.mimetype, message || "", ainame)
        } catch(gptErr) {
          console.warn("[EXAM] GPT-4o also failed:", gptErr.message)
        }
      }

      // If we got an answer from Gemini or GPT-4o — stream it and return
      if (imageAnswer) {
        res.write(imageAnswer)
        chat.messages.push({ role: "assistant", content: imageAnswer })
        await chat.save()
        res.write("CHATID" + chat._id)
        res.end()
        cleanupRequest()
        return
      }
      // If both failed — fall through to Groq vision below
      console.warn("[IMAGE] All premium solvers failed — using Groq vision as last resort")
    }

    var groqAttempts = isImageFile
      ? [
          { model: "meta-llama/llama-4-scout-17b-16e-instruct", tokens: maxTok }
        ]
      // Structured/detailed/code/large → always use 70b (more capable, completes sections)
      : (isDeepKnowledge || isCodeTask || isLargeTask || isExplainQuestion || isStructuredTopic)
        ? [
            { model: "llama-3.3-70b-versatile", tokens: maxTok },
            { model: "llama-3.1-8b-instant",    tokens: Math.min(maxTok, 3000) }
          ]
        : [
            { model: "llama-3.1-8b-instant",    tokens: maxTok },
            { model: "llama-3.3-70b-versatile", tokens: Math.min(maxTok, 3000) }
          ]

    // ===== FINAL CONTENT SANITIZER =====
    // Convert non-string content to string.
    // EXCEPTION: last user message keeps array format ONLY when using vision model.
    // History messages (from old image chats) ALWAYS get converted to string.
    ;(function sanitizeGroqMessages() {
      var lastIdx = groqMessages.length - 1
      for (var _i = 0; _i < groqMessages.length; _i++) {
        var _m = groqMessages[_i]
        if (typeof _m.content === 'string') continue  // already string, skip

        // Last user message + vision model = keep array (needed for image analysis)
        if (_i === lastIdx && isVisionModel && Array.isArray(_m.content)) continue

        // Everything else: force to string
        var _raw
        try { _raw = JSON.parse(JSON.stringify(_m.content)) } catch(e) { _raw = null }
        
        if (Array.isArray(_raw)) {
          // Extract text parts only — strip image_url parts
          var _txt = _raw
            .filter(function(p) { return p && p.type === 'text' && p.text })
            .map(function(p) { return String(p.text) })
            .join(' ').trim()
          groqMessages[_i] = { role: _m.role, content: _txt || '[image message]' }
        } else if (_raw && typeof _raw === 'object') {
          groqMessages[_i] = { role: _m.role, content: String(_raw.text || _raw.content || '[message]') }
        } else {
          groqMessages[_i] = { role: _m.role, content: String(_raw || '[message]') }
        }
        console.log('[SANITIZED] messages['+_i+'] fixed to:', JSON.stringify(groqMessages[_i].content).slice(0,80))
      }
    })()
    // ===== END SANITIZER =====

    for (let attempt = 0; attempt < groqAttempts.length; attempt++) {
      var { model: tryModel, tokens: tryTokens } = groqAttempts[attempt]
      // Skip duplicate model
      if (attempt > 0 && tryModel === groqAttempts[attempt-1].model) continue

      try {
        console.log("[GROQ] attempt", attempt+1, "model:", tryModel, "tokens:", tryTokens)

        // Build clean messages for Groq
        // Last message keeps array ONLY for vision model (image analysis)
        // All history messages always converted to string (strips old image arrays)
        var safeMessages = groqMessages.map(function(m, idx) {
          var c = m.content
          if (typeof c === "string") return { role: m.role, content: c }

          // Keep array for last message when using vision model
          if (idx === groqMessages.length - 1 && isVisionModel && Array.isArray(c)) {
            return { role: m.role, content: c }
          }

          // Everything else: force to string, strip image data
          var arr
          try { arr = JSON.parse(JSON.stringify(c)) } catch(e) { arr = null }
          if (Array.isArray(arr)) {
            var txt = arr
              .filter(function(p) { return p && p.type === "text" && p.text })
              .map(function(p) { return String(p.text) })
              .join(" ").trim()
            return { role: m.role, content: txt || "[image message]" }
          }
          if (arr && typeof arr === "object") {
            return { role: m.role, content: String(arr.text || arr.content || "[message]") }
          }
          return { role: m.role, content: String(c || "[message]") }
        })

        // Log EXACT payload — will appear in Render logs
        console.log("[GROQ PAYLOAD] count:", safeMessages.length, "isImageFile:", isImageFile, "isVisionModel:", isVisionModel, "tryModel:", tryModel)
        safeMessages.forEach(function(m, i) {
          var t = typeof m.content
          var isArr = Array.isArray(m.content)
          var preview = t === "string" ? m.content.slice(0, 60) : JSON.stringify(m.content).slice(0, 60)
          console.log("[MSG "+i+"] role:", m.role, "type:", t, "isArray:", isArr, "preview:", preview.slice(0,80))
          if (t !== "string" && !isArr) console.error("[FATAL] messages["+i+"].content is NOT a string! value:", JSON.stringify(m.content))
          if (isArr) console.log("[ARRAY MSG "+i+"] has", m.content.length, "parts:", m.content.map(function(p){return p.type}).join(","))
        })

        stream = await groq.chat.completions.create({
          model: tryModel,
          messages: safeMessages,
          max_tokens: tryTokens,
          temperature: 0.7,
          stream: true
        })
        // Store controller so /stop endpoint can abort it
        userStreamControllers.set(userId, stream)

        for await (const part of stream) {
          // Stop if client disconnected
          if (res.writableEnded) break

          var token = part.choices?.[0]?.delta?.content
          if (token && typeof token === "string") {
            full += token
            // Max response size: 8000 chars — prevent runaway streams
            if (full.length > 8000) {
              console.log("[STREAM] Max size reached, stopping")
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
          // Wait before retry if rate limited
          if (status === 429 || groqErr.message?.includes("rate")) {
            console.log("[GROQ] rate limit — waiting 2s before retry")
            await new Promise(r => setTimeout(r, 2000))
          } else if (status === 500 || status === 503) {
            await new Promise(r => setTimeout(r, 1000))
          }
          continue
        }
      }
    }

    // If all attempts failed — write specific error to help debugging
    if (lastError && full === "") {
      var groqStatus = lastError.status || lastError.statusCode || 0
      var errMsg = ""
      if (groqStatus === 429) {
        errMsg = "⚠️ Datta AI is getting too many requests right now. Please wait 10 seconds and try again."
      } else if (groqStatus === 413 || (lastError.message || "").includes("too large")) {
        errMsg = "⚠️ Your message or context is too large. Try starting a new chat or send a shorter message."
      } else if (groqStatus === 401 || groqStatus === 403) {
        errMsg = "⚠️ AI service configuration error. Please contact support."
        console.error("[GROQ] Auth error — check GROQ_API_KEY in Render env vars")
      } else if (groqStatus === 503 || groqStatus === 500) {
        errMsg = "⚠️ AI service is temporarily unavailable. Please try again in a moment."
      } else {
        errMsg = "⚠️ Could not get a response. Please try again."
        console.error("[GROQ] Final error:", groqStatus, lastError.message?.slice(0,200))
      }
      if (!res.writableEnded) res.write(errMsg)
      full = errMsg
    }

    // Store user message with image reference (not full base64)
    if (isImageFile && chat.messages.length > 0) {
      var lastMsg = chat.messages[chat.messages.length - 1]
      if (lastMsg && lastMsg.role === "user" && Array.isArray(lastMsg.content)) {
        lastMsg.content = "[Image: " + file.originalname + "] " + (message || "")
      }
    }
    // Strip [object Object] from full response before saving or displaying
    full = full.split("[object Object]").join("")
    full = full.split("[Object object]").join("")
    full = full.split("[object object]").join("")
    full = full.trim()

    chat.messages.push({ role: "assistant", content: full })

    // Save memories from this conversation (non-blocking)
    if (!req.user.isGuest && message) {
      extractAndSaveMemory(userId, message, full).catch(() => {})
    }

    if (chat.messages.length === 4 || chat.title === "New conversation") {
      try {
        var t = await groq.chat.completions.create({ model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: "Generate a very short title (max 5 words, no quotes) for: \"" + message + "\". Just the title." }], max_tokens: 15 })
        var nt = t.choices?.[0]?.message?.content?.trim()
        if (nt && !nt.startsWith("[")) chat.title = nt
      } catch(e) {}
    }
    await chat.save()
    _heartbeatActive = false
    clearInterval(heartbeatTimer)
    cleanupRequest()
    if (!res.writableEnded) {
      res.write("CHATID" + chat._id)
      res.end()
    }
  } catch(err) {
    _heartbeatActive = false
    clearInterval(heartbeatTimer)
    cleanupRequest()
    console.error("Chat error:", err.message)
    if (!res.headersSent) res.status(500).send("Server error: " + err.message)
    else res.end()
  }
})

// ── LOGIN ALERT EMAIL ────────────────────────────────────────────────────────
async function sendLoginAlertEmail(email, username) {
  try {
    // Debug — visible in Render logs
    console.log("[LOGIN EMAIL] Attempting for:", email,
      "| ZOHO_USER set:", !!process.env.ZOHO_USER,
      "| ZOHO_PASS set:", !!process.env.ZOHO_PASS)

    if (!process.env.ZOHO_USER || !process.env.ZOHO_PASS) {
      console.log("[LOGIN EMAIL] BLOCKED — add ZOHO_USER and ZOHO_PASS in Render env vars")
      return false
    }

    const now = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short"
    })

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:32px 0;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background:#0a0a0a;border-radius:16px;overflow:hidden;max-width:480px;">
  <!-- Header -->
  <tr><td style="padding:26px 36px 20px;text-align:center;border-bottom:1px solid #1a1a1a;">
    <h1 style="margin:0;font-size:22px;color:#00ff88;letter-spacing:3px;">DATTA AI</h1>
    <p style="margin:5px 0 0;color:#444;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Login Alert</p>
  </td></tr>
  <!-- Body -->
  <tr><td style="padding:28px 36px;">
    <p style="color:#ccc;font-size:15px;margin:0 0 16px;">Hi <strong style="color:#fff;">${username}</strong>,</p>
    <p style="color:#aaa;font-size:14px;line-height:1.7;margin:0 0 20px;">
      You have successfully logged into <strong style="color:#fff;">Datta AI</strong>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border:1px solid #1e1e1e;border-radius:10px;margin:0 0 20px;">
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #1a1a1a;">
          <span style="color:#555;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Time</span><br>
          <span style="color:#ccc;font-size:13px;margin-top:3px;display:block;">${now} IST</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 16px;">
          <span style="color:#555;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Account</span><br>
          <span style="color:#ccc;font-size:13px;margin-top:3px;display:block;">${email}</span>
        </td>
      </tr>
    </table>
    <p style="color:#555;font-size:12px;margin:0 0 20px;line-height:1.6;">
      If this wasn't you, please secure your account immediately by changing your password.
    </p>
    <a href="https://datta-ai.com" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#00cc6a,#00aaff);border-radius:10px;color:#fff;font-weight:700;font-size:13px;text-decoration:none;letter-spacing:0.5px;">
      Open Datta AI →
    </a>
  </td></tr>
  <!-- Footer -->
  <tr><td style="padding:16px 36px;border-top:1px solid #111;text-align:center;">
    <p style="color:#333;font-size:11px;margin:0;">© 2026 Datta AI &nbsp;·&nbsp; <a href="https://datta-ai.com" style="color:#333;text-decoration:none;">datta-ai.com</a></p>
    <p style="color:#222;font-size:11px;margin:5px 0 0;">— Datta AI Team</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`

    const transporter = nodemailer.createTransport({
      host: "smtp.zoho.in",
      port: 465,
      secure: true,
      auth: { user: process.env.ZOHO_USER, pass: process.env.ZOHO_PASS }
    })

    await transporter.sendMail({
      from: '"Datta AI" <' + process.env.ZOHO_USER + '>',
      to: email,
      subject: "Login Alert — Datta AI",
      html,
      text: `Hi ${username},\n\nYou have successfully logged into Datta AI at ${now} IST.\n\nIf this wasn't you, secure your account immediately.\n\n— Datta AI Team`
    })

    console.log("[LOGIN EMAIL] Alert sent to:", email)
    return true
  } catch(e) {
    console.error("[LOGIN EMAIL] FAILED:", e.message, "| code:", e.code, "| response:", e.response)
    return false
  }
}

// ── EMAIL OTP SYSTEM ─────────────────────────────────────────────────────────
// POST /auth/send-email-otp — generates 6-digit OTP, sends via Zoho email
app.post("/auth/send-email-otp", async (req, res) => {
  try {
    const { email } = req.body
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: "Valid email required" })
    }
    const cleanEmail = email.trim().toLowerCase()

    // Rate limit: 1 OTP per email per 60 seconds
    const existing = emailOtpStore[cleanEmail]
    if (existing && (Date.now() - existing.sentAt) < 60000) {
      const waitSec = Math.ceil((60000 - (Date.now() - existing.sentAt)) / 1000)
      return res.status(429).json({ error: `Wait ${waitSec}s before requesting another OTP` })
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString()

    // Hash OTP with crypto — never store plain
    const crypto = await import("crypto")
    const hash = crypto.createHash("sha256").update(otp + cleanEmail).digest("hex")

    emailOtpStore[cleanEmail] = {
      hash,
      expires:  Date.now() + 5 * 60 * 1000, // 5 minutes
      attempts: 0,
      sentAt:   Date.now()
    }

    // Create tracking ID
    const trackId = crypto.randomBytes(16).toString("hex")
    await EmailTrack.create({ trackId, email: cleanEmail, type: "otp" }).catch(() => {})

    // Build tracking pixel URL
    const trackPixel = `https://datta-ai-server.onrender.com/track/open/${trackId}`
    const trackLink  = `https://datta-ai-server.onrender.com/track/click/${trackId}?url=https://datta-ai.com`

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:32px 0;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background:#0a0a0a;border-radius:16px;overflow:hidden;max-width:480px;">
  <tr><td style="padding:28px 36px 20px;text-align:center;border-bottom:1px solid #1a1a1a;">
    <h1 style="margin:0;font-size:24px;color:#00ff88;letter-spacing:3px;">DATTA AI</h1>
    <p style="margin:6px 0 0;color:#444;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Security Code</p>
  </td></tr>
  <tr><td style="padding:28px 36px;">
    <p style="color:#ccc;font-size:15px;margin:0 0 20px;line-height:1.6;">Your one-time password to sign in to <strong style="color:#fff;">Datta AI</strong>:</p>
    <div style="background:#111;border:1px solid #222;border-radius:12px;padding:20px;text-align:center;margin:0 0 20px;">
      <span style="font-size:38px;font-weight:700;letter-spacing:10px;color:#00ff88;font-family:Courier,monospace;">${otp}</span>
      <p style="color:#444;font-size:11px;margin:10px 0 0;">Expires in <strong style="color:#666;">5 minutes</strong></p>
    </div>
    <p style="color:#555;font-size:12px;margin:0;line-height:1.6;">If you did not request this code, you can safely ignore this email. Do not share this code with anyone.</p>
  </td></tr>
  <tr><td style="padding:16px 36px 24px;border-top:1px solid #111;text-align:center;">
    <p style="color:#333;font-size:11px;margin:0;">© 2026 Datta AI &nbsp;·&nbsp; <a href="${trackLink}" style="color:#444;text-decoration:none;">datta-ai.com</a></p>
  </td></tr>
</table>
</td></tr>
</table>
<img src="${trackPixel}" width="1" height="1" style="display:none;" alt="">
</body></html>`

    if (!process.env.ZOHO_USER || !process.env.ZOHO_PASS) {
      console.log("[EMAIL OTP] Creds missing. OTP for", cleanEmail, ":", otp)
      return res.json({ success: true, message: "OTP generated (email not configured)" })
    }

    const transporter = nodemailer.createTransport({
      host: "smtp.zoho.in", port: 465, secure: true,
      auth: { user: process.env.ZOHO_USER, pass: process.env.ZOHO_PASS }
    })
    await transporter.sendMail({
      from: '"Datta AI" <' + process.env.ZOHO_USER + '>',
      to: cleanEmail,
      subject: "Your Datta AI OTP: " + otp,
      html,
      text: "Your Datta AI OTP is: " + otp + "\nExpires in 5 minutes. Do not share."
    })

    console.log("[EMAIL OTP] Sent to:", cleanEmail)
    res.json({ success: true, message: "OTP sent to " + cleanEmail })

  } catch(err) {
    console.error("[EMAIL OTP] Error:", err.message)
    res.status(500).json({ error: "Failed to send OTP" })
  }
})

// POST /auth/verify-email-otp — verify the 6-digit OTP
app.post("/auth/verify-email-otp", async (req, res) => {
  try {
    const { email, otp } = req.body
    if (!email || !otp) return res.status(400).json({ error: "Email and OTP required" })
    const cleanEmail = email.trim().toLowerCase()
    const stored = emailOtpStore[cleanEmail]

    if (!stored) return res.status(400).json({ error: "No OTP found. Request a new one." })
    if (Date.now() > stored.expires) {
      delete emailOtpStore[cleanEmail]
      return res.status(400).json({ error: "OTP expired. Request a new one." })
    }

    // Brute force protection: max 5 attempts
    stored.attempts = (stored.attempts || 0) + 1
    if (stored.attempts > 5) {
      delete emailOtpStore[cleanEmail]
      return res.status(429).json({ error: "Too many attempts. Request a new OTP." })
    }

    const crypto = await import("crypto")
    const hash = crypto.createHash("sha256").update(otp + cleanEmail).digest("hex")

    if (hash !== stored.hash) {
      const left = 5 - stored.attempts
      return res.status(400).json({ error: `Invalid OTP. ${left} attempt${left===1?"":"s"} left.` })
    }

    // Valid — clean up
    delete emailOtpStore[cleanEmail]
    console.log("[EMAIL OTP] Verified for:", cleanEmail)
    res.json({ success: true, message: "OTP verified successfully" })

  } catch(err) {
    res.status(500).json({ error: sanitizeError(err).userMsg })
  }
})

// ── EMAIL TRACKING ROUTES ─────────────────────────────────────────────────────

// GET /track/open/:id — 1x1 tracking pixel, logs email open
app.get("/track/open/:id", async (req, res) => {
  try {
    await EmailTrack.findOneAndUpdate(
      { trackId: req.params.id, openedAt: null },
      { openedAt: new Date() }
    ).catch(() => {})
  } catch(e) {}
  // Return 1x1 transparent GIF
  const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7","base64")
  res.set({ "Content-Type":"image/gif", "Cache-Control":"no-store,no-cache,must-revalidate", "Pragma":"no-cache" })
  res.send(gif)
})

// GET /track/click/:id — logs click then redirects to real URL
app.get("/track/click/:id", async (req, res) => {
  const url = req.query.url || "https://datta-ai.com"
  try {
    await EmailTrack.findOneAndUpdate(
      { trackId: req.params.id },
      { $push: { clicks: { url, clickedAt: new Date() } } }
    ).catch(() => {})
  } catch(e) {}
  res.redirect(url)
})

// GET /admin/email-stats — admin only, see open/click rates
app.get("/admin/email-stats", authMiddleware, async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Admin only" })
  try {
    const total  = await EmailTrack.countDocuments()
    const opened = await EmailTrack.countDocuments({ openedAt: { $ne: null } })
    const recent = await EmailTrack.find().sort({ sentAt: -1 }).limit(20)
    res.json({
      total, opened,
      openRate: total > 0 ? ((opened/total)*100).toFixed(1)+"%" : "0%",
      recent
    })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

// ── STOP ENDPOINT — client calls this when Stop button clicked ───────────────
app.post("/stop", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id
    const ctrl = userStreamControllers.get(userId)
    if (ctrl) {
      try { ctrl.controller?.abort() } catch(e) {}
      userStreamControllers.delete(userId)
    }
    activeRequests.delete(userId)
    res.json({ success: true, message: "Stream stopped" })
    console.log("[STOP] userId:", userId)
  } catch(err) {
    res.status(500).json({ error: "Stop failed" })
  }
})

// AUTO FIX BAD TITLES
app.post("/chats/fix-titles", authMiddleware, async (req, res) => {
  try {
    var badTitles = ["hi", "hii", "hiii", "hello", "hey", "helo", "hai", "sup", "yo", "new conversation", "new chat", "hiya"]
    var chats = await Chat.find({ userId: req.user.id })
    let fixed = 0

    for (const chat of chats) {
      var titleLower = chat.title.toLowerCase().trim()
      if (badTitles.includes(titleLower) && chat.messages.length >= 2) {
        // Find first real user message
        var firstReal = chat.messages.find(m =>
          m.role === "user" && m.content && m.content.length > 3 &&
          !badTitles.includes(m.content.toLowerCase().trim())
        )
        if (firstReal) {
          try {
            var t = await groq.chat.completions.create({
              model: "llama-3.1-8b-instant",
              messages: [{ role: "user", content: "Generate a very short title (max 5 words, no quotes) for a chat that is about: " + firstReal.content.substring(0, 200) + ". Just the title." }],
              max_tokens: 15
            })
            var newTitle = t.choices?.[0]?.message?.content?.trim()
            if (newTitle && !newTitle.startsWith("[") && newTitle.length > 2) {
              chat.title = newTitle
              await chat.save()
              fixed++
            }
          } catch(e) {}
        }
      }
    }
    res.json({ success: true, fixed })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

// REFERRAL SYSTEM
const ReferralSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  code: { type: String, unique: true },
  referredUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  bonusMessages: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
})
const Referral = mongoose.model("Referral", ReferralSchema)

// Get or create referral code
app.get("/referral/code", authMiddleware, async (req, res) => {
  try {
    let ref = await Referral.findOne({ userId: req.user.id })
    if (!ref) {
      const code = "DATTA" + Math.random().toString(36).substring(2,7).toUpperCase()
      ref = await Referral.create({ userId: req.user.id, code })
    }
    res.json({ code: ref.code, referredCount: ref.referredUsers.length, bonusMessages: ref.bonusMessages })
  } catch(e) { res.status(500).json({ error: sanitizeError(e).userMsg }) }
})

// Apply referral code on signup
app.post("/referral/apply", authMiddleware, async (req, res) => {
  try {
    const { code } = req.body
    const ref = await Referral.findOne({ code: code.toUpperCase() })
    if (!ref) return res.status(404).json({ error: "Invalid referral code" })
    if (ref.userId.toString() === req.user.id) return res.status(400).json({ error: "Cannot use your own code" })
    // Check not already referred
    if (ref.referredUsers.includes(req.user.id)) return res.status(400).json({ error: "Already used" })
    // Add bonus - 10 extra messages to referrer
    ref.referredUsers.push(req.user.id)
    ref.bonusMessages += 10
    await ref.save()
    // Give bonus to new user too
    let newUserRef = await Referral.findOne({ userId: req.user.id })
    if (!newUserRef) {
      const newCode = "DATTA" + Math.random().toString(36).substring(2,7).toUpperCase()
      await Referral.create({ userId: req.user.id, code: newCode, bonusMessages: 5 })
    }
    res.json({ success: true, message: "Referral applied! You both get bonus messages." })
  } catch(e) { res.status(500).json({ error: sanitizeError(e).userMsg }) }
})

// USER USAGE ROUTE - reads from MongoDB
// GET /auth/me — returns current user info from token
app.get("/auth/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password -verifyToken").lean()
    if (!user) return res.status(404).json({ error: "User not found" })
    const sub = await Subscription.findOne({ userId: user._id, active: true }).catch(() => null)
    res.json({
      id: user._id,
      username: user.username,
      email: user.email,
      emailVerified: user.emailVerified,
      plan: sub ? sub.plan : "free"
    })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

app.get("/user/usage", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id
    const sub = await Subscription.findOne({ userId, active: true }).catch(() => null)
    const plan = sub ? sub.plan : "free"
    const limits = planLimits[plan] || planLimits.free

    const usage = await Usage.findOne({ userId }) || { messagesUsed:0, imagesUsed:0, totalMessages:0, totalImages:0, windowStart: new Date(), imageWindowStart: new Date() }

    const now = new Date()
    const resetMs = limits.resetHours * 60 * 60 * 1000
    // Free plan never resets - show 0 resetIn
    const resetIn = (plan === "free" || resetMs <= 0 || limits.resetHours >= 9999)
      ? 0
      : Math.max(0, resetMs - (now - usage.windowStart))

    let msgLimit = limits.messages

    const waitMins = resetIn > 0 ? Math.ceil(resetIn / 60000) : 0

    res.json({
      plan,
      messagesUsed: usage.messagesUsed || 0,
      imagesUsed: usage.imagesUsed || 0,
      totalMessages: usage.totalMessages || 0,
      totalImages: usage.totalImages || 0,
      limit: msgLimit,
      imageLimit: limits.images,
      resetHours: limits.resetHours,
      waitMins,
      resetIn
    })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

// MEMORY ROUTES
app.get("/memory", authMiddleware, async (req, res) => {
  try {
    const memories = await Memory.find({ userId: req.user.id }).sort({ updatedAt: -1 })
    res.json(memories)
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

app.post("/memory", authMiddleware, async (req, res) => {
  try {
    const { key, value, category } = req.body
    if (!key || !value) return res.status(400).json({ error: "Key and value required" })
    await saveMemory(req.user.id, key, value, category)
    res.json({ success: true })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

app.delete("/memory/:key", authMiddleware, async (req, res) => {
  try {
    await Memory.findOneAndDelete({ userId: req.user.id, key: req.params.key })
    res.json({ success: true })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

app.delete("/memory", authMiddleware, async (req, res) => {
  try {
    await Memory.deleteMany({ userId: req.user.id })
    res.json({ success: true })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

// CHAT HISTORY
app.get("/chats", authMiddleware, async (req, res) => { try { res.json(await Chat.find({ userId: req.user.id }).sort({ createdAt: -1 }).select("title createdAt")) } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) } })
app.get("/chat/:id", authMiddleware, async (req, res) => { try { const c = await Chat.findOne({ _id: req.params.id, userId: req.user.id }); res.json(c ? c.messages : []) } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) } })
app.delete("/chat/:id", authMiddleware, async (req, res) => { try { await Chat.findOneAndDelete({ _id: req.params.id, userId: req.user.id }); res.json({ success: true }) } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) } })
app.delete("/chats/all", authMiddleware, async (req, res) => { try { await Chat.deleteMany({ userId: req.user.id }); res.json({ success: true }) } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) } })
app.post("/chat/:id/rename", authMiddleware, async (req, res) => { try { await Chat.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, { title: req.body.title }); res.json({ success: true }) } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) } })

// ANALYTICS DASHBOARD
app.get("/analytics", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id
    const [totalChats, totalMessages, subscription] = await Promise.all([
      Chat.countDocuments({ userId }),
      Chat.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        { $project: { count: { $size: "$messages" } } },
        { $group: { _id: null, total: { $sum: "$count" } } }
      ]),
      Subscription.findOne({ userId, active: true })
    ])
    const msgs = totalMessages[0]?.total || 0
    res.json({
      totalChats,
      totalMessages: msgs,
      plan: subscription?.plan || "free",
      memberSince: req.user.iat ? new Date(req.user.iat * 1000).toLocaleDateString() : "Unknown"
    })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})


// ------------------------------------------------------
// ADMIN DASHBOARD ROUTES
// ------------------------------------------------------
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "harisaiganeshpampana@gmail.com").split(",")

function isAdmin(req) {
  return req.user && (ADMIN_EMAILS.includes(req.user.email) || req.user.isAdmin)
}

// Admin gets unlimited plan access — used in usage and model checks
function getEffectivePlan(req, subPlan) {
  if (isAdmin(req)) return "ultramax"   // admin = unlimited everything
  return subPlan || "free"
}

// Plan prices for revenue calculation
const PLAN_PRICES = { free:0, starter:29, standard:149, plus:299, pro:499, ultimate:799, "ultra-mini":10, mini:199, max:1999, ultramax:0, basic:499, enterprise:0 }

app.get("/admin/stats", authMiddleware, async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Not authorized" })
  try {
    const [totalUsers, totalChats, totalMessages, plans] = await Promise.all([
      User.countDocuments(),
      Chat.countDocuments(),
      Chat.aggregate([{ $project: { count: { $size: "$messages" } } }, { $group: { _id: null, total: { $sum: "$count" } } }]),
      Subscription.aggregate([{ $group: { _id: "$plan", count: { $sum: 1 } } }])
    ])
    const today = new Date(); today.setHours(0,0,0,0)
    const newUsersToday = await User.countDocuments({ createdAt: { $gte: today } })
    const newChatsToday = await Chat.countDocuments({ createdAt: { $gte: today } })
    const planStats = {}
    plans.forEach(p => { planStats[p._id || "free"] = p.count })
    res.json({
      totalUsers, totalChats,
      totalMessages: totalMessages[0]?.total || 0,
      newUsersToday, newChatsToday,
      planStats,
      revenue: {
        basic: (planStats.basic || 0) * 199,
        pro: (planStats.pro || 0) * 499,
        enterprise: (planStats.enterprise || 0) * 1499
      }
    })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

// Full dashboard endpoint with all metrics
app.get("/admin/dashboard", authMiddleware, async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Not authorized" })
  try {
    const now    = new Date()
    const today  = new Date(now); today.setHours(0,0,0,0)
    const h24ago = new Date(now - 24*60*60*1000)
    const d7ago  = new Date(now - 7*24*60*60*1000)
    const d30ago = new Date(now - 30*24*60*60*1000)

    const [
      totalUsers,
      activeUsers24h,
      newUsersToday,
      newUsers7d,
      activeSubs,
      planGroups,
      totalMessages,
      recentSubs
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ updatedAt: { $gte: h24ago } }),
      User.countDocuments({ createdAt: { $gte: today } }),
      User.countDocuments({ createdAt: { $gte: d7ago } }),
      Subscription.countDocuments({ active: true }),
      Subscription.aggregate([
        { $match: { active: true } },
        { $group: { _id: "$plan", count: { $sum: 1 } } }
      ]),
      Chat.aggregate([
        { $project: { count: { $size: "$messages" } } },
        { $group: { _id: null, total: { $sum: "$count" } } }
      ]),
      Subscription.find({ active: true })
        .sort({ startDate: -1 })
        .limit(10)
        .populate("userId", "username email")
        .catch(() => [])
    ])

    // Plan distribution
    const planStats = { free: 0, starter: 0, plus: 0, pro: 0, ultimate: 0, standard: 0, "ultra-mini": 0, mini: 0, max: 0, ultramax: 0 }
    planGroups.forEach(p => { if (p._id) planStats[p._id] = p.count })
    planStats.free = Math.max(0, totalUsers - activeSubs)

    // MRR — monthly recurring revenue
    let mrr = 0
    Object.entries(planStats).forEach(([plan, count]) => {
      if (plan !== "free") mrr += (PLAN_PRICES[plan] || 0) * count
    })

    // Conversion rate
    const paidUsers = activeSubs
    const conversionRate = totalUsers > 0 ? ((paidUsers / totalUsers) * 100).toFixed(1) : "0.0"

    // Daily messages last 7 days
    const dailyMessages = await Chat.aggregate([
      { $match: { createdAt: { $gte: d7ago } } },
      { $project: {
        day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $size: "$messages" }
      }},
      { $group: { _id: "$day", messages: { $sum: "$count" } } },
      { $sort: { _id: 1 } }
    ])

    // Recent subscriptions formatted
    const recentSubsFormatted = recentSubs.map(s => ({
      user: s.userId?.username || s.userId?.email || "Unknown",
      plan: s.plan,
      amount: PLAN_PRICES[s.plan] || 0,
      startDate: s.startDate,
      method: s.method || "web"
    }))

    res.json({
      totalUsers,
      activeUsers24h,
      newUsersToday,
      newUsers7d,
      activeSubs,
      mrr,
      totalRevenue: mrr,  // simplified: MRR as proxy for monthly revenue
      conversionRate: parseFloat(conversionRate),
      planStats,
      totalMessages: totalMessages[0]?.total || 0,
      dailyMessages,
      recentSubscriptions: recentSubsFormatted
    })
  } catch(err) {
    console.error("Dashboard error:", err.message)
    res.status(500).json({ error: sanitizeError(err).userMsg })
  }
})

app.get("/admin/users", authMiddleware, async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Not authorized" })
  try {
    const page = parseInt(req.query.page) || 1
    const limit = 20
    const users = await User.find().sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit).select("-password")
    const total = await User.countDocuments()
    const subs = await Subscription.find({ active: true })
    const subMap = {}
    subs.forEach(s => { subMap[s.userId.toString()] = s.plan })
    const usersWithPlan = users.map(u => ({ ...u.toObject(), plan: subMap[u._id.toString()] || "free" }))
    res.json({ users: usersWithPlan, total, pages: Math.ceil(total/limit) })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

app.delete("/admin/user/:id", authMiddleware, async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Not authorized" })
  try {
    await Promise.all([
      User.findByIdAndDelete(req.params.id),
      Chat.deleteMany({ userId: req.params.id }),
      Subscription.deleteMany({ userId: req.params.id })
    ])
    res.json({ success: true })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

// ------------------------------------------------------
// PUBLIC API - Let others use Datta AI
// ------------------------------------------------------
const ApiKeySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  key: { type: String, unique: true },
  name: String,
  requests: { type: Number, default: 0 },
  limit: { type: Number, default: 1000 },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
})
const ApiKey = mongoose.model("ApiKey", ApiKeySchema)

function generateApiKey() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let key = "datta_"
  for (let i = 0; i < 32; i++) key += chars[Math.floor(Math.random() * chars.length)]
  return key
}

app.post("/api/keys", authMiddleware, async (req, res) => {
  try {
    const { name } = req.body
    const existing = await ApiKey.countDocuments({ userId: req.user.id })
    if (existing >= 3) return res.status(400).json({ error: "Max 3 API keys allowed" })
    const key = await ApiKey.create({ userId: req.user.id, key: generateApiKey(), name: name || "My API Key" })
    res.json({ key: key.key, name: key.name, limit: key.limit })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

app.get("/api/keys", authMiddleware, async (req, res) => {
  try {
    const keys = await ApiKey.find({ userId: req.user.id }).select("-__v")
    res.json(keys)
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

app.delete("/api/keys/:key", authMiddleware, async (req, res) => {
  try {
    await ApiKey.findOneAndDelete({ userId: req.user.id, key: req.params.key })
    res.json({ success: true })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

// PUBLIC API ENDPOINT
app.post("/api/v1/chat", async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"] || req.body.api_key
    if (!apiKey) return res.status(401).json({ error: "API key required. Get one at " + FRONTEND_URL + "/setting.html" })
    const keyDoc = await ApiKey.findOne({ key: apiKey, active: true })
    if (!keyDoc) return res.status(401).json({ error: "Invalid API key" })
    if (keyDoc.requests >= keyDoc.limit) return res.status(429).json({ error: "API limit reached. Upgrade plan for more." })

    const { message, model, language, style } = req.body
    if (!message) return res.status(400).json({ error: "message is required" })

    await ApiKey.findByIdAndUpdate(keyDoc._id, { $inc: { requests: 1 } })

    const useModel = model || "llama-3.3-70b-versatile"
    const completion = await groq.chat.completions.create({
      model: useModel,
      messages: [
        { role: "system", content: "You are Datta AI, a helpful assistant." + (language ? " Respond in " + language + "." : "") + (style ? " Style: " + style : "") },
        { role: "user", content: message }
      ],
      max_tokens: 2048
    })

    res.json({
      response: completion.choices[0]?.message?.content || "",
      model: useModel,
      requests_used: keyDoc.requests + 1,
      requests_limit: keyDoc.limit
    })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

// ------------------------------------------------------
// SHARE CHAT AS PUBLIC LINK
// ------------------------------------------------------
const SharedChatSchema = new mongoose.Schema({
  shareId: { type: String, unique: true },
  chatId: mongoose.Schema.Types.ObjectId,
  userId: mongoose.Schema.Types.ObjectId,
  title: String,
  messages: Array,
  createdAt: { type: Date, default: Date.now },
  views: { type: Number, default: 0 }
})
const SharedChat = mongoose.model("SharedChat", SharedChatSchema)

app.post("/chat/:id/share", authMiddleware, async (req, res) => {
  try {
    const chat = await Chat.findOne({ _id: req.params.id, userId: req.user.id })
    if (!chat) return res.status(404).json({ error: "Chat not found" })
    const existing = await SharedChat.findOne({ chatId: chat._id })
    if (existing) return res.json({ shareId: existing.shareId, url: FRONTEND_URL + "/share.html?id=" + existing.shareId })
    const shareId = Math.random().toString(36).substring(2, 10)
    await SharedChat.create({ shareId, chatId: chat._id, userId: req.user.id, title: chat.title, messages: chat.messages })
    res.json({ shareId, url: FRONTEND_URL + "/share.html?id=" + shareId })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

app.get("/share/:shareId", async (req, res) => {
  try {
    const shared = await SharedChat.findOneAndUpdate({ shareId: req.params.shareId }, { $inc: { views: 1 } }, { new: true })
    if (!shared) return res.status(404).json({ error: "Shared chat not found" })
    res.json({ title: shared.title, messages: shared.messages, views: shared.views, createdAt: shared.createdAt })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

// ------------------------------------------------------
// AI PROJECTS
// ------------------------------------------------------
const ProjectSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: { type: String, default: "New Project" },
  description: String,
  color: { type: String, default: "#00ff88" },
  emoji: { type: String, default: "-" },
  chatIds: [mongoose.Schema.Types.ObjectId],
  files: Array,
  createdAt: { type: Date, default: Date.now }
})
const Project = mongoose.model("Project", ProjectSchema)

app.get("/projects", authMiddleware, async (req, res) => {
  try { res.json(await Project.find({ userId: req.user.id }).sort({ createdAt: -1 })) }
  catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

app.post("/projects", authMiddleware, async (req, res) => {
  try {
    const { name, description, color, emoji } = req.body
    const project = await Project.create({ userId: req.user.id, name, description, color, emoji })
    res.json(project)
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

app.put("/projects/:id", authMiddleware, async (req, res) => {
  try {
    const project = await Project.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, req.body, { new: true })
    res.json(project)
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

app.delete("/projects/:id", authMiddleware, async (req, res) => {
  try {
    await Project.findOneAndDelete({ _id: req.params.id, userId: req.user.id })
    res.json({ success: true })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

// ------------------------------------------------------
// CODE EXECUTION (safe JS only)
// ------------------------------------------------------
app.post("/execute", authMiddleware, async (req, res) => {
  try {
    const { code, language } = req.body
    if (!code) return res.status(400).json({ error: "No code provided" })

    if (language === "javascript" || language === "js") {
      const logs = []
      const errors = []
      let result = null
      try {
        const fn = new Function("console", "Math", "Date", "JSON", "parseInt", "parseFloat", "String", "Number", "Array", "Object",
          `"use strict"; const output = []; ` + code + `; return output;`
        )
        const mockConsole = {
          log: (...a) => logs.push(a.map(x => typeof x === "object" ? JSON.stringify(x) : String(x)).join(" ")),
          error: (...a) => errors.push(a.join(" ")),
          warn: (...a) => logs.push("WARN: " + a.join(" "))
        }
        result = fn(mockConsole, Math, Date, JSON, parseInt, parseFloat, String, Number, Array, Object)
      } catch(e) { errors.push(e.message) }
      return res.json({ output: logs.join("\n"), errors: errors.join("\n"), language: "javascript" })
    }

    // For Python - use Judge0 API (free)
    if (language === "python") {
      const judge0Key = process.env.JUDGE0_API_KEY
      if (!judge0Key) {
        return res.json({ output: "", errors: "Python execution requires JUDGE0_API_KEY in Render. Get free key at rapidapi.com/judge0-official", language: "python" })
      }
      const submitRes = await fetch("https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=false&wait=true", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-RapidAPI-Key": judge0Key, "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com" },
        body: JSON.stringify({ source_code: code, language_id: 71, stdin: "" })
      })
      const result = await submitRes.json()
      return res.json({ output: result.stdout || "", errors: result.stderr || result.compile_output || "", language: "python" })
    }

    res.json({ output: "", errors: "Language not supported yet. JavaScript and Python are available.", language })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

// SMART SUGGESTIONS based on user history
app.get("/suggestions", authMiddleware, async (req, res) => {
  try {
    const recentChats = await Chat.find({ userId: req.user.id }).sort({ updatedAt: -1 }).limit(3)
    const topics = recentChats.map(c => c.title).filter(Boolean).join(", ")

    const suggestions = [
      "Build me a portfolio website",
      "Write a Python web scraper",
      "Create an image of a sunset",
      "Explain quantum computing simply",
      "Write a business email template",
      "Create a React todo app"
    ]

    if (topics) {
      const completion = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: `Based on these recent chat topics: "${topics}", suggest 4 short follow-up questions or tasks the user might want to do next. Return as JSON array of strings, max 8 words each. Example: ["Build a React dashboard", "Add dark mode to website"]. Return ONLY the JSON array.` }],
        max_tokens: 100,
        temperature: 0.8
      })
      const raw = completion.choices?.[0]?.message?.content?.trim()
      try {
        const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim())
        if (Array.isArray(parsed)) return res.json(parsed.slice(0, 4))
      } catch(e) {}
    }

    res.json(suggestions.sort(() => Math.random() - 0.5).slice(0, 4))
  } catch(err) {
    res.json([
      "Build me a portfolio website",
      "Create an image of a sunset",
      "Write a Python script",
      "Explain AI in simple terms"
    ])
  }
})

// TOGETHER AI - Dedicated coding model for Datta 5.4
async function callTogetherAI(messages, systemPrompt, maxTokens = 8192, model = "deepseek-ai/DeepSeek-V3") {
  const apiKey = process.env.TOGETHER_API_KEY
  if (!apiKey) throw new Error("TOGETHER_API_KEY not configured")

  const response = await fetch("https://api.together.xyz/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey
    },
    body: JSON.stringify({
      model: model,  // Dynamic model selection
      messages: [
        { role: "system", content: systemPrompt },
        ...messages
      ],
      max_tokens: maxTokens,
      temperature: 0.3,  // Lower temperature for more precise code
      stream: true
    })
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message || "Together AI error")
  }

  return response
}

// EXPORT CHAT
app.get("/chat/:id/export", authMiddleware, async (req, res) => {
  try {
    const chat = await Chat.findOne({ _id: req.params.id, userId: req.user.id })
    if (!chat) return res.status(404).json({ error: "Chat not found" })
    const sep = "=".repeat(40)
    const lines = [
      "DATTA AI - Chat Export",
      sep,
      "Title: " + (chat.title || "Untitled"),
      "Date: " + new Date(chat.createdAt).toLocaleDateString(),
      sep, ""
    ]
    chat.messages.forEach(m => {
      const role = m.role === "user" ? "You" : "Datta AI"
      const text = typeof m.content === "string" ? m.content : "[File/Image]"
      lines.push("[" + role + "]")
      lines.push(text)
      lines.push("")
    })
    const output = lines.join("\n")
    res.setHeader("Content-Type", "text/plain")
    res.setHeader("Content-Disposition", "attachment; filename=datta-ai-chat.txt")
    res.send(output)
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})
// AI LENS ROUTE
app.post("/lens", authMiddleware, async (req, res) => {
  try {
    const { image, prompt } = req.body
    if (!image) return res.status(400).json({ error: "Image required" })

    // Trim base64 if too large (max 4MB)
    const maxLen = 4 * 1024 * 1024 * 1.33 // base64 overhead
    const trimmedImage = image.length > maxLen ? image.substring(0, maxLen) : image

    const completion = await groq.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt || "Analyze this image in detail. Describe everything you see." },
          { type: "image_url", image_url: { url: "data:image/jpeg;base64," + trimmedImage } }
        ]
      }],
      max_tokens: 1024,
      temperature: 0.3
    })

    const result = completion.choices?.[0]?.message?.content || "Could not analyze image"
    res.json({ result })
  } catch(err) {
    console.error("Lens error:", err.message)
    res.status(500).json({ error: sanitizeError(err).userMsg })
  }
})

// VERSION CHECK
const APP_VERSION = "37"
const MIN_VERSION = "37"

app.get("/version", (req, res) => {
  const clientVersion = req.query.v || "0"
  const isBlocked = parseInt(clientVersion) < parseInt(MIN_VERSION)
  res.json({
    latest: APP_VERSION,
    minimum: MIN_VERSION,
    blocked: isBlocked,
    updateRequired: isBlocked,
    updateUrl: process.env.FRONTEND_URL || "https://harisaiganeshpampana-ai.github.io/datta-ai",
    changelog: [
      "Fixed Add to chat issue",
      "New model selector",
      "Better mobile UI",
      "AI Lens feature",
      "Bug fixes"
    ]
  })
})

app.get("/", (req, res) => res.json({ status: "Datta AI Server running", version: "3.5" }))



// ── GOOGLE PLAY BILLING VERIFICATION ─────────────────────────────────────────
// Verifies purchase token with Google Play Developer API
// Requires: GOOGLE_PLAY_CLIENT_EMAIL + GOOGLE_PLAY_PRIVATE_KEY in Render env vars
// Package name must match Play Console: com.datta.ai

const PLAY_PACKAGE = "com.datta.ai"

const PLAY_PRODUCT_MAP = {
  "datta_plus_monthly": { plan: "plus",  days: 31, label: "Plus Plan" },
  "datta_pro_monthly":  { plan: "pro",   days: 31, label: "Pro Plan"  }
}

// Get Google OAuth2 access token for Play Developer API
async function getGoogleAccessToken() {
  const clientEmail  = process.env.GOOGLE_PLAY_CLIENT_EMAIL
  const privateKey   = (process.env.GOOGLE_PLAY_PRIVATE_KEY || "").replace(/\\n/g, "\n")
  if (!clientEmail || !privateKey) throw new Error("GOOGLE_PLAY_CLIENT_EMAIL or GOOGLE_PLAY_PRIVATE_KEY missing")

  const now   = Math.floor(Date.now() / 1000)
  const claim = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  }

  // Sign JWT — use jsonwebtoken (already imported)
  const assertion = jwt.sign(claim, privateKey, { algorithm: "RS256" })

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  })
  if (!resp.ok) throw new Error("Google OAuth failed: " + resp.status)
  const data = await resp.json()
  return data.access_token
}

// Verify subscription with Google Play Developer API
async function verifyPlaySubscription(productId, purchaseToken) {
  const accessToken = await getGoogleAccessToken()
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PLAY_PACKAGE}/purchases/subscriptions/${productId}/tokens/${purchaseToken}`

  const resp = await fetch(url, {
    headers: { "Authorization": "Bearer " + accessToken }
  })
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error("Play API error " + resp.status + ": " + err.slice(0, 100))
  }
  return await resp.json()
}

// POST /verify-purchase — called from Android app after successful purchase
app.post("/verify-purchase", authMiddleware, async (req, res) => {
  try {
    const { purchaseToken, productId } = req.body
    const userId = req.user.id

    // Validate inputs
    if (!purchaseToken || !productId) {
      return res.status(400).json({ error: "purchaseToken and productId required" })
    }
    if (!PLAY_PRODUCT_MAP[productId]) {
      return res.status(400).json({ error: "Unknown productId: " + productId })
    }

    // Verify with Google — NEVER trust frontend
    const playData = await verifyPlaySubscription(productId, purchaseToken)

    // Check subscription is active
    // paymentState: 1 = received, 2 = free trial
    const isActive = playData.paymentState === 1 || playData.paymentState === 2
    if (!isActive) {
      return res.status(402).json({ error: "PAYMENT_PENDING", message: "Payment not confirmed yet." })
    }

    // Check not cancelled
    if (playData.cancelReason !== undefined) {
      return res.status(402).json({ error: "SUBSCRIPTION_CANCELLED", message: "Subscription was cancelled." })
    }

    const productConfig = PLAY_PRODUCT_MAP[productId]
    const endDate = playData.expiryTimeMillis
      ? new Date(parseInt(playData.expiryTimeMillis))
      : new Date(Date.now() + productConfig.days * 24 * 60 * 60 * 1000)

    // Update subscription in DB
    await Subscription.findOneAndUpdate(
      { userId },
      {
        userId,
        plan: productConfig.plan,
        period: "monthly",
        paymentId: purchaseToken,
        method: "google_play",
        startDate: new Date(),
        endDate,
        active: true
      },
      { upsert: true, new: true }
    )

    console.log("[PLAY BILLING] Verified:", productId, "| plan:", productConfig.plan, "| user:", userId)
    res.json({
      success: true,
      plan: productConfig.plan,
      label: productConfig.label,
      endDate: endDate.toISOString()
    })

  } catch(err) {
    console.error("[PLAY BILLING] Error:", err.message)
    res.status(500).json({ error: "Verification failed: " + sanitizeError(err).userMsg })
  }
})

// POST /restore-purchases — called on app start to restore active subscription
app.post("/restore-purchases", authMiddleware, async (req, res) => {
  try {
    const { purchaseToken, productId } = req.body
    const userId = req.user.id

    if (!purchaseToken || !productId) {
      // No active purchase to restore — return current plan from DB
      const sub  = await Subscription.findOne({ userId, active: true }).catch(() => null)
      const plan = sub ? sub.plan : "free"
      return res.json({ plan, restored: false })
    }

    // Verify the token is still valid
    const playData = await verifyPlaySubscription(productId, purchaseToken)
    const isActive = playData.paymentState === 1 || playData.paymentState === 2
    const notExpired = playData.expiryTimeMillis
      ? parseInt(playData.expiryTimeMillis) > Date.now()
      : true

    if (!isActive || !notExpired) {
      // Subscription expired — downgrade to free
      await Subscription.findOneAndUpdate({ userId }, { active: false })
      return res.json({ plan: "free", restored: false, message: "Subscription expired" })
    }

    const productConfig = PLAY_PRODUCT_MAP[productId] || { plan: "plus", days: 31 }
    const endDate = new Date(parseInt(playData.expiryTimeMillis))

    await Subscription.findOneAndUpdate(
      { userId },
      { plan: productConfig.plan, endDate, active: true, method: "google_play", paymentId: purchaseToken },
      { upsert: true }
    )

    console.log("[PLAY BILLING] Restored:", productId, "| user:", userId)
    res.json({ plan: productConfig.plan, restored: true, endDate: endDate.toISOString() })

  } catch(err) {
    console.error("[PLAY BILLING] Restore error:", err.message)
    res.status(500).json({ error: sanitizeError(err).userMsg })
  }
})

// ── FEEDBACK SYSTEM ──────────────────────────────────────────────────────────
const FeedbackSchema = new mongoose.Schema({
  messageId: { type: String, required: true, unique: true },
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  chatId:    { type: String },
  feedback:  { type: String, enum: ["like","dislike"], required: true },
  model:     { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
})
const Feedback = mongoose.models.Feedback || mongoose.model("Feedback", FeedbackSchema)

// POST /feedback — store like/dislike for a message
app.post("/feedback", authMiddleware, async (req, res) => {
  try {
    const { messageId, feedback, chatId, model } = req.body
    if (!messageId) return res.status(400).json({ error: "messageId required" })
    if (!["like","dislike"].includes(feedback)) return res.status(400).json({ error: "Invalid feedback" })
    const userId = req.user.id

    // Upsert — allow changing mind (like → dislike), but one per message per user
    await Feedback.findOneAndUpdate(
      { messageId, userId },
      { messageId, userId, chatId: chatId || "", feedback, model: model || "", createdAt: new Date() },
      { upsert: true, new: true }
    )
    console.log("[FEEDBACK]", feedback, "| user:", userId, "| msg:", messageId, "| model:", model)
    res.json({ success: true })
  } catch(err) {
    res.status(500).json({ error: sanitizeError(err).userMsg })
  }
})

// GET /feedback/stats — admin analytics
app.get("/feedback/stats", authMiddleware, async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: "Admin only" })
    const total = await Feedback.countDocuments()
    const likes = await Feedback.countDocuments({ feedback: "like" })
    const dislikes = await Feedback.countDocuments({ feedback: "dislike" })
    const byModel = await Feedback.aggregate([
      { $group: { _id: { model: "$model", feedback: "$feedback" }, count: { $sum: 1 } } }
    ])
    res.json({ total, likes, dislikes, byModel })
  } catch(err) {
    res.status(500).json({ error: sanitizeError(err).userMsg })
  }
})

// ── STARTUP: Fix stale ultra-mini subscriptions ────────────────────────────
// Runs once on server start — reverts expired ultra-mini to previousPlan
;(async () => {
  try {
    await new Promise(r => setTimeout(r, 5000)) // wait for DB connection
    const now = new Date()
    const expired = await Subscription.find({
      plan: "ultra-mini",
      ultraMiniExpiry: { $lt: now }
    }).catch(() => [])
    for (const sub of expired) {
      const revert = sub.previousPlan || "free"
      await Subscription.findByIdAndUpdate(sub._id, { plan: revert, extraMessages: 0 })
      console.log("[STARTUP] Reverted expired ultra-mini for userId:", sub.userId, "→", revert)
    }
    if (expired.length > 0) console.log("[STARTUP] Fixed", expired.length, "expired ultra-mini subscriptions")
  } catch(e) { console.log("[STARTUP] ultra-mini cleanup error:", e.message) }
})()

// KEEP ALIVE - ping self every 5 minutes to prevent Render sleep
const SELF_URL = process.env.RAILWAY_PUBLIC_DOMAIN ? "https://" + process.env.RAILWAY_PUBLIC_DOMAIN : process.env.RENDER_EXTERNAL_URL || "https://datta-ai-server.onrender.com"
setInterval(async () => {
  try {
    await fetch(SELF_URL + "/ping")
    console.log("Keep-alive ping sent")
  } catch(e) {}
}, 14 * 60 * 1000) // 14 minutes



const PORT = process.env.PORT || 3000
// Global error handler — prevent crashes from unhandled errors
app.use((err, req, res, next) => {
  console.error("[GLOBAL ERROR]", err.message)
  if (!res.headersSent) res.status(500).json({ error: "Server error. Please try again." })
})

// Handle uncaught promise rejections — log but don't crash
process.on("unhandledRejection", (reason) => {
  console.error("[UNHANDLED REJECTION]", reason?.message || reason)
})

const server = app.listen(PORT, "0.0.0.0", () => console.log("Datta AI Server running on port " + PORT))

// Graceful shutdown — required for Render/Railway zero-downtime deploys
function gracefulShutdown(signal) {
  console.log("[SHUTDOWN] " + signal + " received — closing server")
  server.close(() => {
    console.log("[SHUTDOWN] HTTP server closed")
    // mongoose v7+ close() returns a Promise, no callback
    mongoose.connection.close().then(() => {
      console.log("[SHUTDOWN] MongoDB connection closed")
      process.exit(0)
    }).catch(() => {
      process.exit(0)
    })
  })
  // Force exit after 10s if hanging
  setTimeout(() => { console.error("[SHUTDOWN] Forced exit"); process.exit(0) }, 10000)
}
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))
process.on("SIGINT",  () => gracefulShutdown("SIGINT"))
