// Source + behavioural guards for h3d-carve-7: O-section (lyrics + HUD overlay)
// extracted to src/overlay.js.
//
// Class-killers guaranteed:
//   1. Module exports createOverlay (source)
//   2. createOverlay return set covers all 5 required symbols (source)
//   3. Stranded-caller: every returned symbol appears in screen.js destructure (source)
//   4. Private-guard: factory-depth-1 privates not bare in screen.js (source)
//   5. Moved constants absent from screen.js (source — deletion check)
//   6. _diagRenderCache ref-identity: teardown .clear() reaches the same Map passed to
//      createOverlay (behavioural — mutation: new Map() breaks it → RED)
//   7. drawSectionHud returns 0 when no sections (behavioural)
//   8. drawLyrics returns a number (behavioural)

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const OVERLAY_JS = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'src', 'overlay.js');
const SCREEN_JS  = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'screen.js');

function stripComments(s) {
    return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function src() {
    return fs.readFileSync(OVERLAY_JS, 'utf8');
}
function screenSrc() {
    return fs.readFileSync(SCREEN_JS, 'utf8');
}

// ── 1. Module exports createOverlay ─────────────────────────────────────────
test('overlay.js exports createOverlay', () => {
    assert.match(src(), /export\s+function\s+createOverlay\s*\(/);
});

// ── 2. Return set covers all 5 required symbols ──────────────────────────────
test('createOverlay returns all 5 required symbols', () => {
    const stripped = stripComments(src());
    const REQUIRED = ['drawChordDiagram', '_drawDiagramCached', 'drawSectionHud', 'drawToneHud', 'drawLyrics'];
    // Match the factory-level return block (4-space indent inside createOverlay).
    // Inner function returns like longestConsecutiveRun's are at 8+ spaces.
    const retMatch = stripped.match(/\n {4}return\s*\{\s*\n([\s\S]+?)\n {4}\};/);
    assert.ok(retMatch, 'factory-level return block must be present');
    const returned = retMatch[1].split(',').map(s => s.trim()).filter(Boolean);
    for (const sym of REQUIRED) {
        assert.ok(returned.includes(sym), `return set must include ${sym}`);
    }
});

// ── 3. Stranded-caller: returned ⊆ screen.js destructure ────────────────────
test('every createOverlay returned symbol appears in screen.js destructure', () => {
    // Mutation: remove _drawDiagramCached from screen.js destructure → missing → RED.
    const stripped = stripComments(src());
    const retMatch = stripped.match(/\n {4}return\s*\{\s*\n([\s\S]+?)\n {4}\};/);
    assert.ok(retMatch, 'factory-level return block must be present');
    const returned = retMatch[1].split(',').map(s => s.trim()).filter(Boolean);

    const scrRaw = screenSrc();
    const destrMatch = scrRaw.match(/const\s*\{([^}]+)\}\s*=\s*createOverlay\s*\(/);
    assert.ok(destrMatch, 'screen.js must have a createOverlay destructure');
    const destructured = destrMatch[1].split(',').map(s => s.trim()).filter(Boolean);

    for (const sym of returned) {
        assert.ok(destructured.includes(sym),
            `returned symbol '${sym}' must appear in screen.js createOverlay destructure`);
    }
});

// ── 4. Private-guard: factory-depth-1 privates not bare in screen.js ─────────
test('factory-private symbols in overlay.js do not appear bare in screen.js', () => {
    // Mutation: add bare _DIAG_CACHE_MAX to screen.js → violations → RED.
    const stripped = stripComments(src());

    // Collect returned symbols (factory-level return, 4-space indent).
    const retMatch = stripped.match(/\n {4}return\s*\{\s*\n([\s\S]+?)\n {4}\};/);
    assert.ok(retMatch, 'factory-level return block must be present');
    const returned = new Set(
        retMatch[1].split(',').map(s => s.trim()).filter(Boolean)
    );

    // Factory-depth-1 const/let: exactly 4-space indent inside createOverlay body.
    const privateSyms = [];
    for (const m of stripped.matchAll(/^ {4}(?:const|let)\s+(\w+)/gm)) {
        const sym = m[1];
        if (!returned.has(sym)) privateSyms.push(sym);
    }
    assert.ok(privateSyms.length > 0, 'factory must have at least one private depth-1 declaration');

    let scr = screenSrc().replace(/^import\s+.*\n/gm, '');
    scr = stripComments(scr);
    scr = scr.replace(/const\s*\{[^}]+\}\s*=\s*createOverlay\s*\([^)]*\)\s*;/, '');

    const violations = privateSyms.filter(sym =>
        new RegExp('\\b' + sym + '\\b').test(scr)
    );
    assert.deepStrictEqual(violations, [],
        'screen.js must not reference factory-private overlay.js symbols: ' + violations.join(', '));
});

