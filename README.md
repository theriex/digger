# digger
Zero planning enjoyment of your music collection

## Concept

In digger terms, a music *library* is a vast set of music files like what
you find on Spotify, SoundCloud, a radio station, or that pirated archive
you've been hoarding.  A music *collection* is a subset of songs you would
be interested in hearing again.

Digger helps you enjoy your *collection* by pulling and playing songs you
haven't heard in the longest time.  Digger uses range controls and keywords
to pull situationally appropriate tracks without having to think too much.

https://youtu.be/P9uGBJkQj5k has a walkthrough of the interface.


## Structure

Digger runs as a webapp, supported by a server that handles the file
crawling and data storage.  The idea is to work with minimal and open 
technology so Digger can be adapted to a wide variety of situations.

To run digger locally on a local collection of audio files, you will need to
have [node.js](https://nodejs.org/en/download/) installed.  In the
directory where you downloaded the digger project, install these node
extensions:

    npm install jsmediatags --save
    npm install node-static
    npm i -S formidable

Then run digger:

    node digger.js MUSICDIR DIGGERDBFILE

If you don't specify a db file, the default is MUSICDIR/digdat.json

With the server running, open http://localhost:6980 in a browser.


## Status

See issues for ongoing development.  Definitely interested in packaging
Digger for a wider audience and other media access models.  Get in touch via
email.


