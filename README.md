# digger
Contextual music library access.

## Concept

Digger is a web server that allows you to access your music based on your listening context.  Working?  Party?  Automatically pull music from your library that *you* think is appropriate.

Digger is based on the idea of [contextual music retrieval](https://epinova.com/more/contextual-music-retrieval.html).  Your impressions of a song, and the tags you have associated with it, are used to automatically pull songs from your personal library.  The goal is to get you back to enjoying your music collection without having to face a wall of files whenever you want noise in the room.

Currently Digger works only on locally available music files.  It has an export feature for copying music to playlists, and rudimentary data import/merge.  https://youtu.be/P9uGBJkQj5k has a walkthrough of some of the interface features.


## Customize

By default, digger loads [config.json](https://github.com/theriex/digger/blob/master/config.json) to find where to read music files, store data, export playlists, and what browser to launch at startup.  To customize, copy this file to ~/.digger_config.json and change the values to work for you.

If you are running the packaged app, the digdat.json data file and diggerexport playlist folder are written to your user directory by default.  If you are running a local copy of the project using node, by default those files are written to the directory you are running from.


## Install

Setup:
1. Download digger or git clone the project.
2. If haven't already, install [node.js](https://nodejs.org/en/download/)
3. npm install

Whenever you want music
1. node digger.js
2. Open [http://localhost:6980](http://localhost:6980)


## Status

See the issues page for ongoing development.  Get in touch via email.


