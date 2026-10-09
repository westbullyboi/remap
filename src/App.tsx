import React, { Suspense } from 'react';
import { SnackbarProvider } from 'notistack';
// import './App.css';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import Configure from './components/configure/Configure.container';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enJson from './assets/locales/en.json';
import jaJson from './assets/locales/ja.json';
import LanguageDetector from 'i18next-browser-languagedetector';
import { useUiLayout } from './services/ui/UiLayout';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: enJson,
      },
      ja: {
        translation: jaJson,
      },
    },
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

// Loaded lazily so three.js/WebGL problems can never break the editor.
const Keyboard3DViewer = React.lazy(
  () => import('./components/keyboard3d/Keyboard3DViewer')
);

class App extends React.Component<{}, {}> {
  render() {
    return (
      <Snackbars>
        {/* Matrix ships only the keyboard editor: it is the top page, and
            every other path (including the old /configure) goes there. */}
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Configure />} />
            <Route
              path="/3d"
              element={
                <Suspense fallback={null}>
                  <Keyboard3DViewer />
                </Suspense>
              }
            />
            <Route path="/*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </Snackbars>
    );
  }
}
export default App;

// Notifications. The new layout keeps its main button at the top right, so
// they appear at the bottom right there.
function Snackbars(props: { children: React.ReactNode }) {
  const layout = useUiLayout();
  return (
    <SnackbarProvider
      dense
      preventDuplicate
      hideIconVariant
      maxSnack={4}
      anchorOrigin={{
        vertical: layout === 'shell' ? 'bottom' : 'top',
        horizontal: 'right',
      }}
      classes={{
        variantSuccess: 'mx-snackbar-success',
        variantError: 'mx-snackbar-error',
        variantWarning: 'mx-snackbar-warning',
        variantInfo: 'mx-snackbar-info',
      }}
    >
      {props.children}
    </SnackbarProvider>
  );
}
