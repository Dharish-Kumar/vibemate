// Home page entry (index.html): log in first, load my chats, then show the app
import { createRoot } from 'react-dom/client'
import './styles/style.css'
import './styles/shell.css'
import './styles/app.css'
import App from './App.jsx'
import { requireUser } from './lib/auth.js'
import { loadChats } from './lib/chatsApi.js'

;(async () => {
  try {
    const user = await requireUser()
    const chats = await loadChats().catch((err) => { console.warn('Chats:', err.message); return [] })
    window.__vmStarted = true
    createRoot(document.getElementById('root')).render(<App user={user} initialChats={chats} />)
  } catch (err) {
    window.__vmProblems?.push(err.message)   // shown by the start-up safety net in index.html
  }
})()
