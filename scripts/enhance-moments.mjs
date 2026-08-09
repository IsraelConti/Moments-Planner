import { readFile, writeFile } from 'node:fs/promises';

const path='src/app.js';
let s=await readFile(path,'utf8');

s=s.replace(
'collections.guests=collections.guests.map(g=>({...g,seats:Number(g.seats||1),tableId:g.tableId||""}));',
'collections.guests=collections.guests.map(g=>({...g,seats:Number(g.seats||1),tableId:g.tableId||"",email:g.email||"",ageGroup:g.ageGroup||"adult",child:g.child||false,accessibility:g.accessibility||"",transport:g.transport||"",hotel:g.hotel||"",gift:g.gift||"",notes:g.notes||"",mustSitWith:g.mustSitWith||"",avoidWith:g.avoidWith||""}));'
);

const marker='addCollection($("#guestForm"),"guests");';
const guestPro=`
(function enhanceGuestForm(){
 const f=$("#guestForm"); if(!f||f.dataset.pro)return; f.dataset.pro="1";
 const more=document.createElement("details"); more.className="guest-pro-fields";
 more.innerHTML='<summary>Más datos del invitado</summary><div class="quick-form"><input name="email" type="email" placeholder="Correo"><select name="ageGroup"><option value="adult">Adulto</option><option value="child">Niño/a</option><option value="senior">Persona mayor</option></select><input name="accessibility" placeholder="Accesibilidad / movilidad"><input name="transport" placeholder="Transporte"><input name="hotel" placeholder="Hotel / alojamiento"><input name="mustSitWith" placeholder="Debe sentarse con..."><input name="avoidWith" placeholder="Conviene separar de..."><input name="gift" placeholder="Regalo / detalle"><input name="notes" placeholder="Notas privadas"></div>';
 f.insertBefore(more,f.lastElementChild);
})();
`;
s=s.replace(marker,guestPro+'\n'+marker);

s=s.replace(
'if(key==="guests")item.seats=Math.max(1,Number(item.seats||1));',
'if(key==="guests"){item.seats=Math.max(1,Number(item.seats||1));item.child=item.ageGroup==="child";}'
);

s=s.replace(
'const special=p.guests.filter(g=>g.menu?.trim());',
'const special=p.guests.filter(g=>g.menu?.trim()||g.accessibility?.trim());'
);

// RSVP editable directly on every guest card: Pendiente / Sí asistirá / No asistirá.
const oldGuestCard='</div><span class="badge "+esc(g.status)+"">"+(g.status==="confirmed"?"Confirmado":g.status==="declined"?"No asistirá":"Pendiente")+"</span><button class="mini danger" data-delete="guests:"+g.id+"">×</button></article>';
const newGuestCard='</div><select class="guest-status-control badge "+esc(g.status)+"" data-guest-status="'+"'+g.id+'"+'"><option value="pending" '+"'+(g.status===\"pending\"?\"selected\":\"\")+'"+'>Pendiente</option><option value="confirmed" '+"'+(g.status===\"confirmed\"?\"selected\":\"\")+'"+'>Sí asistirá</option><option value="declined" '+"'+(g.status===\"declined\"?\"selected\":\"\")+'"+'>No asistirá</option></select><button class="mini danger" data-delete="guests:'+"'+g.id+'"+'">×</button></article>';
s=s.replace(oldGuestCard,newGuestCard);

const tableBinder='$$(["[data-guest-table]"]).forEach';
// Insert the status handler immediately before the existing table selector handler using its literal source.
const tableHandler='$$('[0];
const statusAnchor='  $$("[data-guest-table]").forEach(s=>s.onchange=()=>{';
const statusHandler='  $$("[data-guest-status]").forEach(sel=>sel.onchange=()=>{const g=p.guests.find(x=>x.id===sel.dataset.guestStatus);if(!g)return;g.status=sel.value;if(g.status==="declined")g.tableId="";save();toast(g.status==="confirmed"?"Asistencia confirmada":g.status==="declined"?"Marcado como no asistirá":"Invitado pendiente");});\n';
s=s.replace(statusAnchor,statusHandler+statusAnchor);

