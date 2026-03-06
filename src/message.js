// 관리자 메세지 모달 트리거 키 ctrl+i
document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'i') {
        const modal = document.getElementById('admin-message-modal');
        if (modal.style.display === 'none' || modal.style.display === '') {
            modal.style.display = 'flex';
            document.getElementById('admin-message-input').focus();
        } else {
            modal.style.display = 'none';
        }
    }
});

// 폰트 사이즈 조절 버튼 이벤트
document.addEventListener('click', function (e) {
    if (e.target && (e.target.id === 'font-increase-btn' || e.target.id === 'font-decrease-btn')) {
        const fontSizeArea = document.getElementById('admin-message-input');
        const currentFontSize = window.getComputedStyle(fontSizeArea, null).getPropertyValue('font-size');
        let fontSize = parseFloat(currentFontSize);

        if (e.target.id === 'font-increase-btn') {
            fontSize += 2;
        } else if (e.target.id === 'font-decrease-btn') {
            fontSize -= 2;
            if (fontSize < 10) fontSize = 10; // 최소 폰트 크기 제한
        }
        fontSizeArea.style.fontSize = fontSize + 'px';
    }
});
// 단축키 입력시 저장된 메세지 입력 ctrl+alt+1~9
document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey && e.altKey) || e.getModifierState('AltGraph')) {
        if (e.code.startsWith('Digit')) {
            const num = Number(e.code.replace('Digit', ''));
            if (num >= 1 && num <= 9) {
                const index = num - 1;

                const savedMessages = JSON.parse(
                    localStorage.getItem('adminSavedMessages') ||
                        '["페트병을 깊숙히 넣어주세요.", "창을 닫아드리면 다시 시도해보세요."]'
                );

                if (savedMessages[index]) {
                    const messageInput = document.getElementById('admin-message-input');
                    const modal = document.getElementById('admin-message-modal');

                    messageInput.value = savedMessages[index];
                    modal.style.display = 'flex';
                    messageInput.focus();
                }
            }
        }
    }
});
