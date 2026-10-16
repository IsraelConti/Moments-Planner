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
await page.waitForTimeout(500);
if(errors.length)throw Error('Errores JS al arrancar: '+errors.join('; '));
if(await page.locator('#paywall').isVisible())throw Error('La suscripción simulada no desbloqueó la interfaz');
const destinations=await page.locator('[data-go]').evaluateAll(els=>[...new Set(els.map(e=>e.dataset.go).filter(Boolean))]);
const visited=[];
for(const screen of destinations){
  const btn=page.locator('[data-go="'+screen+'"]').first();
  if(!(await btn.count()))continue;
  await btn.evaluate(el=>el.click());
  await page.waitForTimeout(60);
  if(errors.length)throw Error('Error al navegar a '+screen+': '+errors.join('; '));
  visited.push(screen);
}
if(visited.length<5)throw Error('Cobertura insuficiente: '+visited.length+' pantallas');
console.log(JSON.stringify({result:'PASS',screenCount:visited.length,screens:visited,errors},null,2));
await browser.close();
