import { h } from "https://esm.sh/preact";
import { useState, useEffect, useCallback } from "https://esm.sh/preact/hooks";
import htm from "https://esm.sh/htm";
import {
  fetchGoogleStatus,
  checkGoogleApis as checkApis,
  disconnectGoogle as apiDisconnect,
} from "../lib/api.js";
import {
  ScopePicker,
  toggleScopeLogic,
  getDefaultScopes,
} from "./scope-picker.js";
import { CredentialsModal } from "./credentials-modal.js";
import { ConfirmDialog } from "./confirm-dialog.js";
import { showToast } from "./toast.js";
const html = htm.bind(h);

export function Google({ gatewayStatus }) {
  const [google, setGoogle] = useState(null);
  const [scopes, setScopes] = useState(getDefaultScopes());
  const [savedScopes, setSavedScopes] = useState(null);
  const [apiStatus, setApiStatus] = useState({});
  const [checkingApis, setCheckingApis] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);

  const runApiCheck = useCallback(async () => {
    setApiStatus({});
    setCheckingApis(true);
    try {
      const check = await checkApis();
      if (check.results) setApiStatus(check.results);
    } finally {
      setCheckingApis(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchGoogleStatus();
      setGoogle(data);
      if (data.activeScopes && data.activeScopes.length > 0) {
        setScopes(data.activeScopes);
        setSavedScopes(data.activeScopes);
      }
      if (data.authenticated) {
        await runApiCheck();
      }
    } catch {}
  }, [runApiCheck]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // First load can race gateway startup; refresh when gateway becomes healthy.
  useEffect(() => {
    if (gatewayStatus === "running") {
      refresh();
    }
  }, [gatewayStatus, refresh]);

  // Listen for OAuth popup postMessage
  useEffect(() => {
    const handler = async (e) => {
      if (e.data?.google === "success") {
        showToast("✓ Google account connected", "success");
        setApiStatus({});
        await refresh();
      } else if (e.data?.google === "error") {
        showToast(
          "✗ Google auth failed: " + (e.data.message || "unknown"),
          "error",
        );
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [refresh]);

  const handleToggle = (scope) => {
    setScopes((prev) => toggleScopeLogic(prev, scope));
  };

  const startAuth = (email) => {
    if (scopes.length === 0) {
      alert("Select at least one service");
      return;
    }
    const authUrl = `/auth/google/start?email=${encodeURIComponent(email)}&services=${scopes.join(",")}&_ts=${Date.now()}`;
    const popup = window.open(
      authUrl,
      "google-auth",
      "popup=yes,width=500,height=700",
    );
    if (!popup || popup.closed) window.location.href = authUrl;
  };

  const handleCheckApis = () => runApiCheck();

  const handleDisconnect = async () => {
    const data = await apiDisconnect();
    if (data.ok) {
      setGoogle({
        hasCredentials: false,
        authenticated: false,
        email: "",
        services: "",
        activeScopes: [],
      });
      setApiStatus({});
      setScopes(getDefaultScopes());
      showToast("Google account disconnected", "success");
    } else {
      alert("Failed to disconnect: " + (data.error || "unknown"));
    }
  };

  if (!google) {
    return html` <div class="bg-surface border border-border rounded-xl p-4">
      <h2 class="card-label mb-3">Google Workspace</h2>
      <div class="text-gray-500 text-sm text-center py-2">Loading...</div>
    </div>`;
  }

  const hasCredentials = google.authenticated || google.hasCredentials;
  const isAuthed = google.authenticated;
  const email = google.email || "";
  const scopesChanged =
    !savedScopes ||
    scopes.length !== savedScopes.length ||
    scopes.some((s) => !savedScopes.includes(s));

  return html`
    <div class="bg-surface border border-border rounded-xl p-4">
      <h2 class="card-label mb-3">Google Workspace</h2>
      ${hasCredentials
        ? html`
            <div class="space-y-3">
              <div class="flex justify-between items-center">
                <div class="text-sm font-medium">${email}</div>
                ${isAuthed
                  ? html`<span
                      class="text-xs px-2 py-0.5 rounded-full font-medium bg-green-500/10 text-green-500"
                      >Connected</span
                    >`
                  : html`<span
                      class="text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-500/10 text-yellow-500"
                      >Awaiting sign-in</span
                    >`}
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm text-gray-400">Select permissions</span>
                ${isAuthed &&
                html`<button
                  onclick=${handleCheckApis}
                  class="text-xs px-2 py-1 rounded-lg ac-btn-ghost"
                >
                  ↻ Check APIs
                </button>`}
              </div>
              <${ScopePicker}
                scopes=${scopes}
                onToggle=${handleToggle}
                apiStatus=${isAuthed ? apiStatus : {}}
                loading=${isAuthed && checkingApis}
              />
              <div class="pt-1 space-y-2 sm:space-y-0 sm:flex sm:justify-between sm:items-center">
                <div class="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:items-center">
                  <button
                    onclick=${() => startAuth(email)}
                    disabled=${isAuthed && !scopesChanged}
                    class="w-full sm:w-auto text-xs font-medium px-3 py-1.5 rounded-lg ac-btn-cyan"
                  >
                    ${isAuthed ? "Update Permissions" : "Sign in with Google"}
                  </button>
                  <button
                    type="button"
                    onclick=${() => setModalOpen(true)}
                    class="w-full sm:w-auto text-xs font-medium px-3 py-1.5 rounded-lg ac-btn-secondary"
                  >
                    Edit credentials
                  </button>
                </div>
                <button
                  onclick=${() => setDisconnectDialogOpen(true)}
                  class="text-xs px-2 py-1 rounded-lg ac-btn-ghost w-full sm:w-auto"
                >
                  Disconnect
                </button>
              </div>
            </div>
          `
        : html`
            <div class="text-center space-y-2 py-1">
              <p class="text-xs text-gray-500">
                Connect Gmail, Calendar, Contacts, Drive, Sheets, Tasks, Docs,
                and Meet.
              </p>
              <button
                onclick=${() => setModalOpen(true)}
                class="text-sm font-medium px-4 py-2 rounded-lg ac-btn-cyan"
              >
                Set up Google
              </button>
            </div>
          `}
    </div>
    <${CredentialsModal}
      visible=${modalOpen}
      onClose=${() => setModalOpen(false)}
      onSaved=${refresh}
    />
    <${ConfirmDialog}
      visible=${disconnectDialogOpen}
      title="Disconnect Google account?"
      message="Your agent will lose access to Gmail, Calendar, and other Google Workspace services until you reconnect."
      confirmLabel="Disconnect"
      cancelLabel="Cancel"
      onCancel=${() => setDisconnectDialogOpen(false)}
      onConfirm=${async () => {
        setDisconnectDialogOpen(false);
        await handleDisconnect();
      }}
    />
  `;
}
