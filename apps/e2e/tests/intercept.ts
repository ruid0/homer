import type { Page } from "@playwright/test";

type Answer = { error: { message: string; code: number; data: { code: string; httpStatus: number } } };

export const failure = (message: string): Answer => ({
  error: { message, code: -32603, data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 } },
});

// The web app batches calls into one request ("/trpc/a,b,c"). This changes the answer to one call and leaves the rest alone.
// `when` is waited for before the answer is sent, so a test can hold a call in the loading state.
export const interceptCall = async (page: Page, procedure: string, change: { answer?: Answer; when?: Promise<void> }) => {
  await page.route("**/trpc/**", async (route) => {
    const names = new URL(route.request().url()).pathname.replace("/trpc/", "").split(",");
    const index = names.indexOf(procedure);
    if (index < 0) return route.continue();
    await change.when;
    if (!change.answer) return route.continue();
    // A failed write must not reach the server, or the test would change data while claiming it failed.
    if (route.request().method() === "POST") return route.fulfill({ status: 500, json: names.map(() => change.answer) });
    const response = await route.fetch();
    const body = (await response.json()) as unknown[];
    await route.fulfill({ response, json: body.map((item, position) => (position === index ? change.answer : item)) });
  });
};

// A promise a test can open later. Tests release it in a finally block so a failed assertion cannot leave a request hanging.
export const gate = () => {
  const open: { release: () => void } = { release: () => {} };
  const when = new Promise<void>((resolve) => (open.release = resolve));
  return { when, release: () => open.release() };
};
