---
name: analyze-function
description: Analyze function internals and refactoring opportunities - understand intent, find all usage sites, evaluate for inlining/DRY/dependency injection/strategy patterns, recommend changes. Use when reviewing code for simplification, refactoring, or wondering if a function should exist or change form. The goal is to identify hidden duplication, reduce coupling, or eliminate unnecessary thin wrappers.
---

# Analyze Function

Structured analysis to identify refactoring opportunities: unused functions, thin wrappers, hidden duplication, or tight coupling.

## Step 1: Understand

**What** (1 sentence): Purpose of the function.
**How** (brief): Algorithm, pattern, or key operations.
**Inputs/outputs**: Types and return value. Note any side effects (mutations, I/O, global state).

## Step 2: Find usage

Use Grep to search all call sites of the function name.

Report:
- **Count**: How many call sites
- **Locations**: Which files/functions call it
- **Usage**: Do callers use the return value, or just the side effect?

## Step 3: Evaluate

Skip checks that don't apply. Only flag actionable opportunities.

### Inlining (1–2 call sites, short body)
If ≤2 call sites AND body ≤5 lines, recommend inlining **unless**:
- Name expresses a domain concept (not just "do these 3 lines")
- It's exported / part of public API
- More callers likely in near future

### DRY (duplicated logic elsewhere)
Search for similar patterns: same regex, same chain of operations, same algorithm.
- If found, recommend extracting to a shared utility or using the existing one
- Example: `normalizeTarget` duplicated `fileToSlug`; removed `normalizeTarget`

### Dependency injection (global state, hard-coded strategy)
Flag if the function:
- Reaches for module-level singletons or globals
- Hard-codes a strategy callers might want to vary
- Couples to external dependencies (file system, specific library)

Only suggest DI if there's concrete benefit (testability, flexibility). Pure functions and simple helpers don't need it.

### Strategy / polymorphism (growing conditionals)
Flag if the function has:
- `if/switch` on a type or mode that likely grows
- Repeated conditional blocks that could be table-driven

### Export surface (public vs private)
- Exported but only used internally? → make private
- Private but useful elsewhere? → consider exporting and documenting

## Step 4: Recommend

List actionable recommendations in priority order. Include rationale. "No changes needed" is a valid conclusion.
