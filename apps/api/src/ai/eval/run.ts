import { parseArgs } from "node:util";
import { createOllamaClient } from "../ollama";
import { evaluateCase, summarize, type CaseResult } from "./evaluate";
import { goldenCases } from "./golden";

// pnpm eval -- --model qwen3.5:27b --think false --repeat 3 --only task-friday
// pnpm passes its own "--" through, so it is dropped.
const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: {
    model: { type: "string", default: process.env.LOCAL_TEXT_MODEL || "qwen3.5:9b" },
    think: { type: "string", default: process.env.LOCAL_LLM_THINK ?? "true" },
    host: { type: "string", default: process.env.OLLAMA_HOST || "http://127.0.0.1:11434" },
    repeat: { type: "string", default: "1" },
    only: { type: "string" },
  },
});

// The eval sends household-style prompts, so it only talks to this machine.
if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\/?$/.test(values.host)) {
  console.error(`Host ${values.host} is not on this machine. Use a loopback address.`);
  process.exit(1);
}

const chat = createOllamaClient({
  host: values.host,
  model: values.model,
  think: values.think !== "false",
  timeoutMs: Number(process.env.LOCAL_LLM_TIMEOUT_MS) || 300_000,
});

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

const main = async () => {
  const status = await chat.status();
  if (status !== "ready") {
    console.error(`Model ${values.model} is not ready (${status}). Start Ollama and pull the model first.`);
    process.exit(1);
  }
  const cases = goldenCases.filter((golden) => values.only === undefined || golden.id === values.only);
  const repeat = Math.max(1, Number(values.repeat) || 1);
  console.log(`model ${values.model}, think ${values.think}, ${cases.length} cases x ${repeat}`);

  const results: CaseResult[] = [];
  for (let run = 0; run < repeat; run += 1) {
    for (const golden of cases) {
      const result = await evaluateCase(golden, chat);
      results.push(result);
      const detail = result.passed ? "" : `  ${result.reason}\n        reply: ${result.reply.replace(/\s+/g, " ").slice(0, 200)}`;
      console.log(`${result.passed ? "pass" : "FAIL"}  ${seconds(result.ms).padStart(6)}  ${golden.id}${detail}`);
    }
  }

  const summary = summarize(results);
  console.log(
    `\n${summary.passed}/${summary.total} passed (${Math.round(summary.rate * 100)}%), median ${seconds(summary.medianMs)}, p90 ${seconds(summary.p90Ms)}`,
  );
  process.exit(summary.rate >= 0.9 ? 0 : 1);
};

await main();
