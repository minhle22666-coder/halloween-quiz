# 🎃 Haunted Quiz — Halloween quiz kiểu Kahoot

Web app quiz realtime theo luật chơi Kahoot: màn hình **HOST** (máy chiếu, có cảnh 3D + mascot) và màn hình **PLAYER** (điện thoại, nhẹ, không 3D).
Chạy hoàn toàn tĩnh (deploy **Vercel** hoặc GitHub Pages, không cần build); phần realtime dùng **Supabase Realtime (Broadcast)** — miễn phí.

| Trang | Ai dùng | Nội dung |
|---|---|---|
| `/` (`index.html`) | Người dẫn (máy chiếu) | Vào là thấy ngay 3D + QR + mã PIN, sảnh chờ, intro lâu đài → hành lang ma, câu hỏi, mascot, bảng xếp hạng, podium |
| `play.html?room=PIN` | Người chơi (điện thoại) | Nhập tên + chọn avatar, bấm đáp án, xem đúng/sai + hạng của mình, nút Leave |
| `host.html` | — | Link cũ, tự chuyển về `index.html` |

---

## 1. Supabase (5 phút, làm 1 lần)

1. Vào <https://supabase.com> → đăng nhập bằng GitHub → **New project**.
   - Organization: chọn cái có sẵn (Free).
   - Project name: `haunted-quiz` · Database password: bấm *Generate* (không cần nhớ, game không dùng DB) · Region: **Southeast Asia (Singapore)** cho nhanh.
   - Bấm **Create new project**, đợi ~1–2 phút.
2. Lấy 2 giá trị (nút **Connect** ở đầu trang, hoặc **Project Settings → API Keys / Data API**):
   - **Project URL**: dạng `https://abcdxyz.supabase.co`
   - **Publishable key** (`sb_publishable_...`) — hoặc **anon public** key (`eyJ...`) ở tab *Legacy API keys*. Dùng cái nào cũng được.
   - ⚠️ KHÔNG dùng `service_role` / `secret` key.
3. Mở `js/config.js`, dán vào:
   ```js
   SUPABASE_URL: 'https://abcdxyz.supabase.co',
   SUPABASE_ANON_KEY: 'sb_publishable_xxxxxxxx',
   ```
4. Vào **Realtime → Settings**: để **Allow public access = ON** (mặc định đã bật; KHÔNG bật "Private channels only"). Bấm Save nếu có đổi.

> Không cần tạo bảng hay viết SQL. Game chỉ dùng kênh Broadcast của Realtime.
> Publishable/anon key là key công khai, để trong code public là bình thường.
> Gói Free: 200 kết nối đồng thời, đủ cho ~80 người + host. Project Free bị *pause* sau 7 ngày không dùng → trước buổi chơi mở dashboard kiểm tra, nếu "Paused" thì bấm **Restore**.

Chưa điền key → game chạy **LOCAL DEMO**: host và người chơi phải là các tab trong cùng một trình duyệt (để thử nhanh).

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
- [ ] Bấm **⛶** fullscreen, click 1 lần để bật âm thanh, chỉnh loa.
- [ ] Muốn tập dượt đông người: `/?bots=70`.

## 3. Cách chơi (host)

1. Mở trang chủ trên máy nối máy chiếu → QR + PIN hiện ngay, cảnh 3D tải sau vài giây. Bấm **⛶** (phím `F`) để fullscreen, click 1 lần để bật âm thanh.
   (Mở trang chủ bằng điện thoại sẽ thấy màn "Join the game" để vào chơi; muốn làm host trên máy nhỏ thì bấm "I'm the host" hoặc thêm `?host` vào link.)
2. Người chơi quét QR → nhập tên → chọn avatar → vào sảnh. Click vào tên trên sảnh để kick.
3. **Start the game** → camera bay tới lâu đài, sấm chớp + tiếng cười → cổng lâu đài mở → mascot run rẩy bay vào **hành lang ma**.
4. Mỗi câu hỏi:
   - **Đi sâu vào hành lang (~4 giây)**: mascot bay tới điểm dừng tiếp theo + 1 sự kiện ma ám: đèn chập chờn / bức tranh lệch và mắt người phụ nữ dõi theo / cánh cửa rung có tiếng gõ / đồng hồ quả lắc rung chuông / mất điện thấy đôi mắt đỏ trong bóng tối.
   - **Khung câu hỏi** hiện ra (3 giây) → **4 đáp án** + đếm ngược 20 giây (hết giờ hoặc mọi người đã trả lời thì tự chốt).
   - **Chốt**: đáp án đúng sáng lên + số người chọn từng đáp án, rồi:
     - Đa số **đúng** → con ma lao ra (từ cánh cửa / bức tranh / xuyên tường) nhưng bị **thế lực bí ẩn chặn lại**: khiên phép thuật "BONK!" hoặc vòng xoáy hút ngược con ma.
     - Đa số **sai** → con ma **trả đũa**: tắt đèn, "BOO!!", mascot xoay vòng ngã lăn ra choáng váng.
