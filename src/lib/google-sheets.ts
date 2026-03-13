const updateGoogleSheet = (order) => {
  const invoiceIssuerStatus = order.customer_not_invoice_issuer ? '事業者ではない' : '事業者です';
  // Google Sheets 更新ロジック...
};

export { updateGoogleSheet };