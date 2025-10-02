// Hidden admin entry triggers and toolbar admin-mode gate
(function () {
    // Left-bottom hidden 4-click trigger (within 5 seconds) -> adminManage.html, gated by PIN
    const btn = document.getElementById('admin-hidden-trigger');
    if (btn) {
        let count = 0;
        let timer = null;
        const REQUIRED = 4;
        const TIME_WINDOW = 5000;
        function reset() {
            count = 0;
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        }
        btn.addEventListener('click', () => {
            if (count === 0) timer = setTimeout(reset, TIME_WINDOW);
            count++;
            if (count >= REQUIRED) {
                reset();
                if (window.requireAdminPin) {
                    window
                        .requireAdminPin()
                        .then((ok) => {
                            if (ok) {
                                // 잠긴 상태면 관리자 페이지로 가지 않고 즉시 전부 해제
                                if (window.__deviceLocked && typeof window.unlockAll === 'function') {
                                    window.unlockAll();
                                    return;
                                }
                                // 평소엔 관리자 페이지로 이동
                                try {
                                    sessionStorage.setItem('petmon.adminPinOK', '1');
                                } catch {}
                                window.location.href = './src/adminManage.html';
                            }
                        })
                        .catch(() => {});
                } else {
                    const v = prompt('관리자 비밀번호 6자리');
                    if (v === '250416') {
                        if (window.__deviceLocked && typeof window.unlockAll === 'function') {
                            window.unlockAll();
                        } else {
                            window.location.href = './src/adminManage.html';
                        }
                    }
                }
            }
        });
    }
})();
