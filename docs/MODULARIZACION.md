# Modularización AgendaMóvil

Plan de modularización progresiva para reducir el peso de `backend/public/index.html` y `backend/public/app.js` sin romper producción.

## Fase 1 — Servicios

Estado: iniciado y funcional.

### Hecho

- Se creó `backend/public/modules/servicios-form.js` como base del módulo UI de servicios.
- Se mantuvieron los IDs actuales del formulario para no romper `app.js`.
- Se corrigió el flujo visual de alta/edición de servicio para que quede:
  1. Categoría
  2. Nombre del servicio
  3. Precio
- Se actualizó el texto de ayuda de categoría.
- Se actualizaron placeholders comerciales para categoría y nombre del servicio.
- El ajuste se ejecuta temprano desde `backend/public/color-utils.js`, que carga antes de `app.js`.

### Pendiente técnico

- En una siguiente fase, mover la carga completa del modal desde `index.html` hacia `modules/servicios-form.js`.
- Dejar `index.html` solo como estructura base.

## Fase 2 — Servicios render/actions

- Extraer renderizado de servicios.
- Separar acciones de servicios: crear, editar, eliminar, foto y sucursales.

## Fase 3 — Agenda

- Separar lógica de turnos.
- Separar cálculo de disponibilidad.
- Separar render diario/mensual.

## Fase 4 — Clientes y fichas

- Separar clientes.
- Separar fichas clínicas.
- Separar cumpleaños.
