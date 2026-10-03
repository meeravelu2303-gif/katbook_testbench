import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'expected a 24-char hex ObjectId');

export interface ManagementDoc {
  _id: string;
  companyId: string;
  isRework: boolean;
  active: boolean;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
  __v: number;
  managementPreparationName?: string;
  managementUploadingName?: string;
}

export interface ManagementListItem {
  _id: string;
  companyId: { _id: string; companyName: string };
  isRework: boolean;
  active: boolean;
  managementPreparationName?: string;
  managementUploadingName?: string;
}

/**
 * Confirmed by reading ManagementPreparation.controller.js / ManagementUploading.controller.js
 * directly (swagger.json's schema for these is the generic `{type: object, example: {}}`).
 * Create/Update return the raw Mongoose document; GetAll/GetById apply a field-exclusion
 * projection (`{__v:0, createdAt:0, updatedAt:0, createdBy:0, updatedBy:0}`) and populate
 * companyId — the two response shapes are genuinely different, not just a subset.
 *
 * The [nameField] computed key below is correct at runtime (exactly one of
 * managementPreparationName/managementUploadingName is ever actually present), but it defeats
 * Zod's shape inference (the whole object degrades to an untyped shape, not just that key) —
 * so the return type is asserted explicitly instead of inferred.
 */
export function managementDocSchema(nameField: 'managementPreparationName' | 'managementUploadingName'): z.ZodType<ManagementDoc> {
  return z.object({
    _id: objectId,
    companyId: objectId,
    [nameField]: z.string(),
    isRework: z.boolean(),
    active: z.boolean(),
    createdBy: objectId.optional(),
    updatedBy: objectId.optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
    __v: z.number(),
  }) as unknown as z.ZodType<ManagementDoc>;
}

export function managementListItemSchema(nameField: 'managementPreparationName' | 'managementUploadingName'): z.ZodType<ManagementListItem> {
  return z.object({
    _id: objectId,
    companyId: z.object({ _id: objectId, companyName: z.string() }),
    [nameField]: z.string(),
    isRework: z.boolean(),
    active: z.boolean(),
  }) as unknown as z.ZodType<ManagementListItem>;
}
