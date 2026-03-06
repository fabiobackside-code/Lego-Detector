/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/machine-learning/layout.js"
/*!****************************************!*\
  !*** ./src/machine-learning/layout.js ***!
  \****************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

eval("{__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   buildLayout: () => (/* binding */ buildLayout)\n/* harmony export */ });\n/**\n * layout.js — Camada de apresentacao (View)\n *\n * Espelho do layout.js do Duck Hunt, adaptado para deteccao de pecas LEGO.\n *\n * =====================================================================\n *  PARALELO COM DUCK HUNT\n * =====================================================================\n *\n *  DuckHunt layout.js                      LEGO layout.js (este arquivo)\n *  ──────────────────────────────────      ─────────────────────────────────────\n *  buildLayout(app) — recebe PixiJS app →  buildLayout() — DOM puro, sem libs\n *  PIXI.Container + PIXI.Text          →   getElementById + canvas 2D API\n *  scoreText.text = '...'              →   statusText.textContent = '...'\n *  updateHUD({ x, y, score })          →   updateInventory(inventory[])\n *  posiciona HUD no canto superior     →   exibe tabela de pecas na sidebar\n *\n * O DuckHunt usa PixiJS porque precisa renderizar sprites do jogo.\n * Aqui usamos DOM + Canvas2D puro — suficiente para exibir imagem e caixas.\n * =====================================================================\n *\n * Responsabilidades:\n *   - Zona de upload (drag & drop e input file)\n *   - Exibicao da imagem/frame no canvas\n *   - Desenho das bounding boxes sobre as deteccoes\n *   - Renderizacao do inventario de pecas (tabela)\n *   - Barra de status e progresso de video\n *\n * Nao contem logica de IA — apenas recebe dados e os exibe.\n */\n\n// Paleta de cores para os labels no canvas.\n// Cada label recebe uma cor fixa baseada no indice de insercao.\nconst LABEL_COLORS = [\n    '#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',\n    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE',\n];\n\nconst colorCache = new Map();\n\n/**\n * Retorna uma cor fixa e consistente para cada label.\n * Equivalente ao sistema de sprites de cores do DuckHunt (pato preto/vermelho).\n */\nfunction colorForLabel(label) {\n    if (!colorCache.has(label)) {\n        colorCache.set(label, LABEL_COLORS[colorCache.size % LABEL_COLORS.length]);\n    }\n    return colorCache.get(label);\n}\n\n// ─────────────────────────────────────────────────────────────────────────────\n\nfunction buildLayout() {\n\n    // ── Referencias ao DOM ────────────────────────────────────────────────────\n    //\n    // DuckHunt usa app.stage (PixiJS) para adicionar elementos.\n    // Aqui usamos getElementById — HTML puro, sem dependencias de renderizacao.\n    const dropArea        = document.getElementById('drop-area');\n    const fileInput       = document.getElementById('file-input');\n    const fileInfo        = document.getElementById('file-info');\n    const statusBar       = document.getElementById('status-bar');\n    const statusText      = document.getElementById('status-text');\n    const canvas          = document.getElementById('preview-canvas');\n    const placeholder     = document.getElementById('canvas-placeholder');\n    const inventoryTable  = document.getElementById('inventory-table');\n    const inventoryBody   = document.getElementById('inventory-body');\n    const inventoryMsg    = document.getElementById('inventory-placeholder');\n    const inventorySummary = document.getElementById('inventory-summary');\n    const progressWrapper = document.getElementById('video-progress-wrapper');\n    const progressBar     = document.getElementById('video-progress');\n    const progressLabel   = document.getElementById('video-progress-label');\n\n    // Contexto 2D do canvas — onde desenhamos a imagem e as bounding boxes\n    const ctx = canvas.getContext('2d');\n    let fileCallback = null;\n\n    // ── Drag & Drop ───────────────────────────────────────────────────────────\n\n    dropArea.addEventListener('dragover', (e) => {\n        e.preventDefault();\n        dropArea.classList.add('drag-over');\n    });\n\n    dropArea.addEventListener('dragleave', () => {\n        dropArea.classList.remove('drag-over');\n    });\n\n    dropArea.addEventListener('drop', (e) => {\n        e.preventDefault();\n        dropArea.classList.remove('drag-over');\n        const file = e.dataTransfer.files[0];\n        if (file) handleFile(file);\n    });\n\n    fileInput.addEventListener('change', () => {\n        const file = fileInput.files[0];\n        if (file) handleFile(file);\n    });\n\n    function handleFile(file) {\n        const validImage = file.type.startsWith('image/');\n        const validVideo = file.type.startsWith('video/');\n\n        if (!validImage && !validVideo) {\n            setStatus('Formato nao suportado. Use JPG, PNG, MP4 ou WebM.', 'warning');\n            return;\n        }\n\n        fileInfo.textContent = `${file.name} (${(file.size / 1024).toFixed(0)} KB)`;\n        clearInventory();\n        hideVideoProgress();\n\n        if (fileCallback) fileCallback(file);\n    }\n\n    // ── Status ────────────────────────────────────────────────────────────────\n    //\n    // DuckHunt: atualiza PIXI.Text do HUD com score e coordenadas.\n    // LEGO: atualiza um elemento DOM com estado textual e classe CSS para cor.\n\n    function setStatus(message, type = 'loading') {\n        statusText.textContent = message;\n        statusBar.className    = type;\n    }\n\n    // ── Progresso de video ────────────────────────────────────────────────────\n\n    function showVideoProgress(label) {\n        progressWrapper.style.display = 'block';\n        progressLabel.textContent     = label;\n        progressBar.value             = 0;\n    }\n\n    function updateVideoProgress(current, total) {\n        progressLabel.textContent = `Frame ${current} / ${total}`;\n        progressBar.value         = Math.round((current / total) * 100);\n    }\n\n    function hideVideoProgress() {\n        progressWrapper.style.display = 'none';\n        progressBar.value             = 0;\n    }\n\n    // ── Canvas ────────────────────────────────────────────────────────────────\n\n    /**\n     * Exibe um ImageBitmap (imagem ou frame de video) no canvas.\n     *\n     * DuckHunt: o canvas e gerenciado pelo PixiJS (WebGL).\n     * LEGO: usamos Canvas2D API diretamente.\n     *\n     * O canvas assume as dimensoes do bitmap para evitar distorcao.\n     */\n    function showSource(bitmap) {\n        canvas.width  = bitmap.width;\n        canvas.height = bitmap.height;\n        ctx.drawImage(bitmap, 0, 0);\n        placeholder.style.display = 'none';\n        canvas.style.display      = 'block';\n    }\n\n    /**\n     * Desenha as bounding boxes sobre o frame atual no canvas.\n     *\n     * DuckHunt: o HUD do Duck Hunt mostra o alvo como um sprite PixiJS.\n     * LEGO: desenhamos retangulos e labels com a Canvas2D API.\n     *\n     * detections: array de { label, score, box: [x1, y1, x2, y2] }\n     *   onde box usa coordenadas NORMALIZADAS (0..1 relativas ao tamanho da imagem).\n     *   Precisamos converter para pixels do canvas multiplicando por width/height.\n     *\n     * Esse mesmo calculo de desnormalizacao e feito no processPrediction do DuckHunt:\n     *   x1 *= width; y1 *= height; (de coordenadas normalizadas para pixels)\n     */\n    function drawDetections(detections) {\n        if (!detections || detections.length === 0) return;\n\n        const { width, height } = canvas;\n\n        detections.forEach(({ label, score, box }) => {\n            const [x1n, y1n, x2n, y2n] = box;\n\n            // Desnormaliza: converte [0..1] para pixels do canvas\n            const x = x1n * width;\n            const y = y1n * height;\n            const w = (x2n - x1n) * width;\n            const h = (y2n - y1n) * height;\n\n            const color = colorForLabel(label);\n\n            // Bounding box\n            ctx.strokeStyle = color;\n            ctx.lineWidth   = 2;\n            ctx.strokeRect(x, y, w, h);\n\n            // Fundo do texto do label\n            ctx.font = 'bold 11px monospace';\n            const labelText = `${label} ${(score * 100).toFixed(0)}%`;\n            const textWidth = ctx.measureText(labelText).width;\n            ctx.fillStyle   = color;\n            ctx.fillRect(x, y - 16, textWidth + 8, 16);\n\n            // Texto do label\n            ctx.fillStyle = '#111';\n            ctx.fillText(labelText, x + 4, y - 4);\n        });\n    }\n\n    // ── Inventario ────────────────────────────────────────────────────────────\n\n    /**\n     * Atualiza a tabela de inventario com as deteccoes agrupadas.\n     *\n     * DuckHunt: updateHUD exibe coordenadas e score de UM objeto detectado.\n     * LEGO: updateInventory exibe uma tabela de TODOS os tipos de pecas\n     *   com contagem e score medio — o inventario visual pedido no desafio.\n     *\n     * inventory: array de { label, count, avgScore } produzido por groupByLabel() em main.js\n     */\n    function updateInventory(inventory) {\n        if (!inventory || inventory.length === 0) {\n            inventoryMsg.textContent    = 'Nenhuma peca detectada.';\n            inventoryMsg.style.display  = 'block';\n            inventoryTable.style.display = 'none';\n            inventorySummary.textContent = '';\n            return;\n        }\n\n        inventoryMsg.style.display   = 'none';\n        inventoryTable.style.display = 'table';\n        inventoryBody.innerHTML      = '';\n\n        inventory.forEach(({ label, count, avgScore }) => {\n            const color = colorForLabel(label);\n            const pct   = Math.round(avgScore * 100);\n\n            const row = document.createElement('tr');\n            row.innerHTML = `\n                <td>\n                    <span style=\"display:inline-block;width:10px;height:10px;\n                                 background:${color};border-radius:2px;margin-right:6px;\"></span>\n                    ${label}\n                </td>\n                <td><span class=\"count-badge\">${count}</span></td>\n                <td class=\"bar-cell\">\n                    <div class=\"confidence-bar\">\n                        <div class=\"confidence-bar-fill\" style=\"width:${pct}%\"></div>\n                    </div>\n                    <span style=\"font-size:0.65rem;color:var(--text-muted)\">${pct}%</span>\n                </td>\n            `;\n            inventoryBody.appendChild(row);\n        });\n\n        const total = inventory.reduce((s, d) => s + d.count, 0);\n        inventorySummary.textContent =\n            `Total: ${total} peca${total !== 1 ? 's' : ''} · ` +\n            `${inventory.length} tipo${inventory.length !== 1 ? 's' : ''}`;\n    }\n\n    function clearInventory() {\n        inventoryBody.innerHTML      = '';\n        inventoryTable.style.display = 'none';\n        inventoryMsg.textContent     = 'Nenhuma peca detectada ainda.';\n        inventoryMsg.style.display   = 'block';\n        inventorySummary.textContent = '';\n        colorCache.clear();\n    }\n\n    // ── Interface publica ──────────────────────────────────────────────────────\n    //\n    // DuckHunt retorna { updateHUD }.\n    // LEGO retorna um conjunto maior de funcoes — o orquestrador principal\n    // precisa de mais controle sobre a UI (status, progresso, canvas, inventario).\n\n    return {\n        onFileSelected:      (cb) => { fileCallback = cb; },\n        setStatus,\n        showSource,\n        drawDetections,\n        updateInventory,\n        clearInventory,\n        showVideoProgress,\n        updateVideoProgress,\n        hideVideoProgress,\n    };\n}\n\n\n//# sourceURL=webpack://lego-detector-tfs/./src/machine-learning/layout.js?\n}");

