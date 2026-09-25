import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile("supabase/migrations/001_initial.sql", "utf8");

test("schema cloud prepara propiedad, payload, versiones y timestamps", () => {
  for (const table of ["rosters", "matches", "user_state"]) {
    assert.match(sql, new RegExp(`create table public\\.${table} \\(`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(sql, new RegExp(`create trigger ${table}_prepare_cloud_row`));
  }
  assert.equal((sql.match(/references auth\.users\(id\) on delete cascade/g) || []).length, 3);
  assert.equal((sql.match(/payload jsonb not null/g) || []).length, 3);
  assert.equal((sql.match(/version bigint not null/g) || []).length, 3);
  assert.match(sql, /new\.version := old\.version \+ 1/);
  assert.match(sql, /new\.updated_at := pg_catalog\.now\(\)/);
});

test("RLS separa las cuatro operaciones y no concede datos a anon", () => {
  assert.match(sql, /revoke all on table public\.rosters, public\.matches, public\.user_state\s+from anon, authenticated/i);
  assert.match(sql, /grant select, insert, update, delete\s+on table public\.rosters, public\.matches, public\.user_state\s+to authenticated/i);
  assert.equal((sql.match(/create policy /g) || []).length, 12);
  assert.equal((sql.match(/for select/g) || []).length, 3);
  assert.equal((sql.match(/for insert/g) || []).length, 3);
  assert.equal((sql.match(/for update/g) || []).length, 3);
  assert.equal((sql.match(/for delete/g) || []).length, 3);
  assert.equal((sql.match(/with check \(\(select auth\.uid\(\)\) is not null/g) || []).length, 6);
  assert.doesNotMatch(sql, /using\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(sql, /service_role|realtime|postgres_changes/i);
});
