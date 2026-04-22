// =====================================================================
// 百錬自得 - Google Apps Script バックエンド（マルチユーザー対応版）
// =====================================================================

const SPREADSHEET_ID       = '1jmXq7bdvSG_HVjTe0ArEAi8xStmVfh_FpIb90TxYS5I';

// ユーザー固有シート（A列 = user_id）
const SHEET_SETTINGS       = 'settings';        // user_id, item_name, is_active
const SHEET_LOGS           = 'logs';             // user_id, date, item_name, score, xp_earned
const SHEET_STATUS         = 'user_status';      // user_id, total_xp, level, title, last_practice_date, last_decay_date
const SHEET_TECHNIQUE      = 'TechniqueMastery'; // user_id, ID, BodyPart, ActionType, SubCategory, Name, Points, LastRating
const SHEET_XP_HIST        = 'xp_history';       // user_id, date, type, amount, reason, total_xp_after, level, title

// 全ユーザー共通マスタ（user_id なし）
const SHEET_TITLE_MASTER   = 'title_master';
const SHEET_EPITHET_MASTER = 'EpithetMaster';
const SHEET_USER_MASTER    = 'UserMaster';

// システム用
const SHEET_ERRORLOGS      = 'error_logs';

// =====================================================================
// A. ユーティリティ
// =====================================================================

function createResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', data: data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function createError(message, code) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'error', message: message, code: code || 400 }))
    .setMimeType(ContentService.MimeType.JSON);
}

function gasLog(level, action, message, detail) {
  try {
    const ss   = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet  = ss.getSheetByName(SHEET_ERRORLOGS);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_ERRORLOGS);
      sheet.appendRow(['timestamp', 'level', 'action', 'message', 'detail']);
      sheet.getRange(1,1,1,5).setFontWeight('bold').setBackground('#1e1b4b').setFontColor('#fff');
      sheet.setFrozenRows(1);
    }
    const ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
    sheet.appendRow([ts, level, action, message, detail ? JSON.stringify(detail).slice(0,500) : '']);
    if (sheet.getLastRow() > 1001) sheet.deleteRows(2, 50);
  } catch(e) { console.error('gasLog failed:', e); }
}

function writeXpHistory(ss, userId, type, amount, reason, totalXpAfter, level, title) {
  try {
    let sheet = ss.getSheetByName(SHEET_XP_HIST);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_XP_HIST);
      sheet.appendRow(['user_id', 'date', 'type', 'amount', 'reason', 'total_xp_after', 'level', 'title']);
      sheet.getRange(1,1,1,8).setFontWeight('bold').setBackground('#1e1b4b').setFontColor('#fff');
      sheet.setFrozenRows(1);
    }
    const ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
    sheet.appendRow([userId, ts, type, amount, reason, totalXpAfter, level, title]);
  } catch(e) { console.error('writeXpHistory failed:', e); }
}

/**
 * 安全な行削除: A列が user_id と一致する行を下から順に削除
 * sheet.clearContents() は絶対に使わない
 */
function deleteRowsByUserId(sheet, userId) {
  const lastRow = sheet.getLastRow();
  for (var r = lastRow; r >= 2; r--) {
    if (String(sheet.getRange(r, 1).getValue()) === String(userId)) {
      sheet.deleteRow(r);
    }
  }
}

/** A列が user_id と一致する行を返す（ヘッダー除く） */
function filterRowsByUserId(sheet, userId) {
  var rows = sheet.getDataRange().getValues();
  return rows.slice(1).filter(function(r){ return String(r[0]) === String(userId); });
}

// =====================================================================
// B. doGet
// =====================================================================
function doGet(e) {
  var action = e.parameter ? e.parameter.action : 'unknown';
  try {
    gasLog('INFO', action, 'doGet', { user_id: e.parameter.user_id || '' });
    switch (action) {
      case 'getDashboard':     return getDashboard(e.parameter);
      case 'getSettings':      return getSettings(e.parameter);
      case 'getLogs':          return getLogs(e.parameter);
      case 'getUserStatus':    return getUserStatus(e.parameter);
      case 'getTechniques':    return getTechniques(e.parameter);
      case 'getEpithetMaster': return getEpithetMaster();
      case 'getUsers':         return getUsers();
      default:
        gasLog('WARN', action, 'Unknown action');
        return createError('Unknown action: ' + action);
    }
  } catch(err) {
    gasLog('ERROR', action, err.message, { stack: err.stack });
    return createError('Server error: ' + err.message, 500);
  }
}

