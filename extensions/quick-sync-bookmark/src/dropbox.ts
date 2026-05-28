import { getValidAccessToken } from "./oauth";
import { get, remove } from "./storage";

const RPC_BASE = "https://api.dropboxapi.com/2";
const CONTENT_BASE = "https://content.dropboxapi.com/2";

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

export type DownloadResult = { content: string; rev: string };

export const downloadFile = async (
  path: string,
): Promise<DownloadResult | null> => {
  const token = await getValidAccessToken();
  if (!token) throw new Error("Not connected to Dropbox");

  const res = await fetch(`${CONTENT_BASE}/files/download`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Dropbox-API-Arg": JSON.stringify({ path }),
    },
  });

  if (res.status === 409) {
    const body = await res.text();
    if (body.includes("path/not_found")) return null;
    throw new Error(`Dropbox download conflict: ${body}`);
  }
  if (!res.ok) {
    throw new Error(
      `Dropbox download failed: ${res.status} ${await res.text()}`,
    );
  }

  const apiResult = res.headers.get("Dropbox-API-Result");
  if (!apiResult) throw new Error("Dropbox download missing API result header");
  const meta = JSON.parse(apiResult) as { rev: string };
  const content = await res.text();
  return { content, rev: meta.rev };
};

export type UploadMode =
  | { tag: "add" }
  | { tag: "overwrite" }
  | { tag: "update"; rev: string };

export type UploadResult = { rev: string };

export class DropboxRevConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DropboxRevConflict";
  }
}

const modeToApi = (mode: UploadMode): unknown => {
  switch (mode.tag) {
    case "add":
      return { ".tag": "add" };
    case "overwrite":
      return { ".tag": "overwrite" };
    case "update":
      return { ".tag": "update", update: mode.rev };
  }
};

export const uploadFile = async (
  path: string,
  content: string,
  mode: UploadMode,
): Promise<UploadResult> => {
  const token = await getValidAccessToken();
  if (!token) throw new Error("Not connected to Dropbox");

  const res = await fetch(`${CONTENT_BASE}/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({
        path,
        mode: modeToApi(mode),
        autorename: false,
        mute: true,
        strict_conflict: false,
      }),
    },
    body: content,
  });

  if (res.status === 409) {
    const body = await res.text();
    if (body.includes("conflict")) {
      throw new DropboxRevConflict(
        `Dropbox upload rev conflict on ${path}: ${body}`,
      );
    }
    throw new Error(`Dropbox upload conflict: ${body}`);
  }
  if (!res.ok) {
    throw new Error(
      `Dropbox upload failed: ${res.status} ${await res.text()}`,
    );
  }

  const meta = (await res.json()) as { rev: string };
  return { rev: meta.rev };
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
