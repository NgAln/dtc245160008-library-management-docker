# ATLAS Library — Quản lý thư viện bằng Docker Compose

Bài thực hành **Triển khai và Quản trị Hệ thống Phần mềm** theo đề Hệ thống Quản lý Thư viện.

> **Đây là môi trường học tập trên mạng LAN, không phải cấu hình production.** Website dùng HTTP Basic Auth, nên thông tin xác thực chưa được mã hóa nếu bạn truy cập bằng HTTP. Không mở các cổng quản trị ra Internet; nếu triển khai công khai phải bật HTTPS, bảo vệ đường quản trị và cập nhật công cụ EOL. Mã sách, độc giả, thống kê, mượn/trả là dữ liệu minh họa.

## 1. Các chức năng website

- Tổng quan: số đầu sách, tổng bản sách, số độc giả, sách đang mượn, giao dịch mới.
- Sách: **thêm, xem, sửa, xóa**; quản lý ISBN, tác giả, thể loại, số lượng.
- Độc giả: **thêm, xem, sửa, xóa**, kiểm tra email trùng.
- Mượn: chọn độc giả/sách, đặt hạn trả; giảm tồn kho trong một giao dịch SQL.
- Trả: cập nhật ngày trả; hoàn tồn kho trong một giao dịch SQL.
- Không cho xóa sách/độc giả có lịch sử mượn; không cho mượn khi hết sách.
- Website có xác thực quản trị HTTP Basic (chỉ dùng trong lab); Prometheus có thể scrape `/metrics` qua mạng nội bộ.

## 2. Kiến trúc

```text
Windows / Browser ──http://IP_UBUNTU:8080──> Nginx:8080
                                               │ reverse proxy
                                               ▼
                                      Node.js Express:3000
                                               │ PostgreSQL protocol
                                               ▼
                                          PostgreSQL:5432
                                               ▲
                                          pgAdmin:80
                                            (host:5050)

Prometheus:9090 ──scrape──> Node.js:3000/metrics
                ├─────────> nginx-exporter:9113 ──> Nginx stub_status:8081
                ├─────────> postgres-exporter:9187 ──> PostgreSQL
                ├─────────> cadvisor:8080 (container)
                └─────────> node-exporter:9100 (Ubuntu host)
Grafana:3000 (host:3001) ──queries──> Prometheus và Loki
Docker JSON logs ──> Promtail ──> Loki:3100 ──> Grafana Explore/LogQL
```

Mạng: `front_net` cho Nginx + web; `db_net` là internal cho PostgreSQL, web, pgAdmin, postgres-exporter; `monitor_net` internal cho exporters, monitoring, web, Nginx; `admin_net` để host truy cập pgAdmin, Prometheus, Grafana. PostgreSQL không publish cổng 5432 lên host.

## 3. Yêu cầu phần cứng và phần mềm

- Linux có Docker Engine + `docker compose` (Compose v2), 64-bit.
- Đề xuất **>= 4 GB RAM** và **>= 10 GB trống** trước khi pull tất cả image, lưu container và volume.
- Ubuntu 18.04 hết hỗ trợ chuẩn; khuyến nghị Ubuntu 24.04 LTS cho dự án mới. Nếu phải dùng Ubuntu 18.04, kiểm tra tính tương thích của Docker/Grafana/cAdvisor với kernel và runtime.
- Windows truy cập được IP Ubuntu (`hostname -I`).

Kiểm tra trước:

```bash
whoami
hostname -I
free -h
df -h
docker --version
docker compose version
sudo docker ps
```

## 4. Cấu hình lần đầu

```bash
cd ~/library-management-docker
./setup-env.sh
sudo docker compose -f docker-compose.yml config --quiet
```

`setup-env.sh` dùng Python tạo ngẫu nhiên **6 mật khẩu** trong `.env`, đặt quyền `600`, và không ghi đè file cũ. File `.env` đã nằm trong `.gitignore`: **không upload file chứa mật khẩu lên GitHub**.

Để xem tài khoản đăng nhập web:

```bash
grep '^APP_USERNAME=' .env
```

Mật khẩu web là giá trị `APP_PASSWORD` trong `.env`. Chỉ đọc trên máy của bạn; không gửi mật khẩu lên chat hoặc chụp màn hình lộ mật khẩu.

## 5. Giai đoạn 1 — website, PostgreSQL, pgAdmin, Nginx

```bash
sudo docker compose -f docker-compose.yml up -d --build
sudo docker compose -f docker-compose.yml ps
sudo docker compose -f docker-compose.yml logs --tail=40 web
```

Chờ `web` healthy rồi mở trên Windows theo địa chỉ IP Ubuntu:

