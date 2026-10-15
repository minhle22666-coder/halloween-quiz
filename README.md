# 🎃 Haunted Quiz — Halloween quiz kiểu Kahoot

Web app quiz realtime theo luật chơi Kahoot: màn hình **HOST** (máy chiếu, có cảnh 3D + mascot + nhạc nền) và màn hình **PLAYER** (điện thoại, có hành lang 3D bản nhẹ, mascot = avatar của người chơi).
Chạy hoàn toàn tĩnh (deploy **Vercel** hoặc GitHub Pages, không cần build); phần realtime dùng **Supabase Realtime (Broadcast)** — miễn phí.

| Trang | Ai dùng | Nội dung |
|---|---|---|
| `/` (`index.html`) | Người dẫn (máy chiếu) | Vào là thấy ngay 3D + QR + mã PIN, sảnh chờ, intro lâu đài → hành lang ma, câu hỏi, mascot, bảng xếp hạng, podium |
| `play.html?room=PIN` | Người chơi (điện thoại) | Nhập tên + chọn avatar, bấm đáp án, xem đúng/sai + hạng của mình, nút Leave |
| `host.html` | — | Link cũ, tự chuyển về `index.html` |

---

## 1. Supabase (đã điền key sẵn trong `js/config.js`)

Project: `https://elierbdgpqqjxgngvxqo.supabase.co` · key `sb_publishable_...` (key công khai, để trong code là bình thường).

**Bắt buộc làm 1 lần — tạo bảng lưu câu hỏi + mã quản trò:**
1. Vào <https://supabase.com/dashboard> → mở project → menu trái **SQL Editor** → **New query**.
2. Mở file `supabase/setup.sql` trong repo, copy **toàn bộ** nội dung, dán vào → bấm **Run** (góc dưới phải).
   Thấy "Success" + 1 bảng kết quả trống là xong.
3. **Realtime → Settings**: để **Allow public access = ON** (mặc định), KHÔNG bật "Private channels only".
4. **(Mới — để gắn ảnh/GIF/video vào câu hỏi)**: New query → copy toàn bộ `supabase/media-setup.sql` → **Run**. Thấy 1 dòng `quiz-media | true | 5242880` là xong.
   Chưa chạy file này thì vẫn chơi bình thường, chỉ là nút upload báo lỗi (vẫn dán link ảnh được).

> Mã quản trò `BOS-HOST` nằm trong database (file SQL), không nằm trong code web → người chơi xem code cũng không thấy.
> Đổi mã: sửa chữ `'BOS-HOST'` ở **cả 2 chỗ** trong `supabase/setup.sql` rồi Run lại.
> Gói Free bị *Paused* sau 7 ngày không dùng → trước buổi chơi mở dashboard, nếu Paused thì bấm **Restore**.

Muốn tập dượt không cần mạng: thêm `?local` vào link (vd. `/?local`) → host + người chơi là các tab trong cùng 1 trình duyệt.

## 2. Đưa lên GitHub → deploy Vercel

### 2a. Push code lên GitHub
Cách dễ nhất (không cần gõ lệnh): GitHub → **New repository** `halloween-quiz` (Public hoặc Private đều được với Vercel) → **uploading an existing file** → kéo **toàn bộ nội dung** thư mục `halloween-quiz` vào → **Commit changes**.

Hoặc bằng git:
```bash
cd halloween-quiz
git init && git add . && git commit -m "Haunted Quiz"
git branch -M main
git remote add origin https://github.com/<tên-bạn>/halloween-quiz.git
git push -u origin main
```

### 2b. Deploy trên Vercel
1. Vào <https://vercel.com> → **Sign up / Log in with GitHub**.
2. **Add New… → Project** → chọn repo `halloween-quiz` → **Import** (lần đầu bấm *Adjust GitHub App Permissions* để cho Vercel thấy repo).
3. Màn hình cấu hình:
   - **Framework Preset: Other**
   - **Root Directory: `./`**
   - **Build Command**: để trống (tắt Override) · **Output Directory**: để trống / `.`
   - Không cần Environment Variables.
