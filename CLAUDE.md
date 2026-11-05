# Sistema de Conteo de Votos — Pastaza 2027

Sistema web para digitar actas de escrutinio y ver resultados de las Elecciones Seccionales y CPCCS 2027 en la provincia de Pastaza (Ecuador). Responde siempre en español; los comandos y el código quedan en inglés.

## Arquitectura
- **Frontend**: HTML + JavaScript puro (módulos ES), sin build ni npm. Publicado en GitHub Pages desde la raíz de la rama `main`.
  - `index.html`, `css/estilos.css`, `js/app.js` (toda la lógica), `js/config.js` (URL y clave pública de Supabase).
  - Librería: `@supabase/supabase-js@2.45.4` cargada desde jsdelivr.
- **Backend**: Supabase (PostgreSQL + Auth). No hay servidor propio.
  - `sql/01_esquema.sql`: tablas, vistas, funciones RPC, RLS y permisos. Es idempotente (se puede volver a ejecutar).
  - `sql/02_datos_pastaza.sql`: cantones, parroquias, zonas, 88 recintos, 350 juntas y 8 dignidades. Generado por `scripts/generar_datos_pastaza.py` desde el Distributivo de Recintos del CNE (hoja PASTAZA).
  - Los cambios de base de datos se aplican pegando el SQL en Supabase > SQL Editor. Claude Code NO tiene acceso directo a la base salvo que se configure un servidor MCP.

## Modelo de datos (resumen)
canton → parroquia (tipo URBANA/RURAL) → zona → recinto → junta (numero, sexo F/M, electores)
dignidad (ambito: NACIONAL, PROVINCIAL, CANTONAL, CANTONAL_URBANA, CANTONAL_RURAL, PARROQUIAL_RURAL)
organizacion → candidatura (dignidad + circunscripción: canton_id o parroquia_id)
acta (junta + dignidad, única) → acta_voto (candidatura, votos); acta_historial = auditoría
perfil (user_id de auth.users, rol ADMIN/DIGITADOR/VISUALIZADOR/PENDIENTE, canton_id opcional)

## Reglas que no se deben romper
- Las actas solo se escriben mediante la RPC `guardar_acta`; nunca con insert/update directos desde el frontend.
- Toda tabla nueva debe tener RLS activado, políticas explícitas y `grant` explícito a `authenticated` (el proyecto tiene desactivado "Automatically expose new tables"). Nunca dar permisos a `anon`.
- Nunca poner la clave `service_role` / `sb_secret_...` en el frontend ni en el repositorio.
- Un acta con descuadre (válidos + blancos + nulos ≠ sufragantes) queda INCONSISTENTE y no se suma a resultados.
- Todo cambio de actas debe registrarse en `acta_historial`.
- Mantener la interfaz usable en celular (ancho 390 px sin scroll horizontal).

## Flujo de trabajo
1. Cambios de frontend: editar archivos, probar localmente con `python -m http.server 8000` y abrir http://localhost:8000.
2. Cambios de base: modificar `sql/01_esquema.sql` (o crear `sql/NN_descripcion.sql` para migraciones) y decirle al usuario qué ejecutar en el SQL Editor.
3. Publicar: `git add . && git commit -m "..." && git push` (GitHub Pages se actualiza en 1–2 minutos).
