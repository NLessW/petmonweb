// 키오스크 UI에서 페이지 이탈(뒤로가기)을 막습니다
(function () {
    // 뒤로가기를 눌러도 현재 페이지로 유지되도록 더미 히스토리 상태를 추가
    function pushGuardState() {
        try {
            history.pushState({ kiosk: true }, document.title, location.href);
        } catch {}
    }

    // 뒤로/앞으로 이동 이벤트 가로채기
    window.addEventListener('popstate', (e) => {
        // 사용자가 뒤로가기를 눌러도 즉시 상태를 다시 추가하여 페이지 유지
        pushGuardState();
    });

    // 최초 로드 시 한 번 상태 추가
    pushGuardState();

    // 내비게이션에 사용되는 일반 단축키 차단 시도
    window.addEventListener(
        'keydown',
        (e) => {
            // Alt+좌/우(Windows), 또는 일부 환경에서 Backspace 내비게이션 차단
            const altNav = e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight');
            const backspaceNav =
                e.key === 'Backspace' && !['INPUT', 'TEXTAREA'].includes((e.target || {}).tagName || '');
            const browserShortcuts =
                (e.ctrlKey && (e.key === '[' || e.key === ']')) || // Ctrl+[ 또는 Ctrl+]
                (e.metaKey && (e.key === '[' || e.key === ']')); // macOS의 Cmd 조합(참고)
            if (altNav || backspaceNav || browserShortcuts) {
                e.preventDefault();
                e.stopPropagation();
            }
        },
        true
    );

    // 일부 기기에서 스와이프 뒤로가기 제스처도 방지 시도
    window.addEventListener(
        'touchstart',
        (e) => {
            // 화면 왼쪽 가장자리에서 시작한 터치를 소모하여 뒤로가기 제스처 방지(최선 시도)
            try {
                if (e.touches && e.touches.length && e.touches[0].clientX < 16) {
                    e.preventDefault();
                }
            } catch {}
        },
        { passive: false }
    );
})();
