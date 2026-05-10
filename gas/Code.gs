// Code.gs
// =====================================================================
// 百錬自得 - Google Apps Script バックエンド（マルチユーザー対応版）
// ★ Phase4 正規化: logs.C列 = task_id（UUID）に変更
// ★ settings シート関連を全廃止
// ★ updateTasks: スマート差分（IDを維持/新規UUID）対応
// ★ Phase6: アチーブメント（実績バッジ）システム追加
// ★ Phase7: evaluatePeer を課題単位配列評価に変更
//   - peer_evaluations スキーマに task_id 列を追加
//   - getTodayEvaluations アクション追加
// ★ Phase8 Step1: updateTechniqueRating を量×質マトリックス方式に刷新
//   - user_techniques スキーマ拡張 (7列: +last_quantity, last_quality, last_feedback)
//   - technique_logs シート新設（稽古履歴の永続記録）
//   - 四字熟語フィードバック25パターン実装
//   - XP・レベル・xp_history 連動
// ★ Phase8 Step3-1: getDashboard に peerLogs を追加
//   - peer_evaluations から target_id === userId の行を抽出
//   - task_id を buildTaskTextMap で item_name に JOIN して返却
// ★ Phase9: 称号システム刷新（EpithetMaster 列追加対応）
//   - EpithetMaster シートの列構成を6列に更新:
//     A=ID, B=Category, C=TriggerValue, D=Name, E=Rarity, F=Description
// ★ Phase9.1 bugfix: getEpithetMasterData の列マッピング修正
//   - rarity      = row[4]  (E列)
//   - description = row[5]  (F列)
// ★ Phase9.5: DB最適化 - title カラム排除（正規化）
//   - user_status から title 列（旧D列）を物理削除
//     新列構成: A(user_id), B(total_xp), C(level), D(last_practice_date),
//               E(last_decay_date), F(real_rank), G(motto), H(favorite_technique)
//   - xp_history から title 列（旧H列）を物理削除
//     新列構成: A(user_id), B(date), C(type), D(amount), E(reason),
//               F(total_xp_after), G(level)
//   - writeXpHistory のシグネチャから title 引数を削除
//   - calcTitleFromMaster 呼び出しを全廃止（GASレスポンスには title を含めない）
// ★ Phase10: 剣風相性＆マッチングシステム
//   - MatchupMaster シート（A=BaseStyle, B=MatchType, C=Degree, D=TargetStyle,
//                           E=Reason, F=Advice）を読み込む getMatchupMasterData() 追加
//   - getPeersStyleData(ss, currentUserId) を新設し、UserMaster と user_status を
//     JOIN して自分以外の剣友の favorite_technique を返す
//   - getDashboard レスポンスに matchupMaster / peersStyle を追加
// ★ Phase-ex1: 他者評価イベントの匿名化（プライバシー保護）
//   - evaluatePeer の writeXpHistory に渡す reason から評価者名を排除し、
//     '剣友からの評価（...）' と記録する。
//   - 既存の名前入りログはフロント側で正規表現マスクするため、本ファイルでは
//     新規書き込みのみ匿名化する。
// =====================================================================

var SPREADSHEET_ID       = '1jmXq7bdvSG_HVjTe0ArEAi8xStmVfh_FpIb90TxYS5I';

// ユーザー固有シート（A列 = user_id）
// SHEET_SETTINGS は廃止済み
var SHEET_LOGS              = 'logs';               // user_id, date, task_id, score, xp_earned
var SHEET_STATUS            = 'user_status';        // user_id, total_xp, level, last_practice_date, last_decay_date, real_rank, motto, favorite_technique ★ Phase9.5: title 削除
var SHEET_XP_HIST           = 'xp_history';         // user_id, date, type, amount, reason, total_xp_after, level ★ Phase9.5: title 削除
var SHEET_USER_TASKS        = 'user_tasks';         // id, user_id, task_text, status, created_at, updated_at
var SHEET_PEER_EVALS        = 'peer_evaluations';   // evaluator_id, target_id, task_id, date, score, xp_granted ★ Phase7: task_id 追加
var SHEET_USER_TECHNIQUES   = 'user_techniques';    // user_id, technique_id, Points, LastRating, last_quantity, last_quality, last_feedback ★ Phase8
var SHEET_TECH_LOGS         = 'technique_logs';     // user_id, date, technique_id, quantity, quality, xp_earned, feedback ★ Phase8 新設
var SHEET_USER_ACHIEVEMENTS = 'user_achievements';  // user_id, achievement_id, unlocked_at ★ Phase6

// 全ユーザー共通マスタ（user_id なし）
var SHEET_TECH_MASTER         = 'technique_master';    // ID, BodyPart, ActionType, SubCategory, Name
var SHEET_TITLE_MASTER        = 'title_master';
var SHEET_EPITHET_MASTER      = 'EpithetMaster';       // ID, Category, TriggerValue, Name, Rarity, Description ★ Phase9
var SHEET_USER_MASTER         = 'UserMaster';
var SHEET_ACHIEVEMENT_MASTER  = 'achievement_master';  // achievement_id, name, condition_type, condition_value, description, hint, icon_type ★ Phase6
var SHEET_MATCHUP_MASTER      = 'MatchupMaster';       // BaseStyle, MatchType, Degree, TargetStyle, Reason, Advice ★ Phase10

// システム用
var SHEET_ERRORLOGS      = 'error_logs';

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

/**
 * writeXpHistory
 * ★ Phase9.5: title 引数を削除。7列構成に変更。
 * 新列構成: user_id, date, type, amount, reason, total_xp_after, level
 */
