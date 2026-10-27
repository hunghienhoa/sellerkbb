# Giao diện SellerKBB mới — tương thích với hệ thống hiện tại

## Mục đích

Đây là lớp giao diện phiên bản Preview được thiết kế theo **file ZIP giao diện mới mà chủ web cung cấp**. Những thành phần lấy từ ZIP: bảng màu pastel hồng, nền #FFF7FA, thẻ KPI nền trắng bo 18px, hệ thống nút với accent #EC4899 / #DB2777, sidebar trắng, header trắng bo 22px, font Be Vietnam Pro và các trạng thái dữ liệu trực quan.

Đây là **giai đoạn tích hợp tương thích**: cấu trúc DOM hiện có được giữ lại để không phá dữ liệu/logic; bố cục không thể bảo đảm giống 100% toàn bộ HTML của ZIP khi chỉ áp dụng adapter CSS. Muốn đạt nguyên mẫu từng pixel cần chuyển từng component sang cùng lớp trình bày và chạy regression tương ứng.

## Đường dẫn

- **Website thật (/):** HTML/CSS/bộ xử lý trước đó, không gắn lớp CSS mới.
- **Bản thử nghiệm (/preview):** cùng mã nguồn HTML, state và nghiệp vụ, thêm CSS adapter `public/new-ui-preview.css`. Bản thử nghiệm có dữ liệu mẫu biệt lập đã có sẵn trong SellerKBB; không ghi vào Firestore/KV thật.
- **Không đưa tệp HTML offline, tài khoản giả hay dữ liệu KPI mô phỏng của ZIP vào hệ thống thật.**

## Những điểm không thay đổi

- Seller Creator `shopkhangbaby` và `mekhangsua`, refresh token, TikTok sync, GMV Affiliate, GMV sau hoàn/hủy, đơn hủy từ LIVE, API và các chỉ số không được chỉnh sửa.
- Firestore Rules, OAuth/Google sign-in, quyền Admin/Host/Vận hành, gắn ca, KPI nháp và phê duyệt không thay đổi.
- Công thức KPI Host 0,3%, Vận hành 0,1% và trường hợp hai Vận hành cùng Camp/Mega LIVE đã vận hành theo quy tắc cũ.

## Kiểm thử

```bash
npm run check
node scripts/deployment-safety.mjs
npm run build
node scripts/verify-new-ui-preview.mjs
npm install --no-save puppeteer-core
CHROME_BIN=/usr/bin/google-chrome RUN_PREVIEW_BROWSER_TEST=1 node scripts/verify-new-ui-preview.mjs
```

Kiểm thử khẳng định đường dẫn `/` trả về **HTML byte-for-byte của** `public/index.html`; `/preview` chỉ thêm style + nhãn Preview. Kiểm tra trình duyệt tại 320/390/768/1024/1440px, không tràn ngang và có navigation.

## Design skills

- **Taste Skill**: giữ mật độ KPI, tiêu đề rõ, số tiền tabular, trạng thái xanh / vàng / đỏ phân biệt.
- **Emil Kowalski**: không thêm hoạt ảnh vào thao tác duyệt hằng ngày; nút phản hồi khi nhấn; tôn trọng reduced motion.
- **Impeccable Operate**: hỗ trợ keyboard focus, mobile controls, safe presentation-only patch.

Không chạy các launcher thiết kế bên ngoài; đã đối chiếu trực tiếp với `PRODUCT.md`, `DESIGN.md` và hướng dẫn skill trong repository.
