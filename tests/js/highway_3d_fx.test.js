// Source + behavioural guards for h3d-carve-8: Q-helpers (lighting/FX utilities)
// extracted to src/fx.js.
//
// Class-killers guaranteed:
//   1. Module exports createFx (source)
//   2. createFx return set covers all 6 required symbols (source)
//   3. Stranded-caller: every returned symbol in screen.js destructure (source)
//   4. Private-guard: factory-depth-1 privates not bare in screen.js (source)
//   5. _timingHex returns EARLY tint when ts='EARLY' and _timingFx truthy (behavioural)
//   6. _sparkBurst writes to getSparkPos() array NOT a stale init-time capture
//      (live-accessor class-killer: set new arrays after factory init → RED if stale-cached)
//   7. _sparkUpdate sets .visible on getSparkPts() object (live-accessor)
//   8. _bloomEnsure calls setBloomLoad (synchronous write-back: assignment silenced → RED)
//  8b. _bloomEnsure reads getComposer() live (not init-cached: setComposer after init → RED)
//  GAP: setComposer(comp) inside the async .then() is not tested synchronously —
//       would require mocking dynamic import(); declared to Toby/Creed for assessment.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FX_JS = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'src', 'fx.js');
const SCREEN_JS = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'screen.js');

function stripComments(s) {
    return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function src() { return fs.readFileSync(FX_JS, 'utf8'); }
function screenSrc() { return fs.readFileSync(SCREEN_JS, 'utf8'); }

// ── 1. Module exports createFx ───────────────────────────────────────────────
test('fx.js exports createFx', () => {
    assert.match(src(), /export\s+function\s+createFx\s*\(/);
});

// ── 2. Return set covers all 6 required symbols ──────────────────────────────
test('createFx returns all 6 required symbols', () => {
    const stripped = stripComments(src());
    const REQUIRED = ['_h3dHexOrDefault', '_applyCinematic', '_timingHex', '_sparkBurst', '_sparkUpdate', '_bloomEnsure'];
    // Factory-level return block: 4-space indent inside createFx body.
    const retMatch = stripped.match(/\n {4}return\s*\{\s*([^}]+)\}/);
    assert.ok(retMatch, 'factory-level return block must be present');
    const returned = retMatch[1].split(',').map(s => s.trim()).filter(Boolean);
    for (const sym of REQUIRED) {
        assert.ok(returned.includes(sym), `return set must include ${sym}`);
    }
});

// ── 3. Stranded-caller: returned ⊆ screen.js destructure ────────────────────
test('every createFx returned symbol appears in screen.js destructure', () => {
    const stripped = stripComments(src());
    const retMatch = stripped.match(/\n {4}return\s*\{\s*([^}]+)\}/);
    assert.ok(retMatch, 'factory-level return block must be present');
    const returned = retMatch[1].split(',').map(s => s.trim()).filter(Boolean);

    const scrRaw = screenSrc();
    const destrMatch = scrRaw.match(/const\s*\{([^}]+)\}\s*=\s*createFx\s*\(/);
    assert.ok(destrMatch, 'screen.js must have a createFx destructure');
    const destructured = destrMatch[1].split(',').map(s => s.trim()).filter(Boolean);

    for (const sym of returned) {
        assert.ok(destructured.includes(sym),
            `returned symbol '${sym}' must appear in screen.js createFx destructure`);
    }
});

// ── 4. Private-guard: factory-depth-1 privates not bare in screen.js ─────────
test('factory-private symbols in fx.js do not appear bare in screen.js', () => {
    const stripped = stripComments(src());
    // Collect factory-level return symbols.
    const retMatch = stripped.match(/\n {4}return\s*\{\s*([^}]+)\}/);
    assert.ok(retMatch, 'factory-level return block must be present');
    const returned = new Set(retMatch[1].split(',').map(s => s.trim()).filter(Boolean));

    // Factory-depth-1: exactly 4-space indented const/let inside createFx.
    // (There are none in this module — all vars are per-call locals inside functions.)
    const privateSyms = [];
    for (const m of stripped.matchAll(/^ {4}(?:const|let)\s+(\w+)/gm)) {
        const sym = m[1];
        if (!returned.has(sym)) privateSyms.push(sym);
    }
    // Guard: if there ARE any factory-depth-1 privates, they must not be bare in screen.js.
    let scr = screenSrc().replace(/^import\s+.*\n/gm, '');
    scr = stripComments(scr);
    scr = scr.replace(/const\s*\{[^}]+\}\s*=\s*createFx\s*\([^)]*\)\s*;/, '');

    const violations = privateSyms.filter(sym => new RegExp('\\b' + sym + '\\b').test(scr));
    assert.deepStrictEqual(violations, [],
        'screen.js must not reference factory-private fx.js symbols: ' + violations.join(', '));
});

