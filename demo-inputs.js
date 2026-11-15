// SetList demo inputs (bundled so a judge sees both engines without pasting).
// SHORT_BRIEF is under the 600-char routing threshold: it takes the on-device path.
// LONG_SCRIPT is well over it: it takes the cloud path for the full breakdown.

export const SHORT_MAX_CHARS = 600;

export const SHORT_BRIEF = `Wedding highlight film. Golden hour at the venue garden. The couple walks from the mandap to the fountain as guests throw petals. Capture the walk, the petal throw, and a tight shot of the rings. One camera, handheld, 30 minutes before sunset. Deliver a 60 second cut.`;

export const LONG_SCRIPT = `THE LAST REEL - short film, 4 scenes.

SCENE 1 - INT. EDIT SUITE - NIGHT
MARA (32) sits alone among monitors, the glow of a timeline on her face. A hard drive labelled "REEL 07" blinks on the desk. She presses play. On screen, her younger self laughs on a beach.
MARA (V.O.): We kept everything. Every take, every mistake. That was the job.

SCENE 2 - EXT. BEACH - DAY (FLASHBACK)
Young MARA (22) runs along the shoreline with a camcorder, chasing her brother DEV (19) into the surf. He turns, grinning, and splashes her. The camera dips, the frame goes white with spray, then finds them both laughing.
DEV: You missed it!
MARA: I never miss. I just keep the good parts.

SCENE 3 - INT. EDIT SUITE - NIGHT
MARA stops the playback. She opens a drawer and pulls out a stack of labelled tapes. She picks one marked "DEV - LAST DAY" and holds it a long moment before slotting it into the deck. The monitor flickers.
MARA (whispering): One more take.

SCENE 4 - EXT. ROOFTOP - DAWN
MARA stands on the rooftop with a projector. The film plays against the water tank: DEV waving from the beach, frozen mid-laugh. The sun rises behind the projection. MARA smiles, finally, and lets the reel run to the end.
MARA (V.O.): Some shots you only get once. So you keep them forever.`;

export const DEMO_INPUTS = [
  { id: 'short', label: 'Short brief (on-device path)', text: SHORT_BRIEF },
  { id: 'long', label: 'Long script (cloud path)', text: LONG_SCRIPT },
];