// =====================================================================
// C. doPost
// =====================================================================
function doPost(e) {
  var action = 'unknown';
  try {
    var body = JSON.parse(e.postData.contents);
    action = body.action;
    gasLog('INFO', action, 'doPost', { user_id: body.user_id || '' });
    switch (action) {
      case 'login':                 return login(body);
      case 'saveLog':               return saveLog(body);
      case 'updateSettings':        return updateSettings(body);
      case 'resetStatus':           return resetStatus(body);
      case 'updateTechniqueRating': return updateTechniqueRating(body);
      default:
        gasLog('WARN', action, 'Unknown action');
        return createError('Unknown action: ' + action);
    }
  } catch(err) {
    gasLog('ERROR', action, err.message, { stack: err.stack, raw: e.postData ? e.postData.contents.slice(0,200) : '' });
    return createError('Server error: ' + err.message, 500);
  }
}

// =====================================================================
// D. UserMaster
// =====================================================================

function getUserMasterSheet(ss) {
  var sheet = ss.getSheetByName(SHEET_USER_MASTER);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_USER_MASTER);
    sheet.appendRow(['user_id', 'name', 'password', 'role']);
    sheet.getRange(1,1,1,4).setFontWeight('bold').setBackground('#1e1b4b').setFontColor('#fff');
    sheet.setFrozenRows(1);
    sheet.appendRow(['U0001', '師範', '1234', 'admin']);
    gasLog('INFO', 'getUserMasterSheet', 'UserMaster シートを自動作成しました');
  }
  return sheet;
}

function getUsers() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = getUserMasterSheet(ss);
  var rows  = sheet.getDataRange().getValues();
  var users = rows.slice(1)
    .filter(function(r){ return r[0]; })
    .map(function(r){ return { user_id: String(r[0]), name: String(r[1]), role: String(r[3]) }; });
  return createResponse(users);
}

function login(body) {
  var userId   = body.user_id;
  var name     = body.name;
  var password = body.password;
  if (!password) return createError('password は必須です', 400);

  var ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet   = getUserMasterSheet(ss);
  var rows    = sheet.getDataRange().getValues();
  var matched = null;

  for (var i = 1; i < rows.length; i++) {
    var r        = rows[i];
    var idMatch  = userId && String(r[0]) === String(userId);
    var nmMatch  = name   && String(r[1]) === String(name);
    if ((idMatch || nmMatch) && String(r[2]) === String(password)) {
      matched = r;
      break;
    }
  }

  if (!matched) {
    gasLog('WARN', 'login', 'ログイン失敗', { user_id: userId, name: name });
    return createError('ユーザーIDまたはパスワードが正しくありません', 401);
  }

  gasLog('INFO', 'login', 'ログイン成功: ' + matched[0]);
  return createResponse({ user_id: String(matched[0]), name: String(matched[1]), role: String(matched[3]) });
}

// =====================================================================
// E. settings
// =====================================================================

function getSettings(params) {
  var userId = params.user_id;
  if (!userId) return createError('user_id は必須です', 400);

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_SETTINGS);
  if (!sheet) return createResponse([]);

  var rows  = filterRowsByUserId(sheet, userId);
  var items = rows.map(function(r){
    return { item_name: String(r[1]), is_active: r[2] === true || r[2] === 'TRUE' || r[2] === 'true' };
  }).filter(function(r){ return r.item_name; });

  return createResponse(items);
}

function updateSettings(body) {
  var userId = body.user_id;
  var items  = body.items;
  if (!userId) return createError('user_id は必須です', 400);

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_SETTINGS);
  if (!sheet) return createError('settings シートが存在しません', 500);

  deleteRowsByUserId(sheet, userId);
  items.forEach(function(item){
    sheet.appendRow([userId, item.item_name, item.is_active]);
  });

  return createResponse({ updated: items.length });
}

