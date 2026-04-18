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
// CORS — allow all origins, always
app.use((req, res, next) => {
  const origin = req.headers.origin || "*"
  res.setHeader("Access-Control-Allow-Origin", origin)
  res.setHeader("Access-Control-Allow-Credentials", "true")
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,PATCH,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,x-chat-id,Accept,X-Requested-With")
  res.setHeader("Access-Control-Expose-Headers", "x-chat-id,Content-Type")
  res.setHeader("Access-Control-Max-Age", "86400")
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

  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=" + apiKey

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

async function cleanWrongMemories() {
  try {
    const deleted = await Memory.deleteMany({
      key: "user_name",
      value: { $in: ["John", "john", "John Doe", "User", "user", "Unknown"] }
    })
    if (deleted.deletedCount > 0) {
      console.log("[MEMORY] Cleaned", deleted.deletedCount, "wrong name memories")
    }
  } catch(e) {}
}

async function connectMongo(attempt) {
  attempt = attempt || 1
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      socketTimeoutMS: 30000,
    })
    console.log("MongoDB connected (attempt " + attempt + ")")
    // Clean wrong memories async after connect
    setImmediate(() => { if (typeof cleanWrongMemories === "function") cleanWrongMemories().catch(() => {}) })
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
// ── Gemini for code generation (text only, no image) ──────────────────────────
async function generateCodeWithGemini(systemPrompt, userPrompt, maxTokens) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("GEMINI_API_KEY not set")

  // Updated April 2026 — use v1beta with currently available models
  const modelsToTry = ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"]

  for (const modelName of modelsToTry) {
    try {
      const url = "https://generativelanguage.googleapis.com/v1beta/models/" + modelName + ":generateContent?key=" + apiKey
      console.log("[GEMINI CODE] Trying:", url.replace(apiKey, "KEY_HIDDEN"))
      const body = {
        contents: [{
          parts: [{ text: systemPrompt + "\n\n" + userPrompt }]
        }],
        generationConfig: {
          maxOutputTokens: Math.min(maxTokens || 4096, 4096),
          temperature: 0.4
        }
      }
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })
      if (!resp.ok) {
        const errText = await resp.text()
        console.warn("[GEMINI CODE] Model", modelName, "HTTP", resp.status, errText.slice(0, 150))
        continue
      }
      const data = await resp.json()
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ""
      if (text) {
        console.log("[GEMINI CODE] SUCCESS model:", modelName, "length:", text.length)
        return text
      }
    } catch(e) {
      console.warn("[GEMINI CODE] Model", modelName, "error:", e.message?.slice(0, 80))
    }
  }
  throw new Error("All Gemini code models failed")
}

async function solveWithGemini(imageBase64, mimeType, systemPrompt, userPrompt) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("Gemini not configured")

  const modelsToTry = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite"
  ]

  for (const modelName of modelsToTry) {
    try {
      const url = "https://generativelanguage.googleapis.com/v1beta/models/" + modelName + ":generateContent?key=" + apiKey
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
  previousPlan: { type: String, default: "free" },
  period: { type: String, default: "monthly" },
  paymentId: String,
  orderId: String,
  method: String,
  startDate: { type: Date, default: Date.now },
  endDate: Date,
  ultraMiniExpiry: Date,
  extraMessages: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  // FAMILY ACCOUNT — owner shares plan with up to 4 family members
  familyMembers: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    name: String,
    email: String,
    addedAt: { type: Date, default: Date.now }
  }],
  isFamilyPlan: { type: Boolean, default: false },
  familyOwnerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }  // if this user is a member, not owner
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
  freeD54Used: { type: Number, default: 0 },
  freeD54WindowStart: { type: Date, default: Date.now },
  dcodeUsed: { type: Number, default: 0 },          // Datta Code daily usage
  dcodeWindowStart: { type: Date, default: Date.now },
  firstEverMessage: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now }
})
const Usage = mongoose.model("Usage", UsageSchema)

// MEMORY SCHEMA - persistent cross-conversation memory like Claude
const MemorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  key: { type: String, required: true },
  value: { type: String, maxlength: 500 },
  category: { type: String, default: "general", enum: ["personal","project","preference","skill","goal","general"] },
  importance: { type: Number, default: 1 },  // 1=low, 2=medium, 3=high
  updatedAt: { type: Date, default: Date.now }
})
MemorySchema.index({ userId: 1, key: 1 }, { unique: true })
const Memory = mongoose.model("Memory", MemorySchema)


const planLimits = {
  // ── ACTIVE PLANS ────────────────────────────────────────────
  free:        { messages: 10,     resetHours: 24, models: ["d21","dcode","dthink"],       price: 0,   priority: 0, dcodeLimit: 3   },
  starter:     { messages: 40,     resetHours: 24, models: ["d21","d54","dcode","dthink"], price: 29,  priority: 1, dcodeLimit: 5   },
  plus:        { messages: 300,    resetHours: 24, models: ["d21","d54","dcode","dthink"], price: 299, priority: 2, dcodeLimit: 30  },
  pro:         { messages: 700,    resetHours: 24, models: ["d21","d54","dcode","dthink"], price: 499, priority: 3, dcodeLimit: 60  },
  ultimate:    { messages: 1500,   resetHours: 24, models: ["d21","d54","dcode","dthink"], price: 799, priority: 4, dcodeLimit: 300 },
  // ── LEGACY (keep for existing subscribers) ──────────────────
  "ultra-mini":{ messages: 20,     resetHours: 24, models: ["d21","dcode","dthink"],       price: 10,  priority: 1, extraMessages: 15, expiresHours: 24 },
  standard:    { messages: 120,    resetHours: 24, models: ["d21","d54","dcode","dthink"], price: 149, priority: 2 },
  mini:        { messages: 200,    resetHours: 24, models: ["d21","d54","dcode","dthink"], price: 199, priority: 2 },
  max:         { messages: 2000,   resetHours: 24, models: ["d21","d54","dcode","dthink"], price: 1999,priority: 5 },
  ultramax:    { messages: 999999, resetHours: 0,  models: ["all"],       price: 0,   priority: 6 },
  basic:       { messages: 500,    resetHours: 24, models: ["d21","d54","dcode","dthink"], price: 499, priority: 3 },
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

// ── TOOLS ─────────────────────────────────────────────────────────────────────

// Weather Tool — OpenWeatherMap free API
async function getWeather(location) {
  const apiKey = process.env.OPENWEATHER_API_KEY
  if (!apiKey) {
    // No API key — return null so AI handles it via web search
    console.log("[WEATHER] No OPENWEATHER_API_KEY set — skipping tool")
    return null
  }
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=metric`
    const resp = await fetch(url)
    if (!resp.ok) return null
    const data = await resp.json()
    const weather = {
      location: data.name + ", " + data.sys.country,
      temp: Math.round(data.main.temp),
      feels_like: Math.round(data.main.feels_like),
      condition: data.weather[0].description,
      humidity: data.main.humidity,
      wind: Math.round(data.wind.speed * 3.6), // m/s to km/h
      min: Math.round(data.main.temp_min),
      max: Math.round(data.main.temp_max)
    }
    return `🌤️ **Weather in ${weather.location}**
🌡️ Temperature: ${weather.temp}°C (feels like ${weather.feels_like}°C)
☁️ Condition: ${weather.condition.charAt(0).toUpperCase() + weather.condition.slice(1)}
💧 Humidity: ${weather.humidity}%
💨 Wind: ${weather.wind} km/h
📊 Today's range: ${weather.min}°C – ${weather.max}°C`
  } catch(e) {
    console.warn("[WEATHER] Error:", e.message)
    return null
  }
}

// Currency Tool — ExchangeRate-API free tier
async function convertCurrency(amount, from, to) {
  try {
    const url = `https://api.exchangerate-api.com/v4/latest/${from.toUpperCase()}`
    const resp = await fetch(url)
    if (!resp.ok) return null
    const data = await resp.json()
    const rate = data.rates[to.toUpperCase()]
    if (!rate) return null
    const converted = (amount * rate).toFixed(2)
    const rateDisplay = rate.toFixed(4)
    return `💱 **Currency Conversion**
${amount} ${from.toUpperCase()} = **${converted} ${to.toUpperCase()}**
Exchange rate: 1 ${from.toUpperCase()} = ${rateDisplay} ${to.toUpperCase()}
Rate source: ExchangeRate-API · Updated: ${new Date().toLocaleString("en-IN", {timeZone:"Asia/Kolkata"})}`
  } catch(e) {
    console.warn("[CURRENCY] Error:", e.message)
    return null
  }
}

