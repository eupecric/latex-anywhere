/* LaTeX Anywhere v1.10.3 — tab-scoped settings and global/domain badges. */
'use strict';
const TAB_PREFIX='latex-anywhere-tab-scope-v1:';
const queue=new Map();
function validTabId(tabId){return Number.isInteger(tabId) && tabId>=0;}
function safeTabScope(scope){return {hidden:scope?.hidden===true,minimized:scope?.minimized===true};}
async function getTabScope(tabId){
  if(!validTabId(tabId)) return safeTabScope(null);
  try {const values=await chrome.storage.session.get(TAB_PREFIX+tabId);
    return safeTabScope(values[TAB_PREFIX+tabId]);
  } catch {return safeTabScope(null);}
}
async function setTabScope(tabId,patch){
  if(!validTabId(tabId)) throw new Error('Aba indisponível');
  // Serialize writes for one tab so the two independent toggles do not race.
  const previous=queue.get(tabId)||Promise.resolve();
  const pending=previous.catch(()=>{}).then(async()=>{
    const scope=await getTabScope(tabId);
    if(typeof patch?.hidden==='boolean') scope.hidden=patch.hidden;
    if(typeof patch?.minimized==='boolean') scope.minimized=patch.minimized;
    await chrome.storage.session.set({[TAB_PREFIX+tabId]:scope});
    try {await chrome.tabs.sendMessage(tabId,
      {type:'latex-anywhere:tab-scope-changed',scope});}
    catch { /* Internal pages and a closed/reloading tab have no content script. */ }
    return scope;
  });
  queue.set(tabId,pending);
  void pending.finally(()=>{if(queue.get(tabId)===pending) queue.delete(tabId);}).catch(()=>{});
  return pending;
}
function getRequestTabId(message,sender){
  if(validTabId(sender.tab?.id)) return sender.tab.id;
  // Only the extension's own popup can target an arbitrary tab ID.
  if(sender.id===chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL('')) &&
      validTabId(message.tabId)) return message.tabId;
  return null;
}
async function showState(tabId,state){
  if(!validTabId(tabId)) return;
  const g=state?.globalHidden===true,d=state?.domainHidden===true,t=state?.tabHidden===true;
  const minimized=state?.globalMinimized===true||state?.domainMinimized===true||state?.tabMinimized===true;
  const label=g?'ALL':d?'OFF':t?'TAB':minimized?'MIN':'';
  const title=g?'Oculto em todos os sites':d?'Oculto neste domínio':t?'Oculto nesta aba':
    minimized?'Barra minimizada':'Ativo';
  try{
    await chrome.action.setBadgeText({tabId,text:label});
    await chrome.action.setBadgeBackgroundColor({tabId,color:g||d||t?'#964248':'#526caa'});
    await chrome.action.setTitle({tabId,title:`LaTeX Anywhere: ${title} — clique para configurar`});
  }catch { /* Aba fechada ou restrita. */ }
}
async function toggleForTab(tabId){
  if(!validTabId(tabId)) return;
  try{
    const state=await chrome.tabs.sendMessage(tabId,{type:'latex-anywhere:toggle'},{frameId:0});
    if(typeof state?.enabled==='boolean') await showState(tabId,state);
  }catch {/* No content script on this page. Popup remains available. */}
}
chrome.commands.onCommand.addListener((command,tab)=>{
  if(command!=='toggle-latex-anywhere')return;
  if(validTabId(tab?.id)){void toggleForTab(tab.id);return;}
  chrome.tabs.query({active:true,currentWindow:true})
    .then(tabs=>toggleForTab(tabs[0]?.id)).catch(()=>{});
});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(message?.type==='latex-anywhere:state' && sender.frameId===0){
    void showState(sender.tab?.id,message);return false;
  }
  if(message?.type==='latex-anywhere:get-tab-scope' ||
     message?.type==='latex-anywhere:set-tab-scope'){
    const tabId=getRequestTabId(message,sender);
    const result=message.type==='latex-anywhere:get-tab-scope'
      ? getTabScope(tabId) : setTabScope(tabId,message.patch);
    Promise.resolve(result).then(respond,err=>respond({error:String(err)}));
    return true;
  }
  return false;
});
chrome.tabs.onRemoved.addListener(tabId=>{
  queue.delete(tabId);
  void chrome.storage.session.remove(TAB_PREFIX+tabId).catch(()=>{});
});