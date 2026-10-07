// Prints one read-only SQL query that lists every table/column the migrations
// create but the database lacks, with the file that adds it. Metadata only
// (information_schema); no student rows. For the read-only Supabase connection
// an agent has, or the SQL editor. The admin view of the same check is on /pilot.
// Run: npm run db:drift:sql
import { loadExpectedSchema } from "../lib/sor/drift";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const rows = loadExpectedSchema()
  .map((c) => `(${q(c.table)}, ${q(c.column)}, ${q(c.file)})`)
  .join(",\n  ");
console.log(`with expected(table_name, column_name, file) as (values
  ${rows}
)
select e.file, e.table_name, e.column_name,
       case when not exists (select 1 from information_schema.tables t
                             where t.table_schema = 'public' and t.table_name = e.table_name)
            then 'table missing' else 'column missing' end as gap
from expected e
where not exists (select 1 from information_schema.columns c
                  where c.table_schema = 'public' and c.table_name = e.table_name and c.column_name = e.column_name)
order by e.file, e.table_name, e.column_name;`);
