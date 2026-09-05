// h3d-carve-15: U-section (per-frame renderer) → src/renderer.js
// createRenderer({DI}) → { update }
// See hive/plans/h3d-cut15-contract.md for full DI classification.
// VERBATIM-MOVE rule: function bodies moved exactly; only DI rewires applied.
// Call-argument fidelity gate: every moved call verified against baseline.

import { lowerBoundT, camBaseDistU, camLowFretPullbackU, dZ, renderOrderForLayerAtZ } from './geometry.js';

// ─────────────────────────────────────────────────────────────────────────────
export function createRenderer({
    // ── Plain consts (shorthand) ──────────────────────────────────────────
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
    // camAhead, camTau: re-declared as let vars inside update() — not DI
    // ── Stable fn-refs (shorthand) ────────────────────────────────────────
    sY, xFret, xFretMid, fretLabelScaleForFret, pbBeg, pbEnd, pbReportTick,
    hwyFirstRelevantFrettedTime, _syncOpenStringPitchLabels, txtMat, _setLabelMap,
    // createNoteRenderer outputs (fn-refs from screen.js wiring):
    drawNote, drawArpBrackets, chordHarmonyLabels,
    // createCamera outputs:
    camUpdate,
    lookaheadBootstrapTime, lookaheadComputeFretBounds, lookaheadTargetWorldX,
    // arp.js outputs (from createArp destructure in screen.js):
    chordWireHighDensity, chordTemplateLabel, chordTemplateMarkedArpeggio,
    chordHandShapeArpeggioHint,
    mergeHandShapeSynthChords, mergeChordShape,
    inferArpeggioFromNotePattern, chordShapeCoveredByStandaloneNotes,
    hsStart, hsEnd, handShapeChartSpanSec, fillArpeggioGhostInferFlags,
    arpeggioChordIdForNoteWithInferCache, arpHsBoundsForNote,
    fillLaneRailHandShapeFlags, fillArpeggioRailShapeBoundsCaches,
    arpeggioLaneOuterRailLaneSlice, arpeggioLaneOuterRailAtChartTime,
    arpeggioLaneDividerFrameAccentMul, arpeggioLaneDividerXYScaleMatchFrameRim,
    // other screen.js fn-refs:
    validString, filterValidNotes,
    // ── Getters (live state reads) ─────────────────────────────────────────
    // New pools:
    // All 33 pools (note-renderer 15 + new 18):
    getPNote, getPNoteEdge, getPSus, getPSusOutline, getPSusRibbon, getPSusRibbonOl,
    getPTapChevron, getPAccentHalo, getPLbl, getPArpBracket,
    getPBeat, getPSec, getPFretLbl, getPLane, getPLaneDivider, getPGhostFretLbl,
    getPChordBox, getPChordFrameFill, getPChordLbl, getPBarreLine, getPHaloBar,
    getPPMXFill, getPFHXFill, getPMuteXLines, getPFHXLines, getPNoteFretLabel,
    getPConnectorLine, getPDropLine, getPTeachMarkLbl, getPFretColMarker,
    getPSusRail, getPSusRailBloom, getPTechPlane,
    // Materials/emissive:
    getMHitBright, getMHitSusOutline, getGlowMul, getVenueSceneOverride, getProjMeshArr,
    // Frame/render settings:
    getTextSize, getCameraMode, getCameraSmoothing, getZoomSmoothing,
    getCameraLockLow, getCameraLockZoom, getNStr, getLeftyCached, getInverted,
    // Camera state:
    getTgtX, getTgtDist, getCurX,
    getPrevLowFretBonus, getPrevLockActive,
    // Lookahead / clock state:
    getLookaheadCamX, getLookaheadFretSpan,
    getLookaheadLowBonusU, getLookaheadHiNeckLatch, getLookaheadCamPrevNow,
    getFrameNow, getClkAudioT, getClkPerf, getClkRate,
    // Camera bootstrap flags:
    getCamSnapped, getCamPreScanned, getCamBootstrapHolding, getCamBootstrapMode, getSongKey,
    // ND / per-frame state:
    getNdVerdictSawAlpha, getNdVerdictMaxAlpha, getNdFrameNowMs,
    // Other frame state:
    getInlayLabels,
    getLeanSusPollCounter, getLeanSus, getTextSizeMul, getTextSizeMulApplied,
    getImPMTechCount, getImFHTechCount,
    getMeasureStartsRef,
    // Stable object refs (mutable arrays/maps, passed by reference):
    _frameLabeledKeys,
    _ndLabels,
    _scrGhostUpcomingCount,
    _ndHitMarks,
    _ndMissMarks,
    // ── Setters (beyond-subst write-backs) ────────────────────────────────
    setNdVerdictSawAlpha, setNdVerdictMaxAlpha, setNdFrameNowMs,
    setLeanSus, setLeanSusPollCounter,
    setTextSizeMul, setTextSizeMulApplied,
    setImPMTechCount, setImFHTechCount,
    setImPMXFillCount, setImPMXLinesCount, setImFHXFillCount, setImFHXLinesCount,
    setLookaheadCamX, setLookaheadFretSpan,
    setLookaheadCamPrevNow, setLookaheadHiNeckLatch, setLookaheadLowBonusU,
    setTgtX, setTgtDist, setPrevLowFretBonus, setPrevLockActive,
    setCurX, setCurDist,
    setSongKey, setCamSnapped, setCamPreScanned,
    setCamBootstrapHolding, setCamBootstrapMode,
    setMeasureStarts, setMeasureStartsRef,
    setClkAudioT, setClkPerf, setClkRate, setFrameNow,
    // ── Category B — plain consts ─────────────────────────────────────────
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
    MAX_RENDER_STRINGS,
    // ── Category C — fn-refs / let-vars ──────────────────────────────────
    activePalette, anchorLaneBoundsAt, anchorPlayedFretSpanAt,
    boardSpanX, chordShapeSignature,
    _drawAnchors, _drawChordTemplates, _drawNextByString, _drawRecentByString, _drawTeachingMarks,
    _encodeChordVerdictKey, _firstEventTimeGreaterThan,
    fretColumnMarkerCadence, fretColumnMarkersForAnchor, fretDividersVisible,
    fretLastActiveTime, _fretMarkerWaveCache, fretWireMats, fretX,
    getChartAnchorAt, hwyPostHitTailFadeMul,
    imFHTech, imFHXFill, imFHXLines, imPMTech, imPMXFill, imPMXLines,
    laneBoundsFromAnchor, sectionLabelsOnHighway, _showFingerHints, updateStringHighlights,
    _noteKey,
    bendChevronMat, darkenHex, slideArrowMat, triMat,
    palmMuteXSpriteMat, fretHandMuteXSpriteMat,
    fxClearSeen,
    // ── Category D — Three.js render objects (reassigned) ─────────────────
    getRen, getScene, getCam,
    // ── Category E — shared mutable state (getter/setter) ─────────────────
    getDiagChord, setDiagChord,
    getDiagEntranceT, setDiagEntranceT,
    getDiagLastKey, setDiagLastKey,
    getDiagPrev, setDiagPrev,
    getDiagPrevOpacity, setDiagPrevOpacity,
    getDiagPrevStartOpacity, setDiagPrevStartOpacity,
    getDiagPrevStartT, setDiagPrevStartT,
    getMergeCacheResult, setMergeCacheResult,
    _scrEventTimes,
    getScrEventTimesLen, setScrEventTimesLen,
    getSlideTargetChordsRef, setSlideTargetChordsRef,
    getSlideTargetNotesRef, setSlideTargetNotesRef,
    getSlideTargetSet, setSlideTargetSet,
    // ── Category F — shared mutable (stable refs + getters) ───────────────
    _fwChordAcc, _fwHitGlow, _fwHitIn, _rimFlashIn, _susVerdictLatch,
    getFwHitColor, getFwHitEmissive,
    getFwHitPrevTime, setFwHitPrevTime,
    getMBeatM, getMBeatQ, getMRimFlash,
    // ── Category G — lane materials (reassigned) ──────────────────────────
    getMLaneDivider, getMLaneDividerArp, getMLaneDividerExt, getMLaneEven, getMLaneOdd,
    // ── Extra ─────────────────────────────────────────────────────────────
    getChordFrameGradTex, getChordFrameGradTexArp,
}) {
    // Per-renderer mutable state (not DI — persists across update() calls):
    let _chordVerdicts = new Map();
    let _chordVerdictsLastNow = null;
    let _fretLabelNotesRef = null;
    let _fretLabelAllowed = null;
    let _arpGhostHsInferScratch = [];
    let _arpGhostInferRefHs = null;
    let _arpGhostInferRefNotes = null;
    let _arpGhostInferRefTpl = null;
    let _arpLaneRailHsScratch = [];
    let _arpRailBoundHiScratch = [];
    let _arpRailBoundLoScratch = [];
    let _arpSynthOnsetHsSet = new Set();
    let _laneRailBoundsRefChords = null;
    let _laneRailBoundsRefHs = null;
    let _laneRailBoundsRefNotes = null;
    let _laneRailBoundsRefTpl = null;
    let _laneRailFlagsRefHs = null;
    let _laneRailFlagsRefTpl = null;
    const _laneSegArp = [];
    const _laneSegDMax = [];
    const _laneSegDMin = [];
    let _laneSegLen = 0;
    const _laneSegTHi = [];
    const _laneSegTLo = [];
    const _laneSegZ0 = [];
    const _laneSegZ1 = [];
    let _mergeCacheChordsRef = null;
    let _mergeCacheHsRef = null;
    let _mergeCacheTplRef = null;
    const _scrAccentFillBoost    = new Array(MAX_RENDER_STRINGS).fill(0);
    const _scrActiveFrets = new Set();
    const _scrArpPersistKeys = new Set();
    const _scrAtMinFretArr = new Array(MAX_RENDER_STRINGS).fill(0);
    let _scrAtMinFretLen = 0;
    const _scrChordNote = {};
    const _scrFretHeat           = new Array(NFRETS + 1).fill(0);
    const _scrGhostLastT         = new Array(MAX_RENDER_STRINGS).fill(-Infinity);
    const _scrGhostPrevBuf       = new Map();
    const _scrLastFretForString  = new Array(MAX_RENDER_STRINGS).fill(undefined);
    const _scrNextNoteByString   = new Array(MAX_RENDER_STRINGS).fill(null);
    const _scrNextNoteByStringData = Array.from({ length: MAX_RENDER_STRINGS }, () => ({}));
    const _scrNoteStreamBracketStrings = new Map();
    const _scrRecentByString     = new Array(MAX_RENDER_STRINGS).fill(-Infinity);
    const _scrStrGlow            = new Array(MAX_RENDER_STRINGS).fill(0.5);
    const _scrStringAnticipation = new Array(MAX_RENDER_STRINGS).fill(0);
    const _scrStringSustain      = new Array(MAX_RENDER_STRINGS).fill(false);
    const _CV_KEY_TIME_MUL = 1e4;
    const _CV_KEY_TIME_SLOT = 1e6;

function lookaheadSmoothCamStep(dtSec, tgtXWorld, tgtSpanInt) {
    const d = Math.min(0.2, Math.max(1e-4, dtSec));
    const fs = 1 - Math.pow(1 - CAM_FOCUS_BLEND_RATE, d);
    setLookaheadCamX(tgtXWorld * fs + getLookaheadCamX() * (1 - fs));
    setLookaheadFretSpan(tgtSpanInt * fs + getLookaheadFretSpan() * (1 - fs));
}

/* ── Camera target helper ────────────────────────────────────────── */
// Compute and apply getTgtX() + getTgtDist() from note-window-accumulated data.
// Used by BOTH the snap pre-pass (before drawNote() calls, skipDistHyst=true)
// and the main per-frame camera-target block (skipDistHyst=false) so the
// two paths can never drift out of sync.
//
// wX/wSum        recency-weighted fret-position centroid accumulator
// distMin/Max    min/max fret seen in the camera targeting window
// distGot        true iff at least one fretted note was in the window
// camHystF       X-axis hysteresis factor (from cameraSmoothing)
// camDistHystF   dist hysteresis factor (from zoomSmoothing)
// skipDistHyst   true on the snap/first-data frame — no previous getTgtDist()
//                state exists, so bypass the dead-zone gate
//
// Side-effects: updates getTgtX(), getTgtDist(), getPrevLowFretBonus().
// Returns: computed lockActive flag (caller is responsible for setting
//          getPrevLockActive() from the returned value).
function _applyNoteCamTargets(wX, wSum, distMin, distMax, distGot,
                              camHystF, camDistHystF, skipDistHyst) {
    const lockActive = getCameraLockLow() && (!distGot || distMax <= 12);
    if (lockActive) {
        // Locked view: frets 0-12 fit in frame, with the peak
        // low-fret bonus baked in so nut chords stay framed.
        // Both halves derive from the same helpers as the
        // dynamic branch so future tuning of the base zoom
        // curve or low-fret pullback can't desync them.
        const lockedBaseU  = camBaseDistU(12);
        const lockedBonusU = camLowFretPullbackU(1);
        // cameraLockZoom slider 0..1 blends between MIN (closest)
        // and MAX (furthest). Default 0.5 maps to ~1.0× so existing
        // users see the same locked view as before this slider.
        const lockZoomMul  = CAM_LOCK_ZOOM_MIN +
            (CAM_LOCK_ZOOM_MAX - CAM_LOCK_ZOOM_MIN) * getCameraLockZoom();
        setTgtX(xFretMid(CAM_LOCK_CENTER_FRET));
        setTgtDist((lockedBaseU + lockedBonusU) * K * lockZoomMul);
        setPrevLowFretBonus(lockedBonusU);
    } else if (distGot) {
        // Base zoom scales by fret count (distMax - distMin).
        const baseDistU     = camBaseDistU(distMax - distMin);
        // Low-fret pullback: world-X distance between frets is
        // logarithmic, so a 2-fret span at the nut takes much
        // more horizontal screen than the same span at fret 12.
        // The base term scales by *fret count*, not world-X
        // span, so low-fret clusters were under-allotted camera
        // distance and clipped at the left edge (e.g. F power
        // chord at fret 1 partially off-screen). Add a tapered
        // bonus that kicks in below fret 5 and peaks at fret 1
        // (≈16 extra fret-span units, i.e. 16*K world-units of
        // distance), without affecting mid/high neck framing.
        const lowFretBonusU = camLowFretPullbackU(distMin);
        if (skipDistHyst) {
            // First data frame — no previous getTgtDist() state; apply
            // directly without the hysteresis dead-zone check.
            setTgtDist((baseDistU + lowFretBonusU) * K);
        } else {
            // getTgtDist() scales at (3 * K) per fret-span unit, so the
            // hysteresis threshold (a fret-span dead zone) converts
            // to getTgtDist()-space by multiplying by 3 * K — NOT by
            // FRET_WIDTH_MID, which is X-axis world-units-per-fret
            // and a different unit (would over-tighten the gate by
            // ~4x at SCALE = 2.25).
            //
            // Hysteresis is applied to the BASE portion only. The
            // lowFretBonus changes by 4 fret-span units per integer
            // fret near the nut, which sits below the default-
            // cameraSmoothing (cs=0.5) dead zone of ~8.25 fret-span
            // units (= 2.75 * 3) and would otherwise be suppressed
            // for fret 2 → 1 / 3 → 1 transitions — exactly the
            // corrections this bonus exists to provide. So gate the
            // base, then always reflect bonus changes on top by
            // tracking the last-committed bonus contribution
            // (getPrevLowFretBonus()) and adjusting getTgtDist() for its
            // delta whether or not the base hysteresis fires.
            //
            // First frame after a lock release bypasses the gate
            // entirely so a >12 fret note that disengaged the lock
            // is guaranteed to widen the view. Without this, a
            // small span jump (12→13 frets) at default settings
            // can sit inside the dead zone and the camera fails
            // to follow the high note that just opened the lock.
            const candidateBase = baseDistU * K;
            const baseTgt       = getTgtDist() - getPrevLowFretBonus() * K;
            const justUnlocked  = getPrevLockActive();
            if (justUnlocked || Math.abs(candidateBase - baseTgt) > camDistHystF * 3 * K) {
                setTgtDist((baseDistU + lowFretBonusU) * K);
            } else if (lowFretBonusU !== getPrevLowFretBonus()) {
                setTgtDist(baseTgt + lowFretBonusU * K);
            }
        }
        setPrevLowFretBonus(lowFretBonusU);
    }
    // X-axis: recency-weighted centroid with a hysteresis dead zone
    // so small cluster shifts don't trigger visible pan motion.
    if (!lockActive && wSum > 0) {
        const candidateX = wX / wSum;
        if (Math.abs(candidateX - getTgtX()) > camHystF * FRET_WIDTH_MID) setTgtX(candidateX);
    }
    return lockActive;
}


/* ── Fret-label measure-skip rule ───────────────────────────────── */
// For each (note_time, fret) pair across standalone notes and chord
// notes, determine which ones are allowed to display their fret
// indicator number. Rule: per fret (regardless of string), show the
// number only on the first note in a given measure; suppress it for
// the immediately following measure; then allow it again (current
// measure + 2).
// Key scheme: Math.round(t * 25) * 100 + fret  (40 ms time buckets).
// Using a coarse time-bucket (not exact time) ensures that a synthetic
// chord template whose .t differs from the corresponding standalone
// arpeggio note by a few ms still resolves to the same key.
// Only standalone notes (notesArr) populate the set; regular chord notes
// never show labels, and synthetic chord notes share frets/onsets with
// their arpeggio counterparts, so the same keys are found at lookup time.
// Returns a Set of numeric keys (Math.round(t*25)*100 + fret).
function _buildFretLabelSet(notesArr, _chordsArr, beatsArr) {
    const events = [];
    if (notesArr) {
        for (let _i = 0; _i < notesArr.length; _i++) {
            const _n = notesArr[_i];
            if (_n.f > 0) events.push({ t: _n.t, f: _n.f });
        }
    }
    // Chord events intentionally excluded: regular chord notes don't show
    // fret labels; synthetic chord notes share frets with arpeggio note-stream
    // notes already captured above, so no separate chord processing needed.
    events.sort((a, b) => a.t - b.t);
    const beats = beatsArr || [];
    let beatIdx = 0;
    let currentMeasure = 0;
    const nextShowMeasure = new Map(); // fret → next measure where label is allowed
    const allowed = new Set();
    for (let _ei = 0; _ei < events.length; _ei++) {
        const { t, f } = events[_ei];
        // Advance beats pointer: find the current measure for time t.
        while (beatIdx < beats.length && beats[beatIdx].time <= t + 1e-4) {
            if (beats[beatIdx].measure >= 0) currentMeasure = beats[beatIdx].measure;
            beatIdx++;
        }
        const nextM = nextShowMeasure.get(f) ?? 0;
        if (currentMeasure >= nextM) {
            // Time-bucket key: 40 ms groups absorb timing jitter while
            // still distinguishing notes at different positions in the measure.
            allowed.add(Math.round(t * 25) * 100 + f);
            // Suppress this fret for the next measure; re-allow at +2.
            nextShowMeasure.set(f, currentMeasure + 2);
        }
    }
    return allowed;
}

// Smoothed playback clock for this frame. Called once per frame at the
// top of update(); camUpdate() reads the stored getFrameNow() afterward so
// notes and camera share one clock. See the _clk* state block above.
function smoothNow(bundle) {
    const raw = bundle.currentTime;
    const p = performance.now();
    // Host pause signal (feedBack core's bundle.isPlaying): when the
    // chart clock isn't advancing (paused / stalled / mid-seek), don't
    // extrapolate forward against a frozen audio sample — that creeps
    // the highway ahead by up to the interp cap and then snaps back
    // when dt finally crosses 0.1. Re-anchor to raw so the next
    // playing frame resumes from a clean segment. `=== false` so
    // downlevel hosts (isPlaying undefined) fall through to the
    // staleness-based cap below, preserving prior behavior there.
    if (bundle.isPlaying === false) {
        setClkAudioT(raw); setClkPerf(p);
        setClkRate(1);
        const _fnv = raw; setFrameNow(_fnv); return _fnv;
    }
    if (raw !== getClkAudioT()) {
        // New audio sample — re-anchor and refine the rate estimate.
        if (!Number.isNaN(getClkPerf())) {
            const dP = (p - getClkPerf()) / 1000;
            if (dP > 0.001 && dP < 0.5) {
                const r = (raw - getClkAudioT()) / dP;
                setClkRate((r > 0.05 && r < 5) ? r : 1); // seek/loop → reset
            } else if (dP >= 0.5) {
                setClkRate(1); // long gap (paused / tab inactive)
            }
        }
        setClkAudioT(raw); setClkPerf(p);
        const _fnv = raw; setFrameNow(_fnv); return _fnv;
    }
    // Same audio sample as last call — interpolate forward, capped so a
    // stalled main thread or paused audio can't run the clock away.
    const dt = (p - getClkPerf()) / 1000;
    if (dt <= 0 || dt > 0.1) { const _fnv3 = raw; setFrameNow(_fnv3); return _fnv3; }
    const _fnv2 = getClkAudioT() + getClkRate() * dt; setFrameNow(_fnv2); return _fnv2;
}

/* ── Per-frame rendering ─────────────────────────────────────────── */
// ── GPU pre-warm (perf: first-appearance hitches) ─────────────────
// Three.js compiles a material's shader program and uploads a
// texture the first frame the owning object renders — profiled as
// mid-song frame spikes (getParameters / texSubImage2D). Pay those
// costs during init (load spinner) instead:
//   _prewarmStatic()      — ren.compile() over the fully-built scene
//                           + deterministic label textures (fret
//                           numbers in every per-frame style/colour
//                           combo).
//   _prewarmChart(bundle) — chart-dependent labels (chord template
//                           names, section names); needs the ready
//                           bundle, so it runs once from the first
//                           draw() after each init.
// txtMat() rasterises into the unbounded cache these draws hit
// anyway; ren.initTexture() forces the GPU upload now.
// _setLabelMap is defined in screen.js and passed as DI (F2: used by both
// createNoteRenderer and createRenderer — must live in screen.js scope before
// either factory is wired).

let _chartPrewarmed = false;
function _prewarmTex(mat) {
    if (mat && mat.map && getRen()) getRen().initTexture(mat.map);
}
function _prewarmStatic() {
    const nStr = getNStr();
    // MAINTENANCE NOTE: this list must cover every deterministic
    // (chart-independent) material/texture the per-frame paths can
    // request lazily. Adding a new label style or sprite factory to
    // drawNote()/update() without warming it here silently
    // reintroduces a first-appearance texSubImage2D/compile spike
    // mid-song. Chart-dependent labels (chord names, section names)
    // live in _prewarmChart.
    try {
        if (getRen() && getScene() && getCam()) getRen().compile(getScene(), getCam());
    } catch (e) { console.warn('[3D-Hwy] prewarm compile:', e); }
    try {
        // Fret-number labels in the per-frame style/colour combos.
        for (let f = 0; f <= NFRETS; f++) {
            _prewarmTex(txtMat(f, FRET_LABEL_GOLD_HEX, false, 'noteFret'));
            _prewarmTex(txtMat(f, FRET_LABEL_GOLD_HEX, false, 'fretRow'));
            _prewarmTex(txtMat(f, FRET_LABEL_IDLE_HEX, false, 'fretRow'));
            _prewarmTex(txtMat(f, '#ffffff', false, 'ghostFret'));
        }
        // Teaching marks (drawNote _drawTeachMark): finger hints
        // T/1-4 (teachFg) and scale degrees 0-11 (teachSd).
        _prewarmTex(txtMat('T', '#7fd1ff', false, 'teachFg'));
        for (let i = 1; i <= 4; i++) _prewarmTex(txtMat(String(i), '#7fd1ff', false, 'teachFg'));
        for (let i = 0; i <= 11; i++) _prewarmTex(txtMat(String(i), '#ffcc66', false, 'teachSd'));
        // Technique sprite factories (own caches, keyed by packed
        // number): PM/FH mute X, hammer/pull triangles, bend
        // chevron stacks, slide direction arrows — per string
        // colour of the active palette.
        _prewarmTex(palmMuteXSpriteMat());
        _prewarmTex(fretHandMuteXSpriteMat());
        const _nWarm = Math.min(
            Math.max(nStr, 6),
            (activePalette && activePalette.length) || 0);
        for (let s = 0; s < _nWarm; s++) {
            const hex = activePalette[s] || 0xffffff;
            _prewarmTex(triMat(true, hex));
            _prewarmTex(triMat(false, hex));
            for (let st = 1; st <= 4; st++) _prewarmTex(bendChevronMat(st, hex));
            const arrowHex = darkenHex(hex, 0.55);
            _prewarmTex(slideArrowMat(true, arrowHex));
            _prewarmTex(slideArrowMat(false, arrowHex));
        }
    } catch (e) { console.warn('[3D-Hwy] prewarm labels:', e); }
}
function _prewarmChart(bundle) {
    try {
        const tpls = bundle && bundle.chordTemplates;
        if (Array.isArray(tpls)) {
            for (const tpl of tpls) {
                if (tpl && tpl.name) _prewarmTex(txtMat(tpl.name, '#e8d080', true, 'chord'));
            }
        }
        const secs = bundle && bundle.sections;
        if (Array.isArray(secs)) {
            for (const s of secs) {
                if (s && s.name) _prewarmTex(txtMat(s.name, '#00cccc', true, 'section'));
            }
        }
    } catch (e) { console.warn('[3D-Hwy] prewarm chart labels:', e); }
}

function update(bundle) {
    pbBeg(0);

    // ── Per-frame DI getter aliases ──────────────────────────────────────────
    // Cache all DI getters once per frame so the body uses original var names.
    // Setter DI calls at write sites (beyond-subst) are scattered in the body.
    const mHitBright      = getMHitBright();
    const mHitSusOutline  = getMHitSusOutline();
    const glowMul         = getGlowMul();
    const _venueSceneOverride = getVenueSceneOverride();
    const projMeshArr     = getProjMeshArr();
    const nStr            = getNStr();
    const textSize        = getTextSize();
    const cameraMode      = getCameraMode();
    const cameraSmoothing = getCameraSmoothing();
    const zoomSmoothing   = getZoomSmoothing();
    const cameraLockLow   = getCameraLockLow();
    const cameraLockZoom  = getCameraLockZoom();
    const _inlayLabels    = getInlayLabels();
    const lefty           = getLeftyCached();
    const inverted        = getInverted();
    // Pools (all 33 — reset at update() start):
    const pNote           = getPNote();
    const pNoteEdge       = getPNoteEdge();
    const pSus            = getPSus();
    const pSusOutline     = getPSusOutline();
    const pSusRibbon      = getPSusRibbon();
    const pSusRibbonOl    = getPSusRibbonOl();
    const pTapChevron     = getPTapChevron();
    const pAccentHalo     = getPAccentHalo();
    const pLbl            = getPLbl();
    const pArpBracket     = getPArpBracket();
    const pBeat           = getPBeat();
    const pSec            = getPSec();
    const pFretLbl        = getPFretLbl();
    const pLane           = getPLane();
    const pLaneDivider    = getPLaneDivider();
    const pGhostFretLbl   = getPGhostFretLbl();
    const pChordBox       = getPChordBox();
    const pChordFrameFill = getPChordFrameFill();
    const pChordLbl       = getPChordLbl();
    const pBarreLine      = getPBarreLine();
    const pHaloBar        = getPHaloBar();
    const pPMXFill        = getPPMXFill();
    const pFHXFill        = getPFHXFill();
    const pMuteXLines     = getPMuteXLines();
    const pFHXLines       = getPFHXLines();
    const pNoteFretLabel  = getPNoteFretLabel();
    const pConnectorLine  = getPConnectorLine();
    const pDropLine       = getPDropLine();
    const pTeachMarkLbl   = getPTeachMarkLbl();
    const pFretColMarker  = getPFretColMarker();
    const pSusRail        = getPSusRail();
    const pSusRailBloom   = getPSusRailBloom();
    const pTechPlane      = getPTechPlane();
    // ────────────────────────────────────────────────────────────────────────
    // [verdict glow] Apply the level-driven verdict brightness captured
    // last frame (1-frame lag is imperceptible), then reset for this
    // frame's capture in the gem path below. vg = 1 when no provider
    // alpha was seen (legacy event path / note_detect off), leaving the
    // authored 4.0/0.7 × glowMul brightness from _applyGlow() untouched.
    // Only the verdict-only materials (mHitBright + its face-fill arrays,
    // and the hit sustain outline) are scaled — never mStrHitOutline,
    // which is the default rim for every fretted note.
    {
        const vg = getNdVerdictSawAlpha() ? getNdVerdictMaxAlpha() : 1;
        const venueGemMul = _venueSceneOverride ? VENUE_GEM_EMISSIVE_MUL : 1;
        for (let s = 0; s < mHitBright.length; s++) {
            if (mHitBright[s]) mHitBright[s].emissiveIntensity = 4.0 * glowMul * vg * venueGemMul;
        }
        if (mHitSusOutline) mHitSusOutline.emissiveIntensity = 0.7 * glowMul * vg * venueGemMul;
        setNdVerdictMaxAlpha(0);
        setNdVerdictSawAlpha(false);
    }
    // Lean sustain rendering is the default (see declaration above):
    // the trail/ribbon outline always draws; only the additive rail
    // bloom halo is dropped. The full look (with bloom) is an opt-out.
    // localStorage.getItem is a synchronous storage read — polled at
    // ~1 Hz instead of every frame; the console flag still takes
    // effect live (within a second).
    if ((setLeanSusPollCounter(getLeanSusPollCounter() + 1), getLeanSusPollCounter() % 60) === 0) {
        try {
            setLeanSus(localStorage.getItem('h3d_full_sus') !== '1');
        } catch (_) { setLeanSus(true); }
    }
    // Materialize the text-size multiplier from the user's slider.
    // textSize ∈ [0,1]; getTextSizeMul() ∈ [0.5, 1.5] with 0.5 ↦ 1.0×
    // so default behaviour matches what the renderer did pre-slider.
    setTextSizeMul(0.5 + textSize);
    // Rescale inlay labels to track the live text-size slider.
    // buildBoard() sets an initial scale using (0.5 + textSize) but
    // getTextSizeMul() is only authoritative from here onward.
    // Guard: only update when the multiplier actually changed.
    if (getTextSizeMul() !== getTextSizeMulApplied()) {
        setTextSizeMulApplied(getTextSizeMul());
        for (let i = 0; i < _inlayLabels.length; i++) {
            const f = INLAY_LABEL_FRETS[i];
            const s = 5.5 * getTextSizeMul() * K * fretLabelScaleForFret(f);
            _inlayLabels[i].scale.set(s, s, 1);
        }
    }
    _syncOpenStringPitchLabels(bundle);

    pNote.reset(); pNoteEdge.reset(); pSus.reset(); pSusOutline.reset(); pSusRibbon.reset(); pSusRibbonOl.reset(); pTapChevron.reset(); pAccentHalo.reset(); pLbl.reset();
    pBeat.reset(); pSec.reset();
    if (projMeshArr) for (const arr of projMeshArr) for (const m of arr) m.visible = false;
    pFretLbl.reset(); pLane.reset(); pLaneDivider.reset();
    if (pGhostFretLbl) pGhostFretLbl.reset();
    _scrGhostUpcomingCount.fill(0, 0, nStr);
    pChordBox.reset(); pChordFrameFill.reset(); pChordLbl.reset(); pBarreLine.reset(); pArpBracket.reset(); pHaloBar.reset();
    setImPMTechCount(0); setImFHTechCount(0);
    setImPMXFillCount(0); setImPMXLinesCount(0); setImFHXFillCount(0); setImFHXLinesCount(0);
    if (pPMXFill) pPMXFill.reset();
    if (pFHXFill) pFHXFill.reset();
    if (pMuteXLines) pMuteXLines.reset();
    if (pFHXLines) pFHXLines.reset();
    pNoteFretLabel.reset(); pConnectorLine.reset(); pDropLine.reset();
    pTeachMarkLbl.reset();
    pFretColMarker.reset(); pSusRail.reset(); pSusRailBloom.reset(); pTechPlane.reset();
    // Clear per-frame queues in-place (avoid reallocating the array object).
    _ndLabels.length = 0;
    let hwyLaneArpOuterDividers = false;

    // Prune expired notedetect marks once per frame instead of
    // once per drawNote call (issue #9 perf nit). drawNote then
    // only does the bounded (s, f, t) match — no per-note
    // performance.now() / filter() needed. No arr[0] gate: the
    // dedupe path can refresh any entry's expiresAt, so gating on
    // arr[0] would silently skip expired entries behind it.
    setNdFrameNowMs(performance.now());
    // In-place prune — avoids allocating a new array every frame.
    // Marks are tiny (0–5 entries typically), so a backwards splice
    // loop is cheap and keeps the existing array object alive.
    if (_ndHitMarks.length) {
        for (let _pi = _ndHitMarks.length - 1; _pi >= 0; _pi--) {
            if (_ndHitMarks[_pi].expiresAt <= getNdFrameNowMs()) _ndHitMarks.splice(_pi, 1);
        }
    }
    if (_ndMissMarks.length) {
        for (let _pi = _ndMissMarks.length - 1; _pi >= 0; _pi--) {
            if (_ndMissMarks[_pi].expiresAt <= getNdFrameNowMs()) _ndMissMarks.splice(_pi, 1);
        }
    }
    // feedBack#254 — capture core's per-note judgment provider for
    // this frame's drawNote() calls (held-sustain glow + lit gems).
    // bundle.getNoteState is ALWAYS present (the core stub returns
    // null when no provider is registered), so its existence isn't
    // a "detect mode active" signal on its own.
    // bundle.getNoteStateProvider exposes the registered provider
    // (or null) directly — drive cull-window / chord-rim-floor
    // extensions off that so they don't activate in non-detect
    // mode. Downlevel hosts without getNoteStateProvider fall
    // back to the existence check, matching pre-PR behavior on
    // those builds.
    // ponytail: local-to-frame; no DI needed (bundle-sourced per call)
    let _ndGetNoteState = (bundle && typeof bundle.getNoteState === 'function') ? bundle.getNoteState : null;
    let _ndHasProvider = (bundle && typeof bundle.getNoteStateProvider === 'function')
        ? bundle.getNoteStateProvider() != null
        : !!_ndGetNoteState;

    const now = smoothNow(bundle);
    const t0 = now - BEHIND;
    const t1 = now + AHEAD;
    // With a verdict provider attached, keep notes and chord frames
    // in the outer loop past BEHIND so async verdicts (~0.4 s late)
    // still land while drawable; per-note / per-frame culling is
    // tightened back below.
    const ndVerdictT0 = _ndHasProvider
        ? now - Math.max(BEHIND, NOTEDETECT_GEM_VERDICT_WINDOW)
        : t0;
    // Prune _chordVerdicts latches whose chord has fully scrolled
    // past the loop's verdict-window cull. Forward playback never
    // re-encounters a chord, so without this prune the map would
    // grow unbounded for the rest of the song (each chord onset
    // contributes one entry, ~hundreds for a typical song).
    // verdictKey is now an integer encoded by _encodeChordVerdictKey
    // — time component sits in the upper bits, so a direct
    // ``k < pruneBeforeKey`` test prunes correctly without
    // parseFloat / String.slice on every entry.
    //
    // Backward seek (now < lastNow): every latched entry's
    // chord time is now ahead of `now`, the forward-only check
    // below would skip them all and the map would grow on every
    // loop. Clear wholesale — the chord-loop's `chDt > 0` eviction
    // re-creates entries as chords re-enter the pre-hit window.
    //
    // Forward playback: iterate every entry. An earlier `break`
    // optimization assumed Map insertion order tracked chord
    // time, but entries are inserted when a verdict OBSERVATION
    // lands — so a later chord whose verdict arrived first could
    // sit before an earlier chord whose verdict was still
    // pending, and breaking on the first in-window entry would
    // leave the now-older later-inserted entries un-pruned. Full
    // scan is O(n) but n is bounded (chord count in the song,
    // ~hundreds) so the per-frame cost is microseconds.
    if (_ndHasProvider && _chordVerdictsLastNow !== null && now < _chordVerdictsLastNow - 0.25) {
        // Backward seek — wipe all verdict latches so notes re-judge
        // from scratch regardless of whether chords were present.
        _chordVerdicts.clear();
        _susVerdictLatch.clear();
        // Score-pop dedup too: a practice loop / rewind re-judges
        // the same popKeys, and the wall-time TTL alone would
        // suppress their fresh "+N" pops for up to 4 s.
        fxClearSeen();
    }
    if (_ndHasProvider && _chordVerdicts.size > 0) {
        if (_chordVerdictsLastNow !== null && now < _chordVerdictsLastNow - 0.25) {
            // already cleared above
        } else {
            const pruneBefore = ndVerdictT0 - 0.5; // safety margin
            const pruneBeforeKey = Math.round(pruneBefore * _CV_KEY_TIME_MUL) * _CV_KEY_TIME_SLOT;
            for (const k of _chordVerdicts.keys()) {
                if (k < pruneBeforeKey) _chordVerdicts.delete(k);
            }
        }
    }
    _chordVerdictsLastNow = now;

    const notes = bundle.notes;
    // Skip the merge when inputs are identity-equal to the last
    // frame's; mergeHandShapeSynthChords is chart-static.
    let chords;
    if (getMergeCacheResult() !== null
        && _mergeCacheChordsRef === bundle.chords
        && _mergeCacheHsRef === bundle.handShapes
        && _mergeCacheTplRef === bundle.chordTemplates) {
        chords = getMergeCacheResult();
    } else {
        chords = mergeHandShapeSynthChords(
            bundle.chords,
            bundle.handShapes,
            bundle.chordTemplates,
        );
        setMergeCacheResult(chords);
        _mergeCacheChordsRef = bundle.chords;
        _mergeCacheHsRef = bundle.handShapes;
        _mergeCacheTplRef = bundle.chordTemplates;
    }

    let arpGhostHsInfer = null;
    const hsForArpGhost = bundle.handShapes;
    if (hsForArpGhost && hsForArpGhost.length && notes && notes.length) {
        const nHs = hsForArpGhost.length;
        while (_arpGhostHsInferScratch.length < nHs) _arpGhostHsInferScratch.push(false);
        // fillArpeggioGhostInferFlags is chart-static — skip if
        // the input refs match the previous frame's.
        if (_arpGhostInferRefHs !== hsForArpGhost
            || _arpGhostInferRefNotes !== notes
            || _arpGhostInferRefTpl !== bundle.chordTemplates) {
            _arpSynthOnsetHsSet.clear();
            fillArpeggioGhostInferFlags(hsForArpGhost, bundle.chordTemplates, notes, _arpGhostHsInferScratch, _arpSynthOnsetHsSet);
            _arpGhostInferRefHs = hsForArpGhost;
            _arpGhostInferRefNotes = notes;
            _arpGhostInferRefTpl = bundle.chordTemplates;
        }
        arpGhostHsInfer = _arpGhostHsInferScratch;
    }

    // ── Arpeggio-persist pre-pass ─────────────────────────────────
    // Notes in active arpeggio handshapes must keep rendering their
    // fretboard ghost + brackets until arpBounds.end, even after
    // their onset+sustain exits the normal back-window (t0 = now-0.5s).
    // Build a Set of "t_s" keys so the notes loop can skip the normal
    // window check for these notes.
    // Reuse hoisted Set — clear instead of reallocating every frame.
    _scrArpPersistKeys.clear();
    const _arpPersistKeys = _scrArpPersistKeys;
    if (arpGhostHsInfer && bundle.handShapes && notes) {
        for (let _hi = 0; _hi < bundle.handShapes.length; _hi++) {
            if (!arpGhostHsInfer[_hi]) continue;
            const _hs = bundle.handShapes[_hi];
            const _lo = hsStart(_hs), _hi2 = hsEnd(_hs);
            if (Number.isNaN(_lo) || Number.isNaN(_hi2)) continue;
            if (now > _hi2 + 0.05) continue; // arpeggio already ended
            // Only persist notes that have already exited the normal back-window
            // (onset+sustain < t0). Notes still in the window enter the loop via
            // the normal check; future notes are gated by the t1 check below.
            const _nLo = lowerBoundT(notes, _lo - 0.01);
            for (let _ni = _nLo; _ni < notes.length; _ni++) {
                const _n = notes[_ni];
                if (_n.t > _hi2 + 0.05) break;
                if (_n.t + (_n.sus || 0) < t0) {
                    _arpPersistKeys.add(_noteKey(_n.t, _n.s));
                }
            }
        }
    }

    // ── Slide-target gem-suppression pre-pass (chart-static) ──────
    // Detects notes in bundle.notes that are the slide/link destination
    // of a preceding note. The gem (outline+core) is suppressed via
    // skipBody=true, but the sustain/slide trail still renders because
    // the trail block is now outside the !skipBody gate in drawNote().
    //
    // NOTE: an authored `linkNext` flag is NOT present in bundle.notes —
    // note_to_wire() in lib/song.py emits only t, s, f, sus, sl, slu,
    // bn, ho, po, hm, hp, pm, mt, vb, tr, ac, tp. So this is an
    // intentional timing/fret heuristic, not a link-flag lookup.
    //
    // Two source patterns (source has sus > 0):
    //   Case 1 — source has sl/slu: destination.f === source's slide target
    //   Case 2 — same fret (hold), destination has sl/slu (hold→slide)
    //
    // Sources can be single notes OR chord notes (bundle.chords).
    if (notes !== getSlideTargetNotesRef() || bundle.chords !== getSlideTargetChordsRef()) {
        setSlideTargetSet(null);
        if (notes && notes.length) {
            const stSet = new Set();
            const checkSrc = (srcT, srcS, srcF, srcSus, srcSl) => {
                if (!(srcSus > 0)) return;
                const endT = srcT + srcSus;
                // Reuse the renderer's shared next-on-string tolerance
                // rather than a separate hardcoded literal.
                const EPS = NEXT_ON_STRING_T_EPS;
                let lo = 0, hi = notes.length;
                while (lo < hi) { const m = (lo + hi) >> 1; if (notes[m].t < endT - EPS) lo = m + 1; else hi = m; }
                for (let j = lo; j < notes.length; j++) {
                    const q = notes[j];
                    if (q.t > endT + EPS) break;
                    if (q.s !== srcS || q.t <= srcT || Math.abs(q.t - endT) >= EPS) continue;
                    const qSl = (Number.isFinite(q.sl) && q.sl >= 0) ? q.sl
                              : (Number.isFinite(q.slu) && q.slu >= 0) ? q.slu : -1;
                    if (srcSl >= 0 && q.f === srcSl) { stSet.add(_noteKey(q.t, q.s)); break; } // case 1
                    if (q.f === srcF && qSl >= 0)    { stSet.add(_noteKey(q.t, q.s)); break; } // case 2
                }
            };
            for (let i = 0; i < notes.length; i++) {
                const p = notes[i];
                checkSrc(p.t, p.s, p.f, p.sus,
                    (Number.isFinite(p.sl) && p.sl >= 0) ? p.sl : (Number.isFinite(p.slu) && p.slu >= 0) ? p.slu : -1);
            }
            const rc = bundle.chords;
            if (rc && rc.length) {
                for (let ci = 0; ci < rc.length; ci++) {
                    const ch = rc[ci]; if (!ch.notes) continue;
                    for (let ni = 0; ni < ch.notes.length; ni++) {
                        const cn = ch.notes[ni];
                        checkSrc(ch.t, cn.s, cn.f, cn.sus,
                            (Number.isFinite(cn.sl) && cn.sl >= 0) ? cn.sl : (Number.isFinite(cn.slu) && cn.slu >= 0) ? cn.slu : -1);
                    }
                }
            }
            if (stSet.size > 0) setSlideTargetSet(stSet);
        }
        setSlideTargetNotesRef(notes);
        setSlideTargetChordsRef(bundle.chords);
    }

    /** Arpeggio lane purple rails — authored-marker cache + bounds cache. */
    let laneRailArpHsFlags = null;
    let laneRailBoundLo = null;
    let laneRailBoundHi = null;
    const hsLaneRail = bundle.handShapes;
    const notesArrForRails = notes || [];
    if (hsLaneRail && hsLaneRail.length) {
        const nHsL = hsLaneRail.length;
        while (_arpLaneRailHsScratch.length < nHsL) _arpLaneRailHsScratch.push(false);
        while (_arpRailBoundLoScratch.length < nHsL) {
            _arpRailBoundLoScratch.push(0);
            _arpRailBoundHiScratch.push(0);
        }
        // Authored-marker flags depend only on (handShapes, templates).
        if (_laneRailFlagsRefHs !== hsLaneRail
            || _laneRailFlagsRefTpl !== bundle.chordTemplates) {
            fillLaneRailHandShapeFlags(hsLaneRail, bundle.chordTemplates, _arpLaneRailHsScratch);
            _laneRailFlagsRefHs = hsLaneRail;
            _laneRailFlagsRefTpl = bundle.chordTemplates;
        }
        // Bounds cache depends on (handShapes, chords, templates, notes).
        if (_laneRailBoundsRefHs !== hsLaneRail
            || _laneRailBoundsRefChords !== chords
            || _laneRailBoundsRefTpl !== bundle.chordTemplates
            || _laneRailBoundsRefNotes !== notesArrForRails) {
            fillArpeggioRailShapeBoundsCaches(
                hsLaneRail,
                chords ?? [],
                bundle.chordTemplates,
                notesArrForRails,
                _arpLaneRailHsScratch,
                _arpRailBoundLoScratch,
                _arpRailBoundHiScratch,
            );
            _laneRailBoundsRefHs = hsLaneRail;
            _laneRailBoundsRefChords = chords;
            _laneRailBoundsRefTpl = bundle.chordTemplates;
            _laneRailBoundsRefNotes = notesArrForRails;
        }
        laneRailArpHsFlags = _arpLaneRailHsScratch;
        laneRailBoundLo = _arpRailBoundLoScratch;
        laneRailBoundHi = _arpRailBoundHiScratch;
    }
    const beats = bundle.beats;
    // Rebuild the fret-label visibility set whenever the chart changes.
    if (notes !== _fretLabelNotesRef) {
        _fretLabelAllowed = _buildFretLabelSet(notes, chords, beats);
        _fretLabelNotesRef = notes;
    }
    // Rebuild the measure-start time cache whenever beats change. Only
    // beats that begin a measure carry measure >= 0; intra-measure beats
    // (measure === -1) are skipped. Drives the lookahead window.
    if (beats !== getMeasureStartsRef()) {
        setMeasureStartsRef(beats);
        const _ms = [];
        if (beats) {
            for (let _bi = 0; _bi < beats.length; _bi++) {
                const _b = beats[_bi];
                if (_b && Number.isFinite(_b.measure) && _b.measure >= 0) _ms.push(_b.time);
            }
        }
        setMeasureStarts(_ms);
    }
    const sections = bundle.sections;
    const anchors = bundle.anchors;

    // ── Fret wire anchor highlight ─────────────────────────────────
    // Default all wires to gray; wires inside the active anchor range
    // turn gold to match the dynamic highway lane boundary exactly.
    // Uses laneBoundsFromAnchor() — the same helper the lane uses —
    // so the gold fret wires on the board align with the lane edges:
    //   dMin = fret - 1,  dMax = fret + width - 1
    // e.g. { fret:3, width:4 } → dMin=2, dMax=6 → wires 2,3,4,5,6 gold.
    if (fretWireMats.length) {
        const _fwBounds = anchors && anchors.length
            ? anchorLaneBoundsAt(anchors, now) : null;
        const _fwMin = _fwBounds ? _fwBounds.dMin : -1;
        const _fwMax = _fwBounds ? _fwBounds.dMax : -1;
        for (let _f = 0; _f <= NFRETS; _f++) {
            const _m = fretWireMats[_f];
            if (!_m) continue;
            if (_fwMin >= 0 && _f >= _fwMin && _f <= _fwMax) {
                _m.color.setHex(FRET_WIRE_ACTIVE_HEX);
                _m.opacity = FRET_WIRE_ACTIVE_OP;
            } else {
                _m.color.setHex(FRET_WIRE_IDLE_HEX);
                _m.opacity = FRET_WIRE_IDLE_OP;
            }
            // Baseline emissive every frame: the hit-flash pass below
            // lerps these toward FRET_WIRE_HIT_* in place, so they must
            // be re-seeded or a flash would never fade back out.
            _m.emissive.setHex(FRET_EMISSIVE);
            _m.emissiveIntensity = 1;
        }
    }

    const lookaheadBoundsNow = (cameraMode === 'lookahead')
        ? lookaheadComputeFretBounds(now, anchors, notes, chords)
        : null;

    // Open-string note width: same outer span as chord frame (anchor + padX,
    // or default 4-fret window when chart has no anchor at t).
    const padChordOpenX = NW * 0.4;
    const openNoteLaneBoxW = chartTime => {
        const chAncB = anchorLaneBoundsAt(anchors, chartTime);
        if (chAncB) {
            const xl = fretX(chAncB.dMin);
            const xr = fretX(chAncB.dMax);
            if (xr > xl) return (xr - xl) + padChordOpenX * 2;
        }
        const spanF = 4;
        const fMinCh = 1;
        const fMaxCh = fMinCh + spanF - 1;
        const xl = fretX(fMinCh - 1);
        const xr = fretX(Math.max(fMaxCh, fMinCh + 2));
        if (xr > xl) return (xr - xl) + padChordOpenX * 2;
        return 40 * K;
    };

    // ── Frame state ───────────────────────────────────────────────
    // Reuse hoisted scratch arrays — reset only the live [0..nStr) /
    // [0..NFRETS] range instead of allocating new arrays every frame.
    _scrStringSustain.fill(false, 0, nStr);
    _scrStringAnticipation.fill(0, 0, nStr);
    _scrFretHeat.fill(0);           // always NFRETS+1, cheap flat fill
    _fwHitIn.fill(0);               // this frame's confirmed-hit frets
    _rimFlashIn.fill(0);            // this frame's per-string rim-flash alphas
    _fwChordAcc.clear();
    _scrStrGlow.fill(0.5, 0, nStr);
    _scrAccentFillBoost.fill(0, 0, nStr);
    const noteState = {
        stringSustain:    _scrStringSustain,
        stringAnticipation: _scrStringAnticipation,
        fretHeat:         _scrFretHeat,
        strGlow:          _scrStrGlow,
        /** Per-string extra drive for `.ac` gem fill only (`mAccentCore`). */
        accentFillBoost:  _scrAccentFillBoost,
    };

    pbBeg(1);
    // Compute sustain / anticipation / fret heat / per-string glow.
    // Use lowerBoundT to skip notes far in the past (>30s sustain is
    // unrealistic); break once notes are >2s ahead (nothing beyond
    // contributes to fretHeat/anticipation/strGlow).
    if (notes) {
        const _fsLo = lowerBoundT(notes, now - 30);
        for (let _ni = _fsLo; _ni < notes.length; _ni++) {
            const n = notes[_ni];
            if (!validString(n.s)) continue;
            const dt = n.t - now;
            if (dt > 2.0) break;
            const susEnd = n.t + (n.sus || 0);
            if (dt > 0 && dt < 0.6)
                noteState.stringAnticipation[n.s] = Math.max(noteState.stringAnticipation[n.s], 1 - dt / 0.6);
            if (n.f > 0) {
                if (now >= n.t && now <= susEnd) noteState.fretHeat[n.f] = 1;
                else if (n.t > now) noteState.fretHeat[n.f] = Math.max(noteState.fretHeat[n.f], Math.max(0, 1 - dt / 2));
            }
            if (now >= n.t && now <= susEnd) noteState.stringSustain[n.s] = true;
            const sustained = dt < 0 && (n.sus || 0) > 0 && now <= susEnd;
            const hitDist = Math.abs(dt);
            if (hitDist < 0.15 || sustained) {
                const hitFade = sustained ? 0.7 : (1 - hitDist / 0.15);
                noteState.strGlow[n.s] = Math.max(noteState.strGlow[n.s], 1.0 + hitFade * 1.5);
            }
        }
    }
    if (chords) {
        // Skip chords further than 30s in the past (covers any sustained chord).
        const _cfsLo = lowerBoundT(chords, now - 30);
        for (let _cni = _cfsLo; _cni < chords.length; _cni++) {
            const ch = chords[_cni];
            if (!ch.notes) continue;
            const dt = ch.t - now;
            if (dt > 2.0) break;
            const chordNotes = filterValidNotes(ch.notes);
            if (chordNotes.length === 0) continue;
            let maxSus = 0;
            for (const n of chordNotes) if ((n.sus || 0) > maxSus) maxSus = n.sus;
            const susEnd = ch.t + maxSus;
            for (const cn of chordNotes) {
                if (dt > 0 && dt < 0.6)
                    noteState.stringAnticipation[cn.s] = Math.max(noteState.stringAnticipation[cn.s], 1 - dt / 0.6);
                if (cn.f > 0) {
                    if (now >= ch.t && now <= susEnd) { noteState.fretHeat[cn.f] = 1; continue; }
                    if (ch.t > now) noteState.fretHeat[cn.f] = Math.max(noteState.fretHeat[cn.f], Math.max(0, 1 - dt / 2));
                }
            }
            if (now >= ch.t && now <= susEnd)
                for (const cn of chordNotes) noteState.stringSustain[cn.s] = true;
            const sustained = dt < 0 && maxSus > 0 && now <= susEnd;
            const hitDist = Math.abs(dt);
            if (hitDist < 0.15 || sustained) {
                const hitFade = sustained ? 0.7 : (1 - hitDist / 0.15);
                for (const cn of chordNotes) {
                    noteState.strGlow[cn.s] = Math.max(noteState.strGlow[cn.s], 1.0 + hitFade * 1.5);
                }
            }
        }
    }

    pbEnd(1);
    pbBeg(2);
    // ── Next-note-by-string lookahead (for anticipation projection) ──
    // Ghost projection window is 0.6s; fretLastActiveTime needs +2s.
    // Use lowerBoundT to skip past notes and break at +2s.
    _scrNextNoteByString.fill(null, 0, nStr);
    const nextNoteByString = _scrNextNoteByString;
    if (notes) {
        const _nnLo = lowerBoundT(notes, now);
        for (let _ni = _nnLo; _ni < notes.length; _ni++) {
            const n = notes[_ni];
            if (n.t > now + 2) break;
            if (!validString(n.s)) continue;
            if (!nextNoteByString[n.s] || n.t < nextNoteByString[n.s].t) nextNoteByString[n.s] = n;
            if (n.f > 0) fretLastActiveTime[n.f] = now;
        }
    }
    if (chords) {
        // Time-sorted: lowerBoundT skips past historical chords in O(log N)
        // instead of walking the entire prefix every frame.
        const _ncLo = lowerBoundT(chords, now);
        for (let _ci = _ncLo; _ci < chords.length; _ci++) {
            const ch = chords[_ci];
            if (ch.t > now + 2) break;
            if (!ch.notes || ch.t <= now) continue;
            for (const cn of ch.notes) {
                if (!validString(cn.s)) continue;
                if (!nextNoteByString[cn.s] || ch.t < nextNoteByString[cn.s].t) {
                    // Reuse per-string scratch object — avoids `{ ...cn, t }` spread allocation.
                    const _sd = _scrNextNoteByStringData[cn.s];
                    Object.assign(_sd, cn);
                    _sd.t = ch.t;
                    nextNoteByString[cn.s] = _sd;
                }
                if (cn.f > 0) fretLastActiveTime[cn.f] = now;
            }
        }
    }

    _drawNextByString = nextNoteByString;
    _drawChordTemplates = bundle.chordTemplates ?? null;
    _drawAnchors = anchors ?? null;
    _drawTeachingMarks = !!bundle.teachingMarksVisible;
    // Default on: only an explicit false (older bundles omit the flag) hides fg.
    _showFingerHints = bundle.fingerHintsVisible !== false;

    // ── Recent-past event per string (for _nextAnyT deadline) ─────
    // Once a note/chord passes `now` it leaves _drawNextByString,
    // resetting _nextAnyT and letting old gems linger too long.
    // Scan back at least CHORD_HWY_LINGER_S so the deadline logic
    // can see every event that lands inside any active linger
    // window (chord frame linger and gem linger both cap at
    // CHORD_HWY_LINGER_S — a tighter scan would miss events in
    // (now - CHORD_HWY_LINGER_S, now - 0.6) and let the frame
    // linger past the next event).
    {
        // Hoisted scratch — avoids `new Array(nStr).fill(...)` every frame.
        const _recArr = _scrRecentByString;
        for (let i = 0; i < nStr; i++) _recArr[i] = -Infinity;
        if (notes) {
            let _ri = lowerBoundT(notes, now);
            for (let i = _ri - 1; i >= 0; i--) {
                const n = notes[i];
                if (n.t < now - CHORD_HWY_LINGER_S) break;
                if (validString(n.s) && n.t > _recArr[n.s]) _recArr[n.s] = n.t;
            }
        }
        if (chords) {
            // Time-sorted: start at the last chord ≤ now instead of
            // chords.length-1 (which walks past every future chord
            // when `now` is early in the song).
            //
            // lowerBoundT returns the first index with t >= now. If
            // chords share the same timestamp, walk forward through
            // the t===now run to the LAST one (so all duplicates at
            // `now` are included — the original `if (ch.t > now)
            // continue` scan-from-end included them all). When no
            // chord is exactly at `now`, start one slot back.
            const _ncHi = lowerBoundT(chords, now);
            let _ci = _ncHi;
            if (_ci < chords.length && chords[_ci].t === now) {
                while (_ci + 1 < chords.length && chords[_ci + 1].t === now) _ci++;
            } else {
                _ci -= 1;
            }
            for (; _ci >= 0; _ci--) {
                const ch = chords[_ci];
                if (ch.t < now - CHORD_HWY_LINGER_S) break;
                if (!ch.notes) continue;
                for (const cn of ch.notes) {
                    if (validString(cn.s) && ch.t > _recArr[cn.s]) _recArr[cn.s] = ch.t;
                }
            }
        }
        _drawRecentByString = _recArr;
    }

    // ── Sorted union of next/recent event times ──────────────────
    // Populate the scalar scratch used by _firstEventTimeGreaterThan
    // — at most 2 * nStr finite values, then sorted ascending.
    // Float64Array.subarray returns a view, so .sort() runs in place
    // over the live prefix without copying or allocating.
    // Pulls directly from _drawNextByString / _drawRecentByString
    // (closure-scoped, populated just above) so we're independent of
    // the recent-event prepass's inner-block ``_recArr`` alias.
    setScrEventTimesLen(0);
    for (let s = 0; s < nStr; s++) {
        const nf = _drawNextByString[s];
        if (nf) {
            const tn = nf.t;
            if (Number.isFinite(tn)) { const _etl = getScrEventTimesLen(); _scrEventTimes[_etl] = tn; setScrEventTimesLen(_etl + 1); }
        }
        const rt = _drawRecentByString[s];
        if (Number.isFinite(rt)) { const _etl = getScrEventTimesLen(); _scrEventTimes[_etl] = rt; setScrEventTimesLen(_etl + 1); }
    }
    if (getScrEventTimesLen() > 1) {
        _scrEventTimes.subarray(0, getScrEventTimesLen()).sort();
    }

    // ── Ghost preview gap prepass ──────────────────────────────────
    // For each note/chord in the upcoming 0.65s window, record the
    // onset time of its immediate predecessor on the same string.
    // drawNote() uses this to shrink the ghost preview window from
    // the fixed 0.6s down to min(0.6, gap) so in dense passages the
    // fret label doesn't float 0.6s ahead with no gem in sight.
    //
    // Two-pointer merge over time-sorted notes + chords so the
    // predecessor is correct even when notes and chords interleave.
    // Map with numeric key avoids per-frame string allocation;
    // key = Math.round(t*1e4)*10 + s (unique for notes > 0.1 ms apart).
    // Buffer is hoisted (_scrGhostPrevBuf) and cleared at the top of
    // the prepass; per-string predecessor tracker likewise (_scrGhostLastT).
    _scrGhostPrevBuf.clear();
    const _ghostPrevBuf = _scrGhostPrevBuf;
    {
        for (let _i = 0; _i < nStr; _i++) _scrGhostLastT[_i] = -Infinity;
        const _gLastT = _scrGhostLastT;
        let _gni = notes ? lowerBoundT(notes, now - 1) : 0;
        let _gci = 0;
        if (chords) while (_gci < chords.length && chords[_gci].t < now - 1) _gci++;
        while (true) {
            const nt = (notes && _gni < notes.length) ? notes[_gni].t : Infinity;
            const ct = (chords && _gci < chords.length) ? chords[_gci].t : Infinity;
            const minT = nt <= ct ? nt : ct;
            if (minT > now + 0.65 || minT === Infinity) break;
            if (nt <= ct) {
                const n = notes[_gni++];
                if (validString(n.s)) {
                    _ghostPrevBuf.set(Math.round(n.t * 1e4) * 10 + n.s, _gLastT[n.s]);
                    _gLastT[n.s] = n.t;
                }
            } else {
                const ch = chords[_gci++];
                if (ch.notes) for (const cn of ch.notes) {
                    if (validString(cn.s)) {
                        _ghostPrevBuf.set(Math.round(ch.t * 1e4) * 10 + cn.s, _gLastT[cn.s]);
                        _gLastT[cn.s] = ch.t;
                    }
                }
            }
        }
    }

    // Ramp strGlow while the board ghost is visible so the flying note
    // core + rim read as one solid string-coloured shape with proj.
    // Window is (0, PROJ_WIN_MERGE=0.6s) — use lowerBoundT + break.
    const PROJ_WIN_MERGE = 0.6;
    if (notes) {
        const _sgLo = lowerBoundT(notes, now);
        for (let _ni = _sgLo; _ni < notes.length; _ni++) {
            const n = notes[_ni];
            if (!validString(n.s) || n.f <= 0) continue;
            const dt = n.t - now;
            if (dt >= PROJ_WIN_MERGE) break;
            const nn = nextNoteByString[n.s];
            if (!nn || Math.abs(nn.t - n.t) > NEXT_ON_STRING_T_EPS) continue;
            const blend = 1 - dt / PROJ_WIN_MERGE;
            noteState.strGlow[n.s] = Math.max(noteState.strGlow[n.s], 1.0 + blend * 1.2);
        }
    }
    if (chords) {
        const _projLo = lowerBoundT(chords, now);
        for (let _pci = _projLo; _pci < chords.length; _pci++) {
            const ch = chords[_pci];
            if (!ch.notes || ch.t <= now) continue;
            const dt = ch.t - now;
            if (dt >= PROJ_WIN_MERGE) break;
            const chordNotes = filterValidNotes(ch.notes);
            for (const cn of chordNotes) {
                if (cn.f <= 0) continue;
                const nn = nextNoteByString[cn.s];
                if (!nn || Math.abs(nn.t - ch.t) > NEXT_ON_STRING_T_EPS) continue;
                const blend = 1 - dt / PROJ_WIN_MERGE;
                noteState.strGlow[cn.s] = Math.max(noteState.strGlow[cn.s], 1.0 + blend * 1.2);
            }
        }
    }

    // Accent: brighter note body (`mGlow` in drawNote) instead of the old '>' sprite.
    // Notes are sorted — break once past the AHEAD window.
    if (notes) {
        const _acLo = lowerBoundT(notes, now - AHEAD);
        for (let _ni = _acLo; _ni < notes.length; _ni++) {
            const n = notes[_ni];
            if (!validString(n.s) || !n.ac) continue;
            const dt = n.t - now;
            if (dt > AHEAD) break;
            const susEnd = n.t + (n.sus || 0);
            const hasSus = (n.sus || 0) > 0;
            if (dt < -ACCENT_NOTE_LINGER_EPS && (!hasSus || now > susEnd)) continue;
            noteState.strGlow[n.s] = Math.max(noteState.strGlow[n.s], ACCENT_NOTE_STR_GLOW);
            noteState.accentFillBoost[n.s] = Math.max(
                noteState.accentFillBoost[n.s],
                ACCENT_NOTE_FILL_BOOST,
            );
        }
    }
    if (chords) {
        const _acChordLo = lowerBoundT(chords, now - 30);
        for (let _aci = _acChordLo; _aci < chords.length; _aci++) {
            const ch = chords[_aci];
            if (!ch.notes) continue;
            const dt = ch.t - now;
            if (dt > AHEAD) break;
            const chordNotes = filterValidNotes(ch.notes);
            if (!chordNotes.length) continue;
            let maxSus = 0;
            for (const x of chordNotes) if ((x.sus || 0) > maxSus) maxSus = x.sus;
            const susEnd = ch.t + maxSus;
            const hasChordSus = maxSus > 0;
            if (dt < -ACCENT_NOTE_LINGER_EPS && (!hasChordSus || now > susEnd)) continue;
            for (const cn of chordNotes) {
                if (!validString(cn.s) || !cn.ac) continue;
                noteState.strGlow[cn.s] = Math.max(noteState.strGlow[cn.s], ACCENT_NOTE_STR_GLOW);
                noteState.accentFillBoost[cn.s] = Math.max(
                    noteState.accentFillBoost[cn.s],
                    ACCENT_NOTE_FILL_BOOST,
                );
            }
        }
    }

    pbEnd(2);
    pbBeg(3);
    // mGlow / mAccentCore emissive writes are folded into
    // updateStringHighlights() — same per-string scratch reads,
    // one pass.
    updateStringHighlights(noteState);
    pbEnd(3);

    // Active frets (notes in cooldown window) + highway intensity
    _scrActiveFrets.clear();
    const activeFrets = _scrActiveFrets;
    let highwayIntensity = 0;
    for (let f = 1; f <= NFRETS; f++) {
        if (now - fretLastActiveTime[f] < FRET_COOLDOWN) activeFrets.add(f);
    }

    // Camera targeting — steady mode (#34): recency-weighted centroid +
    // hysteresis over [camT0, camT1]. In lookahead mode, see
    // lookaheadBoundsNow + lookaheadSmoothCamStep().
    let cs = 0;
    let camAhead = CAM_TGT_AHEAD_C;
    let camTau = CAM_TGT_TAU_C;
    let camHystF = CAM_TGT_HYST_C;
    let camT0 = now - CAM_TGT_BEHIND;
    let camT1 = now + camAhead;
    let camWX = 0, camWSum = 0;
    let camDistMin = 99, camDistMax = 0, camDistGot = false;
    const camDistHystF = CAM_DIST_HYST_T + (CAM_DIST_HYST_C - CAM_DIST_HYST_T) * zoomSmoothing;
    if (!(cameraMode === 'lookahead')) {
        cs = cameraSmoothing;
        camAhead = CAM_TGT_AHEAD_T + (CAM_TGT_AHEAD_C - CAM_TGT_AHEAD_T) * cs;
        camTau = CAM_TGT_TAU_T + (CAM_TGT_TAU_C - CAM_TGT_TAU_T) * cs;
        camHystF = CAM_TGT_HYST_T + (CAM_TGT_HYST_C - CAM_TGT_HYST_T) * cs;
        camT0 = now - CAM_TGT_BEHIND;
        camT1 = now + camAhead;
    }

    // Classic path (#34): getTgtDist() hysteresis tracks fret span over the
    // narrowed [camT0, camT1]; lookahead mode uses lookaheadBoundsNow + span smoothing.
    //
    // Sustain extension: the outer loop keeps notes/chords
    // whose sustain still rings into the visible window —
    // n.t + (n.sus || 0) >= t0 for notes, ch.t + maxSus >= t0
    // for chords — via the continue-filters below at the top
    // of the single-note and chord branches. camT0 is narrower
    // than t0, so an onset can age past camT0 while still
    // being on screen and audible. Mirror that past-side
    // allowance here so a held low-fret chord keeps
    // contributing to both camDist (zoom) and camWX (X
    // target); otherwise the camera dollies/pans away
    // mid-sustain, re-clipping the very chord the low-fret
    // pullback was added to keep on screen. The future side
    // (camT1) is left alone so the #34 invariant (distant
    // high-fret onsets don't pre-pull the camera) still holds.

    // ── Song-change detection ─────────────────────────────────────────
    // reconnect() (used for arrangement switches and splitscreen song
    // changes) does not call renderer.destroy/init, so getCamSnapped() and
    // getCamPreScanned() would persist into the new song and the snap pre-pass
    // would never fire again.  Detect the change by comparing the current
    // song+arrangement identity against the last-seen key, and reset the
    // camera snap state (and the camera position itself) whenever it flips.
    {
        const si = bundle.songInfo;
        // bundle.songInfo has no filename field (the WS song_info message
        // never includes it).  Use window.feedBack.currentSong.filename
        // — set by highway.js from the WS URL — combined with the
        // arrangement index as a reliable per-song-arrangement key.
        const currentSong = window.feedBack && window.feedBack.currentSong;
        const key = currentSong ? currentSong.filename + '\0' + (si ? (si.arrangement_index ?? '') : '') : null;
        if (key !== null && key !== getSongKey()) {
            setSongKey(key);
            setCamSnapped(false);
            setCamPreScanned(false);
            setCamBootstrapHolding(false);
            setCamBootstrapMode(null);
            setTgtX(xFretMid(CAM_LOCK_CENTER_FRET)); setCurX(xFretMid(CAM_LOCK_CENTER_FRET));
            setTgtDist(CAM_DIST_BASE); setCurDist(CAM_DIST_BASE);
            setPrevLowFretBonus(0);
            setPrevLockActive(false);
            setLookaheadCamX(xFretMid(CAM_LOCK_CENTER_FRET));
            setLookaheadFretSpan(DEFAULT_LOOKAHEAD_FRET_SPAN);
            setLookaheadCamPrevNow(null);
            setLookaheadLowBonusU(0);
            setLookaheadHiNeckLatch(false);
            // Drop the previous song's measure-start cache. Otherwise
            // lookaheadEndTime() would size the lookahead window off the
            // old measure grid (with the new song's now reset to ~0 this
            // yields a wrong/huge tEnd) until the new beats arrive and
            // rebuild it — the resulting huge fret span over-zooms the
            // first-data snap and stays latched. Clearing it falls back
            // to the seconds window for this frame; the rebuild repopulates
            // it next frame once bundle.beats is the new array.
            setMeasureStarts([]); setMeasureStartsRef(null);
            // Drop the clock anchor so the new song's currentTime
            // re-anchors cleanly instead of measuring a bogus rate
            // across the seek-to-0 discontinuity.
            setClkAudioT(NaN); setClkPerf(NaN); setClkRate(1);
        }
    }

    // ── Camera bootstrap (first chart data) ──────────────────────────
    // Initialize against the first relevant fretted phrase as soon as
    // the complete chart arrays arrive. For a future phrase, sample the
    // same window state that live framing will have when the phrase
    // first becomes relevant, then hold it through the silent intro.
    // This is O(N) once per song/arrangement and a permanent no-op after.
    if (!getCamSnapped() && !getCamPreScanned() && notes && chords) {
        setCamPreScanned(true);
        const firstFrettedTime = hwyFirstRelevantFrettedTime(
            notes, chords, now, CAM_TGT_BEHIND, nStr);

        if (cameraMode === 'lookahead'
            && (lookaheadBoundsNow || firstFrettedTime !== null)) {
            // Anchors can make the live lookahead valid before the first
            // fretted event does. Prefer that already-current framing;
            // only project forward when the live window is truly empty.
            const bootstrapNow = lookaheadBoundsNow
                ? now
                : lookaheadBootstrapTime(now, firstFrettedTime);
            const bd = lookaheadBoundsNow
                || lookaheadComputeFretBounds(bootstrapNow, anchors, notes, chords);
            if (bd) {
                setLookaheadCamX(lookaheadTargetWorldX(bd.minF, bd.maxF));
                setLookaheadFretSpan(Math.max(1, bd.maxF - bd.minF + 1));
                const lockSnapEl = cameraLockLow && bd.maxF <= 12;
                if (lockSnapEl) {
                    const lockedBaseU = camBaseDistU(12);
                    const lockedBonusU = camLowFretPullbackU(1);
                    const lockZoomMul = CAM_LOCK_ZOOM_MIN +
                        (CAM_LOCK_ZOOM_MAX - CAM_LOCK_ZOOM_MIN) * cameraLockZoom;
                    setTgtX(xFretMid(CAM_LOCK_CENTER_FRET));
                    setTgtDist((lockedBaseU + lockedBonusU) * K * lockZoomMul);
                    setPrevLowFretBonus(lockedBonusU);
                    setLookaheadLowBonusU(lockedBonusU);
                    setPrevLockActive(true);
                } else {
                    const baseDU = camBaseDistU(getLookaheadFretSpan());
                    const lowBU = camLowFretPullbackU(bd.minF);
                    setTgtDist((baseDU + lowBU) * K);
                    setPrevLowFretBonus(lowBU);
                    setLookaheadLowBonusU(lowBU);
                    setTgtX(getLookaheadCamX());
                    setPrevLockActive(false);
                }
                setCurX(getTgtX());
                setCurDist(getTgtDist());
                setCamSnapped(true);
                setLookaheadCamPrevNow(now);
                setCamBootstrapHolding(bootstrapNow > now && !lookaheadBoundsNow);
                setCamBootstrapMode(getCamBootstrapHolding() ? cameraMode : null);
            } else {
                // Defensive fallback for malformed chart timing. The
                // helper found a fretted event, so this should be
                // unreachable; keeping the default is safer than a
                // delayed mid-song snap.
                setCamSnapped(true);
            }
        } else if (firstFrettedTime === null) {
            // Empty and all-open charts without lookahead anchor bounds
            // have no horizontal fret target.
            setCamSnapped(true);
        } else {
            const bootstrapNow = Math.max(now, firstFrettedTime - camAhead);
            const bootstrapT0 = bootstrapNow - CAM_TGT_BEHIND;
            const bootstrapT1 = bootstrapNow + camAhead;
            let preWX = 0, preWSum = 0;
            let preDistMin = 99, preDistMax = 0, preDistGot = false;

            for (const n of notes) {
                if (n.t + (n.sus || 0) < bootstrapT0) continue;
                if (n.t > bootstrapT1) break;
                if (!validString(n.s)) continue;
                const nInWin = n.f > 0 && n.t >= bootstrapT0;
                const nSusNow = n.f > 0 && n.t < bootstrapT0
                    && n.t + (n.sus || 0) >= bootstrapNow;
                if (nInWin || nSusNow) {
                    const w = Math.exp(-Math.abs(n.t - bootstrapNow) / camTau);
                    preWX += xFretMid(n.f) * w;
                    preWSum += w;
                    if (n.f < preDistMin) preDistMin = n.f;
                    if (n.f > preDistMax) preDistMax = n.f;
                    preDistGot = true;
                }
            }
            for (const ch of chords) {
                if (!ch.notes) continue;
                if (ch.t > bootstrapT1) break;
                const chNotes = filterValidNotes(ch.notes);
                if (!chNotes.length) continue;
                let maxSus = 0;
                for (const n of chNotes) if ((n.sus || 0) > maxSus) maxSus = n.sus;
                if (ch.t + maxSus < bootstrapT0) continue;
                const chOnsetInWin = ch.t >= bootstrapT0;
                const chSusNow = ch.t < bootstrapT0
                    && ch.t + maxSus >= bootstrapNow;
                if (!chOnsetInWin && !chSusNow) continue;
                const chW = Math.exp(-Math.abs(ch.t - bootstrapNow) / camTau);
                for (const cn of chNotes) {
                    const cnOk = chOnsetInWin
                        || (chSusNow && ch.t + (cn.sus || 0) >= bootstrapNow);
                    if (cn.f > 0 && cnOk) {
                        preWX += xFretMid(cn.f) * chW;
                        preWSum += chW;
                        if (cn.f < preDistMin) preDistMin = cn.f;
                        if (cn.f > preDistMax) preDistMax = cn.f;
                        preDistGot = true;
                    }
                }
            }

            if (preWSum > 0) {
                setPrevLockActive(_applyNoteCamTargets(
                    preWX, preWSum, preDistMin, preDistMax, preDistGot,
                    camHystF, camDistHystF, /* skipDistHyst= */ true));
                setCurX(getTgtX());
                setCurDist(getTgtDist());
            }
            // The relevant-event helper and this accumulator share
            // validity/window rules; still finish defensively if a
            // malformed event could not produce a target.
            setCamSnapped(true);
            setCamBootstrapHolding(preWSum > 0 && bootstrapNow > now);
            setCamBootstrapMode(getCamBootstrapHolding() ? cameraMode : null);
        }
    }

    pbBeg(4);
    // ── Single notes ──────────────────────────────────────────────
    // Reset the per-frame fret-label dedup set so stacked labels from
    // multiple strings at the same onset/fret (arpeggio, synth chord) don't repeat.
    _frameLabeledKeys.clear();
    // Tracks which (chordId → Set<stringIndex>) pairs already had
    // brackets drawn by the note-stream loop, so the chord loop can
    // skip duplicate bracket draws for the same string.
    // Hoisted Map — clear (rather than reallocate) so the per-frame
    // chord-bracket dedupe doesn't churn GC in dense arpeggio passages.
    // (The inner Sets stored as values lose their Map reference on
    // .clear() and get GC'd along with the keys; only the outer Map
    // is reused.)
    _scrNoteStreamBracketStrings.clear();
    const _noteStreamBracketStrings = _scrNoteStreamBracketStrings;
    _scrLastFretForString.fill(undefined, 0, nStr);
    const lastFretForString = _scrLastFretForString;
    if (notes) {
        // Start 30s before now — conservative enough to include any arpeggio
        // persist window while skipping the bulk of old notes in long songs.
        // The arpPersistKeys check below guards the rare notes that are even
        // older and still visible (only possible for unrealistically long HS).
        const _noteRenderLo = lowerBoundT(notes, now - 30);
        for (let _ni = _noteRenderLo; _ni < notes.length; _ni++) {
            const n = notes[_ni];
            if (n.f > 0 && n.t > now && n.t < now + 2) activeFrets.add(n.f);
            if (n.t > now) {
                const dt = n.t - now;
                if (dt < AHEAD) highwayIntensity = Math.max(highwayIntensity, 1 - dt / AHEAD);
            }
            // Far-future notes are always skipped — arpGhostActive
            // timing handles when the ghost appears for upcoming arp notes.
            // Notes are time-sorted so everything beyond t1 can be skipped entirely.
            if (n.t > t1) break;
            // Past-window arp notes are exempted from the back-window skip
            // so their fretboard ghost + brackets persist until arpBounds.end.
            // ndVerdictT0 extends the window when a note-detect provider is
            // attached so async verdicts still land while drawable.
            const _inArpPersist = _arpPersistKeys.has(_noteKey(n.t, n.s));
            if (!_inArpPersist && n.t + (n.sus || 0) < ndVerdictT0) continue;
            if (!validString(n.s)) continue;
            // Suppress the gem for linkNext slide-target notes (skipBody=true).
            // The sustain/slide trail still renders because it now lives outside
            // the !skipBody gate in drawNote().
            const _isSlideTgt = !!(getSlideTargetSet() && getSlideTargetSet().has(_noteKey(n.t, n.s)));
            // Always show the fret label — suppressing it for repeated frets on the same
            // string caused the label to be invisible throughout the note's flight and
            // only appear moments before being played (when the previous note's linger
            // window expired).  Each note now owns its label for its full flight.
            const skipLabel = false;
            let singleOpenX;
            if (n.f === 0) {
                const ab = anchorLaneBoundsAt(anchors, n.t);
                if (ab) singleOpenX = (xFret(ab.dMin) + xFret(ab.dMax)) / 2;
            }
            const singleOpenLaneW = n.f === 0 ? openNoteLaneBoxW(n.t) : undefined;
            const arGhostCid = arpeggioChordIdForNoteWithInferCache(
                n,
                bundle.handShapes,
                bundle.chordTemplates,
                notes,
                arpGhostHsInfer,
            );
            const _arpBoundsForNote = arGhostCid != null
                ? arpHsBoundsForNote(n, bundle.handShapes, arpGhostHsInfer)
                : null;
            drawNote(
                n,
                now,
                singleOpenX,
                skipLabel,
                _isSlideTgt,
                GHOST_HOLD_AFTER_ONSET,
                singleOpenLaneW,
                arGhostCid != null,
                arGhostCid,
                arGhostCid != null,
                _arpBoundsForNote,
                _ghostPrevBuf.get(Math.round(n.t * 1e4) * 10 + n.s) ?? -Infinity,
                _arpBoundsForNote !== null, // showDropLine: white line for arp note-stream notes
            );
            if (arGhostCid != null) {
                const _arpBounds = _arpBoundsForNote;
                if (_arpBounds) {
                    // Synth-onset-match handshapes show ghost fret numbers but not [ ] brackets.
                    if (!_arpSynthOnsetHsSet.has(_arpBounds.start)) {
                        // Open-string bracket X: always use the anchor at the
                        // handshape START time (not n.t, not now) so the bracket
                        // position stays fixed throughout the arpeggio even when
                        // the chart anchor changes mid-pattern.
                        const _arpBrktAncB = n.f === 0
                            ? anchorLaneBoundsAt(anchors, _arpBounds.start)
                            : null;
                        const _bx = n.f === 0
                            ? (_arpBrktAncB
                                ? (xFret(_arpBrktAncB.dMin) + xFret(_arpBrktAncB.dMax)) / 2
                                : (singleOpenX !== undefined ? singleOpenX : getCurX()))
                            : xFretMid(n.f);
                        const _openHalfW = (() => {
                            if (n.f !== 0) return null;
                            if (_arpBrktAncB) {
                                const _xl = xFret(_arpBrktAncB.dMin), _xr = xFret(_arpBrktAncB.dMax);
                                if (_xr > _xl) return Math.max(0.22, (_xr - _xl + NW * 0.4 * 2) * 0.96 / (40 * K)) * 20 * K;
                            }
                            return singleOpenLaneW != null ? Math.max(0.22, singleOpenLaneW * 0.96 / (40 * K)) * 20 * K : null;
                        })();
                        drawArpBrackets(_bx, sY(n.s), _arpBounds.start - now, _arpBounds.end, now, n.s, n.f === 0, _openHalfW);
                        // Record that this (chordId:occurrenceStart, string) pair has brackets
                        // so the chord loop doesn't draw a second set on the same string.
                        // Key includes the arp occurrence start time so two separate arp
                        // sequences sharing the same chord template ID don't suppress each other.
                        const _nsbKey = arGhostCid + ':' + _arpBoundsForNote.start;
                        let _nsbSet = _noteStreamBracketStrings.get(_nsbKey);
                        if (!_nsbSet) { _nsbSet = new Set(); _noteStreamBracketStrings.set(_nsbKey, _nsbSet); }
                        _nsbSet.add(n.s);
                    }
                }
            }
            lastFretForString[n.s] = n.f;
            // Onset in window OR started before the window but
            // still sustaining right now. Gate sustain carry-over
            // against the current frame time so camera framing
            // releases as soon as the sustain is no longer
            // rendered on screen.
            if (!(cameraMode === 'lookahead')) {
            const nInWin = n.t >= camT0 && n.t <= camT1;
            const nSusActive = n.t < camT0 && n.t + (n.sus || 0) >= now;
            if (n.f > 0 && (nInWin || nSusActive)) {
                // Symmetric decay around now: previously this
                // clamped n.t - now at 0, giving every past-
                // onset note weight 1. That was a tolerable
                // approximation when the past window was 0.2 s
                // (camT0), but the sustain extension widens
                // the past side to seconds for held notes — a
                // 2-second-old ringing sustain would otherwise
                // pin camWX as strongly as a fresh note and
                // stale-out the framing for the current
                // phrase. Math.abs lets old sustains decay on
                // the same time-constant as future notes,
                // matching each mode's intent: twitchy
                // (camTau=0.35 s) drops a 0.2 s-old note's
                // weight to ~0.56 (consistent with "react to
                // recent only"), calm (camTau=0.9 s) to ~0.80
                // (consistent with "average a wider window").
                // Weight is still 1 at onset.
                const w = Math.exp(-Math.abs(n.t - now) / camTau);
                camWX   += xFretMid(n.f) * w;
                camWSum += w;
                if (n.f < camDistMin) camDistMin = n.f;
                if (n.f > camDistMax) camDistMax = n.f;
                camDistGot = true;
            }
            }
        }
    }

    pbEnd(4);
    pbBeg(5);
    // ── Chords ────────────────────────────────────────────────────
    if (chords) {
        // Single-pass shape-run tracking: the previous pre-loop scanned
        // every chord (and re-allocated chordShapeSignature() per chord)
        // each frame, even though the render loop already iterates the
        // full array. We compute runSig inline once per chord and reuse
        // it for both first-in-run detection and isRepeat below.
        // SHAPE_RUN_GAP_S also resets the run when the time gap from
        // the previous chord exceeds the same 0.5 s window used for
        // isRepeat — a chord shape that re-appears after a real
        // musical gap should re-show its label, not be treated as a
        // continuing run from many bars ago.
        const SHAPE_RUN_GAP_S = 0.5;
        let runSigPrev = null;
        let prevAnyChordTime = -Infinity;
        let prevChordSig = null;
        let prevChordTime = -1;

        // Skip past chords that are too old to render. The per-chord filter
        // (ch.t + _chFilterSus >= ndVerdictT0) passes the earliest chord when
        // ch.t >= ndVerdictT0 - AHEAD (worst case: _chFilterSus = AHEAD for a
        // chord with no explicit sustain). Binary search avoids iterating
        // hundreds of past chords every frame in dense PM/FH sections.
        const _chordsLoIdx = lowerBoundT(chords, ndVerdictT0 - AHEAD);
        // Prime shape-run tracking from the chord immediately before the window
        // so isRepeat and firstInShapeRun are correct on the first visible chord.
        if (_chordsLoIdx > 0) {
            const _pc = chords[_chordsLoIdx - 1];
            if (_pc && _pc.notes) {
                const _ps = chordShapeSignature(_pc);
                if (_ps !== null) {
                    runSigPrev = _ps;
                    prevAnyChordTime = _pc.t;
                    prevChordSig = _ps;
                    prevChordTime = _pc.t;
                }
            }
        }

        for (let ci = _chordsLoIdx; ci < chords.length; ci++) {
            const ch = chords[ci];
            // Chords are time-sorted — everything beyond t1 is outside the
            // visible window and contributes nothing (activeFrets needs t<now+2,
            // highwayIntensity needs dt<AHEAD, both < t1).
            if (ch.t > t1) break;
            const runSig = chordShapeSignature(ch);
            let firstInShapeRun;
            if (runSig === null) {
                firstInShapeRun = true;
            } else {
                const gap = ch.t - prevAnyChordTime;
                firstInShapeRun = (runSig !== runSigPrev) || gap > SHAPE_RUN_GAP_S;
                runSigPrev = runSig;
                // Only valid chords update the run-gap clock — an entry
                // whose runSig is null (no notes / unusable chordId)
                // shouldn't make the next real chord look like a tiny
                // gap and silently fall into a "still in the run" state.
                prevAnyChordTime = ch.t;
            }
            if (!ch.notes) continue;
            // Filter chord notes to in-range strings once. All
            // chord-level aggregations (maxSus, repeat-chord
            // signature, open-string centroid, frame-box bounds,
            // active-fret highlights, camera-window dist) read
            // from chordNotes so a clamped 9th-string note can't,
            // for instance, extend the chord's linger beyond its
            // visible sustain.
            const chordNotes = filterValidNotes(ch.notes);
            if (chordNotes.length === 0) continue;
            const chShape = mergeChordShape(ch, chordNotes, bundle.chordTemplates);

            if (ch.t > now) {
                const dt = ch.t - now;
                if (dt < AHEAD) highwayIntensity = Math.max(highwayIntensity, 1 - dt / AHEAD);
            }
            if (ch.t > now && ch.t < now + 2)
                for (const cn of chordNotes) { if (cn.f > 0) activeFrets.add(cn.f); }

            let maxSus = 0;
            for (const n of chordNotes) if ((n.sus || 0) > maxSus) maxSus = n.sus;
            // When maxSus=0 (no explicit sustain on chord notes, including
            // all h3dSynth chords) use AHEAD as the filter window so the
            // chord stays in the loop long enough for a handshape-derived
            // sustain rail to finish drawing. The rail itself gates on
            // _dtSusEnd>0, so chords with no actual sustain produce no
            // visual artifact despite staying in the loop longer.
            // ndVerdictT0 extends the window when a note-detect provider is
            // attached so async verdicts still land while drawable.
            const _chFilterSus = maxSus > 0 ? maxSus : AHEAD;
            if (ch.t + _chFilterSus < ndVerdictT0) continue;
            if (ch.t > t1) break;

            // Repeat-chord detection (consecutive same shape, short gap).
            // Reuses runSig computed at loop entry — same signature as the
            // dedicated chordShapeSignature() call we used to make twice.
            // Synthetic chords (h3dSynth — injected at handshape onsets by
            // mergeHandShapeSynthChords) are never real strums, so they must
            // not update prevChordSig/prevChordTime. Without this guard a
            // real chord whose handshape generates a synth onset at the
            // handshape start_time (e.g. a slide-in where the real strum
            // falls mid-handshape, > 28 ms after the onset) would see the
            // synth as its "previous chord" and be falsely flagged isRepeat.
            const isRepeat = runSig !== null && prevChordSig === runSig && Math.abs(ch.t - prevChordTime) < 0.5;
            if (!ch.h3dSynth) {
                prevChordSig = runSig;
                prevChordTime = ch.t;
            }

            // Anchor selection for chord frame + open-string X + sustain rails:
            // • Upcoming (chDtEarly > 0): onset time — frame previews the correct
            //   neck region before the chord hits the line.
            // • Past, actively sustaining (now < ch.t + maxSus): onset time — frame
            //   stays at the frets where the chord was struck. Using `now` here
            //   causes the frame to jump to whichever anchor is active at `now`,
            //   which may be a different/wider region and makes the sustain box
            //   appear in the wrong fret zone ("invading" adjacent anchors).
            // • Past, linger-only (sustain expired or chord had no sustain): `now`
            //   — brief fade-out frame tracks the current lane position so it
            //   doesn't visibly drift while the lane has already transitioned.
            const chDtEarly = ch.t - now;
            const _chAnchorT = chDtEarly > 0 ? ch.t
                : (maxSus > 0 && now < ch.t + maxSus) ? ch.t
                : now;
            const chAncB = anchorLaneBoundsAt(anchors, _chAnchorT);
            // Open-string X: chart <anchor> lane centre when present (not getCurX() /
            // fretted centroid), matching highway span.
            let chordCX = getCurX();
            if (chAncB) chordCX = (xFret(chAncB.dMin) + xFret(chAncB.dMax)) / 2;
            else {
                let cxL = Infinity, cxR = -Infinity, fretted = 0;
                for (const cn of chordNotes) {
                    if (cn.f > 0) {
                        const fx = xFretMid(cn.f);
                        if (fx < cxL) cxL = fx;
                        if (fx > cxR) cxR = fx;
                        fretted++;
                    }
                }
                if (fretted > 0) chordCX = (cxL + cxR) / 2;
            }

            // Horizontals for chord frame + open-string mesh width. With anchors,
            // span matches HWY lane columns (wire dMin..dMax); no extra pad.
            let chordFrameXL = null, chordFrameXR = null, chordOpenBoxW = null;
            let chordFrameAnchorMatched = false;
            if (chShape.size > 1) {
                let fMinCh = 99, fMaxCh = 0, anyFretted = false;
                for (const [, f] of chShape) {
                    if (f > 0) {
                        anyFretted = true;
                        fMinCh = Math.min(fMinCh, f);
                        fMaxCh = Math.max(fMaxCh, f);
                    }
                }
                // Prefer the anchor span so chord frames and arpeggio
                // frames align with the highway lane window — BUT only
                // when the chord's fretted notes actually fall within
                // the anchor range. If the anchor at this chord's time
                // doesn't cover the chord's frets (e.g. a chord at frets
                // 2–4 with an anchor locked to frets 5–8), the framebox
                // would clip the very gems it's supposed to contain, so
                // fall back to chord-fret-based bounds instead.
                const anchorCoversChordFrets = chAncB && anyFretted
                    ? (fMinCh >= chAncB.dMin && fMaxCh <= chAncB.dMax)
                    : true; // all-open chord: anchor centre is fine
                if (chAncB && anchorCoversChordFrets) {
                    chordFrameXL = xFret(chAncB.dMin);
                    chordFrameXR = xFret(chAncB.dMax);
                    chordFrameAnchorMatched = true;
                } else if (anyFretted) {
                    chordFrameXL = xFret(fMinCh - 1);
                    chordFrameXR = xFret(Math.max(fMaxCh, fMinCh + 2));
                } else {
                    const wNut = openNoteLaneBoxW(ch.t);
                    chordFrameXL = chordCX - wNut * 0.5;
                    chordFrameXR = chordCX + wNut * 0.5;
                }
                if (chordFrameXL != null && chordFrameXR != null) {
                    const span = Math.abs(chordFrameXR - chordFrameXL);
                    if (span > 1e-8) {
                        // Anchor-driven lane stripes span [dMin..dMax] wire-to-wire with
                        // no horizontal pad — match that ONLY when the frame is actually
                        // following the anchor (all-open chord, fallback path). The
                        // fretted-span path always pads so the frame breathes around
                        // the outermost fretted notes; without the pad it sat exactly
                        // on the fret lines and looked clipped.
                        if (chordFrameAnchorMatched) chordOpenBoxW = span;
                        else {
                            const padX = NW * 0.4;
                            chordOpenBoxW = span + padX * 2;
                        }
                    }
                }
            }

            const laneWForOpenStrings = (chordOpenBoxW != null && chordOpenBoxW > 1e-8)
                ? chordOpenBoxW
                : openNoteLaneBoxW(ch.t);

            const hsHintFrame = chordHandShapeArpeggioHint(ch, bundle.handShapes, bundle.chordTemplates);
            const hsTimeWinFrame = hsHintFrame.hs
                ? { tLo: hsStart(hsHintFrame.hs) - 0.06, tHi: hsEnd(hsHintFrame.hs) + 0.06 }
                : null;
            // chordShapeCoveredByStandaloneNotes is now cached per
            // chord (see _arpCoverCache), so a direct call from the
            // deferChordGems short-circuit chain is both lazy
            // (skipped for branches that don't need it) AND O(1)
            // when re-hit later in the same frame. The previous
            // per-chord IIFE memo is therefore redundant — drop it
            // to avoid the per-chord closure allocation in dense
            // PM/FH passages.
            const inferredArpPattern = (!hsHintFrame.hs
                || handShapeChartSpanSec(hsHintFrame.hs) >= ARP_INFER_MIN_HAND_SHAPE_SPAN_S)
                && inferArpeggioFromNotePattern(
                    ch, chShape, notes, hsTimeWinFrame, bundle.handShapes);
            // Only suppress the chord gems when standalone notes really
            // cover the arpeggio shape; otherwise explicit/synth hand
            // shapes can produce an empty lavender frame with no notes
            // inside (e.g. template-marked `-arp` chord rows).
            // Lazy wrapper so the note-stream scan is skipped when
            // neither branch needs it (short-circuit evaluation).
            const noteStreamCoversArpShape = () => chordShapeCoveredByStandaloneNotes(ch, chShape, notes);
            const deferChordGems = (ch.h3dSynth && noteStreamCoversArpShape())
                || inferredArpPattern
                || (hsHintFrame.explicit && hsHintFrame.covered && noteStreamCoversArpShape());
            /**
             * Lavender chord frame + purple highway rails: authored
             * arpeggio metadata only. RS ``highDensity`` marks gallops /
             * repeated strums on the same voicing (e.g. Frantic ~2:46) —
             * not arpeggio; keep ``hd`` for sustain-ribbon width via
             * ``chordSusTrailMatchArpFrame``.
             *
             * Only the chord that INITIATES the handshape span gets
             * the lavender treatment — subsequent strums of the same
             * voicing within the same handshape window are repeats and
             * render as ordinary chord frames. Proximity to
             * hsStart() (≤ 100 ms) identifies the initiating chord
             * regardless of how wide the span is.
             */
            const _hsStartT = hsHintFrame.hs ? hsStart(hsHintFrame.hs) : NaN;
            const chordHighwayLavenderArpVisual = hsHintFrame.explicit
                && !isNaN(_hsStartT) && Math.abs(ch.t - _hsStartT) <= 0.1;
            const chordSusTrailMatchArpFrame = chordWireHighDensity(ch)
                || chordHighwayLavenderArpVisual;

            // Onset in window OR chord started before the window
            // but is still sustaining right now. Gate sustain
            // carry-over against the current frame time so camera
            // framing releases as soon as the chord is no longer
            // rendered on screen.
            const chOnsetInWin = ch.t >= camT0 && ch.t <= camT1;
            const chSusActive  = ch.t < camT0 && ch.t + maxSus >= now;
            const chWindowed   = chOnsetInWin || chSusActive;
            // Symmetric decay — see matching comment in the
            // single-note branch. The chord-wide chW uses
            // ch.t (not per-note onset) since chord notes
            // share a strum time.
            const chW          = chWindowed ? Math.exp(-Math.abs(ch.t - now) / camTau) : 0;
            // Next-chord tail: same voicing (``highDensity`` gallop) keeps full linger + optional
            // fade suppression inside [hold−fade, hold]; a voicing change clips the tail to the
            // chart gap so D5→D#5 (~185 ms) does not stack two cyan frames (Frantic ~2:47).
            let cjNext = null;
            for (let j = ci + 1; j < chords.length; j++) {
                const cj = chords[j];
                if (!cj?.notes) continue;
                if (filterValidNotes(cj.notes).length === 0) continue;
                cjNext = cj;
                break;
            }
            // Nearest following event (chord OR single note) — used by
            // chordTailMul so the framebox vanishes the moment any next
            // event is played, not just when the next chord arrives.
            // Pull from the same sorted scalar scratch used by drawNote
            // — the per-string Math.min walk became O(log N) over the
            // shared 2*nStr buffer.
            const _chFirstEventAfter = _firstEventTimeGreaterThan(ch.t + 1e-6);
            const _chNextEventT = cjNext != null
                ? Math.min(cjNext.t, _chFirstEventAfter)
                : _chFirstEventAfter;
            let chordTailHoldS = CHORD_HWY_LINGER_S;
            let chordNextSoon = false;
            if (cjNext && cjNext.t > ch.t + 1e-6) {
                // Clip the hold tail to the gap for both same-voicing (repeat)
                // and different-voicing chords. The chordTailMul instant-cut
                // check handles the precise zero at onset; the clipped holdS
                // prevents the outer gate and hwyPostHitTailFadeMul from
                // lingering past that point.
                chordTailHoldS = Math.min(CHORD_HWY_LINGER_S, Math.max(cjNext.t - ch.t, 1e-3));
            }
            // feedBack#254 — engine verdicts land ~0.4 s after the
            // chord crosses; on a fast different-voicing sequence
            // the clip above can shrink the rim's draw life below
            // that, so the green/red latch is set but the rim isn't
            // drawn anymore. When a verdict provider is attached,
            // floor the hold at NOTEDETECT_GEM_VERDICT_WINDOW so
            // the tinted rim is actually visible.
            //
            // This deliberately overrides the "voicing-change clip
            // prevents two stacked cyan frames" behavior documented
            // above (the D5→D#5 / Frantic ~2:47 case): the post-hit
            // z clamp (Math.min(0, dZ(chDt)) below) pins extended
            // frames at z=0, so the two frames do overlap in plane
            // — they're distinguished by their now-tinted rim
            // colors (green/red verdict vs teal default) rather
            // than perspective depth. In detect mode that's the
            // right trade: verdict visibility beats the cleaner
            // approach silhouette. Without detect mode the
            // original clip still applies.
            if (_ndHasProvider && chordTailHoldS < NOTEDETECT_GEM_VERDICT_WINDOW) {
                chordTailHoldS = NOTEDETECT_GEM_VERDICT_WINDOW;
            }
            const chordTailFadeS = Math.min(CHORD_HWY_FADE_S, chordTailHoldS);

            // ── Approaching-arpeggio first-note identification ──────────────────
            // When an authored arpeggio chord frame is still approaching (not yet
            // at the hit line), only the first note to be played is shown as a gem.
            // All others are suppressed until chDtEarly <= 0 so the frame doesn't
            // flood the player's view with simultaneous gems before they arrive.
            // The first note is the earliest match in the note stream within the
            // handshape window. If no note-stream note matches the chord shape
            // within the handshape (i.e. there is no sequential arpeggio pattern),
            // _arpApproachFirstNote stays null and ALL chord gems are shown — this
            // handles chords that are played simultaneously even when tagged as arp.
            let _arpApproachFirstNote = null;
            if (chordHighwayLavenderArpVisual && !deferChordGems
                && chDtEarly > 0 && hsHintFrame.hs) {
                const _aHsLo = hsStart(hsHintFrame.hs);
                const _aHsHi = hsEnd(hsHintFrame.hs);
                let _aFirstT = Infinity;
                const _aNLo = lowerBoundT(notes, _aHsLo - 0.08);
                for (let _ani = _aNLo; _ani < notes.length; _ani++) {
                    const _an = notes[_ani];
                    if (_an.t > _aHsHi + 0.08) break;
                    if (!validString(_an.s)) continue;
                    for (const _acn of chordNotes) {
                        if (_acn.s === _an.s && _acn.f === _an.f && _an.t < _aFirstT) {
                            _aFirstT = _an.t;
                            _arpApproachFirstNote = _acn;
                            break;
                        }
                    }
                }
                // No fallback to chordNotes[0]: if the note stream has no sequential
                // notes matching this shape, the chord is played simultaneously and
                // all gems must be shown.
            }

            // ── Deferred-arpeggio gem fallback ─────────────────────────────────
            // When gems are deferred to the note stream (deferChordGems=true) but
            // no individual note matching the chord shape falls within the chord's
            // onset cluster window, the frame box has no gems at its Z position.
            // Show all chord gems as a preview so the frame box isn't empty.
            // Uses the same onset window as chordShapeCoveredByStandaloneNotes so
            // the fallback deactivates precisely when the stream truly covers the
            // onset. Inlined (not an IIFE) to skip the per-chord closure allocation.
            let _deferFallback = false;
            if (deferChordGems && chDtEarly > 0) {
                _deferFallback = true;
                const _fLo = ch.t - ARP_FRAME_ONSET_PAD_S;
                const _fHi = ch.t + ARP_FRAME_ONSET_CLUSTER_S;
                let _fi = lowerBoundT(notes, _fLo - 0.02);
                for (; _fi < notes.length; _fi++) {
                    const _fn = notes[_fi];
                    if (_fn.t > _fHi) break;
                    if (_fn.t < _fLo) continue;
                    const _fef = chShape.get(_fn.s);
                    if (_fef !== undefined && _fef === _fn.f) { _deferFallback = false; break; }
                }
            }

            // Suppress gems AND frame for hand-shape-synthesized chords whose
            // notes are already rendered individually via the note stream. Showing
            // chord gems or a framebox for a synth chord that duplicates the note
            // stream looks like phantom notes/chords. Check: any standalone note
            // matching any shape string in the onset window → player is already
            // guided by the note stream. Weaker than chordShapeCoveredByStandaloneNotes
            // (all strings covered) to handle patterns where one shape string only
            // appears well after the onset cluster (e.g. Walk intro, string 5 at
            // +0.7 s outside the 0.26 s window). Inlined for the same reason as
            // _deferFallback above.
            let suppressSynthChord = false;
            if (ch.h3dSynth && notes && chShape.size > 0) {
                const _sLo = ch.t - ARP_FRAME_ONSET_PAD_S;
                const _sHi = ch.t + ARP_FRAME_ONSET_CLUSTER_S;
                let _si = lowerBoundT(notes, _sLo - 0.02);
                for (; _si < notes.length; _si++) {
                    const _sn = notes[_si];
                    if (_sn.t > _sHi) break;
                    if (_sn.t < _sLo) continue;
                    if (chShape.get(_sn.s) === _sn.f) { suppressSynthChord = true; break; }
                }
            }

            // suppressSynthChord: skip gems + frame but still call drawNote with
            // skipBody=true so the board projection (fret ghost on fretboard) renders
            // for all shape strings — shows the hand position like a chord would.
            // chordLinksSlide: true when any chord note has a direct sl/slu marker,
            // OR when the chord's sustain connects (via case-2 linkNext) to a note
            // in bundle.notes that has a slide.  Repeated chords matching either
            // condition are treated as normal chords so the player sees the gem.
            let chordLinksSlide = chordNotes.some(cn =>
                (Number.isFinite(cn.sl) && cn.sl >= 0) ||
                (Number.isFinite(cn.slu) && cn.slu >= 0));
            if (!chordLinksSlide && isRepeat && maxSus > 0 && notes) {
                const _EPS = NEXT_ON_STRING_T_EPS;
                outer: for (const cn of chordNotes) {
                    if (!(cn.sus > 0)) continue;
                    const _endT = ch.t + cn.sus;
                    let _ji = lowerBoundT(notes, _endT - _EPS);
                    for (; _ji < notes.length; _ji++) {
                        const _q = notes[_ji];
                        if (_q.t > _endT + _EPS) break;
                        if (_q.s !== cn.s || Math.abs(_q.t - _endT) >= _EPS) continue;
                        if ((Number.isFinite(_q.sl) && _q.sl >= 0) ||
                            (Number.isFinite(_q.slu) && _q.slu >= 0)) {
                            chordLinksSlide = true; break outer;
                        }
                    }
                }
            }
            if (!deferChordGems || _deferFallback || suppressSynthChord) {
                for (const cn of chordNotes) {
                    // Suppress non-first gems while an authored arpeggio frame
                    // approaches — but not for the deferred fallback path, where
                    // all chord gems serve as the only visual preview.
                    // _arpApproachFirstNote is null when no sequential note-stream
                    // pattern was found, so simultaneous chords are unaffected.
                    // suppressSynthChord: show all shape strings for the projection.
                    if (!_deferFallback && !suppressSynthChord && _arpApproachFirstNote !== null && cn !== _arpApproachFirstNote) continue;
                    // Only suppress labels on repeated chord shapes (not on first-in-run);
                    // removed the lastFretForString check — same fix as single notes above.
                    const skipLabel = !firstInShapeRun;
                    // Reuse _scrChordNote scratch instead of `{ ...cn }` spread
                    // (avoids per-chord-note object allocation every frame).
                    Object.assign(_scrChordNote, cn);
                    _scrChordNote.t   = ch.t;
                    _scrChordNote.sus = cn.sus || 0;
                    // `fhm` is omit-when-false in the wire format (unlike `mt`/`pm`
                    // which are always emitted). Before 5913129, chord-level
                    // fretHandMute was folded into `mt` (always-emitted), so
                    // Object.assign would overwrite any stale value. After that
                    // commit fhm is its own field — absent on non-muted notes —
                    // so Object.assign leaves a stale `true` from a previous
                    // muted chord note untouched. Reset it explicitly here.
                    _scrChordNote.fhm = cn.fhm || false;
                    // Same stale-scratch hazard for the bend shape:
                    // `bnv`/`bt` are omit-when-default on the wire, so a
                    // chord note without them would otherwise inherit the
                    // previous note's curve (and bendSemisAtTime would
                    // apply the wrong contour). Reset explicitly.
                    _scrChordNote.bnv = Array.isArray(cn.bnv) ? cn.bnv : undefined;
                    _scrChordNote.bt  = cn.bt || 0;
                    // Same stale-scratch hazard for the teaching marks
                    // (§6.2.2): fg/sd are omit-when-default on the wire,
                    // so a chord note without them must reset to -1 or it
                    // inherits the previous note's finger/degree label.
                    _scrChordNote.fg  = Number.isInteger(cn.fg) ? cn.fg : -1;
                    _scrChordNote.sd  = Number.isInteger(cn.sd) ? cn.sd : -1;
                    drawNote(
                        _scrChordNote,
                        now,
                        cn.f === 0 ? chordCX : undefined,
                        skipLabel,
                        (isRepeat && !chordLinksSlide) || suppressSynthChord,
                        chordTailHoldS,
                        cn.f === 0 ? laneWForOpenStrings : undefined,
                        true,
                        ch.id,
                        chordSusTrailMatchArpFrame,
                        null,
                        _ghostPrevBuf.get(Math.round(ch.t * 1e4) * 10 + cn.s) ?? -Infinity,
                        chordHighwayLavenderArpVisual || suppressSynthChord || chordWireHighDensity(ch),
                    );
                    lastFretForString[cn.s] = cn.f;
                    // gate by THIS note's own sustain against the
                    // current render time — drawNote has already
                    // dropped short-sustain notes whose ringing has
                    // ended, so they should not keep pulling the
                    // camera frame wider than the notes actually
                    // still on screen (chord-wide maxSus would
                    // over-pullback for mixed-sustain chords).
                    if (!(cameraMode === 'lookahead')) {
                    const cnSustainOk = chOnsetInWin || (chSusActive && ch.t + (cn.sus || 0) >= now);
                    if (cn.f > 0 && cnSustainOk) {
                        camWX += xFretMid(cn.f) * chW;
                        camWSum += chW;
                        if (cn.f < camDistMin) camDistMin = cn.f;
                        if (cn.f > camDistMax) camDistMax = cn.f;
                        camDistGot = true;
                    }
                    }
                }
            }

            // ── Arpeggio note brackets [ ] ────────────────────────
            // Drawn only for explicitly authored arpeggio frames
            // (chordHighwayLavenderArpVisual = explicit handshape arp mark).
            // Covers both paths: gems shown directly from the chord
            // (!deferChordGems) and the deferred-fallback preview path
            // (_deferFallback). The inferred-arpeggio path (inferredArpPattern
            // only, no explicit mark) intentionally does NOT draw brackets —
            // the inference heuristic can false-positive on fast strummed
            // chords, and brackets on non-arp chords confuse players.
            // Note-stream arpeggios draw their own brackets in the notes[]
            // loop above (for notes already in AHEAD). The chord loop covers
            // any strings whose notes haven't entered AHEAD yet — _nsBrackets
            // prevents duplicates for strings already handled by notes[].
            if (chordHighwayLavenderArpVisual) {
                const _arpBracketDt = ch.t - now;
                if (_arpBracketDt < AHEAD) {
                    const _arpEnd = (hsHintFrame.hs && !isNaN(hsEnd(hsHintFrame.hs)))
                        ? hsEnd(hsHintFrame.hs)
                        : ch.t + maxSus + CHORD_HWY_LINGER_S;
                    // The notes[] loop already drew brackets for any note-stream
                    // note that entered AHEAD, recording (chordId:occurrenceStart → strings)
                    // in _noteStreamBracketStrings. Use the same composite key (template id +
                    // handshape start time) so two arp occurrences sharing a chord template
                    // ID are treated as distinct occurrences — not one suppressing the other.
                    const _nsBracketsKey = ch.id + ':' + _hsStartT;
                    const _nsBrackets = _noteStreamBracketStrings.get(_nsBracketsKey);
                    // Open-string bracket X: anchor at handshape start so
                    // position stays fixed even when chordCX drifts with now.
                    const _arpChBrktAncB = !isNaN(_hsStartT)
                        ? anchorLaneBoundsAt(anchors, _hsStartT)
                        : null;
                    const _arpChBrktOpenX = _arpChBrktAncB
                        ? (xFret(_arpChBrktAncB.dMin) + xFret(_arpChBrktAncB.dMax)) / 2
                        : (chordCX ?? getCurX());
                    const _arpChBrktOpenW = (() => {
                        if (_arpChBrktAncB) {
                            const _xl = xFret(_arpChBrktAncB.dMin), _xr = xFret(_arpChBrktAncB.dMax);
                            if (_xr > _xl) return _xr - _xl + NW * 0.4 * 2;
                        }
                        return laneWForOpenStrings;
                    })();
                    for (const cn of chordNotes) {
                        if (!validString(cn.s)) continue;
                        if (_nsBrackets && _nsBrackets.has(cn.s)) continue;
                        const _bx = cn.f === 0
                            ? _arpChBrktOpenX
                            : xFretMid(cn.f);
                        const _openHalfW = (cn.f === 0 && _arpChBrktOpenW != null)
                            ? Math.max(0.22, _arpChBrktOpenW * 0.96 / (40 * K)) * 20 * K
                            : null;
                        drawArpBrackets(_bx, sY(cn.s), _arpBracketDt, _arpEnd, now, cn.s, cn.f === 0, _openHalfW);
                    }
                }
            }

            // Chord frame-box: rim bars + interior fill gradient.
            const chDt = chDtEarly; // already computed above for anchor selection
            const chordTailMul = (() => {
                // When a next event (chord OR single note) has already crossed
                // the hit line, hide this frame immediately — no fadeout overlap
                // when another event is already playing.
                if (chDt < 0 && _chNextEventT < Infinity && now >= _chNextEventT) {
                    return 0;
                }
                return hwyPostHitTailFadeMul(chDt, chordTailHoldS, chordNextSoon, chordTailFadeS);
            })();
            if (chShape.size > 1 && chDt > -chordTailHoldS && chDt < AHEAD && chordOpenBoxW != null
                && (!suppressSynthChord || chordTemplateMarkedArpeggio(ch.id, bundle.chordTemplates))
            ) {
                const z = Math.min(0, dZ(chDt));
                const width = chordOpenBoxW;
                const xLeft = chordFrameXL;
                const xRight = chordFrameXR;
                const cx = (xLeft + xRight) * 0.5;
                const yA = sY(0), yB = sY(nStr - 1);
                const yMinF = Math.min(yA, yB) - S_GAP * 0.8;
                const yMaxF = Math.max(yA, yB) + S_GAP * 0.8;
                const fullChordBoxH = yMaxF - yMinF;
                let height = fullChordBoxH;
                if (isRepeat) height *= 0.5;
                // Repeat frames use half height but anchor at yMinF (board
                // level) rather than centering in the string range. With the
                // camera tilted downward, a centered half-height frame puts
                // its bottom bar mid-strings — far above the board — causing
                // perspective-induced apparent X-misalignment with the lane
                // tiles (which sit at board level). Anchoring at yMinF keeps
                // the bottom bar near the board so both frame and lane tile
                // edges share the same projected screen X.
                const yBot = yMinF;
                const yTop = yMinF + height;
                const cY = (yBot + yTop) * 0.5;
                const fade = Math.max(0, 1 - chDt / AHEAD);
                const chordAccent = chordNotes.some(cn => cn.ac);

                // Rim thickness from full vertical span — repeat halves inner height only,
                // not bar thickness vs first chord — see CHORD_FRAME_RIM_* tuning.
                let ft = Math.max(CHORD_FRAME_RIM_MIN * K, fullChordBoxH * CHORD_FRAME_RIM_FRAC_H);
                if (chordAccent) ft *= 1.22;
                // Lavender frame: authored arpeggio marker only.
                // RS ``highDensity`` is kept out — it tags gallops & repeated
                // strums (Frantic ~2:46), not arpeggio.
                const isArpeggioFrame = chordHighwayLavenderArpVisual;
                const ftSide = isArpeggioFrame ? ft * 1.55 : ft;
                let rimHex = isArpeggioFrame ? ARPEGGIO_RIM_BLUE_HEX : CHORD_BOX_TEAL_HEX;
                // Capture the neutral frame color before any verdict overwrite.
                // Used for the mute X lines so hit/miss feedback only shows on
                // the outer borders of the framebox, not inside the X pattern.
                const baseRimHex = rimHex;
                // feedBack#254 — once the chord crosses the hit
                // line, tint the teal frame by the note-state
                // provider verdict: green on a clean grab, red on a
                // miss. The verdict is async (the engine verifier
                // reports ~0.4 s after the line), so the frame stays
                // teal while the verdict is still pending — it must
                // not flash red before the verdict lands. The green/
                // red verdict is latched in _chordVerdicts so it
                // can't flicker as constituent glows decay.
                // Only engages when a scorer is attached. Arpeggio
                // frames keep their blue identity.
                // Per-occurrence key — ch.id is the template id
                // (reused across same-shape chord occurrences) so
                // composing it with ch.t gives one entry per
                // physical onset in the chart.
                const verdictKey = _encodeChordVerdictKey(ch);
                // Evict any stale latch the next time the chord
                // re-enters the pre-hit window (rewinds, section
                // loops, full restarts). Bounds Map growth too.
                if (chDt > 0 && _chordVerdicts.has(verdictKey)) {
                    _chordVerdicts.delete(verdictKey);
                }
                // The verdict scan no longer skips authored-handshape
                // frames — power chords sometimes carry an explicit
                // handshape (RS authoring quirk), which previously
                // dropped them into the `isArpeggioFrame` path and
                // left them lavender-blue regardless of hit/miss.
                // A true arpeggio (handshape over a real sweeping
                // note run) is unaffected: its constituents are
                // standalone notes judged at their own times, so the
                // scan's query at `ch.t` finds nothing for them and
                // the frame keeps its lavender default.
                if (chDt <= 0 && _ndHasProvider && !isArpeggioFrame) {
                    const latched = _chordVerdicts.get(verdictKey);
                    if (latched === 'green') {
                        rimHex = CHORD_BOX_HIT_BRIGHT_HEX;
                    } else if (latched === 'red') {
                        rimHex = CHORD_BOX_MISS_DARK_HEX;
                    } else if (latched === 'unmatched') {
                        // The first scan past the verdict window
                        // came up empty (no constituent ever had a
                        // state — most often a true arpeggio frame
                        // whose actual notes are judged at their
                        // own times, not at ch.t). Skip the
                        // per-frame provider scan and keep the
                        // frame's default identity (lavender for
                        // arpeggios, teal for chords). See the
                        // unmatched-latch below.
                    } else {
                        // Latch both green AND red:
                        //   - any constituent 'miss' → red latched.
                        //     One decisive miss verdict means the
                        //     chord can't be all-hit; without
                        //     latching, the rim would fall back to
                        //     teal once noteStateFor's miss-wash
                        //     window (~0.6 s TTL) expires and the
                        //     state returns null again.
                        //   - all hit/active → green latched.
                        //   - else (no miss yet, some constituents
                        //     still null) → keep teal default. A
                        //     partial state must not flash red on
                        //     a chord whose verdicts arrive
                        //     incrementally.
                        let allHit = chordNotes.length > 0;
                        let anyMiss = false;
                        let anyState = false;  // true if any constituent had a non-null state this scan
                        for (const cn of chordNotes) {
                            let cs = null;
                            try { cs = _ndGetNoteState(cn, ch.t); } catch (e) { cs = null; }
                            const st = (cs && typeof cs === 'object') ? cs.state : cs;
                            if (st === 'hit' || st === 'active') {
                                anyState = true;
                            } else if (st === 'miss') {
                                // First miss decides the chord — no
                                // point querying the rest of the
                                // constituents this frame; the rim
                                // is about to be red-latched below.
                                // Short-circuits provider calls in
                                // chord-dense passages.
                                allHit = false;
                                anyMiss = true;
                                anyState = true;
                                break;
                            } else {
                                // null — undecided yet
                                allHit = false;
                            }
                        }
                        if (anyMiss) {
                            _chordVerdicts.set(verdictKey, 'red');
                            rimHex = CHORD_BOX_MISS_DARK_HEX;
                        } else if (allHit) {
                            _chordVerdicts.set(verdictKey, 'green');
                            rimHex = CHORD_BOX_HIT_BRIGHT_HEX;
                        } else if (chDt < -_ND_UNMATCHED_LATCH_AFTER && !anyState) {
                            // The engine verdict typically lands
                            // ~0.4 s after the chord crosses the
                            // line, so after the
                            // _ND_UNMATCHED_LATCH_AFTER threshold
                            // we've already waited well past the
                            // verdict-arrival window. If no
                            // constituent ever returned a non-
                            // null state by then, there's no
                            // verdict coming for this chord
                            // (true arpeggio frames: their actual
                            // notes are judged at their own
                            // times, never at ch.t — the scan
                            // at ch.t finds nothing forever).
                            //
                            // Latch 'unmatched' so subsequent
                            // frames skip the provider scan
                            // entirely. The threshold must be
                            // INSIDE the chord frame's visible
                            // draw window — `chordTailHoldS` is
                            // floored to NOTEDETECT_GEM_VERDICT_
                            // WINDOW (0.75 s) in detect mode, so
                            // chord frames stop drawing at
                            // `chDt < -0.75`; a latch threshold
                            // at `-NOTEDETECT_GEM_VERDICT_WINDOW`
                            // (i.e. exactly -0.75) is unreachable
                            // because the draw gate kicks the
                            // frame out of the loop first. Place
                            // the threshold ~0.55 s past line so
                            // it fires for ~0.2 s of the remaining
                            // visible window — enough frames to
                            // catch and skip future re-scans.
                            //
                            // The !anyState guard keeps the
                            // partial-resolve case (one cn 'hit',
                            // another still null) scanning until
                            // anyMiss / allHit commits it.
                            _chordVerdicts.set(verdictKey, 'unmatched');
                        }
                        // else: no verdict yet → leave teal default
                    }
                }

                if (chDt > 0) { // framebox only on highway, not on the fretboard
                const repDim = isRepeat ? 0.78 : 1;
                const edgeOp = fade * chordTailMul;
                const thickZ = Math.max(CHORD_FRAME_RIM_Z_MIN * K, ft * CHORD_FRAME_RIM_Z_SCAL);
                // Per-depth layer stack: chord frames, gems, technique markers,
                // and fret labels all derive from RENDER_ORDER_LAYER_STACK so new layers
                // have one vocabulary instead of ad hoc arithmetic at call sites.
                // Sub-increments of 0.0001 for intra-chord ordering; safe for any
                // chord gap >= 0.001 s.
                const chordFrameRenderOrder = renderOrderForLayerAtZ(z, 'CHORD_FRAME');
                const drawFrameBox = (px, py, sx, sy, ord, hex = rimHex, op = edgeOp) => {
                    const b = pChordBox.get();
                    b.renderOrder = ord;
                    b.material.color.setHex(hex);
                    b.position.set(px, py, z);
                    b.scale.set(sx, sy, thickZ);
                    b.rotation.set(0, 0, 0);
                    b.material.opacity = op;
                };
                const sideHex = isArpeggioFrame ? rimHex : 0x163137;

                const innerW = Math.max(width - 2 * ftSide, width * 0.45);
                const innerH = Math.max(height - 2 * ft, height * 0.3);
                const fill = pChordFrameFill.get();
                fill.renderOrder = renderOrderForLayerAtZ(z, 'CHORD_FILL');
                fill.rotation.set(0, 0, 0);
                fill.position.set(cx, cY, z - 0.004 * K);
                fill.scale.set(innerW, innerH, 1);
                fill.material.opacity = fade * repDim * chordTailMul;
                // Swapping `map` between two non-null gradient textures
                // doesn't change shader-defining state, so no needsUpdate
                // — that flag would otherwise force a recompile per frame.
                fill.material.map = isArpeggioFrame ? getChordFrameGradTexArp() : getChordFrameGradTex();
                fill.material.color.setRGB(1, 1, 1);

                const withTopFrame = !isRepeat;
                // Non-repeat tapers the upper side bars + draws a thin top bar;
                // hoisted out so ySideHi can match the actual top-bar thickness
                // (using ft would leave a visible gap between the thin top bar
                // and the side bars meeting it).
                const ftThin = ftSide * 0.22;

                const ySideLo = yBot + ft;
                const ySideHi = withTopFrame ? yTop - ftThin : yTop - ft * 0.15;
                const sideH = Math.max(ySideHi - ySideLo, ft * 1.25);
                const sideCy = ySideLo + sideH * 0.5;

                // Bottom bar: thin teal (like top bar) + dark corners on top.
                {
                    const botCW = Math.min(sideH * (isRepeat ? 0.5 : 0.25), width * 0.4);
                    drawFrameBox(cx, yBot + ftThin * 0.5, width, ftThin, chordFrameRenderOrder);
                    drawFrameBox(cx + width * 0.5 - botCW * 0.5, yBot + ft * 0.5, botCW, ft, chordFrameRenderOrder + 0.0001, sideHex);
                    drawFrameBox(cx - width * 0.5 + botCW * 0.5, yBot + ft * 0.5, botCW, ft, chordFrameRenderOrder + 0.0002, sideHex);
                }

                if (isRepeat) {
                    // Lower 30%: thick dark segment
                    const repLoH = sideH * 0.3;
                    const repLoCy = ySideLo + repLoH * 0.5;
                    drawFrameBox(cx - width * 0.5 + ftSide * 0.5, repLoCy, ftSide, repLoH, chordFrameRenderOrder + 0.0001, sideHex);
                    drawFrameBox(cx + width * 0.5 - ftSide * 0.5, repLoCy, ftSide, repLoH, chordFrameRenderOrder + 0.0001, sideHex);
                    // Upper 70%: thin teal segment (same style as non-repeat upper)
                    const repHiH = sideH - repLoH;
                    const repHiCy = ySideLo + repLoH + repHiH * 0.5;
                    drawFrameBox(cx - width * 0.5 + ftThin * 0.5, repHiCy, ftThin, repHiH, chordFrameRenderOrder + 0.0001);
                    drawFrameBox(cx + width * 0.5 - ftThin * 0.5, repHiCy, ftThin, repHiH, chordFrameRenderOrder + 0.0001);
                } else {
                    // Non-repeat: thick sides up to repeat-frame height, then taper to thin above.
                    const threshY = yBot + fullChordBoxH * 0.5; // top of what a repeat frame would be

                    // Lower thick segment (ySideLo → threshY)
                    const loSideH = Math.max(Math.min(threshY, ySideHi) - ySideLo, 0);
                    if (loSideH > 0) {
                        const loCy = ySideLo + loSideH * 0.5;
                        drawFrameBox(cx - width * 0.5 + ftSide * 0.5, loCy, ftSide, loSideH, chordFrameRenderOrder + 0.0001, sideHex);
                        drawFrameBox(cx + width * 0.5 - ftSide * 0.5, loCy, ftSide, loSideH, chordFrameRenderOrder + 0.0001, sideHex);
                    }

                    // Upper thin segment (threshY → ySideHi)
                    const hiSideH = Math.max(ySideHi - threshY, 0);
                    if (hiSideH > 0) {
                        const hiCy = threshY + hiSideH * 0.5;
                        drawFrameBox(cx - width * 0.5 + ftThin * 0.5, hiCy, ftThin, hiSideH, chordFrameRenderOrder + 0.0001);
                        drawFrameBox(cx + width * 0.5 - ftThin * 0.5, hiCy, ftThin, hiSideH, chordFrameRenderOrder + 0.0001);
                    }

                    // Top bar: thin
                    drawFrameBox(cx, yTop - ftThin * 0.5, width, ftThin, chordFrameRenderOrder);
                }

                // Accent bloom on frame edges: 4 additive shells with
                // Gaussian-style falloff. Each border expands only in its
                // perpendicular axis so bloom never leaves the frame boundary:
                //   horizontal bars (top/bottom) → expand Y only
                //   vertical bars (left/right)   → expand X only
                if (chordAccent && pHaloBar) {
                    // Bloom only on the teal (thin) parts of the frame — the dark
                    // "#163137" L-corners are deliberately left without bloom so they
                    // remain visibly dark (same appearance as non-accent chords).
                    const haloHex = isArpeggioFrame ? ARPEGGIO_RIM_BLUE_HEX : CHORD_BOX_TEAL_HEX;
                    const EXPAND_MAX = 1.45;
                    const dynamicOp = fade * chordTailMul;
                    const drawHaloBar = (px, py, scaleX, scaleY, rotZ) => {
                        const b = pHaloBar.get();
                        b.material.color.setHex(haloHex);
                        b.material.opacity = dynamicOp;
                        b.renderOrder = renderOrderForLayerAtZ(z, 'CHORD_EDGE_GLOW');
                        b.position.set(px, py, z - 0.001 * K);
                        b.scale.set(scaleX, scaleY * EXPAND_MAX * 0.5, thickZ * 2.0);
                        b.rotation.set(0, 0, rotZ);
                    };
                    // Bottom: center-only bloom (skip dark corner areas)
                    const _bCW = Math.min(sideH * (isRepeat ? 0.5 : 0.25), width * 0.4);
                    const centerBotW = width - 2 * _bCW;
                    if (centerBotW > 0)
                        drawHaloBar(cx, yBot + ft * 0.5, centerBotW * 0.5, ft, 0);
                    // Top bar
                    if (withTopFrame)
                        drawHaloBar(cx, yTop - ftThin * 0.5, width * 0.5, ftThin, 0);
                    // Lateral: bloom only on the upper thin-teal segment (skip dark lower segment)
                    if (isRepeat) {
                        const repLoH = sideH * 0.3;
                        const repHiH = sideH - repLoH;
                        if (repHiH > 0) {
                            const repHiCy = ySideLo + repLoH + repHiH * 0.5;
                            drawHaloBar(cx - width * 0.5 + ftSide * 0.5, repHiCy, repHiH * 0.5, ftSide, Math.PI * 0.5);
                            drawHaloBar(cx + width * 0.5 - ftSide * 0.5, repHiCy, repHiH * 0.5, ftSide, Math.PI * 0.5);
                        }
                    } else {
                        const threshY = yBot + fullChordBoxH * 0.5;
                        const hiSideH = Math.max(ySideHi - threshY, 0);
                        if (hiSideH > 0) {
                            const hiCy = threshY + hiSideH * 0.5;
                            drawHaloBar(cx - width * 0.5 + ftSide * 0.5, hiCy, hiSideH * 0.5, ftSide, Math.PI * 0.5);
                            drawHaloBar(cx + width * 0.5 - ftSide * 0.5, hiCy, hiSideH * 0.5, ftSide, Math.PI * 0.5);
                        }
                    }
                }
                const chordName = chordTemplateLabel(bundle.chordTemplates?.[ch.id]);
                if (chordName && firstInShapeRun && !chordWireHighDensity(ch)) {
                    const lblW = 28 * K, lblH = 9 * K;
                    const lbl = pChordLbl.get();
                    const mat = txtMat(chordName, '#e8d080', true, 'chord');
                    _setLabelMap(lbl, mat);
                    lbl.material.opacity = Math.min(1, 0.3 + fade * 0.7) * chordTailMul;
                    // Gold chord name: slight +X shift from flush-left so it sits farther right.
                    const lblWS = lblW * getTextSizeMul();
                    const lblHS = lblH * getTextSizeMul();
                    const frameLeft = cx - width / 2;
                    const nameShiftX = NW * 0.94;
                    const nameVertTuck = NH * 0.02;
                    lbl.position.set(
                        frameLeft - lblWS / 2 + nameShiftX,
                        yMaxF + lblHS / 2 - nameVertTuck,
                        z);
                    lbl.scale.set(lblWS, lblHS, 1);
                }

                // Harmony annotations (§6.3.1 / §6.6) — the chord's
                // function (fn.rn Roman numeral) and template voicing,
                // stacked above the chord name. Gated by the
                // teaching-marks opt-in (mirrors the 2D overlay). Display
                // only — never grading.
                if (_drawTeachingMarks && firstInShapeRun && !chordWireHighDensity(ch)) {
                    const _tmpl = bundle.chordTemplates?.[ch.id];
                    const _h = chordHarmonyLabels(ch.fn, _tmpl?.voicing, _tmpl?.caged, _tmpl?.guideTones);
                    if (_h.rn || _h.voicing || _h.caged || _h.guideTones) {
                        const hlW = 24 * K * getTextSizeMul();
                        const hlH = 9 * K * getTextSizeMul();
                        const frameLeft = cx - width / 2;
                        const baseX = frameLeft - hlW / 2 + NW * 0.94;
                        const opacity = Math.min(1, 0.3 + fade * 0.7) * chordTailMul;
                        // Start one chord-name-height above the name and
                        // stack upward so labels never overlap the gems.
                        let hy = yMaxF + hlH * 1.6;
                        const _drawHarmony = (text, colorHex) => {
                            if (!text) return;
                            const s = pChordLbl.get();
                            const m = txtMat(text, colorHex, true, 'chord');
                            _setLabelMap(s, m);
                            s.material.opacity = opacity;
                            s.position.set(baseX, hy, z);
                            s.scale.set(hlW, hlH, 1);
                            hy += hlH;
                        };
                        _drawHarmony(_h.rn, '#ffcc66');         // sd teaching color
                        _drawHarmony(_h.voicing, '#7fd1ff');    // fg teaching color
                        _drawHarmony(_h.caged, '#a0ffa0');      // CAGED shape teaching color
                        _drawHarmony(_h.guideTones, '#d0a0ff'); // guide-tone teaching color
                    }
                }

                // Shape-based barre detection for the 3D indicator.
                // Drives off chord notes alone — independent of label
                // availability, so charts whose chordTemplates lack a
                // .name still show the barre line.
                // Matches drawChordDiagram PATH A + PATH B so the highway
                // line and overlay bracket always agree on the same shapes:
                //   PATH A: 2+ adjacent strings at the minimum fret.
                //   PATH B: outer-edge full-span barre (e.g. B major x24442)
                //           where the two outer strings are at the minimum fret,
                //           every intermediate string is fretted (f>0), and no
                //           intermediate string also sits at the minimum fret.
                // Scattered voicings like "1 3 1 3 1 0" (strings 0,2,4 at
                // fret 1 but no two adjacent, and string 2 sits at min fret)
                // correctly produce no indicator.
                {
                    let bFret = Infinity;
                    for (const [, f] of chShape) {
                        if (f > 0) bFret = Math.min(bFret, f);
                    }
                    // Collect strings at minimum fret into scratch array (no allocation)
                    _scrAtMinFretLen = 0;
                    if (bFret < Infinity) {
                        for (const [s, f] of chShape) {
                            if (f === bFret) _scrAtMinFretArr[_scrAtMinFretLen++] = s;
                        }
                        // insertion sort — array is ≤8 elements
                        for (let _ii = 1; _ii < _scrAtMinFretLen; _ii++) {
                            const _v = _scrAtMinFretArr[_ii];
                            let _jj = _ii - 1;
                            while (_jj >= 0 && _scrAtMinFretArr[_jj] > _v) {
                                _scrAtMinFretArr[_jj + 1] = _scrAtMinFretArr[_jj]; _jj--;
                            }
                            _scrAtMinFretArr[_jj + 1] = _v;
                        }
                    }
                    // Inline longestConsecutiveRun (no array allocation)
                    let _barreRunStart = -1, _barreRunLen = 0;
                    {
                        let _curStart = -1, _curLen = 0;
                        for (let _ri = 0; _ri < _scrAtMinFretLen; _ri++) {
                            const _rv = _scrAtMinFretArr[_ri];
                            if (_curLen === 0 || _rv === _scrAtMinFretArr[_ri - 1] + 1) {
                                if (_curLen === 0) _curStart = _rv;
                                _curLen++;
                            } else {
                                if (_curLen > _barreRunLen) { _barreRunLen = _curLen; _barreRunStart = _curStart; }
                                _curStart = _rv; _curLen = 1;
                            }
                        }
                        if (_curLen > _barreRunLen) { _barreRunLen = _curLen; _barreRunStart = _curStart; }
                    }
                    let is3dBarre    = _barreRunLen >= 2;   // PATH A
                    let barreMinStr3d = is3dBarre ? _barreRunStart : -1;
                    let barreMaxStr3d = is3dBarre ? _barreRunStart + _barreRunLen - 1 : -1;

                    // PATH B: outer-edge full-span barre
                    const MIN_BARRE_SPAN_3D = Math.min(nStr - 1, 4);
                    if (_scrAtMinFretLen >= 2) {
                        const minS = _scrAtMinFretArr[0];
                        const maxS = _scrAtMinFretArr[_scrAtMinFretLen - 1];
                        if (maxS - minS >= MIN_BARRE_SPAN_3D) {
                            // chShape is already a Map<s, f> — query it directly
                            // instead of building a transient Set<s> every frame.
                            let allFretted = true;
                            for (let si = minS; si <= maxS; si++) {
                                if (!chShape.has(si) || chShape.get(si) <= 0) { allFretted = false; break; }
                            }
                            if (allFretted) {
                                if (is3dBarre) {
                                    // PATH A fired: extend to full outer span.
                                    barreMinStr3d = minS; barreMaxStr3d = maxS;
                                } else {
                                    // PATH A did not fire: only draw if no inner
                                    // string also sits at the minimum fret.
                                    let innerAtMinFret = false;
                                    for (let _ai = 1; _ai < _scrAtMinFretLen - 1; _ai++) {
                                        const _as = _scrAtMinFretArr[_ai];
                                        if (_as > minS && _as < maxS) { innerAtMinFret = true; break; }
                                    }
                                    if (!innerAtMinFret) {
                                        is3dBarre = true;
                                        barreMinStr3d = minS; barreMaxStr3d = maxS;
                                    }
                                }
                            }
                        }
                    }

                    if (is3dBarre && chDt <= 0) {
                        const bx = xFretMid(bFret);
                        const yTop = Math.max(sY(barreMinStr3d), sY(barreMaxStr3d));
                        const yBot = Math.min(sY(barreMinStr3d), sY(barreMaxStr3d));
                        const lineH = yTop - yBot;
                        const bl = pBarreLine.get();
                        bl.position.set(bx, (yTop + yBot) / 2, 0.05 * K);
                        bl.scale.set(0.5 * K, lineH, 0.5 * K);
                        bl.material.opacity = 0.8 * chordTailMul;
                    }
                }

                // ── Chord fret numbers at the base of the highway ───────────────
                // Show fret number per unique fretted position for non-repeated
                // chords so the player can read the shape at a glance.
                if (!isRepeat) {
                    const _chFretLblAlpha = Math.min(1.0, (AHEAD - chDt) / 0.35) * chordTailMul;
                    const _seenChordFrets = new Set();
                    for (const [, f] of chShape) {
                        if (f <= 0 || _seenChordFrets.has(f)) continue;
                        _seenChordFrets.add(f);
                        const lbl = pNoteFretLabel.get();
                        const mat = txtMat(f, FRET_LABEL_GOLD_HEX, false, 'noteFret');
                        _setLabelMap(lbl, mat);
                        lbl.position.set(xFretMid(f), yMinF, z);
                        lbl.renderOrder = renderOrderForLayerAtZ(z, 'CHORD_FRET_LABEL');
                        const _flS = 7.0 * K * (1 + 0.4 * chDt / AHEAD) * getTextSizeMul() * fretLabelScaleForFret(f);
                        lbl.scale.set(_flS, _flS, 1);
                        lbl.material.opacity = _chFretLblAlpha;
                    }
                }

                // ── Palm-mute strum indicator — pool (fill + lines) ──────────────
                // Per-chord Z-proportional renderOrder: muted fill/lines and
                // frame edges all use the named layer offsets above.
                if (isRepeat && chordNotes.some(cn => cn.pm)) {
                    if (pPMXFill) {
                        const xf = pPMXFill.get();
                        xf.renderOrder = renderOrderForLayerAtZ(z, 'CHORD_STRUM_FILL');
                        xf.material.opacity = edgeOp * CHORD_BOX_EDGE_ALPHA;
                        xf.position.set(cx, cY, z - 0.0045 * K);
                        xf.scale.set(innerW * 0.5, -innerH * 0.5, 1);
                        xf.rotation.set(0, 0, 0);
                    }
                    if (pMuteXLines) {
                        const xl = pMuteXLines.get();
                        xl.renderOrder = renderOrderForLayerAtZ(z, 'CHORD_STRUM_LINE');
                        xl.material.opacity = edgeOp * 0.85;
                        xl.material.color.setHex(baseRimHex);
                        xl.position.set(cx, cY, z - 0.005 * K);
                        xl.scale.set(innerW * 0.5, -innerH * 0.5, thickZ * 0.5);
                        xl.rotation.set(0, 0, 0);
                    }
                }

                // ── Frethand-mute strum indicator — pool (fill + lines) ───────────
                if (isRepeat && chordNotes.some(cn => cn.mt || cn.fhm)) {
                    if (pFHXFill) {
                        const xf = pFHXFill.get();
                        xf.renderOrder = renderOrderForLayerAtZ(z, 'CHORD_STRUM_FILL');
                        xf.material.opacity = edgeOp * CHORD_BOX_EDGE_ALPHA;
                        xf.position.set(cx, cY, z - 0.0045 * K);
                        xf.scale.set(innerW * 0.5, -innerH * 0.5, 1);
                        xf.rotation.set(0, 0, 0);
                    }
                    if (pFHXLines) {
                        const xl = pFHXLines.get();
                        xl.renderOrder = renderOrderForLayerAtZ(z, 'CHORD_STRUM_LINE');
                        xl.material.opacity = edgeOp * 0.85;
                        xl.material.color.setHex(baseRimHex);
                        xl.position.set(cx, cY, z - 0.005 * K);
                        xl.scale.set(innerW * 0.5, -innerH * 0.5, thickZ * 0.5);
                        xl.rotation.set(0, 0, 0);
                    }
                }

                } // end if (chDt > 0) — framebox + PM/FH mute only on highway

            }

            // ── Chord sustain length indicator — 3D plane rails ─────────────
            // Left + right rail as plane meshes (PlaneGeometry +
            // MeshBasicMaterial) in the WebGL scene so they respect
            // renderOrder (16) and never occlude note gems (20/21).
            // isRepeat chords also draw their rail: each repeat shows a
            // segment from its own onset to the next chord's onset (or the
            // handshape end, whichever is shorter), chaining together to
            // cover the full handshape duration visually.
            if (chShape.size > 1 && chordOpenBoxW != null && chDt < AHEAD) {
                // Cap handshape-derived sustain at the gap to the next chord.
                // Each chord (including repeats) only extends to the next
                // chord's onset, so the rail never lingers past the anchor
                // region of the current chord.
                const _nextChordGap = (ci + 1 < chords.length)
                    ? chords[ci + 1].t - ch.t
                    : Infinity;
                // Use the time remaining in the handshape from this chord's
                // onset (hsEnd - ch.t), NOT the full handshape span. When
                // multiple chords share the same handshape window (e.g. A5
                // at 63.527 and again at 64.137 both fall inside the same
                // handshape start=63.527 end=64.239), each chord after the
                // first starts mid-handshape. Using the full span (0.712s)
                // for the mid-handshape chord gives a rail that extends
                // 0.611s — far past the handshape end — causing the
                // "elongated border" that visually swallows subsequent
                // single notes. Clamping to (hsEnd - ch.t) gives 0.102s,
                // which correctly terminates at the handshape boundary.
                const _hsSus = (maxSus === 0 && !deferChordGems && hsHintFrame && hsHintFrame.hs)
                    ? Math.min(Math.max(0, hsEnd(hsHintFrame.hs) - ch.t), _nextChordGap)
                    : 0;
                // "Chord hold": suppressed non-arp synth chord where deferChordGems
                // zeroed _hsSus. Use h3dSynthEnd (= handshape end_time) instead.
                const _synthSus = (suppressSynthChord && ch.h3dSynth
                    && !chordTemplateMarkedArpeggio(ch.id, bundle.chordTemplates)
                    && ch.h3dSynthEnd != null)
                    ? Math.max(0, ch.h3dSynthEnd - ch.t)
                    : 0;
                const _rawSus = maxSus > 0 ? maxSus : Math.max(_hsSus, _synthSus);
                // Apply the 0.4 s visual-minimum only to chords with an
                // explicit note sustain (maxSus > 0). Handshape-derived
                // sustain (_hsSus, already capped at _nextChordGap) must
                // not be inflated — that would undo the gallop cap and
                // cause the rail to reappear at the old anchor position.
                const _effSus = maxSus > 0
                    ? Math.max(_rawSus, 0.4)
                    : _rawSus;
                const _dtSusEnd  = chDt + _effSus;
                if (_dtSusEnd > 0) {
                    // Clip the rail at the next anchor boundary so it doesn't
                    // extend into a different fret zone. The lane (pLane) slices
                    // correctly per-anchor; a single-segment rail at fixed X would
                    // visually "invade" the neighbouring region when anchors change
                    // within the sustain window.
                    let _dtSusEndRail = _dtSusEnd;
                    if (anchors && anchors.length) {
                        const _susAbsT = chDt > 0 ? ch.t : now;
                        if (getChartAnchorAt(anchors, _susAbsT) !==
                            getChartAnchorAt(anchors, now + _dtSusEnd)) {
                            // Binary search: first anchor starting strictly after _susAbsT.
                            let _lo = 0, _hi = anchors.length;
                            while (_lo < _hi) {
                                const _mid = (_lo + _hi) >>> 1;
                                if (anchors[_mid].time <= _susAbsT) _lo = _mid + 1;
                                else _hi = _mid;
                            }
                            if (_lo < anchors.length)
                                _dtSusEndRail = anchors[_lo].time - now;
                        }
                    }
                    const _zNear = chDt > 0 ? dZ(chDt) : 0;
                    const _zFar  = dZ(Math.min(_dtSusEndRail, AHEAD));
                    const _railLen = _zNear - _zFar;
                    if (_railLen > 0.001) {
                        const _yA   = sY(0), _yB = sY(nStr - 1);
                        const _yBot = Math.min(_yA, _yB) - S_GAP * 0.8;
                        const _fadeAhead = chDt > 0 ? Math.max(0, 1 - chDt / AHEAD) : 1;
                        const _fadeSus   = Math.min(1, _dtSusEnd / 0.25);
                        const _op  = _fadeAhead * _fadeSus * 0.9;
                        const _hex = chordHighwayLavenderArpVisual ? ARPEGGIO_RIM_BLUE_HEX : CHORD_BOX_TEAL_HEX;
                        const _railW = 1.875 * K; // visual width of each rail strip
                        const _zMid  = _zNear - _railLen * 0.5; // centre in Z
                        for (const [_rx, _inDir] of [[chordFrameXL, -1], [chordFrameXR, 1]]) {
                            const _rxIn = _rx + _inDir * _railW * 0.5;
                            // Core rail
                            const rl = pSusRail.get();
                            rl.material.color.setHex(_hex);
                            rl.material.opacity = _op;
                            rl.position.set(_rxIn, _yBot, _zMid);
                            rl.scale.set(_railW, 1, _railLen);
                            // Bloom glow — wider gaussian plane, additive blending
                            if (!getLeanSus()) {
                                const bl = pSusRailBloom.get();
                                bl.material.color.setHex(_hex);
                                bl.material.opacity = _op * 0.8;
                                bl.position.set(_rxIn, _yBot + 0.001, _zMid);
                                bl.scale.set(3 * K, 1, _railLen);
                            }
                        }
                    }
                }
            }
        }
    }

    // Fret span of the dynamic highway lane (wire dMin .. dMax). Reused
    // so fret-column measure markers stay inside the same horizontal
    // band as the blue track — previously markers used every inlay
    // fret and stuck out past the lane whenever the camera narrowed.
    let hwyLaneFretClipMin = null, hwyLaneFretClipMax = null;

    const handShapesRails = bundle.handShapes;
    hwyLaneArpOuterDividers = !!(handShapesRails && handShapesRails.length && laneRailArpHsFlags
        && arpeggioLaneOuterRailAtChartTime(
            now, handShapesRails, laneRailBoundLo, laneRailBoundHi, laneRailArpHsFlags,
        ));
    const arpLaneRimAccentMul = hwyLaneArpOuterDividers && laneRailArpHsFlags && handShapesRails
        ? arpeggioLaneDividerFrameAccentMul(
            now, handShapesRails, chords, laneRailBoundLo, laneRailBoundHi, laneRailArpHsFlags,
        )
        : 1;
    const arpLaneS = hwyLaneArpOuterDividers
        ? arpeggioLaneDividerXYScaleMatchFrameRim(arpLaneRimAccentMul)
        : 1;

    // ── Fret-wire hit flash (apply) ───────────────────────────────
    // Runs here, after the note + chord draw loops, so it sees this
    // frame's verdicts (_fwHitIn) rather than the previous frame's —
    // the base tier loop that seeds color/opacity/emissive sits far
    // above, before any note has been drawn.
    //
    // _fwHitGlow decays exponentially in CHART time, so the tail is
    // frame-rate independent and honours playback speed. Seeking
    // backward resets it — otherwise a flash from a hit we jumped away
    // from would linger on the wire.
    if (fretWireMats.length && getFwHitColor()) {
        // Resolve accumulated chord hits: a chord's flash frames the
        // LANE, not its own shape. The lit lane strip spans the anchor's
        // width (min ~4 frets), which can run a fret past the chord's
        // outermost fret — and a bracket one wire INSIDE the lit lane
        // reads as misaligned. So a chord lights the anchor lane's edge
        // wires: the exact wires the lane strip spans, and the same pair
        // open strings already use. The shape's own outer pair (wire
        // behind the lowest fret, wire at the highest) survives only as
        // the fallback for charts with no anchors.
        for (const _fwE of _fwChordAcc.values()) {
            const _fwA = Math.max(_fwE.a, _fwE.openA);
            if (_fwA <= 0) continue;
            let _w0 = -1, _w1 = -1;
            const _fwB = anchorLaneBoundsAt(_drawAnchors, _fwE.t);
            if (_fwB) {
                _w0 = _fwB.dMin;
                _w1 = _fwB.dMax;
            } else if (_fwE.maxF >= _fwE.minF) {
                _w0 = Math.max(0, _fwE.minF - 1);
                _w1 = Math.min(NFRETS, _fwE.maxF);
            }
            if (_w0 < 0) continue; // all-open chord on an anchor-less chart
            if (_fwA > _fwHitIn[_w0]) _fwHitIn[_w0] = _fwA;
            if (_fwA > _fwHitIn[_w1]) _fwHitIn[_w1] = _fwA;
        }

        const _fwDt = now - getFwHitPrevTime();
        if (!(_fwDt >= 0) || _fwDt > 1) _fwHitGlow.fill(0); // first frame, seek, or long stall
        const _fwDecay = (_fwDt > 0 && _fwDt <= 1)
            ? Math.exp(-_fwDt / FRET_WIRE_HIT_DECAY)
            : 0;
        setFwHitPrevTime(now);
        // Decay EVERY wire's glow state, but flash only the OUTERMOST
        // pair of lit wires. Fast passages overlap their decay tails, so
        // without this a run of consecutive notes lights a picket fence
        // of wires at once; collapsing to the outer pair keeps the whole
        // lit span reading as ONE bracket — the same rule chords already
        // follow, applied across everything currently glowing. Interior
        // wires keep decaying invisibly (the base tier loop re-seeds
        // their materials each frame), so the bracket tightens naturally
        // as outer tails expire.
        let _fwLo = -1, _fwHi = -1;
        for (let _f = 0; _f <= NFRETS; _f++) {
            const _g = Math.max(_fwHitIn[_f], _fwHitGlow[_f] * _fwDecay);
            _fwHitGlow[_f] = _g;
            if (_g < 0.004) continue;   // below perceptible
            if (_fwLo < 0) _fwLo = _f;
            _fwHi = _f;
        }
        for (let _i = 0; _i < 2; _i++) {
            const _f = _i === 0 ? _fwLo : _fwHi;
            if (_f < 0) break;                       // nothing lit
            if (_i === 1 && _f === _fwLo) break;     // single wire lit
            const _g = _fwHitGlow[_f];
            const _m = fretWireMats[_f];
            if (!_m) continue;
            _m.color.lerp(getFwHitColor(), _g);
            _m.emissive.lerp(getFwHitEmissive(), _g);
            _m.emissiveIntensity = 1 + (FRET_WIRE_HIT_INTENSITY - 1) * _g;
            _m.opacity += (FRET_WIRE_HIT_OP - _m.opacity) * _g;
        }

        // Gem-rim flash: same intensity ramp as the wires, in the
        // string's own colour. No decay tail of our own — the material
        // is only ever ASSIGNED while the provider confirms the note,
        // and the provider's alpha already fades; when it goes silent
        // the outline reverts and idle intensity is irrelevant.
        for (let _s = 0; _s < getMRimFlash().length; _s++) {
            const _m = getMRimFlash()[_s];
            if (_m) _m.emissiveIntensity = 1 + (FRET_WIRE_HIT_INTENSITY - 1) * _rimFlashIn[_s];
        }
    }

    // ── Dynamic highway lane ──────────────────────────────────────
    // Chart <anchor> tags drive the lane whenever they exist — do not
    // require nearby notes (activeFrets) or camera-driven activity.
    const hasChartAnchors = anchors && anchors.length;
    if (hasChartAnchors || activeFrets.size > 0) {
        // Lane tint: one translucent quad per playable fret column, exact
        // wire→wire span (no horizontal pad) — see HWY_LANE_STRIPE_*.
        const boardY = S_BASE - NH / 2 - 2 * K;

        if (hasChartAnchors) {
            const nearB = laneBoundsFromAnchor(getChartAnchorAt(anchors, now));
            if (nearB) {
                hwyLaneFretClipMin = nearB.dMin;
                hwyLaneFretClipMax = nearB.dMax;
            }

            // Span the full (AHEAD + BEHIND) window so the lane's far edge
            // lands at dZ(AHEAD) = -AHEAD*TS, aligned with the note horizon.
            // Using just AHEAD here made the far edge stop at -TS*(AHEAD-BEHIND),
            // leaving the last BEHIND seconds of notes without a lane underneath.
            const sliceDt = (AHEAD + BEHIND) / HWY_LANE_TIME_SLICES;
            // Single-pass build-and-merge into the parallel-array
            // scratch buffers. Consecutive slices that resolve to the
            // same anchor bounds collapse into one segment by extending
            // its z1; otherwise a new entry appends. No per-frame array
            // or {b,z0,z1} object allocations.
            _laneSegLen = 0;
            for (let k = 0; k < HWY_LANE_TIME_SLICES; k++) {
                const dt0 = k * sliceDt;
                const dt1 = (k + 1) * sliceDt;
                const tC = now + (dt0 + dt1) * 0.5 - BEHIND;
                const b = laneBoundsFromAnchor(getChartAnchorAt(anchors, tC));
                if (!b) continue;
                // The lane STOPS AT THE HIT LINE (z = 0) — issue #991. The
                // slice window starts BEHIND seconds in the past, so the
                // first slices map to positive z, i.e. past the hit line
                // toward the player. Nothing is ever drawn there: notes and
                // chord frames clamp to Math.min(0, dZ(dt)), so that strip
                // is lane with nothing on it. Clamp the NEAR edge only —
                // the far edge stays at dZ(AHEAD+BEHIND)+TS*BEHIND = -AHEAD*TS,
                // aligned with the note horizon, exactly as before.
                const z0 = Math.min(0, dZ(dt0) + TS * BEHIND);
                const z1 = Math.min(0, dZ(dt1) + TS * BEHIND);
                // Slice lies entirely past the hit line -> zero length, nothing
                // to draw. Skip before the arp probe so it costs nothing.
                if (z0 === z1) continue;
                const arpSlice = (laneRailArpHsFlags && handShapesRails && handShapesRails.length)
                    ? arpeggioLaneOuterRailLaneSlice(
                        dt0, dt1, now,
                        handShapesRails, laneRailBoundLo, laneRailBoundHi, laneRailArpHsFlags,
                    )
                    : false;
                if (_laneSegLen > 0
                    && _laneSegDMin[_laneSegLen - 1] === b.dMin
                    && _laneSegDMax[_laneSegLen - 1] === b.dMax
                    && arpSlice === _laneSegArp[_laneSegLen - 1]) {
                    _laneSegZ1[_laneSegLen - 1] = z1;
                    _laneSegTHi[_laneSegLen - 1] = tC;
                } else if (_laneSegLen > 0
                    && _laneSegDMin[_laneSegLen - 1] === b.dMin
                    && _laneSegDMax[_laneSegLen - 1] === b.dMax
                    && arpSlice !== _laneSegArp[_laneSegLen - 1]) {
                    _laneSegDMin[_laneSegLen] = b.dMin;
                    _laneSegDMax[_laneSegLen] = b.dMax;
                    _laneSegZ0[_laneSegLen] = z0;
                    _laneSegZ1[_laneSegLen] = z1;
                    _laneSegTLo[_laneSegLen] = tC;
                    _laneSegTHi[_laneSegLen] = tC;
                    _laneSegArp[_laneSegLen] = arpSlice;
                    _laneSegLen++;
                } else {
                    _laneSegDMin[_laneSegLen] = b.dMin;
                    _laneSegDMax[_laneSegLen] = b.dMax;
                    _laneSegZ0[_laneSegLen] = z0;
                    _laneSegZ1[_laneSegLen] = z1;
                    _laneSegTLo[_laneSegLen] = tC;
                    _laneSegTHi[_laneSegLen] = tC;
                    _laneSegArp[_laneSegLen] = arpSlice;
                    _laneSegLen++;
                }
            }
            {
                const laneOp = (HWY_LANE_STRIPE_OP_BASE + highwayIntensity * HWY_LANE_STRIPE_OP_INT)
                    * (_venueSceneOverride ? VENUE_LANE_OP_BOOST : 1);
                // 2 shared materials (odd/even); opacity travels via the
                // material so set it once per frame, not per mesh.
                getMLaneOdd().opacity = laneOp;
                getMLaneEven().opacity = laneOp;
                for (let s = 0; s < _laneSegLen; s++) {
                    const segZ0 = _laneSegZ0[s];
                    const segZ1 = _laneSegZ1[s];
                    const stripLen = Math.max(Math.abs(segZ1 - segZ0), 1e-6);
                    const zc = (segZ0 + segZ1) * 0.5;
                    const fLow = _laneSegDMin[s] + 1;
                    const fHi = _laneSegDMax[s];
                    for (let f = fLow; f <= fHi; f++) {
                        const xl = xFret(f - 1), xr = xFret(f);
                        const laneW = Math.abs(xr - xl);
                        const lane = pLane.get();
                        lane.position.set((xl + xr) * 0.5, boardY + 0.02 * K, zc);
                        lane.rotation.x = -Math.PI / 2;
                        lane.scale.set(laneW, stripLen, 1);
                        const odd = ((f - fLow) & 1) === 0;
                        lane.material = odd ? getMLaneOdd() : getMLaneEven();
                        lane.renderOrder = 1;
                    }
                }
            }

            {
                const yPos = boardY + 0.03 * K;
                const divOpArp = Math.min(0.92, 0.16 + highwayIntensity * 0.42);
                if (getMLaneDividerArp()) {
                    getMLaneDividerArp().opacity = divOpArp;
                }

                for (let s = 0; s < _laneSegLen; s++) {
                    const segZ0 = _laneSegZ0[s];
                    const segZ1 = _laneSegZ1[s];
                    const dz = Math.max(Math.abs(segZ1 - segZ0), 1e-6);
                    const zMid = (segZ0 + segZ1) * 0.5;
                    const dMinSeg = _laneSegDMin[s];
                    const dMaxSeg = _laneSegDMax[s];
                    const fDiv0 = Math.floor(dMinSeg);
                    const fDiv1 = Math.ceil(dMaxSeg);
                    for (let f = fDiv0; f <= fDiv1; f++) {
                        if (_laneSegArp[s] && (f === fDiv0 || f === fDiv1)) continue;
                        const div = pLaneDivider.get();
                        div.position.set(xFret(f), yPos, zMid);
                        div.material = getMLaneDivider();
                        div.scale.set(1, 1, dz);
                        div.renderOrder = 2;
                    }
                }
                for (let s = 0; s < _laneSegLen; s++) {
                    if (!_laneSegArp[s]) continue;
                    const dMinSeg = _laneSegDMin[s];
                    const dMaxSeg = _laneSegDMax[s];
                    const fL = Math.floor(dMinSeg);
                    const fR = Math.ceil(dMaxSeg);
                    const segZ0 = _laneSegZ0[s];
                    const segZ1 = _laneSegZ1[s];
                    const arpRailLen = Math.max(Math.abs(segZ1 - segZ0), 1e-6);
                    const zArpMid = (segZ0 + segZ1) * 0.5;
                    const tMidSeg = (_laneSegTLo[s] + _laneSegTHi[s]) * 0.5;
                    const arpMulSeg = (laneRailArpHsFlags && handShapesRails && handShapesRails.length)
                        ? arpeggioLaneDividerFrameAccentMul(
                            tMidSeg, handShapesRails, chords,
                            laneRailBoundLo, laneRailBoundHi, laneRailArpHsFlags,
                        )
                        : 1;
                    const arpSSeg = arpeggioLaneDividerXYScaleMatchFrameRim(arpMulSeg);
                    for (const xf of [fL, fR]) {
                        const div = pLaneDivider.get();
                        div.position.set(xFret(xf), yPos, zArpMid);
                        div.material = getMLaneDividerArp();
                        div.scale.set(arpSSeg, arpSSeg, arpRailLen);
                        div.renderOrder = 2;
                    }
                }
            }
        } else {
            let dMin, dMax;
            let divMin, divMax;
            let minF = 99, maxF = 0;
            activeFrets.forEach(f => { if (f > 0) { minF = Math.min(minF, f); maxF = Math.max(maxF, f); } });
            dMin = minF - 1;
            dMax = maxF;
            const HWY_LANE_SPAN = 4;
            let span = dMax - dMin;
            if (span > HWY_LANE_SPAN) {
                dMin = Math.round((dMin + dMax - HWY_LANE_SPAN) / 2);
                dMax = dMin + HWY_LANE_SPAN;
                if (dMax > NFRETS) {
                    dMax = NFRETS;
                    dMin = dMax - HWY_LANE_SPAN;
                }
                if (dMin < 0) {
                    dMin = 0;
                    dMax = HWY_LANE_SPAN;
                }
            } else if (span < HWY_LANE_SPAN) {
                const need = HWY_LANE_SPAN - span;
                dMax = Math.min(NFRETS, dMax + need);
                if (dMax - dMin < HWY_LANE_SPAN) {
                    dMin = Math.max(0, dMin - (HWY_LANE_SPAN - (dMax - dMin)));
                }
            }
            if (dMax < dMin) dMax = dMin;
            hwyLaneFretClipMin = dMin;
            hwyLaneFretClipMax = dMax;
            divMin = dMin;
            divMax = dMax;

            // Far edge at -AHEAD*TS (the note horizon), near edge at the
            // hit line (z = 0) — the lane does not run past it toward the
            // player, where nothing is ever drawn (#991). Spanning
            // AHEAD+BEHIND and shifting by +TS*BEHIND put the near edge at
            // +TS*BEHIND; spanning AHEAD alone keeps the same far edge.
            const laneLen = TS * AHEAD;
            const zLane = -laneLen / 2;
            const laneOp = (HWY_LANE_STRIPE_OP_BASE + highwayIntensity * HWY_LANE_STRIPE_OP_INT)
                * (_venueSceneOverride ? VENUE_LANE_OP_BOOST : 1);
            getMLaneOdd().opacity = laneOp;
            getMLaneEven().opacity = laneOp;
            const fLow = dMin + 1;
            const fHi = dMax;
            for (let f = fLow; f <= fHi; f++) {
                const xl = xFret(f - 1), xr = xFret(f);
                const laneWStrip = Math.abs(xr - xl);
                const lane = pLane.get();
                lane.position.set((xl + xr) / 2, boardY + 0.02 * K, zLane);
                lane.rotation.x = -Math.PI / 2;
                lane.scale.set(laneWStrip, laneLen, 1);
                const odd = ((f - fLow) & 1) === 0;
                lane.material = odd ? getMLaneOdd() : getMLaneEven();
                lane.renderOrder = 1;
            }

            if (highwayIntensity > 0.05) {
                // Matches the lane above: ends at the hit line (#991).
                const divLen = TS * AHEAD;
                const yPos = boardY + 0.03 * K;
                const divOp2 = 0.02 + highwayIntensity * 0.1;
                const divOpArp2 = Math.min(0.92, 0.16 + highwayIntensity * 0.42);
                if (getMLaneDivider() && getMLaneDividerArp()) {
                    getMLaneDivider().opacity = divOp2;
                    getMLaneDividerArp().opacity = divOpArp2;
                }
                const fDivA = Math.floor(divMin);
                const fDivB = Math.ceil(divMax);
                for (let f = fDivA; f <= fDivB; f++) {
                    if (hwyLaneArpOuterDividers && (f === fDivA || f === fDivB)) continue;
                    const div = pLaneDivider.get();
                    div.position.set(xFret(f), yPos, -divLen * 0.5);
                    div.material = getMLaneDivider();
                    div.scale.set(1, 1, divLen);
                    div.renderOrder = 2;
                }
                if (hwyLaneArpOuterDividers) {
                    for (const xf of [fDivA, fDivB]) {
                        const div = pLaneDivider.get();
                        div.position.set(xFret(xf), yPos, zLane);
                        div.material = getMLaneDividerArp();
                        div.scale.set(arpLaneS, arpLaneS, laneLen);
                        div.renderOrder = 2;
                    }
                }
            }
        }

        // ── Fret boundary extension lines ─────────────────────────
        if (getMLaneDividerExt() && fretDividersVisible) {
            // Same hit-line stop as the lane (#991) — otherwise these lines
            // would be the only floor geometry still running past it.
            const extLaneLen = TS * AHEAD;
            const extZMid = -extLaneLen / 2;
            const extYPos = boardY + 0.03 * K;
            getMLaneDividerExt().opacity = Math.max(0.3, 0.3 + highwayIntensity * 0.15);
            for (let f = 0; f <= NFRETS; f++) {
                const div = pLaneDivider.get();
                div.position.set(xFret(f), extYPos, extZMid);
                div.material = getMLaneDividerExt();
                div.scale.set(1, 1, extLaneLen);
                div.renderOrder = 2;
            }
        }
    }

    // ── Dynamic fret number row (heat-coloured) ───────────────────
    // Two-part fix for issue #35:
    //  1. renderOrder = 1000 forces these sprites to the end of
    //     the transparent queue so they always paint on top of
    //     notes, sustain trails, lane plane, etc. depthTest is
    //     already disabled by txtMat(), but `depthTest: false`
    //     only exempts the sprite from depth comparison — it
    //     doesn't pin draw order. Without an explicit
    //     renderOrder, a note rendered after the label in the
    //     transparent pass would still overdraw it. Match the
    //     pattern already used for lane and dividers.
    //  2. Y-offset bumped from S_GAP * 0.6 to S_GAP * 1.4 so the
    //     label band sits clearly below the lowest string in
    //     screen space, even at the largest active scale
    //     (intensity-driven, up to ~5.7 * K vertical extent).
    //     This buys a real visual gap between notes-on-the-
    //     lowest-string and the row, on top of the renderOrder
    //     guarantee — labels never share screen with what's
    //     happening on the playing strings just above them.
    {
        const yBottom = Math.min(sY(0), sY(nStr - 1));
        // anchorSpan: [f0, f1] = [anchor.fret, anchor.fret + width - 1]
        // e.g. { fret:3, width:4 } → f0=3, f1=6 → frets 3,4,5,6 gold.
        const anchorSpan = anchorPlayedFretSpanAt(anchors, now);
        for (let f = 1; f <= NFRETS; f++) {
            const isInAnchor = anchorSpan
                && f >= anchorSpan.f0 && f <= anchorSpan.f1;
            const isMainFret = DOTS.includes(f);
            // Rule 1: show gray label only on main frets (dot positions).
            // Rule 2: show gold label on any fret inside the anchor range.
            // Non-main frets outside the anchor range are hidden entirely.
            if (!isInAnchor && !isMainFret) continue;
            const lb = pFretLbl.get();
            lb.material = txtMat(f,
                isInAnchor ? FRET_LABEL_GOLD_HEX : FRET_LABEL_IDLE_HEX,
                false, 'fretRow');
            lb.position.set(xFretMid(f), yBottom - S_GAP * 1.4, 0.5 * K);
            lb.material.opacity = isInAnchor ? 1.0 : 0.55;
            const scale = 5.95 * getTextSizeMul() * fretLabelScaleForFret(f);
            lb.scale.set(scale * K, scale * K, 1);
            lb.renderOrder = 1000;
        }
    }

    // ── Beat lines ────────────────────────────────────────────────
    if (beats) {
        const board = boardSpanX();
        const bw2 = board.width + 4 * K;
        let lastM = -1;
        for (const b of beats) {
            const meas = b.measure !== lastM; lastM = b.measure;
            if (b.time < t0 || b.time > t1) continue;
            const bl2 = pBeat.get();
            bl2.material = meas ? getMBeatM() : getMBeatQ();
            bl2.scale.set(bw2, 1, 1);
            bl2.position.set(board.min - 2 * K, S_BASE - NH / 2 - 1.5 * K, dZ(b.time - now));
        }
    }

    // ── Section labels ────────────────────────────────────────────
    // Gated on sectionLabelsOnHighway (advanced setting, default off).
    // The HUD card (drawSectionHud, called from the lyricsCtx block in
    // draw()) is the primary surface for section info; the on-highway
    // sprites are kept as an opt-in for users who want the in-scene cue.
    if (sections && sectionLabelsOnHighway) {
        const labelY = Math.max(sY(0), sY(nStr - 1)) + 8 * K;
        for (const s of sections) {
            if (s.time < t0 || s.time > t1) continue;
            const sp = pSec.get();
            sp.material = txtMat(s.name, '#00cccc', true, 'section');
            sp.scale.set(20 * K * getTextSizeMul(), 5 * K * getTextSizeMul(), 1);
            sp.position.set(xFret(12), labelY, dZ(s.time - now));
        }
    }

    // ── Fret-column reference markers ─────────────────────────────
    // Every Nth measure, spawn a row of fret-number sprites on the
    // board floor that scroll toward the hit line and vanish at Z=0.
    // With a chart <anchor>, which frets appear follows the inlay
    // cadence (DOTS) centred on the snapped anchor fret (~2 positions
    // back and ~3 forward in that list, e.g. anchor 7 → 3,5,7,9,12,15).
    // Without anchors, all DOTS positions are candidates; octave + lane
    // clipping apply. With <anchor>, the cadence row ignores both so
    // frets before/after the lane still show as reference. Light grey
    // when that fret is in the active set, dark grey otherwise.
    //
    // Per-wave gate cache: hasLow/hasHigh/fretList snapshotted at first
    // sight of a wave so the render decision stays stable through
    // the wave's full flight. Without this, activeFrets shifting
    // mid-song would drop markers mid-flight (user-reported bug:
    // "numbers disappear before they get all the way towards me").
    if (beats && fretColumnMarkerCadence > 0) {
        // Prune stale wave cache entries (wave already past now).
        if (_fretMarkerWaveCache.size > 0) {
            for (const k of _fretMarkerWaveCache.keys()) {
                if (k < now) _fretMarkerWaveCache.delete(k);
            }
        }
        const minStringY = Math.min(sY(0), sY(nStr - 1));
        const labelY = minStringY - S_GAP * 0.8;
        for (const b of beats) {
            // Non-downbeats are encoded as measure=-1; only actual
            // measure starts (measure >= 0) can spawn marker waves.
            if (b.measure < 0) continue;
            if (b.time < 0 || b.time > t1) continue;
            if (b.time <= now) continue;
            if ((b.measure | 0) % fretColumnMarkerCadence !== 0) continue;

            // Snapshot the active-range gate at first sight of this
            // wave. We scan notes/chords in a 2s window starting at
            // b.time rather than activeFrets, because activeFrets only
            // covers now+2s and waves first become visible up to
            // AHEAD (3s) ahead — using activeFrets would cache
            // {hasLow:false, hasHigh:false} for far waves and suppress
            // the entire row for its full flight.
            let cached = _fretMarkerWaveCache.get(b.time);
            if (!cached) {
                let hasLow = false, hasHigh = false;
                const wT0 = b.time, wT1 = b.time + 2;
                // notes and chords are time-sorted; binary-search to the
                // first entry >= wT0, then break once past wT1 to avoid
                // O(song_length) work per newly-seen wave.
                if (notes) {
                    const startI = lowerBoundT(notes, wT0);
                    for (let i = startI; i < notes.length; i++) {
                        const n = notes[i];
                        if (n.t > wT1) break;
                        if (!validString(n.s) || n.f <= 0) continue;
                        if (n.f <= 12) hasLow = true; else hasHigh = true;
                        if (hasLow && hasHigh) break;
                    }
                }
                if ((!hasLow || !hasHigh) && chords) {
                    const startI = lowerBoundT(chords, wT0);
                    outer: for (let i = startI; i < chords.length; i++) {
                        const ch = chords[i];
                        if (ch.t > wT1) break outer;
                        if (!ch.notes) continue;
                        for (const cn of ch.notes) {
                            if (!validString(cn.s) || cn.f <= 0) continue;
                            if (cn.f <= 12) hasLow = true; else hasHigh = true;
                            if (hasLow && hasHigh) break outer;
                        }
                    }
                }
                const anc = anchors && anchors.length ? getChartAnchorAt(anchors, b.time) : null;
                const anchorFret = anc != null ? Number(anc.fret) : NaN;
                const anchorKeyed = Number.isFinite(anchorFret) && anchorFret >= 0;
                const fretList = anchorKeyed
                    ? fretColumnMarkersForAnchor(anchorFret, DOTS)
                    : DOTS.slice();
                cached = { hasLow, hasHigh, fretList, anchorKeyed };
                _fretMarkerWaveCache.set(b.time, cached);
            }
            if (!cached.hasLow && !cached.hasHigh && !cached.anchorKeyed) continue;

            const dt = b.time - now;
            // Fade in over 0.35 s from the maximum lookahead distance so
            // the label appears at its correct final size the moment it
            // becomes visible, rather than gradually emerging as a tiny
            // dim spec through scene fog (fog is disabled on the sprite
            // material; this manual ramp replaces it).
            const _colFadeIn = Math.min(1.0, (AHEAD - dt) / 0.35);
            if (_colFadeIn <= 0) continue;

            const z = dZ(dt);
            // Sprite scale matches the per-note connector fret label
            // (drawNote → pNoteFretLabel) so cadence markers read the
            // same size at a given Z — no extra world-scale boost.
            const clipMin = hwyLaneFretClipMin;
            const clipMax = hwyLaneFretClipMax;
            const fretList = cached.fretList || DOTS;
            const anchorKeyedRow = !!cached.anchorKeyed;
            for (const f of fretList) {
                let show;
                if (anchorKeyedRow) {
                    show = true;
                } else {
                    if (f === 12) show = cached.hasLow || cached.hasHigh;
                    else if (f < 12) show = cached.hasLow;
                    else show = cached.hasHigh;
                }
                if (!show) continue;
                if (!anchorKeyedRow && clipMin != null && (f <= clipMin || f > clipMax)) continue;
                // Fixed colour — avoids mid-flight colour flips caused by
                // activeFrets only covering now+2s while waves appear at
                // AHEAD (3s), which made each marker start dark then
                // suddenly jump to light when its note entered the 2s window.
                const color = '#888888';
                const sp = pFretColMarker.get();
                const m = txtMat(f, color, false, 'noteFret');
                _setLabelMap(sp, m);
                sp.material.opacity = 0.85 * _colFadeIn;
                sp.position.set(xFretMid(f), labelY, z);
                // Z-proportional: sits between chord frame and note gem
                // at the same depth, so chord frames never overdraw the
                // marker and the marker never overdraws gems.
                sp.renderOrder = renderOrderForLayerAtZ(z, 'FRET_COLUMN');
                // Scale grows linearly from 2× at max lookahead to 1× at hit line,
                // combined with natural perspective attenuation the label starts
                // visibly larger and converges to the row-label size at z=0.
                const sz = 7.0 * K * (1 + 0.4 * dt / AHEAD) * getTextSizeMul() * fretLabelScaleForFret(f);
                sp.scale.set(sz, sz, 1);
            }

        }
    }

    // ── Camera target ─────────────────────────────────────────────
    let lockActive;
    let bootstrapHoldActive = false;
    if (getCamBootstrapHolding()) {
        if (getCamBootstrapMode() !== cameraMode) {
            setCamBootstrapHolding(false);
            setCamBootstrapMode(null);
        } else {
            const liveFramingReady = cameraMode === 'lookahead'
                ? lookaheadBoundsNow !== null
                : camDistGot;
            if (liveFramingReady) {
                setCamBootstrapHolding(false);
                setCamBootstrapMode(null);
            } else {
                bootstrapHoldActive = true;
            }
        }
    }

    if (bootstrapHoldActive) {
        // Keep the chart-load target intact until the ordinary live
        // path can compute the same phrase. Camera Director still
        // layers its free-camera transform in camUpdate().
        lockActive = getPrevLockActive();
    } else if (!(cameraMode === 'lookahead')) {
        lockActive = _applyNoteCamTargets(
            camWX, camWSum, camDistMin, camDistMax, camDistGot,
            camHystF, camDistHystF, /* skipDistHyst= */ false);
        setPrevLockActive(lockActive);
    } else {
        const lookaheadMaxF = lookaheadBoundsNow ? lookaheadBoundsNow.maxF : 0;
        const lookaheadHasBounds = lookaheadBoundsNow != null;

        let dtSec = 1 / 120;
        if (getLookaheadCamPrevNow() !== null) {
            const rawDt = getFrameNow() - getLookaheadCamPrevNow();
            if (rawDt > -1 && rawDt < 2) dtSec = Math.min(0.2, Math.max(1 / 960, rawDt));
        }
        setLookaheadCamPrevNow(getFrameNow());
        const dBlend = Math.min(0.2, Math.max(1e-4, dtSec));
        const lowBlendFs = 1 - Math.pow(1 - CAM_FOCUS_BLEND_RATE, dBlend);

        if (!lookaheadHasBounds || lookaheadMaxF <= LOOKAHEAD_LOCK_ENGAGE_MAXF)
            setLookaheadHiNeckLatch(false);
        else if (lookaheadMaxF >= LOOKAHEAD_LOCK_RELEASE_MAXF)
            setLookaheadHiNeckLatch(true);

        const lookaheadLockLowEligible = cameraLockLow
            && (!lookaheadHasBounds
                || (!getLookaheadHiNeckLatch() && lookaheadMaxF <= 12));

        let rawLowBU;
        if (lookaheadLockLowEligible) {
            rawLowBU = camLowFretPullbackU(1);
        } else if (lookaheadBoundsNow) {
            rawLowBU = camLowFretPullbackU(lookaheadBoundsNow.minF);
        } else {
            rawLowBU = camLowFretPullbackU(CAM_LOCK_CENTER_FRET);
        }
        setLookaheadLowBonusU(rawLowBU * lowBlendFs + getLookaheadLowBonusU() * (1 - lowBlendFs));

        if (lookaheadLockLowEligible) {
            const lockedBaseU = camBaseDistU(12);
            const lockZoomMul = CAM_LOCK_ZOOM_MIN +
                (CAM_LOCK_ZOOM_MAX - CAM_LOCK_ZOOM_MIN) * cameraLockZoom;
            lookaheadSmoothCamStep(dtSec, xFretMid(CAM_LOCK_CENTER_FRET), 12);
            setTgtX(getLookaheadCamX());
            setTgtDist((lockedBaseU + getLookaheadLowBonusU()) * K * lockZoomMul);
            setPrevLowFretBonus(getLookaheadLowBonusU());
            lockActive = true;
        } else {
            if (lookaheadBoundsNow) {
                const tgtWX = lookaheadTargetWorldX(
                    lookaheadBoundsNow.minF, lookaheadBoundsNow.maxF);
                const tgtSpanInt = Math.max(
                    1, lookaheadBoundsNow.maxF - lookaheadBoundsNow.minF + 1);
                lookaheadSmoothCamStep(dtSec, tgtWX, tgtSpanInt);
                setTgtDist((camBaseDistU(getLookaheadFretSpan()) + getLookaheadLowBonusU()) * K);
                setPrevLowFretBonus(getLookaheadLowBonusU());
            } else {
                lookaheadSmoothCamStep(dtSec, getLookaheadCamX(), getLookaheadFretSpan());
                setTgtDist((camBaseDistU(getLookaheadFretSpan()) + getLookaheadLowBonusU()) * K);
                setPrevLowFretBonus(getLookaheadLowBonusU());
            }
            setTgtX(getLookaheadCamX());
            lockActive = false;
        }
        setPrevLockActive(lockActive);
    }

    // ── Chord diagram: track chord, drive entrance + crossfade animations ─
    {
        let newChord = null;
        if (chords) {
            // Only chords in (now - DIAG_LINGER_S, now] — use binary search
            // to skip past old chords, break once we pass `now`.
            const _dlo = lowerBoundT(chords, now - DIAG_LINGER_S);
            for (let _di = _dlo; _di < chords.length; _di++) {
                const ch = chords[_di];
                const chDt = ch.t - now;
                if (chDt > 0) break;
                if (!ch.notes) continue;
                const tmpl = bundle.chordTemplates?.[ch.id];
                const lbl = chordTemplateLabel(tmpl);
                // Last valid chord (highest t ≤ now) naturally wins since array is sorted.
                if (lbl && tmpl?.frets) {
                    newChord = { name: lbl, frets: tmpl.frets, t: ch.t, t0: ch.t, chDt, nStr };
                }
            }
        }

        // Include frets in the key so two templates sharing a display name but
        // differing in fingering each trigger a fresh crossfade/entrance.
        const newKey = newChord ? newChord.name + '|' + newChord.frets.join(',') : null;
        if (newKey !== getDiagLastKey()) {
            if (getDiagChord() && newKey !== null) {
                // Recompute outgoing alpha from stored event time rather than the
                // stale per-frame chDt; after dropped frames or seeks this prevents
                // the overlay jumping to a stale brightness before the crossfade.
                const freshChDt = getDiagChord().t !== undefined ? getDiagChord().t - now : getDiagChord().chDt;
                const prevOpacity = Math.max(0, Math.min(1, 1 + freshChDt / DIAG_LINGER_S));
                // Only crossfade when the outgoing chord is actually visible at now.
                // freshChDt > 0 means the old chord is in the future (backward seek
                // crossed the chord boundary).  In that case _diagChord is stale, so
                // recompute the outgoing diagram from the chart — find the most recent
                // named chord that ends just before newChord.t and use it as _diagPrev
                // so that seeking into a historical chord transition fades correctly
                // rather than snapping straight to the new chord.
                if (freshChDt <= 0 && prevOpacity > 0) {
                    // Use the string count the outgoing chord was captured with, not the
                    // current nStr — an arrangement switch during a 150 ms crossfade
                    // must not remap the outgoing diagram onto the new layout.
                    setDiagPrev({ name: getDiagChord().name, frets: getDiagChord().frets, nStr: getDiagChord().nStr ?? nStr, t: getDiagChord().t0 ?? getDiagChord().t ?? now });
                    setDiagPrevStartOpacity(prevOpacity);
                    setDiagPrevOpacity(prevOpacity);
                    setDiagPrevStartT(now);
                    // entranceT for the outgoing diagram is computed live from _diagPrev.t
                    // each frame (see draw path), so it rewinds correctly on backward seeks
                    // within the crossfade window — no separate snapped state needed here.
                } else if (freshChDt > 0) {
                    // Backward seek: _diagChord is now in the future.
                    // Look up the chart chord immediately before newChord.t to provide
                    // the correct historical outgoing diagram for the crossfade.
                    let histPrev = null;
                    if (chords && newChord) {
                        // Find the most recent named chord before newChord.t.
                        // Chords are sorted ascending, so all matches are before
                        // lowerBoundT(chords, newChord.t); iterate in order and
                        // take the last valid one.
                        const _hpHi = lowerBoundT(chords, newChord.t);
                        for (let _hpi = 0; _hpi < _hpHi; _hpi++) {
                            const ch = chords[_hpi];
                            if (!ch.notes) continue;
                            const tmpl = bundle.chordTemplates?.[ch.id];
                            const lbl = chordTemplateLabel(tmpl);
                            if (lbl && tmpl?.frets) {
                                histPrev = { name: lbl, frets: tmpl.frets, t: ch.t, t0: ch.t, nStr };
                            }
                        }
                    }
                    // Only start a crossfade if we are still within DIAG_CROSSFADE_S of
                    // newChord.t; seeking further into the chord skips the crossfade.
                    // Also skip if histPrev was no longer visible when newChord started
                    // (gap longer than DIAG_LINGER_S), so only genuinely adjacent chord
                    // transitions produce a crossfade — not seeks to just after any new
                    // chord that happens to have an older chord somewhere earlier in the song.
                    const elapsed = newChord ? now - newChord.t : Infinity;
                    const histPrevVisible = histPrev && (newChord.t - histPrev.t) < DIAG_LINGER_S;
                    if (histPrevVisible && elapsed >= 0 && elapsed < DIAG_CROSSFADE_S) {
                        // Start at the linger opacity the outgoing chord would have had at
                        // newChord.t during forward playback, not always 1.  This prevents
                        // a chord that was mostly faded from appearing brighter on a seek.
                        const histStartOpacity = Math.max(0, Math.min(1,
                            1 - (newChord.t - histPrev.t) / DIAG_LINGER_S));
                        setDiagPrev(histPrev);
                        setDiagPrevStartOpacity(histStartOpacity);
                        setDiagPrevOpacity(Math.max(0, getDiagPrevStartOpacity() * (1 - elapsed / DIAG_CROSSFADE_S)));
                        setDiagPrevStartT(newChord.t);
                    } else {
                        setDiagPrev(null); setDiagPrevOpacity(0); setDiagPrevStartOpacity(0);
                        setDiagPrevStartT(null);
                    }
                } else {
                    // prevOpacity <= 0: old chord already fully faded, no crossfade needed.
                    setDiagPrev(null); setDiagPrevOpacity(0); setDiagPrevStartOpacity(0);
                    setDiagPrevStartT(null);
                }
            } else {
                setDiagPrev(null); setDiagPrevOpacity(0); setDiagPrevStartOpacity(0);
                setDiagPrevStartT(null);
            }
            setDiagLastKey(newKey);
            // Only update _diagChord when the chord key actually changes so that a
            // lingering chord's original nStr is preserved on subsequent frames.
            // (newChord is rebuilt every frame with the live nStr; unconditionally
            // assigning here would stomp the captured nStr if the arrangement switches
            // while the same chord is still in its linger window.)
            setDiagChord(newChord);
        } else if (newKey !== null && newChord && getDiagChord()) {
            // Same chord re-seen. Update linger expiry (t) when the event time changes.
            // Forward restrum (newChord.t > _diagChord.t): extend the linger window
            // but preserve t0 so the entrance animation is NOT replayed — avoids the
            // overlay jumping back to its 0.85× scale on every strum of the same chord.
            // Backward seek to earlier occurrence (newChord.t < _diagChord.t): update
            // both t and t0 to restart the entrance animation from the earlier position.
            if (newChord.t !== getDiagChord().t) {
                setDiagChord(newChord.t < getDiagChord().t
                    ? { ...getDiagChord(), t: newChord.t, t0: newChord.t }  // backward seek
                    : { ...getDiagChord(), t: newChord.t });                 // forward restrum
            }
        }

        // Guard for backward seeks within the same chord (same key, no branch above).
        // If _diagPrevStartT is in the future relative to now, the crossfade was set up
        // during a later playback position that has since been seeked past. Clear it so
        // the stale outgoing diagram does not stay fully visible at the seek target.
        if (getDiagPrev() && getDiagPrevStartT() !== null && getDiagPrevStartT() > now) {
            setDiagPrev(null); setDiagPrevOpacity(0); setDiagPrevStartOpacity(0);
            setDiagPrevStartT(null);
        }

        // Entrance: derived from t0 (the original appearance time, not updated on
        // forward restrums) so repeated hits of the same chord do not replay the
        // 0.85→1.0 scale animation. On backward seeks t0 is updated alongside t,
        // so the animation still rewinds correctly to the earlier position.
        const _entranceAnchor = getDiagChord() && (getDiagChord().t0 ?? getDiagChord().t);
        setDiagEntranceT(getDiagChord() && _entranceAnchor !== undefined
            ? Math.min(1.0, Math.max(0, (now - _entranceAnchor) / DIAG_ENTRANCE_S))
            : 1.0);

        // Crossfade: derived from absolute start time so backward seeks within the
        // crossfade window correctly rewind the fade. _diagPrev is kept alive (at
        // opacity 0) until the next key change rather than destroyed here, so that a
        // backward seek that re-enters the crossfade window can recompute a positive
        // opacity. Seeks before _diagPrevStartT are handled by the guard above.
        if (getDiagPrev() && getDiagPrevStartT() !== null) {
            const fadedT = Math.max(0, now - getDiagPrevStartT());
            setDiagPrevOpacity(Math.max(0, getDiagPrevStartOpacity() * (1 - fadedT / DIAG_CROSSFADE_S)));
        }
    }
    // ── Finalise InstancedMesh batches ────────────────────────────────
    // Flush all 6 IMs: set visible instance count and mark buffers dirty.
    // Must run after all drawNote() / chord-loop writes are done.
    if (imPMTech) {
        imPMTech.count = getImPMTechCount();
        if (getImPMTechCount() > 0) {
            imPMTech.instanceMatrix.needsUpdate = true;
            imPMTech.geometry.getAttribute('instanceAlpha').needsUpdate = true;
        }
    }
    if (imFHTech) {
        imFHTech.count = getImFHTechCount();
        if (getImFHTechCount() > 0) {
            imFHTech.instanceMatrix.needsUpdate = true;
            imFHTech.geometry.getAttribute('instanceAlpha').needsUpdate = true;
        }
    }
    // These IMs are kept alive but always empty (count=0) — rendering
    // is now handled by the pPMXFill / pMuteXLines / pFHXFill / pFHXLines
    // pools which support per-chord Z-proportional renderOrder.
    if (imPMXFill)  imPMXFill.count  = 0;
    if (imPMXLines) imPMXLines.count = 0;
    if (imFHXFill)  imFHXFill.count  = 0;
    if (imFHXLines) imFHXLines.count = 0;

    pbEnd(5);
    pbEnd(0);
    pbReportTick();
}
    return { update, _prewarmStatic, _prewarmChart };
}
