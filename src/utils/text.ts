/** Text transformations shared across the app. */

/**
 * Strips markdown down to speakable plain text.
 *
 * Speech synthesis reads punctuation literally, so raw markdown comes out
 * as "star star bold star star". Code blocks are dropped entirely rather
 * than spelled out — nobody wants a function read aloud character by
 * character.
 *
 * This is intentionally a lightweight pass, not a real parser: the input is
 * our own agent's answers, and the output is spoken, never rendered.
 */
export function markdownToPlainText(markdown: string): string {
  return (
    markdown
      // Fenced code blocks — announce, don't read.
      .replace(/```[\s\S]*?```/g, " (code sample) ")
      .replace(/`([^`]+)`/g, "$1")
      // Images before links, so alt text survives and the URL does not.
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      // Emphasis markers.
      .replace(/(\*\*\*|___)(.*?)\1/g, "$2")
      .replace(/(\*\*|__)(.*?)\1/g, "$2")
      .replace(/(\*|_)(.*?)\1/g, "$2")
      .replace(/~~(.*?)~~/g, "$1")
      // Block syntax at line starts.
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^\s*>\s?/gm, "")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      .replace(/^\s*([-*_]\s*){3,}$/gm, "")
      // Tables read terribly. Drop the separator row, shed the outer pipes,
      // then turn the cell dividers into commas so TTS pauses between them.
      .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, "")
      .replace(/^\s*\|/gm, "")
      .replace(/\|\s*$/gm, "")
      .replace(/\s*\|\s*/g, ", ")
      // Any stray HTML.
      .replace(/<[^>]+>/g, "")
      // Collapse the whitespace all of the above leaves behind.
      .replace(/\n{2,}/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
  );
}

/**
 * Splits text into chunks that end on sentence boundaries.
 *
 * Chrome silently truncates a single utterance after roughly 15 seconds,
 * so long answers must be spoken as a queue of shorter utterances.
 */
export function splitIntoSpeechChunks(text: string, maxLength = 180): string[] {
  const sentences = text.match(/[^.!?\n]+[.!?]*\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current && current.length + sentence.length > maxLength) {
      chunks.push(current.trim());
      current = "";
    }

    // A single sentence longer than the cap: hard-split on whitespace.
    if (sentence.length > maxLength) {
      for (const word of sentence.split(/\s+/)) {
        if (current.length + word.length + 1 > maxLength) {
          chunks.push(current.trim());
          current = "";
        }
        current += `${word} `;
      }
    } else {
      current += sentence;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

/** Force a flush once the buffer gets this long with no boundary in sight. */
const MAX_UNSPOKEN_BUFFER = 320;

export interface SpeakableSplit {
  /** Text safe to speak now. Empty when nothing is ready. */
  ready: string;
  /** Text still being written; keep buffering it. */
  rest: string;
}

/**
 * Splits streamed markdown into a part that is safe to speak and a part
 * still arriving.
 *
 * Speech has to start before the answer is finished, but only on complete
 * thoughts — reading half a sentence aloud and pausing sounds broken. A
 * chunk is released at the last sentence terminator or line break.
 *
 * Two things are deliberately held back:
 *
 * - An unterminated code fence. Speaking it early would read raw backticks
 *   aloud, since the "(code sample)" substitution needs both fences.
 * - Everything after the final boundary, however long, until either a
 *   boundary arrives or the buffer passes `MAX_UNSPOKEN_BUFFER` — a long
 *   run with no punctuation (a bulleted list, say) should not stall speech
 *   indefinitely, so it is flushed at the last word break instead.
 */
export function takeSpeakableChunk(buffer: string): SpeakableSplit {
  if (!buffer) return { ready: "", rest: "" };

  // A marker split across network chunks — "``" of a "```" fence, or the
  // first "*" of a "**" — reads as ordinary text until its other half
  // arrives, so hold anything ending mid-marker.
  if (/(`{1,2}|\*{1,2}|_{1,2})$/.test(buffer)) return { ready: "", rest: buffer };

  // An odd number of fences means one is still open.
  if (countFences(buffer) % 2 === 1) return { ready: "", rest: buffer };

  const boundary = lastBoundaryIndex(buffer);
  if (boundary !== -1) {
    const ready = buffer.slice(0, boundary);
    // The boundary must not fall inside a code block.
    if (countFences(ready) % 2 === 0) {
      return { ready, rest: buffer.slice(boundary) };
    }
    return { ready: "", rest: buffer };
  }

  if (buffer.length <= MAX_UNSPOKEN_BUFFER) return { ready: "", rest: buffer };

  // No boundary and the buffer is long: break at the last word instead.
  const lastSpace = buffer.lastIndexOf(" ");
  if (lastSpace <= 0) return { ready: "", rest: buffer };
  return { ready: buffer.slice(0, lastSpace), rest: buffer.slice(lastSpace) };
}

function countFences(text: string): number {
  return text.match(/```/g)?.length ?? 0;
}

/** Index just past the last sentence terminator or line break. */
function lastBoundaryIndex(buffer: string): number {
  // Terminator, optional closing quote/bracket, then whitespace.
  const sentence = /[.!?]["')\]]*\s/g;
  let index = -1;
  let match: RegExpExecArray | null;

  while ((match = sentence.exec(buffer)) !== null) {
    index = match.index + match[0].length;
  }

  const newline = buffer.lastIndexOf("\n");
  return Math.max(index, newline === -1 ? -1 : newline + 1);
}
