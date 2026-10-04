# Story Drafts

## Overview

Lets a writer create a "draft" of a story — a fork of the whole story that can be edited independently of the original. Common uses: alternate endings, chapter rewrites, revision passes.

- Each story has one or more drafts. Exactly one is marked **current** at any moment.
- The stories list, series views, and reader-facing share links default to the current draft.
- Drafts are a subscriber-only feature. Non-subscribers see the drafts UI shaded out, matching the existing export/share pattern.

## v1 scope

**In:**
- Create a draft from an existing story (deep-clone of chapters, blocks, outline).
- Name a draft.
- Switch which draft is current.
- List all drafts of a given story.
- Rename a draft.
- Delete a non-current draft.
- Web UI: drafts picker in the editor header; shaded for non-subscribers.

**Out (future work):**
- Per-draft association forking (associations are shared at root in v1 — see §Associations).
- Comment carry-over or shared comments across drafts (new drafts start with empty comments).
- Side-by-side draft comparison / diff view.
- Mobile UI in MiniDocter (web-only in v1; mobile follows).

## Design decisions

| Area | Decision | Reasoning |
|---|---|---|
| Scope | Whole story (chapters, blocks, outline) | Matches writer intent for alternate endings / rewrites. Isolates divergence to prose. |
| Ancestry | Original story is the root forever. Drafts have `original_story_id = root.id`. The root is itself the "first draft." | Auditable. Doesn't require migrating root identity when current changes. Reader endpoints only need `root → current` resolution. |
| Billing | Subscriber-only. Non-subscribers see shaded buttons via `userDetails.subscriber`, matching `DocumentExporter/index.tsx:120-148`. | Reuses existing gating pattern. New `BenefitDrafts` entry in `models/benefits.go`. |
| Series | Draft inherits series membership from source. Series views show only the current draft of each root. | Series pages stay clean; drafts don't visibly duplicate rows. |
| Sharing | Share links resolve `root → current` at read time. A share link identifies the root; readers always see whatever draft is marked current. | Writers can flip canonical drafts without regenerating share links. |
| Comments | No carry-over. New drafts start with empty comments. | Comment-to-block references are tied to cloned block IDs. Sharing or copying is fragile and surprising. |
| Associations | Shared at root. All drafts of a root read/write the same association list. | Matches "characters stay the same, I'm rewriting the plot." Avoids compounding against the free-tier 10-association cap on lapse. Per-draft forking is a possible follow-up. |

## Data model changes

### `Story` struct — `models/api.go`

Three new fields:

```go
type Story struct {
    // existing fields unchanged
    OriginalStoryID string `json:"original_story_id,omitempty" dynamodbav:"original_story_id,omitempty"`
    DraftName       string `json:"draft_name,omitempty"        dynamodbav:"draft_name,omitempty"`
    IsCurrentDraft  bool   `json:"is_current_draft,omitempty"  dynamodbav:"is_current_draft,omitempty"`
}
```

**Semantics:**
- The root row has `OriginalStoryID = ""`. Child-draft rows have `OriginalStoryID = root.id`.
- `IsCurrentDraft` is set on exactly one row across the ancestry group — either the root (common single-draft case) or one of the children.
- `DraftName` is user-facing. Default on the root is `"Original"`, set lazily on first draft-creation.

### DynamoDB GSI on `stories`

Add a secondary index so `GET /stories/:id/drafts` doesn't scan:

```
Index name: original_story_id_index
  PK: original_story_id
  SK: created_at
```

Created on both `stories` and `stories_staging`. DynamoDB builds it in the background; no table rebuild.

### Stories-list visibility invariant

Exactly one row per ancestry group is visible in the stories list:
- A root with no drafts: the root itself (visible by default — no `is_current_draft` needed).
- A root with drafts: the row with `is_current_draft = true`, which may be the root or a child.

Enforcement: `POST /stories/:id/drafts/current` runs a two-row transaction (unset previous current, set new current). If a current draft is deleted, delete-handler promotes the root back to current.

## Backend changes

### `models/benefits.go`

Add benefit constant and entry:

```go
const BenefitDrafts = "drafts"
```

```go
{
    ID:          BenefitDrafts,
    Title:       "Story drafts",
    Description: "Keep multiple drafts of the same story and switch between them any time.",
},
```

### Endpoints — `cmd/threadr/router.go`

