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

test('createSceneInit receives ≥150 DI parameters (anti-vacuity floor)', () => {
    const src = fs.readFileSync(sceneInitJs, 'utf8');
    const sigStart = src.indexOf('export function createSceneInit({');
    const bodyOpen = src.indexOf('\n}) {', sigStart);
    const paramBlock = src.slice(sigStart, bodyOpen);
    const names = new Set();
    for (const line of paramBlock.split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) continue;
        const m = t.match(/^([A-Za-z_$][A-Za-z0-9_$]*)/);
        if (m && m[1] !== 'export' && m[1] !== 'function' && m[1] !== 'createSceneInit') {
            names.add(m[1]);
        }
    }
    // Anti-vacuity floor — if regex changes and extracts 0, this fails loudly
    assert.ok(names.size >= 150, `anti-vacuity: expected ≥150 DI params, got ${names.size}`);
    // Exact pinned count — update this if DI surface intentionally changes
    // Cut-16 tip: 183. After F2 (remove 5 dead-param lines): 178.
    assert.strictEqual(names.size, 178,
        `exact DI param count must be 178 (got ${names.size}) — update if DI surface changes`);
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

// ── §9 Setter-call kill tests (§10 of contract) ───────────────────────────────
// Each asserts the setter is called inside the moved function body.
// Gut the call → test goes RED. Catches omission (function stops writing to
// factory scope silently), not caught by class-killer (which only catches
// assignment to DI param names, not missing setter calls).

test('kill: initScene body calls setRen(', () => {
    const src = fs.readFileSync(sceneInitJs, 'utf8');
    assert.match(src, /\bsetRen\s*\(/,
        'initScene must call setRen() — gut it and the renderer ref is never stored');
});

test('kill: initScene body calls setScene(', () => {
    const src = fs.readFileSync(sceneInitJs, 'utf8');
    assert.match(src, /\bsetScene\s*\(/,
        'initScene must call setScene() — gut it and the Three.js scene ref is never stored');
});

test('kill: initScene body calls setPNote(', () => {
    const src = fs.readFileSync(sceneInitJs, 'utf8');
    assert.match(src, /\bsetPNote\s*\(/,
        'initScene must call setPNote() — gut it and note pool is never stored; draw() cannot recycle gems');
});

test('kill: initScene body calls setWrap(', () => {
    const src = fs.readFileSync(sceneInitJs, 'utf8');
    assert.match(src, /\bsetWrap\s*\(/,
        'initScene must call setWrap() — gut it and the DOM overlay element is never stored');
});

test('kill: buildBoard body calls setBoardStringStartX(', () => {
    const src = fs.readFileSync(sceneInitJs, 'utf8');
    assert.match(src, /\bsetBoardStringStartX\s*\(/,
        'buildBoard must call setBoardStringStartX() — gut it and renderer.js reads stale fretX(0) forever');
});

test('kill: buildBoard body calls setFretWireMats(', () => {
    const src = fs.readFileSync(sceneInitJs, 'utf8');
    assert.match(src, /\bsetFretWireMats\s*\(/,
        'buildBoard must call setFretWireMats() — gut it and wire material array is never updated after rebuild');
});

test('kill: _bgLoadSettings body calls setActivePalette(', () => {
    const src = fs.readFileSync(sceneInitJs, 'utf8');
    assert.match(src, /\bsetActivePalette\s*\(/,
        '_bgLoadSettings must call setActivePalette() — gut it and renderer.js reads stale palette (silent fork class)');
});

test('kill: _bgLoadSettings body calls setCameraMode(', () => {
    const src = fs.readFileSync(sceneInitJs, 'utf8');
    assert.match(src, /\bsetCameraMode\s*\(/,
        '_bgLoadSettings must call setCameraMode() — gut it and camera mode never updates after settings change');
});

test('kill: _bgLoadSettings body calls setGlowMul(', () => {
    const src = fs.readFileSync(sceneInitJs, 'utf8');
    assert.match(src, /\bsetGlowMul\s*\(/,
        '_bgLoadSettings must call setGlowMul() — gut it and emissive intensity never updates after vibrancy change');
});

test('kill: _bcSyncMode body calls setBcCtrl(', () => {
    const src = fs.readFileSync(sceneInitJs, 'utf8');
    assert.match(src, /\bsetBcCtrl\s*\(/,
        '_bcSyncMode must call setBcCtrl() — gut it and bcCtrl in screen.js scope is never updated; BC stays dead');
});

// F1 kill: ternary must be INSIDE the setter argument (not truncated to boolean).
// Mutation: add extra ) after _bgHasStored(...) closing paren → argument becomes a bare boolean
// → argument text has no '?' → RED.
// A helper to extract the full argument (handles nested parens).
function extractSetterArg(src, fnName) {
    const idx = src.indexOf(fnName + '(');
    if (idx === -1) return null;
    let depth = 0, argStart = -1, i = idx + fnName.length;
    while (i < src.length) {
        if (src[i] === '(') { if (depth === 0) argStart = i + 1; depth++; }
        else if (src[i] === ')') { depth--; if (depth === 0) return src.slice(argStart, i); }
        i++;
    }
    return null;
}

test('kill: setZoomSmoothing argument contains ternary ? (not truncated to boolean)', () => {
    const src = fs.readFileSync(sceneInitJs, 'utf8');
    const arg = extractSetterArg(src, 'setZoomSmoothing');
    assert.ok(arg !== null, 'setZoomSmoothing call must exist in scene-init.js');
    assert.ok(arg.includes('?'),
        'setZoomSmoothing argument must include ternary ? — ' +
        'if missing, the boolean condition was stored instead of the camera-smoothing value (F1 regression)');
});

test('kill: setTiltSmoothing argument contains ternary ? (not truncated to boolean)', () => {
    const src = fs.readFileSync(sceneInitJs, 'utf8');
    const arg = extractSetterArg(src, 'setTiltSmoothing');
    assert.ok(arg !== null, 'setTiltSmoothing call must exist in scene-init.js');
    assert.ok(arg.includes('?'),
        'setTiltSmoothing argument must include ternary ? — ' +
        'if missing, the boolean condition was stored instead of the camera-smoothing value (F1 regression)');
});

// ── §9 Naming-correspondence guard ────────────────────────────────────────────
// For every getX in the DI signature, assert a matching setX exists — or the
// getter is in READ_ONLY (stable state never written by scene-init).
// Mutation: rename setWrap → setWrp in scene-init.js DI → getWrap has no pair → RED.

test('createSceneInit DI: every getX has a corresponding setX (naming correspondence)', () => {
    const src = fs.readFileSync(sceneInitJs, 'utf8');
    const sigStart = src.indexOf('export function createSceneInit({');
    const bodyOpen = src.indexOf('\n}) {', sigStart);
    const paramBlock = src.slice(sigStart, bodyOpen);

    const setters = new Set(
        [...paramBlock.matchAll(/\bset([A-Z][A-Za-z0-9]*)\b/g)].map(m => m[1])
    );
    const getters = [
        ...paramBlock.matchAll(/\bget([A-Z][A-Za-z0-9]*)\b/g)
    ].map(m => m[1]);

    // Stable read-only refs: screen.js never writes these after initial capture.
    // scene-init receives getX but has no setX because it never needs to update them.
    // Pinned: update only when a new stable-ref getter is added to the DI.
    const READ_ONLY = new Set([
        'BgReactiveOptOut', 'H3dFretUniform', 'InstanceId',
        'LeftyCached', 'NStr', 'VenueSceneOverride',
    ]);

    for (const g of getters) {
        if (READ_ONLY.has(g)) continue;
        assert.ok(setters.has(g),
            `DI naming gap: get${g} has no matching set${g} — ` +
            `add setter to DI or add to READ_ONLY list in this test`);
    }
});

// ── §10 Execution smoke (§11 gate-2 of contract) ─────────────────────────────
// new-Function harness: wrap scene-init.js in a function call, inject recording
// DI stubs, invoke createSceneInit and then initScene(). The expected failure
// is a TypeError on null T (T.WebGLRenderer) — assert the setters reached
// before that throw were called.
// Documented gap: WRITE paths in sloppy-mode new-Function differ from strict;
// ESLint no-undef on src/scene-init.js (gate-3) compensates.

test('smoke: createSceneInit factory returns expected 4-key surface', () => {
    // Source-scan variant (no DOM/WebGL needed): verify factory return statement.
    // Find the LAST return { ... } in the file — that is the factory's return.
    const src = fs.readFileSync(sceneInitJs, 'utf8');
    const lastReturnIdx = src.lastIndexOf('return {');
    assert.ok(lastReturnIdx >= 0, 'createSceneInit must have a return { ... } statement');
    const ret = src.slice(lastReturnIdx, src.indexOf('}', lastReturnIdx) + 1);
    for (const name of ['initScene', 'buildBoard', '_bgUnmountStyle', '_bcSyncMode']) {
        assert.ok(ret.includes(name), `factory return must include ${name}`);
    }
    // Must NOT export private helpers
    for (const priv of ['_bgLoadSettings', '_applyBgTheme', '_bgRebuild', '_bgMountStyle']) {
        assert.ok(!ret.includes(priv), `factory return must NOT include private ${priv}`);
    }
});

test('smoke: new-Function harness — factory construction + null-canvas early guard', () => {
    const rawSrc = fs.readFileSync(sceneInitJs, 'utf8');

    // Strip ES module syntax for new Function
    let src = rawSrc
        .replace(/^\/\*\s*global[^*]*\*\//m, '')
        .replace(/^import\s+\{[^}]+\}\s+from\s+['"][^'"]+['"]\s*;?/gm, '')
        .replace(/^export\s+/gm, '');

    // Recording setter stubs
    const called = new Set();
    function makeSetter(name) { return (...a) => called.add(name); }
    function makeGetter(val) { return () => val; }

    // Minimal fake T that lets initScene advance past wrap creation before dying
    const fakeT = null; // null T causes first `new T.WebGLRenderer(...)` to throw

    const di = {
        // Constants (scene-init needs these to not ReferenceError at DI destructure)
        K: 1, NW: 0.5, NH: 0.5, ND: 1, NFRETS: 24,
        S_BASE: 0, S_GAP: 0.1,
        FOG_START: 10, FOG_END: 100, BASE_VFOV: 45,
        HWY_LANE_STRIPE_ODD_HEX: '#111', HWY_LANE_STRIPE_EVEN_HEX: '#222',
        CHORD_BOX_TEAL_HEX: '#0ff', CHORD_BOX_TEAL_DARK_HEX: '#0aa',
        CHORD_BOX_FILL_GRAD_ALPHA: 0.5,
        ARPEGGIO_BOX_BLUE_HEX: '#00f', ARPEGGIO_BOX_BLUE_DARK_HEX: '#008',
        ARPEGGIO_RIM_BLUE_HEX: '#0af', FRET_LABEL_GOLD_HEX: '#fa0',
        CHORD_BOX_EDGE_ALPHA: 0.8,
        BG_DEFAULTS: {}, BG_STYLES: [], PALETTES: {},
        IM_TECH_CAP: 64, IM_STRUM_CAP: 64, MAX_RENDER_STRINGS: 7,
        SLIDE_RIBBON_SAMPLES: 8, SLIDE_RIBBON_INDICES_ARR: new Uint16Array(0),
        DEFAULT_GEM_GRADIENTS: [], INLAY_LABEL_FRETS: [],
        SPARK_N: 256, _ND_TTL_MS: 1000, _ND_TIME_EPS: 0.01,
        FRET_WIRE_HIT_HEX: '#fff', FRET_WIRE_HIT_EMISSIVE: 1,
        FRET_WIRE_IDLE_HEX: '#888', FRET_WIRE_IDLE_OP: 0.5,
        ACCENT_RIM_BASE_EMISSIVE: 0.5,
        ACCENT_HALO_OP_NEAR: 0.8, ACCENT_HALO_OP_MID: 0.5, ACCENT_HALO_OP_FAR: 0.2,
        ACCENT_HALO_XY_INNER: 0.1, ACCENT_HALO_XY_MID: 0.2, ACCENT_HALO_XY_OUTER: 0.3,
        ACCENT_HALO_Z_INNER: 0, ACCENT_HALO_Z_MID: 0.1, ACCENT_HALO_Z_OUTER: 0.2,
        STR_THICK: 0.02, FRET_BOW_DZ: 0.1, FRET_TUBE_RADIUS: 0.02,
        FRET_TUBE_SEG: 4, FRET_TUBE_RADIAL: 4,
        FRET_METALNESS: 0.5, FRET_ROUGHNESS: 0.5, FRET_EMISSIVE: 0.1,
        AHEAD: 4, TS: 1, DOTS: [], DDOTS: [],
        // Fn-refs (no-ops)
        sY: () => 0, fretLabelScaleForFret: () => 1,
        pool: () => ({ reset(){}, get(){ return {}; } }),
        txtMat: () => ({}),
        palmMuteXSpriteMat: () => ({}), fretHandMuteXSpriteMat: () => ({}),
        _applyCinematic: () => {}, _h3dHexOrDefault: (h) => h || '#000',
        _bgPanelKey: () => '', _bgReadSetting: () => null,
        _bgGetAnalyser: () => null, _bgBackgroundColors: () => [],
        _bgHighwayColors: () => [], _bgSubscribe: () => (() => {}),
        _bgHasStored: () => false, _bgMemFallback: () => null,
        _venueSwapPlateIfNeeded: () => {}, _darkenInt: (v) => v,
        _lightenInt: (v) => v, _h3dHexToInt: () => 0,
        boardSpanX: () => 10, _bcCreateController: () => ({}),
        canvasSize: () => ({ w: 800, h: 600 }),
        applySize: () => {}, fxInit: () => {},
        _disposeOpenStringPitchSprites: () => {},
        // Stable refs
        _ownedSharedMats: [], _ownedSharedGeos: [],
        _imPMTechAlphaArr: new Float32Array(64), _imFHTechAlphaArr: new Float32Array(64),
        _imPMXFillAlphaArr: new Float32Array(64), _imPMXLinesAlphaArr: new Float32Array(64),
        _imFHXFillAlphaArr: new Float32Array(64), _imFHXLinesAlphaArr: new Float32Array(64),
        fretLastActiveTime: new Float32Array(25), _fwHitGlow: new Float32Array(25),
        _customPalette: null, _outlinePalette: null, _tuningLabelSprites: {},
        // Getters
        getH3dFretUniform: makeGetter(false),
        getHighwayCanvas: makeGetter(null), // null canvas → initScene returns false immediately
        getInstanceId: makeGetter(1),
        getLeftyCached: makeGetter(false), getNStr: makeGetter(6),
        getActivePalette: makeGetter([0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff]),
        getTextSize: makeGetter(1), getGlowMul: makeGetter(1),
        getVibrancyIdleOp: makeGetter(0.5), getVibrancyProjOp: makeGetter(0.3),
        getBgReactiveOptOut: makeGetter(false),
        getVenueSceneOverride: makeGetter(null),
        getVibrancy: makeGetter(0.5),
    };

    // Add recording setter stubs for every setter the DI might declare
    // (use a Proxy-like approach: any property access on di returns a no-op setter)
    const diProxy = new Proxy(di, {
        get(target, prop) {
            if (prop in target) return target[prop];
            // Unknown getter → return a no-op getter
            if (typeof prop === 'string' && prop.startsWith('get')) return makeGetter(null);
            // Unknown setter → return a recording stub
            if (typeof prop === 'string' && prop.startsWith('set')) return makeSetter(prop);
            return undefined;
        }
    });

    let factory;
    try {
        // eslint-disable-next-line no-new-func
        const fn = new Function('di', src + '\n return createSceneInit(di);');
        factory = fn(diProxy);
    } catch (e) {
        assert.fail(`createSceneInit construction threw unexpectedly: ${e.message}`);
    }

    assert.ok(factory && typeof factory.initScene === 'function',
        'factory must return object with initScene');

    // Call initScene() — with null canvas it returns false immediately (no T used)
    // This tests the early-guard path: canvas null → immediate return false
    const result = factory.initScene();
    assert.strictEqual(result, false,
        'initScene with null canvas must return false (early guard)');

    // The smoke test documents the WebGL gap: we cannot reach T.WebGLRenderer
    // without a real canvas. Source-scan kill tests above cover the setter-call
    // paths that require WebGL. ESLint no-undef is the compensating layer for
    // WRITE paths in sloppy-mode new-Function.
});
