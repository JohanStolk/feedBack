// h3d-carve-10: K-section (score FX) extracted from screen.js.
// VERBATIM-MOVE: function bodies are byte-for-byte identical to their
// screen.js originals except for 7 DI-rewires (see inline // DI: comments).
// No logic changes, no new guards, no structural additions.
//
// Beyond-subst changes (all mechanical DI rewires):
//   1. _fxSpawnPop:  _ndFrameNowMs           → getNdFrameNowMs()
//   2. drawScoreFx:  cam                      → aliased const cam = getCam()
//   3. drawScoreFx:  _probe                   → aliased const _probe = getProbe()
//   4. drawScoreFx:  _ndFrameNowMs            → getNdFrameNowMs()
//   5. drawScoreFx:  nStr                     → getNStr()
//   6. drawScoreFx:  curX                     → getCurX()
//   7. fxInit:       highwayCanvas (closure)  → getHighwayCanvas()

export function createScoreFx({ getHighwayCanvas, getNdFrameNowMs, getCam, getProbe, getNStr, getCurX, sY }) {

        // ── Score FX (notedetect game-scoring layer, notedetect ≥1.13) ──
        // Two channels: (1) per-note "+N" score pops, sourced from the
        // note-state provider's new { points, mult, popKey } fields at the
        // moment a gem's verdict lands; (2) session-level bursts/pulses from
        // the new `notedetect:fx` event (streak milestones, multiplier tier
        // changes, streak breaks). Everything renders on the 2D overlay
        // canvas (same layer as drawNotedetectLabels) — no Three.js objects,
        // no txtMat() cache entries, nothing to dispose. Pools are fixed-
        // size slot arrays created once per factory instance; when all slots
        // are busy a new effect is simply dropped.
        const _FX_POP_LIFE_MS = 700;
        const _FX_BURST_LIFE_MS = 900;
        const _FX_BURST_N = 36;
        const _fxPops = Array.from({ length: 24 }, () => (
            { active: false, x: 0, y: 0, z: 0, bornMs: 0, text: '', mult: 1 }
        ));
        const _fxBursts = Array.from({ length: 4 }, () => ({
            active: false, bornMs: 0,
            px: new Float32Array(_FX_BURST_N), py: new Float32Array(_FX_BURST_N),
            vx: new Float32Array(_FX_BURST_N), vy: new Float32Array(_FX_BURST_N),
        }));
        // popKey -> expiry ms. Dedupes pops (chord members share the chord's
        // popKey; sustains keep returning points for the whole glow window).
        const _fxSeen = new Map();
        let _fxOnFx = null;          // notedetect:fx listener (window)
        let _fxOnSkin = null;        // notedetect:skin bus listener
        // Generation counter: bumped by teardown() so the deferred window-
        // copy fallback (a zero-delay task the listener removal can't cancel)
        // bails instead of re-arming ring/burst state after teardown — or,
        // worse, leaking a stale event into a subsequent init's fresh state.
        let _fxGen = 0;
        let _fxLastFxDetail = null;  // reference dedup: window + instanceRoot dispatches share one detail
        // Details seen via element-scoped (bubbled) dispatch. A WeakSet, not a
        // single slot: one judged hit can emit several fx in the same task
        // (milestone + multiplier tier-up), and the deferred window-copy
        // fallback for the FIRST must still see that its element copy arrived
        // after the SECOND overwrote any last-detail slot. GC reclaims
        // entries once notedetect drops the detail objects.
        let _fxElemSeen = new WeakSet();
        let _fxRingMs = -1e9;        // multiplier ring-pulse anchor
        let _fxRingMult = 1;
        let _fxBreakMs = -1e9;       // streak-break flicker anchor
        // Canvas-side palette per notedetect skin (mirrors the accents in
        // notedetect's assets/plugin.css; fonts are document-loaded by that
        // stylesheet so the overlay canvas can use the family names).
        const _FX_PALETTES = {
            neon:    { accent: '#00f0ff', accent2: '#ff2ec4', miss: '#ff4444', font: 'Orbitron' },
            esports: { accent: '#e8b43a', accent2: '#f5f5f4', miss: '#f87171', font: 'Rajdhani' },
            metal:   { accent: '#ffb347', accent2: '#ff6b35', miss: '#ef4444', font: 'Russo One' },
        };
        let _fxPalette = _FX_PALETTES.neon;
        function _fxResolvePalette() {
            let skin = null;
            try { skin = localStorage.getItem('feedBack_notedetect_skin'); } catch (e) {}
            _fxPalette = _FX_PALETTES[skin] || _FX_PALETTES.neon;
        }
        function _fxSpawnPop(popKey, points, mult, x, y, z) {
            if (_fxSeen.has(popKey)) return;
            const nowMs = getNdFrameNowMs() || performance.now(); // DI: _ndFrameNowMs
            _fxSeen.set(popKey, nowMs + 4000);
            for (let i = 0; i < _fxPops.length; i++) {
                const p = _fxPops[i];
                if (p.active) continue;
                p.active = true;
                p.x = x; p.y = y; p.z = z;
                p.bornMs = nowMs;
                p.text = '+' + points;
                p.mult = mult || 1;
                return;
            }
        }
        function _fxSpawnBurst(nowMs) {
            for (let i = 0; i < _fxBursts.length; i++) {
                const b = _fxBursts[i];
                if (b.active) continue;
                b.active = true;
                b.bornMs = nowMs;
                for (let j = 0; j < _FX_BURST_N; j++) {
                    const a = (j / _FX_BURST_N) * Math.PI * 2;
                    const sp = 2 + (j % 5) * 0.8;
                    b.px[j] = 0; b.py[j] = 0;
                    b.vx[j] = Math.cos(a) * sp;
                    b.vy[j] = Math.sin(a) * sp - 1.2;
                }
                return;
            }
        }
        function _fxHandle(d) {
            // Reference dedup — notedetect dispatches the SAME detail object
            // on window and on its instanceRoot; whichever arrives first wins.
            if (d === _fxLastFxDetail) return;
            _fxLastFxDetail = d;
            const nowMs = performance.now();
            if (d.fxType === 'milestone') {
                _fxSpawnBurst(nowMs);
            } else if (d.fxType === 'multiplier' && d.mult > (d.prevMult || 1)) {
                _fxRingMs = nowMs;
                _fxRingMult = d.mult;
            } else if (d.fxType === 'streakBreak') {
                _fxBreakMs = nowMs;
            }
        }

        // Score FX overlay pass — "+N" pops rising off their gems, milestone
        // particle bursts / multiplier ring-pulses / streak-break flickers
        // anchored on the strike line. Same overlay layer + projection
        // pattern as drawNotedetectLabels; costs one early-out when nothing
        // is active.
        function drawScoreFx(ctx, W, H) {
            const cam = getCam();           // DI: cam
            const _probe = getProbe();      // DI: _probe
            if (!cam || !_probe) return;
            const nowMs = getNdFrameNowMs() || performance.now(); // DI: _ndFrameNowMs
            // TTL-prune the pop dedup keys (bounded: only notes hit in the
            // last few seconds).
            if (_fxSeen.size) {
                for (const [k, exp] of _fxSeen) {
                    if (exp <= nowMs) _fxSeen.delete(k);
                }
            }
            let anyPop = false;
            for (let i = 0; i < _fxPops.length; i++) {
                if (_fxPops[i].active) { anyPop = true; break; }
            }
            let anyBurst = false;
            for (let i = 0; i < _fxBursts.length; i++) {
                if (_fxBursts[i].active) { anyBurst = true; break; }
            }
            const ringAge = nowMs - _fxRingMs;
            const breakAge = nowMs - _fxBreakMs;
            if (!anyPop && !anyBurst && ringAge >= 600 && breakAge >= 350) return;

            const pal = _fxPalette;
            ctx.save();

            // Streak-break flicker: brief red wash over the whole panel.
            if (breakAge < 350) {
                const a = 0.10 * (1 - breakAge / 350);
                ctx.fillStyle = pal.miss;
                ctx.globalAlpha = a;
                ctx.fillRect(0, 0, W, H);
                ctx.globalAlpha = 1;
            }

            // Strike-line center in screen px — anchor for bursts + pulses.
            let cx = W / 2, cy = H * 0.72, centerOk = false;
            {
                const fretMidY = (sY(0) + sY(getNStr() - 1)) / 2; // DI: nStr
                _probe.set(getCurX(), fretMidY, 0);                // DI: curX
                _probe.project(cam);
                if (_probe.z >= -1 && _probe.z <= 1) {
                    cx = (_probe.x * 0.5 + 0.5) * W;
                    cy = (-_probe.y * 0.5 + 0.5) * H;
                    centerOk = true;
                }
            }

            // Multiplier ring-pulse: one expanding ring on tier-up; the ×4
            // tier pulses in the secondary accent like the HUD badge.
            if (centerOk && ringAge < 600) {
                const t = ringAge / 600;
                const ease = 1 - Math.pow(1 - t, 2);
                ctx.beginPath();
                ctx.arc(cx, cy, 20 + ease * Math.min(W, H) * 0.28, 0, Math.PI * 2);
                ctx.strokeStyle = _fxRingMult >= 4 ? pal.accent2 : pal.accent;
                ctx.globalAlpha = 0.6 * (1 - t);
                ctx.lineWidth = 3;
                ctx.stroke();
                ctx.globalAlpha = 1;
            }

            // Milestone bursts.
            if (anyBurst && centerOk) {
                for (let i = 0; i < _fxBursts.length; i++) {
                    const b = _fxBursts[i];
                    if (!b.active) continue;
                    const age = nowMs - b.bornMs;
                    if (age >= _FX_BURST_LIFE_MS) { b.active = false; continue; }
                    const t = age / _FX_BURST_LIFE_MS;
                    ctx.globalAlpha = 1 - t;
                    for (let j = 0; j < _FX_BURST_N; j++) {
                        b.px[j] += b.vx[j];
                        b.py[j] += b.vy[j];
                        b.vy[j] += 0.08;
                        ctx.fillStyle = (j & 1) ? pal.accent : pal.accent2;
                        ctx.fillRect(cx + b.px[j] - 2, cy + b.py[j] - 2, 4, 4);
                    }
                    ctx.globalAlpha = 1;
                }
            }

            // "+N" pops: rise off the gem and fade over the back half.
            if (anyPop) {
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                for (let i = 0; i < _fxPops.length; i++) {
                    const p = _fxPops[i];
                    if (!p.active) continue;
                    const age = nowMs - p.bornMs;
                    if (age >= _FX_POP_LIFE_MS) { p.active = false; continue; }
                    _probe.set(p.x, p.y, p.z);
                    _probe.project(cam);
                    if (_probe.z < -1 || _probe.z > 1) continue;
                    const t = age / _FX_POP_LIFE_MS;
                    const sx = (_probe.x * 0.5 + 0.5) * W;
                    const sy2 = (-_probe.y * 0.5 + 0.5) * H - t * 30;
                    ctx.globalAlpha = t < 0.4 ? 1 : 1 - (t - 0.4) / 0.6;
                    ctx.font = `bold ${13 + (p.mult - 1) * 2}px '${pal.font}', sans-serif`;
                    ctx.lineWidth = 4;
                    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
                    ctx.strokeText(p.text, sx, sy2);
                    ctx.fillStyle = pal.accent;
                    ctx.fillText(p.text, sx, sy2);
                }
                ctx.globalAlpha = 1;
            }

            ctx.restore();
        }

        // Score FX (notedetect ≥1.13). notedetect dispatches each fx
        // detail object twice in the same task: first explicitly on
        // window (unscoped), then as a bubbling CustomEvent from its
        // per-panel instanceRoot (scoped). Element-targeted copies are
        // authoritative — accept only the ones whose root lives in this
        // panel's container. The window copy is DEFERRED a task: by the
        // time it runs, the element copy (same detail reference) has
        // either arrived — making the window copy a duplicate to drop —
        // or it never will (detector root not attached to the DOM), in
        // which case the window copy is the compat fallback. This keeps
        // splitscreen panels from rendering each other's FX even for
        // the first event of a session.
        //
        // NOTE (verbatim-preserved): fxInit has NO re-entry guard —
        // the original screen.js init block had none. Calling fxInit()
        // twice double-registers the notedetect:fx listener. The dispatch
        // contract says to declare, not fix, this behavior here.
        function fxInit() {
            _fxResolvePalette();
            _fxOnFx = (e) => {
                const d = e && e.detail;
                if (!d) return;
                const t = e.target;
                if (t && t.parentElement) {
                    _fxElemSeen.add(d);
                    if (!getHighwayCanvas() || !t.parentElement.contains(getHighwayCanvas())) return; // DI: highwayCanvas
                    _fxHandle(d);
                    return;
                }
                const gen = _fxGen;
                setTimeout(() => {
                    if (gen !== _fxGen) return;   // torn down (or re-inited) meanwhile
                    if (_fxElemSeen.has(d)) return;
                    _fxHandle(d);
                }, 0);
            };
            window.addEventListener('notedetect:fx', _fxOnFx);
            if (window.feedBack && typeof window.feedBack.on === 'function'
                    && typeof window.feedBack.off === 'function') {
                _fxOnSkin = () => _fxResolvePalette();
                window.feedBack.on('notedetect:skin', _fxOnSkin);
            }
        }

        function fxTeardown() {
            if (_fxOnFx) { window.removeEventListener('notedetect:fx', _fxOnFx); _fxOnFx = null; }
            if (window.feedBack && typeof window.feedBack.off === 'function') {
                if (_fxOnSkin) { try { window.feedBack.off('notedetect:skin', _fxOnSkin); } catch (e) {} _fxOnSkin = null; }
            }
            for (const p of _fxPops) p.active = false;
            for (const b of _fxBursts) b.active = false;
            _fxSeen.clear();
            _fxGen++;   // invalidate any pending deferred window-copy fallbacks
            _fxLastFxDetail = null;
            _fxElemSeen = new WeakSet();
            _fxRingMs = _fxBreakMs = -1e9;
        }

    return { fxInit, fxTeardown, fxSpawnPop: _fxSpawnPop, drawScoreFx };
}
