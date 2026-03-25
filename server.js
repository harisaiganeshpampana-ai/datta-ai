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

// ══════════════════════════════════════════════════════════════════════════════
// ── FIX 1: TAVILY HELPER — CORRECT API CALL ───────────────────────────────────
// Old code used "Authorization: Bearer key" — WRONG for Tavily
// Tavily needs api_key in the request BODY
// ══════════════════════════════════════════════════════════════════════════════
async function tavilySearch(query, options = {}) {
  try {
    const key = process.env.TAVILY_API_KEY
    if (!key) {
      console.warn("⚠️ TAVILY_API_KEY not set")
      return null
    }
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // ✅ FIXED: api_key goes in BODY, not Authorization header
      body: JSON.stringify({
        api_key: key,           // ← CORRECT way for Tavily
        query: query,
        search_depth: options.depth || "basic",
        max_results: options.maxResults || 5,
        include_answer: true,
        include_raw_content: false,
        topic: options.topic || "general"  // "news" for news queries
      })
    })
    if (!response.ok) {
      const errText = await response.text()
      console.error("Tavily error:", response.status, errText)
      return null
    }
    return await response.json()
  } catch(e) {
    console.error("Tavily fetch error:", e.message)
    return null
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── FIX 2: EXPANDED needsWebSearch — war/conflict/news etc ────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function needsWebSearch(message) {
  if (!message) return false
  const msg = message.toLowerCase()

  // Remove system instruction prefix to get actual user question
  const userMsg = msg.includes("user:") ? msg.split("user:").pop().trim() : msg

  const triggers = [
    // Time signals
    "latest","recent","today","yesterday","this week","this month","right now",
    "current","now","live","breaking","just happened","recently","tonight",
    "this morning","2024","2025","2026","ongoing","still","as of",
    // ✅ NEW: War & Conflict
    "war","attack","attacks","conflict","battle","strike","strikes","bombing",
    "missile","missiles","ceasefire","invasion","troops","army","military",
    "killed","casualties","fighting","warfare","explosion","explosions",
    // ✅ NEW: Countries in news
    "russia","ukraine","israel","gaza","palestine","iran","china","taiwan",
    "pakistan","myanmar","sudan","yemen","syria","north korea","korea",
    "nato","un","united nations","g20","g7",
    // ✅ NEW: Politics
    "modi","trump","biden","harris","putin","zelensky","netanyahu",
    "election","elections","vote","voting","government","minister","president",
    "prime minister","parliament","senate","congress","policy","law","bill",
    "protest","rally","riot","coup","sanctions",
    // ✅ NEW: Disasters
    "earthquake","flood","tsunami","cyclone","hurricane","typhoon",
    "wildfire","volcano","disaster","emergency","rescue",
    // News
    "news","update","updates","what happened","what is happening","happening",
    "headline","headlines","report","announced","announcement","statement",
    // Prices & Finance
    "price","prices","cost","rate","rates","how much","worth",
    "stock","stocks","share","shares","market","nifty","sensex","nasdaq","dow",
    "crypto","bitcoin","ethereum","rupee","dollar","euro","gold","silver",
    "petrol","diesel","fuel","oil","inflation","gdp","economy",
    // Sports
    "score","scores","result","results","match","matches","game","games",
    "ipl","cricket","football","soccer","tennis","f1","formula 1","nba","nfl",
    "who won","who is winning","live score","playing","tournament","league","cup","final",
    // Weather
    "weather","temperature","rain","forecast","climate","humidity",
    // People
    "who is","who are","where is","when is","what is the status",
    "ceo","founder","chairman","died","death","arrested","sentence",
    // Products & Tech
    "released","launched","new phone","new model","iphone","samsung","oneplus",
    "movie","film","show","series","album","song","release date",
    // Search intent
    "search","find","look up","any news","tell me about","what about"
  ]

  return triggers.some(t => userMsg.includes(t))
}

// ── AGENT TOOLS ───────────────────────────────────────────────────────────────
async function toolWebSearch(query) {
  try {
    const data = await tavilySearch(query, { depth: "advanced", maxResults: 5 })
    if (!data) return { error: "Search unavailable" }
    return {
      answer: data.answer || "",
      results: (data.results || []).slice(0, 5).map(r => ({
        title: r.title,
        content: r.content?.substring(0, 500),
        url: r.url,
        published: r.published_date
      }))
    }
  } catch(e) { return { error: e.message } }
}

async function toolGetNews(topic) {
  try {
    const data = await tavilySearch(topic + " latest news today 2026", {
      depth: "basic", maxResults: 6, topic: "news"
    })
    if (!data) return { error: "News unavailable" }
    return {
      answer: data.answer || "",
      news: (data.results || []).slice(0, 6).map(r => ({
        title: r.title,
        summary: r.content?.substring(0, 350),
        url: r.url,
        published: r.published_date
      }))
    }
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
    const mockConsole = {
      log: (...args) => logs.push(args.join(" ")),
      error: (...args) => logs.push("ERROR: " + args.join(" ")),
      warn: (...args) => logs.push("WARN: " + args.join(" "))
    }
    const fn = new Function("console", code)
    const result = fn(mockConsole)
    return { output: logs.join("\n"), result: result !== undefined ? String(result) : null, success: true }
  } catch(e) { return { error: e.message, success: false } }
}

async function toolManageTasks(action, userId, data) {
  try {
    if (action === "create") {
      const task = await Task.create({ userId, title: data.title, description: data.description, priority: data.priority || "medium", dueDate: data.dueDate ? new Date(data.dueDate) : null, tags: data.tags || [] })
      return { success: true, task: { id: task._id, title: task.title, priority: task.priority } }
    }
    if (action === "list") {
      const tasks = await Task.find({ userId, status: { $ne: "done" } }).sort({ createdAt: -1 }).limit(10)
      return { tasks: tasks.map(t => ({ id: t._id, title: t.title, status: t.status, priority: t.priority })) }
    }
    if (action === "complete") {
      await Task.findOneAndUpdate({ _id: data.id, userId }, { status: "done" })
      return { success: true }
    }
    if (action === "delete") {
      await Task.findOneAndDelete({ _id: data.id, userId })
      return { success: true }
    }
    return { error: "Unknown action" }
  } catch(e) { return { error: e.message } }
}

async function toolMemory(action, userId, data) {
  try {
    if (action === "save") {
      await AgentMemory.findOneAndUpdate(
        { userId, key: data.key },
        { userId, key: data.key, value: data.value, category: data.category || "general", updatedAt: new Date() },
        { upsert: true }
      )
      return { success: true, saved: data.key }
    }
    if (action === "recall") {
      const mem = await AgentMemory.findOne({ userId, key: data.key })
      return mem ? { found: true, key: mem.key, value: mem.value } : { found: false }
    }
    if (action === "list") {
      const mems = await AgentMemory.find({ userId }).sort({ updatedAt: -1 }).limit(20)
      return { memories: mems.map(m => ({ key: m.key, value: m.value, category: m.category })) }
    }
    if (action === "delete") {
      await AgentMemory.findOneAndDelete({ userId, key: data.key })
      return { success: true }
    }
    return { error: "Unknown action" }
  } catch(e) { return { error: e.message } }
}

async function toolTranslate(text, targetLang) {
  try {
    const result = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: `Translate this text to ${targetLang}. Return ONLY the translation:\n\n${text}` }],
      max_tokens: 500, temperature: 0.3
    })
    return { original: text, translated: result.choices[0]?.message?.content?.trim(), language: targetLang }
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
    const q = query + (maxPrice ? " under " + maxPrice : "") + " price India 2026"
    const data = await tavilySearch(q, { depth: "basic", maxResults: 5 })
    if (!data) return { error: "Search unavailable" }
    return {
      query,
      products: (data.results || []).slice(0, 5).map(r => ({
        title: r.title,
        info: r.content?.substring(0, 300),
        url: r.url
      }))
    }
  } catch(e) { return { error: e.message } }
}

