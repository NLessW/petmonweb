let port,
    reader,
    writer,
    keepReading = true,
    serialBuffer = '';
let loggedIn = false;
let speedDebounce;
const logEl = document.getElementById('log');
const connDot = document.getElementById('conn-dot');
const connText = document.getElementById('conn-text');
const buttonsQuick = [...document.querySelectorAll('button.quick')];
const manualButtons = [...document.querySelectorAll('button[data-m]')];

function appendLog(msg, type = 'rx') {
    const time = new Date().toLocaleTimeString();
    const line = `[${time}] ${type === 'tx' ? '>' : '<'} ${msg}\n`;

    // 문자열 재할당 대신 텍스트 노드로 끝에 추가
    logEl.insertAdjacentText('beforeend', line);

    // 로그가 너무 커지면 일부만 유지(스크롤 문제 방지)
    if (logEl.textContent.length > 120_000) {
        const keep = logEl.textContent.slice(-60_000);
        const cutAt = keep.indexOf('\n');
        logEl.textContent = keep.slice(cutAt + 1);
    }

    // 다음 프레임에서 스크롤 이동
    requestAnimationFrame(() => {
        // 로그 영역 자체가 스크롤 가능한 경우에만 내림
        if (logEl.scrollHeight > logEl.clientHeight) {
            logEl.scrollTop = logEl.scrollHeight;
        }
        // 사용자가 페이지 하단 근처에 있으면 창도 같이 맨 아래로
        const doc = document.documentElement;
        const nearBottom = window.innerHeight + window.scrollY >= doc.scrollHeight - 40;
        if (nearBottom) {
            window.scrollTo({ top: doc.scrollHeight, behavior: 'auto' });
        }
    });
}
function setConnected(on) {
    connDot.classList.toggle('on', on);
    connText.textContent = on ? 'CONNECTED' : 'DISCONNECTED';
    document.getElementById('btn-login').disabled = !on;
    document.getElementById('btn-99login').disabled = !on;
    document.getElementById('btn-repair').disabled = !on;
    document.getElementById('btn-connect').disabled = false;
    document.getElementById('btn-help').disabled = !on;
}
function setLoggedIn(on) {
    loggedIn = on;
    buttonsQuick.forEach((b) => (b.disabled = !on));
    manualButtons.forEach((b) => (b.disabled = !on));
    document.getElementById('btn-refresh-speed').disabled = !on;
    document.getElementById('btn-query').disabled = !on;
    document.getElementById('btn-logout').disabled = !on;
    document.getElementById('info-line').textContent = on ? '로그인됨 - 명령 전송 가능' : '로그인 필요';
    if (on) {
        // 로그인 직후 현재 값 즉시 전송하여 동기화
        setTimeout(() => sendCurrentSpeeds(true), 300);
    }
}
async function connect() {
    try {
        port = await navigator.serial.requestPort();
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
        appendLog('포트 연결 성공');
    } catch (e) {
        appendLog('연결 실패: ' + e.message, 'err');
    }
}
async function readLoop() {
    while (keepReading) {
        try {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
                serialBuffer += value; // 누적
                let idx;
                while ((idx = serialBuffer.search(/\r?\n/)) !== -1) {
                    const line = serialBuffer.slice(0, idx).trim();
                    serialBuffer = serialBuffer.slice(serialBuffer.slice(idx).match(/^[\r\n]+/)[0].length + idx);
                    if (line) {
                        appendLog(line, 'rx');
                        handleAutoLoginDetect(line);
                    }
                }
                // 끝에 개행이 아직 안 온 경우(line 조각)도 로그인 패턴 감시
                handleAutoLoginDetect(serialBuffer);
            }
        } catch (e) {
            appendLog('Read error: ' + e.message, 'err');
            break;
        }
    }
}
function handleAutoLoginDetect(text) {
    const lower = text.toLowerCase();
    if (!loggedIn && lower.includes('login suc') && lower.includes('success')) {
        setLoggedIn(true);
    }
    if (loggedIn && lower.includes('logged out')) {
        setLoggedIn(false);
    }

    // 속도 데이터 수신 (SPEEDS:DO=255;DC=120;D1=70;D2=90)
    if (text.startsWith('SPEEDS:')) {
        parseSpeedsFromDevice(text);
    }
}

