// Class-killer for src/three-loader.js — h3d-carve-2.
//
// The loader is a memoised async import with a CDN fallback. Runtime calls
// import(url) which only resolves against a live server, so the behavioural
// contract is pinned by source-scan regex that name the concrete mutation
// each assertion catches.
//
// Source-scan is sufficient here: the loader's correctness depends entirely
// on its static structure (memoisation guard, T-assignment, CDN fallback)
// rather than on runtime values — the same pattern used for all other
// source-level tests in this suite.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const LOADER_JS = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'src', 'three-loader.js');
const SCREEN_JS = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'screen.js');

let _loader;
function loader() {
    if (!_loader) _loader = fs.readFileSync(LOADER_JS, 'utf8');
    return _loader;
}

test('loadThree is exported from three-loader.js', () => {
    // Mutation: rename or remove the export → the import in screen.js throws.
    assert.match(loader(), /export\s+function\s+loadThree\s*\(\s*\)/,
        'loadThree must be exported so screen.js can import it');
});

test('T is exported as a live let-binding from three-loader.js', () => {
    // Mutation: export const T — const bindings cannot be reassigned from within
    // the module, so T = mod in loadThree() would throw a TypeError.
    assert.match(loader(), /export\s+let\s+T\s*=\s*null/,
        'T must be exported as a mutable let-binding so the .then handler can update it');
});

test('loadThree assigns T = mod in both the primary and CDN .then handlers', () => {
    // Mutation: remove all T = mod assignments — T stays null forever; all Three.js
    // calls throw.  Two assignments exist: primary load and CDN fallback.
    const matches = loader().match(/T\s*=\s*mod\s*;/g) || [];
    assert.ok(matches.length >= 2,
        'T = mod must appear in both the primary and CDN .then handlers (found ' + matches.length + ')');
});

test('loadThree memoises the promise — returns existing promise on repeated calls', () => {
    // Mutation: remove the !threeLoadPromise guard — a new promise is kicked off on
    // every call, racing against previous loads and resetting T on each resolution.
    assert.match(loader(), /if\s*\(\s*!threeLoadPromise\s*\)/,
        'memoisation guard must prevent duplicate simultaneous import() calls');
});

test('loadThree has a CDN fallback for the local vendor copy', () => {
    // Mutation: remove the .catch(() => import(THREE_CDN) chain — offline / mis-routed
    // deploys that fail to reach /static/vendor/three/ get no fallback and throw.
    assert.match(loader(), /\.catch\s*\(\s*\(\s*\)\s*=>\s*import\s*\(\s*THREE_CDN\s*\)/,
        'CDN fallback must kick in when the local vendor copy is unavailable');
});

test('loadThree resets threeLoadPromise to null on total failure', () => {
    // Mutation: remove threeLoadPromise = null in the final catch — a failed load
    // permanently memoises the rejected promise; a page reload recovers but a plugin
    // re-init (same session) can never retry the import.
    assert.match(loader(), /threeLoadPromise\s*=\s*null/,
        'failed load must reset threeLoadPromise so a retry can succeed');
});

test('screen.js imports loadThree and T from three-loader.js', () => {
    // Confirms the import line is present and the live-binding is wired.
    const src = fs.readFileSync(SCREEN_JS, 'utf8');
    assert.match(src,
        /import\s+\{\s*loadThree\s*,\s*T\s*\}\s*from\s*['"]\.\/src\/three-loader\.js['"]/,
        'screen.js must import both loadThree and T from the loader module');
});

test('screen.js IIFE no longer declares local let T or let threeLoadPromise', () => {
    // Mutation: leave the old local declarations in place — the IIFE's local T shadows
    // the live-binding import so T is always null inside the factory.
    const src = fs.readFileSync(SCREEN_JS, 'utf8');
    // Strip the import lines at the top of the file before searching the IIFE body.
    const iife = src.replace(/^import\s+.*?\n/gm, '');
    assert.doesNotMatch(iife, /\blet\s+T\s*=\s*null\s*;/,
        'IIFE must not redeclare T — the local shadow would defeat the live-binding export');
    assert.doesNotMatch(iife, /\blet\s+threeLoadPromise\s*=\s*null\s*;/,
        'IIFE must not redeclare threeLoadPromise — it belongs to the loader module now');
});
