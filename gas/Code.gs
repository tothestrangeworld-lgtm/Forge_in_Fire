// =====================================================================
// 百錬自得 - Google Apps Script バックエンド（マルチユーザー対応版）
// ★ Phase4 正規化: logs.C列 = task_id（UUID）に変更
// ★ settings シート関連を全廃止
// ★ updateTasks: スマート差分（IDを維持/新規UUID）対応
// ★ Phase6: アチーブメント（実績バッジ）システム追加
// =====================================================================

const SPREADSHEET_ID       = '1jmXq7bdvSG_HVjTe0ArEAi8xStmVfh_FpIb90TxYS5I';

// ユーザー固有シート（A列 = user_id）
// SHEET_SETTINGS は廃止済み
const SHEET_LOGS              = 'logs';               // user_id, date, task_id, score, xp_earned
const SHEET_STATUS            = 'user_status';        // user_id, total_xp, level, title, last_practice_date, last_decay_date, real_rank, motto, favorite_technique
const SHEET_XP_HIST           = 'xp_history';         // user_id, date, type, amount, reason, total_xp_after, level, title
const SHEET_USER_TASKS        = 'user_tasks';         // id, user_id, task_text, status, created_at, updated_at
const SHEET_PEER_EVALS        = 'peer_evaluations';   // evaluator_id, target_id, date, score, xp_granted
const SHEET_USER_TECHNIQUES   = 'user_techniques';    // user_id, technique_id, Points, LastRating
const SHEET_USER_ACHIEVEMENTS = 'user_achievements';  // user_id, achievement_id, unlocked_at ★ Phase6

// 全ユーザー共通マスタ（user_id なし）
const SHEET_TECH_MASTER         = 'technique_master';    // ID, BodyPart, ActionType, SubCategory, Name
const SHEET_TITLE_MASTER        = 'title_master';
const SHEET_EPITHET_MASTER      = 'EpithetMaster';
const SHEET_USER_MASTER         = 'UserMaster';
const SHEET_ACHIEVEMENT_MASTER  = 'achievement_master';  // achievement_id, name, condition_type, condition_value, description, hint, icon_type ★ Phase6

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
    var ss   = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET_ERRORLOGS);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_ERRORLOGS);
      sheet.appendRow(['timestamp', 'level', 'action', 'message', 'detail']);
      sheet.getRange(1,1,1,5).setFontWeight('bold').setBackground('#1e1b4b').setFontColor('#fff');
      sheet.setFrozenRows(1);
    }
    var ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
    sheet.appendRow([ts, level, action, message, detail ? JSON.stringify(detail).slice(0,500) : '']);
    if (sheet.getLastRow() > 1001) sheet.deleteRows(2, 50);
  } catch(e) { console.error('gasLog failed:', e); }
}

function writeXpHistory(ss, userId, type, amount, reason, totalXpAfter, level, title) {
  try {
    var sheet = ss.getSheetByName(SHEET_XP_HIST);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_XP_HIST);
      sheet.appendRow(['user_id', 'date', 'type', 'amount', 'reason', 'total_xp_after', 'level', 'title']);
      sheet.getRange(1,1,1,8).setFontWeight('bold').setBackground('#1e1b4b').setFontColor('#fff');
      sheet.setFrozenRows(1);
    }
    var ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
    sheet.appendRow([userId, ts, type, amount, reason, totalXpAfter, level, title]);
  } catch(e) { console.error('writeXpHistory failed:', e); }
}

/**
 * 安全な行削除: A列が user_id と一致する行を下から順に削除
 * sheet.clearContents() は絶対に使わない
 */
function deleteRowsByUserId(sheet, userId) {
  var lastRow = sheet.getLastRow();
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

function nowJstTs() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
}

/**
 * user_tasks シートから { task_id -> task_text } のマップを構築する。
 * getDashboard / getLogs の JOIN処理で使用。
 * archived 含む全タスクを対象にする（過去ログの復元のため）。
 */
function buildTaskTextMap(ss, userId) {
  var sheet = ss.getSheetByName(SHEET_USER_TASKS);
  if (!sheet) return {};
  var rows = sheet.getDataRange().getValues();
  var map  = {};
  // 列: id(0), user_id(1), task_text(2), status(3)
  rows.slice(1).forEach(function(r) {
    if (String(r[1]) === String(userId) && r[0] && r[2]) {
      map[String(r[0])] = String(r[2]);
    }
  });
  return map;
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
      case 'getLogs':          return getLogs(e.parameter);
      case 'getUserStatus':    return getUserStatus(e.parameter);
      case 'getTechniques':    return getTechniques(e.parameter);
      case 'getEpithetMaster': return getEpithetMaster();
      case 'getUsers':         return getUsers();
      case 'getAchievements':  return getAchievements(e.parameter);   // ★ Phase6
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
      case 'updateProfile':         return updateProfile(body);
      case 'resetStatus':           return resetStatus(body);
      case 'updateTechniqueRating': return updateTechniqueRating(body);
      case 'updateTasks':           return updateTasks(body);
      case 'archiveTask':           return archiveTask(body);
      case 'evaluatePeer':          return evaluatePeer(body);
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
// F. logs
// ★ Phase4: C列は task_id（UUID）。フロント返却時に user_tasks と JOIN して item_name に変換。
// =====================================================================

function getLogs(params) {
  var userId = params.user_id;
  if (!userId) return createError('user_id は必須です', 400);

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_LOGS);
  if (!sheet) return createResponse([]);

  // task_id → task_text マップ
  var taskMap = buildTaskTextMap(ss, userId);

  var limit = parseInt(params.limit) || 500;
  var rows  = filterRowsByUserId(sheet, userId);
  var logs  = rows.map(function(r){
    var taskId   = String(r[2] || '');
    var itemName = taskMap[taskId] || taskId; // マップになければ task_id をそのまま使用
    return {
      date:      r[1] ? Utilities.formatDate(new Date(r[1]), 'Asia/Tokyo', 'yyyy-MM-dd') : '',
      item_name: itemName,
      score:     parseInt(r[3]),
      xp_earned: parseInt(r[4]),
    };
  }).filter(function(r){ return r.date && r.item_name; });

  return createResponse(logs.slice(-limit));
}

