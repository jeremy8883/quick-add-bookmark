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
- `src/log.ts` — discriminated `Entry` union for `add`/`remove`/`move`/`rename`/`urlChange`/`snapshot`/`restore`; canonical-JSON SHA-256 hash chain via `crypto.subtle`; `buildNextEntry`, `serializeEntries`, `parseEntries`, `verifyChain`. Genesis entry has `prevHash: null`.
- `src/storage.ts` — added `deviceId`, `deviceName`, `bookmarkUuidMap` keys.
- Tests: `identity.test.ts` (17 cases), `log.test.ts` (16 cases) covering chain construction, tamper detection, parse round-trip, seq monotonicity. No Chrome/Dropbox APIs touched.

**Phase 3 — Materialize + diff + merge**
- `src/log.ts` — refactored to expose `OpInput` (bare `{op, data}`) and `TimestampedOp` (`OpInput & {ts, deviceId}`); `Entry = TimestampedOp & {seq, prevHash}`.
- `src/materialize.ts` — `BookmarkNode`, `TreeState` (flat `uuid → node` map), pure `applyOp(state, op)` per op type, `materialize(entries)`, `childrenOf`, `toSnapshotNodes`.
- `src/diff.ts` — pure `diff(before, after) → OpInput[]` producing add/remove/rename/urlChange/move per node delta.
- `src/merge.ts` — pure `merge(localOps, remoteOps) → {applyToLocal, appendToLog, conflicts}`. Conflict resolution per the design doc: delete-vs-modify → modify wins; modify-vs-modify (same op) → later `ts` wins; concurrent-add (URL + title + parentUuid match) → keep lower UUID, emit `remove` for the loser on both sides.
- Tests: `materialize.test.ts` (20 cases), `diff.test.ts` (11 cases), `merge.test.ts` (18 cases). Covers every op type, every conflict pair, concurrent-add boundary conditions.

**Known phase-3 simplifications to revisit in phase 4:**
- `merge` does not yet *restore* a deleted node when delete-vs-modify resolves in favor of modify — it records the conflict and applies modify ops (which are no-ops if the node is gone from local state). Phase 4's orchestrator has the ancestor state and can compute the restore.
- Audit-marker ops for "loser" entries are not persisted; the `conflicts[]` array surfaces them out-of-band. Decide in phase 4 whether to write a `superseded` op type into the log for full audit history.

---

## What's next

Follow the phases in the design doc, in order:

4. **Sync orchestrator (one-shot)** — wire steps 1–9 of the sync algorithm behind a manual "Sync now" button. Pull `bookmarks.log.jsonl` from Dropbox (`/files/download`), verify chain, materialize ancestor at `lastConsumedSeq`, diff local tree → `localOps`, call `merge`, apply `applyToLocal` to the chrome bookmark tree (with the suppression flag stub), push the new tail (`/files/upload` with `mode: update + rev` for optimistic concurrency). Surface conflicts in the popup.
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
    materialize.ts              ← replay ops → TreeState (pure)
    diff.ts                     ← TreeState delta → OpInput[] (pure)
    merge.ts                    ← three-way merge with conflict resolution (pure)
    identity.test.ts, log.test.ts, materialize.test.ts,
    diff.test.ts, merge.test.ts
docs/
  quick-sync-bookmark-design.md ← architecture / op-log / safety
  quick-sync-bookmark-handover.md  ← this file
scripts/
  build.js, watch.js            ← EXTENSIONS array now includes quick-sync-bookmark
```
