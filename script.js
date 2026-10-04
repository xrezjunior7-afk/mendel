'use strict';

/* ==========================================================================
   1. UTILS
   ========================================================================== */
const Utils = (() => {
  const qs = (sel, ctx = document) => ctx.querySelector(sel);
  const qsa = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  function createEl(tag, props = {}, children = []) {
    const el = document.createElement(tag);
    Object.entries(props).forEach(([key, value]) => {
      if (key === 'class') el.className = value;
      else if (key === 'dataset') Object.entries(value).forEach(([k, v]) => (el.dataset[k] = v));
      else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === 'html') {
        el.innerHTML = value;
      } else {
        el.setAttribute(key, value);
      }
    });
    children.forEach((child) => {
      if (child) el.appendChild(child);
    });
    return el;
  }

  function uid(prefix = 'id') {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
  }

  // REVISI 8: label zigositas untuk tooltip edukasi. Generik untuk genotype
  // 2-alel apa pun (bukan hanya warna daun), jadi reusable untuk trait lain.
  // REVISI (DIHIBRID): digeneralisasi untuk menerima array PANJANG APA PUN
  // yang KELIPATAN 2 (2 = 1 gen/Monohibrid, 4 = 2 gen/Dihibrid, dst.) —
  // setiap 2 elemen berurutan = satu gen. Untuk panjang 2, perilakunya
  // IDENTIK dengan sebelumnya (satu chunk saja).
  function zygosityChunks(alleles) {
    const chunks = [];
    for (let i = 0; i < alleles.length; i += 2) chunks.push([alleles[i], alleles[i + 1]]);
    return chunks.map(([a, b]) => {
      if (a !== b) return 'het';
      return a === a.toUpperCase() ? 'dom' : 'res';
    });
  }

  function zygosityLabel(alleles) {
    const kinds = zygosityChunks(alleles);
    if (kinds.every((k) => k === 'dom')) return 'Homozigot Dominan';
    if (kinds.every((k) => k === 'res')) return 'Homozigot Resesif';
    if (kinds.every((k) => k === 'het')) return 'Heterozigot';
    return 'Campuran (sebagian homozigot, sebagian heterozigot)';
  }

  // REVISI (DIHIBRID): helper BARU generik — bangun kode genotipe gabungan
  // ("AaBb") dan array objek fenotipe dari sebuah objek `traits` (bentuk yang
  // SUDAH dipakai genotype.traits/child.traits di seluruh codebase) + daftar
  // traitIds. Dipakai oleh SEMUA modul yang sebelumnya hardcode 1 traitId,
  // supaya perilakunya otomatis identik untuk traitIds.length === 1.
  function genotypeCode(traitsObj, traitIds) {
    return traitIds.map((t) => traitsObj[t].join('')).join('');
  }

  function phenotypesFor(traitsObj, traitIds) {
    return traitIds.map((t) => DominanceRule.resolvePhenotype(traitsObj[t], Traits[t], DominanceRule.dominantSymbolFor(Traits[t])));
  }

  // Label fenotipe gabungan untuk tampilan ("Daun Merah" utk 1 trait,
  // "Daun Merah, Bunga Besar" utk 2 trait) — dipisah koma supaya tetap
  // terbaca sebagai 1 unit fenotipe walau > 1 sifat digabungkan.
  function phenotypeLabel(traitsObj, traitIds) {
    return traitIds.map((t) => {
      const phenotype = DominanceRule.resolvePhenotype(traitsObj[t], Traits[t], DominanceRule.dominantSymbolFor(Traits[t]));
      return `${Traits[t].noun} ${phenotype.label}`;
    }).join(', ');
  }

  return { qs, qsa, createEl, uid, zygosityLabel, genotypeCode, phenotypesFor, phenotypeLabel };
})();

/* ==========================================================================
   2. EVENT BUS
   ========================================================================== */
const EventBus = (() => {
  const listeners = {};

  function on(event, callback) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(callback);
    return () => off(event, callback);
  }

  function off(event, callback) {
    if (!listeners[event]) return;
    listeners[event] = listeners[event].filter((cb) => cb !== callback);
  }

  function emit(event, payload) {
    (listeners[event] || []).forEach((cb) => cb(payload));
  }

  return { on, off, emit };
})();

/* ==========================================================================
   3. DATA — Species & Traits
   ========================================================================== */
const Traits = {
  warna_daun: {
    id: 'warna_daun',
    name: 'Warna Daun',
    // REVISI (3 Organisme Monohibrid): `noun` = kata benda yang dipakai UI
    // untuk menyebut manifestasi trait ini (mis. "Daun Merah"). SEBELUMNYA
    // kata "Daun" di-hardcode langsung di banyak tempat (Renderer,
    // ExplanationEngine, EducationPanel, ChildManager, GenerationTreeManager)
    // -> otomatis SALAH begitu spesies lain (biji, sayap) dipakai. Field ini
    // membuat teks tersebut generik tanpa mengubah satu pun logic Mendel.
    noun: 'Daun',
    alleles: {
      A: { symbol: 'A', label: 'Merah', color: '#E5473B' },
      a: { symbol: 'a', label: 'Putih', color: '#F4F4F2' }
    }
  },
  // REVISI (3 Organisme Monohibrid): trait baru untuk Kacang Polong — 1 gen,
  // dominansi penuh, MENGGUNAKAN Mendel Engine yang sama persis (tidak ada
  // logic baru). Contoh klasik Mendel: biji kuning dominan atas biji hijau.
  warna_biji: {
    id: 'warna_biji',
    name: 'Warna Biji',
    noun: 'Biji',
    alleles: {
      A: { symbol: 'A', label: 'Kuning', color: '#F2C230' },
      a: { symbol: 'a', label: 'Hijau', color: '#4C9A5B' }
    }
  },
  // REVISI (3 Organisme Monohibrid): trait untuk Kupu-Kupu — model
  // penyederhanaan pendidikan (lihat catatan di Species.kupu_kupu) untuk
  // sayap gelap (dominan) vs sayap terang (resesif).
  warna_sayap: {
    id: 'warna_sayap',
    name: 'Warna Sayap',
    noun: 'Sayap',
    alleles: {
      A: { symbol: 'A', label: 'Gelap', color: '#6A4C93' },
      a: { symbol: 'a', label: 'Terang', color: '#F5D77A' }
    }
  },
  // REVISI (DIHIBRID): gen KEDUA untuk Kacang Polong — bentuk biji (Bulat
  // dominan / Keriput resesif). Berpasangan dengan `warna_biji` yang SUDAH
  // ADA, ini persis pasangan trait klasik yang dipakai Mendel sendiri untuk
  // percobaan dihibridnya (RrYy). TIDAK menyentuh MendelEngine/GameteFactory
  // — keduanya sudah generik multi-gen sejak awal (lihat catatan modul
  // masing-masing), trait baru ini murni DATA.
  // REVISI (DIHIBRID): sengaja pakai simbol B/b (bukan A/a) — gen KEDUA
  // dalam sebuah persilangan dihibrid harus punya simbol sendiri supaya
  // genotipe gabungan terbaca jelas ("AaBb", sesuai Aturan #28), bukan
  // ambigu ("AaAa"). Lihat DominanceRule.dominantSymbolFor — sistem
  // menentukan simbol dominan per-trait dari huruf besar, bukan hardcode 'A'.
  bentuk_biji: {
    id: 'bentuk_biji',
    name: 'Bentuk Biji',
    noun: 'Biji',
    alleles: {
      B: { symbol: 'B', label: 'Bulat', color: '#D8B34C' },
      b: { symbol: 'b', label: 'Keriput', color: '#8C6B2F' }
    }
  },
  // REVISI (DIHIBRID): gen kedua untuk Bunga — ukuran bunga (model
  // penyederhanaan pendidikan, sama semangatnya dengan warna_sayap Kupu-Kupu).
  ukuran_bunga: {
    id: 'ukuran_bunga',
    name: 'Ukuran Bunga',
    noun: 'Bunga',
    alleles: {
      B: { symbol: 'B', label: 'Besar', color: '#E07A3F' },
      b: { symbol: 'b', label: 'Kecil', color: '#F2C9A8' }
    }
  },
  // REVISI (DIHIBRID): gen kedua untuk Kupu-Kupu — ukuran sayap (model
  // penyederhanaan pendidikan, konsisten dengan catatan Species.kupu_kupu).
  ukuran_sayap: {
    id: 'ukuran_sayap',
    name: 'Ukuran Sayap',
    noun: 'Sayap',
    alleles: {
      B: { symbol: 'B', label: 'Lebar', color: '#4C6A93' },
      b: { symbol: 'b', label: 'Sempit', color: '#A8C0F2' }
    }
  }
  // Trait baru (mis. tinggi_batang) tinggal ditambahkan di sini
  // tanpa mengubah MendelEngine / GameteFactory sama sekali.
};

// REVISI (DIHIBRID): helper generik untuk membangun 9 starter genotype
// (mis. AABB..aabb) dari 2 trait id, dipakai oleh SEMUA entry `Species` yang
// mendukung dihibrid di bawah -> TIDAK ADA duplikasi penulisan 9 kombinasi
// per organisme. Simbol dominan/resesif diturunkan dari Traits[traitId]
// masing-masing (bukan hardcode 'A'/'a') supaya benar untuk trait ber-simbol
// apa pun (mis. B/b pada gen kedua).
function buildDihybridStarters(traitIdA, traitIdB) {
  const symbolsFor = (traitId) => {
    const def = Traits[traitId];
    const dom = Object.keys(def.alleles).find((s) => s === s.toUpperCase());
    const rec = Object.keys(def.alleles).find((s) => s !== dom);
    return { dom, rec };
  };
  const sA = symbolsFor(traitIdA);
  const sB = symbolsFor(traitIdB);
  const zygosityPairs = (s) => [[s.dom, s.dom], [s.dom, s.rec], [s.rec, s.rec]];
  const starters = [];
  zygosityPairs(sA).forEach((g1) => {
    zygosityPairs(sB).forEach((g2) => {
      starters.push({
        id: `${g1.join('')}${g2.join('')}`,
        traits: { [traitIdA]: g1, [traitIdB]: g2 }
      });
    });
  });
  return starters;
}

// REVISI 1 & 2: dominansi bersifat TETAP (fixed), tidak lagi bisa diubah user.
// Disimpan sebagai konstanta terpisah dari GameState agar jelas ini bukan
// bagian yang berubah-ubah — namun tetap melewati DominanceRule (strategy)
// yang sama, sehingga arsitektur siap jika suatu saat dibutuhkan lagi mode
// dominansi lain (incomplete, codominance) tanpa mengubah pemanggilnya.
const FIXED_DOMINANT_ALLELE = 'A';

const Species = {
  bunga: {
    id: 'bunga',
    name: 'Bunga',
    icon: '🌼',
    description: 'Pelajari pewarisan warna daun',
    traits: ['warna_daun'],
    starterGenotypes: [
      { id: 'AA', traits: { warna_daun: ['A', 'A'] } },
      { id: 'Aa', traits: { warna_daun: ['A', 'a'] } },
      { id: 'aa', traits: { warna_daun: ['a', 'a'] } }
    ],
    // REVISI (DIHIBRID): field BARU, terpisah dari `traits`/`starterGenotypes`
    // di atas (yang TETAP dipakai apa adanya untuk Monohibrid — Aturan #27:
    // tidak menyentuh perilaku Monohibrid). Dipilih HANYA saat
    // AppState.inheritanceType === 'dihybrid' (lihat GameState.selectSpecies).
    dihybridTraits: ['warna_daun', 'ukuran_bunga'],
    dihybridStarterGenotypes: buildDihybridStarters('warna_daun', 'ukuran_bunga')
  },
  // REVISI (3 Organisme Monohibrid): Kacang Polong — TIDAK ADA logic
  // persilangan baru di sini, hanya konfigurasi trait. MendelEngine,
  // GameteFactory, dan PunnettCalculator yang sudah ada dipakai apa adanya.
  kacang_polong: {
    id: 'kacang_polong',
    name: 'Kacang Polong',
    icon: '🫛',
    description: 'Pelajari pewarisan warna biji',
    traits: ['warna_biji'],
    starterGenotypes: [
      { id: 'AA', traits: { warna_biji: ['A', 'A'] } },
      { id: 'Aa', traits: { warna_biji: ['A', 'a'] } },
      { id: 'aa', traits: { warna_biji: ['a', 'a'] } }
    ],
    // REVISI (DIHIBRID): pasangan klasik Mendel — warna biji × bentuk biji.
    dihybridTraits: ['warna_biji', 'bentuk_biji'],
    dihybridStarterGenotypes: buildDihybridStarters('warna_biji', 'bentuk_biji')
  },
  // REVISI (3 Organisme Monohibrid): Kupu-Kupu — model penyederhanaan
  // pendidikan (lihat catatan "SCIENTIFIC EDUCATIONAL NOTE" di help/info
  // panel): dipakai sebagai representasi visual pewarisan sifat, BUKAN klaim
  // bahwa warna sayap kupu-kupu nyata selalu dikendalikan 1 gen dominan penuh.
  kupu_kupu: {
    id: 'kupu_kupu',
    name: 'Kupu-Kupu',
    icon: '🦋',
    description: 'Simulasi pewarisan warna sayap (model sederhana)',
    traits: ['warna_sayap'],
    starterGenotypes: [
      { id: 'AA', traits: { warna_sayap: ['A', 'A'] } },
      { id: 'Aa', traits: { warna_sayap: ['A', 'a'] } },
      { id: 'aa', traits: { warna_sayap: ['a', 'a'] } }
    ],
    // REVISI (DIHIBRID): pasangan warna sayap × ukuran sayap.
    dihybridTraits: ['warna_sayap', 'ukuran_sayap'],
    dihybridStarterGenotypes: buildDihybridStarters('warna_sayap', 'ukuran_sayap')
  }
  // Spesies baru tinggal ditambahkan sebagai entry baru di object ini +
  // entry sepadan di SIMULATION_CONFIG.speciesCatalog/traitCatalogBySpecies
  // di bawah — TIDAK PERLU menyentuh MendelEngine/GameteFactory/PunnettCalculator.
};

/* ==========================================================================
   3a-2. SIMULATION_CONFIG — katalog TERPUSAT untuk kebutuhan MENU (jenis
   persilangan, spesies, mode). Sengaja TERPISAH dari `Species`/`Traits` di
   atas (yang merupakan data ENGINE sungguhan, dipakai simulasi aktif):
   - `Species` HANYA berisi spesies yang benar-benar punya engine lengkap
     (starterGenotypes, traits) — supaya tidak ada risiko simulator mencoba
     menjalankan spesies yang datanya belum lengkap.
   - `SIMULATION_CONFIG.speciesCatalog` berisi SEMUA spesies untuk DITAMPILKAN
     di menu, termasuk yang belum tersedia (`available: false`) — murni
     display/config, tidak pernah dipakai untuk perhitungan genetika.
   Pola ini memenuhi "config-driven architecture" tanpa membuat Simulation
   Engine bisa "dipaksa jalan" dengan data species yang belum lengkap.
   ========================================================================== */
const SIMULATION_CONFIG = {
  inheritanceTypes: {
    monohybrid: {
      id: 'monohybrid',
      label: 'Monohibrid',
      shortDesc: '1 sifat / 1 gen',
      desc: 'Persilangan yang melibatkan satu sifat.',
      available: true
    },
    dihybrid: {
      id: 'dihybrid',
      label: 'Dihibrid',
      shortDesc: '2 sifat / 2 gen',
      desc: 'Persilangan yang melibatkan dua sifat sekaligus.',
      // REVISI (DIHIBRID): diaktifkan. Shared system yang sama (species grid,
      // parent system, cross workflow, dst.) kini melayani dihibrid juga —
      // lihat SIMULATION_CONFIG.speciesCatalog/traitCatalogBySpecies di bawah
      // untuk bagaimana per-spesies mendeklarasikan trait dihibridnya.
      available: true
    }
  },

  // id di sini HARUS sama dengan key di `Species` untuk entry yang available.
  // REVISI (DIHIBRID): setiap entry sekarang boleh punya `shortDescByType`
  // (opsional) supaya ringkasan di kartu menu ikut berubah sesuai
  // inheritanceType yang dipilih — MenuManager.renderSpeciesGrid membaca
  // field ini kalau ada, fallback ke `shortDesc` kalau tidak. Species yang
  // TIDAK mendeklarasikan dihybridTraits di `Species` (lihat atas) otomatis
  // tetap tidak tersedia saat dihibrid dipilih (lihat MenuManager).
  speciesCatalog: {
    bunga: {
      id: 'bunga',
      label: 'Bunga',
      icon: '🌼',
      shortDesc: 'Monohibrid • 1 sifat (Warna Daun)',
      shortDescByType: { dihybrid: 'Dihibrid • 2 sifat (Warna Daun × Ukuran Bunga)' },
      available: true
    },
    // REVISI (3 Organisme Monohibrid): sekarang benar-benar diimplementasikan
    // penuh (punya entry sepadan di `Species` di atas) -> available:true.
    kacang_polong: {
      id: 'kacang_polong',
      label: 'Kacang Polong',
      icon: '🫛',
      shortDesc: 'Monohibrid • 1 sifat (Warna Biji)',
      shortDescByType: { dihybrid: 'Dihibrid • 2 sifat (Warna Biji × Bentuk Biji) — klasik Mendel' },
      available: true
    },
    kupu_kupu: {
      id: 'kupu_kupu',
      label: 'Kupu-Kupu',
      icon: '🦋',
      shortDesc: 'Monohibrid • 1 sifat (Warna Sayap)',
      shortDescByType: { dihybrid: 'Dihibrid • 2 sifat (Warna Sayap × Ukuran Sayap)' },
      available: true
    }
    // Spesies lain tinggal ditambahkan di sini untuk tampil di menu sebagai
    // "Segera Hadir" (available:false) — TIDAK PERNAH memengaruhi `Species`
    // (data engine nyata) sampai benar-benar diimplementasikan penuh.
  },

  // REVISI 11 (future trait extension) + REVISI (DIHIBRID): trait per
  // spesies untuk ditampilkan di summary menu, kini per inheritanceType.
  traitCatalogBySpecies: {
    bunga: {
      monohybrid: [{ id: 'warna_daun', label: 'Warna Daun', available: true }],
      dihybrid: [
        { id: 'warna_daun', label: 'Warna Daun', available: true },
        { id: 'ukuran_bunga', label: 'Ukuran Bunga', available: true }
      ]
    },
    kacang_polong: {
      monohybrid: [{ id: 'warna_biji', label: 'Warna Biji', available: true }],
      dihybrid: [
        { id: 'warna_biji', label: 'Warna Biji', available: true },
        { id: 'bentuk_biji', label: 'Bentuk Biji', available: true }
      ]
    },
    kupu_kupu: {
      monohybrid: [{ id: 'warna_sayap', label: 'Warna Sayap', available: true }],
      dihybrid: [
        { id: 'warna_sayap', label: 'Warna Sayap', available: true },
        { id: 'ukuran_sayap', label: 'Ukuran Sayap', available: true }
      ]
    }
    // Trait lain tinggal ditambahkan sebagai array member baru per
    // inheritanceType untuk keperluan tampilan menu di masa depan.
  },

  modes: {
    learning: {
      id: 'learning',
      label: 'Learning Mode',
      icon: '📖',
      desc: 'Pelajari konsep melalui panduan langkah demi langkah.',
      available: true
    },
    challenge: {
      id: 'challenge',
      label: 'Challenge Mode',
      icon: '🎯',
      desc: 'Uji pemahamanmu melalui tantangan.',
      available: true
    },
    free: {
      id: 'free',
      label: 'Free / Sandbox',
      icon: '🧪',
      desc: 'Bereksperimen dengan persilangan secara bebas.',
      available: true
    }
    // Mode masa depan tinggal ditambahkan di sini dengan available:false +
    // status:'coming-soon', otomatis tampil sebagai kartu nonaktif di menu.
  }
};

/* ==========================================================================
   3a-2b. ASSET_CONFIG — SINGLE SOURCE OF TRUTH untuk seluruh path asset
   visual organisme. TIDAK ADA komponen render (Renderer, ChildManager,
   GenerationTreeManager) yang boleh hardcode path gambar — semuanya memanggil
   OrganismIllustration.create(speciesId, phenotype) yang membaca config ini.

   status: 'available'   -> file PNG dianggap sudah ada di path `src`,
                             render <img> langsung. Kalaupun file ternyata
                             belum ada di server (typo path / belum di-upload),
                             `img.onerror` di OrganismIllustration tetap jatuh
                             ke placeholder emoji, TIDAK PERNAH broken-image
                             icon -- aman di kedua kondisi.
   status: 'placeholder' -> sengaja TIDAK mencoba <img> sama sekali (dipakai
                             kalau organisme/trait belum official didukung).

   REVISI (Integrasi Asset Dihibrid — 18 asset nyata, lihat dictionary di
   bawah): ketiga organisme (bunga, kacang_polong, kupu_kupu) sekarang
   'available' dengan path PERSIS sesuai folder assets/flowers|peas|butterflies
   yang sudah disiapkan. `variants` per organisme berisi key 1-trait
   (Monohibrid) BERDAMPINGAN dengan key kombinasi 2-trait (Dihibrid) dalam
   SATU dictionary yang sama -- resolusi key-nya ada di
   OrganismIllustration.keyFor (sort + join label fenotipe, bukan genotype
   string ataupun index), jadi menambah organisme/trait baru di masa depan
   cukup menambah entri di sini, tanpa menyentuh Mendel Engine/Renderer.
   ========================================================================== */
// REVISI (Integrasi Asset Dihibrid — 18 asset nyata): SATU dictionary
// `variants` per organisme sekarang menampung DUA jenis key sekaligus,
// tanpa sistem/struktur terpisah:
//   - key 1-trait ("Merah", "Kuning", "Gelap", ...)       -> dipakai Monohibrid
//   - key kombinasi 2-trait ("Besar+Merah", "Bulat+Kuning", ...)
//                                                           -> dipakai Dihibrid
// Key kombinasi SELALU label per-trait yang di-sort alfabetis lalu digabung
// '+' (lihat OrganismIllustration.keyFor) -- dihasilkan dari resolvePhenotype
// milik Mendel Engine yang sudah ada, BUKAN dari genotype string ("AABB")
// atau index array, jadi tetap deterministic & tidak peduli urutan
// drag/drop (Aturan #4, #8, #9). Monohibrid TIDAK tersentuh strukturnya --
// hanya path file yang diperbarui ke varian "big/round/wide" sesuai
// instruksi (Bagian 2).
const ASSET_CONFIG = {
  organisms: {
    bunga: {
      status: 'available',
      variants: {
        // Monohibrid (default = varian big)
        Merah: { src: 'assets/flowers/flower-red-big.png', emoji: '🌼' },
        Putih: { src: 'assets/flowers/flower-white-big.png', emoji: '🌼' },
        // Dihibrid: warna_daun (Merah/Putih) x ukuran_bunga (Besar/Kecil)
        'Besar+Merah': { src: 'assets/flowers/flower-red-big.png', emoji: '🌼' },
        'Kecil+Merah': { src: 'assets/flowers/flower-red-small.png', emoji: '🌼' },
        'Besar+Putih': { src: 'assets/flowers/flower-white-big.png', emoji: '🌼' },
        'Kecil+Putih': { src: 'assets/flowers/flower-white-small.png', emoji: '🌼' }
      }
    },
    kacang_polong: {
      status: 'available',
      variants: {
        // Monohibrid (default = varian round)
        Kuning: { src: 'assets/peas/pea-yellow-round.png', emoji: '🫛' },
        Hijau: { src: 'assets/peas/pea-green-round.png', emoji: '🫛' },
        // Dihibrid: warna_biji (Kuning/Hijau) x bentuk_biji (Bulat/Keriput)
        'Bulat+Kuning': { src: 'assets/peas/pea-yellow-round.png', emoji: '🫛' },
        'Keriput+Kuning': { src: 'assets/peas/pea-yellow-wrinkled.png', emoji: '🫛' },
        'Bulat+Hijau': { src: 'assets/peas/pea-green-round.png', emoji: '🫛' },
        'Hijau+Keriput': { src: 'assets/peas/pea-green-wrinkled.png', emoji: '🫛' }
      }
    },
    kupu_kupu: {
      status: 'available',
      variants: {
        // Monohibrid (default = varian wide)
        Gelap: { src: 'assets/butterflies/butterfly-black-wide.png', emoji: '🦋' },
        Terang: { src: 'assets/butterflies/butterfly-white-wide.png', emoji: '🦋' },
        // Dihibrid: warna_sayap (Gelap/Terang) x ukuran_sayap (Lebar/Sempit)
        'Gelap+Lebar': { src: 'assets/butterflies/butterfly-black-wide.png', emoji: '🦋' },
        'Gelap+Sempit': { src: 'assets/butterflies/butterfly-black-narrow.png', emoji: '🦋' },
        'Lebar+Terang': { src: 'assets/butterflies/butterfly-white-wide.png', emoji: '🦋' },
        'Sempit+Terang': { src: 'assets/butterflies/butterfly-white-narrow.png', emoji: '🦋' }
      }
    }
  }
};

/* ==========================================================================
   3a-2c. BACKGROUNDS — SINGLE SOURCE OF TRUTH untuk Background Switching
   System (Bagian 3 prompt revisi). Total SENGAJA dibatasi 5 slot (existing
   Botanical Lab dihitung sebagai 1 slot + 4 slot baru = 5), sesuai requirement
   "TOTAL BACKGROUND SLOT = 5" — jangan menambah entry baru di sini tanpa
   menghapus salah satu, atau audit ulang batas ini secara sadar.

   available:true  -> asset PNG sudah ada, bisa dipilih user.
   available:false -> slot disiapkan (folder convention + config) tapi PNG
                       belum ada -> muncul di selector sebagai "Segera Hadir",
                       TIDAK bisa dipilih (mencegah broken image).

   CARA MENAMBAHKAN BACKGROUND BARU DI MASA DEPAN:
   1. Taruh file PNG di path `asset` yang tercantum (mis. background-02.png).
   2. Ubah `available` slot terkait menjadi `true`.
   Tidak ada kode lain yang perlu diubah — BackgroundManager & selector UI
   membaca array ini secara otomatis.
   ========================================================================== */
const BACKGROUNDS = [
  {
    id: 'botanical-lab',
    name: 'Botanical Laboratory',
    asset: 'assets/background/lab_botanical_background.png',
    available: true
  },
  { id: 'classroom-lab', name: 'Classroom Laboratory', asset: 'assets/background/lab_class_background.png', available: true },
  { id: 'futuristi-lab', name: 'Futuristic Laboratory', asset: 'assets/background/lab_futuristic_background.png', available: true },
  { id: 'library-lab', name: 'Library Laboratory', asset: 'assets/background/lab_library_background.png', available: true },
  { id: 'garden-lab', name: 'Garden Laboratory', asset: 'assets/background/lab_garden_background.png', available: true }
];

/* ==========================================================================
   3a-3. MODE_CONFIG — SATU-SATUNYA sumber kebenaran perilaku tiap mode.
   Ini yang membedakan REVISI ini dari sebelumnya: sebelumnya "mode" cuma
   memengaruhi step-gating Learning Mode; sekarang SETIAP keputusan
   behavioral (boleh Challenge? boleh eksplorasi bebas? ada skor?) query ke
   SATU objek ini — bukan `if (mode === 'challenge')` yang tersebar di
   banyak modul berbeda (itu justru akar masalah "ketiga mode terasa sama").
   ========================================================================== */
const MODE_CONFIG = {
  learning: {
    type: 'learning',
    guided: true,
    challengeEnabled: false,   // Challenge TIDAK PERNAH muncul di Learning Mode
    scoringEnabled: false,
    skipEnabled: false,        // tidak relevan (tidak ada challenge untuk di-skip)
    freeExploration: true,     // parent/child tetap bebas diganti — Learning bukan ujian
    hintsEnabled: true
  },
  challenge: {
    type: 'challenge',
    guided: false,
    challengeEnabled: true,    // Challenge WAJIB aktif sepanjang sesi mode ini
    scoringEnabled: true,
    skipEnabled: false,        // TIDAK ADA skip — hanya "Akhiri Sesi" (beda konsep)
    freeExploration: false,    // parent TERKUNCI ke objective, tidak bisa diganti bebas
    hintsEnabled: true
  },
  free: {
    type: 'sandbox',
    guided: false,
    challengeEnabled: false,   // Challenge TIDAK PERNAH muncul di Free/Sandbox
    scoringEnabled: false,
    skipEnabled: false,
    freeExploration: true,     // kebebasan MAKSIMAL
    hintsEnabled: false
  }
};

/* ==========================================================================
   3b. APP STATE — SATU sumber kebenaran terpusat untuk seluruh aplikasi.
   DOM adalah REPRESENTASI dari objek ini, bukan sebaliknya — semua modul
   state (GameState, ChildManager, HistoryManager, LearningManager,
   UndoRedoManager, ActivityLog) membaca/menulis ke sini, bukan menyimpan
   variabel privat mereka sendiri. Fungsi publik modul-modul tersebut TETAP
   sama seperti sebelumnya (getState/setParent/dst.) — yang berubah hanya
   LOKASI penyimpanan datanya, supaya seluruh titik pemanggilan yang sudah
   ada di codebase tidak perlu disentuh (risiko regresi jauh lebih kecil
   dibanding menulis ulang seluruh call site).
   ========================================================================== */
const AppState = {
  // REVISI MENU: field baru — satu-satunya tambahan state sungguhan untuk
  // revisi ini (bukan "state kedua" yang duplikat; speciesId/traitId/
  // currentMode yang sudah ada TETAP dipakai apa adanya, tidak diduplikasi).
  inheritanceType: 'monohybrid',
  currentMode: 'learning',
  currentGeneration: 0,
  speciesId: null,
  // REVISI (DIHIBRID): `traitId` (string tunggal) -> `traitIds` (array).
  // Panjang 1 = perilaku Monohibrid PERSIS seperti sebelumnya (satu-satunya
  // konsumen yang benar-benar butuh 1 traitId tunggal tinggal memakai
  // traitIds[0]). Panjang 2 = Dihibrid. Tidak ada field kedua/duplikat.
  traitIds: null,
  parents: { parent1: null, parent2: null },
  children: [],
  punnettSquare: null,
  genotypeRatio: [],
  phenotypeRatio: [],
  generationHistory: [],
  activityHistory: [],
  selectedChild: null,
  selectedParentSlot: null,
  learningProgress: { completedSteps: [] },
  challengeState: null,
  undoStack: [],
  redoStack: [],
  // REVISI (Background Switching System): id latar simulasi yang sedang
  // aktif. Hidup selama SIMULATION SESSION (bukan localStorage terpisah) —
  // ikut tersimpan lewat SessionStorage yang SUDAH ADA (lihat captureSnapshot).
  backgroundId: null
};

