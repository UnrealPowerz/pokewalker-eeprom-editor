import './app.css'
import { mount } from 'svelte'
import App from './App.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('mount target #app not found')

export default mount(App, { target })