function parseSpeedsFromDevice(line) {
    // SPEEDS:DO=255;DC=120;D1=70;D2=90 파싱
    const doMatch = line.match(/DO=(\d+)/);
    const dcMatch = line.match(/DC=(\d+)/);
    const d1Match = line.match(/D1=(\d+)/);
    const d2Match = line.match(/D2=(\d+)/);

    if (doMatch) {
        document.getElementById('speed-do').value = doMatch[1];
        document.getElementById('speed-do-range').value = doMatch[1];
    }
    if (dcMatch) {
        document.getElementById('speed-dc').value = dcMatch[1];
        document.getElementById('speed-dc-range').value = dcMatch[1];
    }
    if (d1Match) {
        document.getElementById('speed-d1').value = d1Match[1];
        document.getElementById('speed-d1-range').value = d1Match[1];
    }
    if (d2Match) {
        document.getElementById('speed-d2').value = d2Match[1];
        document.getElementById('speed-d2-range').value = d2Match[1];
    }
}

async function send(cmd) {
    if (!writer) return;
    await writer.write(cmd + '\r\n');
    appendLog(cmd, 'tx');
}
async function gracefulDisconnect(goHome = false) {
    try {
        // 최신 속도 1회 더 전송 (이미 동일값이면 EEPROM 미작성)
        sendCurrentSpeeds(true);
    } catch (e) {
        /* ignore */
    }
    // 약간의 처리 지연 (전송 완료 보장)
    await new Promise((r) => setTimeout(r, 120));
    keepReading = false;
    try {
        if (reader) {
            await reader.cancel();
            reader.releaseLock();
        }
    } catch (e) {}
    try {
        if (writer) {
            writer.releaseLock();
        }
    } catch (e) {}
    try {
        if (port) {
            await port.close();
        }
    } catch (e) {}
    setConnected(false);
    setLoggedIn(false);
    if (goHome) {
        appendLog('메인 페이지로 이동');
        window.location.href = '../index.html';
    }
}
// 버튼 이벤트
document.getElementById('btn-connect').onclick = connect;
document.getElementById('btn-login').onclick = () => send('98');
document.getElementById('btn-99login').onclick = () => send('99');
document.getElementById('btn-help').onclick = () => send('h');
document.getElementById('btn-query').onclick = () => send('Q');
document.getElementById('btn-repair').onclick = () => send('R');
document.getElementById('btn-logout').onclick = () => send('L');
document.getElementById('btn-go-main').onclick = async (e) => {
    e.target.disabled = true;
    await gracefulDisconnect(true);
};
buttonsQuick.forEach((b) => (b.onclick = () => send(b.dataset.cmd)));

// 속도 적용
document.getElementById('btn-refresh-speed').onclick = () => send('Q');

function sendCurrentSpeeds(initial = false) {
    if (!writer || !loggedIn) return;
    const doV = document.getElementById('speed-do').value;
    const dcV = document.getElementById('speed-dc').value;
    const d1V = document.getElementById('speed-d1').value;
    const d2V = document.getElementById('speed-d2').value;
    const cmd = `SPD:DO=${doV};DC=${dcV};D1=${d1V};D2=${d2V}`;
    send(cmd + (initial ? '  // sync' : ''));
    const msg = document.getElementById('auto-speed-msg');
    if (msg) {
        msg.textContent = '동기화됨 (' + new Date().toLocaleTimeString() + ')';
        setTimeout(() => (msg.textContent = '입력값 변경 후 약 0.1초 뒤 자동 전송됩니다.'), 2500);
    }
}

// 입력 변경 자동 전송 (디바운스 100ms)
['speed-do', 'speed-dc', 'speed-d1', 'speed-d2'].forEach((id) => {
    const el = document.getElementById(id);
    ['input', 'change'].forEach((ev) => {
        el.addEventListener(ev, () => {
            if (!loggedIn) return; // 로그인 전에는 전송 안함
            clearTimeout(speedDebounce);
            const msg = document.getElementById('auto-speed-msg');
            if (msg) msg.textContent = '전송 대기중...';
            speedDebounce = setTimeout(() => sendCurrentSpeeds(false), 100);
        });
    });
});

