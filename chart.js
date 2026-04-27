// ============================================================
// chart.js — Chart instance, markers, events list, shortcuts
// Depends on: LightweightCharts (global), SIGNAL_ICONS, MODE_SENS, currentMode (from js.js)
// Exposes: chart, series, setChart(), renderMarkers(), scrollChartToTimeLocal(),
//          renderSignalShortcutsFromEvents(), filterAndRenderEvents(),
//          setEvents(), showLoader/hideLoader, showListLoader/hideListLoader,
//          window.__chartState (for agent.js)
// ============================================================

// --- Signal icon SVGs (rally, dip, momentum, attention) ---
const SIGNAL_ICONS = {
    rally: `<svg class="inline-block w-4 h-4 mr-1 align-text-bottom" viewBox="0 0 16 16" fill="none"><path d="M8 2l5 6H9v6H7V8H3l5-6z" fill="#22c55e"/></svg>`,
    dip: `<svg class="inline-block w-4 h-4 mr-1 align-text-bottom" viewBox="0 0 16 16" fill="none"><path d="M8 14l-5-6h4V2h2v6h4l-5 6z" fill="#ef4444"/></svg>`,
    momentum: `<svg class="inline-block w-4 h-4 mr-1 align-text-bottom" viewBox="0 0 16 16" fill="none"><path d="M2 12l4-4 2 2 6-7v3h2V1h-5v2h3L9 9 7 7l-5 5z" fill="#f59e0b"/></svg>`,
    attention: `<svg class="inline-block w-4 h-4 mr-1 align-text-bottom" viewBox="0 0 16 16" fill="none"><path d="M8 1l7 13H1L8 1z" fill="#f97316"/><rect x="7.2" y="5.5" width="1.6" height="5" rx=".5" fill="#fff"/><circle cx="8" cy="12" r=".9" fill="#fff"/></svg>`,
};

// --- Marker colors per signal sensitivity ---
const markerColorS = {
    t1: "rgba(255, 215, 0, 1)",     // Gold — global trend
    t2: "rgba(192, 192, 192, 1)",   // Silver
    t3: "rgba(200, 200, 200, 1)",   // Light gray
    t4: "rgba(0, 255, 0, 1)",       // Green — correction
    t5: "rgba(123, 126, 34, 1)",    // Olive — bridge
    t6: "rgba(238, 130, 238, 1)",   // Magenta — local
    t7: "rgba(255, 192, 203, 1)",   // Pink — local minor
};

// --- Chart state ---
var mEvents = [];
var allAlerts = [];
let currentCandleRange = null;

// --- DOM refs (chart-specific, others in js.js) ---
const shimmer = document.getElementById("shimmerLoader");
const eventsList = document.getElementById("eventsList");
const signalShortcuts = document.getElementById("signalShortcuts");

// ============================================================
// Chart instance (LightweightCharts)
// ============================================================
const chartContainer = document.getElementById("chart");
var chart = LightweightCharts.createChart(chartContainer, {
    autoSize: true,
    handleScroll: {
        mouseWheel: false,
        pressedMouseMove: true,
        vertTouchDrag: false,
    },
    handleScale: {
        mouseWheel: false,
        pinch: false,
    },
    timeScale: {
        timeVisible: true,
        borderColor: "rgba(0,0,0, 0)",
        barSpacing: 3,
        minBarSpacing: 2,
    },
    rightPriceScale: {
        borderColor: "rgba(0,0,0, 0)",
        scaleMargins: { top: 0.1, bottom: 0.1 },
    },
    layout: {
        background: { type: "gradient", topColor: "rgba(0,0,0, 0)", bottomColor: "rgba(0,0,0, 0)" },
        textColor: "rgba(255,255,255, 1)",
        fontSize: 12,
    },
    grid: {
        horzLines: { color: "rgba(255,255,255, 0.08)" },
        vertLines: { color: "rgba(255,255,255, 0.08)" },
    },
    crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: { color: "rgba(255, 255, 255, 0.5)", width: 1, style: LightweightCharts.LineStyle.Dashed },
        horzLine: { color: "rgba(255, 255, 255, 0.5)", width: 1, style: LightweightCharts.LineStyle.Dashed },
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
    priceFormat: { type: "price", precision: 2, minMove: 0.01 },
});

var volumeSeries = chart.addHistogramSeries({
    priceFormat: { type: "volume" },
    priceScaleId: "vol",
    color: "rgba(255,255,255,0.12)",
});
volumeSeries.priceScale().applyOptions({
    scaleMargins: { top: 0.8, bottom: 0 },
});

