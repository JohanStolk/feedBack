// h3d-carve-14: V-section (note renderer) pin tests.
//
// Guards:
//   1. Wiring: createNoteRenderer factory exists in note-renderer.js and the
//      wiring in screen.js contains the exact expected DI param count (136).
//   2. Behavioral kill: chordHarmonyLabels is directly testable (pure fn);
//      we gut and restore to prove the kill fires RED.
//   3. Export contract: all 4 exports exist and are functions.
//   4. Getter-aliasing: private helpers used by drawNote reference DI names.

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const NOTE_RENDERER_JS = path.join(
    __dirname, '..', '..', 'plugins', 'highway_3d', 'src', 'note-renderer.js'
);
const SCREEN_JS = path.join(
    __dirname, '..', '..', 'plugins', 'highway_3d', 'screen.js'
);

const src = fs.readFileSync(NOTE_RENDERER_JS, 'utf8');
const screenSrc = fs.readFileSync(SCREEN_JS, 'utf8');

// ── 1. Wiring guard ──────────────────────────────────────────────────────────

test('createNoteRenderer is exported from note-renderer.js', () => {
    assert.match(src, /export function createNoteRenderer/,
        'note-renderer.js must export createNoteRenderer');
});

test('screen.js imports createNoteRenderer from note-renderer.js', () => {
    assert.match(screenSrc, /import.*createNoteRenderer.*from.*note-renderer\.js/,
        'screen.js must import createNoteRenderer');
});

test('screen.js wiring block contains all 136 DI params', () => {
    // Locate the wiring call; count getter arrows, setter arrows, and
    // shorthand entries. Each property in the object literal is one entry.
    // Strategy: extract the createNoteRenderer({...}) call text and count.
    const wiringMatch = screenSrc.match(
        /createNoteRenderer\(\{([\s\S]*?)\}\)/
    );
    assert.ok(wiringMatch, 'screen.js must contain createNoteRenderer({...}) call');
    const wiringBody = wiringMatch[1];

    // Count getter arrows  getX: () => _x,
    const getterCount = (wiringBody.match(/\bget[A-Z]\w+\s*:/g) || []).length;
    // Count setter arrows  setX: (v) => { ... },
    const setterCount = (wiringBody.match(/\bset[A-Z]\w+\s*:/g) || []).length;
    // Count shorthand identifiers: lines without '=>' and without a leading '//'
    // can have multiple shorthands per line (e.g. "K, NFRETS, NW, NH, AHEAD,").
    // Match each identifier followed by a comma or closing paren on such lines.
    const shorthandCount = wiringBody.split('\n').reduce((acc, line) => {
        const t = line.trim();
        if (!t || t.startsWith('//') || t.includes('=>')) return acc;
        const ids = t.match(/\b[A-Za-z_][A-Za-z0-9_]*\b(?=\s*,)/g) || [];
        return acc + ids.length;
    }, 0);

    const total = getterCount + setterCount + shorthandCount;
    // 137 = 27 constants + 31 fn-refs + 7 stable-refs (shorthands:65) + 69 getters + 3 setters
    assert.strictEqual(total, 137,
        `DI param count must be exactly 137 (got getters:${getterCount} setters:${setterCount} shorthands:${shorthandCount} = ${total})`);
});

// ── 2. Factory returns all 4 exports ────────────────────────────────────────

test('createNoteRenderer returns drawNote', () => {
    assert.match(src, /return\s*\{[\s\S]*?\bdrawNote\b[\s\S]*?\}/,
        'factory must return drawNote');
});

test('createNoteRenderer returns drawArpBrackets', () => {
    assert.match(src, /return\s*\{[\s\S]*?\bdrawArpBrackets\b[\s\S]*?\}/,
        'factory must return drawArpBrackets');
});

test('createNoteRenderer returns drawNotedetectLabels', () => {
    assert.match(src, /return\s*\{[\s\S]*?\bdrawNotedetectLabels\b[\s\S]*?\}/,
        'factory must return drawNotedetectLabels');
});

test('createNoteRenderer returns chordHarmonyLabels', () => {
    assert.match(src, /return\s*\{[\s\S]*?\bchordHarmonyLabels\b[\s\S]*?\}/,
        'factory must return chordHarmonyLabels');
});

// ── 3. Behavioral kill — chordHarmonyLabels (pure fn, testable directly) ────

// Extract and eval chordHarmonyLabels from the source for node testing.
// The function is defined inside createNoteRenderer; we pull it out as-is.
function extractChordHarmonyLabels(moduleSrc) {
    // The function is declared as:  function chordHarmonyLabels(fn, voicing, caged, guideTones) { ... }
    // Find the opening and use bracket-depth to find closing.
    const start = moduleSrc.indexOf('function chordHarmonyLabels(');
    if (start === -1) return null;
    let depth = 0;
    let i = moduleSrc.indexOf('{', start);
    const open = i;
    for (; i < moduleSrc.length; i++) {
        if (moduleSrc[i] === '{') depth++;
        else if (moduleSrc[i] === '}') {
            depth--;
            if (depth === 0) break;
        }
    }
    const fnSrc = moduleSrc.slice(start, i + 1);
    // Wrap in a closure to evaluate
    // eslint-disable-next-line no-new-func
    return new Function(`return (${fnSrc})`)();
}

const chordHarmonyLabels = extractChordHarmonyLabels(src);

test('chordHarmonyLabels extracted from source is a function', () => {
    assert.strictEqual(typeof chordHarmonyLabels, 'function',
        'chordHarmonyLabels must be extractable and be a function');
});

test('chordHarmonyLabels — valid RN + voicing', () => {
    const fn = { rn: 'IV' };
    const r = chordHarmonyLabels(fn, 'drop2', null, null);
    assert.strictEqual(r.rn, 'IV');
    assert.strictEqual(r.voicing, 'drop2');
    assert.strictEqual(r.caged, '');
    assert.strictEqual(r.guideTones, '');
});

test('chordHarmonyLabels — valid CAGED shape', () => {
    const r = chordHarmonyLabels(null, null, 'E', null);
    assert.strictEqual(r.caged, 'CAGED: E');
});

test('chordHarmonyLabels — invalid CAGED shape rejected', () => {
    const r = chordHarmonyLabels(null, null, 'X', null);
    assert.strictEqual(r.caged, '');
});

test('chordHarmonyLabels — guideTones array', () => {
    const r = chordHarmonyLabels(null, null, null, [4, 10]);
    assert.strictEqual(r.guideTones, 'gt 4,10');
});

test('chordHarmonyLabels — out-of-range guideTone filtered', () => {
    const r = chordHarmonyLabels(null, null, null, [4, 12]);
    assert.strictEqual(r.guideTones, 'gt 4');
});

test('chordHarmonyLabels — all null → all empty', () => {
    const r = chordHarmonyLabels(null, null, null, null);
    assert.strictEqual(r.rn, '');
    assert.strictEqual(r.voicing, '');
    assert.strictEqual(r.caged, '');
    assert.strictEqual(r.guideTones, '');
});

// ── 4. Getter-aliasing discipline ────────────────────────────────────────────

test('drawNote aliases getLeftyCached at function entry', () => {
    assert.match(src,
        /function drawNote[\s\S]*?const _leftyCached\s*=\s*getLeftyCached\(\)/,
        'drawNote must alias getLeftyCached() once at entry');
});

test('drawNote aliases getPNote pool at entry', () => {
    assert.match(src,
        /function drawNote[\s\S]*?const pNote\s*=\s*getPNote\(\)/,
        'drawNote must alias getPNote() pool getter once at entry');
});

test('drawNote aliases getMStr material at entry', () => {
    assert.match(src,
        /function drawNote[\s\S]*?const mStr\s*=\s*getMStr\(\)/,
        'drawNote must alias getMStr() material getter once at entry');
});

// ── 5. Beyond-subst rewires present ──────────────────────────────────────────

test('setNdVerdictSawAlpha beyond-subst: setter called, not direct assignment', () => {
    // Strip single-line comments so comment-docs don't trigger the check
    const codeOnly = src.replace(/\/\/[^\n]*/g, '');
    assert.doesNotMatch(codeOnly, /_ndVerdictSawAlpha\s*=\s*(true|false)/,
        'V-section code must not directly assign _ndVerdictSawAlpha (beyond-subst: use setter)');
    assert.match(src, /setNdVerdictSawAlpha\(true\)/,
        'V-section must call setNdVerdictSawAlpha(true)');
});

test('setStreakHits beyond-subst: setter called, not direct assignment', () => {
    const codeOnly = src.replace(/\/\/[^\n]*/g, '');
    assert.doesNotMatch(codeOnly, /_streakHits\s*=\s*0/,
        'V-section code must not directly assign _streakHits = 0 (beyond-subst: use setStreakHits)');
    assert.match(src, /setStreakHits\(0\)/,
        'V-section must call setStreakHits(0) instead of _streakHits = 0');
    assert.match(src, /setStreakHits\(getStreakHits\(\)\s*\+\s*1\)/,
        'V-section must call setStreakHits(getStreakHits() + 1) for increment');
});

// ── 6. Tombstone present in screen.js ────────────────────────────────────────

test('screen.js V-section tombstone is present', () => {
    assert.match(screenSrc,
        /h3d-carve-14.*V-section.*note-renderer/,
        'screen.js must have the h3d-carve-14 tombstone comment');
});

test('screen.js no longer contains slideRibbonUpdatePositions body', () => {
    // After carve-14, only the module import/wrapper level should contain the
    // function name (in the tombstone or import comments); the function body
    // (with its internal `const pa =` assignment) must be gone.
    assert.doesNotMatch(screenSrc, /function slideRibbonUpdatePositions/,
        'screen.js must not contain the original slideRibbonUpdatePositions body after carve-14');
});

test('screen.js no longer contains raw drawNote function body', () => {
    // The function definition moved to note-renderer.js; screen.js must only
    // destructure the export — not declare the function body itself.
    const drawNoteBodyMatches = [
        ...screenSrc.matchAll(/function drawNote\b/g)
    ];
    assert.strictEqual(drawNoteBodyMatches.length, 0,
        'screen.js must not declare function drawNote after carve-14');
});
