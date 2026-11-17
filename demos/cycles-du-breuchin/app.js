// Cycles du Breuchin — page publique : tarifs et réservation, lus dans les données de l'atelier.
(() => {
    const A = window.Atelier;
    if (!A) return;
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    /* Tarifs */
    const tarifs = document.querySelector('[data-tarifs]');
    if (tarifs) {
        tarifs.innerHTML = A.services.map((s, i) => `
            <article class="tarif${i === 0 ? ' tarif-main' : ''}" data-reveal>
                <p class="tarif-time">${esc(s.duration)}</p>
                <h3>${esc(s.name)}</h3>
                <p>${esc(s.text)}</p>
                <p class="tarif-price">${esc(A.euro(s.price))}</p>
            </article>`).join('');
        tarifs.querySelectorAll('[data-reveal]').forEach((el, i) => {
            el.style.transitionDelay = `${i * 90}ms`;
            requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
        });
    }

    /* Suivi de réparation */
    const suivi = document.querySelector('[data-suivi]');
    if (suivi) {
        const out = document.querySelector('[data-suivi-result]');
        const STEPS = [['a-faire', 'Réservation confirmée'], ['en-cours', 'Réparation en cours'], ['pret', 'Prêt à récupérer']];
        const show = (code) => {
            const b = A.byCode(code);
            if (!b) {
                out.innerHTML = `<p class="suivi-empty">Aucune réparation ne correspond au code <b>${esc(code)}</b>. Vérifiez le code reçu par SMS (exemple&nbsp;: BR-1002).</p>`;
                return;
            }
            const s = A.service(b.service) || { name: b.service };
            const idx = STEPS.findIndex(([v]) => v === b.status);
            out.innerHTML = `
                <div class="suivi-card">
                    <p class="label">Réparation ${esc(b.code)}</p>
                    <h2>${esc(s.name)}</h2>
                    <p class="suivi-meta">Dépôt prévu ${esc(A.dayLabel(b.day))} à ${esc(b.time.replace(':', ' h '))}</p>
                    <ol class="track track-light">
                        ${STEPS.map(([, label], i) => `<li class="${i < idx ? 'done' : i === idx ? 'now' : ''}"><span></span>${label}</li>`).join('')}
                    </ol>
                    <p class="suivi-note">${b.status === 'pret' ? 'Votre vélo vous attend à l\'atelier, aux heures d\'ouverture.' : 'Vous recevez un SMS dès que le statut change.'}</p>
                </div>`;
        };
        suivi.addEventListener('submit', (e) => {
            e.preventDefault();
            const code = String(new FormData(suivi).get('code') || '').trim();
            if (code) show(code);
        });
        document.querySelectorAll('[data-try-code]').forEach((btn) => btn.addEventListener('click', () => {
            suivi.querySelector('input').value = btn.dataset.tryCode;
            show(btn.dataset.tryCode);
        }));
        const fromUrl = new URLSearchParams(location.search).get('code');
        if (fromUrl) { suivi.querySelector('input').value = fromUrl; show(fromUrl); }
    }

    /* Réservation */
    const form = document.querySelector('[data-booking]');
    if (!form) return;
    const servicesBox = form.querySelector('[data-services]');
    const daysBox = form.querySelector('[data-days]');
    const timesBox = form.querySelector('[data-times]');
    const error = form.querySelector('[data-error]');
    const confirmBox = form.querySelector('[data-confirm]');
    const days = A.nextDays(6);
    let day = days[0];

    const wanted = new URLSearchParams(location.search).get('service');
    const first = A.services.some((s) => s.id === wanted) ? wanted : A.services[0].id;
    servicesBox.innerHTML = A.services.map((s) => `
        <label class="choice">
            <input type="radio" name="service" value="${esc(s.id)}"${s.id === first ? ' checked' : ''}>
            <span><b>${esc(s.name)}</b><small>${esc(s.duration)} · ${esc(A.euro(s.price))}</small></span>
        </label>`).join('');

    const renderDays = () => {
        daysBox.innerHTML = days.map((d) => `
            <button type="button" class="day${d === day ? ' is-active' : ''}" data-day="${d}" aria-pressed="${d === day}">
                <small>${esc(A.dayLabel(d, { weekday: 'short' }))}</small><b>${esc(A.dayLabel(d, { day: 'numeric' }))}</b><small>${esc(A.dayLabel(d, { month: 'short' }))}</small>
            </button>`).join('');
    };
    const renderTimes = () => {
        timesBox.innerHTML = A.SLOTS.map((t) => {
            const taken = A.isTaken(day, t);
            return `<label class="time${taken ? ' is-taken' : ''}">
                <input type="radio" name="time" value="${t}"${taken ? ' disabled' : ''}>
                <span>${t.replace(':', ' h ')}${taken ? '<small>Pris</small>' : ''}</span>
            </label>`;
        }).join('');
    };
    renderDays();
    renderTimes();

    daysBox.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-day]');
        if (!btn) return;
        day = btn.dataset.day;
        renderDays();
        renderTimes();
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        error.textContent = '';
        const data = new FormData(form);
        if (data.get('site')) return; // robot
        const time = data.get('time');
        const name = String(data.get('name') || '').trim();
        const phone = String(data.get('phone') || '').trim();
        if (!time) { error.textContent = 'Choisissez une heure de dépôt.'; return; }
        if (!name || !phone) { error.textContent = 'Indiquez votre nom et votre téléphone.'; form.querySelector(name ? '#b-tel' : '#b-nom').focus(); return; }
        const booking = A.addBooking({ service: data.get('service'), day, time, name, phone });
        const s = A.service(booking.service);
        confirmBox.innerHTML = `<b>C'est réservé&nbsp;!</b> ${esc(s.name)}, ${esc(A.dayLabel(day))} à ${esc(time.replace(':', ' h '))}.
            <span class="confirm-code">Votre code de suivi&nbsp;: <b>${esc(booking.code)}</b></span>
            <a href="suivi.html?code=${encodeURIComponent(booking.code)}">Suivre ma réparation</a>
            <a href="admin.html">Voir la réservation dans l'espace atelier</a>`;
        confirmBox.classList.add('is-ok');
        confirmBox.focus();
        form.querySelector('#b-nom').value = '';
        form.querySelector('#b-tel').value = '';
        renderTimes();
    });
})();
