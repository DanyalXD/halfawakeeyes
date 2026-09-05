# Admin tools and ticket tracking

Implemented locally; deployment is separate.

- Gigs: availability, doors time and age restrictions are saved with each gig and its public mirror. Existing gigs default to available. Sold-out, cancelled and postponed gigs cannot redirect to sellers. The main list and server-rendered show pages display their status.
- Each gig's existing Meta Pixel ID now receives `GigTicketClick` from main ticket buttons and manual clicks on legacy ticket landing pages. Automatic redirects retain `GigTicketRedirect` but do not count as manual clicks. The main listing uses `trackSingleCustom` so one show's events do not reach another show's pixel. Local previews suppress pixel calls. Ad blockers can prevent delivery; these events indicate clicks, never completed purchases. Reference: https://developers.facebook.com/docs/meta-pixel/guides/track-multiple-events
- The generic public click listener skips links handled by ticket tracking to prevent duplicate counts.
- Campaign copies start unpublished with a new slug. Instagram, Facebook and poster links retain campaign selection and add source/medium attribution.
- Booking and show announcement templates are editable. Drafts retain subject, recipients, basic formatting and newsletter mode on the same device, per signed-in account. Restored attachments must be selected again. Successful sending clears the local draft; failed sending retains it. Local drafts are separate from the mailbox's Drafts folder.
- Media uploads use the project's existing default Firebase Storage bucket through an authenticated function. The browser resizes JPEG/PNG/WebP to at most 1600px and 900 KB. No SVG uploads or arbitrary script input. Library metadata is admin-only; artwork URLs are public. A bucket must be enabled and accessible to the functions service account; the application reports unavailable uploads clearly if it is not.
- Analytics uses rolling seven-day comparisons and recorded attribution. Signup creation uses Firestore document creation time to avoid counting repeat signups as new people. Sources are recorded observations, not multi-touch attribution or purchase data.
- History begins with deployment of the three change triggers. It covers future homepage, gig and link saves/deletions. Restore previews are read-only; a changed current document invalidates the preview. Restore writes the document, its public mirror and an outgoing-version backup transactionally. History is accessible only through authenticated functions. The supplied Firestore index supports newest-first history lists.

Deploy the updated hosting assets, functions, Firestore rules and indexes together. Enable Firebase Storage if no default bucket exists. Do not deploy only the HTML and expect new server features to work.

Validation: `node --test .tests/*.test.mjs .tests/*.test.cjs`, syntax checks for all browser modules and functions, isolated browser preview of campaigns, draft recovery, media selection, comparisons and history. No production email, subscriber, artwork or pixel events are required for these tests.
