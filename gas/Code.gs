// =====================================================================
// 百錬自得 - Google Apps Script バックエンド
// =====================================================================

const SPREADSHEET_ID  = '1jmXq7bdvSG_HVjTe0ArEAi8xStmVfh_FpIb90TxYS5I';
const SHEET_SETTINGS  = 'settings';
const SHEET_LOGS      = 'logs';
const SHEET_STATUS    = 'user_status';
const SHEET_ERRORLOGS = 'error_logs';

// =====================================================================
// ログユーティリティ
// =====================================================================
function gasLog(level, action, message, detail) {
  try {
    const ss   = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet  = ss.getSheetByName(SHEET_ERRORLOGS);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_ERRORLOGS);
      sheet.appendRow(['timestamp', 'level', 'action', 'message', 'detail']);
      sheet.getRange(1,1,1,5).setFontWeight('bold').setBackground('#1e1b4b').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }
    const ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
    sheet.appendRow([ts, level, action, message, detail ? JSON.stringify(detail).slice(0,500) : '']);
    if (sheet.getLastRow() > 1001) sheet.deleteRows(2, 50);
  } catch(e) { console.error('gasLog failed:', e); }
}

// CORS ヘッダー付きレスポンス生成
function createResponse(data, status) {
  const payload = JSON.stringify({ status: status || 'ok', data: data });
  return ContentService
    .createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}

function createError(message, code) {
  const payload = JSON.stringify({ status: 'error', message: message, code: code || 400 });
  return ContentService
    .createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}

// =====================================================================
// doGet: データ取得
// =====================================================================
function doGet(e) {
  const action = e.parameter ? e.parameter.action : 'unknown';
  try {
    gasLog('INFO', action, 'doGet called');
    switch (action) {
      case 'getSettings':   return getSettings();
      case 'getLogs':       return getLogs(e.parameter);
      case 'getUserStatus': return getUserStatus();
      case 'getDashboard':  return getDashboard();
      default:
        gasLog('WARN', action, 'Unknown action');
        return createError('Unknown action: ' + action);
    }
  } catch (err) {
    gasLog('ERROR', action, err.message, { stack: err.stack });
    return createError('Server error: ' + err.message, 500);
  }
}

// =====================================================================
// doPost: データ書き込み
// =====================================================================
function doPost(e) {
  let action = 'unknown';
  try {
    const body = JSON.parse(e.postData.contents);
    action = body.action;
    gasLog('INFO', action, 'doPost called');
    switch (action) {
      case 'saveLog':        return saveLog(body);
      case 'updateSettings': return updateSettings(body);
      default:
        gasLog('WARN', action, 'Unknown action');
        return createError('Unknown action: ' + action);
    }
  } catch (err) {
    gasLog('ERROR', action, err.message, { stack: err.stack, raw: e.postData ? e.postData.contents.slice(0,200) : '' });
    return createError('Server error: ' + err.message, 500);
  }
}

// =====================================================================
// A. settings シート操作
// =====================================================================
function getSettings() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_SETTINGS);
  const rows  = sheet.getDataRange().getValues();

  // ヘッダー行をスキップ
  const items = rows.slice(1).map(row => ({
    item_name: row[0],
    is_active: row[1] === true || row[1] === 'TRUE' || row[1] === 'true'
  })).filter(item => item.item_name);

  return createResponse(items);
}

function updateSettings(body) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_SETTINGS);

  // 既存データをクリアしてヘッダー再設置
  sheet.clearContents();
  sheet.appendRow(['item_name', 'is_active']);

  body.items.forEach(item => {
    sheet.appendRow([item.item_name, item.is_active]);
  });

  return createResponse({ updated: body.items.length });
}

// =====================================================================
// B. logs シート操作
// =====================================================================
function saveLog(body) {
  const ss        = SpreadsheetApp.openById(SPREADSHEET_ID);
  const logSheet  = ss.getSheetByName(SHEET_LOGS);
  const statSheet = ss.getSheetByName(SHEET_STATUS);

  const date  = body.date;
  const items = body.items; // [{ item_name, score }]

  // XP計算
  const BASE_XP    = 50;
  const SCORE_BONUS = { 5: 30, 4: 20, 3: 10, 2: 5, 1: 2 };
  let totalSessionXp = BASE_XP;

  items.forEach(item => {
    const bonus = SCORE_BONUS[item.score] || 0;
    const xp    = bonus;
    totalSessionXp += xp;
    logSheet.appendRow([date, item.item_name, item.score, xp]);
  });

  // user_status を更新
  // データ行が無い場合（初回）は自動で初期化する
  const statusData = statSheet.getDataRange().getValues();
  const hasDataRow = statusData.length >= 2 && statusData[1] !== undefined;
  let currentXp    = hasDataRow ? (parseInt(statusData[1][0]) || 0) : 0;
  const newXp      = currentXp + totalSessionXp;
  const newLevel   = calcLevel(newXp);
  const newTitle   = calcTitle(newXp);

  if (hasDataRow) {
    // 既存行を上書き
    statSheet.getRange(2, 1, 1, 3).setValues([[newXp, newLevel, newTitle]]);
  } else {
    // 初回：データ行を新規追加
    statSheet.appendRow([newXp, newLevel, newTitle]);
    gasLog('INFO', 'saveLog', 'user_status を初期化しました', { newXp, newLevel, newTitle });
  }

  return createResponse({
    xp_earned: totalSessionXp,
    total_xp:  newXp,
    level:     newLevel,
    title:     newTitle
  });
}

