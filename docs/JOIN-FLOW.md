# Flujo de ingreso a una reunión (sala de espera → GetStream)

Contrato del backend para que un participante —registrado o invitado sin cuenta—
entre al mismo call de GetStream que el host.

Base URL: `/api/v1` · Namespace de Socket.IO: `/reuniones`

---

## 1. El modelo en una frase

El `Participante.id` **es** el `user_id` en GetStream. Un invitado no tiene cuenta
en MeetFlow, así que su identidad frente a nuestra API es un **guest JWT** que el
backend le firma cuando el host lo aprueba.

```
                 ┌──────────────┐
  POST /salas    │   HOST       │  crea la sala → GetStream call (type + id)
  ──────────────▶│              │
                 └──────┬───────┘
                        │ socket: host:subscribe { salaId }
                        ▼
  ┌──────────┐   POST /salas/:code/join        ┌──────────────┐
  │ INVITADO │ ───────────────────────────────▶│  PENDIENTE   │
  └──────────┘   { nombre, apellido, email }   └──────┬───────┘
       │                                              │ socket: join:pending → host
       │ socket: join:subscribe { participanteId }    │
       │                                              ▼
       │                              host: participant:approve
       │                                              │
       │◀─────────── socket: join:approved ───────────┘
       │            { accessToken, stream: { callType, callId, callCid } }
       │
       │ POST /salas/:salaId/stream-token   (Bearer = accessToken)
       ▼
  { apiKey, token, userId, callType, callId } ──▶ SDK de GetStream
```

---

## 2. Endpoints

### `POST /salas/:code/join` — solicitar ingreso

Público. Si el visitante está logueado y manda su Bearer, el participante queda
vinculado a su usuario; si no, entra como invitado.

```jsonc
// request
{ "nombre": "Ana", "apellido": "Pérez", "email": "ana@test.com" }

// 200 — caso normal
// accessToken: guest JWT del invitado. Se emite también en PENDIENTE (no
// solo cuando ya está APROBADO): sirve para autenticar el socket con
// `auth: { token: accessToken }` antes de suscribirse a sus eventos. No da
// acceso de más — stream-token y las acciones del host siguen exigiendo
// APROBADO por su cuenta.
{
  "participanteId": "uuid",
  "estado": "PENDIENTE",
  "salaId": "uuid",
  "accessToken": "<guest jwt>"
}

// 200 — ya estaba aprobado y su aprobación sigue vigente (reingreso / F5)
{
  "participanteId": "uuid",
  "estado": "APROBADO",
  "salaId": "uuid",
  "accessToken": "<guest jwt>",
  "stream": { "callType": "default", "callId": "uuid", "callCid": "default:uuid" }
}
```

Errores: `400 VALIDATION_ERROR` · `403 JOIN_REJECTED` · `404 ROOM_NOT_FOUND` ·
`409 ROOM_CANCELLED` · `409 ROOM_FINISHED`.

Es idempotente por `(salaId, email)`: llamarlo dos veces no crea dos
participantes. Una aprobación vencida (más de `PARTICIPANT_TOKEN_TTL_SECONDS`
desde `fechaIngreso`) devuelve el participante a `PENDIENTE` y vuelve a avisar
al host.

### `POST /salas/:salaId/stream-token` — token de GetStream

Requiere `Authorization: Bearer <token>`, que puede ser **cualquiera de los dos**:

- el access token del usuario registrado (host o participante con cuenta), o
- el guest JWT del invitado aprobado.

```jsonc
// 200
{
  "apiKey": "<api key pública de GetStream>",
  "token": "<jwt de GetStream, restringido a este call>",
  "userId": "<participanteId>",
  "user": { "id": "<participanteId>", "name": "Ana Pérez" },
  "rol": "PARTICIPANTE",
  "callType": "default",
  "callId": "uuid",
  "callCid": "default:uuid",
  "sala": { "id": "uuid", "codigo": "ABCD1234", "nombre": "...", "estado": "ACTIVA" },
  "expiresAt": "2026-09-24T18:00:00.000Z"
}
```

