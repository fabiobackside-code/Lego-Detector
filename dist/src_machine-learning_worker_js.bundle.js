/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ "./src/machine-learning/worker.js"
/*!****************************************!*\
  !*** ./src/machine-learning/worker.js ***!
  \****************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
eval("{__webpack_require__.r(__webpack_exports__);\n/* harmony import */ var _tensorflow_tfjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @tensorflow/tfjs */ \"./node_modules/@tensorflow/tfjs/dist/index.js\");\n/**\n * worker.js — Web Worker de inferencia YOLO para LEGO\n *\n * Espelho direto do worker.js do Duck Hunt, adaptado para deteccao de pecas LEGO.\n *\n * =====================================================================\n *  PARALELO COM DUCK HUNT (leia este arquivo junto com o do DuckHunt)\n * =====================================================================\n *\n *  DuckHunt worker.js                     LEGO worker.js (este arquivo)\n *  ──────────────────────────────────     ──────────────────────────────\n *  importScripts(cdn TF.js)           →   import * as tf (bundle webpack)\n *  MODEL_PATH: yolov5n_web_model/     →   MODEL_PATH: lego_web_model/\n *  modelo YOLOv5 (saida pre-proc.)    →   modelo YOLOv8 (saida bruta [1,5,8400])\n *  preprocessImage: identica          →   preprocessImage: identica\n *  runInference: identica             →   runInference: adapta saida bruta\n *  processPrediction: retorna {x,y}   →   postprocess: NMS real + detections[]\n *  postMessage { x, y, score }        →   postMessage { detections[], ms }\n *\n * O Duck Hunt deixou processPrediction retornando coordenadas fixas (400, 400).\n * Este arquivo e onde a historia continua: implementamos o pos-processamento real.\n * =====================================================================\n */\n\n\n\n// ── Constantes ─────────────────────────────────────────────────────────────────\n\n/**\n * Caminhos dos arquivos do modelo — mesma convencao do DuckHunt.\n *\n * DuckHunt:  'yolov5n_web_model/model.json'\n * LEGO:      'lego_web_model/model.json'\n *\n * O CopyPlugin do webpack.config.js copia a pasta lego_web_model/ para dist/,\n * tornando esses arquivos acessiveis pelo servidor de desenvolvimento.\n */\nconst MODEL_PATH  = 'lego_web_model/model.json';\nconst LABELS_PATH = 'lego_web_model/labels.json';\n\n/**\n * Dimensao de entrada do modelo YOLO: 640x640 pixels.\n * Tanto o YOLOv5 (DuckHunt) quanto o YOLOv8 (LEGO) usam 640x640.\n */\nconst INPUT_SIZE = 640;\n\n/**\n * Limiar de confianca — DuckHunt usa CLASS_THRESHOLD = 0.4.\n * Abaixo desse valor, a deteccao e descartada antes do NMS.\n * Valor menor = mais sensivel (mais falsos positivos).\n * Valor maior = mais conservador (pode perder pecas).\n */\nconst CONF_THRESH = 0.25;\n\n/**\n * Limiar de IoU para NMS — quanto de sobreposicao e tolerado entre caixas.\n * Acima desse valor = caixas sao consideradas a mesma peca = a pior e descartada.\n * Valor tipico para YOLO: 0.45.\n */\nconst IOU_THRESH = 0.45;\n\n/** Numero maximo de deteccoes finais apos NMS. */\nconst MAX_DETECTIONS = 100;\n\n/** Numero de ancoras geradas pelo YOLO para uma imagem 640x640.\n *  80x80 + 40x40 + 20x20 = 6400 + 1600 + 400 = 8400 candidatas por inferencia. */\nconst NUM_ANCHORS = 8400;\n\n// ── Estado do Worker ───────────────────────────────────────────────────────────\n\nlet _model  = null;   // tf.GraphModel carregado\nlet _labels = [];     // array de strings: ex. [\"brick\"]\n\n// ── Inicializacao ──────────────────────────────────────────────────────────────\n\n/**\n * Carrega o modelo TF.js e os labels.\n *\n * Sequencia identica ao DuckHunt:\n *   1. tf.ready()         — aguarda o backend (WebGL ou WASM) estar pronto\n *   2. fetch(labels)      — carrega os nomes das classes\n *   3. tf.loadGraphModel  — carrega model.json + *.bin\n *   4. warmup             — executa uma inferencia com tensor dummy\n *   5. postMessage        — avisa o main.js que o modelo esta pronto\n *\n * Por que o warmup?\n *   Na primeira inferencia real, o backend TF.js compila shaders WebGL\n *   ou inicializa o runtime WASM. Isso pode levar varios segundos.\n *   O warmup faz isso acontecer antes da primeira imagem do usuario,\n *   tornando a experiencia mais fluida.\n *\n * tf.dispose(dummyInput):\n *   Tensores TF.js vivem fora do GC normal do JavaScript (sao alocados\n *   em WebGL ou WASM). Precisamos descartar manualmente quando nao\n *   sao mais necessarios para evitar vazamento de memoria.\n */\nasync function loadModelAndLabels() {\n    await _tensorflow_tfjs__WEBPACK_IMPORTED_MODULE_0__.ready();\n\n    _labels = await (await fetch(LABELS_PATH)).json();\n\n    // tf.loadGraphModel e o equivalente TF.js de ort.InferenceSession.create():\n    //   carrega o grafo computacional (model.json) e os pesos (*.bin)\n    _model = await _tensorflow_tfjs__WEBPACK_IMPORTED_MODULE_0__.loadGraphModel(MODEL_PATH);\n\n    // ── Warmup ────────────────────────────────────────────────────────────────\n    // Tensor de uns com o mesmo shape da entrada: [1, 640, 640, 3]\n    // model.inputs[0].shape extrai o shape esperado diretamente do grafo\n    const dummyInput = _tensorflow_tfjs__WEBPACK_IMPORTED_MODULE_0__.ones(_model.inputs[0].shape);\n    await _model.executeAsync(dummyInput);\n    _tensorflow_tfjs__WEBPACK_IMPORTED_MODULE_0__.dispose(dummyInput);  // libera da memoria do backend\n    // ─────────────────────────────────────────────────────────────────────────\n\n    postMessage({ type: 'model-loaded' });\n    console.log(\n        `[LEGO Worker] Modelo carregado. Classes: [${_labels.join(', ')}]. ` +\n        `Backend: ${_tensorflow_tfjs__WEBPACK_IMPORTED_MODULE_0__.getBackend()}`\n    );\n}\n\n// ── Pre-processamento ──────────────────────────────────────────────────────────\n\n/**\n * Converte um ImageBitmap para o tensor de entrada do YOLO.\n *\n * Pipeline — identico linha a linha ao DuckHunt:\n *\n *   tf.browser.fromPixels(bitmap)\n *       Converte o ImageBitmap em Tensor [H, W, 3], dtype int32.\n *       Equivalente a leitura manual de pixels (ort usa canvas.getImageData).\n *\n *   .resizeBilinear([640, 640])\n *       Redimensiona para a entrada esperada pelo YOLO.\n *       Na versao ONNX, o resize acontece via ctx.drawImage no canvas.\n *       Aqui acontece diretamente no pipeline tensorial (GPU/WASM).\n *\n *   .div(255)\n *       Normaliza os valores de [0, 255] para [0.0, 1.0].\n *       Na versao ONNX, isso e feito com um loop manual: value / 255.\n *\n *   .expandDims(0)\n *       Adiciona a dimensao de batch: [H, W, 3] → [1, H, W, 3].\n *       O modelo espera [1, 640, 640, 3] (NHWC — convertido pela onnx2tf).\n *       Na versao ONNX original, o formato era NCHW [1, 3, 640, 640].\n *\n * tf.tidy():\n *   Executa o bloco e descarta automaticamente todos os tensores\n *   intermediarios (image, resized, normalized) ao final.\n *   Sem tf.tidy(), cada operacao cria um tensor que precisa ser\n *   descartado manualmente — facil de esquecer e vazar memoria.\n *   O tensor retornado (expandDims) e preservado fora do tidy.\n *\n * @param {ImageBitmap} bitmap  Frame recebido do main.js via postMessage\n * @returns {tf.Tensor4D}       Tensor [1, 640, 640, 3] pronto para inferencia\n */\nfunction preprocessImage(bitmap) {\n    return _tensorflow_tfjs__WEBPACK_IMPORTED_MODULE_0__.tidy(() => {\n        const image = _tensorflow_tfjs__WEBPACK_IMPORTED_MODULE_0__.browser.fromPixels(bitmap);  // [H, W, 3]\n\n        return _tensorflow_tfjs__WEBPACK_IMPORTED_MODULE_0__.image\n            .resizeBilinear(image, [INPUT_SIZE, INPUT_SIZE])  // [640, 640, 3]\n            .div(255)                                         // normaliza [0..1]\n            .expandDims(0);                                   // [1, 640, 640, 3]\n    });\n}\n\n// ── Inferencia ─────────────────────────────────────────────────────────────────\n\n/**\n * Executa o modelo e extrai o tensor de saida como Float32Array.\n *\n * DuckHunt assume que model.executeAsync retorna um array de 3 tensores\n * ja separados: [boxes, scores, classes]. Isso e caracteristica do YOLOv5\n * que embute parte do pos-processamento no proprio grafo do modelo.\n *\n * Nosso modelo YOLOv8 retorna a saida BRUTA como um unico tensor [1, 5, 8400]:\n *   - 8400 = numero de ancoras (boxes candidatas)\n *   - 5    = [cx, cy, w, h, conf] por ancora\n *\n * O NMS ainda NAO foi aplicado — fazemos isso em postprocess().\n * Esse e o ponto exato que o Duck Hunt deixou em aberto.\n *\n * Gerenciamento de memoria:\n *   tf.dispose(tensor): descarta o tensor de entrada apos a inferencia.\n *   outputs.forEach(t => t.dispose()): descarta os tensores de saida\n *   apos extrair os dados com .data() (que retorna um Float32Array normal).\n *\n * @param {tf.Tensor4D} tensor  Saida do preprocessImage\n * @returns {{ data: Float32Array, inferenceTimeMs: number }}\n */\nasync function runInference(tensor) {\n    const t0 = performance.now();\n\n    // model.executeAsync e o equivalente TF.js de session.run() do ONNX Runtime.\n    // Pode retornar um tensor unico ou um array — normalizamos para array.\n    const raw = await _model.executeAsync(tensor);\n    _tensorflow_tfjs__WEBPACK_IMPORTED_MODULE_0__.dispose(tensor);  // libera o tensor de entrada imediatamente\n\n    const outputs = Array.isArray(raw) ? raw : [raw];\n\n    // Extrai os dados do primeiro tensor de saida como Float32Array.\n    // await .data() e necessario no TF.js — diferente do ort onde .data e sincrono.\n    const data = await outputs[0].data();\n\n    // Descarta todos os tensores de saida do backend\n    outputs.forEach(t => t.dispose());\n\n    const inferenceTimeMs = Math.round(performance.now() - t0);\n    return { data, inferenceTimeMs };\n}\n\n// ── Pos-processamento ──────────────────────────────────────────────────────────\n\n/**\n * Converte a saida bruta do YOLOv8 em deteccoes uteis, aplicando NMS.\n *\n * ESTA E A PARTE QUE O DUCK HUNT DEIXOU EM ABERTO.\n * processPrediction() do DuckHunt retornava { x: 400, y: 400 } — fixo.\n * Aqui implementamos o pos-processamento real, que o desafio pede.\n *\n * ── Layout do tensor [1, 5, 8400] ──────────────────────────────────────────\n *\n *   O modelo retorna um Float32Array de 1 * 5 * 8400 = 42.000 valores.\n *   Em row-major (C-contiguous, que e o padrao do TF.js):\n *\n *     data[0 * NUM_ANCHORS + i] = cx   (centro X da caixa i, em pixels 0-640)\n *     data[1 * NUM_ANCHORS + i] = cy   (centro Y)\n *     data[2 * NUM_ANCHORS + i] = w    (largura)\n *     data[3 * NUM_ANCHORS + i] = h    (altura)\n *     data[4 * NUM_ANCHORS + i] = conf (score de confianca, 0..1)\n *\n * ── Score de confianca ──────────────────────────────────────────────────────\n *\n *   Cada ancora tem um score entre 0 e 1 que indica a probabilidade\n *   de conter um objeto. Ancoras abaixo de CONF_THRESH sao descartadas\n *   antes do NMS para reduzir o custo computacional.\n *\n * ── O que e NMS (Non-Maximum Suppression)? ─────────────────────────────────\n *\n *   O YOLO gera 8400 caixas candidatas para uma imagem 640x640.\n *   A maioria e descartada pelo limiar de confianca, mas varias caixas\n *   vizinhas ainda sobram detectando a MESMA peca.\n *\n *   O NMS resolve isso:\n *     1. Ordena as caixas por score (maior primeiro)\n *     2. Mantém a caixa com maior score\n *     3. Descarta todas as caixas com IoU > IOU_THRESH em relacao a ela\n *     4. Repete para as caixas restantes\n *\n * ── O que e IoU? ────────────────────────────────────────────────────────────\n *\n *   IoU = area_interseccao / area_uniao\n *\n *   Se duas caixas se sopoem muito (IoU alto), elas provavelmente\n *   detectam o mesmo objeto. O NMS usa esse criterio para decidir\n *   quais caixas sao duplicatas.\n *\n *   Exemplo visual:\n *     [===|====]   IoU alto  → mesma peca → descarta a menor\n *     [===]  [===] IoU zero  → pecas diferentes → mantem ambas\n *\n * ── tf.image.nonMaxSuppressionAsync ─────────────────────────────────────────\n *\n *   O TF.js oferece NMS nativo (diferente do ort que nao tem equivalente JS).\n *   Isso e citado no desafio como um dos pontos de estudo:\n *\n *   DuckHunt (comentario no desafio): \"o TF.js oferece uma funcao nativa para NMS\"\n *   → aqui esta ela: tf.image.nonMaxSuppressionAsync\n *\n *   Parametros:\n *     boxes          — Tensor2D [N, 4] no formato [y1, x1, y2, x2] normalizado\n *     scores         — Tensor1D [N]\n *     maxOutputSize  — numero maximo de caixas finais\n *     iouThreshold   — IoU acima desse valor = duplicata = descartada\n *     scoreThreshold — score minimo (redundante com filtro anterior, mas necessario)\n *\n * @param {Float32Array} data    Saida bruta do modelo [1, 5, 8400]\n * @returns {Promise<Detection[]>}  Array de { label, score, box: [x1, y1, x2, y2] }\n */\nasync function postprocess(data) {\n    // ── Etapa 1: filtrar candidatas por confianca ───────────────────────────\n    const candidateBoxes   = [];  // [y1, x1, y2, x2] normalizado\n    const candidateScores  = [];\n    const candidateClasses = [];\n\n    for (let i = 0; i < NUM_ANCHORS; i++) {\n        const conf = data[4 * NUM_ANCHORS + i];\n\n        // Descarta ancoras com score baixo antes do NMS (muito mais rapido)\n        if (conf < CONF_THRESH) continue;\n\n        // Converte de centro+dimensoes (pixels 640x640) para canto+canto normalizado\n        const cx = data[0 * NUM_ANCHORS + i];\n        const cy = data[1 * NUM_ANCHORS + i];\n        const w  = data[2 * NUM_ANCHORS + i];\n        const h  = data[3 * NUM_ANCHORS + i];\n\n        // Normaliza para [0..1] relativo ao tamanho da imagem\n        const x1 = Math.max(0, (cx - w / 2) / INPUT_SIZE);\n        const y1 = Math.max(0, (cy - h / 2) / INPUT_SIZE);\n        const x2 = Math.min(1, (cx + w / 2) / INPUT_SIZE);\n        const y2 = Math.min(1, (cy + h / 2) / INPUT_SIZE);\n\n        // tf.image.nonMaxSuppressionAsync espera [y1, x1, y2, x2]\n        candidateBoxes.push([y1, x1, y2, x2]);\n        candidateScores.push(conf);\n        candidateClasses.push(0);  // modelo com 1 classe: indice sempre 0 (brick)\n    }\n\n    if (candidateBoxes.length === 0) return [];\n\n    // ── Etapa 2: NMS via TF.js ─────────────────────────────────────────────\n    //\n    // Cria tensores TF.js a partir dos arrays JS filtrados\n    const boxesTensor  = _tensorflow_tfjs__WEBPACK_IMPORTED_MODULE_0__.tensor2d(candidateBoxes);   // [N, 4]\n    const scoresTensor = _tensorflow_tfjs__WEBPACK_IMPORTED_MODULE_0__.tensor1d(candidateScores);  // [N]\n\n    // NMS nativo do TF.js — retorna os INDICES das caixas sobreviventes\n    // Na versao ONNX do LEGO (sem TF.js), isso precisaria ser feito manualmente\n    // com um loop de IoU. Aqui temos a funcao nativa, assim como o DuckHunt poderia usar.\n    const selectedIdxTensor = await _tensorflow_tfjs__WEBPACK_IMPORTED_MODULE_0__.image.nonMaxSuppressionAsync(\n        boxesTensor,\n        scoresTensor,\n        MAX_DETECTIONS,  // maxOutputSize\n        IOU_THRESH,      // iouThreshold\n        CONF_THRESH      // scoreThreshold\n    );\n\n    const selectedIndices = await selectedIdxTensor.data();  // Int32Array\n    _tensorflow_tfjs__WEBPACK_IMPORTED_MODULE_0__.dispose([boxesTensor, scoresTensor, selectedIdxTensor]);\n\n    // ── Etapa 3: montar deteccoes no formato esperado pelo layout.js ────────\n    //\n    // Contrato de saida (igual ao especificado no main.js):\n    //   { label: string, score: number, box: [x1, y1, x2, y2] }\n    //   onde box usa coordenadas normalizadas [0..1]\n    return Array.from(selectedIndices).map(idx => {\n        const [y1, x1, y2, x2] = candidateBoxes[idx];\n        return {\n            label: _labels[candidateClasses[idx]] ?? 'unknown',\n            score: candidateScores[idx],\n            box:   [x1, y1, x2, y2],  // [x1, y1, x2, y2] normalizado\n        };\n    });\n}\n\n// ── Loop de mensagens ──────────────────────────────────────────────────────────\n\n/**\n * Recebe mensagens do main.js e retorna deteccoes.\n *\n * Fluxo identico ao DuckHunt:\n *\n *   DuckHunt:                              LEGO:\n *   ──────────────────────────────         ────────────────────────────────────\n *   self.onmessage recebe {image}    →     self.onmessage recebe {image}\n *   preprocessImage(data.image)      →     preprocessImage(data.image)    (=)\n *   runInference(input)               →     runInference(input)            (=)\n *   processPrediction → {x, y}        →     postprocess → Detection[]      (*)\n *   postMessage { x, y, score }       →     postMessage { detections[], ms }\n *\n *   (*) Esta e a diferenca central: DuckHunt retornava {x,y} para atirar.\n *       Aqui retornamos o inventario completo para exibir na UI.\n *\n * Contrato de mensagens:\n *   Recebe:  { type: 'predict', image: ImageBitmap }\n *   Envia:   { type: 'prediction', detections: Detection[], inferenceTimeMs: number }\n *\n * ImageBitmap e transferido (nao copiado) via postMessage([bitmap]) —\n * zero-copy, mais eficiente. Apos a transferencia, o bitmap no main.js\n * fica invalido (transferable object semantics).\n */\nself.onmessage = async ({ data }) => {\n    if (data.type !== 'predict') return;\n    if (!_model) return;  // modelo ainda nao carregou — descarta a mensagem\n\n    const bitmap = data.image;\n\n    const tensor = preprocessImage(bitmap);\n    const { data: rawData, inferenceTimeMs } = await runInference(tensor);\n    const detections = await postprocess(rawData);\n\n    // Retorna para o main.js — mesmo padrao de postMessage do DuckHunt\n    postMessage({\n        type: 'prediction',\n        detections,\n        inferenceTimeMs,\n    });\n};\n\n// ── Inicializa ao carregar o Worker ────────────────────────────────────────────\n// Identico ao DuckHunt: chama loadModelAndLabels() imediatamente ao criar o worker.\n// O main.js aguarda a mensagem 'model-loaded' antes de habilitar o upload.\nloadModelAndLabels();\n\nconsole.log('[LEGO Worker] Web Worker inicializado — aguardando modelo...');\n\n\n//# sourceURL=webpack://lego-detector-tfs/./src/machine-learning/worker.js?\n}");

