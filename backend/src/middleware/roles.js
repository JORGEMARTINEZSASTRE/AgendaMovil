'use strict';

/**
 * Solo permite acceso a administradores.
 * Usar SIEMPRE después de autenticar().
 */
function soloAdmin(req, res, next) {
  if (!req.user || req.user.rol !== 'admin') {
    return res.status(403).json({
      ok: false,
      error: 'Acceso restringido a administradores'
    });
  }
  next();
}

/**
 * Permite acceso a admin Y al propio usuario.
 * Útil para rutas donde el usuario puede ver sus propios datos.
 */
function adminOPropioUsuario(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ ok: false, error: 'No autenticado' });
  }
  const esAdmin    = req.user.rol === 'admin';
  const esPropioId = req.params.userId === req.user.id;

  if (!esAdmin && !esPropioId) {
    return res.status(403).json({
      ok: false,
      error: 'Sin permisos para este recurso'
    });
  }
  next();
}

module.exports = { soloAdmin, adminOPropioUsuario };