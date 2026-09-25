import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {initial} from '../src/domain.js';
const {chromium}=await import(process.argv[2]?pathToFileURL(process.argv[2]).href:'playwright');
const root=path.resolve(new URL('..',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{try{const name=new URL(req.url,'http://local').pathname;const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-cache');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true});
const errors=[];const results=[];
const context=await browser.newContext({viewport:{width:1024,height:600}});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const url=`http://127.0.0.1:${server.address().port}`;
const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('volleystats.match.v1')));
async function reset(s=initial(),rosterName='Plantilla test') {
 s.demo=false;
 await page.goto(url);
 await page.evaluate(({s,rosterName})=>{
  localStorage.clear();
  localStorage.setItem('volleystats.match.v1',JSON.stringify(s));
  localStorage.setItem(
   'volleystats.rosters.v1',
   JSON.stringify([
    {
     id:'test-roster',
     name:rosterName,
     players:s.roster,
    },
   ]),
  );
 },{s,rosterName});
 await page.reload();
 await page.locator('.court').waitFor();
}
async function tap(cmd){await page.locator(`[data-cmd="${cmd}"]`).first().click();}
async function press(...keys){for(const key of keys)await page.keyboard.press(key);}
async function setupLineup(){return page.locator('.setup-lineup-player').evaluateAll((buttons)=>buttons.sort((a,b)=>Number(a.dataset.setupZone)-Number(b.dataset.setupZone)).map((button)=>Number(button.querySelector('.jersey').textContent.trim())));}
async function commit(cmd){await page.waitForTimeout(420);await tap(cmd);}
async function undo(){await tap('undo');await commit('confirm-undo');}
async function check(name,fn){try{await fn();results.push({name,ok:true});console.log('PASS '+name)}catch(e){results.push({name,ok:false});console.error('FAIL '+name+': '+e.message)}}
function equal(a,b){assert.deepEqual(a,b)}
try{
 await check('Primera entrada, multiples plantillas y datos basicos del partido',async()=>{
  await page.goto(url);
  await page.evaluate(()=>localStorage.clear());
  await page.reload();

  assert.match(
   await page.locator('main').innerText(),
   /Configura tu equipo/,
  );

  equal(await state(),null);

  for(let id=21;id<=26;id++){
   await tap('add-roster-player');
   await page.locator('[name="id"]').fill(String(id));
   await page.locator('[name="name"]').fill('Jugador '+id);
   await page.selectOption('[name="role"]','Receptor');
   await tap('save-roster-player');
  }

  await tap('save-new-roster');
  await page.locator('[name="name"]').fill('Equipo test');
  await tap('confirm-save-new-roster');

  const rosters=await page.evaluate(
   ()=>JSON.parse(localStorage.getItem('volleystats.rosters.v1')),
  );

  equal(rosters.length,1);

  await tap('use-roster:'+rosters[0].id);

  await page.locator('[name="rival"]').fill(
   'Rival temporal',
  );

  await tap('manage-roster');

  assert.match(
   await page.locator('main').innerText(),
   /Nuestra plantilla/,
  );

  equal(
   await page.locator(
    '[data-cmd="confirm-roster"]',
   ).count(),
   1,
  );

  await tap('confirm-roster');

  equal(
   await page.locator('[name="rival"]').inputValue(),
   'Rival temporal',
  );

  assert.equal(
   await page.locator('[name^="zone"]').count(),
   0,
  );

  assert.equal(
   await page.locator('[name="serving"]').count(),
   0,
  );

  await page.locator('[name="rival"]').fill('Rival real');

  const pickedDate=await page.evaluate(()=>{
   const now=new Date();
   const year=now.getFullYear();
   const month=String(now.getMonth()+1).padStart(2,'0');
   const day=String(now.getDate()).padStart(2,'0');
   return `${year}-${month}-${day}`;
  });

  equal(
   await page.locator(
    'input[type="date"],input[type="time"],select[name="venue"]',
   ).count(),
   0,
  );

  await tap('open-date-picker');
  await tap('pick-date:'+pickedDate);

  await tap('open-time-picker');
  await tap('pick-hour:18');
  await tap('pick-minute:30');
  await tap('confirm-time');

  await tap('set-venue:home');

  await page.locator(
   '#match-basics-form button[type="submit"]',
  ).click();

  const summary=await page.locator('main').innerText();

  assert.match(summary,/Equipo test/);
  assert.match(summary,/Rival real/);
  assert.match(summary,new RegExp(pickedDate));
  assert.match(summary,/18:30/);
  assert.match(summary,/Local/);

  equal(await state(),null);

  equal(
   await page.evaluate(
    ()=>localStorage.getItem('volleystats.match.v1'),
   ),
   null,
  );

  await tap('edit-match-basics');

  equal(
   await page.locator('[name="rival"]').inputValue(),
   'Rival real',
  );

  equal(
   await page.locator('[name="date"]').inputValue(),
   pickedDate,
  );

  equal(
   await page.locator('[name="time"]').inputValue(),
   '18:30',
  );

  equal(
   await page.locator('[name="venue"]').inputValue(),
   'home',
  );

  await page.reload();

  assert.match(
   await page.locator('main').innerText(),
   /Selecciona una plantilla/,
  );

  equal(await state(),null);

  await page.evaluate(()=>localStorage.clear());
 });

 await check('Renombrar plantillas guardadas',async()=>{
  await page.goto(url);

  await page.evaluate(()=>{
   localStorage.clear();

   const players=Array.from({length:6},(_,i)=>({
    id:i+1,
    name:'Jugador '+(i+1),
    role:'Receptor',
   }));

   localStorage.setItem(
    'volleystats.rosters.v1',
    JSON.stringify([
     {id:'roster-a',name:'Equipo A',players},
     {id:'roster-b',name:'Equipo B',players},
    ]),
   );
  });

  await page.reload();

  await tap('rename-roster:roster-a');

  equal(
   await page.locator(
    '#rename-roster-form [name="name"]',
   ).inputValue(),
   'Equipo A',
  );

  await page.locator(
   '#rename-roster-form [name="name"]',
  ).fill('Equipo B');

  await tap('confirm-rename-roster:roster-a');

  assert.match(
   await page.locator('.dialog-toast.show').innerText(),
   /Ya existe/,
  );

  await page.locator(
   '#rename-roster-form [name="name"]',
  ).fill('Equipo Renombrado');

  await tap('confirm-rename-roster:roster-a');

  const rosters=await page.evaluate(
   ()=>JSON.parse(localStorage.getItem('volleystats.rosters.v1')),
  );

  const renamed=rosters.find(
   roster=>roster.id==='roster-a',
  );

  equal(renamed.name,'Equipo Renombrado');
  equal(renamed.id,'roster-a');

  await page.reload();

  assert.match(
   await page.locator('main').innerText(),
   /Equipo Renombrado/,
  );

  assert.doesNotMatch(
   await page.locator('main').innerText(),
   /Equipo A/,
  );

  await page.evaluate(()=>localStorage.clear());
 });

 await check('Eliminar plantillas guardadas',async()=>{
  await page.goto(url);

  await page.evaluate(()=>{
   localStorage.clear();

   const players=Array.from({length:6},(_,i)=>({
    id:i+1,
    name:'Jugador '+(i+1),
    role:'Receptor',
   }));

   localStorage.setItem(
    'volleystats.rosters.v1',
    JSON.stringify([
     {id:'roster-a',name:'Equipo A',players},
     {id:'roster-b',name:'Equipo B',players},
    ]),
   );
  });

  await page.reload();

  equal(await page.locator('.roster-grid article').count(),2);

  await tap('delete-roster:roster-a');
  assert.match(await page.locator('#modal').innerText(),/Equipo A/);
  await tap('close');

  equal(
   await page.evaluate(
    ()=>JSON.parse(localStorage.getItem('volleystats.rosters.v1')).length,
   ),
   2,
  );

  await tap('delete-roster:roster-a');
  await tap('confirm-delete-roster:roster-a');

  equal(await page.locator('.roster-grid article').count(),1);

  await page.reload();

  assert.doesNotMatch(await page.locator('main').innerText(),/Equipo A/);
  assert.match(await page.locator('main').innerText(),/Equipo B/);

  await tap('delete-roster:roster-b');
  await tap('confirm-delete-roster:roster-b');

  assert.match(await page.locator('main').innerText(),/Configura tu equipo/);

  await page.evaluate(()=>localStorage.clear());
 });

 await check('Puntos, recuperacion del saque, doble toque y deshacer',async()=>{
  await reset();const before=await state();await tap('ours');let s=await state();equal(s.score,[1,0]);equal(s.rotation,2);equal(s.lineup,[9,12,7,8,15,4]);
  await page.waitForTimeout(420);await page.locator('[data-cmd="ours"]').dblclick();equal((await state()).score,[2,0]);
  await commit('theirs');s=await state();equal(s.score,[2,1]);equal(s.serving,false);equal(s.rotation,2);
  await undo();equal((await state()).score,[2,0]);await undo();await undo();equal(await state(),before);
 });
 await check('Errores rivales y errores nuestros, historial, correccion y persistencia',async()=>{
  await reset();await tap('serve-error');await commit('attack-error');equal((await state()).score,[2,0]);
  for(const reason of ['rotation','net']){await tap('unforced-error');await commit('record-unforced:'+reason);const s=await state();equal(s.events.at(-1).reason,reason);equal(s.events.at(-1).category,'unforced-error');equal(s.serving,false);equal(s.rotation,2);}
  const beforeOther=await state();await tap('unforced-error');assert.match(await page.locator('#modal').innerText(),/Otros/);assert.equal(await page.locator('[data-cmd="record-unforced:other"]').count(),1);await commit('record-unforced:other');
  let otherState=await state();equal(otherState.score,[2,3]);equal(otherState.serving,false);equal(otherState.rotation,beforeOther.rotation);equal(otherState.events.at(-1).category,'unforced-error');equal(otherState.events.at(-1).reason,'other');assert.match(otherState.events.at(-1).label,/Otros/);
  await undo();equal(await state(),beforeOther);await tap('unforced-error');await commit('record-unforced:other');
  const saved=await state();await page.reload();equal(await state(),saved);
  await tap('history');const historyText=await page.locator('#modal').innerText();assert.match(historyText,/Falta de rotación/);assert.match(historyText,/Toque de red/);assert.match(historyText,/Otros/);
  await tap('edit-event:4');assert.equal(await page.locator('[name="kind"]').inputValue(),'other');assert.equal(await page.locator('[name="kind"] option[value="other"]').count(),1);await page.locator('#edit-form button').click();await tap('confirm-correction');
  otherState=await state();equal(otherState.events.at(-1).reason,'other');equal(otherState.events.at(-1).category,'unforced-error');
  await tap('stats');await tap('stat-tab:Errores');assert.match(await page.locator('#stat-body').innerText(),/Otros\s+1/);await tap('close');
 });
 await check('Libero activo seleccionable y banquillo sin duplicados',async()=>{
  const withLibero=initial();withLibero.activeLiberoId=1;withLibero.setStarts[0].activeLiberoId=1;
  withLibero.roster.push({id:17,name:'Segundo libero',role:'Líbero'});
  await reset(withLibero);
  const control=page.locator('.active-libero-control');
  assert.equal(await control.count(),1,'se muestra el control del líbero activo');
  assert.match(await control.innerText(),/1/);assert.match(await control.innerText(),/Nico/);assert.match(await control.innerText(),/L/);
  assert.equal(await page.locator('.bench-player[data-player-id="1"]').count(),0,'el líbero activo no se duplica en el banquillo');
  assert.equal(await page.locator('.bench-player[data-player-id="17"]').count(),1,'el segundo líbero permanece en el banquillo');
  assert.equal(await page.locator('.bench-player[data-player-id="3"]').count(),1,'los suplentes permanecen en el banquillo');
  assert.equal(await page.locator('.bench-player').count(),4,'el banquillo contiene el número real de disponibles');
  assert.match(await page.locator('.bench-note').innerText(),/^4 disponibles$/);
  await tap('sub');
  assert.match(await page.locator('#modal').innerText(),/LÍBERO/i);assert.doesNotMatch(await page.locator('#modal').innerText(),/Revisar cambio|Cambiar líbero activo/);
  assert.equal(await page.locator('[name="out"],[name="in"]').count(),0);
  const outButtons=page.locator('[data-sub-group="out"] .sub-player-option'),inButtons=page.locator('[data-sub-group="in"] .sub-player-option'),liberoButtons=page.locator('.libero-candidate-option'),changeButton=page.locator('[data-cmd="review-change"]');
  assert.equal(await outButtons.count(),6);assert.deepEqual(await outButtons.evaluateAll(buttons=>buttons.map(button=>Number(button.dataset.playerId))),withLibero.lineup);
  const expectedIncoming=withLibero.roster.filter(player=>!withLibero.lineup.includes(player.id)&&player.role!=='Líbero').map(player=>player.id);assert.deepEqual(await inButtons.evaluateAll(buttons=>buttons.map(button=>Number(button.dataset.playerId))),expectedIncoming);
  assert.equal(await liberoButtons.count(),1);assert.deepEqual(await liberoButtons.evaluateAll(buttons=>buttons.map(button=>Number(button.dataset.playerId))),[17]);assert.match(await page.locator('.libero-current-card').innerText(),/1/);assert.match(await page.locator('.libero-current-card').innerText(),/Nico/);assert.equal(await changeButton.count(),1);assert.equal(await changeButton.innerText(),'Realizar cambio');assert.equal(await changeButton.isDisabled(),true);
  for(const [width,height] of [[768,1024],[1024,768],[1280,800]]){
   await page.setViewportSize({width,height});
   const layout=await page.evaluate(()=>{const dialog=document.querySelector('#modal'),dialogBox=dialog.getBoundingClientRect(),buttons=[...document.querySelectorAll('.sub-player-option,.libero-candidate-option')];return {modal:{width:dialogBox.width,height:dialogBox.height},buttons:buttons.map(button=>{const box=button.getBoundingClientRect(),style=getComputedStyle(button);return {height:box.height,fontSize:parseFloat(style.fontSize),inside:box.left>=dialogBox.left-1&&box.right<=dialogBox.right+1,top:Math.round(box.top)};}),rows:new Set(buttons.map(button=>Math.round(button.getBoundingClientRect().top))).size,dialogOverflow:dialog.scrollWidth>dialog.clientWidth+1,pageOverflow:document.documentElement.scrollWidth>innerWidth};});
   assert(layout.modal.width>=Math.min(900,width-32)-2);assert(layout.modal.height>=Math.min(700,height-32)-2);assert(layout.rows<layout.buttons.length);
   for(const style of layout.buttons){assert(style.height>=68);assert(style.fontSize>=13);assert.equal(style.inside,true);}
   assert.equal(layout.dialogOverflow,false);assert.equal(layout.pageOverflow,false);
   for(const control of await page.locator('.sub-player-option,.libero-candidate-option,#modal [data-cmd="review-change"]').all()){await control.scrollIntoViewIfNeeded();assert.equal(await control.isVisible(),true);}
  }
  assert.equal(await liberoButtons.first().evaluate(button=>button.tagName),'BUTTON');await liberoButtons.first().focus();assert.equal(await liberoButtons.first().evaluate(button=>document.activeElement===button),true);
  const lineupBeforeSelection=(await state()).lineup;await tap('sub-out:4');assert.equal(await page.locator('[data-cmd="sub-out:4"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('[data-cmd="review-change"]').isDisabled(),true);equal((await state()).lineup,lineupBeforeSelection);
  await tap('sub-in:6');assert.equal(await page.locator('[data-cmd="sub-in:6"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('[data-cmd="review-change"]').isDisabled(),false);equal((await state()).lineup,lineupBeforeSelection);
  await tap('sub-libero:17');assert.equal(await page.locator('.sub-player-option[aria-pressed="true"]').count(),0);assert.equal(await page.locator('[data-cmd="sub-libero:17"]').getAttribute('aria-pressed'),'true');assert.equal((await state()).activeLiberoId,1);assert.equal(await page.locator('[data-cmd="review-change"]').isDisabled(),false);
  await tap('review-change');assert.match(await page.locator('#modal').innerText(),/Confirmar cambio de líbero/);assert.match(await page.locator('#modal').innerText(),/#1 · Nico/);assert.match(await page.locator('#modal').innerText(),/#17 · Segundo libero/);assert.equal((await state()).activeLiberoId,1);await tap('back-to-substitution');assert.equal(await page.locator('[data-cmd="sub-libero:17"]').getAttribute('aria-pressed'),'true');
  await tap('sub-out:4');assert.equal(await page.locator('.libero-candidate-option[aria-pressed="true"]').count(),0);assert.equal(await page.locator('[data-cmd="review-change"]').isDisabled(),true);await tap('sub-in:6');assert.equal(await page.locator('[data-cmd="review-change"]').isDisabled(),false);await tap('sub-libero:17');assert.equal(await page.locator('.sub-player-option[aria-pressed="true"]').count(),0);
  await tap('review-change');await commit('confirm-libero-change:17');
  let changed=await state();assert.equal(changed.activeLiberoId,17);equal(changed.lineup,withLibero.lineup);equal(changed.score,withLibero.score);assert.equal(changed.events.at(-1).type,'libero-change');
  assert.match(await page.locator('.active-libero-control').innerText(),/17/);assert.match(await page.locator('.active-libero-control').innerText(),/Segundo libero/);
  assert.equal(await page.locator('.bench-player[data-player-id="17"]').count(),0);assert.equal(await page.locator('.bench-player[data-player-id="1"]').count(),1);
  await tap('player:17');assert.deepEqual(await page.locator('.grade-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),['grade:#','grade:+','grade:-','grade:=']);assert.equal(await page.locator('.action-options').count(),0);
  await commit('grade:+');let changedEvent=(await state()).events.at(-1);assert.equal(changedEvent.player,17);assert.equal(changedEvent.action,'Recepción');assert.equal(changedEvent.grade,'+');
  await undo();await undo();assert.equal((await state()).activeLiberoId,1);assert.match(await page.locator('.active-libero-control').innerText(),/Nico/);assert.equal(await page.locator('.bench-player[data-player-id="17"]').count(),1);
  await page.waitForTimeout(420);await tap('sub');await tap('sub-libero:17');await tap('review-change');await commit('confirm-libero-change:17');assert.equal((await state()).activeLiberoId,17);await page.reload();await page.locator('.court').waitFor();assert.equal((await state()).activeLiberoId,17);assert.match(await page.locator('.active-libero-control').innerText(),/Segundo libero/);assert.equal(await page.locator('.bench-player[data-player-id="17"]').count(),0);assert.equal(await page.locator('.bench-player[data-player-id="1"]').count(),1);
  await tap('finish-match');await commit('confirm-finish-match');assert.equal((await state()).activeLiberoId,17);await page.reload();await page.locator('.court').waitFor();assert.equal((await state()).activeLiberoId,17);assert.match(await page.locator('.active-libero-control').innerText(),/Segundo libero/);assert.equal(await page.locator('.active-libero-control').isDisabled(),true);

  await reset(withLibero);
  await tap('player:1');
  assert.deepEqual(await page.locator('.grade-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),['grade:#','grade:+','grade:-','grade:=']);
  assert.equal(await page.locator('.action-options').count(),0);
  assert.doesNotMatch(await page.locator('#modal').innerText(),/Saque|Ataque|Bloqueo/);
  await commit('grade:+');
  let liberoEvent=(await state()).events.at(-1);
  assert.equal(liberoEvent.player,1);assert.equal(liberoEvent.action,'Recepción');assert.equal(liberoEvent.grade,'+');
  await tap('player:1');await commit('grade:#');
  liberoEvent=(await state()).events.at(-1);
  assert.equal(liberoEvent.player,1);assert.equal(liberoEvent.action,'Recepción');assert.equal(liberoEvent.grade,'#');
  await tap('player:7');
  assert.deepEqual(await page.locator('.action-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),['action:Saque','action:Recepción','action:Ataque','action:Bloqueo']);
  assert.equal(await page.locator('.grade-options').count(),0);await tap('close');

  const withoutLibero=initial();withoutLibero.activeLiberoId=null;
  await reset(withoutLibero);assert.equal(await page.locator('.active-libero').count(),0,'sin líbero activo no se deja un bloque vacío');
  assert.equal(await page.locator('.bench-player[data-player-id="1"]').count(),1,'el líbero inactivo se muestra en el banquillo');

  const between=initial();between.activeLiberoId=1;between.setStarts[0].activeLiberoId=1;between.status='between';
  await reset(between);assert.equal(await page.locator('.active-libero-control').count(),1,'el líbero sigue visible entre sets');
  assert.equal(await page.locator('.active-libero-control').isDisabled(),true);
 });
 await check('Acciones por jugador y sus valoraciones',async()=>{
  const combos=[['Recepción','#',null],['Recepción','+',null],['Recepción','-',null],['Recepción','=',1],['Saque','#',0],['Saque','+',null],['Saque','-',1],['Saque','=',1],['Ataque','#',0],['Ataque','+',null],['Ataque','-',null],['Ataque','Blo',1],['Ataque','=',1],['Bloqueo','#',0],['Bloqueo','=',1]];
  for(const [action,grade,team] of combos){await reset();await tap('player:7');await tap('action:'+action);await tap('grade:'+grade);const s=await state();equal(s.score,team===null?[0,0]:team===0?[1,0]:[0,1]);equal(s.events.at(-1).player,7);await undo();equal((await state()).score,[0,0]);}
 });
 await check('Orden visible de valoraciones de Ataque',async()=>{
  await reset();await tap('player:7');await tap('action:Ataque');assert.deepEqual(await page.locator('.grade-options button b').allTextContents(),['++','+','-','=','Blq']);await tap('close');
 });
 await check('Teclado contextual: dorsal, acciones, valoraciones y deshacer',async()=>{
  await reset();const before=await state();
  await press('1','2');assert.equal(await page.locator('.keyboard-jersey-status').innerText(),'Dorsal: 12');assert.equal(await page.locator('#modal').evaluate(dialog=>dialog.open),false);equal((await state()).events,before.events);
  await press('Backspace');assert.equal(await page.locator('.keyboard-jersey-status').innerText(),'Dorsal: 1');await press('2','Escape');assert.equal(await page.locator('.keyboard-jersey-status').innerText(),'');
  await press('1','2','Enter');assert.match(await page.locator('#modal .dialog-head').innerText(),/12/);assert.deepEqual(await page.locator('.action-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),['action:Saque','action:Recepción','action:Ataque','action:Bloqueo']);assert.deepEqual(await page.locator('.action-options kbd').allTextContents(),['1','2','3','4']);assert.equal(await page.locator('.action-options kbd').first().isVisible(),true);
  for(const key of ['s','r','a','b'])await page.keyboard.press(key);assert.equal(await page.locator('.grade-options').count(),0,'S/R/A/B no seleccionan acciones');
  await press('3');assert.deepEqual(await page.locator('.grade-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),['grade:#','grade:+','grade:-','grade:=','grade:Blo']);assert.deepEqual(await page.locator('.grade-options kbd').allTextContents(),['1','2','3','4','5']);await press('1');let current=await state();assert.equal(current.events.at(-1).player,12);assert.equal(current.events.at(-1).action,'Ataque');assert.equal(current.events.at(-1).grade,'#');
  await press('Control+z');equal(await state(),before);
  await press('1','2','Enter','2');assert.deepEqual(await page.locator('.grade-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),['grade:#','grade:+','grade:-','grade:=']);assert.deepEqual(await page.locator('.grade-options button b').allTextContents(),['#','+','-','=']);await press('Escape');assert.equal(await page.locator('#modal').evaluate(dialog=>dialog.open),false);
 });
 await check('Teclado contextual: dorsales ambiguos, invalidos y numpad',async()=>{
  const ambiguous=initial();ambiguous.roster=ambiguous.roster.map(player=>player.id===1?{...player,role:'Receptor'}:player);ambiguous.roster.push({id:10,name:'Diez',role:'Central'});ambiguous.activeLiberoId=null;ambiguous.lineup=[1,10,12,7,8,15];ambiguous.setStarts[0]={...ambiguous.setStarts[0],lineup:[...ambiguous.lineup],activeLiberoId:null};await reset(ambiguous);
  await press('1','Enter');assert.match(await page.locator('#modal .dialog-head').innerText(),/1/);await press('Escape');await press('1','0','Enter');assert.match(await page.locator('#modal .dialog-head').innerText(),/10/);await press('Escape');
  const before=await state();await press('3','Enter');assert.match(await page.locator('#toast').innerText(),/El dorsal #3 no está en pista/);equal(await state(),before);assert.equal(await page.locator('#modal').evaluate(dialog=>dialog.open),false);await press('9','9','Enter');assert.match(await page.locator('#toast').innerText(),/El dorsal #99 no está en pista/);equal(await state(),before);
  await press('Numpad1','Numpad0');assert.equal(await page.locator('.keyboard-jersey-status').innerText(),'Dorsal: 10');await press('Escape');
 });
 await check('Teclado contextual: libero, errores y bloqueos de contexto',async()=>{
  const withLibero=initial();withLibero.activeLiberoId=1;withLibero.setStarts[0].activeLiberoId=1;await reset(withLibero);await press('l');assert.equal(await page.locator('.action-options').count(),0);assert.deepEqual(await page.locator('.grade-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),['grade:#','grade:+','grade:-','grade:=']);await press('1');let current=await state();assert.equal(current.events.at(-1).player,1);assert.equal(current.events.at(-1).action,'Recepción');assert.equal(current.events.at(-1).grade,'#');
  await reset();await press('e');assert.deepEqual(await page.locator('.keyboard-error-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),['serve-error','attack-error','record-unforced:rotation','record-unforced:net','record-unforced:other']);assert.deepEqual(await page.locator('.keyboard-error-options button > span').allTextContents(),['Error saque rival','Error ataque rival','Falta de rotación','Toque de red','Otros']);assert.deepEqual(await page.locator('.keyboard-error-options kbd').allTextContents(),['1','2','3','4','5']);assert.deepEqual(await page.locator('.keyboard-error-options button').evaluateAll(buttons=>buttons.map(button=>button.tagName)),['BUTTON','BUTTON','BUTTON','BUTTON','BUTTON']);await press('1');current=await state();assert.equal(current.events.at(-1).label,'Error de saque rival');
  await reset();await press('e','5');current=await state();assert.equal(current.events.at(-1).category,'unforced-error');assert.equal(current.events.at(-1).reason,'other');
  await reset();await tap('keyboard-errors');await tap('record-unforced:net');assert.equal((await state()).events.at(-1).reason,'net');
  await reset();await tap('ours');const before=await state();await page.evaluate(()=>{for(const tag of ['input','textarea','select','div']){const element=document.createElement(tag);if(tag==='select')element.innerHTML='<option>uno</option><option>dos</option>';if(tag==='div')element.setAttribute('contenteditable','true');element.dataset.keyboardTest=tag;document.body.append(element);}});for(const selector of ['input[data-keyboard-test]','textarea[data-keyboard-test]','select[data-keyboard-test]','div[data-keyboard-test]']){await page.locator(selector).focus();await press('1','l','e','Control+z');equal(await state(),before);assert.equal(await page.locator('#modal').evaluate(dialog=>dialog.open),false);assert.equal(await page.locator('.keyboard-jersey-status').innerText(),'');}await page.locator('.court').click({position:{x:5,y:5}});
  await tap('sub');await press('1','2','l','e','Control+z');equal(await state(),before);assert.equal(await page.locator('#modal').evaluate(dialog=>dialog.open),true);assert.match(await page.locator('#modal .dialog-head').innerText(),/Sustitución/);await tap('close');
  const finished=initial();finished.status='finished';await reset(finished);const loadedFinished=await state();await press('1','2','Enter','l','e','+','-','n','r');equal(await state(),loadedFinished);assert.equal(await page.locator('.keyboard-jersey-status').innerText(),'');assert.equal(await page.locator('#modal').evaluate(dialog=>dialog.open),false);
  await reset();const pointBefore=await state();await press('+','-','n','r');equal(await state(),pointBefore);
 });
 await check('Modal de acciones y valoraciones responsive',async()=>{
  await reset();await tap('player:12');
  for(const [width,height] of [[768,1024],[1024,768],[1280,800],[1366,768],[1920,1080],[1024,600],[1366,640]]){await page.setViewportSize({width,height});const layout=await page.evaluate(()=>{const dialog=document.querySelector('#modal'),box=dialog.getBoundingClientRect(),buttons=[...dialog.querySelectorAll('.action-options button')];return {dialog:{left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width},buttons:buttons.map(button=>{const rect=button.getBoundingClientRect(),style=getComputedStyle(button);return {height:rect.height,font:parseFloat(style.fontSize),inside:rect.left>=box.left-1&&rect.right<=box.right+1};}),horizontal:dialog.scrollWidth>dialog.clientWidth+1||document.documentElement.scrollWidth>innerWidth};});assert(layout.dialog.left>=0&&layout.dialog.right<=width+1&&layout.dialog.top>=0&&layout.dialog.bottom<=height+1);assert(layout.dialog.width<=782);assert.equal(layout.horizontal,false);for(const button of layout.buttons){assert(button.height>=59.5&&button.height<=73);assert(button.font>=15);assert.equal(button.inside,true);}}
  await tap('action:Ataque');
  for(const [width,height] of [[768,1024],[1024,768],[1280,800],[1366,768],[1920,1080],[1024,600],[1366,640]]){await page.setViewportSize({width,height});const layout=await page.evaluate(()=>{const dialog=document.querySelector('#modal'),box=dialog.getBoundingClientRect(),buttons=[...dialog.querySelectorAll('.grade-options button')];return {inside:box.left>=0&&box.right<=innerWidth+1&&box.top>=0&&box.bottom<=innerHeight+1,horizontal:dialog.scrollWidth>dialog.clientWidth+1,buttons:buttons.map(button=>{const rect=button.getBoundingClientRect(),style=getComputedStyle(button);return {height:rect.height,font:parseFloat(style.fontSize),inside:rect.left>=box.left-1&&rect.right<=box.right+1};})};});assert.equal(layout.inside,true);assert.equal(layout.horizontal,false);for(const button of layout.buttons){assert(button.height>=71.5&&button.height<=93);assert(button.font>=13);assert.equal(button.inside,true);}}
  await tap('close');
 });
 await check('Sustitucion cancelada, confirmada y deshecha',async()=>{
  await reset();const before=await state();await tap('sub');assert.equal(await page.locator('[data-cmd="review-change"]').isDisabled(),true);await tap('sub-out:4');assert.equal(await page.locator('[data-cmd="review-change"]').isDisabled(),true);await tap('sub-in:6');assert.equal(await page.locator('[data-cmd="review-change"]').isDisabled(),false);await tap('review-change');equal((await state()).lineup,before.lineup);await tap('back-to-substitution');assert.equal(await page.locator('.sub-player-option[aria-pressed="true"]').count(),2);assert.equal(await page.locator('[data-cmd="review-change"]').isDisabled(),false);await tap('close');equal(await state(),before);
  await tap('sub');await tap('sub-out:4');await tap('sub-in:6');await tap('review-change');await tap('confirm-sub:4,6');const changed=await state();equal(changed.lineup,[6,9,12,7,8,15]);assert.equal(changed.events.at(-1).type,'sub');assert.equal(changed.events.at(-1).out,4);assert.equal(changed.events.at(-1).in,6);await undo();equal(await state(),before);
 });
 await check('Finalizar partido durante un set, bloquear registro, recargar y deshacer',async()=>{
  const playing=initial();playing.activeLiberoId=1;playing.setStarts[0].activeLiberoId=1;await reset(playing);await commit('ours');await commit('theirs');const before=await state();
  await tap('finish-match');assert.match(await page.locator('#modal').innerText(),/Set 1 está en curso/);assert.match(await page.locator('#modal').innerText(),/1\s+–\s+1/);await tap('close');equal(await state(),before);
  await tap('finish-match');await commit('confirm-finish-match');let finished=await state();equal(finished.status,'finished');equal(finished.score,before.score);equal(finished.set,before.set);equal(finished.finishedSets,before.finishedSets);equal(finished.events.at(-1).type,'finish-match');
  assert.match(await page.locator('.score-top').innerText(),/PARTIDO FINALIZADO/);assert.equal(await page.locator('[data-cmd="finish"]').count(),0);assert.equal(await page.locator('[data-cmd="next"]').count(),0);assert.equal(await page.locator('[data-cmd="finish-match"]').count(),0);assert(await page.locator('[data-cmd="ours"]').isDisabled());assert(await page.locator('.player').first().isDisabled());assert(await page.locator('.active-libero-control').isDisabled());assert(await page.locator('[data-cmd="sub"]').isDisabled());assert.equal(await page.locator('[data-cmd="new-match"]').count(),1);
  await page.locator('[data-cmd="ours"]').evaluate(button=>button.click());await page.locator('.player').first().evaluate(button=>button.click());await page.locator('.active-libero-control').evaluate(button=>button.click());equal(await state(),finished);assert.equal(await page.locator('#modal').evaluate(dialog=>dialog.open),false);
  await tap('history');assert.match(await page.locator('#modal').innerText(),/Partido finalizado/);await tap('close');await page.reload();await page.locator('.court').waitFor();finished=await state();equal(finished.status,'finished');assert.match(await page.locator('.score-top').innerText(),/PARTIDO FINALIZADO/);
  await undo();equal(await state(),before);
 });
 await check('Finalizar partido entre sets conserva el set cerrado y permite deshacer',async()=>{
  await reset();await commit('ours');await tap('finish');await commit('confirm-finish');const between=await state();equal(between.status,'between');equal(between.finishedSets,[{set:1,score:[1,0]}]);assert.equal(await page.locator('[data-cmd="next"]').count(),1);assert.equal(await page.locator('[data-cmd="finish-match"]').count(),1);
  await tap('finish-match');assert.match(await page.locator('#modal').innerText(),/no se preparará otro set/);await commit('confirm-finish-match');const finished=await state();equal(finished.status,'finished');equal(finished.finishedSets,between.finishedSets);assert.equal(await page.locator('[data-cmd="next"]').count(),0);assert.equal(await page.locator('[data-cmd="finish-match"]').count(),0);
  await undo();equal(await state(),between);
 });
 await check('Cierre, bloqueo, siguiente set y deshacer',async()=>{
  await reset();await tap('ours');await tap('finish');await commit('confirm-finish');const closed=await state();equal(closed.status,'between');assert(await page.locator('[data-cmd="ours"]').isDisabled());assert(await page.locator('[data-cmd="unforced-error"]').isDisabled());
  await tap('next');assert.match(await page.locator('main').innerText(),/Preparar Set 2/);await tap('continue-lineup');await tap('continue-libero');await tap('set-serving:theirs');await tap('start-match');
  equal((await state()).set,2);equal((await state()).score,[0,0]);await undo();equal(await state(),closed);await undo();equal((await state()).status,'playing');
 });
 await check('Estadisticas, plantilla e historial',async()=>{
  await reset();await tap('stats');equal(await page.locator('.stats-tabs .primary').innerText(),'General');equal(await page.locator('.stats-tabs button').allTextContents(),['General','K1/K2','Rotaciones','Errores']);await tap('stat-tab:K1/K2');equal(await page.locator('.phase-card').count(),2);assert.match(await page.locator('.phase-card').nth(0).innerText(),/Recepción/);assert.match(await page.locator('.phase-card').nth(1).innerText(),/Saque/);assert.equal(await page.locator('.phase-dashboard table').count(),0);assert.match(await page.locator('.phase-summary').innerText(),/Total de fases/);for(const tab of ['General','Rotaciones','Errores'])await tap('stat-tab:'+tab);assert.doesNotMatch(await page.locator('#stat-body').innerText(),/Sustituciones/);await tap('close');await tap('nav:roster');equal(await page.locator('.roster-grid article').count(),10);
  const matchBefore=await page.evaluate(()=>localStorage.getItem('volleystats.match.v1'));
  const rosterBefore=(await state()).roster;
  await tap('add-roster-player');await page.locator('[name="id"]').fill('22');await page.locator('[name="name"]').fill('Irene');await page.selectOption('[name="role"]','Receptor');await tap('save-roster-player');
  equal(await page.locator('.roster-grid article').count(),11);
  assert(await page.evaluate(()=>JSON.parse(localStorage.getItem('volleystats.rosters.v1'))[0].players.some(p=>p.id===22&&p.name==='Irene')));
  equal((await state()).roster,rosterBefore);
  equal(await page.evaluate(()=>localStorage.getItem('volleystats.match.v1')),matchBefore);
  await page.reload();await tap('nav:roster');equal(await page.locator('.roster-grid article').count(),11);
  assert.match(await page.locator('.roster-grid').innerText(),/Irene/);
  equal((await state()).roster,rosterBefore);
  equal(await page.evaluate(()=>localStorage.getItem('volleystats.match.v1')),matchBefore);
  await tap('edit-roster-player:22');
   await page.locator('[name="name"]').fill('Irene Editada');
   await page.selectOption('[name="role"]','L\u00edbero');
   await tap('save-roster-edit:22');

   assert.match(await page.locator('.roster-grid').innerText(),/Irene Editada/);
   assert(await page.evaluate(()=>JSON.parse(localStorage.getItem('volleystats.rosters.v1'))[0].players.some(p=>p.id===22&&p.name==='Irene Editada'&&p.role==='L\u00edbero')));
   equal((await state()).roster,rosterBefore);
   equal(await page.evaluate(()=>localStorage.getItem('volleystats.match.v1')),matchBefore);

   await page.reload();
   await tap('nav:roster');
   assert.match(await page.locator('.roster-grid').innerText(),/Irene Editada/);
   assert(await page.evaluate(()=>JSON.parse(localStorage.getItem('volleystats.rosters.v1'))[0].players.some(p=>p.id===22&&p.name==='Irene Editada'&&p.role==='L\u00edbero')));
   equal((await state()).roster,rosterBefore);
   equal(await page.evaluate(()=>localStorage.getItem('volleystats.match.v1')),matchBefore);

   await tap('edit-roster-player:22');
   await page.locator('[name="id"]').fill('4');
   await tap('save-roster-edit:22');

   assert(await page.locator('#modal').evaluate(el=>el.open));
   assert.match(await page.locator('.dialog-toast.show').innerText(),/utilizado/);
   assert(await page.evaluate(()=>{
     const roster=JSON.parse(localStorage.getItem('volleystats.rosters.v1'))[0].players;
     return roster.some(p=>p.id===22&&p.name==='Irene Editada') &&
       roster.filter(p=>p.id===4).length===1;
   }));
   equal((await state()).roster,rosterBefore);
   equal(await page.evaluate(()=>localStorage.getItem('volleystats.match.v1')),matchBefore);
   await tap('close');

   await tap('nav:history');assert.match(await page.locator('main').innerText(),/Todavía no hay operaciones/);
  await tap('nav:match');await tap('ours');equal((await state()).score,[1,0]);await undo();
 });
 await check('Estadisticas reales, filtro, correccion, persistencia y restauracion',async()=>{
  await reset();await tap('player:7');await tap('action:Ataque');await tap('grade:#');await commit('theirs');
  await tap('stats');await tap('stat-tab:General');assert.equal(await page.locator('.player-stats thead tr:first-child th').allTextContents().then(v=>v.join('|')),'Jugador|Puntos|Saque|Recepción|Ataque|Bloqueo');const fit=await page.evaluate(()=>{const d=document.querySelector('dialog'),t=document.querySelector('.player-stats');return {dialog:d.scrollHeight<=d.clientHeight+1,table:t.scrollWidth<=t.clientWidth+1}});assert.deepEqual(fit,{dialog:true,table:true});if(process.argv[3])await page.screenshot({path:process.argv[3]});assert.match(await page.locator('#stat-body').innerText(),/100 %/);equal(await page.locator('.player-stats tfoot tr td').first().innerText(),'1');await tap('period-toggle');await tap('period-set:1');assert.match(await page.locator('#stat-body').innerText(),/100 %/);await tap('close');
  const before=await state();await tap('history');await tap('edit-event:0');await page.selectOption('#edit-grade','Blo');await page.locator('#edit-form button').click();equal(await state(),before);await tap('confirm-correction');equal((await state()).score,[0,2]);await page.reload();equal((await state()).score,[0,2]);
  await tap('stats');await tap('stat-tab:General');assert.match(await page.locator('#stat-body tbody tr').first().innerText(),/0 %/);await tap('close');await undo();equal(await state(),before);
  await tap('history');await tap('edit-event:1');await tap('delete-event:1');await tap('close');equal(await state(),before);
  await tap('history');await tap('edit-event:1');await tap('delete-event:1');await tap('confirm-correction');equal((await state()).score,[1,0]);await tap('history');await tap('undo-correction');equal(await state(),before);
 });
 await check('Correccion de ultimo registro, deshacer vacio y fallo al guardar',async()=>{
  await reset();await tap('ours');const before=await state();await tap('history');await tap('edit-event:0');await tap('delete-event:0');await tap('confirm-correction');equal((await state()).events.length,0);assert.equal(await page.locator('[data-cmd="undo"]').isDisabled(),false);await page.reload();await undo();equal(await state(),before);
  await tap('history');await tap('edit-event:0');await page.selectOption('[name="kind"]','net');await page.locator('#edit-form button').click();await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw Error('Full')}});await tap('confirm-correction');equal(await state(),before);assert.match(await page.locator('.dialog-toast.show').innerText(),/No se pudo guardar/);
 });
 await check('Zonas y nombres legibles en tablet y desktop',async()=>{
  const assertZoneLayout=async(courtSelector)=>{
   const players=page.locator(`${courtSelector} .player[data-zone]`);assert.equal(await players.count(),6);
   assert.deepEqual(await players.evaluateAll(items=>items.map(item=>item.dataset.zone)),['4','3','2','5','6','1']);
   assert.deepEqual((await players.locator('.zone').allTextContents()).map(text=>Number(text.match(/\d+/)?.[0])).sort((a,b)=>a-b),[1,2,3,4,5,6]);
   const geometry=await players.evaluateAll((items,selector)=>{const court=document.querySelector(selector).getBoundingClientRect();return items.map(item=>{const zone=item.querySelector('.zone').getBoundingClientRect(),jersey=item.querySelector('.jersey').getBoundingClientRect();const overlapX=Math.min(zone.right,jersey.right)-Math.max(zone.left,jersey.left),overlapY=Math.min(zone.bottom,jersey.bottom)-Math.max(zone.top,jersey.top);return {id:item.dataset.zone,overlaps:overlapX>0.5&&overlapY>0.5,gap:zone.left>=jersey.right?zone.left-jersey.right:jersey.left>=zone.right?jersey.left-zone.right:0,inside:zone.left>=court.left-0.5&&zone.right<=court.right+0.5&&zone.top>=court.top-0.5&&zone.bottom<=court.bottom+0.5,visible:zone.width>0&&zone.height>0};});},courtSelector);
   for(const item of geometry){assert.equal(item.overlaps,false,`zona ${item.id} fuera del dorsal`);assert(item.gap>=4,`zona ${item.id} separada del dorsal`);assert.equal(item.inside,true,`zona ${item.id} dentro de la cancha`);assert.equal(item.visible,true,`zona ${item.id} visible`);}
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  };
  const assertPlayerReadability=async()=>{
   const layout=await page.evaluate(()=>{const overlaps=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>0.5&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>0.5,court=document.querySelector('.court-panel .court').getBoundingClientRect(),bench=document.querySelector('.bench').getBoundingClientRect();return {starters:[...document.querySelectorAll('.court-panel .court .player[data-zone]')].map(item=>{const name=item.querySelector('.player-name'),nameBox=name.getBoundingClientRect(),jersey=item.querySelector('.jersey').getBoundingClientRect(),zone=item.querySelector('.zone').getBoundingClientRect();return {complete:Boolean(name&&item.querySelector('.jersey')&&item.querySelector('.zone')),font:parseFloat(getComputedStyle(name).fontSize),visible:nameBox.width>0&&nameBox.height>0,inside:nameBox.left>=court.left-0.5&&nameBox.right<=court.right+0.5&&nameBox.top>=court.top-0.5&&nameBox.bottom<=court.bottom+0.5,overlapsJersey:overlaps(nameBox,jersey),overlapsZone:overlaps(nameBox,zone)};}),bench:[...document.querySelectorAll('.bench-player')].map(item=>{const number=item.querySelector('b'),name=item.querySelector('span'),box=item.getBoundingClientRect(),numberBox=number.getBoundingClientRect(),nameBox=name.getBoundingClientRect();return {complete:Boolean(number&&name),numberFont:parseFloat(getComputedStyle(number).fontSize),nameFont:parseFloat(getComputedStyle(name).fontSize),visible:numberBox.width>0&&numberBox.height>0&&nameBox.width>0&&nameBox.height>0,inside:box.left>=bench.left-0.5&&box.right<=bench.right+0.5&&box.top>=bench.top-0.5&&box.bottom<=bench.bottom+0.5,height:box.height};}),horizontalOverflow:document.documentElement.scrollWidth>innerWidth};});
   assert.equal(layout.starters.length,6);for(const item of layout.starters){assert.equal(item.complete,true);assert(item.font>=13);assert.equal(item.visible,true);assert.equal(item.inside,true);assert.equal(item.overlapsJersey,false);assert.equal(item.overlapsZone,false);}
   assert(layout.bench.length>0);for(const item of layout.bench){assert.equal(item.complete,true);assert(item.nameFont>=12);assert(item.numberFont>=13);assert.equal(item.visible,true);assert.equal(item.inside,true);assert(item.height<=48);}
   assert.equal(layout.horizontalOverflow,false);
  };
  await reset();
  const starters=page.locator('.court-panel .court .player[data-zone]');assert.equal(await starters.count(),6);assert.equal(await starters.locator('.player-name').count(),6);assert.equal(await starters.locator('.player-name').evaluateAll(names=>names.every(name=>name.textContent.trim().length>0)),true);assert.equal(await starters.locator('.player-name small').count(),0);const matchState=await state();assert.equal(matchState.roster.some(player=>player.role==='Colocador'&&matchState.lineup.includes(player.id)),true);
  for(const [width,height] of [[768,1024],[1024,768],[1280,800]]){await page.setViewportSize({width,height});await assertZoneLayout('.court-panel .court');await assertPlayerReadability();}
  const between=initial();between.status='between';between.finishedSets=[{set:1,score:[25,20]}];await reset(between);await page.setViewportSize({width:768,height:1024});await tap('next');await page.locator('.setup-court').waitFor();await assertZoneLayout('.setup-court');
 });
 await check('Encabezado real por sede, estados, recarga y nombres largos',async()=>{
  const local=initial();local.rosterId='test-roster';local.rival='Rival Norte';local.venue='Local';
  await reset(local,'Equipo Casa');
  equal((await page.locator('.match-title').innerText()).replace(/\s+/g,' ').trim(),'Equipo Casa vs Rival Norte');
  assert.doesNotMatch(await page.locator('.match-title').innerText(),/Nosotros|Partido 3/);
  await page.reload();await page.locator('.court').waitFor();
  equal((await page.locator('.match-title').innerText()).replace(/\s+/g,' ').trim(),'Equipo Casa vs Rival Norte');

  const visitor=initial();visitor.rosterId='test-roster';visitor.rosterName='Equipo Visitante Histórico';visitor.rival='Club Local';visitor.venue='Visitante';
  await reset(visitor,'Nombre actual distinto');
  equal((await page.locator('.match-title').innerText()).replace(/\s+/g,' ').trim(),'Club Local vs Equipo Visitante Histórico');

  visitor.status='between';visitor.finishedSets=[{set:1,score:[25,20]}];
  await reset(visitor,'Nombre actual distinto');
  equal((await page.locator('.match-title').innerText()).replace(/\s+/g,' ').trim(),'Club Local vs Equipo Visitante Histórico');
  visitor.status='finished';
  await reset(visitor,'Nombre actual distinto');
  equal((await page.locator('.match-title').innerText()).replace(/\s+/g,' ').trim(),'Club Local vs Equipo Visitante Histórico');

  const long=initial();long.rosterId='test-roster';long.rosterName='Club Deportivo Voleibol Ciudad Universitaria';long.rival='Asociación Atlética Metropolitana del Norte';long.venue='Visitante';
  await reset(long,'Nombre que no debe sustituir la copia histórica');
  for(const [width,height] of [[768,1024],[1024,768],[1280,800]]){
   await page.setViewportSize({width,height});
   const layout=await page.evaluate(()=>{const title=document.querySelector('.match-title').getBoundingClientRect(),button=document.querySelector('.page-heading > button').getBoundingClientRect();return {visible:title.width>0&&title.height>0,inside:title.left>=0&&title.right<=innerWidth+1&&title.top>=0&&title.bottom<=innerHeight+1,overlap:!(title.right<=button.left||button.right<=title.left||title.bottom<=button.top||button.bottom<=title.top),horizontalOverflow:document.documentElement.scrollWidth>innerWidth};});
   equal(layout,{visible:true,inside:true,overlap:false,horizontalOverflow:false});
  }
 });
 await check('Controles principales cómodos en tablet y proporcionados en desktop',async()=>{
  await reset();
  const selector=['ours','theirs','serve-error','attack-error','unforced-error','sub','stats','undo','history','finish','finish-match','new-match'].map(cmd=>`[data-cmd="${cmd}"]`).join(',');
  const controls=page.locator(selector);assert.equal(await controls.count(),12);
  for(const [width,height] of [[768,1024],[1024,768],[1280,800],[1366,768],[1920,1080]]){
   await page.setViewportSize({width,height});
   const layout=await controls.evaluateAll((buttons,{width,height})=>{const items=buttons.map(button=>{const box=button.getBoundingClientRect(),style=getComputedStyle(button),container=button.closest('.score-panel,.toolbar,.page-heading')?.getBoundingClientRect();return {cmd:button.dataset.cmd,width:box.width,height:box.height,fontSize:parseFloat(style.fontSize),paddingTop:parseFloat(style.paddingTop),paddingBottom:parseFloat(style.paddingBottom),visible:box.width>0&&box.height>0,viewport:box.left>=-1&&box.top>=-1&&box.right<=width+1&&box.bottom<=height+1,container:!container||(box.left>=container.left-1&&box.top>=container.top-1&&box.right<=container.right+1&&box.bottom<=container.bottom+1)};});return {items,horizontalOverflow:document.documentElement.scrollWidth>width,verticalOverflow:document.documentElement.scrollHeight>height};},{width,height});
   for(const item of layout.items){assert.equal(item.visible,true,item.cmd+' visible');assert.equal(item.viewport,true,item.cmd+' dentro del viewport');assert.equal(item.container,true,item.cmd+' dentro de su panel');assert(item.height>=47.5,item.cmd+' área táctil');assert(item.fontSize>=12,item.cmd+' texto legible');assert(item.paddingTop>=8&&item.paddingBottom>=8,item.cmd+' padding suficiente');if(width>=1280)assert(item.height<=66,item.cmd+' proporcionado en desktop');}
   assert.equal(layout.horizontalOverflow,false);assert.equal(layout.verticalOverflow,false);
  }
  for(const [width,height] of [[1024,600],[1366,640]]){
   await page.setViewportSize({width,height});
   const compact=await page.evaluate(()=>({setResultsFont:parseFloat(getComputedStyle(document.querySelector('.set-results')).fontSize),errors:[...document.querySelectorAll('.errors button')].map(button=>button.getBoundingClientRect().height),finish:[...document.querySelectorAll('.match-end-actions button')].map(button=>button.getBoundingClientRect().height)}));
   assert(compact.setResultsFont>=11,`${width}x${height} resultados legibles`);for(const value of [...compact.errors,...compact.finish])assert(value>=43.5,`${width}x${height} control táctil`);
  }
 });
 await check('Sin scroll ni controles recortados en tablet y al girar',async()=>{
  const s=initial();s.set=5;s.score=[24,24];s.finishedSets=[1,2,3,4].map(set=>({set,score:[25,23]}));await reset(s);
  for(const [width,height] of [[1024,600],[1280,800],[1024,768],[1180,720],[800,1280],[768,1024],[600,960],[1366,640]]){
   await page.setViewportSize({width,height});
   const failures=await page.evaluate(()=>{const failures=[];for(const el of document.querySelectorAll('#app button,#app .court,#app .bench,#app .latest')){const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;const id=el.dataset.cmd||el.className;if(r.left<0||r.top<0||r.right>innerWidth+1||r.bottom>innerHeight+1)failures.push(id);for(let p=el.parentElement;p&&p.id!=='app';p=p.parentElement){if(['hidden','clip'].includes(getComputedStyle(p).overflowY)){const b=p.getBoundingClientRect();if(r.bottom>b.bottom+1||r.top<b.top-1)failures.push(id+' clipped');}}}if(document.documentElement.scrollHeight>innerHeight||document.documentElement.scrollWidth>innerWidth)failures.push('page overflow');return failures});assert.deepEqual(failures,[],`${width}x${height}`);
   for(const cmd of ['sub','stats','history','unforced-error']){await tap(cmd);const r=await page.locator('#modal').boundingBox();assert(r.y>=0&&r.y+r.height<=height+1);await tap('close');}
  }
 });
 await check('Partido offline, recarga y guardado',async()=>{
  await reset();await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await context.setOffline(true);await page.reload();await page.locator('.court').waitFor();await tap('ours');equal((await state()).score,[1,0]);await page.reload();equal((await state()).score,[1,0]);await context.setOffline(false);
 });
 await check('Fallo al guardar no aplica puntos y avisa',async()=>{
  await reset();const before=await state();await page.evaluate(()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError')}});await tap('ours');equal(await state(),before);assert.match(await page.locator('#toast').innerText(),/No se pudo guardar/);assert.match(await page.locator('.save-state').innerText(),/Guardado no disponible/);
  await page.evaluate(()=>{Storage.prototype.setItem=window.originalSetItem});await commit('ours');equal((await state()).score,[1,0]);assert.match(await page.locator('.save-state').innerText(),/Guardado en este dispositivo/);
 });
 await check('Migracion de VolleyTrack a VolleyStats',async()=>{
  const legacy=initial();legacy.demo=false;
  await page.goto(url);
  await page.evaluate(s=>{
    localStorage.clear();
    localStorage.setItem('volleytrack.match.v1',JSON.stringify(s));
    localStorage.setItem('volleytrack.roster.v1',JSON.stringify(s.roster));
  },legacy);
  await page.reload();
  await page.locator('.court').waitFor();

  const migrated=await state();
  const {rosterId,...migratedWithoutRosterId}=migrated;

  equal(migratedWithoutRosterId,legacy);
  equal(rosterId,'imported-roster-v1');

  assert(
   await page.evaluate(
    ()=>localStorage.getItem('volleystats.match.v1')!==null,
   ),
  );

  assert(
   await page.evaluate(
    ()=>localStorage.getItem('volleystats.roster.v1')!==null,
   ),
  );

  const migratedRosters=await page.evaluate(
   ()=>JSON.parse(localStorage.getItem('volleystats.rosters.v1')),
  );

  equal(migratedRosters.length,1);
  equal(migratedRosters[0].id,'imported-roster-v1');
  equal(migratedRosters[0].players,legacy.roster);

  equal(
   await page.evaluate(
    ()=>JSON.parse(localStorage.getItem('volleystats.match.v1')).rosterId,
   ),
   'imported-roster-v1',
  );
 });
 await check('Datos guardados invalidos no dejan la pantalla en blanco',async()=>{
  await reset();

  await page.evaluate(()=>{
   const s=JSON.parse(localStorage.getItem('volleystats.match.v1'));
   s.lineup[0]=999;
   localStorage.setItem('volleystats.match.v1',JSON.stringify(s));
  });

  await page.reload();

  await page.locator('.setup-card').waitFor({timeout:3000});

  assert.match(
   await page.locator('[role="alert"]').innerText(),
   /almacenamiento/,
  );

  await tap('use-roster:test-roster');

  await page.locator('[name="rival"]').fill('Nuevo rival');

  const pickedDate=await page.evaluate(()=>{
   const now=new Date();
   const year=now.getFullYear();
   const month=String(now.getMonth()+1).padStart(2,'0');
   const day=String(now.getDate()).padStart(2,'0');
   return `${year}-${month}-${day}`;
  });

  await tap('open-date-picker');
  await tap('pick-date:'+pickedDate);

  await tap('open-time-picker');
  await tap('pick-hour:18');
  await tap('pick-minute:30');
  await tap('confirm-time');

  await tap('set-venue:away');

  await page.locator(
   '#match-basics-form button[type="submit"]',
  ).click();

  assert.match(
   await page.locator('main').innerText(),
   /Nuevo rival/,
  );

  equal(
   (await state()).lineup[0],
   999,
  );
 });

 await check('Preparacion completa de Set 1, libero, saque y creacion diferida',async()=>{
  await page.goto(url);
  await page.evaluate(()=>{
   localStorage.clear();
   const players=[
    {id:1,name:'Libero',role:'Líbero'},
    {id:4,name:'Colocador',role:'Colocador'},
    {id:6,name:'Relevo',role:'Receptor'},
    {id:7,name:'Receptor 1',role:'Receptor'},
    {id:8,name:'Receptor 2',role:'Receptor'},
    {id:9,name:'Opuesto',role:'Opuesto'},
    {id:12,name:'Central 1',role:'Central'},
    {id:15,name:'Central 2',role:'Central'},
   ];
   localStorage.setItem('volleystats.rosters.v1',JSON.stringify([{id:'setup-roster',name:'Setup',players}]));
  });
  await page.reload();
  await tap('use-roster:setup-roster');
  await page.locator('[name="rival"]').fill('Rival setup');
  await page.locator('[name="date"]').evaluate((input)=>{input.value='2026-09-24'});
  await page.locator('[name="time"]').evaluate((input)=>{input.value='18:00'});
  await page.locator('[name="venue"]').evaluate((input)=>{input.value='home'});
  await page.locator('#match-basics-form button[type="submit"]').click();
  await tap('edit-match-basics');
  assert.equal(await page.locator('[name="rival"]').inputValue(),'Rival setup');
  assert.equal(await page.locator('[name="date"]').inputValue(),'2026-09-24');
  assert.equal(await page.locator('[name="time"]').inputValue(),'18:00');
  assert.equal(await page.locator('[name="venue"]').inputValue(),'home');
  await page.locator('#match-basics-form button[type="submit"]').click();
  await tap('prepare-set-1');
  assert.equal(await page.locator('.setup-lineup-player').count(),6);
  assert.match(await page.locator('.lineup-progress').innerText(),/0\s*\/\s*6/);
  assert.equal(await page.locator('[data-cmd^="rotate-lineup:"]').count(),2);
  assert.equal(await page.locator('[data-cmd^="rotate-lineup:"]:disabled').count(),2);
  assert.equal(await page.locator('.roster-grid').count(),0);
  assert.equal(await page.locator('[data-cmd="manage-roster"]').count(),0);
  assert.equal(await page.locator('#match-basics-form').count(),0);
  for(const [zone,id] of [[1,4],[2,9],[3,12],[4,7],[5,8],[6,15]]){
   await tap('set-zone:'+zone);
   assert.equal(await page.locator('.lineup-player-option').filter({hasText:'Libero'}).count(),0);
   assert.equal(await page.locator('[data-cmd="choose-lineup-player:'+zone+','+id+'"]').count(),1);
   await tap('choose-lineup-player:'+zone+','+id);
  }
  assert.match(await page.locator('main').innerText(),/Sexteto inicial completo/);
  assert.equal(await page.locator('[data-cmd^="rotate-lineup:"]:disabled').count(),0);
  equal(await setupLineup(),[4,9,12,7,8,15]);
  await tap('rotate-lineup:forward');equal(await setupLineup(),[9,12,7,8,15,4]);
  await tap('rotate-lineup:forward');equal(await setupLineup(),[12,7,8,15,4,9]);
  await tap('rotate-lineup:back');equal(await setupLineup(),[9,12,7,8,15,4]);
  await tap('rotate-lineup:back');equal(await setupLineup(),[4,9,12,7,8,15]);
  await tap('rotate-lineup:forward');equal(await setupLineup(),[9,12,7,8,15,4]);
  assert.match(await page.locator('.lineup-progress').innerText(),/6\s*\/\s*6/);
  assert.equal(new Set(await setupLineup()).size,6);
  equal(await state(),null);
  await tap('continue-lineup');
  assert.match(await page.locator('main').innerText(),/Elegir líbero/);
  await tap('back-to-lineup');
  equal(await setupLineup(),[9,12,7,8,15,4]);
  await tap('rotate-lineup:back');equal(await setupLineup(),[4,9,12,7,8,15]);
  await tap('continue-lineup');
  assert.match(await page.locator('main').innerText(),/Elegir líbero/);
  assert.equal(await page.locator('.setup-lineup-player').count(),0);
  assert.equal(await page.locator('.roster-grid').count(),0);
  equal(await state(),null);
  await tap('set-libero:1');
  await tap('continue-libero');
  assert.match(await page.locator('main').innerText(),/Sexteto titular/);
  assert.equal(await page.locator('#match-basics-form').count(),0);
  await tap('set-serving:theirs');
  await tap('back-to-libero');
  assert.equal(await page.locator('[data-cmd="set-libero:1"].selected').count(),1);
  await tap('continue-libero');
  await tap('back-to-lineup');
  assert.match(await page.locator('.lineup-progress').innerText(),/6\s*\/\s*6/);
  await tap('continue-lineup');
  assert.equal(await page.locator('[data-cmd="set-libero:1"].selected').count(),1);
  await tap('continue-libero');
  assert.equal(await page.locator('[data-cmd="set-serving:theirs"].selected').count(),1);
  equal(await state(),null);
  await tap('set-serving:ours');
  await tap('start-match');
  const created=await state();
  equal(created.lineup,[4,9,12,7,8,15]);
  assert.equal(created.serving,true);
  assert.equal(created.activeLiberoId,1);
  assert.equal(created.rosterId,'setup-roster');
  assert.equal(created.rosterName,'Setup');
  assert.equal(created.rival,'Rival setup');
  assert.equal(created.date,'2026-09-24');
  assert.equal(created.time,'18:00');
  assert.equal(created.venue,'Local');
  equal(created.score,[0,0]);
  assert.equal(created.setStarts[0].serving,true);
  equal((await page.locator('.match-title').innerText()).replace(/\s+/g,' ').trim(),'Setup vs Rival setup');

  await tap('theirs');
  await commit('ours');
  await tap('sub');
  await tap('sub-out:9');
  await tap('sub-in:6');
  await tap('review-change');
  await commit('confirm-sub:9,6');
  const finalSetOneLineup=(await state()).lineup;
  assert.notDeepEqual(finalSetOneLineup,[4,9,12,7,8,15]);
  await tap('finish');
  await commit('confirm-finish');
  await tap('next');
  assert.match(await page.locator('main').innerText(),/Preparar Set 2/);
  assert.match(await page.locator('.lineup-progress').innerText(),/6\s*\/\s*6/);
  const preparedSetTwo=await page.locator('.setup-lineup-player').evaluateAll((buttons)=>Object.fromEntries(buttons.map((button)=>[Number(button.dataset.setupZone),Number(button.querySelector('.jersey').textContent.trim())])));
  equal(preparedSetTwo,{1:4,2:9,3:12,4:7,5:8,6:15});
  assert.notDeepEqual(Object.values(preparedSetTwo),finalSetOneLineup);
  assert.equal(await page.locator('[data-cmd^="rotate-lineup:"]:disabled').count(),0);
  await tap('set-zone:6');
  await tap('choose-lineup-player:6,6');
  await tap('rotate-lineup:forward');
  equal(await setupLineup(),[9,12,7,8,6,4]);
  await tap('continue-lineup');
  assert.equal(await page.locator('[data-cmd="set-libero:1"].selected').count(),1);
  await tap('continue-libero');
  await tap('set-serving:theirs');
  await tap('start-match');
  const second=await state();
  equal(second.lineup,[9,12,7,8,6,4]);
  assert.equal(second.set,2);equal(second.score,[0,0]);assert.equal(second.rotation,1);
  assert.equal(second.serving,false);assert.equal(second.activeLiberoId,1);
  equal(second.setStarts[0].lineup,[4,9,12,7,8,15]);
  equal(second.setStarts[1],{set:2,lineup:[9,12,7,8,6,4],activeLiberoId:1,serving:false});
  await tap('finish');
  await commit('confirm-finish');
  await tap('next');
  assert.match(await page.locator('main').innerText(),/Preparar Set 3/);
  const preparedSetThree=await page.locator('.setup-lineup-player').evaluateAll((buttons)=>Object.fromEntries(buttons.map((button)=>[Number(button.dataset.setupZone),Number(button.querySelector('.jersey').textContent.trim())])));
  equal(preparedSetThree,{1:9,2:12,3:7,4:8,5:6,6:4});
 });

 console.log(JSON.stringify({passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,browserErrors:errors},null,2));
 if(results.some(r=>!r.ok)||errors.length)process.exitCode=1;
}finally{await context.setOffline(false);await browser.close();await new Promise(r=>server.close(r));}
