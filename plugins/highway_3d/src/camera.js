// h3d-carve-9: W-section (camera lerp) — effectiveVfov + camUpdate.
// Cut 13 (S-section lookahead) extends this factory in place: same createCamera({…})
// destructure grows with additional DI params and returned symbols.
//
// DI surface (per §2 of the cut-9 contract):
//   Constants (22) — BASE_VFOV, HORPLUS_*, CAM_LERP_BASE, CAM_H/DIST_BASE,
//                    6× CAM_FRAME_*, FOCUS_D, S_GAP, K, 3× FRET_ROW_FIT_*,
//                    4× CAM_TILT_*
//   Getters (11)   — getCam, getTgtX/Dist, getAspectScale, getLeftyCached,
//                    getNStr, getProbe, getTiltSmoothing, getPaneAspect/Uid,
//                    getHighwayCanvas
//   Pairs (5)      — getCurX/setCurX, getCurDist/setCurDist,
//                    getCurLookY/setCurLookY, getTgtLookY/setTgtLookY,
//                    getFretRowFitBoost/setFretRowFitBoost
//   Fn refs (5)    — sY, freeCamFor, aspectPaneKey, resolveTuneFor,
//                    aspectRegisterPane

import { computeBPM, lowerBoundT, camBaseDistU, camLowFretPullbackU } from './geometry.js';  // h3d-carve-1,13
import { _ssActive } from './utils.js';       // h3d-carve-3

