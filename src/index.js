//
// ========== 호스팅 땐 console.log 주석 처리나 제거 ==========
const loginButton = document.getElementById('login-button');
const loginPopup = document.getElementById('login-popup');
const loginSubmit = document.getElementById('login-submit');
const phoneNumberInput = document.getElementById('phone-number');
const processMessage = document.getElementById('process-message');
const stopButton = document.getElementById('stop-button');
const returnHomeButton = document.getElementById('return-home');
const keypad = document.querySelector('.keypad');
const addMoreButton = document.getElementById('add-more-button');
const mainScreen = document.getElementById('main-screen');
const processScreen = document.getElementById('process-screen');
const endScreen = document.getElementById('end-screen');
const errorScreen = document.getElementById('error-screen');
const statusHostMain = document.getElementById('status-host-main');
const statusHostProcess = document.getElementById('status-host-process');
const statusSection = document.getElementById('status-section');

const closeDoorButton = document.createElement('button');
closeDoorButton.id = 'close-door-button';
closeDoorButton.textContent = '닫힘';
closeDoorButton.style =
    'margin-top:24px;font-size:1.5rem;padding:12px 32px;background:#3772ff;color:#fff;border:none;border-radius:8px;cursor:pointer;display:block;';

let port, reader, writer;
let isConnected = false;
let isStopped = false;
let autoReturnTimeout;
let countdownInterval;
let errorAutoTimer;
let errorCountdownTimer;

// 장치 분리(케이블 탈거 등) 발생 시 공통 처리
async function teardownSerial() {
    try {
        if (reader) {
            try {
                await reader.cancel?.();
            } catch {}
            try {
                reader.releaseLock?.();
            } catch {}
        }
        if (writer) {
            try {
                writer.releaseLock?.();
            } catch {}
        }
        if (port) {
            try {
                await port.close();
            } catch {}
        }
    } finally {
        port = undefined;
        reader = undefined;
        writer = undefined;
        isConnected = false;
    }
}

function handleDeviceLost(err) {
    const msg = String((err && (err.message || err)) || '').toLowerCase();
    const lost = msg.includes('device has been lost');
    const networkErr = err && err.name === 'NetworkError';
    if (lost || networkErr) {
        // 연결 해제 및 사용자 안내
        teardownSerial();
        showErrorScreen('기기와의 연결이 끊어졌습니다.\n관리자에게 문의 바랍니다. 1644-1224');
        return true;
    }
    return false;
}

// 아두이노는 줄 단위 명령 처리 -> 항상 \n 포함
function writeCmd(cmd) {
    if (!writer) return Promise.resolve();
    try {
        return writer.write(cmd + '\n');
    } catch (e) {
        console.error('writeCmd 실패:', cmd, e);
        return Promise.reject(e);
    }
}

// Removed Firebase initialization and database usage
let currentPhoneNumber = '';

// 투입 횟수 누적 및 최종 처리 상태
let depositCount = 0;
let isFinalizing = false;

// 포인트 적립 API 호출
async function callPointApi(mobileWithHyphens, count) {
    const apiUrl = 'https://petcycle.mycafe24.com/point_api.php';
    const mobile = (mobileWithHyphens || '').replace(/[^0-9]/g, '');
    const payload = {
        device: 'SW0001',
        mobile: mobile,
        input_cnt: Number(count),
    };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json;charset=UTF-8',
                Accept: 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const text = await response.text(); // 일부 응답이 JSON이 아닐 수 있으므로 먼저 text로 받음
        let parsed;
        try {
            parsed = text ? JSON.parse(text) : null;
        } catch {
            parsed = text; // 파싱 실패 시 원문 텍스트 보존
        }

        if (!response.ok) {
            // 서버가 에러 메시지를 JSON으로 보냈다면 그 메시지를 사용
            const errMsg = parsed && parsed.message ? parsed.message : `HTTP 오류: ${response.status}`;
            throw new Error(errMsg);
        }

        return parsed;
    } catch (error) {
        console.error('포인트 API 호출 실패:', error);
        throw error;
    }
}

// 누적 투입 횟수로 API 호출 후 메인으로 복귀
async function finalizeAndReturnHome() {
    if (isFinalizing) return;
    isFinalizing = true;
    try {
        if (currentPhoneNumber && depositCount > 0) {
            const result = await callPointApi(currentPhoneNumber, depositCount);
            if (result && result.status === 'error') {
                console.error('포인트 API 응답 오류:', result.message || result);
                // 필요하면 사용자에게 알리거나 retry 로직 추가
            } else {
                console.log('포인트 적립 결과:', result);
            }
        }
    } catch (e) {
        console.error('포인트 적립 중 예외 발생:', e);
        // 실패해도 화면 복귀는 진행
    } finally {
        depositCount = 0;
        showScreen('main-screen');
        isFinalizing = false;
    }
}

