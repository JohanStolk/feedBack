// Contract tests for h3d-carve-6: src/materials.js (createMaterialBuilders).
//
// Class-killer tests — each names the mutation that makes it RED.
// Source-scan + vm-sandbox pattern (no canvas, no WebGL lifecycle).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const MATERIALS_JS = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'src', 'materials.js');
const SCREEN_JS = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'screen.js');

function src() { return fs.readFileSync(MATERIALS_JS, 'utf8'); }
function screenSrc() { return fs.readFileSync(SCREEN_JS, 'utf8'); }

// Strip block and line comments from JS source for identifier-presence checks.
function stripComments(s) {
    return s
        .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
        .replace(/\/\/[^\n]*/g, '');         // line comments
}

// ── vm sandbox helpers ──────────────────────────────────────────────────────

// Evaluate materials.js in a sandbox and return the createMaterialBuilders export.
// Three.js is stubbed; canvas ops are no-ops.
function loadFactory() {
    const raw = src();
    // materials.js uses `export function` — strip the `export` keyword for vm.
    const code = raw.replace(/^export\s+/m, '');
    const sandbox = {
        document: {
            createElement: () => ({
                getContext: () => ({
                    font: '', textAlign: '', textBaseline: '',
                    clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
                    closePath() {}, fill() {}, stroke() {}, fillText() {},
                    strokeText() {}, save() {}, restore() {}, translate() {},
                    ellipse() {}, arc() {}, createRadialGradient: () => ({
                        addColorStop() {},
                    }),
                    measureText: () => ({
                        width: 10,
                        actualBoundingBoxLeft: 0, actualBoundingBoxRight: 10,
                        actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2,
                    }),
                    getImageData: (x, y, w, h) => ({ data: new Uint8Array(w * h * 4) }),
                    fillStyle: '', strokeStyle: '', lineWidth: 0,
                    lineJoin: '', lineCap: '', shadowColor: '',
                    shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
                    miterLimit: 0, globalCompositeOperation: '',
                }),
                width: 0, height: 0,
            }),
        },
        Math,
        Number,
        Map,
        Set,
        String,
        Object,
        Array,
    };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: MATERIALS_JS });
    return sandbox.createMaterialBuilders;
}

// Build a minimal DI bundle for testing factory internals.
function makeDI(overrides = {}) {
    let txtCache = {};
    const techMatCache = new Map();
    const techMeshMatClones = new Set();
    const T = {
        SpriteMaterial: class { constructor(o) { Object.assign(this, o); this.map = o.map; this.userData = {}; } clone() { const c = new T.SpriteMaterial(this); return c; } dispose() {} },
        MeshBasicMaterial: class { constructor(o) { Object.assign(this, o); this.userData = {}; } clone() { return new T.MeshBasicMaterial(this); } dispose() {} },
        CanvasTexture: class { constructor(c) { this._c = c; } dispose() {} },
        Color: class { constructor(v) { this.r = 1; this.g = 1; this.b = 1; } getHexString() { return 'ffffff'; } },
        DoubleSide: 2,
    };
    return {
        getT: () => T,
        getTxtCache: () => txtCache,
        techMatCache,
        techMeshMatClones,
        _resetCache: () => { txtCache = {}; },
        ...overrides,
    };
}

