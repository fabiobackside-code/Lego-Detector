# Artigo LinkedIn - LEGO Detector TFS Original

## Metadados

- **Projeto:** LEGO Detector TFS Original
- **Tecnologia:** TensorFlow.js, JavaScript, WebGL, YOLOv8
- **Data de criacao:** 2026-03-01
- **Tempo de leitura estimado:** ~5 minutos
- **Publico-alvo:** Desenvolvedores, ML Engineers, entusiastas de IA
- **Objetivo:** Compartilhar jornada tecnica e engajar comunidade

---

## Especificacao das Imagens do Carrossel

### IMAGEM 1: Caso de Sucesso (Thumbnail)
**Arquivo:** Screenshot da interface principal com deteccoes funcionando
**Formato:** JPG/PNG, 1200x1200px ou 1200x628px
**Conteudo:** Interface mostrando foto com pecas LEGO padrao (blocos coloridos, bem iluminados, sobre superficie contrastante) com bounding boxes corretos e inventario preenchido automaticamente. Resultado limpo e legivel.
**Legenda:** "LEGO Detector em acao: deteccao em tempo real com TensorFlow.js rodando 100% no navegador — sem servidor, sem nuvem."

### IMAGEM 2: A Reproducao do DuckHunt — Arquitetura
**Arquivo:** Diagrama ou screenshot do fluxo main.js / worker.js / modelo
**Formato:** JPG/PNG, 1200x1200px ou 1200x628px
**Conteudo:** Diagrama simples do fluxo de dados: arquivo → createImageBitmap → postMessage → Web Worker → TF.js → deteccoes → UI. Ou screenshot do codigo do worker.js mostrando o pipeline de pre-processamento e o NMS.
**Legenda:** "A arquitetura do DuckHunt reproduzida para pecas LEGO: Web Worker isola a inferencia, TF.js processa no browser, postMessage conecta tudo. O pos-processamento (NMS real) foi o gap a resolver."

### IMAGEM 3: O que o Modelo nao Ve
**Arquivo:** Foto com placa horizontal e/ou peca clara em fundo claro, sem bounding box sobre elas
**Formato:** JPG/PNG, 1200x1200px ou 1200x628px
**Conteudo:** Imagem onde blocos padrao aparecem detectados, mas placa longa horizontal ou peca de cor similar ao fundo fica sem caixa de deteccao — visivel para o olho humano, invisivel para o modelo.
**Legenda:** "Visivel para o olho humano, invisivel para o modelo: pecas horizontais e pecas com cor similar ao fundo nao sao detectadas — o modelo nao viu exemplos suficientes dessas condicoes no treinamento."

### IMAGEM 4: O Fix do Letterboxing
**Arquivo:** Comparativo ou screenshot de foto em modo paisagem sendo detectada corretamente
**Formato:** JPG/PNG, 1200x1200px ou 1200x628px
**Conteudo:** Interface com foto de celular em modo paisagem (mais larga do que alta) detectando pecas corretamente, com bounding boxes e inventario. Evidencia do problema resolvido no codigo.
**Legenda:** "Fotos de celular em modo paisagem agora detectam normalmente: o fix foi o letterboxing — redimensionar mantendo a proporcao e preencher o espaco restante com cinza, como o modelo espera receber."

---

## Texto Completo do Artigo

### VERSAO LINKEDIN (sem markdown — formatacao para publicacao direta)

Algumas pecas de LEGO estavam visiveis na foto. O modelo simplesmente nao as via.

Entender por que me ensinou mais do que qualquer linha de codigo que eu poderia ter escrito.

---

Estou na pos-graduacao em Engenharia de IA. Num dos modulos de fundamentos, o instrutor apresentou um exemplo que ficou na minha cabeca: o DuckHunt-JS, uma versao do classico da Nintendo onde um modelo de visao computacional detecta os patos em tempo real no browser — via YOLOv8 e TensorFlow.js, sem nenhum servidor. O desafio proposto foi simples: pegue essa estrutura e aplique num caso de uso seu.

