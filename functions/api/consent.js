// POST /api/consent  -> store the visitor's cookie-consent record in KV, set a server-side first-party cookie
// GET  /api/consent  -> return the stored record for the visitor in the pocpe_consent cookie
const UUID = /^[0-9a-f-]{36}$/i;
const bool = (x) => x === true;

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch { return new Response("bad json", { status: 400 }); }
  if (!UUID.test(b.id || "") || typeof b.v !== "string" || b.v.length > 32) return new Response("invalid", { status: 400 });

  const rec = {
    id: b.id, v: b.v, necessary: true,
    analytics: bool(b.analytics), marketing: bool(b.marketing), preferences: bool(b.preferences),
    action: String(b.action || "").slice(0, 20),
    ts: new Date().toISOString(),                                   // server time is the audit timestamp
    reconsent_at: new Date(Date.now() + 365 * 864e5).toISOString()
  };
  const key = "visitor:" + rec.id;
  const prev = JSON.parse((await env.CONSENT.get(key)) || "null");
  const history = [...(prev?.history || []), { ...rec, country: request.cf?.country || request.headers.get("cf-ipcountry"), page: String(b.page || "").slice(0, 100) }].slice(-20);
  await env.CONSENT.put(key, JSON.stringify({ current: rec, history, email_hash: prev?.email_hash || null }));

  const cookie = `pocpe_consent=${encodeURIComponent(JSON.stringify(rec))}; Max-Age=31536000; Path=/; SameSite=Lax; Secure`;
  return new Response(JSON.stringify({ ok: true, record: rec }), { headers: { "content-type": "application/json", "set-cookie": cookie } });
}

export async function onRequestGet({ request, env }) {
  const m = (request.headers.get("cookie") || "").match(/pocpe_consent=([^;]*)/);
  let id; try { id = JSON.parse(decodeURIComponent(m[1])).id; } catch {}
  if (!id || !UUID.test(id)) return new Response("{}", { status: 404 });
  const v = await env.CONSENT.get("visitor:" + id);
  return new Response(v || "{}", { status: v ? 200 : 404, headers: { "content-type": "application/json" } });
}
