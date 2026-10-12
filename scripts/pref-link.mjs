// Usage: PREF_SECRET=xxxx node scripts/pref-link.mjs user@example.com [https://shop.pocpe.com]
// Prints the signed preference-centre link to put in emails.
import { createHmac } from "node:crypto";
const [email, base = "https://shop.pocpe.com"] = process.argv.slice(2);
if (!email || !process.env.PREF_SECRET) { console.error("need email arg and PREF_SECRET env"); process.exit(1); }
const e = email.trim().toLowerCase();
const t = createHmac("sha256", process.env.PREF_SECRET).update(e).digest("hex");
console.log(`${base}/preferences?e=${encodeURIComponent(e)}&t=${t}`);
