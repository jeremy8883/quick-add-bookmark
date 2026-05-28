# Plan: `quick-sync-bookmark` — Dropbox-backed Chrome bookmark sync

## Context

You're already running two Chrome extensions in this monorepo (`quick-add-bookmark`, `quick-go-to-bookmark`) and want a third: a bookmark sync extension that uses **Dropbox** as the storage backend (vs. Floccus's Google Drive). The motivation is partly preference for Dropbox, partly that Floccus is "rough around the edges."

The high-risk failure modes of any bookmark sync tool are:

1. **Accidental deletion** — one device wipes everyone else.
2. **Duplicate bookmarks** — naive dedup destroys legitimate duplicates (same URL, two folders, intentional).
3. **Coexistence with Chrome's native sync** — change-event loops, redundant writes, thrashing.

Your direction (confirmed):
- **Full three-way merge + safety mechanisms from day one** — build it right the first time.
- **Append-only op log** as the storage model — immutable history replaces the need for a trash bin, with no extra dependencies and Dropbox stays the backend.
- Folder name: `extensions/quick-sync-bookmark`.

---

## Goals / non-goals

**Goals (v1):**

- One Dropbox account per browser profile, sandboxed to a Dropbox **app folder** (no full-Drive scope).
- Bidirectional sync with three-way merge using a stable per-bookmark UUID.
- Multiple safety nets against accidental wipes (history-restore from op log, threshold guard, empty-tree guard, device fingerprinting, hash-chain verification).
- Coexists peacefully with Chrome's native bookmark sync when enabled.
- Manual + change-driven (debounced) + interval-based sync triggers.

**Non-goals (v1):**

- Multi-user / shared bookmarks.
- Selective folder sync (sync whole tree only).
- Encryption at rest beyond Dropbox's own (consider for v2).
- Other backends (Drive, S3, WebDAV).

---

## High-level architecture

```
extensions/quick-sync-bookmark/
  manifest.json
  options.html / options.css
  popup.html / popup.css        ← status + manual sync + conflicts
  icons/
  src/
    background.ts               ← service worker: listens, debounces, drives sync
    sync.ts                     ← orchestrator: pull → replay → merge → push
    log.ts                      ← op-log append/read/parse/compact, hash chain
    materialize.ts              ← replay ops → tree state (pure, testable)
    diff.ts                     ← tree diff producing operations (pure)
    merge.ts                    ← merge two op streams with conflict detection (pure)
    identity.ts                 ← UUID assignment + chromeId↔uuid map
    dropbox.ts                  ← Dropbox API client (download/upload, rev)
    oauth.ts                    ← PKCE flow via chrome.identity
    storage.ts                  ← chrome.storage.local wrappers
    safety.ts                   ← threshold guard, empty-tree guard, device check
    history.ts                  ← time-travel: materialize state at any seq/ts
    popup.ts                    ← popup UI (status, sync now, history/restore)
    options.ts                  ← options page UI
    *.test.ts                   ← vitest unit tests for pure modules
```

Reuses from `shared/`:

- `shared/tree.ts` — `flattenBookmarks()`, `findPathToTarget()` for serialization and presentation.
- `shared/tree-counts.ts` — `countBookmarksDeep()` for stats shown in popup.
- `shared/constants.ts` — `ROOT_FOLDER_IDS` (never sync/delete root folders).

Add the new entry to the `EXTENSIONS` array in both `scripts/build.js` and `scripts/watch.js` (see `scripts/build.js:10-27`).

---

## Data model — append-only op log

The remote source of truth is an **immutable, hash-chained log of operations**, not a serialized tree. The tree is a *projection* of the log obtained by replaying ops from genesis. This is the "git-like immutable store" idea, but tailored to a single bookmark schema with no library dependency.

### Op format

Every change is one of: `add`, `remove`, `move`, `rename`, `urlChange`, `snapshot` (compaction marker), `restore` (user-initiated revert to a prior point).

