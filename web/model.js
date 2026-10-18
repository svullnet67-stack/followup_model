const $=id=>document.getElementById(id);
$('sample').onclick=()=>{ $('action').value='老师发送学习方案';$('history').value='老师：我明天下午把学习方案发给您。\n家长：好的，我等您的消息。';$('current').value='老师：学习方案今天上午已经发给您了。\n家长：收到了，我晚上和孩子一起看。';};
$('run').onclick=async()=>{
 const payload=Object.fromEntries(['action','history','current'].map(k=>[k,$(k).value.trim()]));
 if(Object.values(payload).some(v=>!v)){ $('result').textContent='请填写全部三项。';return; }
 $('run').disabled=true;$('result').textContent='正在调用训练模型…';
 try{const response=await fetch('/api/predict',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(120000)});const data=await response.json();if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'输入不符合要求或服务暂不可用');
 $('result').textContent='判断状态：'+data.label+'\n模型分数：'+(data.score*100).toFixed(1)+'%\n请核对主体、动作、时间及原话，确认后使用。';
 }catch(e){$('result').textContent='分析失败：'+e.message+'\n未产生模型结果，请检查服务。';}finally{$('run').disabled=false;}
};
