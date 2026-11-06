import { copy } from "../copy";
import { toggleButton } from "./ui";

export type Suggestion = (typeof copy.maintenance.suggestions)[number];

type Props = { takenNames: string[]; selectedName: string; onPick: (suggestion: Suggestion) => void };

// Common items to start from. One already on the list is left out.
export const MaintenanceSuggestions = ({ takenNames, selectedName, onPick }: Props) => {
  const taken = new Set(takenNames.map((name) => name.toLowerCase()));
  const suggestions = copy.maintenance.suggestions.filter((suggestion) => !taken.has(suggestion.name.toLowerCase()));
  if (suggestions.length === 0) return null;
  return (
    <div className="grid gap-2" role="group" aria-label={copy.maintenance.suggestionsLabel}>
      <span>{copy.maintenance.suggestionsLabel}</span>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.name}
            type="button"
            className={toggleButton(selectedName === suggestion.name)}
            aria-pressed={selectedName === suggestion.name}
            onClick={() => onPick(suggestion)}
          >
            {suggestion.name}
          </button>
        ))}
      </div>
    </div>
  );
};
