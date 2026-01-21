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
    document.getElementById('btn-ai-test').disabled = false;
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

// 포트 선택 UI 표시
async function showPortSelectionUI(ports) {
    return new Promise((resolve) => {
        // 모달 오버레이 생성
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        // 모달 컨테이너
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: #1a1a1a;
            border: 2px solid #3772ff;
            border-radius: 12px;
            padding: 24px;
            max-width: 600px;
            width: 90%;
            color: #fff;
        `;

        // 제목
        const title = document.createElement('h2');
        title.textContent = '시리얼 포트 선택';
        title.style.cssText = 'margin: 0 0 16px 0; font-size: 1.5rem; color: #3772ff;';
        modal.appendChild(title);

        // 설명
        const desc = document.createElement('p');
        desc.textContent = `${ports.length}개의 포트가 발견되었습니다. 연결할 포트를 선택하세요:`;
        desc.style.cssText = 'margin: 0 0 16px 0; color: #aaa;';
        modal.appendChild(desc);

        // 포트 목록
        ports.forEach((p, index) => {
            const info = p.getInfo();
            const btn = document.createElement('button');

            // 포트 이름 가져오기 (Web Serial API에서는 직접 이름을 가져올 수 없음)
            // VID/PID로 일반적인 이름 추론
            let portName = 'USB Serial Port';
            if (info.usbVendorId === 1659 && info.usbProductId === 8963) {
                portName = 'Prolific PL2303 USB Serial';
            } else if (info.usbVendorId === 6790 && info.usbProductId === 29987) {
                portName = 'CH340 USB Serial';
            } else if (info.usbVendorId === 1027 && info.usbProductId === 24577) {
                portName = 'FTDI USB Serial';
            } else if (info.usbVendorId === 4292 && info.usbProductId === 60000) {
                portName = 'Silicon Labs CP210x';
            }

            const vid = info.usbVendorId ? `0x${info.usbVendorId.toString(16).padStart(4, '0')}` : 'N/A';
            const pid = info.usbProductId ? `0x${info.usbProductId.toString(16).padStart(4, '0')}` : 'N/A';

            btn.innerHTML = `
                <div style="text-align: left;">
                    <div style="font-weight: bold; margin-bottom: 4px;">${portName}</div>
                    <div style="font-size: 0.85rem; color: #888;">VID=${vid} PID=${pid}</div>
                </div>
            `;
            btn.style.cssText = `
                display: block;
                width: 100%;
                padding: 12px;
                margin-bottom: 8px;
                background: #2d2d2d;
                border: 1px solid #444;
                border-radius: 6px;
                color: #fff;
                font-size: 1rem;
                cursor: pointer;
                transition: all 0.2s;
            `;

            btn.onmouseover = () => {
                btn.style.background = '#3772ff';
                btn.style.borderColor = '#3772ff';
            };
            btn.onmouseout = () => {
                btn.style.background = '#2d2d2d';
                btn.style.borderColor = '#444';
            };

            btn.onclick = () => {
                document.body.removeChild(overlay);
                resolve(p);
            };

            modal.appendChild(btn);
        });

        // 새 포트 추가 버튼
        const addBtn = document.createElement('button');
        addBtn.textContent = '+ 새 포트 추가';
        addBtn.style.cssText = `
            display: block;
            width: 100%;
            padding: 12px;
            margin-top: 8px;
            background: #2d2d2d;
            border: 1px solid #3772ff;
            border-radius: 6px;
            color: #3772ff;
            font-size: 1rem;
            cursor: pointer;
        `;
        addBtn.onclick = async () => {
            document.body.removeChild(overlay);
            try {
                const newPort = await navigator.serial.requestPort();
                resolve(newPort);
            } catch (e) {
                resolve(null);
            }
        };
        modal.appendChild(addBtn);

        // 취소 버튼
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '취소';
        cancelBtn.style.cssText = `
            display: block;
            width: 100%;
            padding: 12px;
            margin-top: 8px;
            background: #444;
            border: 1px solid #666;
            border-radius: 6px;
            color: #fff;
            font-size: 1rem;
            cursor: pointer;
        `;
        cancelBtn.onclick = () => {
            document.body.removeChild(overlay);
            resolve(null);
        };
        modal.appendChild(cancelBtn);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    });
}

async function connect() {
    try {
        // 기존 연결이 있으면 먼저 정리
        if (port) {
            appendLog('기존 포트 연결 정리 중...', 'info');
            try {
                await gracefulDisconnect(false);
            } catch (e) {
                appendLog('기존 연결 정리 실패: ' + e.message, 'err');
            }
            await new Promise((r) => setTimeout(r, 500));
        }

        // 포트 목록 가져오기
        const ports = await navigator.serial.getPorts();
        appendLog(`권한이 있는 포트: ${ports.length}개`, 'info');

        let selectedPort = null;

        if (ports.length === 0) {
            // 포트가 없으면 새로 권한 요청
            appendLog('포트 선택 창을 엽니다...', 'info');
            selectedPort = await navigator.serial.requestPort();
        } else if (ports.length === 1) {
            // 포트가 하나면 자동 선택
            selectedPort = ports[0];
            const info = selectedPort.getInfo();
            appendLog(
                `포트 1개 발견 - 자동 선택: VID=${info.usbVendorId || 'N/A'} PID=${info.usbProductId || 'N/A'}`,
                'info',
            );
        } else {
            // 여러 포트가 있으면 선택 UI 표시
            selectedPort = await showPortSelectionUI(ports);
            if (!selectedPort) {
                appendLog('포트 선택이 취소되었습니다.', 'err');
                return;
            }
        }

        port = selectedPort;
        const portInfo = port.getInfo();
        appendLog(`선택된 포트: VID=${portInfo.usbVendorId || 'N/A'} PID=${portInfo.usbProductId || 'N/A'}`, 'info');

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
    } catch (e) {
        if (e.name === 'NotFoundError' || e.message.includes('No port selected')) {
            appendLog('포트 선택이 취소되었습니다. 다시 시도해주세요.', 'err');
        } else if (e.name === 'InvalidStateError') {
            appendLog('포트가 이미 다른 프로그램에서 사용 중입니다. 다른 프로그램을 종료하고 다시 시도하세요.', 'err');
        } else if (e.name === 'NetworkError' || e.message.includes('ACCESS_DENIED')) {
            appendLog('포트 접근 거부: 다른 프로그램(Arduino IDE 등)을 종료하거나 USB를 다시 연결하세요.', 'err');
        } else {
            appendLog('연결 실패 [' + e.name + ']: ' + e.message, 'err');
            console.error('Serial connection error:', e);
        }
        setConnected(false);
        port = null;
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

                // 버퍼에 개행 없는 메시지가 일정 시간 쌓이면 출력
                if (serialBuffer.length > 0) {
                    // 특정 완료 메시지는 개행 없이도 즉시 출력
                    const patterns = [
                        '24V Motor stopped',
                        'Motor stopped',
                        'Emergency stop',
                        'Door opened',
                        'Door closed',
                    ];

                    for (const pattern of patterns) {
                        if (serialBuffer.includes(pattern)) {
                            const msg = serialBuffer.trim();
                            if (msg) {
                                appendLog(msg, 'rx');
                                handleAutoLoginDetect(msg);
                            }
                            serialBuffer = '';
                            break;
                        }
                    }

                    // 또는 버퍼가 너무 오래되면 타임아웃으로 출력
                    clearTimeout(window._serialBufferTimeout);
                    window._serialBufferTimeout = setTimeout(() => {
                        if (serialBuffer.trim().length > 0) {
                            const msg = serialBuffer.trim();
                            appendLog(msg, 'rx');
                            handleAutoLoginDetect(msg);
                            serialBuffer = '';
                        }
                    }, 500); // 0.5초 후 강제 출력
                }
            }
        } catch (e) {
            appendLog('Read error: ' + e.message, 'err');
            break;
        }
    }
}
function handleAutoLoginDetect(text) {
    const lower = text.toLowerCase();
    if (!loggedIn && (lower.includes('ack:login_user') || lower.includes('ack:login_admin'))) {
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
    // SPEEDS:DO=255;DC=120;D1=70;D2=90 파싱 후 로컬 스토리지 저장
    // 로컬 스토리지에 저장하여 업로드 후에 속도 리셋 되는 현상 방지
    const doMatch = line.match(/DO=(\d+)/);
    const dcMatch = line.match(/DC=(\d+)/);
    const d1Match = line.match(/D1=(\d+)/);
    const d2Match = line.match(/D2=(\d+)/);

    // 펌웨어에서 받은 값을 로컬 스토리지에 저장
    if (doMatch) localStorage.setItem('speed-do', doMatch[1]);
    if (dcMatch) localStorage.setItem('speed-dc', dcMatch[1]);
    if (d1Match) localStorage.setItem('speed-d1', d1Match[1]);
    if (d2Match) localStorage.setItem('speed-d2', d2Match[1]);

    // UI에 반영 (로컬 스토리지 값이 있으면 그것을, 없으면 펌웨어 값을 사용)
    const doValue = localStorage.getItem('speed-do') || (doMatch && doMatch[1]);
    const dcValue = localStorage.getItem('speed-dc') || (dcMatch && dcMatch[1]);
    const d1Value = localStorage.getItem('speed-d1') || (d1Match && d1Match[1]);
    const d2Value = localStorage.getItem('speed-d2') || (d2Match && d2Match[1]);

    if (doValue) {
        document.getElementById('speed-do').value = doValue;
        document.getElementById('speed-do-range').value = doValue;
    }
    if (dcValue) {
        document.getElementById('speed-dc').value = dcValue;
        document.getElementById('speed-dc-range').value = dcValue;
    }
    if (d1Value) {
        document.getElementById('speed-d1').value = d1Value;
        document.getElementById('speed-d1-range').value = d1Value;
    }
    if (d2Value) {
        document.getElementById('speed-d2').value = d2Value;
        document.getElementById('speed-d2-range').value = d2Value;
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
document.getElementById('btn-login').onclick = () => send('LOGIN_ADMIN');
document.getElementById('btn-99login').onclick = () => send('LOGIN_USER');
document.getElementById('btn-help').onclick = () => send('HELP');
document.getElementById('btn-query').onclick = () => send('GET_SPEEDS');
document.getElementById('btn-repair').onclick = () => send('REPAIR');
document.getElementById('btn-logout').onclick = () => send('LOGOUT');
document.getElementById('btn-go-main').onclick = async (e) => {
    e.target.disabled = true;
    await gracefulDisconnect(true);
};
document.getElementById('btn-ai-test').onclick = () => {
    (async () => {
        const btn = document.getElementById('btn-ai-test');
        btn.disabled = true;
        try {
            const classifierModule = await import('./adminClassifier.js');
            if (!classifierModule || !classifierModule.classifyBottleSamples) {
                appendLog('AI 모듈에서 classifyBottleSamples를 찾을 수 없습니다.', 'err');
                return;
            }

            // 팝업 생성 (로딩 표시)
            const overlay = document.createElement('div');
            overlay.style.cssText =
                'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10000;';
            const modal = document.createElement('div');
            modal.style.cssText =
                'width:90%;max-width:860px;max-height:90vh;overflow:auto;background:#0f172a;border-radius:10px;padding:18px;border:1px solid #1e293b;color:#e2e8f0;';
            modal.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><strong style="font-size:1.1rem">AI 테스트 (샘플 이미지 및 결과)</strong><button id="ai-test-close" style="background:#111827;color:#cbd5e1;border-radius:6px;padding:6px 10px;border:1px solid #374151;cursor:pointer">닫기</button></div><div id="ai-test-body">테스트 이미지 수집 중...</div>`;
            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            const closeBtn = modal.querySelector('#ai-test-close');
            closeBtn.onclick = () => {
                try {
                    document.body.removeChild(overlay);
                } catch (e) {}
            };

            const body = modal.querySelector('#ai-test-body');
            body.innerHTML = `<div style="color:#9ca3af;margin-bottom:8px">카메라 접근 및 ${5}회 샘플 수집 중입니다. 잠시만 기다려주세요...</div>`;

            // 수집 (5 samples) — index.js와 동일한 샘플 수를 사용
            const SAMPLES = 5;
            const samples = await classifierModule.classifyBottleSamples(SAMPLES, 300);

            // 결과 렌더링
            const parts = [];
            // aggregate top classes summary
            const topSummary = [];
            samples.forEach((s, idx) => {
                // determine top class for the sample
                let top = null;
                let topProb = -1;
                for (const [k, v] of Object.entries(s.scores)) {
                    if (v > topProb) {
                        top = k;
                        topProb = v;
                    }
                }
                topSummary.push({ idx: idx + 1, top, prob: topProb });

                const predLines = Object.entries(s.scores)
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, v]) => `${k}: ${(v * 100).toFixed(2)}%`)
                    .join('<br>');

                parts.push(`
                    <div style="display:flex;gap:12px;align-items:flex-start;padding:8px;border-bottom:1px solid #111827;">
                        <div style="width:160px;flex:0 0 160px;">
                            ${
                                s.image
                                    ? `<img src="${s.image}" style="width:160px;border-radius:6px;border:1px solid #111827;"/>`
                                    : `<div style="width:160px;height:120px;background:#071024;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#6b7280">이미지 없음</div>`
                            }
                        </div>
                        <div style="flex:1;">
                            <div style="font-weight:700;margin-bottom:6px;color:#e6f0ff">샘플 ${
                                idx + 1
                            } — 최상위: <span style="color:#77f3a5">${top}</span> (${(topProb * 100).toFixed(2)}%)</div>
                            <div style="font-size:0.95rem;color:#cbd5e1;line-height:1.4">${predLines}</div>
                        </div>
                    </div>
                `);
            });

            // aggregated summary across samples (count top occurrences)
            const aggCounts = {};
            topSummary.forEach((t) => {
                aggCounts[t.top] = (aggCounts[t.top] || 0) + 1;
            });
            const aggHtml = Object.entries(aggCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => `<div style="margin-right:12px">${k}: ${v}/${SAMPLES}</div>`)
                .join('');

            body.innerHTML = `<div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;color:#cbd5e1"><div style="font-weight:700">요약:</div><div style="display:flex;">${aggHtml}</div></div>${parts.join(
                '',
            )}`;
        } catch (e) {
            appendLog('AI 테스트 오류: ' + (e && e.message ? e.message : String(e)), 'err');
            console.error(e);
            alert('AI 테스트 중 오류가 발생했습니다. 콘솔 로그를 확인하세요.');
        } finally {
            btn.disabled = false;
        }
    })();
};
buttonsQuick.forEach((b) => (b.onclick = () => send(b.dataset.cmd)));

