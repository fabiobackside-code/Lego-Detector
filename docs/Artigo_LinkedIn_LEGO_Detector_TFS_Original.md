# Artigo LinkedIn - LEGO Detector TFS Original

## Metadados

- **Projeto:** LEGO Detector TFS Original
- **Tecnologia:** TensorFlow.js, JavaScript, WebGL, YOLOv8
- **Data de criação:** 2026-03-01
- **Tempo de leitura estimado:** ~5 minutos
- **Público-alvo:** Desenvolvedores, ML Engineers, entusiastas de IA
- **Objetivo:** Compartilhar jornada técnica e engajar comunidade

---

## Texto Completo do Artigo

### VERSÃO LINKEDIN (sem markdown — formatação para publicação direta)

Algumas peças de LEGO estavam visíveis na foto. O modelo simplesmente não as via.

Entender por que me ensinou mais do que qualquer linha de código que eu poderia ter escrito.

---

Estou na pós-graduação em Engenharia de IA. Num dos módulos de fundamentos, o instrutor apresentou um exemplo que ficou na minha cabeça: o DuckHunt-JS, uma versão do clássico da Nintendo onde um modelo de visão computacional detecta os patos em tempo real no browser — via YOLOv8 e TensorFlow.js, sem nenhum servidor. O desafio proposto foi simples: pegue essa estrutura e aplique num caso de uso seu.

Lembrei da gaveta do Ben.

Meu filho tem uma coleção de LEGO que, na prática, é um caos organizado por bagunça. Encontrar uma peça específica naquela gaveta exige paciência que nem sempre existe. Existia modelo treinado para detectar peças LEGO? Existia — um fine-tune de YOLOv8 disponível no Kaggle, feito especificamente para isso.

A ideia era direta: mesma arquitetura do DuckHunt, mesmo stack, mesmo formato de modelo — só com peças LEGO no lugar dos patos e uma foto no lugar do jogo. O exercício era justamente esse: reproduzir a abordagem num contexto diferente e, no processo, entender como ela realmente funcionava.

---

*REPRODUZINDO O DUCKHUNT*

O DuckHunt tem uma arquitetura elegante: um Web Worker isola a inferência da interface, o modelo roda via TensorFlow.js, e a comunicação entre UI e Worker é feita via postMessage com ImageBitmap transferido sem cópia de memória.

O pré-processamento é idêntico linha a linha: tf.browser.fromPixels para capturar os pixels, resizeBilinear para 640x640, divisão por 255 para normalizar, expandDims para encaixar no formato esperado pelo modelo. Isso não muda — é o contrato do YOLOv8.

O ponto onde o desafio precisava avançar estava no pós-processamento. No DuckHunt, a função de detecção retornava coordenadas fixas — uma simplificação que funcionava para o contexto do jogo. O modelo LEGO, porém, retorna um tensor bruto: 8400 âncoras candidatas, cada uma com posição, tamanho e confiança. É necessário filtrar por threshold, converter de cx/cy/w/h para coordenadas de canto, e aplicar NMS com tf.image.nonMaxSuppressionAsync para eliminar caixas duplicadas sobre a mesma peça. Toda essa análise inicial já deu uma dor de cabeça, mas foi determinante para tudo seguir.

Reproduzir isso, passo a passo, foi o núcleo do aprendizado. Não inventar — entender o que já existia e preencher o gap real.

---

*O QUE O MODELO NÃO VÊ — E O QUE ISSO ENSINA*

Com o detector funcionando, os testes com fotos reais revelaram algo que nenhuma documentação deixa claro de antemão: algumas peças simplesmente não apareciam. E o problema não estava no código.

Peças longas em orientação horizontal — uma placa 2x16 ou 1x16 deitada — não eram detectadas. Confiança zero, como se a peça não existisse na imagem. A causa estava no treinamento: o modelo não havia visto exemplos suficientes de objetos com esse tipo de proporção extrema. Sem exemplos no treino, a confiança fica abaixo de qualquer threshold razoável.

Peças com cor similar ao fundo apresentavam o mesmo comportamento. Uma peça branca sobre superfície branca. Uma peça cinza clara em fundo cinza. Modelos de visão computacional dependem de contraste para identificar bordas de objetos — quando esse contraste não existe, o modelo não consegue separar a peça do fundo.

O que esses casos têm em comum? Não são falhas de implementação. São reflexos diretos do que o modelo viu — ou não viu — durante o treinamento. O dataset de origem foi capturado em condições específicas: peças padrão, bem iluminadas, sobre fundos contrastantes. O que ficou de fora do treino, ficou fora da detecção.

O caminho de evolução está claro: re-treinar com dataset mais diverso — o Roboflow Universe tem coleções públicas de LEGO com maior variedade de orientações e fundos —, adicionar augmentação de rotação e contraste durante o treinamento, e incluir exemplos deliberadamente difíceis. Mapear o que não funciona tem tanto valor quanto o que funciona.

---

*O FIX QUE FUNCIONOU*

