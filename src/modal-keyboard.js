// Called after each render because the app replaces its dialog DOM.
export function bindModalKeyboard(dialog, { mode, onDismiss }) {
  if (!dialog) return;
  const buttons = () => [...dialog.querySelectorAll('button:not([disabled])')];
  const initial = buttons()[0] || dialog;
  initial.focus();
  dialog.onkeydown = event => {
    if (event.key === 'Escape' && mode !== 'progress') {
      event.preventDefault();
      event.stopPropagation();
      onDismiss();
    } else if (event.key === 'Tab') {
      const items = buttons();
      const index = items.indexOf(dialog.ownerDocument.activeElement);
      if (!items.length || index < 0 || (event.shiftKey ? index === 0 : index === items.length - 1)) {
        event.preventDefault();
        (event.shiftKey ? items.at(-1) : items[0])?.focus();
      }
    }
  };
}