// =====================================================================
// F. logs
// =====================================================================

function getLogs(params) {
  var userId = params.user_id;
  if (!userId) return createError('user_id は必須です', 400);

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_LOGS);
  if (!sheet) return createResponse([]);

  var limit = parseInt(params.limit) || 500;
  var rows  = filterRowsByUserId(sheet, userId);
  var logs  = rows.map(function(r){
    return {
      date:      r[1] ? Utilities.formatDate(new Date(r[1]), 'Asia/Tokyo', 'yyyy-MM-dd') : '',
      item_name: String(r[2]),
      score:     parseInt(r[3]),
      xp_earned: parseInt(r[4]),
    };
  }).filter(function(r){ return r.date && r.item_name; });

  return createResponse(logs.slice(-limit));
}

function saveLog(body) {
  var userId = body.user_id;
  var date   = body.date;
  var items  = body.items;
  if (!userId) return createError('user_id は必須です', 400);

  var ss        = SpreadsheetApp.openById(SPREADSHEET_ID);
  var logSheet  = ss.getSheetByName(SHEET_LOGS);
  var statSheet = ss.getSheetByName(SHEET_STATUS);

  var BASE_XP     = 50;
  var SCORE_BONUS = { 5:30, 4:20, 3:10, 2:5, 1:2 };
  var totalXp     = BASE_XP;

  items.forEach(function(item){
    var bonus = SCORE_BONUS[item.score] || 0;
    totalXp += bonus;
    logSheet.appendRow([userId, date, item.item_name, item.score, bonus]);
  });

  // user_status 更新
  var statRows  = filterRowsByUserId(statSheet, userId);
  var hasRow    = statRows.length > 0;
  var currentXp = hasRow ? (parseInt(statRows[0][1]) || 0) : 0;
  var newXp     = currentXp + totalXp;
  var newLevel  = calcLevel(newXp);
  var titleMD   = getTitleMasterData(ss);
  var newTitle  = calcTitleFromMaster(newLevel, titleMD);
  var today     = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

  if (hasRow) {
    var allRows = statSheet.getDataRange().getValues();
    for (var r = allRows.length; r >= 2; r--) {
      if (String(allRows[r-1][0]) === String(userId)) {
        statSheet.getRange(r, 1, 1, 6).setValues([[userId, newXp, newLevel, newTitle, today, today]]);
        break;
      }
    }
  } else {
    statSheet.appendRow([userId, newXp, newLevel, newTitle, today, today]);
  }

  writeXpHistory(ss, userId, 'gain', totalXp, '稽古記録（' + date + '・' + items.length + '項目）', newXp, newLevel, newTitle);
  return createResponse({ xp_earned: totalXp, total_xp: newXp, level: newLevel, title: newTitle });
}

// =====================================================================
// G. user_status
// =====================================================================

function getUserStatus(params) {
  var userId = params.user_id;
  if (!userId) return createError('user_id は必須です', 400);

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_STATUS);
  if (!sheet) return createResponse({ total_xp:0, level:1, title:'入門' });

  var rows = filterRowsByUserId(sheet, userId);
  if (rows.length === 0) return createResponse({ total_xp:0, level:1, title:'入門' });

  var row = rows[0];
  return createResponse({
    total_xp: parseInt(row[1]) || 0, level: parseInt(row[2]) || 1,
    title: String(row[3]) || '入門', last_practice_date: String(row[4] || ''),
  });
}

function resetStatus(body) {
  var userId = body.user_id;
  if (!userId) return createError('user_id は必須です', 400);

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_STATUS);
  var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

  deleteRowsByUserId(sheet, userId);
  sheet.appendRow([userId, 0, 1, '入門', '', today]);

  writeXpHistory(ss, userId, 'reset', 0, 'レベルリセット', 0, 1, '入門');
  gasLog('INFO', 'resetStatus', 'リセット: ' + userId);
  return createResponse({ total_xp:0, level:1, title:'入門' });
}

// =====================================================================
// H. getDashboard
// =====================================================================

