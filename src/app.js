import * as XLSX from "xlsx";
import QRCode from "qrcode";

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const KEY="moments.planner.v2", OLD_KEY="moments.planner.v1";
const SETTINGS="moments.settings.v2", OLD_SETTINGS="moments.settings.v1";
const defaultSettings={appName:"Moments Planner",companyName:"",language:"es",currency:"EUR",tax:21,alertDays:7,urgentDays:2,notifications:true};
const readJson=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback));}catch{return fallback;}};
const blankCollections=()=>({guests:[],tasks:[],expenses:[],vendors:[],schedule:[],tables:[]});
function normalizeProject(p){
  if(!p||typeof p!=="object"||Array.isArray(p))p={};
  const collections=blankCollections();
  Object.keys(collections).forEach(k=>collections[k]=Array.isArray(p?.[k])?p[k]:[]);
  collections.guests=collections.guests.map(g=>({...g,seats:Number(g.seats||1),tableId:g.tableId||""}));
  return {...p,...collections,contingency:{planB:"",transport:"",emergencyContact:"",accessibility:"",operations:"",...(p?.contingency||{})}};
}
const storedProjects=localStorage.getItem(KEY)?readJson(KEY,[]):readJson(OLD_KEY,[]);
let projects=(Array.isArray(storedProjects)?storedProjects:[]).map(normalizeProject);
const storedSettings=localStorage.getItem(SETTINGS)?readJson(SETTINGS,defaultSettings):readJson(OLD_SETTINGS,defaultSettings);
let settings={...defaultSettings,...(storedSettings&&typeof storedSettings==="object"&&!Array.isArray(storedSettings)?storedSettings:{})};
let currentId=localStorage.getItem("moments.current")||"";
let currentScreen="home", historyStack=[], editingProjectId=null;
const titles={home:"Bodas y eventos",projectForm:"Nuevo proyecto",dashboard:"Panel del proyecto",guests:"Invitados",tasks:"Tareas y fechas",budget:"Presupuesto",vendors:"Proveedores",schedule:"Agenda del día",tables:"Mesas",contingency:"Plan B y seguridad",assistant:"Moments IA",invitation:"Invitación y QR",reports:"Informes",help:"Información y ayuda",settings:"Configuración"};
const current=()=>projects.find(p=>p.id===currentId);
const uid=()=>globalThis.crypto?.randomUUID?.()||("id-"+Date.now()+"-"+Math.random().toString(16).slice(2));
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const locale=()=>({es:"es-ES",en:"en-US",fr:"fr-FR",de:"de-DE",it:"it-IT",pt:"pt-PT"}[settings.language]||"es-ES");
const fmt=n=>new Intl.NumberFormat(locale(),{style:"currency",currency:settings.currency||"EUR"}).format(Number(n||0));
const date=v=>v?new Intl.DateTimeFormat(locale(),{dateStyle:"medium"}).format(new Date(v+"T12:00:00")):"Sin fecha";
const todayIso=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");};
const daysBetween=(a,b)=>Math.ceil((new Date(b+"T12:00:00")-new Date(a+"T12:00:00"))/86400000);
const normalizeText=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
const android=()=>window.MomentsAndroid;
const save=()=>{projects=projects.map(normalizeProject);localStorage.setItem(KEY,JSON.stringify(projects));renderAll();};
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2600);}
function downloadBlob(content,type,name){
  const blob=content instanceof Blob?content:new Blob([content],{type});
  if(android()?.saveBase64File){
    const reader=new FileReader();
    reader.onload=()=>android().saveBase64File(name,type,String(reader.result).split(",")[1]||"");
    reader.onerror=()=>toast("No se pudo preparar el archivo");
    reader.readAsDataURL(blob);return;
  }
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);
}

let offerAvailable=false;
window.onMomentsOffer=(price,hasTrial)=>{
  if(!price){window.onMomentsOfferUnavailable("El plan no está disponible en Google Play. Inténtalo más tarde.");return;}
  offerAvailable=true;
  $("#planHeadline").textContent=hasTrial?"3 días gratis":"Suscripción mensual";
  $("#subscriptionPrice").textContent=hasTrial?"Después, "+price+" al mes":price+" al mes";
  $("#subscriptionTerms").textContent=hasTrial?"Después se renueva automáticamente cada mes. Cancela durante la prueba desde Google Play y no se realizará ningún cobro.":"Se renueva automáticamente cada mes y puedes cancelar desde Google Play.";
  $("#subscribeBtn").textContent=hasTrial?"Probar 3 días gratis":"Suscribirme por "+price+" al mes";
  $("#subscribeBtn").disabled=false;
  $("#paywallStatus").textContent=hasTrial?"Google Play ofrece una prueba gratuita de 3 días y después "+price+" al mes.":"Precio de Google Play: "+price+" al mes.";
};
window.onMomentsOfferUnavailable=message=>{
  offerAvailable=false;
  $("#planHeadline").textContent="Suscripción no disponible";
  $("#subscriptionPrice").textContent="No hay precio disponible";
  $("#subscriptionTerms").textContent="No se puede iniciar una compra hasta que Google Play devuelva un precio y unas condiciones válidas.";
  $("#subscribeBtn").disabled=true;
  $("#paywallStatus").textContent=message||"No se pudo consultar el producto en Google Play.";
};
window.onMomentsSubscription=(active,price,message)=>{
  // Subscription status must not overwrite the exact Play offer, trial, or localized price.
  // Only the product-details callback can set the purchase offer displayed to users.
  $("#subscriptionStatus").textContent=active?"Suscripción mensual activa":(message||"Suscripción necesaria");
  $("#paywall").classList.toggle("hidden",!!active);
  $("#subscribeBtn").disabled=!offerAvailable;
  if(!active&&!price)$("#paywallStatus").textContent=message||"Se necesita una suscripción activa para usar Moments Planner.";
};
window.onMomentsPurchaseProgress=message=>{
  $("#subscribeBtn").disabled=true;
  $("#paywallStatus").textContent=message;
};
window.onMomentsPurchaseError=message=>{
  const text=message||"No se pudo completar la operación con Google Play";
  $("#paywallStatus").textContent=text;
  $("#subscribeBtn").disabled=!offerAvailable;
  toast(text);
};
window.onMomentsFileSaved=(success,name)=>toast(success?"Archivo guardado: "+name:"No se pudo guardar el archivo");
$("#subscribeBtn").onclick=()=>{
  if($("#subscribeBtn").disabled)return;
  if(android()?.subscribeMonthly)android().subscribeMonthly();
  else {$("#paywallStatus").textContent="La compra solo está disponible en la aplicación Android de Google Play.";toast("Instala Moments Planner desde Google Play para suscribirte");}
};
$("#restorePurchase").onclick=()=>{
  if(android()?.restorePurchases)android().restorePurchases();
  else {$("#paywallStatus").textContent="La restauración de compras solo está disponible en Android.";toast("Abre Moments Planner en Android para restaurar la compra");}
};
const exitApp=()=>{if(android()?.exitApp){android().exitApp();return;}toast("Para salir, utiliza Atrás o cierra esta pestaña");};
$("#closePaywall").onclick=exitApp;
$("#exitPaywall").onclick=exitApp;
$("#manageSubscription").onclick=()=>android()?.manageSubscription?android().manageSubscription():toast("Gestiona la suscripción desde Google Play");

