const sendPaymentConfirmationEmail = (customer) => {
  const message = `
    振込が完了しました。
    ${customer.customer_not_invoice_issuer ? '請求書の送付をお願いします。' : ''}
    送付先情報: ${customer.email}
  `;
  // メール送信ロジック...
};

export { sendPaymentConfirmationEmail };