/* ==========================================================================
   4. CORE — Genetics Engine
   ========================================================================== */

// 4.1 DominanceRule — strategy menentukan fenotipe dari genotype
const DominanceRule = (() => {
  function resolvePhenotype(alleles, traitDef, dominantSymbol, mode = 'complete') {
    const recessiveSymbol = Object.keys(traitDef.alleles).find((s) => s !== dominantSymbol);

    if (mode === 'complete') {
      const hasDominant = alleles.includes(dominantSymbol);
      const activeSymbol = hasDominant ? dominantSymbol : recessiveSymbol;
      return traitDef.alleles[activeSymbol];
    }

    return traitDef.alleles[alleles[0]];
  }

  // REVISI (DIHIBRID): SEBELUMNYA seluruh codebase memanggil resolvePhenotype
  // dengan literal `FIXED_DOMINANT_ALLELE` ('A') sebagai symbol dominan untuk
  // TRAIT APA PUN — aman selama hanya 1 trait pernah dipakai bersamaan
  // (Monohibrid, dan seluruh trait lama memang didefinisikan pakai A/a).
  // Begitu 2 trait digabung dalam satu genotipe (Dihibrid), trait kedua HARUS
  // punya simbol sendiri (mis. B/b) supaya genotipe gabungan terbaca jelas
  // ("AaBb", bukan "AaAa" yang ambigu) — sesuai konvensi ilmiah standar dan
  // sesuai notasi yang diminta (Aturan #28: "AaBb × AaBb").
  // dominantSymbolFor MENGGANTIKAN pemakaian literal FIXED_DOMINANT_ALLELE di
  // seluruh call site: konvensi yang SUDAH DIPAKAI MendelEngine/Utils.zygosityLabel
  // ("simbol uppercase = dominan") sekarang diterapkan KONSISTEN di sini juga,
  // per-trait — bukan konsep baru, hanya generalisasi dari asumsi implisit
  // yang sudah ada. Untuk trait ber-alel A/a (semua trait Monohibrid existing),
  // hasilnya PERSIS 'A' seperti sebelumnya -> zero regression.
  function dominantSymbolFor(traitDef) {
    return Object.keys(traitDef.alleles).find((s) => s === s.toUpperCase()) || FIXED_DOMINANT_ALLELE;
  }

  return { resolvePhenotype, dominantSymbolFor };
})();

/* ==========================================================================
   4b. EXPLANATION ENGINE (REVISI 18) — generate teks penjelasan 3 tingkat
   (SD/SMP/SMA) untuk kombinasi genotipe, fenotipe, dan rasio. Murni fungsi
   generik berbasis data (alel, genotype pair) — tidak hardcode ke trait
   "warna daun" secara spesifik, sehingga reusable untuk trait/spesies lain.
   ========================================================================== */
const ExplanationEngine = (() => {
  function explainCombination(pair, level) {
    const [a, b] = pair;
    const genoStr = pair.join('');
    if (level === 'sd') {
      return `Genotipe <strong>${genoStr}</strong> muncul karena gamet <strong>${a}</strong> dari salah satu induk bertemu gamet <strong>${b}</strong> dari induk lainnya.`;
    }
    if (level === 'smp') {
      return `Genotipe <strong>${genoStr}</strong> terbentuk saat gamet pembawa alel ${a} dari satu induk membuahi gamet pembawa alel ${b} dari induk lainnya, sesuai kombinasi pada papan Punnett.`;
    }
    const zygosity = Utils.zygosityLabel(pair);
    return `Genotipe <strong>${genoStr}</strong> (${zygosity}) terbentuk dari fusi gamet haploid pembawa alel ${a} dengan gamet pembawa alel ${b} saat fertilisasi.`;
  }

  // Tetap 1 gen per pemanggilan (dominantSymbol diturunkan per-trait, bukan
  // hardcode 'A' — REVISI DIHIBRID) — pemanggil (buildFullExplanationHTML)
  // yang bertanggung jawab menggabungkan penjelasan lintas gen.
  function explainPhenotype(pair, traitId, level) {
    const traitDef = Traits[traitId];
    const noun = traitDef.noun;
    const dominantSymbol = DominanceRule.dominantSymbolFor(traitDef);
    const recessiveSymbol = Object.keys(traitDef.alleles).find((s) => s !== dominantSymbol);
    const phenotype = DominanceRule.resolvePhenotype(pair, traitDef, dominantSymbol);
    const genoStr = pair.join('');
    const hasDominant = pair.includes(dominantSymbol);

    if (level === 'sd') {
      return hasDominant
        ? `${noun} jadi <strong>${phenotype.label}</strong> karena di genotipe ${genoStr} ada alel ${dominantSymbol}, dan alel ${dominantSymbol} selalu "menang".`
        : `${noun} jadi <strong>${phenotype.label}</strong> karena genotipe ${genoStr} tidak punya alel ${dominantSymbol} sama sekali.`;
    }
    if (level === 'smp') {
      return hasDominant
        ? `Genotipe ${genoStr} memiliki alel dominan ${dominantSymbol}, sehingga sifat yang tampak (fenotipe) adalah ${noun} <strong>${phenotype.label}</strong>.`
        : `Genotipe ${genoStr} hanya memiliki alel resesif ${recessiveSymbol}, sehingga sifat resesif ${noun} <strong>${phenotype.label}</strong> baru bisa muncul.`;
    }
    return hasDominant
      ? `Karena alel ${dominantSymbol} bersifat dominan penuh terhadap ${recessiveSymbol}, keberadaan minimal satu alel ${dominantSymbol} pada genotipe ${genoStr} sudah cukup menutupi ekspresi alel resesif, sehingga fenotipe yang terekspresi adalah ${noun} <strong>${phenotype.label}</strong>.`
      : `Genotipe ${genoStr} bersifat homozigot resesif (tanpa alel dominan ${dominantSymbol}), sehingga alel resesif ${recessiveSymbol} dapat terekspresi sepenuhnya sebagai fenotipe ${noun} <strong>${phenotype.label}</strong>.`;
  }

  // REVISI (DIHIBRID): `traitId` tunggal -> `traitIds` (array; panjang 1 =
  // perilaku IDENTIK dengan sebelumnya).
  function explainRatio(genotypeRatio, phenotypeRatio, level, traitIds) {
    const genoStr = genotypeRatio.map((r) => r.count).join(' : ');
    const phenoStr = phenotypeRatio.map((r) => r.count).join(' : ');
    const nouns = (traitIds || []).filter((t) => Traits[t]).map((t) => Traits[t].noun);
    const noun = nouns.length ? nouns.join('/') : 'sifat';
    if (level === 'sd') {
      return `Perbandingan genotipe anak adalah <strong>${genoStr}</strong> dan perbandingan ${noun.toLowerCase()}nya <strong>${phenoStr}</strong>, karena setiap kotak di papan Punnett punya kemungkinan yang sama besar untuk terjadi.`;
    }
    if (level === 'smp') {
      return `Rasio genotipe <strong>${genoStr}</strong> dan rasio fenotipe <strong>${phenoStr}</strong> muncul karena tiap kombinasi gamet pada papan Punnett memiliki peluang yang sama, sesuai jumlah sel yang mewakili tiap genotipe.`;
    }
    return `Rasio genotipe <strong>${genoStr}</strong> dan rasio fenotipe <strong>${phenoStr}</strong> merupakan konsekuensi langsung dari Hukum Segregasi Mendel${traitIds && traitIds.length > 1 ? ' dan Hukum Berpasangan Bebas (Independent Assortment)' : ''}: setiap gamet membawa satu alel per gen secara acak dengan peluang sama, sehingga distribusi genotipe zigot mengikuti proporsi kombinasi pada papan Punnett secara probabilistik.`;
  }

  // Panel lengkap "Jelaskan Hasil Ini": semua genotipe berbeda + rasio, 1 level
  // sekaligus. REVISI (DIHIBRID): `traitId` -> `traitIds`; sel grid sekarang
  // berbentuk objek `traits` (lihat PunnettCalculator.build), jadi
  // penjelasan per-gen digabung per sel lewat traitIds.map(...).
  function buildFullExplanationHTML({ punnettResult, traitIds, genotypeRatio, phenotypeRatio }, level) {
    const ids = traitIds || punnettResult.traitIds || [];
    const distinctCells = [...new Map(
      punnettResult.grid.flat().map((cell) => [Utils.genotypeCode(cell, ids), cell])
    ).values()];

    const comboItems = distinctCells
      .map((cell) => {
        const perGene = ids
          .map((t) => `${explainCombination(cell[t], level)}<br><span style="color:var(--color-text-muted)">${explainPhenotype(cell[t], t, level)}</span>`)
          .join('<br>');
        return `<li>${perGene}</li>`;
      })
      .join('');

    return `
      <h5>Kenapa genotipe-genotipe ini muncul?</h5>
      <ul>${comboItems}</ul>
      <h5>Kenapa rasionya seperti itu?</h5>
      <p>${explainRatio(genotypeRatio, phenotypeRatio, level, ids)}</p>
    `;
  }

  return { explainCombination, explainPhenotype, explainRatio, buildFullExplanationHTML };
})();

// 4.2 GameteFactory — membentuk gamet dari genotype (generik, siap multi-gen)
const GameteFactory = (() => {
  function alleleOptionsForGene(genePair) {
    const unique = [...new Set(genePair)];
    return unique.map((symbol) => ({
      symbol,
      probability: genePair.filter((s) => s === symbol).length / genePair.length
    }));
  }

  // formGametes: GAMETE TYPE (di-dedupe + probability) — dipertahankan APA
  // ADANYA untuk MendelEngine.cross (kalkulasi probabilitas genotipe anak;
  // hasil akhirnya identik apakah dihitung dari type yang di-dedupe+weighted
  // atau dari slot penuh, karena probabilitasnya tetap dijumlahkan per hasil)
  // dan untuk LearningManager.presentGameteLearning (teks edukasi "induk ini
  // membentuk gamet tipe apa saja" — secara pedagogis memang tipe unik yang
  // relevan di sana, bukan slot). REVISI (Punnett Grid Collapse Fix): fungsi
  // ini BUKAN LAGI dipakai untuk membangun grid visual Punnett — lihat
  // formGameteSlots di bawah untuk itu.
  function formGametes(genotypeTraits) {
    const traitIds = Object.keys(genotypeTraits);
    let combos = [{ alleles: {}, probability: 1 }];

    traitIds.forEach((traitId) => {
      const options = alleleOptionsForGene(genotypeTraits[traitId]);
      const next = [];
      combos.forEach((combo) => {
        options.forEach((opt) => {
          next.push({
            alleles: { ...combo.alleles, [traitId]: opt.symbol },
            probability: combo.probability * opt.probability
          });
        });
      });
      combos = next;
    });

    return combos;
  }

  // REVISI (Punnett Grid Collapse Fix): formGameteSlots — GAMETE SLOT
  // (POSISI), bukan gamete type. TIDAK melakukan unique()/Set/dedup dalam
  // bentuk apa pun: setiap posisi alel pada genePair (mis. ['A','A'] untuk
  // parent AA) dipertahankan sebagai slot terpisah, persis seperti
  // formGametes SEBELUM alleleOptionsForGene men-dedupe-nya. Untuk N gen,
  // selalu menghasilkan tepat 2^N slot (2 utk Monohibrid, 4 utk Dihibrid),
  // TIDAK PERNAH kurang — walau semua alel identik (AA, AABB, dst.) — karena
  // Punnett Square secara definisi merepresentasikan POSISI gamet, bukan
  // jenis gamet yang unik (lihat root-cause note di PunnettCalculator.build).
  function formGameteSlots(genotypeTraits) {
    const traitIds = Object.keys(genotypeTraits);
    let combos = [{ alleles: {} }];

    traitIds.forEach((traitId) => {
      const positions = genotypeTraits[traitId]; // mis. ['A','A'] — TIDAK di-unique()
      const next = [];
      combos.forEach((combo) => {
        positions.forEach((symbol) => {
          next.push({ alleles: { ...combo.alleles, [traitId]: symbol } });
        });
      });
      combos = next;
    });

    return combos;
  }

  return { formGametes, formGameteSlots };
})();

// 4.3 MendelEngine — cross 2 genotype -> distribusi probabilitas genotype anak
// (dipertahankan sebagai API murni/reusable; sumber kartu anak yang tampil
// di UI sekarang diambil dari PunnettCalculator agar 1:1 dengan visual papan
// Punnett — lihat ChildManager)
const MendelEngine = (() => {
  function combineAlleles(symbolA, symbolB) {
    const pair = [symbolA, symbolB];
    pair.sort((a, b) => {
      const aIsUpper = a === a.toUpperCase();
      const bIsUpper = b === b.toUpperCase();
      if (aIsUpper === bIsUpper) return 0;
      return aIsUpper ? -1 : 1;
    });
    return pair;
  }

  function cross(genotypeA, genotypeB) {
    const gametesA = GameteFactory.formGametes(genotypeA);
    const gametesB = GameteFactory.formGametes(genotypeB);
    const traitIds = Object.keys(genotypeA);

    const resultMap = new Map();

    gametesA.forEach((gA) => {
      gametesB.forEach((gB) => {
        const childTraits = {};
        traitIds.forEach((traitId) => {
          childTraits[traitId] = combineAlleles(gA.alleles[traitId], gB.alleles[traitId]);
        });
        const probability = gA.probability * gB.probability;
        const key = traitIds.map((t) => childTraits[t].join('')).join('|');

        if (resultMap.has(key)) {
          resultMap.get(key).probability += probability;
        } else {
          resultMap.set(key, { traits: childTraits, probability });
        }
      });
    });

    return Array.from(resultMap.values());
  }

  return { cross, combineAlleles };
})();

// 4.4 PunnettCalculator — susun grid Punnett Square dari 2 genotype
// REVISI (DIHIBRID — Aturan #11): DIGENERALISASI dari `buildForTrait`
// (single-gene, 2x2 saja) menjadi `build` yang menerima `traitIds` (array).
// TIDAK ADA "DihybridPunnett" terpisah — satu fungsi ini melayani 2x2
// (1 gen) MAUPUN 4x4 (2 gen) secara otomatis.
//
// REVISI (Punnett Grid Collapse Fix — root cause): SEBELUMNYA memakai
// GameteFactory.formGametes, yang men-dedupe gamete SAMA seperti tipe unik
// (mis. parent AA -> hanya 1 "tipe" gamet A, bukan 2 slot A) — sehingga
// AA×AA menghasilkan grid 1×1, AABB×AABB menghasilkan 1×1, AABb×AaBb
// menghasilkan 2×4, dst., alih-alih SELALU 2×2 (Monohibrid) / 4×4
// (Dihibrid) seperti definisi baku Punnett Square. Diperbaiki dengan
// memakai GameteFactory.formGameteSlots — SLOT gamet (posisi), BUKAN tipe
// unik — sehingga jumlah baris/kolom SELALU 2^len(traitIds), berapa pun
// homozigot/heterozigot-nya parent. formGametes (tipe unik, ber-probability)
// TETAP dipertahankan apa adanya untuk MendelEngine.cross & LearningManager
// (lihat catatan di GameteFactory) — hasil rasio akhir Punnett TIDAK
// berubah sama sekali (Aturan #1F): 4 sel AA (bukan 1 sel AA) tetap sama
// dengan 100% AA, hanya representasi selnya yang sekarang lengkap.
//
// Setiap sel grid berbentuk objek `traits` — BENTUK YANG SAMA PERSIS dengan
// genotype.traits yang sudah dipakai di seluruh codebase (mis.
// { warna_daun: ['A','a'] } untuk monohibrid, atau
// { warna_biji: ['A','a'], bentuk_biji: ['B','b'] } untuk dihibrid) — supaya
// ChildManager bisa langsung memakainya sebagai genotype anak tanpa konversi.
const PunnettCalculator = (() => {
  function build(traitsA, traitsB, traitIds) {
    const gametesA = GameteFactory.formGameteSlots(traitsA); // {alleles:{gen:'A',...}} — SELALU 2^N slot, tidak di-dedupe
    const gametesB = GameteFactory.formGameteSlots(traitsB);
    const labelOf = (combo) => traitIds.map((t) => combo.alleles[t]).join('');

    const grid = gametesA.map((gA) =>
      gametesB.map((gB) => {
        const cellTraits = {};
        traitIds.forEach((t) => {
          cellTraits[t] = MendelEngine.combineAlleles(gA.alleles[t], gB.alleles[t]);
        });
        return cellTraits;
      })
    );

    return {
      rowLabels: gametesA.map(labelOf),
      colLabels: gametesB.map(labelOf),
      grid,
      traitIds
    };
  }

  return { build };
})();

/* ==========================================================================
   5. STATE — GameState (single source of truth untuk PARENT saja;
      children dikelola terpisah oleh ChildManager karena bentuknya koleksi)
   ========================================================================== */
const GameState = (() => {
  // Data disimpan di AppState (lihat STATE MANAGEMENT) — modul ini murni
  // menyediakan API baca/tulis yang aman + event, bukan pemilik data.
  // REVISI (DIHIBRID): satu-satunya titik yang memilih traitIds mana yang
  // dipakai (dihybridTraits vs traits) — berdasarkan AppState.inheritanceType
  // yang SUDAH di-commit oleh MenuManager SEBELUM goToSimulator dipanggil.
  // Species.traits/starterGenotypes (Monohibrid) TIDAK disentuh sama sekali.
  function selectSpecies(speciesId) {
    const species = Species[speciesId];
    AppState.speciesId = speciesId;
    AppState.traitIds = AppState.inheritanceType === 'dihybrid' && species.dihybridTraits
      ? species.dihybridTraits.slice()
      : species.traits.slice(0, 1);
    AppState.parents.parent1 = null;
    AppState.parents.parent2 = null;
    EventBus.emit('species:selected', { speciesId });
  }

  // REVISI (DIHIBRID): starter genotype pool juga tergantung inheritanceType.
  function starterGenotypesFor(speciesId) {
    const species = Species[speciesId];
    return AppState.inheritanceType === 'dihybrid' && species.dihybridStarterGenotypes
      ? species.dihybridStarterGenotypes
      : species.starterGenotypes;
  }

  function setParent(slot, genotype) {
    AppState.parents[slot] = genotype;
    EventBus.emit('parent:changed', { slot, genotype, state: getState() });
  }

  function clearParent(slot) {
    AppState.parents[slot] = null;
    EventBus.emit('parent:changed', { slot, genotype: null, state: getState() });
  }

  function bothParentsFilled() {
    return Boolean(AppState.parents.parent1 && AppState.parents.parent2);
  }

  // Bentuk kembalian tetap FLAT ({speciesId, traitIds, parent1, parent2}) demi
  // kompatibilitas dengan puluhan titik pemanggilan (`state.parent1`, dst.)
  // yang sudah ada di seluruh codebase — walau penyimpanan internalnya
  // sekarang bersarang di AppState.parents. REVISI (DIHIBRID): `traitId`
  // (string) -> `traitIds` (array); `inheritanceType` ikut disertakan supaya
  // Undo/Redo & Autosave (SessionStorage) merestorenya juga — sebelumnya
  // TIDAK ikut tersimpan sama sekali (celah laten yang baru relevan begitu
  // ada >1 inheritanceType/renderPools bergantung padanya).
  function getState() {
    return {
      speciesId: AppState.speciesId,
      inheritanceType: AppState.inheritanceType,
      traitIds: AppState.traitIds ? AppState.traitIds.slice() : null,
      parent1: AppState.parents.parent1 ? JSON.parse(JSON.stringify(AppState.parents.parent1)) : null,
      parent2: AppState.parents.parent2 ? JSON.parse(JSON.stringify(AppState.parents.parent2)) : null
    };
  }

  // REVISI 14: dipakai oleh Undo/Redo & Autosave. Tidak memancarkan event —
  // pemanggil (UIController) bertanggung jawab melakukan re-render penuh
  // setelah restore, supaya listener lama tidak jalan dengan data transisi.
  function restoreState(snapshot) {
    AppState.speciesId = snapshot.speciesId;
    // REVISI (DIHIBRID): snapshot lama (dibuat sebelum revisi ini) tidak
    // punya field `inheritanceType` -> fallback ke 'monohybrid' (satu-
    // satunya mode yang ada saat snapshot lama itu dibuat), bukan undefined.
    AppState.inheritanceType = snapshot.inheritanceType || 'monohybrid';
    AppState.traitIds = snapshot.traitIds;
    AppState.parents.parent1 = snapshot.parent1;
    AppState.parents.parent2 = snapshot.parent2;
  }

  return { selectSpecies, starterGenotypesFor, setParent, clearParent, bothParentsFilled, getState, restoreState };
})();

/* ==========================================================================
   6. UI — komponen presentasi murni
   ========================================================================== */

// 6.1 OrganismIllustration
// 6.1 OrganismIllustration — REVISI (Placeholder Architecture): generalisasi
// dari FlowerIllustration lama (yang hardcode ke bunga) menjadi renderer
// GENERIK berbasis ASSET_CONFIG. Alur datanya TETAP sama seperti sebelumnya:
//   GENOTYPE -> Mendel Engine -> PHENOTYPE (label) -> ASSET_CONFIG -> PNG
// hanya sekarang di-index dulu lewat speciesId, supaya 1 fungsi ini melayani
// SEMUA organisme (existing maupun masa depan) tanpa modifikasi lebih lanjut.
const OrganismIllustration = (() => {
  function placeholderNode(emoji) {
    // AssetRenderer fallback (Bagian 4): asset belum tersedia -> placeholder
    // ringan berbasis CSS+emoji, BUKAN <img> yang gagal load (broken image).
    const span = document.createElement('span');
    span.className = 'organism-asset organism-asset--placeholder';
    span.setAttribute('aria-hidden', 'true');
    span.textContent = emoji || '🧬';
    return span;
  }

  // REVISI (Integrasi Asset Dihibrid): key lookup sekarang dibangun dari
  // `phenotype.labels` (ARRAY, lihat Renderer.illustrationPhenotype) alih-alih
  // `phenotype.label` tunggal. Untuk 1 trait (Monohibrid) -> array 1 elemen,
  // key = label itu sendiri, IDENTIK PERSIS dengan perilaku lama (zero
  // regression, "Merah" tetap "Merah"). Untuk >1 trait (Dihibrid) -> label
  // per-trait di-SORT alfabetis dulu baru digabung ("Besar"+"Merah" ATAU
  // "Merah"+"Besar", urutan drag/drop apa pun, keduanya SELALU menghasilkan
  // key yang sama: "Besar+Merah") -> deterministic, tidak bergantung urutan
  // traitIds/drag-drop (Aturan #4/#8). ASSET_CONFIG.organisms[x].variants
  // tinggal diisi dengan key kombinasi ini berdampingan dengan key 1-trait
  // yang sudah ada -- SATU dictionary yang sama, bukan sistem terpisah.
  function keyFor(labels) {
    return labels.length <= 1 ? (labels[0] || '') : labels.slice().sort().join('+');
  }

  function create(speciesId, phenotype) {
    const cfg = ASSET_CONFIG.organisms[speciesId];
    const labels = phenotype.labels || (phenotype.label ? [phenotype.label] : []);
    const variant = cfg && cfg.variants[keyFor(labels)];

    // Config organisme/trait belum lengkap -> placeholder generik, TIDAK
    // PERNAH crash dan TIDAK PERNAH broken image.
    if (!cfg || !variant) return placeholderNode('❔');

    if (cfg.status !== 'available') return placeholderNode(variant.emoji);

    const img = document.createElement('img');
    img.className = 'organism-asset';
    img.src = variant.src;
    // REVISI 14: gambar ini SELALU muncul berdampingan dengan teks yang
    // sudah menyebutkan fenotipenya (mis. "Daun Merah") di 4 titik pemakaian
    // (pool, slot parent, kartu anak, node tree) -> alt="" (decorative)
    // supaya screen reader tidak membaca info yang sama 2x.
    img.alt = '';
    img.loading = 'lazy';
    // Fallback runtime: walau status:'available', kalau file ternyata
    // hilang/typo, tetap jatuh ke placeholder alih-alih ikon broken image
    // bawaan browser (regression guard untuk TEST 11).
    img.onerror = () => { img.replaceWith(placeholderNode(variant.emoji)); };
    return img;
  }

  return { create };
})();

// 6.2 Renderer — pool, slot parent (species grid kini milik MenuManager, lihat bawah)
const Renderer = (() => {
  // Tetap generik per-1-gen (dipakai baik untuk Monohibrid maupun per-gen di
  // dalam Dihibrid). Pemanggil yang butuh gabungan multi-gen memakai
  // Utils.phenotypesFor/phenotypeLabel/genotypeCode di bawah.
  function getPhenotype(genotype, traitId) {
    const traitDef = Traits[traitId];
    return DominanceRule.resolvePhenotype(genotype.traits[traitId], traitDef, DominanceRule.dominantSymbolFor(traitDef));
  }

  // REVISI (Integrasi Asset Dihibrid): object yang dikirim ke
  // OrganismIllustration.create SEKARANG SELALU berbentuk { labels: [...] }
  // — array label fenotipe PER TRAIT (BUKAN label gabungan "Daun Merah,
  // Bunga Besar" yang dipakai untuk teks UI; ini genotype -> phenotype label
  // MENTAH per-gen, mis. ["Merah"] atau ["Merah","Besar"]), dalam urutan
  // traitIds. Untuk 1 trait (Monohibrid) -> array 1 elemen -> resolver
  // (OrganismIllustration.keyFor) memakai label itu apa adanya -> IDENTIK
  // dengan getPhenotype() sebelumnya, zero regression. Untuk >1 trait
  // (Dihibrid) -> resolver yang men-sort+gabung, bukan fungsi ini -- fungsi
  // ini TETAP murni "genotype -> daftar label fenotipe", tidak tahu-menahu
  // soal nama file asset (Aturan #9: genetic/phenotype layer tidak boleh
  // kenal nama file gambar).
  function illustrationPhenotype(genotype, traitIds) {
    return { labels: Utils.phenotypesFor(genotype.traits, traitIds).map((p) => p.label) };
  }

  // REVISI (DIHIBRID): `traitId` tunggal -> `traitIds` (array; panjang 1 =
  // perilaku IDENTIK dengan sebelumnya — label/kode/tooltip sama persis).
  function renderGenotypeItem(genotype, traitIds, draggableSlot) {
    const phenotypeLabel = Utils.phenotypeLabel(genotype.traits, traitIds);
    const genoCode = Utils.genotypeCode(genotype.traits, traitIds);
    const flatAlleles = traitIds.flatMap((t) => genotype.traits[t]);
    const li = Utils.createEl('li', {
      class: 'genotype-item',
      draggable: 'true',
      tabindex: '0',
      role: 'button',
      'aria-pressed': 'false',
      'aria-label': `${phenotypeLabel}, genotipe ${genoCode}. Tekan Enter untuk memilih.`,
      dataset: { genotypeId: genotype.id, parentSlot: draggableSlot },
      onDragstart: (e) => EventBus.emit('dnd:dragstart', { event: e, genotype, el: li }),
      onDragend: () => EventBus.emit('dnd:dragend', { el: li }),
      onClick: () => EventBus.emit('kbd:toggleSelect', { el: li, genotype, sourceSlot: null }),
      onKeydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          EventBus.emit('kbd:toggleSelect', { el: li, genotype, sourceSlot: null });
        }
      }
    });
    const iconWrap = Utils.createEl('span', { class: 'genotype-item__icon' });
    iconWrap.appendChild(OrganismIllustration.create(AppState.speciesId, illustrationPhenotype(genotype, traitIds)));

    const info = Utils.createEl('span', { class: 'genotype-item__info' }, [
      Utils.createEl('span', { class: 'genotype-item__label', html: phenotypeLabel }),
      Utils.createEl('span', {
        class: 'genotype-item__code',
        html: genoCode,
        'data-tooltip': Utils.zygosityLabel(flatAlleles)
      })
    ]);

    li.appendChild(iconWrap);
    li.appendChild(info);
    return li;
  }

  function renderPools(species) {
    const traitIds = AppState.traitIds;
    const starters = GameState.starterGenotypesFor(species.id);
    ['pool-parent1', 'pool-parent2'].forEach((poolId, idx) => {
      const pool = Utils.qs(`#${poolId}`);
      pool.innerHTML = '';
      starters.forEach((genotype) => {
        pool.appendChild(renderGenotypeItem(genotype, traitIds, `parent${idx + 1}`));
      });
    });
  }

  // REVISI (Parent Card Compact — Task 2): untuk 1 trait (Monohibrid),
  // struktur & class SAMA PERSIS seperti sebelumnya — zero regression.
  // Untuk >1 trait (Dihibrid dst.), genotipe ditampilkan PROMINENT lebih
  // dulu, lalu breakdown per-trait dalam grid horizontal ringkas (bukan
  // ditumpuk vertical) — TETAP SATU shared function, dibedakan lewat
  // modifier class `--multi` yang generik (berdasarkan traitIds.length,
  // bukan hardcode "dihybrid"), BUKAN component/DOM kedua yang terpisah.
  function renderParentSlot(slotKey, genotype, traitIds) {
    const container = Utils.qs(`#content-${slotKey}`);
    const removeBtn = Utils.qs(`#btn-remove-${slotKey}`);
    container.innerHTML = '';
    container.classList.remove('drop-slot__content--wide');

    if (!genotype) {
      container.classList.remove('is-filled');
      removeBtn.hidden = true;
      container.appendChild(Utils.createEl('span', { class: 'drop-slot__placeholder', html: 'Seret genotipe ke sini' }));
      return;
    }

    container.classList.add('is-filled');
    removeBtn.hidden = false;
    const isMulti = traitIds.length > 1;
    const phenotypeLabel = Utils.phenotypeLabel(genotype.traits, traitIds);
    const genoCode = Utils.genotypeCode(genotype.traits, traitIds);
    const flatAlleles = traitIds.flatMap((t) => genotype.traits[t]);
    if (isMulti) container.classList.add('drop-slot__content--wide');

    const wrap = Utils.createEl('div', {
      class: `slot-genotype${isMulti ? ' slot-genotype--multi' : ''}`,
      draggable: 'true',
      tabindex: '0',
      role: 'button',
      'aria-pressed': 'false',
      'aria-label': `${phenotypeLabel}, genotipe ${genoCode} di slot ${slotKey}. Tekan Enter untuk memilih dan memindahkannya.`,
      dataset: { genotypeId: genotype.id, sourceSlot: slotKey },
      onDragstart: (e) => EventBus.emit('dnd:dragstart', { event: e, genotype, sourceSlot: slotKey, el: wrap }),
      onDragend: () => EventBus.emit('dnd:dragend', { el: wrap }),
      onClick: (e) => {
        e.stopPropagation();
        EventBus.emit('kbd:toggleSelect', { el: wrap, genotype, sourceSlot: slotKey });
      },
      onKeydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          EventBus.emit('kbd:toggleSelect', { el: wrap, genotype, sourceSlot: slotKey });
        }
      }
    });
    const iconWrap = Utils.createEl('span', { class: 'slot-genotype__icon' });
    iconWrap.appendChild(OrganismIllustration.create(AppState.speciesId, illustrationPhenotype(genotype, traitIds)));
    wrap.appendChild(iconWrap);

    if (isMulti) {
      // Genotipe gabungan PROMINENT dulu (mis. "AaBb"), baru breakdown
      // per-trait dalam grid 2 kolom ringkas — bukan label panjang 1 baris
      // yang bisa wrap jadi berbaris-baris (itu akar penyebab card
      // Dihibrid jadi terlalu tinggi sebelumnya).
      wrap.appendChild(Utils.createEl('span', {
        class: 'slot-genotype__genotype',
        html: genoCode,
        'data-tooltip': Utils.zygosityLabel(flatAlleles)
      }));
      const phenotypes = Utils.phenotypesFor(genotype.traits, traitIds);
      const traitsGrid = Utils.createEl('span', { class: 'slot-genotype__traits' });
      traitIds.forEach((t, i) => {
        traitsGrid.appendChild(Utils.createEl('span', { class: 'slot-genotype__trait' }, [
          Utils.createEl('span', { class: 'slot-genotype__trait-name', html: Traits[t].noun }),
          Utils.createEl('span', { class: 'slot-genotype__trait-value', html: phenotypes[i].label })
        ]));
      });
      wrap.appendChild(traitsGrid);
    } else {
      wrap.appendChild(Utils.createEl('span', { class: 'slot-genotype__label', html: phenotypeLabel }));
      wrap.appendChild(Utils.createEl('span', {
        class: 'slot-genotype__code',
        html: genoCode,
        'data-tooltip': Utils.zygosityLabel(flatAlleles)
      }));
    }

    container.appendChild(wrap);
  }

  function updateCrossButton(enabled) {
    Utils.qs('#btn-cross').disabled = !enabled;
    const hint = Utils.qs('#cross-hint');
    if (!hint) return;
    if (enabled) {
      hint.textContent = 'Siap disilangkan!';
    } else if (!GameState.bothParentsFilled()) {
      hint.textContent = 'Isi kedua induk terlebih dahulu';
    } else if (AppState.currentMode === 'challenge') {
      hint.textContent = '🔒 Kunci jawaban prediksimu dulu (lihat panel Tantangan)';
    } else {
      hint.textContent = 'Selesaikan langkah "Pelajari Genotipe/Gamet" di panel edukasi dulu (Mode Belajar)';
    }
  }

  // REVISI (DIHIBRID): `traitId` tunggal -> `traitIds` (array). Untuk 2 trait,
  // judul menggabungkan nama kedua trait ("Kacang Polong — Warna Biji ×
  // Bentuk Biji").
  function setSimulatorTitle(species, traitIds) {
    const traitNames = traitIds.map((t) => Traits[t].name).join(' × ');
    Utils.qs('#simulator-species-title').textContent = `${species.name} — ${traitNames}`;
  }

  function showScreen(screenName) {
    Utils.qsa('.screen').forEach((el) => {
      el.hidden = el.dataset.screen !== screenName;
    });
  }

  return {
    renderPools,
    renderParentSlot,
    updateCrossButton,
    setSimulatorTitle,
    showScreen,
    getPhenotype,
    illustrationPhenotype
  };
})();

