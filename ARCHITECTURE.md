# Applicant Scorecard — Architecture & Developer Handoff

> Internal tool for a recruiting/staffing agency. Admins rate candidates against **23 weighted parameters** (weights sum to 100%) and bulk-import from Excel; each employee has a read-only view of their own scorecard. Includes an **Inner Intelligence** module (numerology-based reflection, admin-only, feature-flagged).

**Live**: `https://applicant-scorecard-production.up.railway.app`  
**Admin creds**: `test123` / `12345`  
**Deploy**: push to `master` → Railway auto-deploys

---

## Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | React 18 + Vite 5 + Ant Design 6 + react-router-dom 7 |
| Backend | Node.js 24 + Express 4 + SQLite (`node:sqlite` `DatabaseSync`) |
| Auth | JWT (`jsonwebtoken`) + bcryptjs |
| Excel import | `xlsx` (SheetJS) + `multer` 2.x (memory storage) |
| PDF generation | PDFKit |
| Resume parsing | `pdf-parse` + `mammoth` + `word-extractor` |

---

## Repository Layout

```
/
├── backend/
│   ├── server.js                    Express entrypoint, mounts routes, serves SPA
│   ├── database.js                  SQLite schema (11 tables), seeds, makeUsername()
│   ├── scoreUtils.js                weightedPct() and loadScorecard()
│   ├── jdValidation.js              JD upload validation + SHA-256 content-fingerprint dedupe
│   ├── resumeValidation.js          Validates uploads are genuine resumes (not certs/letters)
│   ├── resumeIntegrityAnalyzer.js   10-rule evidence-based resume integrity analysis
│   ├── resumeFlags.js               Legacy capability-based resume flag detection
│   ├── fileTextExtract.js           PDF/DOC/DOCX text extraction
│   ├── capabilityMatch.js           JD-vs-resume capability matching engine
│   ├── autoRate.js                  Auto-generates ratings from capability + numerology
│   ├── numerologyUtils.js           Pure numerology math (life path, birth, personal year)
│   ├── triNatureEngine.js           4-element (Agni/Vayu/Jala/Akasha) analysis
│   ├── overallConclusion.js         Combined score + tri-nature conclusion text
│   ├── suggestionEngine.js          Composite number → suggested ratings
│   ├── resonanceCopy.js             Human-readable resonance lines per parameter
│   ├── parameterThemeMap.js         Maps 23 params → numerology theme numbers
│   ├── numerologyWeights.js         Composite personal number from DOB + name
│   ├── numerologyOutcome.js         Numeric diff → tone/label
│   ├── matchVsRole.js               Numerology vs parameter theme comparison
│   ├── companyAlignment.js          Candidate-vs-company alignment score
│   ├── middleware/auth.js           JWT authenticate + requireRole()
│   ├── routes/
│   │   ├── auth.js                  POST /login
│   │   ├── admin.js                 Parameters, employees, JDs, scorecards, compare
│   │   ├── numerology.js            Inner Intelligence endpoints (gated)
│   │   ├── numerologyPdf.js         PDF report generation
│   │   ├── candidateAnalyze.js      Resume analysis endpoint
│   │   ├── settings.js              Numerology weight config
│   │   └── employee.js              Employee self-service (read-only scorecard)
│   ├── tests/
│   │   ├── jdValidation.test.js     JD validation suite (12 cases)
│   │   ├── resumeValidation.test.js Resume validation suite (21 cases)
│   │   └── qa-audit.test.js         Cross-cutting QA audit (55 cases)
│   └── scorecard.db                 SQLite file (auto-created on first run)
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx                  Router (admin vs employee) + AntD ConfigProvider
│   │   ├── main.jsx                 ReactDOM root
│   │   ├── scoreLabels.js           badge() thresholds + colorFor()
│   │   ├── services/
│   │   │   ├── api.js               Fetch wrapper (Authorization header, JSON + FormData)
│   │   │   └── AuthContext.jsx      JWT + user in localStorage, token expiry check
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx
│   │   │   ├── admin/
│   │   │   │   ├── AdminLayout.jsx       Top navbar (Home, Scores, JDs, Companies, user, Logout)
│   │   │   │   ├── AdminHome.jsx         Marketing landing (hero, stats, features, pricing)
│   │   │   │   ├── ScoresPage.jsx        Employee list, search, Excel import, Add Candidate, Compare
│   │   │   │   ├── ScorePage.jsx         Per-employee score edit (23 Rate fields + weighted total)
│   │   │   │   ├── CapabilityMatchPage.jsx
│   │   │   │   ├── JobDescriptions.jsx
│   │   │   │   ├── CompanyProfiles.jsx
│   │   │   │   ├── SuggestionPanel.jsx
│   │   │   │   └── numerology/            Inner Intelligence UI (12 card components)
│   │   │   └── employee/
│   │   │       └── MyScorecard.jsx        Read-only employee scorecard view
│   │   ├── components/
│   │   │   ├── CompareCandidates.jsx      Side-by-side candidate comparison modal
│   │   │   ├── ResumeIntegrity.jsx        Resume integrity results modal
│   │   │   └── DeltaBar.jsx
│   │   └── styles/app.css
│   ├── vite.config.js               Dev port 3000, proxies /api to VITE_API_URL
│   └── package.json
│
├── package.json                     Root monorepo scripts (build, start)
├── nixpacks.toml                    Railway build config
├── AGENTS.md                        AI agent guidance
└── ARCHITECTURE.md                  This file
```

