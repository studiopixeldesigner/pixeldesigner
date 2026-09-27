// Interface : navigation, menu mobile, animations, formulaire de contact
(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

    // Année du pied de page
    $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

    /* Navigation : fond flouté dès qu'on quitte le haut de page ----------- */
    const nav = $('[data-nav]');
    if (nav) {
        const sentinel = document.createElement('div');
        sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:24px;pointer-events:none';
        document.body.prepend(sentinel);
        new IntersectionObserver(([entry]) => {
            nav.classList.toggle('is-scrolled', !entry.isIntersecting);
        }).observe(sentinel);
    }

    /* Lien actif selon la section visible -------------------------------- */
    const navLinks = $$('[data-nav-link]');
    if (navLinks.length) {
        const byId = new Map(navLinks.map((a) => [a.getAttribute('href').slice(1), a]));
        const sectionObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                navLinks.forEach((a) => a.removeAttribute('aria-current'));
                const link = byId.get(entry.target.id);
                if (link) link.setAttribute('aria-current', 'true');
            });
        }, { rootMargin: '-45% 0px -50% 0px' });
        $$('main > section[id]').forEach((s) => sectionObserver.observe(s));
    }

    /* Menu mobile --------------------------------------------------------- */
    const toggle = $('[data-menu-toggle]');
    const menu = $('[data-menu]');
    if (toggle && menu) {
        let closeTimer;
        const setOpen = (open) => {
            clearTimeout(closeTimer);
            toggle.setAttribute('aria-expanded', String(open));
            toggle.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
            document.body.classList.toggle('menu-open', open);
            if (open) {
                menu.hidden = false;
                requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('is-open')));
            } else {
                menu.classList.remove('is-open');
                closeTimer = setTimeout(() => { menu.hidden = true; }, reduceMotion ? 0 : 400);
            }
        };
        toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
        menu.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
                setOpen(false);
                toggle.focus();
            }
        });
        window.matchMedia('(min-width: 900px)').addEventListener('change', (e) => { if (e.matches) setOpen(false); });
    }

    /* Découpage en mots ---------------------------------------------------
       Les mots situés dans un .grad reçoivent chacun le dégradé (le parent le perd),
       ce qui permet de les animer séparément sans casser la couleur. */
    const splitWords = (el, wrap) => {
        let i = 0;
        const walk = (node, grad) => {
            [...node.childNodes].forEach((child) => {
                if (child.nodeType === Node.TEXT_NODE) {
                    const frag = document.createDocumentFragment();
                    // Espaces classiques uniquement : les espaces insécables restent collés au mot
                    child.textContent.split(/([ \t\n\r]+)/).forEach((part) => {
                        if (!part) return;
                        if (/^[ \t\n\r]+$/.test(part)) { frag.append(' '); return; }
                        frag.append(wrap(part, i++, grad));
                    });
                    child.replaceWith(frag);
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                    const isGrad = child.classList.contains('grad');
                    if (isGrad) child.classList.remove('grad');
                    walk(child, grad || isGrad);
                }
            });
        };
        walk(el, false);
        return i;
    };

    $$('[data-split]').forEach((title) => {
        splitWords(title, (text, i, grad) => {
            const outer = document.createElement('span');
            outer.className = 'word';
            const inner = document.createElement('span');
            inner.textContent = text;
            inner.style.setProperty('--i', i);
            if (grad) inner.className = 'grad';
            outer.append(inner);
            return outer;
        });
    });

    /* Apparitions au scroll --------------------------------------------- */
    const revealEls = $$('[data-reveal], [data-split]');
    const finishReveal = (el) => {
        el.classList.add('is-in');
        if (!el.hasAttribute('data-reveal')) return;
        // Une fois l'entrée jouée, on retire l'état d'apparition pour libérer les effets de survol
        const delay = parseFloat(el.style.getPropertyValue('--d')) || 0;
        setTimeout(() => {
            el.removeAttribute('data-reveal');
            el.classList.remove('is-in');
        }, 1300 + delay * 1000);
    };
    if (reduceMotion || !('IntersectionObserver' in window)) {
        revealEls.forEach((el) => el.classList.add('is-in'));
    } else {
        const revealObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                finishReveal(entry.target);
                revealObserver.unobserve(entry.target);
            });
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
        revealEls.forEach((el) => revealObserver.observe(el));
    }

    /* Prix : compteur animé à l'apparition ------------------------------- */
    const counters = $$('[data-count]');
    if (counters.length && !reduceMotion && 'IntersectionObserver' in window) {
        const run = (el) => {
            const target = Number(el.dataset.count);
            const start = performance.now();
            const dur = 1300;
            const step = (now) => {
                const t = clamp((now - start) / dur, 0, 1);
                const eased = 1 - Math.pow(1 - t, 4);
                el.textContent = Math.round(target * eased);
                if (t < 1) requestAnimationFrame(step);
            };
            el.textContent = '0';
            requestAnimationFrame(step);
        };
        const countObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                run(entry.target);
                countObserver.unobserve(entry.target);
            });
        }, { threshold: 0.6 });
        counters.forEach((el) => countObserver.observe(el));
    }

    /* Boutons : libellé qui roule au survol ------------------------------ */
    $$('.btn:not([data-submit])').forEach((btn) => {
        const textNode = [...btn.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
        if (!textNode) return;
        const text = textNode.textContent.trim();
        const label = document.createElement('span');
        label.className = 'btn-label';
        const roll = document.createElement('span');
        roll.className = 'btn-roll';
        roll.dataset.text = text;
        roll.textContent = text;
        label.append(roll);
        textNode.replaceWith(label);
    });

    /* Effets liés au pointeur (souris uniquement) ------------------------ */
    if (finePointer && !reduceMotion) {
        // Halo et bordure lumineuse qui suivent la souris sur les cartes
        $$('[data-spot]').forEach((card) => {
            card.addEventListener('pointermove', (e) => {
                const r = card.getBoundingClientRect();
                card.style.setProperty('--mx', `${e.clientX - r.left}px`);
                card.style.setProperty('--my', `${e.clientY - r.top}px`);
            });
        });

        // Boutons magnétiques : ils suivent légèrement le curseur
        $$('.btn').forEach((btn) => {
            btn.addEventListener('pointermove', (e) => {
                const r = btn.getBoundingClientRect();
                const dx = e.clientX - (r.left + r.width / 2);
                const dy = e.clientY - (r.top + r.height / 2);
                btn.style.setProperty('--bx', `${clamp(dx * 0.22, -8, 8).toFixed(1)}px`);
                btn.style.setProperty('--by', `${clamp(dy * 0.35, -6, 6).toFixed(1)}px`);
            });
            btn.addEventListener('pointerleave', () => {
                btn.style.setProperty('--bx', '0px');
                btn.style.setProperty('--by', '0px');
            });
        });

        // Inclinaison 3D des visuels de projets
        $$('[data-tilt]').forEach((el) => {
            el.addEventListener('pointermove', (e) => {
                const r = el.getBoundingClientRect();
                const x = (e.clientX - r.left) / r.width - 0.5;
                const y = (e.clientY - r.top) / r.height - 0.5;
                el.style.setProperty('--ry', `${(x * 6).toFixed(2)}deg`);
                el.style.setProperty('--rx', `${(-y * 5).toFixed(2)}deg`);
            });
            el.addEventListener('pointerleave', () => {
                el.style.setProperty('--ry', '0deg');
                el.style.setProperty('--rx', '0deg');
            });
        });
    }

    /* Boucle liée au scroll (lecture dans requestAnimationFrame) ---------- */
    const progressBar = $('[data-progress]');

    // Phrase manifeste : les mots s'allument au fil du scroll
    const statement = $('[data-words]');
    let words = [];
    let lit = -1;
    let statementVisible = false;
    if (statement) {
        splitWords(statement, (text, i, grad) => {
            const w = document.createElement('span');
            w.className = grad ? 'w grad' : 'w';
            w.style.setProperty('--i', i);
            w.textContent = text;
            return w;
        });
        words = $$('.w', statement);
        if (reduceMotion) {
            words.forEach((w) => w.classList.add('on'));
        } else {
            new IntersectionObserver(([entry]) => { statementVisible = entry.isIntersecting; }).observe(statement);
        }
    }

    // Projets empilés : la carte recouverte recule et s'assombrit
    const stackItems = $$('[data-stack]');
    const stackMedia = window.matchMedia('(min-width: 1024px) and (min-height: 720px)');
    let stackVisible = false;
    if (stackItems.length && !reduceMotion) {
        new IntersectionObserver(([entry]) => { stackVisible = entry.isIntersecting; })
            .observe(stackItems[0].parentElement);
        stackMedia.addEventListener('change', () => {
            stackItems.forEach((item) => {
                item.firstElementChild.style.removeProperty('--stack-s');
                item.firstElementChild.style.removeProperty('--stack-o');
            });
        });
    }

    let lastY = -1;
    let lastH = -1;
    const tick = () => {
        requestAnimationFrame(tick);
        const y = window.scrollY;
        const vh = window.innerHeight;
        const moved = y !== lastY || vh !== lastH;
        lastY = y;
        lastH = vh;
        if (!moved) return;

        if (progressBar) {
            const max = document.documentElement.scrollHeight - vh;
            progressBar.style.setProperty('--progress', max > 0 ? (y / max).toFixed(4) : 0);
        }

        if (statementVisible) {
            const rect = statement.getBoundingClientRect();
            const p = (vh * 0.85 - rect.top) / (vh * 0.4 + rect.height);
            const count = clamp(Math.round(p * words.length), 0, words.length);
            if (count !== lit) {
                words.forEach((w, i) => w.classList.toggle('on', i < count));
                lit = count;
            }
        }

        if (stackVisible && stackMedia.matches) {
            const top = parseFloat(getComputedStyle(stackItems[0]).top) || 0;
            for (let i = 0; i < stackItems.length - 1; i++) {
                const card = stackItems[i].firstElementChild;
                const h = card.offsetHeight;
                const nextTop = stackItems[i + 1].getBoundingClientRect().top;
                const p = clamp((top + h - nextTop) / h, 0, 1);
                card.style.setProperty('--stack-s', (1 - p * 0.07).toFixed(4));
                card.style.setProperty('--stack-o', (1 - p * 0.6).toFixed(4));
            }
        }
    };
    requestAnimationFrame(tick);

    /* Formulaire de contact --------------------------------------------- */
    const form = $('[data-form]');
    if (!form) return;

    const offerSelect = $('#offreSelect');
    const message = $('#messageInput');
    const counter = $('[data-counter]');
    const submit = $('[data-submit]');
    const submitLabel = $('[data-submit-label]');
    const status = $('[data-status]');
    const success = $('[data-success]');

    // Choisir une offre ou une option pré-remplit le formulaire
    $$('[data-offre]').forEach((trigger) => {
        trigger.addEventListener('click', () => {
            const value = trigger.dataset.offre;
            const option = [...offerSelect.options].find((o) => o.value === value);
            if (!option) return;
            offerSelect.value = value;
            const wrap = offerSelect.closest('.select');
            wrap.classList.remove('is-flash');
            void wrap.offsetWidth;
            wrap.classList.add('is-flash');
            setTimeout(() => wrap.classList.remove('is-flash'), 1800);
        });
    });

    const updateCounter = () => {
        counter.textContent = `${message.value.length} / 1500`;
    };
    message.addEventListener('input', updateCounter);

    const fields = $$('.input[required]', form);
    const isValid = (input) => input.value.trim() !== '' && input.checkValidity();
    const showError = (input, show) => {
        const field = input.closest('.field');
        field.classList.remove('is-invalid');
        if (show) {
            void field.offsetWidth;
            field.classList.add('is-invalid');
        }
    };

    fields.forEach((input) => {
        input.addEventListener('blur', () => { if (input.value) showError(input, !isValid(input)); });
        input.addEventListener('input', () => {
            if (input.closest('.field').classList.contains('is-invalid') && isValid(input)) showError(input, false);
        });
    });

    const setBusy = (busy) => {
        submit.setAttribute('aria-busy', String(busy));
        submit.disabled = busy;
        submitLabel.textContent = busy ? 'Envoi en cours…' : 'Envoyer la demande';
    };

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        status.textContent = '';
        status.classList.remove('is-error');

        const invalid = fields.filter((input) => !isValid(input));
        fields.forEach((input) => showError(input, invalid.includes(input)));
        if (invalid.length) {
            invalid[0].focus();
            return;
        }

        setBusy(true);
        try {
            const data = Object.fromEntries(new FormData(form));
            delete data.redirect;
            const res = await fetch(form.action, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(data),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.success) throw new Error(json.message || 'Erreur');

            form.reset();
            updateCounter();
            form.hidden = true;
            success.hidden = false;
            success.focus({ preventScroll: true });
        } catch {
            status.textContent = "L'envoi a échoué. Vérifiez votre connexion puis réessayez.";
            status.classList.add('is-error');
        } finally {
            setBusy(false);
        }
    });

    $('[data-reset]').addEventListener('click', () => {
        success.hidden = true;
        form.hidden = false;
        $('#f-name').focus();
    });
})();
