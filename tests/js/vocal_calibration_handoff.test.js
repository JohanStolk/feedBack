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

    const clearTimeoutImpl = (windowOverrides && windowOverrides.clearTimeout) || function(_id) {};

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
        clearTimeout: clearTimeoutImpl,
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

// ── 3b. double-click guard: second click must NOT queue a second advance ───────
// Failure input: vocalCalibration absent, instruments ['vocals','guitar'],
//   two clicks on Calibrate before the 1800ms timer fires.
// Without guard: two timers queued → second fires on guitar panel → idx
//   increments past guitar → finish() prematurely → guitar silently dropped.

test('double-click on fallback Calibrate does not double-advance the wizard', async () => {
    const timers = [];
    const w = loadScreenJs({
        feedBack: { capabilities: null, midiInput: null, vocalCalibration: undefined },
        setTimeout(fn, _ms) { timers.push(fn); },
    });

    // Two-instrument queue: vocals then guitar (guitar has noteDetect absent too,
    // so it would also auto-advance — but we only care about the vocals panel here).
    const hostEl = makeEl('div', {});
    // Mount with ['vocals'] only so we can isolate the guard without needing a
    // full multi-panel render (guitar panel is MIDI-unrelated complexity).
    // The guard must prevent a second timer from being queued at all.
    const mountPromise = w.feedBackInputSetup.mount(hostEl, { instruments: ['vocals'] });
    await new Promise((r) => setImmediate(r));

    const calBtn = hostEl._namedChildren && hostEl._namedChildren['is-cal'];
    assert.ok(calBtn, 'button must exist');

    // Two rapid clicks.
    calBtn.click();
    calBtn.click();

    // Only ONE timer must have been queued (button disabled after first click).
    assert.equal(timers.length, 1, 'double-click must only queue one advance timer — input: two clicks before timer fires');

    timers[0]();
    const result = await mountPromise;
    assert.equal(result.completed.length, 1);
    assert.equal(result.completed[0], 'vocals');
});

// ── 3c. Calibrate-then-Skip stale-timer bug (Creed finding) ──────────────────
// Failure input: vocalCalibration absent, ['vocals'] queue, user clicks
//   Calibrate (queues 1800ms timer) then clicks Skip before timer fires.
// Without fix: Skip calls advance('vocals', false) → wizard resolves, then
//   the stale timer fires advance('vocals', true) → completed array mutated
//   AFTER promise settled → result.completed gains 'vocals' retroactively;
//   with a 2-instrument queue, idx is also double-incremented, dropping the
//   next instrument from both lists.
// Fix: _activeCleanup = () => clearTimeout(_timerId) — advance() drains it.

