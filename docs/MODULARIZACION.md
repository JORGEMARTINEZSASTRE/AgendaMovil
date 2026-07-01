# Modularización AgendaMóvil

Plan de modularización progresiva para reducir el peso de `backend/public/index.html` y `backend/public/app.js` sin romper producción.

## Fase 1

- Extraer modal de servicios a `backend/public/modules/servicios-form.js`.
- Mantener IDs actuales para no romper `app.js`.
- Reordenar flujo de alta de servicio: Categoría primero, nombre del servicio después.

## Fase 2

- Extraer renderizado de servicios.
- Separar lógica de turnos.
- Separar clientes y fichas clínicas.