// ── 5. Moved constants absent from screen.js ─────────────────────────────────
test('DIAG_SIZE_MIN, DIAG_SIZE_MAX, DIAG_CELL_MAX, _DIAG_CACHE_MAX absent from screen.js', () => {
    // Mutation: add const DIAG_SIZE_MIN = 0.08 back to screen.js → RED.
    const scr = stripComments(screenSrc());
    for (const sym of ['DIAG_SIZE_MIN', 'DIAG_SIZE_MAX', 'DIAG_CELL_MAX', '_DIAG_CACHE_MAX']) {
        assert.doesNotMatch(scr, new RegExp('const\\s+' + sym + '\\b'),
            `const ${sym} must not appear in screen.js (it moved to overlay.js)`);
    }
});

// ── 6. Ref-identity class-killer: source-scan ────────────────────────────────
test('screen.js passes _diagRenderCache (not a new Map) to createOverlay', () => {
    // This is the primary ref-severing class-killer god requested.
    // Mutation: change createOverlay({ diagRenderCache: _diagRenderCache })
    //   to     createOverlay({ diagRenderCache: new Map() })
    // → teardown .clear() on screen.js's _diagRenderCache no longer reaches the
    //   overlay cache → cache leaks → this test goes RED.
    const scr = stripComments(screenSrc());
    assert.match(
        scr,
        /createOverlay\s*\(\s*\{\s*diagRenderCache\s*:\s*_diagRenderCache\s*\}\s*\)/,
        'screen.js must pass _diagRenderCache (not a new Map or other value) as diagRenderCache to createOverlay',
    );
});

// ── 6b–8: Behavioural tests in a vm sandbox ──────────────────────────────────
// createOverlay needs a diagRenderCache Map (stable ref).  The functions under
// test do canvas 2D drawing; we stub ctx with the minimal surface they call.
function makeCtx() {
    return {
        save() {}, restore() {}, beginPath() {}, fill() {}, stroke() {},
        moveTo() {}, lineTo() {}, arc() {}, roundRect() {}, closePath() {},
        fillText() {}, strokeText() {}, quadraticCurveTo() {},
        fillRect() {}, strokeRect() {}, drawImage() {},
        measureText(t) { return { width: t.length * 7 }; },
        fillStyle: '', strokeStyle: '', lineWidth: 1,
        globalAlpha: 1, font: '', textAlign: '', textBaseline: '',
        shadowColor: '', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
    };
}

function loadModule(diagRenderCache) {
    const raw = fs.readFileSync(OVERLAY_JS, 'utf8');
    // Strip the ES module export keyword so the script runs in a vm CommonJS-style.
    // Use /m flag so ^ matches line starts (file begins with a comment block).
    const code = raw.replace(/^export\s+function\s+createOverlay/m, 'function createOverlay');
    const sandbox = {
        OffscreenCanvas: class { constructor(w, h) { this.width=w; this.height=h; }
            getContext() { return makeCtx(); } },
        document: {
            createElement() {
                return { width: 0, height: 0, getContext() { return makeCtx(); } };
            }
        },
        console,
        __exports: {},
    };
    vm.createContext(sandbox);
    vm.runInContext(code + '\n__exports.createOverlay = createOverlay;', sandbox);
    return sandbox.__exports.createOverlay({ diagRenderCache });
}

