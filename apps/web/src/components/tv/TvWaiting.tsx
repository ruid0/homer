import { copy } from "../../copy";

type Props = { pending: boolean; failed: boolean };

// What a section shows before it has data: a loading line, or a line saying it cannot load yet. Nothing once it has data.
export const TvWaiting = ({ pending, failed }: Props) => {
  if (failed) {
    return (
      <p role="alert" className="py-[0.5rem] text-answer text-late">
        {copy.tv.failed}
      </p>
    );
  }
  if (pending) {
    return (
      <p role="status" className="py-[0.5rem] text-answer text-muted">
        {copy.tv.loading}
      </p>
    );
  }
  return null;
};