function writeXpHistory(ss, userId, type, amount, reason, totalXpAfter, level) {
  try {
    var sheet = ss.getSheetByName(SHEET_XP_HIST);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_XP_HIST);
      // ★ Phase9.5: title 列を削除し 7列ヘッダーに変更
      sheet.appendRow(['user_id', 'date', 'type', 'amount', 'reason', 'total_xp_after', 'level']);
      sheet.getRange(1,1,1,7).setFontWeight('bold').setBackground('#1e1b4b').setFontColor('#fff');
      sheet.setFrozenRows(1);
    }
    var ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
    // ★ Phase9.5: title を除いた 7要素配列
    sheet.appendRow([userId, ts, type, amount, reason, totalXpAfter, level]);
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
      case 'getDashboard':         return getDashboard(e.parameter);
      case 'getLogs':              return getLogs(e.parameter);
      case 'getUserStatus':        return getUserStatus(e.parameter);
      case 'getTechniques':        return getTechniques(e.parameter);
      case 'getEpithetMaster':     return getEpithetMaster();
      case 'getUsers':             return getUsers();
      case 'getAchievements':      return getAchievements(e.parameter);      // ★ Phase6
      case 'getTodayEvaluations':  return getTodayEvaluations(e.parameter);  // ★ Phase7
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
 * ★ Phase9.5: title をレスポンスから削除。
 *
 * user_status 新列構成（Phase9.5）:
 *   A(0)=user_id, B(1)=total_xp, C(2)=level, D(3)=last_practice_date,
 *   E(4)=last_decay_date, F(5)=real_rank, G(6)=motto, H(7)=favorite_technique
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
    logSheet.appendRow([userId, date, String(item.task_id), item.score, bonus]);
  });

  // 段位倍率（リアル段位）
  // ★ Phase9.5: real_rank は F列(index 5)
  var statRows  = filterRowsByUserId(statSheet, userId);
  var realRank  = (statRows.length > 0) ? String(statRows[0][5] || '') : '';
  var MULTI     = { '初段':1.2, '弐段':1.5, '参段':1.8, '四段':2.2, '五段':2.7, '六段':3.4, '七段':4.2, '八段':5.0 };
  var mult      = MULTI[realRank] || 1.0;
  var totalXp   = Math.ceil(baseXp * mult);

  // user_status 更新
  // ★ Phase9.5: 8列構成。title 列なし。
  //   col1=user_id, col2=total_xp, col3=level, col4=last_practice_date,
  //   col5=last_decay_date, col6=real_rank, col7=motto, col8=favorite_technique
  var hasRow    = statRows.length > 0;
  var currentXp = hasRow ? (parseInt(statRows[0][1]) || 0) : 0;
  var newXp     = currentXp + totalXp;
  var newLevel  = calcLevel(newXp);
  var today     = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

  if (hasRow) {
    var allRows = statSheet.getDataRange().getValues();
    for (var r = allRows.length; r >= 2; r--) {
      if (String(allRows[r-1][0]) === String(userId)) {
        // ★ Phase9.5: 5列分を更新（user_id, total_xp, level, last_practice_date, last_decay_date）
        statSheet.getRange(r, 1, 1, 5).setValues([[userId, newXp, newLevel, today, today]]);
        break;
      }
    }
  } else {
    // ★ Phase9.5: 8列で新規挿入（title 列なし）
    statSheet.appendRow([userId, newXp, newLevel, today, today, '', '', '']);
  }

  // ★ Phase9.5: title 引数を渡さない
  writeXpHistory(ss, userId, 'gain', totalXp, '稽古記録（' + date + '・' + items.length + '項目）', newXp, newLevel);

  // ★ Phase6: アチーブメント解除判定
  var newAchievements = checkAndUnlockAchievements(ss, userId, date, logSheet);

  return createResponse({
    xp_earned:        totalXp,
    total_xp:         newXp,
    level:            newLevel,
    // ★ Phase9.5: title をレスポンスから削除
    newAchievements:  newAchievements,
  });
}

// =====================================================================
// F2. profile（user_status 拡張）
// ★ Phase9.5: 列インデックス修正
//   旧: col4=title, col5=last_practice_date, col6=last_decay_date, col7=real_rank, col8=motto, col9=favorite_technique
//   新: col4=last_practice_date, col5=last_decay_date, col6=real_rank, col7=motto, col8=favorite_technique
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
    // ★ Phase9.5: 8列で新規挿入
    current = [userId, 0, 1, '', today, '', '', ''];
    sheet.appendRow(current);
    rowIdx = rows.length;
  } else {
    current = rows[rowIdx];
    while (current.length < 8) current.push('');
  }

  // ★ Phase9.5: real_rank=index5, motto=index6, favorite_technique=index7
  if (realRank !== undefined && realRank !== null) current[5] = realRank;
  if (motto    !== undefined && motto    !== null) current[6] = motto;
  if (favTech  !== undefined && favTech  !== null) current[7] = favTech;

  // ★ Phase9.5: 8列で書き戻し
  sheet.getRange(rowIdx + 1, 1, 1, 8).setValues([[
    current[0], current[1], current[2], current[3], current[4],
    current[5], current[6], current[7],
  ]]);

  gasLog('INFO', 'updateProfile', 'profile updated user=' + userId, {
    real_rank: current[5], motto: current[6], favorite_technique: current[7],
  });
  return createResponse({ updated: true });
}

// =====================================================================
// G. user_status
// ★ Phase9.5: 列インデックス修正
//   旧: [1]=total_xp, [2]=level, [3]=title, [4]=last_practice_date,
//       [5]=last_decay_date, [6]=real_rank, [7]=motto, [8]=favorite_technique
//   新: [1]=total_xp, [2]=level, [3]=last_practice_date,
//       [4]=last_decay_date, [5]=real_rank, [6]=motto, [7]=favorite_technique
// =====================================================================

function getUserStatus(params) {
  var userId = params.user_id;
  if (!userId) return createError('user_id は必須です', 400);

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_STATUS);
  if (!sheet) return createResponse({ total_xp:0, level:1 });

  var rows = filterRowsByUserId(sheet, userId);
  if (rows.length === 0) return createResponse({ total_xp:0, level:1 });

  var row = rows[0];
  return createResponse({
    total_xp:            parseInt(row[1]) || 0,
    level:               parseInt(row[2]) || 1,
    // ★ Phase9.5: title を返さない。row[3]=last_practice_date に変更。
    last_practice_date:  String(row[3] || ''),
    real_rank:           String(row[5] || ''),
    motto:               String(row[6] || ''),
    favorite_technique:  String(row[7] || ''),
  });
}

