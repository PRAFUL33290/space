'use strict';

// ─── Constantes ───────────────────────────────────────────────────────────────
const W = 800, H = 600;
const S = { MENU: 0, PLAYING: 1, PAUSED: 2, OVER: 3, VICTORY: 4 };

const CHARGE_MED  = 0.35;  // seuil tir moyen (s)
const CHARGE_FULL = 0.90;  // seuil tir plasma (s)
const CHARGE_MAX  = 1.20;  // plafond de charge (s)

// ─── Gestionnaire Audio ───────────────────────────────────────────────────────
const AudioMgr = (() => {
    const tracks = {
        menu:    new Audio('music/Menu.mp3'),
        galactic: new Audio('music/Galactic Run.mp3'),
        raid:    new Audio('music/Neon Star Raid.mp3'),
    };
    Object.values(tracks).forEach(t => { t.loop = true; t.volume = 0.5; });
    let current = null, muted = false;

    function play(name) {
        const t = tracks[name];
        if (!t || current === t) return;
        if (current) { current.pause(); current.currentTime = 0; }
        current = t;
        current.muted = muted;
        current.play().catch(() => {});
    }
    function pause()  { current?.pause(); }
    function resume() { current?.play().catch(() => {}); }
    function toggleMute() {
        muted = !muted;
        if (current) current.muted = muted;
        showMuteToast(muted);
    }
    function gameTrack() { return selectedLevel <= 5 ? 'galactic' : 'raid'; }
    return { play, pause, resume, toggleMute, gameTrack };
})();

document.addEventListener('click',      startMenuAudio, { once: true });
document.addEventListener('keydown',    startMenuAudio, { once: true });
document.addEventListener('touchstart', startMenuAudio, { once: true });
function startMenuAudio() { AudioMgr.play('menu'); }

let _toastTimer = null;
function showMuteToast(m) {
    let t = document.getElementById('mute-toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'mute-toast';
        t.style.cssText = `position:absolute;bottom:14px;left:50%;transform:translateX(-50%);
            background:rgba(0,0,0,.75);color:#0ff;border:1px solid #0ff;
            font-family:'Press Start 2P',monospace;font-size:10px;
            padding:7px 14px;z-index:20;pointer-events:none;letter-spacing:1px;`;
        document.getElementById('game-container').appendChild(t);
    }
    t.innerText = m ? '🔇 SON COUPÉ' : '🔊 SON ACTIVÉ';
    t.style.opacity = '1';
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { t.style.opacity = '0'; }, 1800);
}

// ─── Sound FX (Web Audio API) ─────────────────────────────────────────────────
const SFX = (() => {
    let actx = null;
    function getCtx() {
        if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
        if (actx.state === 'suspended') actx.resume();
        return actx;
    }

    // Unlock AudioContext on any user interaction (critical for mobile)
    function unlockAudio() {
        getCtx();
        // Also unlock HTML audio elements for mobile
        Object.values({ menu: 'music/Menu.mp3', galactic: 'music/Galactic Run.mp3', raid: 'music/Neon Star Raid.mp3' })
            .forEach(() => {});
    }
    ['touchstart', 'touchend', 'mousedown', 'click', 'keydown'].forEach(evt => {
        document.addEventListener(evt, unlockAudio, { once: false, passive: true });
    });

    function shoot(type) {
        // type: 'normal', 'medium', 'plasma'
        const ctx = getCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        const now = ctx.currentTime;

        if (type === 'plasma') {
            osc.type = 'sawtooth'; osc.frequency.setValueAtTime(220, now);
            osc.frequency.exponentialRampToValueAtTime(55, now + 0.35);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc.start(now); osc.stop(now + 0.35);
        } else if (type === 'medium') {
            osc.type = 'square'; osc.frequency.setValueAtTime(600, now);
            osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.start(now); osc.stop(now + 0.15);
        } else {
            osc.type = 'square'; osc.frequency.setValueAtTime(880, now);
            osc.frequency.exponentialRampToValueAtTime(440, now + 0.08);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            osc.start(now); osc.stop(now + 0.08);
        }
    }

    function impact() {
        const ctx = getCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        const now = ctx.currentTime;
        osc.type = 'sine'; osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.start(now); osc.stop(now + 0.12);
    }

    function enemyDestroyed() {
        const ctx = getCtx();
        // Noise burst for explosion
        const bufferSize = ctx.sampleRate * 0.2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.setValueAtTime(1200, ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.2);
        noise.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        noise.start(); noise.stop(ctx.currentTime + 0.2);
    }

    function playerHit() {
        const ctx = getCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        const now = ctx.currentTime;
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);

        // Add a second noise layer
        const bufferSize = ctx.sampleRate * 0.25;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const g2 = ctx.createGain();
        noise.connect(g2); g2.connect(ctx.destination);
        g2.gain.setValueAtTime(0.2, now);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        noise.start(now); noise.stop(now + 0.25);
    }

    function powerUp() {
        const ctx = getCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        const now = ctx.currentTime;
        osc.type = 'sine'; osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.15);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
    }

    return { shoot, impact, enemyDestroyed, playerHit, powerUp };
})();

// ─── Canvas ───────────────────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

// ─── Inputs ───────────────────────────────────────────────────────────────────
const keys = {};
const touchState = { up: false, down: false, left: false, right: false, fire: false, shield: false };

document.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter'].includes(e.code))
        e.preventDefault();
    if (e.code === 'Escape' || e.code === 'KeyP') {
        if      (state === S.PLAYING) pauseGame();
        else if (state === S.PAUSED)  resumeGame();
    }
    if (e.code === 'KeyM') AudioMgr.toggleMute();
    // Shield activation keys
    if (e.code === 'KeyE') activateShield(1);
    if (e.code === 'ShiftRight' || e.code === 'ShiftLeft') activateShield(2);
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

// ─── Shield activation (protection mode) ─────────────────────────────────────
function activateShield(playerId) {
    const p = players.find(pl => pl.id === playerId && pl.active);
    if (!p) return;
    // Only activate if no active power-up and shield cooldown is ready
    if (p.powerType || p.shieldCooldown > 0) return;
    p.shield = 2;
    p.shieldCooldown = 20; // 20s cooldown before next manual shield
    boom(p.x, p.y, '#4488ff', 8);
    SFX.powerUp();
    updatePowerHUD(p);
}

