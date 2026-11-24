import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router-dom';
import { APP_NAME } from './config';
import { router } from './router';
import { store } from './store';
import { ThemeModeProvider } from './theme/ThemeModeProvider';

document.title = APP_NAME;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeModeProvider>
      <Provider store={store}>
        <RouterProvider router={router} />
      </Provider>
    </ThemeModeProvider>
  </StrictMode>,
);
