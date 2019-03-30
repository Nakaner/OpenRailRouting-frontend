"use strict";

var startLatitude = 50.9; // initial latitude of the center of the map
var startLongitude = 10.7; // initial longitude of the center of the map
var startZoom = 7; // initial zoom level

// define base map and overlays
var route = L.layerGroup([]);
var ORMTilesLayer = L.tileLayer('http://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', {
//    maxZoom: 18,
    maxZoom: 18
//    attribution: '<a href="http://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>, Style: <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA 2.0</a> <a href="http://www.openrailwaymap.org/">OpenRailwayMap</a> and OpenStreetMap'
});
var osmOrgTilesLayer = L.tileLayer("//{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19
//    attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, imagery CC-BY-SA'
});

// set current layer
var currentBaseLayer = osmOrgTilesLayer;


// layer control
var baseLayers = {'OSM Carto': osmOrgTilesLayer};
var overlays = {'OpenRailwayMap Infrastructure': ORMTilesLayer};
var overlaysMeta = {
    'OpenRailwayMap Infrastructure': 'orm_infrastructure'
};

var activeLayers = [];
var defaultOverlays = [];
var initialLayers = [osmOrgTilesLayer, route];

var routeMarkerOptions = {
    shadowUrl: 'images/marker-shadow.png',
    iconSize: [27, 44],
    iconAnchor: [13.5, 44],
    popupAnchor: [1, -34],
    tooltipAnchor: [16, -28],
    shadowSize: [41, 41]
};
var RouteMarker = L.Icon.extend({
    options: routeMarkerOptions
});

var markerIconsPaths = {
    'start': 'images/marker-green.svg',
    'via': 'images/marker-blue.svg',
    'end': 'images/marker-red.svg'
};

var mymap; // the Leaflet map instance
var layerControl;
var attributionControl;
var markers = [null, null];

// drag and drop global vars
var dragSrc = null;

function getLayerNameByID(layerID) {
    var name = '';
    Object.keys(overlaysMeta).forEach(function(key){
        if (overlaysMeta[key] == layerID) {
            name = key;
        }
    });
    return name;
}

function parseUrl(url) {
    var keyValues = location.hash.substr(1).split("&");
    var queryParams = {};
    keyValues.forEach(function(item) {
        var kV = item.split('=');
        if (kV.length == 1) {
            queryParams[item] = '';
        } else {
            try {
                queryParams[kV[0]] = decodeURIComponent(kV[1]);
            } catch (e) {
                console.error(e)
            }
        }
    });
    // set default overlays
    var wantedOverlays = defaultOverlays;
    if (queryParams.hasOwnProperty('overlays')) {
        wantedOverlays = queryParams['overlays'].split(',');
    }
    wantedOverlays.forEach(function(layerID) {
        // get layer name
        var wantedName = getLayerNameByID(layerID);
        if (wantedName != '') {
            initialLayers.push(overlays[wantedName]);
            activeLayers.push(wantedName);
        }
    });

    // set lat, lon, zoom
    if (queryParams.hasOwnProperty('zoom') && !isNaN(queryParams['zoom'])) {
        startZoom = queryParams['zoom'];
    }
    if (queryParams.hasOwnProperty('lat') && !isNaN(queryParams['lat']) && queryParams.hasOwnProperty('lon') && !isNaN(queryParams['lon'])) {
        startLatitude = queryParams['lat'];
        startLongitude = queryParams['lon'];
    }
}


function updateAttribution() {
    attributionControl.remove();
    attributionControl = L.control.attribution();
    attributionControl.addAttribution('Basiskarte © <a href="//www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Kartengrafik <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>')
    if (activeLayers.indexOf('OpenRailwayMap Infrastruktur')  != -1) {
        attributionControl.addAttribution('Streckennetz: CC-BY-SA <a href="http://openstreetmap.org/copyright">OpenStreetMap</a> und <a href="http://www.openrailwaymap.org">OpenRailwayMap</a>');
    }
    attributionControl.addTo(mymap);
}

