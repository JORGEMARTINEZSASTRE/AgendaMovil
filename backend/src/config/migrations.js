'use strict';

const { query } = require('./db');

/**
 * Corre migraciones idempotentes al arrancar el servidor.
 * Usa IF NOT EXISTS / ADD COLUMN IF NOT EXISTS para que sea seguro
 * correrlo múltiples veces.
 */
async function correrMigraciones() {
  console.log('[MIGRATIONS] Verificando migraciones pendientes...');

  try {
    // ── 1. Tabla profesionales ─────────────────────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS public.profesionales (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
        nombre      VARCHAR(100) NOT NULL,
        telefono    VARCHAR(50),
        color       VARCHAR(7) DEFAULT '#A85568',
        activo      BOOLEAN DEFAULT true,
        creado_en   TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('[MIGRATIONS] ✓ Tabla profesionales OK');

    // ── 2. Columnas profesional_id / profesional_nombre en turnos ──────
    await query(`
      ALTER TABLE public.turnos
        ADD COLUMN IF NOT EXISTS profesional_id     UUID REFERENCES public.profesionales(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS profesional_nombre VARCHAR(100)
    `);
    console.log('[MIGRATIONS] ✓ Columnas profesional en turnos OK');

    // ── 3. Columna sucursal_id en turnos (si falta) ────────────────────
    await query(`
      ALTER TABLE public.turnos
        ADD COLUMN IF NOT EXISTS sucursal_id UUID
    `);
    console.log('[MIGRATIONS] ✓ Columna sucursal_id en turnos OK');

    // ── 4. Horarios semanales por profesional ──────────────────────────
    // dia_semana: 0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb
    // Permite múltiples bloques por día (ej: 8-12 y 15-19)
    await query(`
      CREATE TABLE IF NOT EXISTS public.horarios_profesional (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        profesional_id  UUID NOT NULL REFERENCES public.profesionales(id) ON DELETE CASCADE,
        dia_semana      SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
        hora_inicio     TIME NOT NULL,
        hora_fin        TIME NOT NULL
      )
    `);
    // Si ya existía con UNIQUE de la versión anterior, lo dropeamos
    await query(`
      ALTER TABLE public.horarios_profesional
        DROP CONSTRAINT IF EXISTS horarios_profesional_profesional_id_dia_semana_key
    `);
    console.log('[MIGRATIONS] ✓ Tabla horarios_profesional OK');

    // ── 5. Bloqueos de días específicos por profesional ────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS public.bloqueos_profesional (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        profesional_id  UUID NOT NULL REFERENCES public.profesionales(id) ON DELETE CASCADE,
        fecha           DATE NOT NULL,
        motivo          VARCHAR(200),
        creado_en       TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (profesional_id, fecha)
      )
    `);
    console.log('[MIGRATIONS] ✓ Tabla bloqueos_profesional OK');

    // ── 6. Tabla clientes (agregar manual + estrella favorito) ─────────
    await query(`
      CREATE TABLE IF NOT EXISTS public.clientes (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
        nombre      VARCHAR(255) NOT NULL,
        telefono    VARCHAR(50) NOT NULL,
        favorito    BOOLEAN DEFAULT false,
        creado_en   TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (user_id, telefono)
      )
    `);
    console.log('[MIGRATIONS] ✓ Tabla clientes OK');

    // ── 7. Columnas de servicios agregadas a mano fuera del schema ─────
    // El código las usa (crear/listar servicios, agenda pública, vitrina)
    // pero no estaban en schema.sql ni acá: si a una base le faltan,
    // el alta de servicios y la reserva pública fallan con 500.
    await query(`
      ALTER TABLE public.servicios
        ADD COLUMN IF NOT EXISTS categoria    VARCHAR(100) DEFAULT 'General',
        ADD COLUMN IF NOT EXISTS precio       NUMERIC(10,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS foto_url     TEXT,
        ADD COLUMN IF NOT EXISTS sucursal_ids UUID[] DEFAULT '{}'
    `);
    console.log('[MIGRATIONS] ✓ Columnas extra en servicios OK');

    // ── 8. Galería de fotos por servicio (vitrina) ─────────────────────
    // servicios.foto_url se mantiene como foto de portada para no romper
    // lo que ya la usa; esta tabla guarda todas las fotos, la de portada
    // incluida, con su orden.
    await query(`
      CREATE TABLE IF NOT EXISTS public.servicio_fotos (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        servicio_id UUID NOT NULL REFERENCES public.servicios(id) ON DELETE CASCADE,
        url         TEXT NOT NULL,
        orden       SMALLINT NOT NULL DEFAULT 0,
        creado_en   TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_servicio_fotos_servicio
        ON public.servicio_fotos (servicio_id, orden)
    `);

    // Backfill: pasar las foto_url que ya existen a la galería.
    // El NOT EXISTS lo hace idempotente: no duplica si ya se corrió.
    await query(`
      INSERT INTO public.servicio_fotos (servicio_id, url, orden)
      SELECT s.id, s.foto_url, 0
        FROM public.servicios s
       WHERE s.foto_url IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM public.servicio_fotos f WHERE f.servicio_id = s.id
         )
    `);
    console.log('[MIGRATIONS] ✓ Tabla servicio_fotos OK');

    console.log('[MIGRATIONS] Todas las migraciones aplicadas.');
  } catch (err) {
    console.error('[MIGRATIONS] ERROR:', err.message);
    // No frenar el arranque del servidor por esto
  }
}

module.exports = { correrMigraciones };
