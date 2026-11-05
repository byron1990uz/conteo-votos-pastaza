# Sistema de Conteo de Votos — Pastaza 2027
### Elecciones Seccionales y Consejo de Participación Ciudadana y Control Social (CPCCS) 2027

Sistema web para digitar las actas de escrutinio de cada junta receptora del voto y ver los resultados consolidados en tiempo real, desde cualquier lugar con internet.

---

## 1. Qué incluye

| Carpeta / archivo | Contenido |
|---|---|
| `sql/01_esquema.sql` | Base de datos completa: tablas, seguridad por roles (RLS), validaciones, bitácora de auditoría y cálculo de resultados. |
| `sql/02_datos_pastaza.sql` | Carga de datos generada desde el **Distributivo de Recintos del CNE** (hoja PASTAZA): 4 cantones, 22 parroquias, 79 zonas, **88 recintos**, **350 juntas**, **84.693 electores**, y las 8 dignidades. |
| `web/` | Aplicación web (HTML + JavaScript), lista para publicarse gratis en GitHub Pages. |
| `scripts/generar_datos_pastaza.py` | Regenera `02_datos_pastaza.sql` si el CNE publica un distributivo actualizado. |

### Roles de usuario

| Rol | Qué puede hacer |
|---|---|
| **Administrador** | Todo: gestionar usuarios, organizaciones políticas, candidaturas y parroquias; revisar, validar, reabrir, corregir o eliminar actas. |
| **Digitador** | Ingresar actas (opcionalmente solo de un cantón asignado) y corregir las suyas mientras no estén validadas. Ve resultados. |
| **Visualización** | Solo ve el tablero de resultados y el avance del escrutinio. |
| *Pendiente* | Usuario creado sin rol: no ve nada hasta que el administrador le asigne uno. |

### Reglas que aplica el sistema

- Cada junta tiene **un acta por dignidad**; el sistema solo muestra las dignidades que se votan en esa junta (por ejemplo, vocales solo en parroquias rurales; alcalde y concejales del cantón al que pertenece la junta).
- Si **válidos + blancos + nulos ≠ total de sufragantes**, el digitador recibe un aviso; si confirma, el acta queda como **Inconsistente** y **no se suma a los resultados** hasta que el administrador la revise (hay una casilla para incluirlas si se desea).
- Un acta **Validada** solo puede modificarla un administrador.
- Un digitador no puede sobrescribir un acta ingresada por otro usuario.
- Toda acción (ingreso, corrección, validación, reapertura, eliminación) queda en la tabla `acta_historial` con usuario y hora.
- El tablero se actualiza solo cada 30 segundos y permite descargar los resultados en CSV (se abre en Excel).

---

## 2. Opciones gratuitas para tenerlo en la nube

**GitHub solo no basta**: GitHub Pages publica páginas estáticas (HTML/JS), pero no tiene base de datos ni usuarios. Por eso se combina con un servicio de base de datos.

| Opción | Base de datos | Página web | Ventajas | Limitaciones del plan gratuito |
|---|---|---|---|---|
| **⭐ Supabase + GitHub Pages** (la que usa este sistema) | Supabase (PostgreSQL) | GitHub Pages | Base de datos real (PostgreSQL), usuarios con contraseña incluidos, seguridad por roles en la propia base de datos, panel web para ver tablas y ejecutar consultas SQL. | 500 MB de base (este sistema usa menos de 20 MB); **el proyecto se pausa tras 1 semana sin actividad** (se reactiva con un clic desde el panel); sin copias de seguridad automáticas. |
| Supabase + Vercel / Netlify / Cloudflare Pages | Supabase | Vercel, Netlify o Cloudflare Pages | Igual que la anterior; permiten publicar desde un repositorio **privado** de GitHub. | Mismas de Supabase. |
| Firebase (Google) | Firestore (NoSQL) | Firebase Hosting | Muy estable, plan gratuito "Spark". | Base NoSQL: sumar resultados por cantón/parroquia es más complicado; habría que reescribir el sistema. |
| Google Sheets + Apps Script | Hoja de cálculo | Apps Script | Muy rápido de armar. | Se vuelve lento y con conflictos con muchos digitadores a la vez; seguridad limitada. |
| Servidor propio (por ejemplo, Rocky Linux con PostgreSQL) | PostgreSQL propio | Nginx/Apache | Control total, sin pausas. | Requiere servidor con IP pública, SSL y mantenimiento; el esquema funciona igual pero habría que instalar también un servicio de autenticación/API (por ejemplo, PostgREST o Supabase autoalojado). |

