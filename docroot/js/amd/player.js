/*global app, jt */
/*jslint browser, white, fudge, for, long */

app.player = (function () {
    "use strict";

    var stat = {status:"", song:null};

    function initializeDisplay () {
        jt.out("panplaydiv", jt.tac2html(
            [["div", {id:"mediadiv"}, "Player goes here"],
             ["div", {id:"slidersdiv"}, "Sliders go here"],
             ["div", {id:"kwdsdiv"}, "Keyword Toggles go here"]]));
    }


    function play () {
        stat.status = "playing";
        if(!jt.byId("playerdiv")) {
            jt.out("mediadiv", jt.tac2html(
                ["div", {id:"playerdiv"},
                 [["div", {id:"playertitle"}, "Starting"],
                  ["audio", {id:"playeraudio", controls:"controls",
                             autoplay:"autoplay"},  //may or may not happen
                   "WTF? Your browser doesn't support audio.."]]]));
            jt.on("playeraudio", "ended", app.player.next); }
        jt.out("playertitle", jt.tac2html(app.db.songTitleTAC(stat.song)));
        var player = jt.byId("playeraudio");
        player.src = "/audio?path=" + jt.enc(stat.song.path);
        player.play();
    }


    function next () {
        stat.status = "";
        stat.song = app.db.popdeck();
        if(!stat.song) {
            jt.out("mediadiv", "No songs to play."); }
        else {
            play(); }
    }


    function deckUpdated () {
        if(!stat.status) {  //not playing anything yet, start the first song
            next(); }
    }


return {

    init: function () { initializeDisplay(); },
    deckUpdated: function () { deckUpdated(); },
    next: function () { next(); }

};  //end of returned functions
}());

