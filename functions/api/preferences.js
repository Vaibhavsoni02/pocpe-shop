// Email preference centre API (KV key: email:<sha256(lowercased email)>)
//   POST /api/preferences             -> subscribe / update.
//        New email (or none stored): allowed without a token (e.g. checkout or footer sign-up).
//        Existing email: requires ?t=<HMAC token> from an email link, so strangers can't read or edit a profile.
//   GET  /api/preferences?e=..&t=..   -> read a profile (token required)
// Tokens are made by scripts/pref-link.mjs using the PREF_SECRET env var.
const TOPICS = ["new_releases", "offers", "weekly_digest", "tips"];
const FREQ = ["weekly", "monthly", "important_only"];
const RECONSENT_MONTHS = 24;

const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha = async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
async function token(email, secret) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(email)));
}
const ok = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const norm = (e) => String(e || "").trim().toLowerCase();
const validEmail = (e) => /^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,}$/.test(e);

async function authed(email, t, env) {
  return !!t && !!env.PREF_SECRET && (await token(email, env.PREF_SECRET)) === t;
}

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url), email = norm(u.searchParams.get("e"));
  if (!validEmail(email) || !(await authed(email, u.searchParams.get("t"), env))) return ok({ error: "unauthorised" }, 401);
  const raw = await env.CONSENT.get("email:" + (await sha(email)));
  return raw ? ok(JSON.parse(raw)) : ok({ error: "not_found" }, 404);
}

export async function onRequestPost({ request, env }) {
  const u = new URL(request.url);
  let b; try { b = await request.json(); } catch { return ok({ error: "bad json" }, 400); }
  const email = norm(b.email);
  if (!validEmail(email)) return ok({ error: "invalid email" }, 400);

  const key = "email:" + (await sha(email));
  const prevRaw = await env.CONSENT.get(key);
  if (prevRaw && !(await authed(email, u.searchParams.get("t"), env))) return ok({ error: "unauthorised" }, 401);
  const prev = prevRaw ? JSON.parse(prevRaw) : {};

  const unsub = b.unsubscribe_all === true;
  const topics = unsub ? [] : (Array.isArray(b.topics) ? b.topics.filter((t) => TOPICS.includes(t)) : prev.topics || []);
  const now = new Date();
  const rec = {
    email,
    visitor_id: /^[0-9a-f-]{36}$/i.test(b.visitor_id || "") ? b.visitor_id : prev.visitor_id || null,
    marketing_optin: !unsub && topics.length > 0,
    topics,
    frequency: FREQ.includes(b.frequency) ? b.frequency : prev.frequency || "monthly",
    source: String(b.source || prev.source || "preference_centre").slice(0, 30),
    consent_ts: now.toISOString(),                                                     // when they last confirmed
    reconsent_at: new Date(now.setMonth(now.getMonth() + RECONSENT_MONTHS)).toISOString(), // when we must ask again
    first_ts: prev.first_ts || new Date().toISOString(),
    history: [...(prev.history || []), { ts: new Date().toISOString(), topics, optin: !unsub && topics.length > 0, source: b.source || "preference_centre" }].slice(-20)
  };
  await env.CONSENT.put(key, JSON.stringify(rec));

  // link visitor -> email (store only the hash on the visitor record)
  if (rec.visitor_id) {
    const vk = "visitor:" + rec.visitor_id, v = JSON.parse((await env.CONSENT.get(vk)) || "null");
    if (v) await env.CONSENT.put(vk, JSON.stringify({ ...v, email_hash: await sha(email) }));
  }
  return ok({ ok: true, record: rec });
}