/***/ },

/***/ "./src/machine-learning/main.js"
/*!**************************************!*\
  !*** ./src/machine-learning/main.js ***!
  \**************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

eval("{__webpack_require__.r(__webpack_exports__);\n/* harmony import */ var _layout_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./layout.js */ \"./src/machine-learning/layout.js\");\n/**\n * main.js — Orquestrador principal\n *\n * Espelho direto do main.js do Duck Hunt, adaptado para deteccao de pecas LEGO.\n *\n * =====================================================================\n *  PARALELO COM DUCK HUNT\n * =====================================================================\n *\n *  DuckHunt main.js                        LEGO main.js (este arquivo)\n *  ──────────────────────────────────      ────────────────────────────────────\n *  new Worker('./worker.js')           →   new Worker('./worker.js')          (=)\n *  worker.onmessage                    →   worker.onmessage                   (=)\n *  setInterval(200ms) captura canvas   →   onFileSelected captura img/video   (*)\n *  createImageBitmap(canvas)           →   createImageBitmap(file/frame)      (~)\n *  worker.postMessage({ image })       →   worker.postMessage({ image })      (=)\n *  recebe { x, y } e atira            →   recebe { detections } e exibe      (*)\n *  buildLayout atualiza HUD            →   buildLayout atualiza inventario     (*)\n *\n *  (*) diferenca por conta do dominio (jogo vs deteccao estatica)\n *  (~) mesma funcao, fonte diferente\n *\n * O Duck Hunt captura frames continuamente via setInterval porque\n * o pato esta sempre em movimento. Aqui a fonte e estatica (imagem/video\n * enviado pelo usuario), entao capturamos sob demanda.\n * =====================================================================\n *\n * Responsabilidades deste arquivo:\n *   1. Criar e inicializar o Web Worker\n *   2. Aguardar o usuario enviar uma imagem ou video\n *   3. Para imagens → extrair ImageBitmap e enviar ao Worker\n *   4. Para videos  → percorrer os frames e enviar cada um ao Worker\n *   5. Receber deteccoes de volta e coordenar layout.js\n */\n\n\n\n// ── Configuracao ───────────────────────────────────────────────────────────────\n\nconst VIDEO_FPS          = 2;   // frames por segundo extraidos do video\nconst VIDEO_MAX_DURATION = 10;  // segundos maximos aceitos para video\n\n// ── Contrato de mensagens com o Worker ────────────────────────────────────────\n//\n//  main.js → worker.js:\n//    { type: 'predict', image: ImageBitmap }\n//\n//  worker.js → main.js:\n//    { type: 'model-loaded' }\n//    { type: 'prediction', detections: Detection[], inferenceTimeMs: number }\n//\n//  Detection:\n//    { label: string, score: number, box: [x1, y1, x2, y2] }\n//    box usa coordenadas normalizadas [0..1] relativas ao tamanho da imagem.\n\n// ─────────────────────────────────────────────────────────────────────────────\n\nasync function main() {\n    const layout = (0,_layout_js__WEBPACK_IMPORTED_MODULE_0__.buildLayout)();\n\n    // ── Cria o Web Worker ─────────────────────────────────────────────────────\n    //\n    // Identico ao Duck Hunt:\n    //   new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })\n    //\n    // import.meta.url: resolve o caminho do worker relativo a este arquivo,\n    // mesmo apos o bundle pelo webpack. O webpack detecta esse padrao e cria\n    // um chunk separado para o worker automaticamente.\n    //\n    // { type: 'module' }: habilita ES modules no worker (permite 'import').\n    // O DuckHunt usa importScripts() (classic worker). Aqui usamos ES modules.\n    const worker = new Worker(\n        new URL(/* worker import */ __webpack_require__.p + __webpack_require__.u(\"src_machine-learning_worker_js\"), __webpack_require__.b),\n        { type: undefined }\n    );\n\n    let modelReady = false;\n\n    // ── Recebe mensagens do Worker ────────────────────────────────────────────\n    //\n    // DuckHunt: worker.onmessage recebe { type, x, y } e chama game.handleClick\n    // LEGO:     worker.onmessage recebe { type, detections } e atualiza a UI\n    //\n    // A diferenca e o que fazemos com o resultado — a estrutura e identica.\n    worker.onmessage = ({ data }) => {\n        if (data.type === 'model-loaded') {\n            modelReady = true;\n            layout.setStatus('Modelo carregado. Envie uma imagem ou video.', 'ready');\n        }\n        // Respostas do tipo 'prediction' sao tratadas pela Promise em sendToWorker()\n    };\n\n    layout.setStatus('Carregando modelo YOLO...', 'loading');\n\n    // ── Aguarda o usuario enviar um arquivo ───────────────────────────────────\n    //\n    // DuckHunt usa setInterval(200ms) para capturar frames continuamente.\n    // Aqui nao temos um loop — a captura e disparada pelo evento de upload.\n    layout.onFileSelected(async (file) => {\n        if (!modelReady) {\n            layout.setStatus('Aguarde o modelo terminar de carregar.', 'warning');\n            return;\n        }\n\n        if (file.type.startsWith('image/')) {\n            await processImage(file, worker, layout);\n        } else if (file.type.startsWith('video/')) {\n            await processVideo(file, worker, layout);\n        }\n    });\n}\n\n// ── Processamento de imagem ───────────────────────────────────────────────────\n\n/**\n * Processa uma imagem estatica:\n *   1. Converte o File em ImageBitmap\n *   2. Exibe no canvas\n *   3. Envia ao Worker e aguarda deteccoes\n *   4. Desenha bounding boxes e atualiza inventario\n *\n * createImageBitmap(file):\n *   DuckHunt usa createImageBitmap(canvas) — captura o frame atual do jogo.\n *   Aqui usamos createImageBitmap(file) — converte o arquivo do usuario.\n *   A funcao e a mesma; a fonte e diferente.\n *\n * ImageBitmap e transferivel (Transferable Object):\n *   worker.postMessage({ image }, [bitmap]) transfere a propriedade do objeto\n *   para o worker sem copiar os dados. Apos a transferencia, bitmap no\n *   contexto principal fica inacessivel. DuckHunt faz o mesmo.\n */\nasync function processImage(file, worker, layout) {\n    layout.setStatus('Processando imagem...', 'loading');\n\n    const bitmap = await createImageBitmap(file);\n    layout.showSource(bitmap);\n\n    const result = await sendToWorker(worker, bitmap);\n\n    layout.drawDetections(result.detections);\n    layout.updateInventory(groupByLabel(result.detections));\n    layout.setStatus(\n        `${result.detections.length} peca(s) detectada(s) em ${result.inferenceTimeMs}ms`,\n        'done'\n    );\n}\n\n// ── Processamento de video ────────────────────────────────────────────────────\n\n/**\n * Processa um video frame a frame:\n *   1. Extrai frames em intervalos regulares (VIDEO_FPS)\n *   2. Envia cada frame ao Worker\n *   3. Consolida as deteccoes ao final\n *\n * DuckHunt usa setInterval(200ms) — loop continuo capturando o jogo ao vivo.\n * Aqui fazemos o mesmo mas offline: listamos os timestamps antes e\n * processamos sequencialmente (nao em paralelo — o Worker e single-threaded).\n *\n * Estrategia de consolidacao para video:\n *   Mantemos o frame com o MAIOR numero de deteccoes confiaveis como\n *   representante do inventario final. Alternativas possiveis:\n *     - Uniao de todos os frames (superestima — conta a mesma peca varias vezes)\n *     - Media de contagens por classe (subestima em frames com oclusao)\n *     - Moda (mais robusta, mas mais complexa de implementar)\n *   O frame com mais deteccoes tende a ser o com melhor angulo/iluminacao,\n *   o que o torna um bom proxy para o inventario real.\n */\nasync function processVideo(file, worker, layout) {\n    const videoURL = URL.createObjectURL(file);\n    const video    = document.createElement('video');\n\n    video.src   = videoURL;\n    video.muted = true;\n\n    // Aguarda os metadados (duracao, dimensoes)\n    await new Promise((resolve) => { video.onloadedmetadata = resolve; });\n\n    const duration   = Math.min(video.duration, VIDEO_MAX_DURATION);\n    const step       = 1 / VIDEO_FPS;\n    const timestamps = [];\n\n    for (let t = 0; t < duration; t += step) {\n        timestamps.push(parseFloat(t.toFixed(2)));\n    }\n\n    layout.showVideoProgress(`Processando ${timestamps.length} frames...`);\n    layout.setStatus('Extraindo e analisando frames do video...', 'loading');\n\n    let bestResult = { detections: [], inferenceTimeMs: 0 };\n\n    for (let i = 0; i < timestamps.length; i++) {\n        // Posiciona o video no timestamp e aguarda o seek\n        video.currentTime = timestamps[i];\n        await new Promise((resolve) => { video.onseeked = resolve; });\n\n        // Captura o frame atual como ImageBitmap\n        // DuckHunt faz: createImageBitmap(canvas) — mesma funcao, fonte diferente\n        const bitmap = await createImageBitmap(video);\n        layout.showSource(bitmap);\n        layout.updateVideoProgress(i + 1, timestamps.length);\n\n        const result = await sendToWorker(worker, bitmap);\n\n        // Guarda o frame com mais deteccoes (estrategia de consolidacao)\n        if (result.detections.length >= bestResult.detections.length) {\n            bestResult = result;\n        }\n    }\n\n    layout.hideVideoProgress();\n\n    // Exibe o melhor frame com suas deteccoes\n    layout.showSource(await frameAt(video, timestamps[0]));\n    layout.drawDetections(bestResult.detections);\n    layout.updateInventory(groupByLabel(bestResult.detections));\n\n    const total = bestResult.detections.length;\n    layout.setStatus(\n        `${timestamps.length} frames analisados · ${total} peca(s) no melhor frame`,\n        'done'\n    );\n\n    URL.revokeObjectURL(videoURL);\n}\n\n// ── Helpers ───────────────────────────────────────────────────────────────────\n\n/**\n * Envia um ImageBitmap ao Worker e retorna a Promise com o resultado.\n *\n * DuckHunt envia e esquece — nao espera a resposta (setInterval continua rodando).\n * Aqui precisamos esperar porque o processamento de video e sequencial\n * (nao podemos enviar o proximo frame antes de receber a resposta do anterior).\n *\n * O padrao Promise + listener temporario garante que cada postMessage\n * e pareado com exatamente uma resposta do worker.\n */\nfunction sendToWorker(worker, bitmap) {\n    return new Promise((resolve) => {\n        const handler = ({ data }) => {\n            if (data.type === 'prediction') {\n                worker.removeEventListener('message', handler);\n                resolve(data);\n            }\n        };\n        worker.addEventListener('message', handler);\n\n        // Transfere o ImageBitmap (zero-copy) — mesmo padrao do DuckHunt\n        worker.postMessage({ type: 'predict', image: bitmap }, [bitmap]);\n    });\n}\n\n/**\n * Retorna um ImageBitmap do video em um timestamp especifico.\n * Usado para exibir o frame inicial apos o processamento do video.\n */\nasync function frameAt(video, timestamp) {\n    video.currentTime = timestamp;\n    await new Promise((resolve) => { video.onseeked = resolve; });\n    return createImageBitmap(video);\n}\n\n/**\n * Agrupa as deteccoes por label e calcula contagem e score medio.\n *\n * Entrada:  [{ label, score, box }, ...]\n * Saida:    [{ label, count, avgScore }, ...] ordenado por count decrescente\n *\n * DuckHunt so precisava do score da melhor deteccao.\n * Aqui precisamos de um inventario — por isso agrupamos e contamos.\n */\nfunction groupByLabel(detections) {\n    const map = new Map();\n\n    for (const { label, score } of detections) {\n        if (!map.has(label)) {\n            map.set(label, { label, count: 0, totalScore: 0 });\n        }\n        const entry = map.get(label);\n        entry.count++;\n        entry.totalScore += score;\n    }\n\n    return Array.from(map.values())\n        .map(({ label, count, totalScore }) => ({\n            label,\n            count,\n            avgScore: totalScore / count,\n        }))\n        .sort((a, b) => b.count - a.count);\n}\n\n// ─────────────────────────────────────────────────────────────────────────────\n\nmain();\n\n\n//# sourceURL=webpack://lego-detector-tfs/./src/machine-learning/main.js?\n}");

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
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
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
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = __webpack_modules__;
/******/ 	
/************************************************************************/
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
/******/ 	/* webpack/runtime/get javascript chunk filename */
/******/ 	(() => {
/******/ 		// This function allow to reference async chunks
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
/******/ 	/* webpack/runtime/jsonp chunk loading */
/******/ 	(() => {
/******/ 		__webpack_require__.b = (typeof document !== 'undefined' && document.baseURI) || self.location.href;
/******/ 		
/******/ 		// object to store loaded and loading chunks
/******/ 		// undefined = chunk not loaded, null = chunk preloaded/prefetched
/******/ 		// [resolve, reject, Promise] = chunk loading, 0 = chunk loaded
/******/ 		var installedChunks = {
/******/ 			"main": 0
/******/ 		};
/******/ 		
/******/ 		// no chunk on demand loading
/******/ 		
/******/ 		// no prefetching
/******/ 		
/******/ 		// no preloaded
/******/ 		
/******/ 		// no HMR
/******/ 		
/******/ 		// no HMR manifest
/******/ 		
/******/ 		// no on chunks loaded
/******/ 		
/******/ 		// no jsonp function
/******/ 	})();
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module can't be inlined because the eval devtool is used.
/******/ 	var __webpack_exports__ = __webpack_require__("./src/machine-learning/main.js");
/******/ 	
/******/ })()
;