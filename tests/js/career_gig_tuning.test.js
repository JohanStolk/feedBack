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

    test('first song does NOT fire interstitial for pref=specific:E Standard', () => {
        // Failure input: bare 'specific' would pass the old wrong guard `!== 'specific'`
        // but is impossible in production. Real value is always 'specific:<name>'.
        const ctx = makeCtx();
        setRun(ctx, 'specific:E Standard', [{ filename: 'a.sloppak', tuning_name: 'E Standard' }]);
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

// ---------------------------------------------------------------------------
// bookGig — generation guard (F1) and 404-only revert (F2)
// ---------------------------------------------------------------------------

describe('career-gig-tuning bookGig', () => {
    // Helper: make a ctx where bookGig is callable.
    // fetch is overridable per-test via ctx.fetch.
    function makeBookCtx() {
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
            setTimeout: () => 42,
            fetch: null,   // set per test
            console,
        });
        ctx.window.feedBack = { on: () => {}, emit: () => {} };
        vm.runInContext(SCREEN_JS, ctx);
        // Seed _pp so bookGig can find the passport
        vm.runInContext(`
            window.__careerPassportTest.setView({
                instruments: {
                    guitar: {
                        passports: [{ genre_key: 'rock', genre: 'Rock' }]
                    }
                }
            });
        `, ctx);
        return ctx;
    }

    test('F1: stale response from superseded request is discarded — _ppGigProposal keeps new value', async () => {
        // Failure input: two requests fire; second completes first; first (stale) must be dropped.
        // Without the generation guard, the stale Drop response would overwrite the Standard proposal.
        const ctx = makeBookCtx();
        let resolveFirst, resolveSecond;
        const first  = new Promise(r => { resolveFirst  = r; });
        const second = new Promise(r => { resolveSecond = r; });
        let callCount = 0;
        ctx.fetch = () => {
            callCount++;
            return callCount === 1 ? first : second;
        };

        // Fire first request (drop), don't resolve yet
        const p1 = vm.runInContext(`
            window.__careerPassportTest.setTuningPref('drop');
            window.__careerPassportTest.bookGig('rock');
        `, ctx);

        // Fire second request (standard) — increments gen
        const p2 = vm.runInContext(`
            window.__careerPassportTest.setTuningPref('standard');
            window.__careerPassportTest.bookGig('rock');
        `, ctx);

        // Resolve SECOND first (standard wins)
        resolveSecond({ ok: true, status: 200, json: async () => ({ songs: [{ filename: 'standard.sloppak', tuning_name: 'E Standard' }], tuning_pref: 'standard' }) });
        await p2;

        // Now resolve stale FIRST (drop) — must be discarded
        resolveFirst({ ok: true, status: 200, json: async () => ({ songs: [{ filename: 'drop.sloppak', tuning_name: 'Drop D' }], tuning_pref: 'drop' }) });
        await p1;

        // _ppGigProposal must reflect the second (standard) response, not the stale first.
        // getProposal() exposes _ppGigProposal via the test seam.
        const proposal = vm.runInContext('window.__careerPassportTest.getProposal()', ctx);
        // If the generation guard is absent, stale drop overwrites standard → songs[0] is drop.sloppak
        assert.ok(
            proposal === null || proposal.songs[0].filename !== 'drop.sloppak',
            'stale drop response must not overwrite the winning standard proposal'
        );
    });

    test('F2: 500 error keeps user pref — only 404 reverts to any', async () => {
        // Failure input: saved pref 'drop', server returns 500 → without fix, pref silently becomes 'any'
        const ctx = makeBookCtx();
        ctx.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });

        vm.runInContext(`window.__careerPassportTest.setTuningPref('drop');`, ctx);
        await vm.runInContext(`window.__careerPassportTest.bookGig('rock');`, ctx);

        const pref = vm.runInContext(`window.__careerPassportTest.getTuningPref()`, ctx);
        assert.equal(pref, 'drop', '500 error must not reset pref to any');
    });

    test('F2: 404 still reverts pref to any', async () => {
        const ctx = makeBookCtx();
        ctx.fetch = async () => ({ ok: false, status: 404, json: async () => ({ detail: 'No drop songs.' }) });

        vm.runInContext(`window.__careerPassportTest.setTuningPref('drop');`, ctx);
        await vm.runInContext(`window.__careerPassportTest.bookGig('rock');`, ctx);

        const pref = vm.runInContext(`window.__careerPassportTest.getTuningPref()`, ctx);
        assert.equal(pref, 'any', '404 must revert pref to any');
    });

    test('F1b: stale 404 json completing after newer booking must not revert newer pref', async () => {
        // Failure input: A 404 response is received (first gen check passes), then res.json()
        // is awaited. A new booking fires while json() is pending (increments _ppBookGen).
        // The error branch MUST re-check gen after json() and NOT revert pref to 'any'.
        //
        // We simulate the race by having json() bump _ppBookGen synchronously (equivalent to
        // a new bookGig call arriving at exactly that moment) before returning a resolved value.
        // After the await on json()'s resolved Promise, gen !== _ppBookGen → should bail.
        const ctx = makeBookCtx();

        ctx.fetch = async () => ({
            ok: false,
            status: 404,
            json: () => {
                // Simulate: a new booking fires while json() is in progress
                vm.runInContext(
                    'window.__careerPassportTest.setBookGen(window.__careerPassportTest.getBookGen() + 1);',
                    ctx
                );
                vm.runInContext(`window.__careerPassportTest.setTuningPref('standard');`, ctx);
                return Promise.resolve({ detail: 'No drop songs.' });
            },
        });

        vm.runInContext(`window.__careerPassportTest.setTuningPref('drop');`, ctx);
        await vm.runInContext(`window.__careerPassportTest.bookGig('rock');`, ctx);

        const pref = vm.runInContext(`window.__careerPassportTest.getTuningPref()`, ctx);
        assert.equal(pref, 'standard', 'stale 404 json must not revert newer pref to any');
    });

    test('F2: closeBook() invalidates in-flight request — overlay stays closed', async () => {
        // Failure input: a booking request is in flight (pending fetch), then the user
        // closes the poster via the REAL closeBook(). Without ++_ppBookGen in closeBook,
        // the pending response resolves and repopulates _ppGigProposal.
        //
        // Mutation proof: delete `++_ppBookGen` from closeBook() → test goes RED
        //                 (proposal is non-null, assert fails). Restore → GREEN.
        const ctx = makeBookCtx();
        let resolvePending;
        ctx.fetch = () => new Promise(r => { resolvePending = r; });

        // Fire a booking — stays pending
        vm.runInContext(`window.__careerPassportTest.setTuningPref('any');`, ctx);
        const pending = vm.runInContext(`window.__careerPassportTest.bookGig('rock');`, ctx);

        // User closes the poster — call the REAL closeBook() via the test seam
        vm.runInContext(`window.__careerPassportTest.closeBook();`, ctx);

        // Now resolve the pending fetch with a valid payload
        resolvePending({ ok: true, status: 200, json: async () => ({ songs: [{ filename: 'a.sloppak', tuning_name: 'E Standard' }], tuning_pref: 'any' }) });
        await pending;

        // Proposal must remain null — closeBook() incremented _ppBookGen so response was discarded
        const proposal = vm.runInContext(`window.__careerPassportTest.getProposal()`, ctx);
        assert.equal(proposal, null, 'closeBook() must invalidate in-flight request via ++_ppBookGen');
    });
});
