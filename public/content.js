console.log("pre");
chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        if (request["header"] == "table") {
            sendResponse({ table: document.getElementsByClassName("sps_table")[0].outerHTML });
        }
        else if (request["header"] == "download") {
            console.log("generating calendar");
            let cal = ics();
            for (var event of request["events"]) {
                var subject = event.subject.trim();
                var description = event.description.trim();
                var location = event.location.trim();
                var beginDate = event.beginDate.toString();
                var endDate = event.endDate.toString();
                var rrule = event.rrule;
                cal.addEvent(subject, description, location, beginDate, endDate, rrule);
            }
            
            cal.download("res");
            // console.log(request["events"]);
        }
    });
console.log("post");
