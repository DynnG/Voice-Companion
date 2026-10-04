export function transcriptHighlightRanges(text: string): Array<{ start: number; end: number }> {
  const words = Array.from(text.matchAll(/\b[a-z]+(?:['’][a-z]+)?\b/gi));
  const highlighted = new Set<number>();
  words.forEach((word, index) => {
    if (/^(basically|like|really|um|uh|ah|er|erm|hmm)$/i.test(word[0])) highlighted.add(index);
    const previous = words[index - 1];
    if (previous && previous[0].toLowerCase() === word[0].toLowerCase()
        && /^[\s.,…!?;:\-–—]*$/.test(text.slice(previous.index! + previous[0].length, word.index))) {
      highlighted.add(index - 1); highlighted.add(index);
    }
  });
  return words.flatMap((word, index) => highlighted.has(index)
    ? [{ start: word.index!, end: word.index! + word[0].length }] : []);
}
