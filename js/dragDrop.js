/**
 * ============================================
 * DRAG & DROP MODULE
 * ============================================
 * Sistem drag-and-drop generik berbasis Pointer Events, sehingga
 * bekerja secara konsisten di desktop (mouse) maupun mobile (touch/pen)
 * tanpa harus mengandalkan HTML5 Drag & Drop API yang perilakunya
 * berbeda-beda di tiap browser mobile.
 *
 * Juga menyediakan mode "pick & place" via klik/keyboard sebagai
 * alternatif aksesibel bagi pengguna yang tidak bisa melakukan drag.
 * ============================================
 */

let activeGhost = null;
let activeCardData = null;
let activeSourceEl = null;
let dropZones = [];
let pickedCard = null; // { data, el } — untuk mode klik/keyboard
let onPickChangeCb = null;

/**
 * Daftarkan sebuah elemen sebagai kartu yang bisa di-drag.
 * @param {HTMLElement} el
 * @param {object} cardData
 * @param {{onPick?: (data:object)=>void}} opts
 */
export function makeDraggable(el, cardData, opts = {}) {
    el.setAttribute('draggable', 'false'); // matikan HTML5 DnD bawaan
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    el.classList.add('draggable-card');

    el.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
        startDrag(el, cardData, e);
    });

    // Aksesibilitas: Enter/Space untuk "ambil" kartu ini
    el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setPicked(cardData, el);
        }
    });

    el.addEventListener('click', (e) => {
        // Klik singkat (tanpa drag) juga berlaku sebagai "pick"
        if (e.detail === 0) return; // berasal dari keydown, sudah ditangani
        setPicked(cardData, el);
    });
}

/**
 * Daftarkan sebuah elemen sebagai drop zone.
 * @param {HTMLElement} el
 * @param {(data:object)=>void} onDrop
 */
export function makeDropZone(el, onDrop) {
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    el.classList.add('drop-zone');

    const zone = { el, onDrop };
    dropZones.push(zone);

    el.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && pickedCard) {
            e.preventDefault();
            onDrop(pickedCard.data);
            clearPicked();
        }
    });

    el.addEventListener('click', () => {
        if (pickedCard) {
            onDrop(pickedCard.data);
            clearPicked();
        }
    });

    return () => {
        dropZones = dropZones.filter(z => z !== zone);
    };
}

export function resetDropZones() {
    dropZones = [];
}

function setPicked(data, el) {
    clearPicked();
    pickedCard = { data, el };
    el.classList.add('card-picked');
    document.querySelectorAll('.drop-zone').forEach(z => z.classList.add('drop-zone-active'));
    if (onPickChangeCb) onPickChangeCb(pickedCard);
}

function clearPicked() {
    if (pickedCard?.el) pickedCard.el.classList.remove('card-picked');
    document.querySelectorAll('.drop-zone').forEach(z => z.classList.remove('drop-zone-active'));
    pickedCard = null;
    if (onPickChangeCb) onPickChangeCb(null);
}

export function onPickChange(cb) {
    onPickChangeCb = cb;
}

function startDrag(sourceEl, cardData, downEvent) {
    downEvent.preventDefault();
    const rect = sourceEl.getBoundingClientRect();
    const offsetX = downEvent.clientX - rect.left;
    const offsetY = downEvent.clientY - rect.top;

    const ghost = sourceEl.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    document.body.appendChild(ghost);

    activeGhost = ghost;
    activeCardData = cardData;
    activeSourceEl = sourceEl;
    sourceEl.classList.add('card-dragging-source');

    let moved = false;

    function onMove(e) {
        moved = true;
        ghost.style.left = `${e.clientX - offsetX}px`;
        ghost.style.top = `${e.clientY - offsetY}px`;

        const target = elementFromPointIgnoringGhost(e.clientX, e.clientY, ghost);
        const zone = dropZones.find(z => z.el === target || z.el.contains(target));
        dropZones.forEach(z => z.el.classList.toggle('drop-zone-hover', z === zone));
    }

    function onUp(e) {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);

        const target = elementFromPointIgnoringGhost(e.clientX, e.clientY, ghost);
        const zone = dropZones.find(z => z.el === target || z.el.contains(target));

        ghost.remove();
        sourceEl.classList.remove('card-dragging-source');
        dropZones.forEach(z => z.el.classList.remove('drop-zone-hover'));
        activeGhost = null;
        activeCardData = null;
        activeSourceEl = null;

        if (moved && zone) {
            zone.onDrop(cardData);
        } else if (!moved) {
            // Dianggap klik biasa -> mode pick & place
            setPicked(cardData, sourceEl);
        }
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
}

function elementFromPointIgnoringGhost(x, y, ghost) {
    ghost.style.display = 'none';
    const el = document.elementFromPoint(x, y);
    ghost.style.display = '';
    return el;
}