// 슬라이더 ↔ 숫자 입력 동기화 (자동 속도 전송 동일하게 활용)
const linkPairs = [
    ['speed-do-range', 'speed-do'],
    ['speed-dc-range', 'speed-dc'],
    ['speed-d1-range', 'speed-d1'],
    ['speed-d2-range', 'speed-d2'],
    ['m24-speed-range', 'm24-speed'],
    ['m12-speed-range', 'm12-speed'],
];
linkPairs.forEach(([rangeId, numId]) => {
    const r = document.getElementById(rangeId);
    const n = document.getElementById(numId);
    if (!r || !n) return;
    r.addEventListener('input', () => {
        n.value = r.value;
        if (numId.startsWith('speed-')) {
            if (!loggedIn) return;
            clearTimeout(speedDebounce);
            const msg = document.getElementById('auto-speed-msg');
            if (msg) msg.textContent = '전송 대기중...';
            speedDebounce = setTimeout(() => sendCurrentSpeeds(false), 400);
        }
    });
    n.addEventListener('input', () => {
        r.value = n.value;
    });
});

// 수동 모터 제어
manualButtons.forEach(
    (b) =>
        (b.onclick = () => {
            const base = b.dataset.m; // M:D24:F 등
            let spd = '';
            if (/D24/.test(base)) spd = ':' + document.getElementById('m24-speed').value;
            else if (/D12/.test(base) && !/S$/.test(base)) spd = ':' + document.getElementById('m12-speed').value;
            send(base + spd);
        })
);

// 길게 누르면 연속 증가/감소 ----------------------------------
let holdBtn = null;
let holdInitialTimeout = null;
let holdInterval = null;
let holdStartedAt = 0;

function applyStep(btn) {
    const targetId = btn.dataset.target;
    const delta = parseInt(btn.dataset.delta || '0', 10);
    const numInput = document.getElementById(targetId);
    const rangeInput = document.getElementById(targetId + '-range');
    if (!numInput || !rangeInput) return false;
    const min = parseInt(numInput.min || '0', 10);
    const max = parseInt(numInput.max || '255', 10);
    let val = parseInt(numInput.value || '0', 10);
    const next = Math.min(max, Math.max(min, val + delta));
    if (next === val) return false;
    numInput.value = next;
    rangeInput.value = next;
    numInput.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
}

function clearHoldTimers() {
    if (holdInitialTimeout) clearTimeout(holdInitialTimeout);
    if (holdInterval) clearInterval(holdInterval);
    holdInitialTimeout = null;
    holdInterval = null;
    if (holdBtn) holdBtn.classList.remove('holding');
    holdBtn = null;
}

function startHold(btn) {
    holdBtn = btn;
    holdBtn.classList.add('holding');
    holdStartedAt = performance.now();
    // 첫 단일 증가 (클릭과 동일)
    applyStep(btn);
    // 일정 지연 후 반복 시작
    holdInitialTimeout = setTimeout(() => {
        scheduleAdaptiveInterval();
    }, 420); // 초기 길게 누름 지연
}

function scheduleAdaptiveInterval() {
    if (!holdBtn) return;
    // 경과 시간에 따라 interval 속도 변경 (가속)
    const elapsed = performance.now() - holdStartedAt;
    let period = 120; // 기본 120ms
    if (elapsed > 2500) period = 40; // 2.5초 이후 매우 빠르게
    else if (elapsed > 1200) period = 70; // 1.2초 이후 빠르게
    if (holdInterval) clearInterval(holdInterval);
    holdInterval = setInterval(() => {
        if (!holdBtn) return;
        const progressed = applyStep(holdBtn);
        if (!progressed) {
            // 경계 도달 시 중단
            clearHoldTimers();
            return;
        }
        // 주기 재평가 (가속 단계 진입 확인)
        scheduleAdaptiveInterval();
    }, period);
}

// 마우스 / 터치 이벤트 등록
function isStepButton(el) {
    return el && el.classList && el.classList.contains('step-btn-small');
}

document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // 좌클릭만
    const btn = e.target.closest('.step-btn-small');
    if (!isStepButton(btn)) return;
    startHold(btn);
});
document.addEventListener(
    'touchstart',
    (e) => {
        const btn = e.target.closest('.step-btn-small');
        if (!isStepButton(btn)) return;
        startHold(btn);
    },
    { passive: true }
);

function endHold(e) {
    if (!holdBtn) return;
    clearHoldTimers();
}
['mouseup', 'mouseleave', 'blur'].forEach((ev) => window.addEventListener(ev, endHold));
['touchend', 'touchcancel'].forEach((ev) => window.addEventListener(ev, endHold));

