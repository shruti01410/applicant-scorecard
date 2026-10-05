# HUMSEE Score — Multi-Company Platform, Access & Data Security Model

Status: **PROPOSAL — NOT IMPLEMENTED.** Awaiting approval before any code/schema change.
Companion notes: [`SECURITY.md`](SECURITY.md), [`ARCHITECTURE.md`](ARCHITECTURE.md),
[`backend/migrations/README.md`](backend/migrations/README.md).

---

## 0. NON-NEGOTIABLE REQUIREMENT — Existing Production Data & Accounts

> **Existing Production Data & Accounts — All existing production users, usernames/emails,
> Admin accounts, candidates, resumes, JDs, scorecards, evaluations, approvals, and related
> database records must be preserved during implementation. No destructive database reset,
> replacement, or data deletion is permitted. After migration, the existing Admin credentials
> must continue to work and the Admin must retain access to all existing data belonging to the
> organization. A verified database backup and post-migration data-count/account verification
> must be completed before enabling the new security model.**

Acceptance criteria:

- Existing **candidate data must remain**.
- Existing **usernames/emails/accounts must remain**.
- Existing **Admin account and credentials must continue to work**.
- Existing Admin login must still show the **existing candidates and related data**.
- No existing records should be deleted, reset, overwritten, or replaced during the migration.
- Existing users should not be forced to create new accounts unless specifically required.
- New company/user isolation should be added **around the existing data**, not by recreating
  the database.

Safe migration sequence:

```text
CURRENT PRODUCTION DATABASE
        ↓
FULL BACKUP
        ↓
ADD company_id / ownership / permissions
        ↓
MAP EXISTING USERS → EXISTING COMPANY
        ↓
MAP EXISTING DATA → EXISTING COMPANY + ADMIN
        ↓
VERIFY COUNTS + USERS + ADMIN LOGIN
        ↓
ENABLE SECURITY RULES
        ↓
TEST
```

After migration the existing Admin must still see:

```text
Existing Admin
   │
   ├── Existing Candidate 1
   ├── Existing Candidate 2
   ├── Existing Candidate 3
   ├── Existing JDs
   ├── Existing Scorecards
   └── Existing records
```

The security implementation must not cause these records or the Admin account to disappear.

### Baseline capture (do this BEFORE any migration)

Use the read-only helper (opens the DB with `readOnly: true`, prints every table count,
role/status totals, org list, admin accounts, and a SHA-256 of the file):

```bash
# local dev DB
node backend/scripts/baselineCounts.js

# production DB (inside the Railway container / web console)
node backend/scripts/baselineCounts.js /data/scorecard.db
```

Save the output as `baseline-before.txt`. Repeat after migration as
`baseline-after.txt` — the two must match exactly (except rows intentionally added).

Equivalent manual queries (read-only):

```sql
SELECT 'users'              AS tbl, COUNT(*) FROM users
UNION ALL SELECT 'organizations',       COUNT(*) FROM organizations
UNION ALL SELECT 'candidates/users(role=employee)', COUNT(*) FROM users WHERE role = 'employee'
UNION ALL SELECT 'scorecards',          COUNT(*) FROM scorecards
UNION ALL SELECT 'scores',              COUNT(*) FROM scores
UNION ALL SELECT 'scoring_snapshots',   COUNT(*) FROM scoring_snapshots
UNION ALL SELECT 'deal_factor_scores',  COUNT(*) FROM deal_factor_scores
UNION ALL SELECT 'job_descriptions',    COUNT(*) FROM job_descriptions
UNION ALL SELECT 'approval_workflows',  COUNT(*) FROM approval_workflows
UNION ALL SELECT 'approval_panels',     COUNT(*) FROM approval_panels
UNION ALL SELECT 'approval_members',    COUNT(*) FROM approval_members
UNION ALL SELECT 'candidate_decisions', COUNT(*) FROM candidate_decisions
UNION ALL SELECT 'audit_logs',          COUNT(*) FROM audit_logs;

-- admin must still exist, active, and resolvable
SELECT id, username, email, role, status, organization_id FROM users WHERE role = 'admin';
```

