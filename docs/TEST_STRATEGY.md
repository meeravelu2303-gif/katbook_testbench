# Katbook API Test Bench — Test Strategy & Matrix (Phase 1)

Source spec: `swagger.json` — OpenAPI 3.0.0, "Katbook Initiation API" v1.0.0.

## 1. Spec characteristics that shape this strategy

- **574 operations / 549 paths.** Methods: GET 245, POST 192, PUT 75, DELETE 53, PATCH 9.
- **Single auth scheme:** `bearerAuth` (HTTP bearer/JWT), declared globally, never overridden per-operation.
  Only one `servers` entry (`http://localhost:3000`) — dev/staging/prod base URLs are **not** in the spec and must come from our own env config.
- **Auth is under-modeled:** 388/574 ops (68%) carry an `Authorization` header param + a "🔒 Requires Authentication" note in `description`; the other 186 have neither. This is a text convention, not a formal `security: []` override — treat it as a *hint*, not ground truth, and confirm the real 401 behavior empirically per endpoint during implementation.
- **No usable request/response schemas.** `components.schemas` is empty, zero `$ref` usage anywhere. Every response is declared `text/plain` with a bare string, including 200/201 JSON bodies. Only 200/201 status codes are documented — no 4xx/5xx contracts at all. This is a straight Postman-collection → OpenAPI conversion, not a hand-authored contract.
  **Consequence:** we cannot generate Ajv/Zod validators from the spec. Response contracts must be reverse-engineered from real calls as each domain is implemented, then checked into `src/utils/validators/<domain>.schema.ts` and treated as living documentation of *actual* behavior.
- **112 raw tags, one-endpoint-per-request-name style, with duplicates/typos:** `Boomarks`/`Bookmarks`/`Bookmark`, `Insitution`/`Institution`, `Clarfication`/`Clarification`/`Clarifications`, `Booktype`/`Booktypes`, `Countries`/`Country`, singular/plural pairs throughout, plus ~40 singleton verb-named tags (`GetAllEmployee`, `DeleteAddress`, `SaveOfficeType`...). Raw tags are not a usable test-suite grouping as-is.

## 2. Domain consolidation (112 tags → logical domains)

Verified against sample paths (not tag names alone — e.g. `Dairy` is a diary/activity-appraisal module, not spelling of "dairy"; `Ias` is an institution-admin CRUD module; `Kampus` is the campus-facing book-viewing/session module).

| Domain (proposed `src/tests/<domain>/`) | Consolidates raw tags | Ops | Notes |
|---|---|---|---|
| `content` | Content, Editor, Scratch, History, Highlighter, Hyperlink, Attribute | ~101 | Largest domain: content authoring, attributes, annotation tools |
| `diary` | Dairy | 60 | Staff/teacher activity + appraisal diary, date-range heavy |
| `management` | Management | 24 | "preparations" CRUD |
| `draft` | Draft | 16 | Content approval workflow (working/rework/approved states) |
| `institution` | Institution, Insitution, InstitutionName, Institute, Ias | ~29 | Institution CRUD is duplicated across `Institution` and `Ias` tags — needs de-dup check during implementation |
| `admin` | Admin | 19 | Admin-scoped operations |
| `user` | User, Usertype, Self, Session | ~25 | Core auth/session lives here — **highest priority** |
| `planning` | Planning, Plan | 25 | |
| `book-catalog` | Book, Bookdetails, Booktype, Booktypes, BookIds, Titles | ~24 | Book catalog/metadata |
| `bookmarks` | Bookmark, Bookmarks, Boomarks | 8 | Separate from catalog — user-specific reading state |
| `hr-staff` | Staff, Employee, Designation, Department, Role, RoleMaster, Address\*, Education\*, Experience\*, Family\*, OfficeLocation\*, OfficeType\* | ~55 | HR module; the singleton verb-tags (GetAllEmployee, DeleteAddress, etc.) all land here |
| `variables` | Variables, Variable, Varible | 17 | Config/taxonomy tree (company→typeOfBook→country→institutionType→attribute→tier...) — deep path params, good boundary-value target |
| `kampus` | Kampus | 9 | Campus book-viewing/session flows — note `book/view/{sessionId}/{username}/{password}/...` puts **credentials in the URL path**, flag as a security finding, not just a test target |
| `menu` | Menu | 9 | |
| `notes` | Notes | 8 | |
| `offline` | Offline | 8 | |
| `student` | Student, Parent | ~11 | |
| `assessment` | Question, Questiontype, Exercise, Exercises | ~11 | |
| `clarification` | Clarification, Clarifications, Clarfication | 10 | |
| `geo-master-data` | Country, Countries, City, Cities, State, States, Area, Areas | ~28 | Reference/lookup data — good candidates for lightweight smoke coverage, low business-logic risk |
| `company` | Company, Companies | 5 | |
| `misc` (assess case-by-case) | File, Holiday, Meeting, Asset, Assets, Activity, Dashboard, Ecommerce, Chat, Kaddoc, Location, Store, Subject, Converter, Embibecontent | ~50 | Long tail; scope during Phase 5, not blocking Phase 1–4 |

