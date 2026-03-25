# 🤖 Datta AI — Agent Mode Backend Fix

Your frontend now sends `search=true` and `agent=true` in FormData.
Your backend needs to USE your Tavily key when it receives these flags.

## Add this to your Render backend (server.js / index.js / app.js)

Find your `/chat` route and add Tavily search BEFORE calling Groq:

```javascript
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

// Inside your /chat POST route:
app.post('/chat', async (req, res) => {
  const { message, chatId, token, language, mood, search, agent } = req.body;
  
  let finalMessage = message;
  let searchContext = '';

  // ── AGENT MODE: Use Tavily for real-time search ──
  if (search === 'true' || agent === 'true') {
    try {
      // Extract the actual user question (remove system instructions)
      const userQuestion = message.split('\n\n').pop().trim() || message;
      
      const tavilyRes = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: TAVILY_API_KEY,
          query: userQuestion,
          search_depth: 'advanced',
          max_results: 5,
          include_answer: true,
          include_raw_content: false
        })
      });
      
      if (tavilyRes.ok) {
        const tavilyData = await tavilyRes.json();
        
        // Build context from search results
        const results = tavilyData.results || [];
        const answer = tavilyData.answer || '';
        
        searchContext = '\n\n[WEB SEARCH RESULTS - USE THIS TO ANSWER]:\n';
        if (answer) searchContext += `Summary: ${answer}\n\n`;
        
        results.slice(0, 4).forEach((r, i) => {
          searchContext += `Source ${i+1}: ${r.title}\n`;
          searchContext += `URL: ${r.url}\n`;
          searchContext += `Content: ${r.content?.substring(0, 400)}\n\n`;
        });
        
        searchContext += `[Search Date: ${new Date().toISOString()}]\n`;
        searchContext += `[INSTRUCTION: Use the above search results to give a current, accurate answer. Cite sources.]\n`;
        
        // Prepend search results to the message
        finalMessage = message + searchContext;
      }
    } catch (searchErr) {
      console.error('Tavily search error:', searchErr.message);
      // Continue without search if Tavily fails
    }
  }

  // Now send finalMessage (with search context) to Groq as usual
  // ... rest of your existing Groq call code ...
});
```

## That's it! 

After this fix:
- User asks "war updates" → Tavily searches → results sent to Groq → AI answers with REAL data
- User asks "bitcoin price" → Tavily gets live price → AI gives actual current price  
- User asks "IPL score" → Tavily searches live → AI gives real score

## Your Tavily key is already in Render env vars:
`TAVILY_API_KEY` = already set ✅
