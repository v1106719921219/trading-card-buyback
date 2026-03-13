import React from 'react';

const OrderDetailPage = () => {
  return (
    <div>
      <h1>注文詳細</h1>
      {/* AR美品の表示を追加 */}
      <div>
        <label>
          <input type="checkbox" />
          AR美品を申し込む
        </label>
      </div>
      {/* 注文の詳細情報 */}
    </div>
  );
};

export default OrderDetailPage;