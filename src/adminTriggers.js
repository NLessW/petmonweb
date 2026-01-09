/*
 * Copyright (c) 2026 (주)리한 (ReHAN Co. LTD.)
 * All rights reserved.
 *
 * 이 소프트웨어와 관련 문서의 저작권은 (주)리한에 있으며,
 * 저작권자의 서면 동의 없이 무단으로 복제, 배포, 수정, 전송할 수 없습니다.
 *
 * This software is the confidential and proprietary information of [ReHAN Co. LTD.].
 * You shall not disclose such Confidential Information and shall use it only in
 * accordance with the terms of the license agreement you entered into with [ReHAN Co. LTD.].
 */

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
