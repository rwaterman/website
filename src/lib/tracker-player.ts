/**
 * Page-side handle on tracker.worklet.ts: fetches a module file, hands it to the audio thread,
 * and relays what comes back. Nothing is downloaded and no AudioContext exists until the first
 * `play`, which must run inside a click so the browser lets audio start.
 */
import workletUrl from './tracker.worklet.ts?worker&url';
import type { ModuleInfo, Position, TrackerCommand, TrackerEvent } from './tracker.worklet';

export interface TrackerHandlers {
  onLoaded(info: ModuleInfo): void;
  onPosition(position: Position): void;
  onEnded(): void;
  /** The file arrived but libopenmpt could not play it. */
  onError(message: string): void;
}

export class TrackerPlayer {
  private context: AudioContext | undefined;
  private node: Promise<AudioWorkletNode> | undefined;
  /** Id of the newest `play`; events and downloads tagged with an older one are dropped. */
  private request = 0;
  private fetchController: AbortController | undefined;

  constructor(private readonly handlers: TrackerHandlers) {}

  /** Stops whatever is playing and starts the module at `url`. Rejects when the download fails. */
  async play(url: string): Promise<void> {
    const request = ++this.request;
    this.fetchController?.abort();
    const controller = new AbortController();
    this.fetchController = controller;
    try {
      const node = await this.start();
      if (request !== this.request) return;
      this.send(node, { type: 'stop', id: request });

      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      // The Mod Archive answers a retired module id with 200 and an HTML error page.
      if (response.headers.get('content-type')?.startsWith('text/html')) throw new Error('no module at that address');
      const bytes = await response.arrayBuffer();
      if (request !== this.request) return;
      node.port.postMessage({ type: 'load', id: request, bytes } satisfies TrackerCommand, [bytes]);
    } catch (error) {
      if (request !== this.request) return;
      throw error;
    } finally {
      if (this.fetchController === controller) this.fetchController = undefined;
    }
  }

  async pause(): Promise<void> {
    await this.context?.suspend();
  }

  async resume(): Promise<void> {
    await this.context?.resume();
  }

  async seek(seconds: number): Promise<void> {
    if (this.node) this.send(await this.node, { type: 'seek', seconds });
  }

  private send(node: AudioWorkletNode, command: TrackerCommand): void {
    node.port.postMessage(command);
  }

  private async start(): Promise<AudioWorkletNode> {
    // Created synchronously on the first call, before any await, so it stays inside the click.
    this.context ??= new AudioContext();
    this.node ??= this.connect(this.context);
    try {
      await this.context.resume();
      return await this.node;
    } catch (error) {
      // Forget the failed attempt so the next play downloads the worklet again.
      this.node = undefined;
      throw error;
    }
  }

  private async connect(context: AudioContext): Promise<AudioWorkletNode> {
    await context.audioWorklet.addModule(workletUrl);
    const node = new AudioWorkletNode(context, 'tracker', { numberOfInputs: 0, outputChannelCount: [2] });
    node.port.onmessage = (event: MessageEvent<TrackerEvent>) => this.relay(event.data);
    node.connect(context.destination);
    return node;
  }

  private relay(event: TrackerEvent): void {
    if (event.id !== this.request) return;
    if (event.type === 'loaded') this.handlers.onLoaded(event.info);
    else if (event.type === 'position') this.handlers.onPosition(event.position);
    else if (event.type === 'ended') this.handlers.onEnded();
    else this.handlers.onError(event.message);
  }
}
