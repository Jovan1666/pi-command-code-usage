# Security Policy

## Supported versions

The latest commit on `main` is supported. Fixes land there; there are no backport
branches and no maintained older releases.

## Reporting a vulnerability

Report privately through GitHub: open the **Security** tab of
<https://github.com/Jovan1666/pi-command-code-usage> and choose **Report a
vulnerability**. If that channel is not available to you, open a normal issue that
says only that you have a security report and how to reach you — put no details in
the issue itself.

Say what you ran, what happened, and what you expected; a minimal reproduction is
worth more than a long description. This is a personal project maintained in spare
time, so expect an acknowledgement within a few days, and please hold public
disclosure until a fix is out.

## What this repository does with your machine

The extension and the one script it runs have the same shape, and that shape *is*
the security model:

| | |
|---|---|
| **Reads** | pi's own settings, config and session data — the files pi already writes, and nothing else. |
| **Writes** | One cache directory, `~/.commandcode-usage/` (the public model catalog, 24 h TTL). |
| **Sends** | HTTPS to `https://api.commandcode.ai` with **your own** key. No other host appears in the code. |
| **Collects** | Nothing. No telemetry, no analytics, no error reporting, no identifiers. |
| **Install** | Runs nothing. No `postinstall` script, no downloaded code, no remote configuration. |

The API calls are `GET /alpha/whoami`, `/alpha/billing/credits`,
`/alpha/billing/subscriptions`, `/alpha/usage/summary` — all with your key — and
`/provider/v1/models`, which is public and needs no key at all.

### This plugin writes no host config

pi loads extensions through its own mechanism, so this repository never edits a file
of pi's: `pi install` fetches the package, and a manual install is a plain copy into
`~/.pi/agent/extensions/`. There is no setup step, no installer script, and nothing to
undo — deleting the extension directory is a complete uninstall.

The only file the extension itself writes is the cache directory above; the widget's
on/off state lives in memory for the session and is not persisted anywhere.

## Credentials

Your Command Code key is discovered in this order, and used for nothing except the
`Authorization` header of the requests listed above:

1. `COMMAND_CODE_API_KEY`, `COMMANDCODE_API_KEY`, or `CMD_API_KEY`
2. any environment variable whose name contains `commandcode`
3. `~/.commandcode/auth.json` (written by the Command Code CLI login)
4. the Command Code provider route you configured yourself — `~/.pi/agent/settings.json`
   is read for this, and the key must be attached to a route that names Command Code
5. a text config that carries the key, or names the environment variable to read it
   from (`apiKeyEnv` indirection)

A key is never written to a log, to the cache, or into anything the plugin renders.
Prefer the environment variable over a literal in a config file that might get
committed. If you believe a key of yours is exposed, revoke it in your Command Code
account first — that is the only step that actually helps.

## Scope

In scope: anything in this repository that leaks a credential, sends data anywhere
other than the API base above, writes outside the paths listed here, or turns an
untrusted input (a session file, a transcript, a config value) into code execution.

Out of scope: the Command Code API itself; pi and its extension mechanism; and
anything that requires an attacker who already holds your key or your shell.
