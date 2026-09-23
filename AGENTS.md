# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project Overview

**Applicant Scorecard (HUMSEE SCORE)** — an internal tool for a recruiting/staffing agency, rebuilt to
match the reference app at `https://score-card-production-366e.up.railway.app/`. Admins rate
candidates against the **16 SOP parameters** (PERSON/ROLE/DEAL, groups weighted to 100%) and
bulk-import candidates from Excel; each employee has a read-only view of their own scorecard.
Ratings produce a **Pursuit Priority** routing decision (Candidate Fit × Joining Probability)
with gates, a separate Confidence score, and interview focus questions — see "SOP Scoring Model".

There is also a **Behavioral Reflection** module (renamed from Inner Intelligence; numerology-based
"reflection" tool): admin-only, feature-flagged, and it NEVER affects the SOP score or Pursuit
Priority. Every card carries a disclaimer ("Reflection, not a prediction", "not a hiring signal",
"Not used directly in Candidate Fit or Joining Probability").

- **Frontend**: React 18 + Vite 5 + Ant Design 6 + react-router-dom 7 (role-based routing)
- **Backend**: Node.js + Express + SQLite (via built-in `node:sqlite`, NOT `better-sqlite3`)
- **Excel import**: `xlsx` (SheetJS, pure-JS) + `multer` 2.x (memory storage) — both pure-JS,
  they compile fine on this machine (unlike native modules).

## Repository Layout

