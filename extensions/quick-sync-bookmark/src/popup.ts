import { get } from "./storage";
import type { DropboxAccount } from "./dropbox";

const openOptionsBtn = document.getElementById("open-options");
const statusEl = document.getElementById("status");

const render = async () => {
  const account = await get<DropboxAccount>("dropboxAccount");
  if (!statusEl) return;
  if (account) {
    statusEl.textContent = `Connected as ${account.email}`;
    statusEl.className = "status connected";
  } else {
    statusEl.textContent = "Not connected";
    statusEl.className = "status";
  }
};

openOptionsBtn?.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

render();
