console.log("pre");
chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        if (request["header"] == "table") {
            sendResponse({ table: document.getElementsByClassName("sps_table")[0].outerHTML });
        }
        else if (request["header"] == "download") {
            let cal = ics();
            cal.addEvent("subject", "description", "location", "August 18, 2019 03:24:00", "August 19, 2019 04:24:00");
            cal.download("yeets");
        }
    });
console.log("post");
