/**
 * Tests for career-gig-tuning interstitial logic (feedBack career-gig-tuning).
 *
 * Failure inputs:
 *   - pref='specific' + first song → no interstitial (specific never needs a tune pause)
 *   - pref='any'   + first song   → interstitial fires
 *   - pref='any'   + same tuning  → no interstitial between songs
 *   - pref='any'   + tuning diff  → interstitial fires
 *   - holdAutoplay absent         → interstitial gracefully skipped
 */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const SCREEN_JS = fs.readFileSync(
    path.join(ROOT, 'plugins', 'career', 'screen.js'), 'utf8'
);

// ---------------------------------------------------------------------------
// VM harness
// ---------------------------------------------------------------------------

function makeCtx(opts = {}) {
    const holdReleaseCalled = { v: false };
    const holdSettleCalled = { v: false };

    const feedBackBase = {
        on: () => {},
        emit: () => {},
        holdAutoplay: opts.noHoldAutoplay ? undefined : function () {
            const release = function () { holdReleaseCalled.v = true; };
            release.settle = function () { holdSettleCalled.v = true; };
            return release;
        },
    };

    const ctx = vm.createContext({
        window: {},
        document: {
            getElementById: () => null,
            readyState: 'complete',
            addEventListener: () => {},
        },
        localStorage: {
            _store: {},
            getItem(k) { return this._store[k] != null ? this._store[k] : null; },
            setItem(k, v) { this._store[k] = String(v); },
        },
        clearTimeout: () => {},
        setTimeout: (fn, ms) => 42,
        fetch: () => Promise.resolve({ ok: false, json: async () => ({}) }),
        console,
        __holdReleaseCalled: holdReleaseCalled,
        __holdSettleCalled: holdSettleCalled,
    });

    // Set window.feedBack inside the context so script-level refs pick it up
    ctx.window.feedBack = feedBackBase;

    vm.runInContext(SCREEN_JS, ctx);
    return ctx;
}

function setRun(ctx, tuning_pref, songs) {
    vm.runInContext(`
        window.__careerPassportTest.setGigRun({
            idx: 0,
            tuning_pref: ${JSON.stringify(tuning_pref)},
            songs: ${JSON.stringify(songs)},
        });
    `, ctx);
}

function get(ctx, expr) {
    return vm.runInContext(expr, ctx);
}

function callOnLoading(ctx) {
    vm.runInContext('window.__careerPassportTest.onGigSongLoading()', ctx);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('career-gig-tuning interstitial', () => {
    test('no hold when gig run is null', () => {
        const ctx = makeCtx();
        vm.runInContext('window.__careerPassportTest.setGigRun(null)', ctx);
        callOnLoading(ctx);
        assert.equal(get(ctx, 'window.__careerPassportTest.getTuningHold()'), null);
    });

    test('first song fires interstitial for pref=any', () => {
        const ctx = makeCtx();
        setRun(ctx, 'any', [{ filename: 'a.sloppak', tuning_name: 'E Standard' }]);
        callOnLoading(ctx);
        assert.notEqual(get(ctx, 'window.__careerPassportTest.getTuningHold()'), null);
    });

    test('first song fires interstitial for pref=standard', () => {
        const ctx = makeCtx();
        setRun(ctx, 'standard', [{ filename: 'a.sloppak', tuning_name: 'E Standard' }]);
        callOnLoading(ctx);
        assert.notEqual(get(ctx, 'window.__careerPassportTest.getTuningHold()'), null);
    });

    test('first song does NOT fire interstitial for pref=specific', () => {
        const ctx = makeCtx();
        setRun(ctx, 'specific', [{ filename: 'a.sloppak', tuning_name: 'E Standard' }]);
        callOnLoading(ctx);
        assert.equal(get(ctx, 'window.__careerPassportTest.getTuningHold()'), null);
    });

    test('between-songs same tuning: no interstitial', () => {
        const ctx = makeCtx();
        const songs = [
            { filename: 'a.sloppak', tuning_name: 'E Standard' },
            { filename: 'b.sloppak', tuning_name: 'E Standard' },
        ];
        setRun(ctx, 'any', songs);
        vm.runInContext('window.__careerPassportTest.setLastTuning("E Standard")', ctx);
        vm.runInContext('window.__careerPassportTest.getGigRun().idx = 1', ctx);
        callOnLoading(ctx);
        assert.equal(get(ctx, 'window.__careerPassportTest.getTuningHold()'), null);
    });

    test('between-songs tuning change: fires interstitial for pref=any', () => {
        const ctx = makeCtx();
        const songs = [
            { filename: 'a.sloppak', tuning_name: 'E Standard' },
            { filename: 'b.sloppak', tuning_name: 'Drop D' },
        ];
        setRun(ctx, 'any', songs);
        vm.runInContext('window.__careerPassportTest.setLastTuning("E Standard")', ctx);
        vm.runInContext('window.__careerPassportTest.getGigRun().idx = 1', ctx);
        callOnLoading(ctx);
        assert.notEqual(get(ctx, 'window.__careerPassportTest.getTuningHold()'), null);
    });

    test('lastTuning is updated after onGigSongLoading', () => {
        const ctx = makeCtx();
        setRun(ctx, 'any', [{ filename: 'a.sloppak', tuning_name: 'Drop D' }]);
        callOnLoading(ctx);
        assert.equal(get(ctx, 'window.__careerPassportTest.getLastTuning()'), 'Drop D');
    });

    test('clearing hold via setTuningHold(null) leaves null', () => {
        const ctx = makeCtx();
        setRun(ctx, 'any', [{ filename: 'a.sloppak', tuning_name: 'E Standard' }]);
        callOnLoading(ctx);
        assert.notEqual(get(ctx, 'window.__careerPassportTest.getTuningHold()'), null);
        vm.runInContext('window.__careerPassportTest.setTuningHold(null)', ctx);
        assert.equal(get(ctx, 'window.__careerPassportTest.getTuningHold()'), null);
    });

    test('holdAutoplay unavailable: no interstitial (graceful skip)', () => {
        const ctx = makeCtx({ noHoldAutoplay: true });
        setRun(ctx, 'any', [{ filename: 'a.sloppak', tuning_name: 'E Standard' }]);
        callOnLoading(ctx);
        assert.equal(get(ctx, 'window.__careerPassportTest.getTuningHold()'), null);
    });
});
