# Setup and operations

Current state and architecture: see [README.md](README.md) and [ARCHITECTURE.md](ARCHITECTURE.md).
Test results: [TEST-REPORT.md](TEST-REPORT.md).

## 1. Site (GitHub Pages)
Push to `main`; [.github/workflows/pages.yml](.github/workflows/pages.yml) publishes `site/`. `site/CNAME` is `shop.pocpe.com`.
Cloudflare DNS: `shop` CNAME to `vaibhavsoni02.github.io`, **Proxied**, SSL/TLS mode **Full**.

## 2. API Worker (consent + preferences, D1) — one-time setup
Needs Node.js (`brew install node`) and a Cloudflare login (`npx wrangler login`).
```bash
cd worker
npx wrangler d1 create pocpe-consent          # copy database_id into worker/wrangler.toml
cd ..
npm run db:init                               # creates the tables from worker/schema.sql
cd worker && npx wrangler secret put PREF_SECRET && cd ..   # long random string
npm run worker:deploy                         # route: shop.pocpe.com/api/*
```
Verify:
```bash
curl -s -X POST https://shop.pocpe.com/api/consent -H 'content-type: application/json' \
  -H 'origin: https://shop.pocpe.com' \
  -d '{"id":"00000000-0000-4000-8000-000000000000","v":"test","analytics":false,"marketing":false,"preferences":false,"action":"reject_all"}'
```
Expect `{"ok":true,...}`. Check rows: `cd worker && npx wrangler d1 execute pocpe-consent --remote --command "select * from consent_events order by id desc limit 5"`.

Signed link for an email's preference page: `PREF_SECRET=<same> npm run pref-link -- user@example.com`.
Erase a person (GDPR request): `POST /api/erase?t=<token>` with `{"email":"..."}`.

## 3. Tag Gateway (Cloudflare, set up from GTM)
GTM web container, Admin, **Google tag gateway**, Cloudflare automated setup, measurement path `/metrics`. Pages load `/metrics/gtm.js` with a fallback to Google's URL.

## 4. Containers (import files in [gtm/](gtm/))
- Web `GTM-KZF9QGPF`: [gtm/web-container-import.json](gtm/web-container-import.json). Set `const - GA4 measurement ID`; `const - sGTM URL` is `https://sgtm.pocpe.com`.
- Server `GTM-P65HG9WX` (Stape, AP South India, domain `sgtm.pocpe.com`): [gtm/server-container-import.json](gtm/server-container-import.json), or only the tag templates via [gtm/server-templates-update.json](gtm/server-templates-update.json). Fill the constants (GA4 ID, Mixpanel token, Meta pixel ID, Meta CAPI token) in the GTM UI; never commit them.
- Template source: [gtm/src/](gtm/src/).

## 5. Cloudflare settings in place
- Transform Rule (Modify Response Header) for `shop.pocpe.com`: HSTS, nosniff, Referrer-Policy, X-Frame-Options, Permissions-Policy. Use **Set static** so values are not duplicated.
- Web Analytics auto-injection should be **off** (it loads before consent).

## 6. Bumping the cookie policy
Change `VERSION` in [site/consent.js](site/consent.js) whenever the cookie list or policy changes; every visitor is asked again.

## 7. Identity, geolocation and the Mixpanel profile (2026-10-15)

**What the website does.** With analytics consent only, checkout creates `user_id` = SHA-256 of the lowercased, trimmed email, keeps it in `localStorage` (`pocpe_uid`) and puts it in the data layer on every page and on `purchase`. Withdrawing analytics consent deletes it.

**A. Fix the visitor IP (cause of "Singapore" in Mixpanel and GA4).** `sgtm.pocpe.com` is proxied by Cloudflare, so the server container sees Cloudflare's edge IP. In the server container:
1. Variables, New, type **Request Header**, header name `cf-connecting-ip`, name it `Req Header - CF Connecting IP`.
2. Transformations, New, type **Augment event**. Matching condition: Client Name equals your GA4 client. Add parameter `ip_override` = `{{Req Header - CF Connecting IP}}`. Leave it applying to **all tags**.
3. Preview a hit and check Event Data shows `ip_override` as the visitor's address, then publish.
This fixes GA4, Mixpanel and Meta at once, because they all read `ip_override`.

**B. Import the patches (they contain no secrets or IDs).**
- Server, Admin, Import Container, Merge, Overwrite conflicting: [gtm/server-templates-update.json](gtm/server-templates-update.json). It updates the Mixpanel event and Meta templates and adds the **Mixpanel People (profile set)** template, a `CE - purchase only` trigger and the tag **Mixpanel People - purchase (profile set)**.
- Web, same way: [gtm/web-user-id-patch.json](gtm/web-user-id-patch.json). It adds `DLV - user_id` and a `user_id` row on the Google tag.

**C. Verify.** Mixpanel: the event has `$browser`, `$os`, a real city and country, and after an order `$user_id`. The profile has `last_purchase_date`, `first_seen`, `ltv`, `purchase_count`. GA4 DebugView: the `purchase` event shows a `user_id` (hash). In GA4 Admin, Reporting identity, choose Blended so User-ID is used.

**Known limits.** `ltv` and `purchase_count` use Mixpanel `$add`, which is not idempotent: a duplicate `purchase` hit would be counted twice. `first_seen` is set when the customer is first identified (their first order), not at their first visit. A SHA-256 hash of an email is pseudonymous, not anonymous; Google's User-ID policy discourages PII, so consider an HMAC with a secret if you want it unguessable.

## 8. Deploys and stale caches (important)
Cloudflare caches site files at each edge location for about 10 minutes, and different locations refresh at different times, so right after a deploy one visitor can get the new HTML with an old script. Every page therefore loads its assets with a version query (for example `/consent.js?v=20261015b`). **When you change `consent.js`, `app.js`, `config.js` or `styles.css`, bump the `?v=` value in all `site/*.html` files** (search and replace the old value) so the new HTML can only ever load the matching new files.
