import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const app=readFileSync('src/app.js','utf8');
const html=readFileSync('src/index.html','utf8');
const native=readFileSync('android/app/src/main/java/com/momentsplanner/events/MainActivity.kt','utf8');
const gradle=readFileSync('android/app/build.gradle.kts','utf8');
for(const key of ['function renderGuests(){','function renderTasks(){','function renderBudget(){','function normalizeProject(p)','function renderTables(){'])
  assert.ok(app.includes(key),'Falta la función '+key);
for(const id of ['guestForm','guestList','guestSummary','taskForm','vendorForm','projectForm'])
  assert.ok(html.includes('id="'+id+'"'),'Falta el elemento '+id);
assert.ok(!html.includes('id="paywall"') && !html.includes('id="subscribeBtn"'),'Quedan controles de suscripción');
assert.ok(!html.includes('id="subscriptionStatus"'),'Queda un estado de cuota mensual');
assert.ok(!app.includes('subscribeMonthly') && !app.includes('window.onMomentsSubscription'),'Quedan llamadas de suscripción en JavaScript');
assert.ok(!native.includes('BillingClient') && !native.includes('querySubscription'),'Quedan consultas de facturación en Android');
assert.ok(!gradle.includes('billing-ktx'),'No debe empaquetarse Google Play Billing para pago único');
assert.ok(gradle.includes('versionCode = 9') && gradle.includes('versionName = "1.3.4"'),'Versión incorrecta');
assert.ok(app.includes('window.onAndroidBack=') && app.includes('window.onMomentsFileSaved'),'Deben conservarse navegación y archivos');
console.log('Auditoría de pago único y regresión: correcta');
