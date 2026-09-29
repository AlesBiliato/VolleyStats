import test from 'node:test';import assert from 'node:assert/strict';
import {initial,transition} from '../src/domain.js';
import {correctEvent} from '../src/corrections.js';
import {aggregatePlayerStatistics,statistics,percent} from '../src/statistics.js';
import {loadMatch,saveMatch} from '../src/storage.js';
const point=(team)=>({type:'point',team,label:'Punto'});
function play(commands){return commands.reduce(transition,initial());}
function rotationPhase(stats,rotation,phase){return stats.rotationPhases.find(group=>group.rotation===rotation&&group.phase===phase);}
function assertRotationPhaseInvariants(stats){
 for(const rotation of stats.rotations){
  const number=Number(rotation.name.slice(1)),groups=stats.rotationPhases.filter(group=>group.rotation===number);
  assert.equal(groups.reduce((sum,group)=>sum+group.played,0),rotation.won+rotation.lost,`${rotation.name} played`);
  assert.equal(groups.reduce((sum,group)=>sum+group.won,0),rotation.won,`${rotation.name} won`);
  assert.equal(groups.reduce((sum,group)=>sum+group.lost,0),rotation.lost,`${rotation.name} lost`);
 }
 for(const phase of stats.phases){
  const groups=stats.rotationPhases.filter(group=>group.phase===phase.name);
  assert.equal(groups.reduce((sum,group)=>sum+group.played,0),phase.won+phase.lost,`${phase.name} played`);
  assert.equal(groups.reduce((sum,group)=>sum+group.won,0),phase.won,`${phase.name} won`);
  assert.equal(groups.reduce((sum,group)=>sum+group.lost,0),phase.lost,`${phase.name} lost`);
 }
}
function rotationPhaseSample(){
 return play([
  point(0),
  point(1),
  point(0),
  {type:'action',player:7,action:'Ataque',grade:'?',label:'Ataque ?'},
  point(0),
  {type:'finish',label:'Cierre'},
  {type:'next',serving:false,label:'Inicio set 2'},
  point(1),
  point(0),
  point(1),
 ]);
}
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
 const p=stats.players.find(p=>p.id===7);assert.equal(p.attack,2);assert.equal(percent(p.kills-p.attackErrors,p.attack),'50 %');assert.equal(percent(p.positiveReception,p.reception),'100 %');assert.equal(percent(0,0),'—');assert.equal(statistics(s,'1').total.won,1);assert.equal(statistics(s,'2').total.actions,0);assert.equal(stats.phases[0].won,1);assert.equal(stats.phases[1].won,1);
});

test('Rotaciones por fase conserva el contexto previo y las 12 combinaciones',()=>{
 const state=rotationPhaseSample(),stats=statistics(state);
 assert.deepEqual(stats.rotationPhases.map(({name,phase})=>`${name}-${phase}`),[
  'R1-K1','R1-K2','R2-K1','R2-K2','R3-K1','R3-K2',
  'R4-K1','R4-K2','R5-K1','R5-K2','R6-K1','R6-K2',
 ]);
 assert.deepEqual(state.events.slice(0,5).map(({rotation,phase})=>[rotation,phase]),[
  [1,'K1'],[2,'K2'],[2,'K1'],[3,'K2'],[3,'K2'],
 ]);
 assert.deepEqual(rotationPhase(stats,1,'K1'),{rotation:1,name:'R1',phase:'K1',won:2,lost:1,played:3,balance:1,wonPercent:'67 %'});
 assert.deepEqual(rotationPhase(stats,2,'K1'),{rotation:2,name:'R2',phase:'K1',won:1,lost:0,played:1,balance:1,wonPercent:'100 %'});
 assert.deepEqual(rotationPhase(stats,2,'K2'),{rotation:2,name:'R2',phase:'K2',won:0,lost:2,played:2,balance:-2,wonPercent:'0 %'});
 assert.deepEqual(rotationPhase(stats,3,'K2'),{rotation:3,name:'R3',phase:'K2',won:1,lost:0,played:1,balance:1,wonPercent:'100 %'});
 assert.equal(rotationPhase(stats,6,'K1').wonPercent,'—');
 const neutral=statistics(play([{type:'action',player:7,action:'Ataque',grade:'?',label:'Ataque ?'}]));
 assert.equal(neutral.rotationPhases.reduce((sum,group)=>sum+group.played,0),0);
});

