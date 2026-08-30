// eKYC本人確認データのGoogleドライブバックアップ（古物台帳）
//
// 設置手順:
// 1. https://script.google.com で「新しいプロジェクト」を作成し、このコードを貼り付ける
// 2. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」
//    - 次のユーザーとして実行: 自分
//    - アクセスできるユーザー: 全員
// 3. 発行されたURLを Vercel の環境変数 GOOGLE_KYC_BACKUP_SCRIPT_URL に設定する
//
// マイドライブに「古物台帳_本人確認」フォルダが自動作成され、
// その下に 年月/日付_氏名_注文番号/ の形で画像と記録テキストが保存される。

const ROOT_FOLDER_NAME = '古物台帳_本人確認';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.type !== 'kyc') {
      return ContentService.createTextOutput('NG: unknown type');
    }

    const root = getOrCreateFolder_(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
    const ym = getOrCreateFolder_(root, data.yearMonth || 'unknown');
    const folder = getOrCreateFolder_(ym, data.folderName || 'unknown');

    (data.images || []).forEach(function (img) {
      // 再実行時の重複を避けるため、同名ファイルは先に削除
      const existing = folder.getFilesByName(img.name);
      while (existing.hasNext()) existing.next().setTrashed(true);
      const blob = Utilities.newBlob(Utilities.base64Decode(img.base64), img.mimeType, img.name);
      folder.createFile(blob);
    });

    if (data.infoText) {
      const name = '本人確認記録.txt';
      const existing = folder.getFilesByName(name);
      while (existing.hasNext()) existing.next().setTrashed(true);
      folder.createFile(name, data.infoText, MimeType.PLAIN_TEXT);
    }

    return ContentService.createTextOutput('OK');
  } catch (err) {
    return ContentService.createTextOutput('NG: ' + err);
  }
}

function getOrCreateFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
