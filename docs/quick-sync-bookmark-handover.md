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

**Phase 4 — Sync orchestrator (one-shot)**
- `src/roots.ts` — logical root UUIDs (`LOGICAL_ROOT_BAR`, `LOGICAL_ROOT_OTHER`, `LOGICAL_ROOT_MOBILE`) + Chromium platform↔logical mapping. Structured so a Firefox port can add its own mapping table.
- `src/dropbox.ts` — added `downloadFile(path)` (returns `null` on `path/not_found` to detect first sync) and `uploadFile(path, content, mode)` supporting `add` / `overwrite` / `update + rev`. Surfaces rev mismatches as `DropboxRevConflict`.
- `src/chrome-tree.ts` — pure `treeStateFromChromeNodes(rootNodes, initialMap, generate)` that assigns UUIDs to non-root nodes and maps chrome roots `"1"`/`"2"`/`"3"` to the logical UUIDs. `readChromeTree()` wraps it with storage I/O. `applyOpsToChrome(ops, uuidMap, opts)` translates ops back through the uuidMap + root mapping, topo-sorting `add` ops so parents land before children.
- `src/sync.ts` — `syncNow()` orchestrator: pull → verify chain → continuity check vs `lastConsumedSeq`/`lastConsumedHash` → diff local tree against materialized ancestor → merge → apply to chrome → build + push new tail (with `mode: update + rev`, or `add` on first sync). Returns `SyncSummary` with op counts + conflicts. Rev conflicts surface for caller-driven retry.
- `src/storage.ts` — added `lastConsumedSeq`, `lastConsumedHash`, `lastRemoteRev`, `lastSyncedAt`.
- `popup.html`/`popup.ts`/`popup.css` — "Sync now" button, "Last synced Nm ago", result line ("N from remote, M pushed, K conflicts").
- Tests: `roots.test.ts` (12 cases), `chrome-tree.test.ts` (7 cases) covering platform↔logical mapping and pure tree-state conversion. Sync/chrome.bookmarks/Dropbox integration is verified by manual browser testing — they aren't unit-testable without a heavier mock harness.

**Phase 4 known limitations / TODOs to revisit:**
- **Manual only.** No bookmark-change listeners or debounce → phase 7. To trigger a sync after local changes, open the popup and click "Sync now."
- **Suppression is a stub.** `applyOpsToChrome` accepts an `opts.suppress(chromeId)` callback but no caller wires it. Phase 7 adds the real `recentlyAppliedByUs` set + listener registration.
- **No safety guards.** Threshold guard, empty-tree guard, device-fingerprint guard are phase 5.
- **No compaction / snapshots / archive.** Phase 6.
- **No `pendingLocalOps` storage.** A mid-sync crash is recoverable by re-running sync (we recompute local ops from a fresh diff each time), but it's slightly less efficient than persisting them. Acceptable for v1.
- **Delete-vs-modify edge.** If remote modifies a node that local deleted, `applyOpsToChrome` will get a `move`/`rename`/`urlChange` op against a chrome ID that no longer exists; it silently skips. The conflict is recorded in `MergeResult.conflicts` but the node is not auto-restored. Phase 4 records the conflict but doesn't reconstruct; that's a phase-5/phase-8 follow-up using the ancestor state.

**Concurrency / locking — explicit decisions:**
- **Cross-device concurrent syncs are handled by Dropbox `rev`** (optimistic concurrency, `mode: update + rev`). If two devices push at the same observed rev, the second fails with `DropboxRevConflict` and `syncNow()` returns `result: "rev-conflict"`. Today the user has to click "Sync now" again to retry. **TODO:** add an auto-retry loop inside `syncNow()` (cap at ~3 attempts) so the retry is transparent. Cheap, deferrable.
- **Same-device concurrent syncs are not possible in phase 4.** The popup is single-instance, the button disables during sync, and there's no other entry point. **Becomes a real concern in phase 7** when the listener-driven sync runs in the service worker — that's a different JS context from the popup, so two `syncNow()` invocations could overlap and double-apply ops to Chrome. **Phase 7 must add:**
  1. In-memory `let syncInFlight = false` inside the SW for SW-internal serialization.
  2. Persistent lock in `chrome.storage.local` (`{ syncInFlight, startedAt }`) with a ~60s stale-detection timeout, to cover popup↔SW races and SW restarts.
- **A Dropbox-side distributed lock (`/sync-lock-<device>.lock`) is deliberately not done** — it would only re-implement what `rev` already gives us, with worse failure modes (stale locks, network partitions).

---

## What's next

Follow the phases in the design doc, in order:

5. **Safety mechanisms** — wire the threshold guard (`>20%` or `>50` deletions abort), empty-tree guard (remote near-empty + local non-empty → abort), device-fingerprint guard (lower threshold when proposed deletions all come from an unseen device), and stricter hash-chain abort path. All live in a new `src/safety.ts`; the orchestrator calls them between merge and apply.
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
    roots.ts                    ← logical root UUIDs + platform mapping
    chrome-tree.ts              ← chrome.bookmarks read/write + topo-sort
    sync.ts                     ← orchestrator: pull/merge/apply/push
    *.test.ts                   ← Vitest unit tests for pure modules
docs/
  quick-sync-bookmark-design.md ← architecture / op-log / safety
  quick-sync-bookmark-handover.md  ← this file
scripts/
  build.js, watch.js            ← EXTENSIONS array now includes quick-sync-bookmark
```
