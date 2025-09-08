// Meli-Scrap.js
// Execute: node Meli-Scrap.js

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// puppeteer-extra + stealth
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
puppeteer.use(StealthPlugin());

// user-agent randômico (desktop-only)
import randomUseragent from "random-useragent";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ====== CONFIG ======
const DEFAULT_IDS_FILE  = "D:\\Trabaio\\Meli\\Meli-scarp\\mlb_ids.txt";
const DEFAULT_CSV_PATH  = "D:\\Trabaio\\Meli\\Meli-scarp\\mlb\\1saida.csv";
const DEFAULT_JSON_PATH = "D:\\Trabaio\\Meli\\Meli-scarp\\mlb\\1saida.json";
const HEADLESS = true;
const MAX_WAIT_MS = 12000;
const PAUSE_MS = [900, 2500];
// ====================

// ---------- UTIL: limpeza e normalização de texto ----------
function cleanTxt(s) {
    if (s == null) return "";
    return String(s)
        .replace(/\u00A0/g, " ")   // NBSP -> espaço normal
        .replace(/\s+/g, " ")      // compacta espaços em branco
        .trim()
        .normalize("NFC");         // normaliza acentos
}

// filtro do random-useragent (a lib retorna objetos)
const DESKTOP_FILTER = (entry) => {
    const s = entry?.userAgent || "";
    return /Windows NT|Macintosh/i.test(s) && !/Mobile/i.test(s);
};

const FALLBACK_UAS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
];

const getRandomDesktopUA = () => {
    const entry = randomUseragent.getRandom(DESKTOP_FILTER);
    const ua = entry?.userAgent;
    return typeof ua === "string" && ua.length > 0
        ? ua
        : FALLBACK_UAS[Math.floor(Math.random() * FALLBACK_UAS.length)];
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const humanPause = async (min = PAUSE_MS[0], max = PAUSE_MS[1]) =>
    sleep(Math.floor(Math.random() * (max - min + 1)) + min);

async function readIds(txtPath) {
    const raw = await fs.readFile(txtPath, "utf8");
    const ids = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (ids.length === 0) throw new Error(`Nenhum ID em: ${txtPath}`);
    return ids;
}

async function newBrowser() {
    return puppeteer.launch({
        headless: HEADLESS,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--window-size=1366,2200",
        ],
        defaultViewport: { width: 1366, height: 2200 },
    });
}

async function waitAny(page, selectors, timeout = MAX_WAIT_MS) {
    return page.waitForSelector(selectors.join(", "), { timeout });
}

/** Links por regra:
 * MLBU##########  -> http://mercadolivre.com.br/aaa/up/MLBU##########
 * MLB##########   -> https://produto.mercadolivre.com.br/MLB-##########
 */
function buildUrlByRule(itemId) {
    const id = itemId.trim().toUpperCase();
    if (id.startsWith("MLBU")) return `http://mercadolivre.com.br/aaa/up/${id}`;
    if (id.startsWith("MLB-")) return `https://produto.mercadolivre.com.br/${id}`;
    if (id.startsWith("MLB")) return `https://produto.mercadolivre.com.br/MLB-${id.slice(3)}`;
    return null;
}

/** Scroll seguro para o elemento */
async function safeScrollToElement(page, selector) {
    await page.evaluate((sel) => {
        const element = document.querySelector(sel);
        if (element) {
            element.scrollIntoView({
                behavior: 'auto',
                block: 'center',
                inline: 'center'
            });
        }
    }, selector);
    await humanPause(300, 600);
}

/** Fecha popups por texto (sem XPath) */
async function dismissPopups(page) {
    const texts = ["Mais tarde", "Agora não", "Fechar", "Accept", "Aceitar", "OK", "Entendi"];
    for (const t of texts) {
        const clicked = await page.evaluate((label) => {
            const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], div[class*="close"], span[class*="close"]'));
            for (const el of candidates) {
                const txt = (el.textContent || "").trim();
                if (txt.includes(label)) {
                    el.click();
                    return true;
                }
            }
            return false;
        }, t);
        if (clicked) await humanPause(200, 500);
    }

    // Fecha overlays específicos se existirem
    const overlaySelectors = [
        '.ui-pdp-overlay',
        '.modal-backdrop',
        '.overlay',
        '[data-testid="overlay"]',
        '.pswp' // Photoswipe overlay
    ];

    for (const selector of overlaySelectors) {
        const overlay = await page.$(selector);
        if (overlay) {
            await page.evaluate((sel) => {
                const element = document.querySelector(sel);
                if (element && element.parentNode) {
                    element.parentNode.removeChild(element);
                }
            }, selector);
            await humanPause(100, 300);
        }
    }
}

