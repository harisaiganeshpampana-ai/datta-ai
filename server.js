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
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("Mongo error:", err))

// ══════════════════════════════════════════════════════════════════════════════
// ── FIX 1: otpStore declared at TOP — before any route uses it ───────────────
// (Old code declared it AFTER the routes that use it → undefined errors)
// ══════════════════════════════════════════════════════════════════════════════
const otpStore = {}

// ── TWILIO CLIENT — initialized once at startup ───────────────────────────────
// Add to Render environment variables:
//   TWILIO_ACCOUNT_SID  → from console.twilio.com
//   TWILIO_AUTH_TOKEN   → from console.twilio.com
//   TWILIO_PHONE        → your Twilio number e.g. +1XXXXXXXXXX
let twilioClient = null
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  console.log("✅ Twilio initialized")
} else {
  console.warn("⚠️  Twilio not configured — OTPs will only log to console")
}

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

const ProjectSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  projectId: { type: String, required: true },
  name: { type: String, default: "Untitled Project" },
  color: { type: String, default: "#ffd700" },
  createdAt: { type: Number, default: Date.now },
  chats: { type: Array, default: [] },
  files: { type: Array, default: [] },
  artifacts: { type: Array, default: [] }
})
ProjectSchema.index({ userId: 1, projectId: 1 }, { unique: true })
const Project = mongoose.model("Project", ProjectSchema)

const AgentMemorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  key: String,
  value: mongoose.Schema.Types.Mixed,
  category: { type: String, default: "general" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})
const AgentMemory = mongoose.model("AgentMemory", AgentMemorySchema)

const TaskSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  title: String,
  description: String,
  status: { type: String, default: "pending" },
  priority: { type: String, default: "medium" },
  dueDate: Date,
  tags: [String],
  createdAt: { type: Date, default: Date.now }
})
const Task = mongoose.model("Task", TaskSchema)

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

// ── TAVILY HELPER ─────────────────────────────────────────────────────────────
async function tavilySearch(query, options = {}) {
  try {
    const key = process.env.TAVILY_API_KEY
    if (!key) { console.warn("⚠️ TAVILY_API_KEY not set"); return null }
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: options.depth || "basic",
        max_results: options.maxResults || 5,
        include_answer: true,
        include_raw_content: false,
        topic: options.topic || "general"
      })
    })
    if (!response.ok) { console.error("Tavily error:", response.status, await response.text()); return null }
    return await response.json()
  } catch(e) { console.error("Tavily fetch error:", e.message); return null }
}

function needsWebSearch(message) {
  if (!message) return false
  const msg = message.toLowerCase()
  const userMsg = msg.includes("user:") ? msg.split("user:").pop().trim() : msg
  const triggers = [
    "latest","recent","today","yesterday","this week","this month","right now",
    "current","now","live","breaking","just happened","recently","tonight",
    "this morning","2024","2025","2026","ongoing","still","as of",
    "war","attack","attacks","conflict","battle","strike","strikes","bombing",
    "missile","missiles","ceasefire","invasion","troops","army","military",
    "killed","casualties","fighting","warfare","explosion","explosions",
    "russia","ukraine","israel","gaza","palestine","iran","china","taiwan",
    "pakistan","myanmar","sudan","yemen","syria","north korea","korea",
    "nato","un","united nations","g20","g7",
    "modi","trump","biden","harris","putin","zelensky","netanyahu",
    "election","elections","vote","voting","government","minister","president",
    "prime minister","parliament","senate","congress","policy","law","bill",
    "protest","rally","riot","coup","sanctions",
    "earthquake","flood","tsunami","cyclone","hurricane","typhoon",
    "wildfire","volcano","disaster","emergency","rescue",
    "news","update","updates","what happened","what is happening","happening",
    "headline","headlines","report","announced","announcement","statement",
    "price","prices","cost","rate","rates","how much","worth",
    "stock","stocks","share","shares","market","nifty","sensex","nasdaq","dow",
    "crypto","bitcoin","ethereum","rupee","dollar","euro","gold","silver",
    "petrol","diesel","fuel","oil","inflation","gdp","economy",
    "score","scores","result","results","match","matches","game","games",
    "ipl","cricket","football","soccer","tennis","f1","formula 1","nba","nfl",
    "who won","who is winning","live score","playing","tournament","league","cup","final",
    "weather","temperature","rain","forecast","climate","humidity",
    "who is","who are","where is","when is","what is the status",
    "ceo","founder","chairman","died","death","arrested","sentence",
    "released","launched","new phone","new model","iphone","samsung","oneplus",
    "movie","film","show","series","album","song","release date",
    "search","find","look up","any news","tell me about","what about"
  ]
  return triggers.some(t => userMsg.includes(t))
}

