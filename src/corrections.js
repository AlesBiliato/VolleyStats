import {transition} from './domain.js';

export const grades={Saque:['#','+','-','='],'Recepción':['#','+','-','='],Ataque:['#','+','-','=','Blo'],Bloqueo:['#','=']};
export function eventCommand(event){
 const keys={point:['team','category','reason'],action:['player','action','grade'],sub:['out','in'],'libero-change':['activeLiberoId'],finish:[],'finish-match':[],next:['serving','lineup','activeLiberoId']}[event.type];
 if(!keys)throw Error('Operación no compatible.');
 return Object.fromEntries(['type','label',...keys].filter(k=>event[k]!==undefined).map(k=>[k,event[k]]));
}
export function correctEvent(previous,index,replacement){
 if(!Number.isInteger(index)||!previous.events[index]||!previous.undo[0])throw Error('No se encuentra la operación.');
 const original=previous.events[index];
 if(!['point','action','sub','libero-change','next'].includes(original.type)||(!replacement&&original.type==='next'))throw Error('Los cierres e inicios de set deben conservarse.');
 let state={...structuredClone(previous.undo[0]),events:[],undo:[]};delete state.correctionUndo;
 for(let i=0;i<previous.events.length;i++){
  const event=previous.events[i];if(i===index&&!replacement)continue;
  const cmd=i===index?eventCommand(replacement):eventCommand(event);
  if(i===index&&cmd.type!==original.type)throw Error('Conserva el tipo de operación.');
  if(cmd.type==='point'&&![0,1].includes(cmd.team))throw Error('Selecciona el equipo.');
  if(cmd.type==='action'&&(!(state.lineup.includes(cmd.player)||(state.activeLiberoId===cmd.player&&cmd.action==='Recepción'))||!grades[cmd.action]?.includes(cmd.grade)))throw Error(`La acción ${i+1} no es compatible con los jugadores en pista o su valoración.`);
  if(cmd.type==='sub'&&(!state.lineup.includes(cmd.out)||state.lineup.includes(cmd.in)||!state.roster.some(p=>p.id===cmd.in&&p.role!=='Líbero')))throw Error(`La sustitución ${i+1} ya no es posible. Corrige primero las operaciones posteriores que dependen de ella.`);
  if(cmd.type==='libero-change'&&(cmd.activeLiberoId===state.activeLiberoId||!state.roster.some(p=>p.id===cmd.activeLiberoId&&p.role==='Líbero')))throw Error(`El cambio de líbero ${i+1} no es válido.`);
  if(cmd.type==='next'&&(state.status!=='between'||typeof cmd.serving!=='boolean'))throw Error('El inicio del set no es válido.');
  if(cmd.type==='finish')cmd.label=`Set ${state.set} finalizado · ${state.score.join('–')}`;
  const next=transition(state,cmd);if(next===state)throw Error(`No se puede reproducir la operación ${i+1}.`);
  Object.assign(next.events.at(-1),{id:event.id,at:event.at});state=next;
 }
 const backup=structuredClone(previous);delete backup.correctionUndo;
 state.correctionUndo=backup;
 return state;
}
