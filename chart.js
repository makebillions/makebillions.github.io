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

const MARKER_BUY_COLOR  = "#22c55e";  // --green from design system
const MARKER_SELL_COLOR = "#ef4444";  // --red from design system

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

    // Default window: ~28 days ending shortly after the most recent signal.
    // Signals can lag the latest candle by days when calc hasn't been rerun —
    // anchoring to the last candle would push them off-screen. But if signals
    // are *older* than the candle window (stale data), fall back to the last
    // candle so the chart isn't anchored to an empty range.
    const firstCandleT = data.candles[0].time;
    const lastCandleT = data.candles[lastIndex].time;
    const signalTimes = [
        ...(data.alerts || []).map((a) => a.time),
        ...(data.events || []).map((e) => e.time),
    ];
    const lastSignalT = signalTimes.length ? Math.max(...signalTimes) : null;
    const rightPad = 3600 * 24 * 2;
    const anchor =
        lastSignalT && lastSignalT >= firstCandleT
            ? Math.min(lastSignalT + rightPad, lastCandleT)
            : lastCandleT;
    chart.timeScale().setVisibleRange({
        from: anchor - 3600 * 24 * 28,
        to: anchor,
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
        if (alert.value === "buy") {
            markers.push({ time: alert.time, position: "belowBar", color: MARKER_BUY_COLOR, shape: "arrowUp", size: 1, text: "" });
        } else if (alert.value === "sell") {
            markers.push({ time: alert.time, position: "aboveBar", color: MARKER_SELL_COLOR, shape: "arrowDown", size: 1, text: "" });
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
    // Full DOM rebuild. Called on stock change + mode/sens change. Resets
    // scroll to the top so the latest signal is visible by default.
    const allowedSens = MODE_SENS[currentMode];
    const filtered = mEvents.filter((e) => e.sens.some((s) => allowedSens.includes(s)));
    renderEvents(filtered);
    eventsList.scrollTop = 0;
}

function renderEvents(events) {
    // Newest-first so the latest signal sits at the top of the overlay.
    const sorted = [...events].sort((a, b) => b.time - a.time);
    eventsList.innerHTML = sorted
        .map((event) => {
            const date = new Date(event.time * 1000);
            const dateStr = String(date.getUTCDate()).padStart(2, "0") + "." + String(date.getUTCMonth() + 1).padStart(2, "0");
            const timeStr = String(date.getUTCHours()).padStart(2, "0") + ":" + String(date.getUTCMinutes()).padStart(2, "0");
            const dirClass = event.dir === "buy" ? "text-green-400/70" : "text-red-400/70";
            const dirArrow = event.dir === "buy" ? "\u25B2" : "\u25BC";
            const iconHtml = event.icon && SIGNAL_ICONS[event.icon] ? SIGNAL_ICONS[event.icon] : "";
            const priceHtml = event.price != null ? `<span class="text-white/40 ml-1">@${event.price}</span>` : "";
            return `
            <div class="event-card" data-time="${event.time}">
                <div class="text-[11px] text-white/35 mb-1">${dateStr} ${timeStr}${priceHtml}</div>
                <div class="text-[13px] text-white/70 leading-snug">
                    ${iconHtml}<span class="${dirClass} mr-1">${dirArrow}</span>${event.text}
                </div>
            </div>`;
        })
        .join("");
}

// Track when the user last scrolled the overlay themselves \u2014 chart-pan
// auto-sync defers to manual scroll for ~2s so we don't yank position.
let _userScrollAt = 0;
const _markUserScroll = () => { _userScrollAt = Date.now(); };
// Manually drive scroll on wheel: the chart canvas sits underneath and
// LightweightCharts attaches its own wheel listeners on the surrounding
// element with preventDefault, which can block native scrolling on
// overlapping siblings. Doing scrollTop += deltaY ourselves bypasses
// that entirely and gives the user a reliable scroll feel.
eventsList.addEventListener("wheel", (e) => {
    eventsList.scrollTop += e.deltaY;
    e.preventDefault();
    _markUserScroll();
}, { passive: false });
eventsList.addEventListener("touchstart", _markUserScroll, { passive: true });

function syncScrollToTimeRange(timeRange) {
    if (!timeRange) return;
    if (Date.now() - _userScrollAt < 2000) return;
    const cards = [...eventsList.querySelectorAll(".event-card")];
    if (!cards.length) return;
    // Cards sorted newest-first; first one whose time \u2264 visible-range end
    // is the latest event currently on-chart \u2014 scroll it into view.
    const target = cards.find((c) => Number(c.dataset.time) <= timeRange.to);
    if (target) {
        eventsList.scrollTop = Math.max(0, target.offsetTop - 8);
    }
}

// Drag-to-scroll on events list (now vertical inside the overlay)
let _dragStart = null;
eventsList.addEventListener("mousedown", (e) => {
    _dragStart = { y: e.pageY, top: eventsList.scrollTop };
    eventsList.style.cursor = "grabbing";
    eventsList.style.userSelect = "none";
});
document.addEventListener("mousemove", (e) => {
    if (!_dragStart) return;
    eventsList.scrollTop = _dragStart.top - (e.pageY - _dragStart.y);
});
document.addEventListener("mouseup", () => {
    _dragStart = null;
    eventsList.style.cursor = "";
    eventsList.style.userSelect = "";
});

// Sync events overlay scroll to chart pan — no DOM rebuild, just scrollTop.
const debouncedTimeRangeCallback = debounce(() => {
    syncScrollToTimeRange(chart.timeScale().getVisibleRange());
}, 150);
chart.timeScale().subscribeVisibleTimeRangeChange(debouncedTimeRangeCallback);

// Click chart candle → scroll events list to closest signal
chart.subscribeClick((param) => {
    if (!param.time) return;
    const items = [...eventsList.querySelectorAll(".event-card")];
    const closest = items.reduce((prev, cur) =>
        Math.abs(Number(cur.dataset.time) - param.time) < Math.abs(Number(prev.dataset.time) - param.time) ? cur : prev
    , items[0]);
    if (closest) eventsList.scrollTo({ top: closest.offsetTop - eventsList.offsetTop - eventsList.offsetHeight / 2, behavior: "smooth" });
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