// ─── Mobile Touch Controls ────────────────────────────────────────────────────
(function initMobileControls() {
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isMobile) return;

    function handleDpad(e) {
        e.preventDefault();
        const dir = e.currentTarget.dataset.dir;
        if (dir) touchState[dir] = (e.type === 'touchstart' || e.type === 'touchmove');
    }

    function handleDpadEnd(e) {
        e.preventDefault();
        const dir = e.currentTarget.dataset.dir;
        if (dir) touchState[dir] = false;
    }

    document.querySelectorAll('.dpad-btn').forEach(btn => {
        btn.addEventListener('touchstart', handleDpad, { passive: false });
        btn.addEventListener('touchend', handleDpadEnd, { passive: false });
        btn.addEventListener('touchcancel', handleDpadEnd, { passive: false });
    });

    const fireBtn = document.getElementById('btn-fire');
    if (fireBtn) {
        fireBtn.addEventListener('touchstart', e => { e.preventDefault(); touchState.fire = true; }, { passive: false });
        fireBtn.addEventListener('touchend', e => { e.preventDefault(); touchState.fire = false; }, { passive: false });
        fireBtn.addEventListener('touchcancel', e => { e.preventDefault(); touchState.fire = false; }, { passive: false });
    }

    const shieldBtn = document.getElementById('btn-shield-mobile');
    if (shieldBtn) {
        shieldBtn.addEventListener('touchstart', e => {
            e.preventDefault();
            touchState.shield = true;
            activateShield(1);
        }, { passive: false });
        shieldBtn.addEventListener('touchend', e => { e.preventDefault(); touchState.shield = false; }, { passive: false });
        shieldBtn.addEventListener('touchcancel', e => { e.preventDefault(); touchState.shield = false; }, { passive: false });
    }
})();

// ─── État global ──────────────────────────────────────────────────────────────
let state         = S.MENU;
let lastTime      = performance.now();
let level         = 1;
let selectedLevel = 1;
let spawnTimer    = 0;
let isCoop        = false;

let players     = [];
let projectiles = [];
let enemies     = [];
let particles   = [];
let powerups    = [];   // ← bonus à ramasser
let boss        = null; // boss actuel (null si absent)
let levelTimer  = 0;    // temps écoulé dans le niveau courant (secondes)
let bossSpawned = false; // boss déjà apparu dans ce niveau

const LEVEL_DURATION = 300; // 5 minutes par niveau avant le boss

// ─── Étoiles parallaxe ────────────────────────────────────────────────────────
const STAR_LAYERS = [
    { n: 80, spd: 18,  sz: 1,   a: 0.35 },
    { n: 50, spd: 55,  sz: 1.5, a: 0.60 },
    { n: 22, spd: 115, sz: 2.5, a: 0.90 },
];
const stars = STAR_LAYERS.flatMap(l =>
    Array.from({ length: l.n }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        spd: l.spd * (0.8 + Math.random() * 0.4),
        sz: l.sz, a: l.a * (0.7 + Math.random() * 0.3),
    }))
);
function updateStars(dt) {
    for (const s of stars) { s.x -= s.spd * dt; if (s.x < 0) { s.x = W; s.y = Math.random() * H; } }
}
function drawBg() {
    ctx.fillStyle = '#020212'; ctx.fillRect(0, 0, W, H);
    for (const s of stars) { ctx.globalAlpha = s.a; ctx.fillStyle = '#fff'; ctx.fillRect(s.x, s.y, s.sz, s.sz); }
    ctx.globalAlpha = 1;
}

// ─── Entité de base ───────────────────────────────────────────────────────────
class Entity {
    constructor(x, y, w, h) { this.x = x; this.y = y; this.w = w; this.h = h; this.active = true; }
    get r() { return Math.min(this.w, this.h) * 0.38; }
    hits(o) { return Math.hypot(this.x - o.x, this.y - o.y) < this.r + o.r; }
}

// ─── Joueur ───────────────────────────────────────────────────────────────────
class Player extends Entity {
    constructor(x, y, col, ctrl, id) {
        super(x, y, 42, 24);
        this.col  = col;
        this.ctrl = ctrl;
        this.id   = id;
        this.spd  = 280;
        this.lives = 5;
        this.score = 0;
        this.cd        = 0;        // cooldown après tir
        this.invt      = 0;        // invincibilité après touche
        // ── Charge ─────────────────────────────────────────────────────────
        this.chargeTime = 0;       // durée du maintien du bouton tir
        this.wasShoot   = false;   // état bouton au frame précédent
        // ── Power-up actif ─────────────────────────────────────────────────
        this.powerType  = null;    // 'surchauffe' | 'triple' | 'bouclier'
        this.powerTime  = 0;       // secondes restantes
        this.dmgMult    = 1;       // multiplicateur de dégâts
        this.shield     = 0;       // bouclier : coups absorbés
        this.shieldCooldown = 0;   // cooldown for manual shield activation
    }

    update(dt) {
        if (!this.active) return;
        if (this.invt > 0) this.invt -= dt;
        if (this.cd   > 0) this.cd   -= dt;
        if (this.shieldCooldown > 0) this.shieldCooldown -= dt;

        // Déplacements (keyboard + touch for P1)
        const c = this.ctrl;
        const moveUp    = keys[c.up]    || (this.id === 1 && touchState.up);
        const moveDown  = keys[c.down]  || (this.id === 1 && touchState.down);
        const moveLeft  = keys[c.left]  || (this.id === 1 && touchState.left);
        const moveRight = keys[c.right] || (this.id === 1 && touchState.right);

        if (moveUp)    this.y -= this.spd * dt;
        if (moveDown)  this.y += this.spd * dt;
        if (moveLeft)  this.x -= this.spd * dt;
        if (moveRight) this.x += this.spd * dt;
        this.x = Math.max(this.w/2, Math.min(W * 0.58, this.x));
        this.y = Math.max(this.h/2, Math.min(H - this.h/2, this.y));

        // ── Logique de tir chargé ─────────────────────────────────────────
        const shooting = !!(keys[c.shoot] || (this.id === 1 && touchState.fire));
        if (shooting) {
            this.chargeTime = Math.min(this.chargeTime + dt, CHARGE_MAX);
        } else if (this.wasShoot && this.cd <= 0) {
            // Bouton relâché → tir selon la charge accumulée
            this._fireCharged();
            this.chargeTime = 0;
            this.cd = 0.1;
        }
        this.wasShoot = shooting;

        // ── Power-up timer ────────────────────────────────────────────────
        if (this.powerTime > 0) {
            this.powerTime -= dt;
            if (this.powerTime <= 0) { this._clearPower(); }
        }
    }

    _fireCharged() {
        const x = this.x + this.w / 2;
        const y = this.y;
        const m = this.dmgMult;

        if (this.chargeTime >= CHARGE_FULL) {
            // ═══ PLASMA (tir pleine charge) : gros, pénétrant ═══
            projectiles.push(new Shot(x, y, 640, 0, '#ff4400', true, this.id, 6 * m, true));
            boom(x, y, '#ff8800', 8);
            SFX.shoot('plasma');
        } else if (this.chargeTime >= CHARGE_MED) {
            // ═══ TIR MOYEN ═══
            projectiles.push(new Shot(x, y, 630, 0, '#ffaa00', true, this.id, 3 * m, false));
            SFX.shoot('medium');
        } else {
            // ═══ TIR NORMAL (tap rapide) ═══
            if (this.powerType === 'triple') {
                // Triple shot : 3 projectiles en éventail
                projectiles.push(new Shot(x, y, 630, -65, this.col, true, this.id, 1 * m));
                projectiles.push(new Shot(x, y, 640,   0, this.col, true, this.id, 1 * m));
                projectiles.push(new Shot(x, y, 630,  65, this.col, true, this.id, 1 * m));
            } else {
                projectiles.push(new Shot(x, y, 640, 0, this.col, true, this.id, 1 * m));
            }
            SFX.shoot('normal');
        }
    }