// functions executed if the layer is changed or the map moved
function updateUrl(newBaseLayerName, overlayIDs) {
    if (newBaseLayerName == '') {
        newBaseLayerName = 'OSM Carto';
    }
    var origin = location.origin;
    var pathname = location.pathname;
    var newurl = origin + pathname + '#overlays=' + overlayIDs + '&zoom=' + mymap.getZoom() + '&lat=' + mymap.getCenter().lat.toFixed(6) + '&lon=' + mymap.getCenter().lng.toFixed(6);
    history.replaceState('', document.title, newurl);
}

function getViaFieldId(index) {
    return "point_" + index;
}

function updateInputFields() {
    var viaUl = document.getElementById('vias');
    var viaBlocks = viaUl.querySelectorAll('.pointBlock');
    // remove existing viaBlocks except of the first one
    var i;
    for (i = 1; i < viaBlocks.length - 1; i++) {
        // remove all input fields except first and last one
        viaUl.removeChild(viaBlocks[i]);
    }
    // rename last viaBlock
    viaBlocks[viaBlocks.length - 1].id = 'pointBlock' + (markers.length - 1);
    viaBlocks[viaBlocks.length - 1].querySelector('input').id = getViaFieldId(markers.length - 1);
    // create enought empty viaBlocks
    var k;
    var pointBlock1 = viaUl.querySelector('li.pointBlock');
    for (k = 1; k < markers.length - 1; k++) {
        var newBlock = pointBlock1.cloneNode(true);
        newBlock.id = 'pointBlock' + k;
        newBlock.querySelector('label').innerHTML = 'via <span class="inputDescription">(lat, lon)</span>';
        newBlock.querySelector('input').id = getViaFieldId(k);
        newBlock.querySelector('input').value = '';
        newBlock.querySelector('input').setAttribute('point-index', k);
        if (k > 0) {
            newBlock.querySelector('img').src = markerIconsPaths.via;
        }
        pointBlock1.parentNode.insertBefore(newBlock, viaBlocks[viaBlocks.length - 1]); // insert before last point
    }
    // add/update fields
    var i;
    for (i = 0; i < markers.length; i++) {
        if (!markers[i]) {
            continue;
        }
        var value = markers[i].getLatLng().lat.toFixed(5) + "," + markers[i].getLatLng().lng.toFixed(5);
        var viaId = getViaFieldId(i);
        document.getElementById(viaId).value = value;
    }
    registerDragDropEventsForAll();
}

/**
 * update point-index properties of input fields for via points
 */
function updateViaIndexes() {
    var vias = Array.prototype.slice.call(document.getElementsByClassName('pointInputField'));
    for (var i = 0; i < vias.length; ++i) {
        vias[i].setAttribute('point-index', i + 1);
    }
}

function updateMarkersList() {
    var points = Array.prototype.slice.call(document.getElementsByClassName('pointInputField'));
    // Vias is sorted by the order of the input fields in the DOM.
    // remove old markers from map
    markers.forEach(function(m) {
        m.removeFrom(mymap);
    });
    markers = [];
    // add start marker
    // update point indexes and add new markers
    for (var i = 0; i < points.length; ++i) {
        points[i].setAttribute('point-index', i);
        points[i].id = getViaFieldId(i);
        var latlng = parseCoordsFromStr(points[i].value);
        var markerType = 'via';
        if (i === 0) {
            markerType = 'start';
        } else if (i === points.length - 1) {
            markerType = 'end';
        }
        points[i].parentNode.getElementsByTagName('img')[0].src = markerIconsPaths[markerType];
        console.log('going to addMarker with index ' + (i) + ' and markers: ' + markers);
        addMarker(latlng, i + 1, markerType, true, function(){});
        //var marker = L.marker(latlng, {draggable: true}).bindPopup(getMarkerPopupContent(i));
        //markers[i] = marker;
        //marker.addTo(mymap);
    }
}

