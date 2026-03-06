/**
 * layout.js — Camada de apresentacao (View)
 *
 * Espelho do layout.js do Duck Hunt, adaptado para deteccao de pecas LEGO.
 *
 * =====================================================================
 *  PARALELO COM DUCK HUNT
 * =====================================================================
 *
 *  DuckHunt layout.js                      LEGO layout.js (este arquivo)
 *  ──────────────────────────────────      ─────────────────────────────────────
 *  buildLayout(app) — recebe PixiJS app →  buildLayout() — DOM puro, sem libs
 *  PIXI.Container + PIXI.Text          →   getElementById + canvas 2D API
 *  scoreText.text = '...'              →   statusText.textContent = '...'
 *  updateHUD({ x, y, score })          →   updateInventory(inventory[])
 *  posiciona HUD no canto superior     →   exibe tabela de pecas na sidebar
 *
 * O DuckHunt usa PixiJS porque precisa renderizar sprites do jogo.
 * Aqui usamos DOM + Canvas2D puro — suficiente para exibir imagem e caixas.
 * =====================================================================
 *
 * Responsabilidades:
 *   - Zona de upload (drag & drop e input file)
 *   - Exibicao da imagem/frame no canvas
 *   - Desenho das bounding boxes sobre as deteccoes
 *   - Renderizacao do inventario de pecas (tabela)
 *   - Barra de status e progresso de video
 *
 * Nao contem logica de IA — apenas recebe dados e os exibe.
 */

// Paleta de cores para os labels no canvas.
// Cada label recebe uma cor fixa baseada no indice de insercao.
const LABEL_COLORS = [
    '#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE',
];

const colorCache = new Map();

/**
 * Retorna uma cor fixa e consistente para cada label.
 * Equivalente ao sistema de sprites de cores do DuckHunt (pato preto/vermelho).
 */
function colorForLabel(label) {
    if (!colorCache.has(label)) {
        colorCache.set(label, LABEL_COLORS[colorCache.size % LABEL_COLORS.length]);
    }
    return colorCache.get(label);
}

// ─────────────────────────────────────────────────────────────────────────────