async function toolSummarizeUrl(url) {
  try {
    const data = await tavilySearch(url, { depth: "advanced", maxResults: 1 })
    if (!data) return { error: "Could not fetch URL" }
    const content = data.results?.[0]?.content || ""
    if (!content) return { error: "No content found" }
    const summary = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: "Summarize in 4 bullet points:\n\n" + content.substring(0, 3000) }],
      max_tokens: 400, temperature: 0.5
    })
    return { url, summary: summary.choices[0]?.message?.content?.trim() }
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

// ── AGENT SYSTEM PROMPT ───────────────────────────────────────────────────────
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

// ══════════════════════════════════════════════════════════════════════════════
// ── FIX 3: /agent ROUTE — now properly called from frontend ──────────────────
// ══════════════════════════════════════════════════════════════════════════════
app.post("/agent", upload.none(), authMiddleware, async (req, res) => {
  try {
    const { message, chatId, language, mood } = req.body
    const userId = req.user.id
    if (!message) return res.status(400).json({ error: "No message" })

    res.setHeader("Content-Type", "text/plain; charset=utf-8")
    res.setHeader("x-agent-mode", "true")

    // Rate limit check
    const sub = await Subscription.findOne({ userId, active: true }).catch(() => null)
    const userPlan = sub ? sub.plan : "free"
    const msgCheck = checkAndUpdateLimit(userId, userPlan, "messages")
    if (!msgCheck.allowed) {
      res.write("⚠️ Message limit reached. Please upgrade your plan.")
      res.end()
      return
    }

    // Load/create chat
    let chat = null
    if (chatId && chatId !== "null" && chatId !== "") {
      try { chat = await Chat.findOne({ _id: chatId, userId }) } catch(e) {}
    }
    if (!chat) {
      const title = message.substring(0, 45) + (message.length > 45 ? "..." : "")
      chat = await Chat.create({ userId, title, messages: [] })
    }

    // Clean user message (remove system instructions added by frontend)
    let cleanMessage = message
    if (message.includes("User:")) {
      cleanMessage = message.split("User:").pop().trim()
    } else if (message.includes("[STRICT INSTRUCTION]") || message.includes("[CURRENT DATE")) {
      const parts = message.split("\n\n")
      cleanMessage = parts[parts.length - 1].trim()
      if (cleanMessage.startsWith("[")) cleanMessage = message
    }

    chat.messages.push({ role: "user", content: cleanMessage })
    await chat.save()
    res.setHeader("x-chat-id", chat._id.toString())

    // Load memories for context
    const memories = await AgentMemory.find({ userId }).sort({ updatedAt: -1 }).limit(8)
    const memContext = memories.length > 0
      ? "\n\nUSER MEMORIES:\n" + memories.map(m => `${m.key}: ${JSON.stringify(m.value)}`).join("\n")
      : ""

    const history = chat.messages.slice(0, -1).slice(-6).map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content
    }))

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
        model: "llama-3.3-70b-versatile",
        messages: currentMessages,
        max_tokens: 2000,
        temperature: 0.7,
        stream: false
      })

      const agentResponse = completion.choices[0]?.message?.content || ""

      // Check for tool call
      const toolCallMatch = agentResponse.match(/TOOL_CALL:\s*(\{[\s\S]*?\}(?=\n|$))/m)

      if (toolCallMatch) {
        toolCallCount++

        // Stream text before tool call
        const beforeTool = agentResponse.substring(0, agentResponse.indexOf("TOOL_CALL:")).trim()
        if (beforeTool) {
          res.write(beforeTool + "\n\n")
          fullResponse += beforeTool + "\n\n"
        }

        // Parse tool
        let toolData
        try {
          toolData = JSON.parse(toolCallMatch[1].replace(/\n/g, " "))
        } catch(e) {
          console.error("Tool parse error:", e.message, toolCallMatch[1])
          res.write("\n⚠️ Tool call parse error\n\n")
          break
        }

        const toolName = toolData.tool
        const toolParams = toolData.params || {}

        // Stream status
        const toolEmojis = {
          web_search: "🔍", get_news: "📰", calculator: "🧮",
          run_code: "💻", manage_tasks: "📋", memory: "🧠",
          translate: "🌍", get_weather: "🌤️", search_products: "🛒",
          summarize_url: "🔗"
        }
        const emoji = toolEmojis[toolName] || "🔧"
        const statusMsg = `\n${emoji} **Searching: ${toolParams.query || toolParams.topic || toolName}...**\n\n`
        res.write(statusMsg)
        fullResponse += statusMsg

        // Execute tool
        const toolResult = await executeTool(toolName, toolParams, userId)
        console.log("Tool result:", JSON.stringify(toolResult).substring(0, 200))

        // Add to conversation
        currentMessages.push({ role: "assistant", content: agentResponse })
        currentMessages.push({
          role: "user",
          content: `Tool result for ${toolName}:\n${JSON.stringify(toolResult, null, 2)}\n\nNow give a clear, organized answer to the user's question using these results. Don't mention "tool results" — just answer naturally.`
        })

      } else {
        // Stream final response word by word for smooth UX
        const words = agentResponse.split(/(\s+)/)
        for (const word of words) {
          res.write(word)
          fullResponse += word
        }
        continueLoop = false
      }
    }

    // Save to chat
    chat.messages.push({ role: "assistant", content: fullResponse })

    // Auto-generate better title
    if (chat.messages.length <= 4) {
      try {
        const titleRes = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: `Generate a very short title (max 5 words, no quotes) for this question: "${cleanMessage}". Just the title.` }],
          max_tokens: 15, temperature: 0.5
        })
        const newTitle = titleRes.choices[0]?.message?.content?.trim()
        if (newTitle && !newTitle.startsWith("[")) chat.title = newTitle
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

