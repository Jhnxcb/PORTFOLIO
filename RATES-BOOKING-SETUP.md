# Rate card booking and payment email setup

The `/rates` and `/payment` pages submit to one standalone Google Apps Script
web app. It is dedicated to booking and GCash proof submissions and contains no
Google Sheets, spreadsheet, or Excel connection.

## 1. Create a standalone Apps Script project

1. Open `https://script.google.com` directly and select **New project**. Do not
   create or open the script from Google Sheets.
2. Open `Code.gs`.
3. Replace its contents with the complete contents of `google-apps-script.gs`
   from this portfolio project.
4. Click **Save**.

The script sends booking inquiries and payment proofs to:

`contact@thestudiocove.me`

Change `BOOKING_CONFIG.recipientEmail` and `PAYMENT_CONFIG.recipientEmail` if a
different inbox should receive them.

## 2. Authorize the new permissions

The updated script needs permission to:

- send booking and payment-verification emails;
- create private Google Drive folders for reference files and payment proofs.

It does not request or use spreadsheet access.

In the Apps Script editor, select `testBookingServices` and click **Run**. If
Google shows a permission prompt, approve it for the account that owns the web
app. This test checks access without sending an email or creating payment files.

## 3. Deploy the standalone web app

1. Select **Deploy → New deployment**.
2. Choose **Web app**.
3. Keep **Execute as** set to **Me**.
4. Keep **Who has access** set to **Anyone**.
5. Click **Deploy**.

Copy the new `/exec` URL and replace `BOOKING_API_URL` in `rates.html` and
`PAYMENT_API_URL` in `payment.html`. The old URL currently present in those
files must be replaced before publishing.

Opening the new `/exec` URL in a browser should return
`"spreadsheetConnected":false`.

## 4. Test the complete flow

1. Submit a small test inquiry through `/rates`.
2. Confirm that it arrives at `contact@thestudiocove.me`.
3. Confirm that the inquiry success dialog stays on `/rates`.
4. Submit a test screenshot smaller than 5 MB.
5. Confirm that the proof email arrives and its Drive link opens.
6. Delete the test emails and Drive files afterward if they are no longer
   needed.

The first reference upload creates `The Studio Cove Booking References` in the
web-app owner's Drive. The first proof upload creates `The Studio Cove Payment
Proofs`. Both folders remain private unless the owner changes their sharing.

## Important payment limitation

GCash is the only payment method shown on the page. Mobile browsers may block
an automatic app launch after a file download, so the customer first saves the
GCash QR and then taps the separate Open GCash App button. In GCash, the
customer uploads the saved QR, reviews the receiver, and enters the amount from
the approved quote. The website does not ask for an amount; it is visible in
the uploaded receipt.
