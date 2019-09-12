/*global chrome*/
import React, { useState, useEffect } from 'react';
import Button from '@material-ui/core/Button';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import { makeStyles } from '@material-ui/styles';
import './App.css';

// eslint-disable-next-line
Date.prototype.addDays = function (days) {
  var date = new Date(this.valueOf());
  date.setDate(date.getDate() + days);
  return date;
}

/**
 * Start and end dates
 */
const QUARTER_DATES = {
  'Autumn 2019': {
    instructionBegins: { year: 2019, month: 8, day: 25, hour: 8, minute: 0 },
    instructionEnds: { year: 2019, month: 11, day: 6, hour: 23, minute: 59 }
  },
  'Fall 2019': {
    instructionBegins: { year: 2019, month: 8, day: 25, hour: 8, minute: 0 },
    instructionEnds: { year: 2019, month: 11, day: 6, hour: 23, minute: 59 }
  },
  'Winter 2020': {
    instructionBegins: { year: 2020, month: 0, day: 6, hour: 8, minute: 0 },
    instructionEnds: { year: 2020, month: 2, day: 13, hour: 23, minute: 59 }
  },
  'Spring 2020': {
    instructionBegins: { year: 2020, month: 2, day: 30, hour: 8, minute: 0 },
    instructionEnds: { year: 2020, month: 5, day: 5, hour: 23, minute: 59 }
  }
};

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
 * Map of values for Date.prototype.getDay()
 */
// const dayValues = {
//   1: 'MO',
//   2: 'TU'
// }
const DAY_SEQUENCE = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/**
 * First and last two rows of the HTML table are irrelevant/empty
 */
const skippableHeaderRows = 2;
const skippableFooterRows = 2;

