// page code
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
        .then((res) => {
            if (res.result || res.data) {
                return res;
            } else {
                // throw res;
            }
        })
        .catch((e) => {
            console.log(e);
            return null;
        });
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
            const stock = selectedItems[selectedItems.length - 1]?.ticker;

            if (!stock || jumpValue <= 0) return;

            countAlerts(stock, jumpValue).then((data) => {
                setChart(data);
            });
        }, debounceDelay);
    };
}

function toggleSwitch(toggleId) {
    const toggle = document.getElementById(toggleId);
    // toggle.click();
}
// const host = process.env.REACT_APP_API;
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
const autocompleteContainer = document.getElementById("autocompleteContainer");

const sliderThumb = document.getElementById("sliderThumb");
const sliderTrail = document.getElementById("sliderTrail");
const sliderTrack = document.getElementById("sliderTrack");
const selectedValueDisplay = document.getElementById("selectedValue");
const sliderContainer = document.getElementById("customSliderContainer");

let allStocks;
let selectedItems = [],
    jumpValue = 1,
    sliderValue = 0.5,
    isLoggedIn = false;
//page.js

function countAlerts(stock, jump) {
    const client_tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const queryString = new URLSearchParams({
        stock,
        jump,
        client_tz,
    }).toString();

    // Make the fetch call with the query string
    return post(`${url("/api/alerts/chart")}`, { stock, jump, client_tz }).then(
        (res) => {
            if (res.result) {
                return res.data;
            } else {
                // throw res;
            }
        }
    );
}
(async () => {
    const handleSubmit = (e) => {
        e.preventDefault();
        // under ? because refetch better?

        if (!stock.length) {
            // setSelections((prev) => [...prev, { stock, percentage }]);
            alert("set something");
            return;
        }
        const sliderValue = sensetivitySlider.value;

        const data = {
            percentage,
            sliderValue,
            checkboxValue,
            alertType: 0,
            stock: selectedItems, //.map(item=>item.ticker),
        };

        if (isLoggedIn)
            post(url("/api/algos/new"), { algo: data })
                .then((r) => {
                    // resetForm();
                    setSelections(r.payload);
                    // alert("ok");
                })
                .catch((e) => {
                    alert(e);
                });
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
                // alert("ok");
            })
            .catch((e) => {
                alert(e);
            });
    };

    const confirmClick = async (code) => {
        const res = await fetch(url("/api/setUser"), {
            method: "post",
            headers: {
                "Content-Type": "application/json", // Set the content type to JSON
                // Add any other headers if needed
            },
            body: JSON.stringify({
                code,
            }), // Convert the data to JSON string
            credentials: "include",
        })
            .then((r) => r.json())
            .catch((e) => console.error(e));
        if (res.result) {
            setIsLoggedIn(true);
        }
    };
    confirmForm.addEventListener("submit", function (e) {
        e.preventDefault();
        const code = e.target[0].value;
        // Show processing indicator
        document.getElementById("process-indicator").style.display = "block";
        confirmClick(code).then(() => {
            // Hide processing indicator
            document.getElementById("process-indicator").style.display = "none";
        });
    });

    post(url("/api/getuser")).then((res) => {
        if (res) setIsLoggedIn(true);
    });
    fetch(url("/api/stocks"), { credentials: "include", method: "GET" })
        .then((r) => r.json())
        .then((r) => {
            setStocks(r.payload);
            setStock([r.payload[0], r.payload[1]]);
        })
        .catch((e) => console.error(e));

    fetch(url("/api/algos"), { credentials: "include", method: "GET" })
        .then((r) => r.json())
        .then((res) => {
            if (res.result) {
                // setSelections(res.payload);
            } else {
                // throw res;
            }
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
        document.getElementById("final-result").style.display = "block";
        document.getElementById("no-result").style.display = "none";
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
    span.textContent = item.ticker.slice(0, 5); // Ensure it's uppercase and limited to 5 letters
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
    filteredData = filteredData.slice(0, 20);
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

var chart = LightweightCharts.createChart(document.getElementById("chart"), {
    width: 450,
    height: 250,
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
        textColor: "rgba(255,255,255, 0.4)",
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
    handleScroll: {
        mouseWheel: false,
        pressedMouseMove: true,
    },
    handleScale: {
        mouseWheel: false,
        pinch: false,
    },
});
var series = chart.addCandlestickSeries({
    upColor: "rgba(255,255,255,0.7)",
    downColor: "#008ddc",
    wickUpColor: "white",
    wickDownColor: "white",
    borderUpColor: "white",
    borderDownColor: "white",
    borderVisible: true,
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
    const markers = data.alerts.map((alert) => ({
        time: alert.time,
        position: alert.direction ? "aboveBar" : "belowBar",
        color: alert.direction ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.5)",
        shape: alert.direction ? "circle" : "circle",
        // text: alert.direction ? "-" : "+",
    }));
    // chart.timeScale().fitContent();
    chart.timeScale().setVisibleRange({
        from: data.candles[lastIndex].time - 3600 * 24 * 5,
        to: data.candles[lastIndex].time,
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
