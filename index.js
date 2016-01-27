'use strict';

var VectorTileFeatureTypes = ['Unknown', 'Point', 'LineString', 'Polygon'];

function infix(operator) {
    return {
        vars: empty,
        f: function(_, _2, key, value) {
            if (key === '$type') {
                return 't' + operator + VectorTileFeatureTypes.indexOf(value);
            } else {
                return 'p[' + JSON.stringify(key) + ']' + operator + JSON.stringify(value);
            }
        }
    };
}

function strictInfix(operator) {
    var nonstrictInfix = infix(operator).f;
    return {
        vars: empty,
        f: function(_, _2, key, value) {
            if (key === '$type') {
                return nonstrictInfix(_, _2, key, value);
            } else {
                return 'typeof(p[' + JSON.stringify(key) + ']) === typeof(' + JSON.stringify(value) + ') && ' +
                    nonstrictInfix(_, _2, key, value);
            }
        }
    };
}

var hashThreshold = 30;

var operators = {
    '==': infix('==='),
    '!=': infix('!=='),
    '>': strictInfix('>'),
    '<': strictInfix('<'),
    '<=': strictInfix('<='),
    '>=': strictInfix('>='),
    'in': {
        vars: function(_, _2, key) {
            var valueList = Array.prototype.slice.call(arguments, 3);
            if (valueList.length < hashThreshold) {
                return [];
            }
            var values = {};
            valueList.forEach(function(value) {
                if (key === '$type') {
                    values[VectorTileFeatureTypes.indexOf(value)] = true;
                } else {
                    values[typeof(value) + '' + value] = true;
                }
            });
            return [{
                name: 'v' + arguments[0].length,
                value: values
            }];
        },
        f: function (_, _2, key) {
            var valueList = Array.prototype.slice.call(arguments, 3);
            if (valueList.length < hashThreshold) {
                return '(function(){' + valueList.map(function(value) {
                    return 'if (' + operators['=='].f(_, _2, key, value) + ') return true;';
                }).join('') + 'return false;})()';
            } else {
                if (key === '$type') {
                    return '!!v' + arguments[0].length + '[t]';
                } else {
                    return '!!v' + arguments[0].length + '[typeof(p[' + JSON.stringify(key) + ']) + "" + p[' + JSON.stringify(key) + ']]';
                }
            }
        }
    },
    '!in': {
        vars: function() { return operators.in.vars.apply(this, arguments) },
        f: function () {
            return '!(' + operators.in.f.apply(this, arguments) + ')';
        }
    },
    'any': {
        vars: empty,
        f: function () {
            return Array.prototype.slice.call(arguments, 2).map(function (filter) {
                    return '(' + subcompile(arguments[0], filter) + ')';
                }).join('||') || 'false';
        }
    },
    'all': {
        vars: empty,
        f: function() {
            return Array.prototype.slice.call(arguments, 2).map(function(filter) {
                    return '(' + subcompile(arguments[0], filter) + ')';
                }).join('&&') || 'true';
        }
    },
    'none': {
        vars: empty,
        f: function() {
            return '!(' + operators.any.f.apply(this, arguments) + ')';
        }
    }
};

function subcompile(allVars, filter) {
    var op = operators[filter[0]];
    var args = filter.slice();
    args.unshift(allVars);
    var f = op.f.apply(filter, args);
    var vars = op.vars.apply(filter, args);
    if (vars) {
        allVars.push.apply(allVars, vars);
    }
    return f;
}

function compile(allVars, filter) {
    var f = subcompile(allVars, filter);
    return {
        vars: allVars,
        f: f
    };
}

function empty() {
    return [];
}

function truth() {
    return true;
}

/**
 * Given a filter expressed as nested arrays, return a new function
 * that evaluates whether a given feature (with a .properties or .tags property)
 * passes its test.
 *
 * @param {Array} filter mapbox gl filter
 * @returns {Function} filter-evaluating function
 */
module.exports = function (filter) {
    if (!filter) return truth;
    var compiled = compile([], filter);
    var vars = compiled.vars.map(function(v) {
        return 'var ' + v.name + ' = ' + JSON.stringify(v.value);
    });
    var filterStr = vars.join(';') + ';(function(f) {var p = f.properties || f.tags || {}, t = f.type;return ' + compiled.f + '});';
    // jshint evil: true
    return eval(filterStr);
};