```
backend/
  server.js              Express entrypoint; mounts /api/auth, /api/admin, /api/employee
  database.js            SQLite schema + seeds (16 SOP params + legacy 23, users, numerology tables); exports db, makeUsername()
  scoreUtils.js          SOP engine (groupScore, fit, joining, priority, gates, confidence, focus) + legacy weightedPct()/loadScorecard()
  sopAutoRate.js         Evidence-based auto-rater (deterministic; PERSON rules + ROLE 111-113 formulas; per-param evidence/gaps/confidence)
  jdValidation.js        Strict JD upload validation + content-fingerprint (SHA-256) dedupe service
  numerologyUtils.js     Pure numerology math + PERSONAL_YEAR_THEMES map (no DB access)
  tests/                 jdValidation.test.js — 12-case JD validation/dedupe suite (`npm test`)
  routes/
    auth.js              POST /login -> { token, user }
    admin.js             parameters, employees, employees/:id/scorecard, upload-excel (role=admin)
    numerology.js        Inner Intelligence endpoints (gated + admin-only)
    approvals.js         Panel-based approval workflow (Admin Approval & Decision)
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
    components/
      ApprovalPanelSection.jsx  Approval & Decision card (panel workflows) on the scorecard page
    pages/
      LoginPage.jsx
      admin/
        AdminLayout.jsx  top navbar (Home, Scores, user, Logout)
        AdminHome.jsx    marketing landing (hero, stats, features, pricing)
        ScoresPage.jsx   employee scorecard list, search, Excel import, Add Candidate
        ScorePage.jsx    per-employee 16-param SOP score form (0-100 + N/A, DEAL factors, Pursuit Priority card)
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
- **Scoring params**: **16 SOP parameters** seeded server-side (ids 101–116, PERSON/ROLE/DEAL,
  group weights summing to 100). The legacy **23 parameters** remain in the DB marked
  `status='legacy'` (read-only). `POST /employees/:id/scorecard` replaces only active-param rows —
  legacy score rows are preserved and excluded from the SOP engine.
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

## SOP Scoring Model (16-param PERSON/ROLE/DEAL — supersedes weighted 1-5)

- **Parameters** (seeded in `database.js`, ids 101–116, weights sum to 100 per group):
  PERSON (10): 101 Communication & Influence 12 · 102 Problem Solving & Analytical Thinking 14 ·
  103 Judgment & Decision-Making 12 · 104 Collaboration & Teamwork 10 · 105 Adaptability 10 ·
  106 Initiative & Drive 10 · 107 Learning & Growth 8 · 108 Leadership Potential 8 ·
  109 Reliability & Professionalism 8 · 110 Values & Work-Environment Alignment 8.
  ROLE (3): 111 Technical/Role Competence 50 · 112 Experience & Industry Relevance 30 ·
  113 Qualifications & Certifications 20 (may be N/A).
  DEAL (3): 114 Motivation & Role Intent 40 · 115 Availability & Joining Readiness 40 ·
  116 Compensation Alignment 20.
  Legacy 23 params are marked `status='legacy'` (read-only); their `scores` rows are preserved
  (POST scorecard deletes only `status='active'` rows; the migration never rebuilds `scores` once it
  has a `status` column). Rebuild needed → delete `scorecard.db`.
- **Scores are 0-100** with `status` in active/na/not_scored. N/A and not_scored params are EXCLUDED
  (remaining weights renormalize) — never a zero-penalty. `POST /employees/:id/scorecard` body:
  `{ applicant_name, email, client, position, scores: [{parameter_id, score(0-100|null), status}], deal_factors: [{factor_key, score, note?}] }`.
- **Engine** (`backend/scoreUtils.js` + `backend/decisionService.js`): `groupScore` (weighted mean of
  a group), Candidate Fit = PERSON×0.35 + ROLE×0.40 + JD_MATCH×0.25 (missing parts dropped,
  renormalized; JD match = `users.capability_match_pct`), Joining Probability = weighted mean of 8
  DEAL factors (`deal_factor_scores`: active_search 15, career_motive 15, engagement 10, counter_offer
  15, timeline 15, worklife 10, dropout 10, compensation 10), Pursuit Priority = Fit×0.60 + Join×0.40.
- **Routing bands**: ≥80 PRIORITY INTERVIEW · 65–79 INTERVIEW · 50–64 VERIFY BEFORE INTERVIEW ·
  <50 HOLD/DISENGAGE/NURTURE. **Gates** (order 1→4, first match overrides the band): 
  CRITICAL_VALIDATION_REQUIRED (missing mandatory JD reqs — blocks Priority Interview),
  VERIFY_BEFORE_INTERVIEW (role<50), RESOLVE_JOINING_RISKS (join 35–49), HOLD_DISENGAGE_NURTURE
  (join<35).
- **Confidence** (informational only, never alters fit/join/priority): jd 15 + resume 15 + mandatory
  resolved 20 + ≥80% activated params scored 25 + recruiter evidence 15 + references 10 →
  ≥80 High / ≥60 Moderate / else Limited Evidence.
- **Interview Focus** (max 3, `interview_focus` in snapshot): gate issues rank first, then lowest
  scored active area (<65), then behavioral signals — each with 2–3 questions. Cleared when the
  interview is scheduled.
- **Persistence + list**: every decision is upserted into `scoring_snapshots` (raw+display, bands,
  `gate_flags`, `candidate_fit`, `joining_probability`, `confidence_evidence`, `deal_factors`,
  `interview_focus`, `rules_version='sop-1.0'`). `GET /employees` rows carry `pursuit_priority`,
  `candidate_fit`, `joining_probability`, `confidence_score`, `person_score/role_score/deal_score`,
  `final_decision`, `base_band` (with `weighted_pct` back-filled = pursuit display for old sort/filter
  compat).
- **Auto-rate** (`backend/sopAutoRate.js` `autoRateSopParameters`): deterministic evidence engine for the
  PERSON/ROLE params only — DEAL params 114–116 are always recruiter-rated (engine never returns them).
  Uses `capabilityMatch` extraction; PARAM values are 4-tier buckets (no randomness, no "default 50"):
  - PERSON 101–110: per-rule term lists + action-verb tiers (strong/moderate/weak → 40–86, JD alignment
    +6, JD-requires-but-silent → 35); weak-only evidence carries a "confirm via interview" gap.
  - ROLE 111 (`Σ(skill_depth × importance)/Σ(importance)`): required technical/tool skills from the JD,
    importance 3 (strong-hint) / 2 (required) / 1 (preferred); per-skill depth ladder none=0 / mention=25 /
    project=60 / course=40 / work=80 / strong+=90–95; missing required skill = a named gap and 0 in the
    weighted mean; JD with no skill requirements → `not_scored`.
  - ROLE 112: `35% role similarity + 25% responsibility + 20% industry + 10% seniority + 10% recency`;
    no JD role/resp/domain reqs or no resume experience evidence → `not_scored`.
  - ROLE 113: baseline(55 edu / 40 no-edu) + requiredEdu(+25/+12 partial/−15 missing) + requiredCert
    (+15 each) − missingCert (−25 each) + preferred (+4 each); JD silent on quals → `not_scored` (recruiter
    marks N/A).
  - Every result carries `score(0-100|null)`, `status(active|not_scored)`, `confidence(0-1|null)`,
    `evidence[]`, `gaps[]`, and a `detail` object showing the exact formula/inputs for auditability.
  Wired at `routes/admin.js` Add Candidate (~:573) and POST /auto-rate (~:698) — scores go to `scores`
  (0-100, status) and each auto score row is persisted to `parameter_evidence` (score REAL, confidence,
  `evidence_items` JSON incl. `{source:'gap',type:'gap'}` items, reason, jd_match_pct). `autoRate.js`
  (`autoRateSopParameters`) remains as a keyword-ratio fallback (`legacyAutoRateSopParameters`).
- **Frontend mirror**: `frontend/src/sopModel.js` replicates the math for instant live preview on
  ScorePage (Pursuit card, group scores, gates, confidence, DEAL factors). `decisionColors` map serves
  band colors. Keep it in sync with `scoreUtils.js` if rules change.
- **Tests**: `backend/tests/scoringModel.test.js` (17 cases SOP-P1…P9, C1/C2, F1/F2, D1, DB1–DB3) —
  in-memory DB harness via `withDb` (stub `database` + watch the readSnapshot double-parse gotcha).
  `backend/tests/sopAutoRate.test.js` (sopA-01…sopA-13) — pure-module tests for the evidence engine
  (determinism, 13-param invariant, formulas, gaps, confidence bounds).

## API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/auth/login` | none | Login -> `{token, user}` |
| GET | `/api/admin/parameters` | admin | Active SOP parameters (16: PERSON/ROLE/DEAL, `status`/`grp` fields) |
| GET | `/api/admin/employees?search=` | admin | List candidates + summary (`pursuit_priority`, `candidate_fit`, `joining_probability`, `confidence_score`, group scores, `final_decision`, `base_band`) |
| POST | `/api/admin/employees` | admin | Add a candidate `{name, email, date_of_birth}` (DOB required, YYYY-MM-DD); auto-rates the 16 SOP params when JD+resume supplied |
| GET | `/api/admin/employees/:id/scorecard` | admin | Scorecard + scores + `decision` + `deal_factors` |
| POST | `/api/admin/employees/:id/scorecard` | admin | Create/update scorecard `{scores:[{parameter_id, score(0-100|null), status}], deal_factors:[{factor_key, score, note?}]}` → returns recomputed decision |
| GET | `/api/admin/employees/:id/integrity-check` | admin | Check resume integrity against 9 predefined rules |
| POST | `/api/admin/employees/:id/auto-rate` | admin | Auto-rate the 16 SOP PERSON/ROLE params from JD+resume (0-100, editable) |
| POST | `/api/admin/upload-excel` | admin | Bulk import candidates (multipart `file`, .xlsx/.xls) |
| GET | `/api/employee/scorecard` | employee | Current employee's own scorecard (read-only, incl. decision) |

