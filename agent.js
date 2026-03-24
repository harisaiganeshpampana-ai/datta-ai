/*
 ═══════════════════════════════════════════════════
  DATTA AI AGENT — Frontend Integration
  v4.0 · Full AI Agent with 10 Tools
 ═══════════════════════════════════════════════════
*/

// Agent mode toggle
let agentModeEnabled = localStorage.getItem('datta_agent_mode') === 'true'

// Agent trigger keywords — if message contains these, use agent
const AGENT_TRIGGERS = [
  'search for', 'find me', 'look up', 'research',
  'calculate', 'compute', 'what is', 'how much',
  'translate', 'weather in', 'remind me', 'add task',
  'create task', 'my tasks', 'remember that', 'recall',
  'summarize', 'analyze', 'compare', 'buy', 'price of',
  'latest news', 'news about', 'run this code', 'execute',
  'what time', 'schedule', 'plan', 'step by step'
]

function shouldUseAgent(message) {
  if (agentModeEnabled) return true
  const lower = message.toLowerCase()
  return AGENT_TRIGGERS.some(t => lower.includes(t))
}

// ── AGENT CALL ────────────────────────────────────────────────────────────────
async function callAgent(message, chatId, onChunk, onDone) {
  const formData = new FormData()
  formData.append('message', message)
  formData.append('chatId', chatId || '')
  formData.append('token', localStorage.getItem('datta_token') || '')
  formData.append('language', localStorage.getItem('datta_language') || 'English')

  try {
    const res = await fetch('https://datta-ai-server.onrender.com/agent', {
      method: 'POST',
      body: formData
    })

    const newChatId = res.headers.get('x-chat-id')
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let fullText = ''
    let finalChatId = newChatId

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value)

      if (chunk.includes('CHATID')) {
        const parts = chunk.split('CHATID')
        fullText += parts[0]
        finalChatId = parts[1]?.trim()
        if (parts[0]) onChunk(parts[0])
      } else {
        fullText += chunk
        onChunk(chunk)
      }
    }

    onDone(fullText, finalChatId)
  } catch (err) {
    onChunk('\n⚠️ Agent error: ' + err.message)
    onDone('', chatId)
  }
}

// ── AGENT UI HELPERS ──────────────────────────────────────────────────────────
function createAgentMessageDiv(emoji) {
  const div = document.createElement('div')
  div.className = 'messageRow'
  div.innerHTML = `
    <div class="avatar" style="background:linear-gradient(135deg,var(--accent),#ff8c00);color:#000;font-size:16px;">🤖</div>
    <div class="aiContent">
      <div class="aiBubble agent-response">
        <div class="agent-thinking">
          <div class="agent-think-dot"></div>
          <div class="agent-think-dot"></div>
          <div class="agent-think-dot"></div>
          <span style="font-family:'Rajdhani',sans-serif;font-size:12px;color:var(--accent);letter-spacing:1px;margin-left:6px;">AGENT THINKING...</span>
        </div>
        <span class="stream"></span>
      </div>
      <div class="aiActions" style="opacity:0;margin-top:4px;">
        <button class="actionBtn" title="Copy" onclick="copyText(this)"><i data-lucide="copy"></i></button>
        <button class="actionBtn" title="Speak" onclick="speakText(this)"><i data-lucide="volume-2"></i></button>
      </div>
    </div>
  `
  return div
}

// ── AGENT MODE TOGGLE ─────────────────────────────────────────────────────────
function toggleAgentMode() {
  agentModeEnabled = !agentModeEnabled
  localStorage.setItem('datta_agent_mode', agentModeEnabled)
  updateAgentModeUI()

  // Show toast
  const msg = agentModeEnabled
    ? '🤖 Agent Mode ON — I will use tools automatically!'
    : '💬 Chat Mode — Normal conversation'
  showAgentToast(msg, agentModeEnabled ? 'var(--accent)' : '#888')
}

function updateAgentModeUI() {
  const btn = document.getElementById('agentModeBtn')
  const indicator = document.getElementById('agentModeIndicator')

  if (btn) {
    btn.style.color = agentModeEnabled ? 'var(--accent)' : '#443300'
    btn.style.background = agentModeEnabled ? 'rgba(255,215,0,0.1)' : 'none'
    btn.style.borderColor = agentModeEnabled ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.06)'
    btn.title = agentModeEnabled ? 'Agent Mode ON (click to disable)' : 'Enable Agent Mode'
  }

  if (indicator) {
    indicator.style.display = agentModeEnabled ? 'flex' : 'none'
  }
}

function showAgentToast(message, color = 'var(--accent)') {
  let toast = document.getElementById('agentToast')
  if (!toast) {
    toast = document.createElement('div')
    toast.id = 'agentToast'
    toast.style.cssText = `
      position:fixed;bottom:90px;left:50%;transform:translateX(-50%);
      background:#0f0e00;border-radius:50px;padding:10px 20px;
      font-family:'Rajdhani',sans-serif;font-size:13px;letter-spacing:1px;
      z-index:9999;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,0.5);
      transition:opacity 0.3s;pointer-events:none;
    `
    document.body.appendChild(toast)
  }
  toast.style.color = color
  toast.style.border = `1px solid ${color}44`
  toast.textContent = message
  toast.style.opacity = '1'
  setTimeout(() => { toast.style.opacity = '0' }, 3000)
}

// ── AGENT TASKS UI ────────────────────────────────────────────────────────────
async function loadAgentTasks() {
  try {
    const res = await fetch('https://datta-ai-server.onrender.com/agent/tasks?token=' + localStorage.getItem('datta_token'))
    const tasks = await res.json()
    return tasks
  } catch(e) {
    return []
  }
}