5. **Next / Space** → Scoreboard (top 5, điểm cộng câu đó + thời gian trả lời, người nhanh nhất) → câu tiếp theo.
6. Sau câu cuối → **podium Top 3** + tổng điểm, bảng hạng 4–12. Mỗi điện thoại hiện hạng của chính mình.

**Nút điều khiển (góc dưới trái, khi đang chơi):**
- **⟲ Restart** — chơi lại từ đầu (intro + câu 1) với cùng người chơi, điểm về 0.
- **✕ Exit** — thoát về sảnh chờ (người chơi vẫn ở trong phòng, điểm về 0).
- Màn podium: **Play again ↺** = chơi lại từ đầu.
- Điện thoại: nút **✕ Leave** ở góc trên để rời game.

Phím tắt host: `Space`/`Enter`/`→` = Next (hoặc Skip) · `F` = fullscreen · `M` = tắt tiếng.

**Tính điểm (giống Kahoot):** đúng = `1000 × (1 − thời_gian/20/2)` → trả lời ngay ≈ 1000, sát giờ ≈ 500; sai/không trả lời = 0.

### Tập dượt với người chơi giả
`/?bots=70` (hoặc `index.html?bots=70`) → thêm 70 người chơi ảo tự trả lời, để test giao diện & hiệu năng khi đông người.

## 4. Chỉnh sửa

- **Câu hỏi / thời gian / điểm**: `js/config.js` (`QUESTIONS`, `QUESTION_TIME`, `MAX_POINTS`, `AUTO_ADVANCE`).
- **Avatar**: 14 nhân vật trong `assets/avatars/*.webp` (256px, nền trong suốt). Thêm/bớt: bỏ file vào thư mục rồi sửa danh sách `AVATARS` trong `js/config.js` (id = tên file).
- **Mascot**: tạm thời là hình phù thủy 2D bay lơ lửng (`MASCOT` trong `js/config.js`). Khi có mascot 3D mới sẽ thay vào + làm animation riêng.
- **Hành lang ma**: `assets/models/hallway.glb` (Diorama Haunted Hallway, đã nén 8 MB → 2.2 MB). Game ghép nhiều đoạn hành lang hai bên tường thành 1 hành lang dài nhiều cửa; mỗi câu hỏi là 1 điểm dừng (`stations`, tự sinh theo số câu hỏi).

## 5. Kiến trúc & hiệu năng (50–80 người)

- **Host là trọng tài**: chấm điểm, xếp hạng, gửi trạng thái. Điện thoại chỉ gửi `join` và `ans`.
- 2 kênh/phòng: `hq:<PIN>` (player → host, gửi qua REST nên không bị nhân bản tới 79 máy khác) và `room:<PIN>` (host → tất cả).
- Heartbeat 3 giây để máy bị rớt mạng / reload tự đồng bộ lại đúng câu, đúng thời gian còn lại.
- Thời gian trả lời đo trên chính điện thoại (công bằng kể cả khi mạng chậm).
- Điện thoại không tải three.js (trang ~50 KB + avatar) → mượt cả trên máy yếu.
- Host refresh giữa chừng → điểm được khôi phục từ `localStorage` (mở lại đúng link có `?room=`).

## Cấu trúc

```
index.html (host)  play.html  host.html (redirect)
css/        common.css host.css play.css
js/         config.js  net.js  host.js  play.js  stage3d.js  sfx.js  ui.js
lib/        three.js (vendored r169), supabase-js UMD, qrcode-generator
assets/     models/ (halloween = nhà ma ngoài trời, hallway = hành lang, door = cổng lâu đài, ghost)
            audio/evil-laugh.mp3 · img/ (moon, bats, bushes, pumpkin) · avatars/*.webp
vercel.json (cache cho assets)
```

Credits: 3D models & âm thanh do bạn cung cấp (Sketchfab / Meshy / Freesound — kiểm tra license từng file trước khi public).
