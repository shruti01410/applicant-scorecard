# Security & Trust — HUMSEE SCORE

Working notes for enterprise security review. **Not a public marketing page.**
Certification claims (SOC 2 / ISO 27001) must not appear until controls + audit
are actually in place.

Proposed multi-company model + data-preservation requirements:
[`MULTI_COMPANY_SECURITY_MODEL.md`](MULTI_COMPANY_SECURITY_MODEL.md) — **awaiting approval;
nothing in that document is implemented yet.** Its §0 requirement (existing production
users/admin/candidates must survive migration, verified by pre/post counts + backup) is
non-negotiable for any tenancy work.

## Architecture (current)

| Layer | Implementation |
|-------|----------------|
| Transport | HTTPS via Railway + `www.humsee.works` (apex 301 → www) |
| Headers | `helmet` (X-Frame-Options, nosniff, HSTS, referrer-policy) |
| CORS | Allowlist `CORS_ORIGINS` (default humsee.works + localhost:3000) |
| AuthN | JWT Bearer (1d) + bcrypt password hashes; optional Firebase Google; optional TOTP MFA (`backend/mfa.js`, pure crypto) |
| AuthZ | Role (`admin`/`employee`) + permission matrix (`role_permissions`) |
| Rate limit | Login 10/15min/IP; Google login 30/15min/IP → 429 |
| Secrets | `JWT_SECRET`, `ADMIN_PASSWORD`, `EMPLOYEE_PASSWORD`, `GMAIL_TOKEN_KEY` from Railway env; no secrets in git |
| DB | SQLite file on Railway volume (`/data`); file perms on `.jwt-secret` |
| Audit | `audit_logs` (login, failed login, candidate create, scorecard update, admin panel actions) |
| Tenancy | `organizations` + `users.organization_id` (default `humsee`) — ready for RLS later |

## Permission model

Permissions live in `role_permissions` (seeded from `analyticsDb.ROLE_DEFAULT_PERMISSIONS`).
Examples: `users.manage`, `scorecard.manage`, `audit.view`, `roles.manage`, `settings.manage`.

Middleware: `requirePermission('…')` in `backend/middleware/auth.js`.
Admin panel routes under `/api/admin/panel` use it for mutating operations.

## Audit events (minimum)

- `login`, `login_failed`, `login_blocked_suspended`
- `candidate_created`, `scorecard_updated`
- Panel: `changed_role`, `suspended_user`, `updated_role_permissions`, settings changes

Do **not** put raw resume text or full candidate PII in `detail` beyond ids/emails needed for investigation.

## Data handling

- Resumes/JDs: local `backend/uploads` (Railway volume). Authorize every download in the app layer.
- Passwords: bcrypt. Weak demo passwords rotated on startup to env defaults.
- Gmail tokens: encrypted at rest via `GMAIL_TOKEN_KEY` (`gmailService.js`).
- Behavioral Reflection / numerology: admin-only, feature-flagged, never a hiring signal.

## Gaps before “enterprise ready”

| Item | Status |
|------|--------|
| Multi-tenant isolation (RLS / per-tenant queries) | Schema only (`organization_id`); not enforced per request |
| MFA / SSO (SAML/OIDC) / SCIM | TOTP MFA implemented (`/api/auth/mfa/*`, admin-only self-service UI); SSO/SCIM not implemented |
| Password reset / account lockout | Not implemented (rate limit only); role/suspend admin UI shipped (`/users`) |
| Object storage (S3) for files | Still volume filesystem |
| Encrypted backups / DR (RPO/RTO) | Railway volume only — not tested |
| HA / multi-instance | Single process |
| Data export / deletion per tenant | Not implemented |
| External AI training policy | N/A if no external LLM; document when added |
| Pen test / SAST / DAST / dependency scan | Not run |
| Security questionnaire / DPA / privacy policy | Not drafted |

## Dependency inventory (data leaving the app)

| Component | Purpose | Data |
|-----------|---------|------|
| Railway | Host + volume | Full app + DB |
| Google Firebase Auth | Optional Google login | Google identity (email) |
| Gmail API | Optional draft emails | Candidate email addresses |
| GoDaddy | DNS | N/A |

## Incident response (draft)

1. Rotate `JWT_SECRET`, `ADMIN_PASSWORD`, `EMPLOYEE_PASSWORD`, `GMAIL_TOKEN_KEY`.
2. Force logout (secret rotation invalidates tokens).
3. Review `audit_logs` for failed logins / privilege changes.
4. Snapshot SQLite volume before any destructive repair.

## Postgres migration (when triggered)

Triggers: multiple customer orgs, concurrent writers, read replicas, formal backup/replication.
Path: driver abstraction in `backend/db/driver.js` (`DB_DRIVER=postgres` + `DATABASE_URL` +
`pg` lazy-loaded); keep repositories (`backend/repositories/`), flip them to `await` first,
then add RLS on `organization_id`. See `backend/migrations/README.md` for the checklist.
