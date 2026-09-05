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