// ── 1. Module exports createMaterialBuilders ────────────────────────────────
test('src/materials.js exports createMaterialBuilders', () => {
    // Mutation: rename to createMaterials → RED.
    assert.match(src(), /export\s+function\s+createMaterialBuilders\s*\(/, 'must export createMaterialBuilders');
});

// ── 2. Return set covers all expected symbols ───────────────────────────────
test('createMaterialBuilders returns all required symbols', () => {
    // Mutation: remove `pool` from return {...} → RED.
    const createMaterialBuilders = loadFactory();
    const di = makeDI();
    const result = createMaterialBuilders(di);
    const EXPECTED = [
        'txtMat', 'pinchHarmonicMat', 'naturalHarmonicMat',
        'palmMuteXSpriteMat', 'fretHandMuteXSpriteMat', 'muteXMat',
        'triMat', 'bendChevronMat', 'darkenHex', 'slideArrowMat',
        '_meshMatForGhostFretDigit', '_spriteMat2MeshMat', 'pool',
    ];
    for (const sym of EXPECTED) {
        assert.ok(sym in result, `createMaterialBuilders must return ${sym}`);
    }
});

// ── 3. Stranded-caller: every returned symbol in screen.js destructure ───────
test('every symbol returned by createMaterialBuilders is in the screen.js destructure', () => {
    // Mutation: add _newHelper to return{} but not the screen.js destructure → leaked=['_newHelper'] → RED.
    const matSrc = stripComments(src());
    const scr = screenSrc();

    // Extract the module-level return block — anchored by the first symbol
    // (txtMat) so pool's inner return { get, reset, warm } can't shadow it.
    // Mutation: remove txtMat from the return → anchor fails → RED.
    const retMatch = matSrc.match(/return\s*\{\s*\n\s*(txtMat\s*,[\s\S]+?)\n\s*\};/);
    assert.ok(retMatch, 'createMaterialBuilders must end with return { txtMat, ... }');
    const returned = new Set(
        retMatch[1].split(',').map(s => s.trim()).filter(Boolean)
    );

    // Extract destructured names from the screen.js tombstone.
    const dsMatch = scr.match(/const\s*\{([^}]+)\}\s*=\s*createMaterialBuilders\s*\(/);
    assert.ok(dsMatch, 'screen.js must have createMaterialBuilders destructure');
    const destructured = new Set(
        dsMatch[1].split(',').map(s => s.trim().split(/\s+/).pop()).filter(Boolean)
    );

    const leaked = [...returned].filter(sym => !destructured.has(sym));
    assert.deepStrictEqual(leaked, [],
        'createMaterialBuilders returns symbols not in screen.js destructure: ' + leaked.join(', '));
});

// ── 4. Stale-private guard: factory-private symbols not bare in screen.js ──────
test('factory-private symbols in materials.js do not appear bare in screen.js', () => {
    // Mutation: add bare TXT_STYLES to screen.js body → violations=['TXT_STYLES'] → RED.
    // Kills the whole class: any factory-depth-1 const/let NOT in the return set
    // must not leak into screen.js. Catches TXT_STYLES, _pmXSpriteMat, _fhXSpriteMat
    // and any future factory-private additions automatically.
    const matSrc = stripComments(src());
    const scrRaw = screenSrc();

    // Extract the returned symbol set (reuse test 3's anchor).
    const retMatch = matSrc.match(/return\s*\{\s*\n\s*(txtMat\s*,[\s\S]+?)\n\s*\};/);
    assert.ok(retMatch, 'return block must be present');
    const returned = new Set(
        retMatch[1].split(',').map(s => s.trim()).filter(Boolean)
    );

    // Factory-depth-1 const/let declarations: exactly 4-space indent.
    // These are factory-private vars (_pmXSpriteMat, _fhXSpriteMat, TXT_STYLES …).
    // Depth-2 locals (const T = getT() etc.) have 8+ spaces — excluded by anchor.
    const privateSyms = [];
    for (const m of matSrc.matchAll(/^ {4}(?:const|let)\s+(\w+)/gm)) {
        const sym = m[1];
        if (!returned.has(sym)) privateSyms.push(sym);
    }
    assert.ok(privateSyms.length > 0, 'factory must have at least one private depth-1 declaration');

    // Strip screen.js of import lines, comments, and the destructure line.
    let scr = scrRaw.replace(/^import\s+.*\n/gm, '');
    scr = stripComments(scr);
    scr = scr.replace(/const\s*\{[^}]+\}\s*=\s*createMaterialBuilders\s*\([^)]*\)\s*;/, '');

    const violations = privateSyms.filter(sym =>
        new RegExp('\\b' + sym + '\\b').test(scr)
    );
    assert.deepStrictEqual(violations, [],
        'screen.js must not reference factory-private materials.js symbols: ' + violations.join(', '));
});

// ── 5. DI: T is accessed via getT() at call time, not factory construction ───
test('material builder functions call getT() at call time', () => {
    // Mutation: top-level `const T = getT()` at factory construction → RED.
    // Each function must call getT() inside its own body.
    const s = src();
    // Must NOT have `const T = getT()` at the top level of the factory
    // (outside any function body). Check that it's scoped inside function bodies.
    assert.doesNotMatch(
        s,
        /createMaterialBuilders\s*\([^)]*\)\s*\{[^}]*const T = getT\(\)/,
        'T must not be captured at factory construction — only inside function bodies'
    );
    // Each T-using function must contain getT() in its body.
    for (const fn of ['txtMat', 'pinchHarmonicMat', 'naturalHarmonicMat', 'muteXMat',
                      'triMat', 'bendChevronMat', 'slideArrowMat',
                      '_meshMatForGhostFretDigit', '_spriteMat2MeshMat']) {
        const fnIdx = s.indexOf(`function ${fn}(`);
        assert.ok(fnIdx !== -1, `${fn} must exist in materials.js`);
        // Find the body of this function (brace-balanced).
        const openBrace = s.indexOf('{', fnIdx);
        let depth = 1, i = openBrace + 1;
        while (i < s.length && depth > 0) {
            if (s[i] === '{') depth++;
            else if (s[i] === '}') depth--;
            i++;
        }
        const body = s.slice(openBrace, i);
        assert.match(body, /const T = getT\(\)/, `${fn} must call getT() inside its body`);
    }
});