// 속도 적용
document.getElementById('btn-refresh-speed').onclick = () => send('GET_SPEEDS');

function sendCurrentSpeeds(initial = false) {
    if (!writer || !loggedIn) return;
    const doV = document.getElementById('speed-do').value;
    const dcV = document.getElementById('speed-dc').value;
    const d1V = document.getElementById('speed-d1').value;
    const d2V = document.getElementById('speed-d2').value;
    const cmd = `SET_SPEEDS:DO=${doV};DC=${dcV};D1=${d1V};D2=${d2V}`;
    send(cmd + (initial ? '  // sync' : ''));
    const msg = document.getElementById('auto-speed-msg');
    if (msg) {
        msg.textContent = '동기화됨 (' + new Date().toLocaleTimeString() + ')';
        setTimeout(() => (msg.textContent = '입력값 변경 후 약 0.1초 뒤 자동 전송됩니다.'), 2500);
    }
}

// 입력 변경 자동 전송 (디바운스 100ms) + 로컬 스토리지 저장
['speed-do', 'speed-dc', 'speed-d1', 'speed-d2'].forEach((id) => {
    const el = document.getElementById(id);
    ['input', 'change'].forEach((ev) => {
        el.addEventListener(ev, () => {
            // 로컬 스토리지에 즉시 저장
            localStorage.setItem(id, el.value);

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
        // 슬라이더 값 변경 시에도 로컬 스토리지에 저장
        if (numId.startsWith('speed-')) {
            localStorage.setItem(numId, r.value);
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
        }),
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
    if (elapsed > 2500)
        period = 40; // 2.5초 이후 매우 빠르게
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
    { passive: true },
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

// 페이지 로드 시 로컬 스토리지에서 속도 값 불러오기
function loadSpeedsFromLocalStorage() {
    const speedIds = ['speed-do', 'speed-dc', 'speed-d1', 'speed-d2'];
    speedIds.forEach((id) => {
        const savedValue = localStorage.getItem(id);
        if (savedValue) {
            const numInput = document.getElementById(id);
            const rangeInput = document.getElementById(id + '-range');
            if (numInput) numInput.value = savedValue;
            if (rangeInput) rangeInput.value = savedValue;
        }
    });
}

// 페이지 로드 시 실행
loadSpeedsFromLocalStorage();

// 시리얼 미지원 안내
if (!('serial' in navigator)) {
    document.body.innerHTML =
        '<div style="padding:40px;font:16px system-ui;">이 브라우저는 Web Serial API 를 지원하지 않습니다. Chrome 기반 최신 브라우저를 사용해주세요.</div>';
}

// ================= 유지보수/점검 토글 =================
const DEV_FLAG = 'petmon.deviceMaintenance';
const GBL_FLAG = 'petmon.globalMaintenance';
const CBL_FLAG = 'petmon.Collection';

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
                    collection: sessionStorage.getItem(CBL_FLAG) === '1',
                },
            }),
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

function isCollectionModeOn() {
    return sessionStorage.getItem(CBL_FLAG) === '1';
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
        const cblOn = isCollectionModeOn();
        const bDev = document.getElementById('btn-maint-device');
        const bGbl = document.getElementById('btn-maint-global');
        const cBl = document.getElementById('btn-collection');
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
        if (cBl) {
            cBl.textContent = cblOn ? '수거 중 (ON)' : '수거';
            cBl.style.outline = cblOn ? '2px solid #6ee7b7' : '';
            cBl.style.background = cblOn ? '#064e3b' : '';
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

function setCollectionMode(on) {
    try {
        sessionStorage.setItem(CBL_FLAG, on ? '1' : '0');
    } catch {}
    reflectMaintButtons();
    broadcastMaintChange();
    if (on) {
        window.location.href = '../collection.html';
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

document.getElementById('btn-collection').addEventListener('click', () => {
    const cur = isCollectionModeOn();
    setCollectionMode(!cur);
});
reflectMaintButtons();
