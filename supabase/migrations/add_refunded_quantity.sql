-- Migration: Add refunded_quantity column to sold_products
-- This ensures the column exists for the new refund flow

-- Add refunded_quantity column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sold_products' AND column_name = 'refunded_quantity'
  ) THEN
    ALTER TABLE public.sold_products ADD COLUMN refunded_quantity INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Add CHECK constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_refunded_quantity_lte_quantity'
  ) THEN
    ALTER TABLE public.sold_products 
    ADD CONSTRAINT chk_refunded_quantity_lte_quantity 
    CHECK (refunded_quantity <= quantity);
  END IF;
END $$;

-- Add CHECK constraint for non-negative if it doesn't exist  
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_refunded_quantity_non_negative'
  ) THEN
    ALTER TABLE public.sold_products 
    ADD CONSTRAINT chk_refunded_quantity_non_negative 
    CHECK (refunded_quantity >= 0);
  END IF;
END $$;

-- Enable the trigger if it exists but is disabled
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trg_restock_on_sold_product_refund' AND NOT tgenabled
  ) THEN
    ALTER TABLE public.sold_products ENABLE TRIGGER trg_restock_on_sold_product_refund;
  END IF;
END $$;

