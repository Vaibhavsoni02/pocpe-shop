// Cookie consent: banner + launcher + preference modal.
// Must load BEFORE app.js so Consent Mode defaults are set before GTM loads.
(() => {
  const VERSION = "2026-10-01";      // bump when the policy/cookie list changes -> forces re-consent
  const RECONSENT_DAYS = 365;        // also re-ask after this long
  const COOKIE = "pocpe_consent";
  const W = window;
  W.dataLayer = W.dataLayer || [];
  function gtag() { W.dataLayer.push(arguments); }

  const CATS = {
    analytics:   { label: "Analytics", desc: "Helps us understand how the shop is used (GA4, Mixpanel).", modes: ["analytics_storage"] },
    marketing:   { label: "Marketing", desc: "Lets us measure ads and show relevant offers (Meta).", modes: ["ad_storage", "ad_user_data", "ad_personalization"] },
    preferences: { label: "Preferences", desc: "Remembers choices such as region and display settings.", modes: ["functionality_storage", "personalization_storage"] }
  };

  // ---- storage (cookie + localStorage mirror) ----
  const readCookie = () => {
    const m = document.cookie.match(new RegExp("(?:^|; )" + COOKIE + "=([^;]*)"));
    try { return m ? JSON.parse(decodeURIComponent(m[1])) : null; } catch { return null; }
  };
  const readLS = () => { try { return JSON.parse(localStorage.getItem(COOKIE)); } catch { return null; } };
  const writeLocal = (rec) => {
    const val = encodeURIComponent(JSON.stringify(rec));
    document.cookie = `${COOKIE}=${val}; Max-Age=${RECONSENT_DAYS * 86400}; Path=/; SameSite=Lax; Secure`;
    try { localStorage.setItem(COOKIE, JSON.stringify(rec)); } catch {}
  };
  const uuid = () => crypto.randomUUID();

  let stored = readCookie() || readLS();
  const expired = (r) => !r || r.v !== VERSION || Date.now() > Date.parse(r.reconsent_at);
  const visitorId = (stored && stored.id) || uuid();

  // ---- Consent Mode v2 ----
  const modeState = (rec) => {
    const s = { security_storage: "granted" };
    for (const [k, c] of Object.entries(CATS)) c.modes.forEach((m) => (s[m] = rec && rec[k] ? "granted" : "denied"));
    return s;
  };
  gtag("consent", "default", { ...modeState(null), wait_for_update: 500 });
  if (!expired(stored)) gtag("consent", "default", modeState(stored)); // returning visitor: applied before GTM loads
  const announce = (rec, source) => {
    W.dataLayer.push({ event: "consent_update", consent_source: source, consent_visitor_id: visitorId,
      consent_analytics: !!rec.analytics, consent_marketing: !!rec.marketing, consent_preferences: !!rec.preferences,
      consent_version: rec.v, consent_ts: rec.ts, consent_reconsent_at: rec.reconsent_at });
  };
  // ---- GTM loads ONLY after analytics or marketing consent ("basic" consent mode) ----
  // Before that, no Google, Mixpanel or Meta code runs and no request leaves the page.
  // Events already queued in dataLayer (page context, view_item_list, ...) are replayed in the order
  // GTM expects: consent commands, page context, gtm.js, then the events. GTM id comes from config.js.
  const wantsTags = (rec) => !!rec && (rec.analytics === true || rec.marketing === true);
  let gtmLoaded = false;
  function loadGTM() {
    const id = W.POCPE && W.POCPE.gtmId;
    if (gtmLoaded || !id) return;
    gtmLoaded = true;
    const isCmd = (x) => Object.prototype.toString.call(x) === "[object Arguments]"; // gtag("consent", ...) calls
    const q = W.dataLayer.splice(0);
    const cmds = q.filter(isCmd), rest = q.filter((x) => !isCmd(x));
    const isEvt = (x) => "event" in x || "ecommerce" in x;
    cmds.concat(rest.filter((x) => !isEvt(x))).forEach((x) => W.dataLayer.push(x));
    W.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
    const add = (src, onerror) => {
      const s = document.createElement("script");
      s.async = true; s.src = src; if (onerror) s.onerror = onerror;
      document.head.appendChild(s);
    };
    // first-party path served by the Cloudflare Google tag gateway, with Google's URL as a fallback
    add("/metrics/gtm.js?id=" + id, () => add("https://www.googletagmanager.com/gtm.js?id=" + id));
    rest.filter(isEvt).forEach((x) => W.dataLayer.push(x));
  }
  if (!expired(stored)) announce(stored, "restored");
  if (!expired(stored) && wantsTags(stored)) loadGTM();

  // ---- save: local first, then server ----
  async function save(choice, action) {
    const now = new Date();
    const rec = { id: visitorId, v: VERSION, necessary: true, ...choice, action,
      ts: now.toISOString(), reconsent_at: new Date(now.getTime() + RECONSENT_DAYS * 864e5).toISOString() };
    writeLocal(rec); stored = rec;
    gtag("consent", "update", modeState(rec));
    announce(rec, action);
    if (wantsTags(rec)) loadGTM(); // first accept loads GTM now; the consent update above is already queued before it
    try { // server copy; also lets the server set a longer-lived first-party cookie (Safari ITP)
      await fetch("/api/consent", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...rec, page: location.pathname }), keepalive: true });
    } catch {}
    return rec;
  }

  // ---- UI ----
  const css = `
  #cc-banner,#cc-modal{position:fixed;z-index:9999;font:15px/1.45 system-ui,sans-serif;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.2)}
  #cc-banner{left:16px;right:16px;bottom:16px;max-width:620px;padding:16px;margin:0 auto}
  #cc-modal{inset:0;margin:auto;width:min(520px,calc(100% - 32px));height:fit-content;max-height:90vh;overflow:auto;padding:20px}
  #cc-launch{position:fixed;left:12px;bottom:12px;z-index:9998;font-size:13px;padding:6px 12px;border-radius:99px}
  .cc-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
  .cc-cat{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--line)}
  .cc-cat small{color:var(--mut);display:block}
  .cc-cat input{width:auto;margin:0;transform:scale(1.3)}
  #cc-back{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:9998}`;
  const ui = () => {
    document.head.insertAdjacentHTML("beforeend", `<style>${css}</style>`);
    document.body.insertAdjacentHTML("beforeend", `<button id="cc-launch" class="ghost" aria-label="Cookie settings">Cookie settings</button>`);
    document.getElementById("cc-launch").onclick = openModal;
    if (expired(stored)) banner();
  };
  const close = () => document.querySelectorAll("#cc-banner,#cc-modal,#cc-back").forEach((e) => e.remove());

  function banner() {
    close();
    document.body.insertAdjacentHTML("beforeend", `<div id="cc-banner" role="dialog" aria-label="Cookie consent">
      <strong>We value your privacy</strong>
      <p>We use cookies to run the shop and, with your permission, for analytics and marketing.
      Choose what you're happy with. You can change this any time from "Cookie settings". <a href="/privacy">Privacy Policy</a></p>
      <div class="cc-row"><button id="cc-all">Accept all</button><button id="cc-none" class="ghost">Reject all</button>
      <button id="cc-cust" class="ghost">Customise</button></div></div>`);
    cc("cc-all").onclick = async () => { close(); await save({ analytics: true, marketing: true, preferences: true }, "accept_all"); };
    cc("cc-none").onclick = async () => { close(); await save({ analytics: false, marketing: false, preferences: false }, "reject_all"); };
    cc("cc-cust").onclick = openModal;
  }
  const cc = (id) => document.getElementById(id);

  function openModal() {
    close();
    const cur = stored && !expired(stored) ? stored : {};
    const when = cur.ts ? `Last saved ${new Date(cur.ts).toLocaleDateString()}, we'll ask again by ${new Date(cur.reconsent_at).toLocaleDateString()}.` : "";
    document.body.insertAdjacentHTML("beforeend", `<div id="cc-back"></div><div id="cc-modal" role="dialog" aria-modal="true" aria-label="Cookie preferences">
      <h2 style="margin:0 0 8px">Cookie preferences</h2>
      <div class="cc-cat"><div><strong>Necessary</strong><small>Cart, checkout and security. Always on.</small></div><input type="checkbox" checked disabled></div>
      ${Object.entries(CATS).map(([k, c]) => `<div class="cc-cat"><div><strong>${c.label}</strong><small>${c.desc}</small></div>
        <input type="checkbox" id="cc-${k}" ${cur[k] ? "checked" : ""} aria-label="${c.label}"></div>`).join("")}
      <small style="color:var(--mut)">${when} Visitor ID: ${visitorId.slice(0, 8)}…</small>
      <div class="cc-row"><button id="cc-save">Save choices</button><button id="cc-all2" class="ghost">Accept all</button>
      <button id="cc-x" class="ghost">Close</button></div></div>`);
    cc("cc-back").onclick = cc("cc-x").onclick = () => { close(); if (expired(stored)) banner(); };
    cc("cc-save").onclick = async () => { const c = {}; Object.keys(CATS).forEach((k) => (c[k] = cc("cc-" + k).checked)); close(); await save(c, "custom"); };
    cc("cc-all2").onclick = async () => { close(); await save({ analytics: true, marketing: true, preferences: true }, "accept_all"); };
  }

  // public API for other scripts (e.g. preferences page)
  W.pocpeConsent = { open: openModal, get: () => stored, visitorId, hasMarketing: () => !!(stored && stored.marketing) };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", ui) : ui();
})();
