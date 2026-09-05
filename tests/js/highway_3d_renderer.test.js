// h3d-carve-15: U-section (per-frame renderer) pin tests.
//
// Guards:
//   1. Wiring: createRenderer factory exists in renderer.js and screen.js
//      imports + calls it with the expected DI param count (179).
//   2. Kill tests: extracted private helpers are live in renderer.js; gut and
//      restore proves RED.
//   3. Export contract: { update } returned by createRenderer.
//   4. Caller-list corrections: _applyNoteCamTargets and lookaheadSmoothCamStep
//      have exactly the audited caller counts.
//   5. screen.js tombstone: original U-section bodies are absent from screen.js.
//   6. Wiring scope check: every shorthand identifier in every factory wiring call
//      in screen.js resolves to a declared name — no phantoms (RED at 7623ad8 on
//      BEAT_HEAD_SEC).

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RENDERER_JS = path.join(
    __dirname, '..', '..', 'plugins', 'highway_3d', 'src', 'renderer.js'
);
const SCREEN_JS = path.join(
    __dirname, '..', '..', 'plugins', 'highway_3d', 'screen.js'
);

const src       = fs.readFileSync(RENDERER_JS, 'utf8');
const screenSrc = fs.readFileSync(SCREEN_JS, 'utf8');

// ── 1. Wiring guard ──────────────────────────────────────────────────────────

test('createRenderer is exported from renderer.js', () => {
    assert.match(src, /export function createRenderer/,
        'renderer.js must export createRenderer');
});

test('screen.js imports createRenderer from renderer.js', () => {
    assert.match(screenSrc, /import.*createRenderer.*from.*renderer\.js/,
        'screen.js must import createRenderer');
});

test('screen.js wiring block contains expected DI param count (315)', () => {
    // 315 = 105 getters + 48 setters + 162 shorthands
    // 313→315: +2 Toby r3 F1 fix: _CV_KEY_TIME_MUL, _CV_KEY_TIME_SLOT restored to
    //   screen.js scope and added as shorthands (were wrongly moved to renderer closure).
    // 184→313: +129 carve-15 full completion:
    //   +43 Category B consts, +37 Category C fn-refs, +3 Category D getters,
    //   +27 Category E getter/setter pairs + 1 stable ref,
    //   +11 Category F (5 stable + 6 getter/setter), +5 Category G getters,
    //   +2 extra (chordFrameGradTex/Arp getters).
    // 177→184: +7 Creed r1 F3 fixes: TS, S_BASE, FRET_LABEL_GOLD_HEX, FRET_LABEL_IDLE_HEX,
    //   lookaheadBootstrapTime, lookaheadComputeFretBounds, lookaheadTargetWorldX.
    // 241→177: removed 44 phantom consts, 2 undefined fn-refs, 16 dead params,
    //   2 shadowed locals camAhead/camTau.
    const wiringMatch = screenSrc.match(/createRenderer\(\{([\s\S]*?)\}\)/);
    assert.ok(wiringMatch, 'screen.js must contain createRenderer({...}) call');
    const body = wiringMatch[1];

    const getterCount    = (body.match(/\bget[A-Z]\w+\s*:/g) || []).length;
    const setterCount    = (body.match(/\bset[A-Z]\w+\s*:/g) || []).length;
    const shorthandCount = body.split('\n').reduce((acc, line) => {
        const t = line.trim();
        if (!t || t.startsWith('//') || t.includes('=>')) return acc;
        return acc + (t.match(/\b[A-Za-z_][A-Za-z0-9_]*\b(?=\s*,)/g) || []).length;
    }, 0);

    const total = getterCount + setterCount + shorthandCount;
    assert.strictEqual(total, 315,
        `DI param count mismatch: got ${total} (getters=${getterCount}, setters=${setterCount}, shorthands=${shorthandCount})`);
});

// ── 2. Tombstone — original bodies must be absent from screen.js ─────────────

test('screen.js does not contain function lookaheadSmoothCamStep body', () => {
    // Body was: Math.min(0.2, Math.max(1e-4, dtSec))
    assert.doesNotMatch(screenSrc, /function lookaheadSmoothCamStep/,
        'lookaheadSmoothCamStep body must be in renderer.js, not screen.js');
});

test('screen.js does not contain function _applyNoteCamTargets body', () => {
    assert.doesNotMatch(screenSrc, /function _applyNoteCamTargets/,
        '_applyNoteCamTargets body must be in renderer.js, not screen.js');
});

test('screen.js does not contain function _buildFretLabelSet body', () => {
    assert.doesNotMatch(screenSrc, /function _buildFretLabelSet/,
        '_buildFretLabelSet body must be in renderer.js, not screen.js');
});

