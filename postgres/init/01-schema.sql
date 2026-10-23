CREATE TABLE books (
  id SERIAL PRIMARY KEY,
  isbn VARCHAR(30) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  author VARCHAR(160) NOT NULL,
  category VARCHAR(100) NOT NULL DEFAULT 'Khac',
  published_year INT,
  total_copies INT NOT NULL CHECK (total_copies > 0),
  available_copies INT NOT NULL CHECK (available_copies >= 0 AND available_copies <= total_copies),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE readers (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(200) NOT NULL UNIQUE,
  phone VARCHAR(30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE loans (
  id SERIAL PRIMARY KEY,
  book_id INT NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
  reader_id INT NOT NULL REFERENCES readers(id) ON DELETE RESTRICT,
  borrowed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_date DATE NOT NULL,
  returned_at TIMESTAMPTZ
);
CREATE INDEX loans_open_idx ON loans (returned_at, due_date);
INSERT INTO books (isbn,title,author,category,published_year,total_copies,available_copies) VALUES
('9786040000011','Dac Nhan Tam','Dale Carnegie','Ky nang',2020,6,6),
('9786040000028','Nha Gia Kim','Paulo Coelho','Tieu thuyet',2018,5,5),
('9786040000035','Tuoi Tre Dang Gia Bao Nhieu','Rosie Nguyen','Ky nang',2019,4,4),
('9786040000042','Lap Trinh Python Co Ban','Nhom bien soan','Cong nghe',2023,8,8),
('9786040000059','Co So Du Lieu','Nhom bien soan','Cong nghe',2022,7,7);
INSERT INTO readers (full_name,email,phone) VALUES
('Nguyen Van An','an@example.local','0912345678'),
('Tran Thi Binh','binh@example.local','0987654321'),
('Le Minh Chau','chau@example.local','0900000001');
