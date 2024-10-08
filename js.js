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
    trendSensValue = trendSens.value;
    boSensValue = boSens.value;
    psSensValue = psSens.value;
    more_eventsValue = more_events.checked;
    return {
        stocks,
        jumpValue,
        boSensValue,
        psSensValue,
        trendSensValue,
        more_eventsValue,
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
            countAlerts(stock, {
                jumpValue,
                boSensValue,
                psSensValue,
                trendSensValue,
                more_eventsValue,
            }).then((data) => {
                hideLoader();
                setChart(data);
            });
        }, debounceDelay);
    };
}

function toggleSwitch(toggleId) {
    const toggle = document.getElementById(toggleId);
    toggle.click();
}
// const host = process.env.REACT_APP_API;
// const host = "http://localhost:4000";
const host = "https://modern-vocal-reptile.ngrok-free.app";
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

for (el of [trendSens, boSens, psSens, more_events])
    el.addEventListener("change", createDebouncedChangeHandler(1000));

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
        setStock([r.payload[1], r.payload[0]]);
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
    height = 600;
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
    },
    rightPriceScale: {
        borderColor: "rgba(0,0,0, 0)",
    },
    layout: {
        background: {
            type: "gradient",
            topColor: "rgba(0,0,0, 0)",
            bottomColor: "rgba(0,0,0, 0)",
        },
        textColor: "rgba(255,255,255, 1)",
    },
    grid: {
        horzLines: {
            color: "rgba(0,0,0, 0)",
        },
        vertLines: {
            color: "rgba(0,0,0, 0)",
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
    upColor: "rgba(255,255,255,0.7)",
    // downColor: "#008ddc",
    downColor: "rgba(255,0,0,0.7)",
    wickUpColor: "white",
    wickDownColor: "red",
    borderUpColor: "white",
    borderDownColor: "red",
    borderVisible: false,
});

// var markers = [
//     {
//         time: data[data.length - 48].time,
//         position: "aboveBar",
//         color: "#f68410",
//         shape: "circle",
//         text: "D",
//     },
// ];
// for (var i = 0; i < datesForMarkers.length; i++) {
//     if (i !== indexOfMinPrice) {
//         markers.push({
//             time: datesForMarkers[i].time,
//             position: "aboveBar",
//             color: "#e91e63",
//             shape: "arrowDown",
//             text: "Sell @ " + Math.floor(datesForMarkers[i].high + 2),
//         });
//     } else {
//         markers.push({
//             time: datesForMarkers[i].time,
//             position: "belowBar",
//             color: "#2196F3",
//             shape: "arrowUp",
//             text: "Buy @ " + Math.floor(datesForMarkers[i].low - 2),
//         });
//     }
// }

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
        "5t": "rgba(255, 165, 0, " + a + ")", // Orange color for 5-minute timeframe
        "15t": "rgba(255, 0, 0, " + a + ")", // Red color for 15-minute timeframe
        "1d": "rgba(0, 50, 255, " + a + ")", // Blue color for 30-minute timeframe
        "sudden": "rgba(150, 0, 255, " + a + ")", // Purple color for 2-hour timeframe
        "1d-2": "rgba(255, 100, 0, " + a + ")", // Purple color for 2-hour timeframe
        "1d-3": "rgba(0, 255, 0, " + a + ")", // Purple color for 2-hour timeframe
        "bo": "rgba(255, 255, 0, " + a + ")", // Purple color for 2-hour timeframe
        "4h": "rgba(255, 165, 0, " + a + ")", // Purple color for 2-hour timeframe
    });
    const markerColorS = markerColorF("1");
    const markers = [];
    // const markers = data.alerts.map((alert) => ({
    //     time: alert.time,
    //     position: alert.direction ? "aboveBar" : "belowBar",
    //     color: alert.direction ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.5)",
    //     shape: alert.direction ? "circle" : "circle",
    //     // text: alert.direction ? "-" : "+",
    // }));
    // chart.timeScale().fitContent();
    // chart.timeScale().setVisibleRange({
    //     from: data.candles[lastIndex].time - 3600 * 24 * 5,
    //     to: data.candles[lastIndex].time,
    // });
    data.alerts.forEach((alert) => {
        const signalType = alert.value;

        if (signalType === "buy") {
            markers.push({
                time: alert.time,
                position: "belowBar",
                color: markerColorS[alert.type],
                // color: 'black',
                shape: "arrowUp",
                size: 1.5,
                // text: alert.text, // Display the timeframe as text on the marker
            });
        } else if (signalType === "sell") {
            markers.push({
                time: alert.time,
                position: "aboveBar",
                // color: 'black',
                color: markerColorS[alert.type],
                shape: "arrowDown",
                size: 1.5,
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
