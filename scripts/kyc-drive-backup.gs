// 買取スクエア 古物台帳 Webhook（統合版）
// 1つのウェブアプリで以下の両方を処理する:
//   A) 注文台帳への行追記（従来機能）: {row: [...]} を受け取りスプレッドシートに追記
//   B) eKYC本人確認データのDriveバックアップ: {type:'kyc', ...} を受け取り画像・記録を保存
//
// 更新手順（既存の台帳プロジェクトに上書きでOK）:
// 1. このコードをエディタに貼り付けて保存
// 2. デプロイ → デプロイを管理 → 鉛筆アイコン → バージョン「新バージョン」→ デプロイ
//    （URLは変わらないので、Vercelの環境変数はそのままでよい）

const LEDGER_SPREADSHEET_ID = '1PX1CswlyImfMfVN9mvx6NYW6spWKeqahHR8pXbRLoXs';
const ROOT_FOLDER_NAME = '古物台帳_本人確認';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // B) eKYCバックアップ
    if (data.type === 'kyc') {
      return handleKycBackup_(data);
    }

    // A) 注文台帳への行追記（従来機能）
    if (data.row) {
      SpreadsheetApp.openById(LEDGER_SPREADSHEET_ID).getSheets()[0].appendRow(data.row);
      return ContentService.createTextOutput('OK');
    }

    return ContentService.createTextOutput('NG: unknown payload');
  } catch (err) {
    return ContentService.createTextOutput('NG: ' + err);
  }
}

function handleKycBackup_(data) {
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
}

function getOrCreateFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
