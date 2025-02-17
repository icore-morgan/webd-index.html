

const EVENT_STATUS = {
  normal : "Confirmed",
  unattended : "Unattended",
  support : "Support",
  shutdown : "Shutdown",
  canceled : "Canceled",
  editing : "EDITING"
};
const EVENT_FORMAT = {
  [EVENT_STATUS.normal] : {
    backgroundColor: "#00A3E4",
    borderColor: "#0077C8",
    textColor: "white",
  },
  [EVENT_STATUS.unattended]: {
    backgroundColor: "#D0D4D7",
    borderColor: "#5E6970",
    textColor: "black",
  },
  [EVENT_STATUS.support]: {
    backgroundColor: "#FFC423",
    borderColor: "#D48500",
    textColor: "black",
  },
  [EVENT_STATUS.canceled]: {
    backgroundColor: "#923B05",
    borderColor: "#923B05",
    textColor: "black",
  },
  [EVENT_STATUS.shutdown]: {
    backgroundColor: "Black",
    borderColor: "#D0D4D7",
    textColor: "White",
    display: "background",
  },
  [EVENT_STATUS.editing]: {
    backgroundColor: "#5D9632",
    borderColor: "#5D9632",
    textColor: "white",
    
  },
  default: {
    backgroundColor: "#00A3E4",
    borderColor: "#0077C8",
    textColor: "white",
  }
};

function fetchEvents(fetchInfo) {
//  { start, end, startStr, endStr, timeZone }
//  https://fullcalendar.io/docs/events-function

  const { start, end, index } = fetchInfo;
  const { id: id } = SETTINGS.SOURCES[index];
  const layout = SETTINGS.QUERY.layout;
  const FIELDS = SETTINGS.QUERY.fields;

  let query = {
    layouts: layout,
    limit: 1000,
    offset: 1,
    query: [
      {
        [FIELDS.start]: `< ${getTimestampString(end)}`,
        [FIELDS.end]: `> ${getTimestampString(start)}`,
        [FIELDS.key]: `${id}`,
      },
//      {
//        [FIELDS.end]: `${getTimestampString(start)}...${getTimestampString(end)}`,
//        [FIELDS.key]: `${id}`,
//      },
    ],
  };

  let param = {
    method: API + ".fetchEvents",
    config: { webviewer: WEBVIEWER, function: "" },
    data: { query, source : index },
  };

  let events = PerformCallback(SCRIPT, param, {
    timeOut: 30000,
    scriptOption: 5
  });
//  calendar.scrollToTime('8:00:00');
  return events;
}
/*
function sourceSuccess(rawEvents, index){

  return rawEvents.response.data;
}*/

function getEventFields(table, fields){

  const FIELDS = fields;
  let eventFields = {};
  for (const key in FIELDS) {
    let field = FIELDS[key];
    eventFields[key] = getFieldName(table, field);
  }

  return eventFields;
}

function getFieldName (table, field) {
  const [tableName, fieldName] = field.split("::");

  if (table != tableName) return field;
  else return fieldName;
}

function formatEvent(eventInfo) {
  // COLOR BASED ON STATUS = CONFIRMED | CANCELED | UNATTENDED | SUPPORT | EDITING
  // DISPLAY BASED ON STATUS = SHUTDOWN
  // NOT CONVERTED TO EVENT OBJECT YET


  formatting = EVENT_FORMAT[eventInfo.status] ? EVENT_FORMAT[eventInfo.status] : EVENT_FORMAT.default;
  Object.assign(eventInfo, formatting);
  if ( eventInfo.status == "EDITING" ) {
    SETTINGS.CALENDAR.editing = true;
    eventInfo.editable = true;
  }

  return eventInfo;
};

