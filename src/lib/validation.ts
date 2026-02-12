import { z } from "zod";
import { ADMIN_BRAND_OPTIONS, ADMIN_COLOR_OPTIONS } from "@/lib/admin-options";

const genderSchema = z.enum(["women", "men", "kids"]);
const deliverySchema = z.enum(["pickup", "delivery"]);
/**
 * All known payment methods in the system.
 * "card" is defined but currently disabled (not yet integrated).
 */
const paymentMethodSchema = z.enum(["card", "messenger", "cash"]);

/** Payment methods that are currently enabled for new orders. */
const activePaymentMethodSchema = z.enum(["messenger", "cash"]);
const orderStatusSchema = z.enum(["new", "processing", "completed", "cancelled"]);
const brandSchema = z.enum(ADMIN_BRAND_OPTIONS);

const colorPalette = new Map(
  ADMIN_COLOR_OPTIONS.map((item) => [item.name.trim().toLowerCase(), item.hex.trim().toLowerCase()])
);

const productSizeSchema = z.object({
  size: z.string().min(1).max(32),
  inStock: z.boolean(),
  quantity: z.number().int().nonnegative().optional()
});

const productColorSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  hex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/),
  images: z.array(z.string().min(1)).max(30),
  sizes: z.array(productSizeSchema).max(80)
}).superRefine((value, context) => {
  const key = value.name.trim().toLowerCase();
  const expectedHex = colorPalette.get(key);

  if (!expectedHex) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["name"],
      message: "Unknown color name"
    });
    return;
  }

  if (value.hex.trim().toLowerCase() !== expectedHex) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["hex"],
      message: "Color hex does not match allowed palette"
    });
  }
});

const storeAvailabilitySchema = z.object({
  storeId: z.string().min(1).max(120),
  available: z.boolean()
});

export const createProductInputSchema = z.object({
  sku: z.string().min(1).max(120).optional(),
  slug: z.string().min(1).max(180).optional(),
  name: z.string().min(1).max(260),
  brand: brandSchema,
  description: z.string().max(5000).default(""),
  composition: z.string().max(2000).default(""),
  care: z.string().max(2000).default(""),
  category: z.string().min(1).max(160),
  gender: genderSchema,
  price: z.number().int().positive(),
  oldPrice: z.number().int().positive().optional(),
  colors: z.array(productColorSchema).default([]),
  stores: z.array(storeAvailabilitySchema).default([]),
  isNew: z.boolean().default(false),
  isActive: z.boolean().default(true)
});

export const patchProductInputSchema = z.object({
  sku: z.string().min(1).max(120).optional(),
  slug: z.string().min(1).max(180).optional(),
  name: z.string().min(1).max(260).optional(),
  brand: brandSchema.optional(),
  description: z.string().max(5000).optional(),
  composition: z.string().max(2000).optional(),
  care: z.string().max(2000).optional(),
  category: z.string().min(1).max(160).optional(),
  gender: genderSchema.optional(),
  price: z.number().int().positive().optional(),
  oldPrice: z.number().int().positive().optional(),
  colors: z.array(productColorSchema).max(40).optional(),
  stores: z.array(storeAvailabilitySchema).max(200).optional(),
  isNew: z.boolean().optional(),
  isActive: z.boolean().optional()
})
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "Payload is empty"
  });

export const patchOrderStatusInputSchema = z.object({
  status: orderStatusSchema
});

export const createOrderItemInputSchema = z.object({
  productId: z.string().min(1).max(120),
  colorId: z.string().min(1).max(120),
  size: z.string().min(1).max(32),
  quantity: z.number().int().min(1).max(20)
});

export const createOrderInputSchema = z.object({
  customer: z.object({
    name: z.string().min(1).max(180),
    phone: z.string().min(5).max(40),
    email: z.string().email().optional(),
    comment: z.string().max(1000).optional()
  }),
  delivery: deliverySchema.default("pickup"),
  paymentMethod: activePaymentMethodSchema.default("cash"),
  storeId: z.string().min(1).max(120),
  items: z.array(createOrderItemInputSchema).min(1).max(80)
});

export const idempotencyKeySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._-]+$/);

export type CreateProductInput = z.infer<typeof createProductInputSchema>;
export type PatchProductInput = z.infer<typeof patchProductInputSchema>;
export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;
export type PatchOrderStatusInput = z.infer<typeof patchOrderStatusInputSchema>;

export function formatZodError(error: z.ZodError): { message: string; issues: string[] } {
  const issues = error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });

  return {
    message: "Validation error",
    issues
  };
}
