---
name: review-plan
description: Review existing plan files for undefined items, open decisions, missing scope boundaries, sequencing gaps, ownership holes, and weak validation. Use when the user asks to review a previously created plan, critique a `.cursor/plans/*.plan.md` file, find gaps in a plan, or identify unresolved decisions before implementation.
---

# Review Plan

Review the plan for execution risk, ignore writing style. Plans usually fail at handoff because contracts, decisions, or verification stay implicit. Report only findings that would change implementation, sequencing, ownership, or confidence.

## Which plan to review

If a specific plan file is referenced in the user's request or context, review that file. Otherwise, review the most recent plan (the last or most recently modified file in `.cursor/plans/` or `~/.cursor/plans` that appears in your context).

## What counts as a finding

- Undefined item: a term, file, contract, owner, or dependency is named but not defined enough to implement.
- Open decision: the plan implies alternatives but does not choose one or define a decision rule.
- Gap or oversight: missing dependencies, migrations, tests, documentation, rollout, rollback, permissions, or failure handling.
- Sequencing issue: a later step depends on work that is absent, vague, or ordered incorrectly.
- Boundary problem: scope is too broad, non-goals are missing, or follow-up work is mixed into the main implementation.
- Validation hole: success criteria, verification steps, or acceptance signals are missing or too weak.

## Review workflow

1. Read the full plan once for outcome, constraints, and locked decisions.
2. Re-read the implementation steps and todos. Map each major step to a concrete artifact, owner, or verification method.
3. Flag only issues that would block implementation, create rework, or leave correctness untestable.
4. Match the fix to the depth of the problem: use a local edit for a local gap, but recommend re-scoping or rethinking the architecture when the flaw is structural.
5. Ask a question only when the answer would change scope, architecture, sequencing, or acceptance criteria.

## Plan-specific checks

- If the plan names files, packages, routes, schemas, or APIs, confirm the contract is defined enough to edit the right place.
- If the plan includes todos, confirm each one is actionable or explicitly marked N/A with a task-specific reason.
- If the plan locks an architectural decision, check the later steps actually honor it.
- If the plan calls for tests or docs, check the plan says what must be verified or documented, not just "add tests" or "update docs."

## Using `AskQuestion`

Use `AskQuestion` when the answer changes the plan. For each question, include:

- `Reason`: why the question is needed now.
- `Decision unlocked`: what plan choice depends on the answer.
- `Impact by answer`: how each answer changes the fix or recommendation.

Use this pattern:

- `Question`: one concrete decision.
- `Reason`: the ambiguity creates implementation risk.
- `Impact by answer`: answer A leads to plan change X; answer B leads to plan change Y.

## Response format

### Findings

- `[blocking|important|minor] title` - gap, why it matters, and the smallest fix.

### Questions

- Ask only if needed.
- Include `Reason`, `Decision unlocked`, and `Impact by answer`.

### Verdict

- `No findings` is valid if the plan is actionable as written.
- `Ready` if the plan is actionable as written.
- `Needs revision` if the plan still has blocking ambiguity.
