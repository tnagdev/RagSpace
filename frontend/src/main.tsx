import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import './styles.css'
import reportWebVitals from './reportWebVitals.ts'
import RootRouter from './routes/index.tsx'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PlansModalProvider } from './contexts/PlansModalContext'
import { PlansModal } from './components/payment'

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
        },
    },
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