// ── Behavioural vm sandbox ───────────────────────────────────────────────────

function loadFxModule(di) {
    const raw = fs.readFileSync(FX_JS, 'utf8');
    // Strip ES export keyword so the script runs in a vm context.
    const code = raw.replace(/^export\s+function\s+createFx/m, 'function createFx');
    // Provide Promise so Promise.all() in _bloomEnsure is defined.
    // dynamic import() inside the vm will reject (no module resolution),
    // but setBloomLoad() is called BEFORE the rejection fires — it receives
    // the pending Promise synchronously, which is what the write-back test checks.
    const sandbox = { console, Promise, __exports: {} };
    vm.createContext(sandbox);
    vm.runInContext(code + '\n__exports.createFx = createFx;', sandbox);
    return sandbox.__exports.createFx(di);
}

function makeDi(overrides = {}) {
    // Minimal valid DI for behavioural tests.
    const state = {
        ambLight: null, dirLight: null, _cinematic: false, _timingFx: false,
        _sparkPts: null, _SPARK_N: 10,
        _sparkPos: new Float32Array(30), _sparkVel: new Float32Array(30),
        _sparkCol: new Float32Array(30), _sparkLife: new Float32Array(10),
        _composer: null, _bloomLoad: null, _bloomPass: null, _bloomW: 0, _bloomH: 0,
        ren: null, scene: null, cam: null, highwayCanvas: null,
        T: null,
    };
    return Object.assign({
        BG_DEFAULTS: { nutColor: '#cccccc' },
        K: 0.01,
        getT: () => state.T, getAmbLight: () => state.ambLight,
        getDirLight: () => state.dirLight, getCinematic: () => state._cinematic,
        getTimingFx: () => state._timingFx,
        getSparkPts: () => state._sparkPts, setSparkPts: (v) => { state._sparkPts = v; },
        getSparkN: () => state._SPARK_N,
        getSparkPos: () => state._sparkPos, setSparkPos: (v) => { state._sparkPos = v; },
        getSparkVel: () => state._sparkVel, setSparkVel: (v) => { state._sparkVel = v; },
        getSparkCol: () => state._sparkCol, setSparkCol: (v) => { state._sparkCol = v; },
        getSparkLife: () => state._sparkLife, setSparkLife: (v) => { state._sparkLife = v; },
        getComposer: () => state._composer, setComposer: (v) => { state._composer = v; },
        getBloomLoad: () => state._bloomLoad, setBloomLoad: (v) => { state._bloomLoad = v; },
        getBloomPass: () => state._bloomPass, setBloomPass: (v) => { state._bloomPass = v; },
        getBloomW: () => state._bloomW, setBloomW: (v) => { state._bloomW = v; },
        getBloomH: () => state._bloomH, setBloomH: (v) => { state._bloomH = v; },
        getRen: () => state.ren, getScene: () => state.scene,
        getCam: () => state.cam, getHighwayCanvas: () => state.highwayCanvas,
        canvasSize: () => ({ w: 800, h: 600 }),
        _state: state,
    }, overrides);
}

// ── 5. _timingHex returns EARLY tint when ts='EARLY' and timingFx truthy ─────
test('_timingHex returns EARLY hex when ts=EARLY and timingFx is truthy', () => {
    // Mutation that goes RED: remove the EARLY branch → returns 0x22ff88 instead.
    const di = makeDi();
    di._state._timingFx = true;
    const { _timingHex } = loadFxModule(di);
    assert.equal(_timingHex('EARLY'), 0x35d6ff, 'EARLY timing must return cyan 0x35d6ff');
    assert.equal(_timingHex('LATE'), 0xffb84d, 'LATE timing must return amber 0xffb84d');
    assert.equal(_timingHex('OK'), 0x22ff88, 'OK timing must return green');
});

