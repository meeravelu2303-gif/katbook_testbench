import type { APIResponse } from '@playwright/test';
import { BaseApiClient } from './base-client';

export interface PlanningActivityItem {
  companyId: string;
  typeOfBook: string;
  countryId: string;
  institutionTypeId: string;
  attributeId: string;
  tierDetails: Array<{ tierId: string }>;
  /**
   * Both createPlanningPreparation and createPlanningUploading have the same array-vs-object
   * validation mismatch found elsewhere in this codebase (handbook/videoscript): their early
   * existence checks read `variableDetails.variableId` (singular, always undefined for a
   * real array payload — silently bypassed via the mongodb driver's `new ObjectId(undefined)`
   * -> random-id quirk), but their real prerequisite is enforced later via
   * `variableDetails[length-1]`/`[length-2]` as a parent-child pair: the LAST entry's
   * Variable must have the SECOND-TO-LAST entry's id as its `parentVaribaleId`. A
   * single-element array passes the early checks but throws on that later array access
   * (`variableDetails[-1]` is undefined) inside an un-awaited `.map(async ...)` callback with
   * no catch (Preparation only — Uploading uses a real `for` loop and doesn't share this
   * specific hang) — this crashes silently and the request hangs forever on the Preparation
   * side (confirmed live via curl, independent of Playwright). Always pass >=2 real
   * parent->child entries, e.g. `[{variableId: CURRICULUM.TOP_VARIABLE_ID}, {variableId:
   * CURRICULUM.UNIT_ID}]`.
   */
  variableDetails: Array<{ variableId: string }>;
  assigneeId: string; // contentDeveloperId or contentUploaderId, mapped per-resource below
  selectedActivities: string[]; // real ContentPreparation/ContentUploading "name" ids
  duration: number;
  delay: number;
  esd: string; // YYYY-MM-DD
  efd: string; // YYYY-MM-DD
  /**
   * Preparation sets these directly at creation; Uploading's create does NOT (confirmed
   * from source — its saved document has no lsd/lfd field at all), so a fresh
   * PlanningUploading record never satisfies any endpoint that filters on `lfd` (e.g.
   * `getSelfPlanningUploadingByDate`) until `reschedule()` is called at least once, which
   * does set them. Still required here since Preparation needs them; pass harmlessly for
   * Uploading too (ignored).
   */
  lsd: string; // YYYY-MM-DD
  lfd: string; // YYYY-MM-DD
  sequenceNo: number;
  /**
   * Uploading-only: createPlanningUploading reads `req.body.staffAllocationContentId` and
   * writes it verbatim to the saved document's `StaffAllocationContentUploadingId` — the
   * join field `getConsolidatedStatusReportPlanningUploadingByTeam`-style reports need.
   * createPlanningPreparation has NO equivalent field at all (confirmed dead — see
   * dairy-preparation.spec.ts); passing this for the 'preparation' variant is a no-op.
   */
  staffAllocationContentId?: string;
}

export interface RescheduleInput {
  planningId: string;
  assigneeId: string;
  companyId: string;
  typeOfBook: string;
  countryId: string;
  institutionTypeId: string;
  duration: number;
  delay: number;
  esd: string;
  efd: string;
  lsd: string;
  lfd: string;
}

export interface AttributeVariableParams {
  companyId: string;
  typeOfBook: string;
  countryId: string;
  institutionTypeId: string;
  attributeId: string;
  assigneeId: string;
  variableId: string;
}

/**
 * The real "planning" domain (`Planning`/`Plan` tags, section 2) — `PlanningPreparationController`
 * (9 routes) and `PlanningUploadingController` (8 routes), the structural mirror pair whose
 * `PlanningPreparation`/`PlanningUploading` collections `dairy`'s self-scoped reports read
 * from (sections 15-16). This client started as a minimal seeding factory for that domain;
 * now covers the full live route surface for `planning`'s own dedicated pass.
 */
export class PlanningPreparationClient {
  constructor(
    private readonly client: BaseApiClient,
    private readonly variant: 'preparation' | 'uploading',
  ) {}

  private seg(preparation: string, uploading: string): string {
    return this.variant === 'preparation' ? preparation : uploading;
  }

  private get createPath(): string {
    // Confirmed from routes/v1.js: the uploading-side create route has a real typo
    // ("uploadig", not "uploading") — not a mistake in this test bench, the live route.
    return this.seg('/v1/planning/content/preparation/create', '/v1/planning/content/uploadig/create');
  }

