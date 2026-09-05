// h3d-carve-10: Regression coverage for score FX (notedetect ≥1.13) extracted
// into plugins/highway_3d/src/score-fx.js.
//
// Strategy (source-level, matching the rest of tests/js/):
//   - gut-audit every export + internal path via source-scan
//   - class-killers: fxTeardown listener removal, _fxGen increment
//   - verbatim-declaration of the no-re-entry-guard behavior in fxInit
//   - wiring-correspondence guard for createScoreFx({...}) in screen.js

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCREEN_JS   = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'screen.js');
const SCORE_FX_JS = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'src', 'score-fx.js');

const src       = fs.readFileSync(SCREEN_JS,   'utf8');
const scoreFxSrc = fs.readFileSync(SCORE_FX_JS, 'utf8');

// ── Module shape ────────────────────────────────────────────────────────────

test('score-fx.js exports createScoreFx', () => {
    assert.match(scoreFxSrc, /export\s+function\s+createScoreFx\s*\(/,
        'score-fx.js must export createScoreFx');
});

test('createScoreFx returns all four expected exports', () => {
    assert.match(
        scoreFxSrc,
        /return\s*\{[^}]*fxInit[^}]*fxTeardown[^}]*fxSpawnPop\s*:\s*_fxSpawnPop[^}]*drawScoreFx[^}]*\}/,
        'factory must return { fxInit, fxTeardown, fxSpawnPop: _fxSpawnPop, drawScoreFx, ... }',
    );
});

// ── DI rewires — all 7 beyond-subst changes ─────────────────────────────────

test('_fxSpawnPop uses getNdFrameNowMs() DI getter, not _ndFrameNowMs directly', () => {
    assert.match(
        scoreFxSrc,
        /getNdFrameNowMs\(\)\s*\|\|\s*performance\.now\(\)/,
        '_fxSpawnPop must call getNdFrameNowMs() for the current-time sample',
    );
    // Sever: replace getNdFrameNowMs() with a literal → nowMs is always a
    // stale value and the TTL dedup fires wrong. The test goes RED.
    assert.doesNotMatch(
        scoreFxSrc,
        /const\s+nowMs\s*=\s*_ndFrameNowMs\s*\|\|/,
        '_ndFrameNowMs must not appear bare in the module (must use DI getter)',
    );
});

test('drawScoreFx aliases cam and _probe from DI getters at function entry', () => {
    assert.match(
        scoreFxSrc,
        /const\s+cam\s*=\s*getCam\(\)/,
        'drawScoreFx must alias cam via getCam()',
    );
    assert.match(
        scoreFxSrc,
        /const\s+_probe\s*=\s*getProbe\(\)/,
        'drawScoreFx must alias _probe via getProbe()',
    );
});

