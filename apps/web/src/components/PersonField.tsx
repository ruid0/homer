import type { ListPerson } from "../trpc";
import { Field } from "./Field";
import { inputClass } from "./ui";
import { copy } from "../copy";

type Props = { label: string; people: readonly ListPerson[]; value: string; onChange: (value: string) => void };

export const PersonField = ({ label, people, value, onChange }: Props) => (
  <Field label={label}>
    <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{copy.common.nobody}</option>
      {people.map((person) => (
        <option key={person.id} value={person.id}>{person.name}</option>
      ))}
    </select>
  </Field>
);
