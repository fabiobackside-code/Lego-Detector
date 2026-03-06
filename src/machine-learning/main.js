/**
 * main.js — Orquestrador principal
 *
 * Espelho direto do main.js do Duck Hunt, adaptado para deteccao de pecas LEGO.
 *
 * =====================================================================
 *  PARALELO COM DUCK HUNT
 * =====================================================================
 *
 *  DuckHunt main.js                        LEGO main.js (este arquivo)
 *  ──────────────────────────────────      ────────────────────────────────────
 *  new Worker('./worker.js')           →   new Worker('./worker.js')          (=)
 *  worker.onmessage                    →   worker.onmessage                   (=)
 *  setInterval(200ms) captura canvas   →   onFileSelected captura img/video   (*)
 *  createImageBitmap(canvas)           →   createImageBitmap(file/frame)      (~)
 *  worker.postMessage({ image })       →   worker.postMessage({ image })      (=)
 *  recebe { x, y } e atira            →   recebe { detections } e exibe      (*)
 *  buildLayout atualiza HUD            →   buildLayout atualiza inventario     (*)
 *
 *  (*) diferenca por conta do dominio (jogo vs deteccao estatica)
 *  (~) mesma funcao, fonte diferente
 *
 * O Duck Hunt captura frames continuamente via setInterval porque
 * o pato esta sempre em movimento. Aqui a fonte e estatica (imagem/video
 * enviado pelo usuario), entao capturamos sob demanda.
 * =====================================================================
 *
 * Responsabilidades deste arquivo:
 *   1. Criar e inicializar o Web Worker
 *   2. Aguardar o usuario enviar uma imagem ou video
 *   3. Para imagens → extrair ImageBitmap e enviar ao Worker
 *   4. Para videos  → percorrer os frames e enviar cada um ao Worker
 *   5. Receber deteccoes de volta e coordenar layout.js
 */

import { buildLayout } from './layout.js';

// ── Configuracao ───────────────────────────────────────────────────────────────

const VIDEO_FPS          = 2;   // frames por segundo extraidos do video
const VIDEO_MAX_DURATION = 10;  // segundos maximos aceitos para video

// ── Contrato de mensagens com o Worker ────────────────────────────────────────
//
//  main.js → worker.js:
//    { type: 'predict', image: ImageBitmap }
//
//  worker.js → main.js:
//    { type: 'model-loaded' }
//    { type: 'prediction', detections: Detection[], inferenceTimeMs: number }
//
//  Detection:
//    { label: string, score: number, box: [x1, y1, x2, y2] }
//    box usa coordenadas normalizadas [0..1] relativas ao tamanho da imagem.

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
    const layout = buildLayout();

    // ── Cria o Web Worker ─────────────────────────────────────────────────────
    //
    // Identico ao Duck Hunt:
    //   new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
    //
    // import.meta.url: resolve o caminho do worker relativo a este arquivo,
    // mesmo apos o bundle pelo webpack. O webpack detecta esse padrao e cria
    // um chunk separado para o worker automaticamente.
    //
    // { type: 'module' }: habilita ES modules no worker (permite 'import').
    // O DuckHunt usa importScripts() (classic worker). Aqui usamos ES modules.
    const worker = new Worker(
        new URL('./worker.js', import.meta.url),
        { type: 'module' }
    );

    let modelReady = false;

    // ── Recebe mensagens do Worker ────────────────────────────────────────────
    //
    // DuckHunt: worker.onmessage recebe { type, x, y } e chama game.handleClick
    // LEGO:     worker.onmessage recebe { type, detections } e atualiza a UI
    //
    // A diferenca e o que fazemos com o resultado — a estrutura e identica.
    worker.onmessage = ({ data }) => {
        if (data.type === 'model-loaded') {
            modelReady = true;
            layout.setStatus('Modelo carregado. Envie uma imagem ou video.', 'ready');
        }
        // Respostas do tipo 'prediction' sao tratadas pela Promise em sendToWorker()
    };

    layout.setStatus('Carregando modelo YOLO...', 'loading');

    // ── Aguarda o usuario enviar um arquivo ───────────────────────────────────
    //
    // DuckHunt usa setInterval(200ms) para capturar frames continuamente.
    // Aqui nao temos um loop — a captura e disparada pelo evento de upload.
    layout.onFileSelected(async (file) => {
        if (!modelReady) {
            layout.setStatus('Aguarde o modelo terminar de carregar.', 'warning');
            return;
        }

        if (file.type.startsWith('image/')) {
            await processImage(file, worker, layout);
        } else if (file.type.startsWith('video/')) {
            await processVideo(file, worker, layout);
        }
    });
}

// ── Processamento de imagem ───────────────────────────────────────────────────

/**
 * Processa uma imagem estatica:
 *   1. Converte o File em ImageBitmap
 *   2. Exibe no canvas
 *   3. Envia ao Worker e aguarda deteccoes
 *   4. Desenha bounding boxes e atualiza inventario
 *
 * createImageBitmap(file):
 *   DuckHunt usa createImageBitmap(canvas) — captura o frame atual do jogo.
 *   Aqui usamos createImageBitmap(file) — converte o arquivo do usuario.
 *   A funcao e a mesma; a fonte e diferente.
 *
 * ImageBitmap e transferivel (Transferable Object):
 *   worker.postMessage({ image }, [bitmap]) transfere a propriedade do objeto
 *   para o worker sem copiar os dados. Apos a transferencia, bitmap no
 *   contexto principal fica inacessivel. DuckHunt faz o mesmo.
 */