function getRemoveButtonId(index) {
    return 'remove-button-' + index;
}

function getMarkerPopupContent(index, message) {
    if (message === 'start') {
        return '<b>start</b>';
    }
    if (message === 'end') {
        return '<b>end</b>';
    }
    return '<b>via ' + index + '</b><br><button type="button" onclick="removeMarker(' + index + ')">Remove</button>';
}

function addMarker(latlng, index, message, insert /*= false*/, callbackAfter) {
    if (markers.length >= 9) {
        // too much vias
        return;
    }
    insert = insert || false;
    var marker = L.marker(latlng, {draggable: true}).bindPopup(getMarkerPopupContent(index, message));
    if ((message === 'start' || index === 0) && message != 'end') {
        if (markers[0] != null) {
            markers[0].remove();
        }
        marker.setIcon(new RouteMarker({iconUrl: markerIconsPaths.start}));
        markers[0] = marker;
    } else if (message === 'end' || (index === markers.length - 1 && !insert)) {
        if (index < markers.length && markers[index] != null) {
            markers[index].remove();
        }
        marker.setIcon(new RouteMarker({iconUrl: markerIconsPaths.end}));
        markers.splice(index, 1, marker);
    } else {
        marker.setIcon(new RouteMarker({iconUrl: markerIconsPaths.via}));
        if (insert) {
            // interprete as insertion of a new via point before the last point
            markers.splice(index, 0, marker);
        } else {
            // interprete as overwrite
            markers[index] = marker;
        }
    }
    // update texts of all via markers
    for (var i = 1; i < markers.length - 1; i++) {
        markers[i].setPopupContent(getMarkerPopupContent(i, null));
    }
    // update text input field entries in the form
    callbackAfter();
    // updateInputFields();
    marker.on('dragend', function(e){
        updateInputFields();
        tryGetRoute();
    });
    marker.addTo(mymap);
}

function removeMarker(index) {
    var thisMarker = markers[index];
    thisMarker.removeFrom(mymap);
    // remove marker from array
    markers.splice(index, 1);
    // update all markers
    for (var i = 1; i < markers.length - 1; i++) {
        markers[i].setPopupContent(getMarkerPopupContent(i, null));
    }
    updateInputFields();
    tryGetRoute();
}

/**
 * Get the index in the list of waypoint markers where the new waypoint should be inserted.
 */
function getNextPoints(latlng) {
    var distances = [];
    var i;
    // get distances to all existing waypoints
    for (i = 0; i < markers.length; i++) {
        if (!markers[i]) {
            continue;
        }
        distances.push({'index': i, 'distance': mymap.distance(latlng, markers[i].getLatLng())});
    }
    // sort by distance ascending 
    distances.sort(function(a, b) {
        return a.distance - b.distance;
    });
    // Get indexes of the closest waypoint:
    var closest = [distances[0]];
    // Get the neighbour of this waypoint which is closer to the new location.
    // First sort distances by index again.
    distances.sort(function(a, b) {
        return a.index - b.index;
    });
    if (closest[0].index === 0) {
        // corner case: our closest point is the beginning of the route
        closest[1] = distances[1];
    } else if (closest[0].index === distances.length - 1) {
        // corner case: our closest point is the end of the route
        closest[1] = distances.slice(-2, -1)[0];
    } else if (distances[closest[0].index - 1].distance < distances[closest[0].index + 1].distance) {
        closest[1] = distances[closest[0].index - 1];
    } else {
        closest[1] = distances[closest[0].index + 1];
    }
    // Order closest waypoints by their index to preserve order, they are now called
    // point 1 and 2:
    closest.sort(function(a, b) {
        return a.index - b.index;
    });
    // The new waypoint can be inserted at one of the following three positions:
    // before point 0, between point 1 and 2 and after point 2
    var dist01 = 0;
    var dist0N = Infinity;
    if (closest[0].index > 0) {
        dist01 = mymap.distance(markers[closest[0].index - 1].getLatLng(), markers[closest[0].index].getLatLng());
        dist0N = mymap.distance(markers[closest[0].index - 1].getLatLng(), latlng);
    }
    var dist23 = 0;
    var distN3 = Infinity;
    if (closest[1].index + 1 < markers.length) {
        dist23 = mymap.distance(markers[closest[1].index + 1].getLatLng(), markers[closest[1].index].getLatLng());
        distN3 = mymap.distance(latlng, markers[closest[1].index].getLatLng());
    }
    var dist12 = mymap.distance(markers[closest[0].index].getLatLng(), markers[closest[1].index].getLatLng());
    var sum0N123 = dist0N + closest[0].distance + dist12 + dist23;
    var sum01N23 = dist01 + closest[0].distance + closest[1].distance + dist23;
    var sum012N3 = dist01 + dist12 + closest[1].distance + dist23;
    if (sum0N123 < sum01N23) {
        if (sum0N123 < sum012N3) {
            return closest[0].index;
        }
        return closest[1].index + 1;
    } else {
        if (sum01N23 < sum012N3) {
            return closest[1].index;
        }
        return closest[0].index + 1;
    }
}

