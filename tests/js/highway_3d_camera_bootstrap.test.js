// Regression coverage for the first-chart-data camera bootstrap in
// plugins/highway_3d/screen.js.
//
// The event selector is pure and tested behaviourally. The renderer lifecycle
// wiring remains source-level, matching the existing highway_3d camera tests:
// constructing a full Three.js renderer in Node would test a large fake DOM/GL
// harness rather than the bootstrap contract itself.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCREEN_JS = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'screen.js');
const src = fs.readFileSync(SCREEN_JS, 'utf8');
// Since h3d-carve-1b, hwyFirstRelevantFrettedTime lives in geometry.js.
const GEOMETRY_JS = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'src', 'geometry.js');
const geoSrc = fs.readFileSync(GEOMETRY_JS, 'utf8');
// h3d-carve-9: camUpdate body moved to camera.js — extractFn retargets there.
const CAMERA_JS = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'src', 'camera.js');
const cameraSrc = fs.readFileSync(CAMERA_JS, 'utf8');

function extractFn(source, name) {
    const start = source.indexOf('function ' + name);
    assert.ok(start >= 0, `function ${name} must exist`);
    const open = source.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
    }
    throw new Error(`unbalanced braces extracting ${name}`);
}

function sourceBetween(startText, endText) {
    const start = src.indexOf(startText);
    assert.ok(start >= 0, `missing source anchor: ${startText}`);
    const end = src.indexOf(endText, start);
    assert.ok(end > start, `missing source end anchor: ${endText}`);
    return src.slice(start, end);
}

const hwyFirstRelevantFrettedTime = new Function(
    '"use strict";'
    + extractFn(geoSrc, 'hwyFirstRelevantFrettedTime')
    + '\nreturn hwyFirstRelevantFrettedTime;',
)();

test('long intros bootstrap from the earliest future fretted note', () => {
    const notes = [
        { t: 13.22, s: 2, f: 7 },
        { t: 15.0, s: 1, f: 4 },
    ];
    const chords = [
        { t: 14.0, notes: [{ s: 0, f: 3 }, { s: 1, f: 5 }] },
    ];
    assert.equal(hwyFirstRelevantFrettedTime(notes, chords, 0.4, 0.2, 6), 13.22);
});

test('chord-only charts bootstrap from fretted chord members', () => {
    const chords = [
        { t: 4.0, notes: [{ s: 0, f: 0 }, { s: 1, f: 0 }] },
        { t: 8.5, notes: [{ s: 0, f: 0 }, { s: 1, f: 9 }] },
    ];
    assert.equal(hwyFirstRelevantFrettedTime([], chords, 0, 0.2, 6), 8.5);
});

test('empty and all-open charts keep the default camera', () => {
    assert.equal(hwyFirstRelevantFrettedTime([], [], 0, 0.2, 6), null);
    assert.equal(hwyFirstRelevantFrettedTime(
        [{ t: 2, s: 0, f: 0 }],
        [{ t: 3, notes: [{ s: 1, f: 0 }, { s: 2, f: 0 }] }],
        0,
        0.2,
        6,
    ), null);
});

test('bootstrap ignores malformed strings but supports extended-range charts', () => {
    const notes = [
        { t: 1, s: -1, f: 4 },
        { t: 2, s: 7, f: 5 },
        { t: 3, s: 6, f: 8 },
    ];
    assert.equal(hwyFirstRelevantFrettedTime(notes, [], 0, 0.2, 6), null);
    assert.equal(hwyFirstRelevantFrettedTime(notes, [], 0, 0.2, 7), 3);
});

test('active sustains bootstrap at now and fully expired events are skipped', () => {
    const now = 10;
    assert.equal(hwyFirstRelevantFrettedTime(
        [{ t: 6, sus: 5, s: 2, f: 7 }],
        [],
        now,
        0.2,
        6,
    ), now);
    assert.equal(hwyFirstRelevantFrettedTime(
        [{ t: 6, sus: 1, s: 2, f: 7 }, { t: 15, s: 2, f: 9 }],
        [],
        now,
        0.2,
        6,
    ), 15);
});

test('recent onsets inside the behind-window bootstrap at now', () => {
    assert.equal(hwyFirstRelevantFrettedTime(
        [{ t: 9.9, s: 2, f: 7 }],
        [],
        10,
        0.2,
        6,
    ), 10);
});

