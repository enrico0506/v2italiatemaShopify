(() => {
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const formatMoney = (cents) => {
    const currency = document.body?.dataset?.tsCurrency || "EUR";
    const locale = document.body?.dataset?.tsLocale || "en";
    const amount = Number(cents || 0) / 100;
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${currency}`;
    }
  };

  const syncScrollLock = () => {
    const hasOpenOverlay = Boolean(qs("[data-ts-drawer]:not([hidden]), [data-ts-modal]:not([hidden])"));
    document.documentElement.classList.toggle("ts-no-scroll", hasOpenOverlay);
  };

  const setExpanded = (button, expanded) => {
    if (!button) return;
    button.setAttribute("aria-expanded", expanded ? "true" : "false");
  };

  const openDrawer = (name) => {
    const drawer = qs(`[data-ts-drawer="${name}"]`);
    if (!drawer) return;

    qsa("[data-ts-modal]").forEach((m) => {
      m.hidden = true;
    });

    qsa("[data-ts-drawer]").forEach((d) => {
      if (d !== drawer) d.hidden = true;
    });
    drawer.hidden = false;

    qsa("[data-ts-drawer-open]").forEach((btn) => {
      setExpanded(btn, btn.getAttribute("data-ts-drawer-open") === name);
    });

    const focusable = drawer.querySelector("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
    if (focusable) focusable.focus();
    syncScrollLock();
  };

  const closeDrawer = (drawer) => {
    if (!drawer) return;
    drawer.hidden = true;
    qsa("[data-ts-drawer-open]").forEach((btn) => setExpanded(btn, false));
    syncScrollLock();
  };

  const openModal = (id) => {
    const modal = document.getElementById(id);
    if (!modal) return;
    qsa("[data-ts-drawer]").forEach((d) => {
      d.hidden = true;
    });
    qsa("[data-ts-drawer-open]").forEach((btn) => setExpanded(btn, false));

    qsa("[data-ts-modal]").forEach((m) => {
      if (m !== modal) m.hidden = true;
    });
    modal.hidden = false;
    syncScrollLock();

    const focusable = modal.querySelector("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
    if (focusable) focusable.focus();
  };

  const closeModal = (modal) => {
    if (!modal) return;
    modal.hidden = true;
    syncScrollLock();
  };

  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;

    const drawerOpenButton = target.closest("[data-ts-drawer-open]");
    if (drawerOpenButton) return openDrawer(drawerOpenButton.getAttribute("data-ts-drawer-open"));

    const drawerCloseTrigger = target.closest("[data-ts-drawer-close]");
    if (drawerCloseTrigger) return closeDrawer(drawerCloseTrigger.closest("[data-ts-drawer]"));

    const modalOpenButton = target.closest("[data-ts-modal-open]");
    if (modalOpenButton) return openModal(modalOpenButton.getAttribute("data-ts-modal-open"));

    const modalCloseTrigger = target.closest("[data-ts-modal-close]");
    if (modalCloseTrigger) return closeModal(modalCloseTrigger.closest("[data-ts-modal]"));
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const openModalEl = qs("[data-ts-modal]:not([hidden])");
    if (openModalEl) return closeModal(openModalEl);
    const openDrawerEl = qs("[data-ts-drawer]:not([hidden])");
    if (openDrawerEl) return closeDrawer(openDrawerEl);
  });

  ["shopify:section:load", "shopify:section:unload", "shopify:section:select", "shopify:section:deselect", "shopify:block:select", "shopify:block:deselect"].forEach(
    (eventName) => document.addEventListener(eventName, syncScrollLock),
  );

  syncScrollLock();

  const updateCartCount = (count) => {
    const bubble = qs("[data-ts-cart-count]");
    if (!bubble) return;
    const n = Number(count || 0);
    bubble.textContent = String(n);
    bubble.hidden = n <= 0;
  };

  const refreshCartDrawer = async () => {
    const cartUrl = document.body?.dataset?.tsCartUrl || "/cart";
    const currentDrawer = document.getElementById("TsCartDrawer");
    if (!currentDrawer) return;

    try {
      const res = await fetch(`${cartUrl}?section_id=cart-drawer`, { headers: { Accept: "text/html" } });
      if (!res.ok) return;
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const newDrawer = doc.getElementById("TsCartDrawer");
      if (!newDrawer) return;

      const currentContent = qs("[data-ts-cart-drawer-content]", currentDrawer);
      const newContent = qs("[data-ts-cart-drawer-content]", newDrawer);
      if (currentContent && newContent) currentContent.innerHTML = newContent.innerHTML;

      const newCount = newDrawer.dataset.tsCartCountValue;
      if (newCount != null) updateCartCount(newCount);
    } catch {
      // no-op
    }
  };

  document.addEventListener("submit", async (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (!form.matches("[data-ts-add-to-cart-form]")) return;

    e.preventDefault();

    const action = form.getAttribute("action") || document.body?.dataset?.tsCartAddUrl || "/cart/add";
    const endpoint = action.endsWith(".js") ? action : `${action}.js`;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new FormData(form),
      });

      if (!res.ok) throw new Error("Add to cart failed");

      await refreshCartDrawer();
      openDrawer("cart");
    } catch {
      form.submit();
    }
  });

  const initCookieConsent = () => {
    const banner = qs("[data-ts-cookie-banner]");
    if (!banner) return;

    const api = window.Shopify && Shopify.customerPrivacy ? Shopify.customerPrivacy : null;
    const STORAGE_KEY = "trapscuro_consent_v1";

    const readStored = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    };

    const writeStored = (state) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // no-op
      }
    };

    const shouldShow = () => {
      if (api && typeof api.shouldShowBanner === "function") {
        try {
          return api.shouldShowBanner();
        } catch {
          // fall through
        }
      }
      return !readStored();
    };

    const applyConsent = (state) => {
      writeStored(state);
      banner.hidden = true;

      const prefsModal = document.getElementById("TsCookiePrefs");
      if (prefsModal) prefsModal.hidden = true;
      syncScrollLock();

      if (api && typeof api.setTrackingConsent === "function") {
        try {
          api.setTrackingConsent(Boolean(state.analytics || state.marketing), () => {});
        } catch {
          // no-op
        }
      }

      try {
        window.dispatchEvent(new CustomEvent("trapscuro:consent", { detail: state }));
      } catch {
        // no-op
      }
    };

    const stored = readStored();
    const analyticsInput = qs("[data-ts-cookie-analytics]");
    const marketingInput = qs("[data-ts-cookie-marketing]");

    if (analyticsInput) analyticsInput.checked = Boolean(stored?.analytics);
    if (marketingInput) marketingInput.checked = Boolean(stored?.marketing);

    const acceptBtn = qs("[data-ts-cookie-accept]");
    const rejectBtn = qs("[data-ts-cookie-reject]");
    const saveBtn = qs("[data-ts-cookie-save]");

    acceptBtn?.addEventListener("click", () =>
      applyConsent({ analytics: true, marketing: true, source: "banner", timestamp: Date.now() }),
    );
    rejectBtn?.addEventListener("click", () =>
      applyConsent({ analytics: false, marketing: false, source: "banner", timestamp: Date.now() }),
    );
    saveBtn?.addEventListener("click", () =>
      applyConsent({
        analytics: Boolean(analyticsInput?.checked),
        marketing: Boolean(marketingInput?.checked),
        source: "preferences",
        timestamp: Date.now(),
      }),
    );

    if (shouldShow()) banner.hidden = false;
  };

  initCookieConsent();

  const initProduct = (productRoot) => {
    const variantsScript = qs("[data-ts-variants]", productRoot);
    const variantIdInput = qs("[data-ts-variant-id]", productRoot);
    if (!variantsScript || !variantIdInput) return;

    let variants = [];
    try {
      variants = JSON.parse(variantsScript.textContent || "[]");
    } catch {
      return;
    }

    const optionGroups = qsa("[data-ts-option]", productRoot).sort(
      (a, b) => Number(a.dataset.optionIndex || "0") - Number(b.dataset.optionIndex || "0"),
    );

    const getSelectedOptions = () =>
      optionGroups.map((group) => {
        const checked = qs("input[type='radio']:checked", group);
        return checked ? checked.value : null;
      });

    const updateVariantUI = (variant) => {
      variantIdInput.value = String(variant.id);

      const priceWrap = qs("[data-ts-product-price]", productRoot);
      if (priceWrap) {
        const current = qs(".ts-price__current", priceWrap);
        const compare = qs(".ts-price__compare", priceWrap);
        const priceEl = qs(".ts-price", priceWrap);

        if (current) current.textContent = formatMoney(variant.price);
        if (compare && priceEl) {
          const onSale = variant.compare_at_price && variant.compare_at_price > variant.price;
          if (onSale) {
            compare.textContent = formatMoney(variant.compare_at_price);
            compare.hidden = false;
            priceEl.classList.add("is-sale");
          } else {
            compare.textContent = "";
            compare.hidden = true;
            priceEl.classList.remove("is-sale");
          }
        }
      }

      const addButton = qs("[data-ts-add-to-cart]", productRoot);
      if (addButton) {
        const labelAdd = addButton.dataset.labelAdd || addButton.textContent || "Add to cart";
        const labelSoldOut = addButton.dataset.labelSoldout || "Sold out";
        addButton.disabled = !variant.available;
        addButton.textContent = variant.available ? labelAdd : labelSoldOut;
      }

      const badgeWrap = qs("[data-ts-stock-badge]", productRoot);
      if (badgeWrap) {
        const labelInStock = badgeWrap.dataset.labelInStock || "";
        const labelLowStock = badgeWrap.dataset.labelLowStock || "";
        const labelSoldOut = badgeWrap.dataset.labelSoldout || "";
        const threshold = Number(productRoot.dataset.lowStockThreshold || "0");

        if (!variant.available) {
          badgeWrap.innerHTML = `<span class="ts-badge ts-badge--soldout">${labelSoldOut}</span>`;
        } else {
          const tracked = Boolean(variant.inventory_management);
          const qty = Number(variant.inventory_quantity ?? 0);
          const low = tracked && threshold > 0 && qty <= threshold;
          badgeWrap.innerHTML = low
            ? `<span class="ts-badge ts-badge--accent">${labelLowStock}</span>`
            : `<span class="ts-badge">${labelInStock}</span>`;
        }
      }
    };

    const onOptionsChange = () => {
      const selected = getSelectedOptions();
      if (selected.some((v) => v == null)) return;
      const match = variants.find((v) => Array.isArray(v.options) && v.options.every((opt, idx) => opt === selected[idx]));
      if (match) updateVariantUI(match);
    };

    productRoot.addEventListener("change", (e) => {
      if (!(e.target instanceof HTMLInputElement)) return;
      if (!e.target.name.startsWith("options[")) return;
      onOptionsChange();
    });

    onOptionsChange();
  };

  qsa("[data-ts-product]").forEach(initProduct);
})();
