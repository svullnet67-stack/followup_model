import os
os.environ.setdefault('HF_HUB_OFFLINE', '1')
os.environ.setdefault('TRANSFORMERS_OFFLINE', '1')
import json
import threading
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent
lock = threading.Lock()
engine = {}

@asynccontextmanager
async def lifespan(app):
    folder = ROOT / 'model'
    if not (folder / 'model.safetensors').is_file():
        raise RuntimeError('缺少 model/model.safetensors，请复制最新 best 中的权重后启动。')
    import torch
    from transformers import AutoTokenizer, AutoModelForSequenceClassification
    torch.set_num_threads(int(os.environ.get('TORCH_NUM_THREADS', '2')))
    manifest = json.loads((folder / 'training_manifest.json').read_text(encoding='utf-8'))
    tokenizer = AutoTokenizer.from_pretrained(folder, local_files_only=True)
    model = AutoModelForSequenceClassification.from_pretrained(folder, local_files_only=True, use_safetensors=True)
    model.eval()
    labels = [model.config.id2label[i] for i in range(model.config.num_labels)]
    if labels != manifest['labels']:
        raise RuntimeError('配置标签与训练记录不一致')
    engine.update(torch=torch, tokenizer=tokenizer, model=model, labels=labels, max_length=manifest['max_length'])
    yield
    engine.clear()

app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None)

class Query(BaseModel):
    action: str = Field(min_length=1, max_length=500)
    history: str = Field(min_length=1, max_length=5000)
    current: str = Field(min_length=1, max_length=5000)

@app.get('/health')
def health():
    return {'ready': bool(engine), 'engine': 'trained-local-model'}

@app.post('/api/predict')
def predict(q: Query):
    if not all(x.strip() for x in [q.action, q.history, q.current]):
        raise HTTPException(422, '请填写目标行动、历史沟通和本次沟通。')
    if not engine:
        raise HTTPException(503, '模型尚未就绪')
    if not lock.acquire(blocking=False):
        raise HTTPException(429, '模型正在处理其他请求，请稍后重试。')
    try:
        inputs = engine['tokenizer']('待判断行动：' + q.action + '\n历史沟通：' + q.history,
                                     '本次沟通：' + q.current, truncation=False, return_tensors='pt')
        if inputs['input_ids'].shape[1] > engine['max_length']:
            raise HTTPException(422, '超过256 tokens，请选取与目标事项相关的前后原话；不会自动截断证据。')
        with engine['torch'].inference_mode():
            scores = engine['model'](**inputs).logits.softmax(-1)[0].tolist()
        idx = max(range(len(scores)), key=scores.__getitem__)
        return {'label': engine['labels'][idx], 'score': scores[idx], 'engine': 'trained-local-model'}
    finally:
        lock.release()

# 只公开 web 目录；模型权重和训练配置不作为网页文件发布。
app.mount('/', StaticFiles(directory=ROOT / 'web', html=True), name='web')

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host=os.environ.get('HOST', '127.0.0.1'), port=int(os.environ.get('PORT', '8080')), access_log=False)
