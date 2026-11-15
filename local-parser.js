// Local stand-in shotlist parser (DEMO MODE ONLY).
//
// This is a deterministic, rule-based parser that runs entirely in the browser.
// It is NOT Gemini Nano, NOT on-device inference, and NOT the cloud model. It
// exists so the interface, routing log and save flow can be exercised end to end
// before the Firebase project is connected. Every result it produces is labelled
// "LOCAL PARSER (stand-in)" in the UI and in the routing log, and it is never
// presented as model output. When Firebase is configured, app.js uses Firebase
// AI Logic instead and this parser is only used if a model call fails.

function splitScenes(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const scenes = [];
  let current = { heading: 'Opening', body: [] };
  let seenHeading = false;
  const headingRe = /^(INT\.|EXT\.|SCENE\s*\d+|SCENE\s+\d+\s*-)/i;
  for (const line of lines) {
    if (headingRe.test(line)) {
      // A title/preamble before the first heading is not a scene: drop it.
      if (current.body.length > 0 && seenHeading) scenes.push(current);
      current = { heading: line, body: [] };
      seenHeading = true;
    } else {
      current.body.push(line);
    }
  }
  if (current.body.length > 0 || scenes.length === 0) scenes.push(current);
  return scenes;
}

function pickDetail(sentence) {
  const m = sentence.match(/"([^"]+)"/);
  if (m) return `Detail on "${m[1]}"`;
  const m2 = sentence.match(/\b(rings?|petals?|fountain|mandap|sunset|reel|tape|drive|projector|surf|beach)\b/i);
  if (m2) return `Close-up on the ${m2[1].toLowerCase()}`;
  return 'Close-up on the key subject';
}

function firstSentence(lines) {
  const joined = lines.join(' ');
  const m = joined.match(/[^.!?]+[.!?]/);
  return (m ? m[0] : joined).trim();
}

// Build a shotlist from plain text. Pure function: same input, same output.
export function parseShotlistLocally(text) {
  const clean = String(text || '').trim();
  if (!clean) return { title: 'Empty input', shots: [], callSheet: { scenes: 0, totalShots: 0, estRuntimeSeconds: 0, notes: ['No input text.'] } };
  const scenes = splitScenes(clean);
  const shots = [];
  let n = 0;
  for (const scene of scenes) {
    const action = firstSentence(scene.body);
    shots.push({ n: ++n, scene: scene.heading, shot: 'Wide establishing', description: `Establish the location and mood: ${action}`, camera: 'Wide, locked off', durationSeconds: 5 });
    shots.push({ n: ++n, scene: scene.heading, shot: 'Medium action', description: `Cover the main action: ${action}`, camera: 'Medium, handheld', durationSeconds: 6 });
    const dialogue = scene.body.find((l) => /:\s/.test(l) && /^[A-Z][A-Z ]{1,20}:/.test(l));
    if (dialogue) {
      shots.push({ n: ++n, scene: scene.heading, shot: 'Over-the-shoulder', description: `Dialogue beat: ${dialogue.trim()}`, camera: 'OTS, eye level', durationSeconds: 5 });
    }
    shots.push({ n: ++n, scene: scene.heading, shot: 'Close-up detail', description: pickDetail(action), camera: 'Close-up, 85mm', durationSeconds: 4 });
  }
  const total = shots.reduce((s, sh) => s + sh.durationSeconds, 0);
  const gear = /handheld/i.test(clean) ? 'One camera, handheld' : /drone/i.test(clean) ? 'Camera A + drone' : 'Camera A, tripod + handheld';
  return {
    title: scenes.length > 1 ? 'Multi-scene shotlist' : 'Single-scene shotlist',
    shots,
    callSheet: {
      scenes: scenes.length,
      totalShots: shots.length,
      estRuntimeSeconds: total,
      notes: [`Gear: ${gear}.`, `Scenes detected: ${scenes.length}.`, 'Local stand-in parse: verify against the script before shooting.'],
    },
  };
}

// Routing decision: short inputs are attempted on-device first, long inputs go
// straight to the cloud. Pure function, unit-tested.
export function decideRoute(charCount, shortMaxChars) {
  if (charCount <= shortMaxChars) return 'ON_DEVICE_FIRST';
  return 'CLOUD_ONLY';
}
