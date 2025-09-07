# Meli-Scrap

Scraper resiliente para anúncios do **Mercado Livre / Mercado Libre** usando **Puppeteer + Stealth**.
Lê uma lista de **IDs ou URLs** de anúncios, navega de forma humana, fecha pop-ups, extrai **título, preço, vendas, compatibilidade, descrição, ficha técnica** e **todas as imagens** em alta quando possível.
Exporta os resultados em **CSV** (com BOM UTF-8 e **separador `;`**, amigável ao Excel PT-BR) e **JSON**.

> **Stack:** Node 18+, `puppeteer-extra` + `puppeteer-extra-plugin-stealth`, `random-useragent`. Stealth ajuda a reduzir sinais de automação; o random-UA escolhe user-agents reais de desktop. ([npm][1])

---

## ✨ Recursos

* **Entrada flexível:** aceita **IDs** (`MLBxxxxxxxxxx`, `MLBUxxxxxxxxxx`) ou **URLs completas** do Mercado Livre/Mercado Libre.
* **Evasão básica de detecção:** `puppeteer-extra-plugin-stealth` e **user-agents randômicos de desktop**. ([npm][1])
* **Coleta robusta de imagens:** tenta em ordem:

  1. **Lightbox** (PhotoSwipe)
  2. **DOM direto** (GitHub-style)
  3. **Thumbnails** com leitura da imagem principal.
     (Lightbox: elementos `.pswp`/PhotoSwipe.) ([photoswipe.com][2])
* **Descrição e ficha técnica:** varre seletores comuns, clica em “ver mais” quando precisa e faz **fallback por varredura de texto**.
* **CSV amigável ao Excel PT-BR:** inclui **BOM UTF-8** e **separador `;`** (útil onde a vírgula é separador decimal). ([Suporte Microsoft][3], [ablebits.com][4])

---

## 📦 Pré-requisitos

* **Node.js** 18+
* **Chrome**/Chromium será baixado automaticamente pelo Puppeteer (padrão do pacote).

---

## 🚀 Instalação

```bash
git clone https://github.com/<seu-usuario>/Meli-Scrap.git
cd Meli-Scrap
npm i
```

---

## 🗂️ Estrutura de entrada

Crie um arquivo `mlb_ids.txt` (um por linha), com **IDs** ou **URLs**:

```
MLB-1967108261
MLB1973276698
https://produto.mercadolivre.com.br/MLB-1234567890
https://articulo.mercadolibre.com.ar/MLA-1122334455
```

O script reconhece automaticamente se é **URL** do ML/MLB ou **ID** e monta a URL correta.

---

## ⚙️ Configuração rápida

No topo do arquivo `Meli-Scrap.js` há constantes que você pode ajustar:

```js
const DEFAULT_IDS_FILE = 'D:\\Trabaio\\Meli\\Meli-scarp\\mlb_ids.txt';
const DEFAULT_CSV_PATH = 'D:\\Trabaio\\Meli\\Meli-scarp\\mlb\\WEGA_saida.csv';
const DEFAULT_JSON_PATH = 'D:\\Trabaio\\Meli\\Meli-scarp\\mlb\\WEGA_saida.json';
const HEADLESS = true;            // true = headless; false = abre o navegador
const MAX_WAIT_MS = 12000;        // timeouts de seletor
const PAUSE_MS = [900, 2500];     // “pausas humanas” aleatórias
```

> Dica: se você usa **vírgula** como separador decimal no Excel, é comum abrir CSVs com **`;`** como delimitador. Você também pode ajustar os separadores do Excel em `Arquivo → Opções → Avançado`. ([Suporte Microsoft][3], [ablebits.com][4])

---

## ▶️ Como usar

```bash
node Meli-Scrap.js
```

Saídas esperadas:

* **CSV** em `DEFAULT_CSV_PATH` (com BOM e separador `;`)
* **JSON** em `DEFAULT_JSON_PATH`

Campos principais:

* `item_id`, `item_type` (`id` | `url`)
* `permalink`
* `nome_ad`, `preco`, `vendas`, `compatibilidade`, `descricao`
* `qtd_imagens`, `imagens_urls` (pipe-separated no CSV)
* `ficha_tecnica` (pares `Chave: Valor | ...`)
* `erro`, `tentativas` (em casos de falha)

---

## 🧠 Como funciona (resumo técnico)

1. **UA & Headers:** aplica um **user-agent randômico de desktop** e `Accept-Language` PT-BR. ([npm][5])
2. **Stealth:** ativa `puppeteer-extra-plugin-stealth` para esconder sinais comuns de automação. ([npm][1])
3. **Pop-ups:** tenta fechar “Mais tarde / Agora não / Fechar”.
4. **Seletores tolerantes:** busca título (`h1.ui-pdp-title` e variações), preço (frac/cents/metas), subtítulos (vendidos/compat).
5. **Descrição:** tenta seletores padrão, expande conteúdo colapsado e faz **fallback** por varredura de nós de texto.
6. **Imagens:** tenta abrir **lightbox** (PhotoSwipe `.pswp` → seta direita → coleta `src`), senão DOM direto, senão thumbnails. ([photoswipe.com][2])
7. **Ficha técnica:** percorre tabelas/listas (`th/td`, `dt/dd`, spans), deduplica pares e serializa.

---

## 📄 Exemplos de saída

