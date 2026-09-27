import * as THREE from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {clone as cloneSkeleton} from './vendor/SkeletonUtils.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';
import {TILE,WIDTH,HEIGHT,createMap,cell,blocked,canOccupy,moveBody,distanceField,nextStep,waveSize,healthMultiplier,killPoints,reloadAmmo} from './core.js';

const $=id=>document.getElementById(id), clamp=THREE.MathUtils.clamp;
const touch=matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0;
document.body.classList.toggle('touch',touch);
const settings={quality:touch?'low':'high',sensitivity:1,brightness:1.2,assist:true,sound:true};
try{Object.assign(settings,JSON.parse(localStorage.getItem('quarantine-settings')||'{}'));}catch{}
const scene=new THREE.Scene();scene.background=new THREE.Color(0x111c1c);scene.fog=new THREE.FogExp2(0x101c1a,.024);
const camera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,.055,100);camera.rotation.order='YXZ';scene.add(camera);
let renderer;
try{renderer=new THREE.WebGLRenderer({antialias:!touch,powerPreference:'high-performance'});}catch(e){$('fatal').hidden=false;$('fatal').textContent='无法启动 3D 图形。请使用支持 WebGL 的 Chrome、Edge 或 Safari，并开启硬件加速。';throw e;}
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.setSize(innerWidth,innerHeight);$('world').appendChild(renderer.domElement);
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();pause();$('fatal').hidden=false;$('fatal').textContent='图形连接已中断，请刷新页面后选择“流畅”画质。';});
const ambient=new THREE.HemisphereLight(0xc1d8c7,0x25312a,1.15);scene.add(ambient);
const keyLight=new THREE.DirectionalLight(0xa9c6b7,.45);keyLight.position.set(2,9,4);scene.add(keyLight);
const flashlight=new THREE.SpotLight(0xf3edcf,32,31,.5,.65,1.25);flashlight.position.set(-.24,.08,-.35);camera.add(flashlight);camera.add(flashlight.target);flashlight.target.position.set(0,0,-15);
const muzzleLight=new THREE.PointLight(0xffd28b,0,5,1.5);camera.add(muzzleLight);muzzleLight.position.set(.23,-.15,-.6);
const {grid,doors}=createMap();const walls=[], staticBatches=new Map(), interactables=[], enemies=[], corpses=[], pickups=[], effects=[];
const modelCache={}, lights=[];
const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.86,...extra});
const metal=mat(0x354342,{roughness:.54,metalness:.65}), dark=mat(0x192a28), ivory=mat(0x818b7a), red=mat(0x77382d), acid=mat(0xacbb76);
function box(w,h,d,x,y,z,material,staticMesh=true){
  const geometry=new THREE.BoxGeometry(w,h,d);geometry.translate(x,y,z);
  if(staticMesh){if(!staticBatches.has(material))staticBatches.set(material,[]);staticBatches.get(material).push(geometry);return;}
  const m=new THREE.Mesh(geometry,material);scene.add(m);return m;
}
let seed=7219;function random(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
function surface(kind){
  const c=document.createElement('canvas');c.width=c.height=512;const g=c.getContext('2d');
  g.fillStyle=kind==='floor'?'#555e56':kind==='lower'?'#3c5953':'#9d9f8c';g.fillRect(0,0,512,512);
  for(let i=0;i<19000;i++){const v=random(),s=random()*3+.3;g.fillStyle=`rgba(${v>.5?'230,222,197':'12,26,21'},${random()*.12})`;g.fillRect(random()*512,random()*512,s,s*2);}
  for(let i=0;i<140;i++){const x=random()*512,y=random()*512,r=random()*50+8;const q=g.createRadialGradient(x,y,0,x,y,r);q.addColorStop(0,`rgba(15,24,18,${random()*.16})`);q.addColorStop(1,'rgba(15,24,18,0)');g.fillStyle=q;g.fillRect(x-r,y-r,r*2,r*2);}
  if(kind==='floor'){g.strokeStyle='#283c35';g.lineWidth=3;for(let i=0;i<=512;i+=128){g.beginPath();g.moveTo(i,0);g.lineTo(i,512);g.moveTo(0,i);g.lineTo(512,i);g.stroke();}g.strokeStyle='#a6a88f33';g.lineWidth=1;for(let i=3;i<512;i+=128){g.beginPath();g.moveTo(i,0);g.lineTo(i,512);g.stroke();}}
  else {for(let i=0;i<18;i++){let x=random()*512,y=random()*512;g.beginPath();g.moveTo(x,y);for(let k=0;k<7;k++){x+=(random()-.5)*20;y+=random()*13;g.lineTo(x,y);}g.strokeStyle='#223c3430';g.lineWidth=.8;g.stroke();}for(let i=0;i<40;i++){g.fillStyle='#112d2011';g.fillRect(random()*512,random()*512,random()*5,random()*130);}}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t;
}
function sign(text,sub,x,y,z,w=2.5,angle=0,color='#d5dcc4'){
  const c=document.createElement('canvas');c.width=768;c.height=192;const g=c.getContext('2d');g.fillStyle='#152b27';g.fillRect(0,0,768,192);g.strokeStyle='#b8c6a7';g.lineWidth=3;g.strokeRect(9,9,750,174);g.fillStyle=color;g.font='bold 57px Arial,"Microsoft YaHei"';g.textAlign='center';g.fillText(text,384,85);g.fillStyle='#91a89a';g.font='24px Arial';g.fillText(sub,384,141);const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,w/4),new THREE.MeshBasicMaterial({map:texture}));m.position.set(x,y,z);m.rotation.y=angle;scene.add(m);return m;
}
function fixture(x,z,color=0xb2d2ba){box(2,.13,.35,x,3.65,z,metal);box(1.7,.035,.2,x,3.57,z,new THREE.MeshBasicMaterial({color}));}
function buildWorld(){
  const wallMat=mat(0xbfc5ac,{map:surface('wall')}),lowerMat=mat(0xb3c6b7,{map:surface('lower')});
  const floorTex=surface('floor');floorTex.repeat.set(WIDTH/4,HEIGHT/4);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(WIDTH*TILE,HEIGHT*TILE),mat(0xa2aaa0,{map:floorTex,roughness:.61,metalness:.1}));floor.rotation.x=-Math.PI/2;floor.position.set((WIDTH-1)*TILE/2,-.015,(HEIGHT-1)*TILE/2);scene.add(floor);
  box(WIDTH*TILE,.2,HEIGHT*TILE,(WIDTH-1)*TILE/2,3.9,(HEIGHT-1)*TILE/2,mat(0x454e45));
  const wallPositions=[];
  for(let z=0;z<HEIGHT;z++)for(let x=0;x<WIDTH;x++){
    if(grid[z][x]!==1)continue;
    if(![[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>grid[z+dz]?.[x+dx]===0||grid[z+dz]?.[x+dx]===2))continue;
    wallPositions.push([x*TILE,z*TILE]);box(TILE,2.5,TILE,x*TILE,2.6,z*TILE,wallMat);box(TILE,1.3,TILE,x*TILE,.65,z*TILE,lowerMat);box(TILE+.025,.055,TILE+.025,x*TILE,1.31,z*TILE,metal);box(TILE+.025,.14,TILE+.025,x*TILE,.07,z*TILE,dark);
  }
  // Shared invisible wall instances provide accurate occlusion for hit scans.
  const wc=new THREE.InstancedMesh(new THREE.BoxGeometry(TILE,3.85,TILE),new THREE.MeshBasicMaterial({visible:false}),wallPositions.length);
  const matrix=new THREE.Matrix4();wallPositions.forEach(([x,z],i)=>wc.setMatrixAt(i,matrix.makeTranslation(x,1.925,z)));scene.add(wc);walls.push(wc);
  for(let z=3;z<28;z+=4){fixture(12*TILE,z*TILE);box(.085,.085,5.9,10.1*TILE,3.3,z*TILE,metal);box(.12,.12,5.9,10.3*TILE,3.48,z*TILE,red);for(const x of [9.57,14.43])box(.055,.06,4.9,x*TILE,1.05,z*TILE,ivory);}
  const lampPoints=[[12,25,0xe5c18b,22],[12,15,0xa5d2c2,23],[12,5,0xaccdc2,24],[5,8,0xb3d1b1,20],[19,8,0x9ab9d4,19],[5,21,0xe0ad80,18],[19,21,0xdca566,20]];
  for(const [x,z,c,intensity] of lampPoints){const l=new THREE.PointLight(c,intensity,16,1.7);l.position.set(x*TILE,3.25,z*TILE);scene.add(l);lights.push(l);if(x!==12)fixture(x*TILE,z*TILE,c);}
  // Bulkhead ribs give the central hallway depth and a readable silhouette.
  for(const z of [4,12,19,26]){box(9,.22,.26,12*TILE,3.47,z*TILE,metal);for(const x of [9.58,14.42])box(.17,3.5,.3,x*TILE,1.75,z*TILE,metal);}
  sign('B3 / 隔离病区','QUARANTINE  •  AUTHORIZED PERSONNEL ONLY',12*TILE,2.9,18.94*TILE,3.7);
  sign('↑  紧急出口','EMERGENCY EXIT / NORTH',12*TILE,3,3.92*TILE,3.2);
  sign('撤离通道','EVACUATION ACCESS',12*TILE,2.6,.51*TILE,4.8,0,'#bbd69c');
  box(4.7,2.8,.1,12*TILE,1.4,.54*TILE,metal);box(.025,2.4,.03,12*TILE,1.4,.61*TILE,acid);
  for(const d of doors){
    const group=new THREE.Group(),m=new THREE.Mesh(new THREE.BoxGeometry(.24,2.9,TILE*.95),metal.clone());m.material.color.setHex(0x52685e);group.add(m);group.position.set(d.x*TILE,1.45,d.z*TILE);scene.add(group);d.mesh=m;d.group=group;walls.push(m);
    box(.4,.4,TILE,d.x*TILE,3.28,d.z*TILE,metal);
    const face=d.x<12?Math.PI/2:-Math.PI/2;sign(d.name,`ACCESS / ${String(doors.indexOf(d)+1).padStart(2,'0')}`,d.x*TILE+(d.x<12?.17:-.17),2.5,d.z*TILE,1.35,face);
    const panel=new THREE.Mesh(new THREE.BoxGeometry(.29,.25,.18),new THREE.MeshBasicMaterial({color:0xc58b58}));panel.position.set(d.x*TILE,1.3,d.z*TILE+.64);scene.add(panel);d.panel=panel;
    interactables.push({kind:'door',x:d.x*TILE,z:d.z*TILE,data:d});
  }
  // Archive shelves, ward beds, scientific benches and generator banks.
  for(const z of [4,7,10]){box(.6,2.6,2.4,2.8*TILE,1.3,z*TILE,metal);for(let y=.4;y<2.5;y+=.6){box(.8,.045,2.4,2.8*TILE,y,z*TILE,ivory);for(let k=0;k<4;k++)box(.55,.35,.38,2.8*TILE,y+.2,z*TILE-.9+k*.55,k%2?dark:ivory);}}
  for(const z of [17.5,21,24]){box(1.05,.13,2.1,4*TILE,.67,z*TILE,metal);box(1,.18,2,4*TILE,.83,z*TILE,ivory);box(.8,.17,.4,4*TILE,.99,z*TILE-.7,mat(0xa6b1a0));for(const dx of [-.43,.43])box(.055,.7,2.1,4*TILE+dx,.6,z*TILE,metal);}
  for(const z of [4,6,10]){box(2.5,.12,.85,20*TILE,1,z*TILE,ivory);box(2.4,.9,.65,20*TILE,.45,z*TILE,metal);box(.75,.65,.5,20*TILE,1.39,z*TILE,dark);box(.55,.4,.02,20*TILE,1.43,z*TILE+.26,new THREE.MeshBasicMaterial({color:0x476e60}));}
  for(const z of [17,19,23,25]){box(1.1,2.6,1.15,21.5*TILE,1.3,z*TILE,metal);for(let k=0;k<9;k++)box(.82,.04,.025,21.5*TILE,.5+k*.18,z*TILE+.59,dark);}
  // Corridor clutter stays out of the central navigation lane.
  for(const [x,z]of [[10.5,12],[13.6,20],[10.5,23],[13.7,4]]){box(.75,.72,.8,x*TILE,.36,z*TILE,mat(0x4c4d3b));box(.8,.05,.85,x*TILE,.72,z*TILE,metal);}
  sign('保持安静','SILENCE SAVES LIVES',14.47*TILE,2.15,23*TILE,1.7,-Math.PI/2);
  sign('封锁 / LOCKDOWN','DO NOT LEAVE THE DESIGNATED ZONE',9.53*TILE,2.4,16*TILE,2,Math.PI/2,'#cdb992');
  createTerminal('fuse',5*TILE,7*TILE,'保险丝','ARCHIVE / POWER CELL',0xc8d28c);
  createTerminal('power',18.2*TILE,21*TILE,'应急供电','EMERGENCY POWER',0xd6a25c);
  createTerminal('gun',19*TILE,7*TILE,'AR-18 步枪','ARMORY / 800 PTS',0x86b4b3);
  createTerminal('shotgun',5*TILE,23*TILE,'M870 霰弹枪','ARMORY / 600 PTS',0xabbc87);
  interactables.push({kind:'exit',x:12*TILE,z:1.4*TILE});
  for(const [material,geometries] of staticBatches){const geometry=mergeGeometries(geometries);const mesh=new THREE.Mesh(geometry,material);scene.add(mesh);geometries.forEach(g=>g.dispose());}staticBatches.clear();
}
function createTerminal(kind,x,z,title,subtitle,color){
  box(1.35,1,.65,x,.5,z,metal);const m=new THREE.Mesh(new THREE.BoxGeometry(.65,.2,.4),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.25}));m.position.set(x,1.15,z);scene.add(m);sign(title,subtitle,x,1.8,z+.38,2);interactables.push({kind,x,z,mesh:m});
}
buildWorld();
const player={x:12*TILE,z:25*TILE,yaw:0,pitch:0,hp:100,stamina:100};
const weaponSpecs=[{name:'M9 / 手枪',asset:'pistol_1',mag:12,reserve:72,interval:.27,damage:36,pellets:1,reload:1.25,label:'9 × 19 MM'},{name:'M870 / 霰弹枪',asset:'shotgun_1',mag:6,reserve:30,interval:.86,damage:27,pellets:7,reload:2,label:'12 GAUGE'},{name:'AR-18 / 突击步枪',asset:'assault_rifle_1',mag:30,reserve:150,interval:.105,damage:29,pellets:1,reload:1.7,label:'5.56 × 45 MM'}];
let weapons,weaponIndex=0,gun,gunModel,flashMesh;
const gunGroup=new THREE.Group();camera.add(gunGroup);gunGroup.position.set(.23,-.25,-.37);
const weaponLight=new THREE.PointLight(0xd9dbc4,.045,2,1);weaponLight.position.set(.25,.05,.1);camera.add(weaponLight);
const gloveMat=mat(0x25302b),sleeveMat=mat(0x46524a);
function installGun(){
  gunGroup.clear();const source=modelCache[weapons[weaponIndex].asset];gunModel=source.scene.clone(true);gunModel.scale.setScalar(1.1);gunGroup.add(gunModel);
  const hand=new THREE.Mesh(new THREE.CapsuleGeometry(.034,.085,4,8),gloveMat);hand.position.set(.012,-.09,.04);hand.rotation.x=-.22;gunGroup.add(hand);
  const arm=new THREE.Mesh(new THREE.CylinderGeometry(.052,.068,.35,8),sleeveMat);arm.position.set(.035,-.23,.14);arm.rotation.x=-.8;gunGroup.add(arm);
  if(weaponIndex>0){const support=hand.clone();support.position.set(-.02,-.02,-.24);support.rotation.z=Math.PI/2;gunGroup.add(support);}
  flashMesh=new THREE.Mesh(new THREE.ConeGeometry(.06,.19,5),new THREE.MeshBasicMaterial({color:0xffdfaa,transparent:true,opacity:.9,depthWrite:false}));flashMesh.rotation.x=-Math.PI/2;flashMesh.position.set(0,.045,weaponIndex===0?-.39:-.7);flashMesh.visible=false;gunGroup.add(flashMesh);
}
const state={mode:'menu',round:0,pending:0,spawnTimer:0,breakTime:4,kills:0,headshots:0,points:200,time:0,meds:1,fuse:false,power:false,complete:false};
let cooldown=0,reloadRemaining=0,recoil=0,damageFlash=0,toastTime=0,bannerTime=0,hitTime=0,stepTime=0,fieldTimer=0,field,nearest=null,wasLocked=false;
const input={keys:new Set(),joyX:0,joyY:0,fire:false,aim:false,sprint:false};
let audioCtx,audioMaster,ambience;
function startAudio(){
  if(!audioCtx){audioCtx=new (window.AudioContext||window.webkitAudioContext)();audioMaster=audioCtx.createGain();audioMaster.gain.value=.28;audioMaster.connect(audioCtx.destination);
    const buffer=audioCtx.createBuffer(1,audioCtx.sampleRate*4,audioCtx.sampleRate),a=buffer.getChannelData(0);let n=0;for(let i=0;i<a.length;i++){n=(n+(Math.random()*2-1)*.018)/1.02;a[i]=n;}
    ambience=audioCtx.createBufferSource();ambience.buffer=buffer;ambience.loop=true;const low=audioCtx.createBiquadFilter();low.type='lowpass';low.frequency.value=170;const gain=audioCtx.createGain();gain.gain.value=.3;ambience.connect(low).connect(gain).connect(audioMaster);ambience.start();}
  audioMaster.gain.value=settings.sound?.28:0;audioCtx.resume().catch(()=>{});
}
function sound(kind){if(!audioCtx||!settings.sound||state.mode!=='playing')return;const t=audioCtx.currentTime;
  const data={shot:[.2,90,.8],step:[.07,120,.13],hit:[.16,160,.25],reload:[.08,850,.1],pickup:[.25,640,.17],hurt:[.22,62,.4],growl:[.65,55,.22]}[kind]||[.1,200,.1];
  const [duration,freq,volume]=data,g=audioCtx.createGain();g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);g.connect(audioMaster);
  if(kind==='shot'||kind==='step'||kind==='reload'){const b=audioCtx.createBuffer(1,Math.ceil(audioCtx.sampleRate*duration),audioCtx.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;const s=audioCtx.createBufferSource();s.buffer=b;const f=audioCtx.createBiquadFilter();f.type='lowpass';f.frequency.value=kind==='shot'?1800:900;s.connect(f).connect(g);s.start(t);s.stop(t+duration);s.onended=()=>{s.disconnect();f.disconnect();g.disconnect();};}
  else {const o=audioCtx.createOscillator();o.type=kind==='pickup'?'sine':'triangle';o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(kind==='pickup'?1100:freq*.5,t+duration);o.connect(g);o.start(t);o.stop(t+duration);o.onended=()=>{o.disconnect();g.disconnect();};}
}
function toast(text){$('toast').textContent=text;toastTime=2.5;}
function banner(text){$('waveBanner').textContent=text;bannerTime=2.8;}
function resetInput(){input.keys.clear();input.joyX=input.joyY=0;input.fire=input.aim=input.sprint=false;joyPointer=lookPointer=firePointer=null;$('stick').style.transform='translate(-50%,-50%)';$('aimBtn').classList.remove('active');$('sprintBtn').classList.remove('active');}
function startGame(){
  for(const e of [...enemies,...corpses])disposeEnemy(e);enemies.length=corpses.length=0;
  for(const p of pickups)scene.remove(p.mesh);pickups.length=0;for(const e of effects)disposeEffect(e);effects.length=0;
  Object.assign(state,{mode:'playing',round:0,pending:0,spawnTimer:0,breakTime:5,kills:0,headshots:0,points:200,time:0,meds:1,fuse:false,power:false,complete:false});
  Object.assign(player,{x:12*TILE,z:25*TILE,yaw:0,pitch:0,hp:100,stamina:100});
  cooldown=reloadRemaining=recoil=damageFlash=stepTime=bannerTime=hitTime=0;fieldTimer=0;nearest=null;resetInput();flashlight.visible=true;$('flashBtn').classList.add('active');$('waveBanner').style.opacity=0;$('hitmark').style.opacity=0;$('damage').style.opacity=0;
  weapons=weaponSpecs.map((w,i)=>({...w,ammo:w.mag,owned:i===0}));weaponIndex=0;installGun();gunGroup.visible=true;
  for(const d of doors){d.open=false;grid[d.z][d.x]=2;d.group.position.y=1.45;d.mesh.visible=true;d.panel.material.color.setHex(0xc58b58);}
  for(const i of interactables)if(i.mesh)i.mesh.visible=true;
  for(const [x,z,type]of [[11,23,'ammo'],[5,9,'ammo'],[19,10,'ammo'],[5,18,'med'],[19,24,'ammo']])spawnPickup(x*TILE,z*TILE,type);
  $('menu').hidden=$('pauseScreen').hidden=$('endScreen').hidden=$('settings').hidden=true;$('hud').hidden=false;document.body.classList.add('playing');
  startAudio();lockPointer();toast('左摇杆移动，右侧滑动瞄准 · 找到档案室');updateHUD();
}
function pause(){if(state.mode!=='playing')return;state.mode='paused';resetInput();$('pauseScreen').hidden=false;document.exitPointerLock?.();audioCtx?.suspend();}
function resume(){if(state.mode!=='paused')return;state.mode='playing';$('pauseScreen').hidden=true;startAudio();lockPointer();}
function finish(won){state.mode=won?'won':'dead';resetInput();document.exitPointerLock?.();audioCtx?.suspend();$('endScreen').hidden=false;$('endTitle').textContent=won?'成功撤离':'行动终止';$('endTag').textContent=won?'SIGNAL RESTORED':'SIGNAL LOST';$('endText').textContent=won?'救援通道已打开。天亮之前，你离开了研究所。':'研究所重新归于寂静。下一次，留意弹药与身后的脚步。';$('endStats').textContent=`感染潮 ${state.round} / 5　　击杀 ${state.kills}\n爆头 ${state.headshots}　　生存 ${Math.floor(state.time/60)}分${Math.floor(state.time%60)}秒`;}
function lockPointer(force=false){if(!touch||force){try{const p=renderer.domElement.requestPointerLock();p?.catch(()=>{});}catch{}}}
function reload(){if(state.mode!=='playing'||reloadRemaining>0)return;const w=weapons[weaponIndex];if(w.ammo===w.mag)return;if(!w.reserve){toast('备用弹药不足 · 寻找补给箱');return;}reloadRemaining=w.reload;sound('reload');}
function switchWeapon(){if(state.mode!=='playing')return;reloadRemaining=0;for(let i=1;i<=weapons.length;i++){const n=(weaponIndex+i)%weapons.length;if(weapons[n].owned){weaponIndex=n;break;}}installGun();sound('reload');}
function heal(){if(state.mode!=='playing')return;if(player.hp>=100){toast('生命体征正常');return;}if(state.meds<=0){toast('没有医疗包');return;}state.meds--;player.hp=Math.min(100,player.hp+55);sound('pickup');toast('已使用医疗包 · 生命恢复');}
const raycaster=new THREE.Raycaster(),vec=new THREE.Vector3(),rayEnd=new THREE.Vector3(),hitPoint=new THREE.Vector3();
function occlusionDistance(origin,dir){raycaster.set(origin,dir);raycaster.far=65;const hits=raycaster.intersectObjects(walls.filter(m=>m.visible),false);return hits[0]?.distance??65;}
function clearSight(x,z){const delta=new THREE.Vector3(x-player.x,0,z-player.z),distance=delta.length();return occlusionDistance(new THREE.Vector3(player.x,1.3,player.z),delta.normalize())>distance-.2;}
function shoot(){
  if(state.mode!=='playing'||cooldown>0||reloadRemaining>0)return;
  const w=weapons[weaponIndex];if(!w.ammo){reload();if(!w.reserve&&cooldown<=0){toast('没有弹药 · 击杀奖励和补给箱可补充弹药');cooldown=.8;}return;}
  w.ammo--;cooldown=w.interval;recoil=.075;flashMesh.visible=true;muzzleLight.intensity=8;sound('shot');
  camera.getWorldDirection(vec);const direction=vec.clone();
  if(touch&&settings.assist){let best=.995,target=null;for(const e of enemies){const d=new THREE.Vector3(e.x,1.35,e.z).sub(camera.position).normalize(),dot=d.dot(direction);if(dot>best&&clearSight(e.x,e.z)){best=dot;target=d;}}if(target)direction.lerp(target,.55).normalize();}
  let landed=false,critical=false;
  for(let p=0;p<w.pellets;p++){
    const dir=direction.clone();if(w.pellets>1)dir.add(new THREE.Vector3((Math.random()-.5)*.11,(Math.random()-.5)*.09,(Math.random()-.5)*.11)).normalize();
    const wallDist=occlusionDistance(camera.position,dir);raycaster.set(camera.position,dir);let nearestHit=null,hitDistance=wallDist,headshot=false;
    for(const e of enemies){for(const [y,r,head]of [[1.64,.235,true],[1,.43,false],[.5,.3,false]]){
      const sphere=new THREE.Sphere(new THREE.Vector3(e.x,y,e.z),r);const h=raycaster.ray.intersectSphere(sphere,hitPoint);
      if(h){const d=camera.position.distanceTo(h);if(d<hitDistance){hitDistance=d;nearestHit=e;headshot=head;}}
    }}
    rayEnd.copy(camera.position).addScaledVector(dir,hitDistance);
    if(nearestHit){landed=true;critical||=headshot;nearestHit.hp-=w.damage*(headshot?2.8:1);nearestHit.stagger=.2;impact(rayEnd,headshot?0xcbaa77:0x883e32);if(nearestHit.hp<=0)killEnemy(nearestHit,headshot);}
    else if(wallDist<65)impact(rayEnd,0xc5b994);
  }
  if(landed){hitTime=.14;$('hitmark').style.color=critical?'#e2ae79':'#d6e3b6';sound('hit');}
  player.pitch=clamp(player.pitch+.01,-1.15,1.15);
}
const impactGeometry=new THREE.SphereGeometry(.027,4,3),impactMaterials=new Map();
function impact(point,color){if(effects.length>30)return;if(!impactMaterials.has(color))impactMaterials.set(color,new THREE.MeshBasicMaterial({color}));for(let k=0;k<3;k++){const m=new THREE.Mesh(impactGeometry,impactMaterials.get(color));m.position.copy(point);scene.add(m);effects.push({mesh:m,life:.22,velocity:new THREE.Vector3((Math.random()-.5)*2,Math.random()*2,(Math.random()-.5)*2)});}}
function disposeEffect(e){scene.remove(e.mesh);}
function createEnemy(x,z){
  const model=cloneSkeleton(modelCache.zombie.scene);model.traverse(o=>{if(o.isMesh){o.visible=o.name.endsWith(settings.quality==='high'?'LOD_1':'LOD_2')&&!o.name.includes('Neck_Stump');o.frustumCulled=false;o.castShadow=false;}});
  const root=new THREE.Group();root.add(model);root.position.set(x,0,z);scene.add(root);
  const mixer=new THREE.AnimationMixer(model),actions={};for(const a of modelCache.zombie.animations)actions[a.name]=mixer.clipAction(a);
  const e={root,model,mixer,actions,action:null,x,z,hp:100*healthMultiplier(state.round),speed:.66+state.round*.055,attack:1,stagger:0,life:0,groan:4+Math.random()*8};playEnemy(e,'walk_1_loop');enemies.push(e);return e;
}
function playEnemy(e,name){if(e.action===name)return;e.actions[e.action]?.fadeOut(.15);const a=e.actions[name];if(!a)return;a.reset().fadeIn(.15);if(name==='death_1'){a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;}a.play();e.action=name;}
function disposeEnemy(e){scene.remove(e.root);e.mixer.stopAllAction();e.mixer.uncacheRoot(e.model);const skeletons=new Set();e.model.traverse(o=>{if(o.isSkinnedMesh)skeletons.add(o.skeleton);});for(const skeleton of skeletons)skeleton.dispose();}
function killEnemy(e,head){const i=enemies.indexOf(e);if(i<0)return;enemies.splice(i,1);state.kills++;if(head)state.headshots++;state.points+=killPoints(head);e.life=2.5;playEnemy(e,'death_1');corpses.push(e);if(corpses.length>4)disposeEnemy(corpses.shift());
  if(Math.random()<.4)spawnPickup(e.x,e.z,Math.random()<.78?'ammo':'med');
}
const pickupGeo=new THREE.BoxGeometry(.4,.25,.3),pickupMats={ammo:mat(0xb2c682,{emissive:0xa8ba6b,emissiveIntensity:.25}),med:mat(0xd6ba9c,{emissive:0xb0886b,emissiveIntensity:.2})};
function spawnPickup(x,z,type){if(pickups.length>22){scene.remove(pickups.shift().mesh);}const m=new THREE.Mesh(pickupGeo,pickupMats[type]);m.position.set(x,.28,z);scene.add(m);pickups.push({mesh:m,x,z,type});}
function spawnWaveEnemy(){
  field=distanceField(grid,cell(player.x),cell(player.z));const options=[];
  for(let z=2;z<HEIGHT-2;z++)for(let x=2;x<WIDTH-2;x++){if(grid[z][x]!==0||!Number.isFinite(field[z][x]))continue;const d=Math.hypot(x*TILE-player.x,z*TILE-player.z);if(d>12&&d<32)options.push([x,z]);}
  if(!options.length)return false;const [x,z]=options[Math.floor(Math.random()*options.length)];createEnemy(x*TILE,z*TILE);return true;
}
function updateDirector(dt){
  if(state.complete)return;
  if(state.pending>0){state.spawnTimer-=dt;if(state.spawnTimer<=0&&enemies.length<10){if(spawnWaveEnemy())state.pending--;state.spawnTimer=2;}}
  if(state.pending===0&&enemies.length===0){
    if(state.round===5){state.complete=true;banner('感染潮已清除');toast('恢复供电后，前往北端出口');return;}
    if(state.breakTime===null){state.breakTime=10;state.points+=100;for(const w of weapons)if(w.owned)w.reserve+=w.mag*2;player.hp=Math.min(100,player.hp+15);toast('本波清除 · 积分 +100 · 弹药与生命补充');}
    state.breakTime-=dt;if(state.breakTime<=0){state.round++;state.pending=waveSize(state.round);state.spawnTimer=.5;state.breakTime=null;banner(`第 ${String(state.round).padStart(2,'0')} 波 / 感染者来袭`);}
  }
}
function updateEnemies(dt){
  fieldTimer-=dt;if(fieldTimer<=0){field=distanceField(grid,cell(player.x),cell(player.z));fieldTimer=.5;}
  for(const e of enemies){
    const distance=Math.hypot(player.x-e.x,player.z-e.z);e.stagger=Math.max(0,e.stagger-dt);e.groan-=dt;e.attack-=dt;
    if(e.groan<0){if(distance<10)sound('growl');e.groan=6+Math.random()*7;}
    const visible=distance<10&&clearSight(e.x,e.z);
    if(distance<1.15&&visible){playEnemy(e,'attack_player_1');if(e.attack<=0){e.attack=1.3;player.hp=Math.max(0,player.hp-12);damageFlash=.65;sound('hurt');if(touch&&navigator.vibrate)navigator.vibrate(45);if(!player.hp){finish(false);return;}}}
    else {playEnemy(e,'walk_1_loop');let target=visible?player:nextStep(field,cell(e.x),cell(e.z));
      if(target&&e.stagger<=0){let dx=target.x-e.x,dz=target.z-e.z;const l=Math.hypot(dx,dz);if(l>.05){dx/=l;dz/=l;moveBody(grid,e,dx*e.speed*dt,dz*e.speed*dt,.27);}}
    }
    e.root.position.set(e.x,0,e.z);e.root.rotation.y=Math.atan2(player.x-e.x,player.z-e.z);e.mixer.update(dt);
  }
  for(let i=corpses.length-1;i>=0;i--){const e=corpses[i];e.mixer.update(dt);e.life-=dt;if(e.life<0){disposeEnemy(e);corpses.splice(i,1);}}
}
function interactionLabel(i){switch(i.kind){case'door':return i.data.open?null:`解锁${i.data.name} · ${i.data.cost} 积分`;case'fuse':return state.fuse?null:'拾取应急保险丝';case'power':return state.power?null:state.fuse?'安装保险丝 · 恢复供电':'需要档案室的保险丝';case'gun':return weapons[2].owned?'补充步枪弹药 · 150 积分':'购买 AR-18 步枪 · 800 积分';case'shotgun':return weapons[1].owned?'补充霰弹枪弹药 · 100 积分':'购买 M870 霰弹枪 · 600 积分';case'exit':return !state.power?'撤离门禁离线 · 先恢复供电':!state.complete?'等待感染潮清除 · 五波防守':'开启通道 · 立即撤离';}}
function updateInteraction(){
  nearest=null;let distance=2.5;
  for(const i of interactables){const d=Math.hypot(i.x-player.x,i.z-player.z);if(d<distance&&interactionLabel(i)){if(i.kind!=='door'&&!clearSight(i.x,i.z))continue;distance=d;nearest=i;}}
  $('interact').hidden=!nearest;if(nearest)$('interact').textContent=(touch?'':'[E] ')+interactionLabel(nearest);
}
function interact(){
  if(state.mode!=='playing'||!nearest)return;const i=nearest;
  if(i.kind==='door'){const d=i.data;if(d.open)return;if(state.points<d.cost){toast(`积分不足，还需 ${d.cost-state.points}`);return;}state.points-=d.cost;d.open=true;grid[d.z][d.x]=0;d.mesh.visible=false;d.panel.material.color.setHex(0xaccc82);fieldTimer=0;toast(`${d.name}已解锁`);}
  if(i.kind==='fuse'){state.fuse=true;i.mesh.visible=false;toast('取得保险丝 · 前往供电室');}
  if(i.kind==='power'){if(!state.fuse){toast('先前往档案室，取得保险丝');return;}state.power=true;i.mesh.material.emissiveIntensity=1;toast('供电恢复 · 完成五波防守后前往北端出口');banner('应急供电 / ONLINE');}
  if(i.kind==='gun'||i.kind==='shotgun'){const idx=i.kind==='gun'?2:1,w=weapons[idx],cost=w.owned?(idx===2?150:100):(idx===2?800:600);if(state.points<cost){toast(`积分不足，还需 ${cost-state.points}`);return;}state.points-=cost;if(w.owned)w.reserve+=w.mag*4;else w.owned=true;weaponIndex=idx;reloadRemaining=0;installGun();toast(w.name+' · 已装备');}
  if(i.kind==='exit'){if(state.power&&state.complete)finish(true);else toast(interactionLabel(i));}
  sound('pickup');updateInteraction();
}
function updatePlayer(dt){
  let x=(input.keys.has('KeyD')?1:0)-(input.keys.has('KeyA')?1:0)+input.joyX,z=(input.keys.has('KeyS')?1:0)-(input.keys.has('KeyW')?1:0)+input.joyY;
  const amount=Math.min(1,Math.hypot(x,z));if(amount>.05){const len=Math.hypot(x,z);x/=Math.max(1,len);z/=Math.max(1,len);}else{x=z=0;}
  const running=(input.sprint||input.keys.has('ShiftLeft')||input.keys.has('ShiftRight'))&&amount>.2&&player.stamina>5&&!input.aim;
  player.stamina=clamp(player.stamina+dt*(running?-24:17),0,100);const speed=(running?4.5:input.aim?1.7:2.7)*dt;
  moveBody(grid,player,(x*Math.cos(player.yaw)+z*Math.sin(player.yaw))*speed,(-x*Math.sin(player.yaw)+z*Math.cos(player.yaw))*speed);
  if(amount>.2){stepTime-=dt;if(stepTime<=0){sound('step');stepTime=running?.32:.5;}}
  camera.position.set(player.x,1.66+(amount>.1?Math.sin(state.time*(running?13:9))*.024:0),player.z);camera.rotation.set(player.pitch,player.yaw,0,'YXZ');
  const fov=input.aim?50:running?75:70;camera.fov=THREE.MathUtils.lerp(camera.fov,fov,1-Math.exp(-dt*12));camera.updateProjectionMatrix();
  gunGroup.position.set(THREE.MathUtils.lerp(gunGroup.position.x,input.aim?.018:.21*Math.min(1,camera.aspect),1-Math.exp(-dt*14)),-.23+Math.sin(state.time*8)*.009*amount-(reloadRemaining>0?Math.sin((1-reloadRemaining/weapons[weaponIndex].reload)*Math.PI)*.24:0),-.48+recoil);
  gunGroup.rotation.x=recoil*1.3-(reloadRemaining>0?.25:0);gunGroup.rotation.z=reloadRemaining>0?-.3:0;
  if(input.fire)shoot();
}
function updateHUD(){
  $('waveValue').innerHTML=`${String(Math.max(1,state.round)).padStart(2,'0')} <i>/ 05</i>`;
  $('waveState').textContent=state.complete?'清除完成':state.breakTime!==null?`下一波 ${Math.ceil(state.breakTime)} 秒`:`剩余 ${enemies.length+state.pending} 个目标`;
  $('healthNumber').textContent=Math.ceil(player.hp);$('healthFill').style.width=player.hp+'%';$('healthFill').style.background=player.hp<30?'#ca6450':'#c4d08b';$('staminaFill').style.width=player.stamina+'%';$('pointsValue').textContent=state.points;
  const w=weapons?.[weaponIndex];if(w){$('weaponName').textContent=w.name;$('ammoValue').textContent=String(w.ammo).padStart(2,'0');$('reserveValue').textContent=w.reserve;$('reloadState').textContent=reloadRemaining>0?`换弹中 ${reloadRemaining.toFixed(1)}s`:w.label;$('ammoValue').style.color=w.ammo===0?'#ce7964':'#e6e5d7';}
  $('medCount').textContent=state.meds;$('objectiveText').textContent=!state.fuse?'进入档案室，取得保险丝':!state.power?'前往供电室，恢复供电':!state.complete?'守住防线，清除五波感染者':'前往北端出口，立即撤离';
  $('objectiveSub').textContent=!state.fuse?'北行左侧门禁 · 解锁需 250 积分':!state.power?'南段右侧门禁 · 解锁需 500 积分':!state.complete?'波次之间补充弹药 · 医疗包恢复生命':'沿主走廊北行 · 在出口处交互';
  $('crosshair').classList.toggle('aim',input.aim);
}
let joyPointer=null,lookPointer=null,firePointer=null,lookLast={x:0,y:0},fireLast={x:0,y:0},joyCenter={x:0,y:0};
function rotate(dx,dy){if(state.mode!=='playing')return;const sensitivity=.0025*Number(settings.sensitivity)*(input.aim?.6:1);player.yaw-=dx*sensitivity;player.pitch=clamp(player.pitch-dy*sensitivity,-1.15,1.15);}
const joystick=$('joystick');
joystick.addEventListener('pointerdown',e=>{if(state.mode!=='playing'||joyPointer!==null)return;e.preventDefault();joyPointer=e.pointerId;joystick.setPointerCapture(e.pointerId);const r=joystick.getBoundingClientRect();joyCenter={x:r.left+r.width/2,y:r.top+r.height/2};updateJoy(e);});
function updateJoy(e){const dx=e.clientX-joyCenter.x,dy=e.clientY-joyCenter.y,r=joystick.clientWidth*.36,l=Math.hypot(dx,dy),scale=l>r?r/l:1;input.joyX=l<7?0:dx*scale/r;input.joyY=l<7?0:dy*scale/r;$('stick').style.transform=`translate(calc(-50% + ${dx*scale}px),calc(-50% + ${dy*scale}px))`;}
joystick.addEventListener('pointermove',e=>{if(e.pointerId===joyPointer)updateJoy(e);});
function endJoy(e){if(e.pointerId!==joyPointer)return;joyPointer=null;input.joyX=input.joyY=0;$('stick').style.transform='translate(-50%,-50%)';}
for(const event of ['pointerup','pointercancel','lostpointercapture'])joystick.addEventListener(event,endJoy);
const canvas=renderer.domElement;
canvas.addEventListener('pointerdown',e=>{if(state.mode!=='playing')return;if(e.pointerType==='mouse'){if(document.pointerLockElement!==canvas){lockPointer(true);return;}if(e.button===0)input.fire=true;if(e.button===2)input.aim=true;}else if(e.clientX>innerWidth*.32&&lookPointer===null){lookPointer=e.pointerId;lookLast={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);}});
canvas.addEventListener('pointermove',e=>{if(e.pointerId===lookPointer){rotate(e.clientX-lookLast.x,e.clientY-lookLast.y);lookLast={x:e.clientX,y:e.clientY};}});
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{if(e.pointerId===lookPointer)lookPointer=null;if(e.pointerType==='mouse'){if(e.button===0)input.fire=false;if(e.button===2)input.aim=false;}});
document.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas)rotate(e.movementX,e.movementY);});
document.addEventListener('pointerup',e=>{if(e.pointerType==='mouse'){if(e.button===0)input.fire=false;if(e.button===2)input.aim=false;}});
document.addEventListener('pointerlockchange',()=>{const locked=document.pointerLockElement===canvas;if(wasLocked&&!locked&&state.mode==='playing')pause();wasLocked=locked;});
document.addEventListener('contextmenu',e=>e.preventDefault());
const fire=$('fireBtn');fire.addEventListener('pointerdown',e=>{if(state.mode!=='playing'||firePointer!==null)return;e.preventDefault();firePointer=e.pointerId;fireLast={x:e.clientX,y:e.clientY};fire.setPointerCapture(e.pointerId);input.fire=true;});
fire.addEventListener('pointermove',e=>{if(e.pointerId===firePointer){rotate(e.clientX-fireLast.x,e.clientY-fireLast.y);fireLast={x:e.clientX,y:e.clientY};}});
for(const event of ['pointerup','pointercancel','lostpointercapture'])fire.addEventListener(event,e=>{if(e.pointerId===firePointer){firePointer=null;input.fire=false;}});
document.addEventListener('keydown',e=>{if(e.target.matches('input,select'))return;if(e.code==='Escape'){if(!$('settings').hidden)closeSettings();else if(state.mode==='playing')pause();else if(state.mode==='paused')resume();return;}if(state.mode!=='playing')return;input.keys.add(e.code);if(e.repeat)return;const action={KeyR:reload,KeyQ:switchWeapon,KeyE:interact,KeyF:toggleFlash,KeyH:heal}[e.code];action?.();if(e.code==='Space')e.preventDefault();});
document.addEventListener('keyup',e=>input.keys.delete(e.code));
window.addEventListener('blur',()=>{resetInput();pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden){resetInput();pause();}});
function toggleFlash(){if(state.mode!=='playing')return;flashlight.visible=!flashlight.visible;$('flashBtn').classList.toggle('active',flashlight.visible);}
$('startBtn').onclick=startGame;$('againBtn').onclick=startGame;$('restartBtn').onclick=startGame;$('pauseBtn').onclick=pause;$('resumeBtn').onclick=resume;
$('reloadBtn').onclick=reload;$('switchBtn').onclick=switchWeapon;$('healBtn').onclick=heal;$('flashBtn').onclick=toggleFlash;$('interact').onclick=interact;
$('aimBtn').onclick=()=>{input.aim=!input.aim;$('aimBtn').classList.toggle('active',input.aim);};$('sprintBtn').onclick=()=>{input.sprint=!input.sprint;$('sprintBtn').classList.toggle('active',input.sprint);};
function openSettings(){if(state.mode==='playing')pause();$('settings').hidden=false;for(const k of Object.keys(settings)){if(!$(k))continue;if(typeof settings[k]==='boolean')$(k).checked=settings[k];else $(k).value=settings[k];}}
function applySettings(){renderer.setPixelRatio(Math.min(devicePixelRatio,settings.quality==='high'?1.6:1));renderer.setSize(innerWidth,innerHeight);renderer.toneMappingExposure=Number(settings.brightness);ambient.intensity=state.power?1.6:1.15;for(const e of [...enemies,...corpses])e.model.traverse(o=>{if(o.isMesh)o.visible=o.name.endsWith(settings.quality==='high'?'LOD_1':'LOD_2')&&!o.name.includes('Neck_Stump');});if(audioMaster)audioMaster.gain.value=settings.sound?.28:0;}
function closeSettings(){for(const k of Object.keys(settings)){if(!$(k))continue;settings[k]=typeof settings[k]==='boolean'?$(k).checked:$(k).value;}try{localStorage.setItem('quarantine-settings',JSON.stringify(settings));}catch{}applySettings();$('settings').hidden=true;}
$('settingsBtn').onclick=openSettings;$('pauseSettingsBtn').onclick=openSettings;$('closeSettingsBtn').onclick=closeSettings;
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);resetInput();});
const clock=new THREE.Clock();let hudTick=0,fpsAverage=60,fpsClock=0;
function animate(){requestAnimationFrame(animate);const raw=clock.getDelta(),dt=Math.min(raw,.05);
  if(state.mode==='playing'){
    state.time+=dt;cooldown=Math.max(0,cooldown-dt);recoil=Math.max(0,recoil-dt*.55);muzzleLight.intensity=Math.max(0,muzzleLight.intensity-dt*120);if(flashMesh)flashMesh.visible=recoil>.052;
    if(reloadRemaining>0){reloadRemaining-=dt;if(reloadRemaining<=0){reloadRemaining=0;reloadAmmo(weapons[weaponIndex]);sound('reload');}}
    updatePlayer(dt);updateEnemies(dt);if(state.mode==='playing'){updateDirector(dt);updateInteraction();}
    for(let i=pickups.length-1;i>=0;i--){const p=pickups[i];p.mesh.position.y=.32+Math.sin(state.time*2+i)*.055;p.mesh.rotation.y+=dt*.55;if(Math.hypot(player.x-p.x,player.z-p.z)<1.05&&clearSight(p.x,p.z)){if(p.type==='ammo'){for(const w of weapons)if(w.owned)w.reserve+=w.mag*2;toast('弹药补给 · 已补充已持有武器');}else{state.meds++;toast('获得医疗包 · 点“医疗”使用');}sound('pickup');scene.remove(p.mesh);pickups.splice(i,1);}}
    for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.life-=dt;e.mesh.position.addScaledVector(e.velocity,dt);e.velocity.y-=dt*5;if(e.life<=0){disposeEffect(e);effects.splice(i,1);}}
    toastTime=Math.max(0,toastTime-dt);bannerTime=Math.max(0,bannerTime-dt);hitTime=Math.max(0,hitTime-dt);damageFlash=Math.max(0,damageFlash-dt);
    $('toast').style.opacity=Math.min(1,toastTime*3);$('waveBanner').style.opacity=Math.min(1,bannerTime);$('hitmark').style.opacity=hitTime>0?1:0;$('damage').style.opacity=damageFlash+(player.hp<25?.12:0);
    ambient.intensity=state.power?1.6:1.15;hudTick-=dt;if(hudTick<=0){updateHUD();hudTick=.1;}
    fpsAverage=fpsAverage*.96+Math.min(120,1/Math.max(.001,raw))*.04;fpsClock+=dt;if(fpsClock>12&&fpsAverage<28&&renderer.getPixelRatio()>1){renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight);fpsClock=0;}
  }else if(state.mode==='menu'){camera.position.set(11.75*TILE,1.7,25.2*TILE);camera.rotation.set(-.025,-.13+Math.sin(performance.now()*.00012)*.05,0,'YXZ');gunGroup.visible=false;}
  scene.updateMatrixWorld();renderer.render(scene,camera);
}
applySettings();animate();
async function loadAssets(){
  const loader=new GLTFLoader(),textureLoader=new THREE.TextureLoader();
  const items=[['zombie','zombie.glb'],...weaponSpecs.map(w=>[w.asset,w.asset+'.glb'])];let loaded=0;
  await Promise.all(items.map(async([key,file])=>{modelCache[key]=await loader.loadAsync('./assets/'+file);$('loadLabel').textContent=`接入研究所 ${++loaded}/5`;}));
  const texture=await textureLoader.loadAsync('./assets/zombie-diffuse.jpg');texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=false;
  const skin=new THREE.MeshStandardMaterial({map:texture,roughness:.93});modelCache.zombie.scene.traverse(o=>{if(o.isMesh)o.material=skin;});
  $('startBtn').disabled=false;$('loadLabel').textContent='进入隔离区';
}
loadAssets().catch(e=>{$('loadLabel').textContent='资源加载失败';$('fatal').hidden=false;$('fatal').textContent='游戏资源未能载入。请通过“启动游戏.cmd”运行，并确认 assets 与 vendor 文件夹完整。详细信息：'+e.message;console.error(e);});