function createEvent(eventInfo) {
  /**
   * Triggered from Calendar:select or Calendar:dateClick
   * {start, end, allDay, jsEvent, view, resource*}
   * Not Converted to Event Object yet
   * 
   * Validate Event
   * Confirm with User
   *  ->viewEvent
   *  ->newEvent
   * 
   */

  // FORMAT EVENT FOR isValid
  // {start, end, extendedProps.person, extendedProps.status, resource{id,extendedProps.status}}
  let event = {
    start: eventInfo.start,
    end: eventInfo.end,
    resource: eventInfo.resource,
    extendedProps: {
      person : SETTINGS.USER.id,
      status : EVENT_STATUS.normal,

      // FORMAT FOR ADDEVENT
      room : SETTINGS.CALENDAR.id, //person or room?? CALENDAR?
//      name : SETTINGS.USER.name,
      resourceUUIDs : [],
    },
    resourceIds: [],
    title: SETTINGS.CALENDAR.title,
  }

  let result = isValid(event);
  if (!result.response || result.message != 'OK') {
    toaster(result.message);
    if (!result.response) return result.response;
  } else if (document.getElementById("warning")) bootstrap.Toast.getOrCreateInstance(document.getElementById("warning")).hide();

  // FORMAT FOR ADDEVENT
  if (event.resource?.id && event.resource.id != SETTINGS.CALENDAR.id) {
    event.resourceIds.push(event.resource.id);
    event.extendedProps.resourceUUIDs.push(event.resource.id);
  }
  // APPLY PRIMARY RESOURCE
  event.resourceIds.push(SETTINGS.CALENDAR.id); //person or room?
//  event.extendedProps.room = SETTINGS.CALENDAR.id;

  SETTINGS._EVENT = { event };
  // REMOVE STATUS FOR MODAL
  let modal = {
    event : {
      ...event,
      status: '',
      extendedProps: {
  //      title: SETTINGS.CALENDAR.title, //name or location??
        name : SETTINGS.USER.name,
        location : SETTINGS.CALENDAR.title, //name or location??
        resources : [ eventInfo.resource ],
      }
    },

    title: "Confirm New Event",
    close : `onclick="calendar.unselect()"`,
    footer: `
        <button type="button" onclick="calendar.unselect()" class="btn btn-warning" data-bs-dismiss="modal">Cancel</button>
        <button type="button" onclick="viewEvent()" class="btn btn-primary" data-bs-dismiss="modal">Edit</button>
        <button type="button" onclick="newEvent()" class="btn btn-success" data-bs-dismiss="modal">Confirm</button>`
  };

  showModal(modal);
}

function newEvent() {
  /**
   * Comes from createEvent Modal
   * Passed validation
   * 
   * not an Event Object yet
   * 
   */
  let event = SETTINGS._EVENT.event;
  delete SETTINGS._EVENT;



  calendar.addEvent( event, true );
  // Triggers Calendar.eventAdd(addInfo)
  // => addEvent

};
function addEvent(addInfo) {
  /**
   * Comes from newEvent -> eventAdd
   * { event, relatedEvents, revert }
   * 
   * Event Object
   */

  let event = addInfo.event.toPlainObject();
  let notify = SETTINGS.USER.id != event.extendedProps.person;
  /**
   * EVENT: {
      *start
      *end
      title

      extendedProps: {
        *person
        *room
        *resourceUUIDs

        *name ?
        *location ?
        *status
        resources {}
//        key = source (sources)

        account = Task
        notes = notes

        supervisor
        creator

      }

      }
   */

  // VERIFY EVENT IN FM and Create
  let param = {
    method: API + ".newEvent",
    config: { webviewer: WEBVIEWER, function: "refetchEvents" },
    data: {
      event: {
        ...event, 
        start: getTimestampString(event.start), 
        end: getTimestampString(event.end),
      },
      notify
    },
  };
  FileMaker.PerformScriptWithOption(
    SCRIPT,
    JSON.stringify(param),
    5
  );
}

function deleteEvent(eventID) {
  calendar.getEventById(eventID).remove();
  // Triggers calendar.eventRemove(eventInfo) 
  // => removeEvent
}
function removeEvent(removeInfo) {
  // {event, relatedEvents, revert}

  let event = removeInfo.event.toPlainObject();
  let notify = SETTINGS.USER.id != event.extendedProps.person;

  let param = {
    method: API + ".eventRemove",
    config: { webviewer: WEBVIEWER, function: "" },
    data: { event , notify },
  };
  FileMaker.PerformScriptWithOption(
    SCRIPT,
    JSON.stringify(param),
    5
  );
}

function changeEvent (changeInfo) {
  /**
   * comes from calendar.eventChange()
   * { event, relatedEvents, oldEvent, revert }
   * 
   * Event Object
   * Already Passed (eventOverlap, eventAllow)
   * 
   */
  let eventInfo = changeInfo;

//  let event = SETTINGS._EVENT; //??
  SETTINGS._EVENT = eventInfo;
  if (SETTINGS.USER.id != eventInfo.event.extendedProps.person) {
    //CREATE MODAL CONFIRMATION
    eventInfo.title = "Confirm Update";
    eventInfo.close = `onclick="eventUpdated(false)"`;
    eventInfo.footer = `
      <button type="button" onclick="eventUpdated(false)" class="btn btn-warning" data-bs-dismiss="modal">Cancel</button>
      <button type="button" onclick="updateEvent('${eventInfo.event.id}',true)" class="btn btn-secondary" data-bs-dismiss="modal">Confirm and Notify</button>
      <button type="button" onclick="updateEvent('${eventInfo.event.id}')" class="btn btn-primary" data-bs-dismiss="modal">Confirm</button>`;
    showModal(eventInfo);

  } else {
    //    console.log(eventInfo);
    updateEvent(eventInfo.event.id);
  }
}