function go(screen,push=true){
  if(!["home","projectForm","settings","help"].includes(screen)&&!current()){toast("Primero abre o crea un proyecto");screen="home";}
  if(push&&screen!==currentScreen)historyStack.push(currentScreen);
  if(screen!==currentScreen){
    document.querySelectorAll("form[data-editing-id]").forEach(form=>{
      delete form.dataset.editingId;
      form.reset();
      const submit=form.querySelector('button[type="submit"],button:not([type])');
      if(submit?.dataset.defaultLabel){submit.textContent=submit.dataset.defaultLabel;delete submit.dataset.defaultLabel;}
    });
  }
  currentScreen=screen;
  document.querySelectorAll(".screen").forEach(x=>x.classList.toggle("active",x.dataset.screen===screen));
  $("#screenTitle").textContent=titles[screen]||"Moments Planner";
  $("#backBtn").classList.toggle("hidden",screen==="home");
  document.querySelectorAll(".bottom-nav button").forEach(x=>x.classList.toggle("active",x.dataset.go===screen));
  renderAll();scrollTo(0,0);
}
function back(){const previous=historyStack.pop();go(previous&&titles[previous]?previous:"home",false);}
$("#backBtn").addEventListener("click",back);
document.querySelectorAll("[data-back]").forEach(b=>b.addEventListener("click",back));
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.go)));
window.onAndroidBack=()=>{if(!$("#paywall").classList.contains("hidden")||currentScreen==="home")return false;back();return true;};

document.querySelectorAll("[data-new-project]").forEach(b=>b.addEventListener("click",()=>{
  const type=b.dataset.newProject;
  editingProjectId=null;$("#projectForm").reset();$("#projectForm [name=type]").value=type;
  $("#projectFormTitle").textContent=type==="wedding"?"Nueva boda":"Nuevo evento";
  $("#projectEyebrow").textContent=type==="wedding"?"PLANIFICADOR DE BODAS":"ORGANIZADOR DE EVENTOS";
  $("#weddingCoupleField").classList.toggle("hidden",type!=="wedding");
  $("#eventTypeField").classList.toggle("hidden",type!=="event");
  go("projectForm");
}));
$("#editProject").onclick=()=>{
  const p=current();if(!p)return;
  editingProjectId=p.id;
  const form=$("#projectForm");form.reset();
  for(const el of form.elements){if(el.name&&Object.prototype.hasOwnProperty.call(p,el.name))el.value=p[el.name]??"";}
  $("#projectFormTitle").textContent="Editar proyecto";
  $("#projectEyebrow").textContent="ACTUALIZAR DATOS";
  $("#weddingCoupleField").classList.toggle("hidden",p.type!=="wedding");
  $("#eventTypeField").classList.toggle("hidden",p.type!=="event");
  go("projectForm");
};
$("#projectForm").addEventListener("submit",e=>{
  e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));
  const existing=editingProjectId?projects.find(p=>p.id===editingProjectId):null;
  const project=normalizeProject(existing?{...existing,...data}:{...data,id:uid(),createdAt:new Date().toISOString()});
  if(existing){projects=projects.map(p=>p.id===existing.id?project:p);}else{projects.unshift(project);}
  editingProjectId=null;currentId=project.id;localStorage.setItem("moments.current",currentId);save();historyStack=["home"];go("dashboard",false);toast(existing?"Proyecto actualizado":project.type==="wedding"?"Boda creada":"Evento creado");
});

