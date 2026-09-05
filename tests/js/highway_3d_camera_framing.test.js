// Pins the camera framing + lookahead behaviour in
// plugins/highway_3d/screen.js.
//
// Two independent pieces are covered:
//   1. Zoom-dependent framing — the cam.position height/depth multipliers are
//      interpolated by zoom distance between a NEAR (tight, nut-position) and a
//      FAR (wide, whole-neck) view via the CAM_FRAME_* constants, instead of
//      being fixed literals.
//   2. Measure-based lookahead — the camera lookahead window spans
//      CAM_LOOKAHEAD_MEASURES measures ahead (derived from the chart beats,
//      ignoring intra-measure measure === -1 beats) instead of a fixed number
//      of seconds.
//
// A refactor that re-hardcodes the framing multipliers, drops the measure
// cache, or reverts the lookahead window to seconds would silently regress the
// camera. Also guards that the temporary debug hook stayed removed.
//
// Source-level only — same strategy as the other tests/js/ files.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCREEN_JS = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'screen.js');
const RENDERER_JS = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'src', 'renderer.js');
// h3d-carve-15: U-section moved to renderer.js; scan both.
const src = fs.readFileSync(SCREEN_JS, 'utf8') + '\n' + fs.readFileSync(RENDERER_JS, 'utf8');
// h3d-carve-9: camUpdate body moved here; tests that pin its internals retarget to cameraSrc.
const CAMERA_JS = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'src', 'camera.js');
const cameraSrc = fs.readFileSync(CAMERA_JS, 'utf8');

// ── Zoom-dependent framing ──────────────────────────────────────────────────

test('framing NEAR/FAR multiplier constants are defined', () => {
    for (const name of [
        'CAM_FRAME_DIST_NEAR', 'CAM_FRAME_DIST_FAR',
        'CAM_FRAME_H_NEAR', 'CAM_FRAME_H_FAR',
        'CAM_FRAME_D_NEAR', 'CAM_FRAME_D_FAR',
    ]) {
        assert.match(src, new RegExp('const\\s+' + name + '\\s*='),
            `${name} must be declared as a framing constant`);
    }
});

test('cam.position uses interpolated framing multipliers, not literals', () => {
    // The height/depth multipliers are computed (_hMul / _dMul), not inlined.
    // The base position is assigned into _camX/_camY/_camZ so the opt-in
    // free-camera bridge (#771) can layer orbit/zoom/height on top before the
    // single cam.position.set; the multipliers must still feed _camY/_camZ.
    // h3d-carve-9: camUpdate (and these locals) moved to src/camera.js.
    assert.match(
        cameraSrc,
        /_camX\s*=\s*curX\s*\+\s*shoulderOffset\s*,\s*_camY\s*=\s*h\s*\*\s*_hMul\s*,\s*_camZ\s*=\s*dist\s*\*\s*_dMul/,
        'the base camera position must use the interpolated _hMul / _dMul multipliers',
    );
    assert.match(
        cameraSrc,
        /cam\.position\.set\(\s*_camX\s*,\s*_camY\s*,\s*_camZ\s*\)/,
        'cam.position.set must apply the computed _camX / _camY / _camZ',
    );
});

