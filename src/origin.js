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
const branchNameSpan = document.getElementById('branch-name');

const closeDoorButton = document.createElement('button');
closeDoorButton.id = 'close-door-button';
closeDoorButton.textContent = '닫기';
// 스타일 프리셋
const CLOSE_BTN_ACTIVE_STYLE =
    'margin-top:24px;font-size:1.5rem;padding:12px 32px;background:#3772ff;color:#fff;border:none;border-radius:8px;cursor:pointer;display:block;';
const CLOSE_BTN_DISABLED_STYLE =
    'margin-top:24px;font-size:1.5rem;padding:12px 32px;background:#94a3b8;color:#e5e7eb;border:none;border-radius:8px;cursor:not-allowed;display:block;opacity:0.8;';
closeDoorButton.style = CLOSE_BTN_ACTIVE_STYLE;
// 닫기 버튼 카운트다운(3초 후 활성화) 타이머 상태
let __closeBtnUnlockTimer = null;
let __closeBtnCountdown = 0;

let port, reader, writer;
let isConnected = false;
let isStopped = false;
let autoReturnTimeout;
let countdownInterval;
let errorAutoTimer;
let errorCountdownTimer;
// 테스트 모드 상태
let __testMode = false;
// [ADD] Show error screen only once per session
let __errorShownOnce = false;

// [ADD] 세션용 유틸/상수
const MEMBER_API_URL = 'https://petcycle.mycafe24.com/member_api.php';
const POINT_API_URL = 'https://petcycle.mycafe24.com/point_api.php';

// [ADD] UUID v4 생성 (member/point API용 unique key). group_cd를 prefix로 붙임
function secureUuid(prefix = '') {
    try {
        if (window.crypto && typeof crypto.randomUUID === 'function') {
            return prefix + crypto.randomUUID();
        }
        const buf = new Uint8Array(16);
        crypto.getRandomValues(buf);
        buf[6] = (buf[6] & 0x0f) | 0x40;
        buf[8] = (buf[8] & 0x3f) | 0x80;
        const hex = Array.from(buf)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
        const uuid = `${hex.substr(0, 8)}-${hex.substr(8, 4)}-${hex.substr(12, 4)}-${hex.substr(16, 4)}-${hex.substr(
            20,
            12
        )}`;
        return prefix + uuid;
    } catch {
        const rnd = Math.random().toString(36).slice(2);
        return prefix + Date.now() + '-' + rnd;
    }
}
function newClientUniqueId() {
    const g = (deviceConfig?.groupCode || 'etc') + '-';
    return secureUuid(g);
}
function getGroupCode() {
    return deviceConfig?.groupCode || localStorage.getItem('petmon.group_cd') || 'etc';
}

// 간단 모달(확인/취소) 생성/표시
function showConfirmModal({ title = '확인', lines = [], yesText = '예', noText = '아니오', onYes, onNo }) {
    let overlay = document.getElementById('confirm-modal-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'confirm-modal-overlay';
        overlay.style.cssText = [
            'position:fixed',
            'inset:0',
            'background:rgba(0,0,0,.7)', // 어두운 오버레이
            'backdrop-filter:blur(2px)',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'z-index:9999',
        ].join(';');

        const modal = document.createElement('div');
        modal.id = 'confirm-modal';
        modal.style.cssText = [
            'width:560px', // 살짝 키운 크기 유지
            'max-width:95vw',
            'background:#0f172a', // 아주 어두운 배경 (slate-900)
            'border-radius:14px',
            'overflow:hidden',
            'box-shadow:0 20px 50px rgba(0,0,0,.45)',
            'border:1px solid #1e293b', // 어두운 경계
            'font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif',
            'color:#cbd5e1', // 본문 기본 텍스트
        ].join(';');

        modal.innerHTML = `
          <div id="cm-title" style="
              padding:16px 22px;
              font-size:18px;
              font-weight:800;
              color:#e5e7eb;               /* 밝은 제목 텍스트 */
              background:#111827;          /* 타이틀 바: 한 톤 밝은 어두운색 */
              border-bottom:1px solid #1e293b;
          ">제목</div>

          <div id="cm-body" style="
              padding:18px 22px;
              color:#cbd5e1;               /* 본문: 연한 슬레이트 */
              font-size:22px;
              line-height:1.7;
              background:#0f172a;          /* 본문: 전체 배경과 일치 */
          "></div>

          <div style="
              display:flex;
              gap:10px;
              justify-content:flex-end;
              padding:14px 18px;
              background:#0b1220;          /* 버튼 영역 살짝 차별화 */
              border-top:1px solid #1e293b;
          ">
            <button id="cm-no" style="
                padding:10px 16px;
                border-radius:10px;
                border:1px solid #334155;  /* 어두운 테두리 */
                background:#0f172a;        /* 어두운 버튼 */
                color:#cbd5e1;
                cursor:pointer;
                font-weight:600;
                outline:none;
                width: 100px;
            ">아니오</button>

            <button id="cm-yes" style="
                padding:10px 16px;
                border-radius:10px;
                border:1px solid #3772ff;
                background:#3772ff;        /* 브랜드 블루 */
                color:#ffffff;
                cursor:pointer;
                font-weight:700;
                outline:none;
                width: 100px;
            ">예</button>
          </div>
        `;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // 간단한 호버/포커스 효과
        const yesBtnTemp = modal.querySelector('#cm-yes');
        const noBtnTemp = modal.querySelector('#cm-no');
        const addFocusRing = (el, color) => {
            el.addEventListener('focus', () => (el.style.boxShadow = `0 0 0 2px ${color}55`));
            el.addEventListener('blur', () => (el.style.boxShadow = 'none'));
            el.addEventListener('mouseenter', () => (el.style.filter = 'brightness(1.05)'));
            el.addEventListener('mouseleave', () => (el.style.filter = 'none'));
        };
        addFocusRing(yesBtnTemp, '#3772ff');
        addFocusRing(noBtnTemp, '#94a3b8');
    }

    const titleEl = overlay.querySelector('#cm-title');
    const bodyEl = overlay.querySelector('#cm-body');
    const yesBtn = overlay.querySelector('#cm-yes');
    const noBtn = overlay.querySelector('#cm-no');

    titleEl.textContent = title;
    // lines에 <b> 등 간단 HTML 사용하므로 그대로 출력
    bodyEl.innerHTML = lines.map((l) => `<div style="margin:6px 0;">${l}</div>`).join('');
    yesBtn.textContent = yesText || '예';
    noBtn.textContent = noText || '아니오';

    const close = () => {
        overlay.style.display = 'none';
        yesBtn.onclick = null;
        noBtn.onclick = null;
        document.removeEventListener('keydown', onKey);
        overlay.removeEventListener('click', onOverlayClick);
    };
    yesBtn.onclick = () => {
        try {
            onYes && onYes();
        } finally {
            close();
        }
    };
    noBtn.onclick = () => {
        try {
            onNo && onNo();
        } finally {
            close();
        }
    };

    // ESC/Enter/오버레이 클릭 지원
    const onKey = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            noBtn.click();
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            yesBtn.click();
        }
    };
    const onOverlayClick = (e) => {
        if (e.target && e.target.id === 'confirm-modal-overlay') {
            noBtn.click();
        }
    };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', onOverlayClick);

    overlay.style.display = 'flex';
}

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
    if (__testMode) {
        // 시뮬레이터 writer에 위임
        return writer && writer.write ? writer.write(cmd + '\n') : Promise.resolve();
    }
    if (!writer) return Promise.resolve();
    try {
        return writer.write(cmd + '\n');
    } catch (e) {
        console.error('writeCmd 실패:', cmd, e);
        return Promise.reject(e);
    }
}

let currentPhoneNumber = '';
let deviceConfig = { deviceCode: undefined, branchName: undefined };

