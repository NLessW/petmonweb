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

// Manager Repair 진입 트리거 (제목 5번 연속 3초 내 클릭)
(function () {
    const titleElement = document.querySelector('.petmon-title');
    if (!titleElement) return;

    const CLICK_COUNT = 5; // 필요한 클릭 횟수
    const TIME_WINDOW = 3000; // 시간 제한 (3초)
    let clickTimestamps = [];

    // PIN 팝업 요소
    const POPUP = document.getElementById('manager-repair-pin-popup');
    const INPUT = document.getElementById('manager-repair-pin-input');
    const SUBMIT = document.getElementById('manager-repair-pin-submit');
    const CANCEL = document.getElementById('manager-repair-pin-cancel');
    const KEYPAD = POPUP ? POPUP.querySelector('.pin-keypad') : null;
    const ERR = document.getElementById('manager-repair-pin-error');
    const CORRECT_PIN = '0119';

    function openPinPopup() {
        if (!POPUP) return;
        if (ERR) ERR.textContent = '';
        if (INPUT) INPUT.value = '';
        POPUP.style.display = 'flex';
        setTimeout(() => INPUT && INPUT.focus(), 100);
    }

    function closePinPopup() {
        if (!POPUP) return;
        POPUP.style.display = 'none';
        if (INPUT) INPUT.value = '';
        if (ERR) ERR.textContent = '';
    }

    function checkPin() {
        const enteredPin = INPUT ? INPUT.value : '';
        if (enteredPin === CORRECT_PIN) {
            closePinPopup();
            window.location.href = 'manager_repair.html';
        } else {
            if (ERR) {
                ERR.textContent = '비밀번호가 올바르지 않습니다.';
            }
            if (INPUT) {
                INPUT.value = '';
                INPUT.focus();
            }
        }
    }

    // 키패드 이벤트
    if (KEYPAD) {
        KEYPAD.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-k]');
            if (!btn || !INPUT) return;
            const k = btn.dataset.k;
            if (k === 'del') {
                INPUT.value = INPUT.value.slice(0, -1);
            } else if (k === 'clr') {
                INPUT.value = '';
            } else if (k.length === 1 && INPUT.value.length < 4) {
                INPUT.value += k;
            }
            INPUT.focus();
        });
    }

    // 확인 버튼
    if (SUBMIT) {
        SUBMIT.addEventListener('click', checkPin);
    }

    // 취소 버튼
    if (CANCEL) {
        CANCEL.addEventListener('click', closePinPopup);
    }

    // Enter 키로 확인
    if (INPUT) {
        INPUT.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                checkPin();
            } else if (e.key === 'Escape') {
                closePinPopup();
            }
        });
    }

    function handleTitleClick(e) {
        const now = Date.now();

        // 3초 이내의 클릭만 유지
        clickTimestamps = clickTimestamps.filter((timestamp) => now - timestamp < TIME_WINDOW);

        // 현재 클릭 추가
        clickTimestamps.push(now);

        // 5번 클릭 달성 시 PIN 팝업 표시
        if (clickTimestamps.length >= CLICK_COUNT) {
            clickTimestamps = []; // 초기화
            openPinPopup();
        }
    }

    // 마우스 및 터치 이벤트 모두 지원
    titleElement.addEventListener('click', handleTitleClick);
    titleElement.addEventListener('touchstart', (e) => {
        handleTitleClick(e);
    });

    // 터치 시 선택 방지 스타일 추가
    titleElement.style.userSelect = 'none';
    titleElement.style.webkitUserSelect = 'none';
    titleElement.style.cursor = 'default';
})();
