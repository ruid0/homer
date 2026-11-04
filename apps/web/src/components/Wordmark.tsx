import { Link } from "react-router-dom";
import { copy } from "../copy";

export const Wordmark = () => (
  <Link
    to="/"
    className="inline-flex min-h-11 items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
  >
    <svg viewBox="0 0 64 64" className="size-8" aria-hidden="true">
      <rect width="64" height="64" rx="14" className="fill-primary" />
      <path className="fill-on-primary" d="M32 13 12 30h6v19h10V37h8v12h10V30h6z" />
    </svg>
    <span className="text-section font-extrabold tracking-tight">{copy.brand.name}</span>
  </Link>
);
