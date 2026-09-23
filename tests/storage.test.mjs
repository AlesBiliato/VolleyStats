import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,transition} from '../src/domain.js';
import {loadMatch,saveMatch} from '../src/storage.js';

function localStore(value=null){
 globalThis.localStorage={getItem:()=>value,setItem:(_key,next)=>{value=next;}};
 return ()=>value;
}

test('Guardado y lectura conservan partido, historial y deshacer',()=>{
 localStore();assert.equal(loadMatch(),null);
 let state=transition(initial(),{type:'point',team:0,label:'Punto nuestro'});
 state=transition(state,{type:'sub',out:4,in:6,label:'Sustitución'});
 state=transition(state,{type:'finish',label:'Cierre'});
 state=transition(state,{type:'next',serving:true,label:'Set siguiente'});
 saveMatch(state);assert.deepEqual(loadMatch(),state);
 assert.deepEqual(transition(loadMatch(),{type:'undo'}),transition(state,{type:'undo'}));
});

test('Persiste y recarga un Ataque - sin perder su valoración',()=>{
 localStore();const state=transition(initial(),{type:'action',player:7,action:'Ataque',grade:'-',label:'Ataque -'});saveMatch(state);assert.equal(loadMatch().events.at(-1).grade,'-');
});
test('Rechaza datos dañados sin sobrescribirlos',()=>{
 const mutations=[
  s=>{s.lineup[0]=999;},s=>{s.lineup[0]=s.lineup[1];},s=>{s.roster[0]=null;},
  s=>{s.score=[-1,0];},s=>{s.score=[0];},s=>{s.set=6;},s=>{s.rotation=0;},
  s=>{s.serving='false';},s=>{s.status='invalid';},s=>{s.finishedSets=[null];},
  s=>{s.events=[null];},s=>{s.undo=[null];},
 ];
 for(const mutate of mutations){const state=initial();mutate(state);const encoded=JSON.stringify(state);const stored=localStore(encoded);assert.throws(loadMatch);assert.equal(stored(),encoded);}
 for(const encoded of ['null','{bad json','[]']){const stored=localStore(encoded);assert.throws(loadMatch);assert.equal(stored(),encoded);}
});

test('Rechaza una instantánea dañada de deshacer antes de abrir el partido',()=>{
 const state=transition(initial(),{type:'point',team:1,label:'Punto rival'});
 state.undo[0].lineup[0]=999;localStore(JSON.stringify(state));assert.throws(loadMatch);
});

test('Propaga el fallo de guardado para que la interfaz no aplique la operación',()=>{
 globalThis.localStorage={setItem(){throw new Error('Sin espacio');}};
 assert.throws(()=>saveMatch(initial()),/Sin espacio/);
});
