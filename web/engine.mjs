import cfg from './config.mjs';
const {TOPICS,TASKS,SUBJECTS,GRADE,NUMBER}=cfg;
const STAFF=new Set(['顾问','咨询师','销售','客服','老师','教师','我']);
const CLIENT=new Set(['家长','学生','孩子','客户','妈妈','爸爸']);
const ROLES=[...STAFF,...CLIENT].join('|');
const has=(pattern,s)=>new RegExp(pattern).test(s);
const uniq=xs=>[...new Set(xs)];
export const sections=['changes','concerns','commitments','next_steps'];
export const labels={changes:'信息变化',concerns:'顾虑状态',commitments:'约定核对',next_steps:'跟进重点'};
export function signature(p){return JSON.stringify({student:p.student,records:p.records});}
export function validate(p){
 if(!p||p.schema_version!==1||typeof p.student!=='string'||!p.student.trim()||p.student.length>100)throw Error('请填写学生代号（1—100 字），或检查项目格式。');
 if(!Array.isArray(p.records)||p.records.length<1||p.records.length>30)throw Error('每个项目需要 1—30 次沟通记录。');
 const ids=new Set();let total=0;
 for(const r of p.records){
  if(!r||typeof r.id!=='string'||!r.id||r.id.length>100||ids.has(r.id))throw Error('记录编号缺失或重复。');ids.add(r.id);
  if(typeof r.date!=='string'||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(r.date))throw Error('请为每次沟通填写完整日期和时间。');
  const d=new Date(r.date.replace(' ','T')+'Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,16).replace('T',' ')!==r.date)throw Error('沟通日期无效，请检查年月日与时间。');
  if(typeof r.text!=='string'||!r.text.trim()||r.text.length>30000)throw Error('每次沟通请输入 1—30,000 字。');total+=r.text.length;
 }
 if(total>120000)throw Error('一个项目最多分析 120,000 字。');
 return [...p.records].sort((a,b)=>a.date.localeCompare(b.date));
}
export function parse(records){
 const us=[],warnings=[];
 records.forEach((r,index)=>{let role='未标注',seq=0;
  for(const line of r.text.split(/\r?\n/)){
   if(!line.trim())continue;
   for(let chunk of line.trim().split(new RegExp(`(?=(?:${ROLES})\\s*[：:])`))){
    if(!chunk.trim())continue;
    const m=chunk.match(new RegExp(`^(${ROLES})\\s*[：:]\\s*`));if(m){role=m[1];chunk=chunk.slice(m[0].length);}
    for(const sentence of chunk.match(/[^。！？!?；;\n]+[。！？!?；;]?/g)||[]){
     const quote=sentence.trim();if(!quote)continue;
     us.push({id:`${r.id}:${++seq}`,record_id:r.id,date:r.date,round:index+1,role,quote});
     if(role==='未标注')warnings.push('有未标注角色的文字：保留证据，但不作为客户事实。');
    }
   }
  }
 });return {us,warnings:uniq(warnings)};
}
const evidence=u=>Object.fromEntries(['id','record_id','date','role','quote'].map(k=>[k,u[k]]));
function item(title,status,detail,sources){return {title,status,detail,evidence:[...new Map(sources.map(u=>[u.id,evidence(u)])).values()]};}
const question=s=>has('[？?]|是否|请问|多少分|几年级|哪一科|吗[，,。！!]?$',s);
const clauses=s=>s.split(/[，,]|但是|不过|但|而是/).map(x=>x.trim().replace(/^[ 。！？!?]+|[ 。！？!?]+$/g,'')).filter(Boolean);
function facts(us){
 const f={};
 for(const u of us){if(!CLIENT.has(u.role)||question(u.quote))continue;
  const add=(k,v)=>(f[k]??=[]).push([v,u]);
  for(const c of clauses(u.quote)){
   if(!has('不是|并非|以前|去年|之前|曾经|明年|将来',c))for(const g of c.match(new RegExp(GRADE,'g'))||[])add('年级',g);
   for(const s of SUBJECTS){const m=c.match(new RegExp(`${s}\\s*(?:考了?|是|成绩(?:是|为)?|最近(?:考了?)?|这次(?:考了?)?)?\\s*(${NUMBER})分`));if(m&&!has('不是|目标|希望|争取|满分|以前|去年|上次',c))add(s+'成绩',m[1]+'分');}
   if(has('周[一二三四五六日末天]|星期|[一二三四五六七八九十\\d]+点|\\d{1,2}[:：]\\d{2}',c))add('时间安排表述',c);
   if(has('愿意|不想|抵触|兴趣',c))add('学习意愿表述',c);
  }
 }return f;
}
function compare(records,us){
 const id=records.at(-1).id,cur=facts(us.filter(u=>u.record_id===id)),prev=facts(us.filter(u=>u.record_id!==id)),out=[];
 for(const [key,now] of Object.entries(cur)){
  let old=prev[key]||[];const vals=uniq(now.map(x=>x[0]));
  if(vals.length>1&&(key==='年级'||key.endsWith('成绩')))out.push(item(key,'同次表述待核对','本次出现多个值：'+vals.join('；'),now.map(x=>x[1])));
  else if(!old.length)out.push(item(key,'新增记录',vals.join('；'),now.map(x=>x[1])));
  else{
   const last=old.at(-1)[1].round;old=old.filter(x=>x[1].round===last);const ovs=uniq(old.map(x=>x[0])),same=vals.length===ovs.length&&vals.every(x=>ovs.includes(x));
   let detail='上次：'+ovs.join('；')+'\n本次：'+vals.join('；');
   if(key.endsWith('成绩')&&!same)detail+='\n考试时间、满分和难度未核对，不能直接认定成绩改善或下降。';
   if(key==='时间安排表述'&&has('可能|不一定|看情况',vals.join(' ')))detail+='\n含不确定表达，不能视为已确定可用时段。';
   out.push(item(key,same?'表述相同':'表述更新，待核对含义',detail,[...old,...now].map(x=>x[1])));
  }
 }
 for(const [key,old]of Object.entries(prev))if(!(key in cur))out.push(item(key,'本次未识别到更新','历史信息保留，本次未提及不表示信息失效。',[old.at(-1)[1]]));
 return out;
}
function concerns(us,latest){
 const groups=Object.fromEntries(Object.keys(TOPICS).map(k=>[k,[]]));
 for(const u of us)for(const c of clauses(u.quote)){
  if(question(u.quote))continue;
  for(const [key,spec]of Object.entries(TOPICS)){
   if(!has(spec.topic,c))continue;let kind=null;
   if(CLIENT.has(u.role)){
    const hypothetical=has('如果|假如|万一|要是',c);
    const historical=has('以前|之前|去年|曾经',c)||(has('以前|之前|去年|曾经',u.quote)&&!has('现在|目前|还是|仍|这次|本次',c));
    if(has(spec.clear,c)&&!hypothetical&&!historical&&!has('不愿意|不太愿意|不是|并非',c.replaceAll('不是价格问题','')))kind='clear';
    else if(has(spec.negative,c)){kind=has('不是|并非|并不是|不担心|不再担心',c)?'uncertain':historical?'historical':'negative';}
    else if(key==='time'&&has('有空|可以.{0,3}(?:安排|上课)|有时间',c))kind='possible';
   }else if(STAFF.has(u.role)&&has('可以|建议|安排|解释|提供|调整|了解|确认|针对',c))kind='response';
   if(kind&&!groups[key].some(e=>e[0]===kind&&e[1].id===u.id))groups[key].push([kind,u]);
  }
 }
 const rows=[],candidates=[];
 for(const [key,events]of Object.entries(groups)){
  const ce=events.filter(e=>e[0]!=='response');if(!ce.length)continue;
  const last=ce.at(-1),[kind,u]=last,spec=TOPICS[key],sources=events.map(e=>e[1]);
  const times=new Set(events.filter(e=>['negative','historical'].includes(e[0])).map(e=>e[1].record_id)).size;
  let status,detail;
  if(kind==='clear'){
   status='客户明确表示可接受／无此顾虑'+(u.record_id!==latest?'（历史，本次未更新）':'');detail='保留客户对该事项的明确表述；不代表同意报名。';
   if(key==='willing'&&!['学生','孩子'].includes(u.role))detail+='\n此处为家长／客户转述，尚未获得学生本人直接确认。';
  }else if(u.record_id!==latest){status='本次未提及，未确认解决';detail='历史问题继续保留，不能因本次沉默自动关闭。';}
  else if(kind==='possible'){status='时间条件有新表述，仍待确认';detail='有空不等于已确认上课时段或解决全部时间限制。';}
  else if(kind==='uncertain'){status='否定或复杂表述待核对';detail='无法可靠确定否定范围，请核对原话。';}
  else if(kind==='historical'){status='既往经历，当前顾虑待确认';detail='需要确认历史经历是否影响当前决定。';}
  else{status=times>=2?'持续顾虑':'本次提出顾虑';detail=`共 ${times} 次沟通出现相关负面表述，请结合原话核对。`;}
  if(kind!=='clear'){
   if(events.slice(events.indexOf(last)+1).some(e=>e[0]==='response')){status='顾问已回应，待客户确认';detail+='\n顾问有相关回应，尚不能认定客户接受。';}
   candidates.push([spec.priority,item(spec.title,'优先核对',spec.question+'\n原因：'+status,sources.slice(-2))]);
  }
  rows.push(item(spec.title,status,detail,sources));
 }return {rows,candidates};
}
function commitments(us,latest){
 const tasks=new Map(),warnings=[];
 for(const u of us){if((!STAFF.has(u.role)&&!CLIENT.has(u.role))||question(u.quote))continue;
  for(const c of clauses(u.quote)){
   const owner=STAFF.has(u.role)?'顾问':['学生','孩子'].includes(u.role)?'学生':'家长／客户';
   for(const [key,[title,pattern]]of Object.entries(TASKS)){
    if(!has(pattern,c))continue;
    const received=has('(?:已|已经)?收到(?:了)?',c),neg=has('没|未|不|如果|假如|可能|要是|建议|可以考虑',c);
    const done=!neg&&has('已经|已(?:经)?(?:发|提供|安排|和|跟)|发过|发了|商量过|讨论过|问过|聊过|安排好了|收到了',c);
    const future=!neg&&has('我.{0,8}(?:会|明天|后天|今天|周末|回去|稍后|发给|发一|问问|和孩子|跟孩子)|(?:明天|后天|回去|稍后).{0,8}(?:发|问|商量|讨论|安排)',c);
    if(!done&&!future&&!has('还没|尚未|取消|改到|改为|推迟',c))continue;
    let tk=key+'|'+owner;
    if(received){const found=[...tasks.entries()].filter(([k,t])=>t.key===key&&t.owner!==owner);if(found.length!==1){warnings.push('有收到资料的陈述，但未唯一匹配此前发送约定，请人工核对。');continue;}tk=found[0][0];}
    if(!tasks.has(tk)){
     if(!future){warnings.push('有任务进度陈述，但未识别到对应的先前约定：'+c);continue;}
     const due=c.match(/明天|后天|今天|周[一二三四五六日末天]|星期[一二三四五六日天]|\d{1,2}月\d{1,2}日|回去|稍后/);
     tasks.set(tk,{key,title,owner,due:due?.[0]||'未明确',sources:[],state:'待反馈',last_record:u.record_id});
    }
    const t=tasks.get(tk);t.sources.push(u);t.last_record=u.record_id;
    t.state=done?'原话报告已完成，待人工复核':has('取消',c)&&!has('不取消|没有取消',c)?'原话表示取消，待人工复核':has('改到|改为|推迟',c)?'原话表示调整时间，待确认新安排':has('还没|尚未',c)?'明确尚未完成':'待反馈';
   }
  }
 }
 const rows=[],candidates=[];
 for(const t of tasks.values()){
  const status=t.state==='待反馈'&&t.last_record!==latest?'本次未提及，完成情况未知':t.state;
  rows.push(item(t.title,status,`负责人：${t.owner}\n时间原话：${t.due}（结合约定日期核对）\n提取明确自述行动，是否为双方共同约定仍需核对。`,t.sources));
  if(!status.includes('已完成')&&!status.includes('取消'))candidates.push([t.key==='discuss'?95:65,item(t.title,'核对上次约定',`请确认“${t.title}”的进展。\n原因：${status}。`,t.sources.slice(-1))]);
 }return {rows,candidates,warnings};
}
export function analyze(p){
 const records=validate(p),{us,warnings}=parse(records);
 if(us.some(u=>CLIENT.has(u.role)&&has('老大|老二|大宝|二宝|两个孩子|哥哥|弟弟|姐姐|妹妹',u.quote)))throw Error('记录可能涉及多个孩子，请拆分为每位学生一个项目后再分析。');
 const c=concerns(us,records.at(-1).id),t=commitments(us,records.at(-1).id),choices=[...c.candidates,...t.candidates].sort((a,b)=>b[0]-a[0]);
 const next=[],seen=new Set();
 for(const [,r]of choices){if(seen.has(r.title)||(r.title==='与孩子商量'&&seen.has('孩子参与意愿')))continue;next.push(r);seen.add(r.title);if(next.length===2)break;}
 if(!next.length)next.push(item('核对未覆盖信息','人工确认','当前规则未发现明确未结事项。请核对是否还有新需求，再约定下一步。',[]));
 if(records.length===1)warnings.push('当前只有一次沟通，先建立基线；添加第二次后可比较变化。');
 warnings.push(...t.warnings,'规则版仅覆盖常见表达；表述更新不自动等于真实状态变化，所有结论需人工复核。');
 return {schema_version:1,engine:'浏览器本地规则 v1.0',student:p.student,record_count:records.length,changes:compare(records,us),concerns:c.rows,commitments:t.rows,next_steps:next,warnings:uniq(warnings)};
}
export function renderReport(r){
 const out=[`多轮沟通对比与跟进助手 | ${r.student}`,`分析方式：${r.engine}；沟通次数：${r.record_count}`,'所有结果为待人工复核的分析建议。'];
 for(const s of sections){out.push('',`【${labels[s]}】`);if(!r[s].length)out.push('未识别到明确事项，不代表不存在。');for(const [i,row]of r[s].entries()){out.push(`${i+1}. ${row.title}｜${row.status}`,row.detail);for(const e of row.evidence)out.push(`依据 [${e.date} ${e.role}] ${e.quote}`);}}
 out.push('','【复核提示】',...r.warnings);return out.join('\n');
}
