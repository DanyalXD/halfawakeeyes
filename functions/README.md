# Admin Email Functions

Callable functions used by the admin Email page:

- `listInboxMessages`
- `getEmailMessage`
- `sendAdminEmail`

Set the IONOS mailbox credentials as Firebase secrets before deploying:

```powershell
firebase functions:secrets:set IONOS_EMAIL
firebase functions:secrets:set IONOS_PASSWORD
```

Optional environment variables:

```text
IMAP_HOST=imap.ionos.com
IMAP_PORT=993
SMTP_HOST=smtp.ionos.com
SMTP_PORT=587
SMTP_SECURE=false
MAIL_FROM_NAME=Half Awake Eyes
ADMIN_EMAIL_ALLOWLIST=danyal1995@hotmail.co.uk,danyalc95@gmail.com
```

Install and deploy:

```powershell
cd functions
npm install
cd ..
firebase deploy --only functions
```

## Newsletter unsubscribe

`sendAdminNewsletter` sends batches of up to five separate messages, adds a personal unsubscribe button to HTML and plain-text emails, and checks subscription status on the server. The client removes confirmed sent/skipped recipients from its draft between batches. Ordinary email continues through `sendAdminEmail`.

Deploy `sendAdminNewsletter`, the updated `sendAdminEmail`, `emailUnsubscribe`, and Firebase Hosting together before using newsletters. Hosting routes `/unsubscribe` to `emailUnsubscribe`. The dedicated callable prevents a new client from silently using the older BCC sender without unsubscribe links.

Unsubscribe tokens are random bearer links; only their hashes are stored in `mailing-list-unsubscribe-tokens`. These and `mailing-list-suppressions` are server-only collections (denied by default in the current rules). GET displays a confirmation; POST records the opt-out and marks linked contacts unsubscribed. A suppression also prevents later duplicate signup records from bypassing the opt-out. Test emails use a non-mutating preview link. No new secret is required.

An SMTP timeout can make delivery uncertain; check Sent before retrying an unconfirmed batch. These changes have been tested with mocked delivery; no production messages were sent.
