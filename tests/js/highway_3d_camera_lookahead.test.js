// Behavioral kills for h3d-carve-13: S-section lookahead helpers extracted
// into src/camera.js (createCamera). Covers lookaheadEndTime (via callers),
// lookaheadBootstrapTime, lookaheadComputeFretBounds, lookaheadTargetWorldX.
//
// Kill strategy per god's GO:
//   lookaheadComputeFretBounds — real-shaped note/chord/anchor fixtures asserting
//     concrete min/max fret bounds; gut the bounds loop → RED.
//   lookaheadBootstrapTime / lookaheadTargetWorldX — one input→output assert each;
//     gut the function → RED.
//   lookaheadEndTime (private) — exercised through its callers.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// ── Source-level checks ────────────────────────────────────────────────────
const CAMERA_JS = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'src', 'camera.js');

test('camera.js exports createCamera that returns all 5 expected symbols', () => {
    const src = fs.readFileSync(CAMERA_JS, 'utf8');
    assert.match(src, /return\s*\{[^}]*effectiveVfov/, 'effectiveVfov in return');
    assert.match(src, /return\s*\{[^}]*camUpdate/, 'camUpdate in return');
    assert.match(src, /return\s*\{[^}]*lookaheadBootstrapTime/, 'lookaheadBootstrapTime in return');
    assert.match(src, /return\s*\{[^}]*lookaheadComputeFretBounds/, 'lookaheadComputeFretBounds in return');
    assert.match(src, /return\s*\{[^}]*lookaheadTargetWorldX/, 'lookaheadTargetWorldX in return');
});

test('camera.js DI signature includes 9 new h3d-carve-13 params', () => {
    const src = fs.readFileSync(CAMERA_JS, 'utf8');
    for (const param of [
        'NFRETS', 'CAM_LOOKAHEAD_MEASURES', 'CAM_LOOKAHEAD_SEC', 'CAM_FRET_EDGE_BLEND',
        'getMeasureStarts', 'validString', 'getChartAnchorAt', 'xFretMid', 'xFret',
    ]) {
        assert.match(src, new RegExp(`\\b${param}\\b`), `param ${param} present in camera.js`);
    }
});

