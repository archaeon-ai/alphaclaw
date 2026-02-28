const kTelegramTopicConcurrencyMultiplier = 3;
const kAgentConcurrencyFloor = 8;
const kSubagentConcurrencyFloor = 4;

const syncConfigForTelegram = ({
  fs,
  openclawDir,
  topicRegistry,
  groupId,
  requireMention = false,
  resolvedUserId = "",
}) => {
  const configPath = `${openclawDir}/openclaw.json`;
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));

  // Remove legacy root keys from older setup flow.
  delete cfg.sessions;
  delete cfg.groups;
  delete cfg.groupAllowFrom;

  if (!cfg.channels) cfg.channels = {};
  if (!cfg.channels.telegram) cfg.channels.telegram = {};
  if (!cfg.channels.telegram.groups) cfg.channels.telegram.groups = {};
  const existingGroupConfig = cfg.channels.telegram.groups[groupId] || {};
  cfg.channels.telegram.groups[groupId] = {
    ...existingGroupConfig,
    requireMention,
  };

  const registryTopics = topicRegistry.getGroup(groupId)?.topics || {};
  const promptTopics = {};
  for (const [threadId, topic] of Object.entries(registryTopics)) {
    const systemPrompt = String(topic?.systemInstructions || "").trim();
    if (!systemPrompt) continue;
    promptTopics[threadId] = { systemPrompt };
  }
  if (Object.keys(promptTopics).length > 0) {
    cfg.channels.telegram.groups[groupId].topics = promptTopics;
  } else {
    delete cfg.channels.telegram.groups[groupId].topics;
  }

  cfg.channels.telegram.groupPolicy = "allowlist";
  if (!Array.isArray(cfg.channels.telegram.groupAllowFrom)) {
    cfg.channels.telegram.groupAllowFrom = [];
  }
  if (
    resolvedUserId
    && !cfg.channels.telegram.groupAllowFrom.includes(String(resolvedUserId))
  ) {
    cfg.channels.telegram.groupAllowFrom.push(String(resolvedUserId));
  }

  // Persist thread sessions and keep concurrency in schema-valid agent defaults.
  if (!cfg.session) cfg.session = {};
  if (!cfg.session.resetByType) cfg.session.resetByType = {};
  cfg.session.resetByType.thread = { mode: "idle", idleMinutes: 525600 };

  const totalTopics = topicRegistry.getTotalTopicCount();
  const maxConcurrent = Math.max(
    totalTopics * kTelegramTopicConcurrencyMultiplier,
    kAgentConcurrencyFloor,
  );
  if (!cfg.agents) cfg.agents = {};
  if (!cfg.agents.defaults) cfg.agents.defaults = {};
  cfg.agents.defaults.maxConcurrent = maxConcurrent;
  if (!cfg.agents.defaults.subagents) cfg.agents.defaults.subagents = {};
  cfg.agents.defaults.subagents.maxConcurrent = Math.max(
    maxConcurrent - 2,
    kSubagentConcurrencyFloor,
  );

  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));

  return {
    totalTopics,
    maxConcurrent: cfg.agents.defaults.maxConcurrent,
    subagentMaxConcurrent: cfg.agents.defaults.subagents.maxConcurrent,
  };
};

module.exports = { syncConfigForTelegram };
