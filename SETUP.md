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
