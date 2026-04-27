// ============================================================
// js.js — App logic: stock selection, auth, subscriptions, API
// Depends on: chart.js (loaded before), agent.js (loaded after)
// Exposes: selectedItems, currentMode, MODE_SENS, debounce(), post(), url(),
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

function post(url, data = {}) {
    return fetch(url, {
        method: "post",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
    })
        .then((r) => { if (!r.ok) throw new Error("server unavailble"); return r.json(); })
        .catch((e) => { throw new Error("server unavailble"); })
        .then((res) => { if (res && (res.result || res.data)) return res; else throw res; });
}

// --- API config ---
const host = "http://localhost:4000";
window.__agentHost = host;
function url(path) { return `${host}${path}`; }

// --- Investor mode (URL param ?investors) ---
const INVESTOR_MODE = new URLSearchParams(window.location.search).has("investors");
window.__investorMode = INVESTOR_MODE;

if (INVESTOR_MODE) {
    // English UI
    document.querySelector(".hero-title").innerHTML =
        'Real-time <span class="gradient-text">trend</span> signals';
    document.querySelector(".hero-title + p").textContent =
        "Trend analytics and Telegram alerts.";
    document.getElementById("autocomplete").placeholder = "Stock...";

    // Preset pills: NVDA, AAPL
    const pillsContainer = document.getElementById("presetPills");
    pillsContainer.innerHTML =
        '<button class="preset-pill" data-ticker="NVDA">NVDA</button>' +
        '<button class="preset-pill" data-ticker="AAPL">AAPL</button>';

    // Hide help nav link, keep feedback
    const navLinks = document.querySelectorAll("header nav .flex.gap-1 a");
    navLinks.forEach((a) => {
        if (a.textContent.trim() === "Справка") a.style.display = "none";
        if (a.textContent.trim() === "Отзыв") a.style.display = "none";
    });

    // Signup section — English
    document.querySelector("#signupSection h2").textContent = "Instructions";
    const initialText = document.getElementById("initial-text");
    initialText.innerHTML =
        '<p>1. Find the bot <a href="https://t.me/buydipru_bot" class="font-medium text-indigo-400 hover:text-indigo-300 transition-colors">buydipru_bot</a> on Telegram and press /start. Enter the code below.</p>' +
        "<p>2. Select one or more stocks.</p>" +
        "<p>3. Configure parameters or leave defaults. The BOT will send alerts during the trading day.</p>" +
        '<p class="text-white/35">You can unsubscribe via the bot interface. The service does not store your personal data.</p>';
    const afterLoginEl = document.getElementById("final-result");
    afterLoginEl.innerHTML =
        '<h2 class="text-base font-semibold text-white mb-2">Logged in</h2>' +
        "<p>1. Select one or more stocks. The chart displays for the last selected stock.</p>" +
        "<p>2. You can configure settings or leave defaults. The chart updates. The BOT will send alerts during the trading day.</p>";
    document.querySelector('#code-confirmation-form input[name="code"]').placeholder = "Code from BOT";
    document.querySelector("#code-confirmation-form button").textContent = "Login";

    // Subscribe button & text
    document.getElementById("submit_alerts").innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" fill="currentColor"></path><path d="M13.73 21a2 2 0 0 1-3.46 0" fill="none"></path></svg>Subscribe';
    document.querySelector("#submit_alerts + p").textContent =
        "By clicking Subscribe, you accept the terms of use. This is not individual investment advice.";
    document.getElementById("selections").textContent = "No alerts yet";

    // Footer
    document.querySelector("footer p").innerHTML =
        '&copy; 2026 &mdash; <b>Risk Warning:</b> Trading financial instruments involves high risks, including the risk of losing part or all of your investment. Information on this site is indicative. The service owner disclaims responsibility for any losses incurred as a result of trades made based on this information.';
}

