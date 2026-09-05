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

// Toby r1 findings: camBaseDistU, camLowFretPullbackU, _makeGaussTex had no
// class-killer tests. Each test below names the concrete mutation it catches.

test('camBaseDistU clamps span to minimum 4 — span=0 gives 77 not 65', async () => {
    // Mutation: Math.max(span,4) → span
    // camBaseDistU(0) mutant = 65+0*3 = 65 (wrong); original = 65+4*3 = 77
    const { camBaseDistU } = await import(GEOMETRY_JS);
    assert.strictEqual(camBaseDistU(0),  77, 'span=0: floor=4 so 65+4*3=77, not 65');
    assert.strictEqual(camBaseDistU(10), 95, 'span=10: 65+10*3=95');
});

test('camLowFretPullbackU is clamped to zero — high fret gives 0 not negative', async () => {
    // Mutation: drop Math.max(0,...) clamp
    // camLowFretPullbackU(10) mutant = (5-10)*4 = -20 (wrong); original = 0
    const { camLowFretPullbackU } = await import(GEOMETRY_JS);
    assert.strictEqual(camLowFretPullbackU(0),  20, 'fret 0: (5-0)*4=20');
    assert.strictEqual(camLowFretPullbackU(5),   0, 'fret 5: (5-5)*4=0');
    assert.strictEqual(camLowFretPullbackU(10),  0, 'fret 10: clamped to 0, not -20');
});

// ── Cut 1b class-killers ───────────────────────────────────────────────────────

test('RENDER_ORDER_LAYER_STACK has 17 layers with CHORD_FILL first and CHORD_FRET_LABEL last', async () => {
    const { RENDER_ORDER_LAYER_STACK } = await import(GEOMETRY_JS);
    assert.strictEqual(RENDER_ORDER_LAYER_STACK.length, 17, 'stack must have exactly 17 layers');
    assert.strictEqual(RENDER_ORDER_LAYER_STACK[0], 'CHORD_FILL', 'first layer must be CHORD_FILL');
    assert.strictEqual(RENDER_ORDER_LAYER_STACK[RENDER_ORDER_LAYER_STACK.length - 1], 'CHORD_FRET_LABEL', 'last layer must be CHORD_FRET_LABEL');
});

test('RENDER_ORDER_LAYER_INDEX maps CHORD_FILL to 0 and NOTE_CORE to 10', async () => {
    // Mutation: wrong layer order → NOTE_CORE would not map to 10.
    const { RENDER_ORDER_LAYER_INDEX } = await import(GEOMETRY_JS);
    assert.strictEqual(RENDER_ORDER_LAYER_INDEX['CHORD_FILL'], 0, 'CHORD_FILL must be index 0 (bottom of stack)');
    assert.strictEqual(RENDER_ORDER_LAYER_INDEX['NOTE_CORE'], 10, 'NOTE_CORE must be index 10');
});

test('renderOrderForLayerAtZ applies the far clamp — worldZ=-5 gives 50 not 33', async () => {
    // Mutation: remove Math.max(RENDER_ORDER_FAR_CLAMP, ...) clamp.
    // K=2.25/300=0.0075; Math.round(700+(-5)/0.0075)=Math.round(33.33)=33; max(50,33)=50.
    // Without clamp: 33 + 0/17 ≈ 33. Test pins the clamped value.
    const { renderOrderForLayerAtZ } = await import(GEOMETRY_JS);
    assert.strictEqual(renderOrderForLayerAtZ(-5, 'CHORD_FILL'), 50, 'far objects must be clamped to RENDER_ORDER_FAR_CLAMP=50');
});

test('renderOrderForLayerAtZ throws for unknown layer names', async () => {
    const { renderOrderForLayerAtZ } = await import(GEOMETRY_JS);
    assert.throws(() => renderOrderForLayerAtZ(0, 'NONEXISTENT'), /Unknown 3D highway depth layer/);
});

test('_noteKey integer-truncates float times — _noteKey(1.5, 3) is 150003 not 150008', async () => {
    // Mutation: drop |0 → (15000.5)*10+3 = 150008.
    const { _noteKey } = await import(GEOMETRY_JS);
    assert.strictEqual(_noteKey(1.5, 3), 150003, '|0 truncation must give 150003, not float-derived 150008');
    assert.strictEqual(_noteKey(0, 0), 0);
});

test('lowerBoundT returns first index where arr[i].t >= t (strict lower bound)', async () => {
    // Mutation: < → <= causes lowerBoundT([{t:1},{t:3},{t:5}], 3) → 2 instead of 1.
    const { lowerBoundT } = await import(GEOMETRY_JS);
    const arr = [{ t: 1 }, { t: 3 }, { t: 5 }];
    assert.strictEqual(lowerBoundT(arr, 3), 1, 'strict lower-bound: first index where .t >= 3 is 1 (not 2)');
    assert.strictEqual(lowerBoundT(arr, 0), 0, 'value before all: must return 0');
    assert.strictEqual(lowerBoundT(arr, 6), 3, 'value after all: must return length');
});

test('hwyFirstRelevantFrettedTime returns null for empty/all-open input', async () => {
    const { hwyFirstRelevantFrettedTime } = await import(GEOMETRY_JS);
    assert.strictEqual(hwyFirstRelevantFrettedTime([], [], 0, 0.2, 6), null);
});

test('geoFretMid returns -2K sentinel for f<=0, positive for f=1', async () => {
    // Mutation: drop f<=0 guard → geoFretMid(0, true) returns (0+0)/2=0, not -0.015.
    const { geoFretMid } = await import(GEOMETRY_JS);
    const K = 2.25 / 300;
    assert.ok(Math.abs(geoFretMid(0, true) - (-2 * K)) < 1e-10, 'f=0 must return -2K sentinel (≈-0.015)');
    assert.ok(geoFretMid(1, true) > 0, 'f=1 must return positive X');
    // In uniform mode: geoFretX(0,true)=0, geoFretX(1,true)=step, so mid=step/2.
    // geoFretMid(2,true) = (step+2step)/2 = 1.5step. Ratio 3 catches wrong f offset.
    assert.ok(Math.abs(geoFretMid(2, true) / geoFretMid(1, true) - 3) < 1e-9, 'uniform mid(2)/mid(1) must equal 3');
});

test('_makeGaussTex peak alpha is 255 at the centre pixel', async () => {
    // Mutation: default sigma changed to 0 → (u-0.5)/0 = NaN chain → all Uint8Array writes
    // become 0 (TypedArray coerces NaN to 0). Test calls without explicit sigma so the
    // default is exercised directly — changing the default is what is being guarded.
    // Use odd width=3: i=1 gives u=0.5 exactly (d=(u-0.5)/sigma=0, peak=1, alpha=255).
    const { _makeGaussTex } = await import(GEOMETRY_JS);
    let capturedData;
    const ThreeStub = {
        DataTexture: class { constructor(d) { capturedData = d; } },
        RGBAFormat: 1,
        LinearFilter: 2,
    };
    _makeGaussTex(ThreeStub, 3); // no sigma arg — exercises the default (0.28)
    // Pixel i=1: RGBA layout [4,5,6,7]; alpha is at index 7
    assert.strictEqual(capturedData[7], 255, 'centre pixel (i=1 of w=3) alpha must be 255 at default sigma');
});
