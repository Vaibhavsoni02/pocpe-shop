# shop.pocpe.com: jalapeño plushie shop with first-party tracking

A minimal ecommerce demo selling jalapeño soft plushies (home, category, product, cart, checkout, thank-you) built to show an ideal first-party tracking setup: Google tag gateway, web and server GTM, a consent system with a server-side audit log, and an email preference centre.

Live: https://shop.pocpe.com · Last updated: 2026-10-13 · Legal: [Privacy Policy](https://shop.pocpe.com/privacy), [Terms](https://shop.pocpe.com/terms)

## Architecture

```
Browser ── shop.pocpe.com (Cloudflare proxy, GitHub Pages origin)
   │        ├─ /metrics/*  Google tag gateway (gtm.js and helper scripts served first-party)
   │        └─ /api/*      Cloudflare Worker (pocpe-api) + D1: consent audit log, email preferences
   ├─ consent.js           banner, launcher, Consent Mode v2, cookie pocpe_consent
   └─ Web GTM (GTM-KZF9QGPF) ──▶ https://sgtm.pocpe.com
                                  Server GTM (GTM-P65HG9WX, Stape, AP South India, Own CDN)
                                    ├─ GA4 (G-LK55NDVF5W)
                                    ├─ Mixpanel (US data residency)
                                    └─ Meta Conversions API
```
Details: [ARCHITECTURE.md](ARCHITECTURE.md). Operations and deploy steps: [SETUP.md](SETUP.md). Latest test results and open findings: [TEST-REPORT.md](TEST-REPORT.md).

## Current status

| Area | Status |
|---|---|
| Storefront and data layer (GA4 ecommerce events with `event_id`, `transaction_id`) | Live |
| Hosting: GitHub Pages behind Cloudflare, HTTPS enforced | Live |
| Google tag gateway (`gtm.js` from `/metrics`, with fallback to Google) | Live |
| Web container and server container published | Live |
| Server domain `sgtm.pocpe.com` (Stape Own CDN) | Live; hits now use it |
| Consent banner, launcher, Consent Mode v2, 12-month reconsent; GTM and all tags load only after analytics or marketing consent (nothing runs before) | Live 2026-10-15 |
| Security headers via Cloudflare Transform Rule | Live |
| API Worker + D1 (consent audit log, email preferences, erase) | Live and tested on 2026-10-13 (details in TEST-REPORT.md section 8) |
| Pre-consent third-party requests: Cloudflare Web Analytics beacon and the tag-gateway health check to Google | Open: both injected outside our code; turn off Web Analytics in Cloudflare and review the gateway's tag-injection setting |
| `add_to_cart` hit confirmation | Done 2026-10-15 (instant add-to-cart, hit reaches the server) |
| Meta, Mixpanel and GA4 end-to-end confirmation | Open: needs a look in each tool (checklist in TEST-REPORT.md) |
| Identity: pseudonymous `user_id` (email hash) to GA4 and Mixpanel, Mixpanel People profile on purchase, visitor IP and user-agent fixes | Code, templates and patches written and tested locally 2026-10-15; **needs your container imports and the Cloudflare IP transformation (SETUP.md section 7)** |
| Legal pages: Privacy Policy (/privacy) and Terms (/terms), footer links on every page, policy link in the cookie banner | Live 2026-10-13. Operator is "pocpe" (no registered entity), contact vaibhav@pocpe.com. Governing law England and Wales, minimum age 16, conservative retention periods. **Draft: not yet reviewed by counsel; retention periods are stated but not yet enforced by jobs.** |
| Legal review (cookie list, policy text, cookieless pings before consent, email retention) | Open |

A test order exists in GA4, Mixpanel and Meta (transaction `T-1791896334686`, `e2e-test@example.com`); filter it out.

## Repo layout

```
site/                 static storefront (HTML, app.js data layer, consent.js, preferences page)
worker/               Cloudflare Worker (src/index.js), D1 schema (schema.sql), wrangler.toml
gtm/                  importable GTM containers and server tag-template source
scripts/pref-link.mjs signed preference-centre link generator
.github/workflows/    GitHub Pages deploy
```

## Design (updated 2026-10-13)

Dark editorial theme: Fraunces (display serif) with Hanken Grotesk (body) and DM Mono (labels), all self-hosted in `site/fonts/` so no request goes to a font CDN before consent. Deep green-black palette with one lime accent, grain texture and gradient mesh, asymmetric layouts, and staggered page-load reveals (disabled for reduced-motion users). Product art is generated SVG in `site/app.js`; catalogue data is `site/products.json`. The checkout now collects a delivery address.

The redesign did not touch tracking: the ten data layer events keep the same names and fields (two intended changes: `shipping_tier` is now `standard`, and `purchase.user_data.address` gained street, city, region and postal code). `config.js` is untouched; the GTM loader now lives in `consent.js` (see Consent below). Verified locally with a stubbed gateway so no test traffic reaches GA4, Mixpanel or Meta.

## Data layer events

`view_item_list`, `select_item`, `view_item`, `add_to_cart`, `remove_from_cart`, `view_cart`, `begin_checkout`, `add_shipping_info`, `add_payment_info`, `purchase`, `consent_update`, `email_preferences_update`. `purchase` also carries `transaction_id` and `user_data`; the server container hashes PII before it reaches Meta.

## Consent and privacy design

- Defaults denied, opt-in, equal Accept all and Reject all, per-category choices (analytics, marketing, preferences), persistent "Cookie settings" launcher.
- Choice stored in a first-party cookie and localStorage, and (once the Worker is deployed) as an append-only row in D1 with version, timestamp, country and reconsent date.
- GTM is not loaded until the visitor accepts analytics or marketing, so nothing is sent before consent and "Reject all" keeps every tag off. Consent Mode still tells the tags what was granted.
- Server tags check Consent Mode (`x-ga-gcs`): Mixpanel needs analytics, Meta needs ad storage.
- Email preferences: topics, frequency, last-confirmed and reconsent dates (24 months), signed links for edits, erase endpoint.
- Not legal advice. The wording and cookie list need review before real traffic.

## Secrets

Never committed: Mixpanel token, Meta CAPI token, `PREF_SECRET`. They live in GTM constants and in Cloudflare Worker secrets. Rotate any token that has been pasted into chat or a shared export.

## Run locally

```bash
npm run dev          # static site on http://localhost:3000 (no API, consent stays in the browser)
npm run worker:dev   # API Worker locally (needs Node and wrangler login)
```
