# Analytics audit and privacy refactor

Reviewed 7 October 2026. This describes technical measures, not a legal certification. Deployment and the legacy migration are required before the new public policy describes production behaviour.

## Audit of the previous implementation

- Frontend: `public-site-utils.js` built events for `index.js`, `links.js`, `smartlink.js`, `tickets.js`, `join.js`, `public-analytics.js` and `public-ticket-actions.js`. There was no analytics collection API: clients wrote directly to Firestore `site-actions`. `ad-tracking` also allowed unrestricted public creates, but no active writer was found.
- Fields: full referrers and destination URLs, public labels/targets, campaign and UTM values, exact viewport dimensions, timestamps, a random sessionStorage ID, and the URL's `id` parameter as `userId`. Document IDs embedded the recipient/user ID. URLs could contain emails, secrets or other identifying parameters.
- Storage: analytics session IDs, throttling counters and page-view flags used sessionStorage without consent. No permanent analytics visitor cookie or localStorage visitor ID was found. The ID could nevertheless survive inactivity in an open tab. localStorage stored the admin's own-visit exclusion preference. IndexedDB stored copies of individual events indefinitely.
- Advertising: Meta loaded on configured smart-link/ticket/show pages without a consent gate. Three separate loaders were found. No Google Analytics, Google Ads, session replay, fingerprinting, application-level IP storage or location lookup was found. There was no deliberate logged-in-account linkage, but URL recipient identifiers could identify people. No precise GPS data was collected.
- Admin: Firebase-authenticated administrators could read all raw event fields, group individual sessions, open details and export them. The weekly comparison API also returned event-level data. The notification bell and push trigger exposed individual ticket actions. Retention was indefinite.
- Other services: Google/Firebase infrastructure receives network information; some pages request Google Fonts. The homepage loaded a Spotify iframe. These network requests are distinct from the event fields stored in Firestore.

## Current model: statistical purposes with an objection

First-party statistical analytics run by default, solely to understand and improve this website. They do not require an affirmative analytics choice under the intended UK PECR statistical purposes exception. Meta advertising remains off until separate explicit marketing consent; the Spotify player loads automatically on pages containing the embed. Mailing-list consent is separate.

This is a technical implementation, not certification or a guarantee of legal compliance. [ICO exceptions guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-the-exceptions/) requires clear information, a simple free objection, use solely for site improvement, aggregation and no retention of individual-level information after aggregation. Temporary processing can still involve personal data and requires a UK GDPR lawful basis. Advertising measurement cannot use this exception.

The Statistical analytics switch starts enabled if there is no saved analytics preference. Switching it off applies immediately, stops subsequent writes, clears session state and persists the objection. Save choices and an equally prominent opt-out button are available. Ordinary pages show only statistical analytics and a Turn analytics off action; saving or rejecting analytics there preserves any existing marketing permission and its timestamp. Privacy settings remains available on every public page. The preference has no visitor identifier and its storage is not recorded as an analytics event. Normal links and signup functionality continue working. In-flight writes already submitted cannot be recalled; they enter the same short aggregation/deletion process.

Page controllers expose the separate Meta option only when a valid pixel ID is configured, including configured ticket actions, or on the Privacy page where Manage privacy choices provides withdrawal. Configuration never loads Meta or grants consent. A late-loaded pixel ID reveals the Meta choice if there is no current explicit marketing decision, even if statistical analytics was previously declined. A current explicit Meta refusal stays effective. Analytics-only decisions do not record a marketing refusal or extend its consent. Dynamic show pages reinstall the controls after replacing their document body. All pixel loaders still require separate saved marketing consent.

Any saved explicit analytics:false is respected regardless of old preference version or age. Analytics objections have no application expiry; clearing browser storage removes them. Marketing must have its own explicit true, matching version and unexpired 180-day timestamp. Changing only analytics never grants or extends marketing consent. DNT and GPC block both categories. Inaccessible or malformed preferences fail closed. If saving fails, an in-memory objection immediately takes effect and the UI explains that future visits cannot be guaranteed to remember it.

## Sessions, fields and minimisation