Total accounted for: 574 ops. This table is the basis for `src/tests/<domain>/` directories — replaces the raw 112 tags.

## 3. Phased rollout (maps to CLAUDE.md Step 5: Auth → Core Entities → Edge Cases)

1. **Auth/User/Session** (`user` domain, ~25 ops) — must land first; every other domain's fixtures depend on a working bearer-token flow.
2. **Core entities by volume:** `content`, `diary`, `management`, `institution`, `admin`, `planning`, `book-catalog`, `hr-staff`, `draft` — in that order (≈75% of all operations).
3. **Secondary entities:** `variables`, `bookmarks`, `kampus`, `menu`, `geo-master-data`, `student`, `assessment`, `clarification`, `notes`, `offline`, `company`.
4. **Long tail / `misc`:** scoped per-endpoint once the pattern library (fixtures, factories, validators) is proven on the domains above — highest risk of being genuinely dead/unused endpoints, worth a quick manual triage before writing tests.
5. **Edge cases** are woven into each domain's test file as it's built (boundary values, auth-negative, 404/409/422 paths), not a separate late pass — waiting until the end to add edge cases means re-opening every domain file twice.

## 4. Coverage strategy per endpoint

Since the spec gives no real contract, each test asserts, in order:
1. HTTP status code (happy path + at least one negative path: missing/invalid auth, invalid payload, not-found id).
2. Required headers (`Content-Type`, any custom headers observed in real responses).
3. **Discovered** response shape via a per-domain Zod schema written from the actual first successful call, not from the spec — this schema is the enforced contract from that point on, catching regressions even though the spec never had one.
4. Business-logic invariants (e.g., created resource is retrievable, delete is idempotent-or-404, list endpoints respect any pagination/filter params actually observed).

Auth handling: default fixture attaches a valid bearer token to every request; a small allow-list of confirmed-public endpoints (built empirically, not from the description-text hint) skips it. Every domain gets at least one explicit 401/403 test against a real protected endpoint to validate the auth boundary actually holds, since the spec's per-op signal isn't trustworthy.

## 5. Bugzilla defect governance (ported from `kpost-testbench_v2`)

Reusing the proven pattern rather than reinventing it:
- Fingerprint-based dedupe (SHA1 of normalized endpoint+validator+message, volatile substrings like UUIDs/JWTs/timestamps collapsed first) tagged into the bug summary/whiteboard — catches the same fault even if wording drifts.
- Fallback fault-key index (`product||endpoint||validator`) and a phrase-search adoption path for bugs filed before the bench existed.
- Bugzilla auth via `api_key` query param (not header) — this reference instance ignores the header form.
- `BugzillaReporter` as a custom Playwright `Reporter`, wired to run in `onEnd()`, skipped in CI in favor of filing off the merged blob report (avoids double-filing on sharded runs).
- Config split: `env.ts` (Zod-validated env), `bugzilla.config.ts` (severity/priority maps, dedupe tag prefix), `ownership.config.ts` (product/component/assignee per test-suite/domain).

**This part is blocked on real values** — see open questions below.

## 6. Risks / findings to carry forward