function getDashboard(params) {
  var userId = params.user_id;
  if (!userId) return createError('user_id は必須です', 400);

  var ss        = SpreadsheetApp.openById(SPREADSHEET_ID);
  var statSheet = ss.getSheetByName(SHEET_STATUS);
  var setSheet  = ss.getSheetByName(SHEET_SETTINGS);
  var logSheet  = ss.getSheetByName(SHEET_LOGS);

  var decayResult = applyDecay(ss, userId);

  var statRows = statSheet ? filterRowsByUserId(statSheet, userId) : [];
  var status   = statRows.length > 0
    ? { total_xp: parseInt(statRows[0][1])||0, level: parseInt(statRows[0][2])||1,
        title: String(statRows[0][3])||'入門', last_practice_date: String(statRows[0][4]||'') }
    : { total_xp:0, level:1, title:'入門', last_practice_date:'' };

  var setRows  = setSheet ? filterRowsByUserId(setSheet, userId) : [];
  var settings = setRows.map(function(r){
    return { item_name: String(r[1]), is_active: r[2]===true||r[2]==='TRUE'||r[2]==='true' };
  }).filter(function(r){ return r.item_name; });

  var logRows = logSheet ? filterRowsByUserId(logSheet, userId) : [];
  var logs    = logRows.map(function(r){
    return {
      date: r[1] ? Utilities.formatDate(new Date(r[1]),'Asia/Tokyo','yyyy-MM-dd') : '',
      item_name: String(r[2]), score: parseInt(r[3]), xp_earned: parseInt(r[4]),
    };
  }).filter(function(r){ return r.date && r.item_name; });

  var nextLevelXp   = calcNextLevelXp(status.total_xp);
  var titleMaster   = getTitleMasterData(ss);
  var epithetMaster = getEpithetMasterData(ss);

  return createResponse({ status, settings, logs, nextLevelXp, decay: decayResult, titleMaster, epithetMaster });
}

// =====================================================================
// I. TechniqueMastery
// 列: user_id(0), ID(1), BodyPart(2), ActionType(3), SubCategory(4), Name(5), Points(6), LastRating(7)
// =====================================================================

function getTechniques(params) {
  var userId = params.user_id;
  if (!userId) return createError('user_id は必須です', 400);

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_TECHNIQUE);
  if (!sheet) return createResponse([]);

  var rows = filterRowsByUserId(sheet, userId);
  var techs = rows.map(function(r){
    return {
      id: String(r[1]), bodyPart: String(r[2]||''), actionType: String(r[3]||''),
      subCategory: String(r[4]||''), name: String(r[5]||''),
      points: Number(r[6])||0, lastRating: Number(r[7])||0,
    };
  }).filter(function(t){ return t.id && t.name; });

  gasLog('INFO', 'getTechniques', techs.length + '件 user:' + userId);
  return createResponse(techs);
}

function updateTechniqueRating(body) {
  var userId    = body.user_id;
  var id        = body.id;
  var ratingNum = parseInt(body.rating);

  if (!userId) return createError('user_id は必須です', 400);
  if (!id)     return createError('id は必須です', 400);
  if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5)
    return createError('rating は 1〜5 の整数で指定してください', 400);

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_TECHNIQUE);
  if (!sheet) return createError('TechniqueMastery シートが存在しません', 404);

  var rows   = sheet.getDataRange().getValues();
  var rowIdx = -1;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(userId) && String(rows[i][1]) === String(id)) {
      rowIdx = i; break;
    }
  }

  if (rowIdx === -1) {
    gasLog('WARN', 'updateTechniqueRating', 'ID=' + id + ' user=' + userId + ' 未発見');
    return createError('user=' + userId + ' の ID=' + id + ' の技が見つかりません', 404);
  }

  var sheetRow   = rowIdx + 1;
  var currentPts = Number(rows[rowIdx][6]) || 0;
  var newPoints  = currentPts + ratingNum;

  sheet.getRange(sheetRow, 7).setValue(newPoints);
  sheet.getRange(sheetRow, 8).setValue(ratingNum);

  gasLog('INFO', 'updateTechniqueRating', 'ID=' + id + ' user=' + userId + ' ' + currentPts + '->' + newPoints);
  return createResponse({ id: String(id), points: newPoints, lastRating: ratingNum });
}

// =====================================================================
// J. 称号マスタ（共通）
// =====================================================================

