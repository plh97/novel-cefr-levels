import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'antd/dist/reset.css'
import './i18n'
import './index.css'
import App from './App.tsx'
import { EXAMPLE_NOVELS } from './lib/examples'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App exampleNovels={EXAMPLE_NOVELS} />
  </StrictMode>,
)
