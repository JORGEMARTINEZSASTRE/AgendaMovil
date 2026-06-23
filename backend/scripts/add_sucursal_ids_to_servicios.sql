-- Migración: agregar sucursal_ids a servicios
-- sucursal_ids vacío = disponible en todas las sucursales
ALTER TABLE servicios
  ADD COLUMN IF NOT EXISTS sucursal_ids uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_servicios_sucursal_ids
  ON servicios USING GIN (sucursal_ids);