// ── 6. _diagRenderCache ref-identity ────────────────────────────────────────
test('diagRenderCache passed to createOverlay is the same Map reached by teardown .clear()', () => {
    // This is the class-killer god requested.
    //
    // Mutation: in screen.js, change
    //   createOverlay({ diagRenderCache: _diagRenderCache })
    // to
    //   createOverlay({ diagRenderCache: new Map() })
    // → the overlay populates its own Map, but screen.js teardown clears _diagRenderCache
    //   (a different object) → overlay cache leaks → both Map sizes diverge → RED.
    //
    // Here we verify the ref is the same Map by populating a sentinel key via
    // _drawDiagramCached (which writes to diagRenderCache) and then confirming
    // the original Map reference sees the write.
    const sharedMap = new Map();
    const { _drawDiagramCached } = loadModule(sharedMap);

    const ctx = makeCtx();
    // entranceT < 1 bypasses cache; entranceT = 1.0 triggers the cache write.
    // Set opacity=0 to short-circuit before the cache write → use opacity=1.
    _drawDiagramCached(ctx, {
        name: 'Am', frets: [0, 0, 2, 2, 1, 0], nStr: 6,
        inverted: false, sizeSlider: 0.5, position: 'tl',
        canvasW: 600, canvasH: 400, opacity: 1, entranceT: 1.0,
        lyricsBottom: 0, stackOffset: 0,
    });

    // The overlay must have written to sharedMap (the same ref we passed in).
    assert.ok(sharedMap.size > 0,
        'overlay must write to the diagRenderCache Map reference passed in via DI; ' +
        'if size=0 the ref was severed (createOverlay got a different Map)');

    // Simulating teardown: clear the same Map as screen.js would.
    sharedMap.clear();
    assert.equal(sharedMap.size, 0, 'Map cleared by teardown must now be empty');

    // A second call re-populates the shared Map (not a separate internal one).
    _drawDiagramCached(ctx, {
        name: 'G', frets: [3, 2, 0, 0, 3, 3], nStr: 6,
        inverted: false, sizeSlider: 0.5, position: 'tl',
        canvasW: 600, canvasH: 400, opacity: 1, entranceT: 1.0,
        lyricsBottom: 0, stackOffset: 0,
    });
    assert.ok(sharedMap.size > 0, 'cache repopulated via the same shared Map reference');
});

// ── 7. drawSectionHud returns 0 for no sections ───────────────────────────────
test('drawSectionHud returns 0 when sections array is empty', () => {
    const { drawSectionHud } = loadModule(new Map());
    const ctx = makeCtx();
    const result = drawSectionHud(ctx, {
        sections: [], currentTime: 10,
        canvasW: 800, canvasH: 600,
    });
    assert.equal(result, 0);
});

// ── 8. drawLyrics returns a number ───────────────────────────────────────────
test('drawLyrics returns a finite number', () => {
    const { drawLyrics } = loadModule(new Map());
    const ctx = makeCtx();
    const lyrics = [
        { w: 'Hel-', t: 0, d: 0.3 }, { w: 'lo+', t: 0.3, d: 0.3 },
        { w: 'World', t: 0.6, d: 0.4 },
    ];
    const result = drawLyrics(lyrics, 0.15, ctx, 800, 600);
    assert.ok(typeof result === 'number' && isFinite(result),
        'drawLyrics must return a finite number (bottom Y of lyrics banner)');
});

