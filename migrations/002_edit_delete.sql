-- Allow finalized invoices to be unlocked for editing (they keep their number) and deleted
-- (the app only permits deleting the latest number of a year, so numbering stays gap-free).
CREATE OR REPLACE FUNCTION forbid_finalized_change() RETURNS trigger AS $$
DECLARE st TEXT;
BEGIN
  IF TG_TABLE_NAME = 'invoices' THEN
    -- Only blocks finalized -> finalized updates. Unlocking (-> draft) and deleting are controlled by the app.
    IF TG_OP = 'UPDATE' AND OLD.status = 'finalized' AND NEW.status = 'finalized' THEN
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

DROP TRIGGER invoices_immutable ON invoices;
CREATE TRIGGER invoices_immutable BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION forbid_finalized_change();
