'use strict';

require('dotenv').config();
require('./src/config/env');

const app  = require('./src/app');
const port = parseInt(process.env.PORT) || 3001;
require('./recordatorios'); // antes de app.listen 

app.listen(port, () => {
  console.log(`🌸 DEPIMÓVIL PRO Backend corriendo en puerto ${port}`);
  console.log(`   Entorno: ${process.env.NODE_ENV || 'development'}`);
});