    applyPower(type) {
        this.powerType = type;
        switch (type) {
            case 'surchauffe': this.powerTime = 10; this.dmgMult = 2; break;
            case 'triple':     this.powerTime = 12; break;
            case 'bouclier':   this.shield = 3; this.powerTime = 30; break;
        }
        updatePowerHUD(this);
    }

    _clearPower() {
        this.powerType = null; this.powerTime = 0;
        this.dmgMult = 1;
        if (this.shield > 0) this.shield = 0; // bouclier expire aussi
        updatePowerHUD(this);
    }

    hit() {
        if (this.invt > 0) return;
        if (this.shield > 0) {
            // Le bouclier absorbe le coup
            this.shield--;
            this.invt = 0.5;
            boom(this.x, this.y, '#4488ff', 10);
            SFX.impact();
            if (this.shield <= 0) this._clearPower();
            else updatePowerHUD(this);
            return;
        }
        this.lives--;
        this.invt = 2.0;
        boom(this.x, this.y, this.col, 14);
        SFX.playerHit();
        updateHUD();
        if (this.lives <= 0) { this.active = false; boom(this.x, this.y, this.col, 35); }
    }

    draw() {
        if (!this.active) return;
        if (this.invt > 0 && Math.floor(this.invt * 10) % 2 === 0) return;

        const { x, y, w, h, col } = this;
        ctx.save();
        ctx.translate(x, y);

        // ── Aura de bouclier ──────────────────────────────────────────────
        if (this.shield > 0) {
            const pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.006);
            ctx.strokeStyle = `rgba(68,136,255,${pulse})`;
            ctx.lineWidth = 2;
            ctx.shadowBlur = 12; ctx.shadowColor = '#4488ff';
            ctx.beginPath(); ctx.arc(0, 0, w * 0.7, 0, Math.PI * 2); ctx.stroke();
        }

        // ── Flamme moteur ─────────────────────────────────────────────────
        const fLen = 8 + Math.random() * 7;
        const flameCol = this.powerType === 'surchauffe' ? '#ff4400' : '#ff8800';
        ctx.fillStyle = flameCol; ctx.shadowBlur = 14; ctx.shadowColor = flameCol;
        ctx.beginPath();
        ctx.moveTo(-w/2, -h/4); ctx.lineTo(-w/2 - fLen, 0); ctx.lineTo(-w/2, h/4);
        ctx.fill();

        // ── Coque ─────────────────────────────────────────────────────────
        const hullCol = this.powerType === 'surchauffe'
            ? `hsl(30,100%,${50 + Math.sin(performance.now()*0.01)*10}%)`
            : col;
        ctx.fillStyle = hullCol; ctx.shadowBlur = 16; ctx.shadowColor = hullCol;
        ctx.beginPath();
        ctx.moveTo( w/2,   0); ctx.lineTo( w/6,  -h/2); ctx.lineTo(-w/3,  -h/2);
        ctx.lineTo(-w/2,  -h/5); ctx.lineTo(-w/2,   h/5);
        ctx.lineTo(-w/3,   h/2); ctx.lineTo( w/6,   h/2); ctx.closePath(); ctx.fill();

        ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(-w/4, -h/2, w/7, h);

        ctx.fillStyle = 'rgba(140,210,255,0.82)'; ctx.shadowBlur = 5; ctx.shadowColor = '#88ccff';
        ctx.beginPath(); ctx.ellipse(w/8, 0, w/5.5, h/4, 0, 0, Math.PI*2); ctx.fill();

        // ── Orbe de charge au nez du vaisseau ─────────────────────────────
        if (this.chargeTime > 0.05 && keys[this.ctrl.shoot]) {
            const ratio  = Math.min(this.chargeTime / CHARGE_MAX, 1);
            const radius = 4 + ratio * 18;
            const hue    = 60 - ratio * 60; // jaune → orange → rouge
            const pulse  = 0.7 + 0.3 * Math.sin(performance.now() * 0.02);
            ctx.shadowBlur = 20 * ratio; ctx.shadowColor = `hsl(${hue},100%,60%)`;
            ctx.fillStyle = `hsla(${hue},100%,60%,${0.6 + 0.4 * pulse})`;
            ctx.beginPath(); ctx.arc(w/2, 0, radius, 0, Math.PI * 2); ctx.fill();
        }

        ctx.restore();
    }
}

// ─── Projectile ───────────────────────────────────────────────────────────────
class Shot extends Entity {
    constructor(x, y, vx, vy, col, friendly, pid = null, damage = 1, piercing = false) {
        // Taille proportionnelle aux dégâts
        const bw = friendly ? Math.min(8 + damage * 4, 38) : 12;
        const bh = friendly ? Math.min(3 + damage,      8) : 4;
        super(x, y, bw, bh);
        this.vx = vx; this.vy = vy;
        this.col      = col;
        this.friendly = friendly;
        this.pid      = pid;
        this.damage   = damage;
        this.piercing = piercing;
    }

    update(dt) {
        this.x += this.vx * dt; this.y += this.vy * dt;
        if (this.x < -80 || this.x > W+80 || this.y < -80 || this.y > H+80) this.active = false;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.shadowBlur = this.piercing ? 18 : 9; ctx.shadowColor = this.col;
        ctx.fillStyle = this.col;

        if (this.piercing) {
            // Plasma : ellipse pulsante
            const pulse = 0.85 + 0.15 * Math.sin(performance.now() * 0.025);
            ctx.beginPath(); ctx.ellipse(0, 0, this.w/2 * pulse, this.h/2 * pulse, 0, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.shadowBlur = 5;
            ctx.beginPath(); ctx.ellipse(0, 0, this.w/4, this.h/4, 0, 0, Math.PI*2); ctx.fill();
        } else {
            ctx.fillRect(-this.w/2, -this.h/2, this.w, this.h);
            ctx.fillStyle = '#fff';
            ctx.fillRect(-this.w/2 + 2, -1, this.w - 4, 2);
        }
        ctx.restore();
    }
}

// ─── Missile à tête chercheuse ────────────────────────────────────────────────
class HomingShot extends Shot {
    constructor(x, y, col, target, spd) {
        const ang = Math.atan2(target.y - y, target.x - x);
        super(x, y, Math.cos(ang) * spd, Math.sin(ang) * spd, col, false);
        this.w = 14; this.h = 6;
        this.target     = target;
        this.homingTime = 2.8;  // poursuite pendant 2.8s puis trajectoire droite
        this.turnRate   = 2.8;  // rad/s de virage max
    }

