# PocketLens Engineering Guidelines

These rules apply to all code created or modified in this repository.

## General Principles

- Prefer simple, readable code over clever abstractions.
- Keep changes focused on the requested task.
- Do not introduce unnecessary abstractions.
- Follow existing architecture unless there is a clear reason to change it.
- Remove dead code and unused imports after making changes.

## Functions

- Functions should normally contain no more than 10 executable lines.
- Each function should have one clear responsibility.
- Extract meaningful helper functions when a function becomes too large.
- Do not create meaningless helper functions purely to satisfy the line limit.
- A function may exceed 10 lines when splitting it would reduce readability.

## Naming

Names must describe their domain purpose.

Avoid vague names such as:

- data
- item
- thing
- stuff
- info
- object
- value
- temp

Prefer:

- transactions
- receipt
- account
- category
- subscription
- user
- parsedReceipt
- monthlyExpenses

Bad:

const data = await getTransactions();

Good:

const transactions = await getTransactions();

Bad:

function processItem(item) {}

Good:

function normalizeReceipt(receipt) {}

## TypeScript

- Prefer explicit domain types over `any`.
- Do not introduce `any` unless unavoidable.
- Prefer `unknown` when the type genuinely isn't known.
- Avoid unnecessary type assertions.
- Prefer early returns over deeply nested conditions.

## Strings

- Prefer single quotes.

Good:

const status = 'active';

Avoid:

const status = "active";

- Double quotes are acceptable when required or when they avoid awkward escaping.

## React

- Keep components focused on one responsibility.
- Extract complex business logic from UI components.
- Avoid unnecessary `useEffect`.
- Avoid storing derived values in state.
- Prefer reusable hooks for reusable stateful behavior.

## Backend

- Keep route handlers thin.
- Business logic belongs in services/domain functions rather than HTTP handlers.
- Validate external input.
- Do not expose internal errors, secrets, tokens, or credentials.
- Use meaningful HTTP status codes.

## Error Handling

- Never silently swallow errors.
- Use domain-specific error messages.
- Avoid generic messages such as "Something went wrong" when a useful error can be provided.
- Log enough context to diagnose failures without logging sensitive information.

## Testing

- Add or update tests when behavior changes.
- Test behavior rather than implementation details.
- Keep tests deterministic.
- Do not make tests depend unnecessarily on the current date/time.

## Before Completing a Task

Run the appropriate:

- lint
- TypeScript/typecheck
- unit tests
- integration tests

Do not report a task as complete when relevant checks are failing.
