// THE COLLECTION. Edit looks here; components read everything from this file.
//
// To change a look: edit its name, tagline, price or contents below.
// To add or remove a look: add or remove an entry (the Roman numeral is yours to set).
// To replace preview images: see README → "Edit looks".

export interface LookContent {
  title: string;
  text: string;
}

export interface LookImage {
  /** Base path without size or extension, e.g. "/img/looks/editorial/couture". */
  base: string;
  alt: string;
}

export interface Look {
  /** Used in URLs, ids and data-checkout. Lowercase, hyphens only. */
  slug: string;
  /** Roman numeral shown in the index and on the buy button. */
  numeral: string;
  name: string;
  tagline: string;
  /** Not decided yet. Keep "[YOUR PRICE]" until Jo sets it. */
  price: string;
  /** Where the buy button goes. "#" until a payment provider is chosen. */
  href: string;
  /** The three "In the box" columns. */
  contents: [LookContent, LookContent, LookContent];
  images: {
    /** The generic page any AI makes. */
    offTheRack: LookImage;
    /** The same page wearing this look. */
    couture: LookImage;
  };
  /**
   * true = the preview images are DEMO mock-ups built by hand (demo-looks/<slug>/),
   * not real output from a real skill. While true, the site labels them "Illustrative preview".
   * Set to false once real outputs are in place.
   */
  placeholder: boolean;
}

/** Sizes produced by scripts/demo-shots.mjs for every preview image. */
export const LOOK_IMAGE_WIDTHS = [800, 1600] as const;
export const LOOK_IMAGE_RATIO = { width: 1600, height: 1000 } as const;

const contents = (): [LookContent, LookContent, LookContent] => [
  { title: 'SKILL.md', text: 'The taste, written so your AI can follow it.' },
  { title: 'Prompt set', text: '[NUMBER] prompts, tested on real briefs.' },
  { title: 'Tokens', text: 'Colors, type and spacing, ready to paste.' },
];

const images = (slug: string, name: string): Look['images'] => ({
  offTheRack: {
    base: `/img/looks/${slug}/off-the-rack`,
    alt: 'Off-the-rack: a generic landing page for Northwind coffee, the kind any AI produces by default.',
  },
  couture: {
    base: `/img/looks/${slug}/couture`,
    alt: `Couture: the same Northwind page, redesigned in the ${name} look.`,
  },
});

const look = (numeral: string, slug: string, name: string, tagline: string): Look => ({
  slug,
  numeral,
  name,
  tagline,
  price: '[YOUR PRICE]',
  href: '#',
  contents: contents(),
  images: images(slug, name),
  placeholder: true,
});

// Placeholder looks. Jo will rename them.
export const LOOKS: Look[] = [
  look('I', 'editorial', 'Editorial', 'For brands that should read like a magazine cover.'),
  look('II', 'swiss-grid', 'Swiss grid', 'Strict columns, loud type, nothing wasted.'),
  look('III', 'noir', 'Noir', 'Dark rooms, gold light, slow reveals.'),
  look('IV', 'brutal-mono', 'Brutal mono', 'Raw borders and honest structure.'),
  look('V', 'soft-clay', 'Soft clay', 'Warm, rounded and easy on the eye.'),
  look('VI', 'quiet-luxury', 'Quiet luxury', 'Whisper-quiet, expensive, never loud.'),
];
