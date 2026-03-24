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

// ── AGENT MEMORY SCHEMA ───────────────────────────────────────────────────────
const AgentMemorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  key: String,
  value: mongoose.Schema.Types.Mixed,
  category: { type: String, default: "general" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})
const AgentMemory = mongoose.model("AgentMemory", AgentMemorySchema)

// ── TASK SCHEMA ───────────────────────────────────────────────────────────────
const TaskSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  title: String,
  description: String,
  status: { type: String, default: "pending" }, // pending, in-progress, done
  priority: { type: String, default: "medium" }, // low, medium, high
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
// AGENT TOOLS
// ══════════════════════════════════════════════════════════════════════════════

// Tool 1: Web Search
async function toolWebSearch(query) {
  try {
    const key = process.env.TAVILY_API_KEY
    if (!key) return { error: "Search not configured" }
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({ query, search_depth: "basic", max_results: 5, include_answer: true })
    })
    if (!response.ok) return { error: "Search failed" }
    const data = await response.json()
    return {
      answer: data.answer || "",
      results: data.results?.slice(0, 5).map(r => ({
        title: r.title,
        content: r.content?.substring(0, 400),
        url: r.url
      })) || []
    }
  } catch (e) {
    return { error: e.message }
  }
}

// Tool 2: Get News
async function toolGetNews(topic) {
  try {
    const key = process.env.TAVILY_API_KEY
    if (!key) return { error: "News not configured" }
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({ query: topic + " latest news today", search_depth: "basic", max_results: 5, topic: "news" })
    })
    const data = await response.json()
    return {
      news: data.results?.slice(0, 5).map(r => ({
        title: r.title,
        summary: r.content?.substring(0, 300),
        url: r.url,
        published: r.published_date
      })) || []
    }
  } catch (e) {
    return { error: e.message }
  }
}

// Tool 3: Calculator
function toolCalculator(expression) {
  try {
    // Safe math evaluation
    const sanitized = expression.replace(/[^0-9+\-*/.()%^√\s]/g, "")
    const result = Function('"use strict"; return (' + sanitized + ')')()
    return { expression, result, formatted: result.toLocaleString() }
  } catch (e) {
    return { error: "Invalid expression: " + expression }
  }
}

// Tool 4: Code Runner (JavaScript)
function toolRunCode(code) {
  try {
    const logs = []
    const mockConsole = { log: (...args) => logs.push(args.join(" ")), error: (...args) => logs.push("ERROR: " + args.join(" ")), warn: (...args) => logs.push("WARN: " + args.join(" ")) }
    const fn = new Function("console", code)
    const result = fn(mockConsole)
    return { output: logs.join("\n"), result: result !== undefined ? String(result) : null, success: true }
  } catch (e) {
    return { error: e.message, success: false }
  }
}

// Tool 5: Manage Tasks
async function toolManageTasks(action, userId, data) {
  try {
    if (action === "create") {
      const task = await Task.create({ userId, title: data.title, description: data.description, priority: data.priority || "medium", dueDate: data.dueDate ? new Date(data.dueDate) : null, tags: data.tags || [] })
      return { success: true, task: { id: task._id, title: task.title, priority: task.priority } }
    }
    if (action === "list") {
      const tasks = await Task.find({ userId, status: { $ne: "done" } }).sort({ createdAt: -1 }).limit(10)
      return { tasks: tasks.map(t => ({ id: t._id, title: t.title, status: t.status, priority: t.priority, dueDate: t.dueDate })) }
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
  } catch (e) {
    return { error: e.message }
  }
}

// Tool 6: Memory (remember/recall user info)
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
  } catch (e) {
    return { error: e.message }
  }
}

// Tool 7: Translate
async function toolTranslate(text, targetLang) {
  try {
    const result = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: `Translate this text to ${targetLang}. Return ONLY the translation, nothing else:\n\n${text}` }],
      max_tokens: 500,
      temperature: 0.3
    })
    return { original: text, translated: result.choices[0]?.message?.content?.trim(), language: targetLang }
  } catch (e) {
    return { error: e.message }
  }
}

