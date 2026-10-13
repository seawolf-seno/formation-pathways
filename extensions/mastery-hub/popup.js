// The popup: connect, tag the page you're on, and see / fix the Khan sync.
const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);
const KINDS = { "youtube.com": "a video", "youtu.be": "a video", "khanacademy.org": "Khan Academy", "phet.colorado.edu": "a PhET sim", "openstax.org": "OpenStax" };

async function show() {
  const { token } = await chrome.storage.local.get("token");
  $("connect").hidden = Boolean(token);
  $("main").hidden = !token;
  if (token) await loadMain();
}

$("doConnect").onclick = async () => {
  const hub = $("hub").value.trim().replace(/\/+$/, "");
  const token = $("token").value.trim();
  $("connectMsg").textContent = "";
  try {
    const url = new URL(hub);
    const pattern = `${url.protocol}//${url.hostname}/*`;
    const has = await chrome.permissions.contains({ origins: [pattern] });
    if (!has && !(await chrome.permissions.request({ origins: [pattern] }))) throw new Error("The extension needs permission to reach that hub.");
  } catch (e) {
    $("connectMsg").textContent = String(e.message || e);
    return;
  }
  await chrome.storage.local.set({ hub, token });
  const ctx = await send({ type: "context", force: true });
  if (ctx?.error) {
    await chrome.storage.local.remove("token");
    $("connectMsg").textContent = ctx.error;
    return;
  }
  show();
};

$("disconnect").onclick = async () => {
  await chrome.storage.local.remove(["token", "khanStatus"]);
  show();
};

let courses = [];
async function loadMain() {
  const ctx = await send({ type: "context" });
  if (ctx?.error) {
    $("who").textContent = ctx.error;
    return;
  }
  courses = ctx.courses;
  $("who").textContent = `Signed in to the hub as ${ctx.staff}`;
  $("course").innerHTML = courses.map((c) => `<option value="${c.id}">${escapeHtml(c.title)}</option>`).join("");
  const { lastCourse } = await chrome.storage.local.get("lastCourse");
  if (lastCourse && courses.some((c) => c.id === lastCourse)) $("course").value = lastCourse;
  fillWhere();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  window.__tab = tab;
  const host = tab?.url ? new URL(tab.url).hostname.replace(/^www\./, "") : "";
  const kind = Object.entries(KINDS).find(([h]) => host === h || host.endsWith("." + h))?.[1];
  $("pageTitle").textContent = tab?.url?.startsWith("https://") ? `${tab.title}${kind ? ` (${kind})` : ""}` : "This page can't be tagged (only https pages).";
  $("doTag").disabled = !tab?.url?.startsWith("https://");
  renderKhan();
}

function fillWhere() {
  const c = courses.find((x) => x.id === $("course").value);
  $("where").innerHTML = (c?.standards || [])
    .map((g) => `<option value="g:${g.code}">${escapeHtml(g.title)} (whole unit)</option>` + g.standards.map((s) => `<option value="s:${s.code}">  ${s.code} ${escapeHtml(s.title)}</option>`).join(""))
    .join("");
}
$("course").onchange = async () => {
  await chrome.storage.local.set({ lastCourse: $("course").value });
  fillWhere();
};

$("doTag").onclick = async () => {
  const tab = window.__tab;
  $("doTag").disabled = true;
  $("tagMsg").textContent = "Saving…";
  const res = await send({ type: "tag", body: { course: $("course").value, where: $("where").value, url: tab.url, title: tab.title, note: $("note").value } });
  $("doTag").disabled = false;
  $("tagMsg").textContent = res?.error ? res.error : `Saved "${res.title}" to this class.`;
  if (!res?.error) $("note").value = "";
};

async function renderKhan() {
  const { khanStatus = {} } = await chrome.storage.local.get("khanStatus");
  const linked = courses.filter((c) => c.khan_class_code);
  const box = $("khan");
  if (!linked.length) {
    box.innerHTML = `<p class="small">No class has a Khan class code yet. Add it in the course's settings on the hub.</p>`;
    return;
  }
  box.innerHTML = linked
    .map((c) => {
      const s = khanStatus[c.khan_class_code];
      const head = `<b>${escapeHtml(c.title)}</b> <span class="small">· Khan ${c.khan_class_code}</span>`;
      if (!s) return `<div class="card">${head}<br><span class="small">Not synced yet.</span></div>`;
      const unmatched = (s.unmatched || [])
        .map(
          (u) => `<div class="small">Khan student <b>${escapeHtml(u.name)}</b> isn't matched.
            <select data-kaid="${u.kaid}" data-course="${s.courseId}" data-class="${c.khan_class_code}">
              <option value="">Link to…</option>${(s.roster || []).map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join("")}
            </select></div>`,
        )
        .join("");
      return `<div class="card ${s.ok ? "" : "warn"}">${head}<br>${escapeHtml(s.message)}
        <div class="small">${new Date(s.at).toLocaleString()}${s.note ? ` · ${escapeHtml(s.note)}` : ""}</div>
        ${s.levelWordsSeen?.length ? `<div class="small">Khan levels seen: ${s.levelWordsSeen.map(escapeHtml).join(", ")} (only proficient and mastered count)</div>` : ""}
        ${unmatched}</div>`;
    })
    .join("");
  box.querySelectorAll("select[data-kaid]").forEach((sel) => {
    sel.onchange = async () => {
      if (!sel.value) return;
      const res = await send({ type: "link", kaid: sel.dataset.kaid, person: sel.value, courseId: sel.dataset.course, classCode: sel.dataset.class });
      $("syncMsg").textContent = res?.error ? res.error : "Linked. Sync again to bring in their skills.";
      renderKhan();
    };
  });
}

$("doSync").onclick = async () => {
  $("syncMsg").textContent = "Opening your Khan skills reports in the background…";
  const res = await send({ type: "sync-now" });
  $("syncMsg").textContent = res?.error ? res.error : `Checking ${res.opened} Khan class${res.opened === 1 ? "" : "es"}. This takes about half a minute.`;
  setTimeout(renderKhan, 15000);
  setTimeout(renderKhan, 40000);
};

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.khanStatus && !$("main").hidden) renderKhan();
});
show();