Lembrei da gaveta do Ben.

Meu filho tem uma colecao de LEGO que, na pratica, e um caos organizado por baguncinha. Encontrar uma peca especifica naquela gaveta exige paciencia que nem sempre existe. Existia modelo treinado para detectar pecas LEGO? Existia — um fine-tune de YOLOv8 disponivel no Kaggle, feito especificamente para isso.

A ideia era direta: mesma arquitetura do DuckHunt, mesmo stack, mesmo formato de modelo — so com pecas LEGO no lugar dos patos e uma foto no lugar do jogo. O exercicio era justamente esse: reproduzir a abordagem num contexto diferente e, no processo, entender como ela realmente funcionava.

---

*REPRODUZINDO O DUCKHUNT*

O DuckHunt tem uma arquitetura elegante: um Web Worker isola a inferencia da interface, o modelo roda via TensorFlow.js, e a comunicacao entre UI e Worker e feita via postMessage com ImageBitmap transferido sem copia de memoria.

O pre-processamento e identico linha a linha: tf.browser.fromPixels para capturar os pixels, resizeBilinear para 640x640, divisao por 255 para normalizar, expandDims para encaixar no formato esperado pelo modelo. Isso nao muda — e o contrato do YOLOv8.

O ponto onde o desafio precisava avancar estava no pos-processamento. No DuckHunt, a funcao de deteccao retornava coordenadas fixas (400, 400) — uma simplificacao que funcionava para o contexto do jogo. O modelo LEGO, porem, retorna um tensor bruto: 8400 ancoras candidatas, cada uma com posicao, tamanho e confianca. E necessario filtrar por threshold, converter de cx/cy/w/h para coordenadas de canto, e aplicar NMS com tf.image.nonMaxSuppressionAsync para eliminar caixas duplicadas sobre a mesma peca.

Reproduzir isso, passo a passo, foi o nucleo do aprendizado. Nao inventar — entender o que ja existia e preencher o gap real.

📷 Ver IMAGEM 2 no carrossel

---

*O QUE O MODELO NAO VE*

Com o detector funcionando, os testes com fotos reais revelaram algo importante: algumas pecas simplesmente nao apareciam — e o problema nao estava no codigo.

*Pecas longas em orientacao horizontal*

Placas LEGO com proporcao extrema — uma placa 2x16 ou 1x16 deitada — nao sao detectadas. Confianca zero, como se a peca nao existisse na imagem.

A causa esta no treinamento: o modelo YOLOv8 precisa ter visto exemplos suficientes de objetos com esse tipo de proporcao (muito mais largos do que altos) para conseguir generalizar. Sem exemplos, a confianca fica abaixo de qualquer threshold razoavel.

*Pecas com cor similar ao fundo*

Uma peca branca sobre superficie branca. Uma peca cinza clara sobre fundo cinza. Nao detectadas.

Modelos de visao computacional dependem de contraste para identificar bordas de objetos. Uma peca com cor muito proxima do fundo gera o mesmo padrao de pixel que o proprio fundo — o modelo nao consegue separar os dois.

*O que esses casos tem em comum*

Nao sao falhas de implementacao. Sao reflexos do que o modelo viu — ou nao viu — durante o treinamento. O dataset de origem foi capturado em condicoes especificas: pecas padrao, bem iluminadas, sobre fundos contrastantes. O que ficou de fora do treino, ficou fora da deteccao.

*Caminho de evolucao:* re-treinar com dataset mais diverso (o Roboflow Universe tem colecoes publicas de LEGO com maior variedade de orientacoes e fundos), adicionar augmentacao de rotacao e contraste durante o treinamento, e incluir exemplos deliberadamente dificeis — pecas claras sobre fundo claro, placas em orientacoes extremas.

📷 Ver IMAGEM 3 no carrossel

---

*O FIX QUE FUNCIONOU NO CODIGO*

Havia um problema diferente dos anteriores: fotos tiradas em modo paisagem (mais largas do que altas) nao geravam nenhuma deteccao — nem de pecas que o modelo conhecia bem.

