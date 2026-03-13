import React, { useState } from 'react';

const ApplyForm = () => {
  const [isInvoiceIssuer, setIsInvoiceIssuer] = useState(false);

  const handleCheckboxChange = () => {
    setIsInvoiceIssuer(!isInvoiceIssuer);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    // 送信ロジック
    const customerData = {
      customer_not_invoice_issuer: !isInvoiceIssuer,
      // 他のデータ...
    };
    console.log(customerData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <label>
        <input
          type="checkbox"
          checked={isInvoiceIssuer}
          onChange={handleCheckboxChange}
        />
        適格請求書発行事業者です
      </label>
      <button type="submit">送信</button>
    </form>
  );
};

export default ApplyForm;