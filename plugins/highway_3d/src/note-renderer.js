// h3d-carve-14: V-section (note renderer) → src/note-renderer.js
// Source: plugins/highway_3d/screen.js lines 10172–11604 (pre-cut).
// Factory pattern: createNoteRenderer({DI}) → { drawNote, drawArpBrackets, drawNotedetectLabels, chordHarmonyLabels }
// chordHarmonyLabels is also called from update() (U-section) at line 9016.
//
// DI surface: 130 params
//   - 27 constants (shorthand)
//   - 24 fn-refs (shorthand)
//   - 69 getters (() => _var arrows)
//   - 3 setters ((v) => { _var = v; } arrows)
//   - 7 stable refs (by-ref mutate only, shorthand)
//
// Beyond-subst (3 sites):
//   1. _ndVerdictSawAlpha = true              → setNdVerdictSawAlpha(true)
//   2. _ndVerdictMaxAlpha = _ndCs.alpha       → setNdVerdictMaxAlpha(_ndCs.alpha)
//      if (_ndCs.alpha > _ndVerdictMaxAlpha)  → if (_ndCs.alpha > getNdVerdictMaxAlpha())
//   3. _streakHits = 0 / _streakHits++        → setStreakHits(0) / setStreakHits(getStreakHits() + 1)
//
// Getter-aliasing: all read-only getters aliased once at each exported function's
// entry. Read-write vars (_streakHits, _ndVerdictSawAlpha, _ndVerdictMaxAlpha) use
// getter/setter inline so writes propagate correctly across notes within a frame.

import { dZ, slideTrailEnd, renderOrderForLayerAtZ } from './geometry.js'; // h3d-carve-14