A causa estava no pre-processamento. O codigo redimensionava a imagem direto para 640x640 pixels, deformando a proporcao original. Para imagens paisagem, os objetos ficavam tao achatados que o modelo nao os reconhecia — porque nao foi treinado com objetos achatados dessa forma.

Solucao: letterboxing. A imagem e redimensionada mantendo a proporcao original, e o espaco restante e preenchido com cinza neutro — exatamente como o YOLOv8 espera receber a entrada. Depois disso, fotos de celular em modo paisagem passaram a funcionar normalmente.

Pre-processamento nao e detalhe. E parte do contrato com o modelo: se o treinamento foi feito de um jeito, a inferencia precisa seguir o mesmo padrao.

📷 Ver IMAGEM 4 no carrossel

---

*O RESULTADO*

O que funciona: voce arrasta uma foto ou video com pecas de LEGO. O modelo detecta cada peca, desenha um bounding box e monta um inventario automaticamente. Tudo no browser — sem servidor, sem GPU na nuvem, sem mandar dados para lugar nenhum. Para video, o sistema analisa 2 frames por segundo e exibe o resultado do frame com mais deteccoes confiaveis.

📷 Ver IMAGEM 1 no carrossel

O que nao funciona ainda: pecas longas horizontais, pecas com cor similar ao fundo, angulos muito extremos. Funcional para o desafio proposto. O caminho de evolucao para um produto real esta mapeado.

---

*O QUE APRENDI:*

✓ Reproduzir uma arquitetura que voce nao criou e uma das melhores formas de entender por que ela funciona. O DuckHunt foi o professor — o LEGO foi o laboratorio.

✓ O gap real nao era a deteccao — era o pos-processamento. Entender o que o modelo retorna (8400 ancoras candidatas) e saber filtrar, converter e aplicar NMS e onde o conhecimento tecnico de verdade esta.

✓ Limitacoes do modelo nao sao bugs de codigo. Quando o modelo nao ve uma peca, o problema geralmente esta na diversidade dos dados de treinamento — nao na implementacao.

✓ Pre-processamento e parte do contrato com o modelo. O letterboxing nao foi uma otimizacao — foi respeitar como o modelo foi treinado.

✓ Mapear o que nao funciona tem tanto valor quanto o que funciona. As limitacoes documentadas sao o roteiro da proxima iteracao.

---

Esse projeto nao tem nada de revolucionario. E simples, feito com ferramentas abertas, roda no browser de qualquer pessoa.

Mas conectou os fundamentos de uma forma concreta: da foto tirada pelo celular ate o inventario montado automaticamente, passando por redes neurais, tensores, pre-processamento e JavaScript. Sem servidor. Sem configuracao especial. Qualquer pessoa com um browser e uma foto.

E pude mostrar isso ao Ben. Que agora quer saber quando vai poder usar de verdade — sem as limitacoes ainda presentes.

Voce ja reproduziu uma arquitetura de ML para entender como ela funciona? O que esse processo revelou que a documentacao nao mostrava? 👇

---

## Hashtags

#TensorFlowJS #MachineLearning #JavaScript #ComputerVision #ObjectDetection #YOLOv8 #IA #WebGL #DesenvolvedoresBrasil #PosGraduacao #EngenhariadeIA #LEGO

---

## Metricas de Engajamento (preencher apos publicacao)

- **Data de publicacao:**
- **Visualizacoes:**
- **Reacoes:**
- **Comentarios:**
- **Compartilhamentos:**

---

## Insights e Aprendizados (preencher apos publicacao)

**O que funcionou:**
-

**O que pode melhorar:**
-

**Comentarios relevantes:**
-

---

## Versoes

| Versao | Data       | Alteracoes                                              |
|--------|------------|---------------------------------------------------------|
| 1.0    | 2026-03-01 | Versao inicial                                          |
| 1.1    | 2026-03-06 | Refocado: DuckHunt como aprendizado, nao-deteccao agrupada |
