import { useEffect } from "react";

const CHECK_MS = 5 * 60_000;
// An ask that hangs is given up on, so asks never pile up on a screen that stays on for weeks.
const ASK_TIMEOUT_MS = 30_000;

// The build a page came from, read off the scripts it loads: a rebuild gives them new file names. The dev tools' own
// scripts (the ones under "/@") are left out. Nothing found gives "", which never counts as a new build.
export const buildOf = (sources: readonly string[]): string =>
  sources
    .filter((source) => !source.includes("/@"))
    .sort()
    .join(" ");

const sourcesIn = (root: ParentNode) =>
  Array.from(
    root.querySelectorAll<HTMLScriptElement>("script[type=module][src]"),
    (script) => script.getAttribute("src") ?? "",
  );

// A TV is never reloaded by hand, so after HOMER is rebuilt it would keep showing the old page for ever. This asks for
// the page every few minutes and reloads when it comes from another build. A failed ask changes nothing.
export const useReloadOnNewBuild = (everyMs = CHECK_MS) => {
  useEffect(() => {
    const running = buildOf(sourcesIn(document));
    const timer = setInterval(async () => {
      try {
        const response = await fetch("/", { cache: "no-store", signal: AbortSignal.timeout(ASK_TIMEOUT_MS) });
        if (!response.ok) return;
        const page = new DOMParser().parseFromString(await response.text(), "text/html");
        // Only HOMER's own page counts: a sign-in page or an error page from something in between has scripts too.
        if (!page.getElementById("root")) return;
        const served = buildOf(sourcesIn(page));
        if (served !== "" && running !== "" && served !== running) window.location.reload();
      } catch {
        // HOMER is down or the network dropped: the next check tries again.
      }
    }, everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
};
