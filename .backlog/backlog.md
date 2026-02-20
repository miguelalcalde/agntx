---
name: Backlog
description: Tracks all work items for the project.
format: "- [ ] [FEAT|FIX] [HIGH|MED|LOW] **Name**. Description"
---

## In Progress

## Pending

- [ ] [FEAT] [MED] **Example Feature**. Replace this with your first feature idea.
- [x] fix the name? -- already aligned on `agntx` everywhere
- [x] ensure the structure is correct.
- [x] test the package -- build + smoke test pass
- [ ] publish first version of agntx
- [ ] Define policy to handle duplicate files encountered accross directories. suffix with names?
- [x] Ensure the CLI provides the symlink options.
- [ ] Refine UI:
  - [ ] The agent information is too packed with the description and all, we need to figure a way to unpack it. (maybe interactively show more info)
  - [ ] we need more agents to fit the list (maybe problem above)
  - [ ] add --no-cache flag to clear the cache
- [ ] add an agent grepper that can help you search through your projects to see where skills or agents are installed. You can set up a general configuration file that defines where your projects are usually located and we can paint a graph of which projects have available which skills or agents.
- [ ] Add `agntx init` to help ppl get started with a new agent setup. Should contemplate initializing a git repo.
- [ ] Add visual indication of overrides. if a skill exists globally, but a project has a local override, we should show a visual indication of the override.

## Done
