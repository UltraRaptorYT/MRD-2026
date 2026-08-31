import { zoneCounts } from "@/lib/game";
import type { SimulatedPlayer } from "@/lib/types";

export function ZoneSummary({ players, compact = false }: { players: SimulatedPlayer[]; compact?: boolean }) {
  const counts = zoneCounts(players);
  return (
    <div className={compact ? "zone-summary zone-summary-compact" : "zone-summary"}>
      {(["A", "B", "C"] as const).map((zone) => (
        <div className={`zone-count zone-${zone.toLowerCase()}`} key={zone}>
          <span>{zone}</span><strong>{counts[zone]}</strong><small>players</small>
        </div>
      ))}
      {counts.uncertain > 0 && (
        <div className="zone-count zone-uncertain">
          <span>?</span><strong>{counts.uncertain}</strong><small>move fully</small>
        </div>
      )}
    </div>
  );
}