// ── AGENT TOOLS ───────────────────────────────────────────────────────────────
async function toolWebSearch(query) {
  try {
    const data = await tavilySearch(query, { depth: "advanced", maxResults: 5 })
    if (!data) return { error: "Search unavailable" }
    return { answer: data.answer || "", results: (data.results || []).slice(0, 5).map(r => ({ title: r.title, content: r.content?.substring(0, 500), url: r.url, published: r.published_date })) }
  } catch(e) { return { error: e.message } }
}
async function toolGetNews(topic) {
  try {
    const data = await tavilySearch(topic + " latest news today 2026", { depth: "basic", maxResults: 6, topic: "news" })
    if (!data) return { error: "News unavailable" }
    return { answer: data.answer || "", news: (data.results || []).slice(0, 6).map(r => ({ title: r.title, summary: r.content?.substring(0, 350), url: r.url, published: r.published_date })) }
  } catch(e) { return { error: e.message } }
}
function toolCalculator(expression) {
  try {
    const sanitized = expression.replace(/[^0-9+\-*/.()%^√\s]/g, "")
    const result = Function('"use strict"; return (' + sanitized + ')')()
    return { expression, result, formatted: result.toLocaleString() }
  } catch(e) { return { error: "Invalid expression: " + expression } }
}
function toolRunCode(code) {
  try {
    const logs = []
    const mockConsole = { log: (...a) => logs.push(a.join(" ")), error: (...a) => logs.push("ERROR: "+a.join(" ")), warn: (...a) => logs.push("WARN: "+a.join(" ")) }
    const fn = new Function("console", code)
    const result = fn(mockConsole)
    return { output: logs.join("\n"), result: result !== undefined ? String(result) : null, success: true }
  } catch(e) { return { error: e.message, success: false } }
}
async function toolManageTasks(action, userId, data) {
  try {
    if (action === "create") { const t = await Task.create({ userId, title: data.title, description: data.description, priority: data.priority||"medium", dueDate: data.dueDate?new Date(data.dueDate):null, tags: data.tags||[] }); return { success: true, task: { id: t._id, title: t.title, priority: t.priority } } }
    if (action === "list") { const ts = await Task.find({ userId, status: { $ne: "done" } }).sort({ createdAt: -1 }).limit(10); return { tasks: ts.map(t => ({ id: t._id, title: t.title, status: t.status, priority: t.priority })) } }
    if (action === "complete") { await Task.findOneAndUpdate({ _id: data.id, userId }, { status: "done" }); return { success: true } }
    if (action === "delete") { await Task.findOneAndDelete({ _id: data.id, userId }); return { success: true } }
    return { error: "Unknown action" }
  } catch(e) { return { error: e.message } }
}
async function toolMemory(action, userId, data) {
  try {
    if (action === "save") { await AgentMemory.findOneAndUpdate({ userId, key: data.key }, { userId, key: data.key, value: data.value, category: data.category||"general", updatedAt: new Date() }, { upsert: true }); return { success: true, saved: data.key } }
    if (action === "recall") { const m = await AgentMemory.findOne({ userId, key: data.key }); return m ? { found: true, key: m.key, value: m.value } : { found: false } }
    if (action === "list") { const ms = await AgentMemory.find({ userId }).sort({ updatedAt: -1 }).limit(20); return { memories: ms.map(m => ({ key: m.key, value: m.value, category: m.category })) } }
    if (action === "delete") { await AgentMemory.findOneAndDelete({ userId, key: data.key }); return { success: true } }
    return { error: "Unknown action" }
  } catch(e) { return { error: e.message } }
}
async function toolTranslate(text, targetLang) {
  try {
    const r = await groq.chat.completions.create({ model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: `Translate to ${targetLang}. Return ONLY the translation:\n\n${text}` }], max_tokens: 500, temperature: 0.3 })
    return { original: text, translated: r.choices[0]?.message?.content?.trim(), language: targetLang }
  } catch(e) { return { error: e.message } }
}
async function toolGetWeather(location) {
  try {
    const data = await tavilySearch("weather in " + location + " today temperature forecast", { depth: "basic", maxResults: 3 })
    if (!data) return { error: "Weather unavailable" }
    return { location, weather: data.answer || data.results?.[0]?.content?.substring(0, 400) || "Weather data not available" }
  } catch(e) { return { error: e.message } }
}
async function toolSearchProducts(query, maxPrice) {
  try {
    const data = await tavilySearch(query + (maxPrice ? " under " + maxPrice : "") + " price India 2026", { depth: "basic", maxResults: 5 })
    if (!data) return { error: "Search unavailable" }
    return { query, products: (data.results||[]).slice(0,5).map(r => ({ title: r.title, info: r.content?.substring(0,300), url: r.url })) }
  } catch(e) { return { error: e.message } }
}
async function toolSummarizeUrl(url) {
  try {
    const data = await tavilySearch(url, { depth: "advanced", maxResults: 1 })
    if (!data) return { error: "Could not fetch URL" }
    const content = data.results?.[0]?.content || ""
    if (!content) return { error: "No content found" }
    const s = await groq.chat.completions.create({ model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: "Summarize in 4 bullet points:\n\n" + content.substring(0, 3000) }], max_tokens: 400, temperature: 0.5 })
    return { url, summary: s.choices[0]?.message?.content?.trim() }
  } catch(e) { return { error: e.message } }
}
async function executeTool(toolName, params, userId) {
  console.log("🔧 Tool:", toolName, JSON.stringify(params).substring(0, 100))
  switch(toolName) {
    case "web_search":      return await toolWebSearch(params.query)
    case "get_news":        return await toolGetNews(params.topic)
    case "calculator":      return toolCalculator(params.expression)
    case "run_code":        return toolRunCode(params.code)
    case "manage_tasks":    return await toolManageTasks(params.action, userId, params)
    case "memory":          return await toolMemory(params.action, userId, params)
    case "translate":       return await toolTranslate(params.text, params.target_language)
    case "get_weather":     return await toolGetWeather(params.location)
    case "search_products": return await toolSearchProducts(params.query, params.max_price)
    case "summarize_url":   return await toolSummarizeUrl(params.url)
    default: return { error: "Unknown tool: " + toolName }
  }
}