// ── 6. DI: txtCache is accessed via getTxtCache() inside each function ────────
test('txtCache-using functions access cache via getTxtCache()', () => {
    // Mutation: use bare `txtCache[k]` instead → RED (and also a runtime bug).
    const s = stripComments(src());
    // The module code must never reference a bare `txtCache` identifier.
    assert.doesNotMatch(s, /\btxtCache\b/, 'materials.js code must not reference bare txtCache — use getTxtCache()');
    // Each cache-using function must call getTxtCache().
    for (const fn of ['txtMat', 'pinchHarmonicMat', 'naturalHarmonicMat', 'muteXMat']) {
        assert.ok(s.includes(`function ${fn}(`), `${fn} must exist`);
        const fnIdx = s.indexOf(`function ${fn}(`);
        const openBrace = s.indexOf('{', fnIdx);
        let depth = 1, i = openBrace + 1;
        while (i < s.length && depth > 0) {
            if (s[i] === '{') depth++;
            else if (s[i] === '}') depth--;
            i++;
        }
        const body = s.slice(openBrace, i);
        assert.match(body, /getTxtCache\(\)/, `${fn} must call getTxtCache() inside its body`);
    }
});

// ── 7. DI: techMatCache param used (not bare _techMatCache) ──────────────────
test('triMat/bendChevronMat/slideArrowMat use techMatCache DI param', () => {
    // Mutation: use `_techMatCache.get(key)` → RED (and runtime ReferenceError).
    const s = stripComments(src());
    assert.doesNotMatch(s, /\b_techMatCache\b/, 'materials.js code must not reference _techMatCache — use DI param techMatCache');
});

// ── 8. DI: techMeshMatClones param used (not bare _techMeshMatClones) ─────────
test('_spriteMat2MeshMat uses techMeshMatClones DI param', () => {
    // Mutation: use `_techMeshMatClones.add(clone)` → RED.
    const s = stripComments(src());
    assert.doesNotMatch(s, /\b_techMeshMatClones\b/, 'materials.js code must not reference _techMeshMatClones — use DI param');
});

// ── 9. TXT_STYLES literal pin ────────────────────────────────────────────────
test('TXT_STYLES presets match known-good values', () => {
    // Mutation: change technique.srcH from 128 to 256 → RED.
    const s = src();
    // fretRow / noteFret / ghostFret — srcH 256, strokeW 18
    for (const key of ['fretRow', 'noteFret', 'ghostFret']) {
        assert.match(s, new RegExp(key + '[\\s\\S]{0,400}srcH:\\s*256'), `${key}.srcH must be 256`);
        assert.match(s, new RegExp(key + '[\\s\\S]{0,400}strokeW:\\s*18'), `${key}.strokeW must be 18`);
    }
    // All three large presets share this stroke color.
    assert.ok(s.includes("stroke: '#0a1018'"), "fretRow/noteFret/ghostFret stroke must be '#0a1018'");
    // chord / section / technique / open — srcH 128, strokeW 6
    for (const key of ['chord', 'section', 'technique', 'open']) {
        assert.match(s, new RegExp(key + '[\\s\\S]{0,400}srcH:\\s*128'), `${key}.srcH must be 128`);
        assert.match(s, new RegExp(key + '[\\s\\S]{0,400}strokeW:\\s*6'), `${key}.strokeW must be 6`);
    }
});

// ── 10. darkenHex is pure (no T dependency) ──────────────────────────────────
test('darkenHex has no getT() call', () => {
    // Mutation: add getT() call → RED (no T needed for a pure bit-twiddler).
    const s = src();
    const fnIdx = s.indexOf('function darkenHex(');
    assert.ok(fnIdx !== -1, 'darkenHex must exist');
    const openBrace = s.indexOf('{', fnIdx);
    let depth = 1, i = openBrace + 1;
    while (i < s.length && depth > 0) {
        if (s[i] === '{') depth++;
        else if (s[i] === '}') depth--;
        i++;
    }
    const body = s.slice(openBrace, i);
    assert.doesNotMatch(body, /getT\(\)/, 'darkenHex must not call getT() — it is a pure bit-twiddler');
});

