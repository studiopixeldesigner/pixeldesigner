# Charte graphique — Pixel Designer

Direction artistique « **Nuit numérique** » (v4, novembre 2026).
Ce fichier décrit le design du site pixeldesigner.fr. Les valeurs viennent du code. Elles sont définies dans `assets/css/style.css`, en haut du fichier, dans le bloc `:root`.
Si vous changez une valeur dans le CSS, mettez aussi ce fichier à jour.

---

## 1. L'ambiance en une phrase

Un écran de contrôle la nuit : fond bleu nuit, particules lumineuses, panneaux en verre avec des coins éclairés, et de petits effets « glitch » (décalage de couleurs, pixels).
L'objectif est d'être moderne et tech **sans** copier un template, et en parlant le moins possible d'IA.

---

## 2. Couleurs

### Fonds et texte

| Rôle | Variable CSS | Valeur |
|---|---|---|
| Fond de page | `--bg` | `#050714` |
| Fond surélevé | `--bg-elev` | `#0a0f27` |
| Carte | `--card` | `rgba(8, 11, 30, 0.7)` |
| Carte « verre » | `--card-glass` | `rgba(10, 14, 36, 0.55)` |
| Texte principal | `--text` | `#eef1ff` |
| Texte secondaire | `--muted` | `#9ba4c9` |
| Texte d'exemple des champs | `--placeholder` | `#6f789e` |
| Filet discret | `--line` | `rgba(255, 255, 255, 0.08)` |
| Filet marqué | `--line-strong` | `rgba(255, 255, 255, 0.16)` |
| Bord des champs | `--field-line` | `rgba(255, 255, 255, 0.2)` |

### Couleurs d'accent

| Rôle | Variable CSS | Valeur | Usage |
|---|---|---|---|
| **Bleu électrique** | `--blue` | `#3d6bff` | **La seule couleur des actions** (boutons, liens importants) |
| Cyan | `--cyan` | `#3fe0ff` | Effets uniquement |
| Rose | `--pink` | `#ff4fd8` | Effets uniquement |
| Violet | `--violet` | `#c04dff` | Effets uniquement |
| Cyan clair | `--accent` | `#7ee8ff` | Petits repères, filets d'interface |
| Erreur | `--danger` | `#fca5a5` | Messages d'erreur des formulaires |
| Filets « écran de contrôle » | `--hud` / `--hud-soft` | `rgba(126, 232, 255, 0.55)` / `0.18` | Coins des cartes, cadres |

**Règle :** un seul bleu pour tout ce qui se clique. Le cyan et le rose ne servent jamais pour un bouton. Ils restent dans les dégradés, les reflets et les effets.

### Dégradés

| Nom | Variable | Valeur | Usage |
|---|---|---|---|
| Marque | `--g-brand` | cyan → bleu → rose | Décor, traits lumineux |
| Texte | `--g-text` | `#7ee8ff` → `#9fb6ff` → `#f0a6ff` | Mots mis en avant dans les titres (classe `.grad`) |
| Bouton | `--g-btn` | `#2f5bff` → `#3d6bff` → `#6a4dff` | Bouton principal (texte blanc lisible, contraste AA) |

Un dégradé de titre est **continu sur toute la phrase**, pas un dégradé par mot.

---

## 3. Typographie

