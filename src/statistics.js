const blank=()=>({actions:0,won:0,lost:0,points:0,errors:0,attack:0,kills:0,attackErrors:0,blocked:0,reception:0,receptionErrors:0,positiveReception:0,excellentReception:0,serve:0,serveErrors:0,aces:0,blockPoints:0,breakPoints:0,positiveActions:0,negativeActions:0,gp:0});
export const percent=(n,d)=>d?Math.round(n/d*100)+' %':'—';
export function statistics(state,set='all'){
 const indexed=state.events.map((e,i)=>({e,i})).filter(({e})=>set==='all'||e.set===Number(set));
 const events=indexed.map(({e})=>e);
 const total=blank(),players=state.roster.map(p=>({...p,...blank(),initialPosition:null}));
 const phases=['K1','K2'].map(name=>({name,...blank()})),rotations=Array.from({length:6},(_,i)=>({name:'R'+(i+1),...blank()}));
 let unforced=0,rotationErrors=0,netErrors=0,otherErrors=0,substitutions=0;
 const opening=set==='all'?{before:state.undo[0]}:indexed.find(({e})=>e.type!=='next')&&{before:state.undo[indexed.find(({e})=>e.type!=='next').i]};
 const initialLineup=opening?.before?.lineup||(set==='all'?state.undo[0]?.lineup||state.lineup:undefined);
 if(initialLineup)players.forEach(p=>{const i=initialLineup.indexOf(p.id);if(i>=0)p.initialPosition=i+1;});
 for(const {e} of indexed){
  if(e.type==='sub')substitutions++;
  if(!['point','action'].includes(e.type))continue;
  const won=Math.max(0,e.after[0]-e.before[0]),lost=Math.max(0,e.after[1]-e.before[1]);
  for(const group of [total,phases.find(p=>p.name===e.phase),rotations[e.rotation-1]].filter(Boolean)){group.won+=won;group.lost+=lost;group.actions+=e.type==='action'?1:0;}
  if(e.type==='point'&&e.category==='unforced-error'){unforced++;if(e.reason==='rotation')rotationErrors++;if(e.reason==='net')netErrors++;if(e.reason==='other')otherErrors++;}
  if(e.type!=='action')continue;
  const p=players.find(p=>p.id===e.player);if(!p)continue;
  p.actions++;p.points+=won;p.errors+=lost;
  if(e.phase==='K2'&&won)p.breakPoints++;
  if(['#','+'].includes(e.grade))p.positiveActions++;else if(['=','Blo','-'].includes(e.grade))p.negativeActions++;
  p.gp=p.points-p.errors;
  if(e.action==='Saque'){p.serve++;p.serveErrors+=lost;if(won&&e.grade==='#')p.aces++;}
  if(e.action==='Bloqueo'&&won)p.blockPoints+=1;
  if(e.action==='Ataque'){p.attack++;p.kills+=won;p.attackErrors+=e.grade==='='?1:0;if(e.grade==='Blo')p.blocked++;}
  if(e.action==='Recepción'){p.reception++;p.receptionErrors+=lost;p.positiveReception+=['#','+'].includes(e.grade)?1:0;p.excellentReception+=e.grade==='#'?1:0;}
 }
 return {total,players,phases,rotations,unforced,rotationErrors,netErrors,otherErrors,substitutions};
}
