// Pins the sustain bloom glow in plugins/highway_3d/screen.js (PR #329).
// Sustained chord rails get a soft gaussian glow: a DataTexture gaussian
// (_makeGaussTex) drives a wider, additive-blended plane mesh (pSusRailBloom)
// rendered behind the core rail. A refactor that drops the gaussian texture,
// stops using additive blending, or bumps the bloom renderOrder above the
// core rail (16) would silently regress or invert the effect.
//
// Since h3d-carve-1, _makeGaussTex is defined in src/geometry.js and
// imported into screen.js; the call site (_bloomGaussTex = _makeGaussTex(...))
// remains in screen.js.
//
// Source-level only — same strategy as the other tests/js/ files.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCREEN_JS = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'screen.js');
const GEOMETRY_JS = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'src', 'geometry.js');
const SCENE_INIT_JS = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'src', 'scene-init.js'); // h3d-carve-16

test('a gaussian DataTexture helper (_makeGaussTex) drives the bloom falloff', () => {
    const geo = fs.readFileSync(GEOMETRY_JS, 'utf8');
    assert.match(
        geo,
        /export\s+function\s+_makeGaussTex\s*\(/,
        '_makeGaussTex must be exported from geometry.js to build the bloom gaussian texture',
    );
    const src = fs.readFileSync(SCREEN_JS, 'utf8') + '\n' + fs.readFileSync(SCENE_INIT_JS, 'utf8');
    assert.match(
        src,
        /_bloomGaussTex\s*=\s*_makeGaussTex\(/,
        'the bloom texture must be produced by _makeGaussTex',
    );
});

test('the bloom rail material uses additive blending', () => {
    const src = fs.readFileSync(SCREEN_JS, 'utf8') + '\n' + fs.readFileSync(SCENE_INIT_JS, 'utf8');
    // h3d-carve-16: DI form uses _mSusRailBloomBase (local alias)
    assert.match(
        src,
        /(?:_m)?SusRailBloomBase\s*=\s*new\s+T\.MeshBasicMaterial\(\{[\s\S]*?blending:\s*T\.AdditiveBlending[\s\S]*?\}\)/,
        'mSusRailBloomBase must blend additively so it brightens what is behind it',
    );
});

test('the bloom pool seeds meshes at renderOrder 4, behind the core rail (5)', () => {
    // renderOrder 4 keeps the bloom behind the core sustain rail (5) so the
    // glow reads as a trail rather than occluding the rail.
    const src = fs.readFileSync(SCREEN_JS, 'utf8') + '\n' + fs.readFileSync(SCENE_INIT_JS, 'utf8');
    // h3d-carve-16: DI form uses _pSusRailBloom (local alias); pool first arg may be a getter call
    assert.match(
        src,
        /(?:_p)?SusRailBloom\s*=\s*pool\([\s\S]{0,100}?,\s*\(\)\s*=>\s*\{[\s\S]*?m\.renderOrder\s*=\s*4\s*;[\s\S]*?\}\s*\)/,
        'pSusRailBloom pool must seed meshes with renderOrder = 4',
    );
});
