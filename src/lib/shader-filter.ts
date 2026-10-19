/** The kind filter on /fun/shaders: a chip hides the tiles of other kinds, and the stage steps through the rest. */
const chips = document.querySelectorAll<HTMLButtonElement>('[data-filter]');
const tiles = document.querySelectorAll<HTMLElement>('li[data-kind]');
for (const chip of chips) {
  chip.addEventListener('click', () => {
    const kind = chip.dataset.filter;
    for (const other of chips) other.setAttribute('aria-pressed', String(other === chip));
    for (const tile of tiles) tile.hidden = kind !== 'all' && tile.dataset.kind !== kind;
  });
}
