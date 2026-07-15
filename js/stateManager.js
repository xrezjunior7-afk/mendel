/**
 * ============================================
 * STATE MANAGER
 * ============================================
 * Menyimpan seluruh state aplikasi & simulasi, dan menyediakan
 * fungsi-fungsi untuk memutasi state tersebut dengan aman.
 * Setiap perubahan state memicu subscriber (biasanya uiRenderer)
 * untuk merender ulang tampilan.
 * ============================================
 */

import { createMonoPunnett, createDihybridPunnett } from './geneticsEngine.js';

export const AppState = {
    data: null,
    currentView: 'menu', // 'menu' | 'monohybrid' | 'dihybrid'
    stats: {
        monohybridCount: 0,
        dihybridCount: 0,
        highestGeneration: 0,
        usedOrganisms: new Set()
    },
    achievements: new Set(),
    theme: localStorage.getItem('mendel-theme') || 'light'
};

export const SimState = {
    mode: 'mono', // 'mono' | 'dihybrid'
    organism: null,
    trait: null,      // monohybrid
    traits: [],       // dihybrid: [traitA, traitB]
    domSymbol: '',
    recSymbol: '',
    domSymbol2: '',
    recSymbol2: '',
    domPhenotype: null,
    recPhenotype: null,
    domPhenotype2: null,
    recPhenotype2: null,
    generations: [],   // hasil setiap persilangan (F1, F2, ...)
    parent1Card: null, // { genotype, phenotypes:[], images:[], originGen }
    parent2Card: null,
    lastCrossGenIdx: null // index generasi terakhir yang baru dibuat (untuk animasi)
};

const listeners = new Set();

export function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

export function notify() {
    listeners.forEach(fn => fn());
}

/**
 * ============================================
 * THEME
 * ============================================
 */