> Los límites de los planes gratuitos cambian; confírmelos en https://supabase.com/pricing antes de la jornada electoral.

---

## 3. Instalación paso a paso (Supabase + GitHub Pages)

### Paso 1 — Crear las cuentas
1. Cree una cuenta en **https://github.com** (gratis).
2. Cree una cuenta en **https://supabase.com** (puede ingresar con la misma cuenta de GitHub).

### Paso 2 — Crear el proyecto en Supabase
1. En Supabase: **New project**.
2. Nombre: `conteo-votos-pastaza`. Escriba una contraseña segura para la base de datos y guárdela.
3. Región: elija la más cercana (por ejemplo, *East US*). Plan: **Free**.
4. Espere 1–2 minutos a que el proyecto termine de crearse.

### Paso 3 — Crear la base de datos
1. En el menú izquierdo abra **SQL Editor** → **New query**.
2. Copie todo el contenido de `sql/01_esquema.sql`, péguelo y pulse **Run**. Debe terminar sin errores.
3. Abra otra consulta nueva, pegue el contenido de `sql/02_datos_pastaza.sql` y pulse **Run**.
4. Verifique con esta consulta (debe mostrar 88 recintos, 350 juntas y 84693 electores):
   ```sql
   select (select count(*) from recinto) as recintos,
          (select count(*) from junta)   as juntas,
          (select sum(electores) from junta) as electores;
   ```

### Paso 4 — Seguridad de usuarios
1. Vaya a **Authentication → Sign In / Providers** (o **Authentication → Settings**, según la versión del panel).
2. **Desactive** la opción que permite a cualquiera registrarse (*Allow new users to sign up*). Así solo el administrador crea usuarios.

### Paso 5 — Crear el primer administrador
1. **Authentication → Users → Add user → Create new user**.
2. Escriba su correo y una contraseña, marque **Auto Confirm User** y guarde.
3. En **SQL Editor**, ejecute (con su correo):
   ```sql
   update public.perfil set rol = 'ADMIN', nombre = 'Administrador'
   where email = 'su-correo@ejemplo.com';
   ```

### Paso 6 — Conectar la página web con Supabase
1. En Supabase: **Project Settings → API** (o **Data API**). Copie:
   - **Project URL** (algo como `https://abcdxyz.supabase.co`)
   - **anon public key** (una cadena larga que empieza con `eyJ...`)
2. Abra `web/js/config.js` con un editor de texto y reemplace:
   ```js
   export const SUPABASE_URL = 'https://abcdxyz.supabase.co';
   export const SUPABASE_ANON_KEY = 'eyJ...';
   ```
   > La *anon key* es pública por diseño; lo que protege los datos son las políticas de seguridad de la base. **Nunca** coloque la clave `service_role` en la página.

### Paso 7 — Publicar la página en GitHub Pages
**Opción A, desde el navegador (sin instalar nada):**
1. En GitHub: **New repository** → nombre `conteo-votos-pastaza` → **Public** → **Create repository**.
2. Pulse **uploading an existing file** y arrastre **el contenido** de la carpeta `web` (`index.html`, la carpeta `css` y la carpeta `js`). Pulse **Commit changes**.
3. Vaya a **Settings → Pages**. En *Build and deployment* elija **Deploy from a branch**, rama **main**, carpeta **/ (root)** y pulse **Save**.
4. En 1–2 minutos su sistema estará en `https://SU-USUARIO.github.io/conteo-votos-pastaza/`.

**Opción B, con la línea de comandos (git):** dentro de la carpeta `web`:
```bash
git init
git add .
git commit -m "Sistema de conteo de votos Pastaza 2027"
git branch -M main
git remote add origin https://github.com/SU-USUARIO/conteo-votos-pastaza.git
git push -u origin main
```
Luego active GitHub Pages como en el punto 3 de la opción A.