test('Rotaciones por fase cumplen invariantes globales y por set',()=>{
 const state=rotationPhaseSample();
 for(const period of ['all','1','2'])assertRotationPhaseInvariants(statistics(state,period));
 const setOne=statistics(state,'1'),setTwo=statistics(state,'2');
 assert.deepEqual([setOne.total.won,setOne.total.lost],[3,1]);
 assert.deepEqual([setTwo.total.won,setTwo.total.lost],[1,2]);
 assert.deepEqual(rotationPhase(setOne,1,'K1'),{rotation:1,name:'R1',phase:'K1',won:1,lost:0,played:1,balance:1,wonPercent:'100 %'});
 assert.deepEqual(rotationPhase(setTwo,1,'K1'),{rotation:1,name:'R1',phase:'K1',won:1,lost:1,played:2,balance:0,wonPercent:'50 %'});
});

test('Partidos legacy recuperan fase y rotación desde los snapshots undo',()=>{
 const modern=rotationPhaseSample(),legacy=structuredClone(modern);
 for(const event of legacy.events){delete event.phase;delete event.rotation;}
 const modernStats=statistics(modern),legacyStats=statistics(legacy);
 assert.deepEqual(legacyStats.phases,modernStats.phases);
 assert.deepEqual(legacyStats.rotations,modernStats.rotations);
 assert.deepEqual(legacyStats.rotationPhases,modernStats.rotationPhases);
 assertRotationPhaseInvariants(legacyStats);
 for(const period of ['1','2']){
  const modernPeriod=statistics(modern,period),legacyPeriod=statistics(legacy,period);
  assert.deepEqual(legacyPeriod.phases,modernPeriod.phases);
  assert.deepEqual(legacyPeriod.rotations,modernPeriod.rotations);
  assert.deepEqual(legacyPeriod.rotationPhases,modernPeriod.rotationPhases);
  assertRotationPhaseInvariants(legacyPeriod);
 }
});

test('El contexto explícito del evento tiene prioridad y no se inventa si falta',()=>{
 const state=play([point(0)]),explicit=structuredClone(state);
 explicit.events[0].rotation=6;explicit.events[0].phase='K2';
 const explicitStats=statistics(explicit);
 assert.equal(rotationPhase(explicitStats,6,'K2').won,1);
 assert.equal(rotationPhase(explicitStats,1,'K1').played,0);
 const unknown=structuredClone(state);delete unknown.events[0].rotation;delete unknown.events[0].phase;unknown.undo=[];
 const unknownStats=statistics(unknown);
 assert.equal(unknownStats.total.won,1);
 assert.equal(unknownStats.phases.reduce((sum,phase)=>sum+phase.won+phase.lost,0),0);
 assert.equal(unknownStats.rotations.reduce((sum,rotation)=>sum+rotation.won+rotation.lost,0),0);
 assert.equal(unknownStats.rotationPhases.reduce((sum,group)=>sum+group.played,0),0);
});

