import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../world-signals-review.html", import.meta.url), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// Exercise the actual standalone file's upload/render handlers. The DOM
// adapter captures rendered HTML; no browser, external feeds or student data.
function page() {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: "", textContent: "", hidden: false, listeners: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener(name, fn) { this.listeners[name] = fn; } });
    return nodes.get(id);
  };
  vm.runInNewContext(script, {
    document: { getElementById: node },
    localStorage: { getItem: () => null, setItem() {} },
    navigator: { clipboard: { async writeText() {} } },
    URL,
    console,
    FileReader: class { readAsText(file) { this.result = file.text; this.onload(); } },
  });
  return {
    node,
    upload(slot, data) {
      const input = node(slot === "new" ? "file-new" : "file-old");
      const text = JSON.stringify(data);
      input.files = [{ name: `${slot}.json`, text, size: text.length }];
      input.listeners.change();
    },
  };
}

test("the repository snapshot shows the actual notes staff need to review", () => {
  const p = page();
  const snapshot = JSON.parse(fs.readFileSync(new URL("../fixtures/world-signals.json", import.meta.url), "utf8"));
  p.upload("new", snapshot);
  assert.equal(p.node("err").hidden, true);
  assert.ok(p.node("items").innerHTML.includes("class=\"note\""));
  assert.ok(p.node("counts").innerHTML.includes("TBPN"));
});

test("changed show notes at the same episode URL still need review", () => {
  const p = page();
  const signal = { source: "Example show", title: "Example episode", url: "https://example.test/episode", note: "Old summary" };
  p.upload("old", { signals: [signal] });
  p.upload("new", { signals: [{ ...signal, note: "Changed summary" }] });
  assert.match(p.node("headline").innerHTML, /<b>1<\/b> new signal/);
  assert.ok(p.node("items").innerHTML.includes("Changed summary"));
  assert.ok(!p.node("items").innerHTML.includes("Old summary"));
});

test("uploaded titles and notes are escaped, and executable or credentialed links are not rendered", () => {
  const p = page();
  p.upload("new", { signals: [
    { title: "<img onerror=alert(1)>", note: "<script>alert(1)</script>", url: "javascript:alert(1)" },
    { title: "Data link", url: "data:text/html,test" },
    { title: "Credentials", url: "https://user:secret@example.test" },
    { title: "Safe link", url: "https://example.test/safe" },
  ] });
  const rendered = p.node("items").innerHTML;
  assert.ok(rendered.includes("&lt;img"));
  assert.ok(rendered.includes("&lt;script&gt;"));
  assert.ok(!rendered.includes('href="javascript:'));
  assert.ok(!rendered.includes('href="data:'));
  assert.ok(!rendered.includes("user:secret"));
  assert.ok(rendered.includes('href="https://example.test/safe"'));
});

test("malformed signal entries display an import error", () => {
  const p = page();
  p.upload("new", { signals: [null] });
  assert.equal(p.node("err").hidden, false);
  assert.equal(p.node("results").innerHTML, "");
});
