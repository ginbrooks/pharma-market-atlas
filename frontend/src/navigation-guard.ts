// Editors can cancel internal navigation while they have unsaved work.
export const navigationEvent = 'research-before-navigate';
export function allowNavigation() {
  return window.dispatchEvent(new Event(navigationEvent, {cancelable: true}));
}
