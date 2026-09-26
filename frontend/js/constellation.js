/**
 * Constellation & Eye Diagram Renderer
 * Canvas-based I/Q scatter plot with density coloring.
 * Premium dark aesthetic with gold accent particles.
 */

class ConstellationRenderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.lastIData = null;
        this.lastQData = null;
        this.lastOptions = {};
        this.displayMode = 'scatter'; // 'scatter' or 'density'
    }

    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        const parentW = this.canvas.parentElement ? this.canvas.parentElement.clientWidth : 0;
        const parentH = this.canvas.parentElement ? this.canvas.parentElement.clientHeight : 0;
        const w = rect.width > 0 ? rect.width : (parentW > 0 ? parentW : 450);
        const h = rect.height > 0 ? rect.height : (parentH > 0 ? parentH : 380);
        this.canvas.width = Math.max(200, Math.floor(w));
        this.canvas.height = Math.max(150, Math.floor(h));
    }

    setMode(mode) {
        this.displayMode = mode;
        if (this.lastIData && this.lastQData) {
            this.render(this.lastIData, this.lastQData, this.lastOptions);
        } else {
            this.clear();
        }
    }

    render(iData, qData, options = {}) {
        if (!iData || !qData || iData.length === 0) {
            this.clear();
            return;
        }
        this.lastIData = iData;
        this.lastQData = qData;
        this.lastOptions = options;
        this.resize();

        if (this.displayMode === 'density') {
            this.renderDensity(iData, qData, options);
        } else {
            this.renderScatter(iData, qData, options);
        }
    }

    renderScatter(iData, qData, options = {}) {
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;
        const cx = W / 2;
        const cy = H / 2;

        const color = options.color || 'rgba(200, 169, 110, 0.8)';
        const glowColor = options.glowColor || 'rgba(200, 169, 110, 0.15)';
        const gridColor = options.gridColor || 'rgba(255, 255, 255, 0.03)';
        const axisColor = options.axisColor || 'rgba(200, 169, 110, 0.15)';

        // Clear
        ctx.fillStyle = '#030306';
        ctx.fillRect(0, 0, W, H);

        // Compute scale
        let maxVal = 0;
        for (let i = 0; i < iData.length; i++) {
            maxVal = Math.max(maxVal, Math.abs(iData[i]), Math.abs(qData[i]));
        }
        maxVal = maxVal || 1;
        const scale = (Math.min(W, H) / 2 - 30) / (maxVal * 1.15);

        // Grid circles
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 0.5;
        for (let r = 0.25; r <= 1.5; r += 0.25) {
            ctx.beginPath();
            ctx.arc(cx, cy, r * scale * maxVal * 0.67, 0, 2 * Math.PI);
            ctx.stroke();
        }

        // Axes
        ctx.strokeStyle = axisColor;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, cy); ctx.lineTo(W, cy);
        ctx.moveTo(cx, 0); ctx.lineTo(cx, H);
        ctx.stroke();

        // Axis labels
        ctx.fillStyle = 'rgba(142, 149, 169, 0.5)';
        ctx.font = '9px "JetBrains Mono"';
        ctx.fillText('I', W - 14, cy - 6);
        ctx.fillText('Q', cx + 6, 14);

        // Draw glow layer
        ctx.fillStyle = glowColor;
        for (let i = 0; i < iData.length; i++) {
            const x = cx + iData[i] * scale;
            const y = cy - qData[i] * scale;
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fill();
        }

        // Draw points
        ctx.fillStyle = color;
        for (let i = 0; i < iData.length; i++) {
            const x = cx + iData[i] * scale;
            const y = cy - qData[i] * scale;
            ctx.beginPath();
            ctx.arc(x, y, 1.5, 0, 2 * Math.PI);
            ctx.fill();
        }

        // Legend / Stats
        ctx.fillStyle = 'rgba(142, 149, 169, 0.5)';
        ctx.font = '9px "JetBrains Mono"';
        ctx.fillText(`${iData.length.toLocaleString()} symbols · SCATTER`, 6, H - 8);
    }

    renderDensity(iData, qData, options = {}) {
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;
        const cx = W / 2;
        const cy = H / 2;

        ctx.fillStyle = '#030306';
        ctx.fillRect(0, 0, W, H);

        let maxVal = 0;
        for (let i = 0; i < iData.length; i++) {
            maxVal = Math.max(maxVal, Math.abs(iData[i]), Math.abs(qData[i]));
        }
        maxVal = maxVal || 1;
        const bound = maxVal * 1.25;

        // 2D Spatial Histogram (100x100 grid)
        const bins = 100;
        const hist = new Float32Array(bins * bins);
        let maxCount = 0;

        for (let i = 0; i < iData.length; i++) {
            const bx = Math.floor(((iData[i] + bound) / (2 * bound)) * bins);
            const by = Math.floor(((-qData[i] + bound) / (2 * bound)) * bins);
            if (bx >= 0 && bx < bins && by >= 0 && by < bins) {
                const idx = by * bins + bx;
                hist[idx] += 1;
                if (hist[idx] > maxCount) maxCount = hist[idx];
            }
        }

        // Draw density cells with premium warm palette
        const cellW = (Math.min(W, H) - 50) / bins;
        const startX = cx - (bins * cellW) / 2;
        const startY = cy - (bins * cellW) / 2;

        const logMax = Math.log(maxCount + 1);

        for (let by = 0; by < bins; by++) {
            for (let bx = 0; bx < bins; bx++) {
                const count = hist[by * bins + bx];
                if (count === 0) continue;

                const intensity = Math.log(count + 1) / logMax;

                // Warm Heatmap: Deep blue → Cyan → Gold → White
                let r, g, b, a;
                if (intensity < 0.25) {
                    const t = intensity / 0.25;
                    r = Math.floor(10 * t);
                    g = Math.floor(30 + 100 * t);
                    b = Math.floor(60 + 140 * t);
                    a = 0.4 + 0.3 * t;
                } else if (intensity < 0.55) {
                    const t = (intensity - 0.25) / 0.3;
                    r = Math.floor(10 + 190 * t);
                    g = Math.floor(130 + 39 * t);
                    b = Math.floor(200 - 90 * t);
                    a = 0.7 + 0.2 * t;
                } else if (intensity < 0.85) {
                    const t = (intensity - 0.55) / 0.3;
                    r = Math.floor(200 + 55 * t);
                    g = Math.floor(169 + 20 * t);
                    b = Math.floor(110 - 80 * t);
                    a = 0.9;
                } else {
                    const t = (intensity - 0.85) / 0.15;
                    r = 255;
                    g = Math.floor(189 + 66 * t);
                    b = Math.floor(30 + 225 * t);
                    a = 1.0;
                }

                ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
                ctx.fillRect(startX + bx * cellW, startY + by * cellW, cellW + 0.5, cellW + 0.5);
            }
        }

        // Overlay crosshairs
        ctx.strokeStyle = 'rgba(200, 169, 110, 0.12)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, cy); ctx.lineTo(W, cy);
        ctx.moveTo(cx, 0); ctx.lineTo(cx, H);
        ctx.stroke();

        ctx.fillStyle = 'rgba(200, 169, 110, 0.7)';
        ctx.font = '9px "JetBrains Mono"';
        ctx.fillText(`${iData.length.toLocaleString()} symbols · DENSITY (max ${maxCount}/bin)`, 6, H - 8);
    }

    clear() {
        this.resize();
        this.lastIData = null;
        this.lastQData = null;
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;
        const cx = W / 2;
        const cy = H / 2;

        ctx.fillStyle = '#030306';
        ctx.fillRect(0, 0, W, H);

        // Concentric circles
        ctx.strokeStyle = 'rgba(200, 169, 110, 0.08)';
        ctx.lineWidth = 0.5;
        const radius = Math.min(cx, cy) - 20;
        for (let r = 0.33; r <= 1.0; r += 0.33) {
            ctx.beginPath();
            ctx.arc(cx, cy, radius * r, 0, 2 * Math.PI);
            ctx.stroke();
        }

        // Axes
        ctx.strokeStyle = 'rgba(200, 169, 110, 0.15)';
        ctx.beginPath();
        ctx.moveTo(0, cy); ctx.lineTo(W, cy);
        ctx.moveTo(cx, 0); ctx.lineTo(cx, H);
        ctx.stroke();

        // Labels
        ctx.fillStyle = 'rgba(200, 169, 110, 0.6)';
        ctx.font = '600 12px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('CONSTELLATION LAB · STANDBY', cx, cy - 10);

        ctx.fillStyle = 'rgba(142, 149, 169, 0.5)';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillText('Awaiting symbol demodulation and carrier lock...', cx, cy + 12);
        ctx.textAlign = 'start';
    }
}

window.ConstellationRenderer = ConstellationRenderer;
