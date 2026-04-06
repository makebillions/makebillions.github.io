// Dedicated Agent — renders results on the main chart
(function () {
    "use strict";

    // --- State ---
    let agentResults = null;
    let selectedSignal = null;
    let agentAlerts = []; // alerts from agent response, merged into main chart
    let agentMatches = []; // all matches from last agent response
    let currentAgentTicker = null; // currently displayed agent stock

    // --- DOM refs ---
    const form = document.getElementById("agentForm");
    const queryInput = document.getElementById("agentQuery");
    const submitBtn = document.getElementById("agentSubmit");
    const statusEl = document.getElementById("agentStatus");
    const signalShortcuts = document.getElementById("signalShortcuts");
    const agentActionBar = document.getElementById("agentActionBar");
    const agentProceed = document.getElementById("agentProceed");
    const agentRetry = document.getElementById("agentRetry");
    const agentComments = document.getElementById("agentComments");
    const chartSection = document.getElementById("chartSection");
    const chartStockTitle = document.getElementById("chartStockTitle");

    // Signal icon SVGs for shortcut buttons
    const SHORTCUT_ICONS = {
        rally: `<svg viewBox="0 0 16 16" fill="none"><path d="M8 2l5 6H9v6H7V8H3l5-6z" fill="#22c55e"/></svg>`,
        dip: `<svg viewBox="0 0 16 16" fill="none"><path d="M8 14l-5-6h4V2h2v6h4l-5 6z" fill="#ef4444"/></svg>`,
        momentum: `<svg viewBox="0 0 16 16" fill="none"><path d="M2 12l4-4 2 2 6-7v3h2V1h-5v2h3L9 9 7 7l-5 5z" fill="#f59e0b"/></svg>`,
        attention: `<svg viewBox="0 0 16 16" fill="none"><path d="M8 1l7 13H1L8 1z" fill="#f97316"/><rect x="7.2" y="5.5" width="1.6" height="5" rx=".5" fill="#fff"/><circle cx="8" cy="12" r=".9" fill="#fff"/></svg>`,
    };

    function setStatus(text) {
        statusEl.textContent = text;
    }

    // Animate an element with uncover-to-side effect
    // direction: "right" | "left" | "bottom"
    function animateUncover(el, direction) {
        const cls = `anim-uncover-${direction}`;
        el.classList.remove(cls);
        // Force reflow to restart animation
        void el.offsetWidth;
        el.classList.add(cls);
        el.addEventListener("animationend", () => el.classList.remove(cls), { once: true });
    }

    // Animate children with staggered uncover
    function animateChildrenUncover(parent, direction) {
        const children = parent.children;
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            const cls = `anim-uncover-${direction}`;
            child.style.setProperty("--i", i);
            child.classList.remove(cls);
            void child.offsetWidth;
            child.classList.add(cls);
            child.addEventListener("animationend", () => child.classList.remove(cls), { once: true });
        }
    }

    // Scroll chart to a time without changing the zoom/scale
    function scrollChartToTime(cs, time) {
        const ts = cs.chart.timeScale();
        const logicalRange = ts.getVisibleLogicalRange();
        if (!logicalRange) return;
        const barsVisible = logicalRange.to - logicalRange.from;
        const coord = ts.timeToCoordinate(time);
        if (coord === null) return;
        const logicalIdx = ts.coordinateToLogical(coord);
        if (logicalIdx === null) return;
        ts.setVisibleLogicalRange({
            from: logicalIdx - barsVisible / 2,
            to: logicalIdx + barsVisible / 2,
        });
    }

    // Update selected stocks in the top bar to match agent response
    function updateSelectedStocksFromAgent(matches) {
        if (!window.__chartState || !matches.length) return;
        // Access allStocks from global scope
        const allStocks = window.__allStocks || [];
        const newSelected = [];
        for (const match of matches) {
            const stockObj = allStocks.find((s) => s.ticker.toUpperCase() === match.t.toUpperCase());
            if (stockObj) {
                newSelected.push(stockObj);
            } else {
                // Create a minimal stock object if not found in stock list
                newSelected.push({ ticker: match.t });
            }
        }
        if (newSelected.length && typeof window.__setStockFromAgent === "function") {
            window.__setStockFromAgent(newSelected);
        }
    }

    // --- API helpers ---
    function postJson(url, data) {
        return fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
            credentials: "include",
        }).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        });
    }

    function apiUrl(path) {
        return `${window.__agentHost || "http://localhost:4000"}${path}`;
    }

    window.__agentHost = window.__agentHost || "http://localhost:4000";

    // --- Parse fuzzy timestamp from LLM ("Feb 13", "Mar 04 10:00") to unix ---
    function parseFuzzyTs(tsStr, candles) {
        if (!candles || !candles.length) return null;

        const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
        const m = tsStr.trim().match(/^(\w{3})\s+(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/i);
        if (!m) return null;

        const mon = months[m[1].toLowerCase()];
        if (mon === undefined) return null;
        const day = parseInt(m[2]);
        const hour = m[3] ? parseInt(m[3]) : 12;
        const min = m[4] ? parseInt(m[4]) : 0;

        const refDate = new Date(candles[candles.length - 1].time * 1000);
        const target = new Date(Date.UTC(refDate.getUTCFullYear(), mon, day, hour, min));
        const targetUnix = Math.floor(target.getTime() / 1000);

        let best = null;
        let bestDist = Infinity;
        for (const c of candles) {
            const dist = Math.abs(c.time - targetUnix);
            if (dist < bestDist) {
                bestDist = dist;
                best = c.time;
            }
        }
        return best;
    }

    // Determine icon type for a signal based on keywords in explanation
    function guessIcon(explanation) {
        if (!explanation) return null;
        const e = explanation.toLowerCase();
        if (e.includes("rally") || e.includes("bullish") || e.includes("uptrend")) return "rally";
        if (e.includes("dip") || e.includes("bearish") || e.includes("downtrend") || e.includes("drop")) return "dip";
        if (e.includes("momentum") || e.includes("acceleration") || e.includes("breakout")) return "momentum";
        if (e.includes("reversal") || e.includes("attention") || e.includes("warning")) return "attention";
        return null;
    }

    // --- Render agent results on the main chart ---
    async function renderAgentOnMainChart(matches) {
        // Process each matched stock: load chart data, display first stock on main chart
        // with signal shortcut buttons and comments

        if (!matches.length) return;

        agentMatches = matches;

        // Update selected stocks in the top bar
        updateSelectedStocksFromAgent(matches);

        // For first match, load on main chart. Others get shortcut buttons.
        const firstMatch = matches[0];
        const ticker = firstMatch.t;
        currentAgentTicker = ticker;

        // Update chart title with animation
        if (chartStockTitle) {
            chartStockTitle.textContent = ticker;
            animateUncover(chartStockTitle, "right");
        }

        const cs = window.__chartState;
        cs.showLoader();
        cs.showListLoader();

        try {
            const chartRes = await postJson(apiUrl("/api/alerts/chart"), { stock: ticker });
            if (!chartRes.data) return;

            const chartData = chartRes.data;
            const candles = chartData.candles || [];

            // Set chart data through the same business logic (merge, filter)
            cs.setChart(chartData);
            cs.hideLoader();
            cs.hideListLoader();

            // Resolve timestamps for all matches
            const allResolvedSignals = [];
            for (const match of matches) {
                const matchCandles = match.t === ticker ? candles : null;
                // For non-first stocks, we'll add shortcut buttons but display on chart if selected
                (match.ts || []).forEach((tsStr) => {
                    const t = matchCandles ? parseFuzzyTs(tsStr, matchCandles) : null;
                    allResolvedSignals.push({
                        ticker: match.t,
                        label: tsStr,
                        time: t,
                        explanation: match.e,
                        quality: match.q,
                        icon: guessIcon(match.e),
                    });
                });
            }

            // Render signal shortcut buttons in chart header with staggered uncover animation
            signalShortcuts.innerHTML = "";
            const firstTickerSignals = allResolvedSignals.filter((s) => s.ticker === ticker && s.time);
            firstTickerSignals.forEach((sig, idx) => {
                const btn = document.createElement("button");
                btn.className = "signal-shortcut anim-uncover-right";
                btn.style.setProperty("--i", idx);
                const iconSvg = sig.icon && SHORTCUT_ICONS[sig.icon] ? SHORTCUT_ICONS[sig.icon] : "";
                btn.innerHTML = `${iconSvg}${sig.label}`;
                btn.addEventListener("click", () => {
                    scrollChartToTime(cs, sig.time);
                    signalShortcuts.querySelectorAll(".signal-shortcut").forEach((b) => b.classList.remove("active"));
                    btn.classList.add("active");
                    selectedSignal = sig;
                });
                signalShortcuts.appendChild(btn);
            });

            // Add agent timestamp markers (circles) on top of existing markers
            const agentMarkers = firstTickerSignals.map((sig) => ({
                time: sig.time,
                position: "aboveBar",
                color: "rgba(99, 102, 241, 1)",
                shape: "circle",
                text: sig.label,
                size: 1.5,
            }));

            // Merge agent markers with existing chart markers
            if (agentMarkers.length) {
                const existingMarkers = buildCurrentMarkers(cs);
                const merged = [...existingMarkers, ...agentMarkers].sort((a, b) => a.time - b.time);
                cs.series.setMarkers(merged);

                // Scroll to first agent marker — keep current scale
                scrollChartToTime(cs, firstTickerSignals[0].time);
            }

            // Render comments below chart with animation
            renderAgentComments(matches);

            // Show action bar with uncover animation
            agentActionBar.classList.remove("hidden");
            animateUncover(agentActionBar, "bottom");

            // Scroll to chart
            chartSection.scrollIntoView({ behavior: "smooth", block: "start" });

        } catch (err) {
            cs.hideLoader();
            setStatus("Failed to load chart data");
        }
    }

    // Load a different agent match onto the main chart
    async function loadStockOnChart(match) {
        const cs = window.__chartState;
        const ticker = match.t;
        currentAgentTicker = ticker;
        if (chartStockTitle) chartStockTitle.textContent = ticker;
        if (typeof window.__highlightSelectedStock === "function") {
            window.__highlightSelectedStock(ticker);
        }
        cs.showLoader();

        try {
            const chartRes = await postJson(apiUrl("/api/alerts/chart"), { stock: ticker });
            if (!chartRes.data) return;

            cs.setChart(chartRes.data);
            cs.hideLoader();

            const candles = chartRes.data.candles || [];
            const resolvedTimes = (match.ts || []).map((tsStr) => ({
                label: tsStr,
                time: parseFuzzyTs(tsStr, candles),
                icon: guessIcon(match.e),
            })).filter((s) => s.time);

            // Update shortcut buttons for this stock
            signalShortcuts.innerHTML = "";
            resolvedTimes.forEach((sig) => {
                const btn = document.createElement("button");
                btn.className = "signal-shortcut";
                const iconSvg = sig.icon && SHORTCUT_ICONS[sig.icon] ? SHORTCUT_ICONS[sig.icon] : "";
                btn.innerHTML = `${iconSvg}${sig.label}`;
                btn.addEventListener("click", () => {
                    scrollChartToTime(cs, sig.time);
                    signalShortcuts.querySelectorAll(".signal-shortcut").forEach((b) => b.classList.remove("active"));
                    btn.classList.add("active");
                    selectedSignal = { ticker, time: sig.time, label: sig.label };
                });
                signalShortcuts.appendChild(btn);
            });

            // Agent markers
            const agentMarkers = resolvedTimes.map((sig) => ({
                time: sig.time,
                position: "aboveBar",
                color: "rgba(99, 102, 241, 1)",
                shape: "circle",
                text: sig.label,
                size: 1.5,
            }));

            if (agentMarkers.length) {
                const existingMarkers = buildCurrentMarkers(cs);
                const merged = [...existingMarkers, ...agentMarkers].sort((a, b) => a.time - b.time);
                cs.series.setMarkers(merged);

                scrollChartToTime(cs, resolvedTimes[0].time);
            }
        } catch (err) {
            cs.hideLoader();
        }
    }

    // Build markers from current alert state (same logic as renderMarkers in js.js)
    function buildCurrentMarkers(cs) {
        const markerColorS = {
            t1: "rgba(255, 215, 0, 1)",
            t2: "rgba(192, 192, 192, 1)",
            t3: "rgba(200, 200, 200, 1)",
            t4: "rgba(0, 255, 0, 1)",
            t5: "rgba(123, 126, 34, 1)",
            t6: "rgba(238, 130, 238, 1)",
            t7: "rgba(255, 192, 203, 1)",
        };

        const allowedSens = cs.MODE_SENS[cs.currentMode];
        const filtered = (cs.allAlerts || []).filter((alert) => {
            const sens = parseInt(alert.type.replace("t", ""));
            return allowedSens.includes(sens);
        });

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

        return markers;
    }

    // Render agent comments below the chart with staggered uncover animation
    function renderAgentComments(matches) {
        agentComments.innerHTML = "";
        agentComments.classList.remove("hidden");

        matches.forEach((match) => {
            const div = document.createElement("div");
            div.className = "agent-comment agent-comment-clickable";
            if (match.t === currentAgentTicker) div.classList.add("agent-comment-active");
            const qualityBadge = match.q ? `<span class="text-xs text-white/30 ml-2">${match.q}/5</span>` : "";
            div.innerHTML = `<span class="ticker">${match.t}</span>${qualityBadge} &mdash; ${match.e || ""}`;
            div.addEventListener("click", () => {
                loadStockOnChart(match);
                currentAgentTicker = match.t;
                // Update active state on comments
                agentComments.querySelectorAll(".agent-comment").forEach((c) => c.classList.remove("agent-comment-active"));
                div.classList.add("agent-comment-active");
                // Update selected items highlight
                if (typeof window.__highlightSelectedStock === "function") {
                    window.__highlightSelectedStock(match.t);
                }
            });
            agentComments.appendChild(div);
        });

        animateChildrenUncover(agentComments, "left");
    }

    // --- Main search flow ---
    async function runSearch(query) {
        signalShortcuts.innerHTML = "";
        agentActionBar.classList.add("hidden");
        agentComments.classList.add("hidden");
        agentComments.innerHTML = "";
        selectedSignal = null;

        setStatus("Searching signals...");
        submitBtn.disabled = true;
        submitBtn.textContent = "Searching...";

        try {
            const payload = { query };
            if (window.__investorMode) payload.stocks = ["NVDA", "AAPL"];
            const res = await postJson(apiUrl("/api/retrieval"), payload);

            if (res.error) {
                setStatus("Search failed");
                return;
            }

            const data = res.data || res;
            agentResults = data;
            const matches = data.matches || [];

            if (matches.length === 0) {
                setStatus("No matches found. Try a different query.");
                return;
            }

            setStatus(`${matches.length} match(es) found.`);
            await renderAgentOnMainChart(matches);

        } catch (err) {
            setStatus("Search failed");
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "Search patterns";
        }
    }

    // --- Event handlers ---
    form.addEventListener("submit", (e) => {
        e.preventDefault();
        const q = queryInput.value.trim();
        if (!q) return;
        runSearch(q);
    });

    agentProceed.addEventListener("click", () => {
        if (!selectedSignal) {
            // If no specific signal selected, dispatch with first available
            const firstBtn = signalShortcuts.querySelector(".signal-shortcut");
            if (firstBtn) firstBtn.click();
        }
        if (selectedSignal) {
            document.dispatchEvent(
                new CustomEvent("agent:continue", { detail: selectedSignal })
            );
        }
    });

    agentRetry.addEventListener("click", () => {
        queryInput.focus();
        queryInput.select();
    });
})();
