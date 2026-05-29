(function () {
    const EQUIPMENT_STATUS_API_URL = 'https://petmon.ai.kr/api/device/equipment-status';

    function normalizeApiValue(value) {
        return String(value || '').trim();
    }

    function readConfigValue(obj, keys) {
        if (!obj || typeof obj !== 'object') return '';
        for (const key of keys) {
            if (obj[key]) return normalizeApiValue(obj[key]);
        }
        return '';
    }

    function parseIniConfig(text) {
        const config = {};
        String(text || '')
            .split(/\r?\n/)
            .forEach((line) => {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';') || trimmed.startsWith('[')) return;
                const match = trimmed.match(/^([^=:#\s]+)\s*(?:[=:]|\s+)\s*(.+)$/);
                if (match) config[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
            });
        return config;
    }

    function readFromLocalStorage(keys) {
        for (const key of keys) {
            const value = normalizeApiValue(localStorage.getItem(key) || sessionStorage.getItem(key));
            if (value) return value;
        }
        return '';
    }

    function applyIniToConfig(config, ini) {
        config.device =
            config.device ||
            readConfigValue(ini, [
                'petmon.device',
                'petmon.deviceCode',
                'petmon.device_code',
                'device',
                'deviceCode',
                'device_code',
                'equipment_id',
            ]);
        config.group_cd =
            config.group_cd ||
            readConfigValue(ini, ['petmon.group_cd', 'petmon.groupCd', 'group_cd', 'groupCd', 'group']);
        config.branch = config.branch || readConfigValue(ini, ['petmon.branch', 'branch', 'branchName', 'name']);
    }

    async function loadDeviceApiConfig() {
        const params = new URLSearchParams(window.location.search || '');
        const config = {
            device:
                normalizeApiValue(params.get('device')) ||
                normalizeApiValue(params.get('equipment_id')) ||
                readConfigValue(window.deviceConfig, ['deviceCode', 'device_code', 'device', 'equipment_id']) ||
                readConfigValue(window.PETMON_CONFIG, ['deviceCode', 'device_code', 'device', 'equipment_id']) ||
                normalizeApiValue(window.PETMON_DEVICE_CODE),
            group_cd:
                normalizeApiValue(params.get('group_cd')) ||
                normalizeApiValue(params.get('group')) ||
                readConfigValue(window.deviceConfig, ['groupCd', 'group_cd', 'group']) ||
                readConfigValue(window.PETMON_CONFIG, ['groupCd', 'group_cd', 'group']) ||
                normalizeApiValue(window.PETMON_GROUP_CD),
            branch:
                readConfigValue(window.PETMON_CONFIG, ['branch', 'branchName']) ||
                normalizeApiValue(window.PETMON_BRANCH),
        };

        try {
            if (window.electronAPI && typeof window.electronAPI.readPetmonIni === 'function') {
                const iniText = await window.electronAPI.readPetmonIni();
                if (iniText) {
                    applyIniToConfig(config, parseIniConfig(iniText));
                }
            }
        } catch {}

        if (!config.device) {
            for (const path of ['./petmon.ini', './config.ini', './src/petmon.ini', './src/config.ini']) {
                try {
                    const response = await fetch(path, { cache: 'no-store' });
                    if (!response.ok) continue;
                    applyIniToConfig(config, parseIniConfig(await response.text()));
                    if (config.device) break;
                } catch {}
            }
        }

        try {
            config.device =
                config.device ||
                readFromLocalStorage([
                    'petmon.device',
                    'petmon.deviceCode',
                    'petmon.device_code',
                    'device',
                    'deviceCode',
                    'device_code',
                    'equipment_id',
                ]);
            config.group_cd =
                config.group_cd ||
                readFromLocalStorage(['petmon.group_cd', 'petmon.groupCd', 'group_cd', 'groupCd', 'group']);
            config.branch = config.branch || readFromLocalStorage(['petmon.branch', 'branch', 'branchName']);
        } catch {}

        try {
            if (config.device) localStorage.setItem('petmon.device', normalizeApiValue(config.device).toUpperCase());
            if (config.group_cd) localStorage.setItem('petmon.group_cd', normalizeApiValue(config.group_cd));
            if (config.branch) localStorage.setItem('petmon.branch', normalizeApiValue(config.branch));
        } catch {}

        if (config.branch) {
            const branchNameEl = document.getElementById('branch-name');
            if (branchNameEl) branchNameEl.textContent = config.branch;
        }

        return {
            device: normalizeApiValue(config.device).toUpperCase(),
            group_cd: normalizeApiValue(config.group_cd) || 'etc',
        };
    }

    window.releaseEquipmentToNormal = async function releaseEquipmentToNormal() {
        try {
            sessionStorage.setItem('petmon.deviceMaintenance', '0');
            sessionStorage.setItem('petmon.globalMaintenance', '0');
            sessionStorage.setItem('petmon.Collection', '0');
            localStorage.setItem('__petmon_maint_bcast', String(Date.now()));
        } catch {}

        try {
            const config = await loadDeviceApiConfig();
            if (!config.device) {
                console.warn('equipment status release skipped: device code not found');
                return;
            }

            await fetch(EQUIPMENT_STATUS_API_URL, {
                method: 'POST',
                keepalive: true,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    device: config.device,
                    group_cd: config.group_cd,
                    client_unique_id: `ADMIN-RELEASE-${Date.now()}`,
                    status: '1',
                    reset_collect_amount: true,
                }),
            });
        } catch (error) {
            console.warn('equipment status release failed', error);
        }
    };
})();
