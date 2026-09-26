# Command Code Usage — pi extension

See how much of your **Command Code** plan is left — 5-hour, weekly and monthly windows,
with reset times — **in a line just above pi's input box**.

Runs on your machine. No model round-trip, so **checking your quota costs no quota**.

[简体中文](README.zh-CN.md) · [What was verified](docs/FINDINGS.md)

[![Check](https://github.com/Jovan1666/pi-command-code-usage/actions/workflows/check.yml/badge.svg)](https://github.com/Jovan1666/pi-command-code-usage/actions/workflows/check.yml)

---

```
────────────────────────────────────────────────────────────  ← input box
CC GOAT │ 5h ███▎░░░░░░ 32% 3h12m后重置 │ 周 ████▏░░░░░ 41% 10-03重置 │ 月 █▊░░░░░░░░ 18% 剩$57.60 10-25重置
~                                                              ← pi's own footer, left as it is
0.0%/1.0M (auto)                    (anthropic) claude-opus-4-8 • medium
```

The line is a `belowEditor` widget, so pi keeps its own footer and this sits directly above it.

## Install

```sh
pi install git:github.com/Jovan1666/pi-command-code-usage

# or, from a local clone
pi install ./pi-command-code-usage
```

A manual install works too, but **copy `index.ts` and `src/cc-usage.mjs` together** — with
`index.ts` alone the extension cannot locate the script, the widget stays silently empty, and
nothing is reported:

```sh
mkdir -p ~/.pi/agent/extensions/commandcode-usage
cp index.ts src/cc-usage.mjs ~/.pi/agent/extensions/commandcode-usage/
```

The extension looks for `cc-usage.mjs` both beside `index.ts` and in a `src/` subdirectory, so
either layout is found. This one script is the whole implementation — there is nothing to
build, and no package to install.

Nothing here asks for your API key up front. The script finds it — see [Credentials](#credentials).

## What it shows

| Window | Meaning | On GOAT |
|---|---|---|
| 5-hour | Rolling burst limit — one long session cannot drain the month | $14 |
| Weekly | Rolling 7-day limit | $35 |
| Monthly | The billing period's credit allowance | $70 |

Each window shows **percent used**, a bar, and **when it resets** (a countdown under a day,
a date beyond that). The monthly one also shows the credit left.

Colors follow how full the window is — green under 60 %, amber to 85 %, red above. (The
terminal and HTML panels use a slightly earlier 50 / 80 split; the status line is the one that
had to be tuned for a glance, so it warns later.)

Plans with no rolling windows (Provider, Enterprise) show the balance alone.
Plans without API access (Go) render nothing at all in the status line — no error, no empty
box. Ask for the terminal panel on such a plan and it *does* fail loudly, because there you
asked a direct question and silence would be the wrong answer.

## It hides itself when you are not using it

If you configured Command Code but switched to another model, a permanent quota bar is noise.
The script decides **per turn** whether a session is actually routed there:

1. **Your local router's own mapping** — tools like `cc-switch` write
   `ANTHROPIC_DEFAULT_OPUS_MODEL` / `..._MODEL_NAME` pairs into the env; the script reads the
   pair to learn the real upstream model. This is the router's own configuration, not a guess.
   (This one is an inference rather than a measurement — see
   [what was verified](docs/FINDINGS.md) — so if it ever comes up empty the script falls
   through to the next level rather than guessing.)
2. **The session transcript** — the model each message actually used.
3. **Account activity** — fallback, only when the two above say nothing.

The resolved model is checked against Command Code's public model catalog
(`/provider/v1/models`, no auth needed). Not in the catalog → hidden.

Some model names are genuinely ambiguous (a bare `claude-opus-5` exists both natively and in
Command Code's catalog), and those are deliberately **not guessed** — add your own with
`--model <substring>` instead.

**This extension opts out of the gate:** it asks for the line with `--always`, so the widget
does not blink out mid-session — it keeps showing the numbers it last fetched. Run the script
yourself (`node src/cc-usage.mjs --statusline --why`) for the per-turn verdict and the reason a
line would currently be hidden, or use `--idle-hide <minutes>` to hide on account inactivity.

## Commands

This platform has **no `/quota` command** — the extension registers `/ccq-bar`, and the
extension handles it itself, so it never goes through the model and never spends a turn.

```
/ccq-bar              current state: is the line on, and the numbers as last fetched
/ccq-bar on|off       show / hide the line
/ccq-bar toggle       flip it
/ccq-bar refresh      fetch now instead of waiting for the next tick
/ccq-bar status       the same as /ccq-bar with no argument
```

An unrecognised argument falls back to the status report rather than failing. Every
subcommand answers with a notification, so you can see which one ran.

## How it behaves

- Fetches once at session start, then every 60 seconds, and **once more after each turn** —
  the moment right after a turn is when the numbers are most worth looking at.
- Overlapping refreshes are de-duplicated; they cannot pile up.
- When a fetch fails the last good numbers stay on screen and no error is shown — red text
  where the numbers were is worse than a stale number.
- The widget does **not** truncate: a line wider than the terminal breaks the whole TUI. The
  script's own width ladder (driven by the `COLUMNS` variable, which the extension sets to 120)
  keeps it inside the terminal.
- In non-TUI mode (`pi -p`, `--mode json`) there is no UI to draw into, so the widget is a
  no-op: data is still fetched, but nothing displays it.

## Before you change this code

**pi forbids holding `ctx` across sessions.** Calling any UI method on an old `ctx` throws:

```
Error: This extension ctx is stale after session replacement or reload.
```

So the shape of `index.ts` is deliberate:

- `setWidget` is given a **component factory**; the `tui` handle comes from the factory's own
  argument and is kept for the extension's lifetime.
- After a refresh, only `tui.requestRender()` is called — `ctx` is not touched.
- Every call that needs `setWidget` uses the `ctx` from **that** event.

The first version kept `ctx` in a variable and reused it from a timer, and pi crashed with
exactly the error above. Nothing in pi's type definitions hints at this — it only shows up when
you actually run it.

## Credentials

Found automatically, in this order:

1. `COMMAND_CODE_API_KEY` / `COMMANDCODE_API_KEY` / `CMD_API_KEY`
2. any env var whose name contains `commandcode`
3. `~/.commandcode/auth.json` (the official CLI's login state)
4. a Command Code provider route in your own config (`~/.pi/agent/settings.json` among the
   paths read)
5. text configs that carry the key, or name an environment variable to read it from
   (`apiKeyEnv` indirection)

If nothing is found the status line simply does not render — it never prints an error into your
editor.

## Requirements

- **Node 18+** for the script (the extension itself needs nothing else)
- A Command Code plan with API access — the `$1` Go tier does not have one
- pi with extension and widget support (developed against pi 0.86.1, where the `belowEditor`
  widget was confirmed on screen)

## A note on pacing warnings

The script computes a burn-rate projection. **The widget never shows it**; the terminal panel,
`--compact`, `--md` and `--html` still print it, and `--json` always carries it.

It stays out of the status line for a reason: extrapolating from a short sample says "you will
run out" almost every time — 25 minutes into a 5-hour window a normal burst projects to 140 % —
and a warning that is always on is not a warning. Where it *is* printed you asked for a panel,
so the extra line costs you nothing.

## Contributing

```sh
node scripts/check.mjs          # everything: rendering, gating, threshold, formats, secrets, the extension's own rules
node scripts/check.mjs --quiet  # one line per suite
```

That is the same script CI runs, so a local pass means a green build. It never touches the
network and needs no credentials.

`src/cc-usage.mjs` is the implementation — edit it directly. Nothing in this repository is
generated or copied at build time.

## License

MIT — see [LICENSE](LICENSE).
