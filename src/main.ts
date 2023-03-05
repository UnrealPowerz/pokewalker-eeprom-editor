import './app.css'
import App from './App.svelte'
import { loadRom } from './nds/load-rom';

const app = new App({
  target: document.getElementById('app')!,
})

;(async () => {
  const resp = await fetch('/PokemonSS_EU.nds')
  const data = await resp.arrayBuffer()
  
  loadRom(data)
})()

export default app
