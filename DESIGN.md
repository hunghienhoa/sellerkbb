# SellerKBB UI principles

SellerKBB is a Vietnamese daily TikTok LIVE reporting and staff KPI workspace. Optimize scanning and repeated use; retain the pastel pink identity and Be Vietnam Pro font.

- Pastel accent `#e7a3c0` stays in backgrounds and identity. Primary actions use `#a44872` for readable white labels. Status text must contrast with its surface; green means finalized, amber means provisional/waiting, red means an error.
- Use distinct heading, value, label and helper roles. Metric labels/helpers are 12px; values use tabular numbers. Avoid repeating bold helper text next to every monetary value.
- Use neutral white cards with quiet borders. Keep finalized GMV visually separate and retain all existing business labels.
- Controls on mobile should be at least 44px tall, form text at least 16px. Check 320, 390, 768, 1024 and 1440px. Wide report tables may scroll within their container; the page must not overflow horizontally.
- Frequent navigation is immediate. Button presses use a small scale change. Dialogs enter in 180ms with ease-out and 6px travel; no ripple or decorative looping motion. Honor reduced motion. Loading remains understandable through text and aria-busy.
- Dialogs move focus inside, contain Tab, disable background interaction, close with Escape and restore the opener. All interactive controls need visible keyboard focus and an accessible name.
- Host/Operator assignment is collapsed after saving both people, with a summary and Sửa. Keep incomplete assignments editable and preserve Campaign/Mega behavior.
- UI changes must not change TikTok/KPI calculations. Tests use /preview fixtures, never production business writes.

References consulted: [Emil Kowalski — purposeful animation](https://emilkowal.ski/ui/you-dont-need-animations), [animation easing](https://emilkowal.ski/ui/good-vs-great-animations), [Impeccable — typography](https://impeccable.style/docs/typeset/).

## Verification

Run `npm run check`, `node scripts/ui-browser-test.mjs`, and `node scripts/ui-audit.mjs`. Set `CHROME_BIN` if Chromium is not installed at a standard path. The audit stores screenshots and findings in `AUDIT_OUTPUT` (default `../verification/audit`). Optionally set `AXE_PATH` to an installed axe-core `axe.min.js` for WCAG A/AA automated checks across all ten sections at desktop/mobile sizes. Automated checks supplement visual review and do not establish complete WCAG compliance.

Publish only after checks pass; update VERSION, README and Release, deploy production and /preview, verify live version/commit, and retain the five newest GitHub Releases, as required by AGENTS.md.