A cryptographically random UUID identifies a temporary tab session in sessionStorage key hae-analytics-session-v3. It rotates on the next event after 30 minutes idle or one hour since creation, and ends when tab storage is discarded. Reloads within those limits share the visit; separate tabs, restored expired tabs and later visits use fresh identifiers. Blocked session storage falls back to page memory. The old v2 session identifier is removed and never reused. An expiry timer clears the browser session record when due; throttled background timers can lag, so every event also checks expiry before using an ID. Analytics objections and marketing withdrawal are propagated to other open tabs through browser storage events. Each session is capped at 40 events by the client. There is no long-term visitor ID, account linkage, IP/UA hash, fingerprint or cross-service recognition. Visits are approximate tab sessions, not unique people. Session metrics are attributed to the first viewed day's UTC bucket; sessions crossing midnight are counted once.

Reduced processing fields: authoritative timestamp, short session UUID, recognised public pathname, action/subtype/section/platform, public interaction label/target, destination and referrer origins, safe campaign/source/medium values, browser/OS family, broad device category and bounded duration. Only campaign/utm_campaign, source/utm_source and utm_medium query parameters are inspected for statistics. They are sanitised, never retained as arbitrary queries or used for individual advertising attribution. Referrers and source values become Direct, Google, Bing, Instagram, Facebook, Spotify, Email campaign or Other referral in durable statistics.

No recipient IDs, queries/fragments, URL credentials, email addresses, raw user agents, exact viewport, precise location, application IPs, permanent profiles, browsing accounts, session replay, performance metrics or error text are added. Unknown paths become /other. Public route IDs and content/campaign names must not encode customers or personal information: sanitisation cannot reliably detect names or every short secret. Signup emails remain in the separate mailing-list product collection, never browsing statistics.

## Processing, aggregation and retention

Immediate event-only aggregation would discard the timing and adjacency needed for approximate bounce, duration, entry/exit and navigation statistics. The chosen short buffer supports those explicitly requested statistics:

1. The existing client writes a reduced event to site-actions; statisticsVersion distinguishes the new model from old consentVersion records. Raw expiry is server timestamp plus approximately two hours (rules allow one minute of clock tolerance).
2. aggregateSiteAnalytics runs every 15 minutes. A session becomes ready after its last recorded event has been idle for 30 minutes. At normal service levels, its totals appear after 30-45 idle minutes; a continuously active one-hour session normally finishes processing within one hour and 45 minutes of its first event.
3. A transaction reads the raw records and current daily counters, adds statistics to analytics-daily and deletes those raw records in the same commit. Failed commits leave the raw input unchanged; retries or overlapping runs cannot double-count deleted records. No raw events or session ID survive a successful aggregation. Memory grouping is discarded after the job.
4. Raw expiresAt is two hours. cleanupAnalytics runs every 15 minutes and deletes expired raw/ad records, also checking raw timestamps so previous longer TTLs cannot persist. Healthy cleanup removes leftovers by the next run, roughly two hours and 15 minutes; this is a target, not a guaranteed physical deletion deadline. Firestore TTL is an asynchronous backstop and can take longer. Outages, delayed jobs, backups and logs require operational review. Expired inputs lost before recovery cannot contribute to aggregates; retaining them longer for reporting is not the policy.
5. Durable UTC daily statistics expire at bucket midnight plus 90 days (thus up to 90 days). Cleanup removes expired totals, TTL backs it up and APIs exclude expired dates. Deleting raw input does not delete completed totals.

The job scans at most 20,000 raw records per run; each normal session has at most 40 events. Oversized hostile sessions are omitted and removed by expiry cleanup. Capacity failures must be investigated immediately, since unavailable aggregation can cause data loss. Public clients can forge allowed statistical writes: schema validation is not abuse prevention or proof of the user's preference. No new collection endpoint or analytics vendor is introduced.

## Aggregate schema and admin access

analytics-daily documents contain schemaVersion:3, a UTC midnight timestamp, kind, value, numeric counters and expiresAt. IDs hash only the public bucket key (date, kind, value), never an IP, device or visitor ID. kind is total, event, page, source, campaign, link, browser, os, device, entry, exit or navigation. Each bucket has one breakdown; navigation has only an adjacent public page pair. No document combines campaign + source + page + browser + device or stores a journey. Counters include views, clicks, tickets, signups, outboundClicks, sessions, clickingSessions, bounces and summed sessionSeconds as appropriate.

getAdminAnalytics and getAdminTrafficComparison authenticate first and read only analytics-daily for browsing statistics. No API returns raw/session-level browsing records. Daily marginal rows under five events, and session/bounce/duration statistics under five sessions, are withheld. Site-wide counts may be shown below five; these are unjoined totals. This is a disclosure reduction, not a claim that a threshold mathematically guarantees anonymity. Assess low-volume populations and side information before relying on the exception.

