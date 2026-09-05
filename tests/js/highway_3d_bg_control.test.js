// Class-killer tests for src/bg-control.js — h3d-carve-5.
//
// bg-control.js uses a factory export (createBgControl({DI})) because its
// dependencies are IIFE-scope values that cannot be ES-module imports.
// screen.js destructures { _pcAcquire, _pcRelease } from the factory result.
//
// Test strategy:
//   - Source-scan tests check structural invariants (critical paths, DI wiring,
//     accessor call site, tombstone).
//   - Screen.js wiring tests check the import clause and destructure form.
//   - Generic stranded-caller test (adapted from bc-panel.js test 12) checks
//     that every _pc* symbol in the bg-control.js factory return is also in
//     screen.js's createBgControl destructure — a bare _pcFoo reference in the
//     IIFE that isn't in the destructure is the same stranded-caller bug class.
//   - Construction-order test: createBgControl call must appear AFTER all DI
//     definitions in screen.js and BEFORE createFactory.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const BG_CONTROL_JS = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'src', 'bg-control.js');
const SCREEN_JS     = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'screen.js');

let _src;
function src() { if (!_src) _src = fs.readFileSync(BG_CONTROL_JS, 'utf8'); return _src; }

let _screenSrc;
function screenSrc() { if (!_screenSrc) _screenSrc = fs.readFileSync(SCREEN_JS, 'utf8'); return _screenSrc; }

// ── 1. createBgControl is exported (not private) ──────────────────────────────

