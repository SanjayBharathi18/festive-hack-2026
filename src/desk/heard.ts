export type HeardPart = { text: string; heard: boolean };

// The transcript, with each phrase that the model took a value from marked,
// so that she can see which words became which row. A phrase that is not in
// the transcript word for word stays unmarked.
export function markHeard(
  transcript: string,
  phrases: readonly (string | null | undefined)[],
): HeardPart[] {
  const folded = transcript.toLocaleLowerCase();
  const spans: [number, number][] = [];
  const wanted = [
    ...new Set(
      phrases
        .map((phrase) => phrase?.trim() ?? "")
        .filter((phrase) => phrase.length > 1),
    ),
  ].sort((a, b) => b.length - a.length);
  for (const phrase of wanted) {
    const needle = phrase.toLocaleLowerCase();
    for (
      let at = folded.indexOf(needle);
      at !== -1;
      at = folded.indexOf(needle, at + needle.length)
    ) {
      const end = at + needle.length;
      if (spans.some(([from, to]) => at < to && end > from)) continue;
      spans.push([at, end]);
      break;
    }
  }
  spans.sort(([a], [b]) => a - b);
  const parts: HeardPart[] = [];
  let cursor = 0;
  for (const [from, to] of spans) {
    if (from > cursor) {
      parts.push({ text: transcript.slice(cursor, from), heard: false });
    }
    parts.push({ text: transcript.slice(from, to), heard: true });
    cursor = to;
  }
  if (cursor < transcript.length) {
    parts.push({ text: transcript.slice(cursor), heard: false });
  }
  return parts;
}