    update(dt) {
        if (this.homingTime > 0 && this.target && this.target.active) {
            this.homingTime -= dt;
            const ang     = Math.atan2(this.target.y - this.y, this.target.x - this.x);
            const curAng  = Math.atan2(this.vy, this.vx);
            const diff    = Math.atan2(Math.sin(ang - curAng), Math.cos(ang - curAng));
            const turn    = Math.sign(diff) * Math.min(Math.abs(diff), this.turnRate * dt);
            const spd     = Math.hypot(this.vx, this.vy);
            const newAng  = curAng + turn;
            this.vx = Math.cos(newAng) * spd;
            this.vy = Math.sin(newAng) * spd;
        }
        super.update(dt);
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(Math.atan2(this.vy, this.vx));
        ctx.shadowBlur = 14; ctx.shadowColor = this.col;
        ctx.fillStyle = this.col;
        ctx.beginPath();
        ctx.moveTo( this.w / 2,  0);
        ctx.lineTo(-this.w / 2, -this.h / 2);
        ctx.lineTo(-this.w / 3,  0);
        ctx.lineTo(-this.w / 2,  this.h / 2);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.shadowBlur = 4;
        ctx.beginPath(); ctx.arc(this.w / 4, 0, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
}

// ─── Ennemis ──────────────────────────────────────────────────────────────────
const EDEFS = {
    scout:   { col: '#ff3333', maxHp: 1, val: 100, w: 26, h: 20, spd: 130, shoots: false, dropChance: 0.06 },
    fighter: { col: '#ff8800', maxHp: 3, val: 250, w: 32, h: 26, spd:  82, shoots: true,  dropChance: 0.35 },
    heavy:   { col: '#cc00ff', maxHp: 8, val: 600, w: 46, h: 38, spd:  50, shoots: true,  dropChance: 1.00 },
};

class Enemy extends Entity {
    constructor(x, y, type, speedBonus = 0) {
        const d = EDEFS[type];
        super(x, y, d.w, d.h);
        Object.assign(this, d);
        this.type  = type; this.hp = d.maxHp;
        this.vx    = -(d.spd + speedBonus + Math.random() * 30);
        this.vy    = (Math.random() - 0.5) * 70;
        this.phase = Math.random() * Math.PI * 2;
        this.scd   = 1.5 + Math.random() * 2;
    }

    update(dt) {
        this.x += this.vx * dt;
        if (this.type === 'fighter') {
            this.y += Math.sin(performance.now() * 0.0026 + this.phase) * 80 * dt;
        } else {
            this.y += this.vy * dt;
            if (this.y < this.h/2 || this.y > H-this.h/2) this.vy *= -1;
        }
        this.y = Math.max(this.h/2, Math.min(H-this.h/2, this.y));
        if (this.x < -80) this.active = false;
        if (this.shoots) { this.scd -= dt; if (this.scd <= 0) { this._shoot(); this.scd = 1.8 + Math.random() * 2.5; } }
    }

    _shoot() {
        const target = players.find(p => p.active);
        if (!target) return;
        const ang = Math.atan2(target.y - this.y, target.x - this.x);
        const spd = this.type === 'heavy' ? 185 : 240;
        projectiles.push(new Shot(this.x - this.w/2, this.y, Math.cos(ang)*spd, Math.sin(ang)*spd, '#ff0055', false));
    }

    draw() {
        const { x, y, w, h, col, hp, maxHp } = this;
        ctx.save(); ctx.translate(x, y);
        ctx.fillStyle = col; ctx.shadowBlur = 12; ctx.shadowColor = col;
        ctx.beginPath();
        ctx.moveTo(-w/2, 0); ctx.lineTo(-w/6,-h/2); ctx.lineTo(w/3,-h/2);
        ctx.lineTo(w/2,-h/5); ctx.lineTo(w/2,h/5); ctx.lineTo(w/3,h/2); ctx.lineTo(-w/6,h/2);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ff5500'; ctx.shadowColor = '#ff5500'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.ellipse(w/2, 0, 5, h/4, 0, 0, Math.PI*2); ctx.fill();
        if (maxHp > 1) {
            const bw = w * 0.9; ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(-bw/2, -h/2-9, bw, 4);
            ctx.fillStyle = hp > maxHp/2 ? '#33ff66' : '#ff4400';
            ctx.fillRect(-bw/2, -h/2-9, bw * (hp/maxHp), 4);
        }
        ctx.restore();
    }
}

// ─── Définitions des 10 Boss ──────────────────────────────────────────────────
// pattern: 'single' | 'double' | 'spread3' | 'spread5' | 'homing' |
//          'triple_lane' | 'burst8' | 'circle12' | 'omega'
const BOSS_DEFS = [
    // Niv 1 – SENTINEL : tir unique, lent
    { name:'SENTINEL',       col:'#ff5555', maxHp:  60, spd: 42, w: 80, h: 60, val:  5000, fireInterval:2.6, pattern:'single',      bulletSpd:170 },
    // Niv 2 – VIPER : double tir légèrement écarté
    { name:'VIPER',          col:'#ff8833', maxHp: 130, spd: 54, w: 88, h: 64, val:  9000, fireInterval:2.1, pattern:'double',      bulletSpd:190 },
    // Niv 3 – DREADNOUGHT : éventail 3 balles
    { name:'DREADNOUGHT',    col:'#ffcc00', maxHp: 220, spd: 62, w: 96, h: 70, val: 14000, fireInterval:1.8, pattern:'spread3',     bulletSpd:205 },
    // Niv 4 – PHANTOM : éventail 5 + téléportation verticale
    { name:'PHANTOM',        col:'#cc44ff', maxHp: 320, spd: 70, w:100, h: 72, val: 20000, fireInterval:1.55,pattern:'spread5',     bulletSpd:218, teleports:true },
    // Niv 5 – HYDRA : éventail 3 + invoque des chasseurs
    { name:'HYDRA',          col:'#00ccff', maxHp: 430, spd: 74, w:108, h: 78, val: 27000, fireInterval:1.35,pattern:'spread3',     bulletSpd:228, spawnsMinions:true },
    // Niv 6 – STORM : missiles à tête chercheuse
    { name:'STORM',          col:'#00ff88', maxHp: 560, spd: 82, w:112, h: 82, val: 36000, fireInterval:1.15,pattern:'homing',      bulletSpd:198 },
    // Niv 7 – COLOSSUS : 3 lignes de tir horizontales ciblées
    { name:'COLOSSUS',       col:'#ff2266', maxHp: 700, spd: 90, w:118, h: 86, val: 46000, fireInterval:0.9, pattern:'triple_lane', bulletSpd:248 },
    // Niv 8 – VOID REAPER : 8 balles radiales + tir ciblé + phase bouclier
    { name:'VOID REAPER',    col:'#bb00ff', maxHp: 860, spd: 98, w:124, h: 90, val: 60000, fireInterval:1.8, pattern:'burst8',      bulletSpd:222, hasShieldPhase:true },
    // Niv 9 – NEBULA TITAN : couronne de 12 balles rotative + ciblé
    { name:'NEBULA TITAN',   col:'#ff44aa', maxHp:1050, spd:110, w:132, h: 96, val: 78000, fireInterval:1.2, pattern:'circle12',    bulletSpd:238 },
    // Niv 10 – OMEGA DESTROYER : tout combiné + bouclier + renforts
    { name:'OMEGA DESTROYER',col:'#e8e8ff', maxHp:1400, spd:120, w:142, h:102, val:160000, fireInterval:0.65,pattern:'omega',       bulletSpd:258, hasShieldPhase:true, spawnsMinions:true },
];

class Boss extends Entity {
    constructor(lvl) {
        const d = BOSS_DEFS[lvl - 1];
        super(W + d.w, H / 2, d.w, d.h);
        Object.assign(this, d);
        this.hp          = d.maxHp;
        this.targetX     = W - d.w / 2 - 18;
        this.scd         = d.fireInterval;
        this.vy          = d.spd;
        this.phase       = 1;           // 1 ou 2
        this.shielded    = false;
        this.shieldTimer = 0;
        this.entering    = true;
        this.angle       = 0;           // rotation pour les patterns circulaires
        this.minionTimer = (d.spawnsMinions) ? 10 : Infinity;
        this.teleportTimer = (d.teleports)   ?  8 : Infinity;
    }

    update(dt) {
        this.angle += dt * 1.4;

        // Entrée en scène depuis la droite
        if (this.entering) {
            this.x -= 140 * dt;
            if (this.x <= this.targetX) { this.x = this.targetX; this.entering = false; }
            return;
        }

        // Transition phase 2 (à 50 % des PV)
        if (this.phase === 1 && this.hp <= this.maxHp * 0.5) {
            this.phase = 2;
            this.fireInterval = Math.max(0.28, this.fireInterval * 0.52);
            this.scd = this.fireInterval;
            boom(this.x, this.y, this.col, 35);
            if (this.hasShieldPhase) { this.shielded = true; this.shieldTimer = 4; }
        }

        // Phase bouclier temporaire
        if (this.shielded) {
            this.shieldTimer -= dt;
            if (this.shieldTimer <= 0) this.shielded = false;
        }

        // Mouvement vertical (rebond)
        this.y += this.vy * dt;
        if (this.y <= this.h / 2 || this.y >= H - this.h / 2) this.vy *= -1;
        this.y = Math.max(this.h / 2, Math.min(H - this.h / 2, this.y));

        // Téléportation (Phantom)
        if (this.teleports) {
            this.teleportTimer -= dt;
            if (this.teleportTimer <= 0) {
                boom(this.x, this.y, this.col, 14);
                this.y = 60 + Math.random() * (H - 120);
                boom(this.x, this.y, this.col, 14);
                this.teleportTimer = 4.5 + Math.random() * 4;
            }
        }

        // Invocation de renforts
        if (this.spawnsMinions) {
            this.minionTimer -= dt;
            if (this.minionTimer <= 0) {
                const n = this.phase === 2 ? 3 : 2;
                for (let i = 0; i < n; i++) {
                    enemies.push(new Enemy(W + 40, 60 + Math.random() * (H - 120), 'fighter', (level - 1) * 12));
                }
                this.minionTimer = this.phase === 2 ? 6 : 10;
            }
        }

        // Tir
        this.scd -= dt;
        if (this.scd <= 0 && !this.entering) {
            this._shoot();
            this.scd = this.fireInterval;
        }
    }

    _shoot() {
        const target = players.find(p => p.active);
        if (!target) return;
        const bx  = this.x - this.w / 2;
        const by  = this.y;
        const spd = this.bulletSpd * (this.phase === 2 ? 1.25 : 1);
        const col = this.col;

        switch (this.pattern) {
            case 'single': {
                const a = Math.atan2(target.y - by, target.x - bx);
                projectiles.push(new Shot(bx, by, Math.cos(a)*spd, Math.sin(a)*spd, col, false));
                break;
            }
            case 'double': {
                const a = Math.atan2(target.y - by, target.x - bx);
                [-0.18, 0.18].forEach(off =>
                    projectiles.push(new Shot(bx, by, Math.cos(a+off)*spd, Math.sin(a+off)*spd, col, false)));
                break;
            }
            case 'spread3': {
                const a = Math.atan2(target.y - by, target.x - bx);
                [-0.35, 0, 0.35].forEach(off =>
                    projectiles.push(new Shot(bx, by, Math.cos(a+off)*spd, Math.sin(a+off)*spd, col, false)));
                break;
            }
            case 'spread5': {
                const a = Math.atan2(target.y - by, target.x - bx);
                [-0.5, -0.25, 0, 0.25, 0.5].forEach(off =>
                    projectiles.push(new Shot(bx, by, Math.cos(a+off)*spd, Math.sin(a+off)*spd, col, false)));
                break;
            }
            case 'homing': {
                const count = this.phase === 2 ? 2 : 1;
                for (let i = 0; i < count; i++)
                    projectiles.push(new HomingShot(bx, by - (i - (count-1)/2) * 24, col, target, spd));
                break;
            }
            case 'triple_lane': {
                [H * 0.22, H * 0.5, H * 0.78].forEach(ty => {
                    const a = Math.atan2(ty - by, target.x - bx);
                    projectiles.push(new Shot(bx, by, Math.cos(a)*spd, Math.sin(a)*spd, col, false));
                });
                break;
            }
            case 'burst8': {
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * Math.PI * 2;
                    projectiles.push(new Shot(bx, by, Math.cos(a)*spd*0.72, Math.sin(a)*spd*0.72, col, false));
                }
                const a = Math.atan2(target.y - by, target.x - bx);
                projectiles.push(new Shot(bx, by, Math.cos(a)*spd, Math.sin(a)*spd, col, false));
                break;
            }
            case 'circle12': {
                for (let i = 0; i < 12; i++) {
                    const a = (i / 12) * Math.PI * 2 + this.angle;
                    projectiles.push(new Shot(bx, by, Math.cos(a)*spd*0.78, Math.sin(a)*spd*0.78, col, false));
                }
                const aimed = Math.atan2(target.y - by, target.x - bx);
                projectiles.push(new Shot(bx, by, Math.cos(aimed)*spd, Math.sin(aimed)*spd, col, false));
                break;
            }
            case 'omega': {
                // Couronne de 8 balles
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * Math.PI * 2 + this.angle;
                    projectiles.push(new Shot(bx, by, Math.cos(a)*spd*0.7, Math.sin(a)*spd*0.7, col, false));
                }
                // Éventail de 3 balles ciblées
                const aimed = Math.atan2(target.y - by, target.x - bx);
                [-0.28, 0, 0.28].forEach(off =>
                    projectiles.push(new Shot(bx, by, Math.cos(aimed+off)*spd, Math.sin(aimed+off)*spd, col, false)));
                // Missile à tête chercheuse
                projectiles.push(new HomingShot(bx, by, '#ff0088', target, spd * 0.88));
                break;
            }
        }
    }