Errores: `401 UNAUTHORIZED` · `403 NOT_A_PARTICIPANT` · `403 JOIN_NOT_APPROVED` ·
`403 JOIN_REJECTED` · `403 FORBIDDEN` (token de otra sala) · `409 ROOM_FINISHED` ·
`409 ROOM_CANCELLED` · `409` sala sin call de GetStream.

**El rol se lee de la base de datos.** El body se ignora por completo: no hay
forma de pedirse un token de `admin` sin ser `HOST` en la tabla `Participante`.
Mapeo: `HOST → admin`, `PARTICIPANTE → user`.

Antes de firmar, el backend hace `upsertUsers` y agrega al participante como
member del call, así que el usuario existe en GetStream con su nombre visible.

El token vence en `STREAM_TOKEN_TTL_SECONDS` (1 h por defecto). Para renovarlo,
volver a llamar este endpoint con el mismo Bearer.

### `GET /salas/:salaId/mi-estado` — recuperar la sesión

Mismo esquema de auth, pero **no** exige estar aprobado: sirve para que un
`PENDIENTE` pregunte si ya lo dejaron entrar después de recargar la página.

```jsonc
{
  "participanteId": "uuid",
  "estado": "PENDIENTE",
  "rol": "PARTICIPANTE",
  "sala": { "id": "uuid", "codigo": "ABCD1234", "nombre": "...", "estado": "ACTIVA" },
  "stream": null          // se completa recién cuando estado === "APROBADO"
}
```

### `POST /salas` — crear sala (host)

La respuesta ahora incluye `stream` además de `streamRoomId`:

```jsonc
{
  "salaId": "uuid", "codigo": "ABCD1234", "nombre": "...", "enlace": "...",
  "streamRoomId": "default:uuid",
  "stream": { "callType": "default", "callId": "uuid", "callCid": "default:uuid" }
}
```

`GET /salas/:id/detalle` también devuelve `stream` (o `null`).

### `POST /rooms/:id/token` — alias legacy, deprecated

Se mantiene por compatibilidad (`apps/web` todavía le pega a esta ruta), pero
es un **alias** de `POST /salas/:salaId/stream-token`: usa el mismo middleware
`authParticipante`, así que el body (`userId`, `role`) se ignora igual que en
el endpoint nuevo — el rol y el usuario siempre salen de la DB/JWT. Preferir
`POST /salas/:salaId/stream-token` en integraciones nuevas.

---

## 3. Eventos de Socket.IO — `/reuniones`

Handshake opcional: `auth: { token }` acepta el access token del usuario **o** el
guest JWT. Con guest JWT el socket queda suscrito solo a sus rooms.

### Cliente → servidor

| Evento | Payload | Quién |
|---|---|---|
| `join:request` | `{ salaCodigo, nombre, apellido, email }` | invitado |
| `join:subscribe` | `{ participanteId }` | invitado que ya se dio de alta por HTTP |
| `host:subscribe` | `{ salaId }` | host (requiere access token) |
| `participant:approve` | `{ participanteId }` | host |
| `participant:reject` | `{ participanteId }` | host |

Todos aceptan un callback de ack: `{ ok: true, ... }` o `{ ok: false, error: { code, message } }`.

**`join:subscribe` exige ser dueño del participante.** El socket tiene que
conectarse con `auth: { token: accessToken }` (el guest JWT que devuelve
`POST /salas/:code/join`, incluso en PENDIENTE) **antes** de mandar
`join:subscribe`. Si el socket es anónimo, o trae el token de otro
participante, o un usuario logueado que no es el dueño, la respuesta es
`{ ok: false, error: { code: "FORBIDDEN", ... } }` y no se hace `join` a
ningún room. Antes de este fix, `join:subscribe` no validaba nada: cualquiera
podía mandar un `participanteId` ajeno y quedar suscripto a su
`join:approved` (que incluye el accessToken de esa persona).

### Servidor → cliente

**`join:pending`** (al room del host)

```jsonc
{ "participanteId": "uuid", "nombre": "Ana", "apellido": "Pérez",
  "email": "ana@test.com", "timestamp": "ISO" }
```

**`join:approved`** (al participante)

```jsonc
{
  "participanteId": "uuid",
  "accessToken": "<guest jwt>",
  "expiresAt": "ISO",
  "sala": { "id": "uuid", "codigo": "ABCD1234", "estado": "ACTIVA" },
  "streamCallId": "uuid",              // deprecado: usar stream.callId
  "stream": { "callType": "default", "callId": "uuid", "callCid": "default:uuid" }
}
```