- **Website Nginx:** `http://192.168.31.132:8083` (đổi IP nếu Ubuntu đổi địa chỉ).
- **pgAdmin:** `http://192.168.31.132:5051`.

Đăng nhập website bằng `APP_USERNAME` / `APP_PASSWORD` từ `.env`.

pgAdmin dùng `PGADMIN_EMAIL` / `PGADMIN_PASSWORD` từ `.env`.

Trong pgAdmin: `Servers` -> `Thu vien PostgreSQL` (hoặc `Register > Server` nếu chưa có) -> `Connection`:

- Host: `postgres`
- Port: `5432`
- Maintenance database: `library_db`
- Username: `library_admin`
- Password: `POSTGRES_PASSWORD` từ `.env`

Xem dữ liệu: Servers -> Thu vien PostgreSQL -> Databases -> `library_db` -> Schemas -> public -> Tables (`books`, `readers`, `loans`).

Kiểm tra từ Ubuntu:

```bash
curl -I http://127.0.0.1:8080
sudo docker compose exec postgres psql -U library_admin -d library_db -c 'SELECT * FROM books;'
sudo docker compose exec postgres psql -U library_admin -d library_db -c 'SELECT * FROM readers;'
```

Dữ liệu mẫu chỉ tạo khi volume PostgreSQL **mới**. Sau đó không bị reset khi `up/down` thường.

### Thử các luồng website

1. Mở **Quản lý sách**, tạo sách mới (ISBN không trùng).
2. Bấm **Sửa**, đổi số lượng; quay về danh sách để xem cập nhật.
3. Vào **Độc giả**, thêm người đọc với email mới.
4. Vào **Mượn / Trả**, chọn sách, độc giả, chọn hạn trả >= hôm nay; lập phiếu.
5. Quay lại danh sách sách: số còn giảm 1.
6. Nhấn **Xác nhận trả**: số còn tăng 1; phiếu được ghi ngày trả.
7. Thử xóa sách đã có lịch sử mượn: hệ thống từ chối để bảo toàn dữ liệu.

## 6. Giai đoạn 2 — Prometheus + Grafana

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d --build
sudo docker compose -f docker-compose.yml -f docker-compose.monitoring.yml ps
```

Truy cập:

- Prometheus: `http://192.168.31.132:9091/targets`.
- Grafana: `http://192.168.31.132:3001`.

Đăng nhập Grafana bằng `admin` / `GRAFANA_PASSWORD` từ `.env`.

Trong Grafana: **Dashboards** -> **Library Monitoring** -> **Library | Website - Container - PostgreSQL - Nginx** (dashboard có sẵn trong cấu hình provisioning). Chọn `Last 15 minutes`.

Trong Prometheus kiểm tra các biểu thức:

```promql
up
library_http_requests_total
nginx_connections_active
pg_up
container_memory_working_set_bytes
node_memory_MemAvailable_bytes
```

`up=1` nghĩa là Prometheus đang scrape được target. Nếu dashboard web chưa có số, mở website vài lần rồi đợi một vài chu kỳ scrape (15 giây); nếu exporter `DOWN`, xem log container tương ứng.

## 7. Giai đoạn 3 — Loki + Promtail + LogQL