const AGENT_SYSTEM_PROMPT = `You are Datta AI Agent — a powerful autonomous AI assistant. Today's date is ${new Date().toLocaleDateString("en-IN", { weekday:"long", year:"numeric", month:"long", day:"numeric" })}.

AVAILABLE TOOLS:
1. web_search(query) — Search the web for ANY real-time information
2. get_news(topic) — Get latest news (war, politics, sports, business, tech)
3. calculator(expression) — Math calculations
4. run_code(code) — Execute JavaScript code
5. manage_tasks(action, title, description, priority, dueDate) — Manage tasks (create/list/complete/delete)
6. memory(action, key, value, category) — Remember/recall user info (save/recall/list/delete)
7. translate(text, target_language) — Translate to any language
8. get_weather(location) — Get weather
9. search_products(query, max_price) — Find products and prices
10. summarize_url(url) — Summarize any webpage

CRITICAL RULES:
- For ANY real-time question (war, news, prices, scores, weather) → ALWAYS use web_search or get_news
- NEVER say "I don't have real-time data" — use your tools instead
- After getting search results, give a clear organized answer with key facts
- Cite sources when available
- Maximum 5 tool calls per request
- Be concise and direct

TO USE A TOOL — respond with EXACTLY this format:
TOOL_CALL:{"tool":"tool_name","params":{"param1":"value1"}}`