    draw() {
        if (!this.active) return;
        const { x, y, w, h, col, phase } = this;
        ctx.save();
        ctx.translate(x, y);

        // Aura du bouclier temporaire
        if (this.shielded) {
            const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.009);
            ctx.strokeStyle = `rgba(200,80,255,${pulse})`;
            ctx.lineWidth = 7;
            ctx.shadowBlur = 35; ctx.shadowColor = '#cc44ff';
            ctx.beginPath(); ctx.arc(0, 0, w * 0.68, 0, Math.PI * 2); ctx.stroke();
        }

        ctx.shadowBlur  = phase === 2 ? 44 : 24;
        ctx.shadowColor = col;

        // Coque principale (vaisseau orienté vers la gauche)
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo( w/2,   0);
        ctx.lineTo( w/5,  -h/2);
        ctx.lineTo(-w/3,  -h/2);
        ctx.lineTo(-w/2,  -h/4);
        ctx.lineTo(-w/2 + 10, 0);
        ctx.lineTo(-w/2,   h/4);
        ctx.lineTo(-w/3,   h/2);
        ctx.lineTo( w/5,   h/2);
        ctx.closePath(); ctx.fill();

        // Détail sombre central
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.moveTo(-w/6, -h/3); ctx.lineTo(w/4, 0); ctx.lineTo(-w/6, h/3);
        ctx.closePath(); ctx.fill();

