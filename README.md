# LEGO Detector TFS

Detector de pecas LEGO rodando inteiramente no browser — sem servidor de ML, sem GPU na nuvem. Voce envia uma foto ou video e o modelo YOLOv8 executa dentro de um **Web Worker** via TensorFlow.js. As deteccoes aparecem como bounding boxes no canvas e um inventario das pecas e montado automaticamente.

Este projeto e a resposta direta ao desafio tecnico de IA Fundamentos. Usa **exatamente a mesma arquitetura do DuckHunt** — mesmo stack, mesmo formato de modelo, mesmo esquema de Web Worker — aplicada a um problema diferente: detectar e contar pecas LEGO em uma bandeja.

---

## O que o projeto faz

- Aceita imagem (JPG, PNG, WebP) ou video curto (MP4, WebM, MOV)
- Processa a imagem/frames em um Web Worker isolado (sem travar a UI)
- Detecta pecas LEGO usando YOLOv8 via TensorFlow.js
- Desenha bounding boxes sobre cada peca detectada
- Exibe o inventario: tipo, quantidade e confianca media de cada peca
- Para videos: analisa 2 frames por segundo e exibe o melhor resultado

---

## Arquitetura

```
index.html
  └── main.js           → thread principal: orquestra Worker + UI
        ├── layout.js   → UI: canvas, inventario, status, drag & drop
        └── worker.js   → TF.js: carrega modelo, preprocessamento, inferencia, NMS
```

**Fluxo de dados:**

```
Arquivo (imagem/video)
  → createImageBitmap()
  → postMessage({ type: 'predict', image: ImageBitmap })    [main → worker]
  → tf.browser.fromPixels() → resizeBilinear(640) → div(255) → expandDims(0)
  → model.executeAsync(tensor)                               [inferencia]
  → postprocess: filtrar por conf + NMS (tf.image.nonMaxSuppressionAsync)
  → postMessage({ type: 'prediction', detections, inferenceTimeMs })
  → drawDetections() + updateInventory()                     [canvas + UI]
```

O modelo roda em um **Web Worker** isolado — a inferencia nao bloqueia a UI. A comunicacao entre main.js e worker.js e feita exclusivamente via `postMessage`, com `ImageBitmap` transferido (nao copiado) para o Worker.

---

## Paralelo com o Duck Hunt

Esta e a tabela central do desafio — o que o DuckHunt faz e o que este projeto faz no mesmo lugar:

| O que o Duck Hunt faz | O que este agente faz |
|---|---|
| Captura frame do canvas do jogo via `setInterval(200ms)` | Captura frame da `<img>` ou `<video>` enviada pelo usuario |
| `createImageBitmap(canvas)` | `createImageBitmap(file)` ou `createImageBitmap(video)` |
| Envia `ImageBitmap` ao Web Worker via `postMessage` | Identico — mesmo mecanismo |
| Worker carrega `yolov5n_web_model/model.json` | Worker carrega `lego_web_model/model.json` |
| `tf.browser.fromPixels` → `resizeBilinear` → `.div(255)` → `expandDims(0)` | Identico — mesmo pipeline de preprocessamento |
| `model.executeAsync` retorna `[boxes, scores, classes]` ja separados | `model.executeAsync` retorna tensor bruto `[1, 5, 8400]` |
| `processPrediction` devolve `{ x, y }` para atirar (fixo: 400, 400) | `postprocess` aplica NMS real e devolve `detections[]` |
| HUD mostra coordenadas e score (PixiJS) | Interface mostra inventario com contagem (DOM puro) |

O DuckHunt deixou o pos-processamento incompleto — `processPrediction` retornava coordenadas fixas. Este e o ponto onde o desafio avanca: implementamos o NMS real com `tf.image.nonMaxSuppressionAsync`.

---

## Modelo