// ── AGENT ROUTE ───────────────────────────────────────────────────────────────
app.post("/agent", upload.none(), authMiddleware, async (req, res) => {
  try {
    const { message, chatId, language } = req.body
    const userId = req.user.id
    if (!message) return res.status(400).json({ error: "No message" })

    res.setHeader("Content-Type", "text/plain; charset=utf-8")
    res.setHeader("x-agent-mode", "true")

    const sub = await Subscription.findOne({ userId, active: true }).catch(() => null)
    const userPlan = sub ? sub.plan : "free"
    const msgCheck = checkAndUpdateLimit(userId, userPlan, "messages")
    if (!msgCheck.allowed) { res.write("⚠️ Message limit reached. Please upgrade your plan."); res.end(); return }

    let chat = null
    if (chatId && chatId !== "null" && chatId !== "") {
      try { chat = await Chat.findOne({ _id: chatId, userId }) } catch(e) {}
    }
    if (!chat) chat = await Chat.create({ userId, title: message.substring(0, 45) + (message.length > 45 ? "..." : ""), messages: [] })

    let cleanMessage = message
    if (message.includes("User:")) cleanMessage = message.split("User:").pop().trim()
    else if (message.includes("[STRICT INSTRUCTION]") || message.includes("[CURRENT DATE")) {
      const parts = message.split("\n\n")
      cleanMessage = parts[parts.length - 1].trim()
      if (cleanMessage.startsWith("[")) cleanMessage = message
    }

    chat.messages.push({ role: "user", content: cleanMessage })
    await chat.save()
    res.setHeader("x-chat-id", chat._id.toString())

    const memories = await AgentMemory.find({ userId }).sort({ updatedAt: -1 }).limit(8)
    const memContext = memories.length > 0 ? "\n\nUSER MEMORIES:\n" + memories.map(m => `${m.key}: ${JSON.stringify(m.value)}`).join("\n") : ""
    const history = chat.messages.slice(0, -1).slice(-6).map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }))
    const langNote = language && language !== "English" ? `\n\nIMPORTANT: Respond in ${language}.` : ""

    let currentMessages = [
      { role: "system", content: AGENT_SYSTEM_PROMPT + memContext + langNote },
      ...history,
      { role: "user", content: cleanMessage }
    ]

    let fullResponse = ""
    let toolCallCount = 0
    const MAX_TOOLS = 5
    let continueLoop = true

    while (continueLoop && toolCallCount < MAX_TOOLS) {
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile", messages: currentMessages, max_tokens: 2000, temperature: 0.7, stream: false
      })
      const agentResponse = completion.choices[0]?.message?.content || ""
      const toolCallMatch = agentResponse.match(/TOOL_CALL:\s*(\{[\s\S]*?\}(?=\n|$))/m)

      if (toolCallMatch) {
        toolCallCount++
        const beforeTool = agentResponse.substring(0, agentResponse.indexOf("TOOL_CALL:")).trim()
        if (beforeTool) { res.write(beforeTool + "\n\n"); fullResponse += beforeTool + "\n\n" }

        let toolData
        try { toolData = JSON.parse(toolCallMatch[1].replace(/\n/g, " ")) }
        catch(e) { res.write("\n⚠️ Tool parse error\n\n"); break }

        const toolEmojis = { web_search:"🔍", get_news:"📰", calculator:"🧮", run_code:"💻", manage_tasks:"📋", memory:"🧠", translate:"🌍", get_weather:"🌤️", search_products:"🛒", summarize_url:"🔗" }
        const statusMsg = `\n${toolEmojis[toolData.tool]||"🔧"} **Searching: ${toolData.params?.query || toolData.params?.topic || toolData.tool}...**\n\n`
        res.write(statusMsg); fullResponse += statusMsg

        const toolResult = await executeTool(toolData.tool, toolData.params || {}, userId)
        currentMessages.push({ role: "assistant", content: agentResponse })
        currentMessages.push({ role: "user", content: `Tool result for ${toolData.tool}:\n${JSON.stringify(toolResult, null, 2)}\n\nNow give a clear, organized answer to the user's question using these results. Don't mention "tool results" — just answer naturally.` })
      } else {
        for (const word of agentResponse.split(/(\s+)/)) { res.write(word); fullResponse += word }
        continueLoop = false
      }
    }

    chat.messages.push({ role: "assistant", content: fullResponse })
    if (chat.messages.length <= 4) {
      try {
        const t = await groq.chat.completions.create({ model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: `Generate a very short title (max 5 words, no quotes) for: "${cleanMessage}". Just the title.` }], max_tokens: 15, temperature: 0.5 })
        const nt = t.choices[0]?.message?.content?.trim()
        if (nt && !nt.startsWith("[")) chat.title = nt
      } catch(e) {}
    }
    await chat.save()
    res.write("\nCHATID" + chat._id)
    res.end()
  } catch(err) {
    console.error("❌ Agent error:", err.message)
    if (!res.headersSent) res.status(500).json({ error: err.message })
    else { res.write("\n⚠️ Error: " + err.message); res.end() }
  }
})