Campaign and source reports are independent; selecting one clears the other. Campaign views/clicks/conversions survive, but campaign-by-referrer/device/destination/session segmentation is intentionally unavailable. Global source, device, page and link breakdowns remain. Sparse breakdowns may not sum to site-wide totals. Session statistics are global, withheld for sparse days, and approximate: blockers, objections, event caps, abrupt closes, delayed requests and timing affect estimates. Duration is first-to-last event time, not continuous attention; a bounce means one recorded page view. Ticket clicks are not ticket sales.

The dashboard and CSV expose only these aggregate buckets; new reports use memory only. Previous raw IndexedDB stores are cleared by cache version 4 without clearing mailbox caches. Individual analytics notification feeds remain disabled. Historical offline admin tabs and downloaded raw exports need separate disposal. Mailing-list administration remains a distinct product function and may retain its own personal records.

Firestore rules permit unauthenticated creates only with UUID IDs, the reduced allowlist, valid enums/public paths, safe origin/text fields, authoritative timestamp and expiry at most two hours plus tolerance. Authenticated account sessions cannot create browsing events. Raw reads and updates are denied; privileged admin deletes remain possible. All direct reads/writes of analytics-daily are denied; the Admin SDK alone maintains counters and the authenticated callable serves reports. ad-tracking remains retired. TTL field overrides apply to site-actions.expiresAt and analytics-daily.expiresAt. Existing content-history configuration is preserved; no new composite index is required.

## Processors and human review before rollout

- Confirm the controller's solely site-improvement purpose, simple objection and actual use of every report. Do not use these first-party statistics for advertising measurement, retargeting, individual decisions or profiling. UTM tags can describe arrival channels solely for improving this site; Meta ad reporting remains separate.
- Review eligibility for the UK exception, audiences outside the UK, the UK GDPR lawful basis (including legitimate-interests assessment where appropriate), transparency, data rights, session necessity, small-population identifiability and whether the proposed retention is proportionate.
- Firebase/Google remains the processor; functions remain us-central1. Verify actual database location, processor-only terms, no reuse/linkage for other purposes, international transfers, IAM, infrastructure logs, backups and deletion behaviour. Connecting IP addresses are necessarily processed by hosting/Firebase infrastructure but are neither stored in application statistics nor hashed into identities. This code cannot control provider logs.
- Meta needs separate explicit consent, processor/controller disclosure and retention review. Withdrawal revokes the pixel, removes known first-party Meta cookies and reloads; this cannot erase past Meta disclosures or provider cookies. Automatic Spotify loading and Google Fonts requests need their own provider/transparency review. No external advertising events were used in testing.
- Monitor the two scheduled jobs, processing capacity, TTL health and privilege access. Do not enable the default-on public code before aggregation and deletion work in staging. A job outage can breach the intended short retention unless operational backstops function. No legal certification is implied.

## Rollout and migration: commands for later, not executed

No deployment or production migration has been run. The public notice describes intended behaviour only after coordinated rollout.

1. If the previous cleanup function is deployed, pause its Cloud Scheduler job during the historical migration, so raw history is not deleted before conversion. Verify the actual job name with gcloud scheduler jobs list --location=us-central1 --project=half-awake-eyes, then pause the applicable job. The usual Firebase job name is firebase-schedule-cleanupAnalytics-us-central1.
2. Deploy the new rules (old consentVersion payloads will be rejected), indexes, aggregate-only admin endpoints and notification suppression first. Keep default-on public assets unpublished until steps 3?5 pass. Use your existing authenticated Firebase workflow:

   ~~~powershell
   firebase deploy --only functions:getAdminAnalytics,functions:getAdminTrafficComparison,functions:notifyOnSiteActionCreated,firestore:rules,firestore:indexes --project half-awake-eyes
   ~~~

3. With authorised application-default credentials, inspect dry-run counts then run the historical migration only when ready:

   ~~~powershell
   node functions/scripts/migrate-analytics.cjs --dry-run
   node functions/scripts/migrate-analytics.cjs --apply
   ~~~

   The script is fixed to half-awake-eyes. Dry-run makes no writes. Apply converts valid historical events within 90 days directly to sanitised daily counters and deletes their raw originals atomically, including the previous schemaVersion:2/consentVersion data. Historical session IDs are deliberately dropped, so historical session metrics are unavailable. Expired/undated/future/unsupported data and all ad-tracking are removed. New statisticsVersion inputs are left for the regular job. Reruns resume without duplicate counters. No payloads or credentials are printed. Any retained backups/exports need a separate, restricted deletion policy.
