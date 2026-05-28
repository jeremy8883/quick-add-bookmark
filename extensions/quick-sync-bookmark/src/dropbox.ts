import { getValidAccessToken } from "./oauth";
import { get, remove } from "./storage";

const RPC_BASE = "https://api.dropboxapi.com/2";

export type DropboxAccount = {
  accountId: string;
  email: string;
  name: string;
};

const rpc = async <T>(path: string, body: unknown = null): Promise<T> => {
  const token = await getValidAccessToken();
  if (!token) throw new Error("Not connected to Dropbox");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (body !== null) headers["Content-Type"] = "application/json";

  const res = await fetch(`${RPC_BASE}${path}`, {
    method: "POST",
    headers,
    body: body !== null ? JSON.stringify(body) : null,
  });

  if (!res.ok) {
    throw new Error(`Dropbox ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
};

export const getCurrentAccount = async (): Promise<DropboxAccount> => {
  const data = await rpc<{
    account_id: string;
    email: string;
    name: { display_name: string };
  }>("/users/get_current_account");
  return {
    accountId: data.account_id,
    email: data.email,
    name: data.name.display_name,
  };
};

export const revokeToken = async (): Promise<void> => {
  const token = await get<string>("dropboxAccessToken");
  if (token) {
    try {
      await fetch(`${RPC_BASE}/auth/token/revoke`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Best-effort; clear local state regardless.
    }
  }
  await remove(
    "dropboxAccessToken",
    "dropboxRefreshToken",
    "dropboxAccessTokenExpiresAt",
    "dropboxAccount",
  );
};
