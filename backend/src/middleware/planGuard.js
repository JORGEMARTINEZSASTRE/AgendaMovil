'use strict';

/**
 * Verifica que el usuario tenga un plan activo.
 * Bloquea si el trial venció y no es premium.
 * Usar DESPUÉS de autenticar().
 */
function planActivo(req, res, next) {
  const u = req.user;

  // Admin siempre pasa
  if (u.rol === 'admin') return next();

  // Premium siempre pasa
  if (u.plan === 'premium') return next();

  // Trial: verificar vencimiento
  if (u.plan === 'trial') {
    if (!u.trial_fin) {
      return res.status(403).json({
        ok:    false,
        error: 'Plan no configurado. Contactá al administrador.',
        code:  'PLAN_NO_CONFIGURADO',
      });
    }

    const ahora    = new Date();
    const trialFin = new Date(u.trial_fin);

    if (ahora > trialFin) {
      return res.status(403).json({
        ok:    false,
        error: 'Tu período de prueba venció. Contactá al administrador para continuar.',
        code:  'TRIAL_VENCIDO',
      });
    }

    // Trial activo — agregar días restantes al request
    const diasRestantes = Math.ceil((trialFin - ahora) / (1000 * 60 * 60 * 24));
    req.diasTrialRestantes = diasRestantes;
    return next();
  }

  // Plan desconocido
  return res.status(403).json({
    ok:    false,
    error: 'Plan inválido. Contactá al administrador.',
    code:  'PLAN_INVALIDO',
  });
}

module.exports = { planActivo };