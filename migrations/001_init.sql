CREATE TABLE clients (
  id           SERIAL PRIMARY KEY,
  company_name TEXT NOT NULL,
  address_1    TEXT,
  address_2    TEXT,
  country      TEXT,
  tax_id       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id            SERIAL PRIMARY KEY,
  sku           TEXT UNIQUE,
  description   TEXT NOT NULL,
  default_price NUMERIC(14,4) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per year; the upsert in finalizeInvoice() serializes concurrent finalizations.
CREATE TABLE invoice_counters (
  year        INT PRIMARY KEY,
  last_number INT NOT NULL
);

CREATE TABLE invoices (
  id             SERIAL PRIMARY KEY,
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
  number         INT,
  year           INT,
  client_id      INT REFERENCES clients(id),
  client_snapshot JSONB,                       -- frozen copy of the client at finalization
  issue_date     DATE NOT NULL,
  currency       CHAR(3) NOT NULL DEFAULT 'EUR',
  vat_note       TEXT NOT NULL DEFAULT '',
  total_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  version        INT NOT NULL DEFAULT 1,       -- optimistic locking
  created_by     TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at   TIMESTAMPTZ,
  UNIQUE (year, number),
  CHECK (status = 'draft' OR (number IS NOT NULL AND year IS NOT NULL AND client_snapshot IS NOT NULL))
);

CREATE TABLE invoice_items (
  id          SERIAL PRIMARY KEY,
  invoice_id  INT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  position    INT NOT NULL,
  product_id  INT REFERENCES products(id),
  description TEXT NOT NULL,
  quantity    NUMERIC(14,3) NOT NULL,
  unit_price  NUMERIC(14,4) NOT NULL,
  line_total  NUMERIC(14,2) NOT NULL
);
CREATE INDEX invoice_items_invoice_idx ON invoice_items(invoice_id);

CREATE TABLE invoice_logistics (
  invoice_id          INT PRIMARY KEY REFERENCES invoices(id) ON DELETE CASCADE,
  customs_declaration TEXT NOT NULL DEFAULT '',
  transporter         TEXT NOT NULL DEFAULT '',
  gross_weight_kg     NUMERIC(12,3),
  net_weight_kg       NUMERIC(12,3),
  pallets             INT
);

-- Finalized invoices are immutable at the database level.
CREATE FUNCTION forbid_finalized_change() RETURNS trigger AS $$
DECLARE st TEXT;
BEGIN
  IF TG_TABLE_NAME = 'invoices' THEN
    IF OLD.status = 'finalized' THEN
      RAISE EXCEPTION 'Invoice % is finalized and cannot be modified', OLD.id;
    END IF;
  ELSE
    SELECT status INTO st FROM invoices WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
    IF st = 'finalized' THEN
      RAISE EXCEPTION 'Invoice % is finalized and cannot be modified', COALESCE(NEW.invoice_id, OLD.invoice_id);
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoices_immutable BEFORE UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION forbid_finalized_change();
CREATE TRIGGER items_immutable BEFORE INSERT OR UPDATE OR DELETE ON invoice_items
  FOR EACH ROW EXECUTE FUNCTION forbid_finalized_change();
CREATE TRIGGER logistics_immutable BEFORE INSERT OR UPDATE OR DELETE ON invoice_logistics
  FOR EACH ROW EXECUTE FUNCTION forbid_finalized_change();
