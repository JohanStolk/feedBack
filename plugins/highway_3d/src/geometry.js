/**
 * Pure geometry helpers — h3d-carve-1.
 *
 * All exports are stateless; they depend only on the compile-time constants
 * below (which mirror their factory-scope counterparts in screen.js verbatim
 * and never vary at runtime).  No DOM, no Three.js imports, no side-effects.
 *
 * screen.js keeps a 1-arg delegator:
 *   const fretX = f => geoFretX(f, _h3dFretUniform);
 * so no call site in screen.js changes.
 */

// ── Compile-time constants (mirror screen.js; never vary at runtime) ─────────

const SCALE = 2.25;
const K = SCALE / 300;
// Horizontal stretch factor for fret X positions.
const FRET_SCALE = SCALE * 1.1;
const NFRETS = 24;
/**
 * Pure 12-semitone spacing compresses toward the bridge; multiply each
 * segment above this fret by the factor so high positions stay
 * slightly more playable/readable in 3D.
 */
const FRET_SPACING_STRETCH_ABOVE12 = 1.1;
const FRET_SPACING_ANCHOR_F = 12;
/** Note travel speed. */
const TS = 230 * K;

// ── Fret X ───────────────────────────────────────────────────────────────────

// Logarithmic spacing — mirrors real guitar fret geometry (12th root of 2).
const _fretXLog = f => {
    if (f <= 0) return 0;
    const raw = FRET_SCALE - FRET_SCALE / Math.pow(2, f / 12);
    if (f <= FRET_SPACING_ANCHOR_F) return raw;
    const rawAnchor = FRET_SCALE - FRET_SCALE / Math.pow(2, FRET_SPACING_ANCHOR_F / 12);
    return rawAnchor + (raw - rawAnchor) * FRET_SPACING_STRETCH_ABOVE12;
};
// Uniform spacing — same column width per fret (chart-format style).
// Total board width equals the logarithmic NFRETS position for consistency.
const _fretXUniStep = _fretXLog(NFRETS) / NFRETS;
const _fretXUni = f => f <= 0 ? 0 : f * _fretXUniStep;

/**
 * World-space X position for fret `f`.
 * @param {number}  f       fret number
 * @param {boolean} uniform true → uniform (chart-format) spacing; false → logarithmic
 */
export const geoFretX = (f, uniform) => uniform ? _fretXUni(f) : _fretXLog(f);

// ── Time → Z ─────────────────────────────────────────────────────────────────

/** Convert a time delta (seconds) to a world-space Z offset (notes travel toward −Z). */
export const dZ = dt => -dt * TS;

// ── Slide trail ───────────────────────────────────────────────────────────────

/**
 * Pitched slide uses `sl`, unpitched uses `slu` (slide-to vs unpitched slide fields).
 * Prefer `sl` when both are present — matches RS wire.
 * @returns {{ endFret: number, unpitched: boolean } | null}
 */
export function slideTrailEnd(n) {
    const sl = n.sl;
    const slu = n.slu;
    if (Number.isFinite(sl) && sl >= 0) {
        return { endFret: sl | 0, unpitched: false };
    }
    if (Number.isFinite(slu) && slu >= 0) {
        return { endFret: slu | 0, unpitched: true };
    }
    return null;
}

// ── Camera distance building blocks ──────────────────────────────────────────

// Camera tgtDist building blocks. Both the dynamic (camera-follow)
// and locked (frets 1-12) branches compose tgtDist from these, so
// any future tuning of the base zoom curve or low-fret pullback
// lands in both branches without drift.
//   span    — camDistMax - camDistMin in fret-span units
//   minFret — lowest fretted note in the camera window (or 1 for
//             the locked branch, which assumes nut chords)
export const camBaseDistU = span => 65 + Math.max(span, 4) * 3;
export const camLowFretPullbackU = minFret => Math.max(0, 5 - minFret) * 4;

// ── BPM estimation ────────────────────────────────────────────────────────────

