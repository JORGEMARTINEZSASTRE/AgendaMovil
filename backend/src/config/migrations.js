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
    await query(`
      CREATE TABLE IF NOT EXISTS public.horarios_profesional (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        profesional_id  UUID NOT NULL REFERENCES public.profesionales(id) ON DELETE CASCADE,
        dia_semana      SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
        hora_inicio     TIME NOT NULL,
        hora_fin        TIME NOT NULL,
        UNIQUE (profesional_id, dia_semana)
      )
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

    console.log('[MIGRATIONS] Todas las migraciones aplicadas.');
  } catch (err) {
    console.error('[MIGRATIONS] ERROR:', err.message);
    // No frenar el arranque del servidor por esto
  }
}

module.exports = { correrMigraciones };