test('Ataque - cuenta como ataque y calidad negativa, no como error de punto',()=>{
 const s=play([{type:'action',player:7,action:'Ataque',grade:'-',label:'Ataque -'}]);
 const p=statistics(s).players.find(player=>player.id===7);assert.equal(p.attack,1);assert.equal(p.attackErrors,0);assert.equal(p.negativeActions,1);assert.equal(p.gp,0);assert.equal(p.points,0);
 const plus=correctEvent(s,0,{type:'action',player:7,action:'Ataque',grade:'+',label:'Ataque +'});assert.deepEqual(plus.score,s.score);const plusStats=statistics(plus).players.find(player=>player.id===7);assert.equal(plusStats.attack,1);assert.equal(plusStats.kills,0);assert.equal(plusStats.attackErrors,0);assert.equal(plusStats.points,0);assert.equal(plusStats.errors,0);assert.equal(plusStats.positiveActions,1);assert.equal(plusStats.gp,0);
 const negative=correctEvent(plus,0,{type:'action',player:7,action:'Ataque',grade:'-',label:'Ataque -'});assert.deepEqual(negative.score,s.score);const negativeStats=statistics(negative).players.find(player=>player.id===7);assert.equal(negativeStats.attack,1);assert.equal(negativeStats.kills,0);assert.equal(negativeStats.attackErrors,0);assert.equal(negativeStats.points,0);assert.equal(negativeStats.errors,0);
});
test('Las cuatro valoraciones actuales de Ataque conservan intentos y resultados',()=>{
 const cases=[
  ['#',[1,0],{kills:1,attackErrors:0,blocked:0,points:1,errors:0,gp:1}],
  ['?',[0,0],{kills:0,attackErrors:0,blocked:0,points:0,errors:0,gp:0}],
  ['=',[0,1],{kills:0,attackErrors:1,blocked:0,points:0,errors:1,gp:-1}],
  ['Blo',[0,1],{kills:0,attackErrors:0,blocked:1,points:0,errors:1,gp:-1}],
 ];
 for(const [grade,score,expected] of cases){const s=play([{type:'action',player:7,action:'Ataque',grade,label:`Ataque ${grade}`}]);assert.deepEqual(s.score,score);const p=statistics(s).players.find(player=>player.id===7);assert.equal(p.attack,1);for(const [key,value] of Object.entries(expected))assert.equal(p[key],value,`${grade} ${key}`);}
 const neutral=play([{type:'action',player:7,action:'Ataque',grade:'?',label:'Ataque ?'}]);const p=statistics(neutral).players.find(player=>player.id===7);assert.equal(p.positiveActions,0);assert.equal(p.negativeActions,0);assert.equal(p.gp,0);
});
test('BP conserva los puntos de jugadores en K2 y G-P usa puntos menos errores terminales',()=>{
 let s=initial();s.serving=true;
 for(const [action,grade] of [['Ataque','#'],['Recepción','+'],['Recepción','='],['Ataque','Blo']])s=transition(s,{type:'action',player:7,action,grade,label:`${action} ${grade}`});
 const p=statistics(s).players.find(player=>player.id===7);
 assert.equal(p.points,1);assert.equal(p.breakPoints,1);assert.equal(p.gp,-1);
});
test('G-P usa puntos ganados y pérdidas terminales atribuibles al jugador',()=>{
 let s=play([{type:'action',player:7,action:'Ataque',grade:'?',label:'Ataque ?'},{type:'action',player:7,action:'Ataque',grade:'=',label:'Ataque ='}]);let p=statistics(s).players.find(player=>player.id===7);assert.equal(p.attack,2);assert.equal(p.attackErrors,1);assert.equal(p.kills,0);assert.equal(p.points,0);assert.equal(p.errors,1);assert.equal(p.gp,-1);
 s=play([{type:'action',player:7,action:'Saque',grade:'#',label:'Saque #'},{type:'action',player:7,action:'Ataque',grade:'#',label:'Ataque #'}]);p=statistics(s).players.find(player=>player.id===7);assert.equal(p.points,2);assert.equal(p.aces,1);assert.equal(p.kills,1);assert.equal(p.errors,0);assert.equal(p.gp,2);
 s=play([{type:'action',player:7,action:'Ataque',grade:'#',label:'Ataque #'},{type:'action',player:7,action:'Ataque',grade:'?',label:'Ataque ?'},{type:'action',player:7,action:'Ataque',grade:'=',label:'Ataque ='},{type:'action',player:7,action:'Ataque',grade:'Blo',label:'Ataque Blo'}]);p=statistics(s).players.find(player=>player.id===7);assert.equal(p.attack,4);assert.equal(p.kills,1);assert.equal(p.attackErrors,1);assert.equal(p.blocked,1);assert.equal(p.points,1);assert.equal(p.errors,2);assert.equal(p.gp,-1);
});
test('Recepción sigue el criterio de Tot, Err, Pos %, Exc % y G-P',()=>{
 const expected={
  '#':{positiveReception:1,excellentReception:1,receptionErrors:0,gp:0},
  '+':{positiveReception:1,excellentReception:0,receptionErrors:0,gp:0},
  '-':{positiveReception:0,excellentReception:0,receptionErrors:0,gp:0},
  '=':{positiveReception:0,excellentReception:0,receptionErrors:1,gp:-1},
 };
 for(const [grade,values] of Object.entries(expected)){const s=play([{type:'action',player:7,action:'Recepción',grade,label:`Recepción ${grade}`}]);const p=statistics(s).players.find(player=>player.id===7);assert.equal(p.reception,1);assert.equal(p.points,0);for(const [key,value] of Object.entries(values))assert.equal(p[key],value,`${grade} ${key}`);}
 const combined=play(['#','+','-','='].map(grade=>({type:'action',player:7,action:'Recepción',grade,label:`Recepción ${grade}`})));const p=statistics(combined).players.find(player=>player.id===7);assert.equal(p.reception,4);assert.equal(p.receptionErrors,1);assert.equal(percent(p.positiveReception,p.reception),'50 %');assert.equal(percent(p.excellentReception,p.reception),'25 %');assert.equal(p.gp,-1);
});
test('Las valoraciones actuales y legacy de Saque conservan su semántica',()=>{
 const cases=[
  ['#',[1,0],{serve:1,aces:1,serveErrors:0,points:1,errors:0,gp:1}],
  ['?',[0,0],{serve:1,aces:0,serveErrors:0,points:0,errors:0,gp:0}],
  ['=',[0,1],{serve:1,aces:0,serveErrors:1,points:0,errors:1,gp:-1}],
  ['+',[0,0],{serve:1,aces:0,serveErrors:0,points:0,errors:0,gp:0}],
  ['-',[0,1],{serve:1,aces:0,serveErrors:1,points:0,errors:1,gp:-1}],
 ];
 for(const [grade,score,expected] of cases){const s=play([{type:'action',player:7,action:'Saque',grade,label:`Saque ${grade}`}]);assert.deepEqual(s.score,score);const p=statistics(s).players.find(player=>player.id===7);for(const [key,value] of Object.entries(expected))assert.equal(p[key],value,`${grade} ${key}`);}
 const combined=play(['#','?','='].map(grade=>({type:'action',player:7,action:'Saque',grade,label:`Saque ${grade}`})));const p=statistics(combined).players.find(player=>player.id===7);assert.equal(p.serve,3);assert.equal(p.aces,1);assert.equal(p.serveErrors,1);assert.equal(p.points,1);assert.equal(p.errors,1);assert.equal(p.gp,0);
 const legacy=play([{type:'action',player:7,action:'Saque',grade:'+',label:'Saque +'}]);const replayed=correctEvent(legacy,0,{type:'action',player:7,action:'Saque',grade:'-',label:'Saque -'});assert.equal(replayed.events[0].grade,'-');assert.deepEqual(replayed.score,[0,1]);assert.equal(statistics(replayed).players.find(player=>player.id===7).gp,-1);
});