// ── 11. pool has no getT() call ──────────────────────────────────────────────
test('pool has no getT() call', () => {
    // Mutation: add getT() call → RED (pool creates no Three.js objects).
    const s = src();
    const fnIdx = s.indexOf('function pool(parent, mk)');
    assert.ok(fnIdx !== -1, 'pool must exist in materials.js');
    const openBrace = s.indexOf('{', fnIdx);
    let depth = 1, i = openBrace + 1;
    while (i < s.length && depth > 0) {
        if (s[i] === '{') depth++;
        else if (s[i] === '}') depth--;
        i++;
    }
    const body = s.slice(openBrace, i);
    assert.doesNotMatch(body, /getT\(\)/, 'pool must not call getT() — it is a pure container factory');
});

// ── 12. screen.js tombstone is present ───────────────────────────────────────
test('screen.js has the h3d-carve-6 tombstone comment', () => {
    // Mutation: delete the tombstone block → RED.
    assert.match(screenSrc(), /h3d-carve-6: material builders/, 'tombstone comment must be present');
    assert.match(screenSrc(), /const _techMatCache = new Map\(\)/, '_techMatCache must be hoisted to screen.js factory scope');
});

// ── 13. _techMatCache NOT declared in materials.js code ───────────────────────
test('_techMatCache is not declared in materials.js code', () => {
    // Mutation: move const _techMatCache = new Map() into materials.js → RED
    // (teardown accesses it directly via the factory-scope const).
    assert.doesNotMatch(stripComments(src()), /const _techMatCache\s*=/,
        '_techMatCache must not be declared in materials.js — it stays in screen.js factory scope for teardown');
});

// ── 14. txtMat caches and returns a SpriteMaterial ───────────────────────────
test('txtMat creates and caches a SpriteMaterial on cache miss', () => {
    // Mutation: remove `cache[k] = mat` → txtMat allocates a new material every call → RED.
    const createMaterialBuilders = loadFactory();
    const di = makeDI();
    const { txtMat } = createMaterialBuilders(di);

    const m1 = txtMat('5', '#ff0000', false, 'noteFret');
    assert.ok(m1, 'txtMat must return a material');
    const m2 = txtMat('5', '#ff0000', false, 'noteFret');
    assert.strictEqual(m1, m2, 'txtMat must return the same instance on cache hit');
    const m3 = txtMat('5', '#00ff00', false, 'noteFret');
    assert.notStrictEqual(m1, m3, 'different color → different material');
});

// ── 15. triMat cache uses techMatCache (DI param), not a local Map ───────────
test('triMat stores results in techMatCache and returns cached entry', () => {
    // Mutation: return a fresh material every call → RED.
    const createMaterialBuilders = loadFactory();
    const di = makeDI();
    const { triMat } = createMaterialBuilders(di);

    assert.strictEqual(di.techMatCache.size, 0, 'techMatCache starts empty');
    const m1 = triMat(true, 0xff0000);
    assert.strictEqual(di.techMatCache.size, 1, 'triMat must populate techMatCache');
    const m2 = triMat(true, 0xff0000);
    assert.strictEqual(m1, m2, 'triMat cache hit must return same object');
});

// ── 16. pool warm() pre-allocates and warm() is idempotent ───────────────────
test('pool.warm pre-allocates up to cap and is idempotent past cap', () => {
    // Mutation: remove while-loop in warm() → warm() allocates nothing → RED.
    const createMaterialBuilders = loadFactory();
    const di = makeDI();
    const { pool } = createMaterialBuilders(di);

    const parent = { add() {} };
    let mkCount = 0;
    const p = pool(parent, () => { mkCount++; return { visible: true, center: null }; });

    p.warm(5);
    assert.strictEqual(mkCount, 5, 'warm(5) must pre-allocate 5 objects');
    p.warm(3); // below current length — must be idempotent
    assert.strictEqual(mkCount, 5, 'warm(3) after warm(5) must not allocate more');
    p.warm(8);
    assert.strictEqual(mkCount, 8, 'warm(8) after warm(5) must allocate 3 more');
});
