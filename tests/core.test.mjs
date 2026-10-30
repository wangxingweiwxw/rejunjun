import test from 'node:test';
import assert from 'node:assert/strict';
import {TILE,createMap,moveBody,canOccupy,distanceField,nextStep,waveSize,healthMultiplier,killPoints,reloadAmmo} from '../source/core.js';
test('RE Junjun preserves upstream wave progression and critical rewards',()=>{
 assert.deepEqual([1,2,3,4,5].map(waveSize),[5,6,7,8,9]);assert.equal(healthMultiplier(5),1.02);assert.equal(killPoints(false),60);assert.equal(killPoints(true),100);
});
test('locked room is unreachable; opening the door connects its navigation',()=>{
 const {grid,doors}=createMap();let field=distanceField(grid,12,25);assert.equal(field[8][5],Infinity);const d=doors[0];grid[d.z][d.x]=0;field=distanceField(grid,12,25);assert.ok(Number.isFinite(field[8][5]));
 let x=5,z=8,n=0;while(x!==12||z!==25){const s=nextStep(field,x,z);assert.ok(s);x=Math.round(s.x/TILE);z=Math.round(s.z/TILE);assert.equal(grid[z][x],0);assert.ok(++n<100);}
});
test('collision prevents wall tunnelling and permits passing an open doorway',()=>{
 const {grid}=createMap(),p={x:10*TILE,z:8*TILE};moveBody(grid,p,-4,0);assert.ok(p.x>9.5*TILE);assert.ok(canOccupy(grid,p.x,p.z));grid[8][9]=0;moveBody(grid,p,-4,0);assert.ok(p.x<9*TILE);
});
test('diagonal movement slides along walls without entering solids',()=>{
 const {grid}=createMap(),p={x:10*TILE,z:14*TILE};for(let i=0;i<50;i++)moveBody(grid,p,-.1,-.1);assert.ok(p.z<14*TILE-4);assert.ok(canOccupy(grid,p.x,p.z));
});
test('reload conserves ammunition even with a partial reserve',()=>{
 const w={mag:12,ammo:3,reserve:4};assert.equal(reloadAmmo(w),4);assert.deepEqual(w,{mag:12,ammo:7,reserve:0});assert.equal(reloadAmmo(w),0);
});
