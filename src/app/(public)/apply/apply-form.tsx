import React, { useState } from 'react';

const ApplyForm = () => {
  const [formData, setFormData] = useState({
    // ...他のフィールド
    items: [],
    isComplete: false,
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // 申込完了後の処理
    if (formData.isComplete) {
      // 既存の買取アイテムを入力するロジック
      // 例: APIに送信するなど
    } else {
      // 新たに追加するアイテムのみを入力するロジック
      // 例: APIに送信するなど
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* 他のフォームフィールド */}
      <label>
        申込完了後に全ての買取アイテムを入力しますか？
        <input
          type="checkbox"
          name="isComplete"
          checked={formData.isComplete}
          onChange={() => setFormData({ ...formData, isComplete: !formData.isComplete })}
        />
      </label>
      {/* 他のフォームフィールド */}
      <button type="submit">送信</button>
    </form>
  );
};

export default ApplyForm;