import { h } from "https://esm.sh/preact";
import { useState, useEffect } from "https://esm.sh/preact/hooks";
import htm from "https://esm.sh/htm";
import { Badge } from "./badge.js";
import { showToast } from "./toast.js";

const html = htm.bind(h);

const authFetch = async (url, opts = {}) => {
  const res = await fetch(url, opts);
  if (res.status === 401) {
    window.location.href = "/setup";
    throw new Error("Unauthorized");
  }
  return res;
};
const encodePayloadQuery = (payload) =>
  encodeURIComponent(
    JSON.stringify(payload && typeof payload === "object" ? payload : {}),
  );

const api = {
  verifyBot: async () => {
    const res = await authFetch("/api/telegram/bot");
    return res.json();
  },
  workspace: async () => {
    const res = await authFetch("/api/telegram/workspace");
    return res.json();
  },
  resetWorkspace: async () => {
    const res = await authFetch("/api/telegram/workspace/reset", {
      method: "POST",
    });
    return res.json();
  },
  verifyGroup: async (groupId) => {
    const groupIdParam = encodeURIComponent(String(groupId || "").trim());
    const res = await authFetch(
      `/api/telegram/groups/verify?groupId=${groupIdParam}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId }),
      },
    );
    return res.json();
  },
  listTopics: async (groupId) => {
    const res = await authFetch(
      `/api/telegram/groups/${encodeURIComponent(groupId)}/topics`,
    );
    return res.json();
  },
  createTopicsBulk: async (groupId, topics) => {
    const queryPayload = encodePayloadQuery({ topics });
    const res = await authFetch(
      `/api/telegram/groups/${encodeURIComponent(groupId)}/topics/bulk?payload=${queryPayload}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topics }),
      },
    );
    return res.json();
  },
  deleteTopic: async (groupId, topicId) => {
    const res = await authFetch(
      `/api/telegram/groups/${encodeURIComponent(groupId)}/topics/${topicId}`,
      { method: "DELETE" },
    );
    return res.json();
  },
  updateTopic: async (groupId, topicId, payload) => {
    const queryPayload = encodePayloadQuery(payload);
    const res = await authFetch(
      `/api/telegram/groups/${encodeURIComponent(groupId)}/topics/${encodeURIComponent(topicId)}?payload=${queryPayload}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    return res.json();
  },
  configureGroup: async (groupId, payload) => {
    const queryPayload = encodePayloadQuery(payload);
    const res = await authFetch(
      `/api/telegram/groups/${encodeURIComponent(groupId)}/configure?payload=${queryPayload}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    return res.json();
  },
};

const kSteps = [
  { id: "verify-bot", label: "Verify Bot" },
  { id: "create-group", label: "Create Group" },
  { id: "add-bot", label: "Add Bot" },
  { id: "topics", label: "Topics" },
  { id: "summary", label: "Summary" },
];

const kTelegramWorkspaceStorageKey = "telegram-workspace-state-v1";
const kTelegramWorkspaceCacheKey = "telegram-workspace-cache-v1";
const loadTelegramWorkspaceState = () => {
  try {
    const raw = window.localStorage.getItem(kTelegramWorkspaceStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};
const loadTelegramWorkspaceCache = () => {
  try {
    const raw = window.localStorage.getItem(kTelegramWorkspaceCacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const data = parsed?.data;
    if (!data || typeof data !== "object") return null;
    return data;
  } catch {
    return null;
  }
};
const saveTelegramWorkspaceCache = (data) => {
  try {
    window.localStorage.setItem(
      kTelegramWorkspaceCacheKey,
      JSON.stringify({ cachedAt: Date.now(), data }),
    );
  } catch {}
};

const StepIndicator = ({ currentStep }) => html`
  <div class="flex items-center gap-1 mb-6">
    ${kSteps.map(
      (s, i) => html`
        <div
          class="h-1 flex-1 rounded-full transition-colors ${i <= currentStep
            ? "bg-accent"
            : "bg-border"}"
          style=${i <= currentStep ? "background: var(--accent)" : ""}
        />
      `,
    )}
  </div>
`;

const BackButton = ({ onBack }) => html`
  <button
    onclick=${onBack}
    class="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors mb-4"
  >
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path
        d="M10.354 3.354a.5.5 0 00-.708-.708l-5 5a.5.5 0 000 .708l5 5a.5.5 0 00.708-.708L5.707 8l4.647-4.646z"
      />
    </svg>
    Back
  </button>
`;

// Step 1: Verify Bot
const VerifyBotStep = ({ botInfo, setBotInfo, onNext }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const verify = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.verifyBot();
      if (!data.ok) throw new Error(data.error);
      setBotInfo(data.bot);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!botInfo) verify();
  }, []);

  return html`
    <div class="space-y-4">
      <h3 class="text-sm font-semibold">Verify Bot Setup</h3>

      ${botInfo &&
      html`
        <div class="bg-black/20 border border-border rounded-lg p-3">
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-300 font-medium">@${botInfo.username}</span>
            <${Badge} tone="success">Connected</${Badge}>
          </div>
          <p class="text-xs text-gray-500 mt-1">${botInfo.first_name}</p>
        </div>
      `}
      ${error &&
      html`
        <div class="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          <p class="text-sm text-red-400">${error}</p>
        </div>
      `}
      ${!botInfo &&
      !loading &&
      !error &&
      html` <p class="text-sm text-gray-400">Checking bot token...</p> `}

      <div class="bg-black/20 border border-border rounded-lg p-3 space-y-2">
        <p class="text-xs font-medium text-gray-300">
          Before continuing, configure BotFather:
        </p>
        <ol class="text-xs text-gray-400 space-y-1.5 list-decimal list-inside">
          <li>
            Open <span class="text-gray-300">@BotFather</span> in Telegram
          </li>
          <li>
            Send <code class="bg-black/40 px-1 rounded">/mybots</code> and
            select your bot
          </li>
          <li>
            Go to <span class="text-gray-300">Bot Settings</span> >
            <span class="text-gray-300">Group Privacy</span>
          </li>
          <li>Turn it <span class="text-yellow-400 font-medium">OFF</span></li>
        </ol>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div />
        <button
          onclick=${onNext}
          disabled=${!botInfo}
          class="w-full text-sm font-medium px-4 py-2 rounded-xl transition-all ac-btn-cyan ${!botInfo
            ? "opacity-50 cursor-not-allowed"
            : ""}"
        >
          Next
        </button>
      </div>
    </div>
  `;
};

