// Page d'administration : gère les réalisations du site sans toucher au code.
// Les projets sont enregistrés dans le dépôt GitHub du site (assets/data/projects.json, images dans
// assets/img/) et le bloc correspondant de index.html est régénéré : le site reste entièrement statique.
// Une publication = un seul commit, fait avec la clé d'accès GitHub saisie par l'utilisateur.
import { renderProject, replaceBlock, formatDate, imagePaths } from './projects-template.js';

const OWNER = 'studiopixeldesigner';
const REPO = 'pixeldesigner';
const BRANCH = 'main';
const DATA_PATH = 'assets/data/projects.json';
const PAGE_PATH = 'index.html';
const TOKEN_KEY = 'pixeldesigner-admin-token';

// Banc d'essai : en local uniquement, avec ?mock, la page parle à une fausse API GitHub
const MOCK = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('mock');
const API = MOCK ? `${location.origin}/__mock_github__` : 'https://api.github.com';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const clone = (value) => JSON.parse(JSON.stringify(value));
const BLANK_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

const state = {
    token: '',
    base: null,           // version en ligne : { commitSha, raw, data }
    projects: [],         // version de travail
    uploads: new Map(),   // images à envoyer : nom de base -> { blobs, width, height }
    previews: new Map(),  // aperçus locaux des images ajoutées dans cette session : nom de base -> adresse blob:
    busy: false,
};

/* Messages d'erreur ------------------------------------------------------ */

class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

// Erreur dont le message est déjà rédigé pour l'utilisateur
class UserError extends Error {}

const explain = (err) => {
    if (err instanceof UserError) return err.message;
    if (err instanceof ApiError) {
        if (err.status === 401) return "GitHub refuse cette clé. Vérifiez qu'elle est complète et qu'elle n'a pas expiré.";
        if (err.status === 403 && /rate limit/i.test(err.message)) return 'GitHub limite temporairement les requêtes. Réessayez dans quelques minutes.';
        if (err.status === 403) return "Cette clé n'a pas le droit de modifier le site. Sur GitHub, vérifiez qu'elle porte sur le dépôt « pixeldesigner » et que sa permission « Contents » est réglée sur « Read and write ».";
        if (err.status === 404) return "Cette clé ne donne pas accès au dépôt « pixeldesigner ». Vérifiez le dépôt choisi à la création de la clé.";
        if (err.status === 409 || err.status === 422) return 'Le site a changé pendant la publication. Rechargez la page puis réessayez.';
        return `GitHub a répondu par une erreur (${err.status}) : ${err.message}`;
    }
    if (err instanceof TypeError) return 'Connexion à GitHub impossible. Vérifiez votre connexion internet puis réessayez.';
    return err?.message || 'Une erreur inattendue est survenue.';
};

/* API GitHub -------------------------------------------------------------- */

const gh = async (path, { method = 'GET', body, raw = false } = {}) => {
    const res = await fetch(`${API}/repos/${OWNER}/${REPO}${path}`, {
        method,
        cache: 'no-store',
        headers: {
            Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
            Authorization: `Bearer ${state.token}`,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
        let message = res.statusText;
        try { message = (await res.json()).message || message; } catch { /* réponse sans JSON */ }
        throw new ApiError(res.status, message);
    }
    return raw ? res.text() : res.json();
};

const toBase64 = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
});

/* Vues et messages -------------------------------------------------------- */

const show = (view) => {
    $$('[data-view]').forEach((el) => { el.hidden = el.dataset.view !== view; });
    $('[data-logout]').hidden = view !== 'dash';
    if (view !== 'dash') $('[data-publish-bar]').hidden = true;
};

const notice = (text, kind = '') => {
    const el = $('[data-notice]');
    el.textContent = text;
    el.className = `notice${kind ? ` notice--${kind}` : ''}`;
    el.hidden = !text;
};

const confirmDialog = (title, text, okLabel) => new Promise((resolve) => {
    const dialog = $('[data-confirm]');
    $('[data-confirm-title]').textContent = title;
    $('[data-confirm-text]').textContent = text;
    $('[data-confirm-ok]').textContent = okLabel;
    dialog.returnValue = 'cancel';
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
    dialog.showModal();
});

/* Connexion ---------------------------------------------------------------- */

const storedToken = () => sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';

const forgetToken = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    state.token = '';
};

