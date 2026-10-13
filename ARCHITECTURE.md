# shop.pocpe.com: ideal first-party tracking architecture

## Request flow

```
                         Cloudflare (zone: pocpe.com, free plan)
Browser ───────────────▶ ┌──────────────────────────────────────────────┐
                         │ shop.pocpe.com  (proxied)                    │
                         │   CDN + GitHub Pages origin; Worker on /api/*   │
                         │   Google Tag Gateway:  /metrics/*  ─────────────▶ Google tag servers
                         │   (rewrites gtm.js / gtag URLs to /metrics)  │     (gtm.js, gtag.js, collect)
                         └──────────────────────────────────────────────┘
   dataLayer events
   (GA4 ecommerce schema)
        │
        ▼
  Web GTM container ── GA4 tag / Google tag with server_container_url ──▶ https://sgtm.pocpe.com  (Stape)
  (loaded via /metrics)                                                         │
                                                                                 ▼
                                                    Server GTM container (Stape, custom domain, same eTLD+1)
                                                    Clients: GA4 client
                                                    ┌─────────────┬──────────────┬─────────────────┐
                                                    ▼             ▼              ▼                 ▼
                                                 Mixpanel     Meta CAPI     (optional) GA4    (optional) Stape
                                                 (all events) (purchase,    server-side       Cookie Keeper /
                                                              ATC, PDP,     forward           Own CDN
                                                              checkout)
```

## Layers

| Layer | Where | Role |
|---|---|---|
| **Web container** | Browser, GTM web container, loaded through `shop.pocpe.com/metrics` | Reads the `dataLayer` and forwards events to sGTM. Keep it thin: one GA4/Google tag plus consent and the Meta browser pixel (optional, for dedup). |
| **Server container** | Stape, `sgtm.pocpe.com` | Receives events first-party, enriches them, hashes PII, fans out to vendors. Holds all vendor secrets (Mixpanel token, Meta access token). |
| **Data layer** | `site/app.js` | The contract. GA4 ecommerce event schema plus `event_id` on every event and `user_data` on purchase. Browser and server vendors dedupe on `event_id` and `transaction_id`. |
| **CDN / edge** | Cloudflare | Caches and serves the static site, terminates TLS and runs Tag Gateway, so Google scripts and hits appear first-party under `/metrics`. |
| **Hosting** | GitHub Pages behind Cloudflare | Static origin. The `/api/*` routes are answered by a Cloudflare Worker with a D1 database. |

## Why this shape (Google's recommended setup)

1. **Tag Gateway** serves Google tags from your own domain through Cloudflare. This is the setup Google documents for Cloudflare, and it improves signal quality against blockers and ITP at no extra code cost.
2. **Server-side GTM on a custom subdomain of the same registrable domain.** `sgtm.pocpe.com` is same-site with `shop.pocpe.com`, so cookies set by the server are first-party.
3. **Vendors are called server-side.** Mixpanel and Meta CAPI get events from sGTM, so ad blockers and browser restrictions don't touch them, and secrets stay out of the browser.
4. **Dedup keys are generated once, in the data layer.** `event_id` goes to Meta (browser pixel and CAPI) and `transaction_id` goes to GA4.

## Decisions to be aware of

- **Ad platform choice: Meta CAPI.** It is the most common choice for ecom and sGTM has a first-party Meta CAPI tag. Swap in Google Ads or GA4 measurement protocol if you prefer; only the server tag changes.
- **Cloudflare + Stape DNS.** Create the `sgtm` record exactly as Stape instructs. Stape's own docs say whether to proxy (orange cloud) it. Proxying can interfere with their IP and certificate checks.
- **Safari cookie lifetime.** A CNAME-style subdomain can still have server-set cookies capped at 7 days. The stronger fix is to serve sGTM from the same origin, for example `shop.pocpe.com/sg/*` via a Cloudflare Worker, or to enable Stape's Cookie Keeper. Start simple, upgrade if retention data matters.
- **Consent.** Not implemented in this minimal build. For EU/UK traffic add a CMP wired to Consent Mode v2 before going live.
- **PII.** Raw email and phone are pushed on `purchase` only so sGTM can hash them. If you'd rather not expose raw PII in the browser, hash client-side in the web container instead.

## Event contract

`view_item_list`, `select_item`, `view_item`, `add_to_cart`, `remove_from_cart`, `view_cart`, `begin_checkout`, `add_shipping_info`, `add_payment_info`, `purchase`, each carrying `event_id`; `purchase` also carries `transaction_id` and `user_data`.

## Consent and preferences

```
Browser: consent.js ── Consent Mode default=denied ──▶ GTM loads ──▶ server container reads the consent signal (x-ga-gcs)
   │  save choice
   ├─ cookie pocpe_consent (365d) + localStorage          (instant, works offline)
   └─ POST shop.pocpe.com/api/consent ─▶ Cloudflare Worker (pocpe-api) ─▶ D1 consent_events  (+ server Set-Cookie)
Email prefs: /preferences ─▶ POST /api/preferences ─▶ Worker ─▶ D1 email_prefs + email_events
             edits to existing profiles need an HMAC-signed link (scripts/pref-link.mjs); POST /api/erase deletes a person
```
Re-consent triggers: policy `VERSION` change, or 12 months (cookies) / 24 months (email) since last confirmation.
The Worker runs only on `shop.pocpe.com/api/*`; GitHub Pages keeps serving the static site.
