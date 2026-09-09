# AXIOM Lab reservations — how it works

The reservation page lives at `_pages/axiom-lab.html` and is served at
<https://www.annclifton.phd/axiom-lab/>. GitHub Pages is a static host and
cannot store data, so bookings are kept in a Google Sheet through a small
Google Apps Script web app. Both were set up on 2026-09-09 under
ann.w.clifton@gmail.com.

- **Spreadsheet** ("AXIOM Lab Reservations"):
  <https://docs.google.com/spreadsheets/d/1KkxpSdXO8_TD2vcu1VAajjhklaJ-hpaekLrHTTbWztw/edit>
  Bookings appear as rows in the `Reservations` tab.
- **Apps Script project** ("AXIOM Lab Reservations"): find it at
  <https://script.google.com/home>. Its code is a copy of `Code.gs` in this
  folder. It is deployed as a web app (execute as me, access: anyone), and
  the deployment URL is pasted into `API_URL` near the top of the page's
  `<script>` block.

## Managing reservations

- **Cancel or edit** a booking: delete or change its row in the sheet.
- **Change hours**: edit `OPEN_HOUR` / `CLOSE_HOUR` in both `Code.gs` and
  `_pages/axiom-lab.html` (7 PM is 19). Paste the new `Code.gs` into the
  Apps Script editor, save, then **Deploy → Manage deployments → Edit
  (pencil) → Version: New version → Deploy**. The URL stays the same.
- **Start over** (new sheet or script): follow the steps below and paste
  the new web app URL into `API_URL`.

## Redeploying from scratch

1. Create a blank Google Sheet and copy its ID from the URL into
   `SPREADSHEET_ID` in `Code.gs`.
2. Go to <https://script.google.com/home/projects/create>, paste in
   `Code.gs`, save.
3. **Deploy → New deployment → Web app**, execute as **Me**, who has
   access **Anyone**, then **Deploy** and approve the permissions prompt.
4. Paste the web app URL into `API_URL` in `_pages/axiom-lab.html`, commit,
   push.

## Notes

- Double-booking is checked in the browser and again on the server (with
  a lock), so two people cannot grab the same slot simultaneously.
- Names and purposes are shown publicly on the availability list, so ask
  users to keep them brief.
- If `API_URL` is empty the page falls back to a browser-only demo mode and
  shows a red "Setup not finished" notice.