**`join:rejected`** → `{ sala: { id, codigo, estado } }`

**`room:state`** → `{ salaId, estado, participantes: [...] }` (se emite a la sala
y al room del host).

**`error`** → `{ code, message }`

---

## 4. Lo que tiene que cambiar el front

Estos tres puntos **no se pueden resolver desde el backend**:

1. **El socket del invitado nunca emite `join:request`.** En
   `apps/web/app/(platform)/waiting-room/page.tsx` el socket solo registra
   handlers `.on(...)`, así que nunca entra al room `participante:<id>` y
   `join:approved` no tiene a dónde llegar. Después de `POST /salas/:code/join`
   hay que emitir `join:subscribe { participanteId }` (o usar `join:request` por
   socket en lugar del POST). Alternativa más simple: conectar el socket con
   `auth: { token: accessToken }` una vez que se tenga el guest JWT — el servidor
   suscribe solo con eso.

2. **`/room` no usa GetStream.** `@stream-io/video-react-sdk` está instalado y
   sin importar; la página hace `getUserMedia` y muestra el preview local.

   ```tsx
   const r = await fetch(`${API}/salas/${salaId}/stream-token`, {
     method: "POST",
     headers: { Authorization: `Bearer ${accessToken}` },
   }).then((x) => x.json());

   const client = new StreamVideoClient({
     apiKey: r.apiKey,
     user: { id: r.userId, name: r.user.name },
     token: r.token,
   });
   const call = client.call(r.callType, r.callId);
   await call.join({ create: false });   // el call ya existe: lo creó el host
   ```

   No hace falta `NEXT_PUBLIC_GETSTREAM_API_KEY`: la `apiKey` viene en la respuesta.

3. **Hay que persistir `accessToken`, `participanteId` y `salaId`** al navegar de
   `/waiting-room` a `/room`. Hoy el redirect solo lleva `code` y `callId` por
   query string. Recomendado: `sessionStorage`, no la URL.

También conviene revisar que `requestSalaJoin` en `apps/web/app/lib/salas-api.ts`
lea el nuevo shape de la respuesta (`salaId`, y `accessToken` cuando venga).

---

## 5. Variables de entorno nuevas

```bash
STREAM_TOKEN_TTL_SECONDS=3600        # vigencia del token de GetStream
PARTICIPANT_TOKEN_TTL_SECONDS=7200   # vigencia del guest JWT y ventana de reingreso
WEBHOOK_SIGNATURE_REQUIRED=true      # on por defecto salvo NODE_ENV=development
```

`GETSTREAM_API_KEY` y `GETSTREAM_API_SECRET` ahora son obligatorias: el servidor
no arranca sin ellas (antes fallaba recién al crear la primera sala).

---

## 6. Prueba end-to-end sin front

```bash
# 1. Host: login y crear sala
curl -X POST $API/salas -H "Authorization: Bearer $HOST_JWT" \
     -H 'Content-Type: application/json' -d '{"nombre":"Demo"}'
#    → guardar salaId, codigo, stream.callId

# 2. Host por socket: host:subscribe { salaId }

# 3. Invitado pide ingreso
curl -X POST $API/salas/$CODIGO/join -H 'Content-Type: application/json' \
     -d '{"nombre":"Ana","apellido":"Pérez","email":"ana@test.com"}'
#    → el host recibe join:pending

# 4. Host aprueba: participant:approve { participanteId }
#    → el invitado recibe join:approved con accessToken y stream.callId

# 5. Invitado pide su token
curl -X POST $API/salas/$SALA_ID/stream-token -H "Authorization: Bearer $GUEST_JWT"

# 6. Host pide el suyo
curl -X POST $API/salas/$SALA_ID/stream-token -H "Authorization: Bearer $HOST_JWT"
```

**Criterio de aceptación:** los pasos 5 y 6 devuelven el **mismo `callCid`** con
roles distintos (`user` y `admin` al decodificar el token en jwt.io), y ningún
camino permite obtener `admin` sin ser `HOST` en la base de datos.
