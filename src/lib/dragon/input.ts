/** Keyboard, mouse (pointer lock when the browser grants it), touch and gamepad, folded into one control state. */

export interface Controls {
  steerX: number;
  steerY: number;
  throttle: number;
  boost: boolean;
  fire: boolean;
}

export type InputDevice = 'mouse' | 'touch' | 'gamepad';

export interface InputHandlers {
  onExit(): void;
  onMute(): void;
  onFireball(): void;
  /** The browser took pointer lock away (Esc is swallowed by the browser while locked). */
  onLockLost(): void;
  /** Start on a gamepad: pause, or fly on. */
  onPauseToggle(): void;
  /** The player switched to a different kind of control; the game swaps its hints. */
  onDevice(device: InputDevice): void;
}

export interface Input {
  controls: Controls;
  /** True once a touch has been seen; the game shows the on-screen buttons. */
  touch: boolean;
  device: InputDevice;
  update(dt: number): void;
  requestLock(): void;
  /** Wires an on-screen button that holds `control` on for as long as it is pressed. */
  hold(button: HTMLElement, control: 'fire' | 'boost'): void;
  /** Shakes the gamepad, if there is one that can; strength 0..1. */
  rumble(strength: number, seconds: number): void;
  readonly locked: boolean;
}

const MOUSE_SENSITIVITY = 0.0025;
/** How fast the virtual stick drifts back to centre once the mouse stops, per second. */
const STICK_RETURN = 1.6;
const TOUCH_RADIUS = 80;
/** Keys ease in and out over about a fifth of a second instead of snapping to full deflection. */
const KEY_RATE = 5.5;
const GAMEPAD_DEADZONE = 0.14;
/** Above 1, small stick movements turn gently and full deflection still turns hard. */
const STEER_CURVE = 1.45;

