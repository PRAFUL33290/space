'use strict';

// ─── Constantes ───────────────────────────────────────────────────────────────
const W = 800, H = 600;
const S = { MENU: 0, PLAYING: 1, PAUSED: 2, OVER: 3 };

// ─── Canvas ───────────────────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

// ─── Inputs ───────────────────────────────────────────────────────────────────
const keys = {};
document.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter'].includes(e.code))
        e.preventDefault();
    if (e.code === 'Escape' || e.code === 'KeyP') {
        if      (state === S.PLAYING) pauseGame();
        else if (state === S.PAUSED)  resumeGame();
    }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

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

// ─── Étoiles parallaxe (3 couches) ───────────────────────────────────────────
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
    for (const s of stars) {
        s.x -= s.spd * dt;
        if (s.x < 0) { s.x = W; s.y = Math.random() * H; }
    }
}

function drawBg() {
    ctx.fillStyle = '#020212';
    ctx.fillRect(0, 0, W, H);
    for (const s of stars) {
        ctx.globalAlpha = s.a;
        ctx.fillStyle = '#fff';
        ctx.fillRect(s.x, s.y, s.sz, s.sz);
    }
    ctx.globalAlpha = 1;
}

// ─── Entité de base ───────────────────────────────────────────────────────────
class Entity {
    constructor(x, y, w, h) {
        this.x = x; this.y = y; this.w = w; this.h = h; this.active = true;
    }
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
        this.cd   = 0;
        this.rate  = 0.12;
        this.invt  = 0; // secondes d'invincibilité
    }

    update(dt) {
        if (!this.active) return;
        if (this.invt > 0) this.invt -= dt;

        const c = this.ctrl;
        if (keys[c.up])    this.y -= this.spd * dt;
        if (keys[c.down])  this.y += this.spd * dt;
        if (keys[c.left])  this.x -= this.spd * dt;
        if (keys[c.right]) this.x += this.spd * dt;

        // Le joueur reste dans la zone gauche (58 % de l'écran)
        this.x = Math.max(this.w / 2, Math.min(W * 0.58, this.x));
        this.y = Math.max(this.h / 2, Math.min(H - this.h / 2, this.y));

        this.cd -= dt;
        if (keys[c.shoot] && this.cd <= 0) {
            // Tir vers la DROITE (vx positif)
            projectiles.push(new Shot(this.x + this.w / 2, this.y, 620, 0, this.col, true, this.id));
            this.cd = this.rate;
        }
    }

    hit() {
        if (this.invt > 0) return;
        this.lives--;
        this.invt = 2.0;
        boom(this.x, this.y, this.col, 14);
        updateHUD();
        if (this.lives <= 0) {
            this.active = false;
            boom(this.x, this.y, this.col, 35);
        }
    }

    draw() {
        if (!this.active) return;
        if (this.invt > 0 && Math.floor(this.invt * 10) % 2 === 0) return;

        const { x, y, w, h, col } = this;
        ctx.save();
        ctx.translate(x, y);

        // Flamme moteur (côté gauche = arrière)
        const fLen = 8 + Math.random() * 7;
        ctx.fillStyle = `hsl(${25 + Math.random() * 20},100%,60%)`;
        ctx.shadowBlur = 14; ctx.shadowColor = '#ff7700';
        ctx.beginPath();
        ctx.moveTo(-w/2, -h/4); ctx.lineTo(-w/2 - fLen, 0); ctx.lineTo(-w/2, h/4);
        ctx.fill();

        // Coque — vaisseau pointant vers la DROITE
        ctx.fillStyle = col;
        ctx.shadowBlur = 16; ctx.shadowColor = col;
        ctx.beginPath();
        ctx.moveTo( w/2,   0);
        ctx.lineTo( w/6,  -h/2);
        ctx.lineTo(-w/3,  -h/2);
        ctx.lineTo(-w/2,  -h/5);
        ctx.lineTo(-w/2,   h/5);
        ctx.lineTo(-w/3,   h/2);
        ctx.lineTo( w/6,   h/2);
        ctx.closePath();
        ctx.fill();

        // Bande décorative
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(-w/4, -h/2, w/7, h);

        // Cockpit
        ctx.fillStyle = 'rgba(140,210,255,0.82)';
        ctx.shadowBlur = 5; ctx.shadowColor = '#88ccff';
        ctx.beginPath();
        ctx.ellipse(w/8, 0, w/5.5, h/4, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

// ─── Projectile ───────────────────────────────────────────────────────────────
class Shot extends Entity {
    constructor(x, y, vx, vy, col, friendly, pid = null) {
        super(x, y, friendly ? 18 : 12, 4);
        this.vx = vx; this.vy = vy;
        this.col = col; this.friendly = friendly; this.pid = pid;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        if (this.x < -80 || this.x > W + 80 || this.y < -80 || this.y > H + 80)
            this.active = false;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.shadowBlur = 9; ctx.shadowColor = this.col;
        ctx.fillStyle = this.col;
        ctx.fillRect(-this.w/2, -this.h/2, this.w, this.h);
        ctx.fillStyle = '#fff';
        ctx.fillRect(-this.w/2 + 2, -1, this.w - 4, 2);
        ctx.restore();
    }
}

// ─── Ennemis ──────────────────────────────────────────────────────────────────
const EDEFS = {
    scout:   { col: '#ff3333', maxHp: 1, val: 100, w: 26, h: 20, spd: 130, shoots: false },
    fighter: { col: '#ff8800', maxHp: 3, val: 250, w: 32, h: 26, spd:  82, shoots: true  },
    heavy:   { col: '#cc00ff', maxHp: 8, val: 600, w: 46, h: 38, spd:  50, shoots: true  },
};

class Enemy extends Entity {
    constructor(x, y, type, speedBonus = 0) {
        const d = EDEFS[type];
        super(x, y, d.w, d.h);
        Object.assign(this, d);
        this.type  = type;
        this.hp    = d.maxHp;
        // Vitesse négative → se déplace vers la GAUCHE
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
            if (this.y < this.h/2 || this.y > H - this.h/2) this.vy *= -1;
        }
        this.y = Math.max(this.h/2, Math.min(H - this.h/2, this.y));

        // Sort par le côté gauche → inactif
        if (this.x < -80) this.active = false;

        if (this.shoots) {
            this.scd -= dt;
            if (this.scd <= 0) { this._shoot(); this.scd = 1.8 + Math.random() * 2.5; }
        }
    }

    _shoot() {
        const target = players.find(p => p.active);
        if (!target) return;
        const ang = Math.atan2(target.y - this.y, target.x - this.x);
        const spd = this.type === 'heavy' ? 185 : 240;
        projectiles.push(new Shot(this.x - this.w/2, this.y,
            Math.cos(ang) * spd, Math.sin(ang) * spd, '#ff0055', false));
    }

    draw() {
        const { x, y, w, h, col, hp, maxHp } = this;
        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = col;
        ctx.shadowBlur = 12; ctx.shadowColor = col;

        // Coque — vaisseau ennemi pointant vers la GAUCHE
        ctx.beginPath();
        ctx.moveTo(-w/2,  0);
        ctx.lineTo(-w/6, -h/2);
        ctx.lineTo( w/3, -h/2);
        ctx.lineTo( w/2, -h/5);
        ctx.lineTo( w/2,  h/5);
        ctx.lineTo( w/3,  h/2);
        ctx.lineTo(-w/6,  h/2);
        ctx.closePath();
        ctx.fill();

        // Flamme moteur ennemi (côté droit = arrière)
        ctx.fillStyle = '#ff5500';
        ctx.shadowColor = '#ff5500'; ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.ellipse(w/2, 0, 5, h/4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Barre de vie pour les ennemis résistants
        if (maxHp > 1) {
            const bw = w * 0.9;
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(-bw/2, -h/2 - 9, bw, 4);
            ctx.fillStyle = hp > maxHp / 2 ? '#33ff66' : '#ff4400';
            ctx.fillRect(-bw/2, -h/2 - 9, bw * (hp / maxHp), 4);
        }
        ctx.restore();
    }
}

// ─── Particules ───────────────────────────────────────────────────────────────
class Particle {
    constructor(x, y, col) {
        this.x = x; this.y = y;
        const ang = Math.random() * Math.PI * 2;
        const spd = 40 + Math.random() * 230;
        this.vx = Math.cos(ang) * spd; this.vy = Math.sin(ang) * spd;
        this.col = col; this.life = 1; this.sz = 2 + Math.random() * 4;
        this.active = true;
    }
    update(dt) {
        this.x += this.vx * dt; this.y += this.vy * dt;
        this.vx *= 0.93; this.vy *= 0.93;
        this.life -= dt * 2.2;
        if (this.life <= 0) this.active = false;
    }
    draw() {
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.col;
        ctx.shadowBlur = 5; ctx.shadowColor = this.col;
        ctx.fillRect(this.x - this.sz/2, this.y - this.sz/2, this.sz, this.sz);
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }
}

function boom(x, y, col, n) {
    for (let i = 0; i < n; i++) particles.push(new Particle(x, y, col));
    for (let i = 0; i < Math.ceil(n/3); i++) particles.push(new Particle(x, y, '#fff'));
}

// ─── DOM ──────────────────────────────────────────────────────────────────────
const menuEl    = document.getElementById('main-menu');
const overEl    = document.getElementById('game-over');
const pauseEl   = document.getElementById('pause-menu');
const hudEl     = document.getElementById('hud');
const p2Stats   = document.getElementById('p2-stats');
const levelEl   = document.getElementById('level-display');
const p1ScEl    = document.getElementById('p1-score');
const p2ScEl    = document.getElementById('p2-score');
const p1LvEl    = document.getElementById('p1-lives');
const p2LvEl    = document.getElementById('p2-lives');
const finalScEl = document.getElementById('final-score');
const lvlNumEl  = document.getElementById('level-select-num');
const pauseInfo = document.getElementById('pause-info');
const btnToggle = document.getElementById('btn-toggle-mode');

function updateHUD() {
    players.forEach(p => {
        (p.id === 1 ? p1ScEl : p2ScEl).innerText = String(p.score).padStart(6, '0');
        (p.id === 1 ? p1LvEl : p2LvEl).innerText = '♥'.repeat(Math.max(0, p.lives)) || '☠';
    });
}

function updateToggleBtn() {
    const has2 = players.some(p => p.id === 2);
    btnToggle.textContent = has2 ? '👤 PASSER EN 1 JOUEUR' : '👥 PASSER EN 2 JOUEURS';
}

// ─── Pause / Reprise ──────────────────────────────────────────────────────────
function pauseGame() {
    state = S.PAUSED;
    const has2 = players.some(p => p.id === 2);
    pauseInfo.innerText = `NIVEAU ${level} · ${has2 ? '2 JOUEURS' : '1 JOUEUR'}`;
    updateToggleBtn();
    pauseEl.classList.remove('hidden');
}

function resumeGame() {
    state = S.PLAYING;
    lastTime = performance.now(); // évite un saut de temps après la pause
    pauseEl.classList.add('hidden');
}

// ─── Démarrage ────────────────────────────────────────────────────────────────
function startGame(coop) {
    isCoop = coop;
    level  = selectedLevel;

    players = [
        new Player(80, coop ? H / 3 : H / 2, '#00ffaa',
            { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', shoot: 'Space' }, 1)
    ];
    if (coop) {
        players.push(
            new Player(80, H * 2 / 3, '#ff00aa',
                { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', shoot: 'Enter' }, 2)
        );
    }

    projectiles = []; enemies = []; particles = [];
    spawnTimer = 0;

    menuEl.classList.add('hidden');
    overEl.classList.add('hidden');
    pauseEl.classList.add('hidden');
    hudEl.classList.remove('hidden');
    p2Stats.style.display = coop ? '' : 'none';
    levelEl.innerText = `LEVEL ${level}`;

    updateHUD();
    state = S.PLAYING;
    lastTime = performance.now();
}

function goToMenu() {
    state = S.MENU;
    players = []; enemies = []; projectiles = []; particles = [];
    hudEl.classList.add('hidden');
    pauseEl.classList.add('hidden');
    overEl.classList.add('hidden');
    menuEl.classList.remove('hidden');
}

function triggerGameOver() {
    state = S.OVER;
    const total = players.reduce((s, p) => s + p.score, 0);
    finalScEl.innerText = total.toLocaleString('fr-FR');
    hudEl.classList.add('hidden');
    overEl.classList.remove('hidden');
}

// ─── Collisions ───────────────────────────────────────────────────────────────
function collide() {
    // Tirs joueurs → ennemis
    for (const proj of projectiles) {
        if (!proj.active || !proj.friendly) continue;
        for (const e of enemies) {
            if (!e.active || !proj.active) continue;
            if (proj.hits(e)) {
                proj.active = false;
                boom(proj.x, proj.y, proj.col, 5);
                e.hp--;
                if (e.hp <= 0) {
                    e.active = false;
                    boom(e.x, e.y, e.col, 22);
                    const shooter = players.find(p => p.id === proj.pid);
                    if (shooter) { shooter.score += e.val; updateHUD(); }
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
            if (e.hits(player)) { e.active = false; boom(e.x, e.y, e.col, 18); player.hit(); }
        }
    }
    if (players.every(p => !p.active)) triggerGameOver();
}

// ─── Apparition des ennemis depuis la DROITE ──────────────────────────────────
function spawnEnemies(dt) {
    spawnTimer -= dt;
    if (spawnTimer > 0) return;

    const y = 40 + Math.random() * (H - 80);
    const r = Math.random();

    // Les niveaux élevés augmentent la proportion d'ennemis lourds
    const heavyCut   = Math.max(0.75, 0.95 - level * 0.025);
    const fighterCut = Math.max(0.45, 0.72 - level * 0.02);
    const type = r > heavyCut ? 'heavy' : r > fighterCut ? 'fighter' : 'scout';

    // Vitesse croissante par niveau
    const speedBonus = (level - 1) * 12;
    enemies.push(new Enemy(W + 40, y, type, speedBonus));

    // Intervalle décroissant par niveau
    const base = Math.max(0.35, 0.88 - (level - 1) * 0.05);
    spawnTimer = type === 'scout' ? base : type === 'fighter' ? base * 2 : base * 4.2;
}

// ─── Boucle principale ────────────────────────────────────────────────────────
function update(dt) {
    if (state === S.PLAYING) {
        updateStars(dt);
        players.forEach(p => p.update(dt));
        projectiles.forEach(p => p.update(dt));
        enemies.forEach(e => e.update(dt));
        particles.forEach(p => p.update(dt));
        collide();
        spawnEnemies(dt);
        projectiles = projectiles.filter(p => p.active);
        enemies     = enemies.filter(e => e.active);
        particles   = particles.filter(p => p.active);
    } else if (state !== S.PAUSED) {
        // Menu et Game Over : fond étoilé animé
        updateStars(dt);
    }
    // PAUSED : rien ne bouge, jeu figé
}

function draw() {
    drawBg();
    // Dessine le jeu aussi en pause (derrière l'overlay semi-transparent)
    if (state === S.PLAYING || state === S.PAUSED) {
        particles.forEach(p => p.draw());
        projectiles.forEach(p => p.draw());
        enemies.forEach(e => e.draw());
        players.forEach(p => p.draw());
    }
}

function loop(ts) {
    const dt = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;
    update(dt);
    draw();
    requestAnimationFrame(loop);
}

// ─── Boutons ──────────────────────────────────────────────────────────────────

// Sélecteur de niveau (menu principal)
document.getElementById('btn-lvl-down').addEventListener('click', () => {
    selectedLevel = Math.max(1, selectedLevel - 1);
    lvlNumEl.innerText = selectedLevel;
});
document.getElementById('btn-lvl-up').addEventListener('click', () => {
    selectedLevel = Math.min(10, selectedLevel + 1);
    lvlNumEl.innerText = selectedLevel;
});

// Menu principal
document.getElementById('btn-start').addEventListener('click', () => startGame(false));
document.getElementById('btn-coop').addEventListener('click',  () => startGame(true));

// Pause
document.getElementById('btn-resume').addEventListener('click', resumeGame);

document.getElementById('btn-toggle-mode').addEventListener('click', () => {
    const idx = players.findIndex(p => p.id === 2);
    if (idx >= 0) {
        // Retirer P2
        players.splice(idx, 1);
        isCoop = false;
        p2Stats.style.display = 'none';
    } else {
        // Ajouter P2 à tout moment
        const p2 = new Player(80, H * 2 / 3, '#ff00aa',
            { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', shoot: 'Enter' }, 2);
        players.push(p2);
        isCoop = true;
        p2Stats.style.display = '';
        updateHUD();
    }
    const has2 = players.some(p => p.id === 2);
    pauseInfo.innerText = `NIVEAU ${level} · ${has2 ? '2 JOUEURS' : '1 JOUEUR'}`;
    updateToggleBtn();
});

document.getElementById('btn-restart-pause').addEventListener('click', () => startGame(isCoop));
document.getElementById('btn-to-menu').addEventListener('click', goToMenu);

// Game Over
document.getElementById('btn-restart').addEventListener('click', () => startGame(isCoop));

// Lancement
requestAnimationFrame(loop);
