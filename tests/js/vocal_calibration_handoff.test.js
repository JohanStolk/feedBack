// Tests: vocals path + input_setup vocal-calibration handoff.
//
// Failure input for INSTRUMENTS absence: instrument id 'vocals' not in the map
//   → wizard queue filters it out and the step is silently skipped.
// Failure input for facade absent: window.feedBack.vocalCalibration undefined
//   → Calibrate click must NOT throw and must call advance (via setTimeout).
// Failure input for facade present: vocalCalibration.launch never called
//   → missed the vocals branch, fell through to noteDetect path.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const SCREEN_JS = path.join(ROOT, 'plugins', 'input_setup', 'screen.js');
const VOCALS_PATH = path.join(ROOT, 'data', 'progression', 'paths', 'vocals.json');

// ── helpers ───────────────────────────────────────────────────────────────────

function makeEl(tag, attrs) {
    const el = {
        tagName: (tag || 'DIV').toUpperCase(),
        id: (attrs && attrs.id) || '',
        className: '',
        innerHTML: '',
        textContent: '',
        disabled: false,
        hidden: false,
        style: {},
        children: [],
        __handlers: {},
        getAttribute(a) { return this[a] != null ? String(this[a]) : null; },
        setAttribute(a, v) { this[a] = v; },
        addEventListener(type, fn) {
            (this.__handlers[type] || (this.__handlers[type] = [])).push(fn);
        },
        click() { (this.__handlers.click || []).forEach((fn) => fn()); },
        _fire(type, arg) { (this.__handlers[type] || []).forEach((fn) => fn(arg)); },
        appendChild(child) { this.children.push(child); return child; },
        remove() {},
        querySelector(sel) { return _qs(this, sel); },
        querySelectorAll(sel) { const h = _qs(this, sel); return h ? [h] : []; },
        get value() { return this._value || ''; },
        set value(v) { this._value = v; },
    };
    // Rebuild querySelector list on innerHTML set via a simple data-attr stub.
    // We patch innerHTML so the wizard's shell() and body replacements work.
    let _html = '';
    Object.defineProperty(el, 'innerHTML', {
        get() { return _html; },
        set(v) {
            _html = v;
            // Harvest known data-attrs the wizard queries after setting innerHTML.
            el._namedChildren = {};
            const RE = /data-([\w-]+)/g;
            let m;
            while ((m = RE.exec(v)) !== null) {
                const key = m[1];
                if (!el._namedChildren[key]) {
                    const child = makeEl('div', {});
                    child._attr = `data-${key}`;
                    child.className = '';
                    el._namedChildren[key] = child;
                }
            }
        },
    });
    return el;
}

function _qs(el, sel) {
    // Support [data-is-*] selectors used by the wizard.
    const m = sel.match(/^\[data-([\w-]+)\]$/);
    if (!m) return null;
    if (el._namedChildren) return el._namedChildren[m[1]] || null;
    return null;
}

function makeDocument(extraById) {
    const byId = Object.assign({}, extraById || {});
    return {
        createElement(tag) { return makeEl(tag, {}); },
        getElementById(id) { return byId[id] || null; },
        body: makeEl('body', {}),
    };
}

function loadScreenJs(windowOverrides) {
    const code = fs.readFileSync(SCREEN_JS, 'utf8');
    // The IIFE runs in the global scope — bare `document`, `setTimeout`, etc.
    // must be top-level context properties, not nested under `window`.
    const doc = (windowOverrides && windowOverrides.document) || makeDocument();
    let _timeoutFn = null;
    const timeoutImpl = (windowOverrides && windowOverrides.setTimeout)
        || function(fn, _ms) { fn(); };

    const ctx = {
        window: Object.assign({
            feedBack: {
                capabilities: null,
                midiInput: null,
                vocalCalibration: undefined,
            },
            feedBackInputSetup: undefined,
            noteDetect: undefined,
        }, windowOverrides),
        document: doc,
        localStorage: (() => {
            const store = {};
            return {
                getItem(k) { return store[k] != null ? store[k] : null; },
                setItem(k, v) { store[k] = String(v); },
                removeItem(k) { delete store[k]; },
            };
        })(),
        fetch() { return Promise.resolve({ ok: true }); },
        setTimeout: timeoutImpl,
        console,
    };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    return ctx.window;
}

// ── 1. vocals.json shape ──────────────────────────────────────────────────────