// ── AGENT TASK & MEMORY ROUTES ────────────────────────────────────────────────
app.get("/agent/tasks", authMiddleware, async (req, res) => {
  try {
    const tasks = await Task.find({ userId: req.user.id }).sort({ createdAt: -1 })
    res.json(tasks)
  } catch(e) { res.status(500).json({ error: e.message }) }
})

app.post("/agent/tasks", authMiddleware, async (req, res) => {
  try {
    const task = await Task.create({ userId: req.user.id, ...req.body })
    res.json(task)
  } catch(e) { res.status(500).json({ error: e.message }) }
})

app.put("/agent/tasks/:id", authMiddleware, async (req, res) => {
  try {
    const task = await Task.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, req.body, { new: true })
    res.json(task)
  } catch(e) { res.status(500).json({ error: e.message }) }
})

app.delete("/agent/tasks/:id", authMiddleware, async (req, res) => {
  try {
    await Task.findOneAndDelete({ _id: req.params.id, userId: req.user.id })
    res.json({ success: true })
  } catch(e) { res.status(500).json({ error: e.message }) }
})

app.get("/agent/memory", authMiddleware, async (req, res) => {
  try {
    const memories = await AgentMemory.find({ userId: req.user.id }).sort({ updatedAt: -1 })
    res.json(memories)
  } catch(e) { res.status(500).json({ error: e.message }) }
})