Havia um terceiro problema, diferente dos anteriores e com solução no código: fotos tiradas em modo paisagem não geravam nenhuma detecção — nem de peças que o modelo conhecia bem.

A causa estava no pré-processamento. O código redimensionava a imagem direto para 640x640 pixels, deformando a proporção original. Para imagens paisagem, os objetos ficavam tão achatados que o modelo não os reconhecia — porque não foi treinado com objetos achatados dessa forma.

A solução foi o letterboxing: a imagem é redimensionada mantendo a proporção original, e o espaço restante é preenchido com cinza neutro — exatamente como o YOLOv8 espera receber a entrada. Depois disso, fotos de celular em modo paisagem passaram a funcionar normalmente.

Pré-processamento não é detalhe. É parte do contrato com o modelo: se o treinamento foi feito de um jeito, a inferência precisa seguir o mesmo padrão. Violar esse contrato gera resultados que parecem bugs de código, mas são, na verdade, incompatibilidades de contexto.

---

*O QUE FUNCIONOU NO FINAL*

Você arrasta uma foto ou vídeo com peças de LEGO. O modelo detecta cada peça, desenha um bounding box e monta um inventário automaticamente. Tudo no browser — sem servidor, sem GPU na nuvem, sem mandar dados para lugar nenhum. Para vídeo, o sistema analisa 2 frames por segundo e exibe o resultado do frame com mais detecções confiáveis.

Peças longas horizontais, peças com cor similar ao fundo e ângulos muito extremos ainda escapam. O comportamento atual é funcional para o desafio proposto. O caminho de evolução para um resultado mais robusto está mapeado e documentado.

---

*O QUE APRENDI DE VERDADE*

Reproduzir uma arquitetura que você não criou é uma das melhores formas de entender por que ela funciona. O DuckHunt foi o professor — o LEGO foi o laboratório. Não se aprende uma arquitetura lendo sobre ela; aprende-se quando você tenta reproduzi-la num contexto diferente e precisa resolver o que a documentação não cobre.

O gap real não era a detecção em si — era o pós-processamento. Entender o que o modelo retorna (8400 âncoras candidatas) e saber filtrar, converter e aplicar NMS é onde o conhecimento técnico de verdade se consolida. Essa parte não vem pronta no tutorial.

Limitações do modelo não são bugs de código. Quando o modelo não vê uma peça, o problema geralmente está na diversidade dos dados de treinamento — não na implementação. Essa virada de perspectiva muda como você debugga, como você formula hipóteses e como você define o próximo passo.

Pré-processamento é parte do contrato com o modelo. O letterboxing não foi uma otimização — foi respeitar como o modelo foi treinado. Ignorar esse contrato gera resultados ilusoriamente incorretos.

Explorar esse exemplo foi válido. Não porque chegou a um produto acabado, mas porque cada problema encontrado forçou uma compreensão mais profunda — de tensores, de pós-processamento, de como datasets de treinamento definem os limites do que um modelo consegue enxergar.

---

O projeto está no GitHub, aberto para quem quiser explorar, contribuir ou adaptar para um caso de uso próprio:

https://github.com/fabiobackside-code/Lego-Detector

Esse projeto não tem nada de revolucionário. É simples, feito com ferramentas abertas, roda no browser de qualquer pessoa.

Mas conectou os fundamentos de uma forma concreta: da foto tirada pelo celular até o inventário montado automaticamente, passando por redes neurais, tensores, pré-processamento e JavaScript. Sem servidor. Sem configuração especial. Qualquer pessoa com um browser e uma foto.

E pude mostrar isso ao Ben. Que agora quer saber quando vai poder usar de verdade — sem as limitações ainda presentes.

Você já reproduziu uma arquitetura de ML para entender como ela funciona? O que esse processo revelou que a documentação não mostrava? Deixa aqui nos comentários. 👇

---

## Hashtags

#TensorFlowJS #MachineLearning #JavaScript #ComputerVision #ObjectDetection #YOLOv8 #IA #WebGL #DesenvolvedoresBrasil #PosGraduacao #EngenhariadeIA #LEGO

---

## Métricas de Engajamento (preencher após publicação)

- **Data de publicação:**
- **Visualizações:**
- **Reações:**
- **Comentários:**
- **Compartilhamentos:**

---

## Insights e Aprendizados (preencher após publicação)

**O que funcionou:**
-

**O que pode melhorar:**
-

**Comentários relevantes:**
-

---

## Versões

| Versão | Data       | Alterações                                                                          |
|--------|------------|-------------------------------------------------------------------------------------|
| 1.0    | 2026-03-01 | Versão inicial                                                                      |
| 1.1    | 2026-03-06 | Refocado: DuckHunt como aprendizado, não-detecção agrupada                          |
| 1.2    | 2026-03-16 | Removidas referências a imagens, texto humanizado, GitHub adicionado                |
| 1.3    | 2026-03-16 | Correção ortográfica: acentuação padrão português Brasil                            |
