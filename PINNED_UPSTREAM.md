# AlphaClaw Fork -- Archaeon

**Upstream:** https://github.com/chrysb/alphaclaw
**Pinned to:** v0.8.7 (commit 172e4531037a9d2f81120e50c052816d7b8f5e7a)
**Fork date:** 2026-04-08
**Review policy:** All upstream merges require diff review. Security patches cherry-picked within 48h. Feature updates evaluated monthly.

## Fork Changes

1. **Dependency pinning:** Removed `^` and `~` prefixes from all dependency versions in package.json to prevent unreviewed transitive updates.
2. **Deployment template removal:** Removed Railway and Render deploy buttons and references from README.md (code-level Railway/Render env var references retained as they are woven into URL resolution logic and removing them would break functionality).
3. **Upstream tracking:** Configured `upstream` remote pointing to chrysb/alphaclaw for future cherry-picks.

## NemoClaw Integration Status

### Watchdog Architecture (Key Finding)

AlphaClaw's watchdog is a **health-monitoring state machine**, not a process manager. The actual process management lives in `lib/server/gateway.js`:

- `launchGatewayProcess()` spawns `openclaw gateway run` as a child process via Node `spawn()`
- The watchdog monitors health via HTTP GET to the gateway's `/health` endpoint
- On crash, the watchdog calls `launchGatewayProcess()` to restart
- On crash loop (3 crashes in 300s), it runs `openclaw doctor --fix --yes` before restarting

**NemoClaw adaptation path:** The `clawCmd()` abstraction in `lib/server/commands.js` wraps `exec("openclaw <cmd>")`. For NemoClaw, this needs to become `exec("nemoclaw <name> <cmd>")`. The `launchGatewayProcess()` function in gateway.js similarly calls `spawn("openclaw", ["gateway", "run"])` -- this would become `spawn("nemoclaw", [name, "start"])`. The health check URL resolution would need to point to the NemoClaw sandbox's gateway port.

**Key abstraction points:**
- `createCommands({ gatewayEnv })` in commands.js -- single point for CLI command construction
- `launchGatewayProcess()` in gateway.js -- single point for process spawning
- `resolveGatewayHealthUrl` in watchdog creation -- single point for health endpoint
- `getGatewayPort()` / `getGatewayUrl()` in gateway.js -- single point for port/URL resolution

### Agent Discovery

AlphaClaw discovers agents by reading `<OPENCLAW_DIR>/openclaw.json` (the OpenClaw config file). It does not scan directories. The workspace root is `ALPHACLAW_ROOT_DIR` (default `~/.alphaclaw`), with `.openclaw` as a subdirectory. For NemoClaw multi-agent, each sandbox has its own config -- Argus would need to enumerate sandboxes via `nemoclaw list` or similar.

### Nodes Tab (v0.8.0+)

The Nodes tab manages VPS-connected "compute nodes" that can execute tools on behalf of the agent. It uses `openclaw nodes status/approve/invoke` CLI commands. This is a remote-execution routing feature, not fleet management. It could potentially be adapted for Argus node management but serves a different purpose.

## Upstream Tracking

Remote `upstream` configured: https://github.com/chrysb/alphaclaw.git
