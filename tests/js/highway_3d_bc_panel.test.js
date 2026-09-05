// Class-killer tests for src/bc-panel.js — h3d-carve-4.
//
// Most tests are source-scan (grep for structural invariants that protect
// against specific mutations).  Two tests eval _bcIsDesktop in isolation
// (a pure function that only reads window.*) using new Function so Node
// can run it without a browser.  Screen.js wiring is verified by scanning
// the import declaration and checking that moved symbols are gone from the
// IIFE.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const BC_PANEL_JS = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'src', 'bc-panel.js');
const SCREEN_JS   = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'screen.js');

let _src;
function src() { if (!_src) _src = fs.readFileSync(BC_PANEL_JS, 'utf8'); return _src; }

let _screenSrc;
function screenSrc() { if (!_screenSrc) _screenSrc = fs.readFileSync(SCREEN_JS, 'utf8'); return _screenSrc; }

// ── Eval helper for _bcIsDesktop (pure; only reads window.*) ──────────────────

let _isDesktopFn;
function isDesktopFn() {
    if (_isDesktopFn) return _isDesktopFn;
    // Strip 'export' keywords; extract just _bcIsDesktop body for eval.
    const stripped = src().replace(/^export\s+/gm, '');
    // Wrap in a factory that returns _bcIsDesktop after evaluating the whole
    // module (so inner references resolve).  window is the only global needed.
    const factory = new Function('window', stripped + '\nreturn _bcIsDesktop;');
    _isDesktopFn = factory;
    return _isDesktopFn;
}

// ── 1. _bcLoading reset on rejection ─────────────────────────────────────────