// 6.3 PunnettRenderer — tabel Punnett dengan cell yang bisa disinkronkan (hover) ke kartu anak
const PunnettRenderer = (() => {
  // REVISI (DIHIBRID — Aturan #11): digeneralisasi dari pasangan 1 gen
  // (`pair` 2 elemen) ke alel gabungan LINTAS GEN (`flatAlleles`, kelipatan 2:
  // setiap 2 elemen berurutan = satu gen). TIDAK ADA kelas CSS baru — 3 kelas
  // existing (punnett-cell--AA/Aa/aa) tetap dipakai, sekarang mewakili
  // "semua gen homozigot dominan / campuran / semua gen homozigot resesif".
  // Untuk 1 gen (Monohibrid), hasilnya PERSIS seperti sebelumnya.
  function cellClass(flatAlleles) {
    const chunks = [];
    for (let i = 0; i < flatAlleles.length; i += 2) chunks.push([flatAlleles[i], flatAlleles[i + 1]]);
    const kinds = chunks.map(([a, b]) => {
      if (a !== b) return 'het';
      return a === a.toUpperCase() ? 'dom' : 'res';
    });
    if (kinds.every((k) => k === 'dom')) return 'punnett-cell--AA';
    if (kinds.every((k) => k === 'res')) return 'punnett-cell--aa';
    return 'punnett-cell--Aa';
  }

  // REVISI (DIHIBRID): `punnettResult` sekarang perlu `traitIds` untuk
  // menerjemahkan tiap sel (objek `traits`) menjadi kode genotipe gabungan.
  function render(punnettResult, traitIds) {
    const { rowLabels, colLabels, grid } = punnettResult;
    const ids = traitIds || punnettResult.traitIds;
    const tbody = Utils.qs('#punnett-table-body');
    tbody.innerHTML = '';

    const headerRow = Utils.createEl('tr');
    headerRow.appendChild(Utils.createEl('th', { html: '' }));
    colLabels.forEach((label) => headerRow.appendChild(Utils.createEl('th', { html: label })));
    tbody.appendChild(headerRow);

    let cellIndex = 0;
    grid.forEach((row, r) => {
      const tr = Utils.createEl('tr');
      tr.appendChild(Utils.createEl('th', { html: rowLabels[r] }));
      row.forEach((cellTraits) => {
        const idx = cellIndex++;
        const genoCode = Utils.genotypeCode(cellTraits, ids);
        const flatAlleles = ids.flatMap((t) => cellTraits[t]);
        const td = Utils.createEl('td', {
          class: cellClass(flatAlleles),
          html: genoCode,
          tabindex: '0',
          dataset: { cellIndex: String(idx) },
          'aria-label': `Kombinasi gamet menghasilkan genotipe ${genoCode}`,
          'data-tooltip': Utils.zygosityLabel(flatAlleles),
          onMouseenter: () => EventBus.emit('highlight:on', idx),
          onMouseleave: () => EventBus.emit('highlight:off'),
          onFocus: () => EventBus.emit('highlight:on', idx),
          onBlur: () => EventBus.emit('highlight:off')
        });
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    Utils.qs('#punnett-wrapper').hidden = false;
    Utils.qs('#connector-to-punnett').hidden = false;
  }

  function reset() {
    Utils.qs('#punnett-table-body').innerHTML = '';
    Utils.qs('#punnett-wrapper').hidden = true;
    Utils.qs('#connector-to-punnett').hidden = true;
  }

  return { render, reset };
})();

// 6.4 EducationPanel — 8 langkah penjelasan
const EducationPanel = (() => {
  function setStepActive(stepKey, active) {
    const el = Utils.qs(`.education-step[data-step="${stepKey}"]`);
    if (el) el.dataset.active = String(active);
  }

  function reset() {
    Utils.qsa('.education-step').forEach((el) => (el.dataset.active = 'false'));
    Utils.qs('#edu-parent-text').textContent = 'Belum ada induk yang dipilih.';
    ['gamete', 'meeting', 'zygote', 'genotype', 'phenotype', 'ratio-genotype', 'ratio-phenotype'].forEach((k) => {
      Utils.qs(`#edu-${k}-text`).textContent = '—';
    });
  }

  // REVISI (DIHIBRID): `traitId` -> `traitIds`.
  function explainParents(state, traitIds) {
    setStepActive('parent', true);
    const parts = [];
    if (state.parent1) {
      parts.push(`Induk 1 bergenotipe ${Utils.genotypeCode(state.parent1.traits, traitIds)} (${Utils.phenotypeLabel(state.parent1.traits, traitIds)})`);
    }
    if (state.parent2) {
      parts.push(`Induk 2 bergenotipe ${Utils.genotypeCode(state.parent2.traits, traitIds)} (${Utils.phenotypeLabel(state.parent2.traits, traitIds)})`);
    }
    Utils.qs('#edu-parent-text').textContent = parts.length ? parts.join('. ') + '.' : 'Belum ada induk yang dipilih.';
  }

  // REVISI (DIHIBRID): `traitId` -> `traitIds`. Gamet sekarang digabung lintas
  // gen (mis. "AB, Ab, aB, ab") lewat GameteFactory (via punnettResult.rowLabels/
  // colLabels yang SUDAH dihitung PunnettCalculator.build — tidak dihitung
  // ulang di sini supaya tetap satu sumber kebenaran).
  function explainCrossResult({ parent1, parent2, traitIds, punnettResult, genotypeRatio, phenotypeRatio }) {
    const gametes1 = [...new Set(punnettResult.rowLabels)];
    const gametes2 = [...new Set(punnettResult.colLabels)];

    setStepActive('gamete', true);
    Utils.qs('#edu-gamete-text').textContent =
      `Induk 1 membentuk gamet: ${gametes1.join(', ')}. Induk 2 membentuk gamet: ${gametes2.join(', ')}.`;

    setStepActive('meeting', true);
    Utils.qs('#edu-meeting-text').textContent =
      'Setiap gamet dari Induk 1 bertemu dengan setiap gamet dari Induk 2 — inilah yang digambarkan papan Punnett.';

    setStepActive('zygote', true);
    const totalCells = punnettResult.grid.flat().length;
    Utils.qs('#edu-zygote-text').textContent =
      `Total ada ${totalCells} kombinasi pembuahan yang mungkin, masing-masing membentuk satu zigot.`;

    setStepActive('genotype', true);
    const genoList = punnettResult.grid.flat().map((cell) => Utils.genotypeCode(cell, traitIds)).join(', ');
    Utils.qs('#edu-genotype-text').textContent = `Genotipe yang terbentuk: ${genoList}.`;

    setStepActive('phenotype', true);
    const phenotypeSentences = traitIds.map((t) => {
      const traitDef = Traits[t];
      const dominantSymbol = DominanceRule.dominantSymbolFor(traitDef);
      const recessiveSymbol = Object.keys(traitDef.alleles).find((s) => s !== dominantSymbol);
      const dominantLabel = traitDef.alleles[dominantSymbol].label;
      const recessiveLabel = traitDef.alleles[recessiveSymbol].label;
      return `Karena alel ${dominantSymbol} bersifat dominan terhadap ${recessiveSymbol}, genotipe ${traitDef.noun.toLowerCase()} diterjemahkan menjadi fenotipe ${traitDef.noun} ${dominantLabel} atau ${traitDef.noun} ${recessiveLabel}.`;
    });
    Utils.qs('#edu-phenotype-text').textContent = phenotypeSentences.join(' ');

    setStepActive('ratio-genotype', true);
    const genoRatioText = genotypeRatio.map((r) => `${r.label} : ${r.count} (${r.percent}%)`).join(', ');
    Utils.qs('#edu-ratio-genotype-text').textContent = genoRatioText;

    setStepActive('ratio-phenotype', true);
    const phenoRatioText = phenotypeRatio.map((r) => `${r.label} : ${r.count} (${r.percent}%)`).join(', ');
    Utils.qs('#edu-ratio-phenotype-text').textContent = phenoRatioText;
  }

  return { reset, explainParents, explainCrossResult };
})();

/* ==========================================================================
   7. HIGHLIGHT SYNC — sinkronisasi hover Punnett cell <-> kartu anak
   ========================================================================== */
const HighlightSync = (() => {
  function init() {
    EventBus.on('highlight:on', (cellIndex) => {
      Utils.qsa(`[data-cell-index="${cellIndex}"]`).forEach((el) => el.classList.add('is-highlighted'));
    });
    EventBus.on('highlight:off', () => {
      Utils.qsa('.is-highlighted').forEach((el) => el.classList.remove('is-highlighted'));
    });
  }
  return { init };
})();

/* ==========================================================================
   8. CONFIRM DIALOG — konfirmasi "Ganti Parent" / "Batal"
   ========================================================================== */
const ConfirmDialog = (() => {
  let pendingConfirmCallback = null;
  let lastFocusedEl = null;

  // REVISI 2 (Button Label Audit): dialog ini di-reuse untuk BANYAK konteks
  // berbeda (ganti parent, reset, kembali ke menu, akhiri sesi challenge) —
  // sebelumnya tombol konfirmasi SELALU berlabel "Ganti Parent" apa pun
  // konteksnya, membingungkan user saat konteksnya bukan penggantian parent.
  // Sekarang setiap pemanggil WAJIB memberi confirmLabel sesuai action
  // sebenarnya yang akan dijalankan.
  function show(message, onConfirm, confirmLabel = 'Lanjutkan') {
    const modal = Utils.qs('#confirm-modal');
    Utils.qs('#confirm-modal-title').textContent = message;
    Utils.qs('#confirm-modal-yes').textContent = confirmLabel;
    pendingConfirmCallback = onConfirm;
    lastFocusedEl = document.activeElement;
    modal.hidden = false;
    Utils.qs('#confirm-modal-yes').focus();
  }

  function hide() {
    const modal = Utils.qs('#confirm-modal');
    modal.hidden = true;
    pendingConfirmCallback = null;
    if (lastFocusedEl && typeof lastFocusedEl.focus === 'function') lastFocusedEl.focus();
  }

  function init() {
    Utils.qs('#confirm-modal-yes').addEventListener('click', () => {
      const cb = pendingConfirmCallback;
      hide();
      if (cb) cb();
    });
    Utils.qs('#confirm-modal-cancel').addEventListener('click', hide);
    Utils.qs('#confirm-modal').addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hide();
    });
  }

  return { init, show, hide };
})();

/* ==========================================================================
   9b. RIPPLE — micro-interaction reusable untuk .btn & .option-card (Revisi 6)
   ========================================================================== */
const Ripple = (() => {
  function init() {
    document.addEventListener('click', (e) => {
      const target = e.target.closest('.btn, .option-card');
      if (!target || target.disabled) return;

      const rect = target.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const ripple = Utils.createEl('span', { class: 'ripple' });
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${e.clientY - rect.top - size / 2}px`;

      target.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());
    });
  }
  return { init };
})();

/* ==========================================================================
   9c. ANIMATION — helper class toggling untuk efek CSS
   ========================================================================== */
const Animation = (() => {
  function snap(el) {
    if (!el) return;
    el.classList.add('is-snapping');
    setTimeout(() => el.classList.remove('is-snapping'), 260);
  }

  function shake(el) {
    if (!el) return;
    el.classList.add('is-shaking');
    setTimeout(() => el.classList.remove('is-shaking'), 400);
  }

  function fadeOutThenRun(el, callback) {
    if (!el) {
      callback();
      return;
    }
    el.classList.add('is-removing');
    setTimeout(callback, 260);
  }

  return { snap, shake, fadeOutThenRun };
})();

/* ==========================================================================
   10. PARENT MANAGER — orkestrasi parent: set/remove + validasi + animasi
   ========================================================================== */
const ParentManager = (() => {
  function announce(text) {
    const el = Utils.qs('#sr-announcer');
    if (el) el.textContent = text;
  }

  function slotLabel(slotKey) {
    return slotKey === 'parent1' ? 'Induk 1' : 'Induk 2';
  }

  // REVISI 10: jika slot sudah terisi dan didrop/ditaruh genotipe lain -> minta konfirmasi
  function placeGenotype(slotKey, genotype) {
    // REVISI 15: satu titik pemeriksaan ini otomatis melindungi SEMUA jalur
    // penempatan (drag-drop, klik/keyboard, selection toolbar, challenge mode)
    // tanpa perlu menambahkan pengecekan di masing-masing jalur tersebut.
    if (LearningManager.isSlotLocked(slotKey)) {
      Animation.shake(Utils.qs(`#content-${slotKey}`));
      announce('Selesaikan Induk 1 terlebih dahulu (Mode Belajar).');
      return;
    }

    // REVISI KRITIS — "No Free Exploration" (MODE_CONFIG.challenge.freeExploration
    // = false): selama Challenge aktif ATAU sedang di Level Selection, parent
    // HANYA boleh berisi genotipe yang memang menjadi bagian dari objective
    // saat ini (atau terkunci total kalau belum ada soal). Ini SATU-SATUNYA
    // titik pemeriksaan (ParentManager) yang dilewati baik drag-drop, klik,
    // maupun Selection Toolbar — jadi tidak ada jalur yang bisa "menyelinap"
    // mengganti parent secara bebas. REVISI (Fix "Akhiri Sesi" -> Sandbox):
    // SEBELUMNYA memakai ChallengeManager.isActive() saja, sehingga begitu
    // sesi berakhir (Akhiri Sesi), gerbang ini otomatis terbuka dan parent
    // bisa diisi bebas seperti Free/Sandbox. Sekarang memakai
    // isInChallengeContext() supaya TETAP terkunci selama masih berada di
    // alur Challenge (termasuk Level Selection).
    if (!MODE_CONFIG[AppState.currentMode].freeExploration && ChallengeManager.isInChallengeContext()) {
      if (!ChallengeManager.isGenotypeAllowedForSlot(slotKey, genotype)) {
        Animation.shake(Utils.qs(`#content-${slotKey}`));
        announce('Selesaikan tantangan yang sedang berjalan terlebih dahulu — induk sudah dikunci sesuai objective.');
        return;
      }
    }

    const state = GameState.getState();
    const currentlyFilled = state[slotKey];
    const isFromChild = genotype.id.startsWith('child-');

    const doPlace = () => {
      UndoRedoManager.pushSnapshot();
      GameState.setParent(slotKey, genotype);
      const slotContent = Utils.qs(`#content-${slotKey}`);
      requestAnimationFrame(() => Animation.snap(slotContent));
      const genoStr = Utils.genotypeCode(genotype.traits, state.traitIds);
      announce(`${slotLabel(slotKey)} diisi genotipe ${genoStr}.`);
      EventBus.emit('state:mutated', {
        activity: isFromChild
          ? `Anak ${genoStr} dipilih menjadi ${slotLabel(slotKey)}.`
          : `${slotLabel(slotKey)} diisi genotipe ${genoStr}.`
      });
    };

    if (currentlyFilled) {
      ConfirmDialog.show(`${slotLabel(slotKey)} sudah terisi. Ganti dengan genotipe baru?`, doPlace, 'Ganti Parent');
    } else {
      doPlace();
    }
  }

  // BUG FIX: dipakai oleh ChallengeManager.presentQuestion() (Level Selection
  // -> selectLevel()), yang mengisi parent1 DAN parent2 secara programatik dalam 2 pemanggilan berturut-turut. Kalau lewat
  // placeGenotype() biasa dan kedua slot sudah terisi (mis. sisa sesi bebas
  // sebelumnya), 2 panggilan ConfirmDialog.show() beruntun akan saling
  // menimpa (dialog cuma satu instance) — konfirmasi untuk parent1 hilang
  // sebelum sempat diklik. Assignment dari Challenge memang dimaksudkan untuk
  // langsung menimpa apa pun yang ada di slot, jadi konfirmasi tidak relevan.
  function placeGenotypeSilent(slotKey, genotype) {
    if (LearningManager.isSlotLocked(slotKey)) return;
    const state = GameState.getState();
    UndoRedoManager.pushSnapshot();
    GameState.setParent(slotKey, genotype);
    const slotContent = Utils.qs(`#content-${slotKey}`);
    requestAnimationFrame(() => Animation.snap(slotContent));
    const genoStr = Utils.genotypeCode(genotype.traits, state.traitIds);
    announce(`${slotLabel(slotKey)} diisi genotipe ${genoStr}.`);
    EventBus.emit('state:mutated', { activity: `${slotLabel(slotKey)} diisi genotipe ${genoStr} (Tantangan).` });
  }

  function rejectInvalidDrop(slotKey) {
    const slotContent = Utils.qs(`#content-${slotKey}`);
    Animation.shake(slotContent);
  }

  function removeParent(slotKey) {
    // REVISI KRITIS: sama seperti placeGenotype — selama masih dalam
    // konteks Challenge (aktif ATAU Level Selection), parent TERKUNCI (tidak
    // bisa dihapus begitu saja). Satu-satunya cara keluar adalah
    // "Akhiri Sesi" yang eksplisit+konfirmasi.
    if (!MODE_CONFIG[AppState.currentMode].freeExploration && ChallengeManager.isInChallengeContext()) {
      Animation.shake(Utils.qs(`#content-${slotKey}`));
      announce('Induk terkunci selama tantangan berlangsung. Gunakan "Akhiri Sesi" untuk keluar.');
      return;
    }
    const slotContent = Utils.qs(`#content-${slotKey}`);
    Animation.fadeOutThenRun(slotContent.querySelector('.slot-genotype'), () => {
      UndoRedoManager.pushSnapshot();
      GameState.clearParent(slotKey);
      announce(`${slotLabel(slotKey)} dikosongkan.`);
      EventBus.emit('state:mutated', { activity: `${slotLabel(slotKey)} dikosongkan.` });
    });
  }

  return { placeGenotype, placeGenotypeSilent, rejectInvalidDrop, removeParent };
})();

/* ==========================================================================
   11. CHILD MANAGER — hasil persilangan sebagai koleksi kartu anak
   ========================================================================== */
const ChildManager = (() => {
  // Data disimpan di AppState.children / AppState.punnettSquare (lihat STATE
  // MANAGEMENT) — modul ini murni logic generate/render, bukan pemilik data.

  // FITUR 34: ID unik per anak menyertakan label generasi (mis. "child_F1_001"),
  // bukan string acak — supaya bisa dilacak balik ke generasi asalnya untuk
  // Generation Tree, riwayat, seleksi, drag, dan Undo/Redo.
  // FITUR 34: ID unik per anak menyertakan label generasi (mis. "child_F1_001"),
  // bukan string acak — supaya bisa dilacak balik ke generasi asalnya untuk
  // Generation Tree, riwayat, seleksi, drag, dan Undo/Redo.
  // REVISI (DIHIBRID): `traitId` -> `traitIds`. `PunnettCalculator.build`
  // sekarang mengembalikan sel grid yang SUDAH berbentuk objek `traits`
  // (mis. {warna_biji:['A','a'], bentuk_biji:['B','b']}) — bentuk yang SAMA
  // PERSIS dengan genotype.traits di seluruh codebase — jadi tinggal dipakai
  // langsung sebagai genotipe anak, tanpa konversi.
  function generate(parent1, parent2, traitIds, generationLabel) {
    const punnettResult = PunnettCalculator.build(parent1.traits, parent2.traits, traitIds);
    let cellIndex = 0;
    const children = punnettResult.grid.flat().map((cellTraits) => ({
      id: `child_${generationLabel}_${String(cellIndex + 1).padStart(3, '0')}`,
      traits: cellTraits,
      cellIndex: cellIndex++
    }));
    AppState.children = children;
    AppState.punnettSquare = punnettResult;
    return { children, punnettResult };
  }

  // REVISI (DIHIBRID): `traitId` -> `traitIds`. Genotipe dihitung via
  // Utils.genotypeCode (gabungan lintas gen), fenotipe via Utils.phenotypeLabel
  // (label gabungan, mis. "Biji Kuning, Biji Bulat").
  function computeRatios(traitIds) {
    const genotypeCounts = new Map();
    const phenotypeCounts = new Map();

    AppState.children.forEach((child) => {
      const genoStr = Utils.genotypeCode(child.traits, traitIds);
      genotypeCounts.set(genoStr, (genotypeCounts.get(genoStr) || 0) + 1);

      const phenoLabel = Utils.phenotypeLabel(child.traits, traitIds);
      phenotypeCounts.set(phenoLabel, (phenotypeCounts.get(phenoLabel) || 0) + 1);
    });

    const total = AppState.children.length;
    const toRatioArray = (map) =>
      Array.from(map.entries()).map(([label, count]) => ({
        label,
        count,
        percent: Math.round((count / total) * 100)
      }));

    return {
      genotypeRatio: toRatioArray(genotypeCounts),
      phenotypeRatio: toRatioArray(phenotypeCounts)
    };
  }

  function renderCard(child, traitIds) {
    const phenotypeLabel = Utils.phenotypeLabel(child.traits, traitIds);
    const genoCode = Utils.genotypeCode(child.traits, traitIds);
    const flatAlleles = traitIds.flatMap((t) => child.traits[t]);
    const card = Utils.createEl('div', {
      class: 'child-card',
      role: 'listitem',
      draggable: 'true',
      tabindex: '0',
      dataset: { cellIndex: String(child.cellIndex), genotypeId: child.id },
      'aria-label': `Anak genotipe ${genoCode}, ${phenotypeLabel}. Tekan Enter untuk memilih dan menjadikan induk generasi berikutnya.`,
      onDragstart: (e) => EventBus.emit('dnd:dragstart', { event: e, genotype: child, el: card }),
      onDragend: () => EventBus.emit('dnd:dragend', { el: card }),
      onMouseenter: () => EventBus.emit('highlight:on', child.cellIndex),
      onMouseleave: () => EventBus.emit('highlight:off'),
      onFocus: () => EventBus.emit('highlight:on', child.cellIndex),
      onBlur: () => EventBus.emit('highlight:off'),
      onClick: () => EventBus.emit('kbd:toggleSelect', { el: card, genotype: child, sourceSlot: null }),
      onKeydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          EventBus.emit('kbd:toggleSelect', { el: card, genotype: child, sourceSlot: null });
        }
      }
    });

    const iconWrap = Utils.createEl('span', { class: 'child-card__icon' });
    iconWrap.appendChild(OrganismIllustration.create(AppState.speciesId, Renderer.illustrationPhenotype(child, traitIds)));

    card.appendChild(iconWrap);
    card.appendChild(Utils.createEl('span', { class: 'child-card__label', html: phenotypeLabel }));
    card.appendChild(Utils.createEl('span', {
      class: 'child-card__code',
      html: genoCode,
      'data-tooltip': Utils.zygosityLabel(flatAlleles)
    }));

    return card;
  }

  function renderRatioList(listId, ratioArray) {
    const list = Utils.qs(`#${listId}`);
    list.innerHTML = '';
    ratioArray.forEach((r) => {
      // REVISI (Ratio Column Alignment): dipecah jadi 3 <span> kolom
      // (label/count/percent) supaya bisa di-styling sebagai kolom yang
      // konsisten lewat CSS Grid (lihat .ratio-row di style.css) --
      // r.label, r.count, r.percent adalah NILAI YANG SAMA PERSIS dari
      // computeRatios(), tidak ada satu pun angka/kalkulasi yang berubah,
      // hanya cara membungkusnya jadi markup yang berubah.
      list.appendChild(
        Utils.createEl('li', {
          class: 'ratio-row',
          html: `<span class="ratio-row__label">${r.label}</span><span class="ratio-row__count">${r.count}</span><span class="ratio-row__percent">${r.percent}%</span>`,
        })
      );
    });
  }

  function renderAll(traitIds) {
    const grid = Utils.qs('#children-grid');
    grid.innerHTML = '';
    AppState.children.forEach((child) => grid.appendChild(renderCard(child, traitIds)));

    const { genotypeRatio, phenotypeRatio } = computeRatios(traitIds);
    AppState.genotypeRatio = genotypeRatio;
    AppState.phenotypeRatio = phenotypeRatio;
    renderRatioList('ratio-genotype-list', genotypeRatio);
    renderRatioList('ratio-phenotype-list', phenotypeRatio);

    // REVISI: Step 2 (Hasil Anak, di dalam crossing-box) dan Step 4 (Rasio,
    // box terpisah) sekarang 2 elemen DOM berbeda, tapi TETAP disinkronkan
    // dari satu titik kontrol yang sama seperti sebelumnya — memenuhi
    // REVISI 8 (jangan rusak fix "parent:changed tidak boleh hapus hasil").
    Utils.qs('#children-section').hidden = false;
    Utils.qs('#results-section').hidden = false;
    Utils.qs('#connector-to-results').hidden = false;
    return { genotypeRatio, phenotypeRatio };
  }

  function reset() {
    AppState.children = [];
    AppState.punnettSquare = null;
    AppState.genotypeRatio = [];
    AppState.phenotypeRatio = [];
    Utils.qs('#children-grid').innerHTML = '';
    Utils.qs('#ratio-genotype-list').innerHTML = '';
    Utils.qs('#ratio-phenotype-list').innerHTML = '';
    Utils.qs('#children-section').hidden = true;
    Utils.qs('#results-section').hidden = true;
    Utils.qs('#connector-to-results').hidden = true;
  }

  // REVISI (Challenge Mode — Anti Answer Leak): "hide" NON-DESTRUKTIF — beda
  // dari reset() di atas, fungsi ini HANYA membersihkan tampilan (DOM), TIDAK
  // menyentuh AppState.children/punnettSquare/genotypeRatio/phenotypeRatio.
  // Dipakai ChallengeManager untuk menyembunyikan hasil attempt yang salah
  // SECARA DEFAULT, sambil tetap menyimpan data supaya bisa di-render ulang
  // kalau user memilih "👁 Tampilkan Hasil" (educational feedback opt-in,
  // BUKAN koreksi jawaban — lihat gradeIfActive). Data hanya benar-benar
  // dibuang saat retry sungguhan terjadi (lewat reset() di presentQuestion()).
  function hideView() {
    Utils.qs('#children-grid').innerHTML = '';
    Utils.qs('#ratio-genotype-list').innerHTML = '';
    Utils.qs('#ratio-phenotype-list').innerHTML = '';
    Utils.qs('#children-section').hidden = true;
    Utils.qs('#results-section').hidden = true;
    Utils.qs('#connector-to-results').hidden = true;
  }

  function getPunnettResult() {
    return AppState.punnettSquare;
  }

  // REVISI 14: snapshot/restore generik, dipakai Undo/Redo, Autosave, dan Timeline
  function getSnapshot() {
    return {
      children: JSON.parse(JSON.stringify(AppState.children)),
      punnettResult: AppState.punnettSquare ? JSON.parse(JSON.stringify(AppState.punnettSquare)) : null
    };
  }

  function restoreState(snapshot) {
    AppState.children = snapshot && snapshot.children ? JSON.parse(JSON.stringify(snapshot.children)) : [];
    AppState.punnettSquare = snapshot && snapshot.punnettResult ? JSON.parse(JSON.stringify(snapshot.punnettResult)) : null;
  }

  return { generate, renderAll, reset, hideView, getPunnettResult, getSnapshot, restoreState };
})();

/* ==========================================================================
   12. HISTORY MANAGER — riwayat persilangan antar generasi.
   Menyimpan SNAPSHOT PENUH tiap generasi (bukan cuma teks ringkasan) supaya
   satu sumber data ini bisa dipakai ulang oleh 3 fitur sekaligus:
   panel "Riwayat Persilangan" (teks), Generation Timeline (visual/interaktif),
   dan Undo/Redo & Autosave (lewat getSnapshot/restoreState).
   ========================================================================== */
const HistoryManager = (() => {
  // Data disimpan di AppState.generationHistory — modul ini murni logic
  // tambah-record + render, bukan pemilik data.

  function summarizeGenotypeRatio(genotypeRatio) {
    if (genotypeRatio.length === 1) return `Semua ${genotypeRatio[0].label}`;
    return genotypeRatio.map((r) => r.label).join(' ');
  }

  // REVISI 3 (Generation Tree): skema ID "child_F1_003" (FITUR 34) SUDAH
  // menyimpan generasi asalnya di dalam ID itu sendiri — jadi lineage bisa
  // di-derive langsung tanpa perlu mekanisme tagging terpisah. Genotype dari
  // sidebar pool (id "AA"/"Aa"/"aa") tidak match pola ini -> null (root/P).
  function sourceGenerationOf(genotype) {
    if (!genotype || !genotype.id) return null;
    const match = /^child_(F\d+)_/.exec(genotype.id);
    return match ? match[1] : null;
  }

  // generationLabel diterima sebagai parameter (bukan dihitung dari
  // records.length di sini) supaya PERSIS sama dengan label yang sudah
  // dipakai ChildManager.generate() untuk skema ID "child_F1_001".
  // generationLabel diterima sebagai parameter (bukan dihitung dari
  // records.length di sini) supaya PERSIS sama dengan label yang sudah
  // dipakai ChildManager.generate() untuk skema ID "child_F1_001".
  // REVISI (DIHIBRID): `traitId` -> `traitIds`.
  function addRecord({ generationLabel, parent1, parent2, traitIds, punnettResult, children, genotypeRatio, phenotypeRatio }) {
    const p1 = Utils.genotypeCode(parent1.traits, traitIds);
    const p2 = Utils.genotypeCode(parent2.traits, traitIds);
    const record = {
      id: Utils.uid('history'),
      generationLabel,
      label: `${p1} × ${p2}`,
      resultSummary: summarizeGenotypeRatio(genotypeRatio),
      parent1: JSON.parse(JSON.stringify(parent1)),
      parent2: JSON.parse(JSON.stringify(parent2)),
      // Lineage: generasi asal tiap induk (null = berasal dari pool/root "P")
      parent1SourceGeneration: sourceGenerationOf(parent1),
      parent2SourceGeneration: sourceGenerationOf(parent2),
      traitIds,
      punnettResult: JSON.parse(JSON.stringify(punnettResult)),
      children: JSON.parse(JSON.stringify(children)),
      genotypeRatio,
      phenotypeRatio,
      timestamp: Date.now()
    };
    AppState.generationHistory.push(record);
    render();
    return record;
  }

  function getRecords() {
    return AppState.generationHistory;
  }

  // REVISI (Challenge Mode — No Information Leak, Bagian 7/9): dipanggil
  // ChallengeManager.gradeIfActive() SEGERA setelah jawaban dinyatakan SALAH
  // — record persilangan percobaan yang salah TIDAK BOLEH tersisa di
  // Generation History/Timeline/Tree (bisa dipakai untuk mengintip jawaban
  // sebelum retry). Hanya menghapus record TERAKHIR (percobaan yang baru
  // saja dibuat), bukan seluruh riwayat.
  function removeLastRecord() {
    AppState.generationHistory.pop();
    render();
  }

  function render() {
    const list = Utils.qs('#history-list');
    const emptyText = Utils.qs('#history-empty-text');
    list.innerHTML = '';

    emptyText.hidden = AppState.generationHistory.length > 0;

    AppState.generationHistory.forEach((record) => {
      list.appendChild(
        Utils.createEl('li', { class: 'history-item' }, [
          Utils.createEl('span', { class: 'history-item__gen', html: record.generationLabel }),
          Utils.createEl('span', { class: 'history-item__cross', html: record.label }),
          Utils.createEl('span', { class: 'history-item__arrow', html: '↓', 'aria-hidden': 'true' }),
          Utils.createEl('span', { class: 'history-item__result', html: record.resultSummary })
        ])
      );
    });

    EventBus.emit('history:updated', AppState.generationHistory);
  }

  function reset() {
    AppState.generationHistory = [];
    render();
  }

  // REVISI 14: snapshot/restore generik, dipakai Undo/Redo & Autosave
  function getSnapshot() {
    return JSON.parse(JSON.stringify(AppState.generationHistory));
  }

  function restoreState(snapshot) {
    AppState.generationHistory = snapshot ? JSON.parse(JSON.stringify(snapshot)) : [];
    render();
  }

  return { addRecord, removeLastRecord, reset, getRecords, getSnapshot, restoreState };
})();

/* ==========================================================================
   12b. GENERATION TIMELINE (REVISI 12) — linimasa generasi, interaktif.
   Sumber data 100% dari HistoryManager (tidak menyimpan state duplikat),
   hanya menyimpan pointer "generasi mana yang sedang dilihat".
   ========================================================================== */
const GenerationTimeline = (() => {
  let activeRecordId = null; // null = selalu ikut generasi terbaru

  function render(records) {
    const section = Utils.qs('#generation-timeline');
    const track = Utils.qs('#timeline-track');
    if (!section || !track) return;

    if (!records.length) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    track.innerHTML = '';

    records.forEach((record, idx) => {
      if (idx > 0) {
        track.appendChild(Utils.createEl('span', { class: 'timeline-connector', 'aria-hidden': 'true', html: '→' }));
      }
      const isActive = activeRecordId ? activeRecordId === record.id : idx === records.length - 1;
      const node = Utils.createEl(
        'button',
        {
          type: 'button',
          class: `timeline-node${isActive ? ' is-active' : ''}`,
          role: 'listitem',
          'aria-pressed': String(isActive),
          'aria-label': `Lihat generasi ${record.generationLabel}: ${record.label}, hasil ${record.resultSummary}`,
          onClick: () => selectRecord(record.id)
        },
        [
          Utils.createEl('span', { class: 'timeline-node__gen', html: record.generationLabel }),
          Utils.createEl('span', { class: 'timeline-node__cross', html: record.label }),
          Utils.createEl('span', { class: 'timeline-node__result', html: record.resultSummary })
        ]
      );
      track.appendChild(node);
    });
  }

  function selectRecord(recordId) {
    activeRecordId = recordId;
    render(HistoryManager.getRecords());
    EventBus.emit('timeline:selectGeneration', recordId);
  }

  // Dipanggil saat ada cross baru / undo-redo, supaya timeline otomatis
  // mengikuti generasi terbaru lagi (bukan tetap "terkunci" ke generasi lama)
  function setActiveLatest() {
    activeRecordId = null;
  }

  function init() {
    EventBus.on('history:updated', render);
  }

  return { init, setActiveLatest };
})();

/* ==========================================================================
   12c. LEARNING MANAGER (REVISI 15) — gating step-by-step untuk Learning Mode.
   Menggabungkan peran "Tutorial Manager" dari brief (lihat Tahap 1: keduanya
   mengontrol progres langkah yang sama, memisahkannya jadi 2 modul hanya
   akan menimbulkan 2 sumber kebenaran untuk 1 hal).
   Free Mode = tidak melakukan apa pun (perilaku aplikasi tidak berubah).
   ========================================================================== */
const LearningManager = (() => {
  // REVISI (Learning Mode Pedagogical Flow): urutan step disesuaikan dengan
  // urutan VISUAL sebenarnya di layar (Parents -> 2️⃣ Hasil Anak -> 3️⃣ Papan
  // Punnett -> 4️⃣ Rasio) — SEBELUMNYA array ini menaruh 'punnett' sebelum
  // 'children' padahal di UI children-section tampil lebih dulu. Setiap step
  // observasi pasca-cross sekarang PUNYA completion condition sendiri
  // (ack manual), bukan otomatis selesai bareng 'cross' (lihat onCrossPerformed).
  const STEPS = [
    { key: 'parent1', label: 'Pilih Induk 1' },
    { key: 'parent2', label: 'Pilih Induk 2' },
    { key: 'parent-review', label: 'Kenali Genotipe Induk' },
    { key: 'gamete-review', label: 'Pelajari Pembentukan Gamet' },
    { key: 'cross', label: 'Lakukan Persilangan' },
    { key: 'children', label: 'Amati Hasil Anak' },
    { key: 'punnett', label: 'Amati Papan Punnett' },
    { key: 'ratio-genotype', label: 'Analisis Rasio Genotipe' },
    { key: 'ratio-phenotype', label: 'Analisis Rasio Fenotipe' },
    { key: 'next-generation', label: 'Lanjut ke Generasi Berikutnya' }
  ];

  // Data disimpan di AppState.currentMode / AppState.learningProgress.completedSteps
  // (array, bukan Set — konsisten dgn tipe data lain di AppState yang JSON-serializable).
  function isDone(key) {
    return AppState.learningProgress.completedSteps.includes(key);
  }

  function isLearning() {
    return AppState.currentMode === 'learning';
  }

  function getMode() {
    return AppState.currentMode;
  }

  function currentActiveIndex() {
    for (let i = 0; i < STEPS.length; i++) {
      if (!isDone(STEPS[i].key)) return i;
    }
    return STEPS.length - 1;
  }

  function complete(key) {
    if (!isLearning() || isDone(key)) return;
    AppState.learningProgress.completedSteps.push(key);
    render();
    applyLocks();
    // BUG FIX: sebelumnya tombol Silangkan hanya di-refresh saat parent
    // berubah (event 'parent:changed'). Menyelesaikan gerbang belajar (ack
    // parent-review/gamete-review) TIDAK mengubah parent, jadi tombol tidak
    // pernah ter-refresh walau canCross() sudah bernilai true. Ditemukan via
    // test harness headless (jsdom), bukan audit baca kode.
    EventBus.emit('learning:progressed', { key });
  }

  function canCross() {
    if (!isLearning()) return true;
    return isDone('parent-review') && isDone('gamete-review');
  }

  function isSlotLocked(slotKey) {
    if (!isLearning()) return false;
    if (slotKey === 'parent2') return !isDone('parent1');
    return false;
  }

  function render() {
    const section = Utils.qs('#learning-checklist');
    const list = Utils.qs('#learning-checklist-list');
    const fill = Utils.qs('#learning-progress-fill');
    if (!section) return;
    section.hidden = !isLearning();
    if (!isLearning()) return;

    list.innerHTML = '';
    const activeIdx = currentActiveIndex();
    STEPS.forEach((step, idx) => {
      const state = isDone(step.key) ? 'done' : idx === activeIdx ? 'active' : 'locked';
      list.appendChild(
        Utils.createEl('li', { class: 'learning-checklist__item', dataset: { state } }, [
          Utils.createEl('span', { 'aria-hidden': 'true', html: state === 'done' ? '✅' : state === 'active' ? '▶️' : '🔒' }),
          Utils.createEl('span', { html: `${idx + 1}. ${step.label}` })
        ])
      );
    });

    if (fill) fill.style.width = `${Math.round((AppState.learningProgress.completedSteps.length / STEPS.length) * 100)}%`;
  }

  function applyLocks() {
    const pool2 = Utils.qs('#pool-parent2');
    const slot2 = Utils.qs('#content-parent2');
    const locked2 = isSlotLocked('parent2');
    if (pool2) pool2.classList.toggle('is-locked-by-learning', locked2);
    if (slot2) slot2.classList.toggle('is-locked-by-learning', locked2);

    const ackParent = Utils.qs('#ack-parent-review');
    const ackGamete = Utils.qs('#ack-gamete-review');
    if (ackParent) ackParent.hidden = !isLearning() || isDone('parent-review') || !isDone('parent2');
    if (ackGamete) ackGamete.hidden = !isLearning() || isDone('gamete-review') || !isDone('parent-review');

    // REVISI (Fix Progress Checklist): masing-masing gerbang observasi
    // pasca-cross SEKARANG dikunci berantai (chained) — hanya terbuka satu
    // per satu sesuai step SEBELUMNYA benar-benar sudah di-ack. TIDAK ADA
    // lagi yang otomatis terbuka/selesai bareng saat 'cross' selesai.
    const ackChildren = Utils.qs('#ack-children-review');
    const noteChildren = Utils.qs('#learning-note-children');
    const showChildren = isLearning() && !isDone('children') && isDone('cross');
    if (ackChildren) ackChildren.hidden = !showChildren;
    if (noteChildren) noteChildren.hidden = !showChildren;

    const ackPunnett = Utils.qs('#ack-punnett-review');
    const notePunnett = Utils.qs('#learning-note-punnett');
    const showPunnett = isLearning() && !isDone('punnett') && isDone('children');
    if (ackPunnett) ackPunnett.hidden = !showPunnett;
    if (notePunnett) notePunnett.hidden = !showPunnett;

    const ackRatioGeno = Utils.qs('#ack-ratio-genotype-review');
    if (ackRatioGeno) ackRatioGeno.hidden = !isLearning() || isDone('ratio-genotype') || !isDone('punnett');

    const ackRatioPheno = Utils.qs('#ack-ratio-phenotype-review');
    if (ackRatioPheno) ackRatioPheno.hidden = !isLearning() || isDone('ratio-phenotype') || !isDone('ratio-genotype');
  }

  // REVISI (Fix Step 4 - Pembentukan Gamet): dipanggil dari refreshParentSlots()
  // SETIAP KALI parent berubah (BUKAN hanya setelah cross). Gamet ditentukan
  // murni oleh genotipe masing-masing induk, TIDAK butuh hasil persilangan —
  // jadi step "Pelajari Pembentukan Gamet" sekarang benar-benar punya konten
  // nyata SEBELUM tombol "Saya Mengerti"-nya bisa dipakai (dulu teksnya masih
  // "—" karena baru diisi explainCrossResult() yang jalan setelah cross).
  // REVISI (DIHIBRID): `traitId` -> `traitIds`. Gamet dihitung lewat
  // GameteFactory.formGametes (SAMA seperti PunnettCalculator.build) supaya
  // untuk 2 gen gametnya benar-benar kombinasi independent assortment
  // (mis. "AB, Ab, aB, ab"), bukan sekadar alel per-gen terpisah.
  function presentGameteLearning(state, traitIds) {
    if (!state.parent1 || !state.parent2) return;
    const labelOf = (combo) => traitIds.map((t) => combo.alleles[t]).join('');
    const gametes1 = [...new Set(GameteFactory.formGametes(state.parent1.traits).map(labelOf))];
    const gametes2 = [...new Set(GameteFactory.formGametes(state.parent2.traits).map(labelOf))];
    const el = Utils.qs('#edu-gamete-text');
    if (!el) return;
    const geneWord = traitIds.length > 1 ? 'dua gen' : 'satu gen';
    el.textContent =
      `Setiap individu punya dua alel untuk ${geneWord}. Induk 1 (genotipe ${Utils.genotypeCode(state.parent1.traits, traitIds)}) ` +
      `membentuk gamet: ${gametes1.join(', ')}. Induk 2 (genotipe ${Utils.genotypeCode(state.parent2.traits, traitIds)}) membentuk gamet: ${gametes2.join(', ')}. ` +
      `Saat pembentukan gamet, pasangan alel dipisahkan sehingga setiap gamet hanya membawa satu alel per gen.`;
    const stepEl = Utils.qs('.education-step[data-step="gamete"]');
    if (stepEl) stepEl.dataset.active = 'true';
  }

  // REVISI (Fix Progress Checklist): dipanggil UIController.handleCross()
  // SETELAH hasil (Punnett/children) tersedia, TAPI SEBELUM onCrossPerformed()
  // menandai 'cross' selesai — supaya begitu gerbang "Amati Hasil Anak"/"Amati
  // Papan Punnett" terbuka (lihat applyLocks), teksnya SUDAH terisi konten
  // nyata, bukan ack kosong.
  function presentCrossObservations({ punnettResult, childrenCount }) {
    if (!isLearning()) return;
    const totalCells = punnettResult.grid.flat().length;
    const noteChildren = Utils.qs('#learning-note-children');
    if (noteChildren) {
      noteChildren.textContent =
        `Setiap kartu anak di atas mewakili satu kombinasi dari Papan Punnett — total ${childrenCount} anak dihasilkan dari ${totalCells} kemungkinan pertemuan gamet.`;
    }
    const notePunnett = Utils.qs('#learning-note-punnett');
    if (notePunnett) {
      notePunnett.textContent =
        `Papan Punnett menunjukkan seluruh ${totalCells} kemungkinan pertemuan gamet: baris mewakili gamet Induk 1, kolom mewakili gamet Induk 2, dan setiap sel adalah satu kemungkinan genotipe anak.`;
    }
  }

  // REVISI (Fix Progress Checklist): SEBELUMNYA fungsi ini menyelesaikan 5
  // step sekaligus (cross+punnett+children+ratio-genotype+ratio-phenotype)
  // begitu SATU aksi "Silangkan" diklik -> checklist melompat ke step
  // terakhir walau user belum benar-benar mengamati/menganalisis apa pun.
  // ACTION USER (cross) ≠ AUTOMATICALLY COMPLETE ALL PREVIOUS STEPS.
  // Sekarang HANYA 'cross' yang selesai di sini; step observasi berikutnya
  // (children/punnett/ratio-genotype/ratio-phenotype) masing-masing butuh
  // konfirmasi manual lewat tombol "Mengerti, Lanjut" sendiri.
  function onCrossPerformed() {
    complete('cross');
  }

  function reset() {
    AppState.learningProgress.completedSteps = [];
    render();
    applyLocks();
  }

  function modeLabel(mode) {
    const cfg = SIMULATION_CONFIG.modes[mode];
    return cfg ? `${cfg.icon} ${cfg.label}` : mode;
  }

  function syncModeUI() {
    // Kartu pemilihan mode di MENU sekarang dirender dinamis oleh MenuManager
    // (lihat #mode-selector) — modul ini hanya bertanggung jawab atas badge
    // indikator mode yang tampil di LAYAR SIMULATOR.
    const indicator = Utils.qs('#mode-indicator-badge');
    if (indicator) indicator.textContent = modeLabel(AppState.currentMode);
  }

  // Konsisten dengan pola getSnapshot()/restoreState() di GameState/ChildManager/
  // HistoryManager — supaya mode & progres checklist ikut tersimpan di Undo/Redo
  // dan Autosave, bukan selalu kembali ke default "Mode Belajar dari awal".
  function getSnapshot() {
    return { mode: AppState.currentMode, completed: [...AppState.learningProgress.completedSteps] };
  }

  function restoreState(snapshot) {
    AppState.currentMode = snapshot && snapshot.mode ? snapshot.mode : 'learning';
    AppState.learningProgress.completedSteps = snapshot && snapshot.completed ? [...snapshot.completed] : [];
    syncModeUI();
    render();
    applyLocks();
  }

  function selectMode(newMode) {
    AppState.currentMode = newMode;
    syncModeUI();
    reset();
    EventBus.emit('mode:changed', newMode);
  }

  function init() {
    // Kartu pemilihan mode di menu sekarang di-render & di-bind oleh
    // MenuManager (#mode-selector) — modul ini hanya perlu menyediakan
    // selectMode() sebagai satu-satunya penulis AppState.currentMode.
    Utils.qs('#ack-parent-review').addEventListener('click', () => complete('parent-review'));
    Utils.qs('#ack-gamete-review').addEventListener('click', () => complete('gamete-review'));
    // REVISI (Fix Progress Checklist): gerbang observasi pasca-cross, masing-
    // masing dengan completion condition sendiri (lihat applyLocks di atas).
    Utils.qs('#ack-children-review').addEventListener('click', () => complete('children'));
    Utils.qs('#ack-punnett-review').addEventListener('click', () => complete('punnett'));
    Utils.qs('#ack-ratio-genotype-review').addEventListener('click', () => complete('ratio-genotype'));
    Utils.qs('#ack-ratio-phenotype-review').addEventListener('click', () => complete('ratio-phenotype'));

    EventBus.on('parent:changed', ({ slot, genotype }) => {
      if (!genotype || !isLearning()) return;
      if (slot === 'parent1') {
        complete('parent1');
        // REVISI (Fix Progress Checklist): dulu syaratnya cuma isDone('cross')
        // -> user bisa "loncat" ke step 10 hanya dengan memilih ulang parent1
        // walau belum mengamati/menganalisis apa pun. Sekarang mensyaratkan
        // seluruh rantai observasi (children->punnett->ratio-genotype->
        // ratio-phenotype) benar-benar selesai lebih dulu.
        if (isDone('ratio-phenotype')) complete('next-generation');
      }
      if (slot === 'parent2') complete('parent2');
    });
  }

  return {
    isLearning,
    getMode,
    canCross,
    isSlotLocked,
    complete,
    onCrossPerformed,
    presentGameteLearning,
    presentCrossObservations,
    reset,
    init,
    getSnapshot,
    restoreState,
    selectMode
  };
})();

/* ==========================================================================
   12d. GENERATION TREE MANAGER (REVISI 17) — visualisasi alternatif dari
   data HistoryManager yang SAMA PERSIS dengan Generation Timeline (tidak ada
   state duplikat). Disederhanakan sebagai rantai vertikal P->F1->F2->...
   (bukan pohon bercabang penuh) — lihat Tahap 1 untuk alasan trade-off ini.
   ========================================================================== */
const GenerationTreeManager = (() => {
  let zoomLevel = 1;
  let debugMode = false;
  let selectedIndividualId = null;
  let resizeScheduled = false;

  // ==========================================================================
  // DATA LAYER (Requirement 2, 3, 17, 18): registry di-DERIVE dari
  // AppState.generationHistory setiap render — bukan disimpan sebagai state
  // duplikat, dan tidak ada satu baris pun "if generation === 'F1'".
  // ==========================================================================

  // Genotipe dari sidebar pool punya id STATIS ("AA"/"Aa"/"aa") yang dipakai
  // ULANG di banyak cross berbeda — kalau dipakai langsung sebagai identity
  // individu, dua "AA" dari 2 cross berbeda akan salah dianggap 1 individu
  // yang sama (melanggar Requirement 2). Untuk parent yang BUKAN anak hasil
  // cross sebelumnya, sintesis ID unik yang di-scope ke cross itu sendiri.
  function individualIdFor(record, slot) {
    const genotype = record[slot];
    if (genotype.id && genotype.id.startsWith('child_')) return genotype.id; // sudah unik sejati
    return `${record.id}::${slot}`;
  }

  // REVISI (DIHIBRID): `record.traitId` -> `record.traitIds`. Individual kini
  // menyimpan `traits` (objek genotipe utuh, bentuk sama dengan
  // genotype.traits di seluruh codebase) + `traitIds`, bukan hanya string
  // genotipe hasil join — supaya fenotipe/kode genotipe multi-gen bisa
  // dihitung ulang lewat Utils.genotypeCode/phenotypeLabel yang sama dipakai
  // modul lain (satu sumber kebenaran, Aturan #6/#7).
  function buildRegistry(records) {
    const individuals = {};
    const crosses = {};

    records.forEach((record) => {
      const traitIds = record.traitIds;
      const p1Id = individualIdFor(record, 'parent1');
      const p2Id = individualIdFor(record, 'parent2');

      [[p1Id, record.parent1], [p2Id, record.parent2]].forEach(([id, genotype]) => {
        if (!individuals[id]) {
          individuals[id] = {
            id,
            generationLabel: 'P',
            genotype: Utils.genotypeCode(genotype.traits, traitIds),
            traits: genotype.traits,
            traitIds,
            parentIds: [],
            crossId: null
          };
        }
      });

      const crossId = `cross_${record.id}`;
      const childIds = record.children.map((c) => c.id);

      crosses[crossId] = {
        id: crossId,
        recordId: record.id,
        generationLabel: record.generationLabel,
        parentIds: [p1Id, p2Id],
        childIds,
        resultSummary: record.resultSummary,
        label: record.label
      };

      record.children.forEach((child) => {
        individuals[child.id] = {
          id: child.id,
          generationLabel: record.generationLabel,
          genotype: Utils.genotypeCode(child.traits, traitIds),
          traits: child.traits,
          traitIds,
          parentIds: [p1Id, p2Id],
          crossId
        };
      });
    });

    return { individuals, crosses };
  }

  // Requirement 19 (branching-ready): peta "individu -> cross yang lahir
  // darinya" dipakai untuk menyusun forest bertingkat, mendukung >1 anak dari
  // generasi yang sama masing-masing punya cross lanjutan sendiri.
  function buildForest(records, individuals, crosses) {
    const nestUnder = {}; // individualId -> crossId (cross yang harus dirender BERSARANG di bawah individu ini)
    const crossList = Object.values(crosses);

    crossList.forEach((cross) => {
      const [p1Id, p2Id] = cross.parentIds;
      const sourceIndividualId = [p1Id, p2Id].find((id) => individuals[id] && individuals[id].crossId);
      if (sourceIndividualId) {
        nestUnder[sourceIndividualId] = cross.id;
      }
    });

    const nestedCrossIds = new Set(Object.values(nestUnder));
    const rootCrosses = crossList.filter((c) => !nestedCrossIds.has(c.id));

    return { rootCrosses, nestUnder };
  }

  // ==========================================================================
  // RENDER LAYER (Requirement 1, 4, 7, 8, 9): hierarchy sungguhan —
  // Parents -> Cross-node -> Children, bersarang secara DOM (bukan flat).
  // ==========================================================================
  // REVISI (DIHIBRID): pakai Utils.phenotypeLabel (gabungan lintas gen)
  // alih-alih DominanceRule.resolvePhenotype langsung pada 1 gen.
  function phenotypeOf(individual) {
    return Utils.phenotypeLabel(individual.traits, individual.traitIds);
  }

  function renderIndividualNode(individual, { small = false } = {}) {
    const phenotypeLabel = phenotypeOf(individual);
    const isSelected = selectedIndividualId === individual.id;
    const node = Utils.createEl('button', {
      type: 'button',
      class: `tree-individual${small ? ' tree-individual--compact' : ''}${isSelected ? ' is-selected' : ''}`,
      dataset: { individualId: individual.id },
      'aria-label': `${individual.generationLabel}, genotipe ${individual.genotype}, ${phenotypeLabel}`,
      onClick: (e) => { e.stopPropagation(); selectIndividual(individual.id); },
      onMouseenter: () => setHoverLineage(individual.id, true),
      onMouseleave: () => setHoverLineage(individual.id, false)
    });
    const iconWrap = Utils.createEl('span', { class: 'tree-individual__icon' });
    iconWrap.appendChild(OrganismIllustration.create(AppState.speciesId, Renderer.illustrationPhenotype({ traits: individual.traits }, individual.traitIds)));
    node.appendChild(iconWrap);
    node.appendChild(Utils.createEl('span', { class: 'tree-individual__gen', html: individual.generationLabel }));
    node.appendChild(Utils.createEl('span', { class: 'tree-individual__geno', html: individual.genotype }));
    if (debugMode) {
      node.appendChild(Utils.createEl('span', {
        class: 'tree-individual__debug',
        html: `id: ${individual.id}<br>parents: ${individual.parentIds.join(', ') || '—'}`
      }));
    }
    return node;
  }

  // Cross-block = 1 level lengkap: Parents -> Cross-node -> Children.
  // Jika sebuah child punya cross lanjutan (nestUnder), cross tersebut
  // dirender REKURSIF di dalam slot child itu -> hierarchy asli, bukan
  // ditumpuk sejajar.
  function renderCrossBlock(cross, ctx) {
    const { individuals, nestUnder } = ctx;
    const block = Utils.createEl('div', { class: 'cross-block', dataset: { crossId: cross.id } });

    const parents = Utils.createEl('div', { class: 'cross-block__parents' });
    cross.parentIds.forEach((pid) => {
      parents.appendChild(renderIndividualNode(individuals[pid]));
    });
    block.appendChild(parents);

    block.appendChild(
      Utils.createEl('button', {
        type: 'button',
        class: 'cross-block__cross-node',
        'aria-label': `Lihat persilangan ${cross.label} (${cross.generationLabel})`,
        onClick: (e) => { e.stopPropagation(); EventBus.emit('timeline:selectGeneration', cross.recordId); }
      }, [document.createTextNode('×')])
    );

    const childrenRow = Utils.createEl('div', { class: 'cross-block__children' });
    cross.childIds.forEach((cid) => {
      const slot = Utils.createEl('div', { class: 'cross-block__child-slot' });
      slot.appendChild(renderIndividualNode(individuals[cid], { small: true }));
      const nestedCrossId = nestUnder[cid];
      if (nestedCrossId) {
        slot.appendChild(renderCrossBlock(ctx.crosses[nestedCrossId], ctx));
      }
      childrenRow.appendChild(slot);
    });
    block.appendChild(childrenRow);

    return block;
  }

  function render(records) {
    const canvas = Utils.qs('#tree-canvas');
    const wrap = Utils.qs('#generation-tree-wrap');
    if (!canvas || !wrap) return;

    // Bersihkan node lama, PERTAHANKAN elemen svg (di-reuse, bukan dibuat ulang)
    Utils.qsa('.tree-forest', canvas).forEach((el) => el.remove());

    if (!records.length) return;

    const { individuals, crosses } = buildRegistry(records);
    const { rootCrosses, nestUnder } = buildForest(records, individuals, crosses);
    const ctx = { individuals, crosses, nestUnder };

    const forest = Utils.createEl('div', { class: 'tree-forest' });
    rootCrosses.forEach((cross) => forest.appendChild(renderCrossBlock(cross, ctx)));
    canvas.appendChild(forest);

    scheduleDrawConnectors();
  }

  // ==========================================================================
  // CONNECTOR LAYER (Requirement 5, 6): SVG dihitung dari posisi node
  // SUNGGUHAN (getBoundingClientRect), bukan koordinat hardcode.
  // ==========================================================================
  function drawConnectors() {
    const svg = Utils.qs('#tree-connectors-svg');
    const canvas = Utils.qs('#tree-canvas');
    if (!svg || !canvas) return;

    const canvasRect = canvas.getBoundingClientRect();
    // Sesuaikan ukuran svg dengan konten (bukan viewport) supaya ikut ter-scroll bersama node
    svg.setAttribute('width', canvas.scrollWidth);
    svg.setAttribute('height', canvas.scrollHeight);
    svg.innerHTML = '';

    const relCenter = (el) => {
      const r = el.getBoundingClientRect();
      return {
        x: (r.left - canvasRect.left + r.width / 2) / zoomLevel,
        y: (r.top - canvasRect.top + r.height / 2) / zoomLevel,
        top: (r.top - canvasRect.top) / zoomLevel,
        bottom: (r.bottom - canvasRect.top) / zoomLevel
      };
    };

    function line(x1, y1, x2, y2) {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      el.setAttribute('x1', x1); el.setAttribute('y1', y1);
      el.setAttribute('x2', x2); el.setAttribute('y2', y2);
      el.setAttribute('class', 'tree-connector-line');
      svg.appendChild(el);
    }

    Utils.qsa('.cross-block', canvas).forEach((block) => {
      const crossNode = block.querySelector(':scope > .cross-block__cross-node');
      if (!crossNode) return;
      const crossPos = relCenter(crossNode);

      // Parents -> Cross
      block.querySelectorAll(':scope > .cross-block__parents > .tree-individual').forEach((parentEl) => {
        const p = relCenter(parentEl);
        line(p.x, p.bottom, crossPos.x, crossPos.top);
      });

      // Cross -> setiap Child (langsung ke child node-nya, BUKAN ke slot
      // pembungkusnya, supaya tetap presisi walau child punya nested cross)
      block.querySelectorAll(':scope > .cross-block__children > .cross-block__child-slot > .tree-individual').forEach((childEl) => {
        const c = relCenter(childEl);
        line(crossPos.x, crossPos.bottom, c.x, c.top);
      });
    });
  }

  function scheduleDrawConnectors() {
    requestAnimationFrame(() => requestAnimationFrame(drawConnectors));
  }

  // ==========================================================================
  // INTERACTION LAYER (Requirement 11, 12): klik = info + lineage highlight,
  // hover = highlight halus.
  // ==========================================================================
  function collectAncestors(individuals, id, acc) {
    const ind = individuals[id];
    if (!ind) return;
    (ind.parentIds || []).forEach((pid) => {
      if (!acc.has(pid)) { acc.add(pid); collectAncestors(individuals, pid, acc); }
    });
  }

  function collectDescendants(individuals, id, acc) {
    Object.values(individuals).forEach((ind) => {
      if (ind.parentIds && ind.parentIds.includes(id) && !acc.has(ind.id)) {
        acc.add(ind.id);
        collectDescendants(individuals, ind.id, acc);
      }
    });
  }

  function setHoverLineage(individualId, active) {
    const canvas = Utils.qs('#tree-canvas');
    if (!canvas) return;
    const records = HistoryManager.getRecords();
    const { individuals } = buildRegistry(records);

    const lineage = new Set([individualId]);
    collectAncestors(individuals, individualId, lineage);
    collectDescendants(individuals, individualId, lineage);

    lineage.forEach((id) => {
      const el = canvas.querySelector(`[data-individual-id="${CSS.escape(id)}"]`);
      if (el) el.classList.toggle('is-hover', active);
    });
  }

  function selectIndividual(individualId) {
    selectedIndividualId = individualId;
    const records = HistoryManager.getRecords();
    const { individuals, crosses } = buildRegistry(records);
    const individual = individuals[individualId];
    if (!individual) return;

    Utils.qsa('.tree-individual.is-selected', Utils.qs('#tree-canvas')).forEach((el) => el.classList.remove('is-selected'));
    const el = Utils.qs('#tree-canvas').querySelector(`[data-individual-id="${CSS.escape(individualId)}"]`);
    if (el) el.classList.add('is-selected');

    const phenotypeLabel = phenotypeOf(individual);
    const childCross = individual.crossId ? null : Object.values(crosses).find((c) => c.parentIds.includes(individualId));
    const bornFromCross = individual.crossId ? crosses[individual.crossId] : null;

    const info = Utils.qs('#tree-node-info-content');
    info.innerHTML = '';
    info.appendChild(Utils.createEl('h4', { html: `${individual.generationLabel} — ${individual.genotype}` }));
    info.appendChild(Utils.createEl('p', { html: `Fenotipe: ${phenotypeLabel}` }));
    info.appendChild(Utils.createEl('p', {
      html: individual.parentIds.length
        ? `Induk: ${individual.parentIds.map((pid) => individuals[pid] ? individuals[pid].genotype : '?').join(' × ')}`
        : 'Induk: (individu awal dari pool genotipe)'
    }));
    const childrenOfThis = Object.values(individuals).filter((i) => i.parentIds.includes(individualId));
    if (childrenOfThis.length) {
      info.appendChild(Utils.createEl('p', { html: `Keturunan: ${childrenOfThis.map((c) => c.genotype).join(', ')}` }));
    }

    if (bornFromCross) {
      info.appendChild(
        Utils.createEl('button', {
          type: 'button',
          class: 'btn btn--primary btn--small',
          html: 'Lihat Persilangan Ini',
          onClick: () => EventBus.emit('timeline:selectGeneration', bornFromCross.recordId)
        })
      );
    }

    Utils.qs('#tree-node-info').hidden = false;
  }

  // ==========================================================================
  // VIEWPORT: zoom + debug toggle (Requirement 13, 14, 20)
  // ==========================================================================
  function applyZoom() {
    const canvas = Utils.qs('#tree-canvas');
    if (canvas) canvas.style.transform = `scale(${zoomLevel})`;
    const label = Utils.qs('#tree-zoom-reset');
    if (label) label.textContent = `${Math.round(zoomLevel * 100)}%`;
    scheduleDrawConnectors();
  }

  function bindToolbar() {
    Utils.qs('#tree-zoom-in').addEventListener('click', () => {
      zoomLevel = Math.min(1.6, zoomLevel + 0.15);
      applyZoom();
    });
    Utils.qs('#tree-zoom-out').addEventListener('click', () => {
      zoomLevel = Math.max(0.5, zoomLevel - 0.15);
      applyZoom();
    });
    Utils.qs('#tree-zoom-reset').addEventListener('click', () => {
      zoomLevel = 1;
      applyZoom();
    });
    Utils.qs('#tree-debug-toggle').addEventListener('click', (e) => {
      debugMode = !debugMode;
      e.target.setAttribute('aria-pressed', String(debugMode));
      e.target.classList.toggle('is-active', debugMode);
      render(HistoryManager.getRecords());
    });
    Utils.qs('#tree-node-info-close').addEventListener('click', () => {
      Utils.qs('#tree-node-info').hidden = true;
    });

    // Requirement 6: connector harus tetap presisi saat window resize
    window.addEventListener('resize', () => {
      if (resizeScheduled) return;
      resizeScheduled = true;
      setTimeout(() => { resizeScheduled = false; scheduleDrawConnectors(); }, 150);
    });
  }

  function init() {
    EventBus.on('history:updated', (records) => {
      // Hanya render kalau tab Tree memang sedang aktif & visible — render ke
      // elemen hidden akan menghasilkan getBoundingClientRect(0,0) yang salah.
      if (!Utils.qs('#generation-tree-wrap').hidden) render(records);
    });
    bindToolbar();
  }

  return { init, render };
})();

/* ==========================================================================
   12e. CHALLENGE MANAGER (REVISI: Level Selection + Question Pool)

   REVISI LANJUTAN — audit singkat sebelum menulis ulang modul ini:

   A. PENYEBAB MASALAH (baseline lama):
      1. Soal Challenge SELALU SAMA: QUESTION_BANK berisi HANYA 3 soal statis,
         dipakai berurutan (index 0,1,2) setiap sesi — tidak ada pool/level/
         randomisasi sama sekali.
      2. "Akhiri Sesi" -> Sandbox: exitSession() lama men-set
         AppState.challengeState = null SECARA TOTAL. Karena ParentManager
         hanya mengunci parent kalau ChallengeManager.isActive() true, begitu
         challengeState di-null-kan, isActive() jadi false selamanya ->
         parent/pool otomatis menjadi bisa diisi bebas (persis Free/Sandbox)
         walau AppState.currentMode masih 'challenge'. Tidak ada state
         "sedang dalam konteks Challenge tapi belum/tidak ada sesi aktif".
      3. Jawaban salah membocorkan info lewat Timeline: handleCross() di
         UIController SELALU memanggil HistoryManager.addRecord() untuk
         SETIAP cross, termasuk cross Challenge yang JAWABANNYA SALAH. Record
         itu tetap tersimpan permanen di Generation Timeline/Tree walau user
         menekan "Coba Lagi" — retrySameQuestion() lama hanya membersihkan
         WORKSPACE LIVE (ChildManager/PunnettRenderer), tidak menyentuh
         HistoryManager sama sekali.

   B. ARCHITECTURE EXISTING YANG DIPERTAHANKAN:
      - Mendel Engine / PunnettCalculator / DominanceRule: TIDAK DISENTUH.
      - Pola "No Free Exploration" via ParentManager + isGenotypeAllowedForSlot.
      - Pola AppState.challengeState sebagai satu-satunya sumber state
        Challenge (bukan closure privat) — TETAP dipakai, hanya bentuknya
        diperluas dengan field `screen` untuk membedakan tahap.
      - Answer Lock state machine (QUESTION -> ANSWER_SELECTION ->
        ANSWER_LOCKED -> CROSSING_UNLOCKED) — TIDAK diubah.
      - Pola grading (readRows/renderRows/computeExpected) — TIDAK diubah,
        hanya sumber soal yang sekarang datang dari pool per-level.

   C. STATE YANG DIPISAHKAN (sesuai requirement Bagian 10):
      - CHALLENGE CONTEXT ("kita sedang di alur Challenge") vs
        CHALLENGE SESSION ("sedang mengerjakan soal level tertentu").
        Direpresentasikan lewat SATU object AppState.challengeState dengan
        field `screen`: 'level-select' (context TANPA session aktif) atau
        'session' (context DENGAN session aktif). `active`/`sessionEnded`
        tetap dipertahankan sebagai sub-status di dalam 'session'.
      - isInChallengeContext() (screen apa pun, termasuk level-select) vs
        isActive() (khusus screen:'session' yang benar-benar berjalan).
        ParentManager SEKARANG mengunci berdasarkan isInChallengeContext()
        (SEBELUMNYA hanya isActive() — celah yang menyebabkan Bug #2 di atas).

   D. PERUBAHAN MINIMAL:
      - QUESTION_BANK tunggal -> CHALLENGE_LEVELS (3 level, masing-masing
        punya question pool sendiri + metadata). Mendel Engine/Grading TIDAK
        diubah, hanya sumber soal.
      - exitSession() dipecah jadi 2 fungsi dengan scope reset yang jelas:
        endSession() (Akhiri Sesi -> kembali ke Level Selection, context
        TETAP ada) dan exitContext() (keluar total, dipakai saat pindah
        mode/spesies/menu — SAMA PERSIS perilaku exitSession() lama).
      - gradeIfActive() menambahkan SATU pemanggilan baru
        (purgeWrongAttemptRecord()) ketika jawaban salah — tidak mengubah
        logic perhitungan benar/salah itu sendiri.
   ========================================================================== */
const ChallengeManager = (() => {
  // REVISI (Question Pool + Level): setiap level punya pool soal sendiri
  // dengan metadata (id/difficulty/concept) sesuai requirement Bagian 5/6.
  // Kombinasi pasangan induk untuk monohibrid satu gen SECARA ILMIAH hanya
  // ada 6 kemungkinan unik (AA/Aa/aa dipasangkan 2) — pool di bawah
  // membagi ke-6 kombinasi itu ke 3 level berdasarkan tingkat kesulitan
  // interpretasi rasionya (bukan menambah kombinasi genetika baru yang
  // tidak valid). Setiap sesi mengambil subset ACAK (tanpa pengulangan)
  // dari pool levelnya sendiri -> soal tidak selalu sama antar sesi
  // (REVISI Bagian 6: "Question Randomization" + "Question Replay").
  const CHALLENGE_LEVELS = {
    level1: {
      id: 'level1',
      tier: 1,
      name: 'Dasar',
      icon: '🟢',
      desc: 'Pewarisan Mendel dasar — dominan vs resesif',
      questionsPerSession: 3,
      // REVISI (Learning -> Practice -> Assessment): Level 1 = LEARNING.
      // Retry tidak dibatasi, tapi retry TIDAK memulihkan first-attempt yang
      // salah — skor question ini tetap memakai retryAttempt (bukan penuh)
      // begitu attempt pertama salah, walau attempt berikutnya benar.
      retryPolicy: { maxRetries: Infinity, scoring: { firstAttempt: 100, retryAttempt: 50, failed: 0 } },
      pool: [
        { id: 'L1-Q01', difficulty: 1, concept: 'monohybrid', objective: 'ratio-prediction', parent1: ['A', 'A'], parent2: ['A', 'A'] },
        { id: 'L1-Q02', difficulty: 1, concept: 'monohybrid', objective: 'ratio-prediction', parent1: ['A', 'A'], parent2: ['a', 'a'] },
        { id: 'L1-Q03', difficulty: 1, concept: 'monohybrid', objective: 'ratio-prediction', parent1: ['a', 'a'], parent2: ['a', 'a'] },
        { id: 'L1-Q04', difficulty: 1, concept: 'monohybrid', objective: 'ratio-prediction', parent1: ['A', 'A'], parent2: ['A', 'a'] }
      ],
      // REVISI (DIHIBRID): pool KEDUA, paralel dengan `pool` di atas — dipilih
      // ChallengeManager.poolFor() berdasarkan AppState.inheritanceType.
      // Metadata level (nama/ikon/retryPolicy) TETAP SATU — SHARED — hanya
      // konten soal yang beda (Aturan #18: "Question configuration dapat
      // berbeda. ChallengeManager harus shared."). Format parent: array 2
      // pasangan alel [gen1, gen2] (posisi, BUKAN keyed by traitId — supaya
      // pool ini generik untuk organisme dihibrid MANA PUN yang sedang
      // dipilih, sama seperti `pool` monohibrid di atas generik untuk
      // trait apa pun).
      dihybridPool: [
        { id: 'L1D-Q01', difficulty: 1, concept: 'dihybrid', objective: 'ratio-prediction', parent1: [['A', 'A'], ['B', 'B']], parent2: [['A', 'A'], ['B', 'B']] },
        { id: 'L1D-Q02', difficulty: 1, concept: 'dihybrid', objective: 'ratio-prediction', parent1: [['A', 'A'], ['B', 'B']], parent2: [['a', 'a'], ['b', 'b']] },
        { id: 'L1D-Q03', difficulty: 1, concept: 'dihybrid', objective: 'ratio-prediction', parent1: [['a', 'a'], ['b', 'b']], parent2: [['a', 'a'], ['b', 'b']] },
        { id: 'L1D-Q04', difficulty: 1, concept: 'dihybrid', objective: 'ratio-prediction', parent1: [['A', 'A'], ['B', 'B']], parent2: [['A', 'a'], ['B', 'b']] }
      ]
    },
    level2: {
      id: 'level2',
      tier: 2,
      name: 'Menengah',
      icon: '🔵',
      desc: 'Rasio genotipe & fenotipe dari berbagai kombinasi induk',
      questionsPerSession: 3,
      // REVISI: Level 2 = PRACTICE. Retry dibatasi (1x per soal), scoring
      // retry lebih ketat daripada Level 1. Retry budget habis -> lanjut ke
      // soal berikutnya (BUKAN unlimited retry).
      retryPolicy: { maxRetries: 1, scoring: { firstAttempt: 100, retryAttempt: 40, failed: 0 } },
      pool: [
        { id: 'L2-Q01', difficulty: 2, concept: 'monohybrid', objective: 'ratio-prediction', parent1: ['A', 'a'], parent2: ['A', 'a'] },
        { id: 'L2-Q02', difficulty: 2, concept: 'monohybrid', objective: 'ratio-prediction', parent1: ['A', 'a'], parent2: ['a', 'a'] },
        { id: 'L2-Q03', difficulty: 2, concept: 'monohybrid', objective: 'ratio-prediction', parent1: ['A', 'A'], parent2: ['A', 'a'] },
        { id: 'L2-Q04', difficulty: 2, concept: 'monohybrid', objective: 'ratio-prediction', parent1: ['A', 'A'], parent2: ['a', 'a'] }
      ],
      dihybridPool: [
        { id: 'L2D-Q01', difficulty: 2, concept: 'dihybrid', objective: 'ratio-prediction', parent1: [['A', 'a'], ['B', 'b']], parent2: [['a', 'a'], ['b', 'b']] },
        { id: 'L2D-Q02', difficulty: 2, concept: 'dihybrid', objective: 'ratio-prediction', parent1: [['A', 'A'], ['B', 'b']], parent2: [['A', 'a'], ['B', 'b']] },
        { id: 'L2D-Q03', difficulty: 2, concept: 'dihybrid', objective: 'ratio-prediction', parent1: [['A', 'a'], ['B', 'B']], parent2: [['A', 'a'], ['B', 'b']] },
        { id: 'L2D-Q04', difficulty: 2, concept: 'dihybrid', objective: 'ratio-prediction', parent1: [['A', 'A'], ['B', 'B']], parent2: [['a', 'a'], ['b', 'b']] }
      ]
    },
    level3: {
      id: 'level3',
      tier: 3,
      name: 'Lanjutan',
      icon: '🟣',
      desc: 'Analisis persilangan campuran — uji pemahaman menyeluruh (Assessment, tanpa retry)',
      questionsPerSession: 4,
      // REVISI: Level 3 = ASSESSMENT. Tidak ada retry sama sekali, dan tidak
      // ada opsi "Tampilkan Hasil" (lihat gradeIfActive) — dinilai murni dari
      // first attempt, objektif.
      retryPolicy: { maxRetries: 0, scoring: { firstAttempt: 100, failed: 0 } },
      pool: [
        { id: 'L3-Q01', difficulty: 3, concept: 'monohybrid', objective: 'ratio-prediction', parent1: ['A', 'a'], parent2: ['A', 'a'] },
        { id: 'L3-Q02', difficulty: 3, concept: 'monohybrid', objective: 'ratio-prediction', parent1: ['A', 'a'], parent2: ['a', 'a'] },
        { id: 'L3-Q03', difficulty: 3, concept: 'monohybrid', objective: 'ratio-prediction', parent1: ['A', 'A'], parent2: ['A', 'a'] },
        { id: 'L3-Q04', difficulty: 3, concept: 'monohybrid', objective: 'ratio-prediction', parent1: ['a', 'a'], parent2: ['a', 'a'] }
      ],
      // Level baru di masa depan tinggal ditambah sebagai entry baru di
      // CHALLENGE_LEVELS — TIDAK PERLU menyentuh presentQuestion/gradeIfActive.
      dihybridPool: [
        { id: 'L3D-Q01', difficulty: 3, concept: 'dihybrid', objective: 'ratio-prediction', parent1: [['A', 'a'], ['B', 'b']], parent2: [['A', 'a'], ['B', 'b']] },
        { id: 'L3D-Q02', difficulty: 3, concept: 'dihybrid', objective: 'ratio-prediction', parent1: [['A', 'a'], ['B', 'b']], parent2: [['A', 'a'], ['b', 'b']] },
        { id: 'L3D-Q03', difficulty: 3, concept: 'dihybrid', objective: 'ratio-prediction', parent1: [['A', 'a'], ['B', 'B']], parent2: [['a', 'a'], ['B', 'b']] },
        { id: 'L3D-Q04', difficulty: 3, concept: 'dihybrid', objective: 'ratio-prediction', parent1: [['a', 'a'], ['b', 'b']], parent2: [['a', 'a'], ['b', 'b']] }
      ]
    }
  };

  // REVISI (DIHIBRID): pool aktif tergantung AppState.inheritanceType —
  // SATU-SATUNYA titik percabangan; presentQuestion/selectLevel/renderLevelSelect
  // dst. semua memanggil ini, tidak ada cabang if lain di tempat lain.
  function poolFor(level) {
    return AppState.inheritanceType === 'dihybrid' && level.dihybridPool ? level.dihybridPool : level.pool;
  }

  // REVISI (DIHIBRID): dari fungsi tunggal single-trait menjadi generik
  // N-trait — untuk 1 trait hasilnya PERSIS ['AA','Aa','aa'] seperti
  // GENOTYPE_ORDER lama (zero regression). Untuk 2 trait: cartesian product
  // sesuai urutan kanonik Aturan #28 (AABB, AABb, AAbb, AaBB, ...).
  function genotypeOrderFor(traitIds) {
    return traitIds.reduce((acc, t) => {
      const traitDef = Traits[t];
      const dom = DominanceRule.dominantSymbolFor(traitDef);
      const rec = Object.keys(traitDef.alleles).find((s) => s !== dom);
      const orders = [`${dom}${dom}`, `${dom}${rec}`, `${rec}${rec}`];
      if (!acc.length) return orders;
      const combined = [];
      acc.forEach((a) => orders.forEach((b) => combined.push(a + b)));
      return combined;
    }, []);
  }

  // REVISI (DIHIBRID): RATIO_OPTIONS tetap [0,25,50,75,100] untuk Monohibrid
  // (4 sel Punnett), tapi TIDAK bisa dihardcode lagi untuk Dihibrid (16 sel
  // -> kelipatan 6.25%). Dihitung dari jumlah sel Punnett aktual.
  function ratioOptionsFor(totalCells) {
    return Array.from({ length: totalCells + 1 }, (_, i) => Math.round((i / totalCells) * 100));
  }

  // REVISI (3 Organisme Monohibrid + DIHIBRID): `traitId` tunggal ->
  // `traitIds` (array). Untuk 1 trait, hasilnya PERSIS [labelDominan,
  // labelResesif] seperti sebelumnya. Untuk 2 trait, cartesian product label
  // gabungan (mis. "Biji Kuning, Biji Bulat", ..., urutan sama dengan
  // Utils.phenotypeLabel/GenotypeOrder: dominan dulu per gen, lalu resesif).
  function phenotypeOrderFor(traitIds) {
    return traitIds.reduce((acc, t) => {
      const traitDef = Traits[t];
      const dom = DominanceRule.dominantSymbolFor(traitDef);
      const rec = Object.keys(traitDef.alleles).find((s) => s !== dom);
      const labels = [`${traitDef.noun} ${traitDef.alleles[dom].label}`, `${traitDef.noun} ${traitDef.alleles[rec].label}`];
      if (!acc.length) return labels;
      const combined = [];
      acc.forEach((a) => labels.forEach((b) => combined.push(`${a}, ${b}`)));
      return combined;
    }, []);
  }

  // REVISI (DIHIBRID): bangun objek `traits` (bentuk sama dengan
  // genotype.traits) dari spesifikasi soal. Untuk 1 trait, `parentSpec` tetap
  // array datar 2 alel (format LAMA, tidak berubah). Untuk 2 trait,
  // `parentSpec` adalah array 2 pasangan (posisi = urutan traitIds).
  function traitsFromQuestionParent(parentSpec, traitIds) {
    if (traitIds.length === 1) return { [traitIds[0]]: parentSpec };
    const traits = {};
    traitIds.forEach((t, i) => { traits[t] = parentSpec[i]; });
    return traits;
  }

  // Fisher-Yates shuffle murni (tidak mengubah array asli) — dipakai supaya
  // urutan soal per sesi acak TANPA mengubah/merusak pool sumbernya.
  function shuffled(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  // ------------------------------------------------------------------------
  // STATE SHAPE (AppState.challengeState):
  //   screen: 'level-select' | 'session'
  //   traitId
  //   levelId: null di level-select, terisi begitu level dipilih
  //   -- field di bawah ini hanya relevan saat screen === 'session' --
  //   active, sessionQuestions, questionIndex, totalQuestions, correctCount,
  //   wrongCount, currentQuestion, phenotypeOrder, lockedAnswer,
  //   crossPerformed, sessionEnded
  // ------------------------------------------------------------------------

  function isInChallengeContext() {
    return Boolean(AppState.challengeState);
  }

  function isLevelSelecting() {
    return Boolean(AppState.challengeState) && AppState.challengeState.screen === 'level-select';
  }

  function isActive() {
    return Boolean(AppState.challengeState) && AppState.challengeState.screen === 'session' && AppState.challengeState.active;
  }

  // REVISI (Fix "Akhiri Sesi" -> Sandbox): dipakai ParentManager untuk
  // mengunci parent SELAMA masih dalam konteks Challenge — termasuk saat
  // sedang di Level Selection (belum/tidak ada sesi aktif). SEBELUMNYA
  // pengecekan ini memakai isActive() saja, sehingga begitu sesi berakhir,
  // parent langsung bisa diisi bebas seperti Free/Sandbox.
  function applyContextLocks() {
    const locked = isInChallengeContext() && !isActive();
    ['pool-parent1', 'content-parent1', 'pool-parent2', 'content-parent2'].forEach((id) => {
      const el = Utils.qs(`#${id}`);
      if (el) el.classList.toggle('is-locked-by-challenge', locked);
    });
  }

  // REVISI: dipakai ParentManager untuk menegakkan "No Free Exploration" —
  // selama Challenge aktif, parent HANYA boleh berisi genotipe yang memang
  // menjadi bagian dari objective saat ini. Saat Level Selection (belum ada
  // soal), TIDAK ADA genotipe yang boleh ditempatkan sama sekali.
  // REVISI (DIHIBRID): `cs.traitId` -> `cs.traitIds`. Perbandingan genotipe
  // via Utils.genotypeCode (gabungan lintas gen) alih-alih `.join('')` pada
  // pasangan tunggal.
  function isGenotypeAllowedForSlot(slotKey, genotype) {
    if (!isInChallengeContext()) return true;
    if (!isActive()) return false; // Level Selection / sesi belum mulai -> parent terkunci total
    const cs = AppState.challengeState;
    const required = slotKey === 'parent1' ? cs.currentQuestion.parent1 : cs.currentQuestion.parent2;
    const requiredTraits = traitsFromQuestionParent(required, cs.traitIds);
    return Utils.genotypeCode(requiredTraits, cs.traitIds) === Utils.genotypeCode(genotype.traits, cs.traitIds);
  }

  // REVISI (DIHIBRID): `traitId` -> `traitIds`. Memakai PunnettCalculator.build
  // (generik multi-gen) + Utils.genotypeCode/phenotypeLabel — SATU SUMBER
  // KEBENARAN yang sama dipakai alur cross biasa (Aturan #7: kontrak
  // GeneticEngine yang sama untuk shared UI).
  function computeExpected(question, traitIds) {
    const gA = traitsFromQuestionParent(question.parent1, traitIds);
    const gB = traitsFromQuestionParent(question.parent2, traitIds);
    const { grid } = PunnettCalculator.build(gA, gB, traitIds);
    const flatCells = grid.flat();
    const total = flatCells.length;

    const genoCounts = {};
    const phenoCounts = {};
    flatCells.forEach((cellTraits) => {
      const genoStr = Utils.genotypeCode(cellTraits, traitIds);
      genoCounts[genoStr] = (genoCounts[genoStr] || 0) + 1;
      const phenoLabel = Utils.phenotypeLabel(cellTraits, traitIds);
      phenoCounts[phenoLabel] = (phenoCounts[phenoLabel] || 0) + 1;
    });

    const toPercentMap = (order, counts) => {
      const map = {};
      order.forEach((key) => { map[key] = Math.round(((counts[key] || 0) / total) * 100); });
      return map;
    };

    return { genotype: toPercentMap(genotypeOrderFor(traitIds), genoCounts), phenotype: toPercentMap(phenotypeOrderFor(traitIds), phenoCounts) };
  }

  // REVISI (DIHIBRID): opsi persen sekarang parameter (`ratioOptions`),
  // dihitung dari jumlah sel Punnett aktual (lihat ratioOptionsFor) —
  // BUKAN lagi konstanta tetap, supaya 16-sel Dihibrid punya opsi yang benar
  // (kelipatan 6.25%) sementara 4-sel Monohibrid TETAP [0,25,50,75,100].
  function renderRows(containerId, order, prefix, ratioOptions) {
    const container = Utils.qs(`#${containerId}`);
    container.innerHTML = '';
    order.forEach((label) => {
      const selectId = `${prefix}-${label}`;
      const row = Utils.createEl('label', { class: 'challenge-question-row', for: selectId }, [
        Utils.createEl('span', { class: 'challenge-question-row__label', html: label }),
        Utils.createEl('select', { id: selectId, class: 'select select--challenge', dataset: { key: label } })
      ]);
      const select = row.querySelector('select');
      ratioOptions.forEach((val) => select.appendChild(Utils.createEl('option', { value: String(val), html: `${val}%` })));
      container.appendChild(row);
    });
  }

  function readRows(containerId) {
    const result = {};
    Utils.qsa(`#${containerId} select`).forEach((select) => { result[select.dataset.key] = Number(select.value); });
    return result;
  }

  function setRowsDisabled(containerId, disabled) {
    Utils.qsa(`#${containerId} select`).forEach((select) => { select.disabled = disabled; });
  }

  function updateProgressUI() {
    const cs = AppState.challengeState;
    if (!cs || cs.screen !== 'session') return;
    const level = CHALLENGE_LEVELS[cs.levelId];
    Utils.qs('#challenge-progress-badge').textContent = `Tantangan ${cs.questionIndex + 1} dari ${cs.totalQuestions}`;
    Utils.qs('#challenge-score-badge').textContent = `Benar: ${cs.correctCount} · Salah: ${cs.wrongCount}`;
    const levelBadge = Utils.qs('#challenge-level-badge');
    if (levelBadge && level) levelBadge.textContent = `${level.icon} Level ${level.tier} — ${level.name}`;
  }

  // ==========================================================================
  // LEVEL SELECTION (Bagian 5/6/8/9) — masuk ke KONTEKS Challenge TANPA
  // langsung memulai sesi. Dipanggil UIController.goToSimulator() saat mode
  // = 'challenge', DAN ChallengeManager.endSession() (Akhiri Sesi) untuk
  // kembali ke sini TANPA keluar dari konteks Challenge sama sekali.
  // ==========================================================================
  // REVISI (DIHIBRID): `traitId` -> `traitIds`.
  function enterLevelSelection(traitIds) {
    AppState.challengeState = { screen: 'level-select', traitIds, levelId: null };
    Utils.qs('#challenge-panel').hidden = true;
    Utils.qs('#challenge-level-select').hidden = false;
    renderLevelSelect();
    applyContextLocks();
  }

  function renderLevelSelect() {
    const grid = Utils.qs('#challenge-level-grid');
    if (!grid) return;
    grid.innerHTML = '';
    Object.values(CHALLENGE_LEVELS).forEach((level) => {
      const pool = poolFor(level);
      grid.appendChild(
        Utils.createEl(
          'button',
          {
            type: 'button',
            class: 'option-card',
            role: 'radio',
            'aria-checked': 'false',
            'aria-label': `Level ${level.tier}: ${level.name}`,
            onClick: () => selectLevel(level.id)
          },
          [
            Utils.createEl('span', { class: 'option-card__icon', 'aria-hidden': 'true', html: level.icon }),
            Utils.createEl('span', { class: 'option-card__title', html: `Level ${level.tier} — ${level.name}` }),
            Utils.createEl('span', { class: 'option-card__desc', html: level.desc }),
            Utils.createEl('span', { class: 'option-card__short', html: `${Math.min(level.questionsPerSession, pool.length)} tantangan per sesi` }),
            Utils.createEl('span', { class: 'option-card__status is-available', html: '▶ Mulai' })
          ]
        )
      );
    });
  }

  // Mulai SESI baru pada level terpilih — mengambil subset acak dari pool
  // level tersebut (REVISI Bagian 6: Question Replay -> urutan/soal berbeda
  // tiap kali level yang sama dimainkan ulang). REVISI (DIHIBRID): `traitId`
  // -> `traitIds`; pool dipilih via poolFor() sesuai inheritanceType.
  function selectLevel(levelId) {
    const level = CHALLENGE_LEVELS[levelId];
    if (!level) return;
    const cs = AppState.challengeState;
    const traitIds = cs ? cs.traitIds : AppState.traitIds;
    const pool = poolFor(level);
    const sessionSize = Math.min(level.questionsPerSession, pool.length);
    const sessionQuestions = shuffled(pool).slice(0, sessionSize);

    AppState.challengeState = {
      screen: 'session',
      traitIds,
      levelId,
      active: true,
      sessionQuestions,
      phenotypeOrder: phenotypeOrderFor(traitIds),
      questionIndex: 0,
      totalQuestions: sessionQuestions.length,
      correctCount: 0,
      wrongCount: 0,
      currentQuestion: sessionQuestions[0],
      lockedAnswer: null,
      crossPerformed: false, // REVISI 3: cegah cross berulang menggandakan skor untuk 1 locked answer yang sama
      sessionEnded: false,
      // REVISI (Attempt Tracking & Assessment Scoring): state per-soal SAAT
      // INI — direset oleh resetAttemptTracking() setiap kali soal BARU
      // dimulai (bukan saat retry). questionResults mengumpulkan hasil setiap
      // soal yang sudah FINAL (benar, atau salah & retry habis) untuk skor sesi.
      attemptCount: 0,
      firstAttemptCorrect: null,
      retryCount: 0,
      finalCorrect: null,
      resultVisible: false,
      questionResults: []
    };

    Utils.qs('#challenge-level-select').hidden = true;
    applyContextLocks();
    presentQuestion();
    ProgressManager.increment('challengesStarted');
  }

  // REVISI (Attempt Tracking): dipanggil HANYA saat soal BARU dimulai
  // (selectLevel untuk soal pertama, advanceOrFinish untuk soal berikutnya)
  // — SENGAJA TIDAK dipanggil oleh retrySameQuestion(), karena retry harus
  // mempertahankan firstAttemptCorrect/attemptCount/retryCount yang sudah
  // terjadi (Bagian 17/18: "RETRY ≠ NEW QUESTION").
  function resetAttemptTracking() {
    const cs = AppState.challengeState;
    cs.attemptCount = 0;
    cs.firstAttemptCorrect = null;
    cs.retryCount = 0;
    cs.finalCorrect = null;
    cs.resultVisible = false;
  }

  // REVISI (Anti Answer Leak): sembunyikan hasil SECARA NON-DESTRUKTIF —
  // data (AppState.children/punnettSquare/genotypeRatio/phenotypeRatio) TETAP
  // ada, hanya tampilannya yang dikosongkan. Dipakai sebagai default state
  // setelah jawaban salah, dan saat user menekan "🙈 Sembunyikan Hasil".
  function hideResultView() {
    ChildManager.hideView();
    PunnettRenderer.reset(); // reset() PunnettRenderer TIDAK menyentuh AppState — aman dipakai sebagai "hide"
    EducationPanel.reset();
  }

  // REVISI (Anti Answer Leak — Bagian 9 "MODE SHOW RESULT"): render ULANG
  // dari data yang MASIH TERSIMPAN di AppState (bukan hasil baru) — status
  // Challenge TETAP INCORRECT, ini educational feedback, BUKAN koreksi jawaban.
  // REVISI (DIHIBRID): `traitId` -> `traitIds`.
  function showResultView() {
    const state = GameState.getState();
    const { genotypeRatio, phenotypeRatio } = ChildManager.renderAll(state.traitIds);
    PunnettRenderer.render(AppState.punnettSquare, state.traitIds);
    EducationPanel.explainCrossResult({
      parent1: state.parent1,
      parent2: state.parent2,
      traitIds: state.traitIds,
      punnettResult: AppState.punnettSquare,
      genotypeRatio,
      phenotypeRatio
    });
  }

  // REVISI (Scoring Policy — Bagian 3): score question ini berdasarkan
  // scoringPolicy level yang bersangkutan, BUKAN hardcode. `correct` = hasil
  // FINAL (attempt terakhir yang dinilai), `firstAttemptCorrect` menentukan
  // apakah dianggap "first attempt" atau "retry attempt".
  function computeScore(level, cs, correct) {
    const policy = level.retryPolicy.scoring;
    if (!correct) return policy.failed;
    if (cs.firstAttemptCorrect) return policy.firstAttempt;
    // Retry berhasil: pakai retryAttempt kalau policy level ini menyediakannya
    // (Level 3/Assessment tidak punya retryAttempt karena retry tidak pernah
    // diizinkan sampai titik ini — firstAttemptCorrect pasti true kalau correct).
    return policy.retryAttempt != null ? policy.retryAttempt : policy.firstAttempt;
  }

  // REVISI (DIHIBRID): `cs.traitId` -> `cs.traitIds`; prompt & opsi rasio
  // (renderRows) sekarang dihitung lewat genotypeOrderFor/ratioOptionsFor
  // berdasarkan jumlah sel Punnett aktual (4 utk Monohibrid, 16 utk Dihibrid).
  function presentQuestion() {
    const cs = AppState.challengeState;
    const q = cs.currentQuestion;
    cs.crossPerformed = false; // REVISI 3: soal baru (retry/lanjut) -> reset gerbang cross
    cs.resultVisible = false; // REVISI (Anti Answer Leak): attempt baru SELALU mulai dari hasil tersembunyi

    // REVISI 3 (Prevent Information Leak / TEST 11): bersihkan SELURUH hasil
    // dari soal/attempt sebelumnya — Punnett, kartu anak, rasio, penjelasan —
    // supaya soal/attempt baru benar-benar mulai dari kondisi bersih, tidak
    // membocorkan jawaban lewat sisa hasil sebelumnya. INI RESET DESTRUKTIF
    // (data ikut terhapus) — beda dari hideResultView() yang non-destruktif.
    ChildManager.reset();
    PunnettRenderer.reset();
    EducationPanel.reset();

    const totalCells = 4 ** cs.traitIds.length; // 4^1=4 (2x2), 4^2=16 (4x4)
    const ratioOptions = ratioOptionsFor(totalCells);
    renderRows('challenge-genotype-rows', genotypeOrderFor(cs.traitIds), 'challenge-geno', ratioOptions);
    renderRows('challenge-phenotype-rows', cs.phenotypeOrder, 'challenge-pheno', ratioOptions);

    const p1Traits = traitsFromQuestionParent(q.parent1, cs.traitIds);
    const p2Traits = traitsFromQuestionParent(q.parent2, cs.traitIds);
    Utils.qs('#challenge-prompt').textContent = `Silangkan: ${Utils.genotypeCode(p1Traits, cs.traitIds)} × ${Utils.genotypeCode(p2Traits, cs.traitIds)}`;
    setRowsDisabled('challenge-genotype-rows', false);
    setRowsDisabled('challenge-phenotype-rows', false);
    Utils.qs('#btn-challenge-submit').disabled = false;
    Utils.qs('#btn-challenge-submit').textContent = 'Kunci Jawaban';
    Utils.qs('#challenge-feedback').hidden = true;
    Utils.qs('#challenge-final-result').hidden = true;
    Utils.qs('#challenge-panel').hidden = false;
    applyContextLocks();
    updateProgressUI();
    updateLockHintUI();

    // REVISI: parent diisi lewat placeGenotypeSilent (melewati konfirmasi
    // "Ganti Parent") KARENA ini objective yang WAJIB, bukan pilihan bebas
    // user — konsisten dengan freeExploration:false di MODE_CONFIG. Tombol
    // Silangkan TETAP terkunci walau parent sudah terisi (lihat canCrossNow()
    // di bawah) — pengisian parent BUKAN berarti persilangan boleh dilakukan.
    const p1 = { id: Utils.uid('challenge'), traits: p1Traits };
    const p2 = { id: Utils.uid('challenge'), traits: p2Traits };
    ParentManager.placeGenotypeSilent('parent1', p1);
    ParentManager.placeGenotypeSilent('parent2', p2);
  }

  // REVISI 3 — STATE MACHINE: QUESTION -> ANSWER_SELECTION -> ANSWER_LOCKED
  // -> CROSSING_UNLOCKED. `lockedAnswer` (null/objek) SUDAH cukup sebagai
  // indikator lock — tidak perlu boolean terpisah yang bisa desync.
  function isAnswerLocked() {
    return Boolean(AppState.challengeState && AppState.challengeState.lockedAnswer);
  }

  // LAYER LOGIC (bukan cuma UI disabled) — dipanggil dari UIController
  // sebagai bagian dari canPerformCross() gabungan. Kalau tidak ada Challenge
  // aktif (termasuk saat Level Selection), tidak boleh cross sama sekali.
  // Mode lain (Learning/Free) tidak terpengaruh karena isInChallengeContext()
  // mengembalikan false saat tidak ada Challenge (Mode Isolation, TEST 12).
  function canCrossNow() {
    if (!isInChallengeContext()) return true;
    if (!isActive()) return false; // Level Selection -> belum ada soal untuk disilangkan
    const cs = AppState.challengeState;
    return Boolean(cs.lockedAnswer) && !cs.crossPerformed;
  }

  function updateLockHintUI() {
    const hint = Utils.qs('#challenge-lock-hint');
    if (!hint) return;
    if (isAnswerLocked()) {
      hint.textContent = '🔓 Persilangan tersedia — silakan tekan Silangkan di atas.';
      hint.className = 'challenge-lock-hint is-unlocked';
    } else {
      hint.textContent = '🔒 Silakan pilih jawaban lalu kunci jawaban sebelum melakukan persilangan.';
      hint.className = 'challenge-lock-hint is-locked';
    }
  }

  function lockAnswer() {
    if (!isActive()) return;
    AppState.challengeState.lockedAnswer = {
      genotype: readRows('challenge-genotype-rows'),
      phenotype: readRows('challenge-phenotype-rows')
    };
    setRowsDisabled('challenge-genotype-rows', true);
    setRowsDisabled('challenge-phenotype-rows', true);
    const submitBtn = Utils.qs('#btn-challenge-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = '✓ Jawaban Dikunci';
    updateLockHintUI();
    // REVISI 3 — STATE: ANSWER_LOCKED -> CROSSING_UNLOCKED. Parent tidak
    // berubah di sini (sudah terisi sejak presentQuestion), jadi event
    // 'parent:changed' tidak akan terpicu ulang — tombol Silangkan HARUS
    // di-refresh eksplisit di sini lewat event supaya UIController
    // (pemilik canPerformCross()) bisa mengevaluasi ulang.
    EventBus.emit('challenge:answerLocked');
    const announcer = Utils.qs('#sr-announcer');
    if (announcer) announcer.textContent = 'Jawaban dikunci. Persilangan sekarang tersedia — tekan Silangkan untuk melihat hasilnya.';
    // REVISI (Bagian 11 — Action History vs Result History): entri NETRAL,
    // tidak menyebut angka/rasio apa pun.
    EventBus.emit('state:mutated', { activity: 'Jawaban tantangan dikunci.' });
  }

  // REVISI (Fix "Akhiri Sesi" -> Sandbox, Bagian 8): "Akhiri Sesi" TIDAK LAGI
  // keluar total dari Challenge — hanya mengakhiri SESSION yang sedang
  // berjalan dan mengembalikan user ke Challenge Level Selection (konteks
  // Challenge TETAP dipertahankan: parent masih terkunci, mode masih
  // 'challenge'). Ini BUKAN skip: challengesCompleted TIDAK bertambah untuk
  // sesi yang belum tuntas.
  function endSession() {
    if (!isInChallengeContext()) return;
    const traitIds = AppState.challengeState.traitIds;
    enterLevelSelection(traitIds);
  }

  // REVISI: keluar TOTAL dari konteks Challenge — dipakai saat pindah
  // mode/spesies (goToSimulator) atau kembali ke Main Menu. SAMA PERSIS
  // perilaku exitSession() versi lama (satu-satunya jalur yang benar-benar
  // menghapus AppState.challengeState).
  function exitContext() {
    AppState.challengeState = null;
    Utils.qs('#challenge-panel').hidden = true;
    Utils.qs('#challenge-level-select').hidden = true;
    applyContextLocks();
  }

  // REVISI (No Information Leak, Bagian 7/9): dipanggil gradeIfActive() SAAT
  // jawaban SALAH — menghapus record persilangan percobaan yang salah dari
  // Generation History/Timeline/Tree SEGERA, supaya tidak bisa dipakai untuk
  // mengintip jawaban benar sebelum retry. Live workspace (Punnett/kartu
  // anak yang SEDANG tampil di layar) TIDAK disentuh di sini — itu baru
  // dibersihkan saat user benar-benar menekan "Coba Lagi" (presentQuestion()),
  // supaya user masih bisa meninjau kesalahannya sebelum mencoba lagi.
  function purgeWrongAttemptRecord() {
    AppState.currentGeneration = Math.max(0, AppState.currentGeneration - 1);
    HistoryManager.removeLastRecord();
    GenerationTimeline.setActiveLatest();
    const badge = Utils.qs('#generation-badge');
    if (badge) {
      if (AppState.currentGeneration > 0) {
        badge.textContent = `Generasi ke-${AppState.currentGeneration}`;
        badge.hidden = false;
      } else {
        badge.hidden = true;
      }
    }
  }

  // Dipanggil UIController.handleCross setelah hasil aktual didapat.
  //
  // REVISI (Anti Answer Leak / Attempt Tracking / Level-based Scoring):
  // sebelumnya fungsi ini SELALU menampilkan "Coba Lagi" tanpa batas dan
  // membiarkan hasil (yang sudah di-render duluan oleh UIController.handleCross
  // SEBELUM grading ini berjalan) tetap terlihat apa adanya. Sekarang:
  //   1. attemptCount/firstAttemptCorrect/retryCount dicatat (Bagian 18/19).
  //   2. Retry hanya ditawarkan sesuai retryPolicy.maxRetries level ybs.
  //   3. Default hasil SETELAH SALAH = disembunyikan (hideResultView()) —
  //      Level 3 (Assessment) TIDAK PERNAH menampilkan hasil sama sekali.
  //   4. Question baru dianggap FINAL (correct, atau salah & retry habis)
  //      -> skor dihitung lewat computeScore() dan dicatat ke questionResults.
  // REVISI (DIHIBRID): `traitId` -> `traitIds`; `GENOTYPE_ORDER` konstan ->
  // `genotypeOrderFor(traitIds)`.
  function gradeIfActive(genotypeRatio, phenotypeRatio, traitIds) {
    if (!isActive() || !AppState.challengeState.lockedAnswer || AppState.challengeState.crossPerformed) return null;
    const cs = AppState.challengeState;
    cs.crossPerformed = true; // REVISI 3: tandai SEBELUM proses grading -> cegah re-entry menggandakan skor
    cs.attemptCount += 1;

    const expected = computeExpected(cs.currentQuestion, traitIds);
    const phenotypeOrder = cs.phenotypeOrder || phenotypeOrderFor(traitIds);
    const genoCorrect = genotypeOrderFor(traitIds).every((k) => cs.lockedAnswer.genotype[k] === expected.genotype[k]);
    const phenoCorrect = phenotypeOrder.every((k) => cs.lockedAnswer.phenotype[k] === expected.phenotype[k]);
    const correct = genoCorrect && phenoCorrect;

    // REVISI (Bagian 18 — Attempt Lifecycle): first attempt TIDAK PERNAH
    // ditimpa oleh hasil retry berikutnya.
    if (cs.attemptCount === 1) cs.firstAttemptCorrect = correct;

    const level = CHALLENGE_LEVELS[cs.levelId];
    const retryAllowed = !correct && cs.retryCount < level.retryPolicy.maxRetries;
    const finalized = correct || !retryAllowed;

    // REVISI (Fix Level 3 History Leak — Audit Root Cause): kondisi ini
    // SEBELUMNYA hanya `if (!correct)`, sehingga HANYA berlaku simetris
    // dengan kondisi hideResultView() untuk live view (yang sudah benar
    // memakai `!correct || level.tier === 3`) — akibatnya cross Level 3
    // yang BENAR tetap tercatat penuh (dengan resultSummary rasio konkret)
    // di Generation History/Timeline/Tree, walau live view-nya sudah
    // disembunyikan. Level 3 (Assessment) didesain TIDAK PERNAH menampilkan
    // hasil di mana pun — benar maupun salah — karena mengukur reasoning,
    // bukan review hasil (lihat CHALLENGE_LEVELS.level3 & hideResultView di
    // bawah). Disamakan dengan kondisi hideResultView() supaya catatan
    // History/Timeline/Tree ikut bersih untuk SETIAP cross Level 3.
    if (!correct || level.tier === 3) {
      // REVISI (No Information Leak): buang record persilangan SEKARANG,
      // sebelum user sempat membuka tab Timeline/Tree.
      purgeWrongAttemptRecord();
    }

    // REVISI (Anti Answer Leak, Bagian 7/8): default HIDDEN setelah salah.
    // Level 3 (Assessment) tidak pernah menampilkan hasil — bahkan saat
    // BENAR — karena assessment mengukur reasoning, bukan review hasil.
    if (!correct || level.tier === 3) {
      hideResultView();
      cs.resultVisible = false;
    }

    if (finalized) {
      cs.finalCorrect = correct;
      const score = computeScore(level, cs, correct);
      cs.questionResults.push({
        questionId: cs.currentQuestion.id,
        firstAttemptCorrect: cs.firstAttemptCorrect,
        finalCorrect: correct,
        attemptCount: cs.attemptCount,
        score
      });
      if (correct) { cs.correctCount += 1; ProgressManager.increment('challengesCompleted'); } else { cs.wrongCount += 1; }
    }
    updateProgressUI();

    const feedbackEl = Utils.qs('#challenge-feedback');
    feedbackEl.hidden = false;
    feedbackEl.className = `challenge-feedback ${correct ? 'is-correct' : 'is-incorrect'}`;
    feedbackEl.innerHTML = '';

    // REVISI (Bagian 6/10 — neutral feedback, TIDAK menyebut hasil konkret
    // selama status masih bisa retry / masih dalam assessment).
    let verdictText;
    if (correct) {
      verdictText = level.tier === 3
        ? '✓ Jawaban benar. Dicatat.'
        : '✓ Benar! Prediksimu sesuai dengan hasil persilangan.';
    } else if (retryAllowed) {
      verdictText = '❌ Jawaban belum tepat. Periksa kembali konsep yang digunakan pada persilangan, lalu coba lagi.';
    } else {
      verdictText = '❌ Jawaban belum tepat. Jawaban telah dicatat.';
    }
    feedbackEl.appendChild(Utils.createEl('p', { class: 'challenge-feedback__verdict', html: verdictText }));

    if (!correct && level.tier === 2) {
      const remaining = Math.max(0, level.retryPolicy.maxRetries - cs.retryCount);
      feedbackEl.appendChild(Utils.createEl('p', {
        class: 'challenge-feedback__meta',
        html: retryAllowed ? `Kesempatan retry tersisa: ${remaining}.` : 'Kesempatan retry untuk soal ini sudah habis.'
      }));
    }

    // REVISI (Bagian 9 — Mode Show Result): opsi lihat/sembunyikan hasil
    // ditawarkan untuk SEMUA level KECUALI Level 3 (Assessment murni, tidak
    // pernah menampilkan hasil apa pun — lihat komentar di atas). Ini berlaku
    // juga untuk kasus retry sudah habis (finalized-wrong) — user tidak lagi
    // bisa mengubah jawaban di titik itu, jadi meninjau hasil sebagai
    // educational feedback tidak lagi berisiko membocorkan jawaban.
    if (level.tier !== 3) {
      const toggleBtn = Utils.createEl('button', {
        type: 'button',
        class: 'btn btn--ghost btn--small challenge-feedback__toggle-result',
        html: cs.resultVisible ? '🙈 Sembunyikan Hasil' : '👁 Tampilkan Hasil'
      });
      toggleBtn.addEventListener('click', () => {
        if (cs.resultVisible) {
          hideResultView();
          cs.resultVisible = false;
          toggleBtn.textContent = '👁 Tampilkan Hasil';
        } else {
          showResultView();
          cs.resultVisible = true;
          toggleBtn.textContent = '🙈 Sembunyikan Hasil';
        }
      });
      // Kalau BENAR, hasil SUDAH terlihat (di-render duluan oleh handleCross,
      // tidak pernah disembunyikan) -> tombol awal harus bilang "Sembunyikan".
      if (correct) { cs.resultVisible = true; toggleBtn.textContent = '🙈 Sembunyikan Hasil'; }
      feedbackEl.appendChild(toggleBtn);
    }

    const actionBtn = Utils.createEl('button', {
      type: 'button',
      class: 'btn btn--primary btn--small challenge-feedback__next',
      html: !finalized
        ? '🔄 Coba Lagi'
        : (cs.questionIndex + 1 < cs.totalQuestions ? (correct ? 'Tantangan Berikutnya' : 'Soal Berikutnya') : 'Lihat Hasil Akhir'),
      onClick: () => (!finalized ? retrySameQuestion() : advanceOrFinish())
    });
    feedbackEl.appendChild(actionBtn);

    // REVISI (Bagian 11 — Action History netral, tanpa angka/rasio).
    EventBus.emit('state:mutated', { activity: correct ? 'Percobaan tantangan selesai — jawaban benar.' : 'Percobaan tantangan selesai — jawaban belum tepat.' });

    return { correct };
  }

  // REVISI (Fix Challenge Reset): dipanggil dari UIController.handleReset()
  // saat Challenge SEDANG AKTIF. BERBEDA dari endSession()/exitContext() —
  // ini TIDAK menghapus Challenge Definition (currentQuestion/questionIndex/
  // skor/traitId/levelId tetap ada), hanya mengulang UPAYA saat ini untuk
  // soal yang SAMA: parent diisi ulang sesuai objective, children/Punnett
  // dikosongkan, dan Answer Lock kembali ke UNLOCKED (lockedAnswer=null)
  // sehingga user harus memilih & mengunci jawaban lagi sebelum "Silangkan".
  // TIDAK menyentuh attemptCount/firstAttemptCorrect/retryCount — ini bukan
  // "percobaan baru", hanya mengulang upaya YANG SAMA sebelum sempat dinilai.
  //
  // REVISI (Fix Reset-Bypass — Audit Root Cause): tombol "Reset Simulasi"
  // ini bersifat GLOBAL dan sebelumnya bisa dipakai KAPAN SAJA selama
  // isActive() true — termasuk SETELAH soal saat ini sudah FINALIZED
  // (cs.finalCorrect sudah terisi: jawaban benar, ATAU salah & retry sudah
  // habis). Karena presentQuestion() yang dipanggil di sini membuka lagi
  // Answer Lock & mengizinkan cross baru TANPA memeriksa status finalized
  // itu, tombol ini bisa dipakai sebagai jalan pintas untuk MENG-GRADE ULANG
  // soal yang seharusnya sudah selesai dinilai (menembus retryPolicy). Untuk
  // Level 3 (Assessment, maxRetries:0) ini bahkan bisa membalikkan skor 0
  // (salah) menjadi 100 di attempt berikutnya — computeScore() menganggap
  // attempt itu "retry" (firstAttemptCorrect sudah false) dan policy Level 3
  // tidak mendefinisikan retryAttempt, sehingga fallback ke firstAttempt
  // (100). Ini JUGA mendorong ENTRY KEDUA ke cs.questionResults untuk soal
  // yang sama (finalized dua kali), merusak correctCount & rata-rata skor
  // sesi. Untuk Level 2 (maxRetries:1), tombol ini juga jadi celah retry
  // TANPA BATAS karena (berbeda dari retrySameQuestion()) TIDAK menambah
  // retryCount — retry budget tidak pernah habis selama user memakai tombol
  // ini, bukan "Coba Lagi".
  //
  // PERBAIKAN (root cause, bukan tambal UI): (1) begitu soal sudah
  // finalized, Reset Simulasi tidak boleh membuka lagi gerbang grading untuk
  // soal itu — satu-satunya jalan maju adalah tombol "Soal Berikutnya"/
  // "Lihat Hasil Akhir" di feedback panel. (2) kalau upaya SEBELUMNYA sudah
  // di-cross dan dinyatakan SALAH tapi BELUM finalized (retry masih
  // tersedia — satu-satunya kondisi crossPerformed=true & finalCorrect=null
  // yang mungkin terjadi, lihat gradeIfActive), maka menekan Reset Simulasi
  // di titik ini SETARA dengan menekan "Coba Lagi" — retryCount HARUS
  // bertambah juga di sini, supaya retryPolicy.maxRetries tetap ditegakkan
  // apa pun tombol yang dipakai user untuk mengulang upaya yang gagal.
  function resetProgress() {
    if (!isActive()) return;
    const cs = AppState.challengeState;
    if (cs.finalCorrect !== null) return; // soal sudah selesai dinilai — gunakan tombol lanjut pada feedback panel
    if (cs.crossPerformed) cs.retryCount += 1; // mengulang upaya salah-belum-final = setara "Coba Lagi"
    cs.lockedAnswer = null;
    presentQuestion();
  }

  // REVISI (No Information Leak / Clean Retry, Bagian 12/13): dipanggil dari
  // tombol "🔄 Coba Lagi". Record HistoryManager percobaan yang salah SUDAH
  // dihapus sebelumnya di gradeIfActive() (purgeWrongAttemptRecord) — fungsi
  // ini membersihkan WORKSPACE LIVE (lewat presentQuestion(), reset destruktif)
  // supaya soal yang SAMA dimulai dari kondisi bersih, DAN mencatat retryCount
  // bertambah (Bagian 18: attempt lifecycle). Question/level/objective/session
  // TIDAK berubah (Bagian 17) — hanya presentQuestion() yang dipanggil ulang,
  // BUKAN selectLevel()/resetAttemptTracking().
  function retrySameQuestion() {
    const cs = AppState.challengeState;
    cs.retryCount += 1;
    cs.lockedAnswer = null;
    EventBus.emit('state:mutated', { activity: 'Percobaan diulang untuk tantangan yang sama.' });
    presentQuestion();
  }

  function advanceOrFinish() {
    const cs = AppState.challengeState;
    if (cs.questionIndex + 1 < cs.totalQuestions) {
      cs.questionIndex += 1;
      cs.currentQuestion = cs.sessionQuestions[cs.questionIndex];
      cs.lockedAnswer = null;
      resetAttemptTracking(); // REVISI (Bagian 18): soal BARU -> attempt tracking mulai dari nol
      EventBus.emit('state:mutated', { activity: 'Lanjut ke tantangan berikutnya.' });
      presentQuestion();
    } else {
      finishSession();
    }
  }

  function finishSession() {
    const cs = AppState.challengeState;
    cs.active = false;
    cs.sessionEnded = true;
    applyContextLocks();
    const accuracy = Math.round((cs.correctCount / cs.totalQuestions) * 100);
    // REVISI (Scoring — Bagian 3/5/29): skor sesi = rata-rata score per soal
    // (mengikuti scoringPolicy level, BUKAN sekadar correctCount/total) —
    // supaya retry-adjusted score pada Level 1/2 benar-benar tercermin.
    const avgScore = cs.questionResults.length
      ? Math.round(cs.questionResults.reduce((sum, r) => sum + r.score, 0) / cs.questionResults.length)
      : 0;
    const level = CHALLENGE_LEVELS[cs.levelId];
    Utils.qs('#challenge-panel').hidden = false;
    Utils.qs('#challenge-feedback').hidden = true;
    Utils.qs('#challenge-final-result').hidden = false;
    Utils.qs('#challenge-final-summary').textContent =
      `Level ${level.tier} — ${level.name}: ${cs.correctCount} / ${cs.totalQuestions} benar (${accuracy}%). Skor sesi (mengikuti kebijakan retry level ini): ${avgScore}. Sesi tantangan telah selesai.`;
    EventBus.emit('state:mutated', { activity: `Sesi tantangan Level ${level.tier} selesai — skor ${avgScore}.` });
  }

  // REVISI (Bagian 6: Challenge dapat dimainkan kembali) — dipanggil tombol
  // "Kembali ke Pilihan Level" di layar hasil akhir sesi. TIDAK menghapus
  // konteks Challenge, hanya kembali ke Level Selection supaya user bisa
  // memilih level yang sama (soal akan diacak ulang) atau level lain.
  function backToLevelSelect() {
    if (!isInChallengeContext()) return;
    enterLevelSelection(AppState.challengeState.traitIds);
  }

  function init() {
    Utils.qs('#btn-challenge-submit').addEventListener('click', lockAnswer);
    Utils.qs('#btn-challenge-back-to-levels').addEventListener('click', backToLevelSelect);
    // Tombol "Akhiri Sesi" dibind di UIController (perlu ConfirmDialog lintas modul)
  }

  return {
    init,
    enterLevelSelection,
    selectLevel,
    backToLevelSelect,
    endSession,
    exitContext,
    resetProgress,
    gradeIfActive,
    isActive,
    isInChallengeContext,
    isLevelSelecting,
    isGenotypeAllowedForSlot,
    isAnswerLocked,
    canCrossNow
  };
})();


/* ==========================================================================
   12f. PROGRESS MANAGER (REVISI 19) — counter belajar. SENGAJA punya
   siklus hidup & penyimpanan TERPISAH dari SessionStorage: progress belajar
   harus tetap ada walau user menekan Reset Simulasi atau ganti spesies.
   ========================================================================== */
const ProgressManager = (() => {
  const KEY = 'mendel-simulator-progress-v1';
  const defaults = {
    totalSimulasi: 0,
    totalPersilangan: 0,
    challengesStarted: 0,
    challengesCompleted: 0,
    generasiTertinggi: 0,
    materiDipelajari: []
  };
  let data = { ...defaults };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      data = raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
    } catch (e) {
      data = { ...defaults };
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      /* autosave progres bukan fitur kritis */
    }
  }

  function increment(key, amount = 1) {
    data[key] = (data[key] || 0) + amount;
    save();
    EventBus.emit('progress:updated', data);
  }

  function noteGeneration(count) {
    if (count > data.generasiTertinggi) {
      data.generasiTertinggi = count;
      save();
      EventBus.emit('progress:updated', data);
    }
  }

  function noteTopic(topicLabel) {
    if (!data.materiDipelajari.includes(topicLabel)) {
      data.materiDipelajari.push(topicLabel);
      save();
      EventBus.emit('progress:updated', data);
    }
  }

  function getData() {
    return { ...data };
  }

  function init() {
    load();
  }

  return { init, increment, noteGeneration, noteTopic, getData };
})();

/* ==========================================================================
   12g. DASHBOARD MANAGER (REVISI 19) — render ProgressManager ke modal
   ========================================================================== */
const DashboardManager = (() => {
  function render(data) {
    const grid = Utils.qs('#dashboard-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const stats = [
      { value: data.totalSimulasi, label: 'Sesi Simulasi' },
      { value: data.totalPersilangan, label: 'Total Persilangan' },
      { value: `${data.challengesCompleted}/${data.challengesStarted}`, label: 'Tantangan Selesai' },
      { value: data.generasiTertinggi, label: 'Generasi Tertinggi' }
    ];
    stats.forEach((s) => {
      grid.appendChild(
        Utils.createEl('div', { class: 'dashboard-stat' }, [
          Utils.createEl('span', { class: 'dashboard-stat__value', html: String(s.value) }),
          Utils.createEl('span', { class: 'dashboard-stat__label', html: s.label })
        ])
      );
    });

    const topicsList = Utils.qs('#dashboard-topics-list');
    topicsList.innerHTML = '';
    if (!data.materiDipelajari.length) {
      topicsList.appendChild(Utils.createEl('li', { html: 'Belum ada materi yang dipelajari.' }));
    } else {
      data.materiDipelajari.forEach((topic) => {
        topicsList.appendChild(Utils.createEl('li', { html: `✅ ${topic}` }));
      });
    }
  }

  function open() {
    render(ProgressManager.getData());
    Utils.qs('#dashboard-modal').hidden = false;
    Utils.qs('#btn-close-dashboard').focus();
  }

  function close() {
    Utils.qs('#dashboard-modal').hidden = true;
  }

  function init() {
    Utils.qs('#btn-open-dashboard').addEventListener('click', open);
    Utils.qs('#btn-close-dashboard').addEventListener('click', close);
    Utils.qs('#dashboard-modal').addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
    EventBus.on('progress:updated', (data) => {
      if (!Utils.qs('#dashboard-modal').hidden) render(data);
    });
  }

  return { init, open, close };
})();

/* ==========================================================================
   12h. SUMMARY GENERATOR (REVISI 20) — ringkasan akademik per generasi,
   dibangun di atas ExplanationEngine (level SMA) + data rasio yang sudah ada.
   ========================================================================== */
const SummaryGenerator = (() => {
  // REVISI (DIHIBRID): `traitId` -> `traitIds`.
  function generate({ parent1, parent2, traitIds, genotypeRatio, phenotypeRatio }) {
    const p1 = Utils.genotypeCode(parent1.traits, traitIds);
    const p2 = Utils.genotypeCode(parent2.traits, traitIds);
    const genoStr = genotypeRatio.map((r) => `${r.label} ${r.percent}%`).join(', ');
    const phenoStr = phenotypeRatio.map((r) => `${r.label} ${r.percent}%`).join(', ');

    let conclusion;
    if (phenotypeRatio.length === 1) {
      conclusion = `Persilangan ini menghasilkan seluruh keturunan berfenotipe ${phenotypeRatio[0].label} karena seluruh kombinasi genotipe yang terbentuk memiliki susunan alel yang sama secara fungsional terhadap ekspresi sifat ini.`;
    } else {
      const dominantEntry = phenotypeRatio.find((r) => r.label !== phenotypeRatio.reduce((a, b) => (a.count < b.count ? a : b)).label) || phenotypeRatio[0];
      conclusion = `Variasi fenotipe pada keturunan terjadi karena kombinasi gamet dari kedua induk menghasilkan lebih dari satu susunan genotipe, dengan sebagian membawa alel dominan (tampil sebagai fenotipe ${dominantEntry.label}) dan sebagian lain bersifat homozigot resesif.`;
    }

    return `Persilangan antara induk bergenotipe ${p1} dan ${p2} menghasilkan keturunan dengan rasio genotipe ${genoStr}, serta rasio fenotipe ${phenoStr}. ${conclusion}`;
  }

  return { generate };
})();

/* ==========================================================================
   13. DRAG & DROP — mouse/touch (native) + klik/keyboard (alternatif)
   ========================================================================== */
const DragDrop = (() => {
  let draggedGenotype = null;
  let draggedFromSlot = null;

  // selectedEl murni referensi DOM (presentation-layer) — TIDAK masuk AppState.
  // Data seleksi sesungguhnya (genotype + slot asal) disimpan di
  // AppState.selectedChild / AppState.selectedParentSlot sesuai skema STATE
  // MANAGEMENT yang diminta, supaya "siapa yang sedang dipilih" bukan cuma
  // hidup di closure privat modul ini.
  let selectedEl = null;

  function clearSelection() {
    if (selectedEl) {
      selectedEl.classList.remove('is-selected');
      selectedEl.setAttribute('aria-pressed', 'false');
    }
    AppState.selectedChild = null;
    AppState.selectedParentSlot = null;
    selectedEl = null;
    Utils.qsa('.drop-slot__content[tabindex]').forEach((el) => el.classList.remove('is-placeable'));
    EventBus.emit('selection:changed', { active: false, genotype: null });
  }

  function announce(text) {
    const el = Utils.qs('#sr-announcer');
    if (el) el.textContent = text;
  }

  function placeSelection(slotKey) {
    if (!AppState.selectedChild) return;
    const genotype = AppState.selectedChild;
    const fromSlot = AppState.selectedParentSlot;
    ParentManager.placeGenotype(slotKey, genotype);
    if (fromSlot && fromSlot !== slotKey) {
      GameState.clearParent(fromSlot);
    }
    clearSelection();
  }

  function attachSlotHandlers() {
    ['parent1', 'parent2'].forEach((slotKey) => {
      const dropEl = Utils.qs(`#content-${slotKey}`);

      dropEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropEl.classList.add('is-dragover');
      });
      dropEl.addEventListener('dragleave', () => dropEl.classList.remove('is-dragover'));
      dropEl.addEventListener('drop', (e) => {
        e.preventDefault();
        dropEl.classList.remove('is-dragover');

        // REVISI 10: hanya terima genotype card yang valid (ditandai lewat draggedGenotype)
        if (!draggedGenotype) {
          Animation.shake(dropEl);
          return;
        }

        ParentManager.placeGenotype(slotKey, draggedGenotype);
        if (draggedFromSlot && draggedFromSlot !== slotKey) {
          GameState.clearParent(draggedFromSlot);
        }
        draggedGenotype = null;
        draggedFromSlot = null;
      });

      dropEl.addEventListener('click', () => {
        if (AppState.selectedChild) placeSelection(slotKey);
      });
      dropEl.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && AppState.selectedChild) {
          e.preventDefault();
          placeSelection(slotKey);
        }
      });
    });
  }

  function init() {
    attachSlotHandlers();

    EventBus.on('dnd:dragstart', ({ event, genotype, sourceSlot, el }) => {
      draggedGenotype = genotype;
      draggedFromSlot = sourceSlot || null;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', genotype.id);
      if (el) el.classList.add('is-dragging');
    });

    EventBus.on('dnd:dragend', ({ el }) => {
      if (el) el.classList.remove('is-dragging');
    });

    EventBus.on('kbd:toggleSelect', ({ el, genotype, sourceSlot }) => {
      const isSameItem = selectedEl === el;
      clearSelection();
      if (isSameItem) return;

      AppState.selectedChild = genotype;
      AppState.selectedParentSlot = sourceSlot || null;
      selectedEl = el;
      el.classList.add('is-selected');
      el.setAttribute('aria-pressed', 'true');
      Utils.qsa('.drop-slot__content[tabindex]').forEach((target) => target.classList.add('is-placeable'));
      const traitIds = GameState.getState().traitIds;
      announce(`Genotipe ${Utils.genotypeCode(genotype.traits, traitIds)} dipilih. Pindah ke slot Induk 1 atau Induk 2, lalu tekan Enter untuk menempatkan.`);
      // REVISI 13: Selection Mode — beri tahu SelectionToolbar agar tombol
      // "Jadikan Induk 1/2" muncul sebagai alternatif touch-friendly dari drag-drop.
      EventBus.emit('selection:changed', { active: true, genotype });
    });

    EventBus.on('parent:changed', clearSelection);
  }

  return { init, placeSelection };
})();

