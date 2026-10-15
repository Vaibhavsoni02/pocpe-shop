# End-to-end test report: shop.pocpe.com

Date: 2026-10-13 · Method: real browser walk of the live site (clean visitor, then accept all) with the data layer and network hits captured at each step.
Scope: what can be seen from the browser and the public endpoints. Server-container Preview, Mixpanel Live View and Meta Test Events were **not** visible to the tester and still need a manual look (section 5).

## 1. Architecture as deployed

```
Browser (shop.pocpe.com, GitHub Pages behind Cloudflare proxy)
  ├─ Google tag gateway: gtm.js + helper scripts served from shop.pocpe.com/metrics/*
  ├─ Web GTM  GTM-KZF9QGPF  ── Google tag (GA4 G-LK55NDVF5W) ──▶ server container
  └─ consent.js: banner + launcher + Consent Mode v2
Server GTM  GTM-P65HG9WX on Stape (AP South, India), domain sgtm.pocpe.com (Own CDN, Cloudflare)
  ├─ GA4 client ─▶ GA4 tag, Mixpanel tag (India), Meta CAPI tag
```

## 2. Results

| # | Check | Result |
|---|---|---|
| 1 | Clean visitor sees the cookie banner, launcher present | Pass |
| 2 | Consent Mode defaults all denied before GTM loads (`gcs=G100`) | Pass |
| 3 | `gtm.js` served first-party from `/metrics/gtm.js` (200, real container, about 418 KB) | Pass |
| 4 | Accept all: cookie `pocpe_consent` stored with visitor ID, version and reconsent date (2027-10-13) | Pass |
| 5 | Consent update flips signal to `G111` and re-fires `page_view` | Pass |
| 6 | Choice persists across pages (no repeated banner) | Pass |
| 7 | `view_item_list`, `view_item`, `view_cart`, `begin_checkout`, `add_shipping_info`, `purchase` reach the data layer with correct values | Pass |
| 8 | Every ecommerce event carries an `event_id` | Pass |
| 9 | `purchase` carries `transaction_id`, value, items and user data (email, phone, address) | Pass |
| 10 | Collect hits return HTTP 200 | Pass |
| 11 | Refreshing the thank-you page does **not** send `purchase` again | Pass |
| 12 | `https://sgtm.pocpe.com/healthy` returns 200; CNAME `sgtm` to `in.stape.io` (Ready in Stape) | Pass |
| 13 | HTTP redirects to HTTPS (301) | Pass |
| 14 | Browser hits use `sgtm.pocpe.com` | **Fail**, see finding A |
| 15 | Server-side consent store (`POST /api/consent`) | **Pass** after the Worker deploy (was 405), see section 8 |
| 16 | Email preference centre can save | **Pass** after the Worker deploy, see section 8 |
| 17 | `add_to_cart` hit confirmed | **Not observable**, the page navigated immediately; fixed (finding D) |

Test order created: transaction `T-1791896334686`, email `e2e-test@example.com`, value 59. This is a real test event in GA4, Mixpanel and Meta; filter it out of reporting.

## 3. Findings

**A. Hits still go to the old Stape address (`wcrxndmq.in.stape.io`), not `sgtm.pocpe.com`. Medium.**
The published web container is correct: the served `gtm.js` references `https://sgtm.pocpe.com` and contains no trace of the old URL. Yet the page's Google tag still posts to the built-in URL. Both reach the same server container, so tracking works, but it is not first-party, and first-party cookies and the Own CDN benefit are lost.
Likely cause: a transport/server URL stored in the Google tag settings on Google's side (GA4 Admin, data stream, Configure tag settings) or a leftover older tag, overriding the container value. To check: GTM web Preview, click the Google tag, read the `server_container_url` it actually uses; and review GA4 tag settings for a server URL.

**B. Server-side consent store and email preference centre do not run. High (feature gap).**
GitHub Pages serves static files only; `/api/consent` returns 405. Consent is still stored in the browser cookie and localStorage, but there is no server copy, audit history or preference storage. Fix: move hosting to Cloudflare Pages (code and KV config already in the repo), or run the two functions as a Cloudflare Worker.

