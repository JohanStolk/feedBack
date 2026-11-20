// Display formatters. A LEAF module: imports nothing.
//
// WHY THIS EXISTS FOR ONE FUNCTION. formatTime was a HOST HOOK — loops.js and
// section-practice.js both reached back through the seam for it. It was also, by pure
// accident of who calls it, inside the dependency closure of the library carve. Leaving
// it there would have made loops.js and section-practice.js import the LIBRARY to format
// a timestamp, which is nonsense, and a cycle waiting to happen.
//
// A hook is a cycle you agreed to live with. This one has a real owner — it just isn't
// app.js, and it certainly isn't the library. Give it a home of its own and both
// consumers import it directly.
//
// It is a leaf on purpose. Anything else that turns out to be a shared pure formatter
// belongs here too; nothing does yet, so nothing else is here.

/** Seconds -> `M:SS`. */
export function formatTime(s) { return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }

// m:ss.cc (hundredths), for the player's position while paused or slowed down, when
// you're checking where exactly a note falls. Rounded down so it never runs ahead of
// the m:ss display.
export function formatTimePrecise(s) {
    const cs = Math.floor(Math.max(0, s) * 100);
    const sec = Math.floor(cs / 100);
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}