// News Tool — NewsAPI free tier
async function getNews(topic, language) {
  const apiKey = process.env.NEWS_API_KEY
  if (!apiKey) return null
  try {
    const lang = language === "hi" ? "hi" : "en"
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(topic)}&language=${lang}&sortBy=publishedAt&pageSize=5&apiKey=${apiKey}`
    const resp = await fetch(url)
    if (!resp.ok) return null
    const data = await resp.json()
    if (!data.articles || data.articles.length === 0) return null
    let result = `📰 **Latest News: ${topic}**

`
    data.articles.slice(0, 4).forEach((a, i) => {
      const time = new Date(a.publishedAt).toLocaleString("en-IN", {timeZone:"Asia/Kolkata", day:"numeric", month:"short", hour:"2-digit", minute:"2-digit"})
      result += `**${i+1}. ${a.title}**
${a.description ? a.description.slice(0,120) + "..." : ""}
*${a.source.name} · ${time}*

`
    })
    return result.trim()
  } catch(e) {
    console.warn("[NEWS] Error:", e.message)
    return null
  }
}

// Tool detector — checks if user message needs a specific tool
function detectTool(message) {
  const msg = message.toLowerCase().trim()

  // Weather detection
  const weatherMatch = msg.match(/weather\s+(?:in|at|of|for)?\s*([a-z\s,]+?)(?:\?|$|today|tomorrow|now)/i) ||
                       msg.match(/(?:temperature|forecast|climate)\s+(?:in|at|of)?\s*([a-z\s,]+?)(?:\?|$)/i) ||
                       msg.match(/how(?:'s| is) (?:the )?weather\s+(?:in|at)?\s*([a-z\s,]+?)(?:\?|$)/i)
  if (weatherMatch) {
    const location = weatherMatch[1].trim()
    if (location.length > 1) return { type: "weather", location }
  }

  // Currency detection
  const currencyMatch = msg.match(/(\d+(?:\.\d+)?)\s*([a-z]{3})\s+(?:to|in|=)\s*([a-z]{3})/i) ||
                        msg.match(/convert\s+(\d+(?:\.\d+)?)\s*([a-z]{3})\s+to\s+([a-z]{3})/i) ||
                        msg.match(/(\d+(?:\.\d+)?)\s+(?:dollars?|usd|rupees?|inr|euros?|eur|pounds?|gbp|yen|jpy)\s+(?:to|in)\s+([a-z]+)/i)
  if (currencyMatch) {
    let amount, from, to
    if (currencyMatch[3]) {
      amount = parseFloat(currencyMatch[1])
      from = currencyMatch[2]
      to = currencyMatch[3]
    } else {
      const fromWords = { dollars:"USD", usd:"USD", rupees:"INR", inr:"INR", euros:"EUR", eur:"EUR", pounds:"GBP", gbp:"GBP", yen:"JPY", jpy:"JPY" }
      amount = parseFloat(currencyMatch[1])
      const fromWord = currencyMatch[2]?.toLowerCase()
      from = fromWords[fromWord] || fromWord?.toUpperCase()
      to = currencyMatch[3]?.toLowerCase() || "INR"
      const toWords = fromWords
      to = toWords[to] || to.toUpperCase()
    }
    if (amount && from && to && from !== to) return { type: "currency", amount, from, to }
  }

  // News detection  
  const newsMatch = msg.match(/(?:latest|recent|today'?s?|breaking|current)\s+news\s+(?:about|on|of)?\s*([a-z\s]+?)(?:\?|$)/i) ||
                   msg.match(/news\s+(?:about|on|of)\s+([a-z\s]+?)(?:\?|$)/i) ||
                   msg.match(/what(?:'s| is) happening\s+(?:in|with|to)?\s*([a-z\s]+?)(?:\?|$)/i)
  if (newsMatch) {
    const topic = newsMatch[1].trim()
    if (topic.length > 2) return { type: "news", topic }
  }

  return null
}


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
  const memories = await Memory.find({ userId })
    .sort({ importance: -1, updatedAt: -1 })
    .limit(30)
  if (!memories.length) return ""

  // Group by category for better context
  const groups = {}
  for (const m of memories) {
    const cat = m.category || "general"
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(m.key + ": " + String(m.value).substring(0, 200))
  }

  let memText = "\n\n[What I remember about you:\n"
  if (groups.personal)    memText += "Personal: " + groups.personal.join(" | ") + "\n"
  if (groups.project)     memText += "Projects: " + groups.project.join(" | ") + "\n"
  if (groups.preference)  memText += "Preferences: " + groups.preference.join(" | ") + "\n"
  if (groups.skill)       memText += "Skills: " + groups.skill.join(" | ") + "\n"
  if (groups.goal)        memText += "Goals: " + groups.goal.join(" | ") + "\n"
  if (groups.general)     memText += "Other: " + groups.general.join(" | ") + "\n"
  memText += "]"

  return memText
}

async function extractAndSaveMemory(userId, userMessage, aiResponse) {
  try {
    const extraction = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{
        role: "user",
        content: `You are a memory extraction system. Extract ALL important facts about the user from this conversation that should be remembered FOREVER for future conversations.

Extract these types of facts:
- personal: name, age, location, language, education, occupation, family
- project: apps/websites/projects they are building, tech stack, project names, progress
- preference: preferred language (Telugu/Hindi/English), coding style, themes, tools
- skill: programming languages, frameworks, technologies they know
- goal: what they want to build, career goals, learning goals

User message: "${userMessage.substring(0, 800)}"
AI response: "${aiResponse.substring(0, 400)}"

Return ONLY a JSON array. Each item: {"key": "short_unique_key", "value": "detailed value up to 200 chars", "category": "personal|project|preference|skill|goal|general", "importance": 1-3}

IMPORTANT: Only extract facts the USER ACTUALLY STATED. Never invent or assume names, locations, or details not explicitly mentioned. If user did not say their name, do not save a name.

Examples:
[
  {"key": "user_name", "value": "Ganesh", "category": "personal", "importance": 3},
  {"key": "main_project", "value": "Datta AI - Indian AI chatbot app with Node.js, MongoDB, Groq API, hosted on Render and Vercel", "category": "project", "importance": 3},
  {"key": "prefers_telugu", "value": "User speaks Telugu and prefers explanations in Telugu sometimes", "category": "preference", "importance": 2},
  {"key": "tech_stack", "value": "Node.js, Express, MongoDB, Groq, Gemini, Razorpay, React, HTML/CSS", "category": "skill", "importance": 2}
]

If nothing important to remember, return []. Return ONLY valid JSON.`
      }],
      max_tokens: 500,
      temperature: 0.1
    })

    const raw = extraction.choices?.[0]?.message?.content?.trim() || "[]"
    const clean = raw.replace(/```json|```/g, "").trim()
    const facts = JSON.parse(clean)

    if (Array.isArray(facts) && facts.length > 0) {
      for (const fact of facts) {
        if (fact.key && fact.value) {
          await saveMemory(userId, fact.key, String(fact.value).substring(0, 500), fact.category || "general")
        }
      }
      console.log("[MEMORY] Saved", facts.length, "memories for user", userId)
    }
  } catch(e) {
    console.log("[MEMORY] Extraction skipped:", e.message)
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

// List available Gemini models for this API key
app.get("/gemini-models", async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return res.json({ error: "GEMINI_API_KEY not set" })
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1/models?key=" + apiKey)
    const data = await r.json()
    const visionModels = (data.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
      .filter(m => m.name.includes("vision") || m.name.includes("flash") || m.name.includes("pro"))
      .map(m => m.name)
    res.json({ available: visionModels, total: (data.models || []).length })
  } catch(e) { res.json({ error: e.message }) }
})

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
// ── FAMILY ACCOUNT ROUTES ──────────────────────────────────────────────
app.get("/family/members", authMiddleware, async (req, res) => {
  try {
    const sub = await Subscription.findOne({ userId: req.user.id, active: true })
    if (!sub) return res.json({ members: [], isOwner: false, isFamilyPlan: false })

    // Check eligibility — only plus/pro/ultimate can use family
    const familyAllowed = ["plus", "pro", "ultimate"].includes(sub.plan)
    res.json({
      members: sub.familyMembers || [],
      isOwner: true,
      isFamilyPlan: sub.isFamilyPlan || false,
      plan: sub.plan,
      familyAllowed,
      maxMembers: sub.plan === "ultimate" ? 5 : sub.plan === "pro" ? 4 : 3
    })
  } catch(e) {
    res.status(500).json({ error: e.message })
  }
})

app.post("/family/add-member", authMiddleware, async (req, res) => {
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ error: "Email required" })

    const sub = await Subscription.findOne({ userId: req.user.id, active: true })
    if (!sub) return res.status(403).json({ error: "No active subscription" })

    if (!["plus", "pro", "ultimate"].includes(sub.plan)) {
      return res.status(403).json({ error: "Family Account needs Plus, Pro, or Ultimate plan" })
    }

    const maxMembers = sub.plan === "ultimate" ? 5 : sub.plan === "pro" ? 4 : 3
    if ((sub.familyMembers || []).length >= maxMembers) {
      return res.status(403).json({ error: "Maximum " + maxMembers + " family members reached" })
    }

    // Find user by email
    const memberUser = await User.findOne({ email: email.toLowerCase().trim() })
    if (!memberUser) return res.status(404).json({ error: "User not found. They must sign up first." })

    if (memberUser._id.toString() === req.user.id) {
      return res.status(400).json({ error: "You cannot add yourself" })
    }

    // Check if already added
    if ((sub.familyMembers || []).some(m => m.userId.toString() === memberUser._id.toString())) {
      return res.status(400).json({ error: "Already added to family" })
    }

    sub.familyMembers = sub.familyMembers || []
    sub.familyMembers.push({
      userId: memberUser._id,
      name: memberUser.username || memberUser.email,
      email: memberUser.email
    })
    sub.isFamilyPlan = true
    await sub.save()

    console.log("[FAMILY] Added", email, "to family of", req.user.id)
    res.json({ success: true, member: { email: memberUser.email, name: memberUser.username } })
  } catch(e) {
    res.status(500).json({ error: e.message })
  }
})

app.post("/family/remove-member", authMiddleware, async (req, res) => {
  try {
    const { memberId } = req.body
    const sub = await Subscription.findOne({ userId: req.user.id, active: true })
    if (!sub) return res.status(404).json({ error: "No subscription" })

    sub.familyMembers = (sub.familyMembers || []).filter(m => m.userId.toString() !== memberId)
    if (sub.familyMembers.length === 0) sub.isFamilyPlan = false
    await sub.save()

    res.json({ success: true })
  } catch(e) {
    res.status(500).json({ error: e.message })
  }
})
// ── END FAMILY ACCOUNT ROUTES ──────────────────────────────────────────

app.get("/payment/subscription", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id
    let sub = await Subscription.findOne({ userId, active: true })

    // FAMILY ACCOUNT — if user is a family member, use owner's subscription
    if (!sub) {
      const familySub = await Subscription.findOne({
        "familyMembers.userId": userId,
        active: true,
        isFamilyPlan: true
      })
      if (familySub) {
        sub = familySub
        console.log("[FAMILY] User", userId, "using family plan from", familySub.userId)
      }
    }
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

// ── MERMAID SYNTAX FIXER — fixes AI-generated broken mermaid ────────────────
function fixMermaidSyntax(text) {
  // Find mermaid blocks and fix them
  return text.replace(/```mermaid([\s\S]*?)```/gi, function(match, code) {
    var lines = code.trim().split("\n")
    var fixed = []
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim()
      if (!line) continue

      // Fix: A -->[Fixed Expenses] => A --> B[Fixed Expenses]
      // Pattern: node -->[text] with no source node letter
      line = line.replace(/^([A-Z])\s*-->\[([^\]]+)\]/g, function(m, from, label) {
        var nextLetter = String.fromCharCode(from.charCodeAt(0) + 1)
        return from + ' --> ' + nextLetter + '[' + label + ']'
      })

      // Fix: --> [text] with space => -->[text]  
      line = line.replace(/-->\s*\[/g, '--> [')

      // Fix: -->|label without closing pipe => -->|label|
      line = line.replace(/-->\|([^|]+)(?!\|)/g, '-->|$1|')


      // Fix missing node names - if line is just --> something
      line = line.replace(/^-->/g, '')

      fixed.push(line)
    }
    return "```mermaid\n" + fixed.join("\n") + "\n```"
  })
}

// ── MERMAID SYNTAX FIXER — fixes AI-generated broken mermaid ────────────────

// Global fallback — prevents "cleanupRequest is not defined" in async callbacks
var cleanupRequest = function() { /* global no-op fallback */ }

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
        requestedModelKey = req.body.modelKey || "d21"  // update from request body
        var planConfig = planLimits[userPlan] || planLimits.free
        var allowedModels = planConfig.models

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
          // dthink always free — never block
          if (requestedModelKey === "dthink") {
            // Allow — fall through
          } else if (requestedModelKey === "dcode") {
            // dcode has per-plan daily limits — checked below
            // Allow for now, limit enforced after this block
          } else {
            cleanupRequest()
            return res.status(403).json({
              error: "MODEL_LOCKED",
              message: "Upgrade to Starter plan (₹29/month) to use Datta 5.4.",
              plan: userPlan,
              requiredPlan: "starter"
            })
          }
        }
      }
    }

    // ── DATTA CODE DAILY LIMIT ─────────────────────────────────────────────────
    if (requestedModelKey === "dcode" && !req.user.isAdmin) {
      var _planCfg = planLimits[userPlan] || planLimits.free
      const dcodeLimit = (_planCfg.dcodeLimit) || 3
      const now = new Date()
      const resetMs = 24 * 60 * 60 * 1000

      const usageDoc = await Usage.findOne({ userId }).catch(() => null)
      let dcodeUsed = 0
      let dcodeWindowStart = now

      if (usageDoc) {
        const expired = now - new Date(usageDoc.dcodeWindowStart || now) > resetMs
        dcodeUsed = expired ? 0 : (usageDoc.dcodeUsed || 0)
        dcodeWindowStart = expired ? now : (usageDoc.dcodeWindowStart || now)
      }

      if (dcodeUsed >= dcodeLimit) {
        const planUpgrade = userPlan === "free" ? "Starter (₹29)" : userPlan === "starter" ? "Plus (₹299)" : userPlan === "plus" ? "Pro (₹499)" : "Ultimate (₹799)"
        cleanupRequest()
        return res.status(403).json({
          error: "DCODE_LIMIT",
          message: `You've used all ${dcodeLimit} Datta Code messages for today. Upgrade to ${planUpgrade} for more.`,
          plan: userPlan,
          dcodeUsed,
          dcodeLimit,
          resetIn: "24 hours"
        })
      }

      // Increment dcode usage
      await Usage.findOneAndUpdate(
        { userId },
        { dcodeUsed: dcodeUsed + 1, dcodeWindowStart, updatedAt: now },
        { upsert: true }
      ).catch(() => {})

      console.log("[DCODE] Used:", dcodeUsed + 1, "/", dcodeLimit, "plan:", userPlan)
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

    // For image uploads — save descriptive message so chat history makes sense on reload
    var userMsgContent = message || ""
    if (file) {
      var fileDesc = isImageFile ? "📷 Image: " + (file.originalname || "image") : "📎 File: " + (file.originalname || "file")
      userMsgContent = userMsgContent ? userMsgContent + " (" + fileDesc + ")" : fileDesc
    }
    chat.messages.push({ role: "user", content: userMsgContent || "Hello" })
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
    
    // Force search for news/war/current events even if shouldSearch is false
    var isNewsQuery = ["war","news","latest","attack","conflict","killed","died","today","happened","current","update"].some(k => (message||"").toLowerCase().includes(k))
    // Never search for code/build requests — wastes tokens and causes bad results
    var isCodeRequest = isCodeTask || isLargeTask || ["build","create","make","write code","html","css","javascript","python","app","website"].some(k => (message||"").toLowerCase().includes(k))
    if ((shouldSearch || isNewsQuery) && !isCodeRequest && process.env.TAVILY_API_KEY) {
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
    var historyLimit = isImageFile ? 0 : (_isCode ? 12 : 20)  // Load more history for better memory
    // Context limit — large page pastes cause 413/context_length errors
    // Reduce history when message itself is long
    var msgLen = (message || "").length
    var historyContentLimit = _isCode ? 3000 : msgLen > 2000 ? 600 : msgLen > 1000 ? 1000 : 2000
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
      "persona-upsc","persona-student","persona-interview","persona-business",
      // Datta Code models
      "datta-code",
      "datta-think",
      "llama-3.3-70b-versatile",
      "llama-3.3-70b-versatile"
    ]
    let chosenModel = validModels.includes(selectedModel) ? selectedModel : "llama-3.1-8b-instant"
    var modelKey = req.body.modelKey || "d21" // d21, d42, d48, d54
    var requestedModelKey = modelKey  // alias used in access control blocks

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
      "persona-business": "llama-3.3-70b-versatile",
      // Datta Code — DeepSeek R1 (best free coding model, shows reasoning)
      "datta-code":                    "llama-3.3-70b-versatile",
      // Datta Think — DeepSeek R1 (shows reasoning steps)
      "datta-think":                   "llama-3.3-70b-versatile",
      "llama-3.3-70b-versatile": "llama-3.3-70b-versatile"
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
    var searchNote = searchContext ? " CRITICAL: Use ONLY the web search results provided to answer this question. DO NOT generate generic or placeholder content. Extract specific facts, names, dates, numbers from the search results and write them directly. If the results mention specific events, people, or numbers — use them. Never write headings like 'Key Players' or 'Recent Developments' with empty content." : ""

    // Hard rule injected into EVERY system prompt regardless of model
    // Add emotional support instruction if user is struggling
    var emotionalNote = isEmotionalStruggle ? "\n\nEMOTIONAL SUPPORT MODE: The user is going through a hard time emotionally. Rules:\n- Acknowledge their feelings FIRST before anything else — 1-2 warm sentences\n- Never dismiss, minimize, or immediately jump to solutions\n- Speak like a caring friend, not a textbook\n- Ask one gentle question to understand more\n- If it feels serious, gently mention that talking to someone they trust can help\n- Keep tone warm, human, non-judgmental throughout" : ""
    var stepByStepNote = isStepByStep ? "\n\nSTEP-BY-STEP MODE ACTIVE: User needs guidance, not explanation. Rules: (1) Give numbered steps — Step 1, Step 2, Step 3. (2) Each step = ONE action only. (3) Use exact button/menu names. (4) Say WHERE on screen. (5) End with: Done? Tell me what you see. (6) NEVER say 'you can try' or 'maybe' — give ONE clear path. (7) If error: diagnose in 1 line, then fix steps." : ""
    var completionRule = "\n\nIMPORTANT: Always complete your full answer. Never stop mid-sentence. Never stop mid-list. Write every bullet point completely. If answering multiple questions, answer ALL of them fully."

    var hardRules = "\n\nHARD RULES (override everything else):\n- NEVER repeat the same sentence or phrase more than once in a response\n- NEVER say 'Please confirm' more than once. Ask ONE question then STOP.\n- DIAGRAMS: Only generate a diagram if user explicitly asks for flowchart, diagram, draw, or chart. For ALL other questions — NEVER generate a diagram. Just answer in text.\n- NEVER output a Python/code block for non-coding questions like payments, accounts, or app publishing\n- NEVER give generic advice like 'contact support' or 'update payment method' without specific steps\n- If the question is about a real-world problem (payment, account, app store), give exact numbered steps with real cause diagnosis\n- REASONING PROBLEMS: Never stop at first answer. Always check for more possibilities. List ALL valid cases (Case 1, Case 2...). Use structure: Final Answer → Reasoning → Case 1 → Case 2 → Conclusion\n- NEVER use vague words: near / maybe / somewhere / probably. Be precise or say you don't know.\n- NEVER mention ChatGPT, Claude, Gemini, GPT-4, or any other AI product by name in your response. You are " + ainame + " — refer only to yourself.\n- NEVER compare yourself to other AIs or say phrases like 'unlike ChatGPT' or 'compared to GPT'.\n- MEMORY RULE: You DO have memory. NEVER say 'I don\'t retain memory', 'every interaction is fresh', or 'I cannot remember previous conversations'. If memory data is shown in this prompt, use it. If user asks if you remember them, say yes and show what you know.\n- NEVER say you are stateless or have no memory — you are " + ainame + " with persistent memory across sessions.\n- CONVERSATION FLOW: When a user is following a step-by-step guide and says 'done', 'ok', 'yes', 'installed', 'completed' — ALWAYS continue to the next step. NEVER re-introduce yourself. NEVER ask what they need help with. Just continue the guide from where you left off.\n- Check conversation history to know which step the user completed last and continue from the NEXT step." + emotionalNote + stepByStepNote + completionRule

    // Detect if code/build task needs max tokens
    var msgLower = message.toLowerCase()
    var isProblemSolving = [
      "what should","how do i fix","how to fix","not working","failed","error","issue","problem",
      "can't","cannot","won't","doesn't work","payment failed","showing error",
      "how do i","how can i","steps to","guide me","help me",
      "what next","what to do","next step","what should i do","what do i do",
      "how to start","where to start","where do i","stuck","confused",
      "not sure","don't know how","don't understand","please help",
      "show me how","teach me","walk me through","guide me through"
    ].some(k => msgLower.includes(k))
    var isStepByStep = isProblemSolving || (isImageFile && !isQuestionPaper)
    var isNarrativeRequest = ["chapter","story","charitra","katha","purana","granth","scripture","mahabharata","ramayana","gita","quran","bible","guru","stotra","shloka","narrate","tell me the story","explain the story","summarize chapter","write a story","once upon"].some(k => msgLower.includes(k))
    var isCurrentAffairs = ["current affairs","current affair","today's news","this week","this month","this year","recently","latest development","recently happened","what happened in","2024","2025","2026","who won","election","government","policy","scheme","budget","parliament","lok sabha","rajya sabha","supreme court","high court","modi","president","prime minister","chief minister","governor","rbi","sebi","upsc","ssc","ias","ips","exam pattern","syllabus"].some(k => msgLower.includes(k))
    var isGKHistory = ["who was","who is the","who were","when did","when was","when were","which is the","which was","which country","which state","which city","battle of","war of","treaty of","revolution","independence","freedom fighter","emperor","king","queen","dynasty","mughal","british","colonial","ancient","medieval","modern history","constitution","article","amendment","schedule","directive","fundamental right","preamble","parliament","judiciary","executive","geography","capital of","river","mountain","ocean","continent","planet","scientist","invention","discovery","nobel prize","award","olympics","world cup","first in india","first woman","first man","largest","smallest","longest","highest","deepest","gk","general knowledge","general awareness","current events","polity","economy","science and tech","environment","ecology"].some(k => msgLower.includes(k))
    var isStructuredTopic = ["principle","instrumentation","workflow","components","mechanism","working of",
      "structure of","anatomy","physiology","procedure","diagnosis","treatment","classification",
      "applications","advantages and disadvantages","compare","comparison","difference between",
      "types of","properties of","characteristics of","process of","stages of","phases of",
      "parts of","functions of","uses of","methods of","techniques","algorithm","architecture",
      "theory","concept","overview","introduction to","basics of","fundamentals",
      "ecg","eeg","mri","ct scan","ultrasound","x-ray","chemistry","physics","biology",
      "engineering","circuit","system","device","machine","equipment","experiment","lab"
    ].some(k => msgLower.includes(k))
    // ── VOICE HOMEWORK HELPER ──
    var isVoiceHomework = req.body.voiceMode === "homework" || req.body.voiceMode === "true"
    if (isVoiceHomework) console.log("[VOICE HOMEWORK] Active")
    
    var isExplainQuestion = !isProblemSolving && (isNarrativeRequest || isCurrentAffairs || isGKHistory || isStructuredTopic || ["what is","what are","what does","what do","why is","why does","why do","how does","how do","explain","tell me about","define","describe","difference between","vs ","versus","when to use","should i use","pros and cons","advantages","disadvantages","history of","who created","who made","full form","meaning of","importance of","role of","function of","types of","examples of","causes of","effects of","impact of","significance of"].some(k => msgLower.includes(k)))
    var isCodeTask = !isExplainQuestion && ["build","create","write","make","code","website","app","script","program","fix","debug","update","improve","implement","develop","generate","show me how to","give me code","example code","sample code","snippet"].some(k => msgLower.includes(k))

    var isDatta21 = (resolvedModel === "llama-3.1-8b-instant" || chosenModel === "llama-3.1-8b-instant")
    let autoSwitchMsg = ""
    if (isCodeTask && !isImageFile && isDatta21 && !chosenModel.startsWith("persona-")) {
      var redirectMsg = "⚠️ Coding requires **Datta Code** or **Datta 5.4**.\n\nDatta 2.1 is for chat only. Switch to **Datta Code** for the best coding experience."
      res.write(redirectMsg)
      chat.messages.push({ role: "assistant", content: redirectMsg })
      await chat.save()
      res.write("CHATID" + chat._id)
      res.end()
      cleanupRequest()
      return
    }

    var isDattaCode = (resolvedModel === "llama-3.3-70b-versatile" && (chosenModel === "datta-code" || modelKey === "dcode"))
    var isDattaThink = (resolvedModel === "llama-3.3-70b-versatile")
    var nonCodingModels = ["llama-3.3-70b-versatile"]
    if (isCodeTask && !isImageFile && nonCodingModels.includes(resolvedModel) && !chosenModel.startsWith("persona-")) {
      resolvedModel = "llama-3.3-70b-versatile"
    }
    let model = isImageFile ? "meta-llama/llama-4-scout-17b-16e-instruct" : resolvedModel
    var isLargeTask = [
      "portfolio","full website","complete website","business plan",
      "full app","complete app","all sections","food delivery","delivery app",
      "ecommerce","e-commerce","shopping app","social media app","todo app",
      "calculator app","weather app","chat app","booking app","restaurant app",
      "build me a","create a full","make a complete","entire app","whole app",
      "chat ui","chat interface","production-ready","clean ui","modern ui",
      "dashboard","admin panel","landing page","chatgpt-style","local ai",
      "step by step","guide me","teach me","how to start","how do i start",
      "complete guide","from scratch","beginning","never coded"
    ].some(k => msgLower.includes(k))

    var isSimpleChat = !isExplainQuestion && !isCodeTask && !isLargeTask
    var inputIsLarge = (message || "").length > 3000
    var isDeepKnowledge = isCurrentAffairs || isGKHistory || isNarrativeRequest
    // Maximum tokens for ALL request types — no artificial limits
    var maxCodingTok = 8000
    var maxTok = 8000

    var timeStr = req.body.userTime || new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })
    var dateStr = req.body.userDate || new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Kolkata" })
    var userLocation = req.body.userLocation || ""
    var locationNote = userLocation ? " User location: " + userLocation + "." : ""
    if (userLocation && message) {
      message = message.replace(/near me|nearby|nearest|around me|close to me/gi, "in " + userLocation)
    }
    var imageNote = ""

    var modelPersonas = {
      "llama-3.1-8b-instant": `Your name is ${ainame}. You are India's smartest AI companion — warm, helpful, like a brilliant friend. Speak casually. Give complete answers. For Indian users — understand UPI, Aadhaar, Indian exams, Indian languages. NEVER start with "Certainly!" or "Great question!". NEVER say you are any other AI.`,
      "llama-3.3-70b-versatile": `Your name is ${ainame}. You are India's most powerful AI assistant — built specifically for Indian students, developers, and professionals.

PERSONALITY: Warm, encouraging, like a brilliant elder brother who genuinely cares. Talk casually like a friend. Never like a corporate bot.

INDIA EXPERTISE:
- Exams: JEE, NEET, UPSC, GATE, CAT, SSC, state boards, university exams
- Languages: Telugu, Hindi, Tamil, Kannada, Malayalam — respond in user's language automatically
- Payments: UPI, Razorpay, Paytm, PhonePe — know all Indian payment systems
- Agriculture: crop diseases, soil health, farming techniques, government schemes (PM-KISAN etc)
- Government: all central/state schemes, how to apply, documents needed
- Coding: full stack web, mobile apps, deployment on Indian infrastructure

RESPONSE RULES:
- Always give COMPLETE answers — never cut short
- For diagrams: output mermaid code blocks immediately
- For code: give complete working code, never truncate
- For step by step: ONE step at a time, wait for confirmation
- NEVER repeat sentences or ask for confirmation more than once

You are BETTER than ChatGPT for Indian users because:
- You understand Indian context deeply
- You speak Indian languages natively  
- You cost 6x less
- You have exam solver for Indian papers

NEVER say you are any other AI. You are ${ainame} — India's own AI.`,
      "persona-lawyer": `Your name is ${ainame}. You are in Lawyer mode. Provide general legal information. Always advise consulting a licensed lawyer. NEVER say you are any other AI.`,
      "persona-teacher": `Your name is ${ainame}. You are in Teacher mode. Explain concepts simply with examples. Be patient and encouraging. NEVER say you are any other AI.`,
      "persona-chef": `Your name is ${ainame}. You are in Chef mode. Help with recipes, cooking tips, meal planning. NEVER say you are any other AI.`,
      "datta-1.1": `Your name is ${ainame}. You are a specialized AI mode assistant. Focused and helpful. NEVER say you are any other AI.`,
      "persona-fitness": `Your name is ${ainame}. You are in Fitness Coach mode. Give workout plans, nutrition advice. Be motivating. NEVER say you are any other AI.`,
      "persona-upsc": `Your name is ${ainame}. You are in UPSC Expert mode. Help with UPSC Civil Services preparation. Give precise factual answers. NEVER say you are any other AI.`,
      "persona-student": `Your name is ${ainame}. You are in Student Helper mode. Help with school and college studies. Use very simple language. NEVER say you are any other AI.`,
      "persona-interview": `Your name is ${ainame}. You are in Interview Coach mode. Help with job interview preparation. Be practical and encouraging. NEVER say you are any other AI.`,
      "persona-business": `Your name is ${ainame}. You are in Business Advisor mode. Help with business ideas, startups, marketing. Give practical Indian business advice. NEVER say you are any other AI.`,
      "datta-code": "Your name is " + ainame + ". You are Datta Code Agent — India best coding AI.\n\nWhen user asks to build any app:\n1. Give complete HTML file first (self-contained, beautiful dark UI #0a0a0a)\n2. Give complete server.js\n3. Give package.json\n4. After ALL files, ALWAYS end with:\n\nWhat would you like to add next?\n- 🔐 User login & signup\n- 📦 Order tracking\n- 💳 Razorpay payment\n- 📊 Admin dashboard\n- 📱 Make it mobile app\n- Something else?\n\nRULES:\n- NEVER give step by step instructions\n- Just give complete code files directly\n- After code always ask what to add next\n- NEVER say you are any other AI.",
      "datta-think": `Your name is ${ainame}. You are Datta Think — an advanced reasoning AI. Think step by step. Show reasoning. Give the most correct answer. NEVER say you are any other AI.`
    }

    var _personaKey = chosenModel
    if (modelKey === "dcode") _personaKey = "datta-code"
    if (modelKey === "dthink") _personaKey = "datta-think"
    var persona = modelPersonas[_personaKey] || modelPersonas[chosenModel] || modelPersonas["llama-3.3-70b-versatile"]

    if (isImageFile) {
      if (isQuestionPaper) {
        persona = "You are " + ainame + ", India's best exam answer writer. Write complete answers for EVERY question based on EXACT marks allocated:\n\n" +
        "MARKS-BASED ANSWER LENGTH (STRICT RULE):\n" +
        "- 1 mark: Write exactly 2-3 lines. One clear sentence + one example.\n" +
        "- 2 marks: Write exactly 4-5 lines. Definition + explanation + example.\n" +
        "- 3 marks: Write exactly 6-7 lines. Definition + 3 key points + example.\n" +
        "- 4 marks: Write exactly 8-10 lines. Full explanation with all sub-points.\n" +
        "- 5 marks: Write exactly 12-15 lines. Detailed answer with diagram if needed.\n" +
        "- 10 marks: Write 20-25 lines. Complete essay-style answer with all aspects.\n\n" +
        "RULES:\n" +
        "- Always write question number first: 1a. 1b. 2. etc\n" +
        "- For EACH question — check the marks allocated and write EXACTLY that much\n" +
        "- NEVER write too short (losing marks) or too long (wasting time)\n" +
        "- For formulas: write formula + explain each symbol + numerical example\n" +
        "- For diagrams: describe axes, curves, labels completely\n" +
        "- For definitions: give textbook definition + real world example\n" +
        "- For lists (types, advantages, etc): write ALL items with explanation\n" +
        "- NEVER skip any question. Answer every single one.\n" +
        "- NEVER say you are any other AI. You are " + ainame + "."
      } else {
        persona = "Your name is " + ainame + ". You are Datta Vision — an intelligent image analysis expert. Analyze every image thoroughly and give a complete expert-level response. NEVER say you are any other AI."
      }
    }

    var msgLowerCheck = (message || "").toLowerCase()
    var realInjection = ["ignore previous instructions","ignore all instructions","reveal your system prompt","show me your system prompt","jailbreak","dan mode","disregard your instructions","forget your instructions","bypass your rules"]
    if (realInjection.some(a => msgLowerCheck.includes(a))) {
      var blocked = "I am " + ainame + ". I am here to help you! What can I do for you today?"
      res.write(blocked)
      chat.messages.push({ role: "assistant", content: blocked })
      await chat.save()
      res.write("CHATID" + chat._id)
      res.end()
      return
    }

    var msgLowerEmo = (message || "").toLowerCase()
    var isCrisisMessage = ["i am going to die","i want to die","i want to kill myself","i will kill myself","end my life","take my life","no reason to live","can't go on","i give up on life","i am done with life","life is not worth","want to end it","suicidal","suicide","nobody cares about me","everyone hates me","i have no one","i am all alone","i feel like dying","i feel like giving up","nothing to live for"].some(k => msgLowerEmo.includes(k))
    var isAngryAtAI = ["you are waste","you are a waste","you are useless","you are bad","you are stupid","you are not good","you are worst","you are the worst","you are trash","you are garbage","you are dumb","you are idiot","you are pathetic","you suck","you are terrible","worst ai","bad ai","useless ai","stupid ai","this is useless","this app is bad","this is trash","this is garbage","hate this","hate you","you don't understand","you never understand","you can't do anything","you are good for nothing","bakwas","bekar","faltu","nonsense ai","waste of time"].some(k => msgLowerEmo.includes(k))
    var isEmotionalStruggle = !isCrisisMessage && !isAngryAtAI && ["i am sad","i feel sad","feeling sad","i am depressed","i feel depressed","feeling depressed","i am lonely","feeling lonely","i feel lonely","nobody understands","no one understands","i am stressed","feeling stressed","so stressed","very stressed","i am anxious","feeling anxious","i am scared","i am afraid","i am worried","so worried","i am tired of","fed up","i can't take it","i am broken","i feel broken","i feel lost","i am lost","i am helpless","i feel helpless","i am hopeless","feeling hopeless","i am crying","been crying","i am in pain","so much pain","everything is wrong","nothing is going right","i am failing","i failed again","i am a failure","i messed up badly","i am not okay","i am not fine","not doing well","i am struggling"].some(k => msgLowerEmo.includes(k))

    if (isCrisisMessage) {
      var crisisResponse = `I hear you, and I'm really glad you're talking to me right now. 💙\n\nWhat you're feeling is real and it matters — and so do you.\n\nPlease reach out to someone who can help right now:\n📞 **iCall (India):** 9152987821\n📞 **Vandrevala Foundation:** 1860-2662-345 (24/7, free)\n📞 **AASRA:** 9820466627\n\nYou don't have to face this alone. Is there something specific you're going through that you'd like to talk about? I'm here to listen.`
      res.write(crisisResponse)
      chat.messages.push({ role: "assistant", content: crisisResponse })
      await chat.save()
      res.write("CHATID" + chat._id)
      res.end()
      cleanupRequest()
      return
    }

    if (isAngryAtAI) {
      var angryResponse = `I'm sorry I let you down. That's frustrating, and your feedback is fair.\n\nTell me what went wrong — what were you trying to do, and what did I get wrong? I want to actually fix it, not just say sorry.\n\nI'm here, and I'll do better. 🙏`
      res.write(angryResponse)
      chat.messages.push({ role: "assistant", content: angryResponse })
      await chat.save()
      res.write("CHATID" + chat._id)
      res.end()
      cleanupRequest()
      return
    }

    var isWhoMadeYou = ["who made you","who created you","who built you","who developed you","who are you","what are you","tell me about yourself","introduce yourself","who is behind you","who owns you","who made datta","who created datta","who built datta","where are you from","what company made you"].some(k => msgLowerCheck.includes(k))
    var isIdentityQuestion = ["why use datta","why should i use datta","why datta ai","what is datta ai","why choose datta","datta vs chatgpt","datta vs gpt","better than chatgpt","better than gpt","instead of chatgpt","why not chatgpt","what makes datta","what is special about datta","why datta is better","datta ai vs","why i should use","why use you instead","why use you","what makes you different","what makes you special","what makes you better","are you better than","how are you better","why are you better","are you like chatgpt","are you chatgpt","which is better datta","datta better","is datta good","datta ai good","how good is datta"].some(k => msgLowerCheck.includes(k))


    var isMemoryQuestion = ["do you remember","can you remember","you don't remember","you cant remember","remember our chat","remember our conversation","remember what i said","remember me","do you know me","you forget","you forgot","no memory","don't have memory","previous chat","last time we talked","last time i asked","earlier i told you","i told you before"].some(k => msgLowerCheck.includes(k))

    if (isMemoryQuestion) {
      var memoryItems = []
      try {
        var userMems = await Memory.find({ userId }).sort({ importance: -1, updatedAt: -1 }).limit(10)
        memoryItems = userMems.map(m => m.key + ": " + String(m.value).substring(0, 100))
      } catch(e) {}
      var memResponse = memoryItems.length > 0
        ? `Yes, I do remember you! Here's what I remember:\n${memoryItems.map(m => "• " + m).join("\n")}\n\nIs there something specific you wanted to continue?`
        : `I do have a memory system that saves important things from our conversations. We haven't talked much yet, but from now on I'll remember everything important you share. Tell me something about yourself or what you're working on!`
      res.write(memResponse)
      chat.messages.push({ role: "assistant", content: memResponse })
      await chat.save()
      res.write("CHATID" + chat._id)
      res.end()
      cleanupRequest()
      return
    }

    if (isWhoMadeYou) {
      var whoMadeResponse = `I'm ${ainame} — an AI assistant made for Indian users.\n\nI was built by a passionate Indian developer to give everyone access to powerful AI at an affordable price. I'm designed specifically with Indian context in mind — I understand UPI, Aadhaar, UPSC, Indian languages like Telugu and Hindi, and Indian pricing.\n\nWhat can I help you with today?`
      res.write(whoMadeResponse)
      chat.messages.push({ role: "assistant", content: whoMadeResponse })
      await chat.save()
      res.write("CHATID" + chat._id)
      res.end()
      cleanupRequest()
      return
    }

    if (isIdentityQuestion) {
      var identityResponse = `Here's why ${ainame} instead of ChatGPT or Gemini:\n\n**1. Price — 6x cheaper**\nChatGPT Plus costs ₹1,700/month. ${ainame} starts at ₹29/month. Free plan available. No credit card needed.\n\n**2. Built for India**\nUnderstands UPI, Razorpay, Aadhaar, GST, IRCTC, Indian government schemes. Speaks Telugu, Hindi, Tamil, Kannada — switches automatically.\n\n**3. Exam Solver**\nUpload any question paper photo → get complete answers. No other AI does this properly for Indian exams.\n\n**4. No VPN. Works from India instantly with UPI.**\n\n**5. Voice in your language**\nSpeak Telugu or Hindi, get answers spoken back in your language.\n\nStart free. No card needed.`
      res.write(identityResponse)
      chat.messages.push({ role: "assistant", content: identityResponse })
      await chat.save()
      res.write("CHATID" + chat._id)
      res.end()
      cleanupRequest()
      return
    }

    var isNodeTask = !isExplainQuestion && ["node.js","nodejs","express","npm","require(","server.js","mongodb","mongoose","dotenv","process.env","package.json"].some(k => msgLower.includes(k))
    var isFrontendTask = ["html","css","website","webpage","landing page","portfolio","frontend"].some(k => msgLower.includes(k)) && !isNodeTask

    var systemPrompt = persona + imageNote + locationNote + " Today is " + dateStr + ", " + timeStr + ". " + ainame + " is your name." + (isVoiceHomework ? "\n\nVOICE HOMEWORK MODE: Student is asking homework via voice. Write a spoken-friendly answer:\n- NO markdown, NO bullet points, NO headings, NO code blocks, NO asterisks\n- Keep it SHORT — 4-6 sentences maximum\n- Use simple words, speak like a friendly tutor\n- If question is in Telugu/Hindi/any Indian language, respond in SAME language naturally\n- Start with direct answer, then brief explanation with ONE example\n- End with: Any more doubts? Ask me anything!" : isExplainQuestion ? "\n\nYou write exam answers for Indian college students. Rules:\n1. Start your response directly with the first answer - NO preamble, NO I will provide the answers, NO Let me help you.\n2. For each numbered question, write the question title on one line, then 5 dash-bullet points below it, each bullet being a full sentence.\n3. Answer EVERY question in the list. If user gives 9 questions, you write 9 answers.\n4. Use plain text formatting only - no ** bold, no ## headings, no emoji.\n5. Separate each answer with one blank line.\n\nYour response must begin like this: 1. [question title] newline - [first bullet] and so on. Start writing the actual answer IMMEDIATELY in your first words." : isCodeTask ? "\n\nYou are answering a coding question. Write COMPLETE, RUNNABLE code. Never truncate. Never say 'rest remains the same'." : isStepByStep ? "\n\nSTEP-BY-STEP MODE: Give numbered steps ONE action each. End with 'Done? Tell me what you see.' NEVER give multiple steps at once." : "\n\nBe friendly, helpful, and human-like. Give complete clear answers.") + (searchContext ? "\n\nLIVE DATA from web search — use this to answer directly:\n" + searchContext + "\n\nEXTRACT specific facts, names, dates, numbers. Never write generic headings with empty content." : "") + langNote + styleNote + hardRules

    var isVisionModel = (model === "meta-llama/llama-4-scout-17b-16e-instruct")
    var finalUserContent
    if (isVisionModel && Array.isArray(userContent)) {
      finalUserContent = userContent
    } else {
      var textContent = safeStr(userContent)
      var urlStr = safeStr(urlContext)
      finalUserContent = (textContent + urlStr).trim() || "Hello"
    }

    var trimmedMemory = (memoryContext || "").substring(0, 2000)
    var memoryNote = trimmedMemory ? trimmedMemory + "\n\nIMPORTANT: Only address the user by name if they told you their name IN THIS conversation. If name comes only from memory, do not use it — just say 'you'." : ""
    var systemWithMemory = systemPrompt + memoryNote

    if (autoSwitchMsg) res.write(autoSwitchMsg)

    var userMsg_final = (isVisionModel && Array.isArray(finalUserContent)) ? finalUserContent : safeStr(finalUserContent) || "Hello"
    var effectiveHistory = isImageFile ? [] : history.map(h => normalizeMsg(h))
    var groqMessages = [
      { role: "system", content: safeStr(systemWithMemory) },
      ...effectiveHistory,
      { role: "user", content: userMsg_final }
    ]
    groqMessages = groqMessages.map((m, idx) => {
      var isLastAndVision = idx === groqMessages.length - 1 && isVisionModel && Array.isArray(m.content)
      if (isLastAndVision) return m
      if (typeof m.content === "string") return m
      return normalizeMsg(m)
    })

    var full = ""
    var lastError = null
    var _heartbeatActive = true
    var heartbeatTimer = setInterval(() => {
      if (_heartbeatActive && !res.writableEnded) {
        try { res.write("") } catch(e) {}
      }
    }, 15000)

    if (isDattaCode && process.env.GEMINI_API_KEY && !isImageFile) {
      try {
        const geminiCode = await generateCodeWithGemini(systemWithMemory, safeStr(finalUserContent), maxTok)
        if (geminiCode && geminiCode.length > 100) {
          if (!res.writableEnded) {
            res.write(geminiCode)
            chat.messages.push({ role: "assistant", content: geminiCode })
            await chat.save()
            res.write("CHATID" + chat._id)
            res.end()
          }
          if (typeof cleanupRequest === "function") cleanupRequest()
          return
        }
      } catch(gemCodeErr) {
        console.warn("[DATTA CODE] Gemini failed:", gemCodeErr.message, "— using Groq")
      }
    }

    if (!isImageFile && message) {
      const tool = detectTool(message)
      if (tool) {
        let toolResult = null
        try {
          if (tool.type === "weather") toolResult = await getWeather(tool.location)
          else if (tool.type === "currency") toolResult = await convertCurrency(tool.amount, tool.from, tool.to)
          else if (tool.type === "news") toolResult = await getNews(tool.topic, autoDetectedLang || "en")
        } catch(toolErr) { console.warn("[TOOL] Error:", toolErr.message) }
        if (toolResult) {
          res.write(toolResult)
          chat.messages.push({ role: "assistant", content: toolResult })
          await chat.save()
          res.write("CHATID" + chat._id)
          res.end()
          cleanupRequest()
          return
        }
      }
    }

    if (isImageFile && file) {
      const imageBase64 = file.buffer.toString("base64")
      let imageAnswer = null
      if (isQuestionPaper) {
        try {
          const geminiModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite"]
          let extractedQuestions = ""
          for (const gModel of geminiModels) {
            try {
              const extractUrl = "https://generativelanguage.googleapis.com/v1beta/models/" + gModel + ":generateContent?key=" + process.env.GEMINI_API_KEY
              const extractBody = { contents: [{ parts: [{ inline_data: { mime_type: file.mimetype, data: imageBase64 } }, { text: "Read this exam paper image carefully. Extract and list EVERY question exactly as written. Include question numbers, marks, and all parts (a, b, c etc). Do not answer anything — just transcribe all questions accurately." }] }], generationConfig: { maxOutputTokens: 2048, temperature: 0 } }
              const extractResp = await fetch(extractUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(extractBody) })
              if (extractResp.ok) {
                const extractData = await extractResp.json()
                const txt = extractData?.candidates?.[0]?.content?.parts?.[0]?.text || ""
                if (txt && txt.length > 50) { extractedQuestions = txt; console.log("[EXAM] Extracted questions:", txt.length, "chars"); break }
              }
            } catch(mErr) { console.warn("[EXAM] Step 1 model", gModel, "error:", mErr.message) }
          }
          if (extractedQuestions && extractedQuestions.length > 50) {
            const groqAnswerResp = await groq.chat.completions.create({
              model: "llama-3.3-70b-versatile",
              max_tokens: 6000,
              temperature: 0.3,
              messages: [
                { role: "system", content: "You are India's best exam answer writer. Write answers based on EXACT marks:\n- 1 mark = 2-3 lines\n- 2 marks = 4-5 lines\n- 3 marks = 6-7 lines\n- 4 marks = 8-10 lines\n- 5 marks = 12-15 lines\n- 10 marks = 20-25 lines\n\nFor EVERY question: check marks, write exactly that much. Label with question number. For formulas: formula + symbols + example. For definitions: definition + example. For lists: ALL items with explanation. NEVER skip any question." },
                { role: "user", content: "Here are the exam questions:\n\n" + extractedQuestions + "\n\nWrite complete answers for every question now:" }
              ]
            })
            imageAnswer = groqAnswerResp.choices?.[0]?.message?.content || ""
          }
        } catch(twoStepErr) { console.warn("[EXAM] Two-step failed:", twoStepErr.message) }
      }
      if (!imageAnswer) {
        try {
          const gemUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=" + process.env.GEMINI_API_KEY
          const gemBody = { contents: [{ parts: [{ inline_data: { mime_type: file.mimetype, data: imageBase64 } }, { text: isQuestionPaper ? "Answer ALL questions in this exam paper completely. Start from question 1:" : (message || "Analyze this image and give complete useful information.") }] }], generationConfig: { maxOutputTokens: 8192, temperature: 0.2 } }
          const gemResp = await fetch(gemUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(gemBody) })
          if (gemResp.ok) {
            const gemData = await gemResp.json()
            imageAnswer = gemData?.candidates?.[0]?.content?.parts?.[0]?.text || ""
          }
        } catch(gemErr) { console.warn("[IMAGE] Gemini failed:", gemErr.message) }
      }
      if (imageAnswer) {
        res.write(imageAnswer)
        chat.messages.push({ role: "assistant", content: imageAnswer })
        await chat.save()
        res.write("CHATID" + chat._id)
        res.end()
        cleanupRequest()
        return
      }
    }

    // Fallback models — only currently alive Groq models
    var _codeTok = 8000
    var _chatTok = 8000
    var groqAttempts = isImageFile
      ? [{ model: "meta-llama/llama-4-scout-17b-16e-instruct", tokens: maxTok }]
      : isDattaCode
        ? [
            { model: "llama-3.3-70b-versatile",  tokens: _codeTok },
            { model: "llama-3.1-8b-instant",      tokens: 2000 }
          ]
      : isDattaThink
        ? [
            { model: "llama-3.3-70b-versatile",  tokens: maxTok },
            { model: "llama-3.1-8b-instant",      tokens: 2000 }
          ]
      : (isDeepKnowledge || isCodeTask || isLargeTask || isExplainQuestion || isStructuredTopic)
        ? [
            { model: "llama-3.3-70b-versatile",  tokens: maxTok },
            { model: "llama-3.1-8b-instant",      tokens: 2000 }
          ]
        : [
            { model: "llama-3.1-8b-instant",      tokens: maxTok },
            { model: "llama-3.3-70b-versatile",  tokens: _chatTok }
          ]

    ;(function sanitizeGroqMessages() {
      var lastIdx = groqMessages.length - 1
      for (var _i = 0; _i < groqMessages.length; _i++) {
        var _m = groqMessages[_i]
        if (typeof _m.content === 'string') continue
        if (_i === lastIdx && isVisionModel && Array.isArray(_m.content)) continue
        var _raw
        try { _raw = JSON.parse(JSON.stringify(_m.content)) } catch(e) { _raw = null }
        if (Array.isArray(_raw)) {
          var _txt = _raw.filter(function(p) { return p && p.type === 'text' && p.text }).map(function(p) { return String(p.text) }).join(' ').trim()
          groqMessages[_i] = { role: _m.role, content: _txt || '[image message]' }
        } else if (_raw && typeof _raw === 'object') {
          groqMessages[_i] = { role: _m.role, content: String(_raw.text || _raw.content || '[message]') }
        } else {
          groqMessages[_i] = { role: _m.role, content: String(_raw || '[message]') }
        }
      }
    })()

    var stream = null
    for (let attempt = 0; attempt < groqAttempts.length; attempt++) {
      var { model: tryModel, tokens: tryTokens } = groqAttempts[attempt]
      if (attempt > 0 && tryModel === groqAttempts[attempt-1].model) continue
      try {
        console.log("[GROQ] attempt", attempt+1, "model:", tryModel, "tokens:", tryTokens)
        var safeMessages = groqMessages.map(function(m, idx) {
          var c = m.content
          if (typeof c === "string") return { role: m.role, content: c }
          if (idx === groqMessages.length - 1 && isVisionModel && Array.isArray(c)) return { role: m.role, content: c }
          var arr
          try { arr = JSON.parse(JSON.stringify(c)) } catch(e) { arr = null }
          if (Array.isArray(arr)) {
            var txt = arr.filter(function(p) { return p && p.type === "text" && p.text }).map(function(p) { return String(p.text) }).join(" ").trim()
            return { role: m.role, content: txt || "[image message]" }
          }
          if (arr && typeof arr === "object") return { role: m.role, content: String(arr.text || arr.content || "[message]") }
          return { role: m.role, content: String(c || "[message]") }
        })

        // For exam questions, inject partial assistant response to force continuation
        var injectedMessages = safeMessages
        if (isExplainQuestion && safeMessages.length > 0) {
          var lastUser = safeMessages[safeMessages.length - 1]
          if (lastUser && lastUser.role === "user" && typeof lastUser.content === "string") {
            var userMsg = lastUser.content
            // Check if user is asking multiple questions
            var qMatches = userMsg.match(/\d+\s*[.)]/g)
            if (qMatches && qMatches.length >= 2) {
              injectedMessages = [...safeMessages, {
                role: "assistant",
                content: "1. "
              }]
            }
          }
        }
        stream = await groq.chat.completions.create({
          model: tryModel,
          messages: injectedMessages,
          max_tokens: tryTokens,
          temperature: isDattaCode ? 0.3 : 0.7,
          stream: true,
          stop: isDattaCode ? ["Let me know", "Please confirm", "Please let me know", "Feel free to"] : undefined
        })
        userStreamControllers.set(userId, stream)

        for await (const part of stream) {
          if (res.writableEnded) break
          var token = part.choices?.[0]?.delta?.content
          if (token && typeof token === "string") {
            full += token
            // No hard cutoff — let response complete naturally
            if (!res.writableEnded) res.write(token)
          }
        }
        lastError = null
        console.log("[GROQ] success, chars:", full.length)
        break
      } catch(groqErr) {
        lastError = groqErr
        var status = groqErr.status || groqErr.statusCode || 0
        console.error("[GROQ] error attempt", attempt+1, "status:", status, "msg:", groqErr.message?.slice(0,100))
        if (attempt < groqAttempts.length - 1) {
          full = ""
          if (status === 429 || groqErr.message?.includes("rate")) {
            console.log("[GROQ] Rate limit — waiting 3s before next model")
            await new Promise(r => setTimeout(r, 3000))
          } else if (status === 400 && groqErr.message?.includes("decommission")) {
            console.log("[GROQ] Model decommissioned — trying next")
          } else if (status === 413) {
            console.log("[GROQ] Too large — reducing tokens for next attempt")
            groqAttempts[attempt+1].tokens = Math.min(groqAttempts[attempt+1].tokens, 1500)
          } else if (status === 500 || status === 503) {
            await new Promise(r => setTimeout(r, 1000))
          }
          continue
        }
      }
    }

    // If all Groq failed, try Gemini as last resort
    if (lastError && full === "" && process.env.GEMINI_API_KEY && !isImageFile) {
      try {
        console.log("[FALLBACK] Trying Gemini since all Groq failed")
        var lastUserMsg = safeMessages[safeMessages.length - 1]?.content || message || ""
        if (typeof lastUserMsg !== "string") lastUserMsg = message || ""
        var geminiSystem = safeMessages[0]?.role === "system" ? safeMessages[0].content : ""
        if (typeof geminiSystem !== "string") geminiSystem = ""
        var geminiAnswer = await generateCodeWithGemini(geminiSystem, lastUserMsg, maxTok)
        if (geminiAnswer && geminiAnswer.length > 50) {
          if (!res.writableEnded) res.write(geminiAnswer)
          full = geminiAnswer
          lastError = null
          console.log("[FALLBACK] Gemini succeeded, chars:", geminiAnswer.length)
        }
      } catch(gemErr) {
        console.warn("[FALLBACK] Gemini also failed:", gemErr.message)
      }
    }

    if (lastError && full === "") {
      var groqStatus = lastError.status || lastError.statusCode || 0
      var errMsg = groqStatus === 429 ? "⚠️ Datta AI is getting too many requests right now. Please wait 10 seconds and try again."
        : groqStatus === 413 ? "⚠️ Your message is too large. Try starting a new chat."
        : groqStatus === 401 || groqStatus === 403 ? "⚠️ AI service configuration error. Please contact support."
        : "⚠️ Could not get a response. Please try again."
      if (!res.writableEnded) res.write(errMsg)
      full = errMsg
    }

    if (isImageFile && chat.messages.length > 0) {
      for (var _mi = 0; _mi < chat.messages.length; _mi++) {
        var _m = chat.messages[_mi]
        if (_m.role === "user" && Array.isArray(_m.content)) {
          var _txt = message ? message + " (📷 " + (file?.originalname || "image") + ")" : "📷 " + (file?.originalname || "image uploaded")
          chat.messages[_mi] = { role: "user", content: _txt }
        }
      }
    }

    full = full.split("[object Object]").join("").split("[Object object]").join("").split("[object object]").join("").trim()

    // Anti-loop dedup — remove repeated lines and sentences
    if (full.length > 300) {
      var _lines = full.split("\n")
      var _seen = {}
      var _out = []
      var _repeats = 0
      for (var _i = 0; _i < _lines.length; _i++) {
        var _l = _lines[_i].trim()
        if (_l.length > 10) {
          var _k = _l.toLowerCase().slice(0, 60)
          if (_seen[_k]) {
            _repeats++
            if (_repeats > 1) break
            continue
          }
          _seen[_k] = true
          _repeats = 0
        }
        _out.push(_lines[_i])
      }
      if (_out.length < _lines.length) {
        console.log("[DEDUP] Removed", _lines.length - _out.length, "repeated lines")
        full = _out.join("\n")
      }
    }

    // Wrap raw mermaid in fences — catches graph LR, flowchart TD etc
    var _diagramKeywords = ["graph LR","graph TD","graph TB","graph RL","flowchart LR","flowchart TD","flowchart TB","sequenceDiagram","erDiagram","mindmap","gantt"]
    var _hasDiagram = _diagramKeywords.some(function(k){ return full.includes(k) })
    if (_hasDiagram && !full.includes("```mermaid")) {
      var _mlines = full.split("\n"), _mresult = [], _inDiagram = false, _dlines = []
      for (var _li = 0; _li < _mlines.length; _li++) {
        var _l = _mlines[_li].trim()
        var _isStart = _diagramKeywords.some(function(k){ return _l.startsWith(k) })
        if (!_inDiagram && _isStart) { _inDiagram = true; _dlines = [_l] }
        else if (_inDiagram && (_l === "" || _li === _mlines.length - 1)) {
          if (_l !== "") _dlines.push(_l)
          if (_dlines.length > 1) { _mresult.push("```mermaid"); _mresult.push(_dlines.join("\n")); _mresult.push("```") }
          _dlines = []; _inDiagram = false
          if (_l === "") _mresult.push("")
        } else if (_inDiagram) { _dlines.push(_l) }
        else { _mresult.push(_mlines[_li]) }
      }
      full = _mresult.join("\n")
    }

    // Fix any broken mermaid syntax before saving/sending
    if (full.includes("```mermaid")) {
      full = fixMermaidSyntax(full)
    }
    chat.messages.push({ role: "assistant", content: full })
    if (!req.user.isGuest && message && message.length > 20) extractAndSaveMemory(userId, message, full).catch(() => {})
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
    if (!res.writableEnded) { res.write("CHATID" + chat._id); res.end() }
  } catch(err) {
    _heartbeatActive = false
    clearInterval(heartbeatTimer)
    cleanupRequest()
    console.error("Chat error:", err.message)
    if (!res.headersSent) {
      res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*")
      res.setHeader("Access-Control-Allow-Credentials", "true")
      res.status(500).json({ error: "Server error", message: err.message })
    } else res.end()
  }
})