export function computeBPM(beats, t) {
    if (!beats || beats.length < 2) return 120;
    let lo = 0, hi = beats.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (beats[mid].time < t) lo = mid + 1; else hi = mid;
    }
    let closest = lo;
    if (lo === beats.length) closest = beats.length - 1;
    else if (lo > 0 && Math.abs(beats[lo - 1].time - t) < Math.abs(beats[lo].time - t)) closest = lo - 1;
    const start = Math.max(0, closest - 2);
    const end = Math.min(beats.length - 1, closest + 2);
    let sum = 0, count = 0;
    for (let i = start; i < end; i++) {
        const dt = beats[i + 1].time - beats[i].time;
        if (dt > 0) { sum += dt; count++; }
    }
    return count > 0 && sum > 0 ? 60 / (sum / count) : 120;
}

// ── Render-order layer stack — h3d-carve-1b ───────────────────────────────────

export const RENDER_ORDER_LAYER_STACK = Object.freeze([
    'CHORD_FILL',
    'CHORD_STRUM_FILL',
    'CHORD_STRUM_LINE',
    'SUSTAIN_TRAIL',
    'CHORD_FRAME',
    'CHORD_EDGE_GLOW',
    'CONNECTOR_LINE',
    'FRET_COLUMN',
    'ARP_CONNECTOR_LINE',
    'NOTE_OUTLINE',
    'NOTE_CORE',
    'TECHNIQUE_MARKER',
    'BOARD_STRING',
    'BOARD_FRET_WIRE',
    'NOTE_FRET_LABEL',
    'ARP_NOTE_FRET_LABEL',
    'CHORD_FRET_LABEL',
]);
export const RENDER_ORDER_LAYER_INDEX = Object.freeze(RENDER_ORDER_LAYER_STACK.reduce(
    (indexByLayer, layerName, layerIndex) => {
        indexByLayer[layerName] = layerIndex;
        return indexByLayer;
    },
    Object.create(null)
));

export const RENDER_ORDER_AT_Z_ZERO = 700;
export const RENDER_ORDER_FAR_CLAMP = 50;

/**
 * Computes renderOrder from world depth plus a named layer.
 * Closer objects receive larger values and paint over farther objects; the
 * layer stack breaks ties at the same depth, keeping labels above note gems.
 *
 * The layer index is added as a sub-unit fraction (< 1) so the integer
 * depth bucket STRICTLY dominates: a farther object can never outrank a
 * nearer one merely because it sits on a higher layer. Adding the raw index
 * (0..N-1) directly would let the ~N-wide layer span leak across depth
 * buckets and re-introduce far-over-near bleed for notes within ~N draw
 * units of each other. Fraction granularity (1/N ≈ 0.06) stays well above
 * the 0.0001 intra-element sub-increments used at some call sites.
 */
export function renderOrderForLayerAtZ(worldZ, layerName) {
    const layerIndex = RENDER_ORDER_LAYER_INDEX[layerName];
    if (layerIndex === undefined) throw new Error(`Unknown 3D highway depth layer: ${layerName}`);
    const depthRenderOrder = Math.max(
        RENDER_ORDER_FAR_CLAMP,
        Math.round(RENDER_ORDER_AT_Z_ZERO + worldZ / K)
    );
    return depthRenderOrder + layerIndex / RENDER_ORDER_LAYER_STACK.length;
}

// ── Note key and binary search — h3d-carve-1b ─────────────────────────────────

// Fast integer key for (t, s) pairs — avoids per-frame string allocation in
// hot-path Set lookups. Encodes chart time in 0.1 ms steps (sufficient for
// chart-format note precision) combined with the string index.
// t range 0–600 s → 0–6,000,000; * 10 + s(0–7) = max 60,000,007 < 2^53 ✓.
// The |0 truncates to int32 but the outer multiply stays in float64, so the
// key is always a safe JS integer for songs ≤ 214,748 s (well above any song).
export function _noteKey(t, s) { return ((t * 10000 + 0.5) | 0) * 10 + s; }