Verification gate (all must pass before security rules are enabled):

1. Full backup restored successfully in a scratch environment.
2. Every table count above is **identical** pre/post migration.
3. Existing Admin username/email logs in with unchanged credentials.
4. Existing Admin sees all pre-existing candidates, JDs, scorecards, approvals.
5. No `DELETE`, `DROP`, `TRUNCATE`, or `UPDATE` outside the additive column mapping.

---

## 1. Objective

The HUMSEE Score platform should support multiple companies/organizations using the same
application while ensuring complete separation of their data.

Each company must have its own secure organizational environment containing its users,
candidates, resumes, JDs, scorecards, evaluations, approvals, reports, and other business data.

A user from one company must never be able to access another company's data unless explicitly
authorized at the platform level.

---

## 2. High-Level Architecture

HUMSEE Score will follow a multi-tenant architecture:

```text
HUMSEE SCORE PLATFORM
│
├── Company A
│   ├── Company Admins
│   ├── HR / Recruiters
│   ├── Analysts
│   ├── Other Employees
│   └── Company A Data
│
├── Company B
│   ├── Company Admins
│   ├── HR / Recruiters
│   ├── Analysts
│   ├── Other Employees
│   └── Company B Data
│
└── Company C
    ├── Company Admins
    ├── HR / Recruiters
    ├── Analysts
    ├── Other Employees
    └── Company C Data
```

The same HUMSEE application can serve multiple organizations, but each organization's data
remains logically isolated.

---

## 3. Organization / Company

Each customer organization should have a unique `company_id` / `organization_id`.

Every business record should be associated with the appropriate company. Examples: candidates,
resumes, job descriptions, scorecards, SOP evaluations, approvals, decisions, interview
information, reports, lead/customer information, uploaded files.

```text
Candidate
 ├── candidate_id
 ├── company_id
 ├── created_by
 └── candidate_data
```

The `company_id` becomes the primary data-isolation boundary.

---

## 4. User & Credential Model

Every employee should have an individual account. Shared usernames/passwords should not be used.

```text
Company A

Admin 1 → admin1@companyA.com
Admin 2 → admin2@companyA.com
HR      → hr@companyA.com
Analyst → analyst@companyA.com
```

Each account should have: unique user ID, company ID, role, permissions, account status,
authentication method, audit history.

Existing Firebase authentication and JWT-based sessions can be used as the authentication
foundation.

---

## 5. Roles

### Company Admin

Full access to data belonging to their own company: view/create/edit candidates, archive per
policy, view scorecards, manage JDs, manage approvals, create employees, assign roles and
permissions, share candidate records, suspend employees, view company audit logs, manage
company-level settings.

A Company Admin must NOT automatically have access to another company's data.

### HR / Recruiter

Create candidates, view authorized candidates, update candidate information, upload resumes,
add/manage JDs, view scorecards, participate in approval workflows — controlled by the
company's permission policy.

### Analyst

View assigned/authorized candidates, perform analysis, view relevant scorecards, access
approved analytical information, generate permitted reports. No automatic admin permissions.

### Other Employees

Access customized according to role and business requirements.

---

## 6. Multiple Company Admins

A company can have multiple administrators.

```text
Company A
│
├── Priya → Admin
├── Rahul → Admin
├── Neha → HR
└── Amit → Analyst
```

Each administrator has their own login. Admin actions must be recorded individually in the
audit log (`Priya added Rahul as an Admin.`, `Rahul shared Candidate #104 with Neha.`,
`Priya suspended Amit's account.`).

---

## 7. Employee Creation & Access Management

```text
Admin Panel → Users & Access → Add Employee → Name + Email + Role + Permissions → Send Invitation
```

The invited employee creates or activates their own credentials. The Company Admin can add
users, change roles/permissions, suspend, reactivate, remove access, and assign candidate
access — only under their own organization.

