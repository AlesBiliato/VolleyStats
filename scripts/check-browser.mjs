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
async function reset(s=initial()) {await page.goto(url);await page.evaluate(s=>localStorage.setItem('volleystats.match.v1',JSON.stringify(s)),s);await page.reload();await page.locator('.court').waitFor();}
async function tap(cmd){await page.locator(`[data-cmd="${cmd}"]`).first().click();}
async function commit(cmd){await page.waitForTimeout(420);await tap(cmd);}
async function undo(){await tap('undo');await commit('confirm-undo');}
async function check(name,fn){try{await fn();results.push({name,ok:true});console.log('PASS '+name)}catch(e){results.push({name,ok:false});console.error('FAIL '+name+': '+e.message)}}
function equal(a,b){assert.deepEqual(a,b)}
try{
 await check('Puntos, recuperacion del saque, doble toque y deshacer',async()=>{
  await reset();const before=await state();await tap('ours');let s=await state();equal(s.score,[1,0]);equal(s.rotation,2);equal(s.lineup,[9,12,7,8,15,4]);
  await page.waitForTimeout(420);await page.locator('[data-cmd="ours"]').dblclick();equal((await state()).score,[2,0]);
  await commit('theirs');s=await state();equal(s.score,[2,1]);equal(s.serving,false);equal(s.rotation,2);
  await undo();equal((await state()).score,[2,0]);await undo();await undo();equal(await state(),before);
 });
 await check('Errores rivales y los dos errores nuestros, historial y persistencia',async()=>{
  await reset();await tap('serve-error');await commit('attack-error');equal((await state()).score,[2,0]);
  for(const reason of ['rotation','net']){await tap('unforced-error');await commit('record-unforced:'+reason);const s=await state();equal(s.events.at(-1).reason,reason);equal(s.serving,false);equal(s.rotation,2);}
  equal((await state()).score,[2,2]);const saved=await state();await page.reload();equal(await state(),saved);
  await tap('history');assert.match(await page.locator('#modal').innerText(),/Falta de rotación/);assert.match(await page.locator('#modal').innerText(),/Toque de red/);await tap('close');
 });
 await check('Acciones por jugador y sus valoraciones',async()=>{
  const combos=[['Recepción','#',null],['Recepción','+',null],['Recepción','-',null],['Recepción','=',1],['Saque','#',0],['Saque','+',null],['Saque','-',1],['Saque','=',1],['Ataque','#',0],['Ataque','+',null],['Ataque','Blo',1],['Ataque','=',1],['Bloqueo','#',0],['Bloqueo','=',1]];
  for(const [action,grade,team] of combos){await reset();await tap('player:7');await tap('action:'+action);await tap('grade:'+grade);const s=await state();equal(s.score,team===null?[0,0]:team===0?[1,0]:[0,1]);equal(s.events.at(-1).player,7);await undo();equal((await state()).score,[0,0]);}
 });
 await check('Sustitucion cancelada, confirmada y deshecha',async()=>{
  await reset();const before=await state();await tap('sub');await page.selectOption('[name="out"]','4');await page.selectOption('[name="in"]','6');await page.locator('#sub-form button').click();await tap('close');equal(await state(),before);
  await tap('sub');await page.selectOption('[name="out"]','4');await page.selectOption('[name="in"]','6');await page.locator('#sub-form button').click();await tap('confirm-sub:4,6');equal((await state()).lineup,[6,9,12,7,8,15]);await undo();equal(await state(),before);
 });
 await check('Cierre, bloqueo, siguiente set y deshacer',async()=>{
  await reset();await tap('ours');await tap('finish');await commit('confirm-finish');const closed=await state();equal(closed.status,'between');assert(await page.locator('[data-cmd="ours"]').isDisabled());assert(await page.locator('[data-cmd="unforced-error"]').isDisabled());await tap('next');await commit('start:theirs');equal((await state()).set,2);equal((await state()).score,[0,0]);await undo();equal(await state(),closed);await undo();equal((await state()).status,'playing');
 });
 await check('Estadisticas, plantilla e historial',async()=>{
  await reset();await tap('stats');equal(await page.locator('.stats-tabs .primary').innerText(),'General');equal(await page.locator('.stats-tabs button').allTextContents(),['General','K1/K2','Rotaciones','Errores']);await tap('stat-tab:K1/K2');equal(await page.locator('.phase-card').count(),2);assert.match(await page.locator('.phase-card').nth(0).innerText(),/Recepción/);assert.match(await page.locator('.phase-card').nth(1).innerText(),/Saque/);assert.equal(await page.locator('.phase-dashboard table').count(),0);assert.match(await page.locator('.phase-summary').innerText(),/Total de fases/);for(const tab of ['General','Rotaciones','Errores'])await tap('stat-tab:'+tab);assert.doesNotMatch(await page.locator('#stat-body').innerText(),/Sustituciones/);await tap('close');await tap('nav:roster');equal(await page.locator('.roster-grid article').count(),10);
  const matchBefore=await page.evaluate(()=>localStorage.getItem('volleystats.match.v1'));
  const rosterBefore=(await state()).roster;
  await tap('add-roster-player');await page.locator('[name="id"]').fill('22');await page.locator('[name="name"]').fill('Irene');await page.selectOption('[name="role"]','Receptor');await tap('save-roster-player');
  equal(await page.locator('.roster-grid article').count(),11);
  assert(await page.evaluate(()=>JSON.parse(localStorage.getItem('volleystats.roster.v1')).some(p=>p.id===22&&p.name==='Irene')));
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
   assert(await page.evaluate(()=>JSON.parse(localStorage.getItem('volleystats.roster.v1')).some(p=>p.id===22&&p.name==='Irene Editada'&&p.role==='L\u00edbero')));
   equal((await state()).roster,rosterBefore);
   equal(await page.evaluate(()=>localStorage.getItem('volleystats.match.v1')),matchBefore);

   await page.reload();
   await tap('nav:roster');
   assert.match(await page.locator('.roster-grid').innerText(),/Irene Editada/);
   assert(await page.evaluate(()=>JSON.parse(localStorage.getItem('volleystats.roster.v1')).some(p=>p.id===22&&p.name==='Irene Editada'&&p.role==='L\u00edbero')));
   equal((await state()).roster,rosterBefore);
   equal(await page.evaluate(()=>localStorage.getItem('volleystats.match.v1')),matchBefore);

   await tap('edit-roster-player:22');
   await page.locator('[name="id"]').fill('4');
   await tap('save-roster-edit:22');

   assert(await page.locator('#modal').evaluate(el=>el.open));
   assert.match(await page.locator('.dialog-toast.show').innerText(),/utilizado/);
   assert(await page.evaluate(()=>{
     const roster=JSON.parse(localStorage.getItem('volleystats.roster.v1'));
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
 await check('Sin scroll ni controles recortados en tablet y al girar',async()=>{
  const s=initial();s.set=5;s.score=[24,24];s.finishedSets=[1,2,3,4].map(set=>({set,score:[25,23]}));await reset(s);
  for(const [width,height] of [[1024,600],[1280,800],[1024,768],[1180,720],[800,1280],[768,1024],[600,960],[1366,640]]){
   await page.setViewportSize({width,height});
   const failures=await page.evaluate(()=>{const failures=[];for(const el of document.querySelectorAll('#app button,#app .court,#app .bench,#app .latest')){const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;const id=el.dataset.cmd||el.className;if(r.left<0||r.top<0||r.right>innerWidth+1||r.bottom>innerHeight+1)failures.push(id);for(let p=el.parentElement;p&&p.id!=='app';p=p.parentElement){if(['hidden','clip'].includes(getComputedStyle(p).overflowY)){const b=p.getBoundingClientRect();if(r.bottom>b.bottom+1||r.top<b.top-1)failures.push(id+' clipped');}}}if(document.documentElement.scrollHeight>innerHeight||document.documentElement.scrollWidth>innerWidth)failures.push('page overflow');return failures});equal(failures,[]);
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
  const legacy=initial();
  await page.goto(url);
  await page.evaluate(s=>{
    localStorage.clear();
    localStorage.setItem('volleytrack.match.v1',JSON.stringify(s));
    localStorage.setItem('volleytrack.roster.v1',JSON.stringify(s.roster));
  },legacy);
  await page.reload();
  await page.locator('.court').waitFor();
  equal(await state(),legacy);
  assert(await page.evaluate(()=>localStorage.getItem('volleystats.match.v1')!==null));
  assert(await page.evaluate(()=>localStorage.getItem('volleystats.roster.v1')!==null));
 });
 await check('Datos guardados invalidos no dejan la pantalla en blanco',async()=>{
  await reset();await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('volleystats.match.v1'));s.lineup[0]=999;localStorage.setItem('volleystats.match.v1',JSON.stringify(s))});await page.reload();await page.locator('.court').waitFor({timeout:3000});assert.match(await page.locator('.save-state').innerText(),/Guardado no disponible/);await tap('ours');equal((await state()).lineup[0],999);assert.match(await page.locator('#toast').innerText(),/No se pudo guardar/);
 });
 console.log(JSON.stringify({passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,browserErrors:errors},null,2));
 if(results.some(r=>!r.ok)||errors.length)process.exitCode=1;
}finally{await context.setOffline(false);await browser.close();await new Promise(r=>server.close(r));}