// --- Signal mode (strategic / meaningful / frequent) ---
let currentMode = "frequent";
const MODE_SENS = {
    strategic: [1, 2, 3, 4],
    meaningful: [1, 2, 3, 4, 5, 6],
    frequent: [1, 2, 3, 4, 5, 6, 7],
};
const MODE_DESC = {
    strategic: "Major trend signals only. Least noise.",
    meaningful: "Trend signals with local moves. Balanced view.",
    frequent: "All signals including minor fluctuations.",
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
            b.classList.toggle("text-white/60", b.dataset.mode !== mode);
        });
        if (modeDescription) modeDescription.textContent = MODE_DESC[mode];
        filterAndRenderEvents();
        renderMarkers();
        renderSignalShortcutsFromEvents();
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
    const stock = selectedItems[selectedItems.length - 1]?.ticker;
    if (!stock) return;
    if (chartStockTitle) chartStockTitle.textContent = stock;
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
    if (comments) { comments.classList.add("hidden"); comments.innerHTML = ""; }
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
    const idx = selectedItems.findIndex((s) => s.ticker.toUpperCase() === ticker.toUpperCase());
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
        autocompleteContainer.dispatchEvent(new CustomEvent("change", { detail: selectedItems }));
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
    let filteredData = inputVal
        ? allStocks.filter((item) => item.ticker.toLowerCase().includes(inputVal.toLowerCase()))
        : allStocks;
    filteredData.sort((a, b) => (b.hasLlm ? 1 : 0) - (a.hasLlm ? 1 : 0));
    filteredData.forEach((item) => {
        const div = document.createElement("div");
        div.className = "p-4 hover:bg-white/20 cursor-pointer";
        div.innerHTML = item.ticker + (item.hasLlm ? '<span class="stock-llm-badge"></span>' : "");
        div.addEventListener("click", function () {
            selectedItems = [item];
            renderSelectedItems();
            updatePresetPillStates();
            searchInput.value = "";
            resultsDiv.style.display = "none";
            autocompleteContainer.dispatchEvent(new CustomEvent("change", { detail: selectedItems }));
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
        const stockObj = stocks.find((s) => s.ticker.toUpperCase() === ticker.toUpperCase());
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
        const isSelected = selectedItems.some((s) => s.ticker.toUpperCase() === ticker);
        pill.classList.toggle("active", isSelected);
    });
}

// ============================================================
// Help popup
// ============================================================
function openHelpPopup(section) {
    document.getElementById("helpPopup").style.display = "block";
    if (section) document.querySelector(section).scrollIntoView({ behavior: "smooth" });
}
function closeHelpPopup() {
    document.getElementById("helpPopup").style.display = "none";
}

// ============================================================
// Feedback
// ============================================================
function submitFeedback(event) {
    event.preventDefault();
    const feedbackText = document.getElementById("feedbackText").value;
    post(url("/api/feedback"), { feedback: feedbackText })
        .then(() => alert("Thank you for your feedback!"))
        .catch(() => alert("An error occurred while submitting your feedback. Please try again."));
}

// ============================================================
// Auth, subscriptions, init
// ============================================================
const AlertMes = {
    0: (alert) => `${alert.stock.map((s) => s.ticker).join(" ")} ${alert.percentage}%`,
};

(async () => {
    function setSelections(selections) {
        selectionsContainer.innerHTML = "";
        selections.forEach((selection) => {
            const selectionDiv = document.createElement("div");
            selectionDiv.textContent = AlertMes[selection.alertType](selection);
            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.textContent = INVESTOR_MODE ? "Delete" : "Удалить";
            deleteButton.className = "bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg ml-5";
            deleteButton.onclick = () => handleDelete(selection.id);
            selectionDiv.appendChild(deleteButton);
            selectionsContainer.appendChild(selectionDiv);
        });
    }

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!selectedItems.length) { alert("set something"); return; }
        if (!isLoggedIn) { alert("Please login"); return; }
        post(url("/api/algos/new"), { algo: { alertType: 0, stock: selectedItems }, otherData: {} })
            .then((r) => { setSelections(r.payload); alert(INVESTOR_MODE ? "Subscribed! You can unsubscribe at the bottom of the page or via the BOT." : "Подписка выполнена! Отписаться можно внизу страницы или в БОТе."); })
            .catch((e) => alert(e));
    };

    const handleDelete = (id) => {
        post(url("/api/algos/del"), { id })
            .then((r) => { setSelections(r.payload); alert(INVESTOR_MODE ? "Deleted!" : "Удалено!"); })
            .catch((e) => alert(e));
    };

    const confirmClick = async (code) => {
        const res = await post(url("/api/setUser"), { code });
        if (res.result) setIsLoggedIn(true);
        return res;
    };

    confirmForm.addEventListener("submit", function (e) {
        e.preventDefault();
        const code = e.target[0].value;
        document.getElementById("process-indicator").style.display = "block";
        confirmClick(code)
            .then(() => { document.getElementById("process-indicator").style.display = "none"; })
            .catch((e) => { document.getElementById("process-indicator").style.display = "none"; alert(e.error); });
    });

    submitAlertsButton.addEventListener("click", handleSubmit);

    // Load session & stocks
    post(url("/api/algos"))
        .then((res) => { setIsLoggedIn(true); setSelections(res.payload); })
        .catch(() => {});

    post(url("/api/stocks"), INVESTOR_MODE ? { market: "us" } : {}).then((r) => {
        setStocks(r.payload);
        if (INVESTOR_MODE) {
            const nvda = r.payload.find((s) => s.ticker === "NVDA");
            if (nvda) setStock([nvda]);
            else if (r.payload.length) setStock([r.payload[0]]);
        } else {
            const mtss = r.payload.find((s) => s.ticker.toLowerCase() === "mtss");
            if (mtss) setStock([mtss]);
            else if (r.payload.length) setStock([r.payload[0]]);
        }
        initPresetPills(r.payload);
    });
})();