        // Canon avant
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.shadowBlur = 10; ctx.shadowColor = col;
        ctx.fillRect(w/4, -5, w/4, 10);

        // Flammes moteur
        const fLen = 14 + Math.random() * 12;
        ctx.fillStyle = phase === 2 ? '#ff2200' : '#ff8800';
        ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.moveTo(-w/2 + 10, -h/5); ctx.lineTo(-w/2 + 10 - fLen, 0); ctx.lineTo(-w/2 + 10, h/5);
        ctx.fill();

        // Flammes supplémentaires en phase 2
        if (phase === 2) {
            const f2 = 8 + Math.random() * 8;
            ctx.fillStyle = '#ff4400'; ctx.shadowColor = '#ff4400';
            ctx.beginPath();
            ctx.moveTo(-w/3, -h/2 + 8); ctx.lineTo(-w/3 - f2, -h/2 + 8); ctx.lineTo(-w/3, -h/2 + 18);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(-w/3, h/2 - 8); ctx.lineTo(-w/3 - f2, h/2 - 8); ctx.lineTo(-w/3, h/2 - 18);
            ctx.fill();
        }

        ctx.restore();
    }
}

// ─── Power-Up ─────────────────────────────────────────────────────────────────
const PU_DEFS = {
    surchauffe: { col: '#ff8800', label: '🔥', desc: 'SURCHAUFFE' },
    triple:     { col: '#00ccff', label: '⚡', desc: 'TRIPLE TIR' },
    bouclier:   { col: '#4488ff', label: '🛡', desc: 'BOUCLIER'   },
};
const PU_TYPES = Object.keys(PU_DEFS);

class PowerUp extends Entity {
    constructor(x, y) {
        super(x, y, 22, 22);
        this.type    = PU_TYPES[Math.floor(Math.random() * PU_TYPES.length)];
        this.col     = PU_DEFS[this.type].col;
        this.label   = PU_DEFS[this.type].label;
        this.vx      = -55 - Math.random() * 20;
        this.vy      = (Math.random() - 0.5) * 25;
        this.age     = 0;
        this.lifetime = 12; // disparaît après 12s
    }

    update(dt) {
        this.x  += this.vx * dt;
        this.y  += this.vy * dt;
        this.age += dt;
        if (this.y < this.h/2 || this.y > H-this.h/2) this.vy *= -1;
        // Clignote et disparaît après lifetime - 2s
        if (this.age > this.lifetime || this.x < -40) this.active = false;
    }

    draw() {
        const blink = this.age > this.lifetime - 2 && Math.floor(this.age * 8) % 2 === 0;
        if (blink) return;

        const pulse = 0.8 + 0.2 * Math.sin(performance.now() * 0.007);
        ctx.save();
        ctx.translate(this.x, this.y);

        // Hexagone animé
        ctx.fillStyle = this.col;
        ctx.shadowBlur = 16 * pulse; ctx.shadowColor = this.col;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
            i === 0 ? ctx.moveTo(Math.cos(a)*11, Math.sin(a)*11)
                    : ctx.lineTo(Math.cos(a)*11, Math.sin(a)*11);
        }
        ctx.closePath(); ctx.fill();

        // Icône
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
        ctx.font = '12px serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(this.label, 0, 0);

        ctx.restore();
    }
}

// ─── Particules ───────────────────────────────────────────────────────────────
class Particle {
    constructor(x, y, col) {
        this.x = x; this.y = y;
        const ang = Math.random() * Math.PI * 2, spd = 40 + Math.random() * 230;
        this.vx = Math.cos(ang)*spd; this.vy = Math.sin(ang)*spd;
        this.col = col; this.life = 1; this.sz = 2 + Math.random() * 4; this.active = true;
    }
    update(dt) {
        this.x += this.vx*dt; this.y += this.vy*dt;
        this.vx *= 0.93; this.vy *= 0.93;
        this.life -= dt * 2.2; if (this.life <= 0) this.active = false;
    }
    draw() {
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.col; ctx.shadowBlur = 5; ctx.shadowColor = this.col;
        ctx.fillRect(this.x-this.sz/2, this.y-this.sz/2, this.sz, this.sz);
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }
}

function boom(x, y, col, n) {
    for (let i = 0; i < n; i++) particles.push(new Particle(x, y, col));
    for (let i = 0; i < Math.ceil(n/3); i++) particles.push(new Particle(x, y, '#fff'));
}

// ─── DOM ──────────────────────────────────────────────────────────────────────
const menuEl       = document.getElementById('main-menu');
const overEl       = document.getElementById('game-over');
const victoryEl    = document.getElementById('victory');
const pauseEl      = document.getElementById('pause-menu');
const hudEl        = document.getElementById('hud');
const p2Stats      = document.getElementById('p2-stats');
const levelEl      = document.getElementById('level-display');
const p1ScEl       = document.getElementById('p1-score');
const p2ScEl       = document.getElementById('p2-score');
const p1LvEl       = document.getElementById('p1-lives');
const p2LvEl       = document.getElementById('p2-lives');
const finalScEl    = document.getElementById('final-score');
const victorySc    = document.getElementById('victory-score');
const lvlNumEl     = document.getElementById('level-select-num');
const pauseInfo    = document.getElementById('pause-info');
const btnToggle    = document.getElementById('btn-toggle-mode');
const bossBarEl    = document.getElementById('boss-bar-container');
const bossNameEl   = document.getElementById('boss-name-display');
const bossHpInner  = document.getElementById('boss-hp-inner');

