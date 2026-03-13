import React from 'react';

const OrdersPage = () => {
  return (
    <div>
      <h1>注文一覧</h1>
      {/* AR美品の表示を追加 */}
      <div>
        <label>
          <input type="checkbox" />
          AR美品を申し込む
        </label>
      </div>
      {/* 注文の一覧 */}
    </div>
  );
};

export default OrdersPage;