**CSV** (delimitador `;`, `imagens_urls` pipe-separated):

```
item_id;item_type;nome_ad;descricao;ficha_tecnica;vendas;qtd_imagens;imagens_urls;preco;compatibilidade;permalink;erro;tentativas
MLB1973276698;id;Pastilha XYZ;...;Marca: ABC | Linha: Premium;1.234 vendidos;5;https://...img1.jpg | https://...img2.jpg;R$ 199,90;...;https://produto.mercadolivre.com.br/MLB-1973276698;;
```

**JSON**: array de objetos com os mesmos campos do CSV.

---

## 🧩 Dicas & troubleshooting

* **`Execution context was destroyed, most likely because of a navigation.`**
  O ML/MLB às vezes recarrega se detecta interação; o script já usa `waitForSelector` + pausas. Se necessário, aumente `MAX_WAIT_MS` e deixe `HEADLESS=false` para observar o fluxo.

* **Headless vs. “humano”**
  Em alguns cenários, abrir com **`HEADLESS=false`** reduz recarregamentos inesperados.

* **Imagens faltando**
  Tente rolar até a galeria manualmente (o script faz isso) e garanta que o lightbox abriu (`.pswp` visível). PhotoSwipe exige que o item esteja carregado/visível para trocar imagens. ([photoswipe.com][2])

* **CSV no Excel “tudo em uma coluna”**
  Abra via **Dados → De Texto/CSV** e escolha o delimitador **`;`**; ou ajuste os **separadores do Excel** conforme sua região. ([Super User][6], [Suporte Microsoft][3])

---

## 🔒 Uso responsável (ToS / robots.txt)

Antes de rodar em escala:

* **Verifique o `robots.txt`** e respeite restrições (subdomínio/país podem variar). Exemplos agregados indicam regras específicas para certos user-agents e alguns caminhos desautorizados; confira sempre a versão vigente do domínio que você está acessando. ([Well-Known Index][7])
* `robots.txt` **orienta crawlers sobre onde podem ir** e ajuda a evitar sobrecarga; não é um mecanismo de segurança nem de privacidade. ([Google for Developers][8])
* **Evite taxas altas de requisição** (risco de bloqueio). Grandes players têm relatado problemas públicos com crawlers agressivos; mantenha **pausas aleatórias** e limites. ([The Verge][9])
* Consulte também os **Termos do Programa de Desenvolvedores** do Mercado Libre se for integrar APIs ou soluções de terceiros. ([global-selling.mercadolibre.com][10])

> Este projeto é para fins educacionais. Você é responsável por como o utiliza e por cumprir leis, termos e políticas dos sites-alvo.

---

## 🗺️ Roadmap (ideias)

* Baixar as imagens em disco (com estrutura por ID).
* Exportar **NDJSON/Parquet**.
* CLI com opções (`--in`, `--csv`, `--json`, `--headless=false`, `--delay=900:2500`).
* Suporte a **proxy**/rotacionadores.
* Coleta de **reviews/QA**.

---

## 🛡️ Licença

MIT — veja `LICENSE`.

---

## 🙌 Créditos

* **puppeteer-extra + stealth** (evita sinais de automação) ([npm][1])
* **random-useragent** (UA randômicos com filtro desktop) ([npm][5])
* **PhotoSwipe** (lightbox observado na coleta por `.pswp`) ([photoswipe.com][2])

---

Se quiser, eu já converto as **constantes de caminho** para **variáveis de ambiente** e adiciono um **bin CLI** (`npx meli-scrap --in ids.txt ...`).

[1]: https://www.npmjs.com/package/puppeteer-extra-plugin-stealth?utm_source=chatgpt.com "puppeteer-extra-plugin-stealth"
[2]: https://photoswipe.com/methods/?utm_source=chatgpt.com "PhotoSwipeLightbox methods"
[3]: https://support.microsoft.com/en-us/office/change-the-character-used-to-separate-thousands-or-decimals-c093b545-71cb-4903-b205-aebb9837bd1e?utm_source=chatgpt.com "Change the character used to separate thousands or decimals"
[4]: https://www.ablebits.com/office-addins-blog/change-excel-csv-delimiter/?utm_source=chatgpt.com "How to change Excel CSV delimiter to comma or semicolon"
[5]: https://www.npmjs.com/package/random-useragent?utm_source=chatgpt.com "random-useragent"
[6]: https://superuser.com/questions/407082/easiest-way-to-open-csv-with-commas-in-excel?utm_source=chatgpt.com "Easiest way to open CSV with commas in Excel - Super User"
[7]: https://well-known.dev/resources/robots_txt/sites/mercadolibre.com?utm_source=chatgpt.com "mercadolibre.com robots.txt - Well-known.dev"
[8]: https://developers.google.com/search/docs/crawling-indexing/robots/intro?hl=es&utm_source=chatgpt.com "Introducción a los archivos robots.txt"
[9]: https://www.theverge.com/2024/7/25/24205943/anthropic-ai-web-crawler-claudebot-ifixit-scraping-training-data?utm_source=chatgpt.com "Anthropic's crawler is ignoring websites' anti-AI scraping policies"
[10]: https://global-selling.mercadolibre.com/devsite/mercado-libre-global-selling-developer-terms-and-conditions?utm_source=chatgpt.com "Terms and Conditions"
