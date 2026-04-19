-- Perfil: sexualidade e data de nascimento (picture já existia)

ALTER TABLE users ADD COLUMN IF NOT EXISTS sexuality TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE;