function resetStatus(body) {
  var userId = body.user_id;
  if (!userId) return createError('user_id は必須です', 400);

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_STATUS);
  var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

  deleteRowsByUserId(sheet, userId);
  // ★ Phase9.5: 8列で挿入（title 列なし）
  sheet.appendRow([userId, 0, 1, '', today, '', '', '']);

  // ★ Phase9.5: title 引数なし
  writeXpHistory(ss, userId, 'reset', 0, 'レベルリセット', 0, 1);
  gasLog('INFO', 'resetStatus', 'reset user=' + userId);
  return createResponse({ total_xp: 0, level: 1 });
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
  // ★ user_tasks は A列=id(UUID)、B列=user_id のため r[1] でフィルタする
  return rows.slice(1)
    .filter(function(r){ return String(r[1]) === String(userId); })
    .map(function(r){
      return {
        id:         String(r[0]),
        task_text:  String(r[2]),
        status:     String(r[3]),
        created_at: r[4] ? String(r[4]).slice(0, 10) : '',
        updated_at: r[5] ? String(r[5]).slice(0, 10) : '',
      };
    })
    .filter(function(t) { return t.id && t.task_text; });
}

/**
 * updateTasks
 * ★ スマート差分対応版
 */
function updateTasks(body) {
  var userId = body.user_id;
  var tasks  = body.tasks; // Array<{id?: string, text: string}>
  if (!userId) return createError('user_id は必須です', 400);
  if (!tasks || !Array.isArray(tasks)) return createError('tasks は配列で必須です', 400);

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = getUserTasksSheet(ss);
  var ts    = nowJstTs();

  var tasksWithId = {};  // id -> text
  var newTasks    = [];  // text のみ

  tasks.forEach(function(t) {
    var text = (t.text || '').trim();
    if (!text) return;
    if (t.id) {
      tasksWithId[String(t.id)] = text;
    } else {
      newTasks.push(text);
    }
  });

  var foundIds = {};

  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (String(r[1]) !== String(userId)) continue;
    var rowId = String(r[0]);

    if (tasksWithId[rowId] !== undefined) {
      sheet.getRange(i + 1, 3).setValue(tasksWithId[rowId]);
      sheet.getRange(i + 1, 4).setValue('active');
      sheet.getRange(i + 1, 6).setValue(ts);
      foundIds[rowId] = true;
    } else if (String(r[3]) === 'active') {
      sheet.getRange(i + 1, 4).setValue('archived');
      sheet.getRange(i + 1, 6).setValue(ts);
    }
  }

  var newRows = [];

  Object.keys(tasksWithId).forEach(function(id) {
    if (!foundIds[id]) {
      newRows.push([id, userId, tasksWithId[id], 'active', ts, ts]);
    }
  });

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
// ★ Phase8: 列拡張 user_id(0), technique_id(1), Points(2), LastRating(3),
//            last_quantity(4), last_quality(5), last_feedback(6)
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
        points:        Number(r[2]) || 0,
        lastRating:    Number(r[3]) || 0,
        lastQuantity:  Number(r[4]) || 0,
        lastQuality:   Number(r[5]) || 0,
        lastFeedback:  String(r[6] || ''),
      };
    });
  }

  var techs = master.map(function(m){
    var rec = userMap[m.id] || { points: 0, lastRating: 0, lastQuantity: 0, lastQuality: 0, lastFeedback: '' };
    return {
      id:           m.id,
      bodyPart:     m.bodyPart,
      actionType:   m.actionType,
      subCategory:  m.subCategory,
      name:         m.name,
      points:       rec.points,
      lastRating:   rec.lastRating,
      lastQuantity: rec.lastQuantity,
      lastQuality:  rec.lastQuality,
      lastFeedback: rec.lastFeedback,
    };
  });

  gasLog('INFO', 'getTechniques', techs.length + '件 user:' + userId);
  return createResponse(techs);
}

/**
 * updateTechniqueRating ★ Phase8 完全刷新
 * ★ Phase9.5: title 関連を削除
 *
 * body: { user_id, id (technique_id), quantity (1-5), quality (1-5) }
 *
 * user_status 新列構成（Phase9.5）:
 *   [0]=user_id, [1]=total_xp, [2]=level, [3]=last_practice_date,
 *   [4]=last_decay_date, [5]=real_rank, [6]=motto, [7]=favorite_technique
 */
