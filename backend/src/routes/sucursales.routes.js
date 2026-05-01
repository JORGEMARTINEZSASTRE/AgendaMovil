'use strict';

const router = require('express').Router();
const { param } = require('express-validator');

const ctrl = require('../controllers/sucursales.controller');
const { autenticar } = require('../middleware/auth');
const { planActivo } = require('../middleware/planGuard');
const { validar } = require('../middleware/validate');

router.use(autenticar);
router.use(planActivo);

router.get('/', ctrl.listar);

router.post('/',
  ctrl.crear
);

router.get('/:id/horarios',
  [param('id').isUUID().withMessage('ID inválido')],
  validar,
  ctrl.obtenerHorarios
);

router.put('/:id/horarios',
  [param('id').isUUID().withMessage('ID inválido')],
  validar,
  ctrl.guardarHorarios
);

module.exports = router;