test('vocals.json exists and has correct id, name, icon, and 5 levels', () => {
    const raw = fs.readFileSync(VOCALS_PATH, 'utf8');
    const json = JSON.parse(raw);
    assert.equal(json.id, 'vocals');
    assert.equal(json.name, 'Vocals');
    assert.ok(json.icon, 'icon field must be present');
    assert.equal(typeof json.order, 'number');
    assert.equal(json.levels.length, 5);
    // Every challenge id must be namespaced under vocals.*
    for (const lvl of json.levels) {
        assert.ok(Number.isInteger(lvl.level), 'level must be integer');
        assert.ok(Array.isArray(lvl.challenges), 'challenges must be array');
        for (const ch of lvl.challenges) {
            assert.ok(ch.id.startsWith('vocals.'), `challenge id must start with vocals.: ${ch.id}`);
        }
    }
});

// ── 2. INSTRUMENTS map contains vocals ───────────────────────────────────────

test('screen.js INSTRUMENTS includes vocals with mode audio', () => {
    const w = loadScreenJs();
    // feedBackInputSetup.status should return a status object including vocals.
    const status = w.feedBackInputSetup.status(['vocals']);
    assert.ok('vocals' in status, 'vocals must appear in status output — meaning INSTRUMENTS has it');
    assert.equal(status.vocals, 'needs-setup', 'fresh window → vocals needs-setup');
});

// ── 3. vocalCalibration facade absent → fallback notice, no throw ─────────────

test('renderAudioPanel for vocals falls back gracefully when vocalCalibration is absent', async () => {
    // Override setTimeout to capture the delay+advance without waiting.
    let timeoutFn = null;
    const w = loadScreenJs({
        feedBack: {
            capabilities: null,
            midiInput: null,
            vocalCalibration: undefined, // absent
        },
        // setTimeout override — loadScreenJs reads it as the top-level ctx.setTimeout.
        setTimeout(fn, _ms) { timeoutFn = fn; },
    });

    // We need a host element. wire a minimal one.
    const hostEl = makeEl('div', {});

    // We'll call mount() directly — it returns a promise that resolves to
    // {completed, skipped}. Because capabilities is null, the domain owner
    // registration is skipped, and the wizard just renders panels.
    const mountPromise = w.feedBackInputSetup.mount(hostEl, { instruments: ['vocals'] });

    // At this point renderAudioPanel has been called, which is async — wait a tick.
    await new Promise((r) => setImmediate(r));

    // The shell sets innerHTML which populates _namedChildren with data-is-cal.
    const calBtn = hostEl._namedChildren && hostEl._namedChildren['is-cal'];
    assert.ok(calBtn, 'Calibrate button must be rendered for vocals audio panel');

    // Click the Calibrate button — should NOT throw.
    assert.doesNotThrow(() => calBtn.click());

    // A setTimeout should have been scheduled (the fallback path), and the
    // data-is-body should now hold the notice text.
    assert.ok(timeoutFn, 'fallback must schedule a setTimeout to auto-advance');

    // Fire the timeout — advances the wizard which resolves the promise.
    timeoutFn();
    const result = await mountPromise;
    // Compare primitives to avoid cross-realm Array.prototype issues (VM context).
    assert.equal(result.completed.length, 1, 'fallback must mark vocals completed');
    assert.equal(result.completed[0], 'vocals', 'completed[0] must be vocals');
});

// ── 4. vocalCalibration facade present → launch() called, not noteDetect ──────

test('renderAudioPanel for vocals calls vocalCalibration.launch when facade present', async () => {
    let launchArgs = null;
    const facade = {
        version: 1,
        launch(args) { launchArgs = args; },
    };

    const w = loadScreenJs({
        feedBack: {
            capabilities: null,
            midiInput: null,
            vocalCalibration: facade,
        },
    });

    let noteDetectCalled = false;
    w.noteDetect = {
        launchCalibration() { noteDetectCalled = true; },
    };

    const hostEl = makeEl('div', {});
    const mountPromise = w.feedBackInputSetup.mount(hostEl, { instruments: ['vocals'] });
    await new Promise((r) => setImmediate(r));

    const calBtn = hostEl._namedChildren && hostEl._namedChildren['is-cal'];
    assert.ok(calBtn, 'Calibrate button must be rendered');
    calBtn.click();

    assert.ok(launchArgs, 'vocalCalibration.launch must have been called');
    assert.equal(launchArgs.requester, 'input_setup');
    assert.equal(typeof launchArgs.onDone, 'function');
    assert.equal(typeof launchArgs.onCancel, 'function');
    assert.equal(noteDetectCalled, false, 'noteDetect.launchCalibration must NOT be called for vocals');

    // Simulate the facade calling onDone to settle the promise.
    launchArgs.onDone({ latencyMs: 12, range: null, noiseFloorDb: null, micStatus: 'ok' });
    const result = await mountPromise;
    assert.equal(result.completed.length, 1);
    assert.equal(result.completed[0], 'vocals');
});
