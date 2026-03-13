const validateOrder = (order) => {
  if (order.customer_not_invoice_issuer === undefined) {
    throw new Error('適格請求書発行事業者の情報が必要です。');
  }
  // 他のバリデーション...
};

export { validateOrder };