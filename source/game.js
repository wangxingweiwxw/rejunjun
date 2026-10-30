import * as THREE from './three.module.js';
import {packedModel} from './packed-models.js';
import {loadSettings,saveSettings} from './storage.js';
import {clone as cloneSkeleton} from './SkeletonUtils.js';
import {mergeGeometries} from './BufferGeometryUtils.js';
import {TILE,WIDTH,HEIGHT,createMap,cell,blocked,canOccupy,moveBody,distanceField,nextStep,waveSize,healthMultiplier,killPoints,reloadAmmo} from './core.js';

import {createBoy,loadBoyDetailTextures,setBoyDetailQuality} from './survivor-boy.js';
import {surfaceTexture,addAtmosphere} from './atmosphere.js';
import {installWallQuery} from './wall-query.js';

function showFallback(message){document.body.classList.add('fallback-mode');document.getElementById('fallback').hidden=false;document.getElementById('fallbackText').textContent=message;document.getElementById('hud').hidden=true;document.getElementById('menu').hidden=true;document.getElementById('pauseScreen').hidden=true;}
document.getElementById('fallbackHelp').addEventListener('click',()=>{const p=document.getElementById('fallbackInstructions');p.hidden=!p.hidden;});
function main(){
const $=id=>document.getElementById(id), clamp=THREE.MathUtils.clamp;
const touch=true;
document.body.classList.toggle('touch',touch);
const settings={quality:'medium',sensitivity:1,brightness:1.35,assist:true,sound:true};
const settingsReady=loadSettings().then(value=>{if(value&&typeof value==='object')Object.assign(settings,value);settings.quality=settings.quality==='low'?'low':'medium';applySettings();});
const scene=new THREE.Scene();scene.background=new THREE.Color(0x111c1c);scene.fog=new THREE.FogExp2(0x263332,.014);
const camera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,.055,100);camera.rotation.order='YXZ';scene.add(camera);
let renderer, rafId=0, stopped=false, contextLost=false, contextLossCount=0, restorePending=false;
function halt(message){stopped=true;cancelAnimationFrame(rafId);rafId=0;try{if(typeof pause==='function')pause();}catch(e){}showFallback(message);}
try{renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'low-power'});}catch(e){showFallback('当前设备无法创建 3D 场景，已显示轻量封面。');return;}
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.setPixelRatio(1);renderer.setSize(Math.min(innerWidth,960),Math.min(innerHeight,960));$('world').appendChild(renderer.domElement);
renderer.debug.onShaderError=()=>halt('图形渲染未能启动，已切换为轻量封面。');
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;contextLossCount++;cancelAnimationFrame(rafId);rafId=0;pause();showFallback('图形连接已暂停，等待恢复。');if(contextLossCount>1)stopped=true;});
renderer.domElement.addEventListener('webglcontextrestored',()=>{if(contextLossCount>1){halt('图形连接多次中断，已停止 3D 渲染。');return;}contextLost=false;restorePending=true;$('fallbackText').textContent='图形连接已恢复。点击下方按钮，以省电模式继续。';$('fallbackResume').hidden=false;});
$('fallbackResume').addEventListener('click',()=>{if(!restorePending||stopped)return;restorePending=false;$('fallback').hidden=true;document.body.classList.remove('fallback-mode');$('hud').hidden=state.mode==='menu';$('menu').hidden=state.mode!=='menu';$('pauseScreen').hidden=state.mode!=='paused';settings.quality='low';applySettings();clock.getDelta();rafId=requestAnimationFrame(animate);});
const ambient=new THREE.HemisphereLight(0xdce3e8,0x7a817e,2.5);scene.add(ambient);
const keyLight=new THREE.DirectionalLight(0xe0e5e2,1.05);keyLight.position.set(2,9,4);scene.add(keyLight);
const flashlight=new THREE.SpotLight(0xf3edcf,32,31,.5,.65,1.25);flashlight.position.set(-.24,.08,-.35);scene.add(flashlight);scene.add(flashlight.target);flashlight.target.position.set(0,0,-15);
const muzzleLight=new THREE.PointLight(0xffd28b,0,5,1.5);scene.add(muzzleLight);
const {grid,doors}=createMap();const walls=[], staticBatches=new Map(), interactables=[], enemies=[], corpses=[], pickups=[], effects=[];
const modelCache={}, lights=[], signs=[], optionalMeshes=[];
const materialCache=new Map();
const mat=(color,extra={})=>{if(Object.keys(extra).length)return new THREE.MeshStandardMaterial({color,roughness:.86,...extra});if(!materialCache.has(color))materialCache.set(color,new THREE.MeshStandardMaterial({color,roughness:.86}));return materialCache.get(color);};
const fixtureMaterial=new THREE.MeshBasicMaterial({color:0xb2d2ba});
const metal=mat(0x354342,{roughness:.54,metalness:.65}), dark=mat(0x192a28), ivory=mat(0x818b7a), red=mat(0x77382d), acid=mat(0xacbb76);
function box(w,h,d,x,y,z,material,staticMesh=true){
  const geometry=new THREE.BoxGeometry(w,h,d);geometry.translate(x,y,z);
  if(staticMesh){if(!staticBatches.has(material))staticBatches.set(material,[]);staticBatches.get(material).push(geometry);return;}
  const m=new THREE.Mesh(geometry,material);scene.add(m);return m;
}
let seed=7219;function random(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
function surface(kind){return surfaceTexture(kind);}
function sign(text,sub,x,y,z,w=2.5,angle=0,color='#d5dcc4'){
  const c=document.createElement('canvas');c.width=512;c.height=128;const g=c.getContext('2d');g.scale(2/3,2/3);g.fillStyle='#152b27';g.fillRect(0,0,768,192);g.strokeStyle='#b8c6a7';g.lineWidth=3;g.strokeRect(9,9,750,174);g.fillStyle=color;g.font='bold 57px Arial,"Microsoft YaHei"';g.textAlign='center';g.fillText(text,384,85);g.fillStyle='#91a89a';g.font='24px Arial';g.fillText(sub,384,141);const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,w/4),new THREE.MeshBasicMaterial({map:texture}));m.position.set(x,y,z);m.rotation.y=angle;scene.add(m);signs.push(m);return m;
}
function fixture(x,z,color=0xb2d2ba){box(2,.13,.35,x,3.65,z,metal);box(1.7,.035,.2,x,3.57,z,fixtureMaterial);}
function buildWorld(){
  const wallMat=mat(0xbfc5ac,{map:surface('wall')}),lowerMat=mat(0xb3c6b7,{map:surface('lower')});
  const floorTex=surface('floor');floorTex.repeat.set(WIDTH/4,HEIGHT/4);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(WIDTH*TILE,HEIGHT*TILE),mat(0xa2aaa0,{map:floorTex,bumpMap:floorTex,bumpScale:.025,roughness:.79,metalness:.04}));floor.rotation.x=-Math.PI/2;floor.position.set((WIDTH-1)*TILE/2,-.015,(HEIGHT-1)*TILE/2);scene.add(floor);
  box(WIDTH*TILE,.2,HEIGHT*TILE,(WIDTH-1)*TILE/2,3.9,(HEIGHT-1)*TILE/2,mat(0x454e45));
  const wallPositions=[];
  for(let z=0;z<HEIGHT;z++)for(let x=0;x<WIDTH;x++){
    if(grid[z][x]!==1)continue;
    if(![[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>grid[z+dz]?.[x+dx]===0||grid[z+dz]?.[x+dx]===2))continue;
    wallPositions.push([x*TILE,z*TILE]);box(TILE,2.5,TILE,x*TILE,2.6,z*TILE,wallMat);box(TILE,1.3,TILE,x*TILE,.65,z*TILE,lowerMat);box(TILE+.025,.055,TILE+.025,x*TILE,1.31,z*TILE,metal);box(TILE+.025,.14,TILE+.025,x*TILE,.07,z*TILE,dark);
  }
  // Shared invisible wall instances provide accurate occlusion for hit scans.
  const wc=new THREE.InstancedMesh(new THREE.BoxGeometry(TILE,3.85,TILE),new THREE.MeshBasicMaterial({visible:false}),wallPositions.length);
  const matrix=new THREE.Matrix4();wallPositions.forEach(([x,z],i)=>wc.setMatrixAt(i,matrix.makeTranslation(x,1.925,z)));installWallQuery(wc,wallPositions,TILE,3.85);scene.add(wc);walls.push(wc);
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
  for(const [material,geometries] of staticBatches){const geometry=mergeGeometries(geometries);const mesh=new THREE.Mesh(geometry,material);scene.add(mesh);if(material!==wallMat&&material!==lowerMat)optionalMeshes.push(mesh);geometries.forEach(g=>g.dispose());}staticBatches.clear();
}
function createTerminal(kind,x,z,title,subtitle,color){
  box(1.35,1,.65,x,.5,z,metal);const m=new THREE.Mesh(new THREE.BoxGeometry(.65,.2,.4),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.25}));m.position.set(x,1.15,z);scene.add(m);sign(title,subtitle,x,1.8,z+.38,2);interactables.push({kind,x,z,mesh:m});
}
buildWorld();
const boyHigh=createBoy(),boyLow=createBoy(true);window.REJ_SURVIVOR=null;let boy=boyHigh;scene.add(boyHigh.root,boyLow.root);boyLow.root.visible=false;camera.layers.enable(1);ambient.layers.enable(1);keyLight.layers.enable(1);for(const l of lights)l.layers.enable(1);
const atmosphere=addAtmosphere(scene,grid,TILE);optionalMeshes.push(...atmosphere.meshes);
const portraitLight=new THREE.PointLight(0xc8d6dc,5,5,1.7);portraitLight.position.set(12*TILE+.8,1.8,25*TILE+1.8);scene.add(portraitLight);
const player={x:12*TILE,z:25*TILE,yaw:0,pitch:0,hp:100,stamina:100};
const weaponSpecs=[{name:'M9 / 手枪',asset:'pistol_1',mag:12,reserve:72,interval:.27,damage:36,pellets:1,reload:1.25,label:'9 × 19 MM'},{name:'M870 / 霰弹枪',asset:'shotgun_1',mag:6,reserve:30,interval:.86,damage:27,pellets:7,reload:2,label:'12 GAUGE'},{name:'AR-18 / 突击步枪',asset:'assault_rifle_1',mag:30,reserve:150,interval:.105,damage:29,pellets:1,reload:1.7,label:'5.56 × 45 MM'}];
let weapons,weaponIndex=0,gun,gunModel,flashMesh;
const gunGroup=new THREE.Group();boy.weaponAnchor.add(gunGroup);gunGroup.position.set(0,0,0);
const weaponLight=new THREE.PointLight(0xd9dbc4,.045,2,1);weaponLight.position.set(.25,.05,.1);camera.add(weaponLight);
const gloveMat=mat(0x25302b),sleeveMat=mat(0x46524a);
function installGun(){
  const disposable=new Set();for(const child of gunGroup.children){if(child.isMesh){disposable.add(child.geometry);if(child===flashMesh)child.material.dispose();}}for(const geometry of disposable)geometry.dispose();gunGroup.clear();const source=modelCache[weapons[weaponIndex].asset];gunModel=source.scene.clone(true);gunModel.scale.setScalar(.78);gunGroup.add(gunModel);
  flashMesh=new THREE.Mesh(new THREE.ConeGeometry(.06,.19,5),new THREE.MeshBasicMaterial({color:0xffdfaa,transparent:true,opacity:.9,depthWrite:false}));flashMesh.rotation.x=-Math.PI/2;flashMesh.position.set(0,.045,weaponIndex===0?-.30:-.54);flashMesh.visible=false;gunGroup.add(flashMesh);
}
const state={mode:'menu',round:0,pending:0,spawnTimer:0,breakTime:4,kills:0,headshots:0,points:200,time:0,meds:1,fuse:false,power:false,complete:false};
let cooldown=0,reloadRemaining=0,recoil=0,damageFlash=0,toastTime=0,bannerTime=0,hitTime=0,stepTime=0,fieldTimer=0,field,nearest=null,wasLocked=false;
const input={keys:new Set(),joyX:0,joyY:0,fire:false,aim:false,sprint:false};
let audioCtx,audioMaster,ambience;
function startAudio(){
  if(!audioCtx){const AudioType=window.AudioContext||window.webkitAudioContext;if(typeof AudioType!=='function'){settings.sound=false;return;}try{audioCtx=new AudioType();}catch(e){settings.sound=false;return;}audioMaster=audioCtx.createGain();audioMaster.gain.value=.28;audioMaster.connect(audioCtx.destination);
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
const hurtFrom=new THREE.Vector3();let hurtTimer=0,combatTimer=0;
const combatLabel=$('combatFeedback'),hurtArrow=$('hurtDirection');
function showCombatFeedback(text,color){combatTimer=.55;combatLabel.textContent=text;combatLabel.style.color=color;combatLabel.style.opacity=1;combatLabel.style.transform='translate(-50%,0) scale(1.12)';}
function updateCombatFeedback(dt){combatTimer=Math.max(0,combatTimer-dt);hurtTimer=Math.max(0,hurtTimer-dt);combatLabel.style.opacity=Math.min(1,combatTimer*5);combatLabel.style.transform='translate(-50%,'+(-7*(1-combatTimer/.55))+'px) scale('+(1+.12*Math.pow(combatTimer/.55,3))+')';hurtArrow.style.opacity=Math.min(1,hurtTimer*3);if(hurtTimer>0){const angle=Math.atan2(hurtFrom.x-player.x,player.z-hurtFrom.z)+player.yaw;hurtArrow.style.transform='translate(-50%,-50%) rotate('+angle+'rad)';}}
function resetCombatFeedback(){hurtTimer=combatTimer=0;combatLabel.style.opacity=hurtArrow.style.opacity=0;}
function startGame(){resetCombatFeedback();cameraReady=false;
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
function pause(){if(state.mode!=='playing')return;state.mode='paused';resetInput();resetCombatFeedback();$('pauseScreen').hidden=false;audioCtx?.suspend();}
function resume(){if(state.mode!=='paused')return;state.mode='playing';$('pauseScreen').hidden=true;startAudio();lockPointer();}
function finish(won){resetCombatFeedback();state.mode=won?'won':'dead';resetInput();audioCtx?.suspend();$('endScreen').hidden=false;$('endTitle').textContent=won?'成功撤离':'行动终止';$('endTag').textContent=won?'SIGNAL RESTORED':'SIGNAL LOST';$('endText').textContent=won?'救援通道已打开。天亮之前，你离开了研究所。':'研究所重新归于寂静。下一次，留意弹药与身后的脚步。';$('endStats').textContent=`感染潮 ${state.round} / 5　　击杀 ${state.kills}\n爆头 ${state.headshots}　　生存 ${Math.floor(state.time/60)}分${Math.floor(state.time%60)}秒`;}
function lockPointer(){}
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
  const focusDistance=occlusionDistance(camera.position,direction);
  const focusPoint=camera.position.clone().addScaledVector(direction,focusDistance);
  raycaster.set(camera.position,direction);
  let focusNearest=focusDistance;
  for(const e of enemies)for(const [y,r] of [[1.64,.235],[1,.43],[.5,.3]]){
   const hit=raycaster.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(e.x,y,e.z),r),hitPoint);
   if(hit&&camera.position.distanceTo(hit)<focusNearest){focusNearest=camera.position.distanceTo(hit);focusPoint.copy(hit);}
  }
  const shotOrigin=muzzlePosition.clone();
  direction.subVectors(focusPoint,shotOrigin).normalize();
  const shoulderOrigin=new THREE.Vector3(player.x,1.12,player.z),barrelPath=shotOrigin.clone().sub(shoulderOrigin);
  if(occlusionDistance(shoulderOrigin,barrelPath.clone().normalize())<barrelPath.length()){impact(shoulderOrigin,0xb5b69c);return;}
  let landed=false,critical=false,defeated=false;
  for(let p=0;p<w.pellets;p++){
    const dir=direction.clone();if(w.pellets>1)dir.add(new THREE.Vector3((Math.random()-.5)*.11,(Math.random()-.5)*.09,(Math.random()-.5)*.11)).normalize();
    const wallDist=occlusionDistance(shotOrigin,dir);raycaster.set(shotOrigin,dir);let nearestHit=null,hitDistance=wallDist,headshot=false;
    for(const e of enemies){for(const [y,r,head]of [[1.64,.235,true],[1,.43,false],[.5,.3,false]]){
      const sphere=new THREE.Sphere(new THREE.Vector3(e.x,y,e.z),r);const h=raycaster.ray.intersectSphere(sphere,hitPoint);
      if(h){const d=shotOrigin.distanceTo(h);if(d<hitDistance){hitDistance=d;nearestHit=e;headshot=head;}}
    }}
    rayEnd.copy(shotOrigin).addScaledVector(dir,hitDistance);
    if(nearestHit){landed=true;critical||=headshot;nearestHit.hp-=w.damage*(headshot?2.8:1);nearestHit.stagger=.2;impact(rayEnd,headshot?0xcbaa77:0x883e32);if(nearestHit.hp<=0){defeated=true;killEnemy(nearestHit,headshot);}}
    else if(wallDist<65)impact(rayEnd,0xc5b994);
  }
  if(landed){hitTime=defeated?.28:critical?.22:.14;$('hitmark').style.color=defeated?'#f2d28f':critical?'#e2ae79':'#d6e3b6';showCombatFeedback(defeated?'击倒':critical?'爆头':'命中',defeated?'#f2d28f':critical?'#e2ae79':'#d6e3b6');sound('hit');}
  player.pitch=clamp(player.pitch+.01,-1.15,1.15);
}
const impactGeometry=new THREE.SphereGeometry(.027,4,3),impactMaterials=new Map();
function impact(point,color){if(settings.quality==='low'||effects.length>12)return;if(!impactMaterials.has(color))impactMaterials.set(color,new THREE.MeshBasicMaterial({color}));for(let k=0;k<2;k++){const m=new THREE.Mesh(impactGeometry,impactMaterials.get(color));m.position.copy(point);scene.add(m);effects.push({mesh:m,life:.22,velocity:new THREE.Vector3((Math.random()-.5)*2,Math.random()*2,(Math.random()-.5)*2)});}}
function disposeEffect(e){scene.remove(e.mesh);}
function createEnemy(x,z){
  const model=cloneSkeleton(modelCache.zombie.scene);model.traverse(o=>{if(o.isMesh){o.visible=o.name.endsWith('LOD_2')&&!o.name.includes('Neck_Stump');o.frustumCulled=false;o.castShadow=false;}});
  const root=new THREE.Group();root.add(model);root.position.set(x,0,z);scene.add(root);
  const mixer=new THREE.AnimationMixer(model),actions={};for(const a of modelCache.zombie.animations)actions[a.name]=mixer.clipAction(a);
  const e={root,model,mixer,actions,action:null,x,z,hp:100*healthMultiplier(state.round),speed:.66+state.round*.055,attack:1,stagger:0,life:0,groan:4+Math.random()*8};playEnemy(e,'walk_1_loop');enemies.push(e);return e;
}
function playEnemy(e,name){if(e.action===name)return;e.actions[e.action]?.fadeOut(.15);const a=e.actions[name];if(!a)return;a.reset().fadeIn(.15);if(name==='death_1'){a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;}a.play();e.action=name;}
function disposeEnemy(e){scene.remove(e.root);e.mixer.stopAllAction();e.mixer.uncacheRoot(e.model);const skeletons=new Set();e.model.traverse(o=>{if(o.isSkinnedMesh)skeletons.add(o.skeleton);});for(const skeleton of skeletons)skeleton.dispose();}
function killEnemy(e,head){const i=enemies.indexOf(e);if(i<0)return;enemies.splice(i,1);state.kills++;if(head)state.headshots++;state.points+=killPoints(head);e.life=2.5;e.root.visible=settings.quality!=='low';playEnemy(e,'death_1');corpses.push(e);if(corpses.length>(settings.quality==='low'?1:2))disposeEnemy(corpses.shift());
  if(Math.random()<.4)spawnPickup(e.x,e.z,Math.random()<.78?'ammo':'med');
}
const pickupGeo=new THREE.BoxGeometry(.4,.25,.3),pickupMats={ammo:mat(0xb2c682,{emissive:0xa8ba6b,emissiveIntensity:.25}),med:mat(0xd6ba9c,{emissive:0xb0886b,emissiveIntensity:.2})};
const pickupBatches={ammo:new THREE.InstancedMesh(pickupGeo,pickupMats.ammo,13),med:new THREE.InstancedMesh(pickupGeo,pickupMats.med,13)};
for(const batch of Object.values(pickupBatches)){batch.count=0;batch.frustumCulled=false;scene.add(batch);}
function updatePickupBatches(){const counts={ammo:0,med:0};for(const p of pickups){p.mesh.updateMatrix();pickupBatches[p.type].setMatrixAt(counts[p.type]++,p.mesh.matrix);}for(const type of ['ammo','med']){pickupBatches[type].count=counts[type];pickupBatches[type].instanceMatrix.needsUpdate=true;}}
function spawnPickup(x,z,type){if(pickups.length>12){scene.remove(pickups.shift().mesh);}const m=new THREE.Mesh(pickupGeo,pickupMats[type]);m.position.set(x,.28,z);pickups.push({mesh:m,x,z,type});}
function spawnWaveEnemy(){
  field=distanceField(grid,cell(player.x),cell(player.z));const options=[];
  for(let z=2;z<HEIGHT-2;z++)for(let x=2;x<WIDTH-2;x++){if(grid[z][x]!==0||!Number.isFinite(field[z][x]))continue;const d=Math.hypot(x*TILE-player.x,z*TILE-player.z);if(d>12&&d<32)options.push([x,z]);}
  if(!options.length)return false;const [x,z]=options[Math.floor(Math.random()*options.length)];createEnemy(x*TILE,z*TILE);return true;
}
function updateDirector(dt){
  if(state.complete)return;
  if(state.pending>0){state.spawnTimer-=dt;if(state.spawnTimer<=0&&enemies.length<(settings.quality==='low'?4:8)){if(spawnWaveEnemy())state.pending--;state.spawnTimer=2;}}
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
    if(distance<1.15&&visible){playEnemy(e,'attack_player_1');if(e.attack<=0){e.attack=1.3;player.hp=Math.max(0,player.hp-12);damageFlash=.65;hurtFrom.set(e.x,0,e.z);hurtTimer=.85;sound('hurt');if(!player.hp){finish(false);return;}}}
    else {playEnemy(e,'walk_1_loop');let target=visible?player:nextStep(field,cell(e.x),cell(e.z));
      if(target&&e.stagger<=0){let dx=target.x-e.x,dz=target.z-e.z;const l=Math.hypot(dx,dz);if(l>.05){dx/=l;dz/=l;moveBody(grid,e,dx*e.speed*dt,dz*e.speed*dt,.27);}}
    }
    e.root.visible=distance<(settings.quality==='low'?26:40);e.root.position.set(e.x,0,e.z);e.root.rotation.y=Math.atan2(player.x-e.x,player.z-e.z);if(e.root.visible){e.mixer.update(dt);const detail=settings.quality!=='low'&&distance<8&&enemies.indexOf(e)<3?'LOD_1':'LOD_2';e.model.traverse(o=>{if(o.isMesh)o.visible=o.name.endsWith(detail)&&!o.name.includes('Neck_Stump');});}
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
  updateThirdPerson(dt,amount,running);
  if(input.fire)shoot();
}
// The camera retracts along a swept volume before it can cross a wall or door.
const cameraPivot=new THREE.Vector3(),cameraOffset=new THREE.Vector3(),cameraTarget=new THREE.Vector3(),cameraDirection=new THREE.Vector3();
const cameraProbe=new THREE.Raycaster(),muzzlePosition=new THREE.Vector3();
let cameraReady=false,cameraDistance=2.6;
function selectBoy(){const next=settings.quality==='low'?boyLow:boyHigh;if(next!==boy){boy.root.visible=false;boy=next;boy.weaponAnchor.add(gunGroup);}}
function updateThirdPerson(dt,amount=0,running=false){
 selectBoy();portraitLight.intensity=0;atmosphere.shadow.position.set(player.x,.008,player.z);
 boy.root.visible=true;boy.root.position.set(player.x,0,player.z);boy.root.rotation.y=player.yaw;
 const reloadPose=reloadRemaining>0?Math.sin((1-reloadRemaining/weapons[weaponIndex].reload)*Math.PI):0;
 boy.update(state.time,amount,running,input.aim,player.pitch,reloadPose,recoil,false,weaponIndex);
 const portrait=camera.aspect<.85,shoulder=portrait?.36:input.aim?.46:.58;
 const distance=input.aim?1.38:portrait?2.65:2.4;
 cameraPivot.set(player.x,1.28,player.z);
 camera.rotation.set(player.pitch,player.yaw,0,'YXZ');
 cameraOffset.set(shoulder,.12,distance).applyQuaternion(camera.quaternion);
 cameraTarget.copy(cameraPivot).add(cameraOffset);cameraTarget.y=clamp(cameraTarget.y,.30,3.48);
 cameraDirection.subVectors(cameraTarget,cameraPivot);const desired=cameraDirection.length();cameraDirection.normalize();
 let allowed=desired;
 // Multiple near-plane probes prevent corner clipping, including closed doors.
 for(const dx of [-.17,0,.17])for(const dy of [-.13,.13]){
  cameraProbe.set(new THREE.Vector3(cameraPivot.x+Math.cos(player.yaw)*dx,cameraPivot.y+dy,cameraPivot.z-Math.sin(player.yaw)*dx),cameraDirection);cameraProbe.far=desired+.22;
  const hits=cameraProbe.intersectObjects(walls.filter(m=>m.visible),false);if(hits.length)allowed=Math.min(allowed,Math.max(.08,hits[0].distance-.24));
 }
 if(!cameraReady||allowed<cameraDistance)cameraDistance=allowed;else cameraDistance=THREE.MathUtils.lerp(cameraDistance,allowed,1-Math.exp(-dt*9));
 camera.position.copy(cameraPivot).addScaledVector(cameraDirection,cameraDistance);cameraReady=true;
 // Only conceal the body when the wall forces the near plane into it.
 boy.root.visible=cameraDistance>.47;
 const fov=input.aim?49:running?68:62;camera.fov=THREE.MathUtils.lerp(camera.fov,fov,1-Math.exp(-dt*10));camera.updateProjectionMatrix();
 boy.root.updateMatrixWorld(true);flashMesh.getWorldPosition(muzzlePosition);muzzleLight.position.copy(muzzlePosition);
 flashlight.position.set(.12,1.16,-.52).applyAxisAngle(new THREE.Vector3(0,1,0),player.yaw).add(new THREE.Vector3(player.x,0,player.z));camera.getWorldDirection(cameraDirection);flashlight.target.position.copy(flashlight.position).addScaledVector(cameraDirection,15);
 gunGroup.position.set(0,0,0);gunGroup.rotation.set(0,0,0);
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
joystick.addEventListener('pointerdown',e=>{if(state.mode!=='playing'||joyPointer!==null)return;e.preventDefault();joyPointer=e.pointerId;if(joystick.setPointerCapture)joystick.setPointerCapture(e.pointerId);const r=joystick.getBoundingClientRect();joyCenter={x:r.left+r.width/2,y:r.top+r.height/2};updateJoy(e);});
function updateJoy(e){const dx=e.clientX-joyCenter.x,dy=e.clientY-joyCenter.y,r=joystick.clientWidth*.36,l=Math.hypot(dx,dy),scale=l>r?r/l:1;input.joyX=l<7?0:dx*scale/r;input.joyY=l<7?0:dy*scale/r;$('stick').style.transform=`translate(calc(-50% + ${dx*scale}px),calc(-50% + ${dy*scale}px))`;}
joystick.addEventListener('pointermove',e=>{if(e.pointerId===joyPointer)updateJoy(e);});
function endJoy(e){if(e.pointerId!==joyPointer)return;joyPointer=null;input.joyX=input.joyY=0;$('stick').style.transform='translate(-50%,-50%)';}
for(const event of ['pointerup','pointercancel','lostpointercapture'])joystick.addEventListener(event,endJoy);
const canvas=renderer.domElement;
canvas.addEventListener('pointerdown',e=>{if(state.mode!=='playing')return;if(e.pointerType==='mouse'){if(e.button===0)input.fire=true;if(e.button===2)input.aim=true;}if(lookPointer===null&&(e.pointerType==='mouse'||e.clientX>innerWidth*.32)){lookPointer=e.pointerId;lookLast={x:e.clientX,y:e.clientY};if(canvas.setPointerCapture)canvas.setPointerCapture(e.pointerId);}});
canvas.addEventListener('pointermove',e=>{if(e.pointerId===lookPointer){rotate(e.clientX-lookLast.x,e.clientY-lookLast.y);lookLast={x:e.clientX,y:e.clientY};}});
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{if(e.pointerId===lookPointer)lookPointer=null;if(e.pointerType==='mouse'){input.fire=false;input.aim=false;}});
document.addEventListener('pointerup',e=>{if(e.pointerType==='mouse'){input.fire=false;input.aim=false;}});
document.addEventListener('contextmenu',e=>e.preventDefault());
const fire=$('fireBtn');fire.addEventListener('pointerdown',e=>{if(state.mode!=='playing'||firePointer!==null)return;e.preventDefault();firePointer=e.pointerId;fireLast={x:e.clientX,y:e.clientY};if(fire.setPointerCapture)fire.setPointerCapture(e.pointerId);input.fire=true;});
fire.addEventListener('pointermove',e=>{if(e.pointerId===firePointer){rotate(e.clientX-fireLast.x,e.clientY-fireLast.y);fireLast={x:e.clientX,y:e.clientY};}});
for(const event of ['pointerup','pointercancel','lostpointercapture'])fire.addEventListener(event,e=>{if(e.pointerId===firePointer){firePointer=null;input.fire=false;}});
document.addEventListener('keydown',e=>{if(e.target.matches('input,select'))return;if(e.code==='Escape'){if(!$('settings').hidden)closeSettings();else if(state.mode==='playing')pause();else if(state.mode==='paused')resume();return;}if(state.mode!=='playing')return;input.keys.add(e.code);if(e.repeat)return;const action={KeyR:reload,KeyQ:switchWeapon,KeyE:interact,KeyF:toggleFlash,KeyH:heal}[e.code];action?.();if(e.code==='Space')e.preventDefault();});
document.addEventListener('keyup',e=>input.keys.delete(e.code));
window.addEventListener('blur',()=>{resetInput();pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden){resetInput();pause();cancelAnimationFrame(rafId);rafId=0;audioCtx?.suspend();}else if(!stopped&&!contextLost){clock.getDelta();if(!rafId)rafId=requestAnimationFrame(animate);}});
function toggleFlash(){if(state.mode!=='playing')return;flashlight.visible=!flashlight.visible;$('flashBtn').classList.toggle('active',flashlight.visible);}
$('startBtn').addEventListener('click',startGame);$('againBtn').addEventListener('click',startGame);$('restartBtn').addEventListener('click',startGame);$('pauseBtn').addEventListener('click',pause);$('resumeBtn').addEventListener('click',resume);
$('reloadBtn').addEventListener('click',reload);$('switchBtn').addEventListener('click',switchWeapon);$('healBtn').addEventListener('click',heal);$('flashBtn').addEventListener('click',toggleFlash);$('interact').addEventListener('click',interact);
$('aimBtn').addEventListener('click',()=>{input.aim=!input.aim;$('aimBtn').classList.toggle('active',input.aim);});$('sprintBtn').addEventListener('click',()=>{input.sprint=!input.sprint;$('sprintBtn').classList.toggle('active',input.sprint);});
function openSettings(){if(state.mode==='playing')pause();$('settings').hidden=false;for(const k of Object.keys(settings)){if(!$(k))continue;if(typeof settings[k]==='boolean')$(k).checked=settings[k];else $(k).value=settings[k];}}
function sizeRenderer(){const maxPixels=settings.quality==='low'?1000000:2000000;const requested=settings.quality==='low'?1:Math.min(devicePixelRatio||1,1.5);const ratio=Math.min(requested,Math.sqrt(maxPixels/Math.max(1,innerWidth*innerHeight)));renderer.setPixelRatio(ratio);renderer.setSize(innerWidth,innerHeight);document.documentElement.style.setProperty('--app-height',innerHeight+'px');}
function applySettings(){selectBoy();setBoyDetailQuality(settings.quality==='low');if(modelCache.zombie&&modelCache.zombie.detailTexture){if(settings.quality==='low')modelCache.zombie.detailTexture.dispose();else modelCache.zombie.detailTexture.needsUpdate=true;}sizeRenderer();renderer.toneMappingExposure=Number(settings.brightness);ambient.intensity=state.power?3.0:2.5;for(const m of signs)m.visible=settings.quality!=='low';scene.fog.density=settings.quality==='low'?.022:.014;for(const e of [...enemies,...corpses])e.model.traverse(o=>{if(o.isMesh)o.visible=o.name.endsWith('LOD_2')&&!o.name.includes('Neck_Stump');});if(settings.quality==='low'){for(const e of effects)disposeEffect(e);effects.length=0;for(const e of corpses)e.root.visible=false;}if(audioMaster)audioMaster.gain.value=settings.sound?.28:0;}
function closeSettings(){for(const k of Object.keys(settings)){if(!$(k))continue;settings[k]=typeof settings[k]==='boolean'?$(k).checked:$(k).value;}saveSettings(settings).then(ok=>{if(!ok)toast('设置已在本次生效，未能保存到设备');});applySettings();$('settings').hidden=true;}
$('settingsBtn').addEventListener('click',openSettings);$('pauseSettingsBtn').addEventListener('click',openSettings);$('closeSettingsBtn').addEventListener('click',closeSettings);
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();sizeRenderer();resetInput();});
const clock=new THREE.Clock();let hudTick=0,fpsAverage=60,fpsClock=0;
let frameAccumulator=0;
function animate(){rafId=0;if(stopped||contextLost||document.hidden)return;rafId=requestAnimationFrame(animate);frameAccumulator+=clock.getDelta();if(frameAccumulator<1/30)return;const raw=frameAccumulator,dt=Math.min(raw,.05);frameAccumulator=0;
  if(state.mode==='playing'){
    updateCombatFeedback(dt);state.time+=dt;cooldown=Math.max(0,cooldown-dt);recoil=Math.max(0,recoil-dt*.55);muzzleLight.intensity=Math.max(0,muzzleLight.intensity-dt*120);if(flashMesh)flashMesh.visible=recoil>.052;
    if(reloadRemaining>0){reloadRemaining-=dt;if(reloadRemaining<=0){reloadRemaining=0;reloadAmmo(weapons[weaponIndex]);sound('reload');}}
    updatePlayer(dt);updateEnemies(dt);if(state.mode==='playing'){updateDirector(dt);updateInteraction();}
    for(let i=pickups.length-1;i>=0;i--){const p=pickups[i];p.mesh.position.y=.32+Math.sin(state.time*2+i)*.055;p.mesh.rotation.y+=dt*.55;if(Math.hypot(player.x-p.x,player.z-p.z)<1.05&&clearSight(p.x,p.z)){if(p.type==='ammo'){for(const w of weapons)if(w.owned)w.reserve+=w.mag*2;toast('弹药补给 · 已补充已持有武器');}else{state.meds++;toast('获得医疗包 · 点“医疗”使用');}sound('pickup');scene.remove(p.mesh);pickups.splice(i,1);}}
    updatePickupBatches();for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.life-=dt;e.mesh.position.addScaledVector(e.velocity,dt);e.velocity.y-=dt*5;if(e.life<=0){disposeEffect(e);effects.splice(i,1);}}
    toastTime=Math.max(0,toastTime-dt);bannerTime=Math.max(0,bannerTime-dt);hitTime=Math.max(0,hitTime-dt);damageFlash=Math.max(0,damageFlash-dt);
    $('toast').style.opacity=Math.min(1,toastTime*3);$('waveBanner').style.opacity=Math.min(1,bannerTime);$('hitmark').style.opacity=hitTime>0?1:0;$('damage').style.opacity=damageFlash+(player.hp<25?.12:0);
    ambient.intensity=state.power?3.0:2.5;hudTick-=dt;if(hudTick<=0){updateHUD();hudTick=.1;}
    fpsAverage=fpsAverage*.96+Math.min(120,1/Math.max(.001,raw))*.04;fpsClock+=raw;if(fpsClock>12){if(fpsAverage<26&&settings.quality!=='low'){settings.quality='low';applySettings();toast('已自动切换省电画质');}else if(fpsAverage<14&&settings.quality==='low'){halt('持续检测到画面卡顿，已暂停 3D 场景以保持操作响应。');}fpsClock=0;}
  }else if(state.mode==='menu'){selectBoy();boy.root.visible=true;boy.root.position.set(12*TILE,0,25*TILE);atmosphere.shadow.position.set(12*TILE,.008,25*TILE);boy.root.rotation.y=Math.PI-.27+Math.sin(performance.now()*.0002)*.1;boy.update(0,0,false,false,0,0,0,true);camera.position.set(12*TILE+.72,1.28,25*TILE+2.4);camera.lookAt(12*TILE-.52,.90,25*TILE);camera.fov=45;camera.updateProjectionMatrix();gunGroup.visible=false;}
  scene.updateMatrixWorld();enforceRenderBudget();if(stopped)return;try{renderer.render(scene,camera);}catch(error){halt("3D 场景暂时无法继续，已切换到轻量封面。");}
}
const drawBudget={calls:0,triangles:0};
function meshCost(mesh){if(!mesh.isMesh||!mesh.visible)return 0;const material=mesh.material;if(Array.isArray(material))return mesh.geometry.groups.filter(g=>material[g.materialIndex]&&material[g.materialIndex].visible).length;return material&&material.visible?1:0;}
function meshTriangles(mesh){const g=mesh.geometry;return ((g.index?g.index.count:g.attributes.position.count)/3)*(mesh.isInstancedMesh?mesh.count:1);}
function countDraws(mesh){const cost=meshCost(mesh);drawBudget.calls+=cost;if(cost)drawBudget.triangles+=meshTriangles(mesh);}
function enforceRenderBudget(){
 const low=settings.quality==='low',maxCalls=low?50:100,maxTriangles=low?50000:100000;
 for(const m of optionalMeshes)m.visible=true;

 drawBudget.calls=drawBudget.triangles=0;scene.traverseVisible(countDraws);
 if(drawBudget.triangles>maxTriangles){for(const e of [...enemies,...corpses])e.model.traverse(o=>{if(o.isMesh)o.visible=o.name.endsWith('LOD_2')&&!o.name.includes('Neck_Stump');});drawBudget.calls=drawBudget.triangles=0;scene.traverseVisible(countDraws);}
 if(drawBudget.triangles>maxTriangles||drawBudget.calls>maxCalls){for(const e of corpses){e.root.visible=false;drawBudget.calls=drawBudget.triangles=0;scene.traverseVisible(countDraws);if(drawBudget.triangles<=maxTriangles&&drawBudget.calls<=maxCalls)break;}}
 for(let i=optionalMeshes.length-1;i>=0&&(drawBudget.calls>maxCalls||drawBudget.triangles>maxTriangles);i--){const m=optionalMeshes[i];drawBudget.calls-=meshCost(m);drawBudget.triangles-=meshTriangles(m);m.visible=false;}
 if(drawBudget.calls>maxCalls||drawBudget.triangles>maxTriangles)halt('场景负载超出当前画质预算，已切换为轻量封面。');
}
applySettings();animate();
async function loadAssets(){
  await settingsReady;
  await loadBoyDetailTextures();
  const names=['zombie',...weaponSpecs.map(w=>w.asset)];let loaded=0;
  for(const key of names){modelCache[key]=packedModel(window.REJ_MODELS[key]);$('loadLabel').textContent=`接入研究所 ${++loaded}/5`;await new Promise(resolve=>setTimeout(resolve,0));}
  delete window.REJ_MODELS;
  const image=new Image();
  await new Promise((resolve,reject)=>{image.addEventListener('load',resolve);image.addEventListener('error',()=>reject(new Error('本地贴图读取失败')));image.src='./assets/zombie-diffuse.jpg';});
  const texture=new THREE.Texture(image);texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=false;texture.needsUpdate=true;
  const detailImage=new Image();await new Promise((resolve,reject)=>{detailImage.addEventListener('load',resolve);detailImage.addEventListener('error',()=>reject(new Error('高清纹理读取失败')));detailImage.src='./assets/zombie-detail.jpg';});
  const detailTexture=new THREE.Texture(detailImage);detailTexture.colorSpace=THREE.SRGBColorSpace;detailTexture.flipY=false;detailTexture.needsUpdate=true;
  modelCache.zombie.detailTexture=detailTexture;
  // Reuse each albedo map as a modest visibility floor; no extra lights or textures.
  const skin=new THREE.MeshStandardMaterial({map:texture,roughness:.93,emissiveMap:texture,emissive:0xffffff,emissiveIntensity:.22}),detailSkin=new THREE.MeshStandardMaterial({map:detailTexture,roughness:.91,emissiveMap:detailTexture,emissive:0xffffff,emissiveIntensity:.22});modelCache.zombie.scene.traverse(o=>{if(o.isMesh)o.material=o.name.endsWith('LOD_1')?detailSkin:skin;});
  const warm=Object.values(modelCache).map(model=>model.scene);warm.forEach(model=>scene.add(model));renderer.compile(scene,camera);warm.forEach(model=>scene.remove(model));
  $('startBtn').disabled=false;$('loadLabel').textContent='进入隔离区';
}
loadAssets().catch(e=>{$('loadLabel').textContent='资源加载失败';$('fatal').hidden=false;$('fatal').textContent='本地游戏资源未能载入，请重新打开小工具。详细信息：'+e.message;console.error(e);});

// Read-only diagnostic snapshot. Test-only controls require an explicit URL flag.
window.gameDiagnostics=()=>({mode:state.mode,round:state.round,pending:state.pending,enemies:enemies.length,kills:state.kills,points:state.points,hp:player.hp,ammo:weapons?.[weaponIndex].ammo,reserve:weapons?.[weaponIndex].reserve,reloading:reloadRemaining,position:{x:player.x,z:player.z},yaw:player.yaw,pitch:player.pitch,input:{fire:input.fire,x:input.joyX,y:input.joyY},fuse:state.fuse,power:state.power,complete:state.complete,models:Object.keys(modelCache),calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,fps:Math.round(fpsAverage),cameraMode:"over-shoulder",cameraPosition:camera.position.toArray(),cameraDistance,characterVisible:boy.root.visible,character:"MPFB child survivor / 53 bone skinning",pixelRatio:renderer.getPixelRatio(),quality:settings.quality,buffer:{width:renderer.domElement.width,height:renderer.domElement.height},doors:doors.map(d=>({name:d.name,open:d.open}))});

}
try{main();}catch(error){showFallback("场景未能初始化。你可以查看操作说明，稍后重新打开小工具。");console.error(error);}
