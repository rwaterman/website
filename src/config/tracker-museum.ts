/**
 * Exhibits for the Tracker Museum on /fun. No module file lives in this repo: each piece
 * streams from The Mod Archive when a visitor presses play, and `modarchiveId` yields both the
 * download and the page that credits its composer.
 *
 * To add an exhibit, find the module on modarchive.org, confirm composer, year, and origin
 * against a second source (Demozoo, Pouët, the module's own sample text), and add it in
 * chronological order. Format, channels, and length are read from the file as it plays.
 */

export type EraId = 'origins' | 'amiga-golden' | 'pc-rise' | 'impulse-net' | 'modern';

export interface Era {
  id: EraId;
  title: string;
  /** Inclusive range; `to` is omitted for the era that is still running. */
  from: number;
  to?: number;
  blurb: string;
}

export interface Exhibit {
  modarchiveId: number;
  title: string;
  /** Scene handle the piece was released under. */
  artist: string;
  /** The composer's name, where they have made it public. */
  artistName?: string;
  /** Group the composer released it with. */
  group?: string;
  year: number;
  /** Set when the year is the best available estimate. */
  circa?: true;
  era: EraId;
  /** File format, shown until the file loads and reports its own. */
  format: string;
  /** Where it first appeared: the demo, music disk, or competition. */
  origin: string;
  /** Why it is in the collection. */
  blurb: string;
}

export const eras: Era[] = [
  {
    id: 'amiga-golden',
    title: 'Amiga golden age',
    from: 1990,
    to: 1993,
    blurb: 'ProTracker, four channels, 8-bit samples.',
  },
];

export const exhibits: Exhibit[] = [
  {
    modarchiveId: 57925,
    title: 'Space Debris',
    artist: 'Captain',
    artistName: 'Markus Kaarlonen',
    group: 'Image',
    year: 1991,
    era: 'amiga-golden',
    format: 'MOD',
    origin: 'Placeholder until the verified catalog lands',
    blurb: 'Placeholder until the verified catalog lands.',
  },
  {
    modarchiveId: 1,
    title: 'Second placeholder',
    artist: 'Nobody',
    year: 1992,
    era: 'amiga-golden',
    format: 'MOD',
    origin: 'Placeholder until the verified catalog lands',
    blurb: 'Placeholder until the verified catalog lands.',
  },
];

export function downloadUrl(exhibit: Exhibit): string {
  return `https://api.modarchive.org/downloads.php?moduleid=${exhibit.modarchiveId}`;
}

export function pageUrl(exhibit: Exhibit): string {
  return `https://modarchive.org/index.php?request=view_by_moduleid&query=${exhibit.modarchiveId}`;
}

/** "Captain (Markus Kaarlonen) · Image" */
export function credit(exhibit: Exhibit): string {
  const name = exhibit.artistName ? `${exhibit.artist} (${exhibit.artistName})` : exhibit.artist;
  return exhibit.group ? `${name} · ${exhibit.group}` : name;
}

export function yearLabel(exhibit: Exhibit): string {
  return exhibit.circa ? `c. ${exhibit.year}` : String(exhibit.year);
}
