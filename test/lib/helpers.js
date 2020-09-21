/**
 * Auxiliary functions.
 *
 * @module test/lib/helpers
 */

'use strict';

const bigInt = require('big-integer');

exports.toStr = toStr;
exports.toWei = toWei;

/**
 * Type cast an object to a string.
 *
 * @param  {Object} o Input object.
 * @return {String}   Output string.
 */
function toStr(o) {
    return o.toString(10);
}

/**
 * Simplified `toWei` function that assumes that we work only with 18 decimal
 * tokens. It also returns string instead of BN.
 *
 * @param  {String} s Input string.
 * @return {String}   Output string.
 */
function toWei(s) {
    return toStr(bigInt(s).multiply(1e18));
}
