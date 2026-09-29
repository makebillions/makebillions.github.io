// ============================================================
// js.js — App logic: stock selection, auth, subscriptions, API
// Depends on: chart.js (loaded before), agent.js (loaded after)
// Exposes: selectedItems, currentMode, MODE_TIERS, debounce(), post(), url(),
//          window.__allStocks, window.__setStockFromAgent, window.__highlightSelectedStock
// ============================================================

// --- Utilities ---
function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

// Auth token (from /api/setUser) + anonymous id, both in localStorage.
// Every API call carries them; the server resolves uid from the token.
function getAnonId() {
    let id = localStorage.getItem("anonId");
    if (!id) {
        id = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
        localStorage.setItem("anonId", id);
    }
    return id;
}

function post(url, data = {}) {
    const headers = {
        "Content-Type": "application/json",
        "serveo-skip-browser-warning": "true",
        "x-anon-id": getAnonId(),
    };
    const token = localStorage.getItem("authToken");
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return fetch(url, {
        method: "post",
        headers,
        body: JSON.stringify(data),
        credentials: "include",
    })
        .then((r) => {
            if (!r.ok) throw new Error("server unavailble");
            return r.json();
        })
        .catch((e) => {
            throw new Error("server unavailble");
        })
        .then((res) => {
            if (res && (res.result || res.data)) return res;
            else throw res;
        });
}

// --- API config ---
// A local copy talks to the local API, the published site to production, so
// publishing needs no edit. window.__apiHost overrides both (the test harness).
const host = window.__apiHost ||
    (["localhost", "127.0.0.1", ""].includes(location.hostname)
        ? "http://localhost:4000" : "https://api.deepdip.tech");
window.__agentHost = host;
function url(path) {
    return `${host}${path}`;
}

// --- Language ---
// English only. There used to be a `?ru` mode that rewrote ~10 elements
// (the login box, two placeholders, the footer) on an otherwise fully
// English page — hero, live desk, screener, trust, pricing and both popups
// were never translated — so it kept a second copy of a fraction of the
// copy and rendered a half-Russian page. Removed rather than completed.

// --- Signal mode (strategic / meaningful) ---
// The service ships two tiers, so there are two modes. The old third mode
// ("frequent") filtered for a tier that never leaves the engine.
let currentMode = "meaningful";
const MODE_TIERS = {
    strategic: ["S"],
    meaningful: ["S", "M"],
};
const MODE_DESC = {
    strategic: "Major turns only. Least noise.",
    meaningful: "Every alert we'd send you. Balanced view.",
};

// --- App state ---
let allStocks;
let selectedItems = [];
let isLoggedIn = false;

// --- DOM refs ---
const searchInput = document.getElementById("autocomplete");
const resultsDiv = document.getElementById("autocomplete-results");
const selectedItemsContainer = document.getElementById("selected-items");
const confirmForm = document.getElementById("code-confirmation-form");
const initText = document.getElementById("initial-text");
const afterLogin = document.getElementById("final-result");
const autocompleteContainer = document.getElementById("autocompleteContainer");
const submitAlertsButton = document.getElementById("submit_alerts");
const modeSwitch = document.getElementById("modeSwitch");
const modeDescription = document.getElementById("modeDescription");
const chartStockTitle = document.getElementById("chartStockTitle");

// ============================================================
// Mode switch
// ============================================================
if (modeSwitch) {
    modeSwitch.addEventListener("click", (e) => {
        const btn = e.target.closest(".mode-btn");
        if (!btn) return;
        const mode = btn.dataset.mode;
        if (mode === currentMode) return;
        currentMode = mode;
        modeSwitch.querySelectorAll(".mode-btn").forEach((b) => {
            b.classList.toggle("mode-active", b.dataset.mode === mode);
            b.classList.toggle("text-white", b.dataset.mode === mode);
            b.classList.toggle("font-medium", b.dataset.mode === mode);
            b.classList.toggle("text-ink/60", b.dataset.mode !== mode);
        });
        if (modeDescription) modeDescription.textContent = MODE_DESC[mode];
        // Mode now only controls marker density (by tier). The feed and
        // shortcuts are tier-independent, so don't rebuild them here.
        renderMarkers();
    });
}

// ============================================================
// Stock selection & chart loading
// ============================================================
function loadChart(stock) {
    return post(`${url("/api/alerts/chart")}`, { stock }).then((res) => {
        if (res.result) return res.data;
    });
}

