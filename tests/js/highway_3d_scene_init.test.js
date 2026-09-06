// Source-level guards for src/scene-init.js (h3d-carve-16).
// Validates wiring, DI contract, class-killer, export surface, and kill tests
// for initScene / buildBoard / _bgUnmountStyle / _bcSyncMode.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sceneInitJs = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'src', 'scene-init.js');
const screen3dJs  = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'screen.js');
const pluginJson  = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'plugin.json');

// ── §1 Wiring guard ───────────────────────────────────────────────────────────

test('scene-init exports createSceneInit as a named ES export', () => {
    const src = fs.readFileSync(sceneInitJs, 'utf8');
    assert.match(src, /^export\s+function\s+createSceneInit\s*\(/m,
        'must have: export function createSceneInit(');
});

test('screen.js imports createSceneInit from ./src/scene-init.js', () => {
    const src = fs.readFileSync(screen3dJs, 'utf8');
    assert.match(src, /import\s*\{[^}]*createSceneInit[^}]*\}\s*from\s*['"]\.\/src\/scene-init\.js['"]/,
        'screen.js must import createSceneInit from ./src/scene-init.js');
});

test('screen.js wires the four exports from createSceneInit', () => {
    const src = fs.readFileSync(screen3dJs, 'utf8');
    assert.match(src, /const\s*\{[^}]*initScene[^}]*\}\s*=\s*createSceneInit\s*\(/,
        'screen.js must destructure initScene from createSceneInit(...)');
    assert.match(src, /const\s*\{[^}]*buildBoard[^}]*\}\s*=\s*createSceneInit\s*\(/,
        'screen.js must destructure buildBoard from createSceneInit(...)');
    assert.match(src, /const\s*\{[^}]*_bgUnmountStyle[^}]*\}\s*=\s*createSceneInit\s*\(/,
        'screen.js must destructure _bgUnmountStyle from createSceneInit(...)');
    assert.match(src, /const\s*\{[^}]*_bcSyncMode[^}]*\}\s*=\s*createSceneInit\s*\(/,
        'screen.js must destructure _bcSyncMode from createSceneInit(...)');
});

// ── §2 Export surface ─────────────────────────────────────────────────────────

test('createSceneInit returns exactly { initScene, buildBoard, _bgUnmountStyle, _bcSyncMode }', () => {
    const src = fs.readFileSync(sceneInitJs, 'utf8');
    // The return statement at the bottom of createSceneInit must name exactly these four
    assert.match(src,
        /return\s*\{\s*initScene\s*,\s*buildBoard\s*,\s*_bgUnmountStyle\s*,\s*_bcSyncMode\s*\}/,
        'return surface must be exactly { initScene, buildBoard, _bgUnmountStyle, _bcSyncMode }');
});

test('createSceneInit does NOT export _bgLoadSettings (internal function)', () => {
    const src = fs.readFileSync(sceneInitJs, 'utf8');
    // _bgLoadSettings is internal; must not appear in the return object
    assert.doesNotMatch(src,
        /return\s*\{[^}]*_bgLoadSettings[^}]*\}/,
        '_bgLoadSettings must NOT be in the return surface');
});

// ── §3 Class-killer guard ─────────────────────────────────────────────────────

test('createSceneInit body never assigns to a DI parameter name (class-killer)', () => {
    const src = fs.readFileSync(sceneInitJs, 'utf8');
    // Extract the DI parameter block (between first { and the closing }) of the factory signature
    const sigStart = src.indexOf('export function createSceneInit({');
    assert.ok(sigStart !== -1, 'createSceneInit signature not found');
    const bodyOpen = src.indexOf(') {', sigStart);
    assert.ok(bodyOpen !== -1, 'factory body open not found');
    const paramBlock = src.slice(sigStart, bodyOpen);
    // Collect setter names (setX) from the DI block
    const setterNames = [...paramBlock.matchAll(/\bset([A-Z][A-Za-z0-9]*)\b/g)].map(m => m[0]);
    assert.ok(setterNames.length > 10, `expected many setter params, got ${setterNames.length}`);
    const body = src.slice(bodyOpen);
    for (const name of setterNames) {
        // Assignment to the bare DI name (not a call) would be: `name = ` or `name=`
        const assignPat = new RegExp(`\\b${name}\\s*=(?!=)`, 'g');
        const hits = body.match(assignPat);
        assert.ok(!hits, `class-killer: body assigns to DI param '${name}' (${hits && hits.length} hit(s))`);
    }
});

// ── §4 DI anti-vacuity ────────────────────────────────────────────────────────

test('createSceneInit receives ≥150 DI parameters (anti-vacuity)', () => {
    const src = fs.readFileSync(sceneInitJs, 'utf8');
    const sigStart = src.indexOf('export function createSceneInit({');
    const bodyOpen = src.indexOf(') {', sigStart);
    const paramBlock = src.slice(sigStart, bodyOpen);
    // Count unique identifiers that look like DI params
    const names = new Set([...paramBlock.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g)].map(m => m[1]));
    assert.ok(names.size >= 150, `expected ≥150 DI params, got ${names.size}`);
});