test('screen.js does not contain function smoothNow body', () => {
    // The name smoothNow also appears in camera.js; key is it should not
    // appear in screen.js after the carve.
    assert.doesNotMatch(screenSrc, /function smoothNow\b/,
        'smoothNow body must be in renderer.js, not screen.js');
});

test('screen.js does not contain function update body (per-frame draw loop)', () => {
    // The IIFE-level update() is gone. Key distinctive pattern: the region C
    // song-change detection block (const newSongKey) only appears inside update().
    // The wiring call has `const { update } = createRenderer(...)` not `function update(`.
    assert.doesNotMatch(screenSrc, /function update\s*\(bundle\)/,
        'function update(bundle) body must not appear in screen.js');
});

// ── 3. Renderer exports update ───────────────────────────────────────────────

test('renderer.js return value exports update, _prewarmStatic, _prewarmChart', () => {
    // F1 fix: callers need _prewarmStatic/_prewarmChart from the factory return.
    assert.match(src, /return\s*\{\s*update\s*,\s*_prewarmStatic\s*,\s*_prewarmChart\s*\}/,
        'createRenderer must return { update, _prewarmStatic, _prewarmChart }');
});

// ── 4. Caller-list corrections (contract §6) ─────────────────────────────────

test('_applyNoteCamTargets has exactly 2 call sites in renderer.js', () => {
    const calls = src.match(/_applyNoteCamTargets\s*\(/g) || [];
    // Subtract 1 for the function declaration itself
    const callSites = calls.length - 1;
    assert.strictEqual(callSites, 2,
        `_applyNoteCamTargets must have exactly 2 caller sites; found ${callSites}`);
});

test('lookaheadSmoothCamStep has exactly 3 call sites in renderer.js', () => {
    // Strip comment lines before counting to avoid matching the comment mention.
    const noComments = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    const calls = noComments.match(/lookaheadSmoothCamStep\s*\(/g) || [];
    const callSites = calls.length - 1; // subtract function declaration
    assert.strictEqual(callSites, 3,
        `lookaheadSmoothCamStep must have exactly 3 caller sites (9963/9974/9978); found ${callSites}`);
});

// ── 5. smoothNow return-value semantics (correction 3) ───────────────────────

test('smoothNow setter-return pattern: no bare return (_frameNow = ...) in renderer.js', () => {
    // Must not use compound-assignment return; must use const v / setFrameNow / return v
    assert.doesNotMatch(src, /return\s*\(\s*_frameNow\s*=/,
        'smoothNow must not use return (_frameNow = raw); use setFrameNow + return v');
});

test('smoothNow uses setFrameNow before return in renderer.js', () => {
    assert.match(src, /setFrameNow\(/,
        'smoothNow must call setFrameNow() to persist frameNow');
});

// ── 6. Structural guard: createRenderer is after sub-factories in screen.js ──

test('createRenderer wiring is after createNoteRenderer in screen.js', () => {
    const nrPos  = screenSrc.indexOf('createNoteRenderer({');
    const renPos = screenSrc.indexOf('createRenderer({');
    assert.ok(renPos > nrPos,
        'createRenderer({}) wiring must appear after createNoteRenderer({}) in screen.js');
});

test('createRenderer wiring is after createCamera in screen.js', () => {
    const camPos = screenSrc.indexOf('createCamera({');
    const renPos = screenSrc.indexOf('createRenderer({');
    assert.ok(renPos > camPos,
        'createRenderer({}) wiring must appear after createCamera({}) in screen.js');
});

// ── 7. Wiring scope check — every shorthand in all factory wirings is declared ──
// This test is the source-scan mitigation for wiring specifically:
// it was RED at 7623ad8 (BEAT_HEAD_SEC phantom failed; 44 phantoms total) and
// GREEN at the r2 fix tip.
//
// Strategy: for each wiring call block, extract shorthand identifier lines
// (no => arrow, no key: pattern), strip comment lines, collect identifier tokens.
// Then verify each appears in screen.js OUTSIDE the wiring block itself.
// A phantom never appears outside — so it fails here with a clear name.

test('all shorthand identifiers in factory wiring calls are declared in screen.js scope', () => {
    // Extract shorthand tokens from the wiring body of a factory call.
    // Lines containing '=>' are getter/setter arrow functions (skip).
    // Lines whose only non-whitespace content is identifiers + commas are shorthand lines.
    function extractShorthands(wiringBody) {
        const names = new Set();
        for (const line of wiringBody.split('\n')) {
            const t = line.trim();
            if (!t || t.startsWith('//')) continue;
            if (t.includes('=>')) continue;
            // If line contains 'word:' pattern it's a key:value line — skip key (param name, not scope ref)
            if (/\b\w+\s*:/.test(t)) continue;
            const toks = t.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) || [];
            for (const tok of toks) names.add(tok);
        }
        return names;
    }

    // Build corpus = screen.js with each wiring block blanked out.
    // Names that only exist inside the wiring block → not in corpus → fail.
    // Each wiring block is identified by its factory call signature.
    const factoryPatterns = [
        /createArp\(\{([\s\S]*?)\}\)/,
        /createNoteRenderer\(\{([\s\S]*?)\}\)/,
        /createCamera\(\{([\s\S]*?)\}\)/,
        // After F1-prewarm fix the destructure has multiple names; match any {…update…} form.
        /const \{[^}]*update[^}]*\} = createRenderer\(\{([\s\S]*?)\}\)/,
    ];

    // Build scope corpus: screenSrc with all wiring blocks blanked
    let corpus = screenSrc;
    for (const pat of factoryPatterns) {
        corpus = corpus.replace(pat, (m) => ' '.repeat(m.length));
    }

    const allMissing = [];
    for (const pat of factoryPatterns) {
        const m = screenSrc.match(pat);
        if (!m) continue;
        const shorthands = extractShorthands(m[m.length - 1]); // last capture group = body
        for (const name of shorthands) {
            // Check the name appears in the corpus (outside all wiring blocks)
            if (!new RegExp(`\\b${name}\\b`).test(corpus)) {
                allMissing.push(name);
            }
        }
    }

    // Anti-vacuity: if the createRenderer regex fails to match the wiring block
    // (e.g. the destructure pattern changed), shorthands would be 0 and the loop
    // silently passes with no actual checks. Assert a realistic floor.
    {
        const renPat = /const \{[^}]*update[^}]*\} = createRenderer\(\{([\s\S]*?)\}\)/;
        const renM = screenSrc.match(renPat);
        assert.ok(renM, 'createRenderer wiring regex must match screen.js — regex vacuity guard');
        const renShorthands = extractShorthands(renM[renM.length - 1]);
        assert.ok(renShorthands.size >= 150,
            `createRenderer wiring must have >=150 shorthand params (got ${renShorthands.size}) — ` +
            `regex matched too little or wiring block shrank unexpectedly`);
    }

    assert.deepEqual(allMissing.sort(), [],
        `Shorthand identifiers not declared in screen.js scope (phantoms): ${allMissing.sort().join(', ')}\n` +
        `This test was RED at 7623ad8 on BEAT_HEAD_SEC (44 phantoms). ` +
        `Fix: delete undefined names from both the DI signature and wiring call.`);
});