function updateTechniqueRating(body) {
  var userId   = body.user_id;
  var id       = body.id;
  var quantity = parseInt(body.quantity);
  var quality  = parseInt(body.quality);

  if (!userId)  return createError('user_id は必須です', 400);
  if (!id)      return createError('id は必須です', 400);
  if (isNaN(quantity) || quantity < 1 || quantity > 5)
    return createError('quantity は 1〜5 の整数で指定してください', 400);
  if (isNaN(quality) || quality < 1 || quality > 5)
    return createError('quality は 1〜5 の整数で指定してください', 400);

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
  var techniqueName = masterEntry.name;

  var QUANTITY_BASE = { 1: 10, 2: 20, 3: 30, 4: 40, 5: 50 };
  var QUALITY_MULT  = { 1: 0.1, 2: 0.5, 3: 1.0, 4: 2.0, 5: 5.0 };
  var earnedPoints  = Math.ceil(QUANTITY_BASE[quantity] * QUALITY_MULT[quality]);

  var YOJI_MATRIX = {
    '1_1': '点滴穿石',  '1_2': '一念発起',  '1_3': '虚心坦懐',  '1_4': '明鏡止水',  '1_5': '一撃必殺',
    '2_1': '試行錯誤',  '2_2': '日進月歩',  '2_3': '一意専心',  '2_4': '不撓不屈',  '2_5': '電光石火',
    '3_1': '継続是力',  '3_2': '磨斧作針',  '3_3': '切磋琢磨',  '3_4': '剣禅一如',  '3_5': '勇猛精進',
    '4_1': '積小成大',  '4_2': '臥薪嘗胆',  '4_3': '粒粒辛苦',  '4_4': '威風堂々',  '4_5': '破竹之勢',
    '5_1': '徒労無功',  '5_2': '七転八起',  '5_3': '心技体一',  '5_4': '鬼神之勇',  '5_5': '百錬自得',
  };
  var feedbackKey = quantity + '_' + quality;
  var feedback    = YOJI_MATRIX[feedbackKey] || '切磋琢磨';

  var utSheet = ss.getSheetByName(SHEET_USER_TECHNIQUES);
  if (!utSheet) {
    utSheet = ss.insertSheet(SHEET_USER_TECHNIQUES);
    utSheet.appendRow(['user_id', 'technique_id', 'Points', 'LastRating', 'last_quantity', 'last_quality', 'last_feedback']);
    utSheet.getRange(1,1,1,7).setFontWeight('bold').setBackground('#1e1b4b').setFontColor('#fff');
    utSheet.setFrozenRows(1);
    gasLog('INFO', 'updateTechniqueRating', 'user_techniques シートを自動作成しました（Phase8 7列）');
  }

  var utRows   = utSheet.getDataRange().getValues();
  var utRowIdx = -1;
  for (var i = 1; i < utRows.length; i++) {
    if (String(utRows[i][0]) === String(userId) && String(utRows[i][1]) === String(id)) {
      utRowIdx = i; break;
    }
  }

  var newPoints;
  if (utRowIdx === -1) {
    newPoints = earnedPoints;
    utSheet.appendRow([userId, id, newPoints, quality, quantity, quality, feedback]);
    gasLog('INFO', 'updateTechniqueRating', 'INSERT user=' + userId + ' id=' + id + ' pts=' + newPoints + ' feedback=' + feedback);
  } else {
    var currentPts = Number(utRows[utRowIdx][2]) || 0;
    newPoints      = currentPts + earnedPoints;
    var sheetRow   = utRowIdx + 1;
    utSheet.getRange(sheetRow, 3, 1, 5).setValues([[newPoints, quality, quantity, quality, feedback]]);
    gasLog('INFO', 'updateTechniqueRating',
      'UPDATE user=' + userId + ' id=' + id + ' ' + currentPts + '->' + newPoints + ' feedback=' + feedback);
  }

  var tlSheet = ss.getSheetByName(SHEET_TECH_LOGS);
  if (!tlSheet) {
    tlSheet = ss.insertSheet(SHEET_TECH_LOGS);
    tlSheet.appendRow(['user_id', 'date', 'technique_id', 'quantity', 'quality', 'xp_earned', 'feedback']);
    tlSheet.getRange(1,1,1,7).setFontWeight('bold').setBackground('#1e1b4b').setFontColor('#fff');
    tlSheet.setFrozenRows(1);
    gasLog('INFO', 'updateTechniqueRating', 'technique_logs シートを自動作成しました（Phase8）');
  }
  var ts = nowJstTs();
  tlSheet.appendRow([userId, ts, id, quantity, quality, earnedPoints, feedback]);

  var statSheet = ss.getSheetByName(SHEET_STATUS);
  if (!statSheet) return createError('user_status シートが存在しません', 500);

  var statAllRows = statSheet.getDataRange().getValues();
  var statRowIdx  = -1;
  for (var s = 1; s < statAllRows.length; s++) {
    if (String(statAllRows[s][0]) === String(userId)) { statRowIdx = s; break; }
  }

  var currentXp = statRowIdx !== -1 ? (parseInt(statAllRows[statRowIdx][1]) || 0) : 0;
  var newXp     = currentXp + earnedPoints;
  var newLevel  = calcLevel(newXp);
  var today     = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

  if (statRowIdx !== -1) {
    // ★ Phase9.5: col2=total_xp, col3=level（title 列なし）
    statSheet.getRange(statRowIdx + 1, 2, 1, 2).setValues([[newXp, newLevel]]);
  } else {
    // ★ Phase9.5: 8列で新規挿入
    statSheet.appendRow([userId, newXp, newLevel, '', today, '', '', '']);
  }

  var reason = '技の稽古: ' + techniqueName + '（' + feedback + '）';
  // ★ Phase9.5: title 引数なし
  writeXpHistory(ss, userId, 'gain', earnedPoints, reason, newXp, newLevel);

  gasLog('INFO', 'updateTechniqueRating',
    'DONE user=' + userId + ' tech=' + id + '(' + techniqueName + ')' +
    ' qty=' + quantity + ' qlt=' + quality + ' +' + earnedPoints + 'XP ' + feedback);

  return createResponse({
    id:           String(id),
    points:       newPoints,
    earnedPoints: earnedPoints,
    feedback:     feedback,
    total_xp:     newXp,
    level:        newLevel,
  });
}

// =====================================================================
// I3. 他者評価（peer_evaluations）
// ★ Phase7: 課題単位配列評価対応
// ★ Phase9.5: title 関連を削除
// ★ Phase-ex1: 匿名化（プライバシー保護）
//   xp_history.reason に評価者名を保存しないよう、
//   '剣友からの評価（...）' 形式で記録する。
//
// peer_evaluations スキーマ（6列）:
//   A: evaluator_id
//   B: target_id
//   C: task_id      ★ Phase7追加
//   D: date
//   E: score
//   F: xp_granted
//
// user_status 新列構成（Phase9.5）:
//   [0]=user_id, [1]=total_xp, [2]=level, [3]=last_practice_date,
//   [4]=last_decay_date, [5]=real_rank, [6]=motto, [7]=favorite_technique
// =====================================================================

function getPeerLevelMultiplier(level) {
  if (level >= 80) return 5.0;
  if (level >= 60) return 3.0;
  if (level >= 40) return 2.0;
  if (level >= 30) return 1.5;
  if (level >= 20) return 1.2;
  return 1.0;
}

