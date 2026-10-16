# 🎯 BOS Quiz — quiz realtime kiểu Kahoot, nhiều theme

Web app quiz realtime theo luật chơi Kahoot: **trang quản trị** (tạo/sửa/xoá quiz, chọn theme), **màn chiếu** (3D + QR + bảng xếp hạng) và **điện thoại người chơi**.
Chạy hoàn toàn tĩnh (Vercel/GitHub Pages, không cần build); realtime + lưu quiz dùng **Supabase** (gói Free là đủ cho ~80 người).

| Trang | Ai dùng | Nội dung |
|---|---|---|
| `/` (`index.html`) | Quản trò | Nhập mã `BOS-HOST` → **thư viện quiz**: sort, demo, tạo mới, sửa, nhân bản, xoá, **▶ Play**. Bấm "I'm a player — skip" → vào màn người chơi |
| `host.html?quiz=<id>` | Màn chiếu | Mở bằng nút ▶ Play: QR + PIN, sảnh chờ, intro, câu hỏi, hiệu ứng đúng/sai, scoreboard, podium |
| `play.html?room=PIN` | Người chơi | Quét QR → nhập tên + chọn avatar → chơi. Giao diện tự đổi theo theme của quiz |
| `control.html` | Quản trò (tuỳ chọn) | Remote trên điện thoại: Next/Skip/Restart/Exit + sửa câu hỏi của quiz đang chiếu |

---

## 1. Supabase — chạy 3 file SQL (mỗi file 1 lần)

Dashboard → **SQL Editor** → **New query** → dán toàn bộ file → **Run**:

1. `supabase/setup.sql` — mã quản trò (đã chạy từ trước thì bỏ qua).
2. `supabase/media-setup.sql` — kho ảnh/GIF/video cho câu hỏi (đã chạy thì bỏ qua).
3. **`supabase/quizzes.sql`**: bảng lưu nhiều quiz + các hàm thêm/sửa/xoá có kiểm tra mã. Quiz bạn đã soạn trước đây được **tự chép sang** thành 1 quiz theme Halloween.
   **Bản v9: chạy lại file này 1 lần** (an toàn, không mất dữ liệu) — nó thêm cột `settings` để lưu **nhạc nền** của từng quiz.

Realtime → Settings: để **Allow public access = ON**. Gói Free bị *Paused* sau 7 ngày không dùng → trước buổi chơi mở dashboard, nếu Paused thì **Restore**.
Mã `BOS-HOST` chỉ nằm trong database. Đổi mã: sửa `'BOS-HOST'` trong cả 3 file SQL rồi Run lại.
Tập dượt không cần mạng: thêm `?local` vào link (`/?local`) → mọi thứ lưu trong trình duyệt, người chơi là các tab cùng máy.

## 2. Deploy

Push toàn bộ thư mục lên GitHub (kéo thả "uploading an existing file" cũng được) → Vercel tự deploy (Framework: Other, không Build Command).
**Giữ nguyên `js/config.js` của bạn** (có Supabase URL + key).

## 3. Trang quản trị (giống Kahoot)

- **Thư viện quiz**: mỗi quiz là 1 thẻ có ảnh hub của theme, tên, số câu, lần sửa cuối.
  **Sort**: *Last edited* · *Date created* · *A–Z* (bấm lần nữa để đảo chiều; nhớ lựa chọn).
  **▶ Play** = mở màn chiếu với PIN + QR mới · **👁** xem demo (màn chiếu + điện thoại tự chạy qua các câu) · **✏️** sửa · **⧉** nhân bản · **🗑** xoá (có hỏi lại).
- **＋ Create quiz** → *Studio*:
  1. **🎨 Theme** — hub 3D xoay, **vuốt trái/phải** (hoặc ‹ ›, phím ←/→, hay bấm tên theme) để đổi theme; chọn **1 trong 4 màu** (Purple, Sky Blue, Forest, Ruby Red — dùng được cho mọi theme, đổi theme vẫn giữ màu đã chọn); góc trên trái luôn ghi **"3 / 7 themes · tên theme"** (trên điện thoại có thêm chấm ● ○ ○) để biết đang ở theme thứ mấy; sửa **Title** và **Subtitle**; chọn **nhạc nền** (▶ nghe thử). Font do theme quyết định.
  2. **❓ Questions** — bên trái soạn câu, bên phải là **Live preview**: màn chiếu + điện thoại hiện đúng câu đang chọn theo theme/màu/font (bấm *Question · Answers · ✓ Right · ✗ Wrong* hoặc **▶ Play** để xem chạy thử cả hiệu ứng).
     Mỗi câu có **2–4 đáp án** (＋ Add answer / ✕ xoá bớt), bấm **✓** cạnh đáp án đúng; countdown riêng (gõ số giây, mặc định 20s; "Apply to all" cho mọi câu); ảnh/GIF/video tuỳ chọn. Thêm / nhân bản / xoá / đổi thứ tự câu (tối đa 200). Câu chưa điền đủ vẫn lưu được, chỉ bị bỏ qua khi chơi.
  3. **💾 Save** hoặc **▶ Play** (tự lưu rồi mở màn chiếu).
