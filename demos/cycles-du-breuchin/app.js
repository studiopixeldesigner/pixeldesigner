// Cycles du Breuchin — page publique : tarifs et réservation, lus dans les données de l'atelier.
(() => {
    const A = window.Atelier;
    if (!A) return;
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    /* Tarifs */
    const tarifs = document.querySelector('[data-tarifs]');
    if (tarifs) {
        tarifs.innerHTML = A.services.map((s, i) => `
            <article class="tarif${i === 0 ? ' tarif-main' : ''}">
                <p class="tarif-time">${esc(s.duration)}</p>
                <h3>${esc(s.name)}</h3>
                <p>${esc(s.text)}</p>
                <p class="tarif-price">${esc(A.euro(s.price))}</p>
            </article>`).join('');
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

    servicesBox.innerHTML = A.services.map((s, i) => `
        <label class="choice">
            <input type="radio" name="service" value="${esc(s.id)}"${i === 0 ? ' checked' : ''}>
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
            <a href="admin.html">Voir la réservation dans l'espace admin</a>`;
        confirmBox.classList.add('is-ok');
        confirmBox.focus();
        form.querySelector('#b-nom').value = '';
        form.querySelector('#b-tel').value = '';
        renderTimes();
    });
})();