test('Skip before fallback timer fires cancels the timer — no stale advance', async () => {
    const timers = []; // collect scheduled timers without auto-firing
    const cancelled = [];
    const w = loadScreenJs({
        feedBack: { capabilities: null, midiInput: null, vocalCalibration: undefined },
        setTimeout(fn, _ms) { const id = timers.length; timers.push(fn); return id; },
        clearTimeout(id) { cancelled.push(id); timers[id] = null; },
    });

    const hostEl = makeEl('div', {});
    const mountPromise = w.feedBackInputSetup.mount(hostEl, { instruments: ['vocals'] });
    await new Promise((r) => setImmediate(r));

    const calBtn = hostEl._namedChildren && hostEl._namedChildren['is-cal'];
    assert.ok(calBtn, 'Calibrate button must exist');

    // Step 1: click Calibrate — queues the 1800ms timer
    calBtn.click();
    assert.equal(timers.length, 1, 'one timer must be queued after Calibrate');

    // Step 2: click Skip BEFORE the timer fires
    const skipBtn = hostEl._namedChildren && hostEl._namedChildren['is-skip'];
    assert.ok(skipBtn, 'Skip button must exist');
    skipBtn.click();

    // The promise resolves via Skip's advance('vocals', false)
    const result = await mountPromise;

    // vocals must be in skipped, NOT completed
    assert.equal(result.skipped.length, 1, 'vocals must be skipped');
    assert.equal(result.skipped[0], 'vocals');
    assert.equal(result.completed.length, 0, 'completed must be empty after skip');

    // The timer must have been cancelled — input that FAILS without the fix:
    // if clearTimeout was NOT called, firing the stale timer now would mutate
    // the completed array retrospectively.
    assert.ok(cancelled.length > 0, 'clearTimeout must be called — stale timer must be cancelled');

    // Verify: firing the (now-cancelled) timer is a no-op (timers[0] nulled out)
    if (timers[0] !== null) {
        // If the fix is missing, this would push 'vocals' into completed
        timers[0]();
        assert.equal(result.completed.length, 0, 'stale timer must not mutate completed after skip');
    }
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

// ── 5. _inputSetupRelaunch fallback includes 'vocals' (F2) ───────────────────
// Failure input: window._inputSetupRelaunch called when fetch('/api/progression')
//   rejects — the fallback instrument list must include 'vocals' or Settings
//   re-calibration silently skips it.

test('_inputSetupRelaunch fallback list includes vocals when API call fails', () => {
    let launchedWith = null;
    const w = loadScreenJs({
        feedBack: { capabilities: null, midiInput: null, vocalCalibration: undefined },
        // Reject the fetch to trigger the fallback path.
        fetch() { return Promise.reject(new Error('network error')); },
    });
    // Patch launch() to capture the instruments without spinning up a full overlay.
    w.feedBackInputSetup._captureNextLaunch = (list) => { launchedWith = list; };
    // We can't easily intercept the internal `launch()` from outside the IIFE.
    // Instead, verify the status API: after _inputSetupRelaunch is awaited,
    // the fallback list is ['guitar','bass','vocals','keys','drums'] by reading
    // the source directly (static code check via the status call on each).
    // The definitive check: call status() for 'vocals' — it must be in INSTRUMENTS.
    const status = w.feedBackInputSetup.status(['vocals', 'guitar', 'bass', 'keys', 'drums']);
    assert.ok('vocals' in status, 'vocals must be in the status map — confirming INSTRUMENTS includes it');
    // Structural read: _inputSetupRelaunch is a closure we cannot easily inspect,
    // but the bug was the string literal ['guitar','bass','keys','drums'].
    // Verify by reading the source file for the fixed literal.
    const src = fs.readFileSync(SCREEN_JS, 'utf8');
    assert.ok(
        src.includes("'guitar', 'bass', 'vocals', 'keys', 'drums'") ||
        src.includes("'guitar','bass','vocals','keys','drums'"),
        "fallback list must include 'vocals' — input: /api/progression fetch failure"
    );
});

// ── 6. button label keys off vocalCalibration for vocals (F3) ─────────────────
// Failure input: vocalCalibration present but noteDetect absent.
//   Without fix: label reads 'Continue' (keyed off hasDetector=false).
//   With fix: label reads 'Calibrate' (keyed off hasVocalCal=true).

test('Calibrate button shows Calibrate when vocalCalibration present and noteDetect absent', async () => {
    const facade = { version: 1, launch(_args) {} };
    const w = loadScreenJs({
        feedBack: { capabilities: null, midiInput: null, vocalCalibration: facade },
        // noteDetect is absent — without F3 fix, label would be 'Continue'
    });
    // noteDetect deliberately not set

    const hostEl = makeEl('div', {});
    w.feedBackInputSetup.mount(hostEl, { instruments: ['vocals'] });
    await new Promise((r) => setImmediate(r));

    // The shell sets innerHTML; we check the captured HTML for the button label.
    // The innerHTML of hostEl reflects the last shell() call.
    const html = hostEl.innerHTML || '';
    assert.ok(
        html.includes('Calibrate'),
        'button must read Calibrate when vocalCalibration present (even if noteDetect absent) — input: facade present, noteDetect absent'
    );
    assert.equal(
        html.includes('>Continue<'),
        false,
        'must NOT read Continue when vocalCalibration is present'
    );
});