function onStockChange() {
    const sel = selectedItems[selectedItems.length - 1];
    const stock = sel?.ticker;
    if (!stock) return;
    if (chartStockTitle) {
        const name = sel?.name && sel.name !== stock ? sel.name : "";
        chartStockTitle.innerHTML = name
            ? `${stock} <span class="text-ink/40 text-base font-normal ml-1">${name}</span>`
            : stock;
    }
    // the subscription panel offers whatever stock is on the chart
    if (window.__updateSubAddButton) window.__updateSubAddButton();
    clearAgentState();
    showLoader();
    // The alerts are frozen text and owe the chart nothing, so they are drawn
    // immediately and never hidden while it loads. Hiding them meant a failed
    // chart fetch — python down, or one ticker with no series — left the
    // visitor a spinning chart and no words at all, which is backwards: the
    // chart is the reference and the words are the product.
    if (window.__renderRecord) window.__renderRecord();
    loadChart(stock)
        .then((data) => {
            if (data) setChart(data);
        })
        .catch(() => {
            // nothing to draw; the alerts beside it still stand
        })
        .finally(() => {
            hideLoader();
            hideListLoader();
        });
}

function clearAgentState() {
    const actionBar = document.getElementById("agentActionBar");
    const comments = document.getElementById("agentComments");
    if (actionBar) actionBar.classList.add("hidden");
    if (comments) {
        comments.classList.add("hidden");
        comments.innerHTML = "";
    }
}

function setStock(arr) {
    selectedItems = arr;
    renderSelectedItems();
    updatePresetPillStates();
    onStockChange();
}

function setStocks(arr) {
    allStocks = arr;
    window.__allStocks = arr;
}

function setIsLoggedIn(v) {
    isLoggedIn = v;
    window.__isLoggedIn = v; // read by chart.js (anon chat limit)
    if (v) {
        initText.style.display = "none";
        confirmForm.style.display = "none";
        afterLogin.style.display = "block";
    }
}

// ============================================================
// Expose helpers for agent.js
// ============================================================
window.__allStocks = allStocks;

// Agent sets selected stocks without triggering chart reload
window.__setStockFromAgent = function (stockArr) {
    selectedItems = stockArr;
    renderSelectedItems();
    updatePresetPillStates();
};

// Agent highlights a specific stock as active (moves it to last position)
window.__highlightSelectedStock = function (ticker) {
    const idx = selectedItems.findIndex(
        (s) => s.ticker.toUpperCase() === ticker.toUpperCase()
    );
    if (idx >= 0 && idx !== selectedItems.length - 1) {
        const item = selectedItems.splice(idx, 1)[0];
        selectedItems.push(item);
        renderSelectedItems();
        updatePresetPillStates();
    }
};

// ============================================================
// Autocomplete & selected items
// ============================================================
autocompleteContainer.addEventListener("change", debounce(onStockChange, 500));

function createSelectedItem(item) {
    const span = document.createElement("span");
    span.className = "selected-item" + (item.hasLlm ? " has-llm" : "");
    span.textContent = item.ticker.slice(0, 8);
    span.onclick = function () {
        selectedItems = selectedItems.filter((i) => i.ticker !== item.ticker);
        renderSelectedItems();
        autocompleteContainer.dispatchEvent(
            new CustomEvent("change", { detail: selectedItems })
        );
    };
    return span;
}

function getPresetTickers() {
    const pills = document.querySelectorAll(".preset-pill");
    const tickers = new Set();
    pills.forEach((p) => tickers.add(p.dataset.ticker.toUpperCase()));
    return tickers;
}

// Only render non-preset stocks as removable pills
function renderSelectedItems() {
    selectedItemsContainer.innerHTML = "";
    const presets = getPresetTickers();
    selectedItems.forEach((item) => {
        if (presets.has(item.ticker.toUpperCase())) return;
        selectedItemsContainer.appendChild(createSelectedItem(item));
    });
}

