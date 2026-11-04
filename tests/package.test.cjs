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

async function checkRuntime() {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  const { spawnSync } = require('node:child_process');
  const runtime = require('@mpeliz/gtpl/runtime');
  const fullESM = (await import('@mpeliz/gtpl')).default;
  const runtimeESM = (await import('@mpeliz/gtpl/runtime')).default;
  for (const [full, lean] of [[gtpl, runtime], [fullESM, runtimeESM]]) {
    for (const key of Object.keys(lean)) assert.equal(full[key], lean[key], `${key} must be shared`);
    assert.equal('jit' in lean, false);
    const root = { value: 'AOT' };
    const app = new lean.GTpl({ root, generator: ctx => {
      const text = { textContent: '' };
      ctx.addBind({ type: 0, ele: text, link: { vorc: { va: ['value'] } } });
      return [text];
    } });
    assert.ok(app instanceof full.GTpl);
    await app.ready(); assert.equal(app.Elements[0].textContent, 'AOT');
    app.destroy(false);
    const event = () => {}; const owner = {}; const raw = {};
    const proxy = full.GProxy(raw, event, owner);
    assert.equal(lean.GProxy(raw, event, owner), proxy);
    lean.unGProxy(raw, event, owner);
    const name = `package-directive-${Math.random()}`;
    assert.equal(full.GregisterDirective(name, class {}), true);
    assert.equal(lean.GregisterDirective(name, class {}), false);
  }

  // Load the complete CJS runtime graph with dynamic compilation forbidden.
  const context = vm.createContext({ console, queueMicrotask,
    Function: function () { throw Error('dynamic compilation forbidden'); },
    DOMParser: function () { throw Error('DOMParser forbidden'); }
  });
  const modules = new Map();
  function restrictedRequire(file) {
    file = require.resolve(file);
    if (modules.has(file)) return modules.get(file).exports;
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /DOMParser|\bFunction\s*\(/);
    const module = { exports: {} }; modules.set(file, module);
    const wrapper = new vm.Script(`(function(require,module,exports){${source}\n})`).runInContext(context);
    wrapper(request => restrictedRequire(path.resolve(path.dirname(file), request)), module, module.exports);
    return module.exports;
  }
  const restricted = restrictedRequire(require.resolve('@mpeliz/gtpl/runtime'));
  const app = new restricted.GTpl({ root: {}, generator: () => [] });
  await app.ready(); app.destroy();

  const fixture = path.resolve('tests/package-types.mts');
  try {
    fs.writeFileSync(fixture, `import full from '@mpeliz/gtpl';\nimport runtime from '@mpeliz/gtpl/runtime';\nlet a: InstanceType<typeof full.GTpl> = new runtime.GTpl();\nlet b: InstanceType<typeof runtime.GTpl> = new full.GTpl();\na = b; b = a;\n`);
    const checked = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', fixture,
      '--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2020', '--module', 'Node16', '--moduleResolution', 'Node16'], { encoding: 'utf8' });
    assert.equal(checked.status, 0, checked.stdout + checked.stderr);
  } finally { fs.rmSync(fixture, { force: true }); }
}

checkRuntime().catch(error => { console.error(error); process.exitCode = 1; });
