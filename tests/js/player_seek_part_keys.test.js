// Unit tests for the player's seek-step and part-switch helpers (_seekStep,
// _partFamily, _nextPartIndex in static/js/player-controls.js). The module pulls
// in the DOM-bound player graph, so the pure functions are sliced out of source
// and evaluated on their own. A missing marker fails loudly instead of testing
// nothing.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'static', 'js', 'player-controls.js'), 'utf8');

function extractFn(source, name) {
    const start = source.indexOf(`export function ${name}(`);
    assert.notEqual(start, -1, `${name} must exist in player-controls.js`);
    const open = source.indexOf('{', source.indexOf(')', start));
    let depth = 0;
    for (let j = open; j < source.length; j++) {
        if (source[j] === '{') depth++;
        else if (source[j] === '}' && --depth === 0) {
            return source.slice(start + 'export '.length, j + 1);
        }
    }
    throw new Error(`unbalanced braces in ${name}`);
}

const { _seekStep, _partFamily, _nextPartIndex } = new Function(
    [extractFn(SRC, '_seekStep'), extractFn(SRC, '_partFamily'), extractFn(SRC, '_nextPartIndex'),
        'return { _seekStep, _partFamily, _nextPartIndex };'].join('\n'))();

test('seek step: 5 s, Shift 1 s, Alt 0.25 s', () => {
    assert.equal(_seekStep({}), 5);
    assert.equal(_seekStep({ shiftKey: true }), 1);
    assert.equal(_seekStep({ altKey: true }), 0.25);
    assert.equal(_seekStep({ shiftKey: true, altKey: true }), 1);
    assert.equal(_seekStep(null), 5);
});

test('part family from smart or raw names', () => {
    for (const n of ['Bass', 'Alt. Bass', 'Bass 2 (812)', 'Bonus Bass']) assert.equal(_partFamily(n), 'bass');
    for (const n of ['Lead', 'Rhythm (640)', 'Combo', 'Alt. Lead']) assert.equal(_partFamily(n), 'guitar');
    assert.equal(_partFamily('Keys'), 'keys');
    assert.equal(_partFamily('Vocals'), 'vocals');
    assert.equal(_partFamily('Drums'), 'drums');
});

const SONG = [
    { index: 0, name: 'Lead (900)' }, { index: 1, name: 'Rhythm (640)' },
    { index: 2, name: 'Bass (500)' }, { index: 3, name: 'Alt. Bass (520)' }, { index: 4, name: 'Vocals (0)' },
];

test('next part stays within the instrument and wraps', () => {
    assert.equal(_nextPartIndex(SONG, 2, 1), 3);
    assert.equal(_nextPartIndex(SONG, 3, 1), 2);   // wraps: a two-part toggle
    assert.equal(_nextPartIndex(SONG, 2, -1), 3);
    assert.equal(_nextPartIndex(SONG, 0, 1), 1);
    assert.equal(_nextPartIndex(SONG, 1, 1), 0);
});

test('no sibling or unknown current part: no switch', () => {
    assert.equal(_nextPartIndex(SONG, 4, 1), null);  // only one vocals part
    assert.equal(_nextPartIndex(SONG, 9, 1), null);
    assert.equal(_nextPartIndex([], 0, 1), null);
    assert.equal(_nextPartIndex(null, 0, 1), null);
});

test('the switcher order is kept, not the index order', () => {
    const parts = [{ index: 5, name: 'Bass' }, { index: 1, name: 'Bass 2' }, { index: 3, name: 'Bass 3' }];
    assert.equal(_nextPartIndex(parts, 5, 1), 1);
    assert.equal(_nextPartIndex(parts, 1, 1), 3);
    assert.equal(_nextPartIndex(parts, 3, 1), 5);
});