/**
 * evaluatePeer
 * ★ Phase7: items 配列（{ taskId, score }[]）を受け取り、課題単位で記録する。
 * ★ Phase9.5: title 関連を削除。user_status インデックス修正。
 * ★ Phase-ex1: writeXpHistory.reason から評価者名を排除し匿名化。
 */
function evaluatePeer(body) {
  var evaluatorId = body.user_id;
  var targetId    = body.target_id;
  var items       = body.items; // Array<{ taskId: string, score: number }>

  if (!evaluatorId) return createError('user_id は必須です', 400);
  if (!targetId)    return createError('target_id は必須です', 400);
  if (String(evaluatorId) === String(targetId)) {
    return createError('自分自身を評価することはできません', 400);
  }
  if (!items || !Array.isArray(items) || items.length === 0) {
    return createError('items は空でない配列で指定してください', 400);
  }

  for (var v = 0; v < items.length; v++) {
    var sc = parseInt(items[v].score);
    if (!items[v].taskId)               return createError('items[' + v + '].taskId は必須です', 400);
    if (isNaN(sc) || sc < 1 || sc > 5) return createError('items[' + v + '].score は 1〜5 の整数で指定してください', 400);
  }

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

  var peSheet = ss.getSheetByName(SHEET_PEER_EVALS);
  if (!peSheet) {
    peSheet = ss.insertSheet(SHEET_PEER_EVALS);
    peSheet.appendRow(['evaluator_id', 'target_id', 'task_id', 'date', 'score', 'xp_granted']);
    peSheet.getRange(1,1,1,6).setFontWeight('bold').setBackground('#1e1b4b').setFontColor('#fff');
    peSheet.setFrozenRows(1);
    gasLog('INFO', 'evaluatePeer', 'peer_evaluations シートを自動作成しました');
  }

  var peRows = peSheet.getDataRange().getValues();
  var alreadyEvaluatedSet = {};
  for (var i = 1; i < peRows.length; i++) {
    var pe = peRows[i];
    if (String(pe[0]) === String(evaluatorId) &&
        String(pe[1]) === String(targetId) &&
        toDateStr(pe[3]) === today) {
      alreadyEvaluatedSet[String(pe[2])] = true;
    }
  }

  var statSheet = ss.getSheetByName(SHEET_STATUS);
  if (!statSheet) return createError('user_status シートが存在しません', 500);

  var evalRows  = filterRowsByUserId(statSheet, evaluatorId);
  var evalLevel = evalRows.length > 0 ? (parseInt(evalRows[0][2]) || 1) : 1;
  var mult      = getPeerLevelMultiplier(evalLevel);

  // ★ Phase-ex1: evalName は内部ログ（gasLog）専用とし、xp_history には保存しない
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

  var evaluatedTasks = [];
  var skippedTasks   = [];
  var totalScoreSum  = 0;
  var ts             = nowJstTs();

  items.forEach(function(item) {
    var taskId = String(item.taskId);
    var score  = parseInt(item.score);

    if (alreadyEvaluatedSet[taskId]) {
      skippedTasks.push(taskId);
      return;
    }

    peSheet.appendRow([evaluatorId, targetId, taskId, ts, score, 0]);
    evaluatedTasks.push(taskId);
    totalScoreSum += score;
  });

  var xpGranted = evaluatedTasks.length > 0 ? Math.ceil(totalScoreSum * 2 * mult) : 0;

  if (xpGranted > 0) {
    var perItemXp = Math.ceil(xpGranted / evaluatedTasks.length);
    var peLastRow = peSheet.getLastRow();
    var updatedCount = 0;
    for (var r = peLastRow; r >= 2 && updatedCount < evaluatedTasks.length; r--) {
      var row = peSheet.getRange(r, 1, 1, 6).getValues()[0];
      if (String(row[0]) === String(evaluatorId) &&
          String(row[1]) === String(targetId) &&
          String(row[5]) === '0') {
        peSheet.getRange(r, 6).setValue(perItemXp);
        updatedCount++;
      }
    }

    var targetRows = filterRowsByUserId(statSheet, targetId);
    var hasTarget  = targetRows.length > 0;
    var currentXp  = hasTarget ? (parseInt(targetRows[0][1]) || 0) : 0;
    var newXp      = currentXp + xpGranted;
    var newLevel   = calcLevel(newXp);

    if (hasTarget) {
      var allStatRows = statSheet.getDataRange().getValues();
      for (var sr = allStatRows.length; sr >= 2; sr--) {
        if (String(allStatRows[sr-1][0]) === String(targetId)) {
          // ★ Phase9.5: col2=total_xp, col3=level（title 列なし）
          statSheet.getRange(sr, 2).setValue(newXp);
          statSheet.getRange(sr, 3).setValue(newLevel);
          break;
        }
      }
    } else {
      // ★ Phase9.5: 8列で新規挿入
      statSheet.appendRow([targetId, newXp, newLevel, '', today, '', '', '']);
    }

    // ★ Phase-ex1: 評価者名を含めず、'剣友からの評価（...）' で匿名化して記録
    writeXpHistory(ss, targetId, 'peer_eval', xpGranted,
      '剣友からの評価（' + evaluatedTasks.length + '課題・合計スコア: ' + totalScoreSum + '）',
      newXp, newLevel);
  }

  gasLog('INFO', 'evaluatePeer',
    'evaluator=' + evaluatorId + '(' + evalLevel + ') evaluated=' + evaluatedTasks.length +
    ' skipped=' + skippedTasks.length + ' scoreSum=' + totalScoreSum + ' +' + xpGranted + 'XP(×' + mult + ')',
    { evalName: evalName, evaluatedTasks: evaluatedTasks, skippedTasks: skippedTasks });

  return createResponse({
    xp_granted:      xpGranted,
    evaluator_level: evalLevel,
    multiplier:      mult,
    evaluated_tasks: evaluatedTasks,
    skipped_tasks:   skippedTasks,
  });
}

