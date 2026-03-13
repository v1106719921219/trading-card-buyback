import React from 'react';

const OrderDetailPage = ({ order }) => {
  const isInvoiceIssuer = order.customer_not_invoice_issuer ? '事業者ではない' : '事業者です';

  return (
    <div>
      <h1>注文詳細</h1>
      <p>注文ID: {order.id}</p>
      <p>適格請求書発行事業者: {isInvoiceIssuer}</p>
      {/* 他の詳細... */}
    </div>
  );
};

export default OrderDetailPage;