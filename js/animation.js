/**
 * ============================================
 * ANIMATION HELPERS
 * ============================================
 * Kumpulan helper kecil untuk memicu animasi CSS pada elemen.
 * Semua animasi sesungguhnya didefinisikan di css/styles.css;
 * modul ini hanya bertugas menambah/menghapus class pada waktu
 * yang tepat, dan membersihkan diri sendiri setelah selesai.
 * ============================================
 */

/** Tambahkan class animasi, lalu hapus otomatis setelah animasi selesai. */
export function playOnce(el, className, duration = 500) {
    if (!el) return;
    el.classList.remove(className);
    // force reflow supaya animasi bisa di-retrigger
    void el.offsetWidth;
    el.classList.add(className);
    setTimeout(() => el.classList.remove(className), duration);
}

/** Animasi "pop" untuk kartu offspring baru yang muncul. */
export function popIn(el) {
    playOnce(el, 'anim-pop-in', 450);
}

/** Kilatan hijau singkat saat drop berhasil ke slot parent. */
export function flashSuccess(el) {
    playOnce(el, 'anim-flash-success', 500);
}

/** Animasi fade+scale untuk container hasil (Punnett Square) baru. */
export function fadeScaleIn(el, delay = 0) {
    if (!el) return;
    el.style.animationDelay = `${delay}ms`;
    el.classList.add('anim-fade-scale-in');
}

/** Stagger animasi pop-in untuk sekumpulan kartu (mis. galeri offspring). */
export function staggerPopIn(elements, gapMs = 40) {
    elements.forEach((el, i) => {
        setTimeout(() => popIn(el), i * gapMs);
    });
}