// ── §5 Import correctness ─────────────────────────────────────────────────────

test('scene-init imports geoFretX and geoFretMid from geometry.js (not bare fretX/fretMid)', () => {
    const src = fs.readFileSync(sceneInitJs, 'utf8');
    assert.match(src, /import\s*\{[^}]*geoFretX[^}]*\}\s*from\s*['"]\.\/geometry\.js['"]/,
        'must import geoFretX from ./geometry.js');
    assert.match(src, /import\s*\{[^}]*geoFretMid[^}]*\}\s*from\s*['"]\.\/geometry\.js['"]/,
        'must import geoFretMid from ./geometry.js');
    // Should NOT import the bare names that don't exist in geometry.js
    assert.doesNotMatch(src,
        /import\s*\{[^}]*(?<!\w)fretX(?!\w)[^}]*\}\s*from\s*['"]\.\/geometry\.js['"]/,
        'must NOT import bare fretX from geometry.js (it exports geoFretX)');
});

test('scene-init rebuilds fretX/fretMid as closures over getH3dFretUniform()', () => {
    const src = fs.readFileSync(sceneInitJs, 'utf8');
    assert.match(src, /const\s+fretX\s*=\s*f\s*=>\s*geoFretX\s*\(\s*f\s*,\s*getH3dFretUniform\s*\(\s*\)\s*\)/,
        'fretX must be rebuilt as: f => geoFretX(f, getH3dFretUniform())');
    assert.match(src, /const\s+fretMid\s*=\s*f\s*=>\s*geoFretMid\s*\(\s*f\s*,\s*getH3dFretUniform\s*\(\s*\)\s*\)/,
        'fretMid must be rebuilt as: f => geoFretMid(f, getH3dFretUniform())');
});

// ── §6 Key functions present ───────────────────────────────────────────────────

test('initScene is defined as a function inside createSceneInit body', () => {
    const src = fs.readFileSync(sceneInitJs, 'utf8');
    assert.match(src, /function\s+initScene\s*\(\s*\)/,
        'initScene() must be defined inside scene-init.js');
});

test('buildBoard is defined as a function inside createSceneInit body', () => {
    const src = fs.readFileSync(sceneInitJs, 'utf8');
    assert.match(src, /function\s+buildBoard\s*\(\s*\)/,
        'buildBoard() must be defined inside scene-init.js');
});

test('_bgUnmountStyle is defined as a function inside createSceneInit body', () => {
    const src = fs.readFileSync(sceneInitJs, 'utf8');
    assert.match(src, /function\s+_bgUnmountStyle\s*\(\s*\)/,
        '_bgUnmountStyle() must be defined inside scene-init.js');
});

test('_bcSyncMode is defined as a function inside createSceneInit body', () => {
    const src = fs.readFileSync(sceneInitJs, 'utf8');
    assert.match(src, /function\s+_bcSyncMode\s*\(\s*\)/,
        '_bcSyncMode() must be defined inside scene-init.js');
});

// ── §7 Kill tests — functions that must NOT survive in screen.js ───────────────

test('initScene no longer defined in screen.js (moved to scene-init.js)', () => {
    const src = fs.readFileSync(screen3dJs, 'utf8');
    assert.doesNotMatch(src, /^\s*function\s+initScene\s*\(\s*\)/m,
        'initScene() must not be defined in screen.js — it moved to scene-init.js');
});

test('buildBoard no longer defined in screen.js (moved to scene-init.js)', () => {
    const src = fs.readFileSync(screen3dJs, 'utf8');
    assert.doesNotMatch(src, /^\s*function\s+buildBoard\s*\(\s*\)/m,
        'buildBoard() must not be defined in screen.js — it moved to scene-init.js');
});

test('_bgUnmountStyle no longer defined in screen.js (moved to scene-init.js)', () => {
    const src = fs.readFileSync(screen3dJs, 'utf8');
    assert.doesNotMatch(src, /^\s*function\s+_bgUnmountStyle\s*\(\s*\)/m,
        '_bgUnmountStyle() must not be defined in screen.js — it moved to scene-init.js');
});

test('_bcSyncMode no longer defined in screen.js (moved to scene-init.js)', () => {
    const src = fs.readFileSync(screen3dJs, 'utf8');
    assert.doesNotMatch(src, /^\s*function\s+_bcSyncMode\s*\(\s*\)/m,
        '_bcSyncMode() must not be defined in screen.js — it moved to scene-init.js');
});

// ── §8 plugin.json version bump ───────────────────────────────────────────────

test('plugin.json version is 3.52.0 (bumped for cut-16)', () => {
    const pkg = JSON.parse(fs.readFileSync(pluginJson, 'utf8'));
    assert.equal(pkg.version, '3.52.0',
        'plugin.json must be bumped to 3.52.0 for cut-16');
});
