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
function onTimeRangeChange(fromTime, toTime) {
    filteredfakes = filterByTimeRange(fromTime, toTime);
}
// Callback function to filter items by visible time range
function filterByTimeRange(fromTime, toTime) {
    return mfakes.filter(
        (item) => item.time >= fromTime && item.time <= toTime
    );
}

function post(url, data = {}) {
    return fetch(url, {
        method: "post",
        headers: {
            "Content-Type": "application/json", // Set the content type to JSON
            // Add any other headers if needed
        },
        body: JSON.stringify(data), // Convert the data to JSON string
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
                // console.log("throw");
                throw res;
            }
        });
}

function collectInputs() {
    const stocks = selectedItems;

    // if (!stock || jumpValue <= 0) return;
    return {
        stocks,
        jumpValue,
    };
}

// Higher-order function to create a debounced change handler
function createDebouncedChangeHandler(debounceDelay) {
    let timeoutRef;

    return function (event) {
        clearTimeout(timeoutRef);

        timeoutRef = setTimeout(() => {
            // Determine `jump` based on event detail or a directly passed value
            // const jumpValue =
            //     sliderContainer.value ||
            //     parseFloat(event.detail || event.target.value);
            // Determine the last selected item's ticker
            const {
                stocks,
                jumpValue,
                boSensValue,
                psSensValue,
                trendSensValue,
                more_eventsValue,
            } = collectInputs();
            const stock = stocks[stocks.length - 1]?.ticker;
            if (!stock || jumpValue <= 0) return;
            showLoader();
            showListLoader();
            countAlerts(stock, {
                jumpValue,
                boSensValue,
                psSensValue,
                trendSensValue,
                more_eventsValue,
            }).then((data) => {
                hideLoader();
                setChart(data);
                setFakes(data);

                renderEvents(filteredfakes);
                hideListLoader();
            });
        }, debounceDelay);
    };
}
var mfakes = [];
var filteredfakes = [];
const fakes = [
    "momentum down faded near consolidation support",
    "move up inside consolidation",
    "momentum up develops 1.5%",
    "momentum up near resistance level",
    "consolidation move down near resistance level",
    "consolidation move down",
    "consolidation move up",
    "momentum up near resistance level",
    "momentum up resistance breakout",
    "move down false resistance breakout",
    "move up resistance breakout",
    "momentum up develops",
    "move up by trend moderate",
    "strong move up trend moderate",
    "mode down trend moderate",
    "strong move down 2%",
    "direction change up 1%",
    "price hike 3.5% in 2hrs",
    "price hike 5% in 3.5 hrs",
    "..shadow signals..",
    "pullback after hike",
    "dip 3.5% in 3hrs",
    "move up by trend",
    "direction change down 2%",
    "move down against trend",
    "dip 3% in 3.5 hrs",
];

