'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

/*! *****************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */
/* global Reflect, Promise */

var extendStatics = function(d, b) {
    extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return extendStatics(d, b);
};

function __extends(d, b) {
    extendStatics(d, b);
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}

var __assign = function() {
    __assign = Object.assign || function __assign(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};

// Characters used in location geohashes
var BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
// Number of bits per geohash character
var BITS_PER_CHAR = 5;
// The following value assumes a polar radius of
// const EARTH_POL_RADIUS = 6356752.3;
// The formulate to calculate E2 is
// E2 == (EARTH_EQ_RADIUS^2-EARTH_POL_RADIUS^2)/(EARTH_EQ_RADIUS^2)
// The exact value is used here to avoid rounding errors
var E2 = 0.00669447819799;
// Equatorial radius of the earth in meters
var EARTH_EQ_RADIUS = 6378137.0;
// The meridional circumference of the earth in meters
var EARTH_MERI_CIRCUMFERENCE = 40007860;
// Cutoff for rounding errors on double calculations
var EPSILON = 1e-12;
// Default geohash length
var GEOHASH_PRECISION = 10;
// Maximum length of a geohash in bits
var MAXIMUM_BITS_PRECISION = 22 * BITS_PER_CHAR;
// Length of a degree latitude at the equator
var METERS_PER_DEGREE_LATITUDE = 110574;
/**
 * Calculates the maximum number of bits of a geohash to get a bounding box that is larger than a given size at the given coordinate.
 *
 * @param coordinate The coordinate as a Firestore GeoPoint.
 * @param size The size of the bounding box.
 * @return The number of bits necessary for the geohash.
 */
function boundingBoxBits(coordinate, size) {
    var latDeltaDegrees = size / METERS_PER_DEGREE_LATITUDE;
    var latitudeNorth = Math.min(90, coordinate.latitude + latDeltaDegrees);
    var latitudeSouth = Math.max(-90, coordinate.latitude - latDeltaDegrees);
    var bitsLat = Math.floor(latitudeBitsForResolution(size)) * 2;
    var bitsLongNorth = Math.floor(longitudeBitsForResolution(size, latitudeNorth)) * 2 - 1;
    var bitsLongSouth = Math.floor(longitudeBitsForResolution(size, latitudeSouth)) * 2 - 1;
    return Math.min(bitsLat, bitsLongNorth, bitsLongSouth, MAXIMUM_BITS_PRECISION);
}
/**
 * Calculates eight points on the bounding box and the center of a given circle. At least one geohash of these nine coordinates, truncated'
 * to a precision of at most radius, are guaranteed to be prefixes of any geohash that lies within the circle.
 *
 * @param center The center given as Firestore GeoPoint.
 * @param radius The radius of the circle.
 * @return The eight bounding box points.
 */
function boundingBoxCoordinates(center, radius) {
    var latDegrees = radius / METERS_PER_DEGREE_LATITUDE;
    var latitudeNorth = Math.min(90, center.latitude + latDegrees);
    var latitudeSouth = Math.max(-90, center.latitude - latDegrees);
    var longDegsNorth = metersToLongitudeDegrees(radius, latitudeNorth);
    var longDegsSouth = metersToLongitudeDegrees(radius, latitudeSouth);
    var longDegs = Math.max(longDegsNorth, longDegsSouth);
    return [
        toGeoPoint(center.latitude, center.longitude),
        toGeoPoint(center.latitude, wrapLongitude(center.longitude - longDegs)),
        toGeoPoint(center.latitude, wrapLongitude(center.longitude + longDegs)),
        toGeoPoint(latitudeNorth, center.longitude),
        toGeoPoint(latitudeNorth, wrapLongitude(center.longitude - longDegs)),
        toGeoPoint(latitudeNorth, wrapLongitude(center.longitude + longDegs)),
        toGeoPoint(latitudeSouth, center.longitude),
        toGeoPoint(latitudeSouth, wrapLongitude(center.longitude - longDegs)),
        toGeoPoint(latitudeSouth, wrapLongitude(center.longitude + longDegs))
    ];
}
/**
 * Method which calculates the distance, in kilometers, between two locations, via the Haversine formula. Note that this is approximate due
 * to the fact that the Earth's radius varies between 6356.752 km and 6378.137 km.
 *
 * @param location1 The GeoPoint of the first location.
 * @param location2 The GeoPoint of the second location.
 * @return The distance, in kilometers, between the inputted locations.
 */
function calculateDistance(location1, location2) {
    validateLocation(location1);
    validateLocation(location2);
    var radius = 6371; // Earth's radius in kilometers
    var latDelta = degreesToRadians(location2.latitude - location1.latitude);
    var lonDelta = degreesToRadians(location2.longitude - location1.longitude);
    var a = (Math.sin(latDelta / 2) * Math.sin(latDelta / 2)) +
        (Math.cos(degreesToRadians(location1.latitude)) * Math.cos(degreesToRadians(location2.latitude)) *
            Math.sin(lonDelta / 2) * Math.sin(lonDelta / 2));
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return radius * c;
}
/**
 * Decodes the GeoDocument data. Returns non-decoded data if decoding fails.
 *
 * @param data The data encoded as a GeoDocument object.
 * @return The decoded Firestore document or non-decoded data if decoding fails.
 */
function decodeGeoDocumentData(data) {
    return (validateGeoDocument(data, true)) ? data.d : data;
}
/**
 * Decodes the GeoDocument data. Returns non-decoded data if decoding fails.
 *
 * @param data The data encoded as a GeoDocument object.
 * @param center The center to calculate the distance of the Document from the query origin.
 * @return The decoded Firestore document or non-decoded data if decoding fails in an object including distance from origin.
 */
function decodeGeoQueryDocumentSnapshotData(data, center) {
    if (validateGeoDocument(data, true)) {
        var distance = (center) ? calculateDistance(data.l, center) : null;
        return { data: function () { return data.d; }, distance: distance };
    }
    return { data: function () { return data; }, distance: null };
}
/**
 * Converts degrees to radians.
 *
 * @param degrees The number of degrees to be converted to radians.
 * @return The number of radians equal to the inputted number of degrees.
 */
function degreesToRadians(degrees) {
    if (typeof degrees !== 'number' || isNaN(degrees)) {
        throw new Error('Error: degrees must be a number');
    }
    return (degrees * Math.PI / 180);
}
/**
 * Generates a geohash of the specified precision/string length from the inputted GeoPoint.
 *
 * @param location The GeoPoint to encode into a geohash.
 * @param precision The length of the geohash to create. If no precision is specified, the global default is used.
 * @return The geohash of the inputted location.
 */
function encodeGeohash(location, precision) {
    if (precision === void 0) { precision = GEOHASH_PRECISION; }
    validateLocation(location);
    if (typeof precision === 'number' && !isNaN(precision)) {
        if (precision <= 0) {
            throw new Error('precision must be greater than 0');
        }
        else if (precision > 22) {
            throw new Error('precision cannot be greater than 22');
        }
        else if (Math.round(precision) !== precision) {
            throw new Error('precision must be an integer');
        }
    }
    else {
        throw new Error('precision must be a number');
    }
    var latitudeRange = {
        min: -90,
        max: 90
    };
    var longitudeRange = {
        min: -180,
        max: 180
    };
    var hash = '';
    var hashVal = 0;
    var bits = 0;
    var even = 1;
    while (hash.length < precision) {
        var val = even ? location.longitude : location.latitude;
        var range = even ? longitudeRange : latitudeRange;
        var mid = (range.min + range.max) / 2;
        if (val > mid) {
            hashVal = (hashVal << 1) + 1;
            range.min = mid;
        }
        else {
            hashVal = (hashVal << 1) + 0;
            range.max = mid;
        }
        even = !even;
        if (bits < 4) {
            bits++;
        }
        else {
            bits = 0;
            hash += BASE32[hashVal];
            hashVal = 0;
        }
    }
    return hash;
}
/**
 * Encodes a location and geohash as a GeoDocument.
 *
 * @param location The location as a Firestore GeoPoint.
 * @param geohash The geohash of the location.
 * @return The document encoded as GeoDocument object.
 */
function encodeGeoDocument(location, geohash, document) {
    validateLocation(location);
    validateGeohash(geohash);
    var splitGeohash = geohash.split('').reduce(function (acc, letter, index) {
        var _a;
        return (__assign(__assign({}, acc), (_a = {}, _a["g" + (index + 1)] = letter, _a)));
    }, {});
    return __assign(__assign({ g: geohash }, splitGeohash), { l: location, d: document });
}
/**
 * Remove customKey attribute so firestore doesn't' reject.
 *
 * @param customKey The key of the document to use as the location. Otherwise we default to `coordinates`.
 * @return The same object but without custom key
 */
function sanitizeSetOptions(options) {
    var clone = __assign({}, options);
    delete clone.customKey;
    return clone;
}
/**
 * Encodes a Document used by GeoWriteBatch.set as a GeoDocument.
 *
 * @param data The document being set.
 * @param customKey The key of the document to use as the location. Otherwise we default to `coordinates`.
 * @return The document encoded as GeoDocument object.
 */
function encodeSetDocument(data, options) {
    if (Object.prototype.toString.call(data) === '[object Object]') {
        var customKey = (options) ? options.customKey : null;
        var unparsed = ('d' in data) ? data.d : data;
        var location_1 = findCoordinates(unparsed, customKey, (options && (options.merge || !!options.mergeFields)));
        if (location_1) {
            var geohash = encodeGeohash(location_1);
            return encodeGeoDocument(location_1, geohash, unparsed);
        }
        return { d: unparsed };
    }
    else {
        throw new Error('document must be an object');
    }
}
/**
 * Encodes a Document used by GeoWriteBatch.update as a GeoDocument.
 *
 * @param data The document being updated.
 * @param customKey The key of the document to use as the location. Otherwise we default to `coordinates`.
 * @return The document encoded as GeoDocument object.
 */
function encodeUpdateDocument(data, customKey) {
    if (Object.prototype.toString.call(data) === '[object Object]') {
        var result_1 = {};
        var location_2 = findCoordinates(data, customKey, true);
        if (location_2) {
            result_1['l'] = location_2;
            result_1['g'] = encodeGeohash(result_1['l']);
        }
        Object.getOwnPropertyNames(data).forEach(function (prop) {
            result_1['d.' + prop] = data[prop];
        });
        return result_1;
    }
    else {
        throw new Error('document must be an object');
    }
}
/**
 * Returns coordinates as GeoPoint from a document.
 *
 * @param document A Firestore document.
 * @param customKey The key of the document to use as the location. Otherwise we default to `coordinates`.
 * @param flag Tells function supress errors.
 * @return The GeoPoint for the location field of a document.
 */
function findCoordinates(document, customKey, flag) {
    if (flag === void 0) { flag = false; }
    var error;
    var coordinates;
    if (!customKey) {
        coordinates = document['coordinates'];
    }
    else if (customKey in document) {
        coordinates = document[customKey];
    }
    else {
        var props = customKey.split('.');
        coordinates = document;
        for (var _i = 0, props_1 = props; _i < props_1.length; _i++) {
            var prop = props_1[_i];
            if (!(prop in coordinates)) {
                coordinates = document['coordinates'];
                break;
            }
            coordinates = coordinates[prop];
        }
    }
    if (!coordinates) {
        error = 'could not find GeoPoint';
    }
    if (coordinates && !validateLocation(coordinates, true)) {
        error = 'invalid GeoPoint';
    }
    if (error && !flag) {
        throw new Error('Invalid GeoFirestore document: ' + error);
    }
    return coordinates;
}
/**
 * Creates GeoFirestore QueryDocumentSnapshot by pulling data out of original Firestore QueryDocumentSnapshot and strip GeoFirsetore
 * Document data, such as geohash and coordinates.
 *
 * @param snapshot The QueryDocumentSnapshot.
 * @param center The center to calculate the distance of the Document from the query origin.
 * @return The snapshot as a GeoFirestore QueryDocumentSnapshot.
 */
function generateGeoQueryDocumentSnapshot(snapshot, center) {
    var decoded = decodeGeoQueryDocumentSnapshotData(snapshot.data(), center);
    return __assign({ exists: snapshot.exists, id: snapshot.id }, decoded);
}
/**
 * Calculates a set of queries to fully contain a given circle. A query is a GeoPoint where any geohash is guaranteed to be
 * lexiographically larger then start and smaller than end.
 *
 * @param center The center given as a GeoPoint.
 * @param radius The radius of the circle.
 * @return An array of geohashes containing a GeoPoint.
 */
function geohashQueries(center, radius) {
    validateLocation(center);
    var queryBits = Math.max(1, boundingBoxBits(center, radius));
    var geohashPrecision = Math.ceil(queryBits / BITS_PER_CHAR);
    var coordinates = boundingBoxCoordinates(center, radius);
    var queries = coordinates.map(function (coordinate) {
        return geohashQuery(encodeGeohash(coordinate, geohashPrecision), queryBits);
    });
    // remove duplicates
    return queries.filter(function (query, index) {
        return !queries.some(function (other, otherIndex) {
            return index > otherIndex && query[0] === other[0] && query[1] === other[1];
        });
    });
}
/**
 * Calculates the bounding box query for a geohash with x bits precision.
 *
 * @param geohash The geohash whose bounding box query to generate.
 * @param bits The number of bits of precision.
 * @return A [start, end] pair of geohashes.
 */
function geohashQuery(geohash, bits) {
    validateGeohash(geohash);
    var precision = Math.ceil(bits / BITS_PER_CHAR);
    if (geohash.length < precision) {
        return [geohash, geohash + '~'];
    }
    var ghash = geohash.substring(0, precision);
    var base = ghash.substring(0, ghash.length - 1);
    var lastValue = BASE32.indexOf(ghash.charAt(ghash.length - 1));
    var significantBits = bits - (base.length * BITS_PER_CHAR);
    var unusedBits = (BITS_PER_CHAR - significantBits);
    // delete unused bits
    var startValue = (lastValue >> unusedBits) << unusedBits;
    var endValue = startValue + (1 << unusedBits);
    if (endValue > 31) {
        return [base + BASE32[startValue], base + '~'];
    }
    else {
        return [base + BASE32[startValue], base + BASE32[endValue]];
    }
}
/**
 * Calculates the bits necessary to reach a given resolution, in meters, for the latitude.
 *
 * @param resolution The bits necessary to reach a given resolution, in meters.
 * @return Bits necessary to reach a given resolution, in meters, for the latitude.
 */
function latitudeBitsForResolution(resolution) {
    return Math.min(log2(EARTH_MERI_CIRCUMFERENCE / 2 / resolution), MAXIMUM_BITS_PRECISION);
}
/**
 * Calculates the base 2 logarithm of the given number.
 *
 * @param x A number
 * @return The base 2 logarithm of a number
 */
function log2(x) {
    return Math.log(x) / Math.log(2);
}
/**
 * Calculates the bits necessary to reach a given resolution, in meters, for the longitude at a given latitude.
 *
 * @param resolution The desired resolution.
 * @param latitude The latitude used in the conversion.
 * @return The bits necessary to reach a given resolution, in meters.
 */
function longitudeBitsForResolution(resolution, latitude) {
    var degs = metersToLongitudeDegrees(resolution, latitude);
    return (Math.abs(degs) > 0.000001) ? Math.max(1, log2(360 / degs)) : 1;
}
/**
 * Calculates the number of degrees a given distance is at a given latitude.
 *
 * @param distance The distance to convert.
 * @param latitude The latitude at which to calculate.
 * @return The number of degrees the distance corresponds to.
 */
function metersToLongitudeDegrees(distance, latitude) {
    var radians = degreesToRadians(latitude);
    var num = Math.cos(radians) * EARTH_EQ_RADIUS * Math.PI / 180;
    var denom = 1 / Math.sqrt(1 - E2 * Math.sin(radians) * Math.sin(radians));
    var deltaDeg = num * denom;
    if (deltaDeg < EPSILON) {
        return distance > 0 ? 360 : 0;
    }
    else {
        return Math.min(360, distance / deltaDeg);
    }
}
/**
 * Returns a 'GeoPoint.' (Kind of fake, but get's the job done!)
 *
 * @param latitude Latitude for GeoPoint.
 * @param longitude Longitude for GeoPoint.
 * @return Firestore "GeoPoint"
 */
function toGeoPoint(latitude, longitude) {
    var fakeGeoPoint = { latitude: latitude, longitude: longitude };
    validateLocation(fakeGeoPoint);
    return fakeGeoPoint;
}
/**
 * Validates the inputted GeoDocument object and throws an error, or returns boolean, if it is invalid.
 *
 * @param data The GeoDocument object to be validated.
 * @param flag Tells function to send up boolean if valid instead of throwing an error.
 * @return Flag if data is valid
 */
function validateGeoDocument(data, flag) {
    if (flag === void 0) { flag = false; }
    var error;
    error = (!validateGeohash(data.g, true)) ? 'invalid geohash on object' : null;
    error = (!validateLocation(data.l, true)) ? 'invalid location on object' : error;
    if (!data || !('d' in data) || typeof data.d !== 'object') {
        error = 'no valid document found';
    }
    if (error && !flag) {
        throw new Error('Invalid GeoFirestore object: ' + error);
    }
    else {
        return !error;
    }
}
/**
 * Validates the inputted geohash and throws an error, or returns boolean, if it is invalid.
 *
 * @param geohash The geohash to be validated.
 * @param flag Tells function to send up boolean if valid instead of throwing an error.
 */
function validateGeohash(geohash, flag) {
    if (flag === void 0) { flag = false; }
    var error;
    if (typeof geohash !== 'string') {
        error = 'geohash must be a string';
    }
    else if (geohash.length === 0) {
        error = 'geohash cannot be the empty string';
    }
    else {
        for (var _i = 0, geohash_1 = geohash; _i < geohash_1.length; _i++) {
            var letter = geohash_1[_i];
            if (BASE32.indexOf(letter) === -1) {
                error = 'geohash cannot contain \'' + letter + '\'';
            }
        }
    }
    if (typeof error !== 'undefined' && !flag) {
        throw new Error('Invalid GeoFire geohash \'' + geohash + '\': ' + error);
    }
    else {
        return !error;
    }
}
/**
 * Validates the inputted limit and throws an error, or returns boolean, if it is invalid.
 *
 * @param limit The limit to be applied by `GeoQuery.limit()`
 * @param flag Tells function to send up boolean if valid instead of throwing an error.
 */
function validateLimit(limit, flag) {
    if (flag === void 0) { flag = false; }
    var error;
    if (typeof limit !== 'number' || isNaN(limit)) {
        error = 'limit must be a number';
    }
    else if (limit < 0) {
        error = 'limit must be greater than or equal to 0';
    }
    if (typeof error !== 'undefined' && !flag) {
        throw new Error(error);
    }
    else {
        return !error;
    }
}
/**
 * Validates the inputted location and throws an error, or returns boolean, if it is invalid.
 *
 * @param location The Firestore GeoPoint to be verified.
 * @param flag Tells function to send up boolean if valid instead of throwing an error.
 */
function validateLocation(location, flag) {
    if (flag === void 0) { flag = false; }
    var error;
    if (!location) {
        error = 'GeoPoint must exist';
    }
    else if (typeof location.latitude === 'undefined') {
        error = 'latitude must exist on GeoPoint';
    }
    else if (typeof location.longitude === 'undefined') {
        error = 'longitude must exist on GeoPoint';
    }
    else {
        var latitude = location.latitude;
        var longitude = location.longitude;
        if (typeof latitude !== 'number' || isNaN(latitude)) {
            error = 'latitude must be a number';
        }
        else if (latitude < -90 || latitude > 90) {
            error = 'latitude must be within the range [-90, 90]';
        }
        else if (typeof longitude !== 'number' || isNaN(longitude)) {
            error = 'longitude must be a number';
        }
        else if (longitude < -180 || longitude > 180) {
            error = 'longitude must be within the range [-180, 180]';
        }
    }
    if (typeof error !== 'undefined' && !flag) {
        throw new Error('Invalid location: ' + error);
    }
    else {
        return !error;
    }
}
/**
 * Validates the inputted query criteria and throws an error if it is invalid.
 *
 * @param newQueryCriteria The criteria which specifies the query's center and/or radius.
 * @param requireCenterAndRadius The criteria which center and radius required.
 */
function validateQueryCriteria(newQueryCriteria, requireCenterAndRadius) {
    if (requireCenterAndRadius === void 0) { requireCenterAndRadius = false; }
    if (typeof newQueryCriteria !== 'object') {
        throw new Error('QueryCriteria must be an object');
    }
    else if (typeof newQueryCriteria.center === 'undefined' && typeof newQueryCriteria.radius === 'undefined') {
        throw new Error('radius and/or center must be specified');
    }
    else if (requireCenterAndRadius && (typeof newQueryCriteria.center === 'undefined' || typeof newQueryCriteria.radius === 'undefined')) {
        throw new Error('QueryCriteria for a new query must contain both a center and a radius');
    }
    // Throw an error if there are any extraneous attributes
    var keys = Object.keys(newQueryCriteria);
    for (var _i = 0, keys_1 = keys; _i < keys_1.length; _i++) {
        var key = keys_1[_i];
        if (!['center', 'radius', 'limit'].includes(key)) {
            throw new Error('Unexpected attribute \'' + key + '\' found in query criteria');
        }
    }
    // Validate the 'center' attribute
    if (typeof newQueryCriteria.center !== 'undefined') {
        validateLocation(newQueryCriteria.center);
    }
    // Validate the 'radius' attribute
    if (typeof newQueryCriteria.radius !== 'undefined') {
        if (typeof newQueryCriteria.radius !== 'number' || isNaN(newQueryCriteria.radius)) {
            throw new Error('radius must be a number');
        }
        else if (newQueryCriteria.radius < 0) {
            throw new Error('radius must be greater than or equal to 0');
        }
    }
    // Validate the 'limit' attribute
    if (typeof newQueryCriteria.limit !== 'undefined') {
        validateLimit(newQueryCriteria.limit);
    }
}
/**
 * Wraps the longitude to [-180,180].
 *
 * @param longitude The longitude to wrap.
 * @return longitude The resulting longitude.
 */
function wrapLongitude(longitude) {
    if (longitude <= 180 && longitude >= -180) {
        return longitude;
    }
    var adjusted = longitude + 180;
    if (adjusted > 0) {
        return (adjusted % 360) - 180;
    }
    else {
        return 180 - (-adjusted % 360);
    }
}

/**
 * A `GeoDocumentSnapshot` contains data read from a document in your Firestore database. The data can be extracted with `.data()` or
 * `.get(<field>)` to get a specific field.
 *
 * For a `GeoDocumentSnapshot` that points to a non-existing document, any data access will return 'undefined'. You can use the `exists`
 * property to explicitly verify a document's existence.
 */
var GeoDocumentSnapshot = /** @class */ (function () {
    /**
     * @param _snapshot The `DocumentSnapshot` instance.
     */
    function GeoDocumentSnapshot(_snapshot) {
        this._snapshot = _snapshot;
        if (Object.prototype.toString.call(_snapshot) !== '[object Object]') {
            throw new Error('DocumentSnapshot must be an instance of a Firestore DocumentSnapshot');
        }
        this._isWeb = Object.prototype.toString
            .call(_snapshot.ref.firestore.enablePersistence) === '[object Function]';
    }
    Object.defineProperty(GeoDocumentSnapshot.prototype, "native", {
        /** The native `DocumentSnapshot` instance. */
        get: function () {
            return this._snapshot;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(GeoDocumentSnapshot.prototype, "exists", {
        /** True if the document exists. */
        get: function () {
            return this._snapshot.exists;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(GeoDocumentSnapshot.prototype, "id", {
        /**
         * The ID of the document for which this `GeoDocumentSnapshot` contains data.
         */
        get: function () {
            return this._snapshot.id;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(GeoDocumentSnapshot.prototype, "ref", {
        /** A `GeoDocumentReference` to the document location. */
        get: function () {
            return new GeoDocumentReference(this._snapshot.ref);
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Retrieves all fields in the document as an Object. Returns 'undefined' if the document doesn't exist.
     *
     * By default, `FieldValue.serverTimestamp()` values that have not yet been set to their final value will be returned as `null`. You can
     * override this by passing an options object if you're on web.
     *
     * @param options Available on web only. An options object to configure how data is retrieved from the snapshot (e.g. the desired
     * behavior for server timestamps that have not yet been set to their final value). (WEB ONLY)
     * @return An Object containing all fields in the document or 'undefined' if the document doesn't exist.
     */
    GeoDocumentSnapshot.prototype.data = function (options) {
        var d = (this._isWeb && options) ? this._snapshot.data(options) : this._snapshot.data();
        return (d) ? decodeGeoDocumentData(d) : null;
    };
    /**
     * Retrieves the field specified by `fieldPath`. Returns 'undefined' if the document or field doesn't exist.
     *
     * By default, a `FieldValue.serverTimestamp()` that has not yet been set to its final value will be returned as `null`. You can override
     * this by passing an options object.
     *
     * @param fieldPath The path (e.g. 'foo' or 'foo.bar') to a specific field.
     * @param options An options object to configure how the field is retrieved from the snapshot (e.g. the desired behavior for server
     * timestamps that have not yet been set to their final value). (WEB ONLY)
     * @return The data at the specified field location or undefined if no such field exists in the document.
     */
    GeoDocumentSnapshot.prototype.get = function (fieldPath, options) {
        var path = 'd.' + fieldPath;
        return (this._isWeb && options) ?
            this._snapshot.get(path, options) : this._snapshot.get(path);
    };
    /**
     * Returns true if this `DocumentSnapshot` or `GeoDocumentSnapshot` is equal to the provided one.
     *
     * @param other The `DocumentSnapshot` or `GeoDocumentSnapshot` to compare against.
     * @return true if this `GeoDocumentSnapshot` is equal to the provided one.
     */
    GeoDocumentSnapshot.prototype.isEqual = function (other) {
        if (other instanceof GeoDocumentSnapshot) {
            return this._snapshot
                .isEqual(other['_snapshot']);
        }
        return this._snapshot.isEqual(other);
    };
    return GeoDocumentSnapshot;
}());

/**
 * A write batch, used to perform multiple writes as a single atomic unit.
 *
 * A `GeoWriteBatch` object can be acquired by calling `GeoFirestore.batch()`. It provides methods for adding writes to the write batch.
 * None of the writes will be committed (or visible locally) until `GeoWriteBatch.commit()` is called.
 *
 * Unlike transactions, write batches are persisted offline and therefore are preferable when you don't need to condition your writes on
 * read data.
 */
var GeoWriteBatch = /** @class */ (function () {
    /**
     * @param _writeBatch The `WriteBatch` instance.
     */
    function GeoWriteBatch(_writeBatch) {
        this._writeBatch = _writeBatch;
        if (Object.prototype.toString.call(_writeBatch) !== '[object Object]') {
            throw new Error('WriteBatch must be an instance of a Firestore WriteBatch');
        }
    }
    Object.defineProperty(GeoWriteBatch.prototype, "native", {
        /** The native `WriteBatch` instance. */
        get: function () {
            return this._writeBatch;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Writes to the document referred to by the provided `DocumentReference` or `GeoDocumentReference`. If the document does not exist yet,
     * it will be created. If you pass `SetOptions`, the provided data can be merged into the existing document.
     *
     * @param documentRef A reference to the document to be set.
     * @param data An object of the fields and values for the document.
     * @param options An object to configure the set behavior. Includes custom key for location in document.
     * @return This `GeoWriteBatch` instance. Used for chaining method calls.
     */
    GeoWriteBatch.prototype.set = function (documentRef, data, options) {
        var ref = ((documentRef instanceof GeoDocumentReference) ?
            documentRef['_document'] : documentRef);
        this._writeBatch.set(ref, encodeSetDocument(data, options), sanitizeSetOptions(options));
        return this;
    };
    /**
     * Updates fields in the document referred to by the provided `DocumentReference` or `GeoDocumentReference`. The update will fail if
     * applied to a document that does not exist.
     *
     * @param documentRef A reference to the document to be updated.
     * @param data An object containing the fields and values with which to update the document. Fields can contain dots to reference nested
     * fields within the document.
     * @param customKey The key of the document to use as the location. Otherwise we default to `coordinates`.
     * @return This `GeoWriteBatch` instance. Used for chaining method calls.
     */
    GeoWriteBatch.prototype.update = function (documentRef, data, customKey) {
        var ref = ((documentRef instanceof GeoDocumentReference) ?
            documentRef['_document'] : documentRef);
        this._writeBatch.update(ref, encodeUpdateDocument(data, customKey));
        return this;
    };
    /**
     * Deletes the document referred to by the provided `DocumentReference` or `GeoDocumentReference`.
     *
     * @param documentRef A reference to the document to be deleted.
     * @return This `WriteBatch` instance. Used for chaining method calls.
     */
    GeoWriteBatch.prototype.delete = function (documentRef) {
        var ref = ((documentRef instanceof GeoDocumentReference) ?
            documentRef['_document'] : documentRef);
        this._writeBatch.delete(ref);
        return this;
    };
    /**
     * Commits all of the writes in this write batch as a single atomic unit.
     *
     * @return A Promise resolved once all of the writes in the batch have been successfully written to the backend as an atomic unit. Note
     * that it won't resolve while you're offline.
     */
    GeoWriteBatch.prototype.commit = function () {
        return this._writeBatch.commit();
    };
    return GeoWriteBatch;
}());

/**
 * `GeoFirestore` represents a Firestore Database and is the entry point for all GeoFirestore operations.
 */
var GeoFirestore = /** @class */ (function () {
    /**
     * @param _firestore Firestore represents a Firestore Database and is the entry point for all Firestore operations.
     */
    function GeoFirestore(_firestore) {
        this._firestore = _firestore;
        if (Object.prototype.toString.call(_firestore) !== '[object Object]') {
            throw new Error('Firestore must be an instance of Firestore');
        }
    }
    Object.defineProperty(GeoFirestore.prototype, "native", {
        /** The native `Firestore` instance. */
        get: function () {
            return this._firestore;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Creates a write batch, used for performing multiple writes as a single atomic operation.
     *
     * @return A new `GeoWriteBatch` instance.
     */
    GeoFirestore.prototype.batch = function () {
        return new GeoWriteBatch(this._firestore.batch());
    };
    /**
     * Gets a `GeoCollectionReference` instance that refers to the collection at the specified path.
     *
     * @param collectionPath A slash-separated path to a collection.
     * @return A new `GeoCollectionReference` instance.
     */
    GeoFirestore.prototype.collection = function (collectionPath) {
        return new GeoCollectionReference(this._firestore.collection(collectionPath));
    };
    /**
     * Executes the given updateFunction and then attempts to commit the changes applied within the transaction. If any document read within
     * the transaction has changed, the updateFunction will be retried. If it fails to commit after 5 attempts, the transaction will fail.
     *
     * Note: The `updateFunction` passed into `runTransaction` is a standard Firestore transaction. You should then immediateley create a
     * `GeoTransaction` to then make your calls to. Below is a small example on how to do that.
     *
     * @example
     * ```typescript
     * const geofirestore = new GeoFirestore(firebase.firestore());
     * const sfDocRef = geofirestore.collection('cities').doc('SF');
     *
     * geofirestore.runTransaction((transaction) => {
     *  // Immediateley create a `GeoTransaction` from the `transaction`
     *  const geotransaction = new GeoTransaction(transaction);
     *  // This code may get re-run multiple times if there are conflicts.
     *  return geotransaction.get(sfDocRef).then((sfDoc) => {
     *    if (!sfDoc.exists) {
     *      throw Error('Document does not exist!');
     *    }
     *    const newPopulation = sfDoc.data().population + 1;
     *    geotransaction.update(sfDocRef, { population: newPopulation });
     *  });
     * });
     * ```
     *
     * @param updateFunction The function to execute within the transaction context.
     * @return If the transaction completed successfully or was explicitly aborted (by the updateFunction returning a failed Promise), the
     * Promise returned by the updateFunction will be returned here. Else if the transaction failed, a rejected Promise with the
     * corresponding failure error will be returned.
     */
    GeoFirestore.prototype.runTransaction = function (updateFunction) {
        return this._firestore.runTransaction(updateFunction);
    };
    return GeoFirestore;
}());

/**
 * A `GeoDocumentReference` refers to a document location in a Firestore database and can be used to write, read, or listen to the
 * location. The document at the referenced location may or may not exist. A `GeoDocumentReference` can also be used to create a
 * `CollectionReference` to a subcollection.
 */
var GeoDocumentReference = /** @class */ (function () {
    /**
     * @param _document The `DocumentReference` instance.
     */
    function GeoDocumentReference(_document) {
        this._document = _document;
        if (Object.prototype.toString.call(_document) !== '[object Object]') {
            throw new Error('DocumentReference must be an instance of a Firestore DocumentReference');
        }
        this._isWeb = Object.prototype.toString
            .call(_document.firestore.enablePersistence) === '[object Function]';
    }
    Object.defineProperty(GeoDocumentReference.prototype, "native", {
        /** The native `DocumentReference` instance. */
        get: function () {
            return this._document;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(GeoDocumentReference.prototype, "id", {
        /** The identifier of the document within its collection. */
        get: function () {
            return this._document.id;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(GeoDocumentReference.prototype, "firestore", {
        /**
         * The `GeoFirestore` for the Firestore database (useful for performing transactions, etc.).
         */
        get: function () {
            return new GeoFirestore(this._document.firestore);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(GeoDocumentReference.prototype, "onSnapshot", {
        /**
         * Attaches a listener for GeoDocumentSnapshot events. You may either pass individual `onNext` and `onError` callbacks.
         *
         * @param onNext A callback to be called every time a new `GeoDocumentSnapshot` is available.
         * @param onError A callback to be called if the listen fails or is cancelled. No further callbacks will occur.
         * @return An unsubscribe function that can be called to cancel the snapshot listener.
         */
        get: function () {
            var _this = this;
            return function (onNext, onError) {
                return _this._document.onSnapshot(function (snapshot) { return onNext(new GeoDocumentSnapshot(snapshot)); }, function (error) { if (onError) {
                    onError(error);
                } });
            };
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(GeoDocumentReference.prototype, "parent", {
        /**
         * A reference to the GeoCollection to which this GeoDocumentReference belongs.
         */
        get: function () {
            return new GeoCollectionReference(this._document.parent);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(GeoDocumentReference.prototype, "path", {
        /**
         * A string representing the path of the referenced document (relative to the root of the database).
         */
        get: function () {
            return this._document.path;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Gets a `GeoCollectionReference` instance that refers to the collection at the specified path.
     *
     * @param collectionPath A slash-separated path to a collection.
     * @return The `GeoCollectionReference` instance.
     */
    GeoDocumentReference.prototype.collection = function (collectionPath) {
        return new GeoCollectionReference(this._document.collection(collectionPath));
    };
    /**
     * Deletes the document referred to by this `GeoDocumentReference`.
     *
     * @return A Promise resolved once the document has been successfully deleted from the backend (Note that it won't resolve while you're
     * offline).
     */
    GeoDocumentReference.prototype.delete = function () {
        return this._document.delete().then(function () { return null; });
    };
    /**
     * Reads the document referred to by this `GeoDocumentReference`.
     *
     * Note: By default, get() attempts to provide up-to-date data when possible by waiting for data from the server, but it may return
     * cached data or fail if you are offline and the server cannot be reached. This behavior can be altered via the `GetOptions` parameter.
     *
     * @param options An object to configure the get behavior.
     * @return A Promise resolved with a GeoDocumentSnapshot containing the current document contents.
     */
    GeoDocumentReference.prototype.get = function (options) {
        if (options === void 0) { options = { source: 'default' }; }
        return this._isWeb ?
            this._document.get(options).then(function (snapshot) { return new GeoDocumentSnapshot(snapshot); }) :
            this._document.get().then(function (snapshot) { return new GeoDocumentSnapshot(snapshot); });
    };
    /**
     * Returns true if this `GeoDocumentReference` is equal to the provided one.
     *
     * @param other The `DocumentReference` or `GeoDocumentReference` to compare against.
     * @return true if this `DocumentReference` or `GeoDocumentReference` is equal to the provided one.
     */
    GeoDocumentReference.prototype.isEqual = function (other) {
        if (other instanceof GeoDocumentReference) {
            return this._document
                .isEqual(other['_document']);
        }
        return this._document.isEqual(other);
    };
    /**
     * Writes to the document referred to by this `GeoDocumentReference`. If the document does not yet exist, it will be created. If you pass
     * `SetOptions`, the provided data can be merged into an existing document.
     *
     * @param data A map of the fields and values for the document.
     * @param options An object to configure the set behavior. Includes custom key for location in document.
     * @return A Promise resolved once the data has been successfully written to the backend (Note it won't resolve while you're offline).
     */
    GeoDocumentReference.prototype.set = function (data, options) {
        return this._document.set(encodeSetDocument(data, options), sanitizeSetOptions(options)).then(function () { return null; });
    };
    /**
     * Updates fields in the document referred to by this `GeoDocumentReference`. The update will fail if applied to a document that does not
     * exist.
     *
     * @param data An object containing the fields and values with which to update the document. Fields can contain dots to reference nested
     * fields within the document.
     * @param customKey The key of the document to use as the location. Otherwise we default to `coordinates`.
     * @return A Promise resolved once the data has been successfully written to the backend (Note it won't resolve while you're offline).
     */
    GeoDocumentReference.prototype.update = function (data, customKey) {
        return this._document.update(encodeUpdateDocument(data, customKey)).then(function () { return null; });
    };
    return GeoDocumentReference;
}());

/**
 * A `GeoQuerySnapshot` contains zero or more `QueryDocumentSnapshot` objects
 * representing the results of a query. The documents can be accessed as an
 * array via the `docs` property or enumerated using the `forEach` method. The
 * number of documents can be determined via the `empty` and `size`
 * properties.
 */
var GeoQuerySnapshot = /** @class */ (function () {
    /**
     * @param _querySnapshot The `QuerySnapshot` instance.
     * @param geoQueryCriteria The center and radius of geo based queries.
     */
    function GeoQuerySnapshot(_querySnapshot, _center) {
        this._querySnapshot = _querySnapshot;
        this._center = _center;
        if (_center) {
            // Validate the _center coordinates
            validateLocation(_center);
        }
        this._docs = _querySnapshot.docs
            .map(function (snapshot) { return generateGeoQueryDocumentSnapshot(snapshot, _center); });
    }
    Object.defineProperty(GeoQuerySnapshot.prototype, "native", {
        /** The native `QuerySnapshot` instance. */
        get: function () {
            return this._querySnapshot;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(GeoQuerySnapshot.prototype, "docs", {
        /** An array of all the documents in the GeoQuerySnapshot. */
        get: function () {
            return this._docs;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(GeoQuerySnapshot.prototype, "size", {
        /** The number of documents in the GeoQuerySnapshot. */
        get: function () {
            return this._docs.length;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(GeoQuerySnapshot.prototype, "empty", {
        /** True if there are no documents in the GeoQuerySnapshot. */
        get: function () {
            return this._docs.length ? false : true;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Returns an array of the documents changes since the last snapshot. If
     * this is the first snapshot, all documents will be in the list as added
     * changes.
     *
     * @returns Array of DocumentChanges.
     */
    GeoQuerySnapshot.prototype.docChanges = function () {
        var _this = this;
        var docChanges = Array.isArray(this._querySnapshot.docChanges) ?
            this._querySnapshot.docChanges : this._querySnapshot.docChanges();
        return docChanges
            .map(function (change) {
            return {
                doc: generateGeoQueryDocumentSnapshot(change.doc, _this._center),
                newIndex: change.newIndex,
                oldIndex: change.oldIndex,
                type: change.type
            };
        });
    };
    /**
     * Enumerates all of the documents in the GeoQuerySnapshot.
     *
     * @param callback A callback to be called with a `DocumentSnapshot` for
     * each document in the snapshot.
     * @param thisArg The `this` binding for the callback.
     */
    GeoQuerySnapshot.prototype.forEach = function (callback, thisArg) {
        this.docs.forEach(callback, thisArg);
    };
    return GeoQuerySnapshot;
}());

/**
 * A `GeoJoinerGet` aggregates multiple `get` results.
 */
var GeoJoinerGet = /** @class */ (function () {
    /**
     * @param snapshots An array of snpashots from a Firestore Query `get` call.
     * @param _queryCriteria The query criteria of geo based queries, includes field such as center, radius, and limit.
     */
    function GeoJoinerGet(snapshots, _queryCriteria) {
        var _this = this;
        this._queryCriteria = _queryCriteria;
        this._docs = new Map();
        validateQueryCriteria(_queryCriteria);
        snapshots.forEach(function (snapshot) {
            snapshot.docs.forEach(function (doc) {
                var distance = calculateDistance(_this._queryCriteria.center, doc.data().l);
                if (_this._queryCriteria.radius >= distance) {
                    _this._docs.set(doc.id, doc);
                }
            });
        });
        if (this._queryCriteria.limit && this._docs.size > this._queryCriteria.limit) {
            var arrayToLimit = Array.from(this._docs.values()).map(function (doc) {
                return { distance: calculateDistance(_this._queryCriteria.center, doc.data().l), id: doc.id };
            }).sort(function (a, b) { return a.distance - b.distance; });
            for (var i = this._queryCriteria.limit; i < arrayToLimit.length; i++) {
                this._docs.delete(arrayToLimit[i].id);
            }
        }
    }
    /**
     * Returns parsed docs as a GeoQuerySnapshot.
     *
     * @return A new `GeoQuerySnapshot` of the filtered documents from the `get`.
     */
    GeoJoinerGet.prototype.getGeoQuerySnapshot = function () {
        var docs = Array.from(this._docs.values());
        return new GeoQuerySnapshot({ docs: docs, docChanges: function () { return docs.map(function (doc, index) {
                return { doc: doc, newIndex: index, oldIndex: -1, type: 'added' };
            }); } }, this._queryCriteria.center);
    };
    return GeoJoinerGet;
}());

/**
 * A `GeoJoinerOnSnapshot` subscribes and aggregates multiple `onSnapshot` listeners
 * while filtering out documents not in query radius.
 */
var GeoJoinerOnSnapshot = /** @class */ (function () {
    /**
     * @param _queries An array of Firestore Queries to aggregate.
     * @param _queryCriteria The query criteria of geo based queries, includes field such as center, radius, and limit.
     * @param _onNext A callback to be called every time a new `QuerySnapshot` is available.
     * @param _onError A callback to be called if the listen fails or is cancelled. No further callbacks will occur.
     */
    function GeoJoinerOnSnapshot(_queries, _queryCriteria, _onNext, _onError) {
        var _this = this;
        this._queries = _queries;
        this._queryCriteria = _queryCriteria;
        this._onNext = _onNext;
        this._onError = _onError;
        this._docs = new Map();
        this._firstRoundResolved = false;
        this._firstEmitted = false;
        this._newValues = false;
        this._subscriptions = [];
        this._queriesResolved = [];
        validateQueryCriteria(_queryCriteria);
        this._queriesResolved = new Array(_queries.length).fill(0);
        _queries.forEach(function (value, index) {
            var subscription = value.onSnapshot(function (snapshot) { return _this._processSnapshot(snapshot, index); }, function (error) { return (_this._error = error); });
            _this._subscriptions.push(subscription);
        });
        this._interval = setInterval(function () { return _this._emit(); }, 100);
    }
    /**
     * A functions that clears the interval and ends all query subscriptions.
     *
     * @return An unsubscribe function that can be called to cancel all snapshot listener.
     */
    GeoJoinerOnSnapshot.prototype.unsubscribe = function () {
        var _this = this;
        return function () {
            clearInterval(_this._interval);
            _this._subscriptions.forEach(function (subscription) { return subscription(); });
        };
    };
    /**
     * Runs through documents stored in map to set value to send in `next` function.
     */
    GeoJoinerOnSnapshot.prototype._next = function () {
        var _this = this;
        // Sort docs based on distance if there is a limit so we can then limit it
        if (this._queryCriteria.limit && this._docs.size > this._queryCriteria.limit) {
            var arrayToLimit = Array.from(this._docs.values()).sort(function (a, b) { return a.distance - b.distance; });
            // Iterate over documents outside of limit
            for (var i = this._queryCriteria.limit; i < arrayToLimit.length; i++) {
                if (arrayToLimit[i].emitted) { // Mark as removed if outside of query and previously emitted
                    var result = { change: __assign({}, arrayToLimit[i].change), distance: arrayToLimit[i].distance, emitted: arrayToLimit[i].emitted };
                    result.change.type = 'removed';
                    this._docs.set(result.change.doc.id, result);
                }
                else { // Remove if not previously in query
                    this._docs.delete(arrayToLimit[i].change.doc.id);
                }
            }
        }
        var deductIndexBy = 0;
        var docChanges = Array.from(this._docs.values()).map(function (value, index) {
            var result = {
                type: value.change.type,
                doc: value.change.doc,
                oldIndex: value.emitted ? value.change.newIndex : -1,
                newIndex: (value.change.type !== 'removed') ? (index - deductIndexBy) : -1
            };
            if (result.type === 'removed') {
                deductIndexBy--;
                _this._docs.delete(result.doc.id);
            }
            else {
                _this._docs.set(result.doc.id, { change: result, distance: value.distance, emitted: true });
            }
            return result;
        });
        var docs = docChanges.reduce(function (filtered, change) {
            if (change.newIndex >= 0) {
                filtered.push(change.doc);
            }
            else {
                _this._docs.delete(change.doc.id);
            }
            return filtered;
        }, []);
        this._firstEmitted = true;
        this._onNext(new GeoQuerySnapshot({
            docs: docs,
            docChanges: function () { return docChanges.reduce(function (reduced, change) {
                if (change.oldIndex === -1 || change.type !== 'added') {
                    reduced.push(change);
                }
                return reduced;
            }, []); }
        }, this._queryCriteria.center));
    };
    /**
     * Determines if new values should be emitted via `next` or if subscription should be killed with `error`.
     */
    GeoJoinerOnSnapshot.prototype._emit = function () {
        if (this._error) {
            if (this._onError)
                this._onError(this._error);
            this.unsubscribe()();
        }
        else if (this._newValues && this._firstRoundResolved) {
            this._newValues = false;
            this._next();
        }
        else if (!this._firstRoundResolved) {
            this._firstRoundResolved = this._queriesResolved.reduce(function (a, b) { return a + b; }, 0) === this._queries.length;
        }
    };
    /**
     * Parses `snapshot` and filters out documents not in query radius. Sets new values to `_docs` map.
     *
     * @param snapshot The `QuerySnapshot` of the query.
     * @param index Index of query who's snapshot has been triggered.
     */
    GeoJoinerOnSnapshot.prototype._processSnapshot = function (snapshot, index) {
        var _this = this;
        var docChanges = Array.isArray(snapshot.docChanges) ?
            snapshot.docChanges : snapshot.docChanges();
        if (!this._firstRoundResolved)
            this._queriesResolved[index] = 1;
        if (docChanges.length) { // Snapshot has data, key during first snapshot
            docChanges.forEach(function (change) {
                var distance = change.doc.data().l ? calculateDistance(_this._queryCriteria.center, change.doc.data().l) : null;
                var id = change.doc.id;
                var fromMap = _this._docs.get(id);
                var doc = {
                    change: {
                        doc: change.doc,
                        oldIndex: (fromMap && _this._firstEmitted) ? fromMap.change.oldIndex : -1,
                        newIndex: (fromMap && _this._firstEmitted) ? fromMap.change.newIndex : -1,
                        type: (fromMap && _this._firstEmitted) ? change.type : 'added'
                    }, distance: distance, emitted: _this._firstEmitted ? !!fromMap : false
                };
                if (_this._queryCriteria.radius >= distance) { // Ensure doc in query radius
                    // Ignore doc since it wasn't in map and was already 'removed'
                    if (!fromMap && doc.change.type === 'removed')
                        return;
                    // Mark doc as 'added' doc since it wasn't in map and was 'modified' to be
                    if (!fromMap && doc.change.type === 'modified')
                        doc.change.type = 'added';
                    _this._newValues = true;
                    _this._docs.set(id, doc);
                }
                else if (fromMap) { // Document isn't in query, but is in map
                    doc.change.type = 'removed'; // Not in query anymore, mark for removal
                    _this._newValues = true;
                    _this._docs.set(id, doc);
                }
                else if (!fromMap && !_this._firstRoundResolved) { // Document isn't in map and the first round hasn't resolved
                    // This is an empty query, but it has resolved
                    _this._newValues = true;
                }
            });
        }
        else if (!this._firstRoundResolved) { // Snapshot doesn't have data, key during first snapshot
            this._newValues = true;
        }
    };
    return GeoJoinerOnSnapshot;
}());

/**
 * A `GeoQuery` refers to a Query which you can read or listen to. You can also construct refined `GeoQuery` objects by adding filters and
 * ordering.
 */
var GeoQuery = /** @class */ (function () {
    /**
     * @param _query The `Query` instance.
     * @param queryCriteria The query criteria of geo based queries, includes field such as center, radius, and limit.
     */
    function GeoQuery(_query, queryCriteria) {
        this._query = _query;
        if (Object.prototype.toString.call(_query) !== '[object Object]') {
            throw new Error('Query must be an instance of a Firestore Query');
        }
        this._isWeb = Object.prototype.toString
            .call(_query.firestore.enablePersistence) === '[object Function]';
        if (queryCriteria) {
            if (queryCriteria.limit) {
                this._limit = queryCriteria.limit;
            }
            if (queryCriteria.center && queryCriteria.radius) {
                // Validate and save the query criteria
                validateQueryCriteria(queryCriteria);
                this._center = queryCriteria.center;
                this._radius = queryCriteria.radius;
            }
        }
    }
    Object.defineProperty(GeoQuery.prototype, "native", {
        /** The native `Query` instance. */
        get: function () {
            return this._query;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(GeoQuery.prototype, "firestore", {
        /**
         * The `Firestore` for the Firestore database (useful for performing transactions, etc.).
         */
        get: function () {
            return new GeoFirestore(this._query.firestore);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(GeoQuery.prototype, "onSnapshot", {
        /**
         * Attaches a listener for `GeoQuerySnapshot` events.
         *
         * @param onNext A callback to be called every time a new `GeoQuerySnapshot` is available.
         * @param onError A callback to be called if the listen fails or is cancelled. Since multuple queries occur only the failed query will
         * cease.
         * @return An unsubscribe function that can be called to cancel the snapshot listener.
         */
        get: function () {
            var _this = this;
            return function (onNext, onError) {
                if (_this._center && _this._radius) {
                    return new GeoJoinerOnSnapshot(_this._generateQuery(), _this._queryCriteria, onNext, onError).unsubscribe();
                }
                else {
                    var query = _this._limit ? _this._query.limit(_this._limit) : _this._query;
                    return query.onSnapshot(function (snapshot) { return onNext(new GeoQuerySnapshot(snapshot)); }, onError);
                }
            };
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Executes the query and returns the results as a GeoQuerySnapshot.
     *
     * WEB CLIENT ONLY
     * Note: By default, get() attempts to provide up-to-date data when possible by waiting for data from the server, but it may return
     * cached data or fail if you are offline and the server cannot be reached. This behavior can be altered via the `GetOptions` parameter.
     *
     * @param options An object to configure the get behavior.
     * @return A Promise that will be resolved with the results of the GeoQuery.
     */
    GeoQuery.prototype.get = function (options) {
        var _this = this;
        if (options === void 0) { options = { source: 'default' }; }
        if (this._center && typeof this._radius !== 'undefined') {
            var queries = this._generateQuery().map(function (query) { return _this._isWeb ? query.get(options) : query.get(); });
            return Promise.all(queries).then(function (value) { return new GeoJoinerGet(value, _this._queryCriteria).getGeoQuerySnapshot(); });
        }
        else {
            var query = this._limit ? this._query.limit(this._limit) : this._query;
            var promise = this._isWeb ? query.get(options) : query.get();
            return promise.then(function (snapshot) { return new GeoQuerySnapshot(snapshot); });
        }
    };
    GeoQuery.prototype.getWithCustomQueries = function (customiseQueries, options) {
        var _this = this;
        if (options === void 0) { options = { source: 'default' }; }
        if (this._center && typeof this._radius !== 'undefined') {
            var hashWithQueries = this._generateQueryWithGeohashes();
            // Modify queries using function parameter
            var customisedQueries_1 = customiseQueries ? customiseQueries(hashWithQueries) : hashWithQueries;
            var queries = customisedQueries_1.map(function (_a) {
                var hash = _a[0], query = _a[1];
                return _this._isWeb ? query.get(options) : query.get();
            });
            return Promise.all(queries)
                .then(function (snapshots) {
                return snapshots.map(function (snapshot, index) {
                    return [
                        customisedQueries_1[index][0],
                        new GeoQuerySnapshot(snapshot)
                    ];
                });
            });
        }
        else {
            var query = this._limit ? this._query.limit(this._limit) : this._query;
            var promise = this._isWeb ? query.get(options) : query.get();
            return promise.then(function (snapshot) { return [[null, new GeoQuerySnapshot(snapshot)]]; });
        }
    };
    /**
     * Creates and returns a new GeoQuery that's additionally limited to only return up to the specified number of documents.
     *
     * This function returns a new (immutable) instance of the GeoQuery (rather than modify the existing instance) to impose the limit.
     *
     * Note: Limits on geoqueries are applied based on the distance from the center. Geoqueries require an aggregation of queries.
     * When performing a geoquery the library applies the limit on the client. This may mean you are loading to the client more documents
     * then you intended. Use with this performance limitation in mind.
     *
     * @param limit The maximum number of items to return.
     * @return The created GeoQuery.
     */
    GeoQuery.prototype.limit = function (limit) {
        validateLimit(limit);
        this._limit = limit;
        return new GeoQuery(this._query, this._queryCriteria);
    };
    /**
     * Creates and returns a new GeoQuery with the geoquery filter where `get` and `onSnapshot` will query around.
     *
     * This function returns a new (immutable) instance of the GeoQuery (rather than modify the existing instance) to impose the filter.
     *
     * @param newQueryCriteria The criteria which specifies the query's center and radius.
     * @return The created GeoQuery.
     */
    GeoQuery.prototype.near = function (newGeoQueryCriteria) {
        // Validate and save the new query criteria
        validateQueryCriteria(newGeoQueryCriteria);
        this._center = newGeoQueryCriteria.center || this._center;
        this._radius = newGeoQueryCriteria.radius || this._radius;
        return new GeoQuery(this._query, this._queryCriteria);
    };
    /**
     * Creates and returns a new GeoQuery with the additional filter that documents must contain the specified field and that its value
     * should satisfy the relation constraint provided.
     *
     * This function returns a new (immutable) instance of the GeoQuery (rather than modify the existing instance) to impose the filter.
     *
     * @param fieldPath The path to compare
     * @param opStr The operation string (e.g "<", "<=", "==", ">", ">=").
     * @param value The value for comparison
     * @return The created GeoQuery.
     */
    GeoQuery.prototype.where = function (fieldPath, opStr, value) {
        return new GeoQuery(this._query.where((fieldPath ? ('d.' + fieldPath) : fieldPath), opStr, value), this._queryCriteria);
    };
    /**
     * Creates an array of geohash strings and `Query` objects that query the appropriate geohashes
     * based on the radius and center GeoPoint of the query criteria.
     *
     * @return Array of [geohash, Queries] to search against.
     */
    GeoQuery.prototype._generateQueryWithGeohashes = function () {
        var _this = this;
        // Get the list of geohashes to query
        var geohashesToQuery = geohashQueries(this._center, this._radius * 1000).map(this._queryToString);
        // Generalise geohashes up one level
        geohashesToQuery = geohashesToQuery.map(function (hashPair) {
            var split = hashPair.split(':');
            return split[0].slice(0, split[0].length - 1);
        });
        // Filter out duplicate geohashes
        geohashesToQuery = geohashesToQuery.filter(function (geohash, i) { return geohashesToQuery.indexOf(geohash) === i; });
        return geohashesToQuery.map(function (toQueryStr) {
            // Create the Firebase query
            var query = _this._query;
            for (var i = 0; i < toQueryStr.length; i++) {
                query = query.where("g" + (i + 1), '==', toQueryStr[i]);
            }
            return [
                toQueryStr,
                query
            ];
        });
    };
    /**
     * Creates an array of `Query` objects that query the appropriate geohashes based on the radius and center GeoPoint of the query criteria.
     *
     * @return Array of Queries to search against.
     */
    GeoQuery.prototype._generateQuery = function () {
        var _this = this;
        // Get the list of geohashes to query
        var geohashesToQuery = geohashQueries(this._center, this._radius * 1000).map(this._queryToString);
        // Filter out duplicate geohashes
        geohashesToQuery = geohashesToQuery.filter(function (geohash, i) { return geohashesToQuery.indexOf(geohash) === i; });
        return geohashesToQuery.map(function (toQueryStr) {
            // decode the geohash query string
            var query = _this._stringToQuery(toQueryStr);
            // Create the Firebase query
            return _this._query.orderBy('g').startAt(query[0]).endAt(query[1]);
        });
    };
    Object.defineProperty(GeoQuery.prototype, "_queryCriteria", {
        /**
         * Returns the center and radius of geo based queries as a QueryCriteria object.
         */
        get: function () {
            return {
                center: this._center,
                limit: this._limit,
                radius: this._radius
            };
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Decodes a query string to a query
     *
     * @param str The encoded query.
     * @return The decoded query as a [start, end] pair.
     */
    GeoQuery.prototype._stringToQuery = function (str) {
        var decoded = str.split(':');
        if (decoded.length !== 2) {
            throw new Error('Invalid internal state! Not a valid geohash query: ' + str);
        }
        return decoded;
    };
    /**
     * Encodes a query as a string for easier indexing and equality.
     *
     * @param query The query to encode.
     * @return The encoded query as string.
     */
    GeoQuery.prototype._queryToString = function (query) {
        if (query.length !== 2) {
            throw new Error('Not a valid geohash query: ' + query);
        }
        return query[0] + ':' + query[1];
    };
    return GeoQuery;
}());

/**
 * A `GeoCollectionReference` object can be used for adding documents, getting document references, and querying for documents (using the
 * methods inherited from `GeoQuery`).
 */
var GeoCollectionReference = /** @class */ (function (_super) {
    __extends(GeoCollectionReference, _super);
    /**
     * @param _collection The `CollectionReference` instance.
     */
    function GeoCollectionReference(_collection) {
        var _this = _super.call(this, _collection) || this;
        _this._collection = _collection;
        return _this;
    }
    Object.defineProperty(GeoCollectionReference.prototype, "native", {
        /** The native `CollectionReference` instance. */
        get: function () {
            return this._collection;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(GeoCollectionReference.prototype, "id", {
        /** The identifier of the collection. */
        get: function () {
            return this._collection.id;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(GeoCollectionReference.prototype, "parent", {
        /**
         * A reference to the containing Document if this is a subcollection, else null.
         */
        get: function () {
            return this._collection.parent ? new GeoDocumentReference(this._collection.parent) : null;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(GeoCollectionReference.prototype, "path", {
        /**
         * A string representing the path of the referenced collection (relative
         * to the root of the database).
         */
        get: function () {
            return this._collection.path;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Add a new document to this collection with the specified data, assigning it a document ID automatically.
     *
     * @param data An Object containing the data for the new document.
     * @param customKey The key of the document to use as the location. Otherwise we default to `coordinates`.
     * @return A Promise resolved with a `GeoDocumentReference` pointing to the newly created document after it has been written to the
     * backend.
     */
    GeoCollectionReference.prototype.add = function (data, customKey) {
        if (Object.prototype.toString.call(data) === '[object Object]') {
            var location_1 = findCoordinates(data, customKey);
            var geohash = encodeGeohash(location_1);
            return this._collection
                .add(encodeGeoDocument(location_1, geohash, data)).then(function (doc) { return new GeoDocumentReference(doc); });
        }
        else {
            throw new Error('document must be an object');
        }
    };
    /**
     * Get a `GeoDocumentReference` for the document within the collection at the specified path. If no path is specified, an
     * automatically-generated unique ID will be used for the returned GeoDocumentReference.
     *
     * @param documentPath A slash-separated path to a document.
     * @return The `GeoDocumentReference` instance.
     */
    GeoCollectionReference.prototype.doc = function (documentPath) {
        return (documentPath) ? new GeoDocumentReference(this._collection.doc(documentPath)) : new GeoDocumentReference(this._collection.doc());
    };
    return GeoCollectionReference;
}(GeoQuery));

/**
 * A reference to a transaction. The `GeoTransaction` object passed to a transaction's updateFunction provides the methods to read and
 * write data within the transaction context. See `GeoFirestore.runTransaction()`.
 */
var GeoTransaction = /** @class */ (function () {
    /**
     * @param _transaction The `Transaction` instance.
     */
    function GeoTransaction(_transaction) {
        this._transaction = _transaction;
        if (Object.prototype.toString.call(_transaction) !== '[object Object]') {
            throw new Error('Transaction must be an instance of a Firestore Transaction');
        }
    }
    Object.defineProperty(GeoTransaction.prototype, "native", {
        /** The native `Transaction` instance. */
        get: function () {
            return this._transaction;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Deletes the document referred to by the provided `GeoDocumentReference` or `DocumentReference`.
     *
     * @param documentRef A reference to the document to be deleted.
     * @return This `GeoTransaction` instance. Used for chaining method calls.
     */
    GeoTransaction.prototype.delete = function (documentRef) {
        var ref = ((documentRef instanceof GeoDocumentReference) ?
            documentRef['_document'] : documentRef);
        this._transaction.delete(ref);
        return this;
    };
    /**
     * Reads the document referenced by the provided `GeoDocumentReference` or `DocumentReference`.
     *
     * @param documentRef A reference to the document to be read.
     * @return A GeoDocumentSnapshot for the read data.
     */
    GeoTransaction.prototype.get = function (documentRef) {
        var ref = ((documentRef instanceof GeoDocumentReference) ?
            documentRef['_document'] : documentRef);
        return this._transaction.get(ref).then(function (snpashot) { return new GeoDocumentSnapshot(snpashot); });
    };
    /**
     * Writes to the document referred to by the provided `GeoDocumentReference` or `DocumentReference`.
     * If the document does not exist yet, it will be created. If you pass `SetOptions`,
     * the provided data can be merged into the existing document.
     *
     * @param documentRef A reference to the document to be set.
     * @param data An object of the fields and values for the document.
     * @param options An object to configure the set behavior. Includes custom key for location in document.
     * @return This `GeoTransaction` instance. Used for chaining method calls.
     */
    GeoTransaction.prototype.set = function (documentRef, data, options) {
        var ref = ((documentRef instanceof GeoDocumentReference) ?
            documentRef['_document'] : documentRef);
        this._transaction.set(ref, encodeSetDocument(data, options), sanitizeSetOptions(options));
        return this;
    };
    /**
     * Updates fields in the document referred to by the provided `GeoDocumentReference` or `DocumentReference`.
     * The update will fail if applied to a document that does not exist.
     *
     * @param documentRef A reference to the document to be updated.
     * @param data An object containing the fields and values with which to update the document. Fields can contain dots to reference nested
     * fields within the document.
     * @param customKey The key of the document to use as the location. Otherwise we default to `coordinates`.
     * @return This `GeoTransaction` instance. Used for chaining method calls.
     */
    GeoTransaction.prototype.update = function (documentRef, data, customKey) {
        var ref = ((documentRef instanceof GeoDocumentReference) ?
            documentRef['_document'] : documentRef);
        this._transaction.update(ref, encodeUpdateDocument(data, customKey));
        return this;
    };
    return GeoTransaction;
}());

exports.GeoCollectionReference = GeoCollectionReference;
exports.GeoDocumentReference = GeoDocumentReference;
exports.GeoDocumentSnapshot = GeoDocumentSnapshot;
exports.GeoFirestore = GeoFirestore;
exports.GeoQuery = GeoQuery;
exports.GeoQuerySnapshot = GeoQuerySnapshot;
exports.GeoTransaction = GeoTransaction;
exports.GeoWriteBatch = GeoWriteBatch;