/**
 * saveLog
 * ★ Phase4: items[].task_id（UUID）を受け取り、logs シートの C列に task_id として保存。
 * item_name は保存しない。
 * ★ Phase6: 保存後にアチーブメント解除判定を実行し newAchievements をレスポンスに含める。
 */
function saveLog(body) {
  var userId = body.user_id;
  var date   = body.date;
  var items  = body.items; // Array<{ task_id: string, score: number }>
  if (!userId) return createError('user_id は必須です', 400);
  if (!items || items.length === 0) return createError('items は必須です', 400);

  var ss        = SpreadsheetApp.openById(SPREADSHEET_ID);
  var logSheet  = ss.getSheetByName(SHEET_LOGS);
  if (!logSheet) {
    logSheet = ss.insertSheet(SHEET_LOGS);
    logSheet.appendRow(['user_id', 'date', 'task_id', 'score', 'xp_earned']);
    logSheet.getRange(1,1,1,5).setFontWeight('bold').setBackground('#1e1b4b').setFontColor('#fff');
    logSheet.setFrozenRows(1);
  }
  var statSheet = ss.getSheetByName(SHEET_STATUS);

  var BASE_XP     = 50;
  var SCORE_BONUS = { 5:30, 4:20, 3:10, 2:5, 1:2 };
  var baseXp      = BASE_XP;

  items.forEach(function(item){
    var bonus  = SCORE_BONUS[item.score] || 0;
    baseXp    += bonus;
    // C列に task_id を保存（★ Phase4 変更点）
    logSheet.appendRow([userId, date, String(item.task_id), item.score, bonus]);
  });

  // 段位倍率（リアル段位）
  var statRows  = filterRowsByUserId(statSheet, userId);
  var realRank  = (statRows.length > 0) ? String(statRows[0][6] || '') : '';
  var MULTI     = { '初段':1.2, '弐段':1.5, '参段':1.8, '四段':2.2, '五段':2.7, '六段':3.4, '七段':4.2, '八段':5.0 };
  var mult      = MULTI[realRank] || 1.0;
  var totalXp   = Math.ceil(baseXp * mult);

  // user_status 更新
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
    statSheet.appendRow([userId, newXp, newLevel, newTitle, today, today, '', '', '']);
  }

  writeXpHistory(ss, userId, 'gain', totalXp, '稽古記録（' + date + '・' + items.length + '項目）', newXp, newLevel, newTitle);

  // ★ Phase6: アチーブメント解除判定
  var newAchievements = checkAndUnlockAchievements(ss, userId, date, logSheet);

  return createResponse({
    xp_earned:        totalXp,
    total_xp:         newXp,
    level:            newLevel,
    title:            newTitle,
    newAchievements:  newAchievements,
  });
}

// =====================================================================
// F2. profile（user_status 拡張）
// =====================================================================

function updateProfile(body) {
  var userId = body.user_id;
  if (!userId) return createError('user_id は必須です', 400);

  var realRank = body.real_rank;
  var motto    = body.motto;
  var favTech  = body.favorite_technique;  // 技ID（例: "T001"）

  var allowed = ['無段','初段','弐段','参段','四段','五段','六段','七段','八段',''];
  if (realRank !== undefined && realRank !== null) {
    realRank = String(realRank).trim();
    if (realRank === '無段') realRank = '';
    if (allowed.indexOf(realRank) === -1) return createError('real_rank が不正です', 400);
  }
  if (motto !== undefined && motto !== null) {
    motto = String(motto).trim();
    if (motto.length > 20) motto = motto.slice(0, 20);
  }
  if (favTech !== undefined && favTech !== null) {
    favTech = String(favTech).trim();
    if (favTech.length > 20) favTech = favTech.slice(0, 20);
  }

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_STATUS);
  if (!sheet) return createError('user_status シートが存在しません', 500);

  var rows   = sheet.getDataRange().getValues();
  var rowIdx = -1;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(userId)) { rowIdx = i; break; }
  }

  var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  var current;
  if (rowIdx === -1) {
    current = [userId, 0, 1, '入門', '', today, '', '', ''];
    sheet.appendRow(current);
    rowIdx = rows.length;
  } else {
    current = rows[rowIdx];
    while (current.length < 9) current.push('');
  }

  if (realRank !== undefined && realRank !== null) current[6] = realRank;
  if (motto    !== undefined && motto    !== null) current[7] = motto;
  if (favTech  !== undefined && favTech  !== null) current[8] = favTech;

  sheet.getRange(rowIdx + 1, 1, 1, 9).setValues([[
    current[0], current[1], current[2], current[3], current[4], current[5],
    current[6], current[7], current[8],
  ]]);

  gasLog('INFO', 'updateProfile', 'profile updated user=' + userId, {
    real_rank: current[6], motto: current[7], favorite_technique: current[8],
  });
  return createResponse({ updated: true });
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
    total_xp:            parseInt(row[1]) || 0,
    level:               parseInt(row[2]) || 1,
    title:               String(row[3]) || '入門',
    last_practice_date:  String(row[4] || ''),
    real_rank:           String(row[6] || ''),
    motto:               String(row[7] || ''),
    favorite_technique:  String(row[8] || ''),
  });
}

