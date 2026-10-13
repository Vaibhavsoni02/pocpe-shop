// pocpe-api: consent audit log + email preference centre, backed by D1.
//   POST /api/consent      save a cookie-consent choice (sets a server-side first-party cookie)
//   GET  /api/consent      latest choice for the visitor in the pocpe_consent cookie
//   POST /api/preferences  subscribe / update email preferences (existing profiles need a signed token)
//   GET  /api/preferences  read a profile (?e=email&t=token)
//   POST /api/erase        delete an email profile and its linked consent history (?t=token)
const UUID = /^[0-9a-f-]{36}$/i;
const TOPICS = ["new_releases", "offers", "weekly_digest", "tips"];
const FREQ = ["weekly", "monthly", "important_only"];
const COOKIE_DAYS = 365, EMAIL_RECONSENT_MONTHS = 24, MAX_BODY = 4096;

const json = (o, s = 200, h = {}) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store", ...h } });
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha = async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const norm = (e) => String(e || "").trim().toLowerCase();
const validEmail = (e) => /^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,}$/.test(e);
const bool = (x) => (x === true ? 1 : 0);

async function sign(email, secret) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(email)));
}
function same(a, b) { // constant-time string compare
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function authed(email, token, env) {
  return !!token && !!env.PREF_SECRET && same(await sign(email, env.PREF_SECRET), token);
}
async function body(req) {
  const t = await req.text();
  if (t.length > MAX_BODY) throw Object.assign(new Error("too large"), { status: 413 });
  try { return JSON.parse(t); } catch { throw Object.assign(new Error("bad json"), { status: 400 }); }
}
const visitorFromCookie = (req) => {
  const m = (req.headers.get("cookie") || "").match(/pocpe_consent=([^;]*)/);
  try { const id = JSON.parse(decodeURIComponent(m[1])).id; return UUID.test(id) ? id : null; } catch { return null; }
};

async function postConsent(req, env) {
  const b = await body(req);
  if (!UUID.test(b.id || "") || typeof b.v !== "string" || b.v.length > 32) return json({ error: "invalid" }, 400);
  const now = new Date();
  const rec = {
    id: b.id, v: b.v, necessary: true,
    analytics: b.analytics === true, marketing: b.marketing === true, preferences: b.preferences === true,
    action: String(b.action || "").slice(0, 20),
    ts: now.toISOString(), reconsent_at: new Date(now.getTime() + COOKIE_DAYS * 864e5).toISOString()
  };
  await env.DB.prepare(
    "INSERT INTO consent_events (visitor_id, version, analytics, marketing, preferences, action, ts, reconsent_at, country, page) VALUES (?,?,?,?,?,?,?,?,?,?)"
  ).bind(rec.id, rec.v, bool(rec.analytics), bool(rec.marketing), bool(rec.preferences), rec.action, rec.ts, rec.reconsent_at,
         req.headers.get("cf-ipcountry") || null, String(b.page || "").slice(0, 100)).run();
  const cookie = `pocpe_consent=${encodeURIComponent(JSON.stringify(rec))}; Max-Age=${COOKIE_DAYS * 86400}; Path=/; SameSite=Lax; Secure`;
  return json({ ok: true, record: rec }, 200, { "set-cookie": cookie });
}

async function getConsent(req, env) {
  const id = visitorFromCookie(req);
  if (!id) return json({ error: "not_found" }, 404);
  const r = await env.DB.prepare("SELECT * FROM consent_events WHERE visitor_id = ? ORDER BY id DESC LIMIT 1").bind(id).first();
  return r ? json(r) : json({ error: "not_found" }, 404);
}

const toRecord = (r) => ({ email: r.email, visitor_id: r.visitor_id, topics: JSON.parse(r.topics), frequency: r.frequency,
  marketing_optin: !!r.marketing_optin, source: r.source, first_ts: r.first_ts, consent_ts: r.consent_ts, reconsent_at: r.reconsent_at });

async function getPrefs(req, env, url) {
  const email = norm(url.searchParams.get("e"));
  if (!validEmail(email) || !(await authed(email, url.searchParams.get("t"), env))) return json({ error: "unauthorised" }, 401);
  const r = await env.DB.prepare("SELECT * FROM email_prefs WHERE email_hash = ?").bind(await sha(email)).first();
  return r ? json(toRecord(r)) : json({ error: "not_found" }, 404);
}

async function postPrefs(req, env, url) {
  const b = await body(req);
  const email = norm(b.email);
  if (!validEmail(email)) return json({ error: "invalid email" }, 400);
  const h = await sha(email);
  const prev = await env.DB.prepare("SELECT * FROM email_prefs WHERE email_hash = ?").bind(h).first();
  if (prev && !(await authed(email, url.searchParams.get("t"), env))) return json({ error: "unauthorised" }, 401);

  const unsub = b.unsubscribe_all === true;
  const topics = unsub ? [] : Array.isArray(b.topics) ? b.topics.filter((t) => TOPICS.includes(t)) : prev ? JSON.parse(prev.topics) : [];
  const now = new Date(), ts = now.toISOString();
  const reconsent = new Date(now); reconsent.setMonth(reconsent.getMonth() + EMAIL_RECONSENT_MONTHS);
  const optin = !unsub && topics.length > 0;
  const source = String(b.source || prev?.source || "preference_centre").slice(0, 30);
  const visitor = UUID.test(b.visitor_id || "") ? b.visitor_id : prev?.visitor_id || null;
  const freq = FREQ.includes(b.frequency) ? b.frequency : prev?.frequency || "monthly";

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO email_prefs (email_hash, email, visitor_id, topics, frequency, marketing_optin, source, first_ts, consent_ts, reconsent_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(email_hash) DO UPDATE SET visitor_id=excluded.visitor_id, topics=excluded.topics, frequency=excluded.frequency,
         marketing_optin=excluded.marketing_optin, source=excluded.source, consent_ts=excluded.consent_ts, reconsent_at=excluded.reconsent_at`
    ).bind(h, email, visitor, JSON.stringify(topics), freq, optin ? 1 : 0, source, prev?.first_ts || ts, ts, reconsent.toISOString()),
    env.DB.prepare("INSERT INTO email_events (email_hash, topics, optin, source, ts) VALUES (?,?,?,?,?)")
      .bind(h, JSON.stringify(topics), optin ? 1 : 0, source, ts)
  ]);
  const r = await env.DB.prepare("SELECT * FROM email_prefs WHERE email_hash = ?").bind(h).first();
  return json({ ok: true, record: toRecord(r) });
}

async function erase(req, env, url) {
  const b = await body(req);
  const email = norm(b.email);
  if (!validEmail(email) || !(await authed(email, url.searchParams.get("t"), env))) return json({ error: "unauthorised" }, 401);
  const h = await sha(email);
  const p = await env.DB.prepare("SELECT visitor_id FROM email_prefs WHERE email_hash = ?").bind(h).first();
  const stmts = [env.DB.prepare("DELETE FROM email_events WHERE email_hash = ?").bind(h),
                 env.DB.prepare("DELETE FROM email_prefs WHERE email_hash = ?").bind(h)];
  if (p?.visitor_id) stmts.push(env.DB.prepare("DELETE FROM consent_events WHERE visitor_id = ?").bind(p.visitor_id));
  await env.DB.batch(stmts);
  return json({ ok: true, erased: !!p });
}

const routes = {
  "/api/consent": { POST: postConsent, GET: getConsent },
  "/api/preferences": { POST: postPrefs, GET: getPrefs },
  "/api/erase": { POST: erase }
};

export default {
  async fetch(req, env) {
    try {
      const url = new URL(req.url);
      const origin = req.headers.get("origin");
      if (origin && origin !== env.ALLOWED_ORIGIN) return json({ error: "forbidden" }, 403);
      const route = routes[url.pathname.replace(/\/$/, "")];
      if (!route) return json({ error: "not_found" }, 404);
      const handler = route[req.method];
      if (!handler) return json({ error: "method_not_allowed" }, 405);
      return await handler(req, env, url);
    } catch (e) {
      return json({ error: e.status ? e.message : "server_error" }, e.status || 500);
    }
  }
};
