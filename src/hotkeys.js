// Global hotkeys extras for ini picker fallback (Ctrl+Alt+I)
(function () {
    const FLAG_KEY = 'petmon.remoteBannerOn';
    const BANNER_ID = 'pm-remote-banner';

    function removeBanner() {
        const existing = document.getElementById(BANNER_ID);
        if (existing) existing.remove();
    }

    function createBanner() {
        const b = document.createElement('div');
        b.id = BANNER_ID;
        b.setAttribute('role', 'status');
        b.setAttribute('aria-live', 'polite');
        b.textContent = '관리자가 원격으로 점검중입니다';
        b.style.position = 'fixed';
        b.style.left = '0';
        b.style.right = '0';
        b.style.bottom = '0';
        b.style.zIndex = '2147483647';
        b.style.pointerEvents = 'none';
        b.style.background = 'rgba(253, 0, 0, 1)';
        b.style.color = '#fff';
        b.style.textAlign = 'center';
        b.style.font = '600 15px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
        b.style.padding = '10px 12px';
        b.style.letterSpacing = '0.3px';
        b.style.borderTop = '1px solid rgba(255,255,255,0.12)';
        b.style.boxShadow = '0 -4px 16px rgba(0,0,0,0.35)';
        b.style.userSelect = 'none';
        return b;
    }

    function ensureBanner(on) {
        if (on) {
            if (!document.getElementById(BANNER_ID)) {
                document.body.appendChild(createBanner());
            }
        } else {
            removeBanner();
        }
    }

    // 메인 UI(인덱스 페이지) 요소에만 적용되는 보조 함수들
    function setStatusesRemote(on) {
        const ar = document.getElementById('arduino-status');
        const ms = document.getElementById('machine-status');
        if (!ar || !ms) return; // 관리자 페이지 등에서는 무시
        if (on) {
            ar.innerText = '원격 점검 중';
            ms.innerText = '원격 점검 중';
            try {
                ar.style.color = '#f59e0b';
                ms.style.color = '#f59e0b';
            } catch {}
        } else {
            // 잠금/기기점검이 아니면 기본 상태로 복구
            if (!window.__deviceLocked && !window.__maintenanceMode) {
                ar.innerText = '정상';
                ms.innerText = '가능';
                try {
                    ar.style.color = '';
                    ms.style.color = '';
                } catch {}
            }
        }
    }

    function setStartButtonRemote(on) {
        const btn = document.getElementById('login-button');
        if (!btn) return;
        if (on) {
            if (typeof window.updateStartButton === 'function') {
                window.updateStartButton(false);
            } else {
                btn.disabled = true;
                if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent || '';
                btn.textContent = '원격 점검중 (사용 불가)';
                btn.style.background = '#9ca3af';
                btn.style.color = '#f3f4f6';
                btn.style.cursor = 'not-allowed';
                btn.style.opacity = '0.9';
                btn.classList.add('is-disabled');
                btn.setAttribute('aria-disabled', 'true');
                btn.title = '원격 점검 중이라 현재 시작할 수 없습니다.';
            }
        } else {
            // 잠금이나 기기 점검 상태면 사용 재개하지 않음
            if (window.__deviceLocked || window.__maintenanceMode) return;
            if (typeof window.updateStartButton === 'function') {
                window.updateStartButton(true);
            } else {
                btn.disabled = false;
                btn.textContent = btn.dataset.originalText || '시작하기';
                delete btn.dataset.originalText;
                btn.removeAttribute('title');
                btn.setAttribute('aria-disabled', 'false');
                btn.style.background = '';
                btn.style.color = '';
                btn.style.cursor = '';
                btn.style.opacity = '';
                btn.classList.remove('is-disabled');
            }
        }
    }

    function applyRemoteMode(on) {
        ensureBanner(on);
        // 인덱스 페이지에서만 주기 점검 제어 및 UI 반영
        try {
            if (on) {
                if (typeof window.stopPeriodicStatusCheck === 'function') window.stopPeriodicStatusCheck();
            } else {
                if (typeof window.startPeriodicStatusCheck === 'function' && !window.__maintenanceMode)
                    window.startPeriodicStatusCheck();
            }
        } catch {}
        setStatusesRemote(on);
        setStartButtonRemote(on);
    }

    // 초기 렌더: 같은 탭 내 페이지 전환 시 상태 유지
    function initBannerFromStorage() {
        try {
            const on = sessionStorage.getItem(FLAG_KEY) === '1';
            applyRemoteMode(on);
        } catch {}
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBannerFromStorage);
    } else {
        initBannerFromStorage();
    }

    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.altKey && (e.key === 'i' || e.key === 'I')) {
            if (window.pickAndLoadIni) {
                e.preventDefault();
                window.pickAndLoadIni();
            } else {
                alert('초기화 중입니다. 잠시 후 다시 시도하세요.');
            }
        }

        // Ctrl+Alt+P: 하단 고정 알림 토글 (숨겨진 버튼과 간섭 방지 위해 pointer-events:none)
        if (e.ctrlKey && e.altKey && (e.key === 'p' || e.key === 'P')) {
            e.preventDefault();
            const exists = !!document.getElementById(BANNER_ID);
            const next = !exists;
            try {
                sessionStorage.setItem(FLAG_KEY, next ? '1' : '0');
            } catch {}
            applyRemoteMode(next);
        }
    });
})();
