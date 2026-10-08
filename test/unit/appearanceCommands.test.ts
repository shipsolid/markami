import { describe, expect, test, vi } from 'vitest';
import {
  chooseDocumentAppearance,
  chooseDocumentWidth,
  type PreferenceChoice
} from '../../src/extension/appearanceCommands.js';

describe('appearance command choices', () => {
  test('explicit validated values bypass the picker for integration callers', async () => {
    const picker = vi.fn();

    await expect(chooseDocumentAppearance('document', picker)).resolves.toBe('document');
    await expect(chooseDocumentWidth('readable', picker)).resolves.toBe('readable');
    expect(picker).not.toHaveBeenCalled();
  });

  test('command-palette invocation presents every labelled choice', async () => {
    const appearancePicker = vi.fn((items: readonly PreferenceChoice[]) => Promise.resolve(items[1]));
    const widthPicker = vi.fn((items: readonly PreferenceChoice[]) => Promise.resolve(items[2]));

    await expect(chooseDocumentAppearance(undefined, appearancePicker)).resolves.toBe('document');
    await expect(chooseDocumentWidth(undefined, widthPicker)).resolves.toBe('full');
    expect(appearancePicker.mock.calls[0]?.[0].map((item) => item.value)).toEqual(['vscode', 'document']);
    expect(widthPicker.mock.calls[0]?.[0].map((item) => item.value)).toEqual(['auto', 'readable', 'full']);
  });

  test('invalid explicit values cannot bypass validation', async () => {
    const picker = vi.fn(() => Promise.resolve(undefined));

    await expect(chooseDocumentAppearance('unsafe', picker)).resolves.toBeUndefined();
    await expect(chooseDocumentWidth(960, picker)).resolves.toBeUndefined();
    expect(picker).toHaveBeenCalledTimes(2);
  });
});
