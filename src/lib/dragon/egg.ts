/**
 * Wakes the dragon from any trigger on the page: the footer glyph ([data-dragon-egg]) and the
 * hover-only tag in the header ([data-dragon-tag]). Both components import this module, which
 * runs once and binds every trigger it finds. Everything sits behind __DRAGON_ENABLED__, so a
 * build without the dragon drops the game's dynamic import along with it.
 */
if (__DRAGON_ENABLED__) {
  const load = () => import('./game');

  const launch = async (origin: { x: number; y: number }, trigger: HTMLElement): Promise<void> => {
    try {
      const { startDragon } = await load();
      startDragon(origin, trigger);
    } catch (error) {
      console.error('The dragon easter egg failed to start; the page is unchanged.', error);
    }
  };

  // Warm the chunk as soon as a trigger is found, so the click itself feels instant.
  const warm = async (): Promise<void> => {
    try {
      await load();
    } catch (error) {
      console.warn('Dragon easter egg chunk failed to preload; it will load on click.', error);
    }
  };

  for (const trigger of document.querySelectorAll<HTMLElement>('[data-dragon-egg], [data-dragon-tag]')) {
    trigger.addEventListener('pointerenter', () => void warm(), { once: true });
    trigger.addEventListener('focus', () => void warm(), { once: true });
    trigger.addEventListener('click', (event) => {
      // A keyboard click has no pointer position: start the fire at the trigger itself.
      const box = trigger.getBoundingClientRect();
      const keyboard = event.detail === 0;
      void launch(
        {
          x: keyboard ? box.left + box.width / 2 : event.clientX,
          y: keyboard ? box.top + box.height / 2 : event.clientY,
        },
        trigger,
      );
    });
  }
}
