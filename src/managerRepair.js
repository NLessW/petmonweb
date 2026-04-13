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

let port,
    reader,
    writer,
    keepReading = true,
    serialBuffer = '';
let loggedIn = false;
let inSensorBlock = false;
const logEl = document.getElementById('log');
const connDot = document.getElementById('conn-dot');
const connText = document.getElementById('conn-text');
const buttonsQuick = [...document.querySelectorAll('button.quick')];

// 센서 핀 맵핑
const SENSOR_MAP = {
    27: { id: 'ai1', label: 'Sensor1 (Pin 27)' },
    28: { id: 'ai2', label: 'Sensor2 (Pin 28)' },
    26: { id: 'ai3', label: 'Sensor3 (Pin 26)' },
    37: { id: 'door-open', label: '문 열림 (Pin 37)' },
    36: { id: 'door-close', label: '문 닫힘 (Pin 36)' },
    22: { id: 'hand', label: '손 감지 (Pin 22)' },
    25: { id: 'belt', label: '띠 분리기 (Pin 25)' },
    24: { id: 'belt-switch', label: '띠 스위치 (Pin 24)' },
    21: { id: 'photo', label: '포토센서 (Pin 21)' },
};

function appendLog(msg, type = 'rx') {
    const time = new Date().toLocaleTimeString();
    const line = `[${time}] ${type === 'tx' ? '>' : '<'} ${msg}\n`;
    logEl.insertAdjacentText('beforeend', line);

    if (logEl.textContent.length > 120_000) {
        const keep = logEl.textContent.slice(-60_000);
        const cutAt = keep.indexOf('\n');
        logEl.textContent = keep.slice(cutAt + 1);
    }

    requestAnimationFrame(() => {
        if (logEl.scrollHeight > logEl.clientHeight) {
            logEl.scrollTop = logEl.scrollHeight;
        }
    });
}

function setConnected(on) {
    connDot.classList.toggle('on', on);
    connText.textContent = on ? 'CONNECTED' : 'DISCONNECTED';
    document.getElementById('btn-connect').disabled = on;
    document.getElementById('btn-sensor-refresh').disabled = !on;
}

function setLoggedIn(on) {
    loggedIn = on;
    buttonsQuick.forEach((b) => (b.disabled = !on));
    document.getElementById('info-line').textContent = on ? '로그인됨 - 명령 전송 가능' : '장비 연결 중...';

    // 로그인 상태 센서 업데이트
    const loginDot = document.getElementById('sd-login');
    const loginValue = document.getElementById('sv-login');
    if (loginDot && loginValue) {
        loginDot.className = 'sensor-dot ' + (on ? 'normal' : 'error');
        loginValue.textContent = on ? '로그인됨' : '로그아웃';
    }
}

// 자동 연결 함수 (VID/PID 필터링)
async function autoConnect() {
    try {
        appendLog('자동 연결 시작...', 'info');

        // 기존 연결 정리
        if (port) {
            try {
                await disconnect();
            } catch (e) {
                appendLog('기존 연결 정리 실패: ' + e.message, 'err');
            }
            await new Promise((r) => setTimeout(r, 300));
        }

        // USB 필터: Prolific PL2303 (VID: 0x067b, PID: 0x2303)
        const filters = [{ usbVendorId: 0x067b, usbProductId: 0x2303 }];

        appendLog('포트 요청 중 (Prolific PL2303)...', 'info');
        port = await navigator.serial.requestPort({ filters });

        const portInfo = port.getInfo();
        appendLog(
            `선택된 포트: VID=0x${portInfo.usbVendorId.toString(16)} PID=0x${portInfo.usbProductId.toString(16)}`,
            'info',
        );

        appendLog('포트 열기 시도 (baudRate: 9600)...', 'info');
        await port.open({ baudRate: 9600 });

        const decoder = new TextDecoderStream();
        port.readable.pipeTo(decoder.writable);
        reader = decoder.readable.getReader();

        const encoder = new TextEncoderStream();
        encoder.readable.pipeTo(port.writable);
        writer = encoder.writable.getWriter();

        setConnected(true);
        keepReading = true;
        readLoop();

        appendLog('✓ 포트 연결 성공', 'info');

        // 자동 로그인 (0.8초 대기 후)
        setTimeout(() => {
            appendLog('자동 로그인 중...', 'info');
            send('LOGIN_USER');

            // 로그인 후 센서 상태 갱신
            setTimeout(() => {
                send('GET_STATUS');
                startSensorPolling();
            }, 1000);
        }, 800);
    } catch (e) {
        if (e.name === 'NotFoundError' || e.message.includes('No port selected')) {
            appendLog('포트 선택이 취소되었습니다.', 'err');
        } else if (e.name === 'InvalidStateError') {
            appendLog('포트가 이미 다른 프로그램에서 사용 중입니다.', 'err');
        } else if (e.name === 'NetworkError' || e.message.includes('ACCESS_DENIED')) {
            appendLog('포트 접근 거부: 다른 프로그램을 종료하거나 USB를 다시 연결하세요.', 'err');
        } else {
            appendLog('연결 실패 [' + e.name + ']: ' + e.message, 'err');
            console.error('Serial connection error:', e);
        }
        setConnected(false);
        port = null;
    }
}

async function disconnect() {
    keepReading = false;
    try {
        if (reader) {
            await reader.cancel();
            reader.releaseLock();
            reader = null;
        }
        if (writer) {
            await writer.close();
            writer = null;
        }
        if (port) {
            await port.close();
            port = null;
        }
    } catch (e) {
        appendLog('연결 해제 중 오류: ' + e.message, 'err');
    }
    setConnected(false);
    setLoggedIn(false);
    appendLog('✓ 연결 해제됨', 'info');
}