/**
 * getTodayEvaluations
 * ★ Phase7: 今日、自分（user_id）が指定ユーザー（target_id）を評価済みの
 * task_id 一覧を返す。
 */
function getTodayEvaluations(params) {
  var evaluatorId = params.user_id;
  var targetId    = params.target_id;

  if (!evaluatorId) return createError('user_id は必須です', 400);
  if (!targetId)    return createError('target_id は必須です', 400);

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

  var peSheet = ss.getSheetByName(SHEET_PEER_EVALS);
  if (!peSheet) {
    return createResponse({ evaluated_task_ids: [] });
  }

  var peRows = peSheet.getDataRange().getValues();
  var evaluatedTaskIds = [];

  for (var i = 1; i < peRows.length; i++) {
    var pe = peRows[i];
    // 列: evaluator_id(0), target_id(1), task_id(2), date(3), score(4), xp_granted(5)
    if (String(pe[0]) === String(evaluatorId) &&
        String(pe[1]) === String(targetId) &&
        toDateStr(pe[3]) === today) {
      var tid = String(pe[2] || '');
      if (tid) evaluatedTaskIds.push(tid);
    }
  }

  gasLog('INFO', 'getTodayEvaluations',
    'evaluator=' + evaluatorId + ' target=' + targetId + ' evaluated=' + evaluatedTaskIds.length);
  return createResponse({ evaluated_task_ids: evaluatedTaskIds });
}

// =====================================================================
// J. getDashboard（統合取得）
// ★ Phase4: settings フィールド廃止。logs は task_id → item_name に JOIN して返す。
// ★ Phase8 Step3-1: peerLogs を追加（他者から受けた評価ログ）
// ★ Phase9.5: user_status / xp_history の列インデックス修正。title を返さない。
// ★ Phase10: matchupMaster / peersStyle を追加
//
// user_status 新列構成（Phase9.5）:
//   [0]=user_id, [1]=total_xp, [2]=level, [3]=last_practice_date,
//   [4]=last_decay_date, [5]=real_rank, [6]=motto, [7]=favorite_technique
//
// xp_history 新列構成（Phase9.5）:
//   [0]=user_id, [1]=date, [2]=type, [3]=amount, [4]=reason,
//   [5]=total_xp_after, [6]=level
// =====================================================================

function getDashboard(params) {
  var userId = params.user_id;
  if (!userId) return createError('user_id は必須です', 400);

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // ── 1. XP減衰を先に適用 ──
  var decayResult = applyDecay(ss, userId);

  // ── 2. user_status ──
  // ★ Phase9.5: title を除いたオブジェクト。インデックス修正済み。
  var status = { total_xp: 0, level: 1, last_practice_date: '', real_rank: '', motto: '', favorite_technique: '' };
  var statSheet = ss.getSheetByName(SHEET_STATUS);
  if (statSheet) {
    var statRows = filterRowsByUserId(statSheet, userId);
    if (statRows.length > 0) {
      var sr = statRows[0];
      status = {
        total_xp:           parseInt(sr[1]) || 0,
        level:              parseInt(sr[2]) || 1,
        // ★ Phase9.5: [3]=last_practice_date, [4]=last_decay_date(内部用のみ), [5]=real_rank, [6]=motto, [7]=favorite_technique
        last_practice_date: String(sr[3] || ''),
        real_rank:          String(sr[5] || ''),
        motto:              String(sr[6] || ''),
        favorite_technique: String(sr[7] || ''),
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

  // ── 7. epithet_master（Phase9.1 bugfix: rarity/description 列マッピング修正済み）──
  var epithetMaster = getEpithetMasterData(ss);

  // ── 8. xp_history（直近90件）──
  // ★ Phase9.5: title 列(旧[7])を除いた 7列構成。[6]=level まで。
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
        // ★ Phase9.5: title を返さない
      };
    }).filter(function(e){ return e.date; });
  }

  // ── 9. technique_master（全件） ──
  var techniqueMaster = getTechniqueMasterData(ss);

  // ── 10. peerLogs（他者から受けた評価ログ）★ Phase8 Step3-1 ──
  // peer_evaluations 列: evaluator_id(0), target_id(1), task_id(2), date(3), score(4), xp_granted(5)
  var peerLogs = [];
  var peSheet  = ss.getSheetByName(SHEET_PEER_EVALS);
  if (peSheet) {
    var peRows = peSheet.getDataRange().getValues();
    for (var i = 1; i < peRows.length; i++) {
      var pe = peRows[i];
      if (String(pe[1]) !== String(userId)) continue;
      var taskId   = String(pe[2] || '');
      var itemName = taskMap[taskId] || taskId;
      var dateStr  = pe[3] ? String(pe[3]).slice(0, 10) : '';
      var score    = parseInt(pe[4]) || 0;
      if (!dateStr || !itemName || score < 1) continue;
      peerLogs.push({
        date:      dateStr,
        item_name: itemName,
        score:     score,
      });
    }
  }

  // ── 11. matchupMaster（剣風相性マスタ全件）★ Phase10 ──
  var matchupMaster = getMatchupMasterData(ss);

  // ── 12. peersStyle（自分以外の剣友のスタイル一覧）★ Phase10 ──
  var peersStyle = getPeersStyleData(ss, userId);

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
    peerLogs:        peerLogs,
    matchupMaster:   matchupMaster,   // ★ Phase10
    peersStyle:      peersStyle,      // ★ Phase10
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
// ★ Phase9:   EpithetMaster を6列構成に拡張
//             A=ID, B=Category, C=TriggerValue, D=Name, E=Rarity, F=Description
// ★ Phase9.1 bugfix: getEpithetMasterData の列マッピングを修正
//   - 旧実装: description = row[4] ← 誤り（これは Rarity 列）
//   - 新実装: rarity      = row[4]  ← 正しい（E列）
//             description = row[5]  ← 正しい（F列）
// =====================================================================