---

## Database Schema (11 tables)

| Table | Purpose |
|-------|---------|
| `users` | Admins + employees; `role` = `admin`/`employee`; has `date_of_birth`, `resume_text`, `jd_hash`, `capability_match_pct/detail`, `is_favorite`, `is_archived` |
| `parameters` | 23 scoring parameters with `name`, `description`, `weightage` (sum = 100) |
| `scorecards` | One per employee; `applicant_name`, `client`, `position`, `job_description_id` |
| `scores` | Per-parameter scores (1–5) linked to a `scorecard_id` |
| `scorecard_updates` | Audit log of scorecard changes |
| `numerology_archetypes` | 11 seeded archetypes (1–9, 11, 22) with `name`, `summary`, `tags` |
| `numerology_profiles` | Per-employee; PK `(employee_id, dimension)`; `dimension` default `'candidate'` |
| `company_numerology_profiles` | Single org profile (`client_name`, `founded_year`) |
| `job_descriptions` | JDs with `title`, `client`, `description_text`, `jd_hash` (UNIQUE), `file_path` |
| `jd_keywords` | Keywords extracted from JDs, FK to `job_descriptions` |
| `org_settings` | Numerology weight configuration |

---

## API Endpoints

### Auth
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/auth/login` | none | Login → `{ token, user }` |

### Admin — Core
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/parameters` | 23 weighted parameters |
| GET | `/api/admin/employees?search=&filter=` | List candidates + scorecard summary |
| POST | `/api/admin/employees` | Add candidate (name, email, DOB required) |
| GET | `/api/admin/employees/:id/scorecard` | Load scorecard + scores |
| POST | `/api/admin/employees/:id/scorecard` | Create/update scorecard |
| POST | `/api/admin/candidates/compare` | Compare 2–5 candidates side-by-side |
| PATCH | `/api/admin/employees/:id/favorite` | Toggle favorite |
| PATCH | `/api/admin/employees/:id/archive` | Toggle archive |
| DELETE | `/api/admin/employees/:id` | Delete candidate |
| POST | `/api/admin/upload-excel` | Bulk import from Excel |
| POST | `/api/admin/employees/:id/resume` | Upload/replace resume |
| GET | `/api/admin/employees/:id/capability-match` | JD vs resume matching |
| GET | `/api/admin/employees/:id/integrity-check` | Resume integrity analysis |
| POST | `/api/admin/employees/:id/auto-rate` | Auto-rate from resume + numerology |

