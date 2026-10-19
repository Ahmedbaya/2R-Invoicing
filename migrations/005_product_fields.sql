CREATE TABLE categories (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  customs_code TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

INSERT INTO categories (name, customs_code) VALUES ('Swimsuit', '61124190') ON CONFLICT DO NOTHING;

ALTER TABLE products RENAME COLUMN sku TO code;
ALTER TABLE products ADD COLUMN name TEXT;
ALTER TABLE products ADD COLUMN category_id INT REFERENCES categories(id);
UPDATE products SET name = description, description = '';
ALTER TABLE products ALTER COLUMN name SET NOT NULL;
ALTER TABLE products ALTER COLUMN description DROP NOT NULL;

-- Invoice lines keep their own copy of the code and customs code.
ALTER TABLE invoice_items ADD COLUMN item_code TEXT NOT NULL DEFAULT '';
ALTER TABLE invoice_items ADD COLUMN customs_code TEXT NOT NULL DEFAULT '';