test('bootstrap runs once when complete chart arrays arrive', () => {
    const bootstrap = sourceBetween(
        '// ── Camera bootstrap (first chart data)',
        '            pbBeg(4);',
    );
    assert.match(
        bootstrap,
        /if\s*\(\s*!_camSnapped\s*&&\s*!_camPreScanned\s*&&\s*notes\s*&&\s*chords\s*\)/,
        'chart bootstrap must be gated to one pass after both arrays arrive',
    );
    assert.match(
        bootstrap,
        /hwyFirstRelevantFrettedTime\(\s*notes\s*,\s*chords\s*,\s*now\s*,\s*CAM_TGT_BEHIND\s*,\s*nStr\s*\)/,
        'bootstrap must select the first relevant event using the active string count',
    );
    assert.match(
        bootstrap,
        /firstFrettedTime\s*===\s*null[\s\S]*?_camSnapped\s*=\s*true/,
        'all-open/empty charts without lookahead bounds must permanently disable bootstrap work',
    );
});

test('steady and lookahead modes initialize immediately from future chart data', () => {
    const bootstrap = sourceBetween(
        '// ── Camera bootstrap (first chart data)',
        '            pbBeg(4);',
    );
    assert.match(
        bootstrap,
        /cameraMode\s*===\s*'lookahead'[\s\S]*?lookaheadBoundsNow\s*\|\|\s*firstFrettedTime\s*!==\s*null/,
        'lookahead anchor bounds must bootstrap even on an all-open chart',
    );
    assert.match(
        bootstrap,
        /lookaheadBootstrapTime\(\s*now\s*,\s*firstFrettedTime\s*\)/,
        'lookahead mode must project to the first window that reaches the phrase',
    );
    assert.match(
        bootstrap,
        /lookaheadBoundsNow\s*\?\s*now\s*:\s*lookaheadBootstrapTime/,
        'already-live anchor/note bounds must win over a projected lookahead',
    );
    assert.match(
        bootstrap,
        /Math\.max\(\s*now\s*,\s*firstFrettedTime\s*-\s*camAhead\s*\)/,
        'steady mode must sample when the first event enters its normal target window',
    );
    assert.match(
        bootstrap,
        /curX\s*=\s*tgtX\s*;[\s\S]*?curDist\s*=\s*tgtDist\s*;/,
        'the initial base position must be applied before the note draw loop',
    );
});

test('silent-intro hold hands off only when live framing is ready', () => {
    const target = sourceBetween(
        '// ── Camera target',
        '// ── Chord diagram:',
    );
    assert.match(
        target,
        /cameraMode\s*===\s*'lookahead'\s*\?\s*lookaheadBoundsNow\s*!==\s*null\s*:\s*camDistGot/,
        'lookahead and steady modes must use their own live-ready signal',
    );
    assert.match(
        target,
        /if\s*\(\s*bootstrapHoldActive\s*\)[\s\S]*?lockActive\s*=\s*prevLockActive/,
        'the bootstrap target must remain untouched while the live window is empty',
    );
    assert.match(
        target,
        /_camBootstrapMode\s*!==\s*cameraMode[\s\S]*?_camBootstrapHolding\s*=\s*false/,
        'a live camera-mode change must safely release the old-mode hold',
    );
});

test('song changes and teardown reset every bootstrap state field', () => {
    const resetAssignments = src.match(
        /_camSnapped\s*=\s*false\s*;\s*\r?\n\s*_camPreScanned\s*=\s*false\s*;\s*\r?\n\s*_camBootstrapHolding\s*=\s*false\s*;\s*\r?\n\s*_camBootstrapMode\s*=\s*null\s*;/g,
    ) || [];
    assert.equal(
        resetAssignments.length,
        2,
        'song-change and teardown paths must both reset bootstrap state',
    );
});

test('Camera Director still layers after the bootstrapped auto-framing base', () => {
    const bootstrap = sourceBetween(
        '// ── Camera bootstrap (first chart data)',
        '            pbBeg(4);',
    );
    assert.doesNotMatch(
        bootstrap,
        /_freeCam|__h3dCamCtl/,
        'bootstrap must only initialize base framing, never mutate Camera Director state',
    );

    // h3d-carve-9: extractFn must target cameraSrc — src holds only the tombstone.
    // tgtX is DI-rewired to getTgtX() direct call in camera.js.
    const camUpdate = extractFn(cameraSrc, 'camUpdate');
    const baseIndex = camUpdate.indexOf('curX += (getTgtX() - curX) * lerp');
    const directorIndex = camUpdate.indexOf('if (_freeCam && _freeCam.enabled)');
    const positionIndex = camUpdate.indexOf('cam.position.set(_camX, _camY, _camZ)');
    assert.ok(
        baseIndex >= 0 && directorIndex > baseIndex && positionIndex > directorIndex,
        'Camera Director transforms must remain layered after base framing and before camera placement',
    );
});

// ── h3d-carve-9: setter class-killers (write-back pairs must survive DI) ────
// Severing the call turns the test RED: a silent local var replaces the
// write-back and the IIFE-scope var is never updated.