// Read-only diagnostic snapshot. Test-only controls require an explicit URL flag.
window.gameDiagnostics=()=>({mode:state.mode,round:state.round,pending:state.pending,enemies:enemies.length,kills:state.kills,points:state.points,hp:player.hp,ammo:weapons?.[weaponIndex].ammo,reserve:weapons?.[weaponIndex].reserve,reloading:reloadRemaining,position:{x:player.x,z:player.z},yaw:player.yaw,pitch:player.pitch,input:{fire:input.fire,x:input.joyX,y:input.joyY},fuse:state.fuse,power:state.power,complete:state.complete,models:Object.keys(modelCache),calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,fps:Math.round(fpsAverage),pixelRatio:renderer.getPixelRatio(),doors:doors.map(d=>({name:d.name,open:d.open}))});
if(new URLSearchParams(location.search).has('test'))window.gameTest={state,player,input,grid,doors,enemies,interactables,startGame,shoot,reload,interact,updateInteraction,createEnemy,killEnemy,updateDirector,updateEnemies,pause,resume,finish,canOccupy,moveBody,clearSight,setAim(yaw,pitch){player.yaw=yaw;player.pitch=pitch;camera.position.set(player.x,1.66,player.z);camera.rotation.set(pitch,yaw,0,'YXZ');scene.updateMatrixWorld();},get weapons(){return weapons;},get camera(){return camera;},get renderer(){return renderer;},get scene(){return scene;}};
