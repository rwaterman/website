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
}

export interface SocialLink {
  label: string;
  href: string;
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
  { label: 'Links', href: '/links' },
  { label: 'Blog', href: site.links.blog, external: true },
  { label: 'Notes', href: site.links.notes, external: true },
];

export const socials: SocialLink[] = [
  { label: 'GitHub', href: site.links.github },
];
