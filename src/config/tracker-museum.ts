/**
 * Exhibits for the Tracker Museum on /fun. No module file lives in this repo: each piece
 * streams from The Mod Archive when a visitor presses play, and `modarchiveId` yields both the
 * download and the page that credits its composer.
 *
 * Every entry was checked in October 2026: the file was downloaded and played with libopenmpt,
 * and composer, year, and origin were confirmed against Demozoo, Amiga Music Preservation, the
 * module's own text, or the composer's site. `artistName` is set only where the composer's own
 * file or two independent sources give the same name; otherwise the scene handle stands alone.
 *
 * To add an exhibit, hold it to the same standard, read the file's sample text before deciding
 * on `withholdSampleText`, and place it by era, then year. `exhibits` is in playing order.
 */

export type EraId = 'origins' | 'amiga-golden' | 'pc-rise' | 'impulse-net' | 'modern';

export interface Era {
  id: EraId;
  title: string;
  /** Inclusive range; `to` is omitted for the era that is still running. Neighbors may overlap. */
  from: number;
  to?: number;
  blurb: string;
}

export interface Exhibit {
  modarchiveId: number;
  title: string;
  /** Scene handle the piece was released under. */
  artist: string;
  /** The composer's name, where it is corroborated (see the note at the top of this file). */
  artistName?: string;
  /** Group the composer released it with. */
  group?: string;
  year: number;
  /** Set when sources disagree on the year or only an upload date is known. */
  circa?: true;
  era: EraId;
  /** File format, shown until the file loads and reports its own. */
  format: string;
  /** Where it first appeared: the demo, music disk, or competition. */
  origin: string;
  /** Why it is in the collection. */
  blurb: string;
  /**
   * Keeps the file's sample and instrument text off the page. Set where that text carries a
   * decades-old postal address, phone number, or e-mail address, or language not worth reprinting.
   */
  withholdSampleText?: true;
  /** Sets the reel to this exhibit when the page loads. Exactly one exhibit carries it. */
  opens?: true;
}

export const eras: Era[] = [
  {
    id: 'origins',
    title: 'Soundtracker origins',
    from: 1987,
    to: 1989,
    blurb:
      'Karsten Obarski’s Ultimate Soundtracker put four sampled voices on a scrolling grid in 1987. Within two years NoiseTracker, crack intros, and megademos had made it the sound of the Amiga.',
  },
  {
    id: 'amiga-golden',
    title: 'Amiga golden age',
    from: 1990,
    to: 1993,
    blurb:
      'ProTracker and the Amiga demoscene at full height: four channels, 8-bit samples, and soundtracks written for demos that were judged at parties.',
  },
  {
    id: 'pc-rise',
    title: 'The PC catches up',
    from: 1993,
    to: 1996,
    blurb:
      'Scream Tracker 3 and FastTracker 2 lifted the four-channel limit, and Future Crew’s Second Reality showed what a PC could do with it.',
  },
  {
    id: 'impulse-net',
    title: 'Impulse Tracker and the net',
    from: 1997,
    to: 2003,
    blurb:
      'Impulse Tracker added filters and instrument envelopes, modules began to travel over the internet instead of on disks, and tiny chiptunes became a craft of their own.',
  },
  {
    id: 'modern',
    title: 'Still tracking',
    from: 2004,
    blurb:
      'The format never went away. Demoparties still run tracked-music competitions, four-channel MODs still win them, and OpenMPT keeps the old formats playable.',
  },
];