Lưu ý: **Promtail đã EOL từ 02/03/2026**. Dự án này giữ Promtail **chỉ để khớp đề thực hành**; với hệ thống mới ngoài lab nên thay bằng Grafana Alloy.

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.monitoring.yml -f docker-compose.logging.yml up -d --build
sudo docker compose -f docker-compose.yml -f docker-compose.monitoring.yml -f docker-compose.logging.yml ps
sudo docker compose -f docker-compose.yml -f docker-compose.monitoring.yml -f docker-compose.logging.yml logs --tail=50 promtail loki
```

Vào Grafana -> **Explore** -> đổi Data source thành **Loki** -> `Last 15 minutes` -> chuyển chế độ **Code**, chạy từng truy vấn:

```logql
{job="docker"}
```

```logql
{job="docker"} |= "GET"
```

```logql
sum(count_over_time({job="docker"}[5m]))
```

Để tạo log mới, truy cập website và thực hiện vài thao tác; cần chờ Promtail đọc và gửi log. Truy vấn thứ hai chỉ hiện kết quả nếu log thực tế chứa chữ `GET`.

Nếu không có log: kiểm tra Docker logging driver và đường dẫn `/var/lib/docker/containers`:

```bash
sudo docker info --format '{{.LoggingDriver}}'
sudo ls /var/lib/docker/containers | head
sudo docker compose -f docker-compose.yml -f docker-compose.monitoring.yml -f docker-compose.logging.yml logs --tail=100 promtail
```

Cấu hình Promtail trong project giả định Docker log driver `json-file` và data root mặc định; nếu Docker sử dụng `journald`, `local` hoặc Docker Desktop trong VM, phải đổi nguồn thu log.

## 8. Bảo mật (hardening)

1. `web` chạy dưới user `node`, `read_only: true`, `cap_drop: [ALL]`, `no-new-privileges`.
2. `db_net` và `monitor_net` là mạng nội bộ; DB không được publish cổng 5432.
3. 6 mật khẩu sinh ngẫu nhiên trong `.env`; `.env` được `.gitignore` và chmod 600.
4. Nginx sử dụng `X-Frame-Options`, `X-Content-Type-Options`, CSP và Referrer-Policy.
5. App PostgreSQL login qua `library_app` (không phải superuser), chỉ có quyền truy cập các bảng/sequences được cấp. Metrics dùng role `library_monitor` với `pg_monitor`.
6. Các form SQL dùng tham số `$1`, `$2`,...; nội dung hiển thị HTML được escape.

Caveat: `promtail` cần đọc nhật ký host và chạy root trong container lab; cAdvisor cần mount read-only thông tin host/Docker. Dịch vụ web vẫn non-root. Không coi các agent hệ thống này là workload ít quyền.

Kiểm tra:

```bash
curl -I http://127.0.0.1:8080
sudo docker compose exec web id
sudo docker compose exec postgres psql -U library_admin -d library_db -c '\du'
```

Không nên expose trực tiếp pgAdmin/Grafana/Prometheus ra Internet. HTTP Basic Auth cần HTTPS hoặc SSH tunnel trong môi trường thực tế.

## 9. Lỗi thường gặp

- `no space left on device`: chạy `df -h`, `sudo docker system df`; cần tăng dung lượng VM trước, không xóa bừa volume hiện có.
- `docker compose: command not found`: cài Compose plugin v2; máy Ubuntu 18.04 có thể thiếu plugin trong apt mặc định.
- `permission denied` khi chạy Docker: thêm `sudo` trước `docker compose`.
- `port is already allocated`: xem `sudo ss -lntp | grep -E ':(8080|5050|9090|3001) '` rồi đổi host port ở `ports:`.
- `password authentication failed`: kiểm tra `.env`, nhớ password khởi tạo Postgres **không tự đổi** khi đổi `.env` với volume cũ.
- `relation "books" does not exist`: SQL init chưa chạy; đọc log postgres. Không xóa volume nếu có dữ liệu thật.
- Grafana không thấy dashboard: kiểm tra `grafana/provisioning/dashboards/dashboard-provider.yml` và `grafana/dashboards/library-dashboard.json`, xem log Grafana.
- `cAdvisor` không có metrics: phiên bản Docker/kernel cũ, mount hoặc permission không tương thích; đọc log để xác định, không tự động bật `privileged: true`.
- Loki trống: xem JSON log driver và mount `/var/lib/docker/containers`; `Last 15 minutes`, query `{job="docker"}` trước.

## 10. GitHub — đúng ba commit có ý nghĩa

Repository phải chứa source và cấu hình, nhưng **không được chứa `.env`**. Có thể hoàn thành ba commit theo giai đoạn:

1. `Commit 1 - Website PostgreSQL pgAdmin Nginx reverse proxy`.
2. `Commit 2 - Prometheus Grafana exporters dashboard`.
3. `Commit 3 - Loki Promtail LogQL and hardening documentation`.

Để bảo đảm mỗi commit đúng giai đoạn, nên stage từng nhóm file (xem phần Git trong hướng dẫn bên dưới), không dùng `git add .` ở lần đầu nếu bạn muốn tách rõ thay đổi. Sau khi đủ ba commit, `git push -u origin main`.

## 11. Lưu ý vận hành

Dừng dịch vụ mà vẫn giữ DB:

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.monitoring.yml -f docker-compose.logging.yml down
```

Khởi động lại toàn hệ thống:

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.monitoring.yml -f docker-compose.logging.yml up -d
```

**Không chạy `down -v`** nếu không muốn xóa dữ liệu PostgreSQL, Grafana và các volume khác.

## 12. Minh chứng cần chụp cho báo cáo (>= 10 trang)

1. Sơ đồ tổng thể, cây thư mục, `docker compose ps`.
2. Trang chủ website, CRUD sách, CRUD độc giả, lập phiếu mượn, xác nhận trả.
3. pgAdmin có ba bảng và dữ liệu sau mượn/trả.
4. Cấu hình Nginx và phản hồi có security headers.
5. Prometheus `/targets` (các target UP) + Grafana dashboard.
6. Grafana Explore: 3 truy vấn LogQL cùng kết quả.
7. Bảo mật: network inspect, app `id`, PostgreSQL `\du`, `.gitignore`.
8. Repository GitHub: ba commit, README và ảnh demo.

