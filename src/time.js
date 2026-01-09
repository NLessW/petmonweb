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

// 시간 표시 (요일, 줄바꿈)
function updateAdminTime() {
    const now = new Date();
    const week = ['일', '월', '화', '수', '목', '금', '토'];
    const dateStr =
        now.getFullYear() +
        '.' +
        String(now.getMonth() + 1).padStart(2, '0') +
        '.' +
        String(now.getDate()).padStart(2, '0') +
        '(' +
        week[now.getDay()] +
        '요일)';
    const timeStr =
        String(now.getHours()).padStart(2, '0') +
        ':' +
        String(now.getMinutes()).padStart(2, '0') +
        ':' +
        String(now.getSeconds()).padStart(2, '0');
    document.getElementById('admin-time').textContent = dateStr + '\n' + timeStr;
}
updateAdminTime();
setInterval(updateAdminTime, 1000);
