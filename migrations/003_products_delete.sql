-- Invoice lines keep their own description and price, so they no longer need a hard link to the product.
ALTER TABLE invoice_items DROP CONSTRAINT invoice_items_product_id_fkey;