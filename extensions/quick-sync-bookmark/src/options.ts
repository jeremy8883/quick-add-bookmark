import { startOAuth } from "./oauth";
import { getCurrentAccount, revokeToken } from "./dropbox";
import type { DropboxAccount } from "./dropbox";
import { get, set } from "./storage";

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T | null;

const renderState = async () => {
  const status = $("account-status");
  const connectForm = $("connect-form");
  const connectedInfo = $("connected-info");
  const accountEmail = $("account-email");
  const appKeyInput = $<HTMLInputElement>("app-key");
  const redirectUriEl = $("redirect-uri");

  if (redirectUriEl) {
    redirectUriEl.textContent = chrome.identity.getRedirectURL();
  }

  const savedAppKey = await get<string>("dropboxAppKey");
  if (appKeyInput && savedAppKey) appKeyInput.value = savedAppKey;

  const account = await get<DropboxAccount>("dropboxAccount");

  if (account) {
    if (status) {
      status.textContent = "Connected.";
      status.className = "status-connected";
    }
    if (connectForm) connectForm.hidden = true;
    if (connectedInfo) connectedInfo.hidden = false;
    if (accountEmail) accountEmail.textContent = account.email;
  } else {
    if (status) {
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
  const appKeyInput = $<HTMLInputElement>("app-key");
  const appKey = appKeyInput?.value.trim();
  if (!appKey) {
    showError("Please enter your Dropbox app key.");
    return;
  }
  await set("dropboxAppKey", appKey);
  try {
    await startOAuth(appKey);
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