app.get("/agent/tasks", authMiddleware, async (req, res) => { try { res.json(await Task.find({ userId: req.user.id }).sort({ createdAt: -1 })) } catch(e) { res.status(500).json({ error: e.message }) } })
app.post("/agent/tasks", authMiddleware, async (req, res) => { try { res.json(await Task.create({ userId: req.user.id, ...req.body })) } catch(e) { res.status(500).json({ error: e.message }) } })
app.put("/agent/tasks/:id", authMiddleware, async (req, res) => { try { res.json(await Task.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, req.body, { new: true })) } catch(e) { res.status(500).json({ error: e.message }) } })
app.delete("/agent/tasks/:id", authMiddleware, async (req, res) => { try { await Task.findOneAndDelete({ _id: req.params.id, userId: req.user.id }); res.json({ success: true }) } catch(e) { res.status(500).json({ error: e.message }) } })
app.get("/agent/memory", authMiddleware, async (req, res) => { try { res.json(await AgentMemory.find({ userId: req.user.id }).sort({ updatedAt: -1 })) } catch(e) { res.status(500).json({ error: e.message }) } })
app.delete("/agent/memory/:key", authMiddleware, async (req, res) => { try { await AgentMemory.findOneAndDelete({ userId: req.user.id, key: req.params.key }); res.json({ success: true }) } catch(e) { res.status(500).json({ error: e.message }) } })

async function webSearch(query) {
  try {
    const data = await tavilySearch(query, { depth: "basic", maxResults: 5 })
    if (!data || !data.results?.length) return null
    const answer = data.answer ? "Summary: " + data.answer + "\n\n" : ""
    const sources = data.results.slice(0, 4).map((r, i) => (i+1) + ". " + r.title + "\n" + (r.content||"").substring(0,350) + "\nSource: " + r.url).join("\n\n")
    return answer + sources
  } catch(e) { return null }
}

function isImageRequest(message) {
  if (!message) return false
  const msg = message.toLowerCase()
  return ["generate image","create image","make image","generate a image","create a image","generate an image","create an image","make an image","generate photo","create photo","generate picture","create picture","generate art","create art","make art","draw","paint","illustrate","sketch","image of","picture of","photo of","show me a image","show me an image","genrate","generat","dall-e","stable diffusion"].some(t => msg.includes(t))
}

function getImagePrompt(message) {
  let prompt = message.trim()
  const removes = ["generate an image of","create an image of","make an image of","generate a image of","create a image of","make a image of","generate image of","create image of","make image of","generate an image","create an image","make an image","generate a image","create a image","make a image","generate image","create image","make image","generate a photo of","create a photo of","generate a photo","create a photo","generate photo","generate a picture of","create a picture of","generate a picture","create a picture","generate picture","generate art","create art","make art","draw me a","draw me an","draw me","draw a","draw an","draw","paint a","paint an","paint","illustrate a","illustrate an","illustrate","sketch of a","sketch of an","sketch of","sketch a","sketch an","sketch","image of a","image of an","image of","picture of a","picture of an","picture of","photo of a","photo of an","photo of","show me a image of","show me an image of","show me a image","show me an image","genrate an","genrate a","genrate","generat an","generat a","generat"]
  removes.sort((a, b) => b.length - a.length)
  removes.forEach(r => { prompt = prompt.replace(new RegExp("^" + r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "\\s*", "i"), "") })
  return prompt.trim() || message
}

function getSystemPrompt(language, hasSearch) {
  const now = new Date()
  const dateStr = now.toLocaleDateString("en-IN", { weekday:"long", year:"numeric", month:"long", day:"numeric" })
  return `You are Datta AI — a powerful AI assistant. Today is ${dateStr}. Current year: ${now.getFullYear()}.

RULES:
1. Always give COMPLETE answers
2. For coding: give FULL working code
3. For websites: give COMPLETE HTML+CSS+JS
4. NEVER say "I can't do that"
5. Format code in markdown code blocks
6. You know the current date is ${dateStr}${language && language !== "English" ? ` Always respond in ${language}.` : ""}${hasSearch ? " Use the web search results provided to give accurate, up-to-date answers. Cite sources when available." : ""}`
}