function getEpithetMasterData(ss) {
  var sheet = ss.getSheetByName(SHEET_EPITHET_MASTER);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_EPITHET_MASTER);
    sheet.appendRow(['ID', 'Category', 'TriggerValue', 'Name', 'Rarity', 'Description']);
    sheet.getRange(1,1,1,6).setFontWeight('bold').setBackground('#1e1b4b').setFontColor('#fff');
    sheet.setFrozenRows(1);
    var def = [
      ['E001', 'styleCombo', '基本,出端技,払い技', '常道の',  'N', '基本を重んじ、出端と払いで攻める剣士'],
      ['E002', 'styleCombo', '出端技,払い技,返し技', '機知の', 'R', '出端と払いと返しを巧みに組み合わせる剣士'],
      ['E003', 'styleCombo', '抜き技,返し技,摺り上げ技', '神速の', 'SR', '応じ技の三大技を極めた剣士に与えられる称号'],
    ];
    sheet.getRange(2, 1, def.length, 6).setValues(def);
    gasLog('INFO', 'getEpithetMasterData', 'EpithetMaster シートを自動作成しました（Phase9 6列）');
  }

  return sheet.getDataRange().getValues().slice(1)
    .filter(function(r){ return r[0] !== '' && r[2] !== '' && r[3] !== ''; })
    .map(function(r){
      return {
        id:           String(r[0]),
        category:     String(r[1] || ''),
        triggerValue: String(r[2] || ''),
        name:         String(r[3] || ''),
        rarity:       String(r[4] || ''),   // E列: Rarity（N / R / SR）
        description:  String(r[5] || ''),   // F列: Description（由来説明文）
      };
    });
}

function getEpithetMaster() {
  return createResponse(getEpithetMasterData(SpreadsheetApp.openById(SPREADSHEET_ID)));
}

// =====================================================================
// L2. 剣風相性マスタ（共通）★ Phase10
// MatchupMaster シートの列構成:
//   A=BaseStyle, B=MatchType (S/W), C=Degree (1-3),
//   D=TargetStyle, E=Reason, F=Advice
// =====================================================================

function getMatchupMasterData(ss) {
  var sheet = ss.getSheetByName(SHEET_MATCHUP_MASTER);
  if (!sheet) {
    gasLog('WARN', 'getMatchupMasterData', 'MatchupMaster シートが存在しません。空配列を返します');
    return [];
  }

  var rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];

  var data = rows.slice(1)
    .filter(function(r){
      // BaseStyle と TargetStyle が両方とも空でない行のみ採用
      return r[0] !== '' && r[3] !== '';
    })
    .map(function(r){
      return {
        baseStyle:   String(r[0] || ''),
        matchType:   String(r[1] || ''),   // 'S' or 'W'
        degree:      parseInt(r[2]) || 1,
        targetStyle: String(r[3] || ''),
        reason:      String(r[4] || ''),
        advice:      String(r[5] || ''),
      };
    });

  gasLog('INFO', 'getMatchupMasterData', data.length + '件 ロード成功');
  return data;
}

// =====================================================================
// L3. 剣友スタイル取得（自分以外のユーザーの favorite_technique）★ Phase10
//
// UserMaster (user_id, name, password, role) と
// user_status ([0]=user_id, [7]=favorite_technique) を JOIN する。
// =====================================================================

function getPeersStyleData(ss, currentUserId) {
  if (!currentUserId) return [];

  var umSheet = ss.getSheetByName(SHEET_USER_MASTER);
  if (!umSheet) {
    gasLog('WARN', 'getPeersStyleData', 'UserMaster シートが存在しません');
    return [];
  }

  // user_status から user_id -> favorite_technique のマップを構築
  var statSheet     = ss.getSheetByName(SHEET_STATUS);
  var favTechMap    = {};
  if (statSheet) {
    var statRows = statSheet.getDataRange().getValues();
    for (var i = 1; i < statRows.length; i++) {
      var sr = statRows[i];
      var uid = String(sr[0] || '');
      if (!uid) continue;
      // ★ Phase9.5: favorite_technique は H列（index 7）
      var fav = String(sr[7] || '');
      if (fav) favTechMap[uid] = fav;
    }
  }

  // UserMaster を走査して自分以外のユーザーをリストアップ
  var umRows = umSheet.getDataRange().getValues();
  var peers  = [];
  for (var j = 1; j < umRows.length; j++) {
    var ur     = umRows[j];
    var uid    = String(ur[0] || '');
    var name   = String(ur[1] || '');
    if (!uid || uid === String(currentUserId)) continue;

    var entry = {
      userId: uid,
      name:   name,
    };
    if (favTechMap[uid]) {
      entry.favoriteTechnique = favTechMap[uid];
    }
    peers.push(entry);
  }

  gasLog('INFO', 'getPeersStyleData', peers.length + '人 ロード成功 (currentUser=' + currentUserId + ')');
  return peers;
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
// ★ Phase9.5: user_status 列インデックス修正
//   旧: [4]=last_practice_date, [5]=last_decay_date, [3]=title（書き込み対象）
//   新: [3]=last_practice_date, [4]=last_decay_date
//   → getRange 書き込み列も修正済み
// =====================================================================

function dailyPenalty(d) {
  if (d <= 3) return 0;
  return Math.floor(20 * Math.pow(d - 3, 1.3));
}

function toDateStr(val) {
  if (!val) return '';
  try {
    if (val instanceof Date) return Utilities.formatDate(val, 'Asia/Tokyo', 'yyyy-MM-dd');
    var s = String(val);
    if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.slice(0,10);
    var d = new Date(s);
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
  } catch(e) {}
  return '';
}

function applyDecay(ss, userId) {
  var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  var result = { applied: 0, days_absent: 0, today_penalty: 0 };

  try {
    var statSheet = ss.getSheetByName(SHEET_STATUS);
    if (!statSheet) return result;

    var rows   = statSheet.getDataRange().getValues();
    var rowIdx = -1;
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(userId)) { rowIdx = i; break; }
    }
    if (rowIdx === -1) return result;

    var row           = rows[rowIdx];
    var currentXp     = parseInt(row[1]) || 0;
    // ★ Phase9.5: last_practice_date=[3], last_decay_date=[4]
    var lastPractice  = toDateStr(row[3]);
    var lastDecayDate = toDateStr(row[4]);

    if (!lastPractice) return result;

    var practiceDate = new Date(lastPractice);
    var todayDate    = new Date(today);
    practiceDate.setHours(0,0,0,0);
    todayDate.setHours(0,0,0,0);
    var daysAbsent = Math.floor((todayDate - practiceDate) / 86400000);

    if (daysAbsent <= 3) return result;
    if (lastDecayDate === today) return result;

    var penalty  = dailyPenalty(daysAbsent);
    var newXp    = Math.max(0, currentXp - penalty);
    var newLevel = calcLevel(newXp);

    // ★ Phase9.5: col2=total_xp, col3=level（title 列なし）
    statSheet.getRange(rowIdx + 1, 2).setValue(newXp);
    statSheet.getRange(rowIdx + 1, 3).setValue(newLevel);
    // ★ Phase9.5: last_decay_date は E列（col5）
    statSheet.getRange(rowIdx + 1, 5).setValue(today);

    // ★ Phase9.5: title 引数なし
    writeXpHistory(ss, userId, 'decay', -penalty,
      daysAbsent + '日間稽古なし（減衰）', newXp, newLevel);

    result = { applied: penalty, days_absent: daysAbsent, today_penalty: penalty };
  } catch(e) {
    gasLog('WARN', 'applyDecay', e.message);
  }
  return result;
}

