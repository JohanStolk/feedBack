// Pins the fret-spacing setting in plugins/highway_3d/screen.js (PR #329).
// The board can render fret columns either Uniform (equal width, the chart
// Remastered style) or Logarithmic (real instrument geometry), switchable at
// runtime via window.h3dSetFretSpacing and persisted in localStorage. A
// refactor that renames the storage key, drops the delegator in fretX, or
// stops validating the mode would silently regress the setting.
//
// Since h3d-carve-1, the uniform/log branch lives in src/geometry.js
// (geoFretX); screen.js keeps a 1-arg delegator:
//   const fretX = f => geoFretX(f, _h3dFretUniform);
//
// Source-level only — same strategy as the other tests/js/ files.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCREEN_JS = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'screen.js');
const GEOMETRY_JS = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'src', 'geometry.js');

test('fret-spacing mode is read from the highway_3d.fretSpacing localStorage key', () => {
    const src = fs.readFileSync(SCREEN_JS, 'utf8');
    assert.match(
        src,
        /_h3dFretUniform\s*=\s*localStorage\.getItem\(\s*'highway_3d\.fretSpacing'\s*\)\s*!==\s*'logarithmic'/,
        'startup must read highway_3d.fretSpacing and treat anything but "logarithmic" as uniform',
    );
});

test('fretX is a 1-arg delegator to geoFretX in screen.js (h3d-carve-1)', () => {
    const src = fs.readFileSync(SCREEN_JS, 'utf8');
    assert.match(
        src,
        /const\s+fretX\s*=\s*f\s*=>\s*geoFretX\(\s*f\s*,\s*_h3dFretUniform\s*\)/,
        'screen.js fretX must delegate to geoFretX(f, _h3dFretUniform) from geometry.js',
    );
    const geo = fs.readFileSync(GEOMETRY_JS, 'utf8');
    assert.match(
        geo,
        /export\s+const\s+geoFretX\s*=\s*\(\s*f\s*,\s*uniform\s*\)\s*=>/,
        'geometry.js must export geoFretX as a 2-arg function (fret, uniform)',
    );
});

test('h3dSetFretSpacing validates the mode against the two supported values', () => {
    // An unexpected input must not be persisted verbatim — it is coerced to
    // one of 'logarithmic' | 'uniform' before writing to localStorage.
    const src = fs.readFileSync(SCREEN_JS, 'utf8');
    assert.match(
        src,
        /window\.h3dSetFretSpacing\s*=\s*mode\s*=>\s*\{[\s\S]*?mode\s*===\s*'logarithmic'\s*\?\s*'logarithmic'\s*:\s*'uniform'[\s\S]*?localStorage\.setItem\(\s*'highway_3d\.fretSpacing'/,
        'h3dSetFretSpacing must coerce mode to a supported value before persisting',
    );
});

test('h3dSetFretSpacing applies the change live, not via a page reload', () => {
    // A reload reboots the SPA to the home screen, ejecting the user from
    // Settings. The setter must instead rebind the spacing flag and broadcast
    // a 'fretSpacing' change so mounted panels rebuild in place — same path as
    // every other 3D-highway setting. Reintroducing location.reload() here is
    // the regression this guards against.
    const src = fs.readFileSync(SCREEN_JS, 'utf8');
    const setter = src.match(/window\.h3dSetFretSpacing\s*=\s*mode\s*=>\s*\{[\s\S]*?\n    \};/);
    assert.ok(setter, 'h3dSetFretSpacing assignment must be present');
    assert.doesNotMatch(
        setter[0],
        /location\.reload/,
        'h3dSetFretSpacing must not reload the page (it ejects the user from Settings)',
    );
    assert.match(
        setter[0],
        /_bgEmitChange\(\s*'fretSpacing'\s*\)/,
        'h3dSetFretSpacing must broadcast a live fretSpacing change',
    );
});

test('the fretSpacing change rebuilds a mounted board live', () => {
    const src = fs.readFileSync(SCREEN_JS, 'utf8');
    assert.match(
        src,
        /changedKey\s*===\s*'fretSpacing'[\s\S]*?if\s*\(fretG\)\s*buildBoard\(\)/,
        'the panel bg listener must rebuild the board when fretSpacing changes',
    );
});
