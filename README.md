# Moments Planner — compra única

Aplicación para Android de organización de bodas y eventos, paquete `com.momentsplanner.events`.

## Versión 1.3.4 (código 9)

La compra de la aplicación en Google Play da acceso permanente a todas sus funciones, **sin suscripciones ni renovaciones automáticas**. El precio objetivo de España es **2,99 €**, configurado en Play Console, no en el código.

- Sin paywall ni consulta a Google Play Billing desde la app instalada.
- Se mantienen los proyectos y ajustes existentes, utilizando las mismas claves de almacenamiento.
- Se conservan las funciones de invitados, mesas, presupuesto, tareas, proveedores, informes y archivos.
- Los usuarios que ya compraron la aplicación seguirán teniendo acceso tras actualizar.

## Compilación

1. `npm ci`.
2. `base64 -d src/app-icon.b64 > src/app-icon.png`; `npm run build`.
3. Copiar `dist/*` a `android/app/src/main/assets/` y el icono a los mipmap Android.
4. Java 17, Gradle 8.13, Android SDK 36: `cd android && gradle testDebugUnitTest assembleDebug bundleRelease assembleDebugAndroidTest`.

GitHub Actions genera APK de pruebas y AAB de producción **sin firmar**. El AAB necesita la firma de subida aceptada por Google Play antes del envío.

## Publicación segura

1. Validar el paquete 1.3.4, firmarlo y enviarlo para revisión a Google Play.
2. Actualizar el precio de la app de pago en España a **2,99 €** y comprobar otros países.
3. Cuando esté disponible la versión sin muro mensual, desactivar el plan básico antiguo para impedir nuevas suscripciones.
4. Examinar suscripciones existentes: desactivar el plan **no cancela sus renovaciones**; cancelarlas o reembolsarlas cuando corresponda y comunicar el cambio, conservando el acceso.
5. Verificar una instalación nueva y una actualización existente sin compras internas.

No convertir la app a «Gratis»: Google Play no permite volver a ponerla de pago.

Referencia oficial: https://support.google.com/googleplay/android-developer/answer/140504?hl=es