function projectSeats(p,status){
  return p.guests.filter(g=>!status||g.status===status).reduce((sum,g)=>sum+Number(g.seats||1),0);
}
function readiness(p){
  if(!p)return{score:0,issues:[]};
  const issues=[];let earned=0,total=0;
  const check=(points,ok,message,severity="normal")=>{total+=points;if(ok)earned+=points;else issues.push({message,severity});};
  const activeGuests=p.guests.filter(g=>g.status!=="declined"), confirmed=p.guests.filter(g=>g.status==="confirmed");
  const open=p.tasks.filter(t=>!t.done), booked=p.vendors.filter(v=>v.status==="booked");
  const spent=p.expenses.reduce((a,x)=>a+Number(x.amount||0),0), budget=Number(p.budget||0);
  check(7,!!p.date,"Define la fecha definitiva.","urgent");
  check(7,!!p.venue,"Confirma el lugar principal.","high");
  check(6,Number(p.guestTarget||0)>0,"Establece el número previsto de asistentes.");
  check(10,activeGuests.length>0,"Empieza la lista de invitados o asistentes.");
  check(8,activeGuests.length>0&&confirmed.length/Math.max(activeGuests.length,1)>=.65,"Faltan confirmaciones de asistencia.");
  check(10,p.tasks.length>=6,"Crea el plan maestro de tareas.");
  check(8,p.tasks.length>0&&open.length/Math.max(p.tasks.length,1)<=.35,"Todavía hay muchas tareas pendientes.",open.some(t=>t.priority==="urgent")?"urgent":"normal");
  check(10,budget>0&&p.expenses.length>0,"Completa el presupuesto y registra los primeros gastos.","high");
  check(6,budget<=0||spent<=budget,"El presupuesto comprometido supera el máximo.","urgent");
  check(8,booked.length>=3,"Confirma al menos tres proveedores esenciales.");
  check(8,p.schedule.length>=4,"Construye un cronograma detallado del día.");
  check(6,p.type!=="wedding"||p.tables.length>0||projectSeats(p)<10,"Crea las mesas y asigna los asientos.");
  check(6,!!p.contingency?.planB,"Prepara un plan B y contactos críticos.","high");
  return{score:Math.round(earned/total*100),issues};
}
function daysUntil(v){
  if(!v)return"Fecha por definir";
  const d=daysBetween(todayIso(),v);
  return d<0?"Celebrado hace "+Math.abs(d)+" días":d===0?"¡Es hoy!":"Faltan "+d+" días";
}
function renderProjects(){
  $("#projectList").innerHTML=projects.length?projects.map(p=>{
    const r=readiness(p);
    return '<article class="project-card '+esc(p.type)+'"><span class="project-icon"><svg><use href="#'+(p.type==="wedding"?"rings":"party")+'"/></svg></span><div><b>'+esc(p.name)+'</b><small>'+(p.type==="wedding"?"Boda":"Evento")+' · '+date(p.date)+' · '+esc(p.venue||"Lugar pendiente")+'</small><span class="progress"><i style="width:'+r.score+'%"></i></span></div><span class="score-label">'+r.score+'%</span><button class="btn" data-open="'+p.id+'">Abrir</button></article>';
  }).join(""):'<div class="empty"><h3>Aún no hay proyectos</h3><p>Crea tu primera boda o evento con los botones superiores.</p></div>';
  document.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>{currentId=b.dataset.open;localStorage.setItem("moments.current",currentId);go("dashboard");});
}
function renderDashboard(){
  const p=current();if(!p)return;
  const spent=p.expenses.reduce((a,x)=>a+Number(x.amount||0),0),r=readiness(p);
  $("#projectHero").innerHTML='<p class="eyebrow">'+(p.type==="wedding"?"PLANIFICACIÓN DE BODA":"ORGANIZACIÓN DE EVENTO")+'</p><h1>'+esc(p.name)+'</h1><p>'+date(p.date)+(p.time?" · "+esc(p.time):"")+' · '+esc(p.venue||"Lugar pendiente")+'</p><div class="countdown">'+daysUntil(p.date)+'</div>';
  $("#mGuests").textContent=projectSeats(p,"confirmed")+"/"+projectSeats(p);
  $("#mTasks").textContent=p.tasks.filter(x=>!x.done).length;
  $("#mSpent").textContent=fmt(spent);
  $("#mReadiness").textContent=r.score+"%";
  $("#dashboardAlerts").innerHTML=r.issues.length?'<div class="smart-title"><svg><use href="#spark"/></svg><b>Prioridades detectadas</b></div>'+r.issues.slice(0,3).map(x=>'<p class="'+x.severity+'">'+esc(x.message)+'</p>').join(""):'<p class="success-note">Todo avanza correctamente. Revisa la asesora local para afinar los últimos detalles.</p>';
  const actions=[
    ["assistant","spark","Moments IA","Análisis local y plan maestro"],
    ["guests","guests","Invitados","Confirmaciones, menús y asientos"],
    ["tasks","tasks","Tareas","Fechas, responsables y alertas"],
    ["budget","money","Presupuesto","Gastos, pagos y vencimientos"],
    ["vendors","vendors","Proveedores","Contratos, contactos y servicios"],
    ["schedule","calendar","Agenda del día","Cronograma minuto a minuto"],
    ...(p.type==="wedding"?[["tables","tables","Mesas y banquete","Distribución y capacidad"]]:[]),
    ["contingency","shield","Plan B","Logística, seguridad y accesibilidad"],
    ["invitation","qr","Invitación y QR","Compartir y añadir al calendario"],
    ["reports","calendar","Informes","Excel y copia profesional"]
  ];
  $("#dashboardActions").innerHTML=actions.map(a=>'<button class="action '+(a[0]==="assistant"?"ai-action":"")+'" data-go="'+a[0]+'"><svg><use href="#'+a[1]+'"/></svg><b>'+a[2]+'</b><small>'+a[3]+'</small></button>').join("");
  document.querySelectorAll("#dashboardActions [data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
}

function addCollection(form,key,extra={}){
  form.addEventListener("submit",e=>{
    e.preventDefault();const p=current();if(!p)return;
    const existingId=form.dataset.editingId;
    const existing=existingId?p[key].find(x=>x.id===existingId):null;
    const item={...(existing||{}),...Object.fromEntries(new FormData(form)),...(existing?{}:extra),id:existing?.id||uid(),createdAt:existing?.createdAt||new Date().toISOString()};
    if(key==="guests")item.seats=Math.max(1,Number(item.seats||1));
    if(existing)p[key]=p[key].map(x=>x.id===existing.id?item:x);else p[key].push(item);
    delete form.dataset.editingId;save();form.reset();
    if(key==="guests")form.elements.seats.value=1;
    const submit=form.querySelector('button[type="submit"],button:not([type])');if(submit?.dataset.defaultLabel){submit.textContent=submit.dataset.defaultLabel;delete submit.dataset.defaultLabel;}
    toast(existing?"Registro actualizado":"Guardado correctamente");
  });
}
addCollection($("#guestForm"),"guests");
addCollection($("#taskForm"),"tasks",{done:false});
addCollection($("#expenseForm"),"expenses");
addCollection($("#vendorForm"),"vendors");
addCollection($("#scheduleForm"),"schedule");
addCollection($("#tableForm"),"tables");

function empty(text){return'<div class="empty compact"><p>'+esc(text)+'</p></div>';}
function del(key,id){
  const p=current();if(!p)return;
  p[key]=p[key].filter(x=>x.id!==id);
  if(key==="tables")p.guests.forEach(g=>{if(g.tableId===id)g.tableId="";});
  save();toast("Registro eliminado");
}
function editCollection(key,id){
  const p=current();const item=p?.[key]?.find(x=>x.id===id);if(!item)return;
  const forms={guests:"guestForm",tasks:"taskForm",expenses:"expenseForm",vendors:"vendorForm",schedule:"scheduleForm",tables:"tableForm"};
  const form=$("#"+forms[key]);if(!form)return;
  form.reset();form.dataset.editingId=id;
  for(const el of form.elements){if(el.name&&Object.prototype.hasOwnProperty.call(item,el.name))el.value=item[el.name]??"";}
  const submit=form.querySelector('button[type="submit"],button:not([type])');
  if(submit){if(!submit.dataset.defaultLabel)submit.dataset.defaultLabel=submit.textContent;submit.textContent="Guardar cambios";}
  form.scrollIntoView({behavior:"smooth",block:"start"});
}
function bindDeletes(){document.querySelectorAll("[data-edit-item]").forEach(b=>b.onclick=()=>{const [key,id]=b.dataset.editItem.split(":");editCollection(key,id);});document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>{const [key,id]=b.dataset.delete.split(":");if(confirm("¿Eliminar este registro?"))del(key,id);});}
function tableOptions(p,selected){return'<option value="">Sin mesa</option>'+p.tables.map(t=>'<option value="'+t.id+'" '+(t.id===selected?"selected":"")+'>'+esc(t.name)+'</option>').join("");}
function renderGuests(){
  const p=current();if(!p)return;
  const confirmed=projectSeats(p,"confirmed"),pending=projectSeats(p,"pending"),declined=projectSeats(p,"declined"),special=p.guests.filter(g=>g.menu?.trim()).length;
  $("#guestSummary").innerHTML='<div><small>Confirmados</small><b>'+confirmed+'</b></div><div><small>Pendientes</small><b>'+pending+'</b></div><div><small>No asistirán</small><b>'+declined+'</b></div><div><small>Necesidades</small><b>'+special+'</b></div>';
  $("#guestList").innerHTML=p.guests.length?p.guests.map(g=>'<article class="row guest-row"><div><b>'+esc(g.name)+' <em>'+Number(g.seats||1)+' plaza'+(Number(g.seats||1)===1?"":"s")+'</em></b><small>'+esc(g.group||"Sin grupo")+' · '+esc(g.phone||"Sin teléfono")+' · '+esc(g.menu||"Sin necesidades indicadas")+'</small><select data-guest-table="'+g.id+'">'+tableOptions(p,g.tableId)+'</select></div><span class="badge '+esc(g.status)+'">'+(g.status==="confirmed"?"Confirmado":g.status==="declined"?"No asistirá":"Pendiente")+'</span><button class="mini" data-edit-item="guests:'+ g.id+'">Editar</button><button class="mini danger" data-delete="guests:'+ g.id+'">×</button></article>').join(""):empty("Añade invitados y controla sus confirmaciones.");
  document.querySelectorAll("[data-guest-table]").forEach(s=>s.onchange=()=>{const g=p.guests.find(x=>x.id===s.dataset.guestTable);if(g){g.tableId=s.value;save();toast("Mesa asignada");}});
}
function renderTasks(){
  const p=current();if(!p)return;
  $("#taskList").innerHTML=p.tasks.length?[...p.tasks].sort((a,b)=>(a.dueDate||"").localeCompare(b.dueDate||"")).map(t=>{
    const overdue=!t.done&&t.dueDate&&t.dueDate<todayIso();
    return '<article class="row '+(t.done?"done ":"")+(overdue?"overdue":"")+'"><button class="check" data-done="'+t.id+'">'+(t.done?"✓":"")+'</button><div><b>'+esc(t.title)+'</b><small>'+date(t.dueDate)+' · '+esc(t.category||"General")+' · '+esc(t.responsible||"Sin responsable")+' · '+esc(t.priority)+'</small></div><button class="mini" data-edit-item="tasks:'+ t.id+'">Editar</button><button class="mini danger" data-delete="tasks:'+ t.id+'">×</button></article>';
  }).join(""):empty("Añade tareas o deja que Moments IA cree un plan maestro.");
  document.querySelectorAll("[data-done]").forEach(b=>b.onclick=()=>{const t=p.tasks.find(x=>x.id===b.dataset.done);t.done=!t.done;save();});
}
function renderBudget(){
  const p=current();if(!p)return;
  const total=p.expenses.reduce((a,x)=>a+Number(x.amount||0),0),paid=p.expenses.reduce((a,x)=>a+Number(x.paid||0),0),max=Number(p.budget||0);
  $("#budgetSummary").innerHTML='<div><small>Presupuesto</small><b>'+fmt(max)+'</b></div><div><small>Comprometido</small><b>'+fmt(total)+'</b></div><div><small>Pendiente pago</small><b>'+fmt(total-paid)+'</b></div><div><small>Disponible</small><b class="'+(max-total<0?"danger-text":"")+'">'+fmt(max-total)+'</b></div>';
  $("#expenseList").innerHTML=p.expenses.length?p.expenses.map(x=>'<article class="row"><div><b>'+esc(x.concept)+'</b><small>'+esc(x.category||"Otros")+' · Pagado '+fmt(x.paid)+' · Vence '+date(x.dueDate)+'</small></div><strong>'+fmt(x.amount)+'</strong><button class="mini" data-edit-item="expenses:'+ x.id+'">Editar</button><button class="mini danger" data-delete="expenses:'+ x.id+'">×</button></article>').join(""):empty("Registra presupuestos, señales y pagos.");
}
function renderVendors(){
  const p=current();if(!p)return;
  const labels={candidate:"Candidato",quoted:"Presupuesto",booked:"Contratado",discarded:"Descartado"};
  $("#vendorList").innerHTML=p.vendors.length?p.vendors.map(v=>'<article class="row"><div><b>'+esc(v.name)+'</b><small>'+esc(v.service)+' · '+esc(v.contact||"Sin contacto")+' · '+(v.quote?fmt(v.quote):"Sin precio")+' · '+esc(v.notes||"")+'</small></div><span class="badge '+esc(v.status||"candidate")+'">'+(labels[v.status]||"Candidato")+'</span><button class="mini" data-edit-item="vendors:'+ v.id+'">Editar</button><button class="mini danger" data-delete="vendors:'+ v.id+'">×</button></article>').join(""):empty("Añade finca, catering, música, fotografía, decoración, transporte y demás servicios.");
}
function renderSchedule(){
  const p=current();if(!p)return;
  $("#scheduleList").innerHTML=p.schedule.length?[...p.schedule].sort((a,b)=>(a.time||"").localeCompare(b.time||"")).map(x=>'<article><time>'+esc(x.time)+(x.endTime?"–"+esc(x.endTime):"")+'</time><div><b>'+esc(x.title)+'</b><small>'+esc(x.place||"Lugar pendiente")+' · '+esc(x.responsible||"Sin responsable")+'</small></div><button class="mini" data-edit-item="schedule:'+ x.id+'">Editar</button><button class="mini danger" data-delete="schedule:'+ x.id+'">×</button></article>').join(""):empty("Construye el cronograma completo del gran día.");
}
function renderTables(){
  const p=current();if(!p)return;
  $("#tableList").innerHTML=p.tables.length?p.tables.map(t=>{
    const assigned=p.guests.filter(g=>g.tableId===t.id&&g.status!=="declined").reduce((a,g)=>a+Number(g.seats||1),0),cap=Number(t.capacity||0),over=assigned>cap;
    return '<article class="row '+(over?"capacity-over":"")+'"><div><b>'+esc(t.name)+'</b><small>'+assigned+' de '+cap+' plazas · '+esc(t.zone||"Zona sin indicar")+(over?" · CAPACIDAD SUPERADA":"")+'</small><span class="progress"><i style="width:'+Math.min(100,Math.round(assigned/Math.max(cap,1)*100))+'%"></i></span></div><button class="mini" data-edit-item="tables:'+ t.id+'">Editar</button><button class="mini danger" data-delete="tables:'+ t.id+'">×</button></article>';
  }).join(""):empty("Crea las mesas y controla su capacidad.");
}

