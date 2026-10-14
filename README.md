# 🎃 Haunted Quiz — Halloween quiz kiểu Kahoot

Web app quiz realtime theo luật chơi Kahoot: màn hình **HOST** (máy chiếu, có cảnh 3D + mascot) và màn hình **PLAYER** (điện thoại, nhẹ, không 3D).
Chạy hoàn toàn tĩnh (deploy **Vercel** hoặc GitHub Pages, không cần build); phần realtime dùng **Supabase Realtime (Broadcast)** — miễn phí.

| Trang | Ai dùng | Nội dung |
|---|---|---|
| `host.html` | Người dẫn (máy chiếu) | QR + mã PIN, sảnh chờ, cảnh mở cửa lâu đài, câu hỏi, mascot, bảng xếp hạng, podium |
| `play.html?room=PIN` | Người chơi (điện thoại) | Nhập tên + chọn avatar, bấm đáp án, xem đúng/sai + hạng của mình |
| `index.html` | Ai cũng được | Trang nhập PIN / link sang host |

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
- Màn hình chiếu: `https://<tên>.vercel.app/host.html`
- Người chơi: quét QR trên màn hình host (tự trỏ tới `play.html?room=<PIN>`), hoặc vào `https://<tên>.vercel.app` rồi nhập PIN.

(Vẫn dùng được GitHub Pages: Settings → Pages → Deploy from branch `main` / root — repo phải Public.)

### 2c. Checklist trước giờ chơi
- [ ] Supabase project đang **Active** (không Paused).
- [ ] Mở `host.html` trên máy chiếu, **không** thấy dòng cảnh báo "LOCAL DEMO mode".
- [ ] Dùng 2 điện thoại (4G + wifi) quét thử QR, vào sảnh thấy tên hiện trên màn hình.
- [ ] Bấm **⛶** fullscreen, click 1 lần để bật âm thanh, chỉnh loa.
- [ ] Muốn tập dượt đông người: `host.html?bots=70`.

## 3. Cách chơi (host)

1. Mở `host.html` trên máy nối máy chiếu → bấm **⛶** (hoặc phím `F`) để fullscreen. Click 1 lần vào trang để bật âm thanh.
2. Người chơi quét QR → nhập tên → chọn avatar → vào sảnh. Click vào một người trên sảnh để kick.
3. Bấm **Start the game** → camera bay tới lâu đài, sấm chớp + tiếng cười, cổng lâu đài mở, đi xuyên hành lang ma (~18 giây, bấm Skip để bỏ qua).
4. Mỗi câu: hiện câu hỏi 4 giây → mở 4 đáp án + đếm ngược 20 giây (hết giờ hoặc mọi người đã trả lời thì tự chốt).
5. Chốt: đáp án đúng sáng lên, số người chọn từng đáp án, mascot diễn hài:
   - Đa số **đúng** → con ma trượt vỏ chuối 🍌 hoặc bị kẹt cửa 🚪 (luân phiên), phù thủy không hề thấy.
   - Đa số **sai** → con ma hù "BOO!", phù thủy hồn lìa khỏi xác, rớt mũ phép.
6. **Next / Space** → Scoreboard (top 5, điểm cộng câu đó + thời gian trả lời, người trả lời nhanh nhất).
7. Sau câu 5 → **podium Top 3** + tổng điểm, bảng hạng 4–12. Mỗi điện thoại hiện hạng của chính mình.

Phím tắt host: `Space`/`Enter`/`→` = Next · `F` = fullscreen · `M` = tắt tiếng.

**Tính điểm (giống Kahoot):** đúng = `1000 × (1 − thời_gian/20/2)` → trả lời ngay ≈ 1000, sát giờ ≈ 500; sai/không trả lời = 0.

### Tập dượt với người chơi giả
`host.html?bots=70` → thêm 70 người chơi ảo tự trả lời, để test giao diện & hiệu năng khi đông người.

## 4. Chỉnh sửa

- **Câu hỏi / thời gian / điểm**: `js/config.js` (`QUESTIONS`, `QUESTION_TIME`, `MAX_POINTS`, `AUTO_ADVANCE`).
- **Avatar**: 14 nhân vật trong `assets/avatars/*.webp` (256px, nền trong suốt). Thêm/bớt: bỏ file vào thư mục rồi sửa danh sách `AVATARS` trong `js/config.js` (id = tên file).
- **Texture mascot**: `assets/models/texture_0.jpg` (đã nén từ 4096 → 2048px). Xoá file này thì game tự tô màu dự phòng.
- **Hành lang ma** (`haunted_diorama.glb`, đã nén texture 18 MB → 3.6 MB): đoạn giữa của intro — cổng lâu đài mở → camera đi dọc hành lang, đèn chập chờn, cửa bật mở thấy đôi mắt đỏ → trắng xoá → vào sân khấu câu hỏi.

## 5. Kiến trúc & hiệu năng (50–80 người)

- **Host là trọng tài**: chấm điểm, xếp hạng, gửi trạng thái. Điện thoại chỉ gửi `join` và `ans`.
- 2 kênh/phòng: `hq:<PIN>` (player → host, gửi qua REST nên không bị nhân bản tới 79 máy khác) và `room:<PIN>` (host → tất cả).
- Heartbeat 3 giây để máy bị rớt mạng / reload tự đồng bộ lại đúng câu, đúng thời gian còn lại.
- Thời gian trả lời đo trên chính điện thoại (công bằng kể cả khi mạng chậm).
- Điện thoại không tải three.js (trang ~50 KB + avatar) → mượt cả trên máy yếu.
- Host refresh giữa chừng → điểm được khôi phục từ `localStorage` (mở lại đúng link có `?room=`).

## Cấu trúc

```
index.html  host.html  play.html
css/        common.css host.css play.css
js/         config.js  net.js  host.js  play.js  stage3d.js  sfx.js  ui.js
lib/        three.js (vendored r169), supabase-js UMD, qrcode-generator
assets/     models/ (halloween, haunted_diorama, door, ghost, banana .glb + wizard.fbx + texture_0.jpg)
            audio/evil-laugh.mp3 · img/ (moon, bats, bushes, pumpkin) · avatars/*.webp
vercel.json (cache cho assets)
```

Credits: 3D models & âm thanh do bạn cung cấp (Sketchfab / Meshy / Freesound — kiểm tra license từng file trước khi public).
