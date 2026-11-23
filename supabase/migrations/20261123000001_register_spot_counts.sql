-- 店舗 POS: 営業中の途中点検（1 時間おきに札だけ数えて記録する）。
-- 正式な精算は営業後のレジ締め。途中点検は札の枚数を時間帯ごとに残すだけで、差額の判定はしない（硬貨を数えないため）。
-- 通販（channel = 'online'）の動作は変えない。products には触らない。
-- docs/pos/design.md 3.3 節。

BEGIN;

CREATE TABLE IF NOT EXISTS public.register_spot_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  register_session_id uuid NOT NULL REFERENCES public.register_sessions(id) ON DELETE CASCADE,
  -- 時間帯（日本時間の「時」。13 なら 13 時台の点検）
  slot_hour smallint NOT NULL CONSTRAINT register_spot_counts_hour_check CHECK (slot_hour BETWEEN 0 AND 23),
  -- 札の枚数。{"10000": 3, "5000": 1, "1000": 12} の形
  bills jsonb NOT NULL,
  -- 札の合計額
  amount integer NOT NULL CONSTRAINT register_spot_counts_amount_check CHECK (amount >= 0),
  -- 記録した時点の理論残高（硬貨を含む。参考値）
  expected_cash integer,
  note text,
  counted_by_name text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS register_spot_counts_session_idx ON public.register_spot_counts(register_session_id, created_at);
CREATE INDEX IF NOT EXISTS register_spot_counts_tenant_idx ON public.register_spot_counts(tenant_id, created_at DESC);

ALTER TABLE public.register_spot_counts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.register_spot_counts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.register_spot_counts TO authenticated;
GRANT ALL ON public.register_spot_counts TO service_role;

DROP POLICY IF EXISTS register_spot_counts_select_tenant ON public.register_spot_counts;
CREATE POLICY register_spot_counts_select_tenant ON public.register_spot_counts FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.get_user_role(auth.uid()) IN ('admin','manager','staff'));

-- 記録できるのは開局中のレジだけ（入出金と同じ条件）。直しは消さずに記録し直す
DROP POLICY IF EXISTS register_spot_counts_insert_staff ON public.register_spot_counts;
CREATE POLICY register_spot_counts_insert_staff ON public.register_spot_counts FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.get_user_role(auth.uid()) IN ('admin','manager','staff')
    AND EXISTS (SELECT 1 FROM public.register_sessions s WHERE s.id = register_session_id AND s.tenant_id = public.get_user_tenant_id(auth.uid()) AND s.closed_at IS NULL));

COMMENT ON TABLE public.register_spot_counts IS '営業中の途中点検。時間帯ごとに札の枚数だけを記録する（差額の判定はしない）';

COMMIT;