/** Abre a página do item pela regra definida */
async function openByRule(page, itemId) {
    const url = buildUrlByRule(itemId);
    if (!url) return { ok: false, reason: "Prefixo de ID não suportado", tried: [] };
    console.log(`🔎 [${itemId}] Tentando abrir: ${url}`);
    try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        await dismissPopups(page);
        const ok = await waitAny(page, ["h1.ui-pdp-title", "h1#product-title", "h1"], 8000)
            .then(() => true)
            .catch(() => false);
        if (ok) {
            console.log(`✅ [${itemId}] Página carregada com sucesso.`);
            return { ok: true, url, tried: [url] };
        }
    } catch (e) {
        console.log(`❌ [${itemId}] Erro ao carregar página: ${e.message}`);
    }
    return { ok: false, reason: "Não abriu como produto (sem título)", tried: [url] };
}

// =============== EXTRATORES BÁSICOS ===============
async function getTitle(page) {
    const candidates = ["h1.ui-pdp-title", "h1#product-title", "h1"];
    for (const sel of candidates) {
        const el = await page.$(sel);
        if (el) {
            const txt = (await page.evaluate(e => e.textContent?.trim() || "", el)) || "";
            if (txt) return cleanTxt(txt);
        }
    }
    return "";
}

async function getPrice(page) {
    const frac = await page.$(".andes-money-amount__fraction");
    if (frac) {
        const f = await page.evaluate(e => e.textContent?.trim() || "", frac);
        const centsEl = await page.$(".andes-money-amount__cents");
        const c = centsEl ? (await page.evaluate(e => e.textContent?.trim() || "", centsEl)) : "";
        return cleanTxt(c ? `${f},${c}` : f);
    }
    const selMeta = await page.$("[itemprop='price'], meta[property='product:price:amount']");
    if (selMeta) {
        const val = await page.evaluate(el => el.getAttribute("content") || el.textContent || "", selMeta);
        if (val) return cleanTxt(val);
    }
    const anyPrice = await page.$("[class*='price'], [data-testid*='price']");
    if (anyPrice) {
        const txt = await page.evaluate(el => el.textContent?.trim() || "", anyPrice);
        if (txt) return cleanTxt(txt);
    }
    return "";
}

async function getSoldAndCompat(page) {
    let vendidos = "", compat = "";
    const subs = await page.$$(`.ui-pdp-subtitle, .ui-pdp-header__subtitle`);
    for (const s of subs) {
        const t = cleanTxt(await page.evaluate(e => e.textContent || "", s));
        const low = t.toLowerCase();

        // Filtra apenas a parte numérica das vendas (remove "Novo | ")
        if (!vendidos && low.includes("vendido")) {
            vendidos = t.replace(/^novo\s*\|\s*/i, "").trim();
        }

        if (!compat && low.includes("compat")) compat = t;
    }

    // Fallback para compatibilidade
    if (!compat) {
        try {
            compat = await page.evaluate(() => {
                const needle = "verificar compatibilidade";
                const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
                let node;
                while ((node = walker.nextNode())) {
                    const txt = (node.textContent || "").trim().toLowerCase();
                    if (txt.includes(needle)) return node.parentElement?.textContent?.trim() || txt;
                }
                return "";
            });
            compat = cleanTxt(compat);
        } catch {}
    }

    return { vendidos, compat };
}

