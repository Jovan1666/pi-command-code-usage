# Changelog

## 1.0.1 — 2026-09-24

- **The monthly amount on the status line is labelled.** `月 ██▏ 18% 剩$57.60` — the bar is what
  has been used and the figure is what is left, so the figure needed a word in front of it.
  Same in the three-row layout.
- **Quota snapshots refresh every three minutes instead of every minute** (`cacheTtl` 60s → 180s).
  The old default equalled the refresh interval the extension uses, so every tick started a
  background process and made four API calls — for a number that cannot visibly move in three
  minutes. Pass `--cache-ttl 60` to restore the old cadence.

## 1.0.0 — 2026-09-21

First release.

**Core (`src/cc-usage.mjs`)**

- Reads Command Code plan usage: rolling 5-hour and weekly windows, monthly credits,
  reset times. Caps come from the API; a local plan table is only a fallback.
- Credential discovery in five steps, from explicit env vars through the provider routes
  the user already configured.
- Disk snapshot with background refresh: first call is a live read, later calls answer in
  ~90 ms from the snapshot and refresh behind it.
- Decides **per turn** whether the session is actually routed to Command Code — from the
  local router's own env mapping, or the model the transcript records. Not in Command
  Code's public model catalog → the status line hides itself.
- Fails quietly: no credential, no API access, offline, or a rejected key all render
  nothing rather than an error. A failed fetch backs off for five minutes.
- Runs as a CLI or imports as a library (`fetchView()`, `resolveCredentials()`, `normalize()`).

**pi extension**

- A `belowEditor` widget above pi's input box, asking the script for one line
  (`--statusline --rows 1`).
- `/ccq-bar on|off|toggle|refresh|status` — handled by the extension itself, so it costs no
  model turn. This platform has no `/quota`.
- Fetches on session start, every 60 seconds, and once more after each turn; overlapping
  refreshes are de-duplicated, and a failed fetch keeps the last good numbers on screen.
- The widget handle comes from `setWidget`'s component factory and `ctx` is never held across
  sessions — calling a UI method on a stale `ctx` makes pi throw, which the first version did.
