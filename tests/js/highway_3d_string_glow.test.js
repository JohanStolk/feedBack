// h3d-carve-11: Regression coverage for updateStringHighlights extracted into
// plugins/highway_3d/src/string-glow.js.
//
// Two test classes:
//   - Source-level: module shape, DI wiring in screen.js, wiring-correspondence guard
//   - Behavioral: calls updateStringHighlights with fake mesh/material objects,
//     asserts actual emissive + opacity writes (RED when loop body is gutted)

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SCREEN_JS     = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'screen.js');
const STRING_GLOW_JS = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'src', 'string-glow.js');

const src          = fs.readFileSync(SCREEN_JS,     'utf8');
const stringGlowSrc = fs.readFileSync(STRING_GLOW_JS, 'utf8');

// ── Module shape ─────────────────────────────────────────────────────────────

test('string-glow.js exports createStringGlow', () => {
    assert.match(stringGlowSrc, /export\s+function\s+createStringGlow\s*\(/,
        'string-glow.js must export createStringGlow');
});

test('createStringGlow returns { updateStringHighlights }', () => {
    assert.match(
        stringGlowSrc,
        /return\s*\{\s*updateStringHighlights\s*\}/,
        'factory must return { updateStringHighlights }',
    );
});

// ── DI rewires (source-level) ────────────────────────────────────────────────

test('all 7 getter DI params aliased at updateStringHighlights entry', () => {
    for (const [alias, getter] of [
        ['glowMul',            'getGlowMul'],
        ['_vibrancyIdleOp',    'getVibrancyIdleOp'],
        ['_venueSceneOverride','getVenueSceneOverride'],
        ['nStr',               'getNStr'],
        ['stringLines',        'getStringLines'],
        ['mGlow',              'getMGlow'],
        ['mAccentCore',        'getMAccentCore'],
    ]) {
        assert.match(
            stringGlowSrc,
            new RegExp('const\\s+' + alias.replace('_', '\\_?') + '\\s*=\\s*' + getter + '\\(\\)'),
            `${getter}() must be aliased to ${alias} at function entry`,
        );
    }
});

test('VENUE_GEM_EMISSIVE_MUL is used as a plain const (no getter call)', () => {
    assert.match(
        stringGlowSrc,
        /VENUE_GEM_EMISSIVE_MUL/,
        'VENUE_GEM_EMISSIVE_MUL must appear in the module',
    );
    assert.doesNotMatch(
        stringGlowSrc,
        /getVenueGemEmissiveMul/,
        'VENUE_GEM_EMISSIVE_MUL must not be wrapped in a getter',
    );
});

// ── screen.js wiring ─────────────────────────────────────────────────────────

test('screen.js imports createStringGlow from src/string-glow.js', () => {
    assert.match(
        src,
        /import\s*\{\s*createStringGlow\s*\}\s*from\s*'\.\/src\/string-glow\.js'/,
        'screen.js must import createStringGlow',
    );
});

test('screen.js original updateStringHighlights body is gone (no bare glowMul const inside)', () => {
    // After extraction the function definition no longer lives in screen.js.
    // The clearest signal: `const BASE_GLOW = 0.02 * glowMul` was inside the
    // function body and must not appear in screen.js post-extraction.
    assert.doesNotMatch(
        src,
        /const\s+BASE_GLOW\s*=\s*0\.02\s*\*\s*glowMul/,
        'BASE_GLOW constant must not remain in screen.js after extraction',
    );
});

test('screen.js callsite uses createStringGlow factory destructure', () => {
    assert.match(
        src,
        /const\s*\{\s*updateStringHighlights\s*\}\s*=\s*createStringGlow\s*\(/,
        'screen.js must destructure updateStringHighlights from createStringGlow()',
    );
});

// ── Wiring-correspondence guard (cut-9 pattern, empty PINNED_RENAMES) ────────
// Verifies every entry in createStringGlow({…}) satisfies its naming class.
// Kills swaps like getMGlow: () => mAccentCore.

test('createStringGlow({...}) wiring has correct naming correspondence (no param swaps)', () => {
    const PINNED_RENAMES = {}; // all entries are plain shorthand or standard get-arrows

    const ANCHOR = 'const { updateStringHighlights } = createStringGlow({';
    const callStart = src.indexOf(ANCHOR);
    assert.ok(callStart >= 0, 'createStringGlow call must be findable in screen.js');
    const blockStart = callStart + ANCHOR.length - 1;
    assert.equal(src[blockStart], '{', 'expected { at computed blockStart');
    let depth = 0, blockEnd = -1;
    for (let i = blockStart; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) { blockEnd = i; break; }
    }
    assert.ok(blockEnd > blockStart, 'createStringGlow argument block must have balanced braces');
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

    assert.ok(entries.length >= 8, `expected at least 8 entries, got ${entries.length}`);

    const violations = [];
    for (const entry of entries) {
        if (!entry.includes(':')) continue; // shorthand (VENUE_GEM_EMISSIVE_MUL, etc.)

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

        violations.push(`${key}: key:value entry not in PINNED_RENAMES and not a get/set arrow`);
    }

    assert.deepEqual(violations, [], 'createStringGlow wiring violations found');
});

// ── Behavioral kill test ─────────────────────────────────────────────────────
// Calls updateStringHighlights with fake mesh/material objects and asserts
// the emissive and opacity writes actually happened. RED when loop body is gutted.

test('updateStringHighlights writes emissive intensity and opacity to string meshes (behavioral kill: gut loop → RED)', async () => {
    const { createStringGlow } = await import(pathToFileURL(STRING_GLOW_JS).href);

    // Fake material that records writes.
    const mat0 = { emissiveIntensity: 0, opacity: 0 };
    const mat1 = { emissiveIntensity: 0, opacity: 0 };
    const scaleSet = [];
    const stringLines = [
        { material: mat0, scale: { set(...args) { scaleSet.push([0, ...args]); } } },
        { material: mat1, scale: { set(...args) { scaleSet.push([1, ...args]); } } },
    ];
    const mGlow        = [{ emissiveIntensity: 0 }, { emissiveIntensity: 0 }];
    const mAccentCore  = [{ emissiveIntensity: 0 }, { emissiveIntensity: 0 }];

    const { updateStringHighlights } = createStringGlow({
        VENUE_GEM_EMISSIVE_MUL: 1.12,
        getGlowMul:            () => 1,
        getVibrancyIdleOp:     () => 0.4,
        getVenueSceneOverride: () => false,
        getNStr:               () => 2,
        getStringLines:        () => stringLines,
        getMGlow:              () => mGlow,
        getMAccentCore:        () => mAccentCore,
    });

    // String 0: sustaining (stringSustain=true) + strGlow=0.8
    // String 1: anticipating (stringAnticipation=0.5) + strGlow=0.3
    const noteState = {
        stringSustain:    [true,  false],
        stringAnticipation: [0,   0.5],
        strGlow:          [0.8,   0.3],
        accentFillBoost:  [0,     0],
    };

    updateStringHighlights(noteState);

    // String 0 — sustain intensity=1: BASE_GLOW=0.02, MAX_GLOW=3.5
    const expectedEI0 = 0.02 + 1 * 3.5; // 3.52
    assert.strictEqual(
        mat0.emissiveIntensity,
        expectedEI0,
        `string 0 emissiveIntensity must be BASE_GLOW + MAX_GLOW = ${expectedEI0}`,
    );
    // IDLE_OP=0.4, intensity=1 → opacity = 0.4 + 1*(1-0.4) = 1.0
    assert.strictEqual(mat0.opacity, 1.0, 'string 0 opacity must be 1 when sustaining');

    // String 1 — anticipation=0.5: emissive = 0.02 + 0.5*3.5 = 1.77
    const expectedEI1 = 0.02 + 0.5 * 3.5;
    assert.strictEqual(mat1.emissiveIntensity, expectedEI1,
        `string 1 emissiveIntensity must be BASE_GLOW + 0.5*MAX_GLOW = ${expectedEI1}`);

    // mGlow writes: bg = strGlow * glowMul; venueGemMul = 1 (no venue override)
    assert.strictEqual(mGlow[0].emissiveIntensity, 0.8, 'mGlow[0] must receive strGlow[0] * glowMul');
    assert.strictEqual(mGlow[1].emissiveIntensity, 0.3, 'mGlow[1] must receive strGlow[1] * glowMul');

    // scale.set was called for both strings (intensity > 0)
    assert.ok(scaleSet.length === 2, 'scale.set must be called for both strings');
});

test('updateStringHighlights respects venueSceneOverride multiplier on mGlow (behavioral)', async () => {
    const { createStringGlow } = await import(pathToFileURL(STRING_GLOW_JS).href);

    const mGlow = [{ emissiveIntensity: 0 }];
    const mAccentCore = [{ emissiveIntensity: 0 }];

    const { updateStringHighlights } = createStringGlow({
        VENUE_GEM_EMISSIVE_MUL: 1.12,
        getGlowMul:            () => 1,
        getVibrancyIdleOp:     () => 0.4,
        getVenueSceneOverride: () => true, // venue override ON
        getNStr:               () => 1,
        getStringLines:        () => [null], // no mesh → only glow write
        getMGlow:              () => mGlow,
        getMAccentCore:        () => mAccentCore,
    });

    updateStringHighlights({
        stringSustain:    [false],
        stringAnticipation: [0],
        strGlow:          [1.0],
        accentFillBoost:  [0],
    });

    // bg=1.0, venueGemMul=1.12 → mGlow[0].emissiveIntensity = 1.12
    assert.ok(
        Math.abs(mGlow[0].emissiveIntensity - 1.12) < 1e-9,
        `mGlow emissiveIntensity must be bg * VENUE_GEM_EMISSIVE_MUL = 1.12, got ${mGlow[0].emissiveIntensity}`,
    );
});

test('updateStringHighlights skips null stringLines entries without throwing (behavioral)', async () => {
    const { createStringGlow } = await import(pathToFileURL(STRING_GLOW_JS).href);

    const mGlow = [{ emissiveIntensity: 0 }, { emissiveIntensity: 0 }];
    const mAccentCore = [{ emissiveIntensity: 0 }, { emissiveIntensity: 0 }];

    const { updateStringHighlights } = createStringGlow({
        VENUE_GEM_EMISSIVE_MUL: 1.12,
        getGlowMul:            () => 1,
        getVibrancyIdleOp:     () => 0.4,
        getVenueSceneOverride: () => false,
        getNStr:               () => 2,
        getStringLines:        () => [null, null], // no meshes at all
        getMGlow:              () => mGlow,
        getMAccentCore:        () => mAccentCore,
    });

    // Must not throw; mGlow writes still happen
    assert.doesNotThrow(() => updateStringHighlights({
        stringSustain:    [true, true],
        stringAnticipation: [0, 0],
        strGlow:          [0.5, 0.5],
        accentFillBoost:  [0, 0],
    }));
    assert.strictEqual(mGlow[0].emissiveIntensity, 0.5, 'mGlow writes must still happen for null mesh slots');
});
