# SumUp store setup

The website uses the existing Half Awake Eyes SumUp Online Store. Product buttons
open that store for size selection, shipping and checkout. No new payment checkout
or duplicate inventory is created.

## Homepage and admin

Deploy the changed static files and `firestore.rules`. In Admin → Website Store, edit the
product cards, paste each item's public SumUp product URL, preview, and publish.
The first visit seeds the editor from the existing featured merchandise.

Cards are stored in `site-content/store`, publicly readable and writable only by
the existing admin accounts. Cards are manually curated display content: changing
a card's price or sold-out label does **not** change the SumUp product or stock.
Publish up to 24 cards, reorder them, or hide individual cards. Publishing an empty
list leaves a link to the full store. Until the first publish, or if the store
document cannot load, the existing homepage merchandise remains the fallback.
The Homepage editor's merchandise fields control that fallback.

Orders, catalogue, stock and shipping remain in SumUp, accessible from
the SumUp tab. The documented public API reviewed for this integration did not
provide Online Store catalogue or fulfilment endpoints. This integration does
not use private browser-session APIs or scrape the merchant account.

## Connect payment history and payouts

1. In [SumUp API keys](https://me.sumup.com/settings/api-keys), create a key for the
   merchant with `transactions.history` or `transactions.read`, plus `payouts.read` and `receipts.read` (or `transactions.history` for receipts)
   (the payouts endpoint also accepts the documented profile scopes).
2. Find the merchant code for the same SumUp account.
3. From the repository root, enter both values at the Firebase CLI's secure
   prompts. Do not paste the key into chat, JavaScript, Firestore, or this file:

   ```powershell
   firebase functions:secrets:set SUMUP_API_KEY
   firebase functions:secrets:set SUMUP_MERCHANT_CODE
   ```

4. Install the existing function dependencies if needed (`npm --prefix functions ci`),
   then deploy the three callables and rules:

   ```powershell
   firebase deploy --only functions:getAdminStorePayments,functions:getAdminStorePayment,functions:refundAdminStorePayment,firestore:rules
   ```

5. Publish the static files through the existing GitHub Pages workflow. The
   website is hosted on GitHub Pages; do not deploy Firebase Hosting.
6. Sign in to Admin → SumUp and refresh payments. Confirm a known payment against
   SumUp. A missing key, missing function, wrong merchant or insufficient scope
   produces an unavailable message; it does not block homepage card editing.

The admin fetches transaction history in pages of 50 for the selected UTC dates
(up to one year). Summaries appear only after all pages finish. A 100-page limit
requires a shorter range rather than showing incomplete totals. Gross values
include successful and refunded payments at their original amounts, before fees
or refunds, grouped by currency. Search and status filters affect the table and
CSV export, not the full-period summary. Payouts remain limited to the latest 50
records in the selected date range and are labelled accordingly.

Payment details include the available event history, receipt data and full or
partial refunds. The API key needs `refunds.write` or `payments` for refunds.
The refund form requires an amount and explicit confirmation. The backend checks
the current SumUp refund limits and merchant ownership before submitting.

Refund submission records live in `admin-sumup-refunds`, which has no client
Firestore access. A Firestore transaction prevents concurrent submissions and
replays. Pending records intentionally remain locked after any uncertain outcome;
there is no automatic financial retry. Check the payment directly in SumUp before
resolving a pending record. If SumUp confirms acceptance, an operator can mark its
state `accepted`; another refund still requires changed refund availability. Only
if SumUp confirms no refund was accepted may an operator remove the pending record
to permit another attempt. Never clear a lock based only on a timeout.

Payout or receipt failures do not hide available transaction data. No card or bank
account details are returned to the browser. All endpoints use the existing admin
allowlist and fixed SumUp URLs; secrets stay in Firebase Functions. Refunds and
receipt details require deployment of the new functions, not just static assets.

## Checks

```powershell
node --test .tests/store.test.mjs .tests/sumup-server.test.cjs .tests/home-content.test.mjs .tests/admin-tools-server.test.cjs
```

The `.tests/payments-features-preview.html` browser harness covers pagination,
filters, complete totals, CSV safety, receipt details, refund confirmation and
account-change cleanup.

Backend tests mock SumUp; they do not make payments or access a merchant account.
The local `.tests/store-preview.html` harness exercises the real product editor,
publishing against an in-memory stub, preview, and account-change cleanup.

References: [API reference](https://developer.sumup.com/api),
[transactions](https://developer.sumup.com/api/transactions/list),
[payouts](https://developer.sumup.com/api/payouts/list).

## Dedicated Store page

`/store/` uses the same published product cards as the homepage. Admin Store edits
update both places; there is no second catalogue to maintain. The admin links to this page; public Store navigation opens SumUp directly. If no Store document has been published yet, it uses
the existing featured merchandise. If loading fails, a working SumUp store link
remains available. No new function deployment is required for the dedicated page;
deploy the static files and the existing store Firestore rule.

An embedded SumUp Payment Widget is possible, but is not enabled here. That would
require a separate order system for server-validated prices, variants, stock,
shipping and verified payment status. Existing SumUp store checkout remains active.

## Functions-only deployment script

Run `./deploy-sumup-functions.ps1` from the repository root. It installs function
dependencies and deploys only the three SumUp functions to `half-awake-eyes`. It
does not publish website files or deploy Firebase Hosting. If the functions are
already deployed, only the GitHub Pages website update is needed.
