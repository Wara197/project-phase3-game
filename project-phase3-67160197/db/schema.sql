CREATE DATABASE IF NOT EXISTS boardgame_db;
USE boardgame_db;

CREATE TABLE boardgames (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  min_players INT NOT NULL,
  max_players INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_boardgame_name (name)
);

CREATE TABLE members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  phone VARCHAR(20) NOT NULL
);

CREATE TABLE borrowings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  member_id INT NOT NULL,
  boardgame_id INT NOT NULL,
  borrow_date DATE NOT NULL,
  return_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'BORROWED',
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (boardgame_id) REFERENCES boardgames(id) ON DELETE CASCADE,
  UNIQUE KEY unique_active_borrowing (member_id, boardgame_id, borrow_date)
);