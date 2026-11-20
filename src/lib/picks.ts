// What a form starts on, so the common entry takes the fewest clicks.

/**
 * The category an entry form opens on: the one just saved if it is offered here,
 * else the most recently logged one that is (`recent` is newest first), else the first.
 */
export function startCategory(choices: { id: string }[], saved: string | undefined, recent: string[]): string | undefined {
  const offered = new Set(choices.map((c) => c.id));
  if (saved && offered.has(saved)) return saved;
  return recent.find((id) => offered.has(id)) ?? choices[0]?.id;
}
