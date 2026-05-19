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

    console.log('[MIGRATIONS] Todas las migraciones aplicadas.');
  } catch (err) {
    console.error('[MIGRATIONS] ERROR:', err.message);
    // No frenar el arranque del servidor por esto
  }
}

module.exports = { correrMigraciones };
