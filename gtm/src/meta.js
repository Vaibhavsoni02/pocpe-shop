const sendHttpRequest = require('sendHttpRequest');
const getAllEventData = require('getAllEventData');
const JSON = require('JSON');
const sha256Sync = require('sha256Sync');
const getTimestampMillis = require('getTimestampMillis');
const makeInteger = require('makeInteger');

const MAP = {
  page_view: 'PageView', view_item: 'ViewContent', add_to_cart: 'AddToCart',
  begin_checkout: 'InitiateCheckout', add_payment_info: 'AddPaymentInfo', purchase: 'Purchase'
};
// Consent Mode signal forwarded by the web container: x-ga-gcs = "G1" + ad_storage + analytics_storage (1 = granted)
const gcsOf = function (ev) { return ev['x-ga-gcs'] || ''; };
const e = getAllEventData();
const name = MAP[e.event_name];
if (!name || gcsOf(e).charAt(2) !== '1') { // ad_storage not granted
  data.gtmOnSuccess();
  return;
}

const hash = function (v) {
  return v ? sha256Sync(('' + v).trim().toLowerCase(), { outputEncoding: 'hex' }) : undefined;
};
const HEX = '0123456789abcdef';
const hex64 = function (v) {
  if (!v || v.length !== 64) return false;
  for (let i = 0; i < 64; i++) if (HEX.indexOf(v.charAt(i)) < 0) return false;
  return true;
};
const ud = e.user_data || {};
const addr = ud.address || {};
const pick = function (hashed, raw, norm) {
  if (hashed && hex64(hashed)) return hashed;
  return raw ? hash(norm ? norm(raw) : raw) : undefined;
};
const digits = function (v) {
  const str = '' + v;
  let out = '';
  for (let i = 0; i < str.length; i++) if ('0123456789'.indexOf(str.charAt(i)) >= 0) out += str.charAt(i);
  return out;
};

const user = {
  em: pick(ud.sha256_email_address, ud.email_address),
  ph: pick(ud.sha256_phone_number, ud.phone_number, digits),
  fn: pick(addr.sha256_first_name, addr.first_name),
  ln: pick(addr.sha256_last_name, addr.last_name),
  country: pick(addr.sha256_country, addr.country),
  external_id: e.user_id || e.client_id, // the hashed-email user_id once known, else the analytics client id
  client_ip_address: e.ip_override,
  client_user_agent: e.user_agent
};
['em', 'ph', 'fn', 'ln', 'country'].forEach(function (k) { if (user[k]) user[k] = [user[k]]; else user[k] = undefined; });

// fbc from the fbclid URL parameter (no browser pixel needed)
const url = e.page_location || '';
const parts = url.split('fbclid=');
if (parts.length > 1) {
  const clid = parts[1].split('&')[0].split('#')[0];
  if (clid) user.fbc = 'fb.1.' + getTimestampMillis() + '.' + clid;
}

const custom = { currency: e.currency, value: e.value };
if (e.items && e.items.length) {
  custom.content_type = 'product';
  custom.content_ids = e.items.map(function (i) { return i.item_id; });
  custom.contents = e.items.map(function (i) { return { id: i.item_id, quantity: i.quantity, item_price: i.price }; });
  custom.num_items = e.items.length;
}
if (e.transaction_id) custom.order_id = e.transaction_id;

const payload = {
  data: [{
    event_name: name,
    event_time: makeInteger(getTimestampMillis() / 1000),
    event_id: e.event_id,
    event_source_url: url,
    action_source: 'website',
    user_data: user,
    custom_data: custom
  }]
};
if (data.testEventCode) payload.test_event_code = data.testEventCode;

sendHttpRequest('https://graph.facebook.com/' + data.apiVersion + '/' + data.pixelId + '/events?access_token=' + data.accessToken,
  function (status) { if (status >= 200 && status < 300) data.gtmOnSuccess(); else data.gtmOnFailure(); },
  { method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 3000 }, JSON.stringify(payload));