function getTitleMasterData(ss) {
  var sheet = ss.getSheetByName(SHEET_TITLE_MASTER);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_TITLE_MASTER);
    sheet.appendRow(['level', 'title']);
    sheet.getRange(1,1,1,2).setFontWeight('bold').setBackground('#1e1b4b').setFontColor('#fff');
    sheet.setFrozenRows(1);
    var def = [[1,'入門'],[5,'素振り'],[10,'初段'],[15,'弐段'],[20,'参段'],
      [25,'四段'],[30,'五段'],[35,'錬士'],[40,'教士'],[50,'範士'],
      [60,'剣聖'],[70,'剣豪'],[80,'剣鬼'],[90,'剣神'],[99,'剣道の神']];
    sheet.getRange(2,1,def.length,2).setValues(def);
  }
  return sheet.getDataRange().getValues().slice(1)
    .filter(function(r){ return r[0]!==''&&r[1]!==''; })
    .map(function(r){ return { level: parseInt(r[0]), title: String(r[1]) }; })
    .filter(function(r){ return !isNaN(r.level); })
    .sort(function(a,b){ return a.level-b.level; });
}

function calcTitleFromMaster(level, master) {
  var title = master.length > 0 ? master[0].title : '入門';
  for (var i = 0; i < master.length; i++) {
    if (level >= master[i].level) title = master[i].title;
    else break;
  }
  return title;
}

// =====================================================================
// K. 二つ名マスタ（共通）
// =====================================================================

function getEpithetMasterData(ss) {
  var sheet = ss.getSheetByName(SHEET_EPITHET_MASTER);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_EPITHET_MASTER);
    sheet.appendRow(['ID','Category','TriggerValue','Name','Description']);
    sheet.getRange(1,1,1,5).setFontWeight('bold').setBackground('#1e1b4b').setFontColor('#fff');
    sheet.setFrozenRows(1);
    var def = [
      [1,'status','初期','見習い','まだ技の記録がない剣士'],
      [2,'actionType','仕掛け技','怒涛の','仕掛け技のポイントが7割以上'],
      [3,'actionType','応じ技','後の先を極めし','応じ技のポイントが7割以上'],
      [4,'subCategory','出端技','出端の','出端技のポイントが最も高い'],
      [5,'subCategory','基本','基本を極めし','基本技のポイントが最も高い'],
      [6,'balance','バランス','万能の','どの技にも偏りがない'],
    ];
    sheet.getRange(2,1,def.length,5).setValues(def);
  }
  return sheet.getDataRange().getValues().slice(1)
    .filter(function(r){ return r[0]!==''&&r[2]!==''&&r[3]!==''; })
    .map(function(r){
      return { id:String(r[0]), category:String(r[1]), triggerValue:String(r[2]), name:String(r[3]), description:String(r[4]||'') };
    });
}

function getEpithetMaster() {
  return createResponse(getEpithetMasterData(SpreadsheetApp.openById(SPREADSHEET_ID)));
}

// =====================================================================
// L. レベル・XP計算
// =====================================================================

function xpForLevel(level) {
  if (level <= 1) return 0;
  return Math.floor(100 * Math.pow(level - 1, 1.8));
}

function calcLevel(xp) {
  var level = 1;
  for (var n = 1; n <= 99; n++) {
    if (xp >= xpForLevel(n)) level = n;
    else break;
  }
  return Math.min(level, 99);
}

function calcNextLevelXp(xp) {
  var level = calcLevel(xp);
  if (level >= 99) return { required: null, title: '剣道の神' };
  return { required: xpForLevel(level + 1), title: '次の称号' };
}

// =====================================================================
// M. XP減衰ロジック
// =====================================================================

function dailyPenalty(d) {
  if (d <= 3) return 0;
  return Math.floor(20 * Math.pow(d - 3, 1.3));
}

// Sheetsの日付セルはDateオブジェクトで返るため、Utilities.formatDate で文字列化する
function toDateStr(val) {
  if (!val) return '';
  try {
    var d = (val instanceof Date) ? val : new Date(val);
    if (isNaN(d.getTime())) return '';
    return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
  } catch(e) { return ''; }
}

