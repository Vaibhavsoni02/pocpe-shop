// Fill these in. Leave a value empty to disable that piece.
window.POCPE = {
  gtmId: "GTM-KZF9QGPF", // Web container (hardcoded in each page <head> snippet too)
  // Tag gateway is done at the Cloudflare edge: Cloudflare rewrites the GTM/gtag
  // URLs in served HTML to the first-party path (e.g. /metrics). No code change needed.
  // sGTM endpoint is configured inside the web container (GA4 tag -> server_container_url).
  // Server container (Stape, AP South India). Use the built-in URL until sgtm.pocpe.com is verified in Stape.
  sgtmUrl: "https://wcrxndmq.in.stape.io", // target: "https://sgtm.pocpe.com"
  currency: "USD",
  debug: true             // logs every dataLayer push to console
};