// =============== DESCRIÇÃO ===============
async function getDescription(page) {
    try {
        console.log("   • Procurando descrição...");

        // 1. Primeiro, tenta encontrar a descrição em elementos comuns
        const selectors = [
            'p.ui-pdp-description__content',
            '.ui-pdp-description__content',
            '[data-testid="content"]',
            '#description p',
            '.ui-pdp-collapsable__container',
            '.ui-pdp-description',
            '.ui-pdp-container__col--description',
            '.item-description',
            '.product-description',
            '[itemprop="description"]'
        ];

        for (const selector of selectors) {
            const element = await page.$(selector);
            if (element) {
                const description = await page.evaluate(el => el.textContent?.trim() || '', element);
                if (description) {
                    console.log(`   ✅ Descrição encontrada via seletor: ${selector}`);
                    return cleanTxt(description);
                }
            }
        }

        // 2. Se não encontrou, tenta expandir a descrição colapsada
        console.log("   • Tentando expandir descrição colapsada...");
        const expandButtons = [
            'a.ui-pdp-collapsable__action',
            '[title="Ver descrição completa"]',
            '.ui-pdp-description__action',
            '.description-expand'
        ];

        let expanded = false;
        for (const buttonSelector of expandButtons) {
            const expandButton = await page.$(buttonSelector);
            if (expandButton) {
                try {
                    // Use evaluate para clicar via JavaScript em vez de click() direto
                    await expandButton.evaluate(el => el.click());
                    await humanPause(1000, 2000); // Pausa mais longa para carregamento
                    expanded = true;
                    console.log(`   ✅ Botão de expandir clicado: ${buttonSelector}`);
                    break;
                } catch (e) {
                    console.log(`   ❌ Erro ao clicar no botão: ${e.message}`);
                }
            }
        }

        // 3. Tenta novamente após expandir
        if (expanded) {
            for (const selector of selectors) {
                const element = await page.$(selector);
                if (element) {
                    const description = await page.evaluate(el => el.textContent?.trim() || '', element);
                    if (description) {
                        console.log(`   ✅ Descrição encontrada após expandir: ${selector}`);
                        return cleanTxt(description);
                    }
                }
            }
        }

        // 4. Fallback: procura texto de descrição em qualquer elemento
        console.log("   • Fallback: procurando texto de descrição em qualquer elemento...");
        const descriptionText = await page.evaluate(() => {
            const textNodes = [];
            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: (node) => {
                        // Foca em textos mais longos que podem conter descrições
                        const text = node.textContent.trim();
                        return text.length > 100 &&
                        !text.includes('function') &&
                        !text.includes('var ') &&
                        !text.includes('const ') &&
                        !text.includes('let ') &&
                        !node.parentElement.closest('script') &&
                        !node.parentElement.closest('style') &&
                        !node.parentElement.closest('nav') &&
                        !node.parentElement.closest('header') &&
                        !node.parentElement.closest('footer') ?
                            NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                    }
                }
            );

            let node;
            while ((node = walker.nextNode())) {
                textNodes.push(node.textContent.trim());
            }

            // Retorna o texto mais longo encontrado (provavelmente a descrição)
            return textNodes.sort((a, b) => b.length - a.length)[0] || '';
        });

        if (descriptionText) {
            console.log("   ✅ Descrição encontrada via fallback");
            return cleanTxt(descriptionText);
        }

        // 5. Último recurso: tenta encontrar via XPath (baseado nos arquivos .rs)
        console.log("   • Tentando via XPath...");
        const xpaths = [
            "//div[@id='description']/p",
            "//div[contains(@class, 'ui-pdp-description__content')]",
            "//div[contains(@class, 'ui-pdp-collapsable__container')]",
            "//p[contains(@class, 'ui-pdp-description__content')]"
        ];

        for (const xpath of xpaths) {
            const elements = await page.$x(xpath);
            if (elements.length > 0) {
                const description = await page.evaluate(el => el.textContent?.trim() || '', elements[0]);
                if (description) {
                    console.log(`   ✅ Descrição encontrada via XPath: ${xpath}`);
                    return cleanTxt(description);
                }
            }
        }

    } catch (e) {
        console.log('   ❌ Erro ao extrair descrição:', e.message);
    }

    console.log("   ❌ Nenhuma descrição encontrada");
    return '';
}

// =============== IMAGENS ===============

/** Lê contador do carrossel quando houver (hint) */
async function getImagesCount(page) {
    const selectors = [
        ".ui-pdp-carousel-snapped__counter .pagination-total",
        ".ui-pdp-carousel__counter .pagination-total",
        ".ui-pdp-carousel-snapped__counter [class*='pagination-total']",
        ".ui-pdp-carousel__counter [class*='pagination-total']"
    ];
    const joined = selectors.join(", ");
    try {
        const n = await page.$eval(joined, el => {
            const txt = (el.textContent || "").replace(/\D+/g, "");
            return parseInt(txt, 10) || 0;
        });
        if (Number.isFinite(n) && n > 0) return n;
    } catch {}
    // fallback: conta thumbnails visíveis
    try {
        const thumbs = await page.$$eval(
            "#ui-pdp-main-container .ui-pdp-gallery__thumbnail, #ui-pdp-main-container .ui-pdp-gallery__wrapper li, #ui-pdp-main-container .ui-pdp-thumbnail, #ui-pdp-main-container .ui-pdp-gallery__item",
            els => els.length
        );
        if (thumbs > 0) return thumbs;
    } catch {}
    return 0;
}

