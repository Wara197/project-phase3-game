USE boardgame_db;

INSERT INTO boardgames (name, min_players, max_players) VALUES
  ('Catan', 3, 4),
  ('Codenames', 4, 8),
  ('Uno', 2, 10);

INSERT INTO members (name, email, phone) VALUES
  ('สมชาย ใจดี', 'somchai@example.com', '0891234567'),
  ('สมหญิง รักเรียน', 'somying@example.com', '0899876543'),
  ('มานะ พากเพียร', 'mana@example.com', '0812223344');

INSERT INTO borrowings (member_id, boardgame_id, borrow_date, return_date, status) VALUES
  (1, 1, '2026-08-10', '2026-08-17', 'RETURNED'),
  (1, 2, '2026-08-20', NULL, 'BORROWED'),
  (2, 3, '2026-08-22', NULL, 'BORROWED');