/**
 * Picks the best available speech synthesis voice.
 *
 * Left to itself the browser picks its default, which is routinely one of
 * the worst options installed — on macOS that is "Daniel", a voice from a
 * previous era, chosen from a list that also contains "Boing", "Bubbles"
 * and "Zarvox". Choosing deliberately costs nothing and is the single
 * biggest quality win available without a paid service.
 *
 * Voices differ per operating system and browser, so this scores what is
 * actually installed rather than naming one voice and hoping.
 */

/**
 * Novelty, character and legacy voices. These are real entries in the
 * macOS list and some sound like a 1990s answering machine; none should
 * ever be picked over a normal voice.
 */
const EXCLUDED =
  /^(albert|bad news|bahh|bells|boing|bubbles|cellos|eddy|flo|fred|good news|grandma|grandpa|jester|junior|kathy|organ|ralph|reed|rocko|sandy|shelley|superstar|trinoids|whisper|wobble|zarvox)\b/i;

/** Names known to sound decent across Apple and Microsoft platforms. */
const PREFERRED =
  /^(samantha|ava|allison|susan|serena|zoe|nicky|aaron|joelle|nathan|noelle|evan|tom|karen|moira|tessa|rishi|alex|victoria|anna|markus|petra|yannick|lekha|kiara|aditi|hemant|neel|swara)\b/i;

/**
 * Languages to borrow a voice from when none is installed for the one we
 * want, in order of preference.
 *
 * Urdu is the case that matters: no desktop platform ships an Urdu voice,
 * and without this an Urdu answer is read by an English voice, which is
 * unintelligible. Hindi and Urdu are near-identical spoken, so a Hindi
 * voice is a far better approximation than the default.
 *
 * Caveat: this works for romanised text. A Hindi voice fed Urdu in Arabic
 * script may produce nothing at all, since it has no mapping for those
 * glyphs. A real multilingual TTS service is the actual fix.
 */
const LANGUAGE_FALLBACKS: Record<string, string[]> = {
  ur: ["hi"],
  // Hindi speakers get Urdu voices if a platform ever ships one.
  hi: ["ur"],
};

/** Voice lists load asynchronously and can change; cache until they do. */
let cache = new Map<string, SpeechSynthesisVoice | null>();
let listening = false;

function resetCache(): void {
  cache = new Map();
}

function scoreVoice(voice: SpeechSynthesisVoice, lang: string): number {
  const name = voice.name;
  if (EXCLUDED.test(name)) return -Infinity;

  const wanted = lang.toLowerCase();
  const actual = voice.lang.toLowerCase().replace("_", "-");

  let score = 0;

  // Language first: a great voice in the wrong language is useless.
  const wantedBase = wanted.split("-")[0];
  const actualBase = actual.split("-")[0];

  if (actual === wanted) score += 100;
  else if (actualBase === wantedBase) score += 60;
  else {
    // A related language beats the browser's default, which would read the
    // text with whatever voice it felt like — usually an English one.
    const fallbacks = LANGUAGE_FALLBACKS[wantedBase];
    const rank = fallbacks?.indexOf(actualBase) ?? -1;
    if (rank === -1) return -Infinity;
    score += 30 - rank;
  }

  // Vendors label their better synthesis engines in the name or URI.
  const label = `${name} ${voice.voiceURI ?? ""}`;
  if (/natural|neural/i.test(label)) score += 50;
  if (/premium|enhanced/i.test(label)) score += 40;

  // Chrome's own voices are consistently better than most OS defaults.
  if (/^google\b/i.test(name)) score += 30;
  if (PREFERRED.test(name)) score += 25;

  // Tie-breaker only: being the default says nothing about quality.
  if (voice.default) score += 1;

  return score;
}

/**
 * Best installed voice for `lang`, or null to leave the browser's choice
 * alone — which is right when nothing matches the language at all.
 */
export function selectVoice(lang: string): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;

  const cached = cache.get(lang);
  if (cached !== undefined) return cached;

  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null; // Not loaded yet; don't cache a miss.

  if (!listening) {
    listening = true;
    window.speechSynthesis.addEventListener("voiceschanged", resetCache);
  }

  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -Infinity;

  for (const voice of voices) {
    const score = scoreVoice(voice, lang);
    if (score > bestScore) {
      bestScore = score;
      best = voice;
    }
  }

  const chosen = bestScore === -Infinity ? null : best;
  cache.set(lang, chosen);
  return chosen;
}
