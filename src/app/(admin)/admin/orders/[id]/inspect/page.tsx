import React from 'react';

const InspectOrderPage = () => {
  return (
    <div>
      <h1>注文検品</h1>
      {/* AR美品の表示を追加 */}
      <div>
        <label>
          <input type="checkbox" />
          AR美品を申し込む
        </label>
      </div>
      {/* 検品の内容 */}
    </div>
  );
};

export default InspectOrderPage;