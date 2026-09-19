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