app.delete("/agent/memory/:key", authMiddleware, async (req, res) => {
  try {
    await AgentMemory.findOneAndDelete({ userId: req.user.id, key: req.params.key })
    res.json({ success: true })
  } catch(e) { res.status(500).json({ error: e.message }) }
})

// ── UPDATED webSearch helper using fixed tavilySearch ─────────────────────────
async function webSearch(query) {
  try {
    const data = await tavilySearch(query, { depth: "basic", maxResults: 5 })
    if (!data || !data.results?.length) return null
    const answer = data.answer ? "Summary: " + data.answer + "\n\n" : ""
    const sources = data.results.slice(0, 4).map((r, i) =>
      (i + 1) + ". " + r.title + "\n" + (r.content || "").substring(0, 350) + "\nSource: " + r.url
    ).join("\n\n")
    return answer + sources
  } catch(e) { return null }
}

function isImageRequest(message) {
  if (!message) return false
  const msg = message.toLowerCase()
  const triggers = ["generate image","create image","make image","generate a image","create a image","generate an image","create an image","make an image","generate photo","create photo","generate picture","create picture","generate art","create art","make art","draw","paint","illustrate","sketch","image of","picture of","photo of","show me a image","show me an image","genrate","generat","dall-e","stable diffusion"]
  return triggers.some(t => msg.includes(t))
}