function renderContingency(){
  const p=current();if(!p||currentScreen!=="contingency")return;
  const f=$("#contingencyForm"),data=p.contingency||{};
  ["planB","transport","emergencyContact","accessibility","operations"].forEach(k=>{if(f.elements[k])f.elements[k].value=data[k]||"";});
}
$("#contingencyForm").onsubmit=e=>{
  e.preventDefault();const p=current();if(!p)return;
  p.contingency={...p.contingency,...Object.fromEntries(new FormData(e.currentTarget))};save();toast("Plan alternativo guardado");back();
};

function dueDateBefore(eventDate,daysBefore,index){
  const now=new Date();now.setHours(12,0,0,0);
  const event=eventDate?new Date(eventDate+"T12:00:00"):new Date(now.getTime()+180*86400000);
  const d=new Date(event.getTime()-daysBefore*86400000);
  if(d<now&&event>=now)d.setTime(now.getTime()+(index+1)*86400000);
  return d.toISOString().slice(0,10);
}
function masterTasks(p){
  const common=[
    ["Definir presupuesto máximo y reserva de contingencia",330,"Presupuesto","high"],
    ["Cerrar lista inicial de invitados o asistentes",300,"Invitados","normal"],
    ["Seleccionar y reservar el espacio",300,"Proveedores","urgent"],
    ["Comparar catering, menús y condiciones de alergias",240,"Proveedores","high"],
    ["Contratar fotografía y vídeo",240,"Proveedores","normal"],
    ["Contratar música, sonido e iluminación",210,"Proveedores","normal"],
    ["Confirmar decoración, flores y montaje",180,"Decoración","normal"],
    ["Preparar invitaciones y sistema de confirmación",150,"Comunicación","normal"],
    ["Revisar contratos, cancelaciones, seguros y permisos",120,"Documentación","high"],
    ["Organizar transporte, accesos y aparcamiento",90,"Logística","normal"],
    ["Realizar prueba de menú y cerrar necesidades especiales",60,"Proveedores","high"],
    ["Crear distribución de mesas o zonas",45,"Invitados","normal"],
    ["Cerrar confirmaciones definitivas",30,"Invitados","urgent"],
    ["Crear cronograma maestro y teléfonos de responsables",21,"Planificación","high"],
    ["Confirmar horarios y pagos con todos los proveedores",14,"Pagos","urgent"],
    ["Revisar previsión, Plan B, accesibilidad y emergencias",7,"Logística","urgent"],
    ["Enviar versión final del cronograma a responsables",3,"Comunicación","urgent"],
    ["Preparar kit de coordinación, copias y pagos finales",1,"Logística","high"]
  ];
  const specific=p.type==="wedding"?[
    ["Definir ceremonia, oficiante y documentación",180,"Documentación","high"],
    ["Confirmar vestuario, pruebas y complementos",120,"Planificación","normal"],
    ["Preparar orden de entrada, discursos y protocolo",30,"Planificación","normal"]
  ]:[
    ["Definir objetivos, público y resultados del evento",240,"Planificación","high"],
    ["Preparar acreditación, señalética y control de acceso",45,"Logística","high"],
    ["Comprobar audiovisuales, ponentes y ensayo técnico",7,"Logística","urgent"]
  ];
  return [...common,...specific].map((x,i)=>({title:x[0],dueDate:dueDateBefore(p.date,x[1],i),category:x[2],priority:x[3],responsible:"",done:false,id:uid(),createdAt:new Date().toISOString()}));
}
function createMasterPlan(){
  const p=current();if(!p)return;
  const existing=new Set(p.tasks.map(t=>normalizeText(t.title)));let added=0;
  masterTasks(p).forEach(t=>{if(!existing.has(normalizeText(t.title))){p.tasks.push(t);added++;}});
  save();toast(added?added+" tareas profesionales añadidas":"El plan maestro ya estaba creado");renderAssistant(true);
}
function adviceItems(p){
  const r=readiness(p),items=[...r.issues];
  const until=p.date?daysBetween(todayIso(),p.date):999;
  const overdue=p.tasks.filter(t=>!t.done&&t.dueDate&&t.dueDate<todayIso());
  const payments=p.expenses.filter(x=>Number(x.amount||0)>Number(x.paid||0)&&x.dueDate&&x.dueDate<=todayIso());
  const special=p.guests.filter(g=>g.menu?.trim());
  if(overdue.length)items.unshift({severity:"urgent",message:overdue.length+" tarea(s) están vencidas y necesitan nueva fecha o responsable."});
  if(payments.length)items.unshift({severity:"urgent",message:payments.length+" pago(s) tienen saldo pendiente y fecha vencida."});
  if(special.length)items.push({severity:"high",message:"Entrega al catering una lista verificada de "+special.length+" necesidad(es) alimentarias o de accesibilidad."});
  if(until<=7&&until>=0)items.unshift({severity:"urgent",message:"Queda una semana o menos: confirma teléfonos, horarios, pagos, meteorología y plan alternativo."});
  if(!items.length)items.push({severity:"normal",message:"El proyecto está equilibrado. Haz una reunión final con responsables y conserva una copia del plan."});
  return items.slice(0,10);
}
function renderAssistant(force=false){
  const p=current();if(!p||currentScreen!=="assistant")return;
  const r=readiness(p);
  $("#aiScore").innerHTML='<div class="score-ring" style="--score:'+r.score+'"><b>'+r.score+'%</b><small>preparado</small></div><div><h3>'+esc(p.name)+'</h3><p>'+daysUntil(p.date)+' · '+projectSeats(p,"confirmed")+' asistentes confirmados · '+p.tasks.filter(t=>!t.done).length+' tareas pendientes</p></div>';
  if(force||!$("#aiAnalysis").innerHTML)renderAiAnalysis();
}
function renderAiAnalysis(){
  const p=current();if(!p)return;
  const items=adviceItems(p);
  $("#aiAnalysis").innerHTML='<div class="smart-title"><svg><use href="#spark"/></svg><b>Diagnóstico profesional</b></div>'+items.map((x,i)=>'<article class="advice '+esc(x.severity)+'"><span>'+(i+1)+'</span><p>'+esc(x.message)+'</p></article>').join("");
}
function budgetAdvice(p){
  const budget=Number(p.budget||0);
  const shares=p.type==="wedding"?[["Espacio y catering",40],["Fotografía y vídeo",12],["Música y entretenimiento",9],["Decoración y flores",10],["Vestuario y belleza",10],["Papelería y detalles",5],["Transporte y logística",5],["Contingencia",9]]:[["Espacio y catering",35],["Producción técnica",18],["Personal y coordinación",12],["Comunicación y acreditación",10],["Decoración y montaje",8],["Seguridad, seguros y permisos",7],["Transporte y logística",5],["Contingencia",5]];
  return "Como referencia inicial, reparte así: "+shares.map(x=>x[0]+" "+x[1]+"%"+(budget?" ("+fmt(budget*x[1]/100)+")":"")).join("; ")+". Ajusta los porcentajes a tus prioridades y reserva siempre una contingencia.";
}
function localAnswer(question,p){
  const q=normalizeText(question),r=readiness(p),confirmed=projectSeats(p,"confirmed"),active=projectSeats(p),unassigned=p.guests.filter(g=>g.status!=="declined"&&!g.tableId).reduce((a,g)=>a+Number(g.seats||1),0);
  if(/falta|pendiente|revis|siguiente|prioridad/.test(q))return "Tu preparación está al "+r.score+"%. Prioridades: "+(adviceItems(p).slice(0,5).map(x=>x.message).join(" ")||"No detecto bloqueos importantes.")+" Pulsa «Crear plan maestro» si todavía no tienes un calendario completo.";
  if(/presupuesto|dinero|gasto|precio|pago|coste/.test(q))return budgetAdvice(p);
  if(/invitado|asistente|mesa|asiento|confirmacion|alerg/.test(q))return "Tienes "+confirmed+" plazas confirmadas de "+active+" activas. "+(unassigned?unassigned+" plazas siguen sin mesa. ":"Todas las plazas activas tienen mesa o aún no has creado asistentes. ")+"Agrupa por afinidad, separa conflictos, coloca menores y personas con movilidad reducida en zonas cómodas y confirma alergias directamente con catering.";
  if(/proveedor|contrato|catering|fotogra|musica|flor|finca/.test(q))return "Antes de contratar confirma por escrito: servicio exacto, horarios de montaje y retirada, personal incluido, impuestos, desplazamientos, plan por cancelación, seguros, forma de pago, sustituciones y contacto operativo del día. No cierres un proveedor esencial sin contrato y justificante.";
  if(/cronograma|horario|agenda|dia del evento|timing/.test(q))return "Construye el día hacia atrás desde el momento principal. Incluye accesos y montaje, pruebas técnicas, recepción, hitos, comidas, discursos, transiciones, desmontaje y márgenes de 10–20 minutos. Cada bloque debe tener lugar y responsable con teléfono.";
  if(/plan b|lluvia|calor|tiempo|emergencia|seguridad|accesibilidad/.test(q))return "El Plan B debe indicar quién decide activarlo, a qué hora, espacio alternativo, comunicación a invitados y proveedores, adaptación de montaje, transporte, electricidad segura, atención sanitaria, accesibilidad y teléfonos críticos. Revisa previsión y aforos con fuentes oficiales.";
  if(/semana|7 dias|ultimo|final/.test(q))return "Una semana antes: cierra asistentes y alergias, confirma todos los horarios y teléfonos, revisa pagos, meteorología y Plan B, envía el cronograma final, prepara copias, kit de emergencia, señalética, distribución y persona responsable de cada incidencia.";
  if(/boda|ceremonia|pareja|protocolo/.test(q))return "Para una boda impecable coordina ceremonia, documentación, orden de entrada, transporte, fotos familiares, cóctel, banquete, discursos, baile, atención a mayores y niños, pagos finales y recogida de objetos personales. Reserva momentos privados para la pareja y márgenes reales.";
  if(/empresa|corporativo|congreso|feria|ponente/.test(q))return "En un evento profesional define objetivo medible, aforo, acreditación, agenda de ponentes, audiovisuales de respaldo, señalética, protección de datos, patrocinadores, catering, seguridad, evacuación y encuesta posterior. Realiza ensayo técnico completo.";
  return "Puedo ayudarte con planificación, presupuesto, invitados, mesas, proveedores, cronograma, contratos, Plan B, seguridad y últimos días. Ahora mismo el proyecto está al "+r.score+"% y la prioridad principal es: "+(adviceItems(p)[0]?.message||"revisar el plan con todos los responsables")+".";
}
$("#analyzeProject").onclick=()=>renderAiAnalysis();
$("#createMasterPlan").onclick=()=>{if(confirm("¿Añadir el plan maestro profesional a las tareas del proyecto?"))createMasterPlan();};
document.querySelectorAll("[data-ai-question]").forEach(b=>b.onclick=()=>{const f=$("#aiForm");f.elements.question.value=b.dataset.aiQuestion;f.requestSubmit();});
$("#aiForm").onsubmit=e=>{
  e.preventDefault();const p=current();if(!p)return;
  const q=e.currentTarget.elements.question.value.trim(),answer=localAnswer(q,p);
  $("#aiConversation").insertAdjacentHTML("afterbegin",'<article><b>Tú</b><p>'+esc(q)+'</p></article><article class="ai-reply"><b>Moments IA</b><p>'+esc(answer)+'</p></article>');
  e.currentTarget.reset();
};

