// // 상태 확인 중...
// document.getElementById('arduino-status').innerText = '상태 확인 중...';
// document.getElementById('machine-status').innerText = '상태 확인 중...';

// 시작하기 버튼 상태 업데이트 헬퍼
function updateStartButton(enabled) {
    const btn = document.getElementById('login-button');
    if (!btn) return;

    // [GUARD] 점검/하드락이면 무조건 비활성
    const inMaintenance = !!(window && window.__maintenanceMode);
    const hardLock = !!(window && window.__hardLock);
    const finalEnabled = !inMaintenance && !hardLock && !!enabled;

    btn.disabled = !finalEnabled;
    btn.setAttribute('aria-disabled', String(!finalEnabled));
    if (finalEnabled) {
        btn.classList.remove('is-disabled');
        btn.style.cursor = '';
        btn.style.opacity = '';
    } else {
        btn.classList.add('is-disabled');
        btn.style.cursor = 'not-allowed';
        btn.style.opacity = '0.9';
    }
    // 버튼 라벨은 index.js(updateLoginButtonByStatus)가 관리
}

// 아두이노 연결됨
function setArduinoConnected() {
    const statusElement = document.getElementById('arduino-status');
    statusElement.innerText = '정상';
    statusElement.style.color = '#00ff4c'; // 초록색
    const machineStatusElement = document.getElementById('machine-status');
    machineStatusElement.innerText = '가능';
    machineStatusElement.style.color = '#00ff4c'; // 초록색
    // 시작하기 버튼 활성화
    updateStartButton(true);
}

// 아두이노 연결 끊김
function setArduinoDisconnected() {
    const statusElement = document.getElementById('arduino-status');
    statusElement.innerText = '접속 중';
    statusElement.style.color = '#ff4d4d'; // 빨간색
    const machineStatusElement = document.getElementById('machine-status');
    machineStatusElement.innerText = '투입 불가';
    machineStatusElement.style.color = '#ff4d4d'; // 빨간색
    // 시작하기 버튼 비활성화
    updateStartButton(false);
}

// 이전에 선택한 USB 포트를 저장할 키
const USB_PORT_KEY = 'selectedUsbPort';

// 저장된 USB 포트를 가져오는 함수
function getSavedUsbPort() {
    return localStorage.getItem(USB_PORT_KEY);
}

// USB 포트를 저장하는 함수
function saveUsbPort(port) {
    localStorage.setItem(USB_PORT_KEY, port);
}

// 초기 버튼 상태는 안전하게 비활성화
updateStartButton(false);

// 세션에 저장된 기기 점검 플래그 반영 (관리자 페이지에서 토글)
(function initDeviceMaintenanceFromStorage() {
    try {
        const devOn = sessionStorage.getItem('petmon.deviceMaintenance') === '1';
        if (devOn) {
            window.__maintenanceMode = true;
            // UI도 즉시 점검중 상태로 반영
            setArduinoDisconnected();
        }
    } catch {}
})();

// 저장된 USB 포트를 확인하고 상태를 검사하는 함수
async function checkSavedUsbPort() {
    const savedPort = getSavedUsbPort();
    if (!savedPort) {
        // 저장된 포트가 없으면 점검중 처리
        setArduinoDisconnected();
        return;
    }

    try {
        const devices = await navigator.usb.getDevices();
        const matchedDevice = devices.find((device) => device.serialNumber === savedPort);

        if (matchedDevice) {
            setArduinoConnected();
        } else {
            setArduinoDisconnected();
        }
    } catch (error) {
        console.error('Error checking saved USB port:', error);
        setArduinoDisconnected();
    }
}

// USB 포트 선택 시 저장하는 로직 (예시)
async function selectUsbPort() {
    try {
        const device = await navigator.usb.requestDevice({
            filters: [{ vendorId: 0x2341 }], // 예: Arduino의 vendorId
        });

        saveUsbPort(device.serialNumber);
    } catch (error) {
        console.error('Error selecting USB port:', error);
    }
}