/***/ },

/***/ "?9a43"
/*!****************************!*\
  !*** node-fetch (ignored) ***!
  \****************************/
() {

eval("{/* (ignored) */\n\n//# sourceURL=webpack://lego-detector-tfs/node-fetch_(ignored)?\n}");

/***/ },

/***/ "?f551"
/*!**********************!*\
  !*** util (ignored) ***!
  \**********************/
() {

eval("{/* (ignored) */\n\n//# sourceURL=webpack://lego-detector-tfs/util_(ignored)?\n}");

/***/ },

/***/ "?defc"
/*!********************************!*\
  !*** string_decoder (ignored) ***!
  \********************************/
() {

eval("{/* (ignored) */\n\n//# sourceURL=webpack://lego-detector-tfs/string_decoder_(ignored)?\n}");

/***/ },

/***/ "?fdcf"
/*!********************!*\
  !*** fs (ignored) ***!
  \********************/
() {

eval("{/* (ignored) */\n\n//# sourceURL=webpack://lego-detector-tfs/fs_(ignored)?\n}");

/***/ },

/***/ "?9f49"
/*!********************************!*\
  !*** string_decoder (ignored) ***!
  \********************************/
() {

eval("{/* (ignored) */\n\n//# sourceURL=webpack://lego-detector-tfs/string_decoder_(ignored)?\n}");

/***/ },