function updateHUD() {
    players.forEach(p => {
        (p.id===1 ? p1ScEl : p2ScEl).innerText = String(p.score).padStart(6,'0');
        (p.id===1 ? p1LvEl : p2LvEl).innerText = '♥'.repeat(Math.max(0,p.lives)) || '☠';
        updatePowerHUD(p);
    });
}

function updatePowerHUD(p) {
    const el = document.getElementById(`p${p.id}-power`);
    if (!el) return;
    if (p.powerType && p.powerTime > 0) {
        const d = PU_DEFS[p.powerType];
        el.innerText = `${d.label} ${d.desc} ${Math.ceil(p.powerTime)}s`;
        el.style.color = d.col;
    } else if (p.shield > 0) {
        el.innerText = `🛡 x${p.shield}`;
        el.style.color = '#4488ff';
    } else if (p.shieldCooldown > 0) {
        el.innerText = `🛡 ${Math.ceil(p.shieldCooldown)}s`;
        el.style.color = '#555';
    } else {
        el.innerText = '';
    }
}

function updateToggleBtn() {
    const has2 = players.some(p => p.id === 2);
    btnToggle.textContent = has2 ? '👤 PASSER EN 1 JOUEUR' : '👥 PASSER EN 2 JOUEURS';
}

function updateBossHUD() {
    if (boss && boss.active && !boss.entering) {
        bossNameEl.innerText = boss.name;
        const ratio = Math.max(0, boss.hp / boss.maxHp);
        bossHpInner.style.width = (ratio * 100) + '%';
        const hpCol = ratio > 0.5 ? '#33ff66' : ratio > 0.25 ? '#ffaa00' : '#ff3333';
        bossHpInner.style.background = hpCol;
        bossHpInner.style.boxShadow  = `0 0 8px ${hpCol}`;
        bossBarEl.classList.remove('hidden');
    } else {
        bossBarEl.classList.add('hidden');
    }
}

// ─── Boss : spawn / mort / progression de niveau ──────────────────────────────
function _showCentreToast(text, col, dur) {
    let t = document.getElementById('centre-toast');
    if (!t) {
        t = document.createElement('div'); t.id = 'centre-toast';
        t.style.cssText = `position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
            background:rgba(0,0,0,.92);border:2px solid currentColor;
            font-family:'Press Start 2P',monospace;font-size:14px;letter-spacing:2px;
            padding:14px 24px;z-index:25;pointer-events:none;text-align:center;
            transition:opacity .4s;`;
        document.getElementById('game-container').appendChild(t);
    }
    t.style.color = col; t.style.borderColor = col;
    t.style.textShadow = `0 0 10px ${col}`;
    t.innerText = text; t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.opacity = '0'; }, dur);
}

function spawnBoss() {
    if (bossSpawned) return;
    bossSpawned = true;
    enemies = []; // on vide les ennemis courants
    boss = new Boss(level);
    _showCentreToast(`⚠ ${BOSS_DEFS[level-1].name} ⚠`, '#ff3333', 3000);
    SFX.playerHit(); // son d'alerte
}

function onBossDied() {
    const totalScore = players.reduce((s, p) => s + p.score, 0);
    boom(boss.x, boss.y, boss.col, 80);
    boom(boss.x, boss.y, '#fff', 30);
    SFX.enemyDestroyed();
    boss = null;
    updateBossHUD();

    if (level >= 10) {
        setTimeout(triggerVictory, 1800);
    } else {
        _showCentreToast(`✦ NIVEAU ${level} TERMINÉ ✦`, '#00ff88', 2800);
        setTimeout(() => {
            level++;
            levelTimer  = 0;
            bossSpawned = false;
            enemies     = [];
            levelEl.innerText = `LEVEL ${level}`;
            AudioMgr.play(level <= 5 ? 'galactic' : 'raid');
        }, 2800);
    }
}

function triggerVictory() {
    state = S.VICTORY;
    const total = players.reduce((s, p) => s + p.score, 0);
    victorySc.innerText = total.toLocaleString('fr-FR');
    hudEl.classList.add('hidden');
    victoryEl.classList.remove('hidden');
    AudioMgr.play('menu');
}

// ─── Pause / Reprise ──────────────────────────────────────────────────────────
function pauseGame() {
    state = S.PAUSED; AudioMgr.pause();
    const has2 = players.some(p => p.id === 2);
    pauseInfo.innerText = `NIVEAU ${level} · ${has2 ? '2 JOUEURS' : '1 JOUEUR'}`;
    updateToggleBtn(); pauseEl.classList.remove('hidden');
}

function resumeGame() {
    state = S.PLAYING; AudioMgr.resume();
    lastTime = performance.now(); pauseEl.classList.add('hidden');
}

// ─── Démarrage ────────────────────────────────────────────────────────────────
function startGame(coop) {
    isCoop = coop; level = selectedLevel;
    players = [
        new Player(80, coop ? H/3 : H/2, '#00ffaa',
            { up:'KeyW', down:'KeyS', left:'KeyA', right:'KeyD', shoot:'Space' }, 1)
    ];
    if (coop) players.push(
        new Player(80, H*2/3, '#ff00aa',
            { up:'ArrowUp', down:'ArrowDown', left:'ArrowLeft', right:'ArrowRight', shoot:'Enter' }, 2)
    );
    projectiles = []; enemies = []; particles = []; powerups = [];
    boss = null; levelTimer = 0; bossSpawned = false;
    spawnTimer = 0;
    menuEl.classList.add('hidden'); overEl.classList.add('hidden');
    pauseEl.classList.add('hidden'); victoryEl.classList.add('hidden');
    hudEl.classList.remove('hidden');
    p2Stats.style.display = coop ? '' : 'none';
    levelEl.innerText = `LEVEL ${level}`;
    updateHUD();
    AudioMgr.play(AudioMgr.gameTrack());
    state = S.PLAYING; lastTime = performance.now();
}

function goToMenu() {
    state = S.MENU;
    players = []; enemies = []; projectiles = []; particles = []; powerups = [];
    boss = null; levelTimer = 0; bossSpawned = false;
    hudEl.classList.add('hidden'); pauseEl.classList.add('hidden');
    overEl.classList.add('hidden'); victoryEl.classList.add('hidden');
    menuEl.classList.remove('hidden');
    bossBarEl.classList.add('hidden');
    AudioMgr.play('menu');
}

function triggerGameOver() {
    state = S.OVER;
    boss = null; bossBarEl.classList.add('hidden');
    finalScEl.innerText = players.reduce((s,p)=>s+p.score,0).toLocaleString('fr-FR');
    hudEl.classList.add('hidden'); overEl.classList.remove('hidden');
    AudioMgr.play('menu');
}