---

## 8. Candidate-Level Access

Company-level and candidate-level access are separate. Sharing is explicit:

```text
Candidate 102 → Share / Assign → Select Employee → Select Permission → Save
```

Possible permissions: Viewer, Editor, Analyst, Approver.

---

## 9. Company Data Isolation

> A user can access only data belonging to their organization and permitted by their
> role/permissions.

```text
Company A User → Company A ID → Authorization Check → Company A Records
Company A User → Company B Record → Authorization Check → ACCESS DENIED
```

This check must happen in the backend/database layer. The frontend must never be responsible
for security by simply hiding records.

---

## 10. Multiple Domains

Different customer organizations may use different email domains (`@companyA.com`, …). Domain
information may support onboarding and invitation policies, but email domain alone must NOT be
the authorization mechanism. The authenticated user's organization comes from the trusted
user/company mapping maintained by the backend.

---

## 11. Authentication & Authorization

Authentication: "Who is this user?" · Authorization: "What is this user allowed to access?"

```text
Firebase Authentication → Verified User ID → Company / Organization ID → Role
        → Permissions → Record-level access check → Database
```

The backend must not trust a `company_id` or `user_id` supplied by the frontend.

---

## 12. Database Security

Every important database operation should verify:

1. User is authenticated.
2. User account is active.
3. User belongs to the organization.
4. User has the required permission.
5. Requested record belongs to the same organization.
6. User has access to that specific record where record-level permissions apply.

Applies to: read, create, update, delete/archive, share, export, download, reports, APIs.

---

## 13. Existing Data Preservation

See the non-negotiable requirement in **§0**. Restated flow:

```text
Current Production Database
        ↓
Verified Full Backup
        ↓
Schema Migration
        ↓
Assign Existing Records to Correct Organization
        ↓
Assign Existing Records to Existing Admin
        ↓
Verify Data
        ↓
Enable New Security Rules
```

No destructive database reset or replacement. Existing candidates, JDs, resumes, scorecards,
evaluations, approvals, users, and other production records must remain available after
migration.

---

## 14. Admin Access to Existing Data

```text
Existing HUMSEE Data → Company A → Company A Admin → Full access to existing Company A data
```

Introducing the new security model must not make existing production data disappear or become
inaccessible.

---

## 15. Audit Logging

Record: user login, user creation, role change, permission change, candidate creation, candidate
access, candidate sharing, candidate update, candidate archive/delete, file download, export,
approval action, account suspension.

Audit records identify: user, company, action, record, timestamp, relevant metadata.

---

## 16. Account Suspension

Suspending an employee denies login while leaving existing data, audit history, and previous
actions intact.

---

## 17. Security Principles

- **Default deny** — no access unless granted.
- **Least privilege** — only what the role requires.
- **Organization isolation** — company data stays separate.
- **Backend enforcement** — not frontend hiding.
- **Individual accountability** — own credentials per employee.
- **Data persistence** — security changes never cause data loss.
- **Auditability** — important actions traceable to a person.

---

## 18. Recommended Access Model

```text
                    HUMSEE
                       │
              ┌────────┴────────┐
              │                 │
          Company A         Company B
              │                 │
        Company Admin      Company Admin
              │                 │
       ┌──────┼──────┐    ┌─────┼─────┐
       │      │      │    │     │     │
      HR   Recruiter Analyst  HR  Analyst
       │      │      │    │     │     │
       └──── Authorized Records ───────┘
```

---

## 19. Implementation Direction

The existing HUMSEE architecture already contains important foundations: Firebase
authentication, JWT sessions, organization/multi-tenancy support (`organizations` +
`users.organization_id`), roles and permissions (`role_permissions` + `requirePermission`),
admin panel, audit logging (`audit_logs`), account suspension, optional TOTP MFA, persistent
database on the Railway volume.

Focus on strengthening and validating the existing architecture rather than rebuilding.

Immediate priorities:

