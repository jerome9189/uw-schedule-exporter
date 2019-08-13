/*global chrome*/
import React, { useState, useEffect } from 'react';
import Button from '@material-ui/core/Button';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import Paper from '@material-ui/core/Paper';
import { makeStyles } from '@material-ui/styles';
import './App.css';

Date.prototype.addDays = function (days) {
  var date = new Date(this.valueOf());
  date.setDate(date.getDate() + days);
  return date;
}

/**
 * Start and end dates of Autumn 2019
 */
const INSTRUCTION_BEGINS = { year: 2019, month: 8, day: 25, hour: 8, minute: 0 };
const LAST_DAY_OF_INSTRUCTION = new Date(2019, 11, 6, 23, 59);

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
      // console.log(parsedRow);
    }
    return parsedRowList;
  }

  /**
   * Requests the table from the content script, reads it, and generates events to be stored
   * in the app state
   */
  function getTable() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.tabs.sendMessage(tabs[0].id, { header: "table" }, undefined, function (response) {
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

  /**
   * Accepts a row with a start and and end time, and converts it to an object.
   * Example:
   * When the timeString passed is "930-1020",
   * {startTime: {hour: 9, minute:30}, endTIme: {hour: 10, minute: 20}} is returned
   * The timeString must include exactly one "-" in it, else null is returned.
   * @param timeString a string with two times separated by a "-"
   */
  function parseTimeRow(timeString) {
    var pmInString = timeString.includes("PM");
    timeString = timeString.replace("PM", "").trim();
    var splitTimeString = timeString.split("-").map(x => x.trim());
    if (splitTimeString.length !== 2) {
      console.error("incorrect time string: " + timeString);
      return null;
    } else {
      var startMinute = getMinute(splitTimeString[0]);
      var endMinute = getMinute(splitTimeString[1]);

      // assume that the time is in PM if true
      if (startMinute < EARLIEST_START_TIME_MINUTES || pmInString) {
        startMinute += TWELVE_HOURS_IN_MINUTES;
        endMinute += TWELVE_HOURS_IN_MINUTES;
      }
      return { startTime: { hour: startMinute / 60, minute: startMinute % 60 }, endTime: { hour: endMinute / 60, minute: endMinute % 60 } };
    }
  }

  /**
   * Accepts an array of ics standard weekdays and returns how many days after the INSTRUCTION_BEGINS day
   * that an event should have its first occurrence
   * @param {*} weekdays a non-empty array containing ics-style days
   */
  function getStartDateOffset(weekdays) {
    var instructionBeginsWeekdayNumber = new Date(INSTRUCTION_BEGINS.year, INSTRUCTION_BEGINS.month, INSTRUCTION_BEGINS.day).getDay();
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
            var beginDateTempObject = { ...INSTRUCTION_BEGINS, hour: beginTime.hour, minute: beginTime.minute };
            var endDateTempObject = { ...INSTRUCTION_BEGINS, hour: endTime.hour, minute: endTime.minute };
            var startDateOffset = getStartDateOffset(parsedDayRows[i]);

            let event = {
              subject: tableRow["course"], description: tableRow["title"] + "(" + tableRow["type"].trim() + ")", location: tableRow["location"],
              beginDate: (new Date(beginDateTempObject.year, beginDateTempObject.month, beginDateTempObject.day,
                beginDateTempObject.hour, beginDateTempObject.minute)).addDays(startDateOffset),
              endDate: new Date(endDateTempObject.year, endDateTempObject.month, endDateTempObject.day, endDateTempObject.hour, endDateTempObject.minute),
              rrule: { freq: "WEEKLY", until: LAST_DAY_OF_INSTRUCTION, interval: 1, byday: parsedDayRows[i] }, uidHelper: (tableRow["sln"] + "_" + i)
            };
            eventList.push(event);
          }
        }
      }
    }
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
  }, []);

  const useStyles = makeStyles({
    table: {
      height: '300px',
      overflowY: 'auto'
    },
    tableHeader: {
      backgroundColor: '#b7a57a',
      fontSize: '1rem',
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
      overflow: "hidden"
    }
  });

  const classes = useStyles();

  function onRenderEvents() {
    return events.map(event => <TableRow>
      <TableCell className={classes.tableRow}>{event["subject"]}</TableCell>
      <TableCell className={classes.tableRow} align="right">{event['rrule'].byday.join(', ')}</TableCell>
      <TableCell className={classes.tableRow} align="right">{event['beginDate'].getHours() + ':' + event['beginDate'].getMinutes()}</TableCell>
      <TableCell className={classes.tableRow} align="right">{event['endDate'].getHours() + ':' + event['endDate'].getMinutes()}</TableCell>
      <TableCell className={classes.tableRow} align="right">{event["location"]}</TableCell>
    </TableRow>)
  }

  return (
    <div className={classes.App}>
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