function resetStatus(body) {
  var userId = body.user_id;
  if (!userId) return createError('user_id は必須です', 400);

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_STATUS);
  var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

  deleteRowsByUserId(sheet, userId);
  sheet.appendRow([userId, 0, 1, '入門', '', today, '', '', '']);

  writeXpHistory(ss, userId, 'reset', 0, 'レベルリセット', 0, 1, '入門');
  gasLog('INFO', 'resetStatus', 'reset user=' + userId);
  return createResponse({ total_xp: 0, level: 1, title: '入門' });
}

// =====================================================================
// H. user_tasks
// =====================================================================

function getUserTasksSheet(ss) {
  var sheet = ss.getSheetByName(SHEET_USER_TASKS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_USER_TASKS);
    sheet.appendRow(['id', 'user_id', 'task_text', 'status', 'created_at', 'updated_at']);
    sheet.getRange(1,1,1,6).setFontWeight('bold').setBackground('#1e1b4b').setFontColor('#fff');
    sheet.setFrozenRows(1);
    gasLog('INFO', 'getUserTasksSheet', 'user_tasks シートを自動作成しました');
  }
  return sheet;
}

function getTasksData(ss, userId) {
  var sheet = getUserTasksSheet(ss);
  var rows  = sheet.getDataRange().getValues();
  // 列: id(0), user_id(1), task_text(2), status(3), created_at(4), updated_at(5)
  return rows.slice(1)
    .filter(function(r){ return String(r[1]) === String(userId); })
    .map(function(r){
      return {
        id:         String(r[0]),
        task_text:  String(r[2]),
        status:     String(r[3]),
        created_at: r[4] ? String(r[4]).slice(0,10) : '',
        updated_at: r[5] ? String(r[5]).slice(0,10) : '',
      };
    })
    .filter(function(t) { return t.id && t.task_text; });
}

/**
 * updateTasks
 * ★ スマート差分対応版
 *
 * body.tasks: Array<{ id?: string, text: string }>
 *   - id あり: 既存タスクを再アクティブ化（テキスト変更なし＝IDを維持）
 *   - id なし: 新規タスクとして UUID を発行
 *   - 送られてこなかった既存アクティブタスク: 自動アーカイブ
 */
function updateTasks(body) {
  var userId = body.user_id;
  var tasks  = body.tasks; // Array<{id?: string, text: string}>
  if (!userId) return createError('user_id は必須です', 400);
  if (!tasks || !Array.isArray(tasks)) return createError('tasks は配列で必須です', 400);

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = getUserTasksSheet(ss);
  var ts    = nowJstTs();

  // 受け取ったタスクを分類
  var tasksWithId = {};  // id -> text（テキスト変更なしの既存タスク）
  var newTasks    = [];  // text のみ（新規 or テキスト変更）

  tasks.forEach(function(t) {
    var text = (t.text || '').trim();
    if (!text) return;
    if (t.id) {
      tasksWithId[String(t.id)] = text;
    } else {
      newTasks.push(text);
    }
  });

  var foundIds = {}; // シートで実際に発見した ID

  // ── Step 1: 既存行を走査し、維持/アーカイブを振り分け ──
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (String(r[1]) !== String(userId)) continue;
    var rowId = String(r[0]);

    if (tasksWithId[rowId] !== undefined) {
      // 受け取った ID と一致 → アクティブに戻す（テキストも更新）
      sheet.getRange(i + 1, 3).setValue(tasksWithId[rowId]);
      sheet.getRange(i + 1, 4).setValue('active');
      sheet.getRange(i + 1, 6).setValue(ts);
      foundIds[rowId] = true;
    } else if (String(r[3]) === 'active') {
      // 送られてこなかった → アーカイブ
      sheet.getRange(i + 1, 4).setValue('archived');
      sheet.getRange(i + 1, 6).setValue(ts);
    }
  }

  // ── Step 2: 新規行を追加 ──
  var newRows = [];

  // ID 指定だがシートに存在しなかった（万一のフォールバック）
  Object.keys(tasksWithId).forEach(function(id) {
    if (!foundIds[id]) {
      newRows.push([id, userId, tasksWithId[id], 'active', ts, ts]);
    }
  });

  // 完全な新規タスク（UUID を発行）
  newTasks.forEach(function(text) {
    newRows.push([Utilities.getUuid(), userId, text, 'active', ts, ts]);
  });

  if (newRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, 6).setValues(newRows);
  }

  var activeCount = Object.keys(tasksWithId).length + newTasks.length;
  gasLog('INFO', 'updateTasks', 'tasks updated user=' + userId, { active_count: activeCount });
  return createResponse({ active_count: activeCount });
}