4. Bấm **Deploy** → ~30 giây có link `https://halloween-quiz-xxxx.vercel.app`.
   Đổi tên đẹp hơn: **Project → Settings → Domains** → sửa thành `haunted-quiz.vercel.app` (nếu còn trống).
5. Từ giờ mỗi lần push lên GitHub (hoặc sửa file trực tiếp trên GitHub), Vercel tự deploy lại sau ~30 giây.

Link dùng:
- Màn hình chiếu: `https://<tên>.vercel.app` (trang chủ chính là màn hình host)
- Người chơi: quét QR trên màn hình host (tự trỏ tới `play.html?room=<PIN>`), hoặc vào `https://<tên>.vercel.app` rồi nhập PIN.

(Vẫn dùng được GitHub Pages: Settings → Pages → Deploy from branch `main` / root — repo phải Public.)

### 2c. Checklist trước giờ chơi
- [ ] Supabase project đang **Active** (không Paused).
- [ ] Mở trang chủ trên máy chiếu, **không** thấy dòng cảnh báo "LOCAL DEMO mode".
- [ ] Dùng 2 điện thoại (4G + wifi) quét thử QR, vào sảnh thấy tên hiện trên màn hình.
- [ ] Bấm **⛶** fullscreen, click 1 lần để bật âm thanh + nhạc nền, chỉnh loa.
- [ ] Muốn tập dượt đông người: `/?bots=70`.

## 3. Cách chơi (host)

1. Mở trang chủ trên máy nối máy chiếu → QR + PIN hiện ngay, cảnh 3D tải sau vài giây. Bấm **⛶** (phím `F`) để fullscreen, click 1 lần để bật âm thanh.
   (Mở trang chủ bằng điện thoại sẽ thấy màn "Join the game" để vào chơi; muốn làm host trên máy nhỏ thì bấm "I'm the host" hoặc thêm `?host` vào link.)
2. Người chơi quét QR → nhập tên → chọn avatar → vào sảnh. Click vào tên trên sảnh để kick.
3. **Start the game** → camera bay tới lâu đài, sấm chớp + tiếng cười → cổng lâu đài mở → mascot run rẩy bay vào **hành lang ma**.
4. Mỗi câu hỏi:
   - **Đi sâu vào hành lang (~4 giây)**: mascot đi bình thường tới điểm dừng tiếp theo + 1 sự kiện ma ám: đèn chập chờn / bức tranh lệch và mắt người phụ nữ dõi theo / cánh cửa rung có tiếng gõ / đồng hồ quả lắc rung chuông / mất điện thấy đôi mắt đỏ trong bóng tối.
   - **Khung câu hỏi** hiện ra trước (3 giây, có ảnh/video thì 5 giây) — điện thoại **chỉ hiện câu hỏi (+ ảnh/video), chưa hiện đáp án** → sau đó mới hiện **4 đáp án** + đếm ngược (mặc định 20 giây, chỉnh riêng từng câu; hết giờ hoặc mọi người đã trả lời thì tự chốt). Câu hỏi + ảnh/video vẫn nằm trên màn hình lúc chọn đáp án.
   - **Chốt**: đáp án đúng sáng lên + số người chọn từng đáp án, rồi:
     - Đa số **đúng** → con ma lao ra (từ cánh cửa / bức tranh / xuyên tường) nhưng bị **thế lực bí ẩn chặn lại**: khiên phép thuật "BONK!" hoặc vòng xoáy hút ngược con ma.
     - Đa số **sai** → con ma **trả đũa**: tắt đèn, "BOO!!", mascot xoay vòng ngã lăn ra choáng váng.
5. **Next / Space** → Scoreboard: **biểu đồ 4 cột** (bao nhiêu người chọn mỗi đáp án, % trên tổng người chơi, cột đúng có ✓) + top 5 + người trả lời đúng nhanh nhất → câu tiếp theo.
   - Điện thoại có **hành lang 3D riêng** (tải nền khi đang ở sảnh chờ): avatar của mình bay vào hành lang, gặp sự kiện ma ám, bị ma hù / được thế lực bí ẩn cứu giống màn chiếu, kèm rung máy. Máy không chạy được 3D thì tự dùng bản 2D.
6. Sau câu cuối → **podium Top 3** + tổng điểm, bảng hạng 4–12. Mỗi điện thoại hiện hạng của chính mình.

