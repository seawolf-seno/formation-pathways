// Matches a Khan student (the name Khan shows you) to one roster student,
// exactly: first (or preferred) and last name, in either order. Two roster
// students with the same name never match. Same rule as the hub's export
// drop-in (lib/mastery/exports.ts, matchStudent).
const words = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

export function matchRoster(name, roster) {
  const tokens = new Set(words(name));
  if (!tokens.size) return null;
  const hits = roster.filter((p) => {
    const last = words(p.last);
    const firsts = [p.first, p.preferred].filter(Boolean).map(words);
    return last.length > 0 && last.every((t) => tokens.has(t)) && firsts.some((f) => f.length > 0 && f.every((t) => tokens.has(t)));
  });
  return hits.length === 1 ? hits[0] : null;
}

/** Khan's level word → the two that count, or null. */
export function countedLevel(word) {
  const w = String(word || "").toLowerCase();
  if (w.includes("master")) return "mastered";
  if (w.includes("profic")) return "proficient";
  return null;
}