**C. Cloudflare Web Analytics beacon loads before consent. Medium (compliance).**
`static.cloudflareinsights.com/beacon.min.js` and `/cdn-cgi/rum` are injected automatically by Cloudflare on every page, including before the visitor accepts. Turn it off (Cloudflare, Analytics, Web Analytics) or gate it on analytics consent.

**D. `add_to_cart` could be cut off by the redirect. Low, fixed.**
The page navigated to the cart immediately after the event. Navigation now waits 300 ms (`site/app.js`). Re-verify in server Preview.

**E. No HTTP security headers. Low.**
No HSTS, X-Content-Type-Options, Referrer-Policy or CSP are set (GitHub Pages ignores the `_headers` file). Add them with a Cloudflare Transform Rule (Modify Response Header).

**F. Cookieless pings before consent. For legal review.**
With consent denied, the Google tag still sends cookieless `page_view` and `view_item_list` to the server container (normal Consent Mode behaviour). Mixpanel and Meta tags are written to stay silent without consent. Whether pings before consent are acceptable under your policy is a legal decision.

**G. `event_id` arrives on the wire as `evnid`.** Check in the server Preview that the server event data exposes it as `event_id`, otherwise Meta deduplication will not work.

## 4. Compliance view (technical only, not legal advice)

Done: opt-in banner with equal Accept and Reject, per-category choices, persistent launcher, versioned reconsent after 12 months, Consent Mode v2 signals, server tags gated on consent, hashed PII only on purchase.
Open: pre-consent beacon (C), server-side audit trail (B), cookie list and privacy policy text, retention period for stored emails, legal review of cookieless pings (F).

## 5. Still to verify by hand

1. Server Preview: GA4 client claims requests; GA4, Mixpanel and Meta tags fire on the right events; Meta only on the funnel events.
2. Mixpanel Live View shows the test purchase, with `transaction_id` and `distinct_id`.
3. Meta Events Manager, Test Events (use a test event code): `Purchase` arrives with hashed email and phone, and `event_id` present.
4. GA4 DebugView / Realtime: `purchase` with `transaction_id`, items and value.
5. Tag Assistant: hits sent to the `/metrics` path.
6. Reject-all run: Mixpanel and Meta tags must not fire.

## 6. Suggested order of fixes

1. A: find what overrides the server URL, then re-test.
2. C: disable the Cloudflare Web Analytics beacon.
3. B: choose Cloudflare Pages or a Worker, so consent and preferences are stored server-side.
4. E: add security headers.
5. Run the manual checks in section 5, then remove the test order from reporting.

## 7. Re-test (same day, after fixes)

| Check | Result |
|---|---|
| Fix D deployed (`add_to_cart` redirect delay) | Live on shop.pocpe.com |
| Fresh visitor: banner, defaults denied, accept all, `G100` to `G111` | Pass |
| Finding A (server URL) | **Resolved.** Hits now go to `sgtm.pocpe.com` (the earlier result was a browser-cached `gtm.js`, 15 min cache) |
| Published web container contains `add_to_cart` in the trigger regex and its tag | Pass (read from the served `gtm.js`) |
| `add_to_cart` is processed by GTM (gets a `gtm.uniqueEventId`) | Pass |
| `add_to_cart` hit visible in the browser | **Confirmed 2026-10-15 (see section 9).** Earlier: not confirmed. Page-load events (`page_view`, `view_item`, `view_cart`, `purchase`) show as hits; events pushed after load did not appear in Resource Timing. Needs server Preview or GA4 DebugView to confirm. |
| New: request to `stats.g.doubleclick.net` after marketing consent | Expected (Google advertising features); list it in the cookie/privacy policy |
| Finding B (`/api/consent` 405) | Resolved, see section 8 |
| Finding C (Cloudflare beacon) | Still open |
| Finding E (security headers) | Still open |

## 8. Server-side storage (Worker + D1), tested 2026-10-13