function archiveTask(body) {
  var userId = body.user_id;
  var taskId = body.task_id;
  if (!userId) return createError('user_id は必須です', 400);
  if (!taskId) return createError('task_id は必須です', 400);

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = getUserTasksSheet(ss);
  var rows  = sheet.getDataRange().getValues();
  var ts    = nowJstTs();

  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (String(r[0]) === String(taskId) && String(r[1]) === String(userId)) {
      sheet.getRange(i + 1, 4).setValue('archived');
      sheet.getRange(i + 1, 6).setValue(ts);
      gasLog('INFO', 'archiveTask', 'task archived user=' + userId, { id: taskId });
      return createResponse({ id: String(taskId) });
    }
  }

  return createError('task が見つかりません', 404);
}

// =====================================================================
// I. technique_master（全ユーザー共通マスタ）
// 列: ID(0), BodyPart(1), ActionType(2), SubCategory(3), Name(4)
// =====================================================================

function getTechniqueMasterData(ss) {
  var sheet = ss.getSheetByName(SHEET_TECH_MASTER);
  if (!sheet) return [];

  var rows = sheet.getDataRange().getValues();
  return rows.slice(1)
    .filter(function(r){ return r[0] !== '' && r[4] !== ''; })
    .map(function(r){
      return {
        id:          String(r[0]),
        bodyPart:    String(r[1] || ''),
        actionType:  String(r[2] || ''),
        subCategory: String(r[3] || ''),
        name:        String(r[4] || ''),
      };
    });
}

// =====================================================================
// I2. user_techniques（ユーザーごとの習熟度）
// 列: user_id(0), technique_id(1), Points(2), LastRating(3)
// =====================================================================

function getTechniques(params) {
  var userId = params.user_id;
  if (!userId) return createError('user_id は必須です', 400);

  var ss     = SpreadsheetApp.openById(SPREADSHEET_ID);
  var master = getTechniqueMasterData(ss);
  if (master.length === 0) {
    gasLog('WARN', 'getTechniques', 'technique_master シートが存在しないか空です');
    return createResponse([]);
  }

  var utSheet = ss.getSheetByName(SHEET_USER_TECHNIQUES);
  var userMap = {};
  if (utSheet) {
    var utRows = filterRowsByUserId(utSheet, userId);
    utRows.forEach(function(r){
      var tid = String(r[1]);
      userMap[tid] = {
        points:     Number(r[2]) || 0,
        lastRating: Number(r[3]) || 0,
      };
    });
  }

  var techs = master.map(function(m){
    var rec = userMap[m.id] || { points: 0, lastRating: 0 };
    return {
      id:          m.id,
      bodyPart:    m.bodyPart,
      actionType:  m.actionType,
      subCategory: m.subCategory,
      name:        m.name,
      points:      rec.points,
      lastRating:  rec.lastRating,
    };
  });

  gasLog('INFO', 'getTechniques', techs.length + '件 user:' + userId);
  return createResponse(techs);
}

function updateTechniqueRating(body) {
  var userId    = body.user_id;
  var id        = body.id;
  var ratingNum = parseInt(body.rating);

  if (!userId)  return createError('user_id は必須です', 400);
  if (!id)      return createError('id は必須です', 400);
  if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5)
    return createError('rating は 1〜5 の整数で指定してください', 400);

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  var master      = getTechniqueMasterData(ss);
  var masterEntry = null;
  for (var m = 0; m < master.length; m++) {
    if (master[m].id === String(id)) { masterEntry = master[m]; break; }
  }
  if (!masterEntry) {
    gasLog('WARN', 'updateTechniqueRating', 'technique_master に ID=' + id + ' が見つかりません');
    return createError('technique_master に ID=' + id + ' が存在しません', 404);
  }

  var sheet = ss.getSheetByName(SHEET_USER_TECHNIQUES);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_USER_TECHNIQUES);
    sheet.appendRow(['user_id', 'technique_id', 'Points', 'LastRating']);
    sheet.getRange(1,1,1,4).setFontWeight('bold').setBackground('#1e1b4b').setFontColor('#fff');
    sheet.setFrozenRows(1);
    gasLog('INFO', 'updateTechniqueRating', 'user_techniques シートを自動作成しました');
  }

  var rows   = sheet.getDataRange().getValues();
  var rowIdx = -1;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(userId) && String(rows[i][1]) === String(id)) {
      rowIdx = i; break;
    }
  }

  var newPoints;
  if (rowIdx === -1) {
    newPoints = ratingNum;
    sheet.appendRow([userId, id, newPoints, ratingNum]);
    gasLog('INFO', 'updateTechniqueRating', 'INSERT user=' + userId + ' id=' + id + ' pts=' + newPoints);
  } else {
    var currentPts = Number(rows[rowIdx][2]) || 0;
    newPoints = currentPts + ratingNum;
    var sheetRow = rowIdx + 1;
    sheet.getRange(sheetRow, 3).setValue(newPoints);
    sheet.getRange(sheetRow, 4).setValue(ratingNum);
    gasLog('INFO', 'updateTechniqueRating', 'UPDATE user=' + userId + ' id=' + id + ' ' + currentPts + '->' + newPoints);
  }

  return createResponse({ id: String(id), points: newPoints, lastRating: ratingNum });
}

