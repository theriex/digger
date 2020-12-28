# digger
Contextual music library access.

## Concept

Digger is a web server that allows you to access your music based on your listening context.  Working?  Commuting?  Party?  Automatically pull music *you* think is a good match.

Digger is based on the idea of [contextual music retrieval](https://epinova.com/more/contextual-music-retrieval.html).  Your impressions of a song, and the tags you have associated with it, are used to automatically pull another great track from your personal library.  The goal is to get you back to enjoying your music collection without having to face a wall of files whenever you want noise in the room.

Currently Digger works only on locally available music files.  It has an
export feature for copying music to playlists, and rudimentary data
import/merge.  https://youtu.be/P9uGBJkQj5k has a walkthrough of some of the
interface features.


## Install

Setup:
1. Download digger
2. If haven't already, install [node.js](https://nodejs.org/en/download/)
3. npm install
4. If your music is not in ~/Music, change musicPath in config.json

Whenever you want music
1. node digger.js
2. Open [http://localhost:6980](http://localhost:6980)


## Status

See the issues page for ongoing development.  Get in touch via email.


