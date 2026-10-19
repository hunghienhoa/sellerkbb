# sellerkbb — TikTok LIVE Monthly Report

Phiên bản: **1.0.0**

Ứng dụng báo cáo TikTok Shop LIVE dùng:

- **Cloudflare Worker**: host web + backend TikTok OAuth/API.
- **Firebase Authentication**: đăng nhập Google.
- **Cloud Firestore**: tài khoản, phân quyền, phiên LIVE, gắn Host/Operator, KPI.
- **GitHub**: mã nguồn và lịch sử cập nhật; mỗi lần push `main` có thể deploy Cloudflare/Firebase qua GitHub Actions.

## Tính năng

- Google Sign-In qua Firebase.
- Người dùng đầu tiên bootstrap thành `admin`; người dùng tiếp theo ở trạng thái `pending`.
- Admin duyệt tài khoản, chọn vai trò `Host Livestream`, `Nhân viên vận hành livestream`, `Quản trị viên` và chọn quyền đọc LIVE/KPI.
- Role Host/Operator không có menu TikTok API.
- Đồng bộ TikTok Shop LIVE từ `GET /analytics/202509/shop_lives/performance`.
- Lưu GMV ghi nhận lần đầu và GMV hiện tại/final ở lần sync sau.
- Gắn Host + Operator cho từng phiên live.
- KPI: Host 0.3%, Operator 0.1% trên GMV cuối kỳ.
- Pair hỗ trợ: `Thảo My ↔ Hùng Bắc Giang`, `Dung/Tâm ↔ Hùng Hiền Hòa`.
- Lọc theo tháng, xuất CSV.

## 1. Firebase

Tạo Firebase project, bật:

1. Authentication → Sign-in method → Google.
2. Firestore Database.
3. Web App để lấy config: apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId.
4. Deploy rules/indexes trong thư mục `firebase/`.

**Authorized domains** của Firebase Auth phải có domain `*.workers.dev` thực tế và domain riêng nếu dùng.

## 2. TikTok Shop Partner Center

Ứng dụng cần tối thiểu scope:

- `data.shop_analytics.public.read` — TikTok Shop Analytics.
- `seller.authorization.info` / quyền authorization tương ứng để lấy shop cipher.

Khuyến nghị thêm:

- `seller.finance.info` nếu cần đối soát refunds/settlement chi tiết.
- `seller.order.info` nếu cần đối soát trạng thái đơn.

Cấu hình Redirect URL trong TikTok Partner Center:

`https://<worker-domain>/api/tiktok/oauth/callback`

Lấy các giá trị:

- `TIKTOK_APP_KEY`
- `TIKTOK_APP_SECRET`
- `TIKTOK_SERVICE_ID`
- Seller authorization URL theo region (`services.{region}.tiktokshop.com/open/authorize`).

## 3. Cloudflare bindings

Worker vars:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `TIKTOK_APP_KEY`
- `TIKTOK_SERVICE_ID`
- `TIKTOK_SELLER_AUTH_URL`

Worker secret:

- `TIKTOK_APP_SECRET`

KV binding:

- binding: `TIKTOK_KV`
- dùng để lưu seller access/refresh token và OAuth state.

## 4. Build

```bash
npm run check
npm run build
```

Sau build, file deploy là `dist/worker.mjs`.

## 5. Quy trình dữ liệu

GitHub là nguồn mã. Firebase **không pull source code từ GitHub để chạy**; thay vào đó GitHub Actions deploy rules/indexes vào Firebase và deploy Worker lên Cloudflare. Firestore là nơi lưu dữ liệu nghiệp vụ.

Flow dữ liệu:

TikTok Shop API → Cloudflare Worker → trình duyệt admin → Firestore → dashboard/KPI.

## 6. Nâng cấp phiên bản

Không tạo project mới. Mỗi lần cập nhật:

1. Sửa trên repo `hunghienhoa/sellerkbb`.
2. Tăng `VERSION` và `package.json`.
3. Commit lên `main`.
4. Deploy bản mới từ lịch sử cũ.
5. Xuất `.zip` snapshot tương ứng để lưu trữ.


## v1.5.0 — Free-plan safe mode

- Firestore free-plan strategy: no paid TTL deletion. SellerKBB reads only the configured retention window (maximum 180 days) and deletes expired LIVE documents in bounded batches.
- Default safety limits: 180-day retention, 600 MB application soft limit, 12,000 LIVE-session soft limit, emergency cleanup at 85%.
- Cloudflare KV maintenance runs once daily to minimize Free-plan operations.
- TikTok access tokens are checked every 2 hours and proactively refreshed from the stored refresh token before expiry.
- There is no disconnect action in the SellerKBB UI/API. Reauthorization is only needed if TikTok revokes authorization or the refresh token itself expires.
- Source code and GitHub files are never part of automated cleanup.