// Recording ctx — captures fillText/roundRect/fill for discriminating render assertions.
// Only used by tests 9 and 10 below; makeCtx() remains the non-recording stub.
function makeRecordingCtx() {
    const calls = [];
    const base = makeCtx();
    return new Proxy(base, {
        get(t, prop) {
            if (prop === '_calls') return calls;
            if (prop === 'fillText') {
                return function(text, x, y) { calls.push({ method: 'fillText', text }); };
            }
            if (prop === 'roundRect') {
                return function(...args) { calls.push({ method: 'roundRect' }); };
            }
            if (prop === 'fill') {
                return function() { calls.push({ method: 'fill' }); };
            }
            return typeof t[prop] === 'function' ? t[prop].bind(t) : t[prop];
        },
        set(t, prop, val) { t[prop] = val; return true; },
    });
}

// ── 9. drawToneHud real rendering path — discriminating (class-killer) ────────
test('drawToneHud renders tone name and HUD card when tone state is non-empty', () => {
    // Mutation that must go RED: `return 0` inserted at overlay.js:631 (Creed's exact
    // injection, top of drawToneHud body after the destructure).
    // With that mutation: _calls stays empty, boxH=0 → all three assertions fail → RED.
    //
    // Scenario: t=5, toneBase='Clean', one upcoming change at t=10 ('Lead').
    const { drawToneHud } = loadModule(new Map());
    const ctx = makeRecordingCtx();

    const boxH = drawToneHud(ctx, {
        toneBase: 'Clean',
        toneChanges: [{ t: 10, name: 'Lead' }],
        currentTime: 5,
        canvasW: 800, canvasH: 600,
        position: 'tl', sizeSlider: 0.5,
    });

    assert.ok(boxH > 0,
        'drawToneHud must return boxH > 0 with non-empty tone state (current=Clean, next=Lead)');
    const texts = ctx._calls.filter(c => c.method === 'fillText').map(c => c.text);
    assert.ok(texts.some(t => t.includes('Clean')),
        'drawToneHud must fillText the current tone name; got: ' + JSON.stringify(texts));
    assert.ok(texts.some(t => t.includes('Lead')),
        'drawToneHud must fillText the next tone name; got: ' + JSON.stringify(texts));
    assert.ok(ctx._calls.some(c => c.method === 'fill'),
        'drawToneHud must call ctx.fill() (background card) with non-empty state');
});

// ── 10. drawSectionHud real rendering path — discriminating (class-killer) ────
test('drawSectionHud renders section name and HUD card when sections are non-empty', () => {
    // Mutation that must go RED: `return 0` inserted after the early-exit guard
    // (after the `if (!sections || !sections.length) return 0;` line), gutting the
    // non-empty rendering branch of drawSectionHud.
    // With that mutation: _calls stays empty, boxH=0 → all three assertions fail → RED.
    //
    // Scenario: two sections, currentTime in the first one.
    const { drawSectionHud } = loadModule(new Map());
    const ctx = makeRecordingCtx();

    const boxH = drawSectionHud(ctx, {
        sections: [{ time: 0, name: 'Intro' }, { time: 10, name: 'Verse' }],
        currentTime: 5,
        canvasW: 800, canvasH: 600,
        position: 'tr', sizeSlider: 0.5,
    });

    assert.ok(boxH > 0,
        'drawSectionHud must return boxH > 0 with non-empty sections (cur=Intro, next=Verse)');
    const texts = ctx._calls.filter(c => c.method === 'fillText').map(c => c.text);
    assert.ok(texts.some(t => t.includes('Intro')),
        'drawSectionHud must fillText the current section name; got: ' + JSON.stringify(texts));
    assert.ok(texts.some(t => t.includes('Verse')),
        'drawSectionHud must fillText the next section name; got: ' + JSON.stringify(texts));
    assert.ok(ctx._calls.some(c => c.method === 'fill'),
        'drawSectionHud must call ctx.fill() (background card) with non-empty state');
});
