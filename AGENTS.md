# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project Overview

**Applicant Scorecard** — an internal tool for a recruiting/staffing agency, rebuilt to match the
reference app at `https://score-card-production-366e.up.railway.app/`. Admins rate candidates
against **23 weighted parameters** (weights sum to 100%) and bulk-import candidates from Excel;
each employee has a read-only view of their own scorecard.

There is also an **Inner Intelligence** module (numerology-based "reflection" tool): admin-only,
feature-flagged, and it NEVER affects the 23-parameter score or weighted %. Every card carries a
disclaimer ("Reflection, not a prediction", "not a hiring signal").

- **Frontend**: React 18 + Vite 5 + Ant Design 6 + react-router-dom 7 (role-based routing)
- **Backend**: Node.js + Express + SQLite (via built-in `node:sqlite`, NOT `better-sqlite3`)
- **Excel import**: `xlsx` (SheetJS, pure-JS) + `multer` 2.x (memory storage) — both pure-JS,
  they compile fine on this machine (unlike native modules).

## Repository Layout

```
backend/
  server.js              Express entrypoint; mounts /api/auth, /api/admin, /api/employee
  database.js            SQLite schema + seeds (23 params, users, numerology tables); exports db, makeUsername()
  scoreUtils.js          weightedPct() (Σ score/5 × weightage) and loadScorecard()
  jdValidation.js        Strict JD upload validation + content-fingerprint (SHA-256) dedupe service
  numerologyUtils.js     Pure numerology math + PERSONAL_YEAR_THEMES map (no DB access)
  tests/                 jdValidation.test.js — 12-case JD validation/dedupe suite (`npm test`)
  routes/
    auth.js              POST /login -> { token, user }
    admin.js             parameters, employees, employees/:id/scorecard, upload-excel (role=admin)
    numerology.js        Inner Intelligence endpoints (gated + admin-only)
    employee.js          GET /scorecard -> current employee's own scorecard (read-only)
  middleware/auth.js     authenticate (JWT verify) and requireRole(role)
  scorecard.db           SQLite file (created and seeded automatically on first run)

frontend/
  src/
    main.jsx             ReactDOM root
    App.jsx              Role-based router (admin vs employee branch) + AntD ConfigProvider
    scoreLabels.js       badge() thresholds -> label + color
    services/api.js      fetch wrapper (Authorization header, FormData support); BASE_URL from env
    services/AuthContext.jsx  JWT + user in localStorage ('token', 'user'); token expiry check
    pages/
      LoginPage.jsx
      admin/
        AdminLayout.jsx  top navbar (Home, Scores, user, Logout)
        AdminHome.jsx    marketing landing (hero, stats, features, pricing)
        ScoresPage.jsx   employee scorecard list, search, Excel import, Add Candidate
        ScorePage.jsx    per-employee score edit form (23 Rate fields + weighted total)
      employee/
        MyScorecard.jsx  read-only view (badge %, info cards, parameter breakdown)
    styles/app.css
  vite.config.js         dev port 3000; proxies /api to VITE_API_URL
```

## Required Commands

Run from the repo root `C:\Users\Shruti\OneDrive\Desktop\office\score with astro`:

| Task | Command |
|------|---------|
| Install backend deps | `npm install` (workdir: `backend`) |
| Run backend | `node server.js` (workdir: `backend`) |
| Install frontend deps | `npm install` (workdir: `frontend`) |
| Run frontend (dev) | `npm run dev` (workdir: `frontend`) — serves :3000 |
| Build frontend | `npm run build` (workdir: `frontend`) |
| Run backend tests | `npm test` (workdir: `backend`) — JD validation suite in `backend/tests/jdValidation.test.js` |

The backend has a **JD validation test suite** (`npm test` → `node --test`); there is **no linter/typecheck** configured. Frontend build verification is done
with `npm run build` in `frontend/`; backend behavior is verified by starting the server
(`node server.js`) and hitting the API (e.g. with `Invoke-RestMethod`).

## Architecture & Key Decisions

- **`node:sqlite` instead of `better-sqlite3`**: Node 24 on this Windows box has no native
  build toolchain, so native modules (better-sqlite3) fail to compile. The SQLite driver is the
  built-in `node:sqlite` `DatabaseSync`. **Do not re-add `better-sqlite3`**. `xlsx` and
  `multer` (both pure-JS) ARE in use for Excel import — do not remove them.