test('createBgControl is exported from bg-control.js', () => {
    // Mutation: remove `export` → screen.js import throws SyntaxError /
    // "does not provide an export" at module-graph load time → highway never
    // initialises; all 3D-Hwy users see a blank canvas.
    assert.match(src(), /^export\s+function\s+createBgControl\s*\(/m,
        'createBgControl must be a line-start export function declaration');
});

// ── 2. DI params declared (all five) ─────────────────────────────────────────

test('createBgControl destructures all five DI params', () => {
    // Mutation: remove one DI param → that function is `undefined` inside the
    // factory → every call to e.g. _bgReadGlobal throws TypeError: not a function.
    const s = src();
    const sig = s.match(/export\s+function\s+createBgControl\s*\(\s*\{([^}]+)\}/);
    assert.ok(sig, 'createBgControl signature must use destructuring params');
    const params = sig[1];
    assert.match(params, /BG_STYLE_IDS/, 'DI must include BG_STYLE_IDS');
    assert.match(params, /_bgReadGlobal/, 'DI must include _bgReadGlobal');
    assert.match(params, /_bgSubscribe/, 'DI must include _bgSubscribe');
    assert.match(params, /_bgUnsubscribe/, 'DI must include _bgUnsubscribe');
    assert.match(params, /getVenueSceneOverride/, 'DI must include getVenueSceneOverride');
});

// ── 3. getVenueSceneOverride() called as function (not captured at construction) ──

test('_pcSync calls getVenueSceneOverride() not _venueSceneOverride directly', () => {
    // Mutation: revert beyond-subst 2 to `!!_venueSceneOverride` → factory
    // captures the initial `false` at construction time; the accessor is never
    // called; Venue-active state is always `false` → UI never goes inert under
    // Venue; user can "pick" a background while Venue scene is active but the
    // pick goes nowhere because Venue owns the mount.
    const s = src();
    // Must call the accessor (with parens).
    assert.match(s, /getVenueSceneOverride\(\)/,
        '_pcSync must call getVenueSceneOverride() rather than capturing the var at construction');
    // Must NOT contain the raw closure variable name in executable code (bare, without call
    // parens). Strip line comments first so the comment-doc in the file header doesn't fire.
    const noLineComments = s.replace(/\/\/[^\n]*/g, '');
    assert.doesNotMatch(noLineComments, /\b_venueSceneOverride\b/,
        'bg-control.js must not reference bare _venueSceneOverride in code — use getVenueSceneOverride()');
});

// ── 4. _bgSubscribe called inside _pcMount ────────────────────────────────────

test('_bgSubscribe is called inside _pcMount to register the settings listener', () => {
    // Mutation: remove _bgSubscribe call → control mounts but never receives
    // settings-bus events; a style change from Settings page never syncs back
    // to the in-player picker; the two UIs drift permanently.
    const s = src();
    const mountIdx = s.indexOf('function _pcMount()');
    assert.ok(mountIdx >= 0, '_pcMount must be defined in bg-control.js');
    const mountBlock = s.slice(mountIdx, mountIdx + 6000); // _bgSubscribe ~5200 chars in
    assert.match(mountBlock, /_bgSubscribe\s*\(/,
        '_bgSubscribe must be called inside _pcMount to register the listener');
});

// ── 5. _bgUnsubscribe called inside _pcTeardownDom ───────────────────────────

test('_bgUnsubscribe is called inside _pcTeardownDom to deregister the listener', () => {
    // Mutation: remove _bgUnsubscribe call → listener closure outlives the control;
    // after release the stale closure still calls _pcSync on every settings change;
    // null refs (_pcSel etc.) throw on first setting write post-teardown.
    const s = src();
    const teardownIdx = s.indexOf('function _pcTeardownDom()');
    assert.ok(teardownIdx >= 0, '_pcTeardownDom must be defined in bg-control.js');
    const teardownBlock = s.slice(teardownIdx, teardownIdx + 500);
    assert.match(teardownBlock, /_bgUnsubscribe\s*\(/,
        '_bgUnsubscribe must be called inside _pcTeardownDom to remove the listener');
});

// ── 6. _pcRelease calls _pcTeardownDom ───────────────────────────────────────

test('_pcRelease calls _pcTeardownDom when refcount reaches zero', () => {
    // Mutation: remove _pcTeardownDom() call from _pcRelease → DOM node is
    // never removed; the settings listener stays alive; under splitscreen each
    // renderer destroys independently but the control never disappears → orphaned
    // picker remains visible and partially interactive after 3D-Hwy is deselected.
    const s = src();
    const releaseIdx = s.indexOf('function _pcRelease()');
    assert.ok(releaseIdx >= 0, '_pcRelease must be defined in bg-control.js');
    const releaseBlock = s.slice(releaseIdx, releaseIdx + 1200); // _pcTeardownDom ~1040 chars in
    assert.match(releaseBlock, /_pcTeardownDom\s*\(\s*\)/,
        '_pcRelease must call _pcTeardownDom() when refcount reaches zero');
});

// ── 7. _pcAcquire and _pcRelease returned from factory ───────────────────────

test('createBgControl returns { _pcAcquire, _pcRelease }', () => {
    // Mutation: remove either from return → screen.js destructure gets undefined;
    // first call to _pcAcquire / _pcRelease from init()/destroy() throws
    // TypeError: not a function → highway init crashes on every song load.
    const s = src();
    const returnMatch = s.match(/return\s*\{([^}]+)\}/);
    assert.ok(returnMatch, 'createBgControl must have a return { ... } statement');
    const returned = returnMatch[1];
    assert.match(returned, /_pcAcquire/, 'createBgControl must return _pcAcquire');
    assert.match(returned, /_pcRelease/, 'createBgControl must return _pcRelease');
});

// ── 8. screen.js imports createBgControl from src/bg-control.js ──────────────

test('screen.js imports createBgControl from src/bg-control.js', () => {
    // Mutation: remove import → createBgControl is undefined in the IIFE;
    // the destructure const { _pcAcquire, _pcRelease } = createBgControl({...})
    // throws TypeError at module eval time → plugin never loads.
    assert.match(screenSrc(),
        /import\s+\{[^}]*createBgControl[^}]*\}\s+from\s+['"]\.\/src\/bg-control\.js['"]/,
        'screen.js must import createBgControl from ./src/bg-control.js');
});

// ── 9. screen.js calls createBgControl with all five DI args ─────────────────

test('screen.js passes all five DI arguments to createBgControl', () => {
    // Mutation: omit one DI arg → the corresponding param is `undefined` inside
    // the factory closure; first call to it (on mount, on settings change) throws.
    const s = screenSrc();
    const callMatch = s.match(/createBgControl\s*\(\s*\{([^}]+)\}/);
    assert.ok(callMatch, 'screen.js must call createBgControl({...})');
    const args = callMatch[1];
    assert.match(args, /BG_STYLE_IDS/, 'createBgControl call must pass BG_STYLE_IDS');
    assert.match(args, /_bgReadGlobal/, 'createBgControl call must pass _bgReadGlobal');
    assert.match(args, /_bgSubscribe/, 'createBgControl call must pass _bgSubscribe');
    assert.match(args, /_bgUnsubscribe/, 'createBgControl call must pass _bgUnsubscribe');
    assert.match(args, /getVenueSceneOverride/, 'createBgControl call must pass getVenueSceneOverride');
});

// ── 10. screen.js IIFE does not redefine _pcAcquire or _pcRelease ────────────

test('screen.js IIFE does not redeclare _pcAcquire or _pcRelease', () => {
    // Mutation: re-add `function _pcAcquire()` to the IIFE → IIFE-scope function
    // shadows the destructured import; the factory's _pcRelease holds a stale
    // closure over the old _pcRefs; refcount goes out of sync; the control
    // never unmounts.
    const s = screenSrc();
    const iife = s.replace(/^import\s+.*\n/gm, '');
    assert.doesNotMatch(iife, /function\s+_pcAcquire\s*\(/,
        'IIFE must not redeclare _pcAcquire');
    assert.doesNotMatch(iife, /function\s+_pcRelease\s*\(/,
        'IIFE must not redeclare _pcRelease');
});

// ── 11. Construction order: createBgControl called before createFactory ───────

test('createBgControl call appears before createFactory in screen.js', () => {
    // Mutation: move createBgControl call inside createFactory → each renderer
    // instance gets its own independent control (refcount broken across instances);
    // or if moved after createFactory but before register, correct for
    // single-instance but still wrong order risk. This test ensures the call
    // stays at module scope BEFORE the factory.
    const s = screenSrc();
    const bgCallIdx  = s.indexOf('createBgControl(');
    const factoryIdx = s.indexOf('function createFactory()');
    assert.ok(bgCallIdx >= 0, 'createBgControl call must exist in screen.js');
    assert.ok(factoryIdx >= 0, 'createFactory must exist in screen.js');
    assert.ok(bgCallIdx < factoryIdx,
        'createBgControl must be called before createFactory in screen.js');
});

// ── 12. Construction order: DI values defined before createBgControl call ─────

test('all DI values are defined before the createBgControl call in screen.js', () => {
    // Mutation: move createBgControl call before BG_STYLE_IDS / _bgReadGlobal /
    // _bgSubscribe / _bgUnsubscribe / getVenueSceneOverride binding →
    // undefined passed as DI params; factory closure captures undefined → TypeError.
    const s = screenSrc();
    const bgCallIdx = s.indexOf('createBgControl(');
    assert.ok(bgCallIdx >= 0, 'createBgControl call must exist in screen.js');
    const bgStyleIdsIdx = s.indexOf('BG_STYLE_IDS =');
    const bgReadIdx     = s.indexOf('function _bgReadGlobal(');
    const bgSubIdx      = s.indexOf('function _bgSubscribe(');
    const venueIdx      = s.indexOf('let _venueSceneOverride');
    assert.ok(bgStyleIdsIdx < bgCallIdx, 'BG_STYLE_IDS must be defined before createBgControl call');
    assert.ok(bgReadIdx     < bgCallIdx, '_bgReadGlobal must be defined before createBgControl call');
    assert.ok(bgSubIdx      < bgCallIdx, '_bgSubscribe must be defined before createBgControl call');
    assert.ok(venueIdx      < bgCallIdx, '_venueSceneOverride must be defined before createBgControl call');
});

// ── 13. Stranded-caller: every returned symbol must be in screen.js destructure ─

test('every _pc* symbol returned by createBgControl is in the screen.js destructure', () => {
    // For a factory module the stranded-caller class is: a symbol in the factory's
    // `return { ... }` that is NOT in the screen.js `const { ... } = createBgControl(...)`
    // destructure — the factory vends it but screen.js never binds it, so any IIFE
    // code that tries to call it hits ReferenceError.
    //
    // Mutation: add `_pcNewFn` to bg-control.js return {...} but not to screen.js
    // destructure → leaked = ['_pcNewFn'] → RED.
    const bgSrc  = src();
    const scrSrc = screenSrc();

    // Symbols in the return { ... } of createBgControl.
    const returnMatch = bgSrc.match(/return\s*\{([^}]+)\}/);
    assert.ok(returnMatch, 'bg-control.js must have a return { ... } statement');
    const returned = new Set(
        returnMatch[1].split(',').map(s => s.trim().replace(/^(\w+)\s*:.*$/, '$1')).filter(Boolean)
    );

    // Symbols in the screen.js destructure.
    const destructureMatch = scrSrc.match(/const\s*\{\s*([^}]+)\}\s*=\s*createBgControl\s*\(/);
    assert.ok(destructureMatch, 'screen.js must destructure the createBgControl result');
    const destructured = new Set(
        destructureMatch[1].split(',').map(s => s.trim().replace(/^(\w+)\s*:.*$/, '$1')).filter(Boolean)
    );

    // Every returned symbol must be bound by the destructure (return ⊆ destructure).
    const leaked = [...returned].filter(sym => !destructured.has(sym));
    assert.deepStrictEqual(leaked, [],
        'createBgControl returns symbols not bound by screen.js destructure: ' +
        leaked.join(', '));
});

// ── 14. Stale-private guard: no private bg-control.js symbol bare in screen.js ─

test('no private bg-control.js symbol appears bare in screen.js IIFE body', () => {
    // The cut-4 stale-private-reference class: a function or variable from a moved
    // module that still appears as a bare name in screen.js (not via the destructure,
    // not inside an import line, not inside a comment). If bg-control.js is re-merged
    // or a caller copy-pastes `_pcSync(...)` into screen.js, this test goes RED.
    //
    // Mutation: add `_pcSync()` somewhere in screen.js IIFE body (outside the
    // createBgControl destructure line) → stale = ['_pcSync'] → RED.
    const bgSrc  = src();
    const scrSrc = screenSrc();

    // All _pc* identifiers in bg-control.js. Full scan (not just declaration
    // syntax) so multi-var lets like `let _pcEl, _pcSel, _pcReactive, ...`
    // on a single line are all captured — the previous declaration-only regex
    // only matched the first id per statement.
    const defined = new Set(
        [...bgSrc.matchAll(/\b(_pc\w+)\b/g)].map(m => m[1])
    );

    // Public symbols (in the destructure) are legitimately referenced in screen.js.
    const destructureMatch = scrSrc.match(/const\s*\{\s*([^}]+)\}\s*=\s*createBgControl\s*\(/);
    assert.ok(destructureMatch, 'screen.js must destructure the createBgControl result');
    const destructured = new Set(
        destructureMatch[1].split(',').map(s => s.trim().replace(/^(\w+)\s*:.*$/, '$1')).filter(Boolean)
    );
    const privateSymbols = [...defined].filter(sym => !destructured.has(sym));

    // Strip imports, block comments (tombstone), line comments, and the destructure
    // statement itself so the bound symbols don't fire false positives.
    const noImports       = scrSrc.replace(/^import\s+.*\n/gm, '');
    const noBlockComments = noImports.replace(/\/\*[\s\S]*?\*\//g, '');
    const noLineComments  = noBlockComments.replace(/\/\/[^\n]*/g, '');
    const noDestructure   = noLineComments.replace(
        /const\s*\{[^}]+\}\s*=\s*createBgControl\s*\([^)]*\)\s*;/, '',
    );

    const stale = privateSymbols.filter(
        sym => new RegExp('\\b' + sym + '\\b').test(noDestructure),
    );
    assert.deepStrictEqual(stale, [],
        'screen.js contains bare references to private bg-control.js symbols: ' +
        stale.join(', '));
});
