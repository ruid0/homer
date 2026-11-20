import { copy } from "../copy";
import { suggestionCycle, type Suggestion } from "./MaintenanceSuggestions";
import { cx } from "./ui";

// The empty Upkeep page: common jobs, one tap each. A tap opens the Add job dialog with that job filled in, and saves
// nothing.
export const MaintenanceStarters = ({ onPick }: { onPick: (suggestion: Suggestion) => void }) => (
  <div className="grid gap-4">
    <p>{copy.maintenance.empty}</p>
    <ul className="grid gap-2">
      {copy.maintenance.suggestions.map((suggestion) => {
        const { every, unit } = suggestionCycle(suggestion);
        return (
          <li key={suggestion.name}>
            <button
              type="button"
              className={cx(
                "flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-control",
                "bg-card px-4 py-2 text-left font-semibold hover:bg-hover",
              )}
              onClick={() => onPick(suggestion)}
            >
              <span>{suggestion.name}</span>
              <span className="font-normal text-muted">{copy.maintenance.cycle(every, unit)}</span>
            </button>
          </li>
        );
      })}
    </ul>
    <p className="text-meta text-muted">{copy.maintenance.emptyHint}</p>
  </div>
);
