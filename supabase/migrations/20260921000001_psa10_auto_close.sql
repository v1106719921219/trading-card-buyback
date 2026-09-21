-- PSA10シングルの自動締切: 申込が1枚でも入ったら価格表から自動で外す。
-- show_in_price_list=false だけだと毎朝の一括表示で復活してしまうため、
-- 自動締切であることを示す時刻カラムを持たせる（解除は管理画面の表示切替）。
alter table products add column if not exists auto_closed_at timestamptz;

comment on column products.auto_closed_at is 'PSA10自動締切の時刻。申込発生時にセットし価格表非表示に。スタッフが表示に戻すとクリアされる';
