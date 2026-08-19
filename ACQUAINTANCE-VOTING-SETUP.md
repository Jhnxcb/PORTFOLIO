# Acquaintance voting results setup

The public page is `acquaintance-voting.html`. It reads aggregate results from a
Google Apps Script endpoint. The response spreadsheet itself can remain private.

## 1. Add the Apps Script to the response sheet

1. Open **SOUTHLAND COLLEGE ACQUAINTANCE PARTY 2026 (Responses)**.
2. Select **Extensions → Apps Script**.
3. Delete the sample code in `Code.gs`.
4. Copy all the code from `google-apps-script.gs` into `Code.gs`.
5. Click **Save**.
6. Choose `testResults` from the function menu and click **Run** once.
7. Approve Google's permission prompt. The script needs read access to this
   spreadsheet so it can calculate totals.

The script looks only for these headers:

- `DEPARTMENT`
- every `PROGRAM` or `PROGRAMS` column (these are merged into one category)
- `THEMES:`

Names, email addresses, timestamps, and other response fields are not returned.

## 2. Deploy the results endpoint

1. In Apps Script, select **Deploy → New deployment**.
2. For deployment type, select **Web app**.
3. Set **Execute as** to **Me**.
4. Set **Who has access** to **Anyone**.
5. Select **Deploy**, then copy the URL ending in `/exec`.

Only the endpoint's aggregate JSON is public. Do not use Google Sheets' "Publish
to web" option for the raw `Form Responses 1` tab.

## 3. Connect the HTML page

Open `acquaintance-voting.html` and find:

```js
const RESULTS_API_URL = "PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE";
```

Replace the placeholder with the `/exec` URL copied in step 2, then commit and
deploy the website. The page will be available at:

`https://www.thestudiocove.me/acquaintance-voting.html`

The page refreshes automatically every 30 seconds and also has a manual refresh
button.

## Hide results until voting closes

In `Code.gs`, change:

```js
resultsVisible: true,
```

to:

```js
resultsVisible: false,
```

Then select **Deploy → Manage deployments → Edit → New version → Deploy**.
Change it back to `true` and deploy another version when results may be shown.

## If a question header changes

Edit the matching `headerPattern` under `CONFIG.categories` in `Code.gs`, then
deploy a new version of the Web App. Header matching is case-insensitive.