Behavioral Reflection (was Inner Intelligence; all admin-only and gated by `ENABLE_INNER_INTELLIGENCE=true` — 404 when off):

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

## Default Credentials (from `security.js` + env)

- Passwords come from Railway env `ADMIN_PASSWORD` / `EMPLOYEE_PASSWORD` when set.
- Local/dev fallbacks (no env): admin `test123` / `Humsee!Admin_2026`;
  employees / new candidates / Excel import → `Humsee!Employee_2026`.
- Employee usernames from `makeUsername()` = first letter of first name + last name,
  lowercase (e.g. local seed `hkhan`, `agonzales`, `tsaba`; production candidates follow the
  same rule — `hkhan` only exists if the DB was freshly seeded).
- Production (verified): admin `test123` + Railway `ADMIN_PASSWORD`;
  employee e.g. `tsharma` + Railway `EMPLOYEE_PASSWORD` → login 200 + scorecard 200.
- On startup, any user whose hash still matches a weak plaintext (`12345`,
  `rishasinha`, `password`, `admin`, `test123`) is rotated to the role default.

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

## Resume Integrity Analyzer

Added feature: admin-only integrity check for candidate resumes.

- **Backend**: `backend/resumeIntegrityAnalyzer.js` — 9 predefined rules (unclear dates, overlapping timelines, contradictions, selective history, designation mismatch, inflated experience, keyword stuffing, unverifiable details, concealment)
- **API**: `GET /api/admin/employees/:id/integrity-check` — returns `{ integrityStatus, detectedFlags[] }` with evidence-based flags (confidence ≥ 60 only)
- **Frontend**: `frontend/src/components/ResumeIntegrity.jsx` — displays integrity results in a modal
- **UI**: "Integrity" button added to ScoresPage table Action column; click opens integrity modal
- Every flag includes `evidence` (quoted fragments from the resume), `sourceSections`, `severity`, and `confidence`
- No flags are fabricated — detection requires concrete evidence in the resume text
- `resumeFlags.js` (legacy capability-based flags) remains separate from `resumeIntegrityAnalyzer.js`

