// Site-wide facts. Edit here, not in components.
export const SITE = {
  name: 'Couture UI',
  title: 'Couture UI — AI makes off-the-rack. We make couture.',
  description:
    'Design skills, styles and prompts that give your AI a sense of taste. It already has the skills. We hand it the eye.',
  instagram: {
    handle: '@couture.ui',
    url: 'https://www.instagram.com/couture.ui/',
  },
  year: 2026,
} as const;

/**
 * Prices are not decided yet. Keep these placeholders exactly as they are until Jo sets real prices.
 * Per-look prices live in src/data/looks.ts.
 */
export const WARDROBE = {
  price: '[YOUR PRICE]',
  checkout: 'wardrobe',
  /** Where the buy button goes. "#" until a payment provider is chosen. */
  href: '#',
  includes: ['Every look in the collection', 'Every future drop', 'Delivered instantly as files'],
} as const;
