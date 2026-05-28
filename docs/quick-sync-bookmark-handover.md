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

**Phase 2 — Identity + log primitives**
- `src/identity.ts` — `UuidMap` type + pure helpers (`assignUuid`, `lookupUuid`, `lookupChromeId`, `removeMapping`, `renameChromeId`) and storage-backed wrappers (`loadMap`/`saveMap`, `getOrAssignUuid`, `getOrInitDeviceId`, `getDeviceName`/`setDeviceName`).
- `src/log.ts` — discriminated `Entry` union for `add`/`remove`/`move`/`rename`/`urlChange`/`snapshot`/`restore`; canonical-JSON SHA-256 hash chain via `crypto.subtle`; `buildNextEntry`, `serializeEntries`, `parseEntries`, `verifyChain`. `GENESIS_PREV_HASH = "GENESIS"`.
- `src/storage.ts` — added `deviceId`, `deviceName`, `bookmarkUuidMap` keys.
- Tests: `identity.test.ts` (17 cases), `log.test.ts` (16 cases) covering chain construction, tamper detection, parse round-trip, seq monotonicity. No Chrome/Dropbox APIs touched.

---

## What's next

Follow the phases in the design doc, in order:

3. **Materialize + diff + merge** — pure functions; comprehensive Vitest fixtures covering all op-pair conflicts + the loosened concurrent-add rule (URL + title + parent all match → auto-merge). `SnapshotNode` type in `log.ts` is the placeholder shape; revisit when implementing `materialize.ts`.
4. **Sync orchestrator (one-shot)** — manual "Sync now" wires steps 1–9 of the sync algorithm.
5. **Safety mechanisms** — threshold guard, empty-tree guard, hash-chain verification, device-fingerprint guard.
6. **Compaction + snapshots + archive** — log compaction triggers, snapshot writing, archive rotation.
7. **Listener + debounce + churn detector** — change-driven sync with suppression window.
8. **History / restore UI** — popup view of log timeline with "restore to point in time".
9. **Polish** — dry-run mode, device naming, interval tuning, conflict surfacing.

---

## How to try what's built

The default app key is shipped in `src/config.ts` (`DEFAULT_DROPBOX_APP_KEY`), and the extension ID is pinned via the `"key"` field in `manifest.json`, so the OAuth redirect URI is the same on every install.

**One-time Dropbox app setup** (already done; record for posterity): add this redirect URI to the Dropbox app's allowed list:

```
https://iiikikfjiphciidpnnpkafjkkmhdepke.chromiumapp.org/
```

**Per install:**

1. `npm run build`, then load `dist/quick-sync-bookmark/` as an unpacked extension in Chrome (`chrome://extensions` → Developer mode → Load unpacked).
2. Open the extension's options page → **Connect to Dropbox**. Authorize. Popup should now show "Connected as <your email>".

No bookmarks are touched yet — sync logic is phase 2+.

### Extension signing key

The manifest `key` field (public SPKI) pins the extension ID to
`iiikikfjiphciidpnnpkafjkkmhdepke`. The matching private key lives at
`extensions/quick-sync-bookmark/signing-key.pem` and is gitignored
(`extensions/*/signing-key.pem` in `.gitignore`). **Back this file up
somewhere safe** — losing it means the next regeneration produces a
different ID, breaking the Dropbox app's registered redirect URI.

The private key is only strictly required for signing distributable
`.crx` files (self-distribution). For Chrome Web Store publishing,
the store handles signing; the public `key` in the manifest is what
keeps the ID stable across installs.

---

## Open decisions

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
    identity.ts                 ← UUID assignment + chromeId↔uuid map
    log.ts                      ← op format, hash chain, JSONL serialize/parse
    identity.test.ts, log.test.ts
docs/
  quick-sync-bookmark-design.md ← architecture / op-log / safety
  quick-sync-bookmark-handover.md  ← this file
scripts/
  build.js, watch.js            ← EXTENSIONS array now includes quick-sync-bookmark
```