function setFakes(data) {
    // from alerts.length-fakes.length to alerts.length
    mfakes = data.alerts
        .slice(data.alerts.length - fakes.length)
        .map((a, i) => ({
            time: a.time,
            text: fakes[i],
        }));
}
function renderEvents(events) {
    const eventsList = document.getElementById("eventsList");

    eventsList.innerHTML = events
        .reverse()
        .slice(0, 7)
        .map((event) => {
            const date = new Date(event.time * 1000);
            const dateStr =
                String(date.getDate()).padStart(2, "0") +
                "." +
                String(date.getMonth() + 1).padStart(2, "0");
            const timeStr =
                String(date.getHours()).padStart(2, "0") +
                ":" +
                String(date.getMinutes()).padStart(2, "0");

            return `
           <div class="event-item flex items-start px-6 py-1 border-b border-white/5 hover:bg-white/5 transition-all duration-300 -translate-y-4 opacity-0">
               <div class="flex-shrink-0 w-16 mr-4">
                   <div class="text-xs text-white/50 leading-tight">${dateStr}<br>${timeStr}</div>
               </div>
               <div class="flex-1 text-sm text-white leading-5 line-clamp-2 overflow-hidden">
                   ${event.text}
               </div>
           </div>
       `;
        })
        .join("");
    const items = document.querySelectorAll(".event-item");
    // Reset items
    items.forEach((item) => {
        item.classList.add("-translate-y-4", "opacity-0");
    });
}
function showListItems(item) {
    const items = document.querySelectorAll(".event-item");
    setTimeout(() => {
        eventsList.classList.remove("opacity-50", "pointer-events-none");

        // Animate items in sequence
        items.forEach((item, index) => {
            setTimeout(() => {
                item.classList.remove("-translate-y-4", "opacity-0");
            }, index * 100);
        });
    }, 100);
}
function hideListLoader() {
    // Hide shimmer, show events
    eventsList.classList.remove("hidden");
    shimmer.classList.add("hidden");
    const items = document.querySelectorAll(".event-item");

    // Enable interactions
    // setTimeout(() => {
    eventsList.classList.remove("opacity-50", "pointer-events-none");

    // Animate items in sequence
    items.forEach((item, index) => {
        setTimeout(() => {
            item.classList.remove("-translate-y-4", "opacity-0");
        }, index * 100);
    });
    // }, 100);
}
function showListLoader() {
    shimmer.classList.remove("hidden");
    eventsList.classList.add("hidden", "opacity-50", "pointer-events-none");
    const items = document.querySelectorAll(".event-item");
    // Reset items
    items.forEach((item) => {
        item.classList.add("-translate-y-4", "opacity-0");
    });
}
function toggleSwitch(toggleId) {
    const toggle = document.getElementById(toggleId);
    toggle.click();
}
// const host = process.env.REACT_APP_API;
// const host = "http://localhost:4000";
// const host = "https://modern-vocal-reptile.ngrok-free.app";
const host = "https://eeed87a36fac.ngrok-free.app";
function url(url) {
    return `${host}${url}`;
}

//
const searchInput = document.getElementById("autocomplete");
const sensetivitySlider = document.getElementById("three-state-slider");
const resultsDiv = document.getElementById("autocomplete-results");
const selectedItemsContainer = document.getElementById("selected-items");
const confirmForm = document.getElementById("code-confirmation-form");
const initText = document.getElementById("initial-text");
const afterLogin = document.getElementById("final-result");
const autocompleteContainer = document.getElementById("autocompleteContainer");
const trendSens = document.getElementById("trendSens");
const boSens = document.getElementById("boSens");
const psSens = document.getElementById("psSens");
const more_events = document.getElementById("toggle_more");
const submitAlertsButton = document.getElementById("submit_alerts");
const shimmer = document.getElementById("shimmerLoader");
const eventsList = document.getElementById("eventsList");

// for (el of [trendSens, boSens, psSens, more_events])
// el.addEventListener("change", createDebouncedChangeHandler(1000));

function showLoader() {
    const chart = document.getElementById("chart");
    const loader = document.getElementById("chartLoader");
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    // Set loader size to match chart
    loader.style.width = chart.offsetWidth + "px";
    loader.style.height = chart.offsetHeight + "px";

    // Position loader
    const rect = chart.getBoundingClientRect();
    loader.style.top = rect.top + scrollTop + "px";
    loader.style.left = rect.left + "px";

    // Show loader
    loader.classList.remove("hidden");
}

function hideLoader() {
    document.getElementById("chartLoader").classList.add("hidden");
}

const sliderThumb = document.getElementById("sliderThumb");
const sliderTrail = document.getElementById("sliderTrail");
const sliderTrack = document.getElementById("sliderTrack");
const selectedValueDisplay = document.getElementById("selectedValue");
const sliderContainer = document.getElementById("customSliderContainer");
const selectionsContainer = document.getElementById("selections");

