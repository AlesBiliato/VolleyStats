import test from 'node:test';import assert from 'node:assert/strict';
import {initial,transition} from '../src/domain.js';
import {correctEvent} from '../src/corrections.js';
import {statistics,percent} from '../src/statistics.js';
import {loadMatch,saveMatch} from '../src/storage.js';
const point=(team)=>({type:'point',team,label:'Punto'});
function play(commands){return commands.reduce(transition,initial());}
test('Corregir un punto recalcula saque, rotaciones, sets y metadatos sin alterar original',()=>{
 const s=play([point(0),point(1),point(0),{type:'finish',label:'Cierre'},{type:'next',serving:false,label:'Inicio'},point(0)]);
 const n=correctEvent(s,0,point(1));assert.deepEqual(n.finishedSets[0].score,[1,2]);assert.deepEqual(n.score,[1,0]);assert.equal(n.rotation,2);assert.equal(s.rotation,2);
 assert.equal(n.events[1].rotation,1);assert.equal(n.events[1].phase,'K1');assert.equal(n.events[0].id,s.events[0].id);assert.equal(n.events[0].at,s.events[0].at);assert.match(n.events[3].label,/1–2/);assert.deepEqual(n.correctionUndo,s);
 let stored;globalThis.localStorage={getItem:()=>stored,setItem:(k,v)=>stored=v};saveMatch(n);assert.deepEqual(loadMatch(),n);
});
test('Eliminar la única operación permite volver al comienzo y restaurar',()=>{const s=play([point(0)]);const n=correctEvent(s,0,null);assert.deepEqual(n.score,[0,0]);assert.equal(n.events.length,0);assert.equal(n.undo.length,0);assert.deepEqual(n.correctionUndo,s);});
test('Una corrección incompatible con acciones posteriores se rechaza',()=>{
 const s=play([{type:'sub',out:4,in:6,label:'Cambio'},{type:'action',player:6,action:'Saque',grade:'#',label:'Saque'}]);assert.throws(()=>correctEvent(s,0,null),/jugadores/);assert.deepEqual(s.lineup,[9,12,7,8,15,6]);
});
test('Las correcciones reproducen y permiten editar el cambio de líbero activo',()=>{
 let base=initial();base.roster.push({id:17,name:'Segundo líbero',role:'Líbero'},{id:18,name:'Tercer líbero',role:'Líbero'});base.activeLiberoId=1;base.setStarts[0].activeLiberoId=1;
 let s=[{type:'action',player:7,action:'Recepción',grade:'+',label:'Recepción +'}, {type:'libero-change',activeLiberoId:17,label:'Cambio de líbero activo · Nico → Segundo líbero'}, {type:'action',player:17,action:'Recepción',grade:'+',label:'Recepción líbero +'}, {type:'finish-match',label:'Partido finalizado'}].reduce(transition,base);
 const replayed=correctEvent(s,0,{type:'action',player:8,action:'Recepción',grade:'+',label:'Recepción corregida'});assert.equal(replayed.activeLiberoId,17);assert.equal(replayed.status,'finished');assert.equal(replayed.events[1].type,'libero-change');assert.equal(replayed.events[2].player,17);
 assert.throws(()=>correctEvent(s,1,{type:'libero-change',activeLiberoId:18,label:'Cambio de líbero activo · Nico → Tercer líbero'}),/jugadores/);
 s=[{type:'libero-change',activeLiberoId:17,label:'Cambio de líbero activo · Nico → Segundo líbero'}, {type:'action',player:7,action:'Recepción',grade:'+',label:'Recepción +'}].reduce(transition,base);
 const edited=correctEvent(s,0,{type:'libero-change',activeLiberoId:18,label:'Cambio de líbero activo · Nico → Tercer líbero'});assert.equal(edited.activeLiberoId,18);assert.equal(edited.events[0].activeLiberoId,18);assert.throws(()=>correctEvent(s,0,{type:'libero-change',activeLiberoId:7,label:'Inválido'}),/líbero/);
});
test('Las correcciones reproducen el cierre de partido sin permitir editarlo ni eliminarlo',()=>{
 const s=play([point(0),{type:'action',player:7,action:'Recepción',grade:'+',label:'Recepción +'}, {type:'finish-match',label:'Partido finalizado'}]);
 const n=correctEvent(s,0,point(1));assert.equal(n.status,'finished');assert.equal(n.events.at(-1).type,'finish-match');assert.equal(n.events.at(-1).label,'Partido finalizado');assert.deepEqual(n.score,[0,1]);assert.throws(()=>correctEvent(s,2,null),/cierres/);assert.throws(()=>correctEvent(s,2,{type:'finish-match',label:'Otro cierre'}),/cierres/);
});
test('Cambiar jugador, valoración, sustitución y saque inicial',()=>{
 let s=play([{type:'action',player:7,action:'Ataque',grade:'#',label:'Ataque'}]);let n=correctEvent(s,0,{type:'action',player:8,action:'Ataque',grade:'Blo',label:'Bloqueado'});assert.deepEqual(n.score,[0,1]);assert.equal(statistics(n).players.find(p=>p.id===8).errors,1);
 s=play([{type:'sub',out:4,in:6,label:'Cambio'}]);n=correctEvent(s,0,{type:'sub',out:4,in:3,label:'Cambio'});assert.equal(n.lineup[0],3);
 s=play([{type:'finish',label:'Cierre'},{type:'next',serving:false,label:'Inicio'},point(0)]);n=correctEvent(s,1,{type:'next',serving:true,label:'Inicio'});assert.equal(n.rotation,1);assert.throws(()=>correctEvent(s,0,null));assert.throws(()=>correctEvent(s,1,null));
 s=play([{type:'point',team:1,category:'unforced-error',reason:'net',label:'Error nuestro no forzado · Toque de red'}]);n=correctEvent(s,0,{type:'point',team:1,category:'unforced-error',reason:'other',label:'Error nuestro no forzado · Otros'});assert.equal(n.events[0].reason,'other');assert.equal(n.events[0].category,'unforced-error');
});
test('Estadísticas agrupan puntos reales, fases, rotación y set sin contar cierres',()=>{
 const s=play([{type:'action',player:7,action:'Recepción',grade:'#',label:'Recepción'},{type:'action',player:7,action:'Ataque',grade:'#',label:'Ataque'},{type:'action',player:7,action:'Ataque',grade:'Blo',label:'Ataque'}, {type:'point',team:1,category:'unforced-error',reason:'net',label:'Red'},{type:'point',team:1,category:'unforced-error',reason:'other',label:'Otros'},{type:'finish',label:'Cierre'},{type:'next',serving:true,label:'Inicio'},point(0)]);
 const stats=statistics(s);assert.equal(stats.total.won,2);assert.equal(stats.total.lost,3);assert.equal(stats.total.actions,3);assert.equal(stats.unforced,2);assert.equal(stats.netErrors,1);assert.equal(stats.otherErrors,1);
 const p=stats.players.find(p=>p.id===7);assert.equal(p.attack,2);assert.equal(percent(p.kills-p.attackErrors,p.attack),'0 %');assert.equal(percent(p.positiveReception,p.reception),'100 %');assert.equal(percent(0,0),'—');assert.equal(statistics(s,'1').total.won,1);assert.equal(statistics(s,'2').total.actions,0);assert.equal(stats.phases[0].won,1);assert.equal(stats.phases[1].won,1);
});

