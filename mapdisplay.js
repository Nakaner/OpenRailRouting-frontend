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

var RouteMarker = L.Icon.extend({
    options: {
        shadowUrl: 'images/marker-shadow.png',
	iconSize: [25, 41],
	iconAnchor: [12.5, 41],
        popupAnchor: [1, -34],
        tooltipAnchor: [16, -28],
        shadowSize: [41, 41]
    }
});

var mymap; // the Leaflet map instance
var layerControl;
var attributionControl;
var markers = [null, null];

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

function updateInputFields() {
    var viaDiv = document.getElementById('vias');
    var viaBlocks = viaDiv.querySelectorAll('.viaBlock');
    // remove existing viaBlocks except of the first one
    var i;
    for (i = 1; i < viaBlocks.length; i++) {
        viaDiv.removeChild(viaBlocks[i]);
    }
    // create enought empty viaBlocks
    var k;
    var viaBlock1 = viaDiv.querySelector('#viaBlock1');
    for (k = 2; k < markers.length - 1; k++) {
        var newBlock = viaBlock1.cloneNode(true);
        newBlock.id = 'viaBlock' + k;
        newBlock.querySelector('input').id = 'via_' + k;
        newBlock.querySelector('input').value = '';
        viaBlock1.parentNode.insertBefore(newBlock, null); // null inserts at end of list
    }
    // add/update fields
    var i;
    for (i = 0; i < markers.length; i++) {
        if (!markers[i]) {
            continue;
        }
        var value = markers[i].getLatLng().lat.toFixed(5) + "," + markers[i].getLatLng().lng.toFixed(5);
        if (i === 0) {
            document.getElementById('inputFrom').value = value;
        } else if (i === markers.length - 1) {
            document.getElementById('inputTo').value = value;
        } else {
            var viaId = 'via_' + i;
            document.getElementById(viaId).value = value;
        }
    }
}

function getRemoveButtonId(index) {
    console.log('get remove button ID: ' + index);
    return 'remove-button-' + index;
}

function getMarkerPopupContent(index) {
    return '<b>via ' + index + '</b><br><button type="button" onclick="removeMarker(' + index + ')">Remove</button>';
}

function addMarker(latlng, index, message, insert /*= false*/) {
    if (markers.length >= 9) {
        // too much vias
        return;
    }
    insert = insert || false;
    var marker = L.marker(latlng, {draggable: true}).bindPopup(getMarkerPopupContent(index));
    if (index === 0) {
        if (markers[0] != null) {
            markers[0].remove();
        }
	marker.setIcon(new RouteMarker({iconUrl: 'images/marker-green.svg'}));
        markers[0] = marker;
    } else if (index === markers.length - 1 && !insert) {
        if (markers[index] != null) {
            markers[index].remove();
        }
	marker.setIcon(new RouteMarker({iconUrl: 'images/marker-red.svg'}));
        markers[index] = marker;
    } else {
	marker.setIcon(new RouteMarker({iconUrl: 'images/marker-blue.svg'}));
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
        markers[i].setPopupContent(getMarkerPopupContent(i));
    }
    // update text input field entries in the form
    updateInputFields();
    marker.on('dragend', tryGetRoute);
    marker.addTo(mymap);
}

function removeMarker(index) {
    console.log('removeMarker: ' + index);
    var thisMarker = markers[index];
    thisMarker.removeFrom(mymap);
    // remove marker from array
    markers.splice(index, 1);
    // update all markers
    for (var i = 1; i < markers.length - 1; i++) {
        markers[i].setPopupContent(getMarkerPopupContent(i));
    }
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
        // fill with coordinates from text input fields
        var start = parseCoordsFromStr(document.getElementById('inputFrom').value);
        var end = parseCoordsFromStr(document.getElementById('inputTo').value);
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
    document.getElementById('inputFrom').value = e.latlng.lat + "," + e.latlng.lng;
    addMarker(e.latlng, 0, 'start');
    tryGetRoute();
}

function setEndFromMap(e) {
    document.getElementById('inputTo').value = e.latlng.lat + "," + e.latlng.lng;
    addMarker(e.latlng, markers.length - 1, 'end');
    tryGetRoute();
}

function setViaFromMap(e) {
    // existing number of vias
    var currentVias = markers.length - 2;
    if (currentVias == 0) {
        // set first via
        addMarker(e.latlng, 1, 'via 1', true);
    } else {
        var index = getNextPoints(e.latlng);
        addMarker(e.latlng, index, 'via', true);
    }
    tryGetRoute();
}

function formEnterKeyPressed(event) {
    if (event.keyCode == 13) {
        getAndDisplayRoute();
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

document.getElementById('submit').addEventListener('click', function(event){getAndDisplayRoute();});
document.getElementById('inputFrom').addEventListener('keypress', function(event){formEnterKeyPressed(event);});
document.getElementById('inputTo').addEventListener('keypress', function(event){formEnterKeyPressed(event);});

