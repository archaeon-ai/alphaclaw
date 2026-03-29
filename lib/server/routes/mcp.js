const { randomUUID } = require("crypto");
const { createRequire } = require("module");

// Load the SDK through openclaw's dependency tree so its express@5 peer
// stays nested and never hoists over AlphaClaw's express@4 at the app root.
const openclawRequire = createRequire(require.resolve("openclaw"));
const {
  StreamableHTTPServerTransport,
} = openclawRequire("@modelcontextprotocol/sdk/server/streamableHttp.js");

const {
  isMcpBridgeRunning,
  getMcpBridgeStatus,
  startMcpBridge,
  stopMcpBridge,
  writeToMcpBridge,
  setOnMcpMessage,
} = require("../mcp-bridge");
const { getGatewayPort } = require("../gateway");
const { readOpenclawConfig } = require("../openclaw-config");

const resolveGatewayWsUrl = ({ openclawDir, gatewayPort }) => {
  const cfg = readOpenclawConfig({ openclawDir, fallback: {} });
  const gatewayTlsEnabled = cfg?.gateway?.tls?.enabled === true;
  const scheme = gatewayTlsEnabled ? "wss" : "ws";
  return `${scheme}://127.0.0.1:${gatewayPort}`;
};

const sessions = new Map();
let activeTransport = null;
const kSseKeepAliveMs = 15_000;
const kMaxSessions = 8;

let nextBridgeId = 1;
const pendingRequests = new Map();

const adoptSession = (sessionId, transport) => {
  sessions.set(sessionId, transport);
  activeTransport = transport;

  if (sessions.size > kMaxSessions) {
    const oldestId = sessions.keys().next().value;
    if (oldestId !== sessionId) {
      const old = sessions.get(oldestId);
      sessions.delete(oldestId);
      old.close().catch(() => {});
      console.log(`[mcp] Evicted oldest session: ${oldestId}`);
    }
  }
};

const forwardToBridge = (message, transport) => {
  if (message.id != null) {
    const bridgeId = nextBridgeId++;
    pendingRequests.set(bridgeId, { originalId: message.id, transport });
    writeToMcpBridge({ ...message, id: bridgeId });
  } else {
    writeToMcpBridge(message);
  }
};

const cleanupTransport = (transport) => {
  for (const [id, t] of sessions) {
    if (t === transport) {
      sessions.delete(id);
      break;
    }
  }
  for (const [bridgeId, pending] of pendingRequests) {
    if (pending.transport === transport) pendingRequests.delete(bridgeId);
  }
  if (activeTransport === transport) activeTransport = null;
};

const closeAllSessions = () => {
  for (const [, t] of sessions) t.close().catch(() => {});
  sessions.clear();
  pendingRequests.clear();
  activeTransport = null;
};