// ── MAIN CHAT ROUTE ───────────────────────────────────────────────────────────
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
      const greetings = ["hi","hii","hello","hey","helo","hai","sup","yo","hiya","howdy"]
      let title = greetings.includes(message.trim().toLowerCase()) ? "New conversation" : message.trim().substring(0, 45)
      if (message.trim().length > 45) title += "..."
      chat = await Chat.create({ userId, title, messages: [] })
    }

    chat.messages.push({ role: "user", content: message || "[File: " + (file?.originalname || "unknown") + "]" })
    await chat.save()
    res.setHeader("x-chat-id", chat._id.toString())
    res.setHeader("Content-Type", "text/plain; charset=utf-8")

    if (message && isImageRequest(message)) {
      const imagePrompt = getImagePrompt(message)
      let imageUrl = null
      const HF_KEY = process.env.HF_API_KEY
      if (HF_KEY) {
        try {
          const hfRes = await fetch("https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell", {
            method: "POST", headers: { "Authorization": "Bearer " + HF_KEY, "Content-Type": "application/json", "x-wait-for-model": "true" },
            body: JSON.stringify({ inputs: imagePrompt, parameters: { num_inference_steps: 4, width: 1024, height: 1024 } })
          })
          if (hfRes.ok) { const buf = await hfRes.arrayBuffer(); imageUrl = "data:image/jpeg;base64," + Buffer.from(buf).toString("base64") }
        } catch(e) { console.warn("HF image error:", e.message) }
      }
      if (!imageUrl) {
        const seed = Math.floor(Math.random() * 999999)
        imageUrl = "https://image.pollinations.ai/prompt/" + encodeURIComponent(imagePrompt) + "?width=1024&height=1024&nologo=true&model=flux-schnell&seed=" + seed
      }
      const responseText = "DATTA_IMAGE_START\n![" + imagePrompt + "](" + imageUrl + ")\nPROMPT:" + imagePrompt + "\nDATTA_IMAGE_END"
      res.write(responseText)
      chat.messages.push({ role: "assistant", content: responseText })
      await chat.save()
      res.write("CHATID" + chat._id)
      res.end()
      return
    }

    let searchContext = ""
    if (message && needsWebSearch(message) && process.env.TAVILY_API_KEY) {
      const results = await webSearch(message)
      if (results) searchContext = "\n\n[Real-time Web Search Results - " + new Date().toLocaleDateString() + "]\n" + results + "\n[End of Search Results]"
    }

    const history = chat.messages.slice(0, -1).slice(-10).map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }))
    const isImageFile = file && file.mimetype?.startsWith("image/")
    let userContent
    if (isImageFile) {
      userContent = [{ type: "text", text: (message || "Analyze this image in detail.") + searchContext }, { type: "image_url", image_url: { url: "data:" + file.mimetype + ";base64," + file.buffer.toString("base64") } }]
    } else if (file) {
      try { userContent = (message ? message + "\n\n" : "") + "[File: " + file.originalname + "]\n\n" + file.buffer.toString("utf-8") + searchContext }
      catch(e) { userContent = (message ? message + "\n\n" : "") + "[File: " + file.originalname + "]" + searchContext }
    } else {
      userContent = message + searchContext
    }

    const model = isImageFile ? "meta-llama/llama-4-scout-17b-16e-instruct" : "llama-3.3-70b-versatile"
    const msg = message.toLowerCase()
    const needsLong = ["website","code","full","complete","build","create","write","html","python","program","story","article"].some(k => msg.includes(k))
    const maxTokens = isImageFile ? 1024 : (needsLong ? 8000 : 1024)

    const stream = await groq.chat.completions.create({
      model, messages: [{ role: "system", content: getSystemPrompt(language, !!searchContext) }, ...history, { role: "user", content: userContent }],
      max_tokens: maxTokens, temperature: 0.7, stream: true
    })

    let full = ""
    for await (const part of stream) {
      const token = part.choices?.[0]?.delta?.content
      if (token) { full += token; res.write(token) }
    }

    chat.messages.push({ role: "assistant", content: full })
    if (chat.messages.length === 4 || chat.title === "New conversation") {
      try {
        const t = await groq.chat.completions.create({ model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: "Generate a very short title (max 5 words, no quotes) for: \"" + message + "\". Just the title." }], max_tokens: 15, temperature: 0.5 })
        const nt = t.choices?.[0]?.message?.content?.trim()
        if (nt && !nt.startsWith("[")) chat.title = nt
      } catch(e) {}
    }
    await chat.save()
    res.write("CHATID" + chat._id)
    res.end()
  } catch(err) {
    console.error("❌ Chat error:", err.message)
    if (!res.headersSent) res.status(500).send("Server error: " + err.message)
    else res.end()
  }
})

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