export function buildLayout() {

    // ── Referencias ao DOM ────────────────────────────────────────────────────
    //
    // DuckHunt usa app.stage (PixiJS) para adicionar elementos.
    // Aqui usamos getElementById — HTML puro, sem dependencias de renderizacao.
    const dropArea        = document.getElementById('drop-area');
    const fileInput       = document.getElementById('file-input');
    const fileInfo        = document.getElementById('file-info');
    const statusBar       = document.getElementById('status-bar');
    const statusText      = document.getElementById('status-text');
    const canvas          = document.getElementById('preview-canvas');
    const placeholder     = document.getElementById('canvas-placeholder');
    const inventoryTable  = document.getElementById('inventory-table');
    const inventoryBody   = document.getElementById('inventory-body');
    const inventoryMsg    = document.getElementById('inventory-placeholder');
    const inventorySummary = document.getElementById('inventory-summary');
    const progressWrapper = document.getElementById('video-progress-wrapper');
    const progressBar     = document.getElementById('video-progress');
    const progressLabel   = document.getElementById('video-progress-label');

    // Contexto 2D do canvas — onde desenhamos a imagem e as bounding boxes
    const ctx = canvas.getContext('2d');
    let fileCallback = null;

    // ── Drag & Drop ───────────────────────────────────────────────────────────

    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropArea.classList.add('drag-over');
    });

    dropArea.addEventListener('dragleave', () => {
        dropArea.classList.remove('drag-over');
    });

    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dropArea.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    });

    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (file) handleFile(file);
    });

    function handleFile(file) {
        const validImage = file.type.startsWith('image/');
        const validVideo = file.type.startsWith('video/');

        if (!validImage && !validVideo) {
            setStatus('Formato nao suportado. Use JPG, PNG, MP4 ou WebM.', 'warning');
            return;
        }

        fileInfo.textContent = `${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
        clearInventory();
        hideVideoProgress();

        if (fileCallback) fileCallback(file);
    }

    // ── Status ────────────────────────────────────────────────────────────────
    //
    // DuckHunt: atualiza PIXI.Text do HUD com score e coordenadas.
    // LEGO: atualiza um elemento DOM com estado textual e classe CSS para cor.

    function setStatus(message, type = 'loading') {
        statusText.textContent = message;
        statusBar.className    = type;
    }

    // ── Progresso de video ────────────────────────────────────────────────────

    function showVideoProgress(label) {
        progressWrapper.style.display = 'block';
        progressLabel.textContent     = label;
        progressBar.value             = 0;
    }

    function updateVideoProgress(current, total) {
        progressLabel.textContent = `Frame ${current} / ${total}`;
        progressBar.value         = Math.round((current / total) * 100);
    }

    function hideVideoProgress() {
        progressWrapper.style.display = 'none';
        progressBar.value             = 0;
    }

    // ── Canvas ────────────────────────────────────────────────────────────────

    /**
     * Exibe um ImageBitmap (imagem ou frame de video) no canvas.
     *
     * DuckHunt: o canvas e gerenciado pelo PixiJS (WebGL).
     * LEGO: usamos Canvas2D API diretamente.
     *
     * O canvas assume as dimensoes do bitmap para evitar distorcao.
     */
    function showSource(bitmap) {
        canvas.width  = bitmap.width;
        canvas.height = bitmap.height;
        ctx.drawImage(bitmap, 0, 0);
        placeholder.style.display = 'none';
        canvas.style.display      = 'block';
    }

    /**
     * Desenha as bounding boxes sobre o frame atual no canvas.
     *
     * DuckHunt: o HUD do Duck Hunt mostra o alvo como um sprite PixiJS.
     * LEGO: desenhamos retangulos e labels com a Canvas2D API.
     *
     * detections: array de { label, score, box: [x1, y1, x2, y2] }
     *   onde box usa coordenadas NORMALIZADAS (0..1 relativas ao tamanho da imagem).
     *   Precisamos converter para pixels do canvas multiplicando por width/height.
     *
     * Esse mesmo calculo de desnormalizacao e feito no processPrediction do DuckHunt:
     *   x1 *= width; y1 *= height; (de coordenadas normalizadas para pixels)
     */
    function drawDetections(detections) {
        if (!detections || detections.length === 0) return;

        const { width, height } = canvas;

        detections.forEach(({ label, score, box }) => {
            const [x1n, y1n, x2n, y2n] = box;

            // Desnormaliza: converte [0..1] para pixels do canvas
            const x = x1n * width;
            const y = y1n * height;
            const w = (x2n - x1n) * width;
            const h = (y2n - y1n) * height;

            const color = colorForLabel(label);

            // Bounding box
            ctx.strokeStyle = color;
            ctx.lineWidth   = 2;
            ctx.strokeRect(x, y, w, h);

            // Fundo do texto do label
            ctx.font = 'bold 11px monospace';
            const labelText = `${label} ${(score * 100).toFixed(0)}%`;
            const textWidth = ctx.measureText(labelText).width;
            ctx.fillStyle   = color;
            ctx.fillRect(x, y - 16, textWidth + 8, 16);

            // Texto do label
            ctx.fillStyle = '#111';
            ctx.fillText(labelText, x + 4, y - 4);
        });
    }

    // ── Inventario ────────────────────────────────────────────────────────────

    /**
     * Atualiza a tabela de inventario com as deteccoes agrupadas.
     *
     * DuckHunt: updateHUD exibe coordenadas e score de UM objeto detectado.
     * LEGO: updateInventory exibe uma tabela de TODOS os tipos de pecas
     *   com contagem e score medio — o inventario visual pedido no desafio.
     *
     * inventory: array de { label, count, avgScore } produzido por groupByLabel() em main.js
     */
    function updateInventory(inventory) {
        if (!inventory || inventory.length === 0) {
            inventoryMsg.textContent    = 'Nenhuma peca detectada.';
            inventoryMsg.style.display  = 'block';
            inventoryTable.style.display = 'none';
            inventorySummary.textContent = '';
            return;
        }

        inventoryMsg.style.display   = 'none';
        inventoryTable.style.display = 'table';
        inventoryBody.innerHTML      = '';

        inventory.forEach(({ label, count, avgScore }) => {
            const color = colorForLabel(label);
            const pct   = Math.round(avgScore * 100);

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <span style="display:inline-block;width:10px;height:10px;
                                 background:${color};border-radius:2px;margin-right:6px;"></span>
                    ${label}
                </td>
                <td><span class="count-badge">${count}</span></td>
                <td class="bar-cell">
                    <div class="confidence-bar">
                        <div class="confidence-bar-fill" style="width:${pct}%"></div>
                    </div>
                    <span style="font-size:0.65rem;color:var(--text-muted)">${pct}%</span>
                </td>
            `;
            inventoryBody.appendChild(row);
        });

        const total = inventory.reduce((s, d) => s + d.count, 0);
        inventorySummary.textContent =
            `Total: ${total} peca${total !== 1 ? 's' : ''} · ` +
            `${inventory.length} tipo${inventory.length !== 1 ? 's' : ''}`;
    }

    function clearInventory() {
        inventoryBody.innerHTML      = '';
        inventoryTable.style.display = 'none';
        inventoryMsg.textContent     = 'Nenhuma peca detectada ainda.';
        inventoryMsg.style.display   = 'block';
        inventorySummary.textContent = '';
        colorCache.clear();
    }

    // ── Interface publica ──────────────────────────────────────────────────────
    //
    // DuckHunt retorna { updateHUD }.
    // LEGO retorna um conjunto maior de funcoes — o orquestrador principal
    // precisa de mais controle sobre a UI (status, progresso, canvas, inventario).

    return {
        onFileSelected:      (cb) => { fileCallback = cb; },
        setStatus,
        showSource,
        drawDetections,
        updateInventory,
        clearInventory,
        showVideoProgress,
        updateVideoProgress,
        hideVideoProgress,
    };
}
