// Fond 3D en WebGL natif (aucune librairie).
// Un seul nuage de particules se reforme au fil des sections :
// orbe IA -> maquette de site -> réseau de neurones -> onde -> anneau.
(() => {
    const canvas = document.getElementById('bg');
    if (!canvas) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    const lowPower = (navigator.deviceMemory && navigator.deviceMemory <= 2)
        || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
    const COUNT = lowPower ? 2800 : innerWidth < 768 ? 4200 : innerWidth < 1280 ? 7000 : 9000;

    const FOV = (35 * Math.PI) / 180;
    const TAN = Math.tan(FOV / 2);
    const CAM_Z = 6;
    const BG = [9 / 255, 9 / 255, 11 / 255];

    // Pages sans sections (merci, 404) : étape fixe, forme centrée
    const fixedStage = canvas.dataset.stage !== undefined ? Number(canvas.dataset.stage) : null;
    const stageEls = fixedStage === null ? [...document.querySelectorAll('[data-stage]')] : [];

    /* Outils ---------------------------------------------------------------- */

    const mulberry32 = (seed) => () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    let rand = mulberry32(20260927);
    const gauss = () => {
        let u = 0;
        while (!u) u = rand();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
    };
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const smooth = (t) => t * t * (3 - 2 * t);
    const rotX = (p, a) => {
        const c = Math.cos(a), s = Math.sin(a);
        return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
    };
    const rotY = (p, a) => {
        const c = Math.cos(a), s = Math.sin(a);
        return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
    };
    const rotZ = (p, a) => {
        const c = Math.cos(a), s = Math.sin(a);
        return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
    };

    // Chaque forme range ses points dans un ordre mélangé :
    // les particules changent de place entre deux formes, d'où l'effet de dispersion.
    const perms = [];
    const permFor = (k) => {
        if (!perms[k]) {
            const p = Array.from({ length: COUNT }, (_, i) => i);
            for (let i = COUNT - 1; i > 0; i--) {
                const j = Math.floor(rand() * (i + 1));
                [p[i], p[j]] = [p[j], p[i]];
            }
            perms[k] = p;
        }
        return perms[k];
    };

    const makeShape = (k, fill) => {
        const pos = new Float32Array(COUNT * 3);
        const perm = permFor(k);
        let n = 0;
        const put = (x, y, z) => {
            if (n >= COUNT) return -1;
            const idx = perm[n++];
            pos[idx * 3] = x;
            pos[idx * 3 + 1] = y;
            pos[idx * 3 + 2] = z;
            return idx;
        };
        fill(put);
        while (n < COUNT) put(0, 0, 0);
        return pos;
    };

    // Primitives vectorielles échantillonnées en points (coins en bas à gauche)
    const P = {
        line: (x0, y0, x1, y1, z) => ({
            w: Math.hypot(x1 - x0, y1 - y0),
            s: () => { const t = rand(); return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z]; },
        }),
        rrect: (x, y, w, h, r, z) => {
            const sw = w - 2 * r, sh = h - 2 * r, arc = (Math.PI * r) / 2;
            const per = 2 * sw + 2 * sh + 4 * arc;
            return {
                w: per,
                s: () => {
                    let d = rand() * per;
                    if (d < sw) return [x + r + d, y + h, z]; d -= sw;
                    if (d < arc) { const a = Math.PI / 2 - (d / arc) * (Math.PI / 2); return [x + w - r + Math.cos(a) * r, y + h - r + Math.sin(a) * r, z]; } d -= arc;
                    if (d < sh) return [x + w, y + h - r - d, z]; d -= sh;
                    if (d < arc) { const a = -(d / arc) * (Math.PI / 2); return [x + w - r + Math.cos(a) * r, y + r + Math.sin(a) * r, z]; } d -= arc;
                    if (d < sw) return [x + w - r - d, y, z]; d -= sw;
                    if (d < arc) { const a = -Math.PI / 2 - (d / arc) * (Math.PI / 2); return [x + r + Math.cos(a) * r, y + r + Math.sin(a) * r, z]; } d -= arc;
                    if (d < sh) return [x, y + r + d, z]; d -= sh;
                    const a = Math.PI - (d / arc) * (Math.PI / 2);
                    return [x + r + Math.cos(a) * r, y + h - r + Math.sin(a) * r, z];
                },
            };
        },
        fill: (x, y, w, h, z) => ({
            w: Math.max(w * h * 45, 0.2),
            s: () => [x + rand() * w, y + rand() * h, z],
        }),
        disc: (cx, cy, r, z) => ({
            w: Math.max(Math.PI * r * r * 45, 0.25),
            s: () => { const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * r; return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, z]; },
        }),
        circle: (cx, cy, r, z) => ({
            w: 2 * Math.PI * r,
            s: () => { const a = rand() * Math.PI * 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z]; },
        }),
    };
    const poly = (pts, z) => pts.slice(1).map((p, i) => P.line(pts[i][0], pts[i][1], p[0], p[1], z));

    const composite = (put, items, transform) => {
        const total = items.reduce((s, it) => s + it.w, 0);
        let left = COUNT;
        items.forEach((it, k) => {
            const n = k === items.length - 1 ? left : Math.floor((COUNT * it.w) / total);
            left -= n;
            for (let i = 0; i < n; i++) {
                const p = it.s();
                const q = transform([p[0] + gauss() * 0.004, p[1] + gauss() * 0.004, p[2]]);
                put(q[0], q[1], q[2]);
            }
        });
    };

    /* Formes ---------------------------------------------------------------- */

    // 0 : orbe IA (sphère de Fibonacci, orbites et noyau)
    const shapeOrb = () => makeShape(0, (put) => {
        const nShell = Math.floor(COUNT * 0.6);
        const nRing = Math.floor(COUNT * 0.24);
        const golden = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < nShell; i++) {
            const y = 1 - ((i + 0.5) / nShell) * 2;
            const r = Math.sqrt(1 - y * y);
            const th = golden * i;
            put(Math.cos(th) * r * 1.15, y * 1.15, Math.sin(th) * r * 1.15);
        }
        const rings = [[0.35, 0.2, 1.55], [1.2, -0.5, 1.72], [-0.9, 0.9, 1.9]];
        for (let i = 0; i < nRing; i++) {
            const [tx, tz, R] = rings[i % 3];
            const a = rand() * Math.PI * 2;
            let p = [Math.cos(a) * R, gauss() * 0.012, Math.sin(a) * R];
            p = rotZ(rotX(p, tx), tz);
            put(p[0], p[1], p[2]);
        }
        for (let i = nShell + nRing; i < COUNT; i++) {
            const r = 0.45 * Math.pow(rand(), 0.8);
            const v = [gauss(), gauss(), gauss()];
            const l = Math.hypot(v[0], v[1], v[2]) || 1;
            put((v[0] / l) * r, (v[1] / l) * r, (v[2] / l) * r);
        }
    });

    // 1 : maquette de site (navigateur en paysage, smartphone en portrait)
    const shapeSite = (portrait) => makeShape(1, (put) => {
        let items;
        if (!portrait) {
            const card = (x, w) => [
                P.rrect(x, -0.98, w, 0.36, 0.06, 0.18),
                P.disc(x + 0.12, -0.74, 0.035, 0.18),
                P.fill(x + 0.1, -0.87, w * 0.55, 0.025, 0.18),
            ];
            items = [
                P.rrect(-1.7, -1.1, 3.4, 2.2, 0.12, 0),
                P.line(-1.7, 0.84, 1.7, 0.84, 0),
                P.disc(-1.54, 0.97, 0.035, 0), P.disc(-1.42, 0.97, 0.035, 0), P.disc(-1.3, 0.97, 0.035, 0),
                P.rrect(-0.75, 0.905, 1.5, 0.13, 0.065, 0),
                P.fill(-1.45, 0.6, 0.26, 0.06, 0.12),
                P.fill(0.3, 0.615, 0.2, 0.03, 0.12), P.fill(0.6, 0.615, 0.2, 0.03, 0.12), P.fill(0.9, 0.615, 0.2, 0.03, 0.12),
                P.rrect(1.2, 0.575, 0.32, 0.11, 0.055, 0.12),
                P.fill(-1.45, 0.22, 1.55, 0.11, 0.3), P.fill(-1.45, 0.05, 1.15, 0.11, 0.3),
                P.fill(-1.45, -0.13, 1.3, 0.035, 0.24), P.fill(-1.45, -0.21, 0.95, 0.035, 0.24),
                P.rrect(-1.45, -0.46, 0.46, 0.14, 0.07, 0.3), P.rrect(-0.9, -0.46, 0.46, 0.14, 0.07, 0.24),
                P.rrect(0.35, -0.5, 1.17, 0.92, 0.08, 0.4),
                P.circle(0.72, 0.14, 0.11, 0.4),
                ...poly([[0.38, -0.44], [0.72, -0.1], [0.93, -0.28], [1.18, -0.02], [1.49, -0.44]], 0.4),
                ...card(-1.45, 0.92), ...card(-0.45, 0.92), ...card(0.55, 0.97),
            ];
            composite(put, items, (p) => rotX(rotY(p, -0.32), 0.12));
        } else {
            items = [
                P.rrect(-0.75, -1.45, 1.5, 2.9, 0.2, 0),
                P.fill(-0.18, 1.3, 0.36, 0.05, 0),
                P.fill(-0.6, 1.1, 0.22, 0.05, 0.1),
                P.line(0.42, 1.145, 0.6, 1.145, 0.1), P.line(0.42, 1.1, 0.6, 1.1, 0.1),
                P.fill(-0.6, 0.78, 1.1, 0.09, 0.3), P.fill(-0.6, 0.64, 0.85, 0.09, 0.3),
                P.fill(-0.6, 0.5, 1.0, 0.03, 0.24), P.fill(-0.6, 0.44, 0.75, 0.03, 0.24),
                P.rrect(-0.6, 0.2, 1.2, 0.14, 0.07, 0.3),
                P.rrect(-0.6, -0.52, 1.2, 0.62, 0.07, 0.4),
                P.circle(-0.28, -0.08, 0.08, 0.4),
                ...poly([[-0.57, -0.48], [-0.25, -0.2], [-0.05, -0.36], [0.2, -0.12], [0.57, -0.48]], 0.4),
                P.rrect(-0.6, -1.05, 0.57, 0.4, 0.05, 0.18), P.rrect(0.03, -1.05, 0.57, 0.4, 0.05, 0.18),
                P.fill(-0.22, -1.36, 0.44, 0.02, 0),
            ];
            composite(put, items, (p) => rotX(rotY(p, -0.3), 0.08));
        }
    });

    // 2 : réseau de neurones (couches reliées, influx qui se propagent)
    const shapeNetwork = (portrait, data) => makeShape(2, (put) => {
        const layers = portrait ? [3, 5, 6, 5, 2] : [4, 6, 7, 6, 3];
        const span = portrait ? 3.0 : 3.8;
        const gap = portrait ? 0.3 : 0.42;
        const L = layers.length - 1;
        const nodes = layers.map((n, li) => {
            const a = -span / 2 + (span * li) / L;
            return Array.from({ length: n }, (_, j) => {
                const b = (j - (n - 1) / 2) * gap;
                const z = n > 1 ? (0.5 - Math.abs(j / (n - 1) - 0.5)) * 0.7 - 0.2 : 0.15;
                return portrait ? [b, -a, z] : [a, b, z];
            });
        });
        const setData = (idx, g, seed) => {
            if (idx < 0) return;
            data[idx * 4 + 2] = g;
            data[idx * 4 + 3] = seed;
        };

        const nodeCount = nodes.flat().length;
        const perNode = Math.floor((COUNT * 0.26) / nodeCount);
        nodes.forEach((layer, li) => layer.forEach((c) => {
            for (let i = 0; i < perNode; i++) {
                let p;
                if (i < perNode * 0.65) {
                    p = [c[0] + gauss() * 0.022, c[1] + gauss() * 0.022, c[2] + gauss() * 0.022];
                } else {
                    const a = rand() * Math.PI * 2;
                    p = [c[0] + Math.cos(a) * 0.1, c[1] + Math.sin(a) * 0.1, c[2]];
                }
                setData(put(p[0], p[1], p[2]), li / L, 0);
            }
        }));

        const links = [];
        for (let li = 0; li < L; li++) {
            nodes[li].forEach((a) => nodes[li + 1].forEach((b) => links.push({ a, b, li, seed: rand() * 0.35 })));
        }
        const remaining = COUNT - perNode * nodeCount;
        for (let i = 0; i < remaining; i++) {
            const { a, b, li, seed } = links[i % links.length];
            const t = rand();
            const idx = put(
                a[0] + (b[0] - a[0]) * t + gauss() * 0.003,
                a[1] + (b[1] - a[1]) * t + gauss() * 0.003,
                a[2] + (b[2] - a[2]) * t,
            );
            setData(idx, (li + t) / L, seed);
        }
    });

    // 3 : onde (grille de points ondulée, animée dans le shader)
    const shapeWave = (portrait) => makeShape(3, (put) => {
        const W = portrait ? 5 : 11;
        const D = 6.5;
        const cols = Math.round(Math.sqrt((COUNT * W) / D));
        const rows = Math.ceil(COUNT / cols);
        // Léger décalage aléatoire dans chaque cellule pour éviter le moiré
        const cw = W / (cols - 1), rh = D / (rows - 1);
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                put(
                    (c / (cols - 1) - 0.5) * W + (rand() - 0.5) * cw * 0.8,
                    -1.05,
                    1.6 - (r / (rows - 1)) * D + (rand() - 0.5) * rh * 0.8,
                );
            }
        }
    });

    // 4 : anneau (tore fin, halo de poussière et anneau intérieur)
    const shapeRing = () => makeShape(4, (put) => {
        for (let i = 0; i < COUNT; i++) {
            const a = rand() * Math.PI * 2;
            const b = rand() * Math.PI * 2;
            const u = rand();
            let R = 1.25, rr;
            if (u < 0.58) rr = Math.abs(gauss()) * 0.03;
            else if (u < 0.84) rr = 0.06 + Math.pow(rand(), 1.6) * 0.5;
            else { R = 0.82; rr = Math.abs(gauss()) * 0.012; }
            put((R + rr * Math.cos(b)) * Math.cos(a), (R + rr * Math.cos(b)) * Math.sin(a), rr * Math.sin(b));
        }
    });

    /* Shaders --------------------------------------------------------------- */

    const VERT = `
precision highp float;
attribute vec3 aP0;
attribute vec3 aP1;
attribute vec3 aP2;
attribute vec3 aP3;
attribute vec3 aP4;
attribute vec4 aData;
uniform mat4 uProj;
uniform float uTime;
uniform float uProgress;
uniform float uIntro;
uniform float uSize;
uniform float uAlpha;
uniform float uCamZ;
uniform float uWaveHalf;
uniform float uLogo;
uniform vec2 uRot;
uniform vec3 uOffset;
varying vec3 vColor;
varying float vAlpha;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    vec3 ns = 0.142857142857 * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 g0 = vec3(a0.xy, h.x);
    vec3 g1 = vec3(a0.zw, h.y);
    vec3 g2 = vec3(a1.xy, h.z);
    vec3 g3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(g0, g0), dot(g1, g1), dot(g2, g2), dot(g3, g3)));
    g0 *= norm.x; g1 *= norm.y; g2 *= norm.z; g3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(g0, x0), dot(g1, x1), dot(g2, x2), dot(g3, x3)));
}

vec2 rot(vec2 p, float a) {
    float c = cos(a);
    float s = sin(a);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

vec3 shape(float i) {
    float t = uTime;
    if (i < 0.5) {
        vec3 p = aP0;
        // Seule la sphère respire, les orbites restent nettes
        float shell = step(length(p), 1.3);
        p *= 1.0 + 0.1 * shell * snoise(p * 1.3 + vec3(0.0, 0.0, t * 0.22));
        p.xz = rot(p.xz, t * 0.1);
        p.yz = rot(p.yz, 0.25);
        return p;
    }
    if (i < 1.5) {
        vec3 p = aP1;
        p.y += sin(t * 0.7 + p.x * 0.9) * 0.025;
        p.xz = rot(p.xz, sin(t * 0.25) * 0.08);
        return p;
    }
    if (i < 2.5) {
        vec3 p = aP2;
        p.xz = rot(p.xz, sin(t * 0.18) * 0.3);
        return p;
    }
    if (i < 3.5) {
        vec3 p = aP3;
        p.y += sin(p.x * 0.8 + t * 0.6) * 0.16 + cos(p.z * 1.1 - t * 0.45) * 0.14 + sin((p.x - p.z) * 0.45 + t * 0.3) * 0.12;
        return p;
    }
    vec3 p = aP4;
    if (uLogo > 0.5) {
        // Logo Pixel Designer : léger balancement en 3D
        p.xz = rot(p.xz, sin(t * 0.35) * 0.38);
        p.yz = rot(p.yz, sin(t * 0.27) * 0.12);
        p.y += sin(t * 0.8) * 0.04;
        return p;
    }
    p.xy = rot(p.xy, t * 0.12);
    p.yz = rot(p.yz, 1.1);
    p.xz = rot(p.xz, -0.4);
    return p;
}

// Dégradé du logo : cyan, bleu, violet
vec3 brand(float x) {
    vec3 c1 = vec3(0.13, 0.72, 1.0);
    vec3 c2 = vec3(0.23, 0.42, 1.0);
    vec3 c3 = vec3(0.55, 0.36, 0.97);
    return x < 0.5 ? mix(c1, c2, x * 2.0) : mix(c2, c3, x * 2.0 - 1.0);
}

void main() {
    float seg = clamp(floor(uProgress), 0.0, 3.0);
    float f = uProgress - seg;
    float d = aData.x * 0.4;
    float k = smoothstep(d, d + 0.6, f);

    vec3 a = shape(seg);
    vec3 b = shape(seg + 1.0);
    vec3 pos = mix(a, b, k);

    // Dispersion organique pendant la transition
    float burst = sin(k * 3.14159);
    if (burst > 0.001) {
        vec3 q = pos * 0.7 + vec3(aData.y * 10.0);
        pos += vec3(snoise(q + uTime * 0.2), snoise(q + 17.0), snoise(q + 41.0)) * burst * 0.45;
    }

    // Assemblage à l'ouverture de la page
    if (uIntro < 1.0) {
        vec3 far = normalize(aP0 + vec3(0.001)) * (4.0 + aData.x * 5.0);
        float e = clamp((uIntro - aData.x * 0.35) / 0.65, 0.0, 1.0);
        e = 1.0 - pow(1.0 - e, 3.0);
        pos = mix(far, pos, e);
    }

    pos *= uOffset.z;
    pos.yz = rot(pos.yz, uRot.x);
    pos.xz = rot(pos.xz, uRot.y);
    pos.xy += uOffset.xy;

    vec4 mv = vec4(pos.x, pos.y, pos.z - uCamZ, 1.0);
    gl_Position = uProj * mv;
    float depth = max(-mv.z, 0.5);
    gl_PointSize = uSize * (0.6 + aData.x * 0.9) * (uCamZ / depth);

    // Part de la particule dans le réseau (2), l'onde (3) et le logo (4)
    float s2 = seg > 0.5 && seg < 1.5 ? k : (seg > 1.5 && seg < 2.5 ? 1.0 - k : 0.0);
    float s3 = seg > 1.5 && seg < 2.5 ? k : (seg > 2.5 ? 1.0 - k : 0.0);
    float s4 = seg > 2.5 ? k : 0.0;

    float ph = fract(uTime * 0.2 + aData.w);
    float pulse = exp(-pow((ph * 1.3 - 0.15 - aData.z) * 9.0, 2.0)) * s2;

    // Couleurs : teintes du logo, plus franches quand les particules forment le logo
    float tLogo = clamp(0.5 + (aP4.x - aP4.y) * 0.24, 0.0, 1.0);
    float tc = mix(aData.y, tLogo, s4 * uLogo);
    float sat = mix(0.5 + 0.4 * step(0.65, aData.y), 0.95, s4 * uLogo);
    vec3 col = mix(vec3(0.93, 0.94, 0.98), brand(tc), sat);
    col *= mix(1.0, clamp(0.85 + aP4.z * 1.1, 0.6, 1.15), s4 * uLogo);
    vColor = mix(col, vec3(0.7, 0.9, 1.0), clamp(pulse, 0.0, 1.0));

    float alpha = 0.32 + 0.55 * aData.x + pulse * 0.9;
    float edge = smoothstep(uWaveHalf, uWaveHalf * 0.45, abs(aP3.x)) * smoothstep(-4.8, -1.6, aP3.z);
    alpha *= mix(1.0, edge, s3);
    vAlpha = alpha * uAlpha;
}`;

    const FRAG = `
precision mediump float;
varying vec3 vColor;
varying float vAlpha;
void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c) * 4.0;
    if (d > 1.0) discard;
    float a = (1.0 - d);
    a = a * a * vAlpha;
    gl_FragColor = vec4(vColor * a, a);
}`;

    /* Mise en place WebGL ---------------------------------------------------- */

    let gl, prog, loc = {}, buffers = {}, rafId = 0;
    let portrait = innerWidth / innerHeight < 0.85;
    let logoReady = false;
    const data = new Float32Array(COUNT * 4);
    for (let i = 0; i < COUNT; i++) {
        data[i * 4] = rand();
        data[i * 4 + 1] = rand();
    }
    // L'anneau sert de forme d'attente (ou de secours) avant que le logo soit chargé
    const shapes = [shapeOrb(), shapeSite(portrait), shapeNetwork(portrait, data), shapeWave(portrait), shapeRing()];

    // 4 : logo Pixel Designer, échantillonné depuis l'image (relief tiré de la luminosité)
    const shapeLogo = (img) => {
        const S = 200;
        const c = document.createElement('canvas');
        c.width = c.height = S;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, S, S);
        const px = ctx.getImageData(0, 0, S, S).data;
        const alphaAt = (x, y) => (x < 0 || y < 0 || x >= S || y >= S ? 0 : px[(y * S + x) * 4 + 3]);
        const inside = [];
        const edge = [];
        for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
                const i = (y * S + x) * 4;
                if (px[i + 3] < 128) continue;
                const lum = (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) / 255;
                const isEdge = alphaAt(x - 1, y) < 128 || alphaAt(x + 1, y) < 128 || alphaAt(x, y - 1) < 128 || alphaAt(x, y + 1) < 128;
                (isEdge ? edge : inside).push(x, y, lum);
            }
        }
        if (inside.length < 900) return null;
        const k = 2.7 / S;
        return makeShape(4, (put) => {
            for (let n = 0; n < COUNT; n++) {
                const src = edge.length && rand() < 0.3 ? edge : inside;
                const j = Math.floor(rand() * (src.length / 3)) * 3;
                put(
                    (src[j] + rand() - S / 2) * k,
                    -(src[j + 1] + rand() - S / 2) * k,
                    (src[j + 2] - 0.45) * 0.9 + gauss() * 0.025,
                );
            }
        });
    };

    const loadLogo = () => new Promise((resolve) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
            try {
                const s = shapeLogo(img);
                if (s) {
                    shapes[4] = s;
                    logoReady = true;
                }
            } catch (err) {
                // Canvas illisible (ex. page ouverte en file://) : on garde l'anneau
            }
            resolve();
        };
        img.onerror = () => resolve();
        img.src = canvas.dataset.logo || 'assets/img/logo-256.png';
    });

    const compile = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.warn(gl.getShaderInfoLog(s));
            return null;
        }
        return s;
    };

    const upload = (name, arr) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers[name]);
        gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
    };

    const setup = () => {
        gl = canvas.getContext('webgl', {
            alpha: false,
            antialias: false,
            depth: false,
            stencil: false,
            powerPreference: 'high-performance',
        });
        if (!gl) return false;
        const vs = compile(gl.VERTEX_SHADER, VERT);
        const fs = compile(gl.FRAGMENT_SHADER, FRAG);
        if (!vs || !fs) return false;
        prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
        gl.useProgram(prog);

        ['aP0', 'aP1', 'aP2', 'aP3', 'aP4', 'aData'].forEach((name, i) => {
            buffers[name] = gl.createBuffer();
            upload(name, i < 5 ? shapes[i] : data);
            const l = gl.getAttribLocation(prog, name);
            gl.enableVertexAttribArray(l);
            gl.vertexAttribPointer(l, i < 5 ? 3 : 4, gl.FLOAT, false, 0, 0);
        });
        ['uProj', 'uTime', 'uProgress', 'uIntro', 'uSize', 'uAlpha', 'uCamZ', 'uWaveHalf', 'uLogo', 'uRot', 'uOffset']
            .forEach((u) => { loc[u] = gl.getUniformLocation(prog, u); });
        gl.uniform1f(loc.uLogo, logoReady ? 1 : 0);

        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.clearColor(BG[0], BG[1], BG[2], 1);
        gl.uniform1f(loc.uCamZ, CAM_Z);
        return true;
    };

    if (!setup()) return;

    /* Dimensions et cadrage par étape ---------------------------------------- */

    let dprCap = innerWidth < 768 ? 1.5 : 1.75;
    let aspect = 1, lastW = 0, lastH = 0, configs = [];

    const buildConfigs = () => {
        const hh = TAN * CAM_Z;
        const hw = hh * aspect;
        // solo : pages merci / 404, texte à gauche, forme à droite (ou en haut sur mobile)
        const solo = fixedStage !== null;
        // Derrière les blocs de texte, les formes restent discrètes pour préserver la lecture
        if (portrait) {
            return [
                { x: 0, y: 0.95, s: Math.min(0.9, (hw * 1.3) / 1.9), a: solo ? 0.55 : 0.45 },
                { x: 0, y: 0, s: Math.min(1, (hh * 0.85) / 1.45), a: 0.26 },
                { x: 0, y: 0, s: Math.min(1, (hh * 0.8) / 1.6), a: 0.3 },
                { x: 0, y: 0, s: 1, a: 0.34 },
                { x: 0, y: 0.95, s: Math.min(0.62, (hw * 1.15) / 1.35), a: solo ? 0.7 : 0.4 },
            ];
        }
        return [
            { x: hw * 0.46, y: 0.05, s: clamp((hw * 0.48) / 1.9, 0.6, 1), a: 0.95 },
            { x: hw * 0.1, y: 0, s: Math.min(1.05, (hw * 0.8) / 1.75), a: 0.28 },
            { x: hw * 0.18, y: 0, s: Math.min(0.95, (hw * 0.8) / 1.95), a: 0.32 },
            { x: 0, y: 0, s: 1, a: 0.38 },
            solo
                ? { x: hw * 0.42, y: 0, s: Math.min(0.9, (hw * 0.4) / 1.35), a: 1 }
                : { x: -hw * 0.4, y: -0.62, s: Math.min(0.56, (hw * 0.3) / 1.35), a: 0.95 },
        ];
    };

    const resize = (force) => {
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        // Sur mobile, la barre d'adresse fait varier la hauteur : on ignore ces petits écarts
        if (!force && w === lastW && Math.abs(h - lastH) < 120) return;
        lastW = w;
        lastH = h;
        const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        gl.viewport(0, 0, canvas.width, canvas.height);
        aspect = w / h;

        const near = 0.1, far = 50, fz = 1 / TAN, nf = 1 / (near - far);
        gl.uniformMatrix4fv(loc.uProj, false, new Float32Array([
            fz / aspect, 0, 0, 0,
            0, fz, 0, 0,
            0, 0, (far + near) * nf, -1,
            0, 0, 2 * far * near * nf, 0,
        ]));
        gl.uniform1f(loc.uSize, (w < 768 ? 2.1 : 2.4) * dpr);

        const nowPortrait = aspect < 0.85;
        if (nowPortrait !== portrait) {
            portrait = nowPortrait;
            shapes[1] = shapeSite(portrait);
            shapes[2] = shapeNetwork(portrait, data);
            shapes[3] = shapeWave(portrait);
            upload('aP1', shapes[1]);
            upload('aP2', shapes[2]);
            upload('aP3', shapes[3]);
            upload('aData', data);
        }
        gl.uniform1f(loc.uWaveHalf, portrait ? 2.5 : 5.5);
        configs = buildConfigs();
        dirty = true;
    };

    /* Progression liée au scroll (lue dans la boucle, sans écouteur de scroll) */

    let anchors = [];
    const measure = () => {
        const sy = window.scrollY;
        anchors = stageEls.slice(1).map((el) => el.getBoundingClientRect().top + sy);
    };
    const targetProgress = () => {
        if (fixedStage !== null) return fixedStage;
        const vh = window.innerHeight;
        const yc = window.scrollY + vh * 0.5;
        let p = 0;
        for (const top of anchors) p += clamp((yc - (top - vh * 0.3)) / (vh * 0.6), 0, 1);
        return p;
    };

    /* Boucle d'animation ------------------------------------------------------ */

    let dirty = true;
    let time = 12;
    let progress = 0;
    let intro = reduceMotion ? 1 : 0;
    let mouseX = 0, mouseY = 0, rx = 0, ry = 0;
    let last = performance.now();
    let frames = 0, slowTime = 0, checked = false;
    const cfg = { x: 0, y: 0, s: 1, a: 1 };

    if (finePointer && !reduceMotion) {
        window.addEventListener('pointermove', (e) => {
            mouseX = e.clientX / window.innerWidth - 0.5;
            mouseY = e.clientY / window.innerHeight - 0.5;
        }, { passive: true });
    }

    const frame = (now) => {
        rafId = requestAnimationFrame(frame);
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;

        // Si l'appareil peine, on baisse la résolution une seule fois
        if (!checked) {
            frames++;
            slowTime += dt;
            if (frames === 90) {
                checked = true;
                if (slowTime / frames > 1 / 38 && dprCap > 1) {
                    dprCap = 1;
                    resize(true);
                }
            }
        }

        const target = targetProgress();
        if (reduceMotion) {
            if (!dirty && Math.abs(target - progress) < 0.0005) return;
            progress = target;
        } else {
            time += dt;
            progress += (target - progress) * (1 - Math.exp(-dt * 2.4));
            intro = Math.min(1, intro + dt / 2.6);
            if (finePointer) {
                rx += (mouseY * 0.18 - rx) * (1 - Math.exp(-dt * 3));
                ry += (mouseX * 0.3 - ry) * (1 - Math.exp(-dt * 3));
            } else {
                rx = Math.sin(time * 0.11) * 0.05;
                ry = Math.sin(time * 0.15) * 0.1;
            }
        }
        dirty = false;

        const seg = clamp(Math.floor(progress), 0, 3);
        const f = smooth(clamp(progress - seg, 0, 1));
        const A = configs[seg], B = configs[seg + 1];
        cfg.x = A.x + (B.x - A.x) * f;
        cfg.y = A.y + (B.y - A.y) * f;
        cfg.s = A.s + (B.s - A.s) * f;
        cfg.a = A.a + (B.a - A.a) * f;

        gl.uniform1f(loc.uTime, time);
        gl.uniform1f(loc.uProgress, progress);
        gl.uniform1f(loc.uIntro, intro);
        gl.uniform1f(loc.uAlpha, cfg.a);
        gl.uniform2f(loc.uRot, rx, ry);
        gl.uniform3f(loc.uOffset, cfg.x, cfg.y, cfg.s);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.POINTS, 0, COUNT);
    };

    const start = () => {
        resize(true);
        measure();
        progress = targetProgress();
        cancelAnimationFrame(rafId);
        last = performance.now();
        rafId = requestAnimationFrame(frame);
        requestAnimationFrame(() => canvas.classList.add('is-ready'));
    };

    window.addEventListener('resize', () => { resize(false); measure(); });
    window.addEventListener('load', measure);
    if ('ResizeObserver' in window) new ResizeObserver(measure).observe(document.body);

    canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        cancelAnimationFrame(rafId);
    });
    canvas.addEventListener('webglcontextrestored', () => {
        if (setup()) start();
    });

    const applyLogo = () => {
        if (!logoReady) return;
        upload('aP4', shapes[4]);
        gl.uniform1f(loc.uLogo, 1);
        dirty = true;
    };

    const logoLoaded = loadLogo().then(applyLogo);
    if (fixedStage === 4) {
        // Page où le logo est visible d'emblée : on attend l'image (au plus 1,2 s)
        Promise.race([logoLoaded, new Promise((r) => setTimeout(r, 1200))]).then(start);
    } else {
        start();
    }
})();
