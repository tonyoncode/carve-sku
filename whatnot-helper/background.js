// Forwards text from SKU Finder to open Whatnot tabs (most recently used first).
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type !== "type" && msg.type !== "send") return;
  chrome.tabs.query({ url: ["https://*.whatnot.com/*", "https://whatnot.com/*"] }, async tabs => {
    tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    for (const t of tabs) {
      try {
        const r = await chrome.tabs.sendMessage(t.id, { type: msg.type, text: msg.text });
        if (r && r.ok) return reply({ ok: true });
      } catch (e) {}
    }
    reply({ ok: false });
  });
  return true;
});