## Approval & Decision (panel workflows)

Added feature: admin-only panel-based approval workflow on the candidate scorecard
(`frontend/src/components/ApprovalPanelSection.jsx` + `backend/routes/approvals.js`).

- **Data model** (4 tables in `database.js`):
  - `approval_workflows` — one active per candidate (`candidate_id`, `approval_type` single|panel,
    `status` pending|approved|rejected|hold|escalated, `completed_at`). Any workflow with
    `completed_at IS NULL` is "active"; `getActiveWorkflow()` keys on that, NOT on status.
  - `approval_panels` — stages of a workflow (`workflow_id`, `panel_name`, `rule_type`
    any_one|all|majority|custom, `required_approvals`, `status` awaiting|approved|rejected|hold,
    `sent_at`, `completed_at`). "Send to another panel" = new panel row in the same workflow.
  - `approval_members` — per-panel reviewers (`user_id` must be role `admin`, `UNIQUE(panel_id,user_id)`,
    `decision` approve|reject|hold, `comment`, `reviewed_at`). Opinions are individual and never
    overwritten by the system.
  - `approval_history` — audit trail (`workflow_id`, `panel_id`, `action`, `detail`, `performed_by`).
- **Rule evaluation** (`evaluateRule`): any_one ≥1 approve; all = everyone approves / any reject;
  majority > half; custom n-of-m (approved when approve ≥ n; rejected when reject > total−n).
  If every member has voted with no rejection and the rule is unmet → panel `hold`. Only finalize()
  sets the workflow terminal status — an approved panel just passes to the next stage (`pending`),
  a rejected panel hard-stops the flow (`rejected`, still finalizable so the rejection email is made).
- **Permissions**: only a member assigned to a panel may submit their opinion (403 otherwise) — each
  reviewer logs in with their own admin account (works with any-Google-email-is-admin). Resolved
  panels reject new members/reviews with 409.
- **Finalize** (`POST /approvals/:candidateId/finalize`) reuses `buildEmailDraft` from `decisions.js`
  to create an approved/rejected `candidate_decisions` row + `candidate_emails` draft (stale drafts
  replaced), and stamps `completed_at` so it can't run twice.