s=s.replace(
'const q=normalizeText(question),r=readiness(p),confirmed=projectSeats(p,"confirmed"),active=projectSeats(p),unassigned=p.guests.filter(g=>g.status!=="declined"&&!g.tableId).reduce((a,g)=>a+Number(g.seats||1),0);',
'const q=normalizeText(question),r=readiness(p),confirmed=projectSeats(p,"confirmed"),active=projectSeats(p),pending=projectSeats(p,"pending"),declined=projectSeats(p,"declined"),unassigned=p.guests.filter(g=>g.status==="confirmed"&&!g.tableId).reduce((a,g)=>a+Number(g.seats||1),0),children=p.guests.filter(g=>g.ageGroup==="child"&&g.status!=="declined").length,access=p.guests.filter(g=>g.accessibility?.trim()&&g.status!=="declined").length,spent=p.expenses.reduce((a,x)=>a+Number(x.amount||0),0),paid=p.expenses.reduce((a,x)=>a+Number(x.paid||0),0),budget=Number(p.budget||0);'
);

s=s.replace(
'if(/invitado|asistente|mesa|asiento|confirmacion|alerg/.test(q))return "Tienes "+confirmed+" plazas confirmadas de "+active+" activas. "+(unassigned?unassigned+" plazas siguen sin mesa. ":"Todas las plazas activas tienen mesa o aún no has creado asistentes. ")+"Agrupa por afinidad, separa conflictos, coloca menores y personas con movilidad reducida en zonas cómodas y confirma alergias directamente con catering.";',
'if(/invitado|asistente|mesa|asiento|confirmacion|alerg/.test(q))return "MOMENTS EXPERT: "+confirmed+" plazas confirmadas, "+pending+" pendientes y "+declined+" que no asistirán. "+(unassigned?"ATENCIÓN: "+unassigned+" plazas confirmadas siguen sin mesa. ":"No detecto confirmados sin mesa. ")+(children?children+" ficha(s) infantil(es). ":"")+(access?access+" invitado(s) con necesidades de accesibilidad. ":"")+"Revisa alergias, afinidades, parejas/familias y personas que conviene separar antes de cerrar el seating plan.";'
);

s=s.replace(
'if(/presupuesto|dinero|gasto|precio|pago|coste/.test(q))return budgetAdvice(p);',
'if(/presupuesto|dinero|gasto|precio|pago|coste/.test(q))return "MOMENTS EXPERT: presupuesto "+fmt(budget)+", comprometido "+fmt(spent)+", pagado "+fmt(paid)+", pendiente "+fmt(Math.max(0,spent-paid))+" y disponible "+fmt(budget-spent)+". "+(confirmed?"Coste comprometido aproximado por plaza confirmada: "+fmt(spent/confirmed)+". ":"")+(budget&&spent>budget?"ALERTA: has superado el presupuesto. ":"")+budgetAdvice(p);'
);

s=s.replace(
'if(!items.length)items.push({severity:"normal",message:"El proyecto está equilibrado. Haz una reunión final con responsables y conserva una copia del plan."});',
'const confirmedNoTable=p.guests.filter(g=>g.status==="confirmed"&&!g.tableId).reduce((a,g)=>a+Number(g.seats||1),0);\n  const pendingSeats=projectSeats(p,"pending");\n  const duplicateNames=p.guests.map(g=>normalizeText(g.name)).filter((n,i,a)=>n&&a.indexOf(n)!==i);\n  const overTables=p.tables.filter(t=>p.guests.filter(g=>g.tableId===t.id&&g.status!=="declined").reduce((a,g)=>a+Number(g.seats||1),0)>Number(t.capacity||0));\n  if(confirmedNoTable)items.unshift({severity:"urgent",message:confirmedNoTable+" plaza(s) confirmadas todavía no tienen mesa asignada."});\n  if(pendingSeats)items.push({severity:"high",message:pendingSeats+" plaza(s) siguen pendientes de confirmar asistencia."});\n  if(overTables.length)items.unshift({severity:"urgent",message:overTables.length+" mesa(s) superan su capacidad. Reorganiza el seating plan."});\n  if(duplicateNames.length)items.push({severity:"high",message:"Hay posibles invitados duplicados. Revisa la lista antes de cerrar el aforo."});\n  if(!items.length)items.push({severity:"normal",message:"El proyecto está equilibrado. Haz una reunión final con responsables y conserva una copia del plan."});'
);

await writeFile(path,s);
console.log('Moments Expert enhancements applied');