const loadData = async () => {
    const ref = await gh(`/git/ref/heads/${BRANCH}`);
    const commitSha = ref.object.sha;
    const raw = await gh(`/contents/${DATA_PATH}?ref=${commitSha}`, { raw: true });
    const data = JSON.parse(raw);
    state.base = { commitSha, raw, data };
    state.projects = clone(data.projects);
    state.uploads.clear();
};

const connect = async (token, remember) => {
    state.token = token;
    const repo = await gh('');
    if (!repo.permissions?.push) throw new ApiError(403, 'lecture seule');
    // Vérifie le droit d'écriture tout de suite, plutôt qu'au moment de publier : l'envoi d'un
    // contenu vide ne modifie rien dans le dépôt, mais GitHub le refuse à une clé en lecture seule.
    await gh('/git/blobs', { method: 'POST', body: { content: '', encoding: 'utf-8' } });
    await loadData();
    sessionStorage.setItem(TOKEN_KEY, token);
    if (remember) localStorage.setItem(TOKEN_KEY, token);
    render();
    show('dash');
};

const initLogin = () => {
    const form = $('[data-login-form]');
    const field = $('[data-field="token"]');
    const error = $('#token-err');
    const submit = $('[data-login-submit]');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const token = form.token.value.trim();
        field.classList.remove('is-invalid');
        error.textContent = '';
        if (!token) {
            field.classList.add('is-invalid');
            error.textContent = "Collez votre clé d'accès.";
            form.token.focus();
            return;
        }
        submit.setAttribute('aria-busy', 'true');
        submit.disabled = true;
        try {
            await connect(token, form.remember.checked);
            form.reset();
        } catch (err) {
            forgetToken();
            field.classList.add('is-invalid');
            error.textContent = explain(err);
            form.token.focus();
        } finally {
            submit.removeAttribute('aria-busy');
            submit.disabled = false;
        }
    });

    $('[data-logout]').addEventListener('click', async () => {
        if (isDirty() && !(await confirmDialog('Se déconnecter ?', 'Vos modifications non publiées seront perdues.', 'Se déconnecter'))) return;
        forgetToken();
        state.base = null;
        state.projects = [];
        state.uploads.clear();
        show('login');
        $('#token').focus();
    });
};

/* Liste des projets -------------------------------------------------------- */

const isDirty = () => !!state.base && JSON.stringify(state.projects) !== JSON.stringify(state.base.data.projects);

const changes = () => {
    const before = state.base.data.projects;
    const beforeById = new Map(before.map((p) => [p.id, p]));
    const nowIds = new Set(state.projects.map((p) => p.id));
    const added = state.projects.filter((p) => !beforeById.has(p.id));
    const removed = before.filter((p) => !nowIds.has(p.id));
    const edited = state.projects.filter((p) => beforeById.has(p.id) && JSON.stringify(p) !== JSON.stringify(beforeById.get(p.id)));
    const keptBefore = before.filter((p) => nowIds.has(p.id)).map((p) => p.id).join('|');
    const keptNow = state.projects.filter((p) => beforeById.has(p.id)).map((p) => p.id).join('|');
    return { added, removed, edited, reordered: keptBefore !== keptNow };
};

const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

const pendingText = () => {
    const { added, removed, edited, reordered } = changes();
    const parts = [];
    if (added.length) parts.push(plural(added.length, 'ajout', 'ajouts'));
    if (edited.length) parts.push(plural(edited.length, 'modification', 'modifications'));
    if (removed.length) parts.push(plural(removed.length, 'suppression', 'suppressions'));
    if (reordered) parts.push('nouvel ordre');
    return `Non publié : ${parts.join(', ')}.`;
};

const commitMessage = () => {
    const { added, removed, edited, reordered } = changes();
    const quote = (list) => list.map((p) => `« ${p.title} »`).join(', ');
    const parts = [];
    if (added.length) parts.push(`ajout de ${quote(added)}`);
    if (edited.length) parts.push(`modification de ${quote(edited)}`);
    if (removed.length) parts.push(`suppression de ${quote(removed)}`);
    if (reordered) parts.push('nouvel ordre');
    return `Réalisations : ${parts.join(' ; ')}\n\nPublié depuis la page d'administration.`;
};

const thumbSrc = (project) => state.previews.get(project.image) || imagePaths(project.image).small;

const iconButton = (icon, label, onClick, { danger = false, disabled = false } = {}) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `icon-btn${danger ? ' icon-btn--danger' : ''}`;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.disabled = disabled;
    const i = document.createElement('i');
    i.className = `ph ph-${icon}`;
    i.setAttribute('aria-hidden', 'true');
    button.append(i);
    button.addEventListener('click', onClick);
    return button;
};

