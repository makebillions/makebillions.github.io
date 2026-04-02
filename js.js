// page code
function openHelpPopup(section) {
    document.getElementById("helpPopup").style.display = "block";
    if (section) {
        document.querySelector(section).scrollIntoView({ behavior: "smooth" });
    }
}

function closeHelpPopup() {
    document.getElementById("helpPopup").style.display = "none";
}
// Debounce function
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
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
        credentials: "include",
    })
        .then((r) => {
            if (!r.ok) {
                throw new Error("server unavailble");
            }

            return r.json();
        })
        .catch((e) => {
            throw new Error("server unavailble");
        })
        .then((res) => {
            if (res && (res.result || res.data)) {
                return res;
            } else {
                throw res;
            }
        });
}

// --- Signal mode ---
let currentMode = "meaningful";
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

// --- State ---
var mEvents = [];
var allAlerts = [];
let allStocks;
let selectedItems = [],
    isLoggedIn = false;

// --- DOM refs ---
const searchInput = document.getElementById("autocomplete");
const resultsDiv = document.getElementById("autocomplete-results");
const selectedItemsContainer = document.getElementById("selected-items");
const confirmForm = document.getElementById("code-confirmation-form");
const initText = document.getElementById("initial-text");
const afterLogin = document.getElementById("final-result");
const autocompleteContainer = document.getElementById("autocompleteContainer");
const submitAlertsButton = document.getElementById("submit_alerts");
const shimmer = document.getElementById("shimmerLoader");
const eventsList = document.getElementById("eventsList");
const selectionsContainer = document.getElementById("selections");
const modeSwitch = document.getElementById("modeSwitch");
const modeDescription = document.getElementById("modeDescription");

// --- Mode switch handler ---
if (modeSwitch) {
    modeSwitch.addEventListener("click", (e) => {
        const btn = e.target.closest(".mode-btn");
        if (!btn) return;
        const mode = btn.dataset.mode;
        if (mode === currentMode) return;
        currentMode = mode;
        // Update active state
        modeSwitch.querySelectorAll(".mode-btn").forEach((b) => {
            b.classList.toggle("mode-active", b.dataset.mode === mode);
            b.classList.toggle("text-white", b.dataset.mode === mode);
            b.classList.toggle("font-medium", b.dataset.mode === mode);
            b.classList.toggle("text-white/60", b.dataset.mode !== mode);
        });
        if (modeDescription) {
            modeDescription.textContent = MODE_DESC[mode];
        }
        filterAndRenderEvents();
        renderMarkers();
    });
}

// --- Events ---
let currentCandleRange = null; // Track candle date range

function setEvents(data) {
    const rawEvents = data.events || [];
    // Filter events to candle date range if available
    if (currentCandleRange) {
        mEvents = rawEvents.filter(
            (event) =>
                event.time >= currentCandleRange.from &&
                event.time <= currentCandleRange.to
        );
    } else {
        mEvents = rawEvents;
    }
    filterAndRenderEvents();
}

function filterAndRenderEvents() {
    const allowedSens = MODE_SENS[currentMode];
    const filtered = mEvents.filter((e) =>
        e.sens.some((s) => allowedSens.includes(s))
    );
    // Render events and scroll to first visible in chart range
    const timeRange = chart.timeScale().getVisibleRange();
    renderEvents(filtered, timeRange);
}

// Signal icon SVGs — small inline icons for rally, dip, momentum, attention
const SIGNAL_ICONS = {
    rally: `<svg class="inline-block w-4 h-4 mr-1 align-text-bottom" viewBox="0 0 16 16" fill="none"><path d="M8 2l5 6H9v6H7V8H3l5-6z" fill="#22c55e"/></svg>`,
    dip: `<svg class="inline-block w-4 h-4 mr-1 align-text-bottom" viewBox="0 0 16 16" fill="none"><path d="M8 14l-5-6h4V2h2v6h4l-5 6z" fill="#ef4444"/></svg>`,
    momentum: `<svg class="inline-block w-4 h-4 mr-1 align-text-bottom" viewBox="0 0 16 16" fill="none"><path d="M2 12l4-4 2 2 6-7v3h2V1h-5v2h3L9 9 7 7l-5 5z" fill="#f59e0b"/></svg>`,
    attention: `<svg class="inline-block w-4 h-4 mr-1 align-text-bottom" viewBox="0 0 16 16" fill="none"><path d="M8 1l7 13H1L8 1z" fill="#f97316"/><rect x="7.2" y="5.5" width="1.6" height="5" rx=".5" fill="#fff"/><circle cx="8" cy="12" r=".9" fill="#fff"/></svg>`,
};