let allStocks;
let selectedItems = [],
    jumpValue = 1,
    sliderValue = 0.5,
    isLoggedIn = false;
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

function countAlerts(
    stock,
    {
        jumpValue: jump,
        boSensValue,
        psSensValue,
        trendSensValue,
        more_eventsValue: more_events,
    }
) {
    const client_tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const queryString = new URLSearchParams({
        stock,
        jump,
        client_tz,
    }).toString();

    // Make the fetch call with the query string
    return post(`${url("/api/alerts/chart")}`, {
        stock,
        jump,
        client_tz,
        boSensValue,
        psSensValue,
        trendSensValue,
        more_events,
    }).then((res) => {
        if (res.result) {
            return res.data;
        } else {
            // throw res;
        }
    });
}
const AlertMes = {
    0: (alert) =>
        `${alert.stock.map((s) => s.ticker).join(" ")} ${alert.percentage}%`,
};
(async () => {
    function setSelections(selections) {
        selectionsContainer.innerHTML = ""; // Clear existing content

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
        // under ? because refetch better?
        const {
            stocks,
            jumpValue,
            boSensValue,
            psSensValue,
            trendSensValue,
            more_eventsValue,
        } = collectInputs();
        if (!stocks.length) {
            // setSelections((prev) => [...prev, { stock, percentage }]);
            alert("set something");
            return;
        }
        const data = {
            percentage: jumpValue,
            // sliderValue,
            // checkboxValue,
            alertType: 0,
            stock: stocks, //.map(item=>item.ticker),
        };
        const otherData = {
            boSensValue,
            psSensValue,
            trendSensValue,
            more_eventsValue,
        };

        if (isLoggedIn)
            post(url("/api/algos/new"), { algo: data, otherData })
                .then((r) => {
                    // resetForm();
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

    const resetForm = async () => {
        setStock([]);
        setPercentage(0);
    };

    // A handler function to delete a selection
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
        // Show processing indicator
        document.getElementById("process-indicator").style.display = "block";
        confirmClick(code)
            .then(() => {
                // Hide processing indicator
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

    // post(url("/api/getuser"))
    //     .then((res) => {
    //         setIsLoggedIn(true);
    //     })
    //     .catch((e) => {
    //         console.log(e.error);
    //     });
    post(url("/api/algos"))
        .then((res) => {
            setIsLoggedIn(true);
            setSelections(res.payload);
        })
        .catch((e) => {});
    post(url("/api/stocks")).then((r) => {
        setStocks(r.payload);
        setStock([r.payload[1], r.payload[142]]);
    });
})();
function setStock(arr) {
    selectedItems = arr;
    renderSelectedItems();
    autocompleteContainer.dispatchEvent(
        new CustomEvent("change", { detail: selectedItems })
    );
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
    // Show final result
}

// autocomplete.js
autocompleteContainer.addEventListener(
    "change",
    createDebouncedChangeHandler(500)
);
function createSelectedItem(item) {
    const span = document.createElement("span");
    span.className = "selected-item"; // Apply the new class
    span.textContent = item.ticker.slice(0, 8); // Ensure it's uppercase and limited to 5 letters
    span.onclick = function () {
        selectedItems = selectedItems.filter((i) => i.ticker !== item.ticker);
        renderSelectedItems();
        //onchange
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
    // filteredData = filteredData.slice(0, 20);
    filteredData.forEach((item) => {
        const div = document.createElement("div");
        div.className = "p-4 hover:bg-white/20 cursor-pointer";
        const ticker = item.ticker;
        div.textContent = item.ticker;
        div.addEventListener("click", function () {
            if (!selectedItems.includes(item)) {
                selectedItems.push(item);
                renderSelectedItems();
            }
            searchInput.value = ""; // Clear input after selection
            resultsDiv.style.display = "none"; // Hide results after selection
            //onchange
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
if (window.innerWidth <= 768) {
    // You can adjust this breakpoint
    // On mobile, use the maximum available width
    width = window.innerWidth - 40;
    // Set height equal to width for a square chart
    height = width;
} else {
    // On desktop, use the original dimensions
    width = 600;
    height = 400;
}
var chart = LightweightCharts.createChart(document.getElementById("chart"), {
    width,
    height,
    handleScroll: {
        mouseWheel: false,
        pressedMouseMove: true,
        vertTouchDrag: false,
    },
    timeScale: {
        timeVisible: true,
        borderColor: "rgba(0,0,0, 0)",
        barSpacing: 12, // Increase spacing between candles (default is 6)
        minBarSpacing: 8, // Minimum spacing when zoomed in
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
            color: "rgba(255,255,255, 0.08)", // Subtle light grid lines
        },
        vertLines: {
            color: "rgba(255,255,255, 0.08)", // Subtle light grid lines
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
    upColor: "rgba(255,255,255,0.15)", // Slightly more visible fill
    downColor: "rgba(255,0,0,0.15)", // Slightly more visible fill
    wickUpColor: "rgba(255,255,255,0.8)", // Clean, visible wicks
    wickDownColor: "rgba(255,0,0,0.8)", // Clean, visible wicks
    borderUpColor: "rgba(255,255,255,0.6)", // More transparent borders
    borderDownColor: "rgba(255,0,0,0.6)", // More transparent borders
    borderVisible: true, // Thin borders for definition
    priceFormat: {
        type: "price",
        precision: 2,
        minMove: 0.01,
    },
});

// Optional: Add some padding around the chart data
chart.timeScale().fitContent();
// Subscribe to visible time range changes
const debouncedTimeRangeCallback = debounce(() => {
    const timeRange = chart.timeScale().getVisibleRange();
    if (timeRange) {
        onTimeRangeChange(timeRange.from, timeRange.to);
        renderEvents(filteredfakes);
        hideListLoader();
    }
}, 300);
chart.timeScale().subscribeVisibleTimeRangeChange(debouncedTimeRangeCallback);

// series.setMarkers(markers);
function setChart(data) {
    const lastIndex = data.candles.length - 1;
    const firstIndexToDisplay = lastIndex - 30;
    // chart.timeScale().setVisibleRange({
    //     from: data.candles[firstIndexToDisplay].time,
    //     to: data.candles[lastIndex].time,
    // });
    series.setData(data.candles);
    const markerColorF = (a) => ({
        su: `rgba(0, 102, 204, ${a})`,
        si: `rgba(255, 128, 0, ${a})`,
        1: `rgba(0, 0, 0, ${a})`, // Dim Gray
        2: `rgba(105, 105, 105, ${a})`, // Gray
        3: `rgba(169, 169, 169, ${a})`, // Dark Gray
        4: `rgba(0,255, 0, ${a})`, // Silv
        5: `rgba(123, 126, 34, ${a})`,
        6: `rgba(238, 130, 238, ${a})`,
        7: `rgba(255, 192, 203, ${a})`,
    });
    const markerColorS = markerColorF("1");
    const markers = [];

    // chart.timeScale().fitContent();
    chart.timeScale().setVisibleRange({
        from: data.candles[lastIndex].time - 3600 * 24 * 4,
        to: data.candles[lastIndex].time,
    });
    data.alerts.forEach((alert) => {
        const signalType = alert.value;

        if (signalType === "buy") {
            markers.push({
                time: alert.time,
                position: "belowBar",
                color: markerColorS[alert.type],
                // color: 'black',
                shape: "arrowUp",
                size: 1,
                // text: alert.text, // Display the timeframe as text on the marker
            });
        } else if (signalType === "sell") {
            markers.push({
                time: alert.time,
                position: "aboveBar",
                // color: 'black',
                color: markerColorS[alert.type],
                shape: "arrowDown",
                size: 1,
                // text: alert.text, // Display the timeframe as text on the marker
            });
        }
    });
    chart.priceScale("right").applyOptions({
        scaleMargins: {
            top: 0,
            bottom: 0,
        },
    });

    series.setMarkers(markers);
}

// non-linear slider.js

(async () => {
    sliderContainer.addEventListener(
        "change",
        createDebouncedChangeHandler(1000)
    );

    let isDragging = false;
    let sliderBounds;

    const stickyValues = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10];
    let percentRanges = [];

    // Precompute percent ranges for each sticky value
    const precomputePercentRanges = () => {
        sliderBounds = sliderContainer.getBoundingClientRect();
        const totalWidth = sliderBounds.width;

        // Define key points and their corresponding positions in percentage
        const keyPoints = {
            0.5: 5, // Starting point
            1: 15, // 20% for 0.5 to 1
            1.5: 30, // Additional 20% for 1 to 1.5
            3: 50, // Up to 60% for 1.5 to 3
            10: 100, // Remaining 40% for 3 to 10
        };

        // Compute the exact percentage position for each sticky value based on the key points
        percentRanges = stickyValues.map((value) => {
            if (value <= 1.5) {
                // Direct mapping for values between 0.5 and 1.5
                return keyPoints[value];
            } else if (value <= 3) {
                // Linear interpolation for values between 1.5 and 3
                return (
                    keyPoints[1.5] +
                    (keyPoints[3] - keyPoints[1.5]) *
                        ((value - 1.5) / (3 - 1.5))
                );
            } else {
                // Linear interpolation for values between 3 and 10
                return (
                    keyPoints[3] +
                    (keyPoints[10] - keyPoints[3]) * ((value - 3) / (10 - 3))
                );
            }
        });
    };

    const updateSliderPosition = (clientX) => {
        const percent =
            ((clientX - sliderBounds.left) / sliderBounds.width) * 100;
        // Find the closest range and update thumb position
        let closest = percentRanges.reduce((prev, curr) =>
            Math.abs(curr - percent) < Math.abs(prev - percent) ? curr : prev
        );
        sliderThumb.style.left = `${closest}%`;
        sliderTrail.style.width = `${closest}%`;
        // Update displayed value to the closest sticky value
        const valueIndex = percentRanges.indexOf(closest);
        selectedValueDisplay.textContent = stickyValues[valueIndex].toString();
        sliderContainer.value = stickyValues[valueIndex];
        jumpValue = stickyValues[valueIndex];
        sliderContainer.dispatchEvent(
            new CustomEvent("change", { detail: stickyValues[valueIndex] })
        );
    };

    sliderThumb.addEventListener("mousedown", (e) => {
        e.preventDefault(); // Prevent default drag behavior
        precomputePercentRanges(); // Prepare ranges on mousedown
        isDragging = true;
        // sliderThumb.style.cursor = "grabbing";
        updateSliderPosition(e.clientX);
    });
    sliderTrack.addEventListener("mousedown", (e) => {
        e.preventDefault(); // Prevent default drag behavior
        precomputePercentRanges(); // Prepare ranges on mousedown
        updateSliderPosition(e.clientX);
    });

    document.addEventListener("mousemove", (e) => {
        if (isDragging) {
            updateSliderPosition(e.clientX);
        }
    });

    document.addEventListener("mouseup", () => {
        if (isDragging) {
            isDragging = false;
            // sliderThumb.style.cursor = "grab";
        }
    });
})();
function updateTrail() {
    const slider = document.getElementById("sliderSens");
    const trail = document.getElementById("trailSens");
    const value = parseFloat(slider.value);
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);

    // Calculate percentage based on the actual position, not including the thumb width
    const percentage = ((value - min) / (max - min)) * 100;

    trail.style.width = percentage + "%";
}

// Initialize trail on page load
document.addEventListener("DOMContentLoaded", function () {
    updateTrail();
});