// ========== 화면 전환 ==========
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach((s) => (s.style.display = 'none'));
    document.getElementById(screenId).style.display = 'flex';

    // 상태 패널 위치 이동: 프로세스 중엔 오른쪽, 그 외엔 메인 위치
    if (statusSection && statusHostMain && statusHostProcess) {
        if (screenId === 'process-screen') {
            statusHostProcess.appendChild(statusSection);
        } else {
            statusHostMain.appendChild(statusSection);
        }
    }

    if (screenId === 'end-screen') {
        let countdown = 10;
        const endScreen = document.getElementById('end-screen');
        endScreen.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;">
                <div style="margin-bottom:24px;">
                    <svg width="100" height="100" viewBox="0 0 64 64" fill="none">
                        <circle cx="32" cy="32" r="30" fill="#e3f0ff" stroke="#3772ff" stroke-width="4"/>
                        <path d="M20 34l8 8 16-16" stroke="#3772ff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                    </svg>
                </div>
                <div style="font-size:2.4rem;font-weight:bold;color:#3772ff;margin-bottom:12px;">
                    포인트가 적립되었습니다!
                </div>
                <div style="font-size:1.5rem;color:#fff;margin-bottom:24px;">
                    참여해주셔서 감사합니다.<br>
                    <span id="end-countdown" style="color:#fff;font-weight:bold;">${countdown}</span>초 뒤 처음 화면으로 돌아갑니다.
                </div>
                <button id="add-more-button" style="font-size:1.2rem;padding:10px 28px;background:#3772ff;color:#fff;border:none;border-radius:8px;cursor:pointer;margin-bottom:12px;">
                    페트병 더 넣기
                </button>
                <button id="return-home" style="font-size:1.2rem;padding:10px 28px;background:#fff;color:#3772ff;border:2px solid #3772ff;border-radius:8px;cursor:pointer;">
                    처음 화면으로
                </button>
            </div>
        `;
        // 카운트다운
        const countdownText = document.getElementById('end-countdown');
        countdownInterval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                countdownText.textContent = countdown;
            } else clearInterval(countdownInterval);
        }, 1000);

        // 자동 복귀: 포인트 API 호출 후 메인으로
        autoReturnTimeout = setTimeout(() => {
            finalizeAndReturnHome();
        }, 10000);

        // 버튼 이벤트 재연결
        document.getElementById('add-more-button').onclick = async () => {
            clearTimeout(autoReturnTimeout);
            clearInterval(countdownInterval);
            await startProcess();
        };
        document.getElementById('return-home').onclick = () => {
            clearTimeout(autoReturnTimeout);
            clearInterval(countdownInterval);
            finalizeAndReturnHome();
        };
    } else {
        clearTimeout(autoReturnTimeout);
        clearInterval(countdownInterval);
    }

    // 메인화면으로 돌아갈 때 아두이노에 'X' 신호 전송 및 세션 초기화
    if (screenId === 'main-screen') {
        if (writer) {
            try {
                writeCmd('X');
            } catch (e) {
                console.error('아두이노로 X 신호 전송 실패:', e);
            }
        }
        phoneNumberInput.value = '';
        currentPhoneNumber = '';
        depositCount = 0; // 세션 종료 시 카운트 초기화
    }
}

// 오류 화면 표시 및 점검 모드 전환
function showErrorScreen(message) {
    try {
        clearTimeout(errorAutoTimer);
        clearInterval(errorCountdownTimer);
    } catch {}
    // 유지보수 모드 진입 및 주기 체크 중단
    if (window) {
        window.__maintenanceMode = true;
        if (window.stopPeriodicStatusCheck) {
            window.stopPeriodicStatusCheck();
        }
    }
    // 상태를 점검중으로 표시
    const arduinoStatus = document.getElementById('arduino-status');
    const machineStatus = document.getElementById('machine-status');
    if (arduinoStatus) {
        arduinoStatus.textContent = '점검중';
        arduinoStatus.style.color = '#ff4d4d';
    }
    if (machineStatus) {
        machineStatus.textContent = '점검중';
        machineStatus.style.color = '#ff4d4d';
    }
    // 로그인 버튼 비활성화 및 라벨 변경
    if (loginButton) {
        loginButton.disabled = true;
        loginButton.textContent = '점검중';
    }

    const msgEl = document.getElementById('error-message');
    if (msgEl) msgEl.textContent = message || '기기 오류가 발생했습니다. 관리자에게 문의해주세요.';
    const phoneEl = document.getElementById('error-phone');
    if (phoneEl) phoneEl.textContent = `입력한 전화번호: ${currentPhoneNumber || '-'}`;
    showScreen('error-screen');

    const callBtn = document.getElementById('call-support');
    if (callBtn) {
        callBtn.onclick = () => {
            try {
                window.location.href = 'tel:1644-1224';
            } catch {
                alert('고객센터 전화번호: 1644-1224');
            }
        };
    }
    const ret = document.getElementById('error-return-home');
    if (ret) {
        ret.onclick = () => {
            clearTimeout(errorAutoTimer);
            clearInterval(errorCountdownTimer);
            showScreen('main-screen');
        };
    }

    // 10초 카운트다운 후 메인으로
    let sec = 10;
    const cd = document.getElementById('error-countdown');
    if (cd) cd.textContent = '10초 뒤 처음 화면으로 돌아가며, 장비 상태는 점검중으로 전환됩니다.';
    errorCountdownTimer = setInterval(() => {
        sec--;
        if (cd) cd.textContent = `${sec}초 뒤 처음 화면으로 돌아가며, 장비 상태는 점검중으로 전환됩니다.`;
        if (sec <= 0) clearInterval(errorCountdownTimer);
    }, 1000);
    errorAutoTimer = setTimeout(() => {
        showScreen('main-screen');
    }, 10000);
}

// ========== 프로세스 실행 ==========
// 단계별 SVG 아이콘 (위아래로 움직이는 투입구 느낌)
const processIcons = [
    // 1. 투입구 열림 (큰 원 + 안쪽에 반 크기 타원, 구분선)
    `<svg width="90" height="90" viewBox="0 0 64 64" fill="none">
        <!-- 바깥 원 (투입구) -->
        <circle cx="32" cy="32" r="24" fill="#fff" stroke="#23262f" stroke-width="3"/>
        <!-- 안쪽 타원 (열림) -->
        <circle cx="32" cy="10" r="24" ry="10" fill="#3772ff" stroke="#23262f" stroke-width="3"/>
    </svg>`,
    // 2. 투입구 닫힘 (투입구 전체가 원, 구분선)
    `<svg width="90" height="90" viewBox="0 0 64 64" fill="none">
        <circle cx="32" cy="32" r="24" fill="#3772ff" stroke="#23262f" stroke-width="3"/>
    </svg>`,
    // 3. 판별중(돋보기)
    `<svg width="90" height="90" viewBox="0 0 64 64" fill="none">
        <circle cx="28" cy="28" r="16" stroke="#3772ff" stroke-width="6" fill="#fff"/>
        <rect x="40" y="40" width="16" height="6" rx="3" transform="rotate(45 40 40)" fill="#3772ff"/>
    </svg>`,
    // 4. 수집중(회전 애니메이션)
    `<svg width="90" height="90" viewBox="0 0 64 64" fill="none" class="spin">
        <circle cx="32" cy="32" r="24" stroke="#3772ff" stroke-width="8" fill="none" opacity="0.2"/>
        <path d="M32 8a24 24 0 1 1-17 41" stroke="#3772ff" stroke-width="8" fill="none"/>
        <circle cx="32" cy="8" r="4" fill="#3772ff"/>
    </svg>`,
];

// 단계별 배경색 (선택)
const processBgColors = [
    '#e3f0ff', // 문 열림
    '#ffeaea', // 문 닫힘/손조심
    '#f0f6ff', // 판별중
    '#f3f7ff', // 수집중
];

// 3분 후 텍스트 변경 및 버튼 추가 로직
let inactivityTimeout;
function handleInactivity() {
    clearTimeout(inactivityTimeout); // 기존 타임아웃 취소
    inactivityTimeout = setTimeout(() => {
        processMessage.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center;">
        <div style="margin-bottom:24px;">${processIcons[0]}</div>
        <div style="font-size:2.2rem; font-weight:bold; color:#23262f;">사용자가 없으면 아래 버튼을 눌러주세요.</div>
      </div>
    `;

        const returnButton = document.createElement('button');
        returnButton.textContent = '처음으로 돌아가기';
        returnButton.style =
            'font-size:1.2rem;padding:10px 28px;background:#3772ff;color:#fff;border:none;border-radius:8px;cursor:pointer;margin-top:12px;';
        returnButton.onclick = () => {
            console.log('Return Button clicked'); // 디버깅 로그 추가
            clearTimeout(inactivityTimeout);
            clearInterval(countdownInterval);
            console.log('Navigating to main screen'); // 디버깅 로그 추가

            showScreen('main-screen');
        };
        writeCmd('2'); // 시리얼로 '2' 전송
        processMessage.appendChild(returnButton);
    }, 180000); // 3분 (180,000ms) 테스트는 10초
}