function showLoading(turnOn) {
    var loading = document.getElementById('loading');
    if (turnOn) {
        loading.style.visibility = 'visible';
    } else {
        loading.style.visibility = 'hidden';
    }
}

function displayError(message) {
    var errorDiv = document.getElementById('routingErrorMessage');
    errorDiv.style.display = 'none';
    errorDiv.innerHTML = 'Routing error: ';
    errorDiv.style.display = 'block';
    errorDiv.innerHTML += message;
}

function displayRouteGH(response) {
    route.clearLayers();
    var errorDiv = document.getElementById('routingErrorMessage');
    errorDiv.style.display = 'none';
    if (!response.hasOwnProperty('paths')) {
        if (response.hasOwnProperty('message')) {
            displayError(response.message)
        } else {
            displayError("Unknown error");
        }
    } else {
        var raw_points = response['paths'][0]['points']['coordinates'];
        raw_points.forEach(function(loc){
            // remove elevation
            loc = loc.slice(0, 2);
        });
        raw_points.forEach(function(loc){
            loc = loc.reverse();
        });
        var polyline = L.polyline(raw_points, {'color': 'red'});
        mymap.fitBounds(polyline.getBounds());
        route.addLayer(polyline);
    }
}

// load available flag encoders
function loadInfos() {
    var xhr = new XMLHttpRequest();
    var url = 'https://routing.openrailwaymap.org/info?type=json';
    xhr.open('GET', url, true);
    xhr.setRequestHeader("Content-type", "application/json");
    xhr.responseType = "json";
    xhr.onreadystatechange = function() {
        if(xhr.readyState == XMLHttpRequest.DONE && xhr.status == 200) {
            if (!xhr.response.hasOwnProperty('supported_vehicles')) {
                displayError('The response by the routing API does not list any supported routing profile.');
            }
            var supported_vehicles = xhr.response.supported_vehicles;
            var vehicleSelect = document.getElementById('vehicle');
            supported_vehicles.forEach(function(elem) {
                var optionElement = document.createElement("option");
                optionElement.text = elem;
                vehicleSelect.add(optionElement);
            });
            vehicleSelect.value = supported_vehicles[0];
        }
    }
    xhr.onerror = function() {
        displayError('Failed to fetch basic info about the routing API.');
    };
    xhr.send();
}

function showLoading(turnOn) {
    var loading = document.getElementById('loading');
    if (turnOn) {
        loading.style.display = 'block';
        document.getElementById('submit').disabled = true;
    } else {
        loading.style.display = 'none';
        document.getElementById('submit').disabled = false;
    }
}

/**
 * Call the routing API.
 */
