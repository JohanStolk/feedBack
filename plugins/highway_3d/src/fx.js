// h3d-carve-8: Q-section partial — lighting/FX utilities.
// buildBoard stays in screen.js (deferred to plan §3 row 16, P-section cut)
// because its write-back surface spans 9 factory-scope vars that P/U/Y also
// own; premature extraction would require a ~50-param DI.  See plans/highway3d-carve.md.
//
// DI surface (per-call live-accessors — never cache at factory init):
//   BG_DEFAULTS, K            — plain IIFE-scope constants
//   getT                      — live-accessor (Three.js, lazy-loaded)
//   getAmbLight/getDirLight   — live-accessors (null until initScene)
//   getCinematic/getTimingFx  — live-accessors (toggle flags)
//   getSparkPts/setSparkPts   — live-accessor + setter (Points object, set by buildBoard)
//   getSparkN/getSparkPos/…   — live-accessors for particle buffers (element-mutated in place)
//   getComposer/setComposer   — getter+setter (lazy-assigned inside _bloomEnsure)
//   getBloomLoad/setBloomLoad — getter+setter (Promise, assigned inside _bloomEnsure)
//   getBloomPass/setBloomPass — getter+setter (pass object, assigned inside _bloomEnsure)
//   getBloomW/setBloomW/H     — getter+setter (dimensions, assigned inside _bloomEnsure)
//   getRen/getScene/getCam/getHighwayCanvas — live-accessors (null until initScene)
//   canvasSize                — factory-scope function ref (stable)

