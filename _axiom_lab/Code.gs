/**
 * AXIOM Lab reservation backend (Google Apps Script).
 *
 * Stores reservations in the Google Sheet named by SPREADSHEET_ID below.
 * Deployed as a Web app, it answers:
 *   GET  ?date=YYYY-MM-DD   -> {ok:true, reservations:[{name,purpose,date,start,end}]}
 *   POST {name,purpose,date,start,end} (JSON body) -> {ok:true, code} or {ok:false, error}
 *   POST {action:"cancel", code}              -> {ok:true, reservation} or {ok:false, error}
 * start/end are decimal hours on a quarter-hour grid (9.25 = 9:15 AM, 13.5 = 1:30 PM).
 * Each booking gets a short cancellation code (column G) that the booker can use to cancel it.
 *
 * See SETUP.md for the (one-time, ~5 minute) deployment steps.
 */

// ID of the Google Sheet that stores reservations (from its URL).
var SPREADSHEET_ID = '1KkxpSdXO8_TD2vcu1VAajjhklaJ-hpaekLrHTTbWztw';
var SHEET_NAME = 'Reservations';
var OPEN_HOUR = 8;    // 8:00 AM
var CLOSE_HOUR = 19;  // 7:00 PM
var HEADERS = ['Timestamp', 'Name', 'Purpose', 'Date', 'Start', 'End', 'Code'];
var CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  // no 0/O/1/I, to avoid misreading

function getSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  // Sheets created before cancellation codes existed lack the Code column.
  if (sheet.getLastColumn() < HEADERS.length) sheet.getRange(1, HEADERS.length).setValue(HEADERS[HEADERS.length - 1]);
  return sheet;
}

function newCode_() {
  var code = '';
  for (var i = 0; i < 6; i++) code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  return code;
}

function rowToReservation_(r) {
  return { name: String(r[1]), purpose: String(r[2]), date: dateStr_(r[3]), start: Number(r[4]), end: Number(r[5]) };
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
    .map(rowToReservation_);  // codes (column G) are never returned here
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

  if (body.action === 'cancel') return cancel_(body);

  var name = String(body.name || '').trim().slice(0, 80);
  var purpose = String(body.purpose || '').trim().slice(0, 160);
  var date = String(body.date || '').trim();
  var start = Number(body.start), end = Number(body.end);

  if (!name || !purpose) return json_({ ok: false, error: 'Name and purpose are required.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json_({ ok: false, error: 'Invalid date.' });
  var p = date.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
  if (d.getDay() === 0 || d.getDay() === 6) return json_({ ok: false, error: 'The lab is closed on weekends.' });
  if (!(start >= OPEN_HOUR && end <= CLOSE_HOUR && start < end && (start * 4) % 1 === 0 && (end * 4) % 1 === 0)) {
    return json_({ ok: false, error: 'Reservations must fall between 8:00 AM and 7:00 PM, in 15-minute steps.' });
  }

  // Lock so two people cannot book the same slot at the same instant.
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var clash = readAll_().some(function (r) { return r.date === date && r.start < end && start < r.end; });
    if (clash) return json_({ ok: false, error: 'That time is already reserved.' });
    var code = newCode_();
    getSheet_().appendRow([new Date(), name, purpose, "'" + date, start, end, code]);
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true, code: code });
}

// Delete the booking whose cancellation code matches.
function cancel_(body) {
  var code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 6) return json_({ ok: false, error: 'Please enter the 6-character cancellation code from your confirmation.' });

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet_();
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][6] || '').toUpperCase() === code) {
        var res = rowToReservation_(rows[i]);
        sheet.deleteRow(i + 1);
        return json_({ ok: true, reservation: res });
      }
    }
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: false, error: 'No reservation found with that code. It may already have been cancelled.' });
}
