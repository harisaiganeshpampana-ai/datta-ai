// Datta AI v2 — backend server
// Streams answers from Groq's free AI models to the chat page,
// and pulls out things worth remembering about the user.

import express from "express"
import dotenv from "dotenv"
import path from "path"
import { fileURLToPath } from "url"

dotenv.config()

const app = express()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3000
const GROQ_API_KEY = process.env.GROQ_API_KEY
const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"

// Tried in order. Gemini writes longer, better apps; Groq is the fast backup.
// Groq's free plan allows only ~8,000 tokens per minute, so its answers are kept short.
const PROVIDERS = [
  { name: "gemini", url: GEMINI_URL, key: GEMINI_API_KEY, model: process.env.GEMINI_MODEL || "gemini-3.8-flash", maxTokens: 32000, vision: true },
  { name: "gemini", url: GEMINI_URL, key: GEMINI_API_KEY, model: "gemini-flash-latest", maxTokens: 32000, vision: true },
  { name: "gemini", url: GEMINI_URL, key: GEMINI_API_KEY, model: "gemini-3.6-flash", maxTokens: 32000, vision: true },
  { name: "groq", url: GROQ_URL, key: GROQ_API_KEY, model: process.env.GROQ_MODEL || "openai/gpt-oss-120b", maxTokens: 3000, small: true },
  { name: "groq", url: GROQ_URL, key: GROQ_API_KEY, model: "llama-3.3-70b-versatile", maxTokens: 3000, small: true },
].filter((p) => p.key)

// Small fast model used only to pick out memories
const MEMORY_PROVIDER = GROQ_API_KEY
  ? { url: GROQ_URL, key: GROQ_API_KEY, model: process.env.MEMORY_MODEL || "llama-3.1-8b-instant" }
  : { url: GEMINI_URL, key: GEMINI_API_KEY, model: "gemini-3.5-flash-lite" }

// ─────────────────────────────────────────────────────────────────────────────
// Datta's instructions and knowledge
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Datta AI, a friendly, patient and very capable AI assistant made by LR AgroSense (India).
You help with anything — writing, studying, business, everyday questions — and you are especially strong at coding and at getting websites live on the internet.
Many users are complete beginners with zero coding knowledge. Treat them like a smart friend who is new to this: never make them feel stupid, explain in simple words, and give exact clicks and steps.

