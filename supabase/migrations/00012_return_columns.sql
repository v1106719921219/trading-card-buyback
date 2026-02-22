-- 返品管理用カラム追加
-- return_status: null=返品なし、'返送待ち'=返品あり未返送、'返送済'=返送完了
-- return_tracking_number: 返送時の追跡番号

ALTER TABLE orders ADD COLUMN return_status TEXT CHECK (return_status IN ('返送待ち', '返送済'));
ALTER TABLE orders ADD COLUMN return_tracking_number TEXT;