test('Ataque - cuenta como ataque y calidad negativa, no como error de punto',()=>{
 const s=play([{type:'action',player:7,action:'Ataque',grade:'-',label:'Ataque -'}]);
 const p=statistics(s).players.find(player=>player.id===7);assert.equal(p.attack,1);assert.equal(p.attackErrors,0);assert.equal(p.negativeActions,1);assert.equal(p.gp,-1);assert.equal(p.points,0);
 const plus=correctEvent(s,0,{type:'action',player:7,action:'Ataque',grade:'+',label:'Ataque +'});assert.deepEqual(plus.score,s.score);const plusStats=statistics(plus).players.find(player=>player.id===7);assert.equal(plusStats.attack,1);assert.equal(plusStats.kills,0);assert.equal(plusStats.attackErrors,0);assert.equal(plusStats.points,0);assert.equal(plusStats.errors,0);assert.equal(plusStats.positiveActions,1);
 const negative=correctEvent(plus,0,{type:'action',player:7,action:'Ataque',grade:'-',label:'Ataque -'});assert.deepEqual(negative.score,s.score);const negativeStats=statistics(negative).players.find(player=>player.id===7);assert.equal(negativeStats.attack,1);assert.equal(negativeStats.kills,0);assert.equal(negativeStats.attackErrors,0);assert.equal(negativeStats.points,0);assert.equal(negativeStats.errors,0);
});
test('Las cuatro valoraciones actuales de Ataque conservan intentos y resultados',()=>{
 const cases=[
  ['#',[1,0],{kills:1,attackErrors:0,blocked:0,points:1,errors:0}],
  ['?',[0,0],{kills:0,attackErrors:0,blocked:0,points:0,errors:0}],
  ['=',[0,1],{kills:0,attackErrors:1,blocked:0,points:0,errors:1}],
  ['Blo',[0,1],{kills:0,attackErrors:1,blocked:1,points:0,errors:1}],
 ];
 for(const [grade,score,expected] of cases){const s=play([{type:'action',player:7,action:'Ataque',grade,label:`Ataque ${grade}`}]);assert.deepEqual(s.score,score);const p=statistics(s).players.find(player=>player.id===7);assert.equal(p.attack,1);for(const [key,value] of Object.entries(expected))assert.equal(p[key],value,`${grade} ${key}`);}
 const neutral=play([{type:'action',player:7,action:'Ataque',grade:'?',label:'Ataque ?'}]);const p=statistics(neutral).players.find(player=>player.id===7);assert.equal(p.positiveActions,0);assert.equal(p.negativeActions,0);assert.equal(p.gp,0);
});
test('BP cuenta puntos de jugadores en K2 y G-P resta acciones negativas',()=>{
 let s=initial();s.serving=true;
 for(const [action,grade] of [['Ataque','#'],['Recepción','+'],['Recepción','='],['Ataque','Blo']])s=transition(s,{type:'action',player:7,action,grade,label:`${action} ${grade}`});
 const p=statistics(s).players.find(player=>player.id===7);
 assert.equal(p.points,1);assert.equal(p.breakPoints,1);assert.equal(p.gp,0);
});
