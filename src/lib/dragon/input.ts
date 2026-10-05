/** Keyboard, mouse (pointer lock when the browser grants it) and touch, folded into one control state. */

export interface Controls {
  steerX: number;
  steerY: number;
  throttle: number;
  boost: boolean;
  fire: boolean;
}

export interface InputHandlers {
  onExit(): void;
  onMute(): void;
  onFireball(): void;
  /** The browser took pointer lock away (Esc is swallowed by the browser while locked). */
  onLockLost(): void;
}

export interface Input {
  controls: Controls;
  /** True once a touch has been seen; the game shows the on-screen buttons. */
  touch: boolean;
  update(dt: number): void;
  requestLock(): void;
  /** Wires an on-screen button that breathes fire for as long as it is held. */
  holdFire(button: HTMLElement): void;
  readonly locked: boolean;
}

const MOUSE_SENSITIVITY = 0.0021;
const STICK_RETURN = 0.55;
const TOUCH_RADIUS = 80;

const HANDLED_KEYS = new Set(['w', 'a', 's', 'd', 'e', 'f', 'm', ' ', 'shift', 'escape', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

const clamp = (value: number): number => Math.min(1, Math.max(-1, value));

export function createInput(surface: HTMLElement, signal: AbortSignal, handlers: InputHandlers): Input {
  const controls: Controls = { steerX: 0, steerY: 0, throttle: 0, boost: false, fire: false };
  const keys = new Set<string>();
  const mouse = { x: 0, y: 0, fire: false };
  const touch = { id: -1, startX: 0, startY: 0, x: 0, y: 0 };
  const held = { fire: false };
  let everLocked = false;

  const input: Input = {
    controls,
    touch: false,
    get locked(): boolean {
      return document.pointerLockElement === surface;
    },
    requestLock: () => {
      void lock();
    },
    holdFire: (button) => {
      button.addEventListener(
        'pointerdown',
        (event) => {
          event.stopPropagation();
          held.fire = true;
        },
        { signal },
      );
      for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
        button.addEventListener(
          type,
          () => {
            held.fire = false;
          },
          { signal },
        );
      }
    },
    update: (dt) => {
      if (input.locked) {
        // The virtual stick drifts back to centre, so letting go of the mouse levels the dragon out.
        const decay = Math.exp(-dt * STICK_RETURN);
        mouse.x *= decay;
        mouse.y *= decay;
      }
      const keyX = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
      const keyY = (keys.has('arrowup') ? 1 : 0) - (keys.has('arrowdown') ? 1 : 0);
      controls.steerX = clamp(mouse.x + keyX + touch.x);
      controls.steerY = clamp(mouse.y + keyY + touch.y);
      controls.throttle = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0);
      controls.boost = keys.has('shift');
      controls.fire = keys.has(' ') || mouse.fire || held.fire;
    },
  };

  const lock = async (): Promise<void> => {
    if (input.touch || !surface.requestPointerLock) return;
    try {
      await surface.requestPointerLock();
    } catch (error) {
      // Refused (no user gesture left, or an embedding that forbids it): steer by pointer position instead.
      console.info('Dragon: pointer lock unavailable, steering by pointer position.', error);
    }
  };

  const listen = <K extends keyof DocumentEventMap>(type: K, handler: (event: DocumentEventMap[K]) => void, capture = false): void => {
    document.addEventListener(type, handler, { signal, capture, passive: false });
  };

  // Capture phase and stopPropagation: nothing under the game (the /fun stage keys) sees these.
  listen(
    'keydown',
    (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      // Everything else (F5, F12, browser shortcuts) is left alone.
      if (!HANDLED_KEYS.has(key)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      if (key === 'escape') handlers.onExit();
      else if (key === 'm') handlers.onMute();
      else if (key === 'f' || key === 'e') handlers.onFireball();
      else keys.add(key);
    },
    true,
  );
  listen(
    'keyup',
    (event) => {
      keys.delete(event.key.toLowerCase());
      event.stopPropagation();
    },
    true,
  );
  window.addEventListener('blur', () => keys.clear(), { signal });

  listen('pointerlockchange', () => {
    if (input.locked) everLocked = true;
    else if (everLocked) handlers.onLockLost();
  });

  listen('mousemove', (event) => {
    if (input.touch) return;
    if (input.locked) {
      mouse.x = clamp(mouse.x + event.movementX * MOUSE_SENSITIVITY);
      mouse.y = clamp(mouse.y - event.movementY * MOUSE_SENSITIVITY);
    } else if (!everLocked) {
      mouse.x = clamp(((event.clientX / innerWidth) * 2 - 1) * 1.25);
      mouse.y = clamp((1 - (event.clientY / innerHeight) * 2) * 1.25);
    }
  });

  surface.addEventListener(
    'pointerdown',
    (event) => {
      if (event.pointerType === 'touch') {
        input.touch = true;
        if (touch.id !== -1) return;
        touch.id = event.pointerId;
        touch.startX = event.clientX;
        touch.startY = event.clientY;
        return;
      }
      if (event.button === 0) mouse.fire = true;
      if (event.button === 2) handlers.onFireball();
    },
    { signal },
  );
  listen('pointermove', (event) => {
    if (event.pointerId !== touch.id) return;
    touch.x = clamp((event.clientX - touch.startX) / TOUCH_RADIUS);
    touch.y = clamp((touch.startY - event.clientY) / TOUCH_RADIUS);
  });
  const release = (event: PointerEvent): void => {
    if (event.pointerId === touch.id) {
      touch.id = -1;
      touch.x = 0;
      touch.y = 0;
    }
    if (event.pointerType !== 'touch' && event.button === 0) mouse.fire = false;
  };
  listen('pointerup', release);
  listen('pointercancel', release);
  listen('contextmenu', (event) => event.preventDefault());
  listen('wheel', (event) => event.preventDefault());
  listen('touchmove', (event) => event.preventDefault());

  return input;
}
