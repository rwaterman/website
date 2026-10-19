/**
 * The dragon's soundtrack: tracker modules played live by the same libopenmpt worklet as the /fun
 * museum, streamed from The Mod Archive when the flight begins. No module file lives in this repo.
 *
 * Both tracks were checked in October 2026: the license shown on each module page, the download
 * (a real Impulse Tracker file, served with CORS), and the length with libopenmpt. Credit the scene
 * handle only; neither artist page gives a real name.
 */
import { TrackerPlayer } from '../tracker-player';

export interface Track {
  modarchiveId: number;
  title: string;
  artist: string;
  license: string;
  licenseUrl: string;
}

export const SOUNDTRACK: Track[] = [
  // Orchestral metal: guitars over choir, brass, cellos and timpani.
  { modarchiveId: 167789, title: 'Dungeons of Splendor', artist: 'Pip Malt', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' },
  // Orchestral, built only from CC0 samples (VSCO, VCSL).
  { modarchiveId: 193540, title: 'Massive Phenomena', artist: 'K. Jose', license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' },
];

const VOLUME = 0.55;

export const trackPage = (track: Track): string => `https://modarchive.org/index.php?request=view_by_moduleid&query=${track.modarchiveId}`;
const trackDownload = (track: Track): string => `https://api.modarchive.org/downloads.php?moduleid=${track.modarchiveId}`;

/** Plays the soundtrack in order, round and round, and tells the HUD which track is on for the credit. */
export class DragonMusic {
  private readonly player: TrackerPlayer;
  private readonly onTrack: (track: Track) => void;
  private index = 0;
  private muted = false;
  private disposed = false;

  constructor(onTrack: (track: Track) => void) {
    this.onTrack = onTrack;
    this.player = new TrackerPlayer({
      onLoaded: () => undefined,
      onPosition: () => undefined,
      onEnded: () => {
        this.index = (this.index + 1) % SOUNDTRACK.length;
        void this.playCurrent();
      },
      onError: (message) => {
        console.warn(`Dragon: ${SOUNDTRACK[this.index].title} would not play (${message}); trying the next track.`);
        this.index = (this.index + 1) % SOUNDTRACK.length;
        void this.playCurrent();
      },
    });
    this.player.setVolume(VOLUME);
  }

  start(): void {
    void this.playCurrent();
  }

  private async playCurrent(): Promise<void> {
    if (this.disposed) return;
    const track = SOUNDTRACK[this.index];
    this.onTrack(track);
    try {
      await this.player.play(trackDownload(track));
    } catch (error) {
      // No network, or the archive is down: the dragon flies on to its own sound effects.
      console.warn(`Dragon: the soundtrack could not be downloaded (${track.title}).`, error);
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.player.setVolume(muted ? 0 : VOLUME);
  }

  async pause(): Promise<void> {
    await this.player.pause();
  }

  async resume(): Promise<void> {
    if (!this.muted) this.player.setVolume(VOLUME);
    await this.player.resume();
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    await this.player.dispose();
  }
}
