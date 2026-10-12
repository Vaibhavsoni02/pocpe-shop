(async () => {
  const C = window.POCPE, W = window;
  const page = document.body.dataset.page;
  const $ = (s) => document.querySelector(s);
  const money = (n) => "$" + n.toFixed(2);
  const eid = () => crypto.randomUUID(); // shared id -> browser/server dedup (Meta, GA4)

  // ---------- Data layer ----------
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

  // ---------- GTM web container ----------
  // Standard snippet. Cloudflare Google Tag Gateway rewrites the googletagmanager.com
  // URL to the first-party measurement path at the edge.
  if (C.gtmId) {
    W.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtm.js?id=" + C.gtmId;
    document.head.appendChild(s);
  }

  // ---------- Catalog + cart ----------
  const products = await (await fetch("/products.json")).json();
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  const cats = [...new Set(products.map((p) => p.category))];
  const img = (p) => `style="background:linear-gradient(135deg,hsl(${p.hue} 70% 55%),hsl(${(p.hue + 50) % 360} 70% 35%))"`;

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

  // ---------- Shared chrome ----------
  document.body.insertAdjacentHTML("afterbegin", `
    <header>
      <a class="logo" href="/">pocpe shop</a>
      <nav>${cats.map((c) => `<a href="/category?c=${c}">${c}</a>`).join("")}
        <a href="/cart">Cart (<span id="cart-count">0</span>)</a></nav>
    </header>`);
  renderCount();
  const main = $("main");

  const cardHtml = (p, list) => `
    <a class="card" href="/product?id=${p.id}" data-id="${p.id}" data-list="${list.id}">
      <div class="img" ${img(p)}></div>
      <div class="meta"><strong>${p.name}</strong><br><small>${p.brand}</small><br>${money(p.price)}</div>
    </a>`;

  function renderList(list, ps) {
    main.querySelector(".grid").innerHTML = ps.map((p) => cardHtml(p, list)).join("");
    push("view_item_list", { item_list_id: list.id, item_list_name: list.name, items: ps.map((p, i) => item(p, list, i)) });
    main.querySelectorAll(".card").forEach((a) =>
      a.addEventListener("click", () => {
        const p = byId[a.dataset.id];
        push("select_item", { item_list_id: list.id, item_list_name: list.name, items: [item(p, list, ps.indexOf(p))] });
      }));
  }

  // ---------- Pages ----------
  if (page === "home") {
    main.innerHTML = `<h1>Design assets, ready to ship.</h1>
      <p class="pills row">${cats.map((c) => `<a href="/category?c=${c}">${c}</a>`).join("")}</p>
      <h2>Featured</h2><div class="grid"></div>`;
    renderList({ id: "featured", name: "Featured" }, products.slice(0, 4));
  }

  if (page === "category") {
    const c = new URLSearchParams(location.search).get("c") || cats[0];
    main.innerHTML = `<h1 style="text-transform:capitalize">${c}</h1><div class="grid"></div>`;
    renderList({ id: c, name: c }, products.filter((p) => p.category === c));
  }

  if (page === "product") {
    const p = byId[new URLSearchParams(location.search).get("id")] || products[0];
    main.innerHTML = `<div class="pdp"><div class="hero-img" ${img(p)}></div>
      <div><h1>${p.name}</h1><p>${p.brand} · ${p.category}</p><h2>${money(p.price)}</h2>
      <button id="add">Add to cart</button></div></div>`;
    push("view_item", { currency: C.currency, value: p.price, items: [item(p, null, 0)] });
    $("#add").onclick = () => {
      const c = getCart(); c[p.id] = (c[p.id] || 0) + 1; setCart(c);
      push("add_to_cart", { currency: C.currency, value: p.price, items: [item(p, null, 0)] });
      location.href = "/cart";
    };
  }

  if (page === "cart") {
    const items = cartItems();
    if (!items.length) main.innerHTML = `<h1>Cart</h1><p>Your cart is empty. <a href="/">Keep browsing</a></p>`;
    else {
      main.innerHTML = `<h1>Cart</h1><table>${items.map((i) => `
        <tr><td>${i.item_name}</td><td>${i.quantity} × ${money(i.price)}</td>
        <td><button class="ghost" data-rm="${i.item_id}">Remove</button></td></tr>`).join("")}</table>
        <p><strong>Total ${money(cartTotal())}</strong></p><a class="btn" href="/checkout">Checkout</a>`;
      push("view_cart", { currency: C.currency, value: cartTotal(), items });
      main.querySelectorAll("[data-rm]").forEach((b) => b.onclick = () => {
        const id = b.dataset.rm, c = getCart(), it = cartItems().find((x) => x.item_id === id);
        push("remove_from_cart", { currency: C.currency, value: it.price * it.quantity, items: [it] });
        delete c[id]; setCart(c); location.reload();
      });
    }
  }

  if (page === "checkout") {
    const items = cartItems();
    if (!items.length) return (location.href = "/cart");
    main.innerHTML = `<h1>Checkout</h1><form id="f">
      <label>Email<input name="email" type="email" required></label>
      <label>First name<input name="first_name" required></label>
      <label>Last name<input name="last_name" required></label>
      <label>Country (ISO)<input name="country" value="US" maxlength="2" required></label>
      <label>Phone<input name="phone" type="tel"></label>
      <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="optin" style="width:auto;margin:0"> Email me news and offers (you can change this any time)</label>
      <p>Demo checkout: no real payment is taken.</p>
      <p><strong>Total ${money(cartTotal())}</strong></p>
      <button>Place order</button></form>`;
    const ecom = { currency: C.currency, value: cartTotal(), items };
    push("begin_checkout", ecom);
    let shipped = false;
    $("#f").addEventListener("focusin", () => { if (!shipped) { shipped = true; push("add_shipping_info", { ...ecom, shipping_tier: "digital" }); } }, { once: true });
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
    main.innerHTML = `<h1>Thank you!</h1><p>Order <strong>${o.transaction_id}</strong> confirmed. A receipt was sent to ${o.user.email}.</p>
      <a class="btn" href="/">Continue shopping</a>`;
    // Fire purchase once. transaction_id is the dedup key for GA4; event_id for Meta CAPI/Pixel.
    if (!sessionStorage.getItem("purchase_sent:" + o.transaction_id)) {
      sessionStorage.setItem("purchase_sent:" + o.transaction_id, "1");
      push("purchase", { ...o.ecom, transaction_id: o.transaction_id, tax: 0, shipping: 0 }, {
        // Raw values: the server container hashes them (SHA-256) before sending to ad platforms.
        user_data: {
          email: o.user.email, phone_number: o.user.phone || undefined,
          address: { first_name: o.user.first_name, last_name: o.user.last_name, country: o.user.country }
        }
      });
    }
  }
})();