// Step 2: Create Group
const CreateGroupStep = ({ onNext, onBack }) => html`
  <div class="space-y-4">
    <h3 class="text-sm font-semibold">Create a Telegram Group</h3>

    <div class="bg-black/20 border border-border rounded-lg p-3 space-y-2">
      <p class="text-xs font-medium text-gray-300">Create the group</p>
      <ol class="text-xs text-gray-400 space-y-2 list-decimal list-inside">
        <li>
          Open Telegram and create a
          <span class="text-gray-300">new group</span>
        </li>
        <li>
          Search for and add <span class="text-gray-300">your bot</span> as a
          member
        </li>
        <li>
          Hit <span class="text-gray-300">Next</span>, give the group a name
          (e.g. "My Workspace"), and create it
        </li>
      </ol>
    </div>

    <div class="bg-black/20 border border-border rounded-lg p-3 space-y-2">
      <p class="text-xs font-medium text-gray-300">Enable topics</p>
      <ol class="text-xs text-gray-400 space-y-2 list-decimal list-inside">
        <li>Tap the group name at the top to open settings</li>
        <li>
          Tap <span class="text-gray-300">Edit</span> (pencil icon), scroll to
          <span class="text-gray-300"> Topics</span>, toggle it
          <span class="text-yellow-400 font-medium"> ON</span>
        </li>
      </ol>
    </div>

    <div class="bg-black/20 border border-border rounded-lg p-3 space-y-2">
      <p class="text-xs font-medium text-gray-300">Make the bot an admin</p>
      <ol class="text-xs text-gray-400 space-y-2 list-decimal list-inside">
        <li>Go to <span class="text-gray-300">Members</span>, tap your bot</li>
        <li>
          Promote it to <span class="text-yellow-400 font-medium">Admin</span>
        </li>
        <li>
          Make sure
          <span class="text-yellow-400 font-medium"> Manage Topics </span>
          permission is enabled
        </li>
      </ol>
    </div>

    <p class="text-xs text-gray-500">
      Once all three steps are done, continue to verify the setup.
    </p>

    <div class="grid grid-cols-2 gap-2">
      <button
        onclick=${onBack}
        class="w-full text-sm font-medium px-4 py-2 rounded-xl transition-all border border-border text-gray-300 hover:border-gray-500"
      >
        Back
      </button>
      <button
        onclick=${onNext}
        class="w-full text-sm font-medium px-4 py-2 rounded-xl transition-all ac-btn-cyan"
      >
        Next
      </button>
    </div>
  </div>
`;