// ========== Fa-duino 연결 상태 점검 전용 ==========
// 기존 전역 port/reader/writer와 충돌을 피하기 위해 상태 점검은 로컬 변수만 사용합니다.
async function checkArduinoStatusOnce() {
    try {
        const ports = await navigator.serial.getPorts();

        if (!ports || ports.length === 0) {
            // 사용자가 포트를 허용하지 않았거나 장치가 없음
            setArduinoDisconnected();
            return;
        }

        const port = ports[0];

        // 이미 다른 로직(index.js 등)에서 사용 중이면 닫지 말고 상태만 표시
        const isInUse = (port.readable && port.readable.locked) || (port.writable && port.writable.locked);
        if (isInUse) {
            setArduinoConnected();
            return;
        }

        let openedHere = false;
        // 열려있지 않다면 잠깐 열어보고 닫는다(스트림은 만들지 않음)
        if (!(port.readable || port.writable)) {
            await port.open({ baudRate: 9600 });
            openedHere = true;
        }

        // 여기까지 왔으면 연결 가능 상태
        setArduinoConnected();

        // 우리가 열었을 때만 닫는다. 스트림을 만들지 않았기 때문에 락 이슈 없음
        if (openedHere) {
            try {
                await port.close();
            } catch (closeErr) {
                console.warn('Status check: port close failed (ignored)', closeErr);
            }
        }
    } catch (err) {
        console.error('Status check error:', err);
        setArduinoDisconnected();
    }
}

// 10분마다 상태 확인 타이머 설정
let statusCheckInterval;

// 유지보수(점검) 모드 플래그
window.__maintenanceMode = window.__maintenanceMode || false;

// 외부에서 상태 체크 타이머를 중지/재개할 수 있도록 공개 함수 제공
window.stopPeriodicStatusCheck = function () {
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
        statusCheckInterval = null;
    }
};
window.startPeriodicStatusCheck = function () {
    try {
        clearInterval(statusCheckInterval);
    } catch {}
    // [GUARD] 하드락/점검 중에는 시작하지 않음
    if (window.__maintenanceMode || window.__hardLock) return;
    statusCheckInterval = setInterval(periodicStatusCheck, 10 * 60 * 1000);
    // 즉시 1회 실행
    periodicStatusCheck();
};

async function periodicStatusCheck() {
    // [GUARD] 하드락/점검이면 아무 것도 하지 않음
    if (window.__maintenanceMode || window.__hardLock) {
        updateStartButton(false);
        return;
    }

    if (statusCheckInterval) {
        clearInterval(statusCheckInterval); // 기존 타이머 초기화
        statusCheckInterval = null;
    }

    // 점검 모드면 주기 체크를 아예 멈춘다
    if (window.__maintenanceMode) {
        console.log('Maintenance mode active; periodic status checks paused.');
        return;
    }

    // 첫 연결 시 즉시 상태 확인 (에러는 잡아서 콘솔만 남김)
    console.log('초기 상태 확인 중...');
    try {
        await checkArduinoStatusOnce();
    } catch (e) {
        console.debug('Initial status check ignored error', e);
    }

    // 이후 10분마다 상태 확인 (에러는 삼켜서 UI 끊김 방지)
    statusCheckInterval = setInterval(async () => {
        // 점검 모드가 되면 즉시 중단
        if (window.__maintenanceMode) {
            window.stopPeriodicStatusCheck();
            return;
        }
        // 프로세스 화면이 활성화된 경우 상태 체크를 건너뛰어 간섭 방지
        const processEl = document.getElementById('process-screen');
        if (processEl && getComputedStyle(processEl).display !== 'none') {
            return;
        }

        console.log('10분마다 상태 확인 중...');
        try {
            await checkArduinoStatusOnce();
        } catch (e) {
            console.debug('Periodic status check ignored error', e);
        }
    }, 10 * 60 * 1000); // 10분 테스트는 1분.
}

// 페이지 로드 시 상태 확인 타이머 시작 (점검 모드가 아니어야 시작)
window.addEventListener('load', () => {
    checkSavedUsbPort();
    if (!window.__maintenanceMode) {
        periodicStatusCheck();
    }
});
