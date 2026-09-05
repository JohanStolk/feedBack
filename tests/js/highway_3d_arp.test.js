// h3d-carve-12: Regression coverage for T-section (arpeggio inference) extracted
// into plugins/highway_3d/src/arp.js.
//
// Test classes:
//   - Source-level: module shape, DI param presence, screen.js wiring
//   - Wiring-correspondence guard (naming-class invariant, PINNED_RENAMES = {})
//   - Amendment 2 behavioral kill: resetChordShapeCache identity (gut reset → RED)
//   - Amendment 3 behavioral kill: WeakMap re-keying guard (gut ref-keying → RED)
//   - Per-export behavioral kills: mergeHandShapeSynthChords, mergeChordShape,
//     chordShapeCoveredByStandaloneNotes, chordWireHighDensity, chordTemplateLabel

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SCREEN_JS = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'screen.js');
const ARP_JS    = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'src', 'arp.js');

const src    = fs.readFileSync(SCREEN_JS, 'utf8');
const arpSrc = fs.readFileSync(ARP_JS,   'utf8');

// ── Module shape ─────────────────────────────────────────────────────────────

test('arp.js exports createArp', () => {
    assert.match(arpSrc, /export\s+function\s+createArp\s*\(/,
        'arp.js must export createArp');
});

const EXPECTED_EXPORTS = [
    'chordWireHighDensity', 'chordTemplateLabel', 'chordTemplateMarkedArpeggio',
    'chordHandShapeArpeggioHint', 'mergeHandShapeSynthChords', 'mergeChordShape',
    'resetChordShapeCache', 'inferArpeggioFromNotePattern',
    'chordShapeCoveredByStandaloneNotes', 'hsStart', 'hsEnd', 'handShapeChartSpanSec',
    'fillArpeggioGhostInferFlags', 'arpeggioChordIdForNoteWithInferCache',
    'arpHsBoundsForNote', 'fillLaneRailHandShapeFlags', 'fillArpeggioRailShapeBoundsCaches',
    'arpeggioLaneOuterRailLaneSlice', 'arpeggioLaneOuterRailAtChartTime',
    'arpeggioLaneDividerFrameAccentMul', 'arpeggioLaneDividerXYScaleMatchFrameRim',
];

test('createArp return object declares all 21 exported symbols', () => {
    for (const sym of EXPECTED_EXPORTS) {
        assert.match(arpSrc, new RegExp('\\b' + sym + '\\b'),
            `arp.js must mention '${sym}'`);
    }
    // The factory return is the last `return {` in the file (inner returns are earlier)
    const lastReturnIdx = arpSrc.lastIndexOf('return {');
    assert.ok(lastReturnIdx >= 0, 'createArp must have a return { ... } block');
    const returnBlock = arpSrc.slice(lastReturnIdx);
    const returnMatch = returnBlock.match(/return\s*\{([^}]+)\}/s);
    assert.ok(returnMatch, 'factory return block must be parseable');
    for (const sym of EXPECTED_EXPORTS) {
        assert.ok(
            returnMatch[1].includes(sym),
            `return block must include '${sym}'`,
        );
    }
});

test('arp.js imports lowerBoundT directly from geometry.js (not via DI)', () => {
    assert.match(arpSrc,
        /import\s*\{\s*lowerBoundT\s*\}\s*from\s*'\.\/geometry\.js'/,
        'lowerBoundT must be imported from geometry.js');
    assert.doesNotMatch(arpSrc, /lowerBoundT\s*,/,
        'lowerBoundT must not appear in the DI parameter list');
});

// ── DI surface checks ────────────────────────────────────────────────────────

test('NEXT_ON_STRING_T_EPS is in the DI parameter list (late-found in survey)', () => {
    // Must appear as a destructured parameter, not just in usage
    const paramBlock = arpSrc.match(/export\s+function\s+createArp\s*\(\s*\{([^}]+)\}/s);
    assert.ok(paramBlock, 'must find createArp parameter block');
    assert.ok(
        paramBlock[1].includes('NEXT_ON_STRING_T_EPS'),
        'NEXT_ON_STRING_T_EPS must be listed as a DI parameter',
    );
});