function getImagePrompt(message) {
  let prompt = message.trim()
  const removes = ["generate an image of","create an image of","make an image of","generate a image of","create a image of","make a image of","generate image of","create image of","make image of","generate an image","create an image","make an image","generate a image","create a image","make a image","generate image","create image","make image","generate a photo of","create a photo of","generate a photo","create a photo","generate photo","generate a picture of","create a picture of","generate a picture","create a picture","generate picture","generate art","create art","make art","draw me a","draw me an","draw me","draw a","draw an","draw","paint a","paint an","paint","illustrate a","illustrate an","illustrate","sketch of a","sketch of an","sketch of","sketch a","sketch an","sketch","image of a","image of an","image of","picture of a","picture of an","picture of","photo of a","photo of an","photo of","show me a image of","show me an image of","show me a image","show me an image","genrate an","genrate a","genrate","generat an","generat a","generat"]
  removes.sort((a, b) => b.length - a.length)
  removes.forEach(r => {
    prompt = prompt.replace(new RegExp("^" + r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "\\s*", "i"), "")
  })
  return prompt.trim() || message
}

function getSystemPrompt(language, hasSearch) {
  const now = new Date()
  const dateStr = now.toLocaleDateString("en-IN", { weekday:"long", year:"numeric", month:"long", day:"numeric" })
  const year = now.getFullYear()
  const langNote = language && language !== "English" ? ` Always respond in ${language}.` : ""
  const searchNote = hasSearch ? " Use the web search results provided to give accurate, up-to-date answers. Cite sources when available." : ""
  return `You are Datta AI — a powerful AI assistant. Today is ${dateStr}. Current year: ${year}.

RULES:
1. Always give COMPLETE answers
2. For coding: give FULL working code
3. For websites: give COMPLETE HTML+CSS+JS
4. NEVER say "I can't do that"
5. Format code in markdown code blocks
6. You know the current date is ${dateStr}${langNote}${searchNote}`
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
      const msgLower = message.trim().toLowerCase()
      let title = greetings.includes(msgLower) ? "New conversation" : message.trim().substring(0, 45)
      if (message.trim().length > 45) title += "..."
      chat = await Chat.create({ userId, title, messages: [] })
    }

    chat.messages.push({ role: "user", content: message || "[File: " + (file?.originalname || "unknown") + "]" })
    await chat.save()

    res.setHeader("x-chat-id", chat._id.toString())
    res.setHeader("Content-Type", "text/plain; charset=utf-8")

    // IMAGE GENERATION
    if (message && isImageRequest(message)) {
      const imagePrompt = getImagePrompt(message)
      let imageUrl = null
      const HF_KEY = process.env.HF_API_KEY
      if (HF_KEY) {
        try {
          const hfRes = await fetch("https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell", {
            method: "POST",
            headers: { "Authorization": "Bearer " + HF_KEY, "Content-Type": "application/json", "x-wait-for-model": "true" },
            body: JSON.stringify({ inputs: imagePrompt, parameters: { num_inference_steps: 4, width: 1024, height: 1024 } })
          })
          if (hfRes.ok) {
            const buf = await hfRes.arrayBuffer()
            imageUrl = "data:image/jpeg;base64," + Buffer.from(buf).toString("base64")
          }
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

    // WEB SEARCH — now uses fixed tavilySearch
    let searchContext = ""
    if (message && needsWebSearch(message) && process.env.TAVILY_API_KEY) {
      console.log("🔍 Web search triggered for:", message.substring(0, 60))
      const results = await webSearch(message)
      if (results) {
        searchContext = "\n\n[Real-time Web Search Results - " + new Date().toLocaleDateString() + "]\n" + results + "\n[End of Search Results]"
        console.log("✅ Search results obtained")
      }
    }

    const history = chat.messages.slice(0, -1).slice(-10).map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }))
    const isImageFile = file && file.mimetype?.startsWith("image/")
    let userContent

    if (isImageFile) {
      const base64 = file.buffer.toString("base64")
      userContent = [
        { type: "text", text: (message || "Analyze this image in detail.") + searchContext },
        { type: "image_url", image_url: { url: "data:" + file.mimetype + ";base64," + base64 } }
      ]
    } else if (file) {
      try { userContent = (message ? message + "\n\n" : "") + "[File: " + file.originalname + "]\n\n" + file.buffer.toString("utf-8") + searchContext }
      catch(e) { userContent = (message ? message + "\n\n" : "") + "[File: " + file.originalname + "]" + searchContext }
    } else {
      userContent = message + searchContext
    }

    const model = isImageFile ? "meta-llama/llama-4-scout-17b-16e-instruct" : "llama-3.3-70b-versatile"
    const msg = message.toLowerCase()
    const needsLong = msg.includes("website") || msg.includes("code") || msg.includes("full") || msg.includes("complete") || msg.includes("build") || msg.includes("create") || msg.includes("write") || msg.includes("html") || msg.includes("python") || msg.includes("program") || msg.includes("story") || msg.includes("article")
    const maxTokens = isImageFile ? 1024 : (needsLong ? 8000 : 1024)

    const stream = await groq.chat.completions.create({
      model,
      messages: [{ role: "system", content: getSystemPrompt(language, !!searchContext) }, ...history, { role: "user", content: userContent }],
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

    if (chat.messages.length === 4 || chat.title === "New conversation") {
      try {
        const titleRes = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: "Generate a very short title (max 5 words, no quotes) for: \"" + message + "\". Just the title." }],
          max_tokens: 15, temperature: 0.5
        })
        const newTitle = titleRes.choices?.[0]?.message?.content?.trim()
        if (newTitle && !newTitle.startsWith("[")) chat.title = newTitle
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

