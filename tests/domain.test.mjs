import test from 'node:test';import assert from 'node:assert/strict';import {initial,transition} from '../src/domain.js';
test('Errores no forzados ceden punto y saque sin rotar, y se deshacen completos',()=>{
 for(const reason of ['rotation','net'])for(const serving of [true,false]){
  const s=initial();s.serving=serving;
  const n=transition(s,{type:'point',team:1,category:'unforced-error',reason,label:'Error nuestro'});
  assert.deepEqual(n.score,[0,1]);assert.equal(n.serving,false);assert.equal(n.rotation,s.rotation);assert.deepEqual(n.lineup,s.lineup);
  assert.equal(n.events.at(-1).reason,reason);assert.deepEqual(transition(n,{type:'undo'}),s);
 }
});
test('Recuperar saque rota una vez y deshacer restaura la operación completa',()=>{const s=initial();const n=transition(s,{type:'point',team:0,label:'Punto'});assert.deepEqual(n.score,[1,0]);assert.equal(n.rotation,2);assert.deepEqual(n.lineup,[9,12,7,8,15,4]);const more=transition(n,{type:'point',team:0});assert.equal(more.rotation,2);assert.deepEqual(transition(n,{type:'undo'}),s);});
test('Sustitución conserva zona y marcador, y se revierte',()=>{const s=initial();const n=transition(s,{type:'sub',out:4,in:6});assert.equal(n.lineup[0],6);assert.deepEqual(n.score,[0,0]);assert.deepEqual(transition(n,{type:'undo'}),s);});
test('Recepción perfecta no suma, ataque punto sí y error suma rival',()=>{let s=transition(initial(),{type:'action',action:'Recepción',grade:'#'});assert.deepEqual(s.score,[0,0]);s=transition(s,{type:'action',action:'Ataque',grade:'#'});assert.deepEqual(s.score,[1,0]);s=transition(s,{type:'action',action:'Saque',grade:'='});assert.deepEqual(s.score,[1,1]);assert.equal(s.serving,false);});
test('Ataque negativo continúa la jugada sin punto, saque ni rotación',()=>{
  for(const serving of [true,false]){
    const s=initial();s.serving=serving;const n=transition(s,{type:'action',player:7,action:'Ataque',grade:'-',label:'Ataque -'});
    assert.deepEqual(n.score,s.score);assert.equal(n.serving,serving);assert.equal(n.rotation,s.rotation);assert.deepEqual(n.lineup,s.lineup);assert.equal(n.events.at(-1).grade,'-');assert.deepEqual(transition(n,{type:'undo'}),s);
  }
});
test('Cerrar bloquea el registro, nuevo set conserva alineación y deshacer lo recupera',()=>{let s=transition(initial(),{type:'finish'});assert.equal(transition(s,{type:'point',team:0}),s);const n=transition(s,{type:'next',serving:true});assert.equal(n.set,2);assert.deepEqual(n.score,[0,0]);assert.deepEqual(n.lineup,s.lineup);assert.deepEqual(transition(n,{type:'undo'}),s);assert.deepEqual(JSON.parse(JSON.stringify(n)),n);});
