import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerLicense } from '@syncfusion/ej2-base'
import './index.css'
import App from './App.jsx'

registerLicense(
  'ORg4AjUWIQQuCC4ARkVUWXxLdEBkWH5LfEp1TXxaf1p0dVZMYVVBJAtUQH5SMwEhMDwA'
)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
