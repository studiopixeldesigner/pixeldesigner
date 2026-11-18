// Petit script commun aux sites de démonstration (aucune dépendance).
// Apparition au scroll, en-tête compact, menu mobile, et « faux » boutons d'appel
// et formulaires : sur un site de démo, rien n'est envoyé ni appelé.
(() => {
    const root = document.documentElement;
    root.classList.add('js');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* Apparition au scroll */
    const items = document.querySelectorAll('[data-reveal]');
    if (reduce || !('IntersectionObserver' in window)) {
        items.forEach((el) => el.classList.add('is-in'));
    } else {
        const io = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-in');
                io.unobserve(entry.target);
            });
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
        items.forEach((el) => io.observe(el));
    }

    /* Apparition en cascade : chaque enfant [data-reveal] d'un [data-stagger] attend un peu plus */
    document.querySelectorAll('[data-stagger]').forEach((group) => {
        const step = Number(group.dataset.stagger) || 90;
        group.querySelectorAll(':scope > [data-reveal]').forEach((el, i) => {
            el.style.transitionDelay = `${i * step}ms`;
        });
    });

    /* Entrée du haut de page, dès le chargement */
    requestAnimationFrame(() => root.classList.add('is-loaded'));

    /* Barre de progression de lecture + bouton retour en haut */
    const bar = document.createElement('div');
    bar.className = 'demo-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.append(bar);
    const top = document.createElement('a');
    top.className = 'demo-top';
    top.href = '#';
    top.setAttribute('aria-label', 'Revenir en haut de la page');
    top.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    top.addEventListener('click', (e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); });
    document.body.append(top);

    /* Parallaxe légère */
    const parallax = reduce ? [] : [...document.querySelectorAll('[data-parallax]')];

    let ticking = false;
    const onFrame = () => {
        ticking = false;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
        top.classList.toggle('is-visible', window.scrollY > window.innerHeight * 0.8);
        parallax.forEach((el) => {
            const r = el.getBoundingClientRect();
            if (r.bottom < 0 || r.top > window.innerHeight) return;
            const center = r.top + r.height / 2 - window.innerHeight / 2;
            el.style.transform = `translate3d(0, ${(center * -(Number(el.dataset.parallax) || 0.08)).toFixed(1)}px, 0)`;
        });
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onFrame); } }, { passive: true });
    onFrame();

    /* Comparateur avant / après */
    document.querySelectorAll('[data-compare]').forEach((box) => {
        const input = box.querySelector('input[type="range"]');
        if (!input) return;
        const set = () => box.style.setProperty('--pos', `${input.value}%`);
        input.addEventListener('input', set);
        set();
    });

    /* Filtres d'une galerie */
    document.querySelectorAll('[data-filter-group]').forEach((group) => {
        const target = document.getElementById(group.dataset.filterGroup);
        if (!target) return;
        group.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-filter-value]');
            if (!btn) return;
            const value = btn.dataset.filterValue;
            group.querySelectorAll('[data-filter-value]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
            target.querySelectorAll('[data-cat]').forEach((item) => {
                item.hidden = value !== 'tout' && !item.dataset.cat.split(' ').includes(value);
            });
        });
    });

    /* En-tête qui se compacte */
    const header = document.querySelector('[data-header]');
    if (header) {
        const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 40);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
    }

    /* Menu mobile */
    const burger = document.querySelector('[data-burger]');
    if (burger) {
        const menu = document.getElementById(burger.getAttribute('aria-controls'));
        const setOpen = (open) => {
            // Le menu commence sous l'en-tête, quelle que soit sa position (bandeau démo visible ou non)
            const head = burger.closest('header');
            if (open && head) menu.style.setProperty('--menu-top', `${Math.round(head.getBoundingClientRect().bottom)}px`);
            burger.setAttribute('aria-expanded', String(open));
            menu.classList.toggle('is-open', open);
            document.body.classList.toggle('menu-open', open);
        };
        burger.addEventListener('click', () => setOpen(burger.getAttribute('aria-expanded') !== 'true'));
        menu.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') {
                setOpen(false);
                burger.focus();
            }
        });
    }

    /* Message de démonstration */
    let toast;
    let timer;
    const say = (text) => {
        if (!toast) {
            toast = document.createElement('p');
            toast.className = 'demo-toast';
            toast.setAttribute('role', 'status');
            document.body.append(toast);
        }
        toast.textContent = text;
        toast.classList.add('is-visible');
        clearTimeout(timer);
        timer = setTimeout(() => toast.classList.remove('is-visible'), 4200);
    };
    window.demoSay = say;

    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('[data-demo]');
        if (!trigger) return;
        e.preventDefault();
        say(trigger.dataset.demo || 'Site de démonstration : sur un vrai site, ce bouton fonctionne.');
    });

    document.querySelectorAll('form[data-demo-form]').forEach((form) => {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!form.reportValidity()) return;
            const status = form.querySelector('[data-form-status]');
            if (status) {
                status.textContent = form.dataset.demoForm || 'Merci, votre demande est bien partie. (Démo : rien n\'a été envoyé.)';
                status.classList.add('is-ok');
            }
            form.reset();
        });
    });
})();
