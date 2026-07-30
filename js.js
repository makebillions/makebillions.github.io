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
// const host = "https://e82a-159-255-38-244.ngrok-free.app";
const host = "https://api.deepdip.tech";
// const host = "http://localhost:4000";
window.__agentHost = host;
function url(path) {
    return `${host}${path}`;
}

// --- Language (English is the default; ?ru switches UI text to Russian) ---
// The page markup is English; RU_MODE swaps the affected pieces to Russian.
// The ticker universe is identical in both languages — only UI text differs.
const RU_MODE = new URLSearchParams(window.location.search).has("ru");
window.__ruMode = RU_MODE;

if (RU_MODE) {
    // Russian UI — hero text and preset pills are kept from index.html (do not overwrite)
    document.getElementById("autocomplete").placeholder = "Акция...";

    document.querySelector("#signupSection h2").textContent = "Инструкция";
    const initialText = document.getElementById("initial-text");
    initialText.innerHTML =
        '<p>1. Откройте бот кнопкой ниже и нажмите Start — он пришлёт код. Введите код в форму.</p>' +
        '<a href="https://t.me/buydipru_bot?start=web" target="_blank" rel="noopener" class="inline-flex items-center gap-2 mt-1 mb-2 px-5 py-2.5 bg-[#229ED9] hover:bg-[#1d8dc2] text-white text-sm font-semibold rounded-full transition-colors no-underline"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>Открыть бот в Telegram</a>' +
        "<p>2. Выберите одну или несколько нужных вам акций.</p>" +
        "<p>3. Настройте параметры или оставьте по умолчанию. БОТ будет слать алерты в течение торгового дня.</p>" +
        '<p class="text-ink/40">Отписаться от алертов можно в его интерфейсе. Сервис не хранит Ваши данные.</p>';
    const afterLoginEl = document.getElementById("final-result");
    afterLoginEl.innerHTML =
        '<h2 class="text-base font-bold text-ink mb-2">Вход выполнен</h2>' +
        "<p>1. Выберите одну или несколько нужных вам акций. Для последней в списке отображается график.</p>" +
        "<p>2. Можете настроить параметры в боксах или оставить по умолчанию. График обновляется. БОТ будет слать алерты в течение торгового дня.</p>";
    document.querySelector(
        '#code-confirmation-form input[name="code"]'
    ).placeholder = "Код от БОТа";
    document.querySelector("#code-confirmation-form button").textContent =
        "Войти";

    document.getElementById("submit_alerts").innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" fill="currentColor"></path><path d="M13.73 21a2 2 0 0 1-3.46 0" fill="none"></path></svg>Подписаться';
    document.querySelector("#submit_alerts + p").textContent =
        "Нажимая на Подписаться, вы принимаете условия использования. Не является индивидуальной инвестиционной рекомендацией.";
    document.getElementById("selections").textContent = "Пока нет уведомлений";

    document.querySelector("footer p").innerHTML =
        "&copy; 2026 &mdash; <b>Предупреждение о риске:</b> Торговля финансовыми инструментами сопряжена с высокими рисками, включая риск потери части или всей суммы инвестиций. Информация на сайте носит ориентировочный характер. Владелец сервиса отказывается от ответственности за любые потери, понесенные в результате торговых сделок, совершенных с оглядкой на указанную информацию.";
}

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
const selectionsContainer = document.getElementById("selections");
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
    clearAgentState();
    showLoader();
    showListLoader();
    loadChart(stock).then((data) => {
        hideLoader();
        setChart(data);
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
const AlertMes = {
    0: (alert) =>
        `${alert.stock.map((s) => s.ticker).join(" ")} ${alert.percentage}%`,
};

(async () => {
    function setSelections(selections) {
        selectionsContainer.innerHTML = "";
        selections.forEach((selection) => {
            const selectionDiv = document.createElement("div");
            selectionDiv.textContent = AlertMes[selection.alertType](selection);
            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.textContent = RU_MODE ? "Удалить" : "Delete";
            deleteButton.className =
                "bg-violet hover:bg-violet-dark text-white font-bold py-2 px-4 rounded-lg ml-5";
            deleteButton.onclick = () => handleDelete(selection.id);
            selectionDiv.appendChild(deleteButton);
            selectionsContainer.appendChild(selectionDiv);
        });
    }

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!selectedItems.length) {
            alert("set something");
            return;
        }
        if (!isLoggedIn) {
            alert("Please login");
            return;
        }
        post(url("/api/algos/new"), {
            algo: { alertType: 0, stock: selectedItems },
            otherData: {},
        })
            .then((r) => {
                setSelections(r.payload);
                alert(
                    RU_MODE
                        ? "Подписка выполнена! Отписаться можно внизу страницы или в БОТе."
                        : "Subscribed! You can unsubscribe at the bottom of the page or via the BOT."
                );
            })
            .catch((e) => alert(e));
    };

    const handleDelete = (id) => {
        post(url("/api/algos/del"), { id })
            .then((r) => {
                setSelections(r.payload);
                alert(RU_MODE ? "Удалено!" : "Deleted!");
            })
            .catch((e) => alert(e));
    };

    const confirmClick = async (code) => {
        const res = await post(url("/api/setUser"), { code });
        if (res.result) {
            if (res.token) localStorage.setItem("authToken", res.token);
            setIsLoggedIn(true);
        }
        return res;
    };

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

    submitAlertsButton.addEventListener("click", handleSubmit);

    // Load session & stocks
    post(url("/api/algos"))
        .then((res) => {
            setIsLoggedIn(true);
            setSelections(res.payload);
        })
        .catch(() => {});

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
            const def = r.payload.find((s) => s.ticker === "AAPL");
            if (def) setStock([def]);
            else if (r.payload.length) setStock([r.payload[0]]);
            initPresetPills(r.payload);
        }
    );
})();
