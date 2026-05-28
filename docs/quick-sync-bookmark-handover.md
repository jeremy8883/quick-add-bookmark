# quick-sync-bookmark — handover

Snapshot of where the new sync extension stands. Pair with the design doc:
[`quick-sync-bookmark-design.md`](./quick-sync-bookmark-design.md) (architecture, op-log model, safety mechanisms).

---

## What it is

A third Chrome extension in this monorepo, alongside `quick-add-bookmark` and
`quick-go-to-bookmark`. Syncs the Chrome bookmark tree across devices via a
**Dropbox app folder**, using an **append-only op log** as the source of truth
(immutable history replaces a trash bin; three-way merge resolves conflicts).

Lives in `extensions/quick-sync-bookmark/`. Builds and watches alongside the
other two via `scripts/build.js` and `scripts/watch.js`.

---

## What's done

**Commit `18d9328` — Scaffold quick-sync-bookmark extension**
- Manifest, popup, options page, build wiring (no sync logic).
- Bookmark+sync icon (sync arrows dominant, blue bookmark inset).
- Design doc at `docs/quick-sync-bookmark-design.md`.

**Commit `1d23298` — Wire Dropbox OAuth via PKCE**
- `src/oauth.ts` — PKCE flow over `chrome.identity.launchWebAuthFlow`, refresh-token handling, `getValidAccessToken()`.
- `src/dropbox.ts` — minimal RPC client; `getCurrentAccount()` and `revokeToken()`.
- `src/storage.ts` — typed `chrome.storage.local` wrapper.
- Options page: app-key input, Connect/Disconnect, dynamic redirect URI display, scope guidance.
- Popup: shows "Connected as <email>" when authed.
- Manifest: `identity` permission + Dropbox host permissions.

**Note:** later icon-refinement commit (sync arrows dominant) may also be in history.

---

## What's next

Follow the phases in the design doc, in order:

2. **Identity + log primitives** — UUID assignment, `chromeId↔uuid` map, op format with hash chain, JSONL log append/read/parse. All pure, unit-tested.
3. **Materialize + diff + merge** — pure functions; comprehensive Vitest fixtures covering all op-pair conflicts + the loosened concurrent-add rule (URL + title + parent all match → auto-merge).
4. **Sync orchestrator (one-shot)** — manual "Sync now" wires steps 1–9 of the sync algorithm.
5. **Safety mechanisms** — threshold guard, empty-tree guard, hash-chain verification, device-fingerprint guard.
6. **Compaction + snapshots + archive** — log compaction triggers, snapshot writing, archive rotation.
7. **Listener + debounce + churn detector** — change-driven sync with suppression window.
8. **History / restore UI** — popup view of log timeline with "restore to point in time".
9. **Polish** — dry-run mode, device naming, interval tuning, conflict surfacing.

---

## How to try what's built

The default app key is shipped in `src/config.ts` (`DEFAULT_DROPBOX_APP_KEY`), so end-to-end is one click for most users:

1. `npm run build`, then load `dist/quick-sync-bookmark/` as an unpacked extension in Chrome (`chrome://extensions` → Developer mode → Load unpacked).
2. **One-time per install:** copy the extension's options-page redirect URI (shown in the *Advanced* details) and add it to the registered Dropbox app's allowed redirect URIs. See the extension-ID caveat below.
3. Open the extension's options page → **Connect to Dropbox**. Authorize. Popup should now show "Connected as <your email>".

To use a different Dropbox app (forks, self-hosted): expand *Advanced* in the options page and paste a custom app key.

No bookmarks are touched yet — sync logic is phase 2+.

### Extension-ID caveat

The OAuth redirect URI is `https://<extension-id>.chromiumapp.org/`, derived
from the extension's ID. For unpacked extensions, the ID is generated per
install (different per machine) unless we pin it. Until we publish or pin:

- Each dev install of the extension gets its own redirect URI.
- Add each new install's URI to the Dropbox app's allowed redirect URIs (the
  Dropbox app config supports multiple — just keep appending).

To fix this for distribution, add a `"key"` field to `manifest.json` containing
the base64-encoded SPKI public key from a generated keypair; the extension ID
will then be stable across installs and a single redirect URI is enough. Defer
until closer to publishing.

---

## Open decisions

- **Stable extension ID.** Pin the manifest `key` before broad distribution so the OAuth redirect URI is the same across installs (see *Extension-ID caveat* above).
- **Encryption at rest.** v1 trusts Dropbox; v2 could add a user-supplied passphrase. Decide before public release.
- **Conflict UI specifics.** Defer to phase 8 when there are real conflicts to design against.
- **Settings defaults.** Thresholds (20% deletion / 50 items / 5 MB or 10k entries for compaction) are educated guesses; tune after dogfooding.

---

## Files at a glance

```
extensions/quick-sync-bookmark/
  manifest.json                 ← MV3, identity + Dropbox host_permissions
  popup.html / .css             ← status + "Open settings"
  options.html / .css           ← Connect/Disconnect UI
  icons/                        ← sync-bookmark.svg + 16/32/48/128 PNGs
  src/
    popup.ts                    ← shows connection status
    options.ts                  ← wires Connect/Disconnect
    background.ts               ← stub; will hold sync orchestration
    oauth.ts                    ← PKCE flow + refresh
    dropbox.ts                  ← minimal RPC client (account, revoke)
    storage.ts                  ← typed chrome.storage.local
    config.ts                   ← shipped Dropbox app key (public, PKCE-safe)
docs/
  quick-sync-bookmark-design.md ← architecture / op-log / safety
  quick-sync-bookmark-handover.md  ← this file
scripts/
  build.js, watch.js            ← EXTENSIONS array now includes quick-sync-bookmark
```
