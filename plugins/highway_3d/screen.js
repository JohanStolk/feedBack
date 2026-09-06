// 3D Highway visualization plugin — Three.js note highway.
// Visual layer from joel's prototype (vibrant palette, glowing strings,
// fret heat, dynamic lane, chord frame-boxes, per-note connector labels,
// board projection, outline+core note meshes) adapted into the
// feedBackViz setRenderer contract (feedBack#36) so it works in the
// main player and per-panel in splitscreen without any architectural
// changes.

import { geoFretX, dZ, slideTrailEnd, camBaseDistU, camLowFretPullbackU, computeBPM, _makeGaussTex, RENDER_ORDER_LAYER_STACK, RENDER_ORDER_LAYER_INDEX, RENDER_ORDER_AT_Z_ZERO, RENDER_ORDER_FAR_CLAMP, renderOrderForLayerAtZ, _noteKey, lowerBoundT, hwyFirstRelevantFrettedTime, geoFretMid } from './src/geometry.js'; // h3d-carve-1b
import { loadThree, T } from './src/three-loader.js'; // h3d-carve-2
import { _h3dHexToInt, _clampByteI, _darkenInt, _lightenInt, resolveStringCount as _resolveStringCountBase, _NOTE_NAMES_SHARP, _BASE_OPEN_MIDI_BASS4, _BASE_OPEN_MIDI_BASS5, _BASE_OPEN_MIDI_GUITAR6, _BASE_OPEN_MIDI_GUITAR7, _BASE_OPEN_MIDI_GUITAR8, _baseOpenStringMidis, _midiToPitchLabel, _openStringPitchLabelsForTuning as _openStringPitchLabelsForTuningBase, _ssActive, _ssIsCanvasFocused } from './src/utils.js'; // h3d-carve-3
import { _bcIsDesktop, _bcCreateController, _bcLoadSettings, _bcFfIdx } from './src/bc-panel.js'; // h3d-carve-4
import { createBgControl } from './src/bg-control.js'; // h3d-carve-5
import { createMaterialBuilders } from './src/materials.js'; // h3d-carve-6
import { createOverlay } from './src/overlay.js'; // h3d-carve-7
import { createFx } from './src/fx.js'; // h3d-carve-8
import { createCamera } from './src/camera.js'; // h3d-carve-9
import { createScoreFx } from './src/score-fx.js'; // h3d-carve-10
import { createStringGlow } from './src/string-glow.js'; // h3d-carve-11
import { createArp } from './src/arp.js'; // h3d-carve-12
import { createNoteRenderer } from './src/note-renderer.js'; // h3d-carve-14
import { createRenderer } from './src/renderer.js'; // h3d-carve-15
import { createSceneInit } from './src/scene-init.js'; // h3d-carve-16

(function () {
    'use strict';

    /* ======================================================================
     *  Constants
     * ====================================================================== */

    // Three.js is vendored under static/vendor/three/ in core (pinned r170 —
    // see static/vendor/three/VERSION). The bundled plugin loads from the
    // same origin to avoid the first-launch CDN round-trip and to pin the
    // version against breakages from upstream Three.js drift.
    // THREE_URL / THREE_CDN — h3d-carve-4: dead code (three-loader.js owns its own URLs). Tombstoned.

    // ── B-section: Butterchurn control panel — h3d-carve-4 ──────────────
    // Moved to src/bc-panel.js. Imports: _bcIsDesktop, _bcCreateController, _bcLoadSettings, _bcFfIdx.
    // window.h3dBcApplySettings assigned at bc-panel.js module scope (R5).
    // ────────────────────────────────────────────────────────────────────
    // TOMBSTONE: BC_VENDOR, BC_FRAME, BC_WORKLET, _bcMeters, BC_BTN — h3d-carve-4: moved to src/bc-panel.js.
    // TOMBSTONE: _bcLoading — h3d-carve-4: moved to src/bc-panel.js.
    // TOMBSTONE: _bcLoadLib() — h3d-carve-4: moved to src/bc-panel.js.
    // TOMBSTONE: _bcResolve, _bcPresets, _bcIsDesktop, _bcFfIdx, _bcReleaseCanvasGL — h3d-carve-4: moved to src/bc-panel.js.

    // TOMBSTONE: _bcGuitarFeed — h3d-carve-4: moved to src/bc-panel.js.
    // TOMBSTONE: BC_LS, BC_DEFAULTS, _bcSettings, _bcLoadSettings, _bcSaveSettings — h3d-carve-4: moved to src/bc-panel.js.
    // TOMBSTONE: _bcControllers, _bcApplyAll — h3d-carve-4: moved to src/bc-panel.js.
    // TOMBSTONE: window.h3dBcApplySettings — h3d-carve-4: assigned at src/bc-panel.js module scope (R5; 1 beyond-subst).

    // TOMBSTONE: BC_DEFAULT_FAVORITES, BC_DEFAULT_BANS, _bcFavorites, _bcBanned, _bcListsLoaded — h3d-carve-4: moved to src/bc-panel.js.
    // TOMBSTONE: _bcLoadLists, _bcSaveLists, _bcRestoreDefaults — h3d-carve-4: moved to src/bc-panel.js.
    // TOMBSTONE: _bcPrimary — h3d-carve-4: moved to src/bc-panel.js.
    // TOMBSTONE: _bcPane, _bcListEl, _bcFilterEl, _bcPaneOpen, _bcCollapsed — h3d-carve-4: moved to src/bc-panel.js.
    // TOMBSTONE: _bcStatusMark, _bcSetHold, _bcLayout, _bcSetPane — h3d-carve-4: moved to src/bc-panel.js.
    // TOMBSTONE: _bcRenderList, _bcUpdatePanelPreset — h3d-carve-4: moved to src/bc-panel.js.

    // TOMBSTONE: _bcPanel, _bcPanelKeyBound — h3d-carve-4: moved to src/bc-panel.js.
    // TOMBSTONE: _bcEnsurePanel, _bcCreateController — h3d-carve-4: moved to src/bc-panel.js (exported as _bcIsDesktop, _bcCreateController).

    // Selectable per-string color palettes (issue #10). Each palette has
    // 8 entries to match MAX_RENDER_STRINGS so 6/7/8-string arrangements
    // all index safely. Default is the canonical chart-format classic
    // mapping (low E=red, A=yellow, D=blue, G=orange, B=green,
    // high E=purple); Neon pushes saturation harder; Pastel desaturates
    // for long-session comfort; Colorblind (high contrast) is derived from
    // the chart format's built-in colorblind-mode palette, but this preset
    // intentionally keeps some entries tuned for feedBack rather than
    // reproducing every original hex value verbatim. The chart-format base
    // values came from community reverse-engineering of the original chart
    // files; do not treat the tuned values below as the exact original
    // palette.
    // In feedBack's index convention s=0 is the low E (thickest) and
    // s=5 is the high E (thinnest), matching the chart format's native string
    // indexing. Per-index ordering is preserved across all palettes so
    // switching between them never reassigns a string to a different
    // colour family. Indices 6/7 are supplementary slots used for
    // 7/8-string arrangements.
    // NOTE: settings.html mirrors these arrays in its hydration script
    // for the palette-preview swatches — keep them in sync.
    const PALETTES = {
        default: [
            0xe61f26, 0xecd234, 0x1096e6, 0xf18313,
            0x3fc413, 0xb518d9, 0xff6bd5, 0x6bffe6,
        ],
        neon: [
            0xff0030, 0xffe800, 0x0080ff, 0xff8030,
            0x40ff50, 0xb050ff, 0xff40d0, 0x40ffd0,
        ],
        pastel: [
            0xe89aa0, 0xefdf90, 0x9adfee, 0xefb898,
            0xa6e0a8, 0xc4a6e0, 0xe0a6c8, 0xa6e0d8,
        ],
        colorblind_hc: [
            0xa42424, 0xa3f300, 0x19abfc, 0xda7e41,
            0x30d0a0, 0x7648a7, 0xff6bd5, 0x6bffe6,
        ],
    };
    const PALETTE_IDS = Object.keys(PALETTES);
    // User-defined per-string colors (core "Highway String Colors" theming).
    // Persisted as a JSON hex array under the bg setting key 'customColors';
    // when the active palette id is 'custom' the renderer resolves this into
    // numeric hex, falling back to the default palette per missing index.
    // Mutated in place by _resolveCustomPalette so the reference stays stable.
    let _customPalette = PALETTES.default.slice();
    // _h3dHexToInt, _clampByteI, _darkenInt, _lightenInt — moved to src/utils.js (h3d-carve-3).
    // Default per-string gem gradient stops [topHighlight, bottomShade] —
    // sampled from the original colour PNGs. Used verbatim for the built-in
    // palettes (and for unchanged slots of a custom palette) so the stock look
    // is byte-for-byte preserved; custom slots derive their stops from the
    // chosen base color via _lightenInt/_darkenInt. Strings 6/7 have no entry
    // and fall back to flat gNote.
    const DEFAULT_GEM_GRADIENTS = [
        [0xec0816, 0xbd0400], // 0 red
        [0xefd20b, 0xceaa00], // 1 yellow
        [0x0b93e9, 0x0e69b2], // 2 blue
        [0xf77b0b, 0xdb5808], // 3 orange
        [0x37c40b, 0x139305], // 4 green
        [0xaf10db, 0x8907af], // 5 violet
    ];
    // Default palette at module scope so out-of-IIFE consumers (e.g. the
    // out-of-range warning's reference to "palette size") still have a
    // canonical length to compare against.
    const S_COL = PALETTES.default;

    const SCALE = 2.25;
    const K = SCALE / 300;
    // Horizontal stretch factor for fret X positions.  Increasing this widens
    // the lane (frets, board plane, strings, notes, lane strip) without
    // affecting K-based vertical dimensions (string gap, note height, camera).
    const FRET_SCALE = SCALE * 1.1;

    const NFRETS = 24;
    const NSTR = 6;
    /**
     * Pure 12-semitone spacing compresses toward the bridge; multiply each
     * segment **above** this fret by the factor so high positions stay
     * slightly more playable/readable in 3D.
     */
    const FRET_SPACING_STRETCH_ABOVE12 = 1.1;
    const FRET_SPACING_ANCHOR_F = 12;
    // Per-string materials and projection meshes are built via S_COL.map(),
    // so the renderer can only address strings 0..S_COL.length-1. Using a
    // higher count would index undefined into mGlow/mStr/mSus/projMeshArr.
    // Extend S_COL above to support more strings.
    const MAX_RENDER_STRINGS = S_COL.length;

    // resolveStringCount — moved to src/utils.js (h3d-carve-3).
    const resolveStringCount = bundle => _resolveStringCountBase(bundle, MAX_RENDER_STRINGS); // h3d-carve-3: delegator (1 beyond-subst; passes authoritative S_COL.length ceiling)

    // _NOTE_NAMES_SHARP, _BASE_OPEN_MIDI_BASS4/5, _BASE_OPEN_MIDI_GUITAR6/7/8 — moved to src/utils.js (h3d-carve-3).

    // _baseOpenStringMidis, _midiToPitchLabel, _openStringPitchLabelsForTuning — moved to src/utils.js (h3d-carve-3).
    const _openStringPitchLabelsForTuning = (bundle, songInfo, n) => _openStringPitchLabelsForTuningBase(bundle, songInfo, n, MAX_RENDER_STRINGS); // h3d-carve-3: delegator (1 beyond-subst)

    const STR_THICK = 0.25 * K;

    // Fret wires — bowed metal tubes (backported from highway_babylon's
    // "hit-zone fret bars"). All frets share one bowed TubeGeometry whose
    // middle (the middle strings) pushes away from the camera so the row of
    // frets reads as wrapping a cylindrical neck — chart-format depth cue.
    // Negative Z = away from camera (into the highway). All tunable.
    const FRET_BOW_DZ = -1.2 * K;        // middle-of-span Z offset
    const FRET_TUBE_RADIUS = STR_THICK * 0.75; // slightly thicker than a string
    const FRET_TUBE_SEG = 12;            // tubular segments along the curve
    // Radial segments (cross-section). 8 rather than 6: at FRET_TUBE_RADIUS the
    // hexagonal facets of a 6-segment tube are visible along the top highlight.
    // One shared geometry for all frets, so the extra segments are ~free.
    const FRET_TUBE_RADIAL = 8;
    // metalness kept moderate, NOT ~1.0: MeshStandardMaterial is PBR and the
    // scene has no envMap, so a full-metal fret would reflect black and render
    // dark (the nut/headstock use metalness 0.02 for the same reason). At ~0.4
    // the lit albedo body survives while the directional light still throws a
    // glossy specular streak across the rounded tube. The dim emissive floor
    // keeps frets from going muddy far down the (fogged) neck.
    const FRET_METALNESS = 0.4;          // lit steel / brass when gold
    const FRET_ROUGHNESS = 0.3;
    const FRET_EMISSIVE = 0x12141a;      // cool dim floor, never fully black

    // Fret-wire tiers. Wires inside the active anchor lane (the frets the player
    // is actually reading) sit bright; everything outside recedes. Kept far
    // apart on purpose — a narrow gap reads as noise rather than as a focus cue.
    const FRET_WIRE_ACTIVE_HEX = 0xD8A636; // gold; numeric twin of FRET_LABEL_GOLD_HEX
    const FRET_WIRE_ACTIVE_OP = 0.9;
    const FRET_WIRE_IDLE_HEX = 0x4A4A60;
    const FRET_WIRE_IDLE_OP = 0.28;

    // Hit flash: when a scorer (feedBack#254) confirms a note, the two wires
    // bracketing its fret (f-1 and f) flash bright. Emissive is boosted as well
    // as albedo — a MeshStandard fret with no envMap barely brightens from
    // albedo alone, so without the emissive lift the "flash" reads as a shrug.
    const FRET_WIRE_HIT_HEX = 0xFFFFFF;      // blown out to white at full flash
    const FRET_WIRE_HIT_EMISSIVE = 0xFFE9B0; // hot warm-white glow
    const FRET_WIRE_HIT_OP = 1.0;
    // Emissive multiplier at full flash (baseline is 1). Pushing emissive past
    // 1.0 is what actually makes the wire read as a light source rather than a
    // brightly-lit object — the color alone saturates and stops there.
    const FRET_WIRE_HIT_INTENSITY = 4.2;
    // Seconds for a flash to fall to ~1/e once the provider stops reporting.
    // The provider already fades its own `alpha` on a struck note; this tail
    // just keeps the hand-off from popping, and smooths the frame-to-frame
    // jitter of a held sustain (whose alpha tracks live input level).
    const FRET_WIRE_HIT_DECAY = 0.32;

    const S_BASE = 3 * K;
    const S_GAP = 4 * K;

    const AHEAD = 3.0;
    const BEHIND = 0.5;
    // How long a note/chord-frame stays renderable past the hit line while a
    // note-state provider (feedBack#254) is attached. The provider's
    // hit/miss verdict is asynchronous — the engine-side verifier reports it
    // ~0.35-0.5 s after the line — so the default ~50 ms note linger /
    // ~0.48 s chord linger lapses before the tint can apply. Drives both
    // the outer-loop cull (ndVerdictT0) and the smart drawNote cull below.
    const NOTEDETECT_GEM_VERDICT_WINDOW = 0.75;
    // chDt threshold past the hit line at which the chord-frame scan
    // gives up on an arpeggio-style frame whose constituents never come
    // in. Must be < NOTEDETECT_GEM_VERDICT_WINDOW (the rim's draw life
    // in detect mode); placing it at 0.55 s leaves ~0.2 s of the visible
    // window for the latch to fire and skip subsequent scans.
    const _ND_UNMATCHED_LATCH_AFTER = 0.55;
    // Sample approach offsets dt in [0, AHEAD] into strips. Lane quads use
    // z = dZ(dt) + TS*BEHIND = TS*(BEHIND - dt), while notes use z = dZ(n.t-now).
    // So note hit line (z=0) aligns with dt=BEHIND, not dt=0. Chart time at
    // lane parameter dt is now + dt - BEHIND (same z as a note at that time).
    // Each strip’s <anchor> uses that chart time so the blue lane doesn’t
    // switch ~BEHIND seconds before the XML <anchor time="…"/>.
    const HWY_LANE_TIME_SLICES = 96;
    /** Odd columns (1st/3rd/…) darker teal; even columns brighter blue. */
    const HWY_LANE_STRIPE_ODD_HEX  = 0x103B5C;
    const HWY_LANE_STRIPE_EVEN_HEX = 0x08283C;
    /** Lane quad alpha: base + highwayIntensity * scale (readable on dark floor). */
    const HWY_LANE_STRIPE_OP_BASE = 1.0;
    const HWY_LANE_STRIPE_OP_INT  = 0;
    /** Venue mode: slight near-lane contrast boost (visual only). */
    const VENUE_LANE_OP_BOOST = 1.1;
    /** Venue mode: gem emissive pop (~12%, visual only). */
    const VENUE_GEM_EMISSIVE_MUL = 1.12;
    /** Venue steady-state haze coefficient — kept low for raster bg plate. */
    const VENUE_HAZE_STEADY = 0.008;
    /** Venue backdrop pushed slightly farther for parallax depth. */
    const VENUE_BACKDROP_DISTANCE_MUL = 1.06;
    /** Note travel speed. */
    const TS = 230 * K;

    // RENDER_ORDER_LAYER_STACK, RENDER_ORDER_LAYER_INDEX, RENDER_ORDER_AT_Z_ZERO,
    // RENDER_ORDER_FAR_CLAMP, renderOrderForLayerAtZ — moved to src/geometry.js (h3d-carve-1b).

    /** Match `nextNoteByString` onset to this note (float + chart rounding; avoids ghost / glow flicker). */
    const NEXT_ON_STRING_T_EPS = 0.06;
    /** Fixed pre-impact ramp window for lead-note board ghosts (Primary + Upcoming slots). */
    const GHOST_UPCOMING_WIN = 0.6;
    /** Ghost starts at this fraction of full size/brightness and grows to 1.0 as it approaches. */
    const PROJ_GROW_MIN = 0.45;
    /**
     * 3D highway post-strum tail — chord frame + ghost fret digit share the same
     * hold and fade so timing stays consistent.
     */
    const CHORD_HWY_LINGER_S = 0.75;
    /** Linear fade at end of `CHORD_HWY_LINGER_S` (applies to chord UI and board ghost numbers). */
    const CHORD_HWY_FADE_S = 0.32;
    const GHOST_HOLD_AFTER_ONSET = CHORD_HWY_LINGER_S;
    const GHOST_FRET_LBL_FADE_S = CHORD_HWY_FADE_S;
    /** Purple lane rails: extend past last matched chord/note so Z reaches frame end. */
    const ARP_HWY_RAIL_END_TAIL_S = 0.38;
    /** Keep 0 — chord/note-based ``shapeLo`` already aligns to the visible frame. */
    const ARP_HWY_RAIL_START_LEAD_S = 0;
    /** Drives emissive (`mGlow` / accent fill) for notes with `.ac`; matches drawNote `linger` cutoff (0.05). */
    const ACCENT_NOTE_STR_GLOW = 3.55;
    const ACCENT_NOTE_LINGER_EPS = 0.05;
    /** Extra emissive layered on accent-only body material (`mAccentCore`), after `strGlow * glowMul`. */
    const ACCENT_NOTE_FILL_BOOST = 2.55;
    /** Accent rim draws brighter than normal string-coloured outlines (`mStrHitOutline`). */
    const ACCENT_RIM_BASE_EMISSIVE = 3.45;
    /** Outline / core scale bump vs normal gems (accent reads slightly larger). */
    const ACCENT_RIM_XY_SCALE_MUL = 1.09;
    const ACCENT_RIM_Z_SCALE_MUL = 1.06;
    // Soft neon-style outer bloom (AdditiveBlending) — layered shells behind outline/core.
    const ACCENT_HALO_OP_NEAR = 0.68;
    const ACCENT_HALO_OP_MID = 0.42;
    const ACCENT_HALO_OP_FAR = 0.24;
    const ACCENT_HALO_XY_INNER = 1.36;
    const ACCENT_HALO_XY_MID = 1.82;
    const ACCENT_HALO_XY_OUTER = 2.32;
    const ACCENT_HALO_Z_INNER = 1.05;
    const ACCENT_HALO_Z_MID = 1.12;
    const ACCENT_HALO_Z_OUTER = 1.22;

    /**
     * Post-hit tail fade shared by ghost fret digits and 3D chord UI: full
     * opacity until (holdS − fadeS) after onset, then linear fade over fadeS;
     * canceled when `nextSoon` — for ghosts: next note within `fadeS` of `now`;
     * for chord frame: next chord onset lies in chart time [hold − fade, hold]
     * after the current chord (so fade does not run into a same-window handoff).
     * @param {number} dt chart time minus now (negative once struck)
     * @param {number} fadeS linear fade duration (default: GHOST_FRET_LBL_FADE_S)
     */
    function hwyPostHitTailFadeMul(dt, holdS, nextSoon, fadeS = GHOST_FRET_LBL_FADE_S) {
        if (nextSoon || dt >= 0) return 1;
        const gone = -dt;
        if (gone >= holdS) return 0;
        const fS = Math.min(Math.max(fadeS, 1e-6), holdS);
        const fadeStartT = Math.max(0, holdS - fS);
        if (gone < fadeStartT) return 1;
        return Math.max(0, 1 - (gone - fadeStartT) / fS);
    }

    // Shorter, flatter notes (joel style)
    const NW = 5 * K, NH = 3 * K, ND = 0.25 * K;
    // Sustain-trail X offset for fretted notes. Module-scoped + frozen
    // so the hot path's `offsets.length` loop sees a stable singleton
    // reference. The standalone-open-string path builds a fresh pair
    // each call because its offset magnitude depends on the per-note
    // `openWScale` (set in drawNote at line 7367 from the open-string
    // body's lane width), so a module-scoped constant can't capture
    // it; the allocation is the same one the prior code did via
    // `const baseOff = NW * 3 * openWScale` plus the inline `[-, +]`
    // literal in the chord-member branch — just consolidated.
    const SINGLE_SUS_OFFSETS = Object.freeze([0]);
    const BEND_HALFSTEP_WORLD_Y = S_GAP * 0.8;
    const VIBRATO_HALF_WAVE_S = 0.08;
    // Bend ribbon envelope: fraction of the sustain spent ramping up to
    // the bent pitch, and releasing back down (rest is the held plateau).
    const BEND_ENV_RISE_FRAC = 0.35;
    const BEND_ENV_RELEASE_FRAC = 0.30;
    const TREMOLO_BUMP_S = 0.06;

    /** Longitudinal samples for sustain-technique prism (indexed BufferGeometry). */
    const SLIDE_RIBBON_SAMPLES = 96;
    /** Pre-built index buffer: `SLIDE_RIBBON_SAMPLES` × 8 tris × 3 verts. */
    const SLIDE_RIBBON_INDICES = (() => {
        const S = SLIDE_RIBBON_SAMPLES;
        const idx = new Uint16Array(S * 24);
        let o = 0;
        for (let k = 0; k < S; k++) {
            const b = k * 4;
            const nx = (k + 1) * 4;
            // Bottom (-Y outward)
            idx[o++] = b; idx[o++] = b + 1; idx[o++] = nx + 1;
            idx[o++] = b; idx[o++] = nx + 1; idx[o++] = nx;
            // Top (+Y outward)
            idx[o++] = b + 3; idx[o++] = nx + 3; idx[o++] = nx + 2;
            idx[o++] = b + 3; idx[o++] = nx + 2; idx[o++] = b + 2;
            // Left (-X outward)
            idx[o++] = b; idx[o++] = nx; idx[o++] = nx + 3;
            idx[o++] = b; idx[o++] = nx + 3; idx[o++] = b + 3;
            // Right (+X outward)
            idx[o++] = b + 1; idx[o++] = b + 2; idx[o++] = nx + 2;
            idx[o++] = b + 1; idx[o++] = nx + 2; idx[o++] = nx + 1;
        }
        return idx;
    })();
    // Three r170's setIndex() only wraps plain Arrays into Uint16BufferAttribute;
    // typed-array input gets assigned raw onto .index, which trips WebGL's
    // byteLength check. Convert once at module init so each pooled geometry
    // reuses the same Array reference instead of allocating per mesh.
    const SLIDE_RIBBON_INDICES_ARR = Array.from(SLIDE_RIBBON_INDICES);
    const N_RAD = 1.5 * K;
    const SW = 2 * K, SH = 1.5 * K;

    const CAM_H_BASE = 190 * K;
    const CAM_DIST_BASE = 240 * K;
    const REF_ASPECT = 16 / 9;
    const FOCUS_D = 600 * K;
    const CAM_LERP_BASE = 0.02;

    // Base vertical field of view (deg). THREE's PerspectiveCamera fov is the
    // VERTICAL angle; horizontal follows from the aspect ratio. At a normal
    // ~16:9 pane this gives a ~102° horizontal cone. On an ultra-wide pane
    // (top/bottom 2-player split → full-width/half-height → ~32:9) that
    // horizontal cone balloons past 130° and squeezes the fixed-width neck into
    // a central sliver. The optional horizontal-FOV-hold path below counters
    // that by lowering the effective vertical fov as the pane widens.
    const BASE_VFOV = 70;
    // Horizontal-FOV-hold ("Hor+") defaults. At/under HORPLUS_START_ASPECT the
    // effective vertical fov equals BASE_VFOV (exact no-op); past it the
    // vertical fov drops to keep the horizontal cone ~constant so the neck
    // fills a wide pane. HORPLUS_MIN_VFOV floors the result on pathological
    // aspects. Engaged only via the window.__h3dAspectTune bridge (default off).
    const HORPLUS_START_ASPECT = 16 / 9;
    const HORPLUS_MIN_VFOV = 28;

    // Zoom-dependent framing — height (h*) and depth (dist*) multipliers
    // applied to cam.position. Interpolated by `dist`:
    //   NEAR = tight view (nut position, span<=4 -> dist~=93*K): lower/closer.
    //   FAR  = wide view (midpoint fret 1<->20 -> dist~=141*K): higher/pulled back
    //          to fit the whole neck.
    // Outside this range the values clamp at the endpoints.
    const CAM_FRAME_DIST_NEAR = 93 * K;
    const CAM_FRAME_DIST_FAR  = 141 * K;
    const CAM_FRAME_H_NEAR = 0.75;
    const CAM_FRAME_H_FAR  = 1.00;
    const CAM_FRAME_D_NEAR = 0.575;
    const CAM_FRAME_D_FAR  = 0.60;
    // Fret-row fit guard. The heat-coloured fret-number row is a band drawn
    // BELOW the board (at sY(lowest) - S_GAP*1.4). The lower-third framing
    // anchors the board CENTRE, not that row, so a tight zoom on a centred span
    // (worst mid-neck — fine pushed to either end of the neck) drops the row off
    // the bottom edge. Tilt can't add vertical room there (it would only trade a
    // bottom clip for a top clip), so camUpdate dollies the camera back just
    // enough to bring the row back into frame — auto-sized, capped, hysteretic.
    const FRET_ROW_FIT_NDC_MIN   = -0.86;  // keep the row anchor at/above this NDC y (>-1 = on screen)
    const FRET_ROW_FIT_DEADBAND  = 0.06;   // headroom past the min before the dolly relaxes (anti-hunt)
    const FRET_ROW_FIT_BOOST_MAX = 1.6;    // cap the pull-back so the zoom can't pop (never dolly back > +60%)

    // Camera-X targeting (issue #34). The visible AHEAD = 4.0 s window is
    // far too coarse for picking where the camera should sit — a single
    // 17th-fret bend 2.5 s away yanks tgtX several frets even though the
    // immediate playing area hasn't moved. These constants are bounds for
    // a smoothing dial (0 = twitchy, 1 = calm); the runtime lerps between
    // the pair using the user's `cameraSmoothing` setting.
    const CAM_TGT_BEHIND   = 0.2;   // s behind hit line for X targeting
    const CAM_TGT_AHEAD_T  = 2.0;   // s — twitchy: longer lookahead (more reactive)
    const CAM_TGT_AHEAD_C  = 0.7;   // s — calm: shorter lookahead (ignore distant outliers)
    const CAM_TGT_TAU_T    = 0.35;  // s — twitchy: short recency time-constant
    const CAM_TGT_TAU_C    = 0.9;   // s — calm: longer time-constant (averages more)
    const CAM_TGT_HYST_T   = 0.25;  // frets — twitchy: tiny dead zone
    const CAM_TGT_HYST_C   = 5.0;   // frets — calm: ~5-fret dead zone, wide
                                    // enough to swallow chord-to-chord
                                    // alternations across a 6-fret span
                                    // (e.g. Am ↔ D in first position).

    // Zoom (tgtDist) damping. Controlled by its own `zoomSmoothing` setting
    // so X-pan and zoom-pull-back can be tuned independently. New users
    // (and existing users who never wrote zoomSmoothing) inherit
    // cameraSmoothing's value on first read, so default behaviour is
    // unchanged from when zoom + X shared a single slider.
    const CAM_DIST_HYST_T  = 0.5;   // fret-span — twitchy: minimal dead zone
    const CAM_DIST_HYST_C  = 5.0;   // fret-span — calm: 5-fret span change required

    // Vertical-tilt damping. Drives the tgtLookY self-correction loop in
    // camUpdate(): how far the fretboard's NDC Y can drift from
    // DESIRED_NDC_Y before we nudge the camera, and how strongly each
    // nudge corrects. Twitchy = narrow band + strong correction (re-frame
    // aggressively); calm = wide band + weak correction (let small drift
    // ride). Driven by `tiltSmoothing`, mirrors cameraSmoothing on first
    // read like zoomSmoothing does.
    // Bounds chosen so the midpoint (tiltSmoothing=0.5) reproduces the
    // pre-PR hardcoded behaviour (band=0.15, str=0.5). Without that, a
    // fresh install would silently change the vertical-tilt feel even
    // though the PR description promises "default behaviour unchanged."
    const CAM_TILT_BAND_T  = 0.05;  // NDC — twitchy: narrow tolerance
    const CAM_TILT_BAND_C  = 0.25;  // NDC — calm: wide tolerance, fewer corrections
    const CAM_TILT_STR_T   = 0.8;   // multiplier — twitchy: strong nudge per correction
    const CAM_TILT_STR_C   = 0.2;   // multiplier — calm: weak nudge per correction

    // Lock-low zoom range. The cameraLockZoom slider (0..1) blends between
    // these two multipliers and scales the locked tgtDist. Defaults pick
    // 1.0× at slider=0.5 so the previous locked view is the midpoint.
    const CAM_LOCK_ZOOM_MIN = 0.55;  // slider=0 — closest, biggest fretboard
    const CAM_LOCK_ZOOM_MAX = 1.45;  // slider=1 — furthest
    const CAM_LOCK_CENTER_FRET = 6;  // default camera X center (first-position midpoint)

    // ── 3D preview: lookahead fret bounds + smoothed focal X / span ─────────
    /** User-selectable via `cameraMode`. Legacy `classic` in storage maps to `steady`. */
    const CAMERA_MODE_IDS = ['steady', 'lookahead'];
    const CAM_LOOKAHEAD_SEC = 3.0;       // fallback when no beats/measures are available
    const CAM_LOOKAHEAD_MEASURES = 9;    // lookahead window = N measures ahead
    const CAM_FOCUS_BLEND_RATE = 0.7;
    const CAM_FRET_EDGE_BLEND = 0.1;
    const DEFAULT_LOOKAHEAD_FRET_SPAN = 4;
    /** Schmitt: avoid lock↔dynamic flicker when lookahead maxF jitters at the 12th fret. */
    const LOOKAHEAD_LOCK_RELEASE_MAXF = 13;
    const LOOKAHEAD_LOCK_ENGAGE_MAXF = 10;
    // Note: we deliberately do NOT scale the camUpdate lerp speed with
    // cameraSmoothing. Smoothing widens the hysteresis dead zones so the
    // camera stays put through small/repetitive shifts; but when a shift
    // *does* clear the gate (a real jump to a far fret), we want the slide
    // to be snappy, not lethargic. The dead zone gates "should we move?",
    // the BPM-scaled lerp answers "how fast" — keeping those orthogonal
    // gives the right feel.

    const FOG_START = 200 * K;
    const FOG_END = 670 * K;

    const DOTS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
    const DDOTS = new Set([12, 24]);
    const INLAY_LABEL_FRETS = [3, 5, 7, 9, 12, 15, 17, 19, 22, 24]; // 22 not 21: intentional display choice

    // Fret-column reference markers: floor-aligned fret-number sprites
    // that scroll toward the hit line every Nth measure. When the chart
    // has <anchor>, the row uses the inlay cadence (DOTS) around the
    // anchor fret: two marker positions before and three after the
    // snapped cadence cell (e.g. anchor fret 7 → 3,5,7,9,12,15).
    const FRET_COL_MARKER_ANCHOR_BACK = 2;
    const FRET_COL_MARKER_ANCHOR_FWD = 3;

    /**
     * @param {number} anchorFret Chart anchor `.fret` (world start fret).
     * @param {number[]} [cadence] Ascending frets (e.g. DOTS).
     * @returns {number[]}
     */
    function fretColumnMarkersForAnchor(anchorFret, cadence = DOTS) {
        const f0 = Math.round(Number(anchorFret));
        if (!Number.isFinite(f0) || cadence.length === 0) return cadence.slice();
        let iBest = 0;
        let dBest = Infinity;
        for (let i = 0; i < cadence.length; i++) {
            const d = Math.abs(cadence[i] - f0);
            if (d < dBest || (d === dBest && cadence[i] < cadence[iBest])) {
                dBest = d;
                iBest = i;
            }
        }
        const i0 = Math.max(0, iBest - FRET_COL_MARKER_ANCHOR_BACK);
        const i1 = Math.min(cadence.length, iBest + FRET_COL_MARKER_ANCHOR_FWD + 1);
        return cadence.slice(i0, i1);
    }

    // _noteKey, lowerBoundT, hwyFirstRelevantFrettedTime — moved to src/geometry.js (h3d-carve-1b).

    // Last arrangement <anchor> at or before chart time `t` (sorted by .time).
    // Mirrors static/highway.js getAnchorAt — until t reaches the first anchor’s
    // time, the first anchor still defines fret/width.
    // Binary search: this is called inside per-frame loops (lane slicing,
    // lookahead sampling, marker spawning), so the linear scan was O(samples *
    // numAnchors) on dense charts.
    function getChartAnchorAt(anchorArr, t) {
        if (!anchorArr || !anchorArr.length) return null;
        let lo = 0, hi = anchorArr.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (anchorArr[mid].time <= t) lo = mid + 1;
            else hi = mid;
        }
        return lo === 0 ? anchorArr[0] : anchorArr[lo - 1];
    }

    /** @returns {{ dMin: number, dMax: number } | null} */
    function laneBoundsFromAnchor(anc) {
        if (!anc) return null;
        let fStart = Math.round(Number(anc.fret));
        // Match anchorPlayedFretInclusiveSpan(): fret 0 (and below) clamps
        // to 1, otherwise the lane span ends up one fret narrower than the
        // played-fret span / label highlighting on charts that emit
        // <anchor fret="0" width="N">.
        if (!Number.isFinite(fStart) || fStart < 1) fStart = 1;
        let w = Number(anc.width);
        if (!Number.isFinite(w)) w = 4;
        w = Math.max(1, Math.round(w));
        const fLast = Math.min(NFRETS, fStart + w - 1);
        const dMin = Math.max(0, fStart - 1);
        const dMax = Math.min(NFRETS, fLast);
        return { dMin, dMax };
    }

    /** Same horizontal span as the dynamic highway lane: anchor at chart time `t`. */
    function anchorLaneBoundsAt(anchorArr, t) {
        if (!anchorArr || !anchorArr.length) return null;
        return laneBoundsFromAnchor(getChartAnchorAt(anchorArr, t));
    }

    /**
     * Inclusive chart-fret indices for the playing window (anchor `fret` + `width`),
     * e.g. fret=5 width=4 → 5..8. Unlike {@link laneBoundsFromAnchor}'s `dMin`/`dMax`
     * (diagram wire span), these are the labels shown on gems / row numbers.
     * @returns {{ f0: number, f1: number } | null}
     */
    function anchorPlayedFretInclusiveSpan(anc) {
        if (!anc) return null;
        let f0 = Math.round(Number(anc.fret));
        if (!Number.isFinite(f0) || f0 < 1) f0 = 1;
        let w = Number(anc.width);
        if (!Number.isFinite(w)) w = 4;
        w = Math.max(1, Math.round(w));
        const f1 = Math.min(NFRETS, f0 + w - 1);
        return { f0, f1 };
    }

    function anchorPlayedFretSpanAt(anchorArr, t) {
        if (!anchorArr || !anchorArr.length) return null;
        return anchorPlayedFretInclusiveSpan(getChartAnchorAt(anchorArr, t));
    }

    const FRET_COOLDOWN = 0.5; // seconds a lane fret stays active after last note

    const DIAG_LINGER_S    = 0.55;
    const DIAG_ENTRANCE_S  = 0.20;
    const DIAG_CROSSFADE_S = 0.15;
    // 'bl' and 'br' removed — diagram is top-only. Legacy localStorage values
    // that contain 'bl'/'br' will fall back to BG_DEFAULTS.chordDiagramPosition
    // via _bgCoerce (which rejects values not in this list).
    const CHORD_DIAG_POSITION_IDS = ['tl', 'tr'];

    /** Default chord-box rim / fill gradient (teal family). */
    const CHORD_BOX_TEAL_HEX = 0x00d2d5;
    const CHORD_BOX_TEAL_DARK_HEX = 0x003c3d;
    /** Frame edge quads: premultiplied-ish alpha match (~128/255). */
    const CHORD_BOX_EDGE_ALPHA = 128 / 255;
    /** Interior gradient strip alpha on both stops (~32/255). */
    const CHORD_BOX_FILL_GRAD_ALPHA = 32 / 255;
    /** Arpeggio interior wash; dedicated gradient tex so teal map doesn’t dominate. */
    const ARPEGGIO_BOX_BLUE_HEX = 0x454BB6;
    const ARPEGGIO_BOX_BLUE_DARK_HEX = 0x2D3190;
    /** Arpeggio rim accent and lane tint. */
    const ARPEGGIO_RIM_BLUE_HEX = 0x454BB6;
    /** Post-hit chord-frame rim tints driven by the note-state provider
     *  (feedBack#254). Applied only to the teal frame during the linger
     *  fade (chDt <= 0) when a scorer is attached.
     *  Matches the gem hit/miss colours so chord frame and note body
     *  give a consistent signal:
     *    hit  → neon spring-green 0x22ff88 (same as mHitBright).
     *    miss → hot magenta-red 0xff0066 (same as mMissOutline). */
    const CHORD_BOX_HIT_BRIGHT_HEX  = 0x22ff88;
    const CHORD_BOX_MISS_DARK_HEX   = 0xff0066;

    /** Fret-number label tints — gold on approaching/active notes, muted blue when idle. */
    const FRET_LABEL_GOLD_HEX = '#D8A636';
    const FRET_LABEL_IDLE_HEX = '#9ab8cc';

    /** 3D chord-box rim bars (thin on all chords, including repeats in a sequence). */
    const CHORD_FRAME_RIM_MIN = 0.055;       // × K — floor thickness
    const CHORD_FRAME_RIM_FRAC_H = 0.028;    // × fullChordBoxH
    const CHORD_FRAME_RIM_Z_MIN = 0.048;      // × K — depth squash
    const CHORD_FRAME_RIM_Z_SCAL = 0.68;     // thickZ scales with ft
    /**
     * Highway arpeggio frame uses ``inferArpeggioFromNotePattern`` only inside this
     * window around ``ch.t``. Hand-shape spans can cover many seconds and several
     * separate strums of the same voicing; a full-span scan mis-detects arpeggio
     * from beats that belong to different chord rows.
     */
    const ARP_FRAME_ONSET_PAD_S = 0.06;
    const ARP_FRAME_ONSET_CLUSTER_S = 0.26;
    /**
     * The chart format encodes fast alternating power chords (e.g. D5/D#5 gallops) as
     * very short ``<handShape>`` rows (~0.05–0.2 s). Note-stream arpeggio
     * inference must not treat strum spread across strings as arpeggio there —
     * it false-triggers lavender highway rails / frames (see Frantic ~2:36).
     */
    const ARP_INFER_MIN_HAND_SHAPE_SPAN_S = 0.21;
    /**
     * In a **short** chart window, chord strums (same voicing, strings picked
     * within ~30–45 ms) barely exceed this total spread; real arpeggios in that
     * window are usually slower across strings OR have 4+ plucks.
     */
    const ARP_INFER_STRUM_VS_ARP_SPREAD_MIN_S = 0.047;
    /**
     * If more than ``shape.size + ARP_INFER_MULTI_STRUM_HIT_SLACKS`` matching picks
     * sit inside a non-trivial hand-shape window, the chart is almost certainly
     * **repeated strums** of the same chord (or gallops), not one arpeggio sweep.
     */
    const ARP_INFER_MULTI_STRUM_HIT_SLACK = 2;
    /** ``timeWin`` span above which we apply the multi-strum hit-count cap. */
    const ARP_INFER_MULTI_STRUM_WIN_MIN_S = 0.26;
    /**
     * Minimum staggered hits inside a hand-shape window for note-stream arpeggio
     * inference. A genuine arpeggio sweeps several strings of the held shape;
     * a 2-note melodic motif inside a multi-string ``<handShape>`` (e.g. Jackson 5
     * "I Want You Back" ~0:27 — Fm7 transition fingering with two plucks on
     * strings 4–5) earlier registered as arpeggio and produced a stray lavender
     * chord frame + purple lane outer dividers. Cap at ``min(shape.size, 3)``
     * so 2-string voicings still infer normally and 3+ string templates need
     * a real sweep.
     */
    const ARP_INFER_MIN_HITS_VS_SHAPE_CAP = 3;

    /* ======================================================================
     *  Pure helpers
     * ====================================================================== */

    // _fretXLog, _fretXUniStep, _fretXUni — moved to src/geometry.js (h3d-carve-1).

    let _h3dFretUniform = true;
    try { _h3dFretUniform = localStorage.getItem('highway_3d.fretSpacing') !== 'logarithmic'; } catch (_) {}
    const fretX = f => geoFretX(f, _h3dFretUniform); // h3d-carve-1: delegator (1 beyond-subst)

    window.h3dSetFretSpacing = mode => {
        // Validate against the two supported modes before persisting so an
        // unexpected input can't leave an invalid value in localStorage
        // (mirrors h3dBgSetFretNumberGhostScope's allowlist guard). No-op
        // when the stored mode is already what was requested.
        const m = mode === 'logarithmic' ? 'logarithmic' : 'uniform';
        try {
            if (localStorage.getItem('highway_3d.fretSpacing') === m) return;
            localStorage.setItem('highway_3d.fretSpacing', m);
        } catch (_) {}
        // Apply live rather than reloading the page — a full page reload
        // reboots the SPA to the home screen (index.html's `.screen.active`),
        // ejecting the user from Settings. Rebind the module-scope flag so
        // panels mounted later this session pick up the new mode, recompute
        // the fretX-derived scalars, then broadcast a change so every mounted
        // panel rebuilds its board. Same live-update path as every other
        // 3D-highway setting.
        _h3dFretUniform = (m !== 'logarithmic');
        _recomputeFretSpacingDerived();
        _bgEmitChange('fretSpacing');
    };

    const fretMid = f => geoFretMid(f, _h3dFretUniform); // h3d-carve-1b: delegator (1 beyond-subst)
    /** World-space width of fret column (wires f−1 .. f); used to scale row markers past ~12. */
    function fretColumnWorldW(f) {
        const fi = Math.round(Number(f));
        if (!Number.isFinite(fi) || fi <= 0) return Math.abs(fretX(1) - fretX(0));
        const lo = Math.min(NFRETS, Math.max(1, fi));
        return Math.abs(fretX(lo) - fretX(lo - 1));
    }
    /** Reference column (~mid board): prior fixed K-based sprites matched this neighborhood. */
    const FRET_LABEL_SCALE_REF_FRET = 5;
    // `let` (not `const`): recomputed by _recomputeFretSpacingDerived when the
    // user flips Uniform/Logarithmic at runtime so label scaling tracks the
    // new geometry without a page reload.
    let _fretLabelScaleRefW = Math.max(1e-8, fretColumnWorldW(FRET_LABEL_SCALE_REF_FRET));
    function fretLabelScaleForFret(f) {
        const w = fretColumnWorldW(f);
        const m = w / _fretLabelScaleRefW;
        return Math.max(0.32, Math.min(1.45, m));
    }
    // dZ — moved to src/geometry.js (h3d-carve-1).

    // slideTrailEnd — moved to src/geometry.js (h3d-carve-1).

    /**
     * Lateral slide offset along the fretboard during sustain — easing
     * mirrors the pitched/unpitched slide offset convention above.
     * @param {{ endFret: number, unpitched: boolean } | null} [st_] from slideTrailEnd
     */
    function slideOffsetWorldX(n, chartTime, st_) {
        const st = st_ || slideTrailEnd(n);
        if (!st || n.f <= 0 || !(n.sus > 0)) return 0;
        const denom = Math.max(n.sus, 1e-6);
        const p = Math.max(0, Math.min(1, (chartTime - n.t) / denom));
        const startX = fretMid(n.f);
        const endX = fretMid(st.endFret);
        const w = st.unpitched
            ? 1 - Math.sin((1 - p) * Math.PI / 2)
            : Math.pow(Math.sin(p * Math.PI / 2), 3);
        return (endX - startX) * w;
    }

    // camBaseDistU, camLowFretPullbackU — moved to src/geometry.js (h3d-carve-1).

    // World-units-per-fret near mid-neck. Used by the camera-X hysteresis
    // gate (issue #34) to convert a fret-equivalent dead zone into world
    // units. Pure function of SCALE — hoist out of update()'s hot path.
    // `let` (not `const`): recomputed alongside _fretLabelScaleRefW when the
    // fret-spacing mode flips at runtime — see _recomputeFretSpacingDerived.
    let FRET_WIDTH_MID = fretX(7) - fretX(6);

    // Recompute the fretX-derived scalars baked at module init. Called from
    // h3dSetFretSpacing after _h3dFretUniform flips so label scaling and the
    // camera hysteresis threshold track the newly chosen spacing — the live
    // alternative to the old location.reload(), which ejected the user from
    // Settings back to the home screen.
    function _recomputeFretSpacingDerived() {
        _fretLabelScaleRefW = Math.max(1e-8, fretColumnWorldW(FRET_LABEL_SCALE_REF_FRET));
        FRET_WIDTH_MID = fretX(7) - fretX(6);
    }

    // computeBPM, _makeGaussTex — moved to src/geometry.js (h3d-carve-1).

    // T, loadThree — moved to src/three-loader.js (h3d-carve-2).
    // T is a live-binding export; the IIFE reads the updated value after loadThree() resolves.

    // _ssActive, _ssIsCanvasFocused — moved to src/utils.js (h3d-carve-3).

    // Shortcut for the wide-pane framing tuner. Opens/closes the floating panel
    // (the A/B on/off and the per-pane target live inside it now). Registered
    // once per session via a module-level guard (it drives shared module state,
    // so per-instance registration would stack duplicate handlers and cancel
    // itself out); it's a harmless debug control, so it is never unregistered.
    // No-ops where the core shortcut API isn't present (older core / borrowed
    // contexts).
    let _tunerShortcutRegistered = false;
    function _registerTunerShortcut() {
        if (_tunerShortcutRegistered) return;
        if (typeof window.registerShortcut !== 'function') return;
        _tunerShortcutRegistered = true;
        try {
            window.registerShortcut({
                key: 'A',   // uppercase e.key → produced with Shift held (Shift+A)
                description: '3D Highway: open/close wide-pane framing tuner (Shift+A)',
                scope: 'player',
                handler: () => {
                    // Open/close the live tuner panel. The A/B on/off and the
                    // per-pane target now live in the panel itself, so the
                    // shortcut is just a dismiss/reveal.
                    _toggleAspectPanel();
                },
            });
        } catch (e) {
            _tunerShortcutRegistered = false;   // allow a later retry if it threw
        }
    }

    // ── Wide-pane framing: live tuner bridge + panel ──────────────────────────
    // window.__h3dAspectTune is the single source of truth the renderer reads
    // each frame (see effectiveVfov + camUpdate). The defaults reproduce the
    // current framing exactly (enabled:false). Values persist to localStorage so
    // a tuning session survives reloads; the floating panel (Shift+A) writes the
    // same object live. All of this is a debug aid — none of it runs unless the
    // user opts in.
    // Versioned key: the first iteration shipped a broken default (enabled:true,
    // baseVfov:30) and may have persisted it. Bumping the key ignores that stale
    // state so the corrected default-off config actually takes effect.
    const _ASPECT_LS = 'h3d_aspect_tune2';
    // Working defaults. Default OFF, so out of the box this is an exact no-op —
    // every pane renders byte-for-byte as before (effectiveVfov returns
    // BASE_VFOV and the pose nudges gate off). The config is also coherent when
    // a tester turns it ON via Shift+A: baseVfov == BASE_VFOV so normal ~16:9
    // panes (single-player, most 2x2) stay at 70° even enabled, and only panes
    // wider than startAspect (2.25) engage the Hor+ hold; blend:1 makes that
    // hold actually take effect; minVfovDeg (28) sits below baseVfov so the floor
    // is a real floor. The pose nudges are the in-progress wide-pane look a
    // tester sees once enabled. localStorage overrides all of this per machine.
    const _ASPECT_DEFAULTS = {
        enabled: false, baseVfov: BASE_VFOV, startAspect: 2.25, hfovDeg: null,
        blend: 1, minVfovDeg: HORPLUS_MIN_VFOV, splitOnly: false,
        heightMul: 0.30, distMul: 0.95, pitchAdd: -1.5, lookDepthMul: 1,
    };
    // Slider specs (numeric fields). Checkboxes (enabled/splitOnly) + the hfov
    // override are handled separately in the panel builder. Ranges are wide on
    // purpose — this is a tuning aid, the no-op default sits mid-range.
    const _ASPECT_FIELDS = [
        { k: 'baseVfov',     label: 'Base vFOV°',   min: 18,  max: 90,  step: 1 },
        { k: 'startAspect',  label: 'Start aspect', min: 1.0, max: 4.0, step: 0.05 },
        { k: 'blend',        label: 'Blend',        min: 0,   max: 1,   step: 0.05 },
        { k: 'minVfovDeg',   label: 'Min vFOV°',    min: 10,  max: 60,  step: 1 },
        { k: 'heightMul',    label: 'Height ×',     min: 0.1, max: 2.5, step: 0.05 },
        { k: 'distMul',      label: 'Dolly ×',      min: 0.2, max: 3.0, step: 0.05 },
        { k: 'pitchAdd',     label: 'Pitch +',      min: -40, max: 40,  step: 0.5 },
        // Aims the camera further down the neck (>1) or pulls the aim back (<1).
        // This is the lever that flattens the mid-distance "hump" toward a
        // straight gradual recede.
        { k: 'lookDepthMul', label: 'Look depth',   min: 0.2, max: 3.0, step: 0.05 },
    ];
    let _aspectPanelEl = null;        // the floating panel root (built once)
    let _aspectPanelRO = null;        // readout <div>
    let _aspectPanelRAF = 0;          // readout poll handle
    let _aspectTargetSel = null;      // the "Target" <select>
    let _aspectTgtRow = null;         // the Target row (hidden when only one pane)
    let _aspectHfovCb = null;         // hfov-override checkbox (synced explicitly)
    let _aspectHfovSl = null;         // hfov-override slider
    // Which pane the panel edits. '' = all panes (writes the shared base object);
    // a pane key ('arr:<name>' or the fallback 'pane:<uid>') writes that pane's
    // sparse override, so one split pane can be framed independently.
    let _aspectEditTarget = '';
    // Bumped when the SET of live panes changes (add/prune) so the panel rebuilds
    // the Target dropdown — never on a per-frame label re-report, which would
    // flicker the <select>.
    let _aspectPanesDirty = true;
    // Monotonic counter for the per-instance fallback key (when a pane has no
    // arrangement name to key by).
    let _aspectPaneCounter = 0;
    function _aspectNowMs() {
        try { if (performance && performance.now) return performance.now(); } catch (e) {}
        try { return Date.now(); } catch (e) { return 0; }   // keep pruning functional
    }
    // Pane key: prefer the arrangement name ('arr:Bass') so a pane's framing is
    // stable across songs AND distinct between split panes, with no dependency on
    // the external splitscreen panel index (which isn't always available). Fall
    // back to a per-instance id ('pane:3') when there's no arrangement.
    function _aspectPaneKey(arrangement, uid) {
        const a = (typeof arrangement === 'string') ? arrangement.trim() : '';
        return a ? ('arr:' + a) : ('pane:' + uid);
    }
    // Human label derived from the key.
    function _aspectPaneLabel(paneKey) {
        if (paneKey.slice(0, 4) === 'arr:') return paneKey.slice(4);
        if (paneKey.slice(0, 5) === 'pane:') return 'Pane ' + paneKey.slice(5);
        return paneKey;
    }

    // Get-or-create the shared bridge object, seeded from defaults + localStorage.
    // May carry a sparse `__panels` map of per-pane overrides.
    function _aspectTune() {
        let t = window.__h3dAspectTune;
        if (!t || typeof t !== 'object') {
            t = Object.assign({}, _ASPECT_DEFAULTS);
            try {
                const raw = localStorage.getItem(_ASPECT_LS);
                if (raw) Object.assign(t, JSON.parse(raw));
            } catch (e) {}
            window.__h3dAspectTune = t;
        }
        return t;
    }
    // Bumped on every tune mutation (all writes funnel through _aspectPersist) so
    // the per-pane resolve cache below can invalidate cheaply.
    let _aspectRev = 0;
    function _aspectPersist() {
        _aspectRev++;
        try {
            const t = _aspectTune(), out = {};
            Object.keys(_ASPECT_DEFAULTS).forEach((k) => { out[k] = t[k]; });
            // Persist per-pane overrides keyed by arrangement ('arr:*') only, so a
            // pane's framing carries across songs. Instance-id fallback keys
            // ('pane:*') are session-only — persisting them would leak a new key
            // every reload.
            if (t.__panels) {
                const p = {}; let any = false;
                Object.keys(t.__panels).forEach((k) => {
                    if (k.slice(0, 4) === 'arr:') { p[k] = t.__panels[k]; any = true; }
                });
                if (any) out.__panels = p;
            }
            localStorage.setItem(_ASPECT_LS, JSON.stringify(out));
        } catch (e) {}
    }

    // Resolve the effective tune for a pane: the shared base, with that pane's
    // override keys (if any) laid on top. Called every frame per renderer, so the
    // merged object is memoized per pane and only rebuilt when the tune mutates
    // (_aspectRev changes). Panes with no override return the base directly (no
    // allocation).
    const _aspectResolveCache = new Map();   // paneKey -> { rev, obj }
    function _resolveTuneFor(paneKey) {
        const base = _aspectTune();
        const ov = base.__panels && base.__panels[paneKey];
        if (!ov) return base;
        const c = _aspectResolveCache.get(paneKey);
        if (c && c.rev === _aspectRev) return c.obj;
        const out = {};
        Object.keys(_ASPECT_DEFAULTS).forEach((k) => { out[k] = (k in ov) ? ov[k] : base[k]; });
        _aspectResolveCache.set(paneKey, { rev: _aspectRev, obj: out });
        return out;
    }
    // Record a live pane so the Target dropdown can list it. Called every frame
    // by each renderer with its pane key. `seen` is refreshed each call for
    // pruning; the dropdown is only marked dirty when a pane is newly added — not
    // on every re-report, which would flicker the <select>.
    function _aspectRegisterPane(paneKey) {
        const reg = window.__h3dAspectPanes || (window.__h3dAspectPanes = {});
        const label = _aspectPaneLabel(paneKey);
        let e = reg[paneKey];
        if (!e) { e = reg[paneKey] = { label, seen: 0 }; _aspectPanesDirty = true; }
        else if (e.label !== label) { e.label = label; _aspectPanesDirty = true; }
        e.seen = _aspectNowMs();
    }
    // Drop panes not reported recently (song change, split teardown, pane close).
    function _aspectPrunePanes() {
        const reg = window.__h3dAspectPanes;
        if (!reg) return;
        const now = _aspectNowMs();
        const ro = window.__h3dAspectReadout;
        Object.keys(reg).forEach((k) => {
            if (now - (reg[k].seen || 0) > 1500) {
                delete reg[k];
                // Prune the matching readout slot so it can't grow unbounded as
                // songs/arrangements churn, and drop a dangling __last pointer.
                if (ro) { delete ro[k]; if (ro.__last === k) delete ro.__last; }
                _aspectPanesDirty = true;
            }
        });
    }

    // True while _syncAspectPanel is programmatically refreshing controls, so the
    // synthetic 'input' events it dispatches to update labels don't write back
    // into the tune (which would populate a full override for every field and
    // spam localStorage). Real user input runs with this false.
    let _aspectSyncing = false;
    // Read/write against the current edit target ('' → base, else pane override).
    function _aspectReadVal(k) {
        const base = _aspectTune();
        if (!_aspectEditTarget) return base[k];
        const ov = base.__panels && base.__panels[_aspectEditTarget];
        return (ov && (k in ov)) ? ov[k] : base[k];
    }
    function _aspectWriteVal(k, v) {
        const base = _aspectTune();
        if (!_aspectEditTarget) { base[k] = v; }
        else {
            const m = base.__panels || (base.__panels = {});
            (m[_aspectEditTarget] || (m[_aspectEditTarget] = {}))[k] = v;
        }
        _aspectPersist();
    }
    // Clear a field: for the base target set the explicit auto value (null); for a
    // pane target delete the override key so the pane re-inherits the base value
    // (and drop the pane's override object once it's empty).
    function _aspectClearVal(k) {
        const base = _aspectTune();
        if (!_aspectEditTarget) { base[k] = null; }
        else {
            const m = base.__panels, ov = m && m[_aspectEditTarget];
            if (ov) { delete ov[k]; if (!Object.keys(ov).length) delete m[_aspectEditTarget]; }
        }
        _aspectPersist();
    }

    // (Re)build the Target dropdown from the live pane registry, preserving the
    // current selection when it's still valid.
    function _aspectBuildTargets() {
        if (!_aspectTargetSel) return;
        // Don't yank a dropdown the user is actively interacting with — leave it
        // dirty and rebuild on a later tick once it's no longer focused.
        if (document.activeElement === _aspectTargetSel) return;
        const reg = window.__h3dAspectPanes || {};
        const keys = Object.keys(reg).sort();
        _aspectTargetSel.innerHTML = '';
        const all = document.createElement('option');
        all.value = ''; all.textContent = keys.length > 1 ? 'All panes' : 'All';
        _aspectTargetSel.appendChild(all);
        keys.forEach((pk) => {
            const o = document.createElement('option');
            o.value = pk; o.textContent = reg[pk].label;
            _aspectTargetSel.appendChild(o);
        });
        // Force the edit target back to "All" when the Target row is hidden
        // (single pane) or the selected pane is gone — otherwise a stale pane
        // target would silently route edits into a hidden (and persistent
        // arr:*) override in single-player.
        if (keys.length <= 1 || (_aspectEditTarget && !reg[_aspectEditTarget])) {
            _aspectEditTarget = '';
        }
        _aspectTargetSel.value = _aspectEditTarget;
        // The Target row only matters with more than one pane (a split). With a
        // single pane there's nothing to disambiguate, so hide it.
        if (_aspectTgtRow) _aspectTgtRow.style.display = keys.length > 1 ? '' : 'none';
        _aspectPanesDirty = false;
    }

    function _ensureAspectPanel() {
        if (_aspectPanelEl || typeof document === 'undefined') return;
        const wrap = document.createElement('div');
        wrap.id = 'h3d-aspect-tuner';
        wrap.style.cssText = [
            'position:fixed', 'top:64px', 'right:12px', 'z-index:99999',
            'width:236px', 'padding:10px 12px', 'border-radius:8px',
            'background:rgba(12,18,28,0.92)', 'border:1px solid rgba(120,150,200,0.35)',
            'box-shadow:0 6px 24px rgba(0,0,0,0.5)', 'color:#cfe0f5',
            'font:11px/1.35 system-ui,sans-serif', 'user-select:none',
            'pointer-events:auto',
        ].join(';');

        // Header: title + close (×). Close hides the panel; the feature keeps
        // whatever enabled state it had — this is a dismiss, not an A/B toggle.
        const hdr = document.createElement('div');
        hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;';
        const title = document.createElement('div');
        title.textContent = 'Wide-pane framing';
        title.style.cssText = 'font-weight:700;color:#e8c040;';
        const close = document.createElement('button');
        close.type = 'button';                 // never submit if nested in a <form>
        close.textContent = '×';
        close.title = 'Close (Shift+A)';
        close.setAttribute('aria-label', 'Close');
        close.style.cssText = 'border:none;background:transparent;color:#cfe0f5;font-size:17px;line-height:1;cursor:pointer;padding:0 2px;';
        close.addEventListener('click', () => _setAspectPanelVisible(false));
        hdr.appendChild(title); hdr.appendChild(close); wrap.appendChild(hdr);

        // Target selector — which pane the controls below edit.
        const tgtRow = document.createElement('div'); tgtRow.style.cssText = 'margin:2px 0 7px;';
        _aspectTgtRow = tgtRow;
        const tgtLab = document.createElement('div');
        tgtLab.textContent = 'Target'; tgtLab.style.cssText = 'color:#9fb0c8;margin-bottom:2px;';
        _aspectTargetSel = document.createElement('select');
        _aspectTargetSel.setAttribute('aria-label', 'Target pane');
        _aspectTargetSel.style.cssText = 'width:100%;background:rgba(30,44,66,0.9);color:#cfe0f5;border:1px solid rgba(120,150,200,0.4);border-radius:4px;padding:3px;';
        _aspectTargetSel.addEventListener('change', () => {
            _aspectEditTarget = _aspectTargetSel.value; _syncAspectPanel();
        });
        tgtRow.appendChild(tgtLab); tgtRow.appendChild(_aspectTargetSel); wrap.appendChild(tgtRow);
        _aspectBuildTargets();

        // enabled + splitOnly checkboxes (per-target)
        [['enabled', 'Enabled'], ['splitOnly', 'Split panes only']].forEach(([k, lbl]) => {
            const row = document.createElement('label');
            row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:2px 0;cursor:pointer;';
            const cb = document.createElement('input');
            cb.type = 'checkbox'; cb.checked = !!_aspectReadVal(k); cb.dataset.k = k;
            cb.addEventListener('change', () => { _aspectWriteVal(k, cb.checked); });
            const span = document.createElement('span'); span.textContent = lbl;
            row.appendChild(cb); row.appendChild(span); wrap.appendChild(row);
        });

        // numeric sliders (per-target)
        _ASPECT_FIELDS.forEach((f) => {
            const row = document.createElement('div');
            row.style.cssText = 'margin:5px 0;';
            const head = document.createElement('div');
            head.style.cssText = 'display:flex;justify-content:space-between;';
            const lab = document.createElement('span'); lab.textContent = f.label;
            const val = document.createElement('span');
            val.style.cssText = 'color:#8fb6ff;font-variant-numeric:tabular-nums;';
            head.appendChild(lab); head.appendChild(val); row.appendChild(head);
            const sl = document.createElement('input');
            sl.type = 'range'; sl.min = f.min; sl.max = f.max; sl.step = f.step;
            const rv = _aspectReadVal(f.k);
            sl.value = Number.isFinite(rv) ? rv : _ASPECT_DEFAULTS[f.k];
            sl.dataset.k = f.k;
            sl.style.cssText = 'width:100%;';
            const show = () => { val.textContent = (+sl.value).toFixed(f.step < 1 ? 2 : 0); };
            show();
            sl.addEventListener('input', () => {
                show();                                   // label always refreshes
                if (!_aspectSyncing) _aspectWriteVal(f.k, parseFloat(sl.value));
            });
            row.appendChild(sl); wrap.appendChild(row);
        });

        // hfov override (checkbox enables a slider; off → hfovDeg=null = auto)
        {
            const row = document.createElement('div'); row.style.cssText = 'margin:5px 0;';
            const head = document.createElement('label');
            head.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;';
            const cb = document.createElement('input');
            cb.type = 'checkbox'; cb.checked = Number.isFinite(_aspectReadVal('hfovDeg'));
            const lbl = document.createElement('span'); lbl.textContent = 'Override held hFOV°';
            head.appendChild(cb); head.appendChild(lbl); row.appendChild(head);
            const sl = document.createElement('input');
            sl.type = 'range'; sl.min = 40; sl.max = 160; sl.step = 1;
            const hv = _aspectReadVal('hfovDeg');
            sl.value = Number.isFinite(hv) ? hv : 102;
            sl.disabled = !cb.checked;
            sl.style.cssText = 'width:100%;';
            cb.addEventListener('change', () => {
                if (_aspectSyncing) return;
                sl.disabled = !cb.checked;
                if (cb.checked) _aspectWriteVal('hfovDeg', parseFloat(sl.value));
                else _aspectClearVal('hfovDeg');   // base → auto (null); pane → re-inherit base
            });
            sl.addEventListener('input', () => {
                if (!_aspectSyncing && cb.checked) _aspectWriteVal('hfovDeg', parseFloat(sl.value));
            });
            row.appendChild(sl); wrap.appendChild(row);
            _aspectHfovCb = cb; _aspectHfovSl = sl;
        }

        // live readout
        _aspectPanelRO = document.createElement('div');
        _aspectPanelRO.style.cssText = 'margin-top:6px;padding-top:6px;border-top:1px solid rgba(120,150,200,0.25);color:#9fb;font-variant-numeric:tabular-nums;';
        _aspectPanelRO.textContent = 'aspect — · vFOV —';
        wrap.appendChild(_aspectPanelRO);

        // buttons
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:6px;margin-top:8px;';
        const mkBtn = (txt, fn) => {
            const b = document.createElement('button');
            b.type = 'button';                 // never submit if nested in a <form>
            b.textContent = txt;
            b.style.cssText = 'flex:1;padding:4px 0;border-radius:5px;border:1px solid rgba(120,150,200,0.4);background:rgba(40,60,90,0.6);color:#cfe0f5;cursor:pointer;font:11px system-ui;';
            b.addEventListener('click', fn);
            return b;
        };
        // Reset: for "All" restores the shared defaults exactly; for a pane
        // clears that pane's override so it inherits the shared base again. Panel
        // visibility is independent (Shift+A / ×), so Reset doesn't force it open.
        btnRow.appendChild(mkBtn('Reset', () => {
            const base = _aspectTune();
            if (!_aspectEditTarget) {
                Object.keys(_ASPECT_DEFAULTS).forEach((k) => { base[k] = _ASPECT_DEFAULTS[k]; });
            } else if (base.__panels) {
                delete base.__panels[_aspectEditTarget];
            }
            _aspectPersist(); _syncAspectPanel();
        }));
        // Copy: the resolved values for the current target, as JSON.
        btnRow.appendChild(mkBtn('Copy', () => {
            const r = _aspectEditTarget ? _resolveTuneFor(_aspectEditTarget) : _aspectTune();
            const out = {};
            Object.keys(_ASPECT_DEFAULTS).forEach((k) => { out[k] = r[k]; });
            const json = JSON.stringify(out, null, 2);
            try { console.log('[h3d] wide-pane framing values (' + (_aspectEditTarget || 'all') + '):\n' + json); } catch (e) {}
            try { if (navigator.clipboard) navigator.clipboard.writeText(json); } catch (e) {}
        }));
        wrap.appendChild(btnRow);

        document.body.appendChild(wrap);
        _aspectPanelEl = wrap;
        _aspectPanelEl.style.display = 'none';
    }

    // Push the current target's values back into the panel controls (after Reset,
    // a target switch, or an external edit). Cheap; only runs on demand.
    function _syncAspectPanel() {
        if (!_aspectPanelEl) return;
        _aspectBuildTargets();
        // Guard so the synthetic 'input' events below only refresh labels and
        // don't write the read-back values into the target (which would turn a
        // sparse pane override into a full one and spam localStorage).
        _aspectSyncing = true;
        try {
            _aspectPanelEl.querySelectorAll('input[type=checkbox][data-k]').forEach((cb) => {
                cb.checked = !!_aspectReadVal(cb.dataset.k);
            });
            _aspectPanelEl.querySelectorAll('input[type=range][data-k]').forEach((sl) => {
                const v = _aspectReadVal(sl.dataset.k);
                if (Number.isFinite(v)) sl.value = v;
                sl.dispatchEvent(new Event('input'));   // refresh the value label only
            });
            if (_aspectHfovCb) {
                const hv = _aspectReadVal('hfovDeg');
                _aspectHfovCb.checked = Number.isFinite(hv);
                _aspectHfovSl.disabled = !_aspectHfovCb.checked;
                if (Number.isFinite(hv)) _aspectHfovSl.value = hv;
            }
        } finally {
            _aspectSyncing = false;
        }
    }

    function _setAspectPanelVisible(on) {
        _ensureAspectPanel();
        if (!_aspectPanelEl) return;
        _aspectPanelEl.style.display = on ? 'block' : 'none';
        window.__h3dAspectPanelOpen = !!on;        // gates the per-frame readout publish
        // Prune before the first build so panes from a prior song/split don't
        // flash in the dropdown until the first RAF tick.
        if (on) { _aspectPrunePanes(); _aspectBuildTargets(); }
        if (on && !_aspectPanelRAF) {
            const tick = () => {
                if (!window.__h3dAspectPanelOpen) { _aspectPanelRAF = 0; return; }
                _aspectPrunePanes();
                if (_aspectPanesDirty) _aspectBuildTargets();
                const ro = window.__h3dAspectReadout;
                if (_aspectPanelRO && ro) {
                    const key = _aspectEditTarget || ro.__last;
                    const e = key && ro[key];
                    if (e && Number.isFinite(e.aspect)) {
                        _aspectPanelRO.textContent =
                            'aspect ' + e.aspect.toFixed(2) + ' · vFOV ' + e.vfov.toFixed(1) + '°';
                    }
                }
                _aspectPanelRAF = requestAnimationFrame(tick);
            };
            _aspectPanelRAF = requestAnimationFrame(tick);
        }
    }
    // Toggle the panel open/closed (the Shift+A dismiss/reveal).
    function _toggleAspectPanel() {
        _ensureAspectPanel();
        const open = !(_aspectPanelEl && _aspectPanelEl.style.display !== 'none');
        _setAspectPanelVisible(open);
        if (open) _syncAspectPanel();
    }

    /* ======================================================================
     *  Background animations (issue #13)
     *
     *  Audio-reactive ambient scenery in the fog band beyond the highway.
     *  Module-level singletons share an AudioContext + AnalyserNode tap on
     *  the feedBack core <audio id="audio"> element across all panel
     *  instances; per-panel settings live in localStorage with a global
     *  fallback so settings.html drives a single default while per-panel
     *  overrides (h3d_bg_panel<idx>_*) can be set for splitscreen layouts.
     *
     *  Caveat: createMediaElementSource() can only be called once per
     *  element. 3dhighway owns that source for now; future plugins
     *  needing an analyser will have to share through a core API.
     * ====================================================================== */

    // Returned from _bgReadBands when reactive=false or analyser
    // unavailable; shared so the per-frame non-reactive path doesn't
    // allocate. Declared up-front because _bgBandsCache initializes to
    // it during the same IIFE execution pass.
    const BG_ZERO_BANDS = Object.freeze({ bass: 0, mid: 0, treble: 0 });

    // Module-level AudioContext singleton. Intentionally never torn
    // down: createMediaElementSource(<audio>) is irrevocable — once
    // called, the element's audio is permanently routed through this
    // context for the page's lifetime. Closing the context would
    // silence playback. The leak (one AudioContext + one AnalyserNode,
    // a few KB) is the cost of having a plugin tap audio at all.
    let _bgAudio = null;
    // The core (#audio-tap) cache is held separately from the stems cache so
    // we can switch back to it without re-calling createMediaElementSource on
    // #audio — that call is one-shot per element, and a second one throws
    // InvalidStateError (which would then be marked permanent and disable
    // reactivity forever on legacy songs after any sloppak detour).
    let _bgAudioCore = null;
    let _bgAudioFailedAt = 0;  // performance.now() of last failure, 0 = never
    const _BG_AUDIO_RETRY_MS = 1000;
    // _bgReadBands sums bins 0..7 (bass), 8..39 (mid), 40..127 (treble),
    // so the frequency buffer must hold at least 128 bins regardless of
    // the source analyser's fftSize.
    const BG_FREQ_BINS = 128;
    const _bgBridgeKeys = new Map();
    function _bgRecordAudioBridge(bridgeId, legacySurface, outcome = 'handled', reason = '', status = 'used') {
        const key = `${outcome}:${status}:${reason}`;
        if (_bgBridgeKeys.get(bridgeId) === key) return;
        _bgBridgeKeys.set(bridgeId, key);
        const session = window.feedBack && window.feedBack.audioSession;
        if (!session || typeof session.recordBridgeHit !== 'function') return;
        try {
            session.recordBridgeHit({
                domain: 'audio-mix',
                bridgeId,
                legacySurface,
                participantId: 'highway_3d',
                outcome,
                status,
                reason,
            });
        } catch (_) { /* diagnostics are best-effort */ }
    }

    function _bgGetAnalyser() {
        // Prefer the stems plugin's side-chain analyser when a sloppak is
        // loaded. As of feedBack-plugin-stems 0.5.0 (sample-locked playback)
        // the #audio element is a silent virtual transport on sloppaks, so
        // tapping it sees only silence; the stems mix is exposed at
        // window.feedBack.stems.getAnalyser() instead. The stems plugin
        // creates and destroys that AnalyserNode per song, so we re-check
        // each call and key the cache on its identity — when the node
        // changes (song switch), the cache is replaced automatically.
        const stemsApi = window.feedBack && window.feedBack.stems;
        const stemsAnalyser = (stemsApi && typeof stemsApi.getAnalyser === 'function')
            ? stemsApi.getAnalyser() : null;
        if (stemsAnalyser) {
            if (!_bgAudio || _bgAudio.source !== 'stems' || _bgAudio.analyser !== stemsAnalyser) {
                // Adopt the live stems analyser. Do NOT close its context — it's
                // shared with stem playback and the stems plugin owns its
                // lifecycle. No play-event resume hooks either; the stems
                // plugin manages context resume itself.
                _bgAudio = {
                    ctx: stemsAnalyser.context,
                    analyser: stemsAnalyser,
                    // _bgReadBands reads bins 0..127 unconditionally. Always
                    // allocate at least 128 bytes so a smaller analyser (e.g.
                    // fftSize < 256) can't leave undefined values in the loop.
                    freq: new Uint8Array(Math.max(BG_FREQ_BINS, stemsAnalyser.frequencyBinCount)),
                    source: 'stems',
                };
                _bgRecordAudioBridge('audio-mix.analyser', 'window.feedBack.stems.getAnalyser', 'handled', '', 'stems');
            }
            return _bgAudio;
        }
        // No sloppak active — drop a stale stems-sourced cache, restoring the
        // core-tap cache if we'd already built one. Without this, the next
        // step would try to createMediaElementSource(#audio) a second time
        // (one-shot per element) and throw InvalidStateError — disabling
        // reactivity for the rest of the page lifetime.
        if (_bgAudio && _bgAudio.source === 'stems') _bgAudio = _bgAudioCore;

        if (_bgAudio && !_bgAudio.failed) return _bgAudio;
        if (_bgAudio && _bgAudio.failed) {
            // Distinguish permanent failures from transient ones.
            // InvalidStateError on createMediaElementSource means the
            // <audio> element is already tapped by another consumer —
            // there's no recovering from that without a page reload, so
            // don't retry. Transient failures (NotAllowedError before
            // first user gesture, etc.) get a once-per-second retry so
            // reactivity recovers once the blocking condition clears.
            if (_bgAudio.permanent) return null;
            if (performance.now() - _bgAudioFailedAt < _BG_AUDIO_RETRY_MS) return null;
        }
        const audio = document.getElementById('audio');
        if (!audio) return null;
        // Shared tap: createMediaElementSource is one-shot per element, so
        // the FIRST visualizer to tap #audio publishes it at
        // window.__feedBackAudioTap and every later one (this plugin, the
        // drum/keys 3D highways) adopts it instead of throwing
        // InvalidStateError when visualizers are switched or mixed in
        // splitscreen.
        const sharedTap = window.__feedBackAudioTap;
        if (sharedTap && sharedTap.analyser && sharedTap.mediaEl === audio) {
            _bgAudio = {
                ctx: sharedTap.ctx,
                analyser: sharedTap.analyser,
                freq: new Uint8Array(Math.max(BG_FREQ_BINS, sharedTap.analyser.frequencyBinCount)),
                source: 'core',
            };
            _bgAudioCore = _bgAudio;
            _bgRecordAudioBridge('audio-mix.analyser', 'shared #audio analyser tap', 'handled', '', 'core');
            return _bgAudio;
        }
        // Hoist ctx out of the try so we can close() it if a later step
        // throws (e.g. createMediaElementSource on an element that
        // already has a source node). Otherwise the AudioContext leaks.
        let ctx = null;
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) throw new Error('Web Audio API not available');
            ctx = new Ctx();
            const source = ctx.createMediaElementSource(audio);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            analyser.connect(ctx.destination);
            _bgAudio = { ctx, analyser, freq: new Uint8Array(Math.max(BG_FREQ_BINS, analyser.frequencyBinCount)), source: 'core' };
            try { window.__feedBackAudioTap = { ctx, analyser, mediaEl: audio }; } catch (_) {}
            _bgRecordAudioBridge('audio-mix.analyser', 'HTMLAudioElement analyser tap', 'handled', '', 'core');
            // Remember the core analyser so a later stems-then-back-to-core
            // transition can re-use it instead of re-tapping #audio (which
            // would throw InvalidStateError on the one-shot per element).
            _bgAudioCore = _bgAudio;
            // Browsers with autoplay restrictions hand back a suspended
            // AudioContext; createMediaElementSource then routes the
            // <audio> through that suspended graph and playback goes
            // silent (and the analyser reads zeros) until we resume.
            // Try once now (fine if the page already had a user gesture)
            // and again on every play event so the first successful
            // user-initiated play unblocks the graph.
            const resume = () => {
                if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
                    ctx.resume().catch(() => { /* no gesture yet, retry on next play */ });
                }
            };
            resume();
            audio.addEventListener('play', resume);
            return _bgAudio;
        } catch (e) {
            if (ctx && typeof ctx.close === 'function') {
                try { ctx.close(); } catch (_) { /* close errors during failure path are noise */ }
            }
            console.warn('[3D-Hwy] failed to set up audio analyser:', e);
            const permanent = !!(e && e.name === 'InvalidStateError');
            _bgRecordAudioBridge('audio-mix.analyser', 'HTMLAudioElement analyser tap', 'failed', e && e.message ? e.message : String(e), permanent ? 'permanent-failure' : 'transient-failure');
            _bgAudio = { failed: true, permanent };
            _bgAudioFailedAt = performance.now();
            return null;
        }
    }

    // Bands cache: in splitscreen, every panel asks for bands per frame.
    // The analyser is shared, so the answer is identical — cache for a
    // few ms so 4-up splitscreen pays one getByteFrequencyData + one sum
    // pass per frame instead of four.
    const _BG_BANDS_CACHE_MS = 5;
    let _bgBandsLastT = -Infinity;
    // Mutable cache reused across reads — refreshing in place keeps the
    // per-frame allocation count at zero. Style.update() uses the bands
    // synchronously within the same frame so the live-mutation contract
    // is safe.
    const _bgBandsCache = { bass: 0, mid: 0, treble: 0 };
    function _bgReadBands() {
        const a = _bgGetAnalyser();
        if (!a) return BG_ZERO_BANDS;
        const t = performance.now();
        if (t - _bgBandsLastT < _BG_BANDS_CACHE_MS) return _bgBandsCache;
        _bgBandsLastT = t;
        a.analyser.getByteFrequencyData(a.freq);
        let bass = 0, mid = 0, treble = 0;
        for (let i = 0; i < 8; i++) bass += a.freq[i];
        for (let i = 8; i < 40; i++) mid += a.freq[i];
        for (let i = 40; i < 128; i++) treble += a.freq[i];
        _bgBandsCache.bass = bass / (8 * 255);
        _bgBandsCache.mid = mid / (32 * 255);
        _bgBandsCache.treble = treble / (88 * 255);
        return _bgBandsCache;
    }

    const BG_DEFAULTS = { style: 'particles', intensity: 0.5, reactive: true, palette: 'default', bgTheme: 'default', hwTheme: 'default', showFretOnNote: true, fretNumberGhostScope: 'chords', cameraSmoothing: 0.5, zoomSmoothing: 0.5, tiltSmoothing: 0.5, cameraLockLow: false, cameraLockZoom: 0.5, cameraMode: 'lookahead', nutHeadstockVisible: true, tuningLabelsVisible: true, nutColor: '#f5f3f0', headstockColor: '#d4b48a', textSize: 0.5, vibrancy: 0.85, glow: 0.25, customImageDataUrl: '', customImageName: '', customVideoName: '', chordDiagramVisible: true, chordDiagramSize: 0.5, chordDiagramPosition: 'tl', fretColumnMarkerCadence: 1, projectionVisible: true, inlayLabelsVisible: false, sectionLabelsOnHighway: false, sectionHudVisible: false, sectionHudPosition: 'tr', sectionHudSize: 0.5, toneHudVisible: false, toneHudPosition: 'tl', toneHudSize: 0.5, fpsVisible: false, fretDividersVisible: true, slideArrowApproachVisible: true, slideArrowNeckVisible: true, slideArrowChainPreviewVisible: true, hitFx: 0.7, sparks: true, cinematic: true, verdictMarks: true, timingFx: true, streakFx: true, bloom: true };
    // User-selectable, persistable bg styles — must mirror settings.html's
    // VALID_STYLES. 'venue' is deliberately NOT here: it is an internal effective
    // style reached only via _venueSceneOverride (the viz-picker Venue flow), so
    // _bgCoerce must reject a stored h3d_bg_style='venue' — otherwise venue could
    // mount outside that flow and settings.html (which can't represent 'venue')
    // would be unable to switch back. BG_STYLES still has a 'venue' renderer entry.
    const BG_STYLE_IDS = ['off', 'particles', 'silhouettes', 'lights', 'geometric', 'butterchurn', 'image', 'video'];
    // Scene color themes — TWO INDEPENDENT AXES sharing one palette family.
    // The combined `BG_THEMES` table below is the single source of truth; each
    // entry carries the colors for BOTH axes, but the two axes are selected and
    // applied SEPARATELY (two dropdowns, two settings keys):
    //   • BACKGROUND axis (setting key `bgTheme`) owns:
    //       clear — WebGL clear color (the empty background behind everything)
    //       fog   — distance fog tint (kept === clear so the horizon dissolves
    //               cleanly instead of showing a seam)
    //   • HIGHWAY axis (setting key `hwTheme`) owns:
    //       board   — the fretboard / highway-surface plane color
    //       lane    — the lit highway lane strip under the gems (optional)
    //       laneDim — the lane's dimmer alternating row (optional)
    // Because both axes read from the SAME id-set (the keys of this table), ANY
    // background id can mix with ANY highway id (e.g. Deep Focus background +
    // Cathode Green highway); picking the SAME id in both gives the original
    // "matched" combined look. _bgBackgroundColors()/_bgHighwayColors() below
    // are the per-axis accessors; both fall back to 'default' for unknown ids.
    // 'default' reproduces the original look byte-for-byte on BOTH axes, so
    // existing users (and anyone who never touches either setting) see no
    // change. A migration in _bgLoadSettings() makes an existing single-`bgTheme`
    // pick drive BOTH axes until the user diverges them, so upgrades are
    // visually identical too. All themes keep the board very dark and the
    // background dark so the bright per-string note gems, lane, and labels
    // retain contrast. NOTE: settings.html mirrors these ids in its
    // VALID_BG_THEMES set (shared by both dropdowns) — keep them in sync.
    // Optional `lane` / `laneDim` fields retint the lit highway lane strip + its
    // dimmer alternating row. A theme that omits them falls back to the stock
    // blue lane (HWY_LANE_STRIPE_ODD_HEX / _EVEN_HEX); only 'default' relies on
    // that fallback (so its output stays byte-identical). Every other theme sets
    // its own lane so the Highway axis is visibly distinct entry-to-entry — the
    // near-black neutral boards alone aren't separable, so the lane carries it.
    // See _applyBgTheme().
    const BG_THEMES = {
        default:    { clear: 0x101820, fog: 0x101820, board: 0x08080e },
        // Cool navy surface + a brighter pure-blue lane, so it reads distinct
        // from 'default' (neutral board + stock teal-blue lane) on the Highway axis.
        midnight:   { clear: 0x0a0e1a, fog: 0x0a0e1a, board: 0x080d1c, lane: 0x244fae, laneDim: 0x122a5e },
        // Lighter NEUTRAL-grey surface + a steel-grey lane — the only mid-dark
        // neutral board, so the surface itself is visibly different from the
        // near-black neutrals around it (board kept dark enough for gem contrast).
        charcoal:   { clear: 0x16181c, fog: 0x16181c, board: 0x141417, lane: 0x525a66, laneDim: 0x282d34 },
        deeppurple: { clear: 0x140a1e, fog: 0x140a1e, board: 0x0b0610, lane: 0x3a1f6e, laneDim: 0x1f1040 },
        forest:     { clear: 0x0a1614, fog: 0x0a1614, board: 0x06100c, lane: 0x15602a, laneDim: 0x0a3318 },
        // Warm dark neutral (espresso/umber) — the first non-cool scene.
        warmslate:  { clear: 0x1c130b, fog: 0x1c130b, board: 0x0e0805, lane: 0x5e3a12, laneDim: 0x341f0a },
        // Recessive near-black neutral (a hair above #000000, ~zero chroma) —
        // maximizes gem-vs-board contrast; a clean stage/stream look. Purest-dark
        // board + a clean steel-cyan lane (brighter/cooler than 'default's muted
        // teal-blue) so the Highway axis reads clearly distinct from default.
        deepfocus:  { clear: 0x0c0c0d, fog: 0x0c0c0d, board: 0x060606, lane: 0x2f7fa0, laneDim: 0x163c4e },
        // Calm dark teal — blue-dominant so it reads distinct from the navy
        // 'midnight' and the green 'forest'.
        deepsea:    { clear: 0x06222b, fog: 0x06222b, board: 0x03141a, lane: 0x0e5a63, laneDim: 0x063338 },
        // Retro CRT glow — a warm AMBER phosphor cast (the classic amber
        // terminal). Amber rather than green so a phosphor board can't crush
        // green/teal gems, and so it stays clearly distinct from 'forest' and
        // 'deepsea'. Board stays very dark / low-chroma to keep gems popping.
        cathode:    { clear: 0x140b03, fog: 0x140b03, board: 0x0c0702, lane: 0x6e4a0e, laneDim: 0x3a2806 },
        // Retro CRT GREEN phosphor — leaned more saturated / cyan-green than
        // 'forest' so it reads as a terminal, not woodland (dRGB 35 vs forest,
        // 32 vs deepsea). Phosphor-green board + green lane. Verified to keep
        // green/teal gems legible (green-on-green floor CR ~2.2).
        cathodegreen: { clear: 0x07301a, fog: 0x07301a, board: 0x031a0c, lane: 0x0e6e2a, laneDim: 0x073a18 },
        // Warm hearth — the first warm-RED scene, pairs with the Ember/Sunrise
        // strings. Deep red, pushed away from the amber 'cathode'/'warmslate'
        // (dRGB ~26 from cathode). Ember-red lane.
        hearth:     { clear: 0x280806, fog: 0x280806, board: 0x1a0606, lane: 0x7a2410, laneDim: 0x3f1409 },
    };
    const BG_THEME_IDS = Object.keys(BG_THEMES);
    // Shared lookup for the combined entry (both axes are keyed by the same id
    // set, so a single id list / coerce check validates either axis).
    function _bgThemeColors(id) { return BG_THEMES[id] || BG_THEMES.default; }
    // Per-axis accessors. Background reads clear/fog; highway reads
    // board/lane/laneDim. They alias the same table — splitting at read-time
    // keeps one source of truth while letting the two dropdowns pick freely.
    function _bgBackgroundColors(id) { return _bgThemeColors(id); }
    function _bgHighwayColors(id) { return _bgThemeColors(id); }
    const VENUE_SCENE_ASSET_BASE = '/static/assets/venue/themes/small-club/';
    const VENUE_BG_PLATE_PNG = 'bg-plate.png';
    const VENUE_BG_PLATE_WEBP = 'bg-plate.webp';
    const VENUE_INSTRUMENT_PLATES = {
        guitar: { webp: 'guitar-pov-bg.webp', png: 'guitar-pov-bg.png' },
        bass: { webp: 'bass-pov-bg.webp', png: 'bass-pov-bg.png' },
        drums: { webp: 'drums-pov-bg.webp', png: 'drums-pov-bg.png' },
        piano: { webp: 'piano-pov-bg.webp', png: 'piano-pov-bg.png' },
        vocals: { webp: 'vocals-pov-bg.webp', png: 'vocals-pov-bg.png' },
    };
    let _venueSceneOverride = false;
    let _venueMoodState = 'idle';
    let _venueInstrumentPov = 'guitar';
    let _venueMotionMode = 'subtle';
    let _venuePlateUrl = '';
    let _venueSceneAssetsLoaded = false;
    let _venueSceneLoadFailed = false;
    const _venueTextureCache = new Map();
    // Crowd video layers (career mode). venue-crowd.js owns the <video>
    // elements and the crossfade timing; the renderer only maps them onto
    // two planes in front of the static plate. _venueCrowdRev bumps on any
    // element (re)assignment so update() knows to rebind textures.
    const _venueCrowdVideos = [null, null];
    let _venueCrowdMix = 0;
    let _venueCrowdRev = 0;

    function _bgVenueMoodCoeffs(state) {
        const s = String(state || 'idle').toLowerCase();
        if (s === 'fire' || s === 'strong') {
            return { light: 1.0, crowd: 0, haze: 0.012, warmth: 1.02 };
        }
        if (s === 'recovery' || s === 'smoke') {
            return { light: 0.55, crowd: 0, haze: 0.032, warmth: 0.94 };
        }
        return { light: 0.72, crowd: 0, haze: VENUE_HAZE_STEADY, warmth: 0.96 };
    }

    function _venueResolvePovFromInput(input) {
        if (typeof window !== 'undefined' && window.v3VenueInstrumentPov &&
            typeof window.v3VenueInstrumentPov.resolveVenueInstrumentPov === 'function') {
            return window.v3VenueInstrumentPov.resolveVenueInstrumentPov(input);
        }
        const s = String(input == null ? '' : input).trim().toLowerCase();
        if (!s) return 'guitar';
        if (/\b(drums?)\b/.test(s)) return 'drums';
        if (/\b(bass)\b/.test(s)) return 'bass';
        if (/\b(piano|keys|keyboard)\b/.test(s)) return 'piano';
        if (/\b(karaoke|vocal|vocals|lyric|lyrics|sing|singing)\b/.test(s)) return 'vocals';
        if (/\b(lead|rhythm|guitar|combo)\b/.test(s)) return 'guitar';
        return 'guitar';
    }

    function _venueMotionProfile(mode) {
        if (typeof window !== 'undefined' && window.v3VenueMoodFx &&
            typeof window.v3VenueMoodFx.venueMotionProfile === 'function') {
            return window.v3VenueMoodFx.venueMotionProfile(mode);
        }
        const m = String(mode || 'subtle').toLowerCase();
        if (m === 'off') {
            return { breathe: 0, parallax: 0, hazeDrift: 0, warmthPulse: 0, shimmer: 0 };
        }
        if (m === 'full') {
            return { breathe: 0.014, parallax: 0.010, hazeDrift: 0.020, warmthPulse: 0.028, shimmer: 0.10 };
        }
        return { breathe: 0.005, parallax: 0.004, hazeDrift: 0.007, warmthPulse: 0.010, shimmer: 0.04 };
    }

    function _venuePrefersReducedMotion() {
        if (typeof window !== 'undefined' && window.v3VenueMoodFx &&
            typeof window.v3VenueMoodFx.prefersReducedMotion === 'function') {
            return window.v3VenueMoodFx.prefersReducedMotion();
        }
        return false;
    }

    function _venueEffectiveMotionMode() {
        if (!_venueSceneOverride) return 'off';
        if (_venuePrefersReducedMotion()) return 'off';
        return _venueMotionMode;
    }

    function _venueApplyFakeDepthMotion(s, coeffs, t) {
        const motion = _venueMotionProfile(_venueEffectiveMotionMode());
        if (!motion.breathe && !motion.parallax && !motion.hazeDrift && !motion.warmthPulse) {
            if (s.haze && s.haze.mesh) {
                s.haze.mesh.position.set(s.haze.baseX, s.haze.baseY, s.haze.baseZ);
            }
            return motion;
        }
        const breath = Math.sin(t * 0.38);
        const parallax = Math.sin(t * 0.21);
        const shimmer = Math.sin(t * 0.55);
        if (s.backdrop && s.backdrop.loaded && s.backdrop.mesh) {
            const mesh = s.backdrop.mesh;
            const vh = s.backdrop.lastVisibleHeight || 1;
            const vw = s.backdrop.lastVisibleWidth || vh;
            const offX = parallax * motion.parallax * vh;
            const offY = breath * motion.breathe * vh * 0.35;
            mesh.position.x += offX;
            mesh.position.y += offY;
            const scaleMul = 1 + breath * motion.breathe * 2.5;
            mesh.scale.set(vw * scaleMul, vh * scaleMul, 1);
            if (s.backdrop.mat) {
                const warm = coeffs.warmth;
                const warmPulse = 1 + shimmer * motion.warmthPulse;
                s.backdrop.mat.color.setRGB(
                    warm * warmPulse,
                    warm * 0.98 * warmPulse,
                    warm * 0.95 * (1 + shimmer * motion.warmthPulse * 0.6),
                );
            }
        } else if (s.backdrop && s.backdrop.mat) {
            const warm = coeffs.warmth;
            s.backdrop.mat.color.setRGB(warm, warm * 0.98, warm * 0.95);
        }
        if (s.haze && s.haze.mesh) {
            const driftX = Math.sin(t * 0.18) * motion.hazeDrift * 8 * K;
            const driftY = Math.cos(t * 0.14) * motion.hazeDrift * 4 * K;
            s.haze.mesh.position.set(
                s.haze.baseX + driftX,
                s.haze.baseY + driftY,
                s.haze.baseZ,
            );
            if (s.haze.mat) {
                const baseOp = (s.haze.baseOp || VENUE_HAZE_STEADY) * (coeffs.haze / VENUE_HAZE_STEADY);
                s.haze.mat.opacity = baseOp * (1 + shimmer * motion.shimmer * 0.12);
            }
        }
        return motion;
    }

    function _venuePlateUrlChain(pov) {
        const plate = VENUE_INSTRUMENT_PLATES[pov] || VENUE_INSTRUMENT_PLATES.guitar;
        const base = VENUE_SCENE_ASSET_BASE;
        return [
            base + plate.webp,
            base + plate.png,
            base + VENUE_BG_PLATE_WEBP,
            base + VENUE_BG_PLATE_PNG,
        ];
    }

    function _venueLoadCachedTexture(loader, url, onSuccess, onFail) {
        const cached = _venueTextureCache.get(url);
        if (cached) {
            onSuccess(cached, url);
            return;
        }
        loader.load(
            url,
            (tex) => {
                _venueTextureCache.set(url, tex);
                onSuccess(tex, url);
            },
            undefined,
            onFail,
        );
    }

    function _venueApplyPlateTexture(backdrop, tex, url) {
        backdrop.tex = tex;
        backdrop.plateUrl = url;
        _venuePlateUrl = url;
        backdrop.mat.map = tex;
        backdrop.mat.needsUpdate = true;
        if (backdrop.applyCoverCrop) backdrop.applyCoverCrop();
        backdrop.loaded = true;
        backdrop.mesh.visible = true;
    }

    function _venueLoadPlateForPov(loader, pov, backdrop, onSuccess, onFail) {
        const chain = _venuePlateUrlChain(pov);
        let idx = 0;
        function tryNext() {
            if (idx >= chain.length) {
                onFail();
                return;
            }
            const url = chain[idx++];
            _venueLoadCachedTexture(loader, url, (tex, loadedUrl) => {
                _venueApplyPlateTexture(backdrop, tex, loadedUrl);
                onSuccess(tex, loadedUrl);
            }, tryNext);
        }
        tryNext();
    }

    function _venueSwapPlateIfNeeded(s) {
        if (!s || s.failed || s.plateLoading || !s.loader || !s.backdrop) return;
        const pov = _venueInstrumentPov;
        if (s.instrumentPov === pov && s.backdrop.loaded) return;
        s.plateLoading = true;
        _venueLoadPlateForPov(
            s.loader,
            pov,
            s.backdrop,
            () => {
                s.instrumentPov = pov;
                s.plateLoading = false;
                s.loaded = true;
                _venueSceneAssetsLoaded = true;
                _venueSceneLoadFailed = false;
                // The POV may have changed while this load was in flight (the
                // plateLoading latch made concurrent swaps no-op). Re-sync to the
                // current target so the backdrop isn't stranded on a stale plate.
                if (_venueInstrumentPov !== pov) _venueSwapPlateIfNeeded(s);
            },
            () => {
                s.plateLoading = false;
                if (s.backdrop.loaded) return;
                s.failed = true;
                _venueSceneLoadFailed = true;
                _venueSceneAssetsLoaded = false;
                console.warn('[venue-scene] failed to load venue bg plate for pov ' + pov);
                _venueSceneOverride = false;
                _bgEmitChange('venueScene');
                try {
                    if (typeof window !== 'undefined' && window.v3VenueScene3d &&
                        typeof window.v3VenueScene3d.onAssetsFailed === 'function') {
                        window.v3VenueScene3d.onAssetsFailed('failed to load venue bg plate');
                    }
                } catch (_) { /* visual-only */ }
            },
        );
    }
    const FRET_NUMBER_GHOST_SCOPE_IDS = ['chords', 'all'];

    /**
     * localStorage panel key for per-panel background settings ('main' or
     * 'panel<index>'). Defensive on the splitscreen global-name rename in flight,
     * and throw-safe on panelIndexFor — same as _freeCamFor — so a misbehaving
     * splitscreen build can't take down background-settings resolution. Only a
     * non-negative integer index yields a 'panel<N>' key; anything else (null,
     * NaN, negative, non-integer) falls back to 'main' so a bad index can never
     * mint a bogus "panelNaN"-style key.
     * @param {HTMLCanvasElement} canvas this renderer's highway canvas
     * @returns {string} 'main' or 'panel<index>'
     */
    function _bgPanelKey(canvas) {
        const ss = window.feedBackSplitscreen || window.slopsmithSplitscreen;
        let idx = null;
        if (ss && typeof ss.panelIndexFor === 'function') {
            try { idx = ss.panelIndexFor(canvas); } catch (e) { idx = null; }
        }
        return (Number.isInteger(idx) && idx >= 0) ? 'panel' + idx : 'main';
    }

    /**
     * Camera Director bridge resolver. Prefers THIS panel's per-panel camera under
     * splitscreen (window.__h3dCamCtlPanels[panelIndex]) and falls back to the
     * single global (window.__h3dCamCtl); returns null when Camera Director is
     * absent → 100% stock framing. Defensive on the splitscreen global-name rename
     * in flight (feedBackSplitscreen vs slopsmithSplitscreen); throw-safe on
     * panelIndexFor. Mirrors the panel resolution in _bgPanelKey.
     * @param {HTMLCanvasElement} canvas this renderer's highway canvas
     * @returns {object|null} the resolved free-camera bridge, or null
     */
    function _freeCamFor(canvas) {
        const map = window.__h3dCamCtlPanels;
        if (map) {
            const ss = window.feedBackSplitscreen || window.slopsmithSplitscreen;
            if (ss && typeof ss.panelIndexFor === 'function') {
                try {
                    const i = ss.panelIndexFor(canvas);
                    // Only a non-negative integer indexes the map (same hardening
                    // as _bgPanelKey) — a non-int / negative / string index must not
                    // resolve an unintended/inherited property; fall through then.
                    if (Number.isInteger(i) && i >= 0 && map[i]) return map[i];
                } catch (e) { /* ignore */ }
            }
        }
        return window.__h3dCamCtl || null;
    }
    // In-memory fallback for when localStorage is blocked (private mode,
    // sandboxed iframes, some test runners). _bgWriteGlobal stages the
    // value here unconditionally, so it always reflects the most recent
    // in-session intent — _bgReadSetting prefers it over the global
    // localStorage slot to avoid serving a stale persisted value when
    // a write failed silently (quota exceeded, etc.). Per-panel
    // localStorage overrides still win because they're an explicit
    // per-instance opt-out and shouldn't be shadowed by a global edit.
    const _bgMemFallback = Object.create(null);
    function _bgReadSetting(panelKey, key) {
        let panelVal = null;
        let globalVal = null;
        try {
            // 'palette' + 'customColors' are GLOBAL-only: the per-panel palette
            // control was removed in favour of the global "Highway String Colors"
            // UI, so a panel must never be shadowed by a stale per-panel override
            // (h3d_bg_panel<idx>_palette / _customColors). Neither is a
            // BG_DEFAULTS key, so per-panel scoping never applied to them.
            if (key !== 'palette' && key !== 'customColors') {
                panelVal = localStorage.getItem('h3d_bg_' + panelKey + '_' + key);
            }
            globalVal = localStorage.getItem('h3d_bg_' + key);
        } catch (_) { /* storage blocked — both stay null */ }
        if (panelVal !== null && panelVal !== undefined) return _bgCoerce(key, panelVal);
        // Prefer the in-memory staged value over the persisted global slot.
        // _bgWriteGlobal always writes to _bgMemFallback first, so the
        // memory value is at least as fresh as the persisted one.
        if (key in _bgMemFallback) return _bgCoerce(key, _bgMemFallback[key]);
        if (globalVal !== null && globalVal !== undefined) return _bgCoerce(key, globalVal);
        return BG_DEFAULTS[key];
    }
    // Read a setting's GLOBAL value, ignoring any per-panel override. The
    // player-chrome control is a single shared instance, so it must always
    // read (and write) the global slot. Passing null as a panelKey to
    // _bgReadSetting happened to work only because 'h3d_bg_null_<key>' never
    // exists; this states the intent directly and can't be shadowed if a
    // panelKey of null is ever used deliberately. Mirrors the global half of
    // _bgReadSetting exactly (mem-fallback precedence, then persisted, then
    // default).
    function _bgReadGlobal(key) {
        let globalVal = null;
        try { globalVal = localStorage.getItem('h3d_bg_' + key); } catch (_) { /* storage blocked */ }
        if (key in _bgMemFallback) return _bgCoerce(key, _bgMemFallback[key]);
        if (globalVal !== null && globalVal !== undefined) return _bgCoerce(key, globalVal);
        return BG_DEFAULTS[key];
    }
    // Shared "stored string -> bool" coercion for every boolean
    // setting. Mirrors settings.html's coerceBool so the renderer and
    // the UI hydration always agree on what a corrupted/unknown value
    // means (fall back to default rather than silently flipping to
    // false). Add new boolean keys to BG_DEFAULTS and they pick this
    // up via the dispatch below.
    const _BG_BOOL_KEYS = new Set(['reactive', 'showFretOnNote', 'cameraLockLow', 'inlayLabelsVisible', 'sectionLabelsOnHighway', 'sectionHudVisible', 'nutHeadstockVisible', 'tuningLabelsVisible', 'projectionVisible', 'chordDiagramVisible', 'fpsVisible', 'toneHudVisible', 'fretDividersVisible', 'slideArrowApproachVisible', 'slideArrowNeckVisible', 'slideArrowChainPreviewVisible', 'sparks', 'cinematic', 'verdictMarks', 'timingFx', 'streakFx', 'bloom']);
    function _bgCoerceBool(val, fallback) {
        if (val === 'true' || val === '1') return true;
        if (val === 'false' || val === '0') return false;
        return fallback;
    }
    // Settings stored as 0..1 floats. cameraSmoothing controls X-pan
    // hysteresis; zoomSmoothing the zoom dead zone; tiltSmoothing the
    // vertical-tilt deadband + correction strength. All three slider-
    // shaped settings share the same parse + clamp behaviour.
    const _BG_FLOAT_KEYS = new Set(['intensity', 'cameraSmoothing', 'zoomSmoothing', 'tiltSmoothing', 'cameraLockZoom', 'textSize', 'vibrancy', 'glow', 'chordDiagramSize', 'sectionHudSize', 'toneHudSize', 'hitFx']);
    function _bgCoerce(key, val) {
        if (_BG_FLOAT_KEYS.has(key)) {
            const n = parseFloat(val);
            return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : BG_DEFAULTS[key];
        }
        if (_BG_BOOL_KEYS.has(key)) return _bgCoerceBool(val, BG_DEFAULTS[key]);
        if (key === 'style') return BG_STYLE_IDS.includes(val) ? val : BG_DEFAULTS.style;
        if (key === 'palette') return (PALETTE_IDS.includes(val) || val === 'custom') ? val : BG_DEFAULTS.palette;
        if (key === 'bgTheme') return BG_THEME_IDS.includes(val) ? val : BG_DEFAULTS.bgTheme;
        // Highway axis shares the same id-set as the background axis.
        if (key === 'hwTheme') return BG_THEME_IDS.includes(val) ? val : BG_DEFAULTS.hwTheme;
        if (key === 'chordDiagramPosition')
            return CHORD_DIAG_POSITION_IDS.includes(val) ? val : BG_DEFAULTS.chordDiagramPosition;
        if (key === 'sectionHudPosition')
            return ['tl', 'tr', 'bl', 'br'].includes(val) ? val : BG_DEFAULTS.sectionHudPosition;
        if (key === 'toneHudPosition')
            return ['tl', 'tr', 'bl', 'br'].includes(val) ? val : BG_DEFAULTS.toneHudPosition;
        if (key === 'cameraMode') {
            if (val === 'classic') val = 'steady';
            return CAMERA_MODE_IDS.includes(val) ? val : BG_DEFAULTS.cameraMode;
        }
        if (key === 'fretNumberGhostScope')
            return FRET_NUMBER_GHOST_SCOPE_IDS.includes(val) ? val : BG_DEFAULTS.fretNumberGhostScope;
        if (key === 'nutColor' || key === 'headstockColor') {
            if (typeof val !== 'string') return BG_DEFAULTS[key];
            const t = val.trim();
            if (/^#[0-9a-fA-F]{6}$/.test(t)) return t.toLowerCase();
            return BG_DEFAULTS[key];
        }
        if (key === 'fretColumnMarkerCadence') {
            const n = parseInt(val, 10);
            if (!Number.isFinite(n)) return BG_DEFAULTS.fretColumnMarkerCadence;
            return Math.max(0, Math.min(16, n));
        }
        return val;
    }

    // Mirror-at-first-read fallback: returns true if the user has ever
    // explicitly written `key` (per-panel, in-memory, or global). When
    // false, callers should treat the value as "unset" — useful for
    // zoomSmoothing / tiltSmoothing which inherit cameraSmoothing's
    // value the first time they're read so existing users who calmed
    // the camera don't lose calmness on the new axes by default.
    function _bgHasStored(panelKey, key) {
        try {
            if (localStorage.getItem('h3d_bg_' + panelKey + '_' + key) != null) return true;
        } catch (_) {}
        if (key in _bgMemFallback) return true;
        try {
            if (localStorage.getItem('h3d_bg_' + key) != null) return true;
        } catch (_) {}
        return false;
    }
    function _bgWriteGlobal(key, val) {
        const s = String(val);
        // Stage in memory FIRST so _bgReadSetting's "memory beats global
        // localStorage" precedence has a true freshness guarantee even
        // if localStorage.setItem throws partway through. Without this
        // ordering, a quota exception thrown after the persisted slot
        // was already mutated would leave a stale value in localStorage
        // that's newer than _bgMemFallback.
        _bgMemFallback[key] = s;
        try { localStorage.setItem('h3d_bg_' + key, s); } catch (_) { /* storage blocked */ }
        _bgEmitChange(key);
    }

    // Pub-sub so settings.html can update live across all panel instances.
    const _bgListeners = new Set();
    function _bgSubscribe(fn) { _bgListeners.add(fn); }
    function _bgUnsubscribe(fn) { _bgListeners.delete(fn); }
    function _bgEmitChange(key) {
        for (const fn of _bgListeners) {
            try { fn(key); } catch (e) { console.error('[3D-Hwy] bg listener threw', e); }
        }
    }

    // Settings.html setters — global keys; per-panel overrides via direct
    // localStorage edits today, runtime UI in a follow-up.
    window.h3dBgSetStyle = (v) => _bgWriteGlobal('style', v);
    window.h3dBgSetIntensity = (v) => _bgWriteGlobal('intensity', v);
    window.h3dBgSetReactive = (v) => _bgWriteGlobal('reactive', !!v);
    window.h3dBgSetPalette = (v) => _bgWriteGlobal('palette', v);
    // BACKGROUND scene-color axis (clear + fog only). Validated against
    // BG_THEME_IDS in _bgCoerce; the listener re-applies clear/fog live and
    // independently of the highway axis.
    window.h3dBgSetBgTheme = (v) => {
        const s = String(v);
        _bgWriteGlobal('bgTheme', BG_THEME_IDS.includes(s) ? s : BG_DEFAULTS.bgTheme);
    };
    // HIGHWAY scene-color axis (board + lane + laneDim). Same id-set as the
    // background axis, so any highway can mix with any background. The listener
    // re-applies the board plane + lane live and independently.
    window.h3dBgSetHwTheme = (v) => {
        const s = String(v);
        _bgWriteGlobal('hwTheme', BG_THEME_IDS.includes(s) ? s : BG_DEFAULTS.hwTheme);
    };
    // Apply a user-defined per-string color set (core theming UI). `hexArray`
    // is up to 8 hex strings; invalid/missing entries fall back to the default
    // palette per index. Writes the colors, then flips the palette to 'custom'
    // — the palette listener retints all materials + rebuilds the board live.
    // Pass null/[] then h3dBgSetPalette('default') to revert.
    window.h3dBgSetStringColors = (hexArray) => {
        const arr = Array.isArray(hexArray) ? hexArray : [];
        const norm = [];
        for (let i = 0; i < MAX_RENDER_STRINGS; i++) {
            const n = _h3dHexToInt(arr[i]);
            norm[i] = (n != null) ? '#' + n.toString(16).padStart(6, '0') : null;
        }
        _bgWriteGlobal('customColors', JSON.stringify(norm));
        _bgWriteGlobal('palette', 'custom');
    };
    window.h3dBgSetShowFretOnNote = (v) => _bgWriteGlobal('showFretOnNote', !!v);
    window.h3dBgSetFretNumberGhostScope = (v) => {
        const s = String(v);
        _bgWriteGlobal('fretNumberGhostScope', FRET_NUMBER_GHOST_SCOPE_IDS.includes(s) ? s : BG_DEFAULTS.fretNumberGhostScope);
    };
    window.h3dBgSetCameraSmoothing = (v) => _bgWriteGlobal('cameraSmoothing', v);
    window.h3dBgSetZoomSmoothing = (v) => _bgWriteGlobal('zoomSmoothing', v);
    window.h3dBgSetTiltSmoothing = (v) => _bgWriteGlobal('tiltSmoothing', v);
    window.h3dBgSetCameraLockLow = (v) => _bgWriteGlobal('cameraLockLow', !!v);
    window.h3dBgSetCameraLockZoom = (v) => _bgWriteGlobal('cameraLockZoom', v);
    window.h3dBgSetCameraMode = (v) => {
        let s = String(v);
        if (s === 'classic') s = 'steady';
        _bgWriteGlobal('cameraMode', s);
    };
    window.h3dBgSetNutHeadstockVisible = (v) => _bgWriteGlobal('nutHeadstockVisible', !!v);
    window.h3dBgSetTuningLabelsVisible = (v) => _bgWriteGlobal('tuningLabelsVisible', !!v);
    window.h3dBgSetNutColor = (v) => _bgWriteGlobal('nutColor', v);
    window.h3dBgSetHeadstockColor = (v) => _bgWriteGlobal('headstockColor', v);
    window.h3dBgSetTextSize = (v) => _bgWriteGlobal('textSize', v);
    window.h3dBgSetVibrancy = (v) => _bgWriteGlobal('vibrancy', v);
    window.h3dBgSetGlow     = (v) => _bgWriteGlobal('glow', v);
    window.h3dBgSetHitFx        = (v) => _bgWriteGlobal('hitFx', v);
    window.h3dBgSetSparks       = (v) => _bgWriteGlobal('sparks', !!v);
    window.h3dBgSetCinematic    = (v) => _bgWriteGlobal('cinematic', !!v);
    window.h3dBgSetVerdictMarks = (v) => _bgWriteGlobal('verdictMarks', !!v);
    window.h3dBgSetTimingFx     = (v) => _bgWriteGlobal('timingFx', !!v);
    window.h3dBgSetStreakFx     = (v) => _bgWriteGlobal('streakFx', !!v);
    window.h3dBgSetBloom        = (v) => _bgWriteGlobal('bloom', !!v);
    window.h3dBgSetToneHudVisible   = (v) => _bgWriteGlobal('toneHudVisible', !!v);
    window.h3dBgSetToneHudPosition  = (v) => _bgWriteGlobal('toneHudPosition', v);
    window.h3dBgSetToneHudSize      = (v) => _bgWriteGlobal('toneHudSize', v);
    window.h3dBgSetFpsVisible           = (v) => _bgWriteGlobal('fpsVisible', !!v);
    window.h3dBgSetFretDividersVisible  = (v) => _bgWriteGlobal('fretDividersVisible', !!v);
    window.h3dBgSetChordDiagramVisible  = (v) => _bgWriteGlobal('chordDiagramVisible', !!v);
    window.h3dBgSetChordDiagramSize     = (v) => _bgWriteGlobal('chordDiagramSize', v);
    window.h3dBgSetChordDiagramPosition = (v) => _bgWriteGlobal('chordDiagramPosition', v);
    window.h3dBgSetFretColumnMarkerCadence = (v) => _bgWriteGlobal('fretColumnMarkerCadence', v);
    window.h3dBgSetInlayLabelsVisible = (v) => _bgWriteGlobal('inlayLabelsVisible', !!v);
    window.h3dBgSetSectionLabelsOnHighway = (v) => _bgWriteGlobal('sectionLabelsOnHighway', !!v);
    window.h3dBgSetSectionHudVisible      = (v) => _bgWriteGlobal('sectionHudVisible', !!v);
    window.h3dBgSetSectionHudPosition     = (v) => _bgWriteGlobal('sectionHudPosition', v);
    window.h3dBgSetSectionHudSize         = (v) => _bgWriteGlobal('sectionHudSize', v);
    window.h3dBgSetProjectionVisible      = (v) => _bgWriteGlobal('projectionVisible', !!v);
    window.h3dBgSetSlideArrowApproachVisible = (v) => _bgWriteGlobal('slideArrowApproachVisible', !!v);
    window.h3dBgSetSlideArrowNeckVisible     = (v) => _bgWriteGlobal('slideArrowNeckVisible', !!v);
    window.h3dBgSetSlideArrowChainPreviewVisible = (v) => _bgWriteGlobal('slideArrowChainPreviewVisible', !!v);
    // Custom image asset for the 'image' bg style (#19). Composite setter:
    // writes both the data URL (the bytes that drive the texture) and the
    // display filename, each emitting a change event. The listener
    // rebuilds on customImageDataUrl change when the image style is
    // active; customImageName is display-only and skips rebuild.
    window.h3dBgSetCustomImage = (asset) => {
        const a = asset || {};
        _bgWriteGlobal('customImageDataUrl', a.dataUrl || '');
        _bgWriteGlobal('customImageName', a.name || '');
    };
    window.h3dBgClearCustomImage = () => {
        _bgWriteGlobal('customImageDataUrl', '');
        _bgWriteGlobal('customImageName', '');
    };
    // Custom video asset for the 'video' bg style (#19 follow-up).
    // Bytes live on disk under {config_dir}/plugin_uploads/highway_3d/
    // and are served by routes.py — localStorage only stores the
    // filename, which the renderer maps to the served URL. Single
    // global slot; the file picker in settings.html POSTs to the
    // upload route and then calls this setter with the response name.
    window.h3dBgSetCustomVideo = (asset) => {
        _bgWriteGlobal('customVideoName', (asset && asset.name) || '');
    };
    window.h3dBgClearCustomVideo = () => _bgWriteGlobal('customVideoName', '');
    window.h3dVenueSceneSetActive = (on) => {
        const next = !!on;
        if (_venueSceneOverride === next) return;
        _venueSceneOverride = next;
        if (!next) {
            _venueSceneAssetsLoaded = false;
            _venueSceneLoadFailed = false;
        }
        _bgEmitChange('venueScene');
    };
    window.h3dVenueSceneSetMood = (state) => {
        _venueMoodState = String(state || 'idle').toLowerCase();
    };
    // Crowd video layers (career mode) — see venue-crowd.js. Layer 0/1 are
    // two coplanar backdrop planes; mix selects between them (0 → layer 0,
    // 1 → layer 1) so the caller can crossfade loop videos.
    window.h3dVenueBackdropSetVideo = (layer, videoEl) => {
        const i = layer ? 1 : 0;
        const el = videoEl || null;
        if (_venueCrowdVideos[i] === el) return;
        _venueCrowdVideos[i] = el;
        _venueCrowdRev++;
    };
    window.h3dVenueBackdropSetMix = (mix) => {
        const v = Number(mix);
        _venueCrowdMix = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
    };
    window.h3dVenueSceneSetInstrumentPov = (input) => {
        const next = _venueResolvePovFromInput(input);
        if (_venueInstrumentPov === next) return;
        _venueInstrumentPov = next;
        _bgEmitChange('venueInstrumentPov');
    };
    window.h3dVenueSceneSetMotionMode = (mode) => {
        const next = String(mode || 'subtle').toLowerCase();
        const allowed = { off: 1, subtle: 1, full: 1 };
        _venueMotionMode = allowed[next] ? next : 'subtle';
    };
    window.h3dVenueSceneGetState = () => {
        const motionMode = _venueEffectiveMotionMode();
        const motionProfile = _venueMotionProfile(motionMode);
        return {
            active: _venueSceneOverride,
            mood: _venueMoodState,
            instrumentPov: _venueInstrumentPov,
            motionMode: _venueMotionMode,
            motionEffective: motionMode,
            motionEnabled: motionMode !== 'off',
            motionIntensity: motionProfile.breathe + motionProfile.parallax + motionProfile.hazeDrift,
            motionProfile,
            plateUrl: _venuePlateUrl || null,
            assetsLoaded: _venueSceneAssetsLoaded,
            loadFailed: _venueSceneLoadFailed,
        };
    };
    // Back-compat alias for any caller that picked up the original
    // (inconsistent) name during this PR's review window.
    window.h3dSetPalette = window.h3dBgSetPalette;

    // Procedural silhouette bitmap, drawn once and shared across panels.
    // The Canvas2D bitmap is module-level (cheap, CPU-only); each layer
    // wraps it in its own CanvasTexture so per-layer texture.offset.x
    // can drive a seam-free scroll without coupling to other layers /
    // panels (a shared CanvasTexture would synchronize all offsets).
    let _silCanvas = null;
    function _bgEnsureSilhouetteCanvas() {
        if (_silCanvas) return _silCanvas;
        const c = document.createElement('canvas');
        c.width = 1024; c.height = 64;
        const cx = c.getContext('2d');
        if (!cx) {
            // Restrictive environments (some sandboxed iframes, headless
            // tests) can return null. Without a guard, the clearRect/
            // fillRect calls below would throw TypeError and the silhouette
            // style would never become available.
            throw new Error('[3D-Hwy] 2D canvas context unavailable for silhouette texture');
        }
        cx.clearRect(0, 0, c.width, c.height);
        cx.fillStyle = '#000814';
        let x = 0;
        while (x < c.width) {
            const w = 8 + Math.random() * 30;
            const h = 20 + Math.random() * 40;
            cx.fillRect(x, c.height - h, w, h);
            x += w + Math.random() * 10;
        }
        _silCanvas = c;
        return c;
    }

    // Helpers shared by the asset-driven bg styles (image, video).
    // Both render a "stage backdrop" plane that's full-bleed: sized
    // each frame to fill the camera's view frustum at a fixed
    // distance and positioned to track the camera (so the user's
    // image/video reads as the entire visible BG, with highway and
    // notes painting on top via renderOrder).
    //
    // Distance is chosen far enough back that no note ever lands
    // beyond it; depthWrite=false on the plane material plus
    // renderOrder=-1 means notes still paint on top regardless.
    const BG_BACKDROP_DISTANCE = FOG_END * 0.95;

    // Module-level scratch vector reused each frame to avoid GC
    // churn from per-frame Vector3 allocation. Only valid for the
    // duration of a single update() call.
    const _bgBackdropTmp = (() => {
        // Lazily created when T is available (T isn't bound at module
        // parse time — initScene assigns it inside loadThree().then).
        // Returning a getter that allocates on first read keeps the
        // dependency timing clean.
        let v = null;
        return () => v || (v = new T.Vector3());
    })();

    // Frustum-fit a plane mesh: scale a unit PlaneGeometry to exactly
    // fill the camera's view at the configured distance, then position
    // it `distance` units in front of the camera and orient it so the
    // texture faces the camera. Called whenever cam.aspect changes
    // (resize) and to position-track the camera each frame.
    function _bgFitBackdropPlane(state) {
        const cam = state.cam;
        const d = state.distance;
        const halfFovRad = cam.fov * Math.PI / 360;
        const visibleHeight = 2 * Math.tan(halfFovRad) * d;
        const visibleWidth = visibleHeight * cam.aspect;
        if (state.lastAspect !== cam.aspect ||
            state.lastVisibleHeight !== visibleHeight) {
            state.mesh.scale.set(visibleWidth, visibleHeight, 1);
            state.lastAspect = cam.aspect;
            state.lastVisibleHeight = visibleHeight;
            state.lastVisibleWidth = visibleWidth;
            // Aspect change shifts the cover-crop ratio; re-apply.
            if (state.applyCoverCrop) state.applyCoverCrop();
        }
        // Track camera each frame: position = cam.position +
        // cam.forward * distance, orient toward camera.
        const fwd = cam.getWorldDirection(_bgBackdropTmp());
        state.mesh.position.copy(cam.position).addScaledVector(fwd, d);
        state.mesh.lookAt(cam.position);
    }

    // Cover-crop a texture to the plane aspect: the larger axis fills
    // the plane (cropped if needed), centered. For wider-than-plane
    // textures the X offset is left at the centered value but the
    // image style's drift loop overwrites it per frame; the video
    // style leaves it centered.
    function _bgCoverCrop(tex, srcW, srcH, planeAspect) {
        if (srcW <= 0 || srcH <= 0) return;
        tex.repeat.set(1, 1);
        tex.offset.set(0, 0);
        const srcAspect = srcW / srcH;
        if (srcAspect > planeAspect) {
            tex.repeat.x = planeAspect / srcAspect;
            tex.offset.x = (1 - tex.repeat.x) * 0.5;
        } else {
            tex.repeat.y = srcAspect / planeAspect;
            tex.offset.y = (1 - tex.repeat.y) * 0.5;
        }
        tex.needsUpdate = true;
    }

    // Background-style registry. Each entry returns a per-panel state
    // object from build() and reads from it in update() / teardown().
    // T (THREE) is set by the time these are invoked (initScene runs
    // inside loadThree().then).
    const BG_STYLES = {
        off: {
            build() { return null; },
            update() {},
            teardown() {},
        },
        particles: {
            build(scene, settings) {
                const N = Math.max(20, Math.floor(80 + 200 * settings.intensity));
                const positions = new Float32Array(N * 3);
                for (let i = 0; i < N; i++) {
                    positions[i * 3] = (Math.random() - 0.5) * 800 * K;
                    positions[i * 3 + 1] = (Math.random() - 0.4) * 80 * K;
                    // Spawn within the visible fog range. Fog reaches
                    // its far limit at FOG_END * 1.2 from the camera,
                    // and cam.position.z is updated each frame in
                    // camUpdate() (`dist * 0.75`, where dist tracks
                    // aspectScale). Anything beyond that camera-relative
                    // distance gets fully fogged out, so the cutoff in
                    // world z is dynamic — the earlier "push past notes"
                    // fix placed particles at -FOG_END * (0.95..1.20)
                    // which sat past fog far at any camera z, making
                    // them invisible. renderOrder = -1 on the bg stage
                    // already keeps particles behind notes regardless
                    // of z, so depth-based separation wasn't needed and
                    // was actively breaking visibility.
                    positions[i * 3 + 2] = -FOG_START - Math.random() * (FOG_END - FOG_START) * 0.85;
                }
                const geo = new T.BufferGeometry();
                geo.setAttribute('position', new T.BufferAttribute(positions, 3));
                const mat = new T.PointsMaterial({
                    // size 5*K (bumped from 1.5*K). At distance ~700*K
                    // with sizeAttenuation the prior sprite shrank
                    // below 2 pixels — practically invisible against
                    // dark fog. 5*K reads as a small bright dot.
                    // Build-time opacity is overridden every frame in
                    // update() — the runtime formula is the source of
                    // truth.
                    color: 0xa0c0ff, size: 5 * K, transparent: true,
                    blending: T.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
                });
                const points = new T.Points(geo, mat);
                scene.add(points);
                return { points, geo, mat, N };
            },
            update(s, bands, dt) {
                const positions = s.geo.attributes.position.array;
                const dx = dt * (3 + bands.mid * 12) * K;
                for (let i = 0; i < s.N; i++) {
                    positions[i * 3] += dx;
                    if (positions[i * 3] > 400 * K) positions[i * 3] -= 800 * K;
                }
                s.geo.attributes.position.needsUpdate = true;
                // Bumped opacity floor 0.4 → 0.55 + treble headroom
                // 0.4 → 0.45 so particles read as visible specks even
                // when bgReactive is false / treble≈0 (was effectively
                // 0.4 floor, below noise floor against dark fog).
                s.mat.opacity = 0.55 + bands.treble * 0.45;
            },
            teardown(s) {
                if (!s) return;
                s.points.parent?.remove(s.points);
                s.geo.dispose();
                s.mat.dispose();
            },
        },
        silhouettes: {
            build(scene, settings) {
                const canvas = _bgEnsureSilhouetteCanvas();
                // Inside the visible fog range. Fog far = FOG_END * 1.2
                // from the camera, and cam.position.z is dynamic
                // (camUpdate() sets `dist * 0.75`). renderOrder = -1
                // on the bg stage handles "behind notes" regardless
                // of z. Spread the three layers across the back half
                // of the visible fog band for parallax separation.
                const depths = [-FOG_END * 0.55, -FOG_END * 0.70, -FOG_END * 0.85];
                const layers = [];
                const allocated = [];
                try {
                    for (const z of depths) {
                        // Per-layer CanvasTexture wrapping the shared
                        // canvas: lets each layer scroll independently
                        // via texture.offset.x without coupling to its
                        // siblings or to other panels.
                        const tex = new T.CanvasTexture(canvas);
                        tex.wrapS = T.RepeatWrapping;
                        const geo = new T.PlaneGeometry(800 * K, 50 * K);
                        const mat = new T.MeshBasicMaterial({
                            map: tex, transparent: true, opacity: 0.4, depthWrite: false,
                        });
                        const mesh = new T.Mesh(geo, mat);
                        mesh.position.set(0, -10 * K, z);
                        scene.add(mesh);
                        // Parallax: nearer layers move more than farther
                        // ones (perspective). distance = -z; small d ->
                        // large parallax. Scaled so the nearest sits
                        // around 0.32 and farthest around 0.18.
                        const distance = -z;
                        const parallax = Math.max(0.05, 1 - distance / (FOG_END * 1.4));
                        const layer = { mesh, geo, mat, tex, z, drift: 0, parallax };
                        layers.push(layer);
                        allocated.push(layer);
                    }
                    return { layers, intensity: settings.intensity };
                } catch (e) {
                    // Build threw partway — clean up any per-layer
                    // textures we already created. _bgMountStyle's catch
                    // disposes the stage tree's meshes, but a partial-
                    // build's CanvasTextures aren't reachable from any
                    // mesh yet, so this catch owns them.
                    for (const L of allocated) {
                        L.tex?.dispose?.();
                    }
                    throw e;
                }
            },
            update(s, bands, dt) {
                // Intensity multiplier: 0 dims to ~50% of base, 1
                // brightens to ~120%. Below-base values still leave the
                // silhouettes faintly visible so users know the style
                // is on; above-base lets the layers read as a real
                // backdrop on louder passages.
                const intensityMul = 0.5 + s.intensity * 0.7;
                for (const L of s.layers) {
                    // Scroll via texture.offset.x with RepeatWrapping —
                    // unbounded, no modulus snap. The mesh stays put;
                    // the texture wraps continuously across the visible
                    // surface. (offset is in normalized texture space,
                    // so we keep it small and let the wrap do the job.)
                    L.drift += dt * (0.05 + bands.mid * 0.15) * L.parallax;
                    L.mat.map.offset.x = L.drift;
                    L.mesh.position.y = -10 * K + bands.bass * 4 * K;
                    L.mat.opacity = (0.25 + 0.5 * L.parallax) * intensityMul;
                }
            },
            teardown(s) {
                if (!s) return;
                for (const L of s.layers) {
                    L.mesh.parent?.remove(L.mesh);
                    L.geo.dispose();
                    L.mat.dispose();
                    L.tex.dispose();
                }
            },
        },
        lights: {
            build(scene, settings) {
                // Lights count scales 6 → 14 over intensity 0 → 1.
                // _bgCoerce clamps intensity to [0,1] before it reaches
                // here, so no further clamp is needed.
                const N = Math.floor(6 + 8 * settings.intensity);
                const lights = [];
                // Palette comes from the calling panel's settings so
                // each splitscreen panel picks its own (issue #10).
                // Falls back to the default palette if the caller
                // doesn't supply one (e.g. an older code path).
                const palette = settings.palette || PALETTES.default;
                for (let i = 0; i < N; i++) {
                    const color = palette[i % palette.length];
                    // 30*K plane reads as a real stage glow at distance.
                    // Build-time opacity is overridden every frame in
                    // update() — the runtime formula is the source of
                    // truth.
                    const geo = new T.PlaneGeometry(30 * K, 30 * K);
                    const mat = new T.MeshBasicMaterial({
                        color, transparent: true,
                        blending: T.AdditiveBlending, depthWrite: false,
                    });
                    const mesh = new T.Mesh(geo, mat);
                    mesh.position.set(
                        (Math.random() - 0.5) * 600 * K,
                        (Math.random() - 0.3) * 80 * K,
                        // Inside visible fog range; renderOrder = -1
                        // keeps lights behind notes regardless of z.
                        -FOG_START - Math.random() * (FOG_END - FOG_START) * 0.85
                    );
                    scene.add(mesh);
                    lights.push({ mesh, geo, mat, baseScale: 1 + Math.random() * 0.5, phase: Math.random() * Math.PI * 2 });
                }
                return { lights };
            },
            update(s, bands, dt, t) {
                // Bumped opacity floor 0.35 → 0.55 + treble headroom
                // 0.3 → 0.4 so lights read as visible stage glows at
                // distance instead of faint specks (was effectively
                // 0.35 floor since the build-time bump was overridden
                // by this formula).
                for (const L of s.lights) {
                    const pulse = 1 + bands.bass * 1.5 + Math.sin(t * 1.5 + L.phase) * 0.2;
                    L.mesh.scale.set(L.baseScale * pulse, L.baseScale * pulse, 1);
                    L.mat.opacity = 0.55 + bands.treble * 0.4;
                }
            },
            teardown(s) {
                if (!s) return;
                for (const L of s.lights) {
                    L.mesh.parent?.remove(L.mesh);
                    L.geo.dispose();
                    L.mat.dispose();
                }
            },
        },
        geometric: {
            build(scene, settings) {
                const meshes = [];
                // Bumped opacity floor (0.25 → 0.45) + ceiling so the
                // wireframes read as real shapes instead of barely-
                // there ghosts at low intensity.
                const op = 0.45 + 0.25 * settings.intensity;
                const ico = new T.Mesh(
                    new T.IcosahedronGeometry(30 * K, 1),
                    new T.MeshBasicMaterial({ color: 0x6080c0, wireframe: true, transparent: true, opacity: op, depthWrite: false }),
                );
                // Inside visible fog range; renderOrder = -1 keeps
                // wireframes behind notes regardless of z.
                ico.position.set(-100 * K, 30 * K, -FOG_END * 0.65);
                scene.add(ico);
                meshes.push(ico);
                const torus = new T.Mesh(
                    new T.TorusGeometry(22 * K, 4 * K, 6, 12),
                    new T.MeshBasicMaterial({ color: 0xc06080, wireframe: true, transparent: true, opacity: op * 0.9, depthWrite: false }),
                );
                torus.position.set(120 * K, 20 * K, -FOG_END * 0.75);
                scene.add(torus);
                meshes.push(torus);
                return { meshes };
            },
            update(s, bands, dt) {
                const speed = 0.2 + bands.mid * 0.4;
                const pulse = 1 + bands.bass * 0.25;
                for (const m of s.meshes) {
                    m.rotation.x += dt * speed * 0.3;
                    m.rotation.y += dt * speed * 0.4;
                    m.scale.setScalar(pulse);
                }
            },
            teardown(s) {
                if (!s) return;
                for (const m of s.meshes) {
                    m.parent?.remove(m);
                    m.geometry.dispose();
                    m.material.dispose();
                }
            },
        },
        // Venue visualization — generated small-club raster bg plate
        // behind the highway. Activated via h3dVenueSceneSetActive(true)
        // when Visualization = Venue; does not persist as a user bg style.
        venue: {
            build(scene, settings) {
                const coeffs = _bgVenueMoodCoeffs(_venueMoodState);
                const state = {
                    backdrop: null,
                    haze: null,
                    loader: null,
                    instrumentPov: _venueInstrumentPov,
                    plateLoading: false,
                    pending: 1,
                    loaded: false,
                    failed: false,
                };

                function _venueMarkLoaded() {
                    state.pending--;
                    if (state.pending <= 0 && !state.failed) {
                        state.loaded = true;
                        _venueSceneAssetsLoaded = true;
                        _venueSceneLoadFailed = false;
                        try {
                            if (typeof window !== 'undefined' && window.v3VenueScene3d &&
                                typeof window.v3VenueScene3d.onAssetsLoaded === 'function') {
                                window.v3VenueScene3d.onAssetsLoaded();
                            }
                        } catch (_) { /* visual-only */ }
                    }
                }
                function _venueMarkFailed(msg) {
                    if (state.failed) return;
                    state.failed = true;
                    _venueSceneLoadFailed = true;
                    _venueSceneAssetsLoaded = false;
                    console.warn('[venue-scene] ' + msg);
                    _venueSceneOverride = false;
                    _bgEmitChange('venueScene');
                    try {
                        if (typeof window !== 'undefined' && window.v3VenueScene3d &&
                            typeof window.v3VenueScene3d.onAssetsFailed === 'function') {
                            window.v3VenueScene3d.onAssetsFailed(msg);
                        }
                    } catch (_) { /* visual-only */ }
                }

                const loader = new T.TextureLoader();
                state.loader = loader;
                const backdrop = {
                    mesh: null, geo: null, mat: null, tex: null,
                    cam: settings.cam, distance: BG_BACKDROP_DISTANCE * VENUE_BACKDROP_DISTANCE_MUL,
                    lastAspect: 0, lastVisibleHeight: 0, lastVisibleWidth: 0, loaded: false,
                };
                backdrop.geo = new T.PlaneGeometry(1, 1);
                backdrop.mat = new T.MeshBasicMaterial({
                    color: 0xffffff, transparent: false, depthWrite: false, fog: false,
                });
                backdrop.mesh = new T.Mesh(backdrop.geo, backdrop.mat);
                backdrop.mesh.visible = false;
                scene.add(backdrop.mesh);
                state.backdrop = backdrop;
                backdrop.applyCoverCrop = function () {
                    if (!backdrop.tex || !backdrop.tex.image) return;
                    _bgCoverCrop(
                        backdrop.tex,
                        backdrop.tex.image.width || 0,
                        backdrop.tex.image.height || 0,
                        backdrop.cam.aspect,
                    );
                };
                _venueLoadPlateForPov(
                    loader,
                    _venueInstrumentPov,
                    backdrop,
                    () => _venueMarkLoaded(),
                    () => _venueMarkFailed('failed to load small-club bg plate'),
                );

                // Crowd video planes (career mode): two crossfading layers
                // just in front of the static plate (which stays mounted as
                // the no-pack / load-failure fallback). Textures bind lazily
                // in update() when venue-crowd.js assigns video elements.
                state.crowd = { layers: [], rev: -1 };
                for (let i = 0; i < 2; i++) {
                    const geo = new T.PlaneGeometry(1, 1);
                    const mat = new T.MeshBasicMaterial({
                        color: 0xffffff, transparent: true, opacity: 0,
                        depthWrite: false, fog: false,
                    });
                    const mesh = new T.Mesh(geo, mat);
                    mesh.visible = false;
                    // Layer 1 sits nearest so three.js's back-to-front
                    // transparent sort draws it after layer 0.
                    const layer = {
                        mesh, geo, mat, tex: null, videoEl: null,
                        cam: settings.cam,
                        distance: BG_BACKDROP_DISTANCE * (i === 0 ? 1.04 : 1.03),
                        lastAspect: 0, lastVisibleHeight: 0,
                    };
                    layer.applyCoverCrop = function () {
                        if (!layer.videoEl || !layer.tex) return;
                        _bgCoverCrop(
                            layer.tex,
                            layer.videoEl.videoWidth || 0,
                            layer.videoEl.videoHeight || 0,
                            layer.cam.aspect,
                        );
                    };
                    scene.add(mesh);
                    state.crowd.layers.push(layer);
                }

                const hazeGeo = new T.PlaneGeometry(280 * K, 40 * K);
                const hazeMat = new T.MeshBasicMaterial({
                    color: 0x101820, transparent: true, opacity: coeffs.haze,
                    depthWrite: false, fog: false,
                });
                const hazeMesh = new T.Mesh(hazeGeo, hazeMat);
                hazeMesh.position.set(0, -12 * K, -FOG_END * 0.70);
                scene.add(hazeMesh);
                state.haze = {
                    mesh: hazeMesh, geo: hazeGeo, mat: hazeMat, baseOp: coeffs.haze,
                    baseX: 0, baseY: -12 * K, baseZ: -FOG_END * 0.70,
                };

                return state;
            },
            update(s, bands, dt, t) {
                if (!s || s.failed) return;
                _venueSwapPlateIfNeeded(s);
                const coeffs = _bgVenueMoodCoeffs(_venueMoodState);
                if (s.backdrop && s.backdrop.loaded) {
                    _bgFitBackdropPlane(s.backdrop);
                }
                const motion = _venueApplyFakeDepthMotion(s, coeffs, t);
                if (s.backdrop && s.backdrop.loaded && s.backdrop.mat && !motion.breathe && !motion.warmthPulse) {
                    const warm = coeffs.warmth;
                    s.backdrop.mat.color.setRGB(warm, warm * 0.98, warm * 0.95);
                }
                if (s.haze && s.haze.mat && !motion.hazeDrift && !motion.shimmer) {
                    s.haze.mat.opacity = (s.haze.baseOp || VENUE_HAZE_STEADY)
                        * (coeffs.haze / VENUE_HAZE_STEADY);
                }
                if (s.crowd) {
                    // Rebind VideoTextures when venue-crowd.js (re)assigns
                    // elements. VideoTexture samples the element every frame,
                    // so a src change on the same element needs no rebind.
                    if (s.crowd.rev !== _venueCrowdRev) {
                        s.crowd.rev = _venueCrowdRev;
                        s.crowd.layers.forEach((layer, i) => {
                            const el = _venueCrowdVideos[i];
                            if (layer.videoEl === el) return;
                            if (layer.tex) { layer.mat.map = null; layer.tex.dispose(); layer.tex = null; }
                            layer.videoEl = el;
                            layer.lastAspect = 0; // force refit + recrop
                            if (el) {
                                const tex = new T.VideoTexture(el);
                                tex.colorSpace = T.SRGBColorSpace;
                                tex.wrapS = T.ClampToEdgeWrapping;
                                tex.wrapT = T.ClampToEdgeWrapping;
                                tex.minFilter = T.LinearFilter;
                                tex.magFilter = T.LinearFilter;
                                tex.generateMipmaps = false;
                                layer.tex = tex;
                                layer.mat.map = tex;
                            }
                            layer.mat.needsUpdate = true;
                        });
                    }
                    const warm = coeffs.warmth;
                    s.crowd.layers.forEach((layer, i) => {
                        const el = layer.videoEl;
                        // videoWidth === 0 until metadata lands — showing the
                        // plane before that paints a black flash over the plate.
                        const ready = !!el && el.videoWidth > 0;
                        // venue-crowd.js swaps src on the same element (loop ↔
                        // stinger); a new intrinsic size needs a fresh
                        // cover-crop, which _bgFitBackdropPlane only reapplies
                        // on camera aspect changes.
                        if (ready && (layer.lastVidW !== el.videoWidth ||
                                      layer.lastVidH !== el.videoHeight)) {
                            layer.lastVidW = el.videoWidth;
                            layer.lastVidH = el.videoHeight;
                            layer.applyCoverCrop();
                        }
                        // Layer 0 (rear) stays fully opaque whenever any of the
                        // fade involves it: two half-transparent layers would
                        // let the static plate behind bleed through (~25% at
                        // mid-fade). The crossfade is therefore layer 1 (front)
                        // fading over an opaque layer 0 — in both directions.
                        const opacity = i === 0
                            ? (_venueCrowdMix < 0.999 ? 1 : 0)
                            : _venueCrowdMix;
                        layer.mat.opacity = opacity;
                        layer.mesh.visible = ready && opacity > 0.01;
                        if (layer.mesh.visible) {
                            layer.mat.color.setRGB(warm, warm * 0.98, warm * 0.95);
                            _bgFitBackdropPlane(layer);
                        }
                    });
                }
            },
            teardown(s) {
                if (!s) return;
                _venueSceneAssetsLoaded = false;
                for (const key of ['backdrop', 'haze']) {
                    const p = s[key];
                    if (!p) continue;
                    p.mesh?.parent?.remove(p.mesh);
                    p.geo?.dispose?.();
                    if (p.mat) {
                        p.mat.map = null;
                        p.mat.dispose?.();
                    }
                }
                // Crowd planes: this style owns the VideoTextures; the
                // <video> elements belong to venue-crowd.js and survive.
                if (s.crowd) {
                    for (const layer of s.crowd.layers) {
                        layer.mesh?.parent?.remove(layer.mesh);
                        layer.geo?.dispose?.();
                        if (layer.mat) {
                            layer.mat.map = null;
                            layer.mat.dispose?.();
                        }
                        layer.tex?.dispose?.();
                    }
                }
                // Dispose the cached plate textures too — the module-level cache
                // otherwise keeps every loaded POV plate GPU-resident for the
                // page lifetime (steady VRAM growth across POV/arrangement swaps).
                try {
                    _venueTextureCache.forEach((tex) => { tex?.dispose?.(); });
                } catch (_) { /* visual-only */ }
                _venueTextureCache.clear();
            },
        },
        // Custom image backdrop (#19). User uploads a JPG/PNG/WebP
        // through settings.html; the bytes are persisted as a base64
        // data URL in localStorage under h3d_bg_customImageDataUrl and
        // passed in via settings.customImageDataUrl. Renders as a
        // PlaneGeometry in the silhouette parallax band, "cover" cropped
        // (via texture.repeat / offset) so non-matching aspects fill
        // the plane without distortion. Slow horizontal drift on
        // texture.offset.x for life. When no asset is uploaded, build
        // returns null and the style is inert (settings.html disables
        // the picker option in that case).
        image: {
            build(scene, settings) {
                // Upfront validation: only accept the same raster image
                // formats settings.html lets the user upload (jpeg /
                // png / webp). Without this, a corrupt localStorage
                // value (truncated base64, wrong scheme, plain string)
                // OR an unsupported type (e.g. data:image/svg+xml)
                // reaches TextureLoader and can fail asynchronously
                // after the plane has been mounted — a silent black
                // backdrop with no clear cause. Returning null here
                // treats invalid bytes the same as "no asset uploaded":
                // style is inert, the user can clear and re-upload
                // from settings.html.
                const dataUrl = (typeof settings.customImageDataUrl === 'string')
                    ? settings.customImageDataUrl.trim() : '';
                if (!/^data:image\/(jpeg|png|webp);/i.test(dataUrl)) return null;
                // Renderer-side encoded-length cap. settings.html
                // enforces the same limit on upload, but a manually
                // edited localStorage value (or legacy data from
                // before the upload guard existed) could still feed
                // an arbitrarily large data URL into TextureLoader
                // and burn memory / CPU during decode. Treat overlong
                // values as "no asset" — style is inert, user can
                // clear and re-upload from settings.
                if (dataUrl.length > 2.5 * 1024 * 1024) return null;
                // Renderer-side decompression-bomb caps. Mirror
                // settings.html's upload-time guard so a manual
                // localStorage edit (or legacy data from before that
                // guard existed) can't sneak a 50000×50000 PNG past
                // and OOM the GPU on texture upload.
                const MAX_IMAGE_DIM = 4096;
                const MAX_IMAGE_PIXELS = 16 * 1024 * 1024;
                // Full-bleed backdrop: unit plane, scaled per frame in
                // _bgFitBackdropPlane to fill the camera's view at
                // BG_BACKDROP_DISTANCE. fog: false so the backdrop
                // shows in full color; notes drawn on top still pick
                // up atmospheric fog as before.
                const state = {
                    mesh: null, geo: null, mat: null, tex: null,
                    drift: 0.5, intensity: settings.intensity, loaded: false,
                    cam: settings.cam, distance: BG_BACKDROP_DISTANCE,
                    lastAspect: 0, lastVisibleHeight: 0,
                };
                // Helper closure for cover-crop refresh — called both
                // on async decode (initial) and from _bgFitBackdropPlane
                // when the camera aspect changes (resize).
                state.applyCoverCrop = function () {
                    if (!state.tex || !state.tex.image) return;
                    _bgCoverCrop(
                        state.tex,
                        state.tex.image.width  || 0,
                        state.tex.image.height || 0,
                        state.cam.aspect,
                    );
                };
                const tex = new T.TextureLoader().load(
                    dataUrl,
                    (loaded) => {
                        // Image dimensions are only known after async decode.
                        const imgW = loaded.image?.width  || 0;
                        const imgH = loaded.image?.height || 0;
                        if (imgW > MAX_IMAGE_DIM || imgH > MAX_IMAGE_DIM || (imgW * imgH) > MAX_IMAGE_PIXELS) {
                            // Bail before the texture gets uploaded to
                            // the GPU (Three.js uploads on first render
                            // of a visible mesh — hiding the mesh here
                            // skips that). Disposing the texture too,
                            // belt-and-suspenders, in case anything
                            // else holds a reference.
                            console.warn('[3D-Hwy] custom image dimensions too large to render', imgW + 'x' + imgH);
                            if (state.mesh) state.mesh.visible = false;
                            loaded.dispose();
                            return;
                        }
                        state.applyCoverCrop();
                        // Reset drift to the centered triangle-wave
                        // phase now that repeat.x is final. Without
                        // this reset, drift accumulated during the
                        // async decode would phase-shift the initial
                        // offset by a non-deterministic amount —
                        // wider images would open at whatever crop
                        // the elapsed-decode-time happened to land on.
                        state.drift = 0.5;
                        state.loaded = true;
                    },
                    undefined,
                    // Async-failure path: the upfront regex catches the
                    // common "corrupted/truncated bytes" case, but a
                    // valid-looking data URL can still fail to decode
                    // (e.g. wrong MIME / unsupported codec). Hide the
                    // mesh so we don't paint a frozen blank plane on
                    // top of fog, and log so the failure isn't silent.
                    (err) => {
                        console.error('[3D-Hwy] custom image decode failed', err);
                        if (state.mesh) state.mesh.visible = false;
                    },
                );
                tex.colorSpace = T.SRGBColorSpace;
                // ClampToEdge on both axes — user uploads are non-
                // power-of-two in general, and WebGL1 rejects RepeatWrapping
                // on NPOT textures (renders black or emits GL errors). The
                // drift logic below uses a triangle-wave so the offset
                // stays inside [0, 1-repeat] and never needs wrap.
                tex.wrapS = T.ClampToEdgeWrapping;
                tex.wrapT = T.ClampToEdgeWrapping;
                // User uploads aren't power-of-two in general; mipmaps
                // are noisy for a single static backdrop and burn memory.
                tex.generateMipmaps = false;
                tex.minFilter = T.LinearFilter;
                tex.magFilter = T.LinearFilter;
                const geo = new T.PlaneGeometry(1, 1);
                const mat = new T.MeshBasicMaterial({
                    map: tex, transparent: false, depthWrite: false, fog: false,
                });
                const mesh = new T.Mesh(geo, mat);
                scene.add(mesh);
                state.mesh = mesh;
                state.geo  = geo;
                state.mat  = mat;
                state.tex  = tex;
                // Initial fit so the first frame is correctly sized
                // and positioned, even if update() hasn't run yet.
                _bgFitBackdropPlane(state);
                return state;
            },
            update(s, bands, dt) {
                if (!s) return;
                // Track camera position / aspect every frame. The
                // helper resizes the plane and refreshes cover-crop
                // when aspect changes, and re-positions the plane to
                // stay BG_BACKDROP_DISTANCE in front of the camera.
                _bgFitBackdropPlane(s);
                // Skip drift advance until the texture has finished
                // decoding. Without this guard, drift accumulates
                // during the async load while repeat.x is still 1
                // (its default), and once the cover-crop applies the
                // image opens at a phase-shifted offset whose value
                // depends on how long the decode took — the
                // "centered start" intent becomes non-deterministic.
                if (!s.loaded) return;
                // Triangle-wave ping-pong drift inside the cropped slack.
                // ClampToEdge on wrapS means we cannot wrap across the
                // texture boundary (would render edge pixels stretched);
                // ping-pong oscillates the visible window between the
                // image's left and right edges, which gives the same
                // "alive" feel without the WebGL1 NPOT-Repeat hazard.
                // Slack is the horizontal margin between the cropped
                // window and the texture edges; for taller-than-plane
                // images repeat.x stays 1, slack collapses to 0, and
                // the offset stays at 0 — the image sits still, which
                // is correct (it's already filling horizontally).
                s.drift += dt * 0.02 * s.intensity;
                const slack = Math.max(0, 1 - s.tex.repeat.x);
                // Period of 2 drift units ≈ 100 s at intensity = 0.5;
                // gentle, cinematic. cyc ∈ [0, 2), tri ∈ [0, 1] then back.
                const cyc = ((s.drift % 2) + 2) % 2;
                const tri = cyc < 1 ? cyc : 2 - cyc;
                s.tex.offset.x = tri * slack;
            },
            teardown(s) {
                if (!s) return;
                s.mesh.parent && s.mesh.parent.remove(s.mesh);
                s.geo.dispose();
                s.mat.dispose();
                // This style owns the texture lifecycle (per the comment
                // at _bgDisposeGroupTree: tree dispose does NOT touch
                // material.map textures).
                s.tex.dispose();
            },
        },
        // Custom video backdrop (#19 follow-up). User uploads a
        // .mp4/.webm via settings.html; routes.py stores it on disk and
        // serves a same-origin URL (avoids CORS taint on VideoTexture).
        // localStorage holds only the filename — bytes live in
        // {config_dir}/plugin_uploads/highway_3d/. Per-panel video
        // element so each panel can mount/teardown independently;
        // browsers cache the video bytes after first fetch so multi-
        // panel splitscreen pays only the decoder cost, not the
        // network or disk-read cost.
        video: {
            build(scene, settings) {
                // Lowercase before validation so a manual localStorage
                // edit like `current.MP4` doesn't pass a case-insensitive
                // regex check and then 404 against the server, which
                // only ever produces and serves lowercase
                // current.<ext> (the upload route lowercases the
                // extension; routes.py's GET pattern is case-sensitive).
                const filename = (typeof settings.customVideoName === 'string')
                    ? settings.customVideoName.trim().toLowerCase() : '';
                // Strict pattern matches routes.py's deterministic
                // single-slot naming. Any other shape (corrupt
                // localStorage, future schema change) → style is
                // inert, no <video> created, no orphan request to a
                // 404 endpoint.
                if (!/^current\.(mp4|webm)$/.test(filename)) return null;
                const url = '/api/plugins/highway_3d/files/' + filename;

                // Track partial allocations so a throw between any of
                // them can clean up. _bgMountStyle's failure path
                // disposes the stage tree but explicitly does NOT
                // dispose textures (per the comment at
                // _bgDisposeGroupTree), and the <video> element is
                // parented to document.body — not the stage — so
                // neither would be reached without an explicit catch.
                let videoEl = null, tex = null, geo = null, mat = null, mesh = null;
                try {
                    // muted + playsInline + autoplay is the cross-
                    // browser recipe that bypasses gesture requirements
                    // (Chrome, Firefox, Safari desktop + mobile).
                    // preload='auto' lets the first frame land before
                    // play() is called. src is deliberately NOT set
                    // yet — we want every piece of state (mesh, tex)
                    // to exist before the browser can fire
                    // loadedmetadata or error events on a cached
                    // resource. The handlers close over state.tex /
                    // state.mesh; setting src first would create a
                    // window where a fast cache hit could fire an
                    // event into half-initialized state.
                    videoEl = document.createElement('video');
                    // No crossOrigin attribute: the URL is same-origin
                    // (/api/plugins/highway_3d/files/…), so VideoTexture
                    // never sees a tainted canvas. Setting
                    // `crossOrigin = "anonymous"` would also strip
                    // cookies from the fetch, which would 401 against
                    // any cookie-protected feedBack deployment. If
                    // this ever needs to fetch cross-origin, switch
                    // to `use-credentials` AND have the server send
                    // the matching CORS headers.
                    videoEl.muted = true;
                    videoEl.playsInline = true;
                    videoEl.loop = true;
                    videoEl.autoplay = true;
                    videoEl.preload = 'auto';
                    videoEl.style.display = 'none';
                    document.body.appendChild(videoEl);

                    // Build mesh + texture before registering listeners
                    // and before setting src. By the time loadedmetadata
                    // or error can fire, state.tex and state.mesh are
                    // both populated.
                    tex = new T.VideoTexture(videoEl);
                    tex.colorSpace = T.SRGBColorSpace;
                    tex.wrapS = T.ClampToEdgeWrapping;
                    tex.wrapT = T.ClampToEdgeWrapping;
                    tex.minFilter = T.LinearFilter;
                    tex.magFilter = T.LinearFilter;
                    tex.generateMipmaps = false;
                    geo = new T.PlaneGeometry(1, 1);
                    mat = new T.MeshBasicMaterial({
                        map: tex, transparent: false, depthWrite: false, fog: false,
                    });
                    mesh = new T.Mesh(geo, mat);
                    scene.add(mesh);

                    // Full-bleed backdrop: scaled and positioned each
                    // frame in update() via _bgFitBackdropPlane.
                    // cam + distance + lastAspect / lastVisibleHeight
                    // power that helper.
                    const state = {
                        videoEl, mesh, geo, mat, tex,
                        cam: settings.cam, distance: BG_BACKDROP_DISTANCE,
                        lastAspect: 0, lastVisibleHeight: 0,
                    };
                    state.applyCoverCrop = function () {
                        if (!state.videoEl) return;
                        _bgCoverCrop(
                            state.tex,
                            state.videoEl.videoWidth  || 0,
                            state.videoEl.videoHeight || 0,
                            state.cam.aspect,
                        );
                    };

                    // Cover-crop math runs on loadedmetadata since
                    // video dimensions aren't known until then.
                    // _bgFitBackdropPlane will also re-apply when the
                    // camera aspect changes.
                    videoEl.addEventListener('loadedmetadata', () => {
                        state.applyCoverCrop();
                    });
                    videoEl.addEventListener('error', () => {
                        // Fired for: codec unsupported, 404 from
                        // server, truncated file, etc. Hide the mesh
                        // so we don't paint a frozen blank plane on
                        // top of fog.
                        console.error('[3D-Hwy] custom video load failed', videoEl.error);
                        state.mesh.visible = false;
                    });

                    // Set src last — this is what triggers the async
                    // load. With handlers and state in place, any
                    // synchronous-feeling event from a cached resource
                    // is still safely received and handled.
                    videoEl.src = url;

                    // play() can reject for transient reasons (tab
                    // backgrounded at mount time, low-power mode,
                    // brief autoplay-policy timing window) even with
                    // muted + autoplay set — but the browser retries
                    // on its own once conditions improve (visibility
                    // change, foregrounding, gesture). Real load /
                    // codec failures come through the `error` event
                    // we registered above and DO hide the mesh. So
                    // just log here and leave the mesh visible; the
                    // next ready frame will paint.
                    videoEl.play().catch((err) => {
                        console.warn('[3D-Hwy] custom video play() rejected (will retry on visibility/gesture)', err);
                    });
                    // Initial fit so the first frame is correctly
                    // sized and positioned even before update() runs.
                    _bgFitBackdropPlane(state);
                    return state;
                } catch (err) {
                    // Best-effort cleanup of whatever was allocated
                    // before the throw. Each step is independently
                    // guarded so a secondary failure (e.g. dispose
                    // throwing on an already-disposed object) can't
                    // mask the original error.
                    try {
                        if (videoEl) {
                            videoEl.pause();
                            videoEl.removeAttribute('src');
                            videoEl.load();
                            if (videoEl.parentNode) videoEl.parentNode.removeChild(videoEl);
                        }
                    } catch (_) { /* ignore */ }
                    try { if (mesh && mesh.parent) mesh.parent.remove(mesh); } catch (_) { /* ignore */ }
                    try { if (geo) geo.dispose(); } catch (_) { /* ignore */ }
                    try { if (mat) mat.dispose(); } catch (_) { /* ignore */ }
                    try { if (tex) tex.dispose(); } catch (_) { /* ignore */ }
                    throw err;
                }
            },
            update(s) {
                if (!s) return;
                // VideoTexture auto-updates from the playing element —
                // Three.js samples the current frame each render. No
                // per-frame texture mutation here. Drift on offset.x
                // is intentionally omitted: the video's own motion is
                // the "life", drifting the crop on top would feel
                // busy and compete with playback. The only per-frame
                // work is keeping the plane camera-locked and resized
                // when aspect changes (handled inside the helper).
                _bgFitBackdropPlane(s);
            },
            teardown(s) {
                if (!s) return;
                if (s.videoEl) {
                    try { s.videoEl.pause(); } catch (_) {}
                    s.videoEl.removeAttribute('src');
                    // load() with no src tells the browser to release
                    // any decoder/buffer state for this element.
                    try { s.videoEl.load(); } catch (_) {}
                    if (s.videoEl.parentNode) s.videoEl.parentNode.removeChild(s.videoEl);
                }
                if (s.mesh) s.mesh.parent && s.mesh.parent.remove(s.mesh);
                if (s.geo) s.geo.dispose();
                if (s.mat) s.mat.dispose();
                if (s.tex) s.tex.dispose();
            },
        },
    };

    /* ======================================================================
     *  Per-instance counter
     * ====================================================================== */

    let _nextInstanceId = 0;

    /* ======================================================================
     *  Player-chrome background control — moved to src/bg-control.js (h3d-carve-5)
     *  _pcAcquire and _pcRelease are destructured from createBgControl() below.
     *  DI: BG_STYLE_IDS (1435), _bgReadGlobal (1825), _bgSubscribe/_bgUnsubscribe (1917-18),
     *      getVenueSceneOverride ← _venueSceneOverride (1523). All defined before this call.
     *  First _pcAcquire caller: init() in createFactory() below (~line 15198 pre-cut).
     * ====================================================================== */
    const { _pcAcquire, _pcRelease } = createBgControl({
        BG_STYLE_IDS,
        _bgReadGlobal,
        _bgSubscribe,
        _bgUnsubscribe,
        getVenueSceneOverride: () => _venueSceneOverride,
    });

    /* ======================================================================
     *  Factory — feedBack#36 setRenderer contract
     * ====================================================================== */

    function createFactory() {
        const _instanceId = ++_nextInstanceId;
        // Whether THIS instance holds a refcount on the shared player-chrome
        // control. Guards the init -> init (no destroy) path so one instance
        // can never take two references and pin the control.
        let _pcAcquired = false;

        // ── Per-instance Three.js state ───────────────────────────────────
        let scene = null, cam = null, ren = null;
        let wrap = null;
        // WebGL context-loss recovery. Switching the active window / alt-tabbing
        // (especially on Windows) can trigger a GPU context reset; with no
        // handler the lost context escalates into a render-process crash. The
        // listeners (bound in initScene on ren.domElement, removed in teardown)
        // preventDefault the loss so the browser keeps the context restorable,
        // _ctxLost gates draw() off the dead context, and on restore we reset the
        // viewport + resume (Three re-uploads scene resources on the next render).
        let _ctxLost = false;
        let _onCtxLost = null, _onCtxRestored = null;
        let bcCtrl = null; // Butterchurn audio-reactive background (the 'butterchurn' bg-style)
        let _chartEnv = 0, _chartPrevT = -1, _bcBeatIdx = 0, _bcNoteIdx = 0, _bcChordIdx = 0, _bcTintTarget = null;
        let _tintR = 20, _tintG = 24, _tintB = 40; // smoothed instrument-color tint for the bg
        // highway:visibility listener (feedBack#246). Hides the .h3d-wrap
        // overlay when feedBack's canvas is display:none'd (splitscreen
        // case). Without this, the wrap is a *sibling* of #highway so
        // hiding #highway leaves the WebGL scene painting full-screen.
        // Bound in initScene after wrap creation, unbound in destroy().
        let _visibilityHandler = null;
        // highway:canvas-replaced listener — keeps highwayCanvas up to
        // date across context-type swaps (e.g. swapping back to a 2D
        // viz). The visibility handler's identity gate (event.detail.
        // canvas === highwayCanvas) would otherwise stop matching
        // after the swap; this listener follows the documented plugin
        // contract from CLAUDE.md.
        let _canvasReplacedHandler = null;
        let ambLight = null, dirLight = null;
        let fretG = null, tuningLblG = null, noteG = null, beatG = null, lblG = null;
        let gNote = null, gSus = null, gBeat = null, gTapChevron = null;
        // Per-string gradient gem geometries (index 0..5). Built in initScene
        // from sampled colour PNGs; each carries a per-vertex colour attribute.
        let gNoteGrad = [];
        let mStr = [], mGlow = [], mSus = [], mStrHitOutline = [], mAccentOutline = [], mAccentCore = [], mAccentHaloNear = [], mAccentHaloMid = [], mAccentHaloFar = [];
        // Pre-built accent-halo shell descriptors per string. Populated after
        // mAccentHaloFar/Mid/Near are materialised; consumed in drawNote()'s
        // hot path so the inner per-note `accentShells = [...]` array literal
        // (3 plain-object allocations per accent gem per frame) is replaced
        // by a stable read. Index 0 = outer, 1 = mid, 2 = near.
        let _accentShellsByString = [];
        let mWhiteOutline = null, mSusOutline = null;
        // Dedicated sustain-trail outline material for the hit verdict.
        // Drawn at opacity 0.45 — lower than mSusOutline (0.75) so the
        // bright green emissive doesn't tint the body interior, and the
        // verdict shows mostly on the outline fringe past the body edges.
        // Only the hit-side rim ships; the verdict on miss is carried by
        // mMissOutline (the gem-border material) instead of a dedicated
        // sustain outline — matches the "outline-only verdict, body retains
        // string colour" doctrine for the rest of the rendering path.
        let mHitSusOutline = null;
        // Shared materials for the legato technique meshes — one per geometry
        // type, reused across every pooled mesh instance to avoid per-mesh
        // material allocation in dense HO/PO/tap passages. Allocated in
        // initScene() alongside the other scene materials and disposed in
        // teardown.
        let mTapChevron = null;
        // Barre indicator material (white vertical line at the barre fret
        // during chord linger). Promoted from inline pool-factory authoring
        // to a named module-scope reference so _applyGlow() can mutate
        // emissiveIntensity in place when the user drags the glow slider.
        let mBarre = null;
        // Notedetect feedback outlines (issue #9). Created in initScene
        // alongside mWhiteOutline; swapped onto the note's outline mesh
        // when a recent notedetect:hit / :miss event matches the note's
        // (s, f, t). The miss gem border uses mMissOutline; the hit side
        // uses per-string mHitBright[s] for the cyan-shifted flash.
        let mMissOutline = null;
        // Per-string hit verdict material used for outline + lateral face fill.
        // Built in initScene() after mGlow. Array share the same material
        // instances so outline and face fill always match exactly.
        let mHitBright = [], mHitBrightArrays = [];
        // Gem-rim hit flash ("just the rims"): per-string materials that flash
        // in the STRING'S OWN colour with the same intensity treatment as the
        // fret wires (FRET_WIRE_HIT_INTENSITY ramp, provider-alpha fade). Shared
        // per string, so the applied intensity is the per-frame MAX alpha across
        // that string's flashing gems — same compromise mGlow already makes.
        let mRimFlash = [];
        const _rimFlashIn = new Float32Array(S_COL.length);
        // [verdict glow] Per-frame accumulation of the note-state provider's
        // alpha (note_detect drives this from the live input level for held
        // sustains, and as a time-fade for fresh strikes). Applied at the top of
        // update() to scale the verdict-glow materials' emissiveIntensity so the
        // gem brightness tracks how hard the string is actually ringing. Stays
        // at "no provider" (vg = 1, unchanged brightness) for the legacy event
        // path or when note_detect is off.
        let _ndVerdictMaxAlpha = 0;
        let _ndVerdictSawAlpha = false;
        // Magenta-red face fill for miss — see initScene() for construction
        // (uses mMissOutline ×4 + mEdgeTransparent ×2).
        let mMissEdgeArrays = null;
        let mEdgeTransparent = null;
        let pSusOutline = null, pNoteEdge = null;
        let projMeshArr = null;
        let _probe = null;
        /** Snapshotted in update() for drawNote() ghost / glow (single source vs per-caller isNext). */
        let _drawNextByString = null;
        /** Most-recent past event time per string (within 0.6 s back), for _nextAnyT deadline. */
        let _drawRecentByString = null;
        /** Snapshotted in update() — drawNote() is a sibling of update(), not nested in its closure. */
        let _drawChordTemplates = null;
        /** Ditto — drawNote() needs the anchors to resolve the lane's outer
         * wires for an open note's hit flash (an open note has no fret of its
         * own; its slab spans the lane, so the lane edges are what bracket it). */
        let _drawAnchors = null;
        /** Teaching marks sd/ch overlay pref (§6.2.2), mirrored from the 2D
         * highway's `teachingMarksVisible` bundle flag. */
        let _drawTeachingMarks = false;
        /** Fret-hand finger (fg) hint pref, mirrored from the 2D highway's
         * `fingerHintsVisible` bundle flag — default on (shown unless an explicit
         * false), hideable independently of the sd/ch overlays. */
        let _showFingerHints = true;
        let _laneTargetColor = null;
        let _renderScale = 1;
        let lyricsCanvas = null, lyricsCtx = null;
        // FPS counter overlay. EMA-smoothed over ~30 frames so the readout doesn't
        // jitter every rAF tick. Controlled by the 'fpsVisible' setting (BG_DEFAULTS).
        // Legacy 'h3d_showFps' localStorage key and window.h3dShowFps are no longer
        // consulted — use the Settings → 3D Highway — Camera → Show FPS counter checkbox.
        let _fpsLastT = 0;
        let _fpsEma = 0;
        let _fpsDisplay = 0;
        let _fpsLastSampleT = 0;
        // The FPS readout is pinned top-right of the highway overlay — the same
        // corner the v3 player chrome stacks its persistent "Up Next" pill and
        // live-performance HUD into, on a higher layer that paints over the
        // canvas. So out of the box the readout sits *behind* that chrome and
        // can't be read (exactly when you've turned it on to judge perf). Rather
        // than relocate it (testers look top-right), we drop it just BELOW
        // whichever of that chrome is showing. Refs are resolved once and cached
        // — never a per-frame querySelector (see CLAUDE.md "never run DOM queries
        // on a per-frame path") — and re-resolved only when a node detaches.
        let _v3HudEls = null;
        // Returns the bottom edge (in overlay-canvas px, which are 1:1 CSS px on
        // this overlay) of the lowest visible top-right v3 chrome element, or 0
        // when none apply (classic v2 UI, or all hidden). Only called while the
        // FPS readout is actually drawn, so the layout reads cost nothing in the
        // common (counter-off) case.
        function _v3TopRightChromeBottom() {
            if (typeof document === 'undefined' || !highwayCanvas) return 0;
            // Only the v3 chrome stacks persistent HUD elements over the canvas's
            // top-right. Gate on the documented detector so this is a strict no-op
            // in classic v2 (where 'hud-time' also exists but sits elsewhere).
            if (!(window.feedBack && window.feedBack.uiVersion === 'v3')) return 0;
            if (!_v3HudEls || _v3HudEls.some((el) => el && !el.isConnected)) {
                _v3HudEls = ['v3-upnext', 'v3-live-performance-hud', 'hud-time']
                    .map((id) => document.getElementById(id));
            }
            const top = highwayCanvas.getBoundingClientRect().top;
            let maxBottom = 0;
            for (const el of _v3HudEls) {
                // offsetParent === null ⇒ display:none (a `.hidden` pill/HUD) or
                // not laid out — don't duck under something that isn't shown.
                if (!el || el.offsetParent === null) continue;
                const b = el.getBoundingClientRect().bottom - top;
                if (b > maxBottom) maxBottom = b;
            }
            return maxBottom;
        }
        let _diagChord            = null;
        // Chord diagram render cache. Keys: static layout inputs joined as a
        // string. Values: OffscreenCanvas (or <canvas>) rendered at opacity=1
        // entranceT=1 — composited each frame via drawImage + globalAlpha.
        // Cleared on canvas resize (bx/by depend on canvasW/H/lyricsBottom)
        // and on teardown/destroy.
        const _diagRenderCache = new Map();
        let pSusRail = null, gSusRail = null, mSusRailBase = null;
        let pSusRailBloom = null, gSusRailBloom = null, mSusRailBloomBase = null, _bloomGaussTex = null;
        let pTechPlane = null, gTechPlane = null;

        // ── InstancedMesh for PM/FH X markers ────────────────────────────────
        // Replaces pTechPlane pool entries for PM and FH mute techniques,
        // collapsing O(visible-muted-notes) draw calls to 2 per type.
        // pTechPlane pool is still used for H/P triangles, harmonics and bends.
        let imPMTech = null, imFHTech = null;
        let _imGPMTech = null, _imGFHTech = null; // cloned geometries (own instanceAlpha attr)
        let _imPMTechMat = null, _imFHTechMat = null;
        const IM_TECH_CAP = 256;
        const _imPMTechAlphaArr = new Float32Array(IM_TECH_CAP);
        const _imFHTechAlphaArr = new Float32Array(IM_TECH_CAP);
        let _imPMTechCount = 0, _imFHTechCount = 0;

        // ── InstancedMesh for chord strum indicators ──────────────────────────
        // Replaces pPMXFill, pMuteXLines, pFHXFill, pFHXLines pools.
        // Fixed renderOrder per type — no per-instance sort needed.
        let imPMXFill = null, imPMXLines = null, imFHXFill = null, imFHXLines = null;
        let _imPMXFillMat = null, _imPMXLinesMat = null;
        let _imFHXFillMat = null, _imFHXLinesMat = null;
        const IM_STRUM_CAP = 64;
        const _imPMXFillAlphaArr  = new Float32Array(IM_STRUM_CAP);
        const _imPMXLinesAlphaArr = new Float32Array(IM_STRUM_CAP);
        const _imFHXFillAlphaArr  = new Float32Array(IM_STRUM_CAP);
        const _imFHXLinesAlphaArr = new Float32Array(IM_STRUM_CAP);
        let _imPMXFillCount = 0, _imPMXLinesCount = 0, _imFHXFillCount = 0, _imFHXLinesCount = 0;

        // Temporaries for InstancedMesh matrix composition — allocated once in
        // initScene() after Three.js loads, reused every frame without allocation.
        let _imM4 = null, _imPos = null, _imSca = null, _imQ = null, _imAZ = null, _imColor = null;

        let _diagPrev             = null;
        let _diagPrevOpacity      = 0;
        let _diagPrevStartOpacity = 0;
        let _diagPrevStartT       = null;  // bundle.currentTime when crossfade began (drives rewindable fade)
        let _diagEntranceT        = 1.0;
        let _diagLastKey          = null;  // chord identity: name + '|' + frets.join(',')
        // Per-wave cache for fret-column reference markers. Keyed by the
        // wave's beat timestamp. We snapshot { hasLow, hasHigh, fretList,
        // anchorKeyed } at first sight of a wave so its render gate stays consistent through the
        // wave's flight even as activeFrets shifts mid-song. Entries are
        // pruned each frame once their wave has passed `now`.
        let _fretMarkerWaveCache = new Map();
        // Per-frame booleans: handShapes[i] passes inferArpeggioFromNotePattern
        // once (see fillArpeggioGhostInferFlags) so the note loop skips O(hs×notes)
        // rescans — ref fillArpeggioGhostInferFlags in update().
        // Handshape start-times where ghost fret numbers show but [ ] brackets are suppressed
        // (synth-chord onset-match cases — not genuine arpeggios).
        /** Per-frame: ``handShapeIsArpeggioForLaneRail`` baked once — lane slices were O(96 × hs × infer). */

        // ── Cross-frame caches for chart-static derivations ──────────────
        // The merge + arp-flag fills below depend only on chart-static
        // input arrays (handShapes / chords / chordTemplates / notes),
        // not on `now`. The bundle hands us the same array refs every
        // frame within an arrangement, so we can skip the recompute when
        // the inputs are identity-equal to the previous frame's. On dense
        // arrangements this avoids per-frame Set construction, nested
        // O(hs × notes) scans, and a sort — significant FPS recovery.
        let _mergeCacheResult = null;

        // Fret connector-label visibility cache: tracks which (time, fret)
        // pairs may show their indicator number per the measure-skip rule
        // (show only the first note with a given fret in a measure; suppress
        // the same fret for the following measure, then allow it again).
        let _fretLabelAllowed = new Set();
        let _fretLabelNotesRef = null;
        // Cache of measure-start times (beats with measure !== -1), rebuilt when
        // the beats array changes. Drives the camera lookahead window
        // (CAM_LOOKAHEAD_MEASURES measures instead of a fixed number of seconds).
        let _measureStarts = [];
        let _measureStartsRef = null;
        // Frame-level dedup: tracks which (40ms-rounded-time, fret) pairs have already
        // rendered a label this frame so that multiple strings at the same fret/onset
        // (arpeggio chords, synthetic chords) never produce stacked duplicate labels.
        const _frameLabeledKeys = new Set();


        // Slide-target gem suppression. A Set of "t_s" keys for notes in
        // bundle.notes that are the linkNext destination of a preceding note
        // (single or chord). The gem is suppressed (skipBody=true) but the
        // sustain/slide trail still renders so the slide motion stays visible.
        let _slideTargetSet = null;
        let _slideTargetNotesRef = null;
        let _slideTargetChordsRef = null;


        let _lastHwW = 0, _lastHwH = 0;
        // Frame counter for throttling the CSS-box drift check in draw()
        // (getBoundingClientRect is a forced layout read; see the comment
        // at the check).
        let _boxCheckCountdown = 0;
        // Last logical (CSS px) size handed to applySize(). #highway is a
        // flex:1 item, so its real rendered box (canvasSize()) can change as
        // the player layout settles after a song opens WITHOUT the backing
        // store (canvas.width) changing — which the _lastHwW/H check below
        // would miss. Tracking the applied logical size lets draw() detect
        // that CSS-box drift and re-frame, instead of the user having to
        // un/re-maximize the window.
        let _appliedW = 0, _appliedH = 0;
        // Last pane aspect (w/h) handed to the camera, cached so camUpdate can
        // recompute the horizontal-FOV-hold each frame (and react to live
        // __h3dAspectTune edits) without waiting for a resize. 0 until first
        // applySize().
        let _paneAspect = 0;
        // Per-instance fallback id for the wide-pane tuner's pane key, used only
        // when this pane has no arrangement name to key by. Assigned once in
        // init(); overrides keyed off arrangement persist across songs, this
        // fallback is session-only.
        let _paneUid = 0;
        // True once applySize() has pinned the .h3d-wrap overlay to the
        // highway canvas's offset box. Stays false while the canvas has no
        // layout yet (init() can run before #highway has a real box, where
        // applySize falls back to the parent-panel size and only sets the
        // wrap height). The rAF loop re-pins once the canvas lays out even
        // when the logical render size is unchanged — otherwise the overlay
        // would stay at top:0;left:0;right:0 and expose a strip of #highway.
        let _wrapPinned = false;
        let mBeatM = null, mBeatQ = null;
        let txtCache = {};
        // Cloned sprite materials cached on individual sprite instances
        // (e.g. pmMark._pmMat). pLbl pool reuses sprites across labels,
        // so when a sprite is later assigned a different material the
        // _pmMat stays referenced on the sprite itself but isn't reached
        // by the scene.traverse-based dispose. Track them here so
        // teardown can dispose them explicitly.
        const _ownedClonedMats = [];
        // Per-mesh technique-marker clones — keyed by mesh, disposed when
        // the source sprite's map changes or on teardown. Replaces the old
        // unbounded push-per-frame approach in _spriteMat2MeshMat.
        const _techMeshMatClones = new Set();
        // Shared (non-clone) materials and geometries that pool factories
        // reference but that aren't guaranteed to be reachable via
        // scene.traverse() — e.g. mLaneEven is only reached if at least one
        // even-numbered fret stripe ever spawns. Track them here so teardown
        // disposes the GPU resource regardless.
        const _ownedSharedMats = [];
        const _ownedSharedGeos = [];

        // Background animation state (issue #13). bgGroup is the parent
        // container for all bg meshes so teardown is one remove + dispose
        // pass. bgState is the active style's per-panel state object.
        let bgGroup = null, bgStage = null, bgState = null;
        let bgMountedStyleId = null;
        let bgStyleId = 'particles', bgIntensity = 0.5, bgReactive = true;
        // Active scene color theme (background + highway surface). Read in
        // _bgLoadSettings, applied by _applyBgTheme (clear + fog + board plane).
        let bgThemeId = 'default';   // BACKGROUND axis (clear + fog)
        let hwThemeId = 'default';   // HIGHWAY axis (board + lane + laneDim)
        // Board (fretboard/highway-surface) plane material — kept so the theme
        // can recolor it live without rebuilding the board. Set in buildBoard().
        let _boardPlaneMat = null;
        // Per-render opt-out for plugins borrowing the highway as a viz: when the
        // mount bundle sets bgReactive === false, suppress the audio-reactive
        // background for THIS instance only (no shared h3d_bg_* write). Captured
        // from the bundle in init(); applied in _bgLoadSettings() so it survives
        // later setting reloads. See init() for the rationale.
        let _bgReactiveOptOut = false;
        // Active palette for this panel (issue #10). Materials and per-
        // frame color reads inside createFactory all consult this rather
        // than the module-level S_COL, so a palette swap re-tints the
        // panel live without touching module-level state.
        let activePalette = PALETTES.default;
        // Content signature of the colors last applied to materials; lets
        // _bgLoadSettings force a retint when the in-place custom palette
        // changes values without changing array identity.
        let _bgPaletteSig = '';
        // Fret digits on the board ghost (hollow preview at Z=0), not on
        // flying note bodies — see fretNumberGhostScope for chord-hand vs all.
        let showFretOnNote = false;
        let fretNumberGhostScope = 'chords';
        // Camera-X smoothing dial (issue #34). 0 = twitchy (track every
        // upcoming fret), 1 = calm (ignore small intra-cluster shifts).
        // Cached here and refreshed via the bg listener to avoid a
        // per-frame localStorage hit inside update().
        let cameraSmoothing = 0.5;
        // Per-axis follow-ups: zoom (tgtDist hysteresis) and vertical-tilt
        // (tgtLookY NDC self-correction) each get their own dial. Same
        // 0..1 shape; same caching pattern. Both mirror cameraSmoothing's
        // value when not explicitly stored, so existing users who only
        // ever moved the camera-smoothing slider get the same calmness on
        // the new axes by default.
        let zoomSmoothing = 0.5;
        let tiltSmoothing = 0.5;
        // Camera lock: when true, pin the camera to a fixed wide view of
        // frets 1-12 unless an upcoming note would otherwise be off-screen.
        // The lock disengages while any note above fret 12 is in the
        // lookahead window so the camera can briefly widen to include it,
        // then re-engages once the high note ages out.
        let cameraLockLow = false;
        // Zoom-level for the locked view. Slider 0..1 maps to a multiplier
        // on the locked tgtDist: 0 → CAM_LOCK_ZOOM_MIN (closest, biggest
        // fretboard), 0.5 → 1.0× (the default locked view), 1 → CAM_LOCK_ZOOM_MAX
        // (furthest). Inactive when the lock isn't engaged.
        let cameraLockZoom = 0.5;
        /** 'steady' = recency-weighted centroid + hysteresis (#34); 'lookahead' = wide preview window + smooth focal. */
        let cameraMode = BG_DEFAULTS.cameraMode;
        // Global text-size multiplier for in-scene text sprites (chord
        // names, fret labels, section banners, technique markers, etc.).
        // Slider is 0..1; mapped to a 0.5..1.5× multiplier with 0.5 = 1.0×
        // (current default behaviour). _textSizeMul is the materialized
        // multiplier — refreshed once per frame at the top of update()
        // and consumed by every text-sprite scale.set call inside update
        // and drawNote.
        let textSize = 0.5;
        let _textSizeMul = 1.0;
        let _textSizeMulApplied = -1;
        // Visual look dials (issue: pastel/washed-out feel + too-much-glow
        // complaint). vibrancy raises idle string/note opacity and de-whites
        // the hit-note body; glow scales every emissive contribution +
        // projection glow layer opacity. Sliders are 0..1; defaults lean
        // vivid + minimal-glow to match the requested out-of-box look.
        // _vibrancyIdleOp / _vibrancyProjOp are cached so
        // updateStringHighlights() and drawNote() don't recompute the
        // linear blend every frame.
        let vibrancy            = BG_DEFAULTS.vibrancy;
        let glowMul             = BG_DEFAULTS.glow;
        let _hitFx              = BG_DEFAULTS.hitFx;
        let _sparks             = BG_DEFAULTS.sparks;
        let _cinematic          = BG_DEFAULTS.cinematic;
        let _verdictMarks       = BG_DEFAULTS.verdictMarks;
        let _timingFx           = BG_DEFAULTS.timingFx;
        let _streakFx           = BG_DEFAULTS.streakFx;
        let _bloom              = BG_DEFAULTS.bloom;
        let _composer = null, _bloomPass = null, _bloomLoad = null, _bloomW = 0, _bloomH = 0;
        let _sparkPts = null, _sparkPos = null, _sparkCol = null, _sparkVel = null, _sparkLife = null;
        const _SPARK_N = 256;
        const _sparkSeen = new Map();     // note-key -> expiry; one burst per hit
        let _juiceLastT = 0;              // frame-dt clock for the juice layer
        let _streakHits = 0, _streakHeat = 0;  // #7 consecutive-hit escalation
        let fpsVisible           = BG_DEFAULTS.fpsVisible;
        let fretDividersVisible  = BG_DEFAULTS.fretDividersVisible;
        let chordDiagramVisible  = BG_DEFAULTS.chordDiagramVisible;
        let chordDiagramSize     = BG_DEFAULTS.chordDiagramSize;
        let chordDiagramPosition = BG_DEFAULTS.chordDiagramPosition;
        let fretColumnMarkerCadence = BG_DEFAULTS.fretColumnMarkerCadence;
        let inlayLabelsVisible = BG_DEFAULTS.inlayLabelsVisible;
        let sectionLabelsOnHighway = BG_DEFAULTS.sectionLabelsOnHighway;
        let sectionHudVisible      = BG_DEFAULTS.sectionHudVisible;
        let sectionHudPosition     = BG_DEFAULTS.sectionHudPosition;
        let sectionHudSize         = BG_DEFAULTS.sectionHudSize;
        let toneHudVisible         = BG_DEFAULTS.toneHudVisible;
        let toneHudPosition        = BG_DEFAULTS.toneHudPosition;
        let toneHudSize            = BG_DEFAULTS.toneHudSize;
        let nutHeadstockVisible    = BG_DEFAULTS.nutHeadstockVisible;
        let tuningLabelsVisible    = BG_DEFAULTS.tuningLabelsVisible;
        let nutColor               = BG_DEFAULTS.nutColor;
        let headstockColor         = BG_DEFAULTS.headstockColor;
        let projectionVisible      = BG_DEFAULTS.projectionVisible;   // board "note preview" ghost on the fretboard
        let slideArrowApproachVisible = BG_DEFAULTS.slideArrowApproachVisible; // slide-direction arrow riding with the note/gem
        let slideArrowNeckVisible      = BG_DEFAULTS.slideArrowNeckVisible;    // slide-direction arrow preview on the neck
        let slideArrowChainPreviewVisible = BG_DEFAULTS.slideArrowChainPreviewVisible; // early neck preview for chained/multi-leg slides
        let _vibrancyIdleOp = 0.4  + 0.6  * BG_DEFAULTS.vibrancy;
        let _vibrancyProjOp = 0.15 + 0.35 * BG_DEFAULTS.vibrancy;
        // Custom image asset (issue #19). Data URL is the bytes that
        // drive the 'image' bg style's texture; name is display-only
        // metadata that settings.html shows next to the file picker.
        let bgCustomImageDataUrl = '';
        let bgCustomImageName = '';
        // Custom video asset (issue #19 follow-up). Stores the
        // server-side filename only; bytes live on disk via routes.py.
        // The renderer composes the served URL from this filename in
        // BG_STYLES.video.build.
        let bgCustomVideoName = '';
        let _bgListener = null;
        let _bgLastT = 0;  // ms timestamp for dt

        // Notedetect feedback (issue #9). Per-panel mark queues populated
        // by two event sources: (a) legacy `notedetect:hit` /
        // `notedetect:miss` window CustomEvents, and (b) FeedBack
        // event-bus `note:hit` / `note:miss` events (subscribed in
        // initScene() when window.feedBack exposes both `on` and `off`).
        // Both sources feed the same _ndPushMark() helper which dedupes
        // dual emissions. drawNote looks up its (s, f, t) against these
        // arrays each frame and swaps the outline material when a match
        // is current. Marks expire after _ND_TTL_MS so the visual flash
        // is brief. Marks self-prune unconditionally in the listener and
        // once per frame in update() to keep the arrays small.
        const _ND_TTL_MS = 500;
        const _ND_TIME_EPS = 0.01;
        let _ndHitMarks = [];
        let _ndMissMarks = [];
        let _ndOnHit = null, _ndOnMiss = null;
        let _ndOnBusHit = null, _ndOnBusMiss = null;
        let _ndLabels = [];
        // Per-chord-occurrence verdict latch for the chord-frame rim
        // tint. Once a chord is observed all-hit/active during its linger
        // fade we latch 'green' here so subsequent frames can't undo it
        // as individual constituent glows decay and getNoteState starts
        // returning null again (which would otherwise flicker the rim
        // back to red mid-linger). Keyed by `${ch.id}|${ch.t}` — ch.id
        // alone is the chord *template* id and is reused across every
        // occurrence of the same shape, so id-only latching would bleed
        // a single clean grab onto every later occurrence of that chord.
        // Pre-hit-line invalidation (chDt > 0 path in the rim selection)
        // evicts a chord's latch the next time it's seen approaching, so
        // loops/rewinds re-judge from scratch and the Map can't grow
        // beyond the current pre-hit-line frontier. Also cleared in
        // destroy().
        let _chordVerdicts = new Map();
        // Previous-frame `now` for the chord-verdicts pruner — on a
        // backward seek the latches behind that time become "future"
        // entries the forward-only prune can't reach, so we wipe the
        // map instead of paying an O(n) scan per frame to find them.
        let _chordVerdictsLastNow = null;
        // Numeric encoding for the _chordVerdicts key — replaces
        // ``${ch.id}|${ch.t}`` which allocated a string per chord per
        // frame in detect mode. Encoded so the key is monotonic in
        // chord time and the prune sweep can compare keys directly
        // (no parseFloat / String.slice). The time component sits in
        // the upper bits; chord-template ids share the lower 1e6 slot
        // and ch.id == null reserves idSlot 0 (no real chord id can
        // collide with it because real ids encode as id + 1).
        // ``time * 1e4`` keeps a 0.1 ms resolution — more than enough
        // to disambiguate distinct chord onsets — and stays under the
        // safe-integer limit for any realistic song length.
        // Key-encoding constants — also DI'd to renderer.js as shorthands so the
        // pruning pass in update() shares the same resolution without a dual definition.
        const _CV_KEY_TIME_MUL = 1e4;
        const _CV_KEY_TIME_SLOT = 1e6;
        function _encodeChordVerdictKey(ch) {
            const tSlot = Math.round(ch.t * _CV_KEY_TIME_MUL) * _CV_KEY_TIME_SLOT;
            const idSlot = ch.id != null ? ((Number(ch.id) | 0) + 1) : 0;
            return tSlot + idSlot;
        }
        // Per-frame timestamp captured by update() and used by its
        // prune pass for the notedetect mark arrays. drawNote itself
        // no longer reads it — pruning lives once per frame so
        // drawNote's hot path is just the bounded (s, f, t) match.
        let _ndFrameNowMs = 0;
        // feedBack#254 — core's per-note judgment provider, captured
        // from `bundle.getNoteState` at the top of each update(). When
        // present it's authoritative over the event-driven marks above:
        // 'hit'/'active' → bright string-tinted outline (mGlow[s]) +
        // bright body + glowing sustain trail + a contained sparkle on
        // the overlay (a held sustain keeps glowing/sparkling for as
        // long as it stays 'active'); 'miss' → red outline (mMissOutline)
        // + suppressed body. null on cores without the API or songs
        // with no scorer registered. Older note_detect builds that only
        // emit notedetect:hit/miss events still work via _ndHitMarks.
        let _ndGetNoteState = null;
        let _ndHasProvider = false;  // true iff a note-state provider is registered (feedBack#254)
        // Sustain verdict latch — persists a provider's hit/miss verdict for the
        // full duration of a sustained note. Once hitGlowDuration expires the
        // provider stops returning state; the latch re-injects the last verdict
        // so the green/red color stays alive until susEnd.
        // Key: Math.round(n.t * 1e4) * 10 + n.s  (matches _ghostPrevBuf scheme)
        // Value: 'hit' | 'hit-live' | 'miss'  ('hit-live' = a live provider hit,
        // tagged live:true, which is NOT re-injected once the provider goes
        // silent — see the live-latch handling in the per-gem loop below).
        let _susVerdictLatch = new Map();

        /* ── h3d-carve-10: K-section (score FX) → src/score-fx.js ──────── */
        const { fxInit, fxTeardown, fxSpawnPop: _fxSpawnPop, drawScoreFx, fxClearSeen } = createScoreFx({
            getHighwayCanvas: () => highwayCanvas,
            getNdFrameNowMs:  () => _ndFrameNowMs,
            getCam:           () => cam,
            getProbe:         () => _probe,
            getNStr:          () => nStr,
            getCurX:          () => curX,
            sY,
        });

        // Object pools
        let pNote, pSus, pLbl, pBeat, pSec;
        let pFretLbl, pLane, pLaneDivider;
        // Shared materials/geometry for the lane stripes — see initScene().
        // Hoisted so draw() can reference them when assigning per-stripe.
        let mLaneOdd = null, mLaneEven = null, gLanePlane = null;
        /** Lane fret dividers: default white vs arpeggio frame tint on outer wires only. */
        let mLaneDivider = null, mLaneDividerArp = null, mLaneDividerExt = null;
        /** Shared XY plane for ghost fret digits (lies on board like proj, not billboarding). */
        let gGhostFretPlane = null, pGhostFretLbl = null;
        // Anchor-driven lane scratch buffers. Per-frame the loop builds up
        // to HWY_LANE_TIME_SLICES segments, but consecutive slices that share
        // an anchor (the common case) collapse into the same entry. Held as
        // four parallel arrays so the per-frame work allocates nothing once
        // the buffers reach their steady-state size.
        /** Chart-time span per merged lane segment (for per-slice arpeggio rail tint). */
        let pChordBox, pChordFrameFill, pChordLbl, pBarreLine, pArpBracket, pPMXFill, pFHXFill;
        let gPMXFill = null; // shared geometry for PM X fill — disposed in teardown
        let gFHXFill = null; // shared geometry for FH X fill — disposed in teardown
        let gPMXLines = null, pMuteXLines = null; // PM X lines combined geometry (8 segs as quads)
        let gFHXLines = null, pFHXLines = null;   // FH X lines combined geometry
        let pNoteFretLabel, pConnectorLine, pDropLine, pTapChevron, pAccentHalo;
        let pTeachMarkLbl;  // teaching marks fg/sd label sprites (§6.2.2)
        let pHaloBar = null, gHaloBar = null; // gradient halo bar geometry — replaces per-shell pChordAccentHalo
        let gArpBracket = null; // shared 1×1×1 box geometry for pArpBracket; built once, disposed in teardown
        let pSusRibbon = null, pSusRibbonOl = null;
        let pFretColMarker;
        /** Horizontal gradient for chord box interior fill. */
        let chordFrameGradTex = null;
        /** Lavender gradient for arpeggio box interior (cyan × lavender blend — fades back to cyan). */
        let chordFrameGradTexArp = null;

        // Dynamic glowing string meshes (BoxGeometry, one per string)
        let stringLines = [];
        // Static thin-line glow layer behind each string (one Line per
        // string). Retained so _applyVibrancy() can mutate opacity in
        // place — without this the layer stays at its built-in opacity
        // until the next palette change rebuilds buildBoard().
        let stringLineGlows = [];
        // One MeshStandardMaterial per fret wire (index = fret 0..NFRETS).
        // Updated each frame to gold when inside the active anchor range,
        // gray otherwise. Reset to [] on every buildBoard() rebuild.
        let fretWireMats = [];
        // Shared bowed TubeGeometry for all fret wires (centered at x=0;
        // each fret mesh only differs by position). Disposed on rebuild +
        // teardown. See FRET_BOW_DZ constants.
        let fretTubeGeo = null;
        /** Nut + headstock 3D subtree; visibility toggled from settings without rebuild. */
        let nutHeadstockGroup = null;
        /** Left edge X of drawable string meshes; updated in buildBoard() at nut / fret junction. */
        let boardStringStartX = fretX(0);
        /** Open-string label column X — over headstock, left of nut (set in buildBoard()). */
        let boardTuningLabelX = -4.2 * K;
        // Fret inlay number label sprites (one per INLAY_LABEL_FRETS entry).
        // Retained so update() can rescale them live when _textSizeMul changes.
        let _inlayLabels = [];
        // Cloned SpriteMaterials for the inlay labels — disposed on rebuild and
        // destroy() to prevent GPU leaks across palette changes or panel reuse.
        let _inlayMats = [];
        // Open-string tuning labels beside the headstock (issue: per-song tuning).
        let _tuningLabelSprites = [], _tuningLabelMats = [];
        let _lastOpenStringLblSig = '';
        // Cheap-key cache for _syncOpenStringPitchLabels: skip the expensive
        // labels-array + signature-string build when the inputs that actually
        // change the labels haven't changed reference/value since last frame.
        let _lastSyncTuningRef = undefined;
        let _lastSyncBundleTuningRef = undefined;
        let _lastSyncCapo = NaN;
        let _lastSyncArrIdx = undefined;
        let _lastSyncPaletteRef = null;
        let _lastSyncNStr = -1;
        let _lastSyncTextSizeMul = NaN;
        let _lastSyncStartX = NaN;
        let _lastSyncLabelX = NaN;
        // Scratch Color used by _applyVibrancy() to avoid allocating a
        // fresh THREE.Color each time the user drags a slider.
        // Allocated lazily once Three.js is loaded inside initScene().
        let _paletteColorTmp = null;
        // Per-fret last-active timestamp for lane persistence
        let fretLastActiveTime = new Array(NFRETS + 1).fill(0);

        // Active string count for the current arrangement (resolved each
        // frame from bundle.stringCount and clamped to MAX_RENDER_STRINGS).
        let nStr = NSTR;
        // Set true once a chart with out-of-range s indices has triggered
        // its warning. Reset only on teardown or when nStr changes (e.g.
        // arrangement switch from guitar to bass) — same-nStr songs share
        // the suppression, which is fine for what is purely a developer
        // aid log.
        let _oobStringWarned = false;

        // Per-string bounds check used by every loop that indexes a
        // per-string array (noteState.*, nextNoteByString, lastFretForString,
        // mStr/mGlow/mSus, ...). Skipping out-of-range s upstream keeps
        // sparse-array extension out of those arrays AND keeps drawNote's
        // material lookup safe in one place.
        function validString(s) {
            const ok = Number.isInteger(s) && s >= 0 && s < nStr;
            if (!ok && !_oobStringWarned) {
                _oobStringWarned = true;
                let msg = '[3D-Hwy] dropping notes with s out of range [0,' + nStr + ')';
                if (nStr === S_COL.length) msg += ' (extended-range chart beyond palette size)';
                console.warn(msg);
            }
            return ok;
        }

        // filter() allocates a new array per chord per frame, even though
        // the vast majority of charts have no out-of-range strings. Scan
        // first; only allocate when there's actually something to drop.
        // The unfiltered array is reused as-is in the common case.
        //
        // Result is cached by ``ch.notes`` identity — call sites (chord
        // render loop, camera pre-pass, strGlow / accent prepasses, cjNext
        // peek) hit the same chord-notes array many times per frame, and
        // the array contents are chart-static for the lifetime of the
        // arrangement. The cache stores either the input array itself
        // (common case) or the filtered copy, so the identity-preservation
        // contract callers depend on is unchanged.
        // NOTE: this cache (and _chordSigCache / _chordShapeCache below) keys on
        // the notes/chord object but its result depends on validString() →
        // nStr. If first computed while nStr is still the default 6 (an early
        // frame before song_info applies stringCount), string-6+ notes get
        // filtered out and would stay gone forever. The nStr-change handler
        // resets all three via _resetStringDependentCaches() so extended-range
        // (7+ string) charts recompute once the real string count arrives.
        let _filterValidNotesCache = new WeakMap();
        function filterValidNotes(notes) {
            const cached = _filterValidNotesCache.get(notes);
            if (cached !== undefined) return cached;
            let filtered = notes;
            for (let i = 0; i < notes.length; i++) {
                if (!validString(notes[i].s)) {
                    filtered = notes.filter(cn => validString(cn.s));
                    break;
                }
            }
            _filterValidNotesCache.set(notes, filtered);
            return filtered;
        }

        /**
         * Normalized fingering signature for chord repeat-run detection, or null.
         * Cached via WeakMap so the sort+join only runs once per unique chord object
         * across all frames — chart data never changes after load.
         */
        let _chordSigCache = new WeakMap();
        function chordShapeSignature(ch) {
            if (!ch?.notes) return null;
            if (_chordSigCache.has(ch)) return _chordSigCache.get(ch);
            const chordNotes = filterValidNotes(ch.notes);
            let sig = null;
            if (chordNotes.length > 0) {
                sig = chordNotes.slice().sort((a, b) => a.s - b.s).map(n => `${n.s}:${n.f}`).join('|');
            }
            _chordSigCache.set(ch, sig);
            return sig;
        }

        // ── Per-frame scratch arrays (hoisted to avoid per-frame allocation) ─────
        // Sized to MAX_RENDER_STRINGS / NFRETS+1 — always large enough for any
        // arrangement. We fill only [0..nStr) each frame and reset with .fill().
        // Holding these at closure scope keeps them in a GC root; the engine can
        // keep them hot in L1/L2 across frames, and no allocation pressure from
        // update() itself.
        // Fret-wire hit flash. _fwHitIn is per-frame (cleared with the rest of
        // the frame state, written by drawNote when a provider confirms a note);
        // _fwHitGlow persists across frames so the flash can decay smoothly
        // rather than snapping off the frame the provider goes quiet.
        const _fwHitIn               = new Float32Array(NFRETS + 1);
        const _fwHitGlow             = new Float32Array(NFRETS + 1);
        // Per-frame chord accumulator. A chord flashes only the OUTERMOST wires
        // of its shape, but drawNote() sees one chord note at a time and can't
        // know the span — so hits accumulate here keyed by chord, and the flash
        // pass (which runs after every draw loop) resolves min/max into wires.
        // Typically 0-2 entries: only chords with a confirmed hit land here.
        const _fwChordAcc            = new Map();
        let _fwHitPrevTime = -Infinity; // chart time of the last decay step
        let _fwHitColor = null;         // T.Color scratch (built in initScene)
        let _fwHitEmissive = null;
        // Scratch buffer for the recent-past-event prepass (~0.6 s back) — avoids
        // re-allocating a per-string Array every frame. Re-filled with -Infinity
        // at the top of each prepass run.
        // Scratch buffers for the ghost-preview gap prepass — refilled each
        // frame to avoid the `new Array(nStr)` + `Object.create(null)` churn.
        // The Map is cleared at the top of the prepass; live entries are
        // consumed by drawNote() reads later in the same frame.
        // Per-string count of upcoming-ghost slots (1/2) claimed so far this
        // frame (board ghost — up to 3 simultaneous previews per string).
        // Reset to 0 each frame alongside the other pool .reset() calls.
        const _scrGhostUpcomingCount = new Array(MAX_RENDER_STRINGS).fill(0);
        // Hoisted scratch for the arp-bracket dedupe within a single draw().
        // Keys are `${chordId}:${occurrenceStart}` strings (cheap to build, low
        // cardinality per frame); values are Sets of string-indices that have
        // already drawn brackets in the AHEAD note-stream pass. Cleared at the
        // top of every chord pass so the Set objects (and the outer Map) are
        // reused across frames instead of reallocated.
        // Scratch object reused for chord-note drawNote calls so `{ ...cn, t: ch.t }`
        // doesn't allocate a new object per chord note per frame.
        // Scratch objects for the nextNoteByString prepass — chord notes need
        // a merged `{ ...cn, t: ch.t }` object, but spread allocates every frame.
        // One scratch object per string (max MAX_RENDER_STRINGS) is safe because:
        // (a) the prepass writes each string's entry at most once per frame,
        // (b) drawNote() reads nxFrame.t before the next frame's prepass can overwrite.
        // Reusable Set for arpeggio persistence key lookup — cleared each frame
        // instead of reallocating a new Set.
        // Reusable Set for active-fret cooldown tracking — cleared each frame.
        // Reusable scratch for barre atMinFretStrings computation — avoids the
        // [...chShape].filter().map().sort() chain (3 allocations per chord per frame).
        // Sorted scalar view of "next event time per string ∪ recent event
        // time per string" — populated once per frame in update() after
        // _drawNextByString and _drawRecentByString are set. drawNote() and
        // the chord render loop both need "earliest event time strictly
        // greater than t" to deadline-cap gem visibility; the previous
        // implementation re-scanned both per-string arrays (2 * nStr
        // lookups) per note/chord per frame, which is hot in dense
        // PM/FH/arpeggio passages. With this scratch the same query is
        // O(log N) over at most 2 * MAX_RENDER_STRINGS = 16 entries via
        // _firstEventTimeGreaterThan(). Capacity is fixed (Float64Array)
        // to keep the buffer in stable memory; _scrEventTimesLen tracks
        // the live prefix.
        const _scrEventTimes    = new Float64Array(MAX_RENDER_STRINGS * 2);
        let   _scrEventTimesLen = 0;
        function _firstEventTimeGreaterThan(t) {
            let lo = 0, hi = _scrEventTimesLen;
            while (lo < hi) {
                const mid = (lo + hi) >>> 1;
                if (_scrEventTimes[mid] <= t) lo = mid + 1;
                else hi = mid;
            }
            return lo < _scrEventTimesLen ? _scrEventTimes[lo] : Infinity;
        }

        // Camera state
        let _leftyCached = false;
        const xFret = f => (_leftyCached ? -fretX(f) : fretX(f));
        const xFretMid = f => (_leftyCached ? -fretMid(f) : fretMid(f));
        const boardSpanX = () => {
            const x0 = xFret(0);
            const xN = xFret(NFRETS);
            return {
                min: Math.min(x0, xN),
                max: Math.max(x0, xN),
                center: (x0 + xN) / 2,
                width: Math.abs(xN - x0),
            };
        };

        let tgtX = xFretMid(CAM_LOCK_CENTER_FRET), curX = xFretMid(CAM_LOCK_CENTER_FRET);
        let tgtDist = CAM_DIST_BASE, curDist = CAM_DIST_BASE;
        // Dolly-back multiplier applied to the curDist lerp target by camUpdate's
        // fret-row fit guard. 1 = no extra pull-back (the common case); rises
        // toward FRET_ROW_FIT_BOOST_MAX only when a tight, centred zoom would push
        // the fret-number row past the bottom edge, then relaxes back to 1.
        let _fretRowFitBoost = 1;
        // Last committed lowFretBonus contribution baked into tgtDist
        // (see candidateDist block — bonus is applied on top of the
        // hysteresis-gated base).
        let prevLowFretBonus = 0;
        // Tracks whether the camera lock was active on the previous
        // frame, so the dynamic branch can bypass zoom hysteresis on
        // the first frame after a lock release. Without this, a >12
        // fret note that disengaged the lock could be swallowed by
        // the dead zone and the camera would fail to widen — a UX
        // promise of the lock toggle.
        let prevLockActive = false;
        let tgtLookY = 0, curLookY = 0;   // lerped look-at Y for self-correcting camera
        let aspectScale = 1;
        // _camSnapped / _camPreScanned / _songKey: together they gate the
        // first-data bootstrap.
        //
        // On the first update() frame where both chart arrays are available,
        // they are scanned once (O(N)) for the first relevant fretted event.
        // The normal camera-target calculation is sampled at the point where
        // that event first enters its targeting window, and curX/curDist are
        // initialized immediately. This makes silent intros start with the same
        // base framing they would otherwise acquire just before the first notes.
        //
        // _camBootstrapHolding keeps that initialized target stable through the
        // empty intro. It is released as soon as the ordinary live window has
        // fret bounds/data, producing a continuous hand-off with no second snap.
        // If the camera mode changes during the hold, live framing takes over.
        //
        // All-open/empty charts have no horizontal fret target, so they keep the
        // default base view and disable bootstrap work immediately.
        //
        // _songKey tracks the active song/arrangement so the bootstrap state resets
        // automatically when the user switches songs or arrangements via
        // reconnect() (which does not call renderer.destroy/init).
        let _camSnapped = false;
        let _camPreScanned = false;
        let _camBootstrapHolding = false;
        let _camBootstrapMode = null;
        let _songKey = null;
        // Smooth lookahead camera: fused world-X and displayed fret-span.
        let _lookaheadCamX = xFretMid(CAM_LOCK_CENTER_FRET);
        let _lookaheadFretSpan = DEFAULT_LOOKAHEAD_FRET_SPAN;
        let _lookaheadCamPrevNow = null;
        let _lookaheadLowBonusU = 0;
        let _lookaheadHiNeckLatch = false;

        // ── Sub-frame clock smoothing ─────────────────────────────────────
        // bundle.currentTime is the browser's audio.currentTime, which only
        // refreshes every ~20–23 ms — coarser than a 60/144 Hz rAF frame. Fed
        // straight into note Z-positions it makes the whole highway step in
        // micro-jumps (1–2 static frames, then a jump), most visible as a
        // "stutter" across a dense wall of repeated chords even when FPS is
        // steady. smoothNow() interpolates forward with performance.now()
        // between distinct audio samples (mirroring core highway.js
        // getTime()), tracking the observed playback rate so the speed slider
        // stays accurate, and falls back to the raw value on pause / seek /
        // stall so the scroll never drifts against silent audio.
        let _clkAudioT = NaN;   // last distinct bundle.currentTime sample
        let _clkPerf = NaN;     // performance.now() when that sample arrived
        let _clkRate = 1;       // observed chart-seconds per real-second
        let _frameNow = 0;      // smoothed time for THIS frame (update → camUpdate)

        // Low-overdraw sustain rendering (DEFAULT since perf profiling on
        // dense palm-mute / fret-hand-mute passages). Those sections are GPU
        // fill-bound: the transparent sustain trails/rails stack many blended
        // fragments. Profiling (pinned A/B loop) showed ren.render() p50 at
        // ~7.5 ms vs ~5.9 ms with all the sustain extras off. The additive
        // rail bloom halo (wide gaussian planes, additive blending) is the
        // single most expensive per-pixel contributor, so the lean default
        // drops ONLY the bloom. The trail/ribbon white OUTLINE (mSusOutline,
        // with hit/miss colour) is kept — it's a thin, cheap layer and gives
        // tails their border, so it's worth the small fill cost. Opt back into
        // the full look (re-enable the rail bloom) per browser, no rebuild:
        //   localStorage.h3d_full_sus = '1'   // re-enable rail bloom halo
        //   delete localStorage.h3d_full_sus  // back to lean default
        // Polled at ~1 Hz at the top of update() (perf: localStorage reads
        // are synchronous) so the console flag still takes effect live.
        // The bloom pool/material/gaussian texture are kept intact
        // (still pinned by the bloom unit tests and used by the opt-out path).
        let _leanSus = true;
        let _leanSusPollCounter = 0;

        // Lifecycle flags
        let _isReady = false;
        let _destroyed = false;
        let _invertedCached = false;
        let _invertedForBoard = false;
        let _leftyForBoard = false;
        let _initToken = 0;
        let highwayCanvas = null;

        // ── Focus state (splitscreen dim) ─────────────────────────────────
        let _focusSubscribed = false;
        let _isFocused = true;
        const _onFocusChange = () => _updateFocusState();

        function _unsubscribeFocus() {
            if (!_focusSubscribed) return;
            const ss = window.feedBackSplitscreen;
            if (ss && typeof ss.offFocusChange === 'function') ss.offFocusChange(_onFocusChange);
            _focusSubscribed = false;
        }

        function _updateFocusState() {
            if (_destroyed || !_isReady) return;
            const focused = _ssIsCanvasFocused(highwayCanvas);
            if (focused === _isFocused) return;
            _isFocused = focused;
            if (ambLight) ambLight.intensity = focused ? 0.85 : 0.4;
            if (dirLight) dirLight.intensity = focused ? 0.8 : 0.35;
        }

        // ── String-to-Y (respects invert) ─────────────────────────────────
        const sY = s => S_BASE + (_invertedCached ? s : (nStr - 1 - s)) * S_GAP;

        // ── h3d-carve-6: material builders ───────────────────────────────────
        // TXT_STYLES, txtMat, pinchHarmonicMat, naturalHarmonicMat,
        // palmMuteXSpriteMat, fretHandMuteXSpriteMat, muteXMat,
        // triMat, bendChevronMat, darkenHex, slideArrowMat,
        // _meshMatForGhostFretDigit, _spriteMat2MeshMat, pool
        // → src/materials.js (createMaterialBuilders)
        //
        // Surprises vs plan §4:
        //   • _syncOpenStringPitchLabels cluster (20+ factory-scope deps) stays in screen.js
        //   • DI is 4 params { getT, getTxtCache, techMatCache, techMeshMatClones }, not 1
        //   • _techMatCache stays here; teardown accesses .values()/.clear() directly
        const _techMatCache = new Map();
        const { txtMat, pinchHarmonicMat, naturalHarmonicMat,
                palmMuteXSpriteMat, fretHandMuteXSpriteMat, muteXMat,
                triMat, bendChevronMat, darkenHex, slideArrowMat,
                _meshMatForGhostFretDigit, _spriteMat2MeshMat, pool } = createMaterialBuilders({
            getT: () => T,
            getTxtCache: () => txtCache,
            techMatCache: _techMatCache,
            techMeshMatClones: _techMeshMatClones,
        });

        function _disposeOpenStringPitchSprites() {
            // Tuning-label materials are clones of cached txtMat() entries, so
            // they share the .map (CanvasTexture) with the canonical txtCache
            // material. Disposing the map here would invalidate every other
            // material that references the same cached glyph; teardown()'s
            // txtCache loop is the single owner of those textures.
            for (const m of _tuningLabelMats) {
                try { m.dispose(); } catch (_) { /* idempotent */ }
            }
            _tuningLabelMats = [];
            _tuningLabelSprites = [];
            _lastOpenStringLblSig = '';
            if (!tuningLblG) return;
            while (tuningLblG.children.length) tuningLblG.remove(tuningLblG.children[0]);
        }

        function _openStringLabelSignature(bundle, labels) {
            const si = bundle && bundle.songInfo;
            // Same bundle-first preference as _openStringPitchLabelsForTuning.
            let tStr = '';
            if (bundle && Array.isArray(bundle.tuning)) tStr = bundle.tuning.slice(0, labels.length).join(',');
            else if (si && Array.isArray(si.tuning)) tStr = si.tuning.slice(0, labels.length).join(',');
            // Fallback 0 matches _openStringPitchLabelsForTuning, so the
            // signature reflects exactly what was rendered.
            const capo =
                bundle && Number.isFinite(bundle.capo) ? bundle.capo
                    : (si && Number.isFinite(si.capo) ? si.capo : 0);
            const arrIdx = si && si.arrangement_index != null ? si.arrangement_index : '';
            let palSig = '';
            const nLab = labels.length;
            if (activePalette) {
                // activePalette entries are numeric hex (PALETTES) or already hex strings;
                // convert without instantiating T.Color per string — this signature is
                // built every frame inside _syncOpenStringPitchLabels.
                const lim = Math.min(activePalette.length, nLab);
                for (let i = 0; i < lim; i++) {
                    if (i > 0) palSig += '/';
                    const c = activePalette[i];
                    palSig += typeof c === 'number' ? (c >>> 0).toString(16) : String(c);
                }
            }
            return `${nStr}|${capo}|${tStr}|${arrIdx}|${labels.join(',')}|${palSig}|${_textSizeMul.toFixed(3)}|${boardStringStartX.toFixed(6)}|${boardTuningLabelX.toFixed(6)}`;
        }

        function _syncOpenStringPitchLabels(bundle) {
            if (!tuningLblG || !T || !bundle) return;
            if (!tuningLabelsVisible) {
                tuningLblG.visible = false;
                if (_tuningLabelSprites.length) _disposeOpenStringPitchSprites();
                _lastOpenStringLblSig = '';
                return;
            }
            tuningLblG.visible = true;
            // Cheap-key fast path: compare the inputs that drive the label content
            // against last frame. The signature string + labels array build are
            // both per-frame allocators, so skipping them when nothing changed
            // saves a chunk of GC pressure in the hot render loop.
            const si = bundle.songInfo;
            const tunRef = (si && Array.isArray(si.tuning)) ? si.tuning : null;
            const bundleTunRef = Array.isArray(bundle.tuning) ? bundle.tuning : null;
            const capo =
                Number.isFinite(bundle.capo) ? bundle.capo
                    : (si && Number.isFinite(si.capo) ? si.capo : 0);
            const arrIdx = si && si.arrangement_index != null ? si.arrangement_index : undefined;
            if (
                _tuningLabelSprites.length === nStr &&
                _lastSyncTuningRef === tunRef &&
                _lastSyncBundleTuningRef === bundleTunRef &&
                Object.is(_lastSyncCapo, capo) &&
                _lastSyncArrIdx === arrIdx &&
                _lastSyncPaletteRef === activePalette &&
                _lastSyncNStr === nStr &&
                _lastSyncTextSizeMul === _textSizeMul &&
                _lastSyncStartX === boardStringStartX &&
                _lastSyncLabelX === boardTuningLabelX
            ) return;
            // One of the inputs changed — fall through to the canonical signature
            // check (catches value-equal-but-different-ref tuning arrays).
            const labels = _openStringPitchLabelsForTuning(bundle, si, nStr);
            const sig = _openStringLabelSignature(bundle, labels);
            // Refresh cheap-key cache regardless of signature outcome so future
            // frames can fast-path even when the sig matched.
            _lastSyncTuningRef = tunRef;
            _lastSyncBundleTuningRef = bundleTunRef;
            _lastSyncCapo = capo;
            _lastSyncArrIdx = arrIdx;
            _lastSyncPaletteRef = activePalette;
            _lastSyncNStr = nStr;
            _lastSyncTextSizeMul = _textSizeMul;
            _lastSyncStartX = boardStringStartX;
            _lastSyncLabelX = boardTuningLabelX;
            if (sig === _lastOpenStringLblSig && _tuningLabelSprites.length === nStr) return;
            _disposeOpenStringPitchSprites();
            _lastOpenStringLblSig = sig;
            // Left of nut/cordas — centered on headstock mass so text does not sit on the strings.
            const labelX = boardTuningLabelX;
            const zLabel = -0.08 * K;
            const scalePx = 2.42 * _textSizeMul * K;
            for (let s = 0; s < nStr; s++) {
                const hex = '#' + new T.Color(activePalette[s % activePalette.length]).getHexString();
                const mat = txtMat(labels[s] || '?', hex, false, 'noteFret').clone();
                mat.depthTest = false;
                mat.depthWrite = false;
                mat.transparent = true;
                const sp = new T.Sprite(mat);
                sp.center.set(0, 0.5);
                sp.scale.set(scalePx, scalePx, 1);
                sp.position.set(labelX, sY(s), zLabel);
                sp.renderOrder = 8;
                tuningLblG.add(sp);
                _tuningLabelSprites.push(sp);
                _tuningLabelMats.push(mat);
            }
        }

        // ── Object pool ────────────────────────────────────────────────────
        // ── Opt-in perf bench harness (feedBack#226) ──────────────────────
        // Enable with `?h3dbench=1` on the player URL. Aggregates per-segment
        // timings of update() into a console.log every _PB_REPORT_MS.
        //
        // When the bench is OFF, pbBeg/pbEnd/pbReportTick are bound to a
        // single shared empty function literal when this renderer
        // instance is created (createHighway() runs once per panel, not
        // once per module load) — V8 typically inlines empty bodies and
        // the call sites have minimized overhead in the hot path.
        // (Previously they had `if (!_perfBench) return;` guards, which
        // still cost a function-call frame per mark site per frame;
        // Copilot review on #413.) Inlining is a JIT heuristic, not a
        // language guarantee.
        const _perfBench = (() => {
            try { return new URLSearchParams(location.search).get('h3dbench') === '1'; }
            catch (_) { return false; }
        })();
        let pbBeg, pbEnd, pbReportTick;
        if (_perfBench) {
            const _PB_NAMES = ['frame', 'state', 'next', 'mat', 'noteDraw', 'chordDraw', 'render'];
            const _pbStart = new Float64Array(_PB_NAMES.length);
            const _pbAcc = _PB_NAMES.map(() => []);
            const _PB_REPORT_MS = 5000;
            let _pbReportStart = 0;
            let _pbFrameCount = 0;
            pbBeg = function pbBeg(idx) { _pbStart[idx] = performance.now(); };
            pbEnd = function pbEnd(idx) {
                _pbAcc[idx].push(performance.now() - _pbStart[idx]);
            };
            pbReportTick = function pbReportTick() {
                const now = performance.now();
                if (_pbReportStart === 0) {
                    // First call: discard the sample(s) that already
                    // landed in _pbAcc from the very first frame's
                    // pbEnd() calls, so fps and segment stats span the
                    // same frame set on every reported window.
                    _pbReportStart = now;
                    _pbFrameCount = 0;
                    for (let i = 0; i < _PB_NAMES.length; i++) _pbAcc[i].length = 0;
                    return;
                }
                _pbFrameCount++;
                if (now - _pbReportStart < _PB_REPORT_MS) return;
                const dur = now - _pbReportStart;
                const fps = (_pbFrameCount / dur * 1000).toFixed(1);
                const parts = [];
                for (let i = 0; i < _PB_NAMES.length; i++) {
                    const arr = _pbAcc[i];
                    if (!arr.length) { parts.push(`${_PB_NAMES[i]}=-`); continue; }
                    arr.sort((a, b) => a - b);
                    const n = arr.length;
                    // Nearest-rank: ceil(p · n) - 1, clamped to [0, n-1].
                    // Avoids the off-by-one where Math.floor(n * 0.95)
                    // returns the last element (effectively the max)
                    // for small samples (e.g. n=20 → idx 19).
                    const p50 = arr[Math.max(0, Math.ceil(0.50 * n) - 1)];
                    const p95 = arr[Math.max(0, Math.ceil(0.95 * n) - 1)];
                    const mx = arr[n - 1];
                    parts.push(`${_PB_NAMES[i]} p50=${p50.toFixed(2)} p95=${p95.toFixed(2)} max=${mx.toFixed(2)}`);
                    arr.length = 0;
                }
                console.log(`[h3dbench] ${fps}fps (${_pbFrameCount} frames) over ${(dur/1000).toFixed(1)}s — ${parts.join(' | ')}`);
                _pbReportStart = now;
                _pbFrameCount = 0;
            };
        } else {
            pbBeg = pbEnd = pbReportTick = function () {};
        }



        // ── h3d-carve-7: lyrics + HUD overlay ──────────────────────────────────────
        // longestConsecutiveRun, drawChordDiagram, _drawDiagramCached,
        // drawSectionHud, drawToneHud, drawLyrics  → src/overlay.js (createOverlay)
        //
        // Surprises vs contract:
        //   • longestConsecutiveRun (lines 4338–4352) co-moved — only called by drawChordDiagram
        //   • DIAG_SIZE_MIN, DIAG_SIZE_MAX, DIAG_CELL_MAX deleted from screen.js lines 573–575
        //   • _DIAG_CACHE_MAX deleted from factory scope line 3256 (moved to overlay.js)
        //
        // Beyond-subst (2):
        //   1. Factory wrapper createOverlay({ diagRenderCache })
        //   2. _diagRenderCache → diagRenderCache (3 sites in _drawDiagramCached)
        const { drawChordDiagram, _drawDiagramCached, drawSectionHud, drawToneHud, drawLyrics } =
            createOverlay({ diagRenderCache: _diagRenderCache });

        /* ── Scene initialisation ─────────────────────────────────────────── */
        /* ── h3d-carve-16: P-section (scene init) + buildBoard → src/scene-init.js ── */

        /* ── h3d-carve-8: Q-helpers (lighting/FX) → src/fx.js ─────────── */
        /* buildBoard deferred: see plans/highway3d-carve.md §3 row 16.  */
        const { _h3dHexOrDefault, _applyCinematic, _timingHex, _sparkBurst, _sparkUpdate, _applyBloom, _bloomEnsure } = createFx({
            BG_DEFAULTS, K,
            getT: () => T,
            getAmbLight: () => ambLight, getDirLight: () => dirLight, getCinematic: () => _cinematic,
            getTimingFx: () => _timingFx,
            getSparkPts: () => _sparkPts, setSparkPts: (v) => { _sparkPts = v; }, getSparkN: () => _SPARK_N,
            getSparkPos: () => _sparkPos, setSparkPos: (v) => { _sparkPos = v; },
            getSparkVel: () => _sparkVel, setSparkVel: (v) => { _sparkVel = v; },
            getSparkCol: () => _sparkCol, setSparkCol: (v) => { _sparkCol = v; },
            getSparkLife: () => _sparkLife, setSparkLife: (v) => { _sparkLife = v; },
            getComposer: () => _composer, setComposer: (v) => { _composer = v; },
            getBloomLoad: () => _bloomLoad, setBloomLoad: (v) => { _bloomLoad = v; },
            getBloomPass: () => _bloomPass, setBloomPass: (v) => { _bloomPass = v; },
            getBloomW: () => _bloomW, setBloomW: (v) => { _bloomW = v; },
            getBloomH: () => _bloomH, setBloomH: (v) => { _bloomH = v; },
            getRen: () => ren, getScene: () => scene, getCam: () => cam, getHighwayCanvas: () => highwayCanvas,
            canvasSize,
        });
        /* ── h3d-carve-16: P-section (scene init) + buildBoard → src/scene-init.js ── */
        const {
            initScene, buildBoard, _bgUnmountStyle, _bcSyncMode,
        } = createSceneInit({
            // ── Module constants ─────────────────────────────────────────────
            K, NW, NH, ND, NFRETS,
            S_BASE, S_GAP,
            FOG_START, FOG_END, BASE_VFOV,
            HWY_LANE_STRIPE_ODD_HEX, HWY_LANE_STRIPE_EVEN_HEX,
            CHORD_BOX_TEAL_HEX, CHORD_BOX_TEAL_DARK_HEX, CHORD_BOX_FILL_GRAD_ALPHA,
            ARPEGGIO_BOX_BLUE_HEX, ARPEGGIO_BOX_BLUE_DARK_HEX, ARPEGGIO_RIM_BLUE_HEX,
            FRET_LABEL_GOLD_HEX, CHORD_BOX_EDGE_ALPHA,
            BG_DEFAULTS, BG_STYLES, PALETTES,
            IM_TECH_CAP, IM_STRUM_CAP, MAX_RENDER_STRINGS,
            SLIDE_RIBBON_SAMPLES, SLIDE_RIBBON_INDICES_ARR,
            DEFAULT_GEM_GRADIENTS, INLAY_LABEL_FRETS,
            SPARK_N: _SPARK_N,
            _ND_TTL_MS, _ND_TIME_EPS,
            FRET_WIRE_HIT_HEX, FRET_WIRE_HIT_EMISSIVE, FRET_WIRE_IDLE_HEX, FRET_WIRE_IDLE_OP,
            ACCENT_RIM_BASE_EMISSIVE,
            ACCENT_HALO_OP_NEAR, ACCENT_HALO_OP_MID, ACCENT_HALO_OP_FAR,
            ACCENT_HALO_XY_INNER, ACCENT_HALO_XY_MID, ACCENT_HALO_XY_OUTER,
            ACCENT_HALO_Z_INNER, ACCENT_HALO_Z_MID, ACCENT_HALO_Z_OUTER,
            STR_THICK, FRET_BOW_DZ, FRET_TUBE_RADIUS, FRET_TUBE_SEG, FRET_TUBE_RADIAL,
            FRET_METALNESS, FRET_ROUGHNESS, FRET_EMISSIVE,
            AHEAD, TS, DOTS, DDOTS,
            // ── Stable fn/obj refs ───────────────────────────────────────────
            sY,
            fretLabelScaleForFret,
            pool,
            txtMat,
            palmMuteXSpriteMat, fretHandMuteXSpriteMat,
            _applyCinematic,
            _h3dHexOrDefault,
            _bgPanelKey, _bgReadSetting, _bgGetAnalyser,
            _bgBackgroundColors, _bgHighwayColors,
            _bgSubscribe, _bgHasStored, _bgMemFallback,
            _venueSwapPlateIfNeeded,
            _darkenInt, _lightenInt, _h3dHexToInt,
            boardSpanX,
            _bcCreateController,
            canvasSize, applySize,
            fxInit,
            _disposeOpenStringPitchSprites,
            _ownedSharedMats, _ownedSharedGeos,
            _imPMTechAlphaArr, _imFHTechAlphaArr,
            _imPMXFillAlphaArr, _imPMXLinesAlphaArr,
            _imFHXFillAlphaArr, _imFHXLinesAlphaArr,
            fretLastActiveTime,
            _fwHitGlow,
            _customPalette,
            _outlinePalette: null,
            _tuningLabelSprites,
            // ── Read-only getters ────────────────────────────────────────────
            getH3dFretUniform: () => _h3dFretUniform,
            getHighwayCanvas: () => highwayCanvas,
            getInstanceId: () => _instanceId,
            getLeftyCached: () => _leftyCached,
            getNStr: () => nStr,
            getActivePalette: () => activePalette,
            getTextSize: () => textSize,
            getGlowMul: () => glowMul,
            getVibrancyIdleOp: () => _vibrancyIdleOp,
            getVibrancyProjOp: () => _vibrancyProjOp,
            getBgReactiveOptOut: () => _bgReactiveOptOut,
            getVenueSceneOverride: () => _venueSceneOverride,
            getVibrancy: () => vibrancy,
            // ── Getter+setter pairs ──────────────────────────────────────────
            getWrap: () => wrap, setWrap: (v) => { wrap = v; },
            getRen: () => ren, setRen: (v) => { ren = v; },
            getScene: () => scene, setScene: (v) => { scene = v; },
            getCam: () => cam, setCam: (v) => { cam = v; },
            getAmbLight: () => ambLight, setAmbLight: (v) => { ambLight = v; },
            getDirLight: () => dirLight, setDirLight: (v) => { dirLight = v; },
            getFretG: () => fretG, setFretG: (v) => { fretG = v; },
            getTuningLblG: () => tuningLblG, setTuningLblG: (v) => { tuningLblG = v; },
            getNoteG: () => noteG, setNoteG: (v) => { noteG = v; },
            getBeatG: () => beatG, setBeatG: (v) => { beatG = v; },
            getLblG: () => lblG, setLblG: (v) => { lblG = v; },
            getLyricsCanvas: () => lyricsCanvas, setLyricsCanvas: (v) => { lyricsCanvas = v; },
            setLyricsCtx: (v) => { lyricsCtx = v; },
            setHighwayCanvas: (v) => { highwayCanvas = v; },
            getVisibilityHandler: () => _visibilityHandler, setVisibilityHandler: (v) => { _visibilityHandler = v; },
            getCanvasReplacedHandler: () => _canvasReplacedHandler, setCanvasReplacedHandler: (v) => { _canvasReplacedHandler = v; },
            getOnCtxLost: () => _onCtxLost, setOnCtxLost: (v) => { _onCtxLost = v; },
            getOnCtxRestored: () => _onCtxRestored, setOnCtxRestored: (v) => { _onCtxRestored = v; },
            setCtxLost: (v) => { _ctxLost = v; },
            getBgGroup: () => bgGroup, setBgGroup: (v) => { bgGroup = v; },
            getBgListener: () => _bgListener, setBgListener: (v) => { _bgListener = v; },
            setProbe: (v) => { _probe = v; },
            getBgStyleId: () => bgStyleId, setBgStyleId: (v) => { bgStyleId = v; },
            getBgIntensity: () => bgIntensity, setBgIntensity: (v) => { bgIntensity = v; },
            getBgThemeId: () => bgThemeId, setBgThemeId: (v) => { bgThemeId = v; },
            getHwThemeId: () => hwThemeId, setHwThemeId: (v) => { hwThemeId = v; },
            getBgPaletteSig: () => _bgPaletteSig, setBgPaletteSig: (v) => { _bgPaletteSig = v; },
            setBgReactive: (v) => { bgReactive = v; },
            getLaneTargetColor: () => _laneTargetColor, setLaneTargetColor: (v) => { _laneTargetColor = v; },
            getBoardPlaneMat: () => _boardPlaneMat, setBoardPlaneMat: (v) => { _boardPlaneMat = v; },
            getHeadstockColor: () => headstockColor, setHeadstockColor: (v) => { headstockColor = v; },
            getNutColor: () => nutColor, setNutColor: (v) => { nutColor = v; },
            getNutHeadstockGroup: () => nutHeadstockGroup, setNutHeadstockGroup: (v) => { nutHeadstockGroup = v; },
            getNutHeadstockVisible: () => nutHeadstockVisible, setNutHeadstockVisible: (v) => { nutHeadstockVisible = v; },
            getInlayLabels: () => _inlayLabels, setInlayLabels: (v) => { _inlayLabels = v; },
            getInlayMats: () => _inlayMats, setInlayMats: (v) => { _inlayMats = v; },
            getInlayLabelsVisible: () => inlayLabelsVisible, setInlayLabelsVisible: (v) => { inlayLabelsVisible = v; },
            getStringLineGlows: () => stringLineGlows, setStringLineGlows: (v) => { stringLineGlows = v; },
            getStringLines: () => stringLines, setStringLines: (v) => { stringLines = v; },
            getProjMeshArr: () => projMeshArr, setProjMeshArr: (v) => { projMeshArr = v; },
            getBcCtrl: () => bcCtrl, setBcCtrl: (v) => { bcCtrl = v; },
            getSparkPos: () => _sparkPos, setSparkPos: (v) => { _sparkPos = v; },
            getSparkCol: () => _sparkCol, setSparkCol: (v) => { _sparkCol = v; },
            setSparkVel: (v) => { _sparkVel = v; },
            setSparkLife: (v) => { _sparkLife = v; },
            setSparkPts: (v) => { _sparkPts = v; },
            getSparkPts: () => _sparkPts,
            getMStr: () => mStr, setMStr: (v) => { mStr = v; },
            getMGlow: () => mGlow, setMGlow: (v) => { mGlow = v; },
            getMSus: () => mSus, setMSus: (v) => { mSus = v; },
            getMBarre: () => mBarre, setMBarre: (v) => { mBarre = v; },
            getMStrHitOutline: () => mStrHitOutline, setMStrHitOutline: (v) => { mStrHitOutline = v; },
            getMAccentOutline: () => mAccentOutline, setMAccentOutline: (v) => { mAccentOutline = v; },
            getMAccentCore: () => mAccentCore, setMAccentCore: (v) => { mAccentCore = v; },
            getMAccentHaloNear: () => mAccentHaloNear, setMAccentHaloNear: (v) => { mAccentHaloNear = v; },
            getMAccentHaloMid: () => mAccentHaloMid, setMAccentHaloMid: (v) => { mAccentHaloMid = v; },
            getMAccentHaloFar: () => mAccentHaloFar, setMAccentHaloFar: (v) => { mAccentHaloFar = v; },
            getMHitSusOutline: () => mHitSusOutline, setMHitSusOutline: (v) => { mHitSusOutline = v; },
            setMMissEdgeArrays: (v) => { mMissEdgeArrays = v; },
            setMEdgeTransparent: (v) => { mEdgeTransparent = v; },
            getMHitBright: () => mHitBright, setMHitBright: (v) => { mHitBright = v; },
            setMHitBrightArrays: (v) => { mHitBrightArrays = v; },
            getMRimFlash: () => mRimFlash, setMRimFlash: (v) => { mRimFlash = v; },
            getMWhiteOutline: () => mWhiteOutline, setMWhiteOutline: (v) => { mWhiteOutline = v; },
            getMSusOutline: () => mSusOutline, setMSusOutline: (v) => { mSusOutline = v; },
            getMMissOutline: () => mMissOutline, setMMissOutline: (v) => { mMissOutline = v; },
            getMTapChevron: () => mTapChevron, setMTapChevron: (v) => { mTapChevron = v; },
            setMLaneDivider: (v) => { mLaneDivider = v; },
            setMLaneDividerArp: (v) => { mLaneDividerArp = v; },
            setMLaneDividerExt: (v) => { mLaneDividerExt = v; },
            getMLaneOdd: () => mLaneOdd, setMLaneOdd: (v) => { mLaneOdd = v; },
            getMLaneEven: () => mLaneEven, setMLaneEven: (v) => { mLaneEven = v; },
            setMBeatM: (v) => { mBeatM = v; },
            setMBeatQ: (v) => { mBeatQ = v; },
            setMSusRailBase: (v) => { mSusRailBase = v; },
            setMSusRailBloomBase: (v) => { mSusRailBloomBase = v; },
            setAccentShellsByString: (v) => { _accentShellsByString = v; },
            getPaletteColorTmp: () => _paletteColorTmp, setPaletteColorTmp: (v) => { _paletteColorTmp = v; },
            getGNoteGrad: () => gNoteGrad, setGNoteGrad: (v) => { gNoteGrad = v; },
            getGArpBracket: () => gArpBracket, setGArpBracket: (v) => { gArpBracket = v; },
            getGHaloBar: () => gHaloBar, setGHaloBar: (v) => { gHaloBar = v; },
            getGPMXLines: () => gPMXLines, setGPMXLines: (v) => { gPMXLines = v; },
            getGFHXLines: () => gFHXLines, setGFHXLines: (v) => { gFHXLines = v; },
            getGPMXFill: () => gPMXFill, setGPMXFill: (v) => { gPMXFill = v; },
            getGFHXFill: () => gFHXFill, setGFHXFill: (v) => { gFHXFill = v; },
            setGNote: (v) => { gNote = v; },
            setGSus: (v) => { gSus = v; },
            setGBeat: (v) => { gBeat = v; },
            setGTapChevron: (v) => { gTapChevron = v; },
            setGLanePlane: (v) => { gLanePlane = v; },
            setGSusRail: (v) => { gSusRail = v; },
            setGSusRailBloom: (v) => { gSusRailBloom = v; },
            setGTechPlane: (v) => { gTechPlane = v; },
            setGGhostFretPlane: (v) => { gGhostFretPlane = v; },
            setChordFrameGradTex: (v) => { chordFrameGradTex = v; },
            setChordFrameGradTexArp: (v) => { chordFrameGradTexArp = v; },
            getFretTubeGeo: () => fretTubeGeo, setFretTubeGeo: (v) => { fretTubeGeo = v; },
            setFretWireMats: (v) => { fretWireMats = v; },
            setPNote: (v) => { pNote = v; },
            setPNoteEdge: (v) => { pNoteEdge = v; },
            setPAccentHalo: (v) => { pAccentHalo = v; },
            setPSus: (v) => { pSus = v; },
            setPSusOutline: (v) => { pSusOutline = v; },
            setPSusRibbon: (v) => { pSusRibbon = v; },
            setPSusRibbonOl: (v) => { pSusRibbonOl = v; },
            setPLbl: (v) => { pLbl = v; },
            setPBeat: (v) => { pBeat = v; },
            setPSec: (v) => { pSec = v; },
            setPFretLbl: (v) => { pFretLbl = v; },
            setPLane: (v) => { pLane = v; },
            setPLaneDivider: (v) => { pLaneDivider = v; },
            setPGhostFretLbl: (v) => { pGhostFretLbl = v; },
            setPChordBox: (v) => { pChordBox = v; },
            setPChordFrameFill: (v) => { pChordFrameFill = v; },
            setPChordLbl: (v) => { pChordLbl = v; },
            setPBarreLine: (v) => { pBarreLine = v; },
            setPArpBracket: (v) => { pArpBracket = v; },
            setPNoteFretLabel: (v) => { pNoteFretLabel = v; },
            setPTeachMarkLbl: (v) => { pTeachMarkLbl = v; },
            setPConnectorLine: (v) => { pConnectorLine = v; },
            setPDropLine: (v) => { pDropLine = v; },
            setPFretColMarker: (v) => { pFretColMarker = v; },
            setPTapChevron: (v) => { pTapChevron = v; },
            setPHaloBar: (v) => { pHaloBar = v; },
            setPSusRail: (v) => { pSusRail = v; },
            setPSusRailBloom: (v) => { pSusRailBloom = v; },
            setPTechPlane: (v) => { pTechPlane = v; },
            setPPMXFill: (v) => { pPMXFill = v; },
            setPFHXFill: (v) => { pFHXFill = v; },
            setPMuteXLines: (v) => { pMuteXLines = v; },
            setPFHXLines: (v) => { pFHXLines = v; },
            setImPMTech: (v) => { imPMTech = v; },
            setImFHTech: (v) => { imFHTech = v; },
            setImGPMTech: (v) => { _imGPMTech = v; },
            setImGFHTech: (v) => { _imGFHTech = v; },
            setImPMTechMat: (v) => { _imPMTechMat = v; },
            setImFHTechMat: (v) => { _imFHTechMat = v; },
            setImPMXFill: (v) => { imPMXFill = v; },
            setImPMXLines: (v) => { imPMXLines = v; },
            setImFHXFill: (v) => { imFHXFill = v; },
            setImFHXLines: (v) => { imFHXLines = v; },
            setImPMXFillMat: (v) => { _imPMXFillMat = v; },
            setImPMXLinesMat: (v) => { _imPMXLinesMat = v; },
            setImFHXFillMat: (v) => { _imFHXFillMat = v; },
            setImFHXLinesMat: (v) => { _imFHXLinesMat = v; },
            setImM4: (v) => { _imM4 = v; },
            setImPos: (v) => { _imPos = v; },
            setImSca: (v) => { _imSca = v; },
            setImQ: (v) => { _imQ = v; },
            setImAZ: (v) => { _imAZ = v; },
            setImColor: (v) => { _imColor = v; },
            setFwHitColor: (v) => { _fwHitColor = v; },
            setFwHitEmissive: (v) => { _fwHitEmissive = v; },
            setFwHitPrevTime: (v) => { _fwHitPrevTime = v; },
            setSparks: (v) => { _sparks = v; },
            setHitFx: (v) => { _hitFx = v; },
            setCinematic: (v) => { _cinematic = v; },
            setVerdictMarks: (v) => { _verdictMarks = v; },
            setTimingFx: (v) => { _timingFx = v; },
            setStreakFx: (v) => { _streakFx = v; },
            setBloom: (v) => { _bloom = v; },
            setBloomGaussTex: (v) => { _bloomGaussTex = v; },
            setActivePalette: (v) => { activePalette = v; },
            setCameraSmoothing: (v) => { cameraSmoothing = v; },
            setZoomSmoothing: (v) => { zoomSmoothing = v; },
            setTiltSmoothing: (v) => { tiltSmoothing = v; },
            setCameraLockLow: (v) => { cameraLockLow = v; },
            setCameraLockZoom: (v) => { cameraLockZoom = v; },
            setCameraMode: (v) => { cameraMode = v; },
            setTextSize: (v) => { textSize = v; },
            setVibrancy: (v) => { vibrancy = v; },
            setGlowMul: (v) => { glowMul = v; },
            setFpsVisible: (v) => { fpsVisible = v; },
            setVibrancyIdleOp: (v) => { _vibrancyIdleOp = v; },
            setVibrancyProjOp: (v) => { _vibrancyProjOp = v; },
            setShowFretOnNote: (v) => { showFretOnNote = v; },
            setFretNumberGhostScope: (v) => { fretNumberGhostScope = v; },
            setFretColumnMarkerCadence: (v) => { fretColumnMarkerCadence = v; },
            setSectionLabelsOnHighway: (v) => { sectionLabelsOnHighway = v; },
            setSectionHudVisible: (v) => { sectionHudVisible = v; },
            setSectionHudPosition: (v) => { sectionHudPosition = v; },
            setSectionHudSize: (v) => { sectionHudSize = v; },
            setToneHudVisible: (v) => { toneHudVisible = v; },
            setToneHudPosition: (v) => { toneHudPosition = v; },
            setToneHudSize: (v) => { toneHudSize = v; },
            setChordDiagramVisible: (v) => { chordDiagramVisible = v; },
            setChordDiagramPosition: (v) => { chordDiagramPosition = v; },
            setChordDiagramSize: (v) => { chordDiagramSize = v; },
            setFretDividersVisible: (v) => { fretDividersVisible = v; },
            setTuningLabelsVisible: (v) => { tuningLabelsVisible = v; },
            setProjectionVisible: (v) => { projectionVisible = v; },
            setSlideArrowApproachVisible: (v) => { slideArrowApproachVisible = v; },
            setSlideArrowNeckVisible: (v) => { slideArrowNeckVisible = v; },
            setSlideArrowChainPreviewVisible: (v) => { slideArrowChainPreviewVisible = v; },
            setBoardStringStartX: (v) => { boardStringStartX = v; },
            setBoardTuningLabelX: (v) => { boardTuningLabelX = v; },
            getNdOnHit: () => _ndOnHit, setNdOnHit: (v) => { _ndOnHit = v; },
            getNdOnMiss: () => _ndOnMiss, setNdOnMiss: (v) => { _ndOnMiss = v; },
            getNdOnBusHit: () => _ndOnBusHit, setNdOnBusHit: (v) => { _ndOnBusHit = v; },
            getNdOnBusMiss: () => _ndOnBusMiss, setNdOnBusMiss: (v) => { _ndOnBusMiss = v; },
            getNdHitMarks: () => _ndHitMarks, setNdHitMarks: (v) => { _ndHitMarks = v; },
            getNdMissMarks: () => _ndMissMarks, setNdMissMarks: (v) => { _ndMissMarks = v; },
            setBgLastT: (v) => { _bgLastT = v; },
            setLastOpenStringLblSig: (v) => { _lastOpenStringLblSig = v; },
        });

        /* ── String glow (called each frame) ────────────────────────────── */
        /* ── h3d-carve-11: R-section (string glow) → src/string-glow.js ── */
        const { updateStringHighlights } = createStringGlow({
            VENUE_GEM_EMISSIVE_MUL,
            getGlowMul:            () => glowMul,
            getVibrancyIdleOp:     () => _vibrancyIdleOp,
            getVenueSceneOverride: () => _venueSceneOverride,
            getNStr:               () => nStr,
            getStringLines:        () => stringLines,
            getMGlow:              () => mGlow,
            getMAccentCore:        () => mAccentCore,
        });

        /* ── h3d-carve-13: S-section lookahead helpers → src/camera.js ──── */
        // lookaheadEndTime (private), lookaheadBootstrapTime, lookaheadComputeFretBounds,
        // lookaheadTargetWorldX extracted below in the createCamera() destructure.


        // h3d-carve-15 F2: _setLabelMap must be in scope before both createNoteRenderer
        // and createRenderer wiring calls; defined here, passed as DI to both factories.
        // See renderer.js DI comment for the full explanation.
        function _setLabelMap(sprite, srcMat) {
            const m = sprite.material;
            if (m.map === srcMat.map) return;
            const nullnessChanged = (m.map == null) !== (srcMat.map == null);
            m.map = srcMat.map;
            if (nullnessChanged) m.needsUpdate = true;
        }

        /* ── h3d-carve-14: V-section (note renderer) → src/note-renderer.js ── */
        const { drawNote, drawArpBrackets, drawNotedetectLabels, chordHarmonyLabels } = createNoteRenderer({
            // ── Constants ──────────────────────────────────────────────────
            K, NFRETS, NW, NH, AHEAD,
            GHOST_HOLD_AFTER_ONSET, NEXT_ON_STRING_T_EPS, NOTEDETECT_GEM_VERDICT_WINDOW,
            SLIDE_RIBBON_SAMPLES, S_GAP,
            BEND_HALFSTEP_WORLD_Y, PROJ_GROW_MIN,
            GHOST_FRET_LBL_FADE_S,
            BEND_ENV_RISE_FRAC, BEND_ENV_RELEASE_FRAC,
            VIBRATO_HALF_WAVE_S, TREMOLO_BUMP_S,
            ACCENT_RIM_XY_SCALE_MUL, ACCENT_RIM_Z_SCALE_MUL,
            CHORD_FRAME_RIM_FRAC_H, CHORD_FRAME_RIM_MIN,
            FRET_LABEL_GOLD_HEX, SINGLE_SUS_OFFSETS,
            TS, _ND_TIME_EPS,
            // ── Function refs ──────────────────────────────────────────────
            slideOffsetWorldX, hwyPostHitTailFadeMul, anchorLaneBoundsAt,
            validString, sY, xFretMid,
            _firstEventTimeGreaterThan, _setLabelMap,
            _spriteMat2MeshMat, _meshMatForGhostFretDigit,
            fretLabelScaleForFret, fretMid,
            txtMat, darkenHex,
            palmMuteXSpriteMat, fretHandMuteXSpriteMat,
            triMat, bendChevronMat, slideArrowMat,
            pinchHarmonicMat, naturalHarmonicMat,
            _timingHex, _sparkBurst, _fxSpawnPop,
            // ── Frame-state getters ────────────────────────────────────────
            getLeftyCached: () => _leftyCached,
            getInvertedCached: () => _invertedCached,
            getDrawNextByString: () => _drawNextByString,
            getDrawRecentByString: () => _drawRecentByString,
            getDrawAnchors: () => _drawAnchors,
            getDrawChordTemplates: () => _drawChordTemplates,
            getDrawTeachingMarks: () => _drawTeachingMarks,
            getShowFingerHints: () => _showFingerHints,
            getTextSizeMul: () => _textSizeMul,
            getNdGetNoteState: () => _ndGetNoteState,
            getNdHasProvider: () => _ndHasProvider,
            getNdHitMarks: () => _ndHitMarks,
            getNdMissMarks: () => _ndMissMarks,
            getNdLabels: () => _ndLabels,
            getCam: () => cam,
            getProbe: () => _probe,
            getCurX: () => curX,
            getNStr: () => nStr,
            getAccentShellsByString: () => _accentShellsByString,
            // ── Verdict getters/setters ────────────────────────────────────
            getNdVerdictMaxAlpha: () => _ndVerdictMaxAlpha,
            setNdVerdictSawAlpha: (v) => { _ndVerdictSawAlpha = v; },
            setNdVerdictMaxAlpha: (v) => { _ndVerdictMaxAlpha = v; },
            // ── Streak getter/setter ───────────────────────────────────────
            getStreakHits: () => _streakHits,
            setStreakHits: (v) => { _streakHits = v; },
            // ── Additional frame-state getters ─────────────────────────────
            getGNote: () => gNote,
            getGNoteGrad: () => gNoteGrad,
            getActivePalette: () => activePalette,
            getHitFx: () => _hitFx,
            getSparks: () => _sparks,
            getVerdictMarks: () => _verdictMarks,
            getStreakFx: () => _streakFx,
            getStreakHeat: () => _streakHeat,
            getSlideArrowApproachVisible: () => slideArrowApproachVisible,
            getSlideArrowNeckVisible: () => slideArrowNeckVisible,
            getSlideArrowChainPreviewVisible: () => slideArrowChainPreviewVisible,
            getVibrancyProjOp: () => _vibrancyProjOp,
            getFretLabelAllowed: () => _fretLabelAllowed,
            getProjMeshArr: () => projMeshArr,
            getProjectionVisible: () => projectionVisible,
            getGlowMul: () => glowMul,
            getShowFretOnNote: () => showFretOnNote,
            getFretNumberGhostScope: () => fretNumberGhostScope,
            // ── Pool getters ───────────────────────────────────────────────
            getPNote: () => pNote,
            getPNoteEdge: () => pNoteEdge,
            getPSus: () => pSus,
            getPSusOutline: () => pSusOutline,
            getPSusRibbon: () => pSusRibbon,
            getPSusRibbonOl: () => pSusRibbonOl,
            getPTapChevron: () => pTapChevron,
            getPAccentHalo: () => pAccentHalo,
            getPArpBracket: () => pArpBracket,
            getPConnectorLine: () => pConnectorLine,
            getPDropLine: () => pDropLine,
            getPGhostFretLbl: () => pGhostFretLbl,
            getPNoteFretLabel: () => pNoteFretLabel,
            getPTeachMarkLbl: () => pTeachMarkLbl,
            getPTechPlane: () => pTechPlane,
            // ── Material getters ───────────────────────────────────────────
            getMStr: () => mStr,
            getMGlow: () => mGlow,
            getMSus: () => mSus,
            getMSusOutline: () => mSusOutline,
            getMHitBright: () => mHitBright,
            getMHitBrightArrays: () => mHitBrightArrays,
            getMmissOutline: () => mMissOutline,
            getMmissEdgeArrays: () => mMissEdgeArrays,
            getMRimFlash: () => mRimFlash,
            getMAccentHaloNear: () => mAccentHaloNear,
            getMAccentOutline: () => mAccentOutline,
            getMAccentCore: () => mAccentCore,
            getMStrHitOutline: () => mStrHitOutline,
            getMHitSusOutline: () => mHitSusOutline,
            getMWhiteOutline: () => mWhiteOutline,
            // ── Stable refs (by-ref mutate only, never reassigned) ─────────
            _susVerdictLatch,
            _fwHitIn, _fwChordAcc, _scrGhostUpcomingCount,
            _rimFlashIn, _sparkSeen, _frameLabeledKeys,
        });


        /* ── h3d-carve-10: drawScoreFx → src/score-fx.js ────────────────── */

        /* ── h3d-carve-9: W-section (camera lerp) → src/camera.js ─────── */
        const { effectiveVfov, camUpdate, lookaheadBootstrapTime, lookaheadComputeFretBounds, lookaheadTargetWorldX } = createCamera({
            // Constants
            BASE_VFOV, HORPLUS_START_ASPECT, HORPLUS_MIN_VFOV,
            CAM_LERP_BASE, CAM_H_BASE, CAM_DIST_BASE,
            CAM_FRAME_DIST_NEAR, CAM_FRAME_DIST_FAR,
            CAM_FRAME_H_NEAR, CAM_FRAME_H_FAR,
            CAM_FRAME_D_NEAR, CAM_FRAME_D_FAR,
            FOCUS_D, S_GAP, K,
            FRET_ROW_FIT_NDC_MIN, FRET_ROW_FIT_DEADBAND, FRET_ROW_FIT_BOOST_MAX,
            CAM_TILT_BAND_T, CAM_TILT_BAND_C, CAM_TILT_STR_T, CAM_TILT_STR_C,
            // Live-accessor getters
            getCam: () => cam,
            getTgtX: () => tgtX, getTgtDist: () => tgtDist,
            getAspectScale: () => aspectScale, getLeftyCached: () => _leftyCached,
            getNStr: () => nStr, getProbe: () => _probe,
            getTiltSmoothing: () => tiltSmoothing,
            getPaneAspect: () => _paneAspect, getPaneUid: () => _paneUid,
            getHighwayCanvas: () => highwayCanvas,
            // Getter+setter pairs (write-backs)
            getCurX: () => curX, setCurX: (v) => { curX = v; },
            getCurDist: () => curDist, setCurDist: (v) => { curDist = v; },
            getCurLookY: () => curLookY, setCurLookY: (v) => { curLookY = v; },
            getTgtLookY: () => tgtLookY, setTgtLookY: (v) => { tgtLookY = v; },
            getFretRowFitBoost: () => _fretRowFitBoost, setFretRowFitBoost: (v) => { _fretRowFitBoost = v; },
            // Function refs
            sY,
            freeCamFor: _freeCamFor,
            aspectPaneKey: _aspectPaneKey,
            resolveTuneFor: _resolveTuneFor,
            aspectRegisterPane: _aspectRegisterPane,
            // h3d-carve-13: S-section lookahead (+9 DI params)
            NFRETS, CAM_LOOKAHEAD_MEASURES, CAM_LOOKAHEAD_SEC, CAM_FRET_EDGE_BLEND,
            getMeasureStarts: () => _measureStarts,
            validString, getChartAnchorAt, xFretMid, xFret,
        });

        /* ── h3d-carve-12: T-section (arpeggio inference) → src/arp.js ─────── */
        const {
            chordWireHighDensity,
            chordTemplateLabel,
            chordTemplateMarkedArpeggio,
            chordHandShapeArpeggioHint,
            mergeHandShapeSynthChords,
            mergeChordShape,
            resetChordShapeCache,
            inferArpeggioFromNotePattern,
            chordShapeCoveredByStandaloneNotes,
            hsStart,
            hsEnd,
            handShapeChartSpanSec,
            fillArpeggioGhostInferFlags,
            arpeggioChordIdForNoteWithInferCache,
            arpHsBoundsForNote,
            fillLaneRailHandShapeFlags,
            fillArpeggioRailShapeBoundsCaches,
            arpeggioLaneOuterRailLaneSlice,
            arpeggioLaneOuterRailAtChartTime,
            arpeggioLaneDividerFrameAccentMul,
            arpeggioLaneDividerXYScaleMatchFrameRim,
        } = createArp({
            validString,
            filterValidNotes,
            sY,
            K,
            S_GAP,
            BEHIND,
            CHORD_FRAME_RIM_MIN,
            CHORD_FRAME_RIM_FRAC_H,
            ARP_FRAME_ONSET_PAD_S,
            ARP_FRAME_ONSET_CLUSTER_S,
            ARP_INFER_MIN_HAND_SHAPE_SPAN_S,
            ARP_INFER_STRUM_VS_ARP_SPREAD_MIN_S,
            ARP_INFER_MULTI_STRUM_HIT_SLACK,
            ARP_INFER_MULTI_STRUM_WIN_MIN_S,
            ARP_INFER_MIN_HITS_VS_SHAPE_CAP,
            ARP_HWY_RAIL_END_TAIL_S,
            ARP_HWY_RAIL_START_LEAD_S,
            NEXT_ON_STRING_T_EPS,
            getNStr: () => nStr,
        });
        // h3d-carve-12: _resetStringDependentCaches stays here; only _chordShapeCache
        // moved to src/arp.js. Calls resetChordShapeCache() instead of direct assignment.
        function _resetStringDependentCaches() {
            _filterValidNotesCache = new WeakMap();
            _chordSigCache = new WeakMap();
            resetChordShapeCache(); // h3d-carve-12: _chordShapeCache moved to src/arp.js
            _mergeCacheResult = null;
        }

        /* ── h3d-carve-15: U-section (per-frame renderer) → src/renderer.js ─ */
        // lookaheadSmoothCamStep, _applyNoteCamTargets, _buildFretLabelSet,
        // smoothNow, _setLabelMap, _prewarmStatic, _prewarmChart, update()
        // extracted to src/renderer.js (createRenderer factory).
        // HONEST GAPS: _prewarmStatic/_prewarmChart need ren.compile() — documented
        // in renderer.js with ponytail: comments.
        const { update, _prewarmStatic, _prewarmChart } = createRenderer({
            // ── Consts ─────────────────────────────────────────────────────
            K, NFRETS, NW, NH, AHEAD, BEHIND, S_GAP,
            CAM_FOCUS_BLEND_RATE,
            CAM_LOCK_ZOOM_MIN, CAM_LOCK_ZOOM_MAX, CAM_LOCK_CENTER_FRET,
            LOOKAHEAD_LOCK_ENGAGE_MAXF, LOOKAHEAD_LOCK_RELEASE_MAXF,
            DEFAULT_LOOKAHEAD_FRET_SPAN,
            FRET_WIDTH_MID, CAM_TGT_BEHIND, CAM_DIST_BASE,
            VENUE_GEM_EMISSIVE_MUL, NOTEDETECT_GEM_VERDICT_WINDOW,
            INLAY_LABEL_FRETS,
            GHOST_HOLD_AFTER_ONSET,
            CHORD_FRAME_RIM_MIN, CHORD_FRAME_RIM_FRAC_H,
            TS, S_BASE, FRET_LABEL_GOLD_HEX, FRET_LABEL_IDLE_HEX,
            // ── Fn-refs ─────────────────────────────────────────────────────
            sY, xFret, xFretMid, fretLabelScaleForFret, pbBeg, pbEnd, pbReportTick,
            hwyFirstRelevantFrettedTime, _syncOpenStringPitchLabels, txtMat, _setLabelMap,
            // createNoteRenderer outputs:
            drawNote, drawArpBrackets, chordHarmonyLabels,
            // createCamera outputs:
            camUpdate,
            lookaheadBootstrapTime, lookaheadComputeFretBounds, lookaheadTargetWorldX,
            // createArp outputs:
            chordWireHighDensity, chordTemplateLabel, chordTemplateMarkedArpeggio,
            chordHandShapeArpeggioHint,
            mergeHandShapeSynthChords, mergeChordShape,
            inferArpeggioFromNotePattern, chordShapeCoveredByStandaloneNotes,
            hsStart, hsEnd, handShapeChartSpanSec, fillArpeggioGhostInferFlags,
            arpeggioChordIdForNoteWithInferCache, arpHsBoundsForNote,
            fillLaneRailHandShapeFlags, fillArpeggioRailShapeBoundsCaches,
            arpeggioLaneOuterRailLaneSlice, arpeggioLaneOuterRailAtChartTime,
            arpeggioLaneDividerFrameAccentMul, arpeggioLaneDividerXYScaleMatchFrameRim,
            // Other fn-refs:
            validString, filterValidNotes,
            // ── Pool getters (all 33) ────────────────────────────────────────
            getPNote:          () => pNote,
            getPNoteEdge:      () => pNoteEdge,
            getPSus:           () => pSus,
            getPSusOutline:    () => pSusOutline,
            getPSusRibbon:     () => pSusRibbon,
            getPSusRibbonOl:   () => pSusRibbonOl,
            getPTapChevron:    () => pTapChevron,
            getPAccentHalo:    () => pAccentHalo,
            getPLbl:           () => pLbl,
            getPArpBracket:    () => pArpBracket,
            getPBeat:          () => pBeat,
            getPSec:           () => pSec,
            getPFretLbl:       () => pFretLbl,
            getPLane:          () => pLane,
            getPLaneDivider:   () => pLaneDivider,
            getPGhostFretLbl:  () => pGhostFretLbl,
            getPChordBox:      () => pChordBox,
            getPChordFrameFill:() => pChordFrameFill,
            getPChordLbl:      () => pChordLbl,
            getPBarreLine:     () => pBarreLine,
            getPHaloBar:       () => pHaloBar,
            getPPMXFill:       () => pPMXFill,
            getPFHXFill:       () => pFHXFill,
            getPMuteXLines:    () => pMuteXLines,
            getPFHXLines:      () => pFHXLines,
            getPNoteFretLabel: () => pNoteFretLabel,
            getPConnectorLine: () => pConnectorLine,
            getPDropLine:      () => pDropLine,
            getPTeachMarkLbl:  () => pTeachMarkLbl,
            getPFretColMarker: () => pFretColMarker,
            getPSusRail:       () => pSusRail,
            getPSusRailBloom:  () => pSusRailBloom,
            getPTechPlane:     () => pTechPlane,
            // ── Material / emissive getters ──────────────────────────────────
            getMHitBright:       () => mHitBright,
            getMHitSusOutline:   () => mHitSusOutline,
            getGlowMul:          () => _glowMul,
            getVenueSceneOverride: () => _venueSceneOverride,
            getProjMeshArr:      () => projMeshArr,
            // ── Render settings getters ──────────────────────────────────────
            getTextSize:         () => _textSize,
            getCameraMode:       () => _cameraMode,
            getCameraSmoothing:  () => _cameraSmoothing,
            getZoomSmoothing:    () => _zoomSmoothing,
            getCameraLockLow:    () => _cameraLockLow,
            getCameraLockZoom:   () => _cameraLockZoom,
            getNStr:             () => nStr,
            getLeftyCached:      () => _leftyCached,
            getInverted:         () => _inverted,
            // ── Camera state getters ─────────────────────────────────────────
            getTgtX:             () => tgtX,
            getTgtDist:          () => tgtDist,
            getCurX:             () => curX,
            getPrevLowFretBonus: () => prevLowFretBonus,
            getPrevLockActive:   () => prevLockActive,
            // ── Lookahead / clock state getters ─────────────────────────────
            getLookaheadCamX:        () => _lookaheadCamX,
            getLookaheadFretSpan:     () => _lookaheadFretSpan,
            getLookaheadLowBonusU:    () => _lookaheadLowBonusU,
            getLookaheadHiNeckLatch:  () => _lookaheadHiNeckLatch,
            getLookaheadCamPrevNow:   () => _lookaheadCamPrevNow,
            getFrameNow:         () => _frameNow,
            getClkAudioT:        () => _clkAudioT,
            getClkPerf:          () => _clkPerf,
            getClkRate:          () => _clkRate,
            // ── Bootstrap / song-key getters ────────────────────────────────
            getCamSnapped:           () => _camSnapped,
            getCamPreScanned:        () => _camPreScanned,
            getCamBootstrapHolding:  () => _camBootstrapHolding,
            getCamBootstrapMode:     () => _camBootstrapMode,
            getSongKey:              () => _songKey,
            // ── ND / verdict state getters ───────────────────────────────────
            getNdVerdictSawAlpha:    () => _ndVerdictSawAlpha,
            getNdVerdictMaxAlpha:    () => _ndVerdictMaxAlpha,
            getNdFrameNowMs:         () => _ndFrameNowMs,
            // ── Per-frame state getters ──────────────────────────────────────
            getInlayLabels:          () => _inlayLabels,
            getLeanSusPollCounter:   () => _leanSusPollCounter,
            getLeanSus:              () => _leanSus,
            getTextSizeMul:          () => _textSizeMul,
            getTextSizeMulApplied:   () => _textSizeMulApplied,
            getImPMTechCount:        () => _imPMTechCount,
            getImFHTechCount:        () => _imFHTechCount,
            getMeasureStartsRef:     () => _measureStartsRef,
            // ── Stable object refs ───────────────────────────────────────────
            _frameLabeledKeys, _ndLabels, _scrGhostUpcomingCount,
            _ndHitMarks, _ndMissMarks,
            // ── Setters (beyond-subst write-backs) ──────────────────────────
            setNdVerdictSawAlpha:  (v) => { _ndVerdictSawAlpha  = v; },
            setNdVerdictMaxAlpha:  (v) => { _ndVerdictMaxAlpha  = v; },
            setNdFrameNowMs:       (v) => { _ndFrameNowMs       = v; },
            setLeanSus:            (v) => { _leanSus            = v; },
            setLeanSusPollCounter: (v) => { _leanSusPollCounter = v; },
            setTextSizeMul:        (v) => { _textSizeMul        = v; },
            setTextSizeMulApplied: (v) => { _textSizeMulApplied = v; },
            setImPMTechCount:      (v) => { _imPMTechCount      = v; },
            setImFHTechCount:      (v) => { _imFHTechCount      = v; },
            setImPMXFillCount:     (v) => { _imPMXFillCount     = v; },
            setImPMXLinesCount:    (v) => { _imPMXLinesCount    = v; },
            setImFHXFillCount:     (v) => { _imFHXFillCount     = v; },
            setImFHXLinesCount:    (v) => { _imFHXLinesCount    = v; },
            setLookaheadCamX:      (v) => { _lookaheadCamX      = v; },
            setLookaheadFretSpan:  (v) => { _lookaheadFretSpan  = v; },
            setLookaheadCamPrevNow:(v) => { _lookaheadCamPrevNow= v; },
            setLookaheadHiNeckLatch:(v)=> { _lookaheadHiNeckLatch= v; },
            setLookaheadLowBonusU: (v) => { _lookaheadLowBonusU = v; },
            setTgtX:               (v) => { tgtX                = v; },
            setTgtDist:            (v) => { tgtDist             = v; },
            setPrevLowFretBonus:   (v) => { prevLowFretBonus    = v; },
            setPrevLockActive:     (v) => { prevLockActive      = v; },
            setCurX:               (v) => { curX                = v; },
            setCurDist:            (v) => { curDist             = v; },
            setSongKey:            (v) => { _songKey            = v; },
            setCamSnapped:         (v) => { _camSnapped         = v; },
            setCamPreScanned:      (v) => { _camPreScanned      = v; },
            setCamBootstrapHolding:(v) => { _camBootstrapHolding= v; },
            setCamBootstrapMode:   (v) => { _camBootstrapMode   = v; },
            setMeasureStarts:      (v) => { _measureStarts      = v; },
            setMeasureStartsRef:   (v) => { _measureStartsRef   = v; },
            setClkAudioT:          (v) => { _clkAudioT          = v; },
            setClkPerf:            (v) => { _clkPerf            = v; },
            setClkRate:            (v) => { _clkRate            = v; },
            setFrameNow:           (v) => { _frameNow           = v; },
            // ── Category B — plain consts ──────────────────────────────────────
            ACCENT_NOTE_FILL_BOOST, ACCENT_NOTE_LINGER_EPS, ACCENT_NOTE_STR_GLOW,
            ARPEGGIO_RIM_BLUE_HEX, ARP_FRAME_ONSET_CLUSTER_S, ARP_FRAME_ONSET_PAD_S,
            ARP_INFER_MIN_HAND_SHAPE_SPAN_S,
            CAM_DIST_HYST_C, CAM_DIST_HYST_T, CAM_TGT_AHEAD_C, CAM_TGT_AHEAD_T,
            CAM_TGT_HYST_C, CAM_TGT_HYST_T, CAM_TGT_TAU_C, CAM_TGT_TAU_T,
            CHORD_BOX_EDGE_ALPHA, CHORD_BOX_HIT_BRIGHT_HEX, CHORD_BOX_MISS_DARK_HEX, CHORD_BOX_TEAL_HEX,
            CHORD_FRAME_RIM_Z_MIN, CHORD_FRAME_RIM_Z_SCAL,
            CHORD_HWY_FADE_S, CHORD_HWY_LINGER_S,
            DIAG_CROSSFADE_S, DIAG_ENTRANCE_S, DIAG_LINGER_S, DOTS,
            FRET_COOLDOWN, FRET_EMISSIVE,
            FRET_WIRE_ACTIVE_HEX, FRET_WIRE_ACTIVE_OP, FRET_WIRE_HIT_DECAY, FRET_WIRE_HIT_INTENSITY,
            FRET_WIRE_HIT_OP, FRET_WIRE_IDLE_HEX, FRET_WIRE_IDLE_OP,
            HWY_LANE_STRIPE_OP_BASE, HWY_LANE_STRIPE_OP_INT, HWY_LANE_TIME_SLICES,
            NEXT_ON_STRING_T_EPS, _ND_UNMATCHED_LATCH_AFTER, VENUE_LANE_OP_BOOST,
            _CV_KEY_TIME_MUL, _CV_KEY_TIME_SLOT,
            MAX_RENDER_STRINGS,
            // ── Category C — fn-refs / let-vars ────────────────────────────────
            activePalette, anchorLaneBoundsAt, anchorPlayedFretSpanAt,
            boardSpanX, chordShapeSignature,
            // Shared-mutable-state pairs: update() writes via setters;
            // createNoteRenderer's get* closures read the same screen.js lets.
            getDrawAnchors: () => _drawAnchors,
            setDrawAnchors: (v) => { _drawAnchors = v; },
            getDrawChordTemplates: () => _drawChordTemplates,
            setDrawChordTemplates: (v) => { _drawChordTemplates = v; },
            getDrawNextByString: () => _drawNextByString,
            setDrawNextByString: (v) => { _drawNextByString = v; },
            getDrawRecentByString: () => _drawRecentByString,
            setDrawRecentByString: (v) => { _drawRecentByString = v; },
            getDrawTeachingMarks: () => _drawTeachingMarks,
            setDrawTeachingMarks: (v) => { _drawTeachingMarks = v; },
            getShowFingerHints: () => _showFingerHints,
            setShowFingerHints: (v) => { _showFingerHints = v; },
            _encodeChordVerdictKey, _firstEventTimeGreaterThan,
            fretColumnMarkerCadence, fretColumnMarkersForAnchor, fretDividersVisible,
            fretLastActiveTime, _fretMarkerWaveCache, fretWireMats, fretX,
            getChartAnchorAt, hwyPostHitTailFadeMul,
            imFHTech, imFHXFill, imFHXLines, imPMTech, imPMXFill, imPMXLines,
            laneBoundsFromAnchor, sectionLabelsOnHighway, updateStringHighlights,
            _noteKey,
            bendChevronMat, darkenHex, slideArrowMat, triMat,
            palmMuteXSpriteMat, fretHandMuteXSpriteMat,
            fxClearSeen,
            // ── Category D — Three.js render objects (reassigned) ───────────────
            getRen:          () => ren,
            getScene:        () => scene,
            getCam:          () => cam,
            // ── Category E — shared mutable state (getter/setter) ───────────────
            getDiagChord:            () => _diagChord,
            setDiagChord:            (v) => { _diagChord            = v; },
            getDiagEntranceT:        () => _diagEntranceT,
            setDiagEntranceT:        (v) => { _diagEntranceT        = v; },
            getDiagLastKey:          () => _diagLastKey,
            setDiagLastKey:          (v) => { _diagLastKey          = v; },
            getDiagPrev:             () => _diagPrev,
            setDiagPrev:             (v) => { _diagPrev             = v; },
            getDiagPrevOpacity:      () => _diagPrevOpacity,
            setDiagPrevOpacity:      (v) => { _diagPrevOpacity      = v; },
            getDiagPrevStartOpacity: () => _diagPrevStartOpacity,
            setDiagPrevStartOpacity: (v) => { _diagPrevStartOpacity = v; },
            getDiagPrevStartT:       () => _diagPrevStartT,
            setDiagPrevStartT:       (v) => { _diagPrevStartT       = v; },
            getMergeCacheResult:     () => _mergeCacheResult,
            setMergeCacheResult:     (v) => { _mergeCacheResult     = v; },
            _scrEventTimes,
            getScrEventTimesLen:     () => _scrEventTimesLen,
            setScrEventTimesLen:     (v) => { _scrEventTimesLen     = v; },
            getSlideTargetChordsRef: () => _slideTargetChordsRef,
            setSlideTargetChordsRef: (v) => { _slideTargetChordsRef = v; },
            getSlideTargetNotesRef:  () => _slideTargetNotesRef,
            setSlideTargetNotesRef:  (v) => { _slideTargetNotesRef  = v; },
            getSlideTargetSet:       () => _slideTargetSet,
            setSlideTargetSet:       (v) => { _slideTargetSet       = v; },
            // ── Category F — shared mutable (stable refs + getters) ─────────────
            _fwChordAcc, _fwHitGlow, _fwHitIn, _rimFlashIn, _susVerdictLatch,
            getFwHitColor:           () => _fwHitColor,
            getFwHitEmissive:        () => _fwHitEmissive,
            getFwHitPrevTime:        () => _fwHitPrevTime,
            setFwHitPrevTime:        (v) => { _fwHitPrevTime        = v; },
            getMBeatM:               () => mBeatM,
            getMBeatQ:               () => mBeatQ,
            getMRimFlash:            () => mRimFlash,
            // ── Category G — lane materials (reassigned) ─────────────────────────
            getMLaneDivider:         () => mLaneDivider,
            getMLaneDividerArp:      () => mLaneDividerArp,
            getMLaneDividerExt:      () => mLaneDividerExt,
            getMLaneEven:            () => mLaneEven,
            getMLaneOdd:             () => mLaneOdd,
            // ── Extra ──────────────────────────────────────────────────────────
            getChordFrameGradTex:    () => chordFrameGradTex,
            getChordFrameGradTexArp: () => chordFrameGradTexArp,
        });


        /* ── Resize helper ───────────────────────────────────────────────── */
        function applySize(w, h) {
            if (!ren || !cam || !wrap) return;
            if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
            const baseDPR = _ssActive() ? Math.min(devicePixelRatio, 1.25) : Math.min(devicePixelRatio, 2);
            ren.setPixelRatio(_renderScale * baseDPR);
            ren.setSize(w, h);
            // Pin the overlay to #highway's exact box so it fully covers the
            // canvas. The wrap is anchored to top:0/left:0/right:0 of its
            // offset parent, which only lines up with #highway when the
            // canvas sits at the parent's origin. The v3 player can place
            // chrome above the canvas, shifting the wrap up so its lower edge
            // falls short of #highway — leaving a strip of the canvas exposed
            // (the reported gap, where the previous renderer's frame showed
            // through). The wrap is a sibling of highwayCanvas, so they share
            // an offset parent; tracking the canvas's box keeps the overlay
            // flush in single-player and splitscreen alike.
            //
            // Derive the box from the SAME getBoundingClientRect measurements
            // that drive ren.setSize(w, h) — NOT integer offsetTop/Width — so
            // the overlay matches the renderer exactly. Under browser zoom or
            // fractional flex layouts the canvas lands on sub-pixel bounds;
            // offsetWidth/Top round to whole pixels and would leave the wrap up
            // to 1px short of (or shifted from) the canvas, reopening the
            // exposed edge strip. Position is taken relative to the containing
            // block's padding edge (clientTop/Left strip the parent's border),
            // which is what `top`/`left` resolve against for the absolutely
            // positioned wrap. Guarded on a laid-out canvas (offsetWidth/Height
            // > 0); otherwise fall back to the static top:0/left:0/right:0.
            if (highwayCanvas && highwayCanvas.offsetWidth > 0 && highwayCanvas.offsetHeight > 0) {
                const _pinParent = wrap.offsetParent || highwayCanvas.parentNode;
                const _cr = highwayCanvas.getBoundingClientRect();
                const _pr = _pinParent ? _pinParent.getBoundingClientRect() : { top: 0, left: 0 };
                const _pbTop = _pinParent ? _pinParent.clientTop : 0;
                const _pbLeft = _pinParent ? _pinParent.clientLeft : 0;
                wrap.style.top = (_cr.top - _pr.top - _pbTop) + 'px';
                wrap.style.left = (_cr.left - _pr.left - _pbLeft) + 'px';
                wrap.style.right = 'auto';
                wrap.style.width = _cr.width + 'px';
                wrap.style.height = _cr.height + 'px';
                _wrapPinned = true;
            } else {
                // Canvas not laid out (e.g. init ran before #highway had a real
                // box, or a panel hide/show where canvasSize() falls back to the
                // parent panel). Reset to the static anchor — if we had pinned
                // before, the old top/left/right:auto/width would otherwise stay
                // and the wrap would reappear at a stale horizontal position on
                // the next show. Leave _wrapPinned false so the rAF loop re-pins
                // once the canvas materializes again.
                wrap.style.top = '0';
                wrap.style.left = '0';
                wrap.style.right = '0';
                wrap.style.width = 'auto';
                wrap.style.height = h + 'px';
                _wrapPinned = false;
            }
            if (lyricsCanvas) { lyricsCanvas.width = w; lyricsCanvas.height = h; }
            _diagRenderCache.clear();
            cam.aspect = w / h;
            cam.updateProjectionMatrix();
            aspectScale = Math.max(1, REF_ASPECT / Math.max(cam.aspect, 0.5));
            // Cache the pane aspect for the horizontal-FOV-hold in camUpdate.
            // cam.fov itself is owned by camUpdate (not set here) so live
            // __h3dAspectTune edits apply every frame without a resize.
            _paneAspect = cam.aspect;
            _appliedW = w; _appliedH = h;
        }

        /* ── Teardown ────────────────────────────────────────────────────── */
        function teardown() {
            // Background animations (#13). Drop the listener first so any
            // mid-teardown settings change doesn't try to rebuild a torn-
            // down scene; then dispose the active style's resources.
            if (_bgListener) { _bgUnsubscribe(_bgListener); _bgListener = null; }
            // WebGL context-loss listeners (bound in initScene on ren.domElement).
            // Remove before ren is disposed below so a torn-down instance can't
            // keep firing them; reset the flag so a reused instance starts clean.
            if (ren && ren.domElement) {
                if (_onCtxLost) { try { ren.domElement.removeEventListener('webglcontextlost', _onCtxLost, false); } catch (e) {} }
                if (_onCtxRestored) { try { ren.domElement.removeEventListener('webglcontextrestored', _onCtxRestored, false); } catch (e) {} }
            }
            _onCtxLost = _onCtxRestored = null;
            _ctxLost = false;
            // Notedetect listeners (issue #9). Remove on destroy so a
            // panel that stops doesn't keep accumulating marks. Marks
            // arrays are cleared too — they hold stale chart positions
            // that next init() may reuse (drawNote keys on (s, f, t)).
            if (_ndOnHit) { window.removeEventListener('notedetect:hit', _ndOnHit); _ndOnHit = null; }
            if (_ndOnMiss) { window.removeEventListener('notedetect:miss', _ndOnMiss); _ndOnMiss = null; }
            /* ── h3d-carve-10: score-FX teardown → fxTeardown() in src/score-fx.js */
            fxTeardown();
            if (window.feedBack && typeof window.feedBack.off === 'function') {
                if (_ndOnBusHit)  window.feedBack.off('note:hit', _ndOnBusHit);
                if (_ndOnBusMiss) window.feedBack.off('note:miss', _ndOnBusMiss);
                if (_visibilityHandler) {
                    try { window.feedBack.off('highway:visibility', _visibilityHandler); } catch (e) {}
                }
                if (_canvasReplacedHandler) {
                    try { window.feedBack.off('highway:canvas-replaced', _canvasReplacedHandler); } catch (e) {}
                }
            }
            _ndOnBusHit = _ndOnBusMiss = null;
            _visibilityHandler = null;
            _canvasReplacedHandler = null;
            _ndHitMarks = [];
            _ndMissMarks = [];
            _ndLabels = [];
            _chordVerdicts = new Map();
            if (bcCtrl) { try { bcCtrl.destroy(); } catch (e) {} bcCtrl = null; }
            _bgUnmountStyle();
            bgGroup = null; _bgLastT = 0;
            _diagChord = null; _diagPrev = null; _diagPrevOpacity = 0; _diagPrevStartOpacity = 0; _diagPrevStartT = null;
            _diagEntranceT = 1.0; _diagLastKey = null; _diagRenderCache.clear();

            if (wrap) { wrap.remove(); wrap = null; }
            _disposeOpenStringPitchSprites();
            if (scene) {
                // Don't dispose material.map textures here. Texture
                // lifetime belongs to whoever allocated it; the bg
                // styles' per-layer CanvasTextures (e.g. silhouettes'
                // wrappers around the shared _silCanvas) are released
                // in their own teardowns. txtCache textures are
                // explicitly disposed below; mStr/mGlow/etc. don't have
                // a .map. Disposing here would either double-free or
                // yank a still-in-use texture out from under another
                // mount.
                scene.traverse((obj) => {
                    // fretTubeGeo is shared across all fret meshes — dispose it
                    // exactly once below, not once per mesh here.
                    if (obj.geometry !== fretTubeGeo) obj.geometry?.dispose?.();
                    if (obj.material) {
                        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                        for (const m of mats) m?.dispose?.();
                    }
                });
                // Shared chord-frame fill gradient — not owned by txtCache;
                // MeshBasicMaterial.dispose() does not release maps.
                chordFrameGradTex?.dispose?.();
                chordFrameGradTexArp?.dispose?.();
            }
            gNote?.dispose?.(); gSus?.dispose?.(); gBeat?.dispose?.(); gSusRail?.dispose?.(); gTapChevron?.dispose?.();
            mSusRailBase?.dispose?.(); mSusRailBase = null; gSusRail = null; pSusRail = null;
            gSusRailBloom?.dispose?.(); mSusRailBloomBase?.dispose?.(); _bloomGaussTex?.dispose?.();
            gSusRailBloom = null; mSusRailBloomBase = null; _bloomGaussTex = null; pSusRailBloom = null;
            gTechPlane?.dispose?.(); gTechPlane = null; pTechPlane = null;
            // InstancedMesh disposal — .dispose() releases instanceMatrix / instanceColor
            // GPU buffers. Geometry and material are disposed separately below.
            imPMTech?.dispose?.(); imPMTech = null;
            imFHTech?.dispose?.(); imFHTech = null;
            imPMXFill?.dispose?.(); imPMXFill = null;
            imPMXLines?.dispose?.(); imPMXLines = null;
            imFHXFill?.dispose?.(); imFHXFill = null;
            imFHXLines?.dispose?.(); imFHXLines = null;
            // Geometry clones for PM/FH tech IMs (own instanceAlpha attribute).
            _imGPMTech?.dispose?.(); _imGPMTech = null;
            _imGFHTech?.dispose?.(); _imGFHTech = null;
            // ShaderMaterials for all 6 IMs.
            _imPMTechMat?.dispose?.();  _imPMTechMat = null;
            _imFHTechMat?.dispose?.();  _imFHTechMat = null;
            _imPMXFillMat?.dispose?.(); _imPMXFillMat = null;
            _imPMXLinesMat?.dispose?.(); _imPMXLinesMat = null;
            _imFHXFillMat?.dispose?.(); _imFHXFillMat = null;
            _imFHXLinesMat?.dispose?.(); _imFHXLinesMat = null;
            _imM4 = _imPos = _imSca = _imQ = _imAZ = _imColor = null;
            gHaloBar?.dispose?.(); gHaloBar = null;
            gArpBracket?.dispose?.(); gArpBracket = null;
            for (const m of mStr) m?.dispose?.();
            for (const m of mGlow) m?.dispose?.();
            for (const m of mSus) m?.dispose?.();
            for (const m of mStrHitOutline) m?.dispose?.();
            for (const m of mAccentOutline) m?.dispose?.();
            for (const m of mAccentCore) m?.dispose?.();
            for (const m of mAccentHaloNear) m?.dispose?.();
            for (const m of mAccentHaloMid) m?.dispose?.();
            for (const m of mAccentHaloFar) m?.dispose?.();
            mBeatM?.dispose?.(); mBeatQ?.dispose?.();
            // Notedetect outline materials (#9). May not be reachable
            // via scene.traverse if no event ever fired (never attached
            // to a mesh), so dispose explicitly.
            mMissOutline?.dispose?.();
            mHitSusOutline?.dispose?.();
            mEdgeTransparent?.dispose?.(); mEdgeTransparent = null;
            for (const m of mHitBright) m?.dispose?.(); mHitBright = []; mHitBrightArrays = [];
            for (const m of mRimFlash) m?.dispose?.(); mRimFlash = [];
            for (const k in txtCache) {
                const tm = txtCache[k];
                tm.userData.h3dGhostFretMeshMat?.dispose?.();
                tm.userData.h3dGhostFretMeshMat = null;
                tm.userData.h3dTechMeshMat?.dispose?.();
                tm.userData.h3dTechMeshMat = null;
                tm.map?.dispose();
                tm.dispose();
            }
            // Technique-marker sprite materials (triMat / bendChevronMat) —
            // own numeric-keyed cache, not reachable via txtCache.
            for (const tm of _techMatCache.values()) {
                tm.map?.dispose();
                tm.dispose();
            }
            _techMatCache.clear();
            // Dispose per-sprite cloned materials (e.g. pmMark._pmMat).
            // These aren't reachable via scene.traverse once the sprite
            // gets reassigned a different material, so the array tracks
            // them at allocation time.
            for (const m of _ownedClonedMats) m?.dispose?.();
            _ownedClonedMats.length = 0;
            // Per-mesh technique-marker clones (from _spriteMat2MeshMat).
            // The Set tracks the live clone for each pool mesh; dispose all
            // on teardown so no GPU material leaks between init() cycles.
            for (const m of _techMeshMatClones) m?.dispose?.();
            _techMeshMatClones.clear();
            // Shared pool-factory materials/geometries (mLaneOdd/Even, etc.) —
            // see _ownedSharedMats comment near the declaration. Dispose is
            // idempotent so the scene.traverse() pass above won't double-free.
            for (const m of _ownedSharedMats) m?.dispose?.();
            _ownedSharedMats.length = 0;
            for (const g of _ownedSharedGeos) g?.dispose?.();
            _ownedSharedGeos.length = 0;
            txtCache = {};
            if (_sparkPts) { try { _sparkPts.geometry.dispose(); _sparkPts.material.dispose(); } catch (e) {} _sparkPts = null; }
            if (_composer) { try { _composer.dispose(); if (_bloomPass && _bloomPass.dispose) _bloomPass.dispose(); } catch (e) {} _composer = null; _bloomPass = null; }
            if (ren) { ren.dispose(); ren = null; }
            scene = cam = noteG = beatG = lblG = fretG = tuningLblG = null;
            ambLight = dirLight = null;
            mStr = []; mGlow = []; mSus = []; mStrHitOutline = []; mAccentOutline = []; mAccentCore = []; mAccentHaloNear = []; mAccentHaloMid = []; mAccentHaloFar = []; _accentShellsByString = []; mWhiteOutline = mSusOutline = null; mMissOutline = null; mHitSusOutline = null; stringLines = []; stringLineGlows = []; _boardPlaneMat = null; fretWireMats = []; fretTubeGeo?.dispose?.(); fretTubeGeo = null;
            for (const m of _inlayMats) m?.dispose?.(); _inlayMats = []; _inlayLabels = [];
            // mTapChevron: dispose explicitly — if no tap marker ever
            // spawned a pooled mesh, the scene.traverse() pass above never
            // reaches this material.
            mTapChevron?.dispose?.();
            mTapChevron = null;
            // mBarre is a shared material that all pBarreLine pool meshes
            // reference. If no barre chord ever appears, the pool factory
            // is never called, so no mesh carries mBarre into the scene
            // and scene.traverse() will miss it. Dispose explicitly here
            // to avoid leaking the GPU resource across panel lifecycles.
            // Three.js dispose() is idempotent, so calling it before or
            // after scene.traverse() is safe in both the instantiated and
            // uninstantiated cases.
            mBarre?.dispose?.(); mBarre = null;
            _paletteColorTmp = null;
            lyricsCanvas = lyricsCtx = null;
            projMeshArr = null;
            _probe = null;
            _drawNextByString = null; _drawRecentByString = null;
            _susVerdictLatch.clear();
            _drawChordTemplates = null;
            _drawAnchors = null;
            _laneTargetColor = null;
            _fwHitColor = _fwHitEmissive = null;
            _fwHitGlow.fill(0);
            _fwChordAcc.clear();
            _fwHitPrevTime = -Infinity;
            _renderScale = 1;
            mBeatM = mBeatQ = null;
            pNote = pNoteEdge = pSus = pSusOutline = pSusRibbon = pSusRibbonOl = pLbl = pBeat = pSec = null;
            pFretLbl = pLane = pLaneDivider = pGhostFretLbl = pChordBox = pChordFrameFill = pChordLbl = pBarreLine = pArpBracket = pNoteFretLabel = pConnectorLine = pDropLine = pTapChevron = pAccentHalo = pHaloBar = pPMXFill = pFHXFill = pMuteXLines = pFHXLines = pTeachMarkLbl = null;
            if (gPMXFill) { gPMXFill.dispose(); gPMXFill = null; }
            if (gFHXFill) { gFHXFill.dispose(); gFHXFill = null; }
            if (gPMXLines) { gPMXLines.dispose(); gPMXLines = null; }
            if (gFHXLines) { gFHXLines.dispose(); gFHXLines = null; }
            mLaneOdd = mLaneEven = mLaneDivider = mLaneDividerArp = gLanePlane = gGhostFretPlane = null;
            chordFrameGradTex = chordFrameGradTexArp = null;
            pFretColMarker = null;
            _fretMarkerWaveCache.clear();
            gNote = gSus = gBeat = gTapChevron = null;
            tgtX = curX = xFretMid(CAM_LOCK_CENTER_FRET); tgtDist = curDist = CAM_DIST_BASE; tgtLookY = curLookY = 0; _fretRowFitBoost = 1; nStr = NSTR; _oobStringWarned = false;
            _lookaheadCamX = xFretMid(CAM_LOCK_CENTER_FRET);
            _lookaheadFretSpan = DEFAULT_LOOKAHEAD_FRET_SPAN;
            _lookaheadCamPrevNow = null;
            _lookaheadLowBonusU = 0;
            _lookaheadHiNeckLatch = false;
            _measureStarts = []; _measureStartsRef = null;
            _clkAudioT = NaN; _clkPerf = NaN; _clkRate = 1; _frameNow = 0;
            prevLowFretBonus = 0;
            prevLockActive = false;
            _camSnapped = false;
            _camPreScanned = false;
            _camBootstrapHolding = false;
            _camBootstrapMode = null;
            _songKey = null;
            _slideTargetSet = null;
            _slideTargetNotesRef = null;
            _slideTargetChordsRef = null;
        }

        function canvasSize(canvas) {
            if (canvas) {
                // If the canvas has zero bounds (hidden via any mechanism — inline style,
                // CSS class, or hidden ancestor) fall back to the parent container
                // (the splitscreen panelDiv) which is always visible and correctly sized.
                const rect = canvas.getBoundingClientRect();
                const target = (rect.width === 0 || rect.height === 0) && canvas.parentNode ? canvas.parentNode : canvas;
                const sz = target === canvas ? rect : target.getBoundingClientRect();
                if (sz.width > 0 && sz.height > 0) return { w: sz.width, h: sz.height };
            }
            // Reserve the full bottom area: #player-footer wraps the Section
            // Practice bar + #player-controls. Fall back to #player-controls.
            const ch = (document.getElementById('player-footer')
                || document.getElementById('player-controls'))?.offsetHeight || 50;
            return { w: innerWidth, h: innerHeight - ch };
        }

        /* ── setRenderer contract ────────────────────────────────────────── */
        return {
            // Tells highway.js this renderer needs a webgl2-capable canvas.
            // Browsers lock a <canvas> to the first context type acquired,
            // so when this renderer is installed mid-session highway.js
            // replaces the underlying <canvas> element so getContext('webgl2')
            // can succeed (see static/highway.js _replaceCanvas).
            contextType: 'webgl2',
            init(canvas, bundle) {
                _unsubscribeFocus();
                if (wrap || ren) {
                    teardown();
                }
                _destroyed = _isReady = false;
                _isFocused = true;
                if (!_paneUid) _paneUid = ++_aspectPaneCounter;   // fallback pane id (no-arrangement panes)
                _registerTunerShortcut();   // session-global tuner shortcut (self-guarded)
                const myToken = ++_initToken;
                highwayCanvas = canvas;
                _invertedCached = !!(bundle && bundle.inverted);
                _leftyCached = !!(bundle && bundle.lefty);
                _renderScale = (bundle && bundle.renderScale) || 1;
                // Per-render background opt-out. A plugin borrowing the highway as
                // a visualization can set bundle.bgReactive === false to suppress
                // the audio-reactive background for THIS instance only — without
                // writing the shared h3d_bg_* settings (which would also change the
                // host's own highway). Motivation: the reactive bg taps the core
                // <audio> element, and when another consumer already holds it the
                // setup throws + the cleanup AudioContext.close() is an audible
                // click — which a borrower that never taps <audio> (e.g. a
                // contained-playback practice plugin) inherits for no benefit.
                // Default behavior is unchanged when the field is absent.
                _bgReactiveOptOut = !!(bundle && bundle.bgReactive === false);

                if (_ssActive()) {
                    window.feedBackSplitscreen.onFocusChange(_onFocusChange);
                    _focusSubscribed = true;
                }

                // Async-ready contract (feedBack#36 readyPromise). Resolves
                // when Three.js loaded + scene initialised (_isReady = true).
                // Rejects on any async failure so highway.js can revert.
                let _resolveReady, _rejectReady;
                this.readyPromise = new Promise((res, rej) => {
                    _resolveReady = res;
                    _rejectReady = rej;
                });
                // Shared rejection for superseded init cycles (destroy() or a
                // newer init() started before this one completed). highway.js
                // ignores the rejection when the renderer is no longer active.
                const _rejectSuperseded = () => _rejectReady(new Error('superseded'));

                loadThree().then(() => {
                    if (_destroyed || _initToken !== myToken) {
                        _rejectSuperseded();
                        return;
                    }
                    try {
                        nStr = resolveStringCount(bundle);
                        _invertedForBoard = _invertedCached;
                        _leftyForBoard = _leftyCached;
                        if (!initScene()) { _unsubscribeFocus(); _rejectReady(new Error('initScene failed')); return; }
                        // Pre-compile shaders + upload deterministic label
                        // textures while the load spinner is still up; the
                        // chart-dependent half runs on first draw() (bundle
                        // arrays are only guaranteed populated post-ready).
                        _prewarmStatic();
                        _chartPrewarmed = false;
                        const sz = canvasSize(highwayCanvas);
                        // Mark ready before RAF so any resize(w,h) calls that arrive
                        // in the meantime (e.g. from sizeCanvases()) are applied directly.
                        _isReady = true;
                        // Claim the shared player-chrome control only now that the
                        // renderer is actually viable. Acquiring at the top of init()
                        // meant a machine without WebGL2 mounted a Background control
                        // for a renderer that never drew a frame, and no failure path
                        // below released it.
                        if (!_pcAcquired) { _pcAcquired = true; _pcAcquire(); }
                        _resolveReady();
                        _updateFocusState();
                        if (sz.w > 0 && sz.h > 0) {
                            applySize(sz.w, sz.h);
                        } else {
                            // Panel container not yet laid out (sizeCanvases() runs after
                            // initPanel() in the setup sequence). Retry each frame until
                            // the panelDiv has real dimensions.
                            (function retrySize() {
                                if (_destroyed || !_isReady) return;
                                const s = canvasSize(highwayCanvas);
                                if (s.w > 0 && s.h > 0) applySize(s.w, s.h);
                                else requestAnimationFrame(retrySize);
                            })();
                        }
                    } catch (e) {
                        console.error('[3D-Hwy] init .then() threw:', e);
                        _isReady = false;
                        _unsubscribeFocus(); teardown();
                        _rejectReady(e);
                    }
                }).catch(e => {
                    if (_initToken !== myToken || _destroyed) {
                        _rejectSuperseded();
                        return;
                    }
                    console.error('[3D-Hwy] Three.js unavailable:', e);
                    _unsubscribeFocus();
                    _rejectReady(e);
                });
            },

            // The host throttles paused frames to ~10 fps, on the assumption
            // that a paused chart is a static picture and re-rendering it is
            // pure waste (highway-constants._PAUSED_FRAME_INTERVAL_MS).
            //
            // That stopped being true when the venue landed. The venue backdrop
            // is a PLAYING VIDEO and the crowd reacts on its own clock, and they
            // are drawn into this same canvas as the highway — so throttling the
            // highway throttled the whole room. Pausing the song dropped the
            // venue, the crowd and the stage to 10 fps.
            //
            // Two independent sources of motion, and BOTH must keep their frames:
            //
            //  • a crowd video rolling on its own clock (career venue pack), and
            //  • the venue scene's own fake-depth motion — the backdrop breathes,
            //    the haze drifts, warmth pulses, the shimmer moves. That is
            //    Math.sin(t) in the draw loop (see _venueApplyFakeDepthMotion),
            //    so it only moves while we are actually given frames, and it runs
            //    with NO pack at all.
            //
            // The throttle fires whenever the CHART CLOCK is stalled — which is
            // not just a pause. A count-in and the credits/author overlay stall it
            // exactly the same way, so the venue was stuttering there too.
            //
            // With no venue at all (plain 3D highway) the paused scene really is a
            // still picture: motion mode reads 'off', we claim nothing, and the
            // throttle still saves the GPU as #654 intended.
            needsContinuousFrames() {
                if (!_isReady || _ctxLost) return false;
                for (const v of _venueCrowdVideos) {
                    if (v && !v.paused && !v.ended && v.readyState >= 2) return true;
                }
                // 'off' also covers prefers-reduced-motion and "no venue scene".
                try { return _venueEffectiveMotionMode() !== 'off'; } catch (_) { return false; }
            },

            draw(bundle) {
                if (!_isReady) return;
                if (_ctxLost) return;   // GPU context lost (alt-tab / reset) — skip until restored
                if (!_chartPrewarmed) {
                    _chartPrewarmed = true;
                    _prewarmChart(bundle);
                }
                _invertedCached = !!bundle.inverted;
                _leftyCached = !!bundle.lefty;
                const newNStr = resolveStringCount(bundle);
                const newScale = bundle.renderScale || 1;
                const leftyChanged = _leftyCached !== _leftyForBoard;
                if (_invertedCached !== _invertedForBoard || leftyChanged || newNStr !== nStr) {
                    if (newNStr !== nStr) {
                        _oobStringWarned = false;
                        // Drop chord caches computed under the old string count
                        // so extended-range notes (string 6+) aren't left
                        // filtered out of cached shapes.
                        _resetStringDependentCaches();
                    }
                    if (leftyChanged) {
                        curX = -curX;
                        tgtX = -tgtX;
                        _lookaheadCamX = -_lookaheadCamX;
                    }
                    nStr = newNStr;
                    buildBoard();
                    _invertedForBoard = _invertedCached;
                    _leftyForBoard = _leftyCached;
                }
                if (newScale !== _renderScale) {
                    _renderScale = newScale;
                    const s = canvasSize(highwayCanvas);
                    if (s.w > 0 && s.h > 0) applySize(s.w, s.h);
                }
                // Keep the render matched to the highway canvas's real box.
                // Two independent drifts to catch each frame:
                //  1. Backing store (canvas.width/height) changed out from under
                //     us — e.g. the splitscreen hw.resize override resizes the
                //     element but never calls renderer.resize(). Also re-sizes
                //     the lyrics overlay canvas via applySize().
                //  2. The CSS box (canvasSize()) drifted while the backing store
                //     held. #highway is flex:1, so its rendered height changes as
                //     the player layout settles right after a song opens — with
                //     no backing-store change and no window 'resize' event, so the
                //     check above never fires. Without this the camera stays framed
                //     for the pre-settle (too-tall) size and crops the near strings
                //     / fret numbers until the user un/re-maximizes the window.
                if (highwayCanvas) {
                    // Backing-store drift (branch 1) is detected with cheap
                    // property reads every frame. The CSS-box checks (branches
                    // 2/3) need canvasSize() → getBoundingClientRect(), a
                    // forced layout read — profiled at ~1.2% of throttled
                    // main-thread time when run per frame. Throttle the box
                    // read to every 10th frame (plus whenever the backing
                    // store changed or the wrap isn't pinned yet): the layout
                    // settle it exists to catch plays out over hundreds of ms
                    // right after a song opens, so a ~166 ms detection cadence
                    // loses nothing visible.
                    const _bsChanged = highwayCanvas.width !== _lastHwW
                        || highwayCanvas.height !== _lastHwH;
                    _boxCheckCountdown = (_boxCheckCountdown + 1) % 10;
                    if (_bsChanged || !_wrapPinned || _boxCheckCountdown === 0) {
                        const box = canvasSize(highwayCanvas);
                        if (_bsChanged) {
                            _lastHwW = highwayCanvas.width;
                            _lastHwH = highwayCanvas.height;
                            if (box.w > 0 && box.h > 0) applySize(box.w, box.h);
                        } else if (box.w > 0 && box.h > 0 &&
                                (Math.abs(box.w - _appliedW) > 1 || Math.abs(box.h - _appliedH) > 1)) {
                            applySize(box.w, box.h);
                        } else if (!_wrapPinned && box.w > 0 && box.h > 0 &&
                                highwayCanvas.offsetWidth > 0 && highwayCanvas.offsetHeight > 0) {
                            //  3. The overlay pin couldn't be applied at init because
                            //     #highway had no layout yet (offsetWidth/Height === 0),
                            //     so applySize() only set the wrap height. The canvas has
                            //     now laid out but to the same logical size, so neither
                            //     drift branch above fires — re-run applySize to pin the
                            //     wrap to the canvas box now that its offsets are real.
                            //     Otherwise the overlay stays at top:0;left:0;right:0 and
                            //     a strip of #highway is exposed on first load / split.
                            applySize(box.w, box.h);
                        }
                    }
                }
                update(bundle);
                camUpdate(bundle);

                // Background animations (#13). Compute frame dt once,
                // read audio bands when reactivity is on, delegate to
                // the active style's update().
                if (bgGroup && _bgEffectiveStyleId() !== 'off') {
                    const nowMs = performance.now();
                    const dt = _bgLastT === 0 ? 1 / 60 : Math.min(0.1, (nowMs - _bgLastT) / 1000);
                    _bgLastT = nowMs;
                    const bands = bgReactive ? _bgReadBands() : BG_ZERO_BANDS;
                    const style = BG_STYLES[_bgEffectiveStyleId()];
                    if (style && bgState) {
                        try { style.update(bgState, bands, dt, nowMs / 1000); }
                        catch (e) { console.error('[3D-Hwy] bg update threw', _bgEffectiveStyleId(), e); }
                    }
                }

                // Browser: the shared analyser can change between songs (a sloppak
                // stems swap replaces it, often on a new context) — or may not have
                // existed when the controller mounted. Keep the visualizer bound to
                // the LIVE analyser by comparing against what the controller
                // actually bound (boundAnalyser()), not a separately-tracked guess:
                // cheap reconnect when it's the same context, full controller
                // rebuild when the context changed (cross-context connectAudio is
                // impossible). Only act once the viz is ready (ready()), so we
                // don't thrash a controller that's still loading async. Done before
                // the render block so a rebuild this frame just skips one bc frame
                // (bcCtrl goes null) without affecting the highway's own render.
                if (bcCtrl && !_bcIsDesktop() && bcCtrl.ready && bcCtrl.ready()) {
                    let a = null;
                    try { a = _bgGetAnalyser(); } catch (e) { a = null; }
                    const an = a && a.analyser;
                    const bound = bcCtrl.boundAnalyser ? bcCtrl.boundAnalyser() : null;
                    if (an && an !== bound) {
                        if (!(bcCtrl.reconnectAudio && bcCtrl.reconnectAudio(a))) {
                            // Context changed (or reconnect failed) — rebuild via the
                            // proven destroy/create paths so the new context binds.
                            try { bcCtrl.destroy(); } catch (e) {}
                            bcCtrl = null;
                            _bcSyncMode();
                        }
                    }
                }
                if (bcCtrl) {
                    const cfg = _bcLoadSettings();
                    const _ct = bundle.currentTime || 0;
                    if (cfg.chartAccents) {
                        if (_ct < _chartPrevT - 0.08 || _ct - _chartPrevT > 1.0) {
                            _bcBeatIdx = _bcFfIdx(bundle.beats, _ct, 'time');
                            _bcNoteIdx = _bcFfIdx(bundle.notes, _ct, 't');
                            _bcChordIdx = _bcFfIdx(bundle.chords, _ct, 't');
                        }
                        const _beats = bundle.beats || [];
                        while (_bcBeatIdx < _beats.length && _beats[_bcBeatIdx].time <= _ct) {
                            const strong = _beats[_bcBeatIdx].measure !== undefined && _beats[_bcBeatIdx].measure !== -1;
                            _chartEnv = Math.max(_chartEnv, strong ? 1.0 : 0.6);
                            _bcBeatIdx++;
                        }
                        const _notes = bundle.notes || [];
                        let _tintS = -1;
                        while (_bcNoteIdx < _notes.length && _notes[_bcNoteIdx].t <= _ct) {
                            _chartEnv = Math.max(_chartEnv, 0.6);
                            _tintS = _notes[_bcNoteIdx].s;
                            _bcNoteIdx++;
                        }
                        const _chords = bundle.chords || [];
                        while (_bcChordIdx < _chords.length && _chords[_bcChordIdx].t <= _ct) {
                            _chartEnv = Math.max(_chartEnv, 0.95);
                            _bcChordIdx++;
                        }
                        if (_tintS >= 0 && activePalette && activePalette.length) {
                            _bcTintTarget = activePalette[((_tintS % activePalette.length) + activePalette.length) % activePalette.length];
                        }
                        _chartPrevT = _ct;
                        _chartEnv *= 0.86;
                        bcCtrl.chart(_chartEnv * (cfg.chartStrength != null ? cfg.chartStrength : 1));
                    } else {
                        bcCtrl.chart(0);
                    }
                    if (cfg.colorTint && _bcTintTarget != null) {
                        const tr = (_bcTintTarget >> 16) & 255, tg = (_bcTintTarget >> 8) & 255, tb = _bcTintTarget & 255;
                        _tintR += (tr - _tintR) * 0.06; _tintG += (tg - _tintG) * 0.06; _tintB += (tb - _tintB) * 0.06;
                        bcCtrl.tint((Math.round(_tintR) << 16) | (Math.round(_tintG) << 8) | Math.round(_tintB), cfg.tintStrength != null ? cfg.tintStrength : 0.65);
                    } else {
                        bcCtrl.tint(null, 0);
                    }
                    bcCtrl.render();
                }
                {
                    const _jNow = performance.now();
                    const _jdt = _juiceLastT === 0 ? 1 / 60 : Math.min(0.05, (_jNow - _juiceLastT) / 1000);
                    _juiceLastT = _jNow;
                    _sparkUpdate(_jdt);
                    _streakHeat += (Math.min(1, _streakHits / 16) - _streakHeat) * 0.08;   // #7 ease heat
                }
                {
                    const comp = (_bloom && !_ssActive()) ? _bloomEnsure() : null;
                    if (comp) {
                        const bsz = canvasSize(highwayCanvas);
                        if (bsz && bsz.w > 0 && bsz.h > 0 && (bsz.w !== _bloomW || bsz.h !== _bloomH)) {
                            comp.setSize(bsz.w | 0, bsz.h | 0); _bloomW = bsz.w | 0; _bloomH = bsz.h | 0;
                        }
                        if (ren.toneMapping !== T.ACESFilmicToneMapping) ren.toneMapping = T.ACESFilmicToneMapping;
                        pbBeg(6); comp.render(); pbEnd(6);
                    } else {
                        if (ren.toneMapping !== T.NoToneMapping) ren.toneMapping = T.NoToneMapping;
                        pbBeg(6); ren.render(scene, cam); pbEnd(6);
                    }
                }
                if (lyricsCtx && lyricsCanvas) {
                    lyricsCtx.clearRect(0, 0, lyricsCanvas.width, lyricsCanvas.height);
                    // Capture the actual lyrics-banner bottom so overlay cards
                    // step down past every wrapped row, not just a 2-row estimate.
                    let lyricsBottom = 0;
                    if (bundle.lyricsVisible && bundle.lyrics?.length) {
                        lyricsBottom = drawLyrics(bundle.lyrics, bundle.currentTime, lyricsCtx, lyricsCanvas.width, lyricsCanvas.height) || 0;
                    }
                    drawNotedetectLabels(lyricsCtx, lyricsCanvas.width, lyricsCanvas.height);
                    drawScoreFx(lyricsCtx, lyricsCanvas.width, lyricsCanvas.height);

                    // Corner-stacking: overlays drawn first claim the topmost slot;
                    // later overlays are pushed down by the accumulated height + gap.
                    // Draw order (top → bottom per corner):
                    //   1. FPS counter  — always first
                    //   2. Section HUD
                    //   3. Tone HUD
                    //   4. Chord diagram — always last
                    const STACK_GAP = 8;
                    const cornerStack = { tl: 0, tr: 0, bl: 0, br: 0 };
                    const stackPush = (pos, h) => {
                        if (pos in cornerStack && h > 0) cornerStack[pos] += h + STACK_GAP;
                    };

                    // 1. FPS counter (always top-right, always topmost).
                    // EMA update runs unconditionally so the smoothed value is accurate
                    // even when fpsVisible is off.
                    const _fpsNowMs = performance.now();
                    if (_fpsLastT > 0) {
                        const dt = _fpsNowMs - _fpsLastT;
                        if (dt > 0) {
                            const inst = 1000 / dt;
                            _fpsEma = _fpsEma === 0 ? inst : _fpsEma + (inst - _fpsEma) * (1 / 30);
                        }
                    }
                    _fpsLastT = _fpsNowMs;
                    if (fpsVisible) {
                        if (_fpsNowMs - _fpsLastSampleT > 250) {
                            _fpsDisplay = _fpsEma;
                            _fpsLastSampleT = _fpsNowMs;
                        }
                        const W = lyricsCanvas.width;
                        const H = lyricsCanvas.height;
                        const txt = _fpsDisplay.toFixed(1) + ' fps';
                        lyricsCtx.save();
                        lyricsCtx.font = 'bold 14px ui-monospace, Menlo, Consolas, monospace';
                        lyricsCtx.textAlign = 'right';
                        lyricsCtx.textBaseline = 'top';
                        const _fpsPadX = 8, _fpsPadY = 4;
                        const _fpsMetrics = lyricsCtx.measureText(txt);
                        const _fpsBoxW = Math.ceil(_fpsMetrics.width) + _fpsPadX * 2;
                        const _fpsBoxH = 14 + _fpsPadY * 2;
                        const _fpsE = 8;
                        // Keep it top-right but below the v3 Up Next pill / live HUD
                        // (whichever is showing) so the readout is never occluded.
                        const _fpsBaseY = Math.round(Math.max(
                            _fpsE + H * 0.06,
                            lyricsBottom + _fpsE,
                            _v3TopRightChromeBottom() + _fpsE,
                        ));
                        const _fpsX = W - 8 - _fpsBoxW;
                        const _fpsY = _fpsBaseY + cornerStack['tr'];
                        lyricsCtx.fillStyle = 'rgba(0,0,0,0.55)';
                        lyricsCtx.fillRect(_fpsX, _fpsY, _fpsBoxW, _fpsBoxH);
                        lyricsCtx.fillStyle = _fpsDisplay >= 55 ? '#7fff9a'
                            : _fpsDisplay >= 30 ? '#ffe84d' : '#ff6b6b';
                        lyricsCtx.fillText(txt, _fpsX + _fpsBoxW - _fpsPadX, _fpsY + _fpsPadY);
                        lyricsCtx.restore();
                        stackPush('tr', _fpsBoxH);
                    }

                    // 2. Section HUD.
                    if (sectionHudVisible && bundle.sections && bundle.sections.length) {
                        const secH = drawSectionHud(lyricsCtx, {
                            sections: bundle.sections,
                            currentTime: bundle.currentTime,
                            canvasW: lyricsCanvas.width, canvasH: lyricsCanvas.height,
                            position: sectionHudPosition,
                            sizeSlider: sectionHudSize,
                            lyricsBottom,
                            stackOffset: cornerStack[sectionHudPosition] || 0,
                        });
                        stackPush(sectionHudPosition, secH);
                    }

                    // 3. Tone HUD.
                    if (toneHudVisible && (bundle.toneChanges?.length || bundle.toneBase)) {
                        const toneH = drawToneHud(lyricsCtx, {
                            toneChanges: bundle.toneChanges,
                            toneBase: bundle.toneBase,
                            currentTime: bundle.currentTime,
                            canvasW: lyricsCanvas.width, canvasH: lyricsCanvas.height,
                            position: toneHudPosition,
                            sizeSlider: toneHudSize,
                            lyricsBottom,
                            stackOffset: cornerStack[toneHudPosition] || 0,
                        });
                        stackPush(toneHudPosition, toneH);
                    }

                    // 4. Chord diagram — always last (bottommost in the stack).
                    // Draw outgoing first so the incoming diagram renders on top,
                    // making the entrance scale-in animation visible during crossfades.
                    // The outgoing (prev) diagram uses the same corner slot — it is
                    // fading out while the incoming one fades in, so they share the
                    // same stack position and don't double-count the height.
                    if (chordDiagramVisible && _diagPrev && _diagPrevOpacity > 0) {
                        _drawDiagramCached(lyricsCtx, {
                            name: _diagPrev.name, frets: _diagPrev.frets,
                            opacity: _diagPrevOpacity,
                            entranceT: (_diagPrev.t !== undefined)
                                ? Math.min(1.0, Math.max(0, (bundle.currentTime - _diagPrev.t) / DIAG_ENTRANCE_S))
                                : 1.0,
                            canvasW: lyricsCanvas.width, canvasH: lyricsCanvas.height,
                            inverted: _invertedCached,
                            sizeSlider: chordDiagramSize, position: chordDiagramPosition,
                            nStr: _diagPrev.nStr ?? nStr,
                            lyricsBottom,
                            stackOffset: cornerStack[chordDiagramPosition] || 0,
                        });
                        // Don't push here — outgoing and incoming share the same slot.
                    }
                    if (chordDiagramVisible && _diagChord) {
                        const diagH = _drawDiagramCached(lyricsCtx, {
                            name: _diagChord.name, frets: _diagChord.frets,
                            opacity: Math.max(0, 1 + (_diagChord.t - bundle.currentTime) / DIAG_LINGER_S),
                            entranceT: _diagEntranceT,
                            canvasW: lyricsCanvas.width, canvasH: lyricsCanvas.height,
                            inverted: _invertedCached,
                            sizeSlider: chordDiagramSize, position: chordDiagramPosition,
                            nStr: _diagChord.nStr ?? nStr,
                            lyricsBottom,
                            stackOffset: cornerStack[chordDiagramPosition] || 0,
                        });
                        stackPush(chordDiagramPosition, diagH);
                    }
                }
                // Draw-hook compatibility: fire hooks registered via
                // window.highway.addDrawHook() on our 2D overlay canvas
                // so overlay plugins (fretboard, chord-label HUDs, etc.)
                // continue to render when the 3D renderer is active.
                // The hooks expect a 2D context — lyricsCtx is exactly
                // that, positioned above the WebGL surface.
                if (lyricsCtx && lyricsCanvas &&
                        window.highway &&
                        typeof window.highway.fireDrawHooks === 'function') {
                    window.highway.fireDrawHooks(
                        lyricsCtx, lyricsCanvas.width, lyricsCanvas.height
                    );
                }
            },

            resize(w, h) {
                if (!_isReady) return;
                const s = canvasSize(highwayCanvas);
                applySize(s.w > 0 ? s.w : w, s.h > 0 ? s.h : h);
            },

            destroy() {
                _destroyed = true; _isReady = false; _diagChord = null; _diagPrev = null; _diagLastKey = null; _diagRenderCache.clear();
                _lastHwW = 0; _lastHwH = 0;
                _appliedW = 0; _appliedH = 0;
                _paneAspect = 0;
                if (cam && cam.fov !== BASE_VFOV) { cam.fov = BASE_VFOV; cam.updateProjectionMatrix(); }
                _wrapPinned = false;
                if (_pcAcquired) { _pcAcquired = false; _pcRelease(); }
                _unsubscribeFocus(); teardown();
                highwayCanvas = null;
            },
        };
    }

    window.feedBackViz_highway_3d = createFactory;
    // Per-panel control descriptors (splitscreen). The palette selector was
    // removed — per-string colors are set via the core "Highway String Colors"
    // UI, which drives both highways by named string.
    window.feedBackViz_highway_3d.panelControls = [
        {
            key: 'cameraSmoothing',
            label: 'Camera smoothing (X-pan)',
            type: 'range',
            min: 0,
            max: 1,
            step: 0.05,
            default: BG_DEFAULTS.cameraSmoothing,
        },
        {
            key: 'cameraLockLow',
            label: 'Lock camera at frets 1-12',
            type: 'toggle',
            default: BG_DEFAULTS.cameraLockLow,
        },
        {
            key: 'cameraLockZoom',
            label: 'Locked zoom (In ↔ Out)',
            type: 'range',
            min: 0,
            max: 1,
            step: 0.05,
            default: BG_DEFAULTS.cameraLockZoom,
        },
    ];
    // Static metadata exposed on the factory:
    //   panelControls      - optional, host-readable descriptors for a
    //                        curated per-panel control surface. Renderer
    //                        values still flow through _bgLoadSettings().
    //   contextType        - required canvas context type. highway.js
    //                        replaces the <canvas> element when the
    //                        requested type differs from the current one,
    //                        so this renderer can be installed mid-session
    //                        even if the canvas was previously bound to 2D.
    //   matchesArrangement - Auto-mode predicate. When the picker is on
    //                        "Auto", core installs the first registered
    //                        viz whose predicate returns truthy on the
    //                        current song_info. Lead/Rhythm/Bass/Guitar
    //                        arrangements route here; Keys arrangements
    //                        are matched by the piano plugin instead.
    //                        _canRun3D() in app.js still gates Auto from
    //                        picking us on machines without WebGL2.
    window.feedBackViz_highway_3d.contextType = 'webgl2';
    window.feedBackViz_highway_3d.__test = {
        getAnalyserForBridgeTest: _bgGetAnalyser,
        readBandsForBridgeTest: _bgReadBands,
        resetAnalyserBridgeForTest() { _bgBridgeKeys.clear(); _bgAudio = null; _bgAudioCore = null; _bgAudioFailedAt = 0; },
    };
    // Canonical guitar arrangement names (server.py: _ALLOWED_ARRANGEMENT_NAMES)
    // are Lead / Rhythm / Bass / Combo. `guitar` is included as a safety
    // net for sources that use a generic name (older imports, third-party
    // sloppaks). Word boundaries (\b) keep us from accidentally matching
    // arrangements that merely contain these as substrings (e.g. a
    // "BasslineKeys" arrangement would otherwise match `bass`).
    window.feedBackViz_highway_3d.matchesArrangement = function (songInfo) {
        const arr = (songInfo && songInfo.arrangement) || '';
        return /\b(?:lead|rhythm|bass|combo|guitar)\b/i.test(arr);
    };

    // No imperative register() call needed: feedBack#272 introduced the
    // consolidated tour menu, which discovers this plugin's tour automatically
    // via /api/plugins (has_tour:true from plugin.json's tour field) and
    // gates relevance on whether highway_3d is the active viz. A register()
    // call with only injectTriggerInto was a no-op anyway since the new menu
    // owns trigger placement; for buildSteps / onStart / onComplete / a
    // custom screens override, register() is still the right hook.

})();
