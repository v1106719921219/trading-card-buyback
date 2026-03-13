import React from 'react';

const PaymentsPage = ({ orders }) => {
  return (
    <div>
      <h1>注文一覧</h1>
      <table>
        <thead>
          <tr>
            <th>注文ID</th>
            <th>適格請求書事業者</th>
          </tr>
        </thead>
        <tbody>
          {orders.map(order => (
            <tr key={order.id}>
              <td>{order.id}</td>
              <td>{order.customer_not_invoice_issuer ? '事業者ではない' : '事業者です'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default PaymentsPage;