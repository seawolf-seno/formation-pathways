// What the live database should have, read from supabase/migrations/*.sql:
// every public table and column the migrations create, and the file that
// creates each. Migrations are applied by hand (SQL editor or `supabase db
// push`), and SQL-editor runs aren't recorded in supabase_migrations, so the
// only reliable drift check is against the real objects (lib/sor/drift.ts).
// Pure: tested in tests/schema-expectations.test.mjs.

export interface ExpectedColumn {
  table: string;
  column: string;
  /** The migration file that creates it. */
  file: string;
}

/** Function bodies ($$ … $$ or $tag$ … $tag$) and comments carry semicolons
 *  and DDL-looking text that aren't statements; drop them first. */
function stripNoise(sql: string): string {
  return sql
    .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, "''")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

/** Splits on commas that aren't inside parentheses or quotes. */
function topLevelItems(body: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let quoted = false;
  let cur = "";
  for (const ch of body) {
    if (ch === "'") quoted = !quoted;
    if (!quoted && ch === "(") depth++;
    if (!quoted && ch === ")") depth--;
    if (!quoted && depth === 0 && ch === ",") {
      items.push(cur);
      cur = "";
    } else cur += ch;
  }
  items.push(cur);
  return items.map((i) => i.trim()).filter(Boolean);
}

const NOT_A_COLUMN = /^(constraint|primary|unique|check|foreign|exclude|like)\b/i;
const ident = (s: string) => s.replace(/"/g, "").toLowerCase();
const TABLE = /(?:only\s+)?(?:if\s+(?:not\s+)?exists\s+)?(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?/i;

/** The public tables and columns one migration file creates. */
export function parseMigration(sql: string, file: string): ExpectedColumn[] {
  const out: ExpectedColumn[] = [];
  for (const raw of stripNoise(sql).split(";")) {
    const stmt = raw.trim().replace(/\s+/g, " ");
    // create table [if not exists] [public.]name ( … )
    const create = stmt.match(/^create\s+(?:unlogged\s+)?table\s+(.+?)\s*\(([\s\S]*)\)\s*$/i);
    if (create) {
      const head = create[1].trim();
      if (/^"?\w+"?\./.test(head) && !/^"?public"?\./i.test(head)) continue; // another schema
      const table = ident(head.match(TABLE)![1]);
      for (const item of topLevelItems(create[2])) {
        if (NOT_A_COLUMN.test(item)) continue;
        const column = item.match(/^"?([a-z_][a-z0-9_]*)"?\s/i)?.[1];
        if (column) out.push({ table, column: ident(column), file });
      }
      continue;
    }
    // alter table [only] [if exists] [public.]name add column … [, add column …]
    const alter = stmt.match(/^alter\s+table\s+(.+?)\s+(add\s[\s\S]*)$/i);
    if (alter) {
      const head = alter[1].trim();
      if (/^"?\w+"?\./.test(head.replace(/^(only|if exists)\s+/gi, "")) && !/"?public"?\./i.test(head)) continue;
      const table = ident(head.match(TABLE)![1]);
      for (const item of topLevelItems(alter[2])) {
        const column = item.match(/^add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/i)?.[1];
        if (column) out.push({ table, column: ident(column), file });
      }
    }
  }
  return out;
}

/** Every expected public column across all migrations, in file order. */
export function expectedSchema(files: { name: string; sql: string }[]): ExpectedColumn[] {
  return [...files]
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((f) => parseMigration(f.sql, f.name));
}

/** Expected columns grouped by table, for one probe per table. */
export function byTable(cols: ExpectedColumn[]): Map<string, ExpectedColumn[]> {
  const map = new Map<string, ExpectedColumn[]>();
  for (const c of cols) map.set(c.table, [...(map.get(c.table) ?? []), c]);
  return map;
}