// 종료하기 버튼 로직 수정 (포인트 적립 제거)
function handleExitButton() {
    const exitButton = document.createElement('button');
    exitButton.textContent = '종료하기';
    exitButton.style =
        'font-size:1.2rem;padding:10px 28px;background:#ff4d4d;color:#fff;border:none;border-radius:8px;cursor:pointer;margin-top:12px;';
    exitButton.onclick = async () => {
        try {
            clearTimeout(inactivityTimeout); // 비활성 타임아웃 취소
            clearTimeout(autoReturnTimeout); // 자동 닫힘 타임아웃 취소

            const commands = [
                { cmd: '2', msg: '문이 닫힙니다. 손 조심하세요! ⚠️' },
                { cmd: '3', msg: '자원을 판별하는 중입니다...' },
                { cmd: '4', msg: '자원을 수집하는 중입니다...' },
            ];

            for (let i = 0; i < commands.length; i++) {
                processMessage.innerHTML = `
        <div style=\"display:flex; flex-direction:column; align-items:center; justify-content:center;\">
          <div style=\"margin-bottom:24px;\">${processIcons[i + 1]}</div>
          <div style=\"font-size:2.2rem; font-weight:bold; color:#23262f;\">${commands[i].msg}</div>
        </div>
      `;
                document.querySelector('.process-box').style.background = processBgColors[i + 1];

                await writeCmd(commands[i].cmd);

                let completionMessage =
                    commands[i].cmd === '2'
                        ? 'Door closed successfully!'
                        : commands[i].cmd === '3'
                        ? 'Motor task completed!'
                        : '24V Motor stopped.';

                await waitForArduinoResponse(completionMessage);
            }

            await writeCmd('X'); // 시리얼로 'X' 전송
            showScreen('main-screen'); // 메인 화면으로 전환
        } catch (err) {
            if (handleDeviceLost(err)) return;
            console.error('종료 중 오류:', err);
            showErrorScreen('기기 오류가 발생했습니다. 관리자에게 문의해주세요.');
        }
    };

    processMessage.appendChild(exitButton);
}

