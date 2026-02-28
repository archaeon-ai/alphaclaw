const fs = require("fs");
const { WORKSPACE_DIR } = require("./constants");

const kRegistryPath = `${WORKSPACE_DIR}/topic-registry.json`;

const readRegistry = () => {
  try {
    return JSON.parse(fs.readFileSync(kRegistryPath, "utf8"));
  } catch {
    return { groups: {} };
  }
};

const writeRegistry = (registry) => {
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
  fs.writeFileSync(kRegistryPath, JSON.stringify(registry, null, 2));
};

const getGroup = (groupId) => {
  const registry = readRegistry();
  return registry.groups[groupId] || null;
};

const setGroup = (groupId, groupData) => {
  const registry = readRegistry();
  const existingGroup = registry.groups[groupId] || {
    name: groupId,
    topics: {},
  };
  registry.groups[groupId] = {
    ...existingGroup,
    ...groupData,
    topics: existingGroup.topics || {},
  };
  writeRegistry(registry);
  return registry;
};

const addTopic = (groupId, threadId, topicData) => {
  const registry = readRegistry();
  if (!registry.groups[groupId]) {
    registry.groups[groupId] = { name: groupId, topics: {} };
  }
  if (
    !registry.groups[groupId].topics ||
    typeof registry.groups[groupId].topics !== "object"
  ) {
    registry.groups[groupId].topics = {};
  }
  registry.groups[groupId].topics[String(threadId)] = topicData;
  writeRegistry(registry);
  return registry;
};

const updateTopic = (groupId, threadId, topicData) => {
  const registry = readRegistry();
  if (!registry.groups[groupId]) {
    registry.groups[groupId] = { name: groupId, topics: {} };
  }
  if (
    !registry.groups[groupId].topics ||
    typeof registry.groups[groupId].topics !== "object"
  ) {
    registry.groups[groupId].topics = {};
  }
  const existing = registry.groups[groupId].topics[String(threadId)] || {};
  registry.groups[groupId].topics[String(threadId)] = {
    ...existing,
    ...topicData,
  };
  writeRegistry(registry);
  return registry;
};

const removeTopic = (groupId, threadId) => {
  const registry = readRegistry();
  if (registry.groups[groupId]?.topics) {
    delete registry.groups[groupId].topics[String(threadId)];
  }
  writeRegistry(registry);
  return registry;
};

const getTotalTopicCount = () => {
  const registry = readRegistry();
  let count = 0;
  for (const group of Object.values(registry.groups)) {
    count += Object.keys(group.topics || {}).length;
  }
  return count;
};

// Render the topic registry as a markdown section for TOOLS.md
const renderTopicRegistryMarkdown = ({ includeSyncGuidance = false } = {}) => {
  const registry = readRegistry();
  const rows = [];
  for (const [groupId, group] of Object.entries(registry.groups)) {
    for (const [threadId, topic] of Object.entries(group.topics || {})) {
      rows.push({
        groupName: group.name || groupId,
        groupId,
        topicName: topic.name,
        threadId,
      });
    }
  }
  if (rows.length === 0 && !includeSyncGuidance) return "";

  const lines = [
    "",
    "## Topic Registry",
    "",
    "When sending messages to group topics, use these thread IDs:",
    "",
    "| Group | Topic | Thread ID |",
    "| ----- | ----- | --------- |",
  ];
  for (const r of rows) {
    lines.push(
      `| ${r.groupName} (${r.groupId}) | ${r.topicName} | ${r.threadId} |`,
    );
  }
  if (includeSyncGuidance) {
    lines.push(
      "",
      "### Sync Rules",
      "",
      "When Telegram workspace is enabled, keep topic mappings in sync with real Telegram activity:",
      "",
      "- If a message arrives in an unregistered Telegram topic, ask the user to name it for addition to the registry.",
      '- When adding a topic (new or missing) run `alphaclaw telegram topic add --thread <threadId> --name "<topicName>"` immediately, no confirmation needed.',
      "- Never edit `hooks/bootstrap/TOOLS.md` directly for topic changes",
      "",
    );
  } else {
    lines.push("");
  }
  return lines.join("\n");
};

module.exports = {
  kRegistryPath,
  readRegistry,
  writeRegistry,
  getGroup,
  setGroup,
  addTopic,
  updateTopic,
  removeTopic,
  getTotalTopicCount,
  renderTopicRegistryMarkdown,
};
