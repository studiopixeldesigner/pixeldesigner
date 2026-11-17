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