async function startProcess() {
    clearTimeout(autoReturnTimeout); // 기존 타임아웃 취소
    clearTimeout(inactivityTimeout); // 기존 비활성 타임아웃 취소

    if (!isConnected) {
        alert('서버에 연결되지 않았습니다. 다시 시도해주세요.');
        return;
    }

    showScreen('process-screen');
    isStopped = false;
    stopButton.disabled = true;

    // 기존에 버튼이 있으면 제거
    if (closeDoorButton.parentNode) closeDoorButton.parentNode.removeChild(closeDoorButton);
    closeDoorButton.disabled = false;

    // 대기 화면 (문 열림 신호 대기)
    processMessage.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center;">
            <div style="margin-bottom:24px;">${processIcons[2]}</div>
            <div style="font-size:2.2rem; font-weight:bold; color:#23262f;">띠를 먼저 분리해주세요.<br>분리하시면 문이 열립니다.</div>
        </div>
    `;
    document.querySelector('.process-box').style.background = processBgColors[2];

    // 다양한 열림 신호와 모터 정지 신호 중 먼저 오는 것을 수신
    let openOrStopped;
    try {
        openOrStopped = await waitForAnyArduinoResponse(
            [
                // 라벨 컷 완료 시 문 열림 화면으로 전환
                'Label cutting done!',
                'Label cutting done',
                // 기존 열림 관련 출력도 백업 패턴으로 유지
                'Door will opened',
                'Door will open',
                'Door opened',
                'Door open',
                // 혹시 열림 직후 곧바로 모터 정지만 오는 경우도 처리
                'Motor stopped.',
                'Motor stopped',
            ],
            { timeoutMs: 60000 }
        );
    } catch (err) {
        if (handleDeviceLost(err)) return;
        showErrorScreen('기기 오류가 발생했습니다. 관리자에게 문의해주세요.');
        return;
    }

    // 문 열림 화면을 기존과 동일하게 표시
    const openMsg = `문이 열립니다.<br>띠를 제거하고 페트병을 투입해주세요.<br>마지막으로 닫기 버튼을 눌러주세요.`;
    processMessage.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center;">
            <div style="margin-bottom:24px;">${processIcons[0]}</div>
            <div style="font-size:2.2rem; font-weight:bold; color:#23262f;">${openMsg}</div>
        </div>
    `;
    document.querySelector('.process-box').style.background = processBgColors[0];

    // "작동중지" 버튼 옆에 "닫힘" 버튼 추가
    stopButton.parentNode.insertBefore(closeDoorButton, stopButton.nextSibling);

    // 아직 모터 정지 신호를 못 받았다면 여기서 대기(문구 변형 대비)
    if (!/motor stopped/i.test(openOrStopped)) {
        await waitForAnyArduinoResponse(['Motor stopped.', 'Motor stopped']);
    }

    // 비활성 상태 감지 시작
    handleInactivity();

    // 닫힘 -> 판별 -> 수집
    closeDoorButton.onclick = async () => {
        clearTimeout(inactivityTimeout); // 비활성 타임아웃 취소
        if (closeDoorButton.parentNode) closeDoorButton.parentNode.removeChild(closeDoorButton);
        closeDoorButton.disabled = true;
        try {
            const commands = [
                { cmd: '2', msg: '문이 닫힙니다. 손 조심하세요! ⚠️' },
                { cmd: '3', msg: '자원을 판별하는 중입니다...' },
                { cmd: '4', msg: '자원을 수집하는 중입니다...' },
            ];

            for (let i = 0; i < commands.length; i++) {
                processMessage.innerHTML = `
                        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center;">
                            <div style="margin-bottom:24px;">${processIcons[i + 1]}</div>
                            <div style="font-size:2.2rem; font-weight:bold; color:#23262f;">${commands[i].msg}</div>
                        </div>
                    `;
                document.querySelector('.process-box').style.background = processBgColors[i + 1];

                await writeCmd(commands[i].cmd);

                let completionMessage =
                    commands[i].cmd === '2'
                        ? 'Door closed successfully!'
                        : commands[i].cmd === '3'
                        ? 'Motor task completed!'
                        : '24V Motor stopped.';

                await waitForArduinoResponse(completionMessage);
            }
            stopButton.disabled = true;
            if (isStopped) {
                showScreen('main-screen');
                return;
            }
            // 1회 투입 완료 → 누적 카운트 증가
            depositCount += 1;

            // 포인트 적립은 '처음 화면으로' 돌아갈 때 한 번 호출
            showScreen('end-screen');
        } catch (err) {
            if (handleDeviceLost(err)) return;
            console.error('닫힘/판별/수집 중 오류:', err);
            showErrorScreen('기기 오류가 발생했습니다. 관리자에게 문의해주세요.');
        }
    };
}