  private get deletePathPrefix(): string {
    return this.seg('/v1/staff/content/preparation/delete', '/v1/planning/content/uploading/delete');
  }

  private get rescheduPath(): string {
    return this.seg('/v1/planning/content/preparation/reSechulding', '/v1/planning/content/uploading/reSechulding');
  }

  private assigneeField(): 'contentDeveloperId' | 'contentUploaderId' {
    return this.variant === 'preparation' ? 'contentDeveloperId' : 'contentUploaderId';
  }

  create(items: PlanningActivityItem[]): Promise<APIResponse> {
    return this.client.post(this.createPath, {
      data: {
        data: items.map(({ assigneeId, ...rest }) => ({ ...rest, [this.assigneeField()]: assigneeId })),
      },
    });
  }

  delete(planningId: string): Promise<APIResponse> {
    return this.client.delete(`${this.deletePathPrefix}/${planningId}`);
  }

  reschedule(input: RescheduleInput): Promise<APIResponse> {
    const { planningId, assigneeId, typeOfBook, ...rest } = input;
    return this.client.put(this.rescheduPath, {
      data: {
        ...rest,
        typeOfBook,
        [this.variant === 'preparation' ? 'planningPreparationId' : 'planningUploadingId']: planningId,
        [this.assigneeField()]: assigneeId,
      },
    });
  }

  /** GET .../activites/get/:assigneeId/:variableId — note "activites" (sic) is the real route spelling. */
  getAllUnselectedActivities(assigneeId: string, variableId: string): Promise<APIResponse> {
    const base = this.seg('/v1/planning/content/preparation/activites/get', '/v1/planning/content/uploading/activites/get');
    return this.client.get(`${base}/${assigneeId}/${variableId}`);
  }

  /** Preparation-only — confirmed no Uploading equivalent route exists (asymmetry: Preparation has 9 routes, Uploading 8). */
  getAllSelectedActivities(assigneeId: string, variableId: string, planningId: string): Promise<APIResponse> {
    return this.client.get(`/v1/planning/content/preparation/selected/activites/get/${assigneeId}/${variableId}/${planningId}`);
  }

  getByUser(p: AttributeVariableParams): Promise<APIResponse> {
    const base = this.seg('/v1/planning/content/preparation/get', '/v1/planning/content/uploading/get');
    return this.client.get(`${base}/${p.companyId}/${p.typeOfBook}/${p.countryId}/${p.institutionTypeId}/${p.attributeId}/${p.assigneeId}/${p.variableId}`);
  }

  getSelfByDateToday(p: AttributeVariableParams): Promise<APIResponse> {
    const base = this.seg('/v1/planning/content/preparation/get/self/today', '/v1/planning/content/uploading/get/self/today');
    return this.client.get(`${base}/${p.companyId}/${p.typeOfBook}/${p.countryId}/${p.institutionTypeId}/${p.attributeId}/${p.assigneeId}/${p.variableId}`);
  }

  /**
   * PUT (not GET, despite "get" in the path) — real route method confirmed from routes/v1.js.
   * The handler does `datas = activities[i]; ... {$elemMatch: {$eq: datas._id}}` — each
   * array entry must be an OBJECT with an `_id` field (mirroring a ContentPreparation/
   * ContentUploading activity object), not a plain id string. Passing plain strings makes
   * `datas._id` undefined, the query matches nothing, and — per the hang bug documented in
   * the spec file — the request then hangs instead of 400ing.
   */
  getByActivities(p: AttributeVariableParams, activityIds: string[]): Promise<APIResponse> {
    const base = this.seg('/v1/planning/content/preparation/get/activity', '/v1/planning/content/uploading/get/activity');
    return this.client.put(
      `${base}/${p.companyId}/${p.typeOfBook}/${p.countryId}/${p.institutionTypeId}/${p.attributeId}/${p.assigneeId}/${p.variableId}`,
      { data: { activityId: activityIds.map((id) => ({ _id: id })) } },
    );
  }

  /** Route param is literally named `:contentUploaderId` even on the Preparation side (copy-paste artifact, confirmed from routes/v1.js) — the handler itself just reads it as a generic assignee id. */
  getBySessionId(assigneeId: string, sessionId: string): Promise<APIResponse> {
    const base = this.seg(
      '/v1/planning/content/preparation/session/activites/get',
      '/v1/planning/content/uploading/session/activites/get',
    );
    return this.client.get(`${base}/${assigneeId}/${sessionId}`);
  }
}
