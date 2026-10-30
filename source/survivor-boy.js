import * as THREE from './three.module.js';
import {mergeGeometries} from './BufferGeometryUtils.js';
// CC0 MPFB child surface and 53-bone weights. All asset conversion is offline.
const materialSets=[],textures=[],geometryCache=new WeakMap();
export async function loadBoyDetailTextures(){
 for(const name of ['boy-materials.jpg','boy-normal.png','boy-skin.jpg','boy-skin-normal.png']){
  const im=new Image();await new Promise((resolve,reject)=>{im.onload=resolve;im.onerror=()=>reject(new Error('角色材质加载失败'));im.src='./assets/'+name;});
  const t=new THREE.Texture(im);t.needsUpdate=true;t.wrapS=t.wrapT=THREE.RepeatWrapping;textures.push(t);
 }
 textures[0].colorSpace=textures[2].colorSpace=THREE.SRGBColorSpace;
 for(const s of materialSets)if(!s.low){for(const m of [s.cloth,s.gear]){m.map=textures[0];m.normalMap=textures[1];m.normalScale.set(.16,.16);m.needsUpdate=true;}s.skin.map=textures[2];s.skin.normalMap=textures[3];s.skin.normalScale.set(.045,.045);s.skin.needsUpdate=true;}
}
export function setBoyDetailQuality(low){for(const t of textures){if(low)t.dispose();else t.needsUpdate=true;}}
export function createBoy(low=false){
 let source=window.REJ_SURVIVOR;if(!source)throw new Error('角色数据未加载');
 const data={bones:source.bones,eyes:source.eyes,head:source.head,hairGuides:source.hairGuides};
 const root=new THREE.Group();root.name='MPFB-child-survivor';
 const bones=data.bones.map(d=>{const b=new THREE.Bone();b.name=d.name;return b;}),byName={},rest=[];
 data.bones.forEach((d,i)=>{const b=bones[i];byName[d.name]=b;const p=new THREE.Vector3().fromArray(d.p);rest[i]=p;b.position.copy(p);if(d.parent>=0){b.position.sub(new THREE.Vector3().fromArray(data.bones[d.parent].p));bones[d.parent].add(b);}else root.add(b);});
 root.updateMatrixWorld(true);const skeleton=new THREE.Skeleton(bones);skeleton.calculateInverses();
 const skin=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.68}),cloth=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.93}),hair=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.78});
 const materialSet={skin,cloth,low};materialSets.push(materialSet);const materials={skin,cloth,hair};
 for(const entry of source.tiers[low?'low':'high']){
  const part=entry||source.tiers.low[0];let g=geometryCache.get(part);
  if(!g){g=new THREE.BufferGeometry();for(const [name,array,size] of [['position',part.p,3],['normal',part.n,3],['uv',part.uv,2],['color',part.c,3],['skinWeight',part.w,4]])g.setAttribute(name,new THREE.Float32BufferAttribute(array,size));
  g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(part.j,4));g.setIndex(part.i);g.computeBoundingSphere();geometryCache.set(part,g);}
  const m=new THREE.SkinnedMesh(g,materials[part.kind]);m.name='survivor-'+part.kind;m.frustumCulled=false;m.layers.set(1);root.add(m);m.bind(skeleton,new THREE.Matrix4());m.normalizeSkinWeights();
 }
 const head=byName.head,torso=byName.spine_03;
 function paint(g,color){g=g.index?g.toNonIndexed():g;const c=new THREE.Color(color),a=new Float32Array(g.attributes.position.count*3);for(let i=0;i<a.length;i+=3){a[i]=c.r;a[i+1]=c.g;a[i+2]=c.b;}g.setAttribute('color',new THREE.Float32BufferAttribute(a,3));return g;}
 function oval(p,size,c){const g=new THREE.SphereGeometry(1,low?12:16,low?8:10);g.scale(...size);g.translate(...p);return paint(g,c);}
 function tube(points,r,c,n=16){return paint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),low?Math.max(4,n>>1):n,r,low?4:6,false),c);}
 function box(p,size,c){const g=new THREE.BoxGeometry(...size);g.translate(...p);return paint(g,c);}
 function pack(p,size,c){const g=new THREE.SphereGeometry(1,low?12:24,low?8:16),a=g.attributes.position;for(let i=0;i<a.count;i++){const round=v=>Math.sign(v)*Math.pow(Math.abs(v),.42);a.setXYZ(i,p[0]+round(a.getX(i))*size[0],p[1]+round(a.getY(i))*size[1],p[2]+round(a.getZ(i))*size[2]);}g.computeVertexNormals();return paint(g,c);}
 function merged(parent,parts,mat,name,origin){const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());if(origin)g.translate(-origin[0],-origin[1],-origin[2]);const m=new THREE.Mesh(g,mat);m.layers.set(1);m.name=name;parent.add(m);return m;}
 const eyeParts=[],details=[];
 for(const eye of data.eyes){
  eyeParts.push(oval(eye,[.0138,.0131,.0143],0xc9bfb0));
  eyeParts.push(oval([eye[0],eye[1],eye[2]-.0135],[.0060,.0060,.0012],0x30241d));
  eyeParts.push(oval([eye[0],eye[1],eye[2]-.0145],[.0026,.0026,.0006],0x121915));
  eyeParts.push(oval([eye[0]-.0018,eye[1]+.0023,eye[2]-.015],[.0009,.0009,.0003],0xcbd5cc));
  const s=Math.sign(eye[0]);details.push(tube([[eye[0]-s*.017,eye[1]+.020,eye[2]-.024],[eye[0],eye[1]+.022,eye[2]-.022],[eye[0]+s*.019,eye[1]+.018,eye[2]-.013]],.0015,0x282422,14));
  // Rounded navy frames match the reference; open lenses keep eyes visible.
  const rim=[];for(let i=0;i<=24;i++){const a=i/24*Math.PI*2;rim.push([eye[0]+.025*Math.sign(Math.cos(a))*Math.pow(Math.abs(Math.cos(a)),.65),eye[1]+.018*Math.sign(Math.sin(a))*Math.pow(Math.abs(Math.sin(a)),.75),eye[2]-.025]);}
  details.push(tube(rim,.0018,0x202d43,32));
  details.push(tube([[eye[0]+s*.025,eye[1]+.003,eye[2]-.025],[s*.071,eye[1]+.003,-.111],[s*.078,eye[1]-.002,-.048]],.0017,0x202d43,12));
 }
 const ec=data.eyes[0];details.push(tube([[-Math.abs(ec[0])+.025,ec[1]+.004,ec[2]-.025],[0,ec[1]+.008,ec[2]-.029],[Math.abs(ec[0])-.025,ec[1]+.004,ec[2]-.025]],.0017,0x202d43,10));
 merged(head,eyeParts,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.26}),'eyes',data.head);
 merged(head,details,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.7}),'brows-and-glasses',data.head);
 const locks=[];
 for(let j=0;j<(low?13:27);j++){
  const guide=data.hairGuides[low?j*2:j];const curve=new THREE.CatmullRomCurve3(guide.map(p=>new THREE.Vector3(...p)));
  const points=[],indices=[],N=low?10:18,R=low?4:6;
  for(let i=0;i<=N;i++){const t=i/N,p=curve.getPoint(t),tangent=curve.getTangent(t),side=new THREE.Vector3(1,0,0),normal=new THREE.Vector3().crossVectors(tangent,side).normalize(),w=(low?.0053:.0037)*Math.pow(Math.sin(Math.PI*(.06+t*.94)),.5)+.0001;for(let k=0;k<=R;k++){const angle=k/R*Math.PI;const q=p.clone().addScaledVector(side,Math.cos(angle)*w).addScaledVector(normal,Math.sin(angle)*w*.6);points.push(q.x,q.y,q.z);if(i<N&&k<R){const n=i*(R+1)+k;indices.push(n,n+1,n+R+1,n+1,n+R+2,n+R+1);}}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(points.length/3*2),2));g.setIndex(indices);g.computeVertexNormals();locks.push(paint(g,j%3===0?0x262524:0x1e1d1c));
 }
 merged(head,locks,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.8,side:THREE.DoubleSide}),'swept-short-hair',data.head);
 const attachments=[],tan=0x806647,edge=0xb19a73,dark=0x4f4536;
 attachments.push(pack([0,1.025,.107],[.12,.165,.070],tan));attachments.push(pack([0,1.145,.13],[.125,.047,.067],0x897253));attachments.push(pack([0,.97,.170],[.084,.065,.023],0x725d42));
 attachments.push(tube([[-.10,1.12,.16],[-.11,.93,.15],[0,.865,.13],[.11,.93,.15],[.10,1.12,.16]],.0024,edge,28));
 for(const s of [-1,1]){
  attachments.push(tube([[s*.095,1.18,.065],[s*.14,1.18,-.097],[s*.12,1.07,-.155],[s*.12,.93,-.132],[s*.105,.88,.062]],.013,0x695d45,24));
  attachments.push(tube([[s*.1,1.18,.065],[s*.146,1.18,-.107],[s*.126,1.07,-.166],[s*.126,.94,-.145]],.0015,edge,22));
  attachments.push(box([s*.12,1.00,-.16],[.026,.028,.005],dark));attachments.push(box([s*.12,1.00,-.164],[.016,.016,.004],0x9f9c83));
  attachments.push(tube([[s*.065,1.16,.19],[s*.065,1.07,.192]],.008,dark,6));attachments.push(box([s*.065,1.10,.199],[.023,.028,.005],0x3c4038));attachments.push(pack([s*.124,.97,.10],[.025,.07,.048],tan));
 }
 attachments.push(tube([[-.07,1.027,.195],[.07,1.027,.195]],.0025,0x353a33,10));
 if(!low)for(let i=0;i<24;i++)attachments.push(box([-.068+i*.006,1.027,.197],[.002,.004,.002],0xb3ad8f));
 attachments.push(tube([[-.07,1.224,-.015],[-.052,1.237,-.075],[0,1.20,-.103],[.052,1.237,-.075],[.07,1.224,-.015]],.012,0x526451,24));
 attachments.push(tube([[0,1.195,-.112],[0,1.08,-.156],[0,.94,-.157],[0,.83,-.146]],.002,0xaaa58a,28));
 for(const s of [-1,1]){
  attachments.push(pack([s*.057,1.058,-.153],[.031,.039,.004],0x53634f));attachments.push(pack([s*.057,1.085,-.160],[.033,.010,.003],0x63715b));
  attachments.push(oval([s*.057,1.083,-.164],[.002,.002,.001],0x827e65));
  attachments.push(tube([[s*.026,1.094,-.161],[s*.026,1.02,-.157],[s*.087,1.02,-.147]],.0008,0x9c9e80,18));
 }
 const gear=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94});materialSet.gear=gear;
 merged(torso,attachments,gear,'canvas-pack-collar-zip',data.bones.find(b=>b.name==='spine_03').p);
 const weaponAnchor=new THREE.Group();torso.add(weaponAnchor);
 const q1=new THREE.Quaternion(),q2=new THREE.Quaternion(),p1=new THREE.Vector3(),dir=new THREE.Vector3(),worldQ=new THREE.Quaternion(),gripQ=new THREE.Quaternion();
 const temp=new THREE.Vector3(),elbow=new THREE.Vector3(),pole=new THREE.Vector3(),target=new THREE.Vector3();
 function position(name){byName[name].getWorldPosition(temp);return root.worldToLocal(temp.clone());}
 function aimBone(name,childName,to){
  const b=byName[name],index=bones.indexOf(b),child=bones.indexOf(byName[childName]);dir.subVectors(child>=0?rest[child]:new THREE.Vector3().fromArray(data.bones[index].tail),rest[index]).normalize();const from=position(name);p1.subVectors(to,from).normalize();worldQ.setFromUnitVectors(dir,p1);
  root.getWorldQuaternion(q1);worldQ.premultiply(q1);b.parent.getWorldQuaternion(q2).invert();b.quaternion.copy(q2.multiply(worldQ));b.updateWorldMatrix(false,true);
 }
 function arm(side,handTarget,relaxed){
  const upper='upperarm_'+side,lower='lowerarm_'+side,hand='hand_'+side,s=side==='l'?1:-1;
  const a=position(upper),b=rest[bones.indexOf(byName[lower])],c=rest[bones.indexOf(byName[hand])],l1=b.distanceTo(rest[bones.indexOf(byName[upper])]),l2=c.distanceTo(b);
  const d=dir.subVectors(handTarget,a).length(),distance=Math.min(l1+l2-.003,Math.max(.04,d));dir.normalize();const along=(l1*l1-l2*l2+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-along*along));
  pole.set(s*.9,-1,.45);pole.addScaledVector(dir,-pole.dot(dir)).normalize();elbow.copy(a).addScaledVector(dir,along).addScaledVector(pole,height);
  aimBone(upper,lower,elbow.clone());aimBone(lower,hand,handTarget);
  if(!relaxed){
   aimBone(hand,'middle_01_'+side,handTarget.clone().add(new THREE.Vector3(s*.020,.045,-.005).applyQuaternion(gripQ)));
   const flexAxis=new THREE.Vector3().subVectors(rest[bones.indexOf(byName['index_01_'+side])],rest[bones.indexOf(byName['pinky_01_'+side])]).normalize();
   for(const finger of ['index','middle','ring','pinky'])for(let j=1;j<=3;j++){
    const angle=(j===1?.85:j===2?1.05:.65)*(finger==='index'?.65:1);
    byName[finger+'_0'+j+'_'+side].quaternion.setFromAxisAngle(flexAxis,s*angle);
   }
   byName['thumb_01_'+side].rotation.z=s*.25;
   byName['thumb_02_'+side].quaternion.setFromAxisAngle(flexAxis,s*.45);
  }
 }
 let previousTime=null,phase=0;
 function update(t,amount,running,aim,pitch,reload,recoil,relaxed=false,weapon=0){
  const dt=previousTime===null?0:Math.max(0,Math.min(.08,t-previousTime));previousTime=t;phase+=dt*(running?10.7:7.2)*Math.min(1,amount*1.4);
  for(let i=0;i<bones.length;i++){bones[i].quaternion.identity();const d=data.bones[i];bones[i].position.fromArray(d.p);if(d.parent>=0)bones[i].position.sub(rest[d.parent]);}
  const stride=(running?.60:.36)*amount,breath=Math.sin(t*1.8)*.003;byName.pelvis.position.y+=Math.cos(phase*2)*.008*amount+breath;
  byName.spine_01.rotation.x=(running?-.075:-.015)-pitch*.10;byName.spine_02.rotation.y=Math.sin(phase)*.035*amount;byName.spine_03.rotation.x=-pitch*.15;head.rotation.x=-pitch*.25;
  for(const side of ['l','r']){const sign=side==='l'?1:-1,wave=Math.sin(phase+sign*Math.PI/2);byName['thigh_'+side].rotation.x=wave*stride;byName['calf_'+side].rotation.x=Math.max(0,-wave)*.64*amount;byName['foot_'+side].rotation.x=-wave*stride*.35-Math.max(0,-wave)*.24*amount;}
  root.updateMatrixWorld(true);const chest=rest[bones.indexOf(torso)];weaponAnchor.position.set(.14,1.07-(running?.10:0)-reload*.10,-.36+recoil*.4).sub(chest);weaponAnchor.rotation.set(-pitch*.65+reload*.65+(running?.3:0),0,-reload*.25);
  weaponAnchor.updateWorldMatrix(true,true);root.getWorldQuaternion(q1).invert();weaponAnchor.getWorldQuaternion(gripQ);gripQ.premultiply(q1);
  for(const side of ['l','r']){const s=side==='l'?1:-1;if(relaxed)target.set(s*.20,.745,-.04);else {target.set(side==='l'?.012:-.035,-.085-(side==='r'?reload*.12:0),side==='l'?.035:weapon===0?.035:-.14);weaponAnchor.localToWorld(target);root.worldToLocal(target);}arm(side,target.clone(),relaxed);}
  root.updateMatrixWorld(true);skeleton.update();
 }
 source=null;update(0,0,false,false,0,0,0,true);return {root,torso,head,weaponAnchor,update,bones,skeleton};
}