/* ==========================================================================
   13b. SELECTION TOOLBAR (REVISI 13) — alternatif eksplisit dari drag-drop,
   khusus untuk kenyamanan mobile/touch. Tidak menggantikan drag-drop maupun
   pola "pilih lalu tekan Enter di slot" yang sudah ada — murni tambahan.
   ========================================================================== */
const SelectionToolbar = (() => {
  function init() {
    EventBus.on('selection:changed', ({ active, genotype }) => {
      const bar = Utils.qs('#selection-toolbar');
      if (!bar) return;
      bar.hidden = !active;
      if (active) {
        const traitIds = GameState.getState().traitIds;
        Utils.qs('#selection-toolbar__text').textContent =
          `Genotipe ${Utils.genotypeCode(genotype.traits, traitIds)} dipilih:`;
      }
    });

    Utils.qs('#btn-select-parent1').addEventListener('click', () => DragDrop.placeSelection('parent1'));
    Utils.qs('#btn-select-parent2').addEventListener('click', () => DragDrop.placeSelection('parent2'));
  }

  return { init };
})();

/* ==========================================================================
   13c. ACTIVITY LOG (REVISI 14) — riwayat aktivitas dengan timestamp.
   Reaktif terhadap event 'state:mutated' yang dipancarkan aksi apa pun
   (isi/hapus parent, cross, reset, undo, redo) — tidak perlu tahu detail
   internal aksi tersebut, cukup terima teks deskripsinya.
   ========================================================================== */
