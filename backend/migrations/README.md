# Database migrations

Versioned schema history for HUMSEE SCORE. **SQLite today, PostgreSQL later** —
do not rewrite the app; keep SQL portable and history in this folder.

## How it works now

1. `database.js` owns the live schema (CREATE IF NOT EXISTS + column backfills).
2. Files here are the **source of truth for humans and future engines**.
3. On boot, `database.js` records `001_baseline` in `schema_migrations`
   (`INSERT OR IGNORE`) so we can see which version a DB claims to be on.

## Adding a change

1. Create `NNN_short_name.sql` (next number).
2. Prefer portable SQL: `TEXT`, `INTEGER`, `DATETIME` strings, no SQLite-only
   extensions unless unavoidable.
3. Mirror the same statements as a backfill in `database.js` if existing DBs
   must pick them up without a manual step.
4. Bump the baseline marker only after the change is live.

## PostgreSQL path

The driver abstraction lives in `backend/db/driver.js`:

- SQLite (default): `createSqliteDriver()` wraps `node:sqlite` `DatabaseSync`.
- PostgreSQL (opt-in): set `DB_DRIVER=postgres` + `DATABASE_URL`; `createPostgresDriver()`
  lazily loads `pg` and exposes the same `prepare().get/all/run` / `exec` shapes
  (Promises instead of sync values — repositories must `await` after the swap).

| SQLite now | PostgreSQL later |
|------------|------------------|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `GENERATED ALWAYS AS IDENTITY` / SERIAL |
| `DATETIME` text | `TIMESTAMPTZ` |
| `node:sqlite` `DatabaseSync` | `pg` pool (`DB_DRIVER=postgres`) |
| single file `/data/scorecard.db` | managed Postgres + RLS by `organization_id` |

`organization_id` is already on `users` (default org `humsee`) so multi-tenancy
can be enforced later with RLS without renaming columns.

### Migration checklist

1. Export schema from SQLite, convert types per the table above.
2. Run every `NNN_*.sql` against Postgres (portable SQL only).
3. Set `DATABASE_URL` + `DB_DRIVER=postgres` on Railway; keep `JWT_SECRET` etc.
4. Flip repositories (`backend/repositories/`) to `await` driver calls first —
   they are the thin data-access boundary. Leave route SQL until a later pass.
5. Add RLS policies: `CREATE POLICY org_isolation ON users USING (organization_id = current_setting('app.org_id')::int);`
