import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
const page = await browser.newPage({viewport:{width:390,height:844}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
  window.MomentsAndroid={
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
// Paywall buttons must be responsive and must call the native billing bridge.
await page.evaluate(()=>window.onMomentsSubscription(false,'','Suscripción necesaria'));
if(!(await page.locator('#paywall').isVisible()))throw Error('El paywall no aparece sin suscripción');
await page.evaluate(()=>{window.__billingCalls=[];window.MomentsAndroid.subscribeMonthly=()=>window.__billingCalls.push('subscribe');window.MomentsAndroid.restorePurchases=()=>window.__billingCalls.push('restore');window.MomentsAndroid.exitApp=()=>window.__billingCalls.push('exit');});
const paywallButtons=await page.locator('#paywall button').evaluateAll(els=>els.map(e=>({id:e.id,text:e.textContent.trim()})));
console.log('Paywall buttons:',JSON.stringify(paywallButtons));
// Check every paywall action using the real DOM handlers and a mocked native bridge.
await page.evaluate(()=>window.onMomentsOffer('4,99 €',false));
if(await page.locator('#subscribeBtn').isDisabled())throw Error('Suscribirme no se habilita cuando existe una oferta');
await page.locator('#subscribeBtn').click();
await page.locator('#restorePurchase').click();
await page.locator('#closePaywall').click();
await page.locator('#exitPaywall').click();
const billingCalls=await page.evaluate(()=>window.__billingCalls);
if(JSON.stringify(billingCalls)!==JSON.stringify(['subscribe','restore','exit','exit']))throw Error('Suscripción/restauración no invocan el puente Android: '+JSON.stringify(billingCalls));
await page.evaluate(()=>window.onMomentsOfferUnavailable('Sin oferta'));
if(!(await page.locator('#subscribeBtn').isDisabled()))throw Error('El botón de compra sigue activo sin oferta');
await page.evaluate(()=>window.onMomentsOffer('4,99 €',false));
await page.evaluate(()=>window.onMomentsSubscription(true,'','Suscripción de prueba'));
if(await page.locator('#paywall').isVisible())throw Error('El paywall no se oculta al restaurar una suscripción válida');
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
// Editing an existing project must retain its identifier and collections.
const beforeEdit=await page.evaluate(()=>JSON.parse(localStorage.getItem('moments.planner.v2'))[0]);
await page.locator('#editProject').click();
await page.locator('#projectForm [name="name"]').fill('Boda editada y comprobada');
await page.locator('#projectForm button[type="submit"], #projectForm button:not([type])').last().click();
const afterEdit=await page.evaluate(()=>JSON.parse(localStorage.getItem('moments.planner.v2'))[0]);
if(afterEdit.id!==beforeEdit.id||afterEdit.name!=='Boda editada y comprobada')throw Error('Editar proyecto creó otro registro o no guardó cambios');
if(afterEdit.guests.length!==beforeEdit.guests.length)throw Error('Editar proyecto borró invitados');
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
// Edit all six collections and verify changes survive in the visible lists.
for(const [screen,form,list,field,newValue] of [
  ['guests','guestForm','guestList','name','Invitado editado'],
  ['tasks','taskForm','taskList','title','Tarea editada'],
  ['budget','expenseForm','expenseList','concept','Gasto editado'],
  ['vendors','vendorForm','vendorList','name','Proveedor editado'],
  ['tables','tableForm','tableList','name','Mesa editada'],
  ['schedule','scheduleForm','scheduleList','title','Ceremonia editada']
]){
  await page.evaluate(target=>document.querySelector('[data-go="'+target+'"]').click(),screen);
  await page.locator('#'+list+' [data-edit-item]').first().click();
  await page.locator('#'+form+' [name="'+field+'"]').fill(newValue);
  await page.locator('#'+form+' button').first().click();
  if(!(await page.locator('#'+list).innerText()).includes(newValue))throw Error('Editar registro no guardó: '+screen);
  if(await page.locator('#'+list+' [data-edit-item]').count()!==1)throw Error('Editar registro duplicó: '+screen);
}
// Exercise destructive actions on test-only records and the project lifecycle.
await page.evaluate(()=>document.querySelector('[data-go="guests"]').click());
page.once('dialog',dialog=>dialog.accept());
await page.locator('#guestList [data-delete]').first().click();
if((await page.locator('#guestList').innerText()).includes('Invitado editado'))throw Error('Eliminar invitado no actualiza la lista');
await page.evaluate(()=>document.querySelector('[data-go="home"]').click());
await page.locator('[data-open]').first().click();
await page.locator('#duplicateProject').click();
await page.evaluate(()=>document.querySelector('[data-go="home"]').click());
if(await page.locator('[data-open]').count()!==2)throw Error('Duplicar proyecto no crea una segunda tarjeta');
await page.locator('[data-open]').first().click();
page.once('dialog',dialog=>dialog.accept());
await page.locator('#deleteProject').click();
if(await page.locator('[data-open]').count()!==1)throw Error('Eliminar proyecto no retira la copia');
await page.locator('[data-open]').first().click();
if(await page.locator('.screen.active').getAttribute('data-screen')!=='dashboard')throw Error('No se puede reabrir el proyecto original tras eliminar la copia');
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
// QR generation must produce a real PNG, not just a visible download button.
await page.evaluate(()=>document.querySelector('[data-go="invitation"]').click());
await page.waitForFunction(()=>document.querySelector('#projectQr')?.getAttribute('src')?.startsWith('data:image/png;base64,'),{timeout:15000});
const qrData=await page.locator('#projectQr').getAttribute('src');
if(!qrData||qrData.length<200)throw Error('El QR de la invitación no contiene imagen PNG');
const qrPromise=page.waitForEvent('download',{timeout:10000});
await page.locator('#downloadQr').click();
const qrDownload=await qrPromise;
if(!qrDownload.suggestedFilename().endsWith('.png'))throw Error('La descarga del QR no es PNG');
const qrBytes=await (await import('node:fs/promises')).readFile(await qrDownload.path());
if(qrBytes.length<100||qrBytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('El archivo QR descargado no es un PNG válido');
await page.evaluate(()=>document.querySelector('[data-go="reports"]').click());
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
// Inspect the actual downloaded files, not only their names.
const fs=await import('node:fs/promises');
const icsText=await fs.readFile(await calendarDownload.path(),'utf8');
if(!icsText.includes('BEGIN:VCALENDAR')||!icsText.includes('END:VCALENDAR'))throw Error('El calendario descargado no es un ICS válido');
const excelBytes=await fs.readFile(await excelDownload.path());
if(excelBytes.length<100||excelBytes.subarray(0,2).toString()!=='PK')throw Error('El informe Excel descargado no es un archivo XLSX válido');
const backupText=await fs.readFile(await backupDownload.path(),'utf8');
let backupParsed;try{backupParsed=JSON.parse(backupText)}catch{throw Error('La copia JSON descargada no es válida')}
if(!backupParsed||typeof backupParsed!=='object')throw Error('La copia JSON no contiene datos');
// Restore the exact backup into a deliberately emptied test-only browser state.
if(backupParsed.app!=='Moments Planner'||!Array.isArray(backupParsed.projects)||!backupParsed.projects.length)throw Error('La copia no incluye proyectos válidos');
await page.evaluate(()=>{
  localStorage.setItem('moments.planner.v2','[]');
  localStorage.setItem('moments.settings.v2','{}');
});
await page.reload();
await page.evaluate(()=>window.onMomentsSubscription(true,'','Suscripción de prueba'));
if(await page.locator('[data-open]').count()!==0)throw Error('El estado de prueba no se vació antes de restaurar');
page.once('dialog',dialog=>dialog.accept());
await page.locator('#restoreData').setInputFiles({name:'copia-moments.json',mimeType:'application/json',buffer:Buffer.from(backupText,'utf8')});
await page.waitForFunction(()=>document.querySelectorAll('[data-open]').length>0,{timeout:10000});
const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('moments.planner.v2')||'[]'));
if(restored.length!==backupParsed.projects.length||restored[0]?.name!==backupParsed.projects[0]?.name)throw Error('Restauración incompleta de proyectos');
const restoredSettings=await page.evaluate(()=>JSON.parse(localStorage.getItem('moments.settings.v2')||'{}'));
if(restoredSettings.currency!==backupParsed.settings.currency)throw Error('La restauración no recupera los ajustes');
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