function renderEvents(events, timeRange = null) {
    const sorted = [...events].sort((a, b) => b.time - a.time);
    eventsList.innerHTML = sorted
        .map((event) => {
            const date = new Date(event.time * 1000);
            const dateStr =
                String(date.getUTCDate()).padStart(2, "0") +
                "." +
                String(date.getUTCMonth() + 1).padStart(2, "0");
            const timeStr =
                String(date.getUTCHours()).padStart(2, "0") +
                ":" +
                String(date.getUTCMinutes()).padStart(2, "0");
            const dirClass =
                event.dir === "buy" ? "text-green-400" : "text-red-400";
            const dirArrow = event.dir === "buy" ? "\u25B2" : "\u25BC";
            const iconHtml =
                event.icon && SIGNAL_ICONS[event.icon]
                    ? SIGNAL_ICONS[event.icon]
                    : "";


            return `
           <div class="event-item flex items-start px-4 py-2 border-b border-white/5 hover:bg-white/5 transition-all duration-300" data-time="${event.time}">
               <div class="flex-shrink-0 w-14 mr-3">
                   <div class="text-xs text-white/50 leading-tight">${dateStr}<br>${timeStr}</div>
               </div>
               <div class="flex-1 text-sm text-white leading-relaxed">
                   ${iconHtml}<span class="${dirClass} mr-1">${dirArrow}</span>${event.text}
               </div>
           </div>
       `;
        })
        .join("");

    // Scroll to first visible event when chart moves
    if (timeRange) {
        const items = document.querySelectorAll(".event-item");
        const firstVisibleItem = Array.from(items).find(
            (item) =>
                timeRange &&
                Number(item.dataset.time) >= timeRange.from &&
                Number(item.dataset.time) <= timeRange.to
        );
        if (firstVisibleItem) {
            eventsList.scrollTop =
                firstVisibleItem.offsetTop - eventsList.offsetTop;
        }
    }
}

function hideListLoader() {
    eventsList.classList.remove("hidden");
    shimmer.classList.add("hidden");
    eventsList.scrollTop = 0; // Scroll to top on initial load
    const items = document.querySelectorAll(".event-item");
    eventsList.classList.remove("opacity-50", "pointer-events-none");
    items.forEach((item, index) => {
        setTimeout(() => {
            item.classList.remove("-translate-y-4", "opacity-0");
        }, index * 100);
    });
}
function showListLoader() {
    shimmer.classList.remove("hidden");
    eventsList.classList.add("hidden", "opacity-50", "pointer-events-none");
    const items = document.querySelectorAll(".event-item");
    items.forEach((item) => {
        item.classList.add("-translate-y-4", "opacity-0");
    });
}

function showLoader() {
    const chart = document.getElementById("chart");
    const loader = document.getElementById("chartLoader");
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    loader.style.width = chart.offsetWidth + "px";
    loader.style.height = chart.offsetHeight + "px";
    const rect = chart.getBoundingClientRect();
    loader.style.top = rect.top + scrollTop + "px";
    loader.style.left = rect.left + "px";
    loader.classList.remove("hidden");
}

function hideLoader() {
    document.getElementById("chartLoader").classList.add("hidden");
}

// const host = process.env.REACT_APP_API;
// const host = "http://localhost:4000";
const host = "https://b40f-45-148-125-176.ngrok-free.app";
function url(url) {
    return `${host}${url}`;
}

// --- API ---
function loadChart(stock) {
    return post(`${url("/api/alerts/chart")}`, { stock }).then((res) => {
        if (res.result) {
            return res.data;
        }
    });
}

function onStockChange() {
    const stock = selectedItems[selectedItems.length - 1]?.ticker;
    if (!stock) return;
    showLoader();
    showListLoader();
    loadChart(stock).then((data) => {
        hideLoader();
        setChart(data);
        // setEvents is called inside setChart after filtering
        hideListLoader();
    });
}

