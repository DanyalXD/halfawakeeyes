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
