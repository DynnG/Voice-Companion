export type CoachingNoteKind = 'strength' | 'improvement' | 'advice' | 'feedback';
/** Conservative presentation hints for existing plain-text coaching notes.
 * Mixed or ambiguous wording never receives an unqualified strength label.
 */
export function coachingNoteKind(text: string): CoachingNoteKind {
  const note = text.toLowerCase();
  const instruction = note.replace(/^(?:voice|typed) response\s*[—–:-]\s*/, '').trim();
  if (/^(prepare|develop|work on|improve|strengthen|practice|give|be more)\b/.test(instruction)) return 'improvement';
  if (/\b(knowledge gap|foundational concept|lesson-planning basics|lack(?:ed|s)? of preparation|prepare by|review the basics)\b/.test(note)) return 'improvement';
  if (/\b(next time|try|consider|aim to|you could|you should|remember to)\b/.test(note)) return 'advice';
  if (/\b(not|never|no concrete|no specific|lacked?|missing|failed|unclear|incomplete|too brief|cut off|did not|didn't|does not|doesn't|not enough|need to|needs|could be improved|but|however|hesitation moments)\b/.test(note)) return 'improvement';
  if (/\b(explain|address|provide|include|mention|add|describe|clarify|structure|name|focus on)\b/.test(note)) return 'advice';
  if (/\b(was clear|were clear|clear and|clear explanation|clearly explained|fluent|steady|well structured|well-structured|effectively|direct and|crisp)\b/.test(note)) return 'strength';
  if (/\b(your (?:answer|response|explanation|example) (?:clearly |effectively )?(?:included|provided|demonstrated|described)|you (?:clearly |effectively )?(?:explained|demonstrated|provided))\b/.test(note)) return 'strength';
  return 'feedback';
}
export const coachingNoteLabels: Record<CoachingNoteKind, string> = {
  strength: 'What went well', improvement: 'To improve', advice: 'Next step', feedback: 'Feedback',
};

/** Keep relevance feedback focused when the analysis explicitly identifies an off-topic answer. */
export function displayCoachingNotes(notes: string[]): { text: string; kind: CoachingNoteKind }[] {
  const isOffTopic = (text: string) => /\b(off[- ]topic|unrelated|irrelevant|lacks relevance|lacked relevance|not relevant|not connected|completely avoided)\b/i.test(text);
  const relevanceNotes = notes.filter(isOffTopic);
  if (relevanceNotes.length) return relevanceNotes.map(text => ({ text, kind: 'improvement' }));
  return notes.map(text => ({ text, kind: coachingNoteKind(text) }))
    .sort((a, b) => Number(b.kind === 'feedback') - Number(a.kind === 'feedback'));
}
