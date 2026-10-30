import * as THREE from './three.module.js';

const attributes={POSITION:'position',NORMAL:'normal',TEXCOORD_0:'uv',JOINTS_0:'skinIndex',WEIGHTS_0:'skinWeight'};
const arrays={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};
export function packedModel(data){
  const materials=data.materials.map(def=>{
    const p=def.pbrMetallicRoughness||{},factor=p.baseColorFactor||[1,1,1,1];
    return new THREE.MeshStandardMaterial({color:new THREE.Color().setRGB(factor[0],factor[1],factor[2]),roughness:p.roughnessFactor===undefined?.8:p.roughnessFactor,metalness:p.metallicFactor===undefined?0:p.metallicFactor,side:def.doubleSided?THREE.DoubleSide:THREE.FrontSide});
  });
  const skinMaterial=new THREE.MeshStandardMaterial({color:0xc2c7ac,roughness:.9});
  const joints=new Set();data.skins.forEach(s=>s.joints.forEach(j=>joints.add(j)));
  const skinned=[];
  const nodes=data.nodes.map((n,index)=>{
    const o=joints.has(index)?new THREE.Bone():new THREE.Group();o.name=n.name||('node_'+index);
    if(n.matrix)new THREE.Matrix4().fromArray(n.matrix).decompose(o.position,o.quaternion,o.scale);
    if(n.translation)o.position.fromArray(n.translation);if(n.rotation)o.quaternion.fromArray(n.rotation);if(n.scale)o.scale.fromArray(n.scale);
    if(n.mesh!==undefined){
      data.meshes[n.mesh].forEach((p,i)=>{
        const geometry=new THREE.BufferGeometry();
        Object.keys(p.attributes).forEach(key=>{const a=p.attributes[key];geometry.setAttribute(attributes[key],new THREE.BufferAttribute(new arrays[a.component](a.values),a.size,a.normalized));});
        if(p.indices)geometry.setIndex(new THREE.BufferAttribute(new arrays[p.indices.component](p.indices.values),1));
        geometry.computeBoundingSphere();
        const material=materials[p.material]||skinMaterial;
        const mesh=n.skin!==undefined?new THREE.SkinnedMesh(geometry,material):new THREE.Mesh(geometry,material);
        mesh.name=n.name||('mesh_'+index+'_'+i);mesh.frustumCulled=n.skin===undefined;o.add(mesh);
        if(n.skin!==undefined)skinned.push({mesh,skin:n.skin});
      });
    }
    return o;
  });
  data.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>nodes[i].add(nodes[c])));
  const scene=new THREE.Group();data.roots.forEach(i=>scene.add(nodes[i]));scene.updateMatrixWorld(true);
  const skeletons=data.skins.map(s=>new THREE.Skeleton(s.joints.map(i=>nodes[i]),s.joints.map((_,i)=>new THREE.Matrix4().fromArray(s.inverses,i*16))));
  skinned.forEach(o=>{o.mesh.bind(skeletons[o.skin],new THREE.Matrix4());o.mesh.normalizeSkinWeights();});
  const animations=data.clips.map(clip=>new THREE.AnimationClip(clip.name,-1,clip.tracks.map(t=>{
    const property={translation:'position',rotation:'quaternion',scale:'scale'}[t.path];
    const Type=t.path==='rotation'?THREE.QuaternionKeyframeTrack:THREE.VectorKeyframeTrack;
    return new Type(nodes[t.node].name+'.'+property,t.times,t.values,t.step?THREE.InterpolateDiscrete:THREE.InterpolateLinear);
  })));
  return {scene,animations};
}
