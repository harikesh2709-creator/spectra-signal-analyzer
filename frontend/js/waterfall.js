/**
 * Waterfall / Spectrogram Canvas Renderer
 * High-performance Canvas-based spectrogram with configurable colormaps.
 */

class WaterfallRenderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.colormap = 'turbo';
        this._colormaps = {
            turbo: this._buildTurbo(),
            viridis: this._buildViridis(),
            plasma: this._buildPlasma(),
            nightvision: this._buildNightVision(),
        };
        this.lastData = null;
    }

    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        const parentW = this.canvas.parentElement ? this.canvas.parentElement.clientWidth : 0;
        const parentH = this.canvas.parentElement ? this.canvas.parentElement.clientHeight : 0;
        const w = rect.width > 0 ? rect.width : (parentW > 0 ? parentW : 800);
        const h = rect.height > 0 ? rect.height : (parentH > 0 ? parentH : 320);
        this.canvas.width = Math.max(300, Math.floor(w));
        this.canvas.height = Math.max(120, Math.floor(h));
    }

    setColormap(name) {
        this.colormap = name;
        if (this.lastData) this.render(this.lastData);
        else this.renderPlaceholder();
    }

    renderPlaceholder() {
        this.resize();
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;

        ctx.fillStyle = '#030306';
        ctx.fillRect(0, 0, W, H);

        // Grid lines
        ctx.strokeStyle = 'rgba(200, 169, 110, 0.08)';
        ctx.lineWidth = 0.5;
        const cols = 8;
        const rows = 5;
        for (let i = 1; i < cols; i++) {
            const x = (i / cols) * W;
            ctx.beginPath();
            ctx.moveTo(x, 0); ctx.lineTo(x, H);
            ctx.stroke();
        }
        for (let j = 1; j < rows; j++) {
            const y = (j / rows) * H;
            ctx.beginPath();
            ctx.moveTo(0, y); ctx.lineTo(W, y);
            ctx.stroke();
        }

        // Center standby watermark
        ctx.fillStyle = 'rgba(200, 169, 110, 0.6)';
        ctx.font = '600 12px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('RF SPECTRAL RADAR · STANDBY', W / 2, H / 2 - 8);

        ctx.fillStyle = 'rgba(142, 149, 169, 0.5)';
        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.fillText('Awaiting raw I/Q or WAV signal ingestion...', W / 2, H / 2 + 12);
        ctx.textAlign = 'start';
    }

    render(data) {
        if (data) this.lastData = data;
        const currentData = data || this.lastData;
        if (!currentData || !currentData.mag_norm || currentData.mag_norm.length === 0) {
            this.renderPlaceholder();
            return;
        }
        this.resize();

        const { mag_norm, freqs, times } = currentData;
        const nTime = mag_norm.length;
        const nFreq = mag_norm[0].length;
        const W = Math.max(100, this.canvas.width || 800);
        const H = Math.max(100, this.canvas.height || 320);

        let imgData;
        try {
            imgData = this.ctx.createImageData(W, H);
        } catch (e) {
            console.warn('Canvas not ready for imageData:', e);
            return;
        }

        const cmap = this._colormaps[this.colormap] || this._colormaps.turbo;

        for (let py = 0; py < H; py++) {
            const ti = Math.floor((py / H) * nTime);
            const row = mag_norm[Math.min(ti, nTime - 1)];
            for (let px = 0; px < W; px++) {
                const fi = Math.floor((px / W) * nFreq);
                const val = row[Math.min(fi, nFreq - 1)];
                const idx = Math.max(0, Math.min(255, Math.round(val * 255)));
                const [r, g, b] = cmap[idx];
                const offset = (py * W + px) * 4;
                imgData.data[offset] = r;
                imgData.data[offset + 1] = g;
                imgData.data[offset + 2] = b;
                imgData.data[offset + 3] = 255;
            }
        }

        this.ctx.putImageData(imgData, 0, 0);

        // Draw axis labels
        this.ctx.fillStyle = 'rgba(224, 230, 240, 0.7)';
        this.ctx.font = '10px "JetBrains Mono"';

        // Frequency labels
        if (freqs && freqs.length > 0) {
            const fMin = freqs[0];
            const fMax = freqs[freqs.length - 1];
            for (let i = 0; i <= 4; i++) {
                const f = fMin + (fMax - fMin) * (i / 4);
                const x = (i / 4) * W;
                const label = this._formatFreq(f);
                this.ctx.fillText(label, Math.max(2, x - 20), H - 4);
            }
        }

        // Time labels
        if (times && times.length > 0) {
            const tMin = times[0];
            const tMax = times[times.length - 1];
            for (let i = 0; i <= 3; i++) {
                const t = tMin + (tMax - tMin) * (i / 3);
                const y = (i / 3) * H;
                this.ctx.fillText(t.toFixed(3) + 's', 4, Math.max(12, y));
            }
        }
    }

    _formatFreq(f) {
        if (Math.abs(f) >= 1e6) return (f / 1e6).toFixed(2) + ' MHz';
        if (Math.abs(f) >= 1e3) return (f / 1e3).toFixed(1) + ' kHz';
        return f.toFixed(0) + ' Hz';
    }

    // --- Colormap builders (256 entries each) ---
    _buildTurbo() {
        const c = [];
        for (let i = 0; i < 256; i++) {
            const t = i / 255;
            const r = Math.round(Math.max(0, Math.min(255, 34.61 + t * (1172.33 - t * (10793.56 - t * (33300.12 - t * (38394.49 - t * 14825.05)))))));
            const g = Math.round(Math.max(0, Math.min(255, 23.31 + t * (557.33 + t * (1225.33 - t * (3574.96 - t * (1073.77 + t * 707.56)))))));
            const b = Math.round(Math.max(0, Math.min(255, 27.2 + t * (3211.1 - t * (15327.97 - t * (27814 - t * (22569.18 - t * 6838.66)))))));
            c.push([r, g, b]);
        }
        return c;
    }

    _buildViridis() {
        const c = [];
        for (let i = 0; i < 256; i++) {
            const t = i / 255;
            const r = Math.round(Math.max(0, Math.min(255, 255 * (0.267 + t * (0.005 + t * (2.38 - t * 1.65))))));
            const g = Math.round(Math.max(0, Math.min(255, 255 * (0.004 + t * (1.27 - t * 0.28)))));
            const b = Math.round(Math.max(0, Math.min(255, 255 * (0.329 + t * (1.42 - t * (4.28 - t * 2.53))))));
            c.push([r, g, b]);
        }
        return c;
    }

    _buildPlasma() {
        const c = [];
        for (let i = 0; i < 256; i++) {
            const t = i / 255;
            const r = Math.round(Math.max(0, Math.min(255, 255 * (0.05 + t * (2.77 - t * (4.9 - t * 2.45))))));
            const g = Math.round(Math.max(0, Math.min(255, 255 * (0.02 + t * t * (2.1 - t * 1.15)))));
            const b = Math.round(Math.max(0, Math.min(255, 255 * (0.53 + t * (0.72 - t * 2.95 + t * t * 2.1)))));
            c.push([r, g, b]);
        }
        return c;
    }

    _buildNightVision() {
        const c = [];
        for (let i = 0; i < 256; i++) {
            const t = i / 255;
            c.push([0, Math.round(t * 255), Math.round(t * 40)]);
        }
        return c;
    }
}

// Export for app.js
window.WaterfallRenderer = WaterfallRenderer;
