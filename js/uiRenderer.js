/**
 * ============================================
 * UI RENDERER
 * ============================================
 * Bertanggung jawab membangun markup (template string) dan
 * memasang event listener + drag-and-drop setelah markup
 * dimasukkan ke DOM. Tidak ada logika genetika di sini —
 * semua perhitungan diambil dari geneticsEngine.js melalui
 * stateManager.js.
 *
 * Arsitektur "lab board" (Parent 1 / Offspring / Parent 2) dibuat
 * reusable: mode monohybrid dan dihybrid memakai fungsi render &
 * komponen kartu yang SAMA (bukan dua sistem terpisah). Perbedaan
 * mono vs dihybrid hanya pada jumlah trait & ukuran Punnett grid.
 * ============================================
 */

import { simplifyRatio, sortPair, produceGametes } from './geneticsEngine.js';
import {
    AppState, SimState,
    setOrganism, setMonoTrait, setDihybridTraits,
    getPaletteCards, placeCard, buildOffspringCard,
    onCrossComplete, toggleTheme, resetSimState, clearGenerations, notify
} from './stateManager.js';
import { makeDraggable, makeDropZone, resetDropZones, onPickChange } from './dragDrop.js';
import { popIn, flashSuccess, fadeScaleIn, staggerPopIn } from './animation.js';

let cardRegistry = new Map();
let cardIdCounter = 0;

function registerCard(card) {
    const id = `card-${cardIdCounter++}`;
    cardRegistry.set(id, card);
    return id;
}

/**
 * ============================================
 * ROOT RENDER
 * ============================================
 */