async function processImage(file, worker, layout) {
    layout.setStatus('Processando imagem...', 'loading');

    const bitmap = await createImageBitmap(file);
    layout.showSource(bitmap);

    const result = await sendToWorker(worker, bitmap);

    layout.drawDetections(result.detections);
    layout.updateInventory(groupByLabel(result.detections));
    layout.setStatus(
        `${result.detections.length} peca(s) detectada(s) em ${result.inferenceTimeMs}ms`,
        'done'
    );
}

// ── Processamento de video ────────────────────────────────────────────────────

/**
 * Processa um video frame a frame:
 *   1. Extrai frames em intervalos regulares (VIDEO_FPS)
 *   2. Envia cada frame ao Worker
 *   3. Consolida as deteccoes ao final
 *
 * DuckHunt usa setInterval(200ms) — loop continuo capturando o jogo ao vivo.
 * Aqui fazemos o mesmo mas offline: listamos os timestamps antes e
 * processamos sequencialmente (nao em paralelo — o Worker e single-threaded).
 *
 * Estrategia de consolidacao para video:
 *   Mantemos o frame com o MAIOR numero de deteccoes confiaveis como
 *   representante do inventario final. Alternativas possiveis:
 *     - Uniao de todos os frames (superestima — conta a mesma peca varias vezes)
 *     - Media de contagens por classe (subestima em frames com oclusao)
 *     - Moda (mais robusta, mas mais complexa de implementar)
 *   O frame com mais deteccoes tende a ser o com melhor angulo/iluminacao,
 *   o que o torna um bom proxy para o inventario real.
 */
async function processVideo(file, worker, layout) {
    const videoURL = URL.createObjectURL(file);
    const video    = document.createElement('video');

    video.src   = videoURL;
    video.muted = true;

    // Aguarda os metadados (duracao, dimensoes)
    await new Promise((resolve) => { video.onloadedmetadata = resolve; });

    const duration   = Math.min(video.duration, VIDEO_MAX_DURATION);
    const step       = 1 / VIDEO_FPS;
    const timestamps = [];

    for (let t = 0; t < duration; t += step) {
        timestamps.push(parseFloat(t.toFixed(2)));
    }

    layout.showVideoProgress(`Processando ${timestamps.length} frames...`);
    layout.setStatus('Extraindo e analisando frames do video...', 'loading');

    let bestResult = { detections: [], inferenceTimeMs: 0 };

    for (let i = 0; i < timestamps.length; i++) {
        // Posiciona o video no timestamp e aguarda o seek
        video.currentTime = timestamps[i];
        await new Promise((resolve) => { video.onseeked = resolve; });

        // Captura o frame atual como ImageBitmap
        // DuckHunt faz: createImageBitmap(canvas) — mesma funcao, fonte diferente
        const bitmap = await createImageBitmap(video);
        layout.showSource(bitmap);
        layout.updateVideoProgress(i + 1, timestamps.length);

        const result = await sendToWorker(worker, bitmap);

        // Guarda o frame com mais deteccoes (estrategia de consolidacao)
        if (result.detections.length >= bestResult.detections.length) {
            bestResult = result;
        }
    }

    layout.hideVideoProgress();

    // Exibe o melhor frame com suas deteccoes
    layout.showSource(await frameAt(video, timestamps[0]));
    layout.drawDetections(bestResult.detections);
    layout.updateInventory(groupByLabel(bestResult.detections));

    const total = bestResult.detections.length;
    layout.setStatus(
        `${timestamps.length} frames analisados · ${total} peca(s) no melhor frame`,
        'done'
    );

    URL.revokeObjectURL(videoURL);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Envia um ImageBitmap ao Worker e retorna a Promise com o resultado.
 *
 * DuckHunt envia e esquece — nao espera a resposta (setInterval continua rodando).
 * Aqui precisamos esperar porque o processamento de video e sequencial
 * (nao podemos enviar o proximo frame antes de receber a resposta do anterior).
 *
 * O padrao Promise + listener temporario garante que cada postMessage
 * e pareado com exatamente uma resposta do worker.
 */
function sendToWorker(worker, bitmap) {
    return new Promise((resolve) => {
        const handler = ({ data }) => {
            if (data.type === 'prediction') {
                worker.removeEventListener('message', handler);
                resolve(data);
            }
        };
        worker.addEventListener('message', handler);

        // Transfere o ImageBitmap (zero-copy) — mesmo padrao do DuckHunt
        worker.postMessage({ type: 'predict', image: bitmap }, [bitmap]);
    });
}

/**
 * Retorna um ImageBitmap do video em um timestamp especifico.
 * Usado para exibir o frame inicial apos o processamento do video.
 */
async function frameAt(video, timestamp) {
    video.currentTime = timestamp;
    await new Promise((resolve) => { video.onseeked = resolve; });
    return createImageBitmap(video);
}

/**
 * Agrupa as deteccoes por label e calcula contagem e score medio.
 *
 * Entrada:  [{ label, score, box }, ...]
 * Saida:    [{ label, count, avgScore }, ...] ordenado por count decrescente
 *
 * DuckHunt so precisava do score da melhor deteccao.
 * Aqui precisamos de um inventario — por isso agrupamos e contamos.
 */
function groupByLabel(detections) {
    const map = new Map();

    for (const { label, score } of detections) {
        if (!map.has(label)) {
            map.set(label, { label, count: 0, totalScore: 0 });
        }
        const entry = map.get(label);
        entry.count++;
        entry.totalScore += score;
    }

    return Array.from(map.values())
        .map(({ label, count, totalScore }) => ({
            label,
            count,
            avgScore: totalScore / count,
        }))
        .sort((a, b) => b.count - a.count);
}

// ─────────────────────────────────────────────────────────────────────────────

main();