async function showTasksPanel() {
  const tasks = await loadAgentTasks()
  const panel = document.getElementById('agentTasksPanel')
  if (!panel) return

  panel.innerHTML = `
    <div style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:3px;color:var(--accent);margin-bottom:14px;">📅 MY TASKS</div>
    ${tasks.length === 0 ? '<div style="color:#443300;font-size:13px;text-align:center;padding:20px;">No tasks yet. Ask me to create one!</div>' :
      tasks.map(t => `
        <div style="background:#111000;border:1px solid rgba(255,215,0,0.1);border-radius:12px;padding:12px;margin-bottom:8px;display:flex;align-items:center;gap:10px;">
          <div style="width:8px;height:8px;border-radius:50%;background:${t.priority==='high'?'#ff4444':t.priority==='medium'?'var(--accent)':'#00ff88'};flex-shrink:0;"></div>
          <div style="flex:1;">
            <div style="font-family:'Rajdhani',sans-serif;font-size:14px;font-weight:700;color:#fff8e7;">${t.title}</div>
            ${t.description ? `<div style="font-size:12px;color:#554400;margin-top:2px;">${t.description}</div>` : ''}
          </div>
          <button onclick="completeTask('${t._id}')" style="background:none;border:1px solid rgba(0,255,136,0.2);border-radius:6px;color:#00ff88;font-size:11px;padding:3px 8px;cursor:pointer;font-family:'Rajdhani',sans-serif;">✓ Done</button>
        </div>
      `).join('')
    }
  `
  panel.style.display = 'block'
}

async function completeTask(id) {
  try {
    await fetch('https://datta-ai-server.onrender.com/agent/tasks/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done', token: localStorage.getItem('datta_token') })
    })
    showTasksPanel()
    showAgentToast('✅ Task completed!')
  } catch(e) {}
}

// ── AGENT MEMORY UI ───────────────────────────────────────────────────────────
async function showMemoryPanel() {
  try {
    const res = await fetch('https://datta-ai-server.onrender.com/agent/memory?token=' + localStorage.getItem('datta_token'))
    const memories = await res.json()
    const panel = document.getElementById('agentMemoryPanel')
    if (!panel) return

    panel.innerHTML = `
      <div style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:3px;color:var(--accent);margin-bottom:14px;">🧠 MY MEMORY</div>
      ${memories.length === 0 ? '<div style="color:#443300;font-size:13px;text-align:center;padding:20px;">No memories yet. Say "Remember that..." to save info!</div>' :
        memories.map(m => `
          <div style="background:#111000;border:1px solid rgba(255,215,0,0.08);border-radius:12px;padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;gap:8px;">
            <div style="flex:1;">
              <div style="font-family:'Rajdhani',sans-serif;font-size:12px;color:var(--accent);letter-spacing:1px;">${m.key}</div>
              <div style="font-size:13px;color:#998855;margin-top:2px;">${typeof m.value === 'object' ? JSON.stringify(m.value) : m.value}</div>
            </div>
            <button onclick="deleteMemory('${m.key}')" style="background:none;border:none;color:#443300;cursor:pointer;font-size:14px;padding:4px;">✕</button>
          </div>
        `).join('')
      }
    `
    panel.style.display = 'block'
  } catch(e) {}
}

async function deleteMemory(key) {
  try {
    await fetch('https://datta-ai-server.onrender.com/agent/memory/' + encodeURIComponent(key) + '?token=' + localStorage.getItem('datta_token'), { method: 'DELETE' })
    showMemoryPanel()
    showAgentToast('🗑️ Memory deleted')
  } catch(e) {}
}

// ── INJECT AGENT STYLES ───────────────────────────────────────────────────────
function injectAgentStyles() {
  const style = document.createElement('style')
  style.textContent = `
    .agent-thinking {
      display: flex; align-items: center; gap: 4px;
      margin-bottom: 8px; padding-bottom: 8px;
      border-bottom: 1px solid rgba(255,215,0,0.08);
    }
    .agent-think-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--accent);
      animation: agentPulse 1.2s infinite ease-in-out;
    }
    .agent-think-dot:nth-child(2) { animation-delay: 0.2s; }
    .agent-think-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes agentPulse {
      0%,80%,100% { transform: scale(0.6); opacity: 0.4; }
      40% { transform: scale(1); opacity: 1; background: var(--accent); }
    }
    .agent-response { border-left: 2px solid var(--accent) !important; padding-left: 12px !important; }
    #agentModeIndicator {
      display: none; align-items: center; gap: 5px;
      padding: 3px 10px; border-radius: 20px;
      border: 1px solid rgba(255,215,0,0.3);
      background: rgba(255,215,0,0.08);
      font-family: 'Rajdhani', sans-serif;
      font-size: 11px; font-weight: 700; letter-spacing: 2px;
      color: var(--accent);
    }
    .agent-mode-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--accent);
      animation: lp 1.5s infinite;
    }
    @keyframes lp { 0%,100%{opacity:1}50%{opacity:0.3} }
  `
  document.head.appendChild(style)
}

// ── INIT ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  injectAgentStyles()
  updateAgentModeUI()
})

// Expose globally
window.callAgent = callAgent
window.toggleAgentMode = toggleAgentMode
window.shouldUseAgent = shouldUseAgent
window.showAgentToast = showAgentToast
window.showTasksPanel = showTasksPanel
window.showMemoryPanel = showMemoryPanel
window.completeTask = completeTask
window.deleteMemory = deleteMemory
window.createAgentMessageDiv = createAgentMessageDiv
