// Gabarit HTML des cartes « Mes réalisations ».
// La page d'administration s'en sert pour réécrire, dans index.html, le bloc situé entre les
// repères « projets:debut » et « projets:fin ». Le balisage doit rester celui que stylent les
// règles .work* de style.css et qu'animent data-stack, data-spot et data-tilt dans main.js.

const MARK_START = '<!-- projets:debut (bloc généré par la page admin, ne pas modifier à la main) -->';
const MARK_END = '<!-- projets:fin -->';
const START_RE = /<!-- projets:debut[^>]*-->/;

const MONTHS = ['Janv.', 'Févr.', 'Mars', 'Avril', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];

export const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// « 2026-08 » -> « Août 2026 »
export const formatDate = (yearMonth) => {
    const match = /^(\d{4})-(\d{2})$/.exec(yearMonth || '');
    return match ? `${MONTHS[Number(match[2]) - 1]} ${match[1]}` : String(yearMonth || '');
};

// Texte affiché dans la fausse barre de navigateur : le dossier pour un site github.io, sinon le domaine
export const siteLabel = (url) => {
    try {
        const { hostname, pathname } = new URL(url);
        const folder = pathname.split('/').filter(Boolean)[0];
        if (hostname.endsWith('.github.io') && folder) return folder;
        return hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
};

export const imagePaths = (base) => ({
    small: `assets/img/${base}-900.webp`,
    large: `assets/img/${base}-1600.webp`,
    fallback: `assets/img/${base}-1600.jpg`,
});

// previewSrc : adresse d'image de remplacement, pour l'aperçu d'une image pas encore publiée
export const renderProject = (project, { eol = '\n', indent = ' '.repeat(20), previewSrc = '' } = {}) => {
    const e = escapeHtml;
    const paths = imagePaths(project.image);
    const meta = [project.category, project.city].filter(Boolean).join(' · ');
    const srcset = previewSrc ? e(previewSrc) : `${e(paths.small)} 900w, ${e(paths.large)} 1600w`;
    const lines = [
        '<article class="work" data-stack>',
        '    <div class="work-card card" data-spot>',
        '        <div class="work-info">',
        `            <p class="meta"><span>${e(meta)}</span><span>${e(formatDate(project.date))}</span></p>`,
        `            <h3 class="work-title">${e(project.title)}</h3>`,
        `            <p class="muted">${e(project.description)}</p>`,
        '            <ul class="chips" role="list">',
        ...project.tags.map((tag) => `                <li>${e(tag)}</li>`),
        '            </ul>',
        `            <a class="btn btn-ghost" href="${e(project.url)}" target="_blank" rel="noopener">Voir le site <i class="ph ph-arrow-up-right" aria-hidden="true"></i></a>`,
        '        </div>',
        `        <a class="work-media" href="${e(project.url)}" target="_blank" rel="noopener" data-tilt aria-label="Ouvrir le site ${e(project.title)} (nouvel onglet)">`,
        `            <span class="browser-bar" aria-hidden="true"><i></i><i></i><i></i><span>${e(siteLabel(project.url))}</span></span>`,
        '            <picture>',
        `                <source type="image/webp" srcset="${srcset}" sizes="(min-width: 1024px) 62vw, 100vw">`,
        `                <img src="${e(previewSrc || paths.fallback)}" alt="${e(project.alt)}" width="${Number(project.imageWidth)}" height="${Number(project.imageHeight)}" loading="lazy" decoding="async">`,
        '            </picture>',
        '        </a>',
        '    </div>',
        '</article>',
    ];
    return lines.map((line) => indent + line).join(eol);
};

export const renderBlock = (projects, { eol = '\n', indent = ' '.repeat(20) } = {}) => [
    MARK_START,
    projects.map((project) => renderProject(project, { eol, indent })).join(eol + eol),
    indent + MARK_END,
].join(eol);

// Remplace le bloc des réalisations dans le code de index.html, en gardant ses fins de ligne
export const replaceBlock = (html, projects) => {
    const start = html.search(START_RE);
    const end = html.indexOf(MARK_END);
    if (start === -1 || end === -1 || end < start) {
        throw new Error('Les repères du bloc des réalisations sont introuvables dans index.html.');
    }
    const eol = html.includes('\r\n') ? '\r\n' : '\n';
    const lineStart = html.lastIndexOf('\n', start) + 1;
    const indent = html.slice(lineStart, start);
    return html.slice(0, start) + renderBlock(projects, { eol, indent }) + html.slice(end + MARK_END.length);
};
