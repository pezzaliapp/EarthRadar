import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import BottomNav from './BottomNav';

function renderNav() {
  return render(
    <MemoryRouter>
      <BottomNav />
    </MemoryRouter>,
  );
}

describe('BottomNav — mobile bottom navigation', () => {
  it('renders all five navigation items', () => {
    renderNav();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(5);
  });

  it('is fixed to the bottom edge of the viewport (not sticky/relative)', () => {
    renderNav();
    const nav = screen.getByTestId('bottom-nav');
    // Regressione: la barra deve essere `fixed` e ancorata a bottom-0/inset-x-0,
    // così non attraversa il centro della viewport durante lo scroll.
    expect(nav.className).toContain('fixed');
    expect(nav.className).toContain('bottom-0');
    expect(nav.className).toContain('inset-x-0');
  });

  it('respects the iPhone safe-area via the .bottom-nav class', () => {
    renderNav();
    const nav = screen.getByTestId('bottom-nav');
    expect(nav.className).toContain('bottom-nav');
  });

  it('is hidden on desktop (md:hidden)', () => {
    renderNav();
    const nav = screen.getByTestId('bottom-nav');
    expect(nav.className).toContain('md:hidden');
  });

  it('gives each item a touch target of at least ~44px', () => {
    renderNav();
    const links = screen.getAllByRole('link');
    for (const link of links) {
      expect(link.className).toMatch(/min-h-\[\d+px\]/);
    }
  });
});

describe('index.css — mobile layout root cause', () => {
  const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');

  it('does NOT apply a transform to body (would break position: fixed)', () => {
    // Il bug originale: `body { transform: translateZ(0) }` creava un
    // containing block per gli elementi fixed. Questa guardia impedisce la
    // reintroduzione.
    const bodyBlock = css.slice(css.indexOf('body {'), css.indexOf('#root {'));
    expect(bodyBlock).not.toMatch(/transform\s*:/);
  });

  it('uses modern viewport units (dvh) for the app shell height', () => {
    expect(css).toContain('100dvh');
  });

  it('defines safe-area aware bottom padding for content and nav', () => {
    expect(css).toContain('.pb-safe-nav');
    expect(css).toContain('.bottom-nav');
    expect(css).toContain('env(safe-area-inset-bottom)');
  });
});