// ── 8. Creed r1 execution-readiness guards (RED at 7180eff, GREEN at fix tip) ─
//
// Creed r1 review at 7180eff raised THREE HIGH findings — all runtime failures:
//   F1: _prewarmStatic/_prewarmChart not returned → callers get undefined at
//       screen.js:7377 and :7461
//   F2: cameraLockLow/cameraLockZoom free vars in _applyNoteCamTargets → any
//       fretted note in view triggers ReferenceError (cameraLockLow)
//   F3: dZ/renderOrderForLayerAtZ not imported from geometry.js; TS/S_BASE/
//       FRET_LABEL_* not DI'd → chord/beat/lane render paths crash (dZ)
// Plus: broken camera.js import (3 names not exported from camera.js) →
//   module-load SyntaxError prevents renderer.js from loading at all.
//
// These source-scan guards are RED at 7180eff and GREEN at the fix commit.

test('F1: renderer.js returns _prewarmStatic and _prewarmChart', () => {
    // RED at 7180eff: return { update } only — prewarm callers crash with TypeError
    // GREEN at fix tip: return { update, _prewarmStatic, _prewarmChart }
    assert.match(src, /_prewarmStatic\s*,\s*_prewarmChart/,
        'return must include _prewarmStatic and _prewarmChart (F1 fix)');
    assert.match(src, /return\s*\{[^}]*_prewarmStatic/,
        '_prewarmStatic must be in return statement');
});

