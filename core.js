// Adapted from upstream HoardDirector.cs and PointsAwarder.cs (MIT). See THIRD_PARTY_NOTICES.md.
export const TILE = 1.8, WIDTH = 25, HEIGHT = 29;
export const waveSize = round => 5 + (round - 1);
export const healthMultiplier = round => 1 + .005 * (round - 1);
export const killPoints = headshot => headshot ? 100 : 60;
export function createMap() {
  const grid = Array.from({length: HEIGHT}, () => Array(WIDTH).fill(1));
  const room = (x0,z0,x1,z1) => {for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)grid[z][x]=0;};
  room(10,1,14,27); room(2,3,8,12); room(16,3,22,12);
  room(2,16,8,25); room(16,16,22,25);
  const doors = [{x:9,z:8,cost:250,name:'档案室',open:false},{x:15,z:8,cost:400,name:'实验室',open:false},{x:9,z:21,cost:350,name:'医务室',open:false},{x:15,z:21,cost:500,name:'供电室',open:false}];
  doors.forEach(d=>grid[d.z][d.x]=2);
  return {grid,doors};
}
export function cell(v){return Math.floor(v/TILE+.5);}
export function blocked(grid,x,z){return !grid[z] || grid[z][x] !== 0;}
export function canOccupy(grid,x,z,r=.28){
  for(let cz=cell(z-r);cz<=cell(z+r);cz++)for(let cx=cell(x-r);cx<=cell(x+r);cx++){
    if(!blocked(grid,cx,cz))continue;
    const nx=Math.max(cx*TILE-TILE/2,Math.min(x,cx*TILE+TILE/2));
    const nz=Math.max(cz*TILE-TILE/2,Math.min(z,cz*TILE+TILE/2));
    if((x-nx)**2+(z-nz)**2 < r*r)return false;
  }
  return true;
}
export function moveBody(grid,p,dx,dz,r=.28){
  // Substeps prevent tunnelling during low frame rates and sprinting.
  const n=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.14));
  for(let i=0;i<n;i++){if(canOccupy(grid,p.x+dx/n,p.z,r))p.x+=dx/n;if(canOccupy(grid,p.x,p.z+dz/n,r))p.z+=dz/n;}
}
export function distanceField(grid,x,z){
  const field=Array.from({length:HEIGHT},()=>Array(WIDTH).fill(Infinity));
  if(blocked(grid,x,z))return field;
  const q=[[x,z]];field[z][x]=0;
  for(let i=0;i<q.length;i++){
    const [cx,cz]=q[i];
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=cx+dx,nz=cz+dz;
      if(!blocked(grid,nx,nz)&&field[nz][nx]===Infinity){field[nz][nx]=field[cz][cx]+1;q.push([nx,nz]);}
    }
  }
  return field;
}
export function nextStep(field,x,z){
  let best=field[z]?.[x]??Infinity, result=null;
  for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){
    const score=field[z+dz]?.[x+dx]??Infinity;
    if(score<best){best=score;result={x:(x+dx)*TILE,z:(z+dz)*TILE};}
  }
  return result;
}
export function reloadAmmo(w){const n=Math.min(w.mag-w.ammo,w.reserve);w.ammo+=n;w.reserve-=n;return n;}
