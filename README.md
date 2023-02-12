# Pokéwalker EEPROM Editor

This repo contains a Svelte application that can display the content of Pokéwalker EEPROM images in a human-readable way.
The main goal for this project is to make it easy to experiment with the format of the EEPROM and to eventually discover what every last byte is meant to do.

This will eventually be an editor, but for now it is just a viewer.

The data format as defined in this project is based on [DmitryGR's work on reversing the Pokéwalker](http://dmitry.gr/?r=05.Projects&proj=28.%20pokewalker).
Without his work this project would not be possible.

## Contributing
Contributions are welcome, both for changes to the [format spec](./src/pokewalker/spec.ts) or for the UI.