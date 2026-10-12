# Setup checklist

## 1. Run locally
```bash
npm run dev          # http://localhost:3000
```
Open DevTools console: with `debug: true` every `dataLayer` push is logged.

## 2. Deploy to Cloudflare Pages
```bash
npm run deploy       # wrangler pages deploy site
```
Then Pages project → **Custom domains** → add `shop.pocpe.com` (Cloudflare creates the proxied CNAME since the zone is on the same account).

## Your containers
| | |
|---|---|
| Web container | `GTM-KZF9QGPF` (already set in `site/config.js`) |
| Server container | `GTM-P65HG9WX`, Stape container `wcrxndmq`, AP South (India) |
| Server URL now | `https://wcrxndmq.in.stape.io` (built-in) |
| Server URL target | `https://sgtm.pocpe.com`: Stape → container → Domains → add, create the DNS record Stape lists in Cloudflare, wait for verification, then use it as `server_container_url` |

## 3. Web container
Edit [site/config.js](site/config.js) and set `gtmId: "GTM-XXXXXXX"`. In the web container:
- **Google tag / GA4 config** with `server_container_url = https://sgtm.pocpe.com`
- **GA4 event tag** triggered on the custom events listed in ARCHITECTURE.md, with *Send ecommerce data* from the data layer
- Data Layer Variables: `event_id`, `user_data`, `page_type`
- Pass `event_id` as an event parameter so it reaches the server container

## 4. Tag Gateway (Cloudflare)
Cloudflare dashboard → `pocpe.com` → **Google tag gateway** (location of the setting may vary by dashboard version) → enter your Google tag / GTM ID and measurement path `/metrics`. Cloudflare then rewrites the Google URLs on pages served through the zone. Verify in the Network tab: `gtm.js` should load from `shop.pocpe.com/metrics/...`.

## 5. Server container on Stape
1. Create the sGTM container in GTM (Server type), copy its **container config string** into Stape.
2. In Stape, add custom domain `sgtm.pocpe.com` and create the DNS record(s) it lists in Cloudflare.
3. Paste the final URL into the web container's `server_container_url`.

Server container contents:
| Item | Config |
|---|---|
| Client | GA4 client (default) |
| Tag: Mixpanel | Mixpanel tag from the Tag Template Gallery; project token; track all GA4 events; `distinct_id` from client_id or hashed email after purchase |
| Tag: Meta CAPI | Meta CAPI tag from the gallery; Pixel ID + CAPI access token; map `purchase` → Purchase, `add_to_cart` → AddToCart, `view_item` → ViewContent, `begin_checkout` → InitiateCheckout; set `event_id` from the data layer; `user_data` from the purchase event |
| Triggers | Event name equals the GA4 events above |

## 6. Verify
- Web GTM Preview and sGTM Preview, walk home → category → product → cart → checkout → thank you.
- `purchase` should fire exactly once; refreshing the thank-you page must not fire it again.
- Meta Events Manager → Test Events: Purchase should show as deduplicated if the browser pixel is also running with the same `event_id`.
- Mixpanel Live View shows the events.

## 7. Consent + preference centre
```bash
npx wrangler kv namespace create CONSENT      # paste the id into wrangler.toml
npx wrangler pages secret put PREF_SECRET --project-name pocpe-shop   # long random string
PREF_SECRET=<same> npm run pref-link -- user@example.com             # signed link for emails
```
- Pages project → Settings → Functions → KV binding `CONSENT` (production) if not picked up from `wrangler.toml`.
- Web GTM: enable **Consent Overview**; GA4/Google tags need `analytics_storage`, Meta/ads tags need `ad_storage` + `ad_user_data` + `ad_personalization`. Trigger on `consent_update` where needed.
- Bump `VERSION` in [site/consent.js](site/consent.js) whenever the cookie list or policy changes; everyone is re-asked.
- KV record shapes: `visitor:<uuid>` = current consent + history + email hash; `email:<sha256>` = topics, frequency, `consent_ts`, `reconsent_at`, history.
