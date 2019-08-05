/*global chrome*/
import React from 'react';
import logo from './logo.svg';
import './App.css';

var courses = [];
const coursePropertyIndices = {
  1: 'SLN',
  2: 'Course',
  3: 'Type',
  4: 'Credits',
  6: 'Title',
  7: 'Days',
  8: 'TIme',
  9: 'Location',
  10: 'Instructor'
}
const firstCourseRowIndex = 2;

function createElementFromHTML(htmlString) {
  var div = document.createElement('div');
  div.innerHTML = htmlString.trim();

  // Change this to div.childNodes to support multiple top-level nodes
  return div.firstChild;
}

function htmlDecode(input) {
  var doc = new DOMParser().parseFromString(input, "text/html");
  return doc.documentElement.textContent;
}

function parseTable(tableHTML) {
  var table = createElementFromHTML(tableHTML);
      var rows = table.getElementsByTagName("tr");
      for (var i = firstCourseRowIndex; i < rows.length; i++) {
        var columnsThisRow = rows[i].getElementsByTagName("td");
        var course = {};
        for (var j in coursePropertyIndices) {
          course[coursePropertyIndices[j]] = (columnsThisRow[j]) ? createElementFromHTML(columnsThisRow[j].innerHTML.replace("<br>", "\n")).innerText : null;
        }
        // console.log(course);
        courses.push(course);
      }
}

function App() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {request: "table"}, undefined, function(response) {
      parseTable(response["table"]);
      console.log(courses);
    });
  });

  // chrome.runtime.sendMessage(undefined, { text: "requestTable" }, undefined, function () {
  //   console.log("request table");
  // })

  // chrome.runtime.onMessage.addListener(
  //   function (message, callback) {
  //     var table = createElementFromHTML(message["table"]);
  //     var rows = table.getElementsByTagName("tr");
  //     for (var i = firstCourseRowIndex; i < rows.length; i++) {
  //       var columnsThisRow = rows[i].getElementsByTagName("td");
  //       var course = {};
  //       for (var j in coursePropertyIndices) {
  //         // if (columnsThisRow[j]) {
  //         //   console.log("----");
  //         //   console.log(columnsThisRow[j].innerHTML);
  //         //   console.log(columnsThisRow[j].textContent)
  //         //   console.log(columnsThisRow[j].innerText);
  //         // }
  //         course[coursePropertyIndices[j]] = (columnsThisRow[j]) ? createElementFromHTML(columnsThisRow[j].innerHTML.replace("<br>", "\n")).innerText : null;
  //       }
  //       console.log(course);
  //       courses.push(course);
  //     }
  //   }
  // );

  return (
    <div className="App" style={{ height: "400px", width: "200px" }}>
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
      </header>
    </div>
  );
}

export default App;