export function createNoteRenderer({
    // ── Constants ──────────────────────────────────────────────────────────
    K, NFRETS, NW, NH, AHEAD,
    GHOST_HOLD_AFTER_ONSET, NEXT_ON_STRING_T_EPS, NOTEDETECT_GEM_VERDICT_WINDOW,
    SLIDE_RIBBON_SAMPLES, S_GAP,
    BEND_HALFSTEP_WORLD_Y, PROJ_WIN, PROJ_WIN_G, PROJ_GROW_MIN,
    GHOST_FRET_LBL_FADE_S,
    BEND_ENV_RISE_FRAC, BEND_ENV_RELEASE_FRAC,
    VIBRATO_HALF_WAVE_S, TREMOLO_BUMP_S,
    ACCENT_RIM_XY_SCALE_MUL, ACCENT_RIM_Z_SCALE_MUL,
    CHORD_FRAME_RIM_FRAC_H, CHORD_FRAME_RIM_MIN,
    FRET_LABEL_GOLD_HEX, SINGLE_SUS_OFFSETS,
    TS, _ND_TIME_EPS,
    // ── Function refs ──────────────────────────────────────────────────────
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
    // ── Frame-state getters (let vars reassigned across lifecycle) ─────────
    getLeftyCached, getInvertedCached,
    getDrawNextByString, getDrawRecentByString,
    getDrawAnchors, getDrawChordTemplates,
    getDrawTeachingMarks, getShowFingerHints,
    getTextSizeMul,
    getNdGetNoteState, getNdHasProvider,
    getNdHitMarks, getNdMissMarks, getNdLabels,
    getCam, getProbe,
    getCurX, getNStr,
    getAccentShellsByString,
    // Verdict getters/setters
    getNdVerdictMaxAlpha, setNdVerdictSawAlpha, setNdVerdictMaxAlpha,
    // Streak getter/setter
    getStreakHits, setStreakHits,
    // Additional frame-state getters
    getGNote, getGNoteGrad,
    getActivePalette,
    getHitFx, getSparks,
    getVerdictMarks,
    getStreakFx, getStreakHeat,
    getSlideArrowApproachVisible, getSlideArrowNeckVisible, getSlideArrowChainPreviewVisible,
    getVibrancyProjOp,
    getFretLabelAllowed,
    getProjMeshArr, getProjectionVisible, getGlowMul,
    getShowFretOnNote, getFretNumberGhostScope,
    // ── Pool getters ───────────────────────────────────────────────────────
    getPNote, getPNoteEdge,
    getPSus, getPSusOutline,
    getPSusRibbon, getPSusRibbonOl,
    getPTapChevron, getPAccentHalo,
    getPArpBracket,
    getPConnectorLine, getPDropLine,
    getPGhostFretLbl, getPNoteFretLabel, getPTeachMarkLbl,
    getPTechPlane,
    // ── Material getters ───────────────────────────────────────────────────
    getMStr, getMGlow,
    getMSus, getMSusOutline,
    getMHitBright, getMHitBrightArrays,
    getMmissOutline, getMmissEdgeArrays,
    getMRimFlash,
    getMAccentHaloNear, getMAccentOutline, getMAccentCore,
    getMStrHitOutline, getMHitSusOutline, getMWhiteOutline,
    // ── Stable refs (by-ref mutate only, never reassigned) ─────────────────
    _susVerdictLatch,
    _fwHitIn, _fwChordAcc, _scrGhostUpcomingCount,
    _rimFlashIn, _sparkSeen, _frameLabeledKeys,
}) {

    // ── Private helpers ─────────────────────────────────────────────────────

    function slideRibbonUpdatePositions(geom, strandBaseX, tw, th, y, sliceDur, susStart, now, n, slideSt) {
        const pa = geom.attributes.position.array;
        const S = SLIDE_RIBBON_SAMPLES;
        // slideOffsetWorldX is defined at module scope so it returns a
        // right-handed delta (built from non-lefty fretMid). strandBaseX is
        // already lefty-mirrored via xFretMid at the call site, so the
        // delta needs the same sign flip to keep the slide tracking the
        // mirrored fretboard direction.
        const dirMul = getLeftyCached() ? -1 : 1; // beyond-subst: _leftyCached → getLeftyCached()
        let v = 0;
        for (let k = 0; k <= S; k++) {
            const Tk = susStart + (k / S) * sliceDur;
            const zk = dZ(Tk - now);
            const xc = strandBaseX
                + dirMul * slideOffsetWorldX(n, Tk, slideSt)
                + tremoloOffsetWorldX(n, Tk);
            const yc = y + techniqueYOffsetWorld(n, Tk);
            pa[v++] = xc - tw * 0.5; pa[v++] = yc - th * 0.5; pa[v++] = zk;
            pa[v++] = xc + tw * 0.5; pa[v++] = yc - th * 0.5; pa[v++] = zk;
            pa[v++] = xc + tw * 0.5; pa[v++] = yc + th * 0.5; pa[v++] = zk;
            pa[v++] = xc - tw * 0.5; pa[v++] = yc + th * 0.5; pa[v++] = zk;
        }
        geom.attributes.position.needsUpdate = true;
        // Normals are pre-baked at geometry creation (see mkSlideRibbonGeo);
        // axis-aligned cross-section means they don't need per-frame recompute.
    }

    function noteHasVibrato(n) {
        return !!(n && (n.vb || n.vibrato));
    }

    function bendVisualDirY(stringIdx) {
        if (!Number.isFinite(stringIdx) || getNStr() <= 1) return 1; // beyond-subst: nStr → getNStr()
        const visualIdx = getInvertedCached() ? stringIdx : (getNStr() - 1 - stringIdx); // beyond-subst
        return visualIdx >= (getNStr() - 1) * 0.5 ? -1 : 1;
    }

    // Teaching marks (§6.2.2) — display only, never grading. Pure label
    // helpers, mirroring static/highway.js so the two highways agree;
    // node-tested via tests/js/highway_teaching_marks.test.js.
    function teachingFingerLabel(fg) {
        // fret-hand finger: '' when unset/out of range; 0 -> 'T' (thumb),
        // 1..4 -> '1'..'4'.
        if (!Number.isInteger(fg) || fg < 0 || fg > 4) return '';
        return fg === 0 ? 'T' : String(fg);
    }
    function teachingDegreeLabel(sd) {
        // scale degree: chromatic 0..11 above the active key tonic; '' when
        // unset/out of range.
        if (!Number.isInteger(sd) || sd < 0 || sd > 11) return '';
        return String(sd);
    }
    /** Harmony annotations (§6.3.1 / §6.6): display labels for a chord's
     * function (instance `fn.rn` Roman numeral) and template `voicing`,
     * `caged` shape, and `guideTones`. '' for each when absent/malformed;
     * `caged`/`guideTones` come back pre-formatted ("CAGED: E" / "gt 4,10").
     * Pure; shared with the 2D highway and node-tested. Display only — never
     * grading. */
    function chordHarmonyLabels(fn, voicing, caged, guideTones) {
        const rn = (fn && typeof fn.rn === 'string') ? fn.rn.trim() : '';
        const vc = (typeof voicing === 'string') ? voicing.trim() : '';
        const cg = (typeof caged === 'string' && /^[CAGED]$/.test(caged.trim()))
            ? 'CAGED: ' + caged.trim() : '';
        const gt = Array.isArray(guideTones)
            ? guideTones.filter(n => Number.isInteger(n) && n >= 0 && n <= 11) : [];
        return { rn, voicing: vc, caged: cg, guideTones: gt.length ? 'gt ' + gt.join(',') : '' };
    }

    function bnvSampleAt(bnv, t) {
        // Linear interpolation of a bend curve [{t, v}] (§6.2.1; t is
        // seconds from the note onset) at elapsed time t. Clamps to the
        // endpoints; returns 0 for an empty/invalid curve.
        if (!Array.isArray(bnv) || bnv.length === 0) return 0;
        if (t <= bnv[0].t) return bnv[0].v;
        const last = bnv[bnv.length - 1];
        if (t >= last.t) return last.v;
        for (let i = 1; i < bnv.length; i++) {
            const a = bnv[i - 1], b = bnv[i];
            if (t <= b.t) {
                const span = b.t - a.t;
                return span > 0 ? a.v + (b.v - a.v) * ((t - a.t) / span) : b.v;
            }
        }
        return last.v;
    }

    function bendSemisAtTime(n, chartTime) {
        if (!(n?.sus > 0)) return 0;
        // When the note carries an authoritative bend curve (§6.2.1),
        // sample its real shape at the elapsed time so the gem's Y gesture
        // and sustain ribbon follow the actual bend (pre-bend, round-trip,
        // release, …). Negative samples clamp to 0 (upward-only Y offset).
        if (Array.isArray(n.bnv) && n.bnv.length) {
            return Math.max(0, bnvSampleAt(n.bnv, chartTime - n.t));
        }
        const bn = Number(n?.bn) || 0;
        if (!(bn > 0)) return 0;
        const p = Math.max(0, Math.min(1, (chartTime - n.t) / Math.max(n.sus, 1e-6)));
        // Fallback: synthesize rise → hold → release from the scalar peak.
        // Ramp up over the first ~35 %, hold, then release over the last
        // ~30 % — the bend gesture rather than a monotone climb. Drives both
        // the sustain ribbon's Y contour and the gem's techniqueYNow offset.
        const RISE = BEND_ENV_RISE_FRAC, REL = BEND_ENV_RELEASE_FRAC;
        let env;
        if (p < RISE) env = p / RISE;
        else if (p < 1 - REL) env = 1;
        else env = (1 - p) / REL;
        return bn * Math.max(0, Math.min(1, env));
    }

    function vibratoSemisAtTime(n, chartTime) {
        if (!noteHasVibrato(n) || !(n?.sus > 0)) return 0;
        const elapsed = Math.max(0, chartTime - n.t);
        return Math.sin(elapsed * Math.PI / VIBRATO_HALF_WAVE_S);
    }

    function techniqueYOffsetWorld(n, chartTime) {
        if (!(n?.sus > 0)) return 0;
        const bendSemi = bendSemisAtTime(n, chartTime);
        const vibratoSemi = vibratoSemisAtTime(n, chartTime);
        if (bendSemi === 0 && vibratoSemi === 0) return 0;
        return bendVisualDirY(n.s) * BEND_HALFSTEP_WORLD_Y * (bendSemi + vibratoSemi);
    }

    function tremoloOffsetWorldX(n, chartTime, trailW) {
        if (!(n?.tr) || !(n?.sus > 0)) return 0;
        const elapsed = Math.max(0, chartTime - n.t);
        const phase = (elapsed % TREMOLO_BUMP_S) / TREMOLO_BUMP_S;
        const tri = (Math.abs(phase - 0.5) - 0.25) * 3;
        return trailW * 0.5 * tri;
    }

    /* ── Note renderer ───────────────────────────────────────────────── */
    // Chart-format <chordTemplates> frets: -1 = unused, 0 = open, n>0 = fret.
    // Ghost digit for chord notes uses the template row when present so it
    // matches the XML diagram, not a divergent chordNote.f if any.
    function _templateFretForChordGhost(chordId, stringIdx, noteFret) {
        if (chordId == null) return noteFret;
        // Coerce: some upstream paths (e.g. hs.chord_id from sloppaks)
        // hand us string ids like "12". Cf. `templates[cid] ?? templates[Number(cid)]`
        // earlier in this file.
        const cid = typeof chordId === 'number' ? chordId : Number(chordId);
        if (!Number.isFinite(cid)) return noteFret;
        const fr = getDrawChordTemplates()?.[cid]?.frets; // beyond-subst: _drawChordTemplates → getDrawChordTemplates()
        if (!Array.isArray(fr) || stringIdx < 0 || stringIdx >= fr.length) return noteFret;
        const tf = fr[stringIdx];
        if (typeof tf !== 'number' || tf < 0) return noteFret;
        return tf;
    }
    // Chart-format-style ghost digit: finger position (1=index … 4=pinky) from
    // the chord template.  Returns null when no finger data is available
    // (GP imports emit all -1; open strings have finger 0 which we skip too
    // since "0" is already shown via the open-string note path).
    function _templateFingerForChordGhost(chordId, stringIdx) {
        if (chordId == null) return null;
        const cid = typeof chordId === 'number' ? chordId : Number(chordId);
        if (!Number.isFinite(cid)) return null;
        const fi = getDrawChordTemplates()?.[cid]?.fingers; // beyond-subst: _drawChordTemplates → getDrawChordTemplates()
        if (!Array.isArray(fi) || stringIdx < 0 || stringIdx >= fi.length) return null;
        const tf = fi[stringIdx];
        // -1 = unused / no data (GP imports); 0 = open string (skip — gem path handles it)
        if (typeof tf !== 'number' || tf <= 0) return null;
        return tf; // 1–4
    }
    /**
     * Renders one board-ghost fret digit onto a pooled label mesh, flat
     * in the board XY plane at (x, y, 0) — a Mesh (not a Sprite
     * billboard) so perspective + projRim match the 3D ghost frame.
     * Shared by drawNote()'s Primary ghost slot (chord/arp-aware caller
     * resolves fretDisplay/alpha/fretForScale itself) and its Upcoming
     * slots (always plain lead notes, where those collapse to
     * n.f/projFactor/n.f).
     */
    function drawGhostFretLabel(x, y, projRim, fretDisplay, alpha, growScale, fretForScale) {
        const pGhostFretLbl = getPGhostFretLbl(); // beyond-subst: pool getter
        const lb = pGhostFretLbl.get();
        const sprMat = txtMat(fretDisplay, '#ffffff', false, 'ghostFret');
        const baseGhostMat = _meshMatForGhostFretDigit(sprMat);
        let instMat = lb.userData.h3dGhostFretLblInstMat;
        if (!instMat || instMat.map !== baseGhostMat.map) {
            if (instMat) {
                try { instMat.dispose(); } catch (_) { /* idempotent */ }
            }
            instMat = baseGhostMat.clone();
            instMat.transparent = true;
            instMat.needsUpdate = true;
            lb.userData.h3dGhostFretLblInstMat = instMat;
        }
        instMat.opacity = alpha;
        instMat.depthTest = false;
        lb.material = instMat;
        lb.renderOrder = 1000;
        const ghostOuterL = Math.max(NW * 1.1, NH * 1.1);
        const ghostLblS = 0.7 * ghostOuterL * getTextSizeMul() * fretLabelScaleForFret(fretForScale); // beyond-subst: _textSizeMul → getTextSizeMul()
        const ghostLblScaled = ghostLblS * growScale;
        lb.scale.set(ghostLblScaled, ghostLblScaled, 1);
        // Z=0 matches the projection frame plane exactly — avoids parallax
        // horizontal drift that appears when the camera is offset from the
        // fret centre (camera sits at curX+20*K and looks toward curX, so
        // any positive-Z offset on this label projects leftward vs the frame).
        lb.position.set(x, y, 0);
        lb.rotation.set(0, 0, projRim);
    }

    // skipLabel: don't draw per-note connector label (repeated fret)
    // skipBody:  don't draw the 3D note mesh (repeat chord — still shows projection)
    // showDropLine: draw a white vertical drop line from note to below board (arpeggio / synth chord notes)
    function drawNote(n, now, openX, skipLabel, skipBody, linger = 0.10, openChordBoxWidth, fromChord = false, chordId, susTrailMatchArpFrame = false, arpBounds = null, prevOnsetT = -Infinity, showDropLine = false) {
        // ── Getter aliases (DI rebindings for read-only vars) ──────────────
        const _leftyCached          = getLeftyCached();
        const _invertedCached       = getInvertedCached();
        const nStr                  = getNStr();
        const curX                  = getCurX();
        const _drawNextByString     = getDrawNextByString();
        const _drawRecentByString   = getDrawRecentByString();
        const _drawAnchors          = getDrawAnchors();
        const _drawChordTemplates   = getDrawChordTemplates();
        const _drawTeachingMarks    = getDrawTeachingMarks();
        const _showFingerHints      = getShowFingerHints();
        const _textSizeMul          = getTextSizeMul();
        const _ndGetNoteState       = getNdGetNoteState();
        const _ndHasProvider        = getNdHasProvider();
        const _ndHitMarks           = getNdHitMarks();
        const _ndMissMarks          = getNdMissMarks();
        const _ndLabels             = getNdLabels();
        const cam                   = getCam();
        const _probe                = getProbe();
        const _accentShellsByString = getAccentShellsByString();
        const activePalette         = getActivePalette();
        const gNote                 = getGNote();
        const gNoteGrad             = getGNoteGrad();
        const projMeshArr           = getProjMeshArr();
        const projectionVisible     = getProjectionVisible();
        const glowMul               = getGlowMul();
        const showFretOnNote        = getShowFretOnNote();
        const fretNumberGhostScope  = getFretNumberGhostScope();
        const slideArrowNeckVisible         = getSlideArrowNeckVisible();
        const slideArrowApproachVisible     = getSlideArrowApproachVisible();
        const slideArrowChainPreviewVisible = getSlideArrowChainPreviewVisible();
        const _vibrancyProjOp       = getVibrancyProjOp();
        const _hitFx                = getHitFx();
        const _sparks               = getSparks();
        const _streakFx             = getStreakFx();
        const _streakHeat           = getStreakHeat();
        const _verdictMarks         = getVerdictMarks();
        const _fretLabelAllowed     = getFretLabelAllowed();
        // Pool aliases
        const pNote         = getPNote();
        const pNoteEdge     = getPNoteEdge();
        const pSus          = getPSus();
        const pSusOutline   = getPSusOutline();
        const pSusRibbon    = getPSusRibbon();
        const pSusRibbonOl  = getPSusRibbonOl();
        const pTapChevron   = getPTapChevron();
        const pAccentHalo   = getPAccentHalo();
        const pConnectorLine = getPConnectorLine();
        const pDropLine     = getPDropLine();
        const pNoteFretLabel = getPNoteFretLabel();
        const pTeachMarkLbl = getPTeachMarkLbl();
        const pTechPlane    = getPTechPlane();
        // Material aliases
        const mStr              = getMStr();
        const mGlow             = getMGlow();
        const mSus              = getMSus();
        const mSusOutline       = getMSusOutline();
        const mHitBright        = getMHitBright();
        const mHitBrightArrays  = getMHitBrightArrays();
        const mMissOutline      = getMmissOutline();
        const mMissEdgeArrays   = getMmissEdgeArrays();
        const mRimFlash         = getMRimFlash();
        const mAccentHaloNear   = getMAccentHaloNear();
        const mAccentOutline    = getMAccentOutline();
        const mAccentCore       = getMAccentCore();
        const mStrHitOutline    = getMStrHitOutline();
        const mHitSusOutline    = getMHitSusOutline();
        const mWhiteOutline     = getMWhiteOutline();

        const s = n.s;
        // Belt + suspenders: callers already gate via validString(),
        // but drawNote is also entered through { ...cn } chord-note
        // spreads, so re-check here before indexing material arrays.
        if (!validString(s)) return;
        const nxFrame = _drawNextByString && _drawNextByString[s];
        const dt = n.t - now;
        const ghostHold = fromChord ? linger : GHOST_HOLD_AFTER_ONSET;
        const nextTAligned = nxFrame != null && Math.abs(nxFrame.t - n.t) < NEXT_ON_STRING_T_EPS;
        const ghostPastHold = dt <= 0 && dt > -ghostHold
            && (nxFrame == null || nxFrame.t > n.t - 1e-6);
        const isNextOnString = nextTAligned || ghostPastHold;
        const y = sY(s);
        const susEnd = n.t + (n.sus || 0);
        const hasSus = n.sus > 0;
        // Nearest event time across ALL strings strictly after this note —
        // sourced from the sorted union of next/recent event times built
        // once per frame in update() (see _scrEventTimes). _drawRecentByString
        // is folded in so that once an event passes `now` (and leaves
        // _drawNextByString) the deadline still holds: without this the
        // next future event would reset _nextAnyT and old gems would
        // linger after the new chord/note is already playing.
        const _nextAnyT = _firstEventTimeGreaterThan(n.t + 1e-6);
        // Deadline: absolute time after which the gem is culled.
        //   Sustain long (sus >= linger): die immediately at susEnd — no tail.
        //   Sustain short (sus < linger):  tail = linger - sus after susEnd,
        //     capped by gap to next note (any string) so the gem disappears
        //     when the next note arrives if it comes before the tail runs out.
        //   No sustain: linger from onset, same gap-cap rule.
        let _lingerDeadline;
        if (hasSus) {
            const extraLinger = Math.max(0, linger - (n.sus || 0));
            // _nextAnyT cap only applies to the post-sustain linger tail.
            // For long sustains (extraLinger = 0) the deadline is exactly
            // susEnd — notes on other strings must not cut the held sustain
            // short, which would hide the gem and trail mid-play.
            _lingerDeadline = extraLinger > 0
                ? Math.min(susEnd + extraLinger, _nextAnyT)
                : susEnd;
        } else {
            const _gap = _nextAnyT - n.t;
            _lingerDeadline = n.t + (_gap < linger ? _gap : linger);
        }
        const _overLinger = now > _lingerDeadline;
        // For arp-persisted notes past their time: bypass the early exit so
        // the board projection (fretboard ghost + fret labels) keeps rendering
        // until arpBounds.end. The gem/sustain blocks are gated by arpGhostOnlyMode.
        const arpGhostShouldRun = arpBounds != null
            && (arpBounds.start - now) < 0.6   // same as PROJ_WIN
            && now <= arpBounds.end + 0.05;
        const arpGhostOnlyMode = arpGhostShouldRun
            && _overLinger && (!hasSus || now > susEnd);
        // Smart cull: keep the gem alive only if a note-state verdict is
        // available to display. Probe result cached in _ndProbed/_ndProbedState
        // so the later getNoteState query reuses it (avoids two provider calls).
        // arpGhostShouldRun takes precedence — arp ghosts stay alive
        // regardless of verdict state so their board projections persist.
        let _ndProbed = false;
        let _ndProbedState = null;
        if (_overLinger && (!hasSus || now > susEnd) && !arpGhostShouldRun) {
            // Prune the sustain-verdict latch before any cull-path return.
            // The matching delete inside the sustain-render block (line ~9262)
            // only runs when the note isn't culled — without this prune, a
            // sustained note that crosses susEnd on the same frame as
            // _overLinger goes true would leak its latch entry until a
            // teardown/seek clears the Map. !hasSus notes never wrote to
            // the latch, so Map.delete is a harmless no-op there.
            if (hasSus) _susVerdictLatch.delete(Math.round(n.t * 1e4) * 10 + n.s);
            if (!_ndHasProvider || dt < -NOTEDETECT_GEM_VERDICT_WINDOW) return;
            let _ndProbe = null;
            try { _ndProbe = _ndGetNoteState(n, n.t); } catch (e) { _ndProbe = null; }
            _ndProbed = true;
            _ndProbedState = _ndProbe;
            const _probeSt = (_ndProbe && typeof _ndProbe === 'object') ? _ndProbe.state : _ndProbe;
            if (_probeSt !== 'hit' && _probeSt !== 'active' && _probeSt !== 'miss') return;
        }

        const sustained = dt < 0 && hasSus && now <= susEnd;
        const hitDist = Math.abs(dt);
        const hit = hitDist < 0.15 || sustained || (_ndHasProvider && dt < 0);
        const hitFade = sustained ? 0.7 : (hitDist < 0.15 ? 1 - hitDist / 0.15 : 0);
        // skipBody (slide-target gem suppression) only applies to this
        // note's own pre-hit approach — it exists so the destination's
        // approaching gem doesn't duplicate the source note's gem, which
        // is already sliding toward this fret. Once this note is hit,
        // its gem must render normally so a chained slide (this note
        // sliding on to a further fret) keeps following.
        const effSkipBody = skipBody && dt > 0;
        const hasTechniqueVibrato = noteHasVibrato(n);
        const techniqueYNow = sustained ? techniqueYOffsetWorld(n, now) : 0;
        const noteZ = sustained ? 0 : Math.min(0, dZ(dt));
        // Per-note Z-based renderOrder: far notes get a low value (render
        // first, get overdrawn by close geometry), close notes get a high
        // value (render last, appear on top). RENDER_ORDER_LAYER_STACK decides
        // the local stack for outline, core, technique symbols, and fret labels.
        const xBase = n.f === 0 ? (openX !== undefined ? openX : curX) : xFretMid(n.f);
        // Slide-in-progress: glide the gem (and everything anchored to it —
        // outline, core, halo, technique markers) from its starting fret
        // toward the slide's end fret over the sustain, the same way
        // techniqueYOffsetWorld already offsets the gem in Y for bends.
        const slideSt = slideTrailEnd(n);
        // Once hit, keep gliding (and then holding at the end fret) for
        // as long as the gem stays on screen — not just while `sustained`
        // (now <= susEnd). Otherwise, during the brief extra moment a
        // short note lingers after its sustain ends (see _lingerDeadline/
        // extraLinger above), `sustained` flips false and the gem would
        // snap back to its starting fret. slideOffsetWorldX's `p` clamps
        // to 1 once now > susEnd, so this naturally holds at the slide's
        // end position during that tail.
        const slideXNow = (dt < 0 && hasSus && slideSt)
            ? (_leftyCached ? -1 : 1) * slideOffsetWorldX(n, now, slideSt)
            : 0;
        const x = xBase + slideXNow;
        const isHarm = n.hm || n.hp;

        // Open chord notes: wide default mesh is capped to chord frame width.
        const OPEN_NOTE_WORLD_W = 40 * K;
        let openWScale = 1;
        if (n.f === 0 && openChordBoxWidth != null && openChordBoxWidth > 1e-8) {
            openWScale = Math.max(0.22, (openChordBoxWidth * 0.96) / OPEN_NOTE_WORLD_W);
        }

        // Hoisted so both !skipBody blocks (gem and technique labels) and
        // the unconditional sustain trail all share one declaration.
        // For skipBody=true (slide targets), defaults are safe no-ops.
        const openSlabThickMul = n.f === 0 ? 1.5 : 1;
        const approachRot = n.f > 0 ? Math.max(0, Math.min(1, dt / AHEAD)) * Math.PI / 2 : 0;
        // Ghost preview window: capped to the gap from the previous note
        // on this string so dense passages don't show the preview 0.6 s
        // ahead with no visible gem. Minimum 0.05 s so the ghost isn't
        // completely suppressed even in very tight passages.
        const _rawGap = n.t - prevOnsetT;
        const effectiveProjWin = _rawGap > 0 ? Math.min(0.6, Math.max(0.05, _rawGap)) : 0.6;
        const projFactorG = Math.max(0, Math.min(1, 1 - Math.max(dt, 0) / effectiveProjWin));
        const inGhostWin = n.f > 0 && isNextOnString && dt > -ghostHold && dt < effectiveProjWin && projFactorG > 0.001;
        // feedBack#254 — query the provider once per note, before both !skipBody
        // blocks, so _showHit can be a const and _ndGood is available for the
        // sustain trail (which renders even when skipBody=true for slide targets).
        let _ndGood = false;    // true when provider confirms hit/active
        let _hitPunch = 1;      // #3 per-gem scale-punch on a fresh hit
        let _ndState = null;    // 'hit'|'active'|'miss'|null; null → fall back to proximity heuristic
        let _ndCs = null;       // raw provider response — truthy when provider returned a verdict
        let _ndCsIsObj = false; // typeof _ndCs === 'object'
        let _ndFaceMat = null;  // [mat×4, transparent×2] array for lateral face fill, or null
        if (_ndGetNoteState) {
            // Reuse the smart-cull probe result if we already called
            // _ndGetNoteState for this gem above; otherwise probe now.
            let _raw = null;
            if (_ndProbed) {
                _raw = _ndProbedState;
            } else {
                try { _raw = _ndGetNoteState(n, n.t); } catch (e) { _raw = null; }
            }
            if (_raw) {
                _ndCsIsObj = typeof _raw === 'object';
                const _st = _ndCsIsObj ? _raw.state : _raw;
                if (_st === 'miss') {
                    _ndState = 'miss';
                    _ndCs = _raw;
                } else if (_st === 'hit' || _st === 'active') {
                    _ndState = _st;
                    _ndGood = true;
                    _ndCs = _raw;
                }
            }
        }

        // [verdict glow] feed the provider alpha into the per-frame max so
        // update()'s top scales the verdict-glow brightness by live level
        // (note_detect returns alpha = live input level for held sustains,
        // and a time-fade for fresh strikes). Only object responses carry an
        // alpha; the latch/legacy string responses leave brightness at full.
        if (_ndGood && _ndCsIsObj && _ndCs && typeof _ndCs.alpha === 'number') {
            setNdVerdictSawAlpha(true); // beyond-subst: _ndVerdictSawAlpha = true
            if (_ndCs.alpha > getNdVerdictMaxAlpha()) setNdVerdictMaxAlpha(_ndCs.alpha); // beyond-subst
        }

        // ── Sustain verdict latch ────────────────────────────────────
        // note_detect's hitGlowDuration (~0.5 s) and the legacy mark
        // TTL (500 ms) both expire before a long chart sustain ends.
        // For any sustained note, latch the verdict from EITHER source
        // (provider _ndState OR legacy _ndHitMarks / _ndMissMarks) and
        // re-inject it so hit/miss color persists for the full hold.
        // Works with both the modern provider path and the legacy event
        // path — vibrato and other long-sustain notes benefit equally.
        if (hasSus) {
            const _sk = Math.round(n.t * 1e4) * 10 + n.s;
            // Resolve current verdict: provider takes priority, then
            // fall back to scanning the legacy mark arrays so a hit or
            // miss event that arrived this frame can seed the latch.
            let _lv_cur = _ndState;
            let _lv_good = _ndGood;
            if (!_lv_cur) {
                for (let _mi = 0; _mi < _ndHitMarks.length; _mi++) {
                    const _mm = _ndHitMarks[_mi];
                    if (_mm.s === n.s && _mm.f === n.f && Math.abs(_mm.noteTime - n.t) < _ND_TIME_EPS) {
                        _lv_cur = 'hit'; _lv_good = true; break;
                    }
                }
                if (!_lv_cur) {
                    for (let _mi = 0; _mi < _ndMissMarks.length; _mi++) {
                        const _mm = _ndMissMarks[_mi];
                        if (_mm.s === n.s && _mm.f === n.f && Math.abs(_mm.noteTime - n.t) < _ND_TIME_EPS) {
                            _lv_cur = 'miss'; _lv_good = false; break;
                        }
                    }
                }
            }
            if (_lv_cur) {
                // Fresh verdict (provider or legacy mark) — save to latch.
                // Distinguish a *live* provider hit (note_detect tags its
                // ring-tracking 'active' responses with live:true) from a
                // legacy/brief one: a live hit must NOT be re-injected once
                // the provider goes silent (that kept muted sustains lit),
                // whereas the legacy event path still needs the latch to
                // bridge its ~0.5 s mark TTL across a long hold.
                const _live = _ndCsIsObj && _ndCs && _ndCs.live === true;
                _susVerdictLatch.set(_sk, _lv_good ? (_live ? 'hit-live' : 'hit') : 'miss');
                // If the verdict came from a legacy mark (provider was
                // silent — _ndState was null before the scan), propagate
                // it to _ndState/_ndGood/_ndCs now so the sustain trail
                // picks up the same colour this frame instead of waiting
                // until the mark expires and the latch re-injects it.
                if (!_ndState) {
                    if (_lv_good) {
                        _ndState = 'active'; _ndGood = true;
                        _ndCs = 'active'; _ndCsIsObj = false;
                    } else {
                        _ndState = 'miss';
                        _ndCs = 'miss'; _ndCsIsObj = false;
                    }
                }
            } else if (dt < 0 && now < susEnd) {
                // No current verdict — reuse latch if available.
                // dt < 0 guards against coloring notes that haven't
                // crossed the hit line yet (approaching notes must never
                // inherit a latch from a previous play-through).
                const _lv = _susVerdictLatch.get(_sk);
                if (_lv === 'hit') {
                    // Legacy/brief provider or event-path hit: bridge the
                    // gap across the hold (the mark/glow TTL expires before a
                    // long chart sustain ends).
                    _ndState = 'active'; _ndGood = true;
                    _ndCs = 'active'; _ndCsIsObj = false;
                } else if (_lv === 'hit-live') {
                    // Live provider is authoritative for the active glow: it
                    // returns 'active' only while the string is actually
                    // ringing, and null once muted / decayed. Don't re-inject
                    // a stale 'active' (that kept a muted sustain lit) — leave
                    // the gem un-lit when the provider is silent; a re-strike
                    // relights it via the provider on the next frame.
                } else if (_lv === 'miss') {
                    _ndState = 'miss';
                    _ndCs = 'miss'; _ndCsIsObj = false;
                }
            }
            if (now >= susEnd) _susVerdictLatch.delete(_sk);
        }

        const _showHit = (_ndState === 'miss') ? false
            : (_ndState ? _ndGood
            : (hit || (n.f > 0 && inGhostWin)));

        // ── Fret-wire hit flash ───────────────────────────────────────
        // A confirmed note lights the wires that bracket it:
        //   single, fretted (f > 0) → the wire behind it (f-1) and the wire
        //           it's pressed against (f).
        //   open (f = 0)  → the OUTER wires of the anchor lane. An open
        //           string has no fret of its own, and its gem is drawn as a
        //           wide slab spanning the lane (see xBase /
        //           openNoteLaneBoxW), so the lane's edge wires are exactly
        //           what the slab sits between — the same relationship a
        //           fretted note has to its own two wires.
        //   chord   → only the OUTERMOST wires of the whole shape, not every
        //           wire it spans. drawNote() is the chord loop's per-note
        //           call, so it can't see the span from here: chord hits
        //           accumulate into _fwChordAcc and the flash pass resolves
        //           min/max fret → outer wires once the loop has finished.
        // Gated on _ndGood, not _showHit: only a scorer's verdict counts,
        // never the proximity heuristic that merely means "near the line".
        if (_ndGood) {
            const _fwA = (_ndCsIsObj && _ndCs && typeof _ndCs.alpha === 'number')
                ? Math.max(0, Math.min(1, _ndCs.alpha))
                : 1;
            if (fromChord) {
                // ch.id can be absent (pitfall #8) — fall back to the chord's
                // time, which is what n.t already carries for a chord note.
                const _fwK = (chordId !== undefined && chordId !== null) ? chordId : `t${n.t}`;
                let _fwE = _fwChordAcc.get(_fwK);
                if (!_fwE) {
                    _fwE = { minF: Infinity, maxF: -Infinity, a: 0, openA: 0, t: n.t };
                    _fwChordAcc.set(_fwK, _fwE);
                }
                if (n.f > 0 && n.f <= NFRETS) {
                    if (_fwA > _fwE.a) _fwE.a = _fwA;
                    if (n.f < _fwE.minF) _fwE.minF = n.f;
                    if (n.f > _fwE.maxF) _fwE.maxF = n.f;
                } else if (n.f === 0 && _fwA > _fwE.openA) {
                    _fwE.openA = _fwA;   // open strings in the chord → lane edges
                }
            } else if (n.f > 0 && n.f <= NFRETS) {
                if (_fwA > _fwHitIn[n.f - 1]) _fwHitIn[n.f - 1] = _fwA;
                if (_fwA > _fwHitIn[n.f]) _fwHitIn[n.f] = _fwA;
            } else if (n.f === 0) {
                // Sampled at the note's own time, matching how the open
                // slab's width is derived (openNoteLaneBoxW(n.t)) — so the
                // flashed wires are the ones the slab is actually drawn
                // between, even if the lane has since moved.
                const _fwB = anchorLaneBoundsAt(_drawAnchors, n.t);
                if (_fwB) {
                    if (_fwA > _fwHitIn[_fwB.dMin]) _fwHitIn[_fwB.dMin] = _fwA;
                    if (_fwA > _fwHitIn[_fwB.dMax]) _fwHitIn[_fwB.dMax] = _fwA;
                }
            }
        }

        if (!effSkipBody && !arpGhostOnlyMode && !_overLinger) {

            // ── Outline (slightly larger, bright emissive) ────────────
            // Notedetect feedback (#9): if a recent hit/miss event
            // matches this note's (s, f, t), swap the outline tint.
            // Linear scan over a small bounded array — typical
            // queues are 0-5 entries, expired marks pruned by the
            // listener. Hit takes precedence over miss so the user
            // sees the more positive feedback if both happen
            // (shouldn't, but cheap guard).
            let _ndOutline = (n.f > 0 && mStrHitOutline[s]) ? mStrHitOutline[s] : mWhiteOutline;
            // update() prunes expired marks once per frame and
            // caches performance.now() in _ndFrameNowMs so the hot
            // path here just does the bounded match — no extra
            // now() / filter() per note. After update()'s prune,
            // every entry in the arrays has expiresAt > _ndFrameNowMs,
            // so we don't re-validate inside the loop.
            let _ndMatchedMark = null;
            let _ndHadHitMark = false;
            if (_ndHitMarks.length) {
                for (let i = 0; i < _ndHitMarks.length; i++) {
                    const m = _ndHitMarks[i];
                    if (m.s === n.s && m.f === n.f && Math.abs(m.noteTime - n.t) < _ND_TIME_EPS) {
                        _ndOutline = mHitBright[s] ?? mGlow[s]; _ndFaceMat = mHitBrightArrays[s] ?? null; _ndMatchedMark = m; _ndHadHitMark = true; break;
                    }
                }
            }
            if (!_ndHadHitMark && _ndMissMarks.length) {
                for (let i = 0; i < _ndMissMarks.length; i++) {
                    const m = _ndMissMarks[i];
                    if (m.s === n.s && m.f === n.f && Math.abs(m.noteTime - n.t) < _ND_TIME_EPS) {
                        _ndOutline = mMissOutline; _ndFaceMat = mMissEdgeArrays; _ndMatchedMark = m; break;
                    }
                }
            }
            if (_ndMatchedMark && _ndMatchedMark.labels && _ndMatchedMark.labels.length) {
                _ndLabels.push({
                    x,
                    y: y + NH * 1.7,
                    z: noteZ + 0.02,
                    labels: _ndMatchedMark.labels,
                });
            }
            // (approachRot / PROJ_WIN_G / projFactorG / inGhostWin hoisted above)

            const rimXY = n.ac ? ACCENT_RIM_XY_SCALE_MUL : 1;
            const rimZ = n.ac ? ACCENT_RIM_Z_SCALE_MUL : 1;

            // feedBack#254 — apply outline + lateral face-fill overrides from provider verdict.
            // hit/active → green outline (mHitBright[s]) + green lateral faces;
            // miss → magenta-red outline (mMissOutline) + dark lateral faces; front/back stay transparent.
            if (_ndCs) {
                const _vAlpha = (_ndCsIsObj && typeof _ndCs.alpha === 'number') ? _ndCs.alpha : 1;
                if (_ndState === 'miss') {
                    _ndOutline = mMissOutline;
                    _ndFaceMat = mMissEdgeArrays;
                    setStreakHits(0);            // #7 break the streak (heat eases down) — beyond-subst
                    if (_verdictMarks) _ndLabels.push({ x, y: y + NH * 1.7, z: noteZ + 0.02, labels: [{ text: '✗', color: '#ff5a7a' }] });  // #6
                } else if (_ndGood) {
                    // Rim flashes in the string's own colour, wire-fashion
                    // (intensity applied per string in the flash pass).
                    _ndOutline = mRimFlash[s] ?? mHitBright[s] ?? mGlow[s];
                    _ndFaceMat = mHitBrightArrays[s] ?? null;
                    // Clamp like the wire path does — a provider returning
                    // alpha > 1 must not over-drive emissiveIntensity.
                    const _rimA = Math.max(0, Math.min(1, _vAlpha));
                    if (_rimA > _rimFlashIn[s]) _rimFlashIn[s] = _rimA;
                    _hitPunch = 1 + 0.22 * _hitFx * _vAlpha;   // #3 scale-punch (biggest at strike, eases)
                    if (_verdictMarks) { const _tc = _timingHex(_ndMatchedMark && _ndMatchedMark.timingState); _ndLabels.push({ x, y: y + NH * 1.7, z: noteZ + 0.02, labels: [{ text: '✓', color: '#' + _tc.toString(16).padStart(6, '0') }] }); }  // #6 + #5
                    if (_sparks && _hitFx > 0 && _vAlpha > 0.5) {
                        const _spk = s + '|' + n.f + '|' + n.t.toFixed(2);
                        if (!(_sparkSeen.get(_spk) > now)) {
                            _sparkSeen.set(_spk, now + 1.0);
                            if (_sparkSeen.size > 600) _sparkSeen.clear();
                            setStreakHits(getStreakHits() + 1); // beyond-subst: _streakHits++
                            const _heatMul = _streakFx ? (1 + 0.85 * _streakHeat) : 1;   // #7 escalate
                            _sparkBurst(x, y, noteZ, _timingHex(_ndMatchedMark && _ndMatchedMark.timingState), Math.round((4 + 7 * _hitFx) * _heatMul));
                        }
                    }
                }
            }

            // Score pop: the first frame a gem's verdict carries points
            // (notedetect ≥1.13 object verdicts), float a "+N" above it.
            // popKey dedupes — chord members all hand back the chord-
            // level key, so a chord pops once, not once per gem; the
            // _fxSeen TTL also stops a sustain's long-lived verdict from
            // re-popping every frame.
            if (_ndGood && _ndCsIsObj
                    && _ndCs.points !== undefined && _ndCs.popKey != null) {
                _fxSpawnPop(_ndCs.popKey, _ndCs.points, _ndCs.mult,
                    x, y + NH * 2.2, noteZ + 0.02);
            }

            // Accent: soft neon outer glow (reference: diffused halo fading out).
            // Three additive shells drawn behind outline/core; colour = string hue.
            // Suppressed on a provider miss verdict — a bright accent halo
            // around a missed gem muddies the dark-core-plus-red-rim fail
            // signal, matching the same miss-over-accent priority the
            // gem core material applies below.
            if (n.ac && _ndState !== 'miss' && mAccentHaloNear[s]) {
                const rZ = approachRot;
                const accentShells = _accentShellsByString[s];
                for (let hi = 0; hi < accentShells.length; hi++) {
                    const sh = accentShells[hi];
                    const glow = pAccentHalo.get();
                    glow.material = sh.mat;
                    glow.rotation.z = rZ;
                    glow.position.set(x, y + techniqueYNow, noteZ - sh.zK * K);
                    if (n.f === 0) {
                        // Inside a chord/arpeggio frame: bloom only vertically so the
                        // halo doesn't burst past the chord box edges horizontally.
                        // Outside a frame: modest horizontal cap (1.4×) so it doesn't
                        // overflow into adjacent lane visuals.
                        const openIxy = fromChord ? 1.0 : Math.min(sh.ixy, 1.4);
                        const slabPuff = Math.max(1.4, sh.ixy);
                        glow.scale.set(
                            (40 * K / NW) * rimXY * openIxy * openWScale,
                            0.1 * openSlabThickMul * slabPuff,
                            0.6 * rimZ * sh.iz,
                        );
                    } else {
                        glow.scale.set(rimXY * sh.ixy, rimXY * sh.ixy, 2.5 * rimZ * sh.iz);
                    }
                }
            }
            const outline = pNote.get();
            // Verdict beats accent on the outline so hit/miss feedback isn't
            // hidden by mAccentOutline. Mirrors the same miss-over-accent
            // priority the accent halo guard above already applies.
            const _ndVerdict = (_ndCs && (_ndState === 'miss' || _ndGood))
                || !!_ndMatchedMark;
            outline.material = (n.ac && !_ndVerdict) ? mAccentOutline[s] : _ndOutline;
            // outline + core share the pNote pool, so set geometry explicitly
            // each frame (a recycled mesh may carry a gradient geometry from a
            // prior core use). Outline always uses the plain box.
            outline.geometry = gNote;
            outline.renderOrder = renderOrderForLayerAtZ(noteZ, 'NOTE_OUTLINE');
            outline.position.set(x, y + techniqueYNow, noteZ);
            outline.rotation.z = approachRot;
            const ndRim = 1.1;
            if (n.f === 0) {
                outline.scale.set(
                    (35 * K / NW) * ndRim * rimXY * openWScale,
                    0.1 * ndRim * openSlabThickMul,
                    0.6 * ndRim * rimZ,
                );
            } else {
                outline.scale.set(ndRim * rimXY, ndRim * rimXY, 2.8 * rimZ);
            }

            // ── Lateral face fill (top / bottom / left / right only) ─────
            // Material array: groups 0-3 (±X ±Y) get the verdict colour;
            // groups 4-5 (+Z front / -Z back) are transparent so the large
            // front face shows only the core body's string colour beneath.
            if (_ndFaceMat) {
                const edges = pNoteEdge.get();
                edges.material = _ndFaceMat;
                edges.renderOrder = renderOrderForLayerAtZ(noteZ, 'TECHNIQUE_MARKER');
                edges.position.set(x, y + techniqueYNow, noteZ + 0.001);
                edges.rotation.z = approachRot;
                if (n.f === 0) {
                    edges.scale.set(
                        (40 * K / NW) * rimXY * openWScale * 1.02,
                        0.1 * openSlabThickMul * 1.02,
                        0.6 * rimZ * 1.02,
                    );
                } else {
                    edges.scale.set(rimXY * 1.02, rimXY * 1.02, 2.5 * rimZ * 1.02);
                }
            }

            // ── Core (filled note body) ───────────────────────────────
            const core = pNote.get();
            // Body always keeps the string colour. Verdict feedback is
            // carried by the outline shell and lateral face fill.
            core.material = n.ac ? mAccentCore[s] : mStr[s];
            // Gradient gem body for strings 0..5; flat box otherwise.
            core.geometry = (!n.ac && gNoteGrad[s]) ? gNoteGrad[s] : gNote;
            core.renderOrder = renderOrderForLayerAtZ(noteZ, 'NOTE_CORE');
            core.position.set(x, y + techniqueYNow, noteZ + 0.001);
            core.rotation.z = approachRot;
            if (n.f === 0) {
                core.scale.set(
                    (40 * K / NW) * rimXY * openWScale,
                    0.1 * openSlabThickMul,
                    0.6 * rimZ,
                );
            } else {
                core.scale.set(rimXY, rimXY, 2.5 * rimZ);
            }
            if (_hitPunch !== 1) core.scale.multiplyScalar(_hitPunch);   // #3 hit scale-punch
            // Fret digits on fretted (n.f > 0) flying notes deliberately
            // omitted: the showFretOnNote setting and its UI helper text
            // promise digits on the fretboard ghost only, never on the
            // gems coming down the highway. The ghost path is at
            // pGhostFretLbl below.
        } // end gem block — technique labels reopen !skipBody below

        // ── Sustain trail ─────────────────────────────────────────────
        // Rendered for ALL notes with sustain, including skipBody=true
        // slide-target notes (e.g. linkNext hold→slide: gem suppressed,
        // slide trail stays visible as the continuation of the sustain).
        // _ndGetNoteState is queried for every note (skipBody slide
        // targets included), so the trail picks bright mGlow[s] when the
        // provider confirms hit/active and dim mSus[s] otherwise — a
        // slide-target trail is not forced dim.
        // Chord-member open strings (fromChord && f === 0) skip the
        // sustain trail entirely — fretted constituents already carry
        // the chord's sustains; an extra ribbon under the wide open
        // body looked like clutter. The note BODY still draws above.
        if (hasSus && !_overLinger && !(fromChord && n.f === 0)) {
                const susStart = Math.max(n.t, now);
                const remSus = susEnd - susStart;
                if (remSus > 0.01) {
                    const sliceDur = Math.min(remSus, AHEAD);
                    let tw = NW * 0.85 * (n.f === 0 ? openWScale : 1);
                    let th = NH * 0.12 * (n.f === 0 ? openWScale : 1) * openSlabThickMul;
                    if (susTrailMatchArpFrame) {
                        const yA = sY(0), yB = sY(nStr - 1);
                        const yMinF = Math.min(yA, yB) - S_GAP * 0.8;
                        const yMaxF = Math.max(yA, yB) + S_GAP * 0.8;
                        const fullChordBoxH = yMaxF - yMinF;
                        const ft = Math.max(CHORD_FRAME_RIM_MIN * K, fullChordBoxH * CHORD_FRAME_RIM_FRAC_H);
                        const ftSide = ft * 1.55;
                        if (n.f > 0) {
                            th = ftSide;
                        } else {
                            th = Math.max(th, ftSide * openSlabThickMul);
                        }
                        tw = Math.max(tw, ftSide * 1.05);
                    }
                    // Standalone open strings get two parallel trails
                    // offset along X — visually echoes the wide flat
                    // open-note body. Fretted notes keep the
                    // single-trail path. Offsets are scaled by
                    // `openWScale` (the same body-width scale
                    // computed at line 7367) so the trails stay
                    // underneath the body's edges no matter how wide
                    // the anchor lane is. Chord-member open strings
                    // can't reach here (guarded at the `hasSus`
                    // check above).
                    //
                    // openTrailOff is always > 0 because openWScale
                    // is clamped >= 0.22 at line 7368 (or defaults
                    // to 1 when there's no openChordBoxWidth), so
                    // openTrailOff >= NW * 3 * 0.22 = 3.3 * K.
                    // No degenerate-small-offset fallback needed.
                    const offsets = (n.f === 0)
                        ? [-(NW * 3 * openWScale), NW * 3 * openWScale]
                        : SINGLE_SUS_OFFSETS;
                    const ribbonSusTrail = !!(
                        (slideSt && n.f > 0 && (n.sus || 0) > 1e-4)
                        || (Number(n.bn) > 0)
                        || (Array.isArray(n.bnv) && n.bnv.length > 0)
                        || n.tr
                        || hasTechniqueVibrato
                    );
                    // Outline material for the sustain trail border — uses the
                    // same materials as the gem border so hit/miss colours are
                    // perceptually identical across gem outline, lateral faces,
                    // and sustain trail rim.
                    const _susOlMat = _ndState === 'miss' ? mMissOutline
                        : _ndGood ? (mHitBright[s] ?? mHitSusOutline)
                        : mSusOutline;
                    const emitSusStrip = (xCenter, segLen, zCenter) => {
                        // Same depth-bucket scheme as chord frames, using the
                        // ordered sustain-trail layer so same-depth frames win
                        // while closer trail segments still beat farther frames.
                        const trailRenderOrder = renderOrderForLayerAtZ(Math.min(0, zCenter), 'SUSTAIN_TRAIL');
                        for (let i = 0; i < offsets.length; i++) {
                            const xOff = xCenter + offsets[i];
                            const trOut = pSusOutline.get();
                            trOut.material = _susOlMat;
                            trOut.renderOrder = trailRenderOrder;
                            trOut.position.set(xOff, y, zCenter);
                            trOut.scale.set(tw + 0.4 * K, th + 0.4 * K, segLen);
                            const tr = pSus.get();
                            tr.material = _ndState ? mGlow[s] : mSus[s];
                            tr.renderOrder = trailRenderOrder + 0.0005;
                            tr.position.set(xOff, y, zCenter);
                            tr.scale.set(tw, th, segLen);
                        }
                    };
                    if (!ribbonSusTrail) {
                        const len = sliceDur * TS;
                        const zPos = dZ(susStart - now) - len / 2;
                        emitSusStrip(x, len, zPos);
                    } else {
                        // Same depth-based renderOrder as box trail — ribbon center
                        // at susStart + sliceDur/2, using TS so it matches dZ().
                        const _ribDt = Math.max(0, susStart + sliceDur / 2 - now);
                        const ribbonRenderOrder = renderOrderForLayerAtZ(-_ribDt * TS, 'SUSTAIN_TRAIL');
                        for (let si = 0; si < offsets.length; si++) {
                            const strandX = xBase + offsets[si];
                            const olMesh = pSusRibbonOl.get();
                            olMesh.renderOrder = ribbonRenderOrder;
                            olMesh.scale.set(1, 1, 1);
                            olMesh.rotation.set(0, 0, 0);
                            olMesh.position.set(0, 0, 0);
                            olMesh.material = _susOlMat;
                            slideRibbonUpdatePositions(
                                olMesh.geometry, strandX,
                                tw + 0.4 * K, th + 0.4 * K,
                                y, sliceDur, susStart, now, n, slideSt,
                            );
                            const body = pSusRibbon.get();
                            body.renderOrder = ribbonRenderOrder + 0.0005;
                            body.scale.set(1, 1, 1);
                            body.rotation.set(0, 0, 0);
                            body.position.set(0, 0, 0);
                            body.material = _ndState ? mGlow[s] : mSus[s];
                            slideRibbonUpdatePositions(
                                body.geometry, strandX, tw, th, y,
                                sliceDur, susStart, now, n, slideSt,
                            );
                        }
                    }
                }
        }

        // Shared by both slide-arrow blocks so the neck-preview arrow
        // below can match the on-note arrow's size once the note
        // arrives (the technique-labels block further down also reads
        // this for its own label scaling).
        const LBL_MULT = 1.6;
        // Fade-in window for the neck-preview slide arrow below.
        const GHOST_UPCOMING_WIN = 0.6;

        // ── Slide direction arrow (neck preview) ─────────────────────
        // A standalone preview of the same arrow, sitting flat on
        // the neck (Z=0) at the note's resting fret. Full size from
        // the moment it appears (matches the on-note arrow's size at
        // dt=0) — just a linear fade-in over the same GHOST_UPCOMING_WIN
        // window the board-projection ghost note uses, so the two
        // previews feel like part of the same effect. No grow effect:
        // tried and found too hard to see. Stops at dt <= 0, handing
        // off to the on-note arrow.
        //
        // Placed outside the !effSkipBody block (unlike the on-note
        // arrow above) so a note whose own gem is suppressed because
        // it's the destination of a previous slide (skipBody) can
        // still preview ITS OWN outgoing slide ahead of time — i.e.
        // multi-leg/chained slides — when slideArrowChainPreviewVisible
        // is on. For a normal note (skipBody === false) this behaves
        // exactly as before.
        if (slideArrowNeckVisible && dt > 0 && slideSt && validString(s) && !arpGhostOnlyMode && !_overLinger
            && (!skipBody || slideArrowChainPreviewVisible)) {
            const slideDirN = Math.sign(fretMid(slideSt.endFret) - fretMid(n.f)) * (_leftyCached ? -1 : 1);
            if (slideDirN !== 0) {
                const neckAlpha = Math.max(0, Math.min(1, 1 - dt / GHOST_UPCOMING_WIN));
                if (neckAlpha > 0.001) {
                    const arrowHexN = darkenHex(activePalette[s], 0.55);
                    const arrowSmN = slideArrowMat(slideDirN > 0, arrowHexN);
                    const arrowN = pTechPlane.get();
                    arrowN.material = _spriteMat2MeshMat(arrowN, arrowSmN);
                    const arrowScaleN = NH * 1.1 * LBL_MULT * _textSizeMul;
                    arrowN.scale.set(arrowScaleN, arrowScaleN, 1);
                    arrowN.position.set(x + slideDirN * NW * 1.15, y, 0);
                    arrowN.rotation.z = 0;
                    arrowN.renderOrder = renderOrderForLayerAtZ(0, 'TECHNIQUE_MARKER');
                    arrowN.material.opacity = neckAlpha;
                }
            }
        }

        if (!effSkipBody && !arpGhostOnlyMode && !_overLinger) {
            // ── Technique labels ──────────────────────────────────────
            // Label scale = base × LBL_MULT × distFactor (LBL_MULT
            // declared above, shared with the neck-preview slide arrow).
            // distFactor compensates for perspective shrink so a
            // label far from the camera (note approaching at dt≈AHEAD)
            // doesn't collapse to a single dim pixel. LBL_MULT bumps
            // every base scale uniformly. Issues #21-25 track proper
            // visual upgrades (3D arrows, ribbons, glows); this is
            // the cheap legibility win in the meantime.
            //
            // Offsets scale with sLbl too. The labels grow in world
            // units to compensate for perspective; if the offsets
            // didn't grow, stacked labels would overlap each other
            // and the first label would overlap the note at the
            // AHEAD edge. In screen space the offset stays roughly
            // constant — labels appear anchored to the note even
            // though the world-space distance grows.
            const distFactor = 1 + Math.max(0, Math.min(1, dt / AHEAD)) * 1.5;
            // Fold the user's text-size multiplier into sLbl so technique
            // labels (bend, H/P/T arrows, tremolo) plus on-body markers
            // such as palm mute and the pinch-harmonic icon.
            // all scale alongside the rest (`ac` accent → brighter body via mGlow).
            const sLbl = LBL_MULT * distFactor * _textSizeMul;
            // txtMat(..., 'technique') disables depthTest; without a high
            // renderOrder the transparent note core (mStr) can still paint
            // afterward and hide H/P/T, PM X, bends, etc. Same contract as
            // fret-row labels (issue #35, CLAUDE pitfall #7 corollary).
            const techniqueMarkerRenderOrder = renderOrderForLayerAtZ(noteZ, 'TECHNIQUE_MARKER');
            let yo = y + techniqueYNow + NH * 0.8 * sLbl;
            const specialMarkerScale = n.f === 0
                ? NH * 1.5 * sLbl * openWScale
                : NH * 1.5 * sLbl;
            // ── Slide direction arrow (on the note/gem) ─────────────────
            // A small ›/‹ chevron beside the note pointing toward the
            // slide's destination fret. Visible for the note's whole
            // time on screen — approaching (rides the incoming note at
            // noteZ+K) and sustained (rides the gem as it glides via
            // slideXNow, Edit A) — at a constant full opacity, no
            // fade or grow.
            if (slideArrowApproachVisible && slideSt && validString(s)) {
                const slideDir = Math.sign(fretMid(slideSt.endFret) - fretMid(n.f)) * (_leftyCached ? -1 : 1);
                if (slideDir !== 0) {
                    const arrowHex = darkenHex(activePalette[s], 0.55);
                    const arrowSm = slideArrowMat(slideDir > 0, arrowHex);
                    const arrow = pTechPlane.get();
                    arrow.material = _spriteMat2MeshMat(arrow, arrowSm);
                    const arrowScale = NH * 1.1 * sLbl;
                    arrow.scale.set(arrowScale, arrowScale, 1);
                    arrow.position.set(x + slideDir * NW * 1.15, y + techniqueYNow, noteZ + K);
                    // No rotation, ever — notes themselves rotate in
                    // (approachRot) as they approach, but that would
                    // tilt the ›/‹ chevron and make its left/right
                    // direction ambiguous. Always flat.
                    arrow.rotation.z = 0;
                    arrow.renderOrder = techniqueMarkerRenderOrder;
                    arrow.material.opacity = 1;
                }
            }
            // Derive the peak from bn OR the bnv curve: a note may carry an
            // authoritative curve with bn left at 0 (bn SHOULD be the peak
            // whenever bnv exists — this is the robustness fallback).
            const _bnvPeak = (Array.isArray(n.bnv) && n.bnv.length)
                ? n.bnv.reduce((m, p) => Math.max(m, Number(p.v) || 0), 0) : 0;
            const _bendPeak = Math.max(Number(n.bn) || 0, _bnvPeak);
            if (_bendPeak > 0) {
                // Bend chevron stack — PlaneGeometry mesh so it tilts with
                // the gem (approachRot). Fixed world size so it perspective-
                // shrinks naturally without distFactor compensation.
                const steps = Math.max(1, Math.min(4, Math.round(_bendPeak)));
                const bendSm = bendChevronMat(steps, activePalette[s] || 0xffffff);
                const l = pTechPlane.get();
                l.material = _spriteMat2MeshMat(l, bendSm);
                const cs = NH * 2.4;
                l.scale.set(cs, cs, 1);
                l.position.set(x, y + techniqueYNow + NH * 1.1, noteZ + K);
                l.rotation.z = approachRot;
                l.renderOrder = techniqueMarkerRenderOrder;
                // Reserve stack space above the chevron.
                yo = Math.max(yo, y + techniqueYNow + NH * 2.5);
            }
            if (n.ho || n.po || n.tp) {
                if (n.ho || n.po) {
                    // Hammer-on / pull-off: ▲/▼ triangle — PlaneGeometry mesh
                    // so it tilts with the gem instead of billboarding.
                    const triSm = triMat(!!n.po, activePalette[s] || 0xffffff);
                    const tri = pTechPlane.get();
                    tri.material = _spriteMat2MeshMat(tri, triSm);
                    tri.scale.set(NH * 1.8, NH * 1.60, 1);
                    tri.position.set(x, y + techniqueYNow, noteZ + K);
                    tri.rotation.z = approachRot;
                    tri.renderOrder = techniqueMarkerRenderOrder;
                    // Reserve stack space above the triangle for stacked labels.
                    yo = Math.max(yo, y + techniqueYNow + NH * 1.0);
                } else {
                    const chevron = pTapChevron.get();
                    const chevronScale = NH * 0.8 * sLbl;
                    chevron.position.set(x, y + techniqueYNow, noteZ + 1.1 * K);
                    chevron.rotation.z = approachRot;
                    chevron.scale.set(chevronScale, chevronScale, 1);
                    chevron.renderOrder = techniqueMarkerRenderOrder;
                }
            }
            // Tremolo label ('~~~') removed — trail shape already conveys it visually.
            if (n.pm || n.mt || n.fhm) {
                // Muted notes: pool-based plane with per-note Z-proportional
                // renderOrder (techniqueMarkerRenderOrder). The previous InstancedMesh
                // approach used a fixed renderOrder (702/700), which made PM/FH markers from
                // far notes overdraw chord frames and gems of nearer chords.
                // PM = black X / white border; FH/MT = inverse.
                const _fhm = !!(n.mt || n.fhm);
                const _pmSprite = _fhm ? fretHandMuteXSpriteMat() : palmMuteXSpriteMat();
                const _pmMark = pTechPlane.get();
                _pmMark.material = _spriteMat2MeshMat(_pmMark, _pmSprite);
                _pmMark.material.opacity = _showHit ? 1.0 : 0.8;
                // Arms cover 62.5% of canvas → scale 1/0.625 = 1.60.
                const _sx = n.f === 0 ? NW * 1.60 * openWScale : NW * 1.60;
                _pmMark.scale.set(_sx, NH * 1.60, 1);
                _pmMark.position.set(x, y + techniqueYNow, noteZ + K);
                _pmMark.rotation.z = approachRot;
                _pmMark.renderOrder = techniqueMarkerRenderOrder;
            }
            // hm / hp — PlaneGeometry overlay sized like the palm-mute X,
            // so the symbol only appears on the front face and matches
            // the palm-mute marker proportions.
            if (n.hm || n.hp) {
                const harmSprite = n.hm ? naturalHarmonicMat() : pinchHarmonicMat(activePalette[s]);
                const harmMark = pTechPlane.get();
                harmMark.material = _spriteMat2MeshMat(harmMark, harmSprite);
                harmMark.material.opacity = _showHit ? 1.0 : 0.85;
                const harmScaleX = n.f === 0 ? NW * 1.90 * openWScale : NW * 1.90;
                harmMark.scale.set(harmScaleX, NH * 2.0, 1);
                harmMark.position.set(x, y + techniqueYNow, noteZ + K);
                harmMark.rotation.z = approachRot;
                harmMark.renderOrder = techniqueMarkerRenderOrder;
            }

            // ── Per-note fret connector label ─────────────────────────
            if (n.f > 0 && !skipLabel) {
                const minStringY = Math.min(sY(0), sY(nStr - 1));
                const labelY = minStringY - S_GAP * 0.8;
                // Fade in over 0.35s at the far end; stay at full opacity until
                // the note hits (dt = 0).  No pre-hit fade-out — removing it
                // eliminates the "label disappears before the note arrives" artifact.
                const alpha = dt >= 0 ? Math.min(1.0, (AHEAD - dt) / 0.35) : 0;
                // Arpeggio notes use the arpeggio fret-label layer at the same
                // depth so they stay above non-arp connector lines of the same chord.
                const _isArpNote = arpBounds !== null;

                // String-coloured connector line — standalone notes only.
                // Arpeggio and chord notes already have a drop line to the board.
                if (!fromChord) {
                    const line = pConnectorLine.get();
                    line.position.set(x, labelY, noteZ);
                    // Half-length (50% shorter), anchored at the fret-label end.
                    line.scale.set(1, (y - labelY) * 0.5, 1);
                    // Tint the line with the incoming note's string colour.
                    // mStr is white for gradient strings, so use the canonical
                    // flat palette colour instead of the material's .color.
                    if (activePalette[s] != null) line.material.color.setHex(activePalette[s]);
                    line.renderOrder = renderOrderForLayerAtZ(noteZ,
                        _isArpNote
                            ? 'ARP_CONNECTOR_LINE'
                            : 'CONNECTOR_LINE'
                    );
                    line.material.opacity = alpha * 0.8;
                }

                // Regular chord notes (fromChord=true, arpBounds=null) never show
                // fret labels — only standalone notes and arpeggio note-stream notes
                // (fromChord=true with arpBounds!=null) show labels.
                // Key uses 40 ms buckets (same formula as _buildFretLabelSet) so
                // the lookup matches exactly, even if the note's time drifts ±20 ms.
                // Frame-dedup prevents multiple strings at the same onset/fret from
                // stacking duplicate labels.
                const _flFrameKey = Math.round(n.t * 25) * 100 + n.f;
                const _showNum = (!fromChord || arpBounds !== null)
                    && _fretLabelAllowed.has(_flFrameKey)
                    && !_frameLabeledKeys.has(_flFrameKey);
                if (_showNum) {
                    _frameLabeledKeys.add(_flFrameKey);
                    const fretLabel  = pNoteFretLabel.get();
                    const cachedMat  = txtMat(n.f, FRET_LABEL_GOLD_HEX, false, 'noteFret');
                    _setLabelMap(fretLabel, cachedMat);
                    fretLabel.position.set(x, labelY, noteZ);
                    fretLabel.renderOrder = renderOrderForLayerAtZ(noteZ,
                        _isArpNote
                            ? 'ARP_NOTE_FRET_LABEL'
                            : 'NOTE_FRET_LABEL'
                    );
                    // Same scale ramp as fret column markers: 2× base at max lookahead,
                    // converging to 1× at hit line.  Final size matches row labels.
                    const flS = 7.0 * K * (1 + 0.4 * Math.max(0, dt) / AHEAD) * _textSizeMul * fretLabelScaleForFret(n.f);
                    fretLabel.scale.set(flS, flS, 1);
                    fretLabel.material.opacity = alpha;
                }

                // Teaching marks (§6.2.2) — display only, never grading. The
                // fret-hand finger (fg) renders by default to the right of the
                // fret label (hideable via the finger-hints toggle); the scale
                // degree (sd) is opt-in (mirrors the 2D `teachingMarksVisible`
                // toggle) and renders to the left.
                if (alpha > 0 && n.f > 0) {
                    const _tmS = 5.0 * K * _textSizeMul * fretLabelScaleForFret(n.f);
                    const _drawTeachMark = (text, colorHex, dx, cacheKey) => {
                        if (!text) return;
                        const spr = pTeachMarkLbl.get();
                        const m = txtMat(text, colorHex, false, cacheKey);
                        _setLabelMap(spr, m);
                        spr.position.set(x + dx, labelY, noteZ);
                        spr.renderOrder = renderOrderForLayerAtZ(noteZ,
                            _isArpNote ? 'ARP_NOTE_FRET_LABEL' : 'NOTE_FRET_LABEL');
                        spr.scale.set(_tmS, _tmS, 1);
                        spr.material.opacity = alpha;
                    };
                    if (_showFingerHints) {
                        _drawTeachMark(teachingFingerLabel(n.fg), '#7fd1ff', NW * 0.95, 'teachFg');
                    }
                    if (_drawTeachingMarks) {
                        _drawTeachMark(teachingDegreeLabel(n.sd), '#ffcc66', -NW * 0.95, 'teachSd');
                    }
                }
            }
        }

        // ── Fret number for synthetic chord notes rendered with skipBody=true ──
        // suppressSynthChord paths skip the !skipBody block entirely, so their
        // fret label never fires from inside it. Handle them here, outside the
        // gate. Applies the same measure-based + frame-dedup rules so that if
        // the corresponding standalone arpeggio note already showed a label this
        // frame, we don't duplicate it.
        if (skipBody && fromChord && !skipLabel && n.f > 0 && dt >= 0) {
            const _fl2FrameKey = Math.round(n.t * 25) * 100 + n.f;
            if (_fretLabelAllowed.has(_fl2FrameKey)
                && !_frameLabeledKeys.has(_fl2FrameKey)) {
                _frameLabeledKeys.add(_fl2FrameKey);
                const _minStrY2 = Math.min(sY(0), sY(nStr - 1));
                const _labelY2  = _minStrY2 - S_GAP * 0.8;
                const _alpha2   = Math.min(1.0, (AHEAD - dt) / 0.35);
                const _isArp2   = arpBounds !== null;
                const fl2 = pNoteFretLabel.get();
                const cm2 = txtMat(n.f, FRET_LABEL_GOLD_HEX, false, 'noteFret');
                _setLabelMap(fl2, cm2);
                fl2.position.set(x, _labelY2, noteZ);
                fl2.renderOrder = renderOrderForLayerAtZ(noteZ,
                    _isArp2
                        ? 'ARP_NOTE_FRET_LABEL'
                        : 'NOTE_FRET_LABEL'
                );
                const _flS2 = 7.0 * K * (1 + 0.4 * dt / AHEAD) * _textSizeMul * fretLabelScaleForFret(n.f);
                fl2.scale.set(_flS2, _flS2, 1);
                fl2.material.opacity = _alpha2;
            }
        }

        // ── Drop line for chord / arpeggio notes ──────────────────────────
        // Styled to match the standalone single-note connector: tinted with
        // the incoming note's string colour and 50% length (anchored at the
        // fret-label end), instead of a full-height white line to the board.
        const _wantDropLine = pDropLine && n.f > 0 && dt >= 0 && fromChord && showDropLine && !skipBody;
        if (_wantDropLine) {
            const _minStrY = Math.min(sY(0), sY(nStr - 1));
            const _dropY = _minStrY - S_GAP * 0.8;
            const _alpha = Math.min(1.0, (AHEAD - dt) / 0.35);
            const dl = pDropLine.get();
            dl.position.set(x, _dropY, noteZ);
            // Half-length, anchored at the label end (matches single notes).
            dl.scale.set(1, (y - _dropY) * 0.5, 1);
            // String-colour tint (palette is canonical; mStr is white for
            // gradient strings).
            if (activePalette[s] != null) dl.material.color.setHex(activePalette[s]);
            dl.renderOrder = renderOrderForLayerAtZ(noteZ, 'CONNECTOR_LINE');
            dl.material.depthTest = false;
            dl.material.opacity = _alpha * 0.8;
        }

        // ── Board ghost: filled rim at Z=0 (up to 3 slots/string) ────
        // Lead notes (!fromChord, so !arpGhostActive too — see arpBounds
        // below) use a fixed GHOST_UPCOMING_WIN pre-impact ramp instead
        // of the gap-capped effectiveProjWin, so fast same-string runs
        // don't pop in at full size right before impact. Chords/arps
        // keep effectiveProjWin exactly as before — effectiveProjWin /
        // projFactorG / inGhostWin (computed above, for the separate gem
        // pre-glow) are untouched. Arp ghosts always use the full 0.6 s
        // window — their timing is authored, not gap-driven.
        const _PROJ_WIN_ARP = 0.6;
        const ghostWin = fromChord ? effectiveProjWin : GHOST_UPCOMING_WIN;
        const projFactor = Math.max(0, Math.min(1, 1 - Math.max(dt, 0) / ghostWin));
        // isBlocked suppresses the pre-impact ghost in a note's last 150ms
        // so it doesn't peek out from under the incoming note body. Scoped
        // to chord notes only (#843): for plain lead notes this previously
        // suppressed the board-ghost frame for every sustained note's last
        // 150ms, making it vanish right before impact and reappear during
        // the post-hit linger ("ghosts disappearing" in dense runs). Also
        // excludes slide notes (`!slideSt`, #862/#257): a sliding gem
        // glides off the start fret via slideXNow, so the body no longer
        // covers the ghost and the slide's own ghost preview should show.
        // Gate on dt > 0 so the post-hit linger (dt ≤ 0) keeps the ghost.
        const isBlocked = fromChord && dt > 0 && dt < 0.15 && n.sus > 0 && !slideSt;

        // For arpeggio notes: ALL notes show their ghost simultaneously
        // the moment the FIRST note enters _PROJ_WIN_ARP — exactly when
        // isNextOnString would reveal the first note's ghost on its own.
        // Using arpBounds.start as the shared reference makes every note
        // in the arpeggio fade in together, keyed off that single anchor.
        const arpDtToStart = arpBounds != null ? arpBounds.start - now : Infinity;
        const arpProjFactor = Math.max(0, Math.min(1, 1 - Math.max(arpDtToStart, 0) / _PROJ_WIN_ARP));
        const arpGhostActive = arpBounds != null
            && arpDtToStart < _PROJ_WIN_ARP
            && now <= arpBounds.end + 0.05;
        // Ghost stays at final "on the board" orientation — not the
        // incoming approachRot sweep — so it nests with the note at
        // impact. projRim/projScale/bodyDim are pure functions of
        // effSkipBody/_vibrancyProjOp; hoisted here so both the Primary
        // ghost (below) and the Upcoming-slot ghosts (sibling block
        // further down) can use them.
        const projRim = 0; // harmonic gems now land horizontal (no diamond offset)
        // _vibrancyProjOp (0.15..0.5) is the vibrancy-scaled idle floor;
        // scale the whole opacity by (_vibrancyProjOp / 0.15) so the slider
        // affects the projection the same way it affects note bodies.
        const projScale = _vibrancyProjOp / 0.15;
        // effSkipBody (= skipBody && dt > 0, #862): a slide-destination note
        // whose own gem is suppressed pre-hit isn't dimmed once it's hit.
        const bodyDim = effSkipBody ? 0.38 : 1;
        if (n.f > 0 && projectionVisible && (
            (!_overLinger && isNextOnString && dt > -ghostHold && dt < ghostWin && projFactor > 0.001 && !isBlocked)
            || arpGhostActive
        )) {
            const proj = projMeshArr[s][0];
            // Arp ghost: uniform opacity keyed off arpBounds.start so all
            // notes fade in/out together regardless of individual dt values.
            let arpGhostAlpha = 1;
            if (arpGhostActive) {
                const remainingP = arpBounds.end - now;
                const fadeOutP = remainingP < 0.25 ? Math.max(0, remainingP / 0.25) : 1;
                arpGhostAlpha = Math.min(arpProjFactor, fadeOutP);
            }
            // Chart-format-style ghost: a single 0→1 progress value drives both the
            // fade-in (opacity/emissive, below) and the grow-from-small scale
            // on the frame mesh and fret-digit label. Reuses the existing
            // per-path progress signals — arp ghosts use arpGhostAlpha
            // (already 0→1, incl. fade-out tail), non-arp ghosts use
            // projFactor (0→1 across ghostWin).
            const ghostProgress = arpGhostActive ? arpGhostAlpha : projFactor;
            const projGrowScale = PROJ_GROW_MIN + (1 - PROJ_GROW_MIN) * ghostProgress;
            const rimSolid = arpGhostActive
                ? 0.75 * arpGhostAlpha
                : projFactor * 0.94;
            proj.material.opacity = Math.min(0.96,
                projScale * rimSolid * (0.5 + 0.5 * glowMul) * bodyDim);
            proj.material.emissiveIntensity = arpGhostActive
                ? 0.35 * arpGhostAlpha * glowMul * bodyDim
                : projFactor * 0.55 * glowMul * bodyDim;
            proj.position.set(x, y, 0);
            proj.scale.set(projGrowScale, projGrowScale, projGrowScale);
            proj.rotation.z = projRim;
            proj.visible = true;

            const ghostFretOk = showFretOnNote && (
                arpGhostActive ||
                fretNumberGhostScope === 'all' ||
                (fretNumberGhostScope === 'chords' && fromChord)
            );
            if (ghostFretOk && getPGhostFretLbl()) {
                // chord-hand style → show finger number (1–4) from the chord
                // template; fall back to fret number when no finger data exists
                // (GP imports, open strings, non-chord notes).
                const ghostFretDisplay = fromChord && fretNumberGhostScope === 'chords'
                    ? (_templateFingerForChordGhost(chordId, n.s) ?? _templateFretForChordGhost(chordId, n.s, n.f))
                    : fromChord
                        ? _templateFretForChordGhost(chordId, n.s, n.f)
                        : n.f;
                let ghostFretLblAlpha = 1;
                if (arpGhostActive) {
                    // Reuse arpGhostAlpha — already encodes fade-in (keyed
                    // off arpBounds.start via arpProjFactor) + fade-out.
                    ghostFretLblAlpha = arpGhostAlpha;
                } else if (ghostPastHold) {
                    const nextSoon = nxFrame != null && nxFrame.t > n.t + 1e-6
                        && (nxFrame.t - now) <= GHOST_FRET_LBL_FADE_S;
                    const ghostFadeS = Math.min(GHOST_FRET_LBL_FADE_S, ghostHold);
                    ghostFretLblAlpha = hwyPostHitTailFadeMul(dt, ghostHold, nextSoon, ghostFadeS);
                } else {
                    // Pre-impact approach: fade the digit in alongside the
                    // frame (projFactor), instead of popping in at full alpha.
                    ghostFretLblAlpha = projFactor;
                }
                const _ghostFretForScale = fromChord && fretNumberGhostScope === 'chords'
                    ? n.f
                    : ghostFretDisplay;
                drawGhostFretLabel(x, y, projRim, ghostFretDisplay, ghostFretLblAlpha, projGrowScale, _ghostFretForScale);
            }
        }

        // ── Upcoming board ghosts (slots 1/2): up to 2 additional,
        // independent pre-impact previews per string for plain lead
        // notes, chart-format-style. Primary (slot 0, above) already shows the
        // very next note on this string; this sibling block shows the
        // 1-2 notes after that, each on its own mesh with its own
        // fixed-GHOST_UPCOMING_WIN ramp — fixes fast same-string runs
        // where every note after the first had almost no ramp time
        // (capped at the gap to the *previous* note on that string).
        // !nextTAligned excludes exactly the note Primary is already
        // showing, so a note is never drawn in two slots at once.
        if (n.f > 0 && projectionVisible && !fromChord && !nextTAligned
            && dt > 0 && dt < GHOST_UPCOMING_WIN) {
            const slotIdx = 1 + _scrGhostUpcomingCount[s];
            if (slotIdx <= 2) {
                _scrGhostUpcomingCount[s]++;
                // Same formula as Primary's projFactor for !fromChord
                // notes (ghostWin === GHOST_UPCOMING_WIN there too) —
                // keeps the size/brightness curve continuous as a note's
                // rank improves frame-to-frame (slot 2 → 1 → 0).
                const upcomingProgress = projFactor;
                const proj = projMeshArr[s][slotIdx];
                const rimSolid = upcomingProgress * 0.94;
                proj.material.opacity = Math.min(0.96,
                    projScale * rimSolid * (0.5 + 0.5 * glowMul) * bodyDim);
                proj.material.emissiveIntensity = upcomingProgress * 0.55 * glowMul * bodyDim;
                const growScale = PROJ_GROW_MIN + (1 - PROJ_GROW_MIN) * upcomingProgress;
                proj.position.set(x, y, 0);
                proj.scale.set(growScale, growScale, growScale);
                proj.rotation.z = projRim;
                proj.visible = true;

                if (showFretOnNote && fretNumberGhostScope === 'all' && getPGhostFretLbl()) {
                    drawGhostFretLabel(x, y, projRim, n.f, upcomingProgress, growScale, n.f);
                }
            }
        }
    }

    /**
     * Draw  [ GEM ]  bracket pair for an arpeggio note.
     *
     * While the note is approaching (bracketDt > 0) the brackets travel at the
     * same Z as the gem.  Once the note hits the line (bracketDt <= 0) the
     * brackets sit at Z = 0 (the fretboard plane) and persist until arpEnd.
     * They fade in with approach and fade out in the last 0.25 s of the arpeggio.
     *
     * Fretted notes: `[ ]` — 3 BoxGeometry bars per side (vertical + 2 caps).
     * Open strings:  `< >` — 2 diagonal arms per side, tips at note edges.
     *
     * openHalfW (optional) — half-width of the open note body; when supplied,
     * the < > tips are placed at the actual edges of the note rather than a
     * fixed offset.
     */
    function drawArpBrackets(x, y, bracketDt, arpEnd, now, s, isOpen = false, openHalfW = null) {
        const pArpBracket = getPArpBracket(); // pool getter alias
        const activePalette = getActivePalette(); // frame-state getter alias

        if (bracketDt >= AHEAD) return;
        if (bracketDt < 0 && now > arpEnd + 0.05) return;
        if (!pArpBracket) return;

        let alpha;
        if (bracketDt > 0) {
            // Match the chord frame box visibility: full opacity throughout the
            // entire AHEAD window so brackets appear the moment the frame enters
            // view, not after a slow linear fade from alpha≈0 at 3 s out.
            alpha = 1;
        } else {
            const remaining = arpEnd - now;
            alpha = remaining > 0.25 ? 1 : Math.max(0, remaining / 0.25);
        }
        if (alpha < 0.01) return;

        const bracketZ = bracketDt > 0 ? Math.min(0, dZ(bracketDt)) : 0;
        const col = activePalette[s % activePalette.length];
        const barThick = NW * 0.09;
        const bracketH = NH * 1.05;
        const capLen   = NW * 0.42;
        const xOff     = (isOpen && openHalfW != null) ? openHalfW : NW * 0.95;
        const zOff     = 0.006 * K;
        const ord      = 18;

        if (isOpen) {
            // < > chevron — 2 diagonal arms per side.
            // Arm goes from tip outward; angle from positive-X axis via atan2.
            const armLen = Math.sqrt(capLen * capLen + (bracketH * 0.5) * (bracketH * 0.5));
            const ang    = Math.atan2(bracketH * 0.5, capLen); // upper-right arm angle

            const diagBar = (px, py, rz) => {
                const b = pArpBracket.get();
                b.material.color.setHex(col);
                b.material.opacity = alpha;
                b.renderOrder = ord;
                b.position.set(px, py, bracketZ + zOff);
                b.rotation.set(0, 0, rz);
                b.scale.set(armLen, barThick, barThick);
            };

            // < tip at (x - xOff), arms open to the right
            diagBar(x - xOff + capLen * 0.5, y + bracketH * 0.25,  ang);
            diagBar(x - xOff + capLen * 0.5, y - bracketH * 0.25, -ang);

            // > tip at (x + xOff), arms open to the left
            diagBar(x + xOff - capLen * 0.5, y + bracketH * 0.25,  Math.PI - ang);
            diagBar(x + xOff - capLen * 0.5, y - bracketH * 0.25, -Math.PI + ang);
        } else {
            const bar = (px, py, sw, sh) => {
                const b = pArpBracket.get();
                b.material.color.setHex(col);
                b.material.opacity = alpha;
                b.renderOrder = ord;
                b.position.set(px, py, bracketZ + zOff);
                b.rotation.set(0, 0, 0);
                b.scale.set(sw, sh, barThick);
            };

            // Left bracket  [  – vertical bar then caps opening to the right
            bar(x - xOff,                     y,                  barThick, bracketH);
            bar(x - xOff + capLen * 0.5, y + bracketH * 0.5, capLen,   barThick);
            bar(x - xOff + capLen * 0.5, y - bracketH * 0.5, capLen,   barThick);

            // Right bracket  ]  – vertical bar then caps opening to the left
            bar(x + xOff,                     y,                  barThick, bracketH);
            bar(x + xOff - capLen * 0.5, y + bracketH * 0.5, capLen,   barThick);
            bar(x + xOff - capLen * 0.5, y - bracketH * 0.5, capLen,   barThick);
        }
    }

    function drawNotedetectLabels(ctx, W, H) {
        const _ndLabels = getNdLabels(); // getter alias
        const cam       = getCam();
        const _probe    = getProbe();

        if (!_ndLabels.length || !cam || !_probe) return;
        ctx.save();
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const item of _ndLabels) {
            _probe.set(item.x, item.y, item.z);
            _probe.project(cam);
            if (_probe.z < -1 || _probe.z > 1) continue;
            const sx = (_probe.x * 0.5 + 0.5) * W;
            const sy = (-_probe.y * 0.5 + 0.5) * H;
            for (let i = 0; i < item.labels.length; i++) {
                const label = item.labels[i];
                const y = sy + (i - (item.labels.length - 1) / 2) * 15;
                ctx.lineWidth = 4;
                ctx.strokeStyle = 'rgba(0,0,0,0.8)';
                ctx.strokeText(label.text, sx, y);
                ctx.fillStyle = label.color;
                ctx.fillText(label.text, sx, y);
            }
        }
        ctx.restore();
    }

    return { drawNote, drawArpBrackets, drawNotedetectLabels, chordHarmonyLabels };
}
