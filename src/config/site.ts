/**
 * Single source of truth for site identity, navigation, and cross-site links.
 *
 * The Blog (Hugo) and Notes (Quartz) live in separate repos and are
 * served from subdomains of rickwaterman.com. Dev website deploys should link
 * to the matching dev subdomains so preview traffic stays within dev.
 */

export interface NavLink {
  label: string;
  href: string;
  /** External links open in a new tab and render an arrow indicator. */
  external?: boolean;
  /** One-line description, shown wherever the link is listed with context. */
  blurb?: string;
}

export interface SocialLink {
  label: string;
  href: string;
}

export interface Playlist {
  title: string;
  href: string;
  /** Where it lives — Apple Music, Spotify, SoundCloud. */
  service: string;
}

const isDevDeploy = process.env.SITE === 'https://dev.rickwaterman.com';
const externalLinks = {
  blog: `https://blog${isDevDeploy ? '-dev' : ''}.rickwaterman.com`,
  notes: `https://notes${isDevDeploy ? '-dev' : ''}.rickwaterman.com`,
};

export const site = {
  name: 'Rick Waterman',
  role: 'Lead Cloud Architect',
  /** Used for <title>, meta description, and Open Graph tags. */
  description:
    'Rick Waterman — Lead Cloud Architect. 10+ years building backend and cloud systems, focused on AWS serverless architecture and data platforms.',
  intro:
    'I lead cloud architecture and backend delivery — AWS serverless systems, event-driven services, and data platforms built for long-term ownership. Ten-plus years across backend and cloud engineering, AWS certified, based in Vancouver, WA in the Portland, OR metro.',
  links: {
    github: 'https://github.com/rwaterman',
    blog: externalLinks.blog,
    notes: externalLinks.notes,
    /** Internal resume page (embeds the PDF). */
    resume: '/resume',
    /** Resume PDF served from public/. */
    resumePdf: '/resume.pdf',
    /** AI, copyright, privacy, and disclaimer notices for this site, the blog, and notes. */
    legal: '/legal',
  },
} as const;

export const nav: NavLink[] = [
  { label: 'Bio', href: '/' },
  { label: 'Resume', href: site.links.resume },
  { label: 'Software', href: '/software' },
  {
    label: 'GenAI Blog',
    href: site.links.blog,
    external: true,
    blurb: 'Writing on cloud architecture and engineering, drafted with generative AI assistance.',
  },
  {
    label: 'Notes',
    href: site.links.notes,
    external: true,
    blurb: 'References, implementation notes, and technical docs.',
  },
  { label: 'Links', href: '/links' },
  { label: 'Fun', href: '/fun' },
];

export const socials: SocialLink[] = [
  { label: 'GitHub', href: site.links.github },
];

export interface Highlight {
  /** Repo name under `software.owner`; must be public or the build fails. */
  name: string;
  /** Replaces the GitHub description. */
  blurb: string;
}

/**
 * GitHub repos listed on /software. Fetched at build time; see src/lib/github.ts.
 * `highlights` are curated (mirrors the "Around here" list in github.com/rwaterman/rwaterman)
 * and shown first as cards; every other public repo follows, most recently pushed first.
 */
export const software = {
  owner: 'rwaterman',
  highlights: [
    { name: 'dotfiles', blurb: 'zsh, editor, and AI-agent configs, stowed into $HOME; one CLAUDE.md feeds Claude, Codex, and Copilot.' },
    { name: 'templates', blurb: 'Copy-and-customize IaC, Dockerfiles, and manifests.' },
    { name: 'scripts', blurb: 'Standalone operational scripts.' },
    { name: 'ts-lib-starter', blurb: 'Minimal Node 24+ ESM starter for TypeScript libraries.' },
    { name: 'deep-object-rename-ts', blurb: 'Dependency-free deep rename of object keys or values, on npm as deep-object-rename.' },
    { name: 'pendularium', blurb: 'Chaotic double-pendulum generative art in Swift + Metal, painting an HDR image until the machine gives out.' },
    { name: 'radial-afterburn', blurb: 'Neon tube shooter in Swift + Metal, built almost entirely with AI coding agents.' },
  ] as Highlight[],
  /** Shown first among the rest, in this order. */
  pinned: [] as string[],
  /** Never shown (the profile README repo, etc.). */
  hidden: ['rwaterman'],
};

/** Music playlists listed on /fun. Empty until links are added. */
export const playlists: Playlist[] = [];