function App() {
  const [events, setEvents] = useState([]);
  var instructionBegins = {};
  var instructionEnds = {};

  function createElementFromHTML(htmlString) {
    var div = document.createElement('div');
    div.innerHTML = htmlString.trim();

    // Change this to div.childNodes to support multiple top-level nodes
    return div.firstChild;
  }

  /**
   * Reads the table rows from the tableHTML string and converts them into
   * objects with keys mentioned in COURSE_PROPERTY_INDICES
   * @param tableHTML html string of the table element being parsed
   */
  function readTable(tableHTML) {
    console.log("reading table")
    var table = createElementFromHTML(tableHTML);
    var rows = table.getElementsByTagName("tr");
    var parsedRowList = [];
    for (var i = skippableHeaderRows; i < rows.length - skippableFooterRows; i++) {
      var columnsThisRow = rows[i].getElementsByTagName("td");
      var parsedRow = {};

      // Added to account for the "Drop Code" column in certain schedule tables
      var dropCodeColumnOffset = columnsThisRow.length > 11 ? 1 : 0;

      for (var j in COURSE_PROPERTY_INDICES) {
        parsedRow[COURSE_PROPERTY_INDICES[j]] = (columnsThisRow[parseInt(j) + dropCodeColumnOffset]) ? createElementFromHTML(columnsThisRow[parseInt(j) + dropCodeColumnOffset].innerHTML.replace("<br>", "\n")).innerText.trim() : null;
      }
      parsedRowList.push(parsedRow);
    }
    console.log("finished reading table!");
    return parsedRowList;
  }

  /**
   * Requests the table from the content script, reads it, and generates events to be stored
   * in the app state
   */
  function getTable() {
    console.log("requesting data from content script");
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.tabs.sendMessage(tabs[0].id, { header: "table" }, undefined, function (response) {
        var quarterName = response["quarter"].split("-")[1].trim();
        instructionBegins = QUARTER_DATES[quarterName].instructionBegins;
        instructionEnds = QUARTER_DATES[quarterName].instructionEnds;
        console.log("received data from content script!");
        populateEvents(readTable(response["table"]));
      });
    });
  }

  /**
   * Parses a days string (assuming no whitespace) and returns an array containing
   * corresponding day codes according to ics spec (maintains order)
   * @param {string} dayString string representing day codes from the registration page
   * (must be ordered according to MTWTHF)
   * e.g. "MWF" or "ThF"
   */
  function parseDaysRow(dayString) {
    var icsDays = [];
    var splitDays = dayString.split("");
    for (let i = 0; i < splitDays.length; i++) {
      let letter = splitDays[i];
      if (letter in dayMap) {
        if (letter === "T" && i + 1 < splitDays.length && splitDays[i + 1] === "h") {
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

  /**
   * Computes and returns the minute of day from a time string
   * @param {string} timeString a string representing a time in 24 hour
   * notation, with the last two characters representing the minute past the hour, and the
   * remaining characters representing the hour, e.g., "830" or "1430"
   */
  function getHourAndMinute(timeString) {
    if (timeString.length > 4) {
      console.error("time string longer than 4 characters: " + timeString);
      return null;
    } else {
      var hour = parseInt(timeString.substring(0, timeString.length - 2));
      var minute = parseInt(timeString.substring((hour + "").length));
      return { hour: hour, minute: minute };
    }
  }

  /**
   * Accepts a row with a start and and end time, and converts it to an object.
   * Example:
   * When the timeString passed is "930-1020",
   * {startTime: {hour: 9, minute:30}, endTIme: {hour: 10, minute: 20}} is returned
   * The timeString must include exactly one "-" in it, else null is returned.
   * @param timeString a string with two times separated by a "-"
   */
  function parseTimeRow(timeString) {
    var pmInString = timeString.includes("P") || timeString.includes("PM");
    timeString = timeString.replace("PM", "").replace("P", "").trim();
    var splitTimeString = timeString.split("-").map(x => x.trim());
    if (splitTimeString.length !== 2) {
      console.error("incorrect time string: " + timeString);
      return null;
    } else {
      var startHourMinute = getHourAndMinute(splitTimeString[0]);
      var endHourMinute = getHourAndMinute(splitTimeString[1]);

      if (pmInString || startHourMinute['hour'] < 8) {
        startHourMinute['hour'] += 12;
        endHourMinute['hour'] += 12;
      } else if (endHourMinute['hour'] < 8) {
        endHourMinute['hour'] += 12;
      }

      return { startTime: startHourMinute, endTime: endHourMinute };
    }
  }

  /**
   * Accepts an array of ics standard weekdays and returns how many days after the INSTRUCTION_BEGINS day
   * that an event should have its first occurrence
   * @param {*} weekdays a non-empty array containing ics-style days
   */
  function getStartDateOffset(weekdays) {
    var instructionBeginsWeekdayNumber = new Date(instructionBegins.year, instructionBegins.month, instructionBegins.day).getDay();
    var offset = 0;
    while (weekdays.indexOf(DAY_SEQUENCE[(instructionBeginsWeekdayNumber + offset) % DAY_SEQUENCE.length]) === -1) {
      offset++;
    }

    return offset;
  }

  /**
   * Populates the events array in the state with ics-like event objects parsed
   * from the table rows
   * @param tableRows array of table rows
   */
  function populateEvents(tableRows) {
    console.log("populating events");
    var eventList = [];
    for (var tableRow of tableRows) {
      if (tableRow["days"] && tableRow["time"]) {
        let parsedDayRows = tableRow["days"].split("\n").map(dayString => parseDaysRow(dayString.trim()));
        let parsedTimeRows = tableRow["time"].split("\n").map(timeString => parseTimeRow(timeString.trim()));
        let parsedLocationRows = tableRow["location"].split("\n").map(locationString => locationString.trim());
        if (parsedLocationRows.length !== parsedDayRows.length) {
          console.error("day and location count mismatch for the following row: " + tableRow);
          return null;
        }
        if (parsedDayRows.length !== parsedTimeRows.length) {
          console.error("day and row count mismatch for the following row: " + tableRow);
          return null;
        } else {
          for (var i = 0; i < parsedDayRows.length; i++) {
            var beginTime = parsedTimeRows[i].startTime;
            var endTime = parsedTimeRows[i].endTime;
            var beginDateTempObject = { ...instructionBegins, hour: beginTime.hour, minute: beginTime.minute };
            var endDateTempObject = { ...instructionBegins, hour: endTime.hour, minute: endTime.minute };
            var dateOffset = getStartDateOffset(parsedDayRows[i]);

            let event = {
              subject: tableRow["course"], description: tableRow["title"] + " (" + tableRow["type"].trim() + ")",
              location: parsedLocationRows[i],
              beginDate: (new Date(beginDateTempObject.year, beginDateTempObject.month, beginDateTempObject.day,
                beginDateTempObject.hour, beginDateTempObject.minute)).addDays(dateOffset),
              endDate: new Date(endDateTempObject.year, endDateTempObject.month, endDateTempObject.day, endDateTempObject.hour, endDateTempObject.minute).addDays(dateOffset),
              rrule: {
                freq: "WEEKLY", until: new Date(instructionEnds.year, instructionEnds.month, instructionEnds.day, instructionEnds.hour, instructionEnds.minute),
                interval: 1, byday: parsedDayRows[i]
              },
              uidHelper: (tableRow["sln"] + "_" + i)
            };
            eventList.push(event);
          }
        }
      }
    }
    console.log("events:");
    eventList.forEach(event => console.log(event));
    setEvents(eventList);
  }

  /**
   * Sends events to the content script
   */
  function sendEvents() {
    console.log("sending events to content script");
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.tabs.sendMessage(tabs[0].id, { header: "download", events: events }, undefined);
    });
  }

  useEffect(() => {
    getTable();
    // eslint-disable-next-line
  }, []);

  const useStyles = makeStyles({
    table: {
      height: '100%',
      width: '100%',
      overflowY: 'auto'
    },
    tableHeader: {
      backgroundColor: '#b7a57a',
      color: 'white',
      position: "sticky",
      top: 0,
      zIndex: 10,
      whiteSpace: "nowrap",
      overflow: "hidden"
    },
    tableBody: {
      overflowY: 'auto'
    },
    buttonContainer: {
      textAlign: 'center'
    },
    button: {
      background: '#b7a57a',
      width: '80%',
      border: 0,
      margin: '20px',
      borderRadius: 3,
      color: 'white',
      height: '45px',
      padding: '0 30px',
      '&:hover': {
        background: "#85754d",
      },
    },
    tableRow: {
      whiteSpace: "nowrap",
      overflow: "hidden",
    }
  });

  const classes = useStyles();

  function onRenderEvents() {
    return events.map(event => <TableRow>
      <TableCell className={classes.tableRow}>{event["subject"]}</TableCell>
      <TableCell className={classes.tableRow} align="right">{event['rrule'].byday.join(', ')}</TableCell>
      <TableCell className={classes.tableRow} align="right">{event['beginDate'].getHours().toString().padStart(2, '0') + ':' + event['beginDate'].getMinutes().toString().padStart(2, '0')}</TableCell>
      <TableCell className={classes.tableRow} align="right">{event['endDate'].getHours().toString().padStart(2, '0') + ':' + event['endDate'].getMinutes().toString().padStart(2, '0')}</TableCell>
      <TableCell className={classes.tableRow} align="right">{event["location"]}</TableCell>
    </TableRow>)
  }

  return (
    <div>
      <div className={classes.table}>
        <Table>
          <TableHead >
            <TableRow>
              <TableCell className={classes.tableHeader}>Course</TableCell>
              <TableCell className={classes.tableHeader} align="right">Days</TableCell>
              <TableCell className={classes.tableHeader} align="right">Start Time</TableCell>
              <TableCell className={classes.tableHeader} align="right">End Time</TableCell>
              <TableCell className={classes.tableHeader} align="right">Location</TableCell>
            </TableRow>
          </TableHead>
          <TableBody className={classes.tableBody}>
            {onRenderEvents()}
          </TableBody>
        </Table>
      </div>
      <div className={classes.buttonContainer}>
        <Button className={classes.button} onClick={sendEvents} variant="contained" color="primary">
          Download .ics file
        </Button>
      </div>
    </div>
  );
}

export default App;
