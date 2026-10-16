# 🎯 BOS Quiz — quiz realtime kiểu Kahoot, nhiều theme

Web app quiz realtime theo luật chơi Kahoot: **trang quản trị** (tạo/sửa/xoá quiz, chọn theme), **màn chiếu** (3D + QR + bảng xếp hạng) và **điện thoại người chơi**.
Chạy hoàn toàn tĩnh (Vercel/GitHub Pages, không cần build); realtime + lưu quiz dùng **Supabase** (gói Free là đủ cho ~80 người).

| Trang | Ai dùng | Nội dung |
|---|---|---|
| `/` (`index.html`) | Quản trò | Nhập mã `BOS-HOST` → **thư viện quiz**: tạo mới, sửa, nhân bản, xoá, **▶ Play**. Bấm "I'm a player — skip" → vào màn người chơi |
| `host.html?quiz=<id>` | Màn chiếu | Mở bằng nút ▶ Play: QR + PIN, sảnh chờ, intro, câu hỏi, hiệu ứng đúng/sai, scoreboard, podium |
| `play.html?room=PIN` | Người chơi | Quét QR → nhập tên + chọn avatar → chơi. Giao diện tự đổi theo theme của quiz |
| `control.html` | Quản trò (tuỳ chọn) | Remote trên điện thoại: Next/Skip/Restart/Exit + sửa câu hỏi của quiz đang chiếu |

---

## 1. Supabase — chạy 3 file SQL (mỗi file 1 lần)

Dashboard → **SQL Editor** → **New query** → dán toàn bộ file → **Run**:

1. `supabase/setup.sql` — mã quản trò (đã chạy từ trước thì bỏ qua).
2. `supabase/media-setup.sql` — kho ảnh/GIF/video cho câu hỏi (đã chạy thì bỏ qua).
3. **`supabase/quizzes.sql` — MỚI**: bảng lưu nhiều quiz + các hàm thêm/sửa/xoá có kiểm tra mã. Quiz bạn đã soạn trước đây được **tự chép sang** thành 1 quiz theme Halloween.

Realtime → Settings: để **Allow public access = ON**. Gói Free bị *Paused* sau 7 ngày không dùng → trước buổi chơi mở dashboard, nếu Paused thì **Restore**.
Mã `BOS-HOST` chỉ nằm trong database. Đổi mã: sửa `'BOS-HOST'` trong cả 3 file SQL rồi Run lại.
Tập dượt không cần mạng: thêm `?local` vào link (`/?local`) → mọi thứ lưu trong trình duyệt, người chơi là các tab cùng máy.

## 2. Deploy

Push toàn bộ thư mục lên GitHub (kéo thả "uploading an existing file" cũng được) → Vercel tự deploy (Framework: Other, không Build Command).
**Giữ nguyên `js/config.js` của bạn** (có Supabase URL + key).

## 3. Trang quản trị (giống Kahoot)

- **Thư viện quiz**: mỗi quiz là 1 thẻ có ảnh hub của theme, tên, số câu, lần sửa cuối.
  **▶ Play** = mở màn chiếu với PIN + QR mới · **✏️** sửa · **⧉** nhân bản · **🗑** xoá (có hỏi lại).
- **＋ Create quiz** → *Studio*:
  1. **🎨 Theme** — hub 3D xoay, **vuốt trái/phải** (hoặc ‹ ›, phím ←/→, hay bấm tên theme) để đổi theme; chọn **bảng màu**; sửa **Title** (chữ to trên màn chiếu + QR) và **Subtitle**. Mỗi theme có font riêng, xem trước ngay trên hub.
  2. **❓ Questions** — thêm / nhân bản / xoá / đổi thứ tự câu, không giới hạn số câu (tối đa 200). Mỗi câu: đáp án đúng (ô xanh) + 3 sai, countdown riêng (mặc định 20s), ảnh/GIF/video tuỳ chọn. Câu chưa điền đủ vẫn lưu được, chỉ bị bỏ qua khi chơi.
  3. **💾 Save** hoặc **▶ Play** (tự lưu rồi mở màn chiếu).
- Trên màn chiếu vẫn có nút 📝 để sửa nhanh câu hỏi của quiz đang chiếu, và nút **← Library** để quay lại thư viện.

## 4. Các theme

