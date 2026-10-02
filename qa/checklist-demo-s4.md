# Checklist de demo — 02/10

Guion del happy path para la entrega. Dos personas, dos navegadores. Cuentas de prueba, sin datos reales y con la cámara apagada si la captura se va a compartir.

## Antes de empezar

El demo en el entorno público (`https://web-ruddy-mu-22.vercel.app` + `https://meetflow-server-tm9i.onrender.com`) **no llega al paso 3** mientras BUG-09 siga abierto: `POST /api/v1/salas` responde 500. Quien tenga el dashboard de Render tiene que redesplegar `develop` y comprobar que crear una sala devuelve 201 antes de la presentación.

Si eso no está listo, el mismo guion se corre en local (`web` en `:3000`, API en `:4000`). No mezclar los dos entornos en la misma pasada.

- [ ] Health de la API: 200.
- [ ] Una sala de prueba se crea (201) y devuelve `codigo` y `streamRoomId`.
- [ ] Host y participante en navegadores distintos (o una ventana normal y una de incógnito).
- [ ] Micrófono y cámara permitidos en los dos. Para grabar el demo, dejar la cámara apagada.

## Guion

1. El host abre `/home`.
2. Entra con una cuenta de prueba (registro o login). El header muestra Inicio y Mis reuniones.
3. Elige **Iniciar ahora**, escribe un título corto y confirma. Tiene que entrar a `/room` como host, no quedarse en un error genérico.
4. Copia el código de la sala (o abre `/sala/<codigo>`). Ese enlace tiene que caer en `/waiting-room?code=<codigo>`.
5. El participante, sin ser el host, abre ese enlace, completa nombre y apellido y pide ingreso. Queda en espera.
6. El host ve la solicitud en el panel y la aprueba.
7. El participante entra a la misma reunión. Los dos se ven o, con cámara apagada, ven al otro como conectado en la misma llamada. Si uno queda en "Preparando conexión…", cortar: no es el happy path (histórico BUG-05).
8. Cada uno apaga y prende su micrófono. El otro deja de oírlo y vuelve a oírlo.
9. Uno manda un mensaje en el chat. El otro lo lee en la misma sala.
10. Uno comparte pantalla un momento y lo corta. El otro ve el cambio y la vuelta a la cámara.
11. El participante sale. El host sigue en la sala.
12. El host sale y vuelve a `/home`.

## Qué no mostrar

- Crear sala contra Render si el paso de comprobación dio 500.
- Invitación por correo: en el Render actual esas rutas responden 404 (BUG-10).
- Un enlace "vencido". `fechaInicio` es la fecha de inicio, no un vencimiento (BUG-04, won't fix).
- Cuentas, mails o cámaras de personas reales.
