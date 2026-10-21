# Using Taste + Emil Kowalski + Impeccable in SellerKBB

These three sets of instructions live in the repository, making them readable by supported agents that open this workspace. **No skill runs merely because GitHub contains a SKILL.md.** Coding agents must load the relevant files and their respective hooks/commands must be supported and trusted locally.

| Task | Skill to consult | Key path |
|---|---|---|
| New or improved dashboard layouts, summaries, responsive metric tables, design critique | Taste Skill **app-screen mode**, then Impeccable | `.agents/skills/design-taste-frontend/SKILL.md`, `references/app-screens.md` |
| UI structure, forms, visual hierarchy, consistency, a11y, responsive, empty/error states | Impeccable **Operate** | `.agents/skills/impeccable/SKILL.md` |
| Motion, buttons, dialogs, focus states, mobile polish | Emil Kowalski | `.agents/skills/emil-design-eng/SKILL.md`, `.agents/skills/mobile-native/SKILL.md` |
| Pure backend, API, TikTok synchronization, KPI arithmetic | None required | Follow existing backend/security/reconciliation tests |

## Default workflow

1. Read `AGENTS.md`, `PRODUCT.md`, `DESIGN.md` and the relevant SKILL.md files before making UI changes.
2. Review the existing component/screen first. SellerKBB is a working Vietnamese **Operate-mode** reporting dashboard; do **not** adopt random landing-page redesigns or new brand palettes.
3. Use Taste's `references/app-screens.md` to evaluate data hierarchy and alignment, then Impeccable for form/layout/a11y/error cases, then Emil for purposeful motion and mobile ergonomics.
4. Prefer small, testable changes; do not alter TikTok API data, reconciliation, GMV Affiliate, Host/Operator KPI or role permissions as part of UI polish.
5. Run `npm run check`, `node scripts/ui-browser-test.mjs` and `node scripts/ui-audit.mjs` (with Chromium available). For taste-browser inspection, use only the local app or `/preview` and only if the environment supports it. Check 320/390/768/1024/1440px, touch, keyboard, reduced motion, content overflow and realistic empty/error/loading states.
6. Publish with repository's versioning/README/Release/Cloudflare checks and clearly state what was and was not verified.

## Setup/maintenance

- Taste Skill is vendored in `.agents/skills/design-taste-frontend/` from the MIT-licensed `Leonxlnx/taste-skill` project, including its `LICENSE`, README, app references, scripts and libraries. When updating, compare upstream changes, review any executable code and re-run tests. Installed as source, not automatically invoked; Node 22+ and Chrome/Edge/Chromium are needed for its scripts.
- Emil's skills are already in `.agents/skills/` with their package records in `skills-lock.json`. Impeccable is already in `.agents/skills/impeccable/` and `.github/skills/impeccable/`; its Copilot/Codex hooks exist but execution depends on local tool trust and runtime.
- If using VS Code/Codex, open the **sellerkbb repository root**, pull latest `main`, start a new AI chat and ensure it loads `AGENTS.md`. If Impeccable prompts for hook trust, approve only after reviewing the command. The curated project facts are already in `PRODUCT.md`, so do not overwrite them blindly via init.
- Neither connecting these skills nor updating AGENTS.md changes the live UI or any KPI data. They govern **future edits**.
