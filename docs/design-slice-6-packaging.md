# Slice 6: PWA and Docker Compose. Decisions and findings

Status: Built (shipped in v1.0.0) · Owner: Igor Bondarenko · Last updated: 2026-11-05 · Source: PRD §4.5, §5, §8 (slice 6).

This slice was small enough to skip a full design. This file records what was decided and what turned up while building it.

## Decisions

- **Installable, not offline.** A web manifest, icons (192, 512, maskable, apple-touch) and a theme colour per colour scheme. No service worker, because the data lives on the server and a stale offline copy would mislead.
- **Reached over Tailscale.** HOMER has no login, so the web port is bound to `127.0.0.1:3000` and the api is not published. `tailscale serve` adds the HTTPS an installable app needs. If another app already uses port 443, give HOMER its own with `--https=8443`.
- **A fresh database.** The household copy starts empty in the `homer-data` volume and is separate from the dev database. Nothing from dev reaches the image (`.dockerignore`).
- **Ollama stays native.** Docker on macOS has no GPU access, so the api reaches Ollama through `host.docker.internal`.
- **Time zone.** Containers run in UTC, so compose sets `TZ` for the api. The assistant works out "today" from it.

## Findings

- pnpm 12 fails a clean Docker build with `ERR_PNPM_NO_AGENT_SKILLS_DIR`. The Dockerfiles append a `skills: dirs` block to `pnpm-workspace.yaml`. It does not reproduce outside a clean image.
- nginx served the manifest as `application/octet-stream`. An exact-match location sets `application/manifest+json`.
- An api restart caused 502s from nginx until it was given a resolver (`127.0.0.11`) so the name is looked up again. The proxy timeouts are 600 s because assistant replies can be slow.
- The api has `GET /health`, which the compose healthcheck uses.
- The backup command in the README had not been run end to end when v1 shipped. The first v2 step replaces it with an automatic daily backup (`docs/v2-plan.md`).
