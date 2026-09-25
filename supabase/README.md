# Supabase en VolleyStats — Fase 3A

Esta fase añade identidad de usuario y prepara la base de datos. Las plantillas,
los partidos y el estado activo **siguen guardándose exclusivamente mediante el
almacenamiento local actual**. Todavía no existe sincronización cloud.

## Preparación

1. Crea un proyecto para VolleyStats en Supabase.
2. En **Connect** o **Settings → API Keys**, copia únicamente:
   - Project URL.
   - Publishable key con formato `sb_publishable_...`.
3. No uses en el navegador una Secret key, `sb_secret_...`, `service_role` ni
   ninguna otra clave privilegiada.
4. Ejecuta [`migrations/001_initial.sql`](./migrations/001_initial.sql) desde el
   SQL Editor del proyecto.

La migración crea `rosters`, `matches` y `user_state`, activa RLS, revoca todo
acceso de `anon` y concede a `authenticated` las cuatro operaciones protegidas
por `owner_id = auth.uid()`.

## Configuración local

Copia `cloud-config.example.json` desde la raíz como
`cloud-config.local.json` y sustituye los dos valores. El archivo local está
ignorado por Git.

```json
{
  "SUPABASE_URL": "https://tu-proyecto.supabase.co",
  "SUPABASE_PUBLISHABLE_KEY": "sb_publishable_..."
}
```

`npm run dev` transforma esa configuración en memoria. `npm run build` genera
`dist/cloud-config.js`. Para Netlify también pueden definirse
`SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` como variables del build; tienen
prioridad sobre el archivo local.

Si falta un valor, la URL no es válida o la clave no empieza por
`sb_publishable_`, cloud queda desactivado y VolleyStats arranca en modo local.

## Comprobar Auth

1. Ejecuta `npm run dev`.
2. Abre **Cuenta**.
3. Usa **Crear cuenta** con email y contraseña.
4. Si el proyecto exige confirmación por email, confírmalo antes de entrar.
5. Inicia sesión, recarga la página y comprueba que la sesión continúa activa.
6. Usa **Cerrar sesión**.

Supabase JS administra y persiste la sesión. VolleyStats no guarda contraseñas
ni implementa almacenamiento manual de tokens.

## Seguridad y alcance

- El frontend solo acepta Project URL y Publishable key.
- `anon` no tiene grants sobre las tablas cloud.
- `authenticated` solo puede operar sus propias filas mediante políticas RLS
  separadas para `SELECT`, `INSERT`, `UPDATE` y `DELETE`.
- `INSERT` y `UPDATE` usan `WITH CHECK` para impedir cambiar `owner_id`.
- `owner_id` referencia `auth.users(id)` con `on delete cascade`.
- Los triggers fijan timestamps de servidor y aumentan `version` en cada
  actualización. La futura sincronización podrá comparar versiones antes de
  escribir.
- No hay Realtime, service role, backend administrativo, equipos compartidos ni
  consultas cloud de datos deportivos en esta fase.

Consulta también la documentación oficial de Supabase sobre
[API keys](https://supabase.com/docs/guides/getting-started/api-keys),
[Auth para JavaScript](https://supabase.com/docs/reference/javascript/auth) y
[Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