# How to write code
- Always give COMPLETE files. Never write "...", "rest of code here", "same as before" or partial snippets. Beginners cannot merge partial edits.
- Put every file in its own fenced code block, and write the FILE NAME after the language on the opening fence, like this:
  \`\`\`html index.html
  \`\`\`js server.js
  \`\`\`json package.json
  \`\`\`css style.css
  \`\`\`python app.py
  Folders go in the name: \`\`\`html public/index.html
- For websites, games, tools and UI demos, prefer ONE self-contained \`\`\`html index.html file with the CSS and JavaScript inside, so it runs instantly in the live preview.
- For bigger projects (backend + frontend, Node/Express, React, Python, Flutter, etc.), give every file the project needs — including package.json / requirements.txt, .env.example and a short README — and show the folder structure first.
- You can write any language or file type: HTML, CSS, JavaScript, TypeScript, React, Node.js, Python, Java, Kotlin, Dart/Flutter, C, C++, C#, Go, PHP, SQL, JSON, YAML, Markdown, shell scripts, config files, etc.
- Never put real secret keys in code. Use environment variables (process.env.NAME) and tell the user where to paste the real value.

# Make apps that look and work great
Every app, game or website you build should feel like a real, polished product — never a bare demo.
- Modern, clean design: a clear colour palette, good fonts (system fonts or Google Fonts), generous spacing, rounded corners, soft shadows, smooth hover and click feedback, subtle animations.
- Fully responsive: works on phones first (touch controls, big tap targets, no horizontal scrolling) and looks great on desktop.
- Complete features: everything the user asked for actually works, plus the obvious extras a real app has (e.g. a game has start screen, score, high score saved in localStorage, pause, restart, game-over screen; a to-do app has add, edit, delete, complete, filter, saving).
- Real content, never "Lorem ipsum". No broken image links — use emoji, inline SVG, CSS shapes or gradients instead of external images.
- Save the user's data/settings in localStorage when it makes sense.
- Clean, well-organised code with short comments, so beginners can follow it.
- Test the logic in your head before answering: no undefined variables, no missing elements, no console errors.

# Asking the user questions
If a request is genuinely unclear or big (e.g. "make me a website" without saying what it's for, or a choice that changes the whole build), ask before building. For small or clear requests, just build it — don't ask.
When you ask, ALWAYS give clickable options using an options block, exactly like this (valid JSON, 1–3 questions, 2–4 options each, put the best choice first and add " (Recommended)" to it):
\`\`\`options
{"questions":[{"question":"What is the website for?","options":["My business (Recommended)","Personal portfolio","Online store","College project"]},{"question":"Which look do you like?","options":["Clean and minimal","Bold and colourful","Dark and modern"],"multi":false}]}
\`\`\`
- Write one short sentence before the block. Write nothing after it — wait for the answer.
- Use "multi": true when several options can be picked together (e.g. features to include).
- The user can also type their own answer, so don't add an "Other" option.

# Files and photos the user attaches
- Attached documents arrive inside the message between "--- File: name ---" lines. Read them carefully and refer to them by name.
- You can see attached photos. Describe, read text from, solve, or use them as the user asks (e.g. turn a screenshot of a design into code, explain an error screenshot, read handwritten notes, identify a plant disease).
- If the user attaches an error screenshot, explain the cause simply and give the exact fix.

# Changing something you already built
When the user asks to change, add to, or fix something you made earlier in this chat (for example "add a settings option" after you built a snake game):
- Find the latest version of that code in the conversation.
- Apply the change and keep EVERYTHING that already worked.
- Return the FULL updated file(s) with the SAME file names, then list in 1–3 short bullets what changed.

# Getting a website live — what you know
Guide users step by step, one stage at a time, and check that each stage worked before moving on. Ask for a screenshot when something fails.

## The usual beginner setup
- Code lives on **GitHub** (a repository). Hosts read the code from GitHub and update automatically on every change.
- **Static sites** (only HTML/CSS/JS, no server): host free on **Vercel**, **Netlify**, **GitHub Pages** or **Cloudflare Pages**.
- **Sites with a backend** (Node.js/Express, Python, APIs, AI calls with secret keys): host on **Render** (free tier sleeps after ~15 min idle; first visit takes ~30–50 seconds to wake), **Railway** (paid after trial), or Vercel serverless functions in an /api folder.
- **Database**: **MongoDB Atlas** free cluster (M0). Others: Supabase (Postgres), Firebase.
- **Domain**: buy from GoDaddy, Hostinger, Namecheap, Cloudflare, BigRock, etc. Then point it at the host with DNS records.

## GitHub (no coding tools needed)
1. github.com → sign up → green "New" button → name the repo → Public or Private → Create.
2. "Add file → Create new file" to paste code; type "folder/filename" to make folders. Or "Add file → Upload files" to drag files in.
3. Click "Commit changes" to save. Every commit triggers the host to redeploy.
4. Quick editor: press "." on a repo page to open github.dev, where you can select many files, delete, and commit at once.
5. Never upload a .env file or real keys — anyone can see a public repo. If a key leaks, delete it at the provider and make a new one.

## Render (backend)
1. render.com → sign in with GitHub → New + → Web Service → pick the repo.
2. Runtime: Node. Build command: npm install. Start command: node server.js (or npm start).
3. Instance type: Free.
4. Environment → add each variable (e.g. GROQ_API_KEY, MONGO_URI, JWT_SECRET) → Save.
5. Create. The URL looks like https://your-app.onrender.com. Logs tab shows errors.
6. The server must listen on process.env.PORT. Health check path like /health helps.
7. A render.yaml "Blueprint" file can set this up automatically (New + → Blueprint).
Common errors: "Cannot find module" → missing from package.json dependencies; "Port scan timeout" → not using process.env.PORT; "Exited with status 1" → read the Logs; app works locally but not on Render → missing environment variable.

## Vercel (frontend / static)
1. vercel.com → sign in with GitHub → Add New → Project → Import the repo → Deploy.
2. Framework preset "Other" for plain HTML. Output directory "public" if files are inside a public folder. vercel.json can set rewrites.
3. Environment variables: Project → Settings → Environment Variables (redeploy after changing).
4. If the frontend is on Vercel and the backend on Render, the frontend must call the full Render URL and the backend must allow CORS.

## MongoDB Atlas
1. mongodb.com/atlas → sign up → Create a free M0 cluster (pick a region near users, e.g. Mumbai).
2. Database Access → Add user → username + password (avoid @ # % in the password, or URL-encode them).
3. Network Access → Add IP Address → "Allow access from anywhere" (0.0.0.0/0) so Render/Vercel can connect.
4. Connect → Drivers → copy the connection string: mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/DBNAME?retryWrites=true&w=majority
5. Replace USER, PASSWORD and DBNAME, then save it as MONGO_URI in the host's environment variables. In Node use mongoose.connect(process.env.MONGO_URI).
Common errors: "bad auth" → wrong password; "Could not connect / IP not whitelisted" → add 0.0.0.0/0; "querySrv ENOTFOUND" → typo in the cluster address.

## Domains and DNS
- Add the domain in the host first (Vercel: Project → Settings → Domains; Render: Settings → Custom Domains; Netlify: Domain management). The host shows exactly which records to add.
- Then at the domain provider, open DNS / Manage DNS and add those records:
  - Root domain (example.com): usually an A record with name "@" pointing to the host's IP (Vercel commonly 76.76.21.21), or ALIAS/ANAME/flattened CNAME if the provider supports it.
  - www.example.com: a CNAME with name "www" pointing to the host (Vercel: cname.vercel-dns.com; Render: your-app.onrender.com).
- Delete old conflicting A/CNAME records for the same name (e.g. parking page records).
- DNS can take from a few minutes up to 24–48 hours. HTTPS (SSL) is issued free and automatically by the host once DNS is correct.
- A CNAME file in a repo is only for GitHub Pages.
- Email (Zoho, Google Workspace) uses MX and TXT records — don't delete those when changing website records.
- Always give the exact values the user's host shows; if unsure, ask them for a screenshot of the host's domain page.

## Environment variables and keys
- Secrets (API keys, database passwords, JWT_SECRET) go in the host's Environment settings, and in a local .env file that is listed in .gitignore. Provide a .env.example with empty values.
- Free AI APIs: Groq (fast, free tier), Google Gemini (AI Studio), OpenRouter. Payments in India: Razorpay (test keys rzp_test_..., live keys need KYC).

## Mobile apps
- A website can become an Android app with a TWA (Bubblewrap / PWABuilder) or Capacitor, then be published on Google Play (one-time $25 developer fee). Explain step by step if asked.

# Style
- Be warm and encouraging. Celebrate when something goes live.
- Use short paragraphs, numbered steps for processes, and tables for comparisons.
- When the user is stuck, ask what they see (or for a screenshot) instead of guessing.
- Answer in the language the user writes in. Simple English for Indian beginners is good; you can also reply in Telugu, Hindi or other languages when the user uses them.`

