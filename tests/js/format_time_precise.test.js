// formatTimePrecise (static/js/format.js): the player's m:ss.cc position while
// paused or slowed down.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'static', 'js', 'format.js')).href);

test('hundredths, rounded down, minutes rolling over', async () => {
    const { formatTimePrecise, formatTime } = await load();
    assert.equal(formatTimePrecise(0), '0:00.00');
    assert.equal(formatTimePrecise(22.589), '0:22.58');
    assert.equal(formatTimePrecise(59.999), '0:59.99');
    assert.equal(formatTimePrecise(60), '1:00.00');
    assert.equal(formatTimePrecise(253.5), '4:13.50');
    assert.equal(formatTimePrecise(-0.2), '0:00.00');
    // Never ahead of the whole-second display.
    for (const s of [0.999, 22.999, 119.995]) {
        assert.equal(formatTimePrecise(s).split('.')[0], formatTime(s));
    }
});