const registerMcpRoutes = ({
  app,
  requireAuth,
  constants,
  gatewayEnv,
  openclawDir,
}) => {
  setOnMcpMessage((message) => {
    if (message.id != null) {
      const pending = pendingRequests.get(message.id);
      if (pending) {
        pendingRequests.delete(message.id);
        pending.transport
          .send({ ...message, id: pending.originalId })
          .catch((err) => {
            console.error("[mcp] Failed to forward response:", err?.message);
          });
      }
      return;
    }
    if (activeTransport) {
      activeTransport.send(message).catch(() => {});
    }
  });

  // ── Internal API (session auth) ────────────────────────────────

  app.get("/api/mcp/info", requireAuth, (_req, res) => {
    const port = getGatewayPort();
    const gatewayWsUrl = resolveGatewayWsUrl({
      openclawDir,
      gatewayPort: port,
    });
    res.json({
      ok: true,
      ...getMcpBridgeStatus(),
      gatewayPort: port,
      gatewayWsUrl,
      tokenAvailable: !!constants.GATEWAY_TOKEN,
      gatewayToken: constants.GATEWAY_TOKEN || "",
    });
  });

  app.post("/api/mcp/start", requireAuth, (_req, res) => {
    const port = getGatewayPort();
    const result = startMcpBridge({
      gatewayEnv,
      gatewayWsUrl: resolveGatewayWsUrl({
        openclawDir,
        gatewayPort: port,
      }),
      gatewayToken: constants.GATEWAY_TOKEN,
    });
    res.json(result);
  });

  app.post("/api/mcp/stop", requireAuth, async (_req, res) => {
    closeAllSessions();
    const result = stopMcpBridge();
    res.json(result);
  });

  // ── MCP transport endpoint (token auth) ────────────────────────

  const validateMcpToken = (req, res) => {
    const bearerToken = String(req.get("authorization") || "")
      .replace(/^Bearer\s+/i, "")
      .trim();
    const queryToken = String(req.query?.token || "");
    const rawToken = bearerToken || queryToken;
    const normalizedToken = rawToken.replace(/ /g, "+");
    if (!constants.GATEWAY_TOKEN) {
      res
        .status(503)
        .json({ error: "Gateway token is not configured for MCP transport" });
      return false;
    }
    if (!normalizedToken || normalizedToken !== constants.GATEWAY_TOKEN) {
      res.status(401).json({ error: "Invalid or missing token" });
      return false;
    }
    return true;
  };

  // Primary MCP endpoint – Streamable HTTP (GET / POST / DELETE)
  app.all("/mcp/sse", async (req, res) => {
    if (!validateMcpToken(req, res)) return;

    if (!isMcpBridgeRunning()) {
      res.status(503).json({ error: "MCP bridge is not running" });
      return;
    }

    if (req.method === "GET") {
      res.setHeader("X-Accel-Buffering", "no");
      const keepAliveId = setInterval(() => {
        if (res.headersSent && !res.writableEnded) {
          res.write(": keepalive\n\n");
        }
      }, kSseKeepAliveMs);
      res.on("close", () => clearInterval(keepAliveId));
    }

    const sessionId = req.headers["mcp-session-id"];

    // ── Existing session ───────────────────────────────────────
    if (sessionId) {
      const transport = sessions.get(sessionId);
      if (transport) {
        console.log(
          `[mcp] ${req.method} sessionId=${sessionId} → routed (sessions=${sessions.size})`,
        );
        try {
          await transport.handleRequest(req, res, req.body);
        } catch (err) {
          console.error(
            "[mcp] handleRequest error (existing session):",
            err?.message,
          );
          if (!res.headersSent) {
            res.status(500).json({ error: "Internal transport error" });
          }
        }
      } else {
        console.log(
          `[mcp] ${req.method} sessionId=${sessionId} → NOT FOUND (sessions=${sessions.size})`,
        );
        res.status(404).json({
          jsonrpc: "2.0",
          error: {
            code: -32001,
            message: "Session not found. The server may have been restarted.",
          },
          id: null,
        });
      }
      return;
    }

    // ── New session (POST without session ID) ────────────────
    if (req.method === "POST") {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (newSessionId) => {
          adoptSession(newSessionId, transport);
          console.log(
            `[mcp] Session adopted: ${newSessionId} (sessions=${sessions.size})`,
          );
        },
      });

      transport.onmessage = (message) => {
        forwardToBridge(message, transport);
      };

      transport.onclose = () => {
        cleanupTransport(transport);
        console.log(`[mcp] Transport closed (sessions=${sessions.size})`);
      };

      transport.onerror = (err) => {
        console.error("[mcp] Transport error:", err?.message);
      };

      await transport.start();

      try {
        await transport.handleRequest(req, res, req.body);
      } catch (err) {
        console.error(
          "[mcp] handleRequest error (new session):",
          err?.message,
        );
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to initialize MCP session" });
        }
      }
      return;
    }

    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32600, message: "Bad Request" },
      id: null,
    });
  });

  // Legacy endpoint for SSE-transport clients that POST to /mcp/message
  app.post("/mcp/message", async (req, res) => {
    if (!validateMcpToken(req, res)) return;
    if (!isMcpBridgeRunning()) {
      res.status(503).json({ error: "MCP bridge is not running" });
      return;
    }
    if (!activeTransport) {
      res.status(503).json({ error: "No active MCP session" });
      return;
    }
    try {
      await activeTransport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("[mcp] handleRequest error (/mcp/message):", err?.message);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal transport error" });
      }
    }
  });
};

module.exports = { registerMcpRoutes };
