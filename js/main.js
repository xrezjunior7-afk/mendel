/**
 * ============================================
 * APP ENTRY POINT
 * ============================================
 */
import { AppState, initTheme, subscribe } from './stateManager.js';
import { renderApp } from './uiRenderer.js';

subscribe(renderApp);

async function init() {
    initTheme();
    try {
        const response = await fetch('./data.json');
        AppState.data = await response.json();
    } catch (err) {
        console.error('Gagal memuat data.json', err);
        document.getElementById('loading-text').textContent = 'Gagal memuat data. Coba muat ulang halaman.';
        return;
    }

    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    renderApp();
}

init();
