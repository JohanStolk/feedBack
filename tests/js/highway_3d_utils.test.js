// Class-killer tests for src/utils.js — h3d-carve-3.
//
// Pure functions are evaluated by stripping 'export' keywords and wrapping
// the source in a new Function so the whole module runs in a controlled
// scope.  _ssActive and _ssIsCanvasFocused use `window` (live global), so
// they are covered by source-scan only.  Screen.js wiring is verified by
// scanning the import declaration.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const UTILS_JS  = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'src', 'utils.js');
const SCREEN_JS = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'screen.js');

let _utils;
function utils() { if (!_utils) _utils = fs.readFileSync(UTILS_JS, 'utf8'); return _utils; }

// Evaluate all pure exports in a CommonJS-compatible scope.
// Strips 'export' keywords; _ssActive/_ssIsCanvasFocused access window
// which is not available here — skip them in the pure eval.
let _fns;
function fns() {
    if (_fns) return _fns;
    const src = utils().replace(/^export\s+/gm, '');
    // provide a minimal window stub so _ssActive / _ssIsCanvasFocused don't
    // throw at declaration time (they only READ window inside their bodies).
    const factory = new Function('window', src + `
return {
    _h3dHexToInt, _clampByteI, _darkenInt, _lightenInt,
    resolveStringCount,
    _NOTE_NAMES_SHARP,
    _BASE_OPEN_MIDI_BASS4, _BASE_OPEN_MIDI_BASS5,
    _BASE_OPEN_MIDI_GUITAR6, _BASE_OPEN_MIDI_GUITAR7, _BASE_OPEN_MIDI_GUITAR8,
    _baseOpenStringMidis, _midiToPitchLabel, _openStringPitchLabelsForTuning,
    _ssActive, _ssIsCanvasFocused,
};`);
    _fns = factory({ feedBackSplitscreen: null });
    return _fns;
}

// ── _h3dHexToInt ──────────────────────────────────────────────────────────────

test('_h3dHexToInt: 6-char hex parses to integer', () => {
    // Mutation: remove parseInt → returns NaN; renderer sees non-numeric color.
    assert.strictEqual(fns()._h3dHexToInt('#ff0000'), 0xff0000);
    assert.strictEqual(fns()._h3dHexToInt('00ff00'), 0x00ff00);
});

test('_h3dHexToInt: 3-char shorthand expands to 6', () => {
    // Mutation: remove the t[0]+t[0] expansion → 'fff' parses as 0x0fff (wrong).
    assert.strictEqual(fns()._h3dHexToInt('#fff'), 0xffffff,
        '#fff must expand to #ffffff, not 0x0fff');
    assert.strictEqual(fns()._h3dHexToInt('abc'), 0xaabbcc);
});

test('_h3dHexToInt: invalid input returns null', () => {
    // Mutation: remove the regex guard → parseInt('gg0000', 16) returns NaN, not null.
    assert.strictEqual(fns()._h3dHexToInt('gg0000'), null);
    assert.strictEqual(fns()._h3dHexToInt(null), null);
    assert.strictEqual(fns()._h3dHexToInt(42), null);
});

// ── _clampByteI ───────────────────────────────────────────────────────────────

test('_clampByteI: clamps below 0', () => {
    // Mutation: remove < 0 guard → returns negative value; bitshift corrupts high channels.
    assert.strictEqual(fns()._clampByteI(-1), 0);
    assert.strictEqual(fns()._clampByteI(-999), 0);
});

test('_clampByteI: clamps above 255 and rounds', () => {
    // Mutation: remove > 255 guard or Math.round → oversaturated channels / float bits.
    assert.strictEqual(fns()._clampByteI(256), 255);
    assert.strictEqual(fns()._clampByteI(127.7), 128,
        'must round 127.7 to 128, not truncate to 127');
});

// ── _darkenInt / _lightenInt ──────────────────────────────────────────────────

test('_darkenInt: halves each channel of pure white', () => {
    // Mutation: remove _clampByteI call → channel value not clamped; bitshift carries.
    const result = fns()._darkenInt(0xffffff, 0.5);
    const r = (result >> 16) & 0xff, g = (result >> 8) & 0xff, b = result & 0xff;
    assert.strictEqual(r, 128, 'red channel must be Math.round(255*0.5)=128');
    assert.strictEqual(g, 128);
    assert.strictEqual(b, 128);
});

