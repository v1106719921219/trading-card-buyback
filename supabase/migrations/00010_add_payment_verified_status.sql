-- Add '振込確認済' to orders status check constraint
ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN (
    '申込',
    '発送済',
    '到着',
    '検品中',
    '検品完了',
    '振込済',
    '振込確認済',
    'キャンセル'
));
