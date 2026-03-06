/**
 * worker.js — Web Worker de inferencia YOLO para LEGO
 *
 * Espelho direto do worker.js do Duck Hunt, adaptado para deteccao de pecas LEGO.
 *
 * =====================================================================
 *  PARALELO COM DUCK HUNT (leia este arquivo junto com o do DuckHunt)
 * =====================================================================
 *
 *  DuckHunt worker.js                     LEGO worker.js (este arquivo)
 *  ──────────────────────────────────     ──────────────────────────────
 *  importScripts(cdn TF.js)           →   import * as tf (bundle webpack)
 *  MODEL_PATH: yolov5n_web_model/     →   MODEL_PATH: lego_web_model/
 *  modelo YOLOv5 (saida pre-proc.)    →   modelo YOLOv8 (saida bruta [1,5,8400])
 *  preprocessImage: identica          →   preprocessImage: identica
 *  runInference: identica             →   runInference: adapta saida bruta
 *  processPrediction: retorna {x,y}   →   postprocess: NMS real + detections[]
 *  postMessage { x, y, score }        →   postMessage { detections[], ms }
 *
 * O Duck Hunt deixou processPrediction retornando coordenadas fixas (400, 400).
 * Este arquivo e onde a historia continua: implementamos o pos-processamento real.
 * =====================================================================
 */

import * as tf from '@tensorflow/tfjs';

// ── Constantes ─────────────────────────────────────────────────────────────────

/**
 * Caminhos dos arquivos do modelo — mesma convencao do DuckHunt.
 *
 * DuckHunt:  'yolov5n_web_model/model.json'
 * LEGO:      'lego_web_model/model.json'
 *
 * O CopyPlugin do webpack.config.js copia a pasta lego_web_model/ para dist/,
 * tornando esses arquivos acessiveis pelo servidor de desenvolvimento.
 */
const MODEL_PATH  = 'lego_web_model/model.json';
const LABELS_PATH = 'lego_web_model/labels.json';

/**
 * Dimensao de entrada do modelo YOLO: 640x640 pixels.
 * Tanto o YOLOv5 (DuckHunt) quanto o YOLOv8 (LEGO) usam 640x640.
 */
const INPUT_SIZE = 640;

/**
 * Limiar de confianca — DuckHunt usa CLASS_THRESHOLD = 0.4.
 * Abaixo desse valor, a deteccao e descartada antes do NMS.
 * Valor menor = mais sensivel (mais falsos positivos).
 * Valor maior = mais conservador (pode perder pecas).
 */
const CONF_THRESH = 0.25;

/**
 * Limiar de IoU para NMS — quanto de sobreposicao e tolerado entre caixas.
 * Acima desse valor = caixas sao consideradas a mesma peca = a pior e descartada.
 * Valor tipico para YOLO: 0.45.
 */
const IOU_THRESH = 0.45;

/** Numero maximo de deteccoes finais apos NMS. */
const MAX_DETECTIONS = 100;

/** Numero de ancoras geradas pelo YOLO para uma imagem 640x640.
 *  80x80 + 40x40 + 20x20 = 6400 + 1600 + 400 = 8400 candidatas por inferencia. */
const NUM_ANCHORS = 8400;

// ── Estado do Worker ───────────────────────────────────────────────────────────

let _model  = null;   // tf.GraphModel carregado
let _labels = [];     // array de strings: ex. ["brick"]

// ── Inicializacao ──────────────────────────────────────────────────────────────

/**
 * Carrega o modelo TF.js e os labels.
 *
 * Sequencia identica ao DuckHunt:
 *   1. tf.ready()         — aguarda o backend (WebGL ou WASM) estar pronto
 *   2. fetch(labels)      — carrega os nomes das classes
 *   3. tf.loadGraphModel  — carrega model.json + *.bin
 *   4. warmup             — executa uma inferencia com tensor dummy
 *   5. postMessage        — avisa o main.js que o modelo esta pronto
 *
 * Por que o warmup?
 *   Na primeira inferencia real, o backend TF.js compila shaders WebGL
 *   ou inicializa o runtime WASM. Isso pode levar varios segundos.
 *   O warmup faz isso acontecer antes da primeira imagem do usuario,
 *   tornando a experiencia mais fluida.
 *
 * tf.dispose(dummyInput):
 *   Tensores TF.js vivem fora do GC normal do JavaScript (sao alocados
 *   em WebGL ou WASM). Precisamos descartar manualmente quando nao
 *   sao mais necessarios para evitar vazamento de memoria.
 */
