import type { z } from 'zod'
import type { Category, Client, Product } from '../shared/types'
import { getPool } from './db'
import type { categorySchema, clientSchema, productSchema } from './schemas'

const CLIENT_COLS = 'id, company_name, address_1, address_2, country, tax_id'

export async function listClients(): Promise<Client[]> {
  return (await getPool().query(`SELECT ${CLIENT_COLS} FROM clients ORDER BY company_name`)).rows
}

export async function saveClient(c: z.infer<typeof clientSchema>): Promise<Client> {
  const v = [c.company_name, c.address_1, c.address_2, c.country, c.tax_id]
  const q = c.id
    ? getPool().query(
        `UPDATE clients SET company_name=$1, address_1=$2, address_2=$3, country=$4, tax_id=$5, updated_at=now() WHERE id=$6 RETURNING ${CLIENT_COLS}`,
        [...v, c.id],
      )
    : getPool().query(
        `INSERT INTO clients (company_name, address_1, address_2, country, tax_id) VALUES ($1,$2,$3,$4,$5) RETURNING ${CLIENT_COLS}`,
        v,
      )
  return (await q).rows[0]
}

const PRODUCT_SELECT = `SELECT p.id, p.code, p.name, p.description, p.category_id, p.default_price,
  c.name AS category_name, c.customs_code
  FROM products p LEFT JOIN categories c ON c.id = p.category_id`

const toProduct = (r: any): Product => ({ ...r, default_price: String(Number(r.default_price)) })

export async function listProducts(): Promise<Product[]> {
  const { rows } = await getPool().query(`${PRODUCT_SELECT} ORDER BY p.code NULLS LAST, p.name`)
  return rows.map(toProduct)
}

export async function saveProduct(p: z.infer<typeof productSchema>): Promise<Product> {
  const price = p.default_price.trim().replace(',', '.') || '0'
  const values = [p.code, p.name, p.description, p.category_id, price]
  try {
    const q = p.id
      ? getPool().query(
          'UPDATE products SET code=$1, name=$2, description=$3, category_id=$4, default_price=$5, updated_at=now() WHERE id=$6 RETURNING id',
          [...values, p.id],
        )
      : getPool().query(
          'INSERT INTO products (code, name, description, category_id, default_price) VALUES ($1,$2,$3,$4,$5) RETURNING id',
          values,
        )
    const id = (await q).rows[0].id
    return toProduct((await getPool().query(`${PRODUCT_SELECT} WHERE p.id=$1`, [id])).rows[0])
  } catch (e) {
    if ((e as { code?: string }).code === '23505') throw new Error(`The code ${p.code} is already used by another product.`)
    throw e
  }
}
export async function deleteClient(id: number): Promise<true> {
  const used = (await getPool().query('SELECT count(*)::int AS n FROM invoices WHERE client_id=$1', [id])).rows[0].n
  if (used > 0) {
    throw new Error(`This client is used on ${used} invoice${used > 1 ? 's' : ''} and cannot be deleted. Edit the client instead.`)
  }
  await getPool().query('DELETE FROM clients WHERE id=$1', [id])
  return true
}

export async function deleteProduct(id: number): Promise<true> {
  await getPool().query('DELETE FROM products WHERE id=$1', [id])
  return true
}
export async function listCategories(): Promise<Category[]> {
  return (await getPool().query('SELECT id, name, customs_code FROM categories ORDER BY name')).rows
}

export async function saveCategory(c: z.infer<typeof categorySchema>): Promise<Category> {
  try {
    const q = c.id
      ? getPool().query('UPDATE categories SET name=$1, customs_code=$2 WHERE id=$3 RETURNING id, name, customs_code', [c.name, c.customs_code, c.id])
      : getPool().query('INSERT INTO categories (name, customs_code) VALUES ($1,$2) RETURNING id, name, customs_code', [c.name, c.customs_code])
    return (await q).rows[0]
  } catch (e) {
    if ((e as { code?: string }).code === '23505') throw new Error(`A category named "${c.name}" already exists.`)
    throw e
  }
}

export async function deleteCategory(id: number): Promise<true> {
  const used = (await getPool().query('SELECT count(*)::int AS n FROM products WHERE category_id=$1', [id])).rows[0].n
  if (used > 0) throw new Error(`This category is used by ${used} product${used > 1 ? 's' : ''}. Change those products first.`)
  await getPool().query('DELETE FROM categories WHERE id=$1', [id])
  return true
}