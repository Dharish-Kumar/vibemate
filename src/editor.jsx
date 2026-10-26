// Banner editor entry (bannercreation.html): log in first
import { createRoot } from 'react-dom/client'
import './styles/style.css'
import './styles/bannercreation.css'
import Editor from './editor/Editor.jsx'
import { requireUser } from './lib/auth.js'

requireUser()
  .then(() => createRoot(document.getElementById('root')).render(<Editor />))
  .catch((err) => {
    document.getElementById('root').innerHTML = '<p style="padding:40px;font:15px system-ui">' + err.message + '</p>'
  })