async function loadModelAndLabels() {
    await tf.ready();

    _labels = await (await fetch(LABELS_PATH)).json();

    // tf.loadGraphModel e o equivalente TF.js de ort.InferenceSession.create():
    //   carrega o grafo computacional (model.json) e os pesos (*.bin)
    _model = await tf.loadGraphModel(MODEL_PATH);

    // ── Warmup ────────────────────────────────────────────────────────────────
    // Tensor de uns com o mesmo shape da entrada: [1, 640, 640, 3]
    // model.inputs[0].shape extrai o shape esperado diretamente do grafo
    const dummyInput = tf.ones(_model.inputs[0].shape);
    await _model.executeAsync(dummyInput);
    tf.dispose(dummyInput);  // libera da memoria do backend
    // ─────────────────────────────────────────────────────────────────────────

    postMessage({ type: 'model-loaded' });
    console.log(
        `[LEGO Worker] Modelo carregado. Classes: [${_labels.join(', ')}]. ` +
        `Backend: ${tf.getBackend()}`
    );
}

// ── Pre-processamento ──────────────────────────────────────────────────────────

/**
 * Converte um ImageBitmap para o tensor de entrada do YOLO.
 *
 * Pipeline — identico linha a linha ao DuckHunt:
 *
 *   tf.browser.fromPixels(bitmap)
 *       Converte o ImageBitmap em Tensor [H, W, 3], dtype int32.
 *       Equivalente a leitura manual de pixels (ort usa canvas.getImageData).
 *
 *   .resizeBilinear([640, 640])
 *       Redimensiona para a entrada esperada pelo YOLO.
 *       Na versao ONNX, o resize acontece via ctx.drawImage no canvas.
 *       Aqui acontece diretamente no pipeline tensorial (GPU/WASM).
 *
 *   .div(255)
 *       Normaliza os valores de [0, 255] para [0.0, 1.0].
 *       Na versao ONNX, isso e feito com um loop manual: value / 255.
 *
 *   .expandDims(0)
 *       Adiciona a dimensao de batch: [H, W, 3] → [1, H, W, 3].
 *       O modelo espera [1, 640, 640, 3] (NHWC — convertido pela onnx2tf).
 *       Na versao ONNX original, o formato era NCHW [1, 3, 640, 640].
 *
 * tf.tidy():
 *   Executa o bloco e descarta automaticamente todos os tensores
 *   intermediarios (image, resized, normalized) ao final.
 *   Sem tf.tidy(), cada operacao cria um tensor que precisa ser
 *   descartado manualmente — facil de esquecer e vazar memoria.
 *   O tensor retornado (expandDims) e preservado fora do tidy.
 *
 * @param {ImageBitmap} bitmap  Frame recebido do main.js via postMessage
 * @returns {tf.Tensor4D}       Tensor [1, 640, 640, 3] pronto para inferencia
 */
function preprocessImage(bitmap) {
    return tf.tidy(() => {
        const image = tf.browser.fromPixels(bitmap);  // [H, W, 3]

        return tf.image
            .resizeBilinear(image, [INPUT_SIZE, INPUT_SIZE])  // [640, 640, 3]
            .div(255)                                         // normaliza [0..1]
            .expandDims(0);                                   // [1, 640, 640, 3]
    });
}

// ── Inferencia ─────────────────────────────────────────────────────────────────

/**
 * Executa o modelo e extrai o tensor de saida como Float32Array.
 *
 * DuckHunt assume que model.executeAsync retorna um array de 3 tensores
 * ja separados: [boxes, scores, classes]. Isso e caracteristica do YOLOv5
 * que embute parte do pos-processamento no proprio grafo do modelo.
 *
 * Nosso modelo YOLOv8 retorna a saida BRUTA como um unico tensor [1, 5, 8400]:
 *   - 8400 = numero de ancoras (boxes candidatas)
 *   - 5    = [cx, cy, w, h, conf] por ancora
 *
 * O NMS ainda NAO foi aplicado — fazemos isso em postprocess().
 * Esse e o ponto exato que o Duck Hunt deixou em aberto.
 *
 * Gerenciamento de memoria:
 *   tf.dispose(tensor): descarta o tensor de entrada apos a inferencia.
 *   outputs.forEach(t => t.dispose()): descarta os tensores de saida
 *   apos extrair os dados com .data() (que retorna um Float32Array normal).
 *
 * @param {tf.Tensor4D} tensor  Saida do preprocessImage
 * @returns {{ data: Float32Array, inferenceTimeMs: number }}
 */
async function runInference(tensor) {
    const t0 = performance.now();

    // model.executeAsync e o equivalente TF.js de session.run() do ONNX Runtime.
    // Pode retornar um tensor unico ou um array — normalizamos para array.
    const raw = await _model.executeAsync(tensor);
    tf.dispose(tensor);  // libera o tensor de entrada imediatamente

    const outputs = Array.isArray(raw) ? raw : [raw];

    // Extrai os dados do primeiro tensor de saida como Float32Array.
    // await .data() e necessario no TF.js — diferente do ort onde .data e sincrono.
    const data = await outputs[0].data();

    // Descarta todos os tensores de saida do backend
    outputs.forEach(t => t.dispose());

    const inferenceTimeMs = Math.round(performance.now() - t0);
    return { data, inferenceTimeMs };
}