All under existing `/stories` prefix, all gated by subscriber middleware:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/stories/:id/drafts` | Create a draft of `:id`. Body: `{ "draft_name": "..." }`. Returns the new story. |
| `GET` | `/stories/:id/drafts` | List all drafts in the ancestry of `:id` (uses the new GSI). |
| `POST` | `/stories/:id/drafts/current` | Mark `:id` as the current draft. |
| `PATCH` | `/stories/:id` | Existing endpoint. Accepts `draft_name` as a new optional field. |
| `DELETE` | `/stories/:id` | Existing endpoint. Guard: if deleting the current draft, promote the root to current before deleting. If deleting the root while drafts exist, refuse (user must delete all drafts first). |

Routes should mirror the existing provider-agnostic pattern used by `/auth/{provider}`.

### DAO — `daos/stories.go`

New method:

```go
func (d *DAO) CreateStoryDraft(
    ctx context.Context,
    email, sourceStoryID, draftName string,
) (newStoryID string, err error)
```

Steps:
1. Load source story. Verify caller owns it.
2. Resolve root: if source has `OriginalStoryID != ""`, that is root; else source is root.
3. Generate new `story_id`.
4. Write new story row (copy `title`, `description`, `series_id`, `outline`, `image_url` from source; set `original_story_id = root.id`, `draft_name`, `is_current_draft = false`, fresh `created_at`).
5. Load `GetChapters(sourceStoryID)`. For each: new `chapter_id`, write under new story_id, preserve `place` and `title`.
6. For each new chapter, copy blocks from `GetStoryBlocksTableName(sourceStoryID)` into `GetStoryBlocksTableName(newStoryID)`, remapping `chapter_id`. Block `key_id` within a chapter is preserved.
7. Associations: not copied — shared at root (see §Association read routing).
8. Comments: not copied.
9. Outline: copied as part of step 4 (lives on the story row).

**Transactionality.** DynamoDB `TransactWriteItems` caps at 100 items. A large story can exceed this.

Approach for v1:
- Story row + chapter rows in a single `TransactWriteItems`.
- Blocks copied in batched `BatchWriteItem` calls after the story row commits.
- If a block batch fails: run a synchronous rollback that deletes the new chapters and story row. Simple and correct for v1.
- Follow-up (post-v1): hook the `cleanup` lambda to detect orphan drafts (story rows with `original_story_id` set whose chapter block counts are 0 while source has blocks) and either resume or delete.

### DAO — `rootStoryID` helper

Many read paths (associations, sharing, series) need to route through the root. Centralize:

```go
func (d *DAO) rootStoryID(ctx context.Context, storyID string) (string, error) {
    story, err := d.GetStoryByID(ctx, storyID)
    if err != nil { return "", err }
    if story.OriginalStoryID != "" { return story.OriginalStoryID, nil }
    return story.ID, nil
}
```

Cache the `storyID → rootID` mapping in-process with a short TTL (~60s) to avoid double-reads inside a single request.

### Association read routing — `daos/associations.go`

All `GetAssociations`-style methods route through `rootStoryID` before querying. Writes also route through root. Handlers don't change.

Rationale: association `story_or_series_id` already composite-keys associations; by using the root id, all drafts naturally share.

### Share link resolution — `daos/sharing.go` / `api/*share*`

Share link creation: unchanged.

Share link read path (reader opens link):
1. Resolve token → stored `story_id`.
2. Resolve `root = rootStoryID(story_id)`.
3. Query the ancestry group for the row with `is_current_draft = true`. If none, use the root.
4. Serve that story's chapters/blocks/associations to the reader.

### Series — `daos/series.go`

`GetSeriesWithStories` filter: a story member of a series is visible only if it's the current draft of its ancestry group.

Simplest implementation: when a draft is marked current, propagate `series_id` from the previous current to the new current in the same transaction. Then the series query stays trivial — it just filters by `series_id` on the stories table. The `series_id` effectively "follows the current pointer."

### Stories list — `daos/stories.go` / `api/gets.go`

`GetUserStories` filter expression:
```
attribute_not_exists(original_story_id) OR is_current_draft = :true
```

Translation: show the row if it's a root (no `original_story_id`) OR it's the current draft of its ancestry.

With the "series_id follows current" propagation above, this remains correct for series-filtered views.

## Frontend changes — `static/`

### New component: `DraftsPicker`

Location: `src/components/ThreadWriter/subcomponents/DocumentMenu/DraftsPicker/`

Contents:
- Icon button in the document menu (icon TBD — `HistoryEduIcon` or similar from `@mui/icons-material`).
- Dropdown listing all drafts in the ancestry:
  - Current draft highlighted.
  - Other drafts: click to switch (navigate to `/stories/{draft_id}`).
  - Each row has an actions menu: Set as current, Rename, Delete.
- "Create draft…" item at the bottom. Opens a small modal asking for a name; on submit, calls `POST /stories/:id/drafts`, then navigates to the new draft.

### Subscriber gating

Clone the exact pattern used by `DocumentExporter/index.tsx:120-148`:

```tsx
const disabled = !userSettings.userDetails.subscriber;
const altText = disabled
  ? "Drafts are only available to subscribers"
  : "Drafts";

<Tooltip title={altText} placement="top">
  <span>
    <IconButton
      aria-label="drafts"
      disabled={disabled}
      sx={{ "&.Mui-disabled": { opacity: 0.4 } }}
    >
      <HistoryEduIcon fontSize="small" />
    </IconButton>
  </span>
</Tooltip>
```

### Stories list / series page

No visible UI change required — the backend filter means these views already show only the current draft of each root.

### URL / routing

Existing `/stories/{story_id}` route handles everything. Switching drafts is a navigation, not new routing.

### Share dialog

No change on the author side. Backend resolves root → current at read time, so sharing continues to point at whatever is canonical.

## Mobile (MiniDocter) — deferred

Not in v1. Mobile subscribers transparently get the current draft because the stories list filter and share-link resolution are backend-side. Post-v1: port `DraftsPicker` into `src/screens/` with a React Native UI and expose the same API client calls.

## Testing

Adequate test coverage is a non-negotiable deliverable, not a follow-up. The feature does not ship without:

- Unit tests covering every new DAO method and endpoint handler.
- Integration tests covering the end-to-end flows that cross service boundaries (deep-clone → read, set-current → stories-list, share-link → current-draft resolution, subscription lapse → gated endpoint).
- A frontend test suite for `DraftsPicker` that covers both subscriber and non-subscriber paths.
- Coverage reported via the existing `make coverage` / `make coverage-html` targets. New files should not drop total coverage below the pre-feature baseline; aim to match the coverage ratio of neighboring packages (`daos/`, `api/`) which already have `_test.go` siblings for every production file.

### Backend — Go

Unit tests, co-located as `_test.go` next to the production files (`daos/stories_test.go`, `api/*_test.go`, etc.) matching the repo convention:

- `CreateStoryDraft` (`daos/stories_test.go`):
  - Identity isolation — new story/chapter/block IDs don't collide with source; both exist independently in the stories and blocks tables.
  - Content equivalence — new draft's blocks render the same text as source's at the moment of creation.
  - Chapter place/title preserved; chapter IDs are fresh.
  - Associations are not copied — new draft id reads from root's association list; writes against the new draft id land on root.
  - Comments are not copied — new draft returns zero comments regardless of source comment count.
  - Outline is copied as part of the story row.
  - Non-owner rejection — a caller who doesn't own the source story gets an error, no partial writes.
  - Transactional failure — simulate a block-batch error (`BatchWriteItem` returning `UnprocessedItems` persistently); verify the new story row and chapters are rolled back and no orphans remain.
- `rootStoryID` (`daos/stories_test.go`):
  - Resolves self for roots.
  - Resolves to the correct root for children.
  - Returns an error for unknown IDs rather than silently returning the input.
  - Cache behavior under TTL expiry.
- Share-link resolution (`daos/sharing_test.go`):
  - Create link against root → reader fetches root.
  - Create link against draft A, flip current to draft B → reader fetches B.
  - Current pointer missing (fallback to root) → reader fetches root.
- "Set as current" (`daos/stories_test.go`):
  - `series_id` propagates to the new current and clears on the previous.
  - Two-row transaction atomicity — if one update fails, neither row changes.
  - Rejects marking a non-draft story (one with no `original_story_id` and no siblings) as current when it's already the only member — no-op rather than error, documented behavior.
- Stories-list filter (`daos/stories_test.go`):
  - A root with no drafts shows the root.
  - A root with drafts shows only the current.
  - A root whose current draft has been deleted shows the root (after promote-on-delete).
- Delete-draft guards (`daos/deletion_operations_test.go`):
  - Deleting a non-current draft: succeeds, cleans up its chapters and blocks table, does not touch root.
  - Deleting the current draft: refuses with a descriptive error (handler-level), or alternately promotes root to current first — pick one and test it.
  - Deleting the root while drafts exist: refuses with a descriptive error.

Handler-level tests (`api/*_test.go`):

- `POST /stories/:id/drafts` — subscriber creates successfully, non-subscriber receives 402 citing `BenefitDrafts`, auth missing returns 401, source story not owned returns 403.
- `GET /stories/:id/drafts` — subscriber lists siblings including the row they queried from; non-subscriber receives 402.
- `POST /stories/:id/drafts/current` — subscriber flips current; non-subscriber 402; attempting to mark a story in a different user's ancestry returns 403.
- `PATCH /stories/:id` with `draft_name` — subscriber renames; non-subscriber receives 402 only if also attempting draft operations (plain story edits remain available).

### Backend — integration tests

End-to-end flows against the full DAO + handler stack (DynamoDB Local or the staging environment, consistent with how existing integration tests in the repo are wired):

- **Clone → read**: create a story with chapters, blocks, outline, and associations. Call `POST /stories/:id/drafts`. GET the new draft. Assert full equivalence of chapter/block content and that associations are read-through to the root.
- **Set current → stories list**: create a draft, mark it current, hit `GET /stories` and assert only the current is listed. Repeat for `GET /series/:id`.
- **Share-link follows current**: author creates draft A, creates a share link, flips current to draft B, assert reader hitting the link gets B's content (same block count, text, chapter titles).
- **Subscription lapse**: subscriber creates N drafts, then the subscription lapses (simulate via Stripe webhook or by flipping `subscriber=false`). Assert `POST /stories/:id/drafts` returns 402, existing drafts remain readable, stories list still shows the current draft of each root.
- **Rollback on transaction failure**: with a seeded source story, inject a block-copy failure into the DAO. Call `POST /stories/:id/drafts`. Assert no new story row and no new chapter rows exist afterward (query the GSI by `original_story_id`).
- **Delete current → promote root**: delete the current draft via `DELETE /stories/:id`, assert the root is now current and visible in the stories list.

### Frontend — Vitest

Co-located under `__tests__/` matching existing conventions (`LoginPanel/__tests__/index.test.tsx`, etc.):

- `DraftsPicker` (`DraftsPicker/__tests__/index.test.tsx`):
  - Subscriber: picker renders, lists drafts from a mocked API, highlights the current one.
  - Subscriber: clicking "Create draft…" opens the modal, submitting it POSTs with the entered name, and the UI navigates to the new story ID returned.
  - Subscriber: per-row actions (Set as current, Rename, Delete) call the expected endpoints.
  - Non-subscriber: button is `disabled`, tooltip reads "Drafts are only available to subscribers," opacity 0.4 — same assertion style as the existing `DocumentExporter`-related tests.
- Non-regression: existing suites (`LoginPanel`, `SignupPanel`, `ShareDialog`, `CommentsPanel`) still pass; `DocumentMenu` snapshot updated only to add the new button, nothing else.

### Running everything locally before merging

```
make lint
make lint-ui
make unit-test                 # Go + Vitest
make coverage-html             # inspect that no new code is uncovered
```

CI must be green on all of the above. Any new `_test.go` or `*.test.tsx` file that uses mocks instead of real integration should be flagged in review for whether it can be elevated to an integration test — mocks are a tool, not a goal.

## Migration & rollout

- **GSI creation** on `stories` and `stories_staging` — backfills in the background, no downtime, no table rebuild.
- **No data migration required at launch.** Existing story rows have no `original_story_id` / `draft_name` / `is_current_draft` and will be interpreted as "root with no drafts" (which they are). `draft_name = "Original"` is populated lazily on first draft creation per story.
- **Feature flag (optional):** `DRAFTS_ENABLED` env var during initial rollout lets us dark-launch to subscribers without exposing broken endpoints. Can skip if subscriber gating is tight enough.

## Open follow-ups (not blocking v1)

- Per-draft association forking: a "fork this association into this draft only" button. Would add an optional `draft_id` column on the association row (null = shared with root). Starting shared and allowing selective forks is tractable; starting cloned and trying to re-merge is not.
- Side-by-side diff viewer for two drafts.
- Comment carry-over or shared-at-root comments.
- Draft templates (clone an existing story as a *starting template*, not a draft).
- Automatic snapshot drafts on major revisions.