// Tool 8: Weather
async function toolGetWeather(location) {
  try {
    const key = process.env.TAVILY_API_KEY
    if (!key) return { error: "Weather search not configured" }
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({ query: "weather in " + location + " today temperature", search_depth: "basic", max_results: 3 })
    })
    const data = await response.json()
    return { location, weather: data.answer || data.results?.[0]?.content?.substring(0, 300) || "Weather data not available" }
  } catch (e) {
    return { error: e.message }
  }
}

// Tool 9: Product Search
async function toolSearchProducts(query, maxPrice) {
  try {
    const key = process.env.TAVILY_API_KEY
    if (!key) return { error: "Search not configured" }
    const searchQuery = query + (maxPrice ? " under " + maxPrice : "") + " price India buy"
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({ query: searchQuery, search_depth: "basic", max_results: 5 })
    })
    const data = await response.json()
    return {
      query,
      products: data.results?.slice(0, 5).map(r => ({
        title: r.title,
        info: r.content?.substring(0, 250),
        url: r.url
      })) || []
    }
  } catch (e) {
    return { error: e.message }
  }
}

// Tool 10: Summarize URL
async function toolSummarizeUrl(url) {
  try {
    const key = process.env.TAVILY_API_KEY
    if (!key) return { error: "Not configured" }
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({ query: url, search_depth: "advanced", max_results: 1, include_raw_content: true })
    })
    const data = await response.json()
    const content = data.results?.[0]?.raw_content || data.results?.[0]?.content || ""
    if (!content) return { error: "Could not fetch URL" }

    const summary = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: "Summarize this content in 3-5 bullet points:\n\n" + content.substring(0, 3000) }],
      max_tokens: 400,
      temperature: 0.5
    })
    return { url, summary: summary.choices[0]?.message?.content?.trim() }
  } catch (e) {
    return { error: e.message }
  }
}

