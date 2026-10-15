const sendHttpRequest = require('sendHttpRequest');
const getAllEventData = require('getAllEventData');
const JSON = require('JSON');
const getTimestampMillis = require('getTimestampMillis');

// Consent Mode signal forwarded by the web container: x-ga-gcs = "G1" + ad_storage + analytics_storage (1 = granted)
const gcsOf = function (ev) { return ev['x-ga-gcs'] || ''; };

const e = getAllEventData();
if (gcsOf(e).charAt(3) !== '1') { // analytics_storage not granted
  data.gtmOnSuccess();
  return;
}

// Mixpanel fills $browser, $os and $device from the request's User-Agent header. This call comes from the server,
// so we send the visitor's UA as the header and also set the properties ourselves (indexOf only: no regex in sandboxed JS).
const uaInfo = function (ua) {
  const has = function (s) { return ua.indexOf(s) >= 0; };
  const ver = function (token) {
    const i = ua.indexOf(token);
    if (i < 0) return undefined;
    let j = i + token.length, out = '';
    while (j < ua.length && '0123456789.'.indexOf(ua.charAt(j)) >= 0) { out += ua.charAt(j); j++; }
    return out ? out.split('.')[0] : undefined;
  };
  const r = {};
  if (has('Edg/')) { r.b = 'Microsoft Edge'; r.v = ver('Edg/'); }
  else if (has('OPR/')) { r.b = 'Opera'; r.v = ver('OPR/'); }
  else if (has('FxiOS/')) { r.b = 'Firefox iOS'; r.v = ver('FxiOS/'); }
  else if (has('Firefox/')) { r.b = 'Firefox'; r.v = ver('Firefox/'); }
  else if (has('CriOS/')) { r.b = 'Chrome iOS'; r.v = ver('CriOS/'); }
  else if (has('Chrome/')) { r.b = 'Chrome'; r.v = ver('Chrome/'); }
  else if (has('Safari/') && has('Version/')) { r.b = 'Safari'; r.v = ver('Version/'); }
  if (has('iPhone') || has('iPad') || has('iPod')) r.os = 'iOS';
  else if (has('Android')) r.os = 'Android';
  else if (has('Windows')) r.os = 'Windows';
  else if (has('Mac OS X')) r.os = 'Mac OS X';
  else if (has('CrOS')) r.os = 'Chrome OS';
  else if (has('Linux')) r.os = 'Linux';
  if (has('iPhone')) r.d = 'iPhone';
  else if (has('iPad')) r.d = 'iPad';
  else if (has('Android')) r.d = 'Android';
  return r;
};

const now = getTimestampMillis();
const props = {
  token: data.token,
  time: now,
  ip: e.ip_override, // the visitor's IP once the server container augments it from CF-Connecting-IP (see SETUP.md)
  page_type: e.page_type,
  currency: e.currency,
  value: e.value,
  transaction_id: e.transaction_id,
  coupon: e.coupon
};
// Identity (Mixpanel Simplified ID Merge): anonymous events carry $device_id; once the visitor is known
// (analytics consent + an order), $user_id joins that device to a profile.
props['$device_id'] = e.client_id;
if (e.user_id) props['$user_id'] = e.user_id;
props['$insert_id'] = e.event_id || (e.client_id + '-' + now);
props['$current_url'] = e.page_location;
props['$referrer'] = e.page_referrer;
props['consent_analytics'] = true;

const ua = e.user_agent || '';
if (ua) {
  const u = uaInfo(ua);
  if (u.b) props['$browser'] = u.b;
  if (u.v) props['$browser_version'] = u.v;
  if (u.os) props['$os'] = u.os;
  if (u.d) props['$device'] = u.d;
}

if (e.items && e.items.length) {
  props.items = e.items.map(function (i) {
    return { id: i.item_id, name: i.item_name, brand: i.item_brand, category: i.item_category, price: i.price, quantity: i.quantity };
  });
  props.item_count = e.items.length;
}
if (e.email_topics) props.email_topics = e.email_topics;
if (e.email_frequency) props.email_frequency = e.email_frequency;
if (e.email_optin !== undefined) props.email_optin = e.email_optin;

const headers = { 'Content-Type': 'application/json', 'Accept': 'text/plain' };
if (ua) headers['User-Agent'] = ua;
const body = [{ event: e.event_name, properties: props }];
sendHttpRequest('https://' + data.host + '/track?verbose=1', function (status) {
  if (status >= 200 && status < 300) data.gtmOnSuccess(); else data.gtmOnFailure();
}, { method: 'POST', headers: headers, timeout: 3000 }, JSON.stringify(body));