// =====================================================================
// O. アチーブメント（実績バッジ）システム ★ Phase6
// =====================================================================

/**
 * achievement_master シートを取得（なければ自動作成＋デフォルト8件投入）
 * 列: achievement_id(0), name(1), condition_type(2), condition_value(3), description(4), hint(5), icon_type(6)
 */
function getAchievementMasterSheet(ss) {
  var sheet = ss.getSheetByName(SHEET_ACHIEVEMENT_MASTER);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_ACHIEVEMENT_MASTER);
    sheet.appendRow(['achievement_id', 'name', 'condition_type', 'condition_value', 'description', 'hint', 'icon_type']);
    sheet.getRange(1,1,1,7).setFontWeight('bold').setBackground('#1e1b4b').setFontColor('#fff');
    sheet.setFrozenRows(1);
    var defaults = [
      ['ACH001', '初稽古',       'total_practices',  1,   '初めての稽古を記録した',             '稽古記録を1回つけよう',     'first_step'],
      ['ACH002', '三日坊主克服', 'streak_days',       3,   '3日連続で稽古を記録した',             '3日連続で稽古しよう',       'streak_3'],
      ['ACH003', '一週間の剣士', 'streak_days',       7,   '7日連続で稽古を記録した',             '7日連続で稽古しよう',       'streak_7'],
      ['ACH004', '精進十日',     'streak_days',       10,  '10日連続で稽古を記録した',            '10日連続で稽古しよう',      'streak_10'],
      ['ACH005', '一ヶ月皆勤',   'streak_days',       30,  '30日連続で稽古を記録した',            '30日連続で稽古しよう',      'streak_30'],
      ['ACH006', '十稽古',       'total_practices',  10,  '累計10回の稽古を記録した',            '累計10回稽古しよう',        'milestone_10'],
      ['ACH007', '五十稽古',     'total_practices',  50,  '累計50回の稽古を記録した',            '累計50回稽古しよう',        'milestone_50'],
      ['ACH008', '百錬自得',     'total_practices', 100,  '累計100回の稽古を記録した',           '累計100回稽古しよう',       'legendary'],
    ];
    sheet.getRange(2, 1, defaults.length, 7).setValues(defaults);
    gasLog('INFO', 'getAchievementMasterSheet', 'achievement_master シートを自動作成しました');
  }
  return sheet;
}

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

function getAchievements(params) {
  var userId = params.user_id;
  if (!userId) return createError('user_id は必須です', 400);

  var ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
  var master  = getAchievementMasterData(ss);
  var uaSheet = getUserAchievementsSheet(ss);
  var uaRows  = filterRowsByUserId(uaSheet, userId);

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

function calcCurrentStreak(logSheet, userId, todayStr) {
  var rows = filterRowsByUserId(logSheet, userId);

  var dateSet = {};
  rows.forEach(function(r) {
    var d = toDateStr(r[1]);
    if (d) dateSet[d] = true;
  });
  dateSet[todayStr] = true;

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

function checkAndUnlockAchievements(ss, userId, date, logSheet) {
  var newlyUnlocked = [];

  try {
    var master  = getAchievementMasterData(ss);
    if (master.length === 0) return newlyUnlocked;

    var uaSheet = getUserAchievementsSheet(ss);
    var uaRows  = filterRowsByUserId(uaSheet, userId);

    var unlockedSet = {};
    uaRows.forEach(function(r){ unlockedSet[String(r[1])] = true; });

    var candidates = master.filter(function(m){
      return !unlockedSet[m.id] &&
        (m.conditionType === 'streak_days' || m.conditionType === 'total_practices');
    });
    if (candidates.length === 0) return newlyUnlocked;

    var todayStr = (date && date.match(/^\d{4}-\d{2}-\d{2}$/))
      ? date
      : Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

    var streakCache     = null;
    var totalPractCache = null;
    var unlockedAt      = nowJstTs();

    candidates.forEach(function(m) {
      var achieved = false;

      if (m.conditionType === 'streak_days') {
        if (streakCache === null) streakCache = calcCurrentStreak(logSheet, userId, todayStr);
        achieved = streakCache >= m.conditionValue;
      } else if (m.conditionType === 'total_practices') {
        if (totalPractCache === null) totalPractCache = calcTotalPractices(logSheet, userId, todayStr);
        achieved = totalPractCache >= m.conditionValue;
      }

      if (achieved) {
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
    gasLog('ERROR', 'checkAndUnlockAchievements', e.message, { stack: e.stack });
  }

  return newlyUnlocked;
}