// ══════════════════════════════════════════════════════════════════════════════
// ── FIX 2: /auth/send-otp — ACTUALLY SENDS SMS VIA TWILIO NOW ────────────────
// Old code only did console.log(otp) — never called Twilio!
// ══════════════════════════════════════════════════════════════════════════════
app.post("/auth/send-otp", async (req, res) => {
  try {
    const { phone } = req.body
    if (!phone) return res.status(400).json({ error: "Phone number required" })

    // Validate format: must be +<country_code><number>
    const phoneRegex = /^\+[1-9]\d{7,14}$/
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({ error: "Invalid phone format. Use +91XXXXXXXXXX" })
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    otpStore[phone] = { otp, expires: Date.now() + 10 * 60 * 1000 } // 10 min expiry

    if (twilioClient && process.env.TWILIO_PHONE) {
      // ✅ ACTUALLY SEND THE SMS
      await twilioClient.messages.create({
        body: `Your Datta AI OTP is: ${otp}. Valid for 10 minutes. Do not share this code.`,
        from: process.env.TWILIO_PHONE,
        to: phone
      })
      console.log(`✅ OTP SMS sent to ${phone}`)
    } else {
      // Dev fallback: log to console
      console.log(`⚠️ Twilio not configured. DEV OTP for ${phone}: ${otp}`)
    }

    res.json({ success: true, message: "OTP sent successfully" })

  } catch(err) {
    console.error("❌ OTP send error:", err)

    // Specific Twilio error messages
    if (err.code === 21608) return res.status(400).json({ error: "Number not verified in Twilio trial. Go to console.twilio.com → Verified Caller IDs and add +91XXXXXXXXXX" })
    if (err.code === 21211) return res.status(400).json({ error: "Invalid phone number format. Use +91XXXXXXXXXX" })
    if (err.code === 20003) return res.status(500).json({ error: "Twilio auth failed. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in Render environment variables." })

    res.status(500).json({ error: "Failed to send OTP: " + err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// ── FIX 3: /auth/verify-otp — better error messages, string comparison ────────
// ══════════════════════════════════════════════════════════════════════════════
app.post("/auth/verify-otp", async (req, res) => {
  try {
    const { phone, otp } = req.body
    if (!phone || !otp) return res.status(400).json({ error: "Phone and OTP are required" })

    const stored = otpStore[phone]
    if (!stored) return res.status(400).json({ error: "No OTP was sent to this number. Please request a new OTP." })
    if (Date.now() > stored.expires) { delete otpStore[phone]; return res.status(400).json({ error: "OTP has expired. Please request a new one." }) }
    if (stored.otp !== otp.toString().trim()) return res.status(400).json({ error: "Incorrect OTP. Please check and try again." })

    delete otpStore[phone] // Consumed — can't reuse

    let user = await User.findOne({ phone })
    if (!user) user = await User.create({ username: "user_" + phone.slice(-4), phone })

    res.json({ token: generateToken(user), user: { id: user._id, username: user.username } })
  } catch(err) {
    console.error("❌ OTP verify error:", err)
    res.status(500).json({ error: err.message })
  }
})

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "https://datta-ai-server.onrender.com/auth/google/callback"
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ googleId: profile.id })
      if (!user) user = await User.create({ googleId: profile.id, username: (profile.displayName?.split(" ")[0]||"User") + "_" + profile.id.slice(-4), email: profile.emails?.[0]?.value || "" })
      return done(null, { token: generateToken(user), user: { id: user._id, username: user.username, email: user.email } })
    } catch(err) { return done(err, null) }
  }))
}
app.get("/auth/google", passport.authenticate("google", { scope: ["profile","email"] }))
app.get("/auth/google/callback", passport.authenticate("google", { session: false, failureRedirect: FRONTEND_URL + "/login.html?error=google_failed" }), (req, res) => {
  res.redirect(FRONTEND_URL + "/login.html?token=" + req.user.token + "&user=" + encodeURIComponent(JSON.stringify(req.user.user)))
})

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
    await Promise.all([
      Chat.deleteMany({ userId: req.user.id }), Subscription.deleteMany({ userId: req.user.id }),
      Project.deleteMany({ userId: req.user.id }), AgentMemory.deleteMany({ userId: req.user.id }),
      Task.deleteMany({ userId: req.user.id }), User.findByIdAndDelete(req.user.id)
    ])
    res.json({ success: true })
  } catch(err) { res.status(500).json({ error: err.message }) }
})

// ── SUBSCRIPTION ROUTES ───────────────────────────────────────────────────────
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
app.post("/payment/update-plan", authMiddleware, async (req, res) => {
  try {
    const { plan, period, paymentId } = req.body
    const endDate = new Date()
    endDate.setMonth(endDate.getMonth() + (period === "yearly" ? 12 : 1))
    await Subscription.findOneAndUpdate({ userId: req.user.id }, { plan, period, paymentId, startDate: new Date(), endDate, active: true }, { upsert: true, new: true })
    res.json({ success: true })
  } catch(err) { res.status(500).json({ error: err.message }) }
})

