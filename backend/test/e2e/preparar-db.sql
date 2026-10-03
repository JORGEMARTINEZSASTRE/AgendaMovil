-- Base de PRUEBA para el test de punta a punta (nunca correr en producción).
--
-- database/schema.sql está desactualizado: estas tablas y columnas se
-- crearon a mano en producción y no las crean las migraciones. Esto es
-- una reconstrucción con lo que usa el código, alcanza para probar.
--
-- Pasos:
--   createdb agenda_test
--   psql -d agenda_test -c "create role depimovil_user"
--   psql -d agenda_test -f backend/database/schema.sql
--   psql -d agenda_test -f backend/test/e2e/preparar-db.sql
--   (arrancar el server una vez con NODE_ENV=test para que corran las migraciones)
--   BASE=http://localhost:3001 npm run test:e2e

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS sucursales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre varchar(100) NOT NULL,
  tipo varchar(20) DEFAULT 'sucursal',
  horarios jsonb DEFAULT '[]'::jsonb,
  max_turnos_hora int DEFAULT 1,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wa_pendientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES usuarios(id) ON DELETE CASCADE,
  turno_id uuid, tipo varchar(40), destinatario_nombre varchar(255),
  destinatario_telefono varchar(50), mensaje text, fecha_evento timestamptz,
  enviado boolean DEFAULT false, enviado_en timestamptz,
  creado_en timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS whatsapp_sesiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES usuarios(id) ON DELETE CASCADE,
  instance_name varchar(100) UNIQUE, estado varchar(30), telefono varchar(50),
  actualizado_en timestamptz DEFAULT now(), creado_en timestamptz DEFAULT now()
);

ALTER TABLE usuarios  ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE servicios ADD COLUMN IF NOT EXISTS sucursal_ids uuid[] NOT NULL DEFAULT '{}';
