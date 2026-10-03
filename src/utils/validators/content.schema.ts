import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'expected a 24-char hex ObjectId');

export const contentTypeDocSchema = z.object({
  _id: objectId,
  companyId: objectId,
  contentName: z.string(),
  contentType: z.string(),
  mappingType: z.string(),
  active: z.boolean(),
  createdBy: objectId.optional(),
  updatedBy: objectId.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  __v: z.number(),
});

export const contentAttributeDocSchema = z.object({
  _id: objectId,
  companyId: objectId,
  contentAttributeName: z.string(),
  active: z.boolean(),
  createdBy: objectId.optional(),
  updatedBy: objectId.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  __v: z.number(),
});

/** createdBy/updatedBy are always null — the controller leaves them commented out (scratchfile.controller.js:33-34). */
export const scratchDocSchema = z.object({
  _id: objectId,
  code: z.string(),
  active: z.boolean(),
  createdBy: z.null(),
  updatedBy: z.null(),
  createdAt: z.string(),
  updatedAt: z.string(),
  __v: z.number(),
});
