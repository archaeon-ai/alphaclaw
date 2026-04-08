# AlphaClaw -- Archaeon Fork

## Purpose

This is Archaeon's fork of [AlphaClaw](https://github.com/chrysb/alphaclaw) (v0.8.7), an Express+Preact web dashboard for managing OpenClaw AI agent instances. It serves as the foundation for **Argus**, Archaeon's fleet management system for NemoClaw sandboxes.

## What Changed From Upstream

### Dependency Pinning
All npm dependency versions pinned to exact versions (removed `^` and `~` prefixes). This prevents unreviewed transitive dependency updates per Archaeon security policy.

### Deployment Template Removal
Removed Railway and Render deploy buttons from README.md. Archaeon deploys to its own VPS infrastructure (Hetzner CX53) via systemd, not PaaS templates. Code-level references to Railway/Render environment variables (e.g., `RAILWAY_PUBLIC_DOMAIN`, `RENDER_EXTERNAL_URL`) are retained because they are woven into URL resolution logic across multiple files and removing them would break the URL fallback chain without providing security benefit.

### What Was NOT Changed
- **Onboarding wizard:** Tightly integrated with the main app flow (routes, frontend state, gateway bootstrap). Not removable without significant refactoring. Irrelevant for Argus since agents will be provisioned via fleet scripts, not the UI wizard.
- **Auto-approval for first CLI device:** Located in `lib/server/routes/pairings.js` (lines 222-244). Uses a marker file (`cli-device-auto-approved.json`) to auto-approve exactly one CLI pairing request. This is a one-shot convenience feature, not a security hole. Retained.

## NemoClaw Integration Architecture

### Current State: Single-Agent Dashboard
AlphaClaw manages exactly one OpenClaw gateway instance as a child process. The watchdog monitors that single process.

### Target State: Argus Fleet Management
Argus needs to manage N NemoClaw sandboxes. The integration path:

1. **Command layer** (`lib/server/commands.js`): Replace `exec("openclaw <cmd>")` with `exec("nemoclaw <name> <cmd>")`, parameterized by agent name.
2. **Process layer** (`lib/server/gateway.js`): Replace `spawn("openclaw", ["gateway", "run"])` with `spawn("nemoclaw", [name, "start"])`. Each agent gets its own child process tracker.
3. **Watchdog layer** (`lib/server/watchdog.js`): Create per-agent watchdog instances. The watchdog is already a clean factory function (`createWatchdog()`) that takes injected dependencies -- instantiate one per agent.
4. **Health check layer**: Each NemoClaw sandbox runs its gateway on a unique port. `resolveGatewayHealthUrl` needs to be per-agent.
5. **Frontend**: The sidebar already has agent navigation. Extend to show per-agent health, watchdog status, and controls.

### Key Insight
The architecture is more adaptable than expected. The watchdog is a pure state machine with injected dependencies (`clawCmd`, `launchGatewayProcess`, `resolveGatewayHealthUrl`). Creating per-agent instances is straightforward. The harder part is the UI -- the current frontend assumes a single gateway.

## Security Considerations

- `SETUP_PASSWORD` auth uses HMAC-SHA256 signed session tokens (7-day TTL) with timing-safe comparison. Adequate for internal fleet use behind Tailscale.
- Login rate limiting: 5 attempts per 10-minute window, exponential backoff lockout (1min base, 15min max).
- Session cookie: `setup_token`, httpOnly, sameSite=lax, 7-day maxAge.
- No HTTPS termination (expected behind reverse proxy or Tailscale).

## Audit Results

8 vulnerabilities found (4 moderate, 4 high). All are in transitive dependencies of `openclaw` (hono, vite) or dev dependencies (picomatch, path-to-regexp). No direct AlphaClaw code vulnerabilities. The hono fix requires a breaking OpenClaw version change. Vite and picomatch are dev-only.

## File Map

| Path | Purpose |
|------|---------|
| `bin/alphaclaw.js` | CLI entrypoint, env loading, gateway bootstrap |
| `lib/server.js` | Express app setup, dependency wiring |
| `lib/server/gateway.js` | Gateway process management (spawn, restart, health) |
| `lib/server/watchdog.js` | Health monitoring state machine |
| `lib/server/commands.js` | CLI command abstraction (openclaw, gog) |
| `lib/server/routes/` | Express route handlers |
| `lib/server/constants.js` | Configuration constants |
| `lib/public/` | Preact frontend (htm, wouter) |
| `PINNED_UPSTREAM.md` | Fork tracking and upstream policy |
