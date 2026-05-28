import { get, set } from "./storage";

const AUTH_URL = "https://www.dropbox.com/oauth2/authorize";
const TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";

const base64UrlEncode = (bytes: Uint8Array): string => {
  let str = "";
  bytes.forEach((b) => (str += String.fromCharCode(b)));
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const generateCodeVerifier = (): string => {
  const arr = new Uint8Array(64);
  crypto.getRandomValues(arr);
  return base64UrlEncode(arr);
};

const generateCodeChallenge = async (verifier: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64UrlEncode(new Uint8Array(digest));
};

const redirectUri = (): string => chrome.identity.getRedirectURL();

export const startOAuth = async (appKey: string): Promise<void> => {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);

  const authUrl = new URL(AUTH_URL);
  authUrl.searchParams.set("client_id", appKey);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri());
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("token_access_type", "offline");

  const callbackUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl.toString(),
    interactive: true,
  });

  if (!callbackUrl) throw new Error("OAuth flow returned no callback URL");

  const params = new URL(callbackUrl).searchParams;
  const code = params.get("code");
  if (!code) {
    const error = params.get("error_description") ?? params.get("error");
    throw new Error(`OAuth failed: ${error ?? "no code in callback"}`);
  }

  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    client_id: appKey,
    code_verifier: verifier,
    redirect_uri: redirectUri(),
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    throw new Error(
      `Token exchange failed: ${res.status} ${await res.text()}`,
    );
  }

  const json = await res.json();
  const expiresAt = Date.now() + (json.expires_in - 60) * 1000;

  await set("dropboxAccessToken", json.access_token);
  await set("dropboxRefreshToken", json.refresh_token);
  await set("dropboxAccessTokenExpiresAt", expiresAt);
};

const refreshAccessToken = async (): Promise<string> => {
  const appKey = await get<string>("dropboxAppKey");
  const refreshToken = await get<string>("dropboxRefreshToken");
  if (!appKey || !refreshToken) throw new Error("Not connected");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: appKey,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  const expiresAt = Date.now() + (json.expires_in - 60) * 1000;

  await set("dropboxAccessToken", json.access_token);
  await set("dropboxAccessTokenExpiresAt", expiresAt);
  return json.access_token;
};

export const getValidAccessToken = async (): Promise<string | undefined> => {
  const token = await get<string>("dropboxAccessToken");
  const expiresAt = await get<number>("dropboxAccessTokenExpiresAt");
  if (!token) return undefined;
  if (expiresAt && Date.now() < expiresAt) return token;
  try {
    return await refreshAccessToken();
  } catch {
    return undefined;
  }
};
