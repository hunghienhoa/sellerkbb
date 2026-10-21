# UI audit v1.47.0 — 21/10/2026

## Scope and changes

Reviewed all ten sections: Tổng quan, Phiên LIVE, Đối soát đơn LIVE, KPI nhân sự, Xuất file, KPI thủ công, Quản lý tài khoản, Quản lý nhân sự, TikTok/API, Lưu trữ. Reviewed account and reconciliation dialogs, existing responsive rules, interaction code, release workflow and relevant regression tests.

| Finding | Resolution |
|---|---|
| Small metric labels/helpers and repeated bold table descriptions compete with values | 12px metric labels/helpers, tabular values, quieter table helper text and clearer heading weights |
| Repeated pink gradients/borders and low-contrast primary/status text | Neutral metric surfaces, quieter table headers, deeper rose actions and accessible status text; pastel identity retained |
| Export/account pages overflow at 320px; larger touch targets expose staff overflow | Wrap long export names, reflow account/staff actions and preserve local table scrolling |
| Ripple forces layout; section entrance repeats on frequent navigation | Remove ripple handler and section entrance; use native press feedback and 180ms dialog entrance |
| Account dialog lacks focus placement/return; dialogs allow background keyboard interaction | Inert app while dialogs are open, focus placement, Tab wrapping, Escape and focus return |
| Desktop Host/Operator selects and storage progress bars lack accessible names | Add contextual aria-labels |
| PC saved-assignment concern from preceding chat | Existing v1.46.7 fix retained and revalidated: both dropdowns collapse after saving, summary/Sửa remain, edits/reload preserve behavior |

## Evidence

- Static structure, syntax, persistence and business-regression checks pass (`npm run check`). Build and Wrangler dry run pass.
- Chromium functional suite passes desktop/mobile: calendar filters, account popup, preview sync/loading, reconciliation status filters/refresh, Host/Operator save/edit/save/reload, Campaign/Mega switching, manual KPI behavior and responsive controls.
- 10 sections × 5 widths (320, 390, 768, 1024, 1440): no page-level horizontal overflow or JavaScript exceptions recorded.
- axe-core 4.14.0 WCAG A/AA automated checks: zero violations across ten sections and account/reconciliation dialogs at 1440 and 390px, with the tested preview data.
- Keyboard checks pass at five widths: focus enters account dialog, Tab/Shift+Tab wrap, Escape restores opener, background becomes interactive again. Reconciliation focus remains within its dialog and returns to its opener.
- Reduced-motion emulation disables modal animation; existing mobile inputs remain at least 16px. Visual screenshots inspected for overview, LIVE, account management, manual KPI empty state, export, staff, TikTok/API, storage and reconciliation.
- CI now repeats responsive/accessibility checks and verifies production HTML, /preview HTML, APP_VERSION and the deployed commit annotation before creating the Release.

## Boundaries

No changes to worker business logic, TikTok fetching/attribution, KPI calculations, Firestore rules or indexes. Functional write tests run with isolated `/preview` data, not real business data. OAuth provider sign-in and actual TikTok/Firebase business writes are not end-to-end tested by this UI suite. Automated accessibility checks are not a full accessibility certification; native iOS/Android devices and assistive-technology sessions were not exercised.

See [DESIGN.md](../DESIGN.md) for the retained design rules and reference sources. GitHub Releases retain the newest five backups.