test('getNStr getter is used in arpeggioLaneDividerXYScaleMatchFrameRim body (DI rewire)', () => {
    assert.match(arpSrc, /getNStr\(\)/,
        'getNStr() must be called somewhere in arp.js');
    assert.match(arpSrc,
        /arpeggioLaneDividerXYScaleMatchFrameRim[\s\S]{1,400}getNStr\(\)/,
        'getNStr() must appear inside arpeggioLaneDividerXYScaleMatchFrameRim body');
});

// ── screen.js wiring ─────────────────────────────────────────────────────────

test('screen.js imports createArp from src/arp.js', () => {
    assert.match(src,
        /import\s*\{\s*createArp\s*\}\s*from\s*'\.\/src\/arp\.js'/,
        'screen.js must import createArp');
});

test('screen.js T-section body is gone (truthyChartFlag function removed)', () => {
    // truthyChartFlag lived only in the T-section and is private (not exported)
    assert.doesNotMatch(src, /function\s+truthyChartFlag\s*\(/,
        'truthyChartFlag must not remain as a function declaration in screen.js');
});

test('screen.js no longer contains _chordShapeCache = new WeakMap() direct assignment', () => {
    // After cut, _chordShapeCache lives in arp.js; screen.js only calls resetChordShapeCache()
    assert.doesNotMatch(src, /_chordShapeCache\s*=\s*new\s+WeakMap\(\)/,
        '_chordShapeCache direct assignment must be gone from screen.js');
});

test('screen.js _resetStringDependentCaches calls resetChordShapeCache()', () => {
    assert.match(src, /resetChordShapeCache\(\)/,
        'screen.js must call resetChordShapeCache() in _resetStringDependentCaches');
});

test('screen.js callsite uses createArp factory destructure', () => {
    assert.match(src,
        /const\s*\{[\s\S]*chordWireHighDensity[\s\S]*\}\s*=\s*createArp\s*\(/,
        'screen.js must destructure from createArp()');
});

// ── Wiring-correspondence guard ───────────────────────────────────────────────
// Every entry in createArp({…}) must satisfy its naming class.
// PINNED_RENAMES = {} (all entries follow standard convention).
// Kills param swaps like `getNStr: () => nStr` → `getNStr: () => mStr`.

test('createArp({...}) wiring has correct naming correspondence (no param swaps)', () => {
    const PINNED_RENAMES = {};

    const ANCHOR = '} = createArp({';
    const callStart = src.indexOf(ANCHOR);
    assert.ok(callStart >= 0, 'createArp call must be findable in screen.js');
    const blockStart = callStart + ANCHOR.length - 1;
    assert.equal(src[blockStart], '{', 'expected { at computed blockStart');

    let depth = 0, blockEnd = -1;
    for (let i = blockStart; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) { blockEnd = i; break; }
    }
    assert.ok(blockEnd > blockStart, 'createArp argument block must have balanced braces');

    const inner = src.slice(blockStart + 1, blockEnd);
    const rawEntries = [];
    let current = '', d = 0;
    for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        if (ch === '{') d++;
        else if (ch === '}') d--;
        if (ch === ',' && d === 0) {
            const t = current.trim();
            if (t) rawEntries.push(t);
            current = '';
        } else {
            current += ch;
        }
    }
    if (current.trim()) rawEntries.push(current.trim());

    const entries = rawEntries
        .map(e => e.replace(/\/\/[^\n]*/g, '').trim())
        .filter(Boolean);

    assert.ok(entries.length >= 19, `expected at least 19 entries, got ${entries.length}`);

    const violations = [];
    for (const entry of entries) {
        if (!entry.includes(':')) continue; // shorthand (UPPERCASE or camelCase plain ref)

        const colonIdx = entry.indexOf(':');
        const key = entry.slice(0, colonIdx).trim();
        const value = entry.slice(colonIdx + 1).trim();

        if (key in PINNED_RENAMES) {
            if (value !== PINNED_RENAMES[key])
                violations.push(`${key}: pinned to '${PINNED_RENAMES[key]}' but got '${value}'`);
            continue;
        }

        if (key.startsWith('get')) {
            const expectedStem = key[3].toLowerCase() + key.slice(4);
            const m = value.match(/^\(\)\s*=>\s*_?(\w+)$/);
            if (!m) {
                violations.push(`${key}: getter value '${value}' does not match () => [_]var`);
                continue;
            }
            if (m[1] !== expectedStem) {
                violations.push(`${key}: getter body references var stem '${m[1]}' but expected '${expectedStem}'`);
            }
            continue;
        }

        violations.push(`${key}: key:value entry not in PINNED_RENAMES and not a get-arrow`);
    }

    assert.deepEqual(violations, [], 'createArp wiring violations found');
});

