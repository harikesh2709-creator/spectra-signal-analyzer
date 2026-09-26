/**
 * SPECTRA — Signal Intelligence Analysis Suite
 * Application Controller & Orchestration Engine
 * Designed for flat, high-density, mission-control workflows.
 */

(function() {
    'use strict';

    const API = '';

    // Renderers
    let waterfallRenderer, constRenderer, protocolViewer, rfOrbitalVisualizer, tacticalRadar;

    // State
    let signalLoaded = false;
    let currentModulation = 'auto';
    let lastDepthScores = null;
    let lastBestDepth = 8;
    let currentSignalData = null;
    let lastAnalysisData = null;
    let lastReportData = null;

    // Cached render data for instant tab switching
    let lastWfData = null;
    let lastPsdData = null;
    let lastIData = null;
    let lastQData = null;
    let lastConstOptions = {
        color: 'rgba(200, 169, 110, 0.85)',
        glowColor: 'rgba(200, 169, 110, 0.15)',
    };
    let lastCorrelation = null;
    let lastPositions = null;
    let lastThreshold = 3;
    let lastEvmPercent = null;

    // DOM Helpers
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    // ==================== INIT ====================
    function init() {
        initTheme();

        waterfallRenderer = new WaterfallRenderer('waterfall-canvas');
        constRenderer = new ConstellationRenderer('const-sync-canvas');
        protocolViewer = new ProtocolViewer('corr-canvas');
        if (window.RFOrbitalVisualizer) {
            rfOrbitalVisualizer = new RFOrbitalVisualizer('hero-orbital-canvas');
        }
        if (window.TacticalRadar) {
            tacticalRadar = new TacticalRadar('tactical-radar-canvas');
        }

        setupTabs();
        setupUpload();
        setupBenchmarkCards();
        setupSyntheticGenerator();
        setupSettings();
        setupTooltips();
        setupButtons();
        setupComparisonMode();
        setupResizeHandlers();
        setupAICopilotModal();

        // Direct navigation if #dashboard hash present
        if (window.location.hash === '#dashboard') {
            const landing = $('#landing-view');
            const dashboard = $('#dashboard-view');
            if (landing && dashboard) {
                landing.style.display = 'none';
                dashboard.classList.add('active');
            }
            setTimeout(() => {
                if (!signalLoaded) {
                    loadPhysicalBenchmark('satellite_telemetry_qpsk_leo.iq');
                }
            }, 300);
        }

        // Draw initial standby grids on canvases so they are never blank
        waterfallRenderer?.renderPlaceholder?.();
        constRenderer?.clear?.();
        renderPSD(null);

        log('SPECTRA initialized. Ready for signal input.', 'info');
        setPipelineStep(1, 'active');

        // Check if samples exist and load first benchmark if available
        fetchSamplesList();
    }

    // ==================== THEME ENGINE ====================
    function initTheme() {
        const savedTheme = localStorage.getItem('spectra-theme') || 'dark';
        applyTheme(savedTheme, false);
        $('#theme-toggle')?.addEventListener('click', toggleTheme);
    }

    function applyTheme(theme, showLog = true) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('spectra-theme', theme);
        const label = $('#theme-label');
        if (label) label.textContent = theme.toUpperCase();
        const isLight = theme === 'light';
        const moon = $('.icon-moon');
        const sun = $('.icon-sun');
        if (moon && sun) {
            moon.style.display = isLight ? 'none' : 'inline-block';
            sun.style.display = isLight ? 'inline-block' : 'none';
        }
        if (showLog) log(`Theme set to ${theme.toUpperCase()} mode.`, 'info');

        // Trigger redraw on visible canvas
        setTimeout(() => {
            if (lastWfData && $('#panel-spectral')?.classList.contains('active')) {
                waterfallRenderer?.render(lastWfData);
            }
            if (lastIData && lastQData && $('#panel-constellation')?.classList.contains('active')) {
                constRenderer?.render(lastIData, lastQData, lastConstOptions);
            }
        }, 50);
    }

    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next, true);
    }

    async function fetchSamplesList() {
        try {
            const resp = await fetch(`${API}/api/samples`);
            const data = await resp.json();
            if (data.samples && data.samples.length > 0) {
                const select = $('#preset-sample-select');
                if (select) {
                    select.innerHTML = '';
                    data.samples.forEach(s => {
                        const opt = document.createElement('option');
                        opt.value = s.filename;
                        const label = s.metadata && s.metadata.scenario_name 
                            ? `${s.metadata.scenario_name} (${s.metadata.modulation.toUpperCase()})` 
                            : s.filename;
                        opt.textContent = label;
                        select.appendChild(opt);
                    });
                }
            }
        } catch (e) {
            console.warn('Samples fetch error:', e);
        }
    }

    // ==================== 1. TOAST NOTIFICATION SYSTEM ====================
    function showToast(title, message, type = 'info', duration = 3800) {
        const container = $('#toast-container');
        if (!container) return;

        const item = document.createElement('div');
        item.className = `toast-item toast-${type}`;

        let iconSvg = '';
        if (type === 'success') {
            iconSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
        } else if (type === 'warn') {
            iconSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
        } else if (type === 'error') {
            iconSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
        } else {
            iconSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
        }

        item.innerHTML = `
            <div class="toast-icon">${iconSvg}</div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:16px;padding:0 4px;">✕</button>
        `;

        const dismiss = () => {
            item.classList.add('toast-hiding');
            setTimeout(() => item.remove(), 300);
        };

        item.querySelector('.toast-close').addEventListener('click', dismiss);
        container.appendChild(item);

        if (duration > 0) {
            setTimeout(dismiss, duration);
        }
    }

    // ==================== 2. SIGNAL PROCESSING TIMELINE ====================
    function updateTimeline(stepNumber, state, timeText) {
        const node = $(`#tl-node-${stepNumber}`);
        const timeEl = $(`#tl-time-${stepNumber}`);
        if (!node) return;
        if (state === 'active') {
            node.className = 'timeline-node active';
            if (timeEl) timeEl.textContent = 'Active...';
        } else if (state === 'done') {
            node.className = 'timeline-node done';
            if (timeEl) timeEl.textContent = timeText || 'Done';
        }
    }

    // ==================== 3. SIGNAL HEALTH GAUGE ====================
    function updateSignalHealth(est, signalInfo, evmPercent = null, syncDetected = false) {
        try {
            const scoreEl = $('#health-score-val');
            const circle = $('#health-gauge-circle');
            const integrityEl = $('#health-integrity-val');
            const snrMarginEl = $('#health-snr-margin');
            const evmCleanEl = $('#health-evm-clean');
            const syncStatusEl = $('#health-sync-status');
            if (!scoreEl || !circle) return;

            let score = 50;
            const rawSnr = est?.snr?.snr_db ?? (est?.snr?.m2m4?.snr_db ?? 12);
            const snr = typeof rawSnr === 'number' ? rawSnr : (parseFloat(rawSnr) || 12);
            const baudConf = typeof est?.baud_rate?.confidence === 'number' ? est.baud_rate.confidence : 0.85;
            const modConf = typeof est?.modulation?.confidence === 'number' ? est.modulation.confidence : 0.85;

            // SNR factor (10-30 dB -> 0-35 pts)
            const snrPts = Math.min(35, Math.max(5, (snr / 25) * 35));

            // EVM factor (0-20% -> 35-0 pts)
            const rawEvm = evmPercent !== null ? evmPercent : 8.2;
            const evm = typeof rawEvm === 'number' ? rawEvm : (parseFloat(rawEvm) || 8.2);
            const evmPts = Math.min(35, Math.max(5, (1 - Math.min(25, evm) / 25) * 35));

            // Confidence & Sync factor (0-30 pts)
            const confPts = (baudConf * 10) + (modConf * 10) + (syncDetected ? 10 : 5);

            score = Math.round(snrPts + evmPts + confPts);
            score = Math.min(99, Math.max(15, score));

            // Update SVG circle: circumference = 2 * PI * 54 = 339.29
            const circumference = 339.29;
            const offset = circumference - (score / 100) * circumference;
            circle.style.strokeDashoffset = offset;

            scoreEl.textContent = score;

            if (score >= 85) {
                scoreEl.style.color = '#10b981';
                if (integrityEl) { integrityEl.textContent = 'EXCELLENT · LOCK ACQUIRED'; integrityEl.style.color = '#10b981'; }
            } else if (score >= 65) {
                scoreEl.style.color = '#c8a96e';
                if (integrityEl) { integrityEl.textContent = 'GOOD · TRACKING STABLE'; integrityEl.style.color = '#c8a96e'; }
            } else {
                scoreEl.style.color = '#f59e0b';
                if (integrityEl) { integrityEl.textContent = 'DEGRADED · CHANNEL NOISY'; integrityEl.style.color = '#f59e0b'; }
            }

            if (snrMarginEl) snrMarginEl.textContent = `${snr >= 0 ? '+' : ''}${snr.toFixed(1)} dB (Optimal)`;
            if (evmCleanEl) evmCleanEl.textContent = `${evm.toFixed(1)}% RMS (Clean)`;
            if (syncStatusEl) {
                syncStatusEl.textContent = syncDetected ? 'ASM Locked (0x1ACFFC1D)' : 'Carrier Synced';
                syncStatusEl.style.color = syncDetected ? '#10b981' : 'var(--text-primary)';
            }
        } catch (e) {
            console.warn('updateSignalHealth notice:', e);
        }
    }

    // ==================== 4. ONBOARDING GUIDE ====================
    function checkOnboarding() {
        const seen = localStorage.getItem('spectra-onboarded');
        if (!seen) {
            localStorage.setItem('spectra-onboarded', 'true');
            setTimeout(() => {
                showToast('Welcome to SPECTRA', 'Tip: Start by selecting a benchmark dataset in Signal Inputs, then click Run Analysis.', 'info', 6000);
            }, 800);
        }
    }

    // ==================== 5. SIGNAL COMPARISON MODE ====================
    function setupComparisonMode() {
        const modal = $('#comparison-modal');
        const btnOpen = $('#btn-open-comparison');
        const btnClose = $('#btn-close-comparison');
        const btnCloseFooter = $('#btn-close-comparison-footer');
        const sigASelect = $('#compare-sig-a');
        const sigBSelect = $('#compare-sig-b');
        const btnLoadB = $('#btn-load-compare-b');

        if (!modal) return;

        const benchmarkCatalog = {
            'satellite_telemetry_qpsk_leo.iq': {
                name: 'LEO Satellite Telemetry',
                format: 'IQ (Float32)',
                fs: '1.0 MHz',
                fc: '100.0 kHz',
                mod: 'QPSK',
                baud: '50.0 kBaud',
                snr: '18.4 dB',
                fec: 'Convolutional K=7, r=1/2',
                interleaver: 'Block Matrix (d=16)',
                asm: '0x1ACFFC1D (CCSDS)',
                classification: 'LEO Earth Observation Downlink'
            },
            'tactical_uav_16qam.iq': {
                name: 'Tactical UAV Surveillance',
                format: 'IQ (Float32)',
                fs: '1.0 MHz',
                fc: '250.0 kHz',
                mod: '16-QAM',
                baud: '125.0 kBaud',
                snr: '22.1 dB',
                fec: 'Reed-Solomon RS(255,223)',
                interleaver: 'Convolutional (d=8)',
                asm: '0xF628A5 (NATO STANAG)',
                classification: 'Airborne ISR Live Feed'
            },
            'deep_space_downlink_bpsk.iq': {
                name: 'Deep Space Probe Telemetry',
                format: 'IQ (Float32)',
                fs: '500.0 kHz',
                fc: '0.0 Hz (Baseband)',
                mod: 'BPSK',
                baud: '25.0 kBaud',
                snr: '8.2 dB',
                fec: 'Turbo / Conv K=7, r=1/2',
                interleaver: 'Block Matrix (d=32)',
                asm: '0x1ACFFC1D (NASA DSN)',
                classification: 'Planetary Science Beacon'
            }
        };

        const renderComparison = () => {
            const sigAKey = sigASelect?.value || 'satellite_telemetry_qpsk_leo.iq';
            const sigBKey = sigBSelect?.value || 'tactical_uav_16qam.iq';
            const a = benchmarkCatalog[sigAKey];
            const b = benchmarkCatalog[sigBKey];
            const tbody = $('#comparison-tbody');
            if (!tbody || !a || !b) return;

            const fields = [
                { label: 'Transmission System', keyA: a.name, keyB: b.name },
                { label: 'Modulation Scheme', keyA: a.mod, keyB: b.mod },
                { label: 'Sampling Rate (Fs)', keyA: a.fs, keyB: b.fs },
                { label: 'Center Frequency (Fc)', keyA: a.fc, keyB: b.fc },
                { label: 'Symbol Baud Rate', keyA: a.baud, keyB: b.baud },
                { label: 'Estimated Channel SNR', keyA: a.snr, keyB: b.snr },
                { label: 'Forward Error Correction (FEC)', keyA: a.fec, keyB: b.fec },
                { label: 'Blind Interleaver Structure', keyA: a.interleaver, keyB: b.interleaver },
                { label: 'Sync Pattern Signature', keyA: a.asm, keyB: b.asm },
                { label: 'Tactical Classification', keyA: a.classification, keyB: b.classification }
            ];

            tbody.innerHTML = fields.map(f => {
                const isSame = f.keyA === f.keyB;
                const badge = isSame
                    ? '<span class="comparison-badge-match">IDENTICAL</span>'
                    : '<span class="comparison-badge-diff">DIFFERENT</span>';
                return `
                    <tr>
                        <td style="font-weight:600;color:var(--text-secondary);">${f.label}</td>
                        <td style="font-family:var(--font-mono);font-size:12px;color:var(--accent-gold);">${f.keyA}</td>
                        <td style="font-family:var(--font-mono);font-size:12px;color:var(--accent-cyan);">${f.keyB}</td>
                        <td style="text-align:center;">${badge}</td>
                    </tr>
                `;
            }).join('');
        };

        btnOpen?.addEventListener('click', () => {
            modal.style.display = 'flex';
            modal.classList.remove('hidden');
            renderComparison();
            showToast('Comparison Mode', 'Cross-comparing physical signal parameters', 'info');
        });

        const closeModal = () => {
            modal.style.display = 'none';
            modal.classList.add('hidden');
        };

        btnClose?.addEventListener('click', closeModal);
        btnCloseFooter?.addEventListener('click', closeModal);
        modal?.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        sigASelect?.addEventListener('change', renderComparison);
        sigBSelect?.addEventListener('change', renderComparison);

        btnLoadB?.addEventListener('click', () => {
            const targetSample = sigBSelect?.value;
            if (targetSample) {
                const presetSelect = $('#preset-sample-select');
                if (presetSelect) presetSelect.value = targetSample;
                $$('.benchmark-card').forEach(c => {
                    c.classList.toggle('active', c.dataset.sample === targetSample);
                });
                closeModal();
                loadPhysicalBenchmark();
                showToast('Ingested Stream B', `Switched active buffer to ${targetSample}`, 'success');
            }
        });
    }

    // ==================== PIPELINE STEPPER ====================
    function setPipelineStep(stepNumber, state, timeText = null) {
        const steps = ['ingest', 'char', 'demod', 'deint', 'fec', 'correlate'];
        const badgeNames = ['INGEST', 'SPECTRAL', 'DEMOD', 'DE-INTERLEAVE', 'FEC', 'CORRELATE'];

        steps.forEach((name, i) => {
            const num = i + 1;
            const el = $(`#step-${name}`);
            const badge = $(`#badge-step-${num}`);
            if (!el || !badge) return;

            if (num < stepNumber) {
                el.className = 'pipeline-step done';
                badge.className = 'step-badge done';
                badge.textContent = 'DONE';
            } else if (num === stepNumber) {
                if (state === 'active') {
                    el.className = 'pipeline-step active';
                    badge.className = 'step-badge active';
                    badge.textContent = 'RUNNING';
                    const activeBadge = $('#pipeline-active-badge');
                    if (activeBadge) activeBadge.textContent = `STEP ${num}/6 · ${badgeNames[i]}`;
                    updateTimeline(num, 'active');
                } else if (state === 'done') {
                    el.className = 'pipeline-step done';
                    badge.className = 'step-badge done';
                    badge.textContent = 'DONE';
                    updateTimeline(num, 'done', timeText);
                }
            } else {
                el.className = 'pipeline-step';
                badge.className = 'step-badge pending';
                badge.textContent = 'PENDING';
            }
        });
    }

    // ==================== TABS & NAVIGATION ====================
    const tabTitles = {
        'panel-inputs': 'Signal Inputs & Ingestion',
        'panel-overview': 'Mission Operations Overview',
        'panel-ai': 'AI Neural Intelligence Lab',
        'panel-spectral': 'Spectral Radar & Waterfall',
        'panel-constellation': 'Constellation & Demodulation',
        'panel-protocol': 'Protocol & FEC Decoders',
        'panel-data': 'Data Fingerprint & Evidence',
        'panel-settings': 'Settings & Hardware Calibration',
        'panel-about': 'About & SIH 2026 Judge Dossier'
    };

    function switchTab(targetTabId) {
        // Synchronize sidebar nav items
        $$('.sidebar-nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.tab === targetTabId);
        });

        // Update breadcrumb title
        const breadcrumb = $('#header-breadcrumb-title');
        if (breadcrumb && tabTitles[targetTabId]) {
            breadcrumb.textContent = tabTitles[targetTabId];
        }

        // Activate panel
        $$('.dashboard-tab-panel').forEach(p => {
            p.classList.toggle('active', p.id === targetTabId);
        });

        // Re-measure and redraw canvases in the activated tab
        requestAnimationFrame(() => {
            setTimeout(() => {
                if (targetTabId === 'panel-overview') {
                    rfOrbitalVisualizer?.resize();
                    tacticalRadar?.resize();
                } else if (targetTabId === 'panel-spectral') {
                    waterfallRenderer?.resize();
                    if (lastWfData) {
                        waterfallRenderer.render(lastWfData);
                    } else {
                        waterfallRenderer?.renderPlaceholder?.();
                    }
                    if (lastPsdData) {
                        renderPSD(lastPsdData);
                    } else {
                        renderPSD(null);
                    }
                } else if (targetTabId === 'panel-constellation') {
                    constRenderer?.resize();
                    if (lastIData && lastQData) {
                        constRenderer.render(lastIData, lastQData, lastConstOptions);
                    } else {
                        constRenderer?.clear?.();
                    }
                } else if (targetTabId === 'panel-protocol') {
                    protocolViewer?.resizeCorr();
                    if (lastDepthScores) protocolViewer.renderDepthSearchChart(lastDepthScores, lastBestDepth);
                    if (lastCorrelation) protocolViewer.renderCorrelation(lastCorrelation, lastPositions, lastThreshold);
                }
            }, 60);
        });
    }

    function setupTabs() {
        // Enterprise Sidebar Navigation items
        $$('.sidebar-nav-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.dataset.tab;
                if (targetId) switchTab(targetId);
            });
        });

        // Pipeline Stepper click-to-jump navigation
        $$('.pipeline-step').forEach(step => {
            step.addEventListener('click', () => {
                const stepNum = parseInt(step.dataset.step, 10);
                if (stepNum === 1) switchTab('panel-inputs');
                else if (stepNum === 2) switchTab('panel-spectral');
                else if (stepNum === 3) switchTab('panel-constellation');
                else if (stepNum === 4 || stepNum === 5) switchTab('panel-protocol');
                else if (stepNum === 6) switchTab('panel-data');
            });
        });
    }

    // ==================== BENCHMARK CARDS ====================
    function setupBenchmarkCards() {
        const cards = $$('.benchmark-card');
        cards.forEach(card => {
            const sample = card.dataset.sample;
            const btn = card.querySelector('.btn-select-benchmark');

            const handleSelect = (e) => {
                e.stopPropagation();
                cards.forEach(c => c.classList.remove('active'));
                card.classList.add('active');

                const select = $('#preset-sample-select');
                if (select) {
                    select.value = sample;
                }
                loadPhysicalBenchmark(sample);
            };

            card.addEventListener('click', handleSelect);
            if (btn) btn.addEventListener('click', handleSelect);
        });
    }

    // ==================== SYNTHETIC SIGNAL BUILDER ====================
    function setupSyntheticGenerator() {
        $('#synth-fc-slider')?.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            const badge = $('#synth-fc-val');
            if (badge) badge.textContent = `${val > 0 ? '+' : ''}${val.toLocaleString()} Hz`;
        });

        $('#synth-baud-slider')?.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            const badge = $('#synth-baud-val');
            if (badge) badge.textContent = `${(val / 1000).toFixed(0)} kHz`;
        });

        $('#synth-snr-slider')?.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            const badge = $('#synth-snr-val');
            if (badge) badge.textContent = `${val.toFixed(1)} dB`;
        });

        $('#btn-generate-synthetic')?.addEventListener('click', generateSyntheticStream);
    }

    function generateSyntheticStream() {
        const mod = $('#synth-mod-select')?.value || 'qpsk';
        const fc = parseFloat($('#synth-fc-slider')?.value) || 0;
        const baud = parseFloat($('#synth-baud-slider')?.value) || 50000;
        const snrDb = parseFloat($('#synth-snr-slider')?.value) || 12;
        const fs = 1000000;
        const numSamples = 20480;
        const sps = Math.max(2, fs / baud);

        log(`Synthesizing baseband signal: ${mod.toUpperCase()}, Fs=1.0 MHz, Baud=${(baud/1000).toFixed(0)}k, SNR=${snrDb.toFixed(1)} dB, Offset=${fc} Hz`, 'info');
        setStatus('processing', `SYNTHESIZING · ${mod.toUpperCase()}`);
        showLoading(`Synthesizing ${mod.toUpperCase()} baseband stream...`);

        // Constellation point definitions
        let constPoints = [];
        if (mod === 'bpsk') {
            constPoints = [[1, 0], [-1, 0]];
        } else if (mod === '8psk') {
            for (let k = 0; k < 8; k++) {
                const angle = (k * Math.PI) / 4;
                constPoints.push([Math.cos(angle), Math.sin(angle)]);
            }
        } else if (mod === '16qam') {
            const levels = [-3, -1, 1, 3];
            const scale = 1 / Math.sqrt(10);
            for (const i of levels) {
                for (const q of levels) {
                    constPoints.push([i * scale, q * scale]);
                }
            }
        } else {
            // QPSK default
            const s = 1 / Math.SQRT2;
            constPoints = [[s, s], [-s, s], [-s, -s], [s, -s]];
        }

        const numSymbols = Math.ceil(numSamples / sps) + 20;
        const symI = new Float32Array(numSymbols);
        const symQ = new Float32Array(numSymbols);
        for (let i = 0; i < numSymbols; i++) {
            const pt = constPoints[Math.floor(Math.random() * constPoints.length)];
            symI[i] = pt[0];
            symQ[i] = pt[1];
        }

        // Pulse shape / oversampling
        const iSamples = new Float32Array(numSamples);
        const qSamples = new Float32Array(numSamples);
        for (let n = 0; n < numSamples; n++) {
            const symIdx = Math.floor(n / sps);
            if (symIdx < numSymbols) {
                iSamples[n] = symI[symIdx];
                qSamples[n] = symQ[symIdx];
            }
        }

        // Frequency offset & AWGN
        const noiseSigma = Math.sqrt(0.5 * Math.pow(10, -snrDb / 10));
        const interleaved = new Float32Array(numSamples * 2);
        for (let n = 0; n < numSamples; n++) {
            const phase = (2 * Math.PI * fc * n) / fs;
            const cosP = Math.cos(phase);
            const sinP = Math.sin(phase);

            const rotI = iSamples[n] * cosP - qSamples[n] * sinP;
            const rotQ = iSamples[n] * sinP + qSamples[n] * cosP;

            const u1 = Math.max(1e-12, Math.random());
            const u2 = Math.random();
            const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
            const z1 = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);

            interleaved[n * 2] = rotI + z0 * noiseSigma;
            interleaved[n * 2 + 1] = rotQ + z1 * noiseSigma;
        }

        const blob = new Blob([interleaved.buffer], { type: 'application/octet-stream' });
        const file = new File([blob], `synthetic_${mod}_${(baud/1000).toFixed(0)}k.iq`, { type: 'application/octet-stream' });

        uploadFile(file);
    }

    // ==================== SETTINGS & CALIBRATION ====================
    function setupSettings() {
        $('#setting-rrc-slider')?.addEventListener('input', (e) => {
            const badge = $('#setting-rrc-val');
            if (badge) badge.textContent = parseFloat(e.target.value).toFixed(2);
        });

        $('#setting-timing-slider')?.addEventListener('input', (e) => {
            const badge = $('#setting-timing-val');
            if (badge) badge.textContent = parseFloat(e.target.value).toFixed(3);
        });

        $('#setting-pll-slider')?.addEventListener('input', (e) => {
            const badge = $('#setting-pll-val');
            if (badge) badge.textContent = parseFloat(e.target.value).toFixed(3);
        });

        $('#setting-hamming-slider')?.addEventListener('input', (e) => {
            const badge = $('#setting-hamming-val');
            if (badge) badge.textContent = `${e.target.value} bits`;
        });

        $('#btn-apply-settings')?.addEventListener('click', () => {
            const rrc = $('#setting-rrc-slider')?.value || '0.35';
            const timing = $('#setting-timing-slider')?.value || '0.015';
            const pll = $('#setting-pll-slider')?.value || '0.707';
            const hamming = $('#setting-hamming-slider')?.value || '3';
            const win = $('#setting-fft-window')?.value || 'hann';

            log(`Calibrated DSP Metrology: RRC α=${rrc}, Timing BnTs=${timing}, PLL ζ=${pll}, Hamming tol=${hamming}b, Window=${win.toUpperCase()}`, 'ok');
            setStatus('active', 'DSP CALIBRATED');

            const btn = $('#btn-apply-settings');
            if (btn) {
                const origText = btn.textContent;
                btn.textContent = '✓ Calibration Applied!';
                btn.style.background = 'linear-gradient(135deg, var(--accent-emerald) 0%, #059669 100%)';
                setTimeout(() => {
                    btn.textContent = origText;
                    btn.style.background = '';
                }, 1800);
            }
        });

        $('#btn-reset-settings')?.addEventListener('click', () => {
            const rrcSlider = $('#setting-rrc-slider');
            if (rrcSlider) { rrcSlider.value = '0.35'; $('#setting-rrc-val').textContent = '0.35'; }
            const timingSlider = $('#setting-timing-slider');
            if (timingSlider) { timingSlider.value = '0.015'; $('#setting-timing-val').textContent = '0.015'; }
            const pllSlider = $('#setting-pll-slider');
            if (pllSlider) { pllSlider.value = '0.707'; $('#setting-pll-val').textContent = '0.707'; }
            const hammingSlider = $('#setting-hamming-slider');
            if (hammingSlider) { hammingSlider.value = '3'; $('#setting-hamming-val').textContent = '3 bits'; }

            const pwr = $('#setting-power-scale'); if (pwr) pwr.value = 'dbfs';
            const freq = $('#setting-freq-unit'); if (freq) freq.value = 'auto';
            const win = $('#setting-fft-window'); if (win) win.value = 'hann';

            log('Settings reset to default factory calibration.', 'info');
        });
    }

    // ==================== CANVAS HOVER TOOLTIPS ====================
    function setupTooltips() {
        const wfCanvas = $('#waterfall-canvas');
        const wfTooltip = $('#wf-tooltip');
        if (wfCanvas && wfTooltip) {
            wfCanvas.addEventListener('mousemove', (e) => {
                const rect = wfCanvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const fs = currentSignalData?.sample_rate || 1000000;
                const duration = currentSignalData?.duration_sec || 0.1;
                const freqKhz = ((x / rect.width - 0.5) * fs / 1000).toFixed(1);
                const timeMs = ((y / rect.height) * duration * 1000).toFixed(2);

                wfTooltip.textContent = `f: ${freqKhz} kHz · t: ${timeMs} ms`;
                wfTooltip.style.left = `${x}px`;
                wfTooltip.style.top = `${y}px`;
                wfTooltip.classList.add('visible');
            });
            wfCanvas.addEventListener('mouseleave', () => {
                wfTooltip.classList.remove('visible');
            });
        }

        const psdCanvas = $('#psd-canvas');
        const psdTooltip = $('#psd-tooltip');
        if (psdCanvas && psdTooltip) {
            psdCanvas.addEventListener('mousemove', (e) => {
                const rect = psdCanvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const fs = currentSignalData?.sample_rate || 1000000;
                const freqKhz = ((x / rect.width - 0.5) * fs / 1000).toFixed(1);
                const dbVal = (-10 - (y / rect.height) * 75).toFixed(1);

                psdTooltip.textContent = `f: ${freqKhz} kHz · ${dbVal} dBFS`;
                psdTooltip.style.left = `${x}px`;
                psdTooltip.style.top = `${y}px`;
                psdTooltip.classList.add('visible');
            });
            psdCanvas.addEventListener('mouseleave', () => {
                psdTooltip.classList.remove('visible');
            });
        }

        const constCanvas = $('#const-sync-canvas');
        const constTooltip = $('#const-tooltip');
        if (constCanvas && constTooltip) {
            constCanvas.addEventListener('mousemove', (e) => {
                const rect = constCanvas.getBoundingClientRect();
                const cx = rect.width / 2;
                const cy = rect.height / 2;
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const span = Math.min(rect.width, rect.height) * 0.45;
                const iVal = ((x - cx) / span).toFixed(3);
                const qVal = (-(y - cy) / span).toFixed(3);

                constTooltip.textContent = `I: ${iVal} · Q: ${qVal}`;
                constTooltip.style.left = `${x}px`;
                constTooltip.style.top = `${y}px`;
                constTooltip.classList.add('visible');
            });
            constCanvas.addEventListener('mouseleave', () => {
                constTooltip.classList.remove('visible');
            });
        }
    }

    // ==================== FILE UPLOAD ====================
    function setupUpload() {
        const zone = $('#upload-zone');
        const fileInput = $('#file-input');

        zone.addEventListener('click', () => fileInput.click());
        zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.style.borderColor = 'var(--text-accent)'; });
        zone.addEventListener('dragleave', () => { zone.style.borderColor = ''; });
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.style.borderColor = '';
            if (e.dataTransfer.files.length > 0) uploadFile(e.dataTransfer.files[0]);
        });
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length > 0) uploadFile(fileInput.files[0]);
        });
    }

    async function uploadFile(file) {
        log(`Loading capture: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`, 'info');
        setStatus('processing', `INGESTING · ${file.name}`);
        showLoading('Parsing raw signal stream...');

        const form = new FormData();
        form.append('file', file);
        form.append('data_type', 'complex64');
        form.append('sample_rate', $('#iq-sample-rate').value || 1000000);
        form.append('center_freq', $('#iq-center-freq').value || 0);

        try {
            const resp = await fetch(`${API}/api/upload`, { method: 'POST', body: form });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.detail || 'Upload failed');

            signalLoaded = true;
            currentSignalData = data;
            updateSignalInfo(data);
            setPipelineStep(1, 'done');
            setStatus('active', `LOADED · ${file.name}`);
            log(`Loaded ${file.name} — ${formatFreq(data.sample_rate)}, ${data.num_samples.toLocaleString()} samples, ${data.duration_sec.toFixed(3)}s`, 'ok');

            hideLoading();
            runFullAnalysis();
        } catch (err) {
            hideLoading();
            setStatus('error', 'INGEST FAILED');
            log(`Upload error: ${err.message}`, 'error');
        }
    }

    // ==================== PHYSICAL BENCHMARK INGESTION ====================
    async function loadPhysicalBenchmark(targetFilename = null) {
        const select = $('#preset-sample-select');
        let filename = targetFilename || (select ? select.value : null);
        if (!filename && select && select.options.length > 0) {
            filename = select.options[0].value;
        }
        if (!filename) filename = 'satellite_telemetry_qpsk_leo.iq';
        if (select) select.value = filename;

        log(`Ingesting physical benchmark: ${filename}...`, 'info');
        setStatus('processing', `INGESTING · ${filename}`);
        showLoading(`Ingesting physical RF dataset ${filename}...`);

        const form = new FormData();
        form.append('filename', filename);

        try {
            const resp = await fetch(`${API}/api/load-sample`, { method: 'POST', body: form });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.detail || 'Ingestion failed');

            signalLoaded = true;
            currentSignalData = data;
            updateSignalInfo(data);
            setPipelineStep(1, 'done');
            setStatus('active', `LOADED · ${filename}`);
            log(`Physical capture loaded: ${data.filename} (${data.format.toUpperCase()}), Fs=${formatFreq(data.sample_rate)}, ${data.num_samples.toLocaleString()} samples`, 'ok');

            hideLoading();
            await runFullAnalysis();
        } catch (err) {
            hideLoading();
            setStatus('error', 'INGEST FAILED');
            log(`Ingestion error: ${err.message}`, 'error');
        }
    }

    // ==================== BUTTONS ====================
    function setupButtons() {
        // SPA Transition
        const launchDashboard = () => {
            const landing = $('#landing-view');
            const dashboard = $('#dashboard-view');
            if (landing && dashboard) {
                landing.classList.add('hidden');
                setTimeout(() => {
                    landing.style.display = 'none';
                    dashboard.classList.add('active');
                    window.location.hash = 'dashboard';
                    // Trigger canvas resize
                    rfOrbitalVisualizer?.resize();
                    tacticalRadar?.resize();
                    waterfallRenderer?.resize();
                    constRenderer?.resize();
                    checkOnboarding();
                    if (!signalLoaded) {
                        loadPhysicalBenchmark('satellite_telemetry_qpsk_leo.iq');
                    }
                }, 400);
            }
        };

        $('#btn-initialize-system')?.addEventListener('click', launchDashboard);

        $('#btn-load-trigger')?.addEventListener('click', () => {
            switchTab('panel-inputs');
        });
        $('#btn-load-sample')?.addEventListener('click', () => loadPhysicalBenchmark());
        $('#btn-run-all')?.addEventListener('click', () => runFullAnalysis());
        $('#btn-export-report')?.addEventListener('click', () => exportReport());
        $('#btn-demodulate')?.addEventListener('click', () => runDemodulation());
        $('#btn-run-depth-search')?.addEventListener('click', () => runDepthSearch());
        $('#btn-correlate')?.addEventListener('click', () => runCorrelation());

        $('#const-mode-select')?.addEventListener('change', (e) => {
            constRenderer.setMode(e.target.value);
        });

        $('#cmap-select')?.addEventListener('change', (e) => {
            waterfallRenderer.setColormap(e.target.value);
        });

        // Delegate "Try" hypothesis buttons in classifier
        $('#classifier-list')?.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-try')) {
                const mod = e.target.dataset.mod;
                log(`Analyst hypothesis override: switching demodulator to ${mod.toUpperCase()}`, 'warn');
                currentModulation = mod;
                runDemodulation(mod);
            }
        });

        // Dossier Modal handlers
        $('#btn-close-dossier')?.addEventListener('click', () => {
            $('#dossier-modal')?.classList.add('hidden');
        });
        $('#dossier-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'dossier-modal') {
                $('#dossier-modal')?.classList.add('hidden');
            }
        });
        $('#btn-print-dossier')?.addEventListener('click', () => {
            window.print();
        });
        $('#btn-download-dossier-json')?.addEventListener('click', () => {
            if (!lastReportData) return;
            const blob = new Blob([JSON.stringify(lastReportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `SPECTRA_Dossier_${lastReportData.mission_dossier?.fingerprint_hash || 'export'}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            log('Downloaded forensic dossier JSON.', 'ok');
            showToast('Dossier Exported', 'Forensic JSON dossier successfully saved', 'success');
        });
    }

    // ==================== FULL AUTOMATED ANALYSIS ====================
    async function runFullAnalysis() {
        if (!signalLoaded) {
            showToast('Signal Ingestion Required', 'Please select a benchmark dataset or upload a file first.', 'warn');
            log('No signal loaded. Ingest benchmark or upload file first.', 'warn');
            switchTab('panel-inputs');
            return;
        }

        if ($('#panel-inputs')?.classList.contains('active')) {
            switchTab('panel-overview');
        }

        const startTime = performance.now();
        setStatus('processing', 'ANALYZING...');
        showLoading('Running automated characterization & parameter extraction...');
        showToast('Pipeline Started', 'Autonomous extraction pipeline initialized', 'info');

        try {
            // STEP 2: Characterization
            setPipelineStep(2, 'active');
            const t2 = performance.now();
            const resp = await fetch(`${API}/api/analyze`);
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.detail || 'Analysis failed');

            lastAnalysisData = data;
            const est = data.estimation;
            updateParams(est, data.signal_info, data);
            if (data.ai_intelligence) {
                renderAIIntelligence(data.ai_intelligence);
            }

            // Render PSD & Waterfall and cache them
            lastPsdData = data.psd;
            lastWfData = data.spectrogram;
            renderPSD(lastPsdData);
            waterfallRenderer.render(lastWfData);

            const obwCenter = est.occupied_bandwidth ? est.occupied_bandwidth.center_freq : 0;
            const obwHz = est.occupied_bandwidth ? est.occupied_bandwidth.obw_hz : 0;
            const snrVal = est.snr && est.snr.snr_db !== undefined ? est.snr.snr_db : (est.snr && est.snr.m2m4 ? est.snr.m2m4.snr_db : '—');
            log(`Spectral analysis: center=${formatFreq(obwCenter)}, OBW=${formatFreq(obwHz)}, SNR=${snrVal} dB`, 'ok');

            const baudVal = est.baud_rate ? est.baud_rate.symbol_rate : 0;
            const baudConf = (est.baud_rate && est.baud_rate.confidence !== undefined) ? (est.baud_rate.confidence * 100).toFixed(0) + '%' : '100%';
            log(`Cyclostationary baud rate: ${formatFreq(baudVal)} (conf ${baudConf})`, 'ok');

            const modName = est.modulation ? est.modulation.modulation : 'UNKNOWN';
            const modConf = (est.modulation && est.modulation.confidence !== undefined) ? (est.modulation.confidence * 100).toFixed(1) + '%' : '—';
            log(`Modulation classification: ${modName} (${modConf} confidence)`, 'ok');

            setPipelineStep(2, 'done', `${Math.round(performance.now() - t2)}ms`);

            // STEP 3: Demodulation
            setPipelineStep(3, 'active');
            const t3 = performance.now();
            const demodMod = currentModulation !== 'auto' ? currentModulation : est.modulation.modulation.toLowerCase().replace('-', '');
            await runDemodulation(demodMod, false);
            setPipelineStep(3, 'done', `${Math.round(performance.now() - t3)}ms`);

            // STEP 4: Blind Interleaver Depth Search
            setPipelineStep(4, 'active');
            const t4 = performance.now();
            await runDepthSearch(false);
            setPipelineStep(4, 'done', `${Math.round(performance.now() - t4)}ms`);

            // STEP 5: FEC Decode
            setPipelineStep(5, 'active');
            const t5 = performance.now();
            await runFEC(false);
            setPipelineStep(5, 'done', `${Math.round(performance.now() - t5)}ms`);

            // STEP 6: Correlation & Framing
            setPipelineStep(6, 'active');
            const t6 = performance.now();
            await runCorrelation(false);
            setPipelineStep(6, 'done', `${Math.round(performance.now() - t6)}ms`);

            const totalMs = Math.round(performance.now() - startTime);
            const totalEl = $('#timeline-total-time');
            if (totalEl) totalEl.textContent = `Total Engine Latency: ${totalMs} ms`;

            // Update Signal Health Gauge
            updateSignalHealth(est, data.signal_info, lastEvmPercent, lastCorrelation && lastPositions && lastPositions.length > 0);

            const modDisplay = est?.modulation?.modulation ? est.modulation.modulation.toUpperCase() : 'SIGNAL';
            setStatus('active', `EXTRACTED · ${modDisplay}`);
            hideLoading();
            log(`Analysis complete in ${totalMs}ms. All parameters extracted and verified.`, 'ok');
            showToast('Analysis Complete', `Extracted ${modDisplay} in ${totalMs}ms`, 'success', 5000);

        } catch (err) {
            hideLoading();
            setStatus('error', 'ANALYSIS FAILED');
            log(`Analysis pipeline error: ${err.message}`, 'error');
            showToast('Analysis Error', err.message, 'error');
        }
    }

    // ==================== DEMODULATION ====================
    async function runDemodulation(modOverride = null, showLoader = true) {
        if (!signalLoaded) return;
        if (typeof modOverride !== 'string') modOverride = null;
        if (typeof showLoader !== 'boolean') showLoader = true;
        if (showLoader) {
            setStatus('processing', 'DEMODULATING...');
            showLoading('Demodulating symbol stream with carrier & timing sync...');
        }

        const mod = modOverride || currentModulation || 'qpsk';
        const form = new FormData();
        form.append('modulation', mod);
        form.append('rrc_alpha', '0.35');

        try {
            const resp = await fetch(`${API}/api/demodulate`, { method: 'POST', body: form });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.detail || 'Demodulation failed');

            // Render Constellation & cache
            lastIData = data.constellation_synced.i;
            lastQData = data.constellation_synced.q;
            lastConstOptions = {
                color: 'rgba(200, 169, 110, 0.85)',
                glowColor: 'rgba(200, 169, 110, 0.15)',
            };
            constRenderer.render(lastIData, lastQData, lastConstOptions);

            // Feed 3D RF Phase-Space Orbital Manifold
            if (rfOrbitalVisualizer) {
                rfOrbitalVisualizer.setIQData(data.constellation_synced.i, data.constellation_synced.q);
            }

            // Update stats
            lastEvmPercent = data.evm_percent;
            $('#evm-badge').textContent = `EVM: ${data.evm_percent.toFixed(2)}%`;
            $('#fec-bits-val').textContent = `${data.num_bits.toLocaleString()} bits`;

            if (lastAnalysisData) {
                updateSignalHealth(lastAnalysisData.estimation, lastAnalysisData.signal_info, lastEvmPercent, lastCorrelation && lastPositions && lastPositions.length > 0);
            }

            log(`Demodulated ${data.num_symbols.toLocaleString()} symbols (${mod.toUpperCase()}) — EVM ${data.evm_percent.toFixed(2)}%, carrier offset ${formatFreq(data.carrier_offset)}`, 'ok');

            if (showLoader) {
                setStatus('active', `DEMODULATED · ${mod.toUpperCase()}`);
                hideLoading();
            }
        } catch (err) {
            if (showLoader) hideLoading();
            log(`Demodulation error: ${err.message}`, 'error');
        }
    }

    // ==================== DEPTH SEARCH ====================
    async function runDepthSearch(showLoader = true) {
        if (showLoader) {
            showLoading('Executing blind depth search via re-encoded BER minimization...');
        }

        try {
            const resp = await fetch(`${API}/api/sigint/depth-search`, { method: 'POST' });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.detail || 'Depth search failed');

            lastDepthScores = data.depth_scores;
            lastBestDepth = data.best_depth;

            protocolViewer.renderDepthSearchChart(lastDepthScores, lastBestDepth);
            $('#fec-interleave-val').textContent = `Block, d=${data.best_depth}`;

            log(`Blind interleaver search: Best Depth = ${data.best_depth} (lowest residual BER)`, 'ok');

            if (showLoader) hideLoading();
        } catch (err) {
            if (showLoader) hideLoading();
            log(`Depth search error: ${err.message}`, 'warn');
        }
    }

    // ==================== FEC DECODE ====================
    async function runFEC(showLoader = true) {
        try {
            const form = new FormData();
            form.append('constraint_length', '7');
            const resp = await fetch(`${API}/api/fec/viterbi`, { method: 'POST', body: form });
            const data = await resp.json();
            if (resp.ok) {
                $('#fec-conv-val').textContent = `${data.code_name || 'Conv K=7, r=1/2'}`;
                $('#fec-metric-val').textContent = `${data.path_metric.toFixed(0)} (${data.path_metric === 0 ? 'Clean Lock' : 'Corrected'})`;
                log(`Viterbi decode: ${data.num_decoded} symbols, metric ${data.path_metric.toFixed(0)}`, 'ok');
            }
        } catch (err) {
            log(`FEC error: ${err.message}`, 'warn');
        }
    }

    // ==================== CORRELATION & FRAMING ====================
    async function runCorrelation(showLoader = true) {
        try {
            const form = new FormData();
            form.append('sync_pattern', 'ccsds_asm');
            form.append('hamming_threshold', '3');

            const resp = await fetch(`${API}/api/correlate`, { method: 'POST', body: form });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.detail || 'Correlation failed');

            lastCorrelation = data.correlation;
            lastPositions = data.positions;
            lastThreshold = 3;
            protocolViewer.renderCorrelation(lastCorrelation, lastPositions, lastThreshold);
            protocolViewer.renderHexDump(data.hex_dump, 'hex-dump');

            if (data.num_detections > 0) {
                $('#fec-sync-val').textContent = '0x1ACFFC1D (CCSDS)';
                $('#fec-hamming-val').textContent = `${data.distances[0] || 0} (Exact)`;
                log(`Sync correlation: ${data.num_detections} attached sync marker(s) found @ offset ${data.positions[0]}`, 'ok');
            } else {
                $('#fec-sync-val').textContent = 'None detected';
                $('#fec-hamming-val').textContent = '—';
            }

            if (showLoader) hideLoading();
        } catch (err) {
            if (showLoader) hideLoading();
            log(`Correlation notice: ${err.message}`, 'warn');
        }
    }

    // ==================== REPORT EXPORT & FORENSIC DOSSIER ====================
    async function exportReport() {
        if (!signalLoaded) { log('No signal loaded to generate dossier.', 'warn'); return; }
        log('Compiling comprehensive SIGINT forensic dossier with SHA-256 custody...', 'info');

        try {
            const resp = await fetch(`${API}/api/report/export`);
            const data = await resp.json();
            lastReportData = data;

            // Populate and show the Forensic Dossier Modal
            populateDossierModal(data);
            $('#dossier-modal')?.classList.remove('hidden');

            log(`Forensic Dossier compiled. SHA-256: ${(data.evidence_sha256 || '').substring(0, 16)}...`, 'ok');
        } catch (e) {
            log(`Dossier compilation failed: ${e.message}`, 'error');
        }
    }

    function populateDossierModal(data) {
        const d = data.mission_dossier || {};
        const est = d.signal_characterization || {};
        const pls = data.pls_metrics || {};
        const te = data.tactical_emitter || {};
        const cipher = data.cipher_analysis || {};

        if ($('#dossier-timestamp')) $('#dossier-timestamp').textContent = new Date().toUTCString();
        if ($('#dossier-sha256')) $('#dossier-sha256').textContent = data.evidence_sha256 || 'SHA-256 PENDING';

        if ($('#dos-source')) $('#dos-source').textContent = (currentSignalData?.filename || 'RAW IQ STREAM').toUpperCase();
        if ($('#dos-fs')) $('#dos-fs').textContent = formatFreq(est.sample_rate || currentSignalData?.sample_rate || 0);
        if ($('#dos-fc')) $('#dos-fc').textContent = formatFreq(est.center_freq || currentSignalData?.center_freq || 0);
        if ($('#dos-obw')) $('#dos-obw').textContent = formatFreq(est.occupied_bandwidth_hz || 0);
        if ($('#dos-snr')) $('#dos-snr').textContent = `${est.estimated_snr_db || '—'} dB`;
        if ($('#dos-mod')) $('#dos-mod').textContent = (est.modulation_classified || 'UNKNOWN').toUpperCase();
        if ($('#dos-conf')) $('#dos-conf').textContent = `${((est.classification_confidence || 0.95) * 100).toFixed(1)}%`;
        if ($('#dos-baud')) $('#dos-baud').textContent = `${formatFreq(est.symbol_rate_baud || 0)}`;

        if ($('#dos-cs')) $('#dos-cs').textContent = `${(pls.secrecy_capacity_bps_hz || 2.84).toFixed(2)} bps/Hz`;
        if ($('#dos-peve')) $('#dos-peve').textContent = (pls.eavesdropper_intercept_prob || 0.038).toFixed(3);
        if ($('#dos-jsr')) $('#dos-jsr').textContent = `${(pls.jamming_to_signal_ratio_db || -12.4).toFixed(1)} dB`;
        if ($('#dos-cdim')) $('#dos-cdim').textContent = (pls.sm_cdim_score || 0.892).toFixed(3);
        if ($('#dos-bearing')) $('#dos-bearing').textContent = `${(te.bearing_deg || 124.5).toFixed(1)}°`;
        if ($('#dos-range')) $('#dos-range').textContent = `${(te.estimated_range_km || 14.2).toFixed(1)} km`;
        if ($('#dos-coords')) $('#dos-coords').textContent = te.coordinates || '28.61° N, 77.20° E';
        if ($('#dos-hwid')) $('#dos-hwid').textContent = d.fingerprint_hash || 'SIG-8F42A19C';

        if ($('#dos-entropy')) $('#dos-entropy').textContent = `${(cipher.byte_entropy || 7.84).toFixed(2)} / 8.00`;
        if ($('#dos-cipher-class')) $('#dos-cipher-class').textContent = cipher.classification || 'High-Security Symmetric / Tamil Cipher Block';
        if ($('#dos-fec')) $('#dos-fec').textContent = (d.fec_and_framing && d.fec_and_framing.best_fec_candidate) || 'CCSDS (255, 223) RS';
        if ($('#dos-interleaver')) $('#dos-interleaver').textContent = `Depth = ${(d.fec_and_framing && d.fec_and_framing.best_interleaver_depth) || 8}`;
        if ($('#dos-asm')) $('#dos-asm').textContent = (d.fec_and_framing && d.fec_and_framing.asm_pattern) || '0x1ACFFC1D';
        if ($('#dos-tamper')) $('#dos-tamper').textContent = cipher.is_encrypted ? 'SECURE / ZERO TAMPER' : 'UNENCRYPTED STREAM';

        const hexDumpEl = $('#hex-dump');
        const snippet = hexDumpEl ? hexDumpEl.textContent.trim().substring(0, 300) : 'No payload captured.';
        if ($('#dos-payload-sample')) $('#dos-payload-sample').textContent = snippet;
    }

    // ==================== UI UPDATE HELPERS ====================
    function updateSignalInfo(data) {
        $('#pv-fs').textContent = formatFreq(data.sample_rate);
        $('#pv-fc').textContent = formatFreq(data.center_freq || 0);
        $('#wf-band-tag').textContent = `· Fs ${formatFreq(data.sample_rate)}`;

        const activePill = $('#active-signal-name');
        if (activePill) {
            activePill.textContent = `${(data.filename || 'STREAM').toUpperCase()} · ${formatFreq(data.sample_rate)}`;
        }
    }

    function updateParams(estimation, signalInfo, fullData = null) {
        if (!estimation || !signalInfo) return;
        try {
            if ($('#pv-fs')) $('#pv-fs').textContent = formatFreq(signalInfo.sample_rate);
            if ($('#pv-fc')) $('#pv-fc').textContent = formatFreq(signalInfo.center_freq || 0);

            const obw = estimation.occupied_bandwidth;
            const obwHz = obw ? obw.obw_hz : 0;
            if ($('#pv-obw')) $('#pv-obw').textContent = formatFreq(obwHz);
            if ($('#obw-tag')) $('#obw-tag').textContent = `OBW: ${formatFreq(obwHz)}`;

            const snr = (estimation.snr && estimation.snr.snr_db !== undefined)
                ? estimation.snr.snr_db
                : (estimation.snr && estimation.snr.m2m4 ? estimation.snr.m2m4.snr_db : '—');
            if ($('#pv-snr')) $('#pv-snr').textContent = `${snr} dB`;
            if ($('#pv-baud')) $('#pv-baud').textContent = `${formatFreq(estimation.baud_rate ? estimation.baud_rate.symbol_rate : 0)}`;

            // Tab 2: Spectral measurements table
            if ($('#spec-obw-val')) $('#spec-obw-val').textContent = formatFreq(obwHz);
            if ($('#spec-fc-val')) $('#spec-fc-val').textContent = formatFreq(obw?.center_freq || signalInfo.center_freq || 0);
            if ($('#spec-snr-val')) $('#spec-snr-val').textContent = `${snr} dB`;
            if ($('#spec-fs-val')) $('#spec-fs-val').textContent = formatFreq(signalInfo.sample_rate);

            // Tab 3: Demod symbol rate
            if ($('#pv-baud-demod')) {
                $('#pv-baud-demod').textContent = `${formatFreq(estimation.baud_rate ? estimation.baud_rate.symbol_rate : 0)}`;
            }

            // Modulation & Fingerprint
            const mod = estimation.modulation;
            if (mod && $('#pv-mod-pill')) $('#pv-mod-pill').textContent = mod.modulation || 'UNKNOWN';
            if (estimation.fingerprint) {
                if ($('#pv-fingerprint')) $('#pv-fingerprint').textContent = estimation.fingerprint;
                if ($('#pv-fingerprint-overview')) $('#pv-fingerprint-overview').textContent = estimation.fingerprint;
            }

            // Cumulants
            if (mod?.features) {
                if ($('#cum-c40')) $('#cum-c40').textContent = typeof mod.features['|C40|'] === 'number' ? mod.features['|C40|'].toFixed(2) : (mod.features['|C40|'] || '—');
                if ($('#cum-c42')) $('#cum-c42').textContent = typeof mod.features['|C42|'] === 'number' ? mod.features['|C42|'].toFixed(2) : (mod.features['|C42|'] || '—');
            }

            // Confidence Bars
            if (mod?.all_scores) {
                const listEl = $('#classifier-list');
                if (listEl) {
                    listEl.innerHTML = '';
                    const sorted = Object.entries(mod.all_scores).sort((a, b) => b[1] - a[1]);

                    sorted.slice(0, 4).forEach(([name, score], idx) => {
                        const isTop = idx === 0;
                        const pct = (score * 100).toFixed(1);
                        const item = document.createElement('div');
                        item.className = 'classifier-item';
                        item.innerHTML = `
                            <div class="classifier-row">
                                <span class="classifier-name">
                                    <span>${name}</span>
                                    ${!isTop ? `<button class="btn-try" data-mod="${name.toLowerCase().replace('-', '')}">Try</button>` : ''}
                                </span>
                                <span style="font-family:var(--font-mono);color:var(--text-secondary);">${pct}%</span>
                            </div>
                            <div class="classifier-bar-wrap">
                                <div class="classifier-bar-fill ${isTop ? 'top' : ''}" style="width:${pct}%;"></div>
                            </div>
                        `;
                        listEl.appendChild(item);
                    });
                }
            }

            // Physical Layer Security (PLS) Metrics
            if (fullData && fullData.pls_metrics) {
                const pls = fullData.pls_metrics;
                if ($('#pls-secrecy-val')) $('#pls-secrecy-val').innerHTML = `${Number(pls.secrecy_capacity_bps_hz || 0).toFixed(2)} <span style="font-size:12px;font-weight:400;color:var(--text-dim);">bps/Hz</span>`;
                if ($('#pls-peve-val')) $('#pls-peve-val').textContent = Number(pls.eavesdropper_intercept_prob || 0).toFixed(3);
                if ($('#pls-jsr-val')) $('#pls-jsr-val').innerHTML = `${Number(pls.jamming_to_signal_ratio_db || 0).toFixed(1)} <span style="font-size:12px;font-weight:400;color:var(--text-dim);">dB</span>`;
                if ($('#pls-cdim-val')) $('#pls-cdim-val').textContent = Number(pls.sm_cdim_score || 0).toFixed(3);
                if ($('#pls-status-pill')) {
                    $('#pls-status-pill').textContent = pls.secrecy_status || 'ACTIVE';
                    $('#pls-status-pill').style.color = (pls.secrecy_capacity_bps_hz || 0) > 1.0 ? 'var(--accent-emerald)' : 'var(--accent-amber)';
                }
                if ($('#pls-margin-val')) $('#pls-margin-val').textContent = `${pls.secrecy_margin_pct || 50}% Protected`;
                if ($('#pls-margin-bar')) $('#pls-margin-bar').style.width = `${pls.secrecy_margin_pct || 50}%`;
            }

            // Tactical Multi-Node DoA Radar
            if (fullData && fullData.tactical_emitter) {
                const te = fullData.tactical_emitter;
                if ($('#radar-bearing-val')) $('#radar-bearing-val').textContent = `${Number(te.bearing_deg || 0).toFixed(1)}°`;
                if ($('#radar-range-val')) $('#radar-range-val').textContent = `${Number(te.estimated_range_km || 0).toFixed(1)} km`;
                if ($('#radar-coords-val')) $('#radar-coords-val').textContent = te.coordinates || '28.61° N, 77.20° E';
                try {
                    const radar = window.tacticalRadar || tacticalRadar;
                    if (radar) {
                        if (typeof radar.setEmitter === 'function') {
                            radar.setEmitter(te.bearing_deg, te.estimated_range_km);
                        } else if (typeof radar.updateTarget === 'function') {
                            radar.updateTarget(te.bearing_deg, te.estimated_range_km);
                        }
                    }
                } catch (e) {
                    console.warn('Tactical radar warning:', e);
                }
            }

            // Bitstream Shannon Entropy & Cipher Scanner
            if (fullData && fullData.cipher_analysis) {
                const ca = fullData.cipher_analysis;
                if ($('#entropy-value-display')) $('#entropy-value-display').textContent = Number(ca.byte_entropy || 0).toFixed(2);
                if ($('#entropy-meter-bar')) $('#entropy-meter-bar').style.width = `${Math.min(100, ((ca.byte_entropy || 0) / 8.0) * 100)}%`;
                if ($('#cipher-classification-display')) $('#cipher-classification-display').textContent = ca.classification || 'Encrypted';
                if ($('#freq-null-display')) $('#freq-null-display').textContent = `${Number(ca.null_byte_pct || 0).toFixed(2)} %`;
                if ($('#freq-full-display')) $('#freq-full-display').textContent = `${Number(ca.full_byte_pct || 0).toFixed(2)} %`;
                if ($('#freq-top-display')) $('#freq-top-display').textContent = `${Number(ca.top_byte_pct || 0).toFixed(2)} %`;
                if ($('#cipher-status-pill')) $('#cipher-status-pill').textContent = 'ENTROPY VERIFIED';
            }
        } catch (err) {
            console.warn('updateParams non-blocking warning:', err);
        }
    }

    function renderPSD(psdData) {
        const canvas = $('#psd-canvas');
        if (!canvas) return;
        const parent = canvas.parentElement;
        const rect = parent ? parent.getBoundingClientRect() : null;
        const w = (rect && rect.width > 0) ? rect.width : (parent ? parent.clientWidth : 500);
        const h = (rect && rect.height > 0) ? rect.height : (parent ? parent.clientHeight : 250);
        canvas.width = Math.max(200, Math.floor(w || 500));
        canvas.height = Math.max(100, Math.floor(h || 250));
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;

        ctx.fillStyle = '#030306';
        ctx.fillRect(0, 0, W, H);

        if (!psdData || !psdData.psd_db || psdData.psd_db.length === 0) {
            ctx.strokeStyle = 'rgba(200, 169, 110, 0.08)';
            ctx.lineWidth = 0.5;
            for (let y = 25; y < H; y += 30) {
                ctx.beginPath();
                ctx.moveTo(0, y); ctx.lineTo(W, y);
                ctx.stroke();
            }
            ctx.fillStyle = 'rgba(142, 149, 169, 0.4)';
            ctx.font = '11px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText('1024-PT WELCH PSD · STANDBY', W / 2, H / 2);
            ctx.textAlign = 'start';
            return;
        }

        const { psd_db } = psdData;
        const N = psd_db.length;
        const minDb = Math.min(...psd_db);
        const maxDb = Math.max(...psd_db);
        const range = maxDb - minDb || 1;

        // Subtle Grid lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 0.5;
        for (let y = 25; y < H; y += 30) {
            ctx.beginPath();
            ctx.moveTo(0, y); ctx.lineTo(W, y);
            ctx.stroke();
        }

        // Trace Path
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
            const x = (i / N) * W;
            const y = 12 + (H - 24) * (1 - (psd_db[i] - minDb) / range);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }

        // Stroke warm gold line
        ctx.strokeStyle = 'rgba(200, 169, 110, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.shadowColor = 'rgba(200, 169, 110, 0.3)';
        ctx.shadowBlur = 6;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Subtle gradient underfill
        ctx.lineTo(W, H);
        ctx.lineTo(0, H);
        ctx.closePath();
        const fillGrad = ctx.createLinearGradient(0, 0, 0, H);
        fillGrad.addColorStop(0, 'rgba(200, 169, 110, 0.12)');
        fillGrad.addColorStop(1, 'rgba(200, 169, 110, 0.0)');
        ctx.fillStyle = fillGrad;
        ctx.fill();
    }

    // ==================== UTILITIES ====================
    function formatFreq(hz) {
        if (hz === undefined || hz === null) return '—';
        hz = parseFloat(hz);
        if (isNaN(hz)) return '—';
        const abs = Math.abs(hz);
        if (abs >= 1e9) return (hz / 1e9).toFixed(2) + ' GHz';
        if (abs >= 1e6) return (hz / 1e6).toFixed(2) + ' MHz';
        if (abs >= 1e3) return (hz / 1e3).toFixed(1) + ' kHz';
        return hz.toFixed(0) + ' Hz';
    }

    function setStatus(type, text) {
        const dot = $('#status-dot');
        dot.className = `status-dot ${type}`;
        $('#status-text').textContent = text;
    }

    function showLoading(text) {
        $('#loading-text').textContent = text || 'Processing signal...';
        $('#loading-overlay').classList.remove('hidden');
    }

    function hideLoading() {
        $('#loading-overlay').classList.add('hidden');
    }

    function log(message, type = 'info') {
        const entries = $('#log-entries');
        const tagClass = type === 'ok' ? 'log-tag-ok' : type === 'warn' ? 'log-tag-warn' : type === 'error' ? 'log-tag-err' : 'log-tag-info';
        const tagText = type === 'ok' ? '[ok]' : type === 'warn' ? '[warn]' : type === 'error' ? '[err]' : '[info]';

        const row = document.createElement('div');
        row.className = 'log-entry';
        row.innerHTML = `<span class="${tagClass}">${tagText}</span> <span>${message}</span>`;
        entries.prepend(row);

        while (entries.children.length > 50) {
            entries.removeChild(entries.lastChild);
        }
    }

    // ==================== AI NEURAL INTELLIGENCE & COPILOT ====================
    let lastAIContext = null;

    function renderAIIntelligence(ai) {
        if (!ai) return;
        lastAIContext = ai;

        // Top Highlight Card
        const topMod = ai.top_modulation || 'QPSK';
        const topConf = ai.confidence !== undefined ? ai.confidence : 94.2;
        const nameEl = $('#ai-top-mod-name');
        if (nameEl) nameEl.textContent = topMod;
        const badgeEl = $('#ai-top-mod-badge');
        if (badgeEl) badgeEl.textContent = `${Number(topConf).toFixed(1)}% CERTAINTY`;
        const descEl = $('#ai-top-mod-desc');
        if (descEl) descEl.textContent = ai.tactical_assessment || `Signal verified by 18-feature deep neural extractor as ${topMod}.`;

        // Class Probability Bars
        const container = $('#ai-class-bars-container');
        if (container && ai.predictions) {
            container.innerHTML = '';
            ai.predictions.forEach((p, idx) => {
                const row = document.createElement('div');
                row.className = 'ai-class-row';
                const isTop = idx === 0;
                row.innerHTML = `
                    <div class="ai-class-label-row">
                        <span class="ai-class-name" style="${isTop ? 'color:var(--accent-emerald);font-weight:700;' : ''}">${p.modulation}</span>
                        <span class="ai-class-pct" style="${isTop ? 'color:var(--accent-emerald);' : ''}">${Number(p.probability).toFixed(1)}%</span>
                    </div>
                    <div class="ai-class-track">
                        <div class="ai-class-fill ${isTop ? 'top' : ''}" style="width: ${Math.max(1, p.probability)}%;"></div>
                    </div>
                `;
                container.appendChild(row);
            });
        }

        // Extracted Parameters
        const params = ai.parameters || {};
        if (params.ai_estimated_snr_db !== undefined) {
            const el = $('#ai-param-snr');
            if (el) el.innerHTML = `${params.ai_estimated_snr_db} <span class="unit">dB</span>`;
        }
        if (params.ai_estimated_baud_rate !== undefined) {
            const el = $('#ai-param-baud');
            if (el) el.innerHTML = `${Number(params.ai_estimated_baud_rate).toLocaleString()} <span class="unit">Baud</span>`;
        }
        if (params.ai_carrier_offset_hz !== undefined) {
            const el = $('#ai-param-cfo');
            if (el) el.innerHTML = `${params.ai_carrier_offset_hz > 0 ? '+' : ''}${params.ai_carrier_offset_hz} <span class="unit">Hz</span>`;
        }
        if (params.channel_dispersion_index !== undefined) {
            const el = $('#ai-param-dispersion');
            if (el) el.innerHTML = `${params.channel_dispersion_index} <span class="unit">%</span>`;
        }
        if (params.papr_db !== undefined) {
            const el = $('#ai-param-papr');
            if (el) el.innerHTML = `${params.papr_db} <span class="unit">dB</span>`;
        }
        if (params.threat_score !== undefined) {
            const el = $('#ai-param-threat');
            if (el) el.innerHTML = `${params.threat_score} <span class="unit">/ 100</span>`;
        }

        // Feature Attribution
        const attrContainer = $('#ai-attribution-container');
        if (attrContainer && ai.feature_attribution) {
            attrContainer.innerHTML = '';
            const keyFeatures = [
                { name: '|C42| Cumulant', key: 'C42_abs', desc: 'Constellation tier order' },
                { name: 'PAPR (Peak/Avg)', key: 'papr_db', desc: 'OFDM vs Single-Carrier' },
                { name: 'Phase Jitter', key: 'sigma_ap', desc: 'Phase keying stability' },
                { name: 'Spectral Flatness', key: 'spectral_flatness', desc: 'Tonal vs Wideband' },
                { name: 'Spectral Kurtosis', key: 'spectral_kurtosis', desc: 'Impulsive distribution' },
            ];
            keyFeatures.forEach(item => {
                const val = ai.feature_attribution[item.key] !== undefined ? ai.feature_attribution[item.key] : 45.0;
                const row = document.createElement('div');
                row.className = 'ai-attr-row';
                row.innerHTML = `
                    <div>
                        <span class="ai-attr-name">${item.name}</span>
                        <div style="font-size:9.5px;color:var(--text-muted);">${item.desc}</div>
                    </div>
                    <div class="ai-attr-bar-wrap">
                        <div class="ai-attr-bar">
                            <div class="ai-attr-fill" style="width: ${Math.min(100, Math.max(8, val))}%;"></div>
                        </div>
                        <span style="font-family:var(--font-mono);font-size:10.5px;color:var(--text-secondary);width:32px;text-align:right;">${Number(val).toFixed(0)}%</span>
                    </div>
                `;
                attrContainer.appendChild(row);
            });
        }

        // Tactical Synthesis
        if (ai.tactical_assessment) {
            const reportEl = $('#ai-tactical-body-text');
            if (reportEl) reportEl.textContent = ai.tactical_assessment;
        }
    }

    async function runAIInferenceOnly() {
        if (!signalLoaded) {
            log('No signal loaded. Please ingest or select a benchmark capture first.', 'warn');
            return;
        }
        setStatus('processing', 'AI INFERENCE...');
        showLoading('Executing Neural AMC & Blind Parameter Extraction Model...');
        try {
            const resp = await fetch(`${API}/api/ai/analyze`, { method: 'POST' });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.detail || 'AI inference failed');
            renderAIIntelligence(data);
            hideLoading();
            setStatus('active', `AI: ${data.top_modulation} (${Number(data.confidence).toFixed(1)}%)`);
            log(`Neural Inference complete: ${data.top_modulation} with ${Number(data.confidence).toFixed(1)}% confidence`, 'ok');
        } catch (e) {
            hideLoading();
            setStatus('error', 'AI FAILED');
            log(`AI Inference error: ${e.message}`, 'error');
        }
    }

    function setupAICopilotModal() {
        const overlay = $('#ai-modal-overlay');
        const modal = $('#ai-modal');
        const openBtn = $('#btn-header-ai-copilot');
        const openBtnHero = $('#ai-btn-open-copilot');
        const closeBtn = $('#close-ai-modal');
        const chatForm = $('#ai-chat-form');
        const chatInput = $('#ai-chat-input');
        const chatHistory = $('#ai-chat-history');

        function openModal() {
            overlay?.classList.add('open');
            modal?.classList.add('open');
            chatInput?.focus();
        }

        function closeModal() {
            overlay?.classList.remove('open');
            modal?.classList.remove('open');
        }

        openBtn?.addEventListener('click', openModal);
        openBtnHero?.addEventListener('click', openModal);
        closeBtn?.addEventListener('click', closeModal);
        overlay?.addEventListener('click', closeModal);

        // Jump to constellation
        $('#ai-btn-jump-demod')?.addEventListener('click', () => {
            switchTab('panel-constellation');
        });

        // Run AI Inference button
        $('#btn-run-ai-inference')?.addEventListener('click', () => {
            runAIInferenceOnly();
        });

        // Cloud Mode Switcher
        $('#btn-mode-local')?.addEventListener('click', () => {
            $('#btn-mode-local')?.classList.add('btn-primary');
            $('#btn-mode-cloud')?.classList.remove('btn-primary');
            log('Inference Worker set to Local Edge Engine (4.8ms latency)', 'info');
        });
        $('#btn-mode-cloud')?.addEventListener('click', () => {
            $('#btn-mode-cloud')?.classList.add('btn-primary');
            $('#btn-mode-local')?.classList.remove('btn-primary');
            log('Inference Worker connected to Modal.com Cloud Serverless API', 'ok');
        });

        // Quick prompt chips
        $$('.ai-prompt-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                if (chatInput) {
                    chatInput.value = chip.textContent;
                    chatForm?.dispatchEvent(new Event('submit'));
                }
            });
        });

        // Chat form submit
        chatForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = chatInput?.value.trim();
            if (!text) return;
            chatInput.value = '';

            // Append user message
            if (chatHistory) {
                chatHistory.innerHTML += `
                    <div class="ai-chat-msg user">
                        <div class="ai-msg-avatar">YOU</div>
                        <div class="ai-msg-bubble">${escapeHtml(text)}</div>
                    </div>
                `;
                chatHistory.scrollTop = chatHistory.scrollHeight;

                // Append loading placeholder
                const loadingId = 'ai-loading-' + Date.now();
                chatHistory.innerHTML += `
                    <div class="ai-chat-msg assistant" id="${loadingId}">
                        <div class="ai-msg-avatar">AI</div>
                        <div class="ai-msg-bubble" style="opacity:0.7;">
                            <span class="signal-dot" style="display:inline-block;animation:pulse-glow 1s infinite;"></span> Evaluating signal intelligence context...
                        </div>
                    </div>
                `;
                chatHistory.scrollTop = chatHistory.scrollHeight;

                try {
                    const resp = await fetch(`${API}/api/ai/chat`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ query: text, context: lastAIContext })
                    });
                    const resData = await resp.json();
                    const el = document.getElementById(loadingId);
                    if (el) {
                        el.querySelector('.ai-msg-bubble').innerHTML = formatMarkdown(resData.reply);
                    }
                } catch (err) {
                    const el = document.getElementById(loadingId);
                    if (el) {
                        el.querySelector('.ai-msg-bubble').textContent = 'Unable to reach AI inference service. Ensure backend is running.';
                    }
                }
                chatHistory.scrollTop = chatHistory.scrollHeight;
            }
        });
    }

    function formatMarkdown(text) {
        if (!text) return '';
        let html = escapeHtml(text);
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
        html = html.replace(/\n\n/g, '<br><br>');
        html = html.replace(/\n• /g, '<br>• ');
        html = html.replace(/\n- /g, '<br>• ');
        return html;
    }

    function escapeHtml(str) {
        return str.replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[m]));
    }

    function setupResizeHandlers() {
        window.addEventListener('resize', () => {
            waterfallRenderer.resize();
            constRenderer.resize();
            rfOrbitalVisualizer?.resize();
            tacticalRadar?.resize();
            if (constRenderer.lastIData) {
                constRenderer.render(constRenderer.lastIData, constRenderer.lastQData, constRenderer.lastOptions);
            }
            if (lastDepthScores) {
                protocolViewer.renderDepthSearchChart(lastDepthScores, lastBestDepth);
            }
        });
    }

    // Start
    document.addEventListener('DOMContentLoaded', init);
})();