> GitHub Pages gratuito requiere repositorio **público**. Eso expone solo el código de la página, no los datos (que están protegidos en Supabase). Si prefiere un repositorio privado, publique la carpeta `web` en **Netlify**, **Vercel** o **Cloudflare Pages**, que lo permiten gratis.

### Paso 8 — Configurar la elección (como administrador, en el sistema)
1. Ingrese a su URL con el usuario administrador → **Administración**.
2. **Parroquias:** revise el tipo urbana/rural. Por defecto quedaron **urbanas** Puyo, Mera, Santa Clara y Arajuno, y el resto **rurales**. Ajuste según la circunscripción oficial del CNE.
3. **Organizaciones políticas:** registre cada organización con su número de lista, sigla y un color.
4. **Candidaturas:** cuando el CNE publique las candidaturas calificadas, registre por dignidad:
   - Prefectura: un binomio por organización.
   - Alcaldía: un candidato por organización **en cada cantón**.
   - Concejales urbanos / rurales: **una línea por lista** en cada cantón.
   - Vocales de juntas parroquiales: **una línea por lista** en cada parroquia rural.
   - CPCCS (mujeres, hombres, pueblos y nacionalidades/exterior): un registro por candidato.
5. **Usuarios:** cree los digitadores y visualizadores en Supabase (*Add user*, como en el Paso 5) y asígneles el rol en **Administración → Usuarios**. Puede limitar un digitador a un cantón.
6. **Electores por junta:** el distributivo trae electores por recinto; el sistema los repartió en partes iguales entre sus juntas (valor *referencial*). Cuando tenga el padrón por junta, descargue la plantilla, complétela y péguela en **Administración → Electores por junta**.

---

## 4. Antes y durante la jornada electoral

- [ ] **Simulacro**: haga una prueba completa con los digitadores unos días antes.
- [ ] **Borre las actas de prueba** después del simulacro (en SQL Editor):
  ```sql
  truncate public.acta_voto, public.acta, public.acta_historial restart identity;
  ```
- [ ] **Evite la pausa del plan gratuito**: ingrese al sistema o al panel de Supabase el día anterior y la mañana de la elección. Si aparece *Paused*, pulse **Restore project** en el panel.
- [ ] **Respaldos**: durante el escrutinio, descargue periódicamente el CSV de cada dignidad; al final, en Supabase use **Table Editor → acta → Export to CSV** (y lo mismo con `acta_voto`).
- [ ] Entregue a cada digitador su usuario y la URL; recomiende usar computador o celular con datos móviles de respaldo.
- [ ] Revise con frecuencia **Administración → Revisión de actas → Inconsistentes**.

---

## 5. Puntos que conviene confirmar con la normativa del CNE 2027

1. **Parroquias urbanas/rurales** de cada cantón (definen dónde se votan concejales urbanos, rurales y vocales). Se cambian en *Administración → Parroquias* sin tocar el código.
2. **CPCCS** quedó como tres dignidades separadas (mujeres, hombres, pueblos y nacionalidades/exterior), cada una con sus propios blancos y nulos. Si el acta oficial las agrupa de otra forma, se ajusta en la tabla `dignidad`.
3. **Concejales en cantones pequeños**: si algún cantón no divide concejales en urbanos y rurales, registre sus candidaturas solo en una de las dos dignidades.
4. Este sistema es un **conteo propio / de control**; los resultados oficiales son los que publica el CNE.

---

## 6. Consultas útiles (SQL Editor)

```sql
-- Avance por dignidad
select * from v_avance order by dignidad_orden;

-- Resultados de Prefectura en toda la provincia
select resultados(1);

-- Resultados de Alcaldía del cantón Pastaza (código 680)
select resultados(2, 680);

-- Juntas sin acta de Prefectura
select jd.canton, jd.parroquia, jd.recinto, jd.etiqueta
from v_junta_dignidad jd
left join acta a on a.junta_id = jd.junta_id and a.dignidad_id = jd.dignidad_id
where jd.dignidad_id = 1 and a.id is null
order by 1, 2, 3, 4;

-- Bitácora de auditoría
select fecha, usuario_email, accion, junta_id, dignidad_id, datos
from acta_historial order by fecha desc limit 100;
```

Códigos de cantón: **680** Pastaza · **685** Mera · **880** Santa Clara · **881** Arajuno.