| Theme | Font | Hub (sảnh chờ) | Đúng (≥50% đúng / mình đúng) | Sai |
|---|---|---|---|---|
| **Classic** (mặc định) | Baloo 2 + Be Vietnam Pro | Đảo cỏ, tượng & cột đá | 🎉 Pháo giấy + lấp lánh, hub nhảy xoay | 🌧️ Mây mưa, đèn tối, avatar ủ rũ |
| **Summer** | Pacifico + Nunito | Nhà gỗ trên bãi biển, **biển vô tận** (đế dày đã ẩn xuống nước) | ☀️ Mặt trời toả nắng + bóng biển nảy | 🌊 Con sóng lớn ập qua màn hình, avatar ướt sũng |
| **Halloween** | Creepster + Fredoka | Nhà ma — **giữ nguyên trải nghiệm cũ**: intro sấm sét, cổng lâu đài, hành lang ma, con ma hù / khiên phép, nhạc Halloween | Ma bị thế lực bí ẩn chặn | Ma hù BOO! |
| **Lunar New Year** | Playfair Display + Be Vietnam Pro | Đảo bay giữa mây, rồng, đèn lồng bay (đã ẩn chữ "2024" cũ của model) | 🎆 Pháo hoa + mưa lì xì & đồng vàng | 🧨 Pháo xịt "pfft…" khói xám |

- Mỗi theme 3–4 bảng màu. Ô đáp án giữ 4 màu chuẩn Kahoot (đỏ/tím/vàng/xanh) để người chơi quen tay.
- Chữ chung cho mọi theme: sảnh chờ "**Waiting for players…**". Logo giữa mã QR = mascot **đầu bếp** (Kamereo).
- Điện thoại: Halloween vẫn có hành lang 3D; theme khác dùng cảnh 2D nhẹ (ảnh hub + avatar của chính mình + hiệu ứng đúng/sai giống màn chiếu), nhanh trên máy yếu.
- **Nhạc**: hiện chỉ Halloween có nhạc (sảnh chờ / trong game — bắt đầu sau cánh cửa lâu đài / top 3). Theme khác tạm im lặng; gửi mp3 thì gắn vào `music` của theme trong `js/themes.js`.

## 5. Cách chơi (màn chiếu)

1. Bấm **▶ Play** ở thư viện → màn chiếu hiện QR + PIN. **⛶** (phím `F`) fullscreen, click 1 lần để bật âm thanh.
2. Người chơi quét QR (link đã kèm theme) → nhập tên → chọn avatar. PIN sai / phòng không tồn tại → báo lỗi, bắt nhập lại. Click tên trên sảnh để kick.
3. **Start the game** → intro (Halloween: lâu đài; theme khác: camera bay xuống hub + pháo giấy) → mỗi câu:
   câu hỏi (+ảnh/video) hiện trước 3–5 giây → 4 đáp án + countdown → chốt: **≥50% đúng** → hiệu ứng "đúng", ngược lại → hiệu ứng "sai"; banner "XX% of players got it right!" / câu theo theme.
4. **Scoreboard**: biểu đồ 4 cột (số người & % mỗi đáp án) + top 5 + người đúng nhanh nhất → câu tiếp → **podium Top 3**.
5. Nút góc: ⟲ Restart · ✕ Exit · ← Library (ở sảnh). Phím: `Space`/`Enter`/`→` = Next · `F` fullscreen · `M` tắt tiếng.

**Tính điểm (giống Kahoot):** đúng = `1000 × (1 − thời_gian/countdown/2)`; sai/không trả lời = 0.
Tập dượt đông người: thêm `&bots=70` vào link màn chiếu.

## 6. Kiến trúc & hiệu năng

- Host là trọng tài; điện thoại chỉ gửi `join`/`ans` (qua REST, không nhân bản tới 79 máy). Heartbeat 3s mang theo phase + theme để máy rớt mạng tự đồng bộ.
- Quiz chỉ đọc/ghi qua hàm có mã → người chơi không thể xem trước đáp án.
- Hub 3D đã tối ưu (gộp mesh, texture WebP): Classic 0.2 MB, Summer 0.9 MB, Lunar 1.1 MB. Điện thoại theme mới chỉ tải ảnh hub ~50 KB.

## Cấu trúc

```
index.html (quản trị)  host.html (màn chiếu)  play.html (người chơi)  control.html (remote)
css/   common.css admin.css host.css play.css control.css
js/    themes.js (4 theme, font, bảng màu, chữ) · admin.js (thư viện + studio) · editor.js · quizstore.js
       host.js · play.js · hubstage.js (hub 3D) · stage3d.js (Halloween) · fx.js (hiệu ứng 2D) · music.js · media.js · net.js · config.js
assets/hubs/   default.glb summer.glb lunar.glb + ảnh preview *.webp
assets/models/ halloween.glb hallway(.lite).glb door.glb ghost.glb · music/ · avatars/
supabase/      setup.sql · media-setup.sql · quizzes.sql
```

Credits: model 3D & âm thanh do bạn cung cấp — kiểm tra license từng file trước khi public.
