# Evidencia de ejecución — S4-QA1

Tarea: regresión manual US-01→US-12 en 2 navegadores + mobile, y suite de API (`.http` + Hoppscotch) contra el entorno deployado.

Fecha: 2026-10-01. Rama: `QA-Sprint4`, desde `develop` @ `73d8291` (PR #104).

## Entorno

- API: `https://meetflow-server-tm9i.onrender.com` — `GET /api/v1/health` → 200 `{"status":"success","message":"Backend operativo"}` (2026-10-01T14:29:48Z).
- Web: `https://web-ruddy-mu-22.vercel.app` — `/` redirige a `/home` y responde 200.
- La suite se corrió con copias locales de los `.http` (host apuntado a Render). Los archivos del repo no se modificaron.
- Hoppscotch no se ejecutó como cliente aparte: el contrato ejecutable de esta corrida es httpyac. La colección suelta `apps/server/hoppscotch/S08-26-equipo-5___API_Contrato_v1.0.1.json` sigue sin trackear y no se usó.

## Suite de API

| Archivo | Resultado | Notas |
|---|---|---|
| `api_auth.http` | **14/14** | Register, login, me, refresh, logout y 404 de ruta inexistente. |
| `api_salas_agenda.http` | **17 ok, 3 failed, 20 errored** de 40 | Los 3 failed son `POST /salas` → 500 (BUG-09, casos 5, 26 y 30). El resto de los errores es cascada: sin `salaId` no corren detalle, participantes, transfer-host ni token. |
| `api_invitaciones.http` | **5 ok, 3 failed, 8 errored** de 16 | Crear sala → 500 (BUG-09). Preview y aceptar con token desconocido responden 404 genérico, no 410 (BUG-10). |
| `api_waiting.http` | **4 ok, 4 failed, 5 errored** de 13 | Misma causa: sin sala no hay waiting room. El caso 13 (`join:request` sin campos) devolvió `INTERNAL_SERVER_ERROR`; no se abre bug nuevo porque no había sala. |

Logs: `qa/evidencia-s4-qa1-auth.log`, `qa/evidencia-s4-qa1-salas.log`, `qa/evidencia-s4-qa1-invitaciones.log`, `qa/evidencia-s4-qa1-waiting.log`. Los `Authorization` de esos logs están redactados.

La suite **no está verde** contra Render.

## Regresión manual US-01 → US-12

No se recorrió la UI en Chrome, Firefox ni mobile. Crear una sala es el primer paso de US-01 y de casi todo lo que sigue, y `POST /api/v1/salas` responde 500 en el entorno público (BUG-09). Seguir con navegadores habría repetido el mismo fallo sin evidencia nueva de los flujos.

En el repo hay matriz de casos solo para US-01 a US-07 (`qa/casos-manuales-us-01-us-03.md`, `qa/casos-manuales-us-04-us-07.md`). US-08 a US-12 no tienen casos escritos acá; no se inventaron.

| Historia | Estado en esta corrida |
|---|---|
| US-01 Crear sala | Bloqueada en API (BUG-09). Sin prueba de UI. |
| US-02 Enlace / ingreso | No ejecutada. Depende de una sala. |
| US-03 Waiting room | No ejecutada. Depende de una sala. |
| US-04 a US-07 Reunión en vivo | No ejecutadas. |
| US-08 a US-12 | Sin matriz en el repo. No ejecutadas. |

## Qué falta para cerrar la tarjeta

- Corregir BUG-09 en Render y volver a correr `api_salas_agenda.http`, `api_invitaciones.http` y `api_waiting.http`.
- Confirmar el deploy de las rutas de invitaciones (BUG-10) y repetir los casos que hoy dan 404 genérico.
- Recién ahí: US-01 a US-12 en Chrome, Firefox y un dispositivo mobile, con capturas. Esta corrida no tiene screenshots ni video.