const ActivityLog = (() => {
  const MAX_ENTRIES = 50;

  function timeNow() {
    return new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }

  function log(text) {
    if (!text) return;
    AppState.activityHistory.push({ id: Utils.uid('activity'), time: timeNow(), text });
    if (AppState.activityHistory.length > MAX_ENTRIES) AppState.activityHistory.shift();
    render();
  }

  function render() {
    const list = Utils.qs('#activity-log-list');
    const emptyText = Utils.qs('#activity-log-empty');
    if (!list) return;
    list.innerHTML = '';
    if (emptyText) emptyText.hidden = AppState.activityHistory.length > 0;

    [...AppState.activityHistory].reverse().forEach((entry) => {
      list.appendChild(
        Utils.createEl('li', { class: 'activity-log-item' }, [
          Utils.createEl('span', { class: 'activity-log-item__time', html: entry.time }),
          Utils.createEl('span', { class: 'activity-log-item__text', html: entry.text })
        ])
      );
    });
  }

  function reset() {
    AppState.activityHistory = [];
    render();
  }

  function init() {
    EventBus.on('state:mutated', ({ activity } = {}) => log(activity));
  }

  return { init, reset };
})();

/* ==========================================================================
   13d. SESSION STORAGE (REVISI 14) — autosave ke localStorage, dengan debounce
   supaya tidak menulis disk pada setiap keystroke/klik beruntun.
   ========================================================================== */
