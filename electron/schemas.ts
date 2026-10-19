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
  code: t(50).trim().min(1, 'Product code is required'),
  name: t(200).trim().min(1, 'Product name is required'),
  description: t(1000),
  category_id: z.number().int().positive({ message: 'Choose a category' }),
  default_price: t(32),
})

export const categorySchema = z.object({
  id: z.number().int().positive().optional(),
  name: t(100).trim().min(1, 'Category name is required'),
  customs_code: t(20).trim().min(1, 'Customs code is required'),
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
        item_code: t(50),
        order_name: t(200),
        customs_code: t(20),
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