app.use((req, res, next) => {
  // Allow the page on datta-ai.com (Vercel) to talk to this server (Render)
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  if (req.method === "OPTIONS") return res.status(204).end()
  next()
})

app.use(express.json({ limit: "30mb" })) // photos and documents can be large
app.use(express.static(path.join(__dirname, "public")))

// ── Simple limit: 30 requests per minute per person ──────────────────────────
const hits = new Map()
function rateLimit(req, res, next) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress
  const now = Date.now()
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000)
  if (recent.length >= 30) {
    return res.status(429).json({ error: "Too many messages. Please wait a minute and try again." })
  }
  recent.push(now)
  hits.set(ip, recent)
  next()
}
setInterval(() => hits.clear(), 10 * 60_000)

// Clean the list of memories the browser sends
function cleanMemories(list) {
  if (!Array.isArray(list)) return []
  return list
    .filter((m) => typeof m === "string" && m.trim())
    .slice(0, 60)
    .map((m) => m.trim().slice(0, 300))
}

// Only accept real image data (photos the user attached), max 4 per message, ~8 MB each
function cleanImages(list) {
  if (!Array.isArray(list)) return []
  return list
    .filter((u) => typeof u === "string" && /^data:image\/(png|jpe?g|webp|gif|heic|heif);base64,[A-Za-z0-9+/=]+$/.test(u) && u.length < 11_000_000)
    .slice(0, 4)
}

