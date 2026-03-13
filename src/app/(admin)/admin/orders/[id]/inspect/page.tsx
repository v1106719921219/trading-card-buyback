import React from 'react';

const InspectOrderPage = () => {
  return (
    <div>
      <h1>注文の検品</h1>
      {/* AR美品の表示を追加 */}
      <div>
        <label>
          <input type="checkbox" name="arQuality" />
          AR美品を申し込む
        </label>
      </div>
      {/* 検品情報の表示 */}
      <div>
        {/* 検品情報の内容 */}
      </div>
    </div>
  );
};

export default InspectOrderPage;