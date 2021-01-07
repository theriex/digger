# digger
Contextual music library access.

## Concept

Digger is a local web server to access your music based on your current listening context.  Working?  Party?  Automatically pull music from your library that *you* think is appropriate.

Digger is based on the idea of [contextual music retrieval](https://epinova.com/more/contextual-music-retrieval.html).  Your impressions of a song, and the tags you have associated with it, are used to automatically pull songs from your personal library.  The goal is to get you back to enjoying your music collection without having to browse a wall of files just to get noise in the room.

Currently Digger works only on locally available music files.  It has an export feature for copying music to playlists, and rudimentary data import/merge.  https://youtu.be/P9uGBJkQj5k has a walkthrough of some of the interface features.


## Customize

By default, digger loads [config.json](https://github.com/theriex/digger/blob/master/config.json) to find where to read music files, store data, export playlists, and what browser to launch at startup.  To customize, copy the default config.json file to ~/.digger_config.json and change the values to work for you.

 * port: The port the local digger server should listen on.
 * musicPath: Where to find music files on your computer.
 * ignoredirs: Subdirectories of musicPath that should be skipped.
 * dbPath: Where you want to put your digger music data file (digdat.json).
 * exPath: Where exported songs should be copied to.
 * spawn: Optional command to run when digger starts up.

If you are running the packaged app, the digdat.json data file and diggerexport playlist folder are written to your user directory by default.  If you are running a local copy of the project using node, then those files are written to the directory you are running from by default.  If you are going to mix and match how you run digger, setting up ~/.digger_config.json ensures consistency.


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