- Trên màn chiếu, **☰ Menu** (góc dưới trái) có: 📝 sửa nhanh câu hỏi · ⟲ chơi lại từ câu 1 · ✕ kết thúc về sảnh · ← về thư viện.
- Mã quản trò khi nhập được che thành `••••••` (bấm 👁 để xem lại).

## 4. Các theme

| Theme | Font | Hub (sảnh chờ) | Đúng (≥50% đúng / mình đúng) | Sai | Nhạc mặc định |
|---|---|---|---|---|---|
| **Classic** (mặc định) | Baloo 2 + Be Vietnam Pro | Đảo cỏ, tượng & cột đá | 🎉 Pháo giấy + lấp lánh, hub nhảy xoay | 🌧️ Mây mưa, đèn tối, avatar ủ rũ | Go to the Picnic |
| **Summer** | Pacifico + Nunito | Nhà gỗ trên bãi biển, biển vô tận | ☀️ Mặt trời toả nắng + bóng biển nảy | 🌊 Con sóng lớn ập qua màn hình | 64 Sundays |
| **Halloween** | Creepster + Fredoka | Nhà ma — **giữ nguyên trải nghiệm cũ** (intro sấm sét, hành lang ma, ma hù / khiên phép) | Ma bị thế lực bí ẩn chặn | Ma hù BOO! | 3 bài Halloween cũ |
| **Happy New Year** | Lobster + Be Vietnam Pro | Đảo hoa đào bay giữa mây, cánh hoa rơi, đèn lồng | 🎆 Show pháo hoa (hoa cúc, dải vàng, vòng) + lì xì, đồng vàng, hoa mai/đào rơi | 🧨 Pháo xịt "pfft…" | Silly Intro |
| **Merry Christmas** *(mới)* | Dancing Script + Be Vietnam Pro | Cây thông + quà nhảy nhót + **tuần lộc** (có animation đứng/ăn cỏ), tuyết rơi, đèn nhấp nháy | 🎁 Hộp quà rơi xuống bật nắp tung giấy màu + Santa bay ngang trời | ❄️ Ném tuyết "bộp" vào màn hình + bão tuyết, đèn cây tắt | Deck the Halls |
| **Mid-Autumn** *(mới)* | Grandstander + Be Vietnam Pro | Thế giới bánh trung thu bay giữa mây đêm, **trăng tròn** sáng, sao, **đèn lồng thả bay** khắp trời | 🏮 Đèn lồng bay lên rực rỡ, trăng sáng hơn | 🌑 Mây đen che trăng, đèn lồng tắt rơi xuống | 64 Sundays |
| **Japanese Restaurant** *(mới)* | M PLUS Rounded 1c + Be Vietnam Pro | Quán izakaya, dây **lồng đèn giấy** quanh quán, hoa anh đào rơi | 🍣 Mưa sushi + chữ "OISHII!" | 🥵 Wasabi cay xanh màn hình + khói + chữ "WASABI!" | Go to the Picnic |

- **Intro Christmas**: camera bay từ trời xuống, **ông già Noel cưỡi xe tuần lộc bay vòng quanh cây thông** rồi vút lên trời (ở sảnh chờ thỉnh thoảng Santa cũng bay ngang). Các theme khác có pháo hoa / đèn lồng / sushi khi intro.

- **Nhạc nền**: mỗi quiz chọn 1 bài, phát **xuyên suốt** từ sảnh chờ → câu hỏi → podium, không bị ngắt (Halloween vẫn là bộ 3 bài theo cảnh). Có lựa chọn *No music*. Chỉ màn chiếu phát nhạc, điện thoại im lặng.
- Ô đáp án giữ 4 màu chuẩn Kahoot (đỏ/tím/vàng/xanh). Logo giữa QR = mascot **đầu bếp**.
- **Màn chiếu**: khi hiện câu hỏi / đáp án / kết quả, hub 3D tự dịch vào khoảng trống giữa khung câu hỏi và các ô đáp án → mascot và hiệu ứng đúng/sai luôn nhìn thấy, không bị che.
- **Điện thoại** (mọi theme trừ Halloween): hub **3D thật** giống màn chiếu. Vừa bấm *Join* → camera **xoay xoắn ốc + zoom** từ trên trời vào hub; mỗi câu mới camera lượn quanh hub; đúng thì hub nhảy xoay, sai thì hub rung + tối đèn. Câu thoại ("Nailed it!", "So close…") nằm **ngay dưới avatar**, không còn bong bóng. Máy không chạy được 3D tự dùng ảnh hub (zoom + xoay nhẹ).