- **Endpoints** (all under `/api/admin`, admin-guarded):
  | Method | Path | Purpose |
  |--------|------|---------|
  | GET | `/employees/:id/approval` | Workflow + panels (with members) + history for a candidate |
  | GET | `/approvals/admins` | Admin users for the member picker |
  | POST | `/approvals/workflows` | Create workflow + first panel `{candidate_id, approval_type, panel_name?, rule_type?, required_approvals?, deadline?, members?}` |
  | POST | `/approvals/panels` | Send to another panel (next stage) |
  | POST | `/approvals/panels/:id/members` | Add a member to an awaiting panel |
  | POST | `/approvals/panels/:id/send` | Mark an awaiting panel "sent for review" |
  | POST | `/approvals/panels/:id/restart` | Re-open a `hold` panel |
  | POST | `/approvals/panels/:id/review` | Member opinion `{decision, comment}` (member-only) |
  | POST | `/approvals/:candidateId/finalize` | Confirm final decision + create email draft |
- **Tests**: `backend/tests/approvals.test.js` (AP1–AP13) — in-memory DB harness mirrors
  `decisionCenter.test.js` (`withApi` stubs `database` + `middleware/auth`; per-request `setUser`).
  Do not call `.get(1)`/`.all(...)` on queries without placeholders — `node:sqlite` throws
  "column index out of range".

## Security Notes

- **JWT secret** is resolved by `backend/security.js` `jwtSecret()`: prefers `JWT_SECRET` env (≥16 chars);
  otherwise persists a strong random secret to `/data/.jwt-secret` (Railway volume) or `backend/.jwt-secret`.
  Falls back to `'scorecard-secret-key'` only if no file can be written (logs a warning). Gmail token
  encryption uses the same resolver.
- **Rate limiting** (`security.js` `rateLimit`): `POST /api/auth/login` = 10 req/15 min/IP;
  `POST /api/auth/google` = 30 req/15 min/IP → HTTP 429.
- **CORS** allowlist via `CORS_ORIGINS` (default `https://www.humsee.works`, `https://humsee.works`,
  `http://localhost:3000`, `http://127.0.0.1:3000`). No-Origin requests (curl, server-to-server) allowed.
- **Helmet** security headers on (`contentSecurityPolicy: false` — Ant Design inline styles).
- **JSON body limit** 1MB. **Excel upload** 5MB + `.xlsx/.xls` only; docs already 10MB + PDF/DOC/DOCX.
- Passwords are stored as bcrypt hashes; weak demo passwords are rotated on startup
  via `security.js` `isWeakPassword()` + `defaultAdminPassword()` / `defaultEmployeePassword()`.
- Prefer Railway env `ADMIN_PASSWORD` / `EMPLOYEE_PASSWORD` in production (local fallbacks in `security.js`).
- No helmet/CSP for the SPA yet beyond base headers; no account lockout / password-reset flows.

### Produced secure-auth foundation (2026-09-23)

- **Organizations / tenancy**: `organizations` table + `users.organization_id` (FK). Default org
  `HUMSEE`/slug `humsee` is seeded and existing users backfilled on startup; Add Candidate binds
  new candidates to the default org. JWT (`signToken` in `routes/auth.js`) carries
  `organization_id` + `status` so every session is tenant-bound and revocable at next login.
  Org scoping on the admin employee list and scorecard GET/POST (`u.organization_id = req.user.organization_id`);
  org mismatch on scorecard routes returns **404** (never 403) to avoid existence leaks.
- **Suspended accounts**: `users.status` ∈ `active|suspended`. Password/Google login checks it →
  HTTP 403 "This account has been suspended..." and records `login_blocked_suspended`.
  (An admin user-management panel with suspend/reactivate lives in `routes/adminPanel.js`.)
- **Audit logging**: `audit_logs` table + `backend/audit.js` `logAudit({performedBy, action, targetType, targetId, detail, req, module, username})` —
  best-effort, never throws (safe on mocks without the table). Wired actions: `login`, `login_failed`,
  `login_blocked_suspended`, `google_signup`, `google_promote_admin`, `candidate_created`,
  `scorecard_updated`, plus admin-panel actions. Read back via `GET /api/admin/audit-logs`
  (`?action=`, latest 500). Columns: `performed_by, user_id, username, action, target_type, target_id, module, detail, ip, created_at`.