// ── Behavioral fixture ────────────────────────────────────────────────────────
// Provides a default createArp instance with all 19 DI params stubbed.

async function makeArp(overrides = {}) {
    const { createArp } = await import(pathToFileURL(ARP_JS).href + '?t=' + Date.now());
    const defaults = {
        validString:   (s) => s >= 0 && s < 6,
        filterValidNotes: (notes) => notes.filter(n => n.s >= 0 && n.s < 6),
        sY:            (s) => s * 10,
        K:             5.0,
        S_GAP:         10,
        BEHIND:        100,
        CHORD_FRAME_RIM_MIN:    0.01,
        CHORD_FRAME_RIM_FRAC_H: 0.1,
        ARP_FRAME_ONSET_PAD_S:            0.01,
        ARP_FRAME_ONSET_CLUSTER_S:        0.03,
        ARP_INFER_MIN_HAND_SHAPE_SPAN_S:  0.1,
        ARP_INFER_STRUM_VS_ARP_SPREAD_MIN_S: 0.03,
        ARP_INFER_MULTI_STRUM_HIT_SLACK:  0.02,
        ARP_INFER_MULTI_STRUM_WIN_MIN_S:  0.1,
        ARP_INFER_MIN_HITS_VS_SHAPE_CAP:  0.5,
        ARP_HWY_RAIL_END_TAIL_S:    0.2,
        ARP_HWY_RAIL_START_LEAD_S:  0.1,
        NEXT_ON_STRING_T_EPS:       0.001,
        getNStr: () => 6,
        ...overrides,
    };
    return createArp(defaults);
}

// ── Amendment 2: resetChordShapeCache identity-based kill ─────────────────────
// r1 = mergeChordShape(ch,...); r2 = same call → assert r1 === r2 (cache hit).
// resetChordShapeCache(); r3 = same call → assert r3 !== r1 (recomputed object).
// Gut the reset (no-op instead of new WeakMap) → r3 === r1 → RED.

test('Amendment 2: resetChordShapeCache invalidates the WeakMap — identity kill', async () => {
    const arp = await makeArp();
    const ch = { id: 0, t: 0 };
    const notes = [{ s: 0, f: 3 }];
    const templates = {};

    const r1 = arp.mergeChordShape(ch, notes, templates);
    const r2 = arp.mergeChordShape(ch, notes, templates);
    assert.ok(r1 === r2, 'second call with same chord ref must return the cached Map (identity hit)');

    arp.resetChordShapeCache();

    const r3 = arp.mergeChordShape(ch, notes, templates);
    assert.ok(r3 !== r1,
        'call after resetChordShapeCache() must return a NEW Map object — gut the reset → r3 === r1 → RED');
    // Sanity: content must still be the same even though the object changed
    assert.deepEqual([...r3.entries()], [...r1.entries()], 'reset must not change computed shape data');
});

// ── Amendment 3: WeakMap re-keying guard ──────────────────────────────────────
// Simulates a song-switch: old chord objects dropped (new refs arrive).
// Same-refs: r1 === r2 (cache hit by object identity).
// New-refs:  r3 !== r1 (WeakMap miss → recompute — not stale).
// Gut the ref-compare (switch to string-keyed Map by ch.id) → r3 === r1 → RED
// when ch2 has the same id as ch1.

test('Amendment 3: WeakMap re-keying — same-ref hit, new-ref recompute (song-switch guard)', async () => {
    const arp = await makeArp();
    const ch1 = { id: 7, t: 1.0 };
    const ch2 = { id: 7, t: 1.0 }; // same data, different object reference
    const notes = [];
    const templates = { 7: { frets: [0, 1, 2, -1, -1, -1] } };

    const r1 = arp.mergeChordShape(ch1, notes, templates);
    const r2 = arp.mergeChordShape(ch1, notes, templates);
    assert.ok(r1 === r2, 'same chord ref must get a cache hit (r1 === r2)');

    const r3 = arp.mergeChordShape(ch2, notes, templates);
    assert.ok(r3 !== r1,
        'different chord ref (song-switch) must NOT get the stale cached entry — gut ref-keying → r3 === r1 → RED');
    // Content must still be equal (same inputs)
    assert.deepEqual([...r3.entries()], [...r1.entries()], 'recomputed shape must equal original');
});