**Vào trang chủ** → hiện ô **"Are you the game master?"**:
- Nhập `BOS-HOST` → **Enter as admin** → máy này thành **màn hình quản trò** (màn chiếu 3D: QR, sảnh, câu hỏi, đáp án, animation, nút Next question / Skip / Restart / Exit). Đăng nhập được nhớ trong tab đó (refresh không phải nhập lại).
- Bấm **I'm a player — skip** → chuyển sang màn người chơi (nhập PIN, tên, avatar).
- Người chơi quét QR thì vào thẳng màn người chơi, không bị hỏi mã.

**📝 Edit questions** (nút góc trên phải, **chỉ admin thấy**): sửa câu hỏi ngay trên màn quản trò — ô xanh = đáp án đúng, 3 ô đỏ = đáp án sai, thêm/xoá/đổi thứ tự → **💾 Save**.
- **⏱ Countdown**: mỗi câu mặc định 20 giây; chỉnh riêng từng câu (gõ số 5–300 hoặc bấm 10s/20s/30s/60s), hoặc ô "Countdown for every question" → **Apply to all**.
- **🖼 Ảnh / GIF / video** (tuỳ chọn) hiện **dưới câu hỏi** trên màn chiếu và trên điện thoại. Upload file hoặc **🔗 Paste a link** (link trực tiếp tới .jpg/.png/.gif/.mp4). Giới hạn vì 79 điện thoại đều phải tải: ảnh tự nén ≤ 1280px; **GIF ≤ 3 MB** (nên ≤ 1.5 MB); **video MP4/WebM ≤ 5 MB, ≤ 30 giây** (nên ≤ 15 giây, 720p) — quá giới hạn sẽ báo đỏ và không cho upload, gần giới hạn báo vàng. Video tự chạy, tắt tiếng, lặp lại. Mỗi lần Save là 1 phiên bản mới (v1, v2…); game luôn dùng **bản Save gần nhất**, đáp án đúng được **xáo vào ô ngẫu nhiên** mỗi ván. Nút "Log out" trong khung edit để thoát quyền admin.
(Tuỳ chọn: `control.html` là remote trên điện thoại cho quản trò — cũng đăng nhập bằng BOS-HOST.)

**Animation khi chốt đáp án:**
- **Màn quản trò** theo cả phòng: **≥ 50% người chơi trả lời đúng** → con ma lao ra nhưng bị thế lực bí ẩn chặn lại, banner "**XX% of players got it right!**"; ngược lại → con ma hù dọa, banner "**XX% of players got BOO'd!**" (XX = % người sai/không trả lời).
- **Điện thoại** theo **chính người đó**: mình đúng → ma bị chặn (khiên phép / vòng xoáy); mình sai/hết giờ → ma hù, mình xoay vòng ngã choáng. Cảnh hành lang chiếm **toàn màn hình**.
- **Mascot = avatar**: trên điện thoại, nhân vật đi trong hành lang chính là avatar người chơi đã chọn; trên màn quản trò là avatar của **người đang dẫn đầu** (câu 1 chưa ai có điểm thì là phù thuỷ).