const render = () => {
    const list = $('[data-list]');
    const beforeById = new Map(state.base.data.projects.map((p) => [p.id, p]));
    list.replaceChildren(...state.projects.map((project, index) => {
        const li = document.createElement('li');
        li.className = 'project card';

        const img = document.createElement('img');
        img.className = 'project-thumb';
        img.src = thumbSrc(project);
        img.alt = '';
        img.width = 320;
        img.height = 180;
        img.loading = 'lazy';

        const info = document.createElement('div');
        info.className = 'project-info';
        const title = document.createElement('h2');
        title.className = 'project-title';
        title.textContent = project.title;
        const original = beforeById.get(project.id);
        if (!original || JSON.stringify(original) !== JSON.stringify(project)) {
            const badge = document.createElement('span');
            badge.className = 'badge badge--new';
            badge.textContent = original ? 'Modifié' : 'Nouveau';
            title.append(' ', badge);
        }
        const meta = document.createElement('p');
        meta.className = 'meta';
        const where = document.createElement('span');
        where.textContent = [project.category, project.city].filter(Boolean).join(' · ');
        const when = document.createElement('span');
        when.textContent = formatDate(project.date);
        meta.append(where, when);
        const desc = document.createElement('p');
        desc.className = 'muted';
        desc.textContent = project.description;
        info.append(title, meta, desc);

        const actions = document.createElement('div');
        actions.className = 'project-actions';
        actions.append(
            iconButton('arrow-up', `Monter « ${project.title} »`, () => move(index, -1), { disabled: index === 0 }),
            iconButton('arrow-down', `Descendre « ${project.title} »`, () => move(index, 1), { disabled: index === state.projects.length - 1 }),
            iconButton('pencil-simple', `Modifier « ${project.title} »`, () => openEditor(project)),
            iconButton('trash', `Supprimer « ${project.title} »`, () => removeProject(project), { danger: true }),
        );

        li.append(img, info, actions);
        return li;
    }));

    const dirty = isDirty();
    $('[data-publish-bar]').hidden = !dirty;
    if (dirty) $('[data-pending-text]').textContent = pendingText();
};

const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= state.projects.length) return;
    [state.projects[index], state.projects[target]] = [state.projects[target], state.projects[index]];
    render();
    // Le bouton suit le projet déplacé, pour enchaîner au clavier
    const buttons = $$('.project', $('[data-list]'))[target].querySelectorAll('.icon-btn');
    (buttons[delta < 0 ? 0 : 1].disabled ? buttons[delta < 0 ? 1 : 0] : buttons[delta < 0 ? 0 : 1]).focus();
};

const removeProject = async (project) => {
    if (state.projects.length === 1) {
        notice('Gardez au moins un projet : la section « Mes réalisations » ne peut pas rester vide.', 'error');
        return;
    }
    if (!(await confirmDialog(`Supprimer « ${project.title} » ?`, 'Le projet disparaîtra du site à la prochaine publication.', 'Supprimer'))) return;
    state.projects = state.projects.filter((p) => p.id !== project.id);
    state.uploads.delete(project.image);
    notice('');
    render();
};

/* Images -------------------------------------------------------------------- */

const slugify = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'projet';

const canvasBlob = (canvas, type, quality) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
        if (blob && blob.type === type) resolve(blob);
        else reject(new UserError("Ce navigateur ne sait pas préparer les images. Utilisez Chrome, Edge ou Firefox."));
    }, type, quality);
});

// Recadre en 16:9 au maximum (en gardant le haut de la capture) et produit les trois fichiers du site
const prepareImage = async (file) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new UserError('Format non pris en charge : choisissez une image PNG, JPEG ou WebP.');
    let bitmap;
    try {
        bitmap = await createImageBitmap(file);
    } catch {
        throw new UserError("Cette image n'a pas pu être lue. Essayez avec un autre fichier.");
    }
    if (bitmap.width < 900) throw new UserError(`Cette image est trop petite (${bitmap.width} pixels de large). Il en faut au moins 900, idéalement 1600.`);
    const sourceHeight = Math.min(bitmap.height, Math.round(bitmap.width * 9 / 16));
    const draw = (width) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = Math.round(sourceHeight * width / bitmap.width);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0d0d11';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bitmap, 0, 0, bitmap.width, sourceHeight, 0, 0, canvas.width, canvas.height);
        return canvas;
    };
    const large = draw(1600);
    const small = draw(900);
    const blobs = {
        small: await canvasBlob(small, 'image/webp', 0.8),
        large: await canvasBlob(large, 'image/webp', 0.82),
        fallback: await canvasBlob(large, 'image/jpeg', 0.84),
    };
    return { blobs, width: large.width, height: large.height, upscaled: bitmap.width < 1600, previewUrl: URL.createObjectURL(blobs.small) };
};

