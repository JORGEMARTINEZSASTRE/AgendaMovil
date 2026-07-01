'use strict';

const router = require('express').Router();
const { body, param } = require('express-validator');

const ctrl = require('../controllers/sucursales.controller');
const { autenticar } = require('../middleware/auth');
const { planActivo } = require('../middleware/planGuard');
const { validar } = require('../middleware/validate');

router.use(autenticar);
router.use(planActivo);

const validarIdSucursal = [param('id').isUUID().withMessage('ID inválido')];

router.get('/', ctrl.listar);

router.post('/',
  ctrl.crear
);

router.get('/:id/horarios',
  validarIdSucursal,
  validar,
  ctrl.obtenerHorarios
);

router.put('/:id/horarios',
  validarIdSucursal,
  validar,
  ctrl.guardarHorarios
);

router.patch('/:id/activo',
  [
    ...validarIdSucursal,
    body('activo').isBoolean().withMessage('Activo debe ser true o false'),
  ],
  validar,
  ctrl.cambiarActivo
);

router.delete('/:id',
  validarIdSucursal,
  validar,
  ctrl.eliminar
);

module.exports = router;