function updateEvent(eventID, notify) {
  /**
   * comes from changeEvent() modal
   * SETTINGS._EVENT = { event, relatedEvents, oldEvent, revert }
   * 
   * Event Object
   * Already Passed (eventOverlap, eventAllow)
   * 
   */

  //SETTINGS._EVENT HAS EVENT FOR REVERT
  //{ event, relatedEvents, oldEvent, revert }
//  let event = SETTINGS._EVENT.event;
//  let resources = SETTINGS._EVENT.event.getResources().filter(Boolean).map(function(resource) { return { id: resource.id, title: resource.title } });
  
//  resourceIds = resources.filter(Boolean).map(function(resource) { return resource.id });
  resourceIds = SETTINGS._EVENT.event.getResources().filter(Boolean).map(function(resource) { return resource.id });
  // REMOVE ROOM RESOURCE ID
  resourceIds.shift();

//  eventInfo.extendedProps.resources = resources;
//  event.setExtendedProp('resources', resources );
let event = SETTINGS._EVENT.event.toPlainObject();
event.extendedProps.resourceUUIDs = resourceIds;
/*
let event = {
  start: eventInfo.start,
  end: eventInfo.end,
//  resource: eventInfo.resource,
//  title: SETTINGS.CALENDAR.title, //name or location??
  extendedProps: {
//    person : SETTINGS.USER.id, ALREADY SET
    status : EVENT_STATUS.normal,

    // FORMAT EVENT FOR MODAL
//    name : SETTINGS.USER.name,
//    location : SETTINGS.CALENDAR.title, //name or location??
 //   resources : [ eventInfo.resource ],

    // FORMAT FOR ChangeEVENT
//    room : SETTINGS.CALENDAR.id, //person or room??  ALREADY SET
    resourceUUIDs : resourceIds,
  },
//  resourceIds: [],
}
*/
delete SETTINGS._EVENT;
document.querySelectorAll(`[id="popover.${eventID}"]`).forEach((el) => {
  createPopover( {event: event, el} );
});

  let param = {
    method: API + ".eventChange",
    config: { webviewer: WEBVIEWER, function: "" },
    data: { event: { 
      ...event, 
      start: getTimestampString(event.start), 
      end: getTimestampString(event.end), 
//      notify: notify,
//      key : key
     },
    notify: notify },
  };
  FileMaker.PerformScriptWithOption(
    SCRIPT,
    JSON.stringify(param),
    5
  );
};

function viewEvent(eventID) {
  let event;
  if ( !eventID ) {
    event = SETTINGS._EVENT.event;
    delete SETTINGS._EVENT;
  } else {
    event = calendar.getEventById(eventID);
  }
  event.start = getTimestampString(event.start);
  event.end = getTimestampString(event.end);

  let param = {
    method: API + ".eventClick",
    config: { webviewer: WEBVIEWER, function: "refetchEvents" },
    data: { event },
  };
  FileMaker.PerformScriptWithOption(
    SCRIPT,
    JSON.stringify(param),
    5
  );
};
function eventUpdated(success){
//CALLED AFTER EVENT VERIFY IN FM??
//{response, message} ??
  if (success != true) {
    SETTINGS._EVENT.revert(); 
  }
  delete SETTINGS._EVENT;
}

