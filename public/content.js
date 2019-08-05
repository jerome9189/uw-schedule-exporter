// chrome.runtime.onMessage.addListener(
//     function (message, callback) {
//         if (message["text"] == "requestTable") {
//             chrome.runtime.sendMessage(undefined, { text:  }, undefined, function () {
//                 console.log("message sent");
//             })
//         }
//     }
// );

chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
        if (request["request"] == "table") {
            sendResponse({ table: document.getElementsByClassName("sps_table")[0].outerHTML });
        }
    });

// for (var x of document.getElementsByClassName("sps_table")[0].getElementsByTagName("tr")) {

//     chrome.runtime.sendMessage(undefined, {text: x.innerHTML}, undefined, function() {
//         // alert("message sent");
//     })
// }

// document.getElementsByClassName("sps_table")[0].outerHTML