// Binary lower-bound: returns the first index i in arr where arr[i].t >= t.
// Assumes arr is sorted ascending by .t (bundle.notes / bundle.chords always are).
// Byte-identical to core's bundle.lowerBoundT — kept as a local because this
// plugin must run on downlevel hosts whose bundles don't carry the helper
// (it's called from ~30 sites incl. top-level helpers that don't receive a
// bundle). New code that already holds a bundle should prefer
// bundle.lowerBoundT / bundle.lowerBoundTime.
export function lowerBoundT(arr, t) {
    let lo = 0, hi = arr.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (arr[mid].t < t) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

/**
 * Return the chart time of the first fretted event that can still affect
 * the camera at `now`, or the next fretted onset after it.
 *
 * This is intentionally a one-time full-chart scan. It runs only when a
 * new song/arrangement's arrays first arrive, allowing the camera to frame
 * the opening phrase during a silent intro instead of waiting for that
 * phrase to enter the live targeting window. Open strings do not define a
 * horizontal fret target, and malformed/out-of-range strings are ignored.
 *
 * Events already inside the behind-window, plus older sustains that are
 * still ringing at `now`, return `now` so bootstrap framing matches the
 * ordinary live path. Future events return their onset time.
 */
export function hwyFirstRelevantFrettedTime(notes, chords, now, behind, stringCount) {
    const nStrings = Number.isFinite(stringCount) ? Math.max(0, Math.floor(stringCount)) : 0;
    const cameraFloor = now - Math.max(0, Number(behind) || 0);
    let first = Infinity;

    const validFretted = n => n
        && n.f > 0
        && Number.isInteger(n.s)
        && n.s >= 0
        && n.s < nStrings;
    const consider = (eventTime, sustain) => {
        const t = Number(eventTime);
        if (!Number.isFinite(t)) return;
        const sus = Number(sustain);
        const end = t + (Number.isFinite(sus) && sus > 0 ? sus : 0);
        if (t < cameraFloor && end < now) return;
        const relevantTime = t <= now ? now : t;
        if (relevantTime < first) first = relevantTime;
    };

    if (notes) {
        for (const n of notes) {
            if (validFretted(n)) consider(n.t, n.sus);
        }
    }
    if (chords) {
        for (const ch of chords) {
            if (!ch || !ch.notes) continue;
            for (const cn of ch.notes) {
                if (validFretted(cn)) consider(ch.t, cn.sus);
            }
        }
    }
    return Number.isFinite(first) ? first : null;
}

// ── Fret mid — h3d-carve-1b ───────────────────────────────────────────────────

/**
 * World-space X of the midpoint of fret column f.
 * f <= 0 → nut-side sentinel (−2K).
 * screen.js keeps `const fretMid = f => geoFretMid(f, _h3dFretUniform);`
 * so no call-site changes in screen.js.
 * @param {number}  f       fret number
 * @param {boolean} uniform true → uniform spacing; false → logarithmic
 */
export const geoFretMid = (f, uniform) => f <= 0 ? -2 * K : (geoFretX(f - 1, uniform) + geoFretX(f, uniform)) / 2;

// ── Gaussian bloom texture ────────────────────────────────────────────────────

// Build a horizontal gaussian DataTexture for the sustain-rail bloom effect.
// Returns a W×1 RGBA texture where alpha follows exp(-0.5*(u−0.5)²/σ²),
// peaking at 1.0 in the centre. With the default σ=0.28 the edges retain
// ~0.20 alpha (not fully transparent) — a deliberately soft, wide falloff
// so the additive bloom fades gradually rather than cutting off sharply.
// Power-of-two width keeps WebGL mipmapping happy.
export function _makeGaussTex(ThreeLib, w = 128, sigma = 0.28) {
    const data = new Uint8Array(w * 4);
    for (let i = 0; i < w; i++) {
        const u = i / (w - 1);
        const d = (u - 0.5) / sigma;
        const v = Math.exp(-0.5 * d * d);
        const a = Math.round(v * 255);
        data[i * 4]     = 255;
        data[i * 4 + 1] = 255;
        data[i * 4 + 2] = 255;
        data[i * 4 + 3] = a;
    }
    const tex = new ThreeLib.DataTexture(data, w, 1, ThreeLib.RGBAFormat);
    // LinearFilter on both axes so the bloom plane interpolates smoothly
    // when scaled — the default NearestFilter causes visible banding.
    tex.magFilter = ThreeLib.LinearFilter;
    tex.minFilter = ThreeLib.LinearFilter;
    tex.needsUpdate = true;
    return tex;
}
