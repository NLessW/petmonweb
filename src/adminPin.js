// Reusable 6-digit admin PIN modal utility
(function () {
    const POPUP = document.getElementById('admin-pin-popup');
    const INPUT = document.getElementById('admin-pin-input');
    const SUBMIT = document.getElementById('admin-pin-submit');
    const CANCEL = document.getElementById('admin-pin-cancel');
    const KEYPAD = document.querySelector('.pin-keypad');
    const ERR = document.getElementById('admin-pin-error');
    const PIN = '250416';
    const FAIL_KEY = 'petmon.pinFailCount';
    let failCount = 0;
    try {
        failCount = Number(sessionStorage.getItem(FAIL_KEY) || '0') || 0;
    } catch {}

    function saveFailCount(n) {
        failCount = n;
        try {
            sessionStorage.setItem(FAIL_KEY, String(n));
        } catch {}
    }
    function resetFailCount() {
        saveFailCount(0);
    }
    let resolver = null;

    function open() {
        if (!POPUP) return;
        ERR && (ERR.textContent = '');
        if (INPUT) INPUT.value = '';
        POPUP.style.display = 'flex';
        setTimeout(() => INPUT && INPUT.focus(), 0);
    }
    function close() {
        if (!POPUP) return;
        POPUP.style.display = 'none';
    }
    function lockDevice() {
        try {
            // Flags: pause checks and mark locked
            window.__deviceLocked = true;
            window.__maintenanceMode = true;
            if (window.stopPeriodicStatusCheck) window.stopPeriodicStatusCheck();
        } catch {}

        // 실패 카운터는 잠금과 동시에 초기화 (다음 세션에서 즉시 잠금 방지)
        resetFailCount();

        // Update status cards
        try {
            const as = document.getElementById('arduino-status');
            const ms = document.getElementById('machine-status');
            if (as) {
                as.textContent = '일시정지';
                as.style.color = '#ffcc00';
            }
            if (ms) {
                ms.textContent = '비정상 행위 감지';
                ms.style.color = '#ff4d4d';
            }
        } catch {}

        // Disable and relabel start button
        try {
            const btn = document.getElementById('login-button');
            if (btn) {
                btn.disabled = true;
                btn.textContent = '비정상 행위 감지로 사용 불가';
                btn.title = '관리자 해제 전까지 사용 불가';
            }
        } catch {}

        // Hide admin test controls if visible
        try {
            const tc = document.getElementById('test-controls');
            if (tc) tc.style.display = 'none';
        } catch {}

        // Show banner message for 5s
        try {
            const banner = document.createElement('div');
            banner.className = 'alert-banner';
            banner.textContent = '관리자에게 알림이 전송되었습니다.';
            document.body.appendChild(banner);
            setTimeout(() => {
                try {
                    banner.remove();
                } catch {}
            }, 10000);
        } catch {}
    }

    // 관리자 해제(전부 활성화) 유틸리티: 잠금과 점검 모드 해제, UI 복구, 주기 점검 재개
    function unlockAll() {
        try {
            window.__deviceLocked = false;
            window.__maintenanceMode = false;
            // 기기 점검 플래그 해제
            try {
                sessionStorage.setItem('petmon.deviceMaintenance', '0');
            } catch {}
            // 실패 카운터 초기화 안정화
            resetFailCount();
        } catch {}

        // 상태 텍스트 원복 (중립 상태)
        try {
            const as = document.getElementById('arduino-status');
            const ms = document.getElementById('machine-status');
            if (as) {
                as.textContent = '정상';
                as.style.color = '';
            }
            if (ms) {
                ms.textContent = '가능';
                ms.style.color = '';
            }
        } catch {}

        // 시작 버튼 복구
        try {
            const btn = document.getElementById('login-button');
            if (btn) {
                btn.disabled = false;
                // 기존 텍스트가 있었다면 원복, 없으면 기본값
                if (btn.dataset && btn.dataset.originalText) {
                    btn.textContent = btn.dataset.originalText;
                    delete btn.dataset.originalText;
                } else {
                    btn.textContent = '시작하기';
                }
                btn.removeAttribute('title');
                btn.setAttribute('aria-disabled', 'false');
                btn.style.background = '';
                btn.style.color = '';
                btn.style.cursor = '';
                btn.style.opacity = '';
                btn.classList.remove('is-disabled');
            }
        } catch {}

        // 테스트 컨트롤 보이기 (있다면)
        try {
            const tc = document.getElementById('test-controls');
            if (tc) tc.style.display = '';
        } catch {}

        // 상태 주기 점검 재개
        try {
            if (window.startPeriodicStatusCheck) window.startPeriodicStatusCheck();
        } catch {}

        // 해제 안내 배너
        try {
            const banner = document.createElement('div');
            banner.className = 'alert-banner';
            banner.textContent = '관리자 해제 완료: 장비가 활성화되었습니다.';
            document.body.appendChild(banner);
            setTimeout(() => {
                try {
                    banner.remove();
                } catch {}
            }, 6000);
        } catch {}
    }

    function commit() {
        const v = (INPUT && INPUT.value ? INPUT.value : '').trim();
        if (v.length !== 6) {
            if (ERR) ERR.textContent = '비밀번호를 입력하세요.';
            return;
        }
        if (v === PIN) {
            close();
            // 성공 시 실패 카운터 초기화
            resetFailCount();
            resolver && resolver(true);
        } else {
            if (ERR) ERR.textContent = '비밀번호가 올바르지 않습니다.';
            // Increase fail count and persist this session
            saveFailCount((failCount || 0) + 1);

            // On third failure, lock device
            if (failCount >= 3 && !window.__deviceLocked) {
                close();
                lockDevice();
                // Reject current PIN attempt
                resolver && resolver(false);
            }
        }
    }

    if (KEYPAD) {
        KEYPAD.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const k = btn.getAttribute('data-k');
            if (!k || !INPUT) return;
            if (k === 'del') {
                INPUT.value = INPUT.value.slice(0, -1);
            } else if (k === 'clr') {
                INPUT.value = '';
            } else if (/^\d$/.test(k)) {
                if (INPUT.value.length < 6) INPUT.value += k;
            }
        });
    }
    if (SUBMIT) SUBMIT.addEventListener('click', commit);
    if (CANCEL)
        CANCEL.addEventListener('click', () => {
            close();
            resolver && resolver(false);
        });
    if (INPUT)
        INPUT.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
                close();
                resolver && resolver(false);
            }
        });

    // 전역 공개: 관리자 PIN 요구 및 전역 해제 유틸리티
    window.unlockAll = unlockAll;
    window.requireAdminPin = function () {
        // 잠긴 상태라면, PIN 확인을 통과한 후 관리자 진입 트리거에서 unlockAll을 호출하도록 한다.
        // 여기서는 단순히 PIN 입력만 처리.
        open();
        return new Promise((res) => {
            resolver = res;
        });
    };
})();
