// h3d-carve-11: R-section (string glow) extracted from screen.js.
// VERBATIM-MOVE: updateStringHighlights body is byte-for-byte identical to
// screen.js except for 7 DI-rewires at function entry (aliased locals).
// No logic changes, no new guards.
//
// Beyond-subst changes (all mechanical DI rewires at function entry):
//   1. glowMul             → aliased: const glowMul = getGlowMul()
//   2. _vibrancyIdleOp     → aliased: const _vibrancyIdleOp = getVibrancyIdleOp()
//   3. _venueSceneOverride → aliased: const _venueSceneOverride = getVenueSceneOverride()
//   4. nStr                → aliased: const nStr = getNStr()
//   5. stringLines         → aliased: const stringLines = getStringLines()
//   6. mGlow               → aliased: const mGlow = getMGlow()
//   7. mAccentCore         → aliased: const mAccentCore = getMAccentCore()
// VENUE_GEM_EMISSIVE_MUL is a plain const shorthand (no aliasing needed).
// Total DI params: 8 (1 plain const + 7 live getters, 0 setter pairs).

export function createStringGlow({
    VENUE_GEM_EMISSIVE_MUL,
    getGlowMul,
    getVibrancyIdleOp,
    getVenueSceneOverride,
    getNStr,
    getStringLines,
    getMGlow,
    getMAccentCore,
}) {
        function updateStringHighlights(noteState) {
            // DI: all mutable IIFE-scope vars aliased here; body is verbatim.
            const glowMul = getGlowMul();                        // DI: glowMul
            const _vibrancyIdleOp = getVibrancyIdleOp();        // DI: _vibrancyIdleOp
            const _venueSceneOverride = getVenueSceneOverride(); // DI: _venueSceneOverride
            const nStr = getNStr();                               // DI: nStr
            const stringLines = getStringLines();                 // DI: stringLines
            const mGlow = getMGlow();                            // DI: mGlow
            const mAccentCore = getMAccentCore();                // DI: mAccentCore

            // Glow slider scales both the idle floor and anticipation peak,
            // so glowMul=0 fully silences the per-string emissive pulse.
            // Vibrancy controls the idle opacity floor — anticipation
            // still rides on top regardless of vibrancy so play-feedback
            // through the opacity channel survives even at glowMul=0.
            //
            // Folded with the post-noteState mGlow / mAccentCore writes
            // (was a separate `for (s = 0; s < nStr)` loop in update()),
            // so the per-string scratch arrays stay hot in L1 across all
            // material writes for a given string.
            const BASE_GLOW = 0.02 * glowMul;
            const MAX_GLOW  = 3.5  * glowMul;
            const IDLE_OP   = _vibrancyIdleOp;
            const g = glowMul;
            const venueGemMul = _venueSceneOverride ? VENUE_GEM_EMISSIVE_MUL : 1;

            for (let s = 0; s < nStr; s++) {
                const mesh = stringLines[s];
                if (mesh) {
                    const intensity = Math.max(
                        noteState.stringSustain[s] ? 1 : 0,
                        noteState.stringAnticipation[s] || 0,
                    );
                    mesh.material.emissiveIntensity = BASE_GLOW + intensity * MAX_GLOW;
                    mesh.material.opacity = IDLE_OP + intensity * (1 - IDLE_OP);
                    mesh.scale.set(1, 1 + intensity * 0.3, 1 + intensity * 0.3);
                }
                // Hit-note emissive — same write pattern as the standalone
                // loop that previously lived at update()'s post-call site.
                // The glow slider scales it here since this assignment
                // stomps anything _applyGlow() set statically.
                const bg = noteState.strGlow[s] * g;
                if (mGlow[s]) mGlow[s].emissiveIntensity = bg * venueGemMul;
                if (mAccentCore[s]) {
                    mAccentCore[s].emissiveIntensity =
                        (bg + noteState.accentFillBoost[s] * g) * venueGemMul;
                }
            }
        }

    return { updateStringHighlights };
}