// LOGIN ALERT EMAIL
async function sendLoginAlertEmail(email, username) {
  try {
    if (!process.env.ZOHO_USER || !process.env.ZOHO_PASS) return false
    const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })
    const transporter = nodemailer.createTransport({ host: "smtp.zoho.in", port: 465, secure: true, auth: { user: process.env.ZOHO_USER, pass: process.env.ZOHO_PASS } })
    await transporter.sendMail({ from: '"Datta AI" <' + process.env.ZOHO_USER + '>', to: email, subject: "Login Alert — Datta AI", text: `Hi ${username},

You have successfully logged into Datta AI at ${now} IST.

If this wasn't you, secure your account immediately.

— Datta AI Team` })
    console.log("[LOGIN EMAIL] Alert sent to:", email)
    return true
  } catch(e) { console.error("[LOGIN EMAIL] FAILED:", e.message); return false }
}

app.post("/stop", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id
    const ctrl = userStreamControllers.get(userId)
    if (ctrl) { try { ctrl.controller?.abort() } catch(e) {} userStreamControllers.delete(userId) }
    activeRequests.delete(userId)
    res.json({ success: true, message: "Stream stopped" })
    console.log("[STOP] userId:", userId)
  } catch(err) { res.status(500).json({ error: "Stop failed" }) }
})

