/**
 * Well-known MongoDB ObjectIds that exist in the dev database's seed data, discovered
 * by reading the backend source (D:\KATBOOK\KatbookInitiation_API) rather than guessing:
 *
 * - COMPANY_ID: hardcoded at config/config.js `CONFIG.Company[0]` in the backend, and
 *   independently confirmed live via GET /v1/store/attribute/filter, whose returned
 *   institution records embed this exact companyId.
 * - ADMIN_USER_TYPE_ID / CONTENT_DEVELOPER_USER_TYPE_ID / CONTENT_UPLOADER_USER_TYPE_ID:
 *   hardcoded in middleware/passport.js's `userTypeMap` (the backend's RBAC role map).
 *   Confirmed live: registering via POST /v1/admin/register with ADMIN_USER_TYPE_ID +
 *   COMPANY_ID succeeds, and the resulting user's userTypeId.code is "MA@1" — the exact
 *   value POST /v1/admin/login's MasterAdminLogin requires.
 *
 * There is no public API to discover these — POST /v1/usertype/add never returns the
 * created document's _id, and every listing endpoint requires auth. These are the only
 * way to bootstrap a first admin account in a fresh environment; treat them as fixed
 * reference data for the "dev" environment, not something the test bench creates itself.
 */
export const SEED = {
  COMPANY_ID: '6007cfc79052d71fec82fef2',
  ADMIN_USER_TYPE_ID: '603f80e52e47b525cc91a3b5',
  CONTENT_DEVELOPER_USER_TYPE_ID: '603f81252e47b525cc91a3b6',
  CONTENT_UPLOADER_USER_TYPE_ID: '60408011661a362a8078f040',
} as const;

/**
 * A real, verified-working curriculum-tree chain under SEED.COMPANY_ID, discovered (not
 * fabricated) by walking the actual live data: GET /v1/attribute/:company/:typeOfBook/
 * :country/:institutionType (returned the existing Attribute + its 4 tiers) -> GET
 * /v1/parent/variables/.../:tierId/:code (Tier1, code "Numeric" -> a real top-level
 * "Volume" variable) -> GET /v1/variable/get/:variableId (that Volume's real unit+session
 * child pair). Confirmed end-to-end by successfully creating and deleting a real
 * Highlighter document with these exact IDs (POST /v1/highlighter/create).
 *
 * This is the "Publisher" typeOfBook / "INDIA" country / "Corporate" institutionType combo
 * — reuse this chain instead of re-discovering or fabricating curriculum data for any
 * domain that needs a real Variable/Attribute reference (Highlighter, Hyperlink,
 * VideoScript, HandBook, and later diary/planning).
 */
export const CURRICULUM = {
  TYPE_OF_BOOK_ID: '6007cbe59052d71fec82fef0', // Booktype "Publisher"
  COUNTRY_ID: '5fe7156ab8646615d4e4e256', // Country "INDIA"
  INSTITUTION_TYPE_ID: '60082edc9835722bf4b5ca94', // InstitutionType "Corporate"
  ATTRIBUTE_ID: '607935f351089845449ba679',
  TIER_1_ID: '607935f351089845449ba675', // "Tier1 / Volume", codeFormat "Numeric"
  TOP_VARIABLE_ID: '6079362f51089845449ba68a', // "Volume 21" — a real Tier1 node
  UNIT_ID: '6079364451089845449ba6ab', // "Issue 4" — real child of TOP_VARIABLE_ID
  SESSION_ID: '6079367e51089845449ba6bc', // "Introduction" — real child of UNIT_ID

  /**
   * ContentController.createContent's real prerequisite (confirmed live, not documented
   * anywhere): the target variableDetails[].variableId must already have `coverImage` AND
   * `language` set — TOP_VARIABLE_ID/SESSION_ID above don't have these, but UNIT_ID
   * ("Issue 4") does. Discovered via GET /v1/content/kaudio/q?sessionId=... (a real,
   * pre-existing KAudio log's populated unitId showed coverImage+language), then confirmed
   * by successfully creating a real Content document with
   * { tierDetails: [{tierId: TIER_2_ID}], variableDetails: [{variableId: UNIT_ID}] }. Use
   * TIER_2_ID (not TIER_1_ID) when referencing UNIT_ID — UNIT_ID's own tierId is Tier2, and
   * createContent requires the submitted tierId(s) to match the variable's actual tier.
   */
  TIER_2_ID: '607935f351089845449ba676', // "Tier2 / Issue" — UNIT_ID's actual tier

  /**
   * A real 4th level under UNIT_ID, discovered while building the `planning` domain test
   * suite (2026-10-03): `GET /v1/variable/get/:id` against UNIT_ID returns its real children
   * nested two levels deep (`unitId`/`unitName` = SESSION_ID/"Introduction", then a real
   * `sessionId`/`sessionName` leaf below that — the naming is confusing: SESSION_ID itself
   * is NOT the leaf, it's an intermediate "unit"-like level in this API's own output). This
   * leaf (`sessionId: 6079...a6cd`, "Rediscovering India") is the only node in the whole
   * CURRICULUM chain confirmed to have `sessionCode` set (required by
   * `PlanningPreparationController.getAllUnselectedContentPreparationActivities`/
   * `getAllSelectedContentPreparationActivities`, confirmed live: SESSION_ID itself 400s
   * "Variable was not found!." for lacking it, this id succeeds with real pre-existing
   * `ContentPreparation` data). Also resolves the 4-level-deep `variableDetails` chain
   * `dairy-uploading.spec.ts`'s consolidated-report test was blocked on (section 16) —
   * `[TOP_VARIABLE_ID, UNIT_ID, SESSION_ID, LEAF_SESSION_ID]` is a genuine 4-level
   * parent-child chain, confirmed, not fabricated.
   */
  LEAF_SESSION_ID: '607936a251089845449ba6cd', // "Rediscovering India" — real child of SESSION_ID, has sessionCode set
} as const;