function createPopover(arg) {
//  { event, el }
  let event = arg.event;

  let edit = event.startEditable || event.durationEditable ? `
    <i class="bi bi-pencil-fill"></i>` : "";
  let name = event.title == event.extendedProps?.location ? event.extendedProps?.name : event.extendedProps.location;
  let title = `
    <div class="d-flex justify-content-between">
      <div>${event.title}</div>
      <div class="px-2"></div>
      <div>${edit}</div>
    </div>
    <div class="small">${name}</div>`;

//console.log(event.start);
//console.log(event.end);

  let rangeFormat = {
    hour: "numeric",
    minute: "2-digit"
  };
  if (event.allDay == true) {
    rangeFormat = {
      month: "numeric",
      day: "2-digit"
    };
//  } else if (event.start.getDate() != event.end.getDate()) {
    } else if (getDate(event.start) != getDate(event.end)) {
    rangeFormat = {
      ...rangeFormat,
      month: "numeric",
      day: "2-digit"
    };
  };
  let range = `<div>${calendar.formatRange(event.start, event.end, rangeFormat)}</div>`;

//  let resources = "";
//  console.log(event.extendedProps?.resources);
//  let resource = arg.resources ?? event.extendedProps?.resources;
  let resources = '';
  if (event.extendedProps.resources?.[0] ?? false) {
    event.extendedProps.resources.forEach((resource) => {
      resources += `<li>${resource.title}</li>`;
    });
    resources = `<div class="mt-2">Resources:
    <ul>${resources}</ul></div>`;
  };

  let notes = "";
  if (event.extendedProps?.notes) {
    notes = `<div>Notes: <em>${event.extendedProps.notes}</em></div>`
  }
  
  const content = `
    <div><strong>${event.extendedProps.status}</strong></div>
    ${range}
    ${resources}
    ${notes}`;
  /*
    Object.assign( arg.el, {
      [data-bs-toggle] : "popover",
      [data-bs-trigger] : "hover",
      [data-bs-placement] : "left",
      [data-bs-html] : "true",
      [data-bs-content] : content,
      [title] : `<div class="d-flex justify-content-between"><div>${event.title}</div>${edit}</div>`
    });
  */

  let popover = bootstrap.Popover.getInstance(arg.el);
  if ( popover ) popover.dispose();

  arg.el.setAttribute("id", "popover."+event.id);
  arg.el.setAttribute("data-bs-toggle", "popover");
  arg.el.setAttribute("data-bs-trigger", "hover");
  arg.el.setAttribute("data-bs-placement", "left");
  arg.el.setAttribute("data-bs-html", "true");
  arg.el.setAttribute("data-bs-content", content);
  arg.el.setAttribute("data-bs-title", title);

  bootstrap.Popover.getOrCreateInstance(arg.el);
};
function showModal(eventInfo) {

  let event = eventInfo.event;
  //CREATE MODAL CONFIRMATION
  let element;
  if (document.getElementById("eventConfirmationModal")) {
    element = document.getElementById("eventConfirmationModal");
  } else {
    element = document.createElement("div");
    document.body.appendChild(
      Object.assign(element, {
        id: "eventConfirmationModal", className: "modal fade"
      }));
  }

//  let title = eventInfo.title == eventInfo.extendedProps?.name ? eventInfo.extendedProps.name : eventInfo.extendedProps?.location;
  let name = eventInfo.title != event.extendedProps?.name ? `<div>${event.extendedProps.name}</div>` : "";
  let location = eventInfo.title != event.extendedProps?.location ? `<div>${event.extendedProps.location}</div>` : "";
  let status = event.extendedProps?.status ? `<div><strong>${event.extendedProps.status}</strong></div>` : "";

  let date = "";
  let rangeFormat = {
    hour: "numeric",
    minute: "2-digit"
  };
//  let start = calendar.formatDate(event.start,rangeFormat)+"<br>";
  if (event.start.getDate() != event.end.getDate()) {
    rangeFormat = {
      ...rangeFormat,
      month: "numeric",
      day: "2-digit"
    };
  } else {
    date = calendar.formatDate(event.start,{
      month: "numeric",
      day: "2-digit",
      weekday: "long",
    })+"<br>";
  };
  let range = `<div>${date}${calendar.formatRange(event.start, event.end, rangeFormat)}</div>`;

  let account = event.extendedProps?.account ? `<div class="mt-1">Charge Code: ${event.extendedProps.account}</div>` : "";

  let resources = '';
  if (event.extendedProps.resources?.[0] ?? false) {
    event.extendedProps.resources.forEach((resource) => {
      resources += `<li>${resource.title}</li>`;
    });
    resources = `<div class="popover-label-sm mt-2">Resources:
    <ul>${resources}</ul></div>`;
  };

  let notes = event.extendedProps?.notes ? `
    <div class="popover-label-sm mt-2">Notes:
    <div class="popover-notes mb-2"><em>${event.extendedProps.notes}</em></div>
    ` : "";

  const contentHeader = `
    <div class="modal-header">
      <div>
      <div class="h5">${eventInfo.title}</div>
      ${name}
      ${location}
      </div>
      <button type="button" ${eventInfo.close} class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
    </div>`;
  const contentBody = `
    <div class="modal-body">

      ${status}
      ${range}
      ${account}
      ${resources}
      ${notes}
    </div>`;
  const contentFooter = eventInfo.footer ? `
      <div class="modal-footer justify-content-between">
        ${eventInfo.footer}
      </div>
    ` : "";

  element.innerHTML = `
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        ${contentHeader}
        ${contentBody}
        ${contentFooter}
      </div>
    </div>`;

  let modal = new bootstrap.Modal(element);
  modal.toggle();
}



