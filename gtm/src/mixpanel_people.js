const sendHttpRequest = require('sendHttpRequest');
const getAllEventData = require('getAllEventData');
const JSON = require('JSON');
const getTimestampMillis = require('getTimestampMillis');
const makeNumber = require('makeNumber');
const Math = require('Math');

// Mixpanel People: creates or updates the customer profile when an order is placed (the "people.set" call).
// The profile id is the pseudonymous user_id (SHA-256 of the email) that the website puts on the order.
const e = getAllEventData();
const gcs = e['x-ga-gcs'] || '';
if (gcs.charAt(3) !== '1' || !e.user_id) { // needs analytics consent and a known customer
  data.gtmOnSuccess();
  return;
}

const pad = function (n) { return n < 10 ? '0' + n : '' + n; };
const iso = function (ms) { // epoch ms -> "YYYY-MM-DDTHH:MM:SS" (UTC), no Date or regex in sandboxed JS
  const days = Math.floor(ms / 86400000);
  const rem = Math.floor((ms - days * 86400000) / 1000);
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return y + '-' + pad(m) + '-' + pad(d) + 'T' + pad(Math.floor(rem / 3600)) + ':' + pad(Math.floor((rem % 3600) / 60)) + ':' + pad(rem % 60);
};

const now = iso(getTimestampMillis());
const value = makeNumber(e.value) || 0;
const items = e.items || [];

const profile = {
  '$token': data.token,
  '$distinct_id': e.user_id,
  '$ip': e.ip_override, // geolocates the profile (city, region, country)
  '$set': {
    last_purchase_date: now,
    last_purchase_value: value,
    last_purchase_currency: e.currency,
    last_transaction_id: e.transaction_id,
    last_purchase_item_count: items.length,
    last_seen: now
  },
  '$set_once': { first_seen: now, first_purchase_date: now },
  '$add': { ltv: value, purchase_count: 1 }
};
const ud = e.user_data || {};
if (data.storeEmail && ud.email_address) profile['$set']['$email'] = ud.email_address;

sendHttpRequest('https://' + data.host + '/engage?verbose=1', function (status) {
  if (status >= 200 && status < 300) data.gtmOnSuccess(); else data.gtmOnFailure();
}, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'text/plain' }, timeout: 3000 }, JSON.stringify([profile]));