const autocompleteHandler = function () {
    const inputVal = this.value.trim();
    resultsDiv.innerHTML = "";
    resultsDiv.style.display = "block";
    const q = inputVal.toLowerCase();
    let filteredData = inputVal
        ? allStocks.filter(
              (item) =>
                  item.ticker.toLowerCase().includes(q) ||
                  (item.name && item.name.toLowerCase().includes(q))
          )
        : allStocks;
    filteredData.sort((a, b) => (b.hasLlm ? 1 : 0) - (a.hasLlm ? 1 : 0));
    filteredData.forEach((item) => {
        const div = document.createElement("div");
        div.className =
            "p-4 hover:bg-ink/5 cursor-pointer flex items-baseline gap-2";
        const nameHtml =
            item.name && item.name !== item.ticker
                ? `<span class="text-ink/50 text-sm truncate">${item.name}</span>`
                : "";
        div.innerHTML = `<span>${item.ticker}</span>${nameHtml}${
            item.hasLlm ? '<span class="stock-llm-badge"></span>' : ""
        }`;
        div.addEventListener("click", function () {
            // A searched name is not in the frozen week, so the words beside
            // the chart have to be the live ones.
            if (window.__forceLiveTab) window.__forceLiveTab();
            selectedItems = [item];
            renderSelectedItems();
            updatePresetPillStates();
            searchInput.value = "";
            resultsDiv.style.display = "none";
            autocompleteContainer.dispatchEvent(
                new CustomEvent("change", { detail: selectedItems })
            );
        });
        resultsDiv.appendChild(div);
    });
};
searchInput.addEventListener("input", autocompleteHandler);
searchInput.addEventListener("click", autocompleteHandler);
document.addEventListener("click", function (e) {
    if (!searchInput.contains(e.target) && !resultsDiv.contains(e.target)) {
        resultsDiv.style.display = "none";
    }
});

// ============================================================
// Preset pills (single-select)
// ============================================================
function initPresetPills(stocks) {
    const pills = document.querySelectorAll(".preset-pill");
    pills.forEach((pill) => {
        const ticker = pill.dataset.ticker;
        const stockObj = stocks.find(
            (s) => s.ticker.toUpperCase() === ticker.toUpperCase()
        );
        updatePresetPillStates();
        pill.addEventListener("click", () => {
            if (!stockObj) return;
            selectedItems = [stockObj];
            renderSelectedItems();
            updatePresetPillStates();
            onStockChange();
        });
    });
}

function updatePresetPillStates() {
    const pills = document.querySelectorAll(".preset-pill");
    pills.forEach((pill) => {
        const ticker = pill.dataset.ticker.toUpperCase();
        const isSelected = selectedItems.some(
            (s) => s.ticker.toUpperCase() === ticker
        );
        pill.classList.toggle("active", isSelected);
    });
}

// ============================================================
// Mobile navigation
// The links are hidden below the md breakpoint, so without this the nav
// simply disappears on a phone — and most visitors arrive from a Telegram
// message on one.
// ============================================================
const navToggle = document.getElementById("navToggle");
const navMenu = document.getElementById("navMenu");
if (navToggle && navMenu) {
    navToggle.addEventListener("click", () => {
        const open = navMenu.classList.toggle("hidden") === false;
        navToggle.setAttribute("aria-expanded", String(open));
    });
    // a jump to a section should close the menu behind it
    navMenu.addEventListener("click", (e) => {
        if (e.target.closest("a")) {
            navMenu.classList.add("hidden");
            navToggle.setAttribute("aria-expanded", "false");
        }
    });
}

// ============================================================
// Help popup
// ============================================================
function openHelpPopup(section) {
    document.getElementById("helpPopup").style.display = "block";
    if (section)
        document.querySelector(section).scrollIntoView({ behavior: "smooth" });
}
function closeHelpPopup() {
    document.getElementById("helpPopup").style.display = "none";
}

// ============================================================
// Greeting popup (Get started)
// ============================================================
function openGreetingPopup() {
    document.getElementById("greetingPopup").classList.remove("hidden");
}
function closeGreetingPopup() {
    document.getElementById("greetingPopup").classList.add("hidden");
}

// ============================================================
// Feedback
// ============================================================
function submitFeedback(event) {
    event.preventDefault();
    const feedbackText = document.getElementById("feedbackText").value;
    post(url("/api/feedback"), { feedback: feedbackText })
        .then(() => alert("Thank you for your feedback!"))
        .catch(() =>
            alert(
                "An error occurred while submitting your feedback. Please try again."
            )
        );
}

// ============================================================
// RU visitor notice — connection here is throttled without a VPN
// ============================================================
let __vpnNoticeDismissed = false;
function maybeShowVpnNotice() {
    if (__vpnNoticeDismissed || document.getElementById("vpnNotice")) return;
    const bar = document.createElement("div");
    bar.id = "vpnNotice";
    // Static (not fixed) so it pushes the sticky header down instead of
    // covering it; new-design violet.
    bar.style.cssText =
        "padding:10px 16px;background:#6366f1;color:#fff;" +
        "font-size:14px;font-weight:500;text-align:center;";
    bar.innerHTML =
        "Соединение медленное — возможно, провайдер ограничивает доступ. Для корректной работы графиков рекомендуем включить VPN." +
        ' <span style="cursor:pointer;margin-left:12px;text-decoration:underline;" onclick="window.__dismissVpnNotice()">Скрыть</span>';
    document.body.prepend(bar);
}
function hideVpnNotice() {
    const el = document.getElementById("vpnNotice");
    if (el) el.remove();
}
window.__dismissVpnNotice = function () {
    __vpnNoticeDismissed = true;
    hideVpnNotice();
};

