# The Studio Cove · Finance

`finance.html` (or `/finance` when hosted) is the finance homepage. It lists transparency reports from the spreadsheet. Each card opens its own report at `/finance?sheet=TAB_ID`. No login or access code is required.

## Activate automatic discovery

1. Open the financial spreadsheet → **Extensions → Apps Script**.
2. Replace the financial script with `finance-google-apps-script.gs`, then save. Keep it separate from your booking/payment script.
3. Keep the Script Property `FINANCE_SPREADSHEET_ID` set to:

   ```text
   183LWsMRksIbLt1yMvK7c26YkxtfvWKlDlvJJtxCLFsU
   ```

4. Select **Deploy → Manage deployments → Edit (pencil) → New version → Deploy**. Keep **Execute as: Me**, **Who has access: Anyone**. Updating the existing deployment preserves its `/exec` URL, already configured in `finance.js`. If creating a new deployment instead, replace `DEFAULT_ENDPOINT` with its new `/exec` URL.
5. Reload the dashboard. The status should say **Live · Auto-sync**. If it asks for a script update, the endpoint is still running an older version.

Old properties `FINANCE_ACCESS_CODES` and `FINANCE_PUBLIC_SHEETS` are no longer used. All visible financial tabs are discovered automatically. Changes and new tabs appear within **30 seconds while the page is visible**, on manual refresh, or when returning to an outdated browser tab. No redeployment is needed for spreadsheet edits, tab additions, renames, or status changes. Script source changes still require a new version.

Reference: [Google web app deployments](https://developers.google.com/apps-script/guides/web).

## What is shared

Anyone with a report link can read it. All visible tabs with recognized financial data are public through this service. Hidden tabs and tabs whose names start with `_` are excluded, including direct requests for their IDs. Empty tabs and nonfinancial notes are omitted. To keep a future tab out of the homepage, hide it or prefix its name with `_` before adding financial data.

The original spreadsheet does not need public sharing. Links select a report; they do not provide per-person privacy.

## Current reports

These IDs come from the supplied screenshots. Current names and live amounts are read from Google Sheets, not hardcoded into the website.

| Report | Dedicated path |
| --- | --- |
| EXTERNAL | `/finance?sheet=0` |
| SPOTIFY | `/finance?sheet=1952436282` |
| NETFLIX | `/finance?sheet=1397918618` |
| MINE | `/finance?sheet=150455778` |
| MARK ASHER | `/finance?sheet=1679896166` |

When opening local files, use `finance.html?sheet=TAB_ID`. A report’s copy icon produces its full URL. The homepage stays at `/finance` and discovers new cards on each refresh. Dedicated pages request only their selected tab. Removing, hiding, or renaming a tab is reflected on the next successful read; numeric tab IDs survive renames.

## Supported existing layouts

- **EXTERNAL:** named blocks with description, amount and PAID/NOT PAID status.
- **SPOTIFY / NETFLIX:** full-month headings followed by person, amount and payment status. Repeated month headings are preserved as written; they do not cause duplicate parsing or silently become another month.
- **MINE:** named status blocks such as ATOME, BILLEASE and HOME CREDIT, including multiple blocks below the top row. Every detailed charge is counted once. SUMMARY is excluded to avoid double counting; summary categories without matching detail blocks raise a review notice.
- **MARK ASHER:** month-by-month item/amount blocks, a TRANSACTIONS payment ledger and OVERALL cross-check. The explicitly titled six-month shoe installment plan remains separate.

Separate horizontal blocks with blank columns. Start each block with its title and finish it with TOTAL. Amounts should be numeric. Keep PAID / NOT PAID status cells directly after their amounts. First-row status tables with blank headings receive a fallback group label.

For a status-based report, PAID adds an equal settlement so its outstanding balance drops. NOT PAID remains outstanding. If the same sheet contains an explicit transaction ledger, that ledger supplies payments instead of synthesizing them from statuses, preventing duplicate settlement. Use one payment-accounting approach consistently within each sheet.

Installments are separate only when explicitly identified in the title, such as `(6-mnths)` or `Installments`. Other status tables, including HOME CREDIT, contribute to the main charges and paid totals. Homepage outstanding is the sum of each report’s nonnegative balance; one report’s overpayment does not erase another report’s debt. Separate installment balances are labeled on their report cards and omitted from the main summary.

The website reads data only; record changes in Google Sheets.

## Person and month filters

Each report has **Person** and **Month** selectors above its summary. They work together and update charges, matching payments, the remaining balance, and separate installments. Clear filters restores the entire report. Selections survive automatic refreshes while their values still exist; switching reports resets them. Search narrows the displayed transaction lists within these filters; summary cards follow the selectors.

Existing SPOTIFY/NETFLIX names and EXTERNAL names before parentheses are recognized automatically (for example, Judyan (Cash) and Judyan (Load) belong to Judyan). MARK ASHER is the owner of its personal report. Other reports can use an optional **Person** column in the structured table, including payment and installment rows. Supporting that new column requires the latest Apps Script version. Reports without person names leave that selector disabled.

Months are read from ISO dates (`2026-11-08`), month labels, or month names/abbreviations in groups and descriptions. The month selector groups calendar months across years because the existing sheets use month names without a year. Repeated month blocks remain included. **Unassigned** shows rows without a recognizable month. Do not infer a missing payment month or person: when a filtered view excludes unallocated payments, a notice states their amount. Add a Group/month, ISO Date, or Person in the source table to allocate them accurately. No filtered payment is guessed or prorated.

## Recommended new-tab layout

For new financial tabs, either duplicate a supported existing tab or use this table:

| Type | Group | Description | Amount | Status | Date |
| --- | --- | --- | ---: | --- | --- |
| CHARGE | November | Monthly share | 50 | NOT PAID | |
| CHARGE | November | Another share | 50 | PAID | |
| INSTALLMENT | Shoes | December | 230.28 | NOT PAID | |

Type, Description, and Amount are required. Amounts must be nonnegative. CHARGE increases the main balance. PAYMENT reduces it. INSTALLMENT stays separate. In a status-based table, PAID charges generate settlement unless explicit PAYMENT rows are present. Invalid rows produce review notices. A new visible tab with recognized rows appears automatically.

## Verification and sample state

Run `node --check finance.js` and `node verify-finance.cjs`. Checks cover the screenshot layouts, payment changes, summary exclusion, automatic discovery, hidden/draft exclusion, homepage/report links and failed refreshes. These are logic checks; real Google deployment and browser layout need separate verification.

Before a live read succeeds, the homepage shows five clearly labeled sample cards with placeholder totals. It does not treat the partially visible MINE screenshot as a complete live ledger. Failed reads retain the last successful data or a labeled sample state. Review notices should be resolved in the source sheet before relying on its balance.