export const exhibits: Exhibit[] = [
  {
    modarchiveId: 186736,
    title: 'Amegas',
    artist: 'Karsten Obarski',
    year: 1987,
    era: 'origins',
    format: 'MOD',
    origin: 'Soundtrack of the 1987 Amiga game Amegas',
    blurb:
      'Karsten Obarski wrote Ultimate Soundtracker, the first music tracker, to produce the soundtrack for this game. The file is still in the original 15-sample Soundtracker format, and the tune was reused in many intros and demos of 1987 and 1988.',
  },
  {
    modarchiveId: 49836,
    title: 'Occ-San-Geen',
    artist: 'Uncle Tom',
    artistName: 'Tomas Dahlgren',
    group: 'Scoopex',
    year: 1989,
    era: 'origins',
    format: 'MOD',
    origin: 'Soundtrack of the Scoopex demo Seven Sins (October 1989)',
    blurb:
      'Music for the Scoopex demo Seven Sins. Its instrument list still names the numbered ST-xx sample disks the sounds came from.',
  },
  {
    modarchiveId: 211324,
    title: 'Cream of the Earth',
    artist: 'Romeo Knight',
    group: 'Red Sector Inc.',
    year: 1989,
    era: 'origins',
    format: 'MOD',
    origin: 'Released December 1989; used in the Red Sector Inc. demo CeBit 90 (March 1990)',
    blurb:
      'A late-1989 Red Sector tune that the group used a few months later in its CeBit 90 demo. It remains one of the most revered modules on The Mod Archive.',
  },
  {
    modarchiveId: 99684,
    title: 'Hymn to Aurora',
    artist: 'Horace Wimp',
    group: 'Aurora',
    year: 1990,
    era: 'amiga-golden',
    format: 'MOD',
    origin: 'Soundtrack of the Aurora demo Beyond Eternity (January 1990)',
    blurb: 'Written for the Aurora demo Beyond Eternity, and one of the three most downloaded modules on The Mod Archive.',
  },
  {
    modarchiveId: 47057,
    title: 'Klisje paa Klisje',
    artist: 'Walkman',
    artistName: 'Tor Gausen',
    group: 'Cryptoburners',
    year: 1990,
    era: 'amiga-golden',
    format: 'MOD',
    origin: 'Soundtrack of the Cryptoburners demo The Hunt for 7th October (October 1990)',
    blurb:
      'The ten-minute soundtrack of The Hunt for 7th October, which won the Amiga demo competition at the No Limits and IMP-666 Amiga Conference 1990.',
  },
  {
    modarchiveId: 66036,
    title: '4-Mat’s Madness',
    artist: '4-Mat',
    artistName: 'Matthew Simmonds',
    group: 'Anarchy',
    year: 1990,
    era: 'amiga-golden',
    format: 'MOD',
    origin: 'Music of the Anarchy demo Madness (October 1990)',
    blurb:
      'Music for the Anarchy demo Madness by Matthew Simmonds, who became best known for chiptunes written in trackers. At least eight other productions had reused it by the middle of 1991.',
    withholdSampleText: true,
  },
  {
    modarchiveId: 57925,
    title: 'Space Debris',
    artist: 'Captain',
    artistName: 'Markus Kaarlonen',
    year: 1991,
    era: 'amiga-golden',
    format: 'MOD',
    origin: 'Winner of the music competition at Anarchy Easter Conference 1991',
    blurb:
      'Composed on the Amiga in 1991, it won the music competition at Anarchy’s Easter party in Sweden. It is the second most downloaded module on The Mod Archive.',
  },
  {
    modarchiveId: 101789,
    title: 'Musiklinjen',
    artist: 'Firefox & Tip',
    group: 'Phenomena',
    year: 1991,
    era: 'amiga-golden',
    format: 'MOD',
    origin: 'Soundtrack of Phenomena’s Enigma (1st place, Amiga demo competition, Anarchy Easter Conference 1991)',
    blurb:
      'Also known as Hyperbased and A Final Hyperbase: the piece Demozoo credits as the soundtrack to Enigma, which won the Amiga demo competition at the Anarchy Easter Conference 1991. It is in the top twenty of all three Mod Archive charts, most downloaded, most revered, and most favourited.',
  },
  {
    modarchiveId: 40475,
    title: 'Elysium',
    artist: 'Jester',
    artistName: 'Volker Tripp',
    group: 'Sanity',
    year: 1991,
    era: 'amiga-golden',
    format: 'MOD',
    origin: 'Soundtrack of the Sanity demo Elysium (April 1991)',
    blurb:
      'Written, in the composer’s words, as a tune “taylor-made for our new demo”, Sanity’s Elysium. It is among the most favourited modules on The Mod Archive.',
    withholdSampleText: true,
  },
  {
    modarchiveId: 214414,
    title: 'Beyond Music',
    artist: 'Captain',
    artistName: 'Markus Kaarlonen',
    group: 'Image',
    year: 1991,
    era: 'amiga-golden',
    format: 'MOD',
    origin: '1st place, Amiga music competition, Byterapers–Scoopex–Bloodsuckers Gathering 1991 (Parikkala, Finland)',
    blurb:
      'Captain’s winning entry in the Amiga music competition at a summer 1991 gathering in Parikkala, Finland, as the file’s own text records. It came four months after Space Debris.',
  },
  {
    modarchiveId: 46900,
    title: 'Global Trash 3 v2',
    artist: 'Jesper Kyd',
    group: 'The Silents',
    year: 1991,
    era: 'amiga-golden',
    format: 'MOD',
    origin: 'Theme of the demo Hardwired by Crionics & The Silents (2nd place, Amiga demo competition, The Party 1991)',
    blurb:
      'Jesper Kyd’s theme for the demo Hardwired; the file is signed “music by jesper kyd / copyright october1991”. Kyd went on to score the Hitman and Assassin’s Creed game series.',
  },
  {
    modarchiveId: 34633,
    title: 'Condom Corruption',
    artist: 'Travolta',
    artistName: 'Rune Svendsen',
    group: 'Spaceballs',
    year: 1992,
    era: 'amiga-golden',
    format: 'MOD',
    origin: 'Soundtrack of the Spaceballs demo State of the Art (1st place, Amiga demo competition, The Party 1992)',
    blurb:
      'The soundtrack of State of the Art, the Spaceballs demo that won the Amiga demo competition at The Party 1992. The file’s own text says it was finished in autumn 1992.',
    withholdSampleText: true,
  },
  {
    modarchiveId: 59344,
    title: 'Stardust Memories',
    artist: 'Jester',
    artistName: 'Volker Tripp',
    group: 'Sanity',
    year: 1992,
    era: 'amiga-golden',
    format: 'MOD',
    origin: 'Soundtrack of Sanity’s World of Commodore (2nd place, demo competition, World of Commodore 1992)',
    blurb:
      'Jester’s soundtrack for World of Commodore, the Sanity demo that took second place in the demo competition at the 1992 World of Commodore show, a year and a half after his Elysium. It is in the top twenty-five of all three Mod Archive charts.',
    withholdSampleText: true,
  },
  {
    modarchiveId: 52695,
    title: 'Panic',
    artist: 'Purple Motion',
    artistName: 'Jonne Valtonen',
    group: 'Future Crew',
    year: 1992,
    era: 'amiga-golden',
    format: 'S3M',
    origin: 'Soundtrack of Future Crew’s Panic (2nd place, PC demo competition, The Party 1992)',
    blurb:
      'Purple Motion’s soundtrack for Panic, the Future Crew demo that took second place in the PC demo competition at The Party 1992, a year before Second Reality. Its text lists the ten parts of the demo it scores: a PC piece arriving while the Amiga still ruled the room.',
    withholdSampleText: true,
  },
  {
    modarchiveId: 107562,
    title: 'Cortouchka!',
    artist: 'Moby',
    group: 'Dreamdealers',
    year: 1992,
    era: 'amiga-golden',
    format: 'MOD',
    origin: '1st place, music competition, The Party 1992',
    blurb:
      'Winner of the music competition at The Party 1992, the same party where Spaceballs’ State of the Art, scored by Condom Corruption, won the Amiga demo competition.',
  },
  {
    modarchiveId: 42560,
    title: 'Guitar Slinger',
    artist: 'Jogeir Liljedahl',
    group: 'Noiseless',
    year: 1993,
    era: 'amiga-golden',
    format: 'MOD',
    origin: 'Winner of the music competition at Rendezvous 1993',
    blurb:
      'Won the music competition at Rendezvous 1993 and was used later that year in Dizzy Tunes II by Noiseless and Spaceballs. It is one of the five most downloaded modules on The Mod Archive.',
  },
  {
    modarchiveId: 212083,
    title: 'Second Reality',
    artist: 'Purple Motion',
    artistName: 'Jonne Valtonen',
    group: 'Future Crew',
    year: 1993,
    era: 'pc-rise',
    format: 'S3M',
    opens: true,
    origin: 'Purple Motion’s part of the Second Reality soundtrack (1st place, PC demo competition, Assembly 1993)',
    blurb:
      'Purple Motion’s part of the soundtrack to Future Crew’s Second Reality, which won the PC demo competition at Assembly 1993. It is first on all three Mod Archive charts, most downloaded, most revered, and most favourited, which is why the reel opens here.',
  },
  {
    modarchiveId: 54250,
    title: 'Satellite One',
    artist: 'Purple Motion',
    artistName: 'Jonne Valtonen',
    group: 'Future Crew',
    year: 1993,
    era: 'pc-rise',
    format: 'S3M',
    origin: 'Written for the Assembly 1993 results intro',
    blurb:
      'By the file’s own account, Purple Motion wrote it for a small intro announcing the results of Assembly 1993, the party Second Reality won. It is in the top thirty of all three Mod Archive charts.',
  },
  {
    modarchiveId: 53148,
    title: 'Reflecter',
    artist: 'Zodiak',
    artistName: 'Erik Stridell',
    group: 'Cascada',
    year: 1994,
    era: 'pc-rise',
    format: 'XM',
    origin: 'Winner of the multichannel music competition at The Party 1994',
    blurb:
      'Winner of the multichannel music competition at The Party 1994. The composer’s notes in the file say it took a day and a half, with guitar samples recorded from his own six-string.',
    withholdSampleText: true,
  },
  {
    modarchiveId: 191789,
    title: 'Aryx',
    artist: 'Karsten Koch',
    year: 1995,
    era: 'pc-rise',
    format: 'S3M',
    origin: 'Standalone release, dated 29 March 1995 in the file',
    blurb: 'A 12-channel module of about 20 KB that sits near the top of The Mod Archive’s most-revered chart.',
  },
  {
    modarchiveId: 35344,
    title: 'Dope',
    artist: 'Jugi',
    group: 'Complex',
    year: 1995,
    era: 'pc-rise',
    format: 'MOD',
    origin: 'Soundtrack of the Complex demo Dope (1st place, PC demo competition, The Gathering 1995)',
    blurb:
      'The soundtrack of the Complex demo Dope, which won the PC demo competition at The Gathering 1995. It is a 28-channel MOD, seven times the Amiga’s four.',
  },
  {
    modarchiveId: 55696,
    title: 'Point of Departure',
    artist: 'Necros',
    artistName: 'Andrew Sega',
    group: 'Five Musicians',
    year: 1995,
    era: 'pc-rise',
    format: 'S3M',
    origin: 'Written for the Five Musicians music disk Progression (July 1995)',
    blurb:
      'Written, per the file’s own notes, for the Five Musicians music disk Progression. It is one of the most revered modules on The Mod Archive.',
  },
  {
    modarchiveId: 34654,
    title: 'Catch That Goblin!!',
    artist: 'Skaven',
    artistName: 'Peter Hajba',
    group: 'Future Crew',
    year: 1995,
    era: 'pc-rise',
    format: 'S3M',
    origin: 'Winner of the multichannel music competition at Assembly 1995',
    blurb:
      'Won the multichannel music competition at Assembly 1995. Its instrument list mixes orchestral samples with a “sound effects department” of cuckoos, creaks, and breaking glass.',
  },
  {
    modarchiveId: 35280,
    title: 'Dead Lock',
    artist: 'Elwood',
    artistName: 'Jussi Salmela',
    year: 1995,
    circa: true,
    era: 'pc-rise',
    format: 'XM',
    origin: 'Standalone release; the file says it was finished in 1995',
    blurb:
      'A 24-channel FastTracker 2 module that ranks among the most favourited and most downloaded on The Mod Archive.',
    withholdSampleText: true,
  },
  {
    modarchiveId: 34596,
    title: 'Butterfly Flew Away',
    artist: 'Damac & Swallow',
    year: 1995,
    era: 'pc-rise',
    format: 'XM',
    origin: 'Entered in the multichannel music competition at The Party 1995',
    blurb:
      'Written for The Party 1995, where it finished far down the multichannel music results. Listeners overruled the jury: it is one of the ten most downloaded modules on The Mod Archive.',
    withholdSampleText: true,
  },
  {
    modarchiveId: 66187,
    title: 'Funky Stars',
    artist: 'Quazar',
    artistName: 'Axel Hedfors',
    group: 'Sanxion',
    year: 1996,
    era: 'pc-rise',
    format: 'XM',
    origin: 'Standalone chiptune, January 1996; later on the Sanxion music disk Synthetica (September 1996)',
    blurb:
      'A 51 KB chiptune whose notes ask listeners to “preserve the memory of the tiny-tunes”. Quazar is the tracker-scene name of Axel Hedfors, later known as Axwell.',
  },
  {
    modarchiveId: 70716,
    title: 'Celestial Fantasia',
    artist: 'BeaT',
    artistName: 'Seth Peelle',
    group: 'Osmosys',
    year: 1997,
    era: 'impulse-net',
    format: 'S3M',
    origin: 'Standalone release, completed March 1997',
    blurb:
      'A 13-channel Scream Tracker 3 piece whose notes thank Future Crew for the tracker and name Purple Motion as the main influence.',
    withholdSampleText: true,
  },
  {
    modarchiveId: 46496,
    title: 'Letting Go',
    artist: 'WAVE',
    artistName: 'Jeroen Tel',
    group: 'Maniacs of Noise',
    year: 1997,
    era: 'impulse-net',
    format: 'XM',
    origin: '1st place, music competition, Cruelization 9 (online, 1997)',
    blurb:
      'Jeroen Tel of Maniacs of Noise, a name from Commodore 64 game music, writing as WAVE in FastTracker 2. Its notes say it was built from a single sine-wave sample. It won the online Cruelization 9 competition and sits in the top twenty-five of The Mod Archive’s most revered chart.',
    withholdSampleText: true,
  },
  {
    modarchiveId: 41760,
    title: 'Sick on Monday',
    artist: 'Elwood',
    artistName: 'Jussi Salmela',
    year: 1998,
    era: 'impulse-net',
    format: 'XM',
    origin: 'Standalone release, April 1998',
    blurb:
      'Elwood two years after Dead Lock, again in FastTracker 2. It is among the forty most favourited modules on The Mod Archive and in the top twenty of its most revered chart.',
  },
  {
    modarchiveId: 167157,
    title: 'Yuki Satellites',
    artist: 'Radix',
    group: 'TPOLM',
    year: 1999,
    era: 'impulse-net',
    format: 'XM',
    origin: 'Released as an MP3 in August 1999; Radix gave The Mod Archive the original XM in 2009',
    blurb:
      'A 32-channel FastTracker 2 piece, sixth on The Mod Archive’s most revered chart. It circulated only as an MP3 for ten years before Radix shared the module itself.',
  },
  {
    modarchiveId: 68847,
    title: 'Foregone Destruction',
    artist: 'Michiel van den Bos',
    year: 1999,
    era: 'impulse-net',
    format: 'IT',
    origin: 'Soundtrack of Unreal Tournament (1999), the Facing Worlds map',
    blurb:
      'The music of Facing Worlds, the Unreal Tournament map. The game played its soundtrack from tracker modules, and this is that file: its sample text reads “Composed by Michiel van den Bos For Unreal Tournament.”',
  },
  {
    modarchiveId: 66334,
    title: 'Acidjazzed Evening',
    artist: 'Tempest',
    artistName: 'Janne Suni',
    group: 'Damage',
    year: 2000,
    era: 'impulse-net',
    format: 'MOD',
    origin: 'Winner of the oldskool music competition at Assembly 2000',
    blurb:
      'A four-channel MOD that won the oldskool music competition at Assembly 2000. It later became the subject of a plagiarism dispute over Nelly Furtado’s “Do It”; the lawsuit was dismissed in 2011.',
  },
  {
    modarchiveId: 149252,
    title: 'Unreal Superhero 3',
    artist: 'Rez & Kenët',
    year: 2001,
    era: 'impulse-net',
    format: 'XM',
    origin: 'Released on the Rebels Chipmusicdisk #1 (September 2001)',
    blurb: 'A 10-channel chiptune of 35 KB, signed “rez+kenet”, and one of the most favourited modules on The Mod Archive.',
  },
  {
    modarchiveId: 32547,
    title: 'Winds of Fjords',
    artist: 'Minomus',
    group: 'DOMU / Fine Ground Coffee Crew',
    year: 2001,
    circa: true,
    era: 'impulse-net',
    format: 'IT',
    origin: 'Standalone release; on The Mod Archive since November 2001',
    blurb:
      'An Impulse Tracker module its author calls a “back-to-the-roots” song, using only 8-bit samples to recall “those great modules from ’90 - ’96”.',
    withholdSampleText: true,
  },
  {
    modarchiveId: 156184,
    title: 'Beyond the Network',
    artist: 'Skaven',
    artistName: 'Peter Hajba',
    year: 2004,
    era: 'modern',
    format: 'IT',
    origin: 'Bejeweled 2 soundtrack (PopCap Games, 2004), as one suite',
    blurb:
      'The whole Bejeweled 2 soundtrack in a single half-hour module: Skaven’s notes list twenty sections, from the title track through “Bejeweled Theme” to “Final Destination”. A Future Crew composer scoring a casual-game hit a decade on, fifteenth on The Mod Archive’s most revered chart.',
    withholdSampleText: true,
  },
  {
    modarchiveId: 172032,
    title: 'Dans la Rue',
    artist: 'xyce',
    year: 2010,
    circa: true,
    era: 'modern',
    format: 'XM',
    origin: 'Included on the Chimera Music release Bits ’n’ Pieces 2 (August 2010)',
    blurb: 'A 22-channel chip-style module of 87 KB by the duo xyce, signed “cerror & xylo” in the file.',
  },
  {
    modarchiveId: 174955,
    title: 'Professional Tracker',
    artist: 'H0ffman & Daytripper',
    year: 2014,
    era: 'modern',
    format: 'MOD',
    origin: 'Winner of the tracked music competition at Revision 2014',
    blurb: 'A four-channel ProTracker MOD with rapped vocals that won the tracked music competition at Revision 2014.',
  },
  {
    modarchiveId: 178969,
    title: 'Virtual Void',
    artist: 'Saga Musix',
    artistName: 'Johannes Schultz',
    group: 'Nuance',
    year: 2016,
    era: 'modern',
    format: 'MOD',
    origin: '2nd place, ProTracker music competition, Evoke 2016',
    blurb:
      'A four-channel ProTracker MOD by the maintainer of OpenMPT, who describes it as “restricting myself to make a 4-channel ProTracker MOD for once”.',
  },
  {
    modarchiveId: 191474,
    title: 'Brofists',
    artist: 'Bonefish & Mygg',
    year: 2021,
    era: 'modern',
    format: 'MOD',
    origin: 'Winner of the tracked music competition at Revision Online 2021',
    blurb:
      'A four-channel ProTracker MOD, the same format as the Amiga pieces from three decades earlier, that won the tracked music competition at Revision Online 2021.',
  },
  {
    modarchiveId: 209862,
    title: 'E1M777',
    artist: 'Dubmood & MASTER BOOT RECORD',
    group: 'Razor 1911',
    year: 2025,
    era: 'modern',
    format: 'XM',
    origin: 'Winner of the tracked music competition at Revision 2025',
    blurb:
      'Winner of the tracked music competition at Revision 2025. Its instrument text says it is built from “mostly chopped up ST-01 samples” and signs off “Sorry Karsten”, a nod to the 1987 Soundtracker sample disk.',
    withholdSampleText: true,
  },
];

/** The exhibit the reel is set to when the page loads: the one marked `opens`. */
export function openingExhibit(): Exhibit {
  const marked = exhibits.filter((exhibit) => exhibit.opens);
  const [opening] = marked;
  if (marked.length !== 1 || !opening) throw new Error(`Exactly one exhibit should set opens; ${marked.length} do`);
  return opening;
}

export function downloadUrl(exhibit: Exhibit): string {
  return `https://api.modarchive.org/downloads.php?moduleid=${exhibit.modarchiveId}`;
}

export function pageUrl(exhibit: Exhibit): string {
  return `https://modarchive.org/index.php?request=view_by_moduleid&query=${exhibit.modarchiveId}`;
}

/** "Captain (Markus Kaarlonen)", or "Jester (Volker Tripp) · Sanity" when a group is known. */
export function credit(exhibit: Exhibit): string {
  const name = exhibit.artistName ? `${exhibit.artist} (${exhibit.artistName})` : exhibit.artist;
  return exhibit.group ? `${name} · ${exhibit.group}` : name;
}

export function yearLabel(exhibit: Exhibit): string {
  return exhibit.circa ? `c. ${exhibit.year}` : String(exhibit.year);
}
