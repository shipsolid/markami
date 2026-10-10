import { expect, test, type Page } from '@playwright/test';
import { marketplaceFixture, openProductionWebview, type WebviewTheme } from './productionWebview.js';

// Values are VS Code's own defaults for each built-in theme family.
const themes: Readonly<Record<string, WebviewTheme & { readonly editorBackground: string; readonly buttonBackground: string }>> = {
  dark: {
    bodyClass: 'vscode-dark',
    editorBackground: 'rgb(30, 30, 30)',
    buttonBackground: 'rgb(58, 61, 65)',
    tokens: {
      '--vscode-editor-background': '#1e1e1e', '--vscode-editor-foreground': '#d4d4d4',
      '--vscode-editorGutter-background': '#1e1e1e', '--vscode-editorLineNumber-foreground': '#858585',
      '--vscode-button-secondaryBackground': '#3a3d41', '--vscode-button-secondaryForeground': '#ffffff',
      '--vscode-button-secondaryHoverBackground': '#45494e', '--vscode-widget-border': '#303031',
      '--vscode-editorWidget-background': '#252526', '--vscode-editorWidget-border': '#454545'
    }
  },
  light: {
    bodyClass: 'vscode-light',
    editorBackground: 'rgb(255, 255, 255)',
    buttonBackground: 'rgb(95, 106, 121)',
    tokens: {
      '--vscode-editor-background': '#ffffff', '--vscode-editor-foreground': '#1f1f1f',
      '--vscode-editorGutter-background': '#ffffff', '--vscode-editorLineNumber-foreground': '#6e7681',
      '--vscode-button-secondaryBackground': '#5f6a79', '--vscode-button-secondaryForeground': '#ffffff',
      '--vscode-button-secondaryHoverBackground': '#4c5561', '--vscode-widget-border': '#c8c8c8',
      '--vscode-editorWidget-background': '#f8f8f8', '--vscode-editorWidget-border': '#c8c8c8'
    }
  },
  highContrast: {
    bodyClass: 'vscode-high-contrast',
    editorBackground: 'rgb(0, 0, 0)',
    buttonBackground: 'rgb(0, 0, 0)',
    tokens: {
      '--vscode-editor-background': '#000000', '--vscode-editor-foreground': '#ffffff',
      '--vscode-editorGutter-background': '#000000', '--vscode-editorLineNumber-foreground': '#ffffff',
      '--vscode-button-secondaryBackground': '#000000', '--vscode-button-secondaryForeground': '#ffffff',
      '--vscode-button-secondaryHoverBackground': '#000000', '--vscode-contrastBorder': '#6fc3df',
      '--vscode-editorWidget-background': '#000000', '--vscode-editorWidget-border': '#6fc3df'
    }
  }
};

interface ButtonReport {
  readonly label: string;
  readonly background: string;
  readonly border: string;
  readonly contrast: number;
}

// Computed in the page so the "effective" background is whatever actually paints behind the text.
async function reportVisibleButtons(page: Page): Promise<ButtonReport[]> {
  return page.evaluate(() => {
    const channels = (color: string): number[] => (/rgba?\(([^)]+)\)/u.exec(color)?.[1] ?? '0,0,0,0').split(',').map(Number);
    const luminance = ([red = 0, green = 0, blue = 0]: number[]): number => {
      const linear = [red, green, blue].map((value) => {
        const unit = value / 255;
        return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
    };
    const effectiveBackground = (element: Element | null): string => {
      for (let current = element; current !== null; current = current.parentElement) {
        const value = getComputedStyle(current).backgroundColor;
        if ((channels(value)[3] ?? 1) !== 0) return value;
      }
      return getComputedStyle(document.documentElement).backgroundColor;
    };
    return [...document.querySelectorAll('button')]
      .filter((button) => button.getClientRects().length > 0)
      .map((button) => {
        const style = getComputedStyle(button);
        const back = luminance(channels(effectiveBackground(button)));
        const front = luminance(channels(style.color));
        return {
          label: (button.getAttribute('aria-label') ?? button.textContent).trim(),
          background: style.backgroundColor,
          border: `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`,
          contrast: (Math.max(back, front) + 0.05) / (Math.min(back, front) + 0.05)
        };
      });
  });
}

for (const [name, theme] of Object.entries(themes)) {
  test(`${name} theme: gutter and controls follow the VS Code theme instead of browser defaults`, async ({ page }) => {
    await openProductionWebview(page, { fixture: marketplaceFixture('technical'), theme });
    await expect(page.locator('.markami-block-gutter button').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.markami-table-controls button').first()).toBeVisible();

    const gutter = await page.locator('.cm-gutters').evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, borderRight: style.borderRightWidth };
    });
    expect(['rgba(0, 0, 0, 0)', theme.editorBackground]).toContain(gutter.background);
    expect(gutter.borderRight).toBe('0px');

    const buttons = await reportVisibleButtons(page);
    const labels = buttons.map((button) => button.label);
    expect(labels).toEqual(expect.arrayContaining(['Add row', 'Copy typescript block', 'Collapse document outline', 'Edit table source']));
    expect(buttons.filter((button) => button.label.startsWith('Actions for')).length).toBeGreaterThan(0);
    for (const button of buttons) {
      const themed = button.background === theme.buttonBackground || button.background === 'rgba(0, 0, 0, 0)';
      expect(themed, `${button.label} paints ${button.background}`).toBe(true);
      expect(button.contrast, `${button.label} text contrast`).toBeGreaterThanOrEqual(4.5);
    }

    await page.locator('.markami-block-gutter button').first().click();
    await page.mouse.move(1, 1); // the pointer would otherwise leave the clicked button in its hover colour
    const menu = await reportVisibleButtons(page);
    expect(menu.map((button) => button.label)).toContain('Move block down');
    for (const button of menu) {
      expect(button.background === theme.buttonBackground || button.background === 'rgba(0, 0, 0, 0)',
        `${button.label} paints ${button.background}`).toBe(true);
    }

    if (name === 'highContrast') {
      for (const button of buttons.filter((candidate) => candidate.background !== 'rgba(0, 0, 0, 0)')) {
        expect(button.border, `${button.label} border`).toBe('1px solid rgb(111, 195, 223)');
      }
    }
  });
}
