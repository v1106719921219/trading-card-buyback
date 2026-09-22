-- 申込後に追加された明細を識別できるようにする。
-- NULL = 申込時の明細 / 値あり = その時刻に後から追加された明細。
alter table order_items add column if not exists added_at timestamptz;

comment on column order_items.added_at is '申込後に追加された明細の追加時刻。NULLなら申込時の明細';
