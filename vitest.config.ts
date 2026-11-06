import { configDefaults, defineConfig } from "vitest/config";

// The browser tests in apps/e2e run with `pnpm e2e`, not here.
export default defineConfig({ test: { exclude: [...configDefaults.exclude, "apps/e2e/**"] } });