chart.timeScale().fitContent();

// ============================================================
// Chart data loading — setChart(), renderMarkers()
// ============================================================
function setChart(data) {
    const lastIndex = data.candles.length - 1;
    series.setData(data.candles);

    currentCandleRange = {
        from: data.candles[0].time,
        to: data.candles[lastIndex].time,
    };

    chart.timeScale().setVisibleRange({
        from: data.candles[lastIndex].time - 3600 * 24 * 14,
        to: data.candles[lastIndex].time,
    });

    allAlerts = (data.alerts || []).filter(
        (alert) => alert.time >= currentCandleRange.from && alert.time <= currentCandleRange.to
    );

    if (data.volume && data.volume.length) {
        volumeSeries.setData(data.volume);
    } else {
        volumeSeries.setData([]);
    }

    setEvents(data);
    renderMarkers();
    renderSignalShortcutsFromEvents();

    chart.priceScale("right").applyOptions({ scaleMargins: { top: 0, bottom: 0 } });
}

function renderMarkers() {
    const allowedSens = MODE_SENS[currentMode];

    const filtered = allAlerts.filter((alert) => {
        const sens = parseInt(alert.type.replace("t", ""));
        return allowedSens.includes(sens);
    });

    // Merge alerts on same candle + direction
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
        const bestType = alert.types.sort()[0];
        const color = markerColorS[bestType] || "rgba(255,255,255,0.5)";
        if (alert.value === "buy") {
            markers.push({ time: alert.time, position: "belowBar", color, shape: "arrowUp", size: 1, text: "" });
        } else if (alert.value === "sell") {
            markers.push({ time: alert.time, position: "aboveBar", color, shape: "arrowDown", size: 1, text: "" });
        }
    });

    markers.sort((a, b) => a.time - b.time);
    series.setMarkers(markers);
}

// ============================================================
// Events list (horizontal scroll below chart)
// ============================================================
function setEvents(data) {
    const rawEvents = data.events || [];
    if (currentCandleRange) {
        mEvents = rawEvents.filter(
            (event) => event.time >= currentCandleRange.from && event.time <= currentCandleRange.to
        );
    } else {
        mEvents = rawEvents;
    }
    filterAndRenderEvents();
}

function filterAndRenderEvents() {
    const allowedSens = MODE_SENS[currentMode];
    const filtered = mEvents.filter((e) => e.sens.some((s) => allowedSens.includes(s)));
    const timeRange = chart.timeScale().getVisibleRange();
    renderEvents(filtered, timeRange);
}

function renderEvents(events, timeRange) {
    const sorted = [...events].sort((a, b) => a.time - b.time);
    eventsList.innerHTML = sorted
        .map((event) => {
            const date = new Date(event.time * 1000);
            const dateStr = String(date.getUTCDate()).padStart(2, "0") + "." + String(date.getUTCMonth() + 1).padStart(2, "0");
            const timeStr = String(date.getUTCHours()).padStart(2, "0") + ":" + String(date.getUTCMinutes()).padStart(2, "0");
            const dirClass = event.dir === "buy" ? "text-green-400" : "text-red-400";
            const dirArrow = event.dir === "buy" ? "\u25B2" : "\u25BC";
            const iconHtml = event.icon && SIGNAL_ICONS[event.icon] ? SIGNAL_ICONS[event.icon] : "";
            const priceHtml = event.price != null ? `<span class="text-white/50 ml-1">@${event.price}</span>` : "";
            return `
            <div class="event-card" data-time="${event.time}">
                <div class="text-xs text-white/40 mb-1">${dateStr} ${timeStr}${priceHtml}</div>
                <div class="text-sm text-white leading-snug">
                    ${iconHtml}<span class="${dirClass} mr-1">${dirArrow}</span>${event.text}
                </div>
            </div>`;
        })
        .join("");

    eventsList.scrollLeft = eventsList.scrollWidth;
}

// Drag-to-scroll on events list
let _dragStart = null;
eventsList.addEventListener("mousedown", (e) => {
    _dragStart = { x: e.pageX, left: eventsList.scrollLeft };
    eventsList.style.cursor = "grabbing";
    eventsList.style.userSelect = "none";
});
document.addEventListener("mousemove", (e) => {
    if (!_dragStart) return;
    eventsList.scrollLeft = _dragStart.left - (e.pageX - _dragStart.x);
});
document.addEventListener("mouseup", () => {
    _dragStart = null;
    eventsList.style.cursor = "";
    eventsList.style.userSelect = "";
});

