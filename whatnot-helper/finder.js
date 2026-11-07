// Runs on the SKU Finder page: passes copied text to the Whatnot tab.
document.documentElement.dataset.whatnotHelper = "1";
window.addEventListener("message", e => {
  if (e.source !== window || !e.data || e.data.type !== "skubundl-type") return;
  chrome.runtime.sendMessage({ type: "type", text: String(e.data.text) }, res => {
    void chrome.runtime.lastError;
    window.postMessage({ type: "skubundl-typed", ok: !!(res && res.ok), text: e.data.text }, "*");
  });
});