**Une seule police sur tout le site : [Tektur](https://fonts.google.com/specimen/Tektur)** (coins coupés, look tech mais lisible).
Elle est hébergée sur le site, dans `assets/fonts/` (pas de Google Fonts, pour le RGPD), sous licence SIL Open Font License 1.1.

| Graisse | Usage |
|---|---|
| 400 (Regular) | Texte courant |
| 500 (Medium) | Libellés, petits textes en capitales |
| 600 (SemiBold) | Titres |

Exception : les documents imprimables (CGV en PDF) utilisent **Geist** et **Geist Mono**, plus lisibles à l'impression.

### Tailles (fluides, elles s'adaptent à l'écran)

| Élément | Classe | Taille | Interligne |
|---|---|---|---|
| Titre principal (accueil) | `.hero-title` | `clamp(2.3rem, 5.8vw, 4.8rem)` | 1 |
| Titre de section | `.h2` | `clamp(2rem, 4.6vw, 3.5rem)` | 1.1 |
| Phrase d'introduction | `.lead` | `clamp(1.05rem, 1.4vw, 1.2rem)` | 1.6 |
| Texte courant | — | `1rem` (16 px) | 1.6 |
| Repère de section (« 01 Réalisations ») | `.kicker` | `0.78rem`, capitales, espacement `0.16em` | — |

À éviter : la police pixel (Silkscreen) en titre, que Rayan trouve trop difficile à lire.

---

## 4. Formes et espacements

| Élément | Valeur |
|---|---|
| Boutons, puces, badges | Pilule (`border-radius: 999px`) |
| Cartes | `16px` (`--radius`) |
| Images et visuels | `12px` (`--radius-media`) |
| Champs de formulaire | `10px` (`--radius-field`) |
| Largeur max du contenu | `1240px` (`.container`) |
| Marge sur les côtés | `clamp(1.25rem, 5vw, 3rem)` (`--gutter`) |
| Espace entre sections | `clamp(6.5rem, 14vw, 11rem)` (`--section-y`) |
| Hauteur du menu | `68px` (`--nav-h`) |

---

## 5. Composants

- **Bouton principal** (`.btn .btn-primary`) : pilule de 50 px de haut, dégradé `--g-btn`, texte blanc, et un reflet qui balaie le bouton au survol.
- **Bouton secondaire** (`.btn .btn-ghost`) : pilule transparente avec un filet clair.
- **Carte** (`.card`) : fond sombre en verre, avec des **coins éclairés** en cyan (`--hud`), dans le style « écran de contrôle ».
- **Repère de section** (`.kicker`) : petit numéro encadré (« 01 ») suivi du nom de la section en capitales espacées.
- **Puces** (`.chips`) : petites pilules pour les mots-clés d'un projet.
- **Menu** : en forme de pilule, avec des libellés en capitales espacées.

---

## 6. Effets et animations

- **Fond animé** : particules en 3D (`assets/js/scene.js`).
- **Glitch** : décalage rose/cyan et tranches qui sautent, joué **une seule fois** sur certains titres.
- **Réalisations** : carrousel 3D en spirale piloté par le défilement (`assets/js/works.js`). Le projet qui part se décale en couleurs puis se dissout en pixels.
- **Courbes d'animation** : `--ease` = `cubic-bezier(0.16, 1, 0.3, 1)` (douce) et `--spring` = `cubic-bezier(0.34, 1.56, 0.64, 1)` (avec rebond).
- **Halo** derrière le texte posé sur le fond animé (`--halo`), pour qu'il reste lisible.
- Toutes les animations s'arrêtent si le visiteur a choisi « réduire les animations » sur son appareil.

---

## 7. Logo et icônes

- **Logo** : `assets/img/logo-64.png`, `logo-128.png`, `logo-256.png`. Favicons : `favicon.ico`, `favicon-32.png` et `apple-touch-icon.png`, à la racine du site.
- **Icônes** : [Phosphor Icons](https://phosphoricons.com) (licence MIT), servies depuis le site (`assets/css/phosphor.css`). Elles s'utilisent avec `<i class="ph ph-nom-de-l-icone"></i>`. Pas d'emoji en guise d'icône.
- **Image de partage** sur les réseaux : `assets/img/og-image.jpg`.

---

## 8. Ton et règles de contenu

- Vouvoiement, phrases courtes, zéro jargon.
- Chaque section se comprend en un coup d'œil : un titre explicite, une phrase courte et, si besoin, un mot-clé en grand.
- **Parler le moins possible d'IA** sur le site.
- Ne jamais inventer d'avis clients, de chiffres ou de références.
- Mobile d'abord : tout doit être parfait sur téléphone.

---

## 9. Sites de démonstration

Les démos du portfolio (`demos/`) ont **chacune leur propre charte**, choisie selon le métier fictif. Elles ne suivent pas cette charte :

| Démo | Ambiance | Couleurs principales |
|---|---|---|
| Fournil Belle-Aube (One Page) | Artisanal chaleureux, serif | Crème `#f6efe4`, brun `#6b3b1f`, abricot `#c4561d` |
| Hydra Confort (Vitrine Pro) | Net et rassurant | Bleu canard `#0e3b43`, jaune `#f5b301` |
| Cycles du Breuchin (Sur mesure) | Sportif, mécanique | Noir vert `#121a14`, citron vert `#c8f04a` |
