--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5
-- Dumped by pg_dump version 17.5

-- Started on 2026-04-23 09:37:10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 4919 (class 1262 OID 17220)
-- Name: depimovil_saas; Type: DATABASE; Schema: -; Owner: postgres
--







SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 6 (class 2615 OID 17352)
-- Name: public; Type: SCHEMA; Schema: -; Owner: postgres
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO postgres;

--
-- TOC entry 4921 (class 0 OID 0)
-- Dependencies: 6
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: postgres
--

COMMENT ON SCHEMA public IS '';


--
-- TOC entry 2 (class 3079 OID 17353)
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- TOC entry 4923 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- TOC entry 261 (class 1255 OID 17498)
-- Name: actualizar_editado_en(); Type: FUNCTION; Schema: public; Owner: depimovil_user
--

CREATE FUNCTION public.actualizar_editado_en() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.editado_en = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.actualizar_editado_en() OWNER TO depimovil_user;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 222 (class 1259 OID 17466)
-- Name: configuracion; Type: TABLE; Schema: public; Owner: depimovil_user
--

CREATE TABLE public.configuracion (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    plantilla_turno text DEFAULT 'Hola {nombre}! Te confirmamos tu turno: Fecha: {fecha} a las {hora}. Servicio: {servicio}. Zona: {zona}. Duracion: {duracion} min. Te esperamos!'::text NOT NULL,
    plantilla_cumple text DEFAULT 'Feliz cumpleanos {nombre}! Todo el equipo te desea un dia muy especial.'::text NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    editado_en timestamp with time zone
);


ALTER TABLE public.configuracion OWNER TO depimovil_user;

--
-- TOC entry 219 (class 1259 OID 17406)
-- Name: invitaciones; Type: TABLE; Schema: public; Owner: depimovil_user
--

CREATE TABLE public.invitaciones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token character varying(128) NOT NULL,
    email character varying(255) NOT NULL,
    plan character varying(20) DEFAULT 'trial'::character varying NOT NULL,
    dias_trial integer DEFAULT 30 NOT NULL,
    creado_por uuid NOT NULL,
    usado boolean DEFAULT false NOT NULL,
    usado_en timestamp with time zone,
    expira_en timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.invitaciones OWNER TO depimovil_user;

--
-- TOC entry 224 (class 1259 OID 17485)
-- Name: login_intentos; Type: TABLE; Schema: public; Owner: depimovil_user
--

CREATE TABLE public.login_intentos (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    ip character varying(45) NOT NULL,
    exitoso boolean DEFAULT false NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.login_intentos OWNER TO depimovil_user;

--
-- TOC entry 223 (class 1259 OID 17484)
-- Name: login_intentos_id_seq; Type: SEQUENCE; Schema: public; Owner: depimovil_user
--

CREATE SEQUENCE public.login_intentos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.login_intentos_id_seq OWNER TO depimovil_user;

--
-- TOC entry 4924 (class 0 OID 0)
-- Dependencies: 223
-- Name: login_intentos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: depimovil_user
--

ALTER SEQUENCE public.login_intentos_id_seq OWNED BY public.login_intentos.id;


--
-- TOC entry 220 (class 1259 OID 17424)
-- Name: servicios; Type: TABLE; Schema: public; Owner: depimovil_user
--

CREATE TABLE public.servicios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    nombre character varying(255) NOT NULL,
    zona character varying(255) NOT NULL,
    duracion integer NOT NULL,
    color character varying(7) DEFAULT '#A85568'::character varying NOT NULL,
    descripcion text,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    editado_en timestamp with time zone,
    requiere_senia boolean DEFAULT false,
    monto_senia numeric(10,2) DEFAULT 0,
    CONSTRAINT servicios_duracion_check CHECK ((duracion >= 5))
);


ALTER TABLE public.servicios OWNER TO depimovil_user;

--
-- TOC entry 221 (class 1259 OID 17441)
-- Name: turnos; Type: TABLE; Schema: public; Owner: depimovil_user
--

