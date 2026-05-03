import { ReactNode } from 'react';
import Header from './Header';
import BottomNav from './BottomNav';
import Footer from './Footer';
import DisclaimerBanner from './DisclaimerBanner';
import { useTranslation } from '@/i18n';

interface Props {
  children: ReactNode;
}

export default function Layout({ children }: Props) {
  const { language } = useTranslation();
  return (
    <div className="starfield flex min-h-screen flex-col">
      <a href="#main" className="skip-link">
        {language === 'it' ? 'Vai al contenuto' : 'Skip to content'}
      </a>
      <Header />
      <DisclaimerBanner />
      <main id="main" tabIndex={-1} className="flex-1 px-4 pb-28 pt-4 sm:px-6 lg:px-8 md:pb-6">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
      <Footer />
      <BottomNav />
    </div>
  );
}
