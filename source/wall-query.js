import {Matrix4,Vector3} from './three.module.js';

// Static axis-aligned wall instances only. Doors retain their mesh raycast.
// Callers need the nearest obstruction, not every triangle along the ray.
export function installWallQuery(mesh,positions,tile,height){
 const rows=new Map(),point=new Vector3(),nearestPoint=new Vector3(),matrix=new Matrix4();
 mesh.geometry.computeBoundingBox();
 let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
 positions.forEach(([x,z],instanceId)=>{const cx=Math.round(x/tile),cz=Math.round(z/tile);let row=rows.get(cz);if(!row){row=new Map();rows.set(cz,row);}mesh.getMatrixAt(instanceId,matrix);row.set(cx,{instanceId,box:mesh.geometry.boundingBox.clone().applyMatrix4(matrix)});minX=Math.min(minX,cx);maxX=Math.max(maxX,cx);minZ=Math.min(minZ,cz);maxZ=Math.max(maxZ,cz);});
 const original=mesh.raycast;
 mesh.raycast=function(raycaster,hits){
  const e=this.matrixWorld.elements;
  if(!Number.isFinite(raycaster.far)||e[0]!==1||e[5]!==1||e[10]!==1||e[1]||e[2]||e[4]||e[6]||e[8]||e[9]||e[12]||e[13]||e[14])return original.call(this,raycaster,hits);
  const ray=raycaster.ray,o=ray.origin,d=ray.direction,far=raycaster.far;
  const endX=o.x+d.x*far,endZ=o.z+d.z*far,epsilon=1e-5;
  const x0=Math.max(minX,Math.floor((Math.min(o.x,endX)-epsilon)/tile+.5)),x1=Math.min(maxX,Math.floor((Math.max(o.x,endX)+epsilon)/tile+.5));
  const z0=Math.max(minZ,Math.floor((Math.min(o.z,endZ)-epsilon)/tile+.5)),z1=Math.min(maxZ,Math.floor((Math.max(o.z,endZ)+epsilon)/tile+.5));
  let nearest=far,selected=null;
  for(let z=z0;z<=z1;z++){const row=rows.get(z);if(!row)continue;for(let x=x0;x<=x1;x++){const cell=row.get(x);if(!cell)continue;const b=cell.box;
   // Match the original front-sided boxes: rays starting inside see no exit face.
   if(o.x>b.min.x&&o.x<b.max.x&&o.y>b.min.y&&o.y<b.max.y&&o.z>b.min.z&&o.z<b.max.z)continue;
   if(!ray.intersectBox(b,point))continue;const distance=point.distanceTo(o);
   if(distance>=raycaster.near&&distance<=nearest){nearest=distance;selected=cell;nearestPoint.copy(point);}
  }}
  if(selected)hits.push({distance:nearest,point:nearestPoint.clone(),object:this,instanceId:selected.instanceId});
 };
}
