#!/usr/bin/env bash
# PreToolUse: keep Claude away from secrets and the live database.
# HOMER's data lives in one SQLite file; it changes only through Drizzle
# migrations, never by hand. Exit 2 blocks the call and tells Claude why.

input=$(cat)
field() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.tool_input?.[process.argv[1]]??"")})' "$1" <<<"$input"; }

file=$(field file_path)
cmd=$(field command)

protected='(^|/)\.env(\.[^/]*)?$|\.(db|sqlite|sqlite3)(-wal|-shm)?$'

if [[ -n "$file" && "$file" =~ $protected && ! "$file" =~ \.env\.example$ ]]; then
  echo "Blocked: $file is protected. Secrets and the SQLite database are edited by the owner or by Drizzle migrations, not directly." >&2
  exit 2
fi

if [[ -n "$cmd" ]]; then
  if [[ "$cmd" =~ (rm|mv|sqlite3|\>)[^|]*\.(db|sqlite|sqlite3)([^a-z]|$) ]]; then
    echo "Blocked: this command would touch the SQLite database directly. Change data through the app or a Drizzle migration." >&2
    exit 2
  fi
  if [[ "$cmd" =~ (cat|less|head|tail|cp|mv)[[:space:]][^|]*\.env([^.a-z]|$) ]]; then
    echo "Blocked: reading or copying .env is not allowed. Use .env.example for the shape of the config." >&2
    exit 2
  fi
fi

exit 0