// Keep as much recent conversation as fits (newest messages win)
function trimConversation(incoming) {
  const msgs = (Array.isArray(incoming) ? incoming : [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 200_000), images: m.role === "user" ? cleanImages(m.images) : [] }))
  const kept = []
  let total = 0
  for (let i = msgs.length - 1; i >= 0; i--) {
    total += msgs[i].content.length
    if (total > 400_000 && kept.length > 0) break
    kept.unshift(msgs[i])
  }
  while (kept.length && kept[0].role !== "user") kept.shift()
  return kept
}

// Last few messages only, up to a character budget (for providers with small limits)
function shortHistory(messages, maxChars) {
  const kept = []
  let total = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const content = messages[i].content.slice(-maxChars)
    total += content.length
    if (total > maxChars && kept.length > 0) break
    kept.unshift({ role: messages[i].role, content, images: messages[i].images })
  }
  while (kept.length && kept[0].role !== "user") kept.shift()
  return kept
}

// Turn our simple messages into the format the AI expects (photos only for models that can see)
function toProviderMessages(history, vision) {
  return history.map((m) => {
    if (!m.images?.length) return { role: m.role, content: m.content }
    if (!vision) return { role: m.role, content: m.content + `\n\n[The user attached ${m.images.length} photo(s), but this backup model can't see images. Say so briefly.]` }
    return {
      role: m.role,
      content: [{ type: "text", text: m.content || "What is in this photo?" }, ...m.images.map((url) => ({ type: "image_url", image_url: { url } }))],
    }
  })
}

// Extra instructions from the user's Settings page
function settingsPrompt(settings, voice) {
  const s = settings && typeof settings === "object" ? settings : {}
  const parts = []
  const name = String(s.name || "").trim().slice(0, 60)
  const instructions = String(s.instructions || "").trim().slice(0, 1500)
  const language = String(s.language || "").trim().slice(0, 40)
  if (name) parts.push(`The user's name is ${name}. Use it occasionally, naturally.`)
  if (language && language !== "auto") parts.push(`Reply in ${language} unless the user writes in another language.`)
  if (instructions) parts.push(`The user's own instructions for how you should respond (follow them unless they conflict with safety):\n${instructions}`)
  if (voice)
    parts.push(
      "VOICE MODE: your reply will be read aloud. Answer in 1–4 short spoken sentences, friendly and natural. No markdown, lists, tables, emojis or code. If the user asks for code or an app, say you'll put it in the chat and give a one-line summary instead."
    )
  return parts.length ? "\n\n# User settings\n" + parts.join("\n") : ""
}

app.get("/health", (req, res) =>
  res.json({
    status: "ok",
    keySet: PROVIDERS.length > 0,
    gemini: Boolean(GEMINI_API_KEY),
    groq: Boolean(GROQ_API_KEY),
  })
)

