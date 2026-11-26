/** The haunting meter (haunted-design Requirement 1). Pure. */

export interface HauntingLevel {
  /** 0 (Peaceful) to 4 (Cursed). */
  level: 0 | 1 | 2 | 3 | 4;
  name: "Peaceful" | "Restless" | "Haunted" | "Possessed" | "Cursed";
  /** What the level means, in terms of the neighborhood. */
  meaning: string;
}

const LEVELS: HauntingLevel[] = [
  { level: 0, name: "Peaceful", meaning: "quieter than at least half of its neighbors" },
  { level: 1, name: "Restless", meaning: "more haunted than half of its neighbors" },
  { level: 2, name: "Haunted", meaning: "more haunted than three in four of its neighbors" },
  { level: 3, name: "Possessed", meaning: "in the worst 10% of its neighborhood" },
  { level: 4, name: "Cursed", meaning: "in the worst 2% of its neighborhood" },
];

/** `moreHauntedThan` is the share of neighbors with a strictly lower score, in [0, 1). */
export function hauntingLevel(moreHauntedThan: number, score: number): HauntingLevel {
  const p = Number.isFinite(moreHauntedThan) ? moreHauntedThan : 0;
  const i = score <= 0 || p < 0.5 ? 0 : p < 0.75 ? 1 : p < 0.9 ? 2 : p < 0.98 ? 3 : 4;
  return LEVELS[i] as HauntingLevel;
}