// ============================================================
// Auth, subscriptions, init
// ============================================================
// ============================================================
// The subscription — ONE record ({stocks, tier, status}), read whole and
// written whole. It is deliberately NOT `selectedItems`: browsing a chart is
// not the same act as asking to be alerted on that stock, and conflating them
// meant clicking around the chart quietly changed what you were paying
// attention to. Saving is idempotent — the old endpoint APPENDED, so pressing
// Subscribe twice gave you two identical subscriptions.
// ============================================================
let account = null;
let batches = [];

/** `moex20` -> "MOEX top 20". The API speaks in ids, a person reads names. */
function batchLabel(name) {
    const m = /^(moex|us)(\d+)$/.exec(name || "");
    return m ? `${m[1] === "us" ? "US" : "MOEX"} top ${m[2]}` : name;
}

(async () => {
    // Batches are stored on the account BY REFERENCE — never expanded into the
    // stock list, or "top 20" would freeze on the day you subscribed.
    function renderBatches() {
        const box = document.getElementById("subBatches");
        if (!box) return;
        if (!isLoggedIn || !account) {
            box.innerHTML = '<span class="sub-empty">Log in to pick a batch.</span>';
            return;
        }
        box.innerHTML = batches
            .map((b) => {
                const on = (account.groups || []).includes(b.name);
                return (
                    `<button type="button" class="sub-chip${on ? "" : " paused"}" ` +
                    `data-batch="${b.name}">${on ? "✓ " : "+ "}${batchLabel(b.name)}` +
                    `<span class="x">${b.size}</span></button>`
                );
            })
            .join("");
    }

    function renderSubscription() {
        const stocksBox = document.getElementById("subStocks");
        const chip = document.getElementById("subStatusChip");
        const pauseBtn = document.getElementById("subPause");
        const hint = document.getElementById("subHint");
        if (!stocksBox) return;

        if (!isLoggedIn || !account) {
            stocksBox.innerHTML =
                '<span class="sub-empty">Log in to turn alerts on.</span>';
            chip.classList.add("hidden");
            return;
        }

        const paused = account.status === "paused";
        stocksBox.innerHTML = account.stocks.length
            ? account.stocks
                  .map(
                      (t) =>
                          `<span class="sub-chip${paused ? " paused" : ""}">${t}` +
                          `<span class="x" data-drop="${t}" title="Remove">&times;</span></span>`
                  )
                  .join("")
            : (account.groups || []).length
            ? `<span class="sub-empty">Covered by ${account.groups
                  .map(batchLabel)
                  .join(", ")} — add single names here too.</span>`
            : `<span class="sub-empty">No stocks yet — add the one you're looking at.</span>`;

        chip.classList.remove("hidden");
        chip.className =
            "inline-flex items-center gap-1.5 text-[11px] font-bold rounded-full px-2.5 py-1 " +
            (paused
                ? "text-ink/50 bg-ink/5 border border-ink/12"
                : "text-up bg-up-bg border border-up-edge");
        chip.textContent = paused ? "paused" : "on";
        pauseBtn.textContent = paused ? "Resume alerts" : "Pause all alerts";
        hint.textContent = paused
            ? "Alerts are paused. Your stocks are kept."
            : "Alerts arrive on Telegram the moment something happens.";

        const tierInput = document.querySelector(
            `#subTier input[value="${account.tier}"]`
        );
        if (tierInput) tierInput.checked = true;
        updateAddButton();
        renderBatches();
    }

    // The button offers the stock currently on the chart — and refuses the
    // ones the service does not watch, instead of accepting the subscription
    // and then never sending anything (IMOEX had 10 subscribers and could not
    // produce a single alert).
    function updateAddButton() {
        const btn = document.getElementById("subAddCurrent");
        const label = document.getElementById("subAddLabel");
        if (!btn) return;
        const cur = selectedItems[selectedItems.length - 1];
        if (!cur || !isLoggedIn || !account) {
            btn.disabled = true;
            label.textContent = "Add this stock";
            return;
        }
        const t = cur.ticker.toUpperCase();
        if (!cur.watched) {
            btn.disabled = true;
            label.textContent = `${t} — not watched yet`;
        } else if (account.stocks.includes(t)) {
            btn.disabled = true;
            label.textContent = `${t} already added`;
        } else {
            btn.disabled = false;
            label.textContent = `Add ${t}`;
        }
    }
    window.__updateSubAddButton = updateAddButton;

    function saveSubscription(patch = {}) {
        const body = {
            stocks: account.stocks,
            groups: account.groups || [],
            tier: account.tier,
            status: account.status,
            ...patch,
        };
        return post(url("/api/subscription/set"), body)
            .then((r) => {
                account = r.payload;
                renderSubscription();
                const saved = document.getElementById("subSaved");
                if (saved) {
                    saved.classList.remove("hidden");
                    setTimeout(() => saved.classList.add("hidden"), 1800);
                }
            })
            .catch((e) => alert(e?.error || e));
    }

    document.getElementById("subStocks")?.addEventListener("click", (e) => {
        const t = e.target.dataset?.drop;
        if (!t) return;
        saveSubscription({ stocks: account.stocks.filter((s) => s !== t) });
    });

    // First batch defaults to major turns only: 30 stocks on "every alert" is
    // ~45 messages a day, and 43% of users already reached for the kill switch
    // at four stocks.
    document.getElementById("subBatches")?.addEventListener("click", (e) => {
        const name = e.target.closest("[data-batch]")?.dataset?.batch;
        if (!name || !account) return;
        const on = (account.groups || []).includes(name);
        const groups = on
            ? account.groups.filter((g) => g !== name)
            : [...(account.groups || []), name];
        const firstBig = !on && !account.stocks.length && groups.length === 1;
        saveSubscription(firstBig ? { groups, tier: "S" } : { groups });
    });

    document.getElementById("subAddCurrent")?.addEventListener("click", () => {
        const cur = selectedItems[selectedItems.length - 1];
        if (!cur) return;
        saveSubscription({
            stocks: [...account.stocks, cur.ticker.toUpperCase()],
        });
    });

    document.getElementById("subTier")?.addEventListener("change", (e) => {
        if (e.target.name === "subTier") saveSubscription({ tier: e.target.value });
    });

    document.getElementById("subPause")?.addEventListener("click", () => {
        saveSubscription({
            status: account.status === "paused" ? "active" : "paused",
        });
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!isLoggedIn) {
            document
                .getElementById("signupSection")
                .scrollIntoView({ behavior: "smooth" });
            return;
        }
        saveSubscription();
    };

    const confirmClick = async (code) => {
        const res = await post(url("/api/setUser"), { code });
        if (res.result) {
            if (res.token) localStorage.setItem("authToken", res.token);
            setIsLoggedIn(true);
            await loadSubscription();
        }
        return res;
    };

    // The batch list comes from the same source the bot uses, so the two can
    // never offer different sets.
    if (document.getElementById("subBatches")) {
        post(url("/api/batches"))
            .then((r) => {
                batches = r.payload || [];
                renderBatches();
            })
            .catch(() => {});
    }

    function loadSubscription() {
        return post(url("/api/subscription"))
            .then((r) => {
                setIsLoggedIn(true);
                account = r.payload || {
                    stocks: [],
                    groups: [],
                    tier: "M",
                    status: "active",
                    plan: "free",
                };
                renderSubscription();
            })
            .catch(() => {
                account = null;
                renderSubscription();
            });
    }

    confirmForm.addEventListener("submit", function (e) {
        e.preventDefault();
        const code = e.target[0].value;
        document.getElementById("process-indicator").style.display = "block";
        confirmClick(code)
            .then(() => {
                document.getElementById("process-indicator").style.display =
                    "none";
            })
            .catch((e) => {
                document.getElementById("process-indicator").style.display =
                    "none";
                alert(e.error);
            });
    });

    // The account panel lives on the settings page now, so this button is not
    // on the landing page — bind only if some page still carries it.
    submitAlertsButton?.addEventListener("click", handleSubmit);

    // Load session & stocks
    loadSubscription();

    // If the stocks call is slow, the provider is likely throttling — show the
    // VPN notice optimistically, then reconcile once geo is known: keep it for
    // RU, drop it for anyone else (e.g. slow but not throttled).
    const slowTimer = setTimeout(maybeShowVpnNotice, 2500);
    // One unified universe regardless of UI language.
    post(url("/api/stocks"), {}).then(
        (r) => {
            clearTimeout(slowTimer);
            if (r.geo === "RU") maybeShowVpnNotice();
            else hideVpnNotice();
            setStocks(r.payload);
            // The first preset pill opens the record, so the default lives in
            // the HTML alone.
            const first = document.querySelector("#presetPills .preset-pill")?.dataset.ticker;
            const def = r.payload.find((s) => s.ticker === first);
            if (def) setStock([def]);
            else if (r.payload.length) setStock([r.payload[0]]);
            initPresetPills(r.payload);
        }
    );
})();