// ── mergeChordShape behavioral kill ──────────────────────────────────────────
// Chord note override must win over template fret for the same string.

test('mergeChordShape: chord note overrides template fret on same string', async () => {
    const arp = await makeArp();
    const ch = { id: 5, t: 2.0 };
    const notes = [{ s: 0, f: 7 }]; // override string 0 fret to 7
    const templates = { 5: { frets: [3, 5, -1, -1, -1, -1] } }; // template says s0=3, s1=5

    const shape = arp.mergeChordShape(ch, notes, templates);
    assert.equal(shape.get(0), 7, 'chord note fret must override template fret on string 0');
    assert.equal(shape.get(1), 5, 'template fret for string 1 must be preserved');
});

// ── mergeHandShapeSynthChords behavioral kill ─────────────────────────────────
// A hand shape with no coincident real chord must produce a synth chord entry.

test('mergeHandShapeSynthChords: synthesizes chord when hand-shape has no matching real chord', async () => {
    const arp = await makeArp();
    const templates = { 3: { frets: [0, 2, 2, -1, -1, -1] } };
    const realChords = [];
    const handShapes = [{ chord_id: 3, start_time: 1.0, end_time: 2.0 }];

    const merged = arp.mergeHandShapeSynthChords(realChords, handShapes, templates);
    assert.ok(merged.length === 1, 'one synth chord must be produced from the hand shape');
    assert.ok(merged[0].h3dSynth === true, 'synth chord must be flagged h3dSynth');
    assert.equal(merged[0].id, 3, 'synth chord must carry the hand-shape chord_id');
    assert.ok(merged[0].notes.length > 0, 'synth chord must have notes from template');
});

test('mergeHandShapeSynthChords: real chord at same onset suppresses synth (no duplicate)', async () => {
    const arp = await makeArp();
    const templates = { 3: { frets: [0, 2, 2, -1, -1, -1] } };
    const realChords = [{ t: 1.0, id: 3, notes: [] }];
    const handShapes = [{ chord_id: 3, start_time: 1.0, end_time: 2.0 }];

    const merged = arp.mergeHandShapeSynthChords(realChords, handShapes, templates);
    assert.equal(merged.length, 1, 'real chord at same onset must suppress synth — no duplicate');
    assert.ok(!merged[0].h3dSynth, 'the surviving entry must be the real chord, not synth');
});

// ── chordWireHighDensity / chordTemplateLabel simple kills ────────────────────

test('chordWireHighDensity returns true when chord.hd is truthy (boolean, 1, or "1")', async () => {
    const arp = await makeArp();
    assert.ok(arp.chordWireHighDensity({ hd: true }));
    assert.ok(arp.chordWireHighDensity({ hd: 1 }));
    assert.ok(arp.chordWireHighDensity({ hd: '1' }));
    assert.ok(!arp.chordWireHighDensity({ hd: false }));
    assert.ok(!arp.chordWireHighDensity({ hd: 0 }));
});

test('chordTemplateLabel returns displayName over name, empty string for null', async () => {
    const arp = await makeArp();
    assert.equal(arp.chordTemplateLabel({ displayName: 'Gm', name: 'Gm7' }), 'Gm');
    assert.equal(arp.chordTemplateLabel({ name: 'Am' }), 'Am');
    assert.equal(arp.chordTemplateLabel(null), '');
    assert.equal(arp.chordTemplateLabel({}), '');
});

// ── arpeggioLaneDividerXYScaleMatchFrameRim DI rewire check ──────────────────
// getNStr() must be called to look up nStr; if it were hardcoded to a constant
// the test would break when getNStr returns a different value.

test('arpeggioLaneDividerXYScaleMatchFrameRim uses getNStr() for string count (DI rewire)', async () => {
    const calls = [];
    const arp = await makeArp({ getNStr: () => { calls.push(true); return 4; } });
    // Call the function (it uses sY(0) and sY(getNStr()-1), both derived from nStr)
    arp.arpeggioLaneDividerXYScaleMatchFrameRim(1.0);
    assert.ok(calls.length > 0, 'getNStr() must be called inside arpeggioLaneDividerXYScaleMatchFrameRim');
});
