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

test('screen.js wiring block contains expected DI param count (177)', () => {
    // 177 = 77 getters + 35 setters + 65 shorthands (pinned after r2 phantom/dead-param fixes)
    // OLD pinned value was 241 (inflated by 44 phantom consts, 2 undefined fn-refs, 16 dead params,
    // and 2 shadowed locals camAhead/camTau that were re-declared as let inside update()).
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
    assert.strictEqual(total, 177,
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

test('renderer.js return value exports update function', () => {
    assert.match(src, /return\s*\{\s*update\s*\}/,
        'createRenderer must return { update }');
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
        /const \{ update \} = createRenderer\(\{([\s\S]*?)\}\)/,
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

    assert.deepEqual(allMissing.sort(), [],
        `Shorthand identifiers not declared in screen.js scope (phantoms): ${allMissing.sort().join(', ')}\n` +
        `This test was RED at 7623ad8 on BEAT_HEAD_SEC (44 phantoms). ` +
        `Fix: delete undefined names from both the DI signature and wiring call.`);
});
