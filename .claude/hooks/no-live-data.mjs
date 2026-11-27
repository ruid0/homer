// The checks behind no-live-data.sh. Reads the hook input (JSON) on stdin; exit 2 blocks the call.
let input = "";
process.stdin.on("data", (chunk) => (input += chunk)).on("end", () => {
  const { tool_name: tool = "", tool_input: args = {} } = JSON.parse(input || "{}");

  const block = (what) => {
    console.error(
      `Blocked: ${what} is live household data or a secret. Claude works with fake data only: write a seed in a test ` +
        "or in apps/e2e/tests/scratch.ts, and use .env.example or local.properties.example for the shape of a config.",
    );
    process.exit(2);
  };

  // A path (Read, Grep, Glob) that holds live data.
  const live = (raw) => {
    if (typeof raw !== "string" || raw === "") return false;
    const path = raw.replace(/\/+$/, "");
    if (/(^|\/)\.env(\.(?!example$)[^/]*)?$/.test(path)) return true;
    if (/\.(db|sqlite|sqlite3)(-wal|-shm|-journal)?$/.test(path)) return true;
    if (/(^|\/)local\.properties$/.test(path)) return true;
    // The backups folder holds copies of the database. apps/api/src/backups is code and stays readable.
    if (/(^|\/)backups(\/|$)/.test(path) && !/(^|\/)src\/backups(\/|$)/.test(path)) return true;
    if (/(^|\/)(apps\/api\/)?data(\/|$)/.test(path) && !/(^|\/)src\//.test(path)) return true;
    return false;
  };

  if (tool === "Read") live(args.file_path) && block(args.file_path);
  if (tool === "NotebookEdit") live(args.notebook_path) && block(args.notebook_path);
  if (tool === "Grep" || tool === "Glob") live(args.path) && block(args.path);
  if (tool === "Grep" && typeof args.glob === "string") live(args.glob.replace(/\*+/g, "x")) && block(args.glob);

  if (tool === "Bash" && typeof args.command === "string") {
    const cmd = args.command;
    const reading =
      "(cat|less|more|head|tail|tac|nl|grep|egrep|fgrep|rg|ag|sed|awk|cut|sort|uniq|strings|xxd|hexdump|od|bat|jq|" +
      "sqlite3|cp|scp|rsync|tar|zip|gzip|gunzip|open|source|base64|tee)";
    // .env needs a non-word before the dot (process.env is code); a database suffix does not (but ctx.db and the like are code). backups and data count
    // only at the start of a path word, so apps/api/src/backups stays readable.
    const place =
      "((?<!\\w)\\.env(\\.(?!example)[\\w.-]*)?(?![\\w.-])|(?<!\\b(ctx|tx|this|app|deps|context))\\.(db|sqlite3?)(-wal|-shm|-journal)?(?!\\w)|" +
      "local\\.properties(?!\\.example)|" +
      "(?<![^\\s\"'=])(\\./|[^\\s\"']*/homer/)?(apps/api/)?(backups|data)(/|\\s|$))";
    const verb = new RegExp(`(^|[\\s;&|(])${reading}\\s[^|;&]*${place}`);
    const redirect = new RegExp(`(<|\\$\\(<)\\s*[^|;&\\s]*${place}`);
    const dot = new RegExp(`(^|[;&]\\s*)\\.\\s+[^|;&]*${place}`);
    if (verb.test(cmd) || redirect.test(cmd) || dot.test(cmd)) block("a file this command reads");
    // The running household copy and its data volume.
    if (/(^|[\s;&|(])docker(\s+compose|-compose)?\s+(exec|cp|run)\b/.test(cmd)) block("the household container");
    if (/(^|[\s;&|(])docker\s+volume\b/.test(cmd)) block("the household data volume");
    // The agent port of the household copy answers with live data.
    if (/(curl|wget|nc|http|httpie)\b[^|;&]*(127\.0\.0\.1|localhost|0\.0\.0\.0):3002\b/.test(cmd)) block("the MCP port");
  }
  process.exit(0);
});