- **MFA-ready user columns**: `auth_provider` (`local|google`) and `last_login_at` (set on every
  successful login via `touchLastLogin`). No TOTP/2FA yet — roadmap only.
- **Google allowlist**: `ADMIN_ALLOWED_EMAILS` env (comma-separated) gates which verified Google
  emails may log in as admin. When unset, the app logs a warning and treats every verified email as
  admin (local/dev default). Google sign-up users get `auth_provider='google'` + default org; an
  existing employee elevated to admin on Google login is recorded as `google_promote_admin`.
- **Login page** (`frontend/src/pages/LoginPage.jsx`): "Sign in to your organization account"; no
  public signup or email-reset — password resets are "contact your administrator".
- **Tests**: `firebaseAuth.test.js` FA4 (google provisioning sets org/provider/last_login),
  FA11/FA12 (allowlist 403 vs 200), FA13 (password login writes audit + last_login and blocks
  suspended users with 403 + audit). The test harness (`withApi`) deletes the `audit` module from
  the require cache too, and `seededDb()` mirrors the updated `users`/`audit_logs`/`organizations` schema.
- **Roadmap (NOT built)**: MFA/TOTP, real multi-org RBAC (org-scoped queries exist; full RLS per
  tenant is out of scope), domain-gated Google SSO, httpOnly-cookie sessions, scheduled DB backups.

## Launch / Branding (Humsee Score)

- **Public URL**: `https://www.humsee.works` (Railway custom domain) → proxies to the Railway
  service (`applicant-scorecard`). Railway volume `applicant-scorecard-volume` is mounted.
  Deploy with `railway up --yes` from the repo root (Railway CLI is installed and logged in).
- **Rebrand**: "Applicant Scorecard" is branded as **HUMSEE SCORE** in `frontend/index.html`
  title/favicon, `AdminLayout` nav-brand, `LoginPage` title, and `AdminHome` footer.
- **Logo**: `frontend/public/humsee-logo.png` (login + navbar mark) and `frontend/public/logo.png`
  (square favicon). The UI renders these with a fallback until the files exist — add them with no
  code change, then rebuild (`npm run build` in `frontend/`) and redeploy. Never redesign/replace
  the logged-in user-provided logo; use it verbatim.
- **GoDaddy**: domain `humsee.works` on the account for `manish@ishrpeople.com` (also holds `ishr.com`,
  `ishrpeople.in`, `101quiet.work`). DNS pushed via GoDaddy API with a Bearer PAT (secret — never
  commit/re-paste). The forwarding WRITE API (`/v2/customers/{customerId}/domains/forwards/{fqdn}`)
  is gone — apex forwarding was set in the GoDaddy console (Domain Settings → Forwarding):
  `humsee.works` → `https://www.humsee.works`, Permanent (301). Verified live (301 + Location header).
- **User directive (hard constraint)**: DO NOT TOUCH the numerology *logic*/engine (`numerologyUtils.js`,
  `triNatureEngine.js`, `numerology_routes`, numerology tables, seeds). No removal plans, no changes.
  Previous "remove numerology before selling" decisions are cancelled.
- **SOP supersedes the schema freeze (2026-09-22)**: per the HUMSEE Developer Implementation SOP (v1.0),
  the *scoring* schema was REWORKED — 23 parameters → **16 SOP parameters** (ids 101–116: 10 PERSON /
  3 ROLE / 3 DEAL), `scores` now 0–100 with `status` (active/na/not_scored), two new tables
  (`scoring_snapshots`, `deal_factor_scores`). The legacy 23 parameters are marked `status='legacy'`
  (read-only) and their old score rows are preserved. Inner Intelligence is **relabelled
  "Behavioral Reflection"** in the UI (labels only — logic untouched) and its categories renamed per
  SOP §8 (Attitude→Interaction Style, Unmasked→Work Character, Soul Urge→Inner Drivers,
  Masked→Pressure Traits). It is never used directly in Candidate Fit or Joining Probability.