// =====================================================================
// I3. 他者評価（peer_evaluations）
// =====================================================================

function getPeerLevelMultiplier(level) {
  if (level >= 80) return 5.0;
  if (level >= 60) return 3.0;
  if (level >= 40) return 2.0;
  if (level >= 30) return 1.5;
  if (level >= 20) return 1.2;
  return 1.0;
}

function evaluatePeer(body) {
  var evaluatorId = body.user_id;
  var targetId    = body.target_id;
  var score       = parseInt(body.score);

  if (!evaluatorId) return createError('user_id は必須です', 400);
  if (!targetId)    return createError('target_id は必須です', 400);
  if (String(evaluatorId) === String(targetId)) {
    return createError('自分自身を評価することはできません', 400);
  }
  if (isNaN(score) || score < 1 || score > 5) {
    return createError('score は 1〜5 の整数で指定してください', 400);
  }

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

  var peSheet = ss.getSheetByName(SHEET_PEER_EVALS);
  if (!peSheet) return createError('peer_evaluations シートが存在しません。管理者に連絡してください。', 500);

  var peRows = peSheet.getDataRange().getValues();
  for (var i = 1; i < peRows.length; i++) {
    var pe = peRows[i];
    if (String(pe[0]) === String(evaluatorId) &&
        String(pe[1]) === String(targetId) &&
        toDateStr(pe[2]) === today) {
      return createError('本日はすでにこのユーザーを評価済みです', 429);
    }
  }

  var statSheet = ss.getSheetByName(SHEET_STATUS);
  if (!statSheet) return createError('user_status シートが存在しません', 500);

  var evalRows  = filterRowsByUserId(statSheet, evaluatorId);
  var evalLevel = evalRows.length > 0 ? (parseInt(evalRows[0][2]) || 1) : 1;
  var mult      = getPeerLevelMultiplier(evalLevel);
  // XP = score × 2 × 評価者レベル倍率
  var xpGranted = Math.ceil(score * 2 * mult);

  var umSheet  = ss.getSheetByName(SHEET_USER_MASTER);
  var evalName = String(evaluatorId);
  if (umSheet) {
    var umRows = umSheet.getDataRange().getValues();
    for (var j = 1; j < umRows.length; j++) {
      if (String(umRows[j][0]) === String(evaluatorId)) {
        evalName = String(umRows[j][1] || evaluatorId);
        break;
      }
    }
  }

  var targetRows = filterRowsByUserId(statSheet, targetId);
  var hasTarget  = targetRows.length > 0;
  var currentXp  = hasTarget ? (parseInt(targetRows[0][1]) || 0) : 0;
  var newXp      = currentXp + xpGranted;
  var titleMD    = getTitleMasterData(ss);
  var newLevel   = calcLevel(newXp);
  var newTitle   = calcTitleFromMaster(newLevel, titleMD);

  if (hasTarget) {
    var allStatRows = statSheet.getDataRange().getValues();
    for (var r = allStatRows.length; r >= 2; r--) {
      if (String(allStatRows[r-1][0]) === String(targetId)) {
        statSheet.getRange(r, 2).setValue(newXp);
        statSheet.getRange(r, 3).setValue(newLevel);
        statSheet.getRange(r, 4).setValue(newTitle);
        break;
      }
    }
  } else {
    statSheet.appendRow([targetId, newXp, newLevel, newTitle, '', today, '', '', '']);
  }

  // peer_evaluations: evaluator_id, target_id, date, score, xp_granted
  peSheet.appendRow([evaluatorId, targetId, nowJstTs(), score, xpGranted]);
  writeXpHistory(ss, targetId, 'peer_eval', xpGranted,
    evalName + 'からの評価（スコア: ' + score + '）', newXp, newLevel, newTitle);

  gasLog('INFO', 'evaluatePeer',
    'evaluator=' + evaluatorId + '(' + evalLevel + ') score=' + score + ' -> target=' + targetId + ' +' + xpGranted + 'XP(×' + mult + ')',
    { evalName: evalName, score: score, newLevel: newLevel });

  return createResponse({
    xp_granted:      xpGranted,
    evaluator_level: evalLevel,
    multiplier:      mult,
    score:           score,
  });
}

// =====================================================================
// J. getDashboard（統合取得）
// ★ Phase4: settings フィールド廃止。logs は task_id → item_name に JOIN して返す。
// =====================================================================