4. Deploy both scheduled functions and enable the TTL policies:

   ~~~powershell
   firebase deploy --only functions:aggregateSiteAnalytics,functions:cleanupAnalytics --project half-awake-eyes
   gcloud firestore fields ttls update expiresAt --collection-group=site-actions --enable-ttl --project=half-awake-eyes
   gcloud firestore fields ttls update expiresAt --collection-group=analytics-daily --enable-ttl --project=half-awake-eyes
   ~~~

   Resume any paused cleanup scheduler job after deployment. Verify both schedules actually run every 15 minutes. Billing/IAM and scheduler permissions are required. TTL timing is documented by [Firebase](https://firebase.google.com/docs/firestore/ttl).
5. Validate the whole path with a synthetic staging dataset: raw write, wait/trigger processing, persisted total, raw deletion, authenticated report and expired deletion. Check counts are within capacity and logs contain no event payloads. Reopen admin browsers to clear prior raw caches.
6. Publish updated public/admin static assets and generated show HTML through the established hosting workflow. Deploy functions:getPublicEventPage for dynamically rendered shows. Invalidate cached JS/HTML, including public-site-utils.js, analytics-insights.js and privacy-controls.js. Keep the existing advertising/media gates. No Firebase Hosting configuration changes are included.

   ~~~powershell
   firebase deploy --only functions:getPublicEventPage --project half-awake-eyes
   ~~~

## Local verification

Final local result: 110 tests pass; one unchanged Hosting rewrite test fails. Desktop (1280px) and mobile (390px) isolated Chrome checks pass for default-on statistics, immediate objection across open tabs, browser session expiry, old preference migration, reload persistence, separate marketing, withdrawal, aggregate rendering and Spotify activation. The demo Firestore emulator accepts reduced statistical writes, rejects 15 unsafe payloads plus legacy/aggregate writes and reads, and verifies concurrent transactions delete raw input without duplicating persisted totals. JavaScript syntax and diff whitespace checks pass.

The public privacy panel uses a shared scoped stylesheet, labelled switches, equal-sized action buttons and a close control. Closing or pressing Escape discards an unsaved marketing choice. Public pages use one compact footer with Home, Press & bookings, Privacy and Privacy settings. Mobile links are centered with copyright below; desktop links align right with the band wordmark and copyright on the left. The wordmark stays hidden on mobile. Ticket bars disappear when the mobile footer is visible so every control stays accessible. Footer checks cover 12 public page variants at 320, 390, 768, 841 and 1440 pixels, including nested pages and dynamically rendered shows. Privacy settings stays visible while the panel is open and toggles it closed or open. The panel is positioned beside its trigger (above the footer button), follows scrolling and resizing, and stays within the viewport. Initial notices use the lower-right viewport corner while the footer is offscreen. Closing the panel preserves the current scroll position. Actual homepage checks pass at 320, 390, 768, 841, 1024 and 1440 pixels, including a short desktop viewport, keyboard focus, Space/Enter activation and the privacy policy link under a subdirectory. Desktop and mobile scope checks cover late pixel configuration, preserved marketing permission on ordinary pages, the actual Privacy-page withdrawal control, and dynamic show rendering with and without a pixel. Collection rules are unchanged.

Run the Node suite, isolated real-browser checks and demo Firestore emulator checks:

~~~powershell
$analyticsTestFiles = Get-ChildItem .tests -File | Where-Object { $_.Name -match '\.test\.(mjs|cjs)$' }
node --experimental-vm-modules --test $analyticsTestFiles.FullName
node .tests/analytics-browser.cjs
node .tests/privacy-panel-browser.cjs
node .tests/public-footer-browser.cjs
node .tests/meta-scope-browser.cjs
firebase emulators:exec --only firestore --project demo-hae-analytics --config firebase.analytics-emulator.json 'node .tests/analytics-rules.cjs'
~~~

Playwright/Chromium and Java 21+ are required for the respective checks. If Playwright is shared, set PLAYWRIGHT_MODULE_PATH. Browser tests use a synthetic hostname and intercept every external request. Emulator checks refuse non-localhost or non-demo configuration. No test sends production analytics or advertising. The unrelated campaigns.test.mjs Hosting rewrite failure remains untouched.
