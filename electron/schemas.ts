import { z } from 'zod'

const t = (max = 500) => z.string().max(max)
const opt = (max = 500) => z.string().max(max).nullable().optional().transform((v) => v ?? null)

export const clientSchema = z.object({
  id: z.number().int().positive().optional(),
  company_name: t(200).min(1, 'Company name is required'),
  address_1: opt(),
  address_2: opt(),
  country: opt(100),
  tax_id: opt(100),
})

export const productSchema = z.object({
  id: z.number().int().positive().optional(),
  sku: opt(100),
  description: t(300).min(1, 'Description is required'),
  default_price: t(32),
})

export const draftSchema = z.object({
  id: z.number().int().positive().optional(),
  version: z.number().int().optional(),
  client_id: z.number().int().positive().nullable(),
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  currency: z.string().length(3),
  vat_note: t(500),
  created_by: t(80),
  items: z
    .array(
      z.object({
        product_id: z.number().int().positive().nullable(),
        description: t(300).min(1, 'Every line needs a description'),
        quantity: t(32),
        unit_price: t(32),
      }),
    )
    .max(500),
  logistics: z.object({
    customs_declaration: t(500),
    transporter: t(200),
    gross_weight_kg: t(32),
    net_weight_kg: t(32),
    pallets: z.number().int().min(0).nullable(),
  }),
})

export const idSchema = z.number().int().positive()
export const finalizeSchema = z.object({ id: idSchema, version: z.number().int() })
