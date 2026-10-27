# Lab2 progress ports

These modules are plain-JavaScript ports of Code.org's shared Lab2 progress
system and Studio course-level resolver:

- `apps/src/lab2/progress/ProgressManager.ts`
- `apps/src/lab2/progress/ConditionsChecker.ts`
- `frontend/apps/studio/src/modules/labs/router/resolveCourseLevel.ts`

The prototype leaves out exemplar validation from `ProgressManager` and
query-parameter logging from `ConditionsChecker`.

Files in this directory must not import from outside `src/lab2/`. This keeps
the ports lab-agnostic so Adventure Lab can replace them with the real modules
when it moves into the main Code.org repository.