function getGHRoute(points, vehicle) {
    showLoading(true);
    // build points parameter
    var pointsStr = '';
    var i, l, p;
    for (i = 0, l = points.length; i < l; i++) {
        p = points[i];
        if (!p.lat || !p.lng) {
            continue;
        }
        if (i > 0) {
            pointsStr += '&';
        }
        if (p.lat && p.lng) {
            pointsStr += 'point=' + encodeURIComponent(p.lat + ',' + p.lng);
        }
    }
    var url = 'https://routing.openrailwaymap.org/route?points_encoded=false&' + pointsStr + '&vehicle=' + encodeURIComponent(vehicle);
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = "json";
    xhr.onreadystatechange = function() {
        if(xhr.readyState == XMLHttpRequest.DONE /*&& xhr.status == 200*/) {
            displayRouteGH(xhr.response);
            showLoading(false);
        }
    }
    xhr.send();
}

function getStartAndEnd() {
    var pointList = markers.map(x => {
        if (x != null) {
            return x.getLatLng();
        }
        return null;
    });
    return pointList;
}

function requestPointsValid(points) {
    var valid = true;
    points.forEach(function(e) {
        valid = (valid && (e != null));
    });
    return valid;
}

function parseCoordsFromStr(str) {
    if (str.match(/^-?\d+(\.\d+),-?\d+(\.\d+)$/)) {
        var lat, lng;
        var values = str.split(',');
        return L.latLng(values[0], values[1]);
    }
    return null;
}

function getAndDisplayRoute(e) {
    var points = getStartAndEnd();
    if (!requestPointsValid(points)) {
        //TODO Is this still necessary?
        // fill with coordinates from text input fields
        var start = parseCoordsFromStr(document.getElementById(getViaFieldId(0)).value);
        var end = parseCoordsFromStr(document.getElementById(getViaFieldId(markers.length - 1)).value);
        points = [start, end];
    }
    if (points[0] != null && points[points.length - 1] != null) {
        getGHRoute(points, document.getElementById('vehicle').value);
    }
}

/**
 * Try to send a route request.
 * If the start or the end point has not been set yet, this function does nothing.
 */
function tryGetRoute() {
    var points = getStartAndEnd();
    if (requestPointsValid(points)) {
        getGHRoute(points, document.getElementById('vehicle').value);
    }
}

function setStartFromMap(e) {
    addMarker(e.latlng, 0, 'start', false, function(){});
    document.getElementById(getViaFieldId(0)).value = e.latlng.lat + "," + e.latlng.lng;
    tryGetRoute();
}

function setEndFromMap(e) {
    // check if end is set so far
    var inputFields = document.querySelectorAll('input.pointInputField');
    addMarker(e.latlng, markers.length - 1, 'end', false, function(){});
    document.getElementById(getViaFieldId(markers.length - 1)).value = e.latlng.lat + "," + e.latlng.lng;
    tryGetRoute();
}

function addVia(coords, index) {
    addMarker(coords, index, 'via', true, updateInputFields);
    tryGetRoute();
}

function setViaFromMap(e) {
    // existing number of vias
    var currentVias = markers.length - 2;
    if (currentVias == 0) {
        // set first via
        addVia(e.latlng, 1);
    } else {
        var index = getNextPoints(e.latlng);
        addVia(e.latlng, index);
    }
}

function formEnterKeyPressed(event, callable) {
    if (event.keyCode == 13) {
        callable();
    }
}

function getCurrentOverlays() {
    var overlaysIDs = [];
    activeLayers.forEach(function(layerName){
        overlaysIDs.push(overlaysMeta[layerName]);
    });
    return overlaysIDs.toString();
}


