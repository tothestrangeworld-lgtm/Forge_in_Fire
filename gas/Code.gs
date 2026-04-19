// =====================================================================
// 百錬自得 - Google Apps Script バックエンド
// =====================================================================

const SPREADSHEET_ID  = '1jmXq7bdvSG_HVjTe0ArEAi8xStmVfh_FpIb90TxYS5I';
const SHEET_SETTINGS  = 'settings';
const SHEET_LOGS      = 'logs';
const SHEET_STATUS    = 'user_status';
// user_status 列構成:
// A: total_xp  B: level  C: title  D: last_practice_date  E: last_decay_date
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
      case 'getTechniques': return getTechniques();
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
      case 'resetStatus':        return resetStatus();
      case 'updateTechniqueRating': return updateTechniqueRating(body);
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

  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  if (hasDataRow) {
    // 既存行を上書き（last_practice_date = today, last_decay_date = today でリセット）
    statSheet.getRange(2, 1, 1, 5).setValues([[newXp, newLevel, newTitle, today, today]]);
  } else {
    statSheet.appendRow([newXp, newLevel, newTitle, today, today]);
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

  // XP減衰を適用してから status を読む
  const decayResult = applyDecay(ss);

  // user_status（減衰適用後の最新値を読み直す）
  const statRows  = statSheet.getDataRange().getValues();
  const status    = statRows.length >= 2
    ? {
        total_xp:           parseInt(statRows[1][0]) || 0,
        level:              parseInt(statRows[1][1]) || 1,
        title:              statRows[1][2] || '入門',
        last_practice_date: statRows[1][3] || '',
      }
    : { total_xp: 0, level: 1, title: '入門', last_practice_date: '' };

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

  return createResponse({ status, settings, logs, nextLevelXp, decay: decayResult });
}

// =====================================================================
// E. レベル・称号計算ロジック（レベル1〜99・指数カーブ）
// =====================================================================

// xpForLevel(n) = floor(100 * (n-1)^1.8)
// 低レベルはサクサク、高レベルになるほど重い
function xpForLevel(level) {
  if (level <= 1) return 0;
  return Math.floor(100 * Math.pow(level - 1, 1.8));
}

// 称号テーブル（キリのいいレベルのみ・剣道にちなんだ称号）
const TITLE_MAP = {
  1:  '入門',
  5:  '素振り',
  10: '初段',
  15: '弐段',
  20: '参段',
  25: '四段',
  30: '五段',
  35: '錬士',
  40: '教士',
  50: '範士',
  60: '剣聖',
  70: '剣豪',
  80: '剣鬼',
  90: '剣神',
  99: '剣道の神',
};

function calcLevel(xp) {
  let level = 1;
  for (let n = 1; n <= 99; n++) {
    if (xp >= xpForLevel(n)) level = n;
    else break;
  }
  return Math.min(level, 99);
}

function calcTitle(xp) {
  const level = calcLevel(xp);
  let title = '入門';
  const milestones = Object.keys(TITLE_MAP).map(Number).sort((a,b) => a-b);
  for (const lv of milestones) {
    if (level >= lv) title = TITLE_MAP[lv];
    else break;
  }
  return title;
}

function calcNextLevelXp(xp) {
  const level = calcLevel(xp);
  if (level >= 99) return { required: null, title: '剣道の神' };
  return { required: xpForLevel(level + 1), title: calcTitle(xpForLevel(level + 1)) };
}

// =====================================================================
// F. リセット機能
// =====================================================================
function resetStatus() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_STATUS);
  const rows  = sheet.getDataRange().getValues();
  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  if (rows.length >= 2) {
    sheet.getRange(2, 1, 1, 5).setValues([[0, 1, '入門', '', today]]);
  } else {
    sheet.appendRow([0, 1, '入門', '', today]);
  }
  gasLog('INFO', 'resetStatus', 'ステータスをリセットしました');
  return createResponse({ total_xp: 0, level: 1, title: '入門' });
}

