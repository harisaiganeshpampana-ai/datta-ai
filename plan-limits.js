// plan-limits.js — Datta AI Plan Management

(function() {
  const PLANS = {
    free:   { name: 'Free',   messages: 20,  images: 3,  searches: 5  },
    shakti: { name: '⚡ Shakti', messages: 200, images: 50, searches: 100 },
    agni:   { name: '🔥 Agni',  messages: -1,  images: -1, searches: -1 },
    brahma: { name: '👑 Brahma', messages: -1,  images: -1, searches: -1 }
  };

  function getPlan() {
    return localStorage.getItem('datta_plan') || 'free';
  }

  function isCreator() {
    try {
      const user = JSON.parse(localStorage.getItem('datta_user') || '{}');
      const username = (user.username || '').toLowerCase();
      const creators = ['pampana_hari_sai_ganesh','harisaiganesh','ganesh','admin','creator','dattaai'];
      return creators.some(c => username.includes(c));
    } catch(e) { return false; }
  }

  function getUsage() {
    const today = new Date().toDateString();
    const stored = JSON.parse(localStorage.getItem('datta_usage') || '{}');
    if (stored.date !== today) {
      // Reset daily usage
      const fresh = { date: today, messages: 0, images: 0, searches: 0 };
      localStorage.setItem('datta_usage', JSON.stringify(fresh));
      return fresh;
    }
    return stored;
  }

  function incrementUsage(type) {
    const usage = getUsage();
    usage[type] = (usage[type] || 0) + 1;
    localStorage.setItem('datta_usage', JSON.stringify(usage));
  }

  function canUse(type) {
    if (isCreator()) return true;
    const plan = getPlan();
    const limits = PLANS[plan] || PLANS.free;
    if (limits[type] === -1) return true; // unlimited
    const usage = getUsage();
    return (usage[type] || 0) < limits[type];
  }

  function showLimitModal(type) {
    let existing = document.getElementById('limitModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'limitModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);';
    modal.innerHTML = `
      <div style="background:#0f0e00;border:1px solid rgba(255,215,0,0.2);border-radius:24px;padding:28px 24px;width:90%;max-width:340px;text-align:center;">
        <div style="font-size:40px;margin-bottom:12px;">⚡</div>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:3px;color:#ffd700;margin-bottom:8px;">LIMIT REACHED</div>
        <div style="font-family:'Rajdhani',sans-serif;font-size:13px;color:#665500;margin-bottom:20px;letter-spacing:1px;">
          You've used all your free ${type} today.<br>Upgrade for unlimited access!
        </div>
        <button onclick="window.location.href='pricing.html'" style="width:100%;padding:12px;background:linear-gradient(135deg,#ffd700,#ff8c00);border:none;border-radius:12px;color:#000;font-family:'Rajdhani',sans-serif;font-size:14px;font-weight:700;letter-spacing:1px;cursor:pointer;margin-bottom:8px;">
          🔥 Upgrade to Agni — ₹499/mo
        </button>
        <button onclick="document.getElementById('limitModal').remove()" style="width:100%;padding:10px;background:none;border:1px solid rgba(255,215,0,0.1);border-radius:12px;color:#443300;font-family:'Rajdhani',sans-serif;font-size:13px;cursor:pointer;">
          Not now
        </button>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if(e.target===modal) modal.remove(); });
  }

  // Expose globally
  window.dattaPlan = { getPlan, isCreator, getUsage, incrementUsage, canUse, showLimitModal, PLANS };

})();