const SessionStorage = (() => {
  const KEY = 'mendel-simulator-session-v1';
  let saveTimer = null;

  function scheduleSave(snapshot) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(snapshot));
      } catch (e) {
        // localStorage penuh/nonaktif (mis. mode private browsing) —
        // autosave bukan fitur kritis, gagal diam-diam saja.
      }
    }, 400);
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function clear() {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {
      /* no-op */
    }
  }

  return { scheduleSave, load, clear };
})();

/* ==========================================================================
   13e. UNDO/REDO MANAGER (REVISI 14) — snapshot-based, generik lewat
   dependency injection (capture/apply). Lihat Tahap 1 untuk alasan memilih
   pendekatan snapshot dibanding command-pattern penuh.
   ========================================================================== */
const UndoRedoManager = (() => {
  let captureFn = () => null;
  let applyFn = () => {};
  const MAX_STACK = 30;

  function init({ capture, apply }) {
    captureFn = capture;
    applyFn = apply;
    updateButtons();
  }

  // REVISI (Fix Answer Leak via Undo/Redo — Audit Root Cause): Undo/Redo
  // bekerja LANGSUNG di atas snapshot AppState (GameState/children/Punnett/
  // history) lewat captureSnapshot()/applySnapshot(), TANPA melewati gerbang
  // anti-leak Challenge (gradeIfActive/hideResultView ada di ChallengeManager
  // & UIController, bukan di sini). captureSnapshot() TIDAK menyimpan
  // AppState.challengeState (lihat catatan di captureSnapshot), tapi TETAP
  // menyimpan ChildManager.getSnapshot() — yaitu AppState.children/
  // punnettSquare, yang buat Challenge disimpan NON-DESTRUKTIF walau
  // jawaban SALAH (lihat ChildManager.hideView()). Akibatnya: jawab salah ->
  // hasil disembunyikan -> tekan Undo (kembali ke state sebelum cross, aman)
  // -> tekan Redo -> applySnapshot() menemukan punnettSquare TIDAK null ->
  // me-render ULANG Punnett/offspring/rasio ASLI dari percobaan yang barusan
  // dinyatakan salah, PLUS showResultExtras() ("Apa yang sedang terjadi")
  // yang seharusnya tidak pernah tampil selama Challenge — celah leak penuh
  // yang sama sekali lepas dari seluruh mekanisme anti-leak yang sudah ada.
  // Ini juga berlaku untuk Level 3 (Assessment) yang JAWABAN BENAR-nya pun
  // seharusnya tidak pernah ditampilkan.
  //
  // PERBAIKAN MINIMAL & KONSISTEN dengan arsitektur existing: Undo/Redo
  // adalah fitur "free exploration" (mengubah histori/parent secara bebas),
  // jadi tunduk pada filosofi "No Free Exploration" yang sama yang sudah
  // dipakai ParentManager (isInChallengeContext()) — dimatikan TOTAL selama
  // masih dalam konteks Challenge (level-select maupun sesi aktif), bukan
  // cuma saat sedang menampilkan hasil. Guard diletakkan di FUNGSI (undo/
  // redo), bukan cuma di disabled attribute tombol, karena shortcut
  // keyboard Ctrl+Z/Ctrl+Shift+Z memanggil fungsi ini langsung dan tidak
  // memeriksa status disabled tombol sama sekali.
  function updateButtons() {
    const undoBtn = Utils.qs('#btn-undo');
    const redoBtn = Utils.qs('#btn-redo');
    const blockedByChallenge = ChallengeManager.isInChallengeContext();
    if (undoBtn) undoBtn.disabled = blockedByChallenge || AppState.undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = blockedByChallenge || AppState.redoStack.length === 0;
  }

  // Dipanggil oleh aksi apa pun SEBELUM state diubah
  function pushSnapshot() {
    AppState.undoStack.push(captureFn());
    if (AppState.undoStack.length > MAX_STACK) AppState.undoStack.shift();
    AppState.redoStack = []; // aksi baru memutus jalur redo lama
    updateButtons();
  }

  function undo() {
    if (!AppState.undoStack.length) return;
    if (ChallengeManager.isInChallengeContext()) return; // lihat catatan di atas updateButtons()
    AppState.redoStack.push(captureFn());
    const prev = AppState.undoStack.pop();
    applyFn(prev);
    updateButtons();
    EventBus.emit('state:mutated', { activity: 'Aksi terakhir diurungkan (Undo).' });
  }

  function redo() {
    if (!AppState.redoStack.length) return;
    if (ChallengeManager.isInChallengeContext()) return; // lihat catatan di atas updateButtons() — celah leak utama ada di sini
    AppState.undoStack.push(captureFn());
    const next = AppState.redoStack.pop();
    applyFn(next);
    updateButtons();
    EventBus.emit('state:mutated', { activity: 'Aksi yang diurungkan diulang kembali (Redo).' });
  }

  function reset() {
    AppState.undoStack = [];
    AppState.redoStack = [];
    updateButtons();
  }

  return { init, pushSnapshot, undo, redo, reset };
})();