async function sendCommand(command, expectedResponse) {
    try {
        console.log(`Preparing to send command: '${command}'`); // 명령 준비 로그 추가
        await writeCmd(command); // 줄 종료 자동 부착
        console.log(`Command successfully sent: '${command}'`); // 명령 전송 성공 로그 추가
        if (expectedResponse) {
            await waitForArduinoResponse(expectedResponse);
        }
    } catch (error) {
        console.error(`Error sending command '${command}':`, error);
        if (handleDeviceLost(error)) return;
        showErrorScreen('기기 오류가 발생했습니다. 관리자에게 문의해주세요.');
    }
}

// 공통: 수신 데이터에 'already' 포함 시 센서 오류 처리
function detectAndHandleAlready(data) {
    try {
        if (typeof data === 'string' && data.toLowerCase().includes('already')) {
            showErrorScreen('센서 상태 오류, 관리자에게 문의해주세요.');
            return true;
        }
    } catch {}
    return false;
}

function waitForArduinoResponse(targetMessage) {
    return new Promise((resolve, reject) => {
        let receivedData = '';
        const loop = async () => {
            try {
                const { value, done } = await reader.read();
                if (done) {
                    reject('Reader stream closed unexpectedly.');
                    return;
                }
                if (value) {
                    receivedData += value;
                    console.log('Received data (raw):', value); // 수신된 원본 데이터 로그 추가
                    console.log('Accumulated data:', receivedData); // 누적된 데이터 로그 추가

                    // 에러 신호 감지
                    if (receivedData.includes('ERROR:')) {
                        const line = receivedData.split(/\r?\n/).find((l) => l.includes('ERROR:')) || '기기 오류';
                        showErrorScreen(line.replace(/.*ERROR:\s*/, '기기 오류: '));
                        return; // 에러 발생 시 흐름 중단
                    }

                    // 'already' 감지 시 센서 오류 처리
                    if (detectAndHandleAlready(receivedData)) {
                        return;
                    }

                    if (receivedData.includes(targetMessage)) {
                        console.log('Target message received:', targetMessage); // 디버깅 로그 추가
                        resolve();
                        return;
                    }
                }
                loop();
            } catch (error) {
                console.error('Error in waitForArduinoResponse loop:', error);
                if (!handleDeviceLost(error)) {
                    // 장치 분리 외 예외
                }
                reject(error);
            }
        };
        loop();
    });
}

