// Class-killer for src/geometry.js — h3d-carve-1.
//
// Uses dynamic import() (not the vm source-scan pattern) so Node actually
// evaluates the ES module and its exports are the real runtime values.
// A refactor that renames geoFretX, changes the uniform/logarithmic
// decision, removes slideTrailEnd, or breaks computeBPM's BPM estimate
// would be caught here before any other test.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const GEOMETRY_JS = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'src', 'geometry.js');

test('geoFretX returns 0 for fret 0 in both modes', async () => {
    const { geoFretX } = await import(GEOMETRY_JS);
    assert.strictEqual(geoFretX(0, true),  0, 'uniform: fret 0 must be 0');
    assert.strictEqual(geoFretX(0, false), 0, 'logarithmic: fret 0 must be 0');
});

test('geoFretX uniform spacing is linear — fret N is N × fret 1', async () => {
    const { geoFretX } = await import(GEOMETRY_JS);
    const step = geoFretX(1, true);
    assert.ok(step > 0, 'uniform step must be positive');
    assert.ok(Math.abs(geoFretX(5, true) - 5 * step) < 1e-9, 'fret 5 must be 5 × step');
    assert.ok(Math.abs(geoFretX(12, true) - 12 * step) < 1e-9, 'fret 12 must be 12 × step');
});

test('geoFretX logarithmic spacing is non-linear — frets compress toward the bridge', async () => {
    const { geoFretX } = await import(GEOMETRY_JS);
    const d1 = geoFretX(1, false);
    const d2 = geoFretX(2, false) - geoFretX(1, false);
    const d3 = geoFretX(3, false) - geoFretX(2, false);
    assert.ok(d1 > d2, 'fret 1 gap must be wider than fret 2 gap (compression toward bridge)');
    assert.ok(d2 > d3, 'fret 2 gap must be wider than fret 3 gap');
});

test('geoFretX uniform and logarithmic agree at fret 24 (total board width)', async () => {
    const { geoFretX } = await import(GEOMETRY_JS);
    // By construction: _fretXUniStep = _fretXLog(24) / 24, so geoFretX(24, uniform)
    // equals geoFretX(24, logarithmic). This is the board-width invariant.
    const uniWidth = geoFretX(24, true);
    const logWidth = geoFretX(24, false);
    assert.ok(Math.abs(uniWidth - logWidth) < 1e-9, 'board width must be identical in both modes');
});

test('dZ converts positive dt to a negative Z delta', async () => {
    const { dZ } = await import(GEOMETRY_JS);
    assert.ok(dZ(1) < 0, 'positive time delta must produce negative Z (notes travel toward camera)');
    assert.ok(dZ(0) === 0, 'zero dt must produce zero dZ');
    assert.ok(Math.abs(dZ(2) / dZ(1) - 2) < 1e-9, 'dZ must be linear in dt');
});

test('slideTrailEnd returns null for notes with no slide fields', async () => {
    const { slideTrailEnd } = await import(GEOMETRY_JS);
    assert.strictEqual(slideTrailEnd({}), null);
    assert.strictEqual(slideTrailEnd({ sl: -1 }), null, 'negative sl must be ignored');
});

test('slideTrailEnd prefers sl over slu and marks pitched/unpitched correctly', async () => {
    const { slideTrailEnd } = await import(GEOMETRY_JS);
    assert.deepStrictEqual(slideTrailEnd({ sl: 7 }),         { endFret: 7, unpitched: false });
    assert.deepStrictEqual(slideTrailEnd({ slu: 5 }),        { endFret: 5, unpitched: true });
    assert.deepStrictEqual(slideTrailEnd({ sl: 7, slu: 5 }), { endFret: 7, unpitched: false });
});

test('computeBPM returns 120 for degenerate inputs', async () => {
    const { computeBPM } = await import(GEOMETRY_JS);
    assert.strictEqual(computeBPM(null, 0), 120);
    assert.strictEqual(computeBPM([], 0),   120);
    assert.strictEqual(computeBPM([{ time: 0 }], 0), 120, 'single beat has no interval');
});

test('computeBPM estimates 120 BPM from evenly-spaced beats', async () => {
    const { computeBPM } = await import(GEOMETRY_JS);
    // 120 BPM = 0.5 s per beat
    const beats = [0, 0.5, 1.0, 1.5, 2.0].map(time => ({ time }));
    const bpm = computeBPM(beats, 1.0);
    assert.ok(Math.abs(bpm - 120) < 0.01, `expected ~120 BPM, got ${bpm}`);
});
