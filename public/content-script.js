chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        if (request["header"] == "table") {
            sendResponse({ table: document.getElementsByClassName("sps_table")[0].outerHTML });
        }
        else if (request["header"] == "download") {
            console.log("generating calendar");
            let cal = ics("uw-schedule-exporter");
            for (var event of request["events"]) {
                var subject = event.subject.trim();
                var description = event.description.trim();
                var location = event.location.trim();
                var beginDate = event.beginDate.toString();
                var endDate = event.endDate.toString();
                var rrule = event.rrule;
                var uidHelper = event.uidHelper;
                cal.addEvent(subject, description, location, beginDate, endDate, rrule, uidHelper);
            }
            
            cal.download("uw-schedule");
        }
    });