export function createCamera({
    // ── Constants ──────────────────────────────────────────────────────────
    BASE_VFOV, HORPLUS_START_ASPECT, HORPLUS_MIN_VFOV,
    CAM_LERP_BASE, CAM_H_BASE, CAM_DIST_BASE,
    CAM_FRAME_DIST_NEAR, CAM_FRAME_DIST_FAR,
    CAM_FRAME_H_NEAR, CAM_FRAME_H_FAR,
    CAM_FRAME_D_NEAR, CAM_FRAME_D_FAR,
    FOCUS_D, S_GAP, K,
    FRET_ROW_FIT_NDC_MIN, FRET_ROW_FIT_DEADBAND, FRET_ROW_FIT_BOOST_MAX,
    CAM_TILT_BAND_T, CAM_TILT_BAND_C, CAM_TILT_STR_T, CAM_TILT_STR_C,
    // ── Live-accessor getters ───────────────────────────────────────────────
    getCam,
    getTgtX, getTgtDist, getAspectScale, getLeftyCached,
    getNStr, getProbe, getTiltSmoothing, getPaneAspect, getPaneUid,
    getHighwayCanvas,
    // ── Getter+setter pairs (write-backs) ──────────────────────────────────
    getCurX, setCurX,
    getCurDist, setCurDist,
    getCurLookY, setCurLookY,
    getTgtLookY, setTgtLookY,
    getFretRowFitBoost, setFretRowFitBoost,
    // ── Function refs ───────────────────────────────────────────────────────
    sY, freeCamFor, aspectPaneKey, resolveTuneFor, aspectRegisterPane,
    // h3d-carve-13: S-section lookahead — +4 const shorthand, +1 getter, +4 fn refs
    NFRETS, CAM_LOOKAHEAD_MEASURES, CAM_LOOKAHEAD_SEC, CAM_FRET_EDGE_BLEND,
    getMeasureStarts,
    validString, getChartAnchorAt, xFretMid, xFret,
}) {
    // Horizontal-FOV-hold ("Hor+"). Returns the vertical fov (deg) the
    // camera should use for the given pane aspect. With the bridge off (or
    // absent), or at/under the start aspect, it returns the base vertical
    // fov unchanged — an exact no-op, so normal panes render identically to
    // before. Past the start aspect it lowers the vertical fov to keep the
    // horizontal cone ~constant, so the neck fills an ultra-wide pane
    // instead of collapsing into a central sliver. Pure + finite-guarded.
    function effectiveVfov(aspect, tune) {
        // VERBATIM MOVE. 0 beyond-subst: BASE_VFOV / HORPLUS_* / HORPLUS_MIN_VFOV
        // are plain DI params in the factory destructure — no rewires needed.
        const base = (tune && Number.isFinite(tune.baseVfov)) ? tune.baseVfov : BASE_VFOV;
        if (!tune || !tune.enabled || !Number.isFinite(aspect) || aspect <= 0) return base;
        const start = (Number.isFinite(tune.startAspect) && tune.startAspect > 0)
            ? tune.startAspect : HORPLUS_START_ASPECT;
        if (aspect <= start) return base;
        const floor = Number.isFinite(tune.minVfovDeg) ? tune.minVfovDeg : HORPLUS_MIN_VFOV;
        const DEG = Math.PI / 180;
        // Held horizontal fov: explicit hfovDeg if given, else the horizontal
        // cone the base vertical fov produces at the start aspect.
        const hfov = (Number.isFinite(tune.hfovDeg) && tune.hfovDeg > 0)
            ? tune.hfovDeg * DEG
            : 2 * Math.atan(Math.tan(base * DEG / 2) * start);
        // Vertical fov that reproduces that horizontal cone at this aspect.
        let vfov = 2 * Math.atan(Math.tan(hfov / 2) / aspect) / DEG;
        const blend = Number.isFinite(tune.blend) ? Math.max(0, Math.min(1, tune.blend)) : 1;
        vfov = base + (vfov - base) * blend;            // 0 = base, 1 = full Hor+
        if (!Number.isFinite(vfov)) return base;
        return Math.max(floor, Math.min(base, vfov));
    }

    /* ── Camera smooth lerp ──────────────────────────────────────────── */
    function camUpdate(bundle) {
        // VERBATIM MOVE. DI rewires — 25 beyond-subst:
        //   Local aliases intro (10): cam, paneAspect, curX, curDist, curLookY,
        //     tgtLookY, _fretRowFitBoost, nStr, _probe, tiltSmoothing
        //   Fn-ref renames (4): _aspectPaneKey→aspectPaneKey,
        //     _aspectRegisterPane→aspectRegisterPane,
        //     _resolveTuneFor→resolveTuneFor, _freeCamFor→freeCamFor
        //   Direct getter calls (6): getPaneUid, getTgtX, getTgtDist,
        //     getAspectScale, getLeftyCached, getHighwayCanvas
        //   Write-back setter calls (5): setCurX, setCurDist, setCurLookY,
        //     setTgtLookY, setFretRowFitBoost
        const bpm = computeBPM(bundle.beats, bundle.currentTime);
        const lerp = CAM_LERP_BASE * Math.max(bpm, 60) / 120;

        // ── Horizontal-FOV-hold + optional wide-pane pose nudges ──
        // Driven by window.__h3dAspectTune (default off → exact no-op).
        // _resolveTuneFor(paneKey) returns the shared base with THIS pane's
        // overrides (if any) laid on top, so a single split pane can be framed
        // independently. The base is seeded from defaults + localStorage on
        // first read, so a persisted tuning session applies on load without
        // opening the panel. Every field is finite-coerced. When disabled (or
        // splitOnly and not in a split) the tune is treated as null, so
        // effectiveVfov returns the base vertical fov and cam.fov is restored
        // to it. The fov write is guarded on an actual change so a steady pane
        // costs nothing.
        const cam = getCam();                    // DI rewire: live-accessor
        const paneAspect = getPaneAspect();      // DI rewire: live-accessor (replaces _paneAspect)
        const _paneKey = aspectPaneKey(          // DI rewire: fn-ref rename
            bundle && bundle.songInfo && bundle.songInfo.arrangement, getPaneUid()); // DI rewire: getPaneUid
        // Only feed the Target-picker registry while the tuner is open (same
        // gate as the readout). Closed → nothing is registered, so the registry
        // can't grow for users who never open the panel; the key is still
        // resolved below so any saved overrides keep applying.
        if (window.__h3dAspectPanelOpen) aspectRegisterPane(_paneKey); // DI rewire: fn-ref rename
        const _aspTune = resolveTuneFor(_paneKey); // DI rewire: fn-ref rename
        const _aspActive = !!(_aspTune && _aspTune.enabled
            && !(_aspTune.splitOnly && !_ssActive()));
        const _tune = _aspActive ? _aspTune : null;
        const _vfov = effectiveVfov(paneAspect, _tune); // DI rewire: paneAspect
        if (Number.isFinite(_vfov) && Math.abs(_vfov - cam.fov) > 1e-4) {
            cam.fov = _vfov;
            cam.updateProjectionMatrix();
        }
        // Publish a per-pane live readout for the tuner panel (only while it's
        // open, so the steady path stays allocation-free). Keyed by pane so
        // the panel can show the reading for whichever target is selected.
        if (window.__h3dAspectPanelOpen) {
            const _ro = window.__h3dAspectReadout || (window.__h3dAspectReadout = {});
            const _slot = _ro[_paneKey] || (_ro[_paneKey] = {});
            _slot.aspect = paneAspect; _slot.vfov = _vfov; // DI rewire: paneAspect
            _ro.__last = _paneKey;
        }
        // Optional pose nudges (height / dolly / pitch) to chase a low-flat
        // wide-pane look if fov alone isn't enough. Gated to wide panes and
        // suppressed while the Camera Director owns the view (it wins).
        const _startAspect = (_tune && Number.isFinite(_tune.startAspect) && _tune.startAspect > 0)
            ? _tune.startAspect : HORPLUS_START_ASPECT;
        // Resolve the Camera Director bridge once (per-panel under splitscreen,
        // else global). Used both for the wide-pane gate and the transforms below.
        const _freeCam = freeCamFor(getHighwayCanvas()); // DI rewire: fn-ref rename + getter
        const _dirActive = !!(_freeCam && _freeCam.enabled);
        const _wide = !!(_tune && paneAspect > _startAspect) && !_dirActive; // DI rewire: paneAspect
        const _poseHMul = (_wide && Number.isFinite(_tune.heightMul)) ? _tune.heightMul : 1;
        const _poseDMul = (_wide && Number.isFinite(_tune.distMul)) ? _tune.distMul : 1;
        const _poseLookYAdd = (_wide && Number.isFinite(_tune.pitchAdd)) ? _tune.pitchAdd * K : 0;
        const _poseLookZMul = (_wide && Number.isFinite(_tune.lookDepthMul) && _tune.lookDepthMul > 0)
            ? _tune.lookDepthMul : 1;

        // DI rewire: lerped state — read per-call into locals, mutate locally,
        // write back via setters so screen.js closure vars stay in sync.
        // (Never cached at factory init — buildBoard may reset these between frames.)
        let curX = getCurX();                             // DI rewire: local alias
        curX += (getTgtX() - curX) * lerp;               // DI rewire: getTgtX()
        setCurX(curX);                                    // write-back
        let _fretRowFitBoost = getFretRowFitBoost();      // DI rewire: local alias
        let curDist = getCurDist();                       // DI rewire: local alias
        // The fret-row fit guard (end of camUpdate) may dolly the camera back
        // via _fretRowFitBoost; the span-driven tgtDist still owns zooming IN.
        curDist += (getTgtDist() * _fretRowFitBoost - curDist) * lerp; // DI rewire: getTgtDist()
        setCurDist(curDist);                              // write-back
        const dist = curDist * getAspectScale();          // DI rewire: getAspectScale()
        const h = CAM_H_BASE * (dist / CAM_DIST_BASE);

        // Zoom-interpolated framing multipliers: tight (NEAR) -> lower/closer;
        // wide (FAR, fret 1<->20) -> higher/pulled back.
        const _zt = Math.max(0, Math.min(1,
            (dist - CAM_FRAME_DIST_NEAR) / (CAM_FRAME_DIST_FAR - CAM_FRAME_DIST_NEAR)));
        const _hMul = CAM_FRAME_H_NEAR + (CAM_FRAME_H_FAR - CAM_FRAME_H_NEAR) * _zt;
        const _dMul = CAM_FRAME_D_NEAR + (CAM_FRAME_D_FAR - CAM_FRAME_D_NEAR) * _zt;
        const shoulderOffset = (getLeftyCached() ? -1 : 1) * 10 * K; // DI rewire: getLeftyCached()
        let _camX = curX + shoulderOffset, _camY = h * _hMul, _camZ = dist * _dMul;
        // Optional wide-pane pose nudges (default identity → no-op).
        if (_poseHMul !== 1) _camY *= _poseHMul;
        if (_poseDMul !== 1) _camZ *= _poseDMul;
        // ── Free-camera user tweaks (orbit / height / zoom / pan) ──
        // Driven by the Camera Director plugin via the camera bridge:
        // window.__h3dCamCtlPanels[panelIndexFor(canvas)] when split (this
        // panel's own camera), falling back to the global window.__h3dCamCtl.
        // Layered ON TOP of the auto-framing so note tracking still works.
        // The bridge is read once into _freeCam and reused for both the
        // position and the look-at transforms; every field is coerced to a
        // finite number before use so a malformed object can never feed NaN
        // into cam.position / cam.lookAt.
        // _freeCam resolved above via freeCamFor(getHighwayCanvas()): the
        // per-panel __h3dCamCtlPanels entry, else global __h3dCamCtl, else null.
        let curLookY = getCurLookY();                     // DI rewire: local alias (read before freeCam block)
        const _lookAtZ = -FOCUS_D * 0.35 * _poseLookZMul;
        if (_freeCam && _freeCam.enabled) {
            const _distMul = Number.isFinite(_freeCam.distMul) ? _freeCam.distMul : 1;
            const _heightMul = Number.isFinite(_freeCam.heightMul) ? _freeCam.heightMul : 1;
            const _yaw = Number.isFinite(_freeCam.yaw) ? _freeCam.yaw : 0;
            const _tx = curX, _ty = curLookY, _tz = _lookAtZ; // look target
            let _vx = _camX - _tx, _vy = _camY - _ty, _vz = _camZ - _tz;
            _vx *= _distMul; _vy *= _distMul; _vz *= _distMul; // zoom (dolly)
            _vy *= _heightMul;                                 // height
            const _cy = Math.cos(_yaw), _sy = Math.sin(_yaw);  // orbit around Y
            const _rx = _vx * _cy - _vz * _sy, _rz = _vx * _sy + _vz * _cy;
            _camX = _tx + _rx; _camY = _ty + _vy; _camZ = _tz + _rz;
        }
        cam.position.set(_camX, _camY, _camZ);

        // Self-correcting look-at Y: project the fretboard's near-edge centre
        // to NDC space. If it drifts toward the frame edge, nudge tgtLookY
        // toward the fretboard centre so the camera tilts to re-frame it.
        // This lets the camera adapt to any panel aspect ratio automatically.
        const nStr = getNStr();                           // DI rewire: local alias
        const _probe = getProbe();                        // DI rewire: local alias
        const fretMidY = (sY(0) + sY(nStr - 1)) / 2;
        _probe.set(curX, fretMidY, 0);                  // play-line fretboard centre
        cam.lookAt(curX, curLookY + _poseLookYAdd, _lookAtZ);    // tentative look — needed for project()
        cam.updateMatrixWorld();
        _probe.project(cam);                             // _probe.y → NDC in [-1, 1]

        // Keep fretboard centre in the lower third of the screen (NDC ≈ -0.35).
        // The deadband width and correction strength are both blended
        // between Twitchy and Calm bounds by the user's tiltSmoothing
        // setting — twitchy = re-frame aggressively (narrow band, strong
        // nudge); calm = let small drift ride (wide band, weak nudge).
        const DESIRED_NDC_Y = -0.35;
        const tiltSmoothing = getTiltSmoothing();         // DI rewire: local alias
        const tiltBand   = CAM_TILT_BAND_T + (CAM_TILT_BAND_C - CAM_TILT_BAND_T) * tiltSmoothing;
        const tiltStr    = CAM_TILT_STR_T  + (CAM_TILT_STR_C  - CAM_TILT_STR_T)  * tiltSmoothing;
        let tgtLookY = getTgtLookY();                     // DI rewire: local alias
        if (_probe.y < DESIRED_NDC_Y - tiltBand || _probe.y > DESIRED_NDC_Y + tiltBand) {
            // _probe.y too low → fretboard near bottom → tgtLookY decreases → camera tilts down → fretboard rises
            // _probe.y too high → fretboard near top  → tgtLookY increases → camera tilts up   → fretboard drops
            const correction = (DESIRED_NDC_Y - _probe.y) * fretMidY * tiltStr;
            tgtLookY = Math.max(-fretMidY, Math.min(fretMidY, tgtLookY - correction));
        }
        setTgtLookY(tgtLookY);                           // write-back
        curLookY += (tgtLookY - curLookY) * lerp;
        setCurLookY(curLookY);                           // write-back

        // Final look-at with the corrected Y (overrides the tentative one above).
        // User tilt (pitch) + pan offsets layer on top when the free-cam is
        // enabled; each is coerced to a finite number to avoid a NaN look-at.
        if (_freeCam && _freeCam.enabled) {
            const _panX = Number.isFinite(_freeCam.panX) ? _freeCam.panX : 0;
            const _panY = Number.isFinite(_freeCam.panY) ? _freeCam.panY : 0;
            const _pitch = Number.isFinite(_freeCam.pitch) ? _freeCam.pitch : 0;
            cam.lookAt(curX + _panX * K, curLookY + (_pitch + _panY) * K, _lookAtZ);
        } else {
            cam.lookAt(curX, curLookY + _poseLookYAdd, _lookAtZ);
        }

        // ── Fret-row fit guard ────────────────────────────────────────────
        // Project the fret-number-row band (just below the lowest string, at
        // the play line) with the final camera. If it sits below the safe
        // bottom line, dolly back (raise _fretRowFitBoost → applied to the
        // curDist lerp target next frame) until it clears; relax lazily once
        // there's comfortable headroom. Asymmetric + deadbanded so it
        // converges without hunting, and capped so the zoom can't pop. It
        // cooperates with the tilt loop above rather than fighting it: pulling
        // back shrinks the scene, the tilt loop keeps the board centre anchored
        // at DESIRED_NDC_Y, so only the row's bottom headroom changes. Skipped
        // while the free-cam (Camera Director) owns the view.
        if (_freeCam && _freeCam.enabled) {
            if (_fretRowFitBoost !== 1) _fretRowFitBoost = 1;
        } else {
            cam.updateMatrixWorld();
            const _rowY = Math.min(sY(0), sY(nStr - 1)) - S_GAP * 1.4;
            _probe.set(curX, _rowY, 0.5 * K);
            _probe.project(cam);                              // _probe.y → NDC; < -1 = off the bottom
            const _rowNdcY = _probe.y;
            if (_rowNdcY < FRET_ROW_FIT_NDC_MIN) {
                // Row below the safe line → pull back promptly, proportional to
                // the deficit so it converges in a few frames without overshoot.
                const _need = FRET_ROW_FIT_NDC_MIN - _rowNdcY;
                _fretRowFitBoost = Math.min(FRET_ROW_FIT_BOOST_MAX,
                    _fretRowFitBoost + Math.min(0.05, _need * 0.4));
            } else if (_rowNdcY > FRET_ROW_FIT_NDC_MIN + FRET_ROW_FIT_DEADBAND
                       && _fretRowFitBoost > 1) {
                // Comfortable headroom → relax the dolly back toward normal, lazily.
                _fretRowFitBoost = Math.max(1, _fretRowFitBoost - 0.01);
            }
        }
        setFretRowFitBoost(_fretRowFitBoost);             // write-back
    }

    /* ── h3d-carve-13: S-section lookahead helpers ───────────────────── */
    // VERBATIM MOVE from screen.js Region A (original lines 6630-6719).
    // 1 beyond-subst: _measureStarts → getMeasureStarts() (live getter).
    // lookaheadEndTime: factory-private (no external callers).
    function lookaheadEndTime(now) {
        const ms = getMeasureStarts(); // h3d-carve-13: _measureStarts → getMeasureStarts()
        if (!ms || ms.length === 0) return now + CAM_LOOKAHEAD_SEC;
        // Binary search: lo = first index with ms[lo] > now.
        let lo = 0, hi = ms.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (ms[mid] <= now) lo = mid + 1; else hi = mid; }
        const curIdx = lo - 1;                       // current measure (-1 if before the first)
        const targetIdx = curIdx + CAM_LOOKAHEAD_MEASURES;
        if (targetIdx >= 0 && targetIdx < ms.length) return ms[targetIdx];
        // Past the last measure: extrapolate using the average measure duration.
        if (ms.length >= 2) {
            const avg = (ms[ms.length - 1] - ms[0]) / (ms.length - 1);
            if (avg > 0) return ms[ms.length - 1] + (targetIdx - (ms.length - 1)) * avg;
        }
        return now + CAM_LOOKAHEAD_SEC;
    }

    // Earliest future chart time whose lookahead end reaches eventTime.
    // lookaheadEndTime() is monotonic but measure-stepped, so a small
    // bounded binary search works for both measure grids and the seconds
    // fallback without duplicating/inverting its edge-case logic.
    function lookaheadBootstrapTime(now, eventTime) {
        if (!(eventTime > now) || lookaheadEndTime(now) >= eventTime) return now;
        let lo = now;
        let hi = eventTime;
        for (let i = 0; i < 32; i++) {
            const mid = (lo + hi) * 0.5;
            if (lookaheadEndTime(mid) >= eventTime) hi = mid;
            else lo = mid;
        }
        return hi;
    }

    function lookaheadComputeFretBounds(now, anchors, notes, chords) {
        const tEnd = lookaheadEndTime(now);
        let minF = 99;
        let maxF = 0;
        let any = false;
        if (anchors && anchors.length) {
            for (let tt = now; tt <= tEnd + 1e-9; tt += 0.125) {
                const a = getChartAnchorAt(anchors, tt);
                if (!a) continue;
                let fStart = Math.round(Number(a.fret));
                if (!Number.isFinite(fStart) || fStart < 1) fStart = 1;
                let w = Number(a.width);
                if (!Number.isFinite(w)) w = 4;
                w = Math.max(1, Math.round(w));
                const fHi = Math.min(NFRETS, fStart + w - 1);
                minF = Math.min(minF, fStart);
                maxF = Math.max(maxF, fHi);
                any = true;
            }
        }
        const consider = f => {
            if (!(f > 0)) return;
            minF = Math.min(minF, f);
            maxF = Math.max(maxF, f);
            any = true;
        };
        if (notes) {
            let i = lowerBoundT(notes, now);
            for (; i < notes.length; i++) {
                const n = notes[i];
                if (n.t > tEnd) break;
                if (!validString(n.s)) continue;
                consider(n.f);
            }
        }
        if (chords) {
            let i = lowerBoundT(chords, now);
            for (; i < chords.length; i++) {
                const ch = chords[i];
                if (ch.t > tEnd) break;
                if (!ch.notes) continue;
                for (const cn of ch.notes) {
                    if (!validString(cn.s)) continue;
                    consider(cn.f);
                }
            }
        }
        if (!any || minF > maxF) return null;
        return { minF, maxF };
    }

    function lookaheadTargetWorldX(minF, maxF) {
        const wb = CAM_FRET_EDGE_BLEND;
        const middle = (xFretMid(minF) + xFretMid(maxF)) * 0.5;
        const weighted = 0.6 * xFret(0) + 0.4 * xFret(NFRETS);
        return middle * (1 - wb) + weighted * wb;
    }

    return { effectiveVfov, camUpdate, lookaheadBootstrapTime, lookaheadComputeFretBounds, lookaheadTargetWorldX };
}