// ── Pos-processamento ──────────────────────────────────────────────────────────

/**
 * Converte a saida bruta do YOLOv8 em deteccoes uteis, aplicando NMS.
 *
 * ESTA E A PARTE QUE O DUCK HUNT DEIXOU EM ABERTO.
 * processPrediction() do DuckHunt retornava { x: 400, y: 400 } — fixo.
 * Aqui implementamos o pos-processamento real, que o desafio pede.
 *
 * ── Layout do tensor [1, 5, 8400] ──────────────────────────────────────────
 *
 *   O modelo retorna um Float32Array de 1 * 5 * 8400 = 42.000 valores.
 *   Em row-major (C-contiguous, que e o padrao do TF.js):
 *
 *     data[0 * NUM_ANCHORS + i] = cx   (centro X da caixa i, em pixels 0-640)
 *     data[1 * NUM_ANCHORS + i] = cy   (centro Y)
 *     data[2 * NUM_ANCHORS + i] = w    (largura)
 *     data[3 * NUM_ANCHORS + i] = h    (altura)
 *     data[4 * NUM_ANCHORS + i] = conf (score de confianca, 0..1)
 *
 * ── Score de confianca ──────────────────────────────────────────────────────
 *
 *   Cada ancora tem um score entre 0 e 1 que indica a probabilidade
 *   de conter um objeto. Ancoras abaixo de CONF_THRESH sao descartadas
 *   antes do NMS para reduzir o custo computacional.
 *
 * ── O que e NMS (Non-Maximum Suppression)? ─────────────────────────────────
 *
 *   O YOLO gera 8400 caixas candidatas para uma imagem 640x640.
 *   A maioria e descartada pelo limiar de confianca, mas varias caixas
 *   vizinhas ainda sobram detectando a MESMA peca.
 *
 *   O NMS resolve isso:
 *     1. Ordena as caixas por score (maior primeiro)
 *     2. Mantém a caixa com maior score
 *     3. Descarta todas as caixas com IoU > IOU_THRESH em relacao a ela
 *     4. Repete para as caixas restantes
 *
 * ── O que e IoU? ────────────────────────────────────────────────────────────
 *
 *   IoU = area_interseccao / area_uniao
 *
 *   Se duas caixas se sopoem muito (IoU alto), elas provavelmente
 *   detectam o mesmo objeto. O NMS usa esse criterio para decidir
 *   quais caixas sao duplicatas.
 *
 *   Exemplo visual:
 *     [===|====]   IoU alto  → mesma peca → descarta a menor
 *     [===]  [===] IoU zero  → pecas diferentes → mantem ambas
 *
 * ── tf.image.nonMaxSuppressionAsync ─────────────────────────────────────────
 *
 *   O TF.js oferece NMS nativo (diferente do ort que nao tem equivalente JS).
 *   Isso e citado no desafio como um dos pontos de estudo:
 *
 *   DuckHunt (comentario no desafio): "o TF.js oferece uma funcao nativa para NMS"
 *   → aqui esta ela: tf.image.nonMaxSuppressionAsync
 *
 *   Parametros:
 *     boxes          — Tensor2D [N, 4] no formato [y1, x1, y2, x2] normalizado
 *     scores         — Tensor1D [N]
 *     maxOutputSize  — numero maximo de caixas finais
 *     iouThreshold   — IoU acima desse valor = duplicata = descartada
 *     scoreThreshold — score minimo (redundante com filtro anterior, mas necessario)
 *
 * @param {Float32Array} data    Saida bruta do modelo [1, 5, 8400]
 * @returns {Promise<Detection[]>}  Array de { label, score, box: [x1, y1, x2, y2] }
 */
