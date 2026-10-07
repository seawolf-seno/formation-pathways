import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { byTable, expectedSchema, parseMigration } from "../lib/sor/schema-expectations.ts";
import { checkSchemaDrift, gapsByFile } from "../lib/sor/drift.ts";

const sql = `
-- create table nope (x int);
create table public.things (
  id uuid primary key default gen_random_uuid(),
  "label" text not null check (length(label) between 1 and 60),
  amount numeric(10, 2),
  constraint label_unique unique (label),
  primary key (id)
);
create table private.secrets (token text);
create function private.f() returns void language plpgsql as $$
begin
  create table inside_function (y int);
end;
$$;
alter table things
  add column kind text not null default 'a' check (kind in ('a', 'b')),
  add column if not exists note text,
  add constraint kind_ok check (kind <> '');
alter table public.things enable row level security;
`;

test("the parser finds public tables and columns, and ignores constraints, comments, other schemas and function bodies", () => {
  assert.deepEqual(
    parseMigration(sql, "x.sql").map((c) => `${c.table}.${c.column}`),
    ["things.id", "things.label", "things.amount", "things.kind", "things.note"]
  );
});

test("the real migrations: student_sparks.source comes from the family-links file", () => {
  const files = fs.readdirSync("supabase/migrations").map((name) => ({ name, sql: fs.readFileSync(`supabase/migrations/${name}`, "utf8") }));
  const cols = expectedSchema(files);
  const source = cols.find((c) => c.table === "student_sparks" && c.column === "source");
  assert.equal(source?.file, "20261004150000_spark_family_links.sql");
  assert.ok(byTable(cols).get("spark_links")?.some((c) => c.column === "token_hash"));
  assert.ok(byTable(cols).has("people") && byTable(cols).has("access_log"));
});

/** A stand-in for supabase.from(t).select(cols).limit(0). */
function fakeDb({ tables, unreachable = [], broken = [] }) {
  return {
    from(table) {
      return {
        select(cols) {
          return {
            limit: async () => {
              if (broken.includes(table)) return { error: { code: "XX000", message: "boom" } };
              if (unreachable.includes(table)) return { error: { code: "42501", message: "permission denied" } };
              if (!tables[table]) return { error: { code: "PGRST205", message: "not found" } };
              const missing = cols.split(",").find((c) => !tables[table].includes(c));
              return missing ? { error: { code: "42703", message: `column ${missing} does not exist` } } : { data: [], error: null };
            },
          };
        },
      };
    },
  };
}

test("drift: a missing table, a missing column, an unreachable table, and a broken probe are each reported", async () => {
  const expected = [
    { table: "people", column: "id", file: "001.sql" },
    { table: "student_sparks", column: "sparks", file: "002.sql" },
    { table: "student_sparks", column: "source", file: "003.sql" },
    { table: "spark_links", column: "id", file: "003.sql" },
    { table: "new_table", column: "id", file: "004.sql" },
    { table: "odd", column: "id", file: "005.sql" },
  ];
  const db = fakeDb({
    tables: { people: ["id"], student_sparks: ["sparks"], new_table: ["id"], odd: ["id"] },
    unreachable: ["new_table"],
    broken: ["odd"],
  });
  const report = await checkSchemaDrift(db, expected);
  assert.deepEqual(
    report.gaps.map((g) => `${g.kind} ${g.table}.${g.column ?? "*"} ${g.file}`).sort(),
    ["missing spark_links.* 003.sql", "missing student_sparks.source 003.sql", "unreachable new_table.* 004.sql"]
  );
  assert.deepEqual(report.errors, [{ table: "odd", message: "boom" }]);
  assert.equal(report.checkedTables, 5);
  assert.deepEqual(gapsByFile(report.gaps).map(([f, g]) => `${f}:${g.length}`), ["003.sql:2", "004.sql:1"]);
});

test("drift: an up-to-date database reports nothing", async () => {
  const expected = [{ table: "people", column: "id", file: "001.sql" }];
  const report = await checkSchemaDrift(fakeDb({ tables: { people: ["id"] } }), expected);
  assert.deepEqual(report, { gaps: [], errors: [], checkedTables: 1 });
});