// =====================================================================
// G. XP 減衰ロジック
// =====================================================================
// アルゴリズム:
//   猶予期間 = 3日（週2回ペース=3.5日間隔の約半分）
//   4日目以降: daily_penalty(d) = floor(20 × (d-3)^1.3)
//   週2回ペースで稽古すれば減衰と釣り合う設計
//   (7日間稽古なし → 累計約280XP減 ≒ 週2回稽古の獲得XPと相殺)
// =====================================================================
function dailyPenalty(daysSincePractice) {
  if (daysSincePractice <= 3) return 0;
  return Math.floor(20 * Math.pow(daysSincePractice - 3, 1.3));
}

function applyDecay(ss) {
  const sheet = ss.getSheetByName(SHEET_STATUS);
  const rows  = sheet.getDataRange().getValues();
  if (rows.length < 2) return { applied: 0, days_absent: 0 };

  const row = rows[1];
  const totalXp         = parseInt(row[0]) || 0;
  const lastPracticeStr = row[3] || '';
  const lastDecayStr    = row[4] || '';

  const today    = new Date(); today.setHours(0,0,0,0);
  const todayStr = Utilities.formatDate(today, 'Asia/Tokyo', 'yyyy-MM-dd');

  // last_decay_date が今日なら既に適用済み → スキップ
  if (lastDecayStr === todayStr) {
    const daysAbsent = lastPracticeStr
      ? Math.floor((today - new Date(lastPracticeStr)) / 86400000)
      : 0;
    return { applied: 0, days_absent: daysAbsent, today_penalty: dailyPenalty(daysAbsent) };
  }

  // last_practice_date が空の場合（旧データ互換）→ logs シートから最終稽古日を自動取得
  let resolvedLastPractice = lastPracticeStr;
  if (!resolvedLastPractice) {
    const logSheet = ss.getSheetByName(SHEET_LOGS);
    const logRows  = logSheet.getDataRange().getValues();
    // ヘッダーを除いたA列（date）から最大値を取得
    const logDates = logRows.slice(1)
      .map(r => r[0] ? String(r[0]).slice(0, 10) : '')
      .filter(d => d.match(/^\d{4}-\d{2}-\d{2}$/))
      .sort();
    if (logDates.length > 0) {
      resolvedLastPractice = logDates[logDates.length - 1];
      // user_status の D列を補完して次回から使えるようにする
      sheet.getRange(2, 4).setValue(resolvedLastPractice);
      gasLog('INFO', 'applyDecay', 'last_practice_date を logs から自動補完', { resolvedLastPractice });
    }
  }

  // 稽古記録が一件もなければ減衰なし
  if (!resolvedLastPractice) {
    sheet.getRange(2, 5).setValue(todayStr);
    return { applied: 0, days_absent: 0, today_penalty: 0 };
  }

  const lastPractice = new Date(resolvedLastPractice); lastPractice.setHours(0,0,0,0);
  // last_decay_date が空の場合は last_practice_date の翌日から計算開始
  const lastDecay    = lastDecayStr ? new Date(lastDecayStr) : new Date(lastPractice);
  lastDecay.setHours(0,0,0,0);

  // lastDecay の翌日〜今日まで1日ずつ減衰を計算
  let totalDecay   = 0;
  const cursor     = new Date(lastDecay);
  cursor.setDate(cursor.getDate() + 1);

  while (cursor <= today) {
    const daysGap = Math.floor((cursor - lastPractice) / 86400000);
    totalDecay += dailyPenalty(daysGap);
    cursor.setDate(cursor.getDate() + 1);
  }

  const daysAbsent   = Math.floor((today - lastPractice) / 86400000);
  const todayPenalty = dailyPenalty(daysAbsent);

  if (totalDecay <= 0) {
    sheet.getRange(2, 5).setValue(todayStr);
    return { applied: 0, days_absent: daysAbsent, today_penalty: todayPenalty };
  }

  // 適用（XPは0未満にしない）
  const newXp    = Math.max(0, totalXp - totalDecay);
  const newLevel = calcLevel(newXp);
  const newTitle = calcTitle(newXp);

  sheet.getRange(2, 1, 1, 5).setValues([[newXp, newLevel, newTitle, resolvedLastPractice, todayStr]]);
  gasLog('INFO', 'applyDecay', `XP減衰適用: -${totalDecay}XP (${daysAbsent}日間稽古なし)`, { totalDecay, daysAbsent, newXp });

  return { applied: totalDecay, days_absent: daysAbsent, today_penalty: todayPenalty };
}