test('setCurX write-back is called in camUpdate (curX persists across frames)', () => {
    // Silencing: sed 's/setCurX(curX)/\/\/ GUTTED/' → this test fails.
    assert.match(
        cameraSrc,
        /setCurX\(\s*curX\s*\)/,
        'camUpdate must write curX back via setCurX(); removing it silences the update',
    );
});

test('setFretRowFitBoost write-back is called in camUpdate (boost persists across frames)', () => {
    // Silencing: sed 's/setFretRowFitBoost(_fretRowFitBoost)/\/\/ GUTTED/' → RED.
    assert.match(
        cameraSrc,
        /setFretRowFitBoost\(\s*_fretRowFitBoost\s*\)/,
        'camUpdate must write _fretRowFitBoost back via setFretRowFitBoost(); removing it silences the boost',
    );
});

// ── h3d-carve-9 Creed r1: naming-correspondence guard (param-swap class-killer) ──
// Structural source-scan: every entry in createCamera({...}) must satisfy its
// naming-correspondence class. Kills swaps like (CAM_H_BASE: CAM_DIST_BASE) and
// wrong-var getters ((getCurX: () => curDist)) across the whole wiring surface.
// cut-13 additions inherit the guard automatically; only the pinned fn-ref renames
// need a one-line entry in PINNED_RENAMES when a new rename is introduced.

test('createCamera({...}) wiring has correct naming correspondence (no param swaps)', () => {
    // Fn-ref renames that intentionally differ from shorthand — pinned exhaustively.
    const PINNED_RENAMES = {
        freeCamFor: '_freeCamFor',
        aspectPaneKey: '_aspectPaneKey',
        resolveTuneFor: '_resolveTuneFor',
        aspectRegisterPane: '_aspectRegisterPane',
    };

    // 1. Extract the argument block from the createCamera call.
    // h3d-carve-13: destructure expanded with lookahead exports — update anchor string.
    const ANCHOR = 'const { effectiveVfov, camUpdate, lookaheadBootstrapTime, lookaheadComputeFretBounds, lookaheadTargetWorldX } = createCamera({';
    const callStart = src.indexOf(ANCHOR);
    assert.ok(callStart >= 0, 'createCamera call must be findable in screen.js');
    const blockStart = callStart + ANCHOR.length - 1; // points to the opening {
    assert.equal(src[blockStart], '{', 'expected { at computed blockStart');
    let depth = 0, blockEnd = -1;
    for (let i = blockStart; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) { blockEnd = i; break; }
    }
    assert.ok(blockEnd > blockStart, 'createCamera argument block must have balanced braces');
    const inner = src.slice(blockStart + 1, blockEnd);

    // 2. Split into entries at depth-0 commas (setter bodies contain { } — skip them).
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

    // Strip line comments and blank entries.
    const entries = rawEntries
        .map(e => e.replace(/\/\/[^\n]*/g, '').trim())
        .filter(Boolean);

    assert.ok(entries.length >= 48, `expected at least 48 entries, got ${entries.length}`);

    const violations = [];
    for (const entry of entries) {
        if (!entry.includes(':')) {
            // Shorthand — key === value by definition (BASE_VFOV, sY, …).
            continue;
        }
        const colonIdx = entry.indexOf(':');
        const key = entry.slice(0, colonIdx).trim();
        const value = entry.slice(colonIdx + 1).trim();

        if (key in PINNED_RENAMES) {
            if (value !== PINNED_RENAMES[key]) {
                violations.push(`${key}: pinned to '${PINNED_RENAMES[key]}' but got '${value}'`);
            }
            continue;
        }

        if (key.startsWith('get')) {
            // () => [_]varStem — varStem (no underscore) must match key minus 'get' prefix.
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

        if (key.startsWith('set')) {
            // (v) => { [_]varStem = v; } — varStem must match key minus 'set' prefix.
            const expectedStem = key[3].toLowerCase() + key.slice(4);
            const m = value.match(/^\(v\)\s*=>\s*\{\s*_?(\w+)\s*=\s*v\s*;\s*\}$/);
            if (!m) {
                violations.push(`${key}: setter value '${value}' does not match (v) => { [_]var = v; }`);
                continue;
            }
            if (m[1] !== expectedStem) {
                violations.push(`${key}: setter assigns var stem '${m[1]}' but expected '${expectedStem}'`);
            }
            continue;
        }

        // key:value form that is NOT a getter, setter, or pinned rename — disallowed.
        violations.push(`${key}: key:value entry not in PINNED_RENAMES and not a get/set arrow`);
    }

    assert.deepEqual(violations, [], `createCamera wiring violations found`);
});
