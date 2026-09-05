/**
 * Color utilities, tuning helpers, and splitscreen predicates — h3d-carve-3.
 *
 * All exports are pure functions or compile-time constants; none capture
 * factory-scope state.  NSTR and MAX_RENDER_STRINGS are compile-time copies
 * of the matching IIFE constants (both = 6 for the current 6-entry
 * PALETTES.default / S_COL layout).
 */

// ── Compile-time copies of IIFE constants ─────────────────────────────────────
const NSTR = 6;
const MAX_RENDER_STRINGS = 6; // S_COL.length = PALETTES.default.length

// ── Color utilities ───────────────────────────────────────────────────────────

/**
 * Parse a CSS hex color string ('#rrggbb', '#rgb', or bare variants) to a
 * packed 0xRRGGBB integer.  Returns null on any parse failure.
 */
export function _h3dHexToInt(hex) {
    if (typeof hex !== 'string') return null;
    const t = hex.trim().replace(/^#/, '');
    const full = t.length === 3 ? t[0] + t[0] + t[1] + t[1] + t[2] + t[2] : t;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
    return parseInt(full, 16);
}

export function _clampByteI(n) { return n < 0 ? 0 : (n > 255 ? 255 : Math.round(n)); }

export function _darkenInt(hex, factor) {
    const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
    return (_clampByteI(r * factor) << 16) | (_clampByteI(g * factor) << 8) | _clampByteI(b * factor);
}

export function _lightenInt(hex, t) {
    const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
    return (_clampByteI(r + (255 - r) * t) << 16) | (_clampByteI(g + (255 - g) * t) << 8) | _clampByteI(b + (255 - b) * t);
}

// ── String-count resolution ───────────────────────────────────────────────────

/**
 * Resolve the string count for the active arrangement.  Prefer
 * bundle.stringCount (exposed by feedBack core since #93 — derived from
 * notes/chords/tuning, works for 5-string bass, 7- and 8-string guitar).
 * Falls back to arrangement-name detection for older feedBack cores.
 * Clamped to MAX_RENDER_STRINGS so a malformed bundle doesn't index past
 * the per-string material arrays.
 */
export function resolveStringCount(bundle) {
    const sc = bundle && bundle.stringCount;
    if (Number.isFinite(sc) && sc >= 1) {
        return Math.min(Math.trunc(sc), MAX_RENDER_STRINGS);
    }
    return /bass/i.test(bundle?.songInfo?.arrangement || '') ? 4 : NSTR;
}

// ── Tuning / pitch-label helpers ──────────────────────────────────────────────

/** Chart-format tuning entries are semitone offsets from instrument standard. */
export const _NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Open-string MIDI (thick → thin), matched to RS string index 0 low.
export const _BASE_OPEN_MIDI_BASS4   = Object.freeze([28, 33, 38, 43]);
export const _BASE_OPEN_MIDI_BASS5   = Object.freeze([23, 28, 33, 38, 43]);
export const _BASE_OPEN_MIDI_GUITAR6 = Object.freeze([40, 45, 50, 55, 59, 64]);
export const _BASE_OPEN_MIDI_GUITAR7 = Object.freeze([35, 40, 45, 50, 55, 59, 64]);
// F#/B/E standard extension — low string is a fifth below RS 7-string low B.
export const _BASE_OPEN_MIDI_GUITAR8 = Object.freeze([28, 35, 40, 45, 50, 55, 59, 64]);

export function _baseOpenStringMidis(sc, arrangement) {
    const isBass = /bass/i.test(arrangement || '');
    if (sc === 4 && isBass) return _BASE_OPEN_MIDI_BASS4.slice();
    if (sc === 4) return _BASE_OPEN_MIDI_GUITAR6.slice(0, 4);
    if (sc === 5 && isBass) return _BASE_OPEN_MIDI_BASS5.slice();
    if (sc === 5) return _BASE_OPEN_MIDI_GUITAR6.slice(0, 5);
    if (sc === 7) return _BASE_OPEN_MIDI_GUITAR7.slice();
    if (sc === 8) return _BASE_OPEN_MIDI_GUITAR8.slice();
    if (Number.isFinite(sc) && sc > 8) {
        const out = Array.from(_BASE_OPEN_MIDI_GUITAR8);
        let last = out[out.length - 1];
        while (out.length < sc) {
            last += 5;
            out.push(last);
        }
        return out.slice(0, sc);
    }
    const g6 = _BASE_OPEN_MIDI_GUITAR6.slice();
    if (Number.isFinite(sc) && sc < 6 && sc >= 1) return g6.slice(0, sc);
    return g6;
}

export function _midiToPitchLabel(midi) {
    const m = Math.round(midi);
    const octave = Math.floor(m / 12) - 1;
    const n = _NOTE_NAMES_SHARP[(m % 12 + 12) % 12];
    return n + octave;
}

/**
 * @param {object} bundle      Highway render bundle (tuning, capo, stringCount)
 * @param {object} songInfo    WS song_info blob (arrangement, tuning, capo)
 * @param {number} nEffective  String count clamped like nStr / resolveStringCount
 */
export function _openStringPitchLabelsForTuning(bundle, songInfo, nEffective) {
    const n = Number.isFinite(nEffective) ? Math.min(Math.max(1, Math.trunc(nEffective)), MAX_RENDER_STRINGS) : resolveStringCount(bundle);
    // bundle first: chart-transform substitutes tuning/capo there, while
    // songInfo keeps the chart's originals by contract.  A malformed
    // (non-array) bundle.tuning falls back to songInfo instead of
    // blanking the labels.
    let tuning = Array.isArray(bundle.tuning) ? bundle.tuning : (songInfo && songInfo.tuning);
    let cap = bundle.capo;
    cap = Number.isFinite(cap) ? cap : (songInfo && Number.isFinite(songInfo.capo) ? songInfo.capo : 0);
    if (!Array.isArray(tuning)) tuning = [];

    const base = _baseOpenStringMidis(n, songInfo?.arrangement);
    const labels = [];
    for (let s = 0; s < n; s++) {
        const offRaw = tuning[s];
        const off = Number.isFinite(offRaw) ? offRaw : 0;
        const midi = (base[s] !== undefined ? base[s] : 40) + off + cap;
        labels.push(_midiToPitchLabel(midi));
    }
    return labels;
}

// ── Splitscreen predicates ────────────────────────────────────────────────────
// window.feedBackSplitscreen is read live each call — never captured at
// module or factory scope.

export function _ssActive() {
    const ss = window.feedBackSplitscreen;
    if (!ss || typeof ss.isActive !== 'function' || !ss.isActive()) return false;
    return typeof ss.isCanvasFocused === 'function'
        && typeof ss.onFocusChange === 'function'
        && typeof ss.offFocusChange === 'function';
}

export function _ssIsCanvasFocused(highwayCanvas) {
    const ss = window.feedBackSplitscreen;
    if (!_ssActive()) return true;
    return !!(ss && typeof ss.isCanvasFocused === 'function' &&
        ss.isCanvasFocused(highwayCanvas));
}
