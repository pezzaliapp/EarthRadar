import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Layout from './Layout';

function renderLayout() {
  return render(
    <MemoryRouter>
      <Layout>
        <div>content</div>
      </Layout>
    </MemoryRouter>,
  );
}

describe('Layout — A11y baseline', () => {
  it('renders the skip-link as the first focusable element of the page', () => {
    renderLayout();
    // Cerca tutti i link in DOM order; il primo deve essere lo skip-link.
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', '#main');
    expect(links[0].textContent ?? '').toMatch(/(Vai al contenuto|Skip to content)/);
  });

  it('exposes the main landmark with id="main" so the skip-link can target it', () => {
    renderLayout();
    const main = screen.getByRole('main');
    expect(main.id).toBe('main');
    // tabIndex=-1 permette al focus programmato dallo skip-link di atterrarci.
    expect(main).toHaveAttribute('tabindex', '-1');
  });

  it('renders the Header navigation as a primary nav landmark', () => {
    renderLayout();
    // Header dichiara `aria-label="Primary"`.
    const navs = screen.getAllByRole('navigation');
    expect(navs.some((n) => n.getAttribute('aria-label') === 'Primary')).toBe(true);
  });

  it('renders the contentinfo (footer) landmark', () => {
    renderLayout();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });
});
