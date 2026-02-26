# 適格請求書事業者の対応プラン

## 変更内容

### 1. 申込フォーム（apply-form.tsx）
- チェックボックスのラベルを「適格請求書発行事業者ではありません」→「適格請求書発行事業者です」に変更
- ロジック反転: チェック = 事業者である → `customer_not_invoice_issuer = false` として保存
- 確認画面の表示を修正（現在は常に「該当しない」と表示されるバグも修正）

### 2. 振込管理ページ（payments/page.tsx）
- 注文一覧に「適格請求書事業者」のバッジ/アイコンを追加
- 事業者の注文が一目でわかるようにする

### 3. 振込完了メール（email.ts）
- 適格請求書事業者の場合、振込完了メールに「請求書の送付をお願いします」という案内文を追加
- 送付先情報（メールアドレスや住所）も記載

### 4. 管理画面 注文詳細（orders/[id]/page.tsx）
- 表示を「該当しない」/「未確認」→「事業者です」/「事業者ではない」に変更

### 5. Google Sheetsバックアップ
- ラベルを合わせて更新

## 対象ファイル
- `src/app/(public)/apply/apply-form.tsx` — フォームUI変更
- `src/app/(admin)/admin/payments/page.tsx` — バッジ追加
- `src/app/(admin)/admin/orders/[id]/page.tsx` — 表示修正
- `src/lib/email.ts` — 振込完了メールに請求書依頼文追加
- `src/lib/google-sheets.ts` — ラベル更新
