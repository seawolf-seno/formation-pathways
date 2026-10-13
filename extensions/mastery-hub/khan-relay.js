// Passes what khan-main.js saw to the extension's background worker, with the
// Khan class it belongs to (from the page address).
window.addEventListener("message", (event) => {
  if (event.source !== window || !event.data || event.data.__fpMastery !== true) return;
  const m = location.pathname.match(/\/teacher\/class\/([A-Z0-9]{6,12})(\/|$)/);
  if (!m) return;
  chrome.runtime.sendMessage({ type: "khan-data", classCode: m[1], op: event.data.op, data: event.data.data });
});