function getDashboard(params) {
  var userId = params.user_id;
  if (!userId) return createError('user_id は必須です', 400);

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // ── 1. XP減衰を先に適用 ──
  var decayResult = applyDecay(ss, userId);

  // ── 2. user_status ──
  var statSheet = ss.getSheetByName(SHEET_STATUS);
  var status    = { total_xp: 0, level: 1, title: '入門', last_practice_date: '', real_rank: '', motto: '', favorite_technique: '' };
  if (statSheet) {
    var statRows = filterRowsByUserId(statSheet, userId);
    if (statRows.length > 0) {
      var sr = statRows[0];
      status = {
        total_xp:           parseInt(sr[1]) || 0,
        level:              parseInt(sr[2]) || 1,
        title:              String(sr[3]) || '入門',
        last_practice_date: String(sr[4] || ''),
        real_rank:          String(sr[6] || ''),
        motto:              String(sr[7] || ''),
        favorite_technique: String(sr[8] || ''),
      };
    }
  }

  // ── 3. user_tasks ──
  var tasks = getTasksData(ss, userId);

  // ── 4. logs（直近200件）— task_id → item_name に JOIN ──
  var taskMap  = buildTaskTextMap(ss, userId);
  var logSheet = ss.getSheetByName(SHEET_LOGS);
  var logs     = [];
  if (logSheet) {
    logs = filterRowsByUserId(logSheet, userId).map(function(r){
      var taskId   = String(r[2] || '');
      var itemName = taskMap[taskId] || taskId;
      return {
        date:      r[1] ? Utilities.formatDate(new Date(r[1]), 'Asia/Tokyo', 'yyyy-MM-dd') : '',
        item_name: itemName,
        score:     parseInt(r[3]),
        xp_earned: parseInt(r[4]),
      };
    }).filter(function(r){ return r.date && r.item_name; }).slice(-200);
  }

  // ── 5. nextLevelXp ──
  var nextLevelXp = calcNextLevelXp(status.total_xp);

  // ── 6. title_master ──
  var titleMaster = getTitleMasterData(ss);

  // ── 7. epithet_master ──
  var epithetMaster = getEpithetMasterData(ss);

  // ── 8. xp_history（直近90件） ──
  var xpHistory = [];
  var xpHistSheet = ss.getSheetByName(SHEET_XP_HIST);
  if (xpHistSheet) {
    var xpRows = filterRowsByUserId(xpHistSheet, userId);
    xpHistory = xpRows.slice(-90).map(function(r){
      return {
        date:           r[1] ? String(r[1]).slice(0,10) : '',
        type:           String(r[2] || ''),
        amount:         Number(r[3]) || 0,
        reason:         String(r[4] || ''),
        total_xp_after: Number(r[5]) || 0,
        level:          Number(r[6]) || 1,
        title:          String(r[7] || ''),
      };
    }).filter(function(e){ return e.date; });
  }

  // ── 9. technique_master（全件） ──
  var techniqueMaster = getTechniqueMasterData(ss);

  return createResponse({
    status:          status,
    tasks:           tasks,
    logs:            logs,
    nextLevelXp:     nextLevelXp,
    decay:           decayResult,
    titleMaster:     titleMaster,
    epithetMaster:   epithetMaster,
    xpHistory:       xpHistory,
    techniqueMaster: techniqueMaster,
  });
}

// =====================================================================
// K. 称号マスタ（共通）
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
// L. 二つ名マスタ（共通）
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
// M. レベル・XP計算
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
// N. XP減衰ロジック
// =====================================================================

function dailyPenalty(d) {
  if (d <= 3) return 0;
  return Math.floor(20 * Math.pow(d - 3, 1.3));
}

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

  var row        = allRows[rowIdx];
  var totalXp    = parseInt(row[1]) || 0;
  var lastPractS = toDateStr(row[4]);
  var lastDecayS = toDateStr(row[5]);
  var today      = new Date(); today.setHours(0,0,0,0);
  var todayStr   = Utilities.formatDate(today, 'Asia/Tokyo', 'yyyy-MM-dd');
  var sheetRow   = rowIdx + 1;

  if (lastDecayS === todayStr) {
    var da = lastPractS ? Math.floor((today - new Date(lastPractS)) / 86400000) : 0;
    return { applied:0, days_absent:da, today_penalty: dailyPenalty(da) };
  }

  // last_practice_date が空なら logs シートから自動補完
  var resolvedLP = lastPractS;
  if (!resolvedLP) {
    var logSheet = ss.getSheetByName(SHEET_LOGS);
    if (logSheet) {
      var logDates = filterRowsByUserId(logSheet, userId)
        .map(function(r){ return toDateStr(r[1]); })
        .filter(function(d){ return d.match(/^\d{4}-\d{2}-\d{2}$/); })
        .sort();
      if (logDates.length > 0) {
        resolvedLP = logDates[logDates.length - 1];
        sheet.getRange(sheetRow, 5).setValue(resolvedLP);
        gasLog('INFO', 'applyDecay', 'last_practice_date 自動補完 user:' + userId, { resolvedLP: resolvedLP });
      }
    }
  }
  if (!resolvedLP) {
    sheet.getRange(sheetRow, 6).setValue(todayStr);
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

  sheet.getRange(sheetRow, 1, 1, 6).setValues([[userId, newXp, newLevel, newTitle, resolvedLP, todayStr]]);
  gasLog('INFO', 'applyDecay', 'user=' + userId + ' -' + totalDecay + 'XP (' + daysAbsent + '日)', { newXp: newXp });
  writeXpHistory(ss, userId, 'decay', -totalDecay, daysAbsent + '日間稽古なし', newXp, newLevel, newTitle);

  return { applied: totalDecay, days_absent: daysAbsent, today_penalty: todayPenalty };
}