test('drawScoreFx calls getNStr() and getCurX() inline (no bare nStr / curX)', () => {
    assert.match(
        scoreFxSrc,
        /sY\(\s*getNStr\(\)\s*-\s*1\s*\)/,
        'drawScoreFx must call getNStr() for the string-count probe',
    );
    assert.match(
        scoreFxSrc,
        /_probe\.set\(\s*getCurX\(\)/,
        'drawScoreFx must call getCurX() for the strike-line X coordinate',
    );
});

test('fxInit uses getHighwayCanvas() inside the event closure, not a captured ref', () => {
    assert.match(
        scoreFxSrc,
        /getHighwayCanvas\(\)\s*\|\|\s*!t\.parentElement\.contains\(\s*getHighwayCanvas\(\)\s*\)/,
        'fxInit closure must call getHighwayCanvas() per-event for panel scoping',
    );
    // Sever: bake in a captured ref → panel isolation breaks on canvas swap.
    assert.doesNotMatch(
        scoreFxSrc,
        /const\s+hc\s*=\s*getHighwayCanvas\(\)[\s\S]*?t\.parentElement\.contains\(\s*hc\s*\)/,
        'fxInit must not capture highwayCanvas into a local (must re-read per event)',
    );
});

// ── fxInit gut-audit ────────────────────────────────────────────────────────

test('fxInit calls _fxResolvePalette before registering the listener', () => {
    assert.match(
        scoreFxSrc,
        /function\s+fxInit[\s\S]*?_fxResolvePalette\(\)[\s\S]*?window\.addEventListener\('notedetect:fx'/,
        'fxInit must resolve the palette before arming the event listener',
    );
});

test('fxInit registers the notedetect:fx listener on window', () => {
    assert.match(
        scoreFxSrc,
        /window\.addEventListener\(\s*'notedetect:fx'\s*,\s*_fxOnFx\s*\)/,
        'fxInit must register _fxOnFx on window for notedetect:fx',
    );
});

test('fxInit registers the notedetect:skin skin-change listener via feedBack bus', () => {
    assert.match(
        scoreFxSrc,
        /window\.feedBack\.on\(\s*'notedetect:skin'\s*,\s*_fxOnSkin\s*\)/,
        'fxInit must register _fxOnSkin for skin changes',
    );
});

// CLASS-KILLER: no re-entry guard (VERBATIM-PRESERVED from original screen.js)
// The original init block had no guard. Adding one without a corresponding
// double-register test is a silent behavior change. This test asserts the
// absence so any accidental addition turns RED.
test('fxInit has no re-entry guard (verbatim-preserved: original had none)', () => {
    assert.doesNotMatch(
        scoreFxSrc,
        /function\s+fxInit[\s\S]{0,80}if\s*\(\s*_fxOnFx\s*\)\s*return/,
        'fxInit must not have a re-entry guard (verbatim from original; see cut-10 dispatch)',
    );
});

// ── fxTeardown gut-audit + class-killers ────────────────────────────────────

// CLASS-KILLER (a): sever fxTeardown listener removal → listeners live on.
// If window.removeEventListener call is deleted, this test fails because
// the pattern is gone. Combined with the _fxGen increment test below these
// two together cover the complete teardown contract.
test('fxTeardown removes the notedetect:fx listener (class-killer: sever → RED)', () => {
    assert.match(
        scoreFxSrc,
        /window\.removeEventListener\(\s*'notedetect:fx'\s*,\s*_fxOnFx\s*\)/,
        'fxTeardown must remove the notedetect:fx listener from window',
    );
});

test('fxTeardown removes the notedetect:skin skin listener via feedBack bus', () => {
    assert.match(
        scoreFxSrc,
        /window\.feedBack\.off\(\s*'notedetect:skin'\s*,\s*_fxOnSkin\s*\)/,
        'fxTeardown must remove the skin listener to avoid palette updates after teardown',
    );
});

test('fxTeardown resets all pop and burst slots to inactive', () => {
    assert.match(
        scoreFxSrc,
        /for\s*\(\s*const\s+p\s+of\s+_fxPops\s*\)\s*p\.active\s*=\s*false/,
        'fxTeardown must deactivate every pop slot',
    );
    assert.match(
        scoreFxSrc,
        /for\s*\(\s*const\s+b\s+of\s+_fxBursts\s*\)\s*b\.active\s*=\s*false/,
        'fxTeardown must deactivate every burst slot',
    );
});

test('fxTeardown clears _fxSeen and resets ring/break anchors', () => {
    assert.match(
        scoreFxSrc,
        /_fxSeen\.clear\(\)/,
        'fxTeardown must clear the pop-dedup map',
    );
    assert.match(
        scoreFxSrc,
        /_fxRingMs\s*=\s*_fxBreakMs\s*=\s*-1e9/,
        'fxTeardown must reset ring and break anchors to -1e9',
    );
});

// CLASS-KILLER (b): sever _fxGen increment → deferred window-copy fallback
// fires after teardown and can arm state on the next fresh init. If the
// increment line is deleted this test fails.
test('fxTeardown increments _fxGen to invalidate deferred window-copy fallbacks (class-killer: sever → RED)', () => {
    assert.match(
        scoreFxSrc,
        /_fxGen\+\+/,
        'fxTeardown must increment _fxGen so setTimeout callbacks from the prior session bail',
    );
});

test('fxTeardown resets _fxElemSeen to a fresh WeakSet', () => {
    assert.match(
        scoreFxSrc,
        /_fxElemSeen\s*=\s*new\s+WeakSet\(\)/,
        'fxTeardown must reset _fxElemSeen so stale details from the prior session are not re-deduplicated',
    );
});

// ── _fxHandle gut-audit ─────────────────────────────────────────────────────

test('_fxHandle deduplicates on reference equality with _fxLastFxDetail', () => {
    assert.match(
        scoreFxSrc,
        /if\s*\(\s*d\s*===\s*_fxLastFxDetail\s*\)\s*return/,
        '_fxHandle must bail on duplicate detail reference',
    );
});

test('_fxHandle routes milestone → burst, multiplier-up → ring, streakBreak → break', () => {
    assert.match(
        scoreFxSrc,
        /d\.fxType\s*===\s*'milestone'[\s\S]*?_fxSpawnBurst\(\s*nowMs\s*\)/,
        'milestone must spawn a burst',
    );
    assert.match(
        scoreFxSrc,
        /d\.fxType\s*===\s*'multiplier'\s*&&\s*d\.mult\s*>\s*\(\s*d\.prevMult\s*\|\|\s*1\s*\)[\s\S]*?_fxRingMs\s*=\s*nowMs/,
        'multiplier tier-up must arm the ring pulse',
    );
    assert.match(
        scoreFxSrc,
        /d\.fxType\s*===\s*'streakBreak'[\s\S]*?_fxBreakMs\s*=\s*nowMs/,
        'streakBreak must arm the flicker',
    );
});

// ── drawScoreFx gut-audit ───────────────────────────────────────────────────

test('drawScoreFx returns early when cam or probe is falsy', () => {
    assert.match(
        scoreFxSrc,
        /if\s*\(\s*!cam\s*\|\|\s*!_probe\s*\)\s*return/,
        'drawScoreFx must early-exit when cam or probe is unavailable',
    );
});

test('drawScoreFx early-exits when all effects are expired', () => {
    assert.match(
        scoreFxSrc,
        /if\s*\(\s*!anyPop\s*&&\s*!anyBurst\s*&&\s*ringAge\s*>=\s*600\s*&&\s*breakAge\s*>=\s*350\s*\)\s*return/,
        'drawScoreFx must skip canvas work entirely when all effect TTLs are expired',
    );
});

test('drawScoreFx TTL-prunes _fxSeen each frame', () => {
    assert.match(
        scoreFxSrc,
        /for\s*\(\s*const\s+\[k\s*,\s*exp\]\s+of\s+_fxSeen\s*\)[\s\S]*?_fxSeen\.delete\(\s*k\s*\)/,
        'drawScoreFx must prune expired pop-dedup keys every frame',
    );
});

test('drawScoreFx renders streak-break flicker as a fill-rect wash', () => {
    assert.match(
        scoreFxSrc,
        /breakAge\s*<\s*350[\s\S]*?ctx\.fillRect\(\s*0\s*,\s*0\s*,\s*W\s*,\s*H\s*\)/,
        'streak-break flicker must fill the entire panel',
    );
});

test('drawScoreFx computes strike-line center via _probe.project(cam)', () => {
    assert.match(
        scoreFxSrc,
        /_probe\.set\(\s*getCurX\(\)\s*,\s*fretMidY\s*,\s*0\s*\)[\s\S]*?_probe\.project\(\s*cam\s*\)/,
        'strike-line center must be projected from getCurX() via _probe',
    );
});

test('drawScoreFx renders multiplier ring-pulse as an expanding arc', () => {
    assert.match(
        scoreFxSrc,
        /ringAge\s*<\s*600[\s\S]*?ctx\.arc\([\s\S]*?Math\.PI\s*\*\s*2\s*\)/,
        'ring-pulse must draw an expanding arc when active',
    );
});

test('drawScoreFx renders burst particles with gravity', () => {
    assert.match(
        scoreFxSrc,
        /b\.vy\[j\]\s*\+=\s*0\.08/,
        'burst particles must apply gravity each frame',
    );
});

test('drawScoreFx renders "+N" pops that rise and fade over their lifetime', () => {
    assert.match(
        scoreFxSrc,
        /sy2\s*=[\s\S]*?H\s*-\s*t\s*\*\s*30/,
        'pops must rise (subtract t*30) over their lifetime',
    );
    assert.match(
        scoreFxSrc,
        /ctx\.globalAlpha\s*=\s*t\s*<\s*0\.4\s*\?\s*1\s*:\s*1\s*-\s*\(\s*t\s*-\s*0\.4\s*\)\s*\/\s*0\.6/,
        'pops must fade over the back half of their lifetime',
    );
});

// ── _fxSpawnPop gut-audit ───────────────────────────────────────────────────

test('_fxSpawnPop deduplicates via _fxSeen.has(popKey)', () => {
    assert.match(
        scoreFxSrc,
        /_fxSeen\.has\(\s*popKey\s*\)/,
        '_fxSpawnPop must reject duplicate popKeys via _fxSeen',
    );
});

test('_fxSpawnPop sets a 4-second expiry in _fxSeen', () => {
    assert.match(
        scoreFxSrc,
        /_fxSeen\.set\(\s*popKey\s*,\s*nowMs\s*\+\s*4000\s*\)/,
        '_fxSpawnPop must register the popKey with a 4s TTL',
    );
});

test('_fxSpawnPop fills the first inactive slot and returns early (pool-full = drop)', () => {
    assert.match(
        scoreFxSrc,
        /if\s*\(\s*p\.active\s*\)\s*continue[\s\S]*?p\.active\s*=\s*true/,
        '_fxSpawnPop must scan for an inactive slot and claim it',
    );
});

// ── screen.js wiring ────────────────────────────────────────────────────────

test('screen.js imports createScoreFx from src/score-fx.js', () => {
    assert.match(
        src,
        /import\s*\{\s*createScoreFx\s*\}\s*from\s*'\.\/src\/score-fx\.js'/,
        'screen.js must import createScoreFx',
    );
});

test('screen.js destroys original K-section state block (no _fxPops let/const in IIFE scope)', () => {
    // The state block is now inside the factory. If any line leaked back into
    // screen.js this assertion fails.
    assert.doesNotMatch(
        src,
        /const\s+_fxPops\s*=/,
        '_fxPops must not be declared in screen.js after extraction',
    );
    assert.doesNotMatch(
        src,
        /const\s+_fxBursts\s*=/,
        '_fxBursts must not be declared in screen.js after extraction',
    );
});

test('screen.js init callsite replaced with fxInit()', () => {
    assert.match(
        src,
        /fxInit\(\)\s*;/,
        'screen.js init path must call fxInit()',
    );
    assert.doesNotMatch(
        src,
        /window\.addEventListener\(\s*'notedetect:fx'/,
        'screen.js must not directly register notedetect:fx after extraction',
    );
});

test('screen.js teardown callsite replaced with fxTeardown()', () => {
    assert.match(
        src,
        /fxTeardown\(\)\s*;/,
        'screen.js teardown path must call fxTeardown()',
    );
    // The _fxOnFx removal now lives in fxTeardown — not in screen.js.
    assert.doesNotMatch(
        src,
        /window\.removeEventListener\(\s*'notedetect:fx'/,
        'screen.js must not directly unregister notedetect:fx after extraction',
    );
});

// ── Wiring-correspondence guard (extends cut-9 pattern) ─────────────────────
// Structural source-scan: every entry in createScoreFx({...}) must satisfy
// its naming-correspondence class. Kills swaps like (getCam: () => _probe).
// PINNED_RENAMES is empty — all 6 getters are plain convention, sY is shorthand.

test('createScoreFx({...}) wiring has correct naming correspondence (no param swaps)', () => {
    const PINNED_RENAMES = {};

    const ANCHOR = 'const { fxInit, fxTeardown, fxSpawnPop: _fxSpawnPop, drawScoreFx, fxClearSeen } = createScoreFx({';
    const callStart = src.indexOf(ANCHOR);
    assert.ok(callStart >= 0, 'createScoreFx call must be findable in screen.js');
    const blockStart = callStart + ANCHOR.length - 1;
    assert.equal(src[blockStart], '{', 'expected { at computed blockStart');
    let depth = 0, blockEnd = -1;
    for (let i = blockStart; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) { blockEnd = i; break; }
    }
    assert.ok(blockEnd > blockStart, 'createScoreFx argument block must have balanced braces');
    const inner = src.slice(blockStart + 1, blockEnd);

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

    const entries = rawEntries
        .map(e => e.replace(/\/\/[^\n]*/g, '').trim())
        .filter(Boolean);

    assert.ok(entries.length >= 7, `expected at least 7 entries, got ${entries.length}`);

    const violations = [];
    for (const entry of entries) {
        if (!entry.includes(':')) continue; // shorthand

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

        violations.push(`${key}: key:value entry not in PINNED_RENAMES and not a get/set arrow`);
    }

    assert.deepEqual(violations, [], 'createScoreFx wiring violations found');
});