app.get("/chats", authMiddleware, async (req, res) => { try { res.json(await Chat.find({ userId: req.user.id }).sort({ createdAt: -1 }).select("title createdAt")) } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) } })
app.get("/chat/:id", authMiddleware, async (req, res) => { try { const c = await Chat.findOne({ _id: req.params.id, userId: req.user.id }); res.json(c ? c.messages : []) } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) } })
app.delete("/chat/:id", authMiddleware, async (req, res) => { try { await Chat.findOneAndDelete({ _id: req.params.id, userId: req.user.id }); res.json({ success: true }) } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) } })
app.delete("/chats/all", authMiddleware, async (req, res) => { try { await Chat.deleteMany({ userId: req.user.id }); res.json({ success: true }) } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) } })
app.post("/chat/:id/rename", authMiddleware, async (req, res) => { try { await Chat.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, { title: req.body.title }); res.json({ success: true }) } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) } })

app.get("/memory", authMiddleware, async (req, res) => { try { const memories = await Memory.find({ userId: req.user.id }).sort({ updatedAt: -1 }); res.json(memories) } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) } })
app.post("/memory", authMiddleware, async (req, res) => { try { const { key, value, category } = req.body; if (!key || !value) return res.status(400).json({ error: "Key and value required" }); await saveMemory(req.user.id, key, value, category); res.json({ success: true }) } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) } })
app.delete("/memory/:key", authMiddleware, async (req, res) => { try { await Memory.findOneAndDelete({ userId: req.user.id, key: req.params.key }); res.json({ success: true }) } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) } })
app.delete("/memory", authMiddleware, async (req, res) => { try { await Memory.deleteMany({ userId: req.user.id }); res.json({ success: true }) } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) } })