parseUrl();
mymap = L.map('mapid', {
    center: [startLatitude, startLongitude],
    zoom: startZoom,
    layers: initialLayers,
    attributionControl: false,
    contextmenu: true,
    contextmenuWidth: 140,
    contextmenuItems: [{
        text: "set as start",
        callback: setStartFromMap
    }, {
        text: "set as via",
        callback: setViaFromMap 
    }, {
        text: "set as destination",
        callback: setEndFromMap
    }]
});
layerControl = L.control.layers(baseLayers, overlays);
attributionControl = L.control.attribution();
attributionControl.addTo(mymap);
layerControl.addTo(mymap);

updateAttribution();
loadInfos();

// change URL in address bar an overlay is removed
mymap.on('overlayremove', function(e) {
    // remove from activeLayers
    activeLayers.splice(activeLayers.indexOf(e.name), 1);
    // update URL
    updateUrl('', getCurrentOverlays());
    updateAttribution();
});

mymap.on('overlayadd', function(e) {
    // add to activeLayers
    activeLayers.push(e.name);
    updateUrl('', getCurrentOverlays());
    updateAttribution();
});

function registerDragAndDropEvents(elem) {
    elem.addEventListener('dragstart', function(ev){
            dragSrc = this;
            ev.dataTransfer.setData('text/html', this.outerHTML);
            ev.dataTransfer.effectAllowed = 'move';
            this.classList.add('dragging');
        },
        false
    );
    elem.addEventListener('dragover', function(ev) {
            ev.preventDefault();
            this.classList.add('draggedOver');
            ev.dataTransfer.dropEffect = 'move';
            return false;
        },
        false
    );
    elem.addEventListener('dragleave', function(ev) {
            this.classList.remove('draggedOver');
        },
        false
    );
    elem.addEventListener('dragenter', function(ev) {
            ev.preventDefault();
            return false;
        },
        false
    );
    elem.addEventListener('dragend', function(ev) {
            this.classList.remove('dragging');
        },
        false
    );
    elem.addEventListener('drop', function(ev) {
            ev.stopPropagation();
            ev.preventDefault();
            // Check for dragSrc != null is required to ignore the 2th to nth time the event is fired at the end of a single drag.
            if (dragSrc != this && dragSrc != null) {
                this.parentNode.insertBefore(dragSrc, this);
                dragSrc = null;
                updateViaIndexes();
                updateMarkersList();
                getAndDisplayRoute();
            }
            this.classList.remove('draggedOver');
        },
        false
    );
}


document.getElementById('mapid').addEventListener('dragover',
    function (ev) {
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'move';
    },
    false
);

document.getElementById('mapid').addEventListener('drop',
    function(ev) {
        console.log('drop mymap');
        ev.preventDefault;
        // if dragSrc != null, we are in dragging mode
        if (dragSrc != null) {
            var dropCoords = [ev.clientX - dragSrc.offsetWidth, ev.clientY - dragSrc.offsetHeight];
            dropCoords = [dropCoords[0] - routeMarkerOptions.iconSize[0], dropCoords[1] + routeMarkerOptions.iconSize[1] / 2];
            var coords = mymap.containerPointToLatLng(L.point(dropCoords));
            if (markers.length - 2 === 0) {
                addVia(coords, 1);
            } else {
                var index = getNextPoints(coords);
                addVia(coords, index);
            }
            dragSrc = null;
        }
    },
    false
);

function registerDragDropEventsForAll() {
    Array.from(document.getElementsByClassName('pointBlock')).forEach(function(elem) {
        registerDragAndDropEvents(elem);
    });
}


document.getElementById('submit').addEventListener('click', function(event){getAndDisplayRoute();});
document.getElementById(getViaFieldId(0)).addEventListener('keypress', function(event){formEnterKeyPressed(event, getAndDisplayRoute);});
document.getElementById(getViaFieldId(1)).addEventListener('keypress', function(event){formEnterKeyPressed(event, getAndDisplayRoute);});
document.getElementById('vehicle').addEventListener('change', tryGetRoute);
document.getElementById('vehicle').addEventListener('keypress', function(event){formEnterKeyPressed(event, getAndDisplayRoute);});
registerDragDropEventsForAll();