test('framing multipliers are a clamped zoom-distance interpolation', () => {
    // _zt is clamped to [0,1] and lerps each multiplier between NEAR and FAR.
    // h3d-carve-9: camUpdate (and these expressions) moved to src/camera.js.
    assert.match(
        cameraSrc,
        /Math\.max\(0,\s*Math\.min\(1,[\s\S]*?CAM_FRAME_DIST_NEAR[\s\S]*?CAM_FRAME_DIST_FAR/,
        '_zt must clamp (dist - NEAR)/(FAR - NEAR) into [0,1]',
    );
    assert.match(
        cameraSrc,
        /CAM_FRAME_H_NEAR\s*\+\s*\(\s*CAM_FRAME_H_FAR\s*-\s*CAM_FRAME_H_NEAR\s*\)\s*\*\s*_zt/,
        'height multiplier must lerp NEAR->FAR by _zt',
    );
    assert.match(
        cameraSrc,
        /CAM_FRAME_D_NEAR\s*\+\s*\(\s*CAM_FRAME_D_FAR\s*-\s*CAM_FRAME_D_NEAR\s*\)\s*\*\s*_zt/,
        'depth multiplier must lerp NEAR->FAR by _zt',
    );
});

// ── Measure-based lookahead window ──────────────────────────────────────────

test('lookahead window is expressed in measures with a seconds fallback', () => {
    assert.match(src, /const\s+CAM_LOOKAHEAD_MEASURES\s*=\s*9\b/,
        'CAM_LOOKAHEAD_MEASURES must default to 9');
    assert.match(src, /const\s+CAM_LOOKAHEAD_SEC\s*=\s*3\.0\b/,
        'CAM_LOOKAHEAD_SEC must stay as the no-beats fallback');
});

test('measure-start cache only keeps beats with measure >= 0', () => {
    // Intra-measure beats carry measure === -1 and must be skipped.
    // h3d-carve-15: bare _measureStarts = _ms → setMeasureStarts(_ms) in renderer.js
    assert.match(
        src,
        /Number\.isFinite\(\s*_b\.measure\s*\)\s*&&\s*_b\.measure\s*>=\s*0[\s\S]*?setMeasureStarts\s*\(\s*_ms\s*\)/,
        'only measure-start beats (measure >= 0) feed _measureStarts',
    );
});

test('lookaheadEndTime targets the measure CAM_LOOKAHEAD_MEASURES ahead', () => {
    // h3d-carve-13: lookaheadEndTime moved to src/camera.js — retarget to cameraSrc.
    assert.match(
        cameraSrc,
        /function\s+lookaheadEndTime\s*\(\s*now\s*\)/,
        'lookaheadEndTime(now) helper must exist',
    );
    assert.match(
        cameraSrc,
        /const\s+targetIdx\s*=\s*curIdx\s*\+\s*CAM_LOOKAHEAD_MEASURES/,
        'target measure index = current measure + CAM_LOOKAHEAD_MEASURES',
    );
    // No beats → seconds fallback.
    assert.match(
        cameraSrc,
        /if\s*\(\s*!ms\s*\|\|\s*ms\.length\s*===\s*0\s*\)\s*return\s+now\s*\+\s*CAM_LOOKAHEAD_SEC/,
        'lookaheadEndTime must fall back to seconds when there are no measures',
    );
});

test('fret-bounds scan drives its window off lookaheadEndTime, not fixed seconds', () => {
    // h3d-carve-13: lookaheadComputeFretBounds moved to src/camera.js — retarget to cameraSrc.
    assert.match(
        cameraSrc,
        /function\s+lookaheadComputeFretBounds[\s\S]*?const\s+tEnd\s*=\s*lookaheadEndTime\(\s*now\s*\)/,
        'lookaheadComputeFretBounds must derive tEnd from lookaheadEndTime(now)',
    );
});

test('measure-start cache is invalidated on song change', () => {
    // The song-change reset (reconnect path) resets _camSnapped; it must also
    // drop the measure-start cache, otherwise lookaheadEndTime sizes the window
    // off the previous song's measure grid and over-zooms the first-data snap.
    // h3d-carve-15: bare assignments → setter calls in renderer.js
    assert.match(
        src,
        /setCamSnapped\s*\(\s*false\s*\)\s*;[\s\S]*?setMeasureStarts\s*\(\s*\[\]\s*\)\s*;\s*setMeasureStartsRef\s*\(\s*null\s*\)\s*;/,
        'song-change reset must clear _measureStarts / _measureStartsRef alongside _camSnapped',
    );
});

// ── Fret-row fit guard ──────────────────────────────────────────────────────
// Keeps the heat-coloured fret-number row from clipping off the bottom edge
// when a tight, centred zoom (worst mid-neck) drops it below the lower-third
// framing. camUpdate dollies the camera back via a capped, hysteretic boost.

test('fret-row fit guard constants are defined', () => {
    for (const name of [
        'FRET_ROW_FIT_NDC_MIN', 'FRET_ROW_FIT_DEADBAND', 'FRET_ROW_FIT_BOOST_MAX',
    ]) {
        assert.match(src, new RegExp('const\\s+' + name + '\\s*='),
            `${name} must be declared as a fit-guard constant`);
    }
});

test('the curDist lerp target applies the fit-guard dolly boost', () => {
    // The span-driven tgtDist still owns zooming in; the boost only pulls back.
    // h3d-carve-9: camUpdate (and this expression) moved to src/camera.js.
    // tgtDist is DI-rewired to getTgtDist() direct call.
    assert.match(
        cameraSrc,
        /curDist\s*\+=\s*\(\s*getTgtDist\(\)\s*\*\s*_fretRowFitBoost\s*-\s*curDist\s*\)\s*\*\s*lerp/,
        'curDist must lerp toward getTgtDist() * _fretRowFitBoost',
    );
});

test('the guard projects the fret-row band and adjusts the boost with hysteresis', () => {
    // Row band Y mirrors the render position (sY(lowest) - S_GAP * 1.4).
    // h3d-carve-9: camUpdate (and this logic) moved to src/camera.js.
    assert.match(
        cameraSrc,
        /Math\.min\(\s*sY\(0\)\s*,\s*sY\(nStr\s*-\s*1\)\s*\)\s*-\s*S_GAP\s*\*\s*1\.4/,
        'the guard must probe the same row band the fret-number row is drawn at',
    );
    // Prompt pull-back when below the min, capped at BOOST_MAX.
    assert.match(
        cameraSrc,
        /_rowNdcY\s*<\s*FRET_ROW_FIT_NDC_MIN[\s\S]*?Math\.min\(\s*FRET_ROW_FIT_BOOST_MAX/,
        'below the min NDC the boost rises, capped at FRET_ROW_FIT_BOOST_MAX',
    );
    // Lazy relax only once past the deadband, floored at 1.
    assert.match(
        cameraSrc,
        /_rowNdcY\s*>\s*FRET_ROW_FIT_NDC_MIN\s*\+\s*FRET_ROW_FIT_DEADBAND[\s\S]*?Math\.max\(\s*1\s*,\s*_fretRowFitBoost/,
        'past the deadband the boost relaxes back toward 1',
    );
});

test('the fit guard yields to the free-cam (Camera Director)', () => {
    // When the free-cam owns the view the auto dolly must reset to 1, not fight it.
    // h3d-carve-9: camUpdate (and this guard) moved to src/camera.js.
    assert.match(
        cameraSrc,
        /if\s*\(\s*_freeCam\s*&&\s*_freeCam\.enabled\s*\)\s*\{\s*if\s*\(\s*_fretRowFitBoost\s*!==\s*1\s*\)\s*_fretRowFitBoost\s*=\s*1/,
        'with the free-cam enabled the guard must drop any auto dolly back to 1',
    );
});

// ── Debug hook stayed removed ───────────────────────────────────────────────

test('temporary camera debug hook is not present', () => {
    assert.doesNotMatch(src, /h3dCamDebug/,
        'the window.h3dCamDebug tuning hook must not ship in the renderer');
});
