#!/usr/bin/env bash
# PreToolUse: keep Claude away from live household data.
# What the household adds through the app (items, tasks, people, notes), the files it lives in (the SQLite database and
# its backups), secrets and the private address of the TV (.env files, local.properties) are not for Claude to read.
# Development and tests use fake data that Claude writes itself (seeds in tests, apps/e2e/tests/scratch.ts).
# Exit 2 blocks the call and tells Claude why. This is a guard rail for an agent that cooperates, not a sandbox.

exec node "$(dirname "$0")/no-live-data.mjs"