test('_lightenInt: mixing pure black toward white by 1.0 yields white', () => {
    // Mutation: swap r+(255-r)*t → r*(1-t) → wrong formula for lightening.
    assert.strictEqual(fns()._lightenInt(0x000000, 1.0), 0xffffff,
        'black mixed t=1 toward white must equal 0xffffff');
});

// ── resolveStringCount ────────────────────────────────────────────────────────

test('resolveStringCount: uses bundle.stringCount and clamps to maxStrings', () => {
    // Mutation: remove Math.min → returns 8 for a chart that declares 8 strings;
    // per-string material arrays index OOB.
    assert.strictEqual(fns().resolveStringCount({ stringCount: 8 }, 6), 6,
        'stringCount=8 exceeds maxStrings=6; must clamp');
    assert.strictEqual(fns().resolveStringCount({ stringCount: 4 }, 6), 4);
});

test('resolveStringCount: maxStrings param is authoritative, not a hardcoded 6', () => {
    // Mutation: re-hardcode maxStrings=6 inside utils.js → resolveStringCount({stringCount:7}, 7)
    // returns 6; 7th-string notes are silently never drawn and no test fails.
    assert.strictEqual(fns().resolveStringCount({ stringCount: 7 }, 7), 7,
        'maxStrings=7 must allow stringCount=7 through without clamping to a hardcoded 6');
    assert.strictEqual(fns().resolveStringCount({ stringCount: 10 }, 7), 7,
        'stringCount exceeding maxStrings must clamp to maxStrings, not 6');
});

test('resolveStringCount: falls back to 4 for bass arrangement', () => {
    // Mutation: remove /bass/i test → bass charts get 6 strings; 5th/6th string
    // material slots are undefined and T.WebGLRenderer calls throw.
    assert.strictEqual(
        fns().resolveStringCount({ songInfo: { arrangement: 'Bass' } }, 6),
        4,
        'arrangement containing "Bass" must fall back to 4 strings');
});

test('resolveStringCount: defaults to NSTR=6 when bundle has no string info', () => {
    assert.strictEqual(fns().resolveStringCount({}, 6), 6);
});

// ── _NOTE_NAMES_SHARP ─────────────────────────────────────────────────────────

test('_NOTE_NAMES_SHARP: 12 entries, correct spot values', () => {
    // Mutation: remove 'F#' → midiToPitchLabel returns 'G' for F# notes; tuner wrong.
    const n = fns()._NOTE_NAMES_SHARP;
    assert.strictEqual(n.length, 12, 'chromatic octave must have 12 entries');
    assert.strictEqual(n[0], 'C');
    assert.strictEqual(n[6], 'F#', 'index 6 must be F#');
    assert.strictEqual(n[11], 'B');
});

// ── _baseOpenStringMidis ──────────────────────────────────────────────────────

test('_baseOpenStringMidis: 4-string bass returns standard bass4 tuning', () => {
    // Mutation: remove sc===4 && isBass branch → returns guitar4 slice instead.
    const result = fns()._baseOpenStringMidis(4, 'Bass');
    assert.deepStrictEqual(result, [28, 33, 38, 43],
        '4-string bass must use standard E-A-D-G bass open-string MIDIs');
});

test('_baseOpenStringMidis: 6-string default returns guitar6 tuning', () => {
    const result = fns()._baseOpenStringMidis(6, 'Lead');
    assert.deepStrictEqual(result, [40, 45, 50, 55, 59, 64]);
});

// ── _midiToPitchLabel ─────────────────────────────────────────────────────────

test('_midiToPitchLabel: MIDI 60 = C4, MIDI 69 = A4', () => {
    // Mutation: remove "- 1" from octave calc → C4 becomes C5.
    assert.strictEqual(fns()._midiToPitchLabel(60), 'C4',
        'MIDI 60 is middle C (C4); the "- 1" octave offset is required');
    assert.strictEqual(fns()._midiToPitchLabel(69), 'A4',
        'MIDI 69 is concert A (A4)');
});

