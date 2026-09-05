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

test('screen.js wiring block contains all 130 DI params', () => {
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
    // 130 = 27 constants + 24 fn-refs + 7 stable-refs (shorthands:58) + 69 getters + 3 setters
    // (7 dead fn-refs removed in Toby r1 fix: xFret, pbBeg, pbEnd,
    //  arpeggioChordIdForNoteWithInferCache, arpHsBoundsForNote, chordWireHighDensity, muteXMat)
    assert.strictEqual(total, 130,
        `DI param count must be exactly 130 (got getters:${getterCount} setters:${setterCount} shorthands:${shorthandCount} = ${total})`);
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

// ── 7. Behavioral kill — drawNote early-exit vs gem path ────────────────────
// Loads createNoteRenderer via new Function (strips ESM import/export so it
// runs in a CJS context) with full DI stubs, then calls drawNote directly.
// Tracks pool.get() calls on the pNote pool to distinguish the early-exit
// path (no gem emitted) from the in-window gem path (pNote.get() × 2).
//
// Kill proof:
//   Gut line 452  (`return` in the smart-cull block) → negative test RED
//   Gut pNote.get() at lines 826+873                 → positive test RED

const _nrSrcStripped = (() => {
    const raw = src; // already read above as fs.readFileSync(NOTE_RENDERER_JS)
    return raw
        // Strip the single ESM import line (including trailing comment); geometry stubs come from outer fn params
        .replace(/^import\s+\{[^}]+\}\s+from\s+['"][^'"]+['"][^\n]*/m, '')
        .replace('export function createNoteRenderer', 'function createNoteRenderer');
})();

// Build the factory via new Function so geometry imports come from params (closure).
// new Function executes in global scope → Math/Map/Set/Array/… are all available.
const _createNoteRendererFn = new Function(
    'dZ', 'slideTrailEnd', 'renderOrderForLayerAtZ',
    _nrSrcStripped + '\nreturn createNoteRenderer;',
)(() => 0, () => null, () => 0);

function _buildDrawNote(overrides) {
    let pNoteGetCount = 0;
    const fakeMat = { opacity: 1, depthTest: true };
    const fakeMesh = {
        position: { set: () => {} },
        rotation: { set: () => {}, z: 0 },
        scale: { set: () => {}, multiplyScalar: () => {} },
        renderOrder: 0, visible: true, material: fakeMat, geometry: null,
    };
    const pNotePool = { get: () => { pNoteGetCount++; return fakeMesh; }, release: () => {} };
    const noopPool  = { get: () => fakeMesh, release: () => {} };
    const A6 = (v) => [v, v, v, v, v, v];

    const di = Object.assign({
        // Constants
        K: 1, NFRETS: 24, NW: 1, NH: 0.1, AHEAD: 1,
        GHOST_HOLD_AFTER_ONSET: 0.1, NEXT_ON_STRING_T_EPS: 0.001,
        NOTEDETECT_GEM_VERDICT_WINDOW: 0.3,
        SLIDE_RIBBON_SAMPLES: 8, S_GAP: 1,
        BEND_HALFSTEP_WORLD_Y: 0.1, PROJ_WIN: 0.6, PROJ_WIN_G: 0.3, PROJ_GROW_MIN: 0,
        GHOST_FRET_LBL_FADE_S: 0.1,
        BEND_ENV_RISE_FRAC: 0.3, BEND_ENV_RELEASE_FRAC: 0.7,
        VIBRATO_HALF_WAVE_S: 0.1, TREMOLO_BUMP_S: 0.1,
        ACCENT_RIM_XY_SCALE_MUL: 1, ACCENT_RIM_Z_SCALE_MUL: 1,
        CHORD_FRAME_RIM_FRAC_H: 0.1, CHORD_FRAME_RIM_MIN: 0.01,
        FRET_LABEL_GOLD_HEX: '#e8c040', SINGLE_SUS_OFFSETS: [0],
        TS: 1, _ND_TIME_EPS: 0.001,
        // Function refs (after r1 fix: 24 live fn-refs)
        slideOffsetWorldX: () => 0,
        hwyPostHitTailFadeMul: () => 1,
        anchorLaneBoundsAt: () => null,
        validString: (s) => s >= 0 && s < 6,
        sY: () => 0,
        xFretMid: () => 0,
        _firstEventTimeGreaterThan: () => Infinity,
        _setLabelMap: () => {},
        _spriteMat2MeshMat: () => fakeMat,
        _meshMatForGhostFretDigit: () => fakeMat,
        fretLabelScaleForFret: () => 1,
        fretMid: () => 0,
        txtMat: () => fakeMat,
        darkenHex: (h) => h,
        palmMuteXSpriteMat: () => fakeMat,
        fretHandMuteXSpriteMat: () => fakeMat,
        triMat: () => fakeMat,
        bendChevronMat: () => fakeMat,
        slideArrowMat: () => fakeMat,
        pinchHarmonicMat: () => fakeMat,
        naturalHarmonicMat: () => fakeMat,
        _timingHex: () => '#ffffff',
        _sparkBurst: () => {},
        _fxSpawnPop: () => {},
        // Frame-state getters
        getLeftyCached: () => false,
        getInvertedCached: () => false,
        getDrawNextByString: () => null,
        getDrawRecentByString: () => null,
        getDrawAnchors: () => null,
        getDrawChordTemplates: () => null,
        getDrawTeachingMarks: () => false,
        getShowFingerHints: () => false,
        getTextSizeMul: () => 1,
        getNdGetNoteState: () => null,
        getNdHasProvider: () => true,
        getNdHitMarks: () => [],
        getNdMissMarks: () => [],
        getNdLabels: () => [],
        getCam: () => ({}),
        getProbe: () => null,
        getCurX: () => 0,
        getNStr: () => 6,
        getAccentShellsByString: () => A6([]),
        getNdVerdictMaxAlpha: () => 0,
        setNdVerdictSawAlpha: () => {},
        setNdVerdictMaxAlpha: () => {},
        getStreakHits: () => 0,
        setStreakHits: () => {},
        getGNote: () => ({}),
        getGNoteGrad: () => A6(null),
        getActivePalette: () => A6(null),
        getHitFx: () => 0,
        getSparks: () => null,
        getVerdictMarks: () => false,
        getStreakFx: () => false,
        getStreakHeat: () => 0,
        getSlideArrowApproachVisible: () => false,
        getSlideArrowNeckVisible: () => false,
        getSlideArrowChainPreviewVisible: () => false,
        getVibrancyProjOp: () => 0.15,
        getFretLabelAllowed: () => new Set(),
        getProjMeshArr: () => null,
        getProjectionVisible: () => false,
        getGlowMul: () => 1,
        getShowFretOnNote: () => false,
        getFretNumberGhostScope: () => null,
        // Pool getters — pNote uses the tracking pool; others use noopPool
        getPNote: () => pNotePool,
        getPNoteEdge: () => noopPool,
        getPSus: () => noopPool,
        getPSusOutline: () => noopPool,
        getPSusRibbon: () => noopPool,
        getPSusRibbonOl: () => noopPool,
        getPTapChevron: () => noopPool,
        getPAccentHalo: () => noopPool,
        getPArpBracket: () => noopPool,
        getPConnectorLine: () => noopPool,
        getPDropLine: () => noopPool,
        getPGhostFretLbl: () => noopPool,
        getPNoteFretLabel: () => noopPool,
        getPTeachMarkLbl: () => noopPool,
        getPTechPlane: () => noopPool,
        // Material getters
        getMStr: () => A6(fakeMat),
        getMGlow: () => A6(fakeMat),
        getMSus: () => fakeMat,
        getMSusOutline: () => fakeMat,
        getMHitBright: () => A6(fakeMat),
        getMHitBrightArrays: () => A6(null),
        getMmissOutline: () => fakeMat,
        getMmissEdgeArrays: () => [],
        getMRimFlash: () => A6(fakeMat),
        getMAccentHaloNear: () => A6(null),
        getMAccentOutline: () => A6(fakeMat),
        getMAccentCore: () => A6(fakeMat),
        getMStrHitOutline: () => A6(fakeMat),
        getMHitSusOutline: () => fakeMat,
        getMWhiteOutline: () => fakeMat,
        // Stable refs
        _susVerdictLatch: new Map(),
        _fwHitIn: new Array(26).fill(0),
        _fwChordAcc: new Map(),
        _scrGhostUpcomingCount: new Array(6).fill(0),
        _rimFlashIn: new Array(6).fill(0),
        _sparkSeen: new Map(),
        _frameLabeledKeys: new Set(),
    }, overrides || {});

    const { drawNote } = _createNoteRendererFn(di);
    return { drawNote, getPNoteGetCount: () => pNoteGetCount };
}

test('drawNote: past-linger note exits before pNote.get() (early-exit kill)', () => {
    // note.t=0, now=999 → dt = -999 << -NOTEDETECT_GEM_VERDICT_WINDOW (0.3)
    // → _overLinger=true, enters smart-cull block, exits at line 452 before any pNote.get().
    // Kill proof: gut line 452 `return` → code falls through into gem body → pNoteGetCount > 0 → RED.
    const { drawNote, getPNoteGetCount } = _buildDrawNote();
    drawNote({ s: 0, f: 5, t: 0, sus: 0 }, /*now=*/999, 0, false, false, 0.10);
    assert.strictEqual(getPNoteGetCount(), 0,
        'pNote.get() must NOT be called when dt is far past the verdict window (early exit)');
});

test('drawNote: in-window note reaches pNote.get() × 2 (gem-path kill)', () => {
    // note.t=5, now=5 → dt=0 → _overLinger=false (linger=0.10, deadline=5.10)
    // → skips smart-cull block entirely → enters gem body → pNote.get() for outline + core.
    // getNdHasProvider=false so smart-cull block is also bypassed (not _overLinger path).
    // Kill proof: gut pNote.get() at line 826 or 873 → count drops below 2 → RED.
    const { drawNote, getPNoteGetCount } = _buildDrawNote({ getNdHasProvider: () => false });
    drawNote({ s: 0, f: 5, t: 5, sus: 0 }, /*now=*/5, 0, false, false, 0.10);
    assert.ok(getPNoteGetCount() >= 2,
        `pNote.get() must be called at least twice (outline + core) for an in-window note (got ${getPNoteGetCount()})`);
});
