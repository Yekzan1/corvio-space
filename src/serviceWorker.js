// ==========================================
// SERVICE WORKER (PWA) — registration + auto-update handling
// ==========================================

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(reg => {
            // Periodically check for updates (every 30 minutes while the tab is open)
            setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
            // And check on tab focus
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') reg.update().catch(() => {});
            });

            // Detect when a new SW is waiting
            reg.addEventListener('updatefound', () => {
                const newSW = reg.installing;
                if (!newSW) return;
                newSW.addEventListener('statechange', () => {
                    if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
                        // New version installed and waiting → tell user
                        showUpdateToast(newSW);
                    }
                });
            });

            // If a new SW already controls us (took over via clients.claim), reload
            let refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (refreshing) return;
                refreshing = true;
                window.location.reload();
            });
        }).catch(err => {
            // Conserve, et en warn : c'est le seul signal qu'il reste quand le
            // hors-ligne ne fonctionne pas. Les deux autres traces de ce
            // fichier — « SW registered » et « SW updated to » — n'annoncaient
            // qu'un succes : du bruit dans la console d'un client.
            console.warn('Le service worker n\'a pas pu être enregistré : le mode hors ligne sera indisponible.', err);
        });

        // Listen for messages from SW
        navigator.serviceWorker.addEventListener('message', e => {
            if (e.data?.type === 'SW_UPDATED') {
                // Rien a journaliser : showUpdateToast() previent deja
                // l'utilisateur, ce qui est le seul canal qui compte.
            }
        });
    });
}

// Toast UI for "new version available"
function showUpdateToast(waitingSW) {
    // Avoid stacking
    if (document.getElementById('update-toast')) return;
    const div = document.createElement('div');
    div.id = 'update-toast';
    div.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #46615C, #B09964);
        color: white;
        padding: 12px 20px;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(40,53,51,0.35), 0 0 20px rgba(70,97,92,0.5);
        display: flex;
        align-items: center;
        gap: 12px;
        z-index: 99999;
        font-size: 0.9rem;
        font-weight: 500;
        animation: slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    `;
    div.innerHTML = `
        <span>Une nouvelle version est disponible</span>
        <button id="update-now" style="background:white;color:#46615C;border:none;padding:6px 14px;border-radius:8px;font-weight:600;cursor:pointer;font-size:0.85rem">Recharger</button>
        <button id="update-later" style="background:rgba(255,255,255,0.2);color:white;border:none;padding:6px 10px;border-radius:8px;cursor:pointer;font-size:0.85rem">Plus tard</button>
    `;
    document.body.appendChild(div);

    if (!document.getElementById('update-toast-style')) {
        const style = document.createElement('style');
        style.id = 'update-toast-style';
        style.textContent = '@keyframes slideDown{from{transform:translateX(-50%) translateY(-100%);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}';
        document.head.appendChild(style);
    }

    document.getElementById('update-now').addEventListener('click', () => {
        // Tell the new SW to take over → controllerchange listener will reload
        waitingSW.postMessage({ type: 'SKIP_WAITING' });
        div.remove();
    });
    document.getElementById('update-later').addEventListener('click', () => {
        div.remove();
    });
}