function applyDecay(ss, userId) {
  var sheet = ss.getSheetByName(SHEET_STATUS);
  if (!sheet) return { applied:0, days_absent:0, today_penalty:0 };

  var allRows = sheet.getDataRange().getValues();
  var rowIdx  = -1;
  for (var i = 1; i < allRows.length; i++) {
    if (String(allRows[i][0]) === String(userId)) { rowIdx = i; break; }
  }
  if (rowIdx === -1) return { applied:0, days_absent:0, today_penalty:0 };

  var row      = allRows[rowIdx];
  // 列構成: user_id(0), total_xp(1), level(2), title(3), last_practice_date(4), last_decay_date(5)
  var totalXp    = parseInt(row[1]) || 0;
  var lastPractS = toDateStr(row[4]);   // E列: last_practice_date
  var lastDecayS = toDateStr(row[5]);   // F列: last_decay_date
  var today      = new Date(); today.setHours(0,0,0,0);
  var todayStr   = Utilities.formatDate(today, 'Asia/Tokyo', 'yyyy-MM-dd');
  var sheetRow   = rowIdx + 1;

  if (lastDecayS === todayStr) {
    var da = lastPractS ? Math.floor((today - new Date(lastPractS)) / 86400000) : 0;
    return { applied:0, days_absent:da, today_penalty: dailyPenalty(da) };
  }

  // last_practice_date が空なら logs シートから自動補完
  // logs列構成: user_id(0), date(1), item_name(2), score(3), xp_earned(4)
  var resolvedLP = lastPractS;
  if (!resolvedLP) {
    var logSheet = ss.getSheetByName(SHEET_LOGS);
    if (logSheet) {
      var logDates = filterRowsByUserId(logSheet, userId)
        .map(function(r){ return toDateStr(r[1]); })   // B列(r[1])が date
        .filter(function(d){ return d.match(/^\d{4}-\d{2}-\d{2}$/); })
        .sort();
      if (logDates.length > 0) {
        resolvedLP = logDates[logDates.length - 1];
        sheet.getRange(sheetRow, 5).setValue(resolvedLP);  // E列に書き戻し
        gasLog('INFO', 'applyDecay', 'last_practice_date 自動補完 user:' + userId, { resolvedLP: resolvedLP });
      }
    }
  }
  if (!resolvedLP) {
    sheet.getRange(sheetRow, 6).setValue(todayStr);  // F列
    return { applied:0, days_absent:0, today_penalty:0 };
  }

  var lastPract = new Date(resolvedLP); lastPract.setHours(0,0,0,0);
  var lastDecay = lastDecayS ? new Date(lastDecayS) : new Date(lastPract);
  lastDecay.setHours(0,0,0,0);

  var totalDecay = 0;
  var cursor     = new Date(lastDecay);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor <= today) {
    totalDecay += dailyPenalty(Math.floor((cursor - lastPract) / 86400000));
    cursor.setDate(cursor.getDate() + 1);
  }

  var daysAbsent   = Math.floor((today - lastPract) / 86400000);
  var todayPenalty = dailyPenalty(daysAbsent);

  if (totalDecay <= 0) {
    sheet.getRange(sheetRow, 6).setValue(todayStr);
    return { applied:0, days_absent: daysAbsent, today_penalty: todayPenalty };
  }

  var newXp    = Math.max(0, totalXp - totalDecay);
  var newLevel = calcLevel(newXp);
  var titleMD  = getTitleMasterData(ss);
  var newTitle = calcTitleFromMaster(newLevel, titleMD);

  // user_status 更新: 6列（user_id〜last_decay_date）
  sheet.getRange(sheetRow, 1, 1, 6).setValues([[userId, newXp, newLevel, newTitle, resolvedLP, todayStr]]);
  gasLog('INFO', 'applyDecay', 'user=' + userId + ' -' + totalDecay + 'XP (' + daysAbsent + '日)', { newXp: newXp });
  writeXpHistory(ss, userId, 'decay', -totalDecay, daysAbsent + '日間稽古なし', newXp, newLevel, newTitle);

  return { applied: totalDecay, days_absent: daysAbsent, today_penalty: todayPenalty };
}
