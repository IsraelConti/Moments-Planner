import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
const page = await browser.newPage({viewport:{width:390,height:844}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
  window.Android={
    checkSubscription(){setTimeout(()=>window.onMomentsSubscription?.(true,'','Suscripción de prueba'),50)},
    subscribeMonthly(){},restorePurchases(){},
    exitApp(){},copyShareText(){},
  };
});
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForFunction(()=>typeof window.onMomentsSubscription==='function',{timeout:10000});
await page.evaluate(()=>window.onMomentsSubscription(true,'','Suscripción de prueba'));
await page.waitForTimeout(500);
if(errors.length)throw Error('Errores JS al arrancar: '+errors.join('; '));
if(await page.locator('#paywall').isVisible())throw Error('La suscripción simulada no desbloqueó la interfaz');
// Verify that a real project can be created and becomes the active dashboard.
await page.locator('[data-new-project="wedding"]').first().click();
if(await page.locator('.screen.active').getAttribute('data-screen')!=='projectForm')throw Error('Crear boda no abre el formulario');
await page.locator('#projectForm [name="name"]').fill('Boda de prueba automática');
await page.locator('#projectForm [name="date"]').fill('2027-06-12');
await page.locator('#projectForm button[type="submit"], #projectForm button:not([type])').last().click();
if(await page.locator('.screen.active').getAttribute('data-screen')!=='dashboard')throw Error('Guardar proyecto no abre el panel');
if(!(await page.evaluate(()=>localStorage.getItem('moments.current'))))throw Error('El proyecto no se guardó como activo');
await page.reload();
await page.evaluate(()=>window.onMomentsSubscription(true,'','Suscripción de prueba'));
await page.locator('[data-open]').first().click();
if(await page.locator('.screen.active').getAttribute('data-screen')!=='dashboard')throw Error('El proyecto no persiste tras recargar');
// Exercise actual forms and persisted project records, not only navigation.
for(const [screen,form,fields,list,needle] of [
  ['guests','guestForm',{name:'Invitado de prueba'},'guestList','Invitado de prueba'],
  ['tasks','taskForm',{title:'Tarea de prueba',dueDate:'2027-06-01'},'taskList','Tarea de prueba'],
  ['budget','expenseForm',{concept:'Gasto de prueba',amount:'125'},'expenseList','Gasto de prueba'],
  ['vendors','vendorForm',{name:'Proveedor de prueba',service:'Música'},'vendorList','Proveedor de prueba'],
  ['tables','tableForm',{name:'Mesa de prueba',capacity:'8'},'tableList','Mesa de prueba'],
  ['schedule','scheduleForm',{time:'18:30',title:'Ceremonia de prueba'},'scheduleList','Ceremonia de prueba']
]){
  await page.evaluate(target=>document.querySelector('[data-go="'+target+'"]').click(),screen);
  if(await page.locator('.screen.active').getAttribute('data-screen')!==screen)throw Error('No abre '+screen);
  for(const [name,value] of Object.entries(fields))await page.locator('#'+form+' [name="'+name+'"]').fill(value);
  await page.locator('#'+form+' button').first().click();
  if(!(await page.locator('#'+list).innerText()).includes(needle))throw Error('No se agregó '+needle);
}
// Save user preferences and verify they survive a full reload.
await page.evaluate(()=>document.querySelector('[data-go="settings"]').click());
await page.locator('#settingsForm [name="currency"]').selectOption('GBP');
await page.locator('#settingsForm [name="language"]').selectOption('en');
await page.locator('#settingsForm button').last().click();
await page.reload();
await page.evaluate(()=>window.onMomentsSubscription(true,'','Suscripción de prueba'));
const prefs=await page.evaluate(()=>JSON.parse(localStorage.getItem('moments.settings.v2')||'{}'));
if(prefs.currency!=='GBP'||prefs.language!=='en')throw Error('La configuración no persiste al reiniciar');
// Verify sharing and export controls exist and are enabled.
await page.locator('[data-open]').first().click();
for(const screen of ['invitation','reports']){
  await page.evaluate(target=>document.querySelector('[data-go="'+target+'"]').click(),screen);
  if(await page.locator('.screen.active').getAttribute('data-screen')!==screen)throw Error('No abre '+screen);
}
// Exercise real export buttons and validate downloaded content.
const calendarPromise=page.waitForEvent('download',{timeout:10000});
await page.locator('#downloadCalendar').evaluate(el=>el.click());
const calendarDownload=await calendarPromise;
if(!calendarDownload.suggestedFilename().endsWith('.ics'))throw Error('El calendario no descarga un archivo ICS');
const excelPromise=page.waitForEvent('download',{timeout:15000});
await page.locator('#exportFull').evaluate(el=>el.click());
const excelDownload=await excelPromise;
if(!/\.xlsx?$/i.test(excelDownload.suggestedFilename()))throw Error('El informe no descarga Excel: '+excelDownload.suggestedFilename());
await page.evaluate(()=>document.querySelector('[data-go="settings"]').click());
const backupPromise=page.waitForEvent('download',{timeout:10000});
await page.locator('#backupData').evaluate(el=>el.click());
const backupDownload=await backupPromise;
if(!backupDownload.suggestedFilename().endsWith('.json'))throw Error('La copia de seguridad no descarga JSON');
const destinations=await page.locator('[data-go]').evaluateAll(els=>[...new Set(els.map(e=>e.dataset.go).filter(Boolean))]);
const visited=[];
for(const screen of destinations){
  const btn=page.locator('[data-go="'+screen+'"]').first();
  if(!(await btn.count()))continue;
  await btn.evaluate(el=>el.click());
  await page.waitForTimeout(60);
  if(errors.length)throw Error('Error al navegar a '+screen+': '+errors.join('; '));
  const actual=await page.locator('.screen.active').first().getAttribute('data-screen');
  if(actual!==screen && !(actual==='home' && !['home','projectForm','settings','help'].includes(screen))){
    throw Error('Navegación incorrecta: botón '+screen+' mostró '+actual);
  }
  visited.push(screen);
}
if(visited.length<5)throw Error('Cobertura insuficiente: '+visited.length+' pantallas');
console.log(JSON.stringify({result:'PASS',screenCount:visited.length,screens:visited,errors},null,2));
await browser.close();