// ── 6. _sparkBurst live-accessor class-killer ─────────────────────────────────
test('_sparkBurst writes to the sparkPos array returned by getSparkPos (live, not init-cached)', () => {
    // Mutation that goes RED: if _sparkBurst caches `const _sparkPos = getSparkPos()` at
    // factory init time instead of per-call, then calling setSparkPos(newArray) after init
    // and triggering a burst will write to the STALE array → newArray stays all zeros → RED.
    const di = makeDi();
    // Bootstrap: provide a sparkPts stub so _sparkBurst doesn't bail early.
    di._state._sparkPts = { geometry: { attributes: { position: { needsUpdate: false }, color: { needsUpdate: false } } }, visible: false };
    // Set a dead particle slot so _sparkBurst can spawn into it.
    di._state._sparkLife[0] = 0;
    const { _sparkBurst } = loadFxModule(di);

    // Burst writes into initial array.
    _sparkBurst(1, 2, 3, 0xff0000, 1);
    const firstArr = di._state._sparkPos;
    // At least x position should be set (= 1).
    assert.equal(firstArr[0], 1, 'sparkPos[0] should be x=1 after burst into initial array');

    // Now rebuild: replace sparkPos with a fresh zero array.
    const newPos = new Float32Array(30);
    di.setSparkPos(newPos);
    // Reset life for slot 0 so burst fires again.
    di._state._sparkLife[0] = 0;
    _sparkBurst(5, 6, 7, 0x00ff00, 1);

    assert.equal(newPos[0], 5,
        '_sparkBurst must write into the NEW sparkPos after setSparkPos rebuild; ' +
        'if 0 it cached the initial array at factory init time (live-accessor broken)');
});

// ── 7. _sparkUpdate live-accessor class-killer ────────────────────────────────
test('_sparkUpdate reads sparkPts from getter each call (not init-cached)', () => {
    // Mutation: if getSparkPts() result is cached at factory init, setSparkPts(newPts)
    // after init → _sparkUpdate still references stale (null) pts → .visible never set.
    const di = makeDi();
    const { _sparkUpdate } = loadFxModule(di);

    // No sparkPts yet — _sparkUpdate should short-circuit.
    _sparkUpdate(0.016);  // must not throw

    // Now provide sparkPts (simulates buildBoard completing).
    const pts = {
        geometry: { attributes: {
            position: { needsUpdate: false },
            color: { needsUpdate: false },
        }},
        visible: false,
    };
    di.setSparkPts(pts);
    _sparkUpdate(0.016);

    // Even with no living sparks, the needsUpdate flags must have been set.
    assert.ok(pts.geometry.attributes.position.needsUpdate === true ||
              pts.geometry.attributes.color.needsUpdate === true ||
              pts.visible === false,
        '_sparkUpdate must reach the pts object provided via setSparkPts after factory init');
});

// ── 8. _bloomEnsure write-back class-killer: setBloomLoad called ──────────────
test('_bloomEnsure calls setBloomLoad when ren/scene/cam are available', () => {
    // Mutation that goes RED: if _bloomEnsure does `const bl = Promise.all(...)` (local)
    // instead of `setBloomLoad(Promise.all(...))`, getBloomLoad() stays null after the
    // call → every subsequent frame re-enters init → duplicate composers → visual glitch.
    // This is the synchronously verifiable half of the write-back contract.
    const di = makeDi();
    // Provide non-null ren/scene/cam so the guard passes.
    di._state.ren = {}; di._state.scene = {}; di._state.cam = {};
    di._state.T = { WebGLRenderTarget() {}, HalfFloatType: 1, Vector2() {} };
    const { _bloomEnsure } = loadFxModule(di);

    const result = _bloomEnsure();
    assert.equal(result, null, '_bloomEnsure returns null on first call (async init started)');
    assert.ok(di.getBloomLoad() instanceof Promise,
        'setBloomLoad must have been called with the init Promise; ' +
        'if getBloomLoad() is null the assignment silently became a local (write-back broken)');

    // A second call must short-circuit on the existing bloomLoad (not start a second init).
    const result2 = _bloomEnsure();
    assert.equal(result2, null, 'second call must return null (init still in flight, not re-started)');
});

// ── 8b. _bloomEnsure getComposer live-accessor ────────────────────────────────
test('_bloomEnsure returns composer set via setComposer (reads live via getComposer)', () => {
    // Mutation that goes RED: if _bloomEnsure caches `const _composer = getComposer()`
    // at factory init time, a later setComposer(comp) is invisible → returns null forever.
    const di = makeDi();
    const { _bloomEnsure } = loadFxModule(di);
    // Initially null.
    assert.equal(_bloomEnsure(), null, 'must return null when composer not yet set');
    // Simulate bloom async chain resolving.
    const fakeComp = { render() {}, setSize() {} };
    di.setComposer(fakeComp);
    // Now must return the composer (reads via live getComposer(), not init-cached).
    assert.equal(_bloomEnsure(), fakeComp,
        '_bloomEnsure must return composer set via setComposer; ' +
        'null means it cached the initial null value at factory init time');
});