app.post("/auth/send-otp", async (req, res) => {
  try {
    const { phone } = req.body
    if (!phone) return res.status(400).json({ error: "Phone required" })
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    otpStore[phone] = { otp, expires: Date.now() + 5 * 60 * 1000 }
    console.log("OTP for " + phone + ": " + otp)
    res.json({ success: true })
  } catch(err) { res.status(500).json({ error: "Server error" }) }
})

const otpStore = {}

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
  } catch(err) { res.status(500).json({ error: err.message }) }
})

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
    } catch(err) { return done(err, null) }
  }))
}

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
    await Project.deleteMany({ userId: req.user.id })
    await AgentMemory.deleteMany({ userId: req.user.id })
    await Task.deleteMany({ userId: req.user.id })
    await User.findByIdAndDelete(req.user.id)
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
  } catch(err) { res.status(500).json({ error: err.message }) }
})

app.post("/payment/update-plan", authMiddleware, async (req, res) => {
  try {
    const { plan, period, paymentId } = req.body
    const months = period === "yearly" ? 12 : 1
    const endDate = new Date()
    endDate.setMonth(endDate.getMonth() + months)
    await Subscription.findOneAndUpdate(
      { userId: req.user.id },
      { plan, period, paymentId, startDate: new Date(), endDate, active: true },
      { upsert: true, new: true }
    )
    res.json({ success: true })
  } catch(err) { res.status(500).json({ error: err.message }) }
})

