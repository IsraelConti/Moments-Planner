import { readFile, writeFile } from 'node:fs/promises';

const path='src/app.js';
let s=await readFile(path,'utf8');
const replaceRequired=(from,to,label)=>{if(!s.includes(from))throw new Error('Enhancement anchor not found: '+label);s=s.replace(from,to);};

replaceRequired(
'collections.guests=collections.guests.map(g=>({...g,seats:Number(g.seats||1),tableId:g.tableId||""}));',
'collections.guests=collections.guests.map(g=>({...g,seats:Number(g.seats||1),tableId:g.tableId||"",status:["pending","confirmed","declined"].includes(g.status)?g.status:"pending",email:g.email||"",ageGroup:g.ageGroup||"adult",accessibility:g.accessibility||"",transport:g.transport||"",hotel:g.hotel||"",gift:g.gift||"",notes:g.notes||"",mustSitWith:g.mustSitWith||"",avoidWith:g.avoidWith||""}));',
'guest normalization');

replaceRequired(
'if(key==="guests")item.seats=Math.max(1,Number(item.seats||1));',
'if(key==="guests"){item.seats=Math.max(1,Number(item.seats||1));item.status=item.status||"pending";item.tableId=item.tableId||"";}',
'new guest defaults');

const guestFormAnchor='addCollection($("#guestForm"),"guests");';
replaceRequired(guestFormAnchor,`(function enhanceGuestForm(){
 const f=$("#guestForm"); if(!f||f.dataset.pro)return; f.dataset.pro="1";
 const more=document.createElement("details"); more.className="guest-pro-fields";
 more.innerHTML='<summary>Más datos del invitado</summary><div class="quick-form"><input name="email" type="email" placeholder="Correo"><select name="ageGroup"><option value="adult">Adulto</option><option value="child">Niño/a</option><option value="senior">Persona mayor</option></select><input name="accessibility" placeholder="Accesibilidad / movilidad"><input name="transport" placeholder="Transporte"><input name="hotel" placeholder="Hotel / alojamiento"><input name="mustSitWith" placeholder="Debe sentarse con..."><input name="avoidWith" placeholder="Conviene separar de..."><input name="gift" placeholder="Regalo / detalle"><input name="notes" placeholder="Notas privadas"></div>';
 f.insertBefore(more,f.lastElementChild);
})();
${guestFormAnchor}`,'guest professional fields');

const start=s.indexOf('function renderGuests(){');
const end=s.indexOf('\nfunction renderTasks(){',start);
if(start<0||end<0)throw new Error('Could not locate renderGuests');
const renderGuests=`function renderGuests(){
  const p=current();if(!p)return;
  const confirmed=projectSeats(p,"confirmed"),pending=projectSeats(p,"pending"),declined=projectSeats(p,"declined"),special=p.guests.filter(g=>g.menu?.trim()||g.accessibility?.trim()).length;
  $("#guestSummary").innerHTML='<div><small>Confirmados</small><b>'+confirmed+'</b></div><div><small>Pendientes</small><b>'+pending+'</b></div><div><small>No asistirán</small><b>'+declined+'</b></div><div><small>Necesidades</small><b>'+special+'</b></div>';
  $("#guestList").innerHTML=p.guests.length?p.guests.map(g=>'<article class="row guest-row"><div><b>'+esc(g.name)+' <em>'+Number(g.seats||1)+' plaza'+(Number(g.seats||1)===1?"":"s")+'</em></b><small>'+esc(g.group||"Sin grupo")+' · '+esc(g.phone||"Sin teléfono")+' · '+esc(g.menu||g.accessibility||"Sin necesidades indicadas")+'</small><label class="guest-field-label">Asistencia<select data-guest-status="'+g.id+'"><option value="pending" '+(g.status==="pending"?"selected":"")+'>Pendiente</option><option value="confirmed" '+(g.status==="confirmed"?"selected":"")+'>Sí asistirá</option><option value="declined" '+(g.status==="declined"?"selected":"")+'>No asistirá</option></select></label><label class="guest-field-label">Mesa<select data-guest-table="'+g.id+'" '+(g.status==="declined"?"disabled":"")+'>'+tableOptions(p,g.tableId)+'</select></label></div><button class="mini" data-edit-item="guests:'+g.id+'">Editar</button><button class="mini danger" data-delete="guests:'+g.id+'">×</button></article>').join(""):empty("Añade invitados y controla sus confirmaciones.");
  $$("[data-guest-status]").forEach(sel=>sel.onchange=()=>{const g=p.guests.find(x=>x.id===sel.dataset.guestStatus);if(!g)return;const old=g.status;g.status=sel.value;if(g.status==="declined")g.tableId="";save();toast(g.status==="confirmed"?"Asistencia confirmada y guardada":g.status==="declined"?"No asistirá: plaza de mesa liberada":"Estado cambiado a pendiente");});
  $$("[data-guest-table]").forEach(sel=>sel.onchange=()=>{const g=p.guests.find(x=>x.id===sel.dataset.guestTable);if(g){if(g.status==="declined"){g.tableId="";save();toast("No se asigna mesa a quien no asistirá");return;}g.tableId=sel.value;save();toast("Mesa asignada y guardada");}});
  bindDeletes();
}`;
s=s.slice(0,start)+renderGuests+s.slice(end);

// Strengthen proactive project checks.
const readinessAnchor='const activeGuests=p.guests.filter(g=>g.status!=="declined"), confirmed=p.guests.filter(g=>g.status==="confirmed");';
replaceRequired(readinessAnchor,readinessAnchor+'\n  const pendingGuests=p.guests.filter(g=>g.status==="pending"), confirmedNoTable=confirmed.filter(g=>!g.tableId);','readiness RSVP checks');
replaceRequired('check(8,activeGuests.length>0&&confirmed.length/Math.max(activeGuests.length,1)>=.65,"Faltan confirmaciones de asistencia.");','check(8,activeGuests.length>0&&pendingGuests.length===0,"Todavía hay "+projectSeats(p,"pending")+" plaza(s) pendientes de confirmar asistencia.",pendingGuests.length?"high":"normal");\n  check(7,p.type!=="wedding"||confirmedNoTable.length===0,"Hay "+confirmedNoTable.reduce((a,g)=>a+Number(g.seats||1),0)+" plaza(s) confirmadas sin mesa.","urgent");','readiness confirmations');

await writeFile(path,s);
console.log('Moments Expert full RSVP and guest enhancements applied successfully');