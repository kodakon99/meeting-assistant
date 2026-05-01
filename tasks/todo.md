# Plan: Stop duplicating already-tracked tasks across meetings

## Context

Meeting 2 (status check-in for the onboarding sprint) re-extracts "Build checklist UI component" as a new James task even though Meeting 1 already created it. The Personal Dashboard for James now shows two rows for the same deliverable. We've tightened the prompt twice (`extractAll.ts`) and the LLM still emits duplicates when the dialogue mixes status updates with restatements ("he's building it now, in progress, May 12"). The pipeline does pass `existingTasks` to both the draft pass (`runPipeline.ts`) and the final extraction (`runExtraction.ts`) — the LLM sees them but ignores the rule under ambiguous phrasing.

Goal: end the duplicate problem with a defensive server-side merge so the user stops manually cleaning up Notion rows. Keep the prompt tightening too, since updates carry richer fields (status, deadline) when the LLM explicitly emits them.

## Approach

Two coordinated changes:

### 1. Few-shot example in the LLM prompt

`server/src/pipeline/extractAll.ts` — append a worked example to job #4 (Tasks) showing a status check-in dialogue → ZERO new tasks, ONE update. Concrete examples beat abstract rules for llama-3.3-70b. Mirror the same example in `server/src/pipeline/extract.ts` (the second-pass extractor used after speaker confirmation; `runExtraction.ts:217` calls into it).

### 2. Server-side dedupe safety net

New utility `server/src/pipeline/dedupeTasks.ts` exporting `dedupeAgainstExisting(newTasks, existingTasks, llmUpdates)` which:

- For each new task, compute similarity vs every entry in `existingTasks`:
  - **Owner gate**: `ownerDisplayName` case-insensitive equality OR Levenshtein distance ≤ 2 (for "Sarah" vs "Sarah Chen" type drift).
  - **Description gate**: token Jaccard ≥ 0.55 over lowercased word-stems with a stopword filter (`a`, `the`, `to`, `for`, `on`, `of`, `in`, `and`, `or`, `with`).
- If both gates pass → drop the new task. If the LLM didn't already emit an update for that `existingTask.id`, synthesize one using the new task's status/deadline (if either differs from the existing).
- Return `{ tasks, updates }` — the cleaned arrays.

No external deps; both functions are ~20 lines each. Plain TS.

### 3. Wire the utility into both pipelines

- `server/src/pipeline/runPipeline.ts` — between the `extractAllFromTranscript` call (line 76) and the `updateMeeting` that persists drafts (line 97). The draft preview the user sees in Draft Review now reflects the merged result.
- `server/src/pipeline/runExtraction.ts` — between `extractTasks` (line 217) and `applyUpdates` (line 235). This is the load-bearing fix because it controls what actually gets written to `tasks.json` and dispatched to Notion.

Log the merge: `[dedupe] dropped N duplicate tasks, synthesized M updates` so we can confirm in the server logs.

## Files to change

| Path | Change |
|---|---|
| `server/src/pipeline/dedupeTasks.ts` | NEW — exports `dedupeAgainstExisting` + tiny similarity helpers. |
| `server/src/pipeline/extractAll.ts` | Append worked status-check-in example to job #4. |
| `server/src/pipeline/extract.ts` | Mirror the same worked example in its tasks-section prompt. |
| `server/src/pipeline/runPipeline.ts` | Call `dedupeAgainstExisting` after extractAll, before persisting drafts. |
| `server/src/pipeline/runExtraction.ts` | Call `dedupeAgainstExisting` after extractTasks, before `applyUpdates`. |

No changes to types, schemas, client, or other server files.

## Verification

1. Delete the second meeting in the project so its stale tasks vanish.
2. Re-record sprint 2 (the status check-in transcript).
3. Server log expectations:
   - `[dedupe] dropped N duplicate tasks, synthesized M updates` with `N >= 1` for "Build checklist UI component".
   - `[extractAll] commitments=X, tasks=Y` — Y now smaller than X is acceptable (we merged).
4. Personal Dashboard for James shows ONE "Build checklist UI component" row, status `in_progress`, deadline May 12 (the update's effects).
5. Notion dispatch produces no duplicate row for any pre-existing task.
6. Sprint 1 (initial extraction with no existingTasks) still extracts 5 tasks unchanged — dedupe is a no-op when `existingTasks` is empty.

## Out of scope

- Surfacing dedupe decisions in the Draft Review UI (the user can still see updates as they always have).
- Reverse direction (merging two new tasks within the same meeting that describe the same deliverable — already handled by the prompt's Step C consolidation).
- Renaming/owner-reassignment cases ("Marcus's email task is now Sarah's") — keep treating those as out-of-scope until they actually break something.
