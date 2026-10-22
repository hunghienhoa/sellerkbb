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

Admin can toggle `live.assign` separately for approved livestream-host or livestream-operator accounts that have `live.read`. Either delegated role may tag Host/Operator and Campaign/Mega LIVE, and save draft manual KPI GMV allocations. Drafts live in `liveKpiDrafts`; only Admin may approve and transfer allocations into `liveSessions.manualKpiEntries`. Assignments live in `liveAssignments`. KPI calculations must never include a pending draft or permit a delegated Host or Operator to write approved financial fields. Admin may still edit/approve directly. Keep all permission enforcement in Firestore Rules, not UI alone.

Host delegation (v1.49.8): identical opt-in `live.assign` workflow and constraints for `host` and `operator`. Both require `live.read`, cannot approve drafts, and cannot administer users/staff or write reconciled financial data.

## One-click 30-day sync from Tổng quan (v1.49.9)

The Topbar `Cập nhật dữ liệu` button on the Tổng quan dashboard has dual behavior: for Admin, it requests the same background TikTok 30-day autosync job as the TikTok / API `Đồng bộ ngay 30 ngày` control, waits for the server job result, then reloads SellerKBB reporting data. Show pending status and never claim completion before server confirmation and successful data reload. For Host/Operator accounts, reload only allowed report data and do not broaden permissions to the admin-only TikTok sync endpoint. Debounce concurrent sync and handle failures visibly. Never change GMV/KPI logic for this UI convenience.

## Staff photo identity (v1.49.10)

Staff KPI rows use the Google avatar of a matching approved Host/Operator login when a unique, role-correct identity match exists, or a deliberately admin-linked Gmail account. Store only the selected account UID and sanitized Google photo URL/display name in settings/staffMembers so KPI viewers without admin access can view an avatar; never grant wider access to private user profiles. Keep staff name and numeric KPI attribution linked to staff IDs (not Gmail email), and fall back to generated initials when no verified photo is available. On Admin refresh, update cached avatars only when an eligible account has a safe unique role/name match or explicit UID link. Reconcile popup Affiliate rule and KPI status must be visually separated by 12px on desktop/mobile.

## User-editable SellerKBB profile and clean sign-out (v1.49.11)

Each authenticated user can edit **only their own** SellerKBB-facing display name and avatar in the centered topbar account modal. Upload jpg/png/webp under 5 MB, crop to square 256×256 and compress as JPEG data URL under 160k chars before writing `customDisplayName` / `customPhotoURL` and the corresponding display fields to that user's Firestore document; do not edit the Google account, role/status, permissions or KPI data. Optionally reset the avatar to Google's current image. On next sign-in, `ensureProfile` must preserve the user's custom profile fields. Logout must immediately close and empty the account overlay, lift background inert/scroll locks, clear stale authenticated state and show login. Always use Taste Skill (dashboard/app mode), Emil Kowalski and Impeccable for frontend change reviews under root AGENTS.md.

## Persistent Affiliate and truthful 30-day sync (v1.49.12)

Source of truth: the Cloudflare KV `autosync:rolling` retains verified Creator LIVE and Affiliate splits for allowed creator accounts shopkhangbaby/mekhangsua. A failed or incomplete API response must never downgrade `affiliateDataAvailable: true` or delete a previously cached session in the retained 30/180-day window. Enrich the MERGED historical cache, not only the current TikTok seller API window. Retry unresolved sessions with a rotating `affiliateCheckedAt` queue; keep an API budget safe for the Cloudflare Free plan. `affiliatePending` may remain >0 when TikTok's seller product vs creator LIVE data cannot be reconciled, and the UI must display a partial state rather than claim full Affiliate accuracy. UI verifies the new `cacheUpdatedAt` before reporting that a manual sync completed. Both Admin buttons continue to use the same sync job; other roles may only reload available data. No modifications to KPI formulas.
