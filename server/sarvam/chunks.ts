const sentences = new Intl.Segmenter(undefined, { granularity: "sentence" });

export function splitAtSentences(text: string, max: number): string[] {
  const units = [...sentences.segment(text)].flatMap(({ segment }) =>
    segment.length <= max
      ? [segment]
      : (segment.match(/\S+\s*/g) ?? []).flatMap((word) => cut(word, max)),
  );
  const chunks: string[] = [];
  let current = "";
  for (const unit of units) {
    if (current.length + unit.length > max && current.trim() !== "") {
      chunks.push(current.trim());
      current = "";
    }
    current += unit;
  }
  if (current.trim() !== "") chunks.push(current.trim());
  return chunks;
}

function cut(word: string, max: number): string[] {
  const parts: string[] = [];
  let part = "";
  for (const character of word) {
    if (part.length + character.length > max) {
      parts.push(part);
      part = "";
    }
    part += character;
  }
  if (part !== "") parts.push(part);
  return parts;
}
