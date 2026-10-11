// Pins the optional note-name labels in plugins/highway_3d/screen.js
// (noteNamesVisible): a note name (C, C#, D, Eb, E, F, F#, G, Ab, A, Bb, B)
// above single-note gems, following tuning and capo.
//
// The pitch helpers are pure top-level functions, so they are sliced out of
// the source and executed; the setting wiring is checked at source level like
// the other tests/js/ files.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCREEN_JS = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'screen.js');
const SETTINGS_HTML = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'settings.html');
// screen.js is checked in with CRLF; normalise so the slicing below is EOL-agnostic.
const src = fs.readFileSync(SCREEN_JS, 'utf8').replace(/\r\n/g, '\n');

function slice(startRe, endMarker) {
    const start = src.search(startRe);
    assert.ok(start >= 0, `missing ${startRe}`);
    const end = src.indexOf(endMarker, start);
    assert.ok(end > start, `missing end of ${startRe}`);
    return src.slice(start, end + endMarker.length);
}

// _BASE_OPEN_MIDI_* constants + _baseOpenStringMidis + the note-name helper.
const helpers = new Function(
    slice(/const _BASE_OPEN_MIDI_BASS4 = /, '\n    }\n') // through _baseOpenStringMidis
    + '\n' + slice(/const _NOTE_NAMES_COMMON = /, ';\n')
    + '\n' + slice(/function _noteNameForFret\(/, '\n    }\n')
    + '\nreturn { _baseOpenStringMidis, _noteNameForFret, _NOTE_NAMES_COMMON };',
)();
const { _baseOpenStringMidis, _noteNameForFret, _NOTE_NAMES_COMMON } = helpers;

const guitar = _baseOpenStringMidis(6, 'Lead');   // E A D G B E
const bass = _baseOpenStringMidis(4, 'Bass');     // E A D G

test('uses the common spelling for each pitch class', () => {
    assert.deepEqual(_NOTE_NAMES_COMMON,
        ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']);
});

test('3rd fret on the low E is G (guitar and bass)', () => {
    assert.equal(_noteNameForFret(guitar[0], 3, 0), 'G');
    assert.equal(_noteNameForFret(bass[0], 3, 0), 'G');
});

test('sharps and flats come out as F#, Bb, C#, Eb, Ab', () => {
    assert.equal(_noteNameForFret(guitar[0], 2, 0), 'F#'); // E string fret 2
    assert.equal(_noteNameForFret(guitar[1], 1, 0), 'Bb'); // A string fret 1
    assert.equal(_noteNameForFret(guitar[1], 4, 0), 'C#'); // A string fret 4
    assert.equal(_noteNameForFret(guitar[2], 1, 0), 'Eb'); // D string fret 1
    assert.equal(_noteNameForFret(guitar[3], 1, 0), 'Ab'); // G string fret 1
});

test('open strings name the string; octaves are not shown', () => {
    assert.deepEqual(guitar.map((m) => _noteNameForFret(m, 0, 0)), ['E', 'A', 'D', 'G', 'B', 'E']);
    assert.equal(_noteNameForFret(guitar[0], 12, 0), 'E');
});

test('tuning offsets shift the name (Eb standard, drop D)', () => {
    assert.equal(_noteNameForFret(guitar[0] - 1, 0, 0), 'Eb');
    assert.equal(_noteNameForFret(guitar[0] - 2, 0, 0), 'D');
    assert.equal(_noteNameForFret(guitar[0] - 2, 5, 0), 'G');
});

test('capo raises open strings only; chart frets already count from the nut', () => {
    assert.equal(_noteNameForFret(guitar[0], 0, 2), 'F#'); // open = capo 2
    assert.equal(_noteNameForFret(guitar[0], 3, 2), 'G');  // fret 3 is still G
});

// Slide helpers: the label names the fret the gliding gem is over.
const slide = new Function(
    slice(/function slideTrailEnd\(/, '\n    }\n')
    + '\n' + slice(/function slideEaseW\(/, '\n    }\n')
    + '\n' + slice(/function slideFretNow\(/, '\n    }\n')
    + '\nreturn { slideFretNow };',
)();

test('during a slide the name follows the gem to the new fret', () => {
    const n = { t: 10, f: 3, sus: 1, sl: 5 };                 // low E, 3 → 5 (G → A)
    assert.equal(slide.slideFretNow(n, 9.5), 3);              // not yet played
    assert.equal(slide.slideFretNow(n, 10), 3);               // onset
    assert.equal(slide.slideFretNow(n, 11), 5);               // slide finished
    assert.equal(slide.slideFretNow(n, 12), 5);               // lingering after it
    assert.equal(_noteNameForFret(guitar[0], slide.slideFretNow(n, 11), 0), 'A');
    const mid = slide.slideFretNow(n, 10.6);
    assert.ok(mid >= 3 && mid <= 5, `mid-slide fret ${mid} stays between start and end`);
});

test('notes without a slide keep their own fret', () => {
    assert.equal(slide.slideFretNow({ t: 0, f: 7, sus: 2 }, 1), 7);
    assert.equal(slide.slideFretNow({ t: 0, f: 0, sus: 2, sl: 2 }, 1), 0); // open: no glide
});

test('the label uses the sliding fret only while the gem is gliding', () => {
    assert.match(src, /const nameFret = slideXNow !== 0 \? slideFretNow\(n, now, slideSt\) : n\.f;/);
});

test('setting defaults off and is wired like the other per-frame toggles', () => {
    assert.match(src, /const BG_DEFAULTS = \{[^}]*noteNamesVisible: false/);
    assert.match(src, /const _BG_BOOL_KEYS = new Set\(\[[^\]]*'noteNamesVisible'/);
    assert.match(src, /window\.h3dBgSetNoteNamesVisible = \(v\) => _bgWriteGlobal\('noteNamesVisible', !!v\)/);
    assert.match(src, /changedKey === 'noteNamesVisible'\) \{/);
    assert.match(src, /noteNamesVisible = _bgReadSetting\(panelKey, 'noteNamesVisible'\)/);
});

test('labels come from a pool that is reset every frame', () => {
    assert.match(src, /pNoteNameLbl = pool\(lblG,/);
    assert.match(src, /pNoteNameLbl\.reset\(\);/);
});

test('only single notes get a name (chords keep their chord name)', () => {
    assert.match(src, /if \(noteNamesVisible && !fromChord && _noteNameOpenMidi\[s\] !== undefined\)/);
});

test('settings page has the checkbox and mirrors the default', () => {
    const html = fs.readFileSync(SETTINGS_HTML, 'utf8');
    assert.match(html, /id="h3d-note-names-visible"[\s\S]*?window\.h3dBgSetNoteNamesVisible\(this\.checked\)/);
    assert.match(html, /const DEFAULTS = \{[^}]*noteNamesVisible: false/);
    assert.match(html, /localStorage\.getItem\('h3d_bg_noteNamesVisible'\)/);
});