// =====================================================================
// H. TechniqueMastery シート操作
// =====================================================================
const SHEET_TECHNIQUE = 'TechniqueMastery';

/**
 * TechniqueMastery シートの全データを取得する
 * ヘッダー: ID, BodyPart, ActionType, SubCategory, Name, Points, LastRating
 */
function getTechniques() {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_TECHNIQUE);

    if (!sheet) {
      gasLog('WARN', 'getTechniques', 'TechniqueMastery シートが見つかりません');
      return createError('TechniqueMastery sheet not found', 404);
    }

    const rows = sheet.getDataRange().getValues();
    if (rows.length < 2) {
      return createResponse([]);
    }

    // ヘッダー行をスキップしてオブジェクト配列に変換
    const techniques = rows.slice(1).map(row => ({
      id:          String(row[0] ?? ''),
      bodyPart:    String(row[1] ?? ''),
      actionType:  String(row[2] ?? ''),
      subCategory: String(row[3] ?? ''),
      name:        String(row[4] ?? ''),
      points:      Number(row[5]) || 0,
      lastRating:  Number(row[6]) || 0,
    })).filter(t => t.id && t.name);

    gasLog('INFO', 'getTechniques', `${techniques.length}件取得`);
    return createResponse(techniques);

  } catch (err) {
    gasLog('ERROR', 'getTechniques', err.message, { stack: err.stack });
    return createError('Server error: ' + err.message, 500);
  }
}

/**
 * 技のIDと星評価を受け取り、Points に加算・LastRating を上書きする
 * body: { action, id: string, rating: number (1〜5) }
 */
function updateTechniqueRating(body) {
  const { id, rating } = body;

  if (!id) {
    return createError('id は必須です', 400);
  }
  const ratingNum = parseInt(rating);
  if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return createError('rating は 1〜5 の整数で指定してください', 400);
  }

  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_TECHNIQUE);

    if (!sheet) {
      return createError('TechniqueMastery sheet not found', 404);
    }

    const rows      = sheet.getDataRange().getValues();
    const targetRow = rows.findIndex((row, i) => i > 0 && String(row[0]) === String(id));

    if (targetRow === -1) {
      gasLog('WARN', 'updateTechniqueRating', `ID=${id} が見つかりません`);
      return createError(`ID=${id} の技が見つかりません`, 404);
    }

    const sheetRow    = targetRow + 1; // 1始まりに変換
    const currentPts  = Number(rows[targetRow][5]) || 0;
    const newPoints   = currentPts + ratingNum;

    // F列(6列目)= Points, G列(7列目)= LastRating を更新
    sheet.getRange(sheetRow, 6).setValue(newPoints);
    sheet.getRange(sheetRow, 7).setValue(ratingNum);

    gasLog('INFO', 'updateTechniqueRating', `ID=${id} Points:${currentPts}→${newPoints} Rating:${ratingNum}`);

    return createResponse({
      id:         String(id),
      points:     newPoints,
      lastRating: ratingNum,
    });

  } catch (err) {
    gasLog('ERROR', 'updateTechniqueRating', err.message, { stack: err.stack });
    return createError('Server error: ' + err.message, 500);
  }
}