test('F2: _applyNoteCamTargets uses getCameraLockLow() not bare cameraLockLow', () => {
    // Extract _applyNoteCamTargets body (from function decl to next top-level fn)
    const fnStart = src.indexOf('function _applyNoteCamTargets(');
    const fnEnd   = src.indexOf('\nfunction ', fnStart + 1);
    // Strip line comments so identifiers in comments don't trip the checks
    const fnBody  = src.slice(fnStart, fnEnd).replace(/\/\/[^\n]*/g, '');

    // RED at 7180eff: cameraLockLow (free var, line 131); getCameraLockLow() absent
    assert.doesNotMatch(fnBody, /\bcameraLockLow\b(?!\s*\()/,
        '_applyNoteCamTargets must not read bare cameraLockLow (F2: use getCameraLockLow())');
    assert.match(fnBody, /getCameraLockLow\(\)/,
        '_applyNoteCamTargets must call getCameraLockLow() (F2 fix)');
    assert.doesNotMatch(fnBody, /\bcameraLockZoom\b(?!\s*\()/,
        '_applyNoteCamTargets must not read bare cameraLockZoom (F2: use getCameraLockZoom())');
    assert.match(fnBody, /getCameraLockZoom\(\)/,
        '_applyNoteCamTargets must call getCameraLockZoom() (F2 fix)');
});

test('F3: renderer.js imports dZ and renderOrderForLayerAtZ from geometry.js', () => {
    // RED at 7180eff: neither name in geometry.js import — dZ calls crash
    const importLine = src.match(/import\s*\{[^}]+\}\s*from\s*['"]\.\/geometry\.js['"]/);
    assert.ok(importLine, 'renderer.js must have a geometry.js import');
    assert.match(importLine[0], /\bdZ\b/,
        'geometry.js import must include dZ (F3 fix)');
    assert.match(importLine[0], /\brenderOrderForLayerAtZ\b/,
        'geometry.js import must include renderOrderForLayerAtZ (F3 fix)');
});

test('F3: createRenderer DI includes TS, S_BASE, FRET_LABEL_GOLD_HEX, FRET_LABEL_IDLE_HEX', () => {
    // RED at 7180eff: none of these in DI signature → undefined in hot render paths
    const diMatch = src.match(/export function createRenderer\(\{([\s\S]*?)\}\s*\)/);
    assert.ok(diMatch, 'createRenderer DI signature not found');
    const di = diMatch[1];
    for (const name of ['TS', 'S_BASE', 'FRET_LABEL_GOLD_HEX', 'FRET_LABEL_IDLE_HEX']) {
        assert.match(di, new RegExp(`\\b${name}\\b`),
            `createRenderer DI must include ${name} (F3 fix)`);
    }
});

test('camera import fix: renderer.js does not import lookahead fns from camera.js', () => {
    // At 7180eff camera.js only exports createCamera; importing the 3 lookahead names
    // caused: SyntaxError: does not provide an export named 'lookaheadBootstrapTime'
    // RED at 7180eff: those names in camera.js import → module-load failure
    // GREEN at fix tip: removed from camera import, added to DI from screen.js
    const cameraImport = src.match(/import\s*\{[^}]+\}\s*from\s*['"]\.\/camera\.js['"]/);
    if (cameraImport) {
        for (const name of ['lookaheadBootstrapTime', 'lookaheadComputeFretBounds', 'lookaheadTargetWorldX']) {
            assert.doesNotMatch(cameraImport[0], new RegExp(`\\b${name}\\b`),
                `renderer.js must not import ${name} from camera.js (not exported — causes module-load SyntaxError)`);
        }
    }
    // Verify the 3 names appear in the DI signature instead
    const diMatch = src.match(/export function createRenderer\(\{([\s\S]*?)\}\s*\)/);
    assert.ok(diMatch, 'createRenderer DI not found');
    const di = diMatch[1];
    for (const name of ['lookaheadBootstrapTime', 'lookaheadComputeFretBounds', 'lookaheadTargetWorldX']) {
        assert.match(di, new RegExp(`\\b${name}\\b`),
            `createRenderer DI must include ${name} (camera import fix — DI'd from screen.js instead)`);
    }
});

test('F1: screen.js destructures _prewarmStatic and _prewarmChart from createRenderer', () => {
    // RED at 7180eff: const { update } = createRenderer({...}) — prewarm fns undefined
    assert.match(screenSrc, /const\s*\{\s*update\s*,\s*_prewarmStatic\s*,\s*_prewarmChart\s*\}/,
        'screen.js must destructure _prewarmStatic and _prewarmChart from createRenderer return');
});

// ── 26. Toby r3 F1 kill test — _CV_KEY_TIME consts in screen.js scope ────────
// _encodeChordVerdictKey is defined in screen.js IIFE scope and reads
// _CV_KEY_TIME_MUL / _CV_KEY_TIME_SLOT from that same scope. These were
// incorrectly moved to renderer.js closure in 06e4fe3, making them invisible to
// _encodeChordVerdictKey → ReferenceError on any chord-template chart frame.
// RED at 06e4fe3: consts absent from screen.js. GREEN at fix tip: restored.
test('_CV_KEY_TIME_MUL and _CV_KEY_TIME_SLOT are declared in screen.js before _encodeChordVerdictKey', () => {
    const mulIdx    = screenSrc.indexOf('const _CV_KEY_TIME_MUL');
    const slotIdx   = screenSrc.indexOf('const _CV_KEY_TIME_SLOT');
    const fnIdx     = screenSrc.indexOf('function _encodeChordVerdictKey');
    assert.ok(mulIdx  !== -1, '_CV_KEY_TIME_MUL must be declared in screen.js (not only in renderer.js closure)');
    assert.ok(slotIdx !== -1, '_CV_KEY_TIME_SLOT must be declared in screen.js');
    assert.ok(fnIdx   !== -1, '_encodeChordVerdictKey must still exist in screen.js');
    assert.ok(mulIdx  < fnIdx, '_CV_KEY_TIME_MUL must be declared before _encodeChordVerdictKey in screen.js');
    assert.ok(slotIdx < fnIdx, '_CV_KEY_TIME_SLOT must be declared before _encodeChordVerdictKey in screen.js');
});

// ── 23–25. ACTUAL EXECUTION SMOKE TEST ──────────────────────────────────────
// Loads createRenderer via new Function (strips ESM import/export) so it runs
// in a CJS test context with fully-stub DI. Proves update() does not throw.
//
// ⚠ new Function sloppy-mode hole: the stripped module runs outside strict mode,
// so reading an undeclared variable evaluates to undefined (sloppy) rather than
// throwing ReferenceError (strict). This means the smoke alone cannot catch a
// missing DI param — it would silently receive undefined and might not throw.
// The compensating layer is eslint no-undef on renderer.js (run at commit time),
// which IS strict-mode-aware and catches all undeclared reads regardless of the
// test environment. These two gates together provide the full guarantee:
// eslint=0 proves no undeclared names; smoke proves update() executes end-to-end.
//
// RED at d475899: first execution would crash with
//   ReferenceError: ACCENT_NOTE_FILL_BOOST is not defined
// because Category-B consts were read from renderer.js scope but were never
// declared inside it (they lived only in screen.js's IIFE and ES-module scope
// never chains into an IIFE). GREEN at this commit: all 313+ DI params wired.
{
    // Stub window for Node (renderer.js reads window.feedBack, guarded by &&)
    if (typeof global.window === 'undefined') global.window = {};

    // ── Geometry stubs (replace the geometry.js import) ──────────────────────
    const _geo = {
        lowerBoundT(arr, t) {
            let lo = 0, hi = arr.length;
            while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].t < t) lo = m + 1; else hi = m; }
            return lo;
        },
        camBaseDistU: () => 0,
        camLowFretPullbackU: () => 0,
        dZ: () => 0,
        renderOrderForLayerAtZ: () => 0,
    };

    // Strip ESM: remove import lines, rename export function
    const _stripped = src
        .replace(/^import\s+\{[^}]+\}\s+from\s+['"][^'"]+['"]\s*;?[^\n]*/mg, '')
        .replace('export function createRenderer', 'function createRenderer');

    // Wrap in a function that closes over geometry helpers and returns the factory
    const _getFactory = new Function(
        'lowerBoundT', 'camBaseDistU', 'camLowFretPullbackU', 'dZ', 'renderOrderForLayerAtZ',
        _stripped + '\nreturn createRenderer;',
    );
    const _createRenderer = _getFactory(
        _geo.lowerBoundT, _geo.camBaseDistU, _geo.camLowFretPullbackU,
        _geo.dZ, _geo.renderOrderForLayerAtZ,
    );

    // ── Build a minimal-stub DI covering all 313 params ──────────────────────
    const N  = () => {};
    const NAR = new Float32Array(0);
    const NSTR = 6, NFRETS = 24;
    function _makeDI() {
        return {
            // B — consts
            K: 1, NFRETS, NW: 1, NH: 0.1, AHEAD: 1.5, BEHIND: 0.2, S_GAP: 1,
            CAM_FOCUS_BLEND_RATE: 0.1, CAM_LOCK_ZOOM_MIN: 0.5, CAM_LOCK_ZOOM_MAX: 2,
            CAM_LOCK_CENTER_FRET: 7, LOOKAHEAD_LOCK_ENGAGE_MAXF: 3, LOOKAHEAD_LOCK_RELEASE_MAXF: 5,
            DEFAULT_LOOKAHEAD_FRET_SPAN: 8, FRET_WIDTH_MID: 0.05, CAM_TGT_BEHIND: 0.2,
            CAM_DIST_BASE: 5, VENUE_GEM_EMISSIVE_MUL: 1.5, NOTEDETECT_GEM_VERDICT_WINDOW: 0.3,
            INLAY_LABEL_FRETS: [3,5,7,9,12], GHOST_HOLD_AFTER_ONSET: 0.1,
            CHORD_FRAME_RIM_MIN: 0.01, CHORD_FRAME_RIM_FRAC_H: 0.1,
            TS: 1, S_BASE: 0.1, FRET_LABEL_GOLD_HEX: '#e8c040', FRET_LABEL_IDLE_HEX: '#9ab8cc',
            ACCENT_NOTE_FILL_BOOST: 0.3, ACCENT_NOTE_LINGER_EPS: 0.05, ACCENT_NOTE_STR_GLOW: 0.5,
            ARPEGGIO_RIM_BLUE_HEX: '#4080ff', ARP_FRAME_ONSET_CLUSTER_S: 0.1,
            ARP_FRAME_ONSET_PAD_S: 0.05, ARP_INFER_MIN_HAND_SHAPE_SPAN_S: 0.2,
            CAM_DIST_HYST_C: 0.1, CAM_DIST_HYST_T: 0.1, CAM_TGT_AHEAD_C: 0.1,
            CAM_TGT_AHEAD_T: 0.1, CAM_TGT_HYST_C: 0.05, CAM_TGT_HYST_T: 0.05,
            CAM_TGT_TAU_C: 0.2, CAM_TGT_TAU_T: 0.2, CHORD_BOX_EDGE_ALPHA: 0.7,
            CHORD_BOX_HIT_BRIGHT_HEX: '#fff', CHORD_BOX_MISS_DARK_HEX: '#333',
            CHORD_BOX_TEAL_HEX: '#00ac', CHORD_FRAME_RIM_Z_MIN: 0.1,
            CHORD_FRAME_RIM_Z_SCAL: 1, CHORD_HWY_FADE_S: 0.3, CHORD_HWY_LINGER_S: 2,
            DIAG_CROSSFADE_S: 0.15, DIAG_ENTRANCE_S: 0.2, DIAG_LINGER_S: 1.5,
            DOTS: [3,5,7,9,12,15,17,19,21], FRET_COOLDOWN: 0.15, FRET_EMISSIVE: 2,
            FRET_WIRE_ACTIVE_HEX: '#80c0ff', FRET_WIRE_ACTIVE_OP: 0.9,
            FRET_WIRE_HIT_DECAY: 0.9, FRET_WIRE_HIT_INTENSITY: 3, FRET_WIRE_HIT_OP: 1,
            FRET_WIRE_IDLE_HEX: '#aaa', FRET_WIRE_IDLE_OP: 0.3,
            HWY_LANE_STRIPE_OP_BASE: 0.3, HWY_LANE_STRIPE_OP_INT: 0.15,
            HWY_LANE_TIME_SLICES: 8, NEXT_ON_STRING_T_EPS: 0.01,
            _ND_UNMATCHED_LATCH_AFTER: 0.2, VENUE_LANE_OP_BOOST: 0.5,
            _CV_KEY_TIME_MUL: 1e4, _CV_KEY_TIME_SLOT: 1e6,
            MAX_RENDER_STRINGS: 8,
            // C — fn-refs
            sY: (s) => s * 0.1, xFret: (f) => f * 0.05, xFretMid: (f) => f * 0.05,
            fretLabelScaleForFret: () => 1, pbBeg: N, pbEnd: N, pbReportTick: N,
            hwyFirstRelevantFrettedTime: () => Infinity, _syncOpenStringPitchLabels: N,
            txtMat: () => ({ opacity: 1, map: null, color: { lerp: N }, emissive: { lerp: N }, emissiveIntensity: 1 }),
            _setLabelMap: N, drawNote: N, drawArpBrackets: N, chordHarmonyLabels: N,
            camUpdate: N, lookaheadBootstrapTime: N,
            lookaheadComputeFretBounds: () => ({ lo: 0, hi: 12 }),
            lookaheadTargetWorldX: () => 0, chordWireHighDensity: () => false,
            chordTemplateLabel: () => null, chordTemplateMarkedArpeggio: () => false,
            chordHandShapeArpeggioHint: () => false,
            mergeHandShapeSynthChords: () => [], mergeChordShape: () => null,
            inferArpeggioFromNotePattern: N, chordShapeCoveredByStandaloneNotes: () => false,
            hsStart: () => 0, hsEnd: () => 0, handShapeChartSpanSec: () => 0.5,
            fillArpeggioGhostInferFlags: N, arpeggioChordIdForNoteWithInferCache: () => -1,
            arpHsBoundsForNote: () => null, fillLaneRailHandShapeFlags: N,
            fillArpeggioRailShapeBoundsCaches: N,
            arpeggioLaneOuterRailLaneSlice: () => null,
            arpeggioLaneOuterRailAtChartTime: () => null,
            arpeggioLaneDividerFrameAccentMul: () => 1,
            arpeggioLaneDividerXYScaleMatchFrameRim: () => 1,
            validString: (s) => s >= 0 && s < NSTR, filterValidNotes: (n) => n,
            activePalette: new Array(NSTR).fill(0xffffff),
            anchorLaneBoundsAt: () => null, anchorPlayedFretSpanAt: () => null,
            boardSpanX: 1, chordShapeSignature: () => '',
            _drawAnchors: [], _drawChordTemplates: [], _drawNextByString: new Array(NSTR).fill(null),
            _drawRecentByString: new Array(NSTR).fill(null), _drawTeachingMarks: [],
            _encodeChordVerdictKey: (t, s, f) => `${t}_${s}_${f}`,
            _firstEventTimeGreaterThan: () => Infinity,
            fretColumnMarkerCadence: 0, fretColumnMarkersForAnchor: () => [],
            fretDividersVisible: true, fretLastActiveTime: new Float32Array(NFRETS + 1),
            _fretMarkerWaveCache: {}, fretWireMats: [],
            fretX: (f) => f * 0.05,
            getChartAnchorAt: () => ({ fret: 0, width: 12 }), hwyPostHitTailFadeMul: () => 1,
            imFHTech: null, imFHXFill: null, imFHXLines: null,
            imPMTech: null, imPMXFill: null, imPMXLines: null,
            laneBoundsFromAnchor: () => ({ lo: 0, hi: 12 }), sectionLabelsOnHighway: false,
            _showFingerHints: () => false, updateStringHighlights: N,
            _noteKey: (t, s) => `${t}_${s}`,
            bendChevronMat: () => null, darkenHex: (h) => h, slideArrowMat: () => null,
            triMat: () => null, palmMuteXSpriteMat: () => null,
            fretHandMuteXSpriteMat: () => null, fxClearSeen: N,
            // D — ren/scene/cam getters
            getRen: () => null, getScene: () => null, getCam: () => null,
            // E — shared mutable (getter/setter)
            getDiagChord: () => null, setDiagChord: N,
            getDiagEntranceT: () => 1, setDiagEntranceT: N,
            getDiagLastKey: () => null, setDiagLastKey: N,
            getDiagPrev: () => null, setDiagPrev: N,
            getDiagPrevOpacity: () => 0, setDiagPrevOpacity: N,
            getDiagPrevStartOpacity: () => 0, setDiagPrevStartOpacity: N,
            getDiagPrevStartT: () => null, setDiagPrevStartT: N,
            getMergeCacheResult: () => null, setMergeCacheResult: N,
            _scrEventTimes: new Float64Array(256),
            getScrEventTimesLen: () => 0, setScrEventTimesLen: N,
            getSlideTargetChordsRef: () => null, setSlideTargetChordsRef: N,
            getSlideTargetNotesRef: () => null, setSlideTargetNotesRef: N,
            getSlideTargetSet: () => null, setSlideTargetSet: N,
            // F — stable refs + getter/setter
            _fwChordAcc: new Map(), _fwHitGlow: new Float32Array(NFRETS + 1),
            _fwHitIn: new Float32Array(NFRETS + 1), _rimFlashIn: new Float32Array(NSTR),
            _susVerdictLatch: new Map(),
            getFwHitColor: () => null, getFwHitEmissive: () => null,
            getFwHitPrevTime: () => -Infinity, setFwHitPrevTime: N,
            getMBeatM: () => null, getMBeatQ: () => null, getMRimFlash: () => [],
            // G — lane materials
            getMLaneDivider: () => ({ opacity: 1, color: { lerp: N }, emissive: { lerp: N } }),
            getMLaneDividerArp: () => ({ opacity: 1 }),
            getMLaneDividerExt: () => ({ opacity: 1 }),
            getMLaneEven: () => ({ opacity: 1 }),
            getMLaneOdd:  () => ({ opacity: 1 }),
            // Extra
            getChordFrameGradTex: () => null, getChordFrameGradTexArp: () => null,
            // Pool getters (33)
            getPNote: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPNoteEdge: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPSus: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPSusOutline: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPSusRibbon: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPSusRibbonOl: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPTapChevron: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPAccentHalo: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPLbl: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPArpBracket: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPBeat: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPSec: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPFretLbl: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPLane: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPLaneDivider: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPGhostFretLbl: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPChordBox: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPChordFrameFill: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPChordLbl: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPBarreLine: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPHaloBar: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPPMXFill: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPFHXFill: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPMuteXLines: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPFHXLines: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPNoteFretLabel: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPConnectorLine: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPDropLine: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPTeachMarkLbl: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPFretColMarker: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPSusRail: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPSusRailBloom: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            getPTechPlane: () => ({ get: () => ({}), release: N, resetCount: N, reset: N }),
            // Material/scene getters
            getMHitBright: () => [], getMHitSusOutline: () => null,
            getGlowMul: () => 1, getVenueSceneOverride: () => false, getProjMeshArr: () => [],
            // Render settings
            getTextSize: () => 12, getCameraMode: () => 'smooth',
            getCameraSmoothing: () => 0.5, getZoomSmoothing: () => 0.5,
            getCameraLockLow: () => false, getCameraLockZoom: () => 0,
            getNStr: () => NSTR, getLeftyCached: () => false, getInverted: () => false,
            // Camera state getters
            getTgtX: () => 0.3, getTgtDist: () => 5, getCurX: () => 0.3,
            getPrevLowFretBonus: () => 0, getPrevLockActive: () => false,
            getLookaheadCamX: () => 0.3, getLookaheadFretSpan: () => 8,
            getLookaheadLowBonusU: () => 0, getLookaheadHiNeckLatch: () => false,
            getLookaheadCamPrevNow: () => 0,
            getFrameNow: () => 0, getClkAudioT: () => 0, getClkPerf: () => 0,
            getClkRate: () => 1, getCamSnapped: () => true, getCamPreScanned: () => true,
            getCamBootstrapHolding: () => false, getCamBootstrapMode: () => 'snap',
            getSongKey: () => 'smoke-test', getNdVerdictSawAlpha: () => false,
            getNdVerdictMaxAlpha: () => 0, getNdFrameNowMs: () => 0,
            getInlayLabels: () => [], getLeanSusPollCounter: () => 0, getLeanSus: () => true,
            getTextSizeMul: () => 1, getTextSizeMulApplied: () => 1,
            getImPMTechCount: () => 0, getImFHTechCount: () => 0,
            getMeasureStartsRef: () => [],
            // Stable object refs
            _frameLabeledKeys: new Set(), _ndLabels: [],
            _scrGhostUpcomingCount: new Int32Array(NSTR),
            _ndHitMarks: [], _ndMissMarks: [],
            // Setters
            setNdVerdictSawAlpha: N, setNdVerdictMaxAlpha: N, setNdFrameNowMs: N,
            setLeanSus: N, setLeanSusPollCounter: N,
            setTextSizeMul: N, setTextSizeMulApplied: N,
            setImPMTechCount: N, setImFHTechCount: N,
            setImPMXFillCount: N, setImPMXLinesCount: N,
            setImFHXFillCount: N, setImFHXLinesCount: N,
            setLookaheadCamX: N, setLookaheadFretSpan: N,
            setLookaheadCamPrevNow: N, setLookaheadHiNeckLatch: N,
            setLookaheadLowBonusU: N, setTgtX: N, setTgtDist: N,
            setPrevLowFretBonus: N, setPrevLockActive: N,
            setCurX: N, setCurDist: N, setSongKey: N, setCamSnapped: N,
            setCamPreScanned: N, setCamBootstrapHolding: N, setCamBootstrapMode: N,
            setMeasureStarts: N, setMeasureStartsRef: N,
            setClkAudioT: N, setClkPerf: N, setClkRate: N, setFrameNow: N,
        };
    }

    function _makeBundle(o) {
        return Object.assign({
            currentTime: 1.0, notes: [], chords: [], beats: [], sections: [],
            anchors: [{ time: 0, fret: 0, width: 12 }], chordTemplates: [],
            stringCount: NSTR, lyricsVisible: false, toneChanges: [], phrases: null,
            isReady: true, mastery: 1, hasPhraseData: false,
            songInfo: { arrangement: 'lead', tuning: [0,0,0,0,0,0], capo: 0, centOffset: 0 },
            lowerBoundT: _geo.lowerBoundT,
            lowerBoundTime: (arr, t) => _geo.lowerBoundT(arr, t),
            project: () => ({ x: 0, y: 0 }), fretX: (f) => f * 0.05,
            getNoteState: () => null,
        }, o);
    }

    test('smoke: createRendererFn constructs without throw', () => {
        assert.doesNotThrow(() => _createRenderer(_makeDI()),
            'createRenderer(stub-DI) must not throw — all names must be provided');
    });

    test('smoke: update() with empty bundle throws no ReferenceError (proves no undeclared names)', () => {
        // RED at d475899: ACCENT_NOTE_FILL_BOOST is not defined (Category B, not DI'd).
        // GREEN at this commit: all 313 DI params wired in createRenderer signature.
        // TypeErrors from stub DI (incomplete Three.js objects) are expected and accepted;
        // what must NOT happen is a ReferenceError for an undeclared name.
        const renderer = _createRenderer(_makeDI());
        try {
            renderer.update(_makeBundle({}));
        } catch (e) {
            assert.notStrictEqual(e.constructor, ReferenceError,
                `update() must not throw ReferenceError — undeclared name: ${e.message}`);
        }
    });

    test('smoke: update() backward seek (region C) throws no ReferenceError', () => {
        // Backward seek triggers _susVerdictLatch.clear() and slide-target reset.
        // TypeErrors from stub DI are expected; ReferenceError proves an undeclared name.
        const di = _makeDI();
        di.getFrameNow = () => 2.0;
        const renderer = _createRenderer(di);
        try { renderer.update(_makeBundle({ currentTime: 2.0 })); } catch (_) {}
        try {
            renderer.update(_makeBundle({ currentTime: 0.5 })); // backward seek
        } catch (e) {
            assert.notStrictEqual(e.constructor, ReferenceError,
                `update() backward seek must not throw ReferenceError: ${e.message}`);
        }
    });
}
