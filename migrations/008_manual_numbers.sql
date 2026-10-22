-- Numbers are typed by the user. They must be unique per client and year, not across all clients.
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_year_number_key;
CREATE UNIQUE INDEX invoices_client_year_number_uq ON invoices (client_id, year, number) WHERE number IS NOT NULL;