test('Cada acción terminal negativa identifica su error visible y su atribución en G-P',()=>{
 const cases=[
  ['Saque','=',[0,1],{serveErrors:1}],
  ['Recepción','=',[0,1],{receptionErrors:1}],
  ['Ataque','=',[0,1],{attackErrors:1}],
  ['Ataque','Blo',[0,1],{blocked:1}],
  ['Bloqueo','=',[0,1],{blockErrors:1,gp:0}],
  ['Bloqueo','#',[1,0],{points:1,errors:0,gp:1,blockPoints:1,blockErrors:0}],
 ];
 const metricKeys=['points','errors','gp','serveErrors','receptionErrors','attackErrors','blocked','blockPoints','blockErrors'];
 for(const [action,grade,score,overrides] of cases){
  const state=play([{type:'action',player:9,action,grade,label:`${action} ${grade}`}]);
  const player=statistics(state).players.find(candidate=>candidate.id===9);
  const expected={points:0,errors:1,gp:-1,serveErrors:0,receptionErrors:0,attackErrors:0,blocked:0,blockPoints:0,blockErrors:0,...overrides};
  assert.deepEqual(state.score,score,`${action} ${grade} marcador`);
  assert.deepEqual(Object.fromEntries(metricKeys.map(key=>[key,player[key]])),expected,`${action} ${grade} métricas`);
 }
});

test('Saque = y dos Bloqueo = dejan G-P -1 y agregan los errores de bloqueo',()=>{
 const state=play([
  {type:'action',player:9,action:'Saque',grade:'=',label:'Saque =' },
  {type:'action',player:9,action:'Bloqueo',grade:'=',label:'Bloqueo =' },
  {type:'action',player:9,action:'Bloqueo',grade:'=',label:'Bloqueo =' },
 ]);
 const stats=statistics(state);
 const player=stats.players.find(candidate=>candidate.id===9);
 assert.deepEqual(state.score,[0,3]);
 assert.equal(player.points,0);
 assert.equal(player.errors,3);
 assert.equal(player.gp,-1);
 assert.equal(player.serveErrors,1);
 assert.equal(player.blockErrors,2);
 assert.equal(player.attackErrors,0);
 assert.equal(player.blocked,0);
 const total=aggregatePlayerStatistics(stats.players);
 assert.equal(total.blockErrors,2);
 assert.equal(total.gp,-1);
});

test('Ataque Blo penaliza G-P y Bloqueo = solo suma error de bloqueo',()=>{
 const state=play([
  {type:'action',player:9,action:'Ataque',grade:'Blo',label:'Ataque Blo'},
  {type:'action',player:9,action:'Bloqueo',grade:'=',label:'Bloqueo =' },
 ]);
 const player=statistics(state).players.find(candidate=>candidate.id===9);
 assert.deepEqual(state.score,[0,2]);
 assert.equal(player.errors,2);
 assert.equal(player.blocked,1);
 assert.equal(player.attackErrors,0);
 assert.equal(player.blockErrors,1);
 assert.equal(player.gp,-1);
});