/* ==========================================================================
   13f. MENU MANAGER (REVISI: redesign menu) — orkestrasi layar setup 3-step
   (Jenis Persilangan -> Organisme -> Mode) + summary + validasi sebelum
   Start. Seluruh kartu di-render DATA-DRIVEN dari SIMULATION_CONFIG, bukan
   hardcode per opsi — menambah spesies/mode/jenis persilangan baru di masa
   depan cukup menambah entry di SIMULATION_CONFIG, TIDAK perlu sentuh modul
   ini sama sekali.

   PENTING soal state: modul ini menyimpan pilihan yang BELUM di-commit
   (`pending`) sebagai state LOKAL murni menu — bukan pengganti atau duplikat
   AppState. Begitu user menekan "Mulai Simulasi", pilihan ditulis ke
   AppState lewat setter yang SUDAH ADA (GameState.selectSpecies,
   LearningManager.selectMode) + 1 field baru (AppState.inheritanceType).
   ========================================================================== */
const MenuManager = (() => {
  const pending = {
    inheritanceType: 'monohybrid', // default terpilih (REVISI 4: Monohibrid harus default)
    speciesId: 'bunga',            // satu-satunya opsi nyata saat ini -> aman dijadikan default
    mode: null                     // WAJIB dipilih eksplisit oleh user (bagian dari validasi Start)
  };

  function optionCard({ id, icon, title, shortDesc, desc, selected, available, onSelect, groupLabel }) {
    const props = {
      type: 'button',
      class: `option-card${selected ? ' is-selected' : ''}${!available ? ' is-comingsoon' : ''}`,
      role: 'radio',
      'aria-checked': String(selected),
      'aria-label': `${groupLabel}: ${title}${available ? '' : ' (segera hadir)'}`
    };
    // BUG FIX: Utils.createEl men-set apa pun yang diberikan lewat
    // setAttribute() termasuk saat value=undefined (jadi disabled="undefined"
    // yang tetap membuat elemen disabled selamanya) -> key HARUS di-omit
    // sepenuhnya, bukan diberi nilai undefined.
    if (!available) props.disabled = 'true';
    if (available && onSelect) props.onClick = onSelect;

    const card = Utils.createEl('button', props);
    if (icon) card.appendChild(Utils.createEl('span', { class: 'option-card__icon', 'aria-hidden': 'true', html: icon }));
    card.appendChild(Utils.createEl('span', { class: 'option-card__title', html: title }));
    if (shortDesc) card.appendChild(Utils.createEl('span', { class: 'option-card__short', html: shortDesc }));
    if (desc) card.appendChild(Utils.createEl('span', { class: 'option-card__desc', html: desc }));
    card.appendChild(
      Utils.createEl('span', {
        class: `option-card__status ${available ? 'is-available' : 'is-comingsoon'}`,
        html: available ? (selected ? '✓ Dipilih' : '✓ Tersedia') : '🔒 Segera Hadir'
      })
    );
    return card;
  }

  function renderInheritanceGrid() {
    const grid = Utils.qs('#inheritance-grid');
    grid.innerHTML = '';
    Object.values(SIMULATION_CONFIG.inheritanceTypes).forEach((type) => {
      grid.appendChild(
        optionCard({
          groupLabel: 'Jenis persilangan',
          icon: null,
          title: type.label,
          shortDesc: type.shortDesc,
          desc: type.desc,
          selected: pending.inheritanceType === type.id,
          available: type.available,
          onSelect: () => {
            pending.inheritanceType = type.id;
            renderInheritanceGrid();
            // REVISI (DIHIBRID): deskripsi kartu spesies (shortDescByType)
            // tergantung inheritanceType -> render ulang species grid juga,
            // bukan cuma inheritance grid.
            renderSpeciesGrid();
            updateSummary();
          }
        })
      );
    });
  }

  // REVISI (DIHIBRID): shortDesc kartu spesies kini bisa berbeda per
  // inheritanceType (mis. "Dihibrid • 2 sifat (Warna Biji × Bentuk Biji)")
  // lewat `shortDescByType` — fallback ke `shortDesc` biasa kalau tidak ada.
  function renderSpeciesGrid() {
    const grid = Utils.qs('#species-grid');
    grid.innerHTML = '';
    Object.values(SIMULATION_CONFIG.speciesCatalog).forEach((sp) => {
      const shortDesc = (sp.shortDescByType && sp.shortDescByType[pending.inheritanceType]) || sp.shortDesc;
      grid.appendChild(
        optionCard({
          groupLabel: 'Organisme',
          icon: sp.icon,
          title: sp.label,
          shortDesc,
          desc: null,
          selected: pending.speciesId === sp.id,
          available: sp.available,
          onSelect: () => {
            pending.speciesId = sp.id;
            renderSpeciesGrid();
            updateSummary();
          }
        })
      );
    });
  }

  function renderModeGrid() {
    const grid = Utils.qs('#mode-selector');
    grid.innerHTML = '';
    Object.values(SIMULATION_CONFIG.modes).forEach((mode) => {
      grid.appendChild(
        optionCard({
          groupLabel: 'Mode belajar',
          icon: mode.icon,
          title: mode.label,
          shortDesc: null,
          desc: mode.desc,
          selected: pending.mode === mode.id,
          available: mode.available,
          onSelect: () => {
            pending.mode = mode.id;
            renderModeGrid();
            updateSummary();
          }
        })
      );
    });
  }

  function isValid() {
    const inh = SIMULATION_CONFIG.inheritanceTypes[pending.inheritanceType];
    const sp = SIMULATION_CONFIG.speciesCatalog[pending.speciesId];
    const mode = pending.mode && SIMULATION_CONFIG.modes[pending.mode];
    return Boolean(inh && inh.available && sp && sp.available && mode && mode.available);
  }

  // REVISI (DIHIBRID): traitCatalogBySpecies sekarang berbentuk
  // { speciesId: { monohybrid: [...], dihybrid: [...] } } — ambil array yang
  // sesuai pending.inheritanceType, bukan langsung sebagai array flat.
  function updateSummary() {
    const inh = SIMULATION_CONFIG.inheritanceTypes[pending.inheritanceType];
    const sp = SIMULATION_CONFIG.speciesCatalog[pending.speciesId];
    const traitsBySpecies = SIMULATION_CONFIG.traitCatalogBySpecies[pending.speciesId] || {};
    const traits = traitsBySpecies[pending.inheritanceType] || [];
    const mode = pending.mode ? SIMULATION_CONFIG.modes[pending.mode] : null;

    Utils.qs('#summary-inheritance').textContent = inh ? inh.label : '—';
    Utils.qs('#summary-species').textContent = sp ? sp.label : '—';
    Utils.qs('#summary-trait').textContent = traits.length ? traits.map((t) => t.label).join(', ') : '—';
    Utils.qs('#summary-mode').textContent = mode ? mode.label : '—';

    const startBtn = Utils.qs('#btn-start-simulation');
    const hint = Utils.qs('#setup-summary-hint');
    const valid = isValid();
    startBtn.disabled = !valid;
    hint.textContent = valid ? 'Konfigurasi siap. Selamat bereksperimen!' : 'Lengkapi pilihan di atas untuk memulai.';
  }

  // REVISI 14: commit HANYA terjadi di sini — satu-satunya titik yang
  // menulis pilihan menu ke AppState (lewat setter yang sudah ada).
  function commitAndStart() {
    if (!isValid()) return;
    AppState.inheritanceType = pending.inheritanceType;
    EventBus.emit('ui:startSimulationClicked', {
      speciesId: pending.speciesId,
      mode: pending.mode
    });
  }

  function init() {
    renderInheritanceGrid();
    renderSpeciesGrid();
    renderModeGrid();
    updateSummary();
    Utils.qs('#btn-start-simulation').addEventListener('click', commitAndStart);
  }

  return { init };
})();

/* ==========================================================================
   13b. BACKGROUND MANAGER (Bagian 3 prompt revisi) — SIMULATION BACKGROUND
   SELECTOR. Background HANYA layer visual (lihat ASSET_CONFIG/BACKGROUNDS di
   atas + `.crossing-box::before` di style.css) — modul ini TIDAK PERNAH
   menyentuh Mendel Engine/Parent System/Crossing Logic/Punnett/Children.
   Preference disimpan di AppState.backgroundId dan ikut tersimpan lewat
   SessionStorage yang SUDAH ADA (captureSnapshot/applySnapshot di
   UIController) — sengaja TIDAK membuat key localStorage baru.
   ========================================================================== */
const BackgroundManager = (() => {
  function getCurrent() {
    return BACKGROUNDS.find((b) => b.id === AppState.backgroundId) || BACKGROUNDS[0];
  }

  // Layer visual: set CSS var yang dibaca `.crossing-box::before` — TIDAK
  // pernah menggeser/menyentuh drop zone (Parent/Crossing/Children Area),
  // yang semuanya berada di layer terpisah (.crossing-box > *).
  function applyToDOM() {
    const box = Utils.qs('.crossing-box');
    if (!box) return;
    const bg = getCurrent();
    box.style.setProperty('--crossing-bg-image', `url("${bg.asset}")`);
  }

  function render() {
    const list = Utils.qs('#background-selector-list');
    if (!list) return;
    list.innerHTML = '';
    BACKGROUNDS.forEach((bg) => {
      const isActive = bg.id === AppState.backgroundId;
      // BUG FIX (sama seperti MenuManager.optionCard): Utils.createEl men-set
      // apa pun lewat setAttribute() termasuk value=undefined (disabled="undefined"
      // tetap membuat elemen disabled selamanya) -> key HARUS di-omit sepenuhnya
      // untuk slot yang available, bukan diberi nilai undefined.
      const props = {
        type: 'button',
        class: `background-option${isActive ? ' is-active' : ''}${!bg.available ? ' is-comingsoon' : ''}`,
        role: 'radio',
        'aria-checked': String(isActive)
      };
      if (!bg.available) props.disabled = 'true';
      else props.onClick = () => select(bg.id);

      list.appendChild(
        Utils.createEl('button', props, [
          Utils.createEl('span', { class: 'background-option__name', html: bg.name }),
          Utils.createEl('span', {
            class: `background-option__status ${bg.available ? 'is-available' : 'is-comingsoon'}`,
            html: bg.available ? (isActive ? '✓ Aktif' : 'Pilih') : 'Segera Hadir'
          })
        ])
      );
    });
  }

  function select(id) {
    const bg = BACKGROUNDS.find((b) => b.id === id);
    if (!bg || !bg.available) return; // guard: slot "Segera Hadir" tidak bisa dipilih (cegah broken image)
    AppState.backgroundId = id;
    applyToDOM();
    render();
    const announcer = Utils.qs('#sr-announcer');
    if (announcer) announcer.textContent = `Latar simulasi diganti ke ${bg.name}.`;
    EventBus.emit('state:mutated', { activity: `Latar simulasi diganti ke ${bg.name}.` });
  }

  // REVISI 8 (Background Settings Persistence): dipakai SessionStorage lewat
  // captureSnapshot/applySnapshot — Reset Simulation TIDAK memanggil ini,
  // sehingga background TETAP walau simulasi direset (lihat TEST 9).
  function getSnapshot() {
    return AppState.backgroundId;
  }

  function restoreState(backgroundId) {
    const valid = BACKGROUNDS.some((b) => b.id === backgroundId && b.available);
    AppState.backgroundId = valid ? backgroundId : BACKGROUNDS[0].id;
    applyToDOM();
    render();
  }

  function init() {
    AppState.backgroundId = AppState.backgroundId || BACKGROUNDS[0].id;
    applyToDOM();
    render();
  }

  return { init, select, applyToDOM, render, getCurrent, getSnapshot, restoreState };
})();

/* ==========================================================================
   14. UI CONTROLLER — entry point, wiring semua modul
   ========================================================================== */
