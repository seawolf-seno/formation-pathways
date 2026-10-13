// Pacifica Mastery Hub extension: background worker.
//
// - Khan Academy: when Khan's skills report loads in your browser (you open
//   it, or the extension opens it in a background tab every three hours),
//   match its students to your hub roster here and send every skill's level
//   for them to the hub, which sorts skills into your learning objectives.
//   Unmatched Khan students stay in this browser; link them in the popup.
// - Tagging: the popup saves the page you're on for one of your classes.
//
// It talks only to your hub, with the connection token you created on
// /mastery. It never stores or sends a Khan password.

import { countedLevel, matchRoster } from "./match.js";

const DEFAULT_HUB = "https://formation-pathways.vercel.app";
const SYNC_MINUTES = 180;

async function settings() {
  const { hub = DEFAULT_HUB, token = null } = await chrome.storage.local.get(["hub", "token"]);
  return { hub: hub.replace(/\/+$/, ""), token };
}

async function api(path, init = {}) {
  const { hub, token } = await settings();
  if (!token) throw new Error("Not connected. Open the extension and connect it.");
  const res = await fetch(hub + path, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `The hub said ${res.status}`);
  return body;
}

let cached = null;
async function context(force = false) {
  if (!force && cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.data;
  const data = await api("/api/mastery/extension/context");
  cached = { at: Date.now(), data };
  return data;
}

async function setStatus(classCode, status) {
  const { khanStatus = {} } = await chrome.storage.local.get("khanStatus");
  khanStatus[classCode] = { ...status, at: new Date().toISOString() };
  await chrome.storage.local.set({ khanStatus });
}

// ---------------------------------------------------------------- Khan

const pending = new Map(); // tabId → { classCode, skills?, exercises? }

async function processKhan(tabId) {
  const p = pending.get(tabId);
  if (!p || !p.skills || !p.exercises) return;
  pending.delete(tabId);
  const { classCode } = p;
  try {
    const ctx = await context(true);
    const course = ctx.courses.find((c) => c.khan_class_code === classCode);
    if (!course) {
      await setStatus(classCode, { ok: false, message: `No hub course uses Khan class ${classCode}. Add it in the course's settings.` });
      return;
    }

    // The skill catalog: titles and Khan units (course content, no students).
    const meta = new Map();
    (p.exercises?.data?.courseById?.unitChildren ?? []).forEach((unit, i) => {
      // "Unit 3: …" if Khan says so, else its place in the course.
      const named = /\bunit\s*(\d{1,2})\b/i.exec(unit.translatedTitle || "");
      const unitNumber = named ? Number(named[1]) : i + 1;
      for (const c of unit.filteredContent ?? []) {
        const v = { title: c.translatedTitle, unit: unit.translatedTitle, unitNumber };
        if (c.id) meta.set(c.id, v);
        if (c.contentId) meta.set(c.contentId, v);
      }
    });
    const report = p.skills?.data?.teacherOverallProgressReport?.skillsLevels ?? [];
    const skills = report.flatMap((l) => (meta.has(l.skillId) ? [{ id: l.skillId, ...meta.get(l.skillId) }] : []));

    // Khan students → roster students, here in your browser.
    const known = new Map((course.khan_links || []).map((l) => [l.kaid, l.person]));
    const links = [];
    const unmatched = [];
    for (const s of p.skills?.data?.classroomByDescriptor?.studentKaidsAndNicknames ?? []) {
      if (known.has(s.kaid)) continue;
      const person = matchRoster(s.coachNickname, course.roster || []);
      if (person) {
        known.set(s.kaid, person.id);
        links.push({ kaid: s.kaid, person: person.id });
      } else unmatched.push({ kaid: s.kaid, name: s.coachNickname });
    }

    // Every level, for every skill, for students on your roster. The hub
    // keeps them all; proficient and mastered count toward objectives.
    const words = new Set();
    const levels = [];
    for (const l of report) {
      if (!meta.has(l.skillId)) continue;
      for (const sl of l.studentLevels ?? []) {
        words.add(String(sl.skillLevel));
        const person = known.get(sl.studentKaid);
        const level = countedLevel(sl.skillLevel) ?? String(sl.skillLevel || "").toLowerCase().replace(/[^a-z_ -]/g, "").slice(0, 30);
        if (person && level) levels.push({ person, skill: l.skillId, level });
      }
    }

    const result = await api("/api/mastery/extension/khan", { method: "POST", body: JSON.stringify({ course: course.id, skills, links, levels }) });
    cached = null;
    await setStatus(classCode, {
      ok: true,
      courseId: course.id,
      courseTitle: course.title,
      message: `${result.levels} Khan levels updated across ${skills.length} skills; ${result.added} new piece${result.added === 1 ? "" : "s"} of evidence. Sort any new skills into objectives on the course's Setup page.`,
      skillsSeen: skills.length,
      skillsWithoutTitle: report.length - skills.length,
      levelWordsSeen: [...words].sort(),
      unmatched,
      roster: (course.roster || []).filter((r) => ![...known.values()].includes(r.id)).map((r) => ({ id: r.id, name: `${r.preferred || r.first} ${r.last}` })),
    });
  } catch (e) {
    await setStatus(classCode, { ok: false, message: String(e.message || e) });
  } finally {
    const { ourTabs = [] } = await chrome.storage.session.get("ourTabs");
    if (ourTabs.includes(tabId)) {
      chrome.tabs.remove(tabId).catch(() => {});
      await chrome.storage.session.set({ ourTabs: ourTabs.filter((t) => t !== tabId) });
    }
  }
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === "khan-data" && sender.tab?.id != null) {
    const tabId = sender.tab.id;
    const p = pending.get(tabId) || { classCode: msg.classCode };
    if (msg.op === "KAClassroom_GetExerciseSkills") p.skills = msg.data;
    if (msg.op === "KAClassroom_GetCourseExercises") p.exercises = msg.data;
    pending.set(tabId, p);
    processKhan(tabId);
    return false;
  }
  if (msg?.type === "sync-now") {
    syncAll().then(reply, (e) => reply({ error: String(e.message || e) }));
    return true;
  }
  if (msg?.type === "link") {
    api("/api/mastery/extension/khan", { method: "POST", body: JSON.stringify({ course: msg.courseId, skills: [], links: [{ kaid: msg.kaid, person: msg.person }], levels: [] }) })
      .then(async () => {
        cached = null;
        const { khanStatus = {} } = await chrome.storage.local.get("khanStatus");
        const s = khanStatus[msg.classCode];
        if (s) {
          s.unmatched = (s.unmatched || []).filter((u) => u.kaid !== msg.kaid);
          s.roster = (s.roster || []).filter((r) => r.id !== msg.person);
          await chrome.storage.local.set({ khanStatus });
        }
        reply({ ok: true });
      })
      .catch((e) => reply({ error: String(e.message || e) }));
    return true;
  }
  if (msg?.type === "context") {
    context(Boolean(msg.force)).then(reply, (e) => reply({ error: String(e.message || e) }));
    return true;
  }
  if (msg?.type === "tag") {
    api("/api/mastery/extension/tag", { method: "POST", body: JSON.stringify(msg.body) }).then(reply, (e) => reply({ error: String(e.message || e) }));
    return true;
  }
  return false;
});

