import { startOAuth } from "./oauth";
import { getCurrentAccount, revokeToken } from "./dropbox";
import type { DropboxAccount } from "./dropbox";
import { get, set } from "./storage";
import { DEFAULT_DROPBOX_APP_KEY } from "./config";

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T | null;

const renderState = async () => {
  const status = $("account-status");
  const connectForm = $("connect-form");
  const connectedInfo = $("connected-info");
  const accountEmail = $("account-email");

  const account = await get<DropboxAccount>("dropboxAccount");

  if (account) {
    if (status) status.hidden = true;
    if (connectForm) connectForm.hidden = true;
    if (connectedInfo) connectedInfo.hidden = false;
    if (accountEmail) accountEmail.textContent = account.email;
  } else {
    if (status) {
      status.hidden = false;
      status.textContent = "Not connected.";
      status.className = "muted";
    }
    if (connectForm) connectForm.hidden = false;
    if (connectedInfo) connectedInfo.hidden = true;
  }
};

const showError = (msg: string) => {
  const status = $("account-status");
  if (status) {
    status.textContent = msg;
    status.className = "status-error";
  }
};

$("connect-btn")?.addEventListener("click", async () => {
  try {
    await startOAuth(DEFAULT_DROPBOX_APP_KEY);
    const account = await getCurrentAccount();
    await set("dropboxAccount", account);
    await renderState();
  } catch (e) {
    showError(`Connect failed: ${(e as Error).message}`);
  }
});

$("disconnect-btn")?.addEventListener("click", async () => {
  try {
    await revokeToken();
    await renderState();
  } catch (e) {
    showError(`Disconnect failed: ${(e as Error).message}`);
  }
});

renderState();