// ====== 로컬 ini 파일(C:\\petmon.ini)에서 지점명/기기코드 읽기 ======
// 대신, index.html과 동일한 오리진에서 petmon.ini를 정적 제공하거나(권장, 루트에 배치)
//  1) /petmon.ini (서비스 루트)
//  2) /config/petmon.ini (서브 경로 예시)
// INI 포맷 예:
//   device=SW0000
//   branch=연구소
//   group_cd=suwon
async function loadDeviceConfig() {
    // 0) URL 파라미터 우선 사용 (?branch=연구소&device=SW0000&group_cd=suwon)
    try {
        const params = new URLSearchParams(window.location.search || '');
        const pBranch = params.get('branch');
        const pDevice = params.get('device');
        const pGroupCd = params.get('group_cd');
        if (pBranch || pDevice || pGroupCd) {
            deviceConfig = {
                deviceCode: pDevice || deviceConfig.deviceCode,
                branchName: pBranch || deviceConfig.branchName,
                groupCode: pGroupCd || deviceConfig.groupCode,
            };
            if (deviceConfig.branchName && branchNameSpan) branchNameSpan.textContent = deviceConfig.branchName;
            if (pBranch) localStorage.setItem('petmon.branch', deviceConfig.branchName || '');
            if (pDevice) localStorage.setItem('petmon.device', deviceConfig.deviceCode || '');
            // [ADD] group_cd 저장
            if (pGroupCd) localStorage.setItem('petmon.group_cd', deviceConfig.groupCode || '');
            return;
        }
    } catch {}
    // 1) localStorage 저장값 사용
    try {
        const lsBranch = localStorage.getItem('petmon.branch');
        const lsDevice = localStorage.getItem('petmon.device');
        const lsGroup = localStorage.getItem('petmon.group_cd');
        if (lsBranch || lsDevice || lsGroup) {
            deviceConfig = {
                deviceCode: lsDevice || deviceConfig.deviceCode,
                branchName: lsBranch || deviceConfig.branchName,
                groupCode: lsGroup || deviceConfig.groupCode,
            };
            if (deviceConfig.branchName && branchNameSpan) branchNameSpan.textContent = deviceConfig.branchName;
            return;
        }
    } catch {}
    // 2) window.PETMON_CONFIG 사용
    try {
        if (window && window.PETMON_CONFIG) {
            const cfg = window.PETMON_CONFIG || {};
            deviceConfig = {
                deviceCode: cfg.deviceCode,
                branchName: cfg.branchName,
                groupCode: cfg.groupCode,
            };
            if (deviceConfig.branchName && branchNameSpan) {
                branchNameSpan.textContent = deviceConfig.branchName;
                return;
            }
        }
    } catch {}
    // 3) 같은 오리진에서 제공되는 ini 파일 시도
    const candidates = ['/petmon.ini', '/config/petmon.ini'];
    for (const url of candidates) {
        try {
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) continue;
            const text = await res.text();
            const lines = text.split(/\r?\n/);
            const out = { deviceCode: undefined, branchName: undefined, groupCode: undefined };
            for (const raw of lines) {
                const line = raw.trim();
                if (!line || line.startsWith('#') || line.startsWith(';')) continue;
                const m = line.match(/^([^=:#]+)\s*[:=]\s*(.*)$/);
                if (!m) continue;
                const key = m[1].trim().toLowerCase();
                const val = m[2].trim();
                if (key === 'device' || key === 'devicecode' || key === 'code') out.deviceCode = val;
                if (key === 'branch' || key === 'branchname' || key === 'name') out.branchName = val;
                if (key === 'group_cd' || key === 'group' || key === 'groupcode') out.groupCode = val;
            }
            if (out.branchName || out.deviceCode || out.groupCode) {
                deviceConfig = out;
                if (branchNameSpan && out.branchName) branchNameSpan.textContent = out.branchName;
                if (out.groupCode) localStorage.setItem('petmon.group_cd', out.groupCode);
                if (out.deviceCode) localStorage.setItem('petmon.device', out.deviceCode);
                if (out.branchName) localStorage.setItem('petmon.branch', out.branchName);
                return;
            }
        } catch {}
    }
    if (branchNameSpan) branchNameSpan.textContent = '';
}

// ====== (선택) 파일 선택 대화로 C:\\petmon.ini 불러오기 ======
// 브라우저 보안 정책상 자동 접근은 불가하지만, 사용자의 명시적 동작(키 입력/클릭)으로는 가능.
// 단축키: Ctrl+Alt+I 누르면 파일 선택 창이 열리고 ini를 파싱해서 적용/저장합니다.
function parseIniText(text) {
    const out = { deviceCode: undefined, branchName: undefined, groupCode: undefined };
    const lines = String(text || '').split(/\r?\n/);
    for (const raw of lines) {
        const line = (raw || '').trim();
        if (!line || line.startsWith('#') || line.startsWith(';')) continue;
        const m = line.match(/^([^=:#]+)\s*[:=]\s*(.*)$/);
        if (!m) continue;
        const key = m[1].trim().toLowerCase();
        const val = m[2].trim();
        if (key === 'device' || key === 'devicecode' || key === 'code') out.deviceCode = val;
        if (key === 'branch' || key === 'branchname' || key === 'name') out.branchName = val;
        if (key === 'group_cd' || key === 'group' || key === 'groupcode') out.groupCode = val;
    }
    return out;
}

async function pickAndLoadIni() {
    if (!window.showOpenFilePicker) {
        alert('이 브라우저는 파일 선택 API를 지원하지 않습니다. Chrome/Edge 최신 버전을 사용해주세요.');
        return;
    }
    try {
        const [handle] = await window.showOpenFilePicker({
            multiple: false,
            types: [
                {
                    description: 'INI files',
                    accept: { 'text/plain': ['.ini', '.txt'] },
                },
            ],
            excludeAcceptAllOption: false,
        });
        const file = await handle.getFile();
        const text = await file.text();
        const parsed = parseIniText(text);
        if (!parsed.branchName && !parsed.deviceCode && !parsed.groupCode) {
            alert('유효한 ini 형식이 아닙니다. (예: device=SW0001, branch=홍대점, group_cd=suwon)');
            return;
        }
        deviceConfig = parsed;
        if (branchNameSpan && parsed.branchName) branchNameSpan.textContent = parsed.branchName;
        try {
            if (parsed.branchName) localStorage.setItem('petmon.branch', parsed.branchName);
            if (parsed.deviceCode) localStorage.setItem('petmon.device', parsed.deviceCode);
            if (parsed.groupCode) localStorage.setItem('petmon.group_cd', parsed.groupCode);
        } catch {}
        alert('설정이 적용되었습니다.');
    } catch (e) {
        // 사용자가 취소한 경우 등은 무시
        console.debug('INI 선택 취소 또는 오류:', e);
    }
}

// 전역에 노출(핫키에서 호출)
if (typeof window !== 'undefined') {
    window.pickAndLoadIni = pickAndLoadIni;
    // 초기 지점명/기기코드/group_cd 로드 (origin.js와 동일하게 적용)
    loadDeviceConfig();
}

// 투입 횟수 누적 및 최종 처리 상태
let depositCount = 0;
let isFinalizing = false;
// 마지막 포인트 API 호출 정보 (중복 호출 방지 및 요약 표시)
let lastPointApi = { mobile: null, count: 0, result: null };

// ====== OPFS 기반 포인트 결과 로그 ======
async function appendPointLog(line) {
    try {
        if (!navigator?.storage?.getDirectory) return; // 지원 안하면 무시
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle('petmon', { create: true });
        const file = await dir.getFileHandle('point_log.txt', { create: true });
        const existing = await file.getFile();
        const writer = await file.createWritable({ keepExistingData: true });
        try {
            await writer.seek(existing.size);
            await writer.write(line + '\n');
        } finally {
            await writer.close();
        }
    } catch (e) {
        console.debug('appendPointLog failed (ignored):', e);
    }
}
function nowTs() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return (
        d.getFullYear() +
        '-' +
        pad(d.getMonth() + 1) +
        '-' +
        pad(d.getDate()) +
        ' ' +
        pad(d.getHours()) +
        ':' +
        pad(d.getMinutes()) +
        ':' +
        pad(d.getSeconds())
    );
}

// ====== 전역 에러 로그 (우선순위: 사용자 지정 파일 > Node/Electron 경로 > OPFS) ======
// - 사용자 지정 파일: File System Access API로 한 번 선택하면 IndexedDB에 핸들을 저장, 이후 자동 기록
// - Node/Electron: C:\\petmon\\log\\errorlog.txt 로 바로 기록
// - 브라우저: OPFS(petmon/log/errorlog.txt) 폴백
let __errorFileHandle = null; // File System Access API로 선택한 핸들 (지속 저장)

// IndexedDB 유틸 (작고 안전하게)
function __idbOpen() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('petmon-db', 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('fs-handles')) db.createObjectStore('fs-handles');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
function __idbPut(store, key, val) {
    return __idbOpen().then(
        (db) =>
            new Promise((resolve, reject) => {
                const tx = db.transaction(store, 'readwrite');
                tx.objectStore(store).put(val, key);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            })
    );
}
function __idbGet(store, key) {
    return __idbOpen().then(
        (db) =>
            new Promise((resolve, reject) => {
                const tx = db.transaction(store, 'readonly');
                const req = tx.objectStore(store).get(key);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error);
            })
    );
}

async function __verifyFsPermission(handle, mode = 'readwrite') {
    try {
        if (!handle || !handle.queryPermission || !handle.requestPermission) return false;
        const opts = { mode };
        const q = await handle.queryPermission(opts);
        if (q === 'granted') return true;
        const r = await handle.requestPermission(opts);
        return r === 'granted';
    } catch {
        return false;
    }
}

async function setErrorLogFileManually() {
    if (!window.showSaveFilePicker) {
        alert('이 브라우저는 파일 직접 경로 선택을 지원하지 않습니다. (Chromium 기반 필요)');
        return null;
    }
    try {
        const handle = await window.showSaveFilePicker({
            suggestedName: 'errorlog.txt',
            types: [
                {
                    description: 'Text Log',
                    accept: { 'text/plain': ['.txt'] },
                },
            ],
        });
        const ok = await __verifyFsPermission(handle, 'readwrite');
        if (!ok) {
            alert('파일 쓰기 권한이 필요합니다. 다시 선택해주세요.');
            return null;
        }
        __errorFileHandle = handle;
        try {
            await __idbPut('fs-handles', 'errorLogFile', handle);
        } catch {}
        alert('에러 로그가 해당 파일에 자동 저장됩니다.');
        return handle;
    } catch (e) {
        console.debug('사용자 지정 에러 로그 파일 선택 취소/오류:', e);
        return null;
    }
}

async function __appendToSelectedFile(line) {
    try {
        const handle = __errorFileHandle || (await __idbGet('fs-handles', 'errorLogFile'));
        if (!handle) return false;
        __errorFileHandle = handle; // 캐시
        const ok = await __verifyFsPermission(handle, 'readwrite');
        if (!ok) return false;
        // 기존 내용 뒤에 append
        const file = await handle.getFile();
        const writer = await handle.createWritable({ keepExistingData: true });
        try {
            await writer.seek(file.size);
            await writer.write(String(line) + '\n');
        } finally {
            await writer.close();
        }
        return true;
    } catch (e) {
        console.debug('선택 파일로 에러 로그 기록 실패, 다음 경로로 폴백:', e);
        return false;
    }
}
function __errorToText(err) {
    try {
        if (!err && err !== 0) return '';
        if (err instanceof Error) return err.stack || err.message || String(err);
        if (typeof err === 'object') {
            // 순환 참조 방지
            try {
                return JSON.stringify(err);
            } catch {
                return String(err);
            }
        }
        return String(err);
    } catch {
        return '';
    }
}

async function appendErrorLog(line) {
    // 0) 사용자가 지정한 파일(지속 핸들)로 먼저 시도
    try {
        if (await __appendToSelectedFile(line)) return; // 성공 시 끝
    } catch {}

    // 1) Electron/Node 환경이면 고정 경로(C:\\petmon\\log\\errorlog.txt)에 기록
    try {
        const hasWinRequire = typeof window !== 'undefined' && typeof window.require === 'function';
        const isElectron = !!(typeof process !== 'undefined' && process.versions && process.versions.electron);
        const canRequire = hasWinRequire || typeof require === 'function';
        if (canRequire && (isElectron || typeof process !== 'undefined')) {
            const req = hasWinRequire ? window.require : require;
            const fs = req('fs');
            const path = req('path');
            const dir = 'C:\\petmon\\log'; // 요청 경로로 변경
            const filePath = path.join(dir, 'errorlog.txt');
            await fs.promises.mkdir(dir, { recursive: true });
            await fs.promises.appendFile(filePath, String(line) + '\n', 'utf8');
            return; // 성공 시 종료
        }
    } catch (e) {
        // Node 경로 기록 실패 → OPFS로 폴백
        console.debug('Windows 경로 에러 로그 기록 실패, OPFS로 폴백합니다:', e);
    }

    // 2) 브라우저 OPFS 폴백 (원 오리진 사설 파일 시스템) → petmon/log/errorlog.txt
    try {
        if (!navigator?.storage?.getDirectory) return; // 미지원 시 중단
        const root = await navigator.storage.getDirectory();
        const dir1 = await root.getDirectoryHandle('petmon', { create: true });
        const dir2 = await dir1.getDirectoryHandle('log', { create: true });
        const fh = await dir2.getFileHandle('errorlog.txt', { create: true });
        const existing = await fh.getFile();
        const writer = await fh.createWritable({ keepExistingData: true });
        try {
            await writer.seek(existing.size);
            await writer.write(String(line) + '\n');
        } finally {
            await writer.close();
        }
    } catch (e) {
        console.debug('OPFS 에러 로그 기록 실패(무시):', e);
    }
}

// console.error 후킹하여 에러도 파일에 남김 (원래 콘솔 출력은 유지)
const __origConsoleError = console.error.bind(console);
console.error = function (...args) {
    try {
        const line = `[${nowTs()}] CONSOLE_ERROR ${args.map((a) => __errorToText(a)).join(' ')}`;
        appendErrorLog(line);
    } catch {}
    return __origConsoleError(...args);
};

// 포인트 적립 API 호출
async function callPointApi(mobileWithHyphens, count) {
    if (__testMode) {
        return Promise.resolve({ status: 'ok', test: true, mobile: mobileWithHyphens, input_cnt: count });
    }
    // [CHG] cyclepet 도메인 + JSON 방식 + unique key + group_cd 포함
    const apiUrl = POINT_API_URL;
    const payload = {
        mobile: String(mobileWithHyphens || ''),
        input_cnt: Number(count),
        device: deviceConfig.deviceCode || 'UNKNOWN',
        group_cd: getGroupCode() || 'etc',
        client_unique_id: newClientUniqueId(),
    };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const text = await response.text();
        let parsed;
        try {
            parsed = text ? JSON.parse(text) : null;
        } catch {
            parsed = text;
        }

        if (!response.ok) {
            const errMsg = parsed && parsed.message ? parsed.message : `HTTP 오류: ${response.status}`;
            throw new Error(errMsg);
        }
        return parsed;
    } catch (error) {
        console.error('포인트 API 호출 실패:', error);
        throw error;
    }
}

// [ADD] 회원 확인 API 호출
async function callMemberApi(mobileWithHyphens) {
    const apiUrl = MEMBER_API_URL;
    const payload = {
        mobile: String(mobileWithHyphens || ''),
        device: deviceConfig.deviceCode || 'UNKNOWN',
        group_cd: getGroupCode() || 'etc',
        client_unique_id: newClientUniqueId(),
    };
    const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const text = await res.text();
    let parsed;
    try {
        parsed = text ? JSON.parse(text) : null;
    } catch {
        parsed = text;
    }
    if (!res.ok) {
        const msg = parsed && parsed.message ? parsed.message : `HTTP 오류: ${res.status}`;
        throw new Error(msg);
    }
    return parsed;
}

// 누적 투입 횟수로 API 호출 후 메인으로 복귀
async function finalizeAndReturnHome() {
    if (isFinalizing) return;
    isFinalizing = true;
    let result = null;
    try {
        if (currentPhoneNumber && depositCount > 0) {
            // [CHG] callPointApi는 unique key + group_cd 포함해 전송
            result = await callPointApi(currentPhoneNumber, depositCount);
            if (result && result.status === 'error') {
                const logLineErr = `[${nowTs()}] RESULT=ERROR device=${
                    deviceConfig.deviceCode || 'UNKNOWN'
                } mobile=${currentPhoneNumber} count=${depositCount} msg=${
                    (result && (result.message || result)) || ''
                }`;
                appendPointLog(logLineErr);
                console.error('포인트 API 응답 오류:', result.message || result);
            } else {
                const logLineOk = `[${nowTs()}] RESULT=OK device=${
                    deviceConfig.deviceCode || 'UNKNOWN'
                } mobile=${currentPhoneNumber} count=${depositCount} raw=${JSON.stringify(result)}`;
                appendPointLog(logLineOk);
            }
        }
    } catch (err) {
        const logLineEx = `[${nowTs()}] RESULT=EXCEPTION device=${
            deviceConfig.deviceCode || 'UNKNOWN'
        } mobile=${currentPhoneNumber} count=${depositCount} error=${(err && (err.message || err)) || ''}`;
        appendPointLog(logLineEx);
        console.error('포인트 적립 중 예외 발생:', err);
    } finally {
        depositCount = 0;
        showScreen('main-screen');
        isFinalizing = false;
    }
}

// ========== 화면 전환 ==========
function showScreen(screenId) {
    // [ADD] ensure arrow hidden on any screen switch
    hideBottomArrow();

    document.querySelectorAll('.screen').forEach((s) => (s.style.display = 'none'));
    document.getElementById(screenId).style.display = 'flex';

    // 상태 패널 위치 이동
    if (statusSection && statusHostMain && statusHostProcess) {
        if (screenId === 'process-screen') {
            statusHostProcess.appendChild(statusSection);
        } else {
            statusHostMain.appendChild(statusSection);
        }
    }

    // 메인 화면 복귀 시 시작 버튼을 상태체크 규칙으로 갱신
    if (screenId === 'main-screen' && loginButton) {
        loginPopup.style.display = 'none';
        updateLoginButtonByStatus();
    }

    if (screenId === 'end-screen') {
        let countdown = 10;
        const endScreen = document.getElementById('end-screen');
        endScreen.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;">
                <div style="margin-bottom:24px;">
                    <img src="${ICONS.success}" alt="success" width="100" height="100"/>
                </div>
                <div style="font-size:2.4rem;font-weight:bold;color:#3772ff;margin-bottom:12px;">
                    포인트 적립 중...
                </div>
                <div id="end-details" style="font-size:1.2rem;color:#e8eefc;margin-bottom:8px;text-align:center;"></div>
                <div id="end-summary" style="font-size:1.4rem;color:#ffffff;margin-bottom:16px;text-align:center;"></div>
                <div style="font-size:1.1rem;color:#dbe6ff;margin-bottom:24px;text-align:center;">
                    참여해주셔서 감사합니다.<br>
                    <span id="end-countdown" style="color:#fff;font-weight:bold;">${countdown}</span>초 뒤 처음 화면으로 돌아갑니다.
                </div>
                <button id="add-more-button" style="font-size:1.2rem;padding:10px 28px;background:#3772ff;color:#fff;border:none;border-radius:8px;cursor:pointer;margin-bottom:12px;" disabled>
                    페트병 더 넣기
                </button>
                <button id="return-home" style="font-size:1.2rem;padding:10px 28px;background:#fff;color:#3772ff;border:2px solid #3772ff;border-radius:8px;cursor:pointer;" disabled>
                    처음 화면으로
                </button>
            </div>
        `;

        // 카운트다운(버튼 활성화 이후에도 유지)
        const countdownText = document.getElementById('end-countdown');
        countdownInterval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                countdownText.textContent = countdown;
            } else clearInterval(countdownInterval);
        }, 1000);

        // 즉시 포인트 API 호출하여 요약 표시
        (async () => {
            const details = document.getElementById('end-details');
            const summary = document.getElementById('end-summary');
            const btnMore = document.getElementById('add-more-button');
            const btnHome = document.getElementById('return-home');
            try {
                const m = currentPhoneNumber;
                const cnt = depositCount;
                details.textContent = `방금 투입한 개수: ${cnt}개`;

                let res = null;
                if (m && cnt > 0) {
                    res = await callPointApi(m, cnt);
                    lastPointApi = { mobile: m, count: cnt, result: res };

                    // 성공/형식별 처리
                    const data = res?.data || res; // 서버 형식 또는 단순 테스트 형식
                    const inputCnt = Number(data?.input_cnt ?? cnt);
                    const inputPoint = Number(data?.input_point ?? inputCnt * 10);
                    const totalPoint = data?.total_point;

                    // 성공 로그
                    const logLineOk = `[${nowTs()}] RESULT=OK device=${
                        deviceConfig.deviceCode || 'UNKNOWN'
                    } mobile=${m} count=${cnt} raw=${JSON.stringify(res)}`;
                    appendPointLog(logLineOk);

                    summary.innerHTML = `
                        <div><strong>${inputPoint}포인트</strong>가 적립되었습니다.</div>
                        ${totalPoint != null ? `<div>현재 보유 포인트: <strong>${totalPoint}</strong>점</div>` : ''}
                    `;
                } else {
                    summary.textContent = '전화번호 또는 투입 수량이 없어 적립을 진행하지 않았습니다.';
                }
            } catch (err) {
                // 예외 로그
                const logLineEx = `[${nowTs()}] RESULT=EXCEPTION device=${
                    deviceConfig.deviceCode || 'UNKNOWN'
                } mobile=${currentPhoneNumber} count=${depositCount} error=${(err && (err.message || err)) || ''}`;
                appendPointLog(logLineEx);
                summary.innerHTML = `<span style="color:#ffb3b3;">포인트 적립 중 오류가 발생했습니다. 나중에 다시 시도해주세요.</span>`;
                console.error('포인트 적립 중 예외 발생(End Screen):', err);
            } finally {
                // 적립이 처리되었다면 이후 중복 적립 방지 위해 카운트 리셋
                // 단, 실패한 경우에는 리셋하지 않음 (귀가 시 재시도 목적)
                if (lastPointApi?.result) {
                    depositCount = 0;
                }
                if (btnMore) btnMore.disabled = false;
                if (btnHome) btnHome.disabled = false;

                // 자동 복귀 타이머 시작 (버튼 활성화 후에도 동작)
                autoReturnTimeout = setTimeout(() => {
                    finalizeAndReturnHome();
                }, 10000);
            }
        })();

        // 버튼 이벤트 재연결
        document.getElementById('add-more-button').onclick = async () => {
            clearTimeout(autoReturnTimeout);
            clearInterval(countdownInterval);
            const btn = document.getElementById('add-more-button');
            if (btn) btn.disabled = true;
            try {
                // [변경] 로그인(99) 전송 후 잠시 대기 -> 라벨 커터부터 재시작
                await writeCmd('99');
                await new Promise((r) => setTimeout(r, 800)); // 아두이노 로그인 처리 여유
                isStopped = false;
                stopButton.disabled = false;
                await startProcess();
            } finally {
                // startProcess로 화면 전환되므로 복구 불필요하지만 안전상 처리
                if (btn) btn.disabled = false;
            }
        };
        document.getElementById('return-home').onclick = () => {
            clearTimeout(autoReturnTimeout);
            clearInterval(countdownInterval);
            finalizeAndReturnHome();
        };
    } else {
        clearTimeout(autoReturnTimeout);
        clearInterval(countdownInterval);
        try {
            clearInterval(__closeBtnUnlockTimer);
            __closeBtnUnlockTimer = null;
        } catch {}
    }

    // 메인화면으로 돌아갈 때 아두이노에 'X' 신호 전송 및 세션 초기화
    if (screenId === 'main-screen') {
        // [ADD] clear any leftover error timers
        try {
            clearTimeout(errorAutoTimer);
        } catch {}
        try {
            clearInterval(errorCountdownTimer);
        } catch {}

        try {
            clearInterval(__closeBtnUnlockTimer);
            __closeBtnUnlockTimer = null;
        } catch {}
        // [추가] 자동 종료 흐름 플래그/닫기 버튼 정리
        __inactivityExitInProgress = false;
        if (closeDoorButton?.parentNode) {
            try {
                closeDoorButton.parentNode.removeChild(closeDoorButton);
            } catch {}
        }

        if (writer) {
            try {
                writeCmd('X');
            } catch (e) {
                console.error('메인 화면 복귀 시 X 전송 실패:', e);
            }
        }
        // 테스트 모드 시 잔여 큐 비우기
        if (__testMode) {
            __simQueue = [];
            __simPaused = false;
        }

        phoneNumberInput.value = '';
        currentPhoneNumber = '';
        depositCount = 0; // 세션 종료 시 카운트 초기화
        const fill = document.getElementById('process-progress-fill');
        if (fill) fill.style.width = '0%';
        // stepper removed; nothing to reset
    }
}

// 오류 화면 표시 및 점검 모드 전환
function showErrorScreen(message) {
    // [ADD] prevent repeated error screen
    if (__errorShownOnce) return;
    __errorShownOnce = true;

    try {
        clearTimeout(errorAutoTimer);
        clearInterval(errorCountdownTimer);
    } catch {}
    // 에러 화면 진입 자체도 파일에 기록 (메시지 포함)
    try {
        appendErrorLog(`[${nowTs()}] SHOW_ERROR_SCREEN ${String(message || '')}`);
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
        arduinoStatus.textContent = '준비 중';
        arduinoStatus.style.color = '#ff4d4d';
    }
    if (machineStatus) {
        machineStatus.textContent = '투입 불가';
        machineStatus.style.color = '#ff4d4d';
    }
    // 로그인 버튼 비활성화 및 라벨 변경
    if (loginButton) {
        loginButton.disabled = true;
        loginButton.textContent = '고객센터 : 1644-1224';
    }

    const msgEl = document.getElementById('error-message');
    if (msgEl) msgEl.textContent = message || '기기 오류가 발생했습니다. 관리자에게 문의해주세요.';
    const phoneEl = document.getElementById('error-phone');
    if (phoneEl) phoneEl.textContent = `입력한 전화번호: ${currentPhoneNumber || '-'}`;
    showScreen('error-screen');

    const callBtn = document.getElementById('call-support');
    if (callBtn) {
        // 표시만 하고 클릭 불가
        callBtn.disabled = true; // 버튼 비활성
        callBtn.setAttribute('aria-disabled', 'true');
        callBtn.style.cursor = 'not-allowed';
        callBtn.style.opacity = '0.8';
        callBtn.onclick = null; // 기존 핸들러 제거
        callBtn.style.pointerEvents = 'none'; // 혹시 버튼이 아니어도 클릭 차단
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
// 외부 SVG 아이콘(URL) 사용: 더 직관적인 상태 아이콘
const ICONS = {
    // 상태/단계
    openDoor: 'https://api.iconify.design/mdi/door-open.svg?color=%233772ff&width=90&height=90',
    closeDoor: 'https://api.iconify.design/mdi/door-closed.svg?color=%23ff6b6b&width=90&height=90',
    label: 'https://api.iconify.design/mdi/label-outline.svg?color=%233772ff&width=90&height=90',
    scan: 'https://api.iconify.design/mdi/magnify.svg?color=%233772ff&width=90&height=90',
    collect: 'https://api.iconify.design/mdi/recycle-variant.svg?color=%233772ff&width=90&height=90',
    // 피드백/알림
    success: 'https://api.iconify.design/mdi/check-circle-outline.svg?color=%233772ff&width=100&height=100',
    warn: 'https://api.iconify.design/mdi/alert-circle-outline.svg?color=%23ff4d4d&width=90&height=90',
    hand: 'https://api.iconify.design/mdi/hand-back-right.svg?color=%23ff4d4d&width=90&height=90',
    stop: 'https://api.iconify.design/mdi/cog.svg?color=%233772ff&width=90&height=90',
};

// 단계별 배경색 (선택)
const processBgColors = [
    '#e3f0ff', // 문 열림
    '#ffeaea', // 문 닫힘/손조심
    '#f0f6ff', // 판별중
    '#f3f7ff', // 수집중
];

// 공통 렌더러: 아이콘 + 메시지 + 배경
function renderProcess(iconKey, message, bgIndex, { spin = false, iconAlt = '' } = {}) {
    try {
        const iconUrl = ICONS[iconKey] || ICONS.scan;
        const spinClass = spin ? 'spin' : '';
        const accent =
            iconKey === 'openDoor'
                ? 'open'
                : iconKey === 'closeDoor'
                ? 'close'
                : iconKey === 'scan'
                ? 'scan'
                : iconKey === 'collect'
                ? 'collect'
                : iconKey === 'hand'
                ? 'warn'
                : iconKey === 'stop'
                ? 'stop'
                : 'label';

        const iconHtml =
            iconKey === 'label'
                ? `<svg width="90" height="90" viewBox="0 0 90 90" fill="none" aria-hidden="true">
                                 <circle cx="45" cy="45" r="14" fill="#ffffff" stroke="#3772ff" stroke-width="4"/>
                                 <polygon points="40,18 50,18 45,38" fill="#f59e0b" stroke="#fbbf24" stroke-width="2"/>
                                 <polygon points="40,72 50,72 45,52" fill="#f59e0b" stroke="#fbbf24" stroke-width="2"/>
                             </svg>`
                : `<img src="${iconUrl}" alt="${iconAlt || ''}" width="90" height="90"/>`;
        processMessage.innerHTML = `
            <div class="process-hero accent-${accent}">
                <div class="icon-bubble ${spinClass}">${iconHtml}</div>
                <div class="process-title">${message}</div>
            </div>
        `;
        const box = document.querySelector('.process-box');
        if (box) {
            box.classList.remove(
                'theme-open',
                'theme-close',
                'theme-scan',
                'theme-collect',
                'theme-label',
                'theme-warn',
                'theme-stop'
            );
            box.classList.add(`theme-${accent}`);
        }
        const fill = document.getElementById('process-progress-fill');
        if (fill) {
            let pct = 0;
            if (iconKey === 'label') pct = 10;
            else if (iconKey === 'openDoor') pct = 30;
            else if (iconKey === 'closeDoor') pct = 50;
            else if (iconKey === 'scan') pct = 75;
            else if (iconKey === 'collect') pct = 95;
            fill.style.width = pct + '%';
        }

        // [ADD] show bottom arrow only for the label step
        if (iconKey === 'label') {
            showBottomArrowAt(1047);
        } else {
            hideBottomArrow();
        }
    } catch (e) {
        // 안전 장치: 렌더 실패 시 텍스트만
        processMessage.textContent = message;
    }
}

// 원래 디자인 유지: 문 열림/닫힘 전용 렌더러 (inline SVG)
const SVG_OPEN = `
<svg width="90" height="90" viewBox="0 0 64 64" fill="none">
  <circle cx="32" cy="32" r="24" fill="#fff" stroke="#23262f" stroke-width="3"/>
  <circle cx="32" cy="10" r="24" ry="10" fill="#3772ff" stroke="#23262f" stroke-width="3"/>
 </svg>`;
const SVG_CLOSE = `
<svg width="90" height="90" viewBox="0 0 64 64" fill="none">
  <circle cx="32" cy="32" r="24" fill="#3772ff" stroke="#23262f" stroke-width="3"/>
 </svg>`;

function renderOpenDoorOriginal(messageHtml) {
    // [ADD] hide arrow when leaving label step
    hideBottomArrow();

    processMessage.innerHTML = `
        <div class="process-hero accent-open">
            <div class="icon-bubble">${SVG_OPEN}</div>
            <div class="process-title">${messageHtml}</div>
        </div>
    `;
    const box = document.querySelector('.process-box');
    if (box) {
        box.classList.remove('theme-close', 'theme-scan', 'theme-collect', 'theme-label', 'theme-warn', 'theme-stop');
        box.classList.add('theme-open');
    }
    const fill = document.getElementById('process-progress-fill');
    if (fill) fill.style.width = '30%';
}

function renderCloseDoorOriginal(messageText) {
    // [ADD] hide arrow when leaving label step
    hideBottomArrow();

    processMessage.innerHTML = `
        <div class="process-hero accent-close">
            <div class="icon-bubble">${SVG_CLOSE}</div>
            <div class="process-title">${messageText}</div>
        </div>
    `;
    const box = document.querySelector('.process-box');
    if (box) {
        box.classList.remove('theme-open', 'theme-scan', 'theme-collect', 'theme-label', 'theme-warn', 'theme-stop');
        box.classList.add('theme-close');
    }
    const fill = document.getElementById('process-progress-fill');
    if (fill) fill.style.width = '50%';
}

// 버튼 충돌 방지 버튼 숨김
function hideProcessButtons() {
    try {
        const ps = document.getElementById('process-screen');
        if (!ps) return;
        ps.querySelectorAll('button').forEach((btn) => {
            btn.style.display = 'none';
            btn.disabled = true;
        });
    } catch {
        // 무시함.
    }
}

// 다시 실행 시 버튼 표시
//<button id="stop-button" disabled="">종료하기</button> 다시 나타나게
function showProcessButtons() {
    try {
        const ps = document.getElementById('process-screen');
        if (!ps) return;
        ps.querySelectorAll('button').forEach((btn) => {
            btn.style.display = 'inline-block';
            btn.disabled = false;
        });
    } catch {
        // 무시함.
    }
}

// 3분 후 텍스트 변경 및 버튼 추가 로직
let inactivityTimeout;
// [추가] 중복 실행 방지 플래그
let __inactivityExitInProgress = false;

// [추가] end-screen의 귀가 방식과 동일한 “우아한 자동 종료” 흐름
async function beginGracefulAutoExit() {
    if (__inactivityExitInProgress) return;
    __inactivityExitInProgress = true;

    try {
        // 타이머/버튼 정리
        clearTimeout(inactivityTimeout);
        clearTimeout(autoReturnTimeout);
        clearInterval(countdownInterval);
        hideProcessButtons();
        try {
            if (__closeBtnUnlockTimer) {
                clearInterval(__closeBtnUnlockTimer);
                __closeBtnUnlockTimer = null;
            }
        } catch {}

        // 닫기 버튼 제거
        try {
            if (closeDoorButton?.parentNode) {
                closeDoorButton.disabled = true;
                closeDoorButton.style = CLOSE_BTN_DISABLED_STYLE;
                closeDoorButton.parentNode.removeChild(closeDoorButton);
            }
        } catch {}

        // [변경] renderProcess로 테마/프로그레스 갱신
        renderProcess('closeDoor', '입력이 없어 종료합니다.<br>안전을 위해 문을 닫는 중입니다...', 1);

        // 카운트다운/버튼 UI 추가만 별도로 붙임
        let countdown = 10;
        const extra = document.createElement('div');
        extra.id = 'inact-extra-ui';
        extra.style.cssText = 'margin-top:16px;text-align:center;';
        extra.innerHTML = `
            <div style="font-size:1rem;color:#dbe6ff;margin-bottom:16px;">
                <span id="inact-countdown" style="color:#fff;font-weight:bold;">${countdown}</span>초 뒤 처음 화면으로 돌아갑니다.
            </div>
            <button id="inact-return-home" style="font-size:1.1rem;padding:10px 24px;background:#fff;color:#3772ff;border:2px solid #3772ff;border-radius:8px;cursor:pointer;">
                처음 화면으로
            </button>
        `;
        processMessage.appendChild(extra);

        // 문 닫기 신호(2) 1회 전송
        try {
            await writeCmd('2');
        } catch (e) {
            if (!handleDeviceLost(e)) console.error('무입력 종료: 문 닫기(2) 전송 실패:', e);
        }

        // 버튼/카운트다운 동작
        const btnHome = document.getElementById('inact-return-home');
        const cdText = document.getElementById('inact-countdown');

        if (btnHome) {
            btnHome.onclick = () => {
                clearTimeout(autoReturnTimeout);
                clearInterval(countdownInterval);
                showScreen('main-screen'); // 여기서 X 전송/세션 초기화
                __inactivityExitInProgress = false;
            };
        }

        countdownInterval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                if (cdText) cdText.textContent = countdown;
            } else {
                clearInterval(countdownInterval);
            }
        }, 1000);

        autoReturnTimeout = setTimeout(() => {
            showScreen('main-screen'); // 여기서 X 전송/세션 초기화
            __inactivityExitInProgress = false;
        }, 10000);
    } catch (err) {
        __inactivityExitInProgress = false;
        if (handleDeviceLost(err)) return;
        console.error('무입력 종료 흐름 중 오류:', err);
        showErrorScreen('기기 오류가 발생했습니다. 관리자에게 문의해주세요.');
    }
}

function handleInactivity() {
    clearTimeout(inactivityTimeout);
    inactivityTimeout = setTimeout(() => {
        // end-screen의 귀가 로직과 동일한 흐름으로 종료
        beginGracefulAutoExit();
    }, 180000); // 3분(180000ms). 테스트 중엔 15초
}

// 종료하기 버튼 로직 수정 (포인트 적립 제거)
async function handleExitButton() {
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
                if (i === 0) {
                    renderCloseDoorOriginal(commands[i].msg);
                } else if (i === 1) {
                    renderProcess('scan', commands[i].msg, 2);
                } else {
                    renderProcess('collect', commands[i].msg, 3, { spin: true });
                }

                await writeCmd(commands[i].cmd);
                // [추가] 각 명령 전송 후 짧은 지연시간을 주어 Serial1 통신 안정화
                await new Promise((r) => setTimeout(r, 50));

                if (commands[i].cmd === '3') {
                    // 3번 명령은 'Sensor2 became LOW.'를 기다림
                    await waitForArduinoResponse('Sensor2 became LOW.');
                } else if (commands[i].cmd === '4') {
                    // [수정] 'Sensor1 became LOW.' 신호를 받은 후, 5초 더 기다렸다가 다음으로 진행
                    await waitForArduinoResponse('Sensor1 became LOW.');
                    //await new Promise((r) => setTimeout(r, 3000));
                } else {
                    // 2번 명령(문 닫기) 처리
                    await waitForArduinoResponse('Door closed successfully!');
                }
            }

            // 기존: await writeCmd('X'); // 제거 — showScreen('main-screen')에서 X 전송
            showScreen('main-screen'); // 메인 화면 전환 시 showScreen 내부에서 X 전송 및 세션 초기화
        } catch (err) {
            if (handleDeviceLost(err)) return;
            console.error('종료 중 오류:', err);
            showErrorScreen('기기 오류가 발생했습니다. 관리자에게 문의해주세요.');
        }
    };

    processMessage.appendChild(exitButton);
}

async function startProcess() {
    clearTimeout(autoReturnTimeout);
    clearTimeout(inactivityTimeout);

    if (!isConnected) {
        await connectToFaduino();
        if (!isConnected) {
            // alert → 에러 화면
            abortProcessNow('기기 연결이 필요합니다. 관리자에게 문의해주세요.');
            return;
        }
    }

    showProcessButtons();
    showScreen('process-screen');
    isStopped = false;
    stopButton.disabled = true;

    if (closeDoorButton.parentNode) closeDoorButton.parentNode.removeChild(closeDoorButton);
    closeDoorButton.disabled = false;

    renderProcess('label', '띠를 먼저 분리해주세요.<br>분리하시면 문이 열립니다.', 2);
    const __pf = document.getElementById('process-progress-fill');
    if (__pf) __pf.style.width = '10%';

    let openOrStopped;
    try {
        openOrStopped = await waitForAnyArduinoResponse(
            [
                'Label cutting done!',
                'Label cutting done',
                'Door will opened',
                'Door will open',
                'Door opened',
                'Door open',
                // 'Motor stopped.' 제거
            ],
            { timeoutMs: 60000 }
        );
    } catch (err) {
        if (handleDeviceLost(err)) return;

        // 띠 분리기 단계: 1분 무입력 시 브라우저 새로고침(F5와 동일)
        const msg = String(err && (err.message || err));
        if (msg.includes('Timeout while waiting for Arduino response')) {
            try {
                appendErrorLog(`[${nowTs()}] LABEL_STAGE_TIMEOUT -> reload`);
            } catch {}
            try {
                await teardownSerial();
            } catch {}
            window.location.reload();
            return;
        }

        // 기타 예외는 기존대로 에러 화면
        showErrorScreen('기기 오류가 발생했습니다. 관리자에게 문의해주세요.');
        return;
    }

    // 문 열림 안내
    const openMsg = `문이 열립니다.<br>띠를 제거한 페트병을 투입해주세요.<br>마지막으로 닫기 버튼을 눌러주세요.`;
    renderOpenDoorOriginal(openMsg);

    // "작동중지" 버튼 옆에 "닫힘" 버튼 추가
    stopButton.parentNode.insertBefore(closeDoorButton, stopButton.nextSibling);
    // 닫기 버튼 3초 카운트다운 후 활성화
    try {
        clearInterval(__closeBtnUnlockTimer);
    } catch {}
    __closeBtnCountdown = 3;
    closeDoorButton.disabled = true;
    closeDoorButton.style = CLOSE_BTN_DISABLED_STYLE;
    closeDoorButton.textContent = `닫기 (${__closeBtnCountdown})`;
    __closeBtnUnlockTimer = setInterval(() => {
        __closeBtnCountdown -= 1;
        if (__closeBtnCountdown > 0) {
            closeDoorButton.textContent = `닫기 (${'' + __closeBtnCountdown})`;
        } else {
            try {
                clearInterval(__closeBtnUnlockTimer);
            } catch {}
            __closeBtnUnlockTimer = null;
            closeDoorButton.textContent = '닫기';
            closeDoorButton.disabled = false;
            closeDoorButton.style = CLOSE_BTN_ACTIVE_STYLE;
        }
    }, 1000);

    // 비활성 상태 감지 시작
    handleInactivity();

    // 닫힘 -> 판별 -> 수집 (핸들러를 먼저 연결해 UI가 막히지 않도록)
    closeDoorButton.onclick = async () => {
        clearTimeout(inactivityTimeout); // 비활성 타임아웃 취소
        try {
            clearInterval(__closeBtnUnlockTimer);
            __closeBtnUnlockTimer = null;
        } catch {}
        if (closeDoorButton.parentNode) closeDoorButton.parentNode.removeChild(closeDoorButton);
        closeDoorButton.disabled = true;
        closeDoorButton.style = CLOSE_BTN_DISABLED_STYLE;
        try {
            const commands = [
                { cmd: '2', msg: '문이 닫힙니다. 손 조심하세요! ⚠️' },
                { cmd: '3', msg: '자원을 판별하는 중입니다...' },
                { cmd: '4', msg: '자원을 수집하는 중입니다...' },
            ];

            for (let i = 0; i < commands.length; i++) {
                if (i === 0) {
                    renderCloseDoorOriginal(commands[i].msg);
                } else if (i === 1) {
                    renderProcess('scan', commands[i].msg, 2);
                } else {
                    renderProcess('collect', commands[i].msg, 3, { spin: true });
                }

                await writeCmd(commands[i].cmd);
                // [추가] 각 명령 전송 후 짧은 지연시간을 주어 Serial1 통신 안정화
                await new Promise((r) => setTimeout(r, 50));

                if (commands[i].cmd === '3') {
                    // 3번 명령은 'Sensor2 became LOW.'를 기다림
                    await waitForArduinoResponse('Sensor2 became LOW.');
                } else if (commands[i].cmd === '4') {
                    // [수정] 'Sensor1 became LOW.' 신호를 받은 후, 5초 더 기다렸다가 다음으로 진행
                    await waitForArduinoResponse('Sensor1 became LOW.');
                    //await new Promise((r) => setTimeout(r, 3000));
                } else {
                    // 2번 명령(문 닫기) 처리
                    await waitForArduinoResponse('Door closed successfully!');
                }
            }
            stopButton.disabled = true;
            if (isStopped) {
                showScreen('main-screen');
                return;
            }
            depositCount += 1;
            showScreen('end-screen');
        } catch (err) {
            if (handleDeviceLost(err)) return;
            console.error('닫힘/판별/수집 중 오류:', err);
            showErrorScreen('기기 오류가 발생했습니다. 관리자에게 문의해주세요.');
        }
    };

    // [중요] 기존의 "아직 모터 정지 신호를 못 받았다면 여기서 대기" 블록을 제거하여
    // UI가 reader 대기로 막히지 않도록 함(TimeoutError 원인 제거).
    // if (!/motor stopped/i.test(openOrStopped)) {
    //     await waitForAnyArduinoResponse(['Motor stopped.', 'Motor stopped']);
    // }

    // 비활성 상태 감지 시작
    handleInactivity();
}

// 진행 중 프로세스를 즉시 중단하고 에러 화면으로 전환
function abortProcessNow(message) {
    try {
        clearTimeout(inactivityTimeout);
    } catch {}
    try {
        clearTimeout(autoReturnTimeout);
    } catch {}
    try {
        clearInterval(countdownInterval);
    } catch {}
    try {
        if (__closeBtnUnlockTimer) {
            clearInterval(__closeBtnUnlockTimer);
            __closeBtnUnlockTimer = null;
        }
    } catch {}
    try {
        if (closeDoorButton?.parentNode) {
            closeDoorButton.disabled = true;
            closeDoorButton.style = CLOSE_BTN_DISABLED_STYLE;
            closeDoorButton.parentNode.removeChild(closeDoorButton);
        }
    } catch {}
    __inactivityExitInProgress = false;
    showErrorScreen(message || '기기 오류가 발생했습니다. 관리자에게 문의해주세요.');
}

// 공통 정규화 유틸 (미정의 참조 오류 방지)
function normalizeText(s) {
    try {
        return String(s || '')
            .toLowerCase()
            .replace(/\r/g, '');
    } catch {
        return '';
    }
}

// 공통: 수신 데이터에 'already' 포함 시 센서 오류 처리
function detectAndHandleAlready(data) {
    try {
        const s = String(data || '').toLowerCase();
        if (!s.includes('already')) return false;

        // 자동 종료 흐름 중에는 무시
        if (typeof __inactivityExitInProgress !== 'undefined' && __inactivityExitInProgress) return false;

        // 문 상태 관련 메시지("door already open/closed")는 에러 아님
        if (s.includes('door')) return false;

        // 명확히 센서 관련일 때만 에러 처리
        if (s.includes('sensor')) {
            showErrorScreen('센서 상태 오류, 관리자에게 문의해주세요.');
            return true;
        }
        // 그 외의 애매한 'already'는 무시
        return false;
    } catch {
        return false;
    }
}

// 완료 신호를 10초 내 받지 못하면 모터 오작동 에러로 중단
function waitForArduinoResponse(targetMessage, { timeoutMs = 10000 } = {}) {
    return new Promise((resolve, reject) => {
        let receivedData = '';
        const timer = setTimeout(() => {
            abortProcessNow('기기 오류: 모터 오작동(10초 내 완료 신호 없음)');
            reject(new Error('Motor malfunction timeout'));
        }, timeoutMs);

        const loop = async () => {
            try {
                const { value, done } = await reader.read();
                if (done) {
                    clearTimeout(timer);
                    reject(new Error('Reader stream closed unexpectedly.'));
                    return;
                }
                if (value) {
                    receivedData += value;

                    if (receivedData.includes('ERROR:')) {
                        clearTimeout(timer);
                        const line = receivedData.split(/\r?\n/).find((l) => l.includes('ERROR:')) || '기기 오류';
                        const msg = line.replace(/.*ERROR:\s*/, '');
                        abortProcessNow(`기기 오류: ${msg}`);
                        reject(new Error(msg));
                        return;
                    }

                    if (detectAndHandleAlready(receivedData)) {
                        clearTimeout(timer);
                        reject(new Error('Sensor state error (already)'));
                        return;
                    }

                    if (receivedData.includes(targetMessage)) {
                        clearTimeout(timer);
                        resolve();
                        return;
                    }
                }
                loop();
            } catch (error) {
                clearTimeout(timer);
                console.error('Error in waitForArduinoResponse loop:', error);
                if (!handleDeviceLost(error)) {
                    abortProcessNow('기기 오류가 발생했습니다. 관리자에게 문의해주세요.');
                }
                reject(error);
            }
        };
        loop();
    });
}

// 다중 패턴 대기: 에러/이미 상태 시 즉시 중단 + reject
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

// 2단계(문 닫기) 중 손 감지/완료 대기: 10초 타임아웃 추가 + 에러 시 중단
function waitForCloseOrHand(targetMessage, { timeoutMs = 10000 } = {}) {
    return new Promise((resolve, reject) => {
        let receivedData = '';
        const timer = setTimeout(() => {
            abortProcessNow('기기 오류: 모터 오작동(10초 내 완료 신호 없음)');
            reject(new Error('Motor malfunction timeout'));
        }, timeoutMs);

        const loop = async () => {
            try {
                const { value, done } = await reader.read();
                if (done) {
                    clearTimeout(timer);
                    reject(new Error('Reader stream closed unexpectedly.'));
                    return;
                }
                if (value) {
                    receivedData += value;

                    if (receivedData.includes('ERROR:')) {
                        clearTimeout(timer);
                        const line = receivedData.split(/\r?\n/).find((l) => l.includes('ERROR:')) || '기기 오류';
                        const msg = line.replace(/.*ERROR:\s*/, '');
                        abortProcessNow(`기기 오류: ${msg}`);
                        reject(new Error(msg));
                        return;
                    }

                    if (detectAndHandleAlready(receivedData)) {
                        clearTimeout(timer);
                        reject(new Error('Sensor state error (already)'));
                        return;
                    }

                    if (receivedData.includes('HAND DETECTED!') || receivedData.includes('23')) {
                        clearTimeout(timer);
                        renderProcess('hand', '손이 감지되었습니다. 문이 열립니다.', 1);
                        resolve({ status: 'hand' });
                        return;
                    }

                    if (receivedData.includes(targetMessage)) {
                        clearTimeout(timer);
                        resolve({ status: 'ok' });
                        return;
                    }
                }
                loop();
            } catch (error) {
                clearTimeout(timer);
                console.error('Error in waitForCloseOrHand loop:', error);
                if (!handleDeviceLost(error)) {
                    abortProcessNow('기기 오류가 발생했습니다. 관리자에게 문의해주세요.');
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
    renderCloseDoorOriginal('문이 닫힙니다. 손 조심하세요! ⚠️');
    await writeCmd('2');
    const closeResult = await waitForCloseOrHand('Door closed successfully!');

    if (closeResult.status === 'hand') {
        // 다시 열기
        await writeCmd('1');
        await waitForArduinoResponse('Motor stopped.');

        // 재닫기 안내
        renderCloseDoorOriginal('문이 다시 닫힙니다. 손을 치워주세요. ⚠️');
        await writeCmd('2');
        await waitForArduinoResponse('Door closed successfully!');
    }

    // 3. 판별중
    renderProcess('scan', '자원을 판별하는 중입니다...', 2);
    await writeCmd('3');
    await waitForArduinoResponse('Motor task completed!');

    // 4. 수집중
    renderProcess('collect', '자원을 수집하는 중입니다...', 3, { spin: true });
    await writeCmd('4');
    await waitForArduinoResponse('24V Motor stopped.');
}

// ========== Fa-duino 연결 ==========
async function connectToFaduino() {
    try {
        if (__testMode) {
            installSimulator();
            return;
        }
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

        // [변경] 오류 화면 중에는 유지보수 모드 해제/상태체크 재개를 하지 않음
        const isErrorVisible = document.getElementById('error-screen')?.style.display === 'flex';
        if (window && !isErrorVisible) {
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

        // [수정] 메인 화면일 때만, 점검 모드가 아니면 상태에 맞게 버튼 갱신
        // const isErrorVisible = document.getElementById('error-screen')?.style.display === 'flex'; // 중복 선언 제거
        const isMainVisible = document.getElementById('main-screen')?.style.display === 'flex';
        const inMaintenance = !!(window && window.__maintenanceMode);
        if (isMainVisible && !isErrorVisible && !inMaintenance) {
            updateLoginButtonByStatus();
        } else if (isMainVisible) {
            updateLoginButtonByStatus();
        }
    } catch (err) {
        console.error('Serial error:', err);
        isConnected = false;
        showErrorScreen('기기 연결에 실패했습니다. 관리자에게 문의해주세요.');
    }
}

// ========== 이벤트 ==========
loginButton.addEventListener('click', () => {
    loginPopup.style.display = 'flex';
    connectToFaduino();
});

loginSubmit.addEventListener('click', async () => {
    const phone = phoneNumberInput.value;
    if (phone.length !== 13) {
        // 팝업 유지, 간단 안내
        showConfirmModal({
            title: '전화번호 확인',
            lines: ['올바른 전화번호를 입력하세요.', '(예: 010-1234-5678)'],
            yesText: '확인',
            noText: '취소',
            onYes: () => {},
            onNo: () => {},
        });
        return;
    }

    try {
        // [NEW] 먼저 회원 확인 API 호출
        const member = await callMemberApi(phone);

        // 성공 케이스: 회원명 확인 팝업
        if (member?.status === 'success') {
            const uname = member?.data?.user_name || '';
            showConfirmModal({
                title: '회원 확인',
                lines: [`회원명 : <b>${uname}</b>`, `전화번호 : <b>${phone}</b>`, `<b>${uname}</b> 님이 맞으십니까?`],
                yesText: '예',
                noText: '아니오',
                onYes: async () => {
                    // 기존 시작 로직 수행
                    loginPopup.style.display = 'none';
                    currentPhoneNumber = phone;
                    depositCount = 0;

                    try {
                        if (!isConnected) {
                            await connectToFaduino();
                        }
                        if (!isConnected) {
                            abortProcessNow('기기 연결이 필요합니다. 관리자에게 문의해주세요.');
                            return;
                        }
                        await writeCmd('99'); // 로그인
                        await new Promise((r) => setTimeout(r, 800));
                        isStopped = false;
                        stopButton.disabled = false;
                        await startProcess();
                    } catch (e) {
                        console.error('로그인/시작 처리 오류:', e);
                        abortProcessNow('장치에 명령을 전송하지 못했습니다. 관리자에게 문의해주세요.');
                    }
                },
                onNo: () => {
                    // 번호 재입력 유도 (팝업 유지)
                },
            });
            return;
        }

        // FAIL 이면서 "처음 사용" 메시지인 경우: 전화번호 재확인 팝업
        const firstUseMsg = 'PETMON에 처음 사용하시는 회원입니다. 전화번호를 확인하기 위해 한번더 입력 부탁드립니다';
        if (member?.status === 'FAIL' && String(member?.message || '').includes('처음 사용')) {
            showConfirmModal({
                title: '전화번호 확인',
                lines: [`입력하신 전화번호: <b>${phone}</b>`, '이 전화번호가 맞습니까?'],
                yesText: '예',
                noText: '아니오',
                onYes: async () => {
                    // 신규 회원도 동일하게 시작
                    loginPopup.style.display = 'none';
                    currentPhoneNumber = phone;
                    depositCount = 0;

                    try {
                        if (!isConnected) {
                            await connectToFaduino();
                        }
                        if (!isConnected) {
                            abortProcessNow('기기 연결이 필요합니다. 관리자에게 문의해주세요.');
                            return;
                        }
                        await writeCmd('99');
                        await new Promise((r) => setTimeout(r, 800));
                        isStopped = false;
                        stopButton.disabled = false;
                        await startProcess();
                    } catch (e) {
                        console.error('로그인/시작 처리 오류:', e);
                        abortProcessNow('장치에 명령을 전송하지 못했습니다. 관리자에게 문의해주세요.');
                    }
                },
                onNo: () => {
                    // 번호 재입력
                },
            });
            return;
        }

        // 그 외 FAIL/예외 메시지
        showConfirmModal({
            title: '회원 확인 실패',
            lines: [String(member?.message || '회원 확인 중 오류가 발생했습니다.')],
            yesText: '확인',
            noText: '닫기',
            onYes: () => {},
            onNo: () => {},
        });
    } catch (e) {
        console.error('회원 확인 중 오류:', e);
        showConfirmModal({
            title: '오류',
            lines: ['회원 확인 중 오류가 발생했습니다.', String(e?.message || e)],
            yesText: '확인',
            noText: '닫기',
            onYes: () => {},
            onNo: () => {},
        });
    }
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
    try {
        clearInterval(__closeBtnUnlockTimer);
        __closeBtnUnlockTimer = null;
    } catch {}

    // 1번만 끝난 상태에서 중지 시 닫힘 버튼 클릭 로직 자동 실행
    if (!closeDoorButton.disabled && closeDoorButton.parentNode) {
        try {
            closeDoorButton.disabled = true;
            closeDoorButton.style = CLOSE_BTN_DISABLED_STYLE;
            if (closeDoorButton.parentNode) closeDoorButton.parentNode.removeChild(closeDoorButton);

            const commands = [
                { cmd: '2', msg: '문이 닫힙니다. 손 조심하세요! ⚠️' },
                { cmd: '3', msg: '자원을 판별하는 중입니다...' },
                { cmd: '4', msg: '자원을 수집하는 중입니다...' },
            ];
            for (let i = 0; i < commands.length; i++) {
                if (i === 0) {
                    renderCloseDoorOriginal(commands[i].msg);
                } else if (i === 1) {
                    renderProcess('scan', commands[i].msg, 2);
                } else {
                    renderProcess('collect', commands[i].msg, 3, { spin: true });
                }

                await writeCmd(commands[i].cmd);
                // [추가] 각 명령 전송 후 짧은 지연시간을 주어 Serial1 통신 안정화
                await new Promise((r) => setTimeout(r, 50));

                if (commands[i].cmd === '3') {
                    // 3번 명령은 'Sensor2 became LOW.'를 기다림
                    await waitForArduinoResponse('Sensor2 became LOW.');
                } else if (commands[i].cmd === '4') {
                    // [수정] 'Sensor1 became LOW.' 신호를 받은 후, 5초 더 기다렸다가 다음으로 진행
                    await waitForArduinoResponse('Sensor1 became LOW.');
                    //await new Promise((r) => setTimeout(r, 3000));
                } else {
                    // 2번 명령(문 닫기) 처리
                    await waitForArduinoResponse('Door closed successfully!');
                }
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
    // console.log('Return Home button clicked'); // 디버깅 로그 추가
    clearTimeout(autoReturnTimeout);
    clearInterval(countdownInterval);
    // console.log('Navigating to main screen'); // 디버깅 로그 추가
    showScreen('main-screen');
});
addMoreButton.addEventListener('click', async () => {
    // console.log('Add More button clicked'); // 디버깅 로그 추가
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
            // console.log('모터 정지 신호 전송 완료'); // 디버깅 로그 추가
            await waitForArduinoResponse('Motor stopped.'); // 모터 정지 확인
            // console.log('모터 정지 확인 완료'); // 디버깅 로그 추가
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

    try {
        clearInterval(__closeBtnUnlockTimer);
        __closeBtnUnlockTimer = null;
    } catch {}
};
keypad.parentNode.style.position = 'relative'; // Ensure the parent has relative positioning for absolute child
keypad.parentNode.appendChild(keypadCloseButton);

// 시작 버튼 상태를 장비/점검 상태에 맞춰 갱신
function updateLoginButtonByStatus() {
    if (!loginButton) return;
    const inMaintenance = !!(window && window.__maintenanceMode);
    if (inMaintenance) {
        loginButton.disabled = true;
        loginButton.textContent = '고객센터 : 1644-1224';
        loginButton.style.display = 'inline-block';
        return;
    }
    if (isConnected) {
        loginButton.disabled = false;
        loginButton.textContent = '시작하기';
        loginButton.style.display = 'inline-block';
    } else {
        loginButton.disabled = true;
        loginButton.textContent = '연결 대기중';
        loginButton.style.display = 'inline-block';
    }
}

// 전역: 처리되지 않은 Promise 거부 캐치 → 장치 분리시 사용자 안내
if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', (event) => {
        // 장치 분리 안내 우선 처리
        try {
            if (handleDeviceLost(event.reason)) {
                event.preventDefault?.();
                return;
            }
        } catch {}

        // 추가: 모든 미처리 거부를 에러 로그로 남김
        try {
            const reason = event && event.reason !== undefined ? event.reason : '(no reason)';
            appendErrorLog(`[${nowTs()}] UNHANDLED_REJECTION ${__errorToText(reason)}`);
        } catch {}
    });

    // 전역 런타임 에러 핸들링 → 파일에 기록
    window.addEventListener('error', (ev) => {
        try {
            const msg = ev?.message || 'unknown error';
            const src = ev?.filename || '';
            const ln = ev?.lineno != null ? `:${ev.lineno}` : '';
            const cn = ev?.colno != null ? `:${ev.colno}` : '';
            const errTxt = __errorToText(ev?.error || msg);
            appendErrorLog(`[${nowTs()}] WINDOW_ERROR ${src}${ln}${cn} ${errTxt}`);
        } catch {}
    });
    // 초기 지점명 로드
    loadDeviceConfig();
    // 포인트 로그 내보내기: Ctrl+Alt+L
    window.addEventListener('keydown', async (e) => {
        // Ctrl+Alt+I: 로컬 ini 파일 선택해서 적용
        if (e.ctrlKey && e.altKey && (e.key === 'i' || e.key === 'I')) {
            try {
                await pickAndLoadIni();
            } catch (err) {
                console.debug('INI 선택 중 오류(무시 가능):', err);
            }
            return;
        }

        if (e.ctrlKey && e.altKey && (e.key === 'l' || e.key === 'L')) {
            try {
                if (!navigator?.storage?.getDirectory) return alert('로그 파일 시스템 접근을 지원하지 않습니다.');
                const root = await navigator.storage.getDirectory();
                const dir = await root.getDirectoryHandle('petmon');
                const file = await dir.getFileHandle('point_log.txt');
                const blob = await file.getFile();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'point_log.txt';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                }, 0);
            } catch (err) {
                alert('로그 파일이 아직 없습니다. (투입 후 생성됩니다)');
            }
        }
        // Ctrl+Alt+E: 에러 로그 내보내기 (OPFS)
        if (e.ctrlKey && e.altKey && (e.key === 'e' || e.key === 'E')) {
            try {
                if (!navigator?.storage?.getDirectory) return alert('에러 로그 내보내기를 지원하지 않습니다.');
                const root = await navigator.storage.getDirectory();
                const dir1 = await root.getDirectoryHandle('petmon');
                const dir2 = await dir1.getDirectoryHandle('log');
                const fh = await dir2.getFileHandle('errorlog.txt');
                const blob = await fh.getFile();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'errorlog.txt';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                }, 0);
            } catch (err) {
                alert('에러 로그가 아직 없습니다. (오류 발생 시 생성됩니다)');
            }
        }
        // Ctrl+Alt+O: 에러 로그 파일 직접 지정(한 번만 설정하면 지속 사용)
        if (e.ctrlKey && e.altKey && (e.key === 'o' || e.key === 'O')) {
            try {
                await setErrorLogFileManually();
            } catch (err) {
                console.error('에러 로그 파일 지정 실패:', err);
            }
        }
    });
    // 스크립트에서 수동 호출할 수 있도록 노출
    window.setErrorLogFileManually = setErrorLogFileManually;
    // 테스트 모드 토글/오류 트리거 + 관리자 모드 진입
    const toggleBtn = document.getElementById('btn-toggle-test');
    const errBtn = document.getElementById('btn-test-error');
    const skipBtn = document.getElementById('btn-skip-cutter');
    const testControls = document.getElementById('test-controls');
    const adminTrigger = document.getElementById('admin-mode-trigger');

    // 관리자 모드 전에는 숨김 (CSS에서도 기본값을 none으로 설정)
    if (testControls) testControls.style.display = 'none';

    function exitAdminMode() {
        __testMode = false;
        updateTestBadge();
        if (testControls) testControls.style.display = 'none';
        // [ADD] 관리자 모드 종료 시 세션 제거
        try {
            sessionStorage.removeItem('petmon.adminPinOK');
        } catch {}
    }

    function ensureExitButton() {
        if (!testControls) return;
        let exitBtn = document.getElementById('btn-exit-admin');
        if (!exitBtn) {
            exitBtn = document.createElement('button');
            exitBtn.id = 'btn-exit-admin';
            exitBtn.textContent = '관리자모드 종료';
            exitBtn.style.cssText =
                'font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid #475569;background:#111827;color:#e5e7eb;cursor:pointer;';
            exitBtn.addEventListener('click', exitAdminMode);
            testControls.appendChild(exitBtn);
        }

        // [ADD] 새로고침 버튼
        let refreshBtn = document.getElementById('btn-refresh-page');
        if (!refreshBtn) {
            refreshBtn = document.createElement('button');
            refreshBtn.id = 'btn-refresh-page';
            refreshBtn.textContent = '새로고침';
            refreshBtn.style.cssText =
                'font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid #475569;background:#111827;color:#e5e7eb;cursor:pointer;';
            refreshBtn.addEventListener('click', () => {
                window.location.reload();
            });
            testControls.appendChild(refreshBtn);
        }
    }

    async function enterAdminMode() {
        try {
            // PIN 요구 (전역 유틸은 index.html에 정의)
            if (window.requireAdminPin) {
                const ok = await window.requireAdminPin();
                if (!ok) return;
                try {
                    sessionStorage.setItem('petmon.adminPinOK', '1');
                } catch {}
            }
        } catch {}
        if (testControls) testControls.style.display = 'flex';
        ensureExitButton();
    }

    // 1초 내 4회 연속 클릭 시 관리자 모드 진입
    if (adminTrigger) {
        let clicks = 0;
        let timer = null;
        adminTrigger.addEventListener('click', () => {
            if (clicks === 0) {
                timer = setTimeout(() => {
                    clicks = 0;
                    timer = null;
                }, 1000);
            }
            clicks++;
            if (clicks >= 4) {
                clicks = 0;
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
                enterAdminMode();
            }
        });
    }
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            __testMode = !__testMode;
            updateTestBadge();
            if (__testMode) {
                if (!isConnected) installSimulator();
            } else {
                teardownSerial();
            }
        });
    }
    if (errBtn) {
        errBtn.addEventListener('click', () => {
            if (!__testMode) return alert('테스트 모드를 먼저 켜세요.');
            showErrorScreen('테스트: 임의 오류 화면입니다.');
        });
    }
    if (skipBtn) {
        skipBtn.addEventListener('click', () => {
            if (!__testMode) return alert('테스트 모드를 먼저 켜세요.');
            // 띠 분리기 단계를 건너뛰도록 'Label cutting done'과 문 열림과 동일한 효과 트리거
            simEnqueue('Label cutting done!', 100);
            simEnqueue('Door will open', 200);
            simEnqueue('Motor stopped.', 400);
        });
    }
    updateTestBadge();
}
// [ADD] Bottom arrow helpers (tip+body with animation)
function showBottomArrowAt(px) {
    try {
        // Inject styles once
        if (!document.getElementById('bottom-arrow-style')) {
            const style = document.createElement('style');
            style.id = 'bottom-arrow-style';
            style.innerHTML = `
                #bottom-arrow {
                    position: fixed;
                    bottom: 12px;                   /* lift a bit above the edge */
                    pointer-events: none;
                    z-index: 9999;
                    display: block;
                    /* Base transform includes -50% X centering; animation adjusts Y only */
                    transform: translate(-50%, 0);
                    animation: arrow-bob 1.3s ease-in-out infinite;
                }
                #bottom-arrow .shaft {
                    width: 14px;                    /* thicker body */
                    height: 70px;                   /* taller body */
                    background: var(--arrow-color, #3772ff);
                    margin: 0 auto;
                    box-shadow: 0 2px 4px rgba(0,0,0,.35);
                }
                #bottom-arrow .head {
                    width: 0;
                    height: 0;
                    border-left: 22px solid transparent;
                    border-right: 22px solid transparent;
                    border-top: 28px solid var(--arrow-color, #3772ff); /* bigger tip */
                    filter: drop-shadow(0 2px 4px rgba(0,0,0,.35));
                }
                @keyframes arrow-bob {
                    0%, 100% { transform: translate(-50%, 0); }
                    50%      { transform: translate(-50%, -12px); }
                }
            `;
            document.head.appendChild(style);
        }

        let el = document.getElementById('bottom-arrow');
        if (!el) {
            el = document.createElement('div');
            el.id = 'bottom-arrow';
            // tip + body
            el.innerHTML = `
                <div class="shaft"></div>
                <div class="head"></div>
            `;
            document.body.appendChild(el);
        }
        el.style.left = px + 'px';
        el.style.display = 'block';
    } catch {}
}

function hideBottomArrow() {
    try {
        const el = document.getElementById('bottom-arrow');
        if (el) el.style.display = 'none';
    } catch {}
}
