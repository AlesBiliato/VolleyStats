import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,transition} from '../src/domain.js';
import {loadArchives,loadMatch,replaceMatch,saveMatch} from '../src/storage.js';

function localStore(value=null){
 const values=new Map();
 if(value!==null)values.set('volleystats.match.v1',value);
 globalThis.localStorage={
  getItem:key=>values.get(key)??null,
  setItem:(key,next)=>values.set(key,next),
 };
 return (key='volleystats.match.v1')=>values.get(key)??null;
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
test('Persiste y recarga un Ataque ? sin perder su valoración',()=>{
 localStore();const state=transition(initial(),{type:'action',player:7,action:'Ataque',grade:'?',label:'Ataque ?'});saveMatch(state);assert.equal(loadMatch().events.at(-1).grade,'?');assert.deepEqual(loadMatch().score,[0,0]);
});
test('Persiste y recarga un Saque ? sin perder su valoración',()=>{
 localStore();const state=transition(initial(),{type:'action',player:7,action:'Saque',grade:'?',label:'Saque ?'});saveMatch(state);assert.equal(loadMatch().events.at(-1).grade,'?');assert.deepEqual(loadMatch().score,[0,0]);
});
test('Persiste y recarga partidos finalizados',()=>{
 localStore();const state=transition(initial(),{type:'finish-match',label:'Partido finalizado'});saveMatch(state);const loaded=loadMatch();assert.deepEqual(loaded,state);assert.equal(loaded.status,'finished');assert.equal(loaded.events.at(-1).type,'finish-match');
});
test('Carga partidos antiguos sin saque en los inicios de set',()=>{
 const old=transition(initial(),{type:'point',team:1,label:'Punto rival'});
 delete old.setStarts[0].serving;for(const snapshot of old.undo)delete snapshot.setStarts[0].serving;
 localStore(JSON.stringify(old));assert.deepEqual(loadMatch(),old);
 const current=initial();localStore(JSON.stringify(current));assert.equal(loadMatch().setStarts[0].serving,false);
});
test('Rechaza datos dañados sin sobrescribirlos',()=>{
 const mutations=[
  s=>{s.lineup[0]=999;},s=>{s.lineup[0]=s.lineup[1];},s=>{s.roster[0]=null;},
  s=>{s.score=[-1,0];},s=>{s.score=[0];},s=>{s.set=6;},s=>{s.rotation=0;},
  s=>{s.serving='false';},s=>{s.status='invalid';},s=>{s.finishedSets=[null];},
  s=>{s.setStarts[0].lineup[0]=999;},
  s=>{s.setStarts[0].serving='true';},
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

test('replaceMatch conserva el partido anterior en el archivo',()=>{
 const stored=localStore();
 const previous={...initial(),id:'previous-match',demo:false};
 const next={...initial(),id:'next-match',demo:false};
 saveMatch(previous);
 replaceMatch(next);
 assert.deepEqual(loadMatch(),next);
 assert.deepEqual(loadArchives(),[previous]);
 assert.equal(JSON.parse(stored('volleystats.archives.v1')).length,1);
});

test('replaceMatch no duplica un partido archivado con el mismo ID',()=>{
 const previous={...initial(),id:'same-archive-id',demo:false,rival:'Versión actual'};
 const duplicate={...previous,rival:'Versión antigua'};
 const next={...initial(),id:'next-after-duplicate',demo:false};
 localStore();
 saveMatch(previous);
 localStorage.setItem('volleystats.archives.v1',JSON.stringify([duplicate]));
 replaceMatch(next);
 assert.deepEqual(loadArchives(),[previous]);
});

test('loadArchives devuelve todos los partidos guardados válidos',()=>{
 const first={...initial(),id:'archive-one',demo:false};
 const second={...initial(),id:'archive-two',demo:false};
 localStore();
 localStorage.setItem('volleystats.archives.v1',JSON.stringify([first,second]));
 assert.deepEqual(loadArchives(),[first,second]);
});

test('datos corruptos del archivo no se sobrescriben silenciosamente',()=>{
 const corrupt='[{"id":"incompleto"}]';
 const previous={...initial(),id:'current-before-corrupt',demo:false};
 const next={...initial(),id:'next-after-corrupt',demo:false};
 const stored=localStore();
 saveMatch(previous);
 localStorage.setItem('volleystats.archives.v1',corrupt);
 assert.throws(loadArchives,/partidos guardados/);
 assert.throws(()=>replaceMatch(next),/partidos guardados/);
 assert.equal(stored('volleystats.archives.v1'),corrupt);
 assert.deepEqual(loadMatch(),previous);
});
