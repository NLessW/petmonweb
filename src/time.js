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

// 관리자 로그인 시 버튼 사라지면 시간 오른쪽 정렬 유지
const adminBtn = document.getElementById('admin-login-btn');
adminBtn.addEventListener('click', () => {
    adminBtn.style.display = 'none';
});
