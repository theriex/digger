# digger
Contextual music library access.

## Concept

Digger is a local web server to access your music based on your current listening context.  Working?  Party?  Automatically pull music from your library that *you* think is appropriate.

Digger is based on the idea of [contextual music retrieval](https://epinova.com/more/contextual-music-retrieval.html).  Your impressions of a song, and the tags you have associated with it, are used to automatically pull songs from your personal library.  The goal is to get you back to enjoying your music collection without having to browse a wall of files just to get noise in the room.

Digger currently works only on locally available music files.  It has an export feature for copying music to playlists, and rudimentary data import/merge.  https://youtu.be/P9uGBJkQj5k has a walkthrough of some of the interface features.


## Customize

Digger copies the default [config.json](https://github.com/theriex/digger/blob/master/config.json) to .digger_config.json in your home folder.  To customize, change the values to work for you:

 * port: The port the local digger server should listen on.
 * musicPath: Where to find music files on your computer.
 * ignoredirs: Subdirectories of musicPath that should be skipped.
 * dbPath: Where you want to put your digger music data file (digdat.json).
 * exPath: Where exported songs should be copied to.
 * spawn: Optional command to run when digger starts up.



## Install

Digger is available as single packaged executable that can be downloaded and run by double clicking it.  You can find linux|macos|win versions under "Assets" in the latest [release](https://github.com/theriex/digger/releases).

If you prefer to run from source, follow these steps:

Setup:
1. Download the digger source code or git clone the project.
2. If haven't already, install [node.js](https://nodejs.org/en/download/)
3. npm install

Whenever you want music
1. node digger.js
2. Open [http://localhost:6980](http://localhost:6980)


## Status

See the issues page for ongoing development.  Get in touch via email.
