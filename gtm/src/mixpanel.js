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
const now = getTimestampMillis();
const props = {
  token: data.token,
  distinct_id: e.client_id,
  time: now,
  ip: e.ip_override,
  page_type: e.page_type,
  currency: e.currency,
  value: e.value,
  transaction_id: e.transaction_id,
  coupon: e.coupon
};
props['$device_id'] = e.client_id;
props['$insert_id'] = e.event_id || (e.client_id + '-' + now);
props['$current_url'] = e.page_location;
props['$referrer'] = e.page_referrer;
props['$browser_user_agent'] = e.user_agent;
props['consent_analytics'] = true;

if (e.items && e.items.length) {
  props.items = e.items.map(function (i) {
    return { id: i.item_id, name: i.item_name, brand: i.item_brand, category: i.item_category, price: i.price, quantity: i.quantity };
  });
  props.item_count = e.items.length;
}
if (e.email_topics) props.email_topics = e.email_topics;
if (e.email_frequency) props.email_frequency = e.email_frequency;
if (e.email_optin !== undefined) props.email_optin = e.email_optin;

const body = [{ event: e.event_name, properties: props }];
sendHttpRequest('https://' + data.host + '/track?verbose=1', function (status) {
  if (status >= 200 && status < 300) data.gtmOnSuccess(); else data.gtmOnFailure();
}, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'text/plain' }, timeout: 3000 }, JSON.stringify(body));