export function initTheme() {
    if (AppState.theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
}

export function toggleTheme() {
    AppState.theme = AppState.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', AppState.theme);
    localStorage.setItem('mendel-theme', AppState.theme);
    notify();
}

/**
 * ============================================
 * ACHIEVEMENTS
 * ============================================
 */
export function checkAchievements(onUnlock) {
    const stats = AppState.stats;
    const achievements = AppState.data.achievements;

    achievements.forEach(ach => {
        let unlocked = false;
        switch (ach.id) {
            case 'first-cross':
                unlocked = stats.monohybridCount + stats.dihybridCount >= 1;
                break;
            case 'monohybrid-master':
                unlocked = stats.monohybridCount >= 5;
                break;
            case 'dihybrid-master':
                unlocked = stats.dihybridCount >= 5;
                break;
            case 'generation-3':
                unlocked = stats.highestGeneration >= 3;
                break;
            case 'explorer':
                unlocked = stats.usedOrganisms.size >= 4;
                break;
        }

        if (unlocked && !AppState.achievements.has(ach.id)) {
            AppState.achievements.add(ach.id);
            if (onUnlock) onUnlock(ach);
        }
    });
}

export function onCrossComplete(type, generation, onUnlock) {
    if (type === 'monohybrid') {
        AppState.stats.monohybridCount++;
    } else {
        AppState.stats.dihybridCount++;
    }
    AppState.stats.highestGeneration = Math.max(AppState.stats.highestGeneration, generation);
    if (SimState.organism) {
        AppState.stats.usedOrganisms.add(SimState.organism.id);
    }
    checkAchievements(onUnlock);
}

/**
 * ============================================
 * SIMULATION SETUP
 * ============================================
 */
export function resetSimState() {
    SimState.mode = 'mono';
    SimState.organism = null;
    SimState.trait = null;
    SimState.traits = [];
    SimState.generations = [];
    SimState.parent1Card = null;
    SimState.parent2Card = null;
    SimState.lastCrossGenIdx = null;
}

export function clearGenerations() {
    SimState.generations = [];
    SimState.parent1Card = null;
    SimState.parent2Card = null;
    SimState.lastCrossGenIdx = null;
}

export function setOrganism(organism) {
    SimState.organism = organism || null;
    SimState.trait = null;
    SimState.traits = [];
    clearGenerations();
}

export function setMonoTrait(trait) {
    if (!trait) {
        SimState.trait = null;
        clearGenerations();
        return;
    }
    SimState.trait = trait;
    SimState.domSymbol = trait.defaultSymbols.dominant;
    SimState.recSymbol = trait.defaultSymbols.recessive;
    SimState.domPhenotype = trait.options[0];
    SimState.recPhenotype = trait.options[1];
    clearGenerations();
}

export function setDihybridTraits(traitA, traitB) {
    SimState.traits = [traitA, traitB].filter(Boolean);
    if (SimState.traits.length === 2) {
        const t1 = SimState.traits[0];
        const t2 = SimState.traits[1];
        SimState.domSymbol = t1.defaultSymbols.dominant;
        SimState.recSymbol = t1.defaultSymbols.recessive;
        SimState.domSymbol2 = t2.defaultSymbols.dominant;
        SimState.recSymbol2 = t2.defaultSymbols.recessive;
        SimState.domPhenotype = t1.options[0];
        SimState.recPhenotype = t1.options[1];
        SimState.domPhenotype2 = t2.options[0];
        SimState.recPhenotype2 = t2.options[1];
    }
    clearGenerations();
}

/**
 * ============================================
 * PALETTE CARDS (phenotype pilihan awal / Parent 0)
 * Dibuat murni dari data JSON, tidak mengubah aturan genetika.
 * ============================================
 */
export function getPaletteCards() {
    if (SimState.mode === 'mono') {
        if (!SimState.trait) return [];
        const { domPhenotype: dom, recPhenotype: rec, domSymbol, recSymbol } = SimState;
        return [
            {
                genotype: `${domSymbol}${domSymbol}`,
                phenotypes: [dom.phenotype],
                images: [dom.image],
                originGen: -1
            },
            {
                genotype: `${recSymbol}${recSymbol}`,
                phenotypes: [rec.phenotype],
                images: [rec.image],
                originGen: -1
            }
        ];
    }

    // Dihybrid: 4 kombinasi homozigot dari 2 sifat
    if (SimState.traits.length !== 2) return [];
    const { domPhenotype: d1, recPhenotype: r1, domPhenotype2: d2, recPhenotype2: r2, domSymbol, recSymbol, domSymbol2, recSymbol2 } = SimState;
    const combos = [
        { g1: `${domSymbol}${domSymbol}`, p1: d1, g2: `${domSymbol2}${domSymbol2}`, p2: d2 },
        { g1: `${domSymbol}${domSymbol}`, p1: d1, g2: `${recSymbol2}${recSymbol2}`, p2: r2 },
        { g1: `${recSymbol}${recSymbol}`, p1: r1, g2: `${domSymbol2}${domSymbol2}`, p2: d2 },
        { g1: `${recSymbol}${recSymbol}`, p1: r1, g2: `${recSymbol2}${recSymbol2}`, p2: r2 }
    ];
    return combos.map(c => ({
        genotype: c.g1 + c.g2,
        phenotypes: [c.p1.phenotype, c.p2.phenotype],
        images: [c.p1.image, c.p2.image],
        originGen: -1
    }));
}

/**
 * ============================================
 * PARENT SLOTS & AUTO-CROSS (inti gameplay drag-and-drop)
 * ============================================
 */
export function placeCard(slot, card) {
    if (slot === 1) SimState.parent1Card = card;
    else SimState.parent2Card = card;

    if (SimState.parent1Card && SimState.parent2Card) {
        return performCross();
    }
    return null;
}

export function clearParentSlot(slot) {
    if (slot === 1) SimState.parent1Card = null;
    else SimState.parent2Card = null;
}

function performCross() {
    const p1 = SimState.parent1Card;
    const p2 = SimState.parent2Card;
    const origin1 = typeof p1.originGen === 'number' ? p1.originGen : -1;
    const origin2 = typeof p2.originGen === 'number' ? p2.originGen : -1;
    const newGenIdx = Math.max(origin1, origin2) + 1;

    let result;
    let type;

    if (SimState.mode === 'mono') {
        result = createMonoPunnett(
            p1.genotype, p2.genotype,
            SimState.domSymbol, SimState.recSymbol,
            SimState.domPhenotype, SimState.recPhenotype
        );
        type = 'monohybrid';
    } else {
        const config = {
            domSym1: SimState.domSymbol,
            recSym1: SimState.recSymbol,
            domSym2: SimState.domSymbol2,
            recSym2: SimState.recSymbol2,
            domPheno1: SimState.domPhenotype,
            recPheno1: SimState.recPhenotype,
            domPheno2: SimState.domPhenotype2,
            recPheno2: SimState.recPhenotype2
        };
        result = createDihybridPunnett(p1.genotype, p2.genotype, config);
        type = 'dihybrid';
    }

    result.label = `F${newGenIdx + 1}`;
    result.parent1Card = p1;
    result.parent2Card = p2;

    SimState.generations = SimState.generations.slice(0, newGenIdx);
    SimState.generations.push(result);
    SimState.lastCrossGenIdx = newGenIdx;

    return { type, generation: newGenIdx + 1 };
}

/**
 * Bentuk kartu offspring (untuk drag ulang ke parent slot) dari sebuah
 * hasil outcome Punnett Square. Tidak mengubah nilai genotype/phenotype,
 * hanya membungkusnya menjadi bentuk "kartu" yang seragam.
 */
export function buildOffspringCard(outcome, genIdx) {
    if (SimState.mode === 'mono') {
        const { domSym, domPheno, recPheno } = SimState.generations[genIdx];
        const isDom = outcome.genotype.includes(domSym);
        const pheno = isDom ? domPheno : recPheno;
        return {
            genotype: outcome.genotype,
            phenotypes: [pheno.phenotype],
            images: [pheno.image],
            originGen: genIdx
        };
    }
    // Catatan: outcome.phenos berisi OBJEK fenotipe penuh (bukan string),
    // karena createDihybridPunnett memanggil getPhenotype() yang mengembalikan
    // objek domPheno/recPheno apa adanya. Ini perilaku asli mesin genetika
    // (tidak diubah) — jadi kita ambil .phenotype dan .image langsung dari objeknya.
    return {
        genotype: outcome.genotype,
        phenotypes: outcome.phenos.map(p => p.phenotype),
        images: outcome.phenos.map(p => p.image),
        originGen: genIdx
    };
}