CREATE TABLE public.turnos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    servicio_id uuid,
    nombre character varying(255) NOT NULL,
    telefono character varying(50) NOT NULL,
    servicio_nombre character varying(255),
    servicio_zona character varying(255),
    servicio_color character varying(7) DEFAULT '#A85568'::character varying,
    duracion integer NOT NULL,
    fecha date NOT NULL,
    hora time without time zone NOT NULL,
    notas text,
    cumple_dia smallint,
    cumple_mes smallint,
    estado character varying(20) DEFAULT 'activo'::character varying NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    editado_en timestamp with time zone,
    recordatorio_24h_enviado boolean DEFAULT false,
    recordatorio_2h_enviado boolean DEFAULT false,
    senia_requerida boolean DEFAULT false,
    senia_pagada boolean DEFAULT false,
    monto_senia numeric(10,2) DEFAULT 0,
    estado_pago character varying(20) DEFAULT 'pendiente'::character varying,
    CONSTRAINT turnos_cumple_dia_check CHECK (((cumple_dia >= 1) AND (cumple_dia <= 31))),
    CONSTRAINT turnos_cumple_mes_check CHECK (((cumple_mes >= 1) AND (cumple_mes <= 12))),
    CONSTRAINT turnos_duracion_check CHECK ((duracion >= 5)),
    CONSTRAINT turnos_estado_check CHECK (((estado)::text = ANY ((ARRAY['activo'::character varying, 'cancelado'::character varying, 'pendiente_senia'::character varying])::text[]))),
    CONSTRAINT turnos_estado_pago_check CHECK (((estado_pago)::text = ANY ((ARRAY['pendiente'::character varying, 'pagado'::character varying, 'no_aplica'::character varying])::text[])))
);


ALTER TABLE public.turnos OWNER TO depimovil_user;

--
-- TOC entry 218 (class 1259 OID 17390)
-- Name: usuarios; Type: TABLE; Schema: public; Owner: depimovil_user
--

CREATE TABLE public.usuarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    nombre character varying(255) NOT NULL,
    rol character varying(20) DEFAULT 'cliente'::character varying NOT NULL,
    plan character varying(20) DEFAULT 'trial'::character varying NOT NULL,
    trial_inicio timestamp with time zone,
    trial_fin timestamp with time zone,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    ultimo_login timestamp with time zone,
    nombre_negocio character varying(255),
    telefono character varying(50),
    notas_admin text,
    CONSTRAINT usuarios_plan_check CHECK (((plan)::text = ANY ((ARRAY['trial'::character varying, 'premium'::character varying])::text[]))),
    CONSTRAINT usuarios_rol_check CHECK (((rol)::text = ANY ((ARRAY['admin'::character varying, 'cliente'::character varying])::text[])))
);


ALTER TABLE public.usuarios OWNER TO depimovil_user;

--
-- TOC entry 4730 (class 2604 OID 17488)
-- Name: login_intentos id; Type: DEFAULT; Schema: public; Owner: depimovil_user
--

ALTER TABLE ONLY public.login_intentos ALTER COLUMN id SET DEFAULT nextval('public.login_intentos_id_seq'::regclass);


--
-- TOC entry 4758 (class 2606 OID 17476)
-- Name: configuracion configuracion_pkey; Type: CONSTRAINT; Schema: public; Owner: depimovil_user
--

ALTER TABLE ONLY public.configuracion
    ADD CONSTRAINT configuracion_pkey PRIMARY KEY (id);


--
-- TOC entry 4760 (class 2606 OID 17478)
-- Name: configuracion configuracion_user_id_key; Type: CONSTRAINT; Schema: public; Owner: depimovil_user
--

ALTER TABLE ONLY public.configuracion
    ADD CONSTRAINT configuracion_user_id_key UNIQUE (user_id);


--
-- TOC entry 4747 (class 2606 OID 17416)
-- Name: invitaciones invitaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: depimovil_user
--

ALTER TABLE ONLY public.invitaciones
    ADD CONSTRAINT invitaciones_pkey PRIMARY KEY (id);


--
-- TOC entry 4749 (class 2606 OID 17418)
-- Name: invitaciones invitaciones_token_key; Type: CONSTRAINT; Schema: public; Owner: depimovil_user
--

ALTER TABLE ONLY public.invitaciones
    ADD CONSTRAINT invitaciones_token_key UNIQUE (token);