export function createFx({
    BG_DEFAULTS, K,
    getT,
    getAmbLight, getDirLight, getCinematic,
    getTimingFx,
    getSparkPts, setSparkPts, getSparkN,
    getSparkPos, setSparkPos, getSparkVel, setSparkVel,
    getSparkCol, setSparkCol, getSparkLife, setSparkLife,
    getComposer, setComposer,
    getBloomLoad, setBloomLoad,
    getBloomPass, setBloomPass,
    getBloomW, setBloomW, getBloomH, setBloomH,
    getRen, getScene, getCam, getHighwayCanvas,
    canvasSize,
}) {
    function _h3dHexOrDefault(hexStr, defHex) {
        // VERBATIM MOVE. BG_DEFAULTS from plain DI param.
        const d = defHex || BG_DEFAULTS.nutColor;
        const s = (typeof hexStr === 'string' && /^#[0-9a-fA-F]{6}$/.test(hexStr.trim()))
            ? hexStr.trim().toLowerCase()
            : d;
        return parseInt(s.slice(1), 16);
    }
    // Cinematic lighting (#2): darken ambient so emissive gems have a dark
    // surround to pop against; strengthen the key light for modelling.
    // Toggle via the 'cinematic' setting so it's directly comparable.
    function _applyCinematic() {
        // VERBATIM MOVE. DI rewire: ambLight/dirLight/_cinematic from live-accessors.
        const ambLight = getAmbLight(), dirLight = getDirLight(), _cinematic = getCinematic();
        if (!ambLight || !dirLight) return;
        ambLight.intensity = _cinematic ? 0.45 : 0.85;
        dirLight.intensity = _cinematic ? 1.15 : 0.8;
    }
    // #5 early/late: tint the hit feedback by timing — on-time green, early cyan,
    // late amber. Falls back to green when timing is unknown (pure-provider path).
    function _timingHex(ts) {
        // VERBATIM MOVE. DI rewire: _timingFx from getTimingFx().
        if (!getTimingFx() || !ts || ts === 'OK') return 0x22ff88;
        if (ts === 'EARLY') return 0x35d6ff;
        if (ts === 'LATE')  return 0xffb84d;
        return 0x22ff88;
    }
    function _sparkBurst(x, y, z, hex, count) {
        // VERBATIM MOVE. DI rewire: spark vars from live-accessors (per-call,
        // not cached at factory init — buildBoard may reassign the refs).
        const _sparkPts = getSparkPts();
        if (!_sparkPts || count <= 0) return;
        const _sparkPos = getSparkPos(), _sparkVel = getSparkVel(), _sparkCol = getSparkCol(), _sparkLife = getSparkLife();
        const _SPARK_N = getSparkN();
        const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255;
        let made = 0;
        for (let i = 0; i < _SPARK_N && made < count; i++) {
            if (_sparkLife[i] > 0) continue;
            const j = i * 3, ang = Math.random() * Math.PI * 2, sp = (5 + Math.random() * 12) * K;
            _sparkPos[j] = x; _sparkPos[j + 1] = y; _sparkPos[j + 2] = z;
            _sparkVel[j] = Math.cos(ang) * sp; _sparkVel[j + 1] = (12 + Math.random() * 24) * K; _sparkVel[j + 2] = Math.sin(ang) * sp * 0.55;
            _sparkCol[j] = r; _sparkCol[j + 1] = g; _sparkCol[j + 2] = b;
            _sparkLife[i] = 0.30 + Math.random() * 0.16; made++;
        }
    }
    function _sparkUpdate(dt) {
        // VERBATIM MOVE. DI rewire: spark vars from live-accessors (per-call).
        const _sparkPts = getSparkPts();
        if (!_sparkPts) return;
        const _sparkPos = getSparkPos(), _sparkVel = getSparkVel(), _sparkCol = getSparkCol(), _sparkLife = getSparkLife();
        const _SPARK_N = getSparkN();
        const grav = 55 * K; let any = false;
        for (let i = 0; i < _SPARK_N; i++) {
            if (_sparkLife[i] <= 0) continue;
            const j = i * 3;
            _sparkLife[i] -= dt;
            if (_sparkLife[i] <= 0) { _sparkCol[j] = _sparkCol[j + 1] = _sparkCol[j + 2] = 0; continue; }
            any = true;
            _sparkVel[j + 1] -= grav * dt;
            _sparkPos[j] += _sparkVel[j] * dt; _sparkPos[j + 1] += _sparkVel[j + 1] * dt; _sparkPos[j + 2] += _sparkVel[j + 2] * dt;
            const fade = 1 - Math.min(1, dt * 3.2);
            _sparkCol[j] *= fade; _sparkCol[j + 1] *= fade; _sparkCol[j + 2] *= fade;
        }
        _sparkPts.geometry.attributes.position.needsUpdate = true;
        _sparkPts.geometry.attributes.color.needsUpdate = true;
        _sparkPts.visible = any;
    }
    // #4 Bloom: lazy-load the vendored postprocessing addons and build an
    // EffectComposer (RenderPass -> UnrealBloomPass -> OutputPass/ACES). Returns
    // the composer once ready, or null (caller falls back to a direct render).
    function _bloomEnsure() {
        // VERBATIM MOVE. DI rewire: all factory-scope vars via get/set accessors.
        // _composer, _bloomLoad, _bloomPass, _bloomW, _bloomH are REASSIGNED here
        // so setters are required — these must NOT silently become locals.
        if (getComposer()) return getComposer();
        const ren = getRen(), scene = getScene(), cam = getCam();
        if (getBloomLoad() || !ren || !scene || !cam) return null;
        const T = getT(), highwayCanvas = getHighwayCanvas();
        const A = '/static/vendor/three/addons/';
        setBloomLoad(Promise.all([
            import(A + 'postprocessing/EffectComposer.js'),
            import(A + 'postprocessing/RenderPass.js'),
            import(A + 'postprocessing/UnrealBloomPass.js'),
            import(A + 'postprocessing/OutputPass.js'),
        ]).then(([EC, RP, UB, OP]) => {
            try {
                const sz = canvasSize(highwayCanvas) || { w: 1280, h: 720 };
                const w = Math.max(2, sz.w | 0), h = Math.max(2, sz.h | 0);
                // Multisampled (WebGL2 MSAA) HalfFloat target so anti-aliasing
                // survives the bloom path — EffectComposer's default target has no
                // `samples`, which is why bloom-on looked jagged (worst on non-Retina
                // DPR1 displays that have no supersampling cushion).
                const _bloomRT = new T.WebGLRenderTarget(w, h, { type: T.HalfFloatType, samples: 4 });
                const comp = new EC.EffectComposer(ren, _bloomRT);
                comp.addPass(new RP.RenderPass(scene, cam));
                const bp = new UB.UnrealBloomPass(new T.Vector2(w, h), 0.65, 0.5, 0.82); // strength, radius, threshold (high → only emissive blooms)
                setBloomPass(bp);
                comp.addPass(bp);
                comp.addPass(new OP.OutputPass());
                comp.setSize(w, h);
                setBloomW(w); setBloomH(h); setComposer(comp);
            } catch (e) { console.warn('[3D-Hwy] bloom init failed', e); setComposer(null); }
        }).catch((e) => console.warn('[3D-Hwy] bloom modules failed', e)));
        return null;
    }

    return { _h3dHexOrDefault, _applyCinematic, _timingHex, _sparkBurst, _sparkUpdate, _bloomEnsure };
}
