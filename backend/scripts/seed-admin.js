'use strict';

require('dotenv').config({ path: `${__dirname}/../.env` });

const bcrypt      = require('bcryptjs');
const { query, pool } = require('../src/config/db');

async function seedAdmin() {
  console.log('🌸 DEPIMÓVIL PRO — Creando administrador inicial...\n');

  const email    = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const nombre   = process.env.ADMIN_NOMBRE || 'Administrador';

  // ─── Validar variables de entorno ───────────────────────
  if (!email || !password) {
    console.error('❌ Faltan ADMIN_EMAIL o ADMIN_PASSWORD en el .env');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('❌ ADMIN_PASSWORD debe tener al menos 8 caracteres');
    process.exit(1);
  }

  try {
    // ─── Verificar si ya existe ──────────────────────────
    const { rows: existente } = await query(
      `SELECT id, email FROM usuarios WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    if (existente.length > 0) {
      console.log(`⚠️  Ya existe un usuario con el email: ${email}`);
      console.log(`   ID: ${existente[0].id}`);
      console.log('\n¿Querés actualizar la contraseña? Ejecutá el script con UPDATE=true');

      if (process.env.UPDATE === 'true') {
        const passwordHash = await bcrypt.hash(password, 12);
        await query(
          `UPDATE usuarios SET password_hash = $1 WHERE email = $2`,
          [passwordHash, email.toLowerCase().trim()]
        );
        console.log('✅ Contraseña actualizada exitosamente');
      }

      await pool.end();
      return;
    }

    // ─── Hashear contraseña ──────────────────────────────
    console.log('🔐 Hasheando contraseña...');
    const passwordHash = await bcrypt.hash(password, 12);

    // ─── Crear admin ─────────────────────────────────────
    const { rows } = await query(
      `INSERT INTO usuarios
         (email, password_hash, nombre, rol, plan, activo)
       VALUES ($1, $2, $3, 'admin', 'premium', true)
       RETURNING id, email, nombre, rol, plan, creado_en`,
      [email.toLowerCase().trim(), passwordHash, nombre]
    );

    const admin = rows[0];

    console.log('✅ Administrador creado exitosamente:\n');
    console.log(`   ID:       ${admin.id}`);
    console.log(`   Email:    ${admin.email}`);
    console.log(`   Nombre:   ${admin.nombre}`);
    console.log(`   Rol:      ${admin.rol}`);
    console.log(`   Plan:     ${admin.plan}`);
    console.log(`   Creado:   ${admin.creado_en}`);
    console.log('\n🔑 Guardá estas credenciales en un lugar seguro.');
    console.log('⚠️  Cambiá la contraseña después del primer login.\n');

  } catch (err) {
    console.error('❌ Error al crear administrador:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedAdmin();