import test from 'node:test';import assert from 'node:assert/strict';import {createMatch,initial,transition} from '../src/domain.js';
test('Errores no forzados ceden punto y saque sin rotar, y se deshacen completos',()=>{
 for(const reason of ['rotation','net','other'])for(const serving of [true,false]){
  const s=initial();s.serving=serving;
  const n=transition(s,{type:'point',team:1,category:'unforced-error',reason,label:'Error nuestro'});
  assert.deepEqual(n.score,[0,1]);assert.equal(n.serving,false);assert.equal(n.rotation,s.rotation);assert.deepEqual(n.lineup,s.lineup);
  assert.equal(n.events.at(-1).reason,reason);assert.deepEqual(transition(n,{type:'undo'}),s);
 }
});
test('Recuperar saque rota físicamente y sigue al colocador',()=>{const s=initial();const n=transition(s,{type:'point',team:0,label:'Punto'});assert.deepEqual(n.score,[1,0]);assert.equal(n.rotation,6);assert.deepEqual(n.lineup,[9,12,7,8,15,4]);const more=transition(n,{type:'point',team:0});assert.equal(more.rotation,6);assert.deepEqual(transition(n,{type:'undo'}),s);});
test('Un side-out legacy guarda la R efectiva anterior en el evento',()=>{
 const legacy=initial();legacy.lineup=[7,8,15,9,12,4];legacy.rotation=2;legacy.serving=false;
 const next=transition(legacy,{type:'point',team:0,label:'Punto'});
 assert.equal(next.events.at(-1).rotation,6);assert.equal(next.undo[0].rotation,6);assert.equal(next.rotation,5);
});

