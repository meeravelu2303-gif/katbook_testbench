import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'expected a 24-char hex ObjectId');
const nullableDate = z.union([z.string(), z.null()]);

export interface ManagementPlanningDoc {
  _id: string;
  companyId: string;
  sequenceNo: number;
  selectedActivities: string;
  duration: number;
  delay: number;
  esd: string;
  efd: string;
  lsd: string | null;
  lfd: string | null;
  status: string;
  remarks?: string;
  active: boolean;
  // SECURITY (confirmed live, both create and updateById/updateBulk responses): the
  // controller assigns the full `req.user` Mongoose document to createdBy/updatedBy
  // instead of `user._id`, so these come back as full nested user objects — including
  // the bcrypt password hash — not ObjectId strings as the Mongoose schema declares.
  // Typed loosely here on purpose; see the dedicated SECURITY test for the actual assertion.
  createdBy?: unknown;
  updatedBy?: unknown;
  createdAt: string;
  updatedAt: string;
  __v: number;
  contentDeveloperId?: string;
  contentUploaderId?: string;
}

export interface ManagementPlanningListItem {
  _id: string;
  companyId: { _id: string; companyName: string };
  sequenceNo: number;
  selectedActivities: { _id: string; isRework: boolean; managementPreparationName?: string; managementUploadingName?: string };
  duration: number;
  delay: number;
  esd: string;
  efd: string;
  lsd: string | null;
  lfd: string | null;
  status: string;
  remarks?: string;
  active: boolean;
  contentDeveloperId?: { _id: string; userName: string; email: string };
  contentUploaderId?: { _id: string; userName: string; email: string };
}

/**
 * Same computed-key-defeats-inference issue as management.schema.ts — the returned type is
 * asserted explicitly. Confirmed live: create/update-bulk/update-by-id return the raw saved
 * document (all fields, relational fields as bare ObjectId strings); getAll/getById/getForSelf
 * apply no field-exclusion projection but do `.populate()` companyId/assignee/selectedActivities
 * into sub-documents — so both variants carry createdBy/updatedBy/timestamps/__v, unlike the
 * plain Preparations/Uploadings resources in management.schema.ts.
 */
export function managementPlanningDocSchema(assigneeField: 'contentDeveloperId' | 'contentUploaderId'): z.ZodType<ManagementPlanningDoc> {
  return z.object({
    _id: objectId,
    companyId: objectId,
    sequenceNo: z.number(),
    selectedActivities: objectId,
    duration: z.number(),
    delay: z.number(),
    esd: z.string(),
    efd: z.string(),
    lsd: nullableDate,
    lfd: nullableDate,
    status: z.string(),
    remarks: z.string().optional(),
    active: z.boolean(),
    createdBy: z.unknown().optional(),
    updatedBy: z.unknown().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
    __v: z.number(),
    [assigneeField]: objectId,
  }) as unknown as z.ZodType<ManagementPlanningDoc>;
}

export function managementPlanningListItemSchema(
  assigneeField: 'contentDeveloperId' | 'contentUploaderId',
  activityNameField: 'managementPreparationName' | 'managementUploadingName',
): z.ZodType<ManagementPlanningListItem> {
  return z.object({
    _id: objectId,
    companyId: z.object({ _id: objectId, companyName: z.string() }),
    sequenceNo: z.number(),
    selectedActivities: z.object({ _id: objectId, isRework: z.boolean(), [activityNameField]: z.string() }),
    duration: z.number(),
    delay: z.number(),
    esd: z.string(),
    efd: z.string(),
    lsd: nullableDate,
    lfd: nullableDate,
    status: z.string(),
    remarks: z.string().optional(),
    active: z.boolean(),
    [assigneeField]: z.object({ _id: objectId, userName: z.string(), email: z.string() }),
  }) as unknown as z.ZodType<ManagementPlanningListItem>;
}