//page.js
function submitFeedback(event) {
    event.preventDefault();
    const feedbackText = document.getElementById("feedbackText").value;

    post(url("/api/feedback"), {
        feedback: feedbackText,
    })
        .then((data) => {
            alert("Thank you for your feedback!");
        })
        .catch((error) => {
            console.error("Error:", error);
            alert(
                "An error occurred while submitting your feedback. Please try again."
            );
        });
}

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
            deleteButton.textContent = "Удалить";
            deleteButton.className =
                "bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg ml-5";
            deleteButton.onclick = () => handleDelete(selection.id);

            selectionDiv.appendChild(deleteButton);
            selectionsContainer.appendChild(selectionDiv);
        });
    }

    const handleSubmit = (e) => {
        e.preventDefault();
        const stocks = selectedItems;
        if (!stocks.length) {
            alert("set something");
            return;
        }
        const data = {
            alertType: 0,
            stock: stocks,
        };

        if (isLoggedIn)
            post(url("/api/algos/new"), { algo: data, otherData: {} })
                .then((r) => {
                    setSelections(r.payload);
                    alert(
                        "Подписка выполнена! Отписаться можно внизу страницы или в БОТе."
                    );
                })
                .catch((e) => {
                    alert(e);
                });
        else alert("Please login");
    };

    const handleDelete = (id) => {
        post(url("/api/algos/del"), { id })
            .then((r) => {
                setSelections(r.payload);
                alert("Удалено!");
            })
            .catch((e) => {
                alert(e);
            });
    };

    const confirmClick = async (code) => {
        const res = await post(url("/api/setUser"), {
            code,
        });
        if (res.result) {
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

    post(url("/api/algos"))
        .then((res) => {
            setIsLoggedIn(true);
            setSelections(res.payload);
        })
        .catch((e) => {});
    post(url("/api/stocks")).then((r) => {
        setStocks(r.payload);
        // Pick sber and mtss as default stocks
        const sber = r.payload.find((s) => s.ticker.toLowerCase() === "sber");
        const mtss = r.payload.find((s) => s.ticker.toLowerCase() === "mtss");
        if (sber && mtss) {
            setStock([sber, mtss]);
        } else if (r.payload.length > 1) {
            setStock([r.payload[0], r.payload[1]]);
        }
    });
})();
function setStock(arr) {
    selectedItems = arr;
    renderSelectedItems();
    onStockChange();
}
function setStocks(arr) {
    allStocks = arr;
}
function setIsLoggedIn(v) {
    isLoggedIn = v;
    if (v) {
        initText.style.display = "none";
        confirmForm.style.display = "none";
        afterLogin.style.display = "block";
    }
}

// autocomplete.js
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

function renderSelectedItems() {
    selectedItemsContainer.innerHTML = "";
    selectedItems.forEach((item) => {
        const selectedItemElement = createSelectedItem(item);
        selectedItemsContainer.appendChild(selectedItemElement);
    });
}