test('Undo reconcilia la R de un snapshot legacy restaurado',()=>{
 const current=transition(initial(),{type:'point',team:0});
 current.undo[0].lineup=[7,8,15,9,12,4];current.undo[0].rotation=2;
 const restored=transition(current,{type:'undo'});
 assert.deepEqual(restored.lineup,[7,8,15,9,12,4]);assert.equal(restored.rotation,6);
 for(const lineup of [[7,8,15,9,12,11],[6,8,15,9,12,4]]){
  current.undo[0].lineup=lineup;
  assert.equal(transition(current,{type:'undo'}).rotation,2);
 }
});
test('La rotación inicial sigue la zona del colocador',()=>{
 for(const zone of [1,2,5]){
  const lineup=[4,9,12,7,8,15];[lineup[0],lineup[zone-1]]=[lineup[zone-1],lineup[0]];
  const match=createMatch({team:initial().roster,rival:'Rival',lineup,serving:false});
  assert.equal(match.rotation,zone);
 }
});
test('La secuencia completa de side-outs es R1-R6-R5-R4-R3-R2-R1',()=>{
 let state=initial();
 const expected=[6,5,4,3,2,1];
 for(const rotation of expected){
  state=transition(state,{type:'point',team:0});
  assert.equal(state.rotation,rotation);
  state=transition(state,{type:'point',team:1});
 }
});
test('Puntos al saque y puntos rivales no cambian R',()=>{
 let state=initial();state.serving=true;state.rotation=4;state.lineup=[7,8,15,4,9,12];
 state=transition(state,{type:'point',team:0});assert.equal(state.rotation,4);assert.deepEqual(state.lineup,[7,8,15,4,9,12]);
 state=transition(state,{type:'point',team:1});assert.equal(state.rotation,4);assert.deepEqual(state.lineup,[7,8,15,4,9,12]);
});
test('Sustituciones recalculan R y conservan el último valor en estados ambiguos',()=>{
 const base=initial();base.lineup=[9,12,7,4,8,15];base.rotation=4;
 const nonSetter=transition(base,{type:'sub',out:7,in:3});assert.equal(nonSetter.rotation,4);
 const direct=transition(base,{type:'sub',out:4,in:6});assert.equal(direct.rotation,4);
 const zero=transition(base,{type:'sub',out:4,in:11});assert.equal(zero.rotation,4);
 const completed=transition(zero,{type:'sub',out:9,in:6});assert.equal(completed.rotation,1);assert.equal(completed.events.at(-1).rotation,4);
 assert.equal(transition(completed,{type:'undo'}).rotation,4);assert.equal(transition(transition(completed,{type:'undo'}),{type:'undo'}).rotation,4);
});
test('El doble cambio funciona también en el orden inverso',()=>{
 const base=initial();base.lineup=[9,12,7,4,8,15];base.rotation=4;
 const twoSetters=transition(base,{type:'sub',out:9,in:6});assert.equal(twoSetters.rotation,4);
 const completed=transition(twoSetters,{type:'sub',out:4,in:11});assert.equal(completed.rotation,1);assert.equal(completed.lineup[0],6);
});
test('Sustitución conserva zona y marcador, y se revierte',()=>{const s=initial();const n=transition(s,{type:'sub',out:4,in:6});assert.equal(n.lineup[0],6);assert.deepEqual(n.score,[0,0]);assert.deepEqual(transition(n,{type:'undo'}),s);});
test('Cambiar el líbero activo solo altera el líbero y se puede deshacer',()=>{
 const s=initial();s.roster.push({id:17,name:'Segundo líbero',role:'Líbero'});s.activeLiberoId=1;s.setStarts[0].activeLiberoId=1;
 const unchanged={lineup:structuredClone(s.lineup),score:structuredClone(s.score),rotation:s.rotation,serving:s.serving,set:s.set,finishedSets:structuredClone(s.finishedSets),setStarts:structuredClone(s.setStarts)};
 const n=transition(s,{type:'libero-change',activeLiberoId:17,label:'Cambio de líbero activo · Nico → Segundo líbero'});
 assert.equal(n.activeLiberoId,17);assert.deepEqual({lineup:n.lineup,score:n.score,rotation:n.rotation,serving:n.serving,set:n.set,finishedSets:n.finishedSets,setStarts:n.setStarts},unchanged);assert.equal(n.events.at(-1).type,'libero-change');assert.deepEqual(transition(n,{type:'undo'}),s);
});
test('El cambio de líbero rechaza roles no válidos, IDs inexistentes, redundancias y estados cerrados',()=>{
 const s=initial();s.roster.push({id:17,name:'Segundo líbero',role:'Líbero'});s.activeLiberoId=1;s.setStarts[0].activeLiberoId=1;
 for(const activeLiberoId of [7,12,4,999,1])assert.equal(transition(s,{type:'libero-change',activeLiberoId}),s);
 for(const status of ['between','finished']){const closed=structuredClone(s);closed.status=status;assert.equal(transition(closed,{type:'libero-change',activeLiberoId:17}),closed);}
});
test('Recepción perfecta no suma, ataque punto sí y error suma rival',()=>{let s=transition(initial(),{type:'action',action:'Recepción',grade:'#'});assert.deepEqual(s.score,[0,0]);s=transition(s,{type:'action',action:'Ataque',grade:'#'});assert.deepEqual(s.score,[1,0]);s=transition(s,{type:'action',action:'Saque',grade:'='});assert.deepEqual(s.score,[1,1]);assert.equal(s.serving,false);});
test('Ataque ? registra el intento y mantiene marcador, saque, rotación y alineación',()=>{
 for(const serving of [true,false]){
  const s=initial();s.serving=serving;const n=transition(s,{type:'action',player:7,action:'Ataque',grade:'?',label:'Ataque ?'});
  assert.deepEqual(n.score,s.score);assert.equal(n.serving,serving);assert.equal(n.rotation,s.rotation);assert.deepEqual(n.lineup,s.lineup);assert.equal(n.events.at(-1).grade,'?');assert.deepEqual(transition(n,{type:'undo'}),s);
 }
});
test('Saque ? registra la acción y mantiene marcador, saque, rotación y alineación',()=>{
 for(const serving of [true,false]){
  const s=initial();s.serving=serving;const n=transition(s,{type:'action',player:7,action:'Saque',grade:'?',label:'Saque ?'});
  assert.deepEqual(n.score,s.score);assert.equal(n.serving,serving);assert.equal(n.rotation,s.rotation);assert.deepEqual(n.lineup,s.lineup);assert.equal(n.events.at(-1).grade,'?');assert.deepEqual(transition(n,{type:'undo'}),s);
 }
});
test('Ataque negativo continúa la jugada sin punto, saque ni rotación',()=>{
  for(const serving of [true,false]){
    const s=initial();s.serving=serving;const n=transition(s,{type:'action',player:7,action:'Ataque',grade:'-',label:'Ataque -'});
    assert.deepEqual(n.score,s.score);assert.equal(n.serving,serving);assert.equal(n.rotation,s.rotation);assert.deepEqual(n.lineup,s.lineup);assert.equal(n.events.at(-1).grade,'-');assert.deepEqual(transition(n,{type:'undo'}),s);
  }
});
test('Cerrar bloquea el registro, nuevo set conserva alineación y deshacer lo recupera',()=>{let s=transition(initial(),{type:'finish'});assert.equal(transition(s,{type:'point',team:0}),s);const n=transition(s,{type:'next',serving:true});assert.equal(n.set,2);assert.deepEqual(n.score,[0,0]);assert.deepEqual(n.lineup,s.lineup);assert.deepEqual(transition(n,{type:'undo'}),s);assert.deepEqual(JSON.parse(JSON.stringify(n)),n);});
test('Finalizar partido durante un set conserva el estado deportivo, bloquea operaciones y se deshace',()=>{
 const s=initial();s.set=3;s.score=[17,12];s.rotation=4;s.lineup=[7,8,15,4,9,12];s.serving=true;s.activeLiberoId=1;s.finishedSets=[{set:1,score:[25,20]},{set:2,score:[21,25]}];s.setStarts=[{set:1,lineup:[4,9,12,7,8,15],activeLiberoId:1,serving:false},{set:2,lineup:[4,9,12,7,8,15],activeLiberoId:1,serving:true},{set:3,lineup:[7,8,15,4,9,12],activeLiberoId:1,serving:true}];
 const n=transition(s,{type:'finish-match',label:'Partido finalizado'});
 assert.equal(n.status,'finished');assert.equal(n.set,s.set);assert.deepEqual(n.score,s.score);assert.equal(n.rotation,s.rotation);assert.deepEqual(n.lineup,s.lineup);assert.equal(n.serving,s.serving);assert.equal(n.activeLiberoId,s.activeLiberoId);assert.deepEqual(n.setStarts,s.setStarts);assert.deepEqual(n.finishedSets,s.finishedSets);assert.equal(n.finishedSets.some(set=>set.set===3),false);assert.equal(n.events.at(-1).type,'finish-match');
 for(const command of [{type:'point',team:0},{type:'action',player:7,action:'Ataque',grade:'#'},{type:'sub',out:7,in:6},{type:'finish'},{type:'next',serving:false},{type:'finish-match'}])assert.equal(transition(n,command),n);
 assert.deepEqual(transition(n,{type:'undo'}),s);
});
test('Finalizar partido entre sets conserva los sets cerrados y undo vuelve a between',()=>{
 const playing=initial();playing.score=[25,22];const between=transition(playing,{type:'finish',label:'Set 1 finalizado'});const n=transition(between,{type:'finish-match',label:'Partido finalizado'});
 assert.equal(n.status,'finished');assert.deepEqual(n.finishedSets,between.finishedSets);assert.deepEqual(n.score,between.score);assert.equal(n.events.at(-1).type,'finish-match');assert.deepEqual(transition(n,{type:'undo'}),between);
});
test('Cada set conserva una copia independiente de su alineación y líbero iniciales',()=>{
 const firstLineup=[4,9,12,7,8,15];
 let s=createMatch({team:initial().roster,rival:'Rival',lineup:firstLineup,serving:false,activeLiberoId:1});
 assert.deepEqual(s.setStarts,[{set:1,lineup:firstLineup,activeLiberoId:1,serving:false}]);
 s=transition(s,{type:'point',team:0,label:'Rotación'});
 assert.notDeepEqual(s.lineup,firstLineup);assert.deepEqual(s.setStarts[0].lineup,firstLineup);
 s=transition(s,{type:'sub',out:9,in:6,label:'Sustitución'});
 assert.deepEqual(s.setStarts[0].lineup,firstLineup);
 const between=transition(s,{type:'finish',label:'Fin Set 1'});
 assert.deepEqual(between.setStarts[0].lineup,firstLineup);
 const secondLineup=[9,12,7,4,8,3];
 const second=transition(between,{type:'next',lineup:secondLineup,serving:true,activeLiberoId:null,label:'Inicio Set 2'});
 assert.equal(second.set,2);assert.deepEqual(second.score,[0,0]);assert.equal(second.rotation,4);
 assert.deepEqual(second.lineup,secondLineup);assert.equal(second.serving,true);assert.equal(second.activeLiberoId,null);
 assert.deepEqual(second.setStarts[1],{set:2,lineup:secondLineup,activeLiberoId:null,serving:true});
 second.lineup[0]=6;second.serving=false;assert.deepEqual(second.setStarts[1].lineup,secondLineup);assert.equal(second.setStarts[1].serving,true);
 const thirdBase=transition(second,{type:'finish',label:'Fin Set 2'});
 const third=transition(thirdBase,{type:'next',lineup:thirdBase.setStarts[1].lineup,serving:false,activeLiberoId:1,label:'Inicio Set 3'});
 assert.deepEqual(third.lineup,secondLineup);assert.deepEqual(third.setStarts[2],{set:3,lineup:secondLineup,activeLiberoId:1,serving:false});
 assert.deepEqual(transition(transition(between,{type:'next',lineup:secondLineup,serving:true,activeLiberoId:null}),{type:'undo'}),between);
});