// Step 3: Add Bot to Group / Verify Group
const AddBotStep = ({
  groupId,
  setGroupId,
  groupInfo,
  setGroupInfo,
  userId,
  setUserId,
  verifyGroupError,
  setVerifyGroupError,
  onNext,
  onBack,
}) => {
  const [input, setInput] = useState(groupId || "");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const verifyWarnings = groupInfo
    ? [
        ...(!groupInfo.chat?.isForum
          ? ["Topics are OFF. Enable Topics in Telegram group settings."]
          : []),
        ...(!groupInfo.bot?.isAdmin
          ? ["Bot is not an admin. Promote it to admin in group members."]
          : []),
        ...(!groupInfo.bot?.canManageTopics
          ? [
              "Bot is missing Manage Topics permission. Enable it in admin permissions.",
            ]
          : []),
      ]
    : [];

  const verify = async () => {
    const id = input.trim();
    if (!id) return;
    setLoading(true);
    setVerifyGroupError(null);
    try {
      const data = await api.verifyGroup(id);
      if (!data.ok) throw new Error(data.error);
      setGroupId(id);
      setGroupInfo(data);
      if (!String(userId || "").trim() && data.suggestedUserId) {
        setUserId(String(data.suggestedUserId));
      }
    } catch (e) {
      setVerifyGroupError(e.message);
      setGroupInfo(null);
    }
    setLoading(false);
  };
  const canContinue = !!(
    groupInfo &&
    groupInfo.chat?.isForum &&
    groupInfo.bot?.isAdmin &&
    groupInfo.bot?.canManageTopics
  );
  const continueWithConfig = async () => {
    if (!canContinue || saving) return;
    setVerifyGroupError(null);
    setSaving(true);
    try {
      const userIdValue = String(userId || "").trim();
      const data = await api.configureGroup(groupId, {
        ...(userIdValue ? { userId: userIdValue } : {}),
        groupName: groupInfo?.chat?.title || groupId,
        requireMention: false,
      });
      if (!data?.ok)
        throw new Error(data?.error || "Failed to configure Telegram group");
      if (data.userId) setUserId(String(data.userId));
      onNext();
    } catch (e) {
      setVerifyGroupError(e.message);
    }
    setSaving(false);
  };

  return html`
    <div class="space-y-4">
      <h3 class="text-sm font-semibold">Verify Group</h3>

      <div class="bg-black/20 border border-border rounded-lg p-3 space-y-2">
        <p class="text-xs text-gray-400">To get your group chat ID:</p>
        <ol class="text-xs text-gray-400 space-y-1 list-decimal list-inside">
          <li>
            Invite <span class="text-gray-300">@myidbot</span> to your group
          </li>
          <li>
            Send <code class="bg-black/40 px-1 rounded">/getgroupid</code>
          </li>
          <li>
            Copy the ID (starts with
            <code class="bg-black/40 px-1 rounded">-100</code>)
          </li>
        </ol>
      </div>

      <div class="flex gap-2">
        <input
          type="text"
          value=${input}
          onInput=${(e) => setInput(e.target.value)}
          placeholder="-100XXXXXXXXXX"
          class="flex-1 bg-black/30 border border-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500"
        />
        <button
          onclick=${verify}
          disabled=${loading || !input.trim()}
          class="text-sm px-4 py-2 rounded-lg border border-border transition-colors ${loading ||
          !input.trim()
            ? "text-gray-600 cursor-not-allowed"
            : "text-gray-300 hover:text-gray-100 hover:border-gray-500"}"
        >
          ${loading ? "Verifying..." : "Verify"}
        </button>
      </div>

      ${verifyGroupError &&
      html`
        <div class="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          <p class="text-sm text-red-400">${verifyGroupError}</p>
        </div>
      `}
      ${groupInfo &&
      html`
        <div class="bg-black/20 border border-border rounded-lg p-3 space-y-2">
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-300 font-medium">${groupInfo.chat.title}</span>
            <${Badge} tone="success">Verified</${Badge}>
          </div>
          <div class="flex gap-3 text-xs text-gray-500">
            <span>Topics: ${groupInfo.chat.isForum ? "ON" : "OFF"}</span>
            <span>Bot: ${groupInfo.bot.status}</span>
          </div>
        </div>
      `}
      ${groupInfo &&
      verifyWarnings.length === 0 &&
      html`
        <div class="bg-black/20 border border-border rounded-lg p-3 space-y-2">
          <p class="text-xs text-gray-500">Your Telegram User ID</p>
          <input
            type="text"
            value=${userId}
            onInput=${(e) => setUserId(e.target.value)}
            placeholder="e.g. 123456789"
            class="w-full bg-black/30 border border-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500"
          />
          <p class="text-xs text-gray-500">
            Auto-filled from Telegram admins. Edit if needed.
          </p>
        </div>
      `}
      ${verifyWarnings.length > 0 &&
      html`
        <div
          class="bg-red-500/10 border border-red-500/20 rounded-lg p-3 space-y-3"
        >
          <p class="text-xs font-medium text-red-300">
            Fix these before continuing:
          </p>
          <ul class="text-xs text-red-200 space-y-1 list-disc list-inside">
            ${verifyWarnings.map((message) => html`<li>${message}</li>`)}
          </ul>
          <p class="text-xs text-red-300 ">Once fixed, hit Verify again.</p>
        </div>
      `}

      <div class="grid grid-cols-2 gap-2">
        <button
          onclick=${onBack}
          class="w-full text-sm font-medium px-4 py-2 rounded-xl transition-all border border-border text-gray-300 hover:border-gray-500"
        >
          Back
        </button>
        <button
          onclick=${continueWithConfig}
          disabled=${!canContinue || saving}
          class="w-full text-sm font-medium px-4 py-2 rounded-xl transition-all ac-btn-cyan ${!canContinue ||
          saving
            ? "opacity-50 cursor-not-allowed"
            : ""}"
        >
          ${saving ? "Saving..." : "Next"}
        </button>
      </div>
    </div>
  `;
};