**Origem:** [`lego_bricks_machinevisonyolofinetune`](https://www.kaggle.com/models/migueldilalla/lego_bricks_machinevisonyolofinetune) — fine-tune de YOLOv8 treinado por Miguel Di Lalla no Kaggle para deteccao de pecas LEGO. Detecta uma classe: `brick`.

**Pipeline de conversao:**

```
Brick_Model_best20250123_192838t.pt   (PyTorch, YOLOv8)
          ↓  ultralytics export format=onnx
model.onnx                            (ONNX, opset 19)
          ↓  onnx2tf 1.28.8
saved_model/                          (TensorFlow SavedModel)
          ↓  tensorflowjs_converter API Python
lego_web_model/model.json + *.bin     (TF.js graph model)
```

**Formato de entrada:** `[1, 640, 640, 3]` NHWC (onnx2tf faz a transposicao de NCHW para NHWC automaticamente)

**Formato de saida:** `[1, 5, 8400]` — 8400 caixas candidatas com `cx, cy, w, h, conf` (em pixels na escala 640x640)

**Por que 8400 caixas?** O YOLO divide a imagem 640x640 em grids de tres tamanhos: 80x80, 40x40 e 20x20. Cada celula gera uma ancora: 6400 + 1600 + 400 = 8400. A maioria e descartada pelo limiar de confianca; o restante passa pelo NMS.

---

## Como rodar

**Pre-requisito:** `lego_web_model/` deve conter `model.json` e os arquivos `*.bin`. Eles ja estao no repositorio.

```bash
npm install
npm start        # abre http://localhost:8082
```

```bash
npm run build    # gera dist/ para deploy estatico
```

---

## O que cada arquivo faz

### `worker.js` — o coracao do projeto

O Worker e o unico lugar onde TF.js e executado. Ele roda em uma thread separada para nao bloquear a UI.

**Inicializacao (identica ao DuckHunt):**
```
tf.ready()
  → fetch(labels.json)
  → tf.loadGraphModel('lego_web_model/model.json')
  → warmup com tf.ones([1, 640, 640, 3])
  → postMessage({ type: 'model-loaded' })
```

**Preprocessamento (identico ao DuckHunt linha a linha):**
```js
tf.tidy(() => {
    return tf.browser
        .fromPixels(bitmap)                          // [H, W, 3]
        .resizeBilinear([640, 640])                  // [640, 640, 3]
        .div(255)                                    // normaliza [0..1]
        .expandDims(0)                               // [1, 640, 640, 3]
})
```

**Pos-processamento (o avanço em relacao ao DuckHunt):**
```
model.executeAsync(tensor)
  → saida bruta Float32Array [1, 5, 8400]
  → loop em 8400 ancoras: filtra por conf < 0.25
  → converte cx,cy,w,h (pixels 640) → x1,y1,x2,y2 (normalizado)
  → tf.image.nonMaxSuppressionAsync(boxes, scores, 100, 0.45, 0.25)
  → monta detections[] com label, score, box
  → postMessage({ type: 'prediction', detections, inferenceTimeMs })
```

### `main.js` — o orquestrador

Cria o Worker, aguarda `model-loaded`, e quando o usuario envia um arquivo:

- **Imagem:** `createImageBitmap(file)` → `postMessage` → aguarda `prediction`
- **Video:** loop sobre timestamps (2fps) → `createImageBitmap(frame)` → `postMessage` → consolida

A funcao `sendToWorker` envolve o `postMessage` em uma Promise para serializar o processamento de video frame a frame.

### `layout.js` — a UI

Gerencia todo o DOM. As funcoes publicas sao:

| Funcao | O que faz |
|---|---|
| `onFileSelected(cb)` | Registra callback para upload (drag & drop ou input) |
| `setStatus(msg, tipo)` | Atualiza a barra de status com cor por tipo |
| `showSource(bitmap)` | Desenha o ImageBitmap no canvas |
| `drawDetections(dets)` | Sobrepoe bounding boxes no canvas |
| `updateInventory(inv)` | Renderiza a tabela de pecas com contagem e score |
| `showVideoProgress(label)` | Exibe a barra de progresso de frames |

---

## Pos-processamento em detalhe

### Score de confianca

Cada uma das 8400 ancoras tem um valor `conf` entre 0 e 1. Ancoras abaixo de `CONF_THRESH = 0.25` sao descartadas imediatamente, antes do NMS, reduzindo o custo computacional.

### Non-Maximum Suppression (NMS)

O YOLO detecta o mesmo objeto em multiplas ancoras vizinhas. O NMS resolve isso:

1. Ordena as caixas por score (maior primeiro)
2. Mantém a caixa com maior score
3. Calcula o IoU entre ela e todas as restantes
4. Descarta as que tenham IoU > `IOU_THRESH = 0.45`
5. Repete para as sobreviventes

**IoU (Intersection over Union):**
```
IoU = area_interseccao / area_uniao

Se IoU > 0.45 → mesma peca → descarta a de menor score
Se IoU < 0.45 → pecas diferentes → mantem ambas
```

**Implementacao:** usamos `tf.image.nonMaxSuppressionAsync` — funcao nativa do TF.js. Na versao ONNX deste projeto, o NMS precisou ser implementado manualmente em JavaScript (nao existe equivalente no ort para browser).

---

## Estrategia de consolidacao para video

Quando o usuario envia um video, varios frames sao processados. A estrategia escolhida: **manter o frame com o maior numero de deteccoes confiaveis**.

**Justificativa:**
- O frame com mais deteccoes tende a ser o com melhor angulo e iluminacao
- E simples e deterministica (sem ambiguidade na selecao)
- Evita supercontagem (somar todos os frames contaria a mesma peca N vezes)

**Alternativas consideradas e descartadas:**
- *Uniao de todos os frames*: superestima — a mesma peca aparece em multiplos frames
- *Media de contagens*: subestima em frames com oclusao parcial
- *Moda por classe*: mais robusta, mas requer mais logica e o ganho e marginal para videos curtos

---

## Estrutura de pastas

```
LEGO Detector TFS Original/
├── index.html                     → pagina principal (sem framework)
├── src/machine-learning/
│   ├── main.js                    → orquestra Worker e UI
│   ├── worker.js                  → TF.js: modelo, preprocessamento, inferencia, NMS
│   └── layout.js                  → UI: canvas, inventario, status
├── lego_web_model/
│   ├── model.json                 → grafo do modelo TF.js
│   ├── group1-shard1of3.bin       → pesos (shard 1/3)
│   ├── group1-shard2of3.bin       → pesos (shard 2/3)
│   ├── group1-shard3of3.bin       → pesos (shard 3/3)
│   └── labels.json                → ["brick"]
├── docs/
├── package.json
├── webpack.config.js              → bundle + CopyPlugin para lego_web_model/
└── README.md                      → este arquivo
```

---

## Referencias

| Recurso | Link |
|---|---|
| DuckHunt-JS (referencia arquitetural) | Pasta `exemplo-02-vencendo-qualquer-jogo/DuckHunt-JS-parte02` |
| LEGO Bricks — Modelo Kaggle (migueldilalla) | https://www.kaggle.com/models/migueldilalla/lego_bricks_machinevisonyolofinetune |
| Ultralytics YOLOv8 Docs | https://docs.ultralytics.com |
| TensorFlow.js — API Reference | https://js.tensorflow.org/api/latest/ |
| TF.js — tf.loadGraphModel | https://js.tensorflow.org/api/latest/#loadGraphModel |
| TF.js — tf.browser.fromPixels | https://js.tensorflow.org/api/latest/#browser.fromPixels |
| TF.js — tf.image.nonMaxSuppressionAsync | https://js.tensorflow.org/api/latest/#image.nonMaxSuppressionAsync |
| TF.js — tf.tidy | https://js.tensorflow.org/api/latest/#tidy |
| onnx2tf — GitHub | https://github.com/PINTO0309/onnx2tf |
| tensorflowjs_converter — Docs | https://www.tensorflow.org/js/guide/conversion |
| Webpack 5 — Web Workers | https://webpack.js.org/guides/web-workers/ |
