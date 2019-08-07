/*global chrome*/
import React, { useState, useEffect } from 'react';
import logo from './logo.svg';
import './App.css';

/**
 * Start and end dates of Autumn 2019
 */
const INSTRUCTION_BEGINS = {year: 2019, month: 8, day: 25, hour: 8, minute: 0};
const LAST_DAY_OF_INSTRUCTION = new Date(2019, 11, 6, 19, 59);

const EARLIEST_START_TIME_MINUTES = 60 * 8 + 30;
const TWELVE_HOURS_IN_MINUTES = 60 * 12;

/**
 * Map of registration page day symbols to ics spec (excluding Saturday and
 * Sunday, since these are weekends and are not expected to show up in the 
 * registration page)
 */
const dayMap = {
  "M": "MO",
  "T": "TU",
  "W": "WE",
  "Th": "TH",
  "F": "FR",
}


/**
 * Map of column indices in the registration page table to the corresponding
 * information types
 */
const COURSE_PROPERTY_INDICES = {
  1: 'sln',
  2: 'course',
  3: 'type',
  4: 'credits',
  6: 'title',
  7: 'days',
  8: 'time',
  9: 'location',
  10: 'instructor'
}

/**
 * First and last two rows of the HTML table are irrelevant/empty
 */
const skippableHeaderRows = 2;
const skippableFooterRows = 2;

function App() {
  const [courses, setCourses] = useState([]);

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
    var parsedRowList = [];
    for (var i = skippableHeaderRows; i < rows.length - skippableFooterRows; i++) {
      var columnsThisRow = rows[i].getElementsByTagName("td");
      var parsedRow = {};
      for (var j in COURSE_PROPERTY_INDICES) {
        parsedRow[COURSE_PROPERTY_INDICES[j]] = (columnsThisRow[j]) ? createElementFromHTML(columnsThisRow[j].innerHTML.replace("<br>", "\n")).innerText.trim() : null;
      }
      parsedRowList.push(parsedRow);
      console.log(parsedRow);
    }
    setCourses(parsedRowList);
  }

  function getTable() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.tabs.sendMessage(tabs[0].id, { header: "table" }, undefined, function (response) {
        parseTable(response["table"]);
      });
    });
  }

  /**
   * Parses a days string (assuming no whitespace) and returns an array containing
   * corresponding day codes according to ics spec
   * @param {string} dayString string representing day codes from the registration page
   * e.g. "MWF" or "FTh"
   */
  function parseDaysRow(dayString) {
    var icsDays = [];
    var splitDays = dayString.split("");
    for (let i = 0; i < splitDays.length; i++) {
      let letter = splitDays[i];
      if (letter in dayMap) {
        if (letter == "T" && i + 1 < splitDays.length && splitDays[i + 1] == "h") {
          letter = "Th";
          i++;
        }
        icsDays.push(dayMap[letter]);
      } else {
        console.error("Unrecognized day code: " + letter);
      }
    }

    return icsDays;
  }

  function getMinute(timeString) {
    if (timeString.length > 4) {
      console.error("time string longer than 4 characters: " + timeString);
      return null;
    } else {
      var hour = parseInt(timeString.substring(0, timeString.length - 2));
      var minute = parseInt(timeString.substring((hour + "").length));
      return 60 * hour + minute;
    }
  }

  function parseTimeRow(timeString) {
    var splitTimeString = timeString.split("-").map(x => x.trim());
    if (splitTimeString.length != 2) {
      console.error("incorrect time string: " + timeString);
      return null;
    } else {
      var startMinute = getMinute(splitTimeString[0]);
      var endMinute = getMinute(splitTimeString[1]);

      // assume that the time is in PM if true
      if (startMinute < EARLIEST_START_TIME_MINUTES) {
        startMinute += TWELVE_HOURS_IN_MINUTES;
        endMinute += TWELVE_HOURS_IN_MINUTES;
      }
      return { startTime: {hour: startMinute / 60, minute: startMinute % 60}, endTime: {hour: endMinute / 60, minute: endMinute % 60} };
    }
  }

  function getEventsFromCourses() {
    var events = [];
    for (var course of courses) {
      if (course["days"] && course["time"]) {
        let parsedDayRows = course["days"].split("\n").map(dayString => parseDaysRow(dayString.trim()));
        let parsedTimeRows = course["time"].split("\n").map(timeString => parseTimeRow(timeString.trim()));
        let parsedLocationRows = course["location"].split("\n").map(locationString => locationString.trim());
        if (parsedLocationRows.length != parsedDayRows.length) {
          console.error("day and location count mismatch for the following row: " + course);
          return null;
        }
        if (parsedDayRows.length != parsedTimeRows.length) {
          console.error("day and row count mismatch for the following row: " + course);
          return null;
        } else {
          for (var i = 0; i < parsedDayRows.length; i++) {
            var beginTime = parsedTimeRows[i].startTime;
            var endTime = parsedTimeRows[i].endTime;
            var beginDate = {...INSTRUCTION_BEGINS, hour: beginTime.hour, minute: beginTime.minute};
            var endDate = {...INSTRUCTION_BEGINS, hour: endTime.hour, minute: endTime.minute};

            let event = {
              subject: course["course"], description: course["title"], location: course["location"],
              begin: new Date(beginDate.year, beginDate.month, beginDate.day, beginDate.hour, beginDate.minute),
              end: new Date(endDate.year, endDate.month, endDate.day, endDate.hour, endDate.minute),
              rrule: {freq: "WEEKLY", until: LAST_DAY_OF_INSTRUCTION, interval: 1, byday: parsedDayRows[i]}
            };
            events.push(event);
          }
        }
      }
    }
    console.log(events);
    // return events;
  }

  function sendEvents() {
    console.log("sending events to content script");
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.tabs.sendMessage(tabs[0].id, { header: "download", courses: courses }, undefined);
    });
  }

  useEffect(() => {
    getTable();
  }, [])

  return (
    <div className="App" style={{ height: "400px", width: "200px" }}>
      <header className="App-header">
        <img src={logo} onClick={getEventsFromCourses} className="App-logo" alt="logo" />
      </header>
    </div>
  );
}

export default App;
