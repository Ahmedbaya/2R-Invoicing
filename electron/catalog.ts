import type { z } from 'zod'
import type { Client, Product } from '../shared/types'
import { getPool } from './db'
import type { clientSchema, productSchema } from './schemas'

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

export async function listProducts(): Promise<Product[]> {
  const { rows } = await getPool().query('SELECT id, sku, description, default_price FROM products ORDER BY description')
  return rows.map((r) => ({ ...r, default_price: String(Number(r.default_price)) }))
}

export async function saveProduct(p: z.infer<typeof productSchema>): Promise<Product> {
  const price = p.default_price.trim().replace(',', '.') || '0'
  const sku = p.sku?.trim() || null
  const q = p.id
    ? getPool().query(
        'UPDATE products SET sku=$1, description=$2, default_price=$3, updated_at=now() WHERE id=$4 RETURNING id, sku, description, default_price',
        [sku, p.description, price, p.id],
      )
    : getPool().query(
        'INSERT INTO products (sku, description, default_price) VALUES ($1,$2,$3) RETURNING id, sku, description, default_price',
        [sku, p.description, price],
      )
  const r = (await q).rows[0]
  return { ...r, default_price: String(Number(r.default_price)) }
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