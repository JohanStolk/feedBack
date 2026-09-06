/* global window, document, console, localStorage, requestAnimationFrame, cancelAnimationFrame, Image, HTMLVideoElement, CustomEvent, MutationObserver, WebGL2RenderingContext, URL, performance */
import {
    geoFretX, geoFretMid, dZ, slideTrailEnd,
    camBaseDistU, camLowFretPullbackU, computeBPM,
    RENDER_ORDER_LAYER_STACK, RENDER_ORDER_LAYER_INDEX,
    RENDER_ORDER_AT_Z_ZERO, RENDER_ORDER_FAR_CLAMP,
    renderOrderForLayerAtZ, _noteKey, lowerBoundT,
    hwyFirstRelevantFrettedTime, _makeGaussTex,
} from './geometry.js';
import { T, loadThree } from './three-loader.js';

export function createSceneInit({
    // ── Constants / shorthands ───────────────────────────────────────────────
    K,
    NW, NH, ND, NFRETS,
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
    SPARK_N,
    _ND_TTL_MS, _ND_TIME_EPS,
    FRET_WIRE_HIT_HEX, FRET_WIRE_HIT_EMISSIVE, FRET_WIRE_IDLE_HEX, FRET_WIRE_IDLE_OP,
    ACCENT_RIM_BASE_EMISSIVE,
    ACCENT_HALO_OP_NEAR, ACCENT_HALO_OP_MID, ACCENT_HALO_OP_FAR,
    ACCENT_HALO_XY_INNER, ACCENT_HALO_XY_MID, ACCENT_HALO_XY_OUTER,
    ACCENT_HALO_Z_INNER, ACCENT_HALO_Z_MID, ACCENT_HALO_Z_OUTER,
    STR_THICK, FRET_BOW_DZ, FRET_TUBE_RADIUS, FRET_TUBE_SEG, FRET_TUBE_RADIAL,
    FRET_METALNESS, FRET_ROUGHNESS, FRET_EMISSIVE,
    AHEAD, TS, DOTS, DDOTS,
    // ── Stable fn-refs ───────────────────────────────────────────────────────
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
    // ── Stable const-object refs (push-into, no getter/setter) ───────────────
    _ownedSharedMats, _ownedSharedGeos,
    _imPMTechAlphaArr, _imFHTechAlphaArr,
    _imPMXFillAlphaArr, _imPMXLinesAlphaArr,
    _imFHXFillAlphaArr, _imFHXLinesAlphaArr,
    fretLastActiveTime,
    _fwHitGlow,
    _customPalette, _outlinePalette, _tuningLabelSprites,
    // ── Getters ──────────────────────────────────────────────────────────────
    getH3dFretUniform,
    getHighwayCanvas,
    getInstanceId,
    getLeftyCached,
    getNStr,
    getActivePalette,
    getTextSize,
    getGlowMul,
    getVibrancyIdleOp, getVibrancyProjOp,
    getBgReactiveOptOut,
    getVenueSceneOverride,
    // ── Getter+setter pairs (written here; read by renderer.js / teardown etc.) ─
    getWrap, setWrap,
    getRen, setRen,
    getScene, setScene,
    getCam, setCam,
    getAmbLight, setAmbLight,
    getDirLight, setDirLight,
    getFretG, setFretG,
    getTuningLblG, setTuningLblG,
    getNoteG, setNoteG,
    getBeatG, setBeatG,
    getLblG, setLblG,
    getLyricsCanvas, setLyricsCanvas, setLyricsCtx,
    getHighwayCanvas: _getHighwayCanvasAlias, setHighwayCanvas,
    getVisibilityHandler, setVisibilityHandler,
    getCanvasReplacedHandler, setCanvasReplacedHandler,
    getOnCtxLost, setOnCtxLost,
    getOnCtxRestored, setOnCtxRestored,
    setCtxLost,
    getBgGroup, setBgGroup,
    getBgListener, setBgListener,
    setProbe,
    getBgStyleId, setBgStyleId,
    getBgIntensity, setBgIntensity,
    getBgThemeId, setBgThemeId,
    getHwThemeId, setHwThemeId,
    getBgPaletteSig, setBgPaletteSig,
    setBgReactive,
    getLaneTargetColor, setLaneTargetColor,
    getBoardPlaneMat, setBoardPlaneMat,
    getHeadstockColor, setHeadstockColor,
    getNutColor, setNutColor,
    getNutHeadstockGroup, setNutHeadstockGroup,
    getNutHeadstockVisible, setNutHeadstockVisible,
    getInlayLabels, setInlayLabels,
    getInlayMats, setInlayMats,
    getInlayLabelsVisible, setInlayLabelsVisible,
    getStringLineGlows, setStringLineGlows,
    getStringLines, setStringLines,
    getProjMeshArr, setProjMeshArr,
    getBcCtrl, setBcCtrl,
    getSparkPos, setSparkPos,
    getSparkCol, setSparkCol,
    setSparkVel, setSparkLife, setSparkPts,
    getSparkPts,
    getMStr, setMStr,
    getMGlow, setMGlow,
    getMSus, setMSus,
    getMBarre, setMBarre,
    getMStrHitOutline, setMStrHitOutline,
    getMAccentOutline, setMAccentOutline,
    getMAccentCore, setMAccentCore,
    getMAccentHaloNear, setMAccentHaloNear,
    getMAccentHaloMid, setMAccentHaloMid,
    getMAccentHaloFar, setMAccentHaloFar,
    getMHitSusOutline, setMHitSusOutline,
    setMMissEdgeArrays, setMEdgeTransparent,
    getMHitBright, setMHitBright, setMHitBrightArrays,
    getMRimFlash, setMRimFlash,
    getMWhiteOutline, setMWhiteOutline,
    getMSusOutline, setMSusOutline,
    getMMissOutline, setMMissOutline,
    getMTapChevron, setMTapChevron,
    setMLaneDivider, setMLaneDividerArp, setMLaneDividerExt,
    getMLaneOdd, setMLaneOdd,
    getMLaneEven, setMLaneEven,
    setMBeatM, setMBeatQ,
    setMSusRailBase, setMSusRailBloomBase,
    setAccentShellsByString,
    getPaletteColorTmp, setPaletteColorTmp,
    getGNoteGrad, setGNoteGrad,
    getGArpBracket, setGArpBracket,
    getGHaloBar, setGHaloBar,
    getGPMXLines, setGPMXLines,
    getGFHXLines, setGFHXLines,
    getGPMXFill, setGPMXFill,
    getGFHXFill, setGFHXFill,
    setGNote, setGSus, setGBeat, setGTapChevron,
    setGLanePlane,
    setGSusRail, setGSusRailBloom, setGTechPlane, setGGhostFretPlane,
    setChordFrameGradTex, setChordFrameGradTexArp,
    getFretTubeGeo, setFretTubeGeo, setFretWireMats,
    setPNote, setPNoteEdge, setPAccentHalo,
    setPSus, setPSusOutline, setPSusRibbon, setPSusRibbonOl,
    setPLbl, setPBeat, setPSec,
    setPFretLbl, setPLane, setPLaneDivider, setPGhostFretLbl,
    setPChordBox, setPChordFrameFill, setPChordLbl, setPBarreLine, setPArpBracket,
    setPNoteFretLabel, setPTeachMarkLbl, setPConnectorLine, setPDropLine, setPFretColMarker,
    setPTapChevron, setPHaloBar, setPSusRail, setPSusRailBloom, setPTechPlane,
    setPPMXFill, setPFHXFill, setPMuteXLines, setPFHXLines,
    setImPMTech, setImFHTech,
    setImGPMTech, setImGFHTech, setImPMTechMat, setImFHTechMat,
    setImPMXFill, setImPMXLines, setImFHXFill, setImFHXLines,
    setImPMXFillMat, setImPMXLinesMat, setImFHXFillMat, setImFHXLinesMat,
    setImM4, setImPos, setImSca, setImQ, setImAZ, setImColor,
    setFwHitColor, setFwHitEmissive, setFwHitPrevTime,
    setSparks, setHitFx, setCinematic, setVerdictMarks, setTimingFx, setStreakFx, setBloom,
    setBloomGaussTex,
    setActivePalette,
    setCameraSmoothing, setZoomSmoothing, setTiltSmoothing,
    setCameraLockLow, setCameraLockZoom, setCameraMode,
    setTextSize, setVibrancy, setGlowMul, setFpsVisible,
    setVibrancyIdleOp, setVibrancyProjOp,
    setShowFretOnNote, setFretNumberGhostScope,
    setFretColumnMarkerCadence,
    setSectionLabelsOnHighway,
    setSectionHudVisible, setSectionHudPosition, setSectionHudSize,
    setToneHudVisible, setToneHudPosition, setToneHudSize,
    setChordDiagramVisible, setChordDiagramPosition, setChordDiagramSize,
    setFretDividersVisible,
    setTuningLabelsVisible,
    setProjectionVisible,
    setSlideArrowApproachVisible, setSlideArrowNeckVisible, setSlideArrowChainPreviewVisible,
    setBoardStringStartX, setBoardTuningLabelX,
    getNdOnHit, setNdOnHit,
    getNdOnMiss, setNdOnMiss,
    getNdOnBusHit, setNdOnBusHit,
    getNdOnBusMiss, setNdOnBusMiss,
    getNdHitMarks, setNdHitMarks,
    getNdMissMarks, setNdMissMarks,
    setBgLastT,
    setLastOpenStringLblSig,
    getVibrancy,
}) {
    const fretX  = f => geoFretX(f,  getH3dFretUniform());
    const fretMid = f => geoFretMid(f, getH3dFretUniform());
    const xFret    = f => (getLeftyCached() ? -fretX(f)  : fretX(f));
    const xFretMid = f => (getLeftyCached() ? -fretMid(f) : fretMid(f));
    // bgStage, bgMountedStyleId, bgState: closure-local (no cross-module readers)
    let bgStage = null;
    let bgMountedStyleId = null;
    let bgState = null;
    // bgCustomImageDataUrl/Name/VideoName: declared in factory scope but only read
    // inside the moved range — treated as closure-local in this module.
    let bgCustomImageDataUrl = '';
    let bgCustomImageName = '';
    let bgCustomVideoName = '';

        function initScene() {
            if (!getHighwayCanvas() || !getHighwayCanvas().parentNode) {
                console.error('[3D-Hwy] initScene: canvas has no parent; aborting');
                return false;
            }

            // Reset per-song lane state
            fretLastActiveTime.fill(0);

            setWrap(document.createElement('div'));
            getWrap().id = 'h3d-wrap-' + getInstanceId();
            getWrap().className = 'h3d-wrap';
            getWrap().dataset.h3dInstance = String(getInstanceId());
            getWrap().style.cssText = 'position:absolute;top:0;left:0;right:0;z-index:2;pointer-events:none;';
            // Mark this instance as the primary tour target so the tour engine
            // always spotlights a unique element (selector '.h3d-wrap[data-h3d-primary]')
            // rather than the first of potentially many splitscreen wraps.
            document.querySelectorAll('.h3d-wrap[data-h3d-primary]').forEach(
                el => el.removeAttribute('data-h3d-primary'));
            getWrap().setAttribute('data-h3d-primary', '');
            getHighwayCanvas().parentNode.insertBefore(getWrap(), getHighwayCanvas().nextSibling);

            // Subscribe to highway:visibility (feedBack#246) so the
            // .h3d-wrap overlay hides in sync with the feedBack canvas.
            // The wrap is a sibling of #highway, so display:none on
            // #highway leaves us painting full-screen otherwise.
            // Guarded lazy bind: tolerate hosts that don't yet expose
            // feedBack.on/off (older feedBack versions, headless
            // tests).
            if (window.feedBack
                && typeof window.feedBack.on === 'function'
                && typeof window.feedBack.off === 'function') {
                setVisibilityHandler((e) => {
                    if (!getWrap()) return;
                    // Filter by canvas identity (splitscreen-safe).
                    // Each createHighway() instance emits its own
                    // visibility events on the shared feedBack bus —
                    // without this gate, one hidden panel would also
                    // hide every other panel's 3D overlay.
                    if (!e || !e.detail || e.detail.canvas !== getHighwayCanvas()) return;
                    const v = e.detail.visible;
                    getWrap().style.display = v === false ? 'none' : '';
                });
                try {
                    window.feedBack.on('highway:visibility', getVisibilityHandler());
                } catch (e) {
                    setVisibilityHandler(null);
                }
                // Track canvas-replaced so the visibility handler's
                // identity gate continues to match after core swaps the
                // <canvas> element for a context-type change.
                setCanvasReplacedHandler((e) => {
                    if (!e || !e.detail) return;
                    // Only update if the swap involves OUR canvas — in
                    // splitscreen each panel has its own canvas.
                    if (e.detail.oldCanvas !== getHighwayCanvas()) return;
                    setHighwayCanvas(e.detail.newCanvas);
                    // Re-sync wrap visibility from the new canvas in
                    // case its initial displayed-state differs.
                    if (getWrap()) {
                        const v = getHighwayCanvas() && getHighwayCanvas().offsetParent !== null;
                        getWrap().style.display = v ? '' : 'none';
                    }
                });
                try {
                    window.feedBack.on('highway:canvas-replaced', getCanvasReplacedHandler());
                } catch (e) {
                    setCanvasReplacedHandler(null);
                }
                // Sync once at bind time: the event is transition-only,
                // so if the canvas was already hidden when we mounted
                // (e.g. plugin loaded while splitscreen was active),
                // we'd never receive an emit and would leave the wrap
                // visible. Compute from the local highwayCanvas (not
                // window.highway.isVisible) so splitscreen panels get
                // their own per-instance answer instead of inheriting
                // the main highway's state.
                if (getVisibilityHandler()) {
                    try {
                        const initialVisible = getHighwayCanvas()
                            && getHighwayCanvas().offsetParent !== null;
                        getWrap().style.display = initialVisible ? '' : 'none';
                    } catch (e) { /* ignore — initial sync is best-effort */ }
                }
            }

            // powerPreference hints the platform to use the discrete /
            // high-performance GPU and a higher power profile for this WebGL
            // context. On laptops / iGPU+dGPU machines (Windows, macOS) it
            // steers GPU selection to the dGPU; on single-dGPU desktops it
            // requests the high-performance power profile. (It does not by
            // itself force NVIDIA's utilisation-driven clock ramp on Linux.)
            setRen(new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: true }));
            setProbe(new T.Vector3());
            getRen().setClearColor(0x101820, _bcActive() ? 0 : 1);
            getWrap().appendChild(getRen().domElement);

            // WebGL context-loss recovery (see the _ctxLost declaration). Bound
            // on Three's own canvas — the context that actually resets on a GPU
            // reset / alt-tab. preventDefault() keeps the context restorable
            // instead of letting the loss escalate to a render-process crash;
            // _ctxLost then makes draw() bail so no GL work runs on the dead
            // context; on restore we reset the viewport and resume (Three
            // re-uploads geometry/materials/textures lazily on the next render).
            setOnCtxLost((e) => {
                if (e && typeof e.preventDefault === 'function') e.preventDefault();
                setCtxLost(true);
                console.warn('[3D-Hwy] WebGL context lost — pausing render until it is restored.');
            });
            setOnCtxRestored(() => {
                setCtxLost(false);
                console.warn('[3D-Hwy] WebGL context restored — resuming render.');
                try { const s = canvasSize(getHighwayCanvas()); if (s.w > 0 && s.h > 0) applySize(s.w, s.h); } catch (err) {}
            });
            getRen().domElement.addEventListener('webglcontextlost', getOnCtxLost(), false);
            getRen().domElement.addEventListener('webglcontextrestored', getOnCtxRestored(), false);

            setLyricsCanvas(document.createElement('canvas'));
            getLyricsCanvas().style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:1;';
            setLyricsCtx(getLyricsCanvas().getContext('2d'));
            getWrap().appendChild(getLyricsCanvas());

            setScene(new T.Scene());
            getScene().fog = new T.Fog(0x101820, FOG_START * 0.8, FOG_END * 1.2);

            setCam(new T.PerspectiveCamera(BASE_VFOV, 1, 0.01, FOG_END * 3));

            setAmbLight(new T.AmbientLight(0xffffff, 0.85));
            getScene().add(getAmbLight());
            setDirLight(new T.DirectionalLight(0xffffff, 0.8));
            getDirLight().position.set(40 * K, 120 * K, 80 * K);
            getScene().add(getDirLight());
            _applyCinematic();

            setFretG(new T.Group()); getScene().add(getFretG());
            setTuningLblG(new T.Group()); getScene().add(getTuningLblG());
            setNoteG(new T.Group()); getScene().add(getNoteG());
            // Hit sparks (#3): a pooled additive Points cloud; a small burst fires at a
            // gem on a verified hit (spawned in the verdict block, advanced in the render loop).
            setSparkPos(new Float32Array(SPARK_N * 3)); setSparkCol(new Float32Array(SPARK_N * 3));
            setSparkVel(new Float32Array(SPARK_N * 3)); setSparkLife(new Float32Array(SPARK_N));
            {
                const sg = new T.BufferGeometry();
                sg.setAttribute('position', new T.BufferAttribute(getSparkPos(), 3).setUsage(T.DynamicDrawUsage));
                sg.setAttribute('color', new T.BufferAttribute(getSparkCol(), 3).setUsage(T.DynamicDrawUsage));
                const sm = new T.PointsMaterial({ size: 1.0 * K, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true });
                setSparkPts(new T.Points(sg, sm)); getSparkPts().frustumCulled = false; getSparkPts().renderOrder = 8;
                getScene().add(getSparkPts());
            }
            setBeatG(new T.Group()); getScene().add(getBeatG());
            setLblG(new T.Group()); getScene().add(getLblG());

            // Rectangular note geometry
            const _gNote = new T.BoxGeometry(NW, NH, ND);
            setGNote(_gNote);
            // Per-string vertical gradient gems — colours sampled from the
            // original colour PNGs (top highlight → deeper bottom). Each gradient
            // string gets its own BoxGeometry clone carrying a per-vertex colour
            // attribute; the gem core swaps to gNoteGrad[s] in drawNote while its
            // material (mStr[s]) is white + vertexColors:true so the gradient
            // shows pure. Strings 6/7 have no entry and fall back to flat gNote.
            setGNoteGrad(DEFAULT_GEM_GRADIENTS.map(([topHex, botHex]) => {
                const g = new T.BoxGeometry(NW, NH, ND);
                const _pos = g.attributes.position;
                const _colors = new Float32Array(_pos.count * 3);
                const _topCol = new T.Color(topHex);
                const _botCol = new T.Color(botHex);
                const _tmpCol = new T.Color();
                const _halfH = NH / 2;
                for (let i = 0; i < _pos.count; i++) {
                    const t = (_pos.getY(i) + _halfH) / (2 * _halfH); // 0 bottom..1 top
                    _tmpCol.copy(_botCol).lerp(_topCol, t);
                    _colors[i * 3] = _tmpCol.r;
                    _colors[i * 3 + 1] = _tmpCol.g;
                    _colors[i * 3 + 2] = _tmpCol.b;
                }
                g.setAttribute('color', new T.BufferAttribute(_colors, 3));
                _ownedSharedGeos.push(g);
                return g;
            }));
            // Seed gem colors from whatever palette is active at mount (custom
            // colors recolor the gem bodies just like the strings/trails).
            _recolorGemGradients();

            /** Filled ring matching flying-note outline (1.1) minus core (1.0); hollow centre. */
            function mkGhostFrameGeometry() {
                const ow = NW * 1.1;
                const oh = NH * 1.1;
                const iw = NW;
                const ih = NH;
                const depth = ND * 2.8;
                const shape = new T.Shape();
                shape.moveTo(-ow / 2, -oh / 2);
                shape.lineTo(-ow / 2, oh / 2);
                shape.lineTo(ow / 2, oh / 2);
                shape.lineTo(ow / 2, -oh / 2);
                shape.lineTo(-ow / 2, -oh / 2);
                const hole = new T.Path();
                hole.moveTo(-iw / 2, -ih / 2);
                hole.lineTo(iw / 2, -ih / 2);
                hole.lineTo(iw / 2, ih / 2);
                hole.lineTo(-iw / 2, ih / 2);
                hole.lineTo(-iw / 2, -ih / 2);
                shape.holes.push(hole);
                const g = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
                g.translate(0, 0, -depth / 2);
                return g;
            }

            const _gSus = new T.BoxGeometry(1, 1, 1);
            setGSus(_gSus);
            const _gBeat = new T.BufferGeometry().setFromPoints(
                [new T.Vector3(0, 0, 0), new T.Vector3(1, 0, 0)],
            );
            setGBeat(_gBeat);
            // Tap chevron (open V pointing downward) — filled outline for extrusion into a solid mesh

            const chevronShape = new T.Shape();

            // Adjusting points for a "stubby" look
            // Width: increased to +/- 0.8 for a broader look
            // Height: capped at 0.2 to make it significantly shorter
            chevronShape.moveTo(-0.6, 0.3); // Top left point (further out, lower down);
            chevronShape.lineTo(0, -0.1); // Interior vertex (shallower V);
            chevronShape.lineTo(0.6, 0.3); // Top right point (further out, lower down);

            chevronShape.lineTo(0.8, 0.0); // Right outer thickness point;
            chevronShape.lineTo(0, -0.3); // Bottom vertex / Outer point (less deep);
            chevronShape.lineTo(-0.8, 0.0); // Left outer thickness point;

            chevronShape.closePath();

            // Create the 3D mesh geometry with a small depth
            const _gTapChevron = new T.ExtrudeGeometry(chevronShape, {
                depth: 0.04 * K,
                bevelEnabled: false,
            });
            setGTapChevron(_gTapChevron);

            // Optional: Center the geometry if the pivot point feels off
            _gTapChevron.computeBoundingBox();
            const centerOffset = -0.5 * (_gTapChevron.boundingBox.max.y + _gTapChevron.boundingBox.min.y);
            _gTapChevron.translate(0, centerOffset, 0);

            // String materials. Strings 0..5 use a per-vertex gradient (color is
            // white so the gradient baked into gNoteGrad[s] shows pure); strings
            // 6/7 keep a flat colour (vertexColors:false ignores the attribute).
            setMStr(getActivePalette().map((c, i) => new T.MeshBasicMaterial({
                color: i < 6 ? 0xffffff : c,
                vertexColors: i < 6,
                transparent: true, opacity: 1.0,
            })));
            setMGlow(getActivePalette().map(c => new T.MeshLambertMaterial({
                color: 0xffffff, emissive: c, emissiveIntensity: 1.5,
                transparent: true, opacity: 1.0, depthWrite: false,
            })));
            setLaneTargetColor(new T.Color(0x4488ff));
            setFwHitColor(new T.Color(FRET_WIRE_HIT_HEX));
            setFwHitEmissive(new T.Color(FRET_WIRE_HIT_EMISSIVE));
            _fwHitGlow.fill(0);
            setFwHitPrevTime(-Infinity);
            setMSus(getActivePalette().map(c => new T.MeshLambertMaterial({
                color: c, transparent: true, opacity: 0.35,
            })));
            setMWhiteOutline(new T.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6, transparent: true, opacity: 1.0, depthWrite: false }));
            const _outlineColors = [0xFF5552, 0xFFF352, 0x31CAFF, 0xFFAE31, 0x84FF42, 0xE639FF];
            const _outlinePalette = getActivePalette().map((c, i) => _outlineColors[i] ?? c);
            setMStrHitOutline(_outlinePalette.map(c => new T.MeshLambertMaterial({
                color: c, emissive: c, emissiveIntensity: 1.0,
                transparent: true, opacity: 1.0, depthWrite: false,
            })));
            // Stronger coloured rim + body for accented notes (.ac); drawNote swaps these in behind ND hit/miss.
            setMAccentOutline(getActivePalette().map(c => new T.MeshLambertMaterial({
                color: c, emissive: c, emissiveIntensity: ACCENT_RIM_BASE_EMISSIVE,
                transparent: true, opacity: 1.0, depthWrite: false,
            })));
            // Same colour response as mGlow (vibrancy lerp) but separate emissive drive for extra accent punch.
            setMAccentCore(getActivePalette().map(c => new T.MeshLambertMaterial({
                color: 0xffffff, emissive: c, emissiveIntensity: 1.5,
                transparent: true, opacity: 1.0, depthWrite: false,
            })));
            const mkAccentHaloMats = (baseOp) => getActivePalette().map(c => new T.MeshBasicMaterial({
                color: new T.Color(c),
                transparent: true,
                opacity: baseOp,
                depthWrite: false,
                depthTest: true,
                blending: T.AdditiveBlending,
                side: T.DoubleSide, forceSinglePass: true,
                fog: true,
            }));
            setMAccentHaloNear(mkAccentHaloMats(ACCENT_HALO_OP_NEAR));
            setMAccentHaloMid(mkAccentHaloMats(ACCENT_HALO_OP_MID));
            setMAccentHaloFar(mkAccentHaloMats(ACCENT_HALO_OP_FAR));
            // Frozen per-string shell descriptors — see _accentShellsByString
            // declaration. Materials live for the renderer's lifetime, so
            // these refs stay valid until teardown() clears them.
            setAccentShellsByString(getMAccentHaloFar().map((_, s) => Object.freeze([
                Object.freeze({ mat: getMAccentHaloFar()[s],  ixy: ACCENT_HALO_XY_OUTER, iz: ACCENT_HALO_Z_OUTER, zK: 0.012 }),
                Object.freeze({ mat: getMAccentHaloMid()[s],  ixy: ACCENT_HALO_XY_MID,   iz: ACCENT_HALO_Z_MID,   zK: 0.008 }),
                Object.freeze({ mat: getMAccentHaloNear()[s], ixy: ACCENT_HALO_XY_INNER, iz: ACCENT_HALO_Z_INNER, zK: 0.005 }),
            ])));
            // Chord/arpeggio frame accent bloom — single gradient bar geometry.
            // The 4 bloom shells (expand=1.00/1.10/1.25/1.45, op=0.90/0.65/0.38/0.18)
            // are baked into vertex colours as their additive sum at each Y level,
            // so one mesh per bar replaces 4 per-shell meshes (16→4 draw calls/chord).
            // Normalised Y = ±(expand / EXPAND_MAX); EXPAND_MAX = 1.45.
            // Values > 1.0 in the Float32Array buffer are intentional: WebGL passes
            // them to the shader unchanged, and additive blending clips naturally.
            if (!getGHaloBar()) {
                // Y levels (normalised): ±(shell_expand / 1.45)
                //   ±0.690 = shell 1 edge  ±0.759 = shell 2  ±0.862 = shell 3  ±1.0 = shell 4
                // Brightness = additive sum of all shells covering that band:
                //   |y| < 0.690 → all 4: 0.90+0.65+0.38+0.18 = 2.11
                //   |y| < 0.759 → 3 shells: 0.65+0.38+0.18 = 1.21
                //   |y| < 0.862 → 2 shells: 0.38+0.18 = 0.56
                //   |y| ≤ 1.000 → shell 4 only: 0.18
                // prettier-ignore
                const YS = [-1.000, -0.862, -0.759, -0.690,  0.690, 0.759, 0.862, 1.000];
                // prettier-ignore
                const BS = [ 0.18,   0.56,   1.21,   2.11,   2.11,  1.21,  0.56,  0.18 ];
                const N = YS.length;
                const pos = new Float32Array(N * 2 * 3);
                const col = new Float32Array(N * 2 * 3);
                const idx = new Uint16Array((N - 1) * 6);
                for (let i = 0; i < N; i++) {
                    const y = YS[i], b = BS[i];
                    const li = (i * 2 + 0) * 3, ri = (i * 2 + 1) * 3;
                    pos[li]=-1; pos[li+1]=y; pos[li+2]=0;
                    col[li]=b; col[li+1]=b; col[li+2]=b;
                    pos[ri]=+1; pos[ri+1]=y; pos[ri+2]=0;
                    col[ri]=b; col[ri+1]=b; col[ri+2]=b;
                }
                for (let i = 0; i < N - 1; i++) {
                    const ii = i * 6, v = i * 2;
                    idx[ii+0]=v+0; idx[ii+1]=v+1; idx[ii+2]=v+3;
                    idx[ii+3]=v+0; idx[ii+4]=v+3; idx[ii+5]=v+2;
                }
                setGHaloBar(new T.BufferGeometry());
                getGHaloBar().setAttribute('position', new T.BufferAttribute(pos, 3));
                getGHaloBar().setAttribute('color',    new T.BufferAttribute(col, 3));
                getGHaloBar().setIndex(new T.BufferAttribute(idx, 1));
            }
            const _pHaloBar = pool(getNoteG(), () => new T.Mesh(
                getGHaloBar(),
                new T.MeshBasicMaterial({
                    vertexColors: true,
                    transparent: true, opacity: 1.0, depthWrite: false,
                    blending: T.AdditiveBlending, side: T.DoubleSide, forceSinglePass: true, fog: false,
                }),
            ));
            setPHaloBar(_pHaloBar);
            // Notedetect feedback outline (issue #9): hot magenta-red (0xff0066, hue
            // ~345°) — distinct from the string red 0xff2828 at hue ~0°. Note rendering
            // swaps its outline.material between mWhiteOutline / per-string
            // mHitBright[s] / mMissOutline based on recent notedetect events.
            setMMissOutline(new T.MeshLambertMaterial({ color: 0xff0066, emissive: 0xff0066, emissiveIntensity: 1.2, transparent: true, opacity: 1.0, depthWrite: false }));
            // Transparent placeholder for front (+Z, group 4) and back (-Z, group 5)
            // of the lateral face-fill material array. Also the default material for
            // the pNoteEdge pool: pool consumers reassign .material before render, so
            // the placeholder is never displayed — using an explicitly-invisible
            // material makes that intent obvious.
            // BoxGeometry group order: 0=+X, 1=-X, 2=+Y, 3=-Y, 4=+Z(front), 5=-Z(back)
            const __mEdgeTransparent = new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
            setMEdgeTransparent(__mEdgeTransparent);
            // mMissEdgeArrays: use mMissOutline (same Lambert+emissive material as the gem
            // border) so the lateral face fill matches the outline colour exactly.
            setMMissEdgeArrays([getMMissOutline(), getMMissOutline(), getMMissOutline(), getMMissOutline(), __mEdgeTransparent, __mEdgeTransparent]);

            // Hit: fixed neon spring-green on every string — 0x22ff88 is cyan-shifted
            // enough to be readable even on the green string (0x30d040). The outline
            // + lateral faces flash green regardless of which string was hit.
            setMHitBright(getActivePalette().map(() => new T.MeshLambertMaterial({
                color: 0x22ff88, emissive: 0x22ff88, emissiveIntensity: 4.0 * getGlowMul(),
                transparent: true, opacity: 1.0, depthWrite: false,
            })));
            setMHitBrightArrays(getMHitBright().map(m => [m, m, m, m, __mEdgeTransparent, __mEdgeTransparent]));

            // Rim flash: string-coloured, wire-fashion intensity. Colour and
            // emissive both take the palette colour so the rim reads as the
            // string lighting up, not as a white wash over it.
            setMRimFlash(getActivePalette().map((c) => new T.MeshLambertMaterial({
                color: c, emissive: c, emissiveIntensity: 1,
                transparent: true, opacity: 1.0, depthWrite: false,
            })));
            // Readability (#2 / charrette): the note gems + their outlines punch THROUGH
            // the distance fog so upcoming notes stay legible as they render in at the
            // horizon. The board, lane, sustains and background scenery keep their
            // atmospheric fog — only the note-defining materials are exempted, so the
            // highway still reads as deep while the notes never dissolve into the haze.
            [getMWhiteOutline(), getMMissOutline()].forEach(m => { if (m) m.fog = false; });
            [getMStr(), getMGlow(), getMStrHitOutline(), getMHitBright(), getMRimFlash()].forEach(arr => arr && arr.forEach(m => { if (m) m.fog = false; }));
            // Outline materials render at a lower renderOrder than the body.
            // The body is rendered on top with opacity:1 on hit/miss, which
            // fully covers the outline center — only the fringe that extends
            // past the body edges (0.2*K on each side) is visible.
            setMSusOutline(new T.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.3, transparent: true, opacity: 0.75, depthWrite: false }));
            setMHitSusOutline(new T.MeshLambertMaterial({ color: 0x22ff88, emissive: 0x22ff88, emissiveIntensity: 0.8, transparent: true, opacity: 0.45, depthWrite: false }));
            setMBeatM(new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 }));
            const _mBeatQ = new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07 });
            setMBeatQ(_mBeatQ);

            // ── Board ghost: filled rim (ExtrudeGeometry w/ hole) in string colour ──
            // Matches outline 1.1× vs core 1.0× like drawNote; centre stays empty.
            // 3 slots per string (up to 3 simultaneous ghost previews, chart-
            // format style): slot 0 is the "next on string" / chord / arp ghost
            // (unchanged selection logic), slots 1/2 are independent
            // "upcoming" lead-note previews. All slots share one geometry —
            // it's identical (NW/NH/ND-based) regardless of string or slot,
            // so one ExtrudeGeometry serves all nStr*3 meshes.
            const _ghostFrameGeo = mkGhostFrameGeometry();
            setProjMeshArr(getActivePalette().map((_, s) => [0, 1, 2].map(() => {
                const mat = new T.MeshStandardMaterial({
                    color: getActivePalette()[s],
                    emissive: getActivePalette()[s],
                    emissiveIntensity: 0.002,
                    transparent: true,
                    opacity: 0.65,
                    roughness: 1,
                    depthWrite: false,
                    depthTest: false,
                });
                const m = new T.Mesh(_ghostFrameGeo, mat);
                m.visible = false;
                // Board projection ghost frame. depthTest:false above, so
                // renderOrder alone decides stacking — keep it above the
                // sus trails (12/13) but below note gems (20/21) so it
                // stays visible on the fretboard without covering notes.
                m.renderOrder = 14;
                getNoteG().add(m);
                return m;
            })));

            // ── Pools ──────────────────────────────────────────────────────
            const _pNote = pool(getNoteG(), () => new T.Mesh(_gNote, getMStr()[0]));
            setPNote(_pNote);
            // Pool default is the always-invisible __mEdgeTransparent — every
            // consumer reassigns .material before render (to a verdict edge
            // material array), so the placeholder is never displayed.
            const _pNoteEdge = pool(getNoteG(), () => new T.Mesh(_gNote, __mEdgeTransparent));
            setPNoteEdge(_pNoteEdge);
            const _pAccentHalo = pool(getNoteG(), () => new T.Mesh(_gNote, getMAccentHaloFar()[0]));
            setPAccentHalo(_pAccentHalo);
            const _pSus = pool(getNoteG(), () => new T.Mesh(_gSus, getMSus()[0]));
            setPSus(_pSus);
            const _pSusOutline = pool(getNoteG(), () => new T.Mesh(_gSus, getMSusOutline()));
            setPSusOutline(_pSusOutline);
            const mkSlideRibbonGeo = () => {
                const nVert = 4 * (SLIDE_RIBBON_SAMPLES + 1);
                const g = new T.BufferGeometry();
                g.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(nVert * 3), 3));
                // SLIDE_RIBBON_INDICES_ARR is the plain-Array form (see module-init
                // comment) shared across pool meshes; setIndex() rewraps it into a
                // fresh Uint16BufferAttribute per geometry, so the share is safe.
                g.setIndex(SLIDE_RIBBON_INDICES_ARR);
                // Static cross-section normals: each ring is an axis-aligned quad,
                // so vertex normals point radially in the XY plane regardless of
                // the slide's Z-direction curvature. Pre-fill once and skip the
                // per-frame computeVertexNormals() pass that previously ran on
                // every sustained-slide update (Copilot perf finding on PR #215).
                const SQRT_HALF = Math.SQRT1_2;
                const normals = new Float32Array(nVert * 3);
                for (let k = 0; k <= SLIDE_RIBBON_SAMPLES; k++) {
                    const o = k * 12;
                    // v0 (-X,-Y), v1 (+X,-Y), v2 (+X,+Y), v3 (-X,+Y)
                    normals[o]     = -SQRT_HALF; normals[o + 1]  = -SQRT_HALF; normals[o + 2]  = 0;
                    normals[o + 3] =  SQRT_HALF; normals[o + 4]  = -SQRT_HALF; normals[o + 5]  = 0;
                    normals[o + 6] =  SQRT_HALF; normals[o + 7]  =  SQRT_HALF; normals[o + 8]  = 0;
                    normals[o + 9] = -SQRT_HALF; normals[o + 10] =  SQRT_HALF; normals[o + 11] = 0;
                }
                g.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
                return g;
            };;
            // Ribbon meshes mutate vertex positions every frame in
            // slideRibbonUpdatePositions but the mesh itself stays at (0,0,0)
            // and the geometry's bounding sphere is never recomputed. With
            // frustum culling on, Three.js tests the (0,0,0)-centred bounds
            // and culls the ribbon as soon as the camera pans away from world
            // origin, so slides flicker in/out. Disable culling on these
            // meshes — the ribbon footprint is small and they're already
            // gated by t0/t1 reachability before render.
            const _pSusRibbon = pool(getNoteG(), () => {
                const m = new T.Mesh(mkSlideRibbonGeo(), getMSus()[0]);
                m.frustumCulled = false;
                return m;
            });
            setPSusRibbon(_pSusRibbon);
            const _pSusRibbonOl = pool(getNoteG(), () => {
                const m = new T.Mesh(mkSlideRibbonGeo(), getMSusOutline());
                m.frustumCulled = false;
                m.renderOrder = -3;
                return m;
            });
            setPSusRibbonOl(_pSusRibbonOl);
            // One shared material per technique-mesh type. The pool factory
            // hands out fresh meshes that all reference the same material,
            // so a dense HO/PO passage doesn't churn N MeshLambertMaterial
            // allocations and N GPU material switches.
            // Transparent + no depth write/test so the tap chevron draws in
            // the transparent pass where drawNote assigns renderOrder 1000.
            setMTapChevron(new T.MeshLambertMaterial({
                color: 0xd4d4d4,
                emissive: 0xd4d4d4,
                emissiveIntensity: 0.9,
                transparent: true,
                opacity: 0.85,
                side: T.DoubleSide, forceSinglePass: true,
                depthWrite: false,
                depthTest: false,
            }));
            const _pTapChevron = pool(getNoteG(), () => new T.Mesh(_gTapChevron, getMTapChevron()));
            setPTapChevron(_pTapChevron);
            const _pLbl = pool(getLblG(),  () => new T.Sprite(txtMat('0', '#fff', false, 'technique')));
            setPLbl(_pLbl);
            const _pBeat = pool(getBeatG(), () => new T.Line(_gBeat, _mBeatQ));
            setPBeat(_pBeat);
            const _pSec = pool(getLblG(),  () => new T.Sprite(txtMat('', '#0dd', true, 'section')));
            setPSec(_pSec);

            // Chord sustain length indicator — thin horizontal plane rails.
            // Unit plane (1×1 in XZ) laid flat; scaled to (railWidth, 1, railLen).
            // A horizontal plane seen from the camera looking down-forward is
            // face-on and has real apparent thickness — unlike T.Line (always 1px).
            // depthTest:false so they never occlude gems; renderOrder 11 places
            // them above lane dividers (2) and chord fill (10), at the same level
            // as chord frame edges (11), and BELOW sustain trails (12/13), note
            // gems (dynamic ≥50), and arp brackets (18). The bloom halo (10) sits
            // behind the core rail (11). Keeping susrail behind note sus trails
            // prevents the rail border from covering individual note tails
            // (sustain/vibrato/tremolo/bend). (Was 14/16 which rendered on top of
            // 12/13 sus trails, causing the outer border to overlap tails.)
            const _gSusRail = new T.PlaneGeometry(1, 1);
            setGSusRail(_gSusRail);
            _gSusRail.rotateX(-Math.PI / 2); // lay flat in XZ plane;
            const _mSusRailBase = new T.MeshBasicMaterial({
                color: CHORD_BOX_TEAL_HEX,
                transparent: true, opacity: 0.85,
                depthTest: false, depthWrite: false,
                fog: false, side: T.DoubleSide, forceSinglePass: true,
            });
            setMSusRailBase(_mSusRailBase);
            const _pSusRail = pool(getNoteG(), () => {
                const m = new T.Mesh(_gSusRail, _mSusRailBase.clone());
                m.renderOrder = 5; // below strings (7) so strings render on top
                return m;
            });
            setPSusRail(_pSusRail);

            // Bloom glow for chord sustain rails — wider plane with a gaussian
            // falloff texture (bright centre → transparent edges in X direction)
            // and additive blending, so it brightens whatever is behind it.
            // renderOrder 4 places it behind the core rail (5).
            const _bloomGaussTex = _makeGaussTex(T);
            setBloomGaussTex(_bloomGaussTex);
            const _gSusRailBloom = new T.PlaneGeometry(1, 1);
            setGSusRailBloom(_gSusRailBloom);
            _gSusRailBloom.rotateX(-Math.PI / 2);
            const _mSusRailBloomBase = new T.MeshBasicMaterial({
                color: CHORD_BOX_TEAL_HEX,
                map: _bloomGaussTex,
                transparent: true, opacity: 0.55,
                blending: T.AdditiveBlending,
                depthTest: false, depthWrite: false,
                fog: false, side: T.DoubleSide, forceSinglePass: true,
            });
            setMSusRailBloomBase(_mSusRailBloomBase);
            const _pSusRailBloom = pool(getNoteG(), () => {
                const m = new T.Mesh(_gSusRailBloom, _mSusRailBloomBase.clone());
                m.renderOrder = 4; // below strings (7) so strings render on top
                return m;
            });
            setPSusRailBloom(_pSusRailBloom);

            // Rotatable plane pool for technique markers (pm, mt, hm, hp, H/P, bend).
            // Unlike T.Sprite, a PlaneGeometry mesh accepts rotation.z = approachRot
            // so markers stay coplanar with the gem as it tilts from vertical to flat.
            const _gTechPlane = new T.PlaneGeometry(1, 1);
            setGTechPlane(_gTechPlane);
            const _pTechPlane = pool(getNoteG(), () => {
                const m = new T.Mesh(_gTechPlane, new T.MeshBasicMaterial({
                    transparent: true, depthTest: false, depthWrite: false, side: T.DoubleSide, forceSinglePass: true,
                }));
                m.renderOrder = 1000;
                return m;
            });
            setPTechPlane(_pTechPlane);

            // ── InstancedMesh temporaries ──────────────────────────────────────
            setImM4(new T.Matrix4());
            setImPos(new T.Vector3());
            setImSca(new T.Vector3());
            setImQ(new T.Quaternion());
            setImAZ(new T.Vector3(0, 0, 1));
            const _imColor = new T.Color();
            setImColor(_imColor);

            // ── Shared ShaderMaterial templates ───────────────────────────────
            // Vertex shader used by PM-X and FH-X on individual note gems.
            // Three.js injects `USE_INSTANCING` + `instanceMatrix` attribute
            // into the prefix when an InstancedMesh uses a ShaderMaterial.
            const _imTechVert = [
                'attribute float instanceAlpha;',
                'varying float vAlpha;',
                'varying vec2 vUv;',
                'void main() {',
                '    vUv = uv;',
                '    vAlpha = instanceAlpha;',
                '    vec4 pos = vec4(position, 1.0);',
                '    #ifdef USE_INSTANCING',
                '    pos = instanceMatrix * pos;',
                '    #endif',
                '    gl_Position = projectionMatrix * modelViewMatrix * pos;',
                '}',
            ].join('\n');
            const _imTechFrag = [
                'uniform sampler2D map;',
                'varying float vAlpha;',
                'varying vec2 vUv;',
                'void main() {',
                '    vec4 t = texture2D(map, vUv);',
                '    if (t.a * vAlpha < 0.01) discard;',
                '    gl_FragColor = vec4(t.rgb, t.a * vAlpha);',
                '}',
            ].join('\n');

            // ── PM / FH tech marker InstancedMeshes ───────────────────────────
            // Each IM gets a geometry clone so instanceAlpha is a separate buffer.
            const _mkTechIM = (spriteMat, alphaArr) => {
                const geo = _gTechPlane.clone();
                const alphaAttr = new T.InstancedBufferAttribute(alphaArr, 1);
                alphaAttr.setUsage(T.DynamicDrawUsage);
                geo.setAttribute('instanceAlpha', alphaAttr);
                const mat = new T.ShaderMaterial({
                    uniforms: { map: { value: spriteMat.map } },
                    vertexShader: _imTechVert,
                    fragmentShader: _imTechFrag,
                    transparent: true, depthTest: false, depthWrite: false, side: T.DoubleSide, forceSinglePass: true,
                });
                const im = new T.InstancedMesh(geo, mat, IM_TECH_CAP);
                im.instanceMatrix.setUsage(T.DynamicDrawUsage);
                im.frustumCulled = false;
                im.count = 0;
                getNoteG().add(im);
                return { im, geo, mat };
            };;
            { const r = _mkTechIM(palmMuteXSpriteMat(),    _imPMTechAlphaArr);;
              r.im.renderOrder = 702; setImPMTech(r.im); setImGPMTech(r.geo); setImPMTechMat(r.mat); }
            { const r = _mkTechIM(fretHandMuteXSpriteMat(), _imFHTechAlphaArr);;
              r.im.renderOrder = 700; setImFHTech(r.im); setImGFHTech(r.geo); setImFHTechMat(r.mat); }

            // Dynamic fret number labels (heat-coloured, updated each frame)
            const _pFretLbl = pool(getLblG(), () => new T.Sprite(txtMat('0', '#888', false, 'fretRow')));
            setPFretLbl(_pFretLbl);

            // Highlight lane plane over active fret range. With the anchor-driven
            // segmented lanes we render up to fret-count × HWY_LANE_TIME_SLICES (96)
            // pLane meshes per frame, so:
            //   - geometry is a shared PlaneGeometry(1,1) (was per-mesh, never differed)
            //   - 2 shared MeshBasicMaterials (odd / even stripe colour) replace the
            //     per-mesh material clones; the per-frame opacity still travels via
            //     the materials but is set once outside the inner loop, not per-mesh.
            const _gLanePlane = new T.PlaneGeometry(1, 1);
            setGLanePlane(_gLanePlane);
            const _mLaneOdd = new T.MeshBasicMaterial({
                color: HWY_LANE_STRIPE_ODD_HEX, transparent: true, opacity: 0, depthWrite: false,
            });
            setMLaneOdd(_mLaneOdd);
            const _mLaneEven = new T.MeshBasicMaterial({
                color: HWY_LANE_STRIPE_EVEN_HEX, transparent: true, opacity: 0, depthWrite: false,
            });
            setMLaneEven(_mLaneEven);
            // Tracked for explicit disposal in teardown — these materials may
            // not be reachable via scene.traverse() if no lane was ever rendered.
            _ownedSharedMats.push(_mLaneOdd, _mLaneEven);
            _ownedSharedGeos.push(_gLanePlane);
            const _pLane = pool(getNoteG(), () => new T.Mesh(_gLanePlane, _mLaneOdd));
            setPLane(_pLane);

            const _gGhostFretPlane = new T.PlaneGeometry(1, 1);
            setGGhostFretPlane(_gGhostFretPlane);
            _ownedSharedGeos.push(_gGhostFretPlane);
            const mGhostFretLblPh = new T.MeshBasicMaterial({
                color: 0xffffff, transparent: true, depthTest: false, depthWrite: false,
            });
            _ownedSharedMats.push(mGhostFretLblPh);
            const _pGhostFretLbl = pool(getNoteG(), () => {
                const m = new T.Mesh(_gGhostFretPlane, mGhostFretLblPh);
                // Must be above the proj frame (renderOrder=14) and opaque
                // geometry — same contract as technique labels (renderOrder=1000):
                // depthTest:false alone is insufficient, renderOrder=1000 needed.
                m.renderOrder = 1000;
                m.frustumCulled = false;
                return m;
            });
            setPGhostFretLbl(_pGhostFretLbl);

            // Vertical fret dividers within active lane
            const gLaneDivider = new T.BoxGeometry(0.15 * K, 0.15 * K, 1);
            const _mLaneDivider = new T.MeshBasicMaterial({
                color: 0x46DDE6, transparent: true, opacity: 1.00, fog: false, depthWrite: false,
            });
            setMLaneDivider(_mLaneDivider);
            const _mLaneDividerArp = new T.MeshBasicMaterial({
                color: ARPEGGIO_RIM_BLUE_HEX,
                transparent: true, opacity: 0.08, fog: false, depthWrite: false,
            });
            setMLaneDividerArp(_mLaneDividerArp);
            const _mLaneDividerExt = new T.MeshBasicMaterial({
                color: 0x364D5F, transparent: true, opacity: 0.4, fog: false, depthWrite: false,
            });
            setMLaneDividerExt(_mLaneDividerExt);
            _ownedSharedMats.push(_mLaneDivider, _mLaneDividerArp, _mLaneDividerExt);
            const _pLaneDivider = pool(getNoteG(), () => new T.Mesh(gLaneDivider, _mLaneDivider));
            setPLaneDivider(_pLaneDivider);

            // Chord frame palette (frame alpha 128, fill gradient alpha 32; MeshBasic).
            const chR = CHORD_BOX_TEAL_HEX >> 16 & 255;
            const chG = CHORD_BOX_TEAL_HEX >> 8 & 255;
            const chB = CHORD_BOX_TEAL_HEX & 255;
            const dkR = CHORD_BOX_TEAL_DARK_HEX >> 16 & 255;
            const dkG = CHORD_BOX_TEAL_DARK_HEX >> 8 & 255;
            const dkB = CHORD_BOX_TEAL_DARK_HEX & 255;
            const aFill = Math.round(CHORD_BOX_FILL_GRAD_ALPHA * 255);
            const _chordFrameGradTex = new T.DataTexture(
                new Uint8Array([ chR, chG, chB, aFill, dkR, dkG, dkB, aFill, chR, chG, chB, aFill ]),
                3, 1, T.RGBAFormat);
            setChordFrameGradTex(_chordFrameGradTex);
            _chordFrameGradTex.magFilter = T.LinearFilter;
            _chordFrameGradTex.minFilter = T.LinearFilter;
            _chordFrameGradTex.wrapS = T.ClampToEdgeWrapping;
            _chordFrameGradTex.wrapT = T.ClampToEdgeWrapping;
            // DataTexture defaults to linear color space; flag this gradient
            // as sRGB so the chord-box hex values match other sRGB color textures.
            _chordFrameGradTex.colorSpace = T.SRGBColorSpace;
            _chordFrameGradTex.needsUpdate = true;

            const arR = ARPEGGIO_BOX_BLUE_HEX >> 16 & 255;
            const arG = ARPEGGIO_BOX_BLUE_HEX >> 8 & 255;
            const arB = ARPEGGIO_BOX_BLUE_HEX & 255;
            const arDR = ARPEGGIO_BOX_BLUE_DARK_HEX >> 16 & 255;
            const arDG = ARPEGGIO_BOX_BLUE_DARK_HEX >> 8 & 255;
            const arDB = ARPEGGIO_BOX_BLUE_DARK_HEX & 255;
            const _chordFrameGradTexArp = new T.DataTexture(
                new Uint8Array([ arR, arG, arB, aFill, arDR, arDG, arDB, aFill, arR, arG, arB, aFill ]),
                3, 1, T.RGBAFormat);
            setChordFrameGradTexArp(_chordFrameGradTexArp);
            _chordFrameGradTexArp.magFilter = T.LinearFilter;
            _chordFrameGradTexArp.minFilter = T.LinearFilter;
            _chordFrameGradTexArp.wrapS = T.ClampToEdgeWrapping;
            _chordFrameGradTexArp.wrapT = T.ClampToEdgeWrapping;
            _chordFrameGradTexArp.colorSpace = T.SRGBColorSpace;
            _chordFrameGradTexArp.needsUpdate = true;

            const _pChordFrameFill = pool(getNoteG(), () => new T.Mesh(
                new T.PlaneGeometry(1, 1),
                new T.MeshBasicMaterial({
                    map: _chordFrameGradTex,
                    transparent: true,
                    opacity: 1,
                    depthWrite: false,
                    depthTest: false,
                    fog: false,
                    side: T.DoubleSide, forceSinglePass: true,
                }),
            ));
            setPChordFrameFill(_pChordFrameFill);
            const _pChordBox = pool(getNoteG(), () => new T.Mesh(
                new T.BoxGeometry(1, 1, 1),
                new T.MeshBasicMaterial({
                    color: CHORD_BOX_TEAL_HEX,
                    transparent: true,
                    opacity: CHORD_BOX_EDGE_ALPHA,
                    depthWrite: false,
                    depthTest: false,
                    fog: false,
                    side: T.DoubleSide, forceSinglePass: true,
                }),
            ));
            setPChordBox(_pChordBox);

            // PM strum X fill — 4 corner regions + centre; the 4 arms (L,R,T,B) are left empty.
            // 16 vertices, 14 triangles.
            //  0=A(-1,1)  1=TLC(-0.48,1)  2=T(-0.012,0.257)  3=TRC(0.5,1)
            //  4=BR(1,1)  5=REB(1,0.5)   6=R(0.476,-0.011)  7=RET(1,-0.5)
            //  8=C(1,-1)  9=BRC(0.48,-1) 10=B(-0.003,-0.276) 11=BLC(-0.48,-1)
            // 12=D(-1,-1) 13=LET(-1,-0.5) 14=L(-0.494,-0.011) 15=LEB(-1,0.5)
            {
                // prettier-ignore
                const pos = new Float32Array([
                    -1,      1,      0,  //  0  A
                    -0.480,  1,      0,  //  1  TLC
                    -0.012,  0.257,  0,  //  2  T
                     0.500,  1,      0,  //  3  TRC
                     1,      1,      0,  //  4  BR
                     1,      0.5,    0,  //  5  REB
                     0.476, -0.011,  0,  //  6  R
                     1,     -0.5,    0,  //  7  RET
                     1,     -1,      0,  //  8  C
                     0.480, -1,      0,  //  9  BRC
                    -0.003, -0.276,  0,  // 10  B
                    -0.480, -1,      0,  // 11  BLC
                    -1,     -1,      0,  // 12  D
                    -1,     -0.5,    0,  // 13  LET
                    -0.494, -0.011,  0,  // 14  L
                    -1,      0.5,    0,  // 15  LEB
                ]);
                // prettier-ignore
                const idx = new Uint16Array([
                    // top-left corner: A,TLC,T,L,LEB
                     0,  1,  2,
                     0,  2, 14,
                     0, 14, 15,
                    // top-right corner: TRC,BR,REB,R,T
                     3,  4,  5,
                     3,  5,  6,
                     3,  6,  2,
                    // centre: T,R,B,L
                     2,  6, 10,
                     2, 10, 14,
                    // bottom-right corner: RET,C,BRC,B,R
                     7,  8,  9,
                     7,  9, 10,
                     7, 10,  6,
                    // bottom-left corner: LET,L,B,BLC,D
                    13, 14, 10,
                    13, 10, 11,
                    13, 11, 12,
                ]);
                setGPMXFill(new T.BufferGeometry());
                getGPMXFill().setAttribute('position', new T.BufferAttribute(pos, 3));
                getGPMXFill().setIndex(new T.BufferAttribute(idx, 1));
            }
            // PM fill — InstancedMesh (black, varying alpha per chord).
            {
                const _imFillVert = [
                    'attribute float instanceAlpha;',
                    'varying float vAlpha;',
                    'void main() {',
                    '    vAlpha = instanceAlpha;',
                    '    vec4 pos = vec4(position, 1.0);',
                    '    #ifdef USE_INSTANCING',
                    '    pos = instanceMatrix * pos;',
                    '    #endif',
                    '    gl_Position = projectionMatrix * modelViewMatrix * pos;',
                    '}',
                ].join('\n');
                const _imFillFrag = [
                    'varying float vAlpha;',
                    'void main() {',
                    '    if (vAlpha <= 0.0) discard;',
                    '    gl_FragColor = vec4(0.0, 0.0, 0.0, vAlpha);',
                    '}',
                ].join('\n');
                const alphaAttr = new T.InstancedBufferAttribute(_imPMXFillAlphaArr, 1);
                alphaAttr.setUsage(T.DynamicDrawUsage);
                getGPMXFill().setAttribute('instanceAlpha', alphaAttr);
                const _imPMXFillMat = new T.ShaderMaterial({
                    vertexShader: _imFillVert, fragmentShader: _imFillFrag,
                    transparent: true, depthTest: false, depthWrite: false,
                    fog: false, side: T.DoubleSide, forceSinglePass: true,
                });
                setImPMXFillMat(_imPMXFillMat);
                const _imPMXFill = new T.InstancedMesh(getGPMXFill(), _imPMXFillMat, IM_STRUM_CAP);
                setImPMXFill(_imPMXFill);
                _imPMXFill.instanceMatrix.setUsage(T.DynamicDrawUsage);
                _imPMXFill.frustumCulled = false;
                _imPMXFill.renderOrder = 10.5;
                _imPMXFill.count = 0;
                getNoteG().add(_imPMXFill);
            }

            // FH (frethand mute) strum X fill — 5 regions: 4 corner quadrants + centre diamond.
            // 12 vertices, 10 triangles. L/R wings stop at fx=±0.50 (no solid lateral blocks).
            //  0=LET(-0.50,+1)  1=TLC(-0.15,+1)  2=T(0,+0.42)   3=TRC(+0.15,+1)
            //  4=RET(+0.50,+1)  5=REB(+0.50,-1)  6=R(+0.28,0)   7=B(0,-0.42)
            //  8=BRC(+0.15,-1)  9=BLC(-0.15,-1) 10=LEB(-0.50,-1) 11=L(-0.28,0)
            {
                // prettier-ignore
                const pos = new Float32Array([
                    -0.50,  1,      0,  //  0  LET
                    -0.15,  1,      0,  //  1  TLC
                     0,     0.42,   0,  //  2  T
                     0.15,  1,      0,  //  3  TRC
                     0.50,  1,      0,  //  4  RET
                     0.50, -1,      0,  //  5  REB
                     0.28,  0,      0,  //  6  R
                     0,    -0.42,   0,  //  7  B
                     0.15, -1,      0,  //  8  BRC
                    -0.15, -1,      0,  //  9  BLC
                    -0.50, -1,      0,  // 10  LEB
                    -0.28,  0,      0,  // 11  L
                ]);
                // prettier-ignore
                const idx = new Uint16Array([
                    // top-left corner: LET,TLC,T,L
                     0,  1,  2,
                     0,  2, 11,
                    // top-right corner: TRC,RET,R,T
                     3,  4,  6,
                     3,  6,  2,
                    // bottom-right corner: REB,R,B,BRC
                     5,  6,  7,
                     5,  7,  8,
                    // bottom-left corner: LEB,L,B,BLC
                    10, 11,  7,
                    10,  7,  9,
                    // centre diamond: L,T,R,B
                    11,  2,  6,
                    11,  6,  7,
                ]);
                setGFHXFill(new T.BufferGeometry());
                getGFHXFill().setAttribute('position', new T.BufferAttribute(pos, 3));
                getGFHXFill().setIndex(new T.BufferAttribute(idx, 1));
            }
            // FH fill — InstancedMesh (black, varying alpha per chord).
            {
                const _imFillVert = [
                    'attribute float instanceAlpha;',
                    'varying float vAlpha;',
                    'void main() {',
                    '    vAlpha = instanceAlpha;',
                    '    vec4 pos = vec4(position, 1.0);',
                    '    #ifdef USE_INSTANCING',
                    '    pos = instanceMatrix * pos;',
                    '    #endif',
                    '    gl_Position = projectionMatrix * modelViewMatrix * pos;',
                    '}',
                ].join('\n');
                const _imFillFrag = [
                    'varying float vAlpha;',
                    'void main() {',
                    '    if (vAlpha <= 0.0) discard;',
                    '    gl_FragColor = vec4(0.0, 0.0, 0.0, vAlpha);',
                    '}',
                ].join('\n');
                const alphaAttr = new T.InstancedBufferAttribute(_imFHXFillAlphaArr, 1);
                alphaAttr.setUsage(T.DynamicDrawUsage);
                getGFHXFill().setAttribute('instanceAlpha', alphaAttr);
                const _imFHXFillMat = new T.ShaderMaterial({
                    vertexShader: _imFillVert, fragmentShader: _imFillFrag,
                    transparent: true, depthTest: false, depthWrite: false,
                    fog: false, side: T.DoubleSide, forceSinglePass: true,
                });
                setImFHXFillMat(_imFHXFillMat);
                const _imFHXFill = new T.InstancedMesh(getGFHXFill(), _imFHXFillMat, IM_STRUM_CAP);
                setImFHXFill(_imFHXFill);
                _imFHXFill.instanceMatrix.setUsage(T.DynamicDrawUsage);
                _imFHXFill.frustumCulled = false;
                _imFHXFill.renderOrder = 10.5;
                _imFHXFill.count = 0;
                getNoteG().add(_imFHXFill);
            }

            // PM X lines — 8 segments baked as thin quads in ±1 normalised space.
            // Scale the pool mesh by (innerW*0.5, -innerH*0.5, ...) per chord;
            // the Y-negated scale matches the XLINES convention (fya>0 = below centre).
            if (!getGPMXLines()) {
                const HT = 0.016; // normalised half-thickness ≈ lw/hH for a typical chord;
                // prettier-ignore
                const XLINES = [
                    [-1.000, -0.500, -0.494, -0.011],
                    [-1.000,  0.500, -0.494, -0.011],
                    [ 1.000, -0.500,  0.476, -0.011],
                    [ 1.000,  0.500,  0.476, -0.011],
                    [-0.480,  1.000, -0.012,  0.257],
                    [ 0.500,  1.000, -0.012,  0.257],
                    [ 0.480, -1.000,  0.000, -0.276],
                    [-0.480, -1.000, -0.006, -0.276],
                ];
                const pos = new Float32Array(XLINES.length * 4 * 3);
                const idx = new Uint16Array(XLINES.length * 6);
                for (let i = 0; i < XLINES.length; i++) {
                    const [xa, ya, xb, yb] = XLINES[i];
                    const dx = xb - xa, dy = yb - ya;
                    const il = 1 / Math.sqrt(dx * dx + dy * dy);
                    const nx = -dy * il, ny = dx * il;
                    const vi = i * 12, ii = i * 6, vb = i * 4;
                    pos[vi+0]=xa+nx*HT; pos[vi+1]=ya+ny*HT; pos[vi+2]=0;
                    pos[vi+3]=xb+nx*HT; pos[vi+4]=yb+ny*HT; pos[vi+5]=0;
                    pos[vi+6]=xb-nx*HT; pos[vi+7]=yb-ny*HT; pos[vi+8]=0;
                    pos[vi+9]=xa-nx*HT; pos[vi+10]=ya-ny*HT; pos[vi+11]=0;
                    idx[ii+0]=vb; idx[ii+1]=vb+1; idx[ii+2]=vb+2;
                    idx[ii+3]=vb; idx[ii+4]=vb+2; idx[ii+5]=vb+3;
                }
                setGPMXLines(new T.BufferGeometry());
                getGPMXLines().setAttribute('position', new T.BufferAttribute(pos, 3));
                getGPMXLines().setIndex(new T.BufferAttribute(idx, 1));
            }
            // PM lines — InstancedMesh (varying color + alpha per chord).
            // instanceColor (THREE built-in) carries baseRimHex per instance;
            // instanceAlpha carries the per-chord opacity.
            {
                const _imLinesVert = [
                    'attribute float instanceAlpha;',
                    'varying float vAlpha;',
                    'varying vec3 vColor;',
                    'void main() {',
                    '    vAlpha = instanceAlpha;',
                    '    #ifdef USE_INSTANCING_COLOR',
                    '    vColor = instanceColor;',
                    '    #else',
                    '    vColor = vec3(1.0);',
                    '    #endif',
                    '    vec4 pos = vec4(position, 1.0);',
                    '    #ifdef USE_INSTANCING',
                    '    pos = instanceMatrix * pos;',
                    '    #endif',
                    '    gl_Position = projectionMatrix * modelViewMatrix * pos;',
                    '}',
                ].join('\n');
                const _imLinesFrag = [
                    'varying float vAlpha;',
                    'varying vec3 vColor;',
                    'void main() {',
                    '    if (vAlpha <= 0.0) discard;',
                    '    gl_FragColor = vec4(vColor, vAlpha);',
                    '}',
                ].join('\n');
                const alphaAttr = new T.InstancedBufferAttribute(_imPMXLinesAlphaArr, 1);
                alphaAttr.setUsage(T.DynamicDrawUsage);
                getGPMXLines().setAttribute('instanceAlpha', alphaAttr);
                const _imPMXLinesMat = new T.ShaderMaterial({
                    vertexShader: _imLinesVert, fragmentShader: _imLinesFrag,
                    transparent: true, depthTest: false, depthWrite: false,
                    fog: false, side: T.DoubleSide, forceSinglePass: true,
                });
                setImPMXLinesMat(_imPMXLinesMat);
                const _imPMXLines = new T.InstancedMesh(getGPMXLines(), _imPMXLinesMat, IM_STRUM_CAP);
                setImPMXLines(_imPMXLines);
                _imPMXLines.instanceMatrix.setUsage(T.DynamicDrawUsage);
                _imPMXLines.frustumCulled = false;
                _imPMXLines.renderOrder = 11;
                // Eagerly initialise instanceColor so USE_INSTANCING_COLOR is
                // defined when the shader is compiled on the first draw.
                _imColor.set(1, 1, 1);
                _imPMXLines.setColorAt(0, _imColor);
                _imPMXLines.instanceColor.setUsage(T.DynamicDrawUsage);
                _imPMXLines.count = 0;
                getNoteG().add(_imPMXLines);
            }

            // FH X lines — same scheme, 8 segments from the FH_XLINES pattern
            if (!getGFHXLines()) {
                const HT = 0.022; // slightly wider — FH wings are shorter, need more visual weight;
                // prettier-ignore
                const FH_XLINES = [
                    [-0.50,  1.00, -0.28,  0.00],
                    [-0.50, -1.00, -0.28,  0.00],
                    [ 0.50,  1.00,  0.28,  0.00],
                    [ 0.50, -1.00,  0.28,  0.00],
                    [-0.15, -1.00,  0.00, -0.42],
                    [ 0.15, -1.00,  0.00, -0.42],
                    [ 0.15,  1.00,  0.00,  0.42],
                    [-0.15,  1.00,  0.00,  0.42],
                ];
                const pos = new Float32Array(FH_XLINES.length * 4 * 3);
                const idx = new Uint16Array(FH_XLINES.length * 6);
                for (let i = 0; i < FH_XLINES.length; i++) {
                    const [xa, ya, xb, yb] = FH_XLINES[i];
                    const dx = xb - xa, dy = yb - ya;
                    const il = 1 / Math.sqrt(dx * dx + dy * dy);
                    const nx = -dy * il, ny = dx * il;
                    const vi = i * 12, ii = i * 6, vb = i * 4;
                    pos[vi+0]=xa+nx*HT; pos[vi+1]=ya+ny*HT; pos[vi+2]=0;
                    pos[vi+3]=xb+nx*HT; pos[vi+4]=yb+ny*HT; pos[vi+5]=0;
                    pos[vi+6]=xb-nx*HT; pos[vi+7]=yb-ny*HT; pos[vi+8]=0;
                    pos[vi+9]=xa-nx*HT; pos[vi+10]=ya-ny*HT; pos[vi+11]=0;
                    idx[ii+0]=vb; idx[ii+1]=vb+1; idx[ii+2]=vb+2;
                    idx[ii+3]=vb; idx[ii+4]=vb+2; idx[ii+5]=vb+3;
                }
                setGFHXLines(new T.BufferGeometry());
                getGFHXLines().setAttribute('position', new T.BufferAttribute(pos, 3));
                getGFHXLines().setIndex(new T.BufferAttribute(idx, 1));
            }
            // FH lines — InstancedMesh (varying color + alpha per chord).
            {
                const _imLinesVert = [
                    'attribute float instanceAlpha;',
                    'varying float vAlpha;',
                    'varying vec3 vColor;',
                    'void main() {',
                    '    vAlpha = instanceAlpha;',
                    '    #ifdef USE_INSTANCING_COLOR',
                    '    vColor = instanceColor;',
                    '    #else',
                    '    vColor = vec3(1.0);',
                    '    #endif',
                    '    vec4 pos = vec4(position, 1.0);',
                    '    #ifdef USE_INSTANCING',
                    '    pos = instanceMatrix * pos;',
                    '    #endif',
                    '    gl_Position = projectionMatrix * modelViewMatrix * pos;',
                    '}',
                ].join('\n');
                const _imLinesFrag = [
                    'varying float vAlpha;',
                    'varying vec3 vColor;',
                    'void main() {',
                    '    if (vAlpha <= 0.0) discard;',
                    '    gl_FragColor = vec4(vColor, vAlpha);',
                    '}',
                ].join('\n');
                const alphaAttr = new T.InstancedBufferAttribute(_imFHXLinesAlphaArr, 1);
                alphaAttr.setUsage(T.DynamicDrawUsage);
                getGFHXLines().setAttribute('instanceAlpha', alphaAttr);
                const _imFHXLinesMat = new T.ShaderMaterial({
                    vertexShader: _imLinesVert, fragmentShader: _imLinesFrag,
                    transparent: true, depthTest: false, depthWrite: false,
                    fog: false, side: T.DoubleSide, forceSinglePass: true,
                });
                setImFHXLinesMat(_imFHXLinesMat);
                const _imFHXLines = new T.InstancedMesh(getGFHXLines(), _imFHXLinesMat, IM_STRUM_CAP);
                setImFHXLines(_imFHXLines);
                _imFHXLines.instanceMatrix.setUsage(T.DynamicDrawUsage);
                _imFHXLines.frustumCulled = false;
                _imFHXLines.renderOrder = 11;
                _imColor.set(1, 1, 1);
                _imFHXLines.setColorAt(0, _imColor);
                _imFHXLines.instanceColor.setUsage(T.DynamicDrawUsage);
                _imFHXLines.count = 0;
                getNoteG().add(_imFHXLines);
            }

            // Pool-based strum-indicator replacements.  The IM approach above uses
            // a fixed renderOrder per mesh type, which lets far-chord X marks overdraw
            // gems/frames of nearer chords. Pools give per-chord Z-proportional renderOrder.
            // Geometries are shared with the (now empty) IMs — MeshBasicMaterial
            // ignores the instanceAlpha / instanceColor attributes on the geometry.
            setPPMXFill(pool(getNoteG(), () => new T.Mesh(
                getGPMXFill(),
                new T.MeshBasicMaterial({
                    color: 0x000000, transparent: true, opacity: 1,
                    depthWrite: false, depthTest: false, fog: false, side: T.DoubleSide, forceSinglePass: true,
                }),
            )));
            setPFHXFill(pool(getNoteG(), () => new T.Mesh(
                getGFHXFill(),
                new T.MeshBasicMaterial({
                    color: 0x000000, transparent: true, opacity: 1,
                    depthWrite: false, depthTest: false, fog: false, side: T.DoubleSide, forceSinglePass: true,
                }),
            )));
            setPMuteXLines(pool(getNoteG(), () => new T.Mesh(
                getGPMXLines(),
                new T.MeshBasicMaterial({
                    color: 0xffffff, transparent: true, opacity: 1,
                    depthWrite: false, depthTest: false, fog: false, side: T.DoubleSide, forceSinglePass: true,
                }),
            )));
            setPFHXLines(pool(getNoteG(), () => new T.Mesh(
                getGFHXLines(),
                new T.MeshBasicMaterial({
                    color: 0xffffff, transparent: true, opacity: 1,
                    depthWrite: false, depthTest: false, fog: false, side: T.DoubleSide, forceSinglePass: true,
                }),
            )));

            const _pChordLbl = pool(getLblG(),  () => new T.Sprite(txtMat('', '#e8d080', true, 'chord').clone()));
            setPChordLbl(_pChordLbl);
            // Single shared barre material — all pool meshes reference it,
            // so _applyGlow() can mutate emissiveIntensity once and every
            // recycled / future-allocated barre mesh picks up the change.
            setMBarre(new T.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.9 * getGlowMul(), transparent: true, depthWrite: false }));
            const _pBarreLine = pool(getNoteG(), () => new T.Mesh(new T.BoxGeometry(1, 1, 1), getMBarre()));
            setPBarreLine(_pBarreLine);
            // Shared 1×1×1 box geometry — brackets can require many pooled
            // meshes per frame, so per-mesh BoxGeometry allocation would
            // duplicate buffers and create unnecessary GPU disposal work.
            // Disposed once in teardown (alongside the other shared geos).
            if (!getGArpBracket()) setGArpBracket(new T.BoxGeometry(1, 1, 1));
            const _pArpBracket = pool(getNoteG(), () => new T.Mesh(
                getGArpBracket(),
                new T.MeshBasicMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: 1.0,
                    depthWrite: false,
                    depthTest: false,
                    fog: false,
                }),
            ));
            setPArpBracket(_pArpBracket);

            // Per-note fret number below note with connector line
            const _pNoteFretLabel = pool(getLblG(), () => {
                const _nfl = new T.Sprite(txtMat('0', FRET_LABEL_GOLD_HEX, false, 'noteFret').clone());
                _nfl.material.fog = false;
                _nfl.material.depthTest = false;
                return _nfl;
            });
            setPNoteFretLabel(_pNoteFretLabel);
            // Teaching marks fg/sd labels (§6.2.2). One pool, two get()s per note
            // (finger + degree); the texture is swapped per draw via material.map.
            const _pTeachMarkLbl = pool(getLblG(), () => {
                const _tml = new T.Sprite(txtMat('0', '#7fd1ff', false, 'teachMark').clone());
                _tml.material.fog = false;
                _tml.material.depthTest = false;
                return _tml;
            });
            setPTeachMarkLbl(_pTeachMarkLbl);
            const _pConnectorLine = pool(getNoteG(), () => new T.Line(
                new T.BufferGeometry().setFromPoints([new T.Vector3(0, 0, 0), new T.Vector3(0, 1, 0)]),
                new T.LineBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.5, depthTest: false }),
            ));
            setPConnectorLine(_pConnectorLine);
            const _pDropLine = pool(getNoteG(), () => new T.Line(
                new T.BufferGeometry().setFromPoints([new T.Vector3(0, 0, 0), new T.Vector3(0, 1, 0)]),
                new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }),
            ));
            setPDropLine(_pDropLine);

            // Fret-column reference markers (visual cue for X-position to fret-number).
            // Each sprite gets its own clone so the per-frame material.map swap
            // (dark vs light grey) doesn't poison neighbours sharing the same
            // cached texture map.
            // fog:false prevents the scene fog from gradually dimming the sprite
            // as it enters the far end of the highway — opacity is managed
            // manually with a short fade-in so the number appears at its
            // final size the moment it becomes visible rather than seeming to
            // emerge from a tiny dim spec at the horizon.
            const _pFretColMarker = pool(getLblG(), () => {
                const _sp = new T.Sprite(txtMat('0', '#666666', false, 'noteFret').clone());
                // fog=false: prevents scene fog from dimming the sprite as it enters the
                // far end of the highway.  Opacity is managed by the manual fade-in ramp
                // so the number appears smoothly instead of emerging as a dim spec.
                _sp.material.fog = false;
                return _sp;
            });
            setPFretColMarker(_pFretColMarker);

            // ── Pre-warm pools (feedBack#226) ─────────────────────────────
            // Dense 7/8-string charts can outrun the lazy-grow path in the
            // first 1-2s of playback, stalling those frames with `new T.Mesh`
            // allocations *and* growing noteG forever (the pool only hides on
            // reset). Pay the cost up front instead.
            //
            // Trade-off: pre-warming attaches the same meshes to noteG even
            // on 4/6-string charts that may never use them all. The cost is
            // paid at boardInit (during the load spinner — wall-clock time
            // users were already waiting on), so the steady-state win on
            // playback FPS is worth the init-time scene-graph footprint.
            // Caps sized for a typical visible-window worst case (NOT the
            // theoretical max across MAX_RENDER_STRINGS); lazy growth past
            // the warm cap still works for genuinely dense outliers.
            const _WARM_NOTE = 48;
            const _WARM_CHORD = 12;
            const _WARM_LANE = 32;
            const _WARM_BEAT = 24;
            _pNote.warm(_WARM_NOTE);
            _pNoteEdge.warm(_WARM_NOTE);
            _pAccentHalo.warm(_WARM_NOTE);
            _pSus.warm(_WARM_NOTE);
            _pSusOutline.warm(_WARM_NOTE);
            _pSusRibbon.warm(_WARM_NOTE / 2);
            _pSusRibbonOl.warm(_WARM_NOTE / 2);
            _pTapChevron.warm(_WARM_CHORD);
            _pLbl.warm(_WARM_NOTE);
            _pSusRail.warm(_WARM_CHORD);
            _pSusRailBloom.warm(_WARM_CHORD);
            _pTechPlane.warm(_WARM_CHORD);
            _pNoteFretLabel.warm(_WARM_NOTE);
            _pTeachMarkLbl.warm(_WARM_NOTE);
            _pChordFrameFill.warm(_WARM_CHORD);
            _pChordBox.warm(_WARM_CHORD);
            _pChordLbl.warm(_WARM_CHORD);
            _pBarreLine.warm(_WARM_CHORD);
            _pArpBracket.warm(_WARM_CHORD);
            _pHaloBar.warm(_WARM_CHORD);
            _pFretLbl.warm(_WARM_LANE);
            _pLane.warm(_WARM_LANE * 2); // anchor-driven lanes × time slices;
            _pLaneDivider.warm(_WARM_LANE);
            _pGhostFretLbl.warm(_WARM_LANE);
            _pFretColMarker.warm(_WARM_LANE);
            _pConnectorLine.warm(_WARM_NOTE / 2);
            _pDropLine.warm(_WARM_NOTE / 2);
            _pBeat.warm(_WARM_BEAT);
            _pSec.warm(8);

            _bgLoadSettings();
            buildBoard();
            // Apply the scene color theme now that settings + board exist. Sets
            // the clear color + fog tint (board plane was themed in buildBoard).
            // For the default theme this is identical to the hardcoded values
            // initScene seeded above, so nothing changes for existing users.
            _applyBgTheme();

            // Background animations (#13). Read settings keyed by this
            // panel and mount the active style's meshes. Subscribe to
            // in-app settings changes (settings.html via window.h3dBgSet*)
            // so they propagate without a reload. Manual localStorage
            // edits don't fire the pub-sub and require a reload.
            // Push the freshly-loaded vibrancy/glow values into the
            // materials. _bgLoadSettings only triggers a palette re-apply
            // when the palette ID actually changed, so a fresh-init user
            // on the default palette would otherwise keep the hardcoded
            // construction-time material values until they touched a
            // slider.
            _applyVibrancy();
            _applyGlow();
            // inlayLabelsVisible was applied before buildBoard() via _bgLoadSettings.
            setBgGroup(new T.Group());
            // Note: renderOrder on a Group is a no-op (Three.js Groups
            // are transforms, not rendered objects, so renderOrder only
            // affects the actual meshes inside). _bgMountStyle stamps
            // renderOrder = -1 on every child after build, which IS what
            // forces background to render before gameplay geometry.
            // Combined with the deeper-than-note-range placements below,
            // background never paints over notes.
            getScene().add(getBgGroup());
            _bgMountStyle();
            setBgListener((changedKey) => {
                if (changedKey === 'fretSpacing') {
                    // _h3dFretUniform + the fretX-derived scalars were already
                    // updated globally in h3dSetFretSpacing. Rebuild this
                    // panel's static board geometry (fret wires, lanes, inlays)
                    // so it re-lays-out for the new spacing; per-frame note
                    // geometry reads fretX live and needs no rebuild.
                    if (getFretG()) buildBoard();
                    return;
                }
                if (changedKey === 'inlayLabelsVisible') {
                    _bgLoadSettings();
                    // Flip visibility on the already-built sprites; no
                    // need to rebuild the board (cheaper, preserves the
                    // shared materials and avoids palette re-apply churn).
                    for (const lbl of getInlayLabels()) lbl.visible = getInlayLabelsVisible();
                    return;
                }
                if (changedKey === 'nutHeadstockVisible') {
                    _bgLoadSettings();
                    if (getNutHeadstockGroup()) getNutHeadstockGroup().visible = getNutHeadstockVisible();
                    return;
                }
                if (changedKey === 'tuningLabelsVisible') {
                    _bgLoadSettings();
                    setLastOpenStringLblSig('');
                    if (_tuningLabelSprites.length) _disposeOpenStringPitchSprites();
                    return;
                }
                if (changedKey === 'nutColor' || changedKey === 'headstockColor') {
                    _bgLoadSettings();
                    if (getFretG()) buildBoard();
                    for (const lbl of getInlayLabels()) lbl.visible = getInlayLabelsVisible();
                    return;
                }
                if (changedKey === 'reactive' || changedKey === 'showFretOnNote' ||
                    changedKey === 'fretNumberGhostScope' ||
                    changedKey === 'cameraSmoothing' || changedKey === 'zoomSmoothing' ||
                    changedKey === 'tiltSmoothing' || changedKey === 'cameraLockLow' ||
                    changedKey === 'cameraLockZoom' || changedKey === 'cameraMode' ||
                    changedKey === 'textSize' ||
                    changedKey === 'chordDiagramSize' || changedKey === 'chordDiagramPosition' ||
                    changedKey === 'fretColumnMarkerCadence' ||
                    changedKey === 'sectionLabelsOnHighway' ||
                    changedKey === 'sectionHudVisible' ||
                    changedKey === 'sectionHudPosition' ||
                    changedKey === 'sectionHudSize' ||
                    changedKey === 'toneHudVisible' ||
                    changedKey === 'toneHudPosition' ||
                    changedKey === 'toneHudSize' ||
                    changedKey === 'projectionVisible' ||
                    changedKey === 'slideArrowApproachVisible' ||
                    changedKey === 'slideArrowNeckVisible' ||
                    changedKey === 'slideArrowChainPreviewVisible') {
                    // Flag flips don't need a mesh rebuild — just refresh
                    // the per-instance state for the next frame to consult.
                    // Same shape for showFretOnNote (#12), cameraSmoothing
                    // (#34), the zoom/tilt smoothing follow-ups, and
                    // cameraLockLow — all read per-frame in update() /
                    // camUpdate().
                    _bgLoadSettings();
                    return;
                }
                if (changedKey === 'vibrancy') {
                    _bgLoadSettings();
                    _applyVibrancy();
                    return;
                }
                if (changedKey === 'glow') {
                    _bgLoadSettings();
                    _applyGlow();
                    return;
                }
                if (changedKey === 'palette') {
                    // Palette change has three effects:
                    //  1. _bgLoadSettings -> _applyPaletteToMaterials
                    //     retints the per-instance shared materials
                    //     (notes, glows, sustain trails, projection).
                    //  2. buildBoard rebuilds the fretboard meshes
                    //     (LineBasicMaterial lane lines + per-string
                    //     BoxGeometry materials). These are created at
                    //     build time with palette-baked colors and
                    //     aren't reachable from _applyPaletteToMaterials.
                    //  3. lights bg style bakes palette colors into
                    //     sprite quads at build time, so it needs a
                    //     full mesh rebuild — fire _bgRebuild when
                    //     that style is active.
                    _bgLoadSettings();
                    if (getFretG()) buildBoard();
                    if (getBgStyleId() === 'lights') _bgRebuild();
                    return;
                }
                if (changedKey === 'bgTheme' || changedKey === 'hwTheme') {
                    // A scene-color axis changed (background = bgTheme:
                    // clear+fog; highway = hwTheme: board plane + lane). Recolor
                    // in place — no mesh rebuild needed (the board plane material
                    // is mutated via _boardPlaneMat, the lane via mLaneOdd/Even).
                    // _applyBgTheme reapplies both axes from their own keys, so
                    // changing one dropdown retints only its half.
                    _bgLoadSettings();
                    _applyBgTheme();
                    return;
                }
                if (changedKey === 'customImageDataUrl') {
                    // Asset bytes changed. Rebuild only when the image
                    // style is active — otherwise the new bytes will
                    // pick up next time the user picks `image`.
                    _bgLoadSettings();
                    if (getBgStyleId() === 'image') _bgRebuild();
                    return;
                }
                if (changedKey === 'customImageName') {
                    // Display-only metadata; no mesh rebuild.
                    _bgLoadSettings();
                    return;
                }
                if (changedKey === 'customVideoName') {
                    // Filename change → new <video> source. Rebuild
                    // only when the video style is currently active;
                    // otherwise the new bytes pick up next time the
                    // user picks `video`.
                    _bgLoadSettings();
                    if (getBgStyleId() === 'video') _bgRebuild();
                    return;
                }
                if (changedKey === 'intensity') {
                    _bgLoadSettings();
                    // Image style reads s.intensity per frame inside
                    // update() to scale the drift speed, so a live
                    // mutation is enough — no need to tear down and
                    // re-decode the texture for every slider change.
                    // The procedural styles bake intensity into mesh
                    // count, opacity, and size at build time, so they
                    // still need a full rebuild.
                    if (getBgStyleId() === 'image' && bgState) {
                        bgState.intensity = getBgIntensity();
                        return;
                    }
                    _bgRebuild();
                    return;
                }
                if (changedKey === 'venueScene') {
                    _bgRebuild();
                    return;
                }
                if (changedKey === 'venueInstrumentPov') {
                    if (_bgEffectiveStyleId() === 'venue' && bgState) {
                        _venueSwapPlateIfNeeded(bgState);
                    }
                    return;
                }
                if (!changedKey || changedKey === 'style') {
                    _bgRebuild();
                }
            });
            _bgSubscribe(getBgListener());

            // Notedetect feedback (#9). Listen for hit/miss events on
            // window. Notedetect dispatches both globally and on its
            // instanceRoot; the global fire is fine for our case since
            // each 3dhighway panel just stores any event into its own
            // queue and renders only the matching note. Listeners are
            // per-panel so destroy() can cleanly remove them; cost is
            // a per-event branch + push, negligible vs per-frame work.
            // Validate every payload field we'll later compare against
            // chart-data fields (s, f, t). drawNote compares with
            // Math.abs(m.noteTime - n.t) and trusts the values are
            // finite, so reject any payload missing one of those
            // fields here rather than letting bogus data into the
            // arrays. Prune expired marks on every push so the arrays
            // settle back to empty when notedetect stops emitting —
            // drawNote's fast-path short-circuit
            // (`if (_ndHitMarks.length || _ndMissMarks.length)`) only
            // works if expired entries don't linger.
            const _ndNormalizeMark = (d) => {
                if (!d) return null;
                const note = d.note || d.chartNote;
                if (!note) return null;
                if (!Number.isFinite(note.s) || !Number.isFinite(note.f) || !Number.isFinite(d.noteTime)) return null;
                const labels = [];
                if (d.timingState && d.timingState !== 'OK' && Number.isFinite(d.timingError)) {
                    labels.push({
                        text: `${d.timingState === 'EARLY' ? '↑' : '↓'} ${d.timingError > 0 ? '+' : ''}${d.timingError}ms`,
                        color: '#ffb347',
                    });
                }
                if (d.pitchState && d.pitchState !== 'OK' && Number.isFinite(d.pitchError)) {
                    labels.push({
                        text: `${d.pitchState === 'SHARP' ? '♯' : '♭'} ${d.pitchError > 0 ? '+' : ''}${d.pitchError}¢`,
                        color: '#66c7ff',
                    });
                }
                return { s: note.s, f: note.f, noteTime: d.noteTime, labels, timingState: d.timingState || null };
            };;
            const _ndPushMark = (arr, d) => {
                const mark = _ndNormalizeMark(d);
                if (!mark) return arr;
                const now = performance.now();
                // Prune expired entries unconditionally. The dedupe path
                // below can extend expiresAt of any entry (including arr[0]),
                // so an arr[0] gate is not reliable — it would prevent
                // pruning entries that expired behind a refreshed front
                // entry, allowing the array to grow unbounded. These arrays
                // are tiny (a handful of marks at most), so an unconditional
                // filter() is negligible and always correct.
                if (arr.length !== 0) {
                    const live = arr.filter(m => m.expiresAt > now);
                    arr.length = 0;
                    if (live.length) arr.push(...live);
                }
                const existing = arr.find(m =>
                    m.s === mark.s && m.f === mark.f && Math.abs(m.noteTime - mark.noteTime) < _ND_TIME_EPS
                );
                if (existing) {
                    existing.labels = mark.labels.length ? mark.labels : existing.labels;
                    existing.expiresAt = Math.max(existing.expiresAt, now + _ND_TTL_MS);
                    return arr;
                }
                arr.push({ ...mark, expiresAt: now + _ND_TTL_MS });
                return arr;
            };;
            setNdOnHit((e) => { setNdHitMarks(_ndPushMark(getNdHitMarks(), e.detail)); });
            setNdOnMiss((e) => { setNdMissMarks(_ndPushMark(getNdMissMarks(), e.detail)); });
            window.addEventListener('notedetect:hit', getNdOnHit());
            window.addEventListener('notedetect:miss', getNdOnMiss());
            if (window.feedBack &&
                    typeof window.feedBack.on  === 'function' &&
                    typeof window.feedBack.off === 'function') {
                setNdOnBusHit((e) => { setNdHitMarks(_ndPushMark(getNdHitMarks(),  e.detail)); });
                setNdOnBusMiss((e) => { setNdMissMarks(_ndPushMark(getNdMissMarks(), e.detail)); });
                window.feedBack.on('note:hit', getNdOnBusHit());
                window.feedBack.on('note:miss', getNdOnBusMiss());
            }

            /* ── h3d-carve-10: score-FX init → fxInit() in src/score-fx.js */
            fxInit();

            return true;
        }

        function _bgLoadSettings() {
            const panelKey = _bgPanelKey(getHighwayCanvas());
            setBgStyleId(_bgReadSetting(panelKey, 'style'));
            setBgIntensity(_bgReadSetting(panelKey, 'intensity'));
            setBgReactive(_bgReadSetting(panelKey, 'reactive'));
            // Per-render opt-out (captured from the mount bundle in init): force
            // the reactive background off for THIS instance, overriding the shared
            // setting without writing it back. Re-applied here so it sticks across
            // setting reloads.
            if (getBgReactiveOptOut()) setBgReactive(false);
            if (getBgStyleId() === 'butterchurn') setBgReactive(false); // Butterchurn owns the <audio> tap;
            const newPaletteId = _bgReadSetting(panelKey, 'palette');
            let newPalette;
            if (newPaletteId === 'custom') {
                // Resolve user colors into the stable _customPalette array,
                // mutated in place so the reference identity is preserved.
                let stored = null;
                const raw = _bgReadSetting(panelKey, 'customColors');
                if (typeof raw === 'string') { try { stored = JSON.parse(raw); } catch (_) { /* corrupt */ } }
                for (let i = 0; i < _customPalette.length; i++) {
                    const v = Array.isArray(stored) ? _h3dHexToInt(stored[i]) : null;
                    _customPalette[i] = (v != null) ? v : PALETTES.default[i];
                }
                newPalette = _customPalette;
            } else {
                newPalette = PALETTES[newPaletteId] || PALETTES.default;
            }
            // Signature guards the in-place custom case: when the user edits a
            // color the reference stays === activePalette, so compare contents
            // too to force a retint. _bgPaletteSig caches the applied colors.
            const newSig = newPalette.join(',');
            if (newPalette !== getActivePalette() || newSig !== getBgPaletteSig()) {
                setActivePalette(newPalette);
                setBgPaletteSig(newSig);
                _applyPaletteToMaterials();
            }
            setBgThemeId(_bgReadSetting(panelKey, 'bgTheme'));
            // Highway axis. ONE-TIME BACKWARD-COMPAT BACKFILL: the first time we
            // load with no stored hwTheme (pre-split installs, or anyone who only
            // ever touched the old single "Scene colors" control), seed hwTheme
            // FROM the background pick AND PERSIST it, so an existing 'cathode'
            // selection looks byte-identical right after the upgrade. Persisting
            // immediately (rather than re-inheriting on every read) is what keeps
            // the two axes truly INDEPENDENT thereafter: once hwTheme is stored,
            // changing the Background dropdown no longer drags the Highway
            // surface along, and the settings UI's Highway value can never
            // disagree with what's rendered. Written without _bgEmitChange so the
            // backfill can't re-enter the change listener.
            if (_bgHasStored(panelKey, 'hwTheme')) {
                setHwThemeId(_bgReadSetting(panelKey, 'hwTheme'));
            } else {
                setHwThemeId(getBgThemeId());
                _bgMemFallback.hwTheme = String(getBgThemeId());
                try { localStorage.setItem('h3d_bg_hwTheme', String(getBgThemeId())); } catch (_) { /* storage blocked — mem fallback still seeds the read */ }
            }
            setShowFretOnNote(_bgReadSetting(panelKey, 'showFretOnNote'));
            setFretNumberGhostScope(_bgReadSetting(panelKey, 'fretNumberGhostScope'));
            const _cameraSmoothing = _bgReadSetting(panelKey, 'cameraSmoothing');
            setCameraSmoothing(_cameraSmoothing);
            // Mirror-at-first-read: zoom + tilt sliders inherit cameraSmoothing
            // when the user has never explicitly written them. Once the user
            // moves either slider, the corresponding _bgHasStored() flips
            // true and the read becomes independent.
            setZoomSmoothing(_bgHasStored(panelKey, 'zoomSmoothing')
                ? _bgReadSetting(panelKey, 'zoomSmoothing')
                : _cameraSmoothing);
            setTiltSmoothing(_bgHasStored(panelKey, 'tiltSmoothing')
                ? _bgReadSetting(panelKey, 'tiltSmoothing')
                : _cameraSmoothing);
            setCameraLockLow(_bgReadSetting(panelKey, 'cameraLockLow'));
            setCameraLockZoom(_bgReadSetting(panelKey, 'cameraLockZoom'));
            setCameraMode(_bgReadSetting(panelKey, 'cameraMode'));
            setTextSize(_bgReadSetting(panelKey, 'textSize'));
            setVibrancy(_bgReadSetting(panelKey, 'vibrancy'));
            setGlowMul(_bgReadSetting(panelKey, 'glow'));
            setHitFx(_bgReadSetting(panelKey, 'hitFx'));
            setSparks(_bgReadSetting(panelKey, 'sparks'));
            setCinematic(_bgReadSetting(panelKey, 'cinematic'));
            setVerdictMarks(_bgReadSetting(panelKey, 'verdictMarks'));
            setTimingFx(_bgReadSetting(panelKey, 'timingFx'));
            setStreakFx(_bgReadSetting(panelKey, 'streakFx'));
            setBloom(_bgReadSetting(panelKey, 'bloom'));
            _applyCinematic();
            setFpsVisible(_bgReadSetting(panelKey, 'fpsVisible'));
            setFretDividersVisible(_bgReadSetting(panelKey, 'fretDividersVisible'));
            setChordDiagramVisible(_bgReadSetting(panelKey, 'chordDiagramVisible'));
            setChordDiagramSize(_bgReadSetting(panelKey, 'chordDiagramSize'));
            setChordDiagramPosition(_bgReadSetting(panelKey, 'chordDiagramPosition'));
            setFretColumnMarkerCadence(_bgReadSetting(panelKey, 'fretColumnMarkerCadence'));
            setInlayLabelsVisible(_bgReadSetting(panelKey, 'inlayLabelsVisible'));
            setSectionLabelsOnHighway(_bgReadSetting(panelKey, 'sectionLabelsOnHighway'));
            setSectionHudVisible(_bgReadSetting(panelKey, 'sectionHudVisible'));
            setSectionHudPosition(_bgReadSetting(panelKey, 'sectionHudPosition'));
            setSectionHudSize(_bgReadSetting(panelKey, 'sectionHudSize'));
            setToneHudVisible(_bgReadSetting(panelKey, 'toneHudVisible'));
            setToneHudPosition(_bgReadSetting(panelKey, 'toneHudPosition'));
            setToneHudSize(_bgReadSetting(panelKey, 'toneHudSize'));
            setNutHeadstockVisible(_bgReadSetting(panelKey, 'nutHeadstockVisible'));
            setTuningLabelsVisible(_bgReadSetting(panelKey, 'tuningLabelsVisible'));
            setNutColor(_bgReadSetting(panelKey, 'nutColor'));
            setHeadstockColor(_bgReadSetting(panelKey, 'headstockColor'));
            setProjectionVisible(_bgReadSetting(panelKey, 'projectionVisible'));
            setSlideArrowApproachVisible(_bgReadSetting(panelKey, 'slideArrowApproachVisible'));
            setSlideArrowNeckVisible(_bgReadSetting(panelKey, 'slideArrowNeckVisible'));
            setSlideArrowChainPreviewVisible(_bgReadSetting(panelKey, 'slideArrowChainPreviewVisible'));
            setVibrancyIdleOp(0.4  + 0.6  * getVibrancy());
            setVibrancyProjOp(0.15 + 0.35 * getVibrancy());
            // Custom image asset is a single GLOBAL slot — bytes are
            // shared across panels (per-panel choice is which style
            // each panel renders, not which asset). Reading via
            // _bgReadSetting would let a stray h3d_bg_panel<idx>_*
            // override silently re-introduce the per-panel asset
            // duplication this design deliberately avoids (and
            // h3dBgClearCustomImage wouldn't reach those overrides).
            // Read globals directly instead.
            //
            // Precedence: in-memory fallback BEFORE localStorage. The
            // setter always populates _bgMemFallback (even when the
            // localStorage write fails on quota), so the fallback
            // holds the most-recent staged value. Reading localStorage
            // first would mean a failed write leaves the renderer
            // pointed at the previous asset while settings.html shows
            // a "session-only" warning claiming the new bytes are in
            // effect — UI and renderer would silently disagree.
            const memDataUrl = _bgMemFallback.customImageDataUrl;
            const memName    = _bgMemFallback.customImageName;
            try {
                const gDataUrl = (memDataUrl !== undefined) ? memDataUrl : localStorage.getItem('h3d_bg_customImageDataUrl');
                const gName    = (memName    !== undefined) ? memName    : localStorage.getItem('h3d_bg_customImageName');
                bgCustomImageDataUrl = (gDataUrl != null) ? gDataUrl : BG_DEFAULTS.customImageDataUrl;
                bgCustomImageName    = (gName    != null) ? gName    : BG_DEFAULTS.customImageName;
            } catch (_) {
                bgCustomImageDataUrl = (memDataUrl !== undefined) ? memDataUrl : BG_DEFAULTS.customImageDataUrl;
                bgCustomImageName    = (memName    !== undefined) ? memName    : BG_DEFAULTS.customImageName;
            }
            // Custom video filename: also a single global slot, same
            // mem-first precedence as the image keys (a quota-failed
            // setItem leaves _bgMemFallback ahead of localStorage).
            const memVideoName = _bgMemFallback.customVideoName;
            try {
                const gVideoName = (memVideoName !== undefined) ? memVideoName : localStorage.getItem('h3d_bg_customVideoName');
                bgCustomVideoName = (gVideoName != null) ? gVideoName : BG_DEFAULTS.customVideoName;
            } catch (_) {
                bgCustomVideoName = (memVideoName !== undefined) ? memVideoName : BG_DEFAULTS.customVideoName;
            }
        }
        // Live-swap palette by mutating existing materials in place.
        // Three.js colors propagate to all sharing meshes on the next
        // render — no rebuild, no GC. The mGlow material was authored
        // with .color = white and the per-string color in .emissive
        // only; we preserve that here so the glow look stays consistent
        // before/after a palette swap rather than tinting the diffuse
        // white. Lane lines and drop lines that read
        // activePalette[s] per frame pick up automatically. Per-string
        // fretboard materials built inside buildBoard() are independent
        // and aren't reachable from here — buildBoard re-runs from the
        // palette listener to regenerate them with the new colors.
        //
        // projMeshArr holds filled rim meshes (ExtrudeGeometry frame); centre
        // is open. Palette + vibrancy mutate each mesh's material like mStr.
        function _applyPaletteToMaterials() {
            for (let s = 0; s < getActivePalette().length; s++) {
                const c = getActivePalette()[s];
                if (getMStr()[s]) {
                    // Gradient strings (0..5) keep a white base so the per-vertex
                    // colours in gNoteGrad[s] show pure; only flat strings (6/7)
                    // take the palette colour. mStr is MeshBasicMaterial (no
                    // emissive) — guard the legacy emissive retint.
                    if (s >= 6) getMStr()[s].color.setHex(c);
                    if (getMStr()[s].emissive) getMStr()[s].emissive.setHex(c);
                }
                if (getMGlow()[s]) getMGlow()[s].emissive.setHex(c);
                if (getMRimFlash()[s]) {
                    getMRimFlash()[s].color.setHex(c);
                    getMRimFlash()[s].emissive.setHex(c);
                }
                if (getMSus()[s]) getMSus()[s].color.setHex(c);
                if (getMStrHitOutline()[s]) {
                    getMStrHitOutline()[s].color.setHex(c);
                    getMStrHitOutline()[s].emissive.setHex(c);
                }
                if (getMAccentOutline()[s]) {
                    getMAccentOutline()[s].color.setHex(c);
                    getMAccentOutline()[s].emissive.setHex(c);
                }
                if (getMAccentCore()[s]) getMAccentCore()[s].emissive.setHex(c);
                // Verdict materials use fixed colours (0x22ff88 hit, 0xff0066 miss)
                // that are independent of the string palette — no retint needed.
                for (const haloArr of [getMAccentHaloNear(), getMAccentHaloMid(), getMAccentHaloFar()]) {
                    if (haloArr[s]) haloArr[s].color.setHex(c);
                }
                if (getProjMeshArr() && getProjMeshArr()[s]) {
                    for (const pm of getProjMeshArr()[s]) {
                        if (pm.material) {
                            pm.material.color.setHex(c);
                            pm.material.emissive.setHex(c);
                        }
                    }
                }
            }
            // Per-string gem bodies (strings 0..5) are a baked per-vertex
            // gradient (gNoteGrad), not a flat material — recolor them too so a
            // custom palette reaches the note/sustain/vibrato gem bodies.
            _recolorGemGradients();
            // Re-apply vibrancy: mGlow's color is a lerp between white and
            // the palette colour, so a palette swap must rebuild that
            // lerp from the new endpoints. Skipped pre-init when mGlow
            // isn't allocated yet — _applyVibrancy() guards on that.
            _applyVibrancy();
        }

        // Recompute the per-vertex gem-gradient colors from the active palette.
        // Built-in palettes (and unchanged slots of a custom palette) keep the
        // hand-tuned DEFAULT_GEM_GRADIENTS stops so the stock look is preserved;
        // a custom slot derives a top-highlight / bottom-shade from its base
        // color. Mutates the existing 'color' attribute in place (no geometry
        // churn, pooled note meshes pick it up next frame).
        function _recolorGemGradients() {
            if (!T || !getGNoteGrad() || !getGNoteGrad().length) return;
            const isCustom = (getActivePalette() === _customPalette);
            const topCol = new T.Color(), botCol = new T.Color(), tmp = new T.Color();
            const halfH = NH / 2;
            for (let s = 0; s < getGNoteGrad().length; s++) {
                const g = getGNoteGrad()[s];
                if (!g || !g.attributes || !g.attributes.color) continue;
                const base = getActivePalette()[s];
                let topHex, botHex;
                if (isCustom && base !== PALETTES.default[s]) {
                    // Match the SUBTLE stock gem shading (bottom ≈ 0.78 of a
                    // near-base top), so a custom gem reads as a flat-ish gem
                    // in the chosen color rather than a strong gradient.
                    topHex = _lightenInt(base, 0.05);
                    botHex = _darkenInt(base, 0.78);
                } else {
                    const stops = DEFAULT_GEM_GRADIENTS[s];
                    if (!stops) continue; // strings 6/7 have no gradient geometry;
                    topHex = stops[0];
                    botHex = stops[1];
                }
                topCol.setHex(topHex);
                botCol.setHex(botHex);
                const pos = g.attributes.position;
                const colAttr = g.attributes.color;
                for (let i = 0; i < pos.count; i++) {
                    const t = (pos.getY(i) + halfH) / (2 * halfH); // 0 bottom..1 top;
                    tmp.copy(botCol).lerp(topCol, t);
                    colAttr.setXYZ(i, tmp.r, tmp.g, tmp.b);
                }
                colAttr.needsUpdate = true;
            }
        }

        // Vibrancy + glow live-update helpers. Both walk the same
        // material set _applyPaletteToMaterials walks (plus the static
        // outline / technique materials) and mutate uniform-backed
        // properties — colour, opacity, emissiveIntensity. No
        // material.needsUpdate flag is needed for these; Three.js
        // re-reads them on the next render call. mGlow.emissiveIntensity
        // and BASE_GLOW/MAX_GLOW/IDLE_OP are NOT written here — those
        // are stomped per-frame inside updateStringHighlights() and the
        // anticipation loop in update(), so they read glowMul /
        // _vibrancyIdleOp / vibrancy directly each frame instead.
        function _applyVibrancy() {
            const t = getVibrancy();
            const idleOp     = 0.4  + 0.6  * t; // mStr / IDLE_OP source;
            // projIdleOp drives the projMeshArr ghost-frame opacity and is
            // read by drawNote() as `_vibrancyProjOp`, which layers a
            // per-frame factor on top.
            const projIdleOp = 0.15 + 0.35 * t;
            const susOp      = 0.35 + 0.45 * t; // mSus;
            const lineGlowOp = 0.15 + 0.35 * t; // thin Line glow layer behind each string;
            for (let s = 0; s < getActivePalette().length; s++) {
                if (getMStr()[s])  getMStr()[s].opacity  = idleOp;
                if (getMSus()[s])  getMSus()[s].opacity  = susOp;
                if (getMGlow()[s]) {
                    // Hit-note body lerps from white (current pastel
                    // look — colour comes through the emissive only)
                    // toward the palette colour as vibrancy → 1, so at
                    // vibrancy=1 the white-wash on hit notes goes away.
                    if (!getPaletteColorTmp() && T) setPaletteColorTmp(new T.Color());
                    if (getPaletteColorTmp()) {
                        getMGlow()[s].color.setHex(0xffffff).lerp(getPaletteColorTmp().setHex(getActivePalette()[s]), t);
                    }
                }
                if (getMAccentCore()[s]) {
                    if (!getPaletteColorTmp() && T) setPaletteColorTmp(new T.Color());
                    if (getPaletteColorTmp()) {
                        getMAccentCore()[s].color.setHex(0xffffff).lerp(getPaletteColorTmp().setHex(getActivePalette()[s]), t);
                    }
                }
                if (getProjMeshArr() && getProjMeshArr()[s]) {
                    for (const pm of getProjMeshArr()[s]) {
                        if (pm.material) pm.material.opacity = projIdleOp;
                    }
                }
            }
            // stringLines[s].material.opacity is overwritten by
            // updateStringHighlights() every frame, so the closed-form
            // value would be stomped. updateStringHighlights() reads
            // _vibrancyIdleOp directly instead — keep that in sync.
            for (let s = 0; s < getStringLineGlows().length; s++) {
                const line = getStringLineGlows()[s];
                if (line && line.material) line.material.opacity = lineGlowOp;
            }
            setVibrancyIdleOp(idleOp);
            setVibrancyProjOp(projIdleOp);
        }
        function _applyGlow() {
            const g = getGlowMul();
            for (let s = 0; s < getActivePalette().length; s++) {
                if (getMStr()[s])  getMStr()[s].emissiveIntensity  = 0.002 * g;
                // mGlow[s].emissiveIntensity is per-frame in update();
                // see Phase 4 comment block.
                if (getProjMeshArr() && getProjMeshArr()[s]) {
                    for (const pm of getProjMeshArr()[s]) {
                        if (pm.material) pm.material.emissiveIntensity = 0.002 * g;
                    }
                }
                if (getMStrHitOutline()[s]) getMStrHitOutline()[s].emissiveIntensity = 1.0 * g;
                if (getMAccentOutline()[s]) getMAccentOutline()[s].emissiveIntensity = ACCENT_RIM_BASE_EMISSIVE * g;
                // mAccentCore[].emissiveIntensity is per-frame in update()
                // alongside mGlow (accent fill boost).
            }
            if (getMWhiteOutline()) getMWhiteOutline().emissiveIntensity = 0.6 * g;
            if (getMMissOutline())  getMMissOutline().emissiveIntensity  = 1.2 * g;
            for (let s = 0; s < getMHitBright().length; s++) {
                if (getMHitBright()[s]) getMHitBright()[s].emissiveIntensity = 4.0 * g;
            }
            if (getMSusOutline())      getMSusOutline().emissiveIntensity      = 0.3 * g;
            if (getMHitSusOutline())   getMHitSusOutline().emissiveIntensity   = 0.7 * g;
            if (getMTapChevron())   getMTapChevron().emissiveIntensity   = 0.9 * g;
            if (getMBarre())        getMBarre().emissiveIntensity        = 0.9 * g;
            for (let si = 0; si < getActivePalette().length; si++) {
                if (getMAccentHaloNear()[si]) getMAccentHaloNear()[si].opacity = ACCENT_HALO_OP_NEAR * g;
                if (getMAccentHaloMid()[si]) getMAccentHaloMid()[si].opacity = ACCENT_HALO_OP_MID * g;
                if (getMAccentHaloFar()[si]) getMAccentHaloFar()[si].opacity = ACCENT_HALO_OP_FAR * g;
            }
        }
        function _bgEffectiveStyleId() {
            return getVenueSceneOverride() ? 'venue' : getBgStyleId();
        }
        // The 'butterchurn' bg-style renders a WebGL MilkDrop canvas BEHIND a
        // transparent highway via the self-contained _bc* controller (top of file),
        // NOT a Three.js fog-scenery style (its scenery falls back to 'off'). Mount
        // is idempotent and driven by the bg-style dropdown through _bgMountStyle.
        function _bcActive() { return getBgStyleId() === 'butterchurn'; }
        function _bcSyncMode() {
            if (_bcActive()) {
                // Recreate when there's no controller, or the last one died during
                // async init (lib/WebGL failure) — a dead controller self-cleaned,
                // so retry here instead of leaving the style permanently broken.
                if ((!getBcCtrl() || (getBcCtrl().dead && getBcCtrl().dead())) && getWrap()) {
                    if (getBcCtrl()) setBcCtrl(null);
                    // audioProvider reuses this instance's shared analyser (the
                    // fog scenery's #audio / stems tap) so the browser path never
                    // opens a second createMediaElementSource on #audio.
                    try { setBcCtrl(_bcCreateController(getWrap(), () => canvasSize(getHighwayCanvas()), () => { try { return _bgGetAnalyser(); } catch (e) { return null; } })); }
                    catch (e) { console.warn('[3D-Hwy] Butterchurn init failed', e); }
                }
                if (getRen()) getRen().setClearColor(0x101820, 0); // transparent so the visualizer shows through;
            } else if (getBcCtrl()) {
                try { getBcCtrl().destroy(); } catch (e) {}
                setBcCtrl(null);
                _applyBgTheme(); // restore the opaque themed clear;
            }
        }
        function _bgMountStyle() {
            const effectiveId = _bgEffectiveStyleId();
            const style = BG_STYLES[effectiveId] || BG_STYLES.off;
            // Build into a fresh stage group so a partial throw can't
            // orphan meshes inside bgGroup. On success the stage joins
            // bgGroup atomically; on failure the stage and everything
            // in it are disposed and bgState stays null.
            const stage = new T.Group();
            let result = null;
            try {
                result = style.build(stage, {
                    intensity: getBgIntensity(),
                    palette: getActivePalette(),
                    customImageDataUrl: bgCustomImageDataUrl,
                    customVideoName: bgCustomVideoName,
                    cam: getCam(),
                }) || null;
            } catch (e) {
                console.error('[3D-Hwy] bg style build failed', effectiveId, e);
                _bgDisposeGroupTree(stage);
                bgState = null;
                bgStage = null;
                bgMountedStyleId = null;
                return;
            }
            // renderOrder on a Group doesn't propagate to its children
            // (Three.js sorts by per-object renderOrder, and a Group is a
            // transform, not a rendered object). Stamp every mesh in the
            // stage so transparent bg objects always sort behind notes
            // regardless of their z relative to gameplay geometry.
            stage.traverse((c) => { c.renderOrder = -1; });
            getBgGroup().add(stage);
            bgStage = stage;
            bgState = result;
            bgMountedStyleId = effectiveId;
            _bcSyncMode();
        }
        function _bgUnmountStyle() {
            const mountedId = bgMountedStyleId || _bgEffectiveStyleId();
            const style = BG_STYLES[mountedId] || BG_STYLES.off;
            try { style.teardown(bgState); } catch (e) { console.error('[3D-Hwy] bg teardown', e); }
            bgState = null;
            // Belt + suspenders: even if a style's teardown forgets to
            // dispose something, the stage tree dispose mops up.
            if (bgStage) {
                bgStage.parent?.remove(bgStage);
                _bgDisposeGroupTree(bgStage);
                bgStage = null;
            }
            bgMountedStyleId = null;
        }
        // Recursively dispose geometries / materials attached to an
        // Object3D tree, then detach. Used as a safety net during
        // _bgMountStyle failures and on _bgUnmountStyle.
        //
        // Deliberately does NOT dispose material.map textures — texture
        // lifetime belongs to whoever allocated the texture. The
        // silhouettes style allocates a per-layer CanvasTexture wrapping
        // the shared _silCanvas bitmap, and disposes those textures in
        // its own teardown. Disposing them here would double-dispose,
        // and any future plugin texture sharing across panels (e.g. an
        // upcoming custom-background feature) would break the same way.
        // Style teardown owns texture release.
        function _bgDisposeGroupTree(obj) {
            if (!obj) return;
            obj.traverse((child) => {
                child.geometry?.dispose?.();
                const mat = child.material;
                if (mat) {
                    const mats = Array.isArray(mat) ? mat : [mat];
                    for (const m of mats) m?.dispose?.();
                }
            });
            obj.parent?.remove(obj);
        }
        function _bgRebuild() {
            if (!getBgGroup()) return;
            // Order matters: teardown must run against the (style id,
            // state) pair that built the meshes, so unmount BEFORE
            // reloading settings. Reload, then mount with the new id.
            _bgUnmountStyle();
            _bgLoadSettings();
            _bgMountStyle();
            _bgApplyVenueSceneFog(getVenueSceneOverride());
            // Reset dt accounting so the first frame after a switch
            // doesn't see a huge "since last update" window — that
            // would clamp to 0.1 and visibly snap motion / rotation.
            setBgLastT(0);
        }
        // Venue-only fog/clear/ambient tuning — darker near field, less
        // washed-out gray haze over the playable highway. Restored when
        // venue deactivates.
        function _bgApplyVenueSceneFog(active) {
            if (!getScene() || !getScene().fog) return;
            if (active) {
                getScene().fog.color.setHex(0x080c12);
                getScene().fog.near = FOG_START * 0.98;
                getScene().fog.far = FOG_END * 0.98;
                // Keep the clear transparent while Butterchurn is active so the
                // venue scene doesn't occlude the visualizer behind the highway.
                if (getRen()) getRen().setClearColor(0x080c12, _bcActive() ? 0 : 1);
                if (getAmbLight()) getAmbLight().intensity = 0.68;
            } else {
                // Restore the user's scene-color theme (clear + fog) rather than
                // the old hardcoded gray, so deactivating venue doesn't wipe a
                // chosen background theme. _applyBgTheme reads the current theme.
                getScene().fog.near = FOG_START * 0.8;
                getScene().fog.far = FOG_END * 1.2;
                if (getAmbLight()) getAmbLight().intensity = 0.85;
                _applyBgTheme();
            }
        }

        // Apply BOTH scene-color axes, each from its own setting key:
        //   • BACKGROUND (bgThemeId): the WebGL clear color + the distance-fog
        //     tint. Skipped while the venue scene is active (venue owns those —
        //     see _bgApplyVenueSceneFog).
        //   • HIGHWAY (hwThemeId): the fretboard/highway-surface plane + the lit
        //     highway lane strip (the bright quad under the gems) + its dimmer
        //     alternating row. Always themed; venue doesn't touch them.
        // The two axes are independent, so picking a different id in each mixes
        // freely. Safe to call any time; called from initScene, buildBoard, and
        // the scene-theme listener (so a live switch of EITHER dropdown retints
        // only its half immediately).
        //
        // The lane fields are OPTIONAL on a highway theme: one that omits `lane`
        // / `laneDim` falls back to the stock lit/dim lane hexes, so every
        // existing/neutral highway theme stays byte-identical (default blue lane
        // unchanged). Only colored highway themes opt into a coordinated lane.
        function _applyBgTheme() {
            // --- Background axis: clear + fog ---
            const bg = _bgBackgroundColors(getBgThemeId());
            if (!getVenueSceneOverride()) {
                if (getScene() && getScene().fog) getScene().fog.color.setHex(bg.fog);
                if (getRen()) getRen().setClearColor(bg.clear, _bcActive() ? 0 : 1);
            }
            // --- Highway axis: board plane + lane ---
            const hw = _bgHighwayColors(getHwThemeId());
            if (getBoardPlaneMat()) getBoardPlaneMat().color.setHex(hw.board);
            // Lit lane strip + its dimmer alternating row. Fall back to the
            // hardcoded stock lane colors when the highway theme omits them.
            const laneLit = (typeof hw.lane === 'number') ? hw.lane : HWY_LANE_STRIPE_ODD_HEX;
            const laneDim = (typeof hw.laneDim === 'number') ? hw.laneDim : HWY_LANE_STRIPE_EVEN_HEX;
            if (getMLaneOdd()) getMLaneOdd().color.setHex(laneLit);
            if (getMLaneEven()) getMLaneEven().color.setHex(laneDim);
            // Keep the (otherwise vestigial) lane target color in sync with the
            // lit lane so any future lane-blend consumer reads the themed value.
            if (getLaneTargetColor()) getLaneTargetColor().setHex(laneLit);
            else setLaneTargetColor(new T.Color(laneLit));
        }


        function buildBoard() {
            // Dispose before clearing (traverse: nut/headstock may live in a Group).
            while (getFretG().children.length) {
                const child = getFretG().children[0];
                child.traverse((o) => {
                    if (o instanceof T.Sprite) return;
                    // fretTubeGeo is shared across all fret meshes — disposing it
                    // per-mesh here would fire one redundant dispose event per
                    // fret. Skip it; it's disposed exactly once below.
                    if (o.geometry !== getFretTubeGeo()) o.geometry?.dispose?.();
                    const mat = o.material;
                    if (mat) {
                        const mats = Array.isArray(mat) ? mat : [mat];
                        for (const m of mats) m?.dispose?.();
                    }
                });
                getFretG().remove(child);
            }
            setStringLines([]);
            setStringLineGlows([]);
            // Fret wire materials were already disposed by the child.traverse()
            // above (each is attached 1:1 to a fret mesh) — just clear the
            // tracking array. The shared fretTubeGeo was skipped by that
            // traverse, so dispose it exactly once here.
            const _fretWireMats = [];
            setFretWireMats(_fretWireMats);
            getFretTubeGeo()?.dispose?.();
            setFretTubeGeo(null);

            const board = boardSpanX();
            const bw = board.width + 4 * K;

            // Fretboard plane — spans exactly from hit line (Z=0) to the note
            // spawn horizon (-AHEAD * TS), so the far edge aligns with AHEAD.
            const blAhead = TS * AHEAD;
            const pg = new T.PlaneGeometry(bw, blAhead);
            // Board (highway-surface) color comes from the active HIGHWAY scene
            // theme (default theme = the original 0x08080e). Kept on
            // _boardPlaneMat so _applyBgTheme can recolor it live without
            // rebuilding the board.
            const pm = new T.MeshLambertMaterial({ color: _bgHighwayColors(getHwThemeId()).board, transparent: true, opacity: 0.6 });
            setBoardPlaneMat(pm);
            const p = new T.Mesh(pg, pm);
            p.rotation.x = -Math.PI / 2;
            p.position.set(board.center, S_BASE - NH / 2 - 2 * K, -blAhead / 2);
            getFretG().add(p);

            // Thin Line strings (glow layer). Retained in stringLineGlows[]
            // so vibrancy slider changes can mutate opacity in place
            // without rebuilding the board geometry.
            // Nut lateral layout (matches headstock block below): playing strings start at the
            // fretboard-facing edge so they never project through nut/headstock.
            const mir = getLeftyCached() ? -1 : 1;
            const nutLenX = 1.55 * K;
            const nutXC = -0.78 * K * mir;
            const xHeadLeft = -6.85 * K * mir;
            const nutRearX = nutXC - nutLenX * 0.5;
            const nutFrontX = nutXC + nutLenX * 0.5;
            const nutJoinX = nutFrontX + 0.03 * K;
            const bridgeTipX = xFret(NFRETS) + 2 * K * mir;
            const _boardStringStartX = Math.min(nutJoinX, bridgeTipX);
            setBoardStringStartX(_boardStringStartX);
            setBoardTuningLabelX((nutRearX + xHeadLeft) * 0.5 - 0.15 * K * mir);
            const stringEndX = Math.max(nutJoinX, bridgeTipX);
            const strSpan = Math.max(stringEndX - _boardStringStartX, 1.5 * K);

            const lineGlowOp = 0.15 + 0.35 * getVibrancy();
            for (let s = 0; s < getNStr(); s++) {
                const pts = [new T.Vector3(_boardStringStartX, sY(s), 0), new T.Vector3(stringEndX, sY(s), 0)];
                const g = new T.BufferGeometry().setFromPoints(pts);
                const line = new T.Line(g, new T.LineBasicMaterial({ color: getActivePalette()[s], transparent: true, opacity: lineGlowOp }));
                line.renderOrder = 7; // above sus rails (4/5), below chord fill (10);
                getFretG().add(line);
                getStringLineGlows().push(line);
            }

            // BoxGeometry strings — emissive glow driven by updateStringHighlights()
            for (let s = 0; s < getNStr(); s++) {
                const g = new T.BoxGeometry(strSpan, STR_THICK, STR_THICK);
                // Each string gets its own material instance so emissiveIntensity is per-string
                // (and per-frame opacity is set by updateStringHighlights via _vibrancyIdleOp)
                const mat = new T.MeshStandardMaterial({
                    color: getActivePalette()[s], emissive: getActivePalette()[s],
                    emissiveIntensity: 0.002,
                    transparent: true, opacity: getVibrancyIdleOp(), roughness: 1,
                });
                const mesh = new T.Mesh(g, mat);
                mesh.renderOrder = renderOrderForLayerAtZ(0, 'BOARD_STRING');
                mesh.position.set(_boardStringStartX + strSpan * 0.5, sY(s), 0);
                getFretG().add(mesh);
                getStringLines().push(mesh);
            }

            // Guitar nut + headstock — grouped so visibility + colors are user-tunable.
            {
                setNutHeadstockGroup(new T.Group());
                const yTopN = Math.max(sY(0), sY(getNStr() - 1));
                const yBottomN = Math.min(sY(0), sY(getNStr() - 1));
                const yMidN = (yTopN + yBottomN) / 2;
                const spanY = Math.abs(yTopN - yBottomN) + S_GAP * 1.05;

                const nutD = 0.95 * K;
                const nutZc = -0.62 * K;
                const nutH = spanY * 1.06;
                const nutHalfH = nutH * 0.5;

                const zBack = -1.38 * K;
                const zJoint = -0.58 * K;

                const nutInt = _h3dHexOrDefault(getNutColor(), BG_DEFAULTS.getNutColor());
                const hsInt = _h3dHexOrDefault(getHeadstockColor(), BG_DEFAULTS.getHeadstockColor());
                const nutBase = new T.Color(nutInt);
                const nutHi = nutBase.clone().lerp(new T.Color(0xffffff), 0.14);
                const nutGro = nutBase.clone().multiplyScalar(0.72);
                const hsBase = new T.Color(hsInt);
                const hsDarkC = hsBase.clone().multiplyScalar(0.76);

                const mapleMat = new T.MeshStandardMaterial({
                    color: hsBase, roughness: 0.55, metalness: 0.02,
                });
                const mapleDark = new T.MeshStandardMaterial({
                    color: hsDarkC, roughness: 0.62, metalness: 0.02,
                });

                const coreLen = Math.max(Math.abs(nutRearX - xHeadLeft), 2 * K);
                const coreCX = (nutRearX + xHeadLeft) * 0.5;
                const headCoreD = 1.05 * K;
                const headCore = new T.Mesh(
                    new T.BoxGeometry(coreLen, spanY * 1.12, headCoreD),
                    mapleDark,
                );
                headCore.position.set(coreCX, yMidN, zBack - headCoreD * 0.35);
                getNutHeadstockGroup().add(headCore);

                const xs = 14;
                const ys = 12;
                const yLo = yMidN - spanY * 0.58;
                const yHi = yMidN + spanY * 0.58;
                const posR = new Float32Array((xs + 1) * (ys + 1) * 3);
                const idxR = [];
                let ri = 0;
                for (let j = 0; j <= ys; j++) {
                    const v = j / ys;
                    const wy = yLo + v * (yHi - yLo);
                    const yArc = 1 - Math.abs((wy - yMidN) / (spanY * 0.55 + 1e-6));
                    const yArcCl = Math.max(0, Math.min(1, yArc));
                    for (let i = 0; i <= xs; i++) {
                        const u = i / xs;
                        const wx = xHeadLeft + u * (nutRearX - xHeadLeft);
                        const smooth = Math.sin(u * Math.PI * 0.5);
                        let wz = zBack + (zJoint - zBack) * smooth;
                        wz += 0.14 * K * yArcCl * yArcCl;
                        posR[ri++] = wx;
                        posR[ri++] = wy;
                        posR[ri++] = wz;
                    }
                }
                const row = xs + 1;
                for (let j = 0; j < ys; j++) {
                    for (let i = 0; i < xs; i++) {
                        const a = j * row + i;
                        const b = a + row;
                        idxR.push(a, b, a + 1, b, b + 1, a + 1);
                    }
                }
                const rampGeo = new T.BufferGeometry();
                rampGeo.setAttribute('position', new T.BufferAttribute(posR, 3));
                rampGeo.setIndex(idxR);
                rampGeo.computeVertexNormals();
                getNutHeadstockGroup().add(new T.Mesh(rampGeo, mapleMat));

                const boneMat = new T.MeshStandardMaterial({
                    color: nutBase, roughness: 0.38, metalness: 0.02,
                });
                const boneTop = new T.MeshStandardMaterial({
                    color: nutHi, roughness: 0.32, metalness: 0.02,
                });
                const grooveMat = new T.MeshStandardMaterial({
                    color: nutGro, roughness: 0.85, metalness: 0,
                });

                const nutBody = new T.Mesh(
                    new T.BoxGeometry(nutLenX, nutH, nutD),
                    boneMat,
                );
                nutBody.position.set(nutXC, yMidN, nutZc);
                getNutHeadstockGroup().add(nutBody);

                const crownR = nutLenX * 0.52;
                const crownSeg = new T.CylinderGeometry(
                    crownR, crownR, nutLenX * 0.92, 20, 1, true,
                    Math.PI * 0.08, Math.PI * 0.42,
                );
                const crown = new T.Mesh(crownSeg, boneTop);
                crown.rotation.z = Math.PI * 0.5;
                crown.position.set(
                    nutXC,
                    yMidN + nutHalfH - 0.02 * K,
                    nutZc + nutD * 0.22,
                );
                getNutHeadstockGroup().add(crown);

                const slotDrop = 0.11 * K;
                const slotHalfW = STR_THICK * 1.15;
                const slotZ = nutZc + nutD * 0.12;
                for (let st = 0; st < getNStr(); st++) {
                    const gr = new T.Mesh(
                        new T.BoxGeometry(slotHalfW * 2, slotDrop, nutD * 0.42),
                        grooveMat,
                    );
                    gr.position.set(nutXC, sY(st), slotZ);
                    getNutHeadstockGroup().add(gr);
                }
                getNutHeadstockGroup().visible = getNutHeadstockVisible();
                getFretG().add(getNutHeadstockGroup());
            }

            // Fret wires — bowed metal TubeGeometry (backported from
            // highway_babylon). Board-string and fret-wire layers live in
            // RENDER_ORDER_LAYER_STACK so the fretboard draws above note
            // symbols and below fret labels.
            // Tube (not T.Line): WebGL ignores linewidth > 1px on almost all
            // platforms, so Line objects always render as hairlines. The tube
            // bows in Z (middle strings pushed away from camera) so the row of
            // frets reads as wrapping a cylindrical neck — see FRET_BOW_DZ.
            // MeshStandardMaterial (vs the old flat MeshBasic): the scene's
            // ambient+directional light glints across the rounded surface for a
            // polished-steel look; the per-frame gold albedo (in-anchor) then
            // reads as brass. depthTest:false: string BoxGeometry (MeshStandard,
            // depthWrite:true) writes depth at Z=+STR_THICK/2; wires near Z=0
            // would fail the depth test at string pixels despite higher layer.
            // Colors are updated each frame by the fretWireMats loop in update(),
            // which drives every wire to one of two tiers: FRET_WIRE_IDLE_* by
            // default, FRET_WIRE_ACTIVE_* inside the anchor lane. The material is
            // created at the idle tier so frame 0 (before update() first runs)
            // already matches.
            const yTop = Math.max(sY(0), sY(getNStr() - 1));
            const yBottom = Math.min(sY(0), sY(getNStr() - 1));
            const wireH = (yTop + S_GAP * 0.3) - (yBottom - S_GAP * 0.3);
            const wireMidY = (yTop + yBottom) / 2;
            // Single shared geometry centered at x=0, local Y -half..+half,
            // bowed in Z by FRET_BOW_DZ * [0,0.6,1,0.6,0]. Reused by every fret
            // (only mesh position differs). Symmetric in Y → invert/lefty-safe.
            const yHalf = wireH * 0.5;
            const zMults = [0, 0.6, 1, 0.6, 0];
            const tubePath = zMults.map((zm, i) => new T.Vector3(
                0,
                -yHalf + (wireH * i) / (zMults.length - 1),
                FRET_BOW_DZ * zm,
            ));
            const tubeCurve = new T.CatmullRomCurve3(tubePath);
            setFretTubeGeo(new T.TubeGeometry(
                tubeCurve, FRET_TUBE_SEG, FRET_TUBE_RADIUS, FRET_TUBE_RADIAL, false,
            ));
            for (let f = 0; f <= NFRETS; f++) {
                const x = xFret(f);
                const mat = new T.MeshStandardMaterial({
                    color: FRET_WIRE_IDLE_HEX, metalness: FRET_METALNESS, roughness: FRET_ROUGHNESS,
                    emissive: FRET_EMISSIVE,
                    // depthWrite:false (matches other transparent overlays here):
                    // a transparent fret must not write depth or it can occlude
                    // later-drawn transparent elements despite depthTest:false.
                    transparent: true, opacity: FRET_WIRE_IDLE_OP, depthTest: false, depthWrite: false,
                });
                const fw = new T.Mesh(getFretTubeGeo(), mat);
                fw.position.set(x, wireMidY, 0);
                fw.renderOrder = renderOrderForLayerAtZ(0, 'BOARD_FRET_WIRE');
                getFretG().add(fw);
                _fretWireMats[f] = mat;
            }

            // Fret dots — flat circles (CircleGeometry) lying in the XY plane and
            // facing +Z so they always appear as perfect circles from the camera.
            // depthWrite:false so they don't steal the depth buffer from the
            // transparent string meshes. Slight negative Z recessed under the
            // string plane. Radius 10% below the former 1.5*K dots.
            const dotRZ = (1.5 * K * 0.9);
            const dg = new T.CircleGeometry(dotRZ, 64);
            const dm = new T.MeshBasicMaterial({
                color: 0x556677,
                transparent: true,
                opacity: 1,
                depthWrite: false,
            });
            const dotZBack = -STR_THICK * 0.85;
            const my = (sY(0) + sY(getNStr() - 1)) / 2;
            const addDot = (x, y) => {
                const d = new T.Mesh(dg, dm);
                d.position.set(x, y, dotZBack);
                // Above the dynamic lane (1) and its dividers (2) so the
                // translucent blue lane no longer paints over and hides the
                // inlay; still well below strings / wires / notes,
                // so those keep drawing on top of the inlay.
                d.renderOrder = 3;
                getFretG().add(d);
            };;
            for (const f of DOTS) {
                const cx = xFretMid(f);
                if (DDOTS.has(f)) {
                    addDot(cx, my - S_GAP * 0.7);
                    addDot(cx, my + S_GAP * 0.7);
                } else {
                    addDot(cx, my);
                }
            }

            // Fret inlay number labels — sprites sitting just behind the hit line
            // (Z = -K) so camera-distance sorting in the transparent pass puts
            // them before notes at Z = 0, letting notes paint on top.
            // Materials are cloned from the txtMat cache with depthWrite:false so
            // the sprites don't write stale depth values that would clip incoming
            // notes (which arrive from large negative Z). Clones are tracked in
            // _inlayMats for explicit disposal on rebuild and destroy().
            // Scale uses (0.5 + textSize) directly — _textSizeMul is stale here
            // (only refreshed at the top of update()); update() rescales live.
            for (const m of getInlayMats()) m.dispose();
            setInlayMats([]);
            setInlayLabels([]);
            for (const f of INLAY_LABEL_FRETS) {
                const mat = txtMat(f, '#7abfcc', false, 'fretRow').clone();
                mat.depthWrite = false;
                mat.opacity = 0.55;
                const lbl = new T.Sprite(mat);
                const scale = 5.5 * (0.5 + getTextSize()) * fretLabelScaleForFret(f);
                lbl.scale.set(scale * K, scale * K, 1);
                lbl.position.set(xFretMid(f), yTop - S_GAP * 0.4, -K);
                lbl.visible = getInlayLabelsVisible();
                getFretG().add(lbl);
                getInlayLabels().push(lbl);
                getInlayMats().push(mat);
            }
        }

    return { initScene, buildBoard, _bgUnmountStyle, _bcSyncMode };
}
