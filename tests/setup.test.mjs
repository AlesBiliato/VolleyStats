import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch, initial, transition} from '../src/domain.js';
import {replaceMatch, loadMatch, loadArchives, saveMatch} from '../src/storage.js';
const config=()=>({team:initial().roster,rival:'Equipo visitante',lineup:[4,9,12,7,8,15],serving:true});
test('Partido real valida titulares y conserva una copia independiente de plantilla',()=>{
 const data=config(), match=createMatch(data);data.team[0].name='Cambio';
 assert.equal(match.demo,false);assert.notEqual(match.id,'demo-match');assert.deepEqual(match.score,[0,0]);
 assert.equal(match.serving,true);assert.notEqual(match.roster[0].name,'Cambio');
 for(const lineup of [[4,4,12,7,8,15],[1,9,12,7,8,15],[99,9,12,7,8,15],[]])
  assert.throws(()=>createMatch({...config(),lineup}));
 assert.throws(()=>createMatch({...config(),rival:' '}));
});
test('Nuevo partido archiva el anterior y un fallo de guardado conserva el actual',()=>{
 const values=new Map();globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 const first=transition(createMatch(config()),{type:'point',team:0,label:'Punto'});saveMatch(first);
 const second=createMatch(config());replaceMatch(second);assert.deepEqual(loadArchives(),[first]);assert.deepEqual(loadMatch(),second);
 replaceMatch(first);assert.deepEqual(loadMatch(),first);assert.ok(loadArchives().some(m=>m.id===second.id));
 globalThis.localStorage.setItem=()=>{throw Error('Sin espacio');};assert.throws(()=>replaceMatch(second));assert.deepEqual(loadMatch(),first);
});
