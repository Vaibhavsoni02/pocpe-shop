(async () => {
  const C = window.POCPE, W = window;
  const page = document.body.dataset.page;
  const $ = (s) => document.querySelector(s);
  const money = (n) => "$" + n.toFixed(2);
  const eid = () => crypto.randomUUID(); // shared id -> browser/server dedup (Meta, GA4)
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- Data layer (tracking contract: do not change event names or fields) ----------
  W.dataLayer = W.dataLayer || [];
  const push = (event, ecommerce, extra = {}) => {
    W.dataLayer.push({ ecommerce: null }); // clear previous ecommerce object (GA4 best practice)
    const obj = { event, event_id: eid(), ...extra };
    if (ecommerce) obj.ecommerce = ecommerce;
    W.dataLayer.push(obj);
    if (C.debug) console.log("[dataLayer]", obj);
  };

  // Base page context for every page (read by GTM as Data Layer Variables)
  W.dataLayer.push({ page_type: page, currency: C.currency, site: "shop.pocpe.com" });

  // GTM web container: standard snippet lives in each page <head> (after consent.js) so the
  // Cloudflare Google tag gateway serves it from /metrics.

  // ---------- Catalog + cart ----------
  const products = await (await fetch("/products.json")).json();
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  const cats = [...new Set(products.map((p) => p.category))];
  const catBlurb = {
    classics: "The core family. Three moods, one fruit.",
    minis: "Four to five inches of pocket-sized heat.",
    jumbo: "For people who hug at full scale.",
    bundles: "Small, soft ecosystems."
  };

  const getCart = () => { try { return JSON.parse(localStorage.getItem("cart") || "{}"); } catch { return {}; } };
  const setCart = (c) => { localStorage.setItem("cart", JSON.stringify(c)); renderCount(); };
  const cartCount = () => Object.values(getCart()).reduce((a, b) => a + b, 0);
  const renderCount = () => { const e = $("#cart-count"); if (e) e.textContent = cartCount(); };

  const item = (p, list, idx, qty = 1) => ({
    item_id: p.id, item_name: p.name, item_brand: p.brand, item_category: p.category,
    price: p.price, quantity: qty, index: idx,
    ...(list ? { item_list_id: list.id, item_list_name: list.name } : {})
  });
  const cartItems = () => Object.entries(getCart()).map(([id, q], i) => item(byId[id], null, i, q));
  const cartTotal = () => cartItems().reduce((a, i) => a + i.price * i.quantity, 0);

  // ---------- Plush illustrations (generated, no image files) ----------
  const shade = (hex, amt) => {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt * (amt < 0 ? v : 255 - v))));
    return "#" + [n >> 16, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, "0")).join("");
  };
  const INK = "#18210f";
  function plushBody(id, body, face, acc) {
    const hi = shade(body, 0.22), lo = shade(body, -0.28);
    const faces = {
      happy: `<circle cx="88" cy="142" r="7" fill="${INK}"/><circle cx="132" cy="142" r="7" fill="${INK}"/>
        <circle cx="90" cy="139" r="2.2" fill="#fff"/><circle cx="134" cy="139" r="2.2" fill="#fff"/>
        <path d="M96 168 Q110 186 124 168" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
      sleepy: `<path d="M78 144 Q88 153 98 144" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>
        <path d="M122 144 Q132 153 142 144" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>
        <path d="M103 173 Q110 178 117 173" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>
        <text x="168" y="86" font-family="Fraunces,serif" font-style="italic" font-weight="700" font-size="26" fill="${INK}" opacity=".55">z</text>
        <text x="182" y="64" font-family="Fraunces,serif" font-style="italic" font-weight="700" font-size="18" fill="${INK}" opacity=".4">z</text>`,
      cool: `<rect x="72" y="132" width="36" height="22" rx="4" fill="#0c0f0a"/><rect x="112" y="132" width="36" height="22" rx="4" fill="#0c0f0a"/>
        <path d="M108 140 H112" stroke="#0c0f0a" stroke-width="4"/><path d="M78 138 l10 -2" stroke="#fff" stroke-opacity=".5" stroke-width="2"/>
        <path d="M98 172 Q112 182 128 166" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`
    }[face];
    const cap = acc === "cap"
      ? `<path d="M68 66 C72 22 118 4 160 24 C140 34 130 52 152 66 C122 58 96 60 68 66 Z" fill="#e9e0c8"/><circle cx="160" cy="24" r="10" fill="#c6f432"/>` : "";
    const taco = acc === "taco"
      ? `<path d="M40 212 C56 266 164 266 180 212 C152 232 68 232 40 212 Z" fill="#f2b84b"/><path d="M44 214 l10 -8 l10 8 l10 -8 l10 8 l10 -8 l10 8 l10 -8 l10 8 l10 -8 l10 8 l10 -8" stroke="#2f7a2a" stroke-width="5" fill="none" stroke-linejoin="round"/>` : "";
    return `<g>
      <ellipse cx="110" cy="268" rx="64" ry="7" fill="#000" opacity=".35"/>
      <path d="M112 46 C114 26 124 16 140 14" stroke="#3f6b1f" stroke-width="10" fill="none" stroke-linecap="round"/>
      <path d="M110 46 C168 40 188 104 176 168 C168 222 132 262 106 262 C80 262 46 224 40 170 C32 106 56 50 110 46 Z" fill="url(#g${id})"/>
      <path d="M84 54 C92 34 128 34 138 54 C128 66 94 66 84 54 Z" fill="#355f18"/>
      <g transform="translate(110 154) scale(.93) translate(-110 -154)"><path d="M110 46 C168 40 188 104 176 168 C168 222 132 262 106 262 C80 262 46 224 40 170 C32 106 56 50 110 46 Z" fill="none" stroke="#f3ecd6" stroke-opacity=".38" stroke-width="2" stroke-dasharray="3 7" stroke-linecap="round"/></g>
      <ellipse cx="76" cy="122" rx="11" ry="40" fill="#fff" opacity=".15" transform="rotate(-8 76 122)"/>
      <ellipse cx="66" cy="168" rx="11" ry="7" fill="#ff8a73" opacity=".55"/><ellipse cx="154" cy="168" rx="11" ry="7" fill="#ff8a73" opacity=".55"/>
      ${faces}${taco}${cap}
      <defs><linearGradient id="g${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset=".55" stop-color="${body}"/><stop offset="1" stop-color="${lo}"/></linearGradient></defs>
    </g>`;
  }
  let plushN = 0; // unique gradient ids per rendered instance
  function plush(p, label) {
    const a = p.art, id = p.id + "_" + plushN++;
    let inner;
    if (a.acc === "trio") {
      inner = `<g transform="translate(-6 40) scale(.62)">${plushBody(id + "a", "#5fa02e", "happy", "none")}</g>
        <g transform="translate(130 40) scale(.62)">${plushBody(id + "b", "#6aa83a", "sleepy", "cap")}</g>
        <g transform="translate(62 66) scale(.7)">${plushBody(id + "c", "#d9442b", "cool", "none")}</g>`;
    } else if (a.acc === "jar") {
      inner = `<g transform="translate(34 46) scale(.74)">${plushBody(id, a.body, a.face, "none")}</g>
        <rect x="28" y="48" width="164" height="212" rx="16" fill="#cfe6c0" fill-opacity=".10" stroke="#efe8d6" stroke-opacity=".55" stroke-width="4"/>
        <rect x="46" y="26" width="128" height="26" rx="5" fill="#b8b19a"/><path d="M60 78 V220" stroke="#fff" stroke-opacity=".25" stroke-width="6" stroke-linecap="round"/>`;
    } else inner = plushBody(id, a.body, a.face, a.acc);
    return `<svg viewBox="0 0 220 280" role="img" aria-label="${esc(label === undefined ? p.name : label)}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
  }

  // ---------- Shared chrome ----------
  document.body.insertAdjacentHTML("afterbegin", `
    <header class="site">
      <a class="logo" href="/"><span>pocpe</span><small>soft goods dept.</small></a>
      <nav>${cats.map((c) => `<a href="/category?c=${c}">${c}</a>`).join("")}
        <a class="bag" href="/cart">Bag <b id="cart-count">0</b></a></nav>
    </header>`);
  renderCount();
  const main = $("main");
  const rise = (i) => `style="--i:${i}"`;

  const cardHtml = (p, list, n) => `
    <a class="card r" ${rise(n)} href="/product?id=${p.id}" data-id="${p.id}" data-list="${list.id}">
      <div class="art tone-${n % 4}">${plush(p)}</div>
      <div class="meta"><span class="no">No. ${String(n + 1).padStart(2, "0")}</span>
        <strong>${esc(p.name)}</strong><span class="row2"><span>${esc(p.size)}</span><span>${money(p.price)}</span></span></div>
    </a>`;

  function renderList(list, ps) {
    main.querySelector(".grid").innerHTML = ps.map((p, n) => cardHtml(p, list, n)).join("");
    push("view_item_list", { item_list_id: list.id, item_list_name: list.name, items: ps.map((p, i) => item(p, list, i)) });
    main.querySelectorAll(".card").forEach((a) =>
      a.addEventListener("click", () => {
        const p = byId[a.dataset.id];
        push("select_item", { item_list_id: list.id, item_list_name: list.name, items: [item(p, list, ps.indexOf(p))] });
      }));
  }

  // ---------- Pages ----------
  if (page === "home") {
    const hero = products[0], pal = products[2];
    main.innerHTML = `
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow r" ${rise(0)}>Vol. 01 — Soft goods, lightly spiced</p>
          <h1 class="display r" ${rise(1)}>Soft.<br>A little<br><em>spicy.</em></h1>
          <p class="lede r" ${rise(3)}>Jalapeño plushies for people who like their comfort with a bit of attitude. Squeeze first, ask questions never.</p>
          <p class="cta r" ${rise(4)}><a class="btn" href="/category?c=classics">Shop the patch</a><a class="ulink" href="#featured">See what's fresh ↓</a></p>
        </div>
        <div class="hero-art" aria-hidden="true">
          <div class="mesh"></div>
          <div class="big r" ${rise(2)}>${plush(hero, "")}</div>
          <div class="small r" ${rise(5)}>${plush(pal, "")}</div>
          <svg class="stamp" viewBox="0 0 120 120"><defs><path id="circ" d="M60 60 m-44 0 a44 44 0 1 1 88 0 a44 44 0 1 1 -88 0"/></defs>
            <text><textPath href="#circ" textLength="272" lengthAdjust="spacing">HAND-SQUEEZED · MILDLY SPICY · </textPath></text></svg>
        </div>
      </section>
      <div class="ticker" aria-hidden="true"><div><span>Soft</span><span>Squishy</span><span>Slightly spicy</span><span>Soft</span><span>Squishy</span><span>Slightly spicy</span><span>Soft</span><span>Squishy</span><span>Slightly spicy</span></div></div>
      <section id="featured" class="block">
        <div class="head"><p class="eyebrow">Fresh off the vine</p><h2>The first four.</h2></div>
        <div class="grid feature"></div>
      </section>
      <section class="block index-block">
        <div class="head"><p class="eyebrow">Browse by size</p><h2>Pick a bunch.</h2></div>
        <ol class="index">${cats.map((c, i) => `<li><a href="/category?c=${c}"><span class="n">0${i + 1}</span><span class="t">${c}</span><span class="d">${catBlurb[c] || ""}</span><span class="arr">→</span></a></li>`).join("")}</ol>
      </section>`;
    renderList({ id: "featured", name: "Featured" }, products.slice(0, 4));
  }

  if (page === "category") {
    const c = new URLSearchParams(location.search).get("c") || cats[0];
    const ps = products.filter((p) => p.category === c);
    main.innerHTML = `<div class="page-head"><p class="eyebrow r" ${rise(0)}>Collection — ${String(ps.length).padStart(2, "0")} pieces</p>
      <h1 class="display r" ${rise(1)}>${esc(c)}</h1><p class="lede r" ${rise(2)}>${catBlurb[c] || ""}</p></div><div class="grid"></div>`;
    renderList({ id: c, name: c }, ps);
  }

  if (page === "product") {
    const p = byId[new URLSearchParams(location.search).get("id")] || products[0];
    main.innerHTML = `<article class="pdp">
      <div class="pdp-art r" ${rise(0)}><div class="art tone-1">${plush(p)}</div><span class="tag">${esc(p.size)}</span></div>
      <div class="pdp-info">
        <p class="eyebrow r" ${rise(1)}><a href="/category?c=${p.category}">${esc(p.category)}</a> / ${esc(p.id)}</p>
        <h1 class="display r" ${rise(2)}>${esc(p.name)}</h1>
        <p class="lede r" ${rise(3)}>${esc(p.blurb)}</p>
        <p class="price r" ${rise(4)}>${money(p.price)}</p>
        <p class="r" ${rise(5)}><button id="add">Add to cart</button></p>
        <dl class="spec r" ${rise(6)}><div><dt>Size</dt><dd>${esc(p.size)}</dd></div><div><dt>Brand</dt><dd>${esc(p.brand)}</dd></div><div><dt>Ships</dt><dd>Details at checkout</dd></div></dl>
      </div></article>`;
    push("view_item", { currency: C.currency, value: p.price, items: [item(p, null, 0)] });
    $("#add").onclick = () => {
      const c = getCart(); c[p.id] = (c[p.id] || 0) + 1; setCart(c);
      push("add_to_cart", { currency: C.currency, value: p.price, items: [item(p, null, 0)] });
      setTimeout(() => (location.href = "/cart"), 300); // let the add_to_cart hit leave before navigating
    };
  }

  if (page === "cart") {
    const items = cartItems();
    if (!items.length) main.innerHTML = `<div class="page-head"><p class="eyebrow r" ${rise(0)}>Your bag</p><h1 class="display r" ${rise(1)}>Empty<br><em>so far.</em></h1>
      <p class="lede r" ${rise(2)}>Nothing in here yet. <a class="ulink" href="/">Go find something soft.</a></p></div>`;
    else {
      main.innerHTML = `<div class="page-head"><p class="eyebrow r" ${rise(0)}>Your bag</p><h1 class="display r" ${rise(1)}>Cart</h1></div>
        <div class="lines">${items.map((i, n) => `<div class="line r" ${rise(n + 2)}>
          <div class="art tone-${n % 4}">${plush(byId[i.item_id])}</div>
          <div><strong>${esc(i.item_name)}</strong><span class="mut">${esc(byId[i.item_id].size)} · qty ${i.quantity}</span></div>
          <div class="amt">${money(i.price * i.quantity)}</div>
          <button class="ghost" data-rm="${i.item_id}">Remove</button></div>`).join("")}</div>
        <div class="totalbar"><span class="mut">Total</span><strong>${money(cartTotal())}</strong><a class="btn" href="/checkout">Checkout</a></div>`;
      push("view_cart", { currency: C.currency, value: cartTotal(), items });
      main.querySelectorAll("[data-rm]").forEach((b) => b.onclick = () => {
        const id = b.dataset.rm, c = getCart(), it = cartItems().find((x) => x.item_id === id);
        push("remove_from_cart", { currency: C.currency, value: it.price * it.quantity, items: [it] });
        delete c[id]; setCart(c); setTimeout(() => location.reload(), 300);
      });
    }
  }

  if (page === "checkout") {
    const items = cartItems();
    if (!items.length) return (location.href = "/cart");
    main.innerHTML = `<div class="page-head"><p class="eyebrow r" ${rise(0)}>Almost soft</p><h1 class="display r" ${rise(1)}>Checkout</h1></div>
      <div class="co">
      <form id="f" class="r" ${rise(2)}>
        <fieldset><legend>Contact</legend>
          <label>Email<input name="email" type="email" autocomplete="email" required></label>
          <label>Phone (optional)<input name="phone" type="tel" autocomplete="tel"></label></fieldset>
        <fieldset><legend>Ship to</legend>
          <div class="two"><label>First name<input name="first_name" autocomplete="given-name" required></label>
          <label>Last name<input name="last_name" autocomplete="family-name" required></label></div>
          <label>Street address<input name="street" autocomplete="address-line1" required></label>
          <div class="two"><label>City<input name="city" autocomplete="address-level2" required></label>
          <label>State / region<input name="region" autocomplete="address-level1"></label></div>
          <div class="two"><label>Postal code<input name="postal_code" autocomplete="postal-code" required></label>
          <label>Country (ISO)<input name="country" value="US" maxlength="2" autocomplete="country" required></label></div></fieldset>
        <label class="check"><input type="checkbox" name="optin"> Email me news and drops (you can change this any time)</label>
        <p class="mut">Demo checkout: no real payment is taken and nothing is shipped.</p>
        <button>Place order</button>
      </form>
      <aside class="sum r" ${rise(3)}><p class="eyebrow">In your bag</p>
        ${items.map((i, n) => `<div class="mini"><div class="art tone-${n % 4}">${plush(byId[i.item_id])}</div><span>${esc(i.item_name)}<small class="mut"> × ${i.quantity}</small></span><b>${money(i.price * i.quantity)}</b></div>`).join("")}
        <div class="totalbar"><span class="mut">Total</span><strong>${money(cartTotal())}</strong></div></aside></div>`;
    const ecom = { currency: C.currency, value: cartTotal(), items };
    push("begin_checkout", ecom);
    let shipped = false;
    $("#f").addEventListener("focusin", () => { if (!shipped) { shipped = true; push("add_shipping_info", { ...ecom, shipping_tier: "standard" }); } }, { once: true });
    $("#f").onsubmit = (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      push("add_payment_info", { ...ecom, payment_type: "demo" });
      if (d.optin) fetch("/api/preferences", { method: "POST", headers: { "content-type": "application/json" }, keepalive: true,
        body: JSON.stringify({ email: d.email, topics: ["new_releases", "offers"], source: "checkout", visitor_id: W.pocpeConsent?.visitorId }) }).catch(() => {});
      const order = { transaction_id: "T-" + Date.now(), user: d, ecom };
      sessionStorage.setItem("order", JSON.stringify(order));
      localStorage.removeItem("cart");
      location.href = "/thankyou";
    };
  }

  if (page === "thankyou") {
    const raw = sessionStorage.getItem("order");
    if (!raw) return (location.href = "/");
    const o = JSON.parse(raw);
    main.innerHTML = `<div class="page-head"><p class="eyebrow r" ${rise(0)}>Order ${esc(o.transaction_id)}</p>
      <h1 class="display r" ${rise(1)}>Order<br><em>received.</em></h1>
      <p class="lede r" ${rise(2)}>Thank you. A receipt is on its way to ${esc(o.user.email)}. Your jalapeño is packing its tiny bags.</p>
      <p class="cta r" ${rise(3)}><a class="btn" href="/">Keep browsing</a></p></div>`;
    // Fire purchase once. transaction_id is the dedup key for GA4; event_id for Meta CAPI.
    if (!sessionStorage.getItem("purchase_sent:" + o.transaction_id)) {
      sessionStorage.setItem("purchase_sent:" + o.transaction_id, "1");
      push("purchase", { ...o.ecom, transaction_id: o.transaction_id, tax: 0, shipping: 0 }, {
        // Raw values: the server container hashes them (SHA-256) before sending to ad platforms.
        user_data: {
          email: o.user.email, phone_number: o.user.phone || undefined,
          address: { first_name: o.user.first_name, last_name: o.user.last_name, country: o.user.country,
                     street: o.user.street, city: o.user.city, region: o.user.region, postal_code: o.user.postal_code }
        }
      });
    }
  }
})();
