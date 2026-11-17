// Cycles du Breuchin — espace d'administration simulé (démo).
// Sur un vrai projet Sur mesure : vraie authentification et base de données protégée.
(() => {
    const A = window.Atelier;
    if (!A) return;
    const SESSION = 'demo-cycles-breuchin-session';
    const $ = (s) => document.querySelector(s);
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const login = $('[data-login]');
    const dash = $('[data-dash]');
    let filter = 'tout';

    const isLogged = () => { try { return sessionStorage.getItem(SESSION) === '1'; } catch { return false; } };
    const setLogged = (v) => { try { v ? sessionStorage.setItem(SESSION, '1') : sessionStorage.removeItem(SESSION); } catch { /* ignoré */ } };

    const show = () => {
        const logged = isLogged();
        login.hidden = logged;
        dash.hidden = !logged;
        if (logged) render();
    };

    $('[data-login-form]').addEventListener('submit', (e) => {
        e.preventDefault();
        const data = new FormData(e.target);
        if (data.get('id') === 'demo' && data.get('pw') === 'demo') {
            setLogged(true);
            show();
            dash.querySelector('h1').focus?.();
        } else {
            $('[data-login-error]').textContent = 'Identifiant ou mot de passe incorrect (démo : demo / demo).';
        }
    });
    $('[data-logout]').addEventListener('click', () => { setLogged(false); show(); });

    const sorted = () => [...A.bookings].sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time));

    const renderKpis = () => {
        const today = A.iso(new Date());
        const list = A.bookings;
        const kpis = [
            ['Aujourd\'hui', list.filter((b) => b.day === today).length],
            ['À venir', list.filter((b) => b.day > today).length],
            ['En réparation', list.filter((b) => b.status === 'en-cours').length],
            ['Prêts à récupérer', list.filter((b) => b.status === 'pret').length],
        ];
        $('[data-kpis]').innerHTML = kpis.map(([label, n]) => `<li><b>${n}</b><span>${label}</span></li>`).join('');
    };

    const renderList = () => {
        const items = sorted().filter((b) => filter === 'tout' || b.status === filter);
        $('[data-list]').innerHTML = items.length ? items.map((b) => {
            const s = A.service(b.service) || { name: b.service };
            const options = Object.entries(A.STATUS).map(([v, l]) => `<option value="${v}"${v === b.status ? ' selected' : ''}>${l}</option>`).join('');
            return `<li class="resa status-${esc(b.status)}">
                <div class="resa-when"><b>${esc(A.dayLabel(b.day, { weekday: 'short', day: 'numeric', month: 'short' }))}</b><span>${esc(b.time.replace(':', ' h '))}</span></div>
                <div class="resa-who"><b>${esc(b.name)}</b><span>${esc(s.name)} · ${esc(b.phone)}</span></div>
                <label class="resa-status"><span class="sr">Statut de ${esc(b.name)}</span><select data-status="${esc(b.id)}">${options}</select></label>
                <button class="icon-btn" type="button" data-remove="${esc(b.id)}" aria-label="Supprimer la réservation de ${esc(b.name)}">✕</button>
            </li>`;
        }).join('') : '<li class="empty">Aucune réservation dans cette catégorie.</li>';
    };

    const renderPrices = () => {
        $('[data-prices]').innerHTML = A.services.map((s) => `
            <div class="price-row">
                <label for="p-${esc(s.id)}">${esc(s.name)}</label>
                <div class="price-input"><input id="p-${esc(s.id)}" type="number" min="0" step="1" inputmode="decimal" value="${esc(s.price)}" data-price="${esc(s.id)}"><span>€</span></div>
            </div>`).join('') + '<button class="btn btn-small" type="submit">Enregistrer les tarifs</button>';
    };

    const render = () => {
        $('[data-today]').textContent = A.dayLabel(A.iso(new Date()));
        renderKpis();
        renderList();
        renderPrices();
    };

    document.addEventListener('change', (e) => {
        const sel = e.target.closest('[data-status]');
        if (!sel) return;
        A.setStatus(sel.dataset.status, sel.value);
        renderKpis();
        renderList();
        window.demoSay?.(sel.value === 'pret' ? 'Statut « Prêt » : sur le vrai site, le client reçoit un SMS.' : 'Statut mis à jour.');
    });
    document.addEventListener('click', (e) => {
        const rm = e.target.closest('[data-remove]');
        if (rm) { A.removeBooking(rm.dataset.remove); renderKpis(); renderList(); return; }
        const f = e.target.closest('[data-filter]');
        if (f) {
            filter = f.dataset.filter;
            document.querySelectorAll('[data-filter]').forEach((b) => {
                const on = b === f;
                b.classList.toggle('is-active', on);
                b.setAttribute('aria-pressed', String(on));
            });
            renderList();
        }
    });
    $('[data-prices]').addEventListener('submit', (e) => {
        e.preventDefault();
        e.target.querySelectorAll('[data-price]').forEach((input) => {
            const v = Number(input.value);
            if (Number.isFinite(v) && v >= 0) A.setPrice(input.dataset.price, v);
        });
        window.demoSay?.('Tarifs enregistrés : ils sont déjà à jour sur le site.');
    });
    $('[data-reset]').addEventListener('click', () => { A.reset(); render(); window.demoSay?.('Données d\'exemple remises en place.'); });

    show();
})();
