import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import './styles.css'
import reportWebVitals from './reportWebVitals.ts'
import RootRouter from './routes/index.tsx'
import { QueryClientProvider } from '@tanstack/react-query'
import { PlansModalProvider } from './contexts/PlansModalContext'
import { PlansModal } from './components/payment'
import { onUnauthenticated } from './api/client'
import { authKeys } from './hooks/auth'
import { queryClient } from './lib/queryClient'

// An expired session mid-use sends the user back to sign in; auth pages handle 401 themselves.
onUnauthenticated(() => {
    queryClient.setQueryData(authKeys.me(), null);
    if (!window.location.pathname.startsWith('/auth')) window.location.href = '/auth/login';
});

const rootElement = document.getElementById('app')
if (rootElement && !rootElement.innerHTML) {
    const root = ReactDOM.createRoot(rootElement)
    root.render(
        <StrictMode>
            <QueryClientProvider client={queryClient}>
                <PlansModalProvider>
                    <RouterProvider router={RootRouter} />
                    <PlansModal />
                </PlansModalProvider>
            </QueryClientProvider>
        </StrictMode>,
    )
}

reportWebVitals()