test('_bcLoading reset to null when lib-load promise rejects', () => {
    // Mutation: remove `.catch(() => { _bcLoading = null; })` from _bcLoadLib.
    // Without it, a rejected load-promise is cached forever; every subsequent
    // mount returns the rejected promise immediately → Butterchurn permanently
    // disabled for the session with no retry.
    assert.match(src(), /_bcLoading\s*=\s*null/,
        '_bcLoadLib must reset _bcLoading to null in a .catch handler so failed loads retry');
    // Verify the reset appears in a .catch context (not just an early-return path).
    assert.match(src(), /\.catch\s*\([\s\S]{1,60}_bcLoading\s*=\s*null/,
        '_bcLoading = null must appear inside a .catch callback');
});

// ── 2. window.h3dBcApplySettings at module scope ──────────────────────────────

test('window.h3dBcApplySettings is assigned at module scope (not inside a function)', () => {
    // Mutation: move assignment inside _bcCreateController → it isn't available
    // until first mount; settings.html's `?.` call silently no-ops → settings
    // changes (opacity, enabled, cycle mode) never apply until the user visits
    // the player for the first time.
    //
    // Structural check: the assignment must appear BEFORE the first `function`
    // or `export function` declaration in bc-panel.js (i.e. at module scope).
    const s = src();
    const assignIdx   = s.indexOf('window.h3dBcApplySettings');
    const firstFnIdx  = s.search(/^(?:export\s+)?function\s+_bc/m);
    assert.ok(assignIdx >= 0, 'window.h3dBcApplySettings must be assigned in bc-panel.js');
    assert.ok(firstFnIdx < 0 || assignIdx < firstFnIdx,
        'window.h3dBcApplySettings must appear before the first _bc* function declaration (module scope)');
});

// ── 3. _bcIsDesktop guards all three required conditions ──────────────────────

test('_bcIsDesktop checks isDesktop, .audio, and typeof getRawAudioFrame', () => {
    // Mutation: remove any one guard → non-desktop host (Docker/web app) enters
    // the desktop guitar-feed path → audioProvider is wrong; pcmLoop errors
    // every 16 ms trying to call an undefined getRawAudioFrame.
    const s = src();
    assert.match(s, /d\.isDesktop/,
        '_bcIsDesktop must guard on d.isDesktop');
    assert.match(s, /d\.audio/,
        '_bcIsDesktop must guard on d.audio');
    assert.match(s, /typeof\s+d\.audio\.getRawAudioFrame\s*===\s*'function'/,
        "_bcIsDesktop must guard typeof d.audio.getRawAudioFrame === 'function'");
});

// ── 4. _bcIsDesktop eval: returns false when window has no desktop bridge ─────

test('_bcIsDesktop returns false when window.feedBackDesktop is absent', () => {
    // Mutation: remove the `d && ...` guard → accessing .isDesktop on undefined
    // throws in the browser; the whole highway init crashes.
    const fn = isDesktopFn()({ feedBackDesktop: undefined, slopsmithDesktop: undefined });
    assert.strictEqual(fn(), false,
        '_bcIsDesktop must return false when neither feedBackDesktop nor slopsmithDesktop is set');
});

// ── 5. _bcIsDesktop eval: returns false when isDesktop is missing from bridge ─

test('_bcIsDesktop returns false when bridge has audio but no isDesktop flag', () => {
    // Mutation: rely on truthy bridge presence alone (drop isDesktop check) → any host
    // that exposes feedBackDesktop for non-guitar purposes (e.g. file manager) would
    // be misidentified as the guitar-input desktop host.
    const fn = isDesktopFn()({
        feedBackDesktop: { audio: { getRawAudioFrame: () => new Float32Array(512) } },
        slopsmithDesktop: undefined,
    });
    assert.strictEqual(fn(), false,
        '_bcIsDesktop must return false when feedBackDesktop lacks the isDesktop flag');
});

// ── 6. destroy() removes controller from _bcControllers ──────────────────────

test('destroy() calls _bcControllers.delete(ctrl)', () => {
    // Mutation: remove delete call → dead controller stays in _bcControllers;
    // _bcApplyAll iterates the Set and calls applySettings() on the dead controller;
    // null canvas/scrim refs throw; multiple repeated mounts eventually saturate Set.
    assert.match(src(), /_bcControllers\.delete\s*\(\s*ctrl\s*\)/,
        'destroy() must call _bcControllers.delete(ctrl) to remove the dead controller');
});

// ── 7. _bcReleaseCanvasGL called in destroy() ─────────────────────────────────

test('_bcReleaseCanvasGL is called inside destroy()', () => {
    // Mutation: remove the release call from destroy() → WebGL context not freed on
    // dismount; browsers allow ~16 concurrent contexts; repeated mount/toggles
    // exhaust the cap; subsequent mounts get null from getContext('webgl') →
    // Butterchurn init silently fails.
    //
    // The call appears in two places: destroy() method and the .catch error handler.
    // Both are required.  This test checks that destroy() includes it.
    const s = src();
    // `destroy() {` (with space+brace) anchors the actual method definition,
    // not comment references like "so destroy() closes only ...".
    const destroyIdx = s.indexOf('destroy() {');
    assert.ok(destroyIdx >= 0, 'destroy() method must exist in the returned controller object');
    // Find the release call after the destroy label (within 1000 chars).
    const destroyBlock = s.slice(destroyIdx, destroyIdx + 1000);
    assert.match(destroyBlock, /_bcReleaseCanvasGL/,
        '_bcReleaseCanvasGL must be called inside destroy() to free the WebGL context');
});

// ── 8. _bcReleaseCanvasGL called in async-init failure handler ────────────────

test('_bcReleaseCanvasGL is called in the _bcLoadLib().catch handler', () => {
    // Mutation: remove from .catch → half-initialised failure (lib load, WebGL
    // context creation) leaves a bound WebGL context on the abandoned canvas;
    // the context is never freed; same cap exhaustion as above.
    const s = src();
    // The error handler's .catch takes a named error param (e) and logs via
    // console.error — that's how we distinguish it from the narrow no-op catches.
    // Look for `_bcReleaseCanvasGL` inside a `.catch((e) => {` block.
    assert.match(s, /\.catch\s*\(\s*\(e\)[\s\S]{1,600}_bcReleaseCanvasGL/,
        '_bcReleaseCanvasGL must appear in the error-handler .catch((e) => {}) block');
});

// ── 9. _bcLoadSettings merges saved state with BC_DEFAULTS ───────────────────

test('_bcLoadSettings uses Object.assign with BC_DEFAULTS as base', () => {
    // Mutation: return raw parsed JSON without merging → missing keys from
    // localStorage (fresh install, partial save) become undefined;
    // s.enabled → undefined → bg disabled on first launch.
    assert.match(src(), /Object\.assign\s*\(\s*\{\s*\}\s*,\s*BC_DEFAULTS/,
        '_bcLoadSettings must merge with BC_DEFAULTS so missing keys get defaults');
});

// ── 10. screen.js imports both exports from src/bc-panel.js ──────────────────

test('screen.js imports _bcCreateController and _bcIsDesktop from src/bc-panel.js', () => {
    // Mutation: remove import → H-section call to _bcCreateController throws
    // ReferenceError at the first butterchurn mount; the 3D highway becomes
    // permanently broken when butterchurn bg is selected.
    const s = screenSrc();
    assert.match(s,
        /import\s+\{[^}]*_bcCreateController[^}]*\}\s+from\s+['"]\.\/src\/bc-panel\.js['"]/,
        'screen.js must import _bcCreateController from ./src/bc-panel.js');
    assert.match(s,
        /import\s+\{[^}]*_bcIsDesktop[^}]*\}\s+from\s+['"]\.\/src\/bc-panel\.js['"]/,
        'screen.js must import _bcIsDesktop from ./src/bc-panel.js');
});

// ── 11. screen.js IIFE no longer defines moved B-section symbols ──────────────

test('screen.js IIFE does not redeclare _bcCreateController or _bcLoadLib', () => {
    // Mutation: re-add function _bcCreateController() to the IIFE → double definition;
    // the IIFE-scope function shadows the imported one inside the factory; bc-panel.js
    // private state is split: the IIFE copy has its own _bcControllers, _bcSettings, etc.
    // The panel never shows, controller objects leak, applySettings no-ops.
    const s = screenSrc();
    // Strip import lines so we only scan the IIFE body.
    const iife = s.replace(/^import\s+.*\n/gm, '');
    assert.doesNotMatch(iife, /function\s+_bcCreateController\s*\(/,
        'IIFE must not redeclare _bcCreateController');
    assert.doesNotMatch(iife, /function\s+_bcLoadLib\s*\(/,
        'IIFE must not redeclare _bcLoadLib');
});