/* Fiche d'un projet -------------------------------------------------------- */

const editor = {
    dialog: null,
    form: null,
    project: null,   // projet en cours de modification, ou null pour un ajout
    image: null,     // nouvelle image préparée, pas encore enregistrée
    altTouched: false,
};

const readTags = (value) => value.split(',').map((tag) => tag.trim()).filter(Boolean);

const draftFromForm = () => {
    const f = editor.form;
    const base = editor.project || {};
    return {
        id: base.id || '',
        title: f.title.value.trim(),
        category: f.category.value.trim(),
        city: f.city.value.trim(),
        date: f.date.value.trim(),
        description: f.description.value.trim(),
        tags: readTags(f.tags.value),
        url: f.url.value.trim(),
        image: base.image || '',
        imageWidth: editor.image?.width || base.imageWidth || 1600,
        imageHeight: editor.image?.height || base.imageHeight || 900,
        alt: f.alt.value.trim(),
    };
};

const updatePreview = () => {
    const draft = draftFromForm();
    const previewSrc = editor.image?.previewUrl || (draft.image ? state.previews.get(draft.image) || imagePaths(draft.image).small : BLANK_IMAGE);
    $('[data-preview]').innerHTML = renderProject({
        ...draft,
        title: draft.title || 'Nom du projet',
        category: draft.category || 'Catégorie',
        description: draft.description || 'Description du projet.',
        url: draft.url || 'https://exemple.fr/',
    }, { indent: '', previewSrc });
    $(`[data-count-for="description"]`).textContent = `${editor.form.description.value.length} / 160`;
};

const showThumb = (src, label) => {
    const thumb = $('[data-thumb]');
    thumb.hidden = !src;
    if (src) thumb.src = src;
    $('[data-image-state]').textContent = label;
};

const setInvalid = (name, invalid, message) => {
    const field = $(`[data-field="${name}"]`, editor.dialog);
    field.classList.toggle('is-invalid', invalid);
    if (message) $('.field-error', field).textContent = message;
    return invalid;
};

const handleFile = async (file) => {
    if (!file) return;
    showThumb('', 'Préparation de l’image…');
    try {
        const prepared = await prepareImage(file);
        if (editor.image) URL.revokeObjectURL(editor.image.previewUrl);
        editor.image = prepared;
        setInvalid('image', false);
        showThumb(prepared.previewUrl, prepared.upscaled
            ? 'Image ajoutée, mais elle est un peu petite : elle risque d’être légèrement floue.'
            : 'Image prête.');
    } catch (err) {
        const current = editor.project?.image;
        showThumb(current ? thumbSrc(editor.project) : '', current ? 'Image actuelle conservée.' : 'Aucune image');
        setInvalid('image', true, explain(err));
    }
    updatePreview();
};

const openEditor = (project = null) => {
    const f = editor.form;
    editor.project = project;
    editor.image = null;
    editor.altTouched = !!project;
    f.reset();
    $$('.field', editor.dialog).forEach((field) => field.classList.remove('is-invalid'));
    $('[data-image-error]').textContent = "Ajoutez une capture d'écran du site.";
    $('[data-editor-title]').textContent = project ? `Modifier « ${project.title} »` : 'Nouveau projet';
    if (project) {
        f.title.value = project.title;
        f.category.value = project.category;
        f.city.value = project.city || '';
        f.date.value = project.date;
        f.description.value = project.description;
        f.tags.value = project.tags.join(', ');
        f.url.value = project.url;
        f.alt.value = project.alt;
        showThumb(thumbSrc(project), 'Image actuelle. Choisissez-en une autre pour la remplacer.');
    } else {
        showThumb('', 'Aucune image');
    }
    updatePreview();
    editor.dialog.showModal();
    $('.editor-body', editor.dialog).scrollTop = 0;
    f.title.focus();
};

