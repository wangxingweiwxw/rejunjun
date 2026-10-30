import * as THREE from './three.module.js';
import {mergeGeometries} from './BufferGeometryUtils.js';
let seed=9381;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
export function surfaceTexture(kind){
 const c=document.createElement('canvas');c.width=c.height=1024;const g=c.getContext('2d');
 const base=kind==='floor'?[84,89,84]:kind==='lower'?[63,79,76]:[133,134,121];
 const pixels=g.createImageData(1024,1024);
 for(let y=0;y<1024;y++)for(let x=0;x<1024;x++){const i=(y*1024+x)*4,noise=(rnd()-.5)*17+Math.sin(x*.013)*Math.cos(y*.021)*8;for(let k=0;k<3;k++)pixels.data[i+k]=base[k]+noise;pixels.data[i+3]=255;}
 g.putImageData(pixels,0,0);
 for(let i=0;i<190;i++){const x=rnd()*1024,y=rnd()*1024,r=20+rnd()*180;const q=g.createRadialGradient(x,y,0,x,y,r);q.addColorStop(0,'rgba(24,32,26,.13)');q.addColorStop(1,'rgba(20,25,20,0)');g.fillStyle=q;g.fillRect(x-r,y-r,r*2,r*2);}
 if(kind==='floor'){
  for(let y=0;y<1024;y+=256)for(let x=0;x<1024;x+=256){g.fillStyle='rgba(22,31,28,.8)';g.fillRect(x,y,3,256);g.fillRect(x,y,256,3);g.strokeStyle='rgba(177,177,155,.17)';g.strokeRect(x+5,y+5,248,248);}
 }else{
  // Irregular exposed plaster, flaked paint and dark water marks.
  for(let i=0;i<60;i++){const x=rnd()*1024,y=rnd()*1024,r=5+rnd()*29;g.beginPath();for(let j=0;j<12;j++){const a=j/12*Math.PI*2,rr=r*(.4+rnd()*.7);g.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr);}g.closePath();g.fillStyle=kind==='lower'?'rgba(158,154,133,.27)':'rgba(80,84,72,.22)';g.fill();}
  for(let i=0;i<100;i++){g.fillStyle='rgba(23,36,29,.09)';g.fillRect(rnd()*1024,rnd()*1024,1+rnd()*7,20+rnd()*220);}
 }
 for(let i=0;i<30;i++){let x=rnd()*1024,y=rnd()*1024;g.beginPath();g.moveTo(x,y);for(let j=0;j<9;j++){x+=(rnd()-.5)*27;y+=rnd()*19;g.lineTo(x,y);}g.strokeStyle='rgba(20,28,24,.48)';g.lineWidth=.6+rnd();g.stroke();}
 const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.anisotropy=4;return tex;
}
export function addAtmosphere(scene,grid,tile){
 const groups=new Map(),materials={stone:new THREE.MeshStandardMaterial({color:0x6b7065,roughness:1}),paper:new THREE.MeshStandardMaterial({color:0xb1af94,roughness:1,side:THREE.DoubleSide}),green:new THREE.MeshStandardMaterial({color:0x3c513e,roughness:.95,side:THREE.DoubleSide})};
 function add(g,material){if(!groups.has(material))groups.set(material,[]);groups.get(material).push(g);}
 for(let z=2;z<grid.length-2;z++)for(let x=2;x<grid[0].length-2;x++){
  if(grid[z][x]!==0)continue;const edge=grid[z][x-1]===1||grid[z][x+1]===1;
  if(edge&&rnd()<.65)for(let i=0;i<3;i++){const g=new THREE.DodecahedronGeometry(.045+rnd()*.08,0);g.scale(1.4,.4,1);g.rotateY(rnd()*6.28);g.translate(x*tile+(rnd()-.5)*tile,.035,z*tile+(rnd()-.5)*tile);add(g,materials.stone);}
  if(rnd()<.06){const g=new THREE.PlaneGeometry(.18+rnd()*.2,.25+rnd()*.2,1,1);g.rotateX(-Math.PI/2);g.rotateY(rnd()*6.28);g.translate(x*tile+(rnd()-.5)*tile,.006,z*tile);add(g,materials.paper);}
  if(edge&&z%5===0){const side=grid[z][x-1]===1?-1:1,wx=x*tile+side*.77,wz=z*tile;for(let i=0;i<20;i++){const height=rnd()*2.7;const g=new THREE.SphereGeometry(1,5,3);g.scale(.035,.10,.008);g.rotateZ(-side*(.4+rnd()));g.rotateY(side*Math.PI/2);g.translate(wx-side*rnd()*.15,height,wz+Math.sin(height*5)*.12);add(g,materials.green);}}
 }
 const meshes=[];for(const [material,geos] of groups){const mesh=new THREE.Mesh(mergeGeometries(geos),material);mesh.name='environment-detail';geos.forEach(g=>g.dispose());scene.add(mesh);meshes.push(mesh);}
 const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d'),r=g.createRadialGradient(64,64,4,64,64,62);r.addColorStop(0,'rgba(0,0,0,.60)');r.addColorStop(.4,'rgba(0,0,0,.34)');r.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=r;g.fillRect(0,0,128,128);
 const shadow=new THREE.Mesh(new THREE.PlaneGeometry(.95,.95),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.008;scene.add(shadow);
 return {meshes,shadow};
}