- **No `db.transaction()`**: `node:sqlite` does not expose a `.transaction()` helper. Wrap
  multi-statement writes manually with `db.exec('BEGIN')` / `db.exec('COMMIT')` and
  `db.exec('ROLLBACK')` in a catch. See `routes/admin.js` `POST /employees/:id/scorecard`.
- **Auth**: JWT in `Authorization: Bearer <token>`. `AuthContext` persists `token` + `user`
  in `localStorage` and treats the token as expired via the JWT `exp` claim.
- **Weighted score**: `Σ(score/5 × weightage)`, rounded to an integer percentage.
  Weights sum to **100**, so the result is 0–100. Per-parameter weighted contribution is
  `Math.round(score/5 × weightage × 10)/10`.
- **JD duplicate prevention**: content-fingerprinted with SHA-256 of normalized text
  (`jd_hash`, UNIQUE partial index); `validateAndResolveJD` in `jdValidation.js` is the one
  service shared by JD Creation and Add Candidate. Never filename-based. Exact duplicates
  return 409 `{duplicate, existingJdId}`; pasted blank/resume/gibberish text is rejected at upload.
- **Badge thresholds** (see `scoreLabels.js`): ≥80 Excellent (green), ≥60 Good (blue),
  ≥40 Average (amber), <40 Needs Improvement (red).
- **Scoring params**: **23 parameters** seeded server-side with weights summing to 100.
- **API base**: `import.meta.env.VITE_API_URL` (default `http://localhost:5000`). Dev runs
  via Vite proxy on :3000 -> :5000.

## Inner Intelligence (numerology) — architecture

- **Feature-flagged**: all routes check `ENABLE_INNER_INTELLIGENCE=true` via a `gate()` helper
  (`routes/numerology.js`) and return **404** when off. It is admin-only (`requireRole('admin')`).
- **Data model**: 3 tables in `database.js`
  - `numerology_archetypes` — 11 seeded rows (1,2,3,4,5,6,7,8,9,11,22), each with `name/summary/tags`.
  - `numerology_profiles` — per-employee; PK `(employee_id, dimension)` with `dimension` default
    `'candidate'` so the shape could generalize to other entity types later (do NOT build
    generalization until a 2nd entity type exists).
  - `company_numerology_profiles` — single org profile (`client_name`, `founded_year`).
