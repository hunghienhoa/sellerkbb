# SellerKBB update rules

These rules are mandatory for every SellerKBB feature/fix release.

## Default execution behavior
- When the user asks to sửa, fix, bổ sung, thay đổi, cập nhật, or chỉnh giao diện/nghiệp vụ, implement it immediately without asking for confirmation again unless a real ambiguity blocks safe implementation.
- After every completed change, automatically run checks, update README/release notes when applicable, deploy the new version to production and /preview, verify the live APP_VERSION, and report the result.
- Do not stop at source code or a GitHub commit when the request changes the website; the task is only complete after the updated web version is live and verified.

1. Bump VERSION, package.json, wrangler.toml and the UI version together.
2. Update README in all three places: "Cập nhật mới nhất", current usage instructions, and version history.
3. Run static checks and Chromium smoke tests for desktop + mobile.
4. Push the completed source to main.
5. Make sure the production Worker and /preview are actually updated to the new version; a GitHub commit alone is not a completed release.
6. Verify Cloudflare Worker APP_VERSION and deployed commit annotation after deployment.
7. Create/update the GitHub Release with clear Vietnamese notes from README.
8. Keep only the newest 5 GitHub Releases.
9. Never put API tokens, TikTok secrets, Firebase service credentials, cookies, or passwords in GitHub.

Production: https://sellerkbb.doanhsokpis.workers.dev/
Demo: https://sellerkbb.doanhsokpis.workers.dev/preview

## Mandatory UI/design skills (all coding agents)

**Persistent requirement from the SellerKBB owner:** on every **new UI feature, newly created interface, or UI fix**, all three skill families must be reviewed and their relevant guidance applied: **Taste Skill (app-screen)**, **Emil Kowalski**, and **Impeccable (Operate)**. Do not omit a skill due to the task being “small”; keep visual changes focused and do not execute unrelated CLIs. All UI releases must include a relevant browser regression test for the changed interaction.



These are repository-local skills; read the actual files before UI work, not just their names. The user requests consistent **Taste Skill + Emil Kowalski + Impeccable** guidance on future UI changes. For backend-only TikTok/API/KPI/data tasks, skip design-tool execution unless the user also requests UI changes.

1. **Project truth first:** read `PRODUCT.md` and `DESIGN.md`. Treat SellerKBB as an existing Vietnamese **Operate-mode dashboard**, not a greenfield landing page. Its current pastel-pink/Be Vietnam Pro identity, navigation, copy, data definitions and mobile workflows are pinned. A skill's generic palette, random design direction or layout recipe MUST NOT override these without an explicit redesign request.
2. **Taste Skill (visual judgment & app-screen clarity):** read `.agents/skills/design-taste-frontend/SKILL.md` and, specifically for SellerKBB, `.agents/skills/design-taste-frontend/references/app-screens.md`. Audit the existing dashboard first; use this to judge data density, metric alignment, information hierarchy and UI details. Run its `scripts/inspect.mjs --app` only when Node 22+, Chrome/Chromium and a safe preview are available; never run against authenticated production data or fabricate chart values. Its app-specific guidance takes precedence over its landing-page guidance.
3. **Emil Kowalski (interaction & motion):** read `.agents/skills/emil-design-eng/SKILL.md`, plus `mobile-native`, `animate`, `review-animations` or `animation-performance` when relevant. Prefer immediate feedback and purposeful, restrained motion; respect `prefers-reduced-motion`, 16px mobile inputs and accessible controls.
4. **Impeccable (design QA and hardening):** read `.agents/skills/impeccable/SKILL.md`. Use its Operate-mode rules and, as supported by the coding environment, `context`, `audit`, `harden`, `polish` for the affected surface; respect project hooks when available. If its launcher is unavailable, follow the documented fallback and use `PRODUCT.md`/`DESIGN.md` plus its reference guides.
5. **Workflow:** understand the change → review incumbent UI → apply Taste to prioritise improvements → implement structure with Impeccable → refine interactions with Emil → run automated and visual desktop/mobile checks → review against design constraints → publish under the release rules above. Only execute relevant steps, not every command indiscriminately. Never install runtime dependencies, remote scripts or enable hooks in a user environment without explicit need.
6. **Business safety:** never change LIVE GMV, Affiliate classification, aftersales, orders, authorization, KPI rules, Firestore schema or stored data merely to polish a screen. Do not replace actual business data with demonstrations; use isolated `/preview` fixtures in tests. Never leak tokens, personal or order data to external design services.
7. **Evidence:** in the delivery notes say which skills were actually read/run, which tests ran, and whether deployment was verified. Distinguish a GitHub commit from a production deployment. The skills are guidance, not a guarantee of automatic hook execution in every AI client.

See `docs/DESIGN-SKILLS.md` for paths, update instructions, environment limitations and QA criteria.
