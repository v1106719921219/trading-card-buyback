import React from 'react';

const OrderDetailPage = () => {
  return (
    <div>
      <h1>注文詳細</h1>
      {/* AR美品の表示を追加 */}
      <div>
        <label>
          <input type="checkbox" name="arQuality" />
          AR美品を申し込む
        </label>
      </div>
      {/* 注文詳細の表示 */}
      <div>
        {/* 注文詳細の内容 */}
      </div>
    </div>
  );
};

export default OrderDetailPage;