// ─── Collisions ───────────────────────────────────────────────────────────────
function collide() {
    // Tirs joueurs → ennemis
    for (const proj of projectiles) {
        if (!proj.active || !proj.friendly) continue;
        for (const e of enemies) {
            if (!e.active) continue;
            if (proj.hits(e)) {
                boom(proj.x, proj.y, proj.col, proj.damage > 1 ? 8 : 4);
                if (!proj.piercing) proj.active = false;
                e.hp -= proj.damage;
                if (e.hp <= 0) {
                    e.active = false;
                    boom(e.x, e.y, e.col, 22);
                    SFX.enemyDestroyed();
                    const shooter = players.find(p => p.id === proj.pid);
                    if (shooter) { shooter.score += e.val; updateHUD(); }
                    // Drop power-up selon la chance
                    if (Math.random() < e.dropChance)
                        powerups.push(new PowerUp(e.x, e.y));
                } else {
                    SFX.impact();
                }
                if (!proj.active) break;
            }
        }

        // Tirs joueurs → boss
        if (proj.active && boss && boss.active && !boss.entering && !boss.shielded) {
            if (proj.hits(boss)) {
                boom(proj.x, proj.y, proj.col, proj.damage > 1 ? 10 : 5);
                if (!proj.piercing) proj.active = false;
                boss.hp -= proj.damage;
                updateBossHUD();
                if (boss.hp <= 0) {
                    boss.active = false;
                    const shooter = players.find(p => p.id === proj.pid);
                    if (shooter) { shooter.score += boss.val; updateHUD(); }
                    onBossDied();
                } else {
                    SFX.impact();
                }
            }
        }
    }

    // Tirs / corps ennemis → joueurs
    for (const player of players) {
        if (!player.active || player.invt > 0) continue;
        for (const proj of projectiles) {
            if (!proj.active || proj.friendly) continue;
            if (proj.hits(player)) { proj.active = false; player.hit(); }
        }
        for (const e of enemies) {
            if (!e.active) continue;
            if (e.hits(player)) { e.active = false; boom(e.x,e.y,e.col,18); player.hit(); }
        }
        // Corps du boss → joueur
        if (boss && boss.active && !boss.entering && boss.hits(player)) { player.hit(); }
        // Collecte de power-up
        for (const pu of powerups) {
            if (!pu.active) continue;
            if (pu.hits(player)) { pu.active = false; player.applyPower(pu.type); showPowerToast(pu); SFX.powerUp(); }
        }
    }

    if (players.every(p => !p.active)) triggerGameOver();
}

function showPowerToast(pu) {
    let t = document.getElementById('power-toast');
    if (!t) {
        t = document.createElement('div'); t.id = 'power-toast';
        t.style.cssText = `position:absolute;top:60px;left:50%;transform:translateX(-50%);
            background:rgba(0,0,0,.8);border:1px solid currentColor;
            font-family:'Press Start 2P',monospace;font-size:11px;
            padding:8px 16px;z-index:20;pointer-events:none;letter-spacing:1px;transition:opacity .4s;`;
        document.getElementById('game-container').appendChild(t);
    }
    const d = PU_DEFS[pu.type];
    t.style.color = d.col; t.style.borderColor = d.col;
    t.innerText = `${d.label} ${d.desc} !`;
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.opacity = '0'; }, 2000);
}

// ─── Spawn ennemis depuis la DROITE ───────────────────────────────────────────
function spawnEnemies(dt) {
    if (boss) return; // pas de spawn normal pendant le combat de boss
    spawnTimer -= dt; if (spawnTimer > 0) return;
    const y = 40 + Math.random() * (H - 80), r = Math.random();
    const heavyCut = Math.max(0.75, 0.95 - level*0.025);
    const fightCut = Math.max(0.45, 0.72 - level*0.02);
    const type = r > heavyCut ? 'heavy' : r > fightCut ? 'fighter' : 'scout';
    const speedBonus = (level-1) * 12;
    enemies.push(new Enemy(W+40, y, type, speedBonus));
    const base = Math.max(0.35, 0.88 - (level-1)*0.05);
    spawnTimer = type==='scout' ? base : type==='fighter' ? base*2 : base*4.2;
}

// ─── Boucle principale ────────────────────────────────────────────────────────
function update(dt) {
    if (state === S.PLAYING) {
        updateStars(dt);
        players.forEach(p => p.update(dt));
        projectiles.forEach(p => p.update(dt));
        enemies.forEach(e => e.update(dt));
        particles.forEach(p => p.update(dt));
        powerups.forEach(pu => pu.update(dt));

        // Mise à jour du boss
        if (boss) {
            boss.update(dt);
            if (!boss.active) boss = null;
        }
        updateBossHUD();

        collide();
        spawnEnemies(dt);

        // Chronomètre de niveau : lance le boss après LEVEL_DURATION secondes
        if (!bossSpawned) {
            levelTimer += dt;
            if (levelTimer >= LEVEL_DURATION) spawnBoss();
        }

        projectiles = projectiles.filter(p => p.active);
        enemies     = enemies.filter(e => e.active);
        particles   = particles.filter(p => p.active);
        powerups    = powerups.filter(pu => pu.active);
    } else if (state !== S.PAUSED) {
        updateStars(dt);
    }
}

function draw() {
    drawBg();
    if (state === S.PLAYING || state === S.PAUSED) {
        particles.forEach(p => p.draw());
        powerups.forEach(pu => pu.draw());
        projectiles.forEach(p => p.draw());
        enemies.forEach(e => e.draw());
        if (boss) boss.draw();
        players.forEach(p => p.draw());
    }
}

function loop(ts) {
    const dt = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts; update(dt); draw();
    requestAnimationFrame(loop);
}

// ─── Boutons ──────────────────────────────────────────────────────────────────
document.getElementById('btn-lvl-down').addEventListener('click', () => { selectedLevel = Math.max(1,  selectedLevel-1); lvlNumEl.innerText = selectedLevel; });
document.getElementById('btn-lvl-up'  ).addEventListener('click', () => { selectedLevel = Math.min(10, selectedLevel+1); lvlNumEl.innerText = selectedLevel; });
document.getElementById('btn-start'   ).addEventListener('click', () => startGame(false));
document.getElementById('btn-coop'    ).addEventListener('click', () => startGame(true));
document.getElementById('btn-resume'  ).addEventListener('click', resumeGame);

document.getElementById('btn-toggle-mode').addEventListener('click', () => {
    const idx = players.findIndex(p => p.id === 2);
    if (idx >= 0) { players.splice(idx,1); isCoop=false; p2Stats.style.display='none'; }
    else {
        const p2 = new Player(80, H*2/3, '#ff00aa',
            { up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight',shoot:'Enter' }, 2);
        players.push(p2); isCoop=true; p2Stats.style.display=''; updateHUD();
    }
    const has2 = players.some(p=>p.id===2);
    pauseInfo.innerText = `NIVEAU ${level} · ${has2?'2 JOUEURS':'1 JOUEUR'}`;
    updateToggleBtn();
});

document.getElementById('btn-restart-pause').addEventListener('click', () => startGame(isCoop));
document.getElementById('btn-to-menu'      ).addEventListener('click', goToMenu);
document.getElementById('btn-restart'      ).addEventListener('click', () => startGame(isCoop));
document.getElementById('btn-victory-menu' ).addEventListener('click', goToMenu);

requestAnimationFrame(loop);