function shareText(p){return p.name+"\n"+date(p.date)+(p.time?" · "+p.time:"")+"\n"+(p.venue||"Lugar por confirmar")+(p.city?" · "+p.city:"")+"\n"+(p.dressCode?"Vestimenta: "+p.dressCode+"\n":"")+(p.client||p.couple?"Contacto: "+(p.client||p.couple)+" "+(p.phone||""):"");}
async function renderInvitation(){
  const p=current();if(!p||currentScreen!=="invitation")return;
  const text=shareText(p);$("#sharePreview").textContent=text;
  try{$("#projectQr").src=await QRCode.toDataURL(text,{width:700,margin:2,color:{dark:"#21142f",light:"#fffaf6"}});}catch{$("#projectQr").removeAttribute("src");}
}
$("#downloadQr").onclick=()=>{const img=$("#projectQr");if(!img.src)return toast("Espera a que se genere el QR");const name=(current()?.name||"Moments_Planner")+"_QR.png";if(android()?.saveBase64File){android().saveBase64File(name,"image/png",img.src.split(",")[1]||"");}else{const a=document.createElement("a");a.href=img.src;a.download=name;a.click();}};
$("#copyShareText").onclick=async()=>{
  const text=$("#sharePreview").textContent;
  try{if(!navigator.clipboard?.writeText)throw new Error("Clipboard API unavailable");await navigator.clipboard.writeText(text);toast("Texto copiado");}catch{const t=document.createElement("textarea");t.value=text;document.body.append(t);t.select();const copied=document.execCommand("copy");t.remove();toast(copied?"Texto copiado":"No se pudo copiar. Mantén pulsado el texto para seleccionarlo.");}
};
function icsEscape(v){return String(v||"").replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;");}
$("#downloadCalendar").onclick=()=>{
  const p=current();if(!p?.date)return toast("El proyecto necesita una fecha");
  const start=(p.date.replace(/-/g,"")+(p.time?"T"+p.time.replace(":","")+"00":"T090000")),end=p.date.replace(/-/g,"")+"T235900";
  const content=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Moments Planner//ES","BEGIN:VEVENT","UID:"+p.id+"@momentsplanner","DTSTART:"+start,"DTEND:"+end,"SUMMARY:"+icsEscape(p.name),"LOCATION:"+icsEscape([p.venue,p.city].filter(Boolean).join(", ")),"DESCRIPTION:"+icsEscape(p.notes||"Evento organizado con Moments Planner"),"END:VEVENT","END:VCALENDAR"].join("\r\n");
  downloadBlob(content,"text/calendar;charset=utf-8",(p.name||"Evento")+".ics");
};

function rows(type){
  const p=current();if(!p)return[];
  if(type==="guests")return p.guests.map(x=>({Nombre:x.name,Estado:x.status,Plazas:Number(x.seats||1),Grupo:x.group,Teléfono:x.phone,Menú_necesidades:x.menu,Mesa:p.tables.find(t=>t.id===x.tableId)?.name||""}));
  if(type==="budget")return p.expenses.map(x=>({Categoría:x.category,Concepto:x.concept,Importe:Number(x.amount||0),Pagado:Number(x.paid||0),Pendiente:Number(x.amount||0)-Number(x.paid||0),Vencimiento:x.dueDate}));
  return p.tasks.map(x=>({Tarea:x.title,Categoría:x.category,Fecha:x.dueDate,Prioridad:x.priority,Responsable:x.responsible,Completada:x.done?"Sí":"No"}));
}
function addSheet(wb,name,data){
  const safe=data.length?data:[{Información:"Sin registros"}],ws=XLSX.utils.json_to_sheet(safe);
  ws["!cols"]=Object.keys(safe[0]).map(k=>({wch:Math.max(16,k.length+4)}));if(ws["!ref"])ws["!autofilter"]={ref:ws["!ref"]};
  XLSX.utils.book_append_sheet(wb,ws,name);
}
function excel(type,name){
  const data=rows(type);if(!data.length)return toast("No hay datos para exportar");
  const wb=XLSX.utils.book_new();addSheet(wb,name,data);saveWorkbook(wb,(current().name||"Moments_Planner")+"_"+name+".xlsx");
}
function saveWorkbook(wb,name){const bytes=XLSX.write(wb,{bookType:"xlsx",type:"array"});downloadBlob(bytes,"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",name);toast("Excel preparado");}
$("#exportGuests").onclick=()=>excel("guests","Invitados");
$("#exportBudget").onclick=()=>excel("budget","Presupuesto");
$("#exportFull").onclick=()=>{
  const p=current();if(!p)return;const wb=XLSX.utils.book_new(),r=readiness(p);
  addSheet(wb,"Resumen",[{Proyecto:p.name,Tipo:p.type,Fecha:p.date,Hora:p.time,Lugar:p.venue,Ciudad:p.city,Estilo:p.style,Invitados_previstos:p.guestTarget,Confirmados:projectSeats(p,"confirmed"),Presupuesto:Number(p.budget||0),Preparación:r.score+"%"}]);
  addSheet(wb,"Invitados",rows("guests"));addSheet(wb,"Tareas",rows("tasks"));addSheet(wb,"Presupuesto",rows("budget"));
  addSheet(wb,"Proveedores",p.vendors.map(v=>({Proveedor:v.name,Servicio:v.service,Estado:v.status,Contacto:v.contact,Presupuesto:Number(v.quote||0),Notas:v.notes})));
  addSheet(wb,"Agenda",p.schedule.map(x=>({Inicio:x.time,Fin:x.endTime,Actividad:x.title,Lugar:x.place,Responsable:x.responsible})));
  addSheet(wb,"Mesas",p.tables.map(t=>({Mesa:t.name,Capacidad:Number(t.capacity||0),Zona:t.zone,Asignados:p.guests.filter(g=>g.tableId===t.id&&g.status!=="declined").reduce((a,g)=>a+Number(g.seats||1),0)})));
  addSheet(wb,"Plan B",[p.contingency]);addSheet(wb,"Prioridades",adviceItems(p).map(x=>({Prioridad:x.severity,Recomendación:x.message})));
  saveWorkbook(wb,(p.name||"Moments_Planner")+"_Plan_profesional.xlsx");
};

function applySettings(){
  $("#appName").textContent=settings.appName||"Moments Planner";
  const symbol=new Intl.NumberFormat(locale(),{style:"currency",currency:settings.currency||"EUR"}).formatToParts(0).find(x=>x.type==="currency")?.value||"€";
  document.querySelectorAll(".currency").forEach(x=>x.textContent=symbol);
  const f=$("#settingsForm");Object.entries(settings).forEach(([k,v])=>{if(!f.elements[k])return;f.elements[k].type==="checkbox"?f.elements[k].checked=!!v:f.elements[k].value=v;});
}
$("#settingsForm").onsubmit=e=>{e.preventDefault();const f=new FormData(e.currentTarget);settings={...settings,...Object.fromEntries(f),notifications:f.has("notifications")};localStorage.setItem(SETTINGS,JSON.stringify(settings));applySettings();toast("Configuración guardada");back();};
$("#backupData").onclick=()=>downloadBlob(JSON.stringify({app:"Moments Planner",version:2,exportedAt:new Date().toISOString(),settings,projects},null,2),"application/json","Moments_Planner_Copia_"+todayIso()+".json");
$("#restoreData").onchange=async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
    const data=JSON.parse(await file.text());if(!Array.isArray(data.projects))throw new Error();
    if(!confirm("La copia sustituirá los proyectos actuales. ¿Continuar?"))return;
    projects=data.projects.map(normalizeProject);settings={...defaultSettings,...(data.settings||{})};currentId=projects[0]?.id||"";
    localStorage.setItem(KEY,JSON.stringify(projects));localStorage.setItem(SETTINGS,JSON.stringify(settings));localStorage.setItem("moments.current",currentId);applySettings();go("home",false);toast("Copia restaurada correctamente");
  }catch{toast("La copia no es válida o está dañada");}finally{e.target.value="";}
};