| Check | Result |
|---|---|
| `POST /api/consent` stores a choice in D1 | Pass |
| Banner "Customise" with analytics only: server returns exactly that choice (analytics 1, marketing 0, preferences 0), country `IN`, reconsent date +1 year | Pass |
| Server-set `pocpe_consent` cookie present | Pass |
| `POST /api/preferences` for a new email | Pass (reconsent +24 months) |
| Edit existing email with no token or a bad token | Blocked (401) |
| Read profile with no token or a bad token | Blocked (401) |
| Erase with no token | Blocked (401) |
| Invalid email | 400 |
| Foreign `Origin` header | 403 |
| Body over 4 KB | 413 |
| Unsupported method | 405 |
| Static site and security headers unaffected | Pass |

Finding B is **resolved**. Signed-link happy path tested later the same day (below). Not yet built: an automated reconsent reminder (no email sender yet).
Test data left in D1: visitor `00000000-0000-4000-8000-000000000000`, the browser test visitor, and email `prefs-e2e-test@example.com`.

### Signed-link happy path (throwaway email, erased afterwards)

| Step | Result |
|---|---|
| Subscribe a new email (no token needed) | Pass |
| Read the profile with a valid token | Pass (20 of 20 reads) |
| Read with a token signed by a different secret | Blocked (20 of 20 returned 401) |
| Edit topics and frequency with a valid token, then read back | Pass |
| Edit with no token | Blocked (401) |
| Unsubscribe all | Pass, `marketing_optin` becomes false |
| Erase with a valid token, then read | Pass, 404 after erase; erasing twice is harmless |

Operational note: after `wrangler secret put`, the new secret took a few minutes to reach every Cloudflare location; for that window the same valid token alternated between 200 and 401. Wait a few minutes after rotating `PREF_SECRET` before testing, or links may appear invalid.
**Action:** the Worker secret was set to a weak test value during testing. Replace it with a long random value (`openssl rand -hex 32`) before real use.

## 9. Tags firing before consent: found and fixed (2026-10-15)

**Finding.** A fresh visitor who had not clicked anything already had the GTM container running, and cookie-less hits (`page_view`, `view_item_list`, with a client ID, `gcs=G100`) were sent to `sgtm.pocpe.com`. This is Consent Mode "advanced" behaviour, which many regulators do not accept for strict opt-in.

**Fix.** The GTM snippet was removed from all nine page heads. `site/consent.js` now loads GTM only after the visitor accepts analytics or marketing; events queued before that are replayed in the order GTM expects (consent commands, page context, `gtm.js`, events).

| Check (local, GTM stubbed) | Result |
|---|---|
| Fresh visitor, no click | No GTM request, no GTM script, events held in the queue |
| Reject all | GTM never loads |
| Returning visitor who rejected | GTM never loads, no banner |
| Accept analytics later via Cookie settings | GTM loads once, queue order: consent default, consent update, page context, gtm.js, events |
| Returning visitor who consented | GTM loads at page start, same order as before the change |

Still outside our code: the Cloudflare Web Analytics beacon is injected by Cloudflare and must be switched off in the dashboard. Privacy Policy section 3 was updated to match.

### Production verification of the consent gate (2026-10-15)

Discovery: Cloudflare's Google tag gateway injects its own GTM bootstrap into every page at the edge. It is inert (no `gtm.js` start message, so no tag fires and nothing is sent), and starts only when our loader pushes the start message after consent. Our loader therefore does not replay queued events when the container is already pre-booted (replaying double-counted `view_item_list`).

| Check (production, real browser) | Result |
|---|---|
| Truly fresh visitor, before any click: cookies | None |
| Requests to the analytics server (`sgtm.pocpe.com`) | 0 |
| Local/session storage | Empty |
| After Accept all: `page_view`, `view_item`, `scroll` | One each, consent `G111`, no duplicates |
| Add to cart: runs instantly (13 ms), no redirect, bag counter updates | Pass |
| `add_to_cart` hit reaches the server | **Confirmed** (value, item, `G111`) |
| Cart: remove updates in place, no reload (local test) | Pass |

Remaining third-party requests before consent, both injected outside our code: Cloudflare Web Analytics beacon (turn off in Cloudflare) and the tag-gateway health check to `www.googletagmanager.com` (a Google-side setting of the gateway). Note: Google cookies seen on a "fresh" visitor during testing were stale `.pocpe.com` cookies from earlier consenting sessions; clear cookies with the domain attribute when re-testing.
