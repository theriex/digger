# digger
Contextual music library access.

## Concept

Digger is mixing panel for your music library that automatically pulls and plays music matching your [listening context](https://epinova.com/more/contextual-music-retrieval.html).  Now you don't have to face a wall of files just to get noise in the room.

Digger consists of a node.js server for file access and a browser interface for listening.  Prebuilt downloads, and a demo of the interface, are available on [DiggerHub](https://diggerhub.com).


## Customize

Digger copies the default [config.json](https://github.com/theriex/digger/blob/master/config.json) to .digger_config.json in your home folder.  To customize, change the values to work for you:

 * port: The port the local digger server should listen on.
 * musicPath: Where to find music files on your computer.
 * ignoredirs: Subdirectories of musicPath that should be skipped.
 * dbPath: Where you want to put your digger music data file (digdat.json).
 * exPath: Where exported songs should be copied to.
 * spawn: Optional command to run when digger starts up.



## Install

To run from source, follow these steps:

Setup:
1. Download the digger source code or git clone the project.
2. If haven't already, install [node.js](https://nodejs.org/en/download/)
3. npm install

Whenever you want music
1. node digger.js
2. Open [http://localhost:6980](http://localhost:6980)


## Status

See the issues page for ongoing development.  Get in touch via email.

© 2023 Eric Parker