- **Employees live in the `users` table** (`role='employee'`); numerology FK references
  `users(id)`, NOT a separate `employees` table (adaptation from the work order's SQL).
- **Server-computed, never client-supplied**: on `POST .../numerology` (DOB write), life path,
  birth number, and archetype are recomputed server-side via `numerologyUtils.js`. Math:
  `lifePathNumber` sums all digits of `YYYY-MM-DD` (keeping 11/22/33); `birthNumber` = day only
  (keeping 11/22); `personalYearNumber` = day+month+year WITHOUT master numbers;
  `companyFoundedNumber` = year digits reduced. Personal year themes live in `PERSONAL_YEAR_THEMES`.
- **Template-based narrative**: `generateNarrative()` builds deterministic prose cached in
  `narrative_snapshot`. `generateInterviewPrep()` ties 3 prompts to the LOWEST-scored role-fit
  parameter. No LLM calls.
- **Match-vs-role** reuses normal scorecard `scores`, mapped to `role_fit = round(score/5*100)`.
- **DOB single source of truth = `users.date_of_birth`** (`ALTER TABLE` migration in
  `database.js`). Add Candidate (`POST /employees`) requires it (`400 "Date of Birth is required."`,
  YYYY-MM-DD, must be a valid past date) and persists it on the `users` row. `getProfile()` in
  `routes/numerology.js` lazily syncs `numerology_profiles` from `users.date_of_birth`, so Inner
  Intelligence auto-fills DOB read-only from the stored value — no DOB entry screen. Legacy profiles
  (DOB manually entered before this column existed) still work when `users.date_of_birth` is NULL.
  `POST /employees/:id/numerology` now also writes `users.date_of_birth` to keep one source of truth.
  Candidates without a DOB show "Date of Birth is not available. Please update the candidate's Date
  of Birth in Add Candidate." — never a fake/default date. Note: Excel bulk import does NOT require
  DOB (existing sheets/seeds have none); such candidates just get the not-available message.

## API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/auth/login` | none | Login -> `{token, user}` |
| GET | `/api/admin/parameters` | admin | 23 weighted parameters |
| GET | `/api/admin/employees?search=` | admin | List candidates + scorecard summary |
| POST | `/api/admin/employees` | admin | Add a candidate `{name, email, date_of_birth}` (DOB required, YYYY-MM-DD) |
| GET | `/api/admin/employees/:id/scorecard` | admin | Load a candidate's scorecard + scores |
| POST | `/api/admin/employees/:id/scorecard` | admin | Create/update a scorecard |
| POST | `/api/admin/upload-excel` | admin | Bulk import candidates (multipart `file`, .xlsx/.xls) |
| GET | `/api/employee/scorecard` | employee | Current employee's own scorecard (read-only) |

Inner Intelligence (all admin-only and gated by `ENABLE_INNER_INTELLIGENCE=true` — 404 when off):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/employees/:id/numerology` | Archetype card + match-vs-role bars; `hasProfile:false` if no DOB set |
| POST | `/api/admin/employees/:id/numerology` | Set DOB (`date_of_birth` YYYY-MM-DD) -> recompute profile server-side |
| GET | `/api/admin/employees/:id/numerology/cycle` | 4-year personal-year timeline (current year onward) |
| GET | `/api/admin/employees/:id/numerology/narrative` | Template narrative (cached in `narrative_snapshot`) |
| GET | `/api/admin/employees/:id/numerology/interview-prep` | 3 prompts tied to lowest role-fit parameter |
| GET | `/api/admin/employees/:id/numerology/company-match` | Candidate-vs-company "echo" ({Strong/Light}) |
| GET | `/api/admin/company-numerology` | Org profile row (first in `company_numerology_profiles`) |
| GET | `/api/admin/employees/numerology/compare?ids=3,2` | Multi-candidate compare (theme, archetype, personal year) |

Employee rows shape: `{id, applicant_name, email, client, position, weighted_pct, scorecard_id, updated_at_history[]}` (scorecard edit payload adds scores + `date_of_birth`).
Create-candidate payload: `{name, email, date_of_birth (required, YYYY-MM-DD), position?, client?, job_description_id?, resume?, jd_file?}`.

## Environment

- Platform: **win32**, shell: **Windows PowerShell 5.1**
- No `&&` chaining — use `cmd1; if ($?) { cmd2 }`.
- No ternary `a ? b : c` — use `if/else`.
- PowerShell 5.1 does not support `-Form` in `Invoke-RestMethod`; use `curl.exe -F` for multipart uploads.
- Node v24.13.0 (win32 x64). No Visual Studio build tools (native modules fail).

## Default Credentials (seeded in `database.js`)

- Admin: username `test123` / `12345`
- Employees: password `12345`, usernames from `makeUsername()`
  = first letter of first name + last name, lowercase (e.g. `hkhan`, `agonzales`, `tsaba`).

> The seed likewise gives imported candidates (e.g. from Excel) the password `12345`.

## Gotchas

- `node:sqlite` prints an `ExperimentalWarning` on startup — harmless, do not "fix" it.
- The backend writes `scorecard.db` in `backend/` on first run; delete it to re-seed (the schema
  changed when the app was reworked — if upgrading an old DB, delete `scorecard.db` first).
- Deleting a scorecard's child `scores`/`scorecard_updates` rows relies on `ON DELETE CASCADE`;
  wrap multi-statement writes in explicit `BEGIN`/`COMMIT`/`ROLLBACK`.
- The reference app's login uses the `test123`/`12345` credentials but its live backend
  (`{"detail":"Invalid credentials"}` = FastAPI) is NOT the same as this Express backend.
- The `compare` route (`GET /employees/numerology/compare`) MUST be declared BEFORE the
  `/:id/numerology` routes, otherwise "numerology" is captured as `:id` and the compare call 404s.
- `ENABLE_INNER_INTELLIGENCE=true` is read at startup only (module-level `const ENABLED`). It is
  set in the PowerShell session, so re-set it if you restart the backend or the module will 404.
- Use `Start-Process -WindowStyle Hidden node -ArgumentList "server.js"` to run the backend
  in the background (foreground `node server.js` blocks the shell). Start vite with
  `node_modules\.bin\vite.cmd --port 3000 --strictPort` via `Start-Process`.
- Heavy `vite build` can overwhelm the machine — close other programs before building.

## Security Notes

- `JWT_SECRET` falls back to `'dev-secret'` in `server.js` — replace with a real secret in
  production.
- Passwords are stored as bcrypt hashes (seeded via bcrypt in `database.js`).
- Multer accepted/max file size is not limited — add `limits` if exposing to untrusted users.