**Nút điều khiển (góc dưới trái, khi đang chơi):**
- **⟲ Restart** — chơi lại từ đầu (intro + câu 1) với cùng người chơi, điểm về 0.
- **✕ Exit** — thoát về sảnh chờ (người chơi vẫn ở trong phòng, điểm về 0).
- Màn podium: **Play again ↺** = chơi lại từ đầu.
- Điện thoại: thanh trên cùng = avatar + tên + hạng (#3 of 42) · ô điểm vàng (nhảy số + "+850" khi có điểm) · nút **Leave**.

**Nhạc nền** (chỉ phát trên màn chiếu, điện thoại im lặng để khỏi loạn): sảnh chờ = `WAITING FOR SOUL`, trong lúc chơi (intro → câu hỏi → scoreboard) = `INTHEGAME`, màn Top 3 = `WINNER`. Tự chuyển bài có fade; nút 🔊 / phím `M` tắt cả nhạc lẫn hiệu ứng. Trình duyệt chặn tự phát nhạc nên cần click vào trang 1 lần.

Phím tắt host: `Space`/`Enter`/`→` = Next (hoặc Skip) · `F` = fullscreen · `M` = tắt tiếng.

**Tính điểm (giống Kahoot):** đúng = `1000 × (1 − thời_gian/countdown/2)` → trả lời ngay ≈ 1000, sát giờ ≈ 500; sai/không trả lời = 0.

### Tập dượt với người chơi giả
`/?bots=70` (hoặc `index.html?bots=70`) → thêm 70 người chơi ảo tự trả lời, để test giao diện & hiệu năng khi đông người.

## 4. Chỉnh sửa

- **Câu hỏi**: sửa trên trang Game Master (mã BOS-HOST). `QUESTIONS` trong `js/config.js` chỉ là bộ mặc định khi chưa Save lần nào.
- **Thời gian / điểm**: countdown từng câu chỉnh trong 📝 Edit questions; giá trị mặc định + điểm trong `js/config.js` (`QUESTION_TIME`, `MAX_POINTS`, `AUTO_ADVANCE`).
- **Nhạc**: `assets/music/waiting.mp3`, `ingame.mp3`, `winner.mp3` (đã nén 128 kbps). Âm lượng từng bài: `TRACKS` trong `js/music.js`.
- **Avatar**: 14 nhân vật trong `assets/avatars/*.webp` (256px, nền trong suốt). Thêm/bớt: bỏ file vào thư mục rồi sửa danh sách `AVATARS` trong `js/config.js` (id = tên file).
- **Mascot**: tạm thời là hình phù thủy 2D bay lơ lửng (`MASCOT` trong `js/config.js`). Khi có mascot 3D mới sẽ thay vào + làm animation riêng.
- **Hành lang ma**: `assets/models/hallway.glb` (Diorama Haunted Hallway, đã nén 8 MB → 2.2 MB). Game ghép nhiều đoạn hành lang hai bên tường thành 1 hành lang dài nhiều cửa; mỗi câu hỏi là 1 điểm dừng (`stations`, tự sinh theo số câu hỏi).

## 5. Kiến trúc & hiệu năng (50–80 người)

- **Host là trọng tài**: chấm điểm, xếp hạng, gửi trạng thái. Điện thoại chỉ gửi `join` và `ans`.
- 2 kênh/phòng: `hq:<PIN>` (player → host, gửi qua REST nên không bị nhân bản tới 79 máy khác) và `room:<PIN>` (host → tất cả).
- Heartbeat 3 giây để máy bị rớt mạng / reload tự đồng bộ lại đúng câu, đúng thời gian còn lại.
- Thời gian trả lời đo trên chính điện thoại (công bằng kể cả khi mạng chậm).
- Điện thoại tải hành lang 3D bản nhẹ (`hallway-lite.glb` 1.2 MB, texture 512px, chỉ vẽ các đoạn hành lang gần camera) **sau khi** vào sảnh, trong lúc chờ; ~2–3 MB/máy. Không có WebGL / tải quá 60 giây → tự dùng cảnh 2D. Thêm `&2d` vào link người chơi để ép dùng 2D.
- Host refresh giữa chừng → điểm được khôi phục từ `localStorage` (mở lại đúng link có `?room=`).

## Cấu trúc

```
index.html (host)  play.html  host.html (redirect)
css/        common.css host.css play.css control.css
js/         config.js  net.js  host.js  play.js  stage3d.js  sfx.js  ui.js
            music.js (nhạc nền) media.js (ảnh/video câu hỏi) editor.js gm.js control.js quizstore.js
supabase/   setup.sql (bảng câu hỏi + mã) · media-setup.sql (kho ảnh/video quiz-media)
lib/        three.js (vendored r169), supabase-js UMD, qrcode-generator
assets/     models/ (halloween = nhà ma ngoài trời, hallway = hành lang, door = cổng lâu đài, ghost)
            hallway-lite = bản nhẹ cho điện thoại
            audio/evil-laugh.mp3 · music/ (waiting, ingame, winner) · img/ · avatars/*.webp
vercel.json (cache cho assets)
```

Credits: 3D models & âm thanh do bạn cung cấp (Sketchfab / Meshy / Freesound — kiểm tra license từng file trước khi public).