/***/ "?d4c0"
/*!************************!*\
  !*** crypto (ignored) ***!
  \************************/
() {

eval("{/* (ignored) */\n\n//# sourceURL=webpack://lego-detector-tfs/crypto_(ignored)?\n}");

/***/ }

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			id: moduleId,
/******/ 			loaded: false,
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		if (!(moduleId in __webpack_modules__)) {
/******/ 			delete __webpack_module_cache__[moduleId];
/******/ 			var e = new Error("Cannot find module '" + moduleId + "'");
/******/ 			e.code = 'MODULE_NOT_FOUND';
/******/ 			throw e;
/******/ 		}
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = __webpack_modules__;
/******/ 	
/******/ 	// the startup function
/******/ 	__webpack_require__.x = () => {
/******/ 		// Load entry module and return exports
/******/ 		// This entry module depends on other loaded chunks and execution need to be delayed
/******/ 		var __webpack_exports__ = __webpack_require__.O(undefined, ["vendors-node_modules_tensorflow_tfjs_dist_index_js"], () => (__webpack_require__("./src/machine-learning/worker.js")))
/******/ 		__webpack_exports__ = __webpack_require__.O(__webpack_exports__);
/******/ 		return __webpack_exports__;
/******/ 	};
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/amd define */
/******/ 	(() => {
/******/ 		__webpack_require__.amdD = function () {
/******/ 			throw new Error('define cannot be used indirect');
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/amd options */
/******/ 	(() => {
/******/ 		__webpack_require__.amdO = {};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/chunk loaded */
/******/ 	(() => {
/******/ 		var deferred = [];
/******/ 		__webpack_require__.O = (result, chunkIds, fn, priority) => {
/******/ 			if(chunkIds) {
/******/ 				priority = priority || 0;
/******/ 				for(var i = deferred.length; i > 0 && deferred[i - 1][2] > priority; i--) deferred[i] = deferred[i - 1];
/******/ 				deferred[i] = [chunkIds, fn, priority];
/******/ 				return;
/******/ 			}
/******/ 			var notFulfilled = Infinity;
/******/ 			for (var i = 0; i < deferred.length; i++) {
/******/ 				var [chunkIds, fn, priority] = deferred[i];
/******/ 				var fulfilled = true;
/******/ 				for (var j = 0; j < chunkIds.length; j++) {
/******/ 					if ((priority & 1 === 0 || notFulfilled >= priority) && Object.keys(__webpack_require__.O).every((key) => (__webpack_require__.O[key](chunkIds[j])))) {
/******/ 						chunkIds.splice(j--, 1);
/******/ 					} else {
/******/ 						fulfilled = false;
/******/ 						if(priority < notFulfilled) notFulfilled = priority;
/******/ 					}
/******/ 				}
/******/ 				if(fulfilled) {
/******/ 					deferred.splice(i--, 1)
/******/ 					var r = fn();
/******/ 					if (r !== undefined) result = r;
/******/ 				}
/******/ 			}
/******/ 			return result;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/compat get default export */
/******/ 	(() => {
/******/ 		// getDefaultExport function for compatibility with non-harmony modules
/******/ 		__webpack_require__.n = (module) => {
/******/ 			var getter = module && module.__esModule ?
/******/ 				() => (module['default']) :
/******/ 				() => (module);
/******/ 			__webpack_require__.d(getter, { a: getter });
/******/ 			return getter;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/ensure chunk */
/******/ 	(() => {
/******/ 		__webpack_require__.f = {};
/******/ 		// This file contains only the entry chunk.
/******/ 		// The chunk loading function for additional chunks
/******/ 		__webpack_require__.e = (chunkId) => {
/******/ 			return Promise.all(Object.keys(__webpack_require__.f).reduce((promises, key) => {
/******/ 				__webpack_require__.f[key](chunkId, promises);
/******/ 				return promises;
/******/ 			}, []));
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/get javascript chunk filename */
/******/ 	(() => {
/******/ 		// This function allow to reference async chunks and chunks that the entrypoint depends on
/******/ 		__webpack_require__.u = (chunkId) => {
/******/ 			// return url for filenames based on template
/******/ 			return "" + chunkId + ".bundle.js";
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/global */
/******/ 	(() => {
/******/ 		__webpack_require__.g = (function() {
/******/ 			if (typeof globalThis === 'object') return globalThis;
/******/ 			try {
/******/ 				return this || new Function('return this')();
/******/ 			} catch (e) {
/******/ 				if (typeof window === 'object') return window;
/******/ 			}
/******/ 		})();
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/node module decorator */
/******/ 	(() => {
/******/ 		__webpack_require__.nmd = (module) => {
/******/ 			module.paths = [];
/******/ 			if (!module.children) module.children = [];
/******/ 			return module;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/publicPath */
/******/ 	(() => {
/******/ 		var scriptUrl;
/******/ 		if (__webpack_require__.g.importScripts) scriptUrl = __webpack_require__.g.location + "";
/******/ 		var document = __webpack_require__.g.document;
/******/ 		if (!scriptUrl && document) {
/******/ 			if (document.currentScript && document.currentScript.tagName.toUpperCase() === 'SCRIPT')
/******/ 				scriptUrl = document.currentScript.src;
/******/ 			if (!scriptUrl) {
/******/ 				var scripts = document.getElementsByTagName("script");
/******/ 				if(scripts.length) {
/******/ 					var i = scripts.length - 1;
/******/ 					while (i > -1 && (!scriptUrl || !/^http(s?):/.test(scriptUrl))) scriptUrl = scripts[i--].src;
/******/ 				}
/******/ 			}
/******/ 		}
/******/ 		// When supporting browsers where an automatic publicPath is not supported you must specify an output.publicPath manually via configuration
/******/ 		// or pass an empty string ("") and set the __webpack_public_path__ variable from your code to use your own logic.
/******/ 		if (!scriptUrl) throw new Error("Automatic publicPath is not supported in this browser");
/******/ 		scriptUrl = scriptUrl.replace(/^blob:/, "").replace(/#.*$/, "").replace(/\?.*$/, "").replace(/\/[^\/]+$/, "/");
/******/ 		__webpack_require__.p = scriptUrl;
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/importScripts chunk loading */
/******/ 	(() => {
/******/ 		// no baseURI
/******/ 		
/******/ 		// object to store loaded chunks
/******/ 		// "1" means "already loaded"
/******/ 		var installedChunks = {
/******/ 			"src_machine-learning_worker_js": 1
/******/ 		};
/******/ 		
/******/ 		// importScripts chunk loading
/******/ 		var installChunk = (data) => {
/******/ 			var [chunkIds, moreModules, runtime] = data;
/******/ 			for(var moduleId in moreModules) {
/******/ 				if(__webpack_require__.o(moreModules, moduleId)) {
/******/ 					__webpack_require__.m[moduleId] = moreModules[moduleId];
/******/ 				}
/******/ 			}
/******/ 			if(runtime) runtime(__webpack_require__);
/******/ 			while(chunkIds.length)
/******/ 				installedChunks[chunkIds.pop()] = 1;
/******/ 			parentChunkLoadingFunction(data);
/******/ 		};
/******/ 		__webpack_require__.f.i = (chunkId, promises) => {
/******/ 			// "1" is the signal for "already loaded"
/******/ 			if(!installedChunks[chunkId]) {
/******/ 				if(true) { // all chunks have JS
/******/ 					importScripts(__webpack_require__.p + __webpack_require__.u(chunkId));
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 		
/******/ 		var chunkLoadingGlobal = self["webpackChunklego_detector_tfs"] = self["webpackChunklego_detector_tfs"] || [];
/******/ 		var parentChunkLoadingFunction = chunkLoadingGlobal.push.bind(chunkLoadingGlobal);
/******/ 		chunkLoadingGlobal.push = installChunk;
/******/ 		
/******/ 		// no HMR
/******/ 		
/******/ 		// no HMR manifest
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/startup chunk dependencies */
/******/ 	(() => {
/******/ 		var next = __webpack_require__.x;
/******/ 		__webpack_require__.x = () => {
/******/ 			return __webpack_require__.e("vendors-node_modules_tensorflow_tfjs_dist_index_js").then(next);
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// run startup
/******/ 	var __webpack_exports__ = __webpack_require__.x();
/******/ 	
/******/ })()
;