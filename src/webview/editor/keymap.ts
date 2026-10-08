import type { KeyBinding } from '@codemirror/view';

export interface DocumentKeymapActions {
  readonly save: () => boolean;
  readonly find: () => boolean;
  readonly toggleSourceReveal: () => boolean;
}

export function createDocumentKeymap(actions: DocumentKeymapActions): readonly KeyBinding[] {
  return [
    { key: 'Mod-s', preventDefault: true, run: actions.save },
    { key: 'Mod-f', preventDefault: true, run: actions.find },
    { key: 'Mod-Shift-m', preventDefault: true, run: actions.toggleSourceReveal }
  ];
}
