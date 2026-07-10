# AGENTS.md
---

# Project IDEA

this project is a CV maker that uses AI agents to generate CV and fill text in the CV.

uphere is what i think, in more detailes what i am aiming to achieve, Is to build platform to make my CV creation easy and fast and centralized.

what i am expecting in future:

- Make CV by prompting AI agent 
- Make Ai that can chat with me and make Email by sending detials of Job post, for example and answer my questions about the job or skills set in my CV  
- Make cover letter by prompting AI agent

---
## Behavioral instructions
### General Rules
Verify a tool's purpose before using it.
Verify a skill's purpose before using it.
Verify a Function's purpose before using it.
dont try to be squidward work on thing that given to you only dont overreach and fix problems that are new or unexpected leave them.
i dont like to read two much give me summary only and only if i asked for more details give it to me.
i dont like tests you make becasue they are just automated checks that do not reflect the real-world usage or behavior of the code.
only tests that test full features or user flows are acceptable, and only if they are critical to the app's functionality, otherwise they should be skipped.
always make sure code you make give output with discriptive instructions dont return raw Errors or exceptions.
Before implementing or reviewing an issue/PR, fetch full context from GitHub:
```
  gh issue view <N> --json title,body,state,labels,comments
  gh pr view <N> --json title,body,comments,reviews,files  # if PR
```
Read ALL issue/PR comments, not just the body. Treat implementation notes,
acceptance tweaks, and design constraints in comments as part of the spec.
Do not start work from title/body alone.

## Fast Folder Map
### Root
- `SiraStudio/` → frontend app
- `sirastudio_ai/` → backend app
- `.venv/` → Python environment
- `run-dev.ps1` → starts frontend + backend

### Backend
- `sirastudio_ai/sirastudio_ai/` → Django config, settings, URLs
- `sirastudio_ai/main/` → models, routes, jobs, tests
- `sirastudio_ai/main/agent/` → agent logic, LLM, prompts, schemas
- `sirastudio_ai/main/agent/tools/` → agent editing tools
- `sirastudio_ai/main/migrations/` → database migrations

### Frontend
- `SiraStudio/public/` → static assets
- `SiraStudio/tests/functions/` → frontend unit tests
- `SiraStudio/src/app/` → app shell and state wiring
- `SiraStudio/src/app/store/` → patch-based state store
- `SiraStudio/src/features/cv-editor/` → CV editor
- `SiraStudio/src/features/cv-editor/sections/` → section registry/types
- `SiraStudio/src/features/assistant/` → AI assistant UI
- `SiraStudio/src/features/assistant/api/` → backend agent calls
- `SiraStudio/src/features/saves/` → saved CVs panel
- `SiraStudio/src/features/print/` → print/PDF rendering
- `SiraStudio/src/features/links/` → social links editor
- `SiraStudio/src/features/external-api/` → public embed API
- `SiraStudio/src/shared/` → shared components, hooks, types, utils

### Key Lookup
- CV types → `SiraStudio/src/shared/types/`
- State logic → `SiraStudio/src/app/store/`
- Editor sections → `SiraStudio/src/features/cv-editor/sections/`
- Assistant API → `SiraStudio/src/features/assistant/api/`
- Print/PDF → `SiraStudio/src/features/print/`
- External API → `SiraStudio/src/features/external-api/`
