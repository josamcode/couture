// Every third-party asset on the site, with its source and license.
// Rule: if a license cannot be confirmed, the asset is not used.

export interface ArtworkCredit {
  /** true while this is stand-in artwork. The footer shows a credit line while true. */
  placeholder: boolean;
  /** Alt text for the hero image. Update together with the artwork. */
  alt: string;
  /** One-line credit shown in the footer while `placeholder` is true. */
  creditLine: string;
  title: string;
  artist: string;
  date: string;
  objectId: number;
  sourceUrl: string;
  imageUrl: string;
  license: string;
  licenseUrl: string;
  note: string;
}

/**
 * HERO PAINTING — placeholder until Jo's own painting ("The fitting") arrives.
 * When the final artwork is in place: set `placeholder: false` and rewrite `alt`.
 */
export const HERO_ARTWORK: ArtworkCredit = {
  placeholder: true,
  alt: 'Sixteenth-century oil portrait of a young man in a black slashed doublet and a feathered cap, standing in a grey-green room.',
  creditLine: 'Placeholder artwork: Bronzino, Portrait of a Young Man, 1530s. The Metropolitan Museum of Art, public domain.',
  title: 'Portrait of a Young Man',
  artist: 'Bronzino (Agnolo di Cosimo di Mariano)',
  date: '1530s',
  objectId: 435802,
  sourceUrl: 'https://www.metmuseum.org/art/collection/search/435802',
  imageUrl: 'https://images.metmuseum.org/CRDImages/ep/original/DP-14286-011.jpg',
  license: 'Public domain (CC0 1.0), The Met Open Access',
  licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  note: 'Fetched via The Met Collection API (isPublicDomain: true) by scripts/fetch-placeholder.mjs and cropped to 16:9. The line-art version is derived from it by scripts/lineart.mjs.',
};

export interface AssetCredit {
  what: string;
  usedIn: string;
  source: string;
  license: string;
}

export const OTHER_ASSETS: AssetCredit[] = [
  {
    what: 'Bodoni Moda (font)',
    usedIn: 'Site headlines, wordmark, generated logo mark, Open Graph image',
    source: 'https://fontsource.org/fonts/bodoni-moda (npm: @fontsource/bodoni-moda)',
    license: 'SIL Open Font License 1.1',
  },
  {
    what: 'Jost (font)',
    usedIn: 'Site text and labels, Open Graph image',
    source: 'https://fontsource.org/fonts/jost (npm: @fontsource/jost)',
    license: 'SIL Open Font License 1.1',
  },
  {
    what: 'Inter, Archivo, Cormorant Garamond, Space Mono, Fraunces, Nunito, Playfair Display, Instrument Serif (fonts)',
    usedIn: 'Only inside the demo preview screenshots (demo-looks/). Not shipped to visitors as font files.',
    source: 'https://fontsource.org (npm: @fontsource/*)',
    license: 'SIL Open Font License 1.1',
  },
];