const HANDLED_KEYS = new Set(['w', 'a', 's', 'd', 'e', 'f', 'm', ' ', 'shift', 'escape', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

/** Standard-mapping gamepad buttons. */
const PAD = { a: 0, b: 1, x: 2, y: 3, leftBumper: 4, rightBumper: 5, leftTrigger: 6, rightTrigger: 7, back: 8, start: 9 } as const;

const clamp = (value: number): number => Math.min(1, Math.max(-1, value));
const curve = (value: number): number => Math.sign(value) * Math.abs(value) ** STEER_CURVE;
const approach = (current: number, target: number, step: number): number => current + Math.max(-step, Math.min(step, target - current));

/** Radial deadzone, rescaled so the stick still reaches 1 at the edge. */
function deadzone(x: number, y: number): [number, number] {
  const length = Math.hypot(x, y);
  if (length < GAMEPAD_DEADZONE) return [0, 0];
  const scale = Math.min(1, (length - GAMEPAD_DEADZONE) / (1 - GAMEPAD_DEADZONE)) / length;
  return [x * scale, y * scale];
}

export function createInput(surface: HTMLElement, signal: AbortSignal, handlers: InputHandlers): Input {
  const controls: Controls = { steerX: 0, steerY: 0, throttle: 0, boost: false, fire: false };
  const keys = new Set<string>();
  const keyAxis = { x: 0, y: 0, throttle: 0 };
  const mouse = { x: 0, y: 0, fire: false };
  const touch = { id: -1, startX: 0, startY: 0, x: 0, y: 0 };
  const held = { fire: false, boost: false };
  const pad = { x: 0, y: 0, throttle: 0, fire: false, boost: false, pressed: new Set<number>(), index: -1 };
  let everLocked = false;

  const setDevice = (device: InputDevice): void => {
    if (input.device === device) return;
    input.device = device;
    handlers.onDevice(device);
  };

  /** Reads the first connected gamepad; buttons fire their actions on the press, not while held. */
  const readGamepad = (): void => {
    const gamepads = navigator.getGamepads?.() ?? [];
    const gamepad = gamepads.find((candidate) => candidate?.connected && candidate.mapping === 'standard') ?? gamepads.find((candidate) => candidate?.connected) ?? null;
    if (!gamepad) {
      pad.index = -1;
      pad.x = 0;
      pad.y = 0;
      pad.throttle = 0;
      pad.fire = false;
      pad.boost = false;
      return;
    }
    pad.index = gamepad.index;
    const [x, y] = deadzone(gamepad.axes[0] ?? 0, gamepad.axes[1] ?? 0);
    const [, throttle] = deadzone(0, gamepad.axes[3] ?? 0);
    const value = (button: number): number => gamepad.buttons[button]?.value ?? 0;
    const down = (button: number): boolean => gamepad.buttons[button]?.pressed ?? false;
    pad.x = x;
    // Stick up climbs, the same as pushing the mouse up.
    pad.y = -y;
    pad.throttle = -throttle;
    pad.fire = value(PAD.rightTrigger) > 0.25;
    pad.boost = value(PAD.leftTrigger) > 0.25 || down(PAD.a);

    const active = pad.fire || pad.boost || x !== 0 || y !== 0 || throttle !== 0 || gamepad.buttons.some((button) => button.pressed);
    if (active) setDevice('gamepad');
    const actions: [number, () => void][] = [
      [PAD.x, handlers.onFireball],
      [PAD.rightBumper, handlers.onFireball],
      [PAD.y, handlers.onMute],
      [PAD.start, handlers.onPauseToggle],
      [PAD.back, handlers.onExit],
    ];
    for (const [button, action] of actions) {
      if (down(button) && !pad.pressed.has(button)) action();
    }
    pad.pressed.clear();
    for (const [button, state] of gamepad.buttons.entries()) {
      if (state.pressed) pad.pressed.add(button);
    }
  };

  const input: Input = {
    controls,
    touch: false,
    device: matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse',
    get locked(): boolean {
      return document.pointerLockElement === surface;
    },
    requestLock: () => {
      void lock();
    },
    hold: (button, control) => {
      button.addEventListener(
        'pointerdown',
        (event) => {
          event.stopPropagation();
          held[control] = true;
        },
        { signal },
      );
      for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
        button.addEventListener(
          type,
          () => {
            held[control] = false;
          },
          { signal },
        );
      }
    },
    rumble: (strength, seconds) => {
      if (pad.index < 0) return;
      const actuator = navigator.getGamepads?.()[pad.index]?.vibrationActuator;
      if (!actuator) return;
      const effect = { duration: Math.round(seconds * 1000), strongMagnitude: Math.min(1, strength), weakMagnitude: Math.min(1, strength * 0.7) };
      const play = async (): Promise<void> => {
        try {
          await actuator.playEffect('dual-rumble', effect);
        } catch (error) {
          // Some pads report an actuator but refuse effects; the game plays on without rumble.
          console.debug('Dragon: gamepad rumble refused.', error);
        }
      };
      void play();
    },
    update: (dt) => {
      readGamepad();
      if (input.locked) {
        // The virtual stick drifts back to centre, so letting go of the mouse levels the dragon out.
        const decay = Math.exp(-dt * STICK_RETURN);
        mouse.x *= decay;
        mouse.y *= decay;
      }
      const keyX = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
      const keyY = (keys.has('arrowup') ? 1 : 0) - (keys.has('arrowdown') ? 1 : 0);
      const keyThrottle = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0);
      keyAxis.x = approach(keyAxis.x, keyX, dt * KEY_RATE);
      keyAxis.y = approach(keyAxis.y, keyY, dt * KEY_RATE);
      keyAxis.throttle = approach(keyAxis.throttle, keyThrottle, dt * KEY_RATE);
      controls.steerX = clamp(curve(clamp(mouse.x + touch.x + pad.x)) + keyAxis.x);
      controls.steerY = clamp(curve(clamp(mouse.y + touch.y + pad.y)) + keyAxis.y);
      controls.throttle = clamp(keyAxis.throttle + pad.throttle);
      controls.boost = keys.has('shift') || held.boost || pad.boost;
      controls.fire = keys.has(' ') || mouse.fire || held.fire || pad.fire;
    },
  };

  const lock = async (): Promise<void> => {
    if (input.touch || !surface.requestPointerLock) return;
    try {
      await surface.requestPointerLock();
    } catch (error) {
      // Refused (no user gesture left, Chrome's cool-down right after Esc, or an embedding that forbids
      // it): steer by pointer position instead, even if an earlier lock had switched that off.
      everLocked = false;
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
      setDevice('mouse');
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
    if (input.locked) {
      everLocked = true;
      return;
    }
    if (!everLocked) return;
    // The virtual stick only recentres while locked; without this it would hold the last deflection.
    mouse.x = 0;
    mouse.y = 0;
    mouse.fire = false;
    handlers.onLockLost();
  });

  listen('mousemove', (event) => {
    if (input.touch) return;
    if (input.locked) {
      mouse.x = clamp(mouse.x + event.movementX * MOUSE_SENSITIVITY);
      mouse.y = clamp(mouse.y - event.movementY * MOUSE_SENSITIVITY);
      if (event.movementX !== 0 || event.movementY !== 0) setDevice('mouse');
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
        setDevice('touch');
        if (touch.id !== -1) return;
        touch.id = event.pointerId;
        touch.startX = event.clientX;
        touch.startY = event.clientY;
        return;
      }
      setDevice('mouse');
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
