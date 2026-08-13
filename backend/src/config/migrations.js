'use strict';

const { query } = require('./db');

/**
 * Corre migraciones idempotentes al arrancar el servidor.
 * Usa IF NOT EXISTS / ADD COLUMN IF NOT EXISTS para que sea seguro
 * correrlo múltiples veces.
 */
async function correrMigraciones() {
  console.log('[MIGRATIONS] Verificando migraciones pendientes...');

  try {
    // ── 1. Tabla profesionales ─────────────────────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS public.profesionales (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
        nombre      VARCHAR(100) NOT NULL,
        telefono    VARCHAR(50),
        color       VARCHAR(7) DEFAULT '#A85568',
        activo      BOOLEAN DEFAULT true,
        creado_en   TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('[MIGRATIONS] ✓ Tabla profesionales OK');

    // ── 2. Columnas profesional_id / profesional_nombre en turnos ──────
    await query(`
      ALTER TABLE public.turnos
        ADD COLUMN IF NOT EXISTS profesional_id     UUID REFERENCES public.profesionales(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS profesional_nombre VARCHAR(100)
    `);
    console.log('[MIGRATIONS] ✓ Columnas profesional en turnos OK');

    // ── 3. Columna sucursal_id en turnos (si falta) ────────────────────
    await query(`
      ALTER TABLE public.turnos
        ADD COLUMN IF NOT EXISTS sucursal_id UUID
    `);
    console.log('[MIGRATIONS] ✓ Columna sucursal_id en turnos OK');

    // ── 4. Horarios semanales por profesional ──────────────────────────
    // dia_semana: 0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb
    // Permite múltiples bloques por día (ej: 8-12 y 15-19)
    await query(`
      CREATE TABLE IF NOT EXISTS public.horarios_profesional (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        profesional_id  UUID NOT NULL REFERENCES public.profesionales(id) ON DELETE CASCADE,
        dia_semana      SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
        hora_inicio     TIME NOT NULL,
        hora_fin        TIME NOT NULL
      )
    `);
    // Si ya existía con UNIQUE de la versión anterior, lo dropeamos
    await query(`
      ALTER TABLE public.horarios_profesional
        DROP CONSTRAINT IF EXISTS horarios_profesional_profesional_id_dia_semana_key
    `);
    console.log('[MIGRATIONS] ✓ Tabla horarios_profesional OK');

    // ── 5. Bloqueos de días específicos por profesional ────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS public.bloqueos_profesional (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        profesional_id  UUID NOT NULL REFERENCES public.profesionales(id) ON DELETE CASCADE,
        fecha           DATE NOT NULL,
        motivo          VARCHAR(200),
        creado_en       TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (profesional_id, fecha)
      )
    `);
    console.log('[MIGRATIONS] ✓ Tabla bloqueos_profesional OK');

    // ── 6. Tabla clientes (agregar manual + estrella favorito) ─────────
    await query(`
      CREATE TABLE IF NOT EXISTS public.clientes (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
        nombre      VARCHAR(255) NOT NULL,
        telefono    VARCHAR(50) NOT NULL,
        favorito    BOOLEAN DEFAULT false,
        creado_en   TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (user_id, telefono)
      )
    `);
    // El cumpleaños vivía sólo en el turno, así que se perdía cuando la
    // clienta dejaba de venir. Acá queda pegado a la persona.
    // Va en su propio try: si esto falla, las migraciones que siguen
    // —entre ellas las columnas de servicios— tienen que correr igual.
    try {
      await query(`
        ALTER TABLE public.clientes
          ADD COLUMN IF NOT EXISTS cumple_dia SMALLINT,
          ADD COLUMN IF NOT EXISTS cumple_mes SMALLINT
      `);
    } catch (e) {
      console.error('[MIGRATIONS] clientes: cumpleaños no agregado:', e.message);
    }
    // Backfill: hasta ahora la lista de clientas se llenaba sólo a mano,
    // así que las que reservaron por el link no figuraban en ningún lado.
    // Se rescatan de los turnos que ya existen, quedándose con el nombre
    // del turno más nuevo de cada teléfono.
    try {
      const alta = await query(`
        INSERT INTO public.clientes (user_id, nombre, telefono)
        SELECT DISTINCT ON (t.user_id, t.telefono)
               t.user_id, t.nombre, t.telefono
          FROM public.turnos t
         WHERE t.telefono IS NOT NULL AND t.telefono <> ''
           AND t.nombre   IS NOT NULL AND t.nombre   <> ''
         ORDER BY t.user_id, t.telefono, t.creado_en DESC NULLS LAST
        ON CONFLICT (user_id, telefono) DO NOTHING
      `);

      // El cumpleaños vivía en el turno: se pasa a la ficha de la clienta.
      const cumples = await query(`
        UPDATE public.clientes c
           SET cumple_dia = s.cumple_dia,
               cumple_mes = s.cumple_mes
          FROM (
            SELECT DISTINCT ON (user_id, telefono)
                   user_id, telefono, cumple_dia, cumple_mes
              FROM public.turnos
             WHERE cumple_dia IS NOT NULL AND cumple_mes IS NOT NULL
             ORDER BY user_id, telefono, creado_en DESC NULLS LAST
          ) s
         WHERE c.user_id = s.user_id
           AND c.telefono = s.telefono
           AND c.cumple_dia IS NULL
      `);

      console.log(`[MIGRATIONS] ✓ clientes: ${alta.rowCount} alta(s) desde turnos, ` +
                  `${cumples.rowCount} cumpleaños rescatado(s)`);
    } catch (e) {
      // Que no frene el arranque: la app sirve igual sin el backfill.
      console.error('[MIGRATIONS] clientes: backfill no realizado:', e.message);
    }
    console.log('[MIGRATIONS] ✓ Tabla clientes OK');

    // ── 7. Columnas de servicios agregadas a mano fuera del schema ─────
    // El código las usa (crear/listar servicios, agenda pública, vitrina)
    // pero no estaban en schema.sql ni acá: si a una base le faltan,
    // el alta de servicios y la reserva pública fallan con 500.
    await query(`
      ALTER TABLE public.servicios
        ADD COLUMN IF NOT EXISTS categoria    VARCHAR(100) DEFAULT 'General',
        ADD COLUMN IF NOT EXISTS precio       NUMERIC(10,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS foto_url     TEXT,
        ADD COLUMN IF NOT EXISTS sucursal_ids UUID[] DEFAULT '{}'
    `);
    console.log('[MIGRATIONS] ✓ Columnas extra en servicios OK');

    // ── 8. Galería de fotos por servicio (vitrina) ─────────────────────
    // servicios.foto_url se mantiene como foto de portada para no romper
    // lo que ya la usa; esta tabla guarda todas las fotos, la de portada
    // incluida, con su orden.
    await query(`
      CREATE TABLE IF NOT EXISTS public.servicio_fotos (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        servicio_id UUID NOT NULL REFERENCES public.servicios(id) ON DELETE CASCADE,
        url         TEXT NOT NULL,
        orden       SMALLINT NOT NULL DEFAULT 0,
        creado_en   TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_servicio_fotos_servicio
        ON public.servicio_fotos (servicio_id, orden)
    `);

    // Backfill: pasar las foto_url que ya existen a la galería.
    // El NOT EXISTS lo hace idempotente: no duplica si ya se corrió.
    await query(`
      INSERT INTO public.servicio_fotos (servicio_id, url, orden)
      SELECT s.id, s.foto_url, 0
        FROM public.servicios s
       WHERE s.foto_url IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM public.servicio_fotos f WHERE f.servicio_id = s.id
         )
    `);
    console.log('[MIGRATIONS] ✓ Tabla servicio_fotos OK');

    // ── 9. Reparar teléfonos con el código de país duplicado ───────────
    // Un bug de normalización anteponía '598' a números que YA lo tenían,
    // dejándolos como +59859899921164. WhatsApp los rechaza por inválidos.
    //
    // Esto NO borra ninguna fila ni ningún dato: solo le saca al teléfono
    // los 3 dígitos sobrantes. El WHERE solo alcanza a los que empiezan
    // con 598598, así que un número correcto nunca se toca. Y es
    // idempotente: después de la primera corrida ya no queda ninguno.
    // Son dos daños distintos, del mismo origen: había cuatro versiones
    // de la normalización y cada una armaba el número a su manera.
    //
    //   a) '598598...'  el código de país quedó dos veces.
    //   b) '5980...'    quedó un cero pegado después del código. Ningún
    //                   número uruguayo real empieza con 0 después del
    //                   598 (los móviles van con 9 y los fijos con 2 o 4),
    //                   así que el patrón no puede tocar uno bueno.
    //
    // Ninguna borra filas ni datos: solo sacan los dígitos sobrantes. Y
    // son idempotentes: después de la primera corrida no queda ninguno.
    const DIGITOS = `regexp_replace(telefono, '\\D', '', 'g')`;
    const REPARACIONES = [
      {
        nombre:   'codigo de pais duplicado',
        roto:     `${DIGITOS} LIKE '598598%'`,
        reparado: `'+' || substring(${DIGITOS} from 4)`,
      },
      {
        nombre:   'cero pegado al codigo de pais',
        roto:     `${DIGITOS} LIKE '5980%'`,
        reparado: `'+598' || ltrim(substring(${DIGITOS} from 4), '0')`,
      },
    ];

    for (const rep of REPARACIONES) {
      // turnos: sin restricción de unicidad, se reparan todos.
      try {
        const { rows } = await query(
          `SELECT COUNT(*)::int AS total FROM public.turnos WHERE ${rep.roto}`
        );
        if (rows[0].total > 0) {
          const r = await query(
            `UPDATE public.turnos SET telefono = ${rep.reparado} WHERE ${rep.roto}`
          );
          console.log(`[MIGRATIONS] ✓ turnos (${rep.nombre}): ${r.rowCount} reparado(s)`);
        } else {
          console.log(`[MIGRATIONS] ✓ turnos (${rep.nombre}): nada que reparar`);
        }
      } catch (e) {
        console.error(`[MIGRATIONS] turnos (${rep.nombre}): no se pudo reparar:`, e.message);
      }

      // clientes: tiene UNIQUE (user_id, telefono). Si ya existe una fila
      // con el número correcto, reparar la rota chocaría contra el índice.
      // Esas se saltean y quedan como están: preferible dejarlas a borrarlas.
      try {
        const { rows } = await query(
          `SELECT COUNT(*)::int AS total FROM public.clientes WHERE ${rep.roto}`
        );
        if (rows[0].total > 0) {
          const r = await query(
            `UPDATE public.clientes c
                SET telefono = ${rep.reparado.replace(/telefono/g, 'c.telefono')}
              WHERE ${rep.roto.replace(/telefono/g, 'c.telefono')}
                AND NOT EXISTS (
                  SELECT 1 FROM public.clientes c2
                   WHERE c2.user_id = c.user_id
                     AND c2.telefono = ${rep.reparado.replace(/telefono/g, 'c.telefono')}
                )`
          );
          const salteadas = rows[0].total - r.rowCount;
          console.log(`[MIGRATIONS] ✓ clientes (${rep.nombre}): ${r.rowCount} reparado(s)` +
            (salteadas > 0 ? `, ${salteadas} salteado(s) por duplicado` : ''));
        } else {
          console.log(`[MIGRATIONS] ✓ clientes (${rep.nombre}): nada que reparar`);
        }
      } catch (e) {
        console.error(`[MIGRATIONS] clientes (${rep.nombre}): no se pudo reparar:`, e.message);
      }
    }

    // ── 9 bis. Ficha clínica ──────────────────────────────────────────
    // Estas dos tablas se habían creado a mano directamente en la base de
    // producción y no estaban en ningún lado del código. Contra una base
    // nueva —un entorno de prueba, una migración de servidor— la ficha
    // clínica reventaba con "relation does not exist" y nadie sabía por qué.
    //
    // Los campos van casi todos como TEXT a propósito: son respuestas de
    // una entrevista, no datos calculables, y así nadie pierde una ficha
    // por escribir "no sabe" donde se esperaba un número.
    try {
      const CAMPOS_FICHA = [
        'nombre','documento','fecha_nacimiento','email','direccion','ocupacion',
        'peso','altura',
        'motivo_principal','zonas_a_tratar','expectativas','tiempo_evolucion',
        'enfermedades_actuales','enfermedades_cronicas','trastornos_hormonales',
        'enfermedades_dermatologicas','alergias','medicacion_actual',
        'embarazo_lactancia','cirugias_previas','implantes_protesis',
        'tratamientos_previos','depilacion_laser_ipl','uso_aparatologia',
        'peelings_dermapen_prp','reacciones_adversas','frecuencia_tratamientos',
        'exposicion_solar','uso_protector_solar','tabaquismo','alcohol',
        'actividad_fisica','alimentacion','consumo_agua','tipo_piel',
        'fototipo_fitzpatrick','hidratacion','elasticidad','sebo',
        'alteraciones_presentes','diagnostico_estetico','objetivo',
        'tratamientos_indicados','zonas_plan','frecuencia_plan','duracion_plan',
        'combinacion_tecnicas','respuesta_tratamiento','cambios_observados',
        'ajustes','procedimiento_explicado','riesgos_informados','firma_paciente',
        'firma_profesional','fecha_consentimiento','zona_documentada',
        'rutina_cosmetica','cuidados_post','recomendaciones','observaciones_generales',
      ];

      await query(`
        CREATE TABLE IF NOT EXISTS public.fichas_clinicas (
          id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id    UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
          telefono   VARCHAR(50) NOT NULL,
          creado_en  TIMESTAMPTZ DEFAULT NOW(),
          editado_en TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE (user_id, telefono)
        )
      `);

      // Se agregan de a una: así corre igual contra la tabla que ya existe
      // en producción, a la que le faltan peso y altura.
      for (const campo of CAMPOS_FICHA) {
        await query(`ALTER TABLE public.fichas_clinicas ADD COLUMN IF NOT EXISTS ${campo} TEXT`);
      }

      await query(`
        CREATE TABLE IF NOT EXISTS public.sesiones_clinicas (
          id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          ficha_id      UUID NOT NULL REFERENCES public.fichas_clinicas(id) ON DELETE CASCADE,
          turno_id      UUID REFERENCES public.turnos(id) ON DELETE SET NULL,
          fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
          tratamiento   TEXT,
          parametros    TEXT,
          observaciones TEXT,
          profesional   TEXT,
          fotos         TEXT[] DEFAULT '{}',
          creado_en     TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_sesiones_ficha
          ON public.sesiones_clinicas (ficha_id, fecha DESC)
      `);
      console.log('[MIGRATIONS] ✓ Ficha clínica OK (fichas_clinicas + sesiones_clinicas)');
    } catch (e) {
      console.error('[MIGRATIONS] ficha clínica:', e.message);
    }

    // ── 10. Recordatorio de regreso (recompra) ────────────────────────
    // Marca el turno que ya disparó el aviso de "tocaría volver", para
    // que no se le escriba a la misma clienta una y otra vez.
    //
    // Arranque limpio: la columna se crea con DEFAULT TRUE, así los
    // turnos que YA existen quedan marcados como avisados y ninguna
    // clienta vieja recibe un mensaje sorpresa el día del despliegue.
    // Inmediatamente después el default pasa a FALSE, para que los
    // turnos nuevos sí entren en el circuito.
    //
    // No se puede hacer con un UPDATE: correría en cada arranque y
    // marcaría también los turnos que recién cumplen las 3 semanas,
    // con lo cual el recordatorio no se enviaría nunca.
    await query(`
      ALTER TABLE public.turnos
        ADD COLUMN IF NOT EXISTS recordatorio_regreso_enviado BOOLEAN DEFAULT TRUE
    `);
    await query(`
      ALTER TABLE public.turnos
        ALTER COLUMN recordatorio_regreso_enviado SET DEFAULT FALSE
    `);
    console.log('[MIGRATIONS] ✓ Columna recordatorio_regreso_enviado OK (arranque limpio)');

    // ── 11. Seña por porcentaje y seña eximida ────────────────────────
    // senia_tipo: 'monto' (fijo, como hasta ahora) o 'porcentaje' del precio.
    // Se deja 'monto' por defecto para que los servicios que ya existen
    // sigan comportándose igual.
    await query(`
      ALTER TABLE public.servicios
        ADD COLUMN IF NOT EXISTS senia_tipo       VARCHAR(12) DEFAULT 'monto',
        ADD COLUMN IF NOT EXISTS senia_porcentaje NUMERIC(5,2) DEFAULT 0
    `);

    // senia_eximida: la operadora le perdonó la seña a esta clienta.
    // Va en columna propia y no como estado_pago='eximido' para no tener
    // que borrar y recrear la restricción CHECK de estado_pago.
    // Queda distinguible de 'pagada': la plata no entró y los números
    // no deben contarla como cobrada.
    await query(`
      ALTER TABLE public.turnos
        ADD COLUMN IF NOT EXISTS senia_eximida BOOLEAN DEFAULT FALSE
    `);
    console.log('[MIGRATIONS] ✓ Seña por porcentaje y eximición OK');

    // ── 12. Cuponeras: paquetes de sesiones prepagas ──────────────────
    // La clienta paga varias sesiones por adelantado y las va usando.
    //
    // Los datos de la clienta van copiados (nombre y teléfono) porque las
    // clientas que salen de turnos no son filas de ninguna tabla: son un
    // agrupamiento. El nombre del servicio también se copia, para que
    // borrar un servicio no deje la cuponera sin identificar.
    await query(`
      CREATE TABLE IF NOT EXISTS public.cuponeras (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id          UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
        cliente_nombre   VARCHAR(255) NOT NULL,
        cliente_telefono VARCHAR(50)  NOT NULL,
        servicio_id      UUID REFERENCES public.servicios(id) ON DELETE SET NULL,
        servicio_nombre  VARCHAR(255),
        total_sesiones   SMALLINT NOT NULL,
        precio_total     NUMERIC(10,2) DEFAULT 0,
        notas            TEXT,
        activa           BOOLEAN DEFAULT TRUE,
        creada_en        TIMESTAMPTZ DEFAULT NOW(),
        cerrada_en       TIMESTAMPTZ,
        CONSTRAINT cuponeras_total_check CHECK (total_sesiones BETWEEN 1 AND 12)
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_cuponeras_user
        ON public.cuponeras (user_id, activa)
    `);

    // Cada sesión consumida es una fila. Así queda el historial de cuándo
    // se usó cada una, se puede deshacer una carga equivocada, y el
    // contador nunca se desincroniza: las usadas son las filas que hay.
    await query(`
      CREATE TABLE IF NOT EXISTS public.cuponera_usos (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cuponera_id UUID NOT NULL REFERENCES public.cuponeras(id) ON DELETE CASCADE,
        turno_id    UUID REFERENCES public.turnos(id) ON DELETE SET NULL,
        fecha       DATE NOT NULL DEFAULT CURRENT_DATE,
        nota        TEXT,
        creado_en   TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_cuponera_usos_cuponera
        ON public.cuponera_usos (cuponera_id, fecha)
    `);
    console.log('[MIGRATIONS] ✓ Tablas de cuponeras OK');

    // ── Caja: movimientos de plata ─────────────────────────────────────
    // Una fila por cada peso que entra o sale. Es la única fuente de verdad
    // de cuánto facturó: el precio del servicio cambia con el tiempo, así
    // que el monto se copia acá y no se recalcula nunca desde el servicio.
    //
    // turno_id vincula el cobro con el turno, pero es ON DELETE SET NULL:
    // borrar un turno viejo no puede borrar la plata que entró ese día.
    await query(`
      CREATE TABLE IF NOT EXISTS public.movimientos (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id            UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
        tipo               VARCHAR(10)  NOT NULL,
        categoria          VARCHAR(60)  NOT NULL,
        concepto           VARCHAR(200),
        monto              NUMERIC(10,2) NOT NULL,
        medio_pago         VARCHAR(20)  NOT NULL DEFAULT 'efectivo',
        fecha              DATE         NOT NULL DEFAULT CURRENT_DATE,
        turno_id           UUID REFERENCES public.turnos(id) ON DELETE SET NULL,
        cuponera_id        UUID REFERENCES public.cuponeras(id) ON DELETE SET NULL,
        sucursal_id        UUID,
        profesional_id     UUID REFERENCES public.profesionales(id) ON DELETE SET NULL,
        profesional_nombre VARCHAR(100),
        cliente_nombre     VARCHAR(255),
        creado_en          TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT movimientos_tipo_check  CHECK (tipo IN ('ingreso','gasto')),
        CONSTRAINT movimientos_monto_check CHECK (monto > 0),
        CONSTRAINT movimientos_medio_check CHECK (medio_pago IN
          ('efectivo','transferencia','tarjeta','billetera','cuponera'))
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_movimientos_user_fecha
        ON public.movimientos (user_id, fecha DESC)
    `);
    // Un turno no se puede cobrar dos veces. Si toca "cobrado" de nuevo por
    // error, el INSERT falla en vez de duplicar la facturación del día.
    // La seña del mismo turno es otra categoría, así que no choca.
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_movimientos_turno_unico
        ON public.movimientos (turno_id)
        WHERE turno_id IS NOT NULL AND categoria = 'Turno'
    `);
    console.log('[MIGRATIONS] ✓ Tabla movimientos (caja) OK');

    // ── Caja: cobros en $0 ─────────────────────────────────────────────
    // Cuando la clienta viene con cuponera, la plata ya entró el día que
    // la compró. El cobro de ese turno tiene que poder ser $0, si no la
    // caja contaría la misma plata dos veces.
    await query(`
      ALTER TABLE public.movimientos
        DROP CONSTRAINT IF EXISTS movimientos_monto_check
    `);
    await query(`
      ALTER TABLE public.movimientos
        ADD CONSTRAINT movimientos_monto_check CHECK (monto >= 0)
    `);

    // La venta de una cuponera genera un ingreso solo. Este índice evita
    // que se duplique si la operadora guarda dos veces.
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_movimientos_cuponera_unico
        ON public.movimientos (cuponera_id)
        WHERE cuponera_id IS NOT NULL AND categoria = 'Cuponera'
    `);
    console.log('[MIGRATIONS] ✓ Caja: cobros en $0 y venta de cuponera OK');

    // ── Socios ─────────────────────────────────────────────────────────
    // Opcional: si no hay filas activas, la app ni muestra el reparto.
    // El porcentaje se guarda por socio y tiene que sumar 100 entre todos.
    await query(`
      CREATE TABLE IF NOT EXISTS public.socios (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
        nombre     VARCHAR(100) NOT NULL,
        porcentaje NUMERIC(5,2) NOT NULL,
        activo     BOOLEAN DEFAULT TRUE,
        creado_en  TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT socios_porcentaje_check CHECK (porcentaje > 0 AND porcentaje <= 100)
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_socios_user
        ON public.socios (user_id, activo)
    `);
    console.log('[MIGRATIONS] ✓ Tabla socios OK');

    // ── Confirmación del turno con un toque ────────────────────────────
    // El recordatorio de 24h lleva un link con dos botones. La clienta
    // toca y la app se entera al instante: no hace falta leer WhatsApp.
    //
    // El token es lo único que protege ese link, así que es un UUID
    // aleatorio por turno y no el id del turno.
    await query(`
      ALTER TABLE public.turnos
        ADD COLUMN IF NOT EXISTS confirmacion_token  UUID,
        ADD COLUMN IF NOT EXISTS confirmacion_estado VARCHAR(20) DEFAULT 'sin_pedir',
        ADD COLUMN IF NOT EXISTS confirmacion_en     TIMESTAMPTZ
    `);
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_turnos_confirmacion_token
        ON public.turnos (confirmacion_token)
        WHERE confirmacion_token IS NOT NULL
    `);
    console.log('[MIGRATIONS] ✓ Confirmación de turnos OK');

    // ── Aviso automático de pago pendiente ─────────────────────────────
    // Apagado por defecto a propósito: si la operadora cobró en efectivo
    // y no lo marcó en la app, el sistema le reclamaría a una clienta que
    // ya pagó. Eso es peor que no avisar. Que lo prenda ella sabiendo.
    await query(`
      ALTER TABLE public.usuarios
        ADD COLUMN IF NOT EXISTS cobro_aviso_activo  BOOLEAN  DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS cobro_aviso_dias    SMALLINT DEFAULT 3,
        ADD COLUMN IF NOT EXISTS cobro_aviso_repetir SMALLINT DEFAULT 0
    `);
    await query(`
      ALTER TABLE public.turnos
        ADD COLUMN IF NOT EXISTS cobro_avisos       SMALLINT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS cobro_ultimo_aviso TIMESTAMPTZ
    `);
    console.log('[MIGRATIONS] ✓ Aviso de pago pendiente OK');

    // ── Faltas: la clienta no vino ─────────────────────────────────────
    // Va en columna propia y no en `estado` para no tocar la restricción
    // CHECK, y sobre todo para que el turno siga apareciendo en la agenda
    // del día con su etiqueta: la operadora quiere ver que ese hueco
    // existió, no que desaparezca.
    await query(`
      ALTER TABLE public.turnos
        ADD COLUMN IF NOT EXISTS no_vino    BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS no_vino_en TIMESTAMPTZ
    `);
    // Las faltas se cuentan por teléfono: las clientas no son filas de
    // ninguna tabla, son turnos agrupados.
    await query(`
      CREATE INDEX IF NOT EXISTS idx_turnos_faltas
        ON public.turnos (user_id, telefono)
        WHERE no_vino = TRUE
    `);
    console.log('[MIGRATIONS] ✓ Faltas de clientas OK');

    // ── Referidos: premio por invitar a una amiga ──────────────────────
    // referido_por_telefono: teléfono (normalizado) de la clienta que
    // compartió su link. Vive en el turno, no en la clienta: una persona
    // puede traer varias amigas y cada una es su propia invitación.
    //
    // premio_referido_avisado arranca en TRUE (arranque limpio, mismo
    // patrón que recordatorio_regreso_enviado): los turnos que ya existen
    // no tienen referido cargado, así que no hay nada que avisar, pero si
    // el default fuera FALSE el cron los barrería a todos el día que se
    // despliega esto. Después el default pasa a FALSE para los nuevos.
    await query(`
      ALTER TABLE public.turnos
        ADD COLUMN IF NOT EXISTS referido_por_telefono     VARCHAR(50),
        ADD COLUMN IF NOT EXISTS premio_referido_avisado   BOOLEAN DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS premio_referido_entregado BOOLEAN DEFAULT FALSE
    `);
    await query(`
      ALTER TABLE public.turnos
        ALTER COLUMN premio_referido_avisado SET DEFAULT FALSE
    `);
    console.log('[MIGRATIONS] ✓ Columnas de referidos OK (arranque limpio)');

    console.log('[MIGRATIONS] Todas las migraciones aplicadas.');
  } catch (err) {
    console.error('[MIGRATIONS] ERROR:', err.message);
    // No frenar el arranque del servidor por esto
  }
}

module.exports = { correrMigraciones };