// Step 4: Create Topics
const TopicsStep = ({ groupId, topics, setTopics, onNext, onBack }) => {
  const [newTopicName, setNewTopicName] = useState("");
  const [newTopicInstructions, setNewTopicInstructions] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const loadTopics = async () => {
    const data = await api.listTopics(groupId);
    if (data.ok) setTopics(data.topics);
  };

  useEffect(() => {
    loadTopics();
  }, [groupId]);

  const createSingle = async () => {
    const name = newTopicName.trim();
    const systemInstructions = newTopicInstructions.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const data = await api.createTopicsBulk(groupId, [
        { name, ...(systemInstructions ? { systemInstructions } : {}) },
      ]);
      if (!data.ok)
        throw new Error(data.results?.[0]?.error || "Failed to create topic");
      const failed = data.results.filter((r) => !r.ok);
      if (failed.length > 0) throw new Error(failed[0].error);
      setNewTopicName("");
      setNewTopicInstructions("");
      await loadTopics();
      showToast(`Created topic: ${name}`, "success");
    } catch (e) {
      setError(e.message);
    }
    setCreating(false);
  };

  const handleDelete = async (topicId, topicName) => {
    setDeleting(topicId);
    try {
      const data = await api.deleteTopic(groupId, topicId);
      if (!data.ok) throw new Error(data.error);
      await loadTopics();
      if (data.removedFromRegistryOnly) {
        showToast(`Removed stale topic from registry: ${topicName}`, "success");
      } else {
        showToast(`Deleted topic: ${topicName}`, "success");
      }
    } catch (e) {
      showToast(`Failed to delete: ${e.message}`, "error");
    }
    setDeleting(null);
  };

  const topicEntries = Object.entries(topics || {});

  return html`
    <div class="space-y-4">
      <h3 class="text-sm font-semibold">Create Topics</h3>

      ${topicEntries.length > 0 &&
      html`
        <div
          class="bg-black/20 border border-border rounded-lg overflow-hidden"
        >
          <table class="w-full text-xs">
            <thead>
              <tr class="border-b border-border">
                <th class="text-left px-3 py-2 text-gray-500 font-medium">
                  Topic
                </th>
                <th class="text-left px-3 py-2 text-gray-500 font-medium">
                  Thread ID
                </th>
                <th class="px-3 py-2 w-8" />
              </tr>
            </thead>
            <tbody>
              ${topicEntries.map(
                ([id, t]) => html`
                  <tr class="border-b border-border last:border-0">
                    <td class="px-3 py-2 text-gray-300">${t.name}</td>
                    <td class="px-3 py-2 text-gray-500 font-mono">${id}</td>
                    <td class="px-3 py-2">
                      <button
                        onclick=${() => handleDelete(id, t.name)}
                        disabled=${deleting === id}
                        class="text-gray-600 hover:text-red-400 transition-colors ${deleting ===
                        id
                          ? "opacity-50"
                          : ""}"
                        title="Delete topic"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="currentColor"
                        >
                          <path
                            d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z"
                          />
                        </svg>
                      </button>
                    </td>
                  </tr>
                `,
              )}
            </tbody>
          </table>
        </div>
      `}

      <div class="space-y-2">
        <label class="text-xs text-gray-500">Add a topic</label>
        <div class="space-y-2">
          <div class="flex gap-2">
            <input
              type="text"
              value=${newTopicName}
              onInput=${(e) => setNewTopicName(e.target.value)}
              onKeyDown=${(e) => {
                if (e.key === "Enter") createSingle();
              }}
              placeholder="Topic name"
              class="flex-1 bg-black/30 border border-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500"
            />
          </div>
          <textarea
            value=${newTopicInstructions}
            onInput=${(e) => setNewTopicInstructions(e.target.value)}
            placeholder="System instructions (optional)"
            rows="4"
            class="w-full bg-black/30 border border-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500 resize-y"
          />
          <div class="flex justify-end">
            <button
              onclick=${createSingle}
              disabled=${creating || !newTopicName.trim()}
              class="text-sm min-w-[88px] px-5 py-2 rounded-lg border border-border transition-colors ${creating ||
              !newTopicName.trim()
                ? "text-gray-600 cursor-not-allowed"
                : "text-gray-300 hover:text-gray-100 hover:border-gray-500"}"
            >
              Add
            </button>
          </div>
        </div>
      </div>
      <div class="border-t border-white/10 pt-2" />

      ${error &&
      html`
        <div class="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          <p class="text-sm text-red-400">${error}</p>
        </div>
      `}

      <div class="grid grid-cols-2 gap-2">
        <button
          onclick=${onBack}
          class="w-full text-sm font-medium px-4 py-2 rounded-xl transition-all border border-border text-gray-300 hover:border-gray-500"
        >
          Back
        </button>
        <button
          onclick=${onNext}
          disabled=${topicEntries.length === 0}
          class="w-full text-sm font-medium px-4 py-2 rounded-xl transition-all ac-btn-cyan"
        >
          Next
        </button>
      </div>
    </div>
  `;
};

// Step 5: Summary
const SummaryStep = ({ groupId, groupInfo, topics, onBack, onDone }) => {
  return html`
    <div class="space-y-4">
      <div class="max-w-xl mx-auto text-center space-y-10 mt-10">
        <p class="text-sm font-medium text-green-300">🎉 Setup complete</p>
        <p class="text-xs text-gray-400">
          The topic registry has been injected into
          <code class="bg-black/40 px-1 rounded">TOOLS.md</code> so your agent
          knows which thread ID maps to which topic name.
        </p>

        <div class="bg-black/20 border border-border rounded-lg p-3">
          <p class="text-xs text-gray-500">
            If you used <span class="text-gray-300">@myidbot</span> to find IDs,
            you can remove it from the group now.
          </p>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <button
          onclick=${onBack}
          class="w-full text-sm font-medium px-4 py-2 rounded-xl transition-all border border-border text-gray-300 hover:border-gray-500"
        >
          Back
        </button>
        <button
          onclick=${onDone}
          class="w-full text-sm font-medium px-4 py-2 rounded-xl transition-all ac-btn-cyan"
        >
          Done
        </button>
      </div>
    </div>
  `;
};

const ManageTelegramWorkspace = ({
  groupId,
  groupName,
  initialTopics,
  configAgentMaxConcurrent,
  configSubagentMaxConcurrent,
  onResetOnboarding,
}) => {
  const [topics, setTopics] = useState(initialTopics || {});
  const [newTopicName, setNewTopicName] = useState("");
  const [newTopicInstructions, setNewTopicInstructions] = useState("");
  const [showCreateTopic, setShowCreateTopic] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [editingTopicId, setEditingTopicId] = useState("");
  const [editingTopicName, setEditingTopicName] = useState("");
  const [editingTopicInstructions, setEditingTopicInstructions] = useState("");
  const [renamingTopicId, setRenamingTopicId] = useState("");
  const [error, setError] = useState(null);

  const loadTopics = async () => {
    const data = await api.listTopics(groupId);
    if (data.ok) setTopics(data.topics || {});
  };

  useEffect(() => {
    loadTopics();
  }, [groupId]);
  useEffect(() => {
    if (initialTopics && Object.keys(initialTopics).length > 0) {
      setTopics(initialTopics);
    }
  }, [initialTopics]);

  const createSingle = async () => {
    const name = newTopicName.trim();
    const systemInstructions = newTopicInstructions.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const data = await api.createTopicsBulk(groupId, [
        { name, ...(systemInstructions ? { systemInstructions } : {}) },
      ]);
      if (!data.ok)
        throw new Error(data.results?.[0]?.error || "Failed to create topic");
      const failed = data.results.filter((r) => !r.ok);
      if (failed.length > 0) throw new Error(failed[0].error);
      setNewTopicName("");
      setNewTopicInstructions("");
      setShowCreateTopic(false);
      await loadTopics();
      showToast(`Created topic: ${name}`, "success");
    } catch (e) {
      setError(e.message);
    }
    setCreating(false);
  };

  const handleDelete = async (topicId, topicName) => {
    setDeleting(topicId);
    try {
      const data = await api.deleteTopic(groupId, topicId);
      if (!data.ok) throw new Error(data.error);
      await loadTopics();
      if (data.removedFromRegistryOnly) {
        showToast(`Removed stale topic from registry: ${topicName}`, "success");
      } else {
        showToast(`Deleted topic: ${topicName}`, "success");
      }
    } catch (e) {
      showToast(`Failed to delete: ${e.message}`, "error");
    }
    setDeleting(null);
  };

  const startRename = (topicId, topicName, topicInstructions = "") => {
    setEditingTopicId(String(topicId));
    setEditingTopicName(String(topicName || ""));
    setEditingTopicInstructions(String(topicInstructions || ""));
  };

  const cancelRename = () => {
    setEditingTopicId("");
    setEditingTopicName("");
    setEditingTopicInstructions("");
  };

  const saveRename = async (topicId) => {
    const nextName = editingTopicName.trim();
    const nextSystemInstructions = editingTopicInstructions.trim();
    if (!nextName) {
      setError("Topic name is required");
      return;
    }
    setRenamingTopicId(String(topicId));
    setError(null);
    try {
      const data = await api.updateTopic(groupId, topicId, {
        name: nextName,
        systemInstructions: nextSystemInstructions,
      });
      if (!data.ok) throw new Error(data.error || "Failed to rename topic");
      await loadTopics();
      showToast(`Renamed topic: ${nextName}`, "success");
      cancelRename();
    } catch (e) {
      setError(e.message);
    }
    setRenamingTopicId("");
  };

  const topicEntries = Object.entries(topics || {});
  const topicCount = topicEntries.length;
  const computedMaxConcurrent = Math.max(topicCount * 3, 8);
  const computedSubagentMaxConcurrent = Math.max(computedMaxConcurrent - 2, 4);
  const maxConcurrent = Number.isFinite(configAgentMaxConcurrent)
    ? configAgentMaxConcurrent
    : computedMaxConcurrent;
  const subagentMaxConcurrent = Number.isFinite(configSubagentMaxConcurrent)
    ? configSubagentMaxConcurrent
    : computedSubagentMaxConcurrent;

  return html`
    <div class="space-y-4">
      <div class="flex justify-end">
        <button
          onclick=${onResetOnboarding}
          class="text-xs px-3 py-1.5 rounded-lg border border-border text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
        >
          Reset onboarding
        </button>
      </div>
      <div class="bg-black/20 border border-border rounded-lg p-3 space-y-1">
        <p class="text-sm text-gray-300 font-medium">${groupName || groupId}</p>
        <p class="text-xs text-gray-500 font-mono">${groupId}</p>
      </div>

      <div class="space-y-2">
        <h2 class="card-label mb-3">Existing Topics</h2>
        ${topicEntries.length > 0
          ? html`
              <div
                class="bg-black/20 border border-border rounded-lg overflow-hidden"
              >
                <table class="w-full text-xs table-fixed">
                  <thead>
                    <tr class="border-b border-border">
                      <th class="text-left px-3 py-2 text-gray-500 font-medium">
                        Topic
                      </th>
                      <th
                        class="text-left px-3 py-2 text-gray-500 font-medium w-36"
                      >
                        Thread ID
                      </th>
                      <th class="px-3 py-2 w-28" />
                    </tr>
                  </thead>
                  <tbody>
                    ${topicEntries.map(
                      ([id, topic]) => html`
                        ${editingTopicId === String(id)
                          ? html`
                              <tr
                                class="border-b border-border last:border-0 align-top"
                              >
                                <td class="px-3 py-2" colspan="3">
                                  <div class="space-y-2">
                                    <input
                                      type="text"
                                      value=${editingTopicName}
                                      onInput=${(e) =>
                                        setEditingTopicName(e.target.value)}
                                      onKeyDown=${(e) => {
                                        if (e.key === "Enter") saveRename(id);
                                        if (e.key === "Escape") cancelRename();
                                      }}
                                      class="w-full bg-black/30 border border-border rounded-lg px-2 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500"
                                    />
                                    <textarea
                                      value=${editingTopicInstructions}
                                      onInput=${(e) =>
                                        setEditingTopicInstructions(
                                          e.target.value,
                                        )}
                                      placeholder="System instructions (optional)"
                                      rows="6"
                                      class="w-full bg-black/30 border border-border rounded-lg px-2 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500 resize-y"
                                    />
                                    <div class="flex items-center gap-2">
                                      <button
                                        onclick=${() => saveRename(id)}
                                        disabled=${renamingTopicId ===
                                        String(id)}
                                        class="text-xs px-2 py-1 rounded transition-all ac-btn-cyan ${renamingTopicId ===
                                        String(id)
                                          ? "opacity-60 cursor-not-allowed"
                                          : ""}"
                                      >
                                        Save
                                      </button>
                                      <button
                                        onclick=${cancelRename}
                                        class="text-xs px-2 py-1 rounded border border-border text-gray-400 hover:text-gray-200 hover:border-gray-500"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            `
                          : html`
                              <tr
                                class="border-b border-border last:border-0 align-middle"
                              >
                                <td class="px-3 py-2 text-gray-300">
                                  <div class="flex items-center gap-2">
                                    <span>${topic.name}</span>
                                    <button
                                      onclick=${() =>
                                        startRename(
                                          id,
                                          topic.name,
                                          topic.systemInstructions,
                                        )}
                                      class="inline-flex items-center justify-center text-white/80 hover:text-white transition-colors"
                                      title="Edit topic"
                                      aria-label="Rename topic"
                                    >
                                      <svg
                                        width="14"
                                        height="14"
                                        viewBox="0 0 16 16"
                                        fill="currentColor"
                                        aria-hidden="true"
                                      >
                                        <path
                                          d="M11.854 1.146a.5.5 0 00-.708 0L3 9.293V13h3.707l8.146-8.146a.5.5 0 000-.708l-3-3zM3.5 12.5v-2.793l7-7L13.793 6l-7 7H3.5z"
                                        />
                                      </svg>
                                    </button>
                                  </div>
                                  ${topic.systemInstructions &&
                                  html`
                                    <p
                                      class="text-[11px] text-gray-500 mt-1 line-clamp-1"
                                    >
                                      ${topic.systemInstructions}
                                    </p>
                                  `}
                                </td>
                                <td
                                  class="px-3 py-2 text-gray-500 font-mono w-36"
                                >
                                  ${id}
                                </td>
                                <td class="px-3 py-2">
                                  <div
                                    class="flex items-center gap-2 justify-end"
                                  >
                                    <button
                                      onclick=${() =>
                                        handleDelete(id, topic.name)}
                                      disabled=${deleting === id}
                                      class="text-xs px-2 py-1 rounded border border-border text-gray-500 hover:text-red-300 hover:border-red-500 ${deleting ===
                                      id
                                        ? "opacity-50 cursor-not-allowed"
                                        : ""}"
                                      title="Delete topic"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            `}
                      `,
                    )}
                  </tbody>
                </table>
              </div>
            `
          : html`<p class="text-xs text-gray-500">No topics yet.</p>`}
      </div>

      ${showCreateTopic &&
      html`
        <div class="space-y-2 bg-black/20 border border-border rounded-lg p-3">
          <label class="text-xs text-gray-500">Create new topic</label>
          <div class="space-y-2">
            <input
              type="text"
              value=${newTopicName}
              onInput=${(e) => setNewTopicName(e.target.value)}
              onKeyDown=${(e) => {
                if (e.key === "Enter") createSingle();
              }}
              placeholder="Topic name"
              class="w-full bg-black/30 border border-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500"
            />
            <textarea
              value=${newTopicInstructions}
              onInput=${(e) => setNewTopicInstructions(e.target.value)}
              placeholder="System instructions (optional)"
              rows="5"
              class="w-full bg-black/30 border border-border rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500 resize-y"
            />
            <div class="flex justify-end">
              <button
                onclick=${createSingle}
                disabled=${creating || !newTopicName.trim()}
                class="text-sm px-3 py-2 rounded-lg border border-border transition-colors ${creating ||
                !newTopicName.trim()
                  ? "text-gray-600 cursor-not-allowed"
                  : "text-gray-300 hover:text-gray-100 hover:border-gray-500"}"
              >
                ${creating ? "Creating..." : "Add topic"}
              </button>
            </div>
          </div>
        </div>
      `}
      ${error &&
      html`
        <div class="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          <p class="text-sm text-red-400">${error}</p>
        </div>
      `}

      <div class="flex items-center justify-start">
        <button
          onclick=${() => setShowCreateTopic((v) => !v)}
          class="${showCreateTopic
            ? "w-auto text-sm font-medium px-4 py-2 rounded-xl transition-all border border-border text-gray-300 hover:border-gray-500"
            : "w-auto text-sm font-medium px-4 py-2 rounded-xl transition-all ac-btn-cyan"}"
        >
          ${showCreateTopic ? "Close create topic" : "Create topic"}
        </button>
      </div>

      <div class="border-t border-white/10" />

      <p class="text-xs text-gray-500">
        Concurrency is auto-scaled to support your group:
        <span class="text-gray-300"> agent ${maxConcurrent}</span>,
        <span class="text-gray-300"> subagent ${subagentMaxConcurrent}</span>
        <span class="text-gray-600"> (${topicCount} topics)</span>.
      </p>
      <p class="text-[11px] text-gray-500">
        This registry can drift if topics are created, renamed, or removed
        outside this page. Your agent will update the registry if it notices a
        discrepancy.
      </p>
    </div>
  `;
};

export const TelegramWorkspace = ({ onBack }) => {
  const initialState = loadTelegramWorkspaceState();
  const cachedWorkspace = loadTelegramWorkspaceCache();
  const [step, setStep] = useState(() => {
    const value = Number.parseInt(String(initialState.step ?? 0), 10);
    if (!Number.isFinite(value)) return 0;
    return Math.min(Math.max(value, 0), kSteps.length - 1);
  });
  const [botInfo, setBotInfo] = useState(initialState.botInfo || null);
  const [groupId, setGroupId] = useState(initialState.groupId || "");
  const [groupInfo, setGroupInfo] = useState(initialState.groupInfo || null);
  const [verifyGroupError, setVerifyGroupError] = useState(
    initialState.verifyGroupError || null,
  );
  const [allowUserId, setAllowUserId] = useState(
    initialState.allowUserId || "",
  );
  const [topics, setTopics] = useState(initialState.topics || {});
  const [workspaceConfig, setWorkspaceConfig] = useState(() => ({
    ready: !!cachedWorkspace,
    configured: !!cachedWorkspace?.configured,
    groupId: cachedWorkspace?.groupId || "",
    groupName: cachedWorkspace?.groupName || "",
    topics: cachedWorkspace?.topics || {},
    concurrency: cachedWorkspace?.concurrency || {
      agentMaxConcurrent: null,
      subagentMaxConcurrent: null,
    },
  }));

  const goNext = () => setStep((s) => Math.min(kSteps.length - 1, s + 1));
  const goBack = () => setStep((s) => Math.max(0, s - 1));
  const resetOnboarding = async () => {
    try {
      const data = await api.resetWorkspace();
      if (!data.ok) throw new Error(data.error || "Failed to reset onboarding");
      try {
        window.localStorage.removeItem(kTelegramWorkspaceStorageKey);
        window.localStorage.removeItem(kTelegramWorkspaceCacheKey);
      } catch {}
      setStep(0);
      setBotInfo(null);
      setGroupId("");
      setGroupInfo(null);
      setVerifyGroupError(null);
      setAllowUserId("");
      setTopics({});
      setWorkspaceConfig({
        ready: true,
        configured: false,
        groupId: "",
        groupName: "",
        topics: {},
        concurrency: { agentMaxConcurrent: null, subagentMaxConcurrent: null },
      });
      showToast("Telegram onboarding reset", "success");
    } catch (e) {
      showToast(e.message || "Failed to reset onboarding", "error");
    }
  };
  const handleDone = () => {
    try {
      window.localStorage.removeItem(kTelegramWorkspaceStorageKey);
      window.localStorage.setItem(
        kTelegramWorkspaceCacheKey,
        JSON.stringify({
          cachedAt: Date.now(),
          data: {
            ready: true,
            configured: true,
            groupId,
            groupName: groupInfo?.chat?.title || groupId,
            topics: topics || {},
            concurrency: workspaceConfig?.concurrency || {
              agentMaxConcurrent: null,
              subagentMaxConcurrent: null,
            },
          },
        }),
      );
    } catch {}
    window.location.reload();
  };

  useEffect(() => {
    try {
      window.localStorage.setItem(
        kTelegramWorkspaceStorageKey,
        JSON.stringify({
          step,
          botInfo,
          groupId,
          groupInfo,
          verifyGroupError,
          allowUserId,
          topics,
        }),
      );
    } catch {}
  }, [
    step,
    botInfo,
    groupId,
    groupInfo,
    verifyGroupError,
    allowUserId,
    topics,
  ]);

  useEffect(() => {
    let active = true;
    const bootstrapWorkspace = async () => {
      try {
        const data = await api.workspace();
        if (!active || !data?.ok) return;
        if (!data.configured || !data.groupId) {
          const nextConfig = {
            ready: true,
            configured: false,
            groupId: "",
            groupName: "",
            topics: {},
            concurrency: {
              agentMaxConcurrent: null,
              subagentMaxConcurrent: null,
            },
          };
          setWorkspaceConfig(nextConfig);
          saveTelegramWorkspaceCache(nextConfig);
          return;
        }
        const nextConfig = {
          ready: true,
          configured: true,
          groupId: data.groupId,
          groupName: data.groupName || data.groupId,
          topics: data.topics || {},
          concurrency: data.concurrency || {
            agentMaxConcurrent: null,
            subagentMaxConcurrent: null,
          },
        };
        setWorkspaceConfig(nextConfig);
        saveTelegramWorkspaceCache(nextConfig);
        setGroupId(data.groupId);
        setTopics(data.topics || {});
        setGroupInfo({
          chat: {
            id: data.groupId,
            title: data.groupName || data.groupId,
            isForum: true,
          },
          bot: {
            status: "administrator",
            isAdmin: true,
            canManageTopics: true,
          },
        });
        setVerifyGroupError(null);
        setAllowUserId("");
        setStep((currentStep) => (currentStep < 3 ? 3 : currentStep));
      } catch {}
    };
    bootstrapWorkspace();
    return () => {
      active = false;
    };
  }, []);

  return html`
    <div class="space-y-4">
      <${BackButton} onBack=${onBack} />
      <div class="bg-surface border border-border rounded-xl p-4">
        ${!workspaceConfig.ready
          ? html`
              <div class="min-h-[220px] flex items-center justify-center">
                <p class="text-sm text-gray-500">Loading workspace...</p>
              </div>
            `
          : workspaceConfig.configured
            ? html`
                <div class="flex items-center justify-between mb-4">
                  <div class="flex items-center gap-2">
                    <img
                      src="/assets/icons/telegram.svg"
                      alt=""
                      class="w-5 h-5"
                    />
                    <h2 class="font-semibold text-sm">
                      Manage Telegram Workspace
                    </h2>
                  </div>
                </div>
                <${ManageTelegramWorkspace}
                  groupId=${workspaceConfig.groupId}
                  groupName=${workspaceConfig.groupName}
                  initialTopics=${workspaceConfig.topics}
                  configAgentMaxConcurrent=${workspaceConfig.concurrency
                    ?.agentMaxConcurrent}
                  configSubagentMaxConcurrent=${workspaceConfig.concurrency
                    ?.subagentMaxConcurrent}
                  onResetOnboarding=${resetOnboarding}
                />
              `
            : html`
                <div class="flex items-center justify-between mb-4">
                  <div class="flex items-center gap-2">
                    <img
                      src="/assets/icons/telegram.svg"
                      alt=""
                      class="w-5 h-5"
                    />
                    <h2 class="font-semibold text-sm">
                      Set Up Telegram Workspace
                    </h2>
                  </div>
                  <span class="text-xs text-gray-500"
                    >Step ${step + 1} of ${kSteps.length}</span
                  >
                </div>

                <${StepIndicator} currentStep=${step} />

                ${step === 0 &&
                html`
                  <${VerifyBotStep}
                    botInfo=${botInfo}
                    setBotInfo=${setBotInfo}
                    onNext=${goNext}
                  />
                `}
                ${step === 1 &&
                html`
                  <${CreateGroupStep} onNext=${goNext} onBack=${goBack} />
                `}
                ${step === 2 &&
                html`
                  <${AddBotStep}
                    groupId=${groupId}
                    setGroupId=${setGroupId}
                    groupInfo=${groupInfo}
                    setGroupInfo=${setGroupInfo}
                    userId=${allowUserId}
                    setUserId=${setAllowUserId}
                    verifyGroupError=${verifyGroupError}
                    setVerifyGroupError=${setVerifyGroupError}
                    onNext=${goNext}
                    onBack=${goBack}
                  />
                `}
                ${step === 3 &&
                html`
                  <${TopicsStep}
                    groupId=${groupId}
                    topics=${topics}
                    setTopics=${setTopics}
                    onNext=${goNext}
                    onBack=${goBack}
                  />
                `}
                ${step === 4 &&
                html`
                  <${SummaryStep}
                    groupId=${groupId}
                    groupInfo=${groupInfo}
                    topics=${topics}
                    onBack=${goBack}
                    onDone=${handleDone}
                  />
                `}
              `}
      </div>
    </div>
  `;
};