- Credentials appear in a URL path for `kampus` book-view (`/v1/kampus/book/view/{sessionId}/{username}/{password}/...`) — worth flagging as a security concern alongside functional testing, not just testing it as designed.
- `Institution` vs `Ias` tags both do institution CRUD — likely duplicate/legacy endpoints; needs confirmation before writing double coverage.
- No documented error schema anywhere — error-path assertions will necessarily be looser (status code + maybe a generic shape) until real error bodies are observed.
- Single `localhost:3000` server in the spec — environment base URLs are entirely our own config, not derived from the spec.
- **CONFIRMED (live test, `src/tests/user/login.spec.ts`): `GET /v1/user/profile` returns the requesting user's bcrypt password hash in `user.password`.** No endpoint should ever return credential material, hashed or not. A regression test asserting this (currently red on purpose) is in place; will auto-file to Bugzilla once that's configured (section 5).
- Per the backend's own architecture docs (`D:\KATBOOK\KatbookInitiation_API\docs\`): there are **two different JWT auth middlewares** — `needsAuth` (verifies signature via passport-jwt) and `authToken`/`CheckTokenExists` (does **not** verify signature). Worth a dedicated security test per domain once we start touching routes that use the second one — confirm this from the routes themselves as each domain is implemented, don't assume the docs' claim.
- Same docs: **338 of 750 routes have no auth at all** (route-scan count, backend has 750 routes vs. swagger.json's 574 — the swagger is incomplete, missing ~176 routes; the domain consolidation in section 2 is scoped to what's in swagger.json only).

## 7. Auth bootstrap (resolved)

The registration/login chain looked circular at first (`POST /v1/admin/register` needs a real `companyId` + `userTypeId`, but listing/creating either normally requires auth) and swagger.json/the Postman collection both have empty `{}` request bodies everywhere — verified there's no richer payload source in either. Resolved by reading the backend source directly (`D:\KATBOOK\KatbookInitiation_API`):

- `companyId` **`6007cfc79052d71fec82fef2`** — hardcoded at `config/config.js` `CONFIG.Company[0]`, independently confirmed live via the public `GET /v1/store/attribute/filter`, whose returned records embed it.
- `userTypeId` for an Admin account — **`603f80e52e47b525cc91a3b5`** — hardcoded in `middleware/passport.js`'s RBAC `userTypeMap` (its `code` field is `"MA@1"`, the exact value `MasterAdminReg`/`MasterAdminLogin` gate on). The same map also gives `603f81252e47b525cc91a3b6` (Content Developer) and `60408011661a362a8078f040` (Content Uploader) for later domain work.
- Confirmed exhaustively (source read + live probing) that **no public endpoint returns a created `UserType`'s `_id`** — `POST /v1/usertype/add`'s response is `{"message":"User Type was added!.","success":true}` only, and every listing endpoint requires auth. These three IDs are the only way in; they're checked into `src/config/seed.constants.ts` with citations.
- `POST /v1/admin/login` response's `token` field already includes a `"Bearer "` prefix — `src/fixtures/auth.fixture.ts` strips it before `BaseApiClient` re-adds its own, to avoid a double-prefixed header.
- `npm run bootstrap:admin` (idempotent — treats "User Name already exists!." as success) registers the `ADMIN_USERNAME`/`ADMIN_PASSWORD` test account from `.env` using these constants, for any fresh checkout.

## 8. Open questions before scaffolding (Step 3)

1. **Bugzilla connection**: base URL, product name, component(s) (per-domain or one bucket?), default version, API key source — is there an existing Bugzilla project for Katbook, or do we provision one?
2. ~~Environment base URLs~~ — resolved: `dev` = `http://192.168.1.74:2504`.
3. ~~Schema validation library~~ — resolved: Zod only.
4. ~~Reporter~~ — resolved: Playwright's built-in HTML reporter.
5. Confirm the domain consolidation table above (section 2) before it becomes the `src/tests/` directory layout.
6. Institution/offline actor credentials are still unconfirmed — the admin-bootstrap trick doesn't directly apply (those are different login controllers/models per the backend docs: `InstitutionUser`, not `User`). Will investigate their registration flow the same way (read the backend source) when those domains come up, rather than guessing payload shapes again.