// 열림/상태 신호를 다중 패턴으로 대기
function normalizeText(s) {
    return (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '');
}
function waitForAnyArduinoResponse(targetMessages, { timeoutMs = 30000 } = {}) {
    const normalizedTargets = targetMessages.map((m) => normalizeText(m));
    return new Promise((resolve, reject) => {
        let receivedData = '';
        const timer = setTimeout(() => {
            console.warn('waitForAnyArduinoResponse timeout', { targetMessages });
            reject(new Error('Timeout while waiting for Arduino response'));
        }, timeoutMs);

        const loop = async () => {
            try {
                const { value, done } = await reader.read();
                if (done) {
                    clearTimeout(timer);
                    reject('Reader stream closed unexpectedly.');
                    return;
                }
                if (value) {
                    receivedData += value;
                    console.log('[ANY] raw:', value);
                    console.log('[ANY] acc:', receivedData);

                    // 에러 신호 감지
                    if (receivedData.includes('ERROR:')) {
                        clearTimeout(timer);
                        const line = receivedData.split(/\r?\n/).find((l) => l.includes('ERROR:')) || '기기 오류';
                        showErrorScreen(line.replace(/.*ERROR:\s*/, '기기 오류: '));
                        return;
                    }

                    // 'already' 감지 시 센서 오류 처리
                    if (detectAndHandleAlready(receivedData)) {
                        clearTimeout(timer);
                        return;
                    }

                    const normalized = normalizeText(receivedData);
                    const hitIdx = normalizedTargets.findIndex((t) => normalized.includes(t));
                    if (hitIdx !== -1) {
                        clearTimeout(timer);
                        const hit = targetMessages[hitIdx];
                        console.log('Matched message:', hit);
                        resolve(hit);
                        return;
                    }
                }
                loop();
            } catch (error) {
                clearTimeout(timer);
                console.error('Error in waitForAnyArduinoResponse loop:', error);
                if (!handleDeviceLost(error)) {
                    // 장치 분리 외 예외
                }
                reject(error);
            }
        };
        loop();
    });
}

// 2단계(문 닫기) 중 손 감지 처리 대기
function waitForCloseOrHand(targetMessage) {
    return new Promise((resolve, reject) => {
        let receivedData = '';
        const loop = async () => {
            try {
                const { value, done } = await reader.read();
                if (done) {
                    reject('Reader stream closed unexpectedly.');
                    return;
                }
                if (value) {
                    receivedData += value;
                    console.log('[CloseOrHand] raw:', value);
                    console.log('[CloseOrHand] acc:', receivedData);

                    // 에러 신호 감지
                    if (receivedData.includes('ERROR:')) {
                        const line = receivedData.split(/\r?\n/).find((l) => l.includes('ERROR:')) || '기기 오류';
                        showErrorScreen(line.replace(/.*ERROR:\s*/, '기기 오류: '));
                        return;
                    }

                    // 'already' 감지 시 센서 오류 처리
                    if (detectAndHandleAlready(receivedData)) {
                        return;
                    }

                    if (receivedData.includes('HAND DETECTED!') || receivedData.includes('23')) {
                        processMessage.innerHTML = `
              <div style=\"display:flex; flex-direction:column; align-items:center; justify-content:center;\">
                <div style=\"margin-bottom:24px;\">
                  <svg width=\"60\" height=\"60\" viewBox=\"0 0 24 24\" fill=\"none\">
                    <circle cx=\"12\" cy=\"12\" r=\"10\" stroke=\"#ff4d4d\" stroke-width=\"2\" fill=\"#ffeaea\"/>
                    <path d=\"M8 12h8M12 8v8\" stroke=\"#ff4d4d\" stroke-width=\"2\" stroke-linecap=\"round\"/>
                  </svg>
                </div>
                <div style=\"font-size:2.2rem; font-weight:bold; color:#ff4d4d;\">손이 감지되었습니다. 문이 열립니다.</div>
              </div>
            `;
                        document.querySelector('.process-box').style.background = '#ffeaea';
                        resolve({ status: 'hand' });
                        return;
                    }

                    if (receivedData.includes(targetMessage)) {
                        resolve({ status: 'ok' });
                        return;
                    }
                }
                loop();
            } catch (error) {
                console.error('Error in waitForCloseOrHand loop:', error);
                if (!handleDeviceLost(error)) {
                    // 장치 분리 외 예외
                }
                reject(error);
            }
        };
        loop();
    });
}