## 5. Cách chơi (màn chiếu)

1. Bấm **▶ Play** ở thư viện → màn chiếu hiện QR + PIN. **⛶** (phím `F`) fullscreen, click 1 lần để bật âm thanh.
2. Người chơi quét QR (link đã kèm theme) → nhập tên → chọn avatar. PIN sai / phòng không tồn tại → báo lỗi, bắt nhập lại. Click tên trên sảnh để kick.
3. **Start the game** → intro (Halloween: lâu đài; theme khác: camera bay xuống hub + pháo giấy) → mỗi câu:
   câu hỏi (+ảnh/video) hiện trước 3–5 giây → 2–4 đáp án + countdown → chốt: **≥50% đúng** → hiệu ứng "đúng", ngược lại → hiệu ứng "sai"; banner "XX% of players got it right!" / câu theo theme.
4. **Scoreboard**: biểu đồ cột theo số đáp án (số người & % mỗi đáp án) + top 5 + người đúng nhanh nhất → câu tiếp → **podium Top 3**.
5. **Auto-play** (công tắc cạnh nút *Start the game*, mặc định BẬT): sau khi chốt đáp án, **7 giây** tự sang Scoreboard, **8 giây** tự sang câu kế tiếp, hết câu tự ra podium — quản trò không cần bấm gì. Nút lớn góc phải hiện đếm ngược (thanh chạy + "4s"); bấm nút đó để đi nhanh hơn, bấm viên **Auto-play** bên cạnh (phím `A`) để chuyển sang *Manual* (tự bấm Next từng bước).
6. Màn chiếu chỉ còn: **nút lớn** (góc phải) + **Auto-play**, và góc trái **⛶ · 🔊 · ☰ Menu**. Phím: `Space`/`Enter`/`→` = Next · `A` auto-play · `F` fullscreen · `M` tắt tiếng.

**Tính điểm (giống Kahoot):** đúng = `1000 × (1 − thời_gian/countdown/2)`; sai/không trả lời = 0.
Tập dượt đông người: thêm `&bots=70` vào link màn chiếu.

## 6. Kiến trúc & hiệu năng

- Host là trọng tài; điện thoại chỉ gửi `join`/`ans` (qua REST, không nhân bản tới 79 máy). Heartbeat 3s mang theo phase + theme để máy rớt mạng tự đồng bộ.
- Quiz chỉ đọc/ghi qua hàm có mã → người chơi không thể xem trước đáp án.
- Hub 3D đã tối ưu (gộp mesh, giảm tam giác, nén meshopt, texture WebP): Classic 0.2 MB, Summer 0.9 MB, New Year 0.14 MB, Christmas 0.14 MB (+ tuần lộc 0.1, Santa 0.17), Mid-Autumn 0.4 MB (từ 18 MB), Japanese 0.4 MB (từ 6 MB). Điện thoại tải hub trong lúc người chơi gõ tên; khi đang trả lời, cảnh 3D đứng yên để đỡ tốn pin.

## Cấu trúc

```
index.html (quản trị)  host.html (màn chiếu)  play.html (người chơi)  control.html (remote)
css/   common.css admin.css host.css play.css control.css
js/    themes.js (7 theme, 4 màu, nhạc, chữ) · hubdeco.js (tuyết, cánh hoa, trăng, đèn lồng, tuần lộc, Santa) · admin.js (thư viện + studio) · demo.js (live preview) · editor.js · quizstore.js
       host.js · play.js · hubstage.js (hub 3D) · stage3d.js (Halloween) · fx.js (hiệu ứng 2D) · music.js · media.js · net.js · config.js
assets/hubs/   default summer newyear christmas midautumn japan (.glb) + ảnh preview *.webp
assets/models/ deer.glb santa.glb lantern.glb (+ Halloween)
assets/models/ halloween.glb hallway(.lite).glb door.glb ghost.glb · avatars/
assets/music/  picnic.mp3 sundays.mp3 deckhalls.mp3 silly.mp3 (+ waiting/ingame/winner.mp3 của Halloween)
supabase/      setup.sql · media-setup.sql · quizzes.sql
```

Credits: model 3D & nhạc do bạn cung cấp (Loyalty Freak Music, Twin Musicom, Alex-Productions, Alexander Nakarada…) — kiểm tra license / ghi credit từng file trước khi public.
