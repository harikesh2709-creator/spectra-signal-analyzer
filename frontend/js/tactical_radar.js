/**
 * SPECTRA — Tactical Direction-of-Arrival (DoA) Radar Visualizer
 * Inspired by MANET mesh nodes in adhoc-network-sim
 * Real-time 2D radar sweep with emitter angle and range projection.
 */

class TacticalRadar {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.angle = 0;
        this.targetBearing = 42.5; // degrees
        this.targetDistance = 0.65; // 0 to 1 relative radius
        this.targetProfile = 'LEO Spacecraft';
        this.isJamming = false;
        this.animId = null;

        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.start();
    }

    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.width = rect.width || 280;
        this.height = rect.height || 220;
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    setEmitter(bearingDeg, rangeKm, profile = 'LEO Spacecraft', isJamming = false) {
        this.targetBearing = bearingDeg !== undefined ? bearingDeg : 42.5;
        let normDist = 0.65;
        if (rangeKm) {
            normDist = Math.min(0.88, Math.max(0.25, rangeKm / 1000.0));
            if (profile && (profile.includes('UAV') || rangeKm < 100)) {
                normDist = Math.min(0.85, Math.max(0.3, rangeKm / 75.0));
            }
        }
        this.targetDistance = normDist;
        this.targetProfile = profile || 'LEO Spacecraft';
        this.isJamming = isJamming;
    }

    updateTarget(bearingDeg, rangeKm, profile = 'LEO Spacecraft', isJamming = false) {
        this.setEmitter(bearingDeg, rangeKm, profile, isJamming);
    }

    start() {
        if (this.animId) cancelAnimationFrame(this.animId);
        const animate = () => {
            this.draw();
            this.angle = (this.angle + 0.035) % (Math.PI * 2);
            this.animId = requestAnimationFrame(animate);
        };
        animate();
    }

    draw() {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const W = this.width;
        const H = this.height;
        const cx = W / 2;
        const cy = H / 2;
        const maxR = Math.min(cx, cy) - 16;

        ctx.clearRect(0, 0, W, H);

        // Radar background circle
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        ctx.fillStyle = isLight ? '#0c1322' : '#030306';
        ctx.beginPath();
        ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
        ctx.fill();

        // Concentric range rings
        ctx.lineWidth = 1;
        [0.25, 0.5, 0.75, 1.0].forEach((ratio, idx) => {
            ctx.strokeStyle = isLight ? 'rgba(200, 169, 110, 0.18)' : 'rgba(200, 169, 110, 0.12)';
            ctx.beginPath();
            ctx.arc(cx, cy, maxR * ratio, 0, Math.PI * 2);
            ctx.stroke();

            // Range label
            ctx.fillStyle = isLight ? 'rgba(200, 169, 110, 0.5)' : 'rgba(200, 169, 110, 0.35)';
            ctx.font = '8px "JetBrains Mono", monospace';
            ctx.fillText(`${idx === 3 ? '100%' : (ratio * 100).toFixed(0) + '%'}`, cx + 3, cy - maxR * ratio + 10);
        });

        // Crosshairs
        ctx.strokeStyle = isLight ? 'rgba(200, 169, 110, 0.22)' : 'rgba(200, 169, 110, 0.14)';
        ctx.beginPath();
        ctx.moveTo(cx - maxR, cy);
        ctx.lineTo(cx + maxR, cy);
        ctx.moveTo(cx, cy - maxR);
        ctx.lineTo(cx, cy + maxR);
        ctx.stroke();

        // Cardinal directions
        ctx.fillStyle = isLight ? '#94a3b8' : '#64748b';
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('N (0°)', cx, cy - maxR + 10);
        ctx.fillText('S (180°)', cx, cy + maxR - 4);
        ctx.textAlign = 'left';
        ctx.fillText('E (90°)', cx + maxR - 35, cy - 3);
        ctx.textAlign = 'right';
        ctx.fillText('W (270°)', cx - maxR + 35, cy - 3);

        // Jamming Sector overlay if detected
        if (this.isJamming) {
            const jamAngle = (this.targetBearing + 180) * (Math.PI / 180);
            ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, maxR, jamAngle - 0.4, jamAngle + 0.4);
            ctx.closePath();
            ctx.fill();
        }

        // Radar sweep gradient trail
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, maxR, this.angle - 0.5, this.angle);
        ctx.closePath();
        ctx.fillStyle = 'rgba(200, 169, 110, 0.08)';
        ctx.fill();

        // Active sweep beam line
        ctx.strokeStyle = 'rgba(200, 169, 110, 0.75)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(this.angle) * maxR, cy + Math.sin(this.angle) * maxR);
        ctx.stroke();
        ctx.restore();

        // Intercept Base Station Icon (Center)
        ctx.fillStyle = 'var(--accent-cyan)';
        ctx.beginPath();
        ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Target Emitter Blip
        const targetRad = (this.targetBearing - 90) * (Math.PI / 180);
        const targetX = cx + Math.cos(targetRad) * (maxR * this.targetDistance);
        const targetY = cy + Math.sin(targetRad) * (maxR * this.targetDistance);

        // Pulse ring around target
        const pulse = (Date.now() % 1500) / 1500;
        ctx.strokeStyle = `rgba(200, 169, 110, ${1 - pulse})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(targetX, targetY, 4 + pulse * 10, 0, Math.PI * 2);
        ctx.stroke();

        // Target blip center
        ctx.fillStyle = this.isJamming ? 'var(--accent-rose)' : 'var(--accent-gold)';
        ctx.beginPath();
        ctx.arc(targetX, targetY, 4, 0, Math.PI * 2);
        ctx.fill();

        // Blip label
        ctx.fillStyle = '#ffffff';
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${this.targetBearing.toFixed(1)}° · ${this.targetProfile}`, targetX + 8, targetY + 3);
    }
}

TacticalRadar.prototype.updateTarget = function(bearingDeg, rangeKm, profile = 'LEO Spacecraft', isJamming = false) {
    this.setEmitter(bearingDeg, rangeKm, profile, isJamming);
};

window.TacticalRadar = TacticalRadar;
