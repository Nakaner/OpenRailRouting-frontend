"use strict";

var nominatimUrl = 'https://nominatim.openstreetmap.org/search?';
var startLatitude = 50.9; // initial latitude of the center of the map
var startLongitude = 10.7; // initial longitude of the center of the map
var startZoom = 7; // initial zoom level

// define base map and overlays
var route = L.layerGroup([]);
var ORMTilesLayer = L.tileLayer('https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', {
//    maxZoom: 18,
    maxZoom: 18
//    attribution: '<a href="http://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>, Style: <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA 2.0</a> <a href="http://www.openrailwaymap.org/">OpenRailwayMap</a> and OpenStreetMap'
});
var osmOrgTilesLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
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



function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}


function getLayerNameByID(layerID) {
    var name = '';
    Object.keys(overlaysMeta).forEach(function(key){
        if (overlaysMeta[key] == layerID) {
            name = key;
        }
    });
    return name;
}

function closeSearchResults() {
    var searchResultsLists = document.getElementsByClassName('search-results');
    Array.prototype.forEach.call(searchResultsLists, function(e) {
        e.classList.add('search-results-box-invisible');
    });
}

function latLngFromString(str) {
    var parts = str.split(',');
    if (parts.length === 2) {
        return L.latLng(parts);
    }
    return null;
}

function setupMapAndMarkers(url) {
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

    if (queryParams.hasOwnProperty('points')) {
        var pointList = queryParams['points'].split(';');
        pointList = pointList.map(p => latLngFromString(p));
        for (var i = 0; i < pointList.length; ++i) {
            if (!pointList[i]) {
                return;
            }
        }
        if (pointList.length < 2) {
            return;
        }
        addMarker(pointList[0], 0, 'start', false, function(){});
        for (var i = 1; i < pointList.length - 1; ++i) {
            addVia(pointList[i], i, function(){});
        }
        addMarker(pointList[pointList.length - 1], pointList.length - 1, 'end', false, function(){});

        updateInputFields();
        if (queryParams.hasOwnProperty('vehicle')) {
            document.getElementById('vehicle').value = decodeURIComponent(queryParams['vehicle']);
            tryGetRoute(decodeURIComponent(queryParams['vehicle'], 'markers'));
        }
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
    if (markers.length >= 2 && markers[0] && markers[1]) {
        newurl += '&points=' + markers.map(m => String(m.getLatLng().lat) + ',' + String(m.getLatLng().lng)).join(';');
    }
    newurl += '&vehicle=' + encodeURIComponent(document.getElementById('vehicle').value);
    history.replaceState('', document.title, newurl);
}

function getViaFieldId(index) {
    return "point_" + index;
}

function getSearchResultsListId(index) {
    return "searchResults_" + index;
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
        newBlock.querySelector('ul.search-results').id = getSearchResultsListId(k);
        newBlock.querySelector('input').value = '';
        newBlock.setAttribute('data-point-index', k);
        if (k > 0) {
            newBlock.querySelector('img').src = markerIconsPaths.via;
        }
        pointBlock1.parentNode.insertBefore(newBlock, viaBlocks[viaBlocks.length - 1]); // insert before last point
    }
    // update index of last viaBlock
    var pointBlockLast = viaUl.querySelectorAll('li.pointBlock')[markers.length - 1];
    pointBlockLast.setAttribute('data-point-index', markers.length - 1);
    pointBlockLast.querySelector('ul.search-results').id = getSearchResultsListId(k);
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
        vias[i].parentNode.setAttribute('data-point-index', i + 1);
    }
}

