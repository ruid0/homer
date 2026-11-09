import { defineConfig, devices } from "@playwright/test";

// Two scratch copies of HOMER, each with its own in-memory database, so the household data is never touched:
// one with notifications on and one with them off. The api clock and the browser both run in UTC.
const copies = {
  on: { api: 3991, web: 3992 },
  off: { api: 3993, web: 3994 },
  // Its own copy: the upkeep list is shared by everyone, so these tests run one after another and start by clearing it.
  upkeep: { api: 3995, web: 3996 },
};

const apiServer = (name: keyof typeof copies) => ({
  command: "pnpm exec tsx src/index.ts",
  cwd: "../api",
  url: `http://127.0.0.1:${copies[name].api}/health`,
  reuseExistingServer: false,
  env: {
    PORT: String(copies[name].api),
    DATABASE_PATH: ":memory:",
    TZ: "UTC",
    BACKUP_DIR: `./.tmp/e2e-${name}`,
    // Pinned so nothing from the developer's shell leaks in.
    NTFY_TOKEN: "",
    HOMER_PUBLIC_URL: "",
    DEPLETION_TIME: "05:30",
    END_OF_DAY_TIME: "20:00",
    BACKUP_TIME: "23:59",
    NTFY_HOUSEHOLD_TOPIC: name === "on" ? "e2e-household" : "",
    // Nothing listens here, so no note can leave the machine.
    NTFY_SERVER: name === "on" ? "http://127.0.0.1:9" : "",
  },
});

const webServer = (name: keyof typeof copies) => ({
  command: `pnpm exec vite --host 127.0.0.1 --port ${copies[name].web} --strictPort`,
  cwd: "../web",
  url: `http://127.0.0.1:${copies[name].web}`,
  reuseExistingServer: false,
  env: { API_URL: `http://127.0.0.1:${copies[name].api}` },
});

// Tests share one in-memory database per copy, so every test makes its own person (see tests/scratch.ts) and must stay scoped to it.
export default defineConfig({
  testDir: "./tests",
  reporter: [["list"]],
  // No retries: a test that passes only on the second try is a flaky test, and should be fixed.
  retries: 0,
  use: { timezoneId: "UTC", locale: "en-US", trace: "retain-on-failure" },
  projects: [
    {
      name: "notifications-on",
      testMatch: /\.on\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], baseURL: `http://127.0.0.1:${copies.on.web}` },
    },
    {
      name: "upkeep",
      testMatch: /\.upkeep\.spec\.ts$/,
      testIgnore: /(home|list)\.upkeep\.spec\.ts$/,
      fullyParallel: false,
      use: { ...devices["Desktop Chrome"], baseURL: `http://127.0.0.1:${copies.upkeep.web}` },
    },
    {
      // The same copy and the same shared list, so it waits for the upkeep project instead of running beside it.
      name: "upkeep-home",
      testMatch: /home\.upkeep\.spec\.ts$/,
      dependencies: ["upkeep"],
      fullyParallel: false,
      use: { ...devices["Desktop Chrome"], baseURL: `http://127.0.0.1:${copies.upkeep.web}` },
    },
    {
      // Also the same copy and list: it waits for the home project, so no two files clear the list at once.
      // The cost: a failure in the upkeep or home specs skips these tests, and a new spec for this list needs its own project in the chain.
      name: "upkeep-list",
      testMatch: /list\.upkeep\.spec\.ts$/,
      dependencies: ["upkeep-home"],
      fullyParallel: false,
      use: { ...devices["Desktop Chrome"], baseURL: `http://127.0.0.1:${copies.upkeep.web}` },
    },
    {
      name: "notifications-off",
      testMatch: /\.off\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], baseURL: `http://127.0.0.1:${copies.off.web}` },
    },
  ],
  webServer: [apiServer("on"), webServer("on"), apiServer("off"), webServer("off"), apiServer("upkeep"), webServer("upkeep")],
});
