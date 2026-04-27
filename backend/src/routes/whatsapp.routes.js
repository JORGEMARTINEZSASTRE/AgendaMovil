'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/whatsapp.controller');
const { autenticar } = require('../middleware/auth');

router.use(autenticar);

router.get('/estado', ctrl.obtenerEstado);
router.post('/conectar', ctrl.conectar);
router.post('/desconectar', ctrl.desconectar);
router.post('/test', ctrl.enviarTest);

module.exports = router;