1. Verify organization-level data isolation.
2. Verify every protected API checks organization and user permissions.
3. Implement/verify Company Admin user management.
4. Implement/verify employee invitation and credential creation.
5. Implement candidate-level sharing/assignment.
6. Protect sensitive files and API endpoints.
7. Back up existing production data.
8. Safely migrate existing records without deletion.
9. Test cross-company access attempts.
10. Test multiple users, admins, roles, and permissions.
11. Verify audit logs.
12. **Commit/tag the current stable version before security migration.**

---

## 20. User Access Management (UX / product decision)

Access grants are managed from a **separate admin area**, never inside the candidate
section. Proposed entry points:

- Admin Panel → **Users & Access**
- Route: `/humsee/admin/user-access`

Flow:

```text
Admin Login → User Access Management → Add / select Employee → Enter existing email
           → Choose role + data access → Grant Access
           → Employee logs in with the same email
           → Existing authorized data appears immediately
           → Future data appears per granted permissions
```

User Access table (management UI):

| Employee | Email | Role | Access | Status | Action |
|----------|-------|------|--------|--------|--------|
| Admin | admin@scorecard.com | Super Admin | All Data | Active | Manage |
| Shruti Rudrawar | shrutirudrawar04@gmail.com | Admin | All Data | Active | Manage |
| Existing Employee | employee@email.com | HR | Granted Data | Active | Edit |
| Recruiter | recruiter@email.com | Recruiter | Granted Data | Active | Edit |

`+ Grant User Access` modal:

```text
Email:      [ employee@email.com ]
Role:       [ HR ▼ ]
Data Access: ○ All existing data  ○ Selected existing data  ○ Only future data
Permissions: ☑ View ☑ Create ☑ Edit ☐ Delete ☐ Share
[ Cancel ] [ Grant Access ]
```

Key requirements:

1. **Existing data must be visible immediately after the grant.** If the DB already
   contains Candidate A/B/C/D and the grant is "All existing data", the employee must
   see all four at first login — no waiting for new records. A "Selected existing data"
   scope (e.g. only A and C) must be per-record.
2. **Grants apply to existing accounts.** If `employee@email.com` already exists
   (Firebase/Google or local), do NOT create a duplicate account. Grant access on the
   existing `users` row; on login the system checks `user_access` and returns the
   allowed data.
3. Grants for "Only future data" apply from the grant timestamp onward.
4. **Server-side enforcement.** The backend must verify the authenticated user's
   UID/role/permissions before returning anything. The frontend must never be able to
   claim admin by itself. Every read/write re-checks `user_access` scope.
5. Initial seeded authorities: `admin@scorecard.com` (Super Admin) and
   `shrutirudrawar04@gmail.com` (admin). Other users get access only via explicit grant.
6. Revoke/edit/suspend of a grant must stop data visibility immediately at next request.

Implementation sketch (additive only):

```sql
CREATE TABLE IF NOT EXISTS user_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  granted_by INTEGER REFERENCES users(id),
  role TEXT NOT NULL,
  scope TEXT NOT NULL,            -- all_existing | selected | future_only
  scope_candidate_ids TEXT,       -- JSON array for scope='selected'
  can_view INTEGER DEFAULT 1,
  can_create INTEGER DEFAULT 0,
  can_edit INTEGER DEFAULT 0,
  can_delete INTEGER DEFAULT 0,
  can_share INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',   -- active | revoked | suspended
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT
);
```

Every admin list/detail/mutation route gains a "does this user's `user_access` cover
this record/org/action?" check. No existing rows are altered; "All existing data" for
an org simply resolves to the rows already belonging to that org.

---

## Final Model

**HUMSEE Score = Multi-Company SaaS + Organization-Level Data Isolation + Individual
Credentials + Role-Based Access + Record-Level Sharing + Auditability + Protected Persistent
Data.**

---

## Approval

This document requires written approval before implementation begins. No schema change, route
change, or data migration may start until:

1. The approver signs off on this model, and
2. The §0 baseline counts + backup are recorded and verified.
