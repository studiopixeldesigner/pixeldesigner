// Réalisations : carrousel 3D piloté par le scroll (WebGL natif, aucune librairie).
// Les sites défilent vers l'écran l'un après l'autre. Celui qui passe la caméra
// se décale en couleurs puis se dissout en pixels.
// Les cartes <article class="work"> restent dans la page (générées par l'admin) :
// elles servent de source (titre, image, lien) et de panneau d'infos accessible.
// Sans WebGL, sur petit écran peu haut ou en mouvement réduit : la liste simple reste.
(() => {
    const stage = document.querySelector('[data-works]');
    if (!stage) return;
    const articles = [...stage.querySelectorAll('.work')];
    const canvas = stage.querySelector('.works-canvas');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tallEnough = window.matchMedia('(min-height: 560px)');
    if (!canvas || articles.length < 2 || reduceMotion) return;

    const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true });
    if (!gl) return;

    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    /* Données des projets, lues dans les cartes -------------------------- */
    const pickSrc = (article) => {
        const source = article.querySelector('source');
        const img = article.querySelector('img');
        if (source) {
            const entries = source.srcset.split(',').map((s) => s.trim().split(/\s+/));
            const best = entries.sort((a, b) => parseInt(b[1], 10) - parseInt(a[1], 10))[0];
            if (best && best[0]) return best[0];
        }
        return img ? img.getAttribute('src') : '';
    };
    const projects = articles.map((article, i) => ({
        article,
        link: article.querySelector('.work-media'),
        title: (article.querySelector('.work-title') || {}).textContent || '',
        src: pickSrc(article),
        side: i % 2 ? -1 : 1,
        tex: null,
        aspect: 16 / 10,
    }));
    const n = projects.length;

    /* Shaders --------------------------------------------------------------- */
    const VS = `
attribute vec2 aPos;
uniform mat4 uProj;
uniform vec3 uOffset;
uniform vec2 uSize;
uniform float uRotY;
uniform float uBend;
uniform mediump float uTime;
uniform mediump float uDis;
varying mediump vec2 vUv;
void main() {
    vUv = aPos + 0.5;
    vec3 p = vec3(aPos * uSize, 0.0);
    // Courbure liée à la vitesse du scroll et ondulation lente
    p.z -= uBend * (aPos.x * aPos.x) * uSize.x;
    p.z += sin(aPos.x * 3.0 + uTime * 0.9) * 0.02 + uDis * sin(aPos.y * 9.0 + uTime * 6.0) * 0.06;
    float c = cos(uRotY), s = sin(uRotY);
    p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
    gl_Position = uProj * vec4(p + uOffset, 1.0);
}`;

    const FS = `
precision mediump float;
uniform sampler2D uTex;
uniform float uReady;
uniform float uImgA;
uniform float uPlaneA;
uniform float uShift;
uniform float uDis;
uniform float uAlpha;
uniform float uTime;
uniform float uGlitch;
uniform float uFocus;
uniform float uSeed;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }

vec2 cover(vec2 uv) {
    // Remplit la carte en gardant le haut de la capture (comme object-position: top)
    if (uImgA > uPlaneA) uv.x = 0.5 + (uv.x - 0.5) * uPlaneA / uImgA;
    else uv.y = 1.0 - (1.0 - uv.y) * uImgA / uPlaneA;
    return uv;
}

void main() {
    vec2 uv = vUv;

    // Tranches horizontales qui sautent par moments (glitch)
    float band = floor(uv.y * 26.0);
    float tick = floor(uTime * 9.0);
    float jump = step(1.0 - 0.08 * uGlitch, hash(vec2(band, tick)));
    uv.x += jump * (hash(vec2(tick, band)) - 0.5) * 0.08 * uGlitch;

    // Pixellisation progressive pendant la dissolution
    float cells = mix(220.0, 26.0, uDis);
    vec2 grid = vec2(cells * uPlaneA, cells);
    vec2 puv = uDis > 0.01 ? (floor(uv * grid) + 0.5) / grid : uv;

    vec2 tuv = cover(puv);
    float sh = uShift + jump * 0.012 * uGlitch;
    vec3 col;
    col.r = texture2D(uTex, cover(puv + vec2(sh, 0.0))).r;
    col.g = texture2D(uTex, tuv).g;
    col.b = texture2D(uTex, cover(puv - vec2(sh, 0.0))).b;
    col = mix(vec3(0.05, 0.07, 0.16), col, uReady);

    // Lignes de balayage discrètes et vignette
    col *= 0.94 + 0.06 * sin(vUv.y * 900.0);
    vec2 q = vUv - 0.5;
    col *= 1.0 - dot(q, q) * 0.9;
    col = mix(col * 0.55, col, uFocus);

    // Coins arrondis et filet lumineux (effet verre)
    vec2 pp = q * vec2(uPlaneA, 1.0);
    vec2 hb = vec2(uPlaneA * 0.5, 0.5) - 0.035;
    vec2 d2 = abs(pp) - hb;
    float sd = length(max(d2, 0.0)) + min(max(d2.x, d2.y), 0.0) - 0.035;
    float mask = 1.0 - smoothstep(-0.003, 0.002, sd);
    float rim = smoothstep(-0.012, 0.0, sd) * mask;
    col += rim * mix(vec3(0.35, 0.55, 1.0), vec3(1.0, 0.45, 0.9), vUv.x) * 0.9;
    // Reflet en haut à gauche
    col += smoothstep(0.55, 0.0, length(vUv - vec2(0.05, 1.05))) * 0.08;

    // Dissolution en pixels : chaque case disparaît à son tour, bord cyan/rose
    vec2 cell = floor(vUv * vec2(42.0 * uPlaneA, 42.0));
    float r = hash(cell);
    float th = uDis * 1.15;
    float alive = step(th, r);
    float edge = (1.0 - step(th + 0.035, r)) * alive * step(0.001, uDis);
    col = mix(col, mix(vec3(0.25, 0.9, 1.0), vec3(1.0, 0.35, 0.85), hash(cell + 3.1)), edge * 0.75);

    float a = mask * alive * uAlpha;
    gl_FragColor = vec4(col * a, a);
}`;

    const compile = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
    };
    let prog;
    try {
        prog = gl.createProgram();
        gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
        gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (err) {
        console.error(err);
        return;
    }
    gl.useProgram(prog);
    const U = {};
    ['uProj', 'uOffset', 'uSize', 'uRotY', 'uBend', 'uTime', 'uDis', 'uTex', 'uReady', 'uImgA', 'uPlaneA',
        'uShift', 'uAlpha', 'uGlitch', 'uFocus', 'uSeed'].forEach((k) => { U[k] = gl.getUniformLocation(prog, k); });

    // Plan subdivisé (pour la courbure)
    const SX = 40, SY = 24;
    const verts = [];
    for (let y = 0; y < SY; y++) {
        for (let x = 0; x < SX; x++) {
            const x0 = x / SX - 0.5, x1 = (x + 1) / SX - 0.5, y0 = y / SY - 0.5, y1 = (y + 1) / SY - 0.5;
            verts.push(x0, y0, x1, y0, x1, y1, x0, y0, x1, y1, x0, y1);
        }
    }
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const VCOUNT = verts.length / 2;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);

    const blank = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, blank);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([12, 16, 40, 255]));

    const loadTextures = () => {
        projects.forEach((p) => {
            if (p.tex || p.loading || !p.src) return;
            p.loading = true;
            const img = new Image();
            img.decoding = 'async';
            img.onload = () => {
                const tex = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
                // Dimensions quelconques : pas de mipmap, bords bloqués
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                p.tex = tex;
                p.imgA = img.naturalWidth / img.naturalHeight;
                p.readyAt = performance.now();
            };
            img.src = p.src;
        });
    };

    /* Interface autour du canvas ------------------------------------------ */
    const pad = (i) => String(i + 1).padStart(2, '0');
    const hud = document.createElement('div');
    hud.className = 'works-hud';
    hud.setAttribute('aria-hidden', 'true');
    hud.innerHTML = `
        <ol class="works-index">${projects.map((p, i) => `<li><button type="button" tabindex="-1" data-go="${i}"><span>${pad(i)}</span>${p.title.replace(/[<>&]/g, '')}</button></li>`).join('')}</ol>
        <p class="works-count"><span data-works-current>01</span> / ${pad(n - 1)}</p>
        <p class="works-hint">Défilez pour explorer</p>
        <span class="works-bar"><i data-works-bar></i></span>`;
    const pin = stage.querySelector('.works-pin');
    const worksEl = stage.querySelector('.works');
    let offX = 0, offY = 0;
    pin.append(hud);
    const currentEl = hud.querySelector('[data-works-current]');
    const barEl = hud.querySelector('[data-works-bar]');
    const indexBtns = [...hud.querySelectorAll('[data-go]')];

    /* Géométrie de l'écran ----------------------------------------------- */
    const FOV = (40 * Math.PI) / 180;
    const CAM_Z = 5;
    const GAP = 3.4;
    let W = 0, H = 0, dpr = 1, wide = false;
    let visW = 1, visH = 1, cardW = 1, focusX = 0, focusY = 0;
    const proj = new Float32Array(16);
    let enabled = false;

    const resize = () => {
        dpr = Math.min(window.devicePixelRatio || 1, 1.75);
        W = pin.clientWidth;
        H = pin.clientHeight;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        gl.viewport(0, 0, canvas.width, canvas.height);
        wide = W >= 1024;
        // Les liens des cartes sont placés dans .works : on retire son décalage dans la scène
        const pr = pin.getBoundingClientRect();
        const wr = worksEl.getBoundingClientRect();
        offX = wr.left - pr.left;
        offY = wr.top - pr.top;
        const aspect = W / H;
        visH = 2 * Math.tan(FOV / 2) * CAM_Z;
        visW = visH * aspect;
        const f = 1 / Math.tan(FOV / 2);
        proj.set([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, -1.002, -1, 0, 0, -0.2002, 0]);
        if (wide) {
            cardW = Math.min(visW * 0.54, visH * 0.62 * 1.6);
            focusX = visW * 0.14;
            focusY = 0;
        } else {
            // La carte occupe l'espace libre entre le compteur (en haut) et le panneau d'infos (en bas)
            const infoH = Math.max(...articles.map((a) => a.querySelector('.work-info').offsetHeight));
            const top = 120;
            const bottom = H - 72 - infoH - 28;
            const space = Math.max(bottom - top, H * 0.2);
            const px = visH / H;
            cardW = Math.min(visW * 0.88, space * px * 1.6);
            focusX = 0;
            focusY = visH * 0.5 - (top + space / 2) * px;
        }
    };

    // Position d'un point du monde (z relatif à la caméra) à l'écran, en pixels
    const toScreen = (x, y, z) => {
        const dz = CAM_Z - z;
        const s = (1 / Math.tan(FOV / 2)) / dz;
        return [(x * s / (W / H) * 0.5 + 0.5) * W, (0.5 - y * s * 0.5) * H];
    };

    /* Scroll ------------------------------------------------------------- */
    const START = -0.35;
    const RANGE = n - 1 + 0.7;
    let target = START;
    let pos = START;
    let vel = 0;
    let active = -1;
    let pointer = { x: 0, y: 0, tx: 0, ty: 0 };

    const readScroll = () => {
        const r = stage.getBoundingClientRect();
        const len = stage.offsetHeight - H;
        const f = len > 0 ? clamp(-r.top / len, 0, 1) : 0;
        target = START + f * RANGE;
        barEl.style.setProperty('--f', f.toFixed(4));
    };

    const goTo = (i, smoothScroll = true) => {
        const len = stage.offsetHeight - H;
        const f = (i - START) / RANGE;
        const top = stage.getBoundingClientRect().top + window.scrollY + f * len;
        window.scrollTo({ top, behavior: smoothScroll ? 'smooth' : 'auto' });
    };
    indexBtns.forEach((b) => b.addEventListener('click', () => goTo(Number(b.dataset.go))));

    // Un lien d'un projet prend le focus au clavier : on amène ce projet devant
    articles.forEach((article, i) => {
        article.addEventListener('focusin', () => { if (enabled && i !== active) goTo(i, false); });
    });

    const setActive = (i) => {
        if (i === active) return;
        active = i;
        articles.forEach((a, k) => a.classList.toggle('is-active', k === i));
        indexBtns.forEach((b, k) => b.classList.toggle('is-active', k === i));
        currentEl.textContent = pad(i);
        const title = articles[i].querySelector('.work-title');
        if (title) {
            title.classList.remove('is-glitch');
            void title.offsetWidth;
            title.classList.add('is-glitch');
        }
    };

    if (finePointer) {
        pin.addEventListener('pointermove', (e) => {
            pointer.tx = (e.clientX / W - 0.5) * 2;
            pointer.ty = (e.clientY / H - 0.5) * 2;
        });
        pin.addEventListener('pointerleave', () => { pointer.tx = 0; pointer.ty = 0; });
    }

    /* Rendu -------------------------------------------------------------- */
    let visible = false;
    let raf = 0;
    let last = performance.now();
    let hover = 0;

    const frame = (now) => {
        raf = 0;
        if (!visible || !enabled) return;
        raf = requestAnimationFrame(frame);
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        const t = (now / 1000) % 600;

        readScroll();
        const prev = pos;
        pos += (target - pos) * (1 - Math.exp(-dt * 6));
        vel += ((pos - prev) / Math.max(dt, 0.001) - vel) * 0.2;
        pointer.x += (pointer.tx - pointer.x) * 0.06;
        pointer.y += (pointer.ty - pointer.y) * 0.06;

        setActive(clamp(Math.round(pos), 0, n - 1));

        const camX = pointer.x * 0.12;
        const camY = -pointer.y * 0.08;
        const linkEl = projects[active].link;
        hover += ((linkEl && linkEl.matches(':hover') ? 1 : 0) - hover) * 0.12;

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniformMatrix4fv(U.uProj, false, proj);
        gl.uniform1f(U.uTime, t);

        const speed = Math.abs(vel);
        const order = projects.map((p, i) => i).sort((a, b) => (b - pos) - (a - pos));
        order.forEach((i) => {
            const p = projects[i];
            const rel = i - pos;
            if (rel < -1.2 || rel > 3.4) return;
            const ahead = Math.max(rel, 0);
            const spread = wide ? 1.1 : 0.5;
            // Le site qui passe la caméra s'écarte du panneau d'infos (à droite, ou vers le haut sur mobile)
            const behind = Math.max(-rel, 0);
            // Sur ordinateur, les sites à venir attendent à droite pour ne pas passer sous le panneau d'infos
            const x = focusX + (wide ? 0.8 : p.side) * spread * Math.min(ahead, 1.6) * visW * 0.22 + (wide ? behind * visW * 0.3 : 0) - camX;
            const y = focusY + Math.sin(t * 0.7 + i * 1.7) * 0.03 + Math.min(ahead, 2) * (wide ? 0.12 : 0.25) + (wide ? 0 : behind * visH * 0.3) - camY;
            const z = -rel * GAP;
            const dis = smooth(-0.08, -0.75, rel);
            const fade = 1 - smooth(2.2, 3.3, rel);
            const focus = 1 - smooth(0.15, 1.2, Math.abs(rel));
            const ready = p.tex ? clamp((now - p.readyAt) / 600, 0, 1) : 0;
            const cw = cardW * (1 + hover * 0.03 * (i === active ? 1 : 0));
            const planeA = 1.6;

            gl.uniform3f(U.uOffset, x, y, z - CAM_Z);
            gl.uniform2f(U.uSize, cw, cw / planeA);
            gl.uniform1f(U.uRotY, -p.side * 0.32 * clamp(rel, -0.5, 1.4) + pointer.x * 0.05);
            gl.uniform1f(U.uBend, clamp(vel * 0.06, -0.12, 0.12));
            gl.uniform1f(U.uDis, dis);
            gl.uniform1f(U.uAlpha, fade);
            gl.uniform1f(U.uShift, clamp(speed * 0.006, 0, 0.03) + dis * 0.03 + (1 - focus) * 0.004);
            gl.uniform1f(U.uGlitch, clamp(0.35 + speed * 0.5 - hover * 0.35, 0, 1.5));
            gl.uniform1f(U.uFocus, 0.35 + focus * 0.65);
            gl.uniform1f(U.uReady, ready);
            gl.uniform1f(U.uImgA, p.imgA || planeA);
            gl.uniform1f(U.uPlaneA, planeA);
            gl.uniform1f(U.uSeed, i * 7.13);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, p.tex || blank);
            gl.uniform1i(U.uTex, 0);
            gl.drawArrays(gl.TRIANGLES, 0, VCOUNT);
        });

        // Le lien du projet actif recouvre sa carte : clic, survol et focus clavier
        const ch = cardW / 1.6;
        const tl = toScreen(focusX - camX - cardW / 2, focusY - camY + ch / 2, 0);
        const br = toScreen(focusX - camX + cardW / 2, focusY - camY - ch / 2, 0);
        stage.style.setProperty('--card-l', `${(tl[0] - offX).toFixed(1)}px`);
        stage.style.setProperty('--card-t', `${(tl[1] - offY).toFixed(1)}px`);
        stage.style.setProperty('--card-w', `${(br[0] - tl[0]).toFixed(1)}px`);
        stage.style.setProperty('--card-h', `${(br[1] - tl[1]).toFixed(1)}px`);
    };

    const start = () => {
        if (!raf && visible && enabled) {
            last = performance.now();
            raf = requestAnimationFrame(frame);
        }
    };

    const enable = (on) => {
        enabled = on;
        stage.classList.toggle('is-3d', on);
        stage.style.setProperty('--n', n);
        if (on) {
            resize();
            loadTextures();
            readScroll();
            pos = target;
            start();
        } else {
            articles.forEach((a) => a.classList.remove('is-active'));
            active = -1;
        }
    };

    new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) loadTextures();
        start();
    }, { rootMargin: '200px 0px' }).observe(stage);

    window.addEventListener('resize', () => { if (enabled) resize(); });
    // Les polices changent la hauteur du panneau d'infos : on remesure une fois chargées
    if (document.fonts) document.fonts.ready.then(() => { if (enabled) resize(); });
    tallEnough.addEventListener('change', (e) => enable(e.matches));
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); enable(false); });

    enable(tallEnough.matches);
})();