--
-- TOC entry 4763 (class 2606 OID 17492)
-- Name: login_intentos login_intentos_pkey; Type: CONSTRAINT; Schema: public; Owner: depimovil_user
--

ALTER TABLE ONLY public.login_intentos
    ADD CONSTRAINT login_intentos_pkey PRIMARY KEY (id);


--
-- TOC entry 4752 (class 2606 OID 17435)
-- Name: servicios servicios_pkey; Type: CONSTRAINT; Schema: public; Owner: depimovil_user
--

ALTER TABLE ONLY public.servicios
    ADD CONSTRAINT servicios_pkey PRIMARY KEY (id);


--
-- TOC entry 4756 (class 2606 OID 17455)
-- Name: turnos turnos_pkey; Type: CONSTRAINT; Schema: public; Owner: depimovil_user
--

ALTER TABLE ONLY public.turnos
    ADD CONSTRAINT turnos_pkey PRIMARY KEY (id);


--
-- TOC entry 4742 (class 2606 OID 17405)
-- Name: usuarios usuarios_email_key; Type: CONSTRAINT; Schema: public; Owner: depimovil_user
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);


--
-- TOC entry 4744 (class 2606 OID 17403)
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: depimovil_user
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- TOC entry 4745 (class 1259 OID 17497)
-- Name: idx_invitaciones_token; Type: INDEX; Schema: public; Owner: depimovil_user
--

CREATE INDEX idx_invitaciones_token ON public.invitaciones USING btree (token);


--
-- TOC entry 4761 (class 1259 OID 17496)
-- Name: idx_login_intentos; Type: INDEX; Schema: public; Owner: depimovil_user
--

CREATE INDEX idx_login_intentos ON public.login_intentos USING btree (email, ip, creado_en);


--
-- TOC entry 4750 (class 1259 OID 17495)
-- Name: idx_servicios_user_id; Type: INDEX; Schema: public; Owner: depimovil_user
--

CREATE INDEX idx_servicios_user_id ON public.servicios USING btree (user_id);


--
-- TOC entry 4753 (class 1259 OID 17494)
-- Name: idx_turnos_fecha; Type: INDEX; Schema: public; Owner: depimovil_user
--

CREATE INDEX idx_turnos_fecha ON public.turnos USING btree (user_id, fecha);


--
-- TOC entry 4754 (class 1259 OID 17493)
-- Name: idx_turnos_user_id; Type: INDEX; Schema: public; Owner: depimovil_user
--

CREATE INDEX idx_turnos_user_id ON public.turnos USING btree (user_id);


--
-- TOC entry 4768 (class 2606 OID 17479)
-- Name: configuracion configuracion_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: depimovil_user
--

ALTER TABLE ONLY public.configuracion
    ADD CONSTRAINT configuracion_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- TOC entry 4764 (class 2606 OID 17419)
-- Name: invitaciones invitaciones_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: depimovil_user
--

ALTER TABLE ONLY public.invitaciones
    ADD CONSTRAINT invitaciones_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- TOC entry 4765 (class 2606 OID 17436)
-- Name: servicios servicios_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: depimovil_user
--

ALTER TABLE ONLY public.servicios
    ADD CONSTRAINT servicios_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- TOC entry 4766 (class 2606 OID 17461)
-- Name: turnos turnos_servicio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: depimovil_user
--

ALTER TABLE ONLY public.turnos
    ADD CONSTRAINT turnos_servicio_id_fkey FOREIGN KEY (servicio_id) REFERENCES public.servicios(id) ON DELETE SET NULL;


--
-- TOC entry 4767 (class 2606 OID 17456)
-- Name: turnos turnos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: depimovil_user
--

ALTER TABLE ONLY public.turnos
    ADD CONSTRAINT turnos_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- TOC entry 4920 (class 0 OID 0)
-- Dependencies: 4919
-- Name: DATABASE depimovil_saas; Type: ACL; Schema: -; Owner: postgres
--



--
-- TOC entry 4922 (class 0 OID 0)
-- Dependencies: 6
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: postgres
--



-- Completed on 2026-04-23 09:37:10

--
-- PostgreSQL database dump complete
--

