import { get } from "./storage";
import type { DropboxAccount } from "./dropbox";
import { syncNow, type SyncSummary } from "./sync";

const openOptionsBtn = document.getElementById("open-options");
const syncNowBtn = document.getElementById("sync-now") as HTMLButtonElement | null;
const statusEl = document.getElementById("status");
const lastSyncedEl = document.getElementById("last-synced");
const syncResultEl = document.getElementById("sync-result");

const formatRelative = (isoTs: string): string => {
  const then = new Date(isoTs).getTime();
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
};

const renderLastSynced = async (): Promise<void> => {
  if (!lastSyncedEl) return;
  const lastSyncedAt = await get<string>("lastSyncedAt");
  if (lastSyncedAt) {
    lastSyncedEl.textContent = `Last synced ${formatRelative(lastSyncedAt)}`;
    lastSyncedEl.hidden = false;
  } else {
    lastSyncedEl.hidden = true;
  }
};

const renderSummary = (summary: SyncSummary): void => {
  if (!syncResultEl) return;
  syncResultEl.hidden = false;
  syncResultEl.classList.remove("error");
  if (summary.result === "ok") {
    const parts: string[] = [];
    if (summary.remoteOpsConsumed) parts.push(`${summary.remoteOpsConsumed} from remote`);
    if (summary.localOpsPushed) parts.push(`${summary.localOpsPushed} pushed`);
    if (summary.conflicts.length) parts.push(`${summary.conflicts.length} conflict(s)`);
    syncResultEl.textContent = parts.length === 0 ? "Up to date." : parts.join(", ");
  } else {
    syncResultEl.classList.add("error");
    syncResultEl.textContent =
      summary.result === "rev-conflict"
        ? "Remote changed mid-sync — try again."
        : `Sync failed: ${summary.message ?? summary.result}`;
  }
};

const render = async (): Promise<void> => {
  const account = await get<DropboxAccount>("dropboxAccount");
  if (!statusEl || !syncNowBtn) return;
  if (account) {
    statusEl.textContent = `Connected as ${account.email}`;
    statusEl.className = "status connected";
    syncNowBtn.hidden = false;
  } else {
    statusEl.textContent = "Not connected";
    statusEl.className = "status";
    syncNowBtn.hidden = true;
  }
  await renderLastSynced();
};

openOptionsBtn?.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

syncNowBtn?.addEventListener("click", async () => {
  if (!syncNowBtn) return;
  syncNowBtn.disabled = true;
  const originalLabel = syncNowBtn.textContent;
  syncNowBtn.textContent = "Syncing…";
  if (syncResultEl) syncResultEl.hidden = true;
  try {
    const summary = await syncNow();
    renderSummary(summary);
    await renderLastSynced();
  } catch (err) {
    if (syncResultEl) {
      syncResultEl.hidden = false;
      syncResultEl.classList.add("error");
      syncResultEl.textContent = `Sync failed: ${(err as Error).message}`;
    }
  } finally {
    syncNowBtn.disabled = false;
    syncNowBtn.textContent = originalLabel;
  }
});

render();
