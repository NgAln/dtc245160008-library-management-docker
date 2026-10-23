'use strict';
const express = require('express');
const { Pool } = require('pg');
const client = require('prom-client');
const crypto = require('crypto');
const path = require('path');

const app = express();
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  database: process.env.DB_NAME || 'library_db',
  user: process.env.DB_USER || 'library_app',
  password: process.env.DB_PASSWORD,
  port: 5432,
  max: 10
});
const PORT = Number(process.env.PORT || 3000);
const username = process.env.APP_USERNAME;
const password = process.env.APP_PASSWORD;
if (!username || !password || !process.env.DB_PASSWORD) {
  throw new Error('Thieu bien moi truong APP_USERNAME, APP_PASSWORD hoac DB_PASSWORD');
}

const register = new client.Registry();
client.collectDefaultMetrics({ register });
const httpCount = new client.Counter({
  name: 'library_http_requests_total', help: 'Tong request HTTP',
  labelNames: ['method','route','status_code'], registers: [register]
});
app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use((req, res, next) => {
  res.on('finish', () => {
    const route = req.route ? req.route.path : (req.path.startsWith('/public') ? '/public' : 'other');
    httpCount.inc({ method: req.method, route: String(route), status_code: String(res.statusCode) });
    console.log(JSON.stringify({ time: new Date().toISOString(), method: req.method, route, status: res.statusCode }));
  });
  next();
});
app.get('/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', database: 'ok' }); }
  catch (e) { res.status(503).json({ status: 'error', database: 'unavailable' }); }
});
app.get('/metrics', async (req, res) => {
  res.setHeader('Content-Type', register.contentType);
  res.send(await register.metrics());
});
function safeEqual(a, b) {
  const ab = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
app.use((req, res, next) => {
  const raw = req.headers.authorization || '';
  if (!raw.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Thu vien", charset="UTF-8"');
    return res.status(401).send('Yeu cau dang nhap quan tri thu vien');
  }
  let decoded;
  try { decoded = Buffer.from(raw.slice(6), 'base64').toString('utf8'); }
  catch (e) { return res.sendStatus(401); }
  const sep = decoded.indexOf(':');
  const u = sep >= 0 ? decoded.slice(0, sep) : '';
  const p = sep >= 0 ? decoded.slice(sep + 1) : '';
  if (!safeEqual(u, username) || !safeEqual(p, password)) {
    res.set('WWW-Authenticate', 'Basic realm="Thu vien", charset="UTF-8"');
    return res.status(401).send('Sai tai khoan hoac mat khau');
  }
  next();
});
app.use('/public', express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
const h = v => String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date = v => v ? new Date(v).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
const nf = n => new Intl.NumberFormat('vi-VN').format(Number(n) || 0);
function page(title, body, active, message = '', error = false) {
  const nav = [['/', 'Tổng quan', '⌂'], ['/books', 'Quản lý sách', '▤'], ['/readers', 'Độc giả', '♙'], ['/loans', 'Mượn / Trả', '⇄']]
    .map(([url, text, icon]) => `<a class="nav-link ${active===url?'active':''}" href="${url}"><span>${icon}</span>${text}</a>`).join('');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${h(title)} • Thư viện Atlas</title><link rel="stylesheet" href="/public/style.css"></head><body>
  <div class="app-shell"><aside class="sidebar"><div class="brand"><span class="brand-mark">A</span><span><strong>ATLAS</strong><small>Library Management</small></span></div><p class="nav-label">DANH MỤC QUẢN LÝ</p><nav>${nav}</nav><div class="sidebar-footer">Hệ thống thư viện số<br><small>Node.js · PostgreSQL · Docker</small></div></aside>
  <main class="main"><header class="topbar"><span class="muted">HỆ THỐNG QUẢN TRỊ THƯ VIỆN</span><span class="user-pill">● Quản trị viên</span></header><div class="content"><div class="heading"><div><p class="eyebrow">QUẢN TRỊ · THƯ VIỆN</p><h1>${h(title)}</h1></div><span class="date-chip">${date(new Date())}</span></div>
  ${message ? `<div class="alert ${error?'alert-error':''}">${h(message)}</div>` : ''}${body}<footer class="footnote">ATLAS Library · Đồ án Triển khai và Quản trị Hệ thống Phần mềm</footer></div></main></div></body></html>`;
}
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const redirect = (res, path, message, error = false) => res.redirect(`${path}?${error?'error':'ok'}=${encodeURIComponent(message)}`);
const feedback = req => req.query.error || req.query.ok || '';
const hasError = req => Boolean(req.query.error);
const positiveId = x => Number.isSafeInteger(Number(x)) && Number(x) > 0 ? Number(x) : null;
const text = (x, max) => String(x || '').trim().slice(0, max);
const num = x => Number.isSafeInteger(Number(x)) ? Number(x) : null;
const table = (heads, rows, empty = 'Chưa có dữ liệu') => `<div class="table-wrap"><table><thead><tr>${heads.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td class="empty" colspan="${heads.length}">${h(empty)}</td></tr>`}</tbody></table></div>`;

app.get('/', asyncRoute(async (req, res) => {
  const [books, readers, open, loans, recent] = await Promise.all([
    pool.query('SELECT count(*)::int AS n, coalesce(sum(total_copies),0)::int AS copies FROM books'),
    pool.query('SELECT count(*)::int AS n FROM readers'),
    pool.query('SELECT count(*)::int AS n FROM loans WHERE returned_at IS NULL'),
    pool.query('SELECT count(*)::int AS n FROM loans'),
    pool.query(`SELECT l.id, b.title, r.full_name, l.borrowed_at, l.returned_at FROM loans l JOIN books b ON b.id=l.book_id JOIN readers r ON r.id=l.reader_id ORDER BY l.id DESC LIMIT 6`)
  ]);
  const stats = [['Đầu sách', books.rows[0].n, '▤'], ['Tổng số bản sách', books.rows[0].copies, '▥'], ['Độc giả', readers.rows[0].n, '♙'], ['Đang mượn', open.rows[0].n, '⇄']];
  const cards = stats.map(([label,val,icon])=>`<div class="stat-card"><span class="stat-icon">${icon}</span><span class="stat-label">${label}</span><strong>${nf(val)}</strong><small>Cập nhật theo cơ sở dữ liệu</small></div>`).join('');
  const trs = recent.rows.map(x=>`<tr><td><span class="id">#${x.id}</span></td><td>${h(x.title)}</td><td>${h(x.full_name)}</td><td>${date(x.borrowed_at)}</td><td>${x.returned_at?'<span class="pill done">Đã trả</span>':'<span class="pill pending">Đang mượn</span>'}</td></tr>`).join('');
  const body = `<section class="welcome"><div><span class="eyebrow">CHÀO MỪNG TRỞ LẠI</span><h2>Quản lý tri thức, kết nối độc giả.</h2><p>Theo dõi đầu sách, độc giả và các giao dịch mượn trả trên cùng một hệ thống.</p><a class="btn light" href="/loans">Tạo phiếu mượn →</a></div><div class="welcome-art">✦<br>▤</div></section><div class="stats">${cards}</div><section class="panel"><div class="panel-header"><div><h2>Hoạt động gần đây</h2><p>Các giao dịch được cập nhật theo thời gian thực</p></div><a class="minor-link" href="/loans">Xem tất cả →</a></div>${table(['Mã','Tên sách','Độc giả','Ngày mượn','Trạng thái'],trs,'Chưa có giao dịch mượn sách')}</section>`;
  res.send(page('Tổng quan hệ thống',body,'/',feedback(req),hasError(req)));
}));

app.get('/books', asyncRoute(async (req, res) => {
  const result = await pool.query('SELECT * FROM books ORDER BY id DESC');
  const rows = result.rows.map(b=>`<tr><td class="id">#${b.id}</td><td><strong>${h(b.title)}</strong><small class="sub">ISBN ${h(b.isbn)}</small></td><td>${h(b.author)}</td><td>${h(b.category)}</td><td>${nf(b.available_copies)} / ${nf(b.total_copies)}</td><td><a class="text-link" href="/books/${b.id}/edit">Sửa</a><form class="inline" action="/books/${b.id}/delete" method="post"><button class="text-danger" onclick="return confirm('Xóa sách này?')">Xóa</button></form></td></tr>`).join('');
  const form = `<form action="/books" method="post" class="form-grid"><label>Mã ISBN<input name="isbn" maxlength="30" required placeholder="ISBN không trùng"></label><label>Tên sách<input name="title" maxlength="255" required placeholder="Ví dụ: Lập trình Web"></label><label>Tác giả<input name="author" maxlength="160" required placeholder="Tên tác giả"></label><label>Thể loại<input name="category" maxlength="100" placeholder="Công nghệ"></label><label>Năm xuất bản<input name="published_year" type="number" min="1000" max="2100" placeholder="2025"></label><label>Số bản sách<input name="total_copies" type="number" min="1" max="100000" required value="1"></label><button class="btn" type="submit">+ Thêm sách mới</button></form>`;
  res.send(page('Quản lý sách',`<section class="panel"><div class="panel-header"><h2>Thêm đầu sách</h2><span class="hint">Nhập thông tin sách mới</span></div>${form}</section><section class="panel"><div class="panel-header"><h2>Danh mục sách <span class="count">${result.rows.length}</span></h2></div>${table(['Mã','Tên sách','Tác giả','Thể loại','Còn / Tổng','Thao tác'],rows)}</section>`,'/books',feedback(req),hasError(req)));
}));
app.post('/books', asyncRoute(async (req, res) => {
  const isbn=text(req.body.isbn,30), title=text(req.body.title,255), author=text(req.body.author,160);
  const category=text(req.body.category,100)||'Khác', total=num(req.body.total_copies), year=req.body.published_year?num(req.body.published_year):null;
  if (!isbn||!title||!author||!total||total<1||total>100000||(year!==null&&(year<1000||year>2100))) return redirect(res,'/books','Thông tin sách không hợp lệ',true);
  try { await pool.query('INSERT INTO books(isbn,title,author,category,published_year,total_copies,available_copies) VALUES($1,$2,$3,$4,$5,$6,$6)',[isbn,title,author,category,year,total]); redirect(res,'/books','Đã thêm sách mới'); }
  catch(e) { if(e.code==='23505')return redirect(res,'/books','ISBN đã tồn tại',true); throw e; }
}));
app.get('/books/:id/edit', asyncRoute(async (req,res)=>{
  const q=await pool.query('SELECT * FROM books WHERE id=$1',[positiveId(req.params.id)]);
  if(!q.rows.length)return res.sendStatus(404); const b=q.rows[0];
  const body=`<section class="panel"><div class="panel-header"><h2>Sửa thông tin sách #${b.id}</h2></div><form class="form-grid" method="post" action="/books/${b.id}/edit"><label>ISBN<input name="isbn" value="${h(b.isbn)}" required maxlength="30"></label><label>Tên sách<input name="title" value="${h(b.title)}" required maxlength="255"></label><label>Tác giả<input name="author" value="${h(b.author)}" required maxlength="160"></label><label>Thể loại<input name="category" value="${h(b.category)}" maxlength="100"></label><label>Năm xuất bản<input type="number" name="published_year" value="${h(b.published_year)}" min="1000" max="2100"></label><label>Tổng số bản<input type="number" name="total_copies" value="${b.total_copies}" required min="1"></label><button class="btn">Lưu thay đổi</button><a class="btn secondary" href="/books">Quay lại</a></form></section>`;
  res.send(page('Chỉnh sửa sách',body,'/books',feedback(req),hasError(req)));
}));
app.post('/books/:id/edit', asyncRoute(async (req,res)=>{
  const id=positiveId(req.params.id), total=num(req.body.total_copies), isbn=text(req.body.isbn,30), title=text(req.body.title,255), author=text(req.body.author,160), category=text(req.body.category,100)||'Khác', year=req.body.published_year?num(req.body.published_year):null;
  if(!id||!total||total<1||total>100000||!isbn||!title||!author||(year!==null&&(year<1000||year>2100)))return redirect(res,'/books','Dữ liệu không hợp lệ',true);
  const conn=await pool.connect();
  try {
    await conn.query('BEGIN');
    const q=await conn.query('SELECT total_copies, available_copies FROM books WHERE id=$1 FOR UPDATE',[id]);
    if(!q.rows.length)throw new Error('Không tìm thấy sách');
    const borrowed=q.rows[0].total_copies-q.rows[0].available_copies;
    if(total<borrowed)throw new Error('Tổng số bản nhỏ hơn số sách đang cho mượn');
    await conn.query('UPDATE books SET isbn=$1,title=$2,author=$3,category=$4,published_year=$5,total_copies=$6,available_copies=$7 WHERE id=$8',[isbn,title,author,category,year,total,total-borrowed,id]);
    await conn.query('COMMIT');redirect(res,'/books','Đã cập nhật thông tin sách');
  } catch(e) {await conn.query('ROLLBACK');redirect(res,'/books',e.code==='23505'?'ISBN đã tồn tại':e.message,true);}
  finally {conn.release();}
}));
app.post('/books/:id/delete', asyncRoute(async (req,res)=>{
  try { const q=await pool.query('DELETE FROM books WHERE id=$1 RETURNING id',[positiveId(req.params.id)]);redirect(res,'/books',q.rowCount?'Đã xóa sách':'Không tìm thấy sách',!q.rowCount);}
  catch(e) {if(e.code==='23503')return redirect(res,'/books','Sách đã có lịch sử mượn/trả, không thể xóa',true);throw e;}
}));

app.get('/readers', asyncRoute(async (req,res)=>{
  const q=await pool.query('SELECT * FROM readers ORDER BY id DESC');
  const form=`<form class="form-grid" method="post" action="/readers"><label>Họ và tên<input name="full_name" maxlength="150" required placeholder="Nguyễn Văn A"></label><label>Email<input type="email" name="email" maxlength="200" required placeholder="email@example.com"></label><label>Số điện thoại<input name="phone" maxlength="30" placeholder="09..."></label><button class="btn">+ Thêm độc giả</button></form>`;
  const trs=q.rows.map(r=>`<tr><td class="id">#${r.id}</td><td><strong>${h(r.full_name)}</strong></td><td>${h(r.email)}</td><td>${h(r.phone)||'—'}</td><td>${date(r.created_at)}</td><td><a class="text-link" href="/readers/${r.id}/edit">Sửa</a><form class="inline" method="post" action="/readers/${r.id}/delete"><button class="text-danger" onclick="return confirm('Xóa độc giả?')">Xóa</button></form></td></tr>`).join('');
  res.send(page('Quản lý độc giả',`<section class="panel"><div class="panel-header"><h2>Đăng ký độc giả</h2></div>${form}</section><section class="panel"><div class="panel-header"><h2>Danh sách độc giả <span class="count">${q.rows.length}</span></h2></div>${table(['Mã','Họ tên','Email','Điện thoại','Ngày tạo','Thao tác'],trs)}</section>`,'/readers',feedback(req),hasError(req)));
}));
app.post('/readers', asyncRoute(async (req,res)=>{
  const name=text(req.body.full_name,150),email=text(req.body.email,200).toLowerCase(),phone=text(req.body.phone,30);
  if(!name||!/^\S+@\S+\.\S+$/.test(email))return redirect(res,'/readers','Tên hoặc email không hợp lệ',true);
  try {await pool.query('INSERT INTO readers(full_name,email,phone) VALUES($1,$2,$3)',[name,email,phone]);redirect(res,'/readers','Đã thêm độc giả');}
  catch(e){if(e.code==='23505')return redirect(res,'/readers','Email đã tồn tại',true);throw e;}
}));
app.get('/readers/:id/edit', asyncRoute(async(req,res)=>{
  const q=await pool.query('SELECT * FROM readers WHERE id=$1',[positiveId(req.params.id)]);
  if(!q.rows.length)return res.sendStatus(404);const r=q.rows[0];
  res.send(page('Sửa độc giả',`<section class="panel"><form class="form-grid" method="post" action="/readers/${r.id}/edit"><label>Họ tên<input name="full_name" value="${h(r.full_name)}" required maxlength="150"></label><label>Email<input name="email" type="email" value="${h(r.email)}" required maxlength="200"></label><label>Điện thoại<input name="phone" value="${h(r.phone)}" maxlength="30"></label><button class="btn">Lưu thay đổi</button><a class="btn secondary" href="/readers">Quay lại</a></form></section>`,'/readers',feedback(req),hasError(req)));
}));
app.post('/readers/:id/edit', asyncRoute(async(req,res)=>{
  const name=text(req.body.full_name,150),email=text(req.body.email,200).toLowerCase(),phone=text(req.body.phone,30);
  if(!name||!/^\S+@\S+\.\S+$/.test(email))return redirect(res,'/readers','Thông tin không hợp lệ',true);
  try {await pool.query('UPDATE readers SET full_name=$1,email=$2,phone=$3 WHERE id=$4',[name,email,phone,positiveId(req.params.id)]);redirect(res,'/readers','Đã sửa độc giả');}
  catch(e){if(e.code==='23505')return redirect(res,'/readers','Email đã tồn tại',true);throw e;}
}));
app.post('/readers/:id/delete', asyncRoute(async(req,res)=>{
  try{const q=await pool.query('DELETE FROM readers WHERE id=$1 RETURNING id',[positiveId(req.params.id)]);redirect(res,'/readers',q.rowCount?'Đã xóa độc giả':'Không tìm thấy độc giả',!q.rowCount);}
  catch(e){if(e.code==='23503')return redirect(res,'/readers','Độc giả đã có lịch sử mượn/trả, không thể xóa',true);throw e;}
}));

app.get('/loans', asyncRoute(async(req,res)=>{
  const [books,readers,loans]=await Promise.all([
    pool.query('SELECT id,title,available_copies FROM books WHERE available_copies>0 ORDER BY title'),
    pool.query('SELECT id,full_name FROM readers ORDER BY full_name'),
    pool.query('SELECT l.*,b.title,r.full_name FROM loans l JOIN books b ON b.id=l.book_id JOIN readers r ON r.id=l.reader_id ORDER BY l.id DESC LIMIT 200')
  ]);
  const options=(items,makeLabel)=>items.map(x=>`<option value="${x.id}">${h(makeLabel(x))}</option>`).join('');
  const form=`<form class="form-grid" action="/loans" method="post"><label>Chọn sách<select name="book_id" required><option value="">-- Chọn sách còn --</option>${options(books.rows,x=>`${x.title} (còn ${x.available_copies})`)}</select></label><label>Chọn độc giả<select name="reader_id" required><option value="">-- Chọn độc giả --</option>${options(readers.rows,x=>x.full_name)}</select></label><label>Hạn trả<input type="date" name="due_date" required></label><button class="btn">+ Tạo phiếu mượn</button></form>`;
  const rows=loans.rows.map(x=>`<tr><td class="id">#${x.id}</td><td><strong>${h(x.title)}</strong></td><td>${h(x.full_name)}</td><td>${date(x.borrowed_at)}</td><td>${date(x.due_date)}</td><td>${x.returned_at?'<span class="pill done">Đã trả</span>':(new Date(x.due_date)<new Date(new Date().toISOString().slice(0,10))?'<span class="pill late">Quá hạn</span>':'<span class="pill pending">Đang mượn</span>')}</td><td>${x.returned_at?date(x.returned_at):`<form method="post" action="/loans/${x.id}/return"><button class="small-btn" onclick="return confirm('Xác nhận trả sách?')">Xác nhận trả</button></form>`}</td></tr>`).join('');
  res.send(page('Quản lý mượn / trả',`<section class="panel"><div class="panel-header"><h2>Lập phiếu mượn sách</h2><span class="hint">Chỉ hiển thị sách còn bản có thể mượn</span></div>${form}</section><section class="panel"><div class="panel-header"><h2>Lịch sử giao dịch</h2></div>${table(['Mã','Sách','Độc giả','Ngày mượn','Hạn trả','Trạng thái','Thao tác'],rows)}</section>`,'/loans',feedback(req),hasError(req)));
}));
app.post('/loans', asyncRoute(async(req,res)=>{
  const bookId=positiveId(req.body.book_id),readerId=positiveId(req.body.reader_id),due=text(req.body.due_date,10);
  if(!bookId||!readerId||!/^\d{4}-\d{2}-\d{2}$/.test(due)||due<new Date().toISOString().slice(0,10))return redirect(res,'/loans','Sách, độc giả hoặc hạn trả không hợp lệ',true);
  const conn=await pool.connect();
  try {
    await conn.query('BEGIN');
    const q=await conn.query('SELECT available_copies FROM books WHERE id=$1 FOR UPDATE',[bookId]);
    if(!q.rows.length||q.rows[0].available_copies<1)throw new Error('Sách không còn bản để mượn');
    const r=await conn.query('SELECT id FROM readers WHERE id=$1',[readerId]);
    if(!r.rows.length)throw new Error('Không tìm thấy độc giả');
    await conn.query('INSERT INTO loans(book_id,reader_id,due_date) VALUES($1,$2,$3)',[bookId,readerId,due]);
    await conn.query('UPDATE books SET available_copies=available_copies-1 WHERE id=$1',[bookId]);
    await conn.query('COMMIT');redirect(res,'/loans','Đã tạo phiếu mượn và trừ tồn kho');
  } catch(e){await conn.query('ROLLBACK');redirect(res,'/loans',e.message,true);}
  finally{conn.release();}
}));
app.post('/loans/:id/return', asyncRoute(async(req,res)=>{
  const id=positiveId(req.params.id);if(!id)return redirect(res,'/loans','Mã phiếu không hợp lệ',true);
  const conn=await pool.connect();
  try {
    await conn.query('BEGIN');
    const q=await conn.query('SELECT book_id,returned_at FROM loans WHERE id=$1 FOR UPDATE',[id]);
    if(!q.rows.length||q.rows[0].returned_at)throw new Error('Phiếu không tồn tại hoặc đã trả');
    await conn.query('UPDATE loans SET returned_at=now() WHERE id=$1',[id]);
    await conn.query('UPDATE books SET available_copies=available_copies+1 WHERE id=$1',[q.rows[0].book_id]);
    await conn.query('COMMIT');redirect(res,'/loans','Trả sách thành công, tồn kho đã tăng');
  } catch(e){await conn.query('ROLLBACK');redirect(res,'/loans',e.message,true);}
  finally{conn.release();}
}));
app.use((req,res)=>res.status(404).send(page('Không tìm thấy trang','<section class="panel"><p>Đường dẫn không tồn tại.</p><a href="/">Về trang chủ</a></section>','')));
app.use((err,req,res,next)=>{
  console.error(JSON.stringify({time:new Date().toISOString(),level:'error',message:err.message,code:err.code}));
  if(res.headersSent)return next(err);
  res.status(500).send(page('Có lỗi xảy ra','<section class="panel"><p>Yêu cầu không thể hoàn thành. Kiểm tra log container website.</p><a href="/">Về trang chủ</a></section>',''));
});
app.listen(PORT,'0.0.0.0',()=>console.log(`Library app listening port ${PORT}`));
