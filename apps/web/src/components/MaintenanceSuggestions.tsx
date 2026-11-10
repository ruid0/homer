import { copy } from "../copy";
import { Field } from "./Field";
import { inputClass } from "./ui";

export type Suggestion = (typeof copy.maintenance.suggestions)[number];

type Props = { takenNames: string[]; selectedName: string; onPick: (suggestion: Suggestion) => void };

// Common jobs to start from, in one dropdown so the phone's own picker does the choosing and the dialog stays short.
// One already on the list is left out.
export const MaintenanceSuggestions = ({ takenNames, selectedName, onPick }: Props) => {
  const taken = new Set(takenNames.map((name) => name.toLowerCase()));
  const suggestions = copy.maintenance.suggestions.filter((suggestion) => !taken.has(suggestion.name.toLowerCase()));
  if (suggestions.length === 0) return null;
  const chosen = suggestions.some((suggestion) => suggestion.name === selectedName) ? selectedName : "";
  return (
    <Field label={copy.maintenance.suggestionsLabel}>
      <select
        className={inputClass}
        value={chosen}
        onChange={(event) => {
          const suggestion = suggestions.find((candidate) => candidate.name === event.target.value);
          if (suggestion) onPick(suggestion);
        }}
      >
        <option value="">{copy.maintenance.suggestionsPlaceholder}</option>
        {suggestions.map((suggestion) => (
          <option key={suggestion.name} value={suggestion.name}>{suggestion.name}</option>
        ))}
      </select>
    </Field>
  );
};
