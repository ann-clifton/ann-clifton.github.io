/**
 * AXIOM Lab reservation backend (Google Apps Script).
 *
 * Stores reservations in the Google Sheet named by SPREADSHEET_ID below.
 * Deployed as a Web app, it answers:
 *   GET  ?date=YYYY-MM-DD   -> {ok:true, reservations:[{name,purpose,date,start,end}]}
 *   POST {name,purpose,date,start,end} (JSON body) -> {ok:true} or {ok:false, error}
 *
 * See SETUP.md for the (one-time, ~5 minute) deployment steps.
 */

// ID of the Google Sheet that stores reservations (from its URL).
var SPREADSHEET_ID = '1KkxpSdXO8_TD2vcu1VAajjhklaJ-hpaekLrHTTbWztw';
var SHEET_NAME = 'Reservations';
var OPEN_HOUR = 8;    // 8:00 AM
var CLOSE_HOUR = 19;  // 7:00 PM
var HEADERS = ['Timestamp', 'Name', 'Purpose', 'Date', 'Start', 'End'];

function getSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Sheets turns "2026-09-10" into a Date cell; normalise back to a string.
function dateStr_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(v).trim();
}

function readAll_() {
  var rows = getSheet_().getDataRange().getValues().slice(1);
  return rows
    .filter(function (r) { return r[3] !== '' && r[4] !== '' && r[5] !== ''; })
    .map(function (r) {
      return { name: String(r[1]), purpose: String(r[2]), date: dateStr_(r[3]), start: Number(r[4]), end: Number(r[5]) };
    });
}

function doGet(e) {
  var date = e && e.parameter && e.parameter.date;
  var all = readAll_();
  if (date) all = all.filter(function (r) { return r.date === date; });
  return json_({ ok: true, reservations: all });
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); }
  catch (err) { return json_({ ok: false, error: 'Bad request.' }); }

  var name = String(body.name || '').trim().slice(0, 80);
  var purpose = String(body.purpose || '').trim().slice(0, 160);
  var date = String(body.date || '').trim();
  var start = Number(body.start), end = Number(body.end);

  if (!name || !purpose) return json_({ ok: false, error: 'Name and purpose are required.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json_({ ok: false, error: 'Invalid date.' });
  var p = date.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
  if (d.getDay() === 0 || d.getDay() === 6) return json_({ ok: false, error: 'The lab is closed on weekends.' });
  if (!(start >= OPEN_HOUR && end <= CLOSE_HOUR && start < end && start % 1 === 0 && end % 1 === 0)) {
    return json_({ ok: false, error: 'Reservations must fall between 8:00 AM and 7:00 PM.' });
  }

  // Lock so two people cannot book the same slot at the same instant.
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var clash = readAll_().some(function (r) { return r.date === date && r.start < end && start < r.end; });
    if (clash) return json_({ ok: false, error: 'That time is already reserved.' });
    getSheet_().appendRow([new Date(), name, purpose, "'" + date, start, end]);
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true });
}
