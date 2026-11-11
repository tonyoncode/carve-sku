// Runs on Whatnot: puts the text into the chat bar.
let last = null;
const editable = el => el && (el.isContentEditable || (/^(INPUT|TEXTAREA)$/.test(el.tagName) && !/^(checkbox|radio|button|submit|file|range|color|hidden)$/i.test(el.type || "")));
const visible = el => el && el.isConnected && el.offsetParent !== null && !el.disabled && !el.readOnly;
const wait = ms => new Promise(r => setTimeout(r, ms));
// Remember the last text box you clicked into, in case the chat bar can't be found automatically
document.addEventListener("focusin", e => { if (editable(e.target)) last = e.target; }, true);

function findChat() {
  const sel = 'input:not([type]),input[type="text"],textarea,[contenteditable="true"],[role="textbox"]';
  const all = [...document.querySelectorAll(sel)].filter(visible);
  const hint = /say something|chat|message|comment|send|announce/i;
  const byHint = all.find(el => hint.test([el.placeholder, el.getAttribute("aria-label"), el.getAttribute("data-placeholder"), el.name].join(" ")));
  return byHint || (visible(last) ? last : null);
}

const valueOf = el => (el.isContentEditable || !("value" in el)) ? el.textContent : el.value;

function setValue(el, text) {
  el.focus();
  if (el.isContentEditable || !("value" in el)) {
    document.execCommand("selectAll", false, null);
    if (text) document.execCommand("insertText", false, text); else document.execCommand("delete", false, null);
  } else {
    // React-controlled inputs need the native setter so the app notices the change
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    try { el.setSelectionRange(text.length, text.length); } catch (e) {}
  }
}

// Types one character with key events, like a person, so Whatnot's "/" command menu reacts
function key(el, ch) {
  const o = { key: ch, code: ch === "/" ? "Slash" : ch === " " ? "Space" : "Key" + ch.toUpperCase(), bubbles: true, cancelable: true };
  el.dispatchEvent(new KeyboardEvent("keydown", o));
  el.dispatchEvent(new KeyboardEvent("keypress", o));
  if (!document.execCommand("insertText", false, ch)) setValue(el, valueOf(el) + ch);
  el.dispatchEvent(new KeyboardEvent("keyup", o));
}

// Finds the "/announce" choice in the command menu that pops up above the chat bar
function findCommand(chat) {
  const items = [...document.querySelectorAll('[role="option"],[role="menuitem"],[role="listbox"] > *,[role="menu"] > *,li,button,[data-testid],[class*="ommand"],[class*="uggest"],[class*="ption"]')]
    .filter(el => el !== chat && !el.contains(chat) && el.offsetParent !== null && /^\s*\/?\s*announce\b/i.test(el.textContent || "") && (el.textContent || "").length < 120);
  // Prefer the smallest matching element that is (or sits in) something clickable
  items.sort((a, b) => a.textContent.length - b.textContent.length);
  const hit = items[0];
  return hit && (hit.closest('[role="option"],[role="menuitem"],button,li') || hit);
}

function press(el) {
  for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    const E = t.startsWith("pointer") ? PointerEvent : MouseEvent;
    el.dispatchEvent(new E(t, { bubbles: true, cancelable: true, view: window, button: 0 }));
  }
}

async function announce(el, text) {
  setValue(el, "");
  for (const ch of "/announce") { key(el, ch); await wait(25); }
  // Wait for the command menu, then pick /announce from it
  let cmd = null;
  for (let i = 0; i < 20 && !(cmd = findCommand(el)); i++) await wait(75);
  if (cmd) {
    press(cmd);
  } else {
    // No menu showed up: confirm the command with Tab, which never sends the message
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", code: "Tab", keyCode: 9, which: 9, bubbles: true, cancelable: true }));
  }
  await wait(200);
  // The chat bar may be swapped for an "announce" box after picking the command
  const box = (editable(document.activeElement) && visible(document.activeElement)) ? document.activeElement : (visible(el) ? el : findChat());
  if (!box) return false;
  box.focus();
  const now = valueOf(box) || "";
  if (/^\s*\/announce\s*$/i.test(now) || now.trim() === "") {
    // Either the menu turned it into announce mode (box empty) or left "/announce" as text: add the message after it
    const sep = now && !/\s$/.test(now) ? " " : "";
    try { if (!box.isContentEditable && "value" in box) box.setSelectionRange(now.length, now.length); } catch (e) {}
    if (!document.execCommand("insertText", false, sep + text)) setValue(box, now + sep + text);
  } else {
    setValue(box, "/announce " + text);
  }
  return true;
}

// Sends whatever is in the chat bar: Enter key first, then a Send button as backup
async function sendChat(el) {
  if (!(valueOf(el) || "").trim()) return false;
  el.focus();
  for (const t of ["keydown", "keypress", "keyup"]) {
    el.dispatchEvent(new KeyboardEvent(t, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
  }
  await wait(250);
  if (!(valueOf(el) || "").trim()) return true; // chat bar cleared = sent
  // Backup: click a Send button near the chat bar
  const isSend = x => visible(x) && (x.type === "submit" || /^send$/i.test((x.getAttribute("aria-label") || x.title || x.textContent || "").trim()));
  let scope = el;
  for (let i = 0; i < 5 && scope.parentElement; i++) {
    scope = scope.parentElement;
    const btn = [...scope.querySelectorAll('button,[role="button"]')].find(isSend);
    if (btn) { press(btn); await wait(250); return !(valueOf(el) || "").trim(); }
  }
  const form = el.closest("form");
  if (form && form.requestSubmit) { form.requestSubmit(); await wait(250); return !(valueOf(el) || "").trim(); }
  return false;
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === "send") {
    const c = findChat();
    if (!c) return;
    sendChat(c).then(ok => reply({ ok }), () => reply({ ok: false }));
    return true;
  }
  if (msg.type !== "type") return;
  const el = findChat();
  if (!el) return; // another frame may have the chat bar
  const m = /^\/announce\s+([\s\S]*)$/i.exec(msg.text);
  if (!m) { setValue(el, msg.text); reply({ ok: true }); return; }
  announce(el, m[1]).then(ok => reply({ ok }), () => reply({ ok: false }));
  return true;
});
