/*global jtminjsDecorateWithUtilities, window */
/*jslint browser, white, fudge */

var app = {};
var jt = {};

(function () {
    "use strict";

    var modules = ["db", "player", "filter"];

    function init2 () {
        modules.forEach(function (modname) {
            app[modname].init(); });
    }


app = {
    init: function () {
        jtminjsDecorateWithUtilities(jt);
        jt.out("contentdiv", jt.tac2html(
            [["div", {cla:"paneldiv", id:"pandbdiv"}],
             ["div", {cla:"paneldiv", id:"panplaydiv"}],
             ["div", {cla:"paneldiv", id:"panfiltdiv"}],
             ["div", {cla:"paneldiv", id:"pandeckdiv"}]]));
        var href = window.location.href;
        if(href.indexOf("#") > 0) {
            href = href.slice(0, href.indexOf("#")); }
        if(href.indexOf("?") > 0) {
            href = href.slice(0, href.indexOf("?")); }
        jt.loadAppModules(app, modules.map((x) => "js/amd/" + x), 
                          href, init2, "?v=191014");
    },

    togdivdisp: function (divid, display) {
        var div = jt.byId(divid);
        if(!div) {  //div not available yet, so nothing to do
            return; }
        if(!display) {
            display = div.style.display;
            if(display === "none") {
                display = "block"; }
            else {
                display = "none"; } }
        div.style.display = display;
    }

};
}());