// ── TOOL EXECUTOR ─────────────────────────────────────────────────────────────
async function executeTool(toolName, params, userId) {
  console.log("🔧 Executing tool:", toolName, params)
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
const AGENT_SYSTEM_PROMPT = `You are Datta AI Agent — a powerful autonomous AI agent. You can use tools to complete tasks.

AVAILABLE TOOLS:
1. web_search(query) — Search the web for real-time information
2. get_news(topic) — Get latest news on any topic
3. calculator(expression) — Perform mathematical calculations
4. run_code(code) — Execute JavaScript code
5. manage_tasks(action, title, description, priority, dueDate) — Create/list/complete tasks (actions: create/list/complete/delete)
6. memory(action, key, value, category) — Save/recall information (actions: save/recall/list/delete)
7. translate(text, target_language) — Translate text to any language
8. get_weather(location) — Get weather for any location
9. search_products(query, max_price) — Search for products and prices
10. summarize_url(url) — Summarize any webpage

RULES:
- Think step by step before acting
- Use tools when you need real-time info, calculations, or actions
- After each tool result, decide if you need more tools or can answer
- Always explain what you're doing at each step
- Be concise but complete
- Maximum 5 tool calls per request

TO USE A TOOL, respond with this EXACT format:
TOOL_CALL:{"tool":"tool_name","params":{"param1":"value1"}}

After getting tool results, continue your response normally.
When done with all tool calls, provide the final answer.`

// ── AGENT ROUTE ───────────────────────────────────────────────────────────────
app.post("/agent", upload.none(), authMiddleware, async (req, res) => {
  try {
    const { message, chatId, language } = req.body
    const userId = req.user.id

    if (!message) return res.status(400).json({ error: "No message" })

    // Set streaming headers
    res.setHeader("Content-Type", "text/plain; charset=utf-8")
    res.setHeader("x-agent-mode", "true")

    // Load or create chat
    let chat = null
    if (chatId && chatId !== "null") {
      try { chat = await Chat.findOne({ _id: chatId, userId }) } catch(e) {}
    }
    if (!chat) {
      chat = await Chat.create({ userId, title: message.substring(0, 45), messages: [] })
    }

    chat.messages.push({ role: "user", content: message })
    await chat.save()

    res.setHeader("x-chat-id", chat._id.toString())

    // Load agent memories for context
    const memories = await AgentMemory.find({ userId }).sort({ updatedAt: -1 }).limit(10)
    const memContext = memories.length > 0
      ? "\n\nUSER MEMORIES:\n" + memories.map(m => `${m.key}: ${JSON.stringify(m.value)}`).join("\n")
      : ""

    const history = chat.messages.slice(0, -1).slice(-8).map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content
    }))

    let fullResponse = ""
    let toolCallCount = 0
    const MAX_TOOLS = 5

    // Agent loop
    let continueLoop = true
    let currentMessages = [
      { role: "system", content: AGENT_SYSTEM_PROMPT + memContext },
      ...history,
      { role: "user", content: message }
    ]

    while (continueLoop && toolCallCount < MAX_TOOLS) {
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: currentMessages,
        max_tokens: 2000,
        temperature: 0.7,
        stream: false
      })

      const agentResponse = completion.choices[0]?.message?.content || ""

      // Check if there's a tool call
      const toolCallMatch = agentResponse.match(/TOOL_CALL:(\{[^}]+\}|\{[\s\S]*?\})/m)

      if (toolCallMatch) {
        toolCallCount++

        // Stream the text before the tool call
        const beforeTool = agentResponse.substring(0, agentResponse.indexOf("TOOL_CALL:")).trim()
        if (beforeTool) {
          res.write(beforeTool + "\n\n")
          fullResponse += beforeTool + "\n\n"
        }

        // Parse and execute tool
        let toolData
        try { toolData = JSON.parse(toolCallMatch[1]) }
        catch(e) { res.write("⚠️ Tool call error\n\n"); break }

        const toolName = toolData.tool
        const toolParams = toolData.params || {}

        // Stream tool execution status
        const toolEmojis = { web_search: "🔍", get_news: "📰", calculator: "🧮", run_code: "💻", manage_tasks: "📅", memory: "🧠", translate: "🌍", get_weather: "🌤️", search_products: "🛒", summarize_url: "🔗" }
        const toolEmoji = toolEmojis[toolName] || "🔧"
        const toolStatus = `\n${toolEmoji} **Using ${toolName.replace(/_/g," ")}...**\n`
        res.write(toolStatus)
        fullResponse += toolStatus

        // Execute the tool
        const toolResult = await executeTool(toolName, toolParams, userId)
        const resultStr = JSON.stringify(toolResult, null, 2)

        // Add to conversation for next iteration
        currentMessages.push({ role: "assistant", content: agentResponse })
        currentMessages.push({ role: "user", content: `Tool result for ${toolName}:\n${resultStr}\n\nContinue your response.` })

      } else {
        // No more tool calls — stream final response
        const chunks = agentResponse.match(/.{1,50}/g) || [agentResponse]
        for (const chunk of chunks) {
          res.write(chunk)
          fullResponse += chunk
        }
        continueLoop = false
      }
    }

    // Save to chat
    chat.messages.push({ role: "assistant", content: fullResponse })
    await chat.save()

    res.write("\nCHATID" + chat._id)
    res.end()

  } catch (err) {
    console.error("❌ Agent error:", err.message)
    if (!res.headersSent) res.status(500).json({ error: err.message })
    else { res.write("\n⚠️ Agent error: " + err.message); res.end() }
  }
})

// ── AGENT TASKS ROUTES ────────────────────────────────────────────────────────
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

// ── AGENT MEMORY ROUTES ───────────────────────────────────────────────────────
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

// ── WEB SEARCH HELPER ─────────────────────────────────────────────────────────
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
    return null
  }
}

function needsWebSearch(message) {
  if (!message) return false
  const msg = message.toLowerCase()
  const triggers = ["latest","recent","today","yesterday","this week","current","now","live","breaking","news","who is","what is the","price of","weather","score","2025","2026","happened","update","trending","stock","crypto","bitcoin","ipl","cricket","match","movie","released","launched","election","president","prime minister","gold","petrol","diesel","result","exam","rate"]
  return triggers.some(t => msg.includes(t))
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
  const langNote = language && language !== "English" ? ` Always respond in ${language}.` : ""
  const searchNote = hasSearch ? " Use the web search results provided to give accurate, up-to-date answers. Always cite sources." : ""
  return `You are Datta AI — a powerful, all-rounder AI assistant like Claude or ChatGPT. You can do ANYTHING.

CORE RULES:
1. ALWAYS give COMPLETE answers — never cut off code or explanations
2. For coding requests: give FULL working code, every line, nothing missing
3. For website requests: give COMPLETE HTML + CSS + JS in one file
4. NEVER say "I can't do that" — always find a way to help
5. Format code in proper markdown code blocks
6. Be smart, helpful and thorough${langNote}${searchNote}`
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
  } catch (err) { res.status(500).json({ error: err.message }) }
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
    await Project.deleteMany({ userId: req.user.id })
    await AgentMemory.deleteMany({ userId: req.user.id })
    await Task.deleteMany({ userId: req.user.id })
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

// ── IMAGE GENERATION ──────────────────────────────────────────────────────────
app.post("/generate-image", upload.none(), authMiddleware, async (req, res) => {
  try {
    const prompt = req.body.prompt
    if (!prompt) return res.status(400).json({ error: "No prompt provided" })
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
  } catch (err) {
    const seed = Math.floor(Math.random() * 999999)
    res.json({ imageUrl: "https://image.pollinations.ai/prompt/" + encodeURIComponent(req.body.prompt || "art") + "?width=1024&height=1024&nologo=true&model=flux-schnell&seed=" + seed, source: "pollinations_fallback" })
  }
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
      try { chat = await Chat.findOne({ _id: chatId, userId }) } catch (e) { chat = null }
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
      const base64 = file.buffer.toString("base64")
      userContent = [
        { type: "text", text: (message || "Analyze this image in detail.") + searchContext },
        { type: "image_url", image_url: { url: "data:" + file.mimetype + ";base64," + base64 } }
      ]
    } else if (file) {
      try { userContent = (message ? message + "\n\n" : "") + "[File: " + file.originalname + "]\n\n" + file.buffer.toString("utf-8") + searchContext }
      catch (e) { userContent = (message ? message + "\n\n" : "") + "[File: " + file.originalname + "]" + searchContext }
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

// ── PROJECT ROUTES ────────────────────────────────────────────────────────────
app.get("/projects", authMiddleware, async (req, res) => {
  try {
    if (req.user.isGuest) return res.json([])
    const projects = await Project.find({ userId: req.user.id }).sort({ createdAt: -1 })
    res.json(projects)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post("/projects/save", authMiddleware, async (req, res) => {
  try {
    if (req.user.isGuest) return res.json({ success: true, skipped: true })
    const { projectId, name, color, createdAt, chats, files, artifacts } = req.body
    if (!projectId) return res.status(400).json({ error: "projectId is required" })
    await Project.findOneAndUpdate(
      { userId: req.user.id, projectId },
      { userId: req.user.id, projectId, name: name || "Untitled Project", color: color || "#ffd700", createdAt: createdAt || Date.now(), chats: chats || [], files: files || [], artifacts: artifacts || [] },
      { upsert: true, new: true }
    )
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete("/projects/:projectId", authMiddleware, async (req, res) => {
  try {
    if (req.user.isGuest) return res.json({ success: true, skipped: true })
    await Project.findOneAndDelete({ userId: req.user.id, projectId: req.params.projectId })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── HEALTH CHECK ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.json({ status: "✅ Datta AI Agent Server Running", version: "4.0-agent" }))
app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log("🚀 Datta AI Agent Server running on port " + PORT))
