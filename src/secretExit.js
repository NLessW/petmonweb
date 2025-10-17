// Secret exit button: 4 clicks within 2 seconds triggers an exit/close sequence.
(function () {
    const btn = document.getElementById('secret-exit-btn');
    if (!btn) return;

    const REQUIRED = 4;
    const TIME_WINDOW = 2000;
    let count = 0;
    let timer = null;

    function reset() {
        count = 0;
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    }

    function doExit() {
        // If running under Electron, request a true application quit.
        try {
            if (window.petmonNative && window.petmonNative.isElectron && window.petmonNative.exit) {
                window.petmonNative.exit();
                return;
            }
        } catch {}

        // Browser fallback
        try {
            window.open('', '_self');
            window.close();
        } catch {}
        try {
            location.replace('about:blank');
        } catch {}
        setTimeout(() => {
            try {
                location.replace(
                    'data:text/html;charset=utf-8,%3Chtml%3E%3Cbody%20style%3D%22background%3A%23000%3Bmargin%3A0%22%3E%3C%2Fbody%3E%3C%2Fhtml%3E'
                );
            } catch {}
        }, 50);
        setTimeout(() => {
            try {
                document.documentElement.innerHTML = '';
                document.documentElement.style.background = '#000';
            } catch {}
        }, 100);
    }

    async function triggerExitWithPin() {
        // 관리자 PIN 확인 후 종료 수행
        try {
            if (typeof window.requireAdminPin === 'function') {
                const ok = await window.requireAdminPin();
                if (ok) {
                    doExit();
                }
                return;
            }
        } catch {}
        // fallback: PIN 모듈이 없는 경우 바로 종료
        doExit();
    }

    const onClick = () => {
        if (count === 0) timer = setTimeout(reset, TIME_WINDOW);
        count++;
        if (count >= REQUIRED) {
            reset();
            // PIN 통과 후 종료
            triggerExitWithPin();
        }
    };

    // Primary binding
    btn.addEventListener('click', onClick);

    // Defensive re-binding if element re-created
    window.addEventListener('DOMContentLoaded', () => {
        const b = document.getElementById('secret-exit-btn');
        if (!b) return;
        if (!b.__pm_bound) {
            b.__pm_bound = true;
            let c = 0;
            let t = null;
            const reset2 = () => {
                c = 0;
                if (t) {
                    clearTimeout(t);
                    t = null;
                }
            };
            b.addEventListener('click', async () => {
                if (c === 0) t = setTimeout(reset2, TIME_WINDOW);
                c++;
                if (c >= REQUIRED) {
                    reset2();
                    await triggerExitWithPin();
                }
            });
        }
    });
})();
