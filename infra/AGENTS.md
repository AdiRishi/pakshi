# Alchemy infrastructure

Before changing an Alchemy stack, resource, binding, or infrastructure test,
fetch [Alchemy's documentation index](https://alchemy.run/llms.txt) and read the
pages relevant to the change. Confirm API details against the installed Alchemy
package when the documentation and the pinned version differ.

Pakshi has two stacks: `dev`, which runs locally, and `prod`. Destroying either
deletes everything in it, data included.

Use [Alchemy's testing guide](https://alchemy.run/testing/testing-a-stack/) for
infrastructure tests. `tests/local-stack.test.ts` declares `Test.make` from
`alchemy/Test/Vitest`, deploys a throwaway local `test-*` stage with
`dev: true` in `beforeAll`, runs the Playwright integration journeys
(`tests/*.integration.test.ts`) against it, and destroys it in `afterAll`. It
creates no cloud resources.

Keep Vitest's `sequence.hooks` set to `"list"`: `destroy(Stack)` must run before
Alchemy's fallback runtime cleanup.

Before changing infrastructure test layout or setup, read the repository's
[test layout](../docs/adr/0001-mirror-tests-in-a-tests-directory.mdx) and
[kinds of tests](../docs/adr/0003-three-kinds-of-tests.mdx) ADRs.
