# Dàn ý báo cáo tối thiểu 10 trang

1. **Trang bìa:** trường/khoa, môn học, họ tên, MSSV, lớp, giảng viên, tên đề tài.
2. **Mục lục**.
3. **Chương 1: Mục tiêu và phạm vi:** quản lý sách, độc giả, mượn/trả; yêu cầu chung của môn.
4. **Chương 2: Kiến trúc và công nghệ:** Docker Compose, 4 mạng, Node.js/Express, PostgreSQL, pgAdmin, Nginx, Prometheus, Grafana, Loki, Promtail. Sơ đồ.
5. **Chương 3: Triển khai:** các bước, cấu trúc source, môi trường Ubuntu/Docker, kiểm tra IP/ports.
6. **Chương 4: Chức năng ứng dụng:** đăng nhập quản trị; thêm/sửa/xóa sách, độc giả; mượn/trả; thao tác SQL và kết quả ảnh.
7. **Chương 5: Reverse Proxy Nginx:** upstream, hostname container, security headers, minh chứng `curl -I`.
8. **Chương 6: Monitoring:** targets, PromQL, dashboard Grafana, container/web/DB; ảnh.
9. **Chương 7: Centralized logging:** pipeline Docker logs -> Promtail -> Loki -> Grafana; 3 truy vấn LogQL kèm ảnh.
10. **Chương 8: Hardening:** nonroot, network isolation, mật khẩu, least privilege, headers; bằng chứng kiểm tra.
11. **Chương 9: GitHub / Demo / Đánh giá:** link repo theo MSSV, ba commit, README, bảng đối chiếu yêu cầu, kết luận.
12. **Tài liệu tham khảo:** tài liệu chính thức Docker, Nginx, PostgreSQL, Prometheus, Grafana, Loki.

**Lưu ý:** Không đưa mật khẩu `.env` vào báo cáo/screenshot. Không chụp kết quả chưa có; xác minh target thực sự `UP`.
