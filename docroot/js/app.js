/*global jtminjsDecorateWithUtilities, window, diggerapp */
/*jslint browser, white, long, unordered */

var jt = {};
var app = (function () {
    "use strict";

    function globkey (e) {
        //jt.log("globkey charCode: " + e.charCode + ", keyCode: " + e.keyCode);
        if(e && (e.charCode === 32 || e.keyCode === 32)) {  //space bar
            const edtags = ["textarea", "input"];
            const tname = e.target.tagName;
            if(tname && edtags.indexOf(tname.toLowerCase()) < 0) {
                if(app.spacebarhookfunc) {
                    app.spacebarhookfunc(); } } }
    }


    function init2 () {
        app.amdtimer.load.end = new Date();
        jt.log = console.log;
        jt.log("window.innerWidth/Height: " + window.innerWidth + " x " +
               window.innerHeight);
        jt.on(document, "keydown", globkey);
        app.startParams = jt.parseParams("String");
        app.startPath = window.location.pathname.toLowerCase();
        if(diggerapp.context === "local" || app.startPath === "/digger") {
            if(diggerapp.context === "web") {
                jt.byId("topsectiondiv").style.display = "none"; }
            jt.out("outercontentdiv", jt.tac2html(
                ["div", {id:"contentframingdiv"},
                 ["div", {id:"contentdiv"},
                  [["div", {cla:"paneldiv", id:"pantopdiv"}],
                   ["div", {cla:"paneldiv", id:"panplaydiv"}],
                   ["div", {cla:"paneldiv", id:"panfiltdiv"}],
                   ["div", {cla:"paneldiv", id:"pandeckdiv"}],
                   ["div", {id:"appoverlaydiv"}]]]]));
            if(app.startPath === "/digger") {  //web startup needs auth info
                app.login.init(false); }  //calls initDiggerModules
            else {
                app.initDiggerModules(); } }
        else if(diggerapp.context === "web") {
            app.login.init(); }
    }

return {
    overlaydiv: "appoverlaydiv",
    init: function () {
        var ox = window.location.href;
        if(!diggerapp.context === "web") {
            if((ox.toLowerCase().indexOf("https:") !== 0) &&  //not secure
               (ox.search(/:\d080/) < 0)) {  //and not local dev
                window.location.href = "https:" + ox.slice(ox.indexOf("/"));
                return; } }  //stop and let the redirect happen.
        if(ox.indexOf("android") >= 0) {
            app.docroot = "https://appassets.androidplatform.net/assets/"; }
        else if(ox.indexOf("diggerIOS.app") >= 0) {
            app.docroot = ox.slice(0, ox.lastIndexOf("/")); }
        else {
            app.docroot = ox.split("/").slice(0, 3).join("/") + "/"; }
        if(!jtminjsDecorateWithUtilities) { //support lib not loaded yet
            return setTimeout(app.init, 50); }
        jtminjsDecorateWithUtilities(jt);
        const loadfs = diggerapp.modules.map((p) => "js/amd/" + p.name);
        app.amdtimer = {};
        app.amdtimer.load = { start: new Date() };
        jt.loadAppModules(app, loadfs, app.docroot, init2, "?v=230528");
    },


    restart: init2,


    initDiggerModules: function () {
        diggerapp.modules.forEach(function (md) {
            if(md.type === "dm") {
                app[md.name].init(); } });
    },


    fileVersion: function () {
        return "v=230528";  //updated as part of release process
    },


    //divdesc can be a string divid to display/hide, or a toggle group spec:
    // {rootids:[srcdivroot, srcdivroot2...]
    //  clicked:srcdivroot}
    //The toggleable content group clicked element is "tcgc" + srcdivroot
    //The toggleable content group display element is "tcgd" + srcdivroot
    //Clicked elements have "tcgcactive" or "tcgcinactive" classes added
    togdivdisp: function (divdesc, display) {
        var dispelem = null;
        if(divdesc.rootids) {
            dispelem = jt.byId("tcgd" + divdesc.clicked); }
        else {
            dispelem = jt.byId(divdesc); }
        if(!display) {
            display = dispelem.style.display;
            if(display === "none") {
                display = "block"; }
            else {
                display = "none"; } }
        if(divdesc.rootids) {
            divdesc.rootids.forEach(function (rid) {
                var tcgce = jt.byId("tcgc" + rid);
                var tcgde = jt.byId("tcgd" + rid);
                if(rid === divdesc.clicked) {
                    tcgce.classList.remove("tcgcinactive");
                    tcgce.classList.add("tcgcactive");
                    tcgde.style.display = display; }
                else {
                    if(display === "block") {
                        tcgce.classList.add("tcgcinactive"); }
                    else {
                        tcgce.classList.remove("tcgcinactive"); }
                    tcgce.classList.remove("tcgcactive");
                    tcgde.style.display = "none"; } }); }
        else {
            dispelem.style.display = display; }
    },


    //Return the argument list as a string of arguments suitable for appending
    //to manager dispatch onwhatever function text.
    paramstr: function (args) {
        var ps = "";
        if(args && args.length) {
            ps = args.reduce(function (acc, arg) {
                if((typeof arg === "string") && (arg !== "event")) {
                    arg = "'" + arg + "'"; }
                return acc + "," + arg; }, ""); }  //always start with comma
        return ps;
    },


    //Dispatch function string.  Return an onwhatever function string.
    dfs: function (module, mgrfname, args) {
        var pstr = app.paramstr(args); var fstr;
        mgrfname = mgrfname.split(".");
        fstr = "app." + module + ".dispatch('" + mgrfname[0] + "','" +
            mgrfname[1] + "'" + pstr + ")";
        if(pstr !== ",event") {  //don't return false from event hooks
            fstr = jt.fs(fstr); }
        return fstr;
    },


    //make a cache busted url out of the endpoint and params
    cb: function (endpoint, params, toklev) {
        var url = endpoint + "?";
        toklev = toklev || "second";
        params = params || "";
        if(typeof params === "object") {
            params = jt.objdata(params); }
        if(params) {
            url += params + "&"; }
        url += jt.ts("cb=", toklev);
        return url;
    },


    authdata: function (obj) { //return obj post data, with an/at added
        var digacc = app.top.dispatch("aaa", "getAccount");
        var authdat = jt.objdata({an:digacc.email, at:digacc.token});
        if(obj) {
            authdat += "&" + jt.objdata(obj); }
        return authdat;
    },


    haveHubCredentials: function () {
        var digacc = app.top.dispatch("aaa", "getAccount");
        if(digacc && digacc.dsId !== "101" && digacc.token &&
           app.top.dispatch("ppc", "policyAccepted")) {
            return true; }
        return false;
    },


    //app.docroot is initialized with a terminating '/' so it can be
    //concatenated directly with a relative path, but remembering and
    //relying on whether a slash is required is annoying.  Double slashes
    //are usually handled properly but can be a source of confusion, so this
    //strips off any preceding slash in the relpath.
    dr: function (relpath) {
        if(relpath.startsWith("/")) {
            relpath = relpath.slice(1); }
        return app.docroot + relpath;
    },


    //Extract plain text from errmsg.  Controlled server errors return
    //reasonable text errors, but server crashes and anything handled by the
    //container may return full html pages which take up huge space in the 
    //UI when rendered.  This logs the original and returns best guess text.
    pt: function (errmsg) {
        errmsg = errmsg || "";
        const lcmsg = errmsg.toLowerCase();
        if(lcmsg.indexOf("<html") >= 0) {
            jt.log("app.pt original html errmsg: " + errmsg);
            const hidx = lcmsg.indexOf("<h1>");
            if(hidx >= 0) {
                errmsg = errmsg.slice(hidx + 4);
                const ci = errmsg.indexOf("</");
                if(ci >= 0) {
                    errmsg = errmsg.slice(0, ci); } }
            jt.log("app.pt returning: " + errmsg); }
        return errmsg;
    },


    subPlaceholders: function (divid, extlnk, body) {
        const dom = "diggerhub.com";
        const bot = "@" + dom;
        const docpre = "https://" + dom + "/docs/";
        const repls = [
            {plc:"MANUAL", txt:"Manual", url:docpre + "manual.html"},
            {plc:"TERMS", txt:"Terms", url:docpre + "terms.html"},
            {plc:"PRIVACY", txt:"Privacy", url:docpre + "privacy.html"},
            {plc:"SUPPORT", txt:"Support", url:docpre + "support.html"},
            {plc:"PRIVPOLICY", txt:"privacy policy",
             url:docpre + "privacy.html"},
            {plc:"OPENSOURCE", txt:"open source",
             url:"https://github.com/theriex/digger"},
            {plc:"ISSUESONGITHUB", txt:"issues on GitHub",
             url:"https://github.com/theriex/digger/issues"},
            {plc:"SUPPEMAIL", txt:"support" + bot,
             url:"mailto:support" + bot},
            {plc:"EPINOVA", txt:"epinova.com", url:"https://epinova.com"}];
        repls.forEach(function (repl) {
            var link = repl.url;
            if(link.startsWith(docpre)) {  //internal doc url
                link = jt.tac2html(["a", {href:link, onclick:jt.fs(
                    "app.displayDoc('" + divid + "','" + link + "')")},
                                    repl.txt]); }
            else if(extlnk) {  //external links supported by UI
                link = jt.tac2html(["a", {href:link, onclick:jt.fs(
                    "window.open('" + link + "')")}, repl.txt]); }
            else {  //links not supported
                if(link.startsWith("mailto")) {
                    link = repl.txt; }
                else {  //regular link
                    link = repl.txt + " (" + repl.url + ")"; } }
            body = body.replace(new RegExp(repl.plc, "g"), link); });
        return body;
    },


    docDynamicContent: function () {
        const lut = jt.byId("privlut");
        if(lut) {
            lut.innerHTML = jt.colloquialDate(lut.innerHTML); }
        const hdm = app.svc.plat("hdm");
        const audsrc = app.svc.plat("audsrc");
        if(hdm !== "loc" || audsrc !== "Browser") {
            const divs = jt.byId("docdispdiv").getElementsByClassName("pconly");
            Array.from(divs).forEach(function (div) {
                div.style.display = "none"; }); }
    },


    displayDoc: function (divid, docurl) {  //full url or doc filename
        if(!docurl) {
            return jt.out(divid, ""); }
        jt.out(divid, "Loading " + docurl + "...");
        app.svc.docContent(docurl, function (body) {
            if(!body) { body = docurl + " unavailable"; }
            if(body.indexOf("<body>") >= 0 && body.indexOf("</body>") >= 0) {
                body = body.slice(body.indexOf("<body>") + 6,
                                  body.indexOf("</body>")); }
            const mbp = "| MANUAL | TERMS | PRIVACY | SUPPORT |";
            body = jt.tac2html(["div", {id:"docmenubardiv"}, mbp]) + body;
            body = app.subPlaceholders(divid, app.svc.urlOpenSupp(), body);
            jt.out(divid, jt.tac2html(
                ["div", {id:"docdispdiv"},
                 [["div", {id:"docdispxdiv"},
                   ["a", {href:"#close",
                          onclick:jt.fs("app.displayDoc('" + divid + "')")},
                    "X"]],
                  ["div", {id:"docdispbodydiv"}, body]]]));
            app.docDynamicContent(); });
    },


    //copy field values from srcSong into destSong. Argument order similar
    //to Object.assign
    copyUpdatedSongData: function (destSong, srcSong) {
        const songfields = ["dsType", "batchconv", "aid", "ti", "ar", "ab",
                            "el", "al", "kws", "rv", "fq", "lp", "nt",
                            "dsId", "modified", "locmod"];
        songfields.forEach(function (fld) {
            if(srcSong.hasOwnProperty(fld)) {  //don't copy undefined values
                destSong[fld] = srcSong[fld]; } });
    },


    //!UNPACKED BY appdat.py unescape_song_fields
    //Even a serialized song can run afoul of web security rules due to
    //paths, titles or other fields containing parenthetical expressions or
    //other triggering patterns.  For UPLOAD, remove any problematic temp
    //fields and escape whatever triggers security blocks.
    txSong: function (song) {
        var delflds = ["mrd", "smti", "smar", "smab", "locmod"];
        //THIS MUST MATCH appdat.py unescape_song_fields
        var escflds = ["path", "ti", "ar", "ab", "nt"];
        //Web Security Reserved Words that must be escaped to be let through
        var wsrw = ["having", "select", "union", "within"];
        song = JSON.parse(JSON.stringify(song));
        delflds.forEach(function (fld) { delete song[fld]; });
        escflds.forEach(function (fld) {  //replace parens with HTML chars
            if(song[fld]) {
                song[fld] = song[fld].replace(/\(/g, "ESCOPENPAREN");
                song[fld] = song[fld].replace(/\)/g, "ESCCLOSEPAREN");
                song[fld] = song[fld].replace(/'/g, "ESCSINGLEQUOTE");
                song[fld] = song[fld].replace(/&/g, "ESCAMPERSAND");
                wsrw.forEach(function (rw) {
                    song[fld] = song[fld].replace(
                        new RegExp(rw, "gi"), function (match) {
                            const rev = match.split("").reverse().join("");
                            return "WSRW" + rev; }); });
            } });
        return song;
    },


    //Demo data handler for simulator screenshots
    scr: (function () {
        var active = false;  //true if stubbed returns demo data
        const dummyStatus = {state:"paused", pos:12*1000, dur:210*1000,
                             path:"SongU.mp3"};  //oldest
        const kwdefs = {Social: {pos: 1, sc: 0, ig: 0, dsc: ""},
                        Personal: {pos: 0, sc: 0, ig: 0, dsc: ""},
                        Office: {pos: 4, sc: 0, ig: 0, dsc: ""},
                        Dance: {pos: 2, sc: 0, ig: 0, dsc: ""},
                        Ambient: {pos: 3, sc: 0, ig: 0, dsc: ""},
                        Jazz: {pos: 0, sc: 0, ig: 0, dsc: ""},
                        Classical: {pos: 0, sc: 0, ig: 0, dsc: ""},
                        Talk: {pos: 0, sc: 0, ig: 0, dsc: ""},
                        Solstice: {pos: 0, sc: 0, ig: 0, dsc: ""}};
        const settings = {
            "ctrls": [{"tp": "range", "c": "al", "x": 27, "y": 62},
                      {"tp": "range", "c": "el", "x": 49, "y": 47},
                      {"tp": "kwbt", "k": "Social", "v": "pos"},
                      {"tp": "kwbt", "k": "Dance", "v": "off"},
                      {"tp": "kwbt", "k": "Ambient", "v": "neg"},
                      {"tp": "kwbt", "k": "Office", "v": "pos"},
                      {"tp": "minrat", "u": 0, "m": 5},
                      {"tp": "fqb", "v": "on"}],
            "waitcodedays": {"B": 90, "Z": 180, "O": 365}};
        const dfltacct = {
            "dsType": "DigAcc", "dsId": "101", "firstname": "Digger",
            "created": "2019-10-11T00:00:00Z",
            "modified": "2019-10-11T00:00:00Z;1",
            "email": "support@diggerhub.com", "token": "none",
            "hubdat": "",
            "kwdefs": kwdefs,
            "igfolds": ["Ableton","Audiffex","Audio Music Apps"],
            "settings": settings,
            "musfs": ""};
        const demoacct = {
            "dsType": "DigAcc", "dsId": "1234",
            "created": "2021-01-26T17:21:11Z",
            "modified": "2023-02-13T22:58:45Z;13139", "batchconv": "",
            "email": "demo@diggerhub.com", "token": "faketokentoshowsignedin",
            "hubdat": "{\"privaccept\": \"2022-06-11T14:11:14.284Z\"}",
            "status": "Active", "firstname": "Demo", "digname": "Demo",
            "kwdefs": kwdefs,
            "igfolds": ["Ableton","Audiffex","Audio Music Apps"],
            "settings": settings,
            "musfs": [
                {"dsId": "1235", "digname": "afriend", "firstname": "A Friend",
                 "added": "2022-06-10T21:30:21Z",
                 "lastpull": "2023-02-13T00:38:48Z",
                 "lastheard": "2022-11-06T18:42:48Z",
                 "common": 7086, "dfltrcv": 57, "dfltsnd": 5294},
                {"dsId": "1236", "digname": "bfriend", "firstname": "B Friend",
                 "added": "2022-07-10T21:30:21Z",
                 "lastpull": "2023-02-20T00:38:48Z",
                 "lastheard": "2023-02-15T18:42:48Z",
                 "common": 556, "dfltrcv": 87, "dfltsnd": 5},
                {"dsId": "1237", "digname": "cfriend", "firstname": "C Friend",
                 "added": "2022-07-10T21:30:21Z",
                 "lastpull": "2023-02-20T00:38:48Z",
                 "lastheard": "2023-01-03T18:42:48Z",
                 "common": 556, "dfltrcv": 87, "dfltsnd": 42},
                {"dsId": "1238", "digname": "fabDJ", "firstname": "Fab DJ",
                 "added": "2022-08-10T21:30:21Z",
                 "lastpull": "2022-08-10T21:30:48Z",
                 "lastheard": "2023-02-14T18:42:48Z",
                 "common": 8645, "dfltrcv": 986, "dfltsnd": 0}]};
        const rets = {
            readConfig:{"acctsinfo": {currid:"1234",
                                      accts:[dfltacct, demoacct]}},
            readDigDat:{"version": "v1.1.7",  //last screenshot update version
                        "scanned": "2023-02-13T20:42:12.320Z",  //see modified
                        "songcount": 10,
                        "songs": {
                            "SongY.mp3": {"fq": "N","al": 40,"el": 70,"kws": "Office,Social","rv": 8,"path": "SongY.mp3","mrd": "C|Song Y|Artist Y|Album Y","ar": "Artist Y","ab": "Album Y","ti": "Song Y","lp":"2023-02-13T20:42:12.074Z","dsId":"fakedbid","modified":"2023-02-16T00:00:00.000Z"},
                            "SongX.mp3": {"fq": "N","al": 40,"el": 70,"kws": "Office,Social","rv": 8,"path": "SongX.mp3","mrd": "C|Song X|Artist X|Album X","ar": "Artist X","ab": "Album X","ti": "Song X","lp":"2023-02-13T20:42:12.074Z","dsId":"fakedbid","modified":"2023-02-16T00:00:00.000Z"},
                            "SongW.mp3": {"fq": "P","al": 40,"el": 70,"kws": "Office,Social","rv": 8,"path": "SongW.mp3","mrd": "C|Song W|Artist W|Album W","ar": "Artist W","ab": "Album W","ti": "Song W","lp":"2023-02-13T20:42:12.074Z","dsId":"fakedbid","modified":"2023-02-16T00:00:00.000Z"},
                            "SongV.mp3": {"fq": "N","al": 40,"el": 70,"kws": "Office,Social","rv": 8,"path": "SongV.mp3","mrd": "C|Song V|Artist V|Album V","ar": "Artist V","ab": "Album V","ti": "Song V","lp":"2023-02-13T20:42:12.074Z","dsId":"fakedbid","modified":"2023-02-16T00:00:00.000Z"},
                            "SongU.mp3": {"fq": "P","al": 40,"el": 70,"kws": "Office,Social","rv": 8,"path": "SongU.mp3","mrd": "C|Song U|Artist U|Album U","ar": "Artist U","ab": "Album U","ti": "Song U","lp":"","dsId":"fakedbid","modified":"2023-02-16T00:00:00.000Z"},
                            "SongT.mp3": {"fq": "N","al": 40,"el": 70,"kws": "Office,Social","rv": 8,"path": "SongT.mp3","mrd": "C|Song T|Artist T|Album T","ar": "Artist T","ab": "Album T","ti": "Song T","lp":"2023-02-13T20:42:12.074Z","dsId":"fakedbid","modified":"2023-02-16T00:00:00.000Z"},
                            "SongS.mp3": {"fq": "N","al": 40,"el": 70,"kws": "Office,Social","rv": 8,"path": "SongS.mp3","mrd": "C|Song S|Artist S|Album S","ar": "Artist S","ab": "Album S","ti": "Song S","lp":"2023-02-13T20:42:12.074Z","dsId":"fakedbid","modified":"2023-02-16T00:00:00.000Z"},
                            "SongR.mp3": {"fq": "N","al": 40,"el": 70,"kws": "Office,Social","rv": 8,"path": "SongR.mp3","mrd": "C|Song R|Artist R|Album R","ar": "Artist R","ab": "Album R","ti": "Song R","lp":"2023-02-13T20:42:12.074Z","dsId":"fakedbid","modified":"2023-02-16T00:00:00.000Z"},
                            "SongQ.mp3": {"fq": "N","al": 40,"el": 70,"kws": "Office,Social","rv": 8,"path": "SongQ.mp3","mrd": "C|Song Q|Artist Q|Album Q","ar": "Artist Q","ab": "Album Q","ti": "Song Q","lp":"2023-02-13T20:42:12.074Z","dsId":"fakedbid","modified":"2023-02-16T00:00:00.000Z"},
                            "SongP.mp3": {"fq": "N","al": 40,"el": 70,"kws": "Office,Social","rv": 8,"path": "SongP.mp3","mrd": "C|Song P|Artist P|Album P","ar": "Artist P","ab": "Album P","ti": "Song P","lp":"2023-02-13T20:42:12.074Z","dsId":"fakedbid","modified":"2023-02-16T00:00:00.000Z"}},
                        "scanstart": "2023-02-13T20:42:12.274Z"},
            requestMediaRead:[{"path": "SongY.mp3","artist": "Artist Y","album": "Album Y","title": "Song Y", "lp":"2023-02-13T20:42:12.074Z"},
                              {"path": "SongX.mp3","artist": "Artist X","album": "Album X","title": "Song X", "lp":"2023-02-13T20:42:12.074Z"},
                              {"path": "SongW.mp3","artist": "Artist W","album": "Album W","title": "Song W", "lp":"2023-02-13T20:42:12.074Z"},
                              {"path": "SongV.mp3","artist": "Artist V","album": "Album V","title": "Song V", "lp":"2023-02-13T20:42:12.074Z"},
                              {"path": "SongU.mp3","artist": "Artist U","album": "Album U","title": "Song U", "lp":""},
                              {"path": "SongT.mp3","artist": "Artist T","album": "Album T","title": "Song T", "lp":"2023-02-13T20:42:12.074Z"},
                              {"path": "SongS.mp3","artist": "Artist S","album": "Album S","title": "Song S", "lp":"2023-02-13T20:42:12.074Z"},
                              {"path": "SongR.mp3","artist": "Artist R","album": "Album R","title": "Song R", "lp":"2023-02-13T20:42:12.074Z"},
                              {"path": "SongQ.mp3","artist": "Artist Q","album": "Album Q","title": "Song Q", "lp":"2023-02-13T20:42:12.074Z"},
                              {"path": "SongP.mp3","artist": "Artist P","album": "Album P","title": "Song P", "lp":"2023-02-13T20:42:12.074Z"}],
            "statusSync":dummyStatus,
            "pausePlayback":dummyStatus,
            "resumePlayback":dummyStatus,
            "seekToOffset":dummyStatus,
            "startPlayback":dummyStatus,
            "hubAcctCallacctok":[demoacct, "abcdef12345678"],
            "hubAcctCallmessages":[
                //bfriend thanks for sharing Song P
                {sndr:"1236", rcvr:"1234", msgtype:"shresp",
                 created:"2023-01-03T20:42:12.074Z", status:"open",
                 srcmsg:"fake", songid:"fake",
                 ti:"Song P", ar:"Artist P", ab:"Album P"},
                //afriend great Song G - Awesome bassline
                {sndr:"1235", rcvr:"1234", msgtype:"share",
                 created:"2023-01-04T20:42:12.074Z", status:"open",
                 srcmsg:"", songid:"fake",
                 ti:"Song G", ar:"Artist G", ab:"Album G",
                 nt:"Awesome bassline"},
                //fabDJ recommends Song J
                {sndr:"1238", rcvr:"1234", msgtype:"recommendation",
                 created:"2023-01-05T20:42:12.074Z", status:"open",
                 srcmsg:"", songid:"fake",
                 ti:"Song J", ar:"Artist J", ab:"Album J",
                 nt:"Super sticky original groove"},
                //cfriend thanks for recommending Song X
                {sndr:"1237", rcvr:"1234", msgtype:"recresp",
                 created:"2023-01-06T20:42:12.074Z", status:"open",
                 srcmsg:"fake", songid:"fake",
                 ti:"Song X", ar:"Artist X", ab:"Album X"},
                //afriend Song S - Melody gets stuck in my head every time.
                {sndr:"1235", rcvr:"1234", msgtype:"share",
                 created:"2023-01-07T20:42:12.074Z", status:"open",
                 srcmsg:"", songid:"fake",
                 ti:"Song S", ar:"Artist S", ab:"Album S",
                 nt:"Melody gets stuck in my head every time."}],
            "hubsync":[demoacct]};
    return {
        stubbed: function (callname, ignore /*param*/, callback/*, errf*/) {
            if(active && rets[callname]) {
                jt.log("STUBBED " + callname + " using demo data");
                callback(rets[callname]);
                return true; }
            return false; }
    };  //end scr returned functions
    }())


};  //end returned functions
}());