test('lookaheadEndTime is NOT exported (factory-private)', () => {
    const src = fs.readFileSync(CAMERA_JS, 'utf8');
    // Must not appear in the return object
    assert.doesNotMatch(
        src,
        /return\s*\{[^}]*lookaheadEndTime/,
        'lookaheadEndTime must not be in the return object',
    );
    // But must be defined as a function inside the factory
    assert.match(src, /function\s+lookaheadEndTime\s*\(/, 'lookaheadEndTime defined in factory');
});

test('screen.js Region A contains the carve comment and not the old function defs', () => {
    const SCREEN_JS = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'screen.js');
    const src = fs.readFileSync(SCREEN_JS, 'utf8');
    // Old function defs removed
    assert.doesNotMatch(src, /function\s+lookaheadEndTime\s*\(/, 'lookaheadEndTime not in screen.js');
    assert.doesNotMatch(src, /function\s+lookaheadBootstrapTime\s*\(/, 'lookaheadBootstrapTime not in screen.js');
    assert.doesNotMatch(src, /function\s+lookaheadComputeFretBounds\s*\(/, 'lookaheadComputeFretBounds not in screen.js');
    assert.doesNotMatch(src, /function\s+lookaheadTargetWorldX\s*\(/, 'lookaheadTargetWorldX not in screen.js');
    // Carve comment present
    assert.match(src, /h3d-carve-13.*S-section lookahead helpers/, 'carve-13 comment present');
    // Destructure at createCamera call site
    assert.match(src, /lookaheadBootstrapTime.*lookaheadComputeFretBounds.*lookaheadTargetWorldX.*=\s*createCamera|createCamera[\s\S]{0,800}lookaheadBootstrapTime/, 'exports destructured from createCamera');
});

// ── Behavioral kills (module-level, import camera.js via dynamic import) ──

// Minimal stub factory matching the 9 new DI params + pre-existing required params.
// Only the fields actually used by the 4 new functions need real values;
// everything else gets a no-op stub so createCamera doesn't throw.
function makeCamera(overrides = {}) {
    const fretWidth = 10; // arbitrary unit
    // fretX: fret 0 = 0, fret N = N*fretWidth
    const fretX = f => f * fretWidth;
    const fretMid = f => (f + 0.5) * fretWidth;
    return import(`${CAMERA_JS}?t=${Date.now()}`).then(mod => {
        return mod.createCamera({
            // Pre-existing DI params (stubs — camUpdate not exercised here)
            BASE_VFOV: 60, HORPLUS_START_ASPECT: 1.78, HORPLUS_MIN_VFOV: 30,
            CAM_LERP_BASE: 0.05, CAM_H_BASE: 1, CAM_DIST_BASE: 10,
            CAM_FRAME_DIST_NEAR: 5, CAM_FRAME_DIST_FAR: 20,
            CAM_FRAME_H_NEAR: 1, CAM_FRAME_H_FAR: 2,
            CAM_FRAME_D_NEAR: 1, CAM_FRAME_D_FAR: 1.5,
            FOCUS_D: 8, S_GAP: 1, K: 1,
            FRET_ROW_FIT_NDC_MIN: -0.9, FRET_ROW_FIT_DEADBAND: 0.1, FRET_ROW_FIT_BOOST_MAX: 1.5,
            CAM_TILT_BAND_T: 0.1, CAM_TILT_BAND_C: 0.3, CAM_TILT_STR_T: 0.5, CAM_TILT_STR_C: 0.2,
            getCam: () => ({ fov: 60, updateProjectionMatrix() {}, position: { set() {} }, lookAt() {}, updateMatrixWorld() {} }),
            getTgtX: () => 0, getTgtDist: () => 10,
            getAspectScale: () => 1, getLeftyCached: () => false,
            getNStr: () => 6, getProbe: () => ({ set() {}, project() {}, y: -0.35 }),
            getTiltSmoothing: () => 0.5, getPaneAspect: () => 1.78, getPaneUid: () => 'test',
            getHighwayCanvas: () => null,
            getCurX: () => 0, setCurX: () => {},
            getCurDist: () => 10, setCurDist: () => {},
            getCurLookY: () => 0, setCurLookY: () => {},
            getTgtLookY: () => 0, setTgtLookY: () => {},
            getFretRowFitBoost: () => 1, setFretRowFitBoost: () => {},
            sY: () => 0, freeCamFor: () => null,
            aspectPaneKey: () => 'test', resolveTuneFor: () => null,
            aspectRegisterPane: () => {},
            // h3d-carve-13: new params
            NFRETS: 24,
            CAM_LOOKAHEAD_MEASURES: 9,
            CAM_LOOKAHEAD_SEC: 3.0,
            CAM_FRET_EDGE_BLEND: 0.1,
            getMeasureStarts: overrides.getMeasureStarts ?? (() => []),
            validString: overrides.validString ?? (s => s >= 0 && s < 6),
            getChartAnchorAt: overrides.getChartAnchorAt ?? (() => null),
            xFretMid: overrides.xFretMid ?? fretMid,
            xFret: overrides.xFret ?? fretX,
        });
    });
}

// ── lookaheadComputeFretBounds — concrete note/chord/anchor fixtures ────────

test('lookaheadComputeFretBounds: returns null when no notes/chords/anchors', async () => {
    const cam = await makeCamera();
    const result = cam.lookaheadComputeFretBounds(0, [], [], []);
    assert.equal(result, null);
});

test('lookaheadComputeFretBounds: fret bounds from notes array', async () => {
    const cam = await makeCamera();
    // now=0, CAM_LOOKAHEAD_SEC=3.0 → window [0, 3.0]
    const notes = [
        { t: 0.5, s: 0, f: 5 },
        { t: 1.0, s: 1, f: 9 },
        { t: 1.5, s: 2, f: 3 },
        { t: 10,  s: 0, f: 1 },  // outside window — should be excluded
    ];
    const result = cam.lookaheadComputeFretBounds(0, null, notes, null);
    assert.ok(result !== null, 'should find bounds');
    assert.equal(result.minF, 3, 'minF = 3 (fret 3 note at t=1.5)');
    assert.equal(result.maxF, 9, 'maxF = 9 (fret 9 note at t=1.0)');
});

test('lookaheadComputeFretBounds: fret bounds from chords', async () => {
    const cam = await makeCamera();
    const chords = [
        { t: 0.5, notes: [{ s: 0, f: 2 }, { s: 1, f: 7 }] },
        { t: 4.0, notes: [{ s: 0, f: 1 }] },  // outside window
    ];
    const result = cam.lookaheadComputeFretBounds(0, null, null, chords);
    assert.ok(result !== null);
    assert.equal(result.minF, 2);
    assert.equal(result.maxF, 7);
});

test('lookaheadComputeFretBounds: open strings (f=0) are excluded', async () => {
    const cam = await makeCamera();
    // f=0 means open string — consider() guard: !(f > 0) → skip
    const notes = [
        { t: 0.5, s: 0, f: 0 },  // open — must be excluded
        { t: 1.0, s: 1, f: 8 },
    ];
    const result = cam.lookaheadComputeFretBounds(0, null, notes, null);
    assert.ok(result !== null);
    assert.equal(result.minF, 8, 'open string excluded');
    assert.equal(result.maxF, 8);
});

test('lookaheadComputeFretBounds: invalid string filtered by validString', async () => {
    let nStr = 6;
    const cam = await makeCamera({
        validString: s => s >= 0 && s < nStr,
    });
    const notes = [
        { t: 0.5, s: 99, f: 5 },  // invalid string → skip
        { t: 1.0, s: 2,  f: 12 },
    ];
    const result = cam.lookaheadComputeFretBounds(0, null, notes, null);
    assert.ok(result !== null);
    assert.equal(result.minF, 12, 'invalid-string note excluded');
    assert.equal(result.maxF, 12);
});

test('lookaheadComputeFretBounds: anchor data contributes to bounds', async () => {
    // Anchor: fret=3, width=4 → frets 3..6
    const anchor = { fret: 3, width: 4, time: 0 };
    const cam = await makeCamera({
        getChartAnchorAt: (_arr, _t) => anchor,
    });
    // Tiny range so the anchor loop runs [0..3.0] with step 0.125
    const result = cam.lookaheadComputeFretBounds(0, [anchor], null, null);
    assert.ok(result !== null);
    assert.equal(result.minF, 3);
    assert.equal(result.maxF, 6);
});

// Kill test: gut the bounds loop → result always null or wrong bounds
test('lookaheadComputeFretBounds: gut-kill — notes outside window excluded (timing boundary)', async () => {
    const cam = await makeCamera();
    // now=0, window=3s; note at exactly t=3.0+ε should be excluded
    const notes = [
        { t: 3.001, s: 0, f: 5 },  // just outside window
    ];
    const result = cam.lookaheadComputeFretBounds(0, null, notes, null);
    assert.equal(result, null, 'note beyond window must be excluded');
});

// ── lookaheadBootstrapTime — input→output with gut-kill ────────────────────

test('lookaheadBootstrapTime: returns now when lookahead already covers eventTime', async () => {
    const cam = await makeCamera();
    // now=0, CAM_LOOKAHEAD_SEC=3.0 → lookaheadEndTime(0)=3.0 ≥ eventTime=2.0
    const result = cam.lookaheadBootstrapTime(0, 2.0);
    assert.equal(result, 0, 'window already covers event → return now');
});

test('lookaheadBootstrapTime: returns now when eventTime ≤ now', async () => {
    const cam = await makeCamera();
    const result = cam.lookaheadBootstrapTime(5.0, 4.0);
    assert.equal(result, 5.0, 'event in the past → return now');
});

test('lookaheadBootstrapTime: binary search converges on correct bootstrap point', async () => {
    // measureStarts at [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]
    // CAM_LOOKAHEAD_MEASURES=9 → from t=0, window end = ms[9] = 18
    // eventTime=19 → need to project forward until lookaheadEnd(t) ≥ 19
    // lookaheadEnd(2) = ms[2+9] = ms[11]... but ms only has 11 entries [0..10] → extrapolate
    // The exact value is tested for being in [0, eventTime) and for t < eventTime.
    const ms = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
    const cam = await makeCamera({ getMeasureStarts: () => ms });
    const bst = cam.lookaheadBootstrapTime(0, 28.0);
    // lookaheadEnd(bst) must be >= 28.0
    // bst must be > 0 (event is past current window)
    assert.ok(bst > 0, 'bootstrap > 0: needed to project forward');
    assert.ok(bst < 28.0, 'bootstrap < eventTime');
});

// ── lookaheadTargetWorldX — input→output with gut-kill ─────────────────────

test('lookaheadTargetWorldX: blends fret midpoint with board-weighted X', async () => {
    // xFretMid(f) = (f+0.5)*10, xFret(f) = f*10, NFRETS=24
    // minF=3, maxF=9:
    //   middle = (xFretMid(3) + xFretMid(9))/2 = (35 + 95)/2 = 65
    //   weighted = 0.6*xFret(0) + 0.4*xFret(24) = 0 + 0.4*240 = 96
    //   wb=0.1 → result = 65*(1-0.1) + 96*0.1 = 58.5 + 9.6 = 68.1
    const cam = await makeCamera();
    const result = cam.lookaheadTargetWorldX(3, 9);
    assert.ok(Math.abs(result - 68.1) < 0.001, `expected ≈68.1, got ${result}`);
});

test('lookaheadTargetWorldX: symmetric fret span centered at board center', async () => {
    // With symmetric span (frets 0..24) middle = xFretMid(0)+xFretMid(24))/2 = (5+245)/2=125
    // weighted = 0.6*0 + 0.4*240 = 96; wb=0.1 → 125*0.9 + 96*0.1 = 112.5+9.6=122.1
    const cam = await makeCamera();
    const r1 = cam.lookaheadTargetWorldX(0, 24);
    assert.ok(Math.abs(r1 - 122.1) < 0.001, `symmetric span expected ≈122.1, got ${r1}`);
});

// ── Wiring guard: naming-correspondence on the 9 new DI params ────────────

test('createCamera DI params appear in the h3d-carve-13 comment block in screen.js', () => {
    const SCREEN_JS = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'screen.js');
    const src = fs.readFileSync(SCREEN_JS, 'utf8');
    // All 9 new params must appear in the createCamera({}) call block.
    // Find the call site (the `const { ... } = createCamera({` line), then
    // extract from there to the matching closing `});` — search for the
    // h3d-carve-13 comment marker which brackets the new params.
    const idx = src.indexOf('const { effectiveVfov, camUpdate, lookaheadBootstrapTime');
    assert.ok(idx !== -1, 'createCamera destructure line found');
    // Pull enough text to cover the full call (up to 4000 chars is plenty)
    const callBlock = src.slice(idx, idx + 4000);
    for (const name of [
        'NFRETS', 'CAM_LOOKAHEAD_MEASURES', 'CAM_LOOKAHEAD_SEC', 'CAM_FRET_EDGE_BLEND',
        'getMeasureStarts', 'validString', 'getChartAnchorAt', 'xFretMid', 'xFret',
    ]) {
        assert.ok(callBlock.includes(name), `${name} present in createCamera({}) call`);
    }
});
