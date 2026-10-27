# API Weather — API serverless con AWS Lambda

API serverless (API Gateway + AWS Lambda) en **TypeScript** que consulta el clima actual de una ciudad en [Open-Meteo](https://open-meteo.com/), transforma la respuesta y la expone con un contrato propio, limpio y estable.

```
GET /weather?city={nombre_ciudad}
```

```
Cliente ──► API Gateway ──► Lambda ──► Open-Meteo Geocoding  (ciudad → coordenadas)
                                   └─► Open-Meteo Forecast   (coordenadas → clima actual)
        ◄── JSON con contrato propio
```

**Stack:** Node.js 22 · TypeScript (strict) · Serverless Framework v3 · serverless-offline · esbuild · Vitest

---

## Contenido

- [Requisitos previos](#requisitos-previos)
- [Instalación](#instalación)
- [Ejecución local](#ejecución-local)
- [Pruebas](#pruebas)
- [Configuración](#configuración)
- [Contrato de la API y ejemplos](#contrato-de-la-api-y-ejemplos)
- [Arquitectura](#arquitectura)
- [Logs](#logs)
- [Decisiones técnicas](#decisiones-técnicas)
- [Despliegue en AWS (opcional)](#despliegue-en-aws-opcional)
- [Qué mejoraría con más tiempo](#qué-mejoraría-con-más-tiempo)

---

## Requisitos previos

- **Node.js ≥ 22** (desarrollado y probado con Node 26; la Lambda usa el runtime `nodejs22.x`)
- **npm**
- Conexión a internet para consultar Open-Meteo (las pruebas **no** la necesitan)

No se necesita cuenta de AWS ni Docker para correr el proyecto en local.

## Instalación

```bash
git clone https://github.com/festupinans/API_Weather.git
cd API_Weather
npm install
```

Opcional: `cp .env.example .env` para ajustar la configuración (ver [Configuración](#configuración)).

## Ejecución local

```bash
npm run dev
```

Levanta API Gateway + Lambda simulados con `serverless-offline` en **http://localhost:3000**:

```bash
curl "http://localhost:3000/weather?city=Bogota"
```

## Pruebas

```bash
npm test               # ejecuta la suite una vez
npm run test:watch     # modo watch
npm run test:coverage  # suite + reporte de cobertura (texto y HTML en coverage/)
npm run typecheck      # verificación de tipos con tsc
```

57 pruebas unitarias; Open-Meteo está siempre simulado (no se hace ninguna llamada de red). Cobertura ≈ 97 % de líneas.

| Archivo | Qué cubre |
|---|---|
| `tests/services/weatherService.test.ts` | Transformación al contrato, validación de `city`, 404, propagación de 502 |
| `tests/clients/openMeteoClient.test.ts` | Construcción de URLs, ciudad inexistente, status de error, error de red, JSON inválido, formato inesperado y **timeout** |
| `tests/handlers/weather.test.ts` | Respuestas HTTP 200/400/404/502/500, que el 500 no exponga detalles internos y que los logs lleven `requestId` |
| `tests/domain/weatherCondition.test.ts` | Mapeo de códigos WMO y valor por defecto |
| `tests/config.test.ts` | Valores por defecto, lectura y validación de variables de entorno |

## Configuración

Toda la configuración se lee de variables de entorno (ver [`.env.example`](.env.example)). No hay valores sensibles en el código.

| Variable | Descripción | Valor por defecto |
|---|---|---|
| `GEOCODING_BASE_URL` | URL base del servicio de geocoding | `https://geocoding-api.open-meteo.com/v1` |
| `FORECAST_BASE_URL` | URL base del servicio de forecast | `https://api.open-meteo.com/v1` |
| `UPSTREAM_TIMEOUT_MS` | Timeout por cada llamada a Open-Meteo (ms) | `5000` |
| `LOG_LEVEL` | Nivel mínimo de log: `debug`, `info`, `warn`, `error` | `info` |

Se pueden definir en un archivo `.env` (lo carga Serverless con `useDotenv`) o directamente en la terminal:

```bash
LOG_LEVEL=debug npm run dev
```

Los valores se validan al arrancar: una URL mal formada o un timeout no numérico producen un error claro (y la API responde `500 INTERNAL_ERROR` con el formato del contrato).

## Contrato de la API y ejemplos

### Respuesta exitosa — `200`

```bash
curl -i "http://localhost:3000/weather?city=Bogota"
```

```http
HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
x-request-id: 38f21dbe-c81c-438e-91b7-93295474952e
```

```json
{
  "city": "Bogotá",
  "country": "Colombia",
  "coordinates": { "latitude": 4.60971, "longitude": -74.08175 },
  "timezone": "America/Bogota",
  "current": {
    "temperature": { "value": 23.4, "unit": "°C" },
    "humidity": { "value": 27, "unit": "%" },
    "windSpeed": { "value": 5, "unit": "km/h" },
    "condition": "Mayormente despejado",
    "observedAt": "2026-10-27T12:30"
  }
}
```

Ciudades con tildes o espacios (usar `--data-urlencode` para que curl las codifique):

```bash
curl -G "http://localhost:3000/weather" --data-urlencode "city=São Paulo"
# {"city":"São Paulo","country":"Brasil","coordinates":{"latitude":-23.5475,"longitude":-46.63611}, ...}
```

### Errores

Todos los errores tienen el mismo formato:

```json
{ "error": { "code": "CITY_NOT_FOUND", "message": "No se encontró la ciudad 'Ciudadinventada'" } }
```

| Caso | HTTP | `code` |
|---|---|---|
| Falta `city`, está vacío o tiene menos de 2 caracteres (o más de 100) | 400 | `INVALID_REQUEST` |
| La ciudad no existe en el geocoding | 404 | `CITY_NOT_FOUND` |
| Open-Meteo falla, responde con error, con formato inesperado o tarda más del timeout | 502 | `UPSTREAM_ERROR` |
| Cualquier error no controlado | 500 | `INTERNAL_ERROR` |

**404 — ciudad inexistente**

```bash
curl -i "http://localhost:3000/weather?city=Ciudadinventada"
```
```
HTTP/1.1 404 Not Found
{"error":{"code":"CITY_NOT_FOUND","message":"No se encontró la ciudad 'Ciudadinventada'"}}
```

**400 — parámetro inválido**

```bash
curl -i "http://localhost:3000/weather"
```
```
HTTP/1.1 400 Bad Request
{"error":{"code":"INVALID_REQUEST","message":"El parámetro 'city' es obligatorio"}}
```

```bash
curl -i "http://localhost:3000/weather?city=B"
```
```
HTTP/1.1 400 Bad Request
{"error":{"code":"INVALID_REQUEST","message":"El parámetro 'city' debe tener al menos 2 caracteres"}}
```

**502 — Open-Meteo no responde a tiempo**

Se puede reproducir sin tocar código, bajando el timeout a 1 ms:

```bash
UPSTREAM_TIMEOUT_MS=1 npm run dev
curl -i "http://localhost:3000/weather?city=Bogota"
```
```
HTTP/1.1 502 Bad Gateway
{"error":{"code":"UPSTREAM_ERROR","message":"El proveedor del clima no está disponible, intenta más tarde"}}
```

**500 — error no controlado**

El cliente solo recibe un mensaje genérico; el detalle (incluido el stack trace) queda únicamente en los logs. Está cubierto por pruebas en `tests/handlers/weather.test.ts`.

```json
{ "error": { "code": "INTERNAL_ERROR", "message": "Ocurrió un error interno" } }
```

## Arquitectura

El código está separado en capas; cada una solo conoce a la de abajo:

```
src/
├── handlers/weather.ts         Capa HTTP: lee el evento de API Gateway, arma la respuesta y traduce errores.
├── http/response.ts            Helpers para respuestas JSON de API Gateway.
├── services/weatherService.ts  Lógica de negocio: valida `city`, orquesta las llamadas y transforma al contrato.
├── domain/weatherCondition.ts  Conocimiento del dominio: código WMO → descripción en español.
├── clients/openMeteoClient.ts  Cliente de Open-Meteo: HTTP, timeout y validación de las respuestas.
├── errors.ts                   AppError con código + status HTTP y formato de error del contrato.
├── config.ts                   Lectura y validación de variables de entorno.
└── logger.ts                   Logger JSON estructurado.
```

Flujo de una petición:

1. **Handler** — crea un logger con el `requestId`, lee `city` y delega en el servicio.
2. **Servicio** — `validateCity` (400) → `searchCity` (404 si no hay resultado) → `getCurrentForecast` → `toWeatherResponse`.
3. **Cliente** — cada llamada tiene timeout; cualquier falla se convierte en `UPSTREAM_ERROR` (502).
4. **Handler** — responde 200 o, en el `catch`, convierte cualquier error con `toAppError` (lo desconocido se vuelve 500 genérico).

Puntos clave del diseño:

- **El servicio depende de una interfaz (`WeatherProvider`), no de Open-Meteo.** Eso permite probarlo con un proveedor falso y cambiar de proveedor sin tocar la lógica de negocio.
- **El handler se crea con `createHandler(deps)`.** En producción usa las dependencias reales; en las pruebas se inyecta un proveedor falso. No hace falta mockear módulos ni `fetch` global.
- **Las capas internas lanzan errores con significado de negocio** (`cityNotFound`, `upstreamError`); solo el handler los traduce a HTTP.

## Logs

Cada línea es un JSON con, como mínimo, `level`, `message`, `timestamp` y `requestId` (el `awsRequestId` de Lambda, que también se devuelve al cliente en la cabecera `x-request-id`). Ejemplo de una petición:

```json
{"requestId":"6398e0ad-...","method":"GET","path":"/weather","city":"São Paulo","timestamp":"2026-10-27T17:42:33.914Z","level":"info","message":"Petición recibida"}
{"requestId":"6398e0ad-...","upstream":"geocoding","url":"https://geocoding-api.open-meteo.com/v1/search?name=S%C3%A3o+Paulo&count=1&language=es&format=json","durationMs":194,"timestamp":"...","level":"info","message":"Respuesta de Open-Meteo recibida"}
{"requestId":"6398e0ad-...","upstream":"forecast","url":"https://api.open-meteo.com/v1/forecast?...","durationMs":185,"timestamp":"...","level":"info","message":"Respuesta de Open-Meteo recibida"}
{"requestId":"6398e0ad-...","city":"São Paulo","country":"Brasil","timestamp":"...","level":"info","message":"Clima obtenido"}
{"requestId":"6398e0ad-...","statusCode":200,"durationMs":380,"timestamp":"...","level":"info","message":"Petición completada"}
```

- Errores 5xx → nivel `error`, con el error original y su stack.
- Errores 4xx → nivel `warn`, sin stack (son errores del cliente, no fallas del sistema).
- Fallas y timeouts de Open-Meteo → `warn` en el cliente con `upstream`, `url`, `durationMs` y `timeoutMs`.

## Decisiones técnicas

| Decisión | Por qué |
|---|---|
| **Lambda "pura", sin Express** | La prueba evalúa el modelo API Gateway + Lambda. Para un solo endpoint, API Gateway ya hace de router; Express añadiría peso y tiempo de arranque en frío sin aportar nada. |
| **Serverless Framework v3 + serverless-offline** | Permite correr todo en local con `npm run dev`, sin Docker (AWS SAM lo requiere para `sam local`) y sin cuenta en serverless.com (la v4 la exige). Todo se instala como dependencia del proyecto. |
| **Runtime `nodejs22.x`** | `nodejs20.x` dejó de tener soporte en Lambda en abril de 2026. Serverless v3 no conoce `nodejs22.x` y muestra un *warning* de validación, pero lo acepta y AWS lo soporta. |
| **esbuild (`serverless-esbuild`)** | Compila TypeScript y empaqueta solo el código usado en un único archivo (zip de ~18 KB), lo que reduce el arranque en frío. Incluye sourcemaps + `--enable-source-maps` para stack traces legibles. |
| **Arquitectura `arm64`** | Graviton es más barato que x86 en Lambda y el código no tiene dependencias nativas. |
| **Timeout de la Lambda: 12 s** | Debe superar el peor caso del código (2 llamadas secuenciales × 5 s); si fuera menor, AWS cortaría la ejecución antes de que la API pudiera responder el 502 del contrato. |
| **`fetch` nativo + `AbortSignal.timeout`** | Sin dependencias HTTP. La señal cubre toda la operación, incluida la lectura del body. |
| **Validación manual de las respuestas de Open-Meteo** | Open-Meteo es externo: si cambia o devuelve datos incompletos, se responde 502 en lugar de fallar más adelante con un 500 confuso. Se hizo a mano para no añadir dependencias. |
| **Coordenadas del geocoding, no del forecast** | El forecast ajusta las coordenadas a su cuadrícula (p. ej. 4.6045 vs 4.60971); las del geocoding representan la ciudad, como en el ejemplo del contrato. |
| **`country: null` si no viene** | Algunos lugares no tienen país en el geocoding; el contrato mantiene la clave con `null` para ser estable. |
| **Máximo de 100 caracteres en `city`** | No lo pide el enunciado, pero evita enviar entradas arbitrariamente largas a Open-Meteo. |
| **Mapeo WMO por condición principal** | El enunciado pide los códigos principales; no se distingue la intensidad (ligera/moderada/fuerte). Códigos desconocidos → "Condición desconocida". |
| **Logger propio (~50 líneas)** | Cubre el requisito (JSON, nivel, mensaje, `requestId`) sin dependencias. Escribe con `process.stdout.write` porque en Lambda `console.log` antepone texto plano y rompe el JSON. |
| **Valores por defecto para las URLs** | Son públicas, no sensibles; se pueden sobrescribir por entorno. Evita que el proyecto falle si no se crea un `.env`. |
| **Vitest en lugar de Jest** | API compatible con Jest, soporte nativo de TypeScript sin configuración. `ts-jest` depende de la API del compilador que cambió en TypeScript 7. |
| **Inyección de dependencias** (config, `fetch`, proveedor, logger) | Hace cada capa testeable de forma aislada, sin mocks globales. |

## Despliegue en AWS (opcional)

No es necesario para evaluar la prueba. Con credenciales de AWS configuradas:

```bash
npm run package                   # genera el artefacto en .serverless/ (no requiere credenciales)
npx serverless deploy             # despliega en us-east-1, stage dev
npx serverless remove             # elimina todos los recursos creados
```

## Qué mejoraría con más tiempo

- **Caché por ciudad** en DynamoDB con TTL de 10 minutos, para no consultar Open-Meteo en cada petición.
- **Reintentos con backoff exponencial** ante errores transitorios (5xx, errores de red), respetando un presupuesto de tiempo total.
- **Presupuesto de tiempo global por petición.** Hoy cada llamada tiene su propio timeout de 5 s, así que el peor caso es ~10 s; un *deadline* compartido limitaría el total.
- **Documentación OpenAPI** del contrato.
- **CI con GitHub Actions** (typecheck, lint y pruebas en cada push) y **ESLint + Prettier**.
- **zod** para validar las respuestas de Open-Meteo y derivar los tipos del esquema.
- **AWS Lambda Powertools** (Logger, Metrics, Tracer) para logs, métricas y trazas con X-Ray.
- **Migrar la infraestructura** a Serverless v4, AWS CDK o SAM: Serverless v3 ya no recibe actualizaciones (por eso el aviso con `nodejs22.x`).
- **HTTP API (API Gateway v2)** en lugar de REST API: más barata y con menos latencia para este caso.
- **Ciudades ambiguas:** permitir un parámetro `country` o devolver varias coincidencias (p. ej. "San José").
- **Throttling / rate limiting** en API Gateway para proteger la cuota de Open-Meteo.
- **Pruebas de integración** contra Open-Meteo real en una suite separada, fuera del flujo de pruebas unitarias.