async function postprocess(data) {
    // ── Etapa 1: filtrar candidatas por confianca ───────────────────────────
    const candidateBoxes   = [];  // [y1, x1, y2, x2] normalizado
    const candidateScores  = [];
    const candidateClasses = [];

    for (let i = 0; i < NUM_ANCHORS; i++) {
        const conf = data[4 * NUM_ANCHORS + i];

        // Descarta ancoras com score baixo antes do NMS (muito mais rapido)
        if (conf < CONF_THRESH) continue;

        // Converte de centro+dimensoes (pixels 640x640) para canto+canto normalizado
        const cx = data[0 * NUM_ANCHORS + i];
        const cy = data[1 * NUM_ANCHORS + i];
        const w  = data[2 * NUM_ANCHORS + i];
        const h  = data[3 * NUM_ANCHORS + i];

        // Normaliza para [0..1] relativo ao tamanho da imagem
        const x1 = Math.max(0, (cx - w / 2) / INPUT_SIZE);
        const y1 = Math.max(0, (cy - h / 2) / INPUT_SIZE);
        const x2 = Math.min(1, (cx + w / 2) / INPUT_SIZE);
        const y2 = Math.min(1, (cy + h / 2) / INPUT_SIZE);

        // tf.image.nonMaxSuppressionAsync espera [y1, x1, y2, x2]
        candidateBoxes.push([y1, x1, y2, x2]);
        candidateScores.push(conf);
        candidateClasses.push(0);  // modelo com 1 classe: indice sempre 0 (brick)
    }

    if (candidateBoxes.length === 0) return [];

    // ── Etapa 2: NMS via TF.js ─────────────────────────────────────────────
    //
    // Cria tensores TF.js a partir dos arrays JS filtrados
    const boxesTensor  = tf.tensor2d(candidateBoxes);   // [N, 4]
    const scoresTensor = tf.tensor1d(candidateScores);  // [N]

    // NMS nativo do TF.js — retorna os INDICES das caixas sobreviventes
    // Na versao ONNX do LEGO (sem TF.js), isso precisaria ser feito manualmente
    // com um loop de IoU. Aqui temos a funcao nativa, assim como o DuckHunt poderia usar.
    const selectedIdxTensor = await tf.image.nonMaxSuppressionAsync(
        boxesTensor,
        scoresTensor,
        MAX_DETECTIONS,  // maxOutputSize
        IOU_THRESH,      // iouThreshold
        CONF_THRESH      // scoreThreshold
    );

    const selectedIndices = await selectedIdxTensor.data();  // Int32Array
    tf.dispose([boxesTensor, scoresTensor, selectedIdxTensor]);

    // ── Etapa 3: montar deteccoes no formato esperado pelo layout.js ────────
    //
    // Contrato de saida (igual ao especificado no main.js):
    //   { label: string, score: number, box: [x1, y1, x2, y2] }
    //   onde box usa coordenadas normalizadas [0..1]
    return Array.from(selectedIndices).map(idx => {
        const [y1, x1, y2, x2] = candidateBoxes[idx];
        return {
            label: _labels[candidateClasses[idx]] ?? 'unknown',
            score: candidateScores[idx],
            box:   [x1, y1, x2, y2],  // [x1, y1, x2, y2] normalizado
        };
    });
}

// ── Loop de mensagens ──────────────────────────────────────────────────────────

/**
 * Recebe mensagens do main.js e retorna deteccoes.
 *
 * Fluxo identico ao DuckHunt:
 *
 *   DuckHunt:                              LEGO:
 *   ──────────────────────────────         ────────────────────────────────────
 *   self.onmessage recebe {image}    →     self.onmessage recebe {image}
 *   preprocessImage(data.image)      →     preprocessImage(data.image)    (=)
 *   runInference(input)               →     runInference(input)            (=)
 *   processPrediction → {x, y}        →     postprocess → Detection[]      (*)
 *   postMessage { x, y, score }       →     postMessage { detections[], ms }
 *
 *   (*) Esta e a diferenca central: DuckHunt retornava {x,y} para atirar.
 *       Aqui retornamos o inventario completo para exibir na UI.
 *
 * Contrato de mensagens:
 *   Recebe:  { type: 'predict', image: ImageBitmap }
 *   Envia:   { type: 'prediction', detections: Detection[], inferenceTimeMs: number }
 *
 * ImageBitmap e transferido (nao copiado) via postMessage([bitmap]) —
 * zero-copy, mais eficiente. Apos a transferencia, o bitmap no main.js
 * fica invalido (transferable object semantics).
 */
self.onmessage = async ({ data }) => {
    if (data.type !== 'predict') return;
    if (!_model) return;  // modelo ainda nao carregou — descarta a mensagem

    const bitmap = data.image;

    const tensor = preprocessImage(bitmap);
    const { data: rawData, inferenceTimeMs } = await runInference(tensor);
    const detections = await postprocess(rawData);

    // Retorna para o main.js — mesmo padrao de postMessage do DuckHunt
    postMessage({
        type: 'prediction',
        detections,
        inferenceTimeMs,
    });
};

// ── Inicializa ao carregar o Worker ────────────────────────────────────────────
// Identico ao DuckHunt: chama loadModelAndLabels() imediatamente ao criar o worker.
// O main.js aguarda a mensagem 'model-loaded' antes de habilitar o upload.
loadModelAndLabels();

console.log('[LEGO Worker] Web Worker inicializado — aguardando modelo...');