// Sync events list on chart scroll
const debouncedTimeRangeCallback = debounce(() => { filterAndRenderEvents(); }, 300);
chart.timeScale().subscribeVisibleTimeRangeChange(debouncedTimeRangeCallback);

// Click chart candle → scroll events list to closest signal
chart.subscribeClick((param) => {
    if (!param.time) return;
    const items = [...eventsList.querySelectorAll(".event-card")];
    const closest = items.reduce((prev, cur) =>
        Math.abs(Number(cur.dataset.time) - param.time) < Math.abs(Number(prev.dataset.time) - param.time) ? cur : prev
    , items[0]);
    if (closest) eventsList.scrollTo({ left: closest.offsetLeft - eventsList.offsetLeft - eventsList.offsetWidth / 2, behavior: "smooth" });
});

// Click event card → scroll chart to that time
eventsList.addEventListener("click", (e) => {
    const card = e.target.closest(".event-card");
    if (!card) return;
    const t = Number(card.dataset.time);
    if (t) scrollChartToTimeLocal(t);
});

// ============================================================
// Signal shortcuts (icon buttons in chart header, top-right)
// Only for events that have an icon (rally, dip, momentum, attention)
// ============================================================
function renderSignalShortcutsFromEvents() {
    if (!signalShortcuts) return;
    signalShortcuts.innerHTML = "";
    const allowedSens = MODE_SENS[currentMode];
    const withIcons = mEvents.filter(
        (e) => e.icon && SIGNAL_ICONS[e.icon] && e.sens.some((s) => allowedSens.includes(s))
    );
    const recent = [...withIcons].sort((a, b) => b.time - a.time).slice(0, 6);
    recent.reverse();
    recent.forEach((ev) => {
        const btn = document.createElement("button");
        btn.className = "signal-shortcut";
        const date = new Date(ev.time * 1000);
        const label = String(date.getUTCDate()).padStart(2, "0") + "." +
            String(date.getUTCMonth() + 1).padStart(2, "0") + " " +
            String(date.getUTCHours()).padStart(2, "0") + ":" +
            String(date.getUTCMinutes()).padStart(2, "0");
        btn.innerHTML = `${SIGNAL_ICONS[ev.icon]}${label}`;
        btn.addEventListener("click", () => {
            scrollChartToTimeLocal(ev.time);
            signalShortcuts.querySelectorAll(".signal-shortcut").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
        });
        signalShortcuts.appendChild(btn);
    });
}

// ============================================================
// Scroll helpers
// ============================================================
// Scroll chart preserving current zoom level
function scrollChartToTimeLocal(time) {
    const logicalRange = chart.timeScale().getVisibleLogicalRange();
    if (!logicalRange) return;
    const barsVisible = logicalRange.to - logicalRange.from;
    const coord = chart.timeScale().timeToCoordinate(time);
    if (coord === null) return;
    const logicalIdx = chart.timeScale().coordinateToLogical(coord);
    if (logicalIdx === null) return;
    chart.timeScale().setVisibleLogicalRange({
        from: logicalIdx - barsVisible / 2,
        to: logicalIdx + barsVisible / 2,
    });
}

// ============================================================
// Loaders
// ============================================================
function showLoader() {
    const chartEl = document.getElementById("chart");
    const loader = document.getElementById("chartLoader");
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    loader.style.width = chartEl.offsetWidth + "px";
    loader.style.height = chartEl.offsetHeight + "px";
    const rect = chartEl.getBoundingClientRect();
    loader.style.top = rect.top + scrollTop + "px";
    loader.style.left = rect.left + "px";
    loader.classList.remove("hidden");
}

function hideLoader() {
    document.getElementById("chartLoader").classList.add("hidden");
}

function showListLoader() {
    shimmer.classList.remove("hidden");
    eventsList.classList.add("hidden", "opacity-50", "pointer-events-none");
}

function hideListLoader() {
    eventsList.classList.remove("hidden");
    shimmer.classList.add("hidden");
    eventsList.scrollTop = 0;
    eventsList.classList.remove("opacity-50", "pointer-events-none");
}

// ============================================================
// Expose to agent.js via window.__chartState
// ============================================================
window.__chartState = {
    get chart() { return chart; },
    get series() { return series; },
    get allAlerts() { return allAlerts; },
    get currentCandleRange() { return currentCandleRange; },
    setChart,
    renderMarkers,
    loadChart,
    showLoader,
    hideLoader,
    showListLoader,
    hideListLoader,
    setEvents,
    get currentMode() { return currentMode; },
    get MODE_SENS() { return MODE_SENS; },
};
