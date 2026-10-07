import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {initial,transition} from '../src/domain.js';
import {createDevServer} from './serve.mjs';
const {chromium}=await import(process.argv[2]?pathToFileURL(process.argv[2]).href:'playwright');
const root=path.resolve(new URL('..',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
const devServer=createDevServer();
await new Promise(resolve=>devServer.listen(0,'127.0.0.1',resolve));
const devUrl=`http://127.0.0.1:${devServer.address().port}`;
assert.equal((await fetch(`${devUrl}/vendor/jspdf.umd.min.js`)).status,200);
assert.equal((await fetch(`${devUrl}/vendor/jspdf.plugin.autotable.min.js`)).status,200);
assert.notEqual((await fetch(`${devUrl}/node_modules/jspdf/dist/jspdf.umd.min.js`)).status,200);
await new Promise((resolve,reject)=>devServer.close(error=>error?reject(error):resolve()));
execFileSync(process.execPath,['scripts/build.mjs'],{cwd:root,stdio:'inherit'});
const publicRoot=path.join(root,'dist');
const builtPdfReport=await readFile(path.join(publicRoot,'src','pdf-report.js'),'utf8');
assert.doesNotMatch(builtPdfReport,/\/node_modules\/jspdf(?:-autotable)?/);
await readFile(path.join(publicRoot,'vendor','jspdf.umd.min.js'));
await readFile(path.join(publicRoot,'vendor','jspdf.plugin.autotable.min.js'));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{try{const name=new URL(req.url,'http://local').pathname;const file=path.resolve(publicRoot,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(publicRoot+path.sep))throw Error();res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-cache');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true});
const errors=[];const results=[];
const context=await browser.newContext({viewport:{width:1024,height:600}});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const runtimeRequests=[];
page.on('request',request=>runtimeRequests.push(new URL(request.url()).pathname));
page.on('response',response=>{if(response.status()===404)errors.push(`HTTP 404: ${new URL(response.url()).pathname}`)});
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
function finishedMatch({id,rival,date,time='18:00',venue='Local',rosterName='Plantilla histórica',sets=[[25,20]],playerName=null,action=null}){
 let match=initial();
 match.demo=false;
 Object.assign(match,{id,rival,date,time,venue,rosterName,set:sets.length||1,finishedSets:sets.map((score,index)=>({set:index+1,score}))});
 if(playerName)match.roster.find(player=>player.id===7).name=playerName;
 if(action)match=transition(match,{type:'action',player:7,...action});
 return transition(match,{type:'finish-match',label:'Partido finalizado'});
}
try{
 await check('Favicon oficial único, accesible y decodificable',async()=>{
  await page.goto(url);
  const links=page.locator('link[rel~="icon"]');assert.equal(await links.count(),1);assert.equal(await links.first().getAttribute('type'),'image/png');assert.equal(await links.first().getAttribute('sizes'),'64x64');assert.match(await links.first().getAttribute('href'),/^\.\/src\/assets\/favicon\.png$/);
  const favicon=await page.evaluate(async()=>{const href=document.querySelector('link[rel~="icon"]').href,response=await fetch(href),blob=await response.blob(),image=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d');context.drawImage(image,0,0);const pixels=context.getImageData(0,0,image.width,image.height).data,alpha=[];let opaqueWhite=0;for(let index=0;index<pixels.length;index+=4){alpha.push(pixels[index+3]);if(pixels[index+3]===255&&pixels[index]>=245&&pixels[index+1]>=245&&pixels[index+2]>=245)opaqueWhite++;}const cornerAlpha=[pixels[3],pixels[(image.width-1)*4+3],pixels[(image.width*(image.height-1))*4+3],pixels[(image.width*image.height-1)*4+3]],result={pathname:new URL(href).pathname,status:response.status,type:response.headers.get('content-type'),blobType:blob.type,width:image.width,height:image.height,transparent:alpha.filter(value=>value===0).length,opaque:alpha.filter(value=>value===255).length,opaqueWhite,cornerAlpha};image.close();return result;});
  assert.deepEqual({...favicon,transparent:undefined,opaque:undefined,opaqueWhite:undefined},{pathname:'/src/assets/favicon.png',status:200,type:'image/png',blobType:'image/png',width:64,height:64,transparent:undefined,opaque:undefined,opaqueWhite:undefined,cornerAlpha:[0,0,0,0]});assert(favicon.transparent>500,'el fondo exterior es transparente');assert(favicon.opaque>500,'el símbolo conserva píxeles opacos');assert(favicon.opaqueWhite>0,'se conservan detalles blancos internos');
 });
 await check('Logo oficial accesible y contenido en cabecera',async()=>{
  await page.goto(url);await page.evaluate(()=>localStorage.clear());await page.reload();await page.locator('.brand-logo').waitFor();
  assert.equal(await page.locator('.brand-logo').getAttribute('alt'),'VolleyStats');assert.match(await page.locator('.brand-logo').getAttribute('src'),/src\/assets\/logo\.png$/);assert.deepEqual(await page.locator('.brand-logo').evaluate(image=>({complete:image.complete,width:image.naturalWidth,height:image.naturalHeight})),{complete:true,width:1254,height:1254});
  for(const [width,height] of [[768,1024],[1024,768],[1280,800],[1366,768],[1920,1080]]){await page.setViewportSize({width,height});const layout=await page.evaluate(()=>{const header=document.querySelector('#app > header').getBoundingClientRect(),logo=document.querySelector('.brand-logo').getBoundingClientRect();return {headerInside:header.left>=0&&header.right<=innerWidth+1&&header.top>=0&&header.bottom<=innerHeight+1,logoInside:logo.left>=header.left-1&&logo.right<=header.right+1&&logo.top>=header.top-1&&logo.bottom<=header.bottom+1,pageOverflow:document.documentElement.scrollWidth>innerWidth+1,ratio:logo.width/logo.height};});assert.equal(layout.headerInside,true,`${width}x${height} cabecera visible`);assert.equal(layout.logoInside,true,`${width}x${height} logo dentro de cabecera`);assert.equal(layout.pageOverflow,false,`${width}x${height} sin overflow horizontal`);assert(Math.abs(layout.ratio-1)<0.01,`${width}x${height} logo sin deformar`);}
  await page.setViewportSize({width:1024,height:600});
 });
 await check('Bienvenida sin plantillas, creación y datos básicos del partido',async()=>{
  await page.goto(url);
  await page.evaluate(()=>localStorage.clear());
  await page.reload();

  assert.match(
   await page.locator('main').innerText(),
   /Bienvenido a VolleyStats/,
  );
  assert.match(await page.locator('main').innerText(),/Aún no tienes ninguna plantilla/);
  assert.match(await page.locator('main').innerText(),/Primero crea una plantilla para empezar/);
  assert.match(await page.locator('main').innerText(),/Ver archivo de partidos/);
  assert.equal(await page.locator('[data-cmd="continue-welcome"]').isDisabled(),true);
  assert.equal(await page.locator('#match-basics-form').count(),0);
  await page.locator('[data-cmd="continue-welcome"]').dispatchEvent('click');
  assert.equal(await page.locator('#match-basics-form').count(),0);

  equal(await state(),null);

  await tap('new-roster');
  assert.match(await page.locator('main').innerText(),/Configura tu equipo/);

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
  assert.match(await page.locator('main').innerText(),/Bienvenido a VolleyStats/);
  assert.equal(await page.locator(`[data-cmd="select-roster:${rosters[0].id}"]`).getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-cmd="continue-welcome"]').isDisabled(),false);
  assert.equal(await page.locator('#match-basics-form').count(),0);
  await tap('continue-welcome');

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
   /Bienvenido a VolleyStats/,
  );

  equal(await state(),null);

  await page.evaluate(()=>localStorage.clear());
 });

 await check('Bienvenida selecciona una sola plantilla, permite cancelar y es responsive',async()=>{
  const players=initial().roster;
  await page.goto(url);
  await page.evaluate((players)=>{
   localStorage.clear();
   localStorage.setItem('volleystats.rosters.v1',JSON.stringify([
    {id:'roster-a',name:'Club Deportivo Voleibol Ciudad Universitaria del Norte',players},
    {id:'roster-b',name:'Plantilla B',players},
    {id:'roster-c',name:'Plantilla C',players},
   ]));
  },players);
  await page.reload();

  assert.match(await page.locator('main').innerText(),/Bienvenido a VolleyStats/);
  assert.equal(await page.locator('.welcome-roster-card').count(),3);
  assert.equal(await page.locator('.welcome-roster-option[aria-pressed="true"]').count(),0);
  assert.equal(await page.locator('[data-cmd="continue-welcome"]').isDisabled(),true);

  await tap('select-roster:roster-b');
  assert.equal(await page.locator('#match-basics-form').count(),0,'seleccionar no avanza');
  assert.equal(await page.locator('.welcome-roster-option[aria-pressed="true"]').count(),1);
  assert.equal(await page.locator('[data-cmd="select-roster:roster-b"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-cmd="select-roster:roster-a"]').getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('[data-cmd="continue-welcome"]').isDisabled(),false);
  await tap('select-roster:roster-c');
  assert.equal(await page.locator('[data-cmd="select-roster:roster-b"]').getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('[data-cmd="select-roster:roster-c"]').getAttribute('aria-pressed'),'true');
  await tap('select-roster:roster-b');

  for(const [width,height] of [[768,1024],[1024,768],[1280,800],[1366,768],[1920,1080]]){
   await page.setViewportSize({width,height});
   const layout=await page.evaluate(({width,height})=>{
    const card=document.querySelector('.welcome-card').getBoundingClientRect();
    const proceed=document.querySelector('[data-cmd="continue-welcome"]').getBoundingClientRect();
    const controls=[...document.querySelectorAll('.welcome-roster-option,.welcome-roster-tools button,.welcome-toolbar button,[data-cmd="continue-welcome"]')].map(control=>{const box=control.getBoundingClientRect();return {height:box.height,left:box.left,right:box.right};});
    return {
     horizontal:document.documentElement.scrollWidth>width+1,
     cardInside:card.left>=-1&&card.right<=width+1&&card.top>=-1&&card.bottom<=height+1,
     proceedInside:proceed.top>=-1&&proceed.bottom<=height+1,
     controls,
    };
   },{width,height});
   assert.equal(layout.horizontal,false,`${width}x${height} sin overflow horizontal`);
   assert.equal(layout.cardInside,true,`${width}x${height} tarjeta visible`);
   assert.equal(layout.proceedInside,true,`${width}x${height} Continuar visible`);
   for(const control of layout.controls){assert(control.height>=43.5);assert(control.left>=-1&&control.right<=width+1);}
  }

  await page.setViewportSize({width:1024,height:600});
  const rosterCount=await page.evaluate(()=>JSON.parse(localStorage.getItem('volleystats.rosters.v1')).length);
  await tap('new-roster');
  assert.match(await page.locator('main').innerText(),/Configura tu equipo/);
  await tap('cancel-new-roster');
  assert.match(await page.locator('main').innerText(),/Bienvenido a VolleyStats/);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('volleystats.rosters.v1')).length),rosterCount);
  assert.equal(await page.locator('[data-cmd="select-roster:roster-b"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#match-basics-form').count(),0);

  await tap('continue-welcome');
  assert.match(await page.locator('.setup-roster-reference').innerText(),/Plantilla B/);
  assert.equal(await page.locator('[data-cmd^="select-roster:"]').count(),0);
  assert.equal(await page.locator('#match-basics-form').count(),1);
  await tap('back-to-welcome');
  assert.equal(await page.locator('[data-cmd="select-roster:roster-b"]').getAttribute('aria-pressed'),'true');
 });

 await check('Bienvenida con muchas plantillas conserva acceso y scroll vertical',async()=>{
  const players=initial().roster;
  await page.goto(url);
  await page.evaluate((players)=>{
   localStorage.clear();
   const rosters=Array.from({length:15},(_,index)=>({
    id:`many-${String(index+1).padStart(2,'0')}`,
    name:`Plantilla ${String(index+1).padStart(2,'0')}`,
    players,
   }));
   localStorage.setItem('volleystats.rosters.v1',JSON.stringify(rosters));
  },players);
  await page.reload();

  let scrollRequired=false;
  for(const [width,height] of [[768,1024],[1024,768],[1024,600],[1366,768],[1920,1080]]){
   await page.setViewportSize({width,height});
   const main=page.locator('.welcome-stage');
   await main.evaluate(element=>element.scrollTo(0,0));
   const top=await page.evaluate(({width,height})=>{
    const stage=document.querySelector('.welcome-stage');
    const stageBox=stage.getBoundingClientRect();
    const heading=document.querySelector('.welcome-heading h1').getBoundingClientRect();
    const first=document.querySelector('.welcome-roster-card').getBoundingClientRect();
    return {
     horizontal:document.documentElement.scrollWidth>width+1||stage.scrollWidth>stage.clientWidth+1,
     headingAccessible:heading.top>=stageBox.top-1&&heading.bottom<=Math.min(stageBox.bottom,height)+1,
     firstAccessible:first.top>=stageBox.top-1&&first.bottom<=Math.min(stageBox.bottom,height)+1,
     contentStartsInside:document.querySelector('.welcome-card').getBoundingClientRect().top>=stageBox.top-1,
     needsScroll:stage.scrollHeight>stage.clientHeight+1,
    };
   },{width,height});
   assert.equal(top.horizontal,false,`${width}x${height} sin overflow horizontal`);
   assert.equal(top.headingAccessible,true,`${width}x${height} cabecera accesible`);
   assert.equal(top.firstAccessible,true,`${width}x${height} primera plantilla accesible`);
   assert.equal(top.contentStartsInside,true,`${width}x${height} contenido no queda por encima`);
   scrollRequired ||= top.needsScroll;

   await main.evaluate(element=>element.scrollTo(0,element.scrollHeight));
   const bottom=await page.evaluate(({height})=>{
    const stage=document.querySelector('.welcome-stage');
    const stageBox=stage.getBoundingClientRect();
    const last=document.querySelector('.welcome-roster-card:last-child').getBoundingClientRect();
    const proceed=document.querySelector('[data-cmd="continue-welcome"]').getBoundingClientRect();
    const controls=[...document.querySelectorAll('.welcome-roster-option,.welcome-roster-tools button,[data-cmd="continue-welcome"]')].map(control=>control.getBoundingClientRect().height);
    return {
     lastAccessible:last.top<Math.min(stageBox.bottom,height)&&last.bottom<=Math.min(stageBox.bottom,height)+1,
     proceedAccessible:proceed.top>=stageBox.top-1&&proceed.bottom<=Math.min(stageBox.bottom,height)+1,
     scrollTop:stage.scrollTop,
     needsScroll:stage.scrollHeight>stage.clientHeight+1,
     tactile:controls.every(value=>value>=43.5),
    };
   },{height});
   assert.equal(bottom.lastAccessible,true,`${width}x${height} última plantilla alcanzable`);
   assert.equal(bottom.proceedAccessible,true,`${width}x${height} Continuar alcanzable`);
   assert.equal(bottom.tactile,true,`${width}x${height} controles táctiles`);
   if(bottom.needsScroll)assert(bottom.scrollTop>0,`${width}x${height} permite scroll vertical`);

   await main.evaluate(element=>element.scrollTo(0,0));
   assert.equal(await page.locator('.welcome-heading h1').isVisible(),true);
  }
  assert.equal(scrollRequired,true,'el contenido alto activa scroll vertical');

  await page.setViewportSize({width:1024,height:600});
  await page.locator('.welcome-stage').evaluate(element=>element.scrollTo(0,element.scrollHeight));
  await tap('select-roster:many-15');
  assert.equal(await page.locator('[data-cmd="select-roster:many-15"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-cmd="continue-welcome"]').isDisabled(),false);
  await page.locator('.welcome-stage').evaluate(element=>element.scrollTo(0,element.scrollHeight));
  await tap('continue-welcome');
  assert.match(await page.locator('.setup-roster-reference').innerText(),/Plantilla 15/);
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

  equal(await page.locator('.welcome-roster-card').count(),2);

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

  equal(await page.locator('.welcome-roster-card').count(),1);

  await page.reload();

  assert.doesNotMatch(await page.locator('main').innerText(),/Equipo A/);
  assert.match(await page.locator('main').innerText(),/Equipo B/);

  await tap('delete-roster:roster-b');
  await tap('confirm-delete-roster:roster-b');

  assert.match(await page.locator('main').innerText(),/Aún no tienes ninguna plantilla/);
  assert.equal(await page.locator('[data-cmd="continue-welcome"]').isDisabled(),true);

  await page.evaluate(()=>localStorage.clear());
 });

 await check('Puntos, recuperacion del saque, doble toque y deshacer',async()=>{
  await reset();const before=await state();await tap('ours');let s=await state();equal(s.score,[1,0]);equal(s.rotation,6);equal(s.lineup,[9,12,7,8,15,4]);
  await page.waitForTimeout(420);await page.locator('[data-cmd="ours"]').dblclick();equal((await state()).score,[2,0]);
  await commit('theirs');s=await state();equal(s.score,[2,1]);equal(s.serving,false);equal(s.rotation,6);
  await undo();equal((await state()).score,[2,0]);await undo();await undo();equal(await state(),before);
 });
 await check('Acciones recientes se adaptan al ancho y siguen el historial real',async()=>{
  const settleLayout=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const recentLayout=()=>page.evaluate(()=>{
   const strip=document.querySelector('.latest'),track=document.querySelector('.latest-actions-track'),all=[...document.querySelectorAll('.recent-action')],visible=all.filter(item=>!item.hidden),trackBox=track?.getBoundingClientRect(),current=document.querySelector('.recent-action.current');
   return {count:visible.length,indices:visible.map(item=>Number(item.dataset.eventIndex)),singleLine:new Set(visible.map(item=>Math.round(item.getBoundingClientRect().top))).size<=1,inside:visible.every(item=>{const box=item.getBoundingClientRect();return box.left>=trackBox.left-1&&box.right<=trackBox.right+1;}),latestVisible:Boolean(current&&!current.hidden),latestIndex:Number(current?.dataset.eventIndex),latestRightmost:visible.every(item=>item.getBoundingClientRect().right<=current.getBoundingClientRect().right+1),pageOverflow:document.documentElement.scrollWidth>innerWidth,trackOverflow:track?track.scrollWidth>track.clientWidth+1:false,height:strip.getBoundingClientRect().height};
  });

  await page.setViewportSize({width:1024,height:768});
  await reset();
  assert.equal(await page.locator('.recent-action').count(),0);
  assert.match(await page.locator('.latest-empty').innerText(),/Listos para el primer punto/);
  assert.match(await page.locator('.latest-empty').innerText(),/0 – 0/);

  const one=transition(initial(),{type:'point',team:0,label:'Punto para nosotros'});
  await reset(one);await settleLayout();
  assert.equal(await page.locator('.recent-action').count(),1);
  assert.equal(await page.locator('.recent-action.current').innerText(),'Punto para nosotros\n1 – 0');
  assert.match(await page.locator('.recent-action.current').getAttribute('aria-label'),/Punto para nosotros\. Marcador 1 – 0/);

  const commands=[4,9,12,7,8,15].flatMap(player=>[
   {type:'action',player,action:'Ataque',grade:'?',label:`#${player} · Ataque ?`},
   {type:'action',player,action:'Recepción',grade:'+',label:`#${player} · Recepción +`},
  ]);
  const sample=commands.reduce(transition,initial());
  await page.setViewportSize({width:1920,height:1080});await reset(sample);await settleLayout();
  const wide=await recentLayout();
  assert(wide.count>1);assert.equal(wide.singleLine,true);assert.equal(wide.inside,true);assert.equal(wide.latestVisible,true);assert.equal(wide.latestIndex,sample.events.length-1);assert.equal(wide.latestRightmost,true);assert.deepEqual(wide.indices,[...wide.indices].sort((a,b)=>a-b));

  await page.setViewportSize({width:768,height:1024});await settleLayout();
  const narrow=await recentLayout();
  assert(wide.count>narrow.count,'el viewport amplio muestra más acciones');assert(narrow.count>=1);assert(narrow.indices[0]>0,'desaparecen primero las acciones más antiguas');assert.deepEqual(narrow.indices,Array.from({length:narrow.count},(_,index)=>sample.events.length-narrow.count+index));assert.equal(narrow.latestVisible,true);assert.equal(narrow.latestRightmost,true);

  for(const [width,height] of [[768,1024],[1024,768],[1280,800],[1366,768],[1920,1080],[1024,600],[1366,640]]){
   await page.setViewportSize({width,height});await settleLayout();const layout=await recentLayout();
   assert.equal(layout.singleLine,true,`${width}x${height} una fila`);assert.equal(layout.inside,true,`${width}x${height} chips completos`);assert.equal(layout.latestVisible,true,`${width}x${height} última visible`);assert.equal(layout.latestRightmost,true,`${width}x${height} última a la derecha`);assert.equal(layout.pageOverflow,false,`${width}x${height} sin overflow de página`);assert.equal(layout.trackOverflow,false,`${width}x${height} sin scroll horizontal`);assert(layout.height<=32,`${width}x${height} altura compacta`);
  }

  const longLabel='Cambio de líbero activo · Jugador con un nombre extraordinariamente largo → Otro jugador con nombre igualmente largo';
  const longState=transition(initial(),{type:'action',player:7,action:'Ataque',grade:'?',label:longLabel});
  await page.setViewportSize({width:768,height:1024});await reset(longState);await settleLayout();
  const longChip=page.locator('.recent-action.current');assert.equal(await longChip.getAttribute('title'),`${longLabel}. Marcador 0 – 0`);assert.equal(await longChip.getAttribute('aria-label'),`${longLabel}. Marcador 0 – 0`);assert.equal(await longChip.evaluate(item=>item.querySelector('.recent-action-label').scrollWidth>item.querySelector('.recent-action-label').clientWidth),true);assert.equal((await recentLayout()).inside,true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);

  await page.setViewportSize({width:1024,height:768});await reset(sample);await undo();await settleLayout();
  assert.equal((await state()).events.length,sample.events.length-1);assert.equal(await page.locator('.recent-action').count(),sample.events.length-1);assert.equal(Number(await page.locator('.recent-action.current').getAttribute('data-event-index')),sample.events.length-2);
  await tap(`history`);await tap(`edit-event:${sample.events.length-2}`);await page.selectOption('[name="player"]','4');await page.locator('#edit-form button[type="submit"]').click();await tap('confirm-correction');await settleLayout();assert.match(await page.locator('.recent-action.current').innerText(),/#4 · Ataque \?/);assert.doesNotMatch(await page.locator('.recent-action.current').innerText(),/#15 · Ataque \?/);
 });
 await check('Errores rivales y errores nuestros, historial, correccion y persistencia',async()=>{
  await reset();await tap('serve-error');await commit('attack-error');equal((await state()).score,[2,0]);
  for(const reason of ['rotation','net']){await tap('unforced-error');await commit('record-unforced:'+reason);const s=await state();equal(s.events.at(-1).reason,reason);equal(s.events.at(-1).category,'unforced-error');equal(s.serving,false);equal(s.rotation,6);}
  const beforeOther=await state();await tap('unforced-error');assert.match(await page.locator('#modal').innerText(),/Otros/);assert.equal(await page.locator('[data-cmd="record-unforced:other"]').count(),1);await commit('record-unforced:other');
  let otherState=await state();equal(otherState.score,[2,3]);equal(otherState.serving,false);equal(otherState.rotation,beforeOther.rotation);equal(otherState.events.at(-1).category,'unforced-error');equal(otherState.events.at(-1).reason,'other');assert.match(otherState.events.at(-1).label,/Otros/);
  await undo();equal(await state(),beforeOther);await tap('unforced-error');await commit('record-unforced:other');
  const saved=await state();await page.reload();equal(await state(),saved);
  await tap('history');const historyText=await page.locator('#modal').innerText();assert.match(historyText,/Falta de rotación/);assert.match(historyText,/Toque de red/);assert.match(historyText,/Otros/);
  await tap('edit-event:4');assert.equal(await page.locator('[name="kind"]').inputValue(),'other');assert.equal(await page.locator('[name="kind"] option[value="other"]').count(),1);await page.locator('#edit-form button[type="submit"]').click();await tap('confirm-correction');
  otherState=await state();equal(otherState.events.at(-1).reason,'other');equal(otherState.events.at(-1).category,'unforced-error');
  await tap('stats');await tap('stat-tab:Errores');assert.match(await page.locator('#stat-body').innerText(),/Otros\s+1/);await tap('close');
 });
 await check('Libero activo seleccionable y banquillo sin duplicados',async()=>{
  const withLibero=initial();withLibero.activeLiberoId=1;withLibero.setStarts[0].activeLiberoId=1;
  withLibero.roster.push({id:17,name:'Segundo libero',role:'Líbero'});
  await reset(withLibero);
  const control=page.locator('.active-libero-control');
  assert.equal(await control.count(),1,'se muestra el control del líbero activo');
  assert.match(await control.innerText(),/1/);assert.match(await control.innerText(),/Nico/);assert.equal(await control.locator('kbd').count(),0);
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
  const afterLiberoReception=await state();await tap('player:1');equal(await state(),afterLiberoReception);assert.equal(await page.locator('#modal').evaluate(dialog=>dialog.open),false);assert.match(await page.locator('#toast').innerText(),/Recepción no disponible/);
  await tap('player:7');
  assert.deepEqual(await page.locator('.action-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),['action:Saque','action:Recepción','action:Ataque','action:Bloqueo']);
  assert.equal(await page.locator('[data-cmd="action:Recepción"]').isDisabled(),true);assert.equal(await page.locator('.grade-options').count(),0);await tap('close');

  const withoutLibero=initial();withoutLibero.activeLiberoId=null;
  await reset(withoutLibero);assert.equal(await page.locator('.active-libero').count(),0,'sin líbero activo no se deja un bloque vacío');
  assert.equal(await page.locator('.bench-player[data-player-id="1"]').count(),1,'el líbero inactivo se muestra en el banquillo');

  const between=initial();between.activeLiberoId=1;between.setStarts[0].activeLiberoId=1;between.status='between';
  await reset(between);assert.equal(await page.locator('.active-libero-control').count(),1,'el líbero sigue visible entre sets');
  assert.equal(await page.locator('.active-libero-control').isDisabled(),true);
 });
 await check('Acciones por jugador y sus valoraciones',async()=>{
  const combos=[['Recepción','#',null],['Recepción','+',null],['Recepción','-',null],['Recepción','=',1],['Saque','#',0],['Saque','?',null],['Saque','=',1],['Ataque','#',0],['Ataque','?',null],['Ataque','Blo',1],['Ataque','=',1],['Bloqueo','#',0],['Bloqueo','=',1]];
  for(const [action,grade,team] of combos){let match=initial();if(action!=='Recepción'){match.serving=true;match.setStarts[0].serving=true;}if(['Ataque','Bloqueo'].includes(action))match=transition(match,{type:'action',player:12,action:'Saque',grade:'?',label:'Saque ?'});await reset(match);await tap('player:7');if(['Ataque','Bloqueo'].includes(action))await tap('action:'+action);await tap('grade:'+grade);const s=await state();equal(s.score,team===null?[0,0]:team===0?[1,0]:[0,1]);equal(s.events.at(-1).player,7);await undo();equal((await state()).score,[0,0]);}
 });
 await check('Orden visible de valoraciones de Ataque',async()=>{
  const serving=initial();serving.serving=true;serving.setStarts[0].serving=true;const served=transition(serving,{type:'action',player:12,action:'Saque',grade:'?',label:'Saque ?'});await reset(served);await tap('player:7');await tap('action:Ataque');assert.deepEqual(await page.locator('.grade-options button b').allTextContents(),['#','?','=','Blq']);assert.deepEqual(await page.locator('.grade-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),['grade:#','grade:?','grade:=','grade:Blo']);assert.deepEqual(await page.locator('.grade-options kbd').allTextContents(),['1','2','3','4']);assert.doesNotMatch(await page.locator('.grade-options').innerText(),/\+|-/);await tap('close');
  await reset(serving);await tap('player:7');assert.deepEqual(await page.locator('.grade-options button b').allTextContents(),['#','?','=']);assert.deepEqual(await page.locator('.grade-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),['grade:#','grade:?','grade:=']);assert.deepEqual(await page.locator('.grade-options kbd').allTextContents(),['1','2','3']);assert.doesNotMatch(await page.locator('.grade-options').innerText(),/\+|-/);await tap('close');
 });
 await check('Correcciones acepta Ataque ? y representa ataques historicos como ?',async()=>{
  const currentAttack=transition(initial(),{type:'action',player:7,action:'Ataque',grade:'?',label:'Ataque ?'});await reset(currentAttack);await tap('history');await tap('edit-event:0');assert.deepEqual(await page.locator('#edit-grade option').evaluateAll(options=>options.map(option=>[option.value,option.textContent])),[['#','#'],['?','?'],['=','='],['Blo','Blq']]);assert.equal(await page.locator('#edit-grade').inputValue(),'?');await page.locator('#edit-form button[type="submit"]').click();await tap('confirm-correction');assert.equal((await state()).events[0].grade,'?');
  const legacyAttack=transition(initial(),{type:'action',player:7,action:'Ataque',grade:'+',label:'Ataque +'});await reset(legacyAttack);await tap('history');await tap('edit-event:0');assert.equal((await state()).events[0].grade,'+');assert.equal(await page.locator('#edit-grade').inputValue(),'?');await page.locator('#edit-form button[type="submit"]').click();await tap('confirm-correction');let corrected=await state();assert.equal(corrected.events[0].grade,'?');assert.deepEqual(corrected.score,legacyAttack.score);await page.reload();assert.equal((await state()).events[0].grade,'?');
  const legacyAttackMinus=transition(initial(),{type:'action',player:7,action:'Ataque',grade:'-',label:'Ataque -'});await reset(legacyAttackMinus);await tap('history');await tap('edit-event:0');assert.equal((await state()).events[0].grade,'-');assert.equal(await page.locator('#edit-grade').inputValue(),'?');await page.locator('#edit-form button[type="submit"]').click();await tap('confirm-correction');corrected=await state();assert.equal(corrected.events[0].grade,'?');assert.deepEqual(corrected.score,legacyAttackMinus.score);
 });
 await check('Correcciones moderniza Saque legacy sin cambiar su resultado',async()=>{
  const currentServe=transition(initial(),{type:'action',player:7,action:'Saque',grade:'?',label:'Saque ?'});await reset(currentServe);await tap('history');await tap('edit-event:0');assert.deepEqual(await page.locator('#edit-grade option').evaluateAll(options=>options.map(option=>[option.value,option.textContent])),[['#','#'],['?','?'],['=','=']]);assert.equal(await page.locator('#edit-grade').inputValue(),'?');await tap('close');
  const legacyPlus=transition(initial(),{type:'action',player:7,action:'Saque',grade:'+',label:'Saque +'});await reset(legacyPlus);await tap('history');await tap('edit-event:0');assert.equal((await state()).events[0].grade,'+');assert.equal(await page.locator('#edit-grade').inputValue(),'?');await page.locator('#edit-form button[type="submit"]').click();await tap('confirm-correction');let corrected=await state();assert.equal(corrected.events[0].grade,'?');assert.deepEqual(corrected.score,legacyPlus.score);
  const legacyMinus=transition(initial(),{type:'action',player:7,action:'Saque',grade:'-',label:'Saque -'});await reset(legacyMinus);await tap('history');await tap('edit-event:0');assert.equal((await state()).events[0].grade,'-');assert.equal(await page.locator('#edit-grade').inputValue(),'=');await page.locator('#edit-form button[type="submit"]').click();await tap('confirm-correction');corrected=await state();assert.equal(corrected.events[0].grade,'=');assert.deepEqual(corrected.score,legacyMinus.score);
 });
 await check('Historial y correccion son tactiles, responsive y bloquean atajos deportivos',async()=>{
  const commands=['Ataque','Saque','Recepción','Bloqueo','Ataque'].map((action,index)=>({type:'action',player:index%2?8:7,action,grade:action==='Ataque'?'?':action==='Saque'?'?':action==='Bloqueo'?'#':'+',label:`Registro ${index+1}`}));
  const sample=commands.reduce(transition,initial());await reset(sample);await tap('history');assert.equal(await page.locator('#modal').evaluate(dialog=>dialog.classList.contains('history-dialog')),true);assert.equal(await page.locator('.history-entry').count(),5);assert.equal(await page.locator('.history-entry .edit-event').count(),5);
  for(const [width,height] of [[768,1024],[1024,768],[1280,800],[1366,768],[1920,1080],[1024,600],[1366,640]]){await page.setViewportSize({width,height});const layout=await page.evaluate(()=>{const dialog=document.querySelector('#modal'),box=dialog.getBoundingClientRect(),list=dialog.querySelector('.history-list').getBoundingClientRect(),buttons=[...dialog.querySelectorAll('.edit-event,.history-more')].map(button=>{const rect=button.getBoundingClientRect();return {height:rect.height,inside:rect.left>=box.left-1&&rect.right<=box.right+1};});return {inside:box.left>=0&&box.right<=innerWidth+1&&box.top>=0&&box.bottom<=innerHeight+1,horizontal:dialog.scrollWidth<=dialog.clientWidth+1,listInside:list.left>=box.left-1&&list.right<=box.right+1,buttons};});assert.equal(layout.inside,true,`${width}x${height} historial dentro del viewport`);assert.equal(layout.horizontal,true,`${width}x${height} historial sin overflow horizontal`);assert.equal(layout.listInside,true);for(const button of layout.buttons){assert(button.height>=(width>=1200?45.5:49.5));assert.equal(button.inside,true);}}
  await tap('edit-event:0');const before=await state();assert.equal(await page.locator('#modal').evaluate(dialog=>dialog.classList.contains('correction-dialog')&&dialog.dataset.context==='correction'),true);assert.deepEqual(await page.locator('#edit-form .form-select').evaluateAll(selects=>selects.map(select=>select.name)),['player','action','grade']);
  await press('0','l','e','1','2');equal(await state(),before);assert.equal(await page.locator('#modal').evaluate(dialog=>dialog.open),true);assert.equal(await page.locator('.keyboard-jersey-status').innerText(),'');
  for(const [width,height] of [[768,1024],[1024,768],[1280,800],[1366,768],[1920,1080],[1024,600],[1366,640]]){await page.setViewportSize({width,height});const layout=await page.evaluate(()=>{const dialog=document.querySelector('#modal'),box=dialog.getBoundingClientRect(),selects=[...dialog.querySelectorAll('.form-select')].map(select=>{const rect=select.getBoundingClientRect(),style=getComputedStyle(select);return {top:Math.round(rect.top),height:rect.height,font:parseFloat(style.fontSize),inside:rect.left>=box.left-1&&rect.right<=box.right+1&&rect.top>=box.top-1&&rect.bottom<=box.bottom+1};}),buttons=[...dialog.querySelectorAll('.correction-actions button,.correction-delete-button')].map(button=>{const rect=button.getBoundingClientRect();return {height:rect.height,inside:rect.left>=box.left-1&&rect.right<=box.right+1&&rect.top>=box.top-1&&rect.bottom<=box.bottom+1};});return {inside:box.left>=0&&box.right<=innerWidth+1&&box.top>=0&&box.bottom<=innerHeight+1,horizontal:dialog.scrollWidth<=dialog.clientWidth+1,selects,buttons};});assert.equal(layout.inside,true,`${width}x${height} corrección dentro del viewport`);assert.equal(layout.horizontal,true,`${width}x${height} corrección sin overflow horizontal`);assert.equal(layout.selects.length,3);for(const select of layout.selects){assert(select.height>=(width>=1200?47.5:51.5));assert(select.font>=15);assert.equal(select.inside,true);}for(const button of layout.buttons){assert(button.height>=(width>=1200?47.5:51.5)||button.height>=47.5);assert.equal(button.inside,true);}if(width<=820)assert.equal(new Set(layout.selects.map(select=>select.top)).size,3);else assert.equal(new Set(layout.selects.map(select=>select.top)).size,1);}
  await page.selectOption('[name="player"]','8');await page.selectOption('#edit-action','Recepción');assert.deepEqual(await page.locator('#edit-grade option').evaluateAll(options=>options.map(option=>[option.value,option.textContent])),[['#','#'],['+','+'],['-','-'],['=','=']]);await page.selectOption('#edit-grade','+');await page.locator('#edit-form button[type="submit"]').click();equal(await state(),before);assert.equal(await page.locator('#modal').evaluate(dialog=>dialog.classList.contains('correction-preview-dialog')),true);await tap('confirm-correction');const corrected=await state();assert.equal(corrected.events[0].player,8);assert.equal(corrected.events[0].action,'Recepción');assert.equal(corrected.events[0].grade,'+');
 });
 await check('Correccion estructural de sustitucion conserva replay y deshacer',async()=>{
  const original=transition(initial(),{type:'sub',out:4,in:6,label:'Sustitución · Sale #4 → Entra #6'});await reset(original);const loadedOriginal=await state();await tap('history');await tap('edit-event:0');assert.deepEqual(await page.locator('#edit-form .form-select').evaluateAll(selects=>selects.map(select=>select.name)),['out','in']);await page.selectOption('[name="out"]','9');await page.selectOption('[name="in"]','6');await page.locator('#edit-form button[type="submit"]').click();await tap('confirm-correction');let corrected=await state();assert.equal(corrected.events[0].type,'sub');assert.equal(corrected.events[0].out,9);assert.equal(corrected.events[0].in,6);assert.deepEqual(corrected.lineup,[4,6,12,7,8,15]);await undo();equal(await state(),loadedOriginal);
 });
 await check('Recepcion contextual directa por toque y dorsal, con mapping estable',async()=>{
  await reset();await tap('player:12');assert.equal(await page.locator('.action-options').count(),0);assert.equal(await page.locator('.action-rating-context').innerText(),'Valorando: Recepción');assert.deepEqual(await page.locator('.grade-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),['grade:#','grade:+','grade:-','grade:=']);assert.match(await page.locator('#modal .dialog-head').innerText(),/12/);await tap('close');assert.equal(await page.locator('.action-rating-context').isVisible(),false);
  await reset();await press('1','2','Enter');assert.equal(await page.locator('.action-options').count(),0);assert.equal(await page.locator('.action-rating-context').innerText(),'Valorando: Recepción');assert.deepEqual(await page.locator('.grade-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),['grade:#','grade:+','grade:-','grade:=']);assert.match(await page.locator('#modal .dialog-head').innerText(),/12/);await tap('close');
  const serving=initial();serving.serving=true;serving.setStarts[0].serving=true;await reset(serving);await tap('player:12');assert.equal(await page.locator('.action-options').count(),0);assert.equal(await page.locator('.action-rating-context').innerText(),'Valorando: Saque');assert.deepEqual(await page.locator('.grade-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),['grade:#','grade:?','grade:=']);await tap('close');
  await reset();await tap('player:7');await tap('grade:+');const afterReception=await state();await tap('player:12');assert.equal(await page.locator('.action-rating-context').count(),0);assert.equal(await page.locator('[data-cmd="action:Recepción"]').isDisabled(),true);await press('2');equal(await state(),afterReception);assert.equal(await page.locator('.grade-options').count(),0);await press('3');assert.equal(await page.locator('.action-rating-context').innerText(),'Valorando: Ataque');assert.deepEqual(await page.locator('.grade-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),['grade:#','grade:?','grade:=','grade:Blo']);await tap('close');
 });
 await check('Recepcion contextual se deriva tras punto, igual, undo, reload y correccion',async()=>{
  await reset();await page.reload();await page.locator('.court').waitFor();await tap('player:7');assert.equal(await page.locator('.action-options').count(),0,'reload conserva recepción pendiente');await tap('close');
  await reset();await tap('player:7');await tap('grade:+');await page.reload();await page.locator('.court').waitFor();await tap('player:12');assert.equal(await page.locator('[data-cmd="action:Recepción"]').isDisabled(),true,'reload conserva recepción registrada');await tap('close');
  await reset();await tap('player:7');await tap('grade:+');await press('Control+z');await tap('player:12');assert.equal(await page.locator('.action-options').count(),0,'undo vuelve a dejar recepción pendiente');assert.deepEqual(await page.locator('.grade-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),['grade:#','grade:+','grade:-','grade:=']);await tap('close');
  await reset();await tap('player:7');await tap('grade:+');await tap('history');await tap('edit-event:0');await tap('delete-event:0');await tap('confirm-correction');assert.equal((await state()).events.length,0);await tap('player:12');assert.equal(await page.locator('.action-options').count(),0,'corrección recalcula recepción pendiente');await tap('close');
  await reset();await tap('player:7');await tap('grade:+');await tap('player:12');await tap('action:Ataque');await commit('grade:#');assert.equal((await state()).serving,true);await commit('theirs');assert.equal((await state()).serving,false);await tap('player:8');assert.equal(await page.locator('.action-options').count(),0,'nuevo rally vuelve a recepción directa');await tap('close');
  await reset();await tap('player:7');await tap('grade:=');let current=await state();assert.deepEqual(current.score,[0,1]);assert.equal(current.serving,false);await tap('player:12');assert.equal(await page.locator('.action-options').count(),0,'Recepción = abre una nueva jugada receptora');assert.deepEqual(await page.locator('.grade-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),['grade:#','grade:+','grade:-','grade:=']);await tap('close');
 });
 await check('Saque contextual se deriva por rally en touch, teclado, undo, reload y correccion',async()=>{
  const servingMatch=()=>{const match=initial();match.serving=true;match.setStarts[0].serving=true;return match;};
  const serveGrades=['grade:#','grade:?','grade:='];
  const receptionGrades=['grade:#','grade:+','grade:-','grade:='];
  const actionCommands=['action:Saque','action:Recepción','action:Ataque','action:Bloqueo'];

  await reset(servingMatch());await tap('player:7');assert.equal(await page.locator('.action-options').count(),0);assert.equal(await page.locator('.action-rating-context').innerText(),'Valorando: Saque');assert.deepEqual(await page.locator('.grade-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),serveGrades);assert.match(await page.locator('#modal .dialog-head').innerText(),/7/);await tap('close');
  await reset(servingMatch());await press('1','2','Enter');assert.equal(await page.locator('.action-options').count(),0);assert.equal(await page.locator('.action-rating-context').innerText(),'Valorando: Saque');assert.deepEqual(await page.locator('.grade-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),serveGrades);assert.match(await page.locator('#modal .dialog-head').innerText(),/12/);await press('2');let current=await state();assert.equal(current.events.at(-1).action,'Saque');assert.equal(current.events.at(-1).grade,'?');assert.equal(current.events.at(-1).player,12);
  const afterNeutralServe=structuredClone(current);await tap('player:7');assert.deepEqual(await page.locator('.action-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),actionCommands);assert.deepEqual(await page.locator('.action-options kbd').allTextContents(),['1','2','3','4']);assert.equal(await page.locator('[data-cmd="action:Saque"]').isDisabled(),true);assert.equal(await page.locator('[data-cmd="action:Recepción"]').isDisabled(),true);await press('1');equal(await state(),afterNeutralServe);assert.equal(await page.locator('.grade-options').count(),0);await press('2');equal(await state(),afterNeutralServe);assert.equal(await page.locator('.grade-options').count(),0);await press('3');assert.deepEqual(await page.locator('.grade-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),['grade:#','grade:?','grade:=','grade:Blo']);await tap('close');

  await reset(servingMatch());await tap('player:7');await tap('grade:#');current=await state();assert.deepEqual(current.score,[1,0]);assert.equal(current.serving,true);await tap('player:12');assert.equal(await page.locator('.action-options').count(),0);assert.deepEqual(await page.locator('.grade-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),serveGrades);await tap('close');
  await reset(servingMatch());await tap('player:7');await tap('grade:=');current=await state();assert.deepEqual(current.score,[0,1]);assert.equal(current.serving,false);await tap('player:12');assert.equal(await page.locator('.action-options').count(),0);assert.deepEqual(await page.locator('.grade-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),receptionGrades);await tap('close');

  await reset();await tap('player:7');await tap('grade:+');const afterReception=await state();await tap('player:12');assert.deepEqual(await page.locator('.action-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),actionCommands);assert.equal(await page.locator('[data-cmd="action:Saque"]').isDisabled(),true);assert.equal(await page.locator('[data-cmd="action:Recepción"]').isDisabled(),true);assert.deepEqual(await page.locator('.action-options kbd').allTextContents(),['1','2','3','4']);await press('1','2');equal(await state(),afterReception);assert.equal(await page.locator('.grade-options').count(),0);await press('3');assert.deepEqual(await page.locator('.grade-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),['grade:#','grade:?','grade:=','grade:Blo']);await tap('close');

  await reset(servingMatch());await tap('player:7');await tap('grade:?');await press('Control+z');assert.equal((await state()).events.length,0);await tap('player:12');assert.equal(await page.locator('.action-options').count(),0);assert.deepEqual(await page.locator('.grade-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),serveGrades);await tap('close');
  await reset(servingMatch());await page.reload();await page.locator('.court').waitFor();await tap('player:7');assert.equal(await page.locator('.action-options').count(),0);assert.deepEqual(await page.locator('.grade-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),serveGrades);await tap('close');
  await reset(servingMatch());await tap('player:7');await tap('grade:?');await page.reload();await page.locator('.court').waitFor();await tap('player:12');assert.equal(await page.locator('[data-cmd="action:Saque"]').isDisabled(),true);assert.equal(await page.locator('[data-cmd="action:Recepción"]').isDisabled(),true);await tap('close');

  await tap('history');await tap('edit-event:0');await tap('delete-event:0');await tap('confirm-correction');assert.equal((await state()).events.length,0);await tap('player:12');assert.equal(await page.locator('.action-options').count(),0);assert.deepEqual(await page.locator('.grade-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),serveGrades);await tap('close');
  await reset(servingMatch());await tap('player:7');await tap('grade:?');await tap('history');await tap('edit-event:0');await page.selectOption('#edit-grade','=');await page.locator('#edit-form button[type="submit"]').click();await tap('confirm-correction');current=await state();assert.equal(current.events[0].grade,'=');assert.equal(current.serving,false);assert.deepEqual(current.score,[0,1]);await tap('player:12');assert.equal(await page.locator('.action-options').count(),0);assert.deepEqual(await page.locator('.grade-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),receptionGrades);await tap('close');

  const withLibero=servingMatch();withLibero.activeLiberoId=1;withLibero.setStarts[0].activeLiberoId=1;await reset(withLibero);const beforeLibero=await state();await tap('player:1');equal(await state(),beforeLibero);assert.equal(await page.locator('#modal').evaluate(dialog=>dialog.open),false);assert.match(await page.locator('#toast').innerText(),/Recepción no disponible/);
 });
 await check('Libero activo por dorsal, libero inactivo excluido y L eliminado',async()=>{
  const withLiberos=initial();withLiberos.activeLiberoId=1;withLiberos.setStarts[0].activeLiberoId=1;withLiberos.roster.push({id:17,name:'Segundo libero',role:'Líbero'});await reset(withLiberos);const before=await state();assert.equal(await page.locator('.active-libero-control kbd').count(),0);await press('l');equal(await state(),before);assert.equal(await page.locator('#modal').evaluate(dialog=>dialog.open),false);
  await press('1','Enter');assert.equal(await page.locator('.action-options').count(),0);assert.equal(await page.locator('.action-rating-context').innerText(),'Valorando: Recepción');assert.equal(await page.locator('[data-cmd^="action:"]').count(),0);assert.deepEqual(await page.locator('.grade-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),['grade:#','grade:+','grade:-','grade:=']);assert.match(await page.locator('#modal .dialog-head').innerText(),/1/);await tap('grade:+');let current=await state();assert.equal(current.events.at(-1).player,1);assert.equal(current.events.at(-1).action,'Recepción');
  await reset(withLiberos);const inactiveBefore=await state();await press('1','7','Enter');equal(await state(),inactiveBefore);assert.equal(await page.locator('#modal').evaluate(dialog=>dialog.open),false);assert.match(await page.locator('#toast').innerText(),/El dorsal #17 no está en pista/);
  const serving=structuredClone(withLiberos);serving.serving=true;serving.setStarts[0].serving=true;await reset(serving);const servingBefore=await state();await press('1','Enter');equal(await state(),servingBefore);assert.equal(await page.locator('#modal').evaluate(dialog=>dialog.open),false);assert.match(await page.locator('#toast').innerText(),/Recepción no disponible/);
  await reset(withLiberos);await tap('player:7');await tap('grade:+');const received=await state();await press('1','Enter');equal(await state(),received);assert.equal(await page.locator('#modal').evaluate(dialog=>dialog.open),false);assert.match(await page.locator('#toast').innerText(),/Recepción no disponible/);
 });
 await check('Teclado contextual: dorsal, valoracion y deshacer',async()=>{
  const serving=initial();serving.serving=true;serving.setStarts[0].serving=true;await reset(serving);const before=await state();
  await press('1','2');assert.equal(await page.locator('.keyboard-jersey-status').innerText(),'Dorsal: 12');assert.equal(await page.locator('#modal').evaluate(dialog=>dialog.open),false);equal((await state()).events,before.events);
  await press('Backspace');assert.equal(await page.locator('.keyboard-jersey-status').innerText(),'Dorsal: 1');await press('2','Escape');assert.equal(await page.locator('.keyboard-jersey-status').innerText(),'');
  await press('1','2','Enter');assert.match(await page.locator('#modal .dialog-head').innerText(),/12/);assert.equal(await page.locator('.action-options').count(),0);assert.equal(await page.locator('.action-rating-context').innerText(),'Valorando: Saque');assert.deepEqual(await page.locator('.grade-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),['grade:#','grade:?','grade:=']);await press('2');let current=await state();assert.equal(current.events.at(-1).player,12);assert.equal(current.events.at(-1).action,'Saque');assert.equal(current.events.at(-1).grade,'?');assert.deepEqual(current.score,before.score);
  await page.reload();await page.locator('.court').waitFor();assert.equal((await state()).events.at(-1).grade,'?');
  await press('Control+z');equal(await state(),before);
 });
 await check('Atajo 0: punto rival en base, ayuda visual y deshacer',async()=>{
  await reset();let before=await state();const rivalPoint=page.locator('[data-cmd="theirs"]');assert.deepEqual(await rivalPoint.locator('kbd').allTextContents(),['0']);assert.equal(await rivalPoint.locator('kbd').isVisible(),true);assert.equal(await page.locator('[data-cmd="ours"] kbd').count(),0);
  await press('0');let current=await state();assert.deepEqual(current.score,[0,1]);assert.equal(current.events.at(-1).label,'Punto para el rival');assert.equal(current.events.at(-1).team,1);assert.equal(await page.locator('.keyboard-jersey-status').innerText(),'');await press('Control+z');equal(await state(),before);
  await reset();before=await state();await press('Numpad0');current=await state();assert.deepEqual(current.score,[0,1]);assert.equal(current.events.at(-1).label,'Punto para el rival');await press('Control+z');equal(await state(),before);
 });
 await check('Teclado contextual: dorsales ambiguos, invalidos y numpad',async()=>{
  const ambiguous=initial();ambiguous.roster=ambiguous.roster.map(player=>player.id===1?{...player,role:'Receptor'}:player);ambiguous.roster.push({id:10,name:'Diez',role:'Central'},{id:20,name:'Veinte',role:'Central'});ambiguous.activeLiberoId=null;ambiguous.lineup=[1,10,20,7,8,15];ambiguous.setStarts[0]={...ambiguous.setStarts[0],lineup:[...ambiguous.lineup],activeLiberoId:null};await reset(ambiguous);
  await press('1','Enter');assert.match(await page.locator('#modal .dialog-head').innerText(),/1/);await press('Escape');await press('1','0','Enter');assert.match(await page.locator('#modal .dialog-head').innerText(),/10/);await press('Escape');
  const before=await state();await press('2','0');assert.equal(await page.locator('.keyboard-jersey-status').innerText(),'Dorsal: 20');assert.deepEqual((await state()).score,before.score);equal((await state()).events,before.events);await press('Enter');assert.match(await page.locator('#modal .dialog-head').innerText(),/20/);await press('Escape');
  await press('3','Enter');assert.match(await page.locator('#toast').innerText(),/El dorsal #3 no está en pista/);equal(await state(),before);assert.equal(await page.locator('#modal').evaluate(dialog=>dialog.open),false);await press('9','9','Enter');assert.match(await page.locator('#toast').innerText(),/El dorsal #99 no está en pista/);equal(await state(),before);
  await press('Numpad1','Numpad0');assert.equal(await page.locator('.keyboard-jersey-status').innerText(),'Dorsal: 10');await press('Escape');
 });
 await check('Atajo 0: bloqueado en selectores de acciones, valoraciones y errores',async()=>{
  const serving=initial();serving.serving=true;serving.setStarts[0].serving=true;await reset(serving);const before=await state();await press('1','2','Enter','0');equal(await state(),before);assert.equal(await page.locator('.grade-options').count(),1);await press('Escape');
  await press('e','0');equal(await state(),before);assert.equal(await page.locator('.keyboard-error-options').count(),1);await press('Escape');
 });
 await check('Teclado contextual: errores y bloqueos de contexto',async()=>{
  await reset();const lBefore=await state();await press('l');equal(await state(),lBefore);assert.equal(await page.locator('#modal').evaluate(dialog=>dialog.open),false);let current;
  await reset();await press('e');assert.deepEqual(await page.locator('.keyboard-error-options [data-cmd]').evaluateAll(buttons=>buttons.map(button=>button.dataset.cmd)),['serve-error','attack-error','record-unforced:rotation','record-unforced:net','record-unforced:other']);assert.deepEqual(await page.locator('.keyboard-error-options button > span').allTextContents(),['Error saque rival','Error ataque rival','Falta de rotación','Toque de red','Otros']);assert.deepEqual(await page.locator('.keyboard-error-options kbd').allTextContents(),['1','2','3','4','5']);assert.deepEqual(await page.locator('.keyboard-error-options button').evaluateAll(buttons=>buttons.map(button=>button.tagName)),['BUTTON','BUTTON','BUTTON','BUTTON','BUTTON']);await press('1');current=await state();assert.equal(current.events.at(-1).label,'Error de saque rival');
  await reset();await press('e','5');current=await state();assert.equal(current.events.at(-1).category,'unforced-error');assert.equal(current.events.at(-1).reason,'other');
  await reset();await tap('keyboard-errors');await tap('record-unforced:net');assert.equal((await state()).events.at(-1).reason,'net');
  await reset();await tap('ours');const before=await state();await page.evaluate(()=>{for(const tag of ['input','textarea','select','div']){const element=document.createElement(tag);if(tag==='select')element.innerHTML='<option>uno</option><option>dos</option>';if(tag==='div')element.setAttribute('contenteditable','true');element.dataset.keyboardTest=tag;document.body.append(element);}});for(const selector of ['input[data-keyboard-test]','textarea[data-keyboard-test]','select[data-keyboard-test]','div[data-keyboard-test]']){await page.locator(selector).focus();await press('0','1','l','e','Control+z');equal(await state(),before);assert.equal(await page.locator('#modal').evaluate(dialog=>dialog.open),false);assert.equal(await page.locator('.keyboard-jersey-status').innerText(),'');}await page.locator('.court').click({position:{x:5,y:5}});
  await tap('sub');await press('0','1','2','l','e','Control+z');equal(await state(),before);assert.equal(await page.locator('#modal').evaluate(dialog=>dialog.open),true);assert.match(await page.locator('#modal .dialog-head').innerText(),/Sustitución/);await tap('close');
  const finished=initial();finished.status='finished';await reset(finished);const loadedFinished=await state();await press('0','1','2','Enter','l','e','+','-','n','r');equal(await state(),loadedFinished);assert.equal(await page.locator('.keyboard-jersey-status').innerText(),'');assert.equal(await page.locator('#modal').evaluate(dialog=>dialog.open),false);
  await reset();const pointBefore=await state();await press('+','-','n','r');equal(await state(),pointBefore);
 });
 await check('Modal de acciones y valoraciones responsive',async()=>{
  let serving=initial();serving.serving=true;serving.setStarts[0].serving=true;serving=transition(serving,{type:'action',player:7,action:'Saque',grade:'?',label:'Saque ?'});await reset(serving);await tap('player:12');
  for(const [width,height] of [[768,1024],[1024,768],[1280,800],[1366,768],[1920,1080],[1024,600],[1366,640]]){await page.setViewportSize({width,height});const layout=await page.evaluate(()=>{const dialog=document.querySelector('#modal'),box=dialog.getBoundingClientRect(),buttons=[...dialog.querySelectorAll('.action-options button')];return {dialog:{left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width},buttons:buttons.map(button=>{const rect=button.getBoundingClientRect(),style=getComputedStyle(button);return {height:rect.height,font:parseFloat(style.fontSize),inside:rect.left>=box.left-1&&rect.right<=box.right+1};}),horizontal:dialog.scrollWidth>dialog.clientWidth+1||document.documentElement.scrollWidth>innerWidth};});assert(layout.dialog.left>=0&&layout.dialog.right<=width+1&&layout.dialog.top>=0&&layout.dialog.bottom<=height+1);assert(layout.dialog.width<=782);assert.equal(layout.horizontal,false);for(const button of layout.buttons){assert(button.height>=59.5&&button.height<=73);assert(button.font>=15);assert.equal(button.inside,true);}}
  await tap('action:Ataque');
  assert.equal(await page.locator('.action-rating-context').innerText(),'Valorando: Ataque');
  for(const [width,height] of [[768,1024],[1024,768],[1280,800],[1366,768],[1920,1080],[1024,600],[1366,640]]){await page.setViewportSize({width,height});const layout=await page.evaluate(()=>{const dialog=document.querySelector('#modal'),box=dialog.getBoundingClientRect(),context=dialog.querySelector('.action-rating-context'),contextBox=context.getBoundingClientRect(),buttons=[...dialog.querySelectorAll('.grade-options button')];return {inside:box.left>=0&&box.right<=innerWidth+1&&box.top>=0&&box.bottom<=innerHeight+1,horizontal:dialog.scrollWidth>dialog.clientWidth+1,context:{font:parseFloat(getComputedStyle(context).fontSize),inside:contextBox.left>=box.left-1&&contextBox.right<=box.right+1&&contextBox.top>=box.top-1&&contextBox.bottom<=box.bottom+1},buttons:buttons.map(button=>{const rect=button.getBoundingClientRect(),style=getComputedStyle(button);return {height:rect.height,font:parseFloat(style.fontSize),inside:rect.left>=box.left-1&&rect.right<=box.right+1};})};});assert.equal(layout.inside,true);assert.equal(layout.horizontal,false);assert(layout.context.font>=15);assert.equal(layout.context.inside,true);for(const button of layout.buttons){assert(button.height>=71.5&&button.height<=93);assert(button.font>=13);assert.equal(button.inside,true);}}
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
 await check('Informe PDF solo al finalizar, descarga, historial y regeneración',async()=>{
  await reset();
  assert.equal(await page.locator('[data-cmd="generate-pdf"]').count(),0);

  const between=transition(transition(initial(),{type:'point',team:0,label:'Punto nuestro'}),{type:'finish',label:'Set 1 finalizado'});
  await reset(between);
  assert.equal(await page.locator('[data-cmd="generate-pdf"]').count(),0);

  let finished=initial();
  Object.assign(finished,{rosterId:'test-roster',rosterName:'Vóley Ciutadella',rival:'Peña Übeda',competition:'Liga sénior',date:'2026-10-11',time:'18:30',venue:'Local'});
  finished=transition(finished,{type:'action',player:7,action:'Ataque',grade:'#',label:'#7 · Ataque #'});
  finished=transition(finished,{type:'finish-match',label:'Partido finalizado'});
  await reset(finished,'Nombre actual distinto');
  assert.equal(await page.locator('.score-panel [data-cmd="generate-pdf"]').count(),1);
  for(const [width,height] of [[768,1024],[1024,768],[1280,800],[1366,768],[1920,1080]]){
   await page.setViewportSize({width,height});
   const layout=await page.locator('.score-panel [data-cmd="generate-pdf"]').evaluate(button=>{const box=button.getBoundingClientRect();return {visible:box.width>0&&box.height>=47.5,inside:box.left>=0&&box.right<=innerWidth+1&&box.top>=0&&box.bottom<=innerHeight+1,horizontalOverflow:document.documentElement.scrollWidth>innerWidth};});
   equal(layout,{visible:true,inside:true,horizontalOverflow:false});
  }

  const downloadPromise=page.waitForEvent('download');
  await tap('generate-pdf');
  const download=await downloadPromise;
  assert.match(download.suggestedFilename(),/^VolleyStats_.+_vs_.+_2026-10-11\.pdf$/);
  const downloadedPath=await download.path();
  const bytes=await readFile(downloadedPath);
  assert(bytes.length>1000);
  assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
  assert.match(bytes.toString('latin1'),/\/MediaBox\s*\[\s*0\s+0\s+841(?:\.\d+)?\s+595(?:\.\d+)?\s*\]/);
  assert.match(bytes.toString('latin1'),/\/Subtype\s*\/Image/);
  assert.equal(await page.evaluate(()=>typeof globalThis.jspdf?.jsPDF),'function');
  assert.equal(await page.evaluate(()=>typeof globalThis.autoTable),'function');
  assert(runtimeRequests.some(pathname=>pathname==='/vendor/jspdf.umd.min.js'));
  assert(runtimeRequests.some(pathname=>pathname==='/vendor/jspdf.plugin.autotable.min.js'));
  assert.equal(runtimeRequests.some(pathname=>pathname.startsWith('/node_modules/')),false);

  await page.route('**/src/assets/pdf-logo.png',route=>route.abort());
  const fallbackDownloadPromise=page.waitForEvent('download');
  await tap('generate-pdf');
  const fallbackDownload=await fallbackDownloadPromise;
  const fallbackBytes=await readFile(await fallbackDownload.path());
  assert.equal(fallbackBytes.subarray(0,5).toString(),'%PDF-');
  assert.match(fallbackBytes.toString('latin1'),/\/MediaBox\s*\[\s*0\s+0\s+841(?:\.\d+)?\s+595(?:\.\d+)?\s*\]/);
  await page.unroute('**/src/assets/pdf-logo.png');

  await tap('history');
  assert.equal(await page.locator('#modal [data-cmd="generate-pdf"]').count(),1);
  const beforeReport=await page.evaluate(async()=>{const {buildMatchReport}=await import('/src/report.js');const match=JSON.parse(localStorage.getItem('volleystats.match.v1'));return buildMatchReport(match,{teamName:'Vóley Ciutadella'}).periods[0].general.rows.find(player=>player.id===7).metrics;});
  await tap('edit-event:0');
  await page.selectOption('#edit-grade','Blo');
  await page.locator('#edit-form button[type="submit"]').click();
  await tap('confirm-correction');
  const afterReport=await page.evaluate(async()=>{const {buildMatchReport}=await import('/src/report.js');const match=JSON.parse(localStorage.getItem('volleystats.match.v1'));return buildMatchReport(match,{teamName:'Vóley Ciutadella'}).periods[0].general.rows.find(player=>player.id===7).metrics;});
  assert.equal(beforeReport.points,1);
  assert.equal(beforeReport.blocked,0);
  assert.equal(afterReport.points,0);
  assert.equal(afterReport.blocked,1);

  const archived=structuredClone(await state());
  archived.id='archived-finished-report';
  await page.evaluate(match=>localStorage.setItem('volleystats.archives.v1',JSON.stringify([match])),archived);
  await tap('history');
  assert.equal(await page.locator('nav [data-cmd="nav:match"].active').count(),1);
  assert.doesNotMatch(await page.locator('#modal').innerText(),/Partidos anteriores/);
  await tap('close');
  await tap('nav:matches');
  assert.equal(await page.locator('[data-cmd="generate-pdf-archive:archived-finished-report"]').count(),1);
 });
 await check('Partidos vacío muestra estado claro y permite volver',async()=>{
  await reset();
  await tap('nav:matches');
  assert.match(await page.locator('main').innerText(),/Aún no hay partidos finalizados/);
  assert.equal(await page.locator('.match-archive-card').count(),0);
  await tap('nav:match');
  await page.locator('.court').waitFor();
 });
 await check('Partidos lista finalizados ordenados, filtra incompletos y deduplica',async()=>{
  const old=finishedMatch({id:'archive-old',rival:'Rival antiguo',date:'2026-08-20',time:'18:00',sets:[[25,20],[25,22]]});
  const newest=finishedMatch({id:'archive-new',rival:'Rival reciente',date:'2026-10-02',time:'20:30',venue:'Visitante',sets:[[23,25],[20,25],[23,25]]});
  const middle=finishedMatch({id:'archive-middle',rival:'Rival medio',date:'2026-09-15',time:'19:00',sets:[[25,21],[20,25],[25,19]]});
  const duplicate={...old,rival:'Duplicado que no debe verse'};
  const incomplete={...initial(),id:'archive-playing',demo:false,rival:'Partido incompleto'};
  await page.goto(url);await page.evaluate(matches=>{localStorage.clear();localStorage.setItem('volleystats.archives.v1',JSON.stringify(matches));},[old,incomplete,duplicate,middle,newest]);await page.reload();
  await tap('nav:matches');
  const cards=page.locator('.match-archive-card');
  assert.equal(await cards.count(),3);
  equal(await cards.evaluateAll(items=>items.map(item=>item.dataset.matchId)),['archive-new','archive-middle','archive-old']);
  assert.match(await cards.nth(0).innerText(),/Rival reciente vs Plantilla histórica/);
  assert.match(await cards.nth(0).innerText(),/02\/10\/2026 · 20:30 · Visitante/);
  assert.match(await cards.nth(0).innerText(),/3\s*–\s*0/);
  assert.match(await cards.nth(0).innerText(),/25-23 · 25-20 · 25-23/);
  assert.doesNotMatch(await page.locator('main').innerText(),/Partido incompleto/);
  assert.equal(await page.locator('.match-archive-card[data-match-id="archive-old"]').count(),1);
 });
 await check('Partidos incluye inmediatamente el partido actual finalizado',async()=>{
  const current=finishedMatch({id:'current-finished-only',rival:'Final recién terminada',date:'2026-10-06',sets:[[25,17],[25,19],[25,21]]});
  await reset(current);
  const stale={...current,rival:'Copia archivada obsoleta'};
  await page.evaluate(match=>localStorage.setItem('volleystats.archives.v1',JSON.stringify([match])),stale);
  await tap('nav:matches');
  assert.equal(await page.locator('.match-archive-card[data-match-id="current-finished-only"]').count(),1);
  assert.match(await page.locator('.match-archive-card').innerText(),/Final recién terminada/);
  assert.doesNotMatch(await page.locator('.match-archive-card').innerText(),/Copia archivada obsoleta/);
  assert.match(await page.locator('.match-archive-card').innerText(),/3\s*–\s*0/);
 });
 await check('Partidos conserva intacto el partido actual en juego',async()=>{
  let current=transition(initial(),{type:'point',team:0,label:'Punto nuestro'});current.demo=false;current.id='current-playing';current.score=[17,14];current.rotation=4;current.serving=true;
  const archived=finishedMatch({id:'only-finished',rival:'Rival archivado',date:'2026-09-10'});
  await reset(current);
  await page.evaluate(match=>localStorage.setItem('volleystats.archives.v1',JSON.stringify([match])),archived);
  const before=await page.evaluate(()=>localStorage.getItem('volleystats.match.v1'));
  await tap('nav:matches');
  assert.equal(await page.locator('.match-archive-card[data-match-id="only-finished"]').count(),1);
  assert.equal(await page.locator('.match-archive-card[data-match-id="current-playing"]').count(),0);
  await tap('stats-archive:only-finished');await tap('close');await tap('nav:match');
  assert.equal(await page.evaluate(()=>localStorage.getItem('volleystats.match.v1')),before);
  equal(await state(),JSON.parse(before));
 });
 await check('Estadísticas archivadas mantienen su fuente al cambiar pestaña y set',async()=>{
  let current=initial();current.demo=false;current.id='different-current';current.roster.find(player=>player.id===7).name='ACTUAL Álex';
  const archived=finishedMatch({id:'stats-archive',rival:'Rival estadísticas',date:'2026-09-12',playerName:'ARCHIVADO Álex',action:{action:'Ataque',grade:'#',label:'Ataque #'}});
  await reset(current);
  await page.evaluate(match=>localStorage.setItem('volleystats.archives.v1',JSON.stringify([match])),archived);
  const before=await page.evaluate(()=>localStorage.getItem('volleystats.match.v1'));
  await tap('nav:matches');await tap('stats-archive:stats-archive');
  assert.match(await page.locator('#stat-body').innerText(),/ARCHIVADO Álex/);assert.doesNotMatch(await page.locator('#stat-body').innerText(),/ACTUAL Álex/);
  for(const tab of ['K1/K2','Rotaciones','Errores']){await tap('stat-tab:'+tab);assert.equal(await page.locator('.stats-tabs .primary').innerText(),tab);}
  await tap('stat-tab:General');await tap('period-toggle');await tap('period-set:1');
  assert.match(await page.locator('#stat-body').innerText(),/ARCHIVADO Álex/);assert.doesNotMatch(await page.locator('#stat-body').innerText(),/ACTUAL Álex/);
  await tap('period-toggle');await tap('period-set:all');await tap('stat-tab:General');
  assert.match(await page.locator('#stat-body').innerText(),/ARCHIVADO Álex/);
  await tap('close');assert.equal(await page.evaluate(()=>localStorage.getItem('volleystats.match.v1')),before);
 });
 await check('PDF de Partidos descarga un archivo real sin cambiar el actual',async()=>{
  let current=initial();current.demo=false;current.id='current-before-archive-pdf';
  const archived=finishedMatch({id:'archive-pdf',rival:'Rival PDF',date:'2026-09-18',sets:[[25,20],[25,22],[25,18]]});
  await reset(current);await page.evaluate(match=>localStorage.setItem('volleystats.archives.v1',JSON.stringify([match])),archived);
  const before=await page.evaluate(()=>localStorage.getItem('volleystats.match.v1'));
  await tap('nav:matches');const downloadPromise=page.waitForEvent('download');await tap('generate-pdf-archive:archive-pdf');const download=await downloadPromise;const bytes=await readFile(await download.path());
  assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert(bytes.length>1000);assert.equal(await page.evaluate(()=>localStorage.getItem('volleystats.match.v1')),before);
 });
 await check('Partidos es accesible desde bienvenida sin plantilla ni partido actual',async()=>{
  const archived=finishedMatch({id:'welcome-archive',rival:'Rival desde bienvenida',date:'2026-09-22'});
  await page.goto(url);await page.evaluate(match=>{localStorage.clear();localStorage.setItem('volleystats.archives.v1',JSON.stringify([match]));},archived);await page.reload();
  assert.match(await page.locator('main').innerText(),/Bienvenido a VolleyStats/);
  assert.equal(await page.locator('[data-cmd="nav:matches"]').count(),1);
  await tap('nav:matches');assert.equal(await page.locator('.match-archive-card[data-match-id="welcome-archive"]').count(),1);
  await tap('stats-archive:welcome-archive');assert.match(await page.locator('#stat-body').innerText(),/Álex/);await tap('close');await tap('nav:welcome');
  assert.match(await page.locator('main').innerText(),/Bienvenido a VolleyStats/);assert.equal(await state(),null);
 });
 await check('Partidos con diez tarjetas es responsive y mantiene controles accesibles',async()=>{
  const matches=Array.from({length:10},(_,index)=>finishedMatch({id:'responsive-'+index,rival:'Asociación Deportiva Rival con un nombre especialmente largo '+index,date:`2026-09-${String(index+1).padStart(2,'0')}`,time:`${String(10+index).padStart(2,'0')}:15`,venue:index%2?'Visitante':'Local',rosterName:'Club Deportivo Voleibol Ciudad Universitaria',sets:[[25,20],[23,25],[25,22]]}));
  await page.goto(url);await page.evaluate(items=>{localStorage.clear();localStorage.setItem('volleystats.archives.v1',JSON.stringify(items));},matches);await page.reload();await tap('nav:matches');
  for(const [width,height] of [[768,1024],[1024,768],[1024,600],[1280,800],[1366,768],[1920,1080]]){
   await page.setViewportSize({width,height});
   const layout=await page.evaluate(({width})=>{const grid=document.querySelector('.matches-grid'),cards=[...document.querySelectorAll('.match-archive-card')],buttons=[...document.querySelectorAll('.match-archive-actions button')];return {horizontal:document.documentElement.scrollWidth>width+1||grid.scrollWidth>grid.clientWidth+1,scrollable:grid.scrollHeight>grid.clientHeight,cards:cards.map(card=>{const box=card.getBoundingClientRect();return {width:box.width,inside:box.left>=-1&&box.right<=width+1};}),buttons:buttons.map(button=>button.getBoundingClientRect().height)};},{width});
   assert.equal(layout.horizontal,false,`${width} sin overflow horizontal`);assert.equal(layout.cards.length,10);for(const card of layout.cards){assert(card.width>0);assert.equal(card.inside,true);}for(const height of layout.buttons)assert(height>=47.5);if(height<=800)assert.equal(layout.scrollable,true);
  }
  await page.locator('.matches-grid').evaluate(grid=>grid.scrollTo(0,grid.scrollHeight));assert.equal(await page.locator('.match-archive-card').last().isVisible(),true);
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
  await reset();
  equal(await page.locator('nav button').allTextContents(),['Partido','Archivo','Plantilla']);
  assert.equal(await page.locator('nav button').filter({hasText:'Historial'}).count(),0);
  await tap('history');assert.equal(await page.locator('nav [data-cmd="nav:match"].active').count(),1);assert.match(await page.locator('#modal .dialog-head').innerText(),/Corrección \/ Historial/);await tap('close');
  await tap('nav:matches');assert.equal(await page.locator('nav [data-cmd="nav:matches"].active').innerText(),'Archivo');assert.match(await page.locator('main h1').innerText(),/Archivo de partidos/);await tap('nav:match');
  await tap('stats');equal(await page.locator('.stats-tabs .primary').innerText(),'General');equal(await page.locator('.stats-tabs button').allTextContents(),['General','K1/K2','Rotaciones','Errores']);await tap('stat-tab:K1/K2');equal(await page.locator('.phase-card').count(),2);assert.match(await page.locator('.phase-card').nth(0).innerText(),/Recepción/);assert.match(await page.locator('.phase-card').nth(1).innerText(),/Saque/);assert.equal(await page.locator('.phase-dashboard table').count(),0);assert.match(await page.locator('.phase-summary').innerText(),/Total de fases/);for(const tab of ['General','Rotaciones','Errores'])await tap('stat-tab:'+tab);assert.doesNotMatch(await page.locator('#stat-body').innerText(),/Sustituciones/);await tap('close');await tap('nav:roster');equal(await page.locator('.roster-grid article').count(),10);
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

   await tap('nav:match');await tap('history');assert.match(await page.locator('#modal').innerText(),/Todavía no hay operaciones/);await tap('close');await tap('ours');equal((await state()).score,[1,0]);await undo();
 });
 await check('Eliminar jugador confirma, persiste y conserva partidos actuales e historicos',async()=>{
  const sample=transition(initial(),{type:'action',player:7,action:'Ataque',grade:'#',label:'#7 · Ataque #'});sample.demo=false;sample.id='current-delete-player';await reset(sample);
  const archived=structuredClone(await state());archived.id='archived-delete-player';const archiveBefore=JSON.stringify([archived]);await page.evaluate(value=>localStorage.setItem('volleystats.archives.v1',value),archiveBefore);const matchBefore=await page.evaluate(()=>localStorage.getItem('volleystats.match.v1'));
  await tap('nav:roster');const playerRow=id=>page.locator(`.roster-grid article[data-player-id="${id}"]`);assert.equal(await playerRow(7).count(),1);assert.equal(await playerRow(7).locator('[data-cmd="delete-roster-player:7"]').innerText(),'Eliminar');
  for(const [width,height] of [[768,1024],[1024,768],[1280,800],[1366,768],[1920,1080]]){await page.setViewportSize({width,height});const layout=await page.evaluate(()=>{const grid=document.querySelector('.roster-grid:not(.saved-rosters-grid)'),cards=[...grid.querySelectorAll('article[data-player-id]')];return {horizontal:grid.scrollWidth>grid.clientWidth+1||document.documentElement.scrollWidth>innerWidth+1,cards:cards.map(card=>{const box=card.getBoundingClientRect(),copy=card.querySelector('.roster-player-copy').getBoundingClientRect(),actions=card.querySelector('.roster-player-actions').getBoundingClientRect(),buttons=[...card.querySelectorAll('.roster-player-actions button')].map(button=>button.getBoundingClientRect());return {actionsInside:actions.left>=box.left-1&&actions.right<=box.right+1,copyClear:copy.right<=actions.left+1,buttons:buttons.map(button=>({height:button.height,inside:button.left>=box.left-1&&button.right<=box.right+1}))};})};});assert.equal(layout.horizontal,false,`${width}x${height} sin overflow`);for(const card of layout.cards){assert.equal(card.actionsInside,true);assert.equal(card.copyClear,true);for(const button of card.buttons){assert(button.height>=43.5);assert.equal(button.inside,true);}}}
  await page.setViewportSize({width:1024,height:600});await tap('delete-roster-player:7');assert.match(await page.locator('#modal').innerText(),/Eliminar jugador/);assert.match(await page.locator('#modal').innerText(),/#7 Álex/);assert.match(await page.locator('#modal').innerText(),/partidos anteriores no se modificarán/);assert.equal(await page.locator('[data-cmd="confirm-delete-roster-player:7"].danger').count(),1);await tap('close');assert.equal(await playerRow(7).count(),1);assert(await page.evaluate(()=>JSON.parse(localStorage.getItem('volleystats.rosters.v1'))[0].players.some(player=>player.id===7)));
  await tap('delete-roster-player:7');await press('Escape');assert.equal(await page.locator('#modal').evaluate(dialog=>dialog.open),false);assert.equal(await playerRow(7).count(),1);assert(await page.evaluate(()=>JSON.parse(localStorage.getItem('volleystats.rosters.v1'))[0].players.some(player=>player.id===7)));
  await tap('delete-roster-player:7');await tap('confirm-delete-roster-player:7');assert.equal(await playerRow(7).count(),0);assert.match(await page.locator('#toast').innerText(),/#7 Álex eliminado/);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('volleystats.rosters.v1'))[0].players.some(player=>player.id===7)),false);assert.equal(await page.evaluate(()=>localStorage.getItem('volleystats.match.v1')),matchBefore);assert.equal(await page.evaluate(()=>localStorage.getItem('volleystats.archives.v1')),archiveBefore);
  const preserved=await page.evaluate(async()=>{const {statistics}=await import('/src/statistics.js');const current=JSON.parse(localStorage.getItem('volleystats.match.v1')),archive=JSON.parse(localStorage.getItem('volleystats.archives.v1'))[0];const summarize=match=>{const raw=match.roster.find(player=>player.id===7),row=statistics(match).players.find(player=>player.id===7);return {raw:{id:raw.id,name:raw.name},stats:{id:row.id,name:row.name,attack:row.attack,kills:row.kills,points:row.points}}};return {current:summarize(current),archive:summarize(archive)};});assert.deepEqual(preserved.current,{raw:{id:7,name:'Álex'},stats:{id:7,name:'Álex',attack:1,kills:1,points:1}});assert.deepEqual(preserved.archive,preserved.current);
  await page.reload();await page.locator('.court').waitFor();await tap('nav:roster');assert.equal(await playerRow(7).count(),0);assert.equal(await playerRow(1).count(),1);await tap('delete-roster-player:1');await tap('confirm-delete-roster-player:1');assert.equal(await playerRow(1).count(),0);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('volleystats.rosters.v1'))[0].players.some(player=>player.id===1)),false);assert.equal((await state()).roster.some(player=>player.id===1),true);
  await page.reload();await page.locator('.court').waitFor();await tap('nav:roster');assert.equal(await playerRow(7).count(),0);assert.equal(await playerRow(1).count(),0);
 });
 await check('Eliminar jugador limpia titulares y libero de un setup sin crear',async()=>{
  const players=initial().roster;await page.goto(url);await page.evaluate(players=>{localStorage.clear();localStorage.setItem('volleystats.rosters.v1',JSON.stringify([{id:'setup-delete-roster',name:'Setup borrado',players}]));},players);await page.reload();await tap('select-roster:setup-delete-roster');await tap('continue-welcome');await page.locator('[name="rival"]').fill('Rival setup');await page.locator('[name="date"]').evaluate(input=>{input.value='2026-09-29'});await page.locator('[name="time"]').evaluate(input=>{input.value='18:00'});await page.locator('[name="venue"]').evaluate(input=>{input.value='home'});await page.locator('#match-basics-form button[type="submit"]').click();await tap('prepare-set-1');for(const [zone,id] of [[1,4],[2,9],[3,12],[4,7],[5,8],[6,15]]){await tap(`set-zone:${zone}`);await tap(`choose-lineup-player:${zone},${id}`);}await tap('continue-lineup');await tap('set-libero:1');await tap('continue-libero');await tap('back-to-lineup');await tap('back-to-match-summary');await tap('edit-match-basics');await tap('manage-roster');
  await tap('delete-roster-player:4');await tap('confirm-delete-roster-player:4');await tap('delete-roster-player:1');await tap('confirm-delete-roster-player:1');assert.equal(await page.locator('.roster-grid article[data-player-id="4"],.roster-grid article[data-player-id="1"]').count(),0);await tap('confirm-roster');await page.locator('#match-basics-form button[type="submit"]').click();await tap('prepare-set-1');assert.match(await page.locator('.lineup-progress').innerText(),/5\s*\/\s*6/);assert.equal(await page.locator('.setup-lineup-player[data-setup-zone="1"].empty').count(),1);await tap('set-zone:1');await tap('choose-lineup-player:1,6');await tap('continue-lineup');assert.equal(await page.locator('[data-cmd="set-libero:1"]').count(),0);assert.equal(await page.locator('[data-cmd="set-libero:none"].selected').count(),1);assert.equal(await state(),null);
 });
 await check('G-P y recepción siguen el criterio de puntos terminales',async()=>{
  const playerCells=()=>page.locator('.player-stats tbody tr').filter({hasText:'#7 '}).first().locator('td').allTextContents();
  let sample=[{type:'action',player:7,action:'Ataque',grade:'?',label:'Ataque ?'},{type:'action',player:7,action:'Ataque',grade:'=',label:'Ataque ='}].reduce(transition,initial());await reset(sample);await tap('stats');let cells=await playerCells();assert.equal(cells[0],'·');assert.equal(cells[2],'1');assert.equal(cells[3],'-1');assert.equal(cells[11],'2');assert.equal(cells[12],'1');assert.equal(cells[13],'·');assert.match(await page.locator('#stat-body > .muted').innerText(),/Err: errores de saque, recepción y ataque; no incluye ataques bloqueados ni errores de bloqueo/);assert.match(await page.locator('#stat-body > .muted').innerText(),/G-P: puntos ganados menos pérdidas atribuibles; Bloqueo Err no penaliza/);await tap('close');
  sample=[{type:'action',player:7,action:'Saque',grade:'#',label:'Saque #'},{type:'action',player:7,action:'Ataque',grade:'#',label:'Ataque #'}].reduce(transition,initial());await reset(sample);await tap('stats');cells=await playerCells();assert.equal(cells[0],'2');assert.equal(cells[3],'2');assert.equal(cells[6],'1');assert.equal(cells[14],'1');await tap('close');
  sample=['#','+','-','='].map(grade=>({type:'action',player:7,action:'Recepción',grade,label:`Recepción ${grade}`})).reduce(transition,initial());await reset(sample);await tap('stats');cells=await playerCells();assert.equal(cells[3],'-1');assert.equal(cells[7],'4');assert.equal(cells[8],'1');assert.equal(cells[9],'50 %');assert.equal(cells[10],'25 %');await tap('close');
 });
 await check('Puntos Err excluye ataques bloqueados y errores de bloqueo en Estadísticas General',async()=>{
  const sample=[
   {type:'action',player:9,action:'Saque',grade:'=',label:'Saque =' },
   {type:'action',player:9,action:'Recepción',grade:'=',label:'Recepción =' },
   {type:'action',player:9,action:'Ataque',grade:'=',label:'Ataque =' },
   {type:'action',player:9,action:'Ataque',grade:'Blo',label:'Ataque Blo' },
   {type:'action',player:9,action:'Bloqueo',grade:'=',label:'Bloqueo =' },
  ].reduce(transition,initial());
  const metric=async(group,column,rowLabel='#9 ' )=>page.locator('.player-stats').evaluate((container,{group,column,rowLabel})=>{
   const groups=[...container.querySelectorAll('thead tr:first-child th')].slice(1),headers=[...container.querySelectorAll('thead tr:nth-child(2) th')];
   let offset=0;
   for(const heading of groups){const size=heading.colSpan;if(heading.textContent.trim()===group){const index=headers.slice(offset,offset+size).findIndex(item=>item.textContent.trim()===column);if(index<0)throw Error(`No existe ${group} ${column}`);const row=[...container.querySelectorAll('tbody tr, tfoot tr')].find(item=>item.querySelector('th')?.textContent.trim().startsWith(rowLabel));if(!row)throw Error(`No existe ${rowLabel}`);return row.querySelectorAll('td')[offset+index].textContent.trim();}offset+=size;}
   throw Error(`No existe ${group}`);
  },{group,column,rowLabel});
  await reset(sample);await tap('stats');await tap('stat-tab:General');
  assert.deepEqual(await page.locator('.player-stats thead tr:nth-child(2) th').evaluateAll(headers=>headers.slice(0,4).map(header=>header.textContent.trim())),['Tot','BP','Err','G-P']);
  assert.equal(await metric('Puntos','Tot'),'·');assert.equal(await metric('Puntos','Err'),'3');assert.equal(await metric('Puntos','G-P'),'-4');assert.equal(await metric('Saque','Err'),'1');assert.equal(await metric('Recepción','Err'),'1');assert.equal(await metric('Ataque','Err'),'1');assert.equal(await metric('Ataque','Blq'),'1');assert.equal(await metric('Bloqueo','Err'),'1');assert.equal(await metric('Bloqueo','Puntos'),'·');assert.equal(await metric('Puntos','Err','Total'),'3');
  assert.deepEqual(await page.locator('.player-stats thead tr:nth-child(2) th').allTextContents().then(values=>values.slice(-2)),['Err','Puntos']);
  for(const [width,height] of [[768,1024],[1024,768],[1280,800],[1366,768],[1920,1080]]){await page.setViewportSize({width,height});const layout=await page.evaluate(()=>{const dialog=document.querySelector('#modal'),box=dialog.getBoundingClientRect(),container=document.querySelector('.player-stats'),table=container.querySelector('table'),containerBox=container.getBoundingClientRect(),font=parseFloat(getComputedStyle(table).fontSize);return {dialogInside:box.left>=0&&box.right<=innerWidth+1&&box.top>=0&&box.bottom<=innerHeight+1,containerInside:containerBox.left>=box.left-1&&containerBox.right<=box.right+1,horizontalPage:document.documentElement.scrollWidth>innerWidth+1,horizontalDialog:dialog.scrollWidth>dialog.clientWidth+1,font};});assert.equal(layout.dialogInside,true,`${width}x${height} modal visible`);assert.equal(layout.containerInside,true,`${width}x${height} tabla dentro del modal`);assert.equal(layout.horizontalPage,false,`${width}x${height} sin overflow de página`);assert.equal(layout.horizontalDialog,false,`${width}x${height} sin overflow del modal`);assert(layout.font>=10,`${width}x${height} texto legible`);}
  await page.setViewportSize({width:1024,height:600});await tap('close');
 });
 await check('Estadisticas reales, filtro, correccion, persistencia y restauracion',async()=>{
  await reset();await tap('player:7');await commit('grade:+');await tap('player:7');await tap('action:Ataque');await commit('grade:#');await commit('theirs');
  assert.equal(await page.locator('[data-cmd="stats"]').count(),1,'el estado inicial de estadísticas abre el partido');await tap('stats');await tap('stat-tab:General');assert.equal(await page.locator('.player-stats thead tr:first-child th').allTextContents().then(v=>v.join('|')),'Jugador|Puntos|Saque|Recepción|Ataque|Bloqueo');const fit=await page.evaluate(()=>{const d=document.querySelector('dialog'),t=document.querySelector('.player-stats');return {dialog:d.scrollHeight<=d.clientHeight+1,table:t.scrollWidth<=t.clientWidth+1}});assert.deepEqual(fit,{dialog:true,table:true});if(process.argv[3])await page.screenshot({path:process.argv[3]});assert.match(await page.locator('#stat-body').innerText(),/100 %/);equal(await page.locator('.player-stats tfoot tr td').first().innerText(),'1');await tap('period-toggle');await tap('period-set:1');assert.match(await page.locator('#stat-body').innerText(),/100 %/);await tap('close');
  const before=await state();await tap('history');await tap('edit-event:1');await page.selectOption('#edit-grade','Blo');await page.locator('#edit-form button[type="submit"]').click();equal(await state(),before);await tap('confirm-correction');equal((await state()).score,[0,2]);await page.reload();equal((await state()).score,[0,2]);
  assert.equal(await page.locator('[data-cmd="stats"]').count(),1,'el estado corregido recarga el partido');await tap('stats');await tap('stat-tab:General');assert.match(await page.locator('#stat-body tbody tr').first().innerText(),/0 %/);await tap('close');await undo();equal(await state(),before);
  await tap('history');await tap('edit-event:2');await tap('delete-event:2');await tap('close');equal(await state(),before);
  await tap('history');await tap('edit-event:2');await tap('delete-event:2');await tap('confirm-correction');equal((await state()).score,[1,0]);await tap('history');await tap('undo-correction');equal(await state(),before);
 });
 await check('Rotaciones por fase muestran R1-K1 a R6-K2 sin overflow',async()=>{
  const sample=[
   {type:'point',team:0,label:'Punto'},
   {type:'point',team:1,label:'Punto'},
   {type:'point',team:0,label:'Punto'},
   {type:'action',player:7,action:'Ataque',grade:'?',label:'Ataque ?'},
   {type:'point',team:0,label:'Punto'},
  ].reduce(transition,initial());
  await reset(sample);await tap('stats');await tap('stat-tab:Rotaciones');
  const section=page.locator('.rotation-phase-section');
  assert.match(await section.locator('h3').innerText(),/Rotaciones por fase/);
  assert.deepEqual(await section.locator('thead th').allTextContents(),['Rotación','Fase','Puntos disputados','A favor','En contra','Balance','% ganados']);
  assert.equal(await section.locator('tbody tr').count(),12);
  const values=await section.locator('tbody tr').evaluateAll(rows=>Object.fromEntries(rows.map(row=>[`${row.dataset.rotation}-${row.dataset.phase}`,[...row.cells].map(cell=>cell.textContent.trim())])));
  assert.deepEqual(values['R1-K1'],['R1','K1','1','1','0','1','100 %']);
  assert.deepEqual(values['R6-K2'],['R6','K2','1','0','1','-1','0 %']);
  assert.deepEqual(values['R5-K2'],['R5','K2','1','1','0','1','100 %']);
  assert.deepEqual(values['R6-K1'],['R6','K1','1','1','0','1','100 %']);
  assert.deepEqual(values['R2-K2'],['R2','K2','0','0','0','0','—']);
  for(const [width,height] of [[768,1024],[1024,768],[1280,800],[1366,768],[1920,1080]]){
   await page.setViewportSize({width,height});
   const layout=await section.evaluate(element=>{const dialog=element.closest('dialog'),wrapper=element.querySelector('.rotation-phase-table'),table=wrapper.querySelector('table'),box=dialog.getBoundingClientRect();return {dialogInside:box.left>=0&&box.right<=innerWidth+1&&box.top>=0&&box.bottom<=innerHeight+1,pageOverflow:document.documentElement.scrollWidth>innerWidth+1,dialogOverflow:dialog.scrollWidth>dialog.clientWidth+1,tableOverflow:table.scrollWidth>wrapper.clientWidth+1,font:parseFloat(getComputedStyle(table).fontSize)};});
   assert.equal(layout.dialogInside,true,`${width}x${height} modal visible`);assert.equal(layout.pageOverflow,false,`${width}x${height} página sin overflow`);assert.equal(layout.dialogOverflow,false,`${width}x${height} diálogo sin overflow`);assert.equal(layout.tableOverflow,false,`${width}x${height} tabla sin overflow`);assert(layout.font>=12,`${width}x${height} texto legible`);
  }
  await tap('close');
 });
 await check('Rotación visible sigue la zona del colocador tras side-out',async()=>{
  const match=initial();match.demo=false;match.id='browser-setter-zone-two';match.lineup=[9,4,12,7,8,15];match.rotation=2;match.serving=false;
  await reset(match);assert.equal(await page.locator('.phase b').innerText(),'R2');
  await tap('ours');assert.equal(await page.locator('.phase b').innerText(),'R1');equal((await state()).lineup,[4,12,7,8,15,9]);
  await tap('ours');assert.equal(await page.locator('.phase b').innerText(),'R1');
  await tap('theirs');assert.equal(await page.locator('.phase b').innerText(),'R1');
 });
 await check('Doble cambio actualiza R en ambos órdenes y undo conserva snapshots',async()=>{
  const base=initial();base.demo=false;base.id='browser-double-change';base.lineup=[9,12,7,4,8,15];base.rotation=4;base.serving=false;
  await reset(base);await tap('sub');await tap('sub-out:4');await tap('sub-in:11');await tap('review-change');await commit('confirm-sub:4,11');assert.equal(await page.locator('.phase b').innerText(),'R4');
  await tap('sub');await tap('sub-out:9');await tap('sub-in:6');await tap('review-change');await commit('confirm-sub:9,6');assert.equal(await page.locator('.phase b').innerText(),'R1');
  equal((await state()).lineup,[6,12,7,11,8,15]);await commit('ours');assert.equal(await page.locator('.phase b').innerText(),'R6');
  await undo();assert.equal(await page.locator('.phase b').innerText(),'R1');await undo();assert.equal(await page.locator('.phase b').innerText(),'R4');
  const inverse=structuredClone(base);await reset(inverse);await tap('sub');await tap('sub-out:9');await tap('sub-in:6');await tap('review-change');await commit('confirm-sub:9,6');assert.equal(await page.locator('.phase b').innerText(),'R4');await tap('sub');await tap('sub-out:4');await tap('sub-in:11');await tap('review-change');await commit('confirm-sub:4,11');assert.equal(await page.locator('.phase b').innerText(),'R1');
 });
 await check('Partido legacy reconcilia R en UI sin reescribir al cargar',async()=>{
  const legacy=initial();legacy.demo=false;legacy.id='legacy-playing-rotation';legacy.rosterId='legacy-roster';legacy.lineup=[7,8,15,9,12,4];legacy.rotation=2;legacy.serving=false;
  await page.goto(url);await page.evaluate(match=>{localStorage.clear();localStorage.setItem('volleystats.match.v1',JSON.stringify(match));localStorage.setItem('volleystats.rosters.v1',JSON.stringify([{id:'legacy-roster',name:'Legacy',players:match.roster}]));},legacy);await page.reload();await page.locator('.court').waitFor();
  assert.equal(await page.locator('.phase b').innerText(),'R6');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('volleystats.match.v1')).rotation),2);
  await tap('ours');assert.equal(await page.locator('.phase b').innerText(),'R5');assert.equal((await state()).events.at(-1).rotation,6);
 });
 await check('Historial legacy muestra la R del snapshot sin reescribir el evento',async()=>{
  let legacy=initial();legacy.demo=false;legacy.id='legacy-history-rotation';legacy.rosterId='legacy-roster';legacy.lineup=[7,8,15,9,12,4];legacy.rotation=2;legacy=transition(legacy,{type:'action',player:7,action:'Ataque',grade:'?',label:'Ataque ?'});legacy.events[0].rotation=2;
  await page.goto(url);await page.evaluate(match=>{localStorage.clear();localStorage.setItem('volleystats.match.v1',JSON.stringify(match));localStorage.setItem('volleystats.rosters.v1',JSON.stringify([{id:'legacy-roster',name:'Legacy',players:match.roster}]));},legacy);await page.reload();await page.locator('.court').waitFor();
  await tap('history');assert.match(await page.locator('.history-entry small').innerText(),/R6/);assert.equal((await state()).events[0].rotation,2);await tap('close');
 });
 await check('Correccion y replay conservan R del nuevo colocador',async()=>{
  let match=initial();match.demo=false;match.id='replay-setter-rotation';match.lineup=[9,12,7,4,8,15];match.rotation=4;match.serving=false;
  match=transition(match,{type:'action',player:7,action:'Ataque',grade:'?',label:'Ataque ?'});
  match=transition(match,{type:'sub',out:4,in:11,label:'Sustitución'});
  match=transition(match,{type:'sub',out:9,in:6,label:'Sustitución'});
  match=transition(match,{type:'point',team:0,label:'Punto nuestro'});
  await reset(match);await tap('history');await tap('edit-event:0');await page.selectOption('[name="player"]','8');await page.locator('#edit-form button[type="submit"]').click();await tap('confirm-correction');
  const replayed=await state();assert.equal(replayed.rotation,6);assert.deepEqual(replayed.events.map(event=>event.rotation),[4,4,4,1]);assert.equal(replayed.lineup[5],6);
 });
 await check('Preparar Set 1 con colocador en zona 2 muestra R2 y side-out R1',async()=>{
  const players=initial().roster;
  await page.goto(url);await page.evaluate(roster=>{localStorage.clear();localStorage.setItem('volleystats.rosters.v1',JSON.stringify([{id:'rotation-setup-roster',name:'Equipo rotación',players:roster}]));},players);await page.reload();
  await tap('select-roster:rotation-setup-roster');await tap('continue-welcome');
  await page.locator('[name="rival"]').fill('Rival rotación');
  await page.locator('[name="date"]').evaluate(input=>{input.value='2026-10-07'});
  await page.locator('[name="time"]').evaluate(input=>{input.value='18:00'});
  await page.locator('[name="venue"]').evaluate(input=>{input.value='home'});
  await page.locator('#match-basics-form button[type="submit"]').click();await tap('prepare-set-1');
  for(const [zone,id] of [[1,9],[2,4],[3,12],[4,7],[5,8],[6,15]]){await tap(`set-zone:${zone}`);await tap(`choose-lineup-player:${zone},${id}`);}
  await tap('continue-lineup');await tap('set-libero:none');await tap('continue-libero');await tap('set-serving:theirs');await tap('start-match');
  assert.equal(await page.locator('.phase b').innerText(),'R2');assert.equal(await page.locator('.player[data-zone="2"] .jersey').innerText(),'4');
  await tap('ours');assert.equal(await page.locator('.phase b').innerText(),'R1');assert.equal(await page.locator('.player[data-zone="1"] .jersey').innerText(),'4');
 });
 await check('Estadísticas de partido legacy usan la R real del snapshot',async()=>{
  let legacy=initial();legacy.demo=false;legacy.id='legacy-archive-rotation';legacy.rival='Rival legacy';legacy.date='2026-09-01';legacy.lineup=[7,8,15,9,12,4];legacy.rotation=2;legacy=transition(legacy,{type:'point',team:0,label:'Punto legacy'});legacy=transition(legacy,{type:'finish-match',label:'Partido finalizado'});legacy.events[0].rotation=2;legacy.undo[0].lineup=[7,8,15,9,12,4];
  await page.goto(url);await page.evaluate(match=>{localStorage.clear();localStorage.setItem('volleystats.archives.v1',JSON.stringify([match]));},legacy);await page.reload();await tap('nav:matches');await tap('stats-archive:legacy-archive-rotation');await tap('stat-tab:Rotaciones');
  const row=page.locator('[data-rotation="R6"][data-phase="K1"]');assert.equal(await row.locator('td').nth(3).innerText(),'1');assert.equal(await page.locator('[data-rotation="R2"][data-phase="K1"] td').nth(2).innerText(),'0');await tap('close');
 });
 await check('Correccion de ultimo registro, deshacer vacio y fallo al guardar',async()=>{
  await reset();await tap('ours');const before=await state();await tap('history');await tap('edit-event:0');await tap('delete-event:0');await tap('confirm-correction');equal((await state()).events.length,0);assert.equal(await page.locator('[data-cmd="undo"]').isDisabled(),false);await page.reload();await undo();equal(await state(),before);
  await tap('history');await tap('edit-event:0');await page.selectOption('[name="kind"]','net');await page.locator('#edit-form button[type="submit"]').click();await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw Error('Full')}});await tap('confirm-correction');equal(await state(),before);assert.match(await page.locator('.dialog-toast.show').innerText(),/No se pudo guardar/);
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
   const failures=await page.evaluate(()=>{const failures=[];for(const el of document.querySelectorAll('#app button,#app .brand-logo,#app > header,#app .court,#app .bench,#app .latest')){const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;const id=el.dataset.cmd||el.className||el.tagName;if(r.left<0||r.top<0||r.right>innerWidth+1||r.bottom>innerHeight+1)failures.push(id);for(let p=el.parentElement;p&&p.id!=='app';p=p.parentElement){if(['hidden','clip'].includes(getComputedStyle(p).overflowY)){const b=p.getBoundingClientRect();if(r.bottom>b.bottom+1||r.top<b.top-1)failures.push(id+' clipped');}}}if(document.documentElement.scrollHeight>innerHeight||document.documentElement.scrollWidth>innerWidth)failures.push('page overflow');return failures});assert.deepEqual(failures,[],`${width}x${height}`);
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

  await page.locator('.welcome-card').waitFor({timeout:3000});

  assert.match(
   await page.locator('[role="alert"]').innerText(),
   /almacenamiento/,
  );

  await tap('select-roster:test-roster');
  await tap('continue-welcome');

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
  await tap('select-roster:setup-roster');
  await tap('continue-welcome');
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
  assert.equal(created.rotation,1);
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
  await page.reload();
  await page.locator('.court').waitFor();
  equal(await state(),created);
  assert.equal(await page.locator('.welcome-card').count(),0,'la recarga restaura el partido sin bienvenida');
  assert.equal(await page.locator('[data-cmd="continue-welcome"]').count(),0);

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
  assert.equal(second.set,2);equal(second.score,[0,0]);assert.equal(second.rotation,6);
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
