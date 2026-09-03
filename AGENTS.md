# PocketLens Engineering Guidelines & AI Agent Instructions

These instructions and rules apply to all code and documentation created or modified in this repository. This file is the permanent source of truth and guidelines for AI coding agents and contributors.

---

## Session Startup

Every agent session MUST complete the following steps before modifying code or documentation:

1. **Read `AGENTS.md` completely** before making changes.
2. **Read `docs/PROJECT_PROGRESS.md`** to understand the current project state.
3. **Read `docs/ARCHITECTURE.md`** when working on architecture, database behavior, financial logic, OCR, authentication, background jobs, deployment, or infrastructure.
4. **Inspect the existing implementation** before modifying it.
5. **Never assume something is unfinished** based only on old roadmap or history documentation. Verify actual code and tests.

---

## Documentation Roles & Responsibilities

To avoid duplication, each documentation file has a single distinct purpose:

- **`README.md`**: Public-facing project introduction, features, local setup, and portfolio information.
- **`AGENTS.md`**: Permanent instructions, workflows, and coding conventions for AI agents and maintainers.
- **`docs/ARCHITECTURE.md`**: Durable technical specifications, architectural decisions, financial invariants, database schema models, and subsystem workflows.
- **`docs/PROJECT_PROGRESS.md`**: Concise snapshot of the current project state, current focus, completed capabilities, and active work.

If information already belongs clearly in one document, avoid duplicating it in another.

---

## Rules for Updating `PROJECT_PROGRESS.md`

`docs/PROJECT_PROGRESS.md` represents the current state of the project, not a daily development diary.

**Update `docs/PROJECT_PROGRESS.md` ONLY when:**
- A feature is added or removed.
- Significant functionality changes.
- An important bug is fixed.
- Architecture changes.
- Meaningful new work becomes active.
- Meaningful active work is completed.

**Do NOT update `docs/PROJECT_PROGRESS.md` for:**
- Formatting-only changes.
- Prettier changes.
- Simple variable/function renaming.
- Comments or documentation typos.
- Minor refactoring without behavioral changes.
- Dependency lockfile-only changes.

Always keep `docs/PROJECT_PROGRESS.md` concise.

---

## General Principles

- Prefer simple, readable code over clever abstractions.
- Keep changes focused on the requested task.
- Do not introduce unnecessary abstractions.
- Follow existing architecture unless there is a clear reason to change it.
- Remove dead code and unused imports after making changes.

---

## Functions

- Functions should normally contain no more than 10 executable lines.
- The 10-line rule is a guideline, not a reason to create meaningless helper functions.
- Each function should have one clear responsibility.
- Extract meaningful helper functions when a function becomes too large.
- A function may exceed 10 lines when splitting it would reduce readability.

---

## Naming

Names must describe their domain purpose.

Avoid vague names such as:
- `data`
- `item`
- `thing`
- `stuff`
- `info`
- `object`
- `value`
- `temp`

Prefer domain-specific names:
- `transactions`
- `receipt`
- `account`
- `category`
- `subscription`
- `user`
- `parsedReceipt`
- `monthlyExpenses`

```typescript
// Bad
const data = await getTransactions()
function processItem(item) {}

// Good
const transactions = await getTransactions()
function normalizeReceipt(receipt) {}
```

---

## TypeScript & Formatting

- **Single Quotes**: Use single quotes in JS/TS. Double quotes are acceptable only when required or when avoiding awkward escaping.
- **No Trailing Semicolons**: Do not use trailing semicolons in JS/TS.
- **Prettier**: Follow project Prettier conventions.
- **Explicit Types**: Prefer explicit domain types over `any`.
- **Avoid `any`**: Do not introduce `any` unless strictly unavoidable. Prefer `unknown` when the type genuinely is not known.
- **Type Assertions**: Avoid unnecessary type assertions (`as ...`).
- **Early Returns**: Prefer early returns over deeply nested conditions.

---

## React

- Keep components focused on one clear responsibility.
- Extract complex business logic from UI components into domain services or custom hooks.
- Avoid unnecessary `useEffect`.
- Avoid storing derived values in state.
- Prefer reusable hooks for reusable stateful behavior.

---

## Backend & API

- Keep API route handlers thin.
- Business logic belongs in services/domain functions rather than HTTP handlers.
- Validate all external input with Zod schemas.
- Do not expose internal errors, database schemas, secrets, tokens, or credentials.
- Use meaningful HTTP status codes.

---

## Error Handling

- Never silently swallow errors.
- Use domain-specific error messages.
- Avoid generic messages such as "Something went wrong" when a useful error can be provided.
- Log enough context to diagnose failures without logging sensitive credentials or PII.

---

## Testing

- Add or update tests when behavior changes.
- Test behavior rather than implementation details.
- Keep tests deterministic.
- Do not make tests depend unnecessarily on the current date/time.

---

## End of Task Checklist

Before completing any task, every agent MUST:

1. **Review changed files** against `AGENTS.md` guidelines.
2. **Run Prettier** on changed files.
3. **Run linting**: `npm run lint`.
4. **Run type checking**: `npm run type-check`.
5. **Run relevant automated tests**: `npm test`.
6. **Fix any issues** introduced by the task.
7. **Update `docs/PROJECT_PROGRESS.md`** only if meaningful project state changed.
8. **Update `docs/ARCHITECTURE.md`** if architecture or invariants changed.
9. **Report what changed** and what verification was performed.

Do not report a task as complete when relevant checks are failing.