// 2→3→4 단계 실행: 닫힘 중 손 감지 시 다시 열었다가 재시도 후 이어서 진행
async function runCloseClassifyCollectSequence() {
    // 2. 닫힘
    processMessage.innerHTML = `
    <div style=\"display:flex; flex-direction:column; align-items:center; justify-content:center;\">
      <div style=\"margin-bottom:24px;\">${processIcons[1]}</div>
      <div style=\"font-size:2.2rem; font-weight:bold; color:#23262f;\">문이 닫힙니다. 손 조심하세요! ⚠️</div>
    </div>
  `;
    document.querySelector('.process-box').style.background = processBgColors[1];
    await writeCmd('2');
    const closeResult = await waitForCloseOrHand('Door closed successfully!');

    if (closeResult.status === 'hand') {
        // 다시 열기
        await writeCmd('1');
        await waitForArduinoResponse('Motor stopped.');

        // 재닫기 안내
        processMessage.innerHTML = `
      <div style=\"display:flex; flex-direction:column; align-items:center; justify-content:center;\">
        <div style=\"margin-bottom:24px;\">${processIcons[1]}</div>
        <div style=\"font-size:2.2rem; font-weight:bold; color:#23262f;\">문이 다시 닫힙니다. 손을 치워주세요. ⚠️</div>
      </div>
    `;
        document.querySelector('.process-box').style.background = processBgColors[1];
        await writeCmd('2');
        await waitForArduinoResponse('Door closed successfully!');
    }

    // 3. 판별중
    processMessage.innerHTML = `
    <div style=\"display:flex; flex-direction:column; align-items:center; justify-content:center;\">
      <div style=\"margin-bottom:24px;\">${processIcons[2]}</div>
      <div style=\"font-size:2.2rem; font-weight:bold; color:#23262f;\">자원을 판별하는 중입니다...</div>
    </div>
  `;
    document.querySelector('.process-box').style.background = processBgColors[2];
    await writeCmd('3');
    await waitForArduinoResponse('Motor task completed!');

    // 4. 수집중
    processMessage.innerHTML = `
    <div style=\"display:flex; flex-direction:column; align-items:center; justify-content:center;\">
      <div style=\"margin-bottom:24px;\">${processIcons[3]}</div>
      <div style=\"font-size:2.2rem; font-weight:bold; color:#23262f;\">자원을 수집하는 중입니다...</div>
    </div>
  `;
    document.querySelector('.process-box').style.background = processBgColors[3];
    await writeCmd('4');
    await waitForArduinoResponse('24V Motor stopped.');
}

// ========== Fa-duino 연결 ==========
async function connectToFaduino() {
    try {
        if (!port) {
            const ports = await navigator.serial.getPorts();
            port = ports.length ? ports[0] : await navigator.serial.requestPort();
        }

        if (port.readable || port.writable) {
            isConnected = true;
            return;
        }

        await port.open({ baudRate: 9600 });

        const decoder = new TextDecoderStream();
        port.readable.pipeTo(decoder.writable);
        reader = decoder.readable.getReader();

        const encoder = new TextEncoderStream();
        encoder.readable.pipeTo(port.writable);
        writer = encoder.writable.getWriter();

        isConnected = true;
        // 연결되면 유지보수 모드 해제 및 상태 패널 갱신
        if (window) {
            window.__maintenanceMode = false;
            if (window.startPeriodicStatusCheck) {
                window.startPeriodicStatusCheck();
            }
        }
        const arduinoStatus = document.getElementById('arduino-status');
        const machineStatus = document.getElementById('machine-status');
        if (arduinoStatus) {
            arduinoStatus.textContent = '정상';
            arduinoStatus.style.color = '#00ff4c';
        }
        if (machineStatus) {
            machineStatus.textContent = '가능';
            machineStatus.style.color = '#00ff4c';
        }
        // 로그인 버튼 재활성화 및 라벨 복구
        if (loginButton) {
            loginButton.disabled = false;
            loginButton.textContent = '시작하기';
        }
    } catch (err) {
        console.error('Serial error:', err);
        isConnected = false;
        alert('연결에 실패했습니다. 다시 시도해주세요.');
    }
}

// ========== 이벤트 ==========
loginButton.addEventListener('click', () => {
    loginPopup.style.display = 'flex';
    connectToFaduino();
});

loginSubmit.addEventListener('click', async () => {
    const phone = phoneNumberInput.value;
    if (phone.length === 13) {
        loginPopup.style.display = 'none';
        currentPhoneNumber = phone;
        depositCount = 0; // 로그인 시 카운트 초기화

        // 99 명령 먼저 전송 후 1초 뒤에 startProcess()
        if (writer) {
            try {
                await writeCmd('99');
                setTimeout(() => {
                    startProcess();
                }, 1000);
            } catch (e) {
                alert('장치에 명령을 전송할 수 없습니다.');
            }
        } else {
            startProcess();
        }
    } else alert('올바른 전화번호를 입력하세요. (예: 010-1234-5678)');
});

keypad.addEventListener('click', (e) => {
    if (e.target.tagName !== 'BUTTON') return;
    const key = e.target.textContent;
    let val = phoneNumberInput.value.replace(/-/g, '');
    if (key === '←') val = val.slice(0, -1);
    else if (key === 'C') val = '';
    else if (!isNaN(key) && val.length < 11) val += key;

    let formatted = '';
    if (val.length > 0) formatted += val.substring(0, 3);
    if (val.length >= 4) formatted += '-' + val.substring(3, 7);
    if (val.length >= 8) formatted += '-' + val.substring(7, 11);
    phoneNumberInput.value = formatted;
});

phoneNumberInput.addEventListener('input', (e) => {
    let v = e.target.value.replace(/-/g, '');
    let f = '';
    if (v.length > 0) f += v.substring(0, 3);
    if (v.length >= 4) f += '-' + v.substring(3, 7);
    if (v.length >= 8) f += '-' + v.substring(7, 11);
    e.target.value = f;
});