```json
{
  "seq": 1234,
  "prevHash": "sha256-of-previous-entry",
  "ts": "2026-05-28T10:33:21Z",
  "deviceId": "device-uuid",
  "op": "add",
  "data": { "uuid": "...", "parentUuid": "...", "title": "...", "url": "...", "index": 3 }
}
```

`prevHash` chains entries together (same idea as git commit parents in a flat log). Mismatched chain = tamper or corruption — surface to user, prefer a known-good archive.

### Remote layout (Dropbox app folder)

- `/bookmarks.log.jsonl` — current op log, one JSON op per line, append-only semantically. (Dropbox has no append API, so every write replaces the file; that's fine while the file is small. Compaction keeps it small.)
- `/archive/bookmarks-<endSeq>.jsonl.gz` — archived older segments after compaction. Kept indefinitely (small, gzipped).
- `/snapshots/bookmarks-<seq>.json.gz` — periodic materialized snapshots written *alongside* the log, so a fresh device can bootstrap by reading the latest snapshot + tail of log instead of replaying from seq 0.

### Compaction

When `bookmarks.log.jsonl` exceeds **5 MB** or **10,000 entries** (tunable):

1. Materialize current state from the log.
2. Write a `snapshot` op as the new genesis line (contains the full state inline).
3. Archive the prior log to `/archive/bookmarks-<lastSeq>.jsonl.gz`.
4. Start a new `bookmarks.log.jsonl` with the snapshot as line 1.

Snapshots are also written every N ops (e.g. every 500) to `/snapshots/` so history-restore doesn't need to replay millions of ops.

### Local (`chrome.storage.local`)

- `deviceId`, `deviceName`.
- `bookmarkUuidMap` — `{ [chromeId]: uuid }` (reverse built at read time).
- `lastConsumedSeq` — highest log entry already applied to the local chrome tree. **This is the common-ancestor pointer for three-way merge.**
- `lastConsumedHash` — the hash of the entry at `lastConsumedSeq`. Detects log rewrites/corruption on the remote.
- `lastRemoteRev` — Dropbox file `rev` from the last pull. Used for optimistic concurrency on push.
- `pendingLocalOps` — ops produced from local bookmark events but not yet pushed (lets us survive across service worker restarts).
- `dropboxToken`, `dropboxRefreshToken`.
- `settings` — `{ syncIntervalMs, debounceMs, deletionThresholdPct, deletionThresholdAbs, compactionThresholds }`.

No "last-synced tree" snapshot needed — the log *is* the history, and `lastConsumedSeq` is the ancestor pointer.

---

## Sync algorithm (three-way merge over the op log)

On each sync:

1. **Pull**: fetch `bookmarks.log.jsonl` from Dropbox, capture its `rev`. Verify the hash chain end-to-end (cheap; catches corruption).
2. **Verify continuity**: confirm the entry at `lastConsumedSeq` has `lastConsumedHash`. If not, the remote was rewound/rewritten — abort and surface to the user.
3. **Extract remote ops**: `remoteOps = entries after lastConsumedSeq`.
4. **Compute local ops**: read `chrome.bookmarks.getTree()`, translate to UUID space (assigning UUIDs to new nodes), diff against `materialize(log up to lastConsumedSeq)` → `localOps`. Combine with `pendingLocalOps` from storage (in case of crash-recovery).
5. **Safety gates** (see below) over `remoteOps + localOps`. Abort and surface in popup if tripped.
6. **Merge** `localOps` vs `remoteOps` (the divergent segments since the common ancestor at `lastConsumedSeq`):
   - Non-overlapping ops (different UUIDs) → keep both.
   - Same UUID, same op, same value → dedupe.
   - Same UUID, conflicting:
     - `remove` vs `move`/`rename`/`urlChange` → keep the modification; emit an audit-marker op noting the rescue.
     - `move` vs `move`, `rename` vs `rename`, `urlChange` vs `urlChange` → later `ts` wins; loser preserved in the log (it's already there — the log is append-only) so the user can see and revert.
   - **Concurrent-add of the same logical bookmark** (different UUIDs, but URL + title + parentUuid all match, both `add` ops appeared after `lastConsumedSeq`) → auto-merge into a single UUID (keep the lower one, rewrite the other's reference). This is the loosened rule per your feedback.
7. **Apply** the resolved remote-side ops to the local chrome tree via `chrome.bookmarks` API, with the change-suppression flag set (see "Chrome sync coexistence").
8. **Append + push**: build the new tail = `[resolved remote ops] + [resolved local ops]` (resolved local ops include conflict-loser audit markers), append to the log in-memory, push to Dropbox using `mode: { ".tag": "update", "update": lastRemoteRev }`. On rev conflict, restart from step 1.
9. **Update** `lastConsumedSeq`, `lastConsumedHash`, `lastRemoteRev`, clear `pendingLocalOps`. Run compaction check.

`diff.ts`, `merge.ts`, and `materialize.ts` are pure functions, fully unit-testable with the `shared/tree.test.ts` fixture pattern — no chrome API mocking needed.

---

## Safety mechanisms (your headline concern)

All thresholds live in `settings` so they're tunable without code changes.

1. **Initial sync is always a merge, never a wipe.** First-ever sync on a device: pull the log, materialize the remote tree, three-way-merge against local with `lastConsumedSeq = 0`. Both sides are preserved.

2. **The op log itself replaces the trash bin.** Every deletion is an entry that stays in the log forever (or until compaction, after which it's in `/archive/`). Restore = pick a point in history, materialize the state there, diff against current, present as a set of ops to apply (with the threshold guard active). No separate "trash" concept needed; history *is* the trash and far more powerful (you can restore to "the state before that bad sync at 3pm yesterday," not just individual deleted bookmarks).

3. **Deletion threshold guard.** If incoming ops would delete more than **20%** of local bookmarks OR more than **50** items (whichever triggers first), abort the sync and post a system notification + popup badge. User reviews the proposed deletions in the popup and approves or rejects.

4. **Empty-tree guard.** Never accept a remote state that's empty (or near-empty: <5 items) when local has >50 items, without explicit user confirmation. Single most catastrophic failure mode of every sync tool.

5. **Device fingerprinting.** Every op carries `deviceId`. If the proposed deletions all originate from a device this client has never seen before, *lower* the threshold guard for that sync (e.g. 5% / 10 items). Surfaces the "fresh install on a new device wiping the rest" case.

6. **Hash-chain verification.** The chain is verified on every pull. If `lastConsumedSeq` no longer matches `lastConsumedHash`, the remote was rewritten — abort and prompt user (recovery via the archive directory or Dropbox's own file history). Catches the case where someone manually edited the file in Dropbox.

7. **Dropbox file history as a second safety net.** Dropbox keeps file revisions (30 days free, longer paid). Popup "Restore from Dropbox history" exposes this directly via the API for one-click recovery.

8. **Dry-run mode.** Toggle in options: sync computes the merge and shows what *would* happen but doesn't apply. Useful for trust-building during initial setup or when investigating a suspicious sync.

---

## Duplicate handling

Identity is **UUID-based, not URL-based**, which solves most of the trouble for free:

- **Pre-existing duplicates** (same URL in two folders intentionally) — each has its own UUID, sync treats them as separate entities, neither is touched.
- **Concurrent-add of the same logical bookmark** — two devices add `example.com` to `Tech > Articles`, both with title "Example Article", while diverged from the same `lastConsumedSeq`. **Auto-merge into one** (keep the lower UUID, rewrite the other) — these are almost certainly the same intent. Triggered only when **URL + title + parentUuid all match exactly** and both `add` ops are in the divergent segment. Logged in the audit history so the user can see what happened.
- **Concurrent-add with any difference** (different title, different folder, different URL casing) → keep both as separate bookmarks. Optionally surface a "looks similar — merge?" suggestion in the popup, but don't act automatically.
- **Sync-loop duplication** (the historical Floccus failure mode) — prevented by stable UUIDs + the change-suppression flag. The merge recognizes "this 'new' chrome event has the same UUID as one we just applied from the log" and treats it as a no-op.

---

## Coexisting with Chrome's native sync

The interaction is the trickiest part. Three patterns make it work:

1. **Suppression window.** When the extension applies a remote op locally via `chrome.bookmarks.*`, it records the resulting `chromeId` in a short-lived `recentlyAppliedByUs` set (cleared after 30s). The `onCreated`/`onChanged`/`onRemoved` listeners ignore events whose target is in that set. This prevents "extension applies remote → Chrome fires event → extension thinks it's a new local change → uploads → other device pulls → fires event there → ..." loops.

2. **Debounce.** Bookmark events accumulate for 5–10s before triggering a sync. Chrome's own sync delivers updates in bursts; this groups them.

3. **Churn detector.** If `onChanged` fires more than N times in T seconds (e.g. 30 events in 5s — typical of Chrome sync replaying a large remote change), pause the extension's listener-driven sync entirely for 60s and let things settle. Interval sync still runs.

**Honest caveat to document in the README:** if you have Chrome sync enabled across devices in the same Google account, those devices are already syncing via Chrome. This extension is most useful for:
- syncing across **different** Google accounts (work + personal),
- syncing across **different browsers** (Chrome + Firefox via a port later, or Chrome + Brave with their own sync disabled),
- keeping a **second backup** independent of Google's infrastructure.

It will *work* on top of Chrome sync within one account, but it's redundant there.

---

## Dropbox integration

- **App registration**: "Scoped App" with **App folder** permission (sandboxed — Dropbox creates a folder named after the app, extension can only touch that). User has nothing scary to grant.
- **OAuth**: PKCE flow via `chrome.identity.launchWebAuthFlow`. No client secret needed. Refresh tokens for long-lived sessions.
- **API**: `/files/download`, `/files/upload`, `/files/list_folder`, `/files/list_revisions`, `/files/restore`. No external library — small fetch-based wrapper in `dropbox.ts`.
- **Optimistic concurrency**: `mode: { ".tag": "update", "update": rev }` returns a conflict if `rev` doesn't match — that's how concurrent log writes are detected (step 8 of the sync algorithm).
- **No append API**: every write replaces the file. Acceptable while the log stays small (compaction enforces this).

Required manifest permissions: `["bookmarks", "storage", "alarms", "notifications", "identity"]` plus `host_permissions: ["https://api.dropboxapi.com/*", "https://content.dropboxapi.com/*"]`.

---

## Critical files to create / modify

**Create:**

- `extensions/quick-sync-bookmark/manifest.json`
- `extensions/quick-sync-bookmark/popup.html`, `popup.css`, `options.html`, `options.css`
- `extensions/quick-sync-bookmark/icons/*` (16/32/48/128 — copy-and-recolor existing icons as placeholder)
- `extensions/quick-sync-bookmark/src/` files listed under architecture above

**Modify:**

- `scripts/build.js:10-27` — append new extension to `EXTENSIONS` array with entries `src/background.ts`, `src/popup.ts`, `src/options.ts`.
- `scripts/watch.js:10-27` — same.
- `package.json` — bump version, optionally rename or add description (this isn't really just "quick-add-bookmark" anymore — consider a monorepo-level rename in a separate task).
- `README.md` — add section for the new extension.

No changes needed to `shared/` for v1.

---

## Phased build order

Each phase is independently testable and shippable.

1. **Scaffolding & OAuth** — extension shell, options page, Dropbox connect/disconnect, read+write a "hello world" file. No bookmark logic.
2. **Identity + log primitives** — UUID assignment, chromeId↔uuid map, op format, hash chain, append/read/parse of the JSONL log. Pure, unit-tested.
3. **Materialize + diff + merge** — pure functions: `materialize(log) → tree`, `diff(treeA, treeB) → ops`, `merge(localOps, remoteOps) → resolvedOps + conflicts`. Comprehensive Vitest fixtures covering all op-pair conflict cases including the loosened concurrent-add rule.
4. **Sync orchestrator (one-shot)** — manual "Sync now" button wires steps 1–9 of the algorithm. No listeners yet. Validate end-to-end with two real browser profiles.
5. **Safety mechanisms** — threshold guard, empty-tree guard, hash-chain verification, device-fingerprint guard.
6. **Compaction + snapshots + archive** — log compaction trigger, snapshot writing, archive rotation. Test with synthetic 100k-op logs.
7. **Listener + debounce + churn detector** — change-driven sync with suppression window.
8. **History / restore UI** — popup view of the log timeline; "restore to point in time" → produces diff vs current → confirms and applies. Also exposes Dropbox file-history restore.
9. **Polish** — dry-run mode, device naming, interval tuning, conflict surfacing.

---

## Verification

**Unit (Vitest, mirroring `shared/tree.test.ts` fixture style):**

- `log.test.ts` — hash chain verification, parse/append, corruption detection, snapshot/compaction round-trip.
- `materialize.test.ts` — replay correctness across all op types, replay-from-snapshot equivalence.
- `diff.test.ts` — every op type, nested moves, ordering changes.
- `merge.test.ts` — every conflict pair (delete-vs-modify, move-vs-move, rename-vs-rename), plus the concurrent-add auto-merge rule at its boundaries (URL match + title diff → keep both; all three match → merge).
- `safety.test.ts` — threshold guard, empty-tree guard, device-fingerprint guard at boundary conditions.
- `identity.test.ts` — UUID assignment for trees with new and existing chromeIds.

**Integration / manual matrix** (two Chrome profiles, both with extension installed, both connected to same Dropbox app folder):

| Scenario | Expected |
|---|---|
| Profile A adds bookmark while B offline → both sync | B receives it, no duplicates |
| A deletes bookmark while B offline → both sync | B applies deletion, op recorded in log; user can restore from history view |
| A renames folder while B moves a child of it → both sync | Both changes apply, no conflict |
| Both add same URL + title + folder offline → both sync | Auto-merged to one bookmark (loosened rule) |
| Both add same URL but different title → both sync | Both kept as separate bookmarks |
| A wipes all bookmarks → syncs | Threshold guard + empty-tree guard block; B unaffected |
| B is fresh install → first sync | Merge, not wipe; A's bookmarks appear on B |
| User wants to revert to yesterday's state | History view → pick timestamp → preview diff → apply with guard active |
| Chrome sync enabled on A+B same account, extension also active | No loops, idle within 1 min after a change |
| Dropbox log file edited by hand → next sync | Hash chain verification fails, sync aborts, user prompted to restore from archive/Dropbox history |
| Two devices sync at exact same moment | One succeeds, other gets rev conflict, retries cleanly |
| Log reaches 10k entries | Compaction triggers, snapshot written, old log archived, sync still works against new genesis |

**Pre-merge checklist:** `npm run typecheck`, `npm run lint`, `npm test`, manual matrix above with at least the top 5 rows passing.

---

## Open questions to revisit during implementation

- **Encryption at rest:** v1 trusts Dropbox; v2 could add client-side encryption with a user-supplied passphrase. Decide before public release.
- **Conflict UI design:** specifics (modal? badge + list? notification with action buttons?) — defer to phase 7 when we have real conflicts to design against.
- **Settings defaults:** the thresholds (20% / 50 items / 5 MB or 10k entries for compaction) are educated guesses; tune after dogfooding.