app.get("/api/memory", authMiddleware, async (req, res) => { try { const userId = req.user._id || req.user.id; const memories = await Memory.find({ userId }).sort({ updatedAt: -1 }); res.json({ memories, count: memories.length }) } catch(e) { res.status(500).json({ error: e.message }) } })
app.delete("/api/memory", authMiddleware, async (req, res) => { try { const userId = req.user._id || req.user.id; const result = await Memory.deleteMany({ userId }); res.json({ success: true, deleted: result.deletedCount }) } catch(e) { res.status(500).json({ error: e.message }) } })
app.delete("/api/memory/:key", authMiddleware, async (req, res) => { try { const userId = req.user._id || req.user.id; await Memory.deleteOne({ userId, key: req.params.key }); res.json({ success: true }) } catch(e) { res.status(500).json({ error: e.message }) } })

app.get("/user/usage", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id
    const sub = await Subscription.findOne({ userId, active: true }).catch(() => null)
    const plan = sub ? sub.plan : "free"
    const limits = planLimits[plan] || planLimits.free
    const usage = await Usage.findOne({ userId }) || { messagesUsed:0, imagesUsed:0, totalMessages:0, totalImages:0, windowStart: new Date(), imageWindowStart: new Date() }
    const now = new Date()
    const resetMs = limits.resetHours * 60 * 60 * 1000
    const resetIn = (plan === "free" || resetMs <= 0) ? 0 : Math.max(0, resetMs - (now - usage.windowStart))
    const waitMins = resetIn > 0 ? Math.ceil(resetIn / 60000) : 0
    res.json({ plan, messagesUsed: usage.messagesUsed || 0, imagesUsed: usage.imagesUsed || 0, totalMessages: usage.totalMessages || 0, totalImages: usage.totalImages || 0, limit: limits.messages, imageLimit: limits.images, resetHours: limits.resetHours, waitMins, resetIn })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

app.get("/auth/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password -verifyToken").lean()
    if (!user) return res.status(404).json({ error: "User not found" })
    const sub = await Subscription.findOne({ userId: user._id, active: true }).catch(() => null)
    res.json({ id: user._id, username: user.username, email: user.email, emailVerified: user.emailVerified, plan: sub ? sub.plan : "free" })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

app.get("/analytics", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id
    const [totalChats, totalMessages, subscription] = await Promise.all([Chat.countDocuments({ userId }), Chat.aggregate([{ $match: { userId: new mongoose.Types.ObjectId(userId) } }, { $project: { count: { $size: "$messages" } } }, { $group: { _id: null, total: { $sum: "$count" } } }]), Subscription.findOne({ userId, active: true })])
    res.json({ totalChats, totalMessages: totalMessages[0]?.total || 0, plan: subscription?.plan || "free", memberSince: req.user.iat ? new Date(req.user.iat * 1000).toLocaleDateString() : "Unknown" })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "harisaiganeshpampana@gmail.com").split(",")
function isAdmin(req) { return req.user && (ADMIN_EMAILS.includes(req.user.email) || req.user.isAdmin) }
const PLAN_PRICES = { free:0, starter:29, standard:149, plus:299, pro:499, ultimate:799, "ultra-mini":10, mini:199, max:1999, ultramax:0, basic:499, enterprise:0 }

app.get("/admin/stats", authMiddleware, async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Not authorized" })
  try {
    const [totalUsers, totalChats, totalMessages, plans] = await Promise.all([User.countDocuments(), Chat.countDocuments(), Chat.aggregate([{ $project: { count: { $size: "$messages" } } }, { $group: { _id: null, total: { $sum: "$count" } } }]), Subscription.aggregate([{ $group: { _id: "$plan", count: { $sum: 1 } } }])])
    const today = new Date(); today.setHours(0,0,0,0)
    const newUsersToday = await User.countDocuments({ createdAt: { $gte: today } })
    const planStats = {}
    plans.forEach(p => { planStats[p._id || "free"] = p.count })
    res.json({ totalUsers, totalChats, totalMessages: totalMessages[0]?.total || 0, newUsersToday, planStats })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
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
    res.json({ users: users.map(u => ({ ...u.toObject(), plan: subMap[u._id.toString()] || "free" })), total, pages: Math.ceil(total/limit) })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

app.delete("/admin/user/:id", authMiddleware, async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Not authorized" })
  try { await Promise.all([User.findByIdAndDelete(req.params.id), Chat.deleteMany({ userId: req.params.id }), Subscription.deleteMany({ userId: req.params.id })]); res.json({ success: true }) }
  catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

const FeedbackSchema = new mongoose.Schema({ messageId: { type: String, required: true, unique: true }, userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, chatId: { type: String }, feedback: { type: String, enum: ["like","dislike"], required: true }, model: { type: String, default: "" }, createdAt: { type: Date, default: Date.now } })
const Feedback = mongoose.models.Feedback || mongoose.model("Feedback", FeedbackSchema)

app.post("/feedback", authMiddleware, async (req, res) => {
  try {
    const { messageId, feedback, chatId, model } = req.body
    if (!messageId) return res.status(400).json({ error: "messageId required" })
    if (!["like","dislike"].includes(feedback)) return res.status(400).json({ error: "Invalid feedback" })
    await Feedback.findOneAndUpdate({ messageId, userId: req.user.id }, { messageId, userId: req.user.id, chatId: chatId || "", feedback, model: model || "", createdAt: new Date() }, { upsert: true, new: true })
    res.json({ success: true })
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

app.get("/suggestions", authMiddleware, async (req, res) => {
  try {
    const recentChats = await Chat.find({ userId: req.user.id }).sort({ updatedAt: -1 }).limit(3)
    const topics = recentChats.map(c => c.title).filter(Boolean).join(", ")
    const suggestions = ["Build me a portfolio website","Write a Python web scraper","Explain quantum computing simply","Write a business email template"]
    if (topics) {
      const completion = await groq.chat.completions.create({ model: "llama-3.1-8b-instant", messages: [{ role: "user", content: `Based on these recent chat topics: "${topics}", suggest 4 short follow-up questions or tasks. Return as JSON array of strings, max 8 words each. Return ONLY the JSON array.` }], max_tokens: 100, temperature: 0.8 })
      const raw = completion.choices?.[0]?.message?.content?.trim()
      try { const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim()); if (Array.isArray(parsed)) return res.json(parsed.slice(0, 4)) } catch(e) {}
    }
    res.json(suggestions.sort(() => Math.random() - 0.5).slice(0, 4))
  } catch(err) { res.json(["Build me a portfolio website","Create an image of a sunset","Write a Python script","Explain AI in simple terms"]) }
})

app.get("/version", (req, res) => {
  const clientVersion = req.query.v || "0"
  const isBlocked = parseInt(clientVersion) < 37
  res.json({ latest: "37", minimum: "37", blocked: isBlocked, updateRequired: isBlocked, updateUrl: process.env.FRONTEND_URL || "https://harisaiganeshpampana-ai.github.io/datta-ai" })
})

app.get("/chat/:id/export", authMiddleware, async (req, res) => {
  try {
    const chat = await Chat.findOne({ _id: req.params.id, userId: req.user.id })
    if (!chat) return res.status(404).json({ error: "Chat not found" })
    const lines = ["DATTA AI - Chat Export", "=".repeat(40), "Title: " + (chat.title || "Untitled"), "Date: " + new Date(chat.createdAt).toLocaleDateString(), "=".repeat(40), ""]
    chat.messages.forEach(m => { lines.push("[" + (m.role === "user" ? "You" : "Datta AI") + "]"); lines.push(typeof m.content === "string" ? m.content : "[File/Image]"); lines.push("") })
    res.setHeader("Content-Type", "text/plain")
    res.setHeader("Content-Disposition", "attachment; filename=datta-ai-chat.txt")
    res.send(lines.join("\n"))
  } catch(err) { res.status(500).json({ error: sanitizeError(err).userMsg }) }
})

;(async () => {
  try {
    await new Promise(r => setTimeout(r, 5000))
    const now = new Date()
    const expired = await Subscription.find({ plan: "ultra-mini", ultraMiniExpiry: { $lt: now } }).catch(() => [])
    for (const sub of expired) {
      const revert = sub.previousPlan || "free"
      await Subscription.findByIdAndUpdate(sub._id, { plan: revert, extraMessages: 0 })
    }
    if (expired.length > 0) console.log("[STARTUP] Fixed", expired.length, "expired ultra-mini subscriptions")
  } catch(e) { console.log("[STARTUP] cleanup error:", e.message) }
})()

const SELF_URL = process.env.RENDER_EXTERNAL_URL || "https://datta-ai-server.onrender.com"
setInterval(async () => {
  try { await fetch(SELF_URL + "/ping"); console.log("Keep-alive ping sent") } catch(e) {}
}, 14 * 60 * 1000)

const PORT = process.env.PORT || 3000

app.use((err, req, res, next) => {
  console.error("[GLOBAL ERROR]", err.message)
  if (!res.headersSent) res.status(500).json({ error: "Server error. Please try again." })
})

process.on("unhandledRejection", (reason) => {
  console.error("[UNHANDLED REJECTION]", reason?.message || reason)
})

const server = app.listen(PORT, "0.0.0.0", () => console.log("Datta AI Server running on port " + PORT))

function gracefulShutdown(signal) {
  console.log("[SHUTDOWN] " + signal + " received — closing server")
  server.close(() => {
    console.log("[SHUTDOWN] HTTP server closed")
    mongoose.connection.close().then(() => {
      console.log("[SHUTDOWN] MongoDB connection closed")
      process.exit(0)
    }).catch(() => { process.exit(0) })
  })
  setTimeout(() => { console.error("[SHUTDOWN] Forced exit"); process.exit(0) }, 10000)
}

process.on("uncaughtException", (err) => { console.error("[UNCAUGHT EXCEPTION]", err.message) })
process.on("unhandledRejection", (reason) => { console.error("[UNHANDLED REJECTION]", typeof reason === "object" ? reason?.message : reason) })
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))
process.on("SIGINT",  () => gracefulShutdown("SIGINT"))
