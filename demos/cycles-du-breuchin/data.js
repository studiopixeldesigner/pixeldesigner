// Cycles du Breuchin — démo Sur mesure.
// Simule la base de données d'un vrai projet : ici tout reste dans le navigateur du visiteur
// (localStorage). Sur un vrai site Sur mesure, ces données vivent dans une base sécurisée.
window.Atelier = (() => {
    const KEY = 'demo-cycles-breuchin-v1';
    const SLOTS = ['09:00', '10:30', '14:00', '15:30', '17:00'];
    const OPEN_DAYS = [2, 3, 4, 5, 6]; // mardi -> samedi

    const pad = (n) => String(n).padStart(2, '0');
    const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    // Les prochains jours d'ouverture, à partir de demain
    const nextDays = (count = 6) => {
        const days = [];
        const d = new Date();
        d.setHours(12, 0, 0, 0);
        while (days.length < count) {
            d.setDate(d.getDate() + 1);
            if (OPEN_DAYS.includes(d.getDay())) days.push(iso(d));
        }
        return days;
    };

    const seed = () => {
        const days = nextDays(3);
        const today = iso(new Date());
        return {
            services: [
                { id: 'revision', name: 'Révision complète', duration: '1 h 30', price: 59, text: 'Freins, transmission, roues, serrages : votre vélo repart comme neuf.' },
                { id: 'crevaison', name: 'Réparation crevaison', duration: '20 min', price: 15, text: 'Chambre à air ou tubeless, réparé pendant que vous attendez.' },
                { id: 'reglages', name: 'Réglage freins et vitesses', duration: '45 min', price: 29, text: 'Des vitesses qui passent net et des freins qui mordent.' },
                { id: 'vae', name: 'Diagnostic vélo électrique', duration: '1 h', price: 39, text: 'Batterie, moteur, capteurs : lecture des codes et bilan écrit.' },
            ],
            bookings: [
                { id: 'b1', service: 'revision', day: today, time: '09:00', name: 'Camille (exemple)', phone: '06 XX XX XX XX', status: 'pret' },
                { id: 'b2', service: 'vae', day: today, time: '14:00', name: 'Hugo (exemple)', phone: '06 XX XX XX XX', status: 'en-cours' },
                { id: 'b3', service: 'crevaison', day: days[0], time: '10:30', name: 'Léa (exemple)', phone: '07 XX XX XX XX', status: 'a-faire' },
                { id: 'b4', service: 'reglages', day: days[1], time: '15:30', name: 'Marc (exemple)', phone: '06 XX XX XX XX', status: 'a-faire' },
            ],
        };
    };

    const load = () => {
        try {
            const raw = localStorage.getItem(KEY);
            if (raw) return JSON.parse(raw);
        } catch { /* stockage indisponible : on repart des données d'exemple */ }
        return seed();
    };
    let state = load();
    const save = () => {
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* navigation privée */ }
    };

    const STATUS = { 'a-faire': 'À faire', 'en-cours': 'En cours', pret: 'Prêt à récupérer' };
    const dayLabel = (day, opts = { weekday: 'long', day: 'numeric', month: 'long' }) =>
        new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR', opts);
    const euro = (n) => `${Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;

    return {
        SLOTS, STATUS, nextDays, dayLabel, euro, iso,
        get services() { return state.services; },
        get bookings() { return state.bookings; },
        service: (id) => state.services.find((s) => s.id === id),
        isTaken: (day, time) => state.bookings.some((b) => b.day === day && b.time === time),
        addBooking(booking) {
            const entry = { id: `b${Date.now()}`, status: 'a-faire', ...booking };
            state.bookings.push(entry);
            save();
            return entry;
        },
        setStatus(id, status) { const b = state.bookings.find((x) => x.id === id); if (b) { b.status = status; save(); } },
        removeBooking(id) { state.bookings = state.bookings.filter((b) => b.id !== id); save(); },
        setPrice(id, price) { const s = state.services.find((x) => x.id === id); if (s) { s.price = price; save(); } },
        reset() { state = seed(); save(); },
    };
})();