// Esc 키로도 중단
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') clearHoldTimers();
});

// 시리얼 미지원 안내
if (!('serial' in navigator)) {
    document.body.innerHTML =
        '<div style="padding:40px;font:16px system-ui;">이 브라우저는 Web Serial API 를 지원하지 않습니다. Chrome 기반 최신 브라우저를 사용해주세요.</div>';
}

// ================= 유지보수/점검 토글 =================
const DEV_FLAG = 'petmon.deviceMaintenance';
const GBL_FLAG = 'petmon.globalMaintenance';

// 변경사항: 상태 변경 브로드캐스트 유틸
function broadcastMaintChange() {
    try {
        // 동일 탭/다른 탭 모두 반응하도록 localStorage ping
        localStorage.setItem('__petmon_maint_bcast', String(Date.now()));
    } catch {}
    try {
        window.dispatchEvent(
            new CustomEvent('petmon:maintenance-change', {
                detail: {
                    device: sessionStorage.getItem(DEV_FLAG) === '1' || !!window.__maintenanceMode,
                    global: sessionStorage.getItem(GBL_FLAG) === '1',
                },
            })
        );
    } catch {}
}
// (추가) 플래그 헬퍼 + UI 반영
function isDeviceMaintOn() {
    return sessionStorage.getItem(DEV_FLAG) === '1' || !!window.__maintenanceMode;
}
function isGlobalMaintOn() {
    return sessionStorage.getItem(GBL_FLAG) === '1';
}
function setStatus(el, text, cls) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove('status-green', 'status-yellow', 'status-red');
    if (cls) el.classList.add(cls);
}
function applyMaintToStatusUI() {
    try {
        const on = isDeviceMaintOn() || isGlobalMaintOn();
        const arduinoEl = document.getElementById('arduino-status');
        const machineEl = document.getElementById('machine-status');
        const startBtn = document.getElementById('login-button');

        if (on) {
            setStatus(arduinoEl, '준비중', 'status-yellow');
            setStatus(machineEl, '불가능', 'status-red');
            if (startBtn) startBtn.disabled = true;
        } else {
            setStatus(arduinoEl, '정상', 'status-green');
            setStatus(machineEl, '가능', 'status-green');
            if (startBtn) startBtn.disabled = false;
        }
    } catch {}
}

function reflectMaintButtons() {
    try {
        const devOn = isDeviceMaintOn();
        const gblOn = isGlobalMaintOn();
        const bDev = document.getElementById('btn-maint-device');
        const bGbl = document.getElementById('btn-maint-global');
        if (bDev) {
            bDev.textContent = devOn ? '기기 점검 (ON)' : '기기 점검';
            bDev.style.outline = devOn ? '2px solid #93c5fd' : '';
            bDev.style.background = devOn ? '#374151' : '';
        }
        if (bGbl) {
            bGbl.textContent = gblOn ? '전체 점검 (ON)' : '전체 점검';
            bGbl.style.outline = gblOn ? '2px solid #fca5a5' : '';
            bGbl.style.background = gblOn ? '#7f1d1d' : '';
        }
        // (추가) 상태 카드/시작 버튼 동기화
        applyMaintToStatusUI();
    } catch {}
}

function setDeviceMaintenance(on) {
    try {
        sessionStorage.setItem(DEV_FLAG, on ? '1' : '0');
    } catch {}
    // index에서도 읽을 수 있도록 세션 기반 유지 + 전역 힌트
    window.__maintenanceMode = !!on;
    reflectMaintButtons();
    // 변경 알림
    broadcastMaintChange();
}

function setGlobalMaintenance(on) {
    try {
        sessionStorage.setItem(GBL_FLAG, on ? '1' : '0');
    } catch {}
    reflectMaintButtons();
    // 변경 알림
    broadcastMaintChange();
    if (on) {
        // 전체 점검 켜면 안내 페이지로 이동
        window.location.href = '../maintenance.html';
    }
}

document.getElementById('btn-maint-device').addEventListener('click', () => {
    const cur = isDeviceMaintOn();
    setDeviceMaintenance(!cur);
});
document.getElementById('btn-maint-global').addEventListener('click', () => {
    const cur = isGlobalMaintOn();
    setGlobalMaintenance(!cur);
});

reflectMaintButtons();