const validate = (draft) => {
    let firstInvalid = null;
    const check = (name, invalid, message) => {
        if (setInvalid(name, invalid, message) && !firstInvalid) firstInvalid = name;
    };
    check('title', !draft.title);
    check('category', !draft.category);
    check('date', !/^\d{4}-(0[1-9]|1[0-2])$/.test(draft.date), 'Indiquez le mois au format AAAA-MM, par exemple 2026-10.');
    let urlOk = false;
    try { urlOk = ['http:', 'https:'].includes(new URL(draft.url).protocol); } catch { /* adresse invalide */ }
    check('url', !urlOk);
    check('description', !draft.description);
    check('tags', draft.tags.length > 4 || draft.tags.some((tag) => tag.length > 30));
    check('image', !editor.image && !draft.image, "Ajoutez une capture d'écran du site.");
    check('alt', !draft.alt);
    return firstInvalid;
};

const saveEditor = () => {
    const draft = draftFromForm();
    const firstInvalid = validate(draft);
    if (firstInvalid) {
        const target = firstInvalid === 'image' ? $('#p-image') : editor.form[firstInvalid];
        target.focus();
        $(`[data-field="${firstInvalid}"]`, editor.dialog).scrollIntoView({ block: 'center' });
        return;
    }
    if (!draft.id) {
        const taken = new Set([...state.projects, ...state.base.data.projects].map((p) => p.id));
        const root = slugify(draft.title);
        let id = root;
        for (let n = 2; taken.has(id); n++) id = `${root}-${n}`;
        draft.id = id;
    }
    if (editor.image) {
        // Une image remplacée avant publication n'a plus besoin d'être envoyée
        if (draft.image) state.uploads.delete(draft.image);
        // Nom unique à chaque envoi : le navigateur des visiteurs ne garde pas l'ancienne image en cache
        draft.image = `${slugify(draft.title)}-${Date.now().toString(36).slice(-5)}`;
        state.uploads.set(draft.image, { blobs: editor.image.blobs });
        state.previews.set(draft.image, editor.image.previewUrl);
        editor.image = null;
    }
    const index = state.projects.findIndex((p) => p.id === draft.id);
    if (index === -1) state.projects.push(draft);
    else state.projects[index] = draft;
    editor.dialog.close();
    notice('');
    render();
};

