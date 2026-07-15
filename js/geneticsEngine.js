/**
 * ============================================
 * GENETICS ENGINE
 * ============================================
 * PENTING: Seluruh logika di file ini adalah logika genetika Mendel
 * ASLI dari implementasi sebelumnya dan TIDAK DIUBAH sama sekali:
 * - Perhitungan genotype / phenotype
 * - Logika Punnett Square (monohybrid & dihybrid)
 * - Rasio Mendel
 *
 * File ini murni (pure functions), tidak menyentuh DOM, sehingga
 * bisa dites dan digunakan ulang oleh modul manapun.
 * ============================================
 */

export function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
        const t = b;
        b = a % b;
        a = t;
    }
    return a || 1;
}

export function simplifyRatio(nums) {
    const validNums = nums.filter(n => n > 0);
    if (validNums.length === 0) return '0';
    const g = validNums.reduce((acc, n) => gcd(acc, n));
    return validNums.map(n => Math.round(n / g)).join(' : ');
}

export function sortPair(a, b, dom) {
    if (a === b) return a + b;
    if (a === dom && b !== dom) return a + b;
    if (b === dom && a !== dom) return b + a;
    return a < b ? a + b : b + a;
}

export function getGenotype(pheno, domPheno, domSym, recSym) {
    return pheno === domPheno ? `${domSym}${domSym}` : `${recSym}${recSym}`;
}

export function isDominant(genotype, domSym) {
    return genotype.includes(domSym);
}

export function getPhenotype(genotype, domSym, domPheno, recPheno) {
    return genotype.includes(domSym) ? domPheno : recPheno;
}

/**
 * ============================================
 * PUNNETT SQUARE LOGIC (Monohybrid)
 * ============================================
 */
export function createMonoPunnett(p1, p2, domSym, recSym, domPheno, recPheno) {
    const outcomes = [];
    const tally = {};

    for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
            const pair = sortPair(p1[i], p2[j], domSym);
            outcomes.push(pair);
            tally[pair] = (tally[pair] || 0) + 1;
        }
    }

    const genotypeOutcomes = Object.entries(tally).map(([g, c]) => ({ genotype: g, count: c }));

    const domKey = `${domSym}${domSym}`;
    const recKey = `${recSym}${recSym}`;
    const hetKey = sortPair(domSym, recSym, domSym);

    const domCount = (tally[domKey] || 0) + (tally[hetKey] || 0);
    const recCount = tally[recKey] || 0;

    return {
        parent1Genotype: p1,
        parent2Genotype: p2,
        outcomes: genotypeOutcomes,
        phenotypeCounts: { dominant: domCount, recessive: recCount },
        domSym, recSym, domPheno, recPheno
    };
}

/**
 * ============================================
 * PUNNETT SQUARE LOGIC (Dihybrid)
 * ============================================
 */
export function createDihybridPunnett(p1, p2, config) {
    const { domSym1, recSym1, domSym2, recSym2, domPheno1, recPheno1, domPheno2, recPheno2 } = config;

    // Produce gametes
    function gametes(g) {
        const g1 = [g[0], g[1]];
        const g2 = [g[2], g[3]];
        const result = [];
        g1.forEach(a => g2.forEach(b => result.push(a + b)));
        return result;
    }

    const gam1 = gametes(p1);
    const gam2 = gametes(p2);

    const tally = {};

    gam1.forEach(gA => {
        gam2.forEach(gB => {
            const gene1 = sortPair(gA[0], gB[0], domSym1);
            const gene2 = sortPair(gA[1], gB[1], domSym2);
            const combined = gene1 + gene2;
            tally[combined] = (tally[combined] || 0) + 1;
        });
    });

    const outcomes = Object.entries(tally).map(([g, c]) => {
        const pheno1 = getPhenotype(g.substring(0, 2), domSym1, domPheno1, recPheno1);
        const pheno2 = getPhenotype(g.substring(2, 4), domSym2, domPheno2, recPheno2);
        return { genotype: g, count: c, phenos: [pheno1, pheno2] };
    });

    // Calculate phenotype categories
    const categories = {};
    outcomes.forEach(o => {
        const key = o.phenos.join(' + ');
        categories[key] = (categories[key] || 0) + o.count;
    });

    const phenotypeCategories = Object.entries(categories).map(([label, count]) => ({ label, count }));

    return {
        parent1Genotype: p1,
        parent2Genotype: p2,
        outcomes,
        phenotypeCategories,
        config
    };
}

/**
 * Produce 4 gametes for a dihybrid genotype string (helper reused by the UI
 * to render the 4x4 Punnett grid headers). Logic identical to the internal
 * `gametes` helper used inside createDihybridPunnett.
 */
export function produceGametes(g) {
    const g1 = [g[0], g[1]];
    const g2 = [g[2], g[3]];
    const result = [];
    g1.forEach(a => g2.forEach(b => result.push(a + b)));
    return result;
}