// ── IMAGE GENERATION ROUTE ────────────────────────────────────────────────────
app.post("/generate-image", upload.none(), authMiddleware, async (req, res) => {
  try {
    const prompt = req.body.prompt
    if (!prompt) return res.status(400).json({ error: "No prompt" })
    const HF_KEY = process.env.HF_API_KEY
    const seed = Math.floor(Math.random() * 999999)
    if (!HF_KEY) return res.json({ imageUrl: "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt) + "?width=1024&height=1024&nologo=true&model=flux-schnell&seed=" + seed, source: "pollinations" })
    const response = await fetch("https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell", {
      method: "POST", headers: { "Authorization": "Bearer " + HF_KEY, "Content-Type": "application/json", "x-wait-for-model": "true" },
      body: JSON.stringify({ inputs: prompt, parameters: { num_inference_steps: 4, width: 1024, height: 1024 } })
    })
    if (!response.ok) return res.json({ imageUrl: "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt) + "?width=1024&height=1024&nologo=true&model=flux-schnell&seed=" + seed, source: "pollinations_fallback" })
    res.json({ imageUrl: "data:image/jpeg;base64," + Buffer.from(await response.arrayBuffer()).toString("base64"), source: "huggingface" })
  } catch(err) {
    const seed = Math.floor(Math.random() * 999999)
    res.json({ imageUrl: "https://image.pollinations.ai/prompt/" + encodeURIComponent(req.body.prompt||"art") + "?width=1024&height=1024&nologo=true&model=flux-schnell&seed=" + seed, source: "pollinations_fallback" })
  }
})

// ── CHAT HISTORY ROUTES ───────────────────────────────────────────────────────
app.get("/chats", authMiddleware, async (req, res) => { try { res.json(await Chat.find({ userId: req.user.id }).sort({ createdAt: -1 }).select("title createdAt")) } catch(err) { res.status(500).json({ error: err.message }) } })
app.get("/chat/:id", authMiddleware, async (req, res) => { try { const c = await Chat.findOne({ _id: req.params.id, userId: req.user.id }); res.json(c ? c.messages : []) } catch(err) { res.status(500).json({ error: err.message }) } })
app.delete("/chat/:id", authMiddleware, async (req, res) => { try { await Chat.findOneAndDelete({ _id: req.params.id, userId: req.user.id }); res.json({ success: true }) } catch(err) { res.status(500).json({ error: err.message }) } })
app.delete("/chats/all", authMiddleware, async (req, res) => { try { await Chat.deleteMany({ userId: req.user.id }); res.json({ success: true }) } catch(err) { res.status(500).json({ error: err.message }) } })
app.post("/chat/:id/rename", authMiddleware, async (req, res) => { try { await Chat.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, { title: req.body.title }); res.json({ success: true }) } catch(err) { res.status(500).json({ error: err.message }) } })

// ── PROJECT ROUTES ────────────────────────────────────────────────────────────
app.get("/projects", authMiddleware, async (req, res) => { try { if (req.user.isGuest) return res.json([]); res.json(await Project.find({ userId: req.user.id }).sort({ createdAt: -1 })) } catch(err) { res.status(500).json({ error: err.message }) } })
app.post("/projects/save", authMiddleware, async (req, res) => {
  try {
    if (req.user.isGuest) return res.json({ success: true, skipped: true })
    const { projectId, name, color, createdAt, chats, files, artifacts } = req.body
    if (!projectId) return res.status(400).json({ error: "projectId required" })
    await Project.findOneAndUpdate({ userId: req.user.id, projectId }, { userId: req.user.id, projectId, name: name||"Untitled Project", color: color||"#ffd700", createdAt: createdAt||Date.now(), chats: chats||[], files: files||[], artifacts: artifacts||[] }, { upsert: true, new: true })
    res.json({ success: true })
  } catch(err) { res.status(500).json({ error: err.message }) }
})
app.delete("/projects/:projectId", authMiddleware, async (req, res) => { try { if (req.user.isGuest) return res.json({ success: true, skipped: true }); await Project.findOneAndDelete({ userId: req.user.id, projectId: req.params.projectId }); res.json({ success: true }) } catch(err) { res.status(500).json({ error: err.message }) } })

// ── HEALTH & ROOT ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.json({ status: "✅ Datta AI Agent Server", version: "4.2-otp-fixed" }))
app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log("🚀 Datta AI Server v4.2 running on port " + PORT))