// =====================================================================
// O. アチーブメントシステム ★ Phase6
// =====================================================================

/**
 * achievement_master シートを取得（なければ自動作成）
 * 列: achievement_id(0), name(1), condition_type(2), condition_value(3),
 *     description(4), hint(5), icon_type(6)
 */
function getAchievementMasterSheet(ss) {
  var sheet = ss.getSheetByName(SHEET_ACHIEVEMENT_MASTER);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_ACHIEVEMENT_MASTER);
    sheet.appendRow(['achievement_id', 'name', 'condition_type', 'condition_value', 'description', 'hint', 'icon_type']);
    sheet.getRange(1,1,1,7).setFontWeight('bold').setBackground('#1e1b4b').setFontColor('#fff');
    sheet.setFrozenRows(1);
    // デフォルトデータ（streak_days / total_practices 2種類）
    var defaults = [
      ['ACH001', '初稽古',        'total_practices',  1,  '初めての稽古を記録した',                 '稽古記録を1回つけよう',     'first_step'],
      ['ACH002', '三日坊主克服',  'streak_days',       3,  '3日連続で稽古を記録した',               '3日間連続で稽古しよう',     'streak'],
      ['ACH003', '一週間の剣士',  'streak_days',       7,  '7日連続で稽古を記録した',               '7日間連続で稽古しよう',     'streak'],
      ['ACH004', '精進十日',      'streak_days',      10,  '10日連続で稽古を記録した',              '10日間連続で稽古しよう',    'streak'],
      ['ACH005', '一ヶ月皆勤',    'streak_days',      30,  '30日連続で稽古を記録した',              '30日間連続で稽古しよう',    'streak'],
      ['ACH006', '十稽古',        'total_practices',  10,  '累計10回の稽古を記録した',              '累計10回稽古しよう',        'milestone'],
      ['ACH007', '五十稽古',      'total_practices',  50,  '累計50回の稽古を記録した',              '累計50回稽古しよう',        'milestone'],
      ['ACH008', '百錬自得',      'total_practices', 100,  '累計100回の稽古を記録した',             '累計100回稽古しよう',       'legendary'],
    ];
    sheet.getRange(2, 1, defaults.length, 7).setValues(defaults);
    gasLog('INFO', 'getAchievementMasterSheet', 'achievement_master シートを自動作成しました');
  }
  return sheet;
}

/**
 * achievement_master の全件をオブジェクト配列で返す
 */
function getAchievementMasterData(ss) {
  var sheet = getAchievementMasterSheet(ss);
  return sheet.getDataRange().getValues().slice(1)
    .filter(function(r){ return r[0] !== ''; })
    .map(function(r){
      return {
        id:             String(r[0]),
        name:           String(r[1] || ''),
        conditionType:  String(r[2] || ''),
        conditionValue: Number(r[3]) || 0,
        description:    String(r[4] || ''),
        hint:           String(r[5] || ''),
        iconType:       String(r[6] || ''),
      };
    });
}

/**
 * user_achievements シートを取得（なければ自動作成）
 * 列: user_id(0), achievement_id(1), unlocked_at(2)
 */
function getUserAchievementsSheet(ss) {
  var sheet = ss.getSheetByName(SHEET_USER_ACHIEVEMENTS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_USER_ACHIEVEMENTS);
    sheet.appendRow(['user_id', 'achievement_id', 'unlocked_at']);
    sheet.getRange(1,1,1,3).setFontWeight('bold').setBackground('#1e1b4b').setFontColor('#fff');
    sheet.setFrozenRows(1);
    gasLog('INFO', 'getUserAchievementsSheet', 'user_achievements シートを自動作成しました');
  }
  return sheet;
}

/**
 * getAchievements: ユーザーの全実績データを返す（マスタ + unlocked_at の JOIN済み）
 * doGet action: 'getAchievements'
 */
function getAchievements(params) {
  var userId = params.user_id;
  if (!userId) return createError('user_id は必須です', 400);

  var ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
  var master  = getAchievementMasterData(ss);
  var uaSheet = getUserAchievementsSheet(ss);
  var uaRows  = filterRowsByUserId(uaSheet, userId);

  // 解除済み: { achievement_id -> unlocked_at } マップ
  var unlockedMap = {};
  uaRows.forEach(function(r){
    unlockedMap[String(r[1])] = r[2] ? String(r[2]).slice(0, 19) : '';
  });

  var result = master.map(function(m){
    var isUnlocked = unlockedMap[m.id] !== undefined;
    return {
      id:          m.id,
      name:        m.name,
      description: m.description,
      hint:        m.hint,
      iconType:    m.iconType,
      isUnlocked:  isUnlocked,
      unlockedAt:  isUnlocked ? unlockedMap[m.id] : null,
    };
  });

  gasLog('INFO', 'getAchievements', result.length + '件 user:' + userId);
  return createResponse(result);
}

