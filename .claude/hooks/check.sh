#!/usr/bin/env bash
# PostToolUse: after Claude edits TypeScript, typecheck and run the related
# tests. The coding skill asks for this; the hook guarantees it.
# Exit 2 sends the failure back to Claude so it fixes it in the same turn.

file=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).tool_input?.file_path??""))')

[[ "$file" =~ \.(ts|tsx)$ ]] || exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0

has_script() { node -e 'process.exit(require("./package.json").scripts?.[process.argv[1]]?0:1)' "$1"; }

if has_script typecheck; then
  if ! out=$(pnpm -s typecheck 2>&1); then
    echo "Typecheck failed after editing $file:" >&2
    echo "$out" | tail -40 >&2
    exit 2
  fi
fi

if ! out=$(pnpm -s exec vitest related "$file" --run --passWithNoTests 2>&1); then
  echo "Tests failed after editing $file:" >&2
  echo "$out" | tail -40 >&2
  exit 2
fi

exit 0