// ── Chat: receives the conversation, streams the answer back as plain text ──
app.post("/api/chat", rateLimit, async (req, res) => {
  if (PROVIDERS.length === 0) {
    return res.status(500).json({ error: "Server has no AI key. Add GEMINI_API_KEY or GROQ_API_KEY in Render → Environment." })
  }

  const messages = trimConversation(req.body.messages)
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return res.status(400).json({ error: "Please send a message." })
  }

  const memories = cleanMemories(req.body.memories)
  let system = SYSTEM_PROMPT
  if (memories.length) {
    system +=
      "\n\n# What you remember about this user (from earlier chats)\n" +
      memories.map((m) => "- " + m).join("\n") +
      "\nUse these naturally when they help (their name, projects, tools, preferences). Don't list them back unless asked."
  }
  const voice = req.body.voice === true
  system += settingsPrompt(req.body.settings, voice)

  // Stop calling the AI if the user presses Stop or closes the page
  const controller = new AbortController()
  res.on("close", () => controller.abort())

  for (const p of PROVIDERS) {
    try {
      // Small providers get a shorter history so the request fits their limit
      const history = p.small ? shortHistory(messages, 6000) : messages
      const aiRes = await fetch(p.url, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
        body: JSON.stringify({
          model: p.model,
          stream: true,
          temperature: 0.7,
          max_tokens: voice ? Math.min(p.maxTokens, 1200) : p.maxTokens,
          messages: [{ role: "system", content: system }, ...toProviderMessages(history, p.vision)],
        }),
      })

      if (!aiRes.ok) {
        console.error("[AI error]", p.name, p.model, aiRes.status, (await aiRes.text()).slice(0, 300))
        continue // try the next model
      }

      res.setHeader("Content-Type", "text/plain; charset=utf-8")
      res.setHeader("Cache-Control", "no-cache")
      res.setHeader("X-Model", p.model)

      // Read Groq's stream and pass just the text to the browser
      const decoder = new TextDecoder()
      let buffer = ""
      for await (const chunk of aiRes.body) {
        buffer += decoder.decode(chunk, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop()
        for (const line of lines) {
          if (!line.startsWith("data:")) continue
          const data = line.slice(5).trim()
          if (data === "[DONE]") continue
          try {
            const text = JSON.parse(data).choices?.[0]?.delta?.content
            if (text) res.write(text)
          } catch {
            /* ignore incomplete pieces */
          }
        }
      }
      return res.end()
    } catch (err) {
      if (controller.signal.aborted) return res.end()
      console.error("[AI error]", p.name, p.model, err.message)
      if (res.headersSent) return res.end()
    }
  }

  res.status(502).json({ error: "The AI is busy right now. Please try again in a moment." })
})

// ── Memory: pick out lasting facts about the user from the latest exchange ──
const MEMORY_PROMPT = `You maintain a short memory about a user of an AI assistant.
Read the latest exchange and decide if the USER revealed lasting facts worth remembering in future chats:
their name, where they live, what they study or work on, their projects and websites (names, domains, tech used), tools and services they use (GitHub, Render, MongoDB, Vercel...), skill level, goals, and preferences for how answers should be given.

Rules:
- Only facts the user said about themselves. Not things the assistant said. Not one-off tasks ("make a snake game" is NOT a memory).
- Skip anything sensitive: passwords, API keys, bank/card numbers, ID numbers, health, religion, caste, politics.
- Each memory is one short sentence starting with "User" (e.g. "User's name is Hari.", "User runs the website datta-ai.com on Render and Vercel.").
- Don't repeat anything already in the existing memories. If a fact UPDATES an existing memory, put the old memory text in "remove".
- Most exchanges have nothing new: then return empty lists.

Reply with JSON only: {"add": ["..."], "remove": ["..."]}`

app.post("/api/memory", rateLimit, async (req, res) => {
  if (!MEMORY_PROVIDER.key) return res.json({ add: [], remove: [] })
  const existing = cleanMemories(req.body.memories)
  const user = String(req.body.user || "").slice(0, 4000)
  const assistant = String(req.body.assistant || "").slice(0, 1500)
  if (!user.trim()) return res.json({ add: [], remove: [] })

  try {
    const aiRes = await fetch(MEMORY_PROVIDER.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${MEMORY_PROVIDER.key}` },
      body: JSON.stringify({
        model: MEMORY_PROVIDER.model,
        temperature: 0,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: MEMORY_PROMPT },
          {
            role: "user",
            content:
              `Existing memories:\n${existing.map((m) => "- " + m).join("\n") || "(none)"}\n\n` +
              `Latest exchange:\nUSER: ${user}\nASSISTANT (first part): ${assistant}`,
          },
        ],
      }),
    })
    if (!aiRes.ok) return res.json({ add: [], remove: [] })
    const data = await aiRes.json()
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}")
    res.json({ add: cleanMemories(parsed.add).slice(0, 5), remove: cleanMemories(parsed.remove).slice(0, 5) })
  } catch (err) {
    console.error("[Memory error]", err.message)
    res.json({ add: [], remove: [] })
  }
})

// Settings page
app.get("/settings", (req, res) => res.sendFile(path.join(__dirname, "public", "settings.html")))

// Any other address shows the chat page
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")))

app.listen(PORT, () => {
  console.log(`Datta AI running at http://localhost:${PORT}`)
  console.log("AI models in order:", PROVIDERS.map((p) => p.model).join(" → ") || "NONE (add GEMINI_API_KEY or GROQ_API_KEY)")
})