/** Método 'GitHub-style': coleta URLs diretamente do DOM do anúncio (sem cliques) */
async function getImageUrlsGithubStyle(page) {
    console.log("   • Coletando imagens (GitHub-style DOM)...");
    const urls = await page.evaluate(() => {
        const set = new Set();

        const root = document.querySelector("#ui-pdp-main-container") || document.body;

        root.querySelectorAll(".ui-pdp-gallery__figure img, .ui-pdp-image__figure img").forEach(im => {
            const u = im.getAttribute("data-zoom") || im.getAttribute("src") || "";
            if (u && /^https?:\/\//i.test(u)) set.add(u.split("?")[0]);
        });

        root.querySelectorAll(".ui-pdp-gallery__thumbnail img").forEach(im => {
            const u = im.getAttribute("data-zoom") || im.getAttribute("src") || "";
            if (u && /^https?:\/\//i.test(u)) set.add(u.split("?")[0]);
        });

        const og = document.querySelector('meta[property="og:image"]');
        if (og) {
            const u = og.getAttribute("content") || "";
            if (u && /^https?:\/\//i.test(u)) set.add(u.split("?")[0]);
        }

        return Array.from(set).filter(u => /mlstatic\.com/i.test(u) && !/\.(svg|gif)$/i.test(u));
    });

    console.log(`   • GitHub-style capturou ${urls.length} url(s).`);
    return urls;
}

/** Abre o lightbox e coleta URLs (Photoswipe). Se falhar, retorna []. */
async function getImageUrlsFromLightbox(page, expectedCountHint = 0) {
    console.log("   • Abrindo galeria (lightbox) para capturar URLs...");
    const clickSelectors = [
        "#ui-pdp-main-container .ui-pdp-gallery__figure img",
        "#ui-pdp-main-container .ui-pdp-image__figure img",
        "#ui-pdp-main-container .ui-pdp-gallery__thumbnail img",
    ];
    let clicked = false;
    for (const sel of clickSelectors) {
        const el = await page.$(sel);
        if (el) {
            // Use evaluate para clicar via JavaScript em vez de click() direto
            await el.evaluate(el => el.click());
            clicked = true;
            break;
        }
    }
    if (!clicked) {
        console.log("   • Não achei imagem clicável para abrir o lightbox.");
        return [];
    }
    try {
        await page.waitForSelector(".pswp", { timeout: 6000 });
    } catch {
        console.log("   • Lightbox não apareceu.");
        return [];
    }

    let total = expectedCountHint || 0;
    try {
        await page.waitForSelector(".pswp__counter", { timeout: 3000 });
        const counterText = await page.$eval(".pswp__counter", el => (el.textContent || "").trim());
        const m = counterText.match(/\/\s*(\d+)/);
        if (m) total = parseInt(m[1], 10) || total;
    } catch {}

    async function getCurrentLightboxSrc() {
        return page.evaluate(() => {
            const imgs = Array.from(document.querySelectorAll(".pswp__img"));
            const vis = imgs.find(img => {
                const r = img.getBoundingClientRect();
                const st = window.getComputedStyle(img);
                return r.width > 20 && r.height > 20 && st.opacity !== "0" && st.display !== "none" && st.visibility !== "hidden";
            }) || imgs[0];
            let src = vis ? (vis.getAttribute("src") || vis.getAttribute("data-src") || "") : "";
            if (src.includes("?")) src = src.split("?")[0];
            return src;
        });
    }

    const urls = new Set();
    const maxIters = Math.max(total || 10, 10) + 5;
    const first = await getCurrentLightboxSrc();
    if (first) urls.add(first);

    const nextSelectors = [".pswp__button--arrow--right", ".pswp__button.pswp__button--arrow--right"];
    for (let i = 0; i < maxIters; i++) {
        let advanced = false;
        for (const sel of nextSelectors) {
            const btn = await page.$(sel);
            if (btn) {
                // Use evaluate para clicar via JavaScript em vez de click() direto
                await btn.evaluate(el => el.click());
                advanced = true;
                break;
            }
        }
        if (!advanced) await page.keyboard.press("ArrowRight");

        const prevLast = Array.from(urls).slice(-1)[0] || "";
        try {
            await page.waitForFunction((prev) => {
                const imgs = Array.from(document.querySelectorAll(".pswp__img"));
                const vis = imgs.find(img => {
                    const r = img.getBoundingClientRect();
                    const st = window.getComputedStyle(img);
                    return r.width > 20 && r.height > 20 && st.opacity !== "0" && st.display !== "none" && st.visibility !== "hidden";
                }) || imgs[0];
                let src = vis ? (vis.getAttribute("src") || vis.getAttribute("data-src") || "") : "";
                if (src.includes("?")) src = src.split("?")[0];
                return src && src !== prev;
            }, { timeout: 5000 }, prevLast);
        } catch {}

        const src = await getCurrentLightboxSrc();
        if (src) urls.add(src);
        if (total && urls.size >= total) break;
        if (first && src === first && urls.size > 1) break;
    }

    try {
        const closeBtn = await page.$(".pswp__button--close, .pswp__button--close");
        if (closeBtn) {
            // Use evaluate para clicar via JavaScript em vez de click() direto
            await closeBtn.evaluate(el => el.click());
        } else {
            await page.keyboard.press("Escape");
        }
    } catch {}

    const filtered = Array.from(urls).filter(u => (/https?:\/\/(http2\.)?mlstatic\.com/i.test(u)) || !/\.(svg|gif)$/i.test(u));
    return filtered;
}

/** Fallback: clicar thumbs e capturar imagem principal */
async function getImageUrlsFromThumbs(page, expectedCountHint = 0) {
    console.log("   • Fallback: coletando via thumbnails e imagem principal...");
    const urls = new Set();

    const thumbSel = "#ui-pdp-main-container .ui-pdp-gallery__thumbnail, #ui-pdp-main-container .ui-pdp-gallery__wrapper li, #ui-pdp-main-container .ui-pdp-thumbnail, #ui-pdp-main-container .ui-pdp-gallery__item";
    const thumbs = await page.$$(thumbSel);

    async function getCurrentMainSrc() {
        return page.evaluate(() => {
            const root = document.querySelector("#ui-pdp-main-container");
            if (!root) return "";
            const candidates = root.querySelectorAll(".ui-pdp-image__figure img, .ui-pdp-gallery__figure img");
            let src = "";
            for (const im of candidates) {
                const rect = im.getBoundingClientRect();
                const st = window.getComputedStyle(im);
                if (rect.width > 100 && rect.height > 100 && st.opacity !== "0" && st.display !== "none") {
                    src = im.getAttribute("data-zoom") || im.getAttribute("src") || "";
                    if (src) break;
                }
            }
            if (src.includes("?")) src = src.split("?")[0];
            return src || "";
        });
    }

    if (!thumbs.length) {
        const s0 = await getCurrentMainSrc();
        if (s0) urls.add(s0);
    } else {
        for (let i = 0; i < thumbs.length; i++) {
            try {
                // Use evaluate para clicar via JavaScript em vez de click() direto
                await thumbs[i].evaluate(el => el.click());
            } catch {}
            const prev = Array.from(urls).slice(-1)[0] || "";
            try {
                await page.waitForFunction((prev) => {
                    const root = document.querySelector("#ui-pdp-main-container");
                    if (!root) return false;
                    const candidates = root.querySelectorAll(".ui-pdp-image__figure img, .ui-pdp-gallery__figure img");
                    for (const im of candidates) {
                        const rect = im.getBoundingClientRect();
                        const st = window.getComputedStyle(im);
                        if (rect.width > 100 && rect.height > 100 && st.opacity !== "0" && st.display !== "none") {
                            let src = im.getAttribute("data-zoom") || im.getAttribute("src") || "";
                            if (src.includes("?")) src = src.split("?")[0];
                            if (src && src !== prev) return true;
                        }
                    }
                    return false;
                }, { timeout: 4000 }, prev);
            } catch {}
            const src = await getCurrentMainSrc();
            if (src) urls.add(src);
            if (expectedCountHint && urls.size >= expectedCountHint) break;
        }
    }

    return Array.from(urls).filter(u => /mlstatic\.com/i.test(u) && !/\.(svg|gif)$/i.test(u));
}

/** Estratégia completa: lightbox -> GitHub-style -> thumbs */
async function getImageUrls(page, expectedCountHint = 0) {
    // Use scroll seguro em vez de evaluate direto
    await safeScrollToElement(page, "#ui-pdp-main-container .ui-pdp-gallery, #ui-pdp-main-container .ui-pdp-image");
    await humanPause(200, 500);

    const viaLightbox = await getImageUrlsFromLightbox(page, expectedCountHint);
    if (viaLightbox.length) { console.log("   • [OK] Lightbox usado para extrair as imagens."); return viaLightbox; }

    const viaDom = await getImageUrlsGithubStyle(page);
    if (viaDom.length) { console.log("   • [OK] DOM do anúncio usado (sem clicar)."); return viaDom; }

    console.log("   • [OK] Fallback por thumbnails usado.");
    return await getImageUrlsFromThumbs(page, expectedCountHint);
}

// =============== FICHA TÉCNICA ===============
async function getSpecsAsPairs(page) {
    // pega pares do DOM
    const rawPairs = await page.evaluate(() => {
        const out = [];
        const norm = (s) => (s || "").replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
        const pushPair = (k, v) => {
            const key = norm(k).replace(/:\s*$/, "");
            const val = norm(v);
            if (key && val) out.push([key, val]);
        };

        const mainContainer =
            document.querySelector("#highlighted_specs_attrs .ui-vpp-highlighted-specs__striped-specs") ||
            document.querySelector("#highlighted_specs_attrs");

        if (mainContainer) {
            const rows = mainContainer.querySelectorAll(`
        .ui-pdp-specs__item,
        .andes-table__row,
        li,
        .ui-pdp-specs__table tr,
        .ui-vpp-highlighted-specs__features li,
        div
      `);
            rows.forEach((row) => {
                const rtxt = norm(row.textContent);
                const th = row.querySelector("th, .andes-table__header, .andes-table__column--title, dt");
                const td = row.querySelector("td, .andes-table__column, dd");
                if (th && td) { pushPair(th.textContent, td.textContent); return; }
                const spans = Array.from(row.querySelectorAll("span"));
                if (spans.length >= 2) {
                    const k = norm(spans[0].textContent);
                    const v = norm(spans.slice(1).map(s => s.textContent).join(" ").trim());
                    if (k && v) { pushPair(k, v); return; }
                }
                const idx = rtxt.indexOf(":");
                if (idx > 0) { pushPair(rtxt.slice(0, idx), rtxt.slice(idx + 1)); }
            });
        }

        // tabelas adicionais
        const tableRows = document.querySelectorAll(".ui-pdp-specs__table tr, .andes-table__row");
        tableRows.forEach((r) => {
            const th = r.querySelector("th, .andes-table__header, .andes-table__column--title");
            const td = r.querySelector("td, .andes-table__column");
            if (th && td) pushPair(th.textContent, td.textContent);
        });

        // estruturas <dl>
        const dls = document.querySelectorAll("dl");
        dls.forEach((dl) => {
            const dts = dl.querySelectorAll("dt");
            dts.forEach((dt) => {
                const dd = dt.nextElementSibling && dt.nextElementSibling.tagName === "DD" ? dt.nextElementSibling : null;
                if (dd) pushPair(dt.textContent, dd.textContent);
            });
        });

        // dedup
        const seen = new Set();
        const dedup = [];
        for (const [k, v] of out) {
            const key = `${k}::${v}`;
            if (!seen.has(key)) { seen.add(key); dedup.push([k, v]); }
        }
        return dedup;
    });

    // aplica limpeza/normalização fora do evaluate
    const pairs = rawPairs.map(([k, v]) => [cleanTxt(k), cleanTxt(v)]);
    return pairs;
}

function pairsToFlatString(pairs) {
    return pairs.map(([k, v]) => `${cleanTxt(k)}: ${cleanTxt(v)}`).join(" | ");
}

// =============== FLUXO POR ITEM ===============
async function scrapeOne(page, itemId, idx, total) {
    console.log(`\n=== [${idx + 1}/${total}] ID ${itemId} ===`);

    const ua = getRandomDesktopUA();
    await page.setUserAgent(ua);
    await page.setExtraHTTPHeaders({ "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7" });
    console.log(`🪪 UA aplicado: ${ua}`);

    const opened = await openByRule(page, itemId);
    if (!opened.ok) {
        return { item_id: itemId, erro: `Falha: ${opened.reason}`, tentativas: opened.tried?.join(" | ") || "" };
    }

    // Aguarda o carregamento completo da página
    await page.waitForSelector('body', { timeout: 10000 });
    await humanPause(1000, 2000);

    await waitAny(page, ["h1.ui-pdp-title", "h1#product-title", "h1"]).catch(() => {});
    await humanPause();

    console.log(`➡️ [${itemId}] Coletando dados...`);

    const title = await getTitle(page);
    const price = await getPrice(page);
    const { vendidos, compat } = await getSoldAndCompat(page);
    const descricao = await getDescription(page);

    const qtdImagensHint = await getImagesCount(page);
    const imagensUrls = await getImageUrls(page, qtdImagensHint);
    const origemQtd = imagensUrls.length ? "coleta (lightbox/DOM/thumbs)" : "contador do site";
    const qtdImagens = imagensUrls.length || qtdImagensHint;

    const specsPairs = await getSpecsAsPairs(page);

    console.log(`   • Título: ${title || "(não encontrado)"}`);
    console.log(`   • Preço: ${price || "(não encontrado)"}`);
    console.log(`   • Vendas: ${vendidos || "(não encontrado)"}`);
    console.log(`   • Compat: ${compat || "(não encontrado)"}`);
    console.log(`   • Descrição: ${descricao ? "encontrada" : "não encontrada"}`);
    console.log(`   • Qtd imagens (${origemQtd}): ${qtdImagens}`);
    console.log(`   • URLs coletadas: ${imagensUrls.length}`);
    console.log(`   • Ficha técnica: ${specsPairs.length} atributos`);
    console.log(`✅ [${itemId}] Finalizado.`);

    return {
        item_id: itemId,
        permalink: page.url(),
        nome_ad: title,
        preco: price,
        vendas: vendidos,
        compatibilidade: compat,
        descricao: descricao,
        qtd_imagens: qtdImagens,
        imagens_urls: imagensUrls,
        ficha_tecnica: pairsToFlatString(specsPairs),
        _pairs: specsPairs,
    };
}

function toCsv(rows) {
    const norm = rows.map(r => ({
        ...r,
        imagens_urls: Array.isArray(r.imagens_urls) ? r.imagens_urls.join(" | ") : (r.imagens_urls || "")
    }));
    const preferred = ["item_id","nome_ad","descricao","ficha_tecnica","vendas","qtd_imagens","imagens_urls","preco","compatibilidade","permalink","erro","tentativas"];
    const keys = Array.from(norm.reduce((acc, obj) => { Object.keys(obj).forEach(k => acc.add(k)); return acc; }, new Set()));
    const header = [...preferred.filter(k => keys.includes(k)), ...keys.filter(k => !preferred.includes(k))];
    const esc = (v) => { if (v == null) return ""; const s = String(v); return /[\";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const SEP = ";"; // <<<<<<<<<<<<<<<<<<  separador para Excel PT-BR
    const lines = [header.map(esc).join(SEP)];
    for (const row of norm) lines.push(header.map(k => esc(row[k])).join(SEP));
    return lines.join("\n");
}

async function main() {
    const ids = await readIds(DEFAULT_IDS_FILE);
    const total = ids.length;
    const browser = await newBrowser();
    const page = await browser.newPage();

    const results = [];
    try {
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i].trim();
            try {
                const out = await scrapeOne(page, id, i, total);
                results.push(out);
            } catch (e) {
                console.log(`❌ [${id}] Erro no scrape: ${e.message}`);
                results.push({ item_id: id, erro: String(e) });
            }
            await humanPause();
        }
    } finally {
        await browser.close();
    }

    await fs.mkdir(path.dirname(DEFAULT_CSV_PATH), { recursive: true }).catch(() => {});
    const csvContent = "\uFEFF" + toCsv(results); // BOM UTF-8 para Excel
    await fs.writeFile(DEFAULT_CSV_PATH, csvContent, "utf8");
    console.log(`[OK] CSV salvo em: ${DEFAULT_CSV_PATH} (com BOM UTF-8; separador ;)`);

    if (DEFAULT_JSON_PATH) {
        await fs.mkdir(path.dirname(DEFAULT_JSON_PATH), { recursive: true }).catch(() => {});
        await fs.writeFile(DEFAULT_JSON_PATH, JSON.stringify(results, null, 2), "utf8");
        console.log(`[OK] JSON salvo em: ${DEFAULT_JSON_PATH}`);
    }
}

main().catch(err => { console.error("[ERRO]", err); process.exit(1); });