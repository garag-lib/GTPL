'use strict';

const assert = require('node:assert/strict');
const gtpl = require('@mpeliz/gtpl');

assert.equal(typeof gtpl.GTpl, 'function');
assert.equal(typeof gtpl.jit.GCode, 'function');