function updateMarkersList() {
    var points = Array.prototype.slice.call(document.getElementsByClassName('pointInputField'));
    // Vias is sorted by the order of the input fields in the DOM.
    // remove old markers from map
    markers.forEach(function(m) {
        if (m) {
            m.removeFrom(mymap);
        }
    });
    markers = [];
    // add start marker
    // update point indexes and add new markers
    for (var i = 0; i < points.length; ++i) {
        points[i].parentNode.setAttribute('data-point-index', i);
        points[i].id = getViaFieldId(i);
        var latlng = parseCoordsFromStr(points[i].value);
        var markerType = 'via';
        if (i === 0) {
            markerType = 'start';
        } else if (i === points.length - 1) {
            markerType = 'end';
        }
        points[i].parentNode.getElementsByTagName('img')[0].src = markerIconsPaths[markerType];
        addMarker(latlng, i + 1, markerType, true, function(){});
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
    return '<b>via ' + index + '</b><br><button type="button" onclick="removeMarker(' + index + ', 1)">Remove</button>';
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
    marker.on('dragend', function(e){
        updateInputFields();
        tryGetRoute('', 'markers');
    });
    marker.addTo(mymap);
}

function removeMarker(index, touchInputFields) {
    var thisMarker = markers[index];
    thisMarker.removeFrom(mymap);
    // remove marker from array
    markers.splice(index, 1);
    // update all markers
    for (var i = 1; i < markers.length - 1; i++) {
        markers[i].setPopupContent(getMarkerPopupContent(i, null));
    }
    if (touchInputFields === 1) {
        updateInputFields();
    }
    tryGetRoute('', 'markers');
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
    //TODO catch: response == null
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

function getStartAndEnd(coordsFrom/*='markers'*/) {
    coordsFrom = coordsFrom || 'markers';
    if (coordsFrom === 'input_fields') {
        return markers.map(x => {
            return null;
        });
    }
    if (coordsFrom === 'markers') {
        var pointList = markers.map(x => {
            if (x != null) {
                return x.getLatLng();
            }
            return null;
        });
        return pointList;
    }
    var inputFields = document.querySelectorAll('input.pointInputField');
    if (inputFields.length < pointList.length) {
        // remove tail
        pointList.splice(-1);
    } else if (inputFields.length > pointList.length) {
        for (var i = pointList.length; i < inputFields.length; ++i) {
            pointList.splice(-1, 0, null);
        }
    }
    for (var i = 0; i < inputFields.length; ++i) {
        pointList[i] = parseCoordsFromStr(inputFields[i].value);
    }
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

function setField(index, lon, lat) {
    var inputField = document.getElementById(getViaFieldId(index));
    inputField.value = Number(lat).toFixed(6) + ',' + Number(lon).toFixed(6);
}

function getRailwayFeatureRank(value) {
    var railwayFeatures = ['station', 'halt', 'yard', 'service_station', 'junction', 'crossover', 'site', 'spur_junction'];
    // get index of railway value
    for (var i = 0; i < railwayFeatures.length; ++i) {
        if (railwayFeatures === value) {
            return i;
        }
    }
    return railwayFeatures.length;
}

/**
 * Sort Nominatim result, prefer railway features but keep order of the others.
 */
function sortNominatimResult(input) {
    var result = input.sort(function(a, b) {
        if (a['class'] != 'railway' && b['class'] != 'railway') {
            if (a['importance'] > b['importance']) {
                return -1;
            } else if (a['importance'] > b['importance']) {
                return 1;
            }
            return 0;
        }
        if (a['class'] === 'railway' && b['class'] != 'railway') {
            return -1;
        } else if (a['class'] != 'railway' && b['class'] === 'railway') {
            return 1;
        }
        var railwayFeatureRankDiff = getRailwayFeatureRank(a['class']) - getRailwayFeatureRank(b['class']);
        if (railwayFeatureRankDiff != 0) {
            return railwayFeatureRankDiff;
        }
        // importance: 1 is high, 0 is low
        return b['importance'] - a['importance'];
    });
}

function geocode(index, markerType) {
    var q = encodeURIComponent(document.getElementById(getViaFieldId(index)).value);
    if (markerType === 'via') {
        removeMarker(index, 0);
    }
    var viewbox = mymap.getBounds();
    var url = nominatimUrl + 'q=' + q + '&format=json&viewbox=' + viewbox.toBBoxString();
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'json';
    xhr.onreadystatechange = function() {
        if(xhr.readyState == XMLHttpRequest.DONE) {
            if (xhr.status != 200) {
                displayError(xhr.response);
                return;
            }
            if (xhr.response.length === 0) {
                displayError('No places found for your search term. Please change your search term or right-click on the map.');
                return;
            }
            var searchResults = document.getElementById('searchResults_' + index);
            searchResults.classList.remove('search-results-box-invisible');
            // sort search results to prefer railway stations
            //nominatimSorted = sortNominatimResult(xhr.response);
            for (var i = 0; i < xhr.response.length; ++i) {
                var lon = parseFloat(xhr.response[i].lon);
                var lat = parseFloat(xhr.response[i].lat);
                if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
                    displayError('The result list cannot be parsed');
                    return;
                }
                var aElem = document.createElement('a');
                aElem.href = '#';
                aElem.addEventListener('click', function(index, lon, lat, parentUl, e) {
                    setField(index, lon, lat);
                    while (parentUl.firstChild) {
                        parentUl.removeChild(parentUl.firstChild);
                    }
                    addMarker(L.latLng(lat, lon), index, markerType, true, getAndDisplayRoute);
                }.bind(aElem, index, xhr.response[i].lon, xhr.response[i].lat, searchResults));
                aElem.appendChild(document.createTextNode(xhr.response[i].display_name));
                var liElem = document.createElement('li');
                liElem.appendChild(aElem);
                searchResults.appendChild(liElem);
            }
        }
    }
    xhr.onerror = function() {
        displayError('Failed to contact Nominatim geocoder.');
    };
    xhr.send();
}

function getAndDisplayRoute(coordSource) {
    coordSource = coordSource || 'markers';
    var points = getStartAndEnd(coordSource);
    if (!requestPointsValid(points)) {
        //TODO Is this still necessary?
        // fill with coordinates from text input fields
        var inputFields = Array.prototype.slice.call(document.querySelectorAll('input.pointInputField'));
        // create capacity if not available
        if (points.length != inputFields.length) {
            points = new Array(5).fill(null);
        };
        for (var i = 0; i < inputFields.length; ++i) {
            points[i] = parseCoordsFromStr(document.getElementById(getViaFieldId(i)).value);
        }
    }
    var fieldIndexToGeocode = -1;
    for (var i = 0; i < points.length; ++i) {
        if (points[i] == null) {
            fieldIndexToGeocode = i;
            break;
        }
    };
    if (fieldIndexToGeocode === -1) { //!noFieldpoints[0] != null && points[points.length - 1] != null) {
        getGHRoute(points, document.getElementById('vehicle').value);
    } else if (points[0] === null) {
        // use geocoder to get coordinates
        geocode(0, 'start');
    } else if (points[points.length - 1] === null) {
        geocode(points.length - 1, 'end');
    } else {
        geocode(fieldIndexToGeocode, 'via');
    }
}

/**
 * Try to send a route request.
 * If the start or the end point has not been set yet, this function does nothing.
 */
function tryGetRoute(vehicleDefaultValue, coordsSource) {
    var points = getStartAndEnd(coordsSource);
    var vehicle = vehicleDefaultValue || '';
    if (vehicle === '') {
        vehicle = document.getElementById('vehicle').value;
    }
    if (requestPointsValid(points)) {
        getGHRoute(points, vehicle);
    }
}

function setStartFromMap(e) {
    closeSearchResults();
    addMarker(e.latlng, 0, 'start', false, function(){});
    document.getElementById(getViaFieldId(0)).value = e.latlng.lat + "," + e.latlng.lng;
    tryGetRoute('', 'markers');
}

function setEndFromMap(e) {
    closeSearchResults();
    // check if end is set so far
    var inputFields = document.querySelectorAll('input.pointInputField');
    addMarker(e.latlng, markers.length - 1, 'end', false, function(){});
    document.getElementById(getViaFieldId(markers.length - 1)).value = e.latlng.lat + "," + e.latlng.lng;
    tryGetRoute('', 'markers');
}

function addVia(coords, index, callback) {
    addMarker(coords, index, 'via', true, updateInputFields);
    callback();
}

function setViaFromMap(e) {
    closeSearchResults();
    // existing number of vias
    var currentVias = markers.length - 2;
    if (currentVias == 0) {
        // set first via
        addVia(e.latlng, 1, function(){tryGetRoute('', 'markers');});
    } else {
        var index = getNextPoints(e.latlng);
        addVia(e.latlng, index, function(){tryGetRoute('', 'markers');});
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


loadInfos();
setupMapAndMarkers();

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

// change URL in address bar if the map is moved
mymap.on('moveend', function(e) {
    updateUrl('', getCurrentOverlays());
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
                getAndDisplayRoute('input_fields');
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

function getElementStyle(el) {
    if (window.getComputedStyle) {
        return getComputedStyle(el, null);
    }
    return el.currentStyle;
}

document.getElementById('mapid').addEventListener('drop',
    function(ev) {
        ev.preventDefault;
        // if dragSrc != null, we are in dragging mode
        if (dragSrc == null) {
            return;
        }
        var routingControlsElem = document.getElementById('routingcontrols');
        var offsetLeft = routingControlsElem.offsetWidth;
        var routingControlsElemStyle = getElementStyle(routingControlsElem);
        offsetLeft += parseInt(routingControlsElemStyle.marginLeft);
        var headerElem = document.getElementsByTagName('header')[0];
        var offsetTop = headerElem.offsetHeight;
        var headerElemStyle = getElementStyle(headerElem);
        offsetTop += parseInt(headerElemStyle.marginTop);
        var dropCoords = [ev.clientX - offsetLeft, ev.clientY - offsetTop];
        var coords = mymap.containerPointToLatLng(L.point(dropCoords));
        var pointIndex = parseInt(dragSrc.getAttribute('data-point-index'), 10);
        if (pointIndex == 0) {
            setStartFromMap({'latlng': coords});
        } else if (pointIndex == markers.length - 1) {
            setEndFromMap({'latlng': coords});
        } else {
            var index = getNextPoints(coords);
            addVia(coords, index, function(){tryGetRoute('', 'markers');});
        }
        dragSrc = null;
    },
    false
);

function registerDragDropEventsForAll() {
    Array.from(document.getElementsByClassName('pointBlock')).forEach(function(elem) {
        registerDragAndDropEvents(elem);
    });
}


document.getElementById('submit').addEventListener('click', function(event){getAndDisplayRoute('input_fields');});
for (var i = 0; i < 2; ++i) {
    document.getElementById(getViaFieldId(i)).addEventListener(
        'keypress',
        function(event) {
            formEnterKeyPressed(event,
                function(){
                    getAndDisplayRoute('input_fields')
                }
            );
        }
    );
}
document.getElementById('vehicle').addEventListener(
    'keypress',
    function(event) {
        formEnterKeyPressed(event,
            function(){
                getAndDisplayRoute('input_fields')
            }
        );
    }
);
document.getElementById('vehicle').addEventListener(
    'change',
    function(event) {
        tryGetRoute('', 'markers');
    }
);
registerDragDropEventsForAll();