/** Open each linked Khan class's skills report in a background tab; the
 *  page loads its own data, which the listener above sends on. */
async function syncAll() {
  const ctx = await context(true);
  const codes = [...new Set(ctx.courses.map((c) => c.khan_class_code).filter(Boolean))];
  const { ourTabs = [] } = await chrome.storage.session.get("ourTabs");
  for (const code of codes) {
    const tab = await chrome.tabs.create({ url: `https://classroom.khanacademy.org/teacher/class/${code}/reports/skills`, active: false });
    ourTabs.push(tab.id);
  }
  await chrome.storage.session.set({ ourTabs, ourTabsOpened: Date.now() });
  chrome.alarms.create("khan-cleanup", { delayInMinutes: 2 });
  return { opened: codes.length };
}

chrome.runtime.onInstalled.addListener(() => chrome.alarms.create("khan-sync", { periodInMinutes: SYNC_MINUTES }));
chrome.runtime.onStartup.addListener(() => chrome.alarms.create("khan-sync", { periodInMinutes: SYNC_MINUTES }));
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "khan-cleanup") {
    // A background tab that never finished (signed out of Khan, say).
    const { ourTabs = [] } = await chrome.storage.session.get("ourTabs");
    for (const t of ourTabs) chrome.tabs.remove(t).catch(() => {});
    await chrome.storage.session.set({ ourTabs: [] });
    if (ourTabs.length) {
      const { khanStatus = {} } = await chrome.storage.local.get("khanStatus");
      for (const code of Object.keys(khanStatus)) {
        const s = khanStatus[code];
        if (Date.now() - Date.parse(s.at) > 2 * 60 * 1000) s.note = "Last automatic check didn't finish: are you signed in to Khan Academy in this Chrome?";
      }
      await chrome.storage.local.set({ khanStatus });
    }
    return;
  }
  if (alarm.name !== "khan-sync") return;
  const { token } = await settings();
  if (token) syncAll().catch(() => {});
});
