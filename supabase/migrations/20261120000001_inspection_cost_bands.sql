-- Allow splitting one order item's deduction across cards in different
-- condition, instead of one blanket order-level discount.
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS inspection_cost_bands jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.order_items.inspection_cost_bands IS '減額対象の枚数・減額後単価・理由。検品単価より安い分だけを保持し、残数は単価のまま。';
