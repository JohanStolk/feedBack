/**
 * Three.js lazy loader — h3d-carve-2.
 *
 * Memoised singleton: the first `loadThree()` call kicks off the import;
 * every subsequent call returns the same promise.  `T` is a live-binding
 * export so the IIFE in screen.js sees the updated reference after the
 * promise resolves without any explicit getter call.
 *
 * Falls back to jsdelivr CDN when the local vendor copy is unavailable
 * (air-gapped / static-file layout mismatch / dev origin).
 */

// ── URL constants (mirrors screen.js A-section; never vary at runtime) ──────

const THREE_URL = '/static/vendor/three/three.module.min.js';
const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';

// ── Memoised loader ───────────────────────────────────────────────────────────

/** Live binding — updated to the Three.js module namespace on first load. */
export let T = null;

let threeLoadPromise = null;

export function loadThree() {
    if (!threeLoadPromise) {
        threeLoadPromise = import(THREE_URL)
            .then(mod => { T = mod; return mod; })
            .catch(() => import(THREE_CDN)
                .then(mod => { T = mod; return mod; })
                .catch(e => {
                    console.error('[3D-Hwy] Three.js load failed:', e);
                    threeLoadPromise = null;
                    throw e;
                }));
    }
    return threeLoadPromise;
}