stopButton.addEventListener('click', async () => {
    isStopped = true;
    stopButton.disabled = true;

    // 1번만 끝난 상태에서 중지 시 닫힘 버튼 클릭 로직 자동 실행
    if (!closeDoorButton.disabled && closeDoorButton.parentNode) {
        try {
            closeDoorButton.disabled = true;
            if (closeDoorButton.parentNode) closeDoorButton.parentNode.removeChild(closeDoorButton);

            const commands = [
                { cmd: '2', msg: '문이 닫힙니다. 손 조심하세요! ⚠️' },
                { cmd: '3', msg: '자원을 판별하는 중입니다...' },
                { cmd: '4', msg: '자원을 수집하는 중입니다...' },
            ];
            for (let i = 0; i < commands.length; i++) {
                processMessage.innerHTML = `
                <div style=\"display:flex; flex-direction:column; align-items:center; justify-content:center;\">
                    <div style=\"margin-bottom:24px;\">
                        <svg width=\"60\" height=\"60\" viewBox=\"0 0 24 24\" fill=\"none\">
                            <circle cx=\"12\" cy=\"12\" r=\"10\" stroke=\"#3772ff\" stroke-width=\"2\" fill=\"#e3f0ff\"/>
                            <path d=\"M8 12h8M12 8v8\" stroke=\"#3772ff\" stroke-width=\"2\" stroke-linecap=\"round\"/>
                        </svg>
                    </div>
                    <div style=\"font-size:2.2rem; font-weight:bold; color:#23262f;\">작동을 중지중입니다...</div>
                </div>
            `;
                document.querySelector('.process-box').style.background = '#e3f0ff';

                await writeCmd(commands[i].cmd);

                let completionMessage =
                    commands[i].cmd === '2'
                        ? 'Motor stopped.'
                        : commands[i].cmd === '3'
                        ? 'Motor task completed!'
                        : '24V Motor stopped.';

                await waitForArduinoResponse(completionMessage);
            }
            showScreen('main-screen');
        } catch (err) {
            if (handleDeviceLost(err)) return;
            console.error('중지 처리 중 오류:', err);
            showErrorScreen('기기 오류가 발생했습니다. 관리자에게 문의해주세요.');
        }
    }
});

returnHomeButton.addEventListener('click', () => {
    console.log('Return Home button clicked'); // 디버깅 로그 추가
    clearTimeout(autoReturnTimeout);
    clearInterval(countdownInterval);
    console.log('Navigating to main screen'); // 디버깅 로그 추가
    showScreen('main-screen');
});
addMoreButton.addEventListener('click', async () => {
    console.log('Add More button clicked'); // 디버깅 로그 추가
    clearTimeout(autoReturnTimeout); // 기존 타임아웃 취소
    autoReturnTimeout = null; // 변수 초기화
    clearInterval(countdownInterval); // 카운트다운 초기화

    // 추가 투입 시 상태 초기화 후 처음부터 다시 시작
    isStopped = false;
    stopButton.disabled = false;
    await startProcess();
});

// 회전 애니메이션 CSS 추가 (최초 1회만)
if (!document.getElementById('spin-style')) {
    const style = document.createElement('style');
    style.id = 'spin-style';
    style.innerHTML = `
    .spin {
        animation: spin 1s linear infinite;
    }
    @keyframes spin {
        100% { transform: rotate(360deg);}
    }
    `;
    document.head.appendChild(style);
}

// motorStop 함수 수정
async function motorStop() {
    if (writer) {
        try {
            await writeCmd('X'); // 모터 정지 신호 전송
            console.log('모터 정지 신호 전송 완료'); // 디버깅 로그 추가
            await waitForArduinoResponse('Motor stopped.'); // 모터 정지 확인
            console.log('모터 정지 확인 완료'); // 디버깅 로그 추가
        } catch (e) {
            console.error('모터 정지 신호 전송 실패:', e);
        }
    } else {
        console.error('Writer가 초기화되지 않았습니다. 모터 정지 신호를 보낼 수 없습니다.');
    }
}

// 로그인 팝업 닫기 버튼
const keypadCloseButton = document.createElement('button');
keypadCloseButton.textContent = 'X';
keypadCloseButton.style =
    'position: absolute; top: 10px; right: 10px; background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #fff;';
keypadCloseButton.onclick = () => {
    loginPopup.style.display = 'none';
};
keypad.parentNode.style.position = 'relative'; // Ensure the parent has relative positioning for absolute child
keypad.parentNode.appendChild(keypadCloseButton);

// 전역: 처리되지 않은 Promise 거부 캐치 → 장치 분리시 사용자 안내
if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', (event) => {
        if (handleDeviceLost(event.reason)) {
            event.preventDefault?.();
        }
    });
}
