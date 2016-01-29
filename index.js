'use strict';

module.exports = createFilter;

var types = ['Unknown', 'Point', 'LineString', 'Polygon'];
var typeLookup = {'Point': 1, 'LineString': 2, 'Polygon': 3}

/**
 * Given a filter expressed as nested arrays, return a new function
 * that evaluates whether a given feature (with a .properties or .tags property)
 * passes its test.
 *
 * @param {Array} filter mapbox gl filter
 * @returns {Function} filter-evaluating function
 */
function createFilter(filter) {
    if (!filter) return truth;

    var op = filter[0];
    var key = filter[1];

    var val =
        op === '==' ||
        op === '!=' ||
        op === '>' ||
        op === '<' ||
        op === '<=' ||
        op === '>=' ? filter[2] :
        op === 'in' ||
        op === '!in' ? filter.slice(2) : filter.slice(1);

    var opFn =
        op === 'in' ? (key === '$type' ? inType : _in) :
        op === '!in' ? (key === '$type' ? notInType : notIn) :
        op === '==' ? (key === '$type' ? equalsType : equals) :
        op === '!=' ? (key === '$type' ? notEqualsType : notEquals) :
        op === '<' ? lesser :
        op === '>' ? greater :
        op === '<=' ? lesserEqual :
        op === '>=' ? greaterEqual :
        val.map(createFilter);

    if (op === 'any') {
        return function (f) {
            for (var i = 0; i < opFn.length; i++) {
                if (opFn[i](f)) return true;
            }
            return false;
        }
    } else if (op === 'all') {
        return function (f) {
            for (var i = 0; i < opFn.length; i++) {
                if (!opFn[i](f)) return false;
            }
            return true;
        }
    } else if (op === 'none') {
        return function (f) {
            for (var i = 0; i < opFn.length; i++) {
                if (opFn[i](f)) return false;
            }
            return true;
        }
    }

    return function (f) {
        return opFn(f.properties || f.tags || {}, f.type);
    };

    function _in(p, t) { return val.indexOf(p[key]) !== -1; }
    function inType(p, t) { return val.indexOf(types[t]) !== -1; }
    function notIn(p, t) { return val.indexOf(p[key]) === -1; }
    function notInType(p, t) { return val.indexOf(types[t]) === -1; }
    function equals(p, t) { return p[key] === val; }
    function equalsType(p, t) { return t === typeLookup[val]; }
    function notEquals(p, t) { return p[key] !== val; }
    function notEqualsType(p, t) { return t !== typeLookup[val]; }
    function lesser(p, t) { return typeof p[key] === typeof val && p[key] < val; }
    function greater(p, t) { return typeof p[key] === typeof val && p[key] > val; }
    function lesserEqual(p, t) { return typeof p[key] === typeof val && p[key] <= val; }
    function greaterEqual(p, t) { return typeof p[key] === typeof val && p[key] >= val; }
    function truth() { return true; }
}