### Admin — Job Descriptions
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/job-descriptions` | List all JDs |
| GET | `/api/admin/job-descriptions/:id` | Get single JD |
| POST | `/api/admin/job-descriptions` | Create JD (file upload) |
| PUT | `/api/admin/job-descriptions/:id` | Update JD |
| DELETE | `/api/admin/job-descriptions/:id` | Delete JD |
| POST | `/api/admin/job-descriptions/:id/favorite` | Toggle favorite |
| POST | `/api/admin/job-descriptions/:id/archive` | Archive |
| POST | `/api/admin/job-descriptions/:id/restore` | Restore |
| POST/PUT | `/api/admin/job-descriptions/:id/keywords` | Add/replace keywords |
| DELETE | `/api/admin/job-descriptions/:id/keywords/:keywordId` | Remove keyword |
| POST | `/api/admin/job-descriptions/:id/keywords/reset` | Re-extract keywords |

### Admin — Inner Intelligence (numerology)
> All gated by `ENABLE_INNER_INTELLIGENCE=true` env var; admin-only; return 404 when off.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/employees/numerology/compare` | Multi-candidate numerology compare |
| GET | `/api/admin/employees/:id/numerology` | Archetype card + match bars |
| POST | `/api/admin/employees/:id/numerology` | Set DOB → recompute profile |
| GET | `/api/admin/employees/:id/numerology/cycle` | 4-year personal-year timeline |
| GET | `/api/admin/employees/:id/numerology/narrative` | Template narrative |
| GET | `/api/admin/employees/:id/numerology/interview-prep` | 3 prompts (lowest role-fit param) |
| GET | `/api/admin/employees/:id/numerology/numo-params` | Numerology-mapped ratings |
| GET | `/api/admin/employees/:id/numerology/match-vs-role` | Per-param match vs score |
| GET | `/api/admin/employees/:id/numerology/company-match` | Candidate vs company echo |
| GET | `/api/admin/employees/:id/numerology/pdf` | Download PDF report (auth via Bearer) |
| GET | `/api/admin/employees/:id/tri-nature` | 4-element analysis |
| GET | `/api/admin/employees/:id/tri-nature/core-numbers` | Core numerology numbers |
| GET | `/api/admin/employees/:id/overall-conclusion` | Combined conclusion text |
| GET | `/api/admin/employees/:id/suggested-ratings` | Suggested ratings |
| POST | `/api/admin/employees/:id/report` | Full report generation |
| GET | `/api/admin/company-numerology` | Org profile |
| POST | `/api/admin/company-numerology` | Create/update org profile |
| GET/POST/PUT/DELETE | `/api/admin/companies` | Company CRUD |
| GET/PUT | `/api/admin/settings/numerology-weights` | Weight config |