function getLogs(params) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_LOGS);
  const rows  = sheet.getDataRange().getValues();

  const limit = parseInt(params.limit) || 500;
  const logs  = rows.slice(1).map(row => ({
    date:      row[0],
    item_name: row[1],
    score:     parseInt(row[2]),
    xp_earned: parseInt(row[3])
  })).filter(r => r.date && r.item_name);

  // 直近 limit 件を返す
  const result = logs.slice(-limit);
  return createResponse(result);
}

// =====================================================================
// C. user_status シート操作
// =====================================================================
function getUserStatus() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_STATUS);
  const rows  = sheet.getDataRange().getValues();

  if (rows.length < 2) {
    // 初期データがなければ初期化
    sheet.appendRow([0, 1, '見習い']);
    return createResponse({ total_xp: 0, level: 1, title: '見習い' });
  }

  const row = rows[1];
  return createResponse({
    total_xp: parseInt(row[0]) || 0,
    level:    parseInt(row[1]) || 1,
    title:    row[2] || '見習い'
  });
}

// =====================================================================
// D. ダッシュボード用まとめデータ取得
// =====================================================================
function getDashboard() {
  const ss        = SpreadsheetApp.openById(SPREADSHEET_ID);
  const logSheet  = ss.getSheetByName(SHEET_LOGS);
  const statSheet = ss.getSheetByName(SHEET_STATUS);
  const setSheet  = ss.getSheetByName(SHEET_SETTINGS);

  // user_status
  const statRows  = statSheet.getDataRange().getValues();
  const status    = statRows.length >= 2
    ? { total_xp: parseInt(statRows[1][0]) || 0, level: parseInt(statRows[1][1]) || 1, title: statRows[1][2] || '見習い' }
    : { total_xp: 0, level: 1, title: '見習い' };

  // settings
  const setRows = setSheet.getDataRange().getValues();
  const settings = setRows.slice(1).map(r => ({
    item_name: r[0],
    is_active: r[1] === true || r[1] === 'TRUE' || r[1] === 'true'
  })).filter(r => r.item_name);

  // logs (全件)
  const logRows = logSheet.getDataRange().getValues();
  const logs = logRows.slice(1).map(r => ({
    date:      r[0] ? Utilities.formatDate(new Date(r[0]), 'Asia/Tokyo', 'yyyy-MM-dd') : '',
    item_name: r[1],
    score:     parseInt(r[2]),
    xp_earned: parseInt(r[3])
  })).filter(r => r.date && r.item_name);

  // 次のレベルまでのXP
  const nextLevelXp = calcNextLevelXp(status.total_xp);

  return createResponse({ status, settings, logs, nextLevelXp });
}

// =====================================================================
// E. レベル・称号計算ロジック
// =====================================================================
const LEVEL_TABLE = [
  { level: 1,  xp: 0,     title: '見習い' },
  { level: 2,  xp: 300,   title: '白帯' },
  { level: 3,  xp: 800,   title: '素振り師' },
  { level: 4,  xp: 1800,  title: '初段' },
  { level: 5,  xp: 3500,  title: '弐段' },
  { level: 6,  xp: 6000,  title: '参段' },
  { level: 7,  xp: 9500,  title: '四段' },
  { level: 8,  xp: 14000, title: '五段' },
  { level: 9,  xp: 20000, title: '錬士' },
  { level: 10, xp: 28000, title: '教士' },
  { level: 11, xp: 40000, title: '範士' },
];

function calcLevel(xp) {
  let level = 1;
  for (let i = LEVEL_TABLE.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_TABLE[i].xp) {
      level = LEVEL_TABLE[i].level;
      break;
    }
  }
  return level;
}

function calcTitle(xp) {
  let title = '見習い';
  for (let i = LEVEL_TABLE.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_TABLE[i].xp) {
      title = LEVEL_TABLE[i].title;
      break;
    }
  }
  return title;
}

function calcNextLevelXp(xp) {
  for (let i = 0; i < LEVEL_TABLE.length; i++) {
    if (LEVEL_TABLE[i].xp > xp) {
      return { required: LEVEL_TABLE[i].xp, title: LEVEL_TABLE[i].title };
    }
  }
  return { required: null, title: '最高位' };
}
