# Alchemy infrastructure

Before changing an Alchemy stack, resource, binding, or infrastructure test,
fetch [Alchemy's documentation index](https://alchemy.run/llms.txt) and read the
pages relevant to the change. Confirm API details against the installed Alchemy
package when the documentation and the pinned version differ.

Pakshi has two stacks: `dev`, which runs locally, and `prod`. Destroying either
deletes everything in it, data included.

Use [Alchemy's testing guide](https://alchemy.run/testing/testing-a-stack/) for
infrastructure tests. Declare `Test.make` from `alchemy/Test/Vitest` in each
integration file, deploy once in `beforeAll`, and destroy in `afterAll`. Each
suite deploys a throwaway local `test-*` stage with `dev: true` and creates no
cloud resources.

Keep Vitest's `sequence.hooks` set to `"list"`: `destroy(Stack)` must run before
Alchemy's fallback runtime cleanup.

Before changing infrastructure test layout or setup, read the
[repository test ADR](../docs/adr/0001-mirror-tests-in-a-tests-directory.mdx).