### Employee
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/employee/scorecard` | Current employee's own scorecard (read-only) |

---

## Key Business Logic

### Scoring
- **Weighted %**: `Σ(score/5 × weightage)` — weights sum to 100, result is 0–100
- **Badge thresholds**: ≥80 Excellent (green), ≥60 Good (blue), ≥40 Average (amber), <40 Needs Improvement (red)
- `weightedPct()` is computed at runtime from `scores` table — no DB column stores it

### JD Validation
- Content-fingerprinted via SHA-256 of normalized text (`jd_hash` UNIQUE partial index)
- `validateAndResolveJD()` in `jdValidation.js` — rejects blanks, non-JDs, and exact duplicates (409)

### Resume Validation
- `resumeValidation.js` — 100-point content scoring (contact, summary, education, skills, experience, etc.)
- Confidence ≥ 60 → accept; < 60 → reject (configurable via `RESUME_CONFIDENCE_THRESHOLD`)

### Resume Integrity
- `resumeIntegrityAnalyzer.js` — 10 rules, 4-dimension scoring
- Evidence-based; confidence < 50 not displayed; never labels fraudulent

### Inner Intelligence (numerology)
- Feature-flagged (`ENABLE_INNER_INTELLIGENCE=true`); admin-only
- Server-computed, never client-supplied; template-based narrative (no LLM)
- DOB single source of truth: `users.date_of_birth`; lazily synced to `numerology_profiles`
- **4 elements**: Agni (Fire), Vayu (Air), Jala (Water), Akasha (Ether)
- **25 behavioral parameters** mapped to elements via `triNatureEngine.js`
- **6 categories**: Adaptability, Communication, Analytical, Leadership, Teamwork, Precision
- Disclaimers: "Reflection, not a prediction", "not a hiring signal"

### PDF Report
- PDFKit; auth via `fetch` with Bearer token (not served directly)
- Endpoint: `GET /api/admin/employees/:id/numerology/pdf`
- Badge, radar chart, 4-element doughnut, 6-category grid, strengths/edges bars, behavioral drivers, interview prep, conclusion

### Compare Candidates
- `POST /api/admin/candidates/compare` with `{ candidateIds: [id1, id2, ...] }` (2–5)
- Returns per-candidate: scores (all 23), weighted %, badge, capability match
- UI: checkbox selection on ScoresPage, modal with side-by-side sticky table

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `5000` | HTTP listen port |
| `JWT_SECRET` | `scorecard-secret-key` | JWT signing secret |
| `SQLITE_PATH` | `backend/scorecard.db` | SQLite database path |
| `UPLOADS_DIR` | `backend/uploads` | File upload storage |
| `ENABLE_INNER_INTELLIGENCE` | `false` | Enable numerology module |
| `RESUME_CONFIDENCE_THRESHOLD` | `60` | Min confidence to accept resume |
| `NUMEROLOGY_WEIGHTS` | — | JSON override for weight config |

---

## Commands

| Task | Command | Location |
|------|---------|----------|
| Install all | `npm run install:all` | root |
| Build frontend | `npm run build` | root |
| Run backend | `npm start` | root |
| Dev frontend | `npm run dev` | frontend/ |
| Dev backend | `npm run dev` | backend/ |
| Run tests | `npm test` | backend/ |
| Deploy | `railway up --yes` | root |

---

## Gotchas

- **`node:sqlite`** uses `DatabaseSync` (synchronous API, like better-sqlite3). Do NOT add `better-sqlite3` — native modules fail on this machine.
- **No `db.transaction()`** — wrap multi-statement writes in manual `BEGIN`/`COMMIT`/`ROLLBACK`.
- **`scorecards` has no `weighted_pct` column** — computed at runtime via `weightedPct(scores)`.
- **`users` table column is `name`**, not `applicant_name` (which is on `scorecards`).
- **JWT expiry** checked client-side via `exp` claim in `AuthContext.jsx`.
- **Railway deploys from `master`** — push to master triggers auto-deploy.
- **Frontend build** runs via root `package.json` build script (installs frontend deps, builds Vite, installs backend deps).
- **PDF auth** — endpoint requires `Authorization: Bearer <token>` header; fetch as blob client-side.
- **`ENABLE_INNER_INTELLIGENCE`** — read at module load; re-set if backend restarts.
- **Route ordering** — `/employees/numerology/compare` MUST be declared before `/:id/numerology` in `numerology.js`.
- **PowerShell** — no `&&` chaining, no ternary, no `-Form` in `Invoke-RestMethod`. Use `cmd1; if ($?) { cmd2 }`.

---

## Testing

- **87/87 tests pass** across 3 test files
- `jdValidation.test.js` — 12 JD validation + dedup cases
- `resumeValidation.test.js` — 21 resume validation cases
- `qa-audit.test.js` — 55 cross-cutting QA cases (JD, resume, integrity, fusion)
- Run: `npm test` in backend/
- No linter/typecheck configured; verify with `npm run build` (frontend) and `npm test` (backend)
