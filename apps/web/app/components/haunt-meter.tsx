import { hauntingLevel } from "@/lib/haunting";
import { Ghost } from "./ghost";

/** Five ghosts, lit up to the building's haunting level (haunted-design Requirement 1). */
export function HauntMeter({ moreHauntedThan, score }: { moreHauntedThan: number; score: number }) {
  const h = hauntingLevel(moreHauntedThan, score);
  return (
    <div className={`meter meter-${h.level}`} role="img" aria-label={`Haunting level: ${h.name}, ${h.level + 1} of 5`}>
      <div className="meter-ghosts" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <Ghost key={i} size={30} className={i <= h.level ? "lit" : "unlit"} />
        ))}
      </div>
      <div className="meter-text" aria-hidden>
        <span className="meter-name">{h.name}</span>
        <span className="meter-meaning">This building is {h.meaning}.</span>
      </div>
    </div>
  );
}
