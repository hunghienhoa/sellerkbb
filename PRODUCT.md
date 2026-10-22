# SellerKBB — Product context (Impeccable / Taste / Emil)

## Who uses it and why

SellerKBB is an internal Vietnamese operational dashboard to check TikTok LIVE performance, verify orders after cancellation/refund and calculate staff KPI. Typical users are an admin, a livestream host and a livestream operator. The app is used repeatedly on desktop and mobile; speed, trustworthy numbers and comprehensible status are more important than visual novelty.

## Product and business facts

- Scope of tracked LIVE creators: `shopkhangbaby` and `mekhangsua`; TikTok Shop/Creator API supplies LIVE analytics. SellerKBB has a dedicated Creator Authorization/Refresh Token flow.
- Core screens: Tổng quan; Phiên LIVE; Đối soát đơn LIVE; KPI nhân sự; KPI thủ công; Xuất file; TikTok / API; management/maintenance/account views, subject to role permissions.
- Distinguish LIVE GMV total, own-shop GMV, Affiliate GMV, temporarily reconciled GMV, cancelled LIVE orders and GMV after cancellation/refunds. Unknown or provisional TikTok data must not be presented as verified final data.
- Automatic Host KPI: 0.3% of qualified reconciled GMV; Operator KPI: 0.1%. Manual KPI applies to designated Campaign/Mega LIVE sessions, with explicit per-person GMV allocations. Treat these as locked product rules; do not recalculate in design-only changes.
- Data storage/authentication: Cloudflare Worker/KV and Firebase/Firestore/Google sign-in, with privacy and permissions. Never send LIVE/order/user data to external design tools.

## Operating UX, identity and constraints

- Existing interface identity: light pastel pink, off-white cards, restrained accent and Be Vietnam Pro. Preserve it unless the user explicitly requests a redesign.
- Design mode: **Operate** (high-frequency dashboard), not **Persuade** (marketing landing page).
- Keep reporting legible: large tabular money values, small crisp labels, separated final/provisional/cancelled states, no fabricated summary numbers.
- Mobile first for input: minimum 16px inputs to prevent iOS auto-zoom, touch targets around 44px, no page horizontal overflow, internal scroll for large tables, dialogs keyboard accessible.
- Use motion for feedback and orientation only; frequent data navigation should stay fast, no decorative loops, honor reduced motion.
- Validate at widths 320, 390, 768, 1024 and 1440px; check long names, empty results, many orders, API failures, overlapping LIVE times and missing permissions.

## Scope and release

Product behaviour, auth, reconciliation and KPI formulas are outside the scope of visual-only refinements. Treat `DESIGN.md`, `AGENTS.md` and `docs/DESIGN-SKILLS.md` as the source of design-work rules. Changes run `npm run check`, Chromium smoke tests and a11y audit, then use the existing GitHub Actions deployment/release verification flow. Production: https://sellerkbb.doanhsokpis.workers.dev/ ; safe demo: /preview.

This file records known project facts from its source/README. It does not claim a live business-data audit or an interactive `/impeccable init` session took place.

## Delegated LIVE tagging and KPI draft review (v1.49.7)

Admin can toggle `live.assign` for approved livestream-operator accounts that have `live.read`. The delegated operator may tag Host/Operator and Campaign/Mega LIVE, and save draft manual KPI GMV allocations. Drafts live in `liveKpiDrafts`; only Admin may approve and transfer allocations into `liveSessions.manualKpiEntries`. Assignments live in `liveAssignments`. KPI calculations must never include a pending draft or permit an operator to write approved financial fields. Admin may still edit/approve directly. Keep all permission enforcement in Firestore Rules, not UI alone.