async function readLoop() {
    while (keepReading) {
        try {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
                serialBuffer += value;
                let idx;
                while ((idx = serialBuffer.search(/\r?\n/)) !== -1) {
                    const line = serialBuffer.slice(0, idx).trim();
                    serialBuffer = serialBuffer.slice(serialBuffer.slice(idx).match(/^[\r\n]+/)[0].length + idx);
                    if (line) {
                        if (line.includes('=== Current Sensor Status ===')) {
                            inSensorBlock = true;
                        } else if (line.includes('=============================')) {
                            inSensorBlock = false;
                        }

                        if (!inSensorBlock && !line.includes('=== Current Sensor Status ===')) {
                            appendLog(line, 'rx');
                        }
                        handleMessage(line);
                    }
                }
            }
        } catch (e) {
            appendLog('Read error: ' + e.message, 'err');
            break;
        }
    }
}

function handleMessage(text) {
    const lower = text.toLowerCase();

    // 자동 로그인 감지
    if (!loggedIn && (lower.includes('ack:login_user') || lower.includes('ack:login_admin'))) {
        setLoggedIn(true);
        appendLog('✓ 자동 로그인 성공', 'info');
    }
    if (loggedIn && lower.includes('logged out')) {
        setLoggedIn(false);
    }

    // 센서 상태 블록 처리
    if (text.includes('=== Current Sensor Status ===')) {
        showSensorList();
    } else if (text.includes('=============================')) {
        updateSensorTimestamp();
    } else {
        handleSensorLine(text);
    }
}

function send(cmd) {
    if (!writer) {
        appendLog('연결되지 않음', 'err');
        return;
    }
    writer.write(cmd + '\n');
    appendLog(cmd, 'tx');
}

// 센서 상태 표시
function showSensorList() {
    document.getElementById('sensor-placeholder').style.display = 'none';
    document.getElementById('sensor-list').style.display = 'block';
}

function updateSensorTimestamp() {
    const updateEl = document.getElementById('sensor-last-update');
    if (updateEl) {
        const now = new Date();
        updateEl.textContent = `마지막 업데이트: ${now.toLocaleTimeString()}`;
    }
}

function handleSensorLine(line) {
    // 센서 라인 파싱: "Pin 27: HIGH (Normal)"
    const pinMatch = line.match(/Pin (\d+):\s*(HIGH|LOW)\s*\(([^)]+)\)/i);
    if (pinMatch) {
        const pin = parseInt(pinMatch[1], 10);
        const state = pinMatch[2].toUpperCase();
        const desc = pinMatch[3];

        const sensor = SENSOR_MAP[pin];
        if (sensor) {
            const dotEl = document.getElementById(`sd-${sensor.id}`);
            const valueEl = document.getElementById(`sv-${sensor.id}`);

            if (dotEl && valueEl) {
                // 정상 여부 판단
                const isNormal = desc.toLowerCase().includes('normal');
                dotEl.className = 'sensor-dot ' + (isNormal ? 'normal' : 'error');
                valueEl.textContent = `${state} (${desc})`;

                // 시각적 피드백 (플래시 효과)
                dotEl.style.opacity = '0.3';
                setTimeout(() => {
                    dotEl.style.opacity = '1';
                }, 100);
            }
        }
    }

    // 실시간 센서 변화 감지 (띠 분리기)
    const beltMatch = line.match(/Belt Sensor \(Pin 25\) (initial|changed|final):\s*(HIGH|LOW)/i);
    if (beltMatch) {
        const state = beltMatch[2].toUpperCase();
        const dotEl = document.getElementById('sd-belt');
        const valueEl = document.getElementById('sv-belt');

        if (dotEl && valueEl) {
            // LOW = 정상, HIGH = 비정상
            const isNormal = state === 'LOW';
            dotEl.className = 'sensor-dot ' + (isNormal ? 'normal' : 'error');
            valueEl.textContent = `${state} (${isNormal ? 'Normal' : 'Abnormal'})`;

            dotEl.style.opacity = '0.3';
            setTimeout(() => {
                dotEl.style.opacity = '1';
            }, 100);
        }
    }
}

// 센서 상태 주기적 갱신
let sensorPollingInterval = null;
function startSensorPolling() {
    if (sensorPollingInterval) {
        clearInterval(sensorPollingInterval);
    }
    sensorPollingInterval = setInterval(() => {
        if (loggedIn && writer) {
            send('GET_STATUS');
        }
    }, 5000); // 5초마다 갱신
}

function stopSensorPolling() {
    if (sensorPollingInterval) {
        clearInterval(sensorPollingInterval);
        sensorPollingInterval = null;
    }
}

// 이벤트 리스너
document.getElementById('btn-connect').addEventListener('click', autoConnect);

document.getElementById('btn-go-main').addEventListener('click', () => {
    if (confirm('메인 화면으로 돌아가시겠습니까?')) {
        window.location.href = 'index.html';
    }
});

document.getElementById('btn-sensor-refresh').addEventListener('click', () => {
    if (loggedIn) {
        send('GET_STATUS');
    }
});

// 빠른 동작 버튼
buttonsQuick.forEach((btn) => {
    btn.addEventListener('click', () => {
        const cmd = btn.getAttribute('data-cmd');
        if (cmd && loggedIn) {
            send(cmd);
        }
    });
});

// 페이지 종료 시 연결 해제
window.addEventListener('beforeunload', () => {
    stopSensorPolling();
    if (port) {
        disconnect();
    }
});

// 초기화
appendLog('수리 관리자 페이지 로드됨', 'info');
appendLog('장비 연결 버튼을 눌러 자동 연결을 시작하세요.', 'info');
