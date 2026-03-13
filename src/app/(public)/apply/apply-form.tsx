import React from 'react';

const ApplyForm = () => {
  return (
    <form>
      {/* ここからAR美品の表示を削除 */}
      {/* <div>
        <label>
          <input type="checkbox" name="arQuality" />
          AR美品を申し込む
        </label>
      </div> */}
      {/* ここまで削除 */}
      <div>
        <label>
          名前:
          <input type="text" name="name" required />
        </label>
      </div>
      <div>
        <label>
          メール:
          <input type="email" name="email" required />
        </label>
      </div>
      <button type="submit">申し込む</button>
    </form>
  );
};

export default ApplyForm;