// ── _openStringPitchLabelsForTuning ──────────────────────────────────────────

test('_openStringPitchLabelsForTuning: standard guitar in E returns correct labels', () => {
    // Smoke: 6 zero-offset strings with guitar6 MIDI base. maxStrings=6 passed explicitly
    // (mirrors the delegator in screen.js which supplies MAX_RENDER_STRINGS).
    const labels = fns()._openStringPitchLabelsForTuning(
        { tuning: [0, 0, 0, 0, 0, 0], capo: 0, stringCount: 6 },
        { arrangement: 'Lead' },
        6,
        6, // maxStrings
    );
    assert.deepStrictEqual(labels, ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
        'standard guitar open-string labels must be E2-A2-D3-G3-B3-E4');
});

// ── _ssActive / _ssIsCanvasFocused — source-scan ─────────────────────────────

test('_ssActive reads window.feedBackSplitscreen live', () => {
    // Mutation: capture window.feedBackSplitscreen at module scope → old reference
    // used after splitscreen enables mid-session; ss.isActive() never true.
    assert.match(utils(), /window\.feedBackSplitscreen/,
        '_ssActive must read window.feedBackSplitscreen without caching it');
});

test('_ssIsCanvasFocused calls _ssActive', () => {
    // Mutation: inline _ssActive logic → test becomes two separate paths to maintain;
    // one diverges silently.
    assert.match(utils(), /_ssIsCanvasFocused[\s\S]{1,200}_ssActive\(\)/,
        '_ssIsCanvasFocused must delegate to _ssActive()');
});

// ── screen.js wiring ──────────────────────────────────────────────────────────

test('screen.js imports all Cut 3 utils from src/utils.js', () => {
    const src = fs.readFileSync(SCREEN_JS, 'utf8');
    assert.match(src,
        /import\s+\{[^}]*_ssActive[^}]*\}\s+from\s+['"]\.\/src\/utils\.js['"]/,
        'screen.js must import _ssActive (and other utils) from ./src/utils.js');
    assert.match(src, /_resolveStringCountBase/,
        'resolveStringCount must be imported with an alias so the delegator can shadow it');
    assert.match(src, /_h3dHexToInt/,
        '_h3dHexToInt must appear in the utils.js import line');
});

test('screen.js delegator passes MAX_RENDER_STRINGS to resolveStringCount', () => {
    // Mutation: delegator omits MAX_RENDER_STRINGS → resolveStringCount called with
    // maxStrings=undefined; Math.min(sc, undefined)=NaN; string count is always NaN.
    const src = fs.readFileSync(SCREEN_JS, 'utf8');
    assert.match(src, /_resolveStringCountBase\s*\(.*MAX_RENDER_STRINGS/,
        'delegator must supply MAX_RENDER_STRINGS so palette growth is auto-respected');
});

test('screen.js delegator passes MAX_RENDER_STRINGS to _openStringPitchLabelsForTuning', () => {
    const src = fs.readFileSync(SCREEN_JS, 'utf8');
    assert.match(src, /_openStringPitchLabelsForTuningBase\s*\(.*MAX_RENDER_STRINGS/,
        'delegator must forward MAX_RENDER_STRINGS as the maxStrings argument');
});

test('screen.js IIFE no longer declares the moved symbols', () => {
    // Strip import lines first so we only scan the IIFE body.
    const src = fs.readFileSync(SCREEN_JS, 'utf8');
    const iife = src.replace(/^import\s+.*\n/gm, '');
    assert.doesNotMatch(iife, /function\s+_h3dHexToInt\s*\(/,
        'IIFE must not redefine _h3dHexToInt');
    assert.doesNotMatch(iife, /function\s+_ssActive\s*\(/,
        'IIFE must not redefine _ssActive');
    assert.doesNotMatch(iife, /const\s+_NOTE_NAMES_SHARP\s*=/,
        'IIFE must not redefine _NOTE_NAMES_SHARP');
    assert.doesNotMatch(iife, /function\s+resolveStringCount\s*\(/,
        'IIFE must not redefine resolveStringCount');
});