const initEditor = () => {
    editor.dialog = $('[data-editor]');
    editor.form = $('[data-editor-form]');
    const f = editor.form;

    $('[data-add]').addEventListener('click', () => openEditor());
    $$('[data-editor-close]').forEach((button) => button.addEventListener('click', () => editor.dialog.close()));
    editor.dialog.addEventListener('close', () => {
        // Fermeture sans enregistrer : l'image préparée est abandonnée
        if (editor.image) URL.revokeObjectURL(editor.image.previewUrl);
        editor.image = null;
    });
    f.addEventListener('submit', (e) => { e.preventDefault(); saveEditor(); });
    f.addEventListener('input', (e) => {
        if (e.target.name === 'alt') editor.altTouched = true;
        if (e.target.name === 'title' && !editor.altTouched) f.alt.value = f.title.value.trim() ? `Page d'accueil du site ${f.title.value.trim()}` : '';
        const field = e.target.closest('.field');
        if (field && e.target.type !== 'file') field.classList.remove('is-invalid');
        updatePreview();
    });
    f.image.addEventListener('change', () => { handleFile(f.image.files[0]); f.image.value = ''; });

    const drop = $('[data-drop]');
    ['dragenter', 'dragover'].forEach((type) => drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach((type) => drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
    drop.addEventListener('drop', (e) => handleFile(e.dataTransfer.files[0]));
};

/* Publication --------------------------------------------------------------- */

const setBusy = (busy, label = 'Publier') => {
    state.busy = busy;
    const button = $('[data-publish]');
    button.disabled = busy;
    button.firstChild.textContent = `${label} `;
    busy ? button.setAttribute('aria-busy', 'true') : button.removeAttribute('aria-busy');
    $('[data-discard]').disabled = busy;
    $('[data-add]').disabled = busy;
    $$('.icon-btn', $('[data-list]')).forEach((b) => { if (busy) b.disabled = true; });
};

// Interroge le site public jusqu'à ce que la nouvelle version soit servie
const waitOnline = async (updatedAt) => {
    for (let attempt = 0; attempt < 48; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        if (state.base?.data.updatedAt !== updatedAt) return; // une autre publication a suivi
        try {
            const res = await fetch(`${DATA_PATH}?v=${Date.now()}`, { cache: 'no-store' });
            if (res.ok && (await res.json()).updatedAt === updatedAt) {
                notice('En ligne : vos modifications sont visibles sur le site.', 'ok');
                return;
            }
        } catch { /* le site n'est pas encore à jour */ }
    }
    notice("La publication est enregistrée, mais la mise en ligne prend plus de temps que d'habitude. Vérifiez le site dans quelques minutes.");
};

const publish = async () => {
    if (state.busy || !isDirty()) return;
    setBusy(true, 'Publication…');
    notice('Publication en cours…');
    try {
        const head = (await gh(`/git/ref/heads/${BRANCH}`)).object.sha;
        // Le dépôt a bougé depuis l'ouverture de la page : on ne continue que si les réalisations sont intactes
        if (head !== state.base.commitSha) {
            const remote = await gh(`/contents/${DATA_PATH}?ref=${head}`, { raw: true });
            if (remote !== state.base.raw) {
                throw new UserError('Les réalisations ont été modifiées ailleurs depuis l’ouverture de cette page. Rechargez la page, puis refaites vos modifications.');
            }
        }
        const commit = await gh(`/git/commits/${head}`);
        const [pageHtml, tree] = await Promise.all([
            gh(`/contents/${PAGE_PATH}?ref=${head}`, { raw: true }),
            gh(`/git/trees/${commit.tree.sha}?recursive=1`),
        ]);
        const existing = new Set(tree.tree.map((entry) => entry.path));
        const file = (path, rest) => ({ path, mode: '100644', type: 'blob', ...rest });

        const data = { updatedAt: new Date().toISOString(), projects: state.projects };
        const raw = `${JSON.stringify(data, null, 4)}\n`;
        const message = commitMessage();
        const entries = [
            file(PAGE_PATH, { content: replaceBlock(pageHtml, state.projects) }),
            file(DATA_PATH, { content: raw }),
        ];

        // Nouvelles images encore utilisées
        const used = new Set(state.projects.map((p) => p.image));
        for (const [base, upload] of state.uploads) {
            if (!used.has(base)) continue;
            const paths = imagePaths(base);
            for (const key of Object.keys(paths)) {
                const blob = await gh('/git/blobs', { method: 'POST', body: { content: await toBase64(upload.blobs[key]), encoding: 'base64' } });
                entries.push(file(paths[key], { sha: blob.sha }));
            }
        }
        // Images de la version en ligne qui ne servent plus
        for (const project of state.base.data.projects) {
            if (used.has(project.image)) continue;
            for (const path of Object.values(imagePaths(project.image))) {
                if (existing.has(path)) entries.push(file(path, { sha: null }));
            }
        }

        const newTree = await gh('/git/trees', { method: 'POST', body: { base_tree: commit.tree.sha, tree: entries } });
        const newCommit = await gh('/git/commits', { method: 'POST', body: { message, tree: newTree.sha, parents: [head] } });
        await gh(`/git/refs/heads/${BRANCH}`, { method: 'PATCH', body: { sha: newCommit.sha, force: false } });

        state.base = { commitSha: newCommit.sha, raw, data: clone(data) };
        state.projects = clone(data.projects);
        state.uploads.clear();
        setBusy(false);
        render();
        notice('Publié. La mise en ligne prend environ une minute…', 'ok');
        waitOnline(data.updatedAt);
    } catch (err) {
        setBusy(false);
        render();
        notice(explain(err), 'error');
    }
};

const initPublish = () => {
    $('[data-publish]').addEventListener('click', publish);
    $('[data-discard]').addEventListener('click', async () => {
        if (!(await confirmDialog('Annuler les modifications ?', 'La liste reviendra à la version actuellement en ligne.', 'Tout annuler'))) return;
        state.projects = clone(state.base.data.projects);
        state.uploads.clear();
        notice('');
        render();
    });
    window.addEventListener('beforeunload', (e) => {
        if (isDirty()) e.preventDefault();
    });
};

/* Démarrage ---------------------------------------------------------------- */

const start = async () => {
    initLogin();
    initEditor();
    initPublish();
    const token = storedToken();
    if (!token) {
        show('login');
        return;
    }
    try {
        await connect(token, false);
    } catch (err) {
        // Clé refusée : on l'oublie. Simple coupure réseau : on la garde pour la prochaine visite.
        if (err instanceof ApiError) forgetToken();
        show('login');
        $('[data-field="token"]').classList.add('is-invalid');
        $('#token-err').textContent = explain(err);
    }
};

start();
