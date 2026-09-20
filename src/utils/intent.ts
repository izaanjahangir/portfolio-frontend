/**
 * Lightweight intent detection on what the visitor said.
 *
 * Deliberately a keyword match, not a model call: it has to decide in the
 * same tick the transcript arrives, and a wrong "goodbye" would cut off a
 * live conversation. The patterns below are kept narrow for that reason —
 * missing a farewell is harmless (the visitor taps stop), ending one by
 * mistake is not.
 */

/**
 * Phrases that end a voice conversation. Anchored on word boundaries so
 * "by the way" and "maybe" don't trigger a goodbye.
 */
const FAREWELL_PATTERNS: RegExp[] = [
  /\bbye\b/,
  /\bgoodbye\b/,
  /\bgood bye\b/,
  /\bsee (you|ya)\b/,
  /\btalk (to you|again) (later|soon)\b/,
  // "that's all right, tell me more" is not a goodbye.
  /\bthat'?s (all|it|everything)\b(?! ?right)/,
  /\bthat is (all|it|everything)\b(?! ?right)/,
  /\bi'?m (done|good|all set)\b/,
  /\bnothing else\b/,
  /\bgood ?night\b/,
];

/**
 * Only the end of an utterance is considered.
 *
 * A real sign-off comes last ("ok, thanks, bye"), whereas a farewell word
 * early on is usually the visitor talking *about* it — "goodbye is a
 * strange word to ask about" should not hang up on them.
 */
const TAIL_WORDS = 6;

function normalize(text: string): string {
  return text
    .toLowerCase()
    // Keep apostrophes so "that's" still matches; drop the rest.
    .replace(/[^\p{L}\p{N}'\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the visitor is signing off. */
export function isFarewell(text: string): boolean {
  const normalized = normalize(text);
  if (!normalized) return false;

  const tail = normalized.split(" ").slice(-TAIL_WORDS).join(" ");
  return FAREWELL_PATTERNS.some((pattern) => pattern.test(tail));
}

/**
 * True when the agent's reply ends in a question.
 *
 * Used only on the fallback path, when the backend sent no metadata: an
 * answer that asks something almost certainly needs one back, so a
 * keyword-matched "goodbye" should not hang up on it. When the backend
 * does report `end_of_conversation`, that verdict wins and this is not
 * consulted — the agent knows better than a heuristic.
 */
export function looksLikeQuestion(text: string): boolean {
  return /\?["')\]]*\s*$/.test(text.trim());
}
