import type { ReactNode } from "react";

export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="grid min-w-0 gap-1">
    <span>{label}</span>
    {children}
  </label>
);