// ── IMAGE GENERATION ──────────────────────────────────────────────────────────
app.post("/generate-image", upload.none(), authMiddleware, async (req, res) => {
  try {
    const prompt = req.body.prompt
    if (!prompt) return res.status(400).json({ error: "No prompt" })
    const HF_KEY = process.env.HF_API_KEY
    if (!HF_KEY) {
      const seed = Math.floor(Math.random() * 999999)
      return res.json({ imageUrl: "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt) + "?width=1024&height=1024&nologo=true&model=flux-schnell&seed=" + seed, source: "pollinations" })
    }
    const response = await fetch("https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell", {
      method: "POST",
      headers: { "Authorization": "Bearer " + HF_KEY, "Content-Type": "application/json", "x-wait-for-model": "true" },
      body: JSON.stringify({ inputs: prompt, parameters: { num_inference_steps: 4, width: 1024, height: 1024 } })
    })
    if (!response.ok) {
      const seed = Math.floor(Math.random() * 999999)
      return res.json({ imageUrl: "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt) + "?width=1024&height=1024&nologo=true&model=flux-schnell&seed=" + seed, source: "pollinations_fallback" })
    }
    const arrayBuffer = await response.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString("base64")
    res.json({ imageUrl: "data:image/jpeg;base64," + base64, source: "huggingface" })
  } catch(err) {
    const seed = Math.floor(Math.random() * 999999)
    res.json({ imageUrl: "https://image.pollinations.ai/prompt/" + encodeURIComponent(req.body.prompt || "art") + "?width=1024&height=1024&nologo=true&model=flux-schnell&seed=" + seed, source: "pollinations_fallback" })
  }
})

// ── CHAT HISTORY ──────────────────────────────────────────────────────────────
app.get("/chats", authMiddleware, async (req, res) => {
  try {
    const chats = await Chat.find({ userId: req.user.id }).sort({ createdAt: -1 }).select("title createdAt")
    res.json(chats)
  } catch(err) { res.status(500).json({ error: err.message }) }
})

app.get("/chat/:id", authMiddleware, async (req, res) => {
  try {
    const chat = await Chat.findOne({ _id: req.params.id, userId: req.user.id })
    if (!chat) return res.json([])
    res.json(chat.messages)
  } catch(err) { res.status(500).json({ error: err.message }) }
})

app.delete("/chat/:id", authMiddleware, async (req, res) => {
  try {
    await Chat.findOneAndDelete({ _id: req.params.id, userId: req.user.id })
    res.json({ success: true })
  } catch(err) { res.status(500).json({ error: err.message }) }
})

app.delete("/chats/all", authMiddleware, async (req, res) => {
  try {
    await Chat.deleteMany({ userId: req.user.id })
    res.json({ success: true })
  } catch(err) { res.status(500).json({ error: err.message }) }
})

app.post("/chat/:id/rename", authMiddleware, async (req, res) => {
  try {
    await Chat.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, { title: req.body.title })
    res.json({ success: true })
  } catch(err) { res.status(500).json({ error: err.message }) }
})

// ── PROJECT ROUTES ────────────────────────────────────────────────────────────
app.get("/projects", authMiddleware, async (req, res) => {
  try {
    if (req.user.isGuest) return res.json([])
    const projects = await Project.find({ userId: req.user.id }).sort({ createdAt: -1 })
    res.json(projects)
  } catch(err) { res.status(500).json({ error: err.message }) }
})

app.post("/projects/save", authMiddleware, async (req, res) => {
  try {
    if (req.user.isGuest) return res.json({ success: true, skipped: true })
    const { projectId, name, color, createdAt, chats, files, artifacts } = req.body
    if (!projectId) return res.status(400).json({ error: "projectId required" })
    await Project.findOneAndUpdate(
      { userId: req.user.id, projectId },
      { userId: req.user.id, projectId, name: name || "Untitled Project", color: color || "#ffd700", createdAt: createdAt || Date.now(), chats: chats || [], files: files || [], artifacts: artifacts || [] },
      { upsert: true, new: true }
    )
    res.json({ success: true })
  } catch(err) { res.status(500).json({ error: err.message }) }
})

app.delete("/projects/:projectId", authMiddleware, async (req, res) => {
  try {
    if (req.user.isGuest) return res.json({ success: true, skipped: true })
    await Project.findOneAndDelete({ userId: req.user.id, projectId: req.params.projectId })
    res.json({ success: true })
  } catch(err) { res.status(500).json({ error: err.message }) }
})

// ── HEALTH ────────────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.json({ status: "✅ Datta AI Agent Server", version: "4.1-agent-fixed" }))
app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log("🚀 Datta AI Agent Server v4.1 running on port " + PORT))
