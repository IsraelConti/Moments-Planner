# Moments Planner

Aplicación Android de organización de bodas y eventos. Paquete: `com.momentsplanner.events`.

## Preparar la versión 1.3.2 (código 7)

1. Ejecutar `npm ci`.
2. Decodificar `src/app-icon.b64` a `src/app-icon.png` y ejecutar `npm run build`.
3. Copiar `dist/*` a `android/app/src/main/assets/` y el icono a los directorios mipmap de Android.
4. Con Java 17, Gradle 8.13 y Android SDK 36: ejecutar en `android/` `gradle testDebugUnitTest assembleDebug bundleRelease assembleDebugAndroidTest`.

El flujo `.github/workflows/android.yml` realiza estos pasos y ejecuta las pruebas de interfaz y las instrumentadas en un emulador Android API 35. Publica el APK de depuración, el AAB de producción sin firmar y las evidencias de pruebas.

## Compra y restauración

La versión de producción consulta Google Play Billing para el producto `moments_planner_premium_monthly`. Muestra el precio localizado de la misma oferta que se envía al pago. Solo admite planes mensuales recurrentes, con o sin una prueba inicial de tres días; otras condiciones no se anuncian como si fueran ese plan.

Los pagos pendientes no conceden acceso ni se reconocen como completados. Un fallo de conexión conserva el estado de la sesión ya comprobada; una respuesta correcta de Play determina si hay suscripción activa. Los errores de reconocimiento se reintentan al restaurar o volver a la aplicación, sin un bucle inmediato.

El botón superior «Salir», el botón inferior y Atrás permiten abandonar la pantalla de suscripción. El contenedor nativo reserva espacio para las barras del sistema y el teclado.

## Qué verifican las pruebas

- `node scripts/audit-static.mjs`: comprobaciones estáticas.
- `node scripts/smoke-ui.mjs`: 13 pantallas, formularios, persistencia, copia y restauración, exportaciones, QR y respuestas del paywall mediante un puente simulado.
- `MonthlyOfferPolicyTest`: ofertas mensuales, monedas, pruebas y condiciones no compatibles.
- `PaywallInstrumentedTest`: botones de salida y Atrás en el WebView instalado, incluido el formato horizontal.

El APK de depuración habilita acceso de prueba sin comprar. Las pruebas automáticas no certifican una compra o restauración real de Google Play. El AAB de producción mantiene el control de suscripción.

## Publicación

El AAB debe firmarse con la clave de subida aceptada para esta aplicación en Play Console. No incluir almacenes de claves ni contraseñas en este repositorio. La recuperación de la clave y la comprobación real del pago son pasos independientes de las pruebas de interfaz.

