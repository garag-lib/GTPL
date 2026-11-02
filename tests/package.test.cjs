'use strict';

const assert = require('node:assert/strict');
const gtpl = require('@mpeliz/gtpl');

assert.equal(typeof gtpl.GTpl, 'function');
assert.equal(typeof gtpl.GTpl.prototype.ready, 'function');
assert.equal(typeof gtpl.GGenerator, 'function');
assert.equal(typeof gtpl.jit.GCode, 'function');
assert.equal(typeof gtpl.jit.GCodeOptimized, 'function');
assert.equal(typeof gtpl.jit.GCompile, 'function');
for (const removed of ['GCompileSafe', 'GCodeSafe', 'GCodeOptimizedSafe']) {
  assert.equal(removed in gtpl, false);
  assert.equal(removed in gtpl.jit, false);
}