/**
 * 連続稽古日数（現在のストリーク）を計算する。
 * logSheet から userId の全稽古日を取得し、今日（saveLog で追加された当日含む）
 * から遡って連続している日数を返す。
 *
 * @param {Sheet}  logSheet  - logs シートオブジェクト
 * @param {string} userId    - ユーザーID
 * @param {string} todayStr  - 本日の日付文字列 (YYYY-MM-DD)
 * @returns {number} 現在の連続稽古日数
 */
function calcCurrentStreak(logSheet, userId, todayStr) {
  var rows = filterRowsByUserId(logSheet, userId);

  // ユニーク稽古日セットを構築（今日分は saveLog で既に追加済み）
  var dateSet = {};
  rows.forEach(function(r) {
    var d = toDateStr(r[1]);
    if (d) dateSet[d] = true;
  });
  // 念のため今日を含める
  dateSet[todayStr] = true;

  // 今日から1日ずつ遡ってカウント
  var streak = 0;
  var cursor = new Date(todayStr);
  cursor.setHours(0, 0, 0, 0);

  while (true) {
    var ds = Utilities.formatDate(cursor, 'Asia/Tokyo', 'yyyy-MM-dd');
    if (dateSet[ds]) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

/**
 * 累計稽古日数（ユニーク稽古日の総数）を計算する。
 *
 * @param {Sheet}  logSheet  - logs シートオブジェクト
 * @param {string} userId    - ユーザーID
 * @param {string} todayStr  - 本日の日付文字列 (YYYY-MM-DD)
 * @returns {number} 累計稽古日数
 */
function calcTotalPractices(logSheet, userId, todayStr) {
  var rows    = filterRowsByUserId(logSheet, userId);
  var dateSet = {};
  rows.forEach(function(r) {
    var d = toDateStr(r[1]);
    if (d) dateSet[d] = true;
  });
  dateSet[todayStr] = true;
  return Object.keys(dateSet).length;
}

/**
 * アチーブメント解除判定・記録。
 * saveLog の末尾から呼び出す。
 *
 * 判定対象の condition_type:
 *   - 'streak_days'      : 現在の連続稽古日数 >= condition_value
 *   - 'total_practices'  : 累計稽古日数 >= condition_value
 *
 * @param {Spreadsheet} ss       - SpreadsheetApp オブジェクト
 * @param {string}      userId   - ユーザーID
 * @param {string}      date     - 稽古日 (YYYY-MM-DD, body.date)
 * @param {Sheet}       logSheet - logs シートオブジェクト（再取得コスト削減のため引数で受け取る）
 * @returns {Array} 新規解除されたアチーブメント配列（Achievement 型に準拠）
 */
function checkAndUnlockAchievements(ss, userId, date, logSheet) {
  var newlyUnlocked = [];

  try {
    var master  = getAchievementMasterData(ss);
    if (master.length === 0) return newlyUnlocked;

    var uaSheet = getUserAchievementsSheet(ss);
    var uaRows  = filterRowsByUserId(uaSheet, userId);

    // 既解除 achievement_id のセット
    var unlockedSet = {};
    uaRows.forEach(function(r){ unlockedSet[String(r[1])] = true; });

    // 未解除のアチーブメントだけ判定
    var candidates = master.filter(function(m){
      return !unlockedSet[m.id] &&
        (m.conditionType === 'streak_days' || m.conditionType === 'total_practices');
    });
    if (candidates.length === 0) return newlyUnlocked;

    // 稽古日（今日）の文字列を正規化（body.date を優先、なければ今日）
    var todayStr = (date && date.match(/^\d{4}-\d{2}-\d{2}$/))
      ? date
      : Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

    // 値を遅延計算（必要になった時だけ算出）
    var streakCache       = null;
    var totalPractCache   = null;

    var unlockedAt = nowJstTs();

    candidates.forEach(function(m) {
      var achieved = false;

      if (m.conditionType === 'streak_days') {
        if (streakCache === null) {
          streakCache = calcCurrentStreak(logSheet, userId, todayStr);
        }
        achieved = streakCache >= m.conditionValue;

      } else if (m.conditionType === 'total_practices') {
        if (totalPractCache === null) {
          totalPractCache = calcTotalPractices(logSheet, userId, todayStr);
        }
        achieved = totalPractCache >= m.conditionValue;
      }

      if (achieved) {
        // user_achievements に追記
        uaSheet.appendRow([userId, m.id, unlockedAt]);
        gasLog('INFO', 'checkAndUnlockAchievements',
          'UNLOCKED user=' + userId + ' achievement=' + m.id + ' (' + m.name + ')',
          { conditionType: m.conditionType, conditionValue: m.conditionValue });

        newlyUnlocked.push({
          id:          m.id,
          name:        m.name,
          description: m.description,
          hint:        m.hint,
          iconType:    m.iconType,
          isUnlocked:  true,
          unlockedAt:  unlockedAt,
        });
      }
    });

  } catch(e) {
    // アチーブメント判定のエラーは saveLog のレスポンスをブロックしない
    gasLog('ERROR', 'checkAndUnlockAchievements', e.message, { stack: e.stack });
  }

  return newlyUnlocked;
}