const autocompleteHandler = function () {
    const inputVal = this.value.trim();
    resultsDiv.innerHTML = "";
    resultsDiv.style.display = "block";
    let filteredData = inputVal
        ? allStocks.filter((item) =>
              item.ticker.toLowerCase().includes(inputVal.toLowerCase())
          )
        : allStocks;
    // Sort: stocks with hasLlm appear first
    filteredData.sort((a, b) => (b.hasLlm ? 1 : 0) - (a.hasLlm ? 1 : 0));
    filteredData.forEach((item) => {
        const div = document.createElement("div");
        div.className = "p-4 hover:bg-white/20 cursor-pointer";
        div.innerHTML =
            item.ticker +
            (item.hasLlm ? '<span class="stock-llm-badge"></span>' : "");
        div.addEventListener("click", function () {
            if (!selectedItems.find((s) => s.ticker === item.ticker)) {
                selectedItems.push(item);
                renderSelectedItems();
            }
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

//charts.js
const chartContainer = document.getElementById("chart");
var chart = LightweightCharts.createChart(chartContainer, {
    autoSize: true,
    handleScroll: {
        mouseWheel: false,
        pressedMouseMove: true,
        vertTouchDrag: false,
    },
    timeScale: {
        timeVisible: true,
        borderColor: "rgba(0,0,0, 0)",
        barSpacing: 3,
        minBarSpacing: 2,
    },
    rightPriceScale: {
        borderColor: "rgba(0,0,0, 0)",
        scaleMargins: {
            top: 0.1,
            bottom: 0.1,
        },
    },
    layout: {
        background: {
            type: "gradient",
            topColor: "rgba(0,0,0, 0)",
            bottomColor: "rgba(0,0,0, 0)",
        },
        textColor: "rgba(255,255,255, 1)",
        fontSize: 12,
    },
    grid: {
        horzLines: {
            color: "rgba(255,255,255, 0.08)",
        },
        vertLines: {
            color: "rgba(255,255,255, 0.08)",
        },
    },
    crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: {
            color: "rgba(255, 255, 255, 0.5)",
            width: 1,
            style: LightweightCharts.LineStyle.Dashed,
        },
        horzLine: {
            color: "rgba(255, 255, 255, 0.5)",
            width: 1,
            style: LightweightCharts.LineStyle.Dashed,
        },
    },
});

chart.applyOptions({
    handleScale: {
        mouseWheel: false,
        pinch: false,
    },
});

var series = chart.addCandlestickSeries({
    upColor: "rgba(255,255,255,0.15)",
    downColor: "rgba(255,0,0,0.15)",
    wickUpColor: "rgba(255,255,255,0.8)",
    wickDownColor: "rgba(255,0,0,0.8)",
    borderUpColor: "rgba(255,255,255,0.6)",
    borderDownColor: "rgba(255,0,0,0.6)",
    borderVisible: true,
    priceFormat: {
        type: "price",
        precision: 2,
        minMove: 0.01,
    },
});

chart.timeScale().fitContent();
// Subscribe to visible time range changes — sync events list
const debouncedTimeRangeCallback = debounce(() => {
    filterAndRenderEvents();
}, 300);
chart.timeScale().subscribeVisibleTimeRangeChange(debouncedTimeRangeCallback);

// Click on chart — scroll event list to closest signal at or before clicked candle
chart.subscribeClick((param) => {
    if (!param.time) return;
    const clickedTime = param.time;
    const items = eventsList.querySelectorAll(".event-item");
    let closest = null;
    for (const item of items) {
        const t = Number(item.dataset.time);
        if (t <= clickedTime) {
            closest = item;
            break; // items are sorted newest-first, so first match <= clickedTime is closest from left
        }
    }
    if (closest) {
        eventsList.scrollTop =
            closest.offsetTop - eventsList.offsetTop;
    }
});

// Marker colors — improved for dark theme
const markerColorS = {
    t1: "rgba(255, 215, 0, 1)", // Gold — global trend
    t2: "rgba(192, 192, 192, 1)", // Silver
    t3: "rgba(200, 200, 200, 1)", // Light gray
    t4: "rgba(0, 255, 0, 1)", // Green — correction
    t5: "rgba(123, 126, 34, 1)", // Olive — bridge
    t6: "rgba(238, 130, 238, 1)", // Magenta — local
    t7: "rgba(255, 192, 203, 1)", // Pink — local minor
};

function setChart(data) {
    const lastIndex = data.candles.length - 1;
    series.setData(data.candles);

    // Get candle date range for filtering alerts/events
    currentCandleRange = {
        from: data.candles[0].time,
        to: data.candles[lastIndex].time,
    };

    chart.timeScale().setVisibleRange({
        from: data.candles[lastIndex].time - 3600 * 24 * 14,
        to: data.candles[lastIndex].time,
    });

    // Filter alerts to candle date range
    allAlerts = (data.alerts || []).filter(
        (alert) =>
            alert.time >= currentCandleRange.from &&
            alert.time <= currentCandleRange.to
    );

    // Filter and set events to candle date range
    setEvents(data);

    renderMarkers();

    chart.priceScale("right").applyOptions({
        scaleMargins: {
            top: 0,
            bottom: 0,
        },
    });
}

function renderMarkers() {
    const allowedSens = MODE_SENS[currentMode];

    // Filter alerts by current mode sensitivity
    const filtered = allAlerts.filter((alert) => {
        const sens = parseInt(alert.type.replace("t", ""));
        return allowedSens.includes(sens);
    });

    // Merge alerts on same candle time + same direction (e.g. t6 + t7 buy → one marker)
    const merged = {};
    filtered.forEach((alert) => {
        const key = `${alert.time}_${alert.value}`;
        if (!merged[key]) {
            merged[key] = { ...alert, types: [alert.type] };
        } else {
            merged[key].types.push(alert.type);
        }
    });

    const markers = [];
    Object.values(merged).forEach((alert) => {
        // Use highest priority (lowest number) type for color
        const bestType = alert.types.sort()[0];
        const color = markerColorS[bestType] || "rgba(255,255,255,0.5)";

        if (alert.value === "buy") {
            markers.push({
                time: alert.time,
                position: "belowBar",
                color,
                shape: "arrowUp",
                size: 1,
                text: "",
            });
        } else if (alert.value === "sell") {
            markers.push({
                time: alert.time,
                position: "aboveBar",
                color,
                shape: "arrowDown",
                size: 1,
                text: "",
            });
        }
    });

    markers.sort((a, b) => a.time - b.time);
    series.setMarkers(markers);
}
