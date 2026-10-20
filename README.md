<div align="center">

# 🌸 SellerKBB

### Báo cáo TikTok LIVE · KPI nhân sự · Tự đồng bộ 24/24

**Phiên bản hiện tại: v1.43.0**

[![GitHub Release](https://img.shields.io/github/v/release/hunghienhoa/sellerkbb?label=Release)](https://github.com/hunghienhoa/sellerkbb/releases)
[![GitHub Actions](https://img.shields.io/github/actions/workflow/status/hunghienhoa/sellerkbb/deploy.yml?branch=main&label=Ki%E1%BB%83m%20tra%20%26%20Backup)](https://github.com/hunghienhoa/sellerkbb/actions)

**Website:** https://sellerkbb.doanhsokpis.workers.dev/

**Bản xem thử:** https://sellerkbb.doanhsokpis.workers.dev/preview

</div>

---

## 🆕 Cập nhật mới nhất — v1.43.0

- Sửa trạng thái phiên **đã chốt/đã đối soát** trên danh sách LIVE ở **Tổng quan** và **Phiên LIVE** để không còn nhìn như phiên màu hồng/tạm tính.
- Phiên đã chốt nay có:
  - thẻ xanh **✓ Đã đối soát**;
  - KPI **✓ Đã chốt** màu xanh;
  - nền/viền xanh rất nhẹ trên card mobile;
  - các ô GMV trên card đã chốt chuyển sang tông xanh nhạt;
  - dòng desktop đã chốt cũng có nền xanh nhẹ.
- Dòng **GMV sau khi hoàn hủy** trên card đã chốt hiển thị rõ **✓ Đã đối soát · số chốt để tính KPI**.
- Phiên chưa chốt vẫn giữ trạng thái tạm tính/cảnh báo hiện tại để phân biệt ngay bằng màu sắc.
- README, kiểm thử PC/mobile và GitHub Release được cập nhật cùng phiên bản.

---

## 👋 README này dành cho ai?

README này được viết để **người không phải dân IT vẫn có thể quản lý SellerKBB**.

Bạn không cần hiểu hết code. Chỉ cần nhớ 4 nơi chính:

| Nơi | Dùng để làm gì? | Có nên tự sửa không? |
|---|---|---|
| **GitHub** | Giữ mã nguồn (SRC), lịch sử thay đổi và Release backup | Không sửa code trực tiếp nếu không chắc |
| **Cloudflare Worker** | Chạy website + backend + tự đồng bộ TikTok | Chỉ cấu hình theo hướng dẫn |
| **Firebase** | Đăng nhập Google, tài khoản, phân quyền, dữ liệu nghiệp vụ | Không xóa collection thủ công |
| **TikTok Shop API** | Cung cấp số liệu LIVE | Không chia sẻ App Secret / token |

> **SRC là gì?** SRC = source code = toàn bộ mã nguồn để tạo ra website SellerKBB. Nếu website bị sửa lỗi, GitHub Release giúp quay lại SRC của bản trước.

---

## ✨ SellerKBB đang làm gì?

- Đăng nhập bằng Google/Firebase.
- Tài khoản mới phải chờ Admin duyệt.
- Admin chọn vai trò: **Host Livestream / Livestream operator / Admin**.
- Host và Operator không nhìn thấy phần TikTok API.
- TikTok LIVE tự đồng bộ **mỗi giờ, chạy 24/24**.
- LIVE Analytics được quét lại hằng ngày; riêng từ v1.33.0 có thêm tab đối soát cấp đơn để xem vận chuyển/hủy/hoàn rõ ràng hơn.
- Phiên LIVE mới **không tự chọn Host/Operator**; Admin chọn thủ công.
- KPI mặc định:
  - Host Livestream: **0,3% GMV dùng KPI**.
  - Livestream operator: **0,1% GMV dùng KPI**.
- **Từ v1.37.0:** giao diện dùng 3 tên rõ ràng: **GMV đã ghi nhận / GMV chờ đối soát / GMV sau khi hoàn hủy**. KPI tự động chỉ dùng đơn có tín hiệu LIVE chắc chắn; đơn chỉ khớp thời gian không được tính KPI.
- **Ngày Campaign/Mega Live** có thể bật chế độ KPI thủ công; sau khi tích phải chọn rõ **Ngày Campaign** hoặc **Mega Live**. Hai ô Host/Operator tự động được ẩn hẳn và phiên đó không cộng KPI tự động.
- Bộ lọc: **Hôm nay / 7 ngày / 30 Ngày / Chọn ngày**.
- Có trang Xuất file riêng.
- Lưu dữ liệu **60–180 ngày** theo cấu hình; 60 ngày gần nhất được bảo vệ để phục vụ đối soát đơn và hậu mãi.
- Có trang **Lưu trữ & tự dọn** theo dõi GitHub / Firebase / Cloudflare.
- Hỗ trợ PC và điện thoại.
- Giao diện **hồng pastel nhẹ**, sidebar chia rõ **Báo cáo / Công cụ / Quản trị**; **KPI thủ công** nằm ở **Công cụ**, còn **Quản lý tài khoản** nằm trong **Quản trị** và là nơi duy nhất quản lý user.

---

## 🧭 Cách sử dụng hằng ngày

### 1. Mở website

Vào website SellerKBB. Mặc định hệ thống luôn chọn **Hôm nay**.

### 2. Kiểm tra Tổng quan

Tổng quan hiển thị 4 ô chỉ số chính như cũ và thêm một thẻ ngang **GMV sau khi hoàn hủy** ngay bên dưới. Số GMV này chỉ cộng những phiên đã chốt/đã đối soát; các phiên còn tạm tính không được cộng vào đây.

Trong danh sách phiên bên dưới, phiên đã chốt được đánh dấu bằng **✓ Đã đối soát** và tông xanh nhẹ để không bị nhầm với phiên tạm tính màu hồng/vàng.

- **Hôm nay:** chỉ xem các phiên của hôm nay.
- **7 ngày:** tính từ hôm nay lùi 7 ngày.
- **30 Ngày:** tổng số liệu tính đủ 30 ngày; danh sách trên Tổng quan chỉ hiện 7 ngày gần nhất để gọn.
- Bấm **Xem thêm** ở Tổng quan để chuyển sang **Phiên LIVE** và giữ nguyên bộ lọc.
- **Chọn ngày:** bấm lịch → chọn Từ ngày/Đến ngày → **Áp dụng**. Lịch sẽ tự đóng.

### 3. Gắn người cho phiên LIVE

Trong **Phiên LIVE**:

1. Chọn Host.
2. Chọn Livestream operator.
3. Bấm **Lưu**.
4. Reload lại trang vẫn phải giữ đúng người đã lưu.

Phiên LIVE tự đồng bộ mới luôn để Host/Operator **trống** để tránh tính nhầm KPI.

### 4. Campaign/Mega Live

Nếu một phiên kéo dài nhiều giờ và nhiều người thay ca:

1. Tích **Ngày Campaign/Mega Live · tính KPI thủ công**.
2. SellerKBB hiện thêm ô **Gắn thẻ loại phiên**.
3. Chọn **Ngày Campaign** hoặc **Mega Live**. Đây là lựa chọn bắt buộc trước khi lưu.
4. SellerKBB tự xóa lựa chọn Host/Operator tự động của phiên đó và **ẩn hẳn hai ô Host Livestream / Nhân viên vận hành** khỏi card phiên LIVE.
5. Bấm **Lưu**. Sau khi lưu, thẻ loại phiên sẽ hiển thị ngay trên phiên LIVE và trong tab KPI thủ công. Nếu bỏ tích KPI thủ công, hai ô Host/Vận hành sẽ hiện lại.
6. Phiên vẫn xuất hiện trong doanh thu/báo cáo nhưng **không cộng KPI tự động**.
7. Phiên được đưa vào tab **KPI thủ công** trong nhóm **Công cụ**.
8. Admin thêm những Host/Operator thực sự cần tính và nhập **GMV sau hoàn/hủy của từng Host**.
9. KPI Host tự tính = GMV Host × **0,3%**; KPI Vận hành đi cùng Host = GMV Host × **0,1%**.
10. SellerKBB không tự chia GMV tổng phiên cho các Host.

#### Cách nhập từng cặp Host / Vận hành

- Khi thêm người mới, SellerKBB mở đầy đủ ô **Host / Vận hành / GMV sau hoàn hủy của Host / KPI Host / KPI Vận hành**.
- Sau khi bấm **Lưu KPI thủ công**, cặp đã lưu được thu gọn thành một dòng chỉ còn tên **Host**, tên **Vận hành** và nút **Chi tiết**.
- Bấm **Chi tiết** để mở lại phần tính KPI và chỉnh sửa.
- Ô GMV chỉ chứa phần số; chữ **đ** được giữ cố định bên phải nên có thể đặt con trỏ/xóa số bình thường.
- Nút **Xóa người** nằm ở cuối phần Chi tiết của đúng cặp, tránh bấm nhầm khi đang nhập người mới.
- SellerKBB không yêu cầu nhập giờ riêng cho từng cặp nhân sự.

#### Kiểm soát GMV thủ công

SellerKBB so sánh **tổng GMV các Host đã nhập** với **GMV sau khi hoàn hủy đã chốt của cả phiên**:

- ✅ **Bằng nhau:** hợp lệ hoàn toàn.
- 🟡 **Nhỏ hơn:** vẫn cho lưu; hiển thị số GMV còn chưa phân bổ.
- 🔴 **Lớn hơn:** chặn lưu và hiển thị chính xác số tiền vượt.
- 🟣 **Phiên chưa có số chốt:** cho **Lưu nháp**; dữ liệu chưa cộng vào KPI đã chốt.

Khi một bản nháp sau đó có GMV sau khi hoàn hủy:
- nếu tổng Host ≤ số chốt → dữ liệu đủ điều kiện tính KPI;
- nếu tổng Host > số chốt → không cộng KPI và yêu cầu Admin chỉnh lại.

### 5. Xem KPI

#### Ba loại GMV cần phân biệt

| Tên trên SellerKBB | Ý nghĩa | Dùng tính KPI? |
|---|---|---|
| **GMV đã ghi nhận** | Số TikTok cập nhật mới nhất của đúng phiên LIVE. Sau khi LIVE kết thúc, nếu TikTok tiếp tục xác nhận dữ liệu của phiên thì số này vẫn được cập nhật. | Không dùng trực tiếp |
| **GMV chờ đối soát** | GMV tạm tính sau hủy/hoàn đã biết của **các đơn có tín hiệu LIVE**. Có thể thay đổi khi đơn giao, hủy hoặc hoàn tiền. | Có, nhưng chỉ là KPI tạm tính |
| **GMV sau khi hoàn hủy** | GMV cuối cùng của các đơn có tín hiệu LIVE sau khi trạng thái đơn/hậu mãi đã kết thúc. | Có, dùng chốt KPI |

Đơn **Khớp theo thời gian** chỉ dùng để đối chiếu và cảnh báo. Từ v1.37.0, giá trị của các đơn này **không được cộng vào KPI tự động**.

#### Ví dụ tính GMV

Một phiên có các đơn có tín hiệu LIVE:

```text
Đơn A: 40.000.000đ · hoàn tất                  → 40.000.000đ
Đơn B: 30.000.000đ · đã hủy                    →          0đ
Đơn C: 25.000.000đ · đã hoàn 10.000.000đ       → 15.000.000đ
Đơn D: 15.000.000đ · đang vận chuyển            → 15.000.000đ tạm tính
```

**GMV chờ đối soát = 40 + 0 + 15 + 15 = 70.000.000đ.**

Nếu sau đó Đơn D bị hủy thì số giảm còn **55.000.000đ**.  
Nếu Đơn D hoàn tất và không còn hậu mãi thì số cuối cùng là **70.000.000đ**.

#### KPI tự động

Chỉ áp dụng cho phiên **không tích Tính KPI thủ công**:

```text
Host KPI       = GMV đối soát có tín hiệu LIVE × 0,3%
Operator KPI   = GMV đối soát có tín hiệu LIVE × 0,1%
```

- **KPI tạm tính:** đã có GMV chờ đối soát nhưng còn đơn/hậu mãi chưa kết thúc.
- **KPI đã chốt:** đã có GMV sau khi hoàn hủy cuối cùng.
- **Chờ đối soát:** chưa đủ dữ liệu Orders/Return & Refund hoặc chưa có đơn đủ tín hiệu LIVE; hệ thống không dùng GMV đã ghi nhận để tính thay.
- **KPI dự kiến = KPI đã chốt + KPI tạm tính.**

#### Cách đọc 2 bảng KPI nhân sự

- **KPI chưa chốt:** dùng để theo dõi số còn biến động. Bảng này chỉ có **GMV chờ đối soát / KPI tạm tính / số phiên chờ đối soát**.
- **KPI đã chốt:** dùng để thanh toán. Bảng này tách **GMV tự động đã chốt / GMV thủ công / KPI tự động đã chốt / KPI thủ công / Tổng KPI đã chốt**.
- Nếu cùng một người vừa có phiên đã chốt vừa có phiên chưa chốt thì người đó sẽ xuất hiện ở **cả hai bảng**.

#### KPI thủ công

- Phiên đã tích **Tính KPI thủ công** không chạy KPI tự động.
- Chỉ GMV của **Host** được dùng làm phần phân bổ; Operator đi cùng Host dùng cùng nền GMV đó để tính 0,1%.
- KPI thủ công chỉ được cộng vào KPI đã chốt khi phiên có **GMV sau khi hoàn hủy** và tổng GMV Host không vượt số chốt.
- Bản nháp chưa có số chốt không được cộng vào KPI đã chốt.

### 6. Xuất file

Vào tab **Xuất file**. File xuất dùng đúng khoảng thời gian đang chọn. SellerKBB không đưa Session ID TikTok ra CSV.

### 7. Đối soát đơn theo từng phiên LIVE

Vào tab **Đối soát đơn LIVE**:

1. Chọn khoảng thời gian cần kiểm tra.
2. Chọn phiên LIVE và bấm **Xem đơn**.
3. SellerKBB mở một **popup riêng**; trên mobile popup chiếm toàn màn hình và khóa cuộn trang phía sau.
4. Nút **Xem đơn** của phiên đang mở sẽ tạm ẩn; dùng **Làm mới** trong popup nếu muốn lấy trạng thái mới nhất.
5. SellerKBB lấy các đơn được tạo trong đúng khung thời gian phiên đó.
6. Mỗi đơn được gắn thẻ rõ: **Chờ đóng hàng / Chờ vận chuyển / Đang vận chuyển / Đang giao / Đã giao / Hoàn tất / Đã hủy**; nếu có hậu mãi sẽ ưu tiên thẻ **Đang hoàn/trả / Đã hoàn tiền**.
7. Nếu đơn có tín hiệu liên kết LIVE từ dữ liệu đơn, hệ thống ghi **Có tín hiệu LIVE**.
8. Nếu chỉ khớp theo giờ tạo đơn, hệ thống ghi **Khớp theo thời gian** để tránh hiểu nhầm là đã xác minh tuyệt đối.
9. Dùng các thẻ trạng thái phía trên danh sách để lọc nhanh đơn cần kiểm tra.
10. Đóng popup bằng nút **×**; khi đóng, nút **Xem đơn** của phiên đó hiện lại.
11. Popup hiển thị riêng **GMV đã ghi nhận / GMV chờ đối soát / GMV sau khi hoàn hủy**.
12. Chỉ đơn **Có tín hiệu LIVE** mới được cộng vào GMV dùng KPI.
13. Đơn **Khớp theo thời gian** vẫn hiển thị để kiểm tra nhưng được ghi rõ **không tính KPI**.
14. Nếu thiếu quyền/dữ liệu Return & Refund, phiên chuyển sang **Chờ đối soát** và không lấy GMV đã ghi nhận để tính thay.
15. Phiên đã chốt/đối soát thành công được gắn thẻ xanh **✓ Đã đối soát** và dùng nền trung tính để dễ phân biệt với phiên còn xử lý.

> **Vì sao chưa chốt ngay sau khi giao?** Người mua vẫn có thể mở yêu cầu trả/hoàn sau khi đơn ở trạng thái Delivered. Với chính sách TikTok Shop Việt Nam hiện hành, cửa sổ này có thể tới 15 ngày với đa số nhóm hàng và 6 ngày với một số nhóm hàng. Vì vậy muốn gọi là “GMV đã chốt” phải dựa trên trạng thái đơn + hậu mãi, không chỉ dựa vào ngày LIVE.

### 8. Hồ sơ Google trên top bar

- SellerKBB dùng **ảnh đại diện Google/Gmail** của tài khoản đã đăng nhập.
- Ảnh được lưu cùng hồ sơ người dùng trong Firestore để Admin nhận diện tài khoản ở trang **Quản lý tài khoản**.
- Trên top bar chỉ hiển thị **avatar**, không hiển thị tên/vai trò và không có thanh phân cách.
- Bấm avatar để mở popup **ở chính giữa màn hình** với thông tin cơ bản: tên, Gmail, vai trò và trạng thái tài khoản.
- Popup có nút **Đăng xuất**; không có mũi tên hay biểu tượng cài đặt trên top bar.
- Nếu Google không có ảnh hoặc ảnh không tải được, SellerKBB dùng avatar chữ cái dự phòng.

---

## 🧾 Lịch sử thay đổi gần đây

README giữ lại phần này để nhân sự có thể biết **vì sao giao diện/cách tính hiện tại khác bản cũ**.

| Phiên bản | Thay đổi chính |
|---|---|
| **v1.43.0** | Phiên LIVE đã chốt trên Tổng quan/Phiên LIVE dùng **✓ xanh + nền/viền xanh nhẹ**, không còn nhìn như trạng thái hồng tạm tính. |
| **v1.42.0** | KPI thủ công thu gọn người đã lưu, sửa ô tiền với hậu tố **đ** cố định, bố trí lại nút xóa và thêm trạng thái xanh **Đã đối soát**. |
| **v1.41.0** | Tổng quan bổ sung thẻ full-width **GMV sau khi hoàn hủy** chỉ cộng các phiên đã chốt/đã đối soát. |
| **v1.40.0** | Khi bật KPI thủ công, ẩn hẳn Host/Vận hành tự động trên PC/mobile; bỏ tích thì hiện lại. |
| **v1.39.0** | Tách KPI nhân sự thành **KPI chưa chốt** và **KPI đã chốt** để không trộn số tạm tính với số dùng thanh toán. |
| **v1.38.0** | KPI thủ công bắt buộc gắn thẻ **Ngày Campaign** hoặc **Mega Live**; lưu cùng phiên, hiển thị lại sau reload và xuất CSV. |
| **v1.37.0** | Chuẩn hóa 3 loại GMV; loại đơn chỉ khớp thời gian khỏi KPI; thêm kiểm soát thiếu/vượt cho KPI thủ công và chế độ Lưu nháp. |
| **v1.36.1** | KPI tự động chuyển sang GMV đối soát; thêm lớp an toàn không chốt khi liên kết LIVE chưa chắc chắn. |
| **v1.36.0** | Tách KPI Đã chốt / Tạm tính / Chờ đối soát / Dự kiến; cron tự cập nhật KPI đối soát. |
| **v1.35.0** | Xem đơn bằng popup riêng; mobile full-screen; khóa cuộn nền để tránh vuốt nhầm sang phiên khác. |
| **v1.34.0** | Thiết kế lại giao diện đối soát, thêm thẻ trạng thái đơn và bảo vệ dữ liệu phiên LIVE tối thiểu 60 ngày. |
| **v1.33.0** | Thêm đối soát đơn theo từng phiên LIVE; làm rõ LIVE Analytics GMV là số gộp, không phải GMV sau hoàn/hủy. |
| **v1.32.0** | Hoàn thiện KPI thủ công theo tab riêng, avatar tài khoản trên top bar và các fix mobile/iPhone Safari chống tự zoom khi nhập liệu. |

> Từ các bản sau, mỗi lần thêm hoặc đổi nghiệp vụ phải cập nhật đồng thời **Cập nhật mới nhất**, **Hướng dẫn sử dụng hiện tại** và **Lịch sử thay đổi** trong README.

---

## 🏗️ SellerKBB hoạt động như thế nào?

```mermaid
flowchart LR
    TT[TikTok Shop Seller API] --> CF[Cloudflare Worker]
    CF --> WEB[SellerKBB Web]
    WEB --> FB[Firebase Auth + Firestore]
    GH[GitHub SRC] --> ACT[GitHub Actions]
    ACT --> CF
    ACT --> FB
    ACT --> REL[GitHub Releases - 5 bản gần nhất]
```

Hiểu đơn giản:

1. **TikTok** cung cấp dữ liệu LIVE.
2. **Cloudflare** lấy dữ liệu và chạy website.
3. **Firebase** giữ tài khoản/phân quyền/thông tin gắn Host-Operator.
4. **GitHub** giữ mã nguồn.
5. **GitHub Releases** là các điểm khôi phục SRC.

---

## 📁 Các file/thư mục quan trọng trong SRC

| Đường dẫn | Ý nghĩa |
|---|---|
| `public/index.html` | Giao diện web + phần lớn logic phía trình duyệt |
| `worker/api-template.js` | Backend Cloudflare, TikTok API, token, cron, maintenance |
| `firebase/firestore.rules` | Quyền đọc/ghi Firestore |
| `firebase/firestore.indexes.json` | Index Firestore |
| `.github/workflows/deploy.yml` | Test, deploy và tự tạo Release backup |
| `scripts/check.mjs` | Kiểm tra source trước deploy |
| `scripts/ui-browser-test.mjs` | Test thật bằng Chromium cho PC + mobile |
| `scripts/build-worker.mjs` | Ghép giao diện vào Worker để deploy |
| `wrangler.toml` | Cấu hình Cloudflare Worker/KV/Cron |
| `VERSION` | Version chuẩn của SellerKBB |
| `package.json` | Version + lệnh build/check |
| `.env.example` | Mẫu biến môi trường; không chứa secret thật |

### Không được đưa lên GitHub

- TikTok App Secret.
- TikTok Access Token / Refresh Token.
- Firebase Service Account JSON.
- Cloudflare API Token.
- Mật khẩu hoặc cookie đăng nhập.

---

## 🔐 Phân quyền tài khoản

### Admin

- Quản lý tài khoản.
- Chọn vai trò/quyền xem.
- Gắn Host/Operator.
- Bật Campaign/Mega thủ công.
- Xem TikTok/API.
- Xem Lưu trữ & tự dọn.

### Host Livestream / Livestream operator

- Chỉ xem phần được Admin cấp quyền.
- Không được thấy TikTok API/secret.

---

## 🔄 TikTok tự đồng bộ 24/24

Cloudflare Cron hiện dùng:

```text
0 * * * *    → mỗi giờ: kiểm tra token + đồng bộ LIVE gần đây + cập nhật KPI đối soát các phiên mới
15 3 * * *   → mỗi ngày: quét LIVE 30 ngày + tiếp tục đối soát các phiên chưa chốt trong vùng bảo vệ 60 ngày + dọn KV
```

Access Token có thể hết hạn nhanh. Backend dùng **Refresh Token** để xin Access Token mới trước khi hết hạn. Nếu TikTok thu hồi quyền hoặc Refresh Token hết hiệu lực thì mới phải cấp quyền lại.

---

## 💾 Lưu trữ & tự dọn

Trang Admin **Lưu trữ & tự dọn** hiển thị:

- **GitHub:** dung lượng repository so với ngưỡng khuyến nghị.
- **Firebase:** ước tính dữ liệu SellerKBB trong Firestore.
- **Cloudflare:** dung lượng Workers KV đo được.
- % sử dụng và thanh tiến trình.
- Số phiên LIVE đang quản lý.
- Mức áp lực dọn dữ liệu.
- Số key KV và lần kiểm tra gần nhất.

Giới hạn giữ dữ liệu báo cáo tối đa **180 ngày** và tối thiểu **60 ngày**.

> **Bảo vệ đối soát:** SellerKBB không tự xóa phiên LIVE trong 60 ngày gần nhất, kể cả khi Firestore chạm ngưỡng dọn khẩn cấp. Mốc 60 ngày là vùng đệm vận hành để không làm mất phiên trước khi vòng đời giao hàng + hậu mãi kết thúc. Cache kết quả đối soát 10 phút trong Cloudflare KV có thể hết hạn vì có thể tải lại từ TikTok.

> SellerKBB không tự xóa SRC GitHub, tài khoản người dùng hoặc TikTok token được bảo vệ.

---

## 📦 Release backup tự động — chỉ giữ 5 bản gần nhất

Từ **v1.10.0**, sau khi source qua kiểm tra thành công, GitHub Actions tự:

1. Kiểm tra `VERSION`, `package.json`, `wrangler.toml` và version giao diện phải khớp nhau.
2. Chạy kiểm tra source.
3. Chạy Chromium smoke test cho **PC + mobile**.
4. Build Worker.
5. Deploy Cloudflare/Firebase nếu GitHub Secrets đã được cấu hình.
6. Tạo/cập nhật Release `vX.Y.Z`.
7. Đính kèm `sellerkbb-vX.Y.Z-src.zip`.
8. Giữ đúng **5 Release mới nhất tính cả bản vừa tạo**.
9. Tự xóa Release/tag từ bản thứ 6 trở về trước.

### Release backup được những gì?

✅ Mã nguồn/SRC đúng của phiên bản đó.

✅ Workflow, Firebase rules, giao diện, backend, test.

✅ Có thể dùng để quay lại bản web cũ.

### Release KHÔNG backup những gì?

❌ Dữ liệu Firestore đang chạy.

❌ Dữ liệu Cloudflare KV thực tế.

❌ TikTok token.

❌ Firebase/Cloudflare secret.

> Vì vậy “khôi phục Release” nghĩa là **khôi phục phiên bản phần mềm**, không phải phục hồi dữ liệu nghiệp vụ đã bị xóa.

---

## ⏪ Cách quay lại bản cũ nếu bản mới bị lỗi

### Cách dễ nhất khi bạn dùng AI

1. Mở: https://github.com/hunghienhoa/sellerkbb/releases
2. Chọn một trong **5 Release gần nhất** mà bạn biết đang chạy tốt.
3. Copy link Release.
4. Gửi cho AI câu này:

> Khôi phục SellerKBB về đúng Release này: [DÁN LINK]. Không làm mất dữ liệu Firebase/TikTok. Sau khi khôi phục hãy chạy test PC/mobile, deploy Cloudflare rồi xác nhận version đang chạy.

AI có thể đọc tag/Release và đưa branch `main` trở lại source tương ứng.

### Nếu chỉ muốn tải bản backup về máy

Trong Release → **Assets** → tải:

```text
sellerkbb-vX.Y.Z-src.zip
```

Giữ file ZIP đó ở máy nếu muốn có thêm một bản backup cá nhân.

---

## 🚀 Quy trình cập nhật một phiên bản an toàn

Mỗi lần nhờ AI sửa, nên yêu cầu đúng quy trình:

1. Đọc source hiện tại từ GitHub.
2. Chỉ sửa đúng yêu cầu.
3. Không ghi secret vào source.
4. Bump version.
5. Chạy `npm run check`.
6. Chạy Chromium test PC/mobile.
7. Chỉ deploy khi test PASS.
8. Kiểm tra Worker sau deploy.
9. GitHub Actions tự tạo Release backup.
10. Đảm bảo danh sách Releases chỉ còn 5 bản gần nhất.

### Mẫu câu bạn có thể gửi cho AI

> Hãy sửa SellerKBB theo yêu cầu dưới đây. Đọc source hiện tại trên GitHub trước khi sửa. Sau khi sửa phải test PC và mobile, không deploy nếu test fail. Không làm mất dữ liệu Firebase/Cloudflare/TikTok. Bump version, deploy bản đã test và kiểm tra Release backup tự động chỉ giữ 5 bản gần nhất.

---

## 🧪 Kiểm tra source

Các lệnh dành cho AI/developer:

```bash
npm run check
npm install --no-save puppeteer-core
node scripts/ui-browser-test.mjs
npm run build
```

File Worker sau build:

```text
dist/worker.mjs
```

Không commit `dist/` nếu workflow đang tự build.

---

## 🔥 Cấu hình Firebase lần đầu

1. Tạo Firebase Project.
2. Bật **Authentication → Google**.
3. Tạo **Firestore Database**.
4. Tạo **Web App** và lấy các giá trị:

```text
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_STORAGE_BUCKET
FIREBASE_MESSAGING_SENDER_ID
FIREBASE_APP_ID
```

5. Thêm domain Worker vào **Authorized domains** của Firebase Auth.
6. Deploy `firebase/firestore.rules` và `firebase/firestore.indexes.json`.

### GitHub Actions Secrets cho Firebase

```text
FIREBASE_SERVICE_ACCOUNT
FIREBASE_PROJECT_ID
```

`FIREBASE_SERVICE_ACCOUNT` phải để ở GitHub Secrets, tuyệt đối không commit vào repo.

---

## ☁️ Cấu hình Cloudflare lần đầu

Worker cần:

- KV binding tên **`TIKTOK_KV`**.
- Cron hourly + daily reconciliation.
- Các Firebase vars.
- TikTok vars/secrets.

### GitHub Actions Secrets cho Cloudflare

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

Nếu 2 secret này chưa có, GitHub Actions vẫn chạy test/build nhưng sẽ bỏ qua bước deploy Cloudflare.

---

## 🎵 Cấu hình TikTok Shop API

Các thông tin cần có:

```text
TIKTOK_APP_KEY
TIKTOK_APP_SECRET      ← SECRET, không đưa lên GitHub
TIKTOK_SERVICE_ID
TIKTOK_SELLER_AUTH_URL
```

Redirect URL:

```text
https://<worker-domain>/api/tiktok/oauth/callback
```

Quyền tối thiểu phải phù hợp với TikTok Shop Analytics/LIVE API đang dùng. Khi TikTok thay API/scope, cần kiểm tra tài liệu Partner Center hiện hành trước khi đổi.

---

## 🛠️ Khi có lỗi, kiểm tra theo thứ tự này

### Web mở được nhưng không có dữ liệu TikTok

1. Vào Admin → **TikTok / API**.
2. Xem trạng thái kết nối.
3. Kiểm tra lần đồng bộ gần nhất.
4. Nếu Refresh Token mất hiệu lực thì cấp quyền TikTok lại.

### Đăng nhập Google lỗi

1. Kiểm tra Firebase Authentication đã bật Google.
2. Kiểm tra domain Worker đã nằm trong Authorized domains.
3. Kiểm tra Firebase web config.

### Lưu Host/Operator rồi reload bị mất

- Không sửa Firestore rules thủ công.
- Chạy browser test desktop/mobile.
- Kiểm tra đúng Admin đang đăng nhập và Firestore write không bị từ chối.

### Bản mới lỗi giao diện

- Không sửa chồng thêm khi chưa rõ nguyên nhân.
- Vào **Releases** và quay lại một bản đã chạy tốt.

---

## 🛡️ Nguyên tắc an toàn của dự án

- **GitHub `main` là nguồn SRC chính.**
- Không xóa repo để “dọn dung lượng”.
- Không đưa secret/token vào commit, README, issue hay ảnh chụp.
- Không tự chia GMV Campaign/Mega theo thời gian nếu không có GMV từng ca.
- Không hiển thị TikTok LIVE Session ID ra giao diện/CSV.
- Khi sửa chức năng lưu dữ liệu phải test cả desktop và mobile.
- Bản mới chỉ được coi là hoàn thành khi source check + browser smoke test PASS.

---

## 📌 Version

Version phải đồng bộ ở:

```text
VERSION
package.json
wrangler.toml
public/index.html
```

Workflow Release sẽ tự chặn nếu các version này không khớp.

---

<div align="center">

**SellerKBB · quản lý bằng GitHub + Cloudflare + Firebase + TikTok Shop API**

Khi không chắc phải sửa gì, hãy giữ nguyên Release gần nhất đang chạy tốt và nhờ AI kiểm tra trước.

</div>
