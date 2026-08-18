import { Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import Layout from './components/layout/Layout';
import HtmlLangSync from './i18n/HtmlLangSync';
import ErrorBoundary from './components/common/ErrorBoundary';
import { SkeletonCard } from './components/common/Skeleton';

const Home = lazy(() => import('./pages/Home'));
const About = lazy(() => import('./pages/About'));
const Education = lazy(() => import('./pages/Education'));
const RadarMode = lazy(() => import('./pages/RadarMode'));
const SeismicAnomaly = lazy(() => import('./pages/SeismicAnomaly'));

function PageFallback() {
  return (
    <div className="space-y-4">
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}

export default function App() {
  return (
    <Layout>
      <HtmlLangSync />
      <ErrorBoundary>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/anomaly" element={<SeismicAnomaly />} />
            <Route path="/education" element={<Education />} />
            <Route path="/radar-mode" element={<RadarMode />} />
            <Route path="/about" element={<About />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </Layout>
  );
}
