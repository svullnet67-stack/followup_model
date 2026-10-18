import {analyze,renderReport,sections,labels,signature,validate} from './engine.mjs';
import demo from './demo.mjs';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID ? crypto.randomUUID() : 'record-'+Date.now().toString(36)+'-'+Array.from(crypto.getRandomValues(new Uint32Array(3))).join('-'),clone=o=>JSON.parse(JSON.stringify(o));
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;};
const STORAGE='followup-desktop-projects-v1';
let project=clone(demo),projectId=null,selected=project.records.at(-1).id,report=null,reportSig='',edited=null,tab='all',dirty=false,timer;
function toast(s,error=false){$('toast').textContent=s;$('toast').className='toast'+(error?' error':'');$('toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('toast').hidden=true,error?6500:3500);}
const fresh=()=>Boolean(report&&reportSig===signature(project));
function changed(){dirty=true;updateStats();updateState();}
function updateState(){
 $('saveState').textContent=dirty?'有未保存修改':projectId?'已保存到本机':'未保存';
 $('analysisState').textContent=fresh()?'已完成 · 待复核':report?'输入已更新':'等待分析';
 $('resultNotice').classList.toggle('stale',Boolean(report&&!fresh()));
 $('resultNotice').lastElementChild.textContent=report&&!fresh()?'输入已改变，下方是旧结果。请重新分析后导出。':edited!==null?'已保留手工编辑报告；下方卡片仍显示原始分析。':'分析结论附原话依据，核对后再用于跟进。';
 for(const id of ['copyBtn','exportBtn','editBtn'])$(id).disabled=!fresh();
 $('reportFoot').textContent=fresh()?`${project.records.length} 次沟通 · ${edited!==null?'报告已手工编辑':'全部结果需人工复核'}`:report?'结果待更新':'请先添加沟通内容';
}
function updateStats(){
 $('recordCount').innerHTML=`${project.records.length} <em>次</em>`;
 const latest=project.records.map(r=>r.date).filter(Boolean).sort().at(-1);$('latestDate').textContent=latest?latest.slice(0,10):'—';
}
function renderRecords(){
 $('recordList').innerHTML=project.records.map((r,i)=>`<button class="record ${r.id===selected?'selected':''}" data-record="${esc(r.id)}" aria-label="第${i+1}次沟通 ${esc(r.date)}" aria-pressed="${r.id===selected}"><span class="record-no">${String(i+1).padStart(2,'0')}</span><span class="record-info"><strong>${esc(r.date||'请选择日期')}</strong><small>${esc(r.text.trim().replaceAll('\n',' ').slice(0,65)||'等待填写沟通内容')}</small></span><span class="record-arrow">›</span></button>`).join('');
 updateStats();
}
function select(id){
 selected=id;const r=project.records.find(r=>r.id===id);if(!r)return;
 $('recordDate').value=r.date.replace(' ','T');$('transcript').value=r.text;
 $('editorTitle').textContent=`第 ${project.records.indexOf(r)+1} 次沟通`;
 $('charCount').textContent=`${r.text.length.toLocaleString()} / 30,000 字`;
 renderRecords();
}
function load(p,id=null){project=p;projectId=id;selected=p.records.at(-1).id;report=null;reportSig='';edited=null;tab='all';dirty=false;$('student').value=p.student;select(selected);setTab('all');updateState();}
const allowReplace=()=>!dirty||confirm('当前项目有未保存的修改。继续将替换它，是否继续？');
function badge(status){if(/已完成|明确表示可接受/.test(status))return 'good';if(/待|未知|未提及|未识别/.test(status))return 'pending';if(/新增|更新/.test(status))return 'update';return 'neutral';}
function renderResults(){
 const box=$('results');
 if(!report){box.innerHTML='<div class="empty-results"><div class="empty-icon">▤</div><h3>下一次跟进，从这里开始</h3><p>添加历次沟通，点击“对比全部沟通”。<br>也可以载入演示，查看一份完整的复盘。</p></div>';return;}
 const shown=tab==='all'?sections:[tab];
 box.innerHTML=shown.map(s=>`<section class="report-group"><div class="section-head"><h3>${esc(labels[s])}</h3><span class="count">${report[s].length}</span></div>${!report[s].length?'<p class="empty-section">未识别到明确事项，不代表不存在。</p>':report[s].map(row=>`<article class="finding ${s==='next_steps'?'next':''}"><div class="finding-title"><h4>${esc(row.title)}</h4><span class="badge ${badge(row.status)}">${esc(row.status)}</span></div><p>${esc(row.detail)}</p>${row.evidence.length?`<details><summary>查看原话依据 · ${row.evidence.length} 条</summary>${row.evidence.map(e=>`<div class="evidence"><button data-evidence-record="${esc(e.record_id)}">${esc(e.date)} · ${esc(e.role)} ↗</button><blockquote>${esc(e.quote)}</blockquote></div>`).join('')}</details>`:''}</article>`).join('')}</section>`).join('')+`<div class="review-note">${report.warnings.map(esc).join('<br>')}</div>`;
}
function setTab(next){tab=next;for(const b of $('tabs').querySelectorAll('button')){const yes=b.dataset.tab===tab;b.setAttribute('aria-selected',yes);b.tabIndex=yes?0:-1;}renderResults();}
function run(silent=false){
 if(edited!==null&&!confirm('重新分析将替换手工编辑的报告，是否继续？'))return;
 try{const result=analyze(project);report=result;reportSig=signature(project);edited=null;dirty=true;renderResults();updateState();if(!silent)toast('分析完成，请核对原话和跟进重点。');}
 catch(e){toast(e.message||'分析失败，请检查输入。',true);}
}
function readSaved(){try{const data=JSON.parse(localStorage.getItem(STORAGE)||'[]');return Array.isArray(data)?data.filter(x=>x&&typeof x.id==='string'&&x.project&&typeof x.project.student==='string'):[];}catch{return [];}}
function renderSaved(){
 const list=readSaved();
 $('savedList').innerHTML=list.length?list.map(s=>`<div class="saved-item"><button class="saved-open" data-saved="${esc(s.id)}"><strong>${esc(s.project.student)}</strong><small>${esc(String(s.savedAt||'').slice(0,16))}</small></button><button class="saved-remove" data-remove="${esc(s.id)}" aria-label="删除已保存项目 ${esc(s.project.student)}">×</button></div>`).join(''):'<p class="empty-saved">保存项目后会显示在这里。<br>支持下载 JSON 备份。</p>';
 $('mobileProjects').innerHTML='<option value="">打开本机已保存项目…</option>'+list.map(s=>`<option value="${esc(s.id)}">${esc(s.project.student)}</option>`).join('');
}
function save(){
 try{validate(project);const id=projectId||uid(),list=readSaved().filter(x=>x.id!==id);list.unshift({id,project:clone(project),savedAt:today(),edited_report:fresh()?edited:null,report_input:fresh()?reportSig:null});localStorage.setItem(STORAGE,JSON.stringify(list));projectId=id;dirty=false;renderSaved();updateState();toast('已保存到本机缓存。重要记录请点击“备份项目文件”。');}
 catch(e){toast(e instanceof DOMException?'浏览器存储不可用或空间不足，请使用“备份项目文件”备份。':e.message,true);}
}
function openSaved(id){if(!id||!allowReplace())return;try{const s=readSaved().find(x=>x.id===id);if(!s)throw Error('没有找到此项目。');validate(s.project);load(clone(s.project),id);report=analyze(project);reportSig=signature(project);edited=s.report_input===reportSig&&typeof s.edited_report==='string'?s.edited_report:null;dirty=false;renderResults();updateState();toast('已打开本机项目。');}catch(e){toast(e.message,true);}}
function download(name,text,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const safeName=()=>project.student.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,50)||'沟通项目';
function textReport(){if(!fresh())throw Error('请先重新分析，再导出或复制报告。');return edited??renderReport(report);}
$('student').addEventListener('input',()=>{project.student=$('student').value;changed();});
$('recordDate').addEventListener('input',()=>{project.records.find(r=>r.id===selected).date=$('recordDate').value.replace('T',' ');renderRecords();changed();});
$('transcript').addEventListener('input',()=>{project.records.find(r=>r.id===selected).text=$('transcript').value;$('charCount').textContent=`${$('transcript').value.length.toLocaleString()} / 30,000 字`;renderRecords();changed();});
$('recordList').addEventListener('click',e=>{const b=e.target.closest('[data-record]');if(b)select(b.dataset.record);});
$('results').addEventListener('click',e=>{const b=e.target.closest('[data-evidence-record]');if(b){select(b.dataset.evidenceRecord);$('transcript').scrollIntoView({behavior:'smooth',block:'center'});$('transcript').classList.remove('flash');requestAnimationFrame(()=>$('transcript').classList.add('flash'));$('transcript').focus({preventScroll:true});}});
$('addBtn').onclick=()=>{if(project.records.length>=30){toast('每个项目最多添加30次沟通。',true);return;}const r={id:uid(),date:today(),text:''};project.records.push(r);select(r.id);changed();$('transcript').focus();};
$('deleteBtn').onclick=()=>{if(!confirm('删除当前这次沟通？此操作会使已有分析失效。'))return;project.records=project.records.filter(r=>r.id!==selected);if(!project.records.length)project.records.push({id:uid(),date:today(),text:''});select(project.records.at(-1).id);changed();};
function newProject(){if(!allowReplace())return;load({schema_version:1,student:'学生001',records:[{id:uid(),date:today(),text:''}]});dirty=true;updateState();$('student').focus();$('student').select();}
$('newBtn').onclick=newProject;$('sideNew').onclick=newProject;
$('demoBtn').onclick=()=>{if(!allowReplace())return;load(clone(demo));run(true);toast('已载入三次模拟沟通并完成分析。可修改内容后再次对比。');};
$('analyzeBtn').onclick=()=>run();
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&!document.querySelector('dialog[open]')){e.preventDefault();run();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'&&!document.querySelector('dialog[open]')){e.preventDefault();save();}});
$('tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)setTab(b.dataset.tab);});
$('tabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const bs=[...$('tabs').querySelectorAll('button')],i=bs.findIndex(x=>x.dataset.tab===tab),n=e.key==='Home'?0:e.key==='End'?bs.length-1:(i+(e.key==='ArrowRight'?1:-1)+bs.length)%bs.length;setTab(bs[n].dataset.tab);bs[n].focus();});
$('saveBtn').onclick=save;
$('savedList').addEventListener('click',e=>{const open=e.target.closest('[data-saved]'),remove=e.target.closest('[data-remove]');if(open)openSaved(open.dataset.saved);if(remove&&confirm('删除本机保存的此项目？已下载的备份不会受到影响。')){try{localStorage.setItem(STORAGE,JSON.stringify(readSaved().filter(x=>x.id!==remove.dataset.remove)));if(projectId===remove.dataset.remove){projectId=null;dirty=true;updateState();}renderSaved();toast('本机保存的项目已删除。');}catch{toast('删除失败，请检查浏览器存储设置。',true);}}});
$('mobileProjects').onchange=()=>openSaved($('mobileProjects').value);
$('projectExport').onclick=()=>{try{validate(project);const data={...project,report:fresh()?report:null,edited_report:fresh()?edited:null,report_input:fresh()?reportSig:null};download(safeName()+'_沟通项目.json',JSON.stringify(data,null,2),'application/json;charset=utf-8');toast('项目已下载。可在此网页或桌面版中打开原始记录。');}catch(e){toast(e.message,true);}};
$('importBtn').onclick=()=>$('fileInput').click();
$('fileInput').onchange=async()=>{const file=$('fileInput').files[0];$('fileInput').value='';if(!file||!allowReplace())return;try{if(file.size>5_000_000)throw Error('项目文件不能超过5 MB。');const parsed=JSON.parse((await file.text()).replace(/^\uFEFF/,''));validate(parsed);const p={schema_version:1,student:parsed.student,records:parsed.records.map(r=>({id:r.id,date:r.date,text:r.text}))};load(p);run(true);if(parsed.report_input===signature(p)&&typeof parsed.edited_report==='string'){edited=parsed.edited_report;updateState();}toast('已导入原始记录并重新分析。桌面版原报告请在原文件中保留。');}catch(e){toast(e instanceof SyntaxError?'不是有效的 JSON 项目文件。':e.message,true);}};
$('exportBtn').onclick=()=>{try{download(safeName()+'_复盘报告.txt','\uFEFF'+textReport(),'text/plain;charset=utf-8');toast('TXT报告已下载。');}catch(e){toast(e.message,true);}};
async function copyReport(){
 const value=textReport();
 try{if(!navigator.clipboard)throw Error('unavailable');await navigator.clipboard.writeText(value);}
 catch{const el=document.createElement('textarea');el.value=value;el.style.position='fixed';el.style.left='-9999px';document.body.appendChild(el);el.select();let ok=false;try{ok=document.execCommand('copy');}finally{el.remove();}if(!ok)throw Error('复制未获允许，请使用“导出 TXT”。');}
}
$('copyBtn').onclick=async()=>{try{await copyReport();toast('已复制完整报告。');}catch(e){toast(e.message,true);}};
$('editBtn').onclick=()=>{try{$('editedText').value=textReport();$('editDialog').showModal();}catch(e){toast(e.message,true);}};
$('applyEdit').onclick=()=>{edited=$('editedText').value;dirty=true;$('editDialog').close();updateState();toast('已保留修改，复制和 TXT 导出将采用编辑后的报告。');};
$('resetEdit').onclick=()=>{if(confirm('将编辑框恢复为原始生成内容？'))$('editedText').value=renderReport(report);};
for(const id of ['helpBtn','mobileHelp'])$(id).onclick=()=>$('helpDialog').showModal();
$('workspaceBtn').onclick=()=>window.scrollTo({top:0,behavior:'smooth'});
$('brandHome').onclick=e=>{e.preventDefault();window.scrollTo({top:0,behavior:'smooth'});};
for(const b of document.querySelectorAll('.close-dialog'))b.onclick=()=>b.closest('dialog').close();
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
load(clone(demo));run(true);dirty=false;updateState();renderSaved();