const UIController = (() => {
  // REVISI 3 & STATE MANAGEMENT terpusat: generasi kini dibaca/ditulis
  // langsung dari AppState.currentGeneration, bukan variabel lokal privat.

  // REVISI 18/20: data hasil yang SEDANG ditampilkan (bisa dari cross baru
  // ATAU dari Timeline/Tree browsing) — dipakai ulang oleh Explain panel &
  // Academic Summary supaya keduanya selalu menjelaskan apa yang terlihat.
  let lastDisplayedResult = null;

  function currentSpecies() {
    return Species[GameState.getState().speciesId];
  }

  // REVISI 3 (Challenge locking) — SATU fungsi gabungan yang jadi sumber
  // kebenaran TUNGGAL untuk "boleh cross atau tidak", dipakai baik oleh
  // Layer UI (disable tombol) maupun Layer Logic (guard di handleCross).
  // Mode lain (Learning/Free) tidak terpengaruh karena
  // ChallengeManager.canCrossNow() mengembalikan true saat tidak ada
  // Challenge aktif (Mode Isolation, TEST 12).
  function canPerformCross() {
    return GameState.bothParentsFilled() && LearningManager.canCross() && ChallengeManager.canCrossNow();
  }

  function refreshParentSlots() {
    const state = GameState.getState();
    const traitIds = state.traitIds;
    Renderer.renderParentSlot('parent1', state.parent1, traitIds);
    Renderer.renderParentSlot('parent2', state.parent2, traitIds);
    // REVISI 15: di Learning Mode, tombol Silangkan butuh syarat tambahan
    // (induk sudah dipelajari) di atas syarat dasar "kedua induk terisi".
    Renderer.updateCrossButton(canPerformCross());
    EducationPanel.explainParents(state, traitIds);
    // REVISI (Fix Step 4 - Pembentukan Gamet): isi teks gamet SEGERA setelah
    // kedua induk terisi (gamet ditentukan oleh genotipe induk saja, TIDAK
    // butuh hasil cross) — supaya saat gerbang "gamete-review" terbuka,
    // isinya sudah konten nyata, bukan placeholder "—".
    LearningManager.presentGameteLearning(state, traitIds);
  }

  function refreshPools() {
    Renderer.renderPools(currentSpecies());
  }

  function clearResultsOnly() {
    ChildManager.reset();
    PunnettRenderer.reset();
    lastDisplayedResult = null;
    Utils.qs('#explain-panel').hidden = true;
    Utils.qs('#academic-summary').hidden = true;
  }

  function updateGenerationBadge(text) {
    const badge = Utils.qs('#generation-badge');
    if (!badge) return;
    if (text) {
      badge.textContent = text;
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  // REVISI 18/20: dipanggil setiap kali hasil (baru atau dari riwayat) ditampilkan
  function showResultExtras(resultData) {
    lastDisplayedResult = resultData;

    const summaryEl = Utils.qs('#academic-summary');
    const summaryText = Utils.qs('#academic-summary-text');
    if (summaryEl && summaryText) {
      summaryText.textContent = SummaryGenerator.generate(resultData);
      summaryEl.hidden = false;
    }

    // Panel penjelasan ditutup ulang setiap ganti hasil, supaya user sadar
    // harus klik lagi "Jelaskan Hasil Ini" untuk hasil yang sedang tampil
    const explainPanel = Utils.qs('#explain-panel');
    if (explainPanel) explainPanel.hidden = true;
  }

  // ------------------------------------------------------------------------
  // REVISI 14: snapshot/restore generik — dipakai Undo/Redo & Autosave.
  // Setiap modul stateful (GameState/ChildManager/HistoryManager) sudah
  // punya getSnapshot()/restoreState() sendiri; fungsi ini cuma menggabungkan.
  // ------------------------------------------------------------------------
  function captureSnapshot() {
    return {
      game: GameState.getState(),
      children: ChildManager.getSnapshot(),
      history: HistoryManager.getSnapshot(),
      learning: LearningManager.getSnapshot(),
      generationCount: AppState.currentGeneration,
      background: BackgroundManager.getSnapshot()
    };
  }

  function applySnapshot(snapshot) {
    GameState.restoreState(snapshot.game);
    ChildManager.restoreState(snapshot.children);
    HistoryManager.restoreState(snapshot.history);
    if (snapshot.learning) LearningManager.restoreState(snapshot.learning);
    if (snapshot.background) BackgroundManager.restoreState(snapshot.background);
    AppState.currentGeneration = snapshot.generationCount;
    GenerationTimeline.setActiveLatest();

    const traitIds = snapshot.game.traitIds;
    const punnett = ChildManager.getPunnettResult();

    if (punnett) {
      PunnettRenderer.render(punnett, traitIds);
      const { genotypeRatio, phenotypeRatio } = ChildManager.renderAll(traitIds);
      refreshParentSlots();
      const lastRecord = HistoryManager.getRecords().slice(-1)[0];
      if (lastRecord) {
        EducationPanel.explainCrossResult({
          parent1: lastRecord.parent1,
          parent2: lastRecord.parent2,
          traitIds: lastRecord.traitIds,
          punnettResult: lastRecord.punnettResult,
          genotypeRatio,
          phenotypeRatio
        });
        showResultExtras({ parent1: lastRecord.parent1, parent2: lastRecord.parent2, traitIds: lastRecord.traitIds, punnettResult: lastRecord.punnettResult, genotypeRatio, phenotypeRatio });
      }
    } else {
      ChildManager.reset();
      PunnettRenderer.reset();
      EducationPanel.reset();
      refreshParentSlots();
    }

    updateGenerationBadge(AppState.currentGeneration > 0 ? `Generasi ke-${AppState.currentGeneration}` : null);
  }

  // REVISI 12: menampilkan kembali 1 generasi dari Timeline/Tree TANPA mengubah
  // parent aktif / tanpa masuk ke Undo stack — murni "melihat", bukan "mengubah".
  // REVISI (Fix Answer Leak & Parent-Lock Bypass via Generation Tree — Audit
  // Root Cause): fungsi ini dipicu event 'timeline:selectGeneration' (klik
  // node di Generation Tree) dan SEBELUMNYA tidak punya gerbang Challenge
  // sama sekali. Dua masalah: (1) memanggil showResultExtras() ("Apa yang
  // sedang terjadi") TANPA syarat — panel ini SENGAJA tidak pernah tampil
  // selama Challenge (lihat handleCross: `if (!inChallenge) showResultExtras(...)`)
  // tapi jalur ini melewatinya sama sekali, termasuk untuk record cross
  // Challenge yang sudah BENAR (Level 3 seharusnya tidak pernah menampilkan
  // hasil sama sekali — lihat fix di gradeIfActive). (2) memanggil
  // GameState.setParent() LANGSUNG (bukan lewat ParentManager.placeGenotype),
  // sehingga menembus gerbang "No Free Exploration" — parent slot bisa
  // berubah ke genotipe record LAMA yang tidak sesuai objective soal yang
  // sedang berjalan, dan cross berikutnya jadi tidak konsisten dengan apa
  // yang sebenarnya sedang dinilai. Konsisten dengan filosofi ParentManager/
  // UndoRedoManager: matikan navigasi History/Tree ini TOTAL selama masih
  // dalam konteks Challenge (level-select maupun sesi aktif).
  function viewGenerationRecord(recordId) {
    if (ChallengeManager.isInChallengeContext()) return;
    const record = HistoryManager.getRecords().find((r) => r.id === recordId);
    if (!record) return;

    // REVISI 2: sebelumnya fungsi ini SENGAJA tidak menyentuh GameState
    // (view-only). Requirement terbaru membalik itu — memilih generasi di
    // Timeline/Tree harus memindahkan SELURUH simulasi (termasuk Parent 1/2
    // aktif), bukan cuma tampilan Punnett/Children/Ratio. Karena ini benar-
    // benar mengubah state (bukan lagi read-only), tetap didorong ke Undo
    // stack seperti aksi lain — user tetap bisa Undo untuk kembali ke state
    // sebelum browsing history.
    UndoRedoManager.pushSnapshot();
    GameState.setParent('parent1', record.parent1);
    GameState.setParent('parent2', record.parent2);

    ChildManager.restoreState({ children: record.children, punnettResult: record.punnettResult });
    PunnettRenderer.render(record.punnettResult, record.traitIds);
    const { genotypeRatio, phenotypeRatio } = ChildManager.renderAll(record.traitIds);

    EducationPanel.explainCrossResult({
      parent1: record.parent1,
      parent2: record.parent2,
      traitIds: record.traitIds,
      punnettResult: record.punnettResult,
      genotypeRatio,
      phenotypeRatio
    });

    showResultExtras({ parent1: record.parent1, parent2: record.parent2, traitIds: record.traitIds, punnettResult: record.punnettResult, genotypeRatio, phenotypeRatio });
    updateGenerationBadge(record.generationLabel);

    // PENTING (sesuai brief): "JANGAN merusak history / menghapus generation
    // setelahnya" — fungsi ini HANYA memindahkan current view/parent aktif.
    // AppState.generationHistory sama sekali tidak disentuh di sini, jadi
    // P→F1→F2→F3 tetap utuh apa pun generasi yang sedang dilihat. Jika user
    // melakukan cross baru dari state ini, handleCross() akan menambah
    // record BARU di akhir array (lihat generationLabel = F{length+1}),
    // bukan menimpa record yang sedang dilihat.

    const announcer = Utils.qs('#sr-announcer');
    if (announcer) announcer.textContent = `Berpindah ke generasi ${record.generationLabel}: ${record.label}. Induk 1 dan Induk 2 diperbarui sesuai generasi ini.`;

    EventBus.emit('state:mutated', { activity: `Melihat generasi ${record.generationLabel} — Induk & hasil diperbarui.` });
  }

  function goToSimulator(speciesId, mode) {
    GameState.selectSpecies(speciesId);
    const species = currentSpecies();
    const traitIds = AppState.traitIds;
    Renderer.setSimulatorTitle(species, traitIds);
    Renderer.showScreen('simulator');
    refreshPools();
    refreshParentSlots();
    clearResultsOnly();
    EducationPanel.reset();
    HistoryManager.reset();
    ActivityLog.reset();
    UndoRedoManager.reset();
    // REVISI MENU: mode sekarang datang dari pilihan menu (bukan lagi
    // tombol terpisah di layar species) — LearningManager.selectMode()
    // TETAP satu-satunya penulis AppState.currentMode (tidak ada state ganda).
    LearningManager.selectMode(mode || 'learning');
    // REVISI MODE ISOLATION: sesi Challenge SEBELUMNYA (jika ada) diakhiri
    // TOTAL di sini (termasuk konteks Level Selection) — TEST 4/5/6/7 (mode
    // isolation) bergantung pada baris ini: state challenge tidak pernah
    // "bocor" ke mode lain atau sesi baru.
    ChallengeManager.exitContext();
    AppState.currentGeneration = 0;
    updateGenerationBadge(null);

    ProgressManager.increment('totalSimulasi');
    // REVISI (DIHIBRID): label topik ikut inheritanceType yang sebenarnya
    // aktif, bukan hardcode "(Monohibrid)".
    const inheritanceLabel = SIMULATION_CONFIG.inheritanceTypes[AppState.inheritanceType].label;
    const traitNames = traitIds.map((t) => Traits[t].name).join(' × ');
    ProgressManager.noteTopic(`${species.name} — ${traitNames} (${inheritanceLabel})`);

    // REVISI MODE-SPECIFIC UI: catatan "Mode Belajar" hanya tampil di
    // Learning Mode (guided, bukan evaluasi) — MODE_CONFIG sebagai satu-
    // satunya sumber keputusan, bukan if/else tersebar.
    Utils.qs('#learning-guided-note').hidden = !MODE_CONFIG[mode || 'learning'].guided;

    // Mode "Challenge" dipilih langsung dari menu -> user masuk ke Challenge
    // Level Selection (WAJIB, bukan opsional) — sesi baru benar-benar dimulai
    // begitu user memilih satu level (lihat ChallengeManager.selectLevel).
    if (MODE_CONFIG[mode || 'learning'].challengeEnabled) {
      ChallengeManager.enterLevelSelection(traitIds);
    }

    EventBus.emit('state:mutated', { activity: `Memulai simulator ${species.name} (${SIMULATION_CONFIG.modes[mode || 'learning'].label}).` });
  }

  function handleCross() {
    const state = GameState.getState();
    // REVISI 3 (Challenge locking) — LAYER LOGIC: guard ini berlaku
    // TERLEPAS dari status disabled tombol di UI. Ini pertahanan lapis kedua
    // ("Double Protection") — memastikan tidak ada jalur lain (keyboard
    // Enter/Space pada elemen lama, event terprogram, dsb.) yang bisa
    // memanggil handleCross() sebelum jawaban Challenge dikunci.
    if (!canPerformCross()) {
      if (ChallengeManager.isActive() && !ChallengeManager.isAnswerLocked()) {
        Animation.shake(Utils.qs('#btn-cross'));
        const announcer = Utils.qs('#sr-announcer');
        if (announcer) announcer.textContent = '🔒 Kunci jawaban terlebih dahulu untuk membuka persilangan.';
      }
      return;
    }

    UndoRedoManager.pushSnapshot();

    // Label generasi dihitung SEKALI di sini, dipakai konsisten oleh skema ID
    // anak (child_F1_001, lihat FITUR 34) maupun record riwayat/timeline/tree.
    const generationLabel = `F${AppState.generationHistory.length + 1}`;

    const { punnettResult } = ChildManager.generate(state.parent1, state.parent2, state.traitIds, generationLabel);
    PunnettRenderer.render(punnettResult, state.traitIds);
    const { genotypeRatio, phenotypeRatio } = ChildManager.renderAll(state.traitIds);

    AppState.currentGeneration += 1;
    updateGenerationBadge(`Generasi ke-${AppState.currentGeneration}`);

    EducationPanel.explainCrossResult({
      parent1: state.parent1,
      parent2: state.parent2,
      traitIds: state.traitIds,
      punnettResult,
      genotypeRatio,
      phenotypeRatio
    });

    // REVISI (Anti Answer Leak, Bagian 4/8): selama masih dalam konteks
    // Challenge, "Apa yang sedang terjadi" (academic-summary) dan panel
    // "Jelaskan Hasil Ini" TIDAK PERNAH ditampilkan sama sekali — keduanya
    // secara eksplisit membocorkan rasio/kesimpulan hasil (lihat
    // SummaryGenerator.generate()), dan tidak ada mekanisme "sembunyikan"
    // yang genuinely aman untuk teks bebas seperti itu. Learning/Free TIDAK
    // terpengaruh (showResultExtras tetap jalan seperti biasa).
    const inChallenge = ChallengeManager.isInChallengeContext();
    if (!inChallenge) {
      showResultExtras({ parent1: state.parent1, parent2: state.parent2, traitIds: state.traitIds, punnettResult, genotypeRatio, phenotypeRatio });
    }

    // REVISI (Fix Progress Checklist): ambil snapshot children LEBIH AWAL
    // (dipindah dari bawah) supaya teks observasi "Amati Hasil Anak" bisa
    // diisi SEBELUM gerbangnya dibuka oleh onCrossPerformed() di bawah.
    const { children } = ChildManager.getSnapshot();
    LearningManager.presentCrossObservations({ punnettResult, childrenCount: children.length });
    LearningManager.onCrossPerformed();

    const record = HistoryManager.addRecord({
      generationLabel,
      parent1: state.parent1,
      parent2: state.parent2,
      traitIds: state.traitIds,
      punnettResult,
      children,
      genotypeRatio,
      phenotypeRatio
    });
    GenerationTimeline.setActiveLatest();

    ProgressManager.increment('totalPersilangan');
    ProgressManager.noteGeneration(AppState.currentGeneration);

    // REVISI 16: jika ada Challenge Mode aktif, nilai jawaban yang sudah dikunci
    ChallengeManager.gradeIfActive(genotypeRatio, phenotypeRatio, state.traitIds);
    // REVISI 3: setelah grading, crossPerformed=true -> tombol Silangkan
    // harus otomatis terkunci lagi sampai user retry/lanjut ke soal berikutnya.
    Renderer.updateCrossButton(canPerformCross());

    const summary = genotypeRatio.map((r) => `${r.label} ${r.percent}%`).join(', ');
    // REVISI (Anti Answer Leak, Bagian 10/20/21): SR-announcer & Activity Log
    // adalah accessibility/history surface yang SEBELUMNYA membocorkan rasio
    // hasil mentah-mentah untuk SETIAP cross, termasuk cross Challenge yang
    // salah. Selama dalam konteks Challenge, keduanya diam di sini — pesan
    // netral (tanpa angka) sudah dikirim oleh ChallengeManager.gradeIfActive()
    // di atas, sesuai hasil evaluasi yang sebenarnya. Learning/Free TIDAK
    // terpengaruh — tetap mendapat ringkasan rasio lengkap seperti biasa.
    if (!inChallenge) {
      const announcer = Utils.qs('#sr-announcer');
      if (announcer) {
        announcer.textContent = `Persilangan selesai. Menghasilkan ${children.length} kombinasi: ${summary}.`;
      }
      EventBus.emit('state:mutated', {
        activity: `Persilangan dilakukan (${record.label}) → ${record.generationLabel}: ${summary}.`
      });
    }
  }

  function handleReset() {
    const state = GameState.getState();
    const hasSomethingToLose = Boolean(state.parent1 || state.parent2 || ChildManager.getPunnettResult());
    const hasActiveChallenge = ChallengeManager.isActive();

    // REVISI (Fix Challenge Reset): Reset Simulation TIDAK BOLEH menghapus
    // Challenge Definition (ID/objective/soal/skor) — hanya boleh menghapus
    // SIMULATION PROGRESS (parent/children/Punnett/jawaban terkunci). Lihat
    // ChallengeManager.resetProgress() vs exitSession().
    const doReset = () => {
      UndoRedoManager.pushSnapshot();
      if (!hasActiveChallenge) {
        GameState.clearParent('parent1');
        GameState.clearParent('parent2');
      }
      clearResultsOnly();
      EducationPanel.reset();
      HistoryManager.reset();
      LearningManager.reset();
      if (hasActiveChallenge) {
        // Challenge yang sama TETAP aktif — hanya upaya saat ini yang diulang
        // (parent diisi ulang sesuai objective, Answer Lock kembali terbuka).
        ChallengeManager.resetProgress();
      }
      // REVISI (Fix "Akhiri Sesi" -> Sandbox / Level Selection persistence):
      // SEBELUMNYA cabang else di sini memanggil ChallengeManager.exitSession()
      // tanpa syarat -> kalau user sedang di Challenge Level Selection (belum
      // pilih level, jadi hasActiveChallenge=false) dan menekan Reset Simulasi,
      // konteks Challenge ikut terhapus (regresi dari bug yang sama). Reset
      // Simulasi TIDAK PERNAH menyentuh konteks Challenge kecuali sesi sedang
      // aktif (resetProgress di atas) — di luar itu, tidak ada apa pun yang
      // perlu direset di sisi Challenge.
      AppState.currentGeneration = 0;
      updateGenerationBadge(null);
      const announcer = Utils.qs('#sr-announcer');
      if (announcer) {
        announcer.textContent = hasActiveChallenge
          ? 'Simulasi direset. Tantangan yang sama tetap aktif — pilih dan kunci jawaban kembali sebelum menyilangkan.'
          : 'Simulasi telah direset ke kondisi awal.';
      }
      EventBus.emit('state:mutated', { activity: 'Simulasi direset ke kondisi awal.' });
    };

    if (hasActiveChallenge) {
      // REVISI: pesan konfirmasi diperbarui — reset TIDAK LAGI menghapus
      // sesi Challenge (dulu memang menghapusnya, itulah bug yang diperbaiki),
      // sekarang hanya mengulang percobaan pada tantangan yang sama.
      ConfirmDialog.show('Reset akan mengosongkan induk, hasil persilangan, dan jawaban yang sudah dikunci untuk tantangan ini. Tantangan yang sama akan tetap berlanjut (skor tidak hilang). Reset sekarang?', doReset, 'Reset Sekarang');
    } else if (hasSomethingToLose) {
      // REVISI: konfirmasi sebelum aksi destruktif
      ConfirmDialog.show('Reset akan menghapus induk, hasil persilangan, dan riwayat generasi saat ini. Lanjutkan?', doReset, 'Reset Sekarang');
    } else {
      doReset();
    }
  }

  // REVISI 17: tab switch antara Timeline (linear) dan Generation Tree
  function bindTimelineTabs() {
    const tabTimeline = Utils.qs('#tab-timeline');
    const tabTree = Utils.qs('#tab-tree');
    const trackTimeline = Utils.qs('#timeline-track');
    const trackTree = Utils.qs('#generation-tree-wrap');

    function activate(which) {
      const isTimeline = which === 'timeline';
      tabTimeline.classList.toggle('is-active', isTimeline);
      tabTimeline.setAttribute('aria-selected', String(isTimeline));
      tabTree.classList.toggle('is-active', !isTimeline);
      tabTree.setAttribute('aria-selected', String(!isTimeline));
      trackTimeline.hidden = !isTimeline;
      trackTree.hidden = isTimeline;
      // Tree baru bisa dihitung posisinya (getBoundingClientRect) SETELAH
      // wrapper-nya benar-benar visible di DOM (bukan display:none) —
      // makanya render dipanggil di sini, bukan hanya reaktif ke history:updated.
      if (!isTimeline) GenerationTreeManager.render(HistoryManager.getRecords());
    }

    tabTimeline.addEventListener('click', () => activate('timeline'));
    tabTree.addEventListener('click', () => activate('tree'));
  }

  // REVISI 18: tombol + tab level SD/SMP/SMA pada panel penjelasan
  function bindExplainPanel() {
    const btn = Utils.qs('#btn-explain-result');
    const panel = Utils.qs('#explain-panel');
    const content = Utils.qs('#explain-panel-content');
    const tabs = Utils.qsa('.view-tab', panel);

    function renderLevel(level) {
      if (!lastDisplayedResult) return;
      content.innerHTML = ExplanationEngine.buildFullExplanationHTML(lastDisplayedResult, level);
    }

    btn.addEventListener('click', () => {
      if (!lastDisplayedResult) return;
      panel.hidden = !panel.hidden;
      if (!panel.hidden) {
        const activeTab = panel.querySelector('.view-tab.is-active') || tabs[0];
        renderLevel(activeTab.dataset.level);
      }
    });

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => {
          t.classList.toggle('is-active', t === tab);
          t.setAttribute('aria-selected', String(t === tab));
        });
        renderLevel(tab.dataset.level);
      });
    });
  }

  function bindStaticEvents() {
    Utils.qs('#btn-back').addEventListener('click', () => {
      const state = GameState.getState();
      const hasProgress = Boolean(state.parent1 || state.parent2 || ChildManager.getPunnettResult());
      if (ChallengeManager.isActive()) {
        ConfirmDialog.show('Sesi Tantangan yang sedang berjalan belum selesai dan akan dihentikan jika kamu kembali ke menu. Lanjutkan?', () => Renderer.showScreen('species'), 'Kembali ke Menu');
      } else if (hasProgress) {
        ConfirmDialog.show('Kembali ke menu akan meninggalkan simulasi yang sedang berjalan. Lanjutkan?', () => Renderer.showScreen('species'), 'Kembali ke Menu');
      } else {
        Renderer.showScreen('species');
      }
    });
    Utils.qs('#btn-cross').addEventListener('click', handleCross);
    Utils.qs('#btn-reset').addEventListener('click', handleReset);
    Utils.qs('#btn-undo').addEventListener('click', () => UndoRedoManager.undo());
    Utils.qs('#btn-redo').addEventListener('click', () => UndoRedoManager.redo());

    Utils.qs('#btn-remove-parent1').addEventListener('click', () => ParentManager.removeParent('parent1'));
    Utils.qs('#btn-remove-parent2').addEventListener('click', () => ParentManager.removeParent('parent2'));

    // REVISI — "Akhiri Sesi" BUKAN "Skip", dan BUKAN keluar dari Challenge:
    // mengembalikan user ke Challenge Level Selection (konteks Challenge
    // tetap ada) — selalu minta konfirmasi eksplisit, dan secara jujur
    // memberi tahu bahwa progress sesi ini belum tercatat selesai.
    Utils.qs('#btn-challenge-exit').addEventListener('click', () => {
      ConfirmDialog.show('Apakah Anda yakin ingin mengakhiri sesi ini? Progress tantangan saat ini akan dihentikan dan tidak dihitung selesai. Kamu akan kembali ke halaman pilih Level.', () => {
        ChallengeManager.endSession();
        EventBus.emit('state:mutated', { activity: 'Sesi Tantangan diakhiri sebelum selesai — kembali ke pilihan Level.' });
      }, 'Akhiri Sesi');
    });

    bindTimelineTabs();
    bindExplainPanel();

    // REVISI 14: shortcut keyboard, hanya aktif saat berada di layar simulator
    document.addEventListener('keydown', (e) => {
      const onSimulator = !Utils.qs('#screen-simulator').hidden;
      if (!onSimulator) return;
      const cmd = e.ctrlKey || e.metaKey;
      if (!cmd) return;
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        UndoRedoManager.undo();
      } else if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') {
        e.preventDefault();
        UndoRedoManager.redo();
      }
    });
  }

  function bindDomainEvents() {
    EventBus.on('ui:startSimulationClicked', ({ speciesId, mode }) => goToSimulator(speciesId, mode));
    // REVISI 2 (bug fix): sebelumnya listener ini juga memanggil clearResultsOnly(),
    // sehingga men-drag salah satu kartu anak ke slot Parent (yang otomatis memicu
    // parent:changed) ikut menghapus SELURUH kartu anak lain sebagai efek samping.
    // Hasil generasi sekarang hanya boleh hilang saat user benar-benar memulai
    // persilangan baru (handleCross) atau menekan Reset — bukan sekadar mengisi parent.
    EventBus.on('parent:changed', () => {
      refreshParentSlots();
    });

    EventBus.on('timeline:selectGeneration', viewGenerationRecord);

    // BUG FIX: gerbang Learning Mode (ack-parent-review/gamete-review) bisa
    // membuat canCross() berubah tanpa parent itu sendiri berubah — perlu
    // listener terpisah supaya tombol Silangkan ikut ter-refresh.
    EventBus.on('learning:progressed', () => {
      Renderer.updateCrossButton(canPerformCross());
    });

    // REVISI 3 (Challenge locking) — LAYER UI: tombol Silangkan baru boleh
    // aktif setelah jawaban dikunci (parent tidak berubah saat lock, jadi
    // 'parent:changed' tidak terpicu — perlu event khusus ini).
    EventBus.on('challenge:answerLocked', () => {
      Renderer.updateCrossButton(canPerformCross());
    });

    // REVISI 14: satu listener menangani 2 hal sekaligus (logging + autosave)
    // setiap kali ada aksi yang mengubah state — dekopel dari aksi itu sendiri.
    //
    // REVISI (Fix Answer Leak via Session Resume — Audit Root Cause):
    // captureSnapshot() TIDAK menyimpan AppState.challengeState (sesi
    // Challenge memang tidak didesain untuk di-resume), TAPI tetap
    // menyimpan ChildManager.getSnapshot() — yaitu AppState.children/
    // punnettSquare, yang untuk Challenge SENGAJA dipertahankan non-
    // destruktif walau jawaban salah/Level 3 (lihat ChildManager.hideView()).
    // Kalau 'state:mutated' terakhir sebelum reload/tutup tab kebetulan
    // terjadi tepat setelah cross Challenge yang hasilnya disembunyikan,
    // autosave ini akan menyimpannya utuh ke localStorage. "Lanjutkan Sesi
    // Sebelumnya" lalu memanggil applySnapshot() TANPA gerbang Challenge apa
    // pun (sama seperti Undo/Redo di atas) — me-render ulang hasil yang
    // seharusnya tersembunyi, plus "Apa yang sedang terjadi", lewat jalur
    // reload yang sama sekali lepas dari seluruh anti-leak Challenge.
    // Karena state Challenge sendiri memang tidak ikut ter-resume, tidak
    // ada gunanya menyimpan snapshot visual mid-Challenge sama sekali.
    EventBus.on('state:mutated', () => {
      if (ChallengeManager.isInChallengeContext()) return;
      SessionStorage.scheduleSave(captureSnapshot());
    });
  }

  // REVISI 14: pulihkan sesi terakhir dari localStorage saat halaman dimuat ulang
  // REVISI 1 (Initial Routing): fungsi ini SEBELUMNYA langsung menavigasi ke
  // simulator begitu ditemukan snapshot tersimpan — itulah sebabnya membuka
  // index.html/refresh browser bisa langsung "melompat" ke Free/Sandbox
  // (atau mode apa pun sesi terakhir) tanpa lewat menu. Sekarang fungsi ini
  // HANYA memeriksa ketersediaan sesi dan MENAWARKAN opsi lanjut secara
  // eksplisit (tombol di menu) — TIDAK PERNAH auto-navigate. INITIAL STATE
  // aplikasi (layar menu) sekarang benar-benar terpisah dari ACTIVE
  // SIMULATION STATE (baru terjadi setelah user menekan tombol, baik
  // "Mulai Simulasi" maupun "Lanjutkan Sesi Sebelumnya").
  function offerResumeSessionIfAny() {
    const snapshot = SessionStorage.load();
    const banner = Utils.qs('#resume-session-banner');
    if (!snapshot || !snapshot.game || !snapshot.game.speciesId || !Species[snapshot.game.speciesId]) {
      banner.hidden = true;
      return;
    }
    banner.hidden = false;
    Utils.qs('#btn-resume-session').onclick = () => resumeSession(snapshot);
    Utils.qs('#btn-dismiss-resume').onclick = () => {
      SessionStorage.clear();
      banner.hidden = true;
    };
  }

  function resumeSession(snapshot) {
    const species = Species[snapshot.game.speciesId];
    // REVISI (DIHIBRID): renderPools()/starterGenotypesFor() membaca
    // AppState.inheritanceType/traitIds — keduanya HARUS di-set dari snapshot
    // SEBELUM renderPools dipanggil di sini (applySnapshot yang melakukan
    // restore penuh baru berjalan SETELAH baris ini — lihat catatan di bawah).
    AppState.inheritanceType = snapshot.game.inheritanceType || 'monohybrid';
    AppState.traitIds = snapshot.game.traitIds;
    Renderer.setSimulatorTitle(species, snapshot.game.traitIds);
    Renderer.showScreen('simulator');
    // Catatan: pakai `species` yang sudah diketahui langsung (bukan refreshPools()/
    // currentSpecies(), yang membaca GameState) karena GameState baru di-restore
    // di applySnapshot() setelah baris ini.
    Renderer.renderPools(species);
    applySnapshot(snapshot);

    const announcer = Utils.qs('#sr-announcer');
    if (announcer) announcer.textContent = 'Sesi simulasi sebelumnya berhasil dipulihkan.';
  }

  function init() {
    ProgressManager.init();
    MenuManager.init();
    DragDrop.init();
    ConfirmDialog.init();
    HighlightSync.init();
    Ripple.init();
    GenerationTimeline.init();
    GenerationTreeManager.init();
    SelectionToolbar.init();
    ActivityLog.init();
    LearningManager.init();
    ChallengeManager.init();
    DashboardManager.init();
    BackgroundManager.init();
    UndoRedoManager.init({ capture: captureSnapshot, apply: applySnapshot });

    bindStaticEvents();
    bindDomainEvents();

    // REVISI 1: INITIAL LOAD selalu ke Menu Awal — TIDAK PERNAH otomatis
    // masuk simulator hanya karena ada sesi tersimpan.
    Renderer.showScreen('species');
    offerResumeSessionIfAny();
  }

  return { init };
})();

/* ==========================================================================
   15. LAYER NAMESPACES — pengelompokan eksplisit sesuai Target Architecture
   (Layer 1: Simulation Engine, Layer 2: Learning Engine, Layer 3: Presentation).

   Ini BUKAN pemindahan fisik kode (yang berisiko menulis ulang ~2000 baris
   yang sudah teruji lewat berulang kali revisi) — melainkan re-export sadar
   dari modul-modul yang SUDAH secara alami berada di layer masing-masing
   sejak awal (lihat STEP 1 audit). Tujuannya dua:
   1. Kejelasan arsitektur — developer baru bisa lihat 1 objek untuk tahu apa
      saja yang termasuk 1 layer, tanpa harus scroll seluruh file.
   2. Boundary enforcement — SimulationEngine.assertNoDomAccess() di bawah
      benar-benar MEMVERIFIKASI (bukan cuma dijanjikan lewat komentar) bahwa
      tidak ada modul genetika yang menyentuh DOM.
   ========================================================================== */

// Layer 1 — murni genetika, TIDAK BOLEH bergantung pada DOM/AppState/EventBus UI
const SimulationEngine = {
  Species,
  Traits,
  DominanceRule,
  GameteFactory,
  MendelEngine,
  PunnettCalculator,
  FIXED_DOMINANT_ALLELE,

  // Verifikasi otomatis: pastikan tidak ada modul di layer ini yang
  // mendefinisikan fungsi bernama pola akses DOM. Ini pengecekan permukaan
  // (bukan static analysis penuh), tapi cukup untuk menangkap regresi kasar
  // seandainya suatu saat ada yang tidak sengaja menambah `document.*` di sini.
  assertNoDomAccess() {
    const offenders = [];
    Object.entries(this).forEach(([name, mod]) => {
      if (typeof mod !== 'object' || mod === null) return;
      const src = Object.values(mod)
        .filter((v) => typeof v === 'function')
        .map((fn) => fn.toString())
        .join('\n');
      if (/\bdocument\.|Utils\.qs|Utils\.createEl/.test(src)) offenders.push(name);
    });
    return offenders; // array kosong = aman
  }
};

// Layer 2 — logic pembelajaran; HARUS memanggil SimulationEngine untuk hasil
// genetika, TIDAK BOLEH menghitung sendiri (mis. tidak boleh ada `if geno === "AA"`)
const LearningEngine = {
  LearningManager,
  ChallengeManager,
  ExplanationEngine,
  ProgressManager,
  SummaryGenerator,
  GenerationTreeManager
};

// Layer 3 — DOM, drag-drop, animasi, modal, render; TIDAK BOLEH hardcode logic genetika
const PresentationLayer = {
  Renderer,
  ParentManager,
  ChildManager,
  PunnettRenderer,
  EducationPanel,
  DragDrop,
  SelectionToolbar,
  Animation,
  ConfirmDialog,
  HighlightSync,
  Ripple,
  GenerationTimeline,
  ActivityLog,
  DashboardManager,
  MenuManager,
  BackgroundManager,
  OrganismIllustration
};

document.addEventListener('DOMContentLoaded', UIController.init);
