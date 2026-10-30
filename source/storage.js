const KEY='re-junjun-settings';
let supportedBridge=null;
function buildVersion(options){return Number(options&&options.miniToolEnv&&options.miniToolEnv.buildVersion)||0;}
async function bridge(){
  if(supportedBridge!==null)return supportedBridge;
  const xhs=window.xhs,mini=xhs&&xhs.miniTool;
  let version=buildVersion(xhs&&xhs.launchOptions);
  if(!version&&mini&&typeof mini.getLaunchOptions==='function'){
    try{version=buildVersion(await mini.getLaunchOptions());}catch(e){version=0;}
  }
  supportedBridge=Math.floor(version/1000)>=9460&&mini&&typeof mini.getStorage==='function'&&typeof mini.setStorage==='function'?mini:false;
  return supportedBridge;
}
function browserValue(){try{return JSON.parse(localStorage.getItem(KEY)||localStorage.getItem('quarantine-settings')||'null');}catch(e){return null;}}
export async function loadSettings(){
  const mini=await bridge();
  if(mini){
    try{const result=await mini.getStorage({key:KEY});if(result&&result.data)return JSON.parse(result.data);}catch(e){/* Missing or cleared storage is not fatal. */}
    const migrated=browserValue();
    if(migrated){try{await mini.setStorage({key:KEY,data:JSON.stringify(migrated)});}catch(e){return null;}}
    return migrated;
  }
  return browserValue();
}
export async function saveSettings(value){
  let data;try{data=JSON.stringify(value);}catch(e){return false;}
  const mini=await bridge();
  if(mini){try{await mini.setStorage({key:KEY,data});return true;}catch(e){return false;}}
  try{localStorage.setItem(KEY,data);return true;}catch(e){return false;}
}