$("#duplicateProject").onclick=()=>{
  const p=current();if(!p)return;const copy=normalizeProject(JSON.parse(JSON.stringify(p))),idMap={};
  copy.id=uid();copy.name=p.name+" — Copia";copy.createdAt=new Date().toISOString();
  Object.keys(blankCollections()).forEach(k=>{copy[k]=copy[k].map(x=>{const old=x.id,n={...x,id:uid()};idMap[old]=n.id;return n;});});
  copy.guests.forEach(g=>{g.tableId=idMap[g.tableId]||"";});
  projects.unshift(copy);currentId=copy.id;localStorage.setItem("moments.current",currentId);save();toast("Proyecto duplicado");
};
$("#deleteProject").onclick=()=>{
  const p=current();if(!p||!confirm("¿Eliminar definitivamente "+p.name+"?"))return;
  projects=projects.filter(x=>x.id!==p.id);currentId=projects[0]?.id||"";localStorage.setItem("moments.current",currentId);save();historyStack=[];go("home",false);toast("Proyecto eliminado");
};

function renderAll(){
  renderProjects();renderDashboard();renderGuests();renderTasks();renderBudget();renderVendors();renderSchedule();renderTables();renderContingency();renderAssistant();renderInvitation();bindDeletes();
}

applySettings();save();go("home",false);
$("#paywall").classList.remove("hidden");
window.onMomentsOfferUnavailable("Comprueba la suscripción en Google Play.");
if(android()?.checkSubscription)android().checkSubscription();
else $("#paywallStatus").textContent="La suscripción se puede comprobar al abrir esta aplicación desde Google Play.";