export function renderApp() {
    const app = document.getElementById('app');
    if (!AppState.data) {
        app.innerHTML = '';
        return;
    }

    cardRegistry = new Map();
    cardIdCounter = 0;
    resetDropZones();

    switch (AppState.currentView) {
        case 'menu':
            app.innerHTML = renderMenu();
            break;
        case 'monohybrid':
            SimState.mode = 'mono';
            app.innerHTML = renderSimView();
            break;
        case 'dihybrid':
            SimState.mode = 'dihybrid';
            app.innerHTML = renderSimView();
            break;
    }

    attachStaticListeners();
    if (AppState.currentView !== 'menu') attachBoardInteractions();
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} visible`;
    setTimeout(() => toast.classList.remove('visible'), 3000);
}

function getOrganismIcon(id) {
    const icons = { 'pea-plant': '🌱', 'guinea-pig': '🐹', 'fruit-fly': '🪰', 'corn-plant': '🌽' };
    return icons[id] || '🧬';
}

function getAchievementIcon(iconName) {
    const icons = { microscope: '🔬', dna: '🧬', chromosome: '🧬', 'family-tree': '🌲', 'crystal-ball': '🔮' };
    return icons[iconName] || '🏆';
}

/**
 * ============================================
 * MENU VIEW
 * ============================================
 */
function renderMenu() {
    const data = AppState.data;
    return `
        <div class="menu-view">
            ${renderHeader()}
            <main class="container">
                <div class="menu-welcome">
                    <h2>👨‍🔬 Selamat Datang, Peneliti!</h2>
                    <p>Pelajari hukum pewarisan sifat Gregor Mendel lewat laboratorium genetika drag-and-drop. Seret fenotipe induk ke slot Parent dan lihat keturunannya muncul secara otomatis!</p>
                </div>

                <div class="mode-cards">
                    <div class="mode-card" data-action="monohybrid" tabindex="0" role="button">
                        <div class="mode-card-header">
                            <div style="display: flex; align-items: center; gap: 0.75rem;">
                                <div class="mode-card-icon">🧬</div>
                                <div>
                                    <div class="mode-card-title">Monohybrid</div>
                                    <div class="mode-card-desc">Hukum Mendel I - Segregasi</div>
                                </div>
                            </div>
                            <span style="font-size: 1.5rem; color: var(--emerald-400);">→</span>
                        </div>
                        <div class="mode-card-body">
                            <p>Seret fenotipe induk ke meja lab dan amati bagaimana alel dominan & resesif memisah lewat tabel Punnett 2×2.</p>
                            <div class="mode-card-badges">
                                <span class="badge badge-outline">1 Trait</span>
                                <span class="badge badge-outline">Punnett 2×2</span>
                                <span class="badge badge-outline">Rasio 3:1</span>
                            </div>
                        </div>
                    </div>

                    <div class="mode-card" data-action="dihybrid" tabindex="0" role="button">
                        <div class="mode-card-header">
                            <div style="display: flex; align-items: center; gap: 0.75rem;">
                                <div class="mode-card-icon">✨</div>
                                <div>
                                    <div class="mode-card-title">Dihybrid</div>
                                    <div class="mode-card-desc">Hukum Mendel II - Pengelompokan Bebas</div>
                                </div>
                            </div>
                            <span style="font-size: 1.5rem; color: var(--teal-400);">→</span>
                        </div>
                        <div class="mode-card-body">
                            <p>Jelajahi pewarisan dua sifat sekaligus dengan tabel Punnett 4×4 dan pola rasio 9:3:3:1.</p>
                            <div class="mode-card-badges">
                                <span class="badge badge-outline">2 Traits</span>
                                <span class="badge badge-outline">Punnett 4×4</span>
                                <span class="badge badge-outline">Rasio 9:3:3:1</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="tutorial-section">
                    <div class="tutorial-card">
                        <div class="tutorial-header"><span>📖</span> Panduan Pembelajaran</div>
                        <div class="tutorial-tabs">
                            <button class="tutorial-tab active" data-tab="monohybrid">Monohybrid</button>
                            <button class="tutorial-tab" data-tab="dihybrid">Dihybrid</button>
                        </div>
                        <div class="tutorial-content active" id="tutorial-mono">
                            <p>${data.tutorials.monohybrid.description}</p>
                            <ol class="tutorial-steps">
                                ${data.tutorials.monohybrid.steps.map((step, i) => `
                                    <li class="tutorial-step"><span class="tutorial-step-num">${i + 1}</span><span>${step}</span></li>
                                `).join('')}
                            </ol>
                        </div>
                        <div class="tutorial-content" id="tutorial-di">
                            <p>${data.tutorials.dihybrid.description}</p>
                            <ol class="tutorial-steps">
                                ${data.tutorials.dihybrid.steps.map((step, i) => `
                                    <li class="tutorial-step"><span class="tutorial-step-num">${i + 1}</span><span>${step}</span></li>
                                `).join('')}
                            </ol>
                        </div>
                    </div>
                </div>

                <div class="organisms-section">
                    <h3 class="organisms-title">🎓 Organisme yang Tersedia</h3>
                    <div class="organisms-grid">
                        ${data.subjects.map(subject => `
                            <div class="organism-card">
                                <div class="organism-icon">${getOrganismIcon(subject.id)}</div>
                                <div class="organism-name">${subject.name.split('(')[0].trim()}</div>
                                <div class="organism-traits">${subject.traits.length} sifat</div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="achievements-section">
                    <h3 class="achievements-title">🏆 Pencapaian</h3>
                    <div class="achievements-grid">
                        ${data.achievements.map(ach => `
                            <div class="achievement-card ${AppState.achievements.has(ach.id) ? 'unlocked' : ''}">
                                <div class="achievement-icon">${getAchievementIcon(ach.icon)}</div>
                                <div class="achievement-name">${ach.name}</div>
                                <div class="achievement-desc">${ach.description}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </main>
            ${renderFooter()}
        </div>
    `;
}

function renderHeader() {
    return `
        <header class="header">
            <div class="header-content">
                <div class="header-logo">
                    <div class="header-logo-icon">🧬</div>
                    <div>
                        <div class="header-title">Lab Genetika Mendel</div>
                        <div class="header-subtitle">Simulasi Interaktif Hukum Hereditas</div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <div class="header-badge">
                        <span>🏆</span>
                        <span>${AppState.stats.monohybridCount + AppState.stats.dihybridCount} Eksperimen</span>
                    </div>
                    <button class="theme-toggle" data-action="theme" title="Ubah tema" aria-label="Ubah tema">
                        ${AppState.theme === 'dark' ? '☀️' : '🌙'}
                    </button>
                </div>
            </div>
        </header>
    `;
}

function renderFooter() {
    return `<footer class="footer"><p>Lab Genetika Mendel © 2024 — Simulasi Edukatif Hukum Hereditas</p></footer>`;
}

/**
 * ============================================
 * SIMULATION VIEW (reusable untuk mono & dihybrid)
 * ============================================
 */
function renderSimView() {
    const isDi = SimState.mode === 'dihybrid';
    const title = isDi ? 'Persilangan Dihybrid' : 'Persilangan Monohybrid';
    const icon = isDi ? '✨' : '🧬';
    const headerStyle = isDi ? 'background: linear-gradient(135deg, var(--teal-600) 0%, var(--cyan-600) 100%);' : '';
    const ready = isDi ? SimState.traits.length === 2 : !!SimState.trait;

    return `
        <div class="sim-view ${isDi ? 'dihybrid' : ''}">
            <header class="header" style="${headerStyle}">
                <div class="header-content">
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <button class="btn btn-ghost" data-action="back"><span>←</span> Kembali</button>
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <span>${icon}</span><span style="font-weight: 700;">${title}</span>
                        </div>
                    </div>
                    <button class="theme-toggle" data-action="theme" aria-label="Ubah tema">
                        ${AppState.theme === 'dark' ? '☀️' : '🌙'}
                    </button>
                </div>
            </header>

            <main class="sim-main">
                <div class="config-panel">
                    ${renderOrganismSelect()}
                    ${SimState.organism ? (isDi ? renderDihybridTraitSelect() : renderMonoTraitSelect()) : ''}
                </div>

                ${ready ? renderLabBoard() : renderEmptyState(isDi)}
            </main>
        </div>
    `;
}

function renderOrganismSelect() {
    return `
        <div class="config-card">
            <div class="config-card-header"><span>✨</span><span class="config-card-title">Pilih Organisme</span></div>
            <div class="config-card-body">
                <select class="form-select" id="organism-select">
                    <option value="">Pilih organisme...</option>
                    ${AppState.data.subjects.map(s => `
                        <option value="${s.id}" ${SimState.organism?.id === s.id ? 'selected' : ''}>${s.name}</option>
                    `).join('')}
                </select>
                ${SimState.organism ? `<p style="font-size: 0.75rem; color: var(--gray-500); margin-top: 0.5rem;">${SimState.organism.description}</p>` : ''}
            </div>
        </div>
    `;
}

function renderMonoTraitSelect() {
    const traits = SimState.organism.traits;
    return `
        <div class="config-card">
            <div class="config-card-header"><span class="config-card-title">Pilih Sifat</span></div>
            <div class="config-card-body">
                <select class="form-select" id="trait-select">
                    <option value="">Pilih sifat...</option>
                    ${traits.map(t => `
                        <option value="${t.name}" ${SimState.trait?.name === t.name ? 'selected' : ''}>${t.name}</option>
                    `).join('')}
                </select>
            </div>
        </div>
    `;
}

function renderDihybridTraitSelect() {
    const traits = SimState.organism.traits;
    const a = SimState.traits[0]?.name || '';
    const b = SimState.traits[1]?.name || '';
    const opt = (excludeName) => traits.map(t => `<option value="${t.name}" ${t.name === excludeName ? 'selected' : ''}>${t.name}</option>`).join('');
    return `
        <div class="config-card">
            <div class="config-card-header"><span class="config-card-title">Pilih 2 Sifat</span></div>
            <div class="config-card-body">
                <label class="form-label">Sifat 1</label>
                <select class="form-select" id="trait-a-select" style="margin-bottom: 0.75rem;">
                    <option value="">Pilih sifat...</option>${opt(a)}
                </select>
                <label class="form-label">Sifat 2</label>
                <select class="form-select" id="trait-b-select">
                    <option value="">Pilih sifat...</option>${opt(b)}
                </select>
                ${traits.length < 2 ? `<p style="font-size: 0.75rem; color: var(--amber-600); margin-top: 0.5rem;">⚠️ Organisme ini hanya memiliki ${traits.length} sifat</p>` : ''}
            </div>
        </div>
    `;
}

function renderEmptyState(isDi) {
    return `
        <div class="results-panel">
            <div class="empty-state">
                <div class="empty-state-icon">👁️</div>
                <h3>Belum Siap</h3>
                <p>Pilih organisme dan ${isDi ? '2 sifat' : 'sifat'} terlebih dahulu untuk membuka meja laboratorium.</p>
            </div>
        </div>
    `;
}

/**
 * ============================================
 * LAB BOARD — inti gameplay drag-and-drop
 * Parent 1 [DROP] — Offspring [RESULT] — Parent 2 [DROP]
 * ============================================
 */
function renderLabBoard() {
    const palette = getPaletteCards();
    const hasResults = SimState.generations.length > 0;

    return `
        <div class="results-panel lab-panel">
            <div class="palette-panel">
                <div class="palette-title">🧪 Palet Fenotipe — seret ke slot Parent</div>
                <div class="palette-cards">
                    ${palette.map(card => renderCard(card, { size: 'sm' })).join('')}
                </div>
                ${SimState.generations.length > 0 ? `<button class="btn btn-secondary btn-sm" data-action="reset" style="margin-top: 0.75rem;">↺ Reset Meja</button>` : ''}
            </div>

            <div class="lab-board">
                <div class="lab-col">
                    <div class="slot-title">Parent 1</div>
                    ${renderParentSlot(1)}
                </div>
                <div class="lab-col lab-col-center">
                    <div class="slot-title">Offspring</div>
                    ${renderOffspringResultBox()}
                </div>
                <div class="lab-col">
                    <div class="slot-title">Parent 2</div>
                    ${renderParentSlot(2)}
                </div>
            </div>

            ${hasResults ? renderHistoryChain() : ''}
            ${hasResults ? renderGenerationsHistory() : `
                <div class="empty-state" style="margin-top: 1rem;">
                    <div class="empty-state-icon">🧬</div>
                    <h3>Meja Lab Siap</h3>
                    <p>Seret dua kartu fenotipe dari palet ke slot Parent 1 dan Parent 2 — persilangan berjalan otomatis!</p>
                </div>
            `}
        </div>
    `;
}

function renderParentSlot(slotNum) {
    const card = slotNum === 1 ? SimState.parent1Card : SimState.parent2Card;
    if (!card) {
        return `<div class="parent-slot empty" id="parent-slot-${slotNum}" aria-label="Slot Parent ${slotNum}, kosong">
            <span class="drop-hint">Drop Here</span>
        </div>`;
    }
    return `<div class="parent-slot filled" id="parent-slot-${slotNum}">${renderCard(card, { size: 'md', filled: true })}</div>`;
}

function renderOffspringResultBox() {
    if (SimState.generations.length === 0) {
        return `<div class="offspring-result-box empty"><span class="drop-hint">Result</span></div>`;
    }
    const lastIdx = SimState.generations.length - 1;
    const last = SimState.generations[lastIdx];
    const outcomes = SimState.mode === 'mono' ? last.outcomes : last.outcomes;
    return `
        <div class="offspring-result-box filled">
            <span class="gen-badge">${last.label}</span>
            <div class="offspring-mini-grid">
                ${outcomes.map(o => {
                    const card = buildOffspringCard(o, lastIdx);
                    return renderCard(card, { size: 'xs', count: o.count });
                }).join('')}
            </div>
        </div>
    `;
}

function renderHistoryChain() {
    const chips = ['P', ...SimState.generations.map(g => g.label)];
    return `
        <div class="history-chain" aria-label="Riwayat generasi">
            ${chips.map((c, i) => `
                <span class="history-chip ${i === chips.length - 1 ? 'current' : ''}">${c}</span>
                ${i < chips.length - 1 ? '<span class="history-arrow">→</span>' : ''}
            `).join('')}
        </div>
    `;
}

/**
 * Render kartu generik (dipakai untuk kartu palet, kartu di slot parent,
 * dan kartu offspring) — satu komponen untuk mono maupun dihybrid.
 */
function renderCard(card, { size = 'md', filled = false, count = null } = {}) {
    const id = registerCard(card);
    const imgs = card.images.map(img => `<span class="creature-img">${img}</span>`).join('');
    const phenoLabel = card.phenotypes.join(' + ');
    return `
        <div class="creature-card size-${size} ${filled ? 'in-slot' : ''}" data-card-id="${id}">
            <div class="creature-images">${imgs}</div>
            <div class="creature-genotype">${card.genotype}</div>
            <div class="creature-phenotype">${phenoLabel}</div>
            ${count !== null ? `<span class="badge badge-outline creature-count">${count}</span>` : ''}
        </div>
    `;
}

/**
 * ============================================
 * GENERATION HISTORY (Punnett squares + rasio + galeri offspring)
 * ============================================
 */
function renderGenerationsHistory() {
    return `
        <div class="results-header">
            <h2 class="results-title">Riwayat Persilangan</h2>
        </div>
        ${SimState.generations.map((result, idx) => SimState.mode === 'mono'
            ? renderMonoGenerationResult(result, idx)
            : renderDiGenerationResult(result, idx)
        ).join('')}
    `;
}

function renderMonoGenerationResult(result, idx) {
    const p1 = result.parent1Genotype;
    const p2 = result.parent2Genotype;
    const { domSym, domPheno, recPheno } = result;

    const cells = [];
    cells.push(`<div class="punnett-cell empty"></div>`);
    cells.push(`<div class="punnett-cell header">${p2[0]}</div>`);
    cells.push(`<div class="punnett-cell header">${p2[1]}</div>`);
    for (let i = 0; i < 2; i++) {
        cells.push(`<div class="punnett-cell header">${p1[i]}</div>`);
        for (let j = 0; j < 2; j++) {
            const pair = sortPair(p1[i], p2[j], domSym);
            const isDom = pair.includes(domSym);
            cells.push(`<div class="punnett-cell data ${isDom ? 'dom' : 'rec'}">${pair}</div>`);
        }
    }

    return `
        <div class="punnett-container" id="gen-container-${idx}">
            <div class="punnett-header">
                <div class="punnett-title"><span class="gen-badge">${result.label}</span><h3>${p1} × ${p2}</h3></div>
                <span style="color: var(--amber-500); font-size: 1.25rem;">💡</span>
            </div>
            <div class="punnett-body">
                <div style="text-align: center;"><div class="punnett-grid mono">${cells.join('')}</div></div>
                <div class="pheno-results">
                    <div class="pheno-card dom">
                        <h4 style="color: var(--emerald-800);">Hasil Fenotipe</h4>
                        <div class="pheno-item"><span>${domPheno.phenotype}</span><span class="badge badge-primary">${result.phenotypeCounts.dominant}</span></div>
                        <div class="pheno-item"><span>${recPheno.phenotype}</span><span class="badge badge-secondary">${result.phenotypeCounts.recessive}</span></div>
                    </div>
                    <div class="pheno-card ratio">
                        <h4 style="color: var(--teal-800);">Rasio</h4>
                        <p style="font-size: 0.875rem;"><strong>Fenotipe:</strong> ${simplifyRatio([result.phenotypeCounts.dominant, result.phenotypeCounts.recessive])}</p>
                        <p style="font-size: 0.875rem;"><strong>Genotipe:</strong> ${result.outcomes.map(o => `${o.genotype}(${o.count})`).join(' : ')}</p>
                    </div>
                </div>
                <h4 class="offspring-title">Keturunan (seret ke slot Parent untuk generasi berikutnya)</h4>
                <div class="offspring-grid">
                    ${result.outcomes.map(o => renderCard(buildOffspringCard(o, idx), { size: 'sm', count: o.count })).join('')}
                </div>
            </div>
        </div>
    `;
}

/**
 * Kelompokkan outcomes dihybrid berdasarkan kombinasi fenotipe untuk
 * ditampilkan sebagai "Kategori Fenotipe (Pola 9:3:3:1)".
 *
 * Catatan penting: result.phenotypeCategories (dari geneticsEngine.js)
 * TIDAK dipakai di sini karena field tersebut dibangun dengan
 * `o.phenos.join(' + ')` — sedangkan o.phenos berisi OBJEK fenotipe,
 * bukan string, sehingga join() menghasilkan "[object Object]" dan
 * semua outcome tergabung jadi satu kategori (bug tampilan lama).
 * Untuk menjaga geneticsEngine.js 100% tidak berubah (sesuai
 * permintaan), pengelompokan label yang BENAR dilakukan di sini,
 * di lapisan UI, memakai outcomes yang sama (angka Punnett Square-nya
 * tetap identik, tidak ada satu pun perhitungan genetika yang berubah).
 */
function groupPhenotypeCategories(outcomes) {
    const categories = {};
    outcomes.forEach(o => {
        const key = o.phenos.map(p => p.phenotype).join(' + ');
        categories[key] = (categories[key] || 0) + o.count;
    });
    return Object.entries(categories).map(([label, count]) => ({ label, count }));
}

function renderDiGenerationResult(result, idx) {
    const { config, outcomes, parent1Genotype, parent2Genotype } = result;
    const phenotypeCategories = groupPhenotypeCategories(outcomes);
    const { domSym1, domSym2 } = config;

    const gam1 = produceGametes(parent1Genotype);
    const gam2 = produceGametes(parent2Genotype);

    const cells = [];
    cells.push(`<div class="punnett-cell empty"></div>`);
    gam2.forEach(g => cells.push(`<div class="punnett-cell header" style="font-size: 0.75rem;">${g}</div>`));
    gam1.forEach(gA => {
        cells.push(`<div class="punnett-cell header" style="font-size: 0.75rem;">${gA}</div>`);
        gam2.forEach(gB => {
            const gene1 = sortPair(gA[0], gB[0], domSym1);
            const gene2 = sortPair(gA[1], gB[1], domSym2);
            const combined = gene1 + gene2;
            const isDom1 = combined.substring(0, 2).includes(domSym1);
            const isDom2 = combined.substring(2, 4).includes(domSym2);
            const bgClass = (isDom1 || isDom2) ? 'dom' : 'rec';
            cells.push(`<div class="punnett-cell data ${bgClass}" style="font-size: 0.625rem; width: 48px; height: 48px;">${combined}</div>`);
        });
    });

    return `
        <div class="punnett-container" id="gen-container-${idx}">
            <div class="punnett-header">
                <div class="punnett-title"><span class="gen-badge">${result.label}</span><h3>${parent1Genotype} × ${parent2Genotype}</h3></div>
                <span style="color: var(--amber-500); font-size: 1.25rem;">💡</span>
            </div>
            <div class="punnett-body">
                <div style="text-align: center; overflow-x: auto;"><div class="punnett-grid di">${cells.join('')}</div></div>
                <div class="pheno-card" style="background: linear-gradient(135deg, var(--teal-50) 0%, var(--cyan-50) 100%); border: 1px solid var(--teal-200); margin-bottom: 1rem;">
                    <h4 style="color: var(--teal-800); margin-bottom: 0.75rem;">Kategori Fenotipe (Pola 9:3:3:1)</h4>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem;">
                        ${phenotypeCategories.slice().sort((a, b) => b.count - a.count).map(cat => `
                            <div style="text-align: center; padding: 0.5rem; background: rgba(255,255,255,0.6); border-radius: var(--radius-md);">
                                <div style="font-size: 0.75rem; color: var(--gray-600);">${cat.label}</div>
                                <div style="font-size: 1.25rem; font-weight: 700; color: var(--teal-700);">${cat.count}</div>
                            </div>
                        `).join('')}
                    </div>
                    <p style="font-size: 0.875rem; color: var(--gray-600); margin-top: 0.75rem;"><strong>Rasio:</strong> ${simplifyRatio(phenotypeCategories.map(c => c.count))}</p>
                </div>
                <h4 class="offspring-title">Keturunan (seret ke slot Parent untuk generasi berikutnya)</h4>
                <div class="offspring-grid">
                    ${outcomes.map(o => renderCard(buildOffspringCard(o, idx), { size: 'sm', count: o.count })).join('')}
                </div>
            </div>
        </div>
    `;
}

/**
 * ============================================
 * STATIC LISTENERS (navigasi, dropdown, theme, dsb.)
 * ============================================
 */
function attachStaticListeners() {
    document.querySelectorAll('[data-action="theme"]').forEach(btn => {
        btn.addEventListener('click', toggleTheme);
    });

    document.querySelectorAll('[data-action="back"]').forEach(btn => {
        btn.addEventListener('click', () => {
            AppState.currentView = 'menu';
            resetSimState();
            renderApp();
        });
    });

    document.querySelectorAll('[data-action="monohybrid"]').forEach(el => {
        el.addEventListener('click', () => { AppState.currentView = 'monohybrid'; renderApp(); });
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); AppState.currentView = 'monohybrid'; renderApp(); }
        });
    });

    document.querySelectorAll('[data-action="dihybrid"]').forEach(el => {
        el.addEventListener('click', () => { AppState.currentView = 'dihybrid'; renderApp(); });
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); AppState.currentView = 'dihybrid'; renderApp(); }
        });
    });

    document.querySelectorAll('.tutorial-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.tutorial-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tutorial-content').forEach(c => c.classList.remove('active'));
            e.target.classList.add('active');
            const tabId = e.target.dataset.tab;
            document.getElementById(`tutorial-${tabId === 'monohybrid' ? 'mono' : 'di'}`).classList.add('active');
        });
    });

    const orgSelect = document.getElementById('organism-select');
    if (orgSelect) {
        orgSelect.addEventListener('change', (e) => {
            const org = AppState.data.subjects.find(s => s.id === e.target.value);
            setOrganism(org);
            renderApp();
        });
    }

    const traitSelect = document.getElementById('trait-select');
    if (traitSelect) {
        traitSelect.addEventListener('change', (e) => {
            const trait = SimState.organism?.traits.find(t => t.name === e.target.value);
            setMonoTrait(trait);
            renderApp();
        });
    }

    const traitA = document.getElementById('trait-a-select');
    const traitB = document.getElementById('trait-b-select');
    if (traitA && traitB) {
        const onChange = () => {
            const tA = SimState.organism?.traits.find(t => t.name === traitA.value);
            const tB = SimState.organism?.traits.find(t => t.name === traitB.value);
            if (tA && tB && tA === tB) {
                showToast('Pilih dua sifat yang berbeda', 'error');
                return;
            }
            setDihybridTraits(tA, tB);
            renderApp();
        };
        traitA.addEventListener('change', onChange);
        traitB.addEventListener('change', onChange);
    }

    document.querySelectorAll('[data-action="reset"]').forEach(btn => {
        btn.addEventListener('click', () => {
            clearGenerations();
            renderApp();
            showToast('Meja lab direset', 'info');
        });
    });
}

/**
 * ============================================
 * DRAG & DROP WIRING untuk kartu & slot
 * ============================================
 */
function attachBoardInteractions() {
    document.querySelectorAll('[data-card-id]').forEach(el => {
        const card = cardRegistry.get(el.dataset.cardId);
        if (card) makeDraggable(el, card);
    });

    const slot1 = document.getElementById('parent-slot-1');
    const slot2 = document.getElementById('parent-slot-2');
    if (slot1) makeDropZone(slot1, (card) => handleDrop(1, card, slot1));
    if (slot2) makeDropZone(slot2, (card) => handleDrop(2, card, slot2));

    onPickChange((picked) => {
        // beri petunjuk visual sederhana; drop zone highlight sudah
        // ditangani oleh dragDrop.js via class drop-zone-active
    });
}

function handleDrop(slotNum, card, slotEl) {
    const crossInfo = placeCard(slotNum, card);
    flashSuccess(slotEl);

    if (crossInfo) {
        onCrossComplete(crossInfo.type, crossInfo.generation, (ach) => {
            showToast(`🏆 Pencapaian terbuka: ${ach.name}!`, 'success');
        });
        showToast(`${SimState.generations[SimState.generations.length - 1].label} berhasil dibuat!`, 'success');
    }

    renderApp();

    // animasi pop-in untuk hasil baru
    requestAnimationFrame(() => {
        const lastIdx = SimState.generations.length - 1;
        if (lastIdx >= 0) {
            const container = document.getElementById(`gen-container-${lastIdx}`);
            fadeScaleIn(container);
            const resultBox = document.querySelector('.offspring-result-box.filled');
            if (resultBox) staggerPopIn(resultBox.querySelectorAll('.creature